/*
 * Orbifold NORMALIZED-mode branch enumeration (re-anchoring lemma, thesis `7a0586e`,
 * correctness.tex §"Re-anchored seeding: the normalized branch family"; CC-facing recipe
 * `../resources/research/reanchoring-lemma-2026-06-05.md`). Coboundary normalization is licensed
 * ONLY when paired with re-anchored seeding from the full sets 𝒳(Λ,G,k); this module computes the
 * normalized branch family + those re-anchor sets. It is the sibling of OrbifoldBranches.ts (the
 * non-normalized Phase-A enumerator, kept for the measurement A/B) and reuses its pool / point-group
 * / composition helpers.
 *
 * Bridge layer (Phase 1): cyclotomic → integer matrices for the exact column-lattice machinery in
 * exact/IntLinalg.ts. The coboundary of a grid map L is the ℤ-linear map (1−L) on ℤ[ζ_N]; for a
 * rotation it is multiplication by the ring element (1−ζ^r) (full rank φ), for a reflection it kills
 * the σ-fixed subspace (rank φ/2, hence rank-deficient).
 */
import { Cyclotomic } from "../Cyclotomic";
import { RegularPolygon } from "../polygons/RegularPolygon";
import {
	applyPointOp,
	mapPoint,
	branchTranslationPool,
	closeGroup,
	latticePointGroup,
	reduceVecModLattice,
	type Bravais,
	type CosetOp,
	type PointOp,
} from "./OrbifoldBranches";
import { holohedry, edgeStepDirs, isIntCombo, latticeKey } from "./LatticeEnumerator";
import { reduceModColumnLattice, solveModLattice, solveRationalSquare, compileReducer, compileSolver, enumerateQuotientReps, columnLatticeIndex } from "./exact/IntLinalg";

/** The map of a coset op applied to a point: g·z = L(z) + w = mapPoint(z, reflect, r, w). Uses the
 *  SHARED `mapPoint` primitive (OrbifoldBranches), the exact same isometry the k-uniformity gate's
 *  union-find applies — so the budget counter and the gate provably quotient by the same map. */
function mapCoset(g: CosetOp, z: Cyclotomic): Cyclotomic {
	return mapPoint(z, g.reflect, g.r, g.w);
}

/**
 * Vertex-orbit count of a partial fill UNDER a supplied branch group G (the exact-k budget, contract
 * §2 / `cor:branchbudget`). Union-find over the distinct vertex classes `vReps`, merging i~j whenever
 * some coset op maps vReps[i] onto vReps[j] mod Λ. Mirror of `KUniformityChecker` (its discovered-sym
 * union-find), quotienting by the SUPPLIED `ops` instead. Pure; the fill prunes a branch step at
 * count `> k` (strictly — monotone-sound, never prune a valid branch).
 */
export function countOrbitsUnderBranch(vReps: Cyclotomic[], u: Cyclotomic, v: Cyclotomic, ops: CosetOp[]): number {
	const n = vReps.length;
	const parent = vReps.map((_, i) => i);
	const find = (x: number): number => {
		while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
		return x;
	};
	const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
	for (let i = 0; i < n; i++) {
		for (const g of ops) {
			const gw = mapCoset(g, vReps[i]);
			for (let j = 0; j < n; j++) {
				if (find(i) === find(j)) continue;
				if (isIntCombo(gw.sub(vReps[j]), u, v)) { union(i, j); break; }
			}
		}
	}
	const roots = new Set<number>();
	for (let i = 0; i < n; i++) roots.add(find(i));
	return roots.size;
}

/**
 * The stabiliser of a base point x in the branch group G: `{ (L,w) ∈ ops : w ≡ (1−L)x (mod Λ) }` (the
 * direct congruence — NO conjugation, B2 frame convention). Used to r-reduce the equivariant seeding.
 */
export function stabG(x: Cyclotomic, ops: CosetOp[], u: Cyclotomic, v: Cyclotomic): CosetOp[] {
	return ops.filter((g) => {
		const target = x.sub(applyPointOp({ reflect: g.reflect, r: g.r }, x)); // (1−L)x
		return isIntCombo(g.w.sub(target), u, v);
	});
}

/**
 * The coboundary matrix M_{1−L} as an array of φ COLUMN vectors over ℤ: column j is the coordinate
 * vector of `ζ^j − L(ζ^j)` in the power basis. Asserts each column is an algebraic integer (den===1),
 * which holds for every grid map (ζ^r or conj∘ζ^r) acting on a basis vector. The ℤ-span of the
 * columns is exactly (1−L)·ℤ[ζ_N] (rotations: the ideal (1−ζ^r); reflections: the image of 1−σ).
 */
