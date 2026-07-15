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
 * Click-to-anchor snap point for a click at world point `w`: the nearest of the containing tile's centre,
 * its p vertices (circumradius r_c, at angles π/p + 2πk/p), or its p edge midpoints (inradius r_in, at
 * angles 2πk/p — the reference edge sits on +x). Folds `w` to the central tile, builds the features in
 * that frame, maps them back through the fold's inverse, and returns the closest to `w`. Vertices/edges
 * are shared between tiles, so the returned world point is the same whichever adjacent tile `w` folds to.
 */
export function pickClickAnchor(
	w: Complex,
	p: number,
	rIn: number,
	rC: number,
	edgeA: number,
	edgeRho: number,
	maxIter = 64,
): Complex {
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
		if ((zr.x - edgeA) * (zr.x - edgeA) + zr.y * zr.y < rho2) {
			z = su11Apply(cross, zr);
			g = su11Mul(cross, g);
		} else {
			break;
		}
	}
	const gi = su11Inverse(g);
	// Candidate features in the central-tile frame: centre, edge midpoints, vertices.
	const feats: Complex[] = [{ x: 0, y: 0 }];
	for (let k = 0; k < p; k++) {
		const em = wedge * k;
		feats.push({ x: rIn * Math.cos(em), y: rIn * Math.sin(em) });
		const vt = wedge * k + Math.PI / p;
		feats.push({ x: rC * Math.cos(vt), y: rC * Math.sin(vt) });
	}
	let best = feats[0];
	let bestD = Infinity;
	for (const f of feats) {
		const world = su11Apply(gi, f);
		const d = (world.x - w.x) * (world.x - w.x) + (world.y - w.y) * (world.y - w.y);
		if (d < bestD) {
			bestD = d;
			best = world;
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
function hypDist(u: Complex, v: Complex): number {
	const dx = u.x - v.x, dy = u.y - v.y;
	const num = dx * dx + dy * dy;
	const du = 1 - (u.x * u.x + u.y * u.y);
	const dv = 1 - (v.x * v.x + v.y * v.y);
	return Math.acosh(1 + (2 * num) / (du * dv));
}

/** Reflect a disk point across the diameter through the origin at angle `ang`. */
function reflectDiameter(z: Complex, ang: number): Complex {
	const c = Math.cos(2 * ang), s = Math.sin(2 * ang);
	return { x: c * z.x + s * z.y, y: s * z.x - c * z.y };
}

/** Reflect a disk point across the edge geodesic — inversion in the circle (cx,0), radius rho. */
function reflectEdgeCircle(z: Complex, cx: number, rho: number): Complex {
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
	return { s, as: ap(s), ais: aip(s), bs: bp(s), bis: bip(s), edge: hypDist(s, ap(s)) };
}

/** Hyperbolic midpoint of two Poincaré-disk points (the point on the geodesic uv at half the distance). */
function hypMidpoint(u: Complex, v: Complex): Complex {
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
