// Poincaré-disk hyperbolic tiling geometry. Pure functions (no WebGL, no store) so the maths is
// unit-testable, mirroring lib/utils/canvasPick.ts. The shader (lib/render/hyperbolicShader.ts) folds
// each pixel into the fundamental Schwarz triangle of the (2,p,q) triangle group using the mirror
// parameters computed here; keep the two in lockstep.
//
// For {p,q} the fundamental triangle has angle π/p at the central polygon's centre O, π/q at a polygon
// vertex V, and a right angle at the edge midpoint M. Placing the central p-gon at the disk origin, the
// two straight mirrors are diameters π/p apart and the third mirror is the tile edge — a circle
// orthogonal to the unit circle, centred on the +x axis. All formulas are the standard hyperbolic
// right-triangle identities (Coxeter); distances become Euclidean disk radii via r = tanh(d/2).

import { islamicTipsAngleFromSlider } from "@/utils/islamicNoise";

export interface Complex {
	x: number;
	y: number;
}

/** A {p,q} tiling is hyperbolic iff 1/p + 1/q < 1/2 (Euclidean at equality, spherical above). */
export function isHyperbolic(p: number, q: number): boolean {
	return 1 / p + 1 / q < 0.5;
}

export interface MirrorParams {
	/** Euclidean disk radius from centre to a tile-edge midpoint (the tile inradius). */
	rIn: number;
	/** Euclidean disk radius from centre to a tile vertex (the tile circumradius). */
	rC: number;
	/** Edge-mirror circle: centre distance on the +x axis. */
	edgeA: number;
	/** Edge-mirror circle: radius. Orthogonal to the unit circle (edgeA² = edgeRho² + 1). */
	edgeRho: number;
}

/**
 * Mirror parameters for the central p-gon of a hyperbolic {p,q} tiling, at the disk origin.
 * Throws (rather than returning NaN) when {p,q} is not hyperbolic, so a bad palette entry fails loudly.
 */
export function mirrorParams(p: number, q: number): MirrorParams {
	if (!isHyperbolic(p, q)) {
		throw new RangeError(`{${p},${q}} is not hyperbolic (1/p + 1/q must be < 1/2)`);
	}
	const pp = Math.PI / p;
	const qq = Math.PI / q;
	// Right-angled Schwarz triangle: cosh(inradius) = cos(π/q)/sin(π/p); cosh(circumradius) = cot·cot.
	const dIn = Math.acosh(Math.cos(qq) / Math.sin(pp));
	const dC = Math.acosh((Math.cos(pp) / Math.sin(pp)) * (Math.cos(qq) / Math.sin(qq)));
	const rIn = Math.tanh(dIn / 2);
	const rC = Math.tanh(dC / 2);
	// Orthogonal edge circle: a − ρ = r_in and a² − ρ² = 1 ⇒ a + ρ = 1/r_in.
	const edgeA = (rIn + 1 / rIn) / 2;
	const edgeRho = (1 / rIn - rIn) / 2;
	return { rIn, rC, edgeA, edgeRho };
}

/**
 * The single polygons-in-contact (Hankin) strap segment of a regular {p,q} tiling, in the fundamental
 * Schwarz triangle (upper-half representative). Because the star motif has the tile's full D_p symmetry,
 * one geodesic segment E→P generates the whole pattern under the fold: E = (rIn, 0) is the edge midpoint;
 * the strap leaves E at the contact angle set by the shared `islamicAngle` slider and terminates at P,
 * where it meets the O–V mirror (the diameter at angle π/p). The shader reflects a folded pixel to the
 * upper half and strokes this segment (see lib/render/hyperbolicShader.ts, uStrapE/uStrapP).
 *
 * Angle convention matches the flat REGULAR path via islamicTipsAngleFromSlider (a = π − 2·slider), so
 * the endpoints agree: slider 0° ⇒ P = V (tips on vertices → original tiling); slider 90° ⇒ P = O (tips
 * collapse to the centre → dual tiling). Between the endpoints the strap follows the true hyperbolic
 * geodesic. Derivation and endpoint proofs: docs/superpowers/specs/2026-07-18-hyperbolic-islamic-strapwork-design.md.
 */
export function islamicStrap(p: number, q: number, sliderDeg: number): { E: Complex; P: Complex } {
	const { rIn } = mirrorParams(p, q);
	const E: Complex = { x: rIn, y: 0 };
	const beta = islamicTipsAngleFromSlider(sliderDeg) / 2; // ∈ [0, π/2]
	const sb = Math.sin(beta);
	if (sb < 1e-9) return { E, P: { x: 0, y: 0 } }; // inward-normal limit ⇒ tip at the centre O
	// Geodesic through E with Euclidean (= conformal) tangent (−cos β, sin β): its circle is orthogonal to
	// the unit circle, so the centre κ = E + λ·(sin β, cos β) with λ from 2·κ·E = 1 + rIn² (orthogonality).
	const lambda = (1 - rIn * rIn) / (2 * rIn * sb);
	const kx = rIn + lambda * sb;
	const ky = lambda * Math.cos(beta);
	// Intersect that geodesic with the O–V diameter d = (cos π/p, sin π/p). Substituting X = u·d gives
	// u² − 2u(d·κ) + 1 = 0 (using |κ|² − radius² = 1); the two roots multiply to 1, so take the in-disk one.
	const ang = Math.PI / p;
	const dx = Math.cos(ang), dy = Math.sin(ang);
	const dk = dx * kx + dy * ky;
	const u = dk - Math.sign(dk) * Math.sqrt(Math.max(dk * dk - 1, 0));
	return { E, P: { x: u * dx, y: u * dy } };
}

// --- Geodesic kernel for the general strapwork (uniform + snub) ------------------------------------
// A geodesic is stored as c0·(|z|²+1) + c1·x + c2·y = 0. This ONE form covers both circles orthogonal to
// the unit circle (c0 ≠ 0) and diameters through the origin (c0 = 0), so the strap construction never
// special-cases the two. All three builders are cross products in the (|z|²+1, x, y) coordinate.
export interface Geodesic { c0: number; c1: number; c2: number; }

/** Geodesic through two disk points (cross product of their rows). */
export function geodesicThroughPoints(a: Complex, b: Complex): Geodesic {
	const ra = a.x * a.x + a.y * a.y + 1, rb = b.x * b.x + b.y * b.y + 1;
	return { c0: a.x * b.y - a.y * b.x, c1: a.y * rb - ra * b.y, c2: ra * b.x - a.x * rb };
}

/** Geodesic through `p` whose Euclidean (= conformal) tangent there is `t`. Row 2 encodes tangent ⟂ gradient. */
export function geodesicThroughPointTangent(p: Complex, t: Complex): Geodesic {
	const rp = p.x * p.x + p.y * p.y + 1, pt = 2 * (p.x * t.x + p.y * t.y);
	return { c0: p.x * t.y - p.y * t.x, c1: p.y * pt - rp * t.y, c2: rp * t.x - p.x * pt };
}

