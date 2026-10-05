// Hankin polygons-in-contact construction on the hyperbolic shelf, for the per-pixel walk renderer.
// Kaplan & Salesin (Islamic star patterns in absolute geometry, ACM TOG 2004) showed the flat
// construction is valid verbatim in absolute geometry — rays leave each edge midpoint at the contact
// angle and become geodesics. Two facts make the port small:
//
//   * KLEIN: hyperbolic geodesics are straight chords in the Klein model and ordering along a geodesic
//     is preserved, so the whole flat arrangement machinery (lib/utils/islamicArrangement.ts —
//     crossings, T-junctions, face tracing, point-in-polygon) runs UNCHANGED on Klein coordinates.
//     Only metric quantities (midpoints, contact angles, ray arrival times, stroke distances) use
//     hyperbolic formulas in the Poincaré model, where angles are Euclidean (conformal).
//   * TILE-LOCAL: every ray stops inside its own tile, so the motif of a tile depends on that tile's
//     shape alone. A regular p-gon at edge ℓ has ONE motif, whatever tiling it sits in, and the walk
//     hands the shader each pixel in its tile's own frame (hyperbolicWalk.ts). The motif also has the
//     polygon's dihedral symmetry. So the bake is one small layer per polygon SIZE holding one WEDGE of
//     the tile (islamicWedgeBox), and the shader turns and mirrors each pixel into it: no fundamental
//     domain, no certificate, and every texel of the layer is spent on 1/(2p) of a tile. An apeirogon
//     has the same symmetry along its horocycle and gets the strip from a vertex to the next midpoint.
//
// Layer channels: R = face class (1 = A star body, 2 = B side field, 3 = C edge diamond), G =
// hyperbolic distance to the nearest construction line × EDGE_SCALE, B/A = the point the face is
// shaded by, in units of the tile's circumradius: the tile centre for A, the edge midpoint its diamond sits on for
// C, the tile vertex its field surrounds for B. Those points are shared by the tiles that meet there,
// so a face that spans several tiles takes one shade.

import {
	type Complex,
	geodesicMove,
	geodesicTangentAt,
	hypDist,
	EDGE_SCALE,
	hypBarycenter,
	hypMidpoint,
} from "@/lib/render/hyperbolic";
import { ISLAMIC_MARGIN, islamicWedgeBox } from "@/lib/render/hyperbolicWalk";
import { buildArrangement, extractFaces, keyOf, pointInPolygon, type Segment } from "@/utils/islamicArrangement";
import { Vector } from "@/classes/Vector";
import { EMBOSS_MIN_BORDER } from "@/utils/islamicInterlace";
import { islamicEdgeOffsetFrac, islamicNormalAngleFromSlider } from "@/utils/islamicNoise";
import { tileHueRgb01 } from "@/lib/render/hueRing";
import type { IslamicStyle, PerPixelDrawParams } from "@/lib/render/hyperbolicPerPixelGL";

// The arrangement quantises vertices to 1e-5 (islamicArrangement QUANT). Klein features at the bake's
// outermost tiles sit at ~2e-6 of the unit disk, so all arrangement work happens in Klein coordinates
// scaled by this factor — the quantum lands ~2 orders of magnitude below the smallest real feature.
export const KLEIN_SCALE = 256;

/** Poincaré → Klein (same disk, same ideal boundary). */
export function poincareToKlein(p: Complex): Complex {
	const s = 2 / (1 + p.x * p.x + p.y * p.y);
	return { x: p.x * s, y: p.y * s };
}

/** Klein → Poincaré. */
export function kleinToPoincare(k: Complex): Complex {
	const s = 1 + Math.sqrt(Math.max(1 - (k.x * k.x + k.y * k.y), 0));
	return { x: k.x / s, y: k.y / s };
}

interface RayK {
	o: Complex; // origin, SCALED Klein
	d: Complex; // unit direction, SCALED Klein
	sMax: number; // parameter at the ideal endpoint (never reached)
	sExit: number; // parameter where the ray leaves its OWN tile — rays are strictly tile-local
	edge: number;
	mP: Complex; // origin in Poincaré — hyperbolic arrival times are measured from here
}

/**
 * The geodesic ray from Poincaré point M with unit conformal tangent t, as a scaled-Klein chord ray.
 * The geodesic's circle (orthogonal to the unit circle, tangent to t at M) yields its two IDEAL
 * endpoints, which the Klein model shares; the forward one E satisfies (E − M)·t > 0 (the
 * tangent–chord angle of an arc inside the disk is < 90°, and > 90° toward the other endpoint).
 */
function rayChord(M: Complex, t: Complex): { o: Complex; d: Complex; sMax: number } {
	const n = { x: -t.y, y: t.x };
	const md = M.x * n.x + M.y * n.y;
	let E1: Complex;
	let E2: Complex;
	if (Math.abs(md) < 1e-12) {
		// radial tangent ⇒ the geodesic is the diameter through M
		E1 = t;
		E2 = { x: -t.x, y: -t.y };
	} else {
		const lam = (1 - (M.x * M.x + M.y * M.y)) / (2 * md);
		const K = { x: M.x + lam * n.x, y: M.y + lam * n.y };
		const dK = Math.hypot(K.x, K.y); // > 1 (orthogonal-circle centre is outside the disk)
		const a = 1 / dK; // the radical line of the two circles is x·K̂ = 1/|K|
		const h = Math.sqrt(Math.max(1 - a * a, 0));
		const kx = K.x / dK;
		const ky = K.y / dK;
		E1 = { x: a * kx - h * ky, y: a * ky + h * kx };
		E2 = { x: a * kx + h * ky, y: a * ky - h * kx };
	}
	const fwd = (E1.x - M.x) * t.x + (E1.y - M.y) * t.y > 0 ? E1 : E2;
	const o = poincareToKlein(M);
	const ox = o.x * KLEIN_SCALE;
	const oy = o.y * KLEIN_SCALE;
	const dx = fwd.x * KLEIN_SCALE - ox;
	const dy = fwd.y * KLEIN_SCALE - oy;
	const L = Math.hypot(dx, dy);
	return { o: { x: ox, y: oy }, d: { x: dx / L, y: dy / L }, sMax: L * 0.999 };
}

