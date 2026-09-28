import { describe, expect, it } from "vitest";
import { closingEdge, configUsesFigure, describeFigure, geometryOf, parseFigure } from "./vertex-figure";

const fig = (s: string) => parseFigure(s)!;

describe("vertex-figure", () => {
	it("parses the three separators and refuses digons and junk", () => {
		expect(parseFigure("3.4.7.4")).toEqual([3, 4, 7, 4]);
		expect(parseFigure(" 3 4, 7.4 ")).toEqual([3, 4, 7, 4]);
		expect(parseFigure("2.4.4")).toBeNull();
		expect(parseFigure("3.x.4")).toBeNull();
	});

	it("classifies geometry exactly", () => {
		expect(geometryOf(fig("3.4.3.4"))).toBe("spherical");
		expect(geometryOf(fig("3.4.6.4"))).toBe("euclidean");
		expect(geometryOf(fig("3.3.4.12"))).toBe("euclidean");
		expect(geometryOf(fig("3.4.7.4"))).toBe("hyperbolic");
	});

	// Uniform counts with an answer independent of the D-symbol code: the eleven Euclidean uniform
	// tilings, the Archimedean solids and antiprisms, and the odd-face obstruction (a triangle flanked by
	// two different faces forces an odd cycle of alternation).
	it.each([
		["3.4.6.4", 1], ["3.6.3.6", 1], ["4.4.4.4", 1], ["3.3.3.4.4", 1], ["3.3.4.3.4", 1], ["3.3.3.3.6", 1],
		["3.12.12", 1], ["4.6.12", 1], ["3.3.6.6", 0], ["3.4.4.6", 0], ["3.3.4.12", 0],
		["3.4.3.4", 1], ["3.4.4.4", 1], ["3.3.3.7", 1], ["3.4.3.5", 0], ["3.4.4.7", 0],
	])("%s has %i uniform tiling(s)", (s, n) => {
		expect(describeFigure(fig(s)).uniform).toBe(n);
	});

	it("agrees with the shipped k = 1 slice of 3,6,6,6: three uniform tilings", () => {
		const r = describeFigure(fig("3.6.6.6"));
		expect(r.uniform).toBe(3);
		const b = r.boards.find((m) => m.board.id === "3666")!;
		expect(b.board.counts[1]).toBe(3);
	});

	it("finds every board that closes the figure, whatever the cyclic order", () => {
		const ids = (s: string) => describeFigure(fig(s)).boards.map((m) => m.board.id).sort();
		expect(ids("3.4.7.4")).toEqual(["3447", "7"]);
		expect(ids("3.4.4.7")).toEqual(["3447", "7"]);
		// 4.7.14 closes at the 3.4.7.4 edge (α3 + α4 = α14), so it lands on the ai1 board only.
		expect(ids("4.7.14")).toEqual(["7"]);
		// 3.7.7.7 closes at the {3,7} edge too, so Marek's abcd board 3777 shares an edge and an alphabet with t7.
		expect(ids("3.3.3.3.3.3.3")).toEqual(["3777", "t7"]);
	});

	it("n.n.2n.2n.2n.2n closes at exactly twice the edge of 4.4.2n.2n (Marek's scaled hybrid)", () => {
		for (const n of [5, 7, 9]) {
			const r = closingEdge([n, n, 2 * n, 2 * n, 2 * n, 2 * n]) / closingEdge([4, 4, 2 * n, 2 * n]);
			expect(r).toBeCloseTo(2, 9);
		}
	});

	it("matches a figure at a vertex by cyclic order, not by multiset", () => {
		expect(configUsesFigure("4.7.4.3 + 4.7.14", [3, 4, 7, 4])).toBe(true);
		expect(configUsesFigure("3.4.7.4 + 4.7.14", [3, 4, 4, 7])).toBe(false);
	});
});
