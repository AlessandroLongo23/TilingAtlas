import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { exactComposableKeys, type ExactComposableCell } from "@/classes/algorithm/composable/exactComposableDedup";

// The EXACT composite dedup (lib/classes/algorithm/composable/exactComposableDedup.ts) replaces the float
// canonicalTilingKey with proof-grade ℤ[ζ₂₄] congruence: same key ⟺ congruent tiling up to isometry AND
// choice of fundamental domain. These pin the two properties it must have — supercell invariance (a
// primitive cell and its n× enlargements collapse) and the correct distinct count on real data.

// exact ℤ[ζ₂₄] point (a,b) = a·ζ⁰ + b·ζ⁶  (ζ₂₄⁶ = e^{iπ/2} = i) → length-8 integer coefficient vector
const pt = (a: number, b: number): number[] => [a, 0, 0, 0, 0, 0, b, 0];
const sq = (x: number, y: number) => ({
	n: 4,
	name: "4",
	exact: [pt(x, y), pt(x + 1, y), pt(x + 1, y + 1), pt(x, y + 1)],
});

// The unit-square tiling written three ways: the primitive cell and two 2× supercells.
const squarePrimitive: ExactComposableCell = { cellPolygons: [sq(0, 0)], exactBasis: [pt(1, 0), pt(0, 1)] };
const square2xWide: ExactComposableCell = { cellPolygons: [sq(0, 0), sq(1, 0)], exactBasis: [pt(2, 0), pt(0, 1)] };
const square2xTall: ExactComposableCell = { cellPolygons: [sq(0, 0), sq(0, 1)], exactBasis: [pt(1, 0), pt(0, 2)] };

describe("exactComposableKeys — supercell invariance (exact ℤ[ζ₂₄])", () => {
	it("a primitive cell and its 2× (wide/tall) supercells collapse to ONE distinct tiling", () => {
		const r = exactComposableKeys([squarePrimitive, square2xWide, square2xTall]);
		expect(r.distinct).toBe(1);
		expect(r.keys[0]).toBe(r.keys[1]);
		expect(r.keys[1]).toBe(r.keys[2]);
		// only the two supercells need the primitive-cell reduction; the primitive has gcd(counts)=1
		expect(r.reduced).toBe(2);
	});
});

describe("exactComposableKeys — data-backed k=1 distinct count", () => {
	it("dedups the 20 usesComposite k=1 convex solutions to 18 distinct tilings (matches the float heuristic)", () => {
		const p = path.join(process.cwd(), "tests/fixtures/ctrnact-composite-convex-k1.cells.json");
		const recs = (JSON.parse(fs.readFileSync(p, "utf8")).records as Array<Record<string, unknown>>).filter(
			(r) => r.usesComposite,
		);
		const cells: ExactComposableCell[] = recs.map((r) => {
			const rc = r.renderCell as { cellPolygons: Array<Record<string, unknown>>; exactBasis: number[][] };
			return {
				cellPolygons: rc.cellPolygons.map((cp) => ({
					n: cp.n as number,
					name: cp.name as string,
					exact: cp.exact as number[][],
					star: cp.star as boolean | undefined,
				})),
				exactBasis: rc.exactBasis,
			};
		});
		expect(exactComposableKeys(cells).distinct).toBe(18);
	}, 30000);
});

// The polyform shelf keeps chirality: `reflections = false` carries a tiling onto another by a rotation and a
// translation only, so a tiling and its mirror image share a key exactly when the tiling is achiral.
const bar = (y0: number, y1: number) => ({
	n: 8,
	name: "I",
	// a 3×1 bar with its unit points, as the polyform cells carry them
	exact: [pt(0, y0), pt(1, y0), pt(2, y0), pt(3, y0), pt(3, y1), pt(2, y1), pt(1, y1), pt(0, y1)],
});
describe("exactComposableKeys — chirality kept without reflections", () => {
	it("rows of bars shifted by one are chiral; rows stacked straight are not", () => {
		const shifted: ExactComposableCell = { cellPolygons: [bar(0, 1)], exactBasis: [pt(3, 0), pt(1, 1)] };
		const shiftedMirror: ExactComposableCell = { cellPolygons: [bar(0, -1)], exactBasis: [pt(3, 0), pt(1, -1)] };
		const straight: ExactComposableCell = { cellPolygons: [bar(0, 1)], exactBasis: [pt(3, 0), pt(0, 1)] };
		const straightMirror: ExactComposableCell = { cellPolygons: [bar(0, -1)], exactBasis: [pt(3, 0), pt(0, -1)] };
		expect(exactComposableKeys([shifted, shiftedMirror]).distinct).toBe(1);
		expect(exactComposableKeys([shifted, shiftedMirror], false).distinct).toBe(2);
		expect(exactComposableKeys([straight, straightMirror], false).distinct).toBe(1);
	});
});
