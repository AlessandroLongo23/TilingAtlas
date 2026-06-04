/**
 * Deterministic candidate period-lattice enumeration for `PeriodSolver`.
 *
 * The long-thin grid-aligned cells (square / rectangular / centered-rectangular `cmm`) that the
 * difference discovery misses are enumerated here WITHOUT any search of the long axis: a periodic
 * tiling's cell has its conventional (mirror) axes on the 24-direction grid (multiples of 15°), and
 * the long side length is **pinned by the exact area ladder** — for a known short side `u` (a grid
 * vector from the cheap difference pool) and a candidate cell area `A` (an exact sum of tile areas),
 * the perpendicular side has length `A/|u|`. Restricting to the grid directions makes this finite
 * (one long vector per (u, A)) — it sidesteps the density of ℤ[ζ₂₄] that makes a free
 * "fix-short-solve-long" infinite.
 *
 * See docs/LATTICE_ENUMERATION_DESIGN.md and the plan; this realises the "grid-aligned cmm/rect"
 * half. The tilted/round cells (snub-type) come from the difference pool, unioned in `PeriodSolver`.
 */
import { Cyclotomic } from "../Cyclotomic";
import { Surd, tileAreaSurd, detSurd, imSurd, reSurd, surdToCyclotomic } from "./exact/Surd";

/** Largest denominator a realizable lattice vector can carry (vertex/centroid differences). */
const MAX_LATTICE_DEN = 12n;
/** Cheap pre-filter: a solved length whose surd denominator exceeds this is not grid-realizable. */
const DEN_PREFILTER = 48n;
/** Cap on the area-ladder size (logged truncation, never silent). */
const LADDER_SIZE_CAP = 4000;
/** Max times one vertex orbit can appear in a primitive translation cell: |P| ≤ 12 (the largest 2D
 *  crystallographic point group, D₆). Bounds `vcAreaSet` to genuine k-uniform cell areas. */
const MAX_ORBIT_VERTICES = 12;
/** Minimum side length for a grid-aligned cell to be emitted (skips near-degenerate slivers; every
 *  real k≤2 rect/cmm cell has both sides ≥ 1 and is kept). The realizable-vector filter in
 *  `PeriodSolver.candidateLattices` (long axis must be an actual vertex difference in the pool) is
 *  what bounds the count, so this can be loose without flooding candidates. */
const LONG_AXIS_MIN = 1.0;

export class LatticeEnumerator {
	constructor(private readonly k: number) {}

	/**
	 * Grid-aligned rectangular (index 1) and centered-rectangular `cmm` (index 2) candidate lattices.
	 * @param shortVecs  short candidate vectors from the difference pool (only the grid-aligned ones
	 *                   are used as the known short side).
	 * @param polySizes  the tile sizes available in the seed (drives the exact area ladder).
	 * @param ring       the active ℤ[ζ₂₄] ring.
	 * @param onTruncate called if the area ladder hit its structural cap (so truncation is never silent).
	 */
	gridAlignedCells(
		shortVecs: Cyclotomic[],
		polySizes: number[],
		ring: Cyclotomic["ring"],
		onTruncate?: () => void,
		areasOverride?: Surd[]
	): [Cyclotomic, Cyclotomic][] {
		const areas = areasOverride ?? this.areaLadder(polySizes, onTruncate);
		// the grid-aligned subset of the difference pool, with each one's exact length + direction
		const shorts: { u: Cyclotomic; m: number; len: Surd; lenF: number }[] = [];
		const seenShort = new Set<string>();
		for (const u of shortVecs) {
			const gd = gridDirOf(u, ring);
			if (!gd) continue;
			const sk = `${gd.m}:${areaKey(gd.len)}`;
			if (seenShort.has(sk)) continue;
			seenShort.add(sk);
			shorts.push({ u, m: gd.m, len: gd.len, lenF: gd.len.toFloat() });
		}

		const out: [Cyclotomic, Cyclotomic][] = [];
		const seen = new Set<string>();
		// structural dedup key (basis-shape, not Gauss-reduced — the costly latticeKey is paid once, in
		// the union dedup back in PeriodSolver) + the realizable-denominator guard.
		const emit = (a: Cyclotomic, b: Cyclotomic, structKey: string): void => {
			if (seen.has(structKey)) return;
			seen.add(structKey);
			if (a.den > MAX_LATTICE_DEN || b.den > MAX_LATTICE_DEN) return;
			out.push([a, b]);
		};

		for (const { u, m, len, lenF } of shorts) {
			if (lenF < 0.9) continue;
			const perp = (m + 6) % ring.N;
			const lk = areaKey(len);
			for (const A of areas) {
				const aF = A.toFloat();
				// index 1 — rectangle (u ⊥ v), |v| = A / |u|. Long axis = |v|.
				const hF = aF / lenF;
				if (hF >= LONG_AXIS_MIN || lenF >= LONG_AXIS_MIN) {
					const h = A.div(len);
					if (h.D <= DEN_PREFILTER)
						emit(u, surdToCyclotomic(h, ring).mulZeta(perp), `1:${m}:${lk}:${areaKey(A)}`);
				}
				// index 2 — centered (cmm): conventional height 2A/|u| (the long axis); primitive =
				// (u, centering).
				const hcF = (2 * aF) / lenF;
				if (hcF >= LONG_AXIS_MIN) {
					const hc = A.scaleRational(2n, 1n).div(len);
					if (hc.D <= DEN_PREFILTER) {
						const long = surdToCyclotomic(hc, ring).mulZeta(perp);
						emit(u, u.add(long).scaleRational(1n, 2n), `2:${m}:${lk}:${areaKey(A)}`);
					}
				}
			}
		}
		return out;
	}