export function coboundaryMatrix(op: PointOp, ring: Cyclotomic["ring"]): bigint[][] {
	const cols: bigint[][] = [];
	for (let j = 0; j < ring.phi; j++) {
		const ej = Cyclotomic.zeta(ring, j);
		const col = ej.sub(applyPointOp(op, ej));
		if (col.den !== 1n) {
			throw new Error(`coboundaryMatrix: non-integer column (den=${col.den}) for op {reflect:${op.reflect},r:${op.r}} at j=${j}`);
		}
		cols.push(col.num.slice());
	}
	return cols;
}

/**
 * The lattice basis Λ = ℤu + ℤv as two integer COLUMN vectors (the power-basis coordinates of u, v).
 * Asserts den===1: the candidate period lattices carried by anchored tilings sit inside ℤ[ζ_N], so
 * their basis vectors are algebraic integers. A den>1 here means the lattice is not integral — a loud
 * failure rather than a silently wrong column lattice.
 */
export function latticeBasisMatrix(u: Cyclotomic, v: Cyclotomic): bigint[][] {
	for (const [name, c] of [["u", u], ["v", v]] as const) {
		if (c.den !== 1n) throw new Error(`latticeBasisMatrix: non-integral lattice basis ${name} (den=${c.den})`);
	}
	return [u.num.slice(), v.num.slice()];
}

// ----------------------------------------------------------------------------
// Phase 2 — subgroup-type coverage + normalized class keys
// ----------------------------------------------------------------------------

/**
 * One candidate-group TYPE per subgroup of the lattice point group, each carrying its OWN distinguished
 * generator(s) at minimal exponents. ⚑ A1 (completeness): the family must cover EVERY subgroup, not
 * just the lattice-maximal one — a C₂-symmetric tiling on a hex lattice lives in the C₂ branch, and
 * the Σ|𝒳|=pool law cannot catch a silently-dropped type. Mirrors Phase-A's implicit all-singletons
 * coverage, reorganised by subgroup.
 */
export type SubgroupType =
	| { kind: "p1"; order: 1 }
	| { kind: "cyclic-rot"; rot: PointOp; order: number }
	| { kind: "cyclic-refl"; refl: PointOp; order: 2 }
	| { kind: "dihedral"; rot: PointOp; refl: PointOp; order: number };

function divisors(m: number): number[] {
	const ds: number[] = [];
	for (let i = 1; i <= m; i++) if (m % i === 0) ds.push(i);
	return ds;
}

/**
 * Enumerate every subgroup type of the grid-realised point group `survivors` (from
 * `latticePointGroup`). NO group closure needed: cyclic rotation subgroups are the divisors of the
 * rotation order (distinguished ρ = ζ_N^{N/d}); each reflection is its own order-2 type; dihedral
 * subgroups ⟨C_d, σ⟩ are obtained by grouping the survivor reflections by exponent mod N/d and taking
 * the minimal-exponent reflection of each group as the distinguished σ (the reflections of ⟨ρ_b,σ_a⟩
 * have exponents a − j·b mod N — a single residue class mod b = N/d).
 */
export function enumerateSubgroupTypes(survivors: PointOp[], ring: Cyclotomic["ring"]): SubgroupType[] {
	const N = ring.N;
	const refls = survivors.filter((o) => o.reflect).map((o) => o.r);
	const m = survivors.filter((o) => !o.reflect).length; // rotation subgroup order
	const divs = divisors(m).filter((d) => d >= 2);

	const types: SubgroupType[] = [{ kind: "p1", order: 1 }];
	for (const d of divs) types.push({ kind: "cyclic-rot", rot: { reflect: false, r: N / d }, order: d });
	for (const r of [...refls].sort((a, b) => a - b)) types.push({ kind: "cyclic-refl", refl: { reflect: true, r }, order: 2 });
	for (const d of divs) {
		const q = N / d;
		const byResidue = new Map<number, number[]>();
		for (const r of refls) {
			const k = ((r % q) + q) % q;
			const g = byResidue.get(k);
			if (g) g.push(r);
			else byResidue.set(k, [r]);
		}
		for (const k of [...byResidue.keys()].sort((a, b) => a - b)) {
			const sigma = Math.min(...byResidue.get(k)!);
			types.push({ kind: "dihedral", rot: { reflect: false, r: N / d }, refl: { reflect: true, r: sigma }, order: 2 * d });
		}
	}
	return types;
}

function assertIntegral(d: Cyclotomic, where: string): bigint[] {
	if (d.den !== 1n) throw new Error(`${where}: non-integral datum (den=${d.den})`);
	return d.num;
}

/**
 * Canonical class key of a single-generator (cyclic) branch: the HNF-least residue of the placement
 * datum `d` modulo the column lattice `[B_Λ | M_{1−L}]`. `L` is the type's OWN distinguished generator
 * (rotation for cyclic-rot, reflection for cyclic-refl — the latter rank-deficient). Coboundary- and
 * Λ-invariant by construction. One branch per distinct key.
 */
