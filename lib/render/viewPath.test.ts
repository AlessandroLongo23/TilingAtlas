import { describe, expect, it } from "vitest";
import { moveLength, type CameraDriver, type Pose, type WorldPt } from "./cameraPose";
import {
	CURVE_PRESETS,
	DEFAULT_CURVE,
	distanceTimes,
	easeCurve,
	flatModel,
	screenOf,
	worldOf,
	type Curve,
	bendThrough,
	centreOf,
	interpolateView,
	segmentView,
	viewAtTime,
	viewCentredOn,
	type View,
} from "./viewPath";

// s = o + z·R(θ)·w, the flat camera with the y-flip folded into w.
function toScreen(v: View, w: { x: number; y: number }) {
	const th = (v.rotation * Math.PI) / 180;
	const c = Math.cos(th),
		s = Math.sin(th);
	return { x: v.x + v.zoom * (c * w.x - s * w.y), y: v.y + v.zoom * (s * w.x + c * w.y) };
}

function expectView(pose: Pose, want: View) {
	const got = pose as View;
	expect(got.x).toBeCloseTo(want.x, 6);
	expect(got.y).toBeCloseTo(want.y, 6);
	expect(got.zoom).toBeCloseTo(want.zoom, 6);
	expect(got.rotation).toBeCloseTo(want.rotation, 6);
}

const A: View = { x: 40, y: -25, zoom: 30, rotation: 10 };
const B: View = { x: -120, y: 80, zoom: 75, rotation: 95 };

describe("interpolateView", () => {
	it("hits both endpoints", () => {
		expectView(interpolateView(A, B, 0), A);
		expectView(interpolateView(A, B, 1), B);
	});

	it("is a pure linear pan when zoom and angle agree", () => {
		const C = { ...A, x: A.x + 200, y: A.y - 60 };
		expectView(interpolateView(A, C, 0.25), { ...A, x: A.x + 50, y: A.y - 15 });
	});

	it("is continuous across the pure-pan branch", () => {
		const C = { ...A, x: A.x + 200, zoom: A.zoom * (1 + 1e-9) };
		expect(interpolateView(A, C, 0.5).x).toBeCloseTo(A.x + 100, 4);
	});

	it("moves the screen along a group: half of the rest of the way from t=0.5 is t=0.75", () => {
		const mid = interpolateView(A, B, 0.5);
		expectView(interpolateView(mid, B, 0.5), interpolateView(A, B, 0.75));
	});

	it("holds the spiral's centre fixed on screen", () => {
		// The world point that both A and B put at the same screen position.
		const k = { re: 0, im: 0 };
		const th = ((B.rotation - A.rotation) * Math.PI) / 180;
		const r = B.zoom / A.zoom;
		k.re = r * Math.cos(th);
		k.im = r * Math.sin(th);
		// c = (o_B − k·o_A)/(1 − k)
		const nr = B.x - (k.re * A.x - k.im * A.y);
		const ni = B.y - (k.re * A.y + k.im * A.x);
		const dr = 1 - k.re,
			di = -k.im;
		const den = dr * dr + di * di;
		const c = { x: (nr * dr + ni * di) / den, y: (ni * dr - nr * di) / den };
		// Pull c back through A to world, then push through every intermediate view.
		const tA = (A.rotation * Math.PI) / 180;
		const ux = (c.x - A.x) / A.zoom,
			uy = (c.y - A.y) / A.zoom;
		const w = { x: Math.cos(tA) * ux + Math.sin(tA) * uy, y: -Math.sin(tA) * ux + Math.cos(tA) * uy };
		for (const t of [0, 0.2, 0.5, 0.9, 1]) {
			const s = toScreen(interpolateView(A, B, t), w);
			expect(s.x).toBeCloseTo(c.x, 6);
			expect(s.y).toBeCloseTo(c.y, 6);
		}
	});

	it("turns the short way round", () => {
		const v = interpolateView({ ...A, rotation: 350 }, { ...A, rotation: 10 }, 0.5);
		expect(v.rotation).toBeCloseTo(360, 6);
	});
});

describe("viewAtTime", () => {
	const keys = [
		{ t: 1, view: A },
		{ t: 3, view: B },
	];

	it("holds before the first keyframe and after the last", () => {
		expectView(viewAtTime(keys, 0)!, A);
		expectView(viewAtTime(keys, 5, { duration: 6 })!, B);
	});

	it("is the spiral between keyframes, at the time's fraction", () => {
		expectView(viewAtTime(keys, 2)!, interpolateView(A, B, 0.5));
	});

	it("flies the tail to closeTo and lands on it at the end", () => {
		expectView(viewAtTime(keys, 6, { duration: 6, closeTo: A })!, A);
		expectView(viewAtTime(keys, 4.5, { duration: 6, closeTo: A })!, interpolateView(B, A, 0.5));
	});

	it("runs each segment on its keyframe's speed curve", () => {
		const lin: Curve = [0.25, 0.25, 0.75, 0.75];
		expectView(viewAtTime([{ ...keys[0], curve: lin }, keys[1]], 1.5)!, interpolateView(A, B, 0.25));
		expectView(viewAtTime(keys, 1.5)!, interpolateView(A, B, easeCurve(DEFAULT_CURVE, 0.25)));
	});
});

