import { describe, expect, it } from "vitest";
import { analyseFaces, classifyFaces, summarise } from "./faces";
import { coset, degree, type FreedrawPattern } from "./pattern";

const pat = (
	a: number,
	b: number,
	d: number,
	h: number[],
	v: number[],
): FreedrawPattern => ({ id: "t", k: 1, a, b, d, h, v, orbit: new Array(a * d).fill(0) });

/**
 * A pattern whose faces are exactly the cell groups `group` names: draw every edge whose two sides
 * fall in different groups, and none of the rest. Lets a test state the tiling it wants instead of
 * hand-encoding two bit arrays. `group` must be well defined modulo the a x d lattice and each group
 * connected, which the tests below arrange by construction.
 */
const fromGroups = (a: number, d: number, group: (x: number, y: number) => number): FreedrawPattern => {
	const p = pat(a, 0, d, new Array(a * d).fill(0), new Array(a * d).fill(0));
	const g = (x: number, y: number) => group(((x % a) + a) % a, ((y % d) + d) % d);
	for (let y = 0; y < d; y++) {
		for (let x = 0; x < a; x++) {
			const c = coset(p, x, y);
			if (g(x, y - 1) !== g(x, y)) p.h[c] = 1; // the horizontal edge splits the cells above and below
			if (g(x - 1, y) !== g(x, y)) p.v[c] = 1; // the vertical one splits left from right
		}
	}
	return p;
};

describe("analyseFaces", () => {
	it("calls the empty pattern one unbounded face", () => {
		// No edges drawn at all: the whole plane is a single tile. Marek's first k=1 solution.
		const { faces } = analyseFaces(pat(1, 0, 1, [0], [0]));
		expect(faces).toHaveLength(1);
		expect(faces[0].rank).toBe(2);
	});

	it("calls the fully dissected grid a 1-cell polyomino", () => {
		// Every edge drawn: each unit square is its own tile.
		const { faces } = analyseFaces(pat(1, 0, 1, [1], [1]));
		expect(faces).toHaveLength(1);
		expect(faces[0].rank).toBe(0);
		expect(faces[0].cells).toBe(1);
		expect(faces[0].holes).toBe(0);
	});

	it("detects width-1 strips and their direction", () => {
		// Every vertical edge drawn, no horizontal ones: vertical lines at every x.
		const { faces } = analyseFaces(pat(1, 0, 1, [0], [1]));
		expect(faces).toHaveLength(1);
		expect(faces[0].rank).toBe(1);
		expect(faces[0].period).toEqual([0, 1]);
		expect(faces[0].cells).toBe(1);
	});

	it("detects width-2 strips", () => {
		// Horizontal lines on every odd row: horizontal strips two cells tall.
		const { faces } = analyseFaces(pat(1, 0, 2, [0, 1], [0, 0]));
		expect(faces).toHaveLength(1);
		expect(faces[0].rank).toBe(1);
		expect(faces[0].period).toEqual([1, 0]);
		expect(faces[0].cells).toBe(2);
	});

	it("counts a hole in a ring-shaped polyomino", () => {
		// 3x3 blocks, with the centre cell of each block also fully drawn. The tile between the block
		// boundary and the centre cell is an 8-cell annulus.
		const h = [1, 1, 1, 0, 1, 0, 0, 1, 0];
		const v = [1, 0, 0, 1, 1, 1, 1, 0, 0];
		const { faces } = analyseFaces(pat(3, 0, 3, h, v));
		const ring = faces.find((f) => f.cells === 8);
		const centre = faces.find((f) => f.cells === 1);
		expect(faces).toHaveLength(2);
		expect(ring?.rank).toBe(0);
		expect(ring?.holes).toBe(1);
		expect(centre?.holes).toBe(0);
	});

	it("assigns every coset to exactly one face", () => {
		const p = pat(2, 1, 2, [1, 0, 0, 1], [0, 1, 1, 0]);
		const { faces, cellFace } = analyseFaces(p);
		expect(cellFace).toHaveLength(4);
		for (const id of cellFace) expect(id).toBeGreaterThanOrEqual(0);
		expect(new Set(cellFace).size).toBe(faces.length);
		expect(faces.reduce((s, f) => s + f.cells, 0)).toBe(4);
	});
});