export function cyclicBranchKey(d: Cyclotomic, L: PointOp, u: Cyclotomic, v: Cyclotomic, ring: Cyclotomic["ring"]): string {
	const gens = [...latticeBasisMatrix(u, v), ...coboundaryMatrix(L, ring)];
	return reduceModColumnLattice(assertIntegral(d, "cyclicBranchKey"), gens).join(",");
}

/** Inverse of a rotation point op {reflect:false, r} ⇒ {reflect:false, (N−r) mod N}. */
function invRot(L: PointOp, N: number): PointOp {
	if (L.reflect) throw new Error("invRot: expected a rotation");
	return { reflect: false, r: ((N - L.r) % N + N) % N };
}

/** The reflection-datum side of the commutator congruence: (1 − L₁⁻¹)·d₂. */
function commLhs(d2: Cyclotomic, L1: PointOp): Cyclotomic {
	return d2.sub(applyPointOp(invRot(L1, d2.ring.N), d2));
}
/** The rotation-datum side of the commutator congruence: −(L₁⁻¹ + L₂)·d₁. */
function commRhs(d1: Cyclotomic, L1: PointOp, L2: PointOp): Cyclotomic {
	return applyPointOp(invRot(L1, d1.ring.N), d1).add(applyPointOp(L2, d1)).neg();
}

/**
 * The dihedral commutator pre-filter (apply BEFORE forming the coupled key — it kills the P² term):
 * a rotation datum d₁ and reflection datum d₂ close to a dihedral branch only if
 *   (1 − L₁⁻¹)·d₂ ≡ −(L₁⁻¹ + L₂)·d₁   (mod Λ),
 * which pins [d₂] to ≤ [𝒦_{L₁}:Λ] classes per d₁ (a small constant of (Λ,L₁)).
 */
export function dihedralCommutatorPrefilter(
	d1: Cyclotomic, d2: Cyclotomic, L1: PointOp, L2: PointOp, u: Cyclotomic, v: Cyclotomic
): boolean {
	return isIntCombo(commLhs(d2, L1).sub(commRhs(d1, L1, L2)), u, v);
}

/**
 * Canonical class key of a dihedral branch: the HNF-least residue of the stacked datum (d₁;d₂) ∈ ℤ^{2φ}
 * modulo the COUPLED column lattice `[B_Λ⊕0 | 0⊕B_Λ | (M_{1−L₁};M_{1−L₂})]` — the Λ-basis appears in
 * EACH slot SEPARATELY (a single shared/diagonal Λ-block under-merges and produces duplicate branches).
 * The coupled coboundary block enforces one common t for both generators. Pre-filter the pair with
 * `dihedralCommutatorPrefilter` first.
 */
export function dihedralBranchKey(
	d1: Cyclotomic, d2: Cyclotomic, L1: PointOp, L2: PointOp, u: Cyclotomic, v: Cyclotomic, ring: Cyclotomic["ring"]
): string {
	const phi = ring.phi;
	const zeros = new Array<bigint>(phi).fill(0n);
	const BL = latticeBasisMatrix(u, v);
	const M1 = coboundaryMatrix(L1, ring);
	const M2 = coboundaryMatrix(L2, ring);
	const gens: bigint[][] = [];
	for (const b of BL) gens.push([...b, ...zeros]); // B_Λ ⊕ 0
	for (const b of BL) gens.push([...zeros, ...b]); // 0 ⊕ B_Λ
	for (let j = 0; j < phi; j++) gens.push([...M1[j], ...M2[j]]); // coupled coboundary
	const stacked = [...assertIntegral(d1, "dihedralBranchKey"), ...assertIntegral(d2, "dihedralBranchKey")];
	return reduceModColumnLattice(stacked, gens).join(",");
}

// ----------------------------------------------------------------------------
// Phase 3 — re-anchor sets + the full normalized enumeration + conservation
// ----------------------------------------------------------------------------

function glidePasses(L2: PointOp, d: Cyclotomic, u: Cyclotomic, v: Cyclotomic): boolean {
	// σ² = id mod Λ ⇒ (1 + σ)·d ∈ Λ — the licensed glide pre-filter (rem:branchpool)
	return isIntCombo(d.add(applyPointOp(L2, d)), u, v);
}

function dedupCyc(cs: Cyclotomic[]): Cyclotomic[] {
	const seen = new Set<string>();
	const out: Cyclotomic[] = [];
	for (const c of cs) {
		const k = c.key();
		if (!seen.has(k)) {
			seen.add(k);
			out.push(c);
		}
	}
	return out;
}

/** Wrap a solved coboundary coefficient vector t (or null) as a Cyclotomic re-anchor point. */
function reAnchorFromSolution(t: bigint[] | null, ring: Cyclotomic["ring"], where: string): Cyclotomic {
	if (t === null) throw new Error(`${where}: datum not in its own branch class (unsolvable)`);
	const num = new Array<bigint>(ring.phi).fill(0n);
	for (let i = 0; i < t.length; i++) num[i] = t[i];
	return new Cyclotomic(ring, num);
}

