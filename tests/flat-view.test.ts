import { describe, it, expect } from "vitest";
import {
	flatWorldToClip,
	computeFillRadii,
	latticeExtentFromBounds,
	screenLatticeVectors,
	wrapOffset,
	type FlatViewParams,
	type LatticeExtent,
} from "@/lib/render/flatView";
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

const UNIT_EXTENT: LatticeExtent = { aMin: -0.5, aMax: 0.5, bMin: -0.5, bMax: 0.5 };

describe("computeFillRadii / wrapOffset still behave (characterisation)", () => {
	it("unit square lattice covers a 600x600 viewport with a small radius", () => {
		const { Ri, Rj } = computeFillRadii(new Vector(1, 0), new Vector(0, 1), 1, 50, 600, 600, 0, UNIT_EXTENT);
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

describe("latticeExtentFromBounds", () => {
	it("identity basis: extent = the world bounds", () => {
		const e = latticeExtentFromBounds(0, 2, 0, 3, { x: 1, y: 0 }, { x: 0, y: 1 }, 1);
		expect(e).toEqual({ aMin: 0, aMax: 2, bMin: 0, bMax: 3 });
	});
	it("sheared basis v2=(1,1): a = x - y, b = y", () => {
		const e = latticeExtentFromBounds(-0.5, 0.5, -0.5, 0.5, { x: 1, y: 0 }, { x: 1, y: 1 }, 1);
		expect(e.aMin).toBeCloseTo(-1, 12);
		expect(e.aMax).toBeCloseTo(1, 12);
		expect(e.bMin).toBeCloseTo(-0.5, 12);
		expect(e.bMax).toBeCloseTo(0.5, 12);
	});
	it("degenerate det: zero extent", () => {
		const e = latticeExtentFromBounds(0, 5, 0, 5, { x: 1, y: 0 }, { x: 2, y: 0 }, 0);
		expect(e).toEqual({ aMin: 0, aMax: 0, bMin: 0, bMax: 0 });
	});
});

// The coverage guarantee — the test that would have caught the black corner wedges. A viewport point at
// lattice coord (a, b) is drawn by the unique instance (i, j) with (a - i, b - j) inside the content
// extent; that i lies somewhere in [a - aMax, a - aMin] (same for j), so the grid must contain EVERY
// integer in that interval, for every screen corner, under the worst wrapOffset residual (±0.5/axis).
function assertViewportCovered(
	v1: Vector, v2: Vector, zoom: number, w: number, h: number, rot: number,
	extent: LatticeExtent, Ri: number, Rj: number,
): { ok: boolean; worst: string } {
	const det = v1.x * v2.y - v2.x * v1.y;
	const { e1, e2 } = screenLatticeVectors(v1, v2, zoom, rot);
	const detM = e1.x * e2.y - e2.x * e1.y;
	expect(Math.abs(detM)).toBeGreaterThan(1e-9);
	for (const cx of [-w / 2, w / 2]) for (const cy of [-h / 2, h / 2]) {
		const a = (cx * e2.y - cy * e2.x) / detM;
		const b = (-cx * e1.y + cy * e1.x) / detM;
		for (const wa of [-0.5, 0.5]) for (const wb of [-0.5, 0.5]) {
			const aP = a + wa, bP = b + wb;
			const iLo = Math.ceil(aP - extent.aMax), iHi = Math.floor(aP - extent.aMin);
			const jLo = Math.ceil(bP - extent.bMax), jHi = Math.floor(bP - extent.bMin);
			if (iLo < -Ri || iHi > Ri || jLo < -Rj || jHi > Rj) {
				return { ok: false, worst: `corner (${cx},${cy}) wrap (${wa},${wb}): i [${iLo},${iHi}] j [${jLo},${jHi}] vs grid ±${Ri}/±${Rj} (det ${det})` };
			}
		}
	}
	return { ok: true, worst: "" };
}

describe("computeFillRadii coverage guarantee", () => {
	const cases: Array<{
		name: string; v1: Vector; v2: Vector; extent: LatticeExtent;
		zoom: number; w: number; h: number; rot: number;
	}> = [
		{
			name: "anchored unit cell, no rotation",
			v1: new Vector(1, 0), v2: new Vector(0, 1),
			extent: { aMin: 0, aMax: 1, bMin: 0, bMax: 1 },
			zoom: 50, w: 600, h: 600, rot: 0,
		},
		{
			name: "centred unit cell, rotated",
			v1: new Vector(1, 0), v2: new Vector(0, 1),
			extent: UNIT_EXTENT,
			zoom: 35, w: 1440, h: 900, rot: 0.8,
		},
		{
			name: "displaced sheared elongated cell (the corner-wedge bug)",
			v1: new Vector(1, 0), v2: new Vector(0.9, 2.6),
			extent: { aMin: 1.2, aMax: 3.4, bMin: -0.3, bMax: 1.1 },
			zoom: 37, w: 1500, h: 1100, rot: 0.35,
		},
		{
			name: "content whole periods negative of the anchor",
			v1: new Vector(1.1, 0.2), v2: new Vector(-0.3, 1.4),
			extent: { aMin: -4.2, aMax: -2.9, bMin: -1.6, bMax: 0.4 },
			zoom: 55, w: 900, h: 700, rot: -0.5,
		},
	];
	for (const c of cases) {
		it(c.name, () => {
			const det = c.v1.x * c.v2.y - c.v2.x * c.v1.y;
			const { Ri, Rj } = computeFillRadii(c.v1, c.v2, det, c.zoom, c.w, c.h, c.rot, c.extent);
			const res = assertViewportCovered(c.v1, c.v2, c.zoom, c.w, c.h, c.rot, c.extent, Ri, Rj);
			expect(res.ok, res.worst).toBe(true);
		});
	}

	it("the pre-extent formula (ceil(maxA)+1) fails the displaced-cell case — the bug this fix removes", () => {
		const c = cases[2];
		const det = c.v1.x * c.v2.y - c.v2.x * c.v1.y;
		const { e1, e2 } = screenLatticeVectors(c.v1, c.v2, c.zoom, c.rot);
		const detM = e1.x * e2.y - e2.x * e1.y;
		let maxA = 0, maxB = 0;
		for (const cx of [-c.w / 2, c.w / 2]) for (const cy of [-c.h / 2, c.h / 2]) {
			maxA = Math.max(maxA, Math.abs((cx * e2.y - cy * e2.x) / detM));
			maxB = Math.max(maxB, Math.abs((-cx * e1.y + cy * e1.x) / detM));
		}
		const oldClamp = (n: number) => Math.max(1, Math.min(144, Math.ceil(n) + 1));
		const res = assertViewportCovered(
			c.v1, c.v2, c.zoom, c.w, c.h, c.rot, c.extent, oldClamp(maxA), oldClamp(maxB),
		);
		expect(res.ok).toBe(false);
	});
});
