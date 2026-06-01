import { describe, it, expect } from "vitest";
import { computeOrder, regularOrders } from "@/classes/algorithm/PolygonsGenerator";
import { PolygonType } from "@/classes/polygons/PolygonType";

describe("computeOrder / regularOrders", () => {
	it("explicit ns is honored and sorted", () => {
		expect(regularOrders({ [PolygonType.REGULAR]: { ns: [12, 3, 8, 4, 6] } })).toEqual([
			3, 4, 6, 8, 12,
		]);
	});

	it("falls back to contiguous 3..n_max", () => {
		expect(regularOrders({ [PolygonType.REGULAR]: { n_max: 6 } })).toEqual([3, 4, 5, 6]);
	});

	it("gate set {3,4,6,8,12} → N=24", () => {
		expect(computeOrder({ [PolygonType.REGULAR]: { ns: [3, 4, 6, 8, 12] } })).toBe(24);
	});

	it("{3,4,6,12} → N=12", () => {
		expect(computeOrder({ [PolygonType.REGULAR]: { ns: [3, 4, 6, 12] } })).toBe(12);
	});

	it("contiguous 3..12 blows N up (why ns is required)", () => {
		// lcm(2,3,4,5,6,7,8,9,10,11,12) = 27720 — infeasible; documents the hazard
		expect(computeOrder({ [PolygonType.REGULAR]: { n_max: 12 } })).toBe(27720);
	});
});
