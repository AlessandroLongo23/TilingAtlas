import { describe, expect, it } from "vitest";
import { parse } from "./board";
import { boardPolyforms } from "./boardforms";
import { withFamily } from "./family";
import { polyforms, regularGrid } from "./polyform";

const counts = (text: string, upTo: number) =>
	Array.from({ length: upTo }, (_, i) => boardPolyforms(parse(text).board, i + 1).forms).map((f) => [
		f.length,
		f.filter((x) => x.simple).length,
	]);

describe("polyforms of a board", () => {
	// one face and one vertex line make the grid back: the counts of polyform.ts, against OEIS
	it("polyominoes, polyiamonds and polyhexes: A000105 / A000104, A000577, A000228 / A018190", () => {
		const squares = counts("angle A4\nface A4 x 4\nvertex A4 A4 A4 A4\n", 7);
		expect(squares.map((c) => c[0])).toEqual([1, 1, 2, 5, 12, 35, 108]);
		expect(squares.map((c) => c[1])).toEqual([1, 1, 2, 5, 12, 35, 107]);
		expect(counts("angle A3\nface A3 x 3\nvertex A3 A3 A3 A3 A3 A3\n", 8).map((c) => c[0])).toEqual([
			1, 1, 1, 3, 4, 12, 24, 66,
		]);
		const hexes = counts("angle A6\nface A6 x 6\nvertex A6 A6 A6\n", 6);
		expect(hexes.map((c) => c[0])).toEqual([1, 1, 3, 7, 22, 82]);
		expect(hexes.map((c) => c[1])).toEqual([1, 1, 3, 7, 22, 81]);
	});

	it("grows in the hyperbolic plane as the {4,5} grid does", () => {
		const grid = [1, 2, 3, 4, 5, 6].map((n) => polyforms(regularGrid(4, 5), n).length);
		expect(counts("angle A 72\nface A x 4\nvertex A A A A A\n", 6).map((c) => c[0])).toEqual(grid);
	});

	it("takes every set of corners that closes when the board has no vertex lines", () => {
		expect(counts("angle A4\nface A4 x 4\n", 5).map((c) => c[0])).toEqual([1, 1, 2, 5, 12]);
	});

	// Marek, 2026-11-09: triangles and squares round 3⁶, 4⁴ and 3³4² as sets
	const mixture =
		"angle A3\nangle A4\nface A3 x 3\nface A4 x 4\nvertex A3 A3 A3 A3 A3 A3\nvertex A4 A4 A4 A4\nvertex A3 A3 A3 A4 A4\npermutations yes\n";
	it("grows triangles and squares, never making a corner no vertex completes", () => {
		// three cells: the triamond, the two trominoes, and three of each mixture (checked by hand)
		expect(counts(mixture, 6).map((c) => c[0])).toEqual([2, 3, 9, 39, 180, 974]);
		// three squares and a triangle, or a square and four triangles, leave 30°, which nothing fills
		const corners = boardPolyforms(parse(mixture).board, 5).forms.flatMap((f) => f.corners.map((c) => c.num / c.den));
		expect(corners.some((d) => d === 330)).toBe(false);
		expect(new Set(corners)).toEqual(new Set([60, 90, 120, 150, 180, 210, 240, 270, 300]));
	});

	it("adds the disks as faces, each outline once, with their pictures", () => {
		const b = parse(mixture).board;
		const r = withFamily(b, { kind: "board", n: 3 });
		expect(r.board.faces.length - b.faces.length).toBe(9);
		expect(r.pictures).toHaveLength(9);
		// the house (a square and a triangle) has its one inner side; made of squares only, the trominoes
		expect(r.pictures!.every((p) => p.lines.length === 2)).toBe(true);
		expect(withFamily(b, { kind: "board", n: 3, cells: [1] }).board.faces.length - b.faces.length).toBe(2);
	});

	it("says why a board cannot be grown from", () => {
		expect(boardPolyforms(parse("angle A free\nface A x 4\n").board, 2).problem).toMatch(/no angle of its own/);
		expect(boardPolyforms(parse("angle A3\nface A3 x 3\nvertex A3 A3 A3 A3\n").board, 2).problem).toMatch(/360°/);
	});
});
