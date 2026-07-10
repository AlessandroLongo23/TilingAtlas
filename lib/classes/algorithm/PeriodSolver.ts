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
import { trace } from './figureTrace';
import { KUniformityChecker } from './KUniformityChecker';
import { countVertexOrbitsFast } from './KUniformityFast';
// Experimental fast k-uniformity gate (point-group orbit count; proven equivalent to the exact gate
// on all 92 certified k≤3 tilings — tests/kuniformity-fast.test.ts). Off by default ⇒ byte-identical.
const PS_FAST_GATE = process.env.PS_FAST_GATE === '1';
import { TranslationalCellExtractor } from './TranslationalCellExtractor';
import { nativeFill } from './nativeFill';
// TS↔native torusFill bridge (opt-in USE_NATIVE_FILL=1, read per-fill so a harness can A/B in-process):
// ship each regular-polygon fill to the validated native engine (~13× the TS DFS). Emitted cells are
// byte-equivalent; OFF by default ⇒ pure-TS path.
import type { SeedConfigurationLike } from './SeedExpander';
import { LatticeEnumerator, latticeKey, shortVectorPool, edgeStepDirs, gridDirOf, vcAreaSet, vcAreaMinVerts, vcFeasAreaSets, bravaisClassExact, areaLadderFromTiles, holohedry, areaKey, isIntCombo, joinLattice, gaussReduceExact, groupIntoGridOrbits, gridImageBasis, type ObliqueTruncation } from './LatticeEnumerator';
import { detSurd, polygonAreaSurd, tileAreaSurd, Surd } from './exact/Surd';
import { dedupeByCongruence, dedupeByNKey } from './TilingCongruence';
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
	/** SMALLK_PROVEN only: solved cmm/rect long/centering axes accepted up to this length
	 *  WITHOUT pool membership (census bound; SMALLK_W_BOUND.md §4-§5). */
	longAxisMax?: number;
	/** SMALLK_PROVEN only: |det| cap for grid-aligned (rect/cmm, hol ≤ 4) cells = 4k·s_max. */
	gridAreaMax?: number;
	/** SMALLK_PROVEN only: |det| cap for oblique (hol 2) cells = 2k·s_max·2 slack. */
	oblAreaMax?: number;
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
/** SMALLK_PROVEN=1: the k ≤ 3 proof-anchored pool (docs/SMALLK_W_BOUND.md v2, refereed).
 *  Per-branch radii from the small-k weight theorem replace the dead 24k−1 box:
 *  non-rigid generators wt ≤ 2·4k−1 (+ joins, JOIN_DEN_MAX=60 ≥ census index ≤ 28);
 *  round basis pairs within the census shells (|u|² ≤ (2/√3)·12k·s_max); grid-aligned
 *  solved axes accepted by census bound (det ≤ 4k·s_max), NOT by pool membership —
 *  which also removes the CB-8 "ambiguous residual" (ζ-density: length does not bound
 *  steps). s_max = (12+7√3)/12, the max VC corner-share (census L1). */
export const SMALLK_PROVEN_MODE = process.env.SMALLK_PROVEN === '1';
const SMALLK_SMAX = (12 + 7 * Math.sqrt(3)) / 12; // ≈ 2.01036, exact (12+7√3)/12

