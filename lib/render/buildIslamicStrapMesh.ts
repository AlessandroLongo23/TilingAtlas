// Retained-mode geometry for the Islamic INTERLACE / OUTLINE / EMBOSS styles (M4-rest), the GPU port of
// Tiling.drawIslamicInterlace. buildIslamicInterlace already turns the pooled construction segments into
// woven `Band`s (one per interlace edge): each band is a convex `fill` quad (the solid strap body) plus a
// few `outline` border segments carrying a world-space normal. The over/under illusion is baked into the
// outline endpoints (an under strand's side edges stop on the over strand's edge), so the GPU just fills
// the quads and strokes the borders — no weave logic in the shader.
//
// Like the plain A/B/C path this keeps only the ORIGIN-CELL representatives (a band whose fill centroid
// reduces to the origin lattice cell) and lets the shader instance them (aInst = i,j; world = aPos +
// i·v1 + j·v2). The weave and the emboss lighting are lattice-periodic (a band's copy has the same
// over/under state and the same world normal), so the instances tile with no seam.

import type { Vector } from "@/classes/Vector";
import type { Band, OutlineSeg } from "@/lib/utils/islamicInterlace";
import { latticeCellOf } from "@/lib/render/buildIslamicMesh";

export interface StrapMesh {
	// Strap bodies: fan of triangles, drawn in one solid colour (a fill uniform). No per-vertex colour.
	fillVerts: Float32Array;   // 2 floats/vert
	fillVertexCount: number;
	// Strap borders: one butt quad per outline segment, each vertex carrying a baked colour (dark warm for
	// interlace/outline, or the emboss highlight/shadow chosen from the segment's normal vs the light).
	borderPos: Float32Array;   // 2 floats/vert
	borderNorm: Float32Array;  // 2 floats/vert
	borderSide: Float32Array;  // 1 float/vert
	borderColor: Float32Array; // 3 floats/vert
	borderVertexCount: number;
}

function centroid(vs: readonly Vector[]): [number, number] {
	let cx = 0, cy = 0;
	for (const v of vs) { cx += v.x; cy += v.y; }
	return [cx / vs.length, cy / vs.length];
}

export function buildInstancedStrapMesh(
	bands: Band[],
	v1: readonly [number, number], v2: readonly [number, number],
	borderColorOf: (seg: OutlineSeg) => readonly [number, number, number],
): StrapMesh {
	// Keep the bands whose fill centroid reduces to the origin cell (their lattice copies are the shader's
	// other instances). The outline of a kept band goes with it, so fill and border stay in register.
	const kept: Band[] = [];
	for (const b of bands) {
		if (b.fill.length < 3) continue;
		const [cx, cy] = centroid(b.fill);
		const [i, j] = latticeCellOf(cx, cy, v1, v2);
		if (i === 0 && j === 0) kept.push(b);
	}

	// Fill: triangulate each convex quad by its diagonal (v0,v1,v2)+(v0,v2,v3); an n-gon fans (v0,vk,vk+1).
	let fillTris = 0;
	for (const b of kept) fillTris += b.fill.length - 2;
	const fillVerts = new Float32Array(fillTris * 3 * 2);
	let fi = 0;
	for (const b of kept) {
		const vs = b.fill;
		for (let k = 1; k < vs.length - 1; k++) {
			fillVerts[fi * 2] = vs[0].x; fillVerts[fi * 2 + 1] = vs[0].y; fi++;
			fillVerts[fi * 2] = vs[k].x; fillVerts[fi * 2 + 1] = vs[k].y; fi++;
			fillVerts[fi * 2] = vs[k + 1].x; fillVerts[fi * 2 + 1] = vs[k + 1].y; fi++;
		}
	}

	// Border: one butt quad per outline segment (same push scheme as the construction-line strokes), each
	// vertex tagged with the segment's baked colour.
	let segCount = 0;
	for (const b of kept) segCount += b.outline.length;
	const borderPos = new Float32Array(segCount * 6 * 2);
	const borderNorm = new Float32Array(segCount * 6 * 2);
	const borderSide = new Float32Array(segCount * 6);
	const borderColor = new Float32Array(segCount * 6 * 3);
	let si = 0;
	const push = (px: number, py: number, nx: number, ny: number, side: number, col: readonly [number, number, number]) => {
		borderPos[si * 2] = px; borderPos[si * 2 + 1] = py;
		borderNorm[si * 2] = nx; borderNorm[si * 2 + 1] = ny;
		borderSide[si] = side;
		borderColor[si * 3] = col[0]; borderColor[si * 3 + 1] = col[1]; borderColor[si * 3 + 2] = col[2];
		si++;
	};
	for (const b of kept) {
		for (const s of b.outline) {
			const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
			const len = Math.hypot(dx, dy) || 1;
			const nx = -dy / len, ny = dx / len; // left normal of the segment direction
			const col = borderColorOf(s);
			push(s.a.x, s.a.y, nx, ny, -1, col);
			push(s.a.x, s.a.y, nx, ny, +1, col);
			push(s.b.x, s.b.y, nx, ny, -1, col);
			push(s.b.x, s.b.y, nx, ny, -1, col);
			push(s.a.x, s.a.y, nx, ny, +1, col);
			push(s.b.x, s.b.y, nx, ny, +1, col);
		}
	}

	return {
		fillVerts, fillVertexCount: fi,
		borderPos, borderNorm, borderSide, borderColor, borderVertexCount: si,
	};
}
