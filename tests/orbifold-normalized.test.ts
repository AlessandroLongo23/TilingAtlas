import { describe, it, expect } from "vitest";
import { Cyclotomic, CyclotomicRing } from "@/classes/Cyclotomic";
import {
	applyPointOp,
	composePointOps,
	latticePointGroup,
	reduceVecModLattice,
	type PointOp,
} from "@/classes/algorithm/OrbifoldBranches";
import { columnLatticeIndex, reduceModColumnLattice } from "@/classes/algorithm/exact/IntLinalg";
import {
	coboundaryMatrix,
	latticeBasisMatrix,
	enumerateSubgroupTypes,
	cyclicBranchKey,
	dihedralCommutatorPrefilter,
	dihedralBranchKey,
	enumerateNormalizedBranches,
	reAnchorPoint,
	type SubgroupType,
} from "@/classes/algorithm/OrbifoldNormalized";

const R12 = CyclotomicRing.create(12);
const R24 = CyclotomicRing.create(24);
const rot = (r: number): PointOp => ({ reflect: false, r });
const ref = (r: number): PointOp => ({ reflect: true, r });
/** distinguished rotation of order p in ring N: ζ_N^{N/p}. */
const rho = (N: number, p: number): PointOp => rot(N / p);

// ----------------------------------------------------------------------------
// Phase 1 — coboundary-matrix bridge (cyclotomic → bigint)
// ----------------------------------------------------------------------------

describe("coboundaryMatrix", () => {
	it("M_{1−id} = 0", () => {
		const M = coboundaryMatrix(rot(0), R12);
		expect(M.length).toBe(R12.phi);
		for (const col of M) for (const e of col) expect(e).toBe(0n);
	});

	it("M_{1−(−1)} = 2·I (rotation by π)", () => {
		const M = coboundaryMatrix(rot(6), R12); // ζ^6 = −1
		for (let j = 0; j < R12.phi; j++)
			for (let i = 0; i < R12.phi; i++) expect(M[j][i]).toBe(i === j ? 2n : 0n);
	});

	it("column j equals (ζ^j − L(ζ^j)).num", () => {
		for (const op of [rot(2), rot(3), ref(0), ref(5)]) {
			const M = coboundaryMatrix(op, R24);
			for (let j = 0; j < R24.phi; j++) {
				const ej = Cyclotomic.zeta(R24, j);
				const direct = ej.sub(applyPointOp(op, ej));
				expect(direct.den).toBe(1n); // grid op on a basis vector ⇒ algebraic integer
				expect(M[j]).toEqual(direct.num);
			}
		}
	});

	it("PRE-Λ rotation collapse table = columnLatticeIndex(M_{1−ρ_p}) (A3 semantics)", () => {
		// N=12 {p2:16, p3:9, p4:4, p6:1}
		expect(columnLatticeIndex(coboundaryMatrix(rho(12, 2), R12))).toBe(16n);
		expect(columnLatticeIndex(coboundaryMatrix(rho(12, 3), R12))).toBe(9n);
		expect(columnLatticeIndex(coboundaryMatrix(rho(12, 4), R12))).toBe(4n);
		expect(columnLatticeIndex(coboundaryMatrix(rho(12, 6), R12))).toBe(1n);
		// N=24 {p2:256, p3:81, p4:16, p6:1, p8:4}
		expect(columnLatticeIndex(coboundaryMatrix(rho(24, 2), R24))).toBe(256n);
		expect(columnLatticeIndex(coboundaryMatrix(rho(24, 3), R24))).toBe(81n);
		expect(columnLatticeIndex(coboundaryMatrix(rho(24, 4), R24))).toBe(16n);
		expect(columnLatticeIndex(coboundaryMatrix(rho(24, 6), R24))).toBe(1n);
		expect(columnLatticeIndex(coboundaryMatrix(rho(24, 8), R24))).toBe(4n);
	});

	it("reflections have no finite pre-Λ index (rank-deficient ⇒ null)", () => {
		expect(columnLatticeIndex(coboundaryMatrix(ref(0), R12))).toBeNull();
		expect(columnLatticeIndex(coboundaryMatrix(ref(3), R24))).toBeNull();
	});
});

