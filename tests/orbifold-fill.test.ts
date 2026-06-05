import { describe, it, expect } from "vitest";
import { Cyclotomic, CyclotomicRing } from "@/classes/Cyclotomic";
import { applyPointOp, mapPoint, composePointOps, closeGroup, type CosetOp } from "@/classes/algorithm/OrbifoldBranches";
import {
	countOrbitsUnderBranch,
	stabG,
	enumerateNormalizedBranches,
} from "@/classes/algorithm/OrbifoldNormalized";
import { isIntCombo } from "@/classes/algorithm/LatticeEnumerator";
import { RegularPolygon } from "@/classes/polygons/RegularPolygon";

const R12 = CyclotomicRing.create(12);
const R24 = CyclotomicRing.create(24);
const z = (ring: CyclotomicRing, k: number) => Cyclotomic.zeta(ring, k);

// A deliberately COARSE square lattice so small points are pairwise distinct mod Λ.
const COARSE_U = Cyclotomic.ONE(R12).scaleRational(10n, 1n); // 10
const COARSE_V = z(R12, 3).scaleRational(10n, 1n); // 10·i

// ----------------------------------------------------------------------------
// 2a — budget-under-G counter + stabiliser
// ----------------------------------------------------------------------------

describe("countOrbitsUnderBranch", () => {
	it("p1 (identity only) ⇒ orbits = #vertex classes", () => {
		const id = closeGroup([], COARSE_U, COARSE_V, R12)!; // [identity]
		const vReps = [Cyclotomic.ONE(R12), z(R12, 1), z(R12, 2)];
		expect(countOrbitsUnderBranch(vReps, COARSE_U, COARSE_V, id)).toBe(3);
	});

	it("C₄ about the origin merges a 4-cycle into ONE orbit", () => {
		const c4 = closeGroup([{ reflect: false, r: 3, w: Cyclotomic.ZERO(R12) }], COARSE_U, COARSE_V, R12)!;
		expect(c4.length).toBe(4);
		const p = Cyclotomic.ONE(R12);
		const cycle = [p, z(R12, 3), z(R12, 6), z(R12, 9)]; // 1, i, −1, −i
		expect(countOrbitsUnderBranch(cycle, COARSE_U, COARSE_V, c4)).toBe(1);
		// add an unrelated class ⇒ 2 orbits
		expect(countOrbitsUnderBranch([...cycle, Cyclotomic.ONE(R12).scaleRational(2n, 1n)], COARSE_U, COARSE_V, c4)).toBe(2);
	});
});

describe("stabG (stabiliser of x in G = direct congruence w ≡ (1−L)x)", () => {
	const c4 = () => closeGroup([{ reflect: false, r: 3, w: Cyclotomic.ZERO(R12) }], COARSE_U, COARSE_V, R12)!;
	it("x = origin ⇒ stab = the whole rotation group", () => {
		expect(stabG(Cyclotomic.ZERO(R12), c4(), COARSE_U, COARSE_V).length).toBe(4);
	});
	it("x = a generic point ⇒ stab is trivial (identity only)", () => {
		expect(stabG(Cyclotomic.ONE(R12), c4(), COARSE_U, COARSE_V).length).toBe(1);
	});
});

// ----------------------------------------------------------------------------
// 2a — branch group materialisation (ops on NormalizedBranch)
// ----------------------------------------------------------------------------

describe("NormalizedBranch.ops materialisation", () => {
	const HEX_U = Cyclotomic.ONE(R24);
	const HEX_V = z(R24, 4); // ζ₂₄⁴ = ζ₆

	it("p1 branch has order-1 ops; the C₆ cyclic-rot branch has order-6 ops closing correctly", () => {
		const { branches } = enumerateNormalizedBranches(HEX_U, HEX_V, R24, [3, 4, 6, 12], 1);
		const p1 = branches.find((b) => b.type.kind === "p1")!;
		expect(p1.ops.length).toBe(1);
		const c6 = branches.find((b) => b.type.kind === "cyclic-rot" && b.order === 6)!;
		expect(c6.ops.length).toBe(6);
		// every op's order field is consistent with |ops|
		for (const b of branches) expect(b.ops.length).toBe(b.order);
	});

	// R3: the branch group `ops` MUST be closed under the GEOMETRIC isometry composition (the same
	// `mapPoint` the fill stamps with), or a stamped cell is not actually G-invariant — the dihedral
	// branch-invariant violation seen at k=2. For every g,h ∈ ops, g∘h (geometric) must equal some
	// f ∈ ops mod Λ:  L_f = compose(g,h),  w_f ≡ L_g(w_h) + w_g (mod Λ).
	it("every branch's ops are closed under geometric composition (incl. dihedral)", () => {
		for (const [u, v, ring, label] of [
			[HEX_U, HEX_V, R24, "hex"],
			[Cyclotomic.ONE(R24), z(R24, 6), R24, "square"], // ζ₂₄⁶ = i ⇒ square lattice (D4)
		] as const) {
			const { branches } = enumerateNormalizedBranches(u, v, ring, [3, 4, 6, 12], 2);
			const N = ring.N;
			for (const b of branches) {
				for (const g of b.ops) {
					for (const h of b.ops) {
						const comp = composePointOps({ reflect: g.reflect, r: g.r }, { reflect: h.reflect, r: h.r }, N);
						const w = applyPointOp({ reflect: g.reflect, r: g.r }, h.w).add(g.w); // L_g(w_h) + w_g
						const found = b.ops.some(
							(f) => f.reflect === comp.reflect && f.r === comp.r && isIntCombo(f.w.sub(w), u, v)
						);
						expect(found, `${label} ${b.key} not closed: (${g.reflect},${g.r})∘(${h.reflect},${h.r})`).toBe(true);
					}
				}
			}
		}
	});
});

