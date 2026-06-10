/**
 * Solve-for-period / fundamental-domain construction (docs/DEVELOPMENT_NOTES.md §8.1).
 *
 * The expand-and-extract `SeedExpander` grows a planar patch to graph-radius 6k and then recovers a
 * lattice. For the "hard" k≥2 seeds this explodes: the DFS explores unboundedly many allowed-VC but
 * NON-periodic boundary variants before any of them closes (or, mostly, never closes). No *sound*
 * cheap prune removes that junk (emit-on-closure is unsound — see DEVELOPMENT_NOTES §6).
 *
 * This module attacks the problem at its root by *fixing the period first*. A periodic tiling is a
 * tiling of the torus T = ℝ²/Λ; once Λ is fixed the fill is FINITE (the torus has bounded area, so a
 * bounded number of polygons), so the non-periodic junk simply cannot grow — every branch either
 * closes the torus or hits a contradiction within ≤ O(k) placements. The construction:
 *
 *   1. Enumerate candidate lattices Λ realizable from the seed (a cheap, shallow planar expansion
 *      reveals the short translation vectors; each independent pair is a candidate period).
 *   2. For each Λ, `torusFill` builds every edge-to-edge completion of the seed core on T = ℝ²/Λ by
 *      corner-completion (place one regular polygon at a time into the angular gap of an open vertex,
 *      reducing positions mod Λ so the patch can never leave a single fundamental cell). All vertices
 *      must end fully surrounded (2π) with an ALLOWED VC; proper overlaps are rejected exactly as in
 *      the planar expander (float `intersects`, strict-interior, so edge-adjacency is legal).
 *   3. A completed torus is certified (`isCompleteTiling`: no proper overlap, every interior vertex
 *      surrounded with an allowed VC, and total cell area = |det Λ| — a gap-free certificate), then
 *      deduped up to symmetry (`TranslationalCellExtractor.canonicalKey`) and gated to exactly k
 *      vertex orbits (`KUniformityChecker`). The same final gate the expand path uses.
 *
 * Soundness: a certified torus tiling is a complete, fully-determined tiling — there is no boundary
 * to extend, so nothing is dropped (the objection that sank emit-on-closure does not apply here).
 * Completeness (given Λ): the corner-completion DFS branches over every legal polygon at the chosen
 * gap, so it reaches every edge-to-edge filling of T. Completeness over Λ rests on the candidate-
 * lattice enumeration covering every period a valid tiling can have (bounded because a k-uniform
 * tiling has ≤ k·|point group| ≤ 12k vertex classes per cell).
 *
 * Exact throughout: identity mod Λ uses a float-guided but exact reduction (subtract the integer
 * combo m·u+n·v nearest the centroid — Λ-translates collapse to the same exact key); float is used
 * only as a broadphase guess and for the convex-overlap test (as in the rest of the pipeline).
 */

import type { Polygon } from '../polygons/Polygon';
import { RegularPolygon } from '../polygons/RegularPolygon';
import { ExactStarPolygon } from '../polygons/ExactStarPolygon';
import { Cyclotomic } from '../Cyclotomic';
import { KUniformityChecker } from './KUniformityChecker';
import { TranslationalCellExtractor } from './TranslationalCellExtractor';
import type { SeedConfigurationLike } from './SeedExpander';
import { LatticeEnumerator, latticeKey, shortVectorPool, edgeStepDirs, gridDirOf, vcAreaSet, vcAreaMinVerts, areaLadderFromTiles, holohedry, areaKey, isIntCombo, joinLattice, gaussReduceExact, type ObliqueTruncation } from './LatticeEnumerator';
import { detSurd, polygonAreaSurd, tileAreaSurd, Surd } from './exact/Surd';
import { dedupeByCongruence } from './TilingCongruence';
import { spikeBreak } from './exact/spikeTrace';

const FLOAT_TOL = 1e-6;

/** Pool depth/length for the seed-free candidate-vector enumeration. Tuned for the regular k≤2 core:
 *  every realizable cell vector is a sum of ≤6 unit edges within length 5.6 (the largest, t2001's
 *  |v|=2+2√3≈5.46). Scale up for larger k. */
const POOL_STEPS = 6;
const POOL_LMAX = 5.6;
/** Grid-aligned cells take their SHORT side from the pool; the short axis of every k≤2 rect/cmm cell
 *  is ≤ 2, so only short pool vectors are tried as the short side (bounds the gridAligned work). */
const GRID_SHORT_MAX2 = 3.5 * 3.5;
/** A round (hex/square) cell's short vector is either grid-aligned (the 19/20 on-grid cells) or, if
 *  off-grid (a snub), COMPACT — a large off-grid period would be a long wiggly edge-path with no
 *  symmetry reason to exist. The only k=2 off-grid round cell is t2020 (|v|=√13≈3.61). */
const COMPACT_OFFGRID_MAX2 = 4 * 4;

/** One regime's bounds for the candidate-vector stage (the completeness knobs of stage 6). */
export type PoolBounds = {
	/** Max unit-edge steps in the short-vector pool (the W(s) weight bound). */
	poolSteps: number;
	/** Euclidean pool reach — must cover the LONG basis vector |v| of any candidate cell. */
	poolLmax: number;
	/** |w|² cap on OFF-GRID round-cell basis vectors (the compact-snub heuristic). */
	compactOffMax2: number;
	/** |w|² cap on the grid-aligned cell's SHORT side. */
	gridShortMax2: number;
	/** Float ceiling on the cell area |det Λ|. */
	areaBoundF: number;
};

/**
 * CB-8: the candidate-stage bounds, centralized — the ACTIVE regime side by side with the PROVEN
 * box (thesis correctness.tex thm:weight + cor:box), so the tuned-vs-proven comparison lives in ONE
 * place and the regime banner provably cannot fire under the proven configuration (active ===
 * proven ⇒ every strict `<` in `isTuned` is false). Proven values, with their sources:
 *   poolSteps      = 24k−1                 (thm:weight: wt(w) ≤ 2k|P|−1 ≤ 24k−1)
 *   poolLmax       = (2/√3)·24k·a_max      (cor:box(iii): |v| ≤ (2/√3)·24k·a_max)
 *   compactOffMax2 = (2/√3)·24k·a_max      (cor:box(iii): |u|² ≤ (2/√3)·24k·a_max — a |w|² cap)
 *   gridShortMax2  = (2/√3)·24k·a_max      (same |u|² bound; the short side is the reduced vector)
 *   areaBoundF     = 24k·a_max             (cor:box(ii))
 * The tuned values are byte-identical to the historical constants (POOL_STEPS/POOL_LMAX/… above and
 * the k≥3 formulas), sized to KNOWN oracle maxima — oracle-anchored, not proof-anchored. Flip to the
 * proven regime with env PROVEN_POOL=1 (the DG-1 measurement switch; opt-in, default off — the
 * default path is unchanged; DG-1 measured the proven k=1 pool past 1.5e8 values at weight 15/23,
 * budget abort — see experiments/results/dg1-proven-pool-k1.log).
 */
export function poolConfig(
	k: number,
	aMax: number,
	provenMode: boolean = process.env.PROVEN_POOL === '1'
): { active: PoolBounds; proven: PoolBounds; isTuned: boolean } {
	const areaBoundF = 24 * k * aMax; // cor:box(ii) — already the proven value in BOTH regimes
	const reach = (2 / Math.sqrt(3)) * areaBoundF; // cor:box(iii) long-vector / short-vector² bound
	const proven: PoolBounds = {
		poolSteps: 24 * k - 1,
		poolLmax: reach,
		compactOffMax2: reach,
		gridShortMax2: reach,
		areaBoundF,
	};
	const tunedLmax = k <= 2 ? POOL_LMAX : Math.sqrt(22 * k); // k=3→8.12, k=4→9.38
	const tuned: PoolBounds = {
		poolSteps: k <= 2 ? POOL_STEPS : 2 * k + 2, // k=3→8, k=4→10
		poolLmax: tunedLmax,
		compactOffMax2: k <= 2 ? COMPACT_OFFGRID_MAX2 : tunedLmax * tunedLmax,
		gridShortMax2: k <= 2 ? GRID_SHORT_MAX2 : tunedLmax * tunedLmax,
		areaBoundF,
	};
	// ST-9: opt-in pool WIDENING for targeted single-seed star runs/tests (Myers 4(i) is fill-
	// requiring but its period is outside the tuned pool — see NOTES §35). Widen-only (`Math.max`
	// against the tuned floor, the proven box stays the ceiling via `isTuned`); a wider pool only
	// ADDS candidates, each still fully certified downstream, so emitted cells remain certified-
	// correct. Default off (env unset ⇒ max(x,0) = x) ⇒ byte-identical; NOT a sweep knob — the
	// star-sweep pool stays tuned per the ST-2 ruling (no star poolLmax increase before Increment 3).
	const stepsUp = Number(process.env.POOL_STEPS_UP ?? '0');
	const lmaxUp = Number(process.env.POOL_LMAX_UP ?? '0');
	if (!provenMode && (stepsUp > 0 || lmaxUp > 0)) {
		tuned.poolSteps = Math.max(tuned.poolSteps, Math.min(stepsUp, proven.poolSteps));
		tuned.poolLmax = Math.max(tuned.poolLmax, Math.min(lmaxUp, proven.poolLmax));
		tuned.compactOffMax2 = Math.max(tuned.compactOffMax2, Math.min(lmaxUp * lmaxUp, proven.compactOffMax2));
		tuned.gridShortMax2 = Math.max(tuned.gridShortMax2, Math.min(lmaxUp * lmaxUp, proven.gridShortMax2));
	}
	const active = provenMode ? proven : tuned;
	const isTuned =
		active.poolSteps < proven.poolSteps ||
		active.poolLmax < proven.poolLmax ||
		active.compactOffMax2 < proven.compactOffMax2 ||
		active.gridShortMax2 < proven.gridShortMax2 ||
		active.areaBoundF < proven.areaBoundF;
	return { active, proven, isTuned };
}

/** Once-per-process(-per-regime) registry for the CB-8 tuned-regime banner. */
const regimeBannerEmitted = new Set<string>();

/** Seed-free candidate lattices depend only on (ring, tile set, k) — computed once and cached.
 *  `p0Skipped` records how many candidates the P0 pre-filter removed (diagnostic only).
 *  `allKeys` is the FULL enumerated candidate key set (pre-P0) and `areaKeys` the admissible
 *  cell-area key set — both for the CB-7 primitivity guard. */
const candidateCache = new Map<
	string,
	{ lattices: [Cyclotomic, Cyclotomic][]; p0Skipped: number; obliqueCandidates: number; obliqueTruncated: ObliqueTruncation['cause'] | null; starLadderTruncated: boolean; allKeys: Set<string>; areaKeys: Set<string> }
>();

/** Canonical vertex-configuration name from a cyclic list of corner TOKENS (bare edge-count `n` for
 *  regular corners — byte-identical to the old number-list — or star point/dent tokens) — minimal over
 *  rotations AND reflection (a VC and its mirror share a name; matches the seed-build convention). */
function canonicalVCName(ns: string[]): string {
	const rotMin = (a: string[]): string => {
		let best: string | null = null;
		for (let i = 0; i < a.length; i++) {
			const r = a.slice(i).concat(a.slice(0, i)).join(',');
			if (best === null || r < best) best = r;
		}
		return best ?? '';
	};
	const f = rotMin(ns);
	const r = rotMin(ns.slice().reverse());
	return f < r ? f : r;
}

/** Unit-edge regular n-gon area (float), for the gap-free area certificate. */
function regularArea(n: number): number {
	return n / (4 * Math.tan(Math.PI / n));
}

/** Float tile area routed by tile IDENTITY (not edge-count `n`): a star's area depends on its
 *  point-angle α, not `n`, so a 4*_{π/4} and a square (both n=4) have different areas — `regularArea(4)`
 *  would silently return the square's. Exact shoelace for stars, the regular formula otherwise. For any
 *  regular tile this is exactly `regularArea(p.n)` ⇒ byte-identical on the regular path. */
function tileAreaFloatFor(p: Polygon): number {
	return p.isStar ? polygonAreaSurd(p.exactVertices!).toFloat() : regularArea(p.n);
}

/** EXACT tile area routed by tile IDENTITY (CB-1): the exact shoelace over the placed tile's exact
 *  vertices, uniform for regular and star tiles (translation/rotation-invariant, so any placement of
 *  the same tile yields the same Surd). For a regular n-gon this equals the closed-form
 *  `tileAreaSurd(n)` (unit-test-pinned); for a star it is the tile's TRUE non-convex area. Used by the
 *  certificate's area leg, which must be exact (thesis correctness.tex leg (c): "equals |det Λ|
 *  exactly") — the float `tileAreaFloatFor` remains as broadphase only. */