	/**
	 * "Round" (high-symmetry) candidate cells: similar sublattices of the hexagonal and square base
	 * lattices, `(v, v·ω)` and `(v, v·i)`, for every short vector `v` in the pool whose resulting cell
	 * area lands on the exact area ladder (≤ `areaBoundF`). These cover the hexagonal and square
	 * Bravais classes — including the OFF-GRID snub cell `t2020` (multiplier `3+ω`, |c|²=13), which no
	 * grid-direction enumeration can reach. `v` ranges over the FULL pool (not deduped by length:
	 * distinct directions at the same length give distinct lattices), with `latticeKey` collapsing
	 * rotation/reflection duplicates. ω = ζ^(N/6) (e^{iπ/3}), i = ζ^(N/4).
	 */
	roundCells(
		pool: Cyclotomic[],
		polySizes: number[],
		ring: Cyclotomic["ring"],
		areaBoundF: number,
		onTruncate?: () => void,
		areasOverride?: Surd[]
	): [Cyclotomic, Cyclotomic][] {
		const areas = areasOverride ?? this.areaLadder(polySizes, onTruncate, areaBoundF);
		const ladderSet = new Set(areas.map(areaKey));
		const omega = Cyclotomic.zeta(ring, ring.N / 6); // e^{iπ/3} — hexagonal
		const imag = Cyclotomic.zeta(ring, ring.N / 4); // i — square
		const out: [Cyclotomic, Cyclotomic][] = [];
		const seen = new Set<string>();
		for (const v of pool) {
			for (const rot of [omega, imag]) {
				const b = v.mul(rot);
				const A = detSurd(v, b).abs();
				if (A.toFloat() > areaBoundF + 1e-9) continue;
				if (!ladderSet.has(areaKey(A))) continue; // area must be an exact sum of tile areas
				const lk = latticeKey(v, b);
				if (seen.has(lk)) continue;
				seen.add(lk);
				out.push([v, b]);
			}
		}
		return out;
	}

	/**
	 * Distinct exact cell areas realizable as Σ tₙ·area(n) with `n ∈ polySizes`. Bounded by the orbit
	 * count (F ≤ 24k tiles per primitive cell) AND a practical area cap (`16k`, comfortably above every
	 * k≤2 cell), deduped exactly, pruned by area, size-capped. `onTruncate` fires if either cap bites —
	 * truncation is logged, never silent (a missed cell would surface there).
	 */
	private areaLadder(polySizes: number[], onTruncate?: () => void, maxAreaOverride?: number): Surd[] {
		const tiles = [...new Set(polySizes)].sort((a, b) => a - b).map(tileAreaSurd);
		const maxTileF = Math.max(...tiles.map((t) => t.toFloat()));
		const orbitBoundF = 24 * this.k * maxTileF; // F ≤ 24k ⇒ area ≤ 24k·maxTileArea
		const maxAreaF = maxAreaOverride ?? Math.min(orbitBoundF, 8 * this.k);
		const maxTiles = 24 * this.k;
		const seen = new Map<string, Surd>();
		const visited = new Set<string>([areaKey(Surd.ZERO)]);
		let frontier: Surd[] = [Surd.ZERO];
		let truncated = maxAreaF < orbitBoundF; // practical cap below the sound bound ⇒ already truncating
		for (let count = 1; count <= maxTiles && frontier.length > 0 && seen.size < LADDER_SIZE_CAP; count++) {
			const next: Surd[] = [];
			for (const a of frontier) {
				for (const t of tiles) {
					const s = a.add(t);
					if (s.toFloat() > maxAreaF + 1e-9) continue;
					const key = areaKey(s);
					if (visited.has(key)) continue;
					visited.add(key);
					seen.set(key, s);
					next.push(s);
					if (seen.size >= LADDER_SIZE_CAP) {
						truncated = true;
						break;
					}
				}
				if (seen.size >= LADDER_SIZE_CAP) break;
			}
			frontier = next;
		}
		if (truncated) onTruncate?.();
		const out = [...seen.values()];
		out.sort((a, b) => a.cmp(b));
		return out;
	}
}

