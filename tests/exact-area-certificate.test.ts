/** CB-1 (review-2026-06-09): the certificate's area leg decides on EXACT Surd arithmetic.
 *  Pins: (1) the shoelace-exact per-tile area `tileAreaSurdFor` equals the closed-form
 *  `tileAreaSurd(n)` for every regular tile in the core; (2) it is placement-invariant
 *  (translation + grid rotation) — the certificate sums areas of PLACED tiles; (3) star tiles get
 *  their TRUE non-convex area: the certified 4(j) cell identity star + octagon = |det Λ| = 4+2√2
 *  (DEVELOPMENT_NOTES §23.3) holds exactly. */
import { describe, it, expect } from "vitest";
import { tileAreaSurdFor } from "@/classes/algorithm/PeriodSolver";
import { tileAreaSurd, polygonAreaSurd, Surd } from "@/classes/algorithm/exact/Surd";
import { RegularPolygon } from "@/classes/polygons/RegularPolygon";
import { ExactStarPolygon } from "@/classes/polygons/ExactStarPolygon";
import { Cyclotomic, CyclotomicRing } from "@/classes/Cyclotomic";

const ring = CyclotomicRing.create(24);
const ZERO = Cyclotomic.ZERO(ring);

describe("CB-1: exact certificate area leg", () => {
	it("shoelace tileAreaSurdFor == closed-form tileAreaSurd(n) for the regular core {3,4,6,8,12}", () => {
		for (const n of [3, 4, 6, 8, 12]) {
			const p = RegularPolygon.fromAnchorAndDirExact(n, ZERO, 0);
			expect(tileAreaSurdFor(p).cmp(tileAreaSurd(n))).toBe(0);
		}
	});

	it("is placement-invariant: translated + rotated placements give the identical Surd", () => {
		for (const n of [3, 4, 8]) {
			const base = tileAreaSurdFor(RegularPolygon.fromAnchorAndDirExact(n, ZERO, 0));
			// different anchor (a nontrivial ℤ[ζ₂₄] point) and a different grid direction
			const anchor = Cyclotomic.zeta(ring, 1).add(Cyclotomic.zeta(ring, 7));
			const moved = tileAreaSurdFor(RegularPolygon.fromAnchorAndDirExact(n, anchor, 5));
			expect(moved.cmp(base)).toBe(0);
		}
	});

	it("star tiles use the TRUE non-convex area; certified 4(j) identity star + octagon = 4+2√2 exactly", () => {
		const star = ExactStarPolygon.fourStarPi4(ZERO, 0);
		const starArea = tileAreaSurdFor(star);
		// float layer and exact layer agree on the star (the broadphase never contradicts the decider)
		expect(Math.abs(starArea.toFloat() - polygonAreaSurd(star.exactVertices!).toFloat())).toBeLessThan(1e-12);
		const oct = RegularPolygon.fromAnchorAndDirExact(8, ZERO, 0);
		const cell = starArea.add(tileAreaSurdFor(oct));
		// |det Λ| of the certified 4(j) cell = 4 + 2√2 (NOTES §23.3)
		expect(cell.cmp(new Surd(4n, 2n, 0n, 0n, 1n))).toBe(0);
	});
});
