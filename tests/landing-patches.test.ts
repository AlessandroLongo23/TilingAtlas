import { describe, expect, it } from "vitest";
import { fitViewBox, hatOutline, penroseSun, polygonArea } from "@/lib/render/landingPatches";

describe("hatOutline", () => {
	it("is the 13-vertex aperiodic monotile", () => {
		expect(hatOutline()).toHaveLength(13);
	});

	it("has the area of eight kites (8·√3 in hex units)", () => {
		expect(polygonArea(hatOutline())).toBeCloseTo(8 * Math.sqrt(3), 10);
	});
});

describe("penroseSun", () => {
	const sun = penroseSun();

	it("is five rhombs of four vertices each", () => {
		expect(sun).toHaveLength(5);
		for (const r of sun) expect(r).toHaveLength(4);
	});

	it("uses unit-side thick rhombs (area sin 72°)", () => {
		for (const r of sun) {
			for (let i = 0; i < 4; i++) {
				const [x0, y0] = r[i];
				const [x1, y1] = r[(i + 1) % 4];
				expect(Math.hypot(x1 - x0, y1 - y0)).toBeCloseTo(1, 10);
			}
			expect(polygonArea(r)).toBeCloseTo(Math.sin((72 * Math.PI) / 180), 10);
		}
	});

	it("closes around the shared vertex: rhomb r's far arm is rhomb r+1's near arm", () => {
		for (let r = 0; r < 5; r++) {
			const a = sun[r][3]; // arm at base + 36°
			const b = sun[(r + 1) % 5][1]; // next rhomb's arm at base − 36°
			expect(a[0]).toBeCloseTo(b[0], 10);
			expect(a[1]).toBeCloseTo(b[1], 10);
		}
	});
});

describe("fitViewBox", () => {
	it("fits the polygons with margin", () => {
		const vb = fitViewBox([[[0, 0], [2, 0], [2, 1], [0, 1]]], 0.1).split(" ").map(Number);
		expect(vb[0]).toBeCloseTo(-0.2);
		expect(vb[1]).toBeCloseTo(-0.1);
		expect(vb[2]).toBeCloseTo(2.4);
		expect(vb[3]).toBeCloseTo(1.2);
	});
});
