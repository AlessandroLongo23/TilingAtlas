// The app's board reader against the engine's. Every example board and every broken board below goes
// through both; they must agree on whether it is valid and on the line of the first error, and a
// visual-editor round trip (parse → serialize → parse) must keep the board the engine sees.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { check, cyclicKey, deadWeight, engineBoard, engineText, followFace, moveVertex, parse, printedLabels, removeVertices, renameAngle, requiresFaces, serialize, withoutFaces } from "./board";

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
	"k past the engine's limit": base.replace("k 1 2", "k 1 255"),
	"chiral neither yes nor no": base + "chiral maybe\n",
	"name two words": base.replace("name t", "name two words"),
	"no faces": "name t\nk 1 2\nangle A4\nvertex A4 A4 A4 A4\n",
	"no name": base.replace("name t\n", ""),
	"initial past the end": base + "initial 3\n",
	"initial not a number": base + "initial one\n",
	"require past the end": base + "require 1 9\n",
	"require not a number": base + "require one\n",
	"require with nothing": base + "require\n",
	"unknown statement": base + "colour red\n",
	"permutations maybe": base + "permutations maybe\n",
	"search for something else": base + "search edges\n",
	"geometry euclidean": base + "geometry euclidean\n",
	"comment only after error": base + "vertex A4 Q   # Q is a typo\n# trailing\n",
	"power zero": base + "vertex A4^0 A4^4\n",
	"power of an unknown symbol": base + "vertex A5^4\n",
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
	it("reads A4^2 as A4 A4, as the engine does", () => {
		const power = base.replace("face A4 x 4", "face A4^2 x 2").replace("vertex A2 A4 A2 A4 A4 A4", "vertex A2 A4 A2 A4^3");
		expect(power).not.toBe(base);
		expect(firstError(power)).toBeNull();
		expect(serialize(parse(power).board)).toBe(serialize(parse(base.replace("face A4 x 4", "face A4 A4 x 2")).board));
		expect(engine(power).dump).toBe(engine(base.replace("face A4 x 4", "face A4 A4 x 2")).dump);
	});
	it.each(examples)("%s survives a visual-editor round trip", (_, text) => {
		expect(engine(serialize(parse(text).board)).dump).toBe(engine(text).dump);
	});
	it("keeps chiral yes through a round trip, as the engine reads it", () => {
		const chiral = base + "chiral yes\n";
		expect(firstError(chiral)).toBeNull();
		expect(parse(chiral).board.chiral).toBe(true);
		expect(engine(chiral).dump).toContain("chiral 1");
		expect(engine(serialize(parse(chiral).board)).dump).toBe(engine(chiral).dump);
		expect(engine(base).dump).toContain("chiral 0");
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
		b = removeVertices(b, [0]);
		expect(b.initial).toEqual([1]);
		b = parse(base + "vertex A2 A4 A4 A2 A4 A4\nvertex A4 A4 A4 A4\ninitial 1 2 3\n").board;
		b = removeVertices(b, [0, 2]); // the vertices left: 2 and 4, renumbered 1 and 2
		expect(b.vertices.length).toBe(2);
		expect(b.initial).toEqual([1]);
	});
	it("keeps required sets on their vertices, and drops a set left empty", () => {
		let b = parse(base + "vertex A2 A4 A4 A2 A4 A4\nvertex A4 A4 A4 A4\nrequire 2 4  # stars\nrequire 3\n").board;
		expect(serialize(b)).toMatch(/require 2 4 +# stars\nrequire 3\n/);
		expect(serialize(parse(serialize(b)).board)).toBe(serialize(b));
		b = moveVertex(b, 3, 0); // vertex 4 to the front: 2 → 3, 3 → 4, 4 → 1
		expect(b.require.map((r) => r.set)).toEqual([[1, 3], [4]]);
		b = removeVertices(b, [3]); // vertex 4 gone with its set
		expect(b.require.map((r) => r.set)).toEqual([[1, 3]]);
		expect(b.require[0].trail).toBe("stars");
	});
	it("finds what the warnings name: unused corners, unplaceable faces and vertices", () => {
		const b = parse(
			"name t\nk 1 1\nangle A4\nangle A3\nangle Q\nangle Z\nface A4 x 4\nface A3 x 3\nvertex A4 A4 A4 A4\nvertex A4 Q A4 A4\n",
		).board;
		// Z is in nothing; the triangle's A3 is at no vertex; Q is in no face
		expect(deadWeight(b)).toEqual({ corners: ["Z"], faces: [1], vertices: [1] });
	});
	it("prints free symbols as X1, X2 in declaration order", () => {
		const labels = printedLabels(parse("name t\nk 1 1\nangle dent\nangle A4\nangle t60\n").board.angles);
		expect([...labels.values()]).toEqual(["X1", "A4", "X2"]);
	});
});