/**
 * The re-anchor point t(d) of a single cyclic datum: the canonical t with (1−L)·t ≡ w′−d (mod Λ),
 * where w′ is d's own canonical class representative. Exposed for round-trip testing; the assembly
 * compiles the reducer/solver once per (Λ, generator) instead.
 */
export function reAnchorPoint(d: Cyclotomic, L: PointOp, u: Cyclotomic, v: Cyclotomic, ring: Cyclotomic["ring"]): Cyclotomic {
	const M = coboundaryMatrix(L, ring);
	const BL = latticeBasisMatrix(u, v);
	const rep = reduceModColumnLattice(assertIntegral(d, "reAnchorPoint"), [...BL, ...M]);
	const t = solveModLattice(M, rep.map((x, i) => x - d.num[i]), BL);
	return reAnchorFromSolution(t, ring, "reAnchorPoint");
}

function typeTag(t: SubgroupType): string {
	switch (t.kind) {
		case "p1": return "p1";
		case "cyclic-rot": return `R${t.order}`;
		case "cyclic-refl": return `F${t.refl.r}`;
		case "dihedral": return `D${t.order}@${t.refl.r}`;
	}
}

export type NormalizedBranch = {
	type: SubgroupType;
	classKey: string;
	order: number;
	key: string; // latticeKey | typeTag | classKey  (canonical, deterministic)
	reAnchorSet: Cyclotomic[]; // 𝒳(Λ,G,k); [0] for p1
	ops: CosetOp[]; // the closed group G mod Λ at the branch's normalized placements (x=0 frame)
};

/** Close the branch's distinguished generators (at their normalized placements) into G mod Λ. */
function materializeOps(type: SubgroupType, rep: bigint[], u: Cyclotomic, v: Cyclotomic, ring: Cyclotomic["ring"]): CosetOp[] {
	let gens: CosetOp[];
	if (type.kind === "p1") gens = [];
	else if (type.kind === "cyclic-rot") gens = [{ reflect: false, r: type.rot.r, w: new Cyclotomic(ring, rep) }];
	else if (type.kind === "cyclic-refl") gens = [{ reflect: true, r: type.refl.r, w: new Cyclotomic(ring, rep) }];
	else {
		const phi = ring.phi;
		gens = [
			{ reflect: false, r: type.rot.r, w: new Cyclotomic(ring, rep.slice(0, phi)) },
			{ reflect: true, r: type.refl.r, w: new Cyclotomic(ring, rep.slice(phi, 2 * phi)) },
		];
	}
	const ops = closeGroup(gens, u, v, ring);
	if (ops === null) throw new Error(`materializeOps: branch group failed to close (${typeTag(type)}) — should be impossible for an enumerated branch`);
	return ops;
}

export type NormalizedBranchOpts = {
	poolClassCap?: number;
	/** Increment 3: when the fill uses the incidence seed set 𝒜 (computed from each branch's rotation
	 *  centre), the cocycle re-anchor set 𝒳 of the ROTATION-bearing branches (cyclic-rot, dihedral) is
	 *  never consumed — so skip building it (the per-pool-datum coboundary SOLVE, the dominant fixed cost
	 *  at hex: Σ|𝒳| ≈ 12M solves/run). `reAnchorSet` is left `[]` for those branches and their (now
	 *  cocycle-only, retired-for-𝒜) conservation entry is omitted. cyclic-refl branches STILL build 𝒳 —
	 *  incidence falls back to it for them (`rem:glidefallback`). Default off ⇒ cocycle path unchanged. */
	skipRotationReAnchor?: boolean;
	/** C4 pool-bypass: enumerate the rotation (and dihedral) coboundary quotient DIRECTLY via the SNF
	 *  index (no pool walk). Legal ONLY with `skipRotationReAnchor` (= incidence anchoring): the bypass
	 *  has no pool ⇒ no 𝒳, so 𝒜 must supply the seeds. cyclic-refl/glide stay on the pool (their quotient
	 *  is infinite, `ci:kernel`). Default off ⇒ pool-walk path unchanged. Env: PS_BYPASS=1. */
	bypass?: boolean;
};

