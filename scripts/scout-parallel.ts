/* Parallel-scout COORDINATOR (parallelization v1, SYNC 2026-06-04 "Parallelization approved").
 * Run: pnpm tsx scripts/scout-parallel.ts [k] [tiles] [maxMs] [nWorkers]
 *   e.g. pnpm tsx scripts/scout-parallel.ts 3 3,4,6,12 60000
 *
 * Spawns one worker process per core; hands out seed indices over a DYNAMIC work queue (guard #3 —
 * not static shards, so the 3⁶-family skew can't starve a shard). Collects each worker's serialized
 * exact cells, then runs the IDENTICAL final reduce as the serial probe — dedupeByCongruence with the
 * canonicalKey representative + the same DJB2 digest (guard #1: digest over the canonically sorted set
 * with the canonical merge-representative, so it is byte-identical to the serial run regardless of the
 * order results arrive). Per-result cells are also appended to /tmp/scout-k<k>.ndjson (crash artifact).
 *
 * ⚑ Guard #2: pass maxMs=0 (default) for a CERTIFIED run (no wall-clock cap → finite torus fill runs to
 * completion, deterministic). A nonzero cap reproduces the serial scout's capped lower bound for a
 * speed comparison, but then the k≥3 result is a capped lower bound (k=1/k=2 never time out either way).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import fs from 'node:fs';
import os from 'node:os';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { PolygonType, type GeneratorParameters } from '@/classes';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import { dedupeByCongruence } from '@/classes/algorithm/TilingCongruence';
import type { PeriodCell, PeriodSolverDiag } from '@/classes/algorithm/PeriodSolver';
import { deserializeCell, readResumeNdjson, type SerializedCell } from './scoutCodec';
import { emitterFromEnv } from './emitter';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';

const k = parseInt(process.argv[2] ?? '1', 10);
const tiles = process.argv[3] ?? '3,4,6,8,12';
const maxMs = process.argv[4] ? parseInt(process.argv[4], 10) : 0; // 0 = no cap (certified)
const W = process.argv[5] ? parseInt(process.argv[5], 10) : Math.max(1, Math.min(8, os.cpus().length - 2));
const fresh = process.argv.includes('fresh'); // ignore any prior resume file

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns: tiles.split(',').map(Number) } };
const baseRing = computeRing(params);
const ring = baseRing.N === 24 ? baseRing : CyclotomicRing.create(24);
setActiveRing(ring);
const extractor = new TranslationalCellExtractor();

// Fire-and-forget mirror to Supabase (docs/FRONTEND_LAB_PLAN.md §0/§3). OFF unless EMIT=1; the §0
// acceptance is byte-identical digests with it on vs off. canonicalKeyOf is the SAME key the final
// reduce uses, so found_tilings mirrors the per-seed cells faithfully (deferred into the queue task,
// so a throw can never reach this coordinator). NEVER awaited except at finish() — it cannot affect
// `collected`/`reps`/the digest.
const runId = randomUUID();
let commit = '';
try { commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { /* best-effort */ }
// Float render-ready cell (TranslationalCellData) for the M2 gallery — the exact cell deserialized to
// floats so the browser renders via the existing TilingThumbnail without bundling Cyclotomic.
function cellToRenderData(cell: PeriodCell): { cellPolygons: { n: number; vertices: number[][] }[]; basis: number[][] } {
	const u = cell.basisExact[0].toVector();
	const v = cell.basisExact[1].toVector();
	return {
		cellPolygons: cell.cellPolygons.map((p) => ({ n: p.n, vertices: p.vertices.map((vec) => [vec.x, vec.y]) })),
		basis: [[u.x, u.y], [v.x, v.y]],
	};
}
const emit = emitterFromEnv({
	canonicalKeyOf: (sc) => extractor.canonicalKey(deserializeCell(ring, sc as SerializedCell).cellPolygons),
	renderCellOf: (sc) => cellToRenderData(deserializeCell(ring, sc as SerializedCell)),
});

type Result = { type: 'result'; idx: number; name: string; cells: SerializedCell[]; timedOut: boolean; ms: number; diag?: PeriodSolverDiag };
type Worker = { proc: ChildProcess; inFlight: number | null; alive: boolean; id: number };

const t0 = Date.now();
const collected: SerializedCell[] = [];

// Crash-resume: a PERSISTENT NDJSON (in-repo, not /tmp — survives reboot), keyed by (k, tiles, cap) so
// only a matching prior run resumes. On startup we read the finished seeds + their cells; new results are
// APPENDED. So a shutdown loses at most the seeds in flight. `fresh` ignores any existing file.
const RESUME_DIR = '.scout-cache';
const resumePath = `${RESUME_DIR}/k${k}_${tiles.replace(/,/g, '.')}_cap${maxMs}.ndjson`;
fs.mkdirSync(RESUME_DIR, { recursive: true });
if (fresh) { try { fs.rmSync(resumePath); } catch { /* none */ } }
const doneSet = new Set<number>();
{
	const r = readResumeNdjson(resumePath);
	for (const i of r.done) doneSet.add(i);
	for (const c of r.cells) collected.push(c);
	if (doneSet.size > 0) console.error(`[coord] RESUMING from ${resumePath}: ${doneSet.size} seeds already done (pass 'fresh' for a clean run)`);
}
const ndjson = fs.createWriteStream(resumePath, { flags: 'a' }); // append — keep prior results
let total = -1, nextIdx = 0, timeouts = 0, finished = false;
const pending: number[] = []; // indices re-queued after a worker died mid-flight
const workers: Worker[] = [];

