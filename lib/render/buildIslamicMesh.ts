// Retained-mode geometry for the Islamic WebGL view (components/islamic-canvas.tsx). Turns the pooled
// A/B/C arrangement (colorFacesAbc) and the construction segments into flat GPU buffers: fan-triangulated
// face fills carrying a per-vertex hue + class, plus one butt-cap quad per construction segment for the
// borders. Unlike buildCellMesh this is NOT a periodic unit cell — it is the whole pooled patch drawn in
// one non-instanced pass, so panning is a pure uniform update (the p5 immediate-mode redraw was the cost).
//
// Triangulation is fan-from-centroid, valid for every face this construction produces on the regular
// Euclidean tilings: star bodies are star-shaped about their centroid and the background faces (diamonds,
// kites, convex fields) are convex. A genuinely concave, non-star-shaped background face (possible on
// fivefold/girih tile sets, not yet in scope) would need ear-clipping instead.

import type { Vector } from "@/classes/Vector";
import type { AbcFace, Face, Segment } from "@/utils/islamicArrangement";

export interface IslamicMesh {
	fillVerts: Float32Array;  // 2 floats/vert, triangles
	fillHue: Float32Array;    // 1 float/vert, hue degrees (class A only; 0 otherwise)
	fillClass: Float32Array;  // 1 float/vert, 0 = A (tile hue), 1 = B (side field), 2 = C (edge diamond)
	fillVertexCount: number;
	// Stroke: each segment -> a butt quad (2 triangles, 6 verts). strokePos = endpoint world position,
	// strokeNorm = the segment's world-space unit normal, strokeSide = ±1 (which way to push by half the
	// screen stroke width). Same scheme as buildCellMesh so the Islamic border matches the flat border.
	strokePos: Float32Array;
	strokeNorm: Float32Array;
	strokeSide: Float32Array;
	strokeVertexCount: number;
}

// classNum: A -> 0, B -> 1, C -> 2. When the split is degenerate (A straddles both parities), C collapses
// to B so the whole background reads as one colour (the two-tone fallback), matching drawIslamicStarFill.
function classNum(klass: "A" | "B" | "C", degenerate: boolean): number {
	if (klass === "A") return 0;
	if (klass === "C" && !degenerate) return 2;
	return 1;
}

// One flat-shaded face for the assembler: its polygon plus the two per-vertex fill channels the shader
// reads — `hue` (used by class A only) and `cls` (the fill-class / colour index).
interface FillFace { vertices: Vector[]; hue: number; cls: number; }

// Fan-triangulate a list of faces (from their centroids) and emit one butt quad per construction segment.
// Shared by the A/B/C plain fill and the checkerboard two-colour fill — they differ only in how each face's
// (hue, cls) is chosen, computed by the caller.
function assembleMesh(faces: FillFace[], segments: Segment[]): IslamicMesh {
	let triCount = 0;
	for (const f of faces) triCount += f.vertices.length;
	const fillVerts = new Float32Array(triCount * 3 * 2);
	const fillHue = new Float32Array(triCount * 3);
	const fillClass = new Float32Array(triCount * 3);

	let vi = 0;
	for (const { vertices: vs, hue, cls } of faces) {
		let cx = 0, cy = 0;
		for (const v of vs) { cx += v.x; cy += v.y; }
		cx /= vs.length; cy /= vs.length;
		for (let k = 0; k < vs.length; k++) {
			const a = vs[k], b = vs[(k + 1) % vs.length];
			fillVerts[vi * 2] = cx; fillVerts[vi * 2 + 1] = cy; fillHue[vi] = hue; fillClass[vi] = cls; vi++;
			fillVerts[vi * 2] = a.x; fillVerts[vi * 2 + 1] = a.y; fillHue[vi] = hue; fillClass[vi] = cls; vi++;
			fillVerts[vi * 2] = b.x; fillVerts[vi * 2 + 1] = b.y; fillHue[vi] = hue; fillClass[vi] = cls; vi++;
		}
	}

	// Stroke: one butt quad per construction segment (no miter joins — fine at the thin default width).
	const strokePos = new Float32Array(segments.length * 6 * 2);
	const strokeNorm = new Float32Array(segments.length * 6 * 2);
	const strokeSide = new Float32Array(segments.length * 6);
	let si = 0;
	const push = (px: number, py: number, nx: number, ny: number, side: number) => {
		strokePos[si * 2] = px; strokePos[si * 2 + 1] = py;
		strokeNorm[si * 2] = nx; strokeNorm[si * 2 + 1] = ny;
		strokeSide[si] = side; si++;
	};
	for (const [a, b] of segments) {
		const dx = b.x - a.x, dy = b.y - a.y;
		const len = Math.hypot(dx, dy) || 1;
		const nx = -dy / len, ny = dx / len; // left normal of the segment direction
		// Two triangles over { a-, a+, b-, b+ }: (a-, a+, b-) and (b-, a+, b+).
		push(a.x, a.y, nx, ny, -1);
		push(a.x, a.y, nx, ny, +1);
		push(b.x, b.y, nx, ny, -1);
		push(b.x, b.y, nx, ny, -1);
		push(a.x, a.y, nx, ny, +1);
		push(b.x, b.y, nx, ny, +1);
	}

	return {
		fillVerts, fillHue, fillClass, fillVertexCount: vi,
		strokePos, strokeNorm, strokeSide, strokeVertexCount: si,
	};
}

