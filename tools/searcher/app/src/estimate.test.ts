// tileestimate (tools/searcher/tileestimate.cpp) against the engine: its exact mode walks the engine's
// tree and must reach every tiling as many times as it says, and a short estimate must land near the truth.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SEARCHER = join(__dirname, "../..");
const ESTIMATOR = join(SEARCHER, process.platform === "win32" ? "tileestimate.exe" : "tileestimate");
const BOARD = join(SEARCHER, "boards/squares_edges.board");
const run = (...args: string[]) => execFileSync(ESTIMATOR, [BOARD, "--k", "1", "3", ...args], { encoding: "utf8" });

describe.skipIf(!existsSync(ESTIMATOR))("tileestimate on squares_edges, k <= 3", () => {
	it("walks the engine's tree: 9,407 complete tilings, 1,420 unique, every multiplicity right", () => {
		const out = run("--exact");
		expect(out).toContain("complete 9407 unique 1420");
		expect(out).toContain("exact multiplicity right for 1420 of 1420 unique tilings");
	});
	it("estimates the unique tilings per k within 10% in two seconds", () => {
		const report = run("--seconds", "2", "--seed", "7").trim().split("\n");
		const last = report.slice(report.lastIndexOf("end") - 3, report.lastIndexOf("end"));
		const unique = Object.fromEntries(last.map((l) => l.split(" ")).map((t) => [t[1], Number(t[6])]));
		for (const [k, truth] of Object.entries({ 1: 13, 2: 153, 3: 1254 }))
			expect(Math.abs(unique[k] / truth - 1)).toBeLessThan(0.1);
	});
});