export function tileAreaSurdFor(p: Polygon): Surd {
	return polygonAreaSurd(p.exactVertices!);
}

/** Tile-identity token for the candidate-lattice area path (C1). A star and a regular n-gon share `n`,
 *  so the bare `n` collides; tag a star with its point angle (the minimum corner angle, in π/12 units)
 *  so distinct stars — and distinct α-variants of the same `n` — get distinct area entries. Regular →
 *  `String(n)` ⇒ byte-identical on the regular path. */
function tileIdToken(p: Polygon): string {
	if (!p.isStar) return String(p.n);
	let min = Infinity;
	const verts = p.exactVertices!;
	for (let i = 0; i < verts.length; i++) min = Math.min(min, p.cornerAngleUnits(i));
	return `${p.n}*@${min}`;
}

/** C3 star palette: the distinct `(n, α)` star variants in a seed, with exact area + (centroid-relative)
 *  circumradius for the fill bounds. `α` = the minimum corner angle (the point), in π/12 units — read
 *  geometrically so it works for any star polygon type. The fill loop seats each variant's POINT into an
 *  open gap via `ExactStarPolygon.isotoxal(n, α, …)`. Empty for regular seeds ⇒ byte-identical. */
function buildStarPalette(polys: Polygon[]): { n: number; alphaU: number; area: number; circum: number }[] {
	const seen = new Map<string, { n: number; alphaU: number; area: number; circum: number }>();
	for (const p of polys) {
		if (!p.isStar) continue;
		const verts = p.exactVertices!;
		let alphaU = Infinity;
		for (let i = 0; i < verts.length; i++) alphaU = Math.min(alphaU, p.cornerAngleUnits(i));
		const key = `${p.n}@${alphaU}`;
		if (seen.has(key)) continue;
		const area = polygonAreaSurd(verts).toFloat();
		const c = p.exactCentroid!.toVector();
		let circum = 0;
		for (const v of verts) {
			const vv = v.toVector();
			circum = Math.max(circum, Math.hypot(vv.x - c.x, vv.y - c.y));
		}
		seen.set(key, { n: p.n, alphaU, area, circum });
	}
	return [...seen.values()];
}

export type PeriodCell = {
	cellPolygons: Polygon[];
	basisExact: [Cyclotomic, Cyclotomic];
};

export type PeriodSolverDiag = {
	candidateLattices: number;
	latticesTried: number;
	rawCells: number; // completed torus tilings before dedup/gate
	emitted: number; // after canonical dedup + k-gate
	gateRejected: number; // completed but orbit count ≠ k
	fanLattices: number; // lattices where the rigid core overflowed the cell → seeded from VC fans instead
	p0Skipped: number; // candidate lattices removed by the P0 arithmetic pre-filter (minVerts > k·hol)
	p1Pruned: number; // DFS branches cut by the P1 orbit-floor (vertexClasses > k·hol)
	seedStateDedup: number; // redundant seed sets skipped (identical initial torus state mod Λ)
	obliqueCandidates: number; // candidate lattices contributed by source (C) oblique join-closure
	obliqueTruncated: ObliqueTruncation['cause'] | null; // INCOMPLETE-REGION cause if the oblique reach was clipped
	supercellRejected: number; // certified cells discarded as non-primitive supercells (CB-7 surface)
	primitivityGuardMisses: number; // CB-7 guard: supercell discarded with its PRIMITIVE lattice absent from the candidate set (each is a loud INCOMPLETE-REGION)
	primitivityGuardAreaSuppressed: number; // CB-7 guard alarms suppressed because the primitive area is outside the seed's admissible set — sound per the Finding-2 sign-off (TA 2026-06-10), but counted: a jump in this class is itself an anomaly signal, and it must stay distinguishable from candidate-hit suppression
	starLadderTruncated: boolean; // the star-seed area ladder hit its cap ⇒ admissibleAreaKeys is UNDER-generated ⇒ Finding-2 area suppression is unlicensed for this seed (the guard alarms unconditionally; ⚑ INCOMPLETE-REGION emitted at the ladder)
	blockIndexCapTruncated: number; // F3b (lem:fillreach): candidate lattices whose worst-case buildBlock index range exceeds BLOCK_INDEX_CAP — each is a loud ⚑ INCOMPLETE-REGION (an under-built block can mis-open covered vertices → no-progress kills the true continuation, AND a valid cell can fail the certificate's saturation leg). Measured worst requirement 16/19/23 at k=1/2/3 ⇒ 0 on the certified record; non-zero ANYWHERE voids a completeness claim for the run.
	timedOut: boolean;
};

export type PeriodSolverOptions = {
	/** Hard cap on polygons per fundamental cell (a runaway / wrong-Λ backstop). Default
	 *  `defaultMaxCellPolys(k)` = max(20·k+24, 24·k) — never below the proven per-cell tile bound
	 *  F ≤ 24k (torus Euler; lem:fillreach F3a), so the silent pop-site discard cannot drop a valid
	 *  cell. An explicit value below 24k is flagged ⚑ INCOMPLETE-REGION at solve start. */
	maxCellPolys?: number;
	/** Wall-clock cap (ms) for the whole solve (0 = unlimited). Default 45000. */
	maxMs?: number;
	verbose?: boolean;
	/** Debug hook: called for every completed primitive cell, BEFORE the k-gate filter. */
	onRawCell?: (cell: Polygon[], basis: [Cyclotomic, Cyclotomic], orbits: number | null) => void;
};

/** Default per-cell polygon cap: max(20k+24, 24k). Any k-uniform cell has F ≤ 24k tiles (torus
 *  Euler V−E+F=0, vertex degrees in [3,6] ⇒ F ≤ 2|V(Q)| ≤ 24k), so the default never binds on a
 *  true tiling at ANY k — the old `20k+24` undersized it from k=7 (lem:fillreach F3a work order,
 *  TA 2026-06-10). Identical to the old default for k ≤ 6 (20k+24 ≥ 24k ⇔ k ≤ 6) ⇒ digest-neutral
 *  on the certified k≤3 record. */
export function defaultMaxCellPolys(k: number): number {
	return Math.max(20 * k + 24, 24 * k);
}

/** Hard cap on the per-axis lattice-translate index range in `buildBlock`. lem:fillreach (F3b):
 *  a binding cap UNDER-builds the block — covered vertices mis-classify as open (then the
 *  no-progress test kills the true continuation: a silent drop mode) and a valid cell can fail
 *  the certificate's saturation leg. So it must never bind silently: `makeCtx` asserts the
 *  worst-case requirement per candidate lattice and emits ⚑ INCOMPLETE-REGION (counted in
 *  `diag.blockIndexCapTruncated`) when it would. TA-measured worst requirement over the certified
 *  catalogues: 16/19/23 at k=1/2/3 — far from binding, the record stands. */
export const BLOCK_INDEX_CAP = 60;

/** Worst-case per-axis index range `buildBlock` needs for a lattice, over EVERY call site: the
 *  certificate's Rabs = cellDiam+8 dominates (limit = Rabs + cellDiam + 2 = 2·cellDiam+10), and
 *  the longer basis vector (= cellDiam) drives the range (Mm = ⌈limit·|v|/area⌉+1, Mn likewise
 *  with |u|; max over both axes uses max(|u|,|v|) = cellDiam). Exported for the F3b regression
 *  test. */
export function blockIndexRangeNeeded(cellDiam: number, cellArea: number): number {
	return Math.ceil(((2 * cellDiam + 10) * cellDiam) / cellArea) + 1;
}

export class PeriodSolver {
	k: number;
	constructor(k: number) {
		this.k = k;
	}

