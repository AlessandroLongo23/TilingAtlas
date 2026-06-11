import { describe, it, expect } from "vitest";
import { Cyclotomic, CyclotomicRing } from "@/classes/Cyclotomic";
import { detSurd } from "@/classes/algorithm/exact/Surd";
import {
	gridImage,
	gridImageBasis,
	groupIntoGridOrbits,
	sameLattice,
	holohedry,
	latticeKey,
	areaKey,
	type OrbitGroup,
} from "@/classes/algorithm/LatticeEnumerator";

const ring = CyclotomicRing.create(24);
const N = 24;
const ONE = Cyclotomic.ONE(ring);
const OMEGA = Cyclotomic.zeta(ring, 4); // e^{iπ/3} (60°) — hexagonal multiplier
const IMAG = Cyclotomic.zeta(ring, 6); // i (90°)

// Genuinely oblique basis (hol = 2, asserted in the tests): (1, ζ² + ζ⁴) — Gram (1, 2, (√3−1)/2),
// no symmetry signature holds (see the holohedry suite in lattice-enumerator.test.ts).
const OBL_U = ONE;
const OBL_V = Cyclotomic.zeta(ring, 2).add(Cyclotomic.zeta(ring, 4));

type Basis = [Cyclotomic, Cyclotomic];

/** Re-verify every recorded map exactly: g(Λ_rep) must equal Λ_member (rem:orbitdedup constraint 1 —
 *  the maps are re-verifiable, not trusted). */
const verifyMaps = (groups: OrbitGroup[], lattices: Basis[]) => {
	for (const g of groups) {
		const [ru, rv] = lattices[g.repIdx];
		for (const m of g.memberMaps) {
			const [mu, mv] = lattices[m.idx];
			const [gu, gv] = gridImageBasis(ru, rv, m.rot, m.refl);
			expect(sameLattice(mu, mv, gu, gv)).toBe(true);
		}
	}
};

