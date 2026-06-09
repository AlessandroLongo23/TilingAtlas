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

/** Tuned upper bound on a join-step denominator (the cor:box step-2 float broadphase in `obliqueCells`):
 *  part of the logged-incomplete candidate region, not a proven bound. The k=3 oblique targets are pairs
 *  (denominator-free), so this never affects them. */
const JOIN_DEN_MAX = 60;
function isNearInt(x: number): boolean {
	return Math.abs(x - Math.round(x)) < 1e-9;
}
/** True iff `x` is within tolerance of a rational p/q with q ≤ JOIN_DEN_MAX (float broadphase). */
function nearRational(x: number): boolean {
	for (let q = 1; q <= JOIN_DEN_MAX; q++) if (Math.abs(x * q - Math.round(x * q)) < 1e-7) return true;
	return false;
}

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
	 * Oblique (`hol = 2`) candidate cells via pair-seed + join-closure — the cor:box completion that
	 * reaches the Bravais classes the symmetry-pinned `roundCells`/`gridAlignedCells` cannot (e.g. the
	 * k=3 oblique cells t3046, t3055). Returns ONLY oblique lattices (`holohedry == 2`); the higher-
	 * symmetry lattices traversed internally (needed to seed joins toward ≥3-generator oblique children)
	 * are NOT emitted — `roundCells`/`gridAlignedCells` remain the sole source for those, so adding this
	 * cannot perturb the round/grid catalogues (the k≤2 byte-identical guarantee).
	 *
	 *  - **(C.1) seed pairs:** `u` over the sub-pool `|u|² ≤ (2/√3)·A_adm` (the reduced short side of an
	 *    oblique cell; `A_adm` = the largest admissible area realisable by ≤ 2k vertex classes, the P0
	 *    floor at `hol = 2`), `v` over the FULL pool. Float-det broadphase, then exact.
	 *  - **(C.2) join-closure (cor:box step 2):** repeatedly add `⟨L, w⟩` for a pool vector `w`. A join
	 *    has area ≤ area(L)/2, so a lattice whose area can't be halved into the admissible set is skipped
	 *    (sound). Pairs-only would miss any lattice with no two-pool-vector basis.
	 *  - **(C.3) INCOMPLETE log:** `onTruncate` fires (loud, never silent) when the proven reach exceeds
	 *    the tuned pool reach (`route-a-proven-box.md` doctrine).
	 *
	 * A candidate is kept iff its exact area ∈ `areas` (the sharp VC-area cut); deduped by `latticeKey`.
	 */
	obliqueCells(
		pool: Cyclotomic[],
		areas: Surd[],
		ring: Cyclotomic["ring"],
		areaBoundF: number,
		poolLmax: number,
		minVerts: Map<string, number>,
		onTruncate?: (info: ObliqueTruncation) => void
	): [Cyclotomic, Cyclotomic][] {
		void ring; // the exact helpers carry their own ring; kept for call-site consistency with A/B.
		if (areas.length === 0) return [];
		const areaSet = new Set(areas.map(areaKey));
		const areaFloats = areas.map((a) => a.toFloat());
		const minAreaF = Math.min(...areaFloats);

		// A_adm: the largest admissible area realisable by ≤ 2k vertex classes (P0 floor at hol = 2).
		let aAdm: Surd | null = null;
		for (const a of areas) {
			const mv = minVerts.get(areaKey(a));
			if (mv !== undefined && mv <= 2 * this.k && (aAdm === null || a.cmp(aAdm) > 0)) aAdm = a;
		}
		if (aAdm === null) return []; // no area survives the hol=2 orbit floor ⇒ no oblique candidate
		const aAdmF = aAdm.toFloat();
		const uMax2 = (2 / Math.sqrt(3)) * aAdmF; // |u|² bound for the reduced short side
		// (C.3) loud truncation: the proven reach exceeds the tuned pool reach.
		if (Math.sqrt(uMax2) > poolLmax + 1e-9)
			onTruncate?.({ cause: "subpool-clipped", aAdm: aAdmF, needReach: Math.sqrt(uMax2), poolLmax });
		else if (uMax2 > poolLmax + 1e-9)
			onTruncate?.({ cause: "v-range-truncated", needReach: uMax2, poolLmax });

		// Pool float coords precomputed ONCE (the pairing/join sweeps are float-broadphased; exact
		// arithmetic only re-confirms a survivor — so `toVector` is never recomputed per candidate pair).
		const PF = pool.map((p) => { const f = p.toVector(); return { p, x: f.x, y: f.y, r2: f.x * f.x + f.y * f.y }; });
		const sub = PF.filter((e) => e.r2 <= uMax2 + 1e-9);

		const out: [Cyclotomic, Cyclotomic][] = [];
		const seen = new Set<string>(); // contributed (oblique) lattice keys
		const working = new Map<string, [Cyclotomic, Cyclotomic]>(); // all admissible candidates (any class)
		/** Admit (a,b) (with its precomputed |float det| `dF`) if its area is admissible & new; emit only
		 *  if oblique. Returns the pair iff NEWLY admitted (for the join frontier). */
		const admit = (a: Cyclotomic, b: Cyclotomic, dF: number): [Cyclotomic, Cyclotomic] | null => {
			if (dF < 1e-9 || dF > areaBoundF + 1e-6) return null;
			if (!areaFloats.some((x) => Math.abs(dF - x) < 1e-6)) return null; // float area pre-filter
			const A = detSurd(a, b).abs(); // exact confirm
			if (!areaSet.has(areaKey(A))) return null;
			const lk = latticeKey(a, b);
			if (working.has(lk)) return null;
			const pair: [Cyclotomic, Cyclotomic] = [a, b];
			working.set(lk, pair);
			if (holohedry(a, b) === 2 && !seen.has(lk)) {
				seen.add(lk);
				out.push(pair);
			}
			return pair;
		};

		// (C.1) seed pairs: u ∈ sub-pool, v ∈ full pool (float det pre-filter, then exact admit).
		for (const ue of sub) for (const ve of PF) admit(ue.p, ve.p, Math.abs(ue.x * ve.y - ue.y * ve.x));

		// (C.2) join-closure (cor:box step 2) — fixpoint; each join divides covolume by ≥ 2. A
		// float near-rational broadphase on the (a,b)-coordinates of `w` keeps the exact `joinLattice`
		// (and its exact division) off the overwhelmingly common irrational case. The join denominator
		// is bounded by `JOIN_DEN_MAX` — a tuned cut within the logged-incomplete candidate region
		// (route-a-proven-box.md / join-closure contract R3); a join needing a larger denominator is
		// not enumerated (the targets t3046/t3055 are pairs, denominator-free, so they are unaffected).
		const maxRounds = Math.max(2, Math.ceil(Math.log2((2 * areaBoundF) / Math.max(minAreaF, 1e-6) + 2)) + 2);
		let frontier = [...working.values()];
		let round = 0;
		// CB-3 (review-2026-06-09): the den≤JOIN_DEN_MAX near-rational cut is a TUNED truncation and must
		// report loudly (correctness.tex "any cap that could truncate the search is required to report
		// loudly"; TA ruling SYNC-2026-06 option (b): once per affected run, with a count — not per-pair
		// spam). The float test cannot distinguish irrational coords (exactly no join — sound skip) from
		// rational coords with denominator > JOIN_DEN_MAX (a waived join), so the count is an UPPER bound
		// on waived joins.
		let joinWaived = 0;
		while (frontier.length > 0) {
			if (++round > maxRounds + 8) throw new Error("obliqueCells: join-closure exceeded the covolume round bound (bug)");
			const next: [Cyclotomic, Cyclotomic][] = [];
			for (const [a, b] of frontier) {
				const af = a.toVector(), bf = b.toVector();
				const detab = af.x * bf.y - af.y * bf.x;
				// sound per-lattice reject: every join has area ≤ area(L)/2; if that is below the
				// smallest admissible area, no join from L can be admitted — skip its whole pool sweep.
				if (Math.abs(detab) / 2 < minAreaF - 1e-9) continue;
				for (const we of PF) {
					const al = (we.x * bf.y - we.y * bf.x) / detab;
					const be = (af.x * we.y - af.y * we.x) / detab;
					if (isNearInt(al) && isNearInt(be)) continue; // w ∈ L ⇒ no progress
					if (!nearRational(al) || !nearRational(be)) { joinWaived++; continue; } // irrational OR den > JOIN_DEN_MAX
					const j = joinLattice(a, b, we.p);
					if (!j) continue;
					const e0 = j[0].toVector(), e1 = j[1].toVector();
					const admitted = admit(j[0], j[1], Math.abs(e0.x * e1.y - e0.y * e1.x));
					if (admitted) next.push(admitted);
				}
			}
			frontier = next;
		}
		if (joinWaived > 0) onTruncate?.({ cause: "join-waived", rejects: joinWaived, denMax: JOIN_DEN_MAX });
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
		return areaLadderFromTiles(tiles, this.k, onTruncate, maxAreaOverride);
	}
}

