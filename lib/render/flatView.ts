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
export function screenLatticeVectors(v1: Vector, v2: Vector, zoom: number, rotation: number) {
	const c = Math.cos(rotation), s = Math.sin(rotation);
	const e = (v: Vector) => ({ x: zoom * (c * v.x + s * v.y), y: zoom * (s * v.x - c * v.y) });
	return { e1: e(v1), e2: e(v2) };
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
	extent: LatticeExtent,
): { Ri: number; Rj: number } {
	if (Math.abs(det) < DEGENERATE_DET || zoomForFill <= 0) return { Ri: 6, Rj: 6 };
	const { e1, e2 } = screenLatticeVectors(v1, v2, zoomForFill, rotation);
	const detM = e1.x * e2.y - e2.x * e1.y; // = zoomForFill^2 * det (rotation-invariant)
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

// Reduce the (pixel-space) pan offset modulo the on-screen lattice {e1, e2} into the centered
// fundamental cell. Because the drawn content is exactly lattice-periodic, subtracting whole lattice
// vectors shifts it by full periods — visually invisible — so panning wraps seamlessly while the copy
// count stays bounded. Applied at draw time only; stored offset is left untouched. Also returns the
// WORLD lattice vector L = ra*v1 + rb*v2 that the wrap removed: the Islamic noise is non-periodic and
// must be sampled at the true (unwrapped) position (world - L), or it snaps at every cell boundary.
export function wrapOffset(
	offset: Vector, v1: Vector, v2: Vector, det: number, zoom: number, rotation: number,
): { draw: Vector; worldShiftX: number; worldShiftY: number } {
	if (Math.abs(det) < DEGENERATE_DET || zoom <= 0) {
		return { draw: offset.copy(), worldShiftX: 0, worldShiftY: 0 };
	}
	const { e1, e2 } = screenLatticeVectors(v1, v2, zoom, rotation);
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
}

// EXACT reference for the euclidean-canvas vertex shader. The GLSL must compute the same sx/sy/clip.
// Centred-screen (sx, sy) is y-down (matching worldToScreen in canvasPick.ts and the p5 transform);
// clip is y-up, hence the negated clipY.
export function flatWorldToClip(wx: number, wy: number, i: number, j: number, p: FlatViewParams) {
	const worldX = wx + i * p.v1[0] + j * p.v2[0];
	const worldY = wy + i * p.v1[1] + j * p.v2[1];
	const cos = Math.cos(p.rot), sin = Math.sin(p.rot);
	const sx = p.offset.x + p.zoom * (cos * worldX + sin * worldY);
	const sy = p.offset.y + p.zoom * (sin * worldX - cos * worldY);
	return { sx, sy, clipX: sx / p.halfW, clipY: -sy / p.halfH };
}
