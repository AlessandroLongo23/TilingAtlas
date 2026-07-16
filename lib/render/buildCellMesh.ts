// Retained-mode fill geometry for the flat WebGL renderer (components/euclidean-canvas.tsx). Parses the
// fundamental cell (reusing parseBaseCell), fan-triangulates each polygon from its centroid, and emits
// a flat triangle-vertex buffer plus a per-vertex hue buffer. The GPU instances this base cell across
// the viewport, so only ONE cell is triangulated regardless of zoom. Fan-from-centroid is valid for
// every catalogue tile: regular tiles are convex and star tiles are star-shaped from their centre.

import { DEGENERATE_DET } from "@/lib/render/flatView";
import {
	parseBaseCell,
	polygonFillHue,
	starApexAngleDeg,
	starHue,
	type TranslationalCellData,
} from "@/lib/utils/renderTiling";

export interface CellMesh {
	fillVerts: Float32Array; // 2 floats per vertex, triangles (x0,y0, x1,y1, ...)
	fillHue: Float32Array; // 1 float per vertex, hue in degrees
	fillVertexCount: number; // = fillVerts.length / 2
	// Stroke: each polygon edge -> a quad (2 triangles, 6 verts). Each stroke vert carries the edge-point
	// world position (strokePos), the world-space unit normal of the edge (strokeNorm), and a side flag
	// (strokeSide, +1 / -1) telling the vertex shader which way to push by half the screen stroke width.
	strokePos: Float32Array;  // 2 floats/vert
	strokeNorm: Float32Array; // 2 floats/vert
	strokeSide: Float32Array; // 1 float/vert
	strokeVertexCount: number;
	v1: [number, number];
	v2: [number, number];
	det: number;
}

export function buildCellMesh(cell: TranslationalCellData | null): CellMesh | null {
	if (!cell) return null;
	const base = parseBaseCell(cell);
	if (!base) return null;

	const [[v1x, v1y], [v2x, v2y]] = base.basis;
	const det = v1x * v2y - v2x * v1y;
	if (!Number.isFinite(det) || Math.abs(det) < DEGENERATE_DET) return null;

	// Count triangles first: each n-gon fans into n triangles.
	let triCount = 0;
	for (const poly of base.polys) triCount += poly.vertices.length;
	if (triCount === 0) return null;

	const fillVerts = new Float32Array(triCount * 3 * 2);
	const fillHue = new Float32Array(triCount * 3);

	let vi = 0; // vertex index into the flat buffers
	for (const poly of base.polys) {
		const vs = poly.vertices;
		let cx = 0, cy = 0;
		for (const v of vs) { cx += v.x; cy += v.y; }
		cx /= vs.length;
		cy /= vs.length;
		// Hue: explicit override (polyominoes) > star hue > regular by-side ramp. Mirrors drawPolygons and
		// buildCellGeom so the shader colour matches the p5 and inversive views exactly.
		const hue = poly.hue ?? (poly.star ? starHue(poly.n, starApexAngleDeg(vs)) : polygonFillHue(vs));
		for (let k = 0; k < vs.length; k++) {
			const a = vs[k];
			const b = vs[(k + 1) % vs.length];
			// Triangle (centroid, a, b).
			fillVerts[vi * 2] = cx; fillVerts[vi * 2 + 1] = cy; fillHue[vi] = hue; vi++;
			fillVerts[vi * 2] = a.x; fillVerts[vi * 2 + 1] = a.y; fillHue[vi] = hue; vi++;
			fillVerts[vi * 2] = b.x; fillVerts[vi * 2 + 1] = b.y; fillHue[vi] = hue; vi++;
		}
	}

	// Stroke quads: one quad per edge. For edge (a,b), the left-normal nrm (world space); the vertex shader
	// offsets each corner by side * halfWidthScreen along the edge normal (constant screen width).
	// Butt-end quad per edge (no miter joins at corners) — a deliberate M1 simplification, fine at the thin
	// default stroke width.
	let sTri = 0;
	for (const poly of base.polys) sTri += poly.vertices.length; // n edges -> n quads -> 2n triangles
	const strokePos = new Float32Array(sTri * 6 * 2);
	const strokeNorm = new Float32Array(sTri * 6 * 2);
	const strokeSide = new Float32Array(sTri * 6);
	let si = 0;
	const pushStroke = (px: number, py: number, nx: number, ny: number, side: number) => {
		strokePos[si * 2] = px; strokePos[si * 2 + 1] = py;
		strokeNorm[si * 2] = nx; strokeNorm[si * 2 + 1] = ny;
		strokeSide[si] = side;
		si++;
	};
	for (const poly of base.polys) {
		const vs = poly.vertices;
		for (let k = 0; k < vs.length; k++) {
			const a = vs[k];
			const b = vs[(k + 1) % vs.length];
			const dx = b.x - a.x, dy = b.y - a.y;
			const len = Math.hypot(dx, dy) || 1;
			const nx = -dy / len, ny = dx / len; // left normal of the edge direction (world space)
			// Two triangles over { a-, a+, b-, b+ }: (a-, a+, b-) and (b-, a+, b+).
			pushStroke(a.x, a.y, nx, ny, -1);
			pushStroke(a.x, a.y, nx, ny, +1);
			pushStroke(b.x, b.y, nx, ny, -1);
			pushStroke(b.x, b.y, nx, ny, -1);
			pushStroke(a.x, a.y, nx, ny, +1);
			pushStroke(b.x, b.y, nx, ny, +1);
		}
	}

	return {
		fillVerts,
		fillHue,
		fillVertexCount: vi,
		strokePos,
		strokeNorm,
		strokeSide,
		strokeVertexCount: si,
		v1: [v1x, v1y],
		v2: [v2x, v2y],
		det,
	};
}
