/* Seed forced-collapse lookahead scout (work order: experiments/seed-lookahead-workorder-2026-07-10.md).
 *
 * MEASUREMENT ONLY — no proven-path change. For every emitted seed, run bounded unit propagation
 * on the frontier: classify each open vertex by completion entropy (0 / 1 / ≥2, via the audited
 * SeedBuilder.enumerateVertexCompletions, max=2); collapse forced (entropy-1) vertices in a
 * canonical order; promote surrounded-with-allowed-VC vertices (zero-tile forced moves). A seed
 * is KILLED when a vertex has entropy 0 or a surrounded vertex emerges with a disallowed VC —
 * no plane tiling with exactly this VC set contains the patch, so the seed can never produce a
 * tiling. Everything is logged; nothing is fed back into the pipeline.
 *
 * Run: pnpm tsx scripts/seed-lookahead-scout.ts [k] [tiles] [budget] [maxSeedMs]
 *   e.g. pnpm tsx scripts/seed-lookahead-scout.ts 3 3,4,6,12 16 15000
 * Env:
 *   VERIFY_KILLED=1     after the sweep, run the real PeriodSolver.solve() on every killed seed
 *                       and assert it emits 0 cells (feasible k≤2; per-seed cap VERIFY_MAXMS,
 *                       default 120000 — a timeout is reported INCONCLUSIVE, never PASS).
 *   ARTIFACT=<path>     cross-check kills against a {idx, cells} resume NDJSON (e.g. the certified
 *                       .scout-cache/k3_3.4.6.12_cap0.ndjson): a killed seed with cells>0 in the
 *                       artifact is a SOUNDNESS FAILURE — reported loudly, exit 1.
 *
 * Outputs (synchronous, per CLAUDE.md experiments rule):
 *   experiments/results/seed-lookahead-k<k>-<date>.log   human-readable progress + ETA
 *   experiments/results/seed-lookahead-k<k>-<date>.csv   idx,name,verdict,reason,killDepth,...
 */
import fs from 'node:fs';
import { Vector } from '@/classes/Vector';
import { VertexConfiguration } from '@/classes/algorithm/VertexConfiguration';
import { SeedConfiguration } from '@/classes/algorithm/SeedConfiguration';
import { SeedBuilder } from '@/classes/algorithm/SeedBuilder';
import { PeriodSolver } from '@/classes/algorithm/PeriodSolver';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, getActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import type { Cyclotomic } from '@/classes/Cyclotomic';
import { isWithinTolerance, isWithinAngularTolerance } from '@/utils';
import { deserializeCell } from './scoutCodec';

const k = parseInt(process.argv[2] ?? '2', 10);
const tiles = process.argv[3] ?? (k >= 3 ? '3,4,6,12' : '3,4,6,8,12');
const budget = process.argv[4] ? parseInt(process.argv[4], 10) : 16;
const maxSeedMs = process.argv[5] ? parseInt(process.argv[5], 10) : 10000;
const verifyKilled = process.env.VERIFY_KILLED === '1';
const verifyMaxMs = process.env.VERIFY_MAXMS ? parseInt(process.env.VERIFY_MAXMS, 10) : 120000;
const artifactPath = process.env.ARTIFACT ?? '';
// Debug: ONLY_SEEDS="48,50" restricts the sweep; TRACE_SEEDS="48" logs every propagation step
// (frontier entropies, forced picks, patch polygons at kill time) for the listed indices.
const onlySeeds = process.env.ONLY_SEEDS ? new Set(process.env.ONLY_SEEDS.split(',').map(Number)) : null;
const traceSeeds = process.env.TRACE_SEEDS ? new Set(process.env.TRACE_SEEDS.split(',').map(Number)) : new Set<number>();

const date = new Date().toISOString().slice(0, 10);
// Trace/subset runs get their own files — never clobber a full sweep's artifacts.
const tag = process.env.ONLY_SEEDS || process.env.TRACE_SEEDS ? '-trace' : '';
const logPath = `experiments/results/seed-lookahead-k${k}-${date}${tag}.log`;
const csvPath = `experiments/results/seed-lookahead-k${k}-${date}${tag}.csv`;
fs.mkdirSync('experiments/results', { recursive: true });
const log = (line: string) => { fs.appendFileSync(logPath, line + '\n'); console.log(line); };
fs.writeFileSync(logPath, '');
fs.writeFileSync(csvPath, 'idx,name,verdict,reason,killDepth,collapses,promotions,frontier,ms\n');

