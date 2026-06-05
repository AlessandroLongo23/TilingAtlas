/**
 * Equivariant-branch enumeration for the orbifold fill (orbifold Phase A, step 1).
 *
 * Per candidate period lattice Λ = ⟨u, v⟩ this enumerates the finite, exact set of candidate
 * wallpaper groups G = ⟨Λ, S⟩ to fill ℝ²/G equivariantly. The lattice list itself is UNCHANGED
 * (this module only proposes the symmetry branches per Λ); the downstream fill/gate/dedup are not
 * touched here. Source of truth for the math: thesis correctness.tex §"Equivariant branch
 * completeness" (`thm:groupcomplete`, `lem:symrep`, `rem:branchpool`, `rem:chirality`) and the
 * implementation contract `resources/research/orbifold-implementation-contract.md` §1.
 *
 * A space-group element is a grid isometry g(z) = L(z) + t with point part L = ζ^r (rotation) or
 * conj∘ζ^r (reflection) — the SAME maps the gate verifies (`KUniformityChecker.mapPoint`). Modulo Λ
 * a branch is a finite group of cosets (L, [t]); the coset→L map is injective, so |G/Λ| = |point
 * group| ≤ |grid survivors| ≤ hol(Λ).
 *
 * TA-mandated configuration (SYNC 2026-06-05, "rev.2"):
 *  - A1: the translation-part pool W(depth) is enumerated by **BFS in the quotient** (state =
 *    canonical class mod Λ), never generate-then-reduce — the edge-direction subgroup is rank-4 for
 *    {3,4,6,12}, so a raw step-≈35 pool is ~10⁸ vectors while the quotient has ~depth² classes.
 *  - A2: generator multisets are ∅, singletons, and **rotation×reflection pairs only** (cyclic ⇒ a
 *    rotation; dihedral ⇒ rotation+reflection); rot×rot / refl×refl and identity-L generators are
 *    never needed.
 *  - A3: the grid-realized point group has order ≤ hol(Λ) — `===` is NOT an invariant (holohedry
 *    axes can be off-grid, e.g. the square Λ on u=2+i is D₄ but only C₄ is grid-realized). The pool
 *    DEPTH uses |survivors| (the proven sharpening, `lem:symrep`): depth = k·|survivors| − 1.
 *
 * Licensed cuts (cite the label): edge-direction subgroup on the pool (`rem:branchpool`); glide
 * pre-filter on reflective cosets (`rem:branchpool`); arithmetic branch filter (`rem:branchpool`,
 * the branch-exact P0 / `rem:latticefilter`); group-key dedup + canonical order. NOT licensed and
 * deliberately absent: coboundary/origin normalization w ↦ w + (1−L)τ (contract §3 — it breaks
 * anchoring; pm and pg must stay distinct branches).
 */

import { Cyclotomic } from "../Cyclotomic";
import { holohedry, edgeStepDirs, isIntCombo, latticeKey, areaKey, gaussReduceExact } from "./LatticeEnumerator";
import { detSurd } from "./exact/Surd";

const FLOAT_TOL = 1e-9;

/** A point part: the linear grid map L(z) = conj?(z)·ζ^r. */
export type PointOp = { reflect: boolean; r: number };

/** A space-group coset: point part L plus a canonical translation class [w] mod Λ. */
export type CosetOp = { reflect: boolean; r: number; w: Cyclotomic };

/** A generator multiset (length 0, 1, or 2 per A2). */
export type GeneratorMultiset = CosetOp[];

/** A candidate branch: the closed coset group (one CosetOp per point part) + a canonical key. */
export type OrbifoldBranch = {
	ops: CosetOp[];      // the full closed group incl. identity (false,0,[0]); |ops| = point-group order
	pointOps: PointOp[]; // distinct point parts (= ops' (reflect,r)); for the equivariant fan r-reduction
	key: string;         // canonical group key = latticeKey + sorted element serialization
	order: number;       // |G mod Λ| = ops.length
};