describe("a name being typed", () => {
	it("reads an empty name as empty, keeps one name line, and asks for it only before a run", () => {
		const { board, problems } = parse("name\nk 1 1\nangle A4 90\nface A4 x 4\nvertex A4 A4 A4 A4\n");
		expect(board.name).toBe("");
		expect(board.extra).toEqual([]);
		expect(problems).toEqual([expect.objectContaining({ where: { kind: "name" }, severity: "error", beforeRun: true })]);
		const again = serialize(board);
		expect(again.split("\n").filter((l) => l.startsWith("name"))).toEqual(["name"]);
		expect(serialize(parse(again).board)).toBe(again);
	});
});

describe("cyclicKey", () => {
	// the definition: the least of every rotation of the word and of its mirror, joined
	const brute = (w: string[]) => {
		let best: string | null = null;
		for (const v of [w, [...w].reverse()])
			for (let i = 0; i < v.length; i++) {
				const k = [...v.slice(i), ...v.slice(0, i)].join(" ");
				if (best === null || k < best) best = k;
			}
		return best ?? "";
	};
	it("is the least rotation of the word or its mirror, on 20,000 random words", () => {
		const syms = ["A1", "A10", "A12", "A12p30", "A2", "B", "Pi", "Boo", "A4.Ed.Eu", "X1"];
		let seed = 7;
		const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
		for (let t = 0; t < 20000; t++) {
			const w = Array.from({ length: 1 + rand(14) }, () => syms[rand(1 + rand(syms.length))]);
			expect(cyclicKey(w)).toBe(brute(w));
		}
		expect(cyclicKey([])).toBe("");
		expect(cyclicKey(["A3", "A3", "A3"])).toBe("A3 A3 A3");
	});
});

describe("required faces follow their face", () => {
	const text =
		"name r\nk 1 2\nangle A3\nangle A4\nface A3 x 3\nface A4 x 4\nvertex A4 A4 A4 A4\nrequire face A4 x 4 | face A3 x 3\nrequire face A4 x 4\n";
	const b = parse(text).board;
	const square = b.faces[1];
	const rect = { ...square, word: ["A4", "A3"], repeat: 2 };
	it("an edited face stays required as it is now, never leaving a line for a face the board lost", () => {
		const next = followFace(b, { ...b, faces: [b.faces[0], rect] }, 1);
		expect(requiresFaces(next, [rect])).toBe(true);
		expect(requiresFaces(next, [rect, b.faces[0]])).toBe(true);
		expect(requiresFaces(next, [square])).toBe(false);
	});
	it("a renamed corner is renamed in the lines too", () => {
		expect(requiresFaces(renameAngle(b, "A4", "Q"), [{ word: ["Q"], repeat: 4 }])).toBe(true);
	});
	it("a deleted face leaves its lines, and a line left with no face goes", () => {
		const next = withoutFaces(b, [1]);
		expect(next.require).toHaveLength(1);
		expect(requiresFaces(next, [b.faces[0]])).toBe(true);
	});
	it("a required face the board does not hold is an error: no tiling can hold it", () => {
		const lost = { ...b, faces: [b.faces[0]] };
		expect(check(lost).filter((p) => p.where.kind === "require").map((p) => p.severity)).toEqual(["error"]);
		expect(check(b).filter((p) => p.where.kind === "require")).toEqual([]);
	});
});

// Marek's face-first search (AL, 2026-11-09): k counts tile orbits, the engine running the board with faces and
// vertices swapped
describe("search faces", () => {
	const text = [
		"name sq",
		"k 1 2",
		"angle A 90",
		"angle B 270",
		"angle Pi",
		"face A Pi A A Pi A",
		"face A B A A A A",
		"vertex A A A A",
		"vertex A B",
		"vertex Pi Pi",
		"vertex A A Pi",
		"permutations yes",
		"initial 2",
		"require face A Pi A A Pi A",
		"search faces",
	].join("\n");
	it("is a board, whose swap the engine reads", () => {
		expect(parse(text).problems.filter((p) => p.severity === "error")).toEqual([]);
		const e = engineBoard(parse(text).board);
		// each face written out is a vertex, each vertex's orders a face (A A Pi has one: turned or mirrored it is the
		// same), once each
		expect(e.vertices.map((v) => v.word.join(" "))).toEqual(["A Pi A A Pi A", "A B A A A A"]);
		expect(e.faces.map((f) => `${f.word.join(" ")} x ${f.repeat}`)).toEqual(["A x 4", "A B x 1", "Pi x 2", "A A Pi x 1"]);
		expect(e.permutations).toBe(false);
		// the initial vertex and the required face, swapped: a face of its orders, and the vertex that face became
		expect(e.require).toEqual([{ set: [], faces: [["A", "B"]] }, { set: [1] }]);
		expect(e.extra.some((x) => /search/.test(x.text))).toBe(false);
		if (existsSync(ENGINE)) expect(engine(engineText(text)).line).toBeNull();
	});
	it("needs every face finite", () => {
		const inf = text.replace("face A B A A A A", "face A x inf");
		expect(parse(inf).problems.some((p) => p.severity === "error" && /finite/.test(p.message))).toBe(true);
	});
	it("leaves any other board as it is", () => {
		const plain = text.replace("\nsearch faces", "");
		expect(engineText(plain)).toBe(plain);
	});
});