/** Unit tangent at `p` of the geodesic p→toward (perpendicular to the conic gradient, oriented toward `toward`). */
export function geodesicTangentAt(p: Complex, toward: Complex): Complex {
	const g = geodesicThroughPoints(p, toward);
	const gx = 2 * g.c0 * p.x + g.c1, gy = 2 * g.c0 * p.y + g.c2; // gradient at p
	let tx = -gy, ty = gx;
	const l = Math.hypot(tx, ty) || 1;
	tx /= l; ty /= l;
	if ((toward.x - p.x) * tx + (toward.y - p.y) * ty < 0) { tx = -tx; ty = -ty; }
	return { x: tx, y: ty };
}

/** In-disk intersection of two geodesics, or null. Both are ⟂ the unit circle, so their radical line runs
 *  through the origin; parametrise it and take the |z| < 1 root (the two roots multiply to 1). */
export function geodesicIntersect(g: Geodesic, h: Geodesic): Complex | null {
	// Two diameters both pass through the origin, so they meet there (radical line vanishes below — handle
	// first). Coincident diameters (proportional (c1,c2)) share no isolated point.
	if (Math.abs(g.c0) < 1e-14 && Math.abs(h.c0) < 1e-14) {
		return Math.abs(g.c1 * h.c2 - g.c2 * h.c1) < 1e-14 ? null : { x: 0, y: 0 };
	}
	const lx = g.c0 * h.c1 - h.c0 * g.c1, ly = g.c0 * h.c2 - h.c0 * g.c2;
	let dx = -ly, dy = lx;
	const dl = Math.hypot(dx, dy);
	if (dl < 1e-14) return null; // parallel or coincident
	dx /= dl; dy /= dl;
	// Solve A·τ² + B·τ + A = 0 along z = τ·(dx,dy), using whichever geodesic is a genuine circle (c0 ≠ 0).
	const use = Math.abs(g.c0) >= 1e-14 ? g : h;
	const A = use.c0, B = use.c1 * dx + use.c2 * dy;
	const disc = B * B - 4 * A * A;
	if (disc < 0) return null;
	const sq = Math.sqrt(disc);
	let best: Complex | null = null, bestR = Infinity;
	for (const tau of [(-B + sq) / (2 * A), (-B - sq) / (2 * A)]) {
		const r = Math.abs(tau);
		if (r < 1 - 1e-9 && r < bestR) { bestR = r; best = { x: tau * dx, y: tau * dy }; }
	}
	return best;
}

/** Point at signed hyperbolic distance `dist` from `from`, along the geodesic toward `toward`. */
export function geodesicMove(from: Complex, toward: Complex, dist: number): Complex {
	const T = su11Translation(from);
	const q0 = su11ApplyInverse(T, toward);
	const l = Math.hypot(q0.x, q0.y);
	if (l < 1e-14) return { x: from.x, y: from.y };
	const r = Math.tanh(dist / 2); // signed: dist < 0 moves the opposite way
	return su11Apply(T, { x: (q0.x / l) * r, y: (q0.y / l) * r });
}

export interface StrapSegment { a: Complex; b: Complex; tile?: number }

// A/B/C fill data for the fold shader: every tile touching the fundamental domain, plus the strapwork with
// each segment TAGGED by the tile it belongs to. The shader classifies a folded pixel by counting crossings
// of the geodesic (tile centre)→pixel against THAT tile's straps only — mixing tile types corrupts the
// parity (the multi-tile blob bug). `centers`/`hues` are parallel; `straps[i].tile` indexes into them.
export interface IslamicTileData { centers: Complex[]; hues: number[]; straps: StrapSegment[] }

/** One polygons-in-contact strap segment inside a regular tile: from contact point `M` (on an edge whose
 *  far vertex is `vertex`), leaving at contact angle β toward the tile interior, to the strap vertex where
 *  it meets the tile-centre→vertex bisector. `offsetFrac` slides the contact off the edge midpoint AWAY from
 *  `vertex` — i.e. the ray leaning toward `vertex` roots on the OPPOSITE side, matching the flat two-point
 *  construction (Polygon.calculateIslamicSegments: "the ray leaning +ê roots at M − d·ê"), so the ray and
 *  its mirror mate cross just off the midpoint. Returns null if the geometry degenerates. */
function tileStrapSegment(midpoint: Complex, center: Complex, vertex: Complex, beta: number, offsetFrac: number): StrapSegment | null {
	let M = midpoint;
	if (offsetFrac > 0) M = geodesicMove(midpoint, vertex, -offsetFrac * hypDist(midpoint, vertex));
	const n = geodesicTangentAt(M, center); // inward normal (toward the tile centre)
	const e = geodesicTangentAt(M, vertex); // along the edge, toward the shared vertex
	const cb = Math.cos(beta), sb = Math.sin(beta);
	const t = { x: cb * n.x + sb * e.x, y: cb * n.y + sb * e.y };
	const S = geodesicIntersect(geodesicThroughPointTangent(M, t), geodesicThroughPoints(center, vertex));
	return S ? { a: M, b: S } : null;
}

/** All strap segments of a hyperbolic tiling in the fundamental fold frame, for the shader to stroke. The
 *  motif is the same regular-tile rosette everywhere (uniform and snub tiles are regular polygons); only
 *  the fold frame differs (uniform reflects to the upper half, snub is chiral — see `strapReflect`). */
export function islamicStrapSegments(spec: WythoffSpec, sliderDeg: number, offsetPct: number = 0): StrapSegment[] {
	const beta = islamicTipsAngleFromSlider(sliderDeg) / 2;
	const offset = Math.min(Math.max(offsetPct, 0), 100) / 100 * 0.98; // 0.98: never quite reach the vertex
	return spec.snub ? snubStrapSegments(spec, beta, offset) : uniformStrapSegments(spec, beta, offset);
}

/** Whether the shader must fold the pixel to the upper-half Schwarz triangle (test (z.x,|z.y|)) before
 *  matching strap segments. Now always false: both uniform (mirror-A twins emitted explicitly) and snub
 *  (chiral) express the full kite pattern directly, so the pixel is tested as-is. Kept as a function so the
 *  canvas/shader contract is explicit and a future fold-based optimisation has a single seam. */
export function strapReflect(_spec: WythoffSpec): boolean {
	return false;
}