export type Bravais = "oblique" | "rect/cmm" | "square" | "hex";

export type BranchEnumDiag = {
	holohedry: number;
	gridPointGroup: number;        // |survivors| ≤ holohedry (A3)
	bravais: Bravais;
	poolDepth: number;             // k·|survivors| − 1 (A1 + rev.2 sharpening)
	poolClasses: number;           // |W(depth)| via quotient-BFS
	poolTruncated: boolean;        // BFS hit the loud class cap
	rotCosets: number;             // candidate rotation cosets (all viable — cyclotomic sum vanishes)
	reflCosets: number;            // candidate reflection cosets after the glide filter
	generatorMultisets: number;    // ∅ + singletons + rot×refl pairs (A2) — the enumeration work; ≈ rot·refl
	enumCapped: boolean;           // generatorMultisets exceeded enumCap ⇒ closure skipped, magnitude reported
	glideFiltered: number;         // reflective cosets dropped by (1+L)w ∉ Λ
	arithmeticSkippedBranches: number;
	closureAborts: number;         // generator multisets that hit a key conflict (never on a true branch)
	branches: number;              // distinct branches after group-key dedup + arithmetic filter
	incomplete: { reason: string; count: number }[];
};

export type OrbifoldBranchOpts = {
	/** Per-area min vertex-class count (from `vcAreaMinVerts`); enables the arithmetic branch filter. */
	minVerts?: Map<string, number>;
	/** Loud cap on the quotient-BFS class count; exceeding it records an INCOMPLETE-REGION entry. */
	poolClassCap?: number;
	/** Loud cap on the generator-multiset count; above it, closure is skipped and the magnitude is
	 *  reported (the rank-(φ(N)−2) explosion the re-anchoring lemma must address). */
	enumCap?: number;
};

// ---------------------------------------------------------------------------
// Point-op algebra (matches KUniformityChecker.mapPoint's L(z) = conj?(z)·ζ^r)
// ---------------------------------------------------------------------------

/** Apply the point part L to z: conj?(z) then ·ζ^r. */
export function applyPointOp(op: PointOp, z: Cyclotomic): Cyclotomic {
	return (op.reflect ? z.conj() : z).mulZeta(op.r);
}

/**
 * Compose point parts: (a∘b)(z) = a(b(z)). Derivation: reflect = a.reflect XOR b.reflect; the
 * rotation index is a.r + b.r when a is direct and a.r − b.r when a reflects (the outer conj negates
 * the inner exponent). Unit-tested against applyPointOp ∘ applyPointOp over all 48² maps.
 */
export function composePointOps(a: PointOp, b: PointOp, N: number): PointOp {
	const r = a.reflect ? a.r - b.r : a.r + b.r;
	return { reflect: a.reflect !== b.reflect, r: ((r % N) + N) % N };
}

/** Inverse point part: a reflection is its own inverse; a rotation's inverse is ζ^{−r}. */
function invertPointOp(op: PointOp, N: number): PointOp {
	return op.reflect ? { ...op } : { reflect: false, r: (N - op.r) % N };
}

// ---------------------------------------------------------------------------
// Canonical class representative mod Λ (vector mirror of PeriodSolver.canonicalRep)
// ---------------------------------------------------------------------------

// Gauss-reduced basis per lattice (cached): on a Lagrange-reduced basis the Voronoi-relevant
// neighbours are just ±u', ±v', ±(u'±v'), so a fixed ±2 scan finds the minimum-norm class rep — no
// huge index window even for long-thin (cmm) cells. Without reduction the scan range blows up with
// anisotropy, which made the k=3 measurement crawl.
const _reducedBasis = new Map<string, { u: Cyclotomic; v: Cyclotomic; uV: { x: number; y: number }; vV: { x: number; y: number }; det: number }>();
function reducedBasisOf(u: Cyclotomic, v: Cyclotomic) {
	const lk = latticeKey(u, v);
	let r = _reducedBasis.get(lk);
	if (!r) {
		const [ru, rv] = gaussReduceExact(u, v);
		const uV = ru.toVector(), vV = rv.toVector();
		r = { u: ru, v: rv, uV, vV, det: uV.x * vV.y - uV.y * vV.x };
		_reducedBasis.set(lk, r);
		if (_reducedBasis.size > 64) _reducedBasis.delete(_reducedBasis.keys().next().value!);
	}
	return r;
}

