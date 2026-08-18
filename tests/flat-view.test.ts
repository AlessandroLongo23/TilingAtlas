import { describe, it, expect } from "vitest";
import {
	applyMat2,
	deformBasis,
	flatWorldToClip,
	computeFillGrid,
	computeFillRadii,
	fillGridInstances,
	invertMat2,
	latticeExtentFromBounds,
	mat2Det,
	screenLatticeVectors,
	wrapOffset,
	type FlatViewParams,
	type LatticeExtent,
	type Mat2,
} from "@/lib/render/flatView";
import { screenToWorld, worldToScreen } from "@/lib/utils/canvasPick";
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
	extent: LatticeExtent, Ri: number, Rj: number, deform?: Mat2,
): { ok: boolean; worst: string } {
	const det = v1.x * v2.y - v2.x * v1.y;
	const { e1, e2 } = screenLatticeVectors(v1, v2, zoom, rot, deform);
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

// ── The view deformation D ────────────────────────────────────────────────────────────────────────
// D is a 2x2 applied to world coordinates before the camera. Every claim the renderers rely on is here:
// the shader reference agrees with the pick math, replication still commutes, the instance grid still
// covers the viewport in the deformed metric, and the pan wrap still reports an UNDEFORMED world shift.

const SHEAR: Mat2 = [1, 0, 0.6, 1];
const SQUASH: Mat2 = [1.4, 0.25, -0.35, 0.45];
const FLIP: Mat2 = [-1, 0, 0, 1]; // a reflection is a legal deformation; det < 0 must not break anything

describe("flatWorldToClip under a deform == worldToScreen under the same deform", () => {
	const params = [
		base({ deform: SHEAR }),
		base({ offset: { x: 37, y: -12 }, zoom: 83.5, rot: Math.PI / 5, deform: SQUASH }),
		base({ offset: { x: -100, y: 60 }, zoom: 20, rot: -1.3, deform: FLIP }),
	];
	const pts = [{ x: 0, y: 0 }, { x: 1.5, y: -2.2 }, { x: -3.1, y: 4.7 }];
	for (const p of params) for (const q of pts) {
		it(`(${q.x},${q.y}) deform [${p.deform}]`, () => {
			const got = flatWorldToClip(q.x, q.y, 0, 0, p);
			const ref = worldToScreen(q.x, q.y, p.offset, p.zoom, p.rot, p.deform);
			expect(got.sx).toBeCloseTo(ref.x, 9);
			expect(got.sy).toBeCloseTo(ref.y, 9);
		});
	}

	it("screenToWorld undoes it", () => {
		const p = base({ offset: { x: 21, y: 9 }, zoom: 64, rot: 0.9, deform: SQUASH });
		const w = { x: -1.7, y: 2.4 };
		const s = worldToScreen(w.x, w.y, p.offset, p.zoom, p.rot, p.deform);
		const back = screenToWorld(s.x, s.y, p.offset, p.zoom, p.rot, p.deform);
		expect(back.x).toBeCloseTo(w.x, 9);
		expect(back.y).toBeCloseTo(w.y, 9);
	});
});

// The identity that lets the shader apply D once to `world` while the CPU only deforms the basis:
// D(w + i*v1 + j*v2) = D*w + i*(D*v1) + j*(D*v2). If this ever stopped holding, the instance grid and the
// drawn cell would drift apart and every copy past the origin would land in the wrong place.
describe("D commutes with lattice replication", () => {
	it("deforming the replicated point == replicating along the deformed basis", () => {
		const p = base({ offset: { x: 10, y: -5 }, zoom: 40, rot: 0.7, v1: [1.2, 0.3], v2: [-0.4, 1.1], deform: SQUASH });
		const i = 3, j = -2;
		const got = flatWorldToClip(0.4, -0.9, i, j, p);
		const d = deformBasis(new Vector(p.v1[0], p.v1[1]), new Vector(p.v2[0], p.v2[1]), SQUASH);
		const dw = applyMat2(SQUASH, 0.4, -0.9);
		const ref = worldToScreen(dw.x + i * d.v1.x + j * d.v2.x, dw.y + i * d.v1.y + j * d.v2.y, p.offset, p.zoom, p.rot);
		expect(got.sx).toBeCloseTo(ref.x, 9);
		expect(got.sy).toBeCloseTo(ref.y, 9);
	});
});

// The grid's coverage contract, checked the way the picture experiences it: take every viewport corner,
// push it by the worst wrapOffset residual, and demand that EVERY copy that could draw that point is in
// the grid. A missing (i, j) is a wedge of unpainted background on screen.
function assertGridCovers(
	v1: Vector, v2: Vector, zoom: number, w: number, h: number, rot: number,
	extent: LatticeExtent, g: ReturnType<typeof computeFillGrid>, deform?: Mat2,
): { ok: boolean; worst: string } {
	const { e1, e2 } = screenLatticeVectors(v1, v2, zoom, rot, deform);
	const detM = e1.x * e2.y - e2.x * e1.y;
	const has = (i: number, j: number) =>
		i >= g.iLo && i <= g.iHi && j >= g.jLo[i - g.iLo] && j <= g.jHi[i - g.iLo];
	for (const cx of [-w / 2, 0, w / 2]) for (const cy of [-h / 2, 0, h / 2]) {
		const a0 = (cx * e2.y - cy * e2.x) / detM;
		const b0 = (-cx * e1.y + cy * e1.x) / detM;
		for (const wa of [-0.5, 0, 0.5]) for (const wb of [-0.5, 0, 0.5]) {
			const a = a0 + wa, b = b0 + wb;
			for (let i = Math.ceil(a - extent.aMax); i <= Math.floor(a - extent.aMin); i++) {
				for (let j = Math.ceil(b - extent.bMax); j <= Math.floor(b - extent.bMin); j++) {
					if (!has(i, j)) return { ok: false, worst: `point (${cx},${cy}) wrap (${wa},${wb}) needs copy (${i},${j})` };
				}
			}
		}
	}
	return { ok: true, worst: "" };
}

describe("computeFillGrid coverage guarantee", () => {
	const v1 = new Vector(1.1, 0.2), v2 = new Vector(-0.3, 1.4);
	const det = v1.x * v2.y - v2.x * v1.y;
	const extent: LatticeExtent = { aMin: -1.2, aMax: 2.3, bMin: -0.4, bMax: 1.6 };
	const cases: Array<{ name: string; deform?: Mat2 }> = [
		{ name: "no deform" },
		{ name: "shear", deform: SHEAR },
		{ name: "anisotropic squash", deform: SQUASH },
		{ name: "reflection", deform: FLIP },
		{ name: "at the determinant floor", deform: [1, 0, 0.97, 0.25] },
		{ name: "strong shear, area preserved", deform: [1, 0, 2, 1] },
	];
	for (const c of cases) {
		it(c.name, () => {
			const g = computeFillGrid(v1, v2, det, 45, 1440, 900, 0.4, extent, c.deform);
			expect(g.clipped).toBe(false);
			const res = assertGridCovers(v1, v2, 45, 1440, 900, 0.4, extent, g, c.deform);
			expect(res.ok, res.worst).toBe(true);
		});
	}

	it("covers at the zoom floor on a 4K viewport, where the old per-axis cap ran out", () => {
		const g = computeFillGrid(v1, v2, det, 20, 3840, 2160, 0.4, extent, [1, 0, 0.97, 0.25]);
		expect(g.clipped).toBe(false);
		const res = assertGridCovers(v1, v2, 20, 3840, 2160, 0.4, extent, g, [1, 0, 0.97, 0.25]);
		expect(res.ok, res.worst).toBe(true);
	});

	// The whole reason the rectangle had to go: an area-preserving deform must be FREE, or a shear
	// slider is a performance cliff. The rectangle charged 4x for the same picture.
	it("an area-preserving deform costs what the identity costs", () => {
		const flat = computeFillGrid(v1, v2, det, 45, 1440, 900, 0.4, extent).count;
		for (const d of [SHEAR, FLIP, [1, 0, 2, 1] as Mat2, [0.6, 0.8, -0.8, 0.6] as Mat2]) {
			const n = computeFillGrid(v1, v2, det, 45, 1440, 900, 0.4, extent, d).count;
			expect(Math.abs(n - flat) / flat, `deform [${d}] cost ${n} vs ${flat}`).toBeLessThan(0.35);
		}
	});

	it("shrinking costs 1/|det|, which is what the pad's floor budgets", () => {
		const flat = computeFillGrid(v1, v2, det, 45, 1440, 900, 0, extent).count;
		const half = computeFillGrid(v1, v2, det, 45, 1440, 900, 0, extent, [1, 0, 0, 0.5]).count;
		expect(half / flat).toBeGreaterThan(1.6);
		expect(half / flat).toBeLessThan(2.6);
	});

	it("beats the rectangle it replaced on a sheared lattice", () => {
		const d: Mat2 = [1, 0, 2, 1];
		const { Ri, Rj } = computeFillRadii(v1, v2, det, 20, 3840, 2160, 0.4, extent, d);
		const g = computeFillGrid(v1, v2, det, 20, 3840, 2160, 0.4, extent, d);
		expect(g.count).toBeLessThan((2 * Ri + 1) * (2 * Rj + 1) / 2);
	});

	it("a deform that squashes the lattice to nothing falls back instead of exploding", () => {
		const g = computeFillGrid(v1, v2, det, 45, 1440, 900, 0, extent, [1, 0, 2, 0]);
		expect(g.count).toBe(169); // the 13x13 fallback
	});

	it("instances come out as (i, j) pairs matching the spans", () => {
		const g = computeFillGrid(v1, v2, det, 60, 400, 300, 0, extent, SHEAR);
		const inst = fillGridInstances(g);
		expect(inst.length).toBe(g.count * 2);
		for (let n = 0; n < inst.length; n += 2) {
			const i = inst[n], j = inst[n + 1];
			expect(i).toBeGreaterThanOrEqual(g.iLo);
			expect(i).toBeLessThanOrEqual(g.iHi);
			expect(j).toBeGreaterThanOrEqual(g.jLo[i - g.iLo]);
			expect(j).toBeLessThanOrEqual(g.jHi[i - g.iLo]);
		}
	});
});

describe("wrapOffset under a deform", () => {
	const v1 = new Vector(1, 0), v2 = new Vector(0, 1);

	it("reduces against the DEFORMED screen lattice", () => {
		const zoom = 50;
		const { draw } = wrapOffset(new Vector(1234, -987), v1, v2, 1, zoom, 0, SHEAR);
		// The residual has to sit inside the deformed cell, so reducing it again is a no-op.
		const again = wrapOffset(draw, v1, v2, 1, zoom, 0, SHEAR);
		expect(again.draw.x).toBeCloseTo(draw.x, 6);
		expect(again.draw.y).toBeCloseTo(draw.y, 6);
		expect(again.worldShiftX).toBeCloseTo(0, 9);
		expect(again.worldShiftY).toBeCloseTo(0, 9);
	});

	// The one consumer of worldShift is the Islamic noise, sampled BEFORE D. Reporting a deformed shift
	// would make the noise snap at every cell boundary — the bug the undeformed return value prevents.
	it("reports the world shift in UNDEFORMED coordinates", () => {
		const r = wrapOffset(new Vector(613, -228), new Vector(1.3, 0.4), new Vector(-0.2, 1.1), 1.51, 50, 0.3, SQUASH);
		const a = Math.round(
			(r.worldShiftX * 1.1 - r.worldShiftY * -0.2) / 1.51,
		);
		const b = Math.round((-r.worldShiftX * 0.4 + r.worldShiftY * 1.3) / 1.51);
		// It is an integer combination of the ORIGINAL basis, exactly.
		expect(r.worldShiftX).toBeCloseTo(a * 1.3 + b * -0.2, 9);
		expect(r.worldShiftY).toBeCloseTo(a * 0.4 + b * 1.1, 9);
	});

	it("a degenerate deform leaves the offset alone rather than dividing by zero", () => {
		const r = wrapOffset(new Vector(500, 300), v1, v2, 1, 50, 0, [1, 0, 2, 0]);
		expect(r.draw.x).toBe(500);
		expect(r.draw.y).toBe(300);
	});
});

describe("Mat2 helpers", () => {
	it("det and inverse agree", () => {
		expect(mat2Det(SQUASH)).toBeCloseTo(1.4 * 0.45 - -0.35 * 0.25, 12);
		const inv = invertMat2(SQUASH)!;
		const p = applyMat2(inv, ...Object.values(applyMat2(SQUASH, 2.1, -0.8)) as [number, number]);
		expect(p.x).toBeCloseTo(2.1, 9);
		expect(p.y).toBeCloseTo(-0.8, 9);
	});
	it("a singular matrix has no inverse", () => {
		expect(invertMat2([1, 0, 2, 0])).toBeNull();
	});
});
