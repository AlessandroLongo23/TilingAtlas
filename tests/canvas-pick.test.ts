import { describe, it, expect } from "vitest";
import {
	screenToWorld,
	worldToScreen,
	rayCastContains,
	pickSnapTarget,
	lensInverse,
	inversiveScreenToWorld,
	reduceToOriginCell,
	type LensParams,
	type PickNode,
} from "@/lib/utils/canvasPick";

const ORIGIN = { x: 0, y: 0 };

// A unit square centred at (cx, cy), CCW, with its centroid.
function square(cx: number, cy: number, half = 0.5): PickNode {
	return {
		centroid: { x: cx, y: cy },
		vertices: [
			{ x: cx - half, y: cy - half },
			{ x: cx + half, y: cy - half },
			{ x: cx + half, y: cy + half },
			{ x: cx - half, y: cy + half },
		],
	};
}

describe("screen<->world round-trip", () => {
	const cases = [
		{ offset: ORIGIN, zoom: 50, rot: 0 },
		{ offset: { x: 120, y: -40 }, zoom: 33.3, rot: 0 },
		{ offset: { x: -75, y: 200 }, zoom: 50, rot: Math.PI / 6 },
		{ offset: { x: 10, y: 10 }, zoom: 90, rot: (2 * Math.PI) / 3 },
	];
	for (const { offset, zoom, rot } of cases) {
		it(`inverts for offset=${JSON.stringify(offset)} zoom=${zoom} rot=${rot.toFixed(2)}`, () => {
			for (const w of [{ x: 1.5, y: -2.25 }, { x: 0, y: 0 }, { x: -3.7, y: 4.1 }]) {
				const s = worldToScreen(w.x, w.y, offset, zoom, rot);
				const back = screenToWorld(s.x, s.y, offset, zoom, rot);
				expect(back.x).toBeCloseTo(w.x, 9);
				expect(back.y).toBeCloseTo(w.y, 9);
			}
		});
	}

	it("matches the canvas draw transform (y is flipped)", () => {
		// world +y must map to screen -y at rot=0 (p5 scale(1,-1)).
		const s = worldToScreen(0, 1, ORIGIN, 50, 0);
		expect(s.x).toBeCloseTo(0, 9);
		expect(s.y).toBeCloseTo(-50, 9);
	});
});

describe("rayCastContains (even-odd)", () => {
	const sq = square(0, 0, 1).vertices; // [-1,-1]..[1,1]
	it("accepts an interior point", () => {
		expect(rayCastContains(sq, 0, 0)).toBe(true);
		expect(rayCastContains(sq, 0.9, -0.9)).toBe(true);
	});
	it("rejects an exterior point", () => {
		expect(rayCastContains(sq, 2, 0)).toBe(false);
		expect(rayCastContains(sq, -1.5, -1.5)).toBe(false);
	});
	it("reads a star's reflex dent as OUTSIDE (unlike a convex-hull test)", () => {
		// A 4-point star: outer tips on the axes at r=2, inner (reflex) vertices on the diagonals at r=0.4.
		const r = 0.4 / Math.SQRT2;
		const star: PickNode["vertices"] = [
			{ x: 2, y: 0 }, { x: r, y: r },
			{ x: 0, y: 2 }, { x: -r, y: r },
			{ x: -2, y: 0 }, { x: -r, y: -r },
			{ x: 0, y: -2 }, { x: r, y: -r },
		];
		// A point out along the +x tip is inside; the same distance along the diagonal (a dent) is outside.
		expect(rayCastContains(star, 1.0, 0)).toBe(true);
		expect(rayCastContains(star, 0.8, 0.8)).toBe(false);
	});
});

describe("pickSnapTarget", () => {
	const nodes = [square(0, 0), square(1, 0), square(0, 1), square(1, 1)];
	// Vertices of adjacent unit squares coincide, e.g. (0.5, 0.5) is shared by all four.
	const radiusWorld = 0.2;
	const maxRadius = Math.SQRT1_2; // centroid->corner of a unit square

	it("snaps to the nearest vertex when the click is within the radius", () => {
		const hit = pickSnapTarget({ x: 0.46, y: 0.44 }, nodes, maxRadius, radiusWorld);
		expect(hit).not.toBeNull();
		expect(hit!.x).toBeCloseTo(0.5, 9);
		expect(hit!.y).toBeCloseTo(0.5, 9);
	});

	it("falls back to the containing tile's centroid away from any vertex", () => {
		const hit = pickSnapTarget({ x: 0.05, y: -0.05 }, nodes, maxRadius, radiusWorld);
		expect(hit).not.toBeNull();
		expect(hit!.x).toBeCloseTo(0, 9);
		expect(hit!.y).toBeCloseTo(0, 9);
	});

	it("returns null when the click is outside every tile and its vertices", () => {
		const hit = pickSnapTarget({ x: 10, y: 10 }, nodes, maxRadius, radiusWorld);
		expect(hit).toBeNull();
	});

	it("prefers the vertex over the centroid when both are candidates", () => {
		// Near the shared corner (0.5,0.5) AND inside a tile: vertex must win.
		const hit = pickSnapTarget({ x: 0.55, y: 0.55 }, nodes, maxRadius, radiusWorld);
		expect(hit!.x).toBeCloseTo(0.5, 9);
		expect(hit!.y).toBeCloseTo(0.5, 9);
	});
});

