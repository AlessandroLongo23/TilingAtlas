// Camera paths in the Poincaré disk, for the animation timeline on the hyperbolic shelves.
//
// A disk camera is an isometry M (SU(1,1)) taking the tiling's home frame to the screen. Two cameras
// differ by one isometry, B·A⁻¹, and the move between them is that isometry's one-parameter subgroup:
// a translation along a geodesic, a rotation about a point, or a slide along a horocycle, whichever
// B·A⁻¹ is. Every frame then differs from the last by the same small isometry, which is the disk's
// version of "constant speed": the picture at the centre streams past at a steady hyperbolic rate.
//
// A bent move steers the centre through a hyperbolic quadratic Bézier (de Casteljau on geodesics) and
// carries the orientation along by translations from the start of the move, so the picture does not
// pick up the spin a frame defined from the disk's origin would give it far out.

import {
	type Complex,
	type Su11,
	su11Apply,
	su11ApplyInverse,
	su11Inverse,
	su11Mul,
	su11Normalize,
	su11Rotation,
	su11Translation,
} from "@/lib/render/hyperbolic";
import { shortestDeltaDeg } from "@/lib/render/viewControls";
import type { DiskPose, PathModel, Pose, WorldPt } from "@/lib/render/cameraPose";

const O: Complex = { x: 0, y: 0 };

/**
 * M^t for an isometry M: the point t of the way along its one-parameter subgroup. For a 2×2 matrix of
 * determinant 1 with half-trace c, M^t = α·M + β·I with α = s(tθ)/s(θ), β = s((1−t)θ)/s(θ), where
 * s = sinh and c = cosh θ for a translation (c > 1), s = sin and c = cos θ for a rotation (c < 1), and
 * α = t, β = 1 − t for the parabolic case between. M and −M are the same isometry; taking the sign with
 * c ≥ 0 picks the shorter rotation.
 */
export function su11Pow(m: Su11, t: number): Su11 {
	const M = m.a.x < 0 ? { a: { x: -m.a.x, y: -m.a.y }, b: { x: -m.b.x, y: -m.b.y } } : m;
	const c = M.a.x;
	let al: number, be: number;
	if (c > 1 + 1e-9) {
		const th = Math.acosh(c);
		al = Math.sinh(t * th) / Math.sinh(th);
		be = Math.sinh((1 - t) * th) / Math.sinh(th);
	} else if (c < 1 - 1e-9) {
		const th = Math.acos(c);
		al = Math.sin(t * th) / Math.sin(th);
		be = Math.sin((1 - t) * th) / Math.sin(th);
	} else {
		al = t;
		be = 1 - t;
	}
	return su11Normalize({ a: { x: al * M.a.x + be, y: al * M.a.y }, b: { x: al * M.b.x, y: al * M.b.y } });
}

/** The point a fraction u along the geodesic from p to q. */
export function geoLerp(p: Complex, q: Complex, u: number): Complex {
	const T = su11Translation(p);
	const q0 = su11ApplyInverse(T, q);
	const r = Math.hypot(q0.x, q0.y);
	if (r < 1e-12) return p;
	const s = Math.tanh(u * Math.atanh(Math.min(r, 1 - 1e-12))) / r;
	return su11Apply(T, { x: q0.x * s, y: q0.y * s });
}

const bezier = (a: Complex, p: Complex, b: Complex, u: number) => geoLerp(geoLerp(a, p, u), geoLerp(p, b, u), u);

/** The translation along the geodesic through p and q that carries p to q. */
function transport(p: Complex, q: Complex): Su11 {
	const T = su11Translation(p);
	return su11Mul(su11Mul(T, su11Translation(su11ApplyInverse(T, q))), su11Inverse(T));
}

const disk = (p: Pose) => (p as DiskPose).m;
/** The family angles a fraction u of the way from a to b; a's when the two do not match. */
function lerpAlphas(a: Pose, b: Pose, u: number): number[] | null | undefined {
	const x = (a as DiskPose).alphas,
		y = (b as DiskPose).alphas;
	return x && y && x.length === y.length ? x.map((v, i) => v + (y[i] - v) * u) : x;
}
const pt = (w: WorldPt): Complex => ({ x: w.x, y: w.y });
const centreOf = (m: Su11) => su11ApplyInverse(m, O);

/** The rotation part of m about its centre, read in the chart where `c0` is the origin. */
function angleIn(m: Su11, T0: Su11, c: Complex): number {
	// m·T0·T(c') fixes the origin when c' = T0⁻¹(c) is m's centre in the chart: a rotation, a = e^{iφ/2}.
	const R = su11Mul(m, su11Mul(T0, su11Translation(su11ApplyInverse(T0, c))));
	return (2 * Math.atan2(R.a.y, R.a.x) * 180) / Math.PI;
}

export const diskModel: PathModel = {
	segment(a, b, bend, u) {
		const A = disk(a),
			B = disk(b);
		const alphas = lerpAlphas(a, b, u);
		if (!bend) return { kind: "disk", m: su11Normalize(su11Mul(su11Pow(su11Mul(B, su11Inverse(A)), u), A)), alphas };
		const ca = centreOf(A),
			cb = centreOf(B);
		const c = bezier(ca, pt(bend), cb, u);
		// Work in the chart centred on the move's start, so the orientation is carried by translations
		// from there and not from the disk's origin.
		const T0 = su11Translation(ca);
		const pa = angleIn(A, T0, ca),
			pb = angleIn(B, T0, cb);
		const phi = ((pa + u * shortestDeltaDeg(pb - pa)) * Math.PI) / 180;
		const Tc = su11Translation(su11ApplyInverse(T0, c));
		return {
			kind: "disk",
			m: su11Normalize(su11Mul(su11Rotation(phi), su11Mul(su11Inverse(Tc), su11Inverse(T0)))),
			alphas,
		};
	},
	centre: (p) => centreOf(disk(p)),
	bendThrough(a, b, mid) {
		// No closed form: fix-point the control point in the chart around the chord's midpoint until the
		// curve's halfway point lands on `mid`.
		const ca = centreOf(disk(a)),
			cb = centreOf(disk(b)),
			M = pt(mid);
		const T = su11Translation(geoLerp(ca, cb, 0.5));
		const loc = (z: Complex) => su11ApplyInverse(T, z);
		const la = loc(ca),
			lb = loc(cb),
			lm = loc(M);
		let P = lm;
		for (let i = 0; i < 80; i++) {
			const h = bezier(la, P, lb, 0.5);
			P = { x: P.x + 1.5 * (lm.x - h.x), y: P.y + 1.5 * (lm.y - h.y) };
			const r = Math.hypot(P.x, P.y);
			if (r > 0.97) P = { x: (P.x / r) * 0.97, y: (P.y / r) * 0.97 };
		}
		return su11Apply(T, P);
	},
	// The screen centre is the pose's centre, so a rotation about the disk's origin turns about it.
	rotate: (p, deg) => ({
		kind: "disk",
		m: su11Normalize(su11Mul(su11Rotation((deg * Math.PI) / 180), disk(p))),
		alphas: (p as DiskPose).alphas,
	}),
	withCentre(p, w) {
		const m = disk(p);
		return { kind: "disk", m: su11Normalize(su11Mul(m, transport(pt(w), centreOf(m)))), alphas: (p as DiskPose).alphas };
	},
};