	/**
	 * All distinct k-uniform periodic tilings (as fundamental cells + exact basis) realizable from
	 * the seed, found by fixing the period and filling the torus. Deduped up to the full isometry
	 * group and gated to exactly k vertex orbits.
	 */
	solve(seed: SeedConfigurationLike, opts: PeriodSolverOptions = {}): { cells: PeriodCell[]; diag: PeriodSolverDiag } {
		const k = this.k;
		const maxCellPolys = opts.maxCellPolys ?? defaultMaxCellPolys(k);
		// F3a (lem:fillreach): an explicit cap below the proven F ≤ 24k turns the silent pop-site
		// discard (`reps.length > maxCellPolys → continue`) into a completeness knob — never silent.
		if (opts.maxCellPolys !== undefined && opts.maxCellPolys < 24 * k) {
			process.stderr.write(
				`[PeriodSolver k=${k}] ⚑ INCOMPLETE-REGION (maxCellPolys): explicit cap ${opts.maxCellPolys} < proven ` +
				`per-cell tile bound 24k = ${24 * k} — the pop-site discard may silently drop valid cells\n`
			);
		}
		const maxMs = opts.maxMs ?? 45000;
		const start = Date.now();
		// Optional phase profiler (env PS_PROFILE) — purely additive, byte-identical when off.
		const prof = process.env.PS_PROFILE ? { cand: 0, fill: 0, gate: 0, canon: 0, dedup: 0 } : null;

		const corePolys: Polygon[] = seed.polygons;
		if (corePolys.length === 0 || !corePolys.every((p) => p.hasExact())) {
			return { cells: [], diag: emptyDiag() };
		}
		const ring = corePolys[0].exactVertices![0].ring;
		const N = ring.N;

		// Allowed vertex configurations (canonical, mirror-merged) and the polygon sizes in play.
		const coreVertices: Cyclotomic[] = seed.vertexConfigurations.map((vc) => vc.computeSharedVertexExact());
		const allowed = new Set<string>(
			coreVertices.map((cv) => this.vcNameAt(cv, corePolys.filter((p) => p.vertexKeySet().has(cv.key()))))
		);
		// Regular tile sizes only — a star carries `p.n` (its point count) but is NOT a regular n-gon, so
		// it must not feed `RegularPolygon.fromAnchorAndDirExact`. The star variants go to `starTiles`
		// (C3 palette). For regular seeds (no stars) this is byte-identical to the old `corePolys.map(n)`.
		const polySizes = Array.from(new Set(corePolys.filter((p) => !p.isStar).map((p) => p.n))).sort((a, b) => a - b);
		const starTiles = buildStarPalette(corePolys);

		// Seeding. The rigid k-VC core pins the k VCs in a concrete adjacency and is the default seed for
		// torusFill. But a tiling whose primitive cell is SMALLER than the rigid core cannot contain it
		// (e.g. t2014's 1×(1+√3) cell: the core's two squares sit at a non-lattice offset, so the core
		// reduces mod Λ to 2 squares + 4 triangles = 2+√3 > the 1+√3 cell — torusFill's area guard rejects
		// it before any fill). For exactly those lattices we instead seed from each VC's single-vertex
		// fan, which pins only one VC and lets corner-completion find the gluing. The fans are built as the
		// core's polygons incident to each VC's shared vertex (exact, correctly placed). See §13.4.
		const fanCoreSets: Polygon[][] = [];
		const seenFan = new Set<string>([corePolys.map((p) => p.exactKey()).sort().join('|')]);
		for (const cv of coreVertices) {
			const fan = corePolys.filter((p) => p.vertexKeySet().has(cv.key()));
			if (fan.length < 2 || fan.length >= corePolys.length) continue; // not a proper single-vertex fan
			const fanKey = fan.map((p) => p.exactKey()).sort().join('|');
			if (seenFan.has(fanKey)) continue;
			seenFan.add(fanKey);
			fanCoreSets.push(fan);
		}
		// Total (unreduced) core area. The reduced footprint mod Λ never exceeds this, so a cell with
		// area ≥ totalCoreArea ALWAYS holds the core — a cheap exact short-circuit that skips the
		// per-lattice footprint computation on every large cell (only small cells can overflow).
		const totalCoreArea = corePolys.reduce((s, p) => s + tileAreaFloatFor(p), 0);

		// --- 1. Candidate lattices (seed-free algebraic enumeration, cached). ---
		const _tc0 = prof ? Date.now() : 0;
		const { lattices, p0Skipped, obliqueCandidates, obliqueTruncated, starLadderTruncated, allKeys, areaKeys } = this.candidateLattices(seed);
		if (prof) prof.cand += Date.now() - _tc0;

		const diag: PeriodSolverDiag = {
			candidateLattices: lattices.length,
			latticesTried: 0,
			rawCells: 0,
			emitted: 0,
			gateRejected: 0,
			fanLattices: 0,
			p0Skipped,
			p1Pruned: 0,
			seedStateDedup: 0,
			obliqueCandidates,
			obliqueTruncated,
			supercellRejected: 0,
			primitivityGuardMisses: 0,
			primitivityGuardAreaSuppressed: 0,
			starLadderTruncated,
			blockIndexCapTruncated: 0,
			timedOut: false,
		};

		// --- 2+3. Fill each torus, certify, dedup, gate. ---
		const checker = new KUniformityChecker();
		const extractor = new TranslationalCellExtractor();
		const seenCanonical = new Set<string>();
		const cells: PeriodCell[] = [];

		for (const [u, v] of lattices) {
			if (maxMs > 0 && Date.now() - start > maxMs) {
				diag.timedOut = true;
				break;
			}
			diag.latticesTried++;
			const ctx = this.makeCtx(u, v, ring, allowed, polySizes, maxCellPolys, starTiles, allKeys, areaKeys);
			if (!ctx) continue; // degenerate basis
			if (ctx.blockIndexCapBinds) diag.blockIndexCapTruncated++; // F3b: ⚑ already emitted in makeCtx

			// Choose the seed(s) for THIS lattice. Normally the rigid core. But when the rigid core
			// OVERFLOWS the cell (its footprint mod Λ exceeds |det Λ| — the t2014 case), the core would be
			// area-rejected and yield nothing, so seed from the single-VC fans instead. This keeps the fast
			// path (one fill, rigid core) on every lattice the core fits, and only pays the extra fan fills
			// on the few small cells the core cannot hold — so the run stays fast and DETERMINISTIC (no
			// timeout pressure). ⚑ COMPLETENESS NOTE: this is exact for k=2 (the rigid core misses ONLY the
			// core-overflow tiling t2014; verified across all 20). At k≥3 a tiling could in principle be
			// reachable ONLY by a fan on a cell the rigid core also fits — that case is NOT covered here and
			// must be revisited (do not treat fan-on-overflow as a general completeness guarantee).
			const coreOverflows = fanCoreSets.length > 0 && ctx.cellArea < totalCoreArea - 1e-9 &&
				this.footprintArea(corePolys, ctx) > ctx.cellArea + 1e-6;
			const seedSets = coreOverflows ? fanCoreSets : [corePolys];
			if (coreOverflows) diag.fanLattices++;

			const rawCells: Polygon[][] = [];
			// Seed-state dedup (route-a-proven-box.md §"core-coincidence ruling", sound alternative #1):
			// distinct seed sets that reduce mod Λ to the IDENTICAL initial torus state produce identical
			// completions (the fill is deterministic on its initial state), so fill each once. Only the
			// multi-seed (fan / core-overflow) lattices can collide, so guard by seedSets.length to leave
			// the single-seed fast path untouched and byte-identical. (The proven blanket-fan mode, where
			// fan×orientation×placement multiplies states, is the real beneficiary — O2.)
			const dedupSeeds = seedSets.length > 1;
			const seenInitial = dedupSeeds ? new Set<string>() : null;
			const sdMemo = dedupSeeds ? new Map<string, { key: string; poly: Polygon }>() : null;
			for (const core of seedSets) {
				if (maxMs > 0 && Date.now() - start > maxMs) { diag.timedOut = true; break; }
				if (seenInitial) {
					const sk = this.stateKey(this.dedupModLattice(core, ctx, sdMemo!));
					if (seenInitial.has(sk)) { diag.seedStateDedup++; continue; }
					seenInitial.add(sk);
				}
				const _tf0 = prof ? Date.now() : 0;
				rawCells.push(...this.torusFill(core, ctx, () => maxMs > 0 && Date.now() - start > maxMs, diag));
				if (prof) prof.fill += Date.now() - _tf0;
			}
			diag.rawCells += rawCells.length;

			for (const reps of rawCells) {
				// dedup up to the full isometry group (boundary-free canonical cell key)
				const _tk0 = prof ? Date.now() : 0;
				const canonical = extractor.canonicalKey(reps);
				if (prof) prof.canon += Date.now() - _tk0;
				if (seenCanonical.has(canonical)) continue;
				seenCanonical.add(canonical);

				// k-uniformity gate: exactly k vertex orbits under the full symmetry group.
				const _tg0 = prof ? Date.now() : 0;
				const orbits = checker.countVertexOrbits(reps, u, v);
				if (prof) prof.gate += Date.now() - _tg0;
				if (opts.onRawCell) opts.onRawCell(reps, [u, v], orbits);
				if (orbits !== null && orbits !== k) {
					diag.gateRejected++;
					continue;
				}
				cells.push({ cellPolygons: reps, basisExact: [u, v] });
				diag.emitted++;
			}
		}

		// Final dedup up to CONGRUENCE. `canonicalKey` (the intra-loop pre-filter above) under-merges the
		// chiral snub: its two mirror lattices and two fundamental-domain representations survive as
		// distinct keys (the k=1 snub `3,3,3,3,6` as 2 cells, the k=2 t2020 as up to 4 — the over-count).
		// The exact pairwise congruence test merges them; it runs only on the few survivors of the
		// pre-filter, so it is cheap. (DEVELOPMENT_NOTES §12.7/§12.11.)
		const _td0 = prof ? Date.now() : 0;
		const deduped = dedupeByCongruence(cells, (c) => extractor.canonicalKey(c.cellPolygons));
		if (prof) prof.dedup += Date.now() - _td0;
		diag.emitted = deduped.length;
		if (prof) process.stderr.write(
			`[PS_PROFILE k=${k}] cand=${prof.cand}ms fill=${prof.fill}ms gate=${prof.gate}ms ` +
			`canon=${prof.canon}ms dedup=${prof.dedup}ms | lat=${diag.candidateLattices} raw=${diag.rawCells} ` +
			`gateRej=${diag.gateRejected} fanLat=${diag.fanLattices} p0Skip=${diag.p0Skipped} p1Prune=${diag.p1Pruned} ssDedup=${diag.seedStateDedup} obl=${diag.obliqueCandidates}${diag.obliqueTruncated ? `(trunc:${diag.obliqueTruncated})` : ''}\n`
		);

		if (opts.verbose) {
			process.stderr.write(
				`[PeriodSolver k=${k}] lattices=${diag.candidateLattices} tried=${diag.latticesTried} ` +
				`raw=${diag.rawCells} emitted=${diag.emitted} gateRej=${diag.gateRejected} fanLat=${diag.fanLattices} obl=${diag.obliqueCandidates}` +
				(diag.obliqueTruncated ? ` (oblTrunc:${diag.obliqueTruncated})` : '') +
				(diag.timedOut ? ' (TIMED OUT)' : '') + `\n`
			);
		}
		return { cells: deduped, diag };
	}

	// ---------------------------------------------------------------------------
	// Candidate lattice enumeration
	// ---------------------------------------------------------------------------

