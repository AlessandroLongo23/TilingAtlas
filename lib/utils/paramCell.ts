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
		// The slider is not always injective: some families pass through a maximally symmetric member and
		// come back, so α and 2·foldCentreDeg − α are the SAME tiling (up to an isometry, `foldKind`).
		// Measured by scripts/scan-family-ranges.py and confirmed with an explicit isometry search, never
		// with the radial fingerprint alone. Kept rather than clipped (AL, 2026-07-25): the replayed half is
		// still a real sweep to drag through, it just adds no new tilings, so the UI marks the centre
		// instead of hiding half the range. See docs/DEVELOPMENT_NOTES.md §102.
		foldCentreDeg?: number;
		foldKind?: "rotation" | "reflection";
	}[];
	cellPolygons: { n: number; star?: boolean; vertices: ParamTerm[][] }[];
	basis: [ParamTerm[], ParamTerm[]];
	// MERGED families only (single parameter): two exported families that are the two halves of one
	// continuous deformation, cut where the flexing tile's alternating vertex passes through 180° — on one
	// side of that angle the tile is a concave star, on the other a convex 2n-gon, so the exporter files
	// them as different families. `segments` splices them back into one monotone slider whose domain is
	// params[0].alphaRangeDegOpen. Absent for the ordinary single-cell families, and `cellPolygons`/`basis`
	// above stay the FIRST segment's, so a consumer that ignores this field still renders a real tiling
	// (half the sweep) rather than nothing. Spec: docs/superpowers/specs/2026-07-25-mixed-family-merge-design.md
	segments?: ParamSegment[];
}

/** One half of a merged family: the source family's symbolic cell plus where it sits on the merged slider.
 *  Segments are sorted, contiguous, and tile `alphaRangeDegOpen` exactly; the seam belongs to the lower
 *  segment, which is immaterial because both sides evaluate to the same cell there — that agreement is
 *  what makes the merge legal, and `paramCell.test.ts` asserts it. */
export interface ParamSegment {
	sourceId: string; // the pre-merge family id this half came from (kept for provenance + alias remaps)
	range: [number, number]; // the merged coordinate's span covered by this segment
	alphaOf: { m: number; c: number }; // this segment's own α = c + m·u, with m = ±1 (|dα/du| = 1)
	alpha0Deg: number; // the segment's own δ origin — NOT params[0].alpha0Deg, which is the first segment's
	cellPolygons: { n: number; star?: boolean; vertices: ParamTerm[][] }[];
	basis: [ParamTerm[], ParamTerm[]];
	// Provenance only. The two halves were exported in different frames, so the builder BAKED this isometry
	// into the terms above to make the seam continuous — nothing at runtime re-applies it. Recorded so the
	// alignment is auditable, and absent when it was the identity.
	poseDeg?: number;
	poseConj?: boolean;
	poseTranslate?: [number, number];
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

/** The segment of a merged family covering a slider position — the lower segment at a seam, the nearest
 *  one for a position outside the range (the caller has already clamped, this is belt-and-braces). Returns
 *  null for an ordinary single-cell family, which is the signal to take the unsegmented path. */
export function segmentAt(pc: ParametricCellData, u: number): ParamSegment | null {
	const segs = pc.segments;
	if (!segs?.length) return null;
	for (const s of segs) if (u >= s.range[0] && u <= s.range[1]) return s;
	return u < segs[0].range[0] ? segs[0] : segs[segs.length - 1];
}

/** Evaluate the family at a slider position (one number for 1-param, an array for N-param); parseBaseCell-ready. */
export function evaluateParamCell(pc: ParametricCellData, alphaDeg: number | number[]): TranslationalCellData {
	// A merged family carries one parameter and a segment per half: hold the slider position inside the
	// merged open interval exactly as the unsegmented path does, pick the segment, map the position onto
	// that segment's own α, and evaluate ITS cell against ITS δ origin. The seam is deliberately NOT
	// nudged — it is a genuine tiling (no tile has zero area there), which is why the two halves are one
	// family at all; only the outer ends are degenerate and need ALPHA_EPS_DEG.
	if (pc.segments?.length) {
		const [lo, hi] = pc.params[0].alphaRangeDegOpen;
		const raw = Array.isArray(alphaDeg) ? (alphaDeg[0] ?? pc.params[0].defaultAlphaDeg) : alphaDeg;
		const u = Math.min(hi - ALPHA_EPS_DEG, Math.max(lo + ALPHA_EPS_DEG, raw));
		const seg = segmentAt(pc, u)!;
		const deltas = [((seg.alphaOf.c + seg.alphaOf.m * u) - seg.alpha0Deg) * (Math.PI / 180)];
		return {
			cellPolygons: seg.cellPolygons.map((poly) => ({
				n: poly.n,
				...(poly.star ? { star: true } : {}),
				vertices: poly.vertices.map((v) => evalTerms(v, deltas)),
			})),
			basis: [evalTerms(seg.basis[0], deltas), evalTerms(seg.basis[1], deltas)],
		};
	}
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

/** Clamp one parameter's angle into the family's range WITHOUT snapping to the slider grid. For the
 *  continuous Command+drag scrub, where the 0.5° snap that clampAlphaAt applies would make the sweep
 *  stair-step. The evaluated angle is still held ALPHA_EPS_DEG inside the open interval downstream in
 *  deltasFor, so storing exactly lo/hi is safe. */
export function clampAlphaOnly(pc: ParametricCellData, paramIndex: number, alphaDeg: number): number {
	const [lo, hi] = pc.params[paramIndex].alphaRangeDegOpen;
	return Math.min(hi, Math.max(lo, alphaDeg));
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

/** Like resolveAlphaDegs but clamps WITHOUT the 0.5° grid snap — for the continuous Command-scrub seed and
 *  the eased render tuple, which must stay off-grid to sweep smoothly. Missing/non-finite entries fall back
 *  to the parameter default; length always follows pc.params. */
export function resolveAlphaDegsRaw(pc: ParametricCellData, stored: number[] | null | undefined): number[] {
	return pc.params.map((p, j) => {
		const v = stored?.[j];
		return v != null && Number.isFinite(v) ? clampAlphaOnly(pc, j, v) : p.defaultAlphaDeg;
	});
}

/** The angle tuple to RENDER for a parametric family: the eased `live` tuple when present and correctly
 *  sized, else the resolved (clamp-only, unsnapped) target. Single source shared by the flat p5 canvas and
 *  the inversive overlay, so the two render paths can never drift apart. */
export function renderAlphaDegs(
	pc: ParametricCellData,
	live: number[] | null | undefined,
	stored: number[] | null | undefined,
): number[] {
	return live && live.length === pc.params.length ? live : resolveAlphaDegsRaw(pc, stored);
}
