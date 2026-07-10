/*
 * Phase-1 GENERAL star path (CC work order 2026-07-07): reproduce the in-ring point-only k=2 star figs
 * (Myers 34-43) with NO hand seeds. Candidate VC pairs are DERIVED from an exact compatibility relation
 * + seed-set enumeration, not read from the oracle; the oracle is used only to (a) scope the targeted
 * star variants and (b) label/verify which emitted cell is which fig.
 *
 *   enumerateStarVCs({variants, includeStarFree}) →  (star-bearing + purely-regular partner VCs)
 *   generateStarVCCompatibility (merge-search, exactPolygonsOverlap) → {vcNames, adjacencyList}
 *   starSeedSets(k=2), filter to ≥1 star-bearing (the k≥2 rescoped "≥1 star" condition)
 *   per seed-set: placeStarVCPair (both orientations) → 2-VC seed → PeriodSolver(2).solve
 *                 → independentCellGate + countVertexOrbits==2 → cell
 *
 * SCOPING (targeted, per user decision): figs are processed in SPECIES GROUPS — each fig's group is the
 * set of star species (n*_α) at its vertices (34-43 use one species each, except fig 42 which uses two).
 * Enumerating the full 5-species union at once produces 607 VCs / 184k pairs (intractable) and spurious
 * cross-species VCs that no target fig needs; per-group scoping keeps each pool ≤ ~114 VCs. ⚑ COMPLETENESS
 * CAVEAT: cross-species VC pairs (a VC of one species glued to a VC of another) are NOT explored — a
 * completeness gap for any hypothetical cross-species star tiling, logged not hidden. No target fig needs one.
 *
 * Certified-correct, not complete: every emitted cell passes the independent G1-G4 gate; a fig left
 * `open`/`cap-hit` is logged loudly, never silently dropped. Touches no regular pipeline / digest.
 *
 * Run (heap headroom for the widened pool):
 *   NODE_OPTIONS="--max-old-space-size=12288" pnpm tsx scripts/star-general-path.ts
 * Env knobs:
 *   FIGS               target figs (default 34..43)
 *   STAR_POOL_STEPS / STAR_POOL_LMAX   floor pool (default 8 / 5.7); figs escalate to 9/6.2 if unsolved
 *   PARTB_MAX_SEEDS    merge-search placements collected per orientation (default 12)
 *   PARTB_SOLVE_CAP    placements actually solved per seed-set (default 4)
 *   PARTB_SOLVE_MS     per-solve budget ms (default 180000)
 *   STAR_BEYOND_CAP    non-fig compatible seed-sets to also solve, GLOBAL (default 4; the rest logged, not dropped)
 *   DRY_RUN=1          stop after gate-0 + seed-set enumeration (no solves)
 */
