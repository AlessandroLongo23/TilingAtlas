// Shared math for the flat (Euclidean) view. Single source of truth for the world->screen transform,
// the lattice fill-radius, and the pan wrap, so the p5 canvas (components/canvas.tsx) and the WebGL
// shader (components/euclidean-canvas.tsx) never drift apart. flatWorldToClip is the exact function
// the euclidean-canvas vertex shader transcribes; the parity test pins it to worldToScreen.

import { Vector } from "@/classes/Vector";
import type { TranslationalCellData } from "@/classes/algorithm/types";

// Per-axis safety backstop on the replicated grid. Sized so it never limits a real screen-fill at the
// zoom floor (worst realistic case ~126 cells/axis for a skewed cell on a 4K-at-100% display at
// ZOOM_MIN=20); it only caps a pathological/near-degenerate basis from exploding the polygon count.
// Fill normally needs far fewer (~46/axis on a Retina laptop). Perf is governed by the zoom floor
// (tile density), not this cap.
export const MAX_FILL_RADIUS = 144;
export const DEGENERATE_DET = 1e-9;

// ── The view deformation D ────────────────────────────────────────────────────────────────────────
// A 2x2 linear map applied to WORLD coordinates before the camera (world -> D -> zoom*R*flip -> +offset),
// driven by the basis pad in the sidebar. COLUMN-MAJOR: deform[0..1] is the image of (1,0) (the pad's red
// vector) and deform[2..3] the image of (0,1) (blue) — the order GLSL's mat2(a,b,c,d) and
// gl.uniformMatrix2fv already take, so the matrix travels store -> shader with no transpose anywhere.
//
// D is INNERMOST, so the rotation slider spins the already-deformed tiling. Being linear it commutes with
// lattice replication — D(w + i*v1 + j*v2) = D*w + i*(D*v1) + j*(D*v2) — which is why a shader can apply it
// to a single `world` while the CPU only has to hand the DEFORMED basis to computeFillRadii/wrapOffset.
// Line widths are unaffected by construction: every renderer expands its strokes in SCREEN units after the
// world->screen map (uHalfStrokePx here, strokeWeight/zoom in p5), so a sheared tiling keeps uniform outlines.
export type Mat2 = readonly [number, number, number, number];
export const IDENTITY_DEFORM: Mat2 = [1, 0, 0, 1];

export function mat2Det(m: Mat2): number {
	return m[0] * m[3] - m[2] * m[1];
}

export function applyMat2(m: Mat2, x: number, y: number): { x: number; y: number } {
	return { x: m[0] * x + m[2] * y, y: m[1] * x + m[3] * y };
}

/** Inverse, or null when the map is degenerate — there is then no world point under a screen pixel. */
export function invertMat2(m: Mat2): Mat2 | null {
	const det = mat2Det(m);
	if (Math.abs(det) < DEGENERATE_DET) return null;
	return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det];
}

/** The no-op case, checked exactly (the default value is literal, never computed) so the identity path
 *  short-circuits every deform-aware helper and stays byte-identical to the pre-deform code. */
export function isIdentityDeform(m: Mat2 | null | undefined): boolean {
	return !m || (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1);
}

/**
 * D's singular values [max, min] — how much it stretches in its most and least stretched direction.
 *
 * The inversive lens needs the smaller one: its stroke width comes from a per-fragment estimate of how
 * many world units a pixel covers, and a deform makes that anisotropic. 1/sigmaMin is the operator norm
 * of D-inverse, i.e. the worst-case growth of that footprint, so scaling by it is the conservative
 * (never-too-thin) choice for a shader that can only carry one number.
 */
export function mat2Singulars(m: Mat2): [number, number] {
	const [a, b, c, d] = m;
	const E = a * a + b * b, F = c * c + d * d, G = a * c + b * d;
	const tr = E + F;
	const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - (E * F - G * G)));
	return [Math.sqrt(Math.max(0, tr / 2 + disc)), Math.sqrt(Math.max(0, tr / 2 - disc))];
}

/** The lattice basis carried through D. Fill radii and the pan wrap both reduce against the DEFORMED
 *  lattice — that is what keeps a sheared tiling covering the viewport and wrapping seamlessly. */
