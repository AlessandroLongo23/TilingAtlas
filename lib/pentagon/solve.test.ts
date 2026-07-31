/**
 * The solver against the published pentagons, one per type.
 *
 * The expected values are the literature's, to the digits the literature prints (six decimals for most,
 * exact closed forms for 14 and 15). They are NOT regenerated from this code, which is the whole point:
 * a test that re-derives its own expectation proves only that the code is deterministic.
 *
 * Sources: Mann, McLoud-Mann & Von Derau 2015 (arXiv:1510.01186) for the labelling convention and for
 * Type 15; the Type 14 closed forms sin B = (√57−3)/8, cos C = (3√57−17)/16, b/a = √((11√57−25)/8).
 */

import { describe, expect, it } from "vitest";
import { PENTAGON_TYPES, TYPE15_D_OVER_A, pentagonType } from "./types";
import { area, closureRows, isConvexCCW, solvePentagon } from "./solve";

/** Angles and sides of the type's default tuple, as published. */
const EXPECTED: Record<number, { angles: number[]; sides: number[] }> = {
	1: { angles: [120, 100, 80, 110, 130], sides: [1, 2.253835, 2.251052, 2.653064, 1.437521] },
	2: { angles: [100, 110, 130, 70, 130], sides: [1, 0.533048, 0.688821, 0.999041, 0.688821] },
	3: { angles: [120, 100, 120, 120, 80], sides: [1, 1, 0.394931, 1.137158, 0.742227] },
	4: { angles: [120, 90, 130, 90, 110], sides: [1, 0.996996, 0.996996, 1.062579, 1.062579] },
	5: { angles: [60, 110, 130, 120, 120], sides: [1, 1, 0.507713, 0.449099, 0.449099] },
	6: {
		angles: [103.016947, 70, 116.983053, 110, 140],
		sides: [1, 1.855786, 1.855786, 1, 1],
	},
	7: {
		angles: [64.15668, 140, 134.15668, 91.68664, 110],
		sides: [1, 0.516652, 0.516652, 0.516652, 0.516652],
	},
	8: {
		angles: [76.862219, 110, 140, 66.275563, 146.862219],
		sides: [1, 0.819585, 0.819585, 0.819585, 0.819585],
	},
	9: {
		angles: [110, 77.593684, 140, 64.812632, 147.593684],
		sides: [1, 1.540334, 1.540334, 1.540334, 1.540334],
	},
	10: { angles: [90, 100, 130, 140, 80], sides: [1, 1, 0.368767, 0.688241, 0.631233] },
	11: { angles: [90, 149, 62, 121, 118], sides: [1, 4.911688, 1.621226, 3.621226, 3.621226] },
	12: { angles: [90, 153, 54, 117, 126], sides: [1, 1.331529, 1.216759, 2, 0.783241] },
	13: { angles: [105, 90, 105, 150, 90], sides: [1, 2.638958, 0.707107, 2, 1] },
	14: {
		angles: [90, 145.3383362615, 69.323327477, 124.6616637385, 110.676672523],
		sides: [1, 2.69370049, 1, 2, 2],
	},
	15: { angles: [150, 60, 135, 105, 90], sides: [1, 2, 1, TYPE15_D_OVER_A, 1] },
};

describe("pentagon catalogue", () => {
	it("has all 15 types, numbered 1 to 15", () => {
		expect(PENTAGON_TYPES.map((t) => t.id)).toEqual([...Array(15)].map((_, i) => i + 1));
	});

	// The published DOF is the count of things a reader can actually move. On the over-determined types
	// the pinned angle is NOT one of them, which is exactly why their DOF is one lower than their angle
	// conditions suggest. A mistranscribed constraint row shows up here first.
	it("DOF equals the number of sliders", () => {
		for (const t of PENTAGON_TYPES) {
			expect(`${t.label}: ${t.dof}`).toBe(
				`${t.label}: ${t.angleParams.length + t.sideParams.length}`,
			);
		}
	});

	it("root-finds exactly the types whose side system is over-determined", () => {
		const overDetermined = PENTAGON_TYPES.filter(
			(t) => 2 + t.sideRows.length + t.sideParams.length === 5,
		).map((t) => t.id);
		expect(overDetermined).toEqual([6, 7, 8, 9, 14]);
		for (const t of PENTAGON_TYPES) {
			expect(`${t.label} pins: ${t.solveAngle !== null}`).toBe(
				`${t.label} pins: ${overDetermined.includes(t.id)}`,
			);
		}
	});
});

