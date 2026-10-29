import { describe, expect, it } from "vitest";
import { parse } from "./board";
import { vertexQuery } from "./query";

const b = parse(
	"name t\nk 1 1\nangle A3\nangle A4\nangle A6\nangle Q\nface A3 x 3\nface A4 x 4\nface A6 x 6\n" +
		"vertex A3 A3 A3 A3 A3 A3\nvertex A4 A4 A4 A4\nvertex A3 A3 A4 A4 A3\nvertex A3 A6 A3 A6\nvertex A4 Q A4 A4\n" +
		"vertex A4 A4 A4 A4\ninitial 2 4\n",
).board;
// the vertices (1-based) a query keeps
const keep = (q: string) => {
	const r = vertexQuery(b, q);
	if ("error" in r) return r.error;
	return b.vertices.flatMap((_, i) => (r.test(i) ? [i + 1] : []));
};

describe("vertex filter", () => {
	it("matches corners, counts and totals", () => {
		expect(keep("")).toEqual([1, 2, 3, 4, 5, 6]);
		expect(keep("A6")).toEqual([4]);
		expect(keep("A3>=3")).toEqual([1, 3]);
		expect(keep("A3=2")).toEqual([4]);
		expect(keep("corners>4")).toEqual([1, 3]);
	});
	it("combines with AND, OR, NOT, brackets and side by side", () => {
		expect(keep("A3 AND A4")).toEqual([3]);
		expect(keep("A3 A4")).toEqual([3]);
		expect(keep("A6 OR A4=4")).toEqual([2, 4, 6]);
		expect(keep("NOT A3 AND NOT Q")).toEqual([2, 6]);
		expect(keep("!(A3 | Q)")).toEqual([2, 6]);
		expect(keep("a3 and not (a4 or a6)")).toBe("No corner is named “a3”."); // names keep their case
	});
	it("reads faces and properties", () => {
		expect(keep("face:3")).toEqual([4]);
		expect(keep("initial")).toEqual([2, 4]);
		expect(keep("NOT initial AND A4")).toEqual([3, 5, 6]);
		expect(keep("unplaceable")).toEqual([5]);
		expect(keep("duplicate")).toEqual([6]);
	});
	it("says what is wrong", () => {
		expect(keep("A5")).toBe("No corner is named “A5”.");
		expect(keep("face:9")).toBe("There is no face 9: the board has 3.");
		expect(keep("(A3")).toBe("A bracket is not closed.");
		expect(keep("A3)")).toBe("“)” has no bracket to close.");
		expect(keep("AND A3")).toBe("“AND” has nothing before it.");
		expect(keep("A3 AND")).toBe("The query ends too soon.");
	});
	it("reads face kinds", () => {
		const s = parse(
			"name s\nk 1 1\nangle A3\nangle A12\nangle A6p30 30\nangle A6d30 270\nangle A2\nangle Aoo\n" +
				"face A3 x 3\nface A12 x 12\nface A6p30 A6d30 x 6\nface A2 x 2\nface Aoo x inf\n" +
				"vertex A3 A3 A3 A3 A3 A3\nvertex A6d30 A3 A3 A6p30\nvertex A6p30 A6p30 A6d30 A3\nvertex A2 A3 A3 A2 A3 A3 A3 A3\nvertex Aoo A3 A3 A3\n",
		).board;
		const k = (q: string) => {
			const r = vertexQuery(s, q);
			return "error" in r ? r.error : s.vertices.flatMap((_, i) => (r.test(i) ? [i + 1] : []));
		};
		expect(k("star")).toEqual([2, 3]);
		expect(k("star>=3")).toEqual([3]);
		expect(k("NOT star")).toEqual([1, 4, 5]);
		expect(k("regular=6")).toEqual([1, 4]);
		expect(k("digon")).toEqual([4]);
		expect(k("apeirogon")).toEqual([5]);
		expect(k("STAR")).toEqual([2, 3]);
	});
});
