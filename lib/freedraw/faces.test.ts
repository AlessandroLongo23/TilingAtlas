import { describe, expect, it } from "vitest";
import { analyseFaces, summarise } from "./faces";
import { degree, type FreedrawPattern } from "./pattern";

const pat = (
	a: number,
	b: number,
	d: number,
	h: number[],
	v: number[],
): FreedrawPattern => ({ id: "t", k: 1, a, b, d, h, v, orbit: new Array(a * d).fill(0) });

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