	/**
	 * Distinct candidate period lattices for the seed's tile set, enumerated ALGEBRAICALLY and
	 * SEED-FREE (no expander, no wall-clock ⇒ reproducible run-to-run). Depends only on (ring, tile
	 * set, k), so it is cached and shared across every seed with the same tiles. Two sources together
	 * cover every Bravais class a k≤2 cell can have (verified complete against the 20 two-uniform
	 * oracle lattices — 9 hexagonal, 2 square, 5 cmm, 4 rectangular, 0 oblique):
	 *   (A) ROUND cells (hexagonal + square) — similar sublattices `(v, v·ω)` / `(v, v·i)` of the base
	 *       lattices, for every short vector `v` in the unit-edge pool. This is the ONLY source that
	 *       reaches the off-grid snub-hexagonal cell (multiplier `3+ω`, |c|²=13).
	 *   (B) GRID-ALIGNED cells (rectangular + centered-rectangular cmm) — short grid side from the pool,
	 *       long axis SOLVED from the exact area ladder; kept only when the long/centering vector is a
	 *       realizable vertex difference (present in the pool), which discards the spurious solved
	 *       lengths that would otherwise flood torusFill.
	 * No oblique (p1/p2) lattice occurs at k=2 (see docs/LATTICE_ENUMERATION_DESIGN.md), so none is
	 * enumerated. torusFill + certificate + orbit gate validate each; ordering is by exact cell area
	 * (cheapest fill first).
	 */
	private candidateLattices(seed: SeedConfigurationLike): { lattices: [Cyclotomic, Cyclotomic][]; p0Skipped: number; obliqueCandidates: number; obliqueTruncated: ObliqueTruncation['cause'] | null; starLadderTruncated: boolean; allKeys: Set<string>; areaKeys: Set<string> } {
		const ring = seed.polygons[0].exactVertices![0].ring;
		const polySizes = Array.from(new Set(seed.polygons.map((p) => p.n))).sort((a, b) => a - b);
		// Tile-incidence per VC (n → #n-gons at that vertex) — drives the VC-area filter.
		// C1 (Increment 2): the candidate-area set is keyed by tile IDENTITY, not edge-count `n`, so a star
		// gets its exact shoelace area (not the regular n-gon's). Token = `n` for regular (byte-identical),
		// `n*@αU` for a star. `tileArea` routes the area; `tileCorners` (= p.n = the star's point count =
		// corners at counted vertices) is the c/n tile-count divisor.
		const vcIncidences = seed.vertexConfigurations.map((vc) => {
			const m = new Map<string, number>();
			for (const p of vc.polygons) { const id = tileIdToken(p); m.set(id, (m.get(id) ?? 0) + 1); }
			return m;
		});
		const tileArea = new Map<string, Surd>();
		const tileCorners = new Map<string, number>();
		for (const p of seed.polygons) {
			const id = tileIdToken(p);
			if (!tileArea.has(id)) {
				tileArea.set(id, p.isStar ? polygonAreaSurd(p.exactVertices!) : tileAreaSurd(p.n));
				tileCorners.set(id, p.n);
			}
		}
		const vcSig = vcIncidences
			.map((m) => [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([n, c]) => `${n}^${c}`).join('.'))
			.sort()
			.join('|');
		const provenMode = process.env.PROVEN_POOL === '1';
		// ST-9: the opt-in pool widening (poolConfig env knobs) must key separately — a widened solve
		// of the same tile set in one process must not reuse the narrow-pool candidate list (and vice
		// versa). Env unset ⇒ suffix empty ⇒ key byte-identical to the historical format.
		const widen = `${process.env.POOL_STEPS_UP ?? ''}|${process.env.POOL_LMAX_UP ?? ''}`;
		const cacheKey = `${ring.N}:${vcSig}:${this.k}:${provenMode ? 'proven' : 'tuned'}${widen !== '|' ? `:up${widen}` : ''}`;
		const cached = candidateCache.get(cacheKey);
		if (cached) return cached;

		const lat = new LatticeEnumerator(this.k);
		// Completeness knobs scale with k; the values AND the tuned-vs-proven comparison are centralized
		// in `poolConfig` (CB-8). k≤2 keeps the validated 6/5.6 pool and the small short-side caps; k≥3
		// grows the pool reach (the longest k=3 oracle cell vector is 6.732 > POOL_LMAX=5.6 and needs
		// ≥7 > POOL_STEPS=6 edge-steps) and LOOSENS the short-side caps to the pool length so larger
		// k≥3 short vectors / off-grid round cells are not dropped. ⚑ COMPLETENESS: the tuned bounds are
		// sized to the KNOWN oracle maxima (k=3 longest = 6.732), NOT proven — a tiling whose cell vector
		// exceeds the pool reach would be silently missed, and the proven pool blows up the dense ring
		// (24-dir octagon seeds → ~700k pts; see §13.6 / §11.5; DG-1: the proven k=1 pool budget-aborted
		// past 1.5e8 values at weight 15/23). The regime banner below makes every tuned run visibly
		// oracle-anchored (WEAK_SPOT A1: silent → loud, regime-level).
		// a_max routed by tile IDENTITY (seed.polygons, not the n-only polySizes) so a star's exact area
		// enters the bound — see the area-bound comment below; max is dedup-invariant ⇒ byte-identical
		// on the regular path.
		const aMax = Math.max(...seed.polygons.map(tileAreaFloatFor));
		const cfg = poolConfig(this.k, aMax, provenMode);
		const { poolSteps, poolLmax, compactOffMax2, gridShortMax2, areaBoundF } = cfg.active;
		// CB-8 regime banner (the de-magic assertion, WEAK_SPOT A1): if ANY active bound is below the
		// proven box (thm:weight / cor:box), say so loudly, once per (k, a_max) per process. Under
		// PROVEN_POOL=1 the active regime IS the proven one (`active === proven`), so every strict `<`
		// in `isTuned` is identically false and the banner provably cannot fire.
		if (cfg.isTuned) {
			const bk = `${this.k}:${aMax}`;
			if (!regimeBannerEmitted.has(bk)) {
				regimeBannerEmitted.add(bk);
				const t = cfg.active, p = cfg.proven;
				process.stderr.write(
					`[PeriodSolver k=${this.k}] ⚑ INCOMPLETE-REGION (tuned pool regime): ` +
					`poolSteps=${t.poolSteps} (proven ${p.poolSteps}), poolLmax=${t.poolLmax.toFixed(2)} (proven ${p.poolLmax.toFixed(2)}), ` +
					`compactOffMax2=${t.compactOffMax2.toFixed(2)}, gridShortMax2=${t.gridShortMax2.toFixed(2)} (proven ${p.compactOffMax2.toFixed(2)}), ` +
					`areaBound=${t.areaBoundF.toFixed(2)} (proven ${p.areaBoundF.toFixed(2)}) ` +
					`below proven box — run is oracle-anchored, not proof-anchored\n`
				);
			}
		}
		// Restrict the pool to the edge directions these tiles can actually produce (sound: every edge,
		// hence every period vector, lies in them). Collapses the pool 50–1000× when the tiles fit one
		// symmetry ring (e.g. {3,6} → 6 hexagonal directions).
		const dirs = edgeStepDirs(ring, polySizes);
		const pool = shortVectorPool(ring, poolSteps, poolLmax, dirs, /* monotone */ true);
		const poolSet = new Set(pool.map((p) => p.key()));
		// Proven cell-area bound (Route-A: thesis correctness.tex thm:weight / cor:box; summary in
		// resources/research/route-a-proven-box.md). A k-uniform cell has F ≤ 24k tiles (|V(Q)| ≤ 12k,
		// vertex degree ≥ 3), each of area ≤ a_max = the largest tile area in the seed's tile set, so
		// |det Λ| ≤ 24k·a_max. This REPLACES the tuned `16k`, which was sized to a WRONG "largest k=1
		// cell ≈ 14.8" estimate and SILENTLY DROPPED 4.6.12 (truncated trihexagonal, cell 9+6√3 ≈ 19.39
		// > 16 at k=1 — one of the 11 Archimedean tilings; the live path gave k=1=10 until this fix).
		// Float ceiling only; the VC-area set + torusFill area checks stay exact (Surd). Raising the area
		// ceiling does NOT enlarge the pool (the binding completeness knob), so no tractability blow-up.
		// a_max routed by tile identity (seed.polygons, not the n-only polySizes) so a star's exact area
		// enters the bound — a star can be larger than the regular n-gon of the same n; using regularArea(n)
		// would under-size the box and could silently clip the star's own cell. Max is dedup-invariant ⇒
		// byte-identical on the regular path. (The candidate-area LADDER below is still n-keyed: vcAreaSet /
		// vcAreaMinVerts use tileAreaSurd(n) and the Euler relation, both unsound for a star — a documented
		// break for Harness 1, the Increment-2 ladder refactor; raising a_max here is strictly conservative.)
		// (`aMax` is hoisted above; `areaBoundF` = 24k·a_max comes from `poolConfig` — cor:box(ii), the
		// proven value in BOTH regimes.)
		// Exact cell areas the seed's VCs can actually produce. For REGULAR seeds the sharp VC-forced
		// multiset (`vcAreaSet`) is sound+complete and far sparser. For STAR seeds it is UNSOUND — its
		// `corners/n = tiles` identity assumes every tile corner is a counted vertex, but a star's dents are
		// filled at `t=2` non-vertex points (so e.g. an octagon abutting a dent contributes <8 vertex
		// corners), and it drops the true cell (4(j) = {1 oct + 1 star} = 4+2√2 is excluded). So for star
		// seeds we LOOSEN to the generic identity-keyed ladder (any sum of tile areas — sound superset; the
		// fill+certificate reject the extras). Doctrine: completeness knobs are not speed dials.
		const seedHasStar = seed.polygons.some((p) => p.isStar);
		// ⚑ LOUD truncation (TA Finding-2 sign-off §4, 2026-06-10): a capped ladder UNDER-generates the
		// admissible-area set, which both drops candidate lattices AND would let the CB-7 guard's
		// Finding-2 area suppression mask the resulting supercell alarms — the correlated-failure mode.
		// So the truncation (a) logs ⚑ INCOMPLETE-REGION, (b) sets `starLadderTruncated`, which disables
		// the area suppression in `supercellRejectionGuard` (alarm unconditionally) for this seed.
		// Fires at most once per uncached candidateLattices call; star seeds only.
		let starLadderTruncated = false;
		const areas = seedHasStar
			? areaLadderFromTiles([...tileArea.values()], this.k, () => {
					starLadderTruncated = true;
					process.stderr.write(
						`[PeriodSolver k=${this.k}] ⚑ INCOMPLETE-REGION (star area-ladder): truncated below the sound ` +
						`orbit bound (LADDER_SIZE_CAP or area cap) — admissible-area set under-generated; ` +
						`CB-7 Finding-2 area suppression DISABLED for this seed\n`
					);
				}, areaBoundF)
			: vcAreaSet(vcIncidences, tileArea, tileCorners, areaBoundF);
		if (seedHasStar && process.env.SPIKE_TRACE === '1') {
			spikeBreak(
				'PeriodSolver.candidateLattices area filter (vcAreaSet)',
				'vcAreaSet uses the VC-forced tile multiset (corners/n = tiles), assuming every tile corner is a counted vertex',
				'FALSE for stars (dents are t=2 non-vertices) ⇒ it drops the true cell; LOOSENED to the generic identity-keyed ladder for star seeds (sound superset)',
				'C2-style loosening; tightening needs the dent-aware vertex/corner model (Increment 3)'
			);
		}

		const lattices: [Cyclotomic, Cyclotomic][] = [];
		const seen = new Set<string>();
		const push = (u: Cyclotomic, v: Cyclotomic): void => {
			if (detSurd(u, v).isZero()) return;
			const key = latticeKey(u, v);
			if (seen.has(key)) return;
			seen.add(key);
			lattices.push([u, v]);
		};

		// (A) round (hexagonal + square) cells. The short vector must be grid-aligned (the on-grid round
		// cells) OR compact (the few off-grid snubs, e.g. t2020 at √13) — a LARGE off-grid short vector
		// is a long wiggly edge-path with no symmetry reason to be a period, so it is pruned. ⚑ The
		// compact cap is a TUNED bound (see `poolConfig`): a pool vector it drops EXISTS but is never
		// tried as a round-cell basis — a per-candidate-checkable truncation, logged LOUDLY below
		// (CB-8, same INCOMPLETE-REGION doctrine as the grid long-side reach). Behaviour-preserving:
		// the pushed lattice set is unchanged (log-only).
		let compactReachTrunc = 0;
		const roundPool = pool.filter((p) => {
			if (gridDirOf(p, ring) !== null) return true;
			const f = p.toVector();
			if (f.x * f.x + f.y * f.y <= compactOffMax2) return true;
			compactReachTrunc++;
			return false;
		});
		if (compactReachTrunc > 0)
			process.stderr.write(`[PeriodSolver k=${this.k}] ⚑ INCOMPLETE-REGION (compact off-grid cap): ${compactReachTrunc} off-grid pool vectors exceed compactOffMax2=${compactOffMax2.toFixed(2)} and are not tried as round-cell bases\n`);
		for (const [u, v] of lat.roundCells(roundPool, polySizes, ring, areaBoundF, undefined, areas)) push(u, v);

		// (B) grid-aligned (rect + cmm) cells — short side from the SHORT pool vectors; the solved
		// long/centering vector must itself be a realizable vertex difference. ⚑ The short-side cap is
		// a TUNED bound (see `poolConfig`): a pool vector it drops EXISTS but is never tried as a
		// short side — logged LOUDLY (CB-8), pushed lattice set unchanged (log-only).
		let gridShortTrunc = 0;
		const gridShorts = pool.filter((p) => {
			const f = p.toVector();
			if (f.x * f.x + f.y * f.y <= gridShortMax2) return true;
			gridShortTrunc++;
			return false;
		});
		if (gridShortTrunc > 0)
			process.stderr.write(`[PeriodSolver k=${this.k}] ⚑ INCOMPLETE-REGION (grid short-side cap): ${gridShortTrunc} pool vectors exceed gridShortMax2=${gridShortMax2.toFixed(2)} and are not tried as cmm/rect short sides\n`);
		// The solved cmm/rect long axis is kept only when it is itself a realizable vertex difference
		// (present in the pool) — this discards spurious solved lengths. ⚑ A long axis that is grid-aligned
		// and within the area bound but exceeds the pool REACH (poolLmax) is a genuine tuned-pool
		// truncation, not a spurious solution; log it LOUDLY so the candidate-stage boundary is never
		// silent (same INCOMPLETE-REGION doctrine as source C / the area ladder). Behaviour-preserving:
		// the pushed lattice set is unchanged. ⚑ RESIDUAL (CB-8 audit): a solved axis WITHIN poolLmax but
		// absent from the pool is ambiguous — spurious (not a vertex difference) OR step-count-truncated
		// (≤ poolLmax Euclidean but needing > poolSteps edge-steps / no monotone path; ℤ[ζ₂₄] is dense, so
		// length does not bound steps). That case is NOT distinguishable here and is NOT logged per
		// candidate; it is covered only by the regime banner above.
		let gridReachTrunc = 0;
		for (const [u, v] of lat.gridAlignedCells(gridShorts, polySizes, ring, undefined, areas)) {
			if (poolSet.has(v.key())) { push(u, v); continue; }
			const vf = v.toVector();
			if (vf.x * vf.x + vf.y * vf.y > poolLmax * poolLmax + 1e-9) gridReachTrunc++;
		}
		if (gridReachTrunc > 0)
			process.stderr.write(`[PeriodSolver k=${this.k}] ⚑ INCOMPLETE-REGION (grid long-side reach): ${gridReachTrunc} solved cmm/rect long axes exceed poolLmax=${poolLmax.toFixed(2)} and are not enumerated\n`);

		// `minVerts` (min vertex-classes per realizable cell area) drives BOTH the P0 pre-filter below AND
		// the oblique sub-pool sizing in source (C); computed once here (hoisted from the P0 loop — pure,
		// no behavioural change). For STAR seeds it is LEFT EMPTY (C2): `vcAreaMinVerts` bakes in the regular
		// Euler relation V=Σtₙ(n−2)/2, false for stars (a 2n-gon; dents are non-vertices) — so an empty map
		// makes P0 prune nothing and oblique sizing prune nothing (sound; never drops; k=1 has no oblique).
		const minVerts = seedHasStar
			? new Map<string, number>()
			: vcAreaMinVerts(vcIncidences, tileArea, tileCorners, areaBoundF);

		// (C) OBLIQUE (p1/p2) cells — the cor:box join-closure completion that reaches the Bravais classes
		// the symmetry-pinned (A)/(B) cannot (k≥3 oblique cells t3046/t3055). Source (C) contributes ONLY
		// `hol==2` lattices, so (A)/(B) remain the SOLE round/grid source and the k≤2 catalogue stays
		// byte-identical (the oracle has 0 oblique at k≤2; those candidates gate-reject). The proven box is
		// large; the searched region is the tuned pool reach, so an out-of-reach oblique cell is logged
		// LOUDLY (INCOMPLETE-REGION, never silent), per route-a-proven-box.md / join-closure contract.
		let obliqueCandidates = 0;
		let obliqueTruncated: ObliqueTruncation['cause'] | null = null;
		for (const [u, v] of lat.obliqueCells(pool, areas, ring, areaBoundF, poolLmax, minVerts, (info) => {
			obliqueTruncated = info.cause;
			process.stderr.write(`[PeriodSolver k=${this.k}] ⚑ INCOMPLETE-REGION (oblique candidate stage): ${JSON.stringify(info)}\n`);
		})) {
			const before = seen.size;
			push(u, v);
			if (seen.size > before) obliqueCandidates++;
		}

		// shortest cells first (exact area) — torusFill is cheapest on small lattices.
		lattices.sort((a, b) => detSurd(a[0], a[1]).abs().cmp(detSurd(b[0], b[1]).abs()));

		// --- P0: arithmetic lattice pre-filter (route-a-proven-box.md §"Early-prune rulings"). ---
		// Skip a candidate Λ when EVERY tile multiset realizing its exact cell area needs more vertex
		// classes than k·hol(Λ) allows: minVerts(|det Λ|) > k·hol(Λ) ⇒ any completion has orbits ≥
		// V/hol(Λ) > k, so it is gate-rejected (or is a supercell — re-found at its primitive
		// sublattice, which is a candidate provided stage 6 contains the primitive lattice:
		// unconditional under cor:box, GUARDED loudly under any tuned pool, CB-7). SOUND + licensed —
		// it is NOT a completeness knob; it removes only lattices that can carry no k-uniform tiling
		// with these VCs. hol(Λ) never underestimates (it falls back to 12), so the floor is never too
		// low. Cached with the list.
		const kept: [Cyclotomic, Cyclotomic][] = [];
		let p0Skipped = 0;
		for (const [u, v] of lattices) {
			const mv = minVerts.get(areaKey(detSurd(u, v).abs()));
			if (mv !== undefined && mv > this.k * holohedry(u, v)) { p0Skipped++; continue; }
			kept.push([u, v]);
		}
		// `allKeys` = every enumerated candidate key PRE-P0 (the `seen` set) — the membership universe
		// for the CB-7 primitivity-rejection guard. Pre-P0 on purpose: a P0-skipped lattice was
		// enumerated and removed by a LICENSED prune (if the rejected supercell's tiling were k-uniform,
		// its primitive lattice would satisfy minVerts ≤ k·hol and survive P0 — so a P0-skipped
		// primitive means the tiling is not k-uniform and the discard is sound, not a silent loss).
		// `areaKeys` = the admissible cell-area set: a discarded supercell whose PRIMITIVE area is
		// outside it cannot carry this seed's orbit-VC multiset (the same Euler/incidence completeness
		// contract the candidate area filter rests on) — it is another seed's tiling, so the guard
		// must not alarm on it (observed live: pure-triangle = 1-uniform supercell completions inside
		// multi-VC k=2 seeds; vcAreaSet uses v ≥ 1 for EVERY VC, so their primitive area √3/2 is
		// excluded by construction).
		const result = { lattices: kept, p0Skipped, obliqueCandidates, obliqueTruncated, starLadderTruncated, allKeys: seen, areaKeys: new Set(areas.map(areaKey)) };
		candidateCache.set(cacheKey, result);
		return result;
	}

