// Folding families against the atlas: the star24full palette (regular {3,4,6,8,12,24} and every star on the
// 15° grid) gives 44 and 74 tilings at k = 1 and 2, of which 33 and 54 have a star; folded, the atlas's
// in-ring star shelf has 19 (4 families) and 42 (6 families), Myers' counts less his out-of-ring tilings.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse, serialize, type Board } from "./board";
import { cornerShapes, withFace } from "./corners";
import { certificatesIn, decode, withSymbols } from "./develop";
import { canonical, foldFamilies } from "./families";
import { fittingVertices } from "./figures";

const ENGINE = join(__dirname, "../..", process.platform === "win32" ? "tilesearch.exe" : "tilesearch");

describe("families", () => {
	it("folds star24full to the atlas's counts", async () => {
		let b: Board = { ...parse("name star24full\nk 1 2\nangle X\nface X x 3\nvertex X X X\n").board };
		b = { ...b, angles: [], faces: [], vertices: [] };
		for (const n of [3, 4, 6, 8, 12, 24]) b = withFace(b, { n, seg: 1 });
		for (const n of [3, 4, 6, 8, 12, 24])
			for (let a = 1; a <= 11 - 24 / n; a++) b = withFace(b, { n, seg: 1, point: 15 * a });
		b = { ...b, vertices: fittingVertices(b, 12)!.map((word) => ({ word })), permutations: false };
		const dir = mkdtempSync(join(tmpdir(), "tilesearch-families-"));
		writeFileSync(join(dir, "input.board"), serialize(b));
		execFileSync(ENGINE, ["input.board", "--threads", "8"], { cwd: dir, stdio: "ignore" });
		const out = join(dir, "solver_star24full");
		const board = parse(readFileSync(join(out, "board.txt"), "utf8")).board;
		const symbols = Object.fromEntries(
			readFileSync(join(out, "symbols.txt"), "utf8")
				.trim()
				.split("\n")
				.map((l) => l.split(" ")),
		);
		const shapes = cornerShapes(board);
		const all: { text: string; k: number }[] = [];
		for (const f of readdirSync(out)) {
			const m = /solver_(\d+)_.*\.txt$/.exec(f);
			if (m)
				for (const c of certificatesIn(readFileSync(join(out, f), "utf8")))
					all.push({ text: withSymbols(c, symbols), k: Number(m[1]) });
		}
		expect(all.length).toBe(44 + 74);
		// no two tilings share a canonical form with their own corner names
		expect(new Set(all.map(({ text, k }) => `${k}|${canonical(decode(text, board), (s) => s)}`)).size).toBe(118);
		const stars = all.filter(({ text }) => [...text.matchAll(/[\w.]+/g)].some((m) => shapes.get(m[0])?.kind === "iso"));
		const r = await foldFamilies(board, stars);
		expect([1, 2].map((k) => r.perK.get(k))).toEqual([
			{ tilings: 33, folded: 19, families: 4, flexing: 4 },
			{ tilings: 54, folded: 42, families: 6, flexing: 6 },
		]);
		expect(r.unread + r.pinnedGroups).toBe(0);
	}, 180_000);
});