/**
 * Generic area ladder from EXACT per-tile areas (any sum of ≤24k tile areas ≤ the bound). Identity-keyed
 * — pass `polygonAreaSurd` for stars, `tileAreaSurd(n)` for regulars. This is the SOUND-but-loose area
 * filter used for STAR seeds (Increment 2): `vcAreaSet`'s sharp VC-forced-multiset model is *unsound* for
 * stars (its `corners/n = tiles` identity assumes every tile corner sits at a counted vertex — false when
 * a star's dents are filled at `t=2` non-vertex points, so e.g. an octagon abutting a dent contributes
 * <8 vertex-corners). The generic ladder never drops a realizable area; the fill + certificate gates
 * reject the extra candidates. Regulars keep the sharp `vcAreaSet`.
 */
export function areaLadderFromTiles(tiles: Surd[], k: number, onTruncate?: () => void, maxAreaOverride?: number): Surd[] {
	const maxTileF = Math.max(...tiles.map((t) => t.toFloat()));
	const orbitBoundF = 24 * k * maxTileF; // F ≤ 24k ⇒ area ≤ 24k·maxTileArea
	const maxAreaF = maxAreaOverride ?? Math.min(orbitBoundF, 8 * k);
	const maxTiles = 24 * k;
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
export function vcAreaSet(
	vcIncidences: Map<string, number>[],
	tileArea: Map<string, Surd>,
	tileCorners: Map<string, number>,
	areaBoundF: number
): Surd[] {
	// Keyed by tile IDENTITY token (C1): `tileArea` gives the exact area (star = shoelace, regular =
	// tileAreaSurd(n)); `tileCorners` (= n) is the corner-count divisor. Regular tokens reduce this to the
	// old n-keyed behavior byte-for-byte.
	const types = vcIncidences;
	if (types.length === 0) return [];
	// per-orbit average area per vertex (Σ area(id)·c/corners) — exact float, for the recursion bound.
	const perVertexF = types.map((t) =>
		[...t.entries()].reduce((s, [id, c]) => s + (tileArea.get(id)!.toFloat() * c) / tileCorners.get(id)!, 0)
	);
	const out = new Map<string, Surd>();
	const rec = (idx: number, inc: Map<string, number>, partialF: number): void => {
		if (idx === types.length) {
			let area = Surd.ZERO;
			for (const [id, c] of inc) {
				const corners = tileCorners.get(id)!;
				if (c % corners !== 0) return; // a fractional tile count ⇒ not a realizable cell
				area = area.add(tileArea.get(id)!.scaleRational(BigInt(c / corners), 1n));
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
			for (const [id, c] of type) next.set(id, (next.get(id) ?? 0) + c * v);
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
 * multiplicities is exactly the torus vertex count. NB: this Euler relation is FALSE for stars, so the
 * P0 prune that consumes this is SKIPPED for star seeds (C2) — this function therefore only ever runs on
 * regular seeds, where the identity token = `String(n)` ⇒ byte-identical to the old n-keyed code.
 */
export function vcAreaMinVerts(
	vcIncidences: Map<string, number>[],
	tileArea: Map<string, Surd>,
	tileCorners: Map<string, number>,
	areaBoundF: number
): Map<string, number> {
	const types = vcIncidences;
	const out = new Map<string, number>();
	if (types.length === 0) return out;
	const perVertexF = types.map((t) =>
		[...t.entries()].reduce((s, [id, c]) => s + (tileArea.get(id)!.toFloat() * c) / tileCorners.get(id)!, 0)
	);
	const rec = (idx: number, inc: Map<string, number>, partialF: number, sumV: number): void => {
		if (idx === types.length) {
			let area = Surd.ZERO;
			for (const [id, c] of inc) {
				const corners = tileCorners.get(id)!;
				if (c % corners !== 0) return; // fractional tile count ⇒ not a realizable cell
				area = area.add(tileArea.get(id)!.scaleRational(BigInt(c / corners), 1n));
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
			for (const [id, c] of type) next.set(id, (next.get(id) ?? 0) + c * v);
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

/** A loud INCOMPLETE-REGION signal from the oblique candidate stage (`obliqueCells`).
 *  `join-waived` (alias in the SYNC ruling: "join-denominator-bounded"): joins rejected by the
 *  den≤`denMax` near-rational broadphase — `rejects` counts irrational coords (sound skips) and
 *  waived large-denominator joins together (an upper bound on the truly waived). CB-3. */
export type ObliqueTruncation =
	| { cause: "subpool-clipped"; aAdm: number; needReach: number; poolLmax: number }
	| { cause: "v-range-truncated"; needReach: number; poolLmax: number }
	| { cause: "join-waived"; rejects: number; denMax: number };

function babs(a: bigint): bigint {
	return a < 0n ? -a : a;
}
function bgcd(a: bigint, b: bigint): bigint {
	a = babs(a);
	b = babs(b);
	while (b !== 0n) [a, b] = [b, a % b];
	return a;
}
function blcm(a: bigint, b: bigint): bigint {
	if (a === 0n || b === 0n) return 0n;
	return babs(a / bgcd(a, b) * b);
}
/** Extended gcd: returns [g, x, y] with g = x·a + y·b, g ≥ 0. */
function bgcdExt(a: bigint, b: bigint): [bigint, bigint, bigint] {
	let [or, r] = [a, b];
	let [os, s] = [1n, 0n];
	let [ot, t] = [0n, 1n];
	while (r !== 0n) {
		const q = or / r;
		[or, r] = [r, or - q * r];
		[os, s] = [s, os - q * s];
		[ot, t] = [t, ot - q * t];
	}
	return or < 0n ? [-or, -os, -ot] : [or, os, ot];
}

/**
 * Hermite Normal Form of a rank-2 integer lattice given by generator columns: returns a ℤ-basis
 * `[(h11, h21), (0, h22)]` of the lattice spanned by `cols`. Used to realise a join (cor:box step 2)
 * exactly. Assumes the generators span ℚ² (the join always does — ⟨a,b⟩ already spans).
 */
function hnf2(colsIn: [bigint, bigint][]): [[bigint, bigint], [bigint, bigint]] {
	const cols = colsIn.map((c) => [c[0], c[1]] as [bigint, bigint]).filter((c) => c[0] !== 0n || c[1] !== 0n);
	// Step A: reduce all first coordinates to a single pivot (= gcd of the first coords).
	for (;;) {
		const idx = cols.map((c, i) => [c[0], i] as const).filter(([x]) => x !== 0n).map(([, i]) => i);
		if (idx.length <= 1) break;
		const i = idx[0], j = idx[1];
		const ci = cols[i], cj = cols[j];
		const [g, x, y] = bgcdExt(ci[0], cj[0]);
		cols[i] = [x * ci[0] + y * cj[0], x * ci[1] + y * cj[1]]; // first coord = g
		const fi = ci[0] / g, fj = cj[0] / g;
		cols[j] = [fi * cj[0] - fj * ci[0], fi * cj[1] - fj * ci[1]]; // first coord = 0
	}
	const pivotIdx = cols.findIndex((c) => c[0] !== 0n);
	let h11 = 0n, h21 = 0n;
	const rest: [bigint, bigint][] = [];
	if (pivotIdx !== -1) {
		const pv = cols[pivotIdx];
		[h11, h21] = pv[0] < 0n ? [-pv[0], -pv[1]] : [pv[0], pv[1]];
		for (let i = 0; i < cols.length; i++) if (i !== pivotIdx) rest.push(cols[i]); // all first coord 0
	} else {
		rest.push(...cols);
	}
	// Step B: second basis vector (0, h22), h22 = gcd of the rest's second coords.
	let h22 = 0n;
	for (const c of rest) h22 = bgcd(h22, c[1]);
	// Step C: reduce the pivot's second coordinate mod h22 (0 ≤ h21 < h22).
	if (h22 !== 0n) h21 = ((h21 % h22) + h22) % h22;
	return [[h11, h21], [0n, h22]];
}

/**
 * Join a vector `w` into the lattice ⟨a, b⟩ (cor:box step 2): the finer lattice ⟨a, b, w⟩. Returns a
 * fresh exact basis, or `null` when `w ∈ ⟨a, b⟩` (no progress) or `w` is not in the ℚ-span of (a, b)
 * (so ⟨a,b,w⟩ is not a rank-2 lattice — the dense-ring case, correctly skipped). Each proper join
 * divides the covolume by an integer ≥ 2 (`route-a-proven-box.md`, cor:box), so the join-closure
 * terminates.
 *
 * Method: solve `w = α·a + β·b` exactly (Cramer with `detSurd`); both α, β must be RATIONAL (else not a
 * lattice point). With `α = A/Dc, β = B/Dc` over a common denominator `Dc`, the lattice in (a,b)-coords
 * is `⟨(1,0),(0,1),(α,β)⟩ = (1/Dc)·⟨(Dc,0),(0,Dc),(A,B)⟩`; its HNF gives the new basis, mapped back via
 * `scaleRational` on a, b.
 */
export function joinLattice(
	a: Cyclotomic,
	b: Cyclotomic,
	w: Cyclotomic
): [Cyclotomic, Cyclotomic] | null {
	const det = detSurd(a, b);
	if (det.isZero()) return null;
	const alpha = detSurd(w, b).div(det); // w = α·a + β·b
	const beta = detSurd(a, w).div(det);
	if (!alpha.isRational() || !beta.isRational()) return null; // w ∉ ℚ-span ⇒ not a rank-2 join
	if (alpha.D === 1n && beta.D === 1n) return null; // w ∈ ⟨a,b⟩ ⇒ no progress
	const Dc = blcm(alpha.D, beta.D);
	const A = alpha.P * (Dc / alpha.D);
	const B = beta.P * (Dc / beta.D);
	const [[x1, y1], [x2, y2]] = hnf2([[Dc, 0n], [0n, Dc], [A, B]]);
	const e1 = a.scaleRational(x1, Dc).add(b.scaleRational(y1, Dc));
	const e2 = a.scaleRational(x2, Dc).add(b.scaleRational(y2, Dc));
	return [e1, e2];
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