/**
 * Hankin rays of one tile: from each edge's contact point(s), two geodesic rays at ±theta from the
 * inward edge normal (theta measured from the normal — islamicNormalAngleFromSlider convention, the
 * exact flat calculateIslamicSegments contract). Angles are conformal, so the ±theta tilt is a plain
 * 2D rotation of the Poincaré tangent.
 *
 * `offsetFrac ∈ [−1,1]` is Kaplan/Bonner's two-point split, in HYPERBOLIC arc length: the two roots
 * slide symmetrically from the midpoint to M ± frac·(half edge) along the edge geodesic (1 ⇒ the
 * tiling vertices), and each ray leans toward the FAR side (the +ê-leaning ray roots at M − d·ê),
 * so the pair converges just off the midpoint — the flat construction's exact contract. At 0 both
 * roots collapse onto M and the classic single-contact rays come back bit-for-bit. A negative frac
 * roots each ray on its OWN side instead: the pair splits apart (islamicEdgeOffsetFrac), and
 * islamicSegmentsForTile draws the edge between the two roots.
 */
function tileRays(polyP: Complex[], center: Complex, theta: number, offsetFrac: number): RayK[] {
	const n = polyP.length;
	const cosT = Math.cos(theta);
	const sinT = Math.sin(theta);
	const frac = Math.min(Math.max(offsetFrac, -1), 1);
	const epsS = 1e-9 * KLEIN_SCALE;
	// the tile as a Klein chord polygon (convex for regular hyperbolic tiles) — the ray exit cap
	const polyK = polyP.map((p) => {
		const k = poincareToKlein(p);
		return { x: k.x * KLEIN_SCALE, y: k.y * KLEIN_SCALE };
	});
	const exitOf = (o: Complex, d: Complex, sMax: number): number => {
		let sExit = sMax;
		for (let j = 0; j < n; j++) {
			const A = polyK[j];
			const B = polyK[(j + 1) % n];
			const ex = B.x - A.x;
			const ey = B.y - A.y;
			const denom = d.x * ey - d.y * ex;
			if (Math.abs(denom) < 1e-12) continue;
			const fx = A.x - o.x;
			const fy = A.y - o.y;
			const s = (fx * ey - fy * ex) / denom;
			const u = (fx * d.y - fy * d.x) / denom;
			if (s > epsS && u > -1e-9 && u < 1 + 1e-9 && s < sExit) sExit = s;
		}
		return sExit;
	};
	const rays: RayK[] = [];
	for (let i = 0; i < n; i++) {
		const v0 = polyP[i];
		const v1 = polyP[(i + 1) % n];
		const M = hypMidpoint(v0, v1);
		const d = Math.abs(frac) * 0.5 * hypDist(v0, v1);
		// (root, lean toward v1?) — crossing: the +ê-leaning ray roots on the v0 side and vice versa;
		// split: each ray roots on the side it leans toward
		const roots: [Complex, boolean][] = [
			[d > 0 ? geodesicMove(M, v0, d) : M, frac >= 0],
			[d > 0 ? geodesicMove(M, v1, d) : M, frac < 0],
		];
		for (const [o, leanPlus] of roots) {
			// unit tangent toward v1 at the root — taken toward the FARTHER endpoint so it stays
			// well-defined when the root reaches a vertex (offset 100 %)
			const towardV0 = hypDist(o, v0) >= hypDist(o, v1);
			const tRaw = geodesicTangentAt(o, towardV0 ? v0 : v1);
			const ex = towardV0 ? -tRaw.x : tRaw.x;
			const ey = towardV0 ? -tRaw.y : tRaw.y;
			let nx = -ey;
			let ny = ex;
			const cTan = geodesicTangentAt(o, center);
			if (nx * cTan.x + ny * cTan.y < 0) {
				nx = -nx;
				ny = -ny;
			}
			const s = leanPlus ? sinT : -sinT;
			const dir = { x: nx * cosT + ex * s, y: ny * cosT + ey * s };
			const c = rayChord(o, dir);
			rays.push({ o: c.o, d: c.d, sMax: c.sMax, sExit: exitOf(c.o, c.d, c.sMax), edge: i, mP: o });
		}
	}
	return rays;
}

/**
 * The growing-ray race of Polygon.calculateIslamicSegments, in scaled Klein: every ray grows from its
 * contact point at unit HYPERBOLIC speed; a crossing with another ray's already-drawn body is a
 * qualifying arrival; a ray stops at its first one (classic single-contact construction). Crossings
 * are Klein straight-line intersections (exact); arrival times are hyperbolic distances. The clamp
 * (last covered crossing, else nearest forward crossing) and the loud no-partner warning are the flat
 * ones verbatim. Returns one [origin, endpoint] scaled-Klein segment per ray.
 */