/**
 * Canonical representative of the class w + Λ: on the Gauss-reduced basis (u',v'), bring w near the
 * origin via the float-rounded integer combo (exact subtraction), then pick the **minimum-norm**
 * translate in the ±2 neighbourhood, ties broken by lex-min exact key. On a reduced basis ±2 covers
 * the Voronoi cell, so the rep is the unique closest-to-origin class member (ties by key) — basis-
 * independent, congruence-stable, immune to half-integer boundary rounding, and the lattice class
 * reduces to ZERO. (The same robustness PeriodSolver.canonicalRep relies on, reduced-basis-bounded.)
 */
export function reduceVecModLattice(w: Cyclotomic, u: Cyclotomic, v: Cyclotomic): Cyclotomic {
	const rb = reducedBasisOf(u, v);
	const av = rb.uV, bv = rb.vV;
	if (Math.abs(rb.det) < FLOAT_TOL) return w; // degenerate basis — leave as-is (caller guards)
	const d = w.toVector();
	const a = (d.x * bv.y - d.y * bv.x) / rb.det;
	const b = (av.x * d.y - av.y * d.x) / rb.det;
	const ai = Math.round(a), bi = Math.round(b);
	const r0 = w.sub(rb.u.scaleRational(BigInt(ai), 1n).add(rb.v.scaleRational(BigInt(bi), 1n)));
	const r0f = r0.toVector();
	let best = r0, bestKey = r0.key(), bestNorm = r0f.x * r0f.x + r0f.y * r0f.y;
	const R = 2;
	for (let i = -R; i <= R; i++) {
		for (let j = -R; j <= R; j++) {
			if (i === 0 && j === 0) continue;
			const tx = r0f.x + i * av.x + j * bv.x, ty = r0f.y + i * av.y + j * bv.y;
			const norm = tx * tx + ty * ty;
			if (norm > bestNorm + 1e-9) continue; // strictly farther — never wins
			const q = r0.add(rb.u.scaleRational(BigInt(i), 1n).add(rb.v.scaleRational(BigInt(j), 1n)));
			const kq = q.key();
			if (norm < bestNorm - 1e-9 || (norm <= bestNorm + 1e-9 && kq < bestKey)) {
				bestNorm = Math.min(bestNorm, norm);
				bestKey = kq;
				best = q;
			}
		}
	}
	return best;
}

/**
 * Memoized class reduction for the hot closure/BFS paths: caches `reduceVecModLattice` per (Λ, w),
 * keeping the last few lattices' caches. Transparent (identical results); the exported
 * `reduceVecModLattice` stays pure for tests. Closures re-reduce the same vectors many times, so this
 * is the difference between a measurement that finishes and one that crawls under sweep contention.
 */
const _reduceCache = new Map<string, Map<string, Cyclotomic>>();
function reduceCached(w: Cyclotomic, u: Cyclotomic, v: Cyclotomic): Cyclotomic {
	const lk = latticeKey(u, v);
	let m = _reduceCache.get(lk);
	if (!m) {
		m = new Map();
		_reduceCache.set(lk, m);
		if (_reduceCache.size > 6) _reduceCache.delete(_reduceCache.keys().next().value!);
	}
	const wk = w.key();
	const hit = m.get(wk);
	if (hit) return hit;
	const r = reduceVecModLattice(w, u, v);
	m.set(wk, r);
	return r;
}

