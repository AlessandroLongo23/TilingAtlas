// Studies (study.ts): parameters, row boards, the checks before any search, and how a study recognises a run.
// The engine checks run where tilesearch is built; Marek's 1.061275 census is the end-to-end case: the checks
// must rule out exactly the combinations his hand-written rules drop, and more (2026-11-03).
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { RunFolder } from "../electron/runs";
import { Study } from "../electron/studies";
import type { RowState } from "./bridge";
import { cyclicKey, evaluate, minpolyAt, over, parse, polyText, removeVertices, serialize, times, withPermutations, withRequiredFaces } from "./board";
import {
	aliveKeys,
	cyclicOrders,
	faceLabels,
	faceTally,
	MAX_ORDERS,
	freeParam,
	paramText,
	planStudy,
	readParams,
	rowBoard,
	sameSearch,
	searchKey,
	searchShape,
	splitReason,
	subsetCount,
	substitute,
	vertexKeys,
	rowText,
	wholeBoards,
	withoutK,
	withoutOptionalFace,
	withParam,
	withSubsets,
	type RowPlan,
	type StudyPlan,
} from "./study";

const SEARCHER = join(__dirname, "../..");
const ENGINE = join(SEARCHER, process.platform === "win32" ? "tilesearch.exe" : "tilesearch");
const STUDIES = join(SEARCHER, "boards/studies");
const EXAMPLES = join(SEARCHER, "boards/examples");
const tmp = mkdtempSync(join(tmpdir(), "tilesearch-study-"));
const run = promisify(execFile);
let files = 0;
/** tilesearch --balance on a board text: whether it can have a tiling, and its live lines (1-based). */
type Report = { feasible: boolean; alive: number[]; orders?: { word: string; alive: boolean }[] };
async function balance(text: string): Promise<Report> {
	const f = join(tmp, `b${files++}.board`);
	writeFileSync(f, text);
	const { stdout } = await run(ENGINE, [f, "--balance"], { maxBuffer: 1 << 26 });
	return JSON.parse(stdout.split("\n")[0]) as Report;
}
/** Run `f` over `xs` with at most `n` at once. */
async function pool<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(xs.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: n }, async () => {
			while (next < xs.length) {
				const i = next++;
				out[i] = await f(xs[i]);
			}
		}),
	);
	return out;
}
const dump = (text: string) => {
	const f = join(tmp, `d${files++}.board`);
	writeFileSync(f, text);
	return execFileSync(ENGINE, [f, "--dump"], { encoding: "utf8", stdio: "pipe" });
};
let current: StudyPlan;
const text = (r: RowPlan) => (r.none ? "" : rowText(current, r).text);
const planOf = (t: string) => (current = planStudy(t));

