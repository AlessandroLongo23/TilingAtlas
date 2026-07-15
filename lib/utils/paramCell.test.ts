import { describe, it, expect } from "vitest";
import { clampAlphaOnly, clampAlphaAt, type ParametricCellData } from "@/lib/utils/paramCell";

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