describe("latticeBasisMatrix", () => {
	it("extracts [u.num, v.num] (den must be 1)", () => {
		const u = new Cyclotomic(R12, [2n, 1n, 0n, 0n]); // 2 + ζ
		const v = new Cyclotomic(R12, [1n, 0n, 3n, 0n]); // 1 + 3ζ²
		expect(latticeBasisMatrix(u, v)).toEqual([
			[2n, 1n, 0n, 0n],
			[1n, 0n, 3n, 0n],
		]);
	});
});

describe("bridge integration — per-Λ pinned oracles (TA SNF-verified, A3)", () => {
	const withLattice = (u: Cyclotomic, v: Cyclotomic, op: PointOp, ring: CyclotomicRing) =>
		columnLatticeIndex([...latticeBasisMatrix(u, v), ...coboundaryMatrix(op, ring)]);

	it("N=12 Λ=⟨2+ζ, 1+3ζ²⟩, p2 ⇒ EXACTLY 4 classes", () => {
		const u = new Cyclotomic(R12, [2n, 1n, 0n, 0n]);
		const v = new Cyclotomic(R12, [1n, 0n, 3n, 0n]);
		expect(withLattice(u, v, rho(12, 2), R12)).toBe(4n);
	});

	it("hex Λ=⟨1, ζ²⟩, p6 ⇒ 1 class (canonical anchor, 𝒦=Λ)", () => {
		const u = new Cyclotomic(R12, [1n, 0n, 0n, 0n]); // 1
		const v = new Cyclotomic(R12, [0n, 0n, 1n, 0n]); // ζ²
		expect(withLattice(u, v, rho(12, 6), R12)).toBe(1n);
	});
});

// ----------------------------------------------------------------------------
// Phase 2 — subgroup-type coverage (A1)
// ----------------------------------------------------------------------------

const HEX_U = new Cyclotomic(R12, [1n, 0n, 0n, 0n]); // 1
const HEX_V = new Cyclotomic(R12, [0n, 0n, 1n, 0n]); // ζ²  (60° rhombus)
const SQ_U = new Cyclotomic(R12, [1n, 0n, 0n, 0n]); // 1
const SQ_V = new Cyclotomic(R12, [0n, 0n, 0n, 1n]); // ζ³ = i
const P2_U = new Cyclotomic(R12, [2n, 1n, 0n, 0n]); // 2 + ζ   (TA pinned p2 oracle)
const P2_V = new Cyclotomic(R12, [1n, 0n, 3n, 0n]); // 1 + 3ζ²

/** Independent expected type-breakdown from the raw survivor list (no reuse of enumerateSubgroupTypes). */
function expectedBreakdown(survivors: PointOp[], N: number) {
	const refls = survivors.filter((o) => o.reflect).map((o) => o.r);
	const m = survivors.filter((o) => !o.reflect).length;
	const divs: number[] = [];
	for (let i = 2; i <= m; i++) if (m % i === 0) divs.push(i);
	let dih = 0;
	for (const d of divs) {
		const q = N / d;
		dih += new Set(refls.map((r) => ((r % q) + q) % q)).size;
	}
	return { cyclicRotOrders: divs, reflCount: refls.length, dihedralCount: dih };
}