/**
 * The exact cell areas a k-uniform tiling with these vertex configurations can actually have.
 *
 * A translation cell with `V_i` vertices of (distinct) VC-type `i` contains, of each n-gon,
 * `(Σ_i V_i·c_{i,n}) / n` tiles — an integer (each n-gon is shared by its n corners) — so its area is
 * `Σ_n area(n)·#n-gons`. This is the tile multiset FORCED by the VCs, a sparse set over `V_i ≥ 1`
 * (every vertex orbit appears in the translation cell) — far sharper than "any sum of tile areas", yet
 * sound: every real cell's area lies in its own seed's set. `vcIncidences[i]` maps n → #n-gons at a
 * vertex of VC i. Areas are bounded by `areaBoundF`; VCs with identical tile counts are merged.
 */
export function vcAreaSet(vcIncidences: Map<number, number>[], areaBoundF: number): Surd[] {
	// One entry per VC ORBIT (k of them) — not deduped, so the per-orbit count bound below is exact.
	const types = vcIncidences;
	if (types.length === 0) return [];
	// per-orbit average area per vertex (Σ_n area(n)·c_{i,n}/n) — exact float, for the recursion bound.
	const perVertexF = types.map((t) =>
		[...t.entries()].reduce((s, [n, c]) => s + (tileAreaSurd(n).toFloat() * c) / n, 0)
	);
	const out = new Map<string, Surd>();
	const rec = (idx: number, inc: Map<number, number>, partialF: number): void => {
		if (idx === types.length) {
			let area = Surd.ZERO;
			for (const [n, c] of inc) {
				if (c % n !== 0) return; // a fractional tile count ⇒ not a realizable cell
				area = area.add(tileAreaSurd(n).scaleRational(BigInt(c / n), 1n));
			}
			if (!area.isZero() && area.toFloat() <= areaBoundF + 1e-9) out.set(areaKey(area), area);
			return;
		}
		const type = types[idx];
		// Each orbit appears 1..|P| times in the translation cell (|P| ≤ 12, the crystallographic max);
		// V_i > 12 would be a higher-k or super-cell, not a primitive k-uniform cell here. Sound bound —
		// it excludes the large wrong-orbit fills that the gate would otherwise reject expensively.
		for (let v = 1; v <= MAX_ORBIT_VERTICES; v++) {
			const next = new Map(inc);
			for (const [n, c] of type) next.set(n, (next.get(n) ?? 0) + c * v);
			const pf = partialF + perVertexF[idx] * v;
			if (pf > areaBoundF + 1e-9) break; // area strictly increases with v ⇒ safe to stop
			rec(idx + 1, next, pf);
		}
	};
	rec(0, new Map(), 0);
	const list = [...out.values()];
	list.sort((a, b) => a.cmp(b));
	return list;
}

/**
 * For each realizable cell area (same enumeration as `vcAreaSet`), the MINIMUM number of vertex
 * classes `V = Σ_i V_i` over the VC-orbit multiplicity assignments that produce that exact area.
 * Keyed by `areaKey`. This is the data the **P0 lattice pre-filter** consumes: a candidate lattice Λ
 * is skippable when `minVerts(|det Λ|) > k · hol(Λ)`, because every tile multiset realizing that area
 * already needs more vertex classes than `k · hol(Λ)` allows, so its completion has > k orbits
 * (`orbits ≥ V / hol(Λ)`) — a sound prune (`route-a-proven-box.md` §"Early-prune rulings", P0). The
 * Euler relation `V = Σ_i V_i = Σ_n t_n·(n−2)/2` holds for every assignment, so summing the orbit
 * multiplicities is exactly the torus vertex count.
 */