export function islamicSegmentsForTile(
	polyP: Complex[],
	theta: number,
	offsetFrac = 0,
	label = "tile",
): [Complex, Complex][] {
	const center = hypBarycenter(polyP.map((p) => [p.x, p.y] as [number, number]));
	const rays = tileRays(polyP, center, theta, offsetFrac);
	const R = rays.length;
	const epsS = 1e-9 * KLEIN_SCALE;
	const epsT = 1e-9;

	interface Arrival {
		time: number;
		s: number;
		ray: number;
		partner: number;
		partnerTime: number;
	}
	const arrivals: Arrival[] = [];
	for (let i = 0; i < R; i++) {
		for (let j = i + 1; j < R; j++) {
			// siblings never STOP each other (at offset > 0 they do cross — the arrangement's
			// splitCrossings pass turns that crossing into a vertex, the flat contract exactly)
			if (rays[i].edge === rays[j].edge) continue;
			const di = rays[i].d;
			const dj = rays[j].d;
			const denom = di.x * dj.y - di.y * dj.x;
			if (Math.abs(denom) < 1e-12) continue;
			const fx = rays[j].o.x - rays[i].o.x;
			const fy = rays[j].o.y - rays[i].o.y;
			const s = (fx * dj.y - fy * dj.x) / denom;
			const u = (fx * di.y - fy * di.x) / denom;
			// crossings past a ray's own tile exit are not part of the motif — in the hyperbolic
			// unclosable regime (fat tiles, extreme sliders) rays would otherwise terminate on
			// accidental far-away crossings and shred the arrangement
			if (s <= epsS || u <= epsS || s >= rays[i].sExit || u >= rays[j].sExit) continue;
			const Xp = kleinToPoincare({
				x: (rays[i].o.x + s * di.x) / KLEIN_SCALE,
				y: (rays[i].o.y + s * di.y) / KLEIN_SCALE,
			});
			const ti = hypDist(rays[i].mP, Xp);
			const tj = hypDist(rays[j].mP, Xp);
			arrivals.push({ time: ti, s, ray: i, partner: j, partnerTime: tj });
			arrivals.push({ time: tj, s: u, ray: j, partner: i, partnerTime: ti });
		}
	}
	arrivals.sort((a, b) => a.time - b.time);

	const stopT = new Array<number>(R).fill(Infinity);
	const stopS = new Array<number>(R).fill(Infinity);
	const hits = new Array<number>(R).fill(0);
	const lastHitT = new Array<number>(R).fill(Infinity);
	const lastHitS = new Array<number>(R).fill(Infinity);
	const nearestT = new Array<number>(R).fill(Infinity);
	const nearestS = new Array<number>(R).fill(Infinity);
	for (const ev of arrivals) {
		if (ev.time < nearestT[ev.ray]) {
			nearestT[ev.ray] = ev.time;
			nearestS[ev.ray] = ev.s;
		}
		if (isFinite(stopT[ev.ray])) continue;
		// the partner's body covers the crossing iff it arrived no later and was still alive there
		if (ev.partnerTime <= ev.time + epsT && stopT[ev.partner] >= ev.partnerTime - epsT) {
			hits[ev.ray]++;
			lastHitT[ev.ray] = ev.time;
			lastHitS[ev.ray] = ev.s;
			if (hits[ev.ray] >= 1) {
				stopT[ev.ray] = ev.time;
				stopS[ev.ray] = ev.s;
			}
		}
	}
	const segments: [Complex, Complex][] = [];
	for (let i = 0; i < R; i++) {
		let s = stopS[i];
		if (!isFinite(s)) s = isFinite(lastHitT[i]) ? lastHitS[i] : nearestS[i];
		// no crossing inside the tile at all (the hyperbolic unclosable regime): run to the tile
		// boundary. The free end is a pendant the arrangement prune retracts to the last junction,
		// so the motif degrades continuously instead of dropping walls or shooting off-tile.
		if (!isFinite(s)) s = rays[i].sExit;
		segments.push([
			{ x: rays[i].o.x, y: rays[i].o.y },
			{ x: rays[i].o.x + s * rays[i].d.x, y: rays[i].o.y + s * rays[i].d.y },
		]);
	}
	// Split: the edge between an edge's two roots (rays 2i, 2i+1) is drawn — a Klein chord is the geodesic.
	if (offsetFrac < 0) for (let i = 0; i < R; i += 2) segments.push([{ ...rays[i].o }, { ...rays[i + 1].o }]);
	return segments;
}

/** A geodesic segment, ready for distance queries: its ends and the unit normal of its line, on the
 *  hyperboloid (x, y, t) with ⟨u, v⟩ = u.x·v.x + u.y·v.y − u.t·v.t. */
interface HypSeg {
	A: number[];
	B: number[];
	n: number[] | null; // null when the ends coincide
	cAB: number; // cosh of its length
}
const lift = (p: Complex): number[] => {
	const d = Math.max(1 - p.x * p.x - p.y * p.y, 1e-15);
	return [(2 * p.x) / d, (2 * p.y) / d, (2 - d) / d];
};
const mink = (u: number[], v: number[]) => u[0] * v[0] + u[1] * v[1] - u[2] * v[2];
function hypSeg(a: Complex, b: Complex): HypSeg {
	const A = lift(a);
	const B = lift(b);
	const n = [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], -(A[0] * B[1] - A[1] * B[0])];
	const len = Math.sqrt(Math.max(mink(n, n), 0));
	return { A, B, n: len > 1e-12 ? n.map((c) => c / len) : null, cAB: -mink(A, B) };
}
/**
 * Hyperbolic distance from the lifted point Q to a segment: to its line where the foot of the
 * perpendicular falls between the ends, else to the nearer end. Exact at any depth. The layers used to
 * measure in the disk and scale by the conformal factor at the point, which is the first-order term
 * only: it holds near the middle of the disk and bent the straps of an apeirogon, whose strip runs to
 * the rim.
 */
