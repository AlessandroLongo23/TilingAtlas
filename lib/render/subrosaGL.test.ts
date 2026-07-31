import { describe, expect, it } from "vitest";
import { MAX_OUTLINE_EDGES, packOutlineEdges } from "./subrosaGL";

// packOutlineEdges is the CPU half of the outline pass: every polygon side becomes one instance of
// (ax, ay, bx, by). The rest of that pass is shader, so this is the piece a test can hold — and the
// thing it must hold is that the ring CLOSES. A packer that emitted only v[i]→v[i+1] would look right
// on screen for every tile except at one side per tile, which is exactly the kind of miss that reads
// as "the renderer is fine" until someone counts.

const ring = (...pts: [number, number][]) => pts.map(([x, y]) => ({ x, y }));

describe("packOutlineEdges", () => {
	it("emits every side of a ring, including the closing one", () => {
		const tri = ring([0, 0], [1, 0], [0, 1]);
		const buf = packOutlineEdges([tri], (r) => r)!;
		expect(buf).not.toBeNull();
		expect(buf.length).toBe(3 * 4);
		expect(Array.from(buf)).toEqual([
			0, 1, 0, 0, // closing side: v2 → v0
			0, 0, 1, 0,
			1, 0, 0, 1,
		]);
	});

	it("packs polygons back to back, n sides for an n-gon", () => {
		const polys = [
			{ vertices: ring([0, 0], [1, 0], [1, 1], [0, 1]) },
			{ vertices: ring([2, 0], [3, 0], [2, 1]) },
		];
		const buf = packOutlineEdges(polys, (p) => p.vertices)!;
		expect(buf.length / 4).toBe(4 + 3);
		// The second polygon starts where the first ends, unshifted.
		expect(Array.from(buf.slice(16, 20))).toEqual([2, 1, 2, 0]);
	});

	it("skips rings too short to have a side, and returns null when nothing is left", () => {
		const buf = packOutlineEdges([ring([0, 0]), ring([1, 1], [2, 2])], (r) => r)!;
		expect(buf.length / 4).toBe(2); // the 2-point ring gives a side and its reverse
		expect(packOutlineEdges([ring([0, 0])], (r) => r)).toBeNull();
		expect(packOutlineEdges([], (r: { x: number; y: number }[]) => r)).toBeNull();
	});

	it("returns null over the budget, so the renderer keeps the wireframe", () => {
		const quad = ring([0, 0], [1, 0], [1, 1], [0, 1]);
		const under = Math.floor(MAX_OUTLINE_EDGES / 4);
		expect(packOutlineEdges(new Array(under).fill(quad), (r) => r)).not.toBeNull();
		expect(packOutlineEdges(new Array(under + 1).fill(quad), (r) => r)).toBeNull();
	});
});