export type NormalizedDiag = {
	holohedry: number;
	survivors: number;
	bravais: Bravais;
	poolDepth: number;
	poolClasses: number;
	poolTruncated: boolean;
	/** ⚑ Was the O(pool) BFS actually built? false ⇒ the C4 bypass deleted it on this lattice (no
	 *  pool-needing branch type). On hex it stays true — reflections force the pool (finding E1). */
	poolBuilt: boolean;
	/** PS_PROFILE-only phase timings (ms) to attribute the wall: pool build vs reflection sweep vs the
	 *  rotation/dihedral bypass. Absent unless PS_PROFILE is set. */
	timings?: { poolBuildMs: number; reflSweepMs: number; rotBypassMs: number; dihBypassMs: number };
	branches: number;
	byKind: { p1: number; cyclicRot: number; cyclicRefl: number; dihedral: number };
	/** Σ|𝒳| over each rotation type == poolClasses (every rotation coset viable). */
	rotationConserved: boolean;
	/** Σ|𝒳| over each reflection type == glide-passing pool-class count. */
	reflectionConserved: boolean;
	conservationDetail: { typeKey: string; sum: number; expected: number; ok: boolean }[];
	/** ⚑ Count of cyclic-rot types whose Σ|𝒳|=pool conservation was NOT evaluated because 𝒳 was skipped
	 *  (incidence mode). `rotationConserved` is then vacuously true for them — NOT verified. So a consumer
	 *  never reads `rotationConserved=true` as "checked": the incidence completeness guard is instead the
	 *  |𝒜|≥1 coverage + the frozen-catalogue ⊇ check + the 𝒜≡𝒳 oracle (incidence-contract §3/§5). */
	conservationSkipped: number;
};

function bravaisOf(hol: number): Bravais {
	return hol >= 12 ? "hex" : hol >= 8 ? "square" : hol >= 4 ? "rect/cmm" : "oblique";
}

/**
 * The NORMALIZED branch family + re-anchor sets for one candidate lattice Λ. Iterates every subgroup
 * type (A1) and partitions the translation-class pool into coboundary-normalized branch classes; each
 * branch carries its full re-anchor set 𝒳. Cyclic branches collapse to the quotient orders (478→~4,
 * hex p6→1); dihedral pairs are enumerated in LINEAR time via the commutator bucket (not P²). The
 * conservation tripwires (Σ|𝒳| = pool / glide-passing count per rotation / reflection type) are the
 * completeness check — a deficit means a dropped tiling, not a speedup.
 */