// Uniform/Wythoffian (and regular): the three tile regions O, V, E meet at the Wythoff vertex W. Each present
// region borders two tiling edges (its two feet); a foot on mirror X is the midpoint of the edge W—reflect_X(W)
// (see wythoffFeet), so that edge's two endpoints are exactly W and its X-reflection. Emit BOTH rays of the
// edge — one leaning toward each endpoint, each rooted (under offset) on the OPPOSITE side so the contact
// slides ALONG the edge — matching the flat two-point construction. The shader tests z directly; wedge
// rotation + edge inversions replicate the rest. A blanket mirror-A twin was wrong: it is the correct mate
// only for A-crossing edges, which is exactly why multi-tile forms and the offset direction misbehaved.
function uniformStrapSegments(spec: WythoffSpec, beta: number, offset: number): StrapSegment[] {
	const { p, q, rings } = spec;
	const W = wythoffVertex(p, q, rings);
	const feet = wythoffFeet(p, q, rings);
	const corners = schwarzCorners(p, q);
	const { edgeA, edgeRho } = mirrorParams(p, q);
	const has = (c: "O" | "V" | "E") => uniformDescriptor(p, q, rings).tiles.some((t) => t.corner === c);
	// The edge's OTHER endpoint is W reflected across the mirror the foot lies on (A: real axis, B: π/p
	// diameter, C: edge circle) — the same reflections wythoffFeet used to place the foot as their midpoint.
	const otherA = reflectDiameter(W, 0);
	const otherB = reflectDiameter(W, Math.PI / p);
	const otherC = reflectEdgeCircle(W, edgeA, edgeRho);
	const edges: Array<{ center: Complex; foot: Complex; other: Complex }> = [];
	if (has("O")) edges.push({ center: corners.O, foot: feet.fA, other: otherA }, { center: corners.O, foot: feet.fB, other: otherB });
	if (has("V")) edges.push({ center: corners.V, foot: feet.fB, other: otherB }, { center: corners.V, foot: feet.fC, other: otherC });
	if (has("E")) edges.push({ center: corners.E, foot: feet.fA, other: otherA }, { center: corners.E, foot: feet.fC, other: otherC });
	const present = (f: Complex) => (f.x - W.x) ** 2 + (f.y - W.y) ** 2 > 1e-8; // foot ≠ W ⇒ that edge exists
	const segs: StrapSegment[] = [];
	for (const e of edges) {
		if (!present(e.foot)) continue;
		for (const vertex of [W, e.other]) {
			const seg = tileStrapSegment(e.foot, e.center, vertex, beta, offset);
			if (seg) segs.push(seg);
		}
	}
	return segs;
}

// Snub sr{p,q}: chiral, no mirror. Enumerate the tiles touching the central kite — the p-gon (centre O),
// the q-gon (centre V), and the three snub triangles about s — and emit a strap segment from every edge
// midpoint toward BOTH of the edge's endpoint vertices (no reflection to generate the second ray).
function snubStrapSegments(spec: WythoffSpec, beta: number, offset: number): StrapSegment[] {
	const { p, q } = spec;
	const s = snubData(p, q);
	const O: Complex = { x: 0, y: 0 };
	const V = schwarzCorners(p, q).V;
	// Each tile as (centre, ordered vertex ring). p-gon/q-gon: the two edges at s (both, since the kite's
	// edge could be either); triangles: the full 3-cycle.
	const tiles: Array<{ center: Complex; verts: Complex[]; closed: boolean }> = [
		{ center: O, verts: [s.ais, s.s, s.as], closed: false },
		{ center: V, verts: [s.bis, s.s, s.bs], closed: false },
		{ center: hypCentroid([s.s, s.as, s.bis]), verts: [s.s, s.as, s.bis], closed: true },
		{ center: hypCentroid([s.s, s.ais, s.n]), verts: [s.s, s.ais, s.n], closed: true },
		{ center: hypCentroid([s.s, s.n, s.bs]), verts: [s.s, s.n, s.bs], closed: true },
	];
	const segs: StrapSegment[] = [];
	for (const tile of tiles) {
		const n = tile.verts.length;
		const edges = tile.closed ? n : n - 1;
		for (let i = 0; i < edges; i++) {
			const u = tile.verts[i], v = tile.verts[(i + 1) % n];
			const M = hypMidpoint(u, v);
			for (const vertex of [u, v]) {
				const seg = tileStrapSegment(M, tile.center, vertex, beta, offset);
				if (seg) segs.push(seg);
			}
		}
	}
	return segs;
}

// ── Per-tile TAGGED strap data for the A/B/C fold-shader fill ────────────────────────────────────────
// Moved to lib/render/hyperbolicIslamicPatch.ts (uniformIslamicData / snubIslamicData): the tile data now
// builds each fundamental tile as a real regular polygon (Wythoff-vertex orbit) and runs the faithful
// constructTileStraps on it — the same per-tile rosette the regular path, the flat Polygon.calculateIslamicSegments,
// and the spherical buildIslamicPattern use. The earlier Wythoff-foot builder here emitted only the two edges
// at the generating vertex, so the rosette never closed (broken chevrons, bare tiles showing through).

/**
 * Map the accumulated pixel pan `offset` to a disk-translation vector `b` (|b| < 1). The magnitude is
 * tanh-compressed so unbounded dragging approaches the disk boundary (content rushes in) without ever
 * leaving the disk; direction is preserved. `R` is the disk radius in px, `kappa` a drag-sensitivity knob.
 * y-sign / disk-vs-screen orientation is handled by the caller (the shader) — this is pure magnitude+dir.
 */
export function panToB(offset: Complex, R: number, kappa: number): Complex {
	const len = Math.hypot(offset.x, offset.y);
	if (len < 1e-12) return { x: 0, y: 0 };
	// tanh(huge) rounds to exactly 1.0 in float; clamp just inside so b stays a valid disk point.
	const mag = Math.min(Math.tanh(len / (kappa * R)), 0.9999);
	return { x: (offset.x / len) * mag, y: (offset.y / len) * mag };
}

function cmul(a: Complex, b: Complex): Complex {
	return { x: a.x * b.x - a.y * b.y, y: a.x * b.y + a.y * b.x };
}

function cdiv(a: Complex, b: Complex): Complex {
	const d = b.x * b.x + b.y * b.y;
	return { x: (a.x * b.x + a.y * b.y) / d, y: (a.y * b.x - a.x * b.y) / d };
}

const cadd = (a: Complex, b: Complex): Complex => ({ x: a.x + b.x, y: a.y + b.y });
const csub = (a: Complex, b: Complex): Complex => ({ x: a.x - b.x, y: a.y - b.y });
const cconj = (a: Complex): Complex => ({ x: a.x, y: -a.y });

// A disk isometry as an SU(1,1) element, acting by z ↦ (a·z + b)/(b̄·z + ā), with |a|²−|b|² = 1. The
// view of the hyperbolic canvas is one of these; panning composes small translations into it
// incrementally (matrix product), which keeps a fixed pixel-drag locally consistent everywhere in the
// disk — unlike deriving a translation from the total accumulated offset, which blows up near the rim.
export interface Su11 {
	a: Complex;
	b: Complex;
}

export function su11Identity(): Su11 {
	return { a: { x: 1, y: 0 }, b: { x: 0, y: 0 } };
}

/** Matrix product of two SU(1,1) elements — the composition of the two isometries. */
export function su11Mul(m: Su11, n: Su11): Su11 {
	return {
		a: cadd(cmul(m.a, n.a), cmul(m.b, cconj(n.b))),
		b: cadd(cmul(m.a, n.b), cmul(m.b, cconj(n.a))),
	};
}

/** The hyperbolic translation moving the origin to `delta` (|delta| < 1). */
export function su11Translation(delta: Complex): Su11 {
	const s = Math.sqrt(Math.max(1 - (delta.x * delta.x + delta.y * delta.y), 1e-12));
	return { a: { x: 1 / s, y: 0 }, b: { x: delta.x / s, y: delta.y / s } };
}