describe("parameters", () => {
	it("evaluates whole-number arithmetic exactly", () => {
		const v = { n: 7, m: 3 };
		const s = (e: string) => {
			const x = evaluate(e, v);
			return x.q === 1 ? String(x.p) : `${x.p}/${x.q}`;
		};
		expect(s("n")).toBe("7");
		expect(s("2n")).toBe("14");
		expect(s("2*n")).toBe("14");
		expect(s("360/n")).toBe("360/7");
		expect(s("180-360/n")).toBe("900/7");
		expect(s("(n+1)(n-1)")).toBe("48");
		expect(s("2(n+m)")).toBe("20");
		expect(s("-n+10")).toBe("3");
		expect(s("12/4")).toBe("3");
		expect(() => evaluate("k", v)).toThrow(/not a parameter/);
		expect(() => evaluate("n/0", v)).toThrow(/division by zero/);
		expect(() => evaluate("", v)).toThrow(/empty/);
		expect(() => evaluate("(n", v)).toThrow(/not closed/);
		expect(() => evaluate("n)", v)).toThrow(/left over/);
	});
	it("reads vary lines: lists, ranges, duplicates, and mistakes", () => {
		const { params, problems } = readParams("name t\nvary n 5..7 9 6\nvary m 1\nface A{n} x {m}\n");
		expect(problems).toEqual([]);
		expect(params).toEqual([
			{ name: "n", values: [5, 6, 7, 9], line: 2 },
			{ name: "m", values: [1], line: 3 },
		]);
		const bad = readParams("vary n\nvary 2x 1\nvary n 1\nvary n 2\nvary p 7..3\nvary q a\nface A{n} x 3\n").problems;
		expect(bad.map((p) => p.line)).toEqual([1, 2, 4, 5, 6]);
		// a parameter that no {…} reads, outside comments, would make every row the same board
		expect(readParams("vary n 3..5\nface A3 x 3   # {n}\n").problems.map((p) => [p.line, p.message])).toEqual([
			[1, "Parameter n is used nowhere yet: give a face n sides in its dialog, or write {n} in a line."],
		]);
		expect(readParams("vary n 3..5\nvary m 1 2\nface A{2n} x {m+1}\n").problems).toEqual([]);
	});
	it("substitutes outside vary lines and comments, keeping line numbers", () => {
		const t = "vary n 5\nface A{n} x {2n}   # {n} stays\nangle A{n} {180-360/n}\n";
		const { text: out, problems } = substitute(t, { n: 5 });
		expect(problems).toEqual([]);
		expect(out).toBe("vary n 5\nface A5 x 10   # {n} stays\nangle A5 108\n");
		const broken = substitute("name t\nface A{n x 3\nface A{q} x 3\n", { n: 5 }).problems;
		expect(broken.map((p) => p.line)).toEqual([2, 3]);
	});
	it("counts the orders of corners the engine lists", () => {
		const orders = (lines: string, perms = "yes") =>
			cyclicOrders(parse(`name t\nangle B3\nangle B4\nangle Pi\nface B3 Pi x 3\nface B4 Pi x 4\n${lines}\npermutations ${perms}\n`).board);
		// 12 + 12 corners: 112,720 necklaces; 6 + 6 and a Pi: 924; Pi Pi: 1
		expect(orders("vertex B3^12 B4^12\nvertex B3^6 B4^6 Pi\nvertex Pi Pi")).toBe(112720 + 924 + 1);
		expect(orders("vertex B3^12 B4^12\nvertex Pi Pi", "no")).toBe(2);
		// 40 + 40 (the 7.2733788 line): 1.34·10²¹, far past what the Searcher hands the engine
		expect(orders("vertex B3^40 B4^40") / 1343840109168425292660).toBeCloseTo(1, 9);
		expect(orders("vertex B3^40 B4^40")).toBeGreaterThan(MAX_ORDERS);
	});
	it("writes a line per j of a for range, a power of 0 leaving its corner out", () => {
		// n triangles at a vertex, an n-gon's corner worth two of them: A3^(n-2j) A{n}^j, j = 0 .. n/2
		const t =
			"name t\nk 1 2\nvary n 7 8\nangle A3\nangle A{n}\noptional A3 x 3\noptional A{n} x {n}\n" +
			"vertex A3^{n-2j} A{n}^{j} for j 0..{n/2}   # every split\npermutations yes\n";
		const at = (n: number) => substitute(t, { n });
		expect(at(7).problems).toEqual([]);
		const lines = at(7).text.split("\n");
		expect(lines[7]).toBe("# every split"); // the template line keeps its number, so problems point at it
		expect(lines.filter((l) => l.startsWith("vertex"))).toEqual(["vertex A3^7", "vertex A3^5 A7^1", "vertex A3^3 A7^2", "vertex A3^1 A7^3"]);
		expect(at(8).text.split("\n").filter((l) => l.startsWith("vertex")).at(-1)).toBe("vertex A8^4");
		const plan = planOf(t);
		expect(plan.problems).toEqual([]);
		expect(plan.instances.map((x) => x.board.vertices.length)).toEqual([4, 5]);
		expect(plan.list!.map((r) => r.name)).toEqual(["n=7_A3", "n=7_A7", "n=7_A3,A7", "n=8_A3", "n=8_A8", "n=8_A3,A8"]);
		const lines8 = parse(rowText(plan, plan.list![5]).text).board.vertices.map((v) => v.word.join(" "));
		expect(lines8).toContain("A3 A3 A3 A3 A8 A8");
		// a power below 0, a counter that is a parameter, a range that does not read
		const bad = (line: string) => substitute(`name t\nvary n 4\n${line}\n`, { n: 4 }).problems.map((p) => [p.line, p.message]);
		expect(bad("vertex A3^{n-2j} for j 0..3")).toEqual([[3, "The power A3^-2 must be a whole number from 0 up."]]);
		expect(bad("vertex A3^{j} for n 0..{n}")[0][1]).toMatch(/cannot count the lines/);
		expect(bad("vertex A3^{j} for j 0..{m}")[0][1]).toMatch(/The range of j/);
	});
});

