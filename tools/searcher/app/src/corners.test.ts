// Quick setup's rule against Marek's own boards: their vertex lines are exactly the multisets of corners
// that close at the edge length one of their vertices closes at.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { vertexFigure } from "@/components/about/figures/geometry/vertex";
import { GEOMETRIES } from "@/lib/vocabulary";
import { cyclicKey, emptyBoard, parse } from "./board";
import { fittingOrder, fittingVertices, layable, overlapping } from "./figures";
import {
	arrangements,
	withPermutations,
	closingVertices,
	cornerAngle,
	cornerShapes,
	exactlyClosing,
	pointsCanPart,
	pointsTouch,
	freePoints,
	readShorthand,
	readShorthands,
	seedWords,
	solveEdge,
	solvePoints,
	specOf,
	withFace,
	withPoints,
} from "./corners";

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
	it("finds the sphere's vertices on a board whose angles are the plane's", () => {
		const b = parse("name t\nk 1 1\nangle A3 60\nangle A4 90\nface A3 x 3\nface A4 x 4\nvertex A4 A4 A4 A4\n").board;
		expect(cornerShapes(b).get("A4")).toEqual({ kind: "polygon", n: 4, seg: 1 });
		const seeds = seedWords(b, "sphere", 12);
		const cube = seeds.find((s) => s.word.join(" ") === "A4 A4 A4")!;
		expect(cube.l).toBeCloseTo(Math.acos(1 / 3), 9); // the cube's edge on the unit sphere
		expect(multisets(closingVertices(b, "sphere", cube.l, 12).words)).toEqual(multisets([["A4", "A4", "A4"]]));
		expect(seeds.map((s) => s.word.join(" "))).toContain("A3 A3 A3 A3 A3");
	});
});

describe("faces in Marek's names", () => {
	it("reads the side letter, the corners and a star's point", () => {
		expect(readShorthand("A3")).toEqual({ n: 3, seg: 1 });
		expect(readShorthand("C6")).toEqual({ n: 6, seg: 3 });
		expect(readShorthand("Boo")).toEqual({ n: null, seg: 2 });
		expect(readShorthand("A6*60")).toEqual({ n: 6, seg: 1, point: 60 });
		expect(readShorthand("A3*100")).toEqual({ n: 3, seg: 1, point: 100 }); // convex: 100° and 140°
		expect(readShorthand("A2*60")).toEqual({ n: 2, seg: 1, point: 60 }); // a rhombus
		// A6*120 is the regular dodecagon, A2*90 the square, A3*60 a "star" of straight dents
		for (const bad of ["a3", "B2", "A6*120", "A2*90", "A3*60", "A1", "a3x"]) expect(readShorthand(bad)).toBeNull();
	});

	it("reads several faces at once, or none when one does not read", () => {
		expect(readShorthands("Aoo, B3, Coo")).toEqual([
			{ n: null, seg: 1 },
			{ n: 3, seg: 2 },
			{ n: null, seg: 3 },
		]);
		expect(readShorthands("A3")).toEqual([{ n: 3, seg: 1 }]);
		for (const bad of ["", ",", "A3, a4", "A3,,B2"]) expect(readShorthands(bad)).toBeNull();
		// added in turn, the shared Pi corner is declared once (Marek's Board_0_790985)
		const b = readShorthands("Aoo,B3,Coo")!.reduce((acc, f) => withFace(acc, f), parse("name t\nk 1 1\n").board);
		expect(b.faces.map((f) => f.word.join(" "))).toEqual(["Aoo", "B3 Pi", "Coo Pi Pi"]);
		expect(b.angles.map((x) => x.sym).sort()).toEqual(["Aoo", "B3", "Coo", "Pi"]);
	});

	it("writes the face and its corners, and reads them back", () => {
		const empty = parse("name t\nk 1 1\n").board;
		let b = withFace(empty, { n: 3, seg: 2 });
		expect(b.faces[0]).toMatchObject({ word: ["B3", "Pi"], repeat: 3 });
		expect(b.angles.map((a) => a.sym).sort()).toEqual(["B3", "Pi"]);
		expect(specOf(b, b.faces[0])).toEqual({ n: 3, seg: 2 });
		b = withFace(b, { n: 7, seg: 1, point: 60 }, 0);
		expect(b.faces[0]).toMatchObject({ word: ["A7p60", "A7d60"], repeat: 7 });
		expect(b.angles.find((a) => a.sym === "A7d60")?.value).toBe("1740/7");
		expect(b.angles.some((a) => a.sym === "B3")).toBe(false); // the old face's corner, now unused
		expect(specOf(b, b.faces[0])).toEqual({ n: 7, seg: 1, point: 60 });
		b = withFace(b, { n: 3, seg: 1, point: 100 }, 0);
		expect(b.faces[0]).toMatchObject({ word: ["A3a100", "A3b100"], repeat: 3 });
		expect(b.angles.find((x) => x.sym === "A3b100")?.value).toBe("140");
		expect(specOf(b, b.faces[0])).toEqual({ n: 3, seg: 1, point: 100 });
	});
});