/** Rotation of the disk about the origin by `theta` (z ↦ e^{iθ}·z). */
export function su11Rotation(theta: number): Su11 {
	const h = theta / 2;
	return { a: { x: Math.cos(h), y: Math.sin(h) }, b: { x: 0, y: 0 } };
}

/** Forward action z ↦ (a·z + b)/(b̄·z + ā). */
export function su11Apply(m: Su11, z: Complex): Complex {
	return cdiv(cadd(cmul(m.a, z), m.b), cadd(cmul(cconj(m.b), z), cconj(m.a)));
}

/** Inverse action: the inverse of [[a,b],[b̄,ā]] (det 1) is [[ā,−b],[−b̄,a]]. */
export function su11ApplyInverse(m: Su11, z: Complex): Complex {
	const num = csub(cmul(cconj(m.a), z), m.b);
	const den = cadd(cmul({ x: -m.b.x, y: m.b.y }, z), m.a); // (−b̄)·z + a
	return cdiv(num, den);
}

/** Rescale so |a|²−|b|² = 1 exactly, undoing float drift after many compositions. */
export function su11Normalize(m: Su11): Su11 {
	const det = m.a.x * m.a.x + m.a.y * m.a.y - (m.b.x * m.b.x + m.b.y * m.b.y);
	const s = Math.sqrt(Math.max(det, 1e-12));
	return { a: { x: m.a.x / s, y: m.a.y / s }, b: { x: m.b.x / s, y: m.b.y / s } };
}

/** Inverse of an SU(1,1) element: [[a,b],[b̄,ā]]⁻¹ = [[ā,−b],[−b̄,a]]. */
export function su11Inverse(m: Su11): Su11 {
	return { a: cconj(m.a), b: { x: -m.b.x, y: -m.b.y } };
}

/**
 * The orientation-preserving symmetry that crosses the reference edge geodesic (circle centre (edgeA,0),
 * radius edgeRho): it maps the +x edge-neighbour tile back onto the central tile, sending the origin to
 * the neighbour centre 1/edgeA. Derived as (edge inversion ∘ x-axis reflection), which is holomorphic;
 * in SU(1,1) form a = i·edgeA/edgeRho, b = −i/edgeRho (|a|²−|b|² = (edgeA²−1)/edgeRho² = 1).
 */
export function su11CrossEdge(edgeA: number, edgeRho: number): Su11 {
	return { a: { x: 0, y: edgeA / edgeRho }, b: { x: 0, y: -1 / edgeRho } };
}

/**
 * Re-base the view so the tiling's central tile is the one under the screen centre. Folds the world point
 * at the screen centre (V⁻¹(0)) back to the central tile through the {p,q} symmetry group and absorbs
 * that symmetry into the view — the image is unchanged, but |V⁻¹(0)| is bounded by a tile radius however
 * far the user has panned. This is the hyperbolic analogue of the Euclidean lattice wrap: it stops the
 * SU(1,1) matrix entries from growing without bound, so float precision never degrades. It also makes the
 * fold's step count measure distance from the SCREEN-centre tile (used for the per-tile depth colour).
 */
export function su11Rebase(
	view: Su11,
	p: number,
	edgeA: number,
	edgeRho: number,
	maxIter = 64,
): { view: Su11; steps: number } {
	const wedge = (2 * Math.PI) / p;
	const cross = su11CrossEdge(edgeA, edgeRho);
	const rho2 = edgeRho * edgeRho;
	let v = view;
	let steps = 0;
	for (let i = 0; i < maxIter; i++) {
		// World point currently at the screen centre: V⁻¹(0) = −b/a.
		const w = cdiv({ x: -v.b.x, y: -v.b.y }, v.a);
		if (w.x * w.x + w.y * w.y < 1e-18) break; // already dead-centre (guards atan2(-0,-0) = −π)
		const m = Math.round(Math.atan2(w.y, w.x) / wedge);
		const rot = su11Rotation(-wedge * m);
		const zr = su11Apply(rot, w);
		const dx = zr.x - edgeA, dy = zr.y;
		const crossed = dx * dx + dy * dy < rho2;
		if (m === 0 && !crossed) break; // already in the central tile
		let g = rot;
		if (crossed) {
			g = su11Mul(cross, rot);
			steps++;
		}
		v = su11Normalize(su11Mul(v, su11Inverse(g)));
	}
	return { view: v, steps };
}

/**
 * The world-space centre of the {p,q} tile containing world point `w`. Folds `w` back to the central tile
 * (rotations + edge crossings), accumulating the symmetry g with g(w) in the central tile, then returns
 * g⁻¹(0) — the pre-image of the central tile's centre, i.e. `w`'s own tile centre. Used by click-to-centre.
 */
export function foldTileCenter(w: Complex, p: number, edgeA: number, edgeRho: number, maxIter = 64): Complex {
	const wedge = (2 * Math.PI) / p;
	const cross = su11CrossEdge(edgeA, edgeRho);
	const rho2 = edgeRho * edgeRho;
	let z: Complex = { x: w.x, y: w.y };
	let g = su11Identity();
	for (let i = 0; i < maxIter; i++) {
		if (z.x * z.x + z.y * z.y < 1e-18) break;
		const m = Math.round(Math.atan2(z.y, z.x) / wedge);
		const rot = su11Rotation(-wedge * m);
		const zr = su11Apply(rot, z);
		g = su11Mul(rot, g);
		z = zr;
		const dx = zr.x - edgeA, dy = zr.y;
		if (dx * dx + dy * dy < rho2) {
			z = su11Apply(cross, zr);
			g = su11Mul(cross, g);
		} else {
			break; // in the central tile
		}
	}
	return su11Apply(su11Inverse(g), { x: 0, y: 0 });
}

/**
 * Click-to-anchor snap point for a click at world point `w`: the nearest REAL feature of the uniform tiling —
 * a tile centroid (corners O / V / E, only the occupied ones), a vertex (the single Wythoff-vertex orbit), or
 * an edge midpoint (a perpendicular foot of W, i.e. the halfway point of a tiling edge, INCLUDING an edge
 * between two different tile types). Folds `w` into the central {p,q} cell, builds every feature incident to
 * that cell as the dihedral-D_p orbit about O of the base points, maps them back through the fold's inverse,
 * and returns the closest to `w`. Features are shared between adjacent tiles, so the returned world point is
 * the same whichever cell `w` folds to. Snub tilings (chiral, rotation-subgroup only) keep the earlier
 * regular-{p,q} centre/vertex/edge-midpoint approximation — their real feet/vertices live on a different path.
 */