function segDist(Q: number[], s: HypSeg): number {
	if (s.n) {
		const h = mink(s.n, Q); // sinh of the signed distance to the line
		const F = [Q[0] - h * s.n[0], Q[1] - h * s.n[1], Q[2] - h * s.n[2]]; // the foot, times √(1+h²)
		const k = Math.sqrt(1 + h * h) * (s.cAB + 1e-9);
		if (-mink(F, s.A) <= k && -mink(F, s.B) <= k) return Math.asinh(Math.abs(h));
	}
	return Math.acosh(Math.max(1, Math.min(-mink(Q, s.A), -mink(Q, s.B))));
}

/** What a layer holds: `fill` is the A/B/C face classes with the construction lines' distance (the plain
 *  and checkerboard styles); `strap` is two line distances, the strand that runs over here and the one
 *  that runs under (interlace, outline, emboss). */
export type IslamicLayerKind = "fill" | "strap";

/** Strap layers store each distance in 15 bits over [0, STRAP_RANGE] hyperbolic units. */
export const STRAP_RANGE = 2;

/**
 * The tile a layer is baked for, and how the layer's texels map onto it. A layer covers one fundamental
 * region of the tile's own symmetry, in coordinates (u, v) that run 0 to 1 across it; `sample` takes any
 * (u, v), margin included, to the point of the tile it stands for: folded back into the region by the
 * tile's mirrors and pulled inside the tile.
 */
interface TileShape {
	polyP: Complex[];
	/** Edges 0 … real−1 are the tile's own; any beyond only close a finite piece of an infinite tile. */
	real: number;
	/** A point of the star body, given the tile's rays: the centre, or for an apeirogon a point of its
	 *  cusp above where they end. */
	star(rays: [Complex, Complex][]): Complex;
	sample(u: number, v: number): Complex;
	/** Disk-unit scale the fill layer's shading points are stored in; 0 when the shader derives them. */
	anchorScale: number;
}

function regularShape(p: number, edge: number): TileShape {
	const [rv, yv] = islamicWedgeBox(p, edge);
	const polyP: Complex[] = Array.from({ length: p }, (_, i) => {
		const a = ((2 * i - 1) * Math.PI) / p;
		return { x: rv * Math.cos(a), y: rv * Math.sin(a) };
	});
	const apothemK = poincareToKlein(hypMidpoint(polyP[0], polyP[1])).x; // side 0's midpoint is on the x axis
	const sector = (2 * Math.PI) / p;
	return {
		polyP,
		real: p,
		star: () => ({ x: 0, y: 0 }),
		anchorScale: rv,
		// into the wedge: turn by whole sectors, mirror in the x axis, and pull inside the tile
		sample(u, v) {
			const x = u * rv;
			const y = v * yv;
			const ang = Math.atan2(y, x);
			const a = Math.abs(ang - Math.round(ang / sector) * sector);
			const r = Math.min(Math.hypot(x, y), 0.999999);
			const q = { x: r * Math.cos(a), y: r * Math.sin(a) };
			const k = poincareToKlein(q);
			if (k.x <= apothemK * 0.9995) return q;
			const sc = (apothemK * 0.9995) / k.x;
			return kleinToPoincare({ x: k.x * sc, y: k.y * sc });
		},
	};
}

const APEIROGON_SPAN = 8; // sides of the apeirogon developed either way of the one that is sampled

/**
 * The apeirogon at edge length `edge`, in the frame the walk gives it (hyperbolicWalk.ts): ideal point
 * at 1, so that in the half-plane z = i(1+w)/(1−w) its vertices are i + k·s with s = 2·sinh(edge/2). The
 * motif repeats along the horocycle and is mirrored about every vertex and every side's midpoint, so the
 * layer holds the strip from a vertex (u = 0) to the next midpoint (u = 1), with v = 1 − 1/Im z running
 * up the cusp. The sampled side is the one from i to i + s, edge APEIROGON_SPAN of the list. The rays
 * are those of a finite run of sides closed by one far chord, whose own rays are
 * dropped; with APEIROGON_SPAN sides either way they start over two units from the strip, and every
 * real ray has met its neighbour long before.
 */
function apeirogonShape(edge: number): TileShape {
	const s = 2 * Math.sinh(edge / 2);
	const R = Math.sqrt((s * s) / 4 + 1);
	const disk = (x: number, y: number): Complex => {
		const d = x * x + (y + 1) * (y + 1);
		return { x: (x * x + y * y - 1) / d, y: (-2 * x) / d };
	};
	const polyP: Complex[] = [];
	for (let k = -APEIROGON_SPAN; k <= APEIROGON_SPAN + 1; k++) polyP.push(disk(k * s, 1));
	return {
		polyP,
		real: polyP.length - 1, // the last edge is the chord back to the first vertex
		// Over the sampled side's midpoint, half as high again as its two rays reach. As the rays turn
		// toward the normal they meet higher and higher, and past the closing chord this point is in no
		// face at all, which is the limit: the star body has left for the ideal point.
		star(rays) {
			const top = Math.max(
				...[2 * APEIROGON_SPAN, 2 * APEIROGON_SPAN + 1].map((r) => {
					const w = toP(rays[r][1]);
					return (1 - w.x * w.x - w.y * w.y) / ((1 - w.x) * (1 - w.x) + w.y * w.y);
				}),
			);
			return disk(s / 2, 1.5 * Math.max(top, R));
		},
		anchorScale: 0,
		sample(u, v) {
			let t = Math.abs(u);
			if (t > 1) t = 2 - t;
			const x = (t * s) / 2;
			const arc = Math.sqrt(R * R - (x - s / 2) * (x - s / 2));
			return disk(x, Math.max(1 / (1 - Math.min(v, 0.9995)), arc * 1.0005));
		},
	};
}

