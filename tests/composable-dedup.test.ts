import { describe, it, expect } from "vitest";
import {
	canonicalTilingKey,
	trueVertexOrbitCount,
	type CanonCell,
} from "@/classes/algorithm/composable/canonicalTilingKey";

// The composable shelf dedups same-tiling representations with a fundamental-domain-invariant float
// key (build-composable-atlas.ts). These checks pin the two properties the dedup relies on:
//   soundness  — genuinely different tilings never share a key (else a real tiling is dropped),
//   invariance — a supercell / sheared basis / relabelled cell of ONE tiling shares its key.

const sq = (x: number, y: number): number[][] => [
	[x, y],
	[x + 1, y],
	[x + 1, y + 1],
	[x, y + 1],
];

// The unit-square tiling, four ways to write the same tiling:
const squarePrimitive: CanonCell = { cellPolygons: [{ n: 4, vertices: sq(0, 0) }], basis: [[1, 0], [0, 1]] };
const squareShearedBasis: CanonCell = { cellPolygons: [{ n: 4, vertices: sq(0, 0) }], basis: [[1, 0], [1, 1]] };
const squareSupercell2x: CanonCell = {
	cellPolygons: [{ n: 4, vertices: sq(0, 0) }, { n: 4, vertices: sq(1, 0) }],
	basis: [[2, 0], [0, 1]],
};
const squareSupercell2xTall: CanonCell = {
	cellPolygons: [{ n: 4, vertices: sq(0, 0) }, { n: 4, vertices: sq(0, 1) }],
	basis: [[1, 0], [0, 2]],
};

// A genuinely different tiling: 1x2 rectangles (dominoes), one per cell.
const domino: CanonCell = {
	cellPolygons: [{ n: 4, vertices: [[0, 0], [2, 0], [2, 1], [0, 1]] }],
	basis: [[2, 0], [0, 1]],
};

describe("canonicalTilingKey — fundamental-domain invariance", () => {
	const base = canonicalTilingKey(squarePrimitive);
	it("a sheared basis of the same lattice keys identically", () => {
		expect(canonicalTilingKey(squareShearedBasis)).toBe(base);
	});
	it("a 2x supercell (wide) keys identically to its primitive", () => {
		expect(canonicalTilingKey(squareSupercell2x)).toBe(base);
	});
	it("a 2x supercell (tall) keys identically to its primitive", () => {
		expect(canonicalTilingKey(squareSupercell2xTall)).toBe(base);
	});
});

describe("canonicalTilingKey — soundness (distinct tilings stay distinct)", () => {
	it("the square tiling and the 1x2 domino tiling get different keys", () => {
		expect(canonicalTilingKey(domino)).not.toBe(canonicalTilingKey(squarePrimitive));
	});
});

describe("trueVertexOrbitCount — recount under the full symmetry group", () => {
	// The square tiling is 1-uniform (every vertex is 4.4.4.4, one orbit). The recount must return 1
	// whatever (over-counted) k it is handed — the composite engine's chiral / @-label orbit counts
	// inflate k the same way, and this is what corrects them.
	it("collapses an over-counted label to the true orbit count", () => {
		expect(trueVertexOrbitCount(squarePrimitive, 2)).toBe(1);
		expect(trueVertexOrbitCount(squareSupercell2x, 3)).toBe(1); // supercell, still 1-uniform
	});
	it("never raises k, and short-circuits when there is nothing to merge", () => {
		expect(trueVertexOrbitCount(squarePrimitive, 1)).toBe(1);
		// Bound sanity: the recount is always ≤ the label it is given (orbits under a bigger group).
		expect(trueVertexOrbitCount(squarePrimitive, 2)).toBeLessThanOrEqual(2);
	});
});
