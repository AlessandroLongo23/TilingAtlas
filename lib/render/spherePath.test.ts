import { describe, expect, it } from "vitest";
import { qaxis, qmul, qrot, slerp, sphereModel, vslerp } from "./spherePath";
import type { Quat, SpherePose, Vec3 } from "./cameraPose";

const ang = (a: Vec3, b: Vec3) => Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
const v = (w: { x: number; y: number; z?: number }): Vec3 => [w.x, w.y, w.z ?? 0];
/** Two quaternions are one rotation (they may differ by sign). */
function sameRot(a: Quat, b: Quat) {
	for (const p of [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	] as Vec3[]) {
		const x = qrot(a, p),
			y = qrot(b, p);
		for (let i = 0; i < 3; i++) expect(x[i]).toBeCloseTo(y[i], 7);
	}
}

const A: SpherePose = { kind: "sphere", q: qaxis([0.2, 1, 0.1], 0.7), dist: 3.2 };
const B: SpherePose = { kind: "sphere", q: qmul(qaxis([1, 0.3, 0], 1.4), qaxis([0, 0, 1], 0.5)), dist: 2.4 };
const q = (p: unknown) => (p as SpherePose).q;

describe("sphere moves", () => {
	it("hit both keyframes, straight or bent, and zoom geometrically", () => {
		sameRot(q(sphereModel.segment(A, B, null, 0)), A.q);
		sameRot(q(sphereModel.segment(A, B, null, 1)), B.q);
		const bend = { x: 0, y: 1, z: 0 };
		sameRot(q(sphereModel.segment(A, B, bend, 0)), A.q);
		sameRot(q(sphereModel.segment(A, B, bend, 1)), B.q);
		expect((sphereModel.segment(A, B, null, 0.5) as SpherePose).dist).toBeCloseTo(Math.sqrt(3.2 * 2.4), 9);
	});

	it("turn at a constant rate when straight", () => {
		const qs = [0, 0.25, 0.5, 0.75, 1].map((u) => slerp(A.q, B.q, u));
		const step = (a: Quat, b: Quat) => Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
		const s = qs.slice(1).map((x, i) => step(qs[i], x));
		for (const d of s) expect(d).toBeCloseTo(s[0], 9);
	});

	it("pass a bent move through the dragged point halfway", () => {
		// Halfway along the straight move, pulled about 25° off it.
		const c0 = sphereModel.centre(sphereModel.segment(A, B, null, 0.5));
		const mid = { x: c0.x + 0.3, y: c0.y - 0.25, z: (c0.z ?? 0) + 0.1 };
		const n = Math.hypot(mid.x, mid.y, mid.z);
		const m: Vec3 = [mid.x / n, mid.y / n, mid.z / n];
		const bend = sphereModel.bendThrough(A, B, mid);
		const c = v(sphereModel.centre(sphereModel.segment(A, B, bend, 0.5)));
		expect(ang(c, m)).toBeLessThan(1e-4);
	});

	it("re-centre a keyframe on the point asked for", () => {
		const w: Vec3 = [0.6, -0.48, 0.64];
		expect(ang(v(sphereModel.centre(sphereModel.withCentre(A, { x: w[0], y: w[1], z: w[2] }))), w)).toBeLessThan(1e-9);
	});

	it("a spin makes a full turn and comes back where it started", () => {
		const up = qrot(A.q, [0, 1, 0]);
		const loop: SpherePose = { ...A, spin: { axis: up, angle: 2 * Math.PI } };
		sameRot(q(sphereModel.segment(A, loop, null, 1)), A.q);
		const half = v(sphereModel.centre(sphereModel.segment(A, loop, null, 0.5)));
		expect(ang(half, v(sphereModel.centre(A)))).toBeGreaterThan(1);
	});

	it("vslerp stays on the great circle at the right angle", () => {
		const a: Vec3 = [1, 0, 0],
			b: Vec3 = [0, 0.6, 0.8];
		expect(ang(a, vslerp(a, b, 0.25))).toBeCloseTo(0.25 * ang(a, b), 9);
	});
});