describe("bent segments", () => {
	it("centreOf and viewCentredOn are inverse", () => {
		expectView(viewCentredOn(centreOf(A), A.zoom, A.rotation), A);
	});

	it("puts the centre on the screen's origin", () => {
		const s = toScreen(A, centreOf(A));
		expect(s.x).toBeCloseTo(0, 9);
		expect(s.y).toBeCloseTo(0, 9);
	});

	it("keeps the endpoints and passes through the dragged midpoint", () => {
		const mid = { x: 3, y: -7 };
		const bend = bendThrough(A, B, mid);
		expectView(segmentView(A, B, bend, 0), A);
		expectView(segmentView(A, B, bend, 1), B);
		const c = centreOf(segmentView(A, B, bend, 0.5));
		expect(c.x).toBeCloseTo(mid.x, 9);
		expect(c.y).toBeCloseTo(mid.y, 9);
		expect(segmentView(A, B, bend, 0.5).zoom).toBeCloseTo(Math.sqrt(A.zoom * B.zoom), 9);
	});
});

describe("family angles", () => {
	it("move linearly with the segment, bent or not", () => {
		const a = { ...A, alphas: [30, 60] },
			b = { ...B, alphas: [50, 40] };
		expect(interpolateView(a, b, 0.25).alphas).toEqual([35, 55]);
		expect(segmentView(a, b, { x: 1, y: 1 }, 0.5).alphas).toEqual([40, 50]);
	});
});

describe("speed curves", () => {
	it("a diagonal curve is constant speed", () => {
		for (const u of [0.1, 0.37, 0.5, 0.9]) expect(easeCurve(CURVE_PRESETS[0].curve, u)).toBeCloseTo(u, 9);
	});

	it("ease-in starts slow and ease-out starts fast, both ending at 1", () => {
		const [, easeIn, easeOut] = CURVE_PRESETS;
		expect(easeCurve(easeIn.curve, 0.25)).toBeLessThan(0.25);
		expect(easeCurve(easeOut.curve, 0.25)).toBeGreaterThan(0.25);
		expect(easeCurve(easeIn.curve, 1)).toBe(1);
	});
});

describe("distance timing", () => {
	const box = { w: 800, h: 600 };
	// The flat driver's geometry without its store: what moveLength needs.
	const flat = {
		model: flatModel,
		project: (p: Pose, w: { x: number; y: number }) => {
			const s = screenOf(p as View, w);
			return { x: box.w / 2 + s.x, y: box.h / 2 + s.y, front: true };
		},
		unproject: (p: Pose, x: number, y: number) => worldOf(p as View, { x: x - box.w / 2, y: y - box.h / 2 }),
		probes: () => [
			{ x: 400, y: 300 },
			{ x: 0, y: 0 },
			{ x: 800, y: 0 },
			{ x: 800, y: 600 },
			{ x: 0, y: 600 },
		],
	} as unknown as CameraDriver;
	const segmentLength = (a: Pose, b: Pose, bend?: WorldPt | null) => moveLength(flat, a, b, bend);
	const P = { x: 0, y: 0, zoom: 50, rotation: 0 };

	it("measures a pan by how far the picture moves", () => {
		expect(segmentLength(P, { ...P, x: 300 }, null)).toBeCloseTo(300, 6);
	});

	it("gives a zoom on the spot a length", () => {
		expect(segmentLength(P, { ...P, zoom: 100 }, null)).toBeGreaterThan(100);
	});

	it("spaces keyframes by distance, first at 0 and the end at the end", () => {
		const k = [
			{ t: 0, view: P },
			{ t: 1, view: { ...P, x: 100 } },
			{ t: 2, view: { ...P, x: 400 } },
		];
		const t = distanceTimes(k, 8, segmentLength);
		expect(t[0]).toBe(0);
		expect(t[1]).toBeCloseTo(2, 6);
		expect(t[2]).toBeCloseTo(8, 6);
	});

	it("counts the closing move toward the end", () => {
		const k = [
			{ t: 0, view: P },
			{ t: 1, view: { ...P, x: 100 } },
		];
		expect(distanceTimes(k, 4, segmentLength, P)[1]).toBeCloseTo(2, 6);
	});
});
