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
import { Cyclotomic } from '../Cyclotomic';
import { KUniformityChecker } from './KUniformityChecker';
import { TranslationalCellExtractor } from './TranslationalCellExtractor';
import type { SeedConfigurationLike } from './SeedExpander';
import { LatticeEnumerator, latticeKey, shortVectorPool, edgeStepDirs, gridDirOf, vcAreaSet } from './LatticeEnumerator';
import { detSurd } from './exact/Surd';
import { dedupeByCongruence } from './TilingCongruence';

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

/** Seed-free candidate lattices depend only on (ring, tile set, k) — computed once and cached. */
const candidateCache = new Map<string, [Cyclotomic, Cyclotomic][]>();

/** Canonical vertex-configuration name from a cyclic list of polygon edge-counts — minimal over
 *  rotations AND reflection (a VC and its mirror share a name; matches the seed-build convention). */
function canonicalVCName(ns: number[]): string {
	const rotMin = (a: number[]): string => {
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
	timedOut: boolean;
};

export type PeriodSolverOptions = {
	/** Hard cap on polygons per fundamental cell (a runaway / wrong-Λ backstop). Default 20·k+24. */
	maxCellPolys?: number;
	/** Wall-clock cap (ms) for the whole solve (0 = unlimited). Default 45000. */
	maxMs?: number;
	verbose?: boolean;
	/** Debug hook: called for every completed primitive cell, BEFORE the k-gate filter. */
	onRawCell?: (cell: Polygon[], basis: [Cyclotomic, Cyclotomic], orbits: number | null) => void;
};

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
		const maxCellPolys = opts.maxCellPolys ?? 20 * k + 24;
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
		const polySizes = Array.from(new Set(corePolys.map((p) => p.n))).sort((a, b) => a - b);

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
		const totalCoreArea = corePolys.reduce((s, p) => s + regularArea(p.n), 0);

		// --- 1. Candidate lattices (seed-free algebraic enumeration, cached). ---
		const _tc0 = prof ? Date.now() : 0;
		const lattices = this.candidateLattices(seed);
		if (prof) prof.cand += Date.now() - _tc0;

		const diag: PeriodSolverDiag = {
			candidateLattices: lattices.length,
			latticesTried: 0,
			rawCells: 0,
			emitted: 0,
			gateRejected: 0,
			fanLattices: 0,
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
			const ctx = this.makeCtx(u, v, ring, allowed, polySizes, maxCellPolys);
			if (!ctx) continue; // degenerate basis

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
			for (const core of seedSets) {
				if (maxMs > 0 && Date.now() - start > maxMs) { diag.timedOut = true; break; }
				const _tf0 = prof ? Date.now() : 0;
				rawCells.push(...this.torusFill(core, ctx, () => maxMs > 0 && Date.now() - start > maxMs));
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
			`gateRej=${diag.gateRejected} fanLat=${diag.fanLattices}\n`
		);

		if (opts.verbose) {
			process.stderr.write(
				`[PeriodSolver k=${k}] lattices=${diag.candidateLattices} tried=${diag.latticesTried} ` +
				`raw=${diag.rawCells} emitted=${diag.emitted} gateRej=${diag.gateRejected} fanLat=${diag.fanLattices}` +
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
	private candidateLattices(seed: SeedConfigurationLike): [Cyclotomic, Cyclotomic][] {
		const ring = seed.polygons[0].exactVertices![0].ring;
		const polySizes = Array.from(new Set(seed.polygons.map((p) => p.n))).sort((a, b) => a - b);
		// Tile-incidence per VC (n → #n-gons at that vertex) — drives the VC-area filter.
		const vcIncidences = seed.vertexConfigurations.map((vc) => {
			const m = new Map<number, number>();
			for (const p of vc.polygons) m.set(p.n, (m.get(p.n) ?? 0) + 1);
			return m;
		});
		const vcSig = vcIncidences
			.map((m) => [...m.entries()].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n}^${c}`).join('.'))
			.sort()
			.join('|');
		const cacheKey = `${ring.N}:${vcSig}:${this.k}`;
		const cached = candidateCache.get(cacheKey);
		if (cached) return cached;

		const lat = new LatticeEnumerator(this.k);
		// Completeness knobs scale with k. k≤2 keeps the validated 6/5.6 pool and the small short-side
		// caps; k≥3 grows the pool reach (the longest k=3 oracle cell vector is 6.732 > POOL_LMAX=5.6 and
		// needs ≥7 > POOL_STEPS=6 edge-steps) and LOOSENS the short-side caps to the pool length so larger
		// k≥3 short vectors / off-grid round cells are not dropped. ⚑ COMPLETENESS: these bounds are sized
		// to the KNOWN oracle maxima (k=3 longest = 6.732), NOT proven — a tiling whose cell vector exceeds
		// the pool reach would be silently missed, and a longer pool blows up the dense ring (24-dir octagon
		// seeds → ~700k pts; see §13.6 / §11.5). Revisit for a real completeness bound + the dense case.
		const poolSteps = this.k <= 2 ? POOL_STEPS : 2 * this.k + 2; // k=3→8, k=4→10
		const poolLmax = this.k <= 2 ? POOL_LMAX : Math.sqrt(22 * this.k); // k=3→8.12, k=4→9.38
		const compactOffMax2 = this.k <= 2 ? COMPACT_OFFGRID_MAX2 : poolLmax * poolLmax;
		const gridShortMax2 = this.k <= 2 ? GRID_SHORT_MAX2 : poolLmax * poolLmax;
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
		const aMax = Math.max(...polySizes.map(regularArea));
		const areaBoundF = 24 * this.k * aMax;
		// Exact cell areas the seed's VCs can actually produce (the tile multiset is forced by the VCs,
		// not any tile sum). Sound + complete; far sparser than the generic ladder ⇒ many fewer spurious
		// candidates reaching torusFill.
		const areas = vcAreaSet(vcIncidences, areaBoundF);

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
		// is a long wiggly edge-path with no symmetry reason to be a period, so it is pruned.
		const roundPool = pool.filter((p) => {
			if (gridDirOf(p, ring) !== null) return true;
			const f = p.toVector();
			return f.x * f.x + f.y * f.y <= compactOffMax2;
		});
		for (const [u, v] of lat.roundCells(roundPool, polySizes, ring, areaBoundF, undefined, areas)) push(u, v);

		// (B) grid-aligned (rect + cmm) cells — short side from the SHORT pool vectors; the solved
		// long/centering vector must itself be a realizable vertex difference.
		const gridShorts = pool.filter((p) => {
			const f = p.toVector();
			return f.x * f.x + f.y * f.y <= gridShortMax2;
		});
		for (const [u, v] of lat.gridAlignedCells(gridShorts, polySizes, ring, undefined, areas)) {
			if (poolSet.has(v.key())) push(u, v);
		}

		// shortest cells first (exact area) — torusFill is cheapest on small lattices.
		lattices.sort((a, b) => detSurd(a[0], a[1]).abs().cmp(detSurd(b[0], b[1]).abs()));
		candidateCache.set(cacheKey, lattices);
		return lattices;
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
		maxCellPolys: number
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
		const minTileArea = Math.min(...polySizes.map(regularArea));
		const areaCap = Math.ceil(cellArea / minTileArea) + 2;
		// Largest tile circumradius (regular n-gon = 1/(2 sin(π/n))) — used to cull far tiles from the
		// per-pop incidence map (a tile beyond judgeR + maxCircum has no vertex within judgeR).
		const maxCircum = Math.max(...polySizes.map((n) => 1 / (2 * Math.sin(Math.PI / n))));
		return {
			u, v, ring, N: ring.N, allowed, polySizes,
			maxCellPolys: Math.min(maxCellPolys, areaCap),
			uV, vV, det, cellDiam, minLen, cellArea, maxCircum,
		};
	}

	/** Debug switch (temporary): trace torus-fill decisions to stderr. */
	static DEBUG = false;

	/** All complete torus tilings extending the seed core under the fixed lattice in `ctx`.
	 *  Each result is one representative polygon per lattice class (a fundamental cell). */
	private torusFill(corePolys: Polygon[], ctx: FillCtx, timedOut: () => boolean): Polygon[][] {
		const memo = new Map<string, { key: string; poly: Polygon }>();
		// Initial cell = seed polygons reduced into canonical lattice-class representatives.
		const initial = this.dedupModLattice(corePolys, ctx, memo);
		if (PeriodSolver.DEBUG) process.stderr.write(`  torusFill: initial reps=${initial.length} det=${ctx.det.toFixed(3)} cellDiam=${ctx.cellDiam.toFixed(3)}\n`);
		// Microsecond reject (no block): the DISTINCT core polygons mod Λ all live in one cell, so their
		// total area cannot exceed the cell area |det Λ|. A too-small / wrong candidate is killed in
		// O(reps) before the expensive block build. Sound (a necessary condition for any fitting).
		let initialArea = 0;
		for (const p of initial) initialArea += regularArea(p.n);
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

		const results: Polygon[][] = [];
		const seenState = new Set<string>();
		const stack: { reps: Polygon[]; block: Polygon[] }[] = [{ reps: initial, block: initialBlock }];
		let pops = 0;
		const t0 = PeriodSolver.DEBUG ? Date.now() : 0;

		while (stack.length > 0) {
			if (timedOut()) break;
			const { reps, block } = stack.pop()!;
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
				// would over-count; the primitive Λ is a separate, smaller candidate that is kept).
				if (this.isCompleteTiling(reps, ctx) && this.isPrimitive(reps, ctx, memo)) results.push(reps);
				continue;
			}

			// Corner-complete the chosen open vertex: place one polygon into its CW-most gap.
			const { vertex: w, intervals } = analysis.openVertex;
			const d0 = this.gapStartRay(intervals, ctx.N);
			if (d0 < 0) continue; // no fillable gap (shouldn't happen for an open vertex)
			const repsKeys = new Set(reps.map((r) => r.exactKey())); // reps are canonical class reps

			for (const n of ctx.polySizes) {
				const P = RegularPolygon.fromAnchorAndDirExact(n, w, d0);
				if (this.properOverlapWithBlock(P, block, ctx)) continue;
				// The new tile reduces to ONE canonical lattice-class rep. If already present the branch
				// makes no progress (matches the old dedupModLattice length check). The child's block =
				// this block + the new rep's lattice translates — disjoint classes, so a plain set union;
				// no full rebuild (audit perf C1). Block order is irrelevant to every consumer.
				const pc = this.canonicalRep(P, ctx, memo);
				if (repsKeys.has(pc.key)) continue; // P already present mod Λ ⇒ no progress
				const next = [...reps, pc.poly];
				if (next.length > ctx.maxCellPolys) continue;
				const childBlock = block.concat(this.buildBlock([pc.poly], ctx, 5));
				stack.push({ reps: next, block: childBlock });
			}
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
				// surrounded: VC must be allowed, else this branch can never be valid
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
			const len = p.n;
			const dOut = p.edgeDirs![idx]; // v → next vertex
			const units = (N * (p.n - 2)) / (2 * p.n);
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

	/** Ring-ordered polygon edge-counts around vertex `v` (CCW by edge direction) — for the VC name. */
	private vcRingNames(v: Cyclotomic, polys: { p: Polygon; idx: number }[], N = polys[0].p.ring!.N): number[] {
		const sorted = polys
			.map(({ p, idx }) => ({ n: p.n, start: ((p.edgeDirs![idx] % N) + N) % N }))
			.sort((a, b) => a.start - b.start);
		return sorted.map((s) => s.n);
	}

	// ---------------------------------------------------------------------------
	// Completeness certificate
	// ---------------------------------------------------------------------------

	/** Exact gap-free certificate for a closed torus tiling (cell `reps` + lattice in ctx):
	 *  (a) no proper overlap in a block, (b) every vertex within one cell of the origin is fully
	 *  surrounded (2π) with an allowed VC, and (c) total cell area = |det Λ| (gap-free area check).
	 *  All three ⇒ the Λ-periodic extension is a valid edge-to-edge tiling with only allowed VCs. */
	isCompleteTiling(reps: Polygon[], ctx: FillCtx): boolean {
		// (c) area: cell polygons must exactly cover one fundamental domain.
		const area = reps.reduce((s, p) => s + regularArea(p.n), 0);
		if (Math.abs(area - ctx.cellArea) > 1e-4 * Math.max(1, ctx.cellArea)) return false;

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
		for (const p of reps) area += regularArea(p.n);
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
	 *  would be double-counted; its primitive sublattice is a separate (smaller) candidate, so
	 *  rejecting supercells here loses no tiling. Test: any same-name rep-pair difference t that maps
	 *  every class onto a class is a sub-lattice period ⇒ non-primitive. */
	private isPrimitive(reps: Polygon[], ctx: FillCtx, memo: Map<string, { key: string; poly: Polygon }>): boolean {
		if (reps.length <= 1) return true;
		const repKeys = new Set(reps.map((r) => r.exactKey())); // reps are canonical
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
				if (all) return false; // sub-lattice translation t (∉ Λ, distinct classes) ⇒ non-primitive
			}
		}
		return true;
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
		const Mm = Math.min(60, Math.ceil((limit * lv) / area) + 1);
		const Mn = Math.min(60, Math.ceil((limit * lu) / area) + 1);
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

	/** Canonical (mirror-merged) VC name at a vertex from the polygons touching it (angular order). */
	private vcNameAt(vertex: Cyclotomic, polys: Polygon[]): string {
		const vf = vertex.toVector();
		const withAngle = polys.map((p) => ({
			n: p.n,
			a: Math.atan2(p.centroid.y - vf.y, p.centroid.x - vf.x),
		}));
		withAngle.sort((x, y) => x.a - y.a);
		return canonicalVCName(withAngle.map((w) => w.n));
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
	maxCircum: number; // max tile circumradius — a poly beyond judgeR+this has no vertex within judgeR
};

type Interval = { start: number; units: number; n: number };

type AnalyzeResult = {
	contradiction: boolean;
	openVertex?: { vertex: Cyclotomic; intervals: Interval[] };
	block?: Polygon[];
};

function emptyDiag(): PeriodSolverDiag {
	return { candidateLattices: 0, latticesTried: 0, rawCells: 0, emitted: 0, gateRejected: 0, fanLattices: 0, timedOut: false };
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