export function pickClickAnchor(w: Complex, g: HyperbolicUniformValues, maxIter = 64): Complex {
	const { p, edgeA, edgeRho } = g;
	const wedge = (2 * Math.PI) / p;
	const cross = su11CrossEdge(edgeA, edgeRho);
	const rho2 = edgeRho * edgeRho;
	// Fold `w` into the central p-gon cell (rotations by 2π/p about O + edge crossings). Valid for every tiling
	// in the (2,p,q) family, snub included, since `cross` is a rotation-subgroup element (two reflections).
	let z: Complex = { x: w.x, y: w.y };
	let fold = su11Identity();
	for (let i = 0; i < maxIter; i++) {
		if (z.x * z.x + z.y * z.y < 1e-18) break;
		const m = Math.round(Math.atan2(z.y, z.x) / wedge);
		const rot = su11Rotation(-wedge * m);
		z = su11Apply(rot, z);
		fold = su11Mul(rot, fold);
		if ((z.x - edgeA) * (z.x - edgeA) + z.y * z.y < rho2) {
			z = su11Apply(cross, z);
			fold = su11Mul(cross, fold);
		} else {
			break;
		}
	}
	const foldInv = su11Inverse(fold);

	// Base features in the central-cell frame (the fundamental wedge). Non-snub: the actual uniform-tiling
	// features — occupied tile centroids O/V/E, the Wythoff vertex W, and the real edge midpoints (a foot
	// carries an edge only when it is distinct from W). Snub: the regular-{p,q} approximation, whose D_p orbit
	// below reproduces the previous centre + p vertices (r_c) + p edge midpoints (r_in) candidate set exactly.
	const base: Complex[] = [];
	if (g.snub) {
		base.push({ x: 0, y: 0 });
		base.push({ x: g.rIn, y: 0 });
		base.push({ x: g.rC * Math.cos(Math.PI / p), y: g.rC * Math.sin(Math.PI / p) });
	} else {
		const W = g.wythoff;
		if (g.occ[0]) base.push({ x: 0, y: 0 }); // O — p-gon centroid
		if (g.occ[1]) base.push(g.cornerV); // V — q-gon centroid
		if (g.occ[2]) base.push({ x: g.rIn, y: 0 }); // E — square centroid
		base.push(W); // the single vertex orbit
		for (const foot of [g.footA, g.footB, g.footC]) {
			// A foot is a real edge midpoint only when W lies off that mirror (foot ≠ W); matches the shader.
			if ((foot.x - W.x) ** 2 + (foot.y - W.y) ** 2 > 1e-8) base.push(foot);
		}
	}

	// Dihedral-D_p orbit about O (p rotations × the mirror-A reflection) of every base feature fills the central
	// cell with all its incident copies, so the true nearest feature to a point inside the cell is a candidate.
	let best: Complex = base[0];
	let bestD = Infinity;
	for (const f of base) {
		for (let s = 0; s < 2; s++) {
			const bx = f.x;
			const by = s === 0 ? f.y : -f.y; // reflect across mirror A (the real axis)
			for (let k = 0; k < p; k++) {
				const c = Math.cos(wedge * k);
				const sn = Math.sin(wedge * k);
				const world = su11Apply(foldInv, { x: c * bx - sn * by, y: sn * bx + c * by });
				const d = (world.x - w.x) ** 2 + (world.y - w.y) ** 2;
				if (d < bestD) {
					bestD = d;
					best = world;
				}
			}
		}
	}
	return best;
}

/** Disk automorphism M(z) = e^{iθ}·(z + b)/(1 + conj(b)·z). Maps the unit disk to itself for |b| < 1. */
export function mobius(z: Complex, b: Complex, theta: number): Complex {
	const num: Complex = { x: z.x + b.x, y: z.y + b.y };
	const conjB: Complex = { x: b.x, y: -b.y };
	const den: Complex = { x: 1 + (conjB.x * z.x - conjB.y * z.y), y: conjB.x * z.y + conjB.y * z.x };
	const frac = cdiv(num, den);
	const c = Math.cos(theta), s = Math.sin(theta);
	return { x: c * frac.x - s * frac.y, y: s * frac.x + c * frac.y };
}

/** Inverse of `mobius`: z = (w' − b)/(1 − conj(b)·w'), with w' = e^{−iθ}·w. */
export function mobiusInverse(w: Complex, b: Complex, theta: number): Complex {
	const c = Math.cos(theta), s = Math.sin(theta);
	// w' = e^{-iθ} w
	const wp: Complex = { x: c * w.x + s * w.y, y: -s * w.x + c * w.y };
	const conjB: Complex = { x: b.x, y: -b.y };
	const num: Complex = { x: wp.x - b.x, y: wp.y - b.y };
	const cbw = cmul(conjB, wp);
	const den: Complex = { x: 1 - cbw.x, y: -cbw.y };
	return cdiv(num, den);
}

// ── Uniform (Wythoffian) hyperbolic tilings ─────────────────────────────────────────────────────
// The regular {p,q} above is one point in a family: the uniform tilings of the (2,p,q) triangle group,
// obtained by ringing subsets of the three mirrors (Coxeter–Dynkin, linear diagram A—p—B—q—C). Every
// such tiling shares the same fundamental Schwarz triangle T (corners O, V, E below) and the same fold;
// only which polygons fill T, and where the generating vertex sits, change. All pure + testable here.

/** Coxeter–Dynkin ring flags on the linear diagram A—p—B—q—C (A face mirror, B edge mirror, C vertex mirror). */
export type Rings = [boolean, boolean, boolean];

/** A hyperbolic tiling's identity: the triangle group {p,q} + which mirrors are ringed (+ snub). Regular = [1,0,0]. */
export interface WythoffSpec {
	p: number;
	q: number;
	rings: Rings;
	snub?: boolean;
}

export interface WythoffFaces {
	/** face at corner O (p-fold centre), 0 if none */ nO: number;
	/** face at corner V (q-fold vertex), 0 if none */ nV: number;
	/** face at corner E (order-2 edge midpoint), 0 if none */ nE: number;
}

/**
 * Side counts of the faces centred at the three Schwarz-triangle corners of the uniform tiling with the
 * given ring pattern. A corner where both incident mirrors are ringed carries a 2·order-gon (truncation);
 * exactly one ringed carries an order-gon; none carries no face. The order-2 corner E degenerates: a lone
 * ring there is a 2-gon (an edge, not a face), so E only carries a genuine square when both A and C ring.
 */
export function wythoffFaces(p: number, q: number, rings: Rings): WythoffFaces {
	const [a, b, c] = rings;
	const nO = a && b ? 2 * p : a || b ? p : 0;
	const nV = b && c ? 2 * q : b || c ? q : 0;
	const nE = a && c ? 4 : 0;
	return { nO, nV, nE };
}

export interface SchwarzCorners { O: Complex; V: Complex; E: Complex; }

/** The three Poincaré-disk corners of the {p,q} fundamental Schwarz triangle (same frame as mirrorParams). */
export function schwarzCorners(p: number, q: number): SchwarzCorners {
	const { rIn, rC } = mirrorParams(p, q);
	const a = Math.PI / p;
	return { O: { x: 0, y: 0 }, E: { x: rIn, y: 0 }, V: { x: rC * Math.cos(a), y: rC * Math.sin(a) } };
}

/** Hyperbolic distance between two Poincaré-disk points. */
export function hypDist(u: Complex, v: Complex): number {
	const dx = u.x - v.x, dy = u.y - v.y;
	const num = dx * dx + dy * dy;
	const du = 1 - (u.x * u.x + u.y * u.y);
	const dv = 1 - (v.x * v.x + v.y * v.y);
	return Math.acosh(1 + (2 * num) / (du * dv));
}