// --- seed construction: IDENTICAL to scripts/scout-worker.ts / probe-pipeline.ts (same ordering
// --- ⇒ idx here means the same seed as in the resume artifacts).
const ns = tiles.split(',').map(Number);
const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns } };
const baseRing = computeRing(params);
setActiveRing(baseRing.N === 24 ? baseRing : CyclotomicRing.create(24));

log(`seed-lookahead scout  k=${k} tiles={${tiles}} budget=${budget} maxSeedMs=${maxSeedMs}`);
log(`building seeds (deterministic order, same as scout-worker/probe-pipeline)...`);
const tBuild = Date.now();
const pg = new PolygonsGenerator(params, []);
const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
const adj: Record<string, string[]> = {};
for (const vc of vcs) adj[vc.name] = [];
for (let i = 0; i < vcs.length; i++)
	for (let j = i + 1; j < vcs.length; j++)
		if (vcs[i].isCompatible(vcs[j])) { adj[vcs[i].name].push(vcs[j].name); adj[vcs[j].name].push(vcs[i].name); }
const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
const seedSets = new SeedSetExtractor(graph).findSeedSets(k);
const allSeeds = new SeedBuilder().buildSeeds(k, 1, { seedSetLoader: () => seedSets });
const useSeeds = k >= 2 ? allSeeds.filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2) : allSeeds;
log(`seeds: ${allSeeds.length} built (${useSeeds.length} used) in ${((Date.now() - tBuild) / 1000).toFixed(1)}s`);

// --- small pure name-match helpers (same semantics as SeedBuilder's private isVCNameInSet).
function vcNamesMatch(a: string[], b: string[]): boolean {
	const n = a.length;
	if (n !== b.length) return false;
	for (let i = 0; i < n; i++) {
		const rotated = a.slice(i).concat(a.slice(0, i));
		if (rotated.every((v, j) => v === b[j])) return true;
	}
	const reversed = a.slice().reverse();
	for (let i = 0; i < n; i++) {
		const rotated = reversed.slice(i).concat(reversed.slice(0, i));
		if (rotated.every((v, j) => v === b[j])) return true;
	}
	return false;
}
function nameInSet(emergingName: string, setNames: string[]): boolean {
	const emerging = emergingName.split(',');
	return setNames.some((s) => vcNamesMatch(emerging, s.split(',')));
}

type PlacedVC = { center: Vector; neighboringVertices: Vector[]; neighboringVerticesExact: Cyclotomic[] };
type Verdict = {
	verdict: 'killed' | 'survived';
	reason: 'entropy0' | 'surrounded-disallowed' | 'wall' | 'budget' | 'timecap';
	killDepth: number; // collapses applied when the kill was detected (-1 for survivors)
	collapses: number;
	promotions: number;
	frontier: number; // frontier size at stop
	ms: number;
};

const builder = new SeedBuilder(); // one instance: shared VC template cache across seeds