describe("isotoxal faces off the plane", () => {
	const deg = (r: number | null) => (r === null ? null : +((r * 180) / Math.PI).toFixed(6));
	const star = (p: string, d = "") =>
		parse(`name t\nk 1 1\nangle A3\nangle P${p}\nangle D${d}\nface A3 x 3\nface P D x 6\nvertex D A3 A3 A3\n`).board;
	it("keeps the point and lets the dent follow the edge", () => {
		const sh = cornerShapes(star(" 60"));
		expect(sh.get("P")).toMatchObject({ kind: "iso", n: 6, dent: false });
		expect(sh.get("D")).toMatchObject({ kind: "iso", n: 6, dent: true });
		expect(deg(cornerAngle(sh.get("D"), "plane", 0))).toBe(240);
		expect(deg(cornerAngle(sh.get("D"), "hyperbolic", 1e-9))).toBeCloseTo(240, 6);
		expect(deg(cornerAngle(sh.get("P"), "hyperbolic", 1))).toBe(60);
		expect(cornerAngle(sh.get("D"), "hyperbolic", 1)!).toBeLessThan(cornerAngle(sh.get("D"), "hyperbolic", 0.5)!);
		expect(cornerAngle(sh.get("D"), "sphere", 0.5)!).toBeGreaterThan((240 * Math.PI) / 180);
	});
	it("reads the point from the dent alone, and refuses angles that disagree", () => {
		expect(cornerShapes(star("", " 240")).get("P")).toMatchObject({ kind: "iso", point: Math.PI / 3, dent: false });
		expect(cornerShapes(star(" 60", " 200")).get("P")).toMatchObject({ kind: "set" });
	});
	it("does not take a star with no angles for a regular 12-gon", () => {
		expect(cornerShapes(star("")).get("P")).toMatchObject({ kind: "unknown" });
	});
	it("solves the edge from a dent vertex, and finds the points' vertex there", () => {
		const b = star(" 60");
		const l = solveEdge(["D", "A3", "A3", "A3"], cornerShapes(b), "hyperbolic")!;
		expect(l).toBeCloseTo(0.928, 3);
		expect(multisets(closingVertices(b, "hyperbolic", l, 12).words)).toEqual(
			multisets([
				["D", "A3", "A3", "A3"],
				["P", "P", "P", "P", "P", "P"],
			]),
		);
		// D A3 A3 is flat: it closes in the plane, never at a zero edge in the hyperbolic plane
		expect(solveEdge(["D", "A3", "A3"], cornerShapes(b), "hyperbolic")).toBeNull();
	});
});

