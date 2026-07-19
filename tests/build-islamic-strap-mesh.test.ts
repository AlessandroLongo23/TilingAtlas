import { describe, it, expect } from "vitest";
import { Vector } from "@/classes";
import { buildInstancedStrapMesh } from "@/lib/render/buildIslamicStrapMesh";
import type { Band } from "@/lib/utils/islamicInterlace";

const quad = (cx: number, cy: number, r: number): Vector[] => [
	new Vector(cx - r, cy - r), new Vector(cx + r, cy - r), new Vector(cx + r, cy + r), new Vector(cx - r, cy + r),
];
const seg = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number) =>
	({ a: new Vector(ax, ay), b: new Vector(bx, by), n: new Vector(nx, ny) });

describe("buildInstancedStrapMesh", () => {
	// A 3×3 grid of unit-cell strap bands (fill quad + one border segment each). Only the origin-cell
	// representative must survive; its lattice copies are the shader's instances.
	const v1: [number, number] = [1, 0], v2: [number, number] = [0, 1];
	const bands: Band[] = [];
	for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
		bands.push({ fill: quad(i, j, 0.3), outline: [seg(i - 0.1, j, i + 0.1, j, 0, 1)] });
	}

	it("keeps only the origin-cell band; a quad fans to 2 triangles (6 fill verts)", () => {
		const m = buildInstancedStrapMesh(bands, v1, v2, () => [0.5, 0.5, 0.5]);
		expect(m.fillVertexCount).toBe(6);   // one quad → 2 tris (not 9 × 6)
		expect(m.borderVertexCount).toBe(6); // one segment → one butt quad
	});

	it("bakes the per-segment border colour on every border vertex", () => {
		const m = buildInstancedStrapMesh(bands, v1, v2, () => [1, 0, 0]);
		for (let k = 0; k < m.borderVertexCount; k++) {
			expect(m.borderColor[k * 3]).toBe(1);
			expect(m.borderColor[k * 3 + 1]).toBe(0);
			expect(m.borderColor[k * 3 + 2]).toBe(0);
		}
	});

	it("chooses the colour from each segment (emboss highlight vs shadow)", () => {
		// One band with two segments whose normals face opposite the light; colour by n·light sign.
		const light = { x: -0.6, y: 0.8 };
		const two: Band[] = [{
			fill: quad(0, 0, 0.3),
			outline: [seg(-0.1, 0, 0.1, 0, -1, 1), seg(-0.1, 0, 0.1, 0, 1, -1)],
		}];
		const colOf = (s: { n: Vector }) => (s.n.x * light.x + s.n.y * light.y > 0 ? [1, 1, 1] as const : [0, 0, 0] as const);
		const m = buildInstancedStrapMesh(two, v1, v2, colOf);
		// First segment normal (-1,1)·(-0.6,0.8) = 0.6+0.8 > 0 → white; second (1,-1) → black.
		expect(m.borderColor[0]).toBe(1);        // first seg, first vertex
		expect(m.borderColor[6 * 3]).toBe(0);    // second seg starts at vertex 6
	});
});