export function enumerateNormalizedBranches(
	u: Cyclotomic, v: Cyclotomic, ring: Cyclotomic["ring"], polySizes: number[], k: number, opts: NormalizedBranchOpts = {}
): { branches: NormalizedBranch[]; diag: NormalizedDiag } {
	const cap = opts.poolClassCap ?? Infinity;
	const bypass = opts.bypass === true;
	// The bypass has no pool ⇒ no cocycle 𝒳 ⇒ seeds MUST come from incidence 𝒜 (skipRotationReAnchor).
	if (bypass && opts.skipRotationReAnchor !== true) throw new Error("[orbifold] ⚑ IMPLEMENTATION-BUG: bypass requires incidence anchoring (skipRotationReAnchor) — 𝒳 is pool-derived and unavailable under bypass");
	const survivors = latticePointGroup(u, v, ring);
	const hol = holohedry(u, v);
	const depth = Math.max(0, k * survivors.length - 1);
	const dirs = edgeStepDirs(ring, polySizes);
	const profile = process.env.PS_PROFILE ? true : false;
	const timings = { poolBuildMs: 0, reflSweepMs: 0, rotBypassMs: 0, dihBypassMs: 0 };
	// Lazy pool: built on first demand. C4 bypass deletes the rotation/dihedral pool WALK, so on a lattice
	// with no pool-needing branch type the BFS is never built (the observable speedup). ⚑ On hex (D₆) the
	// reflection/dihedral types still force it (finding E1) — `poolBuilt` records the honest truth.
	let _pool: Cyclotomic[] | null = null;
	const getPool = (): Cyclotomic[] => {
		if (_pool === null) {
			const t = profile ? Date.now() : 0;
			_pool = branchTranslationPool(u, v, ring, dirs, depth, cap);
			if (profile) timings.poolBuildMs += Date.now() - t;
		}
		return _pool;
	};
	const lk = latticeKey(u, v);
	const types = enumerateSubgroupTypes(survivors, ring);
	const BL = latticeBasisMatrix(u, v);
	const phi = ring.phi;
	const zeros = new Array<bigint>(phi).fill(0n);

	const branches: NormalizedBranch[] = [];
	const byKind = { p1: 0, cyclicRot: 0, cyclicRefl: 0, dihedral: 0 };
	const conservationDetail: NormalizedDiag["conservationDetail"] = [];
	let conservationSkipped = 0; // cyclic-rot types whose Σ|𝒳|=pool check was skipped (𝒳 not built, incidence)

	for (const type of types) {
		if (type.kind === "p1") {
			branches.push({ type, classKey: "p1", order: 1, key: `${lk}|p1`, reAnchorSet: [Cyclotomic.ZERO(ring)], ops: materializeOps(type, [], u, v, ring) });
			byKind.p1++;
			continue;
		}

		// C4 bypass (cyclic-rot only): the realizable rotation branches biject with the finite quotient
		// 𝒬_{L,Λ}=ℤ[ζ_N]/(Λ+(1−L)ℤ[ζ_N]); enumerate it DIRECTLY (SNF index, ≤256 reps, k-independent) — no
		// pool walk. Each rep is the SAME HNF-least residue the pool path's reduce(d.num) produces, so the
		// classKey/key/ops are byte-identical to the pool branches. 𝒜 supplies the seeds (reAnchorSet=[]).
		if (type.kind === "cyclic-rot" && bypass) {
			const tB = profile ? Date.now() : 0;
			const colLat = [...BL, ...coboundaryMatrix(type.rot, ring)]; // [B_Λ | M_{1−L}]
			const reps = enumerateQuotientReps(colLat);
			const nu = columnLatticeIndex(colLat); // Tripwire A — a loop self-check (NOT an inflation guard): #reps must equal ν
			if (nu === null || BigInt(reps.length) !== nu) throw new Error(`[orbifold] ⚑ Tripwire-A: cyclic-rot ${typeTag(type)} on ${lk}: #reps=${reps.length} ≠ ν=${nu}`);
			for (const rep of reps) {
				const ck = rep.join(",");
				branches.push({ type, classKey: ck, order: type.order, key: `${lk}|${typeTag(type)}|${ck}`, reAnchorSet: [], ops: materializeOps(type, rep, u, v, ring) });
			}
			byKind.cyclicRot++;
			conservationSkipped++; // bypassed ⇒ Σ|𝒳|=pool not evaluated (guard is |𝒜|≥1 + frozen-catalogue ⊇ + 𝒜≡𝒳 oracle)
			if (profile) timings.rotBypassMs += Date.now() - tB;
			continue;
		}

		if (type.kind === "cyclic-rot" || type.kind === "cyclic-refl") {
			const L = type.kind === "cyclic-rot" ? type.rot : type.refl;
			const M = coboundaryMatrix(L, ring);
			const reduce = compileReducer([...BL, ...M]); // HNF once per (Λ, generator)
			const solve = compileSolver(M, BL);
			const groups = new Map<string, { rep: bigint[]; data: Cyclotomic[] }>();
			let participating = 0;
			for (const d of getPool()) {
				if (type.kind === "cyclic-refl" && !glidePasses(L, d, u, v)) continue;
				participating++;
				const rep = reduce(d.num);
				const ck = rep.join(",");
				const g = groups.get(ck);
				if (g) g.data.push(d);
				else groups.set(ck, { rep, data: [d] });
			}
			// Incidence mode skips 𝒳 for cyclic-rot (the centre-based 𝒜 replaces it); cyclic-refl keeps 𝒳.
			const skipX = opts.skipRotationReAnchor === true && type.kind === "cyclic-rot";
			let sum = 0;
			for (const ck of [...groups.keys()].sort()) {
				const g = groups.get(ck)!;
				const X = skipX ? [] : dedupCyc(g.data.map((d) => reAnchorFromSolution(solve(g.rep.map((x, i) => x - d.num[i])), ring, "reAnchorCyclic")));
				sum += X.length;
				branches.push({ type, classKey: ck, order: type.order, key: `${lk}|${typeTag(type)}|${ck}`, reAnchorSet: X, ops: materializeOps(type, g.rep, u, v, ring) });
			}
			if (type.kind === "cyclic-rot") byKind.cyclicRot++;
			else byKind.cyclicRefl++;
			// The Σ|𝒳|=pool conservation entry is cocycle-only. When 𝒳 was skipped (incidence) we do NOT
			// silently drop it: record the SKIP (conservationSkipped) so `rotationConserved=true` is never
			// mistaken for "verified" — the incidence guard is |𝒜|≥1 + frozen-catalogue ⊇ + the 𝒜≡𝒳 oracle
			// (incidence-contract §3). reflectionConserved (cyclic-refl) is unaffected (it still builds 𝒳).
			if (!skipX) conservationDetail.push({ typeKey: typeTag(type), sum, expected: participating, ok: sum === participating });
			else conservationSkipped++;
			continue;
		}

		// dihedral: commutator bucket ⇒ linear pairing (lem:cobindex, the P²→linear collapse). Applies
		// GLIDE ∧ COMMUTATOR (the b² + (ba)² relators, prop:dihedralclose): glidePasses(L₂,d₂) below + the
		// commutator bucket (commLhs/commRhs). ⚑ C4 SCOPE: dihedral is NOT bypassed and stays on this proven
		// pool path even under `bypass`. At the operative ring N=24 the coupled coboundary quotient is
		// INFINITE (ci:kernel: M₂ kills φ/2 dims, Λ adds only 2 ⇒ d₂-slot rank 6 < φ=8), so the direct
		// quotient enumeration does not apply; the per-d₁-solve + glide-intersection fallback is deferred
		// because it CANNOT change the hex verdict — reflections keep the pool there regardless (finding E1),
		// so a dihedral bypass alone never deletes the hex BFS. (cyclic-rot IS bypassed: the measured wall.)
		{
			const { rot: L1, refl: L2 } = type;
			const M1 = coboundaryMatrix(L1, ring);
			const M2 = coboundaryMatrix(L2, ring);
			const coupledM: bigint[][] = [];
			for (let j = 0; j < phi; j++) coupledM.push([...M1[j], ...M2[j]]);
			const coupledBL: bigint[][] = [];
			for (const b of BL) coupledBL.push([...b, ...zeros]);
			for (const b of BL) coupledBL.push([...zeros, ...b]);
			const reduceCoupled = compileReducer([...coupledBL, ...coupledM]); // HNF once per dihedral type
			const solveCoupled = compileSolver(coupledM, coupledBL);

			// bucket glide-passing d₂ by the commutator signature reduce((1−L₁⁻¹)d₂)
			const bucket = new Map<string, Cyclotomic[]>();
			for (const d2 of getPool()) {
				if (!glidePasses(L2, d2, u, v)) continue;
				const sig = reduceVecModLattice(commLhs(d2, L1), u, v).key();
				const arr = bucket.get(sig);
				if (arr) arr.push(d2);
				else bucket.set(sig, [d2]);
			}
			const groups = new Map<string, { rep: bigint[]; pairs: [Cyclotomic, Cyclotomic][] }>();
			for (const d1 of getPool()) {
				const target = reduceVecModLattice(commRhs(d1, L1, L2), u, v).key();
				const matches = bucket.get(target);
				if (!matches) continue;
				for (const d2 of matches) {
					const rep = reduceCoupled([...d1.num, ...d2.num]);
					const ck = rep.join(",");
					const g = groups.get(ck);
					if (g) g.pairs.push([d1, d2]);
					else groups.set(ck, { rep, pairs: [[d1, d2]] });
				}
			}
			const skipXdih = opts.skipRotationReAnchor === true; // dihedral 𝒜 uses the rotation centre, not 𝒳
			for (const ck of [...groups.keys()].sort()) {
				const g = groups.get(ck)!;
				const X = skipXdih ? [] : dedupCyc(g.pairs.map(([d1, d2]) => {
					const stacked = [...d1.num, ...d2.num];
					return reAnchorFromSolution(solveCoupled(g.rep.map((x, i) => x - stacked[i])), ring, "reAnchorDihedral");
				}));
				branches.push({ type, classKey: ck, order: type.order, key: `${lk}|${typeTag(type)}|${ck}`, reAnchorSet: X, ops: materializeOps(type, g.rep, u, v, ring) });
			}
			byKind.dihedral++;
		}
	}

	const rotationConserved = conservationDetail.filter((c) => c.typeKey.startsWith("R")).every((c) => c.ok);
	const reflectionConserved = conservationDetail.filter((c) => c.typeKey.startsWith("F")).every((c) => c.ok);

	return {
		branches,
		diag: {
			holohedry: hol,
			survivors: survivors.length,
			bravais: bravaisOf(hol),
			poolDepth: depth,
			poolClasses: _pool ? _pool.length : 0,
			poolTruncated: _pool ? _pool.length >= cap : false,
			poolBuilt: _pool !== null,
			timings: profile ? timings : undefined,
			branches: branches.length,
			byKind,
			rotationConserved,
			reflectionConserved,
			conservationDetail,
			conservationSkipped,
		},
	};
}

