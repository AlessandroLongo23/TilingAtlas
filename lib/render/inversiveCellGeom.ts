// Cell geometry buffers for the analytic inversive view. Instead of rasterising the fundamental domain
// into a texture and resampling it (which blurs under the conformal map and seams at the fract() wrap),
// we hand the shader the cell's actual polygons and let it decide each pixel analytically: which polygon
// contains the point (→ fill colour) and the distance to the nearest edge (→ a crisp, screen-width
// stroke). Testing the 3×3 block of lattice copies makes point-location and edge distance continuous
// across cell boundaries, so there is no seam.
//
// The geometry is uploaded as two RGBA32F data textures (sampled with texelFetch, no filtering):
//   verts — every polygon's world vertices, (x, y) in the R,G channels, all polygons concatenated.
//   meta  — two texels per polygon: [start, count, hue, 0] and [minX, minY, maxX, maxY] (world bbox).

import {
	parseBaseCell,
	polygonFillHue,
	starApexAngleDeg,
	starHue,
	type TranslationalCellData,
} from "@/lib/utils/renderTiling";

export interface CellGeom {
	verts: Float32Array; // RGBA32F payload, 4 floats/texel: [x, y, 0, 0]
	vertsW: number; // vertex texture width (texels)
	vertsH: number; // vertex texture height (texels)
	meta: Float32Array; // RGBA32F payload, width = 2 * polyCount, height = 1
	polyCount: number;
	minv: [number, number, number, number]; // world -> lattice (a, b), row-major
	v1: [number, number];
	v2: [number, number];
	avg: [number, number, number]; // area-weighted average fill colour (the centre blends to this)
	feature: number; // median tile-edge length (world) — the resolution scale the centre fade tracks
}

// Matches the shader's hsb2rgb(hue/360, s, v); used to precompute the average fill colour on the CPU.
function hsb2rgb(h: number, s: number, v: number): [number, number, number] {
	const f = (n: number) => {
		const k = Math.min(Math.max(Math.abs(((h * 6 + n) % 6) - 3) - 1, 0), 1);
		return v * (1 - s + s * k);
	};
	return [f(0), f(4), f(2)];
}

const VERTS_TEX_W = 1024;

export function buildCellGeom(cell: TranslationalCellData | null): CellGeom | null {
	if (!cell) return null;
	const base = parseBaseCell(cell);
	if (!base) return null;

	const [[v1x, v1y], [v2x, v2y]] = base.basis;
	const det = v1x * v2y - v2x * v1y;
	if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;

	const polyCount = base.polys.length;
	if (polyCount === 0) return null;

	const totalVerts = base.polys.reduce((s, p) => s + p.vertices.length, 0);
	const vertsW = Math.min(VERTS_TEX_W, Math.max(1, totalVerts));
	const vertsH = Math.max(1, Math.ceil(totalVerts / vertsW));
	const verts = new Float32Array(vertsW * vertsH * 4);
	const meta = new Float32Array(polyCount * 2 * 4);

	// Lattice reduction of a world point to (a, b).
	const m00 = v2y / det, m01 = -v2x / det, m10 = -v1y / det, m11 = v1x / det;

	let vi = 0;
	let avgR = 0, avgG = 0, avgB = 0, avgW = 0;
	for (let p = 0; p < polyCount; p++) {
		const poly = base.polys[p];
		const start = vi;

		// The cell's polygons can be anchored anywhere in the plane — many lattice cells from the origin.
		// Normalise each one so its centroid lands in the fundamental parallelogram [0,1)², shifting by a
		// whole lattice vector (a valid periodic copy). Then the shader's 3×3 neighbour test around the
		// reduced pixel covers every polygon; otherwise far-anchored tiles render as background holes.
		let cx = 0, cy = 0;
		for (const v of poly.vertices) { cx += v.x; cy += v.y; }
		cx /= poly.vertices.length;
		cy /= poly.vertices.length;
		const fa = Math.floor(m00 * cx + m01 * cy);
		const fb = Math.floor(m10 * cx + m11 * cy);
		const shx = fa * v1x + fb * v2x;
		const shy = fa * v1y + fb * v2y;

		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const v of poly.vertices) {
			const x = v.x - shx;
			const y = v.y - shy;
			const o = vi * 4;
			verts[o] = x;
			verts[o + 1] = y;
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
			vi++;
		}
		const hue = poly.star
			? starHue(poly.n, starApexAngleDeg(poly.vertices))
			: polygonFillHue(poly.vertices);

		// Area-weighted average fill colour (shoelace on the original vertices; area is shift-invariant).
		let area2 = 0;
		for (let k = 0; k < poly.vertices.length; k++) {
			const a = poly.vertices[k];
			const b = poly.vertices[(k + 1) % poly.vertices.length];
			area2 += a.x * b.y - b.x * a.y;
		}
		const area = Math.abs(area2) * 0.5;
		const [pr, pg, pb] = hsb2rgb(hue / 360, 0.36, 1);
		avgR += pr * area;
		avgG += pg * area;
		avgB += pb * area;
		avgW += area;

		const m = p * 2 * 4;
		meta[m] = start;
		meta[m + 1] = poly.vertices.length;
		meta[m + 2] = hue;
		meta[m + 3] = 0;
		meta[m + 4] = minX;
		meta[m + 5] = minY;
		meta[m + 6] = maxX;
		meta[m + 7] = maxY;
	}

	return {
		verts,
		vertsW,
		vertsH,
		meta,
		polyCount,
		minv: [m00, m01, m10, m11],
		v1: [v1x, v1y],
		v2: [v2x, v2y],
		avg: avgW > 0 ? [avgR / avgW, avgG / avgW, avgB / avgW] : [0.5, 0.5, 0.5],
		feature: base.medianEdge,
	};
}