function nextAssignment(): number | 'stop' {
	if (pending.length) return pending.pop()!;
	while (total >= 0 && nextIdx < total && doneSet.has(nextIdx)) nextIdx++; // skip already-done (resumed)
	if (total >= 0 && nextIdx < total) return nextIdx++;
	return 'stop';
}
function assign(w: Worker): void {
	if (!w.alive || finished) return;
	const a = nextAssignment();
	if (a === 'stop') { w.inFlight = null; w.proc.stdin!.write(JSON.stringify({ stop: true }) + '\n'); return; }
	w.inFlight = a;
	emit.seedClaimed(a, w.id);
	w.proc.stdin!.write(JSON.stringify({ idx: a }) + '\n');
}
function onReady(w: Worker, nSeeds: number): void {
	if (total < 0) {
		total = nSeeds;
		console.error(`[coord] total=${total} seeds, resumed=${doneSet.size}, workers=${W}, cap=${maxMs}ms (${maxMs === 0 ? 'no cap / certified' : 'capped'})`);
		emit.runStarted({ runId, k, family: tiles, params: { maxMs, workers: W, mode: maxMs === 0 ? 'certified' : 'capped', resumed: doneSet.size, total: nSeeds }, commit });
	}
	if (doneSet.size >= total) { void finish(); return; } // already fully done from the resume file
	assign(w);
}
function onResult(w: Worker, r: Result): void {
	w.inFlight = null;
	for (const c of r.cells) collected.push(c);
	ndjson.write(JSON.stringify({ idx: r.idx, cells: r.cells }) + '\n');
	doneSet.add(r.idx); if (r.timedOut) timeouts++;
	emit.seedCompleted({ idx: r.idx, name: r.name, cells: r.cells, timedOut: r.timedOut, ms: r.ms, workerId: w.id, diag: r.diag });
	if (r.ms > 3000 || r.timedOut || r.cells.length > 0)
		console.error(`  [${r.idx}] ${r.name.padEnd(30)} cells=${r.cells.length} ${r.ms}ms${r.timedOut ? ' TIMEOUT' : ''}  (${doneSet.size}/${total})`);
	if (doneSet.size === total) { void finish(); return; }
	assign(w);
}
async function finish(): Promise<void> {
	if (finished) return;
	finished = true;
	for (const w of workers) if (w.alive) w.proc.stdin!.write(JSON.stringify({ stop: true }) + '\n');
	ndjson.end();
	// --- identical final reduce to the serial probe (guard #1) ---
	const cells: PeriodCell[] = collected.map((sc) => deserializeCell(ring, sc));
	const reps = dedupeByCongruence(cells, (c) => extractor.canonicalKey(c.cellPolygons));
	const ids = reps.map((c) => extractor.canonicalKey(c.cellPolygons)).sort();
	let h = 5381n;
	for (const ch of ids.join('|')) h = ((h * 33n) ^ BigInt(ch.codePointAt(0)!)) & 0xffffffffffffffffn;
	const secs = (Date.now() - t0) / 1000;
	console.log(`\nPARALLEL k=${k}: ${reps.length} distinct tilings (from ${cells.length} raw cells), ${timeouts} seeds timed out, ${secs.toFixed(1)}s total, ${W} workers`);
	console.log(`COMPOSITION digest=${h.toString(16)} count=${reps.length}`);
	// Emitter runs AFTER the digest is computed + printed, so it cannot affect the claim. flush() drains
	// the background queue before exit; it never rejects.
	emit.runFinished({ count: reps.length, digest: h.toString(16), timeouts, incomplete: timeouts > 0 });
	await emit.flush();
	setTimeout(() => { for (const w of workers) { try { w.proc.kill(); } catch { /* */ } } process.exit(0); }, 200);
}

const tsxBin = 'node_modules/.bin/tsx';
for (let i = 0; i < W; i++) {
	const proc = spawn(tsxBin, ['scripts/scout-worker.ts', String(k), tiles, String(maxMs)], {
		cwd: process.cwd(),
		stdio: ['pipe', 'pipe', 'inherit'],
	});
	const w: Worker = { proc, inFlight: null, alive: true, id: i };
	workers.push(w);
	const rl = readline.createInterface({ input: proc.stdout! });
	rl.on('line', (line) => {
		const s = line.trim();
		if (!s) return;
		let m: { type?: string; nSeeds?: number };
		try { m = JSON.parse(s); } catch { console.error(`[coord] non-JSON from worker: ${s.slice(0, 120)}`); return; }
		if (m.type === 'ready') onReady(w, m.nSeeds!);
		else if (m.type === 'result') onResult(w, m as unknown as Result);
	});
	proc.on('exit', () => {
		w.alive = false;
		if (!finished && w.inFlight !== null) { pending.push(w.inFlight); console.error(`[coord] worker died with idx ${w.inFlight} in flight → re-queued`); w.inFlight = null; }
		if (!finished && workers.every((x) => !x.alive)) { console.error('[coord] all workers dead before completion — aborting'); ndjson.end(); process.exit(1); }
	});
}
