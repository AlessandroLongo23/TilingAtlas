import { describe, it, expect } from "vitest";
import { ExactStarPolygon } from "@/classes/polygons/ExactStarPolygon";
import { Cyclotomic, CyclotomicRing } from "@/classes/Cyclotomic";
import { polygonAreaSurd } from "@/classes/algorithm/exact/Surd";

const ring = CyclotomicRing.create(24);
const ZERO = Cyclotomic.ZERO(ring);

describe("ExactStarPolygon 4*_{π/4} (C7 spike B1)", () => {
	it("is an 8-vertex star in ℤ[ζ₂₄], isStar, n=4 (disambiguates from the square)", () => {
		const s = ExactStarPolygon.fourStarPi4(ZERO, 0);
		expect(s.isStar).toBe(true);
		expect(s.n).toBe(4);
		expect(s.exactVertices?.length).toBe(8);
		expect(s.edgeDirs?.length).toBe(8);
		for (const v of s.exactVertices!) expect(v.ring.N).toBe(24);
	});

	it("corner angles alternate point(3)/dent(15) in 2π/24 units (= 45°/225°)", () => {
		const s = ExactStarPolygon.fourStarPi4(ZERO, 0);
		const angles = s.exactVertices!.map((_, i) => s.cornerAngleUnits(i));
		expect(angles).toEqual([3, 15, 3, 15, 3, 15, 3, 15]);
		// interior angles of a simple 8-gon sum to (8−2)·12 = 72 units
		expect(angles.reduce((a, b) => a + b, 0)).toBe(72);
	});

	it("is a closed polygon: Σ unit edge vectors = 0 (exact)", () => {
		const s = ExactStarPolygon.fourStarPi4(ZERO, 0);
		let sum = ZERO;
		for (const d of s.edgeDirs!) sum = sum.add(Cyclotomic.zeta(ring, d));
		expect(sum.isZero()).toBe(true);
	});

	it("has positive, non-convex exact area (shoelace, winding-independent)", () => {
		const s = ExactStarPolygon.fourStarPi4(ZERO, 0);
		const area = polygonAreaSurd(s.exactVertices!);
		expect(area.toFloat()).toBeGreaterThan(0);
		// a 4-pointed star with unit edges is far smaller than the unit-edge octagon (~4.83)
		expect(area.toFloat()).toBeLessThan(4.83);
	});

	it("cornerToken tags point/dent and stays disjoint from the square's bare '4'", () => {
		const s = ExactStarPolygon.fourStarPi4(ZERO, 0);
		const toks = s.exactVertices!.map((_, i) => s.cornerToken(i));
		expect(toks).toEqual([
			"4*p@3", "4*d@15", "4*p@3", "4*d@15", "4*p@3", "4*d@15", "4*p@3", "4*d@15",
		]);
		expect(toks).not.toContain("4");
	});

	it("clone preserves exact geometry and star-ness", () => {
		const s = ExactStarPolygon.fourStarPi4(ZERO, 0);
		const c = s.clone();
		expect(c.isStar).toBe(true);
		expect(c.exactKey()).toBe(s.exactKey());
	});

	it("fourStarPi4 is exactly isotoxal(4, 3)", () => {
		const a = ExactStarPolygon.fourStarPi4(ZERO, 0);
		const b = ExactStarPolygon.isotoxal(4, 3, ZERO, 0);
		expect(b.exactKey()).toBe(a.exactKey());
		expect(b.alphaU).toBe(3);
		expect(b.betaU).toBe(15);
	});
});

// The ~32 admissible in-ring variants: n | 24, n ≥ 3, 0 < α < 12·(n−2)/n (π/12 units).
// regularInteriorU = 12·(n−2)/n is the regular n-gon interior angle; α must be strictly below it
// (⟺ β > 12, a genuine reflex dent). This list is the *registration* set, NOT the Myers oracle.
const ADMISSIBLE: { n: number; alphas: number[] }[] = [3, 4, 6, 8, 12].map((n) => {
	const regularInteriorU = (12 * (n - 2)) / n;
	const alphas: number[] = [];
	for (let a = 1; a < regularInteriorU; a++) alphas.push(a);
	return { n, alphas };
});

