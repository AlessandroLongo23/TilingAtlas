// The Islamic / Hankin contact-angle construction, ported to the sphere. This is the spherical twin of
// Polygon.calculateIslamicSegments (lib/classes/polygons/Polygon.ts): for each face edge, two rays leave
// the edge's arc midpoint at ±theta measured FROM THE EDGE, and each ray stops at the
// `intersectionCount`-th forward crossing with any OTHER ray of the same face. The flat version works in a
// 2D plane; here the three primitives are spherical — the ray origin is the great-circle arc midpoint, the
// direction is a tangent-plane rotation about the radial axis, and a ray is a great circle intersected via
// its plane normal. The growing-line termination logic (partner-covered arrivals, N-th crossing, no-drop
// fallback) is a 1:1 port with the 2D line parameter replaced by arc length.
//
// Why native-spherical and not "gnomonic-project each face and reuse the flat code": the flat code roots
// rays at CHORD midpoints, and a chord midpoint's gnomonic image differs between two adjacent faces' charts
// (it depends on the chart centre), so that shortcut kinks at every edge — worst on the fat faces of the
// tetra/octahedron. Rooting at the true ARC midpoint M = normalize(V0 + V1) is chart-independent, so the
// pattern is continuous across every shared edge (reflection across an edge's great-circle plane is a real
// isometry of the solid). Pure tuple math, no three.js — unit-tested like sphericalGeometry.ts.

import type { Polyhedron, Vec3 } from "./platonicSolids";
import { resolveRayStops, type RayCrossing } from "@/lib/utils/islamicRayStops";

type V3 = Vec3;