// ---------------------------------------------------------------------------
// (a) point group of Λ — grid maps L with L(Λ) = Λ
// ---------------------------------------------------------------------------

/**
 * The grid-realized point group of Λ: every L = ζ^r / conj∘ζ^r with L(u), L(v) ∈ ℤu + ℤv. One
 * inclusion suffices (|det L| = 1 ⇒ equal-covolume inclusion is equality). Order ≤ hol(Λ); strictly
 * less when a holohedry axis is off-grid (A3). Always contains the identity and −1.
 */
export function latticePointGroup(u: Cyclotomic, v: Cyclotomic, ring: Cyclotomic["ring"]): PointOp[] {
	const ops: PointOp[] = [];
	for (const reflect of [false, true]) {
		for (let r = 0; r < ring.N; r++) {
			const Mu = applyPointOp({ reflect, r }, u);
			const Mv = applyPointOp({ reflect, r }, v);
			if (isIntCombo(Mu, u, v) && isIntCombo(Mv, u, v)) ops.push({ reflect, r });
		}
	}
	return ops;
}

// ---------------------------------------------------------------------------
// (b) translation-part pool — quotient-BFS over classes mod Λ (A1)
// ---------------------------------------------------------------------------

/**
 * The translation-part pool W(depth): all distinct classes mod Λ reachable from [0] by ≤ depth unit
 * edge steps, enumerated by BFS IN THE QUOTIENT (each step canonicalizes mod Λ; A1). `dirs` are ring
 * indices (from `edgeStepDirs`), spanning both a direction and its opposite. Always includes [0].
 * If the class count reaches `cap`, the BFS stops (the caller logs INCOMPLETE-REGION).
 */
export function branchTranslationPool(
	u: Cyclotomic,
	v: Cyclotomic,
	ring: Cyclotomic["ring"],
	dirs: number[],
	depth: number,
	cap = Infinity
): Cyclotomic[] {
	const dirVecs = dirs.map((r) => Cyclotomic.zeta(ring, ((r % ring.N) + ring.N) % ring.N));
	const zero = reduceCached(Cyclotomic.ZERO(ring), u, v);
	const seen = new Map<string, Cyclotomic>([[zero.key(), zero]]);
	let frontier: Cyclotomic[] = [zero];
	for (let d = 0; d < depth && frontier.length > 0; d++) {
		const next: Cyclotomic[] = [];
		for (const z of frontier) {
			for (const e of dirVecs) {
				const w = reduceCached(z.add(e), u, v);
				const k = w.key();
				if (!seen.has(k)) {
					seen.set(k, w);
					next.push(w);
					if (seen.size >= cap) return [...seen.values()];
				}
			}
		}
		frontier = next;
	}
	return [...seen.values()];
}

// ---------------------------------------------------------------------------
// (c) coset ops + glide pre-filter, and (e) generator multisets (A2)
// ---------------------------------------------------------------------------

/**
 * Candidate coset generators (L, [w]) over non-identity point parts × translation classes:
 *  - rotations: every (direct L, [w]);
 *  - reflections: every (reflecting L, [w]) passing the glide pre-filter (1+L)w ∈ Λ (`rem:branchpool`).
 * Identity-L (a pure translation) is excluded (A2).
 */
function buildCosetOps(
	survivors: PointOp[],
	poolClasses: Cyclotomic[],
	u: Cyclotomic,
	v: Cyclotomic
): { rotationOps: CosetOp[]; reflectionOps: CosetOp[]; glideFiltered: number } {
	const rotationOps: CosetOp[] = [];
	const reflectionOps: CosetOp[] = [];
	let glideFiltered = 0;
	for (const L of survivors) {
		if (!L.reflect && L.r === 0) continue; // identity-L excluded (A2)
		for (const w of poolClasses) {
			if (L.reflect) {
				// glide pre-filter: a valid reflection/glide needs (1+L)w = w + L(w) ∈ Λ.
				if (!isIntCombo(w.add(applyPointOp(L, w)), u, v)) { glideFiltered++; continue; }
				reflectionOps.push({ reflect: L.reflect, r: L.r, w });
			} else {
				rotationOps.push({ reflect: L.reflect, r: L.r, w });
			}
		}
	}
	return { rotationOps, reflectionOps, glideFiltered };
}

