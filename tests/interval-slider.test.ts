import { describe, it, expect } from "vitest";
import { chooseBound, applyBound, quantize } from "@/components/ui/interval-slider";
import { hyperbolicFacetsOf, matchesReferenceFilters, type ReferenceTiling } from "@/lib/services/referenceAtlas";

// The IntervalSlider's pointer contract, isolated as pure functions. The tricky case (AL's spec,
// 2026-07-23): with both bounds on the SAME value, a press left of them moves lo, right of them
// moves hi, and a press exactly on them is ambiguous — nothing moves until the drag direction
// resolves it. The component turns "pending" into lo/hi from the drag's sign; a plain click stays
// pending forever, i.e. does nothing.

describe("chooseBound", () => {
	it("coincident bounds: left → lo, right → hi, dead-on → pending", () => {
		expect(chooseBound(3, 5, 5)).toBe("lo");
		expect(chooseBound(7, 5, 5)).toBe("hi");
		expect(chooseBound(5, 5, 5)).toBe("pending");
	});

	it("distinct bounds: nearest wins, grabbing a handle picks it", () => {
		expect(chooseBound(3, 4, 8)).toBe("lo"); // beyond lo
		expect(chooseBound(9, 4, 8)).toBe("hi"); // beyond hi
		expect(chooseBound(5, 4, 8)).toBe("lo"); // between, nearer lo
		expect(chooseBound(7, 4, 8)).toBe("hi"); // between, nearer hi
		expect(chooseBound(4, 4, 8)).toBe("lo"); // exactly on a handle
		expect(chooseBound(8, 4, 8)).toBe("hi");
	});

	it("the exact midpoint between distinct bounds is ambiguous too", () => {
		expect(chooseBound(6, 4, 8)).toBe("pending");
	});
});

describe("applyBound", () => {
	it("moves the chosen bound and never inverts the interval", () => {
		expect(applyBound("lo", 3, [4, 8])).toEqual([3, 8]);
		expect(applyBound("hi", 9, [4, 8])).toEqual([4, 9]);
		// dragging one bound through the other clamps them coincident instead of crossing
		expect(applyBound("lo", 9, [4, 8])).toEqual([8, 8]);
		expect(applyBound("hi", 3, [4, 8])).toEqual([4, 4]);
	});
});

describe("quantize", () => {
	it("snaps a track fraction to the step grid, clamped", () => {
		expect(quantize(0, 3, 8, 1)).toBe(3);
		expect(quantize(1, 3, 8, 1)).toBe(8);
		expect(quantize(0.49, 3, 8, 1)).toBe(5); // 3 + 0.49*5 = 5.45 → 5
		expect(quantize(-0.2, 3, 8, 1)).toBe(3);
		expect(quantize(1.7, 3, 8, 1)).toBe(8);
	});

	it("0.01 steps come out clean, no float dust", () => {
		const v = quantize(1 / 3, 0.11, 1.37, 0.01);
		expect(v).toBe(0.53); // 0.11 + (1/3)*1.26 = 0.53, exactly on the grid
		expect(String(v).length).toBeLessThanOrEqual(4);
	});
});

// The scalars the sliders filter on, parsed from the family label. Valence and palette are maxima
// over the vertex figures — the (k,p,v) sweep's own axes.
const hyp = (id: string, family: string, edge?: number): ReferenceTiling =>
	({ id, source: "hyperbolic", k: family.includes("+") ? 2 : 1, family, edge, discoverer: "x", renderCell: {} }) as unknown as ReferenceTiling;

describe("hyperbolicFacetsOf", () => {
	it("k=1: valence = figure length, polygon = largest entry", () => {
		expect(hyperbolicFacetsOf(hyp("a", "3.3.3.3.3.3.3"))).toEqual({ valence: 7, polygon: 3 });
		expect(hyperbolicFacetsOf(hyp("b", "6.6.7"))).toEqual({ valence: 3, polygon: 7 });
	});

	it("k=2: maxima across both figures", () => {
		expect(hyperbolicFacetsOf(hyp("c", "3.4.4.8 + 3.4.8.4"))).toEqual({ valence: 4, polygon: 8 });
		expect(hyperbolicFacetsOf(hyp("d", "3.3.4.3.4 + 3.4.4.4"))).toEqual({ valence: 5, polygon: 4 });
	});

	it("non-hyperbolic sources are null (they never match an active interval facet)", () => {
		const eu = { id: "e", source: "galebach", family: "3.3.3.3.3.3" } as unknown as ReferenceTiling;
		expect(hyperbolicFacetsOf(eu)).toBeNull();
	});
});

describe("matchesReferenceFilters hyperbolic intervals", () => {
	const t = hyp("f", "3.4.4.8 + 3.4.8.4", 0.62); // valence 4, polygon 8

	it("inclusive bounds", () => {
		expect(matchesReferenceFilters(t, { hypValence: [4, 4] })).toBe(true);
		expect(matchesReferenceFilters(t, { hypValence: [5, 8] })).toBe(false);
		expect(matchesReferenceFilters(t, { hypPolygon: [3, 8] })).toBe(true);
		expect(matchesReferenceFilters(t, { hypPolygon: [3, 7] })).toBe(false);
		expect(matchesReferenceFilters(t, { hypEdge: [0.62, 0.62] })).toBe(true);
		expect(matchesReferenceFilters(t, { hypEdge: [0.63, 1.0] })).toBe(false);
	});

	it("an active interval facet excludes non-hyperbolic entries", () => {
		const eu = { id: "g", source: "galebach", k: 1, family: "3.3.3.3.3.3", discoverer: "x" } as unknown as ReferenceTiling;
		expect(matchesReferenceFilters(eu, { hypValence: [3, 9] })).toBe(false);
		expect(matchesReferenceFilters(eu, { hypEdge: [0, 9] })).toBe(false);
		expect(matchesReferenceFilters(eu, {})).toBe(true);
	});
});
