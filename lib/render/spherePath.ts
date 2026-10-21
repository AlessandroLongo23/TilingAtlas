// Camera paths around the sphere, for the animation timeline on the spherical shelves.
//
// A sphere camera is a rotation q (camera space to world) and a distance: it sits at q·(0,0,dist) and
// looks at the centre, so the point of the sphere facing it, its "centre", is q·ẑ. Two cameras differ by
// one rotation, and the move between them is slerp: a turn at constant rate about a single fixed axis,
// the sphere's version of the plane's uniform spiral. The centre then runs along a circle of the sphere,
// a great circle when the axis lies in the picture plane. Distance moves geometrically, like zoom.
//
// Heading and roll are not separable on the sphere the way pan and angle are in the plane: going round
// a loop of the sphere turns the picture (holonomy). So a bent move steers the centre along a spherical
// Bézier arc and takes its roll from the plain slerp, nudged by the smallest rotation that carries the
// slerp's centre onto the arc's: the picture keeps the roll the straight move would have had.

import type { PathModel, Pose, Quat, SpherePose, Vec3, WorldPt } from "@/lib/render/cameraPose";

export const qmul = (a: Quat, b: Quat): Quat => [
	a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
	a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
	a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
	a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

export function qrot(q: Quat, v: Vec3): Vec3 {
	const r = qmul(qmul(q, [v[0], v[1], v[2], 0]), [-q[0], -q[1], -q[2], q[3]]);
	return [r[0], r[1], r[2]];
}

export const qaxis = (axis: Vec3, angle: number): Quat => {
	const n = Math.hypot(...axis) || 1,
		s = Math.sin(angle / 2) / n;
	return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
};

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
];
const norm = (v: Vec3): Vec3 => {
	const n = Math.hypot(...v) || 1;
	return [v[0] / n, v[1] / n, v[2] / n];
};

export function slerp(a: Quat, b: Quat, u: number): Quat {
	let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
	const s = d < 0 ? -1 : 1; // q and −q are one rotation: go the short way
	d *= s;
	if (d > 0.9995) {
		const r = a.map((x, i) => x + (s * b[i] - x) * u) as Quat;
		const n = Math.hypot(...r);
		return r.map((x) => x / n) as Quat;
	}
	const th = Math.acos(d);
	const k0 = Math.sin((1 - u) * th) / Math.sin(th),
		k1 = (s * Math.sin(u * th)) / Math.sin(th);
	return a.map((x, i) => k0 * x + k1 * b[i]) as Quat;
}

/** Unit-vector slerp: the point a fraction u along the great circle from a to b. */
export function vslerp(a: Vec3, b: Vec3, u: number): Vec3 {
	const d = Math.min(1, Math.max(-1, dot(a, b)));
	const th = Math.acos(d);
	if (th < 1e-9) return a;
	const k0 = Math.sin((1 - u) * th) / Math.sin(th),
		k1 = Math.sin(u * th) / Math.sin(th);
	return norm([k0 * a[0] + k1 * b[0], k0 * a[1] + k1 * b[1], k0 * a[2] + k1 * b[2]]);
}

/** The smallest rotation carrying unit vector a onto b. */
export function qbetween(a: Vec3, b: Vec3): Quat {
	const d = dot(a, b);
	if (d < -0.999999) {
		const ax = Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]);
		return qaxis(ax, Math.PI);
	}
	const c = cross(a, b);
	const q: Quat = [c[0], c[1], c[2], 1 + d];
	const n = Math.hypot(...q);
	return q.map((x) => x / n) as Quat;
}

const sph = (p: Pose) => p as SpherePose;
const v3 = (w: WorldPt): Vec3 => [w.x, w.y, w.z ?? 0];
const wp = (v: Vec3): WorldPt => ({ x: v[0], y: v[1], z: v[2] });
const centre = (q: Quat) => qrot(q, [0, 0, 1]);
const bezier = (a: Vec3, p: Vec3, b: Vec3, u: number) => vslerp(vslerp(a, p, u), vslerp(p, b, u), u);

export const sphereModel: PathModel = {
	segment(a, b, bend, u) {
		const A = sph(a),
			B = sph(b);
		const dist = A.dist * Math.pow(B.dist / A.dist, u);
		const q = slerp(A.q, B.q, u);
		// A loop's full turn rides on top of the move from the last keyframe back to the first.
		if (B.spin) return { kind: "sphere", q: qmul(qaxis(B.spin.axis, B.spin.angle * u), q), dist };
		if (!bend) return { kind: "sphere", q, dist };
		const c = bezier(centre(A.q), norm(v3(bend)), centre(B.q), u);
		return { kind: "sphere", q: qmul(qbetween(centre(q), c), q), dist };
	},
	centre: (p) => wp(centre(sph(p).q)),
	bendThrough(a, b, mid) {
		const ca = centre(sph(a).q),
			cb = centre(sph(b).q),
			m = norm(v3(mid));
		let P = m;
		for (let i = 0; i < 80; i++) {
			const h = bezier(ca, P, cb, 0.5);
			P = norm([P[0] + 1.5 * (m[0] - h[0]), P[1] + 1.5 * (m[1] - h[1]), P[2] + 1.5 * (m[2] - h[2])]);
		}
		return wp(P);
	},
	// A roll: a turn of the camera about its own line of sight.
	rotate: (p, deg) => ({ ...sph(p), q: qmul(sph(p).q, qaxis([0, 0, 1], (deg * Math.PI) / 180)) }),
	withCentre(p, w) {
		const s = sph(p);
		return { ...s, q: qmul(qbetween(centre(s.q), norm(v3(w))), s.q) };
	},
};

/**
 * A spherical tiling's points of interest, on the unit sphere: its vertices, the midpoints of its edges
 * and the centres of its faces. `edges` defaults to the faces' sides.
 */
export function sphereFeatures(
	vertices: readonly Vec3[],
	faces: readonly (readonly number[])[],
	edges?: readonly (readonly [number, number])[],
): Vec3[] {
	const vs = vertices.map(norm);
	const mid = (ids: readonly number[]) =>
		norm(ids.reduce<Vec3>((s, i) => [s[0] + vs[i][0], s[1] + vs[i][1], s[2] + vs[i][2]], [0, 0, 0]));
	const seen = new Set<string>();
	const sides: (readonly [number, number])[] = edges
		? [...edges]
		: faces.flatMap((f) => f.map((v, i) => [v, f[(i + 1) % f.length]] as const));
	const halves = sides.flatMap(([a, b]) => {
		const k = a < b ? `${a},${b}` : `${b},${a}`;
		if (seen.has(k)) return [];
		seen.add(k);
		return [mid([a, b])];
	});
	return [...vs, ...halves, ...faces.map(mid)];
}