describe("star points solved with the edge", () => {
	const free = (n: number, more = "") =>
		parse(
			`name t\nk 1 1\nangle A3\nangle A4\nangle P free\nangle D\nface A3 x 3\nface A4 x 4\nface P D x ${n}\n${more}`,
		).board;
	it("finds the free point and the corner that follows it", () => {
		expect(freePoints(free(8))).toEqual([{ n: 8, seg: 1, p: "P", d: "D" }]);
		expect(readShorthand("A6*")).toEqual({ n: 6, seg: 1, free: true });
		const b = withFace(parse("name t\nk 1 1\n").board, { n: 6, seg: 1, free: true });
		expect(b.angles).toEqual([{ sym: "A6p", value: "free" }, { sym: "A6d" }]);
		expect(specOf(b, b.faces[0])).toEqual({ n: 6, seg: 1, free: true });
	});
	it("solves the 8-pointed stars of {3,8}: edge and a 15° point", () => {
		const sols = solvePoints(free(8), [Array(8).fill("A3"), ["D", "A3", "A3"]], "hyperbolic");
		expect(sols).toHaveLength(1);
		expect(sols[0].edge).toBeCloseTo(1.5286, 4);
		expect(sols[0].points[0]).toBeCloseTo(15, 6);
		const b = withPoints(free(8), freePoints(free(8)), sols[0].points);
		expect(cornerShapes(b).get("D")).toMatchObject({ kind: "iso", dent: true });
		expect(closingVertices(b, "hyperbolic", sols[0].edge, 10).words.length).toBe(5);
	});
	it("solves two vertices that both hold the point", () => {
		// pentagrams: P P P D and A4 A4 A4 D close together at one edge and one point
		const sols = solvePoints(
			free(5),
			[
				["P", "P", "P", "D"],
				["A4", "A4", "A4", "D"],
			],
			"hyperbolic",
		);
		expect(sols.length).toBeGreaterThan(0);
		for (const s of sols) {
			const sh = cornerShapes(withPoints(free(5), freePoints(free(5)), s.points));
			const sum = (w: string[]) => w.reduce((t, c) => t + cornerAngle(sh.get(c), "hyperbolic", s.edge)!, 0);
			expect(sum(["P", "P", "P", "D"])).toBeCloseTo(2 * Math.PI, 9);
			expect(sum(["A4", "A4", "A4", "D"])).toBeCloseTo(2 * Math.PI, 9);
		}
	});
});

describe("cyclic orders", () => {
	it("spells out a set's orders", () => {
		// 3.3.4.4 and 3.4.3.4
		expect(arrangements(["A3", "A4", "A3", "A4", "A3"])!.length).toBe(2);
	});
});

describe("faces that overlap round a vertex", () => {
	const b = parse(
		[
			"name t",
			"k 1 1",
			...[
				"A3 60",
				"A4 90",
				"A6 120",
				"A12 150",
				"A6p30 30",
				"A6d30 270",
				"A12p90 90",
				"A12d90 240",
				"A4p30 30",
				"A4d30 240",
			],
			"A12p120 120",
			"A12d120 210",
		]
			.map((l, i) => (i > 1 ? `angle ${l}` : l))
			.concat(
				[
					"A3 x 3",
					"A4 x 4",
					"A6 x 6",
					"A12 x 12",
					"A6p30 A6d30 x 6",
					"A12p90 A12d90 x 12",
					"A4p30 A4d30 x 4",
					"A12p120 A12d120 x 12",
				].map((f) => `face ${f}`),
			)
			.concat(["vertex A4 A4 A4 A4", "permutations yes"])
			.join("\n"),
	).board;
	it("lays out only vertices with a star corner", () => {
		expect(overlapping(b, ["A4", "A4", "A4", "A4"])).toBeNull();
		expect(fittingOrder(b, ["A4", "A4", "A4", "A4"])).toEqual(["A4", "A4", "A4", "A4"]);
	});
	it("fits a square in a star's dent", () => expect(overlapping(b, ["A4", "A6d30"])).toBe(false));
	it("finds the order that fits", () => {
		const w = ["A3", "A3", "A12", "A12p90"];
		expect(overlapping(b, w)).toBe(true);
		const o = fittingOrder(b, w)!;
		expect([...o].sort()).toEqual([...w].sort());
		expect(overlapping(b, o)).toBe(false);
	});
	it("knows a set that never fits", () => expect(fittingOrder(b, ["A6", "A12", "A12p90"])).toBeNull());
});

