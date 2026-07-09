import { describe, it, expect } from "vitest";
import { serializeCell } from "@/classes/algorithm/cellCodec";
import type { PeriodCell } from "@/classes/algorithm/PeriodSolver";

// Regression guard for the silent-star-loss bug: the {n,anchor,dir} codec has no slot for star geometry
// (reflex dents / extra boundary vertices), so serializeCell must REFUSE a star tile rather than encode it
// as a regular n-gon. Before this guard, Myers star cells serialized to a regularized square/triangle and
// the Play symmetry overlay classified the wrong tiling. The isStar check runs first, so a minimal star
// stub (no exactVertices needed) suffices to prove the throw.
describe("serializeCell rejects star polygons (regular-only codec)", () => {
	it("throws on a cell containing an isStar polygon", () => {
		const starCell = {
			cellPolygons: [{ n: 3, isStar: true }],
			basisExact: [null, null],
		} as unknown as PeriodCell;
		expect(() => serializeCell(starCell)).toThrow(/star/i);
	});
});
