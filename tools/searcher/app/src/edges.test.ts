// Edge types (board-format.md `edge`) and colourings: Quick setup's path from a plain board to a search, held
// to the atlas engine's counts for the same objects (experiments/results/tilesearch-edge-types-2026-10-29.log):
// drawn and hidden sides of the square grid, bubble squares, 45-45-90 triangles with squares by length, and
// the Colors shelf's colourings of the square and triangle grids.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { check, cyclicKey, emptyBoard, parse, readLength, serialize, withRequiredFaces, type Board } from "./board";
import { arrangements, closingVertices, colorize, decorate, glueLines, sidesMeet, type EdgePreset } from "./corners";
import {
	certificatesIn,
	decode,
	flatCellWithOverlays,
	flatPattern,
	geometry,
	hyperbolicDarts,
	marksEdges,
	vertexWords,
	withSymbols,
} from "./develop";
import { keepNew, withFamily } from "./family";
import { fittingVertices, layable } from "./figures";
import { problemOf, withDrawnFace, withoutUnitType, type Edge } from "./freeface";

const ENGINE = join(__dirname, "../..", process.platform === "win32" ? "tilesearch.exe" : "tilesearch");

/** Quick setup's edge-types path: type the sides, build the plain vertices that fit, type them into every
 *  edge pattern, add the gluing lines. */
function setUp(text: string, preset: EdgePreset, loose = true): Board {
	const { board, glue, vertices, plain } = decorate(parse(text).board, preset, loose);
	const words = vertices(fittingVertices(plain, 12)!);
	return { ...board, vertices: [...words, ...glue].map((word) => ({ word })), permutations: false };
}

/** The engine's census and every certificate up to k = `drawTo` drawn, as the app draws them (or those of the
 *  files `drawTo` picks). */
function run(b: Board, drawTo: number | ((file: string) => boolean) = 2) {
	const dir = mkdtempSync(join(tmpdir(), "tilesearch-edges-"));
	writeFileSync(join(dir, "input.board"), serialize(b));
	execFileSync(ENGINE, ["input.board", "--threads", "8"], { cwd: dir, stdio: "ignore" });
	const out = join(dir, `solver_${b.name}`);
	const census = [...readFileSync(join(out, "census.txt"), "utf8").matchAll(/k=\d+ -- (\d+)/g)].map((m) =>
		Number(m[1]),
	);
	const board = parse(readFileSync(join(out, "board.txt"), "utf8")).board;
	const symbols = Object.fromEntries(
		readFileSync(join(out, "symbols.txt"), "utf8")
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((l) => l.split(" ")),
	);
	let failed = 0;
	const draw =
		typeof drawTo === "number" ? (f: string) => Number(/solver_(\d+)_.*\.txt$/.exec(f)?.[1]) <= drawTo : drawTo;
	for (const f of readdirSync(out).filter(draw))
		for (const c of certificatesIn(readFileSync(join(out, f), "utf8"))) {
			const text = withSymbols(c, symbols);
			try {
				const g = geometry(board, vertexWords(text));
				if (g.kind === "none") throw new Error(g.message);
				const d = decode(text, board);
				// the disk draws an edge system's edges from each dart's drawn flag (or its digons)
				if (g.kind === "hyperbolic") {
					const darts = hyperbolicDarts(d, g, board);
					if (marksEdges(board) && !darts.drawn && !darts.sizes.includes(2)) throw new Error("edges not marked");
				} else if (marksEdges(board)) flatPattern(d, board, g.turn, "t");
				else {
					const { cell } = flatCellWithOverlays(d, board, g.turn);
					// a colouring draws as many colours as its certificate's corners carry letters
					const letters = new Set([...text.matchAll(/@([A-H])/g)].map((m) => m[1]));
					if (letters.size && new Set(cell.p?.map((t) => t.hue)).size !== letters.size) throw new Error("colours");
				}
			} catch {
				failed++;
			}
		}
	return { census, failed };
}

