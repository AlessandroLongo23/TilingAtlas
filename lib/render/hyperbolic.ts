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