function dot(a: V3, b: V3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: V3, b: V3): V3 {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function add(a: V3, b: V3): V3 {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function sub(a: V3, b: V3): V3 {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function scale(a: V3, s: number): V3 {
	return [a[0] * s, a[1] * s, a[2] * s];
}
function len(a: V3): number {
	return Math.hypot(a[0], a[1], a[2]);
}
function normalize(a: V3): V3 {
	const n = len(a) || 1;
	return [a[0] / n, a[1] / n, a[2] / n];
}
function clamp(x: number, lo: number, hi: number): number {
	return Math.min(Math.max(x, lo), hi);
}

// Rotate a tangent vector v (assumed ⟂ axis, unit) by angle `a` about the radial `axis`. Rodrigues for a
// vector perpendicular to the axis collapses to v·cos + (axis × v)·sin, and stays unit.
function rotTangent(v: V3, a: number, axis: V3): V3 {
	const c = Math.cos(a);
	const s = Math.sin(a);
	const ax = cross(axis, v);
	return [v[0] * c + ax[0] * s, v[1] * c + ax[1] * s, v[2] * c + ax[2] * s];
}

// Move the unit point M along its great circle by arc-angle `s` in the (unit, tangent) direction `t`.
function slide(M: V3, s: number, t: V3): V3 {
	const c = Math.cos(s);
	const sn = Math.sin(s);
	return [M[0] * c + t[0] * sn, M[1] * c + t[1] * sn, M[2] * c + t[2] * sn];
}

// Signed arc-angle from unit origin O to unit point X along the great circle with forward tangent tO,
// in (−π, π]. Forward crossings are those in (eps, π).
function signedArc(O: V3, tO: V3, X: V3): number {
	return Math.atan2(dot(X, tO), dot(X, O));
}

export interface SphericalIslamicOptions {
	/** The "Islamic angle" slider in radians, measured FROM THE EDGE (matching the flat convention and
	 *  islamicTipsAngleFromSlider). 0 ⇒ rays parallel to the edge (tips on the vertices — the original
	 *  tiling); π/2 ⇒ rays along the inward normal (meetings collapse to the face centroid — the dual).
	 *  Internally the ray is rotated from the inward normal by (π/2 − angle), i.e. the flat a/2. */
	angleRad: number;
	/** Kaplan polygons-in-contact offset ∈ [0,1]: slides the two ray origins symmetrically along the
	 *  edge arc away from the midpoint. 0 ⇒ both at the midpoint (classic construction). */
	edgeOffsetFrac?: number;
	/** A ray passes the first N−1 crossings and stops at the N-th (clamped so no ray is ever dropped). */
	intersectionCount?: number;
	/** Samples per emitted arc (points = segments + 1). */
	segments?: number;
	/** Sphere radius the arcs are sampled onto. */
	radius?: number;
}

// Per-face solve: for one face, return each ray's origin (unit), forward tangent (unit), and stop
// arc-length, plus the face centroid direction. This is the whole growing-line construction for a single
// face; both the line renderer (samples arcs) and the fill (projects origin/endpoint to 2D) build on it.
function computeFaceRays(
	unit: V3[],
	face: number[],
	angle: number,
	frac: number,
	nStop: number,
	eps: number,
	trim: boolean,
): { origins: V3[]; tangents: V3[]; stops: number[]; C: V3 } {
	// Face centroid direction — the inward side every edge-normal points toward.
	let c: V3 = [0, 0, 0];
	for (const vi of face) c = add(c, unit[vi]);
	const C = normalize(c);

	const nEdges = face.length;
	const origins: V3[] = []; // O, unit
	const tangents: V3[] = []; // forward tangent at O, unit
	const planeN: V3[] = []; // great-circle plane normal
	const edgeOf: number[] = [];

	const pushRay = (O: V3, dirAtM: V3) => {
		let P = normalize(cross(O, dirAtM)); // plane of the great circle through O aiming along dirAtM
		let tO = normalize(cross(P, O)); // forward tangent of that circle at O
		if (dot(tO, dirAtM) < 0) {
			tO = scale(tO, -1);
			P = scale(P, -1);
		}
		origins.push(O);
		tangents.push(tO);
		planeN.push(P);
	};

	for (let e = 0; e < nEdges; e++) {
		const v0 = unit[face[e]];
		const v1 = unit[face[(e + 1) % nEdges]];
		const M = normalize(add(v0, v1)); // arc midpoint (chart-independent — shared across faces)
		// Edge tangent at M toward v1 (project v1 into the tangent plane at M).
		const eHat = normalize(sub(v1, scale(M, dot(v1, M))));
		// Inward edge-normal at M: the tangent ⟂ eHat, flipped to the centroid side.
		let nrm = normalize(cross(M, eHat));
		const inwardRef = sub(C, scale(M, dot(C, M)));
		if (dot(nrm, inwardRef) < 0) nrm = scale(nrm, -1);

		// The slider angle is measured from the EDGE, so the rotation away from the inward normal is
		// (π/2 − angle) — identical to the flat construction's a/2 (a = π − 2·slider). angle 0 ⇒ ±90° from
		// the normal (along the edge, tips on the vertices); angle π/2 ⇒ 0° (along the normal, centroid).
		const fromNormal = Math.PI / 2 - angle;
		const dPlus = rotTangent(nrm, fromNormal, M);
		const dMinus = rotTangent(nrm, -fromNormal, M);

		// Converging symmetric split: each ray roots on the side OPPOSITE its lean so both origins stay on
		// the edge and the pair crosses just off the midpoint. At frac 0 both collapse to M.
		const arcLen = Math.acos(clamp(dot(v0, v1), -1, 1));
		const shift = frac * 0.5 * arcLen;
		const oPos = slide(M, shift, eHat); // toward v1
		const oNeg = slide(M, -shift, eHat); // toward v0
		const plusLeansPlus = dot(dPlus, eHat) >= dot(dMinus, eHat);
		pushRay(plusLeansPlus ? oNeg : oPos, dPlus);
		pushRay(plusLeansPlus ? oPos : oNeg, dMinus);
		edgeOf.push(e, e);
	}

	const R = origins.length;

	// Boundary great-circle planes of this face, for containing each ray inside its own face. The Islamic
	// construction is defined per face — a ray belongs to the face it roots in and must not leave it. The
	// growing-line stop below accepts a forward crossing anywhere out to ~180° of arc, which is fine when the
	// nearest crossing is a real in-face one, but breaks when two rays are near-parallel great circles: their
	// only forward crossing is then way across the sphere, and the ray gets drawn to it (the long stray line
	// seen on the decagonal prism's square band faces at ~38–39°). exitArc caps a ray where it leaves the face
	// boundary; the clamp below applies it, so a runaway stop is replaced by the in-face chord instead.
	const bPlane: V3[] = [];
	const bCos: number[] = [];
	for (let k = 0; k < nEdges; k++) {
		const A = unit[face[k]];
		const B = unit[face[(k + 1) % nEdges]];
		bPlane.push(normalize(cross(A, B)));
		bCos.push(dot(A, B));
	}
	const exitArc = (i: number): number => {
		let best = Infinity;
		for (let k = 0; k < nEdges; k++) {
			const line = cross(planeN[i], bPlane[k]);
			if (len(line) < eps) continue; // ray coplanar with this boundary edge — no transversal exit
			const A = unit[face[k]];
			const B = unit[face[(k + 1) % nEdges]];
			for (const sgn of [1, -1] as const) {
				const X = normalize(scale(line, sgn));
				const s = signedArc(origins[i], tangents[i], X);
				if (s <= eps || s >= Math.PI) continue;
				// X lies on the minor arc A→B iff it is no farther (larger dot) from either endpoint than the
				// endpoints are from each other — i.e. it does not overshoot past A or B.
				if (dot(X, A) >= bCos[k] - 1e-7 && dot(X, B) >= bCos[k] - 1e-7 && s < best) best = s;
			}
		}
		return best;
	};

	// Every forward crossing of each ray with every OTHER ray (siblings excluded — they diverge), sorted by
	// arc distance. Two great circles meet at ±line; at most one point is forward for both rays.
	const xs: RayCrossing[][] = Array.from({ length: R }, () => []);
	for (let i = 0; i < R; i++) {
		for (let j = i + 1; j < R; j++) {
			if (edgeOf[i] === edgeOf[j]) continue;
			const line = cross(planeN[i], planeN[j]);
			if (len(line) < eps) continue; // coincident/parallel great-circle planes
			for (const sgn of [1, -1] as const) {
				const X = normalize(scale(line, sgn));
				const si = signedArc(origins[i], tangents[i], X);
				const sj = signedArc(origins[j], tangents[j], X);
				if (si > eps && si < Math.PI && sj > eps && sj < Math.PI) {
					xs[i].push({ t: si, j, tj: sj });
					xs[j].push({ t: sj, j: i, tj: si });
					break;
				}
			}
		}
	}
	for (const list of xs) list.sort((a, b) => a.t - b.t);

	// Cap each ray where it exits its own face (contains runaways, see exitArc), then resolve every ray's stop
	// with resolveRayStops: the same growing-line rule as the flat renderer (Pass 1) plus the opt-in overshoot
	// trim (Pass 2). On the sphere the cap makes a ray with no covered crossing fall back to its in-face chord
	// rather than run away. See lib/utils/islamicRayStops for the full rationale.
	const cap = new Array<number>(R);
	for (let i = 0; i < R; i++) cap[i] = exitArc(i);
	const stop = resolveRayStops(xs, nStop, cap, eps, trim);

	return { origins, tangents, stops: stop, C };
}

// One sampled great-circle polyline per construction segment, pooled across every face of the solid. Each
// face contributes 2·(its edges) rays. Deliberately NOT deduplicated across the shared edge: a ray belongs
// to a face, and adjacent faces' rays are mirror images that meet exactly at the shared arc midpoint.
export function sphericalIslamicArcs(poly: Polyhedron, opts: SphericalIslamicOptions): Float32Array[] {
	const segs = Math.max(2, Math.round(opts.segments ?? 24));
	const radius = opts.radius ?? 1;
	const frac = clamp(opts.edgeOffsetFrac ?? 0, 0, 1);
	const nStop = Math.max(1, Math.round(opts.intersectionCount ?? 1));
	const angle = opts.angleRad;
	const eps = 1e-9;

	const unit = poly.vertices.map(normalize);
	const out: Float32Array[] = [];

	for (const face of poly.faces) {
		// trim = true: these are the DRAWN lines, where an overshoot stub past a crossing is the visible defect.
		const { origins, tangents, stops } = computeFaceRays(unit, face, angle, frac, nStop, eps, true);
		for (let i = 0; i < origins.length; i++) {
			const s1 = stops[i];
			if (!isFinite(s1) || s1 <= eps) continue; // no partner ever caught it (or zero-length) — drop
			const O = origins[i];
			const t = tangents[i];
			const arr = new Float32Array((segs + 1) * 3);
			for (let k = 0; k <= segs; k++) {
				const s = (k / segs) * s1;
				const cs = Math.cos(s);
				const sn = Math.sin(s);
				arr[k * 3] = (O[0] * cs + t[0] * sn) * radius;
				arr[k * 3 + 1] = (O[1] * cs + t[1] * sn) * radius;
				arr[k * 3 + 2] = (O[2] * cs + t[2] * sn) * radius;
			}
			out.push(arr);
		}
	}

	return out;
}

// Raw construction-ray endpoint pairs [origin, stop] on the unit sphere, pooled across every face — the
// input to the interlace weave graph (sphericalInterlace.ts). Adjacent faces' rays on a shared edge share
// the EXACT same origin (the arc midpoint M = normalize(v0+v1), computed identically from both faces), so the
// weave map dedupes them into one 4-valent crossing — which is where the whole over/under weave lives.
export function sphericalIslamicRaySegments(poly: Polyhedron, opts: SphericalIslamicOptions): Array<[V3, V3]> {
	const frac = clamp(opts.edgeOffsetFrac ?? 0, 0, 1);
	const nStop = Math.max(1, Math.round(opts.intersectionCount ?? 1));
	const angle = opts.angleRad;
	const eps = 1e-9;

	const unit = poly.vertices.map(normalize);
	const out: Array<[V3, V3]> = [];
	for (const face of poly.faces) {
		// trim = false: the interlace weave needs clean shared crossings; a trimmed T-junction has odd degree
		// and would break the over/under assignment. The weave carries the crossing, so no stub shows anyway.
		const { origins, tangents, stops } = computeFaceRays(unit, face, angle, frac, nStop, eps, false);
		for (let i = 0; i < origins.length; i++) {
			const s1 = stops[i];
			if (!isFinite(s1) || s1 <= eps) continue;
			const O = origins[i];
			const t = tangents[i];
			const cs = Math.cos(s1);
			const sn = Math.sin(s1);
			const E: V3 = [O[0] * cs + t[0] * sn, O[1] * cs + t[1] * sn, O[2] * cs + t[2] * sn];
			out.push([O, E]);
		}
	}
	return out;
}

// Per-face data for the FILL: the tangent frame at the face centroid, plus the construction rays and the
// face boundary, all gnomonically projected into that frame's 2D coordinates. Gnomonic projection
// (P ↦ P/(P·C)) maps great circles to straight lines, so the flat planar-arrangement code (extractFaces)
// traces exactly the cells the great-circle star lines cut, and projecting a cell vertex back
// (C + x·u + y·v, then normalise) lands it on the very same arc the line renderer draws. One entry per face.
export interface FaceFillData {
	C: V3;
	u: V3;
	v: V3;
	/** Construction rays as 2D segments [ox, oy, ex, ey] in the (u, v) frame. */
	rays: Array<[number, number, number, number]>;
	/** The face's boundary vertices as 2D points (a closed regular polygon) in the (u, v) frame. */
	boundary: Array<[number, number]>;
}

export function sphericalIslamicFaceData(poly: Polyhedron, opts: SphericalIslamicOptions): FaceFillData[] {
	const frac = clamp(opts.edgeOffsetFrac ?? 0, 0, 1);
	const nStop = Math.max(1, Math.round(opts.intersectionCount ?? 1));
	const angle = opts.angleRad;
	const eps = 1e-9;

	const unit = poly.vertices.map(normalize);
	const out: FaceFillData[] = [];

	for (const face of poly.faces) {
		// trim = true: the fill traces cells from these rays; an overshoot stub cuts a spurious sliver cell.
		const { origins, tangents, stops, C } = computeFaceRays(unit, face, angle, frac, nStop, eps, true);
		// Orthonormal tangent frame at the centroid (u, v ⟂ C), with a well-conditioned reference axis.
		const ref: V3 = Math.abs(C[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
		const u = normalize(cross(C, ref));
		const v = cross(C, u); // unit — C, u orthonormal
		const project = (P: V3): [number, number] => {
			const d = dot(P, C) || eps;
			return [dot(P, u) / d, dot(P, v) / d];
		};
		const rays: Array<[number, number, number, number]> = [];
		for (let i = 0; i < origins.length; i++) {
			const s1 = stops[i];
			if (!isFinite(s1) || s1 <= eps) continue;
			const O = origins[i];
			const t = tangents[i];
			const cs = Math.cos(s1);
			const sn = Math.sin(s1);
			const E: V3 = [O[0] * cs + t[0] * sn, O[1] * cs + t[1] * sn, O[2] * cs + t[2] * sn];
			const [ox, oy] = project(O);
			const [ex, ey] = project(E);
			rays.push([ox, oy, ex, ey]);
		}
		const boundary = face.map((vi) => project(unit[vi]));
		out.push({ C, u, v, rays, boundary });
	}

	return out;
}