describe("rows", () => {
	const base = (extra = "") =>
		parse(
			[
				"name t",
				"k 1 3",
				"angle A3 60",
				"angle A4 90",
				"angle A6 120",
				"face A3 x 3",
				"optional A4 x 4",
				"optional A6 x 6",
				"vertex A3 A3 A3 A3 A3 A3",
				"vertex A4 A4 A4 A4",
				"vertex A3 A3 A4 A4",
				"vertex A3 A6 A3 A6",
				"vertex A6 A6 A6",
				"permutations yes",
				extra,
			].join("\n"),
		).board;
	it("keeps the faces of its subset, the lines they can make, and requires each optional face", () => {
		const o = rowBoard(base(), [1], "A4");
		if (!("board" in o)) throw new Error(o.none);
		expect(o.board.faces.map((f) => f.word[0])).toEqual(["A3", "A4"]);
		expect(o.board.faces.some((f) => f.optional)).toBe(false);
		expect(o.board.vertices.map((v) => v.word.join(" "))).toEqual(["A3 A3 A3 A3 A3 A3", "A4 A4 A4 A4", "A3 A3 A4 A4"]);
		expect(o.board.require).toEqual([{ set: [], faces: [["A4", "A4", "A4", "A4"]] }]);
		expect(o.board.angles.map((a) => a.sym)).toEqual(["A3", "A4"]);
		expect(dump(serialize(o.board))).toContain("require 2 3"); // the engine reads the A4 requirement as a set
	});
	it("counts and lists subsets by size, then board order", () => {
		const b = base();
		expect(subsetCount(b)).toBe(3);
		expect(subsetCount({ ...b, subsets: [0, 2] })).toBe(4);
		expect(subsetCount({ ...b, subsets: [2, 2] })).toBe(1);
		const plan = planOf(serialize({ ...b, subsets: [0, 2] }));
		expect(plan.list!.map((r) => r.name)).toEqual(["base", "A4", "A6", "A4,A6"]);
	});
	it("rules a row out, with its reason, when it cannot have a tiling", () => {
		// a face whose corner no line holds once the others are gone
		const b = parse(
			"name t\nk 1 2\nangle A3\nangle A4\nface A3 x 3\noptional A4 x 4\nvertex A3 A3 A3 A3 A3 A3\nvertex A3 A3 A4 A4\nvertex A3 A3 A3 A4 A4\npermutations yes\n",
		).board;
		expect(rowBoard({ ...b, faces: [b.faces[1]] }, [0], "A4")).toEqual({
			none: "No vertex is left: each has a corner of a face this row leaves out.",
		});
		// a required vertex set that loses every vertex
		const req = { ...base(), require: [{ set: [2] }] };
		expect(rowBoard(req, [2], "A6")).toEqual({
			none: "Required set 1 loses every vertex on this row.",
		});
		// initial vertices that all go: never "every tiling", which an empty initial line would mean
		const init = { ...base(), initial: [4] };
		expect(rowBoard(init, [1], "A4")).toEqual({ none: "Every initial vertex is gone on this row." });
		// a required face the row leaves out
		const rf = parse(serialize(base()) + "require face A6 x 6\n").board;
		expect(rowBoard(rf, [1], "A4")).toEqual({ none: "No face of required set 1 is on this row's board." });
		// the empty subset with nothing else left
		const only = parse("name t\nk 1 2\nangle A4\noptional A4 x 4\nvertex A4 A4 A4 A4\nsubsets 0 1\n").board;
		expect(rowBoard(only, [], "base")).toEqual({ none: "No face is left on this row's board." });
	});
	it("cuts a require-any line to the row's faces, and drops it when one of the row's own faces meets it", () => {
		const b = parse(serialize(base()) + "require face A4 x 4 | face A6 x 6\nrequire face A3 x 3 | face A6 x 6\n").board;
		const o = rowBoard(b, [1], "A4");
		if (!("board" in o)) throw new Error(o.none);
		expect(o.board.require.map((r) => r.faces)).toEqual([[["A3", "A3", "A3"]], [["A4", "A4", "A4", "A4"]]]);
		expect(dump(serialize(o.board))).toBeTruthy(); // no face the row left out, so no corner without an angle
		const both = parse(serialize(base()) + "subsets 0 2\nrequire face A4 x 4 | face A6 x 6\n").board;
		expect(rowBoard(both, [], "base")).toEqual({ none: "No face of required set 1 is on this row's board." });
	});
	it("makes no row of a subset with no face of a required set, and counts the others as it lists them", () => {
		const any = "subsets 0 2\nrequire face A4 x 4 | face A6 x 6\n";
		expect(planOf(serialize(base()) + any).list!.map((r) => r.name)).toEqual(["A4", "A6", "A4,A6"]);
		// a set naming a face always on the board, every row meets; a set holding another's faces goes with it
		const plan = planOf(serialize(base()) + any + "require face A3 x 3 | face A6 x 6\nrequire face A6 x 6\n");
		expect([plan.required, plan.rows, plan.list!.map((r) => r.name)]).toEqual([1, 2, ["A6", "A4,A6"]]);
		// nine faces in three overlapping sets: the count matches every subset tried by hand
		const F = Array.from({ length: 9 }, (_, i) => `F${i}`);
		const sets = [[0, 1, 2], [2, 3, 4], [5, 6, 0]];
		const t = [
			"name t\nk 1 2",
			...F.map((f) => `angle ${f} 60`),
			...F.map((f) => `optional ${f} x 3`),
			...F.map((f) => `vertex ${f}^6`),
			"subsets 1 5",
			...sets.map((s) => `require ${s.map((i) => `face ${F[i]} x 3`).join(" | ")}`),
		].join("\n");
		let hand = 0;
		for (let m = 0; m < 1 << 9; m++) {
			const size = F.filter((_, i) => m & (1 << i)).length;
			if (size >= 1 && size <= 5 && sets.every((s) => s.some((i) => m & (1 << i)))) hand++;
		}
		const big = planOf(t);
		expect([big.problems, big.rows, big.list!.length]).toEqual([[], hand, hand]);
	});
	it("requires an optional apeirogon with x inf, which the engine reads", () => {
		const b = parse(
			"name t\nk 1 2\nangle A3\nangle Boo\nedge Pi\nface A3 x 3\noptional Boo Pi x inf\nvertex A3 A3 Boo Boo\nvertex Pi Pi\nvertex A3 A3 A3 Boo Pi\npermutations yes\n",
		).board;
		const o = rowBoard(b, [1], "Boo");
		if (!("board" in o)) throw new Error(o.none);
		const t = serialize(o.board);
		expect(t).toContain("require face Boo Pi x inf");
		expect(parse(t).board.require[0].infinite).toEqual([true]);
		expect(dump(t)).toBeTruthy();
	});
	it("names rows by values and faces, safely, and refuses too many", () => {
		const t = readFileSync(join(EXAMPLES, "92-study-hybrid.board"), "utf8");
		const plan = planOf(t);
		expect(plan.problems).toEqual([]);
		expect(plan.list!.map((r) => r.name)).toEqual(["n=6", "n=7", "n=8", "n=9", "n=10"]);
		expect(text(plan.list![1])).toMatch(/face A7 x 7\nface A14 x 14/);
		const many = planStudy(t.replace("vary n 6..10", "vary n 6..1006\nvary m 1..20"), false);
		expect(many.rows).toBe(1001 * 20);
		expect(planOf(t.replace("vary n 6..10", "vary n 6..1006\nvary m 1..20")).list).toBeNull();
		// a value that breaks the board is an error that names it
		const broken = planOf(t.replace("vary n 6..10", "vary n 0 6"));
		expect(broken.problems[0].message).toMatch(/^At n = 0: /);
	});
	it("keys two rows alike when a parameter changes nothing, so the second is the same search", () => {
		const p = planOf("name t{n}\nk 1 2\nvary n 1 2\nangle A4\nface A4 x 4\nvertex A4 A4 A4 A4\n");
		const [a, b] = p.list!;
		expect([a.name, b.name]).toEqual(["n=1", "n=2"]);
		expect(rowText(p, a).key).toBe(rowText(p, b).key);
		const q = planOf("name t\nk 1 2\nvary n 4 6\nangle A{n}\nface A{n} x {n}\nvertex A{n} A{n} A{n}\n");
		expect(rowText(q, q.list![0]).key).not.toBe(rowText(q, q.list![1]).key);
	});
	it("makes the whole board, per parameter value: every optional face ordinary, nothing required", () => {
		const [one] = wholeBoards(serialize(base()));
		const b = parse(one.text).board;
		expect([b.faces.length, b.vertices.length, b.require.length, b.faces.some((f) => f.optional)]).toEqual([3, 5, 0, false]);
		const many = wholeBoards("name t\nk 1 3\nvary n 3 4\nangle A{n}\noptional A{n} x {n}\nvertex A{n} x 6\n");
		expect(many.map((w) => [w.values.n, parse(w.text).board.faces[0].word[0]])).toEqual([
			[3, "A3"],
			[4, "A4"],
		]);
		expect(withoutK("name a  # x\nk 1 3\n\nface A3   x 3\n")).toBe(withoutK("name a\nk 1 9\nface A3 x 3"));
	});
	it("keeps text round trips of optional faces, subsets and apeirogon requires", () => {
		const t =
			"name t\nk 1 2\nvary n 1..3\n\nangle A3\nangle Boo\nedge Pi\n\nface A3 x 3\noptional Boo Pi x inf\n\nvertex A3 A3 Boo Boo\nvertex Pi Pi\n\npermutations yes\nsubsets 0 1\nrequire face Boo Pi x inf | face A3 A3 A3\n";
		const b = parse(t);
		expect(b.problems.filter((p) => p.severity === "error")).toEqual([]);
		expect(serialize(b.board)).toBe(t);
	});
});