describe("edge types", () => {
	const square = "name s\nk 1 1\nangle A4\nface A4 x 4\nvertex A4 A4 A4 A4\n";
	it("types a square's sides: six faces, two gluing lines, six edge patterns round a vertex", () => {
		const { board, glue, vertices } = decorate(parse(square).board, "drawn");
		expect(board.faces).toHaveLength(6);
		expect(glue).toEqual([
			["Ed", "Ed"],
			["Eu", "Eu"],
		]);
		expect(serialize(board)).toContain("edge Ed drawn\nedge Eu hidden\n");
		expect(vertices([["A4", "A4", "A4", "A4"]])).toHaveLength(6);
		// no loose ends: the pattern with one drawn side goes
		expect(decorate(parse(square).board, "drawn", false).vertices([["A4", "A4", "A4", "A4"]])).toHaveLength(5);
	});

	it("types a typed board the same way again", () => {
		const once = setUp(square, "drawn");
		const twice = setUp(serialize(once), "drawn");
		expect(serialize(twice)).toBe(serialize(once));
	});

	it("drawn and hidden sides with no loose ends: freedraw's 13 / 153 / 1,254", () => {
		const b = setUp("name sqf\nk 1 3\nangle A4\nface A4 x 4\nvertex A4 A4 A4 A4\n", "drawn", false);
		expect(run(b)).toEqual({ census: [13, 153, 1254], failed: 0 });
	});

	it("drawn and hidden sides of the {4,5} grid: the digon encoding's 55, drawn in the disk as edges", () => {
		// the disk drew these as a colouring, one hue per square variant and no edge (2026-11-09)
		const sq = { ...emptyBoard(), name: "h45", kmax: 1, angles: [{ sym: "A4" }], faces: [{ word: ["A4"], repeat: 4 }] };
		const { board, glue, vertices } = decorate(sq, "drawn", false);
		const b = {
			...board,
			vertices: [...vertices([Array(5).fill("A4")]), ...glue].map((word) => ({ word })),
			permutations: false,
		};
		expect(run(b, 1)).toEqual({ census: [55], failed: 0 });
	});
	it("reads an edge line back as it was written", () => {
		const text =
			"name e\nk 1 2\n\nangle A4 90\nedge ES length sqrt(2) bump\n\nface A4 ES x 4\n\nvertex A4 A4 A4 A4\nvertex ES ES\n\npermutations no\n";
		const { board, problems } = parse(text);
		expect(problems).toEqual([]);
		expect(serialize(board)).toBe(text);
	});

	it("drawn and hidden sides of the square grid: the atlas engine's 18 / 271 / 2,754", () => {
		const b = setUp("name sqd\nk 1 3\nangle A4\nface A4 x 4\nvertex A4 A4 A4 A4\n", "drawn");
		expect(run(b)).toEqual({ census: [18, 271, 2754], failed: 0 });
	});

	it("bubble squares: the bubble shelf's 11 / 102", () => {
		const b = setUp("name sqb\nk 1 3\nangle A4\nface A4 x 4\nvertex A4 A4 A4 A4\n", "bubble");
		expect(run(b)).toEqual({ census: [11, 102, 693], failed: 0 });
	});

	it("reads a require face line back as it was written", () => {
		const text =
			"name r\nk 1 2\n\nangle A4\n\nface A4 x 4\n\nvertex A4 A4 A4 A4\n\npermutations no\nrequire face A4 A4 A4 A4 | face A4 x 4\n";
		const { board, problems } = parse(text);
		expect(problems).toEqual([]);
		expect(board.require[0].faces).toEqual([
			["A4", "A4", "A4", "A4"],
			["A4", "A4", "A4", "A4"],
		]);
		expect(serialize(parse(serialize(board)).board)).toBe(serialize(board));
	});

	it("require face: bubble triangles, squares and hexagons with one of each shape: 6 / 123 / 1,436", () => {
		let b = setUp(
			"name tshf\nk 1 3\nangle A3 60\nangle A4 90\nangle A6 120\nface A3 x 3\nface A4 x 4\nface A6 x 6\nvertex A3 A3 A3 A3 A3 A3\n",
			"bubble",
		);
		// one line per shape, any of its variants (the corner names start with the shape's corner)
		for (const c of ["A3.", "A4.", "A6."])
			b = withRequiredFaces(
				b,
				b.faces.filter((f) => f.word[0].startsWith(c)),
			);
		expect(b.require).toHaveLength(3);
		expect(run(b)).toEqual({ census: [6, 123, 1436], failed: 0 });
	});

	it("45-45-90 triangles and squares by length: tri45all's 16 / 161 / 1,132", () => {
		const text = `name t45
k 1 3
angle C90 90
angle C45 45
edge ES length 1
edge EH length sqrt(2)
edge ED length 2
face C90 ES C45 EH C45 ES
face C90 EH C45 ED C45 EH
face C90 ES x 4
face C90 EH x 4
vertex C90 C90 C90 C90
`;
		// a 90° corner sits in faces of three shapes, so the overlap test stands aside: sets, every order tried
		const board = parse(text).board;
		const glue = glueLines(board);
		const words = [
			["C90", "C90", "C90", "C90"],
			["C90", "C90", "C90", "C45", "C45"],
			["C90", "C90", "C45", "C45", "C45", "C45"],
			["C90", "C45", "C45", "C45", "C45", "C45", "C45"],
			["C45", "C45", "C45", "C45", "C45", "C45", "C45", "C45"],
		];
		const b = { ...board, vertices: [...words, ...glue].map((word) => ({ word })), permutations: true };
		expect(glue).toHaveLength(3);
		expect(run(b)).toEqual({ census: [16, 161, 1132], failed: 0 });
	});
});