export function deformBasis(v1: Vector, v2: Vector, deform?: Mat2): { v1: Vector; v2: Vector } {
	if (isIdentityDeform(deform)) return { v1, v2 };
	const m = deform as Mat2;
	const a = applyMat2(m, v1.x, v1.y);
	const b = applyMat2(m, v2.x, v2.y);
	return { v1: new Vector(a.x, a.y), v2: new Vector(b.x, b.y) };
}

// The lattice basis (two world-space translation vectors) of a translational cell, plus its
// determinant. Single source of truth so fill-radius, wrap, and replication never disagree.
export function latticeBasisFromCell(cellData: TranslationalCellData): { v1: Vector; v2: Vector; det: number } {
	const basisRaw = cellData?.b ?? cellData?.basis ?? [[1, 0], [0, 1]];
	const v1 = new Vector(basisRaw[0][0], basisRaw[0][1]);
	const v2 = new Vector(basisRaw[1][0], basisRaw[1][1]);
	return { v1, v2, det: v1.x * v2.y - v2.x * v1.y };
}

// The cell content's bounding box in LATTICE coordinates (world = a*v1 + b*v2). The cell's polygons are
// stored in raw world coordinates and are NOT reduced to hug their anchor — a cell can sit whole periods
// away from the origin — so the fill radii must know where the content actually is. View-invariant
// (rotation/zoom apply the same linear map to points and basis, so a,b are unchanged).
export interface LatticeExtent { aMin: number; aMax: number; bMin: number; bMax: number }

// Lattice extent from a world-space AABB (parseBaseCell already computes one). The world->lattice map is
// linear, so its extremes over the box are attained at the four corners; the result bounds the extent of
// every content vertex.
export function latticeExtentFromBounds(
	minX: number, maxX: number, minY: number, maxY: number,
	v1: { x: number; y: number }, v2: { x: number; y: number }, det: number,
): LatticeExtent {
	if (Math.abs(det) < DEGENERATE_DET) return { aMin: 0, aMax: 0, bMin: 0, bMax: 0 };
	let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
	for (const x of [minX, maxX]) {
		for (const y of [minY, maxY]) {
			const a = (x * v2.y - y * v2.x) / det;
			const b = (-x * v1.y + y * v1.x) / det;
			if (a < aMin) aMin = a;
			if (a > aMax) aMax = a;
			if (b < bMin) bMin = b;
			if (b > bMax) bMax = b;
		}
	}
	return { aMin, aMax, bMin, bMax };
}

// The two on-screen (pixel-space) lattice vectors for the world basis, mirroring the canvas transform
// world -> scale(zoom) -> flip-y -> rotate(theta). So e(v) = Rot(theta)·(zoom*vx, -zoom*vy). At
// theta=0 this is the plain (zoom*vx, -zoom*vy). Fill-radius and wrap both reduce against these, so a
// rotated lattice still tiles/wraps seamlessly.
export function screenLatticeVectors(v1: Vector, v2: Vector, zoom: number, rotation: number, deform?: Mat2) {
	const d = deformBasis(v1, v2, deform);
	const c = Math.cos(rotation), s = Math.sin(rotation);
	const e = (v: Vector) => ({ x: zoom * (c * v.x + s * v.y), y: zoom * (s * v.x - c * v.y) });
	return { e1: e(d.v1), e2: e(d.v2) };
}

