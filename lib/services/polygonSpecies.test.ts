import { describe, expect, it } from "vitest";
import { polygonPeriodOf, tilePeriodsOf } from "@/lib/services/polygonSpecies";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";

/** Unit-edge equilateral polygon from an interior-angle word in degrees, walked like the developer. */
function fromAngles(deg: number[]): number[][] {
	const pts: number[][] = [];
	let x = 0, y = 0, dir = 0;
	for (const a of deg) {
		pts.push([x, y]);
		x += Math.cos((dir * Math.PI) / 180);
		y += Math.sin((dir * Math.PI) / 180);
		dir += 180 - a;
	}
	// the word must close, otherwise the fixture is wrong and the period test is meaningless
	expect(Math.hypot(x, y)).toBeLessThan(1e-9);
	return pts;
}

describe("polygonPeriodOf", () => {
	it("is 1 for regular polygons", () => {
		expect(polygonPeriodOf(fromAngles([60, 60, 60]))).toBe(1);
		expect(polygonPeriodOf(fromAngles([90, 90, 90, 90]))).toBe(1);
		expect(polygonPeriodOf(fromAngles([120, 120, 120, 120, 120, 120]))).toBe(1);
	});

	it("is 2 for alternating tiles the side count alone cannot separate from a regular one", () => {
		// cx4-2.4.2.4: four unit edges like a square, but 60/120/60/120 — n=4 for both, p tells them apart
		expect(polygonPeriodOf(fromAngles([60, 120, 60, 120]))).toBe(2);
		expect(polygonPeriodOf(fromAngles([90, 90, 90, 90]))).toBe(1);
	});

	it("is 2 for an isotoxal star, whose reflex dent reads back non-reflex but consistently", () => {
		// 3*3 — the 45/195 six-gon; interiorAngleDeg reports 195° as 165°, still period 2
		expect(polygonPeriodOf(fromAngles([45, 195, 45, 195, 45, 195]))).toBe(2);
	});

	it("is 3 for the period-3 equilateral tiles", () => {
		expect(polygonPeriodOf(fromAngles([135, 120, 105, 135, 120, 105]))).toBe(3);
		expect(polygonPeriodOf(fromAngles([165, 165, 30, 165, 165, 30]))).toBe(3);
		// the 9-gon: three periods of (150,135,135)
		expect(polygonPeriodOf(fromAngles([150, 135, 135, 150, 135, 135, 150, 135, 135]))).toBe(3);
	});

	it("does not mistake a rotation of the word for a shorter period", () => {
		// 105/135/120 is the SAME tile as 135/120/105 read from another corner; still 3, never 1
		expect(polygonPeriodOf(fromAngles([105, 135, 120, 105, 135, 120]))).toBe(3);
	});
});

describe("tilePeriodsOf", () => {
	const mk = (polys: number[][][]): ReferenceTiling =>
		({
			id: `t-${Math.random()}`,
			renderCell: { cellPolygons: polys.map((vertices) => ({ n: vertices.length, vertices })), basis: [] },
		}) as unknown as ReferenceTiling;

	it("reports every distinct period a tiling uses, ascending", () => {
		const t = mk([fromAngles([60, 60, 60]), fromAngles([135, 120, 105, 135, 120, 105])]);
		expect(tilePeriodsOf(t)).toEqual([1, 3]);
	});

	it("is [1] for a purely regular tiling", () => {
		expect(tilePeriodsOf(mk([fromAngles([90, 90, 90, 90])]))).toEqual([1]);
	});
});
