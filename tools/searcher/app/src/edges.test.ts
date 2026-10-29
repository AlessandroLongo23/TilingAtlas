// Edge types (board-format.md `edge`) and colourings: Quick setup's path from a plain board to a search, held
// to the atlas engine's counts for the same objects (experiments/results/tilesearch-edge-types-2026-10-29.log):
// drawn and hidden sides of the square grid, bubble squares, 45-45-90 triangles with squares by length, and
// the Colors shelf's colourings of the square and triangle grids.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cyclicKey, parse, serialize, withRequiredFaces, type Board } from "./board";
import { colorize, decorate, type EdgePreset } from "./corners";
import { certificatesIn, decode, flatCellWithOverlays, flatPattern, geometry, marksEdges, vertexWords, withSymbols } from "./develop";
import { fittingVertices } from "./figures";

const ENGINE = join(__dirname, "../..", process.platform === "win32" ? "tilesearch.exe" : "tilesearch");

/** Quick setup's edge-types path: type the sides, build the plain vertices that fit, type them into every
 *  edge pattern, add the gluing lines. */
function setUp(text: string, preset: EdgePreset | null, loose = true): Board {
	const { board, glue, vertices, plain } = decorate(parse(text).board, preset, loose);
	const words = vertices(fittingVertices(plain, 12)!);
	return { ...board, vertices: [...words, ...glue].map((word) => ({ word })), permutations: false };
}

/** The engine's census and every certificate up to k = 2 drawn, as the app draws them. */
function run(b: Board) {
	const dir = mkdtempSync(join(tmpdir(), "tilesearch-edges-"));
	writeFileSync(join(dir, "input.board"), serialize(b));
	execFileSync(ENGINE, ["input.board", "--threads", "8"], { cwd: dir, stdio: "ignore" });
	const out = join(dir, `solver_${b.name}`);
	const census = [...readFileSync(join(out, "census.txt"), "utf8").matchAll(/k=\d+ -- (\d+)/g)].map((m) => Number(m[1]));
	const board = parse(readFileSync(join(out, "board.txt"), "utf8")).board;
	const symbols = Object.fromEntries(
		readFileSync(join(out, "symbols.txt"), "utf8")
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((l) => l.split(" ")),
	);
	let failed = 0;
	for (const f of readdirSync(out).filter((f) => /_0[12]_.*\.txt$/.test(f)))
		for (const c of certificatesIn(readFileSync(join(out, f), "utf8"))) {
			const text = withSymbols(c, symbols);
			try {
				const g = geometry(board, vertexWords(text));
				if (g.kind !== "plane") throw new Error(g.kind);
				const d = decode(text, board);
				if (marksEdges(board)) flatPattern(d, board, g.turn, "t");
				else flatCellWithOverlays(d, board, g.turn);
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

	it("reads an edge line back as it was written", () => {
		const text = "name e\nk 1 2\n\nangle A4 90\nedge ES length sqrt(2) bump\n\nface A4 ES x 4\n\nvertex A4 A4 A4 A4\nvertex ES ES\n\npermutations no\n";
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
		let b = setUp("name tshf\nk 1 3\nangle A3 60\nangle A4 90\nangle A6 120\nface A3 x 3\nface A4 x 4\nface A6 x 6\nvertex A3 A3 A3 A3 A3 A3\n", "bubble");
		// one line per shape, any of its variants (the corner names start with the shape's corner)
		for (const c of ["A3.", "A4.", "A6."]) b = withRequiredFaces(b, b.faces.filter((f) => f.word[0].startsWith(c)));
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
		const { board, glue } = decorate(parse(text).board, null);
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

/** Quick setup's colouring path: colour the faces, build the plain vertices that fit, colour them, and with
 *  `every`, require every colour (the 3-colour shelves hold only the colourings that use all three; the
 *  2-colour shelves keep all-A and all-B too). */
function colored(text: string, n: number, every: boolean, labeled = true): Board {
	const { board, vertices, uses, plain } = colorize(parse(text).board, n);
	const words = vertices(fittingVertices(plain, 12)!);
	const require = every ? uses(words).map((set) => ({ set: set.map((i) => i + 1) })) : [];
	return { ...board, vertices: words.map((word) => ({ word })), require, permutations: false, colorsLabeled: labeled };
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
	it("proper: no two neighbouring squares share a colour", () => {
		const { vertices } = colorize(parse(squares).board, 2, true);
		// round a square vertex, two colours alternating: the checkerboard vertex only
		expect(vertices([["A4", "A4", "A4", "A4"]]).map((w) => cyclicKey(w))).toEqual([cyclicKey(["A4@A", "A4@B", "A4@A", "A4@B"])]);
	});
});