// ----------------------------------------------------------------------------
// 2a — orbit-stamp convention: transformedRigid == applyPointOp + w (R2 lock)
// ----------------------------------------------------------------------------

describe("orbit-stamp convention (transformedRigid vs applyPointOp+w)", () => {
	it("matches over all 48 (reflect,r) on a sample triangle", () => {
		const ZERO = Cyclotomic.ZERO(R12);
		const P = RegularPolygon.fromAnchorAndDirExact(3, ZERO, 0);
		const w = Cyclotomic.ONE(R12).add(z(R12, 1)); // 1 + ζ
		for (const reflect of [false, true]) {
			for (let r = 0; r < 12; r++) {
				// rotation: transformedRigid(ZERO,false,0,r,w); reflection: (ZERO,true,r,0,w)
				const tr = P.transformedRigid(ZERO, reflect, reflect ? r : 0, reflect ? 0 : r, w, "exact");
				const got = tr.exactVertices!.map((x) => x.key()).sort().join("|");
				const exp = P.exactVertices!.map((vx) => applyPointOp({ reflect, r }, vx).add(w).key()).sort().join("|");
				expect(got).toBe(exp);
			}
		}
	});
});

// ----------------------------------------------------------------------------
// 2a — gate ≡ budget: the shared isometry primitive and the lattice-equiv test
// (R2/R4 retired-by-test: the budget counter must quotient by provably the same
//  map the k-uniformity gate verifies, or it could silently over-prune.)
// ----------------------------------------------------------------------------

describe("shared mapPoint ≡ the gate's historical inline isometry", () => {
	// The k-uniformity gate formerly defined `mapPoint` inline as
	//   (reflect ? z.conj().mulZeta(r) : z.mulZeta(r)).add(T)
	// We extracted it to OrbifoldBranches.mapPoint (built on applyPointOp) and now BOTH the gate and
	// the orbifold budget counter call it. Pin byte-equality with the historical arithmetic so the
	// refactor is provably digest-neutral and the two consumers use the identical map.
	const historical = (ring: CyclotomicRing) =>
		(zz: Cyclotomic, reflect: boolean, r: number, T: Cyclotomic): Cyclotomic =>
			(reflect ? zz.conj().mulZeta(r) : zz.mulZeta(r)).add(T);

	for (const ring of [R12, R24]) {
		it(`N=${ring.N}: matches over all (reflect,r) on a battery of (z,T)`, () => {
			const h = historical(ring);
			const samples = [
				Cyclotomic.ZERO(ring),
				Cyclotomic.ONE(ring),
				z(ring, 1),
				Cyclotomic.ONE(ring).add(z(ring, 2)).add(z(ring, 5)),
				z(ring, 3).scaleRational(2n, 1n).sub(z(ring, 7)),
			];
			for (const zz of samples) {
				for (const T of samples) {
					for (const reflect of [false, true]) {
						for (let r = 0; r < ring.N; r++) {
							expect(mapPoint(zz, reflect, r, T).key()).toBe(h(zz, reflect, r, T).key());
						}
					}
				}
			}
		});
	}
});

describe("isIntCombo (the budget's lattice-equiv) is an exact lattice-membership test", () => {
	// The gate's private `isLatticeCombo` and the budget's `isIntCombo` both decide a−b ∈ Λ exactly
	// (float guess, exact .isZero() verify). The gate's test is untouched (flag-off digests prove it);
	// here we pin `isIntCombo` directly as a correct exact membership test, so both are correct ⇒ agree.
	const cases: [CyclotomicRing, Cyclotomic, Cyclotomic][] = [
		[R12, Cyclotomic.ONE(R12).scaleRational(10n, 1n), z(R12, 3).scaleRational(10n, 1n)], // 10, 10i
		[R24, Cyclotomic.ONE(R24), z(R24, 4)], // hex 1, ζ₆
	];
	for (const [ring, u, v] of cases) {
		it(`N=${ring.N}: integer combos ∈ Λ, half/foreign vectors ∉ Λ`, () => {
			for (const m of [-3n, 0n, 1n, 5n]) {
				for (const n of [-2n, 0n, 1n, 4n]) {
					const w = u.scaleRational(m, 1n).add(v.scaleRational(n, 1n));
					expect(isIntCombo(w, u, v)).toBe(true);
				}
			}
			// half a basis vector is NOT in the lattice
			expect(isIntCombo(u.scaleRational(1n, 2n), u, v)).toBe(false);
			expect(isIntCombo(v.scaleRational(1n, 2n).add(u), u, v)).toBe(false);
			// a basis vector + a foreign primitive root (off the lattice)
			expect(isIntCombo(u.add(z(ring, 1)), u, v)).toBe(false);
		});
	}
});