describe("enumerateSubgroupTypes (A1 coverage)", () => {
	for (const [name, u, v] of [["hex", HEX_U, HEX_V], ["square", SQ_U, SQ_V], ["pinned-p2", P2_U, P2_V]] as const) {
		it(`covers every subgroup of the point group — ${name}`, () => {
			const sur = latticePointGroup(u, v, R12);
			const types = enumerateSubgroupTypes(sur, R12);
			const exp = expectedBreakdown(sur, 12);
			expect(types.filter((t) => t.kind === "p1").length).toBe(1);
			expect(
				types.filter((t) => t.kind === "cyclic-rot").map((t) => (t as Extract<SubgroupType, { kind: "cyclic-rot" }>).order).sort((a, b) => a - b)
			).toEqual(exp.cyclicRotOrders);
			expect(types.filter((t) => t.kind === "cyclic-refl").length).toBe(exp.reflCount);
			expect(types.filter((t) => t.kind === "dihedral").length).toBe(exp.dihedralCount);
		});
	}

	it("hex yields C₆ + C₃ + C₂ (not just the maximal C₆)", () => {
		const types = enumerateSubgroupTypes(latticePointGroup(HEX_U, HEX_V, R12), R12);
		const rotOrders = types.filter((t) => t.kind === "cyclic-rot").map((t) => (t as { order: number }).order).sort((a, b) => a - b);
		expect(rotOrders).toEqual([2, 3, 6]);
		// dihedral orders present: D₂=4, D₃=6, D₆=12
		const dihOrders = new Set(types.filter((t) => t.kind === "dihedral").map((t) => (t as { order: number }).order));
		expect(dihOrders).toEqual(new Set([4, 6, 12]));
	});

	it("square yields C₄ + C₂", () => {
		const types = enumerateSubgroupTypes(latticePointGroup(SQ_U, SQ_V, R12), R12);
		const rotOrders = types.filter((t) => t.kind === "cyclic-rot").map((t) => (t as { order: number }).order).sort((a, b) => a - b);
		expect(rotOrders).toEqual([2, 4]);
	});

	it("OFF-GRID square u=2+i (D₄ holohedry, only C₄ grid-realized) ⇒ C₄+C₂ ONLY, no refl/dihedral", () => {
		// guards the survivors-vs-holohedry seam in the NEW layer (Phase-A's A3 off-grid lock, reused)
		const u = Cyclotomic.ONE(R24).scaleRational(2n, 1n).add(Cyclotomic.zeta(R24, 6)); // 2 + i
		const v = applyPointOp({ reflect: false, r: 6 }, u); // u·i (90° rotation)
		const sur = latticePointGroup(u, v, R24);
		expect(sur.filter((o) => o.reflect).length).toBe(0); // D₄ axes off-grid ⇒ no grid reflections
		const types = enumerateSubgroupTypes(sur, R24);
		expect(types.filter((t) => t.kind === "cyclic-rot").map((t) => (t as { order: number }).order).sort((a, b) => a - b)).toEqual([2, 4]);
		expect(types.filter((t) => t.kind === "cyclic-refl").length).toBe(0);
		expect(types.filter((t) => t.kind === "dihedral").length).toBe(0);
	});
});

// ----------------------------------------------------------------------------
// Phase 2 — cyclic normalized class keys
// ----------------------------------------------------------------------------