const shapeOf = (p: number, edge: number): TileShape => (p === 0 ? apeirogonShape(edge) : regularShape(p, edge));

interface FaceRec {
	polyK: Vector[]; // scaled Klein — containment (faces are straight polygons here)
	lines: HypSeg[]; // the face's construction lines
	hasA: boolean; // holds the star marker
	contacts: Complex[]; // the edge midpoints it holds, Poincaré
	corners: Complex[]; // the tile vertices on its boundary, Poincaré
	x0: number; // scaled-Klein bbox
	x1: number;
	y0: number;
	y1: number;
}

const toK = (q: Complex): Vector => {
	const k = poincareToKlein(q);
	return new Vector(k.x * KLEIN_SCALE, k.y * KLEIN_SCALE);
};
const toP = (v: { x: number; y: number }): Complex => kleinToPoincare({ x: v.x / KLEIN_SCALE, y: v.y / KLEIN_SCALE });
/** Whether a segment comes within `reach` of the layer: tested on a coarse lattice of its sample points,
 *  with half a unit of slack for what lies between them. A distance channel saturates, so a line that
 *  stays out of reach is never the answer, and on a 34-gon that is all but a handful of its 68 rays. */
function inReach(seg: HypSeg, lifted: number[][], res: number, reach: number): boolean {
	const step = Math.max(1, Math.floor(res / 12));
	for (let j = 0; j < res; j += step) for (let i = 0; i < res; i += step) if (segDist(lifted[j * res + i], seg) < reach + 0.5) return true;
	return false;
}

/** The layer's sample points, row by row, and the scaled-Klein box that holds them. */
function samples(shape: TileShape, res: number): { pts: Complex[]; kBox: { x0: number; x1: number; y0: number; y1: number } } {
	const span = 1 + ISLAMIC_MARGIN;
	const pts: Complex[] = [];
	const kBox = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
	for (let j = 0; j < res; j++) {
		for (let i = 0; i < res; i++) {
			const q = shape.sample(((i + 0.5) / res) * span - ISLAMIC_MARGIN, ((j + 0.5) / res) * span - ISLAMIC_MARGIN);
			pts.push(q);
			const k = toK(q);
			kBox.x0 = Math.min(kBox.x0, k.x);
			kBox.x1 = Math.max(kBox.x1, k.x);
			kBox.y0 = Math.min(kBox.y0, k.y);
			kBox.y1 = Math.max(kBox.y1, k.y);
		}
	}
	return { pts, kBox };
}

/** The tile's own rays: islamicSegmentsForTile without those of a closing chord. Rays 2i and 2i+1 leave
 *  edge i; at a split offset one more segment per edge follows them. */
function tileSegments(shape: TileShape, theta: number, frac: number): { rays: [Complex, Complex][]; extra: [Complex, Complex][] } {
	const n = shape.polyP.length;
	const raw = islamicSegmentsForTile(shape.polyP, theta, frac, `${shape.real}-gon`);
	return { rays: raw.slice(0, 2 * shape.real), extra: raw.slice(2 * n, 2 * n + shape.real) };
}

/**
 * Bake the plain-style Islamic layer of the regular p-gon at edge length `edge` (p = 0: the apeirogon):
 * one fundamental region of the tile in its own frame. The layer is TOTAL: a texel past the region holds
 * its mirror image's value and one past the tile holds the tile's value in its direction, so a bilinear
 * tap never reads an empty texel.
 *
 * The tile's boundary closes the arrangement, so every texel lies in a bounded face and there is no
 * wall-less case. Classes follow marker containment, which is local and continuous in the sliders: A
 * holds the star marker, C holds an edge midpoint (only once the offset opens the diamonds), B is the
 * rest. A face that holds both, near the merge at offsets past 95 %, is split per texel by the nearer
 * marker.
 */