/** Reflect a disk point across the diameter through the origin at angle `ang`. */
export function reflectDiameter(z: Complex, ang: number): Complex {
	const c = Math.cos(2 * ang), s = Math.sin(2 * ang);
	return { x: c * z.x + s * z.y, y: s * z.x - c * z.y };
}

/** Reflect a disk point across the edge geodesic — inversion in the circle (cx,0), radius rho. */
export function reflectEdgeCircle(z: Complex, cx: number, rho: number): Complex {
	const dx = z.x - cx, dy = z.y;
	const d2 = dx * dx + dy * dy || 1e-18;
	const k = (rho * rho) / d2;
	return { x: cx + k * dx, y: k * dy };
}

/** Hyperbolic distance from a disk point to a mirror geodesic (0 on the mirror). Half the distance to its reflection. */
function distToMirror(z: Complex, mirror: "A" | "B" | "C", p: number, edgeA: number, edgeRho: number): number {
	const r =
		mirror === "A" ? reflectDiameter(z, 0)
		: mirror === "B" ? reflectDiameter(z, Math.PI / p)
		: reflectEdgeCircle(z, edgeA, edgeRho);
	return 0.5 * hypDist(z, r);
}

// Scan [0,1] for the first sign change of f∘pt, then bisect that bracket. Robust to multiple roots and to
// f not being sign-definite at the endpoints. Returns the endpoint of least |f| if f never changes sign.
function findRoot(pt: (t: number) => Complex, f: (z: Complex) => number): Complex {
	const N = 512;
	let prev = f(pt(0));
	let lo = 0, hi = 1, bracketed = false;
	for (let i = 1; i <= N; i++) {
		const t = i / N;
		const ft = f(pt(t));
		if (prev === 0) return pt((i - 1) / N);
		if (prev * ft < 0) { lo = (i - 1) / N; hi = t; bracketed = true; break; }
		prev = ft;
	}
	if (!bracketed) return Math.abs(f(pt(0))) <= Math.abs(f(pt(1))) ? pt(0) : pt(1);
	for (let i = 0; i < 60; i++) {
		const mid = (lo + hi) / 2;
		if (f(pt(lo)) * f(pt(mid)) <= 0) hi = mid; else lo = mid;
	}
	return pt((lo + hi) / 2);
}

/**
 * The Wythoff generating vertex for `rings`: the point lying ON every unringed mirror and equidistant from
 * the ringed ones. One ring ⇒ a corner (intersection of the two unringed mirrors). Two rings ⇒ a point on
 * the single unringed mirror, found by 1-D root-finding the equidistance condition. Three rings (omnitruncated)
 * ⇒ the incenter, found by descending the variance of the three mirror distances. Exact enough for rendering.
 */
export function wythoffVertex(p: number, q: number, rings: Rings): Complex {
	const [a, b, c] = rings;
	const { rIn, edgeA, edgeRho } = mirrorParams(p, q);
	const corners = schwarzCorners(p, q);
	const dA = (z: Complex) => distToMirror(z, "A", p, edgeA, edgeRho);
	const dB = (z: Complex) => distToMirror(z, "B", p, edgeA, edgeRho);
	const dC = (z: Complex) => distToMirror(z, "C", p, edgeA, edgeRho);

	// One ring: W is where the two unringed mirrors meet.
	if (a && !b && !c) return corners.V; // unringed B,C ⇒ B∩C = V
	if (!a && !b && c) return corners.O; // unringed A,B ⇒ A∩B = O   (regular {q,p}; unused, kept for totality)
	if (!a && b && !c) return { x: rIn, y: 0 }; // unringed A,C ⇒ A∩C = E (rectified)

	// Two rings: root-find on the one unringed mirror.
	if (a && b && !c) {
		// truncated: on C (edge circle), on the A|B bisector diameter (angle π/2p). Intersect ray with the circle.
		const ang = Math.PI / (2 * p);
		return findRoot(
			(t) => ({ x: t * Math.cos(ang), y: t * Math.sin(ang) }),
			(z) => Math.hypot(z.x - edgeA, z.y) - edgeRho,
		);
	}
	if (!a && b && c) {
		// trunc-dual: on A (real axis), equidistant from B and C.
		return findRoot((t) => ({ x: t * 0.999, y: 0 }), (z) => dB(z) - dC(z));
	}
	if (a && !b && c) {
		// rhombi: on B (π/p diameter), equidistant from A and C.
		const ang = Math.PI / p;
		return findRoot((t) => ({ x: t * 0.999 * Math.cos(ang), y: t * 0.999 * Math.sin(ang) }), (z) => dA(z) - dC(z));
	}

	// Three rings (omnitruncated): incenter — equidistant from all three mirrors. Coarse-to-fine search over
	// barycentric coordinates on the Euclidean corner triangle (which contains the smaller hyperbolic one),
	// minimising the variance of the three mirror distances. Bounded, so it cannot diverge outside T like a
	// free gradient step can.
	const { O, V, E } = corners;
	const bary = (u: number, v: number): Complex => ({
		x: O.x + u * (V.x - O.x) + v * (E.x - O.x),
		y: O.y + u * (V.y - O.y) + v * (E.y - O.y),
	});
	const variance = (z: Complex): number => {
		const x0 = dA(z), x1 = dB(z), x2 = dC(z);
		const m = (x0 + x1 + x2) / 3;
		return (x0 - m) ** 2 + (x1 - m) ** 2 + (x2 - m) ** 2;
	};
	let bu = 1 / 3, bv = 1 / 3, span = 1 / 3;
	for (let iter = 0; iter < 44; iter++) {
		let best = Infinity, nu = bu, nv = bv;
		for (let i = -4; i <= 4; i++) {
			for (let j = -4; j <= 4; j++) {
				const u = bu + (i / 4) * span, v = bv + (j / 4) * span;
				if (u <= 1e-6 || v <= 1e-6 || u + v >= 1 - 1e-6) continue;
				const val = variance(bary(u, v));
				if (val < best) { best = val; nu = u; nv = v; }
			}
		}
		bu = nu; bv = nv; span *= 0.5;
	}
	return bary(bu, bv);
}

/** Stable hue (degrees) for an n-gon, so a given polygon reads the same colour across tilings. */
export function tileHue(sides: number): number {
	return (((sides * 47) % 360) + 360) % 360;
}

export interface UniformTile { corner: "O" | "V" | "E"; sides: number; hue: number; }
export interface UniformDescriptor {
	p: number;
	q: number;
	rings: Rings;
	wythoff: Complex;
	corners: SchwarzCorners;
	tiles: UniformTile[]; // only corners that carry a face
}

/** Full derived descriptor a renderer needs for a non-snub uniform {p,q} tiling. */
export function uniformDescriptor(p: number, q: number, rings: Rings): UniformDescriptor {
	const f = wythoffFaces(p, q, rings);
	const corners = schwarzCorners(p, q);
	const tiles: UniformTile[] = [];
	if (f.nO > 0) tiles.push({ corner: "O", sides: f.nO, hue: tileHue(f.nO) });
	if (f.nV > 0) tiles.push({ corner: "V", sides: f.nV, hue: tileHue(f.nV) });
	if (f.nE > 0) tiles.push({ corner: "E", sides: f.nE, hue: tileHue(f.nE) });
	return { p, q, rings, wythoff: wythoffVertex(p, q, rings), corners, tiles };
}