export function vcAreaMinVerts(vcIncidences: Map<number, number>[], areaBoundF: number): Map<string, number> {
	const types = vcIncidences;
	const out = new Map<string, number>();
	if (types.length === 0) return out;
	const perVertexF = types.map((t) =>
		[...t.entries()].reduce((s, [n, c]) => s + (tileAreaSurd(n).toFloat() * c) / n, 0)
	);
	const rec = (idx: number, inc: Map<number, number>, partialF: number, sumV: number): void => {
		if (idx === types.length) {
			let area = Surd.ZERO;
			for (const [n, c] of inc) {
				if (c % n !== 0) return; // fractional tile count ⇒ not a realizable cell
				area = area.add(tileAreaSurd(n).scaleRational(BigInt(c / n), 1n));
			}
			if (area.isZero() || area.toFloat() > areaBoundF + 1e-9) return;
			const key = areaKey(area);
			const prev = out.get(key);
			if (prev === undefined || sumV < prev) out.set(key, sumV);
			return;
		}
		const type = types[idx];
		for (let v = 1; v <= MAX_ORBIT_VERTICES; v++) {
			const next = new Map(inc);
			for (const [n, c] of type) next.set(n, (next.get(n) ?? 0) + c * v);
			const pf = partialF + perVertexF[idx] * v;
			if (pf > areaBoundF + 1e-9) break; // area strictly increases with v ⇒ safe to stop
			rec(idx + 1, next, pf, sumV + v);
		}
	};
	rec(0, new Map(), 0, 0);
	return out;
}

/**
 * Holohedry order of the lattice ⟨a, b⟩ — the order of its Bravais point group, an UPPER bound on the
 * point group |P| of any tiling with this period (P ⊆ the lattice symmetry): oblique 2,
 * rectangular / centered-rectangular (cmm) 4, square 8, hexagonal 12. Computed EXACTLY from the Gram
 * matrix (|u|², |v|², u·v) of the Gauss-reduced basis (reduced-cell classification: the three
 * symmetry signatures are u·v = 0, |u| = |v|, and 2|u·v| = |u|²).
 *
 * ⚑ SOUNDNESS: the orbit-floor prunes (P0/P1, `route-a-proven-box.md` §"Early-prune rulings") divide
 * by this value, so it MUST NEVER underestimate the true holohedry — underestimating would let the
 * floor `k·hol(Λ)` drop a valid tiling. Any doubt — a basis not PROVABLY Lagrange-reduced, or a
 * degenerate input — falls back to 12 (the 2D maximum), which is always sound (a weaker prune).
 */
export function holohedry(a: Cyclotomic, b: Cyclotomic): number {
	const [u, v] = gaussReduceExact(a, b);
	const guu = reSurd(u.normSquared()); // |u|²  (u·conj(u) is real)
	const gvv = reSurd(v.normSquared()); // |v|²
	if (guu.isZero() || gvv.isZero()) return 12; // degenerate ⇒ max (sound)
	const guv = reSurd(u.conj().mul(v)); // u·v  (real part of conj(u)·v)
	const twoAbsuv = guv.abs().scaleRational(2n, 1n); // 2|u·v|
	// Demand a Lagrange-reduced basis (|u|² ≤ |v|² and 2|u·v| ≤ |u|²); otherwise the length/angle
	// conditions below need not match the Bravais class — fall back to the always-sound maximum.
	if (guu.cmp(gvv) > 0 || twoAbsuv.cmp(guu) > 0) return 12;
	const eqLen = guu.equals(gvv);
	const perp = guv.isZero();
	const centered = twoAbsuv.equals(guu); // 2|u·v| = |u|² (60° rhombus / rectangle-centering edge)
	if (eqLen && perp) return 8; // square
	if (eqLen && centered) return 12; // hexagonal (equal length, 60°)
	if (perp || eqLen || centered) return 4; // rectangular / centered-rectangular / rhombic
	return 2; // oblique (no symmetry signature holds)
}

/**
 * If `u` lies along a grid direction (its angle is a multiple of 15°), return that direction index
 * `m` (u = ζ^m·|u|) and its exact length `|u| ∈ ℚ(√2,√3)`. Otherwise null (off-grid, e.g. snub).
 */