/**
 * Generator multisets per A2: the empty set (the p1 branch), every singleton, and every
 * {rotation, reflection} pair. No rot×rot, no refl×refl, no identity-L (`thm:groupcomplete(iii)`'s
 * lift: cyclic ⇒ a rotation singleton, dihedral ⇒ rotation+reflection).
 */
export function enumerateGeneratorMultisets(
	survivors: PointOp[],
	poolClasses: Cyclotomic[],
	u: Cyclotomic,
	v: Cyclotomic
): GeneratorMultiset[] {
	const { rotationOps, reflectionOps } = buildCosetOps(survivors, poolClasses, u, v);
	const ms: GeneratorMultiset[] = [[]];
	for (const g of rotationOps) ms.push([g]);
	for (const g of reflectionOps) ms.push([g]);
	for (const rg of rotationOps) for (const fg of reflectionOps) ms.push([rg, fg]);
	return ms;
}

// ---------------------------------------------------------------------------
// (d/e/f) closure, dedup, canonical order
// ---------------------------------------------------------------------------

const ptKeyOf = (o: CosetOp): string => `${o.reflect ? 1 : 0}:${o.r}`;
const elemKeyOf = (o: CosetOp): string => `${o.reflect ? 1 : 0}:${o.r}:${o.w.key()}`;

/** Compose cosets: (La,wa)(Lb,wb) = (La∘Lb, La(wb) + wa), translation reduced mod Λ. */
function composeCosetOps(a: CosetOp, b: CosetOp, u: Cyclotomic, v: Cyclotomic, N: number): CosetOp {
	const Lp = composePointOps({ reflect: a.reflect, r: a.r }, { reflect: b.reflect, r: b.r }, N);
	const w = reduceCached(applyPointOp({ reflect: a.reflect, r: a.r }, b.w).add(a.w), u, v);
	return { reflect: Lp.reflect, r: Lp.r, w };
}

/** Inverse coset: (L,w)^{-1} = (L^{-1}, −L^{-1}(w)), translation reduced mod Λ. */
function invertCosetOp(g: CosetOp, u: Cyclotomic, v: Cyclotomic, N: number): CosetOp {
	const Linv = invertPointOp({ reflect: g.reflect, r: g.r }, N);
	const w = reduceCached(applyPointOp(Linv, g.w).neg(), u, v);
	return { reflect: Linv.reflect, r: Linv.r, w };
}

/**
 * Close ⟨identity, generators⟩ mod Λ by BFS under composition with the generators and their
 * inverses. Returns the closed group (one CosetOp per point part) or null on a **key conflict** —
 * a point part receiving two distinct translation classes (a conflict at L = identity is a
 * translation outside Λ). The abort never fires on a true branch (`thm:groupcomplete`).
 */
function closeGroup(
	generators: CosetOp[],
	u: Cyclotomic,
	v: Cyclotomic,
	ring: Cyclotomic["ring"]
): CosetOp[] | null {
	const N = ring.N;
	const id: CosetOp = { reflect: false, r: 0, w: reduceCached(Cyclotomic.ZERO(ring), u, v) };
	const elements = new Map<string, CosetOp>([[ptKeyOf(id), id]]); // point key → element (unique per point part)
	const gens: CosetOp[] = [];
	for (const g of generators) {
		gens.push(g);
		gens.push(invertCosetOp(g, u, v, N));
	}
	const queue: CosetOp[] = [id];
	while (queue.length > 0) {
		const e = queue.shift()!;
		for (const g of gens) {
			const c = composeCosetOps(e, g, u, v, N);
			const pk = ptKeyOf(c);
			const prev = elements.get(pk);
			if (prev) {
				if (prev.w.key() !== c.w.key()) return null; // key conflict ⇒ abort
				continue;
			}
			elements.set(pk, c);
			queue.push(c);
			if (elements.size > 2 * N) return null; // runaway guard (a grid point group has ≤ 2N parts)
		}
	}
	return [...elements.values()];
}