/** Everything the Poincaré-disk shader needs for one tiling, derived from its Wythoff spec. Shared by the
 * interactive canvas and the static thumbnail so the two render paths cannot drift. */
export interface HyperbolicUniformValues {
	p: number;
	q: number;
	edgeA: number;
	edgeRho: number;
	rIn: number;
	rC: number;
	nTiles: number;
	wythoff: Complex;
	footA: Complex;
	footB: Complex;
	footC: Complex;
	cornerV: Complex;
	occ: [number, number, number]; // 1/0 occupancy of faces at corners O, V, E
	tileHue: [number, number, number]; // hue (deg) of faces at O, V, E — OR, for snub, [p-gon, q-gon, triangle]
	hue: number; // single-hue fallback (uNTiles==1 path / uHue)
	snub: SnubData | null; // present for snub tilings; drives the separate rotation-subgroup shader path
	snubQDistinct: boolean; // q ≥ 4 ⇒ the q-gon is a distinct tile type; q = 3 ⇒ it is another triangle
}

export function hyperbolicUniformValues(spec: WythoffSpec): HyperbolicUniformValues {
	const { p, q, rings } = spec;
	const mp = mirrorParams(p, q);
	const desc = uniformDescriptor(p, q, rings);
	const feet = wythoffFeet(p, q, rings);
	const hueByCorner = (c: "O" | "V" | "E") => desc.tiles.find((t) => t.corner === c)?.hue ?? 0;
	const occ: [number, number, number] = [
		desc.tiles.some((t) => t.corner === "O") ? 1 : 0,
		desc.tiles.some((t) => t.corner === "V") ? 1 : 0,
		desc.tiles.some((t) => t.corner === "E") ? 1 : 0,
	];
	if (spec.snub) {
		// Snub: distinct tile types are the p-gon, the q-gon (only when q ≥ 4 — for q = 3 it is an equilateral
		// triangle indistinguishable from the snub triangles), and the triangle. Hues by side count, as usual.
		const snub = snubData(p, q);
		const qDistinct = q >= 4;
		return {
			p,
			q,
			edgeA: mp.edgeA,
			edgeRho: mp.edgeRho,
			rIn: mp.rIn,
			rC: mp.rC,
			nTiles: qDistinct ? 3 : 2,
			wythoff: desc.wythoff,
			footA: feet.fA,
			footB: feet.fB,
			footC: feet.fC,
			cornerV: desc.corners.V,
			occ,
			tileHue: [tileHue(p), tileHue(q), tileHue(3)],
			hue: tileHue(p),
			snub,
			snubQDistinct: qDistinct,
		};
	}
	return {
		p,
		q,
		edgeA: mp.edgeA,
		edgeRho: mp.edgeRho,
		rIn: mp.rIn,
		rC: mp.rC,
		nTiles: desc.tiles.length,
		wythoff: desc.wythoff,
		footA: feet.fA,
		footB: feet.fB,
		footC: feet.fC,
		cornerV: desc.corners.V,
		occ,
		tileHue: [hueByCorner("O"), hueByCorner("V"), hueByCorner("E")],
		hue: desc.tiles[0]?.hue ?? 0,
		snub: null,
		snubQDistinct: false,
	};
}

/** A hyperbolic rotation by `theta` about disk point `center`, as an SU(1,1) element. */
function su11RotationAbout(center: Complex, theta: number): Su11 {
	const T = su11Translation(center);
	return su11Mul(su11Mul(T, su11Rotation(theta)), su11Inverse(T));
}

export interface SnubData {
	/** The snub generating vertex (off all mirrors — chiral). */ s: Complex;
	/** s rotated +2π/p about O (a p-gon neighbour). */ as: Complex;
	/** s rotated −2π/p about O (the other p-gon neighbour). */ ais: Complex;
	/** s rotated +2π/q about V (a q-gon neighbour). */ bs: Complex;
	/** s rotated −2π/q about V (the other q-gon neighbour). */ bis: Complex;
	/** The 5th neighbour, s rotated π about the edge midpoint E (= b·a·s) — the triangle–triangle edge. */ n: Complex;
	/** s rotated +4π/q about V (= b²·s) — the q-gon vertex opposite s, for the far square edges (q ≥ 4). */ b2s: Complex;
	/** The common edge length (p-gon = q-gon = snub-triangle). */ edge: number;
}

/**
 * The snub tiling sr{p,q} is the alternation of the omnitruncated tr{p,q}: chiral, generated by the
 * ROTATION subgroup only (no reflections). Its one vertex orbit is the snub point `s`, chosen so the p-gon
 * (orbit of s under the p-fold rotation about O), the q-gon (orbit under the q-fold about V), and the snub
 * triangle {s, as, b⁻¹s} all have equal edge length. Found by a bounded coarse-to-fine search over the
 * Schwarz triangle (the same robust method as the incenter). Verified: all three edge lengths agree to
 * machine precision (see tests). Returns s and its four polygon-neighbours, which the shader uses to test
 * p-gon / q-gon membership.
 */
export function snubData(p: number, q: number): SnubData {
	const O: Complex = { x: 0, y: 0 };
	const corners = schwarzCorners(p, q);
	const V = corners.V, E = corners.E;
	const A = su11RotationAbout(O, (2 * Math.PI) / p), Ai = su11Inverse(A);
	const B = su11RotationAbout(V, (2 * Math.PI) / q), Bi = su11Inverse(B);
	const C2 = su11RotationAbout(corners.E, Math.PI); // π-rotation about the edge midpoint (the 2-fold centre)
	const ap = (z: Complex) => su11Apply(A, z);
	const aip = (z: Complex) => su11Apply(Ai, z);
	const bp = (z: Complex) => su11Apply(B, z);
	const bip = (z: Complex) => su11Apply(Bi, z);
	const bary = (u: number, v: number): Complex => ({ x: u * V.x + v * E.x, y: u * V.y + v * E.y });
	// p-gon edge = q-gon edge = snub-triangle third edge (between a p-gon and a q-gon neighbour).
	const cost = (z: Complex): number => {
		const Lp = hypDist(z, ap(z)), Lq = hypDist(z, bp(z)), Lt = hypDist(ap(z), bip(z));
		return (Lp - Lq) ** 2 + (Lp - Lt) ** 2;
	};
	let bu = 1 / 3, bv = 1 / 3, span = 1 / 3;
	for (let iter = 0; iter < 60; iter++) {
		let best = Infinity, nu = bu, nv = bv;
		for (let i = -5; i <= 5; i++) {
			for (let j = -5; j <= 5; j++) {
				const u = bu + (i / 5) * span, v = bv + (j / 5) * span;
				if (u <= 1e-6 || v <= 1e-6 || u + v >= 1 - 1e-6) continue;
				const val = cost(bary(u, v));
				if (val < best) { best = val; nu = u; nv = v; }
			}
		}
		bu = nu; bv = nv; span *= 0.6;
	}
	const s = bary(bu, bv);
	return { s, as: ap(s), ais: aip(s), bs: bp(s), bis: bip(s), n: su11Apply(C2, s), b2s: bp(bp(s)), edge: hypDist(s, ap(s)) };
}