export function poolConfig(
	k: number,
	aMax: number,
	provenMode: boolean = process.env.PROVEN_POOL === '1'
): { active: PoolBounds; proven: PoolBounds; isTuned: boolean; smallkProven?: boolean } {
	if (SMALLK_PROVEN_MODE) {
		if (k > 3) throw new Error(`SMALLK_PROVEN=1 is proven for k ≤ 3 only (got k=${k}); unset it or use the per-k theorem before extending`);
		const areaBoundF = 24 * k * aMax; // cor:box(ii) reference value for the proven-box report
		const reach = (2 / Math.sqrt(3)) * areaBoundF;
		const proven: PoolBounds = { poolSteps: 24 * k - 1, poolLmax: reach, compactOffMax2: reach, gridShortMax2: reach, areaBoundF };
		const roundArea = 12 * k * SMALLK_SMAX;         // hol 12: n ≤ 12k vertices (L1)
		const gridArea = 4 * k * SMALLK_SMAX;           // hol ≤ 4 (rect/rhombic)
		const oblArea = 2 * k * SMALLK_SMAX;            // hol 2 (oblique)
		const steps = 2 * 4 * k - 1;                    // 7 / 15 / 23 (≥ census shell wt 6/8/10)
		const active: PoolBounds = {
			poolSteps: steps,
			// VACUOUS on purpose (workorder smallk-proven-pool-workorder-2026-07-10.md task 1):
			// the generator pool is ALL of W(steps) — any steps-walk has |v| ≤ steps < the doc's
			// (2/√3)·A norm cap, so a Euclidean truncation could only LOSE generators (an earlier
			// draft used Lmax ≈ 11 via an unwritten grid-axis lemma; cor:box(iv) needs no lemma).
			// Round/grid sub-pools stay small via compactOffMax2/gridShortMax2 below; the oblique
			// pair sweep is kept sub-quadratic by its internal A_adm sub-pool cap + oblAreaMax.
			poolLmax: steps + 0.01,
			longAxisMax: gridArea + 0.1,                 // rect long = det/short ≤ det; cmm centering ≤ same
			gridAreaMax: gridArea + 0.05,
			oblAreaMax: oblArea + 0.05,
			compactOffMax2: (2 / Math.sqrt(3)) * roundArea + 0.5,
			gridShortMax2: gridArea + 0.2,               // short² ≤ short·long = det ≤ gridArea
			areaBoundF: roundArea + 0.05,                // global coarse cap = the census round max
		};
		// Invariant (proved in the wiring note): within these boxes blockIndexRangeNeeded ≤ 60
		// = BLOCK_INDEX_CAP (worst rect: ceil((2·24.13+10)/1)+1 = 60, not >60), so the F3b cap
		// can never bind on a census-admissible candidate; makeCtx throws under this mode if it does.
		return { active, proven, isTuned: true, smallkProven: true };
	}
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
	// requiring but its period is outside the tuned pool — see NOTES §36). Widen-only (`Math.max`
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

/** OP-3 stage 1 (lem:orbitdedup): one candidate lattice to FILL, plus the grid point-group maps of
 *  the enumerated orbit members it stands for. `seedMaps` lists, for EVERY enumerated member
 *  Λ_member of the representative's G-orbit (including the rep itself, as the identity FIRST), the
 *  map g = (rot, refl) with g(Λ_rep) = Λ_member — exactly as `groupIntoGridOrbits` records it.
 *  solve() seeds g⁻¹(core) per map, so each deleted member's fill coverage is conserved
 *  (rem:orbitdedup constraint 2). Non-reduced candidates carry exactly the bare identity map. */
type CandidateLattice = { basis: [Cyclotomic, Cyclotomic]; seedMaps: { rot: number; refl: boolean }[] };

/** Seed-free candidate lattices depend only on (ring, tile set, k) — computed once and cached.
 *  `p0Skipped` records how many candidates the P0 pre-filter removed (diagnostic only);
 *  `orbitSkipped` how many oblique candidates the OP-3 grid-orbit reduction deleted (their fill
 *  coverage survives as seed maps on the orbit representatives — see `CandidateLattice`).
 *  `allKeys` is the FULL enumerated candidate key set (pre-P0, pre-reduction) and `areaKeys` the
 *  admissible cell-area key set — both for the CB-7 primitivity guard. */
const candidateCache = new Map<
	string,
	{ lattices: CandidateLattice[]; p0Skipped: number; cSkipped: number; feas: Map<number, Map<string, number[][]>> | null; orbitSkipped: number; obliqueCandidates: number; obliqueTruncated: ObliqueTruncation['cause'] | null; starLadderTruncated: boolean; allKeys: Set<string>; areaKeys: Set<string> }
>();

/** OP-2 instrumentation: candidate-stage cache effectiveness (the Σ-vs-distinct companion data
 *  feeds OP-9; these counters quantify how much enumeration is actually shared across seeds). */
const cacheStats = { candHits: 0, candMisses: 0, poolHits: 0, poolMisses: 0 };
/** Return a point-in-time SNAPSHOT of the cache counters. Callers receive an independent copy;
 *  deltas computed by subtracting two snapshots (before/after a solve call) are safe and correct.
 *  Do not hold a reference expecting it to reflect future increments — call again for a new snapshot. */
export function candidateStageCacheStats(): { candHits: number; candMisses: number; poolHits: number; poolMisses: number } { return { ...cacheStats }; }
/** OP-2 pool sub-cache: `shortVectorPool` already memoizes internally (LatticeEnumerator has a
 *  module-level cache keyed by `${N}:${maxSteps}:${lmaxF}:${dirList}:${monotone}` — so cross-vcSig
 *  pool sharing already happens at that layer, and `edgeStepDirs` is computed BEFORE the outer
 *  lookup so it is NOT skipped on a hit). This outer layer (poolStatsCache) exists solely to attach
 *  the OP-9 poolHits/poolMisses counters at the candidateLattices granularity; an outer hit saves
 *  only the inner key construction + one Map lookup. Cached arrays are NEVER mutated downstream
 *  (filter/map create new arrays) — verified at introduction; keep it that way.
 *  NOTE: poolMisses OVERCOUNTS true recomputation — distinct polySizes sets that share the same
 *  edge directions (e.g. {3}, {6}, {3,6} all produce the same 6 hex dirs) miss the outer key but
 *  hit the inner cache; this counter is conservative (understates sharing). */
const poolStatsCache = new Map<string, Cyclotomic[]>();
/** Test-only: reset the candidate-stage caches and counters so OP-2 tests start from a known
 *  state regardless of which other tests ran before them. Production code must NOT call this.
 *  (Reachable via the @/classes barrel; accidental production use is perf-only — caches memoize
 *  pure deterministic computation — never a correctness risk.) */
export function _testOnlyClearCandidateStageCaches(): void {
	candidateCache.clear();
	poolStatsCache.clear();
	cacheStats.candHits = 0;
	cacheStats.candMisses = 0;
	cacheStats.poolHits = 0;
	cacheStats.poolMisses = 0;
}

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
	rawCells: number; // completed torus tilings surviving the in-fill filters (V<k, P2, primitivity), before dedup/gate. Accounting identity per lattice: certified closures = vBelowKSkipped + p2Skipped + supercellRejected + rawCells-contribution
	emitted: number; // after canonical dedup + k-gate
	gateRejected: number; // completed but orbit count ≠ k
	earlyGateRejected: number; // EARLY k-GATE (torusFill, pre-certificate): closures rejected for orbit count ≠ k BEFORE the certificate + primitivity ran (the certify/buildBlock/overlap + isPrimitive work that was SKIPPED). Would be gateRejected in the post-pass; counted here instead. Excluded from rawCells. Byte-identical emitted set.
	fanLattices: number; // lattices where ≥1 seed image (rigid core or a g⁻¹-mapped image) overflowed the cell → that image seeded from its (mapped) VC fans instead
	p0Skipped: number; // candidate lattices removed by the P0 arithmetic pre-filter (minVerts > k·hol)
	cSkipped: number; // candidate lattices removed by the C(Λ,S) divisor-feasibility pre-filter (docs/LATTICE_ADMISSIBILITY_PROOF.md; PS_P3=0 disables)
	orbitSkipped: number; // OP-3 stage 1 (lem:orbitdedup): enumerated oblique (hol=2) candidate lattices DELETED as non-representative grid-orbit members. Fires only in candidateLattices, post-P0, regular seeds only (star seeds unreduced — TH-13 open). Accounting: orbitSkipped + candidateLattices = the pre-reduction post-P0 candidate count; each deleted member's fill coverage is conserved as a g⁻¹ seed map on its orbit representative (constraint 2), so nothing is dropped — candidateLattices counts what is TRIED, this counts what rides along
	p1Pruned: number; // DFS branches cut by the P1 orbit-floor (vertexClasses > k·hol)
	p3Pruned: number; // DFS branches cut by the P3 stage-B tile-multiset domination (counts ∉ ↓F*(Λ); PS_P3_FILL=0 disables)
	p2Skipped: number; // OP-1 prop:typeprune closed-cell half: in-fill, post-certificate, pre-primitivity — certified cells discarded because their occurring VC-type set ⊊ the seed's allowed set (licensed two-sided by prop:typeprune; recovery routes through prop:fanseed — rem:fastpath caveat inherited). Excluded from rawCells; NOT counted in gateRejected (the k-gate is never reached for these cells)
	vBelowKSkipped: number; // OP-1 V<k half: in-fill, post-certificate, pre-primitivity — closed cells with vertex-class count V < k (orbits ≤ V < k). The k-gate WOULD reject these (orbit count < k), but the counter fires before the gate: excluded from rawCells and NOT counted in gateRejected
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
	/** OP-2/OP-9 census hook: called once per solve with the post-P0 candidate list
	 *  (canonical latticeKey + holohedry per lattice). Σ over seeds = work items; set-union of
	 *  keys = distinct lattices. Reported even if the lattice loop later times out — Σ measures
	 *  intended work, not completed work. Fires at most once per solve (degenerate seeds exit
	 *  before candidate enumeration). Instrumentation only — never affects the solve. */
	onCandidateLattices?: (lattices: { key: string; hol: number }[]) => void;
	/** TH-10 scout ONLY (EXAMPLE MODE — requires env TH10_EXAMPLE_MODE=1, throws otherwise).
	 *  Replaces the candidate-lattice stage wholesale with an externally enumerated family (the
	 *  hypothetical weight-s pool of the TH-10 program, `scripts/th10-scout.ts`): every basis is
	 *  filled under the bare identity seed map; no P0 / orbit reduction / oblique enumeration runs
	 *  here (the scout applies the per-seed sound filters itself before injecting). `allKeys` /
	 *  `areaKeys` must be the FULL family's key sets (the CB-7 guard membership universe) — passing
	 *  only the injected slice would false-alarm the primitivity guard. The substituted pool bound
	 *  is UNPROVEN: a loud EXAMPLE-MODE banner is emitted and results carry NO completeness or
	 *  certification claim. Unset ⇒ this option is inert and the solve is byte-identical. */
	th10Override?: { bases: [Cyclotomic, Cyclotomic][]; allKeys: Set<string>; areaKeys: Set<string> };
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

/** OP-3: apply the INVERSE of grid map g=(rot,refl) to seed polygons — the g⁻¹(core) seed state
 *  for the orbit representative (lem:orbitdedup (i)). g⁻¹: pure rotation → ζ^{N−rot}; reflection
 *  conj∘ζ^rot is an involution → g⁻¹ = g. Pinned against gridImage by the inversion tests
 *  (period-solver + op3-reflective-gate) — those pins now guard THIS production helper directly. */
export function applySeedMapInv(ps: Polygon[], m: { rot: number; refl: boolean }, ring: Cyclotomic['ring'], ZERO: Cyclotomic): Polygon[] {
	if (m.rot === 0 && !m.refl) return ps; // identity: original array, no clone (byte-identical fast path)
	return ps.map((p) => p.transformedRigid(ZERO, m.refl, m.refl ? m.rot : 0, m.refl ? 0 : (ring.N - m.rot) % ring.N, ZERO, 'full'));
}

/** TH-10 scout (EXAMPLE MODE): wrap an externally enumerated lattice family as the stage-1 result.
 *  Hard-gated on TH10_EXAMPLE_MODE=1 so the option cannot be reached accidentally; emits the loud
 *  banner once per process. Every basis gets the bare identity seed map (no OP-3 orbit reduction —
 *  the scout injects representatives itself). */
let th10BannerEmitted = false;
function th10OverrideStage1(
	ov: NonNullable<PeriodSolverOptions['th10Override']>,
	k: number
): { lattices: CandidateLattice[]; p0Skipped: number; cSkipped: number; feas: Map<number, Map<string, number[][]>> | null; orbitSkipped: number; obliqueCandidates: number; obliqueTruncated: ObliqueTruncation['cause'] | null; starLadderTruncated: boolean; allKeys: Set<string>; areaKeys: Set<string> } {
	if (process.env.TH10_EXAMPLE_MODE !== '1') {
		throw new Error(
			'PeriodSolver: th10Override passed without TH10_EXAMPLE_MODE=1 — the TH-10 weight-s pool is UNPROVEN and may only run in explicitly flagged example mode'
		);
	}
	if (!th10BannerEmitted) {
		th10BannerEmitted = true;
		process.stderr.write(
			`[PeriodSolver k=${k}] ⚑ EXAMPLE MODE (TH-10 scout): candidate-lattice stage REPLACED by an ` +
			`externally enumerated weight-s family — the substituted pool bound is UNPROVEN; results carry ` +
			`NO completeness or certification claim\n`
		);
	}
	return {
		lattices: ov.bases.map((basis) => ({ basis, seedMaps: [{ rot: 0, refl: false }] })),
		p0Skipped: 0,
		cSkipped: 0,
		feas: null,
		orbitSkipped: 0,
		obliqueCandidates: 0,
		obliqueTruncated: null,
		starLadderTruncated: false,
		allKeys: ov.allKeys,
		areaKeys: ov.areaKeys,
	};
}

// ---------------------------------------------------------------------------------------------
// Fill-internals profiler (env PS_FILL_PROFILE=1). Accumulates ACROSS every torusFill in the
// process, so one scout sweep prints a single aggregate breakdown on exit. Byte-identical when off:
// FILL_PROF is null and every bracket / counter is a guarded no-op.
//
// It answers the two questions the raw PS_PROFILE `fill=` number can't: (1) where inside the DFS the
// time goes, split into VALIDITY (does the current state / a placement hold up — analyze, certify,
// primitive) vs SELECTION+EXPANSION (choose the gap, place each candidate, reduce mod Λ, extend the
// block — `expand`) vs BOOKKEEPING (`dedupKey`); and (2) the search-tree SHAPE (pops, contradictions,
// closures, per-pop placement fan-out and why children die) — which decides whether the lever is
// fewer nodes (better pruning) or cheaper nodes (cheaper primitives). Timers are bracketed ONCE per
// pop at the bucket level (≤5 performance.now pairs/pop) to keep distortion ≲1%; the finer within-
// `expand` split (overlap vs canonicalRep vs child buildBlock) is read off the --cpu-prof self-time.
type FillProf = {
	// setup = per-fill work BEFORE the DFS loop (dedupModLattice + initial buildBlock + coreSelfOverlaps +
	// blockHasProperOverlap on the seed) — runs once per fill; mostly overlap testing again.
	t: { setup: number; dedupKey: number; analyze: number; certify: number; primitive: number; expand: number };
	// certify sub-phases (isCompleteTiling runs ~once/closure, so timing its internals is distortion-free)
	ct: { area: number; buildBlock: number; overlap: number; judge: number };
	c: {
		fills: number; pops: number; seenHits: number; capSkips: number;
		contradictions: number; closures: number;
		certCalls: number; certPass: number; primCalls: number; primTrue: number;
		places: number; overlapRej: number; dupRej: number; p1Pruned: number; capRej: number; pushed: number;
	};
};
const FILL_PROF: FillProf | null = process.env.PS_FILL_PROFILE === '1'
	? { t: { setup: 0, dedupKey: 0, analyze: 0, certify: 0, primitive: 0, expand: 0 },
	    ct: { area: 0, buildBlock: 0, overlap: 0, judge: 0 },
	    c: { fills: 0, pops: 0, seenHits: 0, capSkips: 0, contradictions: 0, closures: 0, certCalls: 0, certPass: 0, primCalls: 0, primTrue: 0, places: 0, overlapRej: 0, dupRej: 0, p1Pruned: 0, capRej: 0, pushed: 0 } }
	: null;
export function getFillProfile(): FillProf | null { return FILL_PROF; }
if (FILL_PROF) {
	process.on('exit', () => {
		const { t, c } = FILL_PROF;
		const valid = t.analyze + t.certify + t.primitive; // certify+primitive+analyze = validity work
		const total = valid + t.expand + t.dedupKey + t.setup;
		const pctOf = (x: number) => total > 0 ? `${((100 * x) / total).toFixed(1)}%` : '0%';
		const rows: [string, number][] = [
			['setup    (per-fill: initial block + self-overlap)', t.setup],
			['analyze  (validity: open-vertex / contradiction)', t.analyze],
			['certify  (validity: isCompleteTiling certificate)', t.certify],
			['primitive(validity: isPrimitive supercell check)', t.primitive],
			['expand   (selection: gap + place + reduce + block)', t.expand],
			['dedupKey (bookkeeping: stateKey + seenState)', t.dedupKey],
		];
		let out = `\n[PS_FILL_PROFILE] fill-internals aggregate over ${c.fills} torusFill calls, ${c.pops} pops — total timed ${total.toFixed(0)}ms\n`;
		out += `  VALIDITY total ${valid.toFixed(0)}ms (${pctOf(valid)}) | SELECTION ${t.expand.toFixed(0)}ms (${pctOf(t.expand)}) | SETUP ${t.setup.toFixed(0)}ms (${pctOf(t.setup)}) | BOOKKEEPING ${t.dedupKey.toFixed(0)}ms (${pctOf(t.dedupKey)})\n`;
		for (const [label, ms] of rows) out += `    ${label.padEnd(52)} ${ms.toFixed(0).padStart(9)}ms  ${pctOf(ms).padStart(6)}\n`;
		const ct = FILL_PROF.ct;
		const certTot = ct.area + ct.buildBlock + ct.overlap + ct.judge;
		const pctCert = (x: number) => certTot > 0 ? `${((100 * x) / certTot).toFixed(1)}%` : '0%';
		out += `  certify breakdown (of ${certTot.toFixed(0)}ms isCompleteTiling): ` +
			`area(Surd) ${ct.area.toFixed(0)}ms ${pctCert(ct.area)} | buildBlock(R=cellDiam+8) ${ct.buildBlock.toFixed(0)}ms ${pctCert(ct.buildBlock)} | ` +
			`overlap(O(n²) intersects) ${ct.overlap.toFixed(0)}ms ${pctCert(ct.overlap)} | vertexJudge ${ct.judge.toFixed(0)}ms ${pctCert(ct.judge)}\n`;
		out += `  tree shape: pops ${c.pops}, seenHits ${c.seenHits}, capSkips ${c.capSkips}, contradictions ${c.contradictions}, closures ${c.closures}\n`;
		out += `    closure fate: certCalls ${c.certCalls} → certPass ${c.certPass}; primCalls ${c.primCalls} → primTrue ${c.primTrue}\n`;
		out += `    placements: attempted ${c.places}, pushed ${c.pushed}; rejected: overlap ${c.overlapRej}, dup ${c.dupRej}, p1 ${c.p1Pruned}, cap ${c.capRej}\n`;
		out += `    per-pop fan-out: ${c.pops > 0 ? (c.places / c.pops).toFixed(2) : '0'} places/pop, ${c.pops > 0 ? (c.pushed / c.pops).toFixed(2) : '0'} children/pop\n`;
		process.stderr.write(out);
	});
}
const fpNow = (): number => performance.now();

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
		// TH-10 scout EXAMPLE MODE: an injected external family replaces the stage wholesale (see
		// the option docstring). The candidateCache is untouched — the override path never reads or
		// writes it, so a mixed-mode process cannot serve poisoned candidates.
		const _tc0 = prof ? Date.now() : 0;
		const { lattices, p0Skipped, cSkipped, feas, orbitSkipped, obliqueCandidates, obliqueTruncated, starLadderTruncated, allKeys, areaKeys } = opts.th10Override
			? th10OverrideStage1(opts.th10Override, k)
			: this.candidateLattices(seed);
		if (prof) prof.cand += Date.now() - _tc0;

		const diag: PeriodSolverDiag = {
			candidateLattices: lattices.length,
			latticesTried: 0,
			rawCells: 0,
			emitted: 0,
			gateRejected: 0,
			earlyGateRejected: 0,
			fanLattices: 0,
			p0Skipped,
			cSkipped,
			orbitSkipped,
			p1Pruned: 0,
			p3Pruned: 0,
			p2Skipped: 0,
			vBelowKSkipped: 0,
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

		// OP-2/OP-9 census hook: report the post-P0, post-orbit-reduction candidate list once per
		// solve (the lattices actually TRIED; a deleted orbit member is not a census item — its fill
		// rides its representative's seed maps, see OP-3 in candidateLattices). The guard is
		// intentional: the `.map` must NOT run when the hook is undefined (a per-solve cost even if
		// the result is discarded). Using `?.()` with an eagerly-evaluated argument would run the
		// map unconditionally — so we guard explicitly.
		// Key = lexicographic min over `latticeKeySet(lu, lv)`: per that function's docstring, a
		// single `latticeKey` is NOT unique per lattice on tied minima (hex/rhombic) — the same
		// lattice can key differently across solves, splitting one lattice into several census keys
		// (overcounting "distinct", understating the OP-9 multiplicity). `latticeKeySet` enumerates
		// EVERY key the lattice can canonicalize to, so its lexicographic min is a true per-lattice
		// invariant. Cost (≤ 56 pair checks per candidate) is paid only when the hook is set, i.e.
		// census runs only.
		if (opts.onCandidateLattices) {
			opts.onCandidateLattices(
				lattices.map(({ basis: [lu, lv] }) => ({
					key: [...latticeKeySet(lu, lv)].reduce((m, s) => (s < m ? s : m)),
					hol: holohedry(lu, lv),
				}))
			);
		}

		// --- 2+3. Fill each torus, certify, dedup, gate. ---
		const checker = new KUniformityChecker();
		const extractor = new TranslationalCellExtractor();
		const seenCanonical = new Set<string>();
		const cells: PeriodCell[] = [];

		const ZERO = Cyclotomic.ZERO(ring); // hoisted: the per-map g⁻¹ seeding below transforms about the origin
		for (const { basis: [u, v], seedMaps } of lattices) {
			if (maxMs > 0 && Date.now() - start > maxMs) {
				diag.timedOut = true;
				break;
			}
			diag.latticesTried++;
			const ctx = this.makeCtx(u, v, ring, allowed, polySizes, maxCellPolys, starTiles, allKeys, areaKeys);
			if (!ctx) continue; // degenerate basis
			if (ctx.blockIndexCapBinds) diag.blockIndexCapTruncated++; // F3b: ⚑ already emitted in makeCtx
			// P3 stage B (in-fill domination, docs/LATTICE_ADMISSIBILITY_PROOF.md): hand the fill this
			// lattice's feasible tile-count vectors F*(Λ) — every EMITTED cell's per-size counts equal
			// a member (the C theorem), and counts grow monotonically, so a partial fill dominated by
			// no member is a dead branch. Same scope as C (feas ≠ null ⟺ k ≥ 3 ∧ regular ∧ PS_P3≠0);
			// PS_P3_FILL=0 disables just this arm for attribution A/Bs. Vectors are aligned to the
			// ascending `polySizes` (both sides sort the same numeric tile sizes).
			if (feas && process.env.PS_P3_FILL !== '0')
				ctx.feasVectors = feas.get(bravaisClassExact(u, v))?.get(areaKey(detSurd(u, v).abs()));
			// EARLY k-GATE: run the post-pass orbit gate at closure (in torusFill) so a wrong-uniformity
			// closure is rejected before the (buildBlock+overlap) certificate + primitivity. Same fn as the
			// post-pass below ⇒ identical reject decision on the same (unmutated) reps ⇒ byte-identical emit.
			// SCOPE — k ≥ 3 only: the early gate costs one orbit count per closure but only PAYS when a
			// closure is orbit≠k (skipping its certify+primitive). At k≤2 fills are cheap and virtually every
			// closure is orbit==k (measured gateRej≈0), so it would be pure overhead — the catastrophic
			// closure-storm tail (large lattices closing into many orbit>k tilings) is a k≥3 phenomenon.
			// PS_EARLY_GATE=1 forces it on at any k (A/B + tests); PS_EARLY_GATE=0 forces it off. Read per-call.
			if (process.env.PS_EARLY_GATE === '1' || (this.k >= 3 && process.env.PS_EARLY_GATE !== '0'))
				ctx.gate = (r) => (PS_FAST_GATE ? countVertexOrbitsFast(r, u, v) : checker.countVertexOrbits(r, u, v));

			// Choose the seed(s) for THIS lattice — one per orbit map (OP-3 stage 1, lem:orbitdedup).
			// Each map g = (rot, refl) ∈ seedMaps satisfies g(Λ_rep) = a deleted enumerated orbit
			// member; the member's historical fill corresponds on Λ_rep to seeding g⁻¹(core)
			// (lem:orbitdedup (i)). g⁻¹ formulas (unit-test-pinned, "OP-3 g⁻¹ seed-map inversion"):
			//   pure rotation g = ζ^rot     ⇒ g⁻¹ = ζ^{(N−rot) mod N};
			//   reflection   g = conj∘ζ^rot ⇒ g is an involution, so g⁻¹ = g (conj then ·ζ^rot).
			// transformedRigid(origin=0, reflect, axisK, rotK, T=0, 'full'):
			//   reflect=true ⇒ z ↦ conj(z)·ζ^{axisK+rotK};  reflect=false ⇒ z ↦ z·ζ^{rotK} —
			// so g⁻¹ is transformedRigid(0,false,0,(N−rot)%N,0) resp. transformedRigid(0,true,rot,0,0),
			// implemented ONCE in `applySeedMapInv` (shared with both inversion tests).
			// IDENTITY-ONLY case (every non-oblique lattice, all k≤2 paths, star seeds): exactly one
			// map {0,false} ⇒ one footprint test on corePolys, seedSets = [corePolys] or the fans on
			// overflow, dedupSeeds false for a single seed — byte-identical control flow to the
			// historical single-seed path. Per-map seeding otherwise: normally the (mapped) rigid
			// core; when a seed image OVERFLOWS the cell (its footprint mod Λ exceeds |det Λ| — the
			// t2014 case) the core would be area-rejected and yield nothing, so that image is replaced
			// by ITS fan images instead. This keeps the fast path on every lattice the core fits.
			// ⚑ COMPLETENESS NOTE (inherited unchanged from the pre-OP-3 single-seed path): the
			// fan-on-overflow fallback is exact for k=2 (the rigid core misses ONLY the core-overflow
			// tiling t2014; verified across all 20). At k≥3 a tiling could in principle be reachable
			// ONLY by a fan on a cell the rigid core also fits — that case is NOT covered here and
			// must be revisited (do not treat fan-on-overflow as a general completeness guarantee).
			const seedSets: Polygon[][] = [];
			let anyOverflow = false;
			for (const m of seedMaps) {
				const core = applySeedMapInv(corePolys, m, ring, ZERO);
				const overflows = fanCoreSets.length > 0 && ctx.cellArea < totalCoreArea - 1e-9 &&
					this.footprintArea(core, ctx) > ctx.cellArea + 1e-6;
				if (overflows) { anyOverflow = true; for (const fan of fanCoreSets) seedSets.push(applySeedMapInv(fan, m, ring, ZERO)); }
				else seedSets.push(core);
			}
			if (anyOverflow) diag.fanLattices++;

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

				// k-uniformity gate: exactly k vertex orbits under the full symmetry group. When the EARLY
				// k-gate ran (ctx.gate set), every reps here already has orbit == k — recomputing the orbit
				// count would be a redundant second pass, so skip it (compute only when the early gate is OFF,
				// or a debug hook still wants the value). Byte-identical: early-gate ON ⇒ no reps with orbit≠k
				// ever reaches here, so this gate would never reject; early-gate OFF ⇒ the original code path.
				let orbits: number | null = null;
				if (!ctx.gate || opts.onRawCell) {
					const _tg0 = prof ? Date.now() : 0;
					orbits = PS_FAST_GATE ? countVertexOrbitsFast(reps, u, v) : checker.countVertexOrbits(reps, u, v);
					if (prof) prof.gate += Date.now() - _tg0;
				}
				if (opts.onRawCell) opts.onRawCell(reps, [u, v], orbits);
				if (!ctx.gate && orbits !== null && orbits !== k) {
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
		// Default: `dedupeByNKey` — the proven hashable canonical form N (canonicalFormN), ~10⁴×/cell over
		// the pairwise path (NOTES §45), no-drop by N's soundness proof + validated (0 false merges over
		// all 47,854 oracle tilings). PS_DEDUPE=congruence restores the exact pairwise authority; run with
		// PS_MERGECHECK=nkey to have N's merges re-verified against it. (DEVELOPMENT_NOTES §12.7/§12.11/§45.)
		const _td0 = prof ? Date.now() : 0;
		const dedupe = process.env.PS_DEDUPE === "congruence" ? dedupeByCongruence : dedupeByNKey;
		const deduped = dedupe(cells, (c) => extractor.canonicalKey(c.cellPolygons));
		if (prof) prof.dedup += Date.now() - _td0;
		diag.emitted = deduped.length;
		if (prof) process.stderr.write(
			`[PS_PROFILE k=${k}] cand=${prof.cand}ms fill=${prof.fill}ms gate=${prof.gate}ms ` +
			`canon=${prof.canon}ms dedup=${prof.dedup}ms | lat=${diag.candidateLattices} raw=${diag.rawCells} ` +
			`gateRej=${diag.gateRejected} fanLat=${diag.fanLattices} p0Skip=${diag.p0Skipped} cSkip=${diag.cSkipped} p1Prune=${diag.p1Pruned} p3Prune=${diag.p3Pruned} ssDedup=${diag.seedStateDedup} obl=${diag.obliqueCandidates}${diag.obliqueTruncated ? `(trunc:${diag.obliqueTruncated})` : ''}\n`
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
	private candidateLattices(seed: SeedConfigurationLike): { lattices: CandidateLattice[]; p0Skipped: number; cSkipped: number; feas: Map<number, Map<string, number[][]>> | null; orbitSkipped: number; obliqueCandidates: number; obliqueTruncated: ObliqueTruncation['cause'] | null; starLadderTruncated: boolean; allKeys: Set<string>; areaKeys: Set<string> } {
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
		// PS_P3 keys the cache: toggling the C(Λ,S) filter mid-process must not serve a list built
		// under the other regime (same pattern as the ST-9 pool-widening knobs above).
		const p3Off = process.env.PS_P3 === '0';
		const cacheKey = `${ring.N}:${vcSig}:${this.k}:${provenMode ? 'proven' : 'tuned'}${widen !== '|' ? `:up${widen}` : ''}${p3Off ? ':p3off' : ''}`;
		const cached = candidateCache.get(cacheKey);
		if (cached) { cacheStats.candHits++; return cached; }
		cacheStats.candMisses++;

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
		if (cfg.smallkProven) {
			const bk = `${this.k}:${aMax}:smallk`;
			if (!regimeBannerEmitted.has(bk)) {
				regimeBannerEmitted.add(bk);
				const t = cfg.active;
				process.stderr.write(
					`[PeriodSolver k=${this.k}] ✔ PROOF-ANCHORED pool regime (SMALLK_PROVEN, docs/SMALLK_W_BOUND.md v2 refereed): ` +
					`poolSteps=${t.poolSteps}, poolLmax=${t.poolLmax.toFixed(2)}, longAxisMax=${t.longAxisMax?.toFixed(2)}, ` +
					`gridAreaMax=${t.gridAreaMax?.toFixed(2)}, oblAreaMax=${t.oblAreaMax?.toFixed(2)}, ` +
					`compactOffMax2=${t.compactOffMax2.toFixed(2)}, gridShortMax2=${t.gridShortMax2.toFixed(2)}, ` +
					`areaBound=${t.areaBoundF.toFixed(2)} — per-branch census radii; block-cap and join-den invariants asserted\n`
				);
			}
		} else if (cfg.isTuned) {
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
		// OP-2 pool sub-cache (poolStatsCache): shortVectorPool already memoizes internally in
		// LatticeEnumerator, so cross-vcSig sharing is NOT new. This outer cache (poolStatsCache)
		// exists for the OP-9 poolHits/poolMisses counters; an outer hit saves only the inner key
		// construction + one Map lookup. poolLmax is a float computed deterministically per
		// (k, aMax) via poolConfig — equal inputs always produce the same IEEE-754 value, so
		// string interpolation is a stable key. Cached arrays are NEVER mutated downstream
		// (every use is filter/map/for-of, creating new arrays — keep it that way).
		const poolCacheKey = `${ring.N}:${polySizes.join(',')}:${poolSteps}:${poolLmax}:1`;
		let pool = poolStatsCache.get(poolCacheKey);
		if (pool !== undefined) {
			cacheStats.poolHits++;
		} else {
			cacheStats.poolMisses++;
			pool = shortVectorPool(ring, poolSteps, poolLmax, dirs, /* monotone */ true);
			poolStatsCache.set(poolCacheKey, pool);
		}
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
			// SMALLK_PROVEN: Gauss-reduce the basis before keying/filling. Same lattice, better
			// basis: the F3b block-index invariant (needed ≤ 60 within the census boxes) is proved
			// for REDUCED bases (angle ∈ [60°,120°] ⇒ area ≥ (√3/2)|u||v|); an unreduced skew pair
			// (e.g. |u|=1, |v|=7.45, area 2.73) legitimately needs index 69 and would false-trip
			// the invariant throw. Mode-gated: the default path stays byte-identical.
			if (cfg.smallkProven) [u, v] = gaussReduceExact(u, v);
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
			process.stderr.write(cfg.smallkProven
				? `[PeriodSolver k=${this.k}] census-pruned (proof-anchored, SMALLK_W_BOUND §3): ${compactReachTrunc} off-grid pool vectors exceed the round shell box compactOffMax2=${compactOffMax2.toFixed(2)} — no census shell reaches them\n`
				: `[PeriodSolver k=${this.k}] ⚑ INCOMPLETE-REGION (compact off-grid cap): ${compactReachTrunc} off-grid pool vectors exceed compactOffMax2=${compactOffMax2.toFixed(2)} and are not tried as round-cell bases\n`);
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
			process.stderr.write(cfg.smallkProven
				? `[PeriodSolver k=${this.k}] census-pruned (proof-anchored, SMALLK_W_BOUND §4): ${gridShortTrunc} pool vectors exceed gridShortMax2=${gridShortMax2.toFixed(2)} = the non-rigid det box (short² ≤ det)\n`
				: `[PeriodSolver k=${this.k}] ⚑ INCOMPLETE-REGION (grid short-side cap): ${gridShortTrunc} pool vectors exceed gridShortMax2=${gridShortMax2.toFixed(2)} and are not tried as cmm/rect short sides\n`);
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
		let gridCensusSkip = 0;
		const longAxisMax = cfg.active.longAxisMax ?? 0;
		const gridAreaMax = cfg.active.gridAreaMax ?? 0;
		for (const [u, v] of lat.gridAlignedCells(gridShorts, polySizes, ring, undefined, areas)) {
			if (poolSet.has(v.key())) { push(u, v); continue; }
			const vf = v.toVector();
			if (cfg.smallkProven) {
				// SMALLK_PROVEN: accept the solved axis by CENSUS BOUND, not pool membership
				// (SMALLK_W_BOUND §4-§5: a grid-aligned k≤3 cell has det ≤ 4k·s_max, so its
				// long/centering axis is ≤ gridAreaMax/|u| ≤ longAxisMax). This also removes the
				// CB-8 ambiguous residual: no realizable axis is dropped for step-count reasons.
				const uf = u.toVector();
				const det = Math.abs(uf.x * vf.y - uf.y * vf.x);
				const l2 = vf.x * vf.x + vf.y * vf.y;
				if (det <= gridAreaMax + 1e-6 && l2 <= longAxisMax * longAxisMax + 1e-6) { push(u, v); continue; }
				gridCensusSkip++; // beyond the proven non-rigid box ⇒ unrealizable at k ≤ 3 (theorem), skip
				continue;
			}
			if (vf.x * vf.x + vf.y * vf.y > poolLmax * poolLmax + 1e-9) gridReachTrunc++;
		}
		if (gridReachTrunc > 0)
			process.stderr.write(`[PeriodSolver k=${this.k}] ⚑ INCOMPLETE-REGION (grid long-side reach): ${gridReachTrunc} solved cmm/rect long axes exceed poolLmax=${poolLmax.toFixed(2)} and are not enumerated\n`);
		if (gridCensusSkip > 0)
			process.stderr.write(`[PeriodSolver k=${this.k}] census-pruned (proof-anchored, SMALLK_W_BOUND §4): ${gridCensusSkip} solved axes beyond the non-rigid box (det ≤ ${gridAreaMax.toFixed(2)}, |v| ≤ ${longAxisMax.toFixed(2)}) — unrealizable at k ≤ 3 by theorem\n`);

		// `minVerts` (min vertex-classes per realizable cell area) drives BOTH the P0 pre-filter below AND
		// the oblique sub-pool sizing in source (C); computed once here (hoisted from the P0 loop — pure,
		// no behavioural change). For STAR seeds it is LEFT EMPTY (C2): `vcAreaMinVerts` bakes in the regular
		// Euler relation V=Σtₙ(n−2)/2, false for stars (a 2n-gon; dents are non-vertices) — so an empty map
		// makes P0 prune nothing and oblique sizing prune nothing (sound; never drops; k=1 has no oblique).
		const minVerts = seedHasStar
			? new Map<string, number>()
			: vcAreaMinVerts(vcIncidences, tileArea, tileCorners, areaBoundF);

		// C(Λ,S) feasibility sets (Fable P3 stage A, docs/LATTICE_ADMISSIBILITY_PROOF.md): per exact
		// Bravais class, the exact cell areas realizable with per-orbit class counts DIVIDING the
		// class's holohedry order (orbit-stabilizer + Lagrange), full VC support, integral tile
		// counts. SCOPE — regular seeds only (star: the incidence identity is false, same rule as
		// P0) and k ≥ 3 only (at k ≤ 2 the native runGate=0 path intentionally emits gate-doomed
		// closures whose tile vectors need not be feasible; nothing to win there anyway). PS_P3=0
		// restores today's behavior byte-for-byte.
		const cFeas = !p3Off && this.k >= 3 && !seedHasStar
			? vcFeasAreaSets(vcIncidences, tileArea, tileCorners, this.k, areaBoundF)
			: null;

		// (C) OBLIQUE (p1/p2) cells — the cor:box join-closure completion that reaches the Bravais classes
		// the symmetry-pinned (A)/(B) cannot (k≥3 oblique cells t3046/t3055). Source (C) contributes ONLY
		// `hol==2` lattices, so (A)/(B) remain the SOLE round/grid source and the k≤2 catalogue stays
		// byte-identical (the oracle has 0 oblique at k≤2; those candidates gate-reject). The proven box is
		// large; the searched region is the tuned pool reach, so an out-of-reach oblique cell is logged
		// LOUDLY (INCOMPLETE-REGION, never silent), per route-a-proven-box.md / join-closure contract.
		let obliqueCandidates = 0;
		let obliqueTruncated: ObliqueTruncation['cause'] | null = null;
		// SMALLK_PROVEN: oblique (hol 2) cells have det ≤ 2k·s_max (census L1) — 15× below the
		// coarse cap; join-closure stays complete (JOIN_DEN_MAX=60 ≥ census sublattice index ≤ 28).
		const oblAreaBound = cfg.smallkProven ? (cfg.active.oblAreaMax ?? areaBoundF) : areaBoundF;
		for (const [u, v] of lat.obliqueCells(pool, areas, ring, oblAreaBound, poolLmax, minVerts, (info) => {
			obliqueTruncated = info.cause;
			if (cfg.smallkProven && info.cause === 'join-waived') {
				// Proof-anchored justification (SMALLK_W_BOUND §4 + L1): a needed join's sublattice
				// index divides |det|/covol_min ≤ oblAreaMax/(√3/2) ≤ 28 at k ≤ 3, and nearRational
				// is accept-when-unsure — so every waived join (irrational or den > 60) is provably
				// not a k ≤ 3 lattice join. Informational, not an INCOMPLETE-REGION.
				process.stderr.write(`[PeriodSolver k=${this.k}] census-justified join waiver (den ≤ 60 ≥ proven need ≤ 28): ${JSON.stringify(info)}\n`);
			} else {
				process.stderr.write(`[PeriodSolver k=${this.k}] ⚑ INCOMPLETE-REGION (oblique candidate stage): ${JSON.stringify(info)}\n`);
			}
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
		// --- C(Λ,S): divisor-feasibility pre-filter (Fable P3 stage A). ---
		// Skip a candidate Λ when NO support-preserving orbit-type vector with per-orbit class
		// counts dividing hol(Λ) realizes |det Λ| exactly — a proven NECESSARY condition for Λ to
		// carry a primitive, full-support, exactly-k-uniform cell (docs/LATTICE_ADMISSIBILITY_PROOF.md;
		// V0 scout: 0 violations over 1311 real candidates, 79% of k=3 fill time on rejected
		// lattices). Licensed, NOT a completeness knob. Two structural notes:
		//  - CB-7/allKeys: same justification shape as P0 — if a discarded supercell's tiling were
		//    k-uniform with this seed's support, its PRIMITIVE lattice would satisfy C (the theorem)
		//    and survive; a C-skipped primitive means no such tiling, so the discard is sound.
		//  - OP-3: |det| and the Bravais class are grid-isometry invariants, so C's verdict is
		//    constant on each grid orbit — the filter can never split an orbit's members.
		const kept: [Cyclotomic, Cyclotomic][] = [];
		let p0Skipped = 0;
		let cSkipped = 0;
		for (const [u, v] of lattices) {
			const ak = areaKey(detSurd(u, v).abs());
			const mv = minVerts.get(ak);
			if (mv !== undefined && mv > this.k * holohedry(u, v)) { p0Skipped++; continue; }
			if (cFeas && !cFeas.get(bravaisClassExact(u, v))!.has(ak)) { cSkipped++; continue; }
			kept.push([u, v]);
		}

		// --- OP-3 stage 1: oblique grid-orbit candidate reduction (thesis lem:orbitdedup, TH-9). ---
		// LICENSE: filling ONE representative Λ_rep per grid-isometry orbit, with every deleted
		// member's seed image supplied EXPLICITLY, yields the same certified congruence classes
		// (lem:orbitdedup; the three binding constraints of rem:orbitdedup):
		//   (1) EXACT orbit ID — `groupIntoGridOrbits` declares G-equivalence only after an exact
		//       `sameLattice` verification of the recorded map g (g(Λ_rep) = Λ_member); never on a
		//       key collision. memberMaps is identity-first by that helper's contract, which
		//       preserves the historical unrotated-core-first fill order on every representative.
		//   (2) EXPLICIT SEEDING — deleting member gΛ_rep WITHOUT seeding g⁻¹(core) on Λ_rep would
		//       trade redundancy for SILENT LOSS. So each candidate carries `seedMaps` = the maps of
		//       ALL its enumerated orbit members, and solve() seeds g⁻¹(core) per map. The seed maps
		//       ARE the deleted members' coverage — exactly the ENUMERATED members, no more: fills
		//       are CONSERVED, not expanded (an orbit member the tuned pool never enumerated was
		//       never filled before either, so it is not owed here; the candidate-stage completeness
		//       contract is the pool's, unchanged by this reduction).
		//   (3) ORBIT-AWARE CB-7 — the primitivity guard's membership test ranges over the G-images
		//       of the witness closure (see `supercellRejectionGuard`), else it false-alarms when
		//       the primitive lattice's orbit was reduced.
		// STAGE-1 SCOPE (the hol gate): reduce OBLIQUE (hol === 2) candidates ONLY — the
		// maximal-orbit class (trivial point stabilizer ⇒ orbit size up to 2N), where the win
		// concentrates; k≤2 has 0 oblique TILINGS, so the k≤2 catalogue expectation is
		// byte-identical (verified by the probes, next commit). STAR seeds: NO reduction at all
		// (rem:orbitdedup scope — TH-13 open); every candidate keeps the bare identity map.
		// POOL-CLOSURE DIAGNOSTIC NOTE: the enumerated candidate set need not be G-closed under the
		// tuned pool, so an orbit can be PARTIAL — the reduction only regroups what was enumerated.
		// ⚑ CRITICAL invariant: `allKeys` (the `seen` set, the CB-7 membership universe) is built at
		// push() time, BEFORE this reduction — it keeps EVERY enumerated orbit member. Do not move it.
		const idMaps = (): { rot: number; refl: boolean }[] => [{ rot: 0, refl: false }];
		let orbitSkipped = 0;
		let candidates: CandidateLattice[];
		if (seedHasStar) {
			candidates = kept.map((basis) => ({ basis, seedMaps: idMaps() }));
		} else {
			const oblique: [Cyclotomic, Cyclotomic][] = [];
			const other: [Cyclotomic, Cyclotomic][] = [];
			for (const b of kept) (holohedry(b[0], b[1]) === 2 ? oblique : other).push(b);
			const groups = groupIntoGridOrbits(oblique, ring.N);
			const reduced: CandidateLattice[] = groups.map((g) => ({
				basis: oblique[g.repIdx],
				seedMaps: g.memberMaps.map((m) => ({ rot: m.rot, refl: m.refl })), // identity-first (helper contract)
			}));
			orbitSkipped = oblique.length - groups.length;
			candidates = [...other.map((basis) => ({ basis, seedMaps: idMaps() })), ...reduced];
			// Re-sort by exact cell area — keep the cheapest-fill-first invariant. JS sort is stable,
			// so equal-area order stays deterministic (though equal-area ties may differ from the
			// pre-OP-3 enumeration order: non-oblique before oblique — covered by probes/recert).
			candidates.sort((a, b) => detSurd(a.basis[0], a.basis[1]).abs().cmp(detSurd(b.basis[0], b.basis[1]).abs()));
		}

		// `allKeys` = every enumerated candidate key PRE-P0 (the `seen` set) — the membership universe
		// for the CB-7 primitivity-rejection guard. Pre-P0 on purpose: a P0-skipped lattice was
		// enumerated and removed by a LICENSED prune (if the rejected supercell's tiling were k-uniform,
		// its primitive lattice would satisfy minVerts ≤ k·hol and survive P0 — so a P0-skipped
		// primitive means the tiling is not k-uniform and the discard is sound, not a silent loss).
		// Pre-REDUCTION too (OP-3): a deleted orbit member is still a candidate in the conserved-fill
		// sense — its coverage rides its representative's seed maps.
		// `areaKeys` = the admissible cell-area set: a discarded supercell whose PRIMITIVE area is
		// outside it cannot carry this seed's orbit-VC multiset (the same Euler/incidence completeness
		// contract the candidate area filter rests on) — it is another seed's tiling, so the guard
		// must not alarm on it (observed live: pure-triangle = 1-uniform supercell completions inside
		// multi-VC k=2 seeds; vcAreaSet uses v ≥ 1 for EVERY VC, so their primitive area √3/2 is
		// excluded by construction).
		const result = { lattices: candidates, p0Skipped, cSkipped, feas: cFeas, orbitSkipped, obliqueCandidates, obliqueTruncated, starLadderTruncated, allKeys: seen, areaKeys: new Set(areas.map(areaKey)) };
		if (trace.enabled) trace.node('lattice', {
			vcSig,
			polySizes,
			p0Skipped, cSkipped, orbitSkipped,
			candidates: candidates.map((c) => {
				const a = c.basis[0].toVector(), b = c.basis[1].toVector();
				return { key: latticeKey(c.basis[0], c.basis[1]), basis: [[a.x, a.y], [b.x, b.y]] };
			}),
		});
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
			if (SMALLK_PROVEN_MODE) {
				// Proven-mode invariant: every candidate inside the census boxes needs index ≤ 60
				// (worst rect: ceil((2·24.13+10)/1)+1 = 60). A bind here means an out-of-box
				// candidate slipped past the census filters — a soundness bug, not a tuning event.
				throw new Error(
					`SMALLK_PROVEN invariant violated: block index cap binds for lattice ${latticeKey(u, v)} ` +
					`(needs ${blockIndexRangeNeeded(cellDiam, cellArea)} > ${BLOCK_INDEX_CAP}; diam=${cellDiam.toFixed(2)}, area=${cellArea.toFixed(2)}) — ` +
					`census filter leak, fix before trusting the run`
				);
			}
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
		// BRIDGE (USE_NATIVE_FILL=1): run this fill on the native engine. Regular seeds only — star cores
		// fall back to the TS DFS. runGate mirrors ctx.gate (early k-gate ON iff the enumeration set it, k≥3).
		// Emitted cells are byte-equivalent to the TS DFS; the inner diag counters are not populated in this
		// mode (only the emitted set + solve-level rawCells count), which is fine for the enumeration output.
		if (process.env.USE_NATIVE_FILL === '1' && ctx.starTiles.length === 0) return nativeFill(corePolys, ctx, this.k, ctx.gate != null);
		const FP = FILL_PROF; // fill-internals profiler (module-global; null when off ⇒ byte-identical)
		if (FP) FP.c.fills++;
		const _s0 = FP ? fpNow() : 0; // per-fill setup timer (closed at every setup exit + before the DFS loop)
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
			if (FP) FP.t.setup += fpNow() - _s0;
			return [];
		}
		// Cheap pre-block reject: if a core rep properly overlaps one of its 8 nearest lattice translates,
		// Λ is too small — a necessary self-overlap condition caught in O(reps) intersects before the
		// initial block build (audit perf C3). A strict subset of blockHasProperOverlap, so it only
		// rejects candidates the full check would also reject (a valid tiling never has a tile overlapping
		// its own translate ⇒ never drops a real tiling); results are byte-identical.
		if (this.coreSelfOverlapsNearest(initial, ctx)) {
			if (PeriodSolver.DEBUG) process.stderr.write(`  torusFill: core self-overlap (nearest translate) → reject\n`);
			if (FP) FP.t.setup += fpNow() - _s0;
			return [];
		}
		// Build the initial cell's block and reject if the seed self-overlaps mod Λ. Reuse this block as
		// the DFS root's block — the DFS carries each cell's block and extends it by ONE new tile's lattice
		// translates per child instead of rebuilding the whole block every pop (audit perf C1).
		const initialBlock = this.buildBlock(initial, ctx, 5);
		if (this.blockOverlapPeriodic(initial, initialBlock, ctx, 5)) { // RANK-1 periodic reduction (Rabs=5)
			if (PeriodSolver.DEBUG) process.stderr.write(`  torusFill: initial self-overlap → reject\n`);
			if (FP) FP.t.setup += fpNow() - _s0;
			return [];
		}

		// P1 orbit-floor state: the vertex classes mod Λ present so far (`vReps`), carried on the stack
		// and extended by one tile's classes per child. A child whose count exceeds `ctx.orbitFloor`
		// (= k·hol(Λ)) is pruned — its completion must have orbits > k (gate-rejected) or be a supercell
		// (primitivity-rejected; re-found at its primitive sublattice unconditionally under cor:box,
		// guarded loudly under the tuned pool — CB-7). Every k-uniform tiling has V ≤
		// k·hol(Λ) and V is monotone, so a branch leading to a valid tiling is NEVER pruned (byte-identical).
		//
		// C3 — P1 orbit-floor is now SOUND for star seeds too. `extendV` (below) counts only TRUE vertices
		// (a star's convex POINTS, even indices), excluding its DENTS (odd indices — t=2 dent-fill
		// NON-vertices), so `vReps` is a sound LOWER bound on V (vReps ≤ V). Since every k-uniform tiling
		// has V ≤ k·hol(Λ) and V is monotone, a branch leading to a valid tiling is never pruned — for
		// regular AND star seeds. (The old code disabled P1 for stars because extendV over-counted dents.)
		// OP-1 (the occ/type-prune, prop:typeprune) stays OFF for stars via `skipOP1` — its star soundness
		// is TA-owed (TH-13). The separate Fig-3 dent-AT-vertex fill gap (below) is unchanged by this.
		const seedHasStar = ctx.starTiles.length > 0;
		const skipOP1 = seedHasStar;
		if (seedHasStar && process.env.SPIKE_TRACE === '1') {
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
			const verts = poly.exactVertices!;
			for (let i = 0; i < verts.length; i++) {
				// A star's DENTS (odd indices; even=point/true-vertex per ExactStarPolygon) sit at t=2
				// dent-fill NON-vertices, so they must not be counted as vertex classes — excluding them
				// makes vReps ≤ true V (the sound lower bound P1's orbit-floor prune needs to be drop-free
				// for stars). Regular polygons have no dents ⇒ every corner counted (byte-identical).
				if (poly.isStar && i % 2 === 1) continue;
				const w = verts[i];
				if (!out.some((r) => latticeEquivExact(w, r, uL, vL))) out.push(w);
			}
			return out;
		};
		let initialV: Cyclotomic[] = [];
		for (const p of initial) initialV = extendV(initialV, p);
		if (initialV.length > ctx.orbitFloor) {
			if (PeriodSolver.DEBUG) process.stderr.write(`  torusFill: seed core ${initialV.length} vertex classes > floor ${ctx.orbitFloor} → reject\n`);
			if (FP) FP.t.setup += fpNow() - _s0;
			return [];
		}

		// P3 stage B — in-fill tile-multiset domination (docs/LATTICE_ADMISSIBILITY_PROOF.md). Every
		// EMITTED cell's per-size tile counts equal a member of F*(Λ) (`ctx.feasVectors`), and counts
		// grow monotonically one tile per step, so a state dominated by NO member is a dead branch.
		// `feasVectors` is set only on the k≥3 regular enumeration path; undefined ⇒ all of this is
		// skipped and the DFS is byte-identical to pre-P3 behavior.
		const feas = ctx.feasVectors;
		const nSizes = ctx.polySizes.length;
		const sizeIdxOf = feas ? new Map(ctx.polySizes.map((n, i) => [n, i])) : null;
		const dominated = (c: number[]): boolean => feas!.some((f) => { for (let i = 0; i < nSizes; i++) if (c[i] > f[i]) return false; return true; });
		let initialCounts: number[] | null = null;
		if (feas && sizeIdxOf) {
			initialCounts = new Array<number>(nSizes).fill(0);
			for (const p of initial) initialCounts[sizeIdxOf.get(p.n)!]++;
			if (!dominated(initialCounts)) {
				diag.p3Pruned++;
				if (FP) FP.t.setup += fpNow() - _s0;
				return [];
			}
		}

		const results: Polygon[][] = [];
		const seenState = new Set<string>();
		const stack: { reps: Polygon[]; block: Polygon[]; vReps: Cyclotomic[]; counts: number[] | null }[] = [{ reps: initial, block: initialBlock, vReps: initialV, counts: initialCounts }];
		let pops = 0;
		const t0 = PeriodSolver.DEBUG ? Date.now() : 0;
		if (FP) FP.t.setup += fpNow() - _s0; // seed survived setup → close the setup bracket, enter the DFS

		while (stack.length > 0) {
			if (timedOut()) break;
			const { reps, block, vReps, counts } = stack.pop()!;
			let _t = FP ? fpNow() : 0;
			const stateKey = this.stateKey(reps);
			const seen = seenState.has(stateKey);
			if (FP) { FP.t.dedupKey += fpNow() - _t; if (seen) FP.c.seenHits++; }
			if (seen) continue;
			seenState.add(stateKey);
			pops++;
			if (FP) FP.c.pops++;
			if (reps.length > ctx.maxCellPolys) { if (FP) FP.c.capSkips++; continue; }

			_t = FP ? fpNow() : 0;
			const analysis = this.analyze(reps, ctx, block);
			if (FP) FP.t.analyze += fpNow() - _t;
			if (analysis.contradiction) { if (FP) FP.c.contradictions++; continue; }
			if (!analysis.openVertex) {
				if (FP) FP.c.closures++;
				// EARLY k-GATE (before the certificate): orbit count is a property of the closed cell and is
				// invariant to certification (isCompleteTiling / isPrimitive do not mutate reps). If it is ≠ k
				// the post-pass gate would reject this cell anyway, so reject NOW and skip the buildBlock+overlap
				// certificate AND the isPrimitive search. Reject-only: a cell that would be EMITTED (orbits = k)
				// is never dropped, because the same fn on the same reps yields the same count. null ⇒ undecided
				// ⇒ do NOT reject (matches the post-pass `orbits !== null && orbits !== k`). This is where the
				// k=3 catastrophic tail (large lattices closing into many orbit>k tilings) stops being paid.
				if (ctx.gate) {
					const orbits = ctx.gate(reps);
					if (orbits !== null && orbits !== this.k) { diag.earlyGateRejected++; continue; }
				}
				// No open vertex within a full cell ⇒ torus closed. Certify, then OP-1 (prop:typeprune):
				// (i) V<k ⇒ orbits ≤ V < k, the gate would reject — skip the
				// 7×7 exact symmetry search; (ii) occurring VC-type set ⊊ allowed ⇒ the cell does not
				// realize this seed's orbit-VC multiset — it is another seed's tiling (two-sided), discard
				// without gate or primitivity scan. The size-equality test (ii) is sound because the
				// certificate already enforces occ ⊆ allowed (any disallowed name returns false) and both
				// sides live in the same canonicalVCName namespace, so |occ| = |allowed| ⇔ occ = allowed.
				// OP-1 OFF for star seeds (its type-prune star soundness is TA-owed, TH-13 open); P1
				// orbit-floor is now ON for stars (extendV excludes dents). Then reject supercells (CB-7 unchanged).
				const occ: Set<string> | undefined = skipOP1 ? undefined : new Set<string>();
				_t = FP ? fpNow() : 0;
				if (FP) FP.c.certCalls++;
				// RANK-2: OP-1 (V<k, prop:typeprune) is now applied INSIDE isCompleteTiling before the overlap
				// leg via `opDoom` (non-star path only) — a doomed closure returns false (counted in diag) and
				// skips the overlap work. Same emitted output as the old post-certificate discard.
				const opDoom = skipOP1 ? undefined : { vReps, diag };
				const cert = this.isCompleteTiling(reps, ctx, occ, opDoom);
				if (FP) { FP.t.certify += fpNow() - _t; if (cert) FP.c.certPass++; }
				if (cert) {
					_t = FP ? fpNow() : 0;
					if (FP) FP.c.primCalls++;
					const prim = this.isPrimitive(reps, ctx, memo, diag);
					if (FP) { FP.t.primitive += fpNow() - _t; if (prim) FP.c.primTrue++; }
					if (prim) results.push(reps);
				}
				continue;
			}

			// Corner-complete the chosen open vertex: place one polygon into its CW-most gap.
			_t = FP ? fpNow() : 0;
			const { vertex: w, intervals } = analysis.openVertex;
			const d0 = this.gapStartRay(intervals, ctx.N);
			if (d0 < 0) { if (FP) FP.t.expand += fpNow() - _t; continue; } // no fillable gap (shouldn't happen for an open vertex)
			const repsKeys = new Set(reps.map((r) => r.exactKey())); // reps are canonical class reps

			// Candidate corners for the CW-most gap: every regular n-gon (a corner of interior `regular(n)`)
			// AND — C3 — every star variant seating its POINT (interior α). Each is placed with a corner at
			// `w` and outgoing edge `d0`, covering [d0, d0+interior]; the post-placement overlap + the
			// downstream `analyze` (over-fill / VC) reject the ones that do not fit.
			const place = (P: Polygon) => {
				if (FP) FP.c.places++;
				if (this.properOverlapWithBlock(P, block, ctx)) { if (FP) FP.c.overlapRej++; return; }
				// The new tile reduces to ONE canonical lattice-class rep. If already present the branch
				// makes no progress (matches the old dedupModLattice length check). The child's block =
				// this block + the new rep's lattice translates — disjoint classes, so a plain set union;
				// no full rebuild (audit perf C1). Block order is irrelevant to every consumer.
				const pc = this.canonicalRep(P, ctx, memo);
				if (repsKeys.has(pc.key)) { if (FP) FP.c.dupRej++; return; } // P already present mod Λ ⇒ no progress
				const next = [...reps, pc.poly];
				if (next.length > ctx.maxCellPolys) { if (FP) FP.c.capRej++; return; }
				const childV = extendV(vReps, pc.poly);
				if (childV.length > ctx.orbitFloor) { diag.p1Pruned++; if (FP) FP.c.p1Pruned++; return; } // P1 orbit-floor prune (sound for stars: extendV excludes dents)
				// P3 stage B: the child's per-size counts must stay dominated by some F*(Λ) member —
				// else no completion can be an emitted cell (counts are monotone; see the header note).
				let childCounts: number[] | null = null;
				if (counts && sizeIdxOf) {
					childCounts = counts.slice();
					childCounts[sizeIdxOf.get(pc.poly.n)!]++;
					if (!dominated(childCounts)) { diag.p3Pruned++; return; }
				}
				const childBlock = block.concat(this.buildBlock([pc.poly], ctx, 5));
				stack.push({ reps: next, block: childBlock, vReps: childV, counts: childCounts });
				if (FP) FP.c.pushed++;
			};

			for (const n of ctx.polySizes) place(RegularPolygon.fromAnchorAndDirExact(n, w, d0));
			// C3: seat each seed star's POINT (the convex corner, interior α) into the gap. Dent-seating
			// (the Fig-3 dent-at-vertex class) is NOT yet attempted — flagged loudly below.
			for (const st of ctx.starTiles) place(ExactStarPolygon.isotoxal(st.n, st.alphaU, w, d0));
			if (FP) FP.t.expand += fpNow() - _t;
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

	/** TEST-ONLY differential harness (tests/certify-overlap-periodic.test.ts): build the certificate
	 *  block for a cell and run BOTH the old O(block²) overlap check and the RANK-1 periodic reduction,
	 *  so the test can assert they agree. Not used in production. Returns null on degenerate input. */
	_testOnlyBlockOverlap(cellPolygons: Polygon[], u: Cyclotomic, v: Cyclotomic): { old: boolean; periodic: boolean } | null {
		const ring = u.ring;
		const polySizes = Array.from(new Set(cellPolygons.filter((p) => !p.isStar).map((p) => p.n))).sort((a, b) => a - b);
		const ctx = this.makeCtx(u, v, ring, new Set(), polySizes.length ? polySizes : [3], Number.MAX_SAFE_INTEGER);
		if (!ctx) return null;
		const Rabs = ctx.cellDiam + 8;
		const block = this.buildBlock(cellPolygons, ctx, Rabs);
		return { old: this.blockHasProperOverlap(block, ctx), periodic: this.blockOverlapPeriodic(cellPolygons, block, ctx, Rabs) };
	}

	/** Exact gap-free certificate for a closed torus tiling (cell `reps` + lattice in ctx):
	 *  (a) no proper overlap in a block, (b) every vertex within one cell of the origin is fully
	 *  surrounded (2π) with an allowed VC, and (c) total cell area = |det Λ| (gap-free area check).
	 *  All three ⇒ the Λ-periodic extension is a valid edge-to-edge tiling with only allowed VCs.
	 *
	 *  If `occurringOut` is provided, every canonical VC name judged at a t≥3 vertex is added to it.
	 *  The collected set is COMPLETE (not a sample) ONLY when the certificate returns true: every
	 *  Λ-vertex class has a representative within judgeR = cellDiam + 0.5 of the origin (one full
	 *  cell), and the certificate judges all of them, so on a true return `occurringOut` holds the
	 *  full occurring VC-type set of the periodic tiling.  On a false return the set may be empty or
	 *  partial — early rejects (gap/over-full vertex, disallowed name) bail mid-collection. */
	isCompleteTiling(reps: Polygon[], ctx: FillCtx, occurringOut?: Set<string>, opDoom?: { vReps: Cyclotomic[]; diag: PeriodSolverDiag }): boolean {
		// (c) area: cell polygons must exactly cover one fundamental domain. CB-1: the DECISION is the
		// exact Surd comparison Σ tileAreaSurdFor(p) == |det Λ| (thesis leg (c): "equals |det Λ| exactly");
		// the float sum is kept as a broadphase PRE-REJECT only. Soundness of the broadphase: float error
		// is ≲1e-10 over ≤10³ tiles, so exact-equal cells always pass it (it can only reject cells the
		// exact test would also reject). Star-aware in both layers (exact shoelace = the tile's TRUE area,
		// not regularArea(n) — which would reject the valid 4(j) cell).
		const FP = FILL_PROF; // certify sub-phase timers (distortion-free: ~1 call/closure)
		let _c = FP ? fpNow() : 0;
		const area = reps.reduce((s, p) => s + tileAreaFloatFor(p), 0);
		if (Math.abs(area - ctx.cellArea) > 1e-4 * Math.max(1, ctx.cellArea)) { if (FP) FP.ct.area += fpNow() - _c; return false; }
		let areaSurd = Surd.ZERO;
		for (const p of reps) areaSurd = areaSurd.add(tileAreaSurdFor(p));
		const areaEq = areaSurd.cmp(ctx.cellAreaSurd) === 0;
		if (FP) FP.ct.area += fpNow() - _c;
		if (!areaEq) return false;

		_c = FP ? fpNow() : 0;
		const certRabs = ctx.cellDiam + 8;
		const block = this.buildBlock(reps, ctx, certRabs);
		if (FP) FP.ct.buildBlock += fpNow() - _c;

		// (b) every vertex within one cell is a fully-surrounded allowed VC. RANK-2: the vertex judge is
		// evaluated BEFORE the overlap leg (a) — order is irrelevant to the boolean result (both are AND-ed),
		// but doing it first lets the OP-1 short-circuit below skip the overlap leg for doomed closures.
		_c = FP ? fpNow() : 0;
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
			if (Math.abs(totalUnits - ctx.N) > 0.5) { if (FP) FP.ct.judge += fpNow() - _c; return false; } // not surrounded (gap) or over-full
			// A2: a 2-tile point at 2π is a legal dent-fill (Myers non-vertex), not a counted VC — accept
			// it without requiring an allowed-VC name. (Regular path: t≥3 always ⇒ this never fires.)
			const t = new Set(polys.map(({ p }) => p.exactKey())).size;
			if (t < 3) continue;
			const name = canonicalVCName(this.vcRingNames(v, polys));
			if (!ctx.allowed.has(name)) { if (FP) FP.ct.judge += fpNow() - _c; return false; }
			occurringOut?.add(name);
		}
		if (FP) FP.ct.judge += fpNow() - _c;
		if (judged === 0) return false;

		// RANK-2 (prop:typeprune, moved BEFORE the overlap leg): on the non-star closure path (`opDoom`
		// provided), a cell whose vertex-class count V < k, or whose occurring VC-type set ⊊ the seed's
		// allowed set, can never be a valid k-uniform tiling of THIS seed — the caller discards it either
		// way. Deciding here skips the (Rank-1-reduced) overlap leg for those ~40% of closures. Output is
		// byte-identical (the cell is not emitted regardless); only the diag counters move earlier — a cell
		// that is BOTH doomed AND has a non-vertex interior overlap now counts in vBelowK/p2 instead of an
		// uncounted overlap-reject (rare/none for the regular catalogue, since overlaps surface as over-full
		// vertices already caught by the judge above). OFF for stars (opDoom undefined ⇒ full certificate). */
		if (opDoom) {
			if (opDoom.vReps.length < this.k) { opDoom.diag.vBelowKSkipped++; return false; }
			if (occurringOut && occurringOut.size !== ctx.allowed.size) { opDoom.diag.p2Skipped++; return false; }
		}

		// (a) no proper overlap. RANK-1: periodic reduction (reps-vs-block) — byte-identical to the old
		// O(block²) all-pairs check under the reach guard (see blockOverlapPeriodic), O(reps·block).
		_c = FP ? fpNow() : 0;
		const hasOverlap = this.blockOverlapPeriodic(reps, block, ctx, certRabs);
		if (FP) FP.ct.overlap += fpNow() - _c;
		if (hasOverlap) return false;

		return true;
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
	 *  minima, see there). Pre-P0, pre-orbit-reduction universe on purpose (a P0-skipped primitive is
	 *  a licensed discard — see `candidateLattices`; a reduction-deleted member's fills are conserved
	 *  on its representative). Two provably-harmless miss classes are filtered before alarming:
	 *  (1) candidate-set hit — any canonical key of any of the ≤ 2N G-IMAGES of the closure
	 *  (rem:orbitdedup constraint 3, identity first); (2) primitive area outside the seed's admissible
	 *  area set — then the tiling cannot carry this seed's orbit-VC multiset (the area filter's own
	 *  Euler/incidence completeness contract) and is another seed's tiling (observed live: pure-
	 *  triangle 1-uniform supercell completions inside multi-VC k=2 seeds). Anything else is a
	 *  certified tiling discarded with no candidate to re-find it — the silent-loss mode CB-7 exists
	 *  to surface; emit ⚑ INCOMPLETE-REGION per occurrence. NB the guard alarms CONSERVATIVELY: it
	 *  fires ~100×/k=3 sweep (same count on the pre-branch baseline and all three branch sweeps),
	 *  every one an over-alarm — the 61/61 oracle bijection affirms no tiling is lost. A jump in the
	 *  count above that stable baseline is the discovery signal, not any firing at all. */
	private supercellRejectionGuard(ctx: FillCtx, witnesses: Cyclotomic[], diag: PeriodSolverDiag): void {
		diag.supercellRejected++;
		const closure = primitiveLatticeClosure(ctx.u, ctx.v, witnesses);
		if (closure !== null) {
			// rem:orbitdedup constraint 3 (OP-3): after the orbit reduction the cell being filled may
			// be a g⁻¹-seeded stand-in for a deleted orbit member, so the rejected tiling's primitive
			// lattice can have been enumerated only as a G-IMAGE of this witness closure — a
			// single-identity membership test would false-alarm on reduced orbits. Range the test
			// over the ≤ 2N grid images (identity FIRST: rot=0/refl=false is the historical
			// pre-reduction hit and the common fast path). Membership in the PRE-reduction universe
			// (`candidateKeys` = allKeys) is the right test: a deleted member's fills are conserved
			// on its representative (constraint 2), so an enumerated G-image re-finds the tiling.
			// Rare path: runs only on supercell rejection.
			for (let rot = 0; rot < ctx.N; rot++) {
				for (const refl of [false, true]) {
					const [ga, gb] = gridImageBasis(closure[0], closure[1], rot, refl);
					for (const kk of latticeKeySet(ga, gb)) {
						if (ctx.candidateKeys.has(kk)) return; // primitive lattice (up to G) IS a candidate — sound discard
					}
				}
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
		// CB-6: the true overlap-impossibility radius is R_P + R_q (sum of circumradii). The old
		// constant 2.5 was geometrically FALSE for 8/12-gons (unit-edge 12-gon R ≈ 1.932 ⇒ pairs
		// overlap out to ≈ 3.86; octagon R ≈ 1.307 ⇒ ≈ 2.61): real overlaps at centroid distance
		// 2.5–3.86 were skipped here, admitted into the DFS, and died only downstream (angular
		// contradiction or the blockHasProperOverlap certificate backstop) — dead subtrees on
		// exactly the 8/12-gon-heavy fills. R_P + ctx.maxCircum ≥ R_P + R_q is sound for every q
		// (and tighter than any constant for small P); the 1e-9 slack absorbs float rounding in
		// the radius/distance arithmetic so the cull never under-reaches.
		let circumP = 0;
		for (const w of P.vertices) circumP = Math.max(circumP, Math.hypot(w.x - pc.x, w.y - pc.y));
		const cullR = circumP + ctx.maxCircum + 1e-9;
		for (const q of block) {
			if (q.exactKey() === pKey) continue;
			const qc = q.exactCentroid!.toVector();
			if (Math.hypot(pc.x - qc.x, pc.y - qc.y) > cullR) continue; // beyond R_P+R_q ⇒ cannot overlap
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

	/** True iff two distinct (non-coincident) tiles in the block properly overlap. O(|block|²). */
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

	/** RANK-1 optimization: periodic reduction of `blockHasProperOverlap`. The block is a union of Λ-
	 *  translates of the fundamental `reps`, so any proper overlap A∩B has a rep witness: translate A onto
	 *  its rep rep_a, and B onto rep_b+(λ_B−λ_A); then rep_a overlaps that translate, which lies within
	 *  cellDiam+2·maxCircum of the origin — inside the block when its reach (Rabs+cellDiam+2) covers that.
	 *  So `reps.some(rep ⇒ rep overlaps a block tile)` finds EXACTLY the same overlaps as the O(|block|²)
	 *  all-pairs scan, in O(|reps|·|block|) (and it reuses properOverlapWithBlock's cullR distance cull,
	 *  which blockHasProperOverlap lacks). NEW-true ⟹ OLD-true unconditionally (never drops a valid tiling);
	 *  NEW≡OLD given the reach guard (never wrongly accepts an overlapping cell). Differential-tested
	 *  byte-identical to blockHasProperOverlap over the certified k≤3 catalogue + constructed overlaps
	 *  (tests/certify-overlap-periodic.test.ts).
	 *
	 *  Guard (EXACT witness-containment, not a maxCircum proxy): the rep witness rep_b+(λ_B−λ_A) that
	 *  properOverlapWithBlock must find sits at |centroid| ≤ (canonicalRep reach 1.5·cellDiam+0.1) +
	 *  2·maxCircum, and buildBlock keeps tiles with centroid ≤ limit = Rabs+cellDiam+2. So the reduction is
	 *  sound iff 1.5·cellDiam+0.1+2·maxCircum ≤ Rabs+cellDiam+2. The old `2·maxCircum ≤ Rabs+2` proxy omitted
	 *  the 1.5·cellDiam canonicalRep reach — adequate only because maxCircum ≤ 1.932 over {3,4,6,8,12} sits
	 *  far below both thresholds, but a future large-circumradius star (acute isotoxal point, circum > ~5)
	 *  could slip the gap silently (Rank-1 review, 2026-07-09). This exact condition never trips the certify
	 *  leg (Rabs=cellDiam+8) for the regular palette ⇒ byte-identical/digest-unchanged there, closes the
	 *  setup-leg gap too, and falls back to the exact O(|block|²) check with a loud flag when it can't be
	 *  guaranteed (correctness over speed — never a silent wrong-accept). */
	private blockOverlapPeriodic(reps: Polygon[], block: Polygon[], ctx: FillCtx, Rabs: number): boolean {
		if (1.5 * ctx.cellDiam + 0.1 + 2 * ctx.maxCircum > Rabs + ctx.cellDiam + 2) {
			process.stderr.write(
				`[PeriodSolver k=${this.k}] ⚑ blockOverlapPeriodic witness-containment guard: ` +
				`1.5·cellDiam+0.1+2·maxCircum ${(1.5 * ctx.cellDiam + 0.1 + 2 * ctx.maxCircum).toFixed(2)} > block reach ` +
				`${(Rabs + ctx.cellDiam + 2).toFixed(2)} — a rep's overlap partner may escape the block; falling back to O(block²)\n`
			);
			return this.blockHasProperOverlap(block, ctx);
		}
		return reps.some((rep) => this.properOverlapWithBlock(rep, block, ctx));
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

export type FillCtx = {
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
	gate?: (reps: Polygon[]) => number | null; // EARLY k-GATE orbit-count fn — the SAME function the post-pass gate uses (checker.countVertexOrbits, or countVertexOrbitsFast under PS_FAST_GATE). Set ONLY on the enumeration path (solve); undefined on the single-cell verify paths ⇒ no early gate there. When present, torusFill rejects a closed cell with orbit count ≠ k before the certificate — sound reject-only.
	feasVectors?: number[][]; // P3 stage B: F*(Λ) — Pareto-maximal feasible per-size tile counts (aligned to polySizes ascending). Set ONLY on the enumeration path at k ≥ 3 for regular seeds (same scope as the C pre-filter); undefined ⇒ the domination prune is off and the fill is byte-identical to pre-P3 behavior.
};

type Interval = { start: number; units: number; n: number };

type AnalyzeResult = {
	contradiction: boolean;
	openVertex?: { vertex: Cyclotomic; intervals: Interval[] };
	block?: Polygon[];
};

function emptyDiag(): PeriodSolverDiag {
	return { candidateLattices: 0, latticesTried: 0, rawCells: 0, emitted: 0, gateRejected: 0, earlyGateRejected: 0, fanLattices: 0, p0Skipped: 0, cSkipped: 0, orbitSkipped: 0, p1Pruned: 0, p3Pruned: 0, p2Skipped: 0, vBelowKSkipped: 0, seedStateDedup: 0, obliqueCandidates: 0, obliqueTruncated: null, supercellRejected: 0, primitivityGuardMisses: 0, primitivityGuardAreaSuppressed: 0, starLadderTruncated: false, blockIndexCapTruncated: 0, timedOut: false };
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
export function latticeEquivExact(a: Cyclotomic, b: Cyclotomic, u: Cyclotomic, v: Cyclotomic): boolean {
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