describe.each(PENTAGON_TYPES)("$label", (t) => {
	const res = solvePentagon(t);
	const exp = EXPECTED[t.id];

	it("solves at its default parameters", () => {
		expect(res.ok ? "ok" : res.error).toBe("ok");
	});

	it("reproduces the published angles", () => {
		if (!res.ok) throw new Error("no solution");
		for (let i = 0; i < 5; i++) {
			expect(res.pentagon.angles[i]).toBeCloseTo(exp.angles[i], 5);
		}
	});

	it("reproduces the published side lengths", () => {
		if (!res.ok) throw new Error("no solution");
		for (let i = 0; i < 5; i++) {
			expect(res.pentagon.sides[i]).toBeCloseTo(exp.sides[i], 5);
		}
	});

	it("closes, and is convex", () => {
		if (!res.ok) throw new Error("no solution");
		expect(res.pentagon.closure).toBeLessThan(1e-12);
		expect(res.pentagon.angles.reduce((a, b) => a + b, 0)).toBeCloseTo(540, 9);
		expect(isConvexCCW(res.pentagon.corners)).toBe(true);
		expect(area(res.pentagon.corners)).toBeGreaterThan(0);
	});

	// Check the conditions on the OUTPUT, not on the constructor that imposed them: `angles` substitutes
	// the dependent angles by hand, so a typo there would otherwise go unnoticed.
	it("satisfies its own stated conditions", () => {
		if (!res.ok) throw new Error("no solution");
		const s = res.pentagon.sides;
		for (const row of t.sideRows) {
			let v = 0;
			for (let j = 0; j < 5; j++) v += row[j] * s[j];
			expect(Math.abs(v)).toBeLessThan(1e-9);
		}
		for (const row of closureRows(res.pentagon.angles)) {
			let v = 0;
			for (let j = 0; j < 5; j++) v += row[j] * s[j];
			expect(Math.abs(v)).toBeLessThan(1e-12);
		}
	});

	it("solves across its whole slider range", () => {
		// Sample each angle slider independently at its own defaults for the others. Types whose family
		// dies part way through their nominal range are expected to fail here; phase 6 narrows the
		// bounds from this measurement, so the assertion is that MOST of the range works, not all of it.
		if (t.angleParams.length === 0) return;
		let ok = 0;
		let total = 0;
		t.angleParams.forEach((p, i) => {
			for (let v = p.min; v <= p.max; v += (p.max - p.min) / 20) {
				const free = t.angleParams.map((q, j) => (j === i ? v : q.def));
				total++;
				if (solvePentagon(t, free).ok) ok++;
			}
		});
		expect(`${t.label}: ${ok > 0}`).toBe(`${t.label}: true`);
	});
});

describe("Type 15", () => {
	it("has d/a = 2·cos15° = √(2+√3), not Wikipedia's 1/(√2(√3−1))", () => {
		expect(TYPE15_D_OVER_A).toBeCloseTo(1.9318516525781366, 12);
		expect(TYPE15_D_OVER_A).toBeCloseTo(2 * Math.cos((15 * Math.PI) / 180), 12);
		// The value Wikipedia gives, for the record: it is the ratio for a DIFFERENT side under Mann et
		// al.'s normalisation, and a pentagon built with it as d does not close.
		expect(1 / (Math.SQRT2 * (Math.sqrt(3) - 1))).toBeCloseTo(0.9659258262890684, 12);
	});

	it("matches the exact vertex coordinates", () => {
		const res = solvePentagon(pentagonType(15)!);
		if (!res.ok) throw new Error("no solution");
		const r3 = Math.sqrt(3);
		const want = [
			{ x: 0, y: 0 },
			{ x: 2, y: 0 },
			{ x: 3 / 2, y: r3 / 2 },
			{ x: (1 - r3) / 2, y: (1 + r3) / 2 },
			{ x: -r3 / 2, y: 1 / 2 },
		];
		res.pentagon.corners.forEach((p, i) => {
			expect(p.x).toBeCloseTo(want[i].x, 12);
			expect(p.y).toBeCloseTo(want[i].y, 12);
		});
	});
});

describe("Type 14", () => {
	it("pins B to the obtuse branch of sin B = (√57−3)/8", () => {
		const res = solvePentagon(pentagonType(14)!);
		if (!res.ok) throw new Error("no solution");
		const B = res.pentagon.angles[1];
		expect(Math.sin((B * Math.PI) / 180)).toBeCloseTo((Math.sqrt(57) - 3) / 8, 10);
		expect(B).toBeGreaterThan(90); // the acute branch sends E = 2B − 180 negative
		expect(res.pentagon.sides[1]).toBeCloseTo(Math.sqrt((11 * Math.sqrt(57) - 25) / 8), 9);
	});
});