describe("a study on disk, changed while it goes", () => {
	// four optional faces, one a row. F0's search stopped at its time ceiling, F1's at its disk ceiling; F3's first
	// search found 3 tilings at k = 2, and its raised search (to k = 3) has not run yet
	const setUp = () => {
		const dir = mkdtempSync(join(tmpdir(), "tilesearch-study-"));
		const F = ["F0", "F1", "F2", "F3"];
		const board = ["name s\nk 1 2", ...F.map((f) => `angle ${f} 60`), ...F.map((f) => `optional ${f} x 3`), ...F.map((f) => `vertex ${f}^6`), "subsets 1 1 # one a row", ""].join("\n");
		writeFileSync(join(dir, "study.board"), board);
		const run = (name: string, census: string, capped?: string, k = 2) => {
			const d = join(dir, name);
			mkdirSync(join(d, "solver_s"), { recursive: true }); // named after the board, as the engine names it
			writeFileSync(join(d, "input.board"), board.replace(/^optional/gm, "face"));
			writeFileSync(join(d, "run.json"), JSON.stringify({ threads: 1, nice: 10, k: [1, k], raise: { minutes: 1, upTo: 3 } }));
			writeFileSync(join(d, "solver_s", "census.txt"), census);
			// a stopped run counts what its finished roots found: one root here, with the census's counts
			const kn = [...census.matchAll(/k=(\d+) -- (\d+)/g)].map((m) => `${m[1]}:${m[2]}`);
			if (!census.includes("MAX")) writeFileSync(join(d, "solver_s", "roots.done"), `0 ${kn.join(" ")}\n`);
			if (capped) writeFileSync(join(d, "capped.txt"), capped);
			return RunFolder.open(d)!;
		};
		const runs = [
			run("F0-run", "k=1 -- 1\n", "Stopped by its rule at k ≤ 2: it ran over 1 min."),
			run("F1-run", "k=1 -- 1\n", "Stopped by its rule at k ≤ 2: it wrote over 1 GB."),
			run("F3-run", "k=1 -- 0\nk=2 -- 3\nMAX\n"),
			run("F3-new", "k=1 -- 0\n", undefined, 3),
		];
		const options = { mode: "enumerate", seconds: 60, limit: 0, parallel: 1, threads: 1, nice: 10, raise: { minutes: 1, upTo: 3 } };
		const rows = [
			{ name: "F0", check: "open", run: "F0-run" },
			{ name: "F1", check: "open", run: "F1-run" },
			{ name: "F2", check: "static", reason: "No vertex is left." },
			{ name: "F3", check: "open", run: "F3-new", was: "F3-run" },
		];
		writeFileSync(join(dir, "study.json"), JSON.stringify({ version: 1, created: "2026-11-08T00:00:00Z", state: "done", note: "", options, rows }));
		const study = Study.open(dir)!;
		const byDir = new Map(runs.map((r) => [r.dir, r]));
		const edit = (text: string, apply = false) => study.edit(text, apply, byDir, () => false);
		const row = (name: string) => study.detail(byDir, () => false).rows.find((r) => r.name === name)!;
		return { dir, study, byDir, edit, row };
	};
	it("finishes the searches a time ceiling stopped, raising k no further, and leaves a disk ceiling alone", () => {
		const { study, byDir, row } = setUp();
		expect([row("F0").state, row("F1").state]).toEqual(["limit", "limit"]);
		expect(study.finish(byDir)).toBe(1);
		const [f0, f1] = [...byDir.values()];
		expect([f0.capped, f0.options?.raise, !!f1.capped]).toEqual([null, undefined, true]);
		expect([row("F0").state, row("F1").state, study.state]).toEqual(["stopped", "limit", "running"]);
	});
	it("shows what a raised row found until its new search finishes", () => {
		const { study, byDir } = setUp();
		const f3 = study.detail(byDir, (id) => id.endsWith("F3-new")).rows.find((r) => r.name === "F3")!;
		expect([f3.state, f3.first, f3.total, f3.raising]).toEqual(["found", 2, 3, { state: "queued", k: 3 }]);
		expect(study.summary(byDir, () => false).raising).toBe(1);
	});
	it("takes more faces per row as an edit: the old rows keep their checks and runs, the new join unchecked", async () => {
		const { dir, study, edit, row } = setUp();
		const wider = withSubsets(study.template, [1, 2]);
		expect(await edit(wider)).toMatchObject({ rows: 10, kept: 4, changed: 0, added: 6, dropped: 0, lost: [], removed: [] });
		expect(readFileSync(join(dir, "study.board"), "utf8")).toContain("\nsubsets 1 1 # one a row\n"); // a preview writes nothing
		await edit(wider, true);
		expect(readFileSync(join(dir, "study.board"), "utf8")).toContain("\nsubsets 1 2 # one a row\n");
		expect([study.detail(new Map(), () => false).rowCount, study.state]).toEqual([10, "checking"]);
		expect([row("F2").state, row("F3").state, row("F0,F1").state]).toEqual(["ruled-out", "found", "checking"]);
		// a vertex line of F0 and F1 together changes the board of the one row that holds both
		expect(await edit(`${wider}vertex F0^3 F1^3\n`)).toMatchObject({ kept: 9, changed: 1, added: 0, dropped: 0 });
	});
	it("takes a face out: its rows leave, their tilings asked about first, and the census records it", async () => {
		const { dir, study, edit } = setUp();
		const text = withoutOptionalFace(study.template, "F0")!;
		expect(text).not.toMatch(/F0/); // its face, vertex and angle lines
		const res = await edit(text, true);
		expect(res).toMatchObject({
			rows: 3,
			kept: 3,
			dropped: 1,
			lost: [{ name: "F0", tilings: 1 }],
			removed: [{ face: "F0", rows: 1, found: 1, tilings: 1, left: 0, proven: false }],
		});
		expect("stop" in res && res.stop.map((d) => basename(d))).toEqual(["F0-run"]);
		expect(JSON.parse(readFileSync(join(dir, "study.json"), "utf8")).removed.map((r: { face: string }) => r.face)).toEqual(["F0"]);
		expect(withoutOptionalFace("name t\nvary n 3 4\noptional A{n} x {n}\n", "A{n}")).toBeNull();
	});
	it("tallies a face: its tilings, how far its other rows were searched, or ruled out at every k", () => {
		const r = (faces: string[], state: RowState, total = 0, through?: number) => ({ faces, state, total, through });
		const rows = [r(["A"], "none", 0, 12), r(["A", "B"], "none", 0, 9), r(["B"], "found", 5), r(["C"], "ruled-out"), r(["D"], "none", 0, 4), r(["D", "E"], "waiting")];
		expect(faceTally(rows, "A")).toEqual({ rows: 2, found: 0, tilings: 0, left: 0, through: 9, proven: false });
		expect(faceTally(rows, "B")).toMatchObject({ found: 1, tilings: 5 });
		expect(faceTally(rows, "C")).toMatchObject({ proven: true, left: 0 });
		expect(faceTally(rows, "D")).toEqual({ rows: 2, found: 0, tilings: 0, left: 1, proven: false });
	});
});