	// ---------------------------------------------------------------------------
	// Torus fill (corner completion, mod Λ)
	// ---------------------------------------------------------------------------

	private makeCtx(
		u: Cyclotomic,
		v: Cyclotomic,
		ring: Cyclotomic['ring'],
		allowed: Set<string>,
		polySizes: number[],
		maxCellPolys: number,
		starTiles: { n: number; alphaU: number; area: number; circum: number }[] = [],
		// CB-7 guard universes (all enumerated candidate lattice keys pre-P0; admissible cell-area
		// keys). Default empty: the only caller that omits them is `certifyExternalCell`, whose path
		// never reaches `isPrimitive`.
		candidateKeys: Set<string> = new Set(),
		admissibleAreaKeys: Set<string> = new Set()
	): FillCtx | null {
		const uV = u.toVector();
		const vV = v.toVector();
		const det = uV.x * vV.y - uV.y * vV.x;
		if (Math.abs(det) < FLOAT_TOL) return null;
		const cellDiam = Math.max(Math.hypot(uV.x, uV.y), Math.hypot(vV.x, vV.y));
		const minLen = Math.min(Math.hypot(uV.x, uV.y), Math.hypot(vV.x, vV.y));
		// No period of a unit-edge tiling has a lattice vector shorter than an edge (distinct
		// translation-equivalent vertices are ≥ 1 apart). Reject shorter / near-degenerate candidates —
		// they are not real periods and would blow up the block (M² cells with a tiny minLen).
		if (minLen < 0.9) return null;
		const cellArea = Math.abs(det);
		// The cell is filled EXACTLY to its area, so the polygon count cannot exceed cellArea divided
		// by the smallest tile area (equilateral triangle = √3/4). This ties the fill bound to the
		// lattice: a wrong/too-small candidate Λ is abandoned almost immediately instead of branching
		// up to the global cap. +2 slack for the float area comparison.
		// Smallest tile area over regulars AND stars (C3): a star carries its own exact area, so a star-
		// only or star-smallest seed gets a sound (never-too-small) areaCap. Regular seeds (no stars) →
		// `Math.min(...regAreas)` exactly as before ⇒ byte-identical.
		const minTileArea = Math.min(...polySizes.map(regularArea), ...starTiles.map((s) => s.area));
		const areaCap = Math.ceil(cellArea / minTileArea) + 2;
		// Largest tile circumradius (regular n-gon = 1/(2 sin(π/n)); star = its centroid-relative max) —
		// used to cull far tiles from the per-pop incidence map (a tile beyond judgeR + maxCircum has no
		// vertex within judgeR). Including stars keeps the cull sound for star seeds.
		const maxCircum = Math.max(
			...polySizes.map((n) => 1 / (2 * Math.sin(Math.PI / n))),
			...starTiles.map((s) => s.circum),
		);
		// P1 orbit-floor = k·hol(Λ). hol(Λ) is an exact UPPER bound on any tiling's point group on Λ,
		// so any k-uniform tiling has V = #vertex classes ≤ k·hol(Λ); a partial fill exceeding this can
		// only complete above k orbits (gate-rejected) or to a supercell (primitivity-rejected). hol
		// never underestimates (falls back to 12), so the floor is never set too low.
		const orbitFloor = this.k * holohedry(u, v);
		// F3b (lem:fillreach): assert buildBlock's index cap cannot bind for this lattice — over every
		// call site (the certificate radius dominates). A binding cap under-builds the block: covered
		// vertices mis-classify as open (the no-progress test then kills the true continuation) and a
		// valid cell can fail the certificate's saturation leg — a silent drop mode. Emitted HERE (the
		// single ctx chokepoint) so the external-certify path is covered too; solve counts it in diag.
		const blockIndexCapBinds = blockIndexRangeNeeded(cellDiam, cellArea) > BLOCK_INDEX_CAP;
		if (blockIndexCapBinds) {
			process.stderr.write(
				`[PeriodSolver k=${this.k}] ⚑ INCOMPLETE-REGION (block index cap): lattice ${latticeKey(u, v)} needs ` +
				`index range ${blockIndexRangeNeeded(cellDiam, cellArea)} > ${BLOCK_INDEX_CAP} — blocks under-built; ` +
				`this candidate's results are NOT completeness-grade\n`
			);
		}
		return {
			u, v, ring, N: ring.N, allowed, polySizes,
			maxCellPolys: Math.min(maxCellPolys, areaCap),
			uV, vV, det, cellDiam, minLen, cellArea, maxCircum, orbitFloor, blockIndexCapBinds,
			// CB-1: exact |det Λ| for the certificate's area leg — computed once per candidate lattice.
			cellAreaSurd: detSurd(u, v).abs(),
			starTiles: starTiles.map((s) => ({ n: s.n, alphaU: s.alphaU })),
			candidateKeys,
			admissibleAreaKeys,
		};
	}

	/** Debug switch (temporary): trace torus-fill decisions to stderr. */
	static DEBUG = false;

	/** All complete torus tilings extending the seed core under the fixed lattice in `ctx`.
	 *  Each result is one representative polygon per lattice class (a fundamental cell). */
	private torusFill(corePolys: Polygon[], ctx: FillCtx, timedOut: () => boolean, diag: PeriodSolverDiag): Polygon[][] {
		const memo = new Map<string, { key: string; poly: Polygon }>();
		// Initial cell = seed polygons reduced into canonical lattice-class representatives.
		const initial = this.dedupModLattice(corePolys, ctx, memo);
		if (PeriodSolver.DEBUG) process.stderr.write(`  torusFill: initial reps=${initial.length} det=${ctx.det.toFixed(3)} cellDiam=${ctx.cellDiam.toFixed(3)}\n`);
		// Microsecond reject (no block): the DISTINCT core polygons mod Λ all live in one cell, so their
		// total area cannot exceed the cell area |det Λ|. A too-small / wrong candidate is killed in
		// O(reps) before the expensive block build. Sound (a necessary condition for any fitting).
		// CB-1 ruling: stays FLOAT (hot path, runs per candidate lattice). Failure direction is sound:
		// the +1e-6 slack only ever over-ACCEPTS (float error ≲1e-13 ≪ 1e-6 can't cause a wrongful
		// reject); an over-accepted candidate is killed by the exact certificate downstream.
		let initialArea = 0;
		for (const p of initial) initialArea += tileAreaFloatFor(p);
		if (initialArea > ctx.cellArea + 1e-6) {
			if (PeriodSolver.DEBUG) process.stderr.write(`  torusFill: core area ${initialArea.toFixed(2)} > cell ${ctx.cellArea.toFixed(2)} → reject\n`);
			return [];
		}
		// Cheap pre-block reject: if a core rep properly overlaps one of its 8 nearest lattice translates,
		// Λ is too small — a necessary self-overlap condition caught in O(reps) intersects before the
		// initial block build (audit perf C3). A strict subset of blockHasProperOverlap, so it only
		// rejects candidates the full check would also reject (a valid tiling never has a tile overlapping
		// its own translate ⇒ never drops a real tiling); results are byte-identical.
		if (this.coreSelfOverlapsNearest(initial, ctx)) {
			if (PeriodSolver.DEBUG) process.stderr.write(`  torusFill: core self-overlap (nearest translate) → reject\n`); return [];
		}
		// Build the initial cell's block and reject if the seed self-overlaps mod Λ. Reuse this block as
		// the DFS root's block — the DFS carries each cell's block and extends it by ONE new tile's lattice
		// translates per child instead of rebuilding the whole block every pop (audit perf C1).
		const initialBlock = this.buildBlock(initial, ctx, 5);
		if (this.blockHasProperOverlap(initialBlock, ctx)) {
			if (PeriodSolver.DEBUG) process.stderr.write(`  torusFill: initial self-overlap → reject\n`); return [];
		}

		// P1 orbit-floor state: the vertex classes mod Λ present so far (`vReps`), carried on the stack
		// and extended by one tile's classes per child. A child whose count exceeds `ctx.orbitFloor`
		// (= k·hol(Λ)) is pruned — its completion must have orbits > k (gate-rejected) or be a supercell
		// (primitivity-rejected; re-found at its primitive sublattice unconditionally under cor:box,
		// guarded loudly under the tuned pool — CB-7). Every k-uniform tiling has V ≤
		// k·hol(Λ) and V is monotone, so a branch leading to a valid tiling is NEVER pruned (byte-identical).
		//
		// C3 — UNSOUND for stars, so SKIP P1 for star seeds (sound loosening, doctrine: "completeness
		// knobs are not speed dials"). `extendV` counts every tile corner as a vertex class, but a star's
		// DENTS land at t=2 dent-fill points that are NOT counted vertices — so `vReps` over-counts V and
		// could prune a branch leading to a valid star tiling (a DROP = incompleteness). The fill +
		// certificate + orbit-count gates still reject invalid candidates; only speed is affected (maxCellPolys
		// area cap still bounds the cell). The tightened bound (V = [Σ_reg(n−2)+Σ_star(2nₛ−2)]/2 − D, D =
		// dent-fill count) needs D bounded per cell — TA-owed (Increment 3).
		const skipP1 = ctx.starTiles.length > 0;
		if (skipP1 && process.env.SPIKE_TRACE === '1') {
			spikeBreak(
				'PeriodSolver.ts torusFill P1 orbit-floor prune (vReps > k·hol)',
				'V ≤ k·hol(Λ) counted over ALL tile corners (regular Euler relation)',
				'a star DENT lands at a t=2 dent-fill NON-vertex wrongly counted in V ⇒ P1 could prune a valid star branch (a DROP)',
				'LOOSENED: P1 disabled for star seeds (sound; maxCellPolys still bounds the cell). Tightened bound = Increment 3',
			);
			spikeBreak(
				'PeriodSolver.ts torusFill star gap-fill — DENT-seating not attempted',
				'the fill loop seats only star POINTS (interior α) into a gap',
				'the Fig-3 dent-AT-vertex class (a reflex dent corner coincides with a real ≥3-tile vertex) is NOT generated by fill ⇒ those tilings can be DROPPED (a completeness gap, not a soundness one)',
				'SCOPED: Fig-4 (point-at-vertex) is sound+complete; Fig-3 a,f are best-effort (C4 hand-derived fallback). Flag is loud, never silent (project doctrine)',
			);
		}
		const uL = ctx.u, vL = ctx.v;
		const extendV = (parent: Cyclotomic[], poly: Polygon): Cyclotomic[] => {
			const out = parent.slice();
			for (const w of poly.exactVertices!) {
				if (!out.some((r) => latticeEquivExact(w, r, uL, vL))) out.push(w);
			}
			return out;
		};
		let initialV: Cyclotomic[] = [];
		for (const p of initial) initialV = extendV(initialV, p);
		if (!skipP1 && initialV.length > ctx.orbitFloor) {
			if (PeriodSolver.DEBUG) process.stderr.write(`  torusFill: seed core ${initialV.length} vertex classes > floor ${ctx.orbitFloor} → reject\n`);
			return [];
		}

		const results: Polygon[][] = [];
		const seenState = new Set<string>();
		const stack: { reps: Polygon[]; block: Polygon[]; vReps: Cyclotomic[] }[] = [{ reps: initial, block: initialBlock, vReps: initialV }];
		let pops = 0;
		const t0 = PeriodSolver.DEBUG ? Date.now() : 0;

		while (stack.length > 0) {
			if (timedOut()) break;
			const { reps, block, vReps } = stack.pop()!;
			const stateKey = this.stateKey(reps);
			if (seenState.has(stateKey)) continue;
			seenState.add(stateKey);
			pops++;
			if (reps.length > ctx.maxCellPolys) continue;

			const analysis = this.analyze(reps, ctx, block);
			if (analysis.contradiction) continue;
			if (!analysis.openVertex) {
				// No open vertex within a full cell ⇒ torus closed. Certify, and reject supercells (a
				// non-primitive Λ tiles the SAME tiling as its primitive sublattice — counting both
				// would over-count). Sound PROVIDED stage 6 enumerated the primitive Λ as its own
				// candidate — unconditional under cor:box, guarded LOUDLY here under any tuned pool
				// (CB-7: `isPrimitive` checks the closure lattice against ctx.candidateKeys; log-only).
				if (this.isCompleteTiling(reps, ctx) && this.isPrimitive(reps, ctx, memo, diag)) results.push(reps);
				continue;
			}

			// Corner-complete the chosen open vertex: place one polygon into its CW-most gap.
			const { vertex: w, intervals } = analysis.openVertex;
			const d0 = this.gapStartRay(intervals, ctx.N);
			if (d0 < 0) continue; // no fillable gap (shouldn't happen for an open vertex)
			const repsKeys = new Set(reps.map((r) => r.exactKey())); // reps are canonical class reps

			// Candidate corners for the CW-most gap: every regular n-gon (a corner of interior `regular(n)`)
			// AND — C3 — every star variant seating its POINT (interior α). Each is placed with a corner at
			// `w` and outgoing edge `d0`, covering [d0, d0+interior]; the post-placement overlap + the
			// downstream `analyze` (over-fill / VC) reject the ones that do not fit.
			const place = (P: Polygon) => {
				if (this.properOverlapWithBlock(P, block, ctx)) return;
				// The new tile reduces to ONE canonical lattice-class rep. If already present the branch
				// makes no progress (matches the old dedupModLattice length check). The child's block =
				// this block + the new rep's lattice translates — disjoint classes, so a plain set union;
				// no full rebuild (audit perf C1). Block order is irrelevant to every consumer.
				const pc = this.canonicalRep(P, ctx, memo);
				if (repsKeys.has(pc.key)) return; // P already present mod Λ ⇒ no progress
				const next = [...reps, pc.poly];
				if (next.length > ctx.maxCellPolys) return;
				const childV = extendV(vReps, pc.poly);
				if (!skipP1 && childV.length > ctx.orbitFloor) { diag.p1Pruned++; return; } // P1 orbit-floor prune
				const childBlock = block.concat(this.buildBlock([pc.poly], ctx, 5));
				stack.push({ reps: next, block: childBlock, vReps: childV });
			};

			for (const n of ctx.polySizes) place(RegularPolygon.fromAnchorAndDirExact(n, w, d0));
			// C3: seat each seed star's POINT (the convex corner, interior α) into the gap. Dent-seating
			// (the Fig-3 dent-at-vertex class) is NOT yet attempted — flagged loudly below.
			for (const st of ctx.starTiles) place(ExactStarPolygon.isotoxal(st.n, st.alphaU, w, d0));
		}
		if (PeriodSolver.DEBUG) process.stderr.write(`  fill det=${ctx.det.toFixed(2)} minLen=${ctx.minLen.toFixed(2)} cap=${ctx.maxCellPolys} pops=${pops} results=${results.length} ${Date.now() - t0}ms\n`);
		return results;
	}