// How many lattice copies (per axis, each side of origin) are needed to cover the viewport. We transform
// the four screen corners into lattice coords via M^{-1} (columns of M are the on-screen lattice vectors
// e1, e2) and take the worst case maxA/maxB. Coverage argument: a viewport point at lattice coord `a` is
// drawn by the (unique) copy i with a - i inside the content's own lattice extent [aMin, aMax]; since we
// only know the interval i falls in, the grid must contain ALL of [a - aMax, a - aMin]. Over |a| <=
// maxA + 0.5 (the wrapOffset residual shifts the viewport by up to half a period per axis) that needs
// Ri >= maxA + 0.5 + max(-aMin, aMax). The former fixed "+1" margin assumed the content hugs its anchor
// (pad ~ 0.5) — false in general (cells are stored wherever the pipeline left them, whole periods from
// the origin), which is exactly what left uncovered corner wedges on skewed/displaced cells. The +1 in
// the clamp is safety: stroke quads overhang the fill AABB by half a screen stroke width, plus fp slop.
export function computeFillRadii(
	v1: Vector, v2: Vector, det: number, zoomForFill: number, width: number, height: number, rotation: number,
	extent: LatticeExtent, deform?: Mat2,
): { Ri: number; Rj: number } {
	// The DEFORMED cell is what has to cover the screen, so the degeneracy test is on det(D)*det — a
	// near-singular D flattens the lattice however healthy the tiling's own basis is.
	const dDet = det * (isIdentityDeform(deform) ? 1 : mat2Det(deform as Mat2));
	if (Math.abs(dDet) < DEGENERATE_DET || zoomForFill <= 0) return { Ri: 6, Rj: 6 };
	const { e1, e2 } = screenLatticeVectors(v1, v2, zoomForFill, rotation, deform);
	const detM = e1.x * e2.y - e2.x * e1.y; // = zoomForFill^2 * det(D) * det (rotation-invariant)
	let maxA = 0, maxB = 0;
	const hw = width / 2, hh = height / 2;
	for (const cx of [-hw, hw]) {
		for (const cy of [-hh, hh]) {
			const a = (cx * e2.y - cy * e2.x) / detM;
			const b = (-cx * e1.y + cy * e1.x) / detM;
			if (Math.abs(a) > maxA) maxA = Math.abs(a);
			if (Math.abs(b) > maxB) maxB = Math.abs(b);
		}
	}
	const padA = Math.max(-extent.aMin, extent.aMax, 0);
	const padB = Math.max(-extent.bMin, extent.bMax, 0);
	const clamp = (n: number) => Math.max(1, Math.min(MAX_FILL_RADIUS, Math.ceil(n) + 1));
	return { Ri: clamp(maxA + 0.5 + padA), Rj: clamp(maxB + 0.5 + padB) };
}

// ── The exact fill grid ───────────────────────────────────────────────────────────────────────────
// computeFillRadii above bounds each axis INDEPENDENTLY, so it describes a rectangle in (i, j). For a
// square-ish lattice that rectangle is the viewport plus a modest margin. For a SHEARED one the viewport
// is a thin diagonal band in lattice coordinates and the enclosing rectangle is mostly empty: at 4K on
// the zoom floor a strong shear wants 3.8M copies as a rectangle and 88k as the band. That waste is why
// the deform needed this — a rectangle cannot both cover a sheared lattice and stay affordable — and it
// was already costing the undeformed view about 2.2x more copies than it draws anything with.
//
// So: keep the row range from the same corner argument, and compute each row's column span exactly. The
// viewport is a PARALLELOGRAM in lattice coordinates (the map is linear), so intersecting it with the
// strip a ∈ [i + aMin - 0.5, i + aMax + 0.5] gives an interval, and widening that interval by the other
// half-period residual gives every j that row can possibly need. The count then IS the coverage need:
// screen area / deformed cell area. An area-preserving deform (any shear, rotation, reflection) costs
// exactly what the identity costs; only shrinking costs more, by 1/|det D|, which is what the basis pad's
// determinant floor budgets (DEFORM_MIN_DET in lib/render/basisPad.ts).

/** Runaway backstop on the TOTAL copy count, the shape MAX_FILL_RADIUS should have had. With the exact
 *  spans the count is the true coverage need, so hitting this means the tiles are sub-pixel mush and the
 *  picture has stopped saying anything — it is not a completeness knob for any view worth looking at. */
export const MAX_FILL_INSTANCES = 250_000;

export interface FillGrid {
	iLo: number;
	iHi: number;
	/** Per row (index i - iLo), the inclusive column range. Empty rows carry jHi < jLo. */
	jLo: Int32Array;
	jHi: Int32Array;
	/** Total (i, j) pairs — the instance count the caller will upload. */
	count: number;
	/** Rows were dropped to respect MAX_FILL_INSTANCES: the fill is knowingly incomplete. */
	clipped: boolean;
}

function emptyGrid(r: number): FillGrid {
	const n = 2 * r + 1;
	const jLo = new Int32Array(n).fill(-r);
	const jHi = new Int32Array(n).fill(r);
	return { iLo: -r, iHi: r, jLo, jHi, count: n * n, clipped: false };
}