function fillLayer(shape: TileShape, angleFromNormalRad: number, frac: number, res: number): Uint8Array {
	const { polyP, real } = shape;
	const { rays, extra } = tileSegments(shape, angleFromNormalRad, frac);
	const raw = [...rays, ...extra];

	// Prune dangling chains back to the last junction (a ray with no covered crossing runs to the tile
	// boundary and would make the face trace non-simple). A ray's ROOT is not a free end: the
	// neighbouring tile's ray leaves the same point.
	const arr = buildArrangement(raw.map(([a, b]) => [new Vector(a.x, a.y), new Vector(b.x, b.y)] as Segment), frac !== 0);
	const roots = rays.map(([o]) => new Vector(o.x, o.y)); // rays 2i, 2i+1 leave edge i
	const anchored = new Set(roots.map(keyOf));
	const deg = new Array<number>(arr.pts.length).fill(0);
	const vEdges: number[][] = arr.pts.map(() => []);
	arr.edges.forEach(([a, b], ei) => {
		deg[a]++;
		deg[b]++;
		vEdges[a].push(ei);
		vEdges[b].push(ei);
	});
	const alive = new Array<boolean>(arr.edges.length).fill(true);
	const free = (v: number) => deg[v] === 1 && !anchored.has(keyOf(arr.pts[v]));
	const stack: number[] = [];
	for (let v = 0; v < deg.length; v++) if (free(v)) stack.push(v);
	while (stack.length) {
		const v = stack.pop()!;
		if (!free(v)) continue;
		const ei = vEdges[v].find((e) => alive[e]);
		if (ei === undefined) continue;
		alive[ei] = false;
		const [a, b] = arr.edges[ei];
		deg[a]--;
		deg[b]--;
		const w = a === v ? b : a;
		if (free(w)) stack.push(w);
	}
	const lines: Segment[] = arr.edges.filter((_, ei) => alive[ei]).map(([a, b]) => [arr.pts[a], arr.pts[b]]);

	// The tile boundary, cut at the roots. It bounds faces and is never stroked; a split offset draws
	// the piece between an edge's two roots, which islamicSegmentsForTile has already returned.
	const cornersK = polyP.map(toK);
	const boundary: Segment[] = [];
	const isBoundary = new Set<string>();
	for (let i = 0; i < polyP.length; i++) {
		const next = cornersK[(i + 1) % polyP.length];
		const chain = i < real ? [cornersK[i], roots[2 * i], roots[2 * i + 1], next] : [cornersK[i], next];
		for (let c = 0; c + 1 < chain.length; c++) {
			const ka = keyOf(chain[c]);
			const kb = keyOf(chain[c + 1]);
			if (ka === kb || (c === 1 && frac < 0)) continue;
			boundary.push([chain[c], chain[c + 1]]);
			isBoundary.add(`${ka}|${kb}`).add(`${kb}|${ka}`);
		}
	}
	const faces = extractFaces([...lines, ...boundary], false);

	// At offset 0 every root sits on its midpoint and the diamonds have no area, so C does not exist. At
	// angle 90 with offset 0 the walls pass through the centre and the star bodies have shrunk to nothing.
	const starActive = !(angleFromNormalRad < 1e-9 && Math.abs(frac) < 1e-9);
	const star = shape.star(rays);
	const starK = toK(star);
	const midsP = polyP.slice(0, real).map((v, i) => hypMidpoint(v, polyP[(i + 1) % polyP.length]));
	// a midpoint lies ON the boundary, so containment is tested a step toward the star from it
	const insideMids = midsP.map((m) => toK(geodesicMove(m, star, 1e-3)));
	const cornerKey = new Map(cornersK.map((v, i) => [keyOf(v), polyP[i]] as const));
	const { pts, kBox } = samples(shape, res);
	const lifted = pts.map(lift);
	const recs: FaceRec[] = [];
	for (const f of faces) {
		const vs = f.vertices;
		let x0 = Infinity;
		let x1 = -Infinity;
		let y0 = Infinity;
		let y1 = -Infinity;
		for (const v of vs) {
			x0 = Math.min(x0, v.x);
			x1 = Math.max(x1, v.x);
			y0 = Math.min(y0, v.y);
			y1 = Math.max(y1, v.y);
		}
		if (x1 < kBox.x0 || x0 > kBox.x1 || y1 < kBox.y0 || y0 > kBox.y1) continue; // never sampled
		const lines: HypSeg[] = [];
		const corners: Complex[] = [];
		vs.forEach((v, i) => {
			const w = vs[(i + 1) % vs.length];
			const corner = cornerKey.get(keyOf(v));
			if (corner) corners.push(corner);
			if (isBoundary.has(`${keyOf(v)}|${keyOf(w)}`)) return;
			const line = hypSeg(toP(v), toP(w));
			if (inReach(line, lifted, res, 255 / EDGE_SCALE)) lines.push(line);
		});
		recs.push({
			polyK: vs,
			lines,
			hasA: starActive && pointInPolygon(vs, starK),
			contacts: frac > 0 ? midsP.filter((_, i) => pointInPolygon(vs, insideMids[i])) : [],
			corners,
			x0,
			x1,
			y0,
			y1,
		});
	}

	const nearest = (from: Complex[], q: Complex): Complex => {
		let best = from[0];
		let bd = Infinity;
		for (const c of from) {
			const d = hypDist(q, c);
			if (d < bd) {
				bd = d;
				best = c;
			}
		}
		return best;
	};
	// 128 is exactly 0: the tile centre must decode to the centre, or each of the 2p turned copies of the
	// wedge shades its star body from a slightly different point and the body shows as a fan.
	const q8 = (v: number) => (shape.anchorScale ? Math.max(1, Math.min(255, Math.round((v / shape.anchorScale) * 127) + 128)) : 128);
	const data = new Uint8Array(res * res * 4);
	pts.forEach((q, t) => {
		const K = toK(q);
		let rec: FaceRec | null = null;
		for (const f of recs) {
			if (K.x < f.x0 || K.x > f.x1 || K.y < f.y0 || K.y > f.y1 || !pointInPolygon(f.polyK, K)) continue;
			rec = f;
			break;
		}
		// A texel centre exactly on a junction can miss every face: the star body is the safe default.
		const A = !rec || (rec.hasA && (!rec.contacts.length || hypDist(q, star) <= hypDist(q, nearest(rec.contacts, q))));
		const C = !A && rec!.contacts.length > 0;
		const anchor = A ? star : C ? nearest(rec!.contacts, q) : nearest(rec!.corners.length ? rec!.corners : polyP, q);
		const Q = lifted[t];
		let dist = Infinity;
		for (const line of rec?.lines ?? []) dist = Math.min(dist, segDist(Q, line));
		data[t * 4] = A ? 1 : C ? 3 : 2;
		data[t * 4 + 1] = Math.min(255, Math.round(dist * EDGE_SCALE));
		data[t * 4 + 2] = q8(anchor.x);
		data[t * 4 + 3] = q8(anchor.y);
	});
	return data;
}

