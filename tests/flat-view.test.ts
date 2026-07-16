import { describe, it, expect } from "vitest";
import { flatWorldToClip, computeFillRadii, wrapOffset, type FlatViewParams } from "@/lib/render/flatView";
import { worldToScreen } from "@/lib/utils/canvasPick";
import { Vector } from "@/classes/Vector";

const base = (over: Partial<FlatViewParams> = {}): FlatViewParams => ({
	offset: { x: 0, y: 0 }, zoom: 50, rot: 0, v1: [1, 0], v2: [0, 1], halfW: 300, halfH: 300, ...over,
});

describe("flatWorldToClip centred-screen == worldToScreen (transform parity)", () => {
	const params = [
		base(),
		base({ offset: { x: 37, y: -12 }, zoom: 83.5, rot: Math.PI / 5 }),
		base({ offset: { x: -100, y: 60 }, zoom: 20, rot: -1.3 }),
	];
	const pts = [{ x: 0, y: 0 }, { x: 1.5, y: -2.2 }, { x: -3.1, y: 4.7 }];
	for (const p of params) for (const q of pts) {
		it(`(${q.x},${q.y}) zoom ${p.zoom} rot ${p.rot.toFixed(2)}`, () => {
			const got = flatWorldToClip(q.x, q.y, 0, 0, p);
			const ref = worldToScreen(q.x, q.y, p.offset, p.zoom, p.rot);
			expect(got.sx).toBeCloseTo(ref.x, 9);
			expect(got.sy).toBeCloseTo(ref.y, 9);
		});
	}
});

describe("flatWorldToClip instancing == worldToScreen of the lattice shift", () => {
	it("instance (i,j) shifts by worldToScreen(i*v1 + j*v2) - worldToScreen(0)", () => {
		const p = base({ offset: { x: 10, y: -5 }, zoom: 40, rot: 0.7, v1: [1.2, 0.3], v2: [-0.4, 1.1] });
		const i = 3, j = -2;
		const inst = flatWorldToClip(0, 0, i, j, p);
		const origin = flatWorldToClip(0, 0, 0, 0, p);
		const shiftWorldX = i * p.v1[0] + j * p.v2[0];
		const shiftWorldY = i * p.v1[1] + j * p.v2[1];
		const a = worldToScreen(shiftWorldX, shiftWorldY, p.offset, p.zoom, p.rot);
		const b = worldToScreen(0, 0, p.offset, p.zoom, p.rot);
		expect(inst.sx - origin.sx).toBeCloseTo(a.x - b.x, 9);
		expect(inst.sy - origin.sy).toBeCloseTo(a.y - b.y, 9);
	});
});

describe("computeFillRadii / wrapOffset still behave (characterisation)", () => {
	it("unit square lattice covers a 600x600 viewport with a small radius", () => {
		const { Ri, Rj } = computeFillRadii(new Vector(1, 0), new Vector(0, 1), 1, 50, 600, 600, 0);
		expect(Ri).toBeGreaterThanOrEqual(1);
		expect(Ri).toBeLessThanOrEqual(144);
		expect(Rj).toBe(Ri);
	});
	it("wrap keeps the drawn offset within one screen lattice cell", () => {
		const zoom = 50;
		const { draw } = wrapOffset(new Vector(1234, -987), new Vector(1, 0), new Vector(0, 1), 1, zoom, 0);
		expect(Math.abs(draw.x)).toBeLessThanOrEqual(zoom / 2 + 1e-6);
		expect(Math.abs(draw.y)).toBeLessThanOrEqual(zoom / 2 + 1e-6);
	});
});