function bravaisOf(hol: number): Bravais {
	if (hol >= 12) return "hex";
	if (hol >= 8) return "square";
	if (hol >= 4) return "rect/cmm";
	return "oblique";
}

/** Canonical branch from a closed group: stable key + sorted ops, p1 → order 1. */
function branchOf(ops: CosetOp[], u: Cyclotomic, v: Cyclotomic): OrbifoldBranch {
	const elemKeys = ops.map(elemKeyOf).sort();
	const pointSeen = new Set<string>();
	const pointOps: PointOp[] = [];
	for (const o of ops) {
		const pk = ptKeyOf(o);
		if (!pointSeen.has(pk)) { pointSeen.add(pk); pointOps.push({ reflect: o.reflect, r: o.r }); }
	}
	return { ops, pointOps, key: `${latticeKey(u, v)}|${elemKeys.join(";")}`, order: ops.length };
}

/**
 * All candidate equivariant branches for one lattice Λ = ⟨u, v⟩, in canonical (key-sorted) order.
 * The lattice list is unchanged; this only proposes the symmetry groups to fill ℝ²/G per Λ.
 */
export function enumerateBranches(
	u: Cyclotomic,
	v: Cyclotomic,
	ring: Cyclotomic["ring"],
	polySizes: number[],
	k: number,
	opts: OrbifoldBranchOpts = {}
): { branches: OrbifoldBranch[]; diag: BranchEnumDiag } {
	const incomplete: { reason: string; count: number }[] = [];
	const hol = holohedry(u, v);
	const survivors = latticePointGroup(u, v, ring);
	const gridPointGroup = survivors.length;
	if (gridPointGroup > hol) {
		process.stderr.write(
			`[OrbifoldBranches] ⚑ IMPLEMENTATION-BUG: gridPointGroup ${gridPointGroup} > holohedry ${hol} for ${latticeKey(u, v)}\n`
		);
	}

	// (b) pool depth via the survivors-based sharpening (A1 + rev.2): k·|survivors| − 1.
	const depth = Math.max(0, k * gridPointGroup - 1);
	const dirs = edgeStepDirs(ring, polySizes);
	const cap = opts.poolClassCap ?? Infinity;
	const poolClasses = branchTranslationPool(u, v, ring, dirs, depth, cap);
	const poolTruncated = poolClasses.length >= cap;
	if (poolTruncated) {
		// The proven pool exceeds the loud bound on this lattice — the INTRACTABLE regime (the rank-6
		// octagon/hex frontier the re-anchoring lemma must address). Report it; do NOT grind the
		// O(survivors·pool) singleton loop. Branches are left empty (uncounted, loudly flagged).
		incomplete.push({ reason: `pool-class-cap≥${cap}`, count: poolClasses.length });
		return {
			branches: [],
			diag: {
				holohedry: hol, gridPointGroup, bravais: bravaisOf(hol), poolDepth: depth,
				poolClasses: poolClasses.length, poolTruncated: true, rotCosets: 0, reflCosets: 0,
				generatorMultisets: 0, enumCapped: false, glideFiltered: 0, arithmeticSkippedBranches: 0,
				closureAborts: 0, branches: 0, incomplete,
			},
		};
	}

	// (c) coset generators (glide-filtered reflections). The full multiset count is the THEORETICAL
	// work 1 + (R+F) + R·F — never materialized: an O(R·F) list is the rank-(φ(N)−2) explosion on
	// octagon/hex lattices (every rotation coset is viable since 1+L+…+L^{p−1}=0, so R≈pool and
	// R·F≈pool²). We close only VIABLE singletons and pair those (A2 completeness: a crystallographic
	// group is cyclic ⟨rotation⟩ or dihedral ⟨rotation, reflection⟩).
	const { rotationOps, reflectionOps, glideFiltered } = buildCosetOps(survivors, poolClasses, u, v);
	const generatorMultisets =
		1 + (rotationOps.length + reflectionOps.length) + rotationOps.length * reflectionOps.length;

	// Loud enumeration cap: above it, closing every pair (the pool² grind) is intractable AND the
	// answer is already "explodes". Report the magnitude (generatorMultisets) and skip closure — this
	// is the contract §5 Phase-B-infeasible signal that the re-anchoring lemma is required.
	const enumCap = opts.enumCap ?? Infinity;
	if (generatorMultisets > enumCap) {
		incomplete.push({ reason: `gen-multisets>${enumCap}`, count: generatorMultisets });
		return {
			branches: [],
			diag: {
				holohedry: hol, gridPointGroup, bravais: bravaisOf(hol), poolDepth: depth,
				poolClasses: poolClasses.length, poolTruncated: false, rotCosets: rotationOps.length,
				reflCosets: reflectionOps.length, generatorMultisets, enumCapped: true, glideFiltered,
				arithmeticSkippedBranches: 0, closureAborts: 0, branches: 0, incomplete,
			},
		};
	}

	// (e) closure + (f) dedup
	let closureAborts = 0;
	const byKey = new Map<string, OrbifoldBranch>();
	const addBranch = (ops: CosetOp[]): void => {
		const branch = branchOf(ops, u, v);
		if (!byKey.has(branch.key)) byKey.set(branch.key, branch);
	};
	addBranch(closeGroup([], u, v, ring)!); // p1 (∅ ⇒ {identity})
	const viableRot: CosetOp[] = [];
	const viableRefl: CosetOp[] = [];
	for (const g of rotationOps) {
		const closed = closeGroup([g], u, v, ring);
		if (closed === null) { closureAborts++; continue; }
		viableRot.push(g);
		addBranch(closed);
	}
	for (const g of reflectionOps) {
		const closed = closeGroup([g], u, v, ring);
		if (closed === null) { closureAborts++; continue; }
		viableRefl.push(g);
		addBranch(closed);
	}
	for (const rg of viableRot) {
		for (const fg of viableRefl) {
			const closed = closeGroup([rg, fg], u, v, ring);
			if (closed === null) { closureAborts++; continue; }
			addBranch(closed);
		}
	}

	// (d) arithmetic branch filter (branch-exact P0): skip a branch when every (Λ,M)-feasible tile
	// multiset needs more vertex classes than the branch budget k·|P| allows (`rem:branchpool`).
	let arithmeticSkippedBranches = 0;
	let branches = [...byKey.values()];
	if (opts.minVerts) {
		const minV = opts.minVerts.get(areaKey(detSurd(u, v).abs()));
		if (minV !== undefined) {
			const kept: OrbifoldBranch[] = [];
			for (const b of branches) {
				if (minV > k * b.order) arithmeticSkippedBranches++;
				else kept.push(b);
			}
			branches = kept;
		}
	}

	branches.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

	const diag: BranchEnumDiag = {
		holohedry: hol,
		gridPointGroup,
		bravais: bravaisOf(hol),
		poolDepth: depth,
		poolClasses: poolClasses.length,
		poolTruncated,
		rotCosets: rotationOps.length,
		reflCosets: reflectionOps.length,
		generatorMultisets,
		enumCapped: false,
		glideFiltered,
		arithmeticSkippedBranches,
		closureAborts,
		branches: branches.length,
		incomplete,
	};
	return { branches, diag };
}
