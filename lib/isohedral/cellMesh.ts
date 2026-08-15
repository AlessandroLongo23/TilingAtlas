/**
 * A `CellMesh` for `FlatCellRenderer`, built by ear clipping.
 *
 * An isohedral tiling is periodic, so it belongs on the atlas' flat Euclidean renderer: upload one
 * translational cell, and the vertex shader instances it over the visible lattice every frame
 * (lib/render/flatTilingGL.ts, lib/render/flatView.ts). The tiling is then genuinely unbounded — pan
 * or zoom out as far as you like and it keeps going, with no patch edge to run into and no CPU cost
 * per frame.
 *
 * Why this exists instead of `lib/render/buildCellMesh.ts`, which produces the same structure: that one
 * fanned every polygon from its centroid, which was valid for the whole /play catalogue ("regular tiles
 * are convex and star tiles are star-shaped from their centre") and NOT valid here. The edge-curvature
 * sliders are exactly a way to make a tile that is not star-shaped about its centroid — an S edge bowed
 * hard enough cuts a notch the fan apex cannot see, and the fan then paints triangles outside the tile.
 * Ear clipping (lib/render/triangulate.ts) is correct for any simple polygon, so this builder uses it.
 *
 * ⚑ /play stopped being safe on 2026-08-09, when the period-p sliders were extended past the convexity
 * cut and its catalogue gained concave tiles. buildCellMesh now takes the same ear-clipping path when
 * the centroid is outside the kernel, so the two builders no longer disagree about what is drawable —
 * this one still exists for the buffer layout (no point overlay) and the per-prototile mesh reuse.
 *
 * The stroke and extent code below is the same construction as buildCellMesh's, deliberately: the
 * shader reads those buffers with a fixed contract. Points are not emitted — this page has no
 * equivalent of /play's vertex-dot overlay — so the buffers are empty and `showPoints` is never set.
 */

import type { CellMesh } from "@/lib/render/buildCellMesh";
import { DEGENERATE_DET, latticeExtentFromBounds } from "@/lib/render/flatView";
import { triangulate } from "@/lib/render/triangulate";
import type { RawPolygon } from "@/lib/utils/renderTiling";

const EMPTY = new Float32Array(0);

/**
 * How much heavier an open path draws than a tile edge.
 *
 * The stroke shader multiplies `aSide` straight into the half-width, so the attribute that carries which
 * side of the segment a corner is on carries the width too. A mark wants to sit a little above the net it
 * decorates without becoming a second kind of line.
 */
const MARK_STROKE_SCALE = 1.45;

