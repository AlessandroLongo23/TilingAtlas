/* Parallel per-tiling verification: orbifold mode reproduces torus mode EXACTLY (by congruence).
 * Spawns workers that solve each seed in BOTH modes; the coordinator merges the two cell sets by
 * congruence and asserts |torus| == |orbifold| == |torus ∪ orbifold|. This is the definitive
 * "match WHICH tilings, not just how many" acceptance for the equivariant fill.
 *
 *   Run: pnpm tsx scripts/verify-orbifold.ts [k] [tiles] [maxMs] [nWorkers]
 *   e.g. pnpm tsx scripts/verify-orbifold.ts 2 3,4,6,8,12 0     (no cap = certified-grade)
 */
import { spawn, type ChildProcess } from 'node:child_process';
import readline from 'node:readline';
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
const maxMs = process.argv[4] ? parseInt(process.argv[4], 10) : 0;
const W = process.argv[5] ? parseInt(process.argv[5], 10) : Math.max(1, Math.min(8, os.cpus().length - 2));

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns: tiles.split(',').map(Number) } };
const baseRing = computeRing(params);
const ring = baseRing.N === 24 ? baseRing : CyclotomicRing.create(24);
setActiveRing(ring);
const extractor = new TranslationalCellExtractor();
const keyOf = (c: PeriodCell) => extractor.canonicalKey(c.cellPolygons);

type Result = {
	type: 'result'; idx: number; name: string; torus: SerializedCell[]; orb: SerializedCell[];
	torusTO: boolean; orbTO: boolean; consViol: boolean; biViol: boolean; tms: number; oms: number;
};
type Worker = { proc: ChildProcess; inFlight: number | null; alive: boolean };

const t0 = Date.now();
const torusCells: SerializedCell[] = [];
const orbCells: SerializedCell[] = [];
let total = -1, nextIdx = 0, done = 0, finished = false;
let torusTOs = 0, orbTOs = 0, consViols = 0, biViols = 0;
const workers: Worker[] = [];

function assign(w: Worker): void {
	if (!w.alive || finished) return;
	if (total >= 0 && nextIdx < total) { w.inFlight = nextIdx; w.proc.stdin!.write(JSON.stringify({ idx: nextIdx++ }) + '\n'); }
	else { w.inFlight = null; w.proc.stdin!.write(JSON.stringify({ stop: true }) + '\n'); }
}
function onResult(w: Worker, r: Result): void {
	w.inFlight = null;
	for (const c of r.torus) torusCells.push(c);
	for (const c of r.orb) orbCells.push(c);
	if (r.torusTO) torusTOs++;
	if (r.orbTO) orbTOs++;
	if (r.consViol) consViols++;
	if (r.biViol) biViols++;
	done++;
	if (r.orbTO || r.consViol || r.biViol || r.oms > 5000 || r.orb.length > 0)
		console.error(`  [${r.idx}] ${r.name.padEnd(28)} torus=${r.torus.length} orb=${r.orb.length} ${r.oms}ms${r.orbTO ? ' ORB-TIMEOUT' : ''}${r.consViol ? ' CONS!' : ''}${r.biViol ? ' BI!' : ''}  (${done}/${total})`);
	if (done === total) { finish(); return; }
	assign(w);
}
function finish(): void {
	if (finished) return;
	finished = true;
	for (const w of workers) if (w.alive) w.proc.stdin!.write(JSON.stringify({ stop: true }) + '\n');
	const tCells: PeriodCell[] = torusCells.map((sc) => deserializeCell(ring, sc));
	const oCells: PeriodCell[] = orbCells.map((sc) => deserializeCell(ring, sc));
	const tReps = dedupeByCongruence(tCells, keyOf);
	const oReps = dedupeByCongruence(oCells, keyOf);
	const uReps = dedupeByCongruence(tCells.concat(oCells), keyOf);
	const secs = (Date.now() - t0) / 1000;
	const onlyTorus = uReps.length - oReps.length; // tilings torus has that orbifold missed (if union > orbifold)
	console.log(`\n=== verify-orbifold k=${k} {${tiles}} maxMs=${maxMs} (${secs.toFixed(1)}s, ${W} workers) ===`);
	console.log(`torus:    ${tReps.length} tilings (congruence), timeouts=${torusTOs}`);
	console.log(`orbifold: ${oReps.length} tilings (congruence), timeouts=${orbTOs}, consViol seeds=${consViols}, biViol seeds=${biViols}`);
	console.log(`union(torus ∪ orbifold): ${uReps.length}`);
	const match = tReps.length === oReps.length && uReps.length === tReps.length;
	console.log(match
		? `✅ MATCH — orbifold reproduces torus EXACTLY (per-tiling), ${tReps.length} tilings`
		: `❌ MISMATCH — torus=${tReps.length} orbifold=${oReps.length} union=${uReps.length} (orbifold missed ${onlyTorus}, extras ${oReps.length - (uReps.length - (uReps.length - tReps.length))})`);
	if (orbTOs > 0) console.log(`⚠ ${orbTOs} orbifold seed(s) hit the wall cap — re-run with maxMs=0 for a clean completeness claim`);
	if (consViols > 0 || biViols > 0) console.log(`⚠⚑ tripwire fired: conservation(${consViols}) / branch-invariant(${biViols}) — IMPLEMENTATION BUG`);
	setTimeout(() => { for (const w of workers) { try { w.proc.kill(); } catch { /* */ } } process.exit(match && orbTOs === 0 && consViols === 0 && biViols === 0 ? 0 : 1); }, 200);
}

const tsxBin = 'node_modules/.bin/tsx';
for (let i = 0; i < W; i++) {
	const proc = spawn(tsxBin, ['scripts/verify-worker.ts', String(k), tiles, String(maxMs)], { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'inherit'] });
	const w: Worker = { proc, inFlight: null, alive: true };
	workers.push(w);
	const rl = readline.createInterface({ input: proc.stdout! });
	rl.on('line', (line) => {
		const t = line.trim();
		if (!t) return;
		const msg = JSON.parse(t) as { type: 'ready'; nSeeds: number } | Result;
		if (msg.type === 'ready') { if (total < 0) { total = msg.nSeeds; console.error(`[coord] ${total} seeds, ${W} workers, cap=${maxMs}ms`); } assign(w); }
		else onResult(w, msg);
	});
	proc.on('exit', () => { w.alive = false; if (!finished && workers.every((x) => !x.alive)) { console.error('[coord] all workers dead'); process.exit(1); } });
}