describe("reduceToOriginCell", () => {
	const v1 = { x: 1, y: 0 };
	const v2 = { x: 0.5, y: Math.sqrt(3) / 2 }; // a non-orthogonal (hex-ish) basis

	it("lands the reduced point in the origin cell [0,1)^2 lattice coords", () => {
		const det = v1.x * v2.y - v2.x * v1.y;
		for (const w of [{ x: 3.7, y: -2.1 }, { x: -0.2, y: 5.9 }, { x: 100.3, y: -50.4 }]) {
			const q = reduceToOriginCell(w, v1, v2);
			const a = (q.x * v2.y - q.y * v2.x) / det;
			const b = (q.y * v1.x - q.x * v1.y) / det;
			expect(a).toBeGreaterThanOrEqual(-1e-9);
			expect(a).toBeLessThan(1 + 1e-9);
			expect(b).toBeGreaterThanOrEqual(-1e-9);
			expect(b).toBeLessThan(1 + 1e-9);
		}
	});

	it("differs from the input by an integer lattice combination", () => {
		const det = v1.x * v2.y - v2.x * v1.y;
		const w = { x: 3.7, y: -2.1 };
		const q = reduceToOriginCell(w, v1, v2);
		const da = ((w.x - q.x) * v2.y - (w.y - q.y) * v2.x) / det;
		const db = ((w.y - q.y) * v1.x - (w.x - q.x) * v1.y) / det;
		expect(da).toBeCloseTo(Math.round(da), 9);
		expect(db).toBeCloseTo(Math.round(db), 9);
	});
});

describe("inversive lens pick", () => {
	const circle: LensParams = { mode: 0, R: 180, kinv: { x: 0, y: 0 } };
	const kinvMag = Math.exp(-0.5);
	const mobius: LensParams = {
		mode: 1,
		R: 180,
		kinv: { x: kinvMag * Math.cos(-Math.PI / 3), y: kinvMag * Math.sin(-Math.PI / 3) },
	};

	it("circle inversion samples the view origin at the screen centre (clamped)", () => {
		const v = lensInverse({ x: 0, y: 0 }, circle);
		expect(v.x).toBeCloseTo(0, 9);
		expect(v.y).toBeCloseTo(0, 9);
	});

	it("inversiveScreenToWorld composes lens inverse then affine inverse", () => {
		const zoom = 50, rot = Math.PI / 7, offset = { x: 12, y: -8 };
		const s = { x: 60, y: 25 };
		const v = lensInverse(s, mobius);
		const expected = screenToWorld(v.x, v.y, offset, zoom, rot);
		const got = inversiveScreenToWorld(s.x, s.y, mobius, offset, zoom, rot);
		expect(got.x).toBeCloseTo(expected.x, 9);
		expect(got.y).toBeCloseTo(expected.y, 9);
	});

	// Centring in the inversive view is the flat affine solve: offset = −worldToScreen(p, 0). Its defining
	// property is that the picked point p then maps to the affine origin v = 0 (the centre of inversion,
	// which the lens sends to infinity). Verified against the affine map alone — the lens is not involved.
	for (const { zoom, rot } of [
		{ zoom: 50, rot: 0 },
		{ zoom: 33.3, rot: Math.PI / 5 },
		{ zoom: 88, rot: (3 * Math.PI) / 4 },
	]) {
		it(`centring puts p at the affine origin v=0 (zoom=${zoom}, rot=${rot.toFixed(2)})`, () => {
			for (const p of [{ x: 1.2, y: -0.8 }, { x: -2.5, y: 3.1 }, { x: 0.05, y: 0.05 }]) {
				const sp = worldToScreen(p.x, p.y, { x: 0, y: 0 }, zoom, rot);
				const offset = { x: -sp.x, y: -sp.y };
				const v = worldToScreen(p.x, p.y, offset, zoom, rot); // affine forward with the new offset
				expect(v.x).toBeCloseTo(0, 9);
				expect(v.y).toBeCloseTo(0, 9);
			}
		});
	}
});