function lookahead(seed0: SeedConfiguration, budgetN: number, capMs: number, trace = false): Verdict {
	const t0 = Date.now();
	let seed = seed0;
	const setNames = [...new Set(seed0.vertexConfigurations.map((v) => v.name))];
	const placedVCs: PlacedVC[] = seed0.vertexConfigurations.map((vc) => {
		vc.computeNeighboringVertices();
		return {
			center: vc.sharedVertex.copy(),
			neighboringVertices: vc.neighboringVertices.map((v) => v.copy()),
			neighboringVerticesExact: vc.neighboringVerticesExact.slice(),
		};
	});
	let collapses = 0;
	let promotions = 0;
	let frontier = 0;

	for (;;) {
		if (Date.now() - t0 > capMs) return { verdict: 'survived', reason: 'timecap', killDepth: -1, collapses, promotions, frontier, ms: Date.now() - t0 };

		const avail = builder.computeAvailableVertices(placedVCs);
		frontier = avail.length;
		let promoted = false;
		let killedReason: Verdict['reason'] | null = null;
		const forced: { vertex: Vector; vertexExact: Cyclotomic; vc: VertexConfiguration }[] = [];

		for (const entry of avail) {
			const polysAt = seed.polygons.filter((p) => p.vertices.some((v) => isWithinTolerance(v, entry.vertex)));
			const angleSum = polysAt.reduce((s, p) => s + p.getAngleAtVertex(entry.vertex), 0);

			if (isWithinAngularTolerance(angleSum, 2 * Math.PI)) {
				// Surrounded: the emerging VC must be in the set (mirror/rotation aware). Order the
				// incident polygons by centroid heading FIRST — the NOTES §29 lesson (unordered
				// naming silently mis-rejects). Allowed ⇒ promote to a placed VC (a zero-tile
				// forced move: advances the frontier past it).
				const ordered = polysAt
					.slice()
					.sort((a, b) => Vector.sub(a.centroid, entry.vertex).heading() - Vector.sub(b.centroid, entry.vertex).heading());
				const evc = new VertexConfiguration(ordered);
				if (trace) log(`    TRACE surrounded v=(${entry.vertex.x.toFixed(3)},${entry.vertex.y.toFixed(3)}) emerging=${evc.getName()} allowed=${nameInSet(evc.getName(), setNames)}`);
				if (!nameInSet(evc.getName(), setNames)) { killedReason = 'surrounded-disallowed'; break; }
				evc.computeNeighboringVertices();
				placedVCs.push({
					center: entry.vertex.copy(),
					neighboringVertices: evc.neighboringVertices.map((v) => v.copy()),
					neighboringVerticesExact: evc.neighboringVerticesExact.slice(),
				});
				promotions++;
				promoted = true;
				break; // frontier changed — reclassify from scratch
			}

			// Open vertex: entropy = number of distinct completions, capped at 2 (0/1/≥2 is all we need).
			const comps = builder.enumerateVertexCompletions(entry.vertex, entry.vertexExact, entry.directions, seed, setNames, trace ? 10 : 2);
			if (trace) {
				const inc = polysAt.map((p) => p.n).sort((a, b) => a - b).join(',');
				log(`    TRACE open v=(${entry.vertex.x.toFixed(3)},${entry.vertex.y.toFixed(3)}) dirs=${entry.directions.length} incident=[${inc}] angleSum=${((angleSum * 180) / Math.PI).toFixed(1)}° entropy=${comps.length}${comps.length ? ' → ' + comps.map((c) => `${c.vc.name}(+${c.addedPolygons.length})`).join(' | ') : ''}`);
			}
			if (comps.length === 0) { killedReason = 'entropy0'; break; }
			if (comps.length === 1) forced.push({ vertex: entry.vertex, vertexExact: entry.vertexExact, vc: comps[0].vc });
		}

		if (trace && killedReason) {
			log(`    TRACE KILL (${killedReason}) — patch at kill time (${seed.polygons.length} polygons):`);
			for (const p of seed.polygons) log(`      ${p.n}-gon @ (${p.centroid.x.toFixed(3)},${p.centroid.y.toFixed(3)})`);
		}

		if (killedReason) return { verdict: 'killed', reason: killedReason, killDepth: collapses, collapses, promotions, frontier, ms: Date.now() - t0 };
		if (promoted) continue;
		if (forced.length === 0) return { verdict: 'survived', reason: 'wall', killDepth: -1, collapses, promotions, frontier, ms: Date.now() - t0 };
		if (collapses >= budgetN) return { verdict: 'survived', reason: 'budget', killDepth: -1, collapses, promotions, frontier, ms: Date.now() - t0 };

		// Canonical forced move: nearest-origin first, exact-key tiebreak — deterministic trajectory.
		forced.sort((a, b) => {
			const da = a.vertex.x * a.vertex.x + a.vertex.y * a.vertex.y;
			const db = b.vertex.x * b.vertex.x + b.vertex.y * b.vertex.y;
			if (Math.abs(da - db) > 1e-9) return da - db;
			return a.vertexExact.key() < b.vertexExact.key() ? -1 : 1;
		});
		const f = forced[0];
		if (trace) log(`    TRACE collapse #${collapses + 1}: v=(${f.vertex.x.toFixed(3)},${f.vertex.y.toFixed(3)}) ⇒ ${f.vc.name}`);
		f.vc.computeNeighboringVertices();
		seed = new SeedConfiguration([...seed.vertexConfigurations, f.vc]);
		placedVCs.push({
			center: f.vertex.copy(),
			neighboringVertices: f.vc.neighboringVertices.map((v) => v.copy()),
			neighboringVerticesExact: f.vc.neighboringVerticesExact.slice(),
		});
		collapses++;
	}
}

