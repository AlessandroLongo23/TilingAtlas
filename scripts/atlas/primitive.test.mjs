// Every case here is a bug that shipped, nearly shipped, or moved a published count on 2026-08-18.
// The supercell filter had drifted into three copies giving three answers for the same file, so these
// pin the behaviour before any of them is allowed to disagree again.
import { describe, it, expect } from "vitest";
import { isPrimitiveCell, dropCollinear } from "./primitive.mjs";

const S3 = Math.sqrt(3);
const sq = (x, y, s = 1) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];

describe("isPrimitiveCell", () => {
	it("calls a one-face cell primitive", () => {
		expect(isPrimitiveCell([sq(0, 0)], [1, 0], [0, 1])).toBe(true);
	});

	it("calls the unit-square cell primitive", () => {
		expect(isPrimitiveCell([sq(0, 0)], [1, 0], [0, 1])).toBe(true);
	});

	it("catches a 2x supercell of the square grid", () => {
		// Two unit squares in a 2x1 cell: translation by (1,0) is a symmetry and is not in the lattice.
		expect(isPrimitiveCell([sq(0, 0), sq(1, 0)], [2, 0], [0, 1])).toBe(false);
	});

	it("catches a 4x supercell of the square grid", () => {
		expect(isPrimitiveCell([sq(0, 0), sq(1, 0), sq(0, 1), sq(1, 1)], [2, 0], [0, 2])).toBe(false);
	});

	// ---- the bug that DELETED a shipped tiling ---------------------------------------------------
	// A regular hexagon cut along its long diagonal into two trapezoids. The halves are related by a
	// HALF-TURN, never by a translation, so the cell is primitive. They have identical sorted sides
	// (1,1,1,2) and identical sorted angles (60,60,120,120), so any test that compares faces by a
	// PROFILE calls this a supercell of itself and throws the tiling away. It did: the half-hexagon
	// board lost its k=1 hexagon tiling.
	it("keeps the hexagon-halves tiling, whose two trapezoids are a half-turn apart", () => {
		const v = Array.from({ length: 6 }, (_, k) => [Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3)]);
		const top = [v[0], v[1], v[2], v[3]];
		const bottom = [v[3], v[4], v[5], v[0]];
		expect(isPrimitiveCell([top, bottom], [1.5, S3 / 2], [0, S3])).toBe(true);
	});

	it("still catches a supercell whose two faces ARE translates, in the same tiling shape", () => {
		// Same trapezoid twice, genuinely translated: this one IS a supercell, so the test above is not
		// passing merely by refusing to look.
		const v = Array.from({ length: 6 }, (_, k) => [Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3)]);
		const top = [v[0], v[1], v[2], v[3]];
		const shifted = top.map(([x, y]) => [x, y + S3]);
		expect(isPrimitiveCell([top, shifted], [1.5, S3 / 2], [0, 2 * S3])).toBe(false);
	});

	// ---- the bug that let 7 SUPERCELLS THROUGH ---------------------------------------------------
	// Positions used to be keyed as round(x * 1e4). A centroid landing exactly on a rounding boundary
	// went into a different bucket depending on how it had been computed, and the symmetry was missed
	// even though the residual was 0. Centroids at (0.5, 0.5) sit exactly on a 1e-3 bucket edge.
	it("catches a supercell whose centroids land exactly on a bucket boundary", () => {
		expect(isPrimitiveCell([sq(0, 0), sq(1, 0)], [2, 0], [0, 1])).toBe(false);
		// and off it, translated by a non-multiple of the bucket
		const eps = 0.0004;
		const off = (f) => f.map(([x, y]) => [x + eps, y + eps]);
		expect(isPrimitiveCell([off(sq(0, 0)), off(sq(1, 0))], [2, 0], [0, 1])).toBe(false);
	});

	it("catches a supercell far from the origin, where float error is largest", () => {
		const far = (f) => f.map(([x, y]) => [x + 987.654321, y - 654.321987]);
		expect(isPrimitiveCell([far(sq(0, 0)), far(sq(1, 0))], [2, 0], [0, 1])).toBe(false);
	});

	// ---- the bug that inflated the planigon counts -----------------------------------------------
	// A `-split` palette marks a divisible edge with a flat 180° corner. Where one tile has several
	// atomised variants, two tiles that are translates can carry DIFFERENT flat corners; as labelled
	// polygons they then differ and the supercell survives. The tiling is geometric, so the corners
	// come off first.
	it("catches a supercell whose two faces carry different flat corners", () => {
		const a = [[0, 0], [0.5, 0], [1, 0], [1, 1], [0, 1]];           // unit square, corner mid-bottom
		const b = [[1, 0], [2, 0], [2, 1], [1.5, 1], [1, 1]];           // unit square, corner mid-top
		expect(isPrimitiveCell([a, b], [2, 0], [0, 1])).toBe(false);
	});

	it("drops a flat corner and keeps a real one", () => {
		expect(dropCollinear([[0, 0], [0.5, 0], [1, 0], [1, 1], [0, 1]])).toHaveLength(4);
		expect(dropCollinear(sq(0, 0))).toHaveLength(4);
		// a 20x tile: the collinearity test has to scale, not use an absolute cross product
		const big = [[0, 0], [10, 0], [20, 0], [20, 20], [0, 20]];
		expect(dropCollinear(big)).toHaveLength(4);
	});

	it("requires a BIJECTION, not just that every face lands on some face", () => {
		// Two different-shaped faces in a 2x1 cell: (1,0) maps the square onto the triangle's slot, so a
		// membership-only test could pass it. Shapes differ, so it is primitive.
		const tri = [[1, 0], [2, 0], [1, 1]];
		expect(isPrimitiveCell([sq(0, 0), tri], [2, 0], [0, 1])).toBe(true);
	});

	it("is insensitive to the winding and the starting vertex of a face", () => {
		const rot = (f, n) => f.slice(n).concat(f.slice(0, n));
		const rev = (f) => [...f].reverse();
		expect(isPrimitiveCell([sq(0, 0), rev(rot(sq(1, 0), 2))], [2, 0], [0, 1])).toBe(false);
	});
});
