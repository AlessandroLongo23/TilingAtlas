import { describe, expect, it } from "vitest";
import { diskModel, geoLerp, su11Pow } from "./diskPath";
import {
	hypDist,
	su11Apply,
	su11Mul,
	su11Normalize,
	su11Rotation,
	su11Translation,
	type Complex,
	type Su11,
} from "./hyperbolic";
import type { DiskPose } from "./cameraPose";

const probes: Complex[] = [
	{ x: 0, y: 0 },
	{ x: 0.3, y: -0.2 },
	{ x: -0.5, y: 0.4 },
];
/** Two SU(1,1) elements act alike (they may differ by sign). */
function sameMap(a: Su11, b: Su11) {
	for (const z of probes) {
		const p = su11Apply(a, z),
			q = su11Apply(b, z);
		expect(p.x).toBeCloseTo(q.x, 7);
		expect(p.y).toBeCloseTo(q.y, 7);
	}
}

const A: DiskPose = { kind: "disk", m: su11Normalize(su11Mul(su11Rotation(0.4), su11Translation({ x: 0.3, y: 0.1 }))) };
const B: DiskPose = {
	kind: "disk",
	m: su11Normalize(su11Mul(su11Rotation(-1.1), su11Translation({ x: -0.5, y: 0.45 }))),
};
const m = (p: unknown) => (p as DiskPose).m;

describe("su11Pow", () => {
	it("is the identity at 0 and the map at 1", () => {
		sameMap(su11Pow(B.m, 0), { a: { x: 1, y: 0 }, b: { x: 0, y: 0 } });
		sameMap(su11Pow(B.m, 1), B.m);
	});

	it("halves: the square of the half power is the map", () => {
		for (const g of [B.m, su11Rotation(2.5), su11Translation({ x: 0.6, y: -0.2 })]) {
			const h = su11Pow(g, 0.5);
			sameMap(su11Mul(h, h), g);
		}
	});
});

describe("disk moves", () => {
	it("hit both keyframes, straight or bent", () => {
		sameMap(m(diskModel.segment(A, B, null, 0)), A.m);
		sameMap(m(diskModel.segment(A, B, null, 1)), B.m);
		const bend = { x: 0.2, y: 0.6 };
		sameMap(m(diskModel.segment(A, B, bend, 0)), A.m);
		sameMap(m(diskModel.segment(A, B, bend, 1)), B.m);
	});

	it("move the centre at a constant hyperbolic speed when straight", () => {
		const c = [0, 0.25, 0.5, 0.75, 1].map((u) => diskModel.centre(diskModel.segment(A, B, null, u)) as Complex);
		const steps = c.slice(1).map((p, i) => hypDist(c[i], p));
		for (const s of steps) expect(s).toBeCloseTo(steps[0], 6);
	});

	it("pass a bent move through the dragged point halfway", () => {
		// Halfway along the straight move, pulled well off it.
		const c0 = diskModel.centre(diskModel.segment(A, B, null, 0.5));
		const mid = { x: c0.x + 0.15, y: c0.y + 0.2 };
		const bend = diskModel.bendThrough(A, B, mid);
		const c = diskModel.centre(diskModel.segment(A, B, bend, 0.5)) as Complex;
		expect(hypDist(c, mid)).toBeLessThan(1e-4);
	});

	it("re-centre a keyframe on the point asked for", () => {
		const w = { x: -0.2, y: 0.33 };
		const c = diskModel.centre(diskModel.withCentre(A, w)) as Complex;
		expect(hypDist(c, w)).toBeLessThan(1e-9);
	});

	it("geoLerp lands on the geodesic at the right distance", () => {
		const p = { x: 0.1, y: 0.2 },
			q = { x: -0.6, y: 0.3 };
		const r = geoLerp(p, q, 0.3);
		expect(hypDist(p, r)).toBeCloseTo(0.3 * hypDist(p, q), 9);
		expect(hypDist(r, q)).toBeCloseTo(0.7 * hypDist(p, q), 9);
	});
});
