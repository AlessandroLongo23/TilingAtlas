import { describe, it, expect } from "vitest";
import { resolveRayStops, type RayCrossing } from "@/lib/utils/islamicRayStops";

const INF = Array(4).fill(Infinity);

describe("resolveRayStops — growing-line (pass 1, trim off)", () => {
	it("a symmetric crossing stops both rays at it", () => {
		// Two rays that cross at distance 1 for both — the regular-tile case.
		const xs: RayCrossing[][] = [[{ t: 1, j: 1, tj: 1 }], [{ t: 1, j: 0, tj: 1 }]];
		expect(resolveRayStops(xs, 1, [Infinity, Infinity])).toEqual([1, 1]);
		// Trimming a symmetric crossing changes nothing (there is no overshoot).
		expect(resolveRayStops(xs, 1, [Infinity, Infinity], 1e-9, true)).toEqual([1, 1]);
	});

	it("the earlier ray of an asymmetric crossing sails through (the overshoot)", () => {
		// Ray0 crosses Ray1 near (0-dist 1) but arrives before Ray1 (1-dist 2), so it passes through and stops
		// only at Ray2 (0-dist 3), which passes through in turn (2-dist 1, ends later at Ray3). Classic overshoot.
		const xs: RayCrossing[][] = [
			[{ t: 1, j: 1, tj: 2 }, { t: 3, j: 2, tj: 1 }],
			[{ t: 2, j: 0, tj: 1 }],
			[{ t: 1, j: 0, tj: 3 }, { t: 3, j: 3, tj: 2 }],
			[{ t: 2, j: 2, tj: 3 }],
		];
		expect(resolveRayStops(xs, 1, INF)).toEqual([3, 2, 3, 2]); // Ray0 overshoots to 3
	});
});

describe("resolveRayStops — conservative overshoot trim (pass 2, trim on)", () => {
	it("trims an overshoot whose tail carries no other ray's endpoint", () => {
		const xs: RayCrossing[][] = [
			[{ t: 1, j: 1, tj: 2 }, { t: 3, j: 2, tj: 1 }],
			[{ t: 2, j: 0, tj: 1 }],
			[{ t: 1, j: 0, tj: 3 }, { t: 3, j: 3, tj: 2 }],
			[{ t: 2, j: 2, tj: 3 }],
		];
		// Ray0 is pulled back from 3 to its real first crossing at 1 (Ray2 only passes through its tail).
		expect(resolveRayStops(xs, 1, INF, 1e-9, true)).toEqual([1, 2, 3, 2]);
	});

	it("does NOT trim when another ray ends on the tail (keeps it gap-free)", () => {
		// Here Ray2 TERMINATES on Ray0 at 0-dist 3 (its endpoint, 2-dist 3). Trimming Ray0 back to 1 would strand
		// Ray2's endpoint in open space, so the overshoot is kept — gap-freeness beats a clean vertex.
		const xs: RayCrossing[][] = [
			[{ t: 1, j: 1, tj: 2 }, { t: 3, j: 2, tj: 3 }],
			[{ t: 2, j: 0, tj: 1 }],
			[{ t: 3, j: 0, tj: 3 }],
		];
		expect(resolveRayStops(xs, 1, [Infinity, Infinity, Infinity])).toEqual([3, 2, 3]);
		expect(resolveRayStops(xs, 1, [Infinity, Infinity, Infinity], 1e-9, true)).toEqual([3, 2, 3]);
	});

	it("cap contains a ray with no covered crossing (the spherical face-exit clamp)", () => {
		// Ray0's only crossing is far (t 5); with a face cap of 2 it stops at the cap, not the runaway crossing.
		const xs: RayCrossing[][] = [[{ t: 5, j: 1, tj: 5 }], [{ t: 5, j: 0, tj: 5 }]];
		expect(resolveRayStops(xs, 1, [2, 2])).toEqual([2, 2]);
	});
});
