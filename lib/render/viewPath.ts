// Camera paths between stored /play views, for the animated export.
//
// A flat view is a similarity: screen = o + z·R(θ)·(flipped world), with o the pan in centred CSS px
// (see screenLatticeVectors in flatView.ts). Read as complex numbers that is s = o + a·w with a = z·e^{iθ}.
// Two views A and B differ by the screen map M = B∘A⁻¹, s ↦ o_B + k·(s − o_A) with k = a_B/a_A, which is
// itself one similarity: a spiral about a fixed point (a rotation when the zooms agree, a pure translation
// when k = 1). The path between them is the one-parameter group through M, M_t = "k^t about that point".
// That is what makes the motion uniform: every frame differs from the last by the same small spiral,
// where blending pan, zoom and angle separately swings the camera through an arc that looks off.
//
// Expanding V_t = M_t∘A gives a_t = a_A·k^t and o_t = o_A + f(t)·(o_B − o_A) with
// f(t) = (k^t − 1)/(k − 1), which stays defined as k → 1 (where f(t) → t, plain linear panning).

import { shortestDeltaDeg } from "@/lib/render/viewControls";
import type { PathModel, Pose, WorldPt } from "@/lib/render/cameraPose";

export interface View {
	/** Pan offset, centred CSS px, y down. */
	x: number;
	y: number;
	zoom: number;
	/** Degrees. */
	rotation: number;
	/** A parametric family's free angles (degrees, one per slider), where the tiling has them. They move
	 *  linearly in step with the camera; the camera's path does not depend on them. */
	alphas?: number[] | null;
}

function lerpAlphas(a: View, b: View, t: number): number[] | null {
	if (!a.alphas || !b.alphas || a.alphas.length !== b.alphas.length) return a.alphas ?? null;
	return a.alphas.map((x, i) => x + (b.alphas![i] - x) * t);
}

/** The view a fraction `t` of the way along the uniform spiral from `a` to `b`. The angle turns the
 *  short way round, which is what someone who rotated a few degrees between two keyframes meant. */
export function interpolateView(a: View, b: View, t: number): View {
	const lr = Math.log(b.zoom / a.zoom);
	const dDeg = shortestDeltaDeg(b.rotation - a.rotation);
	const phi = (dDeg * Math.PI) / 180;
	let fr: number, fi: number;
	if (Math.hypot(lr, phi) < 1e-6) {
		// Second-order series of f around L = 0: f ≈ t + t(t−1)L/2. Avoids 0/0 at a pure pan.
		fr = t + (t * (t - 1) * lr) / 2;
		fi = (t * (t - 1) * phi) / 2;
	} else {
		// f = (e^{tL} − 1)/(e^{L} − 1), L = lr + iφ
		const et = Math.exp(t * lr);
		const nr = et * Math.cos(t * phi) - 1;
		const ni = et * Math.sin(t * phi);
		const e1 = Math.exp(lr);
		const dr = e1 * Math.cos(phi) - 1;
		const di = e1 * Math.sin(phi);
		const den = dr * dr + di * di;
		fr = (nr * dr + ni * di) / den;
		fi = (ni * dr - nr * di) / den;
	}
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	return {
		x: a.x + fr * dx - fi * dy,
		y: a.y + fr * dy + fi * dx,
		zoom: a.zoom * Math.exp(t * lr),
		rotation: a.rotation + t * dDeg,
		alphas: lerpAlphas(a, b, t),
	};
}

export interface Pt {
	x: number;
	y: number;
}

// Points in the camera's world frame: w in s = o + a·w (the flipped world; flatView applies the flip
// before the camera, and nothing here needs it undone).

/** The world point at the centre of the screen: s = 0, so w = −o/a. */
export function centreOf(v: View): Pt {
	const th = (v.rotation * Math.PI) / 180;
	const ar = v.zoom * Math.cos(th),
		ai = v.zoom * Math.sin(th);
	const d = ar * ar + ai * ai;
	return { x: -(v.x * ar + v.y * ai) / d, y: -(v.y * ar - v.x * ai) / d };
}

