// The Islamic interlace (woven over/under straps), ported to the sphere. This is the spherical twin of
// lib/utils/islamicInterlace.ts. The flat version pools every construction ray into ONE planar graph, assigns
// a consistent over/under weave by angular-sort parity around each crossing, then offsets each ray into a
// band whose under-strands are trimmed to the over-strand's edge — the trim IS the weave illusion.
//
// On the sphere the whole weave lives at the shared polyhedron edge-midpoints: each carries 4 ray-ends (two
// from each adjacent face), a 4-valent crossing. A per-face pass would only ever see two of those four and
// weave nothing, so the map MUST be global. We build one graph over all faces (sphericalIslamicRaySegments
// already roots adjacent faces' rays at the exact same midpoint, so they dedupe into one crossing), sort each
// vertex's incident ends CCW in its tangent plane, assign the weave on that abstract graph, then offset every
// edge into a band by doing the flat corner/mitre/trim math in each endpoint's LOCAL tangent frame and mapping
// the 2D corners back onto the sphere. Pure tuple + 2D math (no three.js) so it unit-tests like the flat one.

import { Vector } from "@/classes/Vector";
import { lineIntersect } from "@/lib/utils/islamicArrangement";
import type { Polyhedron, Vec3 } from "./platonicSolids";
import { sphericalIslamicRaySegments, type SphericalIslamicOptions } from "./sphericalIslamic";

type V3 = Vec3;