describe("an edge's minimal polynomial", () => {
	it("is read from the header, matched to an edge, and goes with every row's board", () => {
		const text = ["# minpoly 2.4994600779280268 4*x^3 - 24*x^2 - 3*x - 1", "# minpoly 1.3169578969248167 x - 2", "# a note",
			"name t", "k 1 3", "angle A3 60", "optional A3 x 3", "vertex A3 A3 A3 A3 A3 A3", ""].join("\n");
		expect(minpolyAt(parse(text).board.header, 1.31695789692)).toBe("x - 2");
		expect(minpolyAt(parse(text).board.header, 1.3)).toBeNull();
		expect(polyText("4*x^13 - 24*x^2 - 1")).toBe("4x¹³ − 24x² − 1");
		const plan = planStudy(text);
		const row = rowText(plan, plan.list![0]).text;
		expect(row).toMatch(/^# minpoly 2\.49946\S* 4\*x\^3/m);
		expect(row).not.toMatch(/a note/);
		expect(searchKey(parse(row).board)).toBe(searchKey(parse(row.replace(/^#.*\n/gm, "")).board));
	});
});

describe("setting a study up from the board page", () => {
	const hybrid = readFileSync(join(EXAMPLES, "92-study-hybrid.board"), "utf8");
	it("reads a board with parameters at chosen values, and writes its formulas back", () => {
		const t =
			"name h\nk 1 3\nvary n 6..10\n\nangle A3 60\nangle A{n} {180-360/n}\n\nface A3 x 3\nface A{n} x {n}\n\nvertex A3 A{n} A{n}\n\npermutations no\nrequire face A{n} x {n}\n";
		const { board, problems } = parse(t, { n: 7 });
		expect(problems.filter((p) => p.severity === "error")).toEqual([]);
		expect(board.faces[1]).toMatchObject({ word: ["A{n}"], repeat: 7 });
		expect(board.angles[1].value).toBe("900/7");
		expect(board.require[0].faces![0]).toHaveLength(7);
		expect(serialize(board)).toBe(t);
		// an edit to a value replaces its formula; the rest keep theirs
		const five = { ...board, faces: board.faces.map((f, i) => (i === 1 ? { ...f, repeat: 5 } : f)) };
		expect(serialize(five)).toContain("\nface A{n} x 5\n");
		expect(serialize(five)).toContain("\nangle A{n} {180-360/n}\n");
		// requiring a face with a formula requires it at every value
		const req = withRequiredFaces({ ...board, require: [] }, [board.faces[1]]);
		expect(serialize(req)).toContain("\nrequire face A{n} x {n}\n");
		// a formula that does not work out keeps its line, with the problem on it
		const bad = parse(t.replace("face A{n} x {n}", "face A{n} x {n-6}"), { n: 6 });
		expect(bad.board.faces).toHaveLength(2);
		expect(bad.problems.find((p) => p.where.kind === "face")?.message).toMatch(/is 0 here/);
		// read as the engine reads it, with no values: {n} is no repeat count
		expect(parse(t).problems.some((p) => p.severity === "error")).toBe(true);
	});
	it("edits a board with parameters as the editor does, keeping its {n}", () => {
		const { board } = parse(hybrid, { n: 8 });
		// the editor's board is the file: written back unchanged, at any value it is drawn at
		expect(serialize(board)).toBe(hybrid);
		expect(board.faces.map((f) => f.repeat)).toEqual([3, 4, 8, 16]);
		expect(faceLabels(board)).toEqual(["A3", "A4", "A{n}", "A{2n}"]);
		const on = serialize({ ...board, faces: board.faces.map((f, i) => (i >= 2 ? { ...f, optional: true } : f)) });
		expect(on).toContain("\noptional A{n} x {n}\noptional A{2n} x {2n}\n");
		expect(on.replace(/optional/g, "face")).toBe(hybrid);
		// 5 values of n, each with A{n}, A{2n} or both
		const plan = planOf(on);
		expect(plan.problems).toEqual([]);
		expect(plan.list!.slice(0, 3).map((r) => r.name)).toEqual(["n=6_A6", "n=6_A12", "n=6_A6,A12"]);
		expect(plan.rows).toBe(15);
	});
	it("rewrites a face's count of corners short, keeping its value (n corners every 2 is x {n/2})", () => {
		const val = (e: string, n: number) => {
			const v = evaluate(e, { n });
			return v.p / v.q;
		};
		for (const e of ["n", "2n", "3n", "n+1", "2(n+1)", "n/2", "(n+1)/2", "6n/3", "n-1", "12"])
			for (const k of [1, 2, 3, 4, 6])
				for (const n of [5, 6, 7, 12]) {
					expect(val(times(k, e), n)).toBeCloseTo(k * val(e, n), 9);
					expect(val(over(e, k), n)).toBeCloseTo(val(e, n) / k, 9);
				}
		expect([times(2, "n"), over("2n", 2), over("n", 2), times(2, over("n", 2)), times(2, "12")]).toEqual(["2n", "n", "n/2", "n", "24"]);
		expect([over("2(n+1)", 2), times(2, over("2(n+1)", 2))]).toEqual(["(n+1)", "2(n+1)"]);
	});
	it("names faces for picking: the first corner off the sides, numbered when two read alike", () => {
		const { board } = parse("name t\nk 1 1\nangle A3\nangle Boo\nedge Pi\nface A3 x 3\nface A3 A3 A3\noptional Boo Pi x inf\n");
		expect(faceLabels(board)).toEqual(["A3_1", "A3_2", "Boo"]);
	});
	it("adds, rewrites and removes vary lines", () => {
		const t = "name t\nk 1 2\nangle A{n}\n";
		const one = withParam(t, "n", "6..10");
		expect(one).toBe("name t\nk 1 2\nvary n 6..10\nangle A{n}\n");
		const two = withParam(one, freeParam(readParams(one).params), "1 2");
		expect(two).toBe("name t\nk 1 2\nvary n 6..10\nvary m 1 2\nangle A{n}\n");
		expect(paramText(two, readParams(two).params[1])).toBe("1 2");
		// a comment on the line stays; removing takes the line out
		expect(withParam("vary n 6..10   # sizes\n", "n", "3..5")).toBe("vary n 3..5 # sizes\n");
		expect(withParam(two, "n", null)).toBe("name t\nk 1 2\nvary m 1 2\nangle A{n}\n");
		expect(withParam("name t\n", "n", "3")).toBe("name t\nvary n 3\n");
		expect(freeParam([])).toBe("n");
		// the setup's remove: the lines keep the first value, so the board is the one the editor showed
		const fixed = withParam(substitute(hybrid, { n: 6 }).text, "n", null);
		expect(fixed).toContain("\nface A6 x 6\nface A12 x 12\n");
		expect(readParams(fixed).params).toEqual([]);
		expect(parse(fixed).problems.filter((p) => p.severity === "error")).toEqual([]);
	});
});

describe.skipIf(!existsSync(ENGINE))("the checks before any search", () => {
	it("rules out Marek's 1.061275 combinations as his rules do, and 48 he left open", async () => {
		const t = readFileSync(join(STUDIES, "1_061275_census.board"), "utf8");
		const plan = planOf(t);
		expect(plan.problems).toEqual([]);
		expect(plan.rows).toBe(4095);
		const rows = plan.list!;
		const open = rows.filter((r) => !r.none);
		expect(rows.length - open.length).toBe(2880);
		const verdicts = await pool(open, 12, async (r) => {
			const b = parse(text(r)).board;
			const { feasible, alive } = await balance(text(r));
			return !feasible ? "balance" : splitReason(b, alive) ? "split" : "open";
		});
		const count = (v: string) => verdicts.filter((x) => x === v).length;
		// the probe of 2026-11-03 (experiments: census_probe.py), here through the app's own code
		expect([count("balance"), count("split"), count("open")]).toEqual([384, 207, 624]);
		// every combination he found a tiling for is still open: nothing here contradicts a search
		const found = ["A3,A4", "A5,B3", "A3,A4,G3", "A3,A4,Boo,G3", "B4,Boo,Doo", "A3,A4,A10,A20", "B3,B10"];
		for (const name of found) expect(verdicts[open.findIndex((r) => r.name === name)], name).toBe("open");
	}, 120_000); // 1,215 engine calls: about 5 s on an idle machine, several times that on a busy one
	it("knows a run pruned in the editor for the row it is", async () => {
		const plan = planOf(readFileSync(join(EXAMPLES, "91-study-stars.board"), "utf8"));
		const row = plan.list!.find((r) => r.name === "A12p30,A12p60")!;
		const b = parse(text(row)).board;
		const report = await balance(text(row));
		const { alive } = report;
		const keys = vertexKeys(b);
		const mine = { ...searchShape(b), alive: aliveKeys(b, report) };
		const as = searchShape;
		const dead = keys.flatMap((_, i) => (alive.includes(i + 1) ? [] : [i]));
		expect(dead.length).toBeGreaterThan(0);
		const pruned = { ...b, vertices: b.vertices.filter((_, i) => !dead.includes(i)) };
		expect(sameSearch(mine, as(b))).toBe(true);
		expect(sameSearch(mine, as(pruned))).toBe(true);
		// a live line missing: a different search
		expect(sameSearch(mine, as({ ...b, vertices: b.vertices.filter((_, i) => i !== alive[0] - 1) }))).toBe(false);
		// a line the row lacks: a different search
		expect(sameSearch(mine, as({ ...b, vertices: [...b.vertices, { word: ["A12p90", "A12d90", "A4", "A4"] }] }))).toBe(false);
		// another row's requirements: a different search
		const other = parse(text(plan.list!.find((r) => r.name === "A12p30")!)).board;
		expect(sameSearch(mine, as(other))).toBe(false);
		expect(searchKey(b)).not.toBe(searchKey(pruned));
		// the star required by its vertices (filter A12p30 OR A12d30, select all, Require) on the pruned board:
		// the same requirement, as the star's corners are its own
		const byVertices = (bb: typeof b, star: string) => ({
			...bb,
			require: [
				{
					set: bb.vertices.flatMap((v, i) =>
						v.word.some((c) => c === `A12p${star}` || c === `A12d${star}`) ? [i + 1] : [],
					),
				},
				...bb.require.filter((r) => !r.faces?.[0]?.includes(`A12p${star}`)),
			],
		});
		expect(sameSearch(mine, as(byVertices(pruned, "30")))).toBe(true);
		// one line short of that set is another requirement, unless the missing line is dead
		const set = byVertices(pruned, "30").require[0].set;
		const short = { ...byVertices(pruned, "30"), require: [{ set: set.slice(1) }, ...byVertices(pruned, "30").require.slice(1)] };
		expect(sameSearch(mine, as(short))).toBe(false);
		// the same board with Permutations off: each set of corners spelled out as its orders
		expect(sameSearch(mine, as(withPermutations(b, false)!))).toBe(true);
		const spelled = withPermutations(pruned, false)!;
		expect(sameSearch(mine, as(spelled))).toBe(true);
		// an order the balance check leaves alive, dropped from the spelled board: another search
		const live = spelled.vertices.findIndex((v) => mine.alive.has(cyclicKey(v.word)));
		expect(live).toBeGreaterThanOrEqual(0);
		expect(sameSearch(mine, as(removeVertices(spelled, [live])))).toBe(false);
	});
	it("finds the 2-uniform [3.4.6.4; 4.6.12] on the hybrid study's n = 6 row", () => {
		const t = text(planOf(readFileSync(join(EXAMPLES, "92-study-hybrid.board"), "utf8")).list![0]);
		const dir = mkdtempSync(join(tmp, "row-"));
		writeFileSync(join(dir, "input.board"), t);
		execFileSync(ENGINE, ["input.board", "--threads", "4"], { cwd: dir, stdio: "ignore" });
		const census = readFileSync(join(dir, `solver_${parse(t).board.name}/census.txt`), "utf8");
		// both vertices required (each face is not optional here, but a hybrid needs both): k = 1 has the two
		// Archimedean tilings, k = 2 holds the 2-uniform hybrid among others
		expect(census).toMatch(/k=1 -- 2\nk=2 -- [1-9]/);
	});
});
