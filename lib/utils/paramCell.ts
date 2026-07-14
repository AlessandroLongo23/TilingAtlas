import type { TranslationalCellData } from "@/lib/utils/renderTiling";

// Parametric translational cell for free-angle tiling families — one OR more independent parameters.
//
// Geometry comes from the formal (symbolic-angle) development of the family (family_flex.py /
// export_isotoxal_families.py). Every vertex position and both basis vectors are finite Laurent
// polynomials in x_j = e^{i·δ_j}, one variable per parameter, with coefficients in ℤ[ζ_24] evaluated to
// float. A term [m, re, im] contributes (re + i·im)·e^{i·(m·δ)}: for a SINGLE parameter m is a scalar and
// m·δ = m·δ_0; for MULTIPLE parameters m is a vector and m·δ = Σ_j m_j·δ_j. δ_j = (alpha_j − alpha0_j)·π/180.
// The family is PROVEN to tile for every parameter tuple in the (box) validity region, so evaluating at any
// slider position yields a genuine tiling, not an interpolation.
//
// `params` is an array: length 1 for star / rigid-partner isotoxal families, length N for a separable
// N-parameter isotoxal family (each independent isotoxal tile is its own slider, valid region a box).
export type ParamTerm = [m: number | number[], re: number, im: number];

export interface ParametricCellData {
	params: {
		name: string;
		alpha0Deg: number; // this parameter's angle at δ_j = 0 (the exported representative)
		deltaRangeDeg: [number, number]; // exporter's 0.4°-padded range — superseded here by ALPHA_EPS_DEG, unused
		alphaRangeDegOpen: [number, number]; // mathematical (open) validity interval — the slider domain
		defaultAlphaDeg: number;
		tile?: string; // the isotoxal tile this parameter flexes (e.g. "cx6-90.150")
	}[];
	cellPolygons: { n: number; star?: boolean; vertices: ParamTerm[][] }[];
	basis: [ParamTerm[], ParamTerm[]];
}

/** Slider grid for the free angles, in degrees. Every open endpoint the exporters emit is a multiple of
 *  15°, so this grid lands exactly on both ends of every family's range. */
export const ALPHA_STEP_DEG = 0.5;

/**
 * The validity interval is OPEN: at either endpoint the family degenerates (a tile collapses to zero
 * area — the basis stays non-singular, so nothing blows up, but the limit is not a member of the family).
 * The exporters keep the slider 0.4° clear of the ends, which is visible in the readout (89.6° on a
 * (30°, 90°) family). Instead we let the slider span the closed interval and nudge the *evaluated* angle
 * this far inside: at 1e-3° the collapsing tile's area is ~1e-5 — invisible at any zoom — while every
 * rendered tiling stays strictly inside the proven region.
 */
const ALPHA_EPS_DEG = 1e-3;

/** m·δ for a scalar (single-param) or vector (multi-param) exponent. */
function mDotDelta(m: number | number[], deltas: number[]): number {
	if (typeof m === "number") return m * deltas[0];
	let s = 0;
	for (let j = 0; j < m.length; j++) s += m[j] * deltas[j];
	return s;
}

function evalTerms(terms: ParamTerm[], deltas: number[]): [number, number] {
	let x = 0;
	let y = 0;
	for (const [m, re, im] of terms) {
		const a = mDotDelta(m, deltas);
		const c = Math.cos(a);
		const s = Math.sin(a);
		x += re * c - im * s;
		y += re * s + im * c;
	}
	return [x, y];
}

/** Per-parameter δ (radians) from the angle values. Accepts a single number (1-param) or an array.
 *  Angles are held ALPHA_EPS_DEG inside the open interval, so an endpoint slider position evaluates just
 *  short of the degenerate limit rather than on it. Interior angles pass through untouched. */
function deltasFor(pc: ParametricCellData, alphaDeg: number | number[]): number[] {
	const alphas = Array.isArray(alphaDeg) ? alphaDeg : [alphaDeg];
	return pc.params.map((p, j) => {
		const [lo, hi] = p.alphaRangeDegOpen;
		const a = alphas[j] ?? p.defaultAlphaDeg;
		const inside = Math.min(hi - ALPHA_EPS_DEG, Math.max(lo + ALPHA_EPS_DEG, a));
		return ((inside - p.alpha0Deg) * Math.PI) / 180;
	});
}

/** Evaluate the family at a slider position (one number for 1-param, an array for N-param); parseBaseCell-ready. */
export function evaluateParamCell(pc: ParametricCellData, alphaDeg: number | number[]): TranslationalCellData {
	const deltas = deltasFor(pc, alphaDeg);
	return {
		cellPolygons: pc.cellPolygons.map((poly) => ({
			n: poly.n,
			...(poly.star ? { star: true } : {}),
			vertices: poly.vertices.map((v) => evalTerms(v, deltas)),
		})),
		basis: [evalTerms(pc.basis[0], deltas), evalTerms(pc.basis[1], deltas)],
	};
}

/** Snap one parameter's angle to the slider grid and clamp it into the family's range. Snapping matters
 *  because a value carried over from another family (resolveAlphaDegs reuses the tuple) can land off-grid. */
export function clampAlphaAt(pc: ParametricCellData, paramIndex: number, alphaDeg: number): number {
	const [lo, hi] = pc.params[paramIndex].alphaRangeDegOpen;
	const snapped = Math.round(alphaDeg / ALPHA_STEP_DEG) * ALPHA_STEP_DEG;
	return Math.min(hi, Math.max(lo, snapped));
}

/** Back-compat single-parameter clamp (first parameter). */
export function clampAlpha(pc: ParametricCellData, alphaDeg: number): number {
	return clampAlphaAt(pc, 0, alphaDeg);
}

/**
 * Resolve the effective per-parameter angles for a family from the persisted store values. One value
 * per parameter (α, β, …): reuse the stored value clamped into THIS family's valid range if present and
 * finite, else fall back to the parameter's default. Length always follows `pc.params`, so a stored
 * tuple from a family with a different parameter count is handled gracefully (extra entries ignored,
 * missing ones defaulted). Shared by the slider panel, the p5 canvas, and the inversive canvas so all
 * three read the same cell for a given slider state.
 */
export function resolveAlphaDegs(pc: ParametricCellData, stored: number[] | null | undefined): number[] {
	return pc.params.map((p, j) => {
		const v = stored?.[j];
		return v != null && Number.isFinite(v) ? clampAlphaAt(pc, j, v) : p.defaultAlphaDeg;
	});
}