/**
 * A face drawn with lengths as edge types, from an atlas palette tile: its corners in 15° units and the length
 * of each side, side i running from corner i to corner i+1, walked anticlockwise.
 */
function drawn(b: Board, angles: number[], lengths: string[]): Board {
	let dir = 0;
	const edges: Edge[] = lengths.map((text, i) => {
		if (i) dir = (dir + 12 - angles[i] + 24) % 24;
		return { dir, len: readLength(text)!.value, text };
	});
	expect(problemOf(edges)).toBeNull();
	return withDrawnFace(b, edges);
}

/** Quick setup on drawn faces: the plane's vertices built face by face where the board lays out, else every set
 *  that closes in each order whose shared sides glue; then the gluing lines. */
function quick(b: Board, max = 12): Board {
	const words = layable(b)
		? fittingVertices(b, max)!
		: closingVertices(b, "plane", 0, max).words.flatMap((w) => arrangements(w)!.filter((o) => sidesMeet(b, o)));
	return { ...b, vertices: [...words, ...glueLines(b)].map((word) => ({ word })), permutations: false };
}

// The references are the atlas's corrected counts. Its first edge-typed numbers (tri45 3 / 4 / 12 on 2026-08-13,
// planigon-lite 6 / 27 on 08-18) predate the face-filter and σ-fold fixes and were withdrawn (DEVELOPMENT_NOTES).
describe("lengths drawn as edge types, held to the atlas's edge-typed palettes", () => {
	const board = (name: string, kmax: number) => ({ ...emptyBoard(), name, kmax });
	it("the 45-45-90 triangle alone: the tri45 shelf's 2 / 12 / 41", () => {
		// public/tri45, cut to the tilings whose every face is a unit-leg triangle, edge to edge: 2 / 12 / 41
		// (k = 1 is the hand-derived two: one diagonal throughout, and the checkerboard of diagonals)
		const b = drawn(board("tri45", 3), [6, 3, 3], ["1", "sqrt2", "1"]);
		expect(serialize(b)).toContain("edge Esqrt2 length sqrt2\n");
		expect(run(quick(b))).toEqual({ census: [2, 12, 41], failed: 0 });
	});
	it("drawn and hidden sides of the 45-45-90 triangle on the (2,4,4) Schwarz board: the sch244 shelf's 111 / 283", () => {
		// the drawn preset used to take the √2 side's type off with the rest, leaving a triangle of three unit
		// sides that closes only in the hyperbolic plane; each length now takes the preset's types of its own.
		// No loose ends, as Marek's edge systems have none (with them: 151 / 354)
		const tri = drawn(board("sch244", 3), [6, 3, 3], ["1", "sqrt2", "1"]);
		const { board: b, glue, vertices, plain } = decorate(tri, "drawn", false);
		expect(serialize(plain)).toBe(serialize({ ...tri, vertices: [] }));
		expect(serialize(b)).toContain("edge Esqrt2_Ed length sqrt2 drawn\nedge Esqrt2_Eu length sqrt2 hidden\n");
		expect(b.faces).toHaveLength(6);
		expect(serialize(decorate(b, "drawn").board)).toBe(serialize(b));
		// colourings keep the length too
		expect(colorize(tri, 2).board.faces.every((f) => f.word.includes("Esqrt2"))).toBe(true);
		// the board's two vertices: four right angles at a square's centre, eight 45° corners at a lattice point
		const right = plain.angles.find((a) => a.value === "90")!.sym;
		const words = fittingVertices(plain, 8)!.filter(
			(w) => w.length === (w[0] === right ? 4 : 8) && new Set(w).size === 1,
		);
		expect(words).toHaveLength(2);
		const schwarz = { ...b, vertices: [...vertices(words), ...glue].map((word) => ({ word })), permutations: false };
		expect(
			geometry(
				schwarz,
				schwarz.vertices.map((v) => v.word),
			).kind,
		).toBe("plane");
		expect(run(schwarz, 3)).toEqual({ census: [0, 111, 283], failed: 0 });
	});
	it("the triangle and the squares at both scales: tri45all's 16 / 161 / 1,132", () => {
		let b = board("tri45all", 3);
		for (const [a, l] of [
			[
				[6, 3, 3],
				["1", "sqrt2", "1"],
			],
			[
				[6, 3, 3],
				["sqrt2", "2", "sqrt2"],
			],
			[
				[6, 6, 6, 6],
				["1", "1", "1", "1"],
			],
			[
				[6, 6, 6, 6],
				["sqrt2", "sqrt2", "sqrt2", "sqrt2"],
			],
		] as [number[], string[]][])
			b = drawn(b, a, l);
		expect(run(quick(b))).toEqual({ census: [16, 161, 1132], failed: 0 });
	});
	it("the Laves kite of 3.4.6.4 to k = 17, every tiling drawn", () => {
		// an edge midpoint is a vertex type with two mirror axes, so a high-k certificate has dozens of them:
		// decode listed every combination of axes at once and ran out of memory at k = 13
		const b = drawn(board("kite", 17), [4, 6, 8, 6], ["sqrt3", "1", "1", "sqrt3"]);
		expect(run(quick(b), 17)).toEqual({ census: [1, 0, 2, 0, 0, 1, 0, 1, 1, 0, 3, 0, 3, 3, 1, 5, 1], failed: 0 });
	});
	it("the planigons at no dodecagon, from the Laves family (planigon-lite, edges whole): the recount's 10 / 31", () => {
		// every planigon but the four with a corner at a dodecagon's centre, as the atlas's planigon-lite has them
		const base = board("planigon_lite", 2);
		const all = withFamily(base, { kind: "laves", all: true }).board;
		const b = keepNew(base, all, (i) => !all.faces[i].trail!.includes("12")).board;
		expect(b.faces).toHaveLength(11);
		// DEVELOPMENT_NOTES 2026-08-18, "Planigons, recounted": 11 planigons whole, k=1 10, k=2 31
		expect(run(quick(b))).toEqual({ census: [10, 31], failed: 0 });
	});
	it("a side of length 1 needs no type: a plain square glues to a drawn house's sides of length 1", () => {
		// the square from Add family, then a house drawn (a 1 × √2 rectangle with a 45-45-90 roof on its long side):
		// only its √2 side is typed
		const plain = { ...board("house", 4), angles: [{ sym: "A4" }], faces: [{ word: ["A4"], repeat: 4 }] };
		const b = drawn(plain, [9, 6, 9, 6, 6], ["1", "1", "1", "sqrt2", "1"]);
		expect(serialize(b)).toMatch(/face A4 x 4\nface \S+ \S+ \S+ \S+ Esqrt2 \S+\n/);
		expect(check(b).filter((p) => /type/.test(p.message))).toEqual([]);
		// k = 1 is the square grid; the houses alone come at k = 2
		expect(run(quick(b), 4)).toEqual({ census: [1, 2, 2, 5], failed: 0 });
		// an older drawing typed the unit sides E1 too, which no plain side meets: the check says so, and Quick
		// setup takes the type off, for the same tilings
		const old = parse(
			"name old\nk 1 4\nangle A4\nangle H_135 135\nangle H_90 90\nedge E1 length 1\nedge Esqrt2 length sqrt2\n" +
				"face A4 x 4\nface H_135 E1 H_90 E1 H_135 E1 H_90 Esqrt2 H_90 E1\nvertex A4 A4 A4 A4\nvertex E1 E1\nvertex Esqrt2 Esqrt2\n",
		).board;
		expect(
			check(old)
				.filter((p) => /needs no type/.test(p.message))
				.map((p) => p.where),
		).toEqual([{ kind: "face", index: 0 }]);
		const now = withoutUnitType(old);
		expect(serialize(now)).toContain(
			"face H_135 H_90 H_135 H_90 Esqrt2 H_90\n\nvertex A4 A4 A4 A4\nvertex Esqrt2 Esqrt2\n",
		);
		expect(run(quick(now), 4)).toEqual({ census: [1, 2, 2, 5], failed: 0 });
	});
	it("the square and the house to k = 21, both required: the tilings that would not draw", () => {
		// 22 vertex types with two mirror axes each: trying whole combinations of axes gave up after 10^5 (9 of
		// file 21), and some cells need a wider walk to find their period (file 28)
		const plain = { ...board("house", 21), angles: [{ sym: "A4" }], faces: [{ word: ["A4"], repeat: 4 }] };
		const b = quick(drawn(plain, [9, 6, 9, 6, 6], ["1", "1", "1", "sqrt2", "1"]));
		const both = withRequiredFaces(withRequiredFaces(b, [b.faces[0]]), [b.faces[1]]);
		const { census, failed } = run(both, (f) => /solver_21_.*_(21|28)\.txt$/.test(f));
		expect(census.slice(16)).toEqual([935, 1410, 2034, 2996, 4382]);
		expect(failed).toBe(0);
	}, 180000);
});