describe("cyclicBranchKey", () => {
	const rho2 = { reflect: false, r: 6 } as PointOp; // C₂ generator at N=12
	const rho6 = { reflect: false, r: 2 } as PointOp; // C₆ generator at N=12

	it("is Λ- and coboundary-invariant (the normalization)", () => {
		const d = Cyclotomic.zeta(R12, 1); // ζ
		const base = cyclicBranchKey(d, rho2, P2_U, P2_V, R12);
		// + lattice vectors
		expect(cyclicBranchKey(d.add(P2_U), rho2, P2_U, P2_V, R12)).toBe(base);
		expect(cyclicBranchKey(d.add(P2_V), rho2, P2_U, P2_V, R12)).toBe(base);
		// + coboundary (1−ρ₂)ζ^j = 2ζ^j (ρ₂ = −1)
		for (let j = 0; j < R12.phi; j++) {
			const cob = Cyclotomic.zeta(R12, j).scaleRational(2n, 1n);
			expect(cyclicBranchKey(d.add(cob), rho2, P2_U, P2_V, R12)).toBe(base);
		}
	});

	it("realises exactly columnLatticeIndex distinct classes (pinned oracles)", () => {
		const count = (L: PointOp, u: Cyclotomic, v: Cyclotomic) => {
			const keys = new Set<string>();
			for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) for (let e = 0; e < 4; e++)
				keys.add(cyclicBranchKey(new Cyclotomic(R12, [BigInt(a), BigInt(b), BigInt(c), BigInt(e)]), L, u, v, R12));
			return keys.size;
		};
		// p2 on the pinned oracle ⇒ 4; p6 on hex ⇒ 1
		expect(count(rho2, P2_U, P2_V)).toBe(4);
		expect(columnLatticeIndex([...latticeBasisMatrix(P2_U, P2_V), ...coboundaryMatrix(rho2, R12)])).toBe(4n);
		expect(count(rho6, HEX_U, HEX_V)).toBe(1);
	});
});

// ----------------------------------------------------------------------------
// Phase 2 — dihedral commutator + coupled key
// ----------------------------------------------------------------------------

const invPoint = (L: PointOp, N: number): PointOp =>
	L.reflect ? { reflect: true, r: L.r } : { reflect: false, r: ((N - L.r) % N + N) % N };

/** Independent brute-force closure of ⟨(L1,d1),(L2,d2)⟩ mod Λ — true iff finite & conflict-free.
 *  Operates purely by group closure (composePointOps + reduced translation parts), so it is
 *  independent of the commutator FORMULA under test. */
function closesAsDihedral(L1: PointOp, d1: Cyclotomic, L2: PointOp, d2: Cyclotomic, u: Cyclotomic, v: Cyclotomic, ring: CyclotomicRing): boolean {
	type C = { reflect: boolean; r: number; w: Cyclotomic };
	const red = (z: Cyclotomic) => reduceVecModLattice(z, u, v);
	const keyOf = (op: C) => `${op.reflect ? 1 : 0}:${op.r}`;
	const compose = (a: C, b: C): C => {
		const Lp = composePointOps({ reflect: a.reflect, r: a.r }, { reflect: b.reflect, r: b.r }, ring.N);
		return { reflect: Lp.reflect, r: Lp.r, w: red(applyPointOp({ reflect: a.reflect, r: a.r }, b.w).add(a.w)) };
	};
	const inv = (g: C): C => {
		const Lp = invPoint({ reflect: g.reflect, r: g.r }, ring.N);
		return { reflect: Lp.reflect, r: Lp.r, w: red(applyPointOp(Lp, g.w).neg()) };
	};
	const id: C = { reflect: false, r: 0, w: red(Cyclotomic.ZERO(ring)) };
	const gens: C[] = [{ reflect: L1.reflect, r: L1.r, w: red(d1) }, { reflect: L2.reflect, r: L2.r, w: red(d2) }];
	const seed = [...gens, ...gens.map(inv)];
	const map = new Map<string, C>([[keyOf(id), id]]);
	const queue: C[] = [id];
	while (queue.length) {
		const e = queue.shift()!;
		for (const g of seed) {
			const c = compose(e, g);
			const k = keyOf(c);
			const ex = map.get(k);
			if (ex) {
				if (ex.w.key() !== c.w.key()) return false; // conflict ⇒ no finite consistent branch
			} else {
				map.set(k, c);
				queue.push(c);
				if (map.size > 2 * ring.N) return false;
			}
		}
	}
	return true;
}

const glidePasses = (L2: PointOp, d2: Cyclotomic, u: Cyclotomic, v: Cyclotomic): boolean => {
	// σ² = id mod Λ ⇒ (1+σ)d₂ ∈ Λ
	const w = d2.add(applyPointOp(L2, d2));
	return reduceVecModLattice(w, u, v).key() === Cyclotomic.ZERO(d2.ring).key();
};

