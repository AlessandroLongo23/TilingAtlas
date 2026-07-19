// Retained-mode fill geometry for the flat WebGL renderer (components/euclidean-canvas.tsx). Parses the
// fundamental cell (reusing parseBaseCell), fan-triangulates each polygon from its centroid, and emits
// a flat triangle-vertex buffer plus a per-vertex hue buffer. The GPU instances this base cell across
// the viewport, so only ONE cell is triangulated regardless of zoom. Fan-from-centroid is valid for
// every catalogue tile: regular tiles are convex and star tiles are star-shaped from their centre.

import { DEGENERATE_DET, latticeExtentFromBounds, type LatticeExtent } from "@/lib/render/flatView";
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
	// Per fill-vertex, the centroid (fan apex = vertex-average) of the polygon that vertex belongs to.
	// The selection-transition wave (M2) scales each tile about this point in the vertex shader; leaving
	// it here means fill and stroke collapse about the exact same centre and stay registered. Unused when
	// the wave is off (uWavePhase == 0), so the theory cards / FlatCellRenderer ignore it harmlessly.
	fillCentroid: Float32Array; // 2 floats/vert
	fillVertexCount: number; // = fillVerts.length / 2
	// Stroke: each polygon edge -> a quad (2 triangles, 6 verts). Each stroke vert carries the edge-point
	// world position (strokePos), the world-space unit normal of the edge (strokeNorm), and a side flag
	// (strokeSide, +1 / -1) telling the vertex shader which way to push by half the screen stroke width.
	strokePos: Float32Array;  // 2 floats/vert
	strokeNorm: Float32Array; // 2 floats/vert
	strokeSide: Float32Array; // 1 float/vert
	strokeCentroid: Float32Array; // 2 floats/vert — same tile fan apex as fillCentroid, for the wave
	strokeVertexCount: number;
	// Points (showPolygonPoints): per centroid/halfway/vertex a screen-constant disk drawn as a quad (6
	// verts). Each vert carries the point's world position (pointPos), a unit-quad corner in [-1,1]
	// (pointCorner — the SDF disk + border are computed from it in the fragment shader), and the point's
	// RGB colour (pointColor: centroid red, halfway green, vertex blue, matching Tiling.show). Instanced by
	// the same lattice grid as the fill.
	pointPos: Float32Array;    // 2 floats/vert
	pointCorner: Float32Array; // 2 floats/vert
	pointColor: Float32Array;  // 3 floats/vert
	pointVertexCount: number;
	v1: [number, number];
	v2: [number, number];
	det: number;
	// Content bounding box in lattice coordinates — feeds computeFillRadii so the instance grid reaches
	// the viewport even when the cell's polygons sit periods away from their anchor.
	extent: LatticeExtent;
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
	const fillCentroid = new Float32Array(triCount * 3 * 2);

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
			// Triangle (centroid, a, b). Every vertex carries the fan-apex centroid so the wave shader can
			// scale the whole triangle about it (vertex 0 already IS the centroid; a/b need it too).
			fillVerts[vi * 2] = cx; fillVerts[vi * 2 + 1] = cy; fillHue[vi] = hue;
			fillCentroid[vi * 2] = cx; fillCentroid[vi * 2 + 1] = cy; vi++;
			fillVerts[vi * 2] = a.x; fillVerts[vi * 2 + 1] = a.y; fillHue[vi] = hue;
			fillCentroid[vi * 2] = cx; fillCentroid[vi * 2 + 1] = cy; vi++;
			fillVerts[vi * 2] = b.x; fillVerts[vi * 2 + 1] = b.y; fillHue[vi] = hue;
			fillCentroid[vi * 2] = cx; fillCentroid[vi * 2 + 1] = cy; vi++;
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
	const strokeCentroid = new Float32Array(sTri * 6 * 2);
	let si = 0;
	let scx = 0, scy = 0; // the current polygon's fan apex, set per poly below
	const pushStroke = (px: number, py: number, nx: number, ny: number, side: number) => {
		strokePos[si * 2] = px; strokePos[si * 2 + 1] = py;
		strokeNorm[si * 2] = nx; strokeNorm[si * 2 + 1] = ny;
		strokeSide[si] = side;
		strokeCentroid[si * 2] = scx; strokeCentroid[si * 2 + 1] = scy;
		si++;
	};
	for (const poly of base.polys) {
		const vs = poly.vertices;
		scx = 0; scy = 0;
		for (const v of vs) { scx += v.x; scy += v.y; }
		scx /= vs.length; scy /= vs.length;
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

	// Point disks: centroid + edge-midpoints (halfways) + vertices, each a 6-vert quad for a screen-
	// constant dot. Shared vertices/halfways between adjacent polygons are emitted per polygon (harmless
	// overdraw — the disks are opaque and identical), mirroring Tiling.show's per-node loop.
	const QUAD: readonly [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
	let pCount = 0;
	for (const poly of base.polys) pCount += 1 + 2 * poly.vertices.length; // centroid + n halfways + n vertices
	const pointPos = new Float32Array(pCount * 6 * 2);
	const pointCorner = new Float32Array(pCount * 6 * 2);
	const pointColor = new Float32Array(pCount * 6 * 3);
	let ptv = 0;
	const pushPoint = (px: number, py: number, r: number, g: number, b: number) => {
		for (const [qx, qy] of QUAD) {
			pointPos[ptv * 2] = px; pointPos[ptv * 2 + 1] = py;
			pointCorner[ptv * 2] = qx; pointCorner[ptv * 2 + 1] = qy;
			pointColor[ptv * 3] = r; pointColor[ptv * 3 + 1] = g; pointColor[ptv * 3 + 2] = b;
			ptv++;
		}
	};
	for (const poly of base.polys) {
		const vs = poly.vertices;
		let cx = 0, cy = 0;
		for (const v of vs) { cx += v.x; cy += v.y; }
		cx /= vs.length; cy /= vs.length;
		pushPoint(cx, cy, 1, 0, 0); // centroid: red
		for (let k = 0; k < vs.length; k++) {
			const a = vs[k], b = vs[(k + 1) % vs.length];
			pushPoint((a.x + b.x) / 2, (a.y + b.y) / 2, 0, 1, 0); // halfway (edge midpoint): green
		}
		for (const v of vs) pushPoint(v.x, v.y, 0, 0, 1); // vertex: blue
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
		pointPos,
		pointCorner,
		pointColor,
		pointVertexCount: ptv,
		v1: [v1x, v1y],
		v2: [v2x, v2y],
		det,
		extent: latticeExtentFromBounds(
			base.minX, base.maxX, base.minY, base.maxY,
			{ x: v1x, y: v1y }, { x: v2x, y: v2y }, det,
		),
	};
}