	// ---------------------------------------------------------------------------
	// Block analysis (find an open vertex / detect contradiction)
	// ---------------------------------------------------------------------------

	/** Analyse the current cell's local geometry: build a small planar block (the cell + its lattice
	 *  neighbours), then classify every vertex within one cell of the origin as surrounded (with an
	 *  allowed VC), open, or contradictory. Returns the nearest-origin open vertex (with its covered
	 *  angular intervals) or, if none, signals torus-closed (unless a contradiction was found). */
	private analyze(reps: Polygon[], ctx: FillCtx, prebuilt?: Polygon[]): AnalyzeResult {
		const judgeR = ctx.cellDiam + 0.5;
		// Inclusion radius cellDiam+7 (Rabs=5): vertex incidence within judgeR needs ≤ cellDiam+2.43, the
		// open-vertex overlap check needs ≤ cellDiam+4.93 — both covered, with the final certification
		// block (larger) as the safety net. Much cheaper than the old 2·cellDiam+6.
		const block = prebuilt ?? this.buildBlock(reps, ctx, 5);

		// vertex incidence keyed by exact vertex key. Only tiles whose centroid is within
		// judgeR + maxCircum can have a vertex within judgeR, so the rest are culled from the incidence
		// map (audit perf C2). Sound: a tile all of whose vertices are > judgeR is never judged here, and
		// the FULL `block` is still returned for the wider overlap check below.
		const incR = judgeR + ctx.maxCircum + 0.01;
		const inc = new Map<string, { v: Cyclotomic; polys: { p: Polygon; idx: number }[] }>();
		for (const p of block) {
			const cf = p.exactCentroid!.toVector();
			if (Math.hypot(cf.x, cf.y) > incR) continue;
			const verts = p.exactVertices!;
			for (let i = 0; i < verts.length; i++) {
				const kk = verts[i].key();
				let e = inc.get(kk);
				if (!e) { e = { v: verts[i], polys: [] }; inc.set(kk, e); }
				e.polys.push({ p, idx: i });
			}
		}

		let best: { vertex: Cyclotomic; intervals: Interval[]; dist: number } | null = null;
		for (const { v, polys } of inc.values()) {
			const vf = v.toVector();
			const dist = Math.hypot(vf.x, vf.y);
			if (dist > judgeR) continue;
			const intervals = this.coveredIntervals(v, polys, ctx.N);
			const totalUnits = intervals.reduce((s, it) => s + it.units, 0);
			if (totalUnits > ctx.N + 0.5) return { contradiction: true }; // angular over-fill (overlap)
			if (Math.abs(totalUnits - ctx.N) < 0.5) {
				// surrounded at 2π. A2: classify by distinct incident-tile count t. A 2-tile point is a
				// forced dent-fill (Myers non-vertex): legal — NOT a vertex, NOT a contradiction. Only a
				// ≥3-tile point is a real VC that must be allowed. (Regular path: t≥3 always ⇒ inert.)
				const t = new Set(polys.map(({ p }) => p.exactKey())).size;
				if (t < 3) continue; // legal dent-fill
				const name = canonicalVCName(this.vcRingNames(v, polys));
				if (!ctx.allowed.has(name)) return { contradiction: true };
				continue;
			}
			// open
			if (!best || dist < best.dist) best = { vertex: v, intervals, dist };
		}

		if (best) return { contradiction: false, openVertex: { vertex: best.vertex, intervals: best.intervals }, block };
		return { contradiction: false, block };
	}

	/** Covered angular intervals at vertex `v` from the incident polygons. Each regular n-gon covers
	 *  the CCW arc [dOut, dOut+interior] where dOut is the direction of its edge v→next. */
	private coveredIntervals(v: Cyclotomic, polys: { p: Polygon; idx: number }[], N: number): Interval[] {
		const intervals: Interval[] = [];
		for (const { p, idx } of polys) {
			const dOut = p.edgeDirs![idx]; // v → next vertex (the corner at vertex `idx`)
			const units = p.cornerAngleUnits(idx); // corner-aware (reflex-safe); = N(p.n−2)/(2p.n) for regular
			intervals.push({ start: ((dOut % N) + N) % N, units, n: p.n });
		}
		return intervals;
	}

	/** The CW boundary ray of an uncovered gap: a ray r that ends a covered interval (= some
	 *  interval's start+units) but does NOT start another interval. Placing a polygon with dOut=r
	 *  fills the gap from its clockwise edge. Returns the smallest such ray, or -1 if none. */
	private gapStartRay(intervals: Interval[], N: number): number {
		const starts = new Set<number>(intervals.map((it) => it.start));
		const ends = intervals.map((it) => Math.round((it.start + it.units) % N));
		let bestRay = -1;
		for (const e of ends) {
			const r = ((e % N) + N) % N;
			if (!starts.has(r)) {
				if (bestRay < 0 || r < bestRay) bestRay = r;
			}
		}
		return bestRay;
	}

	/** Ring-ordered corner tokens around vertex `v` (CCW by edge direction) — for the VC name. Regular
	 *  corners yield the bare `n` token (byte-identical); star corners yield point/dent tokens. */
	private vcRingNames(v: Cyclotomic, polys: { p: Polygon; idx: number }[], N = polys[0].p.ring!.N): string[] {
		const sorted = polys
			.map(({ p, idx }) => ({ token: p.cornerToken(idx), start: ((p.edgeDirs![idx] % N) + N) % N }))
			.sort((a, b) => a.start - b.start);
		return sorted.map((s) => s.token);
	}

	// ---------------------------------------------------------------------------
	// Completeness certificate
	// ---------------------------------------------------------------------------

	/** ADDITIVE (M2, lem:ddrealizer step 6): run the lem:corona certificate on an EXTERNALLY
	 *  constructed cell (the D-D realizer's Λ-quotient). Zero behaviour change to the torus path —
	 *  this only wraps makeCtx + isCompleteTiling for a caller that already holds a PeriodCell.
	 *  Soundness is the certificate's own (independent of how the cell was produced): an accept
	 *  means the Λ-periodic extension is a valid edge-to-edge tiling with only allowed VCs. */
	certifyExternalCell(cell: PeriodCell, allowed: Set<string>, polySizes: number[]): boolean {
		const ring = cell.basisExact[0].ring;
		const ctx = this.makeCtx(cell.basisExact[0], cell.basisExact[1], ring, allowed, polySizes, Number.MAX_SAFE_INTEGER);
		if (!ctx) return false;
		return this.isCompleteTiling(cell.cellPolygons, ctx);
	}

	/** Exact gap-free certificate for a closed torus tiling (cell `reps` + lattice in ctx):
	 *  (a) no proper overlap in a block, (b) every vertex within one cell of the origin is fully
	 *  surrounded (2π) with an allowed VC, and (c) total cell area = |det Λ| (gap-free area check).
	 *  All three ⇒ the Λ-periodic extension is a valid edge-to-edge tiling with only allowed VCs. */
	isCompleteTiling(reps: Polygon[], ctx: FillCtx): boolean {
		// (c) area: cell polygons must exactly cover one fundamental domain. CB-1: the DECISION is the
		// exact Surd comparison Σ tileAreaSurdFor(p) == |det Λ| (thesis leg (c): "equals |det Λ| exactly");
		// the float sum is kept as a broadphase PRE-REJECT only. Soundness of the broadphase: float error
		// is ≲1e-10 over ≤10³ tiles, so exact-equal cells always pass it (it can only reject cells the
		// exact test would also reject). Star-aware in both layers (exact shoelace = the tile's TRUE area,
		// not regularArea(n) — which would reject the valid 4(j) cell).
		const area = reps.reduce((s, p) => s + tileAreaFloatFor(p), 0);
		if (Math.abs(area - ctx.cellArea) > 1e-4 * Math.max(1, ctx.cellArea)) return false;
		let areaSurd = Surd.ZERO;
		for (const p of reps) areaSurd = areaSurd.add(tileAreaSurdFor(p));
		if (areaSurd.cmp(ctx.cellAreaSurd) !== 0) return false;

		const block = this.buildBlock(reps, ctx, ctx.cellDiam + 8);
		// (a) no proper overlap.
		if (this.blockHasProperOverlap(block, ctx)) return false;

		// (b) every vertex within one cell is a fully-surrounded allowed VC.
		const judgeR = ctx.cellDiam + 0.5;
		const inc = new Map<string, { v: Cyclotomic; polys: { p: Polygon; idx: number }[] }>();
		for (const p of block) {
			const verts = p.exactVertices!;
			for (let i = 0; i < verts.length; i++) {
				const kk = verts[i].key();
				let e = inc.get(kk);
				if (!e) { e = { v: verts[i], polys: [] }; inc.set(kk, e); }
				e.polys.push({ p, idx: i });
			}
		}
		let judged = 0;
		for (const { v, polys } of inc.values()) {
			const vf = v.toVector();
			if (Math.hypot(vf.x, vf.y) > judgeR) continue;
			judged++;
			const intervals = this.coveredIntervals(v, polys, ctx.N);
			const totalUnits = intervals.reduce((s, it) => s + it.units, 0);
			if (Math.abs(totalUnits - ctx.N) > 0.5) return false; // not surrounded (gap) or over-full
			// A2: a 2-tile point at 2π is a legal dent-fill (Myers non-vertex), not a counted VC — accept
			// it without requiring an allowed-VC name. (Regular path: t≥3 always ⇒ this never fires.)
			const t = new Set(polys.map(({ p }) => p.exactKey())).size;
			if (t < 3) continue;
			const name = canonicalVCName(this.vcRingNames(v, polys));
			if (!ctx.allowed.has(name)) return false;
		}
		return judged > 0;
	}