// --- sweep
const t0 = Date.now();
const verdicts: (Verdict & { idx: number; name: string })[] = [];
for (let i = 0; i < useSeeds.length; i++) {
	if (onlySeeds && !onlySeeds.has(i)) continue;
	const s = useSeeds[i];
	if (traceSeeds.has(i)) log(`  TRACE seed [${i}] ${s.name} — ${s.polygons.length} polygons`);
	const v = lookahead(s, budget, maxSeedMs, traceSeeds.has(i));
	verdicts.push({ ...v, idx: i, name: s.name });
	fs.appendFileSync(csvPath, `${i},"${s.name}",${v.verdict},${v.reason},${v.killDepth},${v.collapses},${v.promotions},${v.frontier},${v.ms}\n`);
	const done = i + 1;
	const eta = ((Date.now() - t0) / done) * (useSeeds.length - done) / 1000;
	const mark = v.verdict === 'killed' ? ` ✂ KILLED@${v.killDepth} (${v.reason})` : v.reason === 'timecap' ? ' ⚑ TIMECAP' : '';
	log(`[${done}/${useSeeds.length}] ${s.name.padEnd(44)} ${v.verdict}/${v.reason} collapses=${v.collapses} prom=${v.promotions} ${v.ms}ms${mark}  ETA ${eta.toFixed(0)}s`);
}

// --- summary
const killed = verdicts.filter((v) => v.verdict === 'killed');
const timecap = verdicts.filter((v) => v.reason === 'timecap');
log('');
log(`=== SUMMARY k=${k} tiles={${tiles}} budget=${budget} ===`);
log(`seeds=${useSeeds.length} killed=${killed.length} (${((100 * killed.length) / useSeeds.length).toFixed(1)}%) survived=${useSeeds.length - killed.length} timecap=${timecap.length}${timecap.length ? ' ⚑ (capped, verdicts conservative)' : ''}`);
for (const n of [0, 1, 2, 4, 8, 16, 32]) {
	if (n > budget) break;
	const c = killed.filter((v) => v.killDepth <= n).length;
	log(`  kills within depth ≤ ${String(n).padStart(2)}: ${c}`);
}
const byReason = new Map<string, number>();
for (const v of verdicts) byReason.set(`${v.verdict}/${v.reason}`, (byReason.get(`${v.verdict}/${v.reason}`) ?? 0) + 1);
for (const [r, c] of [...byReason.entries()].sort()) log(`  ${r}: ${c}`);
log(`total ${((Date.now() - t0) / 1000).toFixed(1)}s (check cost only — no pipeline change)`);