describe("classifyFaces", () => {
	// Four horizontal 1x3 bars, one vertical 3x1 bar and one single cell on a 4x4 torus. The case that
	// motivated the split: every bar is the same SHAPE, only four of them are the same POSE, and all six
	// are different face ORBITS.
	const bars = fromGroups(4, 4, (x, y) => {
		if (x === 3) return y === 0 ? 1 : 3; // the single cell, then the vertical bar up the column
		return y * 10; // one horizontal 3-bar per row
	});

	it("merges a 1x3 with a 3x1 by shape but not by pose", () => {
		const a = analyseFaces(bars);
		const c = classifyFaces(a);
		expect(a.faces).toHaveLength(6);
		// shape: the 3-bar (horizontal or vertical) and the single cell.
		expect(c.shapeCount).toBe(2);
		// pose: horizontal 3-bar, vertical 3-bar, single cell.
		expect(c.poseCount).toBe(3);

		const at = (x: number, y: number) => a.cellFace[coset(bars, x, y)];
		const horizontal = at(0, 0);
		const vertical = at(3, 1);
		const single = at(3, 0);
		expect(c.shape[horizontal]).toBe(c.shape[vertical]);
		expect(c.pose[horizontal]).not.toBe(c.pose[vertical]);
		expect(c.shape[single]).not.toBe(c.shape[horizontal]);
	});

	it("gives every horizontal bar one colour across face orbits", () => {
		const a = analyseFaces(bars);
		const c = classifyFaces(a);
		const rows = [0, 1, 2].map((y) => a.cellFace[coset(bars, 0, y)]);
		expect(new Set(rows).size).toBe(3); // three distinct orbits...
		expect(new Set(rows.map((f) => c.pose[f])).size).toBe(1); // ...one pose
	});

	// Four L-tetrominoes on a 4x4 torus, two of each handedness. All four are the same free tetromino;
	// none is a translate of another. This is the test that reflections merge and rotations merge.
	const ells = fromGroups(4, 4, (x, y) => {
		if (x === 0) return y === 3 ? 2 : 0;
		if (x === 1) return y === 0 ? 0 : 2;
		if (x === 2) return y === 0 ? 1 : 3;
		return y === 3 ? 3 : 1;
	});

	it("merges a tetromino with its mirror and its rotations", () => {
		const a = analyseFaces(ells);
		const c = classifyFaces(a);
		expect(a.faces).toHaveLength(4);
		for (const f of a.faces) expect(f.cells).toBe(4);
		expect(c.shapeCount).toBe(1); // one free tetromino
		expect(c.poseCount).toBe(4); // four distinct fixed tetrominoes
	});

	// Height-1 horizontal strips on every row, with a period lattice two rows tall: the two strips are
	// different orbits but the same infinite tile. Nothing about the method is special-cased to finite
	// faces, and this is what checks it.
	it("merges strips of equal width across face orbits", () => {
		const a = analyseFaces(pat(1, 0, 2, [1, 1], [0, 0]));
		const c = classifyFaces(a);
		expect(a.faces).toHaveLength(2);
		for (const f of a.faces) expect(f.rank).toBe(1);
		expect(c.poseCount).toBe(1);
		expect(c.shapeCount).toBe(1);
	});

	it("keeps strips of different widths apart", () => {
		// Horizontal cuts at y = 0 and y = 1 only: a height-1 strip and a height-3 strip.
		const a = analyseFaces(pat(1, 0, 4, [1, 1, 0, 0], [0, 0, 0, 0]));
		const c = classifyFaces(a);
		expect(a.faces).toHaveLength(2);
		expect(c.poseCount).toBe(2);
		expect(c.shapeCount).toBe(2);
	});

	it("classifies the unbounded face of the empty pattern", () => {
		const c = classifyFaces(analyseFaces(pat(1, 0, 1, [0], [0])));
		expect(c.poseCount).toBe(1);
		expect(c.shapeCount).toBe(1);
	});
});

describe("summarise", () => {
	it("splits the face orbits by kind", () => {
		const s = summarise(analyseFaces(pat(1, 0, 2, [0, 1], [0, 0])));
		expect(s).toEqual({ faceOrbits: 1, finite: 0, strips: 1, unbounded: 0, withHoles: 0 });
	});
});

describe("degree", () => {
	it("never reports a dead end in the fully drawn grid", () => {
		const p = pat(1, 0, 1, [1], [1]);
		expect(degree(p, 0, 0)).toBe(4);
		expect(degree(p, -3, 7)).toBe(4);
	});

	it("reads a straight-through vertex as degree 2", () => {
		// Horizontal lines only: every grid point has an east and a west edge.
		const p = pat(1, 0, 1, [1], [0]);
		expect(degree(p, 0, 0)).toBe(2);
	});
});