describe("vertices built face by face", () => {
	it("finds the plane's regular vertex sets, as listing them does", () => {
		const b = parse(
			"name t\nk 1 1\nangle A3\nangle A4\nangle A6\nangle A12\nface A3 x 3\nface A4 x 4\nface A6 x 6\nface A12 x 12\nvertex A4 A4 A4 A4\n",
		).board;
		const built = fittingVertices(b, 12)!;
		expect(multisets(built)).toEqual(multisets(closingVertices(b, "plane", 0, 12).words));
		// two orders each: 3.3.4.3.4 / 3.3.3.4.4, 3.4.6.4 / 3.4.4.6, 3.6.3.6 / 3.3.6.6, 3.4.3.12 / 3.3.4.12
		expect(built.length).toBe(multisets(built).size + 4);
	});
	it("lays a star's mirror-image corners each their own way", () => {
		// the two 120° corners share a name but face opposite ways: the 30° point between them fits only so
		const b = parse(
			"name t\nk 1 1\nangle A4 90\nangle F1_120 120\nangle F1_270 270\nangle F1_30 30\nangle F1_90 90\nface A4 x 4\nface F1_120 F1_270 F1_30 F1_270 F1_120 F1_90 x 2\nvertex A4 F1_120 F1_30 F1_120\n",
		).board;
		expect(overlapping(b, ["A4", "F1_120", "F1_30", "F1_120"])).toBe(false);
		expect(fittingVertices(b, 12)!.map((w) => cyclicKey(w))).toContain("A4 F1_120 F1_30 F1_120");
	});
	it("lets a convex isotoxal face's corners meet as no star's could", () => {
		// a hexagon of 150° and 90° corners: its 150°s sit beside a star's points, its 90° fills a star's dent
		const b = parse(
			"name t\nk 1 1\nangle A4 90\nangle A12p60 60\nangle A12d60 270\nangle A6a150 150\nangle A6b90 90\nface A4 x 4\nface A12p60 A12d60 x 12\nface A6a150 A6b90 x 3\nvertex A4 A12d60\n",
		).board;
		const built = fittingVertices(b, 12)!.map((w) => cyclicKey(w));
		expect(built).toContain(cyclicKey(["A4", "A12p60", "A6a150", "A12p60"]));
		expect(built).toContain(cyclicKey(["A6b90", "A12d60"]));
		expect(pointsTouch(cornerShapes(b), ["A12p60", "A6a150", "A12p60", "A4"])).toBe(false);
	});
	it("knows when it cannot lay out every corner", () => {
		const b = parse(
			"name t\nk 1 1\nangle A3\nangle Aoo\nface A3 x 3\nface Aoo x inf\nvertex A3 A3 A3 A3 A3 A3\n",
		).board;
		expect(layable(b)).toBe(false);
	});
});

describe("star points side by side", () => {
	const b = parse(
		"name t\nk 1 1\nangle A3 60\nangle A6p30 30\nangle A6d30 270\nface A3 x 3\nface A6p30 A6d30 x 6\nvertex A3 A6p30 A6d30\n",
	).board;
	const sh = cornerShapes(b);
	it("flags two points side by side, and only those", () => {
		expect(pointsTouch(sh, ["A6p30", "A6p30", "A3", "A3", "A3", "A3", "A3"])).toBe(true);
		expect(pointsTouch(sh, ["A6p30", "A3", "A3", "A3", "A3", "A3", "A6p30"])).toBe(true); // round the end
		expect(pointsTouch(sh, ["A3", "A6p30", "A6d30"])).toBe(false);
	});
	it("knows when no order can keep the points apart", () => {
		expect(pointsCanPart(sh, ["A6p30", "A6p30", "A6p30", "A3", "A3"])).toBe(false);
		expect(pointsCanPart(sh, ["A6p30", "A6p30", "A3", "A3"])).toBe(true);
	});
});

describe("faces lie either way round", () => {
	// Marek's tooth pentagon has no mirror symmetry: some vertices need a copy turned over
	const b = parse(
		"name tooth\nk 1 1\nangle F1_90 90\nangle F1_150 150\nangle F1_60 60\nangle F1_210 210\nangle F1_30 30\nface F1_210 F1_30 F1_150 F1_90 F1_60\nvertex F1_90 F1_90 F1_30 F1_60 F1_60 F1_30\n",
	).board;
	it("fits an order only a mirrored face makes", () => {
		const w = ["F1_90", "F1_90", "F1_30", "F1_60", "F1_60", "F1_30"];
		expect(overlapping(b, w)).toBe(false);
		expect(fittingVertices(b, 12)!.map((v) => cyclicKey(v))).toContain(cyclicKey(w));
	});
});

describe("vertices that close exactly", () => {
	// {5,4}'s edge, cosh s = φ, carries twelve polygons and 106 vertices (A3⁴A4² fixes it)
	let b = emptyBoard();
	for (const f of ["A3", "A4", "A5", "A10", "A20", "B3", "B4", "B5", "B10", "Boo", "Doo", "G3"]) b = withFace(b, readShorthand(f)!);
	const seed = ["A3", "A3", "A3", "A3", "A4", "A4"];
	const l = solveEdge(seed, cornerShapes(b), "hyperbolic")!;
	const real = (ws: string[][]) => ws.filter((w) => !w.includes("Pi"));
	it("keeps the 106", () => {
		expect(Math.cosh(l)).toBeCloseTo((1 + Math.sqrt(5)) / 2, 12);
		const r = exactlyClosing(b, "hyperbolic", l, seed, closingVertices(b, "hyperbolic", l, 24).words);
		expect(real(r.words)).toHaveLength(106);
		expect(r.dropped).toHaveLength(0);
	});
	it("drops the near-misses a loose float test lets in", () => {
		const loose = closingVertices(b, "hyperbolic", l, 24, 1e-3).words;
		const r = exactlyClosing(b, "hyperbolic", l, seed, loose);
		expect(real(r.words)).toHaveLength(106);
		expect(r.dropped.length).toBeGreaterThan(100);
	});
	it("checks nothing without a vertex to fix the edge", () =>
		expect(exactlyClosing(b, "hyperbolic", l, null, [seed]).unchecked).toBe(1));
});

