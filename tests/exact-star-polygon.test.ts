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
});