/**
 * Which lattice copies actually intersect the viewport.
 *
 * Coverage argument, the same one computeFillRadii uses, carried one step further: a viewport point sits
 * at lattice coord (a, b) — up to the wrapOffset residual of half a period per axis — and is drawn by the
 * copy (i, j) with (a - i, b - j) inside the content's extent. So i ranges over [a - aMax, a - aMin] and,
 * for each i, j over [b - bMax, b - bMin] where b runs over the viewport's b-values AT THAT a. The last
 * clause is the whole difference from the rectangle, which takes b over the entire viewport regardless.
 */
export function computeFillGrid(
	v1: Vector, v2: Vector, det: number, zoomForFill: number, width: number, height: number, rotation: number,
	extent: LatticeExtent, deform?: Mat2,
): FillGrid {
	const dDet = det * (isIdentityDeform(deform) ? 1 : mat2Det(deform as Mat2));
	if (Math.abs(dDet) < DEGENERATE_DET || zoomForFill <= 0) return emptyGrid(6);
	const { e1, e2 } = screenLatticeVectors(v1, v2, zoomForFill, rotation, deform);
	const detM = e1.x * e2.y - e2.x * e1.y;
	if (Math.abs(detM) < DEGENERATE_DET) return emptyGrid(6);

	// The four screen corners in lattice coordinates, in perimeter order so consecutive pairs are edges.
	const hw = width / 2, hh = height / 2;
	const corners: Array<[number, number]> = [];
	for (const [cx, cy] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as Array<[number, number]>) {
		corners.push([(cx * e2.y - cy * e2.x) / detM, (-cx * e1.y + cy * e1.x) / detM]);
	}

	let aMinV = Infinity, aMaxV = -Infinity;
	for (const [a] of corners) { if (a < aMinV) aMinV = a; if (a > aMaxV) aMaxV = a; }

	// Rows. The 0.5 is the wrap residual; +/-1 of slack matches computeFillRadii's own safety margin
	// (stroke quads overhang the fill AABB by half a screen stroke width, plus fp slop).
	const iLo = Math.floor(aMinV - 0.5 - extent.aMax) - 1;
	const iHi = Math.ceil(aMaxV + 0.5 - extent.aMin) + 1;
	const rows = iHi - iLo + 1;
	if (rows <= 0 || rows > 4 * MAX_FILL_INSTANCES) return emptyGrid(6);

	const jLo = new Int32Array(rows);
	const jHi = new Int32Array(rows);
	let count = 0;
	for (let i = iLo; i <= iHi; i++) {
		const stripLo = i + extent.aMin - 0.5;
		const stripHi = i + extent.aMax + 0.5;
		// Clip the parallelogram to the strip: take every corner inside it, plus every edge crossing.
		let bLo = Infinity, bHi = -Infinity;
		for (let k = 0; k < 4; k++) {
			const [pa, pb] = corners[k];
			const [qa, qb] = corners[(k + 1) % 4];
			if (pa >= stripLo && pa <= stripHi) { if (pb < bLo) bLo = pb; if (pb > bHi) bHi = pb; }
			for (const bound of [stripLo, stripHi]) {
				if ((pa - bound) * (qa - bound) < 0) {
					const b = pb + ((bound - pa) / (qa - pa)) * (qb - pb);
					if (b < bLo) bLo = b;
					if (b > bHi) bHi = b;
				}
			}
		}
		const r = i - iLo;
		if (bLo > bHi) { jLo[r] = 0; jHi[r] = -1; continue; } // row misses the viewport entirely
		const lo = Math.floor(bLo - 0.5 - extent.bMax) - 1;
		const hi = Math.ceil(bHi + 0.5 - extent.bMin) + 1;
		jLo[r] = lo;
		jHi[r] = hi;
		count += hi - lo + 1;
	}

	if (count <= MAX_FILL_INSTANCES) return { iLo, iHi, jLo, jHi, count, clipped: false };

	// Over budget: drop rows symmetrically from the outside until it fits. Rows are ordered by distance
	// from the view centre only loosely, but the centre row is always the densest part of the band, so
	// trimming the ends keeps what is on screen and sheds what is furthest out.
	let lo = 0, hi = rows - 1, kept = count;
	while (kept > MAX_FILL_INSTANCES && lo < hi) {
		const loN = jHi[lo] - jLo[lo] + 1;
		const hiN = jHi[hi] - jLo[hi] + 1;
		if (loN <= hiN) { kept -= Math.max(0, loN); lo++; } else { kept -= Math.max(0, hiN); hi--; }
	}
	return {
		iLo: iLo + lo,
		iHi: iLo + hi,
		jLo: jLo.slice(lo, hi + 1),
		jHi: jHi.slice(lo, hi + 1),
		count: kept,
		clipped: true,
	};
}

