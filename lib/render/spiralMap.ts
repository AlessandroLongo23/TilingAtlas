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