/**
 * Bake the STRAP layer of a tile: per texel, the hyperbolic distance to the nearest + strand (R, G) and
 * to the nearest − strand (B, A), 15 bits each over STRAP_RANGE, and in R's top bit whether the two
 * CROSS here. The shader thresholds the distances into band and border, so band width, border width
 * and the flip of the weave need no rebake.
 *
 * The weave is decided inside the tile, and that is enough. Rays 2i and 2i+1 of an edge lean opposite
 * ways; call the first one + (on a crossing offset it leans toward the far vertex, and at offset 0
 * toward the edge's second vertex). The only true crossings of a + and a − strand are between the two
 * rays of ONE edge: at their shared root when the offset is 0, where each continues straight into the
 * neighbouring tile, and at their own crossing point when it is positive. Everywhere else a + ray and
 * a − ray that meet are one strand turning a corner. So + runs over at every crossing, and a strand
 * alternates by itself: it leaves a crossing as a + ray, turns a corner into the − ray of the next
 * edge, and arrives at that edge's crossing underneath. The neighbouring tile, built the same way,
 * agrees on every shared edge.
 *
 * Both distances are stored everywhere, because they are continuous and a pair that switched meaning
 * at the edge of a crossing's neighbourhood would interpolate through every value on the way. Only the
 * flag switches, and it switches where the two bands are apart, so nothing shows.
 */
function strapLayer(shape: TileShape, angleFromNormalRad: number, frac: number, res: number): Uint8Array {
	const { rays, extra } = tileSegments(shape, angleFromNormalRad, frac);
	const { pts } = samples(shape, res);
	const lifted = pts.map(lift);
	// Each ray is measured as if it ran on BEHIND its root, out of the tile. The neighbouring tile holds
	// the strand's other half, and a band that stopped at the root would round off there and pinch the
	// strap at every tile edge. Run straight on, the two halves meet edge to edge: flush where the strand
	// crosses the edge straight, mitred where an offset makes it turn there.
	const strands = rays.map(([a, b]) => {
		let back = 4;
		while (back > 1e-3 && Math.hypot(a.x - back * (b.x - a.x), a.y - back * (b.y - a.y)) > 0.995 * KLEIN_SCALE) back /= 2;
		const seg = hypSeg(toP({ x: a.x - back * (b.x - a.x), y: a.y - back * (b.y - a.y) }), toP(b));
		return inReach(seg, lifted, res, 1) ? seg : null; // a band and its border are well under one unit
	});
	const joins = extra.map(([a, b]) => hypSeg(toP(a), toP(b))).filter((seg) => inReach(seg, lifted, res, 1));
	// Where edge i's pair of rays cross, in the disk: their shared root at offset 0, their own crossing
	// point on a positive offset, nowhere on a split.
	const crossAt = Array.from({ length: shape.real }, (_, i): Complex | null => {
		if (frac < 0) return null;
		const [a, b] = rays[2 * i];
		const [c, d] = rays[2 * i + 1];
		if (frac === 0) return toP(a);
		const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
		if (Math.abs(den) < 1e-12) return null;
		const s = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
		const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
		return s > 0 && s < 1 && u > 0 && u < 1 ? toP({ x: a.x + s * (b.x - a.x), y: a.y + s * (b.y - a.y) }) : null;
	});
	const ends = rays.map(([, b]) => toP(b));
	const gap = (q: Complex, c: Complex) => (q.x - c.x) ** 2 + (q.y - c.y) ** 2;
	const q15 = (hyp: number) => Math.min(32767, Math.round((hyp / STRAP_RANGE) * 32767));
	const data = new Uint8Array(res * res * 4);
	pts.forEach((q, t) => {
		const Q = lifted[t];
		const best = [Infinity, Infinity]; // nearest + strand, nearest − strand
		const edgeOf = [-1, -1];
		strands.forEach((line, r) => {
			if (!line) return;
			const d = segDist(Q, line);
			if (d < best[r & 1]) {
				best[r & 1] = d;
				edgeOf[r & 1] = r >> 1;
			}
		});
		let join = Infinity;
		for (const line of joins) join = Math.min(join, segDist(Q, line));
		// A crossing only where the two nearest strands are one edge's pair AND this texel is nearer their
		// crossing than either one's far end, where each turns a corner into another ray: there the two
		// are one strand again, and an over border drawn across the corner would cut it.
		const e = edgeOf[0];
		const x = e >= 0 && e === edgeOf[1] ? crossAt[e] : null;
		const crossing = !!x && gap(q, x) < Math.min(gap(q, ends[2 * e]), gap(q, ends[2 * e + 1]));
		const plus = q15(Math.min(best[0], join));
		const minus = q15(best[1]);
		data[t * 4] = (crossing ? 128 : 0) | (plus >> 8);
		data[t * 4 + 1] = plus & 255;
		data[t * 4 + 2] = minus >> 8;
		data[t * 4 + 3] = minus & 255;
	});
	return data;
}