	// ---------------------------------------------------------------------------
	// Lattice reduction & block geometry (exact identity, float broadphase)
	// ---------------------------------------------------------------------------

	/** Reduce a polygon into the fundamental cell around the origin by subtracting the integer combo
	 *  m·u+n·v nearest its centroid. Exact: Λ-translates collapse to the same exact key (m,n shift by
	 *  the exact integer between them, so the subtracted translation differs by exactly that lattice
	 *  vector and the reduced polygon is identical). The float solve only picks the integers m,n. */
	private reducePolygon(p: Polygon, ctx: FillCtx): Polygon {
		const c = p.exactCentroid!.toVector();
		const a = (c.x * ctx.vV.y - c.y * ctx.vV.x) / ctx.det;
		const b = (ctx.uV.x * c.y - ctx.uV.y * c.x) / ctx.det;
		const ma = Math.round(a);
		const mb = Math.round(b);
		if (ma === 0 && mb === 0) return p;
		const T = ctx.u.scaleRational(BigInt(-ma), 1n).add(ctx.v.scaleRational(BigInt(-mb), 1n));
		const q = p.clone();
		q.translateExact(T);
		return q;
	}

	/** Total tile area of `core` reduced to ONE fundamental domain (distinct lattice-classes mod Λ).
	 *  When this exceeds the cell area |det Λ|, the core cannot fit a single cell, so `torusFill` would
	 *  area-reject it (the t2014 case) — the signal to seed from the single-VC fans instead. */
	private footprintArea(core: Polygon[], ctx: FillCtx): number {
		const reps = this.dedupModLattice(core, ctx, new Map());
		let area = 0;
		for (const p of reps) area += tileAreaFloatFor(p);
		return area;
	}

	/** Dedup polygons into one CANONICAL representative per lattice class. The canonical rep is the
	 *  lexicographically smallest exact key among the class's lattice translates lying near the origin
	 *  — a choice that is identical for every member of a class (the near-origin translate SET is the
	 *  same for p and p+λ), so it is immune to the half-integer-boundary rounding that splits a class
	 *  when each polygon is reduced independently. Memoized by exact key (per torusFill). */
	private dedupModLattice(polys: Polygon[], ctx: FillCtx, memo: Map<string, { key: string; poly: Polygon }>): Polygon[] {
		const seen = new Set<string>();
		const out: Polygon[] = [];
		for (const p of polys) {
			const { key, poly } = this.canonicalRep(p, ctx, memo);
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(poly);
		}
		return out;
	}

	/** True iff the lattice is the PRIMITIVE period of the completed cell-tiling — i.e. no smaller
	 *  translation maps it onto itself. A supercell (n× the primitive) is the same infinite tiling and
	 *  would be double-counted. Rejecting it here loses no tiling PROVIDED stage 6 enumerated the
	 *  primitive lattice as its own (smaller) candidate — unconditional under the proven box
	 *  (cor:box), NOT guaranteed under a tuned pool: the pool is bounded by edge-STEP count, which is
	 *  not monotone under sublattice (the primitive basis is Euclidean-shorter but can need MORE
	 *  steps; ℤ[ζ₂₄] is dense, so length never bounds steps — CLAUDE.md settled decision). The CB-7
	 *  guard below therefore closes Λ under the rejection witnesses and reports LOUDLY when the
	 *  primitive lattice is absent from the candidate set — log-only, the rejection is unchanged.
	 *  Test: any same-name rep-pair difference t that maps every class onto a class is a sub-lattice
	 *  period ⇒ non-primitive. */
	private isPrimitive(reps: Polygon[], ctx: FillCtx, memo: Map<string, { key: string; poly: Polygon }>, diag: PeriodSolverDiag): boolean {
		if (reps.length <= 1) return true;
		const repKeys = new Set(reps.map((r) => r.exactKey())); // reps are canonical
		// Collect ALL witness translations (not just the first): the primitive lattice is the closure
		// of Λ under every witness, so the guard needs the full set. Same accept/reject decision as the
		// historical first-witness early-return (a witness exists ⇔ non-primitive); the extra scan runs
		// only on the rare rejection path.
		let witnesses: Cyclotomic[] | null = null;
		for (let i = 0; i < reps.length; i++) {
			for (let j = 0; j < reps.length; j++) {
				if (i === j || reps[i].getName() !== reps[j].getName()) continue;
				const t = reps[j].exactCentroid!.sub(reps[i].exactCentroid!);
				if (t.isZero()) continue;
				let all = true;
				for (const r of reps) {
					const rt = r.clone();
					rt.translateExact(t);
					if (!repKeys.has(this.canonicalRep(rt, ctx, memo).key)) { all = false; break; }
				}
				if (all) (witnesses ??= []).push(t); // sub-lattice translation t (∉ Λ, distinct classes) ⇒ non-primitive
			}
		}
		if (witnesses === null) return true;
		this.supercellRejectionGuard(ctx, witnesses, diag); // CB-7: diagnostics only — never changes the verdict
		return false;
	}

	/** CB-7 primitivity-rejection guard (diagnostics ONLY — the supercell stays rejected either way).
	 *  The discard at the accept path is sound iff the certified tiling is re-found: its PRIMITIVE
	 *  lattice Λ′ = ⟨Λ ∪ witnesses⟩ (the full translation group of the cell-tiling) must itself be
	 *  enumerated. Under cor:box that is a theorem; under the tuned pool it is unchecked — so compute
	 *  Λ′ and check membership of the LATTICE in the seed's enumerated candidate set via
	 *  `latticeKeySet` (every key Λ′ can canonicalize to — `latticeKey` alone is ambiguous on tied
	 *  minima, see there). Pre-P0 universe on purpose (a P0-skipped primitive is a licensed discard —
	 *  see `candidateLattices`). Two provably-harmless miss classes are filtered before alarming:
	 *  (1) candidate-set hit (any canonical key); (2) primitive area outside the seed's admissible
	 *  area set — then the tiling cannot carry this seed's orbit-VC multiset (the area filter's own
	 *  Euler/incidence completeness contract) and is another seed's tiling (observed live: pure-
	 *  triangle 1-uniform supercell completions inside multi-VC k=2 seeds). Anything else is a
	 *  certified tiling discarded with no candidate to re-find it — the silent-loss mode CB-7 exists
	 *  to surface; emit ⚑ INCOMPLETE-REGION per occurrence. The k≤3 oracle says this never fired
	 *  there; it firing ANYWHERE is a discovery. */
	private supercellRejectionGuard(ctx: FillCtx, witnesses: Cyclotomic[], diag: PeriodSolverDiag): void {
		diag.supercellRejected++;
		const closure = primitiveLatticeClosure(ctx.u, ctx.v, witnesses);
		if (closure !== null) {
			for (const k of latticeKeySet(closure[0], closure[1])) {
				if (ctx.candidateKeys.has(k)) return; // primitive lattice IS a candidate — sound discard
			}
			// Primitive area not admissible for THIS seed ⇒ the discarded tiling cannot realize the
			// seed's VC multiset on its primitive cell ⇒ it is enumerated from its own (sub)seed, not
			// owed by this one — sound discard, no alarm. (Suppression can never hide a real loss: a
			// tiling WITH this seed's orbit multiset has its primitive area in the set by the same
			// contract that licenses the candidate area filter — Finding-2, SIGNED OFF by the TA
			// 2026-06-10 for the regular family. Two riders from that sign-off: (1) the suppression is
			// conditional on area-filter CORRECTNESS — it conditions on the same code-computed set the
			// candidate stage filters by, so it cannot catch a vcAreaSet implementation bug; the class
			// is therefore COUNTED, a jump is an anomaly signal. (2) If the star area ladder truncated,
			// the set is known-UNDER-generated and the suppression is unlicensed — fall through to the
			// unconditional alarm.)
			if (!diag.starLadderTruncated && !ctx.admissibleAreaKeys.has(areaKey(detSurd(closure[0], closure[1]).abs()))) {
				diag.primitivityGuardAreaSuppressed++;
				return;
			}
		}
		diag.primitivityGuardMisses++;
		const pk = closure === null ? null : latticeKey(closure[0], closure[1]);
		process.stderr.write(
			`[PeriodSolver k=${this.k}] ⚑ INCOMPLETE-REGION (primitivity-rejection): certified supercell discarded; ` +
			`primitive lattice ${pk ?? '<witness join failed>'} not in candidate list ` +
			`(supercell ${latticeKey(ctx.u, ctx.v)}, ${witnesses.length} witness(es))\n`
		);
	}

	/** Canonical lattice-class representative: lex-min exact key among the class's lattice translates
	 *  whose centroid lies within ~1.5 cells of the origin (the same set for every class member). */
	private canonicalRep(p: Polygon, ctx: FillCtx, memo: Map<string, { key: string; poly: Polygon }>): { key: string; poly: Polygon } {
		const baseKey = p.exactKey();
		const cached = memo.get(baseKey);
		if (cached) return cached;
		const r0 = this.reducePolygon(p, ctx); // centroid into the fundamental cell
		let bestPoly = r0;
		let bestKey = r0.exactKey();
		const lim = 1.5 * ctx.cellDiam + 0.1;
		for (let i = -2; i <= 2; i++) {
			for (let j = -2; j <= 2; j++) {
				if (i === 0 && j === 0) continue;
				const T = ctx.u.scaleRational(BigInt(i), 1n).add(ctx.v.scaleRational(BigInt(j), 1n));
				const q = r0.clone();
				q.translateExact(T);
				const cf = q.exactCentroid!.toVector();
				if (Math.hypot(cf.x, cf.y) > lim) continue;
				const kq = q.exactKey();
				if (kq < bestKey) { bestKey = kq; bestPoly = q; }
			}
		}
		const res = { key: bestKey, poly: bestPoly };
		memo.set(baseKey, res);
		memo.set(bestKey, res);
		return res;
	}

	/** Canonical state key for the DAG dedup: the sorted reduced exact keys of the cell. */
	private stateKey(reps: Polygon[]): string {
		return reps.map((p) => p.exactKey()).sort().join('|');
	}

	/** Materialise the cell + its lattice neighbours within absolute radius `Rabs` of the origin.
	 *  The (m,n) ranges are the TIGHT bounds for "m·u+n·v within `limit`" (perpendicular-distance
	 *  formula), not a loose minLen box — so large/anisotropic cells don't iterate an empty M² grid. */
	private buildBlock(reps: Polygon[], ctx: FillCtx, Rabs: number): Polygon[] {
		const out: Polygon[] = [];
		const seen = new Set<string>();
		const limit = Rabs + ctx.cellDiam + 2;
		const lu = Math.hypot(ctx.uV.x, ctx.uV.y);
		const lv = Math.hypot(ctx.vV.x, ctx.vV.y);
		const area = Math.abs(ctx.det);
		// The clamp is NOT a silent knob: makeCtx asserts per candidate (worst call site) that it
		// cannot bind, and flags ⚑ INCOMPLETE-REGION + diag.blockIndexCapTruncated when it would
		// (lem:fillreach F3b).
		const Mm = Math.min(BLOCK_INDEX_CAP, Math.ceil((limit * lv) / area) + 1);
		const Mn = Math.min(BLOCK_INDEX_CAP, Math.ceil((limit * lu) / area) + 1);
		for (let m = -Mm; m <= Mm; m++) {
			for (let n = -Mn; n <= Mn; n++) {
				// cheap centroid-of-cell range check before the exact translate
				const tx = m * ctx.uV.x + n * ctx.vV.x;
				const ty = m * ctx.uV.y + n * ctx.vV.y;
				if (Math.hypot(tx, ty) > limit + ctx.cellDiam) continue;
				const T = m === 0 && n === 0
					? null
					: ctx.u.scaleRational(BigInt(m), 1n).add(ctx.v.scaleRational(BigInt(n), 1n));
				for (const rep of reps) {
					let q: Polygon;
					if (T === null) {
						q = rep;
					} else {
						q = rep.clone();
						q.translateExact(T);
					}
					const cf = q.exactCentroid!.toVector();
					if (Math.hypot(cf.x, cf.y) > limit) continue;
					const key = q.exactKey();
					if (seen.has(key)) continue;
					seen.add(key);
					out.push(q);
				}
			}
		}
		return out;
	}