describe("ExactStarPolygon.isotoxal — all admissible in-ring variants (B1-gen)", () => {
	it("registers exactly ~32 variants with the expected per-n counts", () => {
		const counts = ADMISSIBLE.map((g) => g.alphas.length);
		expect(counts).toEqual([3, 5, 7, 8, 9]); // n = 3,4,6,8,12
		expect(counts.reduce((a, b) => a + b, 0)).toBe(32);
	});

	for (const { n, alphas } of ADMISSIBLE) {
		for (const alphaU of alphas) {
			const betaU = 24 - 24 / n - alphaU;
			it(`${n}*@${alphaU} (β=${betaU}): 2n vertices in ℤ[ζ₂₄], corners [α,β,…], closed, area>0`, () => {
				const s = ExactStarPolygon.isotoxal(n, alphaU, ZERO, 0);
				expect(s.isStar).toBe(true);
				expect(s.n).toBe(n);
				expect(s.alphaU).toBe(alphaU);
				expect(s.betaU).toBe(betaU);
				expect(s.exactVertices?.length).toBe(2 * n);
				for (const v of s.exactVertices!) expect(v.ring.N).toBe(24);

				// corner angles alternate point(α)/dent(β); a genuine reflex dent means β > 12
				const angles = s.exactVertices!.map((_, i) => s.cornerAngleUnits(i));
				const expected = Array.from({ length: 2 * n }, (_, i) => (i % 2 === 0 ? alphaU : betaU));
				expect(angles).toEqual(expected);
				expect(betaU).toBeGreaterThan(12);
				// simple 2n-gon interior-angle sum = (2n−2)·12 units
				expect(angles.reduce((a, b) => a + b, 0)).toBe((2 * n - 2) * 12);

				// closure: Σ unit edge vectors = 0 (exact) ⟺ Σ turns = 24
				let sum = ZERO;
				for (const d of s.edgeDirs!) sum = sum.add(Cyclotomic.zeta(ring, d));
				expect(sum.isZero()).toBe(true);

				// positive exact area
				const area = polygonAreaSurd(s.exactVertices!);
				expect(area.toFloat()).toBeGreaterThan(0);
			});
		}
	}

	it("rejects α at or above the regular interior angle (β would not be reflex)", () => {
		// n=4: regular interior = 6 units; α=6 ⇒ β=12 (straight, not a dent), α=7 ⇒ β=11 (convex)
		expect(() => ExactStarPolygon.isotoxal(4, 6, ZERO, 0)).toThrow();
		expect(() => ExactStarPolygon.isotoxal(4, 7, ZERO, 0)).toThrow();
		expect(() => ExactStarPolygon.isotoxal(4, 0, ZERO, 0)).toThrow();
	});

	it("rejects n that does not divide 24", () => {
		expect(() => ExactStarPolygon.isotoxal(5, 2, ZERO, 0)).toThrow(/divide 24/);
		expect(() => ExactStarPolygon.isotoxal(9, 2, ZERO, 0)).toThrow(/divide 24/);
	});

	// C3 gap-seating primitive: the fill loop seats a star's POINT into an open gap with CW boundary ray
	// d0 by calling isotoxal(n, α, w, d0). This must place vertex 0 (a point) AT w with outgoing edge d0,
	// so the point's interior α covers the arc [d0, d0+α] — exactly mirroring RegularPolygon gap-seating.
	it("seats the POINT at the anchor with outgoing edge d0 (gap-seating for C3 fill)", () => {
		const w = Cyclotomic.fromRational(ring, 3n, 1n); // arbitrary exact anchor
		const d0 = 14; // 4(p)'s star slot: point covers [14, 16]
		const s = ExactStarPolygon.isotoxal(4, 2, w, d0);
		expect(s.exactVertices![0].equals(w)).toBe(true); // vertex 0 (a point) is AT the gap vertex
		expect(s.edgeDirs![0]).toBe(d0); //                  outgoing edge = the gap's CW ray
		expect(s.cornerAngleUnits(0)).toBe(2); //            point interior α = 2 ⇒ covers [14, 16]
	});
});
