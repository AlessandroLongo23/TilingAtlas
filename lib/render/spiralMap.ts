// CPU side of the spiral conformal lens (components/inversive-canvas.tsx, uMode == 2). Builds the 2×2
// that maps the complex-log coordinate (r, θ) = (ln|w|, arg w) into the tiling's lattice coordinates,
// so the shader can reconstruct a world point and hand it to the existing analytic point-location.
//
// The one invariant that makes the spiral seamless: the θ-column is the integer seam vector (a, b), so
// advancing θ by 2π moves world by a·v₁ + b·v₂ — a genuine lattice translation. The atan2 branch cut at
// θ = ±π is then the only discontinuity in the map, and it lands on a lattice vector, so point-location
// returns the same tile on both sides. See docs/superpowers/specs/2026-07-16-spiral-conformal-shader-design.md.

const TAU = Math.PI * 2;

export interface SpiralMatrix {
	/** Row-major 2×2, latt = M·(r, θ): latA = m[0]·r + m[1]·θ, latB = m[2]·r + m[3]·θ. */
	m: [number, number, number, number];
	/** Primitive seam direction (a, b)/gcd — a lattice vector. */
	primitive: [number, number];
	/** Unimodular complement (c, d) with primitive × complement det = ±1 — the radial direction. */
	complement: [number, number];
	/** gcd(|a|, |b|): the seam is this many primitive cells wide, the arm-multiplication factor. */
	arms: number;
}

// Extended Euclid: returns [g, x, y] with a·x + b·y = g and g ≥ 0. Integer inputs.
function egcd(a: number, b: number): [number, number, number] {
	let oldR = a, r = b;
	let oldS = 1, s = 0;
	let oldT = 0, t = 1;
	while (r !== 0) {
		const q = Math.floor(oldR / r);
		[oldR, r] = [r, oldR - q * r];
		[oldS, s] = [s, oldS - q * s];
		[oldT, t] = [t, oldT - q * t];
	}
	if (oldR < 0) { oldR = -oldR; oldS = -oldS; oldT = -oldT; }
	return [oldR, oldS, oldT];
}

/**
 * Build the log→lattice matrix for a spiral with seam (a, b), a pitch shear, and a radial density.
 *
 * @param a integer seam component along v₁
 * @param b integer seam component along v₂ (a = b = 0 falls back to the plain 1,0 spiral)
 * @param pitchDeg spiral lean: 0 ⇒ concentric rings, ±→ logarithmic spirals. Shear is added to the
 *                 r-column ONLY, so the seam (θ-column) is untouched and closure holds at any pitch.
 * @param radialDensity scales the r-column — larger ⇒ tighter ring spacing.
 */
export function spiralLogToLattice(
	a: number,
	b: number,
	pitchDeg: number,
	radialDensity = 1,
): SpiralMatrix {
	let ai = Math.round(a);
	let bi = Math.round(b);
	if (ai === 0 && bi === 0) { ai = 1; bi = 0; } // degenerate seam → plain single wind

	const g = egcd(Math.abs(ai), Math.abs(bi))[0]; // gcd(|a|,|b|), always ≥ 1 here
	const pa = ai / g, pb = bi / g; // primitive seam (coprime)

	// Complement (c, d) with pa·d − pb·c = 1. From pa·x + pb·y = 1 set d = x, c = −y.
	// `+ 0` normalises −0 → 0 so the lattice vector compares cleanly.
	const [, x, y] = egcd(pa, pb);
	const c = -y + 0, d = x + 0;

	// θ-column = seam (a, b) / 2π — advancing θ by 2π moves lattice coords by exactly (a, b).
	const thetaX = ai / TAU;
	const thetaY = bi / TAU;

	// r-column = complement·density + θ-column·shear. The shear leans the concentric rings (complement
	// direction) toward the seam direction as radius grows, i.e. the Droste twist.
	const pitch = Math.max(-85, Math.min(85, pitchDeg));
	const k = Math.tan((pitch * Math.PI) / 180);
	const rX = c * radialDensity + thetaX * k;
	const rY = d * radialDensity + thetaY * k;

	return {
		m: [rX, thetaX, rY, thetaY],
		primitive: [pa, pb],
		complement: [c, d],
		arms: g,
	};
}