// ----------------------------------------------------------------------------
// Phase 4 — incidence anchoring (Increment 3): the pool-free seed set 𝒜
// (thesis `cf355cb`/`3f43bc2`, correctness.tex §"Incidence anchoring"; recipe
//  `../resources/research/incidence-anchoring-2026-06-05.md`)
// ----------------------------------------------------------------------------

const _displacementCache = new Map<string, Cyclotomic[]>();

/**
 * The family-level displacement set D for incidence anchoring (`def:incidence`): the exact vectors
 * from a symmetry locus (the branch's rotation centre) to an incident vertex of any target tiling.
 * `lem:fixedincidence` pins those loci to vertices / edge midpoints / tile centroids, so D has three
 * families — ALL derived from REAL placed-polygon geometry, never from `σ·ζ_N^j`:
 *   • `0`                         — the centre is a vertex;
 *   • `vᵢ − ½(vᵢ+vᵢ₊₁)` (both endpoints) — the centre is an edge midpoint (= ±½·edge);
 *   • `vᵢ − centroid`             — the centre is a tile centroid.
 * ⚑ The centroid→vertex ray is a HALF-grid direction `ζ_{2N}^odd` when `N/n` is odd (octagon@24,
 * square@12); a `ζ_N^j` encoding silently drops 4.8.8 and 4.4.4.4 (the FATAL draft bug). Reading the
 * exact `exactVertices`/`exactCentroid`/`exactHalfways` off the placed polygon avoids it by
 * construction. Computed once per (N, sizes); k- and lattice-independent, `|D| ≤ (2+|sizes|)·N`.
 */