	/** True iff some new polygon `P` properly overlaps a tile in the (prebuilt) block.
	 *  Edge-adjacency and exact coincidence are NOT overlaps (matches the planar expander). */
	private properOverlapWithBlock(P: Polygon, block: Polygon[], ctx: FillCtx): boolean {
		const pc = P.exactCentroid!.toVector();
		const pBox = bbox(P);
		const pKey = P.exactKey();
		for (const q of block) {
			if (q.exactKey() === pKey) continue;
			const qc = q.exactCentroid!.toVector();
			if (Math.hypot(pc.x - qc.x, pc.y - qc.y) > 2.5) continue; // tiles ≥ this far apart can't overlap
			if (!bboxOverlap(pBox, bbox(q))) continue;
			if (!P.isEquivalent(q) && P.intersects(q)) return true;
		}
		return false;
	}

	/** Cheap necessary self-overlap test: does any rep properly overlap one of its 8 nearest lattice
	 *  translates (±u, ±v, ±(u±v))? If so Λ is too small to be a real period. A strict subset of
	 *  blockHasProperOverlap, so rejecting here only removes candidates the full block check would also
	 *  reject — the emitted tilings (and the digest) are unchanged (audit perf C3). */
	private coreSelfOverlapsNearest(reps: Polygon[], ctx: FillCtx): boolean {
		const u = ctx.u, v = ctx.v;
		const nu = u.scaleRational(-1n, 1n), nv = v.scaleRational(-1n, 1n);
		const Ts = [u, nu, v, nv, u.add(v), nu.add(nv), u.add(nv), nu.add(v)];
		for (const rep of reps) {
			const rb = bbox(rep);
			for (const T of Ts) {
				const q = rep.clone();
				q.translateExact(T);
				if (!bboxOverlap(rb, bbox(q))) continue;
				if (!rep.isEquivalent(q) && rep.intersects(q)) return true;
			}
		}
		return false;
	}

	/** True iff two distinct (non-coincident) tiles in the block properly overlap. */
	private blockHasProperOverlap(block: Polygon[], _ctx: FillCtx): boolean {
		const boxes = block.map((p) => bbox(p));
		for (let i = 0; i < block.length; i++) {
			for (let j = i + 1; j < block.length; j++) {
				if (!bboxOverlap(boxes[i], boxes[j])) continue;
				if (!block[i].isEquivalent(block[j]) && block[i].intersects(block[j])) return true;
			}
		}
		return false;
	}

	/** Canonical (mirror-merged) VC name at a vertex from the polygons touching it (angular order).
	 *  Corner token via the shared-vertex index, so star point/dent corners name distinctly while regular
	 *  corners stay byte-identical. Builds the allowed-VC set ⇒ must use the SAME `cornerToken` as the
	 *  tested vertices (`vcRingNames`). */
	private vcNameAt(vertex: Cyclotomic, polys: Polygon[]): string {
		const vf = vertex.toVector();
		const vk = vertex.key();
		const withAngle = polys.map((p) => ({
			token: p.cornerToken(p.vertexKeyIndex().get(vk)!),
			a: Math.atan2(p.centroid.y - vf.y, p.centroid.x - vf.x),
		}));
		withAngle.sort((x, y) => x.a - y.a);
		return canonicalVCName(withAngle.map((w) => w.token));
	}
}

// --- internal types ---

type FillCtx = {
	u: Cyclotomic;
	v: Cyclotomic;
	ring: Cyclotomic['ring'];
	N: number;
	allowed: Set<string>;
	polySizes: number[];
	maxCellPolys: number;
	uV: { x: number; y: number };
	vV: { x: number; y: number };
	det: number;
	cellDiam: number;
	minLen: number;
	cellArea: number;
	cellAreaSurd: Surd; // CB-1: exact |det Λ| — the certificate's area leg decides on this, not the float
	maxCircum: number; // max tile circumradius — a poly beyond judgeR+this has no vertex within judgeR
	orbitFloor: number; // k·hol(Λ): P1 prunes a partial fill whose vertex-class count exceeds this
	starTiles: { n: number; alphaU: number }[]; // C3 star palette: (n,α) variants the fill loop may seat
	candidateKeys: Set<string>; // ALL enumerated candidate lattice keys (pre-P0) — CB-7 guard universe
	admissibleAreaKeys: Set<string>; // admissible cell-area keys (the seed's area ladder) — CB-7 guard
	blockIndexCapBinds: boolean; // F3b (lem:fillreach): buildBlock's index cap WOULD bind for this lattice ⇒ blocks may be under-built ⇒ results for this candidate are not completeness-grade (⚑ emitted at makeCtx, counted in diag by solve)
};

type Interval = { start: number; units: number; n: number };

type AnalyzeResult = {
	contradiction: boolean;
	openVertex?: { vertex: Cyclotomic; intervals: Interval[] };
	block?: Polygon[];
};

function emptyDiag(): PeriodSolverDiag {
	return { candidateLattices: 0, latticesTried: 0, rawCells: 0, emitted: 0, gateRejected: 0, fanLattices: 0, p0Skipped: 0, p1Pruned: 0, seedStateDedup: 0, obliqueCandidates: 0, obliqueTruncated: null, supercellRejected: 0, primitivityGuardMisses: 0, primitivityGuardAreaSuppressed: 0, starLadderTruncated: false, blockIndexCapTruncated: 0, timedOut: false };
}

/**
 * Exact basis of the PRIMITIVE lattice Λ′ = ⟨Λ ∪ witnesses⟩, where Λ = ℤu + ℤv and each witness t
 * maps the certified cell-tiling onto itself (so t permutes the finitely many tile classes mod Λ ⇒
 * q·t ∈ Λ for some integer q ⇒ t has RATIONAL (u,v)-coordinates and every join is a finite-index
 * superlattice — discreteness is never in doubt). Folds `joinLattice` (exact HNF) over the
 * witnesses; order-independent (the generated lattice is). Returns null only if a witness is not a
 * rational combination of (u, v) — impossible for a true witness, kept as a defensive signal.
 * Exported for the CB-7 guard and its unit tests.
 */
export function primitiveLatticeClosure(u: Cyclotomic, v: Cyclotomic, witnesses: Cyclotomic[]): [Cyclotomic, Cyclotomic] | null {
	let a = u, b = v;
	for (const t of witnesses) {
		if (isIntCombo(t, a, b)) continue; // already inside the current (possibly enlarged) lattice
		const j = joinLattice(a, b, t);
		if (j === null) return null; // not in the ℚ-span / irrational coords — defensive, see docstring
		[a, b] = j;
	}
	return [a, b];
}

/** One canonical `latticeKey` of the witness closure (for logs/tests). ⚑ NOT unique per lattice on
 *  tied minima — membership checks must use `latticeKeySet`, never a single-key comparison. */
export function primitiveLatticeKey(u: Cyclotomic, v: Cyclotomic, witnesses: Cyclotomic[]): string | null {
	const c = primitiveLatticeClosure(u, v, witnesses);
	return c === null ? null : latticeKey(c[0], c[1]);
}

/**
 * EVERY `latticeKey` the lattice ⟨a, b⟩ can canonicalize to. `latticeKey` Gauss-reduces its input,
 * and Gaussian reduction is canonical only up to TIES in the successive minima: a hexagonal lattice
 * has 3 shortest directions (any 2 form a reduced basis), a rhombic/cmm lattice has tied second
 * minima (|v| = |v−u|) — so the SAME lattice can carry distinct keys depending on the input basis.
 * Observed live (2026-06-10, CB-7 bring-up): the honeycomb primitive lattice keys differently as the
 * `roundCells` candidate `(v, v·ω)` than as the supercell witness closure — a single-key membership
 * test false-fires there. Enumeration is exhaustive: every Gauss-reduced basis consists of vectors
 * of length λ₁/λ₂, and every lattice vector of length ≤ λ₂ has coordinates in {0,±1}² over any one
 * reduced basis (r₁, r₂) — so every reduced pair lies, with signs, in {±r₁, ±r₂, ±(r₁+r₂), ±(r₁−r₂)}.
 * `gaussReduceExact` is a fixed point on its own outputs, so keying every same-covolume ordered
 * signed pair from that set reproduces the key of EVERY reduced pair — in particular the one a
 * candidate was stored under. Exact membership (det compared as Surd); ≤ 56 cheap pair checks, only
 * on the rare supercell-rejection path.
 */
export function latticeKeySet(a: Cyclotomic, b: Cyclotomic): Set<string> {
	const [r1, r2] = gaussReduceExact(a, b);
	const dirs = [r1, r2, r1.add(r2), r1.sub(r2)];
	const vecs = dirs.flatMap((d) => [d, d.neg()]);
	const cov = detSurd(r1, r2).abs();
	const keys = new Set<string>();
	for (const x of vecs) {
		for (const y of vecs) {
			if (x === y) continue;
			if (detSurd(x, y).abs().cmp(cov) !== 0) continue; // 0 (parallel) or a proper sublattice ⇒ not a basis of ⟨a,b⟩
			keys.add(latticeKey(x, y));
		}
	}
	return keys;
}

/** Exact test: a − b ∈ Λ = ℤu + ℤv. The integer combo is guessed by a float solve, then verified
 *  EXACTLY (`diff.sub(recon).isZero()`) — never a false positive; false negatives are excluded for
 *  real periods (minLen ≥ 0.9, so the solve is well-conditioned). Used to count vertex classes. */
function latticeEquivExact(a: Cyclotomic, b: Cyclotomic, u: Cyclotomic, v: Cyclotomic): boolean {
	const diff = a.sub(b);
	if (diff.isZero()) return true;
	const d = diff.toVector(), au = u.toVector(), av = v.toVector();
	const det = au.x * av.y - au.y * av.x;
	if (Math.abs(det) < FLOAT_TOL) return false;
	const m = (d.x * av.y - d.y * av.x) / det;
	const n = (au.x * d.y - au.y * d.x) / det;
	const mi = Math.round(m), ni = Math.round(n);
	if (Math.abs(m - mi) > 1e-3 || Math.abs(n - ni) > 1e-3) return false;
	return diff.sub(u.scaleRational(BigInt(mi), 1n).add(v.scaleRational(BigInt(ni), 1n))).isZero();
}

/**
 * The torus vertex count V = number of distinct vertex classes mod Λ among the cell polygons `reps`
 * (= Σ_n t_n·(n−2)/2 by Euler). NOT the orbit count: V counts translation classes, the gate counts
 * orbits under the full point group, with orbits ≥ V/hol(Λ). V grows monotonically as the torus fill
 * adds tiles, so it lower-bounds the final V — the basis of the **P1 orbit-floor prune**
 * (`route-a-proven-box.md` §"Early-prune rulings"): a partial fill with V > k·hol(Λ) can only complete
 * to a tiling with orbits > k (gate-rejected) or to a supercell (primitivity-rejected; re-found at its
 * primitive sublattice unconditionally under cor:box, guarded loudly under the tuned pool — CB-7).
 * Exact, via `latticeEquivExact` (O(V²); V is bounded by the floor when pruning).
 */
export function vertexClassCount(reps: Polygon[], u: Cyclotomic, v: Cyclotomic): number {
	const vReps: Cyclotomic[] = [];
	for (const p of reps) {
		for (const w of p.exactVertices!) {
			if (!vReps.some((r) => latticeEquivExact(w, r, u, v))) vReps.push(w);
		}
	}
	return vReps.length;
}

function bbox(p: Polygon): { minX: number; maxX: number; minY: number; maxY: number } {
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	for (const v of p.vertices) {
		minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
		minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
	}
	return { minX, maxX, minY, maxY };
}

function bboxOverlap(
	a: { minX: number; maxX: number; minY: number; maxY: number },
	b: { minX: number; maxX: number; minY: number; maxY: number }
): boolean {
	const m = 1e-9;
	return !(a.maxX < b.minX - m || b.maxX < a.minX - m || a.maxY < b.minY - m || b.maxY < a.minY - m);
}
