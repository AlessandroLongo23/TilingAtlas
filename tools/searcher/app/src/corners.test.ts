// Quick setup's rule against Marek's own boards: their vertex lines are exactly the multisets of corners
// that close at the edge length one of their vertices closes at.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "./board";
import { closingVertices, cornerShapes, solveEdge } from "./corners";

const BOARDS = join(__dirname, "../../boards");
const board = (name: string) => parse(readFileSync(join(BOARDS, `${name}.board`), "utf8")).board;
const multisets = (ws: string[][]) => new Set(ws.map((w) => [...w].sort().join(" ")));

describe("vertices that close", () => {
	it.each([
		["1247_1_0612", 1.0612751, 121],
		["123_1_4657", 1.4657154, 31],
		["hybrid_2_9830", 2.9830177, 2],
	])("rebuild %s from one vertex: edge %f, %i vertices", (name, edge, count) => {
		const b = board(name);
		const seed = b.vertices.find((v) => !v.word.includes("Pi"))!.word;
		const l = solveEdge(seed, cornerShapes(b), "hyperbolic")!;
		expect(l).toBeCloseTo(edge, 6);
		const { words } = closingVertices(b, "hyperbolic", l, 12);
		expect(words.length).toBe(count);
		expect(multisets(words)).toEqual(multisets(b.vertices.map((v) => v.word)));
	});
	it("finds the plane's regular vertices", () => {
		const b = parse(
			"name t\nk 1 1\nangle A3\nangle A4\nangle A6\nface A3 x 3\nface A4 x 4\nface A6 x 6\nvertex A4 A4 A4 A4\n",
		).board;
		const { words } = closingVertices(b, "plane", 0, 12);
		// 3^6, 4^4, 6^3, 3^4.6, 3^3.4^2, 3^2.6^2, 3.4^2.6 as multisets (3.4.6.4 and 3.4^2.6 are one)
		expect(multisets(words)).toEqual(
			multisets([
				["A3", "A3", "A3", "A3", "A3", "A3"],
				["A4", "A4", "A4", "A4"],
				["A6", "A6", "A6"],
				["A3", "A3", "A3", "A3", "A6"],
				["A3", "A3", "A3", "A4", "A4"],
				["A3", "A3", "A6", "A6"],
				["A3", "A4", "A4", "A6"],
			]),
		);
	});
});