export function incidenceDisplacements(ring: Cyclotomic["ring"], polySizes: number[]): Cyclotomic[] {
	const sizes = [...new Set(polySizes)].sort((a, b) => a - b);
	const cacheKey = `${ring.N}|${sizes.join(",")}`;
	const hit = _displacementCache.get(cacheKey);
	if (hit) return hit;

	const ZERO = Cyclotomic.ZERO(ring);
	const seen = new Set<string>();
	const D: Cyclotomic[] = [];
	const push = (z: Cyclotomic): void => {
		const k = z.key();
		if (!seen.has(k)) { seen.add(k); D.push(z); }
	};
	push(ZERO); // the centre is a vertex (displacement 0)
	for (const n of sizes) {
		if (ring.N % n !== 0) continue; // a tile that cannot sit on this grid forces no incidence offsets
		for (let dir = 0; dir < ring.N; dir++) {
			const p = RegularPolygon.fromAnchorAndDirExact(n, ZERO, dir);
			const vs = p.exactVertices!;
			const ms = p.exactHalfways!; // ½(vᵢ+vᵢ₊₁), exact edge midpoints
			const c = p.exactCentroid!; // (Σvᵢ)/n, exact
			for (let i = 0; i < vs.length; i++) {
				push(vs[i].sub(c)); // centroid → vertex (the half-grid family)
				push(vs[i].sub(ms[i])); // edge-midpoint → endpoint vᵢ      (= ±½·edge)
				push(vs[(i + 1) % vs.length].sub(ms[i])); // edge-midpoint → endpoint vᵢ₊₁
			}
		}
	}
	_displacementCache.set(cacheKey, D);
	return D;
}

/**
 * The incidence anchor set 𝒜(Λ,G) for a normalized branch (`def:incidence`/`prop:incidencefill`,
 * Increment 3) — the pool-free replacement for the cocycle re-anchor set 𝒳 (`B.reAnchorSet`). For a
 * rotation-bearing branch (cyclic-rot, dihedral) the seeds are `(c + D) ∩ ℤ[ζ_N]` reduced mod Λ, where
 * `c = (1−L)⁻¹·w` is the EXACT centre of the branch's distinguished rotation (every rotation of the
 * branch shares this centre, so any one is fine; the canonical placement `w` makes `c` deterministic).
 * `p1` seeds at `{0}`. cyclic-refl + glide-only branches FALL BACK to the proven-complete cocycle 𝒳
 * (`rem:glidefallback` licenses 𝒜/𝒳 as interchangeable complete seed sets there; they are not the
 * tractability bottleneck — TA-ruled scope, SYNC 900). `D = incidenceDisplacements(ring, polySizes)`
 * is passed in (computed once per run). `|𝒜| ≤ |D|` — independent of k and of the lattice.
 */
export function incidenceAnchorSet(
	B: NormalizedBranch, u: Cyclotomic, v: Cyclotomic, ring: Cyclotomic["ring"], D: Cyclotomic[]
): Cyclotomic[] {
	if (B.type.kind === "p1") return [Cyclotomic.ZERO(ring)];
	if (B.type.kind === "cyclic-refl") return B.reAnchorSet; // 𝒳 fallback (mirror- and glide-type, uniformly)

	// cyclic-rot | dihedral: anchor at the rotation centre's incidence offsets.
	const rot = B.type.rot; // distinguished rotation {reflect:false, r:N/d}, r≠0
	const rotOp = B.ops.find((g) => !g.reflect && g.r === rot.r);
	if (!rotOp) throw new Error(`incidenceAnchorSet: branch ${B.key} has no rotation op r=${rot.r} in its group`);
	const A = coboundaryMatrix(rot, ring); // the integer matrix of (1−L), full rank for r≠0
	const sol = solveRationalSquare(A, assertIntegral(rotOp.w, "incidenceAnchorSet:w"));
	if (sol === null) throw new Error(`incidenceAnchorSet: singular (1−L) for rotation r=${rot.r} (branch ${B.key})`);
	const c = new Cyclotomic(ring, sol.num, sol.den); // c = (1−L)⁻¹w, exact in ℚ(ζ_N)
	// ⚑ Defensive tripwire (would have caught the draft bug): (1−L)·c MUST equal w exactly.
	if (!c.sub(applyPointOp(rot, c)).equals(rotOp.w)) {
		throw new Error(`incidenceAnchorSet: centre check failed (1−L)c ≠ w for branch ${B.key}`);
	}

	const seen = new Set<string>();
	const anchors: Cyclotomic[] = [];
	for (const d of D) {
		const p = c.add(d);
		if (p.den !== 1n) continue; // ∩ ℤ[ζ_N]: only grid points are vertices of a target tiling
		const pr = reduceVecModLattice(p, u, v); // reduce mod Λ (x and x+λ give the same torus seed)
		const key = pr.key();
		if (!seen.has(key)) { seen.add(key); anchors.push(pr); }
	}
	anchors.sort((a, b) => (a.key() < b.key() ? -1 : a.key() > b.key() ? 1 : 0)); // deterministic seed order
	return anchors;
}
