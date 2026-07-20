// Poincaré-disk hyperbolic geometry — pure functions (no WebGL, no store) shared by the developed-tiling
// renderer. SU(1,1) disk isometries (the pan/view algebra), the geodesic-conic kernel, {p,q} mirror
// parameters, and small metric helpers (hyperbolic distance, midpoint, tile hue). All unit-testable.
// Distances become Euclidean disk radii via r = tanh(d/2). The symmetry-group extraction that turns a
// developed patch into per-pixel shader data lives in lib/render/hyperbolicGroup.ts.

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

// --- Geodesic kernel -------------------------------------------------------------------------------
// A geodesic is stored as c0·(|z|²+1) + c1·x + c2·y = 0. This ONE form covers both circles orthogonal to
// the unit circle (c0 ≠ 0) and diameters through the origin (c0 = 0), so callers never special-case the
// two. Builders are cross products in the (|z|²+1, x, y) coordinate.
export interface Geodesic { c0: number; c1: number; c2: number; }

/** Geodesic through two disk points (cross product of their rows). */
export function geodesicThroughPoints(a: Complex, b: Complex): Geodesic {
	const ra = a.x * a.x + a.y * a.y + 1, rb = b.x * b.x + b.y * b.y + 1;
	return { c0: a.x * b.y - a.y * b.x, c1: a.y * rb - ra * b.y, c2: ra * b.x - a.x * rb };
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

/** Point at signed hyperbolic distance `dist` from `from`, along the geodesic toward `toward`. */
export function geodesicMove(from: Complex, toward: Complex, dist: number): Complex {
	const T = su11Translation(from);
	const q0 = su11ApplyInverse(T, toward);
	const l = Math.hypot(q0.x, q0.y);
	if (l < 1e-14) return { x: from.x, y: from.y };
	const r = Math.tanh(dist / 2); // signed: dist < 0 moves the opposite way
	return su11Apply(T, { x: (q0.x / l) * r, y: (q0.y / l) * r });
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

/** Hyperbolic distance between two Poincaré-disk points. */
export function hypDist(u: Complex, v: Complex): number {
	const dx = u.x - v.x, dy = u.y - v.y;
	const num = dx * dx + dy * dy;
	const du = 1 - (u.x * u.x + u.y * u.y);
	const dv = 1 - (v.x * v.x + v.y * v.y);
	return Math.acosh(1 + (2 * num) / (du * dv));
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

/** Stable hue (degrees) for an n-gon, so a given polygon reads the same colour across tilings. */
export function tileHue(sides: number): number {
	return (((sides * 47) % 360) + 360) % 360;
}