/** The view with world point `c` at the centre of the screen, at this zoom and angle. */
export function viewCentredOn(c: Pt, zoom: number, rotation: number): View {
	const th = (rotation * Math.PI) / 180;
	const ar = zoom * Math.cos(th),
		ai = zoom * Math.sin(th);
	return { x: -(ar * c.x - ai * c.y), y: -(ar * c.y + ai * c.x), zoom, rotation };
}

/**
 * A segment whose path has been bent on the canvas. The frame centre follows the quadratic Bézier from
 * a's centre to b's through the control point `bend`; zoom and angle keep the spiral's schedule
 * (geometric zoom, angle linear in u). Unbent segments keep the spiral, where the centre path falls
 * out of the motion instead of being drawn.
 */
export function segmentView(a: View, b: View, bend: Pt | null | undefined, u: number): View {
	if (!bend) return interpolateView(a, b, u);
	const ca = centreOf(a),
		cb = centreOf(b);
	const m = 1 - u;
	const c = {
		x: m * m * ca.x + 2 * m * u * bend.x + u * u * cb.x,
		y: m * m * ca.y + 2 * m * u * bend.y + u * u * cb.y,
	};
	return {
		...viewCentredOn(
			c,
			a.zoom * Math.pow(b.zoom / a.zoom, u),
			a.rotation + u * shortestDeltaDeg(b.rotation - a.rotation),
		),
		alphas: lerpAlphas(a, b, u),
	};
}

/** The control point that makes a bent segment pass through `mid` halfway: B(½) = (a + 2P + b)/4. */
export function bendThrough(a: View, b: View, mid: Pt): Pt {
	const ca = centreOf(a),
		cb = centreOf(b);
	return { x: 2 * mid.x - (ca.x + cb.x) / 2, y: 2 * mid.y - (ca.y + cb.y) / 2 };
}

/** The plane's path model, for the timeline (cameraPose.ts). */
export const flatModel: PathModel = {
	segment: (a, b, bend, u) => segmentView(a as View, b as View, bend, u),
	centre: (p) => centreOf(p as View),
	bendThrough: (a, b, mid) => bendThrough(a as View, b as View, mid),
	withCentre: (p, w) => ({ ...(p as View), ...viewCentredOn(w, (p as View).zoom, (p as View).rotation) }),
	rotate: (p, deg) => {
		const v = p as View;
		return { ...v, ...viewCentredOn(centreOf(v), v.zoom, v.rotation + deg) };
	},
};

/**
 * A segment's speed curve: how far along the move (y) the camera is at each fraction of the segment's
 * time (x), as the cubic Bézier from (0,0) to (1,1) through the control points (x1,y1) and (x2,y2), the
 * same shape CSS's cubic-bezier() takes. Control points on the diagonal give constant speed.
 */
export type Curve = [x1: number, y1: number, x2: number, y2: number];

export const CURVE_PRESETS: { name: string; curve: Curve }[] = [
	{ name: "Linear", curve: [0.25, 0.25, 0.75, 0.75] },
	{ name: "Ease in", curve: [0.42, 0, 1, 1] },
	{ name: "Ease out", curve: [0, 0, 0.58, 1] },
	{ name: "Ease in-out", curve: [0.42, 0, 0.58, 1] },
];
export const DEFAULT_CURVE: Curve = CURVE_PRESETS[3].curve;

const bez = (p1: number, p2: number, s: number) =>
	3 * (1 - s) * (1 - s) * s * p1 + 3 * (1 - s) * s * s * p2 + s * s * s;