/** Quick setup's colouring path: colour the faces, build the plain vertices that fit, colour them, and with
 *  `every`, require every colour (the 3-colour shelves hold only the colourings that use all three; the
 *  2-colour shelves keep all-A and all-B too). */
function colored(text: string, n: number, every: boolean, labeled = true): Board {
	const { board, vertices, uses, plain } = colorize(parse(text).board, n);
	const words = vertices(fittingVertices(plain, 12)!);
	const require = every ? uses(words).map((set) => ({ set: set.map((i) => i + 1) })) : [];
	// a side typed by length keeps its type, which glues to itself
	const all = [...words, ...glueLines(board)];
	return { ...board, vertices: all.map((word) => ({ word })), require, permutations: false, colorsLabeled: labeled };
}

describe("colourings", () => {
	const squares = "name sq\nk 1 4\nangle A4\nface A4 x 4\nvertex A4 A4 A4 A4\n";
	it("2-coloured squares: the Colors shelf's 8 / 53 / 309 / 1,292; 6 at k = 1 using both", () => {
		expect(run(colored(squares, 2, false))).toEqual({ census: [8, 53, 309, 1292], failed: 0 });
		expect(run(colored(squares.replace("k 1 4", "k 1 1"), 2, true)).census).toEqual([6]);
	});
	it("2-coloured triangles: 9 / 54 / 556", () => {
		const b = colored("name tri\nk 1 3\nangle A3\nface A3 x 3\nvertex A3 A3 A3 A3 A3 A3\n", 2, false);
		expect(run(b)).toEqual({ census: [9, 54, 556], failed: 0 });
	});
	it("3-coloured squares using all three: the shelf's 9 at k = 1", () => {
		expect(run(colored(squares.replace("k 1 4", "k 1 1"), 3, true)).census).toEqual([9]);
	});
	it("up to permuting colours: squares 5 / 30 / 166 with two, 3 / 58 with three (the shelf's records, grouped)", () => {
		expect(run(colored(squares.replace("k 1 4", "k 1 3"), 2, false, false)).census).toEqual([5, 30, 166]);
		expect(run(colored(squares.replace("k 1 4", "k 1 2"), 3, true, false)).census).toEqual([3, 58]);
	});
	it("the half square in three colours, all used: every tiling drawn in all three", () => {
		// the walk round each face stepped by the wrong dart's length: with a √2 side no face closed, so none found
		// its colour and all took the first (2026-11-09)
		const tri = serialize(drawn({ ...emptyBoard(), name: "c224", kmax: 2 }, [6, 3, 3], ["1", "sqrt2", "1"]));
		expect(run(colored(tri, 3, true, false))).toEqual({ census: [0, 162], failed: 0 });
	});
	it("proper: no two neighbouring squares share a colour", () => {
		const { vertices } = colorize(parse(squares).board, 2, true);
		// round a square vertex, two colours alternating: the checkerboard vertex only
		expect(vertices([["A4", "A4", "A4", "A4"]]).map((w) => cyclicKey(w))).toEqual([
			cyclicKey(["A4@A", "A4@B", "A4@A", "A4@B"]),
		]);
	});
});