export function buildIsohedralCellMesh(
	polys: RawPolygon[],
	v1: [number, number],
	v2: [number, number],
): CellMesh | null {
	const [v1x, v1y] = v1;
	const [v2x, v2y] = v2;
	const det = v1x * v2y - v2x * v1y;
	if (!Number.isFinite(det) || Math.abs(det) < DEGENERATE_DET) return null;
	if (polys.length === 0) return null;

	// Ear clipping yields n−2 triangles for an n-gon, against the centroid fan's n. Open paths contribute
	// none: they are marks, drawn as line only.
	let triCount = 0;
	for (const poly of polys) if (!poly.open) triCount += Math.max(0, poly.vertices.length - 2);
	if (triCount === 0) return null;

	const fillVerts = new Float32Array(triCount * 3 * 2);
	const fillHue = new Float32Array(triCount * 3);
	const fillCentroid = new Float32Array(triCount * 3 * 2);

	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	let vi = 0;

	/**
	 * Triangulate ONCE and reuse the index list for every tile in the cell.
	 *
	 * Every tile here is an affine image of the same prototile, and a triangulation is a combinatorial
	 * fact about the polygon: any affine bijection carries a valid one to a valid one. A reflected
	 * aspect gets its triangles wound the other way, which does not matter because the fill shader does
	 * no face culling.
	 *
	 * This is what makes a fine tessellation affordable. Ear clipping is O(n²) per polygon, so a
	 * 400-vertex outline across 108 tiles is 17 million operations done 108 times over for no reason;
	 * once, it is 160 thousand. Guarded on the vertex counts agreeing, and falls back per polygon if
	 * they ever do not.
	 */
	const fillable = polys.filter((p) => !p.open);
	const shared = fillable[0]?.vertices.length ?? 0;
	const uniform = fillable.length > 0 && fillable.every((p) => p.vertices.length === shared);
	const sharedIdx = uniform && shared >= 3 ? triangulate(fillable[0].vertices) : null;

	for (const poly of fillable) {
		const vs = poly.vertices;
		if (vs.length < 3) continue;
		let cx = 0, cy = 0;
		for (const v of vs) {
			cx += v.x;
			cy += v.y;
			if (v.x < minX) minX = v.x;
			if (v.x > maxX) maxX = v.x;
			if (v.y < minY) minY = v.y;
			if (v.y > maxY) maxY = v.y;
		}
		cx /= vs.length;
		cy /= vs.length;
		// Colour is assigned per tile upstream (Tactile's three-colouring), never derived from the
		// outline: a curved tile's vertex count is a flattening artefact and would swing the by-side
		// ramp around as the curvature slider moves.
		const hue = poly.hue ?? 0;

		const idx = sharedIdx ?? triangulate(vs);
		for (let t = 0; t < idx.length; t += 3) {
			for (let k = 0; k < 3; ++k) {
				const p = vs[idx[t + k]];
				fillVerts[vi * 2] = p.x;
				fillVerts[vi * 2 + 1] = p.y;
				fillHue[vi] = hue;
				// The fan apex the selection-wave shader scales about. Unused here (uWavePhase stays 0),
				// but the attribute is bound unconditionally, so it must be real data.
				fillCentroid[vi * 2] = cx;
				fillCentroid[vi * 2 + 1] = cy;
				vi++;
			}
		}
	}

	if (!Number.isFinite(minX)) return null;

	// One quad (2 triangles, 6 verts) per polygon edge. The vertex shader pushes each corner along the
	// edge normal by half the screen stroke width, so the line stays a constant width at any zoom.
	//
	// An open path has one fewer segment than it has vertices: it is a drawn mark, and closing it back to
	// its first point would turn a ⌐ into a triangle.
	let edgeCount = 0;
	for (const poly of polys) edgeCount += poly.open ? Math.max(0, poly.vertices.length - 1) : poly.vertices.length;
	const strokePos = new Float32Array(edgeCount * 6 * 2);
	const strokeNorm = new Float32Array(edgeCount * 6 * 2);
	const strokeSide = new Float32Array(edgeCount * 6);
	const strokeCentroid = new Float32Array(edgeCount * 6 * 2);

	let si = 0;
	let scx = 0, scy = 0;
	const pushStroke = (px: number, py: number, nx: number, ny: number, side: number) => {
		strokePos[si * 2] = px;
		strokePos[si * 2 + 1] = py;
		strokeNorm[si * 2] = nx;
		strokeNorm[si * 2 + 1] = ny;
		strokeSide[si] = side;
		strokeCentroid[si * 2] = scx;
		strokeCentroid[si * 2 + 1] = scy;
		si++;
	};

	for (const poly of polys) {
		const vs = poly.vertices;
		if (vs.length < (poly.open ? 2 : 3)) continue;
		scx = 0;
		scy = 0;
		for (const v of vs) {
			scx += v.x;
			scy += v.y;
		}
		scx /= vs.length;
		scy /= vs.length;
		const segs = poly.open ? vs.length - 1 : vs.length;
		const w = poly.open ? MARK_STROKE_SCALE : 1;
		for (let k = 0; k < segs; k++) {
			const a = vs[k];
			const b = vs[(k + 1) % vs.length];
			const dx = b.x - a.x, dy = b.y - a.y;
			const len = Math.hypot(dx, dy) || 1;
			const nx = -dy / len, ny = dx / len;
			pushStroke(a.x, a.y, nx, ny, -w);
			pushStroke(a.x, a.y, nx, ny, +w);
			pushStroke(b.x, b.y, nx, ny, -w);
			pushStroke(b.x, b.y, nx, ny, -w);
			pushStroke(a.x, a.y, nx, ny, +w);
			pushStroke(b.x, b.y, nx, ny, +w);
		}
	}

	return {
		fillVerts,
		fillHue,
		fillCentroid,
		fillVertexCount: vi,
		strokePos,
		strokeNorm,
		strokeSide,
		strokeCentroid,
		strokeVertexCount: si,
		pointPos: EMPTY,
		pointCorner: EMPTY,
		pointColor: EMPTY,
		pointVertexCount: 0,
		v1: [v1x, v1y],
		v2: [v2x, v2y],
		det,
		extent: latticeExtentFromBounds(
			minX, maxX, minY, maxY,
			{ x: v1x, y: v1y }, { x: v2x, y: v2y }, det,
		),
	};
}