import fs from 'node:fs';
import path from 'node:path';
import { Cyclotomic, CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { PeriodSolver } from '@/classes/algorithm/PeriodSolver';
import { KUniformityChecker } from '@/classes/algorithm/KUniformityChecker';
import { detSurd } from '@/classes/algorithm/exact/Surd';
import type { Polygon } from '@/classes/polygons/Polygon';
import type { SeedConfigurationLike } from '@/classes/algorithm/SeedExpander';
import {
	enumerateStarVCs,
	placeStarVCPair,
	isStarBearing,
	starVCFromOrbitString,
	type StarVC,
	type StarVCPairPlacement,
} from '@/classes/algorithm/StarVC';
import {
	generateStarVCCompatibility,
	starSeedSets,
	areStarVCsCompatible,
	type StarCompatibility,
} from '@/classes/algorithm/StarCompatibility';
import { independentCellGate } from './_starCellGate';

const ring = CyclotomicRing.create(24);
setActiveRing(ring);

const OUT = path.join(process.cwd(), 'experiments/star-oracle/star-cells-general.json');
const LOG = path.join(process.cwd(), 'experiments/results/star-general-path-2026-07-07.log');
const ORACLE = path.join(process.cwd(), 'experiments/star-oracle/myers-2009-k2.json');
// Deterministic compatibility cache (the merge-search is ~12 min over all groups; it depends only on
// the enumerated VC-name set per species group). Keyed by species + the sorted VC-name list, so a
// stale cache (different enumeration) is ignored, never trusted. STAR_COMPAT_FRESH=1 forces a rebuild.
const COMPAT_CACHE = path.join(process.cwd(), 'experiments/star-oracle/star-compat-cache.json');

const FLOOR_STEPS = Number(process.env.STAR_POOL_STEPS ?? '8');
const FLOOR_LMAX = Number(process.env.STAR_POOL_LMAX ?? '5.7');
const POOLS: [number, number][] = [
	[FLOOR_STEPS, FLOOR_LMAX],
	[9, 6.2], // fig 42's known-required pool; escalated to only when the floor leaves a fig unsolved
];
const MAX_SEEDS = Number(process.env.PARTB_MAX_SEEDS ?? '12');
const SOLVE_CAP = Number(process.env.PARTB_SOLVE_CAP ?? '4');
const SOLVE_MS = Number(process.env.PARTB_SOLVE_MS ?? '180000');
const BEYOND_CAP = Number(process.env.STAR_BEYOND_CAP ?? '4');
const TARGET_FIGS = (process.env.FIGS ?? '34,35,36,37,38,39,40,41,42,43').split(',').map((s) => s.trim()).filter(Boolean);

type Enc = { n: string[]; d: string };
type Status = 'solved' | 'open' | 'cap-hit' | 'beyond-target';
type Rec = {
	fig: string;
	orbits: string[];
	seedSet: string[];
	composition: string;
	basis: [Enc, Enc] | null;
	detFloat: number | null;
	gatePass: boolean;
	status: Status;
	pool: string | null;
	placements: number;
	note?: string;
};

function ts(): string {
	return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
function log(msg: string): void {
	fs.appendFileSync(LOG, `[${ts()}] ${msg}\n`);
	console.log(msg);
}
function figOrder(f: string): number {
	const n = parseInt(f, 10);
	return Number.isNaN(n) ? 1000 + f.charCodeAt(0) : n;
}
function writeOut(recs: Map<string, Rec>): void {
	const arr = [...recs.values()].sort((a, b) => figOrder(a.fig) - figOrder(b.fig) || (a.fig < b.fig ? -1 : 1));
	fs.writeFileSync(OUT, JSON.stringify(arr, null, 2) + '\n');
}

const countOrbits = (cellPolys: Polygon[], u: Cyclotomic, v: Cyclotomic): number =>
	new KUniformityChecker().countVertexOrbits(cellPolys, u, v, { syms: 0, reps: 0, blockSize: 0, orbits: null });

/** Build the 2-VC seed from one merge-search placement: the two shared vertices carry the two orbits. */
function pairSeed(c: StarVCPairPlacement): SeedConfigurationLike {
	return {
		polygons: c.union,
		vertexConfigurations: [
			{ computeSharedVertexExact: () => c.anchorA, polygons: c.union.filter((p) => p.vertexKeySet().has(c.anchorA.key())) },
			{ computeSharedVertexExact: () => c.anchorB, polygons: c.union.filter((p) => p.vertexKeySet().has(c.anchorB.key())) },
		],
	};
}

/** Collect admissible 2-fan placements for {a,b}, both orientations, deduped by the union's tile set. */
function collectPlacements(a: StarVC, b: StarVC): StarVCPairPlacement[] {
	const raw = [...placeStarVCPair(a, b, ring, MAX_SEEDS), ...placeStarVCPair(b, a, ring, MAX_SEEDS)];
	const seen = new Set<string>();
	const out: StarVCPairPlacement[] = [];
	for (const c of raw) {
		const key = c.union.map((p) => p.exactKey()).sort().join('|');
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(c);
		if (out.length >= MAX_SEEDS) break;
	}
	return out;
}

type SolveOutcome = {
	status: 'solved' | 'open' | 'cap-hit';
	cell: { basis: [Enc, Enc]; det: number; composition: string; gatePass: boolean } | null;
	pool: string | null;
	placements: number;
	note: string;
};

/**
 * Solve one seed-set: merge-search placements → PeriodSolver(2) → gate + orbits==2. Escalates the pool
 * only if unsolved at the floor. `cap-hit` (a solve timed out, or the placement/pool budget was
 * exhausted) is distinguished from `open` (a complete search with a genuine no-seed / gate-fail).
 */
function solveSeedSet(a: StarVC, b: StarVC, pools: [number, number][]): SolveOutcome {
	const cands = collectPlacements(a, b);
	if (cands.length === 0) {
		return { status: 'open', cell: null, pool: null, placements: 0, note: 'no admissible 2-fan placement (merge-search empty)' };
	}
	const nSolve = Math.min(cands.length, SOLVE_CAP);
	const truncatedSeeds = cands.length > SOLVE_CAP;
	let anyTimeout = false;
	for (const [steps, lmax] of pools) {
		process.env.POOL_STEPS_UP = String(steps);
		process.env.POOL_LMAX_UP = String(lmax);
		let poolTimeout = false;
		for (let i = 0; i < nSolve; i++) {
			const { cells, diag } = new PeriodSolver(2).solve(pairSeed(cands[i]), { maxMs: SOLVE_MS });
			poolTimeout = poolTimeout || diag.timedOut;
			for (const cell of cells) {
				const gate = independentCellGate(cell);
				if (!gate.pass) continue;
				if (countOrbits(cell.cellPolygons, cell.basisExact[0], cell.basisExact[1]) !== 2) continue;
				delete process.env.POOL_STEPS_UP;
				delete process.env.POOL_LMAX_UP;
				const det = detSurd(cell.basisExact[0], cell.basisExact[1]).abs().toFloat();
				return {
					status: 'solved',
					cell: { basis: [cell.basisExact[0].encode(), cell.basisExact[1].encode()], det, composition: gate.composition, gatePass: true },
					pool: `${steps}/${lmax}`,
					placements: cands.length,
					note: `solved at pool ${steps}/${lmax} (seed ${i + 1}/${nSolve})`,
				};
			}
		}
		anyTimeout = anyTimeout || poolTimeout;
		log(`      no gated k=2 cell at pool ${steps}/${lmax} (solved ${nSolve}/${cands.length} placements, timedOut=${poolTimeout})`);
	}
	delete process.env.POOL_STEPS_UP;
	delete process.env.POOL_LMAX_UP;
	const capped = anyTimeout || truncatedSeeds;
	return {
		status: capped ? 'cap-hit' : 'open',
		cell: null,
		pool: pools.map((p) => p.join('/')).join(','),
		placements: cands.length,
		note: capped
			? `budget truncated: ${nSolve}/${cands.length} placements solved, timedOut=${anyTimeout} (pools ${pools.map((p) => p.join('/')).join(',')}, ${SOLVE_MS}ms)`
			: `all ${cands.length} placements solved at every pool, no gated k=2 cell`,
	};
}

const emptyRec = (fig: string, orbits: string[], seedSet: string[], status: Status, note: string): Rec => ({
	fig, orbits, seedSet, composition: '', basis: null, detFloat: null, gatePass: false, status, pool: null, placements: -1, note,
});
const cellRec = (fig: string, orbits: string[], seedSet: string[], out: SolveOutcome, status: Status): Rec => ({
	fig, orbits, seedSet,
	composition: out.cell?.composition ?? '',
	basis: out.cell?.basis ?? null,
	detFloat: out.cell?.det ?? null,
	gatePass: out.cell?.gatePass ?? false,
	status, pool: out.pool, placements: out.placements, note: out.note,
});

// ===================================================================================================
fs.writeFileSync(LOG, `[${ts()}] ==================== star-general-path — targets ${TARGET_FIGS.join(',')} ====================\n`);
log(`floor pool ${FLOOR_STEPS}/${FLOOR_LMAX}; escalation ${POOLS.map((p) => p.join('/')).join(' → ')}; solve cap ${SOLVE_CAP} @ ${SOLVE_MS}ms; beyond-target cap ${BEYOND_CAP} (global)`);

const oracle = JSON.parse(fs.readFileSync(ORACLE, 'utf8')) as { records: { fig: string; orbits: string[] }[] };
const recOf = (fig: string) => {
	const r = oracle.records.find((x) => x.fig === fig);
	if (!r) throw new Error(`fig ${fig} not in oracle`);
	return r;
};

// ---- group target figs by their star-species set ----------------------------------------------------
type Group = {
	key: string;
	figs: string[];
	variants: { n: number; alphaU: number }[];
	vcMap: Map<string, StarVC>;
	compat: StarCompatibility;
	figPair: Map<string, [string, string]>;
};
const speciesOf = (fig: string): { key: string; variants: { n: number; alphaU: number }[] } => {
	const m = new Map<string, { n: number; alphaU: number }>();
	for (const orb of recOf(fig).orbits)
		for (const t of starVCFromOrbitString(orb).tokens) if (t.kind === 'pt') m.set(`${t.n}:${t.alphaU}`, { n: t.n, alphaU: t.alphaU });
	const key = [...m.keys()].sort().join(',');
	return { key, variants: [...m.values()] };
};
const groupByKey = new Map<string, Group>();
for (const fig of TARGET_FIGS) {
	const { key, variants } = speciesOf(fig);
	if (!groupByKey.has(key)) groupByKey.set(key, { key, figs: [], variants, vcMap: new Map(), compat: { vcNames: [], adjacencyList: {} }, figPair: new Map() });
	groupByKey.get(key)!.figs.push(fig);
}
const groups = [...groupByKey.values()];
log(`grouped ${TARGET_FIGS.length} figs into ${groups.length} species groups: ${groups.map((g) => `[${g.key}]→{${g.figs.join(',')}}`).join('  ')}`);

// ---- PHASE A: enumerate + compatibility + GATE-0 for every group (halt before any solve) -------------
type CacheEntry = { vcNames: string[]; adjacencyList: Record<string, string[]> };
const compatCache: Record<string, CacheEntry> =
	process.env.STAR_COMPAT_FRESH !== '1' && fs.existsSync(COMPAT_CACHE) ? JSON.parse(fs.readFileSync(COMPAT_CACHE, 'utf8')) : {};
const gate0Fail: string[] = [];
for (const g of groups) {
	g.vcMap = new Map();
	for (const vc of enumerateStarVCs({ variants: g.variants, includeStarFree: true })) if (!g.vcMap.has(vc.name)) g.vcMap.set(vc.name, vc);
	const nStar = [...g.vcMap.values()].filter(isStarBearing).length;
	const vcNames = [...g.vcMap.keys()].sort();
	const cached = compatCache[g.key];
	if (cached && cached.vcNames.length === vcNames.length && cached.vcNames.every((n, i) => n === vcNames[i])) {
		g.compat = { vcNames: cached.vcNames, adjacencyList: cached.adjacencyList };
		const nEdges = Object.values(g.compat.adjacencyList).reduce((s, a) => s + a.length, 0) / 2;
		log(`[${g.key}] enumerated ${g.vcMap.size} VCs (${nStar} star); compatibility loaded from cache (${nEdges} edges)`);
	} else {
		log(`[${g.key}] enumerated ${g.vcMap.size} VCs (${nStar} star, ${g.vcMap.size - nStar} regular); building compatibility (${(g.vcMap.size * (g.vcMap.size - 1)) / 2} pairs)…`);
		const t0 = Date.now();
		g.compat = generateStarVCCompatibility([...g.vcMap.values()], ring);
		const nEdges = Object.values(g.compat.adjacencyList).reduce((s, a) => s + a.length, 0) / 2;
		log(`[${g.key}] compatibility: ${nEdges} edges in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
		compatCache[g.key] = { vcNames: g.compat.vcNames, adjacencyList: g.compat.adjacencyList };
		fs.writeFileSync(COMPAT_CACHE, JSON.stringify(compatCache, null, 0) + '\n'); // persist incrementally
	}
	for (const fig of g.figs) {
		const orbits = recOf(fig).orbits;
		if (orbits.length !== 2) { gate0Fail.push(`fig ${fig}: ${orbits.length} orbits (expected 2)`); continue; }
		const [na, nb] = orbits.map((o) => starVCFromOrbitString(o).name);
		g.figPair.set(fig, [na, nb]);
		const inSet = g.vcMap.has(na) && g.vcMap.has(nb);
		const edge = inSet && areStarVCsCompatible(g.compat, na, nb);
		if (!inSet || !edge) gate0Fail.push(`fig ${fig}: {${na} , ${nb}} enumerated=${inSet} compatible=${edge}`);
	}
}
if (gate0Fail.length) {
	log('GATE-0 FAILED — a bug in variant collection or the compatibility relation, not a caveat:');
	for (const f of gate0Fail) log(`  ✗ ${f}`);
	throw new Error(`GATE-0 failed for ${gate0Fail.length} fig(s); halting before any solve.`);
}
log(`GATE-0 passed: all ${TARGET_FIGS.length} target fig pairs present and mutually compatible.`);

if (process.env.DRY_RUN === '1') {
	log('DRY_RUN=1 — stopping after gate-0 + compatibility (no solves).');
	process.exit(0);
}

// ---- PHASE B: solve --------------------------------------------------------------------------------
const recs = new Map<string, Rec>();
const tStart = Date.now();
let figsDone = 0;
let beyondSolved = 0;
const pairKey = (ss: string[]) => [...ss].sort().join(' + ');

for (const g of groups) {
	log(`===== species group [${g.key}] — figs ${g.figs.join(',')} =====`);
	const figByPair = new Map<string, string>();
	for (const [fig, [na, nb]] of g.figPair) figByPair.set(pairKey([na, nb]), fig);
	const seedSets = starSeedSets(g.compat, 2).filter((ss) => ss.length === 2 && ss.some((n) => isStarBearing(g.vcMap.get(n)!)));
	const beyond = seedSets.filter((ss) => !figByPair.has(pairKey(ss)));
	log(`[${g.key}] seed-sets (k=2, ≥1 star): ${seedSets.length} → ${g.figs.length} target-fig, ${beyond.length} beyond-target`);

	for (const fig of g.figs) {
		const [na, nb] = g.figPair.get(fig)!;
		const eta = figsDone > 0 ? (((Date.now() - tStart) / figsDone) * (TARGET_FIGS.length - figsDone)) / 1000 : NaN;
		log(`----- Fig ${fig} (${figsDone + 1}/${TARGET_FIGS.length}${Number.isNaN(eta) ? '' : `, ETA ${eta.toFixed(0)}s`}):  ${na}  |  ${nb} -----`);
		const out = solveSeedSet(g.vcMap.get(na)!, g.vcMap.get(nb)!, POOLS);
		recs.set(fig, cellRec(fig, recOf(fig).orbits, [na, nb], out, out.status));
		writeOut(recs);
		figsDone++;
		const r = recs.get(fig)!;
		log(`  Fig ${fig}: status=${r.status} gate=${r.gatePass ? 'Y' : 'n'} det≈${r.detFloat?.toFixed(4) ?? '—'} placements=${r.placements} pool=${r.pool ?? '—'} [${r.composition}]${r.note ? ' — ' + r.note : ''}`);
	}

	// beyond-target within this group: solve up to the GLOBAL budget, log (never drop) the rest
	for (const ss of beyond) {
		const id = `beyond:${pairKey(ss)}`;
		if (beyondSolved >= BEYOND_CAP) {
			recs.set(id, emptyRec(id, ss, ss, 'cap-hit', 'beyond-target, not attempted this run (STAR_BEYOND_CAP reached)'));
			log(`  [not solved this run] ${pairKey(ss)}`);
			continue;
		}
		beyondSolved++;
		log(`----- beyond-target ${beyondSolved}/${BEYOND_CAP}:  ${ss[0]}  |  ${ss[1]} -----`);
		const out = solveSeedSet(g.vcMap.get(ss[0])!, g.vcMap.get(ss[1])!, [POOLS[0]]); // floor pool only
		const solved = out.status === 'solved';
		recs.set(id, cellRec(id, ss, ss, out, solved ? 'beyond-target' : out.status));
		writeOut(recs);
		const r = recs.get(id)!;
		log(`  ${id}: status=${r.status} det≈${r.detFloat?.toFixed(4) ?? '—'} [${r.composition}]${r.note ? ' — ' + r.note : ''}`);
	}
}

// ---- status table ----------------------------------------------------------------------------------
writeOut(recs);
log('===== STATUS TABLE (target figs) =====');
log('fig   status       gate  det        pool    composition');
for (const fig of TARGET_FIGS) {
	const r = recs.get(fig)!;
	log(`${fig.padEnd(5)} ${r.status.padEnd(12)} ${(r.gatePass ? 'Y' : 'n').padEnd(5)} ${(r.detFloat?.toFixed(4) ?? '—').padEnd(10)} ${(r.pool ?? '—').padEnd(7)} ${r.composition}${r.note ? '   // ' + r.note : ''}`);
}
const solved = TARGET_FIGS.filter((f) => recs.get(f)!.status === 'solved');
const beyondCells = [...recs.values()].filter((r) => r.status === 'beyond-target');
log(`target figs solved: ${solved.length}/${TARGET_FIGS.length}  (${solved.join(', ')})`);
log(`beyond-target cells found: ${beyondCells.length}`);
log(`output: ${OUT}`);
