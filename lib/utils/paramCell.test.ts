import { describe, it, expect } from "vitest";
import { clampAlphaOnly, clampAlphaAt, resolveAlphaDegsRaw, resolveAlphaDegs, type ParametricCellData } from "@/lib/utils/paramCell";

// Minimal fixture: clampAlphaOnly only reads params[i].alphaRangeDegOpen.
const PC = (lo: number, hi: number): ParametricCellData => ({
	params: [{ name: "a", alpha0Deg: lo, deltaRangeDeg: [0, 0], alphaRangeDegOpen: [lo, hi], defaultAlphaDeg: (lo + hi) / 2 }],
	cellPolygons: [],
	basis: [[], []],
});

describe("clampAlphaOnly", () => {
	it("passes an off-grid interior value through untouched (no 0.5° snap)", () => {
		const pc = PC(30, 90);
		expect(clampAlphaOnly(pc, 0, 47.37)).toBe(47.37);
		// contrast: the slider's grid-snapped clamp DOES round to 0.5°
		expect(clampAlphaAt(pc, 0, 47.37)).toBe(47.5);
	});

	it("clamps below the min up to lo and above the max down to hi", () => {
		const pc = PC(30, 90);
		expect(clampAlphaOnly(pc, 0, 10)).toBe(30);
		expect(clampAlphaOnly(pc, 0, 200)).toBe(90);
	});
});

describe("resolveAlphaDegsRaw", () => {
	it("resolves stored values clamped but NOT snapped to the 0.5° grid", () => {
		const pc = PC(30, 90);
		expect(resolveAlphaDegsRaw(pc, [47.37])).toEqual([47.37]); // off-grid preserved
		expect(resolveAlphaDegs(pc, [47.37])).toEqual([47.5]);     // snapping variant rounds
	});
	it("clamps out-of-range and defaults missing/non-finite entries", () => {
		const pc = PC(30, 90);
		expect(resolveAlphaDegsRaw(pc, [200])).toEqual([90]);
		expect(resolveAlphaDegsRaw(pc, [10])).toEqual([30]);
		expect(resolveAlphaDegsRaw(pc, null)).toEqual([60]);  // default (lo+hi)/2
		expect(resolveAlphaDegsRaw(pc, [NaN])).toEqual([60]);
	});
});
