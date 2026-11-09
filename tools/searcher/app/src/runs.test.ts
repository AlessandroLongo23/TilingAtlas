// Runs as the app reads them from disk (electron/runs.ts), and the rule that raises a run's k (bridge.ts).
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RunFolder } from "../electron/runs";
import { describeRaise, raiseCeiling, raiseStop, type Run } from "./bridge";
import { earlierOf, withEarlier } from "./runs";

describe("a run folder read from disk", () => {
	it("is finished when census.txt ends in MAX, also with the Windows engine's \\r\\n", () => {
		for (const nl of ["\n", "\r\n"]) {
			const dir = mkdtempSync(join(tmpdir(), "tilesearch-run-"));
			writeFileSync(join(dir, "input.board"), "name sq\nk 1 2\nangle A4 90\nface A4 x 4\nvertex A4 A4 A4 A4\npermutations yes\n");
			mkdirSync(join(dir, "solver_sq"));
			// as tilesearch.exe wrote it under Wine (3 November 2026): every line ends \r\n
			writeFileSync(join(dir, "solver_sq", "census.txt"), ["k=1 -- 1", "k=2 -- 0", "MAX", ""].join(nl));
			const run = RunFolder.open(dir)!;
			expect(run.state).toBe("finished");
			expect(run.counts).toEqual({ 1: 1, 2: 0 });
		}
	});
});

describe("raising k by a rule", () => {
	const facts = { total: 0, seconds: 60, bytes: 1e6, k: 4 };
	it("after a search: stops once it found enough, or at its highest k", () => {
		const rule = { found: 1, minutes: 3, upTo: 10 };
		expect(raiseStop(rule, facts)).toBeNull();
		expect(raiseStop(rule, { ...facts, total: 2 })).toBe("Stopped raising k at 4: it found 2 tilings");
		// time is a ceiling on a search going, not a reason to stop after one that finished
		expect(raiseStop(rule, { ...facts, seconds: 200 })).toBeNull();
		expect(raiseStop({ upTo: 4 }, facts)).toBe("Stopped raising k at 4, the highest it goes to");
		expect(raiseStop({ upTo: 5 }, facts)).toBeNull();
		expect(raiseStop({ upTo: 999 }, { ...facts, k: 254 })).toMatch(/highest/);
	});
	it("while a search goes: its time and disk ceilings", () => {
		const rule = { found: 1, minutes: 1, gigabytes: 2, upTo: 10 };
		expect(raiseCeiling(rule, { seconds: 59, bytes: 1e9 })).toBeNull();
		expect(raiseCeiling(rule, { seconds: 61, bytes: 0 })).toBe("ran over 1 min");
		expect(raiseCeiling(rule, { seconds: 1, bytes: 3 * 2 ** 30 })).toBe("wrote over 2 GB");
		expect(raiseCeiling({ found: 1, upTo: 10 }, { seconds: 1e6, bytes: 1e12 })).toBeNull();
	});
	it("reads in words", () => {
		expect(describeRaise({ found: 1, minutes: 3, upTo: 12 })).toBe(
			"one k at a time up to k = 12, until a search finds at least 1 tiling; a search stops past 3 min",
		);
		expect(describeRaise({ found: 5, minutes: 2, gigabytes: 4, upTo: 9 })).toBe(
			"one k at a time up to k = 9, until a search finds at least 5 tilings; a search stops past 2 min or 4 GB",
		);
		expect(describeRaise({ upTo: 7 })).toBe("one k at a time up to k = 7");
	});
});

describe("a run that replaces another, not finished yet", () => {
	it("shows the earlier run's tilings, every k up to its own, and its own only above that k", () => {
		const file = (path: string, k: number) => ({ name: path, path, k, labels: "", orientable: true, edges: 0, bytes: 1, tilings: 1 });
		const prev = { dir: "/a", state: "finished", kmax: 3, counts: { 1: 1, 2: 0, 3: 4 }, files: [file("/a/1", 1), file("/a/3", 3)], symbols: { X1: "dent" } } as unknown as Run;
		const next = { dir: "/b", replaces: "/a", state: "stopped", counts: { 1: 1, 4: 2 }, files: [file("/b/1", 1), file("/b/4", 4)], symbols: {} } as unknown as Run;
		const seen = withEarlier(next, earlierOf(next, [prev, next]));
		expect([seen.counts, seen.total, seen.files.map((f) => f.path), seen.files[0].symbols]).toEqual([
			{ 1: 1, 2: 0, 3: 4, 4: 2 },
			7,
			["/a/1", "/a/3", "/b/4"],
			{ X1: "dent" },
		]);
		const done = { ...next, state: "finished" } as Run;
		expect(earlierOf(done, [prev, done])).toBeUndefined(); // finished: its own census covers every k
		// the folder they share moved: replaces.txt still names the old path, and the run beside it is found by name
		const moved = { ...next, dir: "/x/b", replaces: "/old/a" } as Run;
		expect(earlierOf(moved, [{ ...prev, dir: "/x/a" } as Run, moved])?.dir).toBe("/x/a");
	});
});