describe("groupIntoGridOrbits: exact grid point-group orbit grouping (lem:orbitdedup foundation)", () => {
	it("groups a true-oblique Λ with its ζ³- and conj-images into ONE orbit; rep = first list member", () => {
		expect(holohedry(OBL_U, OBL_V)).toBe(2); // genuinely oblique — assert, don't assume
		const zeta3 = gridImageBasis(OBL_U, OBL_V, 3, false);
		const conj = gridImageBasis(OBL_U, OBL_V, 0, true);
		// "shuffled": the original basis is NOT first — the rep is the FIRST-generated list member.
		const lattices: Basis[] = [zeta3, conj, [OBL_U, OBL_V]];
		const groups = groupIntoGridOrbits(lattices, N);
		expect(groups.length).toBe(1);
		expect(groups[0].repIdx).toBe(0);
		// the rep's own entry comes first, as the identity map
		expect(groups[0].memberMaps[0]).toEqual({ idx: 0, rot: 0, refl: false });
		expect(groups[0].memberMaps.map((m) => m.idx).sort()).toEqual([0, 1, 2]);
		verifyMaps(groups, lattices); // EVERY recorded map re-verified by re-application
	});

	it("constraint-1 guard: same exact |det| but non-isometric Gram data ⇒ TWO groups (a key collision must never merge)", () => {
		const rect: Basis = [ONE, IMAG.scaleRational(4n, 1n)]; // 1×4 rectangle — Gram (1, 16, 0)
		const square: Basis = [ONE.scaleRational(2n, 1n), IMAG.scaleRational(2n, 1n)]; // 2×2 square — Gram (4, 4, 0)
		// both |det| = 4 ⇒ the SAME area bucket: only the exact 2N-map sameLattice sweep may separate them
		expect(areaKey(detSurd(rect[0], rect[1]).abs())).toBe(areaKey(detSurd(square[0], square[1]).abs()));
		const groups = groupIntoGridOrbits([rect, square], N);
		expect(groups.length).toBe(2);
		verifyMaps(groups, [rect, square]);
	});

	it("is class-agnostic: a hexagonal lattice (hol = 12) and its ζ-image DO group (hol-gating is the call site's job)", () => {
		const hex: Basis = [ONE, OMEGA];
		expect(holohedry(hex[0], hex[1])).toBe(12);
		const img = gridImageBasis(hex[0], hex[1], 1, false);
		const groups = groupIntoGridOrbits([hex, img], N);
		expect(groups.length).toBe(1);
		verifyMaps(groups, [hex, img]);
	});

	it("tied-minima robustness: two bases of the SAME hexagonal lattice with DIFFERENT latticeKeys still group as one", () => {
		// six shortest vectors tie in a hexagonal lattice, so Gauss reduction can land on different
		// reduced pairs: (1, ω) reduces to (ω−1, 1) while (ω−1, −1) reduces to (ω−1, −ω) — distinct
		// keys because the reduced PAIRS differ after sign-norm, not because either basis is a
		// reduction fixed point.  (E.g. (ω, ω−1) happens to reduce to the SAME key as (1, ω).)
		const b1: Basis = [ONE, OMEGA];
		const b2: Basis = [OMEGA.sub(ONE), ONE.neg()]; // ⟨ω−1, −1⟩ ∋ 1 and (ω−1)+1 = ω ⇒ the same ℤ[ω]
		expect(sameLattice(b1[0], b1[1], b2[0], b2[1])).toBe(true);
		expect(latticeKey(b1[0], b1[1])).not.toBe(latticeKey(b2[0], b2[1])); // the canonical key SPLITS here
		const groups = groupIntoGridOrbits([b1, b2], N);
		expect(groups.length).toBe(1); // sameLattice sees through the key split
		verifyMaps(groups, [b1, b2]);
	});

	it("refl maps: conj(Λ) of a true oblique is reached ONLY by a reflection — the recorded map has refl === true", () => {
		expect(holohedry(OBL_U, OBL_V)).toBe(2);
		const conj: Basis = [gridImage(OBL_U, 0, true), gridImage(OBL_V, 0, true)];
		const lattices: Basis[] = [[OBL_U, OBL_V], conj];
		const groups = groupIntoGridOrbits(lattices, N);
		expect(groups.length).toBe(1);
		const m = groups[0].memberMaps.find((mm) => mm.idx === 1);
		expect(m).toBeDefined();
		expect(m!.refl).toBe(true);
		// No pure rotation reaches conj(Λ): a coincidence conj(Λ) = ζ^r·Λ would put the reflection
		// ζ^{-r}∘conj in the stabilizer of Λ, forcing hol ≥ 4 — contradicting hol = 2 asserted above.
		for (let rot = 0; rot < N; rot++) {
			expect(
				sameLattice(conj[0], conj[1], gridImage(OBL_U, rot, false), gridImage(OBL_V, rot, false))
			).toBe(false);
		}
		verifyMaps(groups, lattices);
	});

	it("g⁻¹ formulas (OP-3 seeding): exact inversion of gridImage for EVERY g ∈ G", () => {
		// solve()'s per-map seeding inverts the recorded g = (rot, refl) as:
		//   refl=false ⇒ g⁻¹ = pure rotation by (N−rot) mod N;   refl=true ⇒ g⁻¹ = g (involution).
		// Pinned here at the vector level, over the full group (all 2N elements).
		const w = OBL_V; // a non-symmetric vector: no g fixes it except the identity
		for (let rot = 0; rot < N; rot++) {
			expect(gridImage(gridImage(w, rot, false), (N - rot) % N, false).sub(w).isZero()).toBe(true);
			expect(gridImage(gridImage(w, rot, true), rot, true).sub(w).isZero()).toBe(true);
		}
	});

	it("determinism: the member-index PARTITION is shuffle-invariant (reps follow input order — by design)", () => {
		const base: Basis[] = [
			[OBL_U, OBL_V],
			gridImageBasis(OBL_U, OBL_V, 3, false),
			gridImageBasis(OBL_U, OBL_V, 0, true),
			[ONE, IMAG.scaleRational(4n, 1n)], // 1×4 rect
			[ONE.scaleRational(2n, 1n), IMAG.scaleRational(2n, 1n)], // 2×2 square (same |det| as the rect)
			[ONE, OMEGA], // hexagonal
		];
		const perm1 = [2, 4, 0, 5, 1, 3];
		const perm2 = [5, 3, 1, 0, 2, 4];
		const partitionOf = (perm: number[]) => {
			const lattices = perm.map((i) => base[i]);
			const groups = groupIntoGridOrbits(lattices, N);
			verifyMaps(groups, lattices);
			// map member indices back to base labels so partitions are comparable across shuffles
			return groups
				.map((g) => g.memberMaps.map((m) => perm[m.idx]).sort((a, b) => a - b).join(","))
				.sort();
		};
		const p1 = partitionOf(perm1);
		const p2 = partitionOf(perm2);
		expect(p1.length).toBe(4); // {Λ, ζ³Λ, conj Λ} plus three singletons
		expect(p1).toEqual(p2); // partition equality, NOT rep equality
	});
});