describe("Permutations turned off and on", () => {
	// the 10 sets of corners of {3,4,6,12} that close are 14 vertex configurations, as Marek's amalgama needs them
	const sets = parse(
		[
			"angle A3 60", "angle A4 90", "angle A6 120", "angle A12 150",
			"face A3 x 3", "face A4 x 4", "face A6 x 6", "face A12 x 12",
			"permutations yes",
			"vertex A12 A12 A3", "vertex A12 A4 A6", "vertex A6 A6 A6", "vertex A12 A3 A3 A4", "vertex A3 A3 A6 A6",
			"vertex A3 A4 A4 A6", "vertex A4 A4 A4 A4", "vertex A3 A3 A3 A3 A6", "vertex A3 A3 A3 A4 A4",
			"vertex A3 A3 A3 A3 A3 A3",
			"require 4", "require 9 10", "initial 5",
		].join("\n"),
	).board;
	it("spells each set out as its orders, the required sets with them", () => {
		const orders = withPermutations(sets, false)!;
		expect(orders.permutations).toBe(false);
		expect(orders.vertices.length).toBe(14);
		const at = (w: string) => orders.vertices.findIndex((v) => cyclicKey(v.word) === cyclicKey(w.split(" "))) + 1;
		expect(orders.require.map((r) => r.set)).toEqual([
			[at("A12 A3 A3 A4"), at("A12 A3 A4 A3")].sort((x, y) => x - y),
			[at("A3 A3 A3 A4 A4"), at("A3 A3 A4 A3 A4"), at("A3 A3 A3 A3 A3 A3")].sort((x, y) => x - y),
		]);
		expect(orders.initial).toEqual([at("A3 A3 A6 A6"), at("A3 A6 A3 A6")].sort((x, y) => x - y));
	});
	it("gathers the orders back into the same sets", () => {
		const back = withPermutations(withPermutations(sets, false)!, true)!;
		expect(back.vertices.map((v) => v.word)).toEqual(sets.vertices.map((v) => v.word));
		expect(back.require).toEqual(sets.require);
		expect(back.initial).toEqual(sets.initial);
	});
});

describe("vertex figures with flat corners and long sides", () => {
	// each corner's angle, read back from the bisectors the figure turns its polygons to
	const angles = (mids: number[]) => mids.reduce<number[]>((a, m) => [...a, 2 * (m - a.reduce((t, x) => t + x, 0))], []);
	const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);
	it("closes two Pi corners at exactly 360°", () => {
		const f = vertexFigure([Infinity, Infinity]);
		expect(f.geometry).toBe(GEOMETRIES.EUCLIDEAN);
		for (const a of angles(f.mids)) expect(a).toBeCloseTo(Math.PI, 12);
	});
	it("gives a corner of sides two edges long its own angle, and Pi its straight one, in the disk", () => {
		const f = vertexFigure([6, 6, 3, Infinity], undefined, GEOMETRIES.HYPERBOLIC, [1, 1, 2, 1]);
		const a = angles(f.mids);
		expect(sum(a)).toBeCloseTo(2 * Math.PI, 9);
		expect(a[3]).toBeCloseTo(Math.PI, 12);
		// a triangle of side 2s: sin(α/2) = cos(π/3) / cosh(s)
		expect(a[2]).toBeCloseTo(2 * Math.asin(Math.cos(Math.PI / 3) / Math.cosh(f.edge!)), 9);
	});
	it("says nothing closes when flat corners already make 360°, instead of searching forever", () => {
		expect(vertexFigure([3, Infinity, Infinity], undefined, GEOMETRIES.HYPERBOLIC).edge).toBeNull();
	});
});