/** One Islamic layer: the regular p-gon at edge length `edge` (p = 0 is the apeirogon), `res`² texels. */
export function islamicTileLayer(
	p: number,
	edge: number,
	angleFromNormalRad: number,
	offsetFrac: number,
	res: number,
	kind: IslamicLayerKind = "fill",
): Uint8Array {
	// The offset endpoint is regularised: at EXACTLY 100 % the roots coincide with the tiling vertices
	// and new junctions snap the arrangement topology. 99.8 % keeps the offset-100 look without the pop.
	const frac = Math.min(Math.max(offsetFrac, -0.998), 0.998);
	return (kind === "fill" ? fillLayer : strapLayer)(shapeOf(p, edge), angleFromNormalRad, frac, res);
}

// One layer per (polygon, sliders, resolution), shared by every tiling on the same board.
const layerCache = new Map<string, Uint8Array>();
const CACHE_CAP = 96; // 1 MB each at 512²

/** The Islamic layers of a tiling, stacked in the order of `sizes` (WalkTiling.sizes), for a 2D array texture. */
export function islamicLayers(
	sizes: number[],
	edge: number,
	angleFromNormalRad: number,
	offsetFrac: number,
	res: number,
	kind: IslamicLayerKind = "fill",
): Uint8Array {
	const out = new Uint8Array(sizes.length * res * res * 4);
	sizes.forEach((p, l) => {
		const key = `${kind}|${p}|${edge.toFixed(9)}|${Math.round((angleFromNormalRad * 180) / Math.PI)}|${Math.round(offsetFrac * 100)}|${res}`;
		let layer = layerCache.get(key);
		if (!layer) {
			layer = islamicTileLayer(p, edge, angleFromNormalRad, offsetFrac, res, kind);
			if (layerCache.size >= CACHE_CAP) layerCache.delete(layerCache.keys().next().value!);
			layerCache.set(key, layer);
		}
		out.set(layer, l * res * res * 4);
	});
	return out;
}

const DRAG_RES = 96; // while a slider moves: 10 ms a polygon size, so a notch lands within a few frames
const FULL_RES = 256; // over ONE fundamental region of a tile, so finer than a screen pixel at any useful zoom
const SETTLE_MS = 200; // a still slider re-bakes at full resolution after this quiet window

/** The sidebar's Islamic settings, as the configuration store holds them. */
export interface IslamicSettings {
	isIslamic: boolean;
	islamicStyle: IslamicStyle;
	islamicAngle: number;
	islamicEdgeOffset: number;
	islamicBandWidth: number;
	islamicOutlineWidth: number;
	islamicChirality: boolean;
	islamicFillHueB: number;
	islamicFillHueC: number;
	islamicCheckerHueA: number;
	islamicCheckerHueB: number;
}

/** Keeps a renderer's Islamic layers in step with the sliders: a new setting bakes at once, coarse,
 *  and the same setting refines once it has sat still. One per canvas. */
export class IslamicFeed {
	private key = "";
	private res = 0;
	private at = 0;

	/**
	 * The construction's share of this frame's draw parameters, with the layers brought up to date
	 * first. Spread it into `draw`. `islamic` comes back false when the switch is off or the tiling has
	 * no regular face to decorate.
	 *
	 * Band and border are fractions of half an edge, the length a classic ray runs before it meets its
	 * neighbour, which is the ruler the flat construction uses (the median segment length).
	 */
	frame(
		gl: { setIslamicLayers(data: Uint8Array, res: number): void },
		cfg: IslamicSettings,
		id: string,
		sizes: number[],
		edge: number,
	): Pick<PerPixelDrawParams, "islamic" | "islamicStyle" | "islamicColA" | "islamicColB" | "islamicColC" | "strapBand" | "strapBorder" | "flipWeave"> {
		if (!cfg.isIslamic || !sizes.length) return { islamic: false };
		const style = cfg.islamicStyle;
		const strap = style === "outline" || style === "interlace" || style === "emboss";
		const angle = islamicNormalAngleFromSlider(cfg.islamicAngle);
		const offsetPct = Math.round(islamicEdgeOffsetFrac(cfg.islamicEdgeOffset) * 100);
		const kind: IslamicLayerKind = strap ? "strap" : "fill";
		const key = `${kind}|${id}|${Math.round((angle * 180) / Math.PI)}|${offsetPct}`;
		const now = performance.now();
		const res = this.key !== key ? DRAG_RES : this.res < FULL_RES && now - this.at > SETTLE_MS ? FULL_RES : 0;
		if (res) {
			gl.setIslamicLayers(islamicLayers(sizes, edge, angle, offsetPct / 100, res, kind), res);
			this.key = key;
			this.res = res;
			this.at = now;
		}
		const ruler = edge / 2;
		const checker = style === "checkerboard";
		return {
			islamic: true,
			islamicStyle: style,
			islamicColA: tileHueRgb01(cfg.islamicCheckerHueA),
			islamicColB: tileHueRgb01(checker ? cfg.islamicCheckerHueB : cfg.islamicFillHueB),
			islamicColC: tileHueRgb01(cfg.islamicFillHueC),
			strapBand: (cfg.islamicBandWidth * ruler) / 2,
			strapBorder: (style === "emboss" ? Math.max(cfg.islamicOutlineWidth, EMBOSS_MIN_BORDER) : cfg.islamicOutlineWidth) * ruler,
			flipWeave: cfg.islamicChirality,
		};
	}
}
