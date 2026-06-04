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
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';
import { deserializeCell, type SerializedCell } from './scoutCodec';

const k = parseInt(process.argv[2] ?? '1', 10);
const tiles = process.argv[3] ?? '3,4,6,8,12';
const maxMs = process.argv[4] ? parseInt(process.argv[4], 10) : 0; // 0 = no cap (certified)
const W = process.argv[5] ? parseInt(process.argv[5], 10) : Math.max(1, Math.min(8, os.cpus().length - 2));

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns: tiles.split(',').map(Number) } };
const baseRing = computeRing(params);
const ring = baseRing.N === 24 ? baseRing : CyclotomicRing.create(24);
setActiveRing(ring);
const extractor = new TranslationalCellExtractor();

type Result = { type: 'result'; idx: number; name: string; cells: SerializedCell[]; timedOut: boolean; ms: number };
type Worker = { proc: ChildProcess; inFlight: number | null; alive: boolean };

const t0 = Date.now();
const collected: SerializedCell[] = [];
const ndjson = fs.createWriteStream(`/tmp/scout-k${k}.ndjson`);
let total = -1, nextIdx = 0, done = 0, timeouts = 0, finished = false;
const pending: number[] = []; // indices re-queued after a worker died mid-flight
const workers: Worker[] = [];

function nextAssignment(): number | 'stop' {
	if (pending.length) return pending.pop()!;
	if (total >= 0 && nextIdx < total) return nextIdx++;
	return 'stop';
}
function assign(w: Worker): void {
	if (!w.alive || finished) return;
	const a = nextAssignment();
	if (a === 'stop') { w.inFlight = null; w.proc.stdin!.write(JSON.stringify({ stop: true }) + '\n'); return; }
	w.inFlight = a;
	w.proc.stdin!.write(JSON.stringify({ idx: a }) + '\n');
}
function onReady(w: Worker, nSeeds: number): void {
	if (total < 0) { total = nSeeds; console.error(`[coord] total=${total} seeds, workers=${W}, cap=${maxMs}ms (${maxMs === 0 ? 'no cap / certified' : 'capped'})`); }
	assign(w);
}
function onResult(w: Worker, r: Result): void {
	w.inFlight = null;
	for (const c of r.cells) collected.push(c);
	ndjson.write(JSON.stringify({ idx: r.idx, cells: r.cells }) + '\n');
	done++; if (r.timedOut) timeouts++;
	if (r.ms > 3000 || r.timedOut || r.cells.length > 0)
		console.error(`  [${r.idx}] ${r.name.padEnd(30)} cells=${r.cells.length} ${r.ms}ms${r.timedOut ? ' TIMEOUT' : ''}  (${done}/${total})`);
	if (done === total) { finish(); return; }
	assign(w);
}
function finish(): void {
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
	setTimeout(() => { for (const w of workers) { try { w.proc.kill(); } catch { /* */ } } process.exit(0); }, 200);
}

const tsxBin = 'node_modules/.bin/tsx';
for (let i = 0; i < W; i++) {
	const proc = spawn(tsxBin, ['scripts/scout-worker.ts', String(k), tiles, String(maxMs)], {
		cwd: process.cwd(),
		stdio: ['pipe', 'pipe', 'inherit'],
	});
	const w: Worker = { proc, inFlight: null, alive: true };
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