/** Build the flat (i, j) instance pairs a renderer uploads, in row order. */
export function fillGridInstances(g: FillGrid): Float32Array {
	const out = new Float32Array(g.count * 2);
	let n = 0;
	for (let i = g.iLo; i <= g.iHi; i++) {
		const r = i - g.iLo;
		for (let j = g.jLo[r]; j <= g.jHi[r]; j++) {
			out[n++] = i;
			out[n++] = j;
		}
	}
	return out;
}

// Reduce the (pixel-space) pan offset modulo the on-screen lattice {e1, e2} into the centered
// fundamental cell. Because the drawn content is exactly lattice-periodic, subtracting whole lattice
// vectors shifts it by full periods — visually invisible — so panning wraps seamlessly while the copy
// count stays bounded. Applied at draw time only; stored offset is left untouched. Also returns the
// WORLD lattice vector L = ra*v1 + rb*v2 that the wrap removed: the Islamic noise is non-periodic and
// must be sampled at the true (unwrapped) position (world - L), or it snaps at every cell boundary.
export function wrapOffset(
	offset: Vector, v1: Vector, v2: Vector, det: number, zoom: number, rotation: number, deform?: Mat2,
): { draw: Vector; worldShiftX: number; worldShiftY: number } {
	const dDet = det * (isIdentityDeform(deform) ? 1 : mat2Det(deform as Mat2));
	if (Math.abs(dDet) < DEGENERATE_DET || zoom <= 0) {
		return { draw: offset.copy(), worldShiftX: 0, worldShiftY: 0 };
	}
	// Reduce against the DEFORMED screen lattice (that is what is drawn), but report the shift in
	// UNDEFORMED world coordinates: its one consumer is the Islamic noise, which is sampled before D.
	const { e1, e2 } = screenLatticeVectors(v1, v2, zoom, rotation, deform);
	const detM = e1.x * e2.y - e2.x * e1.y;
	const a = (offset.x * e2.y - offset.y * e2.x) / detM;
	const b = (-offset.x * e1.y + offset.y * e1.x) / detM;
	const ra = Math.round(a), rb = Math.round(b);
	return {
		draw: new Vector(offset.x - ra * e1.x - rb * e2.x, offset.y - ra * e1.y - rb * e2.y),
		worldShiftX: ra * v1.x + rb * v2.x,
		worldShiftY: ra * v1.y + rb * v2.y,
	};
}

export interface FlatViewParams {
	offset: { x: number; y: number }; // wrapped pan, centred CSS px, y down
	zoom: number;
	rot: number;
	v1: [number, number];
	v2: [number, number];
	halfW: number; // canvas CSS half-width
	halfH: number; // canvas CSS half-height
	deform?: Mat2; // world-space 2x2, applied before zoom/rot; omitted or identity = the plain camera
}

// EXACT reference for the euclidean-canvas vertex shader. The GLSL must compute the same sx/sy/clip.
// Centred-screen (sx, sy) is y-down (matching worldToScreen in canvasPick.ts and the p5 transform);
// clip is y-up, hence the negated clipY.
export function flatWorldToClip(wx: number, wy: number, i: number, j: number, p: FlatViewParams) {
	const rawX = wx + i * p.v1[0] + j * p.v2[0];
	const rawY = wy + i * p.v1[1] + j * p.v2[1];
	// D is linear, so deforming the replicated point is the same as deforming the cell and the basis —
	// which is exactly why the shader applies it once, here, and the instance grid needs no extra data.
	const d = isIdentityDeform(p.deform) ? { x: rawX, y: rawY } : applyMat2(p.deform as Mat2, rawX, rawY);
	const worldX = d.x, worldY = d.y;
	const cos = Math.cos(p.rot), sin = Math.sin(p.rot);
	const sx = p.offset.x + p.zoom * (cos * worldX + sin * worldY);
	const sy = p.offset.y + p.zoom * (sin * worldX - cos * worldY);
	return { sx, sy, clipX: sx / p.halfW, clipY: -sy / p.halfH };
}
