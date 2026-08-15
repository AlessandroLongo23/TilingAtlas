import { describe, expect, it } from "vitest";
import { buildCellMesh } from "@/lib/render/buildCellMesh";

/**
 * The fill must cover the tile exactly — no triangle outside the outline, no gap inside it.
 *
 * The fan-from-centroid triangulation this builder used unconditionally is exact only when the centroid
 * sees every edge. That held for the whole catalogue until the period-p sliders were extended past the
 * convexity cut (2026-08-09): a corner beyond 180° cuts a notch the apex cannot see, the fan paints over
 * it and leaves part of the tile bare. AL saw it as fills going imprecise near the ends of the α range.
 *
 * Total triangle area is the test that catches both halves at once. A fan over a concave ring
 * over-counts, because the triangles that fold outside contribute |area| the polygon does not have.
 */
// Tolerances are float32: the mesh buffers are Float32Array, so ~1e-7 relative is the floor.
const area = (v: number[][]): number => {
	let s = 0;
	for (let i = 0; i < v.length; i++) {
		const [x1, y1] = v[i];
		const [x2, y2] = v[(i + 1) % v.length];
		s += x1 * y2 - x2 * y1;
	}
	return Math.abs(s) / 2;
};

/** Summed |area| of the emitted triangles, which equals the tile area only for a valid tessellation. */
function meshArea(mesh: NonNullable<ReturnType<typeof buildCellMesh>>): number {
	let total = 0;
	for (let t = 0; t + 5 < mesh.fillVertexCount * 2; t += 6) {
		const f = mesh.fillVerts;
		total += area([
			[f[t], f[t + 1]],
			[f[t + 2], f[t + 3]],
			[f[t + 4], f[t + 5]],
		]);
	}
	return total;
}

const SQ3 = Math.sqrt(3) / 2;
const cell = (vertices: number[][]) => ({
	cellPolygons: [{ n: vertices.length, vertices }],
	basis: [[2, 0], [0, 2]],
});

describe("buildCellMesh fill triangulation", () => {
	it("covers a convex tile exactly, and still fans it (n triangles)", () => {
		const hex = [0, 1, 2, 3, 4, 5].map((k) => [Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3)]);
		const mesh = buildCellMesh(cell(hex))!;
		expect(mesh.fillVertexCount).toBe(6 * 3); // fan: one triangle per edge
		expect(meshArea(mesh)).toBeCloseTo(area(hex), 6);
	});

	it("covers a CONCAVE tile exactly — the fan would over-paint it", () => {
		// A chevron: the vertex at index 3 is pushed inside, making that corner reflex. The centroid sits
		// outside the notch, so the fan folds two triangles over the outline.
		const chev = [[0, 0], [2, 0], [2, 1], [1, 0.25], [0, 1]];
		const mesh = buildCellMesh(cell(chev))!;
		expect(mesh.fillVertexCount).toBe((5 - 2) * 3); // ear clipping: n − 2 triangles
		expect(meshArea(mesh)).toBeCloseTo(area(chev), 6);
	});

	it("keeps a star tile on the fan — star-shaped about its centre, so the fan is already exact", () => {
		const star: number[][] = [];
		for (let k = 0; k < 6; k++) {
			const a = (k * Math.PI) / 3;
			star.push([Math.cos(a), Math.sin(a)]);
			star.push([0.4 * Math.cos(a + Math.PI / 6), 0.4 * Math.sin(a + Math.PI / 6)]);
		}
		const mesh = buildCellMesh(cell(star))!;
		expect(mesh.fillVertexCount).toBe(12 * 3);
		expect(meshArea(mesh)).toBeCloseTo(area(star), 6);
	});

	it("gives every fill vertex its own tile's centroid, so the wave scales fill and stroke together", () => {
		const tri = [[0, 0], [1, 0], [0.5, SQ3]];
		const mesh = buildCellMesh(cell(tri))!;
		const cx = (0 + 1 + 0.5) / 3;
		const cy = (0 + 0 + SQ3) / 3;
		for (let i = 0; i < mesh.fillVertexCount; i++) {
			expect(mesh.fillCentroid[i * 2]).toBeCloseTo(cx, 6);
			expect(mesh.fillCentroid[i * 2 + 1]).toBeCloseTo(cy, 6);
		}
	});
});