/** Hyperbolic midpoint of two Poincaré-disk points (the point on the geodesic uv at half the distance). */
export function hypMidpoint(u: Complex, v: Complex): Complex {
	const T = su11Translation(u); // sends 0 → u; its inverse sends u → 0
	const v0 = su11ApplyInverse(T, v);
	const len = Math.hypot(v0.x, v0.y);
	if (len < 1e-12) return { x: u.x, y: u.y };
	const rMid = Math.tanh(0.5 * Math.atanh(Math.min(len, 1 - 1e-15)));
	const m0 = { x: (v0.x / len) * rMid, y: (v0.y / len) * rMid };
	return su11Apply(T, m0);
}

export interface WythoffFeet {
	/** foot of the perpendicular from W onto mirror A (real axis) — endpoint of the O|E tile edge */ fA: Complex;
	/** foot onto mirror B (π/p diameter) — endpoint of the O|V tile edge */ fB: Complex;
	/** foot onto mirror C (edge circle) — endpoint of the V|E tile edge */ fC: Complex;
}

/**
 * The three perpendicular feet of the Wythoff vertex W on the mirrors A, B, C. Each internal tile edge of
 * the uniform tiling runs from W to one foot (a tiling edge crosses a mirror perpendicularly), so these are
 * the endpoints the shader needs to split the Schwarz triangle into per-tile regions. Foot = hyperbolic
 * midpoint of W and its reflection across the mirror.
 */
export function wythoffFeet(p: number, q: number, rings: Rings): WythoffFeet {
	const { edgeA, edgeRho } = mirrorParams(p, q);
	const w = wythoffVertex(p, q, rings);
	return {
		fA: hypMidpoint(w, reflectDiameter(w, 0)),
		fB: hypMidpoint(w, reflectDiameter(w, Math.PI / p)),
		fC: hypMidpoint(w, reflectEdgeCircle(w, edgeA, edgeRho)),
	};
}

// ── Feature points for the "show polygon points" overlay ────────────────────────────────────────
// The Euclidean canvas marks each tile's centroid (red), edge midpoints (green), and vertices (blue)
// (lib/classes/polygons/Polygon.ts). The Poincaré-disk shader reproduces this by folding each pixel into
// the fundamental cell and testing its distance to these markers, so we hand it the markers of ONE central
// cell in the same fundamental frame it folds into. Shared features (a vertex belongs to several tiles) are
// listed once; the shader sees the right nearest marker whichever cell a pixel folds to.

/** Upper bound on markers per tiling — matches the shader's uPoints[] array length. */
export const MAX_FEATURE_POINTS = 32;

/** 0 = centroid (red), 1 = edge midpoint (green), 2 = vertex (blue). Matches Polygon.show's draw order. */
export type PointKind = 0 | 1 | 2;
export interface HyperbolicFeaturePoint { pos: Complex; kind: PointKind; }

/**
 * Klein-model average of disk points — a stable interior "centre" marker for a hyperbolic polygon (the
 * Poincaré centroid has no closed form; the Klein centroid does and sits inside the tile, which is all a
 * marker dot needs). Maps each point to the Klein disk (k = 2z/(1+|z|²)), averages, and maps back.
 */
export function hypCentroid(points: Complex[]): Complex {
	let kx = 0, ky = 0;
	for (const z of points) {
		const s = 2 / (1 + z.x * z.x + z.y * z.y); // Poincaré → Klein
		kx += s * z.x;
		ky += s * z.y;
	}
	kx /= points.length;
	ky /= points.length;
	const d = 1 + Math.sqrt(Math.max(1 - (kx * kx + ky * ky), 0)); // Klein → Poincaré
	return { x: kx / d, y: ky / d };
}

/**
 * The centroid / edge-midpoint / vertex markers of the central cell, in the fundamental fold frame. Regular
 * and uniform tilings fold across mirror A (the real axis), so each off-axis marker is packed with its ±y
 * copy; snub tilings are chiral (no reflection), so their real neighbour vertices, triangle centroids, and
 * edge midpoints are used directly. Coincident same-kind markers (on-axis mirrors, shared corners) are
 * de-duplicated, and the list is capped at MAX_FEATURE_POINTS.
 */
export function hyperbolicFeaturePoints(g: HyperbolicUniformValues): HyperbolicFeaturePoint[] {
	const out: HyperbolicFeaturePoint[] = [];
	const push = (pos: Complex, kind: PointKind) => out.push({ pos, kind });
	const pushMirrored = (pos: Complex, kind: PointKind) => {
		push(pos, kind);
		push({ x: pos.x, y: -pos.y }, kind);
	};

	if (g.snub) {
		const s = g.snub;
		// Vertices: the real snub-vertex neighbours incident to the central cell.
		for (const v of [s.s, s.as, s.ais, s.bs, s.bis, s.n, s.b2s]) push(v, 2);
		// Centroids: p-gon at O, q-gon at V, and the three snub triangles about s.
		push({ x: 0, y: 0 }, 0);
		push(g.cornerV, 0);
		push(hypCentroid([s.s, s.as, s.bis]), 0);
		push(hypCentroid([s.s, s.ais, s.n]), 0);
		push(hypCentroid([s.s, s.n, s.bs]), 0);
		// Edge midpoints: the 5 edges meeting at s + the 3 snub-triangle third edges.
		const edges: Array<[Complex, Complex]> = [
			[s.s, s.as], [s.s, s.ais], [s.s, s.bs], [s.s, s.bis], [s.s, s.n],
			[s.as, s.bis], [s.ais, s.n], [s.n, s.bs],
		];
		for (const [a, b] of edges) push(hypMidpoint(a, b), 1);
	} else {
		const W = g.wythoff;
		// Centroids at the occupied Schwarz corners (O = p-gon, V = q-gon, E = square).
		if (g.occ[0]) pushMirrored({ x: 0, y: 0 }, 0);
		if (g.occ[1]) pushMirrored(g.cornerV, 0);
		if (g.occ[2]) pushMirrored({ x: g.rIn, y: 0 }, 0);
		// Vertices: the single Wythoff-vertex orbit.
		pushMirrored(W, 2);
		// Edge midpoints: a foot carries an edge only when W lies off that mirror (foot ≠ W).
		for (const foot of [g.footA, g.footB, g.footC]) {
			if ((foot.x - W.x) ** 2 + (foot.y - W.y) ** 2 > 1e-8) pushMirrored(foot, 1);
		}
	}

	const dedup: HyperbolicFeaturePoint[] = [];
	for (const f of out) {
		if (dedup.some((e) => e.kind === f.kind && (e.pos.x - f.pos.x) ** 2 + (e.pos.y - f.pos.y) ** 2 < 1e-12)) continue;
		dedup.push(f);
	}
	return dedup.slice(0, MAX_FEATURE_POINTS);
}