/** The curve's y at x = u. x(s) is monotone because x1, x2 ∈ [0, 1], so bisection always converges. */
export function easeCurve(c: Curve, u: number): number {
	if (u <= 0) return 0;
	if (u >= 1) return 1;
	let lo = 0,
		hi = 1,
		s = u;
	for (let i = 0; i < 40; i++) {
		s = (lo + hi) / 2;
		if (bez(c[0], c[2], s) < u) lo = s;
		else hi = s;
	}
	return bez(c[1], c[3], s);
}

/** Where world point `w` lands on screen under `v` (centred CSS px). */
export function screenOf(v: View, w: Pt): Pt {
	const th = (v.rotation * Math.PI) / 180;
	const ar = v.zoom * Math.cos(th),
		ai = v.zoom * Math.sin(th);
	return { x: v.x + ar * w.x - ai * w.y, y: v.y + ar * w.y + ai * w.x };
}

/** The world point under screen point `s` (centred CSS px) in `v`. */
export function worldOf(v: View, s: Pt): Pt {
	const th = (v.rotation * Math.PI) / 180;
	const ar = v.zoom * Math.cos(th),
		ai = v.zoom * Math.sin(th);
	const qx = s.x - v.x,
		qy = s.y - v.y;
	const d = ar * ar + ai * ai;
	return { x: (qx * ar + qy * ai) / d, y: (qy * ar - qx * ai) / d };
}

/**
 * Keyframe times that space the moves by how far each one moves the picture, so the camera keeps one
 * pace across keyframes: the first keyframe at 0 and the end of the motion at `end` (the last keyframe,
 * or the end of the closing move when there is one). Equal spacing when nothing moves at all.
 */
export function distanceTimes(
	keys: readonly Keyframe[],
	end: number,
	length: (a: Pose, b: Pose, bend: WorldPt | null | undefined) => number,
	closeTo?: Pose,
): number[] {
	const lens = keys.slice(0, -1).map((k, i) => length(k.view, keys[i + 1].view, k.bend));
	const last = keys.at(-1);
	if (closeTo && last) lens.push(length(last.view, closeTo, last.bend));
	const total = lens.reduce((a, b) => a + b, 0);
	const out = [0];
	let acc = 0;
	for (let i = 1; i < keys.length; i++) {
		acc += total > 1e-9 ? lens[i - 1] / total : 1 / lens.length;
		out.push(end * acc);
	}
	return out;
}

export interface Keyframe {
	/** Seconds from the start of the timeline. */
	t: number;
	view: Pose;
	/** The control point of the segment that starts here, when it has been bent. */
	bend?: WorldPt | null;
	/** The speed curve of the segment that starts here; DEFAULT_CURVE when unset. */
	curve?: Curve | null;
}

/**
 * The camera at time `time` on a timeline of keyframes sorted by `t`. Before the first keyframe the
 * view holds on it. Past the last, it holds there too, unless `closeTo` is given: then the stretch
 * from the last keyframe to `duration` is one more move, to that view, so a timeline that closes on its
 * first view loops without a seam. Each segment runs on the speed curve of the keyframe it starts at.
 */
export function viewAtTime(
	keys: readonly Keyframe[],
	time: number,
	opts: { duration?: number; closeTo?: Pose; model?: PathModel } = {},
): Pose | null {
	if (keys.length === 0) return null;
	const seg = (opts.model ?? flatModel).segment;
	const shape = (k: Keyframe, u: number) => easeCurve(k.curve ?? DEFAULT_CURVE, u);
	if (time <= keys[0].t) return keys[0].view;
	for (let i = 0; i + 1 < keys.length; i++) {
		const a = keys[i],
			b = keys[i + 1];
		if (time <= b.t) return b.t > a.t ? seg(a.view, b.view, a.bend, shape(a, (time - a.t) / (b.t - a.t))) : b.view;
	}
	const last = keys[keys.length - 1];
	const end = opts.duration ?? last.t;
	if (!opts.closeTo || end <= last.t) return last.view;
	return seg(last.view, opts.closeTo, last.bend, shape(last, Math.min(1, (time - last.t) / (end - last.t))));
}
