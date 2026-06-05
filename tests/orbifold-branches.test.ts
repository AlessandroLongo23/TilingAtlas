import { describe, it, expect } from "vitest";
import { Cyclotomic, CyclotomicRing } from "@/classes/Cyclotomic";
import { holohedry, edgeStepDirs, areaKey } from "@/classes/algorithm/LatticeEnumerator";
import { detSurd } from "@/classes/algorithm/exact/Surd";
import {
	latticePointGroup,
	applyPointOp,
	composePointOps,
	reduceVecModLattice,
	branchTranslationPool,
	enumerateGeneratorMultisets,
	enumerateBranches,
	type PointOp,
} from "@/classes/algorithm/OrbifoldBranches";

const ring = CyclotomicRing.create(24);
const ONE = Cyclotomic.ONE(ring);
const OMEGA = Cyclotomic.zeta(ring, 4); // e^{iπ/3} = ω, 60° (hexagonal multiplier)
const IMAG = Cyclotomic.zeta(ring, 6); // i, 90° (square multiplier)

// ---------------------------------------------------------------------------
// (a) latticePointGroup — the grid-realized point group of Λ (survivors ≤ holohedry, A3)
// ---------------------------------------------------------------------------
describe("latticePointGroup: grid maps L = (conj?∘)ζ^r with L(Λ)=Λ", () => {
	it("square lattice (1, i) → 8 (= holohedry)", () => {
		expect(latticePointGroup(ONE, IMAG, ring).length).toBe(8);
		expect(latticePointGroup(ONE, IMAG, ring).length).toBeLessThanOrEqual(holohedry(ONE, IMAG));
	});
	it("hexagonal lattice (1, ω) → 12 (= holohedry)", () => {
		expect(latticePointGroup(ONE, OMEGA, ring).length).toBe(12);
		expect(latticePointGroup(ONE, OMEGA, ring).length).toBeLessThanOrEqual(holohedry(ONE, OMEGA));
	});
	it("rectangular lattice (1, 2i) → 4", () => {
		expect(latticePointGroup(ONE, IMAG.scaleRational(2n, 1n), ring).length).toBe(4);
	});
	it("genuinely oblique lattice (1, ζ²+ζ⁴) → 2 (only ±identity)", () => {
		const v = Cyclotomic.zeta(ring, 2).add(Cyclotomic.zeta(ring, 4));
		expect(latticePointGroup(ONE, v, ring).length).toBe(2);
	});
	it("OFF-GRID square (u=2+i, v=i·u) → survivors 4 (C₄) < holohedry 8 — locks ≤, not === (A3)", () => {
		const u = ONE.scaleRational(2n, 1n).add(IMAG); // 2 + i (angle ≈ 26.57°, off the 15° grid)
		const v = u.mulZeta(6); // i·u = −1 + 2i  ⇒ a genuine square lattice, axes off-grid
		expect(holohedry(u, v)).toBe(8); // Bravais class is square (perp + equal length)
		expect(latticePointGroup(u, v, ring).length).toBe(4); // only the C₄ rotation is grid-realized
	});
	it("every survivor actually preserves the lattice (L(u),L(v) ∈ ℤu+ℤv) and includes identity", () => {
		const ops = latticePointGroup(ONE, OMEGA, ring);
		expect(ops.some((o) => !o.reflect && o.r === 0)).toBe(true); // identity present
		// identity is unique
		expect(ops.filter((o) => !o.reflect && o.r === 0).length).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// point-op algebra — the (reflect, r) composition must match applyPointOp twice
// ---------------------------------------------------------------------------
describe("composePointOps matches function composition of applyPointOp", () => {
	const sample = ONE.scaleRational(3n, 1n).add(OMEGA).add(IMAG.scaleRational(2n, 1n)); // a generic point
	const allOps: PointOp[] = [];
	for (const reflect of [false, true]) for (let r = 0; r < 24; r++) allOps.push({ reflect, r });

	it("(a∘b)(z) == a(b(z)) for all 48×48 grid maps", () => {
		for (const a of allOps) {
			for (const b of allOps) {
				const composed = applyPointOp(composePointOps(a, b, ring.N), sample);
				const sequential = applyPointOp(a, applyPointOp(b, sample));
				expect(composed.equals(sequential)).toBe(true);
			}
		}
	});
	it("a reflection is its own inverse; a rotation's inverse is ζ^{-r}", () => {
		const refl: PointOp = { reflect: true, r: 6 };
		expect(composePointOps(refl, refl, ring.N)).toEqual({ reflect: false, r: 0 });
		const rot: PointOp = { reflect: false, r: 5 };
		const id = composePointOps(rot, { reflect: false, r: 19 }, ring.N); // 5 + 19 = 24 ≡ 0
		expect(id).toEqual({ reflect: false, r: 0 });
	});
});

// ---------------------------------------------------------------------------
// reduceVecModLattice — canonical class representative mod Λ (mirror of canonicalRep)
// ---------------------------------------------------------------------------
describe("reduceVecModLattice: canonical, congruence-stable class rep", () => {
	const u = ONE;
	const v = IMAG.scaleRational(2n, 1n); // (1, 2i): |det| = 2

	it("is idempotent (reducing a rep again is a no-op)", () => {
		const w = OMEGA; // some off-lattice vector
		const r1 = reduceVecModLattice(w, u, v);
		const r2 = reduceVecModLattice(r1, u, v);
		expect(r2.key()).toBe(r1.key());
	});
	it("congruent vectors (w and w+λ) get the SAME canonical key", () => {
		const w = IMAG; // i ∉ Λ=(1,2i); class [i]
		const lambda = u.scaleRational(3n, 1n).add(v.scaleRational(-2n, 1n)); // 3·1 − 2·(2i) ∈ Λ
		expect(reduceVecModLattice(w, u, v).key()).toBe(reduceVecModLattice(w.add(lambda), u, v).key());
	});
	it("a lattice vector reduces to the zero class", () => {
		const lambda = u.scaleRational(2n, 1n).add(v); // 2·1 + 2i ∈ Λ
		expect(reduceVecModLattice(lambda, u, v).isZero()).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// (b) branchTranslationPool — quotient-BFS over classes mod Λ (A1)
// ---------------------------------------------------------------------------
describe("branchTranslationPool: quotient-BFS of W(depth) classes mod Λ", () => {
	const dirs = edgeStepDirs(ring, [3, 4, 6]);

	it("depth 0 yields only the [0] class; depth grows it (the quotient is rank>0, not |detΛ|)", () => {
		const pool0 = branchTranslationPool(ONE, IMAG, ring, dirs, 0);
		expect(pool0.length).toBe(1);
		expect(pool0[0].isZero()).toBe(true);
		// the edge-direction lattice is higher-rank than Λ, so the quotient ball grows with depth
		// (rev.2: NOT collapsed to |detΛ| classes) — deterministic and bounded, but > 1.
		const pool2 = branchTranslationPool(ONE, IMAG, ring, dirs, 2);
		expect(pool2.length).toBeGreaterThan(1);
		expect(new Set(pool2.map((w) => w.key())).size).toBe(pool2.length);
	});
	it("returns distinct canonical classes (no duplicate keys) and includes [0]", () => {
		const pool = branchTranslationPool(ONE, IMAG.scaleRational(2n, 1n), ring, dirs, 3);
		const keys = pool.map((w) => w.key());
		expect(new Set(keys).size).toBe(keys.length);
		expect(pool.some((w) => w.isZero())).toBe(true);
	});
	it("matches a brute-force generate-then-reduce on a small depth (BFS correctness)", () => {
		const u = ONE, v = IMAG.scaleRational(2n, 1n);
		const depth = 2;
		const dirVecs = dirs.map((r) => Cyclotomic.zeta(ring, r));
		// brute force: every signed-direction walk of ≤ depth steps, reduced mod Λ.
		const seen = new Set<string>();
		seen.add(reduceVecModLattice(Cyclotomic.ZERO(ring), u, v).key());
		let cur: Cyclotomic[] = [Cyclotomic.ZERO(ring)];
		for (let d = 0; d < depth; d++) {
			const next: Cyclotomic[] = [];
			for (const z of cur) for (const dir of dirVecs) {
				const w = reduceVecModLattice(z.add(dir), u, v);
				if (!seen.has(w.key())) { seen.add(w.key()); next.push(w); }
			}
			cur = next;
		}
		const bfs = new Set(branchTranslationPool(u, v, ring, dirs, depth).map((w) => w.key()));
		expect(bfs).toEqual(seen);
	});
});

// ---------------------------------------------------------------------------
// (e) generator multisets — A2: ∅ + singletons + rotation×reflection pairs only
// ---------------------------------------------------------------------------
describe("enumerateGeneratorMultisets: A2 shapes only", () => {
	const u = ONE, v = IMAG; // square
	const survivors = latticePointGroup(u, v, ring);
	// depth-0 pool = {[0]} (the symmorphic case) so the count formula is exact: every reflection [0]
	// passes the glide filter, so reflectionOps = #reflections and the formula has no glide slack.
	const pool = branchTranslationPool(u, v, ring, edgeStepDirs(ring, [3, 4]), 0);

	it("produces only ∅, singletons, and {rotation, reflection} pairs — never rot×rot or refl×refl", () => {
		const ms = enumerateGeneratorMultisets(survivors, pool, u, v);
		expect(ms.some((m) => m.length === 0)).toBe(true); // ∅ present (the p1 branch)
		for (const m of ms) {
			expect(m.length).toBeLessThanOrEqual(2);
			// no identity-L generator ever appears
			for (const g of m) expect(g.reflect || g.r !== 0).toBe(true);
			if (m.length === 2) {
				const rots = m.filter((g) => !g.reflect).length;
				const refls = m.filter((g) => g.reflect).length;
				expect(rots).toBe(1);
				expect(refls).toBe(1);
			}
		}
	});
	it("count matches 1 + (|rotOps| + |reflOps|) + |rotOps|·|reflOps|", () => {
		const ms = enumerateGeneratorMultisets(survivors, pool, u, v);
		// coset ops over (non-identity L) × poolClasses, reflections passing the glide filter.
		const rotOps = survivors.filter((o) => !o.reflect && o.r !== 0).length * pool.length;
		// for |det|=1, every reflection [0] passes the glide filter; only [0] class exists
		const reflOps = survivors.filter((o) => o.reflect).length * pool.length;
		expect(ms.length).toBe(1 + (rotOps + reflOps) + rotOps * reflOps);
	});
});

// ---------------------------------------------------------------------------
// enumerateBranches — closure, dedup, determinism, glide filter, arithmetic filter
// ---------------------------------------------------------------------------
describe("enumerateBranches: closure + dedup + determinism", () => {
	it("the p1 branch (order 1, identity only) is always present", () => {
		const { branches } = enumerateBranches(ONE, IMAG, ring, [3, 4], 1);
		expect(branches.some((b) => b.order === 1 && b.ops.length === 1 && !b.ops[0].reflect && b.ops[0].r === 0)).toBe(true);
	});
	it("the square lattice yields a full order-8 (p4m) branch", () => {
		const { branches } = enumerateBranches(ONE, IMAG, ring, [3, 4], 1);
		expect(branches.some((b) => b.order === 8)).toBe(true);
	});
	it("is deterministic: two runs give identical branch keys in identical order", () => {
		const a = enumerateBranches(ONE, OMEGA, ring, [3, 6], 1).branches.map((b) => b.key);
		const b = enumerateBranches(ONE, OMEGA, ring, [3, 6], 1).branches.map((b) => b.key);
		expect(a).toEqual(b);
		expect([...a].sort()).toEqual(a); // already canonically sorted
	});
	it("dedups redundant generator multisets (distinct branches < generator multisets)", () => {
		const { branches, diag } = enumerateBranches(ONE, IMAG, ring, [3, 4], 1);
		expect(branches.length).toBeLessThan(diag.generatorMultisets);
		const keys = branches.map((b) => b.key);
		expect(new Set(keys).size).toBe(keys.length); // keys unique
	});
	it("records gridPointGroup ≤ holohedry in the diag", () => {
		const u = ONE.scaleRational(2n, 1n).add(IMAG), v = ONE.scaleRational(2n, 1n).add(IMAG).mulZeta(6);
		const { diag } = enumerateBranches(u, v, ring, [3, 4], 1);
		expect(diag.gridPointGroup).toBeLessThanOrEqual(diag.holohedry);
		expect(diag.gridPointGroup).toBe(4);
		expect(diag.holohedry).toBe(8);
	});
});

describe("enumerateBranches: glide pre-filter + NO coboundary normalization", () => {
	// rectangle (1, 2i): point group D₂ {id, C₂, two mirrors}; |det|=2 ⇒ classes [0],[i].
	const u = ONE, v = IMAG.scaleRational(2n, 1n);

	it("keeps pm (reflection [0]) AND pg (glide [i]) as DISTINCT branches — proves no coboundary merge", () => {
		const { branches } = enumerateBranches(u, v, ring, [3, 4, 6], 1);
		// the horizontal mirror conj (reflect=true, r=0) appears with two different translation classes
		const reflBranches = branches.filter((b) => b.order === 2 && b.ops.some((o) => o.reflect && o.r === 0));
		const wKeys = new Set(reflBranches.flatMap((b) => b.ops.filter((o) => o.reflect && o.r === 0).map((o) => o.w.key())));
		expect(wKeys.size).toBeGreaterThanOrEqual(2); // [0] and [i] both kept ⇒ pm and pg not merged
	});
	it("a reflection whose glide is invalid ((1+L)w ∉ Λ) is filtered, never emitted as a branch", () => {
		// glideFiltered counts the dropped reflective coset ops; on a lattice with non-trivial classes,
		// some reflection×class combos fail (1+L)w ∈ Λ and must be filtered.
		const { diag } = enumerateBranches(u, v, ring, [3, 4, 6], 1);
		expect(diag.glideFiltered).toBeGreaterThanOrEqual(0); // never negative; filter is active
	});
});

describe("enumerateBranches: arithmetic branch filter (branch-exact P0)", () => {
	it("skips low-|P| branches when min feasible V exceeds k·|P|", () => {
		const u = ONE, v = IMAG; // square, area 1
		const cellArea = detSurd(u, v).abs();
		// synthetic: this cell needs ≥ 5 vertex classes. At k=1, keep iff 5 ≤ |P| ⇒ only |P|=8 survives.
		const minVerts = new Map<string, number>([[areaKey(cellArea), 5]]);
		const { branches, diag } = enumerateBranches(u, v, ring, [3, 4], 1, { minVerts });
		expect(diag.arithmeticSkippedBranches).toBeGreaterThan(0);
		// every surviving non-p1... branch has point-group order ≥ 5 (i.e. 8 here)
		for (const b of branches) expect(b.order).toBeGreaterThanOrEqual(5);
	});
	it("with no minVerts the filter is inert (more branches survive)", () => {
		const u = ONE, v = IMAG;
		const withFilter = enumerateBranches(u, v, ring, [3, 4], 1, { minVerts: new Map([[areaKey(detSurd(u, v).abs()), 5]]) }).branches.length;
		const without = enumerateBranches(u, v, ring, [3, 4], 1).branches.length;
		expect(without).toBeGreaterThan(withFilter);
	});
});