describe("dihedralCommutatorPrefilter (cross-checked vs independent closure)", () => {
	it("agrees with brute-force closure (glide ∧ commutator) on the square D₄ lattice", () => {
		const sur = latticePointGroup(SQ_U, SQ_V, R12);
		const dih = enumerateSubgroupTypes(sur, R12).find((t) => t.kind === "dihedral") as Extract<SubgroupType, { kind: "dihedral" }>;
		expect(dih).toBeDefined();
		const { rot: L1, refl: L2 } = dih;
		let checked = 0, agreed = 0, anyClose = 0;
		for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) for (let e = 0; e < 3; e++) {
			const d1 = new Cyclotomic(R12, [BigInt(a), BigInt(b), BigInt(c), BigInt(e)]);
			for (let f = 0; f < 3; f++) for (let g = 0; g < 3; g++) {
				const d2 = new Cyclotomic(R12, [BigInt(f), BigInt(g), 0n, 0n]);
				const closes = closesAsDihedral(L1, d1, L2, d2, SQ_U, SQ_V, R12);
				const predicted = glidePasses(L2, d2, SQ_U, SQ_V) && dihedralCommutatorPrefilter(d1, d2, L1, L2, SQ_U, SQ_V);
				checked++;
				if (closes === predicted) agreed++;
				if (closes) anyClose++;
			}
		}
		expect(agreed).toBe(checked); // exact agreement on every sampled pair
		expect(anyClose).toBeGreaterThan(0); // the sample actually exercises closing branches
	});
});

describe("dihedralBranchKey (coupled key; N1 separate-vs-shared)", () => {
	it("separate Λ-blocks merge correctly; the WRONG shared block under-merges (more branches)", () => {
		const sur = latticePointGroup(SQ_U, SQ_V, R12);
		const dih = enumerateSubgroupTypes(sur, R12).find((t) => t.kind === "dihedral") as Extract<SubgroupType, { kind: "dihedral" }>;
		const { rot: L1, refl: L2 } = dih;
		const phi = R12.phi;
		const zeros = new Array<bigint>(phi).fill(0n);
		const BL = latticeBasisMatrix(SQ_U, SQ_V);
		const M1 = coboundaryMatrix(L1, R12);
		const M2 = coboundaryMatrix(L2, R12);
		// WRONG: single shared/diagonal Λ-block (b in BOTH slots) instead of two separate blocks
		const wrongGens: bigint[][] = [];
		for (const b of BL) wrongGens.push([...b, ...b]);
		for (let j = 0; j < phi; j++) wrongGens.push([...M1[j], ...M2[j]]);

		const correct = new Set<string>();
		const wrong = new Set<string>();
		for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) for (let e = 0; e < 3; e++) {
			const d1 = new Cyclotomic(R12, [BigInt(a), BigInt(b), BigInt(c), BigInt(e)]);
			for (let f = 0; f < 3; f++) for (let g = 0; g < 3; g++) {
				const d2 = new Cyclotomic(R12, [BigInt(f), BigInt(g), 0n, 0n]);
				if (!glidePasses(L2, d2, SQ_U, SQ_V)) continue;
				if (!dihedralCommutatorPrefilter(d1, d2, L1, L2, SQ_U, SQ_V)) continue;
				correct.add(dihedralBranchKey(d1, d2, L1, L2, SQ_U, SQ_V, R12));
				wrong.add(reduceModColumnLattice([...d1.num, ...d2.num], wrongGens).join(","));
			}
		}
		expect(wrong.size).toBeGreaterThanOrEqual(correct.size);
		expect(wrong.size).toBeGreaterThan(correct.size); // strict on this pinned dihedral case
	});
});

// ----------------------------------------------------------------------------
// Phase 3 — re-anchor sets + conservation laws
// ----------------------------------------------------------------------------