export function gridDirOf(u: Cyclotomic, ring: Cyclotomic["ring"]): { m: number; len: Surd } | null {
	if (u.isZero()) return null;
	for (let m = 0; m < ring.N; m++) {
		const rot = u.mulZeta((ring.N - m) % ring.N); // u·ζ^{-m}
		if (!imSurd(rot).isZero()) continue; // not real ⇒ u not along direction m
		const len = reSurd(rot);
		if (len.sign() > 0) return { m, len }; // positive ⇒ u points along +ζ^m
		// negative ⇒ u points along ζ^{m+12}; the loop reaches that m with a positive length.
	}
	return null;
}

/** Canonical key for a lattice (basis-independent): the Gauss-reduced pair, sign/order-normalised. */
export function latticeKey(a: Cyclotomic, b: Cyclotomic): string {
	const [u, v] = gaussReduceExact(a, b);
	// normalise each vector's sign (lex-smaller of ±w), then order the two by key
	const nu = signNorm(u);
	const nv = signNorm(v);
	const ka = nu.key();
	const kb = nv.key();
	return ka < kb ? `${ka}#${kb}` : `${kb}#${ka}`;
}

/** Pick the sign of `w` so its key is the lexicographically smaller of `w`, `−w`. */
function signNorm(w: Cyclotomic): Cyclotomic {
	const n = w.neg();
	return w.key() <= n.key() ? w : n;
}

/** Gaussian lattice reduction (float broadphase, exact subtraction) — exact generating pair. */
export function gaussReduceExact(a: Cyclotomic, b: Cyclotomic): [Cyclotomic, Cyclotomic] {
	let u = a;
	let v = b;
	const m2 = (c: Cyclotomic) => {
		const vv = c.toVector();
		return vv.x * vv.x + vv.y * vv.y;
	};
	for (let iter = 0; iter < 64; iter++) {
		if (m2(u) > m2(v)) {
			[u, v] = [v, u];
			continue;
		}
		const uv = u.toVector();
		const vv = v.toVector();
		const uu = uv.x * uv.x + uv.y * uv.y;
		if (uu < 1e-12) break;
		const dot = uv.x * vv.x + uv.y * vv.y;
		const t = Math.round(dot / uu);
		if (t === 0) break;
		v = v.sub(u.scaleRational(BigInt(t), 1n));
	}
	return [u, v];
}

/** True iff bases (a,b) and (c,d) generate the SAME lattice (equal covolume + mutual int-combos). */
export function sameLattice(
	a: Cyclotomic,
	b: Cyclotomic,
	c: Cyclotomic,
	d: Cyclotomic
): boolean {
	if (detSurd(a, b).abs().cmp(detSurd(c, d).abs()) !== 0) return false;
	return isIntCombo(c, a, b) && isIntCombo(d, a, b);
}

/** True iff `w = α·a + β·b` for integers α, β (float solve, exact verify). */
export function isIntCombo(w: Cyclotomic, a: Cyclotomic, b: Cyclotomic): boolean {
	const wf = w.toVector();
	const af = a.toVector();
	const bf = b.toVector();
	const det = af.x * bf.y - af.y * bf.x;
	if (Math.abs(det) < 1e-9) return false;
	const al = (wf.x * bf.y - wf.y * bf.x) / det;
	const be = (af.x * wf.y - af.y * wf.x) / det;
	const ai = Math.round(al);
	const bi = Math.round(be);
	if (Math.abs(al - ai) > 1e-6 || Math.abs(be - bi) > 1e-6) return false;
	const recon = a.scaleRational(BigInt(ai), 1n).add(b.scaleRational(BigInt(bi), 1n));
	return w.sub(recon).isZero();
}

export function areaKey(s: Surd): string {
	return `${s.P},${s.Q},${s.R},${s.S},${s.D}`;
}

/** Module cache: the unit-edge-sum pool is seed-free (depends only on ring/depth/length), so it is
 *  computed once and shared across every seed. */
const poolCache = new Map<string, Cyclotomic[]>();