function dot(a: V3, b: V3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: V3, b: V3): V3 {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function sub(a: V3, b: V3): V3 {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function scale3(a: V3, s: number): V3 {
	return [a[0] * s, a[1] * s, a[2] * s];
}
function norm3(a: V3): V3 {
	const n = Math.hypot(a[0], a[1], a[2]) || 1;
	return [a[0] / n, a[1] / n, a[2] / n];
}

function clampd(x: number): number {
	return Math.min(1, Math.max(-1, x));
}

const key = (p: V3): string => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)},${Math.round(p[2] * 1e6)}`;

// Split every ray at the points where it crosses another ray in BOTH their interiors (transversal
// great-circle crossings). At edge offset 0 / intersection-count 1 the weave crossings sit at the shared
// ray endpoints (the dedup in buildSphericalInterlace already makes them 4-valent), so no split is needed.
// But once the contact point slides off the midpoint (offset > 0) or rays pass through each other (count > 1),
// the real crossings land mid-arc — and being endpoint-only, the graph would miss them and weave nothing.
// Injecting them as shared vertices turns each into a proper 4-valent crossing (the two rays' X is computed
// identically from both, so it dedupes). This is the spherical twin of buildArrangement's splitCrossings.
function splitAtCrossings(rays: Array<[V3, V3]>): Array<[V3, V3]> {
	const N = rays.length;
	const pn = rays.map(([O, E]) => norm3(cross(O, E))); // great-circle plane normal
	const tang = rays.map(([O, E]) => norm3(sub(E, scale3(O, dot(O, E))))); // forward tangent at O
	const alen = rays.map(([O, E]) => Math.acos(clampd(dot(O, E)))); // arc length
	const paramOn = (i: number, X: V3): number => Math.atan2(dot(X, tang[i]), dot(X, rays[i][0]));
	const cuts: Array<Array<{ t: number; p: V3 }>> = rays.map(() => []);
	const EPS = 1e-4;
	for (let i = 0; i < N; i++) {
		for (let j = i + 1; j < N; j++) {
			const line = cross(pn[i], pn[j]);
			if (Math.hypot(line[0], line[1], line[2]) < 1e-9) continue; // coincident/parallel great circles
			for (const sgn of [1, -1] as const) {
				const X = norm3(scale3(line, sgn));
				const ti = paramOn(i, X);
				const tj = paramOn(j, X);
				if (ti > EPS && ti < alen[i] - EPS && tj > EPS && tj < alen[j] - EPS) {
					cuts[i].push({ t: ti, p: X });
					cuts[j].push({ t: tj, p: X });
				}
			}
		}
	}
	const out: Array<[V3, V3]> = [];
	for (let i = 0; i < N; i++) {
		const pts = [{ t: 0, p: rays[i][0] }, ...cuts[i], { t: alen[i], p: rays[i][1] }].sort((a, b) => a.t - b.t);
		for (let k = 0; k < pts.length - 1; k++) {
			if (pts[k + 1].t - pts[k].t > EPS) out.push([pts[k].p, pts[k + 1].p]);
		}
	}
	return out;
}

interface WEnd {
	edge: number;
	end: 0 | 1;
	t: V3; // outgoing great-circle tangent at this vertex (unit, ⟂ pos)
	angle: number; // heading in the vertex tangent frame, for CCW sort
}
interface WVertex {
	pos: V3;
	u: V3;
	v: V3; // orthonormal tangent frame (u, v ⟂ pos)
	ends: WEnd[]; // sorted CCW by angle
}
interface WEdge {
	a: V3;
	b: V3;
	ia: number;
	ib: number;
	underA: boolean; // over/under at endpoint A (vertex ia), filled by assignOverUnder
	underB: boolean;
	assigned: boolean;
}

export interface SphInterlaceOptions extends SphericalIslamicOptions {
	/** Full band width in radians of arc. */
	width: number;
	/** Chirality seed: flips every crossing's over/under. */
	startUnder?: boolean;
	/** Tip treatment: true (default) extends the cap by width/2, false = butt. */
	squareCap?: boolean;
	/** true (default) breaks under strands for the weave; false = flat outlined straps. */
	weave?: boolean;
}

// One woven strap for a single ray. `fillCorners` is the strap-body quad in order [A.fL, A.fR, B.fR, B.fL]
// (t runs A→B, s runs left→right; B's corners are swapped so a strap side is A.fL→B.fR, matching the
// outline — otherwise the border cuts diagonally across the fill). Bodies butt straight through every
// crossing (no cut); the over/under is carried by HEIGHT instead — `levelA`/`levelB` lift each end at a
// crossing (+1 over, −1 under, 0 neutral) so the over strand's body simply covers the under strand there.
// `outline` is the border segments to stroke; each carries the level at its two ends so the border ramps
// with the body. Points are on the unit sphere (the mesh scales them by the per-level radius).
export interface SphBand {
	fillCorners: [V3, V3, V3, V3];
	levelA: number;
	levelB: number;
	outline: Array<{ a: V3; b: V3; la: number; lb: number }>;
}

const endUnder = (e: WEdge, end: 0 | 1): boolean => (end === 0 ? e.underA : e.underB);
const setEndUnder = (e: WEdge, end: 0 | 1, val: boolean): void => {
	if (end === 0) e.underA = val;
	else e.underB = val;
};

// Consistent over/under: around each vertex the ends alternate by angular-sort parity, along each edge the
// state flips. Even degree at every real crossing ⇒ no conflict. Returns degenerate on an odd-degree (≥3)
// vertex or a propagation clash (caller then draws flat straps). 1:1 port of the flat assignOverUnder.
function assignOverUnder(verts: WVertex[], edges: WEdge[], startUnder: boolean): boolean {
	let degenerate = false;
	const queue: number[] = [];
	for (let s = 0; s < edges.length; s++) {
		if (edges[s].assigned) continue;
		edges[s].underA = startUnder;
		edges[s].underB = !startUnder;
		edges[s].assigned = true;
		queue.push(edges[s].ia, edges[s].ib);
		while (queue.length) {
			const vi = queue.shift()!;
			const ends = verts[vi].ends;
			const deg = ends.length;
			if (deg >= 3 && deg % 2 === 1) degenerate = true;
			let phase: boolean | null = null;
			for (let i = 0; i < deg; i++) {
				const en = ends[i];
				if (!edges[en.edge].assigned) continue;
				const u = endUnder(edges[en.edge], en.end);
				phase = i & 1 ? !u : u;
				break;
			}
			if (phase === null) continue;
			for (let i = 0; i < deg; i++) {
				const en = ends[i];
				const want = i & 1 ? !phase : phase;
				const e = edges[en.edge];
				if (e.assigned) {
					if (endUnder(e, en.end) !== want) degenerate = true;
					continue;
				}
				setEndUnder(e, en.end, want);
				const other: 0 | 1 = en.end === 0 ? 1 : 0;
				setEndUnder(e, other, !want);
				e.assigned = true;
				queue.push(en.end === 0 ? e.ib : e.ia);
			}
		}
	}
	return degenerate;
}

const leftNormal = (d: Vector): Vector => new Vector(-d.y, d.x);

interface Corners {
	fL: V3;
	fR: V3;
	tip: boolean; // genuine strap end (degree-1) — gets an end cap
}

// The flat buildBands.corners() logic, run in this vertex's LOCAL 2D tangent frame (the vertex sits at the
// origin, each incident end's direction is its in-frame heading), then every 2D corner mapped back onto the
// sphere via normalize(pos + x·u + y·v). Bodies butt straight through every crossing now (no trimming — the
// weave is done by height), so this is just: degree-1 cap, ≥4 crossing → butt, else a mitre against the
// angular neighbours.
function cornersAt(verts: WVertex[], vi: number, ei: number, end: 0 | 1, h: number, square: boolean): Corners {
	const vt = verts[vi];
	const ends = vt.ends;
	const deg = ends.length;
	const k = ends.findIndex((x) => x.edge === ei && x.end === end);
	const me = ends[k];
	const dir2 = (a: number): Vector => new Vector(Math.cos(a), Math.sin(a));
	const map = (p: Vector): V3 => norm3([vt.pos[0] + p.x * vt.u[0] + p.y * vt.v[0], vt.pos[1] + p.x * vt.u[1] + p.y * vt.v[1], vt.pos[2] + p.x * vt.u[2] + p.y * vt.v[2]]);

	const meDir = dir2(me.angle);
	const nMe = leftNormal(meDir);
	const buttL = Vector.scale(nMe, h);
	const buttR = Vector.scale(nMe, -h);

	if (deg === 1) {
		const ext = square ? Vector.scale(meDir, -h) : new Vector(0, 0);
		return { fL: map(Vector.add(buttL, ext)), fR: map(Vector.add(buttR, ext)), tip: true };
	}
	if (deg >= 4) return { fL: map(buttL), fR: map(buttR), tip: false }; // crossing: butt straight through

	// Degree 2 (bend) or 3 (odd/degenerate): plain mitre against the angular neighbours.
	const next = ends[(k + 1) % deg];
	const prev = ends[(k - 1 + deg) % deg];
	const joinPoint = (ea: WEnd, eb: WEnd): Vector | null => {
		const da = dir2(ea.angle);
		const db = dir2(eb.angle);
		return lineIntersect(Vector.scale(leftNormal(da), h), da, Vector.scale(leftNormal(db), -h), db);
	};
	const fL = joinPoint(me, next) ?? buttL;
	const fR = joinPoint(prev, me) ?? buttR;
	return { fL: map(fL), fR: map(fR), tip: false };
}

// Weave height for one edge-end: only a 4-valent (or higher-even) CROSSING lifts — +1 for the over strand,
// −1 for the under strand — so the over body covers the under body there. Tips and bends stay neutral (0) so
// a strand's height is continuous where it turns (no step at the tips).
function levelForEnd(verts: WVertex[], e: WEdge, vi: number, end: 0 | 1): number {
	if (verts[vi].ends.length < 4) return 0;
	return endUnder(e, end) ? -1 : 1;
}

// Build the whole weave: pool the rays into one global spherical graph, assign the over/under, offset every
// edge into a band. `degenerate` (odd-degree vertex or clash) tells the caller to fall back to flat straps.
export function buildSphericalInterlace(poly: Polyhedron, opts: SphInterlaceOptions): { bands: SphBand[]; degenerate: boolean } {
	const raw = sphericalIslamicRaySegments(poly, opts);
	// Off-midpoint contact (offset > 0) or pass-through rays (count > 1) put the real weave crossings mid-arc,
	// so split there to surface them as 4-valent vertices — same rule as the fill's splitCrossings.
	const split = (opts.edgeOffsetFrac ?? 0) > 1e-9 || (opts.intersectionCount ?? 1) > 1;
	const rays = split ? splitAtCrossings(raw) : raw;

	const vmap = new Map<string, number>();
	const verts: WVertex[] = [];
	const vid = (p: V3): number => {
		const kk = key(p);
		let i = vmap.get(kk);
		if (i === undefined) {
			i = verts.length;
			vmap.set(kk, i);
			verts.push({ pos: p, u: [0, 0, 0], v: [0, 0, 0], ends: [] });
		}
		return i;
	};

	const edges: WEdge[] = [];
	for (const [A, B] of rays) {
		const ia = vid(A);
		const ib = vid(B);
		if (ia === ib) continue;
		const ei = edges.length;
		edges.push({ a: A, b: B, ia, ib, underA: false, underB: false, assigned: false });
		const ab = dot(A, B);
		const tA = norm3(sub(B, scale3(A, ab))); // great-circle tangent at A toward B
		const tB = norm3(sub(A, scale3(B, ab))); // at B toward A
		verts[ia].ends.push({ edge: ei, end: 0, t: tA, angle: 0 });
		verts[ib].ends.push({ edge: ei, end: 1, t: tB, angle: 0 });
	}

	// Tangent frame + CCW ordering per vertex.
	for (const vt of verts) {
		const P = vt.pos;
		const ref: V3 = Math.abs(P[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
		vt.u = norm3(cross(P, ref));
		vt.v = cross(P, vt.u); // unit — P, u orthonormal
		for (const e of vt.ends) e.angle = Math.atan2(dot(e.t, vt.v), dot(e.t, vt.u));
		vt.ends.sort((a, b) => a.angle - b.angle);
	}

	const degenerate = assignOverUnder(verts, edges, opts.startUnder ?? false);

	const h = opts.width / 2;
	const square = opts.squareCap !== false;
	const weave = !degenerate && opts.weave !== false;

	const bands: SphBand[] = [];
	for (let ei = 0; ei < edges.length; ei++) {
		const e = edges[ei];
		const A = cornersAt(verts, e.ia, ei, 0, h, square);
		const B = cornersAt(verts, e.ib, ei, 1, h, square);
		const levelA = weave ? levelForEnd(verts, e, e.ia, 0) : 0;
		const levelB = weave ? levelForEnd(verts, e, e.ib, 1) : 0;
		const outline: Array<{ a: V3; b: V3; la: number; lb: number }> = [
			{ a: A.fL, b: B.fR, la: levelA, lb: levelB }, // the two long sides (edge-left of A meets edge-right of B)
			{ a: A.fR, b: B.fL, la: levelA, lb: levelB },
		];
		if (A.tip) outline.push({ a: A.fL, b: A.fR, la: levelA, lb: levelA });
		if (B.tip) outline.push({ a: B.fL, b: B.fR, la: levelB, lb: levelB });
		bands.push({ fillCorners: [A.fL, A.fR, B.fR, B.fL], levelA, levelB, outline });
	}

	return { bands, degenerate };
}