export function buildIslamicMesh(abc: AbcFace[], segments: Segment[], degenerate: boolean): IslamicMesh {
	return assembleMesh(
		abc.map(({ face, klass, hue }) => ({ vertices: face.vertices, hue, cls: classNum(klass, degenerate) })),
		segments,
	);
}

// The lattice cell (i,j) a world point falls in = round of its (v1,v2) coordinates. A face/segment
// "belongs" to the cell its centre reduces to.
export function latticeCellOf(
	px: number, py: number, v1: readonly [number, number], v2: readonly [number, number],
): [number, number] {
	const det = v1[0] * v2[1] - v2[0] * v1[1];
	if (Math.abs(det) < 1e-12) return [0, 0];
	const s = (v2[1] * px - v2[0] * py) / det;
	const t = (-v1[1] * px + v1[0] * py) / det;
	const i = Math.round(s), j = Math.round(t);
	return [i === 0 ? 0 : i, j === 0 ? 0 : j]; // normalise -0 → 0 so the tuple compares cleanly

}

// Instanced-mode geometry. Given the arrangement of a FIXED patch (a few cells around the origin), keep
// only the faces/segments whose centre reduces to the origin lattice cell, then triangulate those. The
// caller instances the result across the viewport (aInst = i,j; world = aPos + i·v1 + j·v2), so a rebuild
// costs the fixed patch, not the zoom level. Faces reach past the origin cell (straps cross tile edges) —
// that is fine: each periodic face has exactly one representative here and its lattice copies are the
// other cells' representatives, so the instances tile the plane with no gaps and no double-paint (no
// clipping needed). Classification + degenerate flag are computed over the whole patch (enough context),
// then the geometry is filtered, so the A/B/C colours stay correct and periodic across instances.
export function buildInstancedIslamicMesh(
	abc: AbcFace[], segments: Segment[], degenerate: boolean,
	v1: readonly [number, number], v2: readonly [number, number],
): IslamicMesh {
	const keptFaces = abc.filter(({ face }) => {
		const vs = face.vertices;
		let cx = 0, cy = 0;
		for (const v of vs) { cx += v.x; cy += v.y; }
		const [i, j] = latticeCellOf(cx / vs.length, cy / vs.length, v1, v2);
		return i === 0 && j === 0;
	});
	const keptSegs = segments.filter(([a, b]) => {
		const [i, j] = latticeCellOf((a.x + b.x) / 2, (a.y + b.y) / 2, v1, v2);
		return i === 0 && j === 0;
	});
	return buildIslamicMesh(keptFaces, keptSegs, degenerate);
}

// Checkerboard (zellij) instanced mesh: like buildInstancedIslamicMesh but the fill is the bipartite
// two-colouring (twoColorFaces) instead of the A/B/C classes. Each kept face carries its colour index
// (0/1) in fillClass; the fill shader maps 0→colour A, 1→colour B (uniforms). `colors[i]` is the colour of
// `faces[i]` (parallel arrays, as twoColorFaces returns). Segments are the same black construction lines.
export function buildInstancedCheckerMesh(
	faces: Face[], colors: number[], segments: Segment[],
	v1: readonly [number, number], v2: readonly [number, number],
): IslamicMesh {
	const kept: FillFace[] = [];
	for (let fi = 0; fi < faces.length; fi++) {
		const vs = faces[fi].vertices;
		let cx = 0, cy = 0;
		for (const v of vs) { cx += v.x; cy += v.y; }
		const [i, j] = latticeCellOf(cx / vs.length, cy / vs.length, v1, v2);
		if (i === 0 && j === 0) kept.push({ vertices: vs, hue: 0, cls: colors[fi] === 0 ? 0 : 1 });
	}
	const keptSegs = segments.filter(([a, b]) => {
		const [i, j] = latticeCellOf((a.x + b.x) / 2, (a.y + b.y) / 2, v1, v2);
		return i === 0 && j === 0;
	});
	return assembleMesh(kept, keptSegs);
}