// The full assembly calls holohedry()/detSurd(), which require the N=24 ring (Surd = ℚ(√2,√3)) —
// exactly the ring the production measurement uses. The pure column-lattice math above is ring-agnostic
// and pinned in N=12; the structural facts (conservation, p6→1) hold in N=24 too.
const TILES = [3, 4, 6, 12];
const HEX24_U = Cyclotomic.ONE(R24); // 1
const HEX24_V = Cyclotomic.zeta(R24, 4); // ζ₂₄⁴ = ζ₆ (60° rhombus)
const SQ24_U = Cyclotomic.ONE(R24); // 1
const SQ24_V = Cyclotomic.zeta(R24, 6); // ζ₂₄⁶ = i
const P2_24_U = Cyclotomic.ONE(R24).scaleRational(2n, 1n).add(Cyclotomic.zeta(R24, 2)); // 2 + ζ₁₂
const P2_24_V = Cyclotomic.ONE(R24).add(Cyclotomic.zeta(R24, 4).scaleRational(3n, 1n)); // 1 + 3ζ₁₂²

describe("enumerateNormalizedBranches (assembly + conservation)", () => {
	it("hex k=1: conservation holds; p6 collapses to ONE branch; p1 anchored at 0", () => {
		const { branches, diag } = enumerateNormalizedBranches(HEX24_U, HEX24_V, R24, TILES, 1);
		expect(diag.rotationConserved).toBe(true);
		expect(diag.reflectionConserved).toBe(true);
		const c6 = branches.filter((b) => b.type.kind === "cyclic-rot" && b.order === 6);
		expect(c6.length).toBe(1); // p6 → 1 class (1−ζ₆ a unit, 𝒦=Λ)
		const p1 = branches.filter((b) => b.type.kind === "p1");
		expect(p1.length).toBe(1);
		expect(p1[0].reAnchorSet.length).toBe(1);
		expect(p1[0].reAnchorSet[0].key()).toBe(Cyclotomic.ZERO(R24).key());
	});

	it("square & pinned-p2, k=1: rotation/reflection conservation holds", () => {
		for (const [u, v] of [[SQ24_U, SQ24_V], [P2_24_U, P2_24_V]] as const) {
			const { diag } = enumerateNormalizedBranches(u, v, R24, TILES, 1);
			expect(diag.rotationConserved).toBe(true);
			expect(diag.reflectionConserved).toBe(true);
			for (const c of diag.conservationDetail) expect(c.ok).toBe(true);
		}
	});

	it("is deterministic (identical branch keys across runs)", () => {
		const keys = () => enumerateNormalizedBranches(SQ24_U, SQ24_V, R24, TILES, 1).branches.map((b) => b.key);
		expect(keys()).toEqual(keys());
	});
});

describe("reAnchorPoint round-trip", () => {
	it("t solves (1−L)·t ≡ w′−d (mod Λ) on the pinned p2 oracle", () => {
		const L = { reflect: false, r: 6 } as PointOp; // ρ₂ at N=12
		const gens = [...latticeBasisMatrix(P2_U, P2_V), ...coboundaryMatrix(L, R12)];
		for (const dn of [[1n, 0n, 0n, 0n], [0n, 1n, 0n, 0n], [3n, 2n, 1n, 0n], [5n, 0n, 4n, 1n]] as bigint[][]) {
			const d = new Cyclotomic(R12, dn);
			const t = reAnchorPoint(d, L, P2_U, P2_V, R12);
			const wp = new Cyclotomic(R12, reduceModColumnLattice(d.num, gens));
			const diff = t.sub(applyPointOp(L, t)).sub(wp.sub(d)); // (1−L)t − (w′−d)
			expect(reduceVecModLattice(diff, P2_U, P2_V).key()).toBe(Cyclotomic.ZERO(R12).key());
		}
	});
});
