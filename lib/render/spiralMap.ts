// CPU side of the spiral conformal lens (components/inversive-canvas.tsx, uMode == 2). Port of the
// transform in Craig Kaplan's spiral-tilings demo (tactile-js/spirals/spirals.js):
//
//   tiling_T = matchSeg((0,0) → (0,2π)) ∘ matchSeg((0,0) → v)⁻¹,   v = a·t1 + b·t2
//
// i.e. the unique SIMILARITY (one complex multiplication — rotation + uniform scale, no shear) that
// carries the seam lattice vector onto the vertical segment of length 2π. The shader runs the inverse:
// world = K · (log w − V), with K = S/(2πi) as a complex number. Because the map is complex-linear,
// tiles keep their shape (conformality), and because K·(0,2π) = S exactly, the atan2 branch cut at
// θ = ±π lands on a lattice translation — seamless for any (a,b). There is deliberately NO extra knob
// (pitch/density): the spiral's lean and ring spacing are fully determined by (a,b) and the lattice,
// exactly as in Kaplan's tool. See docs/superpowers/specs/2026-07-16-spiral-conformal-shader-design.md.

const TAU = Math.PI * 2;

export interface SpiralSimilarity {
	/** K = S/(2πi) as a complex number (x + iy), world units: world = cmul(K, (ln|w|, arg w) − V). */
	k: [number, number];
	/** The seam S = a·v₁ + b·v₂ (world) — one full turn of θ advances world by exactly this. */
	seam: [number, number];
	/** gcd(|a|,|b|): the seam spans this many primitive lattice steps (arm-multiplication factor). */
	arms: number;
}

function gcd(a: number, b: number): number {
	a = Math.abs(a); b = Math.abs(b);
	while (b !== 0) [a, b] = [b, a % b];
	return a;
}

/**
 * Build the inverse spiral similarity for seam (a, b) over the lattice basis (v1, v2).
 *
 * Degenerate guards: a = b = 0, or a seam of ~zero length (collinear basis), falls back to (1, 0)
 * so the shader never sees a singular map.
 */
export function spiralSimilarity(
	a: number,
	b: number,
	v1: [number, number],
	v2: [number, number],
): SpiralSimilarity {
	let ai = Math.round(a);
	let bi = Math.round(b);
	if (ai === 0 && bi === 0) { ai = 1; bi = 0; }

	let sx = ai * v1[0] + bi * v2[0];
	let sy = ai * v1[1] + bi * v2[1];
	if (sx * sx + sy * sy < 1e-18) { ai = 1; bi = 0; sx = v1[0]; sy = v1[1]; }

	// K = S/(2πi) = −i·S/(2π) = (S.y, −S.x)/(2π). Then cmul(K, (0, 2π)) = i·K·2π = S — the seam closure.
	return {
		k: [sy / TAU, -sx / TAU],
		seam: [sx, sy],
		arms: gcd(ai, bi) || 1,
	};
}

/**
 * Reduce a strip-space drift (the velocity pad's integrated V offset) modulo the strip lattice.
 *
 * The world lattice (v1, v2) pulls back through world = K·(merc − V) to the strip lattice
 * (v1/K, v2/K): shifting V by an integer combination of those shifts world by the SAME integer
 * combination of (v1, v2) — an exact lattice translation, invisible. Wrapping every frame keeps the
 * drift bounded within one strip cell, so an animation left running never grows V into float32
 * jitter in the shader's merc − V.
 *
 * A singular strip basis (degenerate K or collinear v1, v2) returns the drift unchanged.
 */
export function wrapStripDrift(
	drift: [number, number],
	k: [number, number],
	v1: [number, number],
	v2: [number, number],
): [number, number] {
	// u = v/K (complex division): the world basis expressed in strip space.
	const d = k[0] * k[0] + k[1] * k[1];
	if (d < 1e-18) return drift;
	const u1: [number, number] = [(v1[0] * k[0] + v1[1] * k[1]) / d, (v1[1] * k[0] - v1[0] * k[1]) / d];
	const u2: [number, number] = [(v2[0] * k[0] + v2[1] * k[1]) / d, (v2[1] * k[0] - v2[0] * k[1]) / d];

	const det = u1[0] * u2[1] - u2[0] * u1[1];
	if (Math.abs(det) < 1e-12) return drift;

	// drift = a·u1 + b·u2; subtract the nearest integer combination.
	const a = (drift[0] * u2[1] - u2[0] * drift[1]) / det;
	const b = (u1[0] * drift[1] - drift[0] * u1[1]) / det;
	const ra = Math.round(a);
	const rb = Math.round(b);
	if (ra === 0 && rb === 0) return drift;
	return [drift[0] - ra * u1[0] - rb * u2[0], drift[1] - ra * u1[1] - rb * u2[1]];
}