/**
 * Seed-free pool of candidate short translation vectors: every distinct vertex difference reachable as
 * a sum of ≤ `maxSteps` unit edges, restricted to the directions `dirs` (indices into the ring),
 * within Euclidean length `lmaxF`, exact and deduplicated. This is the deterministic, expander-free
 * replacement for the old difference pool — a period vector of a unit-edge tiling is a sum of unit
 * edges, so bounding the STEP count (not the length, since ℤ[ζ_N] is dense) makes it finite.
 *
 * `dirs` is the set of EDGE directions the seed's tiles can produce (see `edgeStepDirs`); restricting
 * to it is sound (no edge ever points elsewhere) and collapses the pool dramatically when the tiles fit
 * one symmetry ring — e.g. for {3,6} the 6 hexagonal directions give an Eisenstein lattice of ~120
 * points vs ~145k for all 24. Cached per (N, dirs, maxSteps, lmaxF).
 *
 * For the regular k=2 core, `maxSteps=6, lmaxF=5.6` surfaces every realizable cell vector (the largest,
 * t2001's |v|=2+2√3≈5.46, needs 6 steps).
 *
 * `monotone` grows the BFS strictly OUTWARD: a step is taken only when it increases the distance from
 * the origin. A cell basis vector is always reachable by an increasing path from the origin (verified:
 * all 20 two-uniform lattices stay covered), so this is sound and prunes the inward-doubling-back
 * paths — ~20–30% fewer points/candidates, free.
 */
export function shortVectorPool(
	ring: Cyclotomic["ring"],
	maxSteps: number,
	lmaxF: number,
	dirs?: number[],
	monotone = false
): Cyclotomic[] {
	const dirList = dirs ?? Array.from({ length: ring.N }, (_, j) => j);
	const cacheKey = `${ring.N}:${maxSteps}:${lmaxF}:${dirList.join(',')}:${monotone ? 'm' : 'f'}`;
	const cached = poolCache.get(cacheKey);
	if (cached) return cached;

	const edges = dirList.map((j) => Cyclotomic.zeta(ring, ((j % ring.N) + ring.N) % ring.N));
	const all = new Map<string, Cyclotomic>();
	let frontier = new Map<string, { w: Cyclotomic; r2: number }>([
		["", { w: Cyclotomic.ZERO(ring), r2: 0 }],
	]);
	const lmax2 = lmaxF * lmaxF;
	for (let step = 0; step < maxSteps; step++) {
		const next = new Map<string, { w: Cyclotomic; r2: number }>();
		for (const { w: p, r2: rp } of frontier.values()) {
			for (const e of edges) {
				const w = p.add(e);
				const f = w.toVector();
				const r2 = f.x * f.x + f.y * f.y;
				if (r2 > lmax2 + 1e-6) continue;
				if (monotone && r2 <= rp + 1e-9) continue; // outward steps only
				const key = w.key();
				if (!all.has(key) && !next.has(key)) next.set(key, { w, r2 });
			}
		}
		for (const [key, e] of next) all.set(key, e.w);
		frontier = next;
	}
	const out = [...all.values()].filter((w) => !w.isZero());
	poolCache.set(cacheKey, out);
	return out;
}

/** Integer gcd (non-negative). */
function gcdInt(a: number, b: number): number {
	a = Math.abs(a);
	b = Math.abs(b);
	while (b) [a, b] = [b, a % b];
	return a;
}

/**
 * The edge directions an edge-to-edge tiling by these `polySizes` can ever produce, as ring indices.
 * Every edge of a regular n-gon turns by its exterior angle 360/n = (N/n) steps; undirected edges add
 * the 180° = (N/2) step. So all edge directions are multiples of `g = gcd(N/2, N, {N/n})`, and the
 * direction set is {0, g, 2g, …}. A period vector is a sum of edges, so it lies in the lattice these
 * directions generate — restricting the pool to them is SOUND. (Verified: all 20 two-uniform regular
 * lattices use only these directions.) Tiles whose `N/n` is not integral — i.e. n ∤ N — fall off the
 * grid and force every direction (g=1), so they get the full ring.
 */
export function edgeStepDirs(ring: Cyclotomic["ring"], polySizes: number[]): number[] {
	const N = ring.N;
	let g = gcdInt(N, N / 2); // = N/2 (the undirected-edge 180° step)
	for (const n of polySizes) {
		if (N % n !== 0) return Array.from({ length: N }, (_, j) => j); // off-grid tile ⇒ all directions
		g = gcdInt(g, N / n);
	}
	if (g <= 0) g = 1;
	const dirs: number[] = [];
	for (let d = 0; d < N; d += g) dirs.push(d);
	return dirs;
}