// --- ARTIFACT cross-check. The scout's claim is CORE-deadness: no plane tiling contains the
// --- seed's rigid core. solve() also emits cells seeded from single-VC FANS on lattices too small
// --- to hold the core (PeriodSolver §13.4 fan fallback), and those cells need NOT contain the
// --- core — so "killed seed has artifact cells" refutes the kill ONLY if some cell CONTAINS the
// --- core mod Λ. Fan-path cells are reported as info: they are the reason a seed-level prune must
// --- keep fan fills (or a same-set sibling) even for a core-dead seed.
if (artifactPath) {
	log('');
	log(`=== ARTIFACT cross-check vs ${artifactPath} (core-containment semantics) ===`);
	const ringNow = getActiveRing();
	const killedSet = new Map(killed.map((v) => [v.idx, v]));
	let producing = 0, failures = 0, fanOnly = 0, maxIdx = -1, lines = 0;
	for (const line of fs.readFileSync(artifactPath, 'utf8').split('\n')) {
		if (!line.trim()) continue;
		lines++;
		let rec: { idx?: number; cells?: unknown[] };
		try { rec = JSON.parse(line); } catch { continue; }
		if (typeof rec.idx !== 'number' || !Array.isArray(rec.cells)) continue;
		maxIdx = Math.max(maxIdx, rec.idx);
		if (rec.cells.length === 0) continue;
		producing++;
		if (!killedSet.has(rec.idx)) continue;
		// killed seed with cells: decide by core containment mod Λ (float lattice-membership test).
		const seed = useSeeds[rec.idx];
		let contained = 0;
		for (const sc of rec.cells) {
			const cell = deserializeCell(ringNow, sc as never);
			const u = cell.basisExact[0].toVector();
			const v = cell.basisExact[1].toVector();
			const det = u.x * v.y - u.y * v.x;
			const coreIn = seed.polygons.every((p) =>
				cell.cellPolygons.some((q) => {
					if (q.n !== p.n) return false;
					const dx = p.centroid.x - q.centroid.x, dy = p.centroid.y - q.centroid.y;
					const a = (dx * v.y - dy * v.x) / det;
					const b = (dy * u.x - dx * u.y) / det;
					return Math.abs(a - Math.round(a)) < 1e-6 && Math.abs(b - Math.round(b)) < 1e-6;
				})
			);
			if (coreIn) contained++;
		}
		if (contained > 0) {
			failures++;
			log(`⚑⚑ SOUNDNESS FAILURE: killed seed idx=${rec.idx} (${seed.name}) — ${contained}/${rec.cells.length} artifact cells CONTAIN the core`);
		} else {
			fanOnly++;
			log(`   info: killed seed idx=${rec.idx} (${seed.name}) has ${rec.cells.length} FAN-PATH cells (none contain the core) — kill stands; fan fills must be preserved by any prune`);
		}
	}
	log(`artifact: ${lines} seed records, max idx=${maxIdx} (scout nSeeds=${useSeeds.length}), ${producing} cell-producing seeds`);
	if (maxIdx >= useSeeds.length) log(`⚑ idx range mismatch — artifact does not align with this seed enumeration, cross-check VOID`);
	log(failures === 0
		? `cross-check PASS: 0 of ${killed.length} kills refuted by core-containing cells (${fanOnly} killed seeds have fan-path cells only)`
		: `cross-check FAIL: ${failures} kills refuted by core-containing artifact cells`);
	if (failures > 0) process.exit(1);
}

// --- VERIFY_KILLED: run the real solver on every killed seed; no emitted cell may CONTAIN the
// --- core mod Λ (fan-path cells that omit the core do not refute a core-deadness kill).
if (verifyKilled && killed.length > 0) {
	log('');
	log(`=== VERIFY_KILLED: PeriodSolver.solve on ${killed.length} killed seeds (cap ${verifyMaxMs}ms each) ===`);
	let pass = 0, fail = 0, inconclusive = 0;
	for (const v of killed) {
		const seed = useSeeds[v.idx];
		const ts = Date.now();
		const { cells, diag } = new PeriodSolver(k).solve(seed, { maxMs: verifyMaxMs });
		const ms = Date.now() - ts;
		const coreContaining = cells.filter((cell) => {
			const u = cell.basisExact[0].toVector();
			const w = cell.basisExact[1].toVector();
			const det = u.x * w.y - u.y * w.x;
			return seed.polygons.every((p) =>
				cell.cellPolygons.some((q) => {
					if (q.n !== p.n) return false;
					const dx = p.centroid.x - q.centroid.x, dy = p.centroid.y - q.centroid.y;
					const a = (dx * w.y - dy * w.x) / det;
					const b = (dy * u.x - dx * u.y) / det;
					return Math.abs(a - Math.round(a)) < 1e-6 && Math.abs(b - Math.round(b)) < 1e-6;
				})
			);
		}).length;
		if (coreContaining > 0) {
			fail++;
			log(`⚑⚑ SOUNDNESS FAILURE: killed seed idx=${v.idx} ${seed.name} emitted ${coreContaining} core-containing cells (${ms}ms)`);
		} else if (cells.length > 0) {
			pass++;
			log(`   verified idx=${v.idx} ${seed.name}: ${cells.length} cells, ALL fan-path (none contain the core) (${ms}ms)`);
		} else if (diag.timedOut) {
			inconclusive++;
			log(`⚑ INCONCLUSIVE (timeout): idx=${v.idx} ${seed.name} 0 cells so far (${ms}ms)`);
		} else {
			pass++;
			log(`   verified idx=${v.idx} ${seed.name}: 0 cells (${ms}ms)`);
		}
	}
	log(`VERIFY_KILLED: ${pass} pass, ${inconclusive} inconclusive, ${fail} FAIL`);
	if (fail > 0) process.exit(1);
}
log(`artifacts: ${logPath}, ${csvPath}`);
