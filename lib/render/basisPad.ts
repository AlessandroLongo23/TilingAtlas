// Pure math for the basis pad (components/ui/basis-pad.tsx): the 2x2 view deformation, edited by
// dragging the images of the two unit vectors around a [-2, 2] square ruled at 0.25.
//
// The matrix IS the pair of vectors — red = D*(1,0) is its first column, blue = D*(0,1) its second — so
// the widget stores nothing of its own and every helper here converts between that pair and the Mat2 the
// renderers read (lib/render/flatView.ts). Positions are in WORLD units with y UP; the component flips
// for SVG. No p5, no store, no React, so the clamping rules below are unit-testable on their own.

import { type Mat2, mat2Det } from "@/lib/render/flatView";

/** Half-extent of the editable square. The pad shows [-PAD_RANGE, PAD_RANGE] on both axes. */
export const PAD_RANGE = 2;

/** Rule spacing, and the lattice Shift-drag snaps to. 0.25 over [-2, 2] is 17 lines per axis. */
export const PAD_GRID = 0.25;

/**
 * Floor on |det D| — the area scale, and therefore the instance budget.
 *
 * The fill grid follows the viewport exactly (computeFillGrid in lib/render/flatView.ts), so its copy
 * count is screen area / deformed cell area: an area-PRESERVING deform (any shear, rotation or
 * reflection) costs the same as the identity, and only shrinking costs more, by exactly 1/|det|. So this
 * number is read directly as a budget. 0.25 = the tiling may shrink to a quarter of its area, i.e. at
 * most 4x the copies the app already draws at its own worst case (4K at 100%, ZOOM_MIN, ~21k copies).
 *
 * It also bounds how THIN the deformed cell can get, because the same rule is enforced as a
 * perpendicular distance: |det| = |q| * (distance from p to q's line). Both matter — area sets the
 * count, thinness sets the reach.
 */
export const DEFORM_MIN_DET = 0.25;

export interface PadVec {
	x: number;
	y: number;
}

/** The matrix built from its two columns: red is the image of (1,0), blue the image of (0,1). */
export function deformFromVectors(red: PadVec, blue: PadVec): Mat2 {
	return [red.x, red.y, blue.x, blue.y];
}

/** The two columns of the matrix, as the pad draws them. */
export function vectorsFromDeform(m: Mat2): { red: PadVec; blue: PadVec } {
	return { red: { x: m[0], y: m[1] }, blue: { x: m[2], y: m[3] } };
}

export const IDENTITY_VECTORS = { red: { x: 1, y: 0 }, blue: { x: 0, y: 1 } };

/** Inside the editable square. Applied before the determinant rule, so a drag never leaves the plot. */
export function clampToBox(p: PadVec, range: number = PAD_RANGE): PadVec {
	return {
		x: Math.max(-range, Math.min(range, p.x)),
		y: Math.max(-range, Math.min(range, p.y)),
	};
}

/** Nearest multiple of `step` on both axes (the Shift-drag and arrow-key lattice). */
export function snapToGrid(p: PadVec, step: number = PAD_GRID): PadVec {
	return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
}

/** The signed area of the parallelogram the two vectors span — det of the matrix they form. */
export function cross(a: PadVec, b: PadVec): number {
	return a.x * b.y - a.y * b.x;
}

/**
 * Keep the dragged vector `p` far enough off the fixed vector `q` that |det| >= minDet.
 *
 * |det| is |p x q| = |q| * (perpendicular distance from p to q's line), so the whole constraint is one
 * distance: push p along ±perp(q) until it clears. The push KEEPS THE SIDE p is already on, so a drag
 * that runs into the constraint slides along it instead of flipping the tiling inside out; when p has
 * landed exactly on the line the side is taken from `prev` (where it came from), and only then from an
 * arbitrary +1.
 *
 * If the push would leave the box the constraint and the box disagree, and `prev` wins — the drag simply
 * stops moving in that direction rather than snapping somewhere the pointer is not.
 */
export function enforceDeterminant(
	p: PadVec,
	q: PadVec,
	prev: PadVec,
	minDet: number = DEFORM_MIN_DET,
	range: number = PAD_RANGE,
): PadVec {
	const c0 = cross(p, q);
	if (Math.abs(c0) >= minDet) return p;
	const qLen = Math.hypot(q.x, q.y);
	if (qLen < 1e-12) return prev; // q is itself degenerate; nothing p can do fixes the determinant
	// cross(p + t*n, q) = c0 - t*|q| for n = perp(q)/|q|, so t is a plain solve for the target signed area.
	const cPrev = cross(prev, q);
	const sign = c0 !== 0 ? Math.sign(c0) : cPrev !== 0 ? Math.sign(cPrev) : 1;
	const t = (c0 - sign * minDet) / qLen;
	const nx = -q.y / qLen, ny = q.x / qLen;
	const pushed = { x: p.x + t * nx, y: p.y + t * ny };
	if (Math.abs(pushed.x) > range + 1e-9 || Math.abs(pushed.y) > range + 1e-9) return prev;
	return pushed;
}

/** One drag step: clamp into the box, optionally snap, then satisfy the determinant floor. */
export function resolveDrag(
	raw: PadVec,
	other: PadVec,
	prev: PadVec,
	opts: { snap?: boolean; minDet?: number; range?: number; step?: number } = {},
): PadVec {
	const range = opts.range ?? PAD_RANGE;
	let p = clampToBox(raw, range);
	if (opts.snap) p = clampToBox(snapToGrid(p, opts.step ?? PAD_GRID), range);
	return enforceDeterminant(p, other, prev, opts.minDet ?? DEFORM_MIN_DET, range);
}

/** Does a matrix (from a URL, say) satisfy what the pad would have enforced? */
export function isAdmissibleDeform(m: Mat2, minDet: number = DEFORM_MIN_DET, range: number = PAD_RANGE): boolean {
	if (!m.every((n) => Number.isFinite(n))) return false;
	if (m.some((n) => Math.abs(n) > range + 1e-9)) return false;
	return Math.abs(mat2Det(m)) >= minDet - 1e-12;
}

// ── Pad pixel geometry ────────────────────────────────────────────────────────────────────────────
// World (y up) <-> SVG px (y down) about the pad's origin. Kept here so the drag, the arrow keys and the
// arrow-drawing all convert through one function and cannot disagree by a half pixel.

export interface PadGeom {
	/** SVG px of world (0, 0). */
	ox: number;
	oy: number;
	/** SVG px per world unit (isotropic — the plot must not distort the matrix it is showing). */
	scale: number;
}

export function worldToPad(p: PadVec, g: PadGeom): PadVec {
	return { x: g.ox + p.x * g.scale, y: g.oy - p.y * g.scale };
}

export function padToWorld(sx: number, sy: number, g: PadGeom): PadVec {
	return { x: (sx - g.ox) / g.scale, y: (g.oy - sy) / g.scale };
}
