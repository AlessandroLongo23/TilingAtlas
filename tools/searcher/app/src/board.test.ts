// The app's board reader against the engine's. Every example board and every broken board below goes
// through both; they must agree on whether it is valid and on the line of the first error, and a
// visual-editor round trip (parse → serialize → parse) must keep the board the engine sees.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { moveVertex, parse, printedLabels, removeVertex, serialize } from "./board";

const SEARCHER = join(__dirname, "../..");
const ENGINE = join(SEARCHER, process.platform === "win32" ? "tilesearch.exe" : "tilesearch");
const BOARDS = join(SEARCHER, "boards");
const tmp = mkdtempSync(join(tmpdir(), "tilesearch-test-"));

/** `tilesearch --dump`: the compiled board, or the line of its first error. */
function engine(text: string): { line: number | null; dump: string } {
	const f = join(tmp, "b.board");
	writeFileSync(f, text);
	try {
		return { line: null, dump: execFileSync(ENGINE, [f, "--dump"], { encoding: "utf8", stdio: "pipe" }) };
	} catch (e) {
		const err = String((e as { stderr?: string }).stderr);
		const m = /board line (\d+):/.exec(err);
		if (!m) throw new Error(`engine failed without a board line: ${err}`);
		return { line: Number(m[1]), dump: "" };
	}
}
const firstError = (text: string) => parse(text).problems.find((p) => p.severity === "error")?.line ?? null;

const base =
	"name t\nk 1 2\nangle A4\nangle A2\nface A4 x 4\nface A2 x 2\nvertex A4 A4 A4 A4\nvertex A2 A4 A2 A4 A4 A4\n";
const BROKEN: Record<string, string> = {
	"unknown symbol": base + "vertex A4 A5\n",
	"symbol used above its angle": "name t\nk 1 2\nface A4 x 4\nangle A4\nvertex A4 A4 A4 A4\n",
	"declared twice": base.replace("angle A2", "angle A4"),
	"x as a symbol": base + "angle x\n",
	"oo and Pi collide": base + "angle oo\nangle Pi\n",
	"number too large": base + "angle A70000\n",
	"empty face": base + "face x 3\n",
	"bare vertex": base + "vertex\n",
	"multiplier zero": base + "face A4 x 0\n",
	"multiplier missing": base + "face A4 x\n",
	"multiplier text": base + "face A4 x two\n",
	"k reversed": base.replace("k 1 2", "k 3 2"),
	"k three words": base.replace("k 1 2", "k 1 2 3"),
	"name two words": base.replace("name t", "name two words"),
	"no faces": "name t\nk 1 2\nangle A4\nvertex A4 A4 A4 A4\n",
	"no name": base.replace("name t\n", ""),
	"initial past the end": base + "initial 3\n",
	"initial not a number": base + "initial one\n",
	"unknown statement": base + "colour red\n",
	"permutations maybe": base + "permutations maybe\n",
	"search faces": base + "search faces\n",
	"geometry euclidean": base + "geometry euclidean\n",
	"comment only after error": base + "vertex A4 Q   # Q is a typo\n# trailing\n",
};
const examples = readdirSync(BOARDS)
	.filter((f) => f.endsWith(".board"))
	.map((f) => [f, readFileSync(join(BOARDS, f), "utf8")] as const);

describe.skipIf(!existsSync(ENGINE))("board reader agrees with tilesearch --dump", () => {
	it.each(examples)("example %s is valid to both", (_, text) => {
		expect(firstError(text)).toBeNull();
		expect(engine(text).line).toBeNull();
	});
	it.each(Object.entries(BROKEN))("%s: same first error line", (_, text) => {
		const ours = firstError(text);
		expect(ours).not.toBeNull();
		expect(ours).toBe(engine(text).line);
	});
	it.each(examples)("%s survives a visual-editor round trip", (_, text) => {
		expect(engine(serialize(parse(text).board)).dump).toBe(engine(text).dump);
	});
});

describe("board text round trip", () => {
	it("keeps comments, values and repeats", () => {
		const text =
			"# header line\n\nname t   # the name\nk 1 3\n\nangle A4 90\nangle Loo\n\n# squares\nface A4 x 4\nface Loo x inf\n\nvertex A4 A4 A4 A4\n\npermutations no\ninitial 1\n";
		const once = serialize(parse(text).board);
		expect(once).toContain("# header line");
		expect(once).toContain("name t   # the name");
		expect(once).toContain("# squares\nface A4 x 4");
		expect(once).toContain("face Loo x inf");
		expect(once).toContain("angle A4 90");
		expect(serialize(parse(once).board)).toBe(once);
	});
	it("keeps a line it cannot read, with its error", () => {
		const { board, problems } = parse(base + "vertex A4 Q\ncolour red\n");
		expect(serialize(board)).toContain("colour red");
		expect(problems.filter((p) => p.severity === "error").map((p) => p.line)).toEqual([9, 10]);
	});
	it("keeps initial on the same vertices when vertices move", () => {
		let b = parse(base + "vertex A2 A4 A4 A2 A4 A4\ninitial 1 3\n").board;
		b = moveVertex(b, 2, 0);
		expect(b.initial).toEqual([1, 2]);
		b = removeVertex(b, 0);
		expect(b.initial).toEqual([1]);
	});
	it("prints free symbols as X1, X2 in declaration order", () => {
		const labels = printedLabels(parse("name t\nk 1 1\nangle dent\nangle A4\nangle t60\n").board.angles);
		expect([...labels.values()]).toEqual(["X1", "A4", "X2"]);
	});
});
