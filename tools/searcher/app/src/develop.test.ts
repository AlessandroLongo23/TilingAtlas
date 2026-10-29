// The certificate decoder against the one the atlas ships with (develop_freedraw.py), on a real run.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "./board";
import { buildWalk } from "@/lib/render/hyperbolicWalk";
import {
	decode,
	flatCell,
	flatCellWithOverlays,
	flatPattern,
	geometry,
	isColoring,
	hyperbolicDarts,
	vertexWords,
} from "./develop";

const SEARCHER = join(__dirname, "../..");
const ENGINE = join(SEARCHER, process.platform === "win32" ? "tilesearch.exe" : "tilesearch");
const ORACLE = join(SEARCHER, "../ctrnact-oracle");
const board = parse(readFileSync(join(SEARCHER, "boards/squares_edges.board"), "utf8")).board;

/** An example board (or the board `text`) run up to `kmax` in a fresh folder; its certificate files. */
function run(name: string, kmax: number, text?: string): string[] {
	const dir = mkdtempSync(join(tmpdir(), "tilesearch-develop-"));
	writeFileSync(join(dir, "input.board"), text ?? readFileSync(join(SEARCHER, `boards/${name}.board`)));
	execFileSync(ENGINE, ["input.board", "--k", "1", String(kmax), "--threads", "4"], { cwd: dir, stdio: "ignore" });
	const out = join(dir, `solver_${name}`);
	return readdirSync(out)
		.filter((f) => /solver_\d+_.*\.txt$/.test(f))
		.map((f) => join(out, f));
}

const GROUP_K1: Record<string, string> = {
	"A3.A3.A3.A3.A3.A3": "p6m",
	"A4.A4.A4.A4": "p4m",
	"A6.A6.A6": "p6m",
	"A3.A3.A3.A3.A6": "p6",
	"A3.A3.A3.A4.A4": "cmm",
	"A3.A3.A4.A3.A4": "p4g",
	"A3.A4.A6.A4": "p6m",
	"A3.A6.A3.A6": "p6m",
	"A3.A12.A12": "p6m",
	"A4.A6.A12": "p6m",
};

const certificates = (f: string) =>
	readFileSync(f, "utf8")
		.split("---")
		.filter((c) => c.trim());

const PY = `
import json, sys
sys.path.insert(0, sys.argv[1])
import develop_freedraw as fd
out = []
for path in sys.argv[2:]:
    for cert in fd.parse_file(path):
        combos = [[]]
        for t in cert["types"]:
            combos = [c + [v] for c in combos for v in fd.vtable_variants(t["figure"], t["tag"], "square")]
        ok = []
        for tables in combos:
            try:
                b = fd.Block(cert, tables, "square")
                fd.develop(b)
                ok.append({"rneig": b.rneig, "glue": b.glue, "tile": b.tile})
            except fd.DevelopError:
                pass
        out.append(ok)
print(json.dumps(out))
`;

describe.skipIf(!existsSync(ENGINE))("certificates of a real run", () => {
	const files = run("squares_edges", 2);
	const certs = files.flatMap(certificates);

	it("finds 166 tilings", () => expect(certs.length).toBe(166));

	it("decodes to the darts develop_freedraw.py develops", () => {
		const py = JSON.parse(
			execFileSync("python3", ["-c", PY, ORACLE, ...files], { encoding: "utf8", maxBuffer: 1 << 26 }),
		);
		expect(py.length).toBe(certs.length);
		certs.forEach((c, i) => {
			const d = decode(c, board);
			expect(
				py[i].map((o: { rneig: number[]; glue: number[]; tile: string[] }) =>
					JSON.stringify([o.rneig, o.glue, o.tile]),
				),
			).toContain(JSON.stringify([d.rneig, d.glue, d.corner]));
		});
	});

	it("finds a period of every one in the plane, cut into unit squares", () => {
		for (const c of certs) {
			const g = geometry(board, vertexWords(c));
			expect(g.kind).toBe("plane");
			if (g.kind !== "plane") continue;
			const { patch } = flatPattern(decode(c, board), board, g.turn, "t");
			expect(patch!.polys.length).toBeGreaterThan(0);
			expect(patch!.polys.every((ring) => ring.length === 4)).toBe(true);
			expect(Math.abs(patch!.T1[0] * patch!.T2[1] - patch!.T1[1] * patch!.T2[0])).toBeCloseTo(patch!.polys.length, 6);
			expect(patch!.edges.some((e) => e[4] === 1)).toBe(c.includes("A2"));
		}
	});
});

describe.skipIf(!existsSync(ENGINE))("the k-uniform tilings by triangles, squares, hexagons and dodecagons", () => {
	const text = `name regular
k 1 2
angle A3 60
angle A4 90
angle A6 120
angle A12 150
face A3 x 3
face A4 x 4
face A6 x 6
face A12 x 12
${["A3 A3 A3 A3 A3 A3", "A3 A3 A3 A3 A6", "A3 A3 A3 A4 A4", "A3 A3 A6 A6", "A3 A4 A4 A6", "A3 A3 A4 A12", "A3 A12 A12", "A4 A4 A4 A4", "A4 A6 A12", "A6 A6 A6"].map((v) => `vertex ${v}`).join("\n")}
permutations yes
`;
	const regular = parse(text).board;
	const certs = run("regular", 2, text).flatMap(certificates);
	it("finds a period of every one, faces of several shapes covering it once", () => {
		expect(certs.length).toBe(30); // A068599 without the octagon: 10 at k = 1, 20 at k = 2
		for (const c of certs) {
			const g = geometry(regular, vertexWords(c));
			if (g.kind !== "plane") throw new Error(g.kind === "none" ? g.message : g.kind);
			const { patch } = flatPattern(decode(c, regular), regular, g.turn, "t");
			expect(new Set(patch!.polys.map((r) => r.length)).isSubsetOf(new Set([3, 4, 6, 12]))).toBe(true);
			// a tiling, not a colouring: the cell leaves the hue to the side-count palette
			const { cell, orbits, symmetry } = flatCellWithOverlays(decode(c, regular), regular, g.turn);
			expect(cell.p!.every((q) => q.hue === undefined)).toBe(true);
			// every corner of the cell is a vertex with its orbit, and every orbit of the certificate shows
			const seen = new Set(cell.p!.flatMap((q) => (q.v as number[][]).map(([x, y]) => orbits.orbitAt(x, y))));
			expect(seen.has(-1)).toBe(false);
			expect(seen.size).toBe(orbits.k);
			// the wallpaper group, exactly, of each 1-uniform tiling (G&S Tilings and Patterns §2.1)
			const words = vertexWords(c).map((w) => w.join("."));
			if (words.length === 1) expect(symmetry!()?.group).toBe(GROUP_K1[words[0]]);
		}
	});
});

describe.skipIf(!existsSync(ENGINE))("a colouring: squares labelled A and B", () => {
	const text = "name chess\nk 1 1\nangle A4 90\nangle B4 90\nface A4 x 4\nface B4 x 4\nvertex A4 B4 A4 B4\n";
	const board = parse(text).board;
	it("fills the two labels with two colours of the colourings palette", () => {
		expect(isColoring(board)).toBe(true);
		const certs = run("chess", 1, text).flatMap(certificates);
		expect(certs.length).toBeGreaterThan(0);
		for (const c of certs) {
			const g = geometry(board, vertexWords(c));
			if (g.kind !== "plane") throw new Error(g.kind);
			const cell = flatCell(decode(c, board), board, g.turn);
			expect(new Set(cell.p!.map((q) => q.hue)).size).toBe(2);
		}
	});
});

// The site's own hyperbolic developer runs from the main checkout: its generated tables are not in git.
const MAIN_ORACLE = join(
	execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim(),
	"../tools/ctrnact-oracle",
);
const DEVELOPER = existsSync(join(MAIN_ORACLE, "tables/hyperbolic/tables.py"));

describe.skipIf(!existsSync(ENGINE) || !DEVELOPER)("darts as the atlas's develop_ai1.py ships them", () => {
	// a dart table as text: topology, unit edges, turns, and each dart's face size (not its index)
	const key = (
		d: { rneig: number[]; glue: number[]; lvert: number[]; alpha?: number[]; faceColor?: number[] },
		sizes: number[],
	) =>
		JSON.stringify([
			d.rneig,
			d.glue,
			d.lvert,
			d.alpha?.map((a) => a.toFixed(9)) ?? null,
			d.faceColor?.map((i) => sizes[i]) ?? null,
		]);
	for (const [name, flag] of [
		["1247_1_0612", ["--multi", "1247_1_0612"]],
		["hybrid_2_9830", ["--hybrid", "2_9830"]],
	] as const)
		it(`matches it on ${name} at k = 1`, () => {
			const files = run(name, 1);
			const board = parse(readFileSync(join(SEARCHER, `boards/${name}.board`), "utf8")).board;
			const out = mkdtempSync(join(tmpdir(), "develop-ai1-"));
			execFileSync("python3", ["develop_ai1.py", join(files[0], ".."), ...flag, "--out", join(out, "r")], {
				cwd: MAIN_ORACLE,
				stdio: "ignore",
			});
			const ref = JSON.parse(readFileSync(join(out, "r-k1.json"), "utf8")) as {
				darts: Parameters<typeof key>[0];
				stats: { sizes: number[] };
			}[];
			let refused = 0;
			const mine = new Set(
				files.flatMap(certificates).flatMap((c) => {
					const g = geometry(board, vertexWords(c));
					if (g.kind !== "hyperbolic") throw new Error(g.kind === "none" ? g.message : g.kind);
					try {
						const d = hyperbolicDarts(decode(c, board), g);
						return [key(d, d.sizes)];
					} catch {
						refused++;
						return [];
					}
				}),
			);
			expect(ref.length).toBeGreaterThan(0);
			// every vertex closes on both boards. develop_ai1.py ships fewer hybrid tilings than there are (1,010
			// of 1,094 at k = 1): it reads Marek's label A30 as a 30-gon, where the board's face is a 24-gon
			// (`face A30 x 24`), so every tiling with that face fails its closure check
			expect(refused).toBe(0);
			for (const r of ref) expect(mine.has(key(r.darts, r.stats.sizes))).toBe(true);
		});
});

describe.skipIf(!existsSync(ENGINE))("hybrid_2_9830 in the hyperbolic disk", () => {
	const hybrid = parse(readFileSync(join(SEARCHER, "boards/hybrid_2_9830.board"), "utf8")).board;
	const certs = run("hybrid_2_9830", 1).flatMap(certificates).slice(0, 60); // of 1,094
	it("develops k = 1 tilings into triangles, squares and 24-gons", () => {
		expect(certs.length).toBeGreaterThan(0);
		for (const c of certs) {
			const g = geometry(hybrid, vertexWords(c));
			expect(g.kind).toBe("hyperbolic");
			if (g.kind !== "hyperbolic") continue;
			// the walk the disk canvas draws from: one table row per face of the quotient
			const walk = buildWalk(hyperbolicDarts(decode(c, hybrid), g), g.edge, { allDrawn: true });
			expect(walk.verts.length).toBeGreaterThan(0);
			expect(new Set(walk.verts.map((f) => f.length - 1)).isSubsetOf(new Set([3, 4, 24]))).toBe(true); // a ring repeats its first vertex
		}
	});
});

describe.skipIf(!existsSync(ENGINE))("123_1_4657, whose faces have sides cut by Pi corners", () => {
	const b = parse(readFileSync(join(SEARCHER, "boards/123_1_4657.board"), "utf8")).board;
	// k counts only vertices of three or more corners, so the Pi points along the sides are free: k <= 1 has
	// 274 tilings, and k <= 2 has 488,624, too many to develop here
	const certs = run("123_1_4657", 1).flatMap(certificates);
	it("develops every k = 1 tiling in the disk", () => {
		expect(certs.length).toBe(274);
		for (const c of certs) {
			const g = geometry(b, vertexWords(c));
			expect(g.kind).toBe("hyperbolic");
			if (g.kind !== "hyperbolic") continue;
			// the walk the disk canvas draws from, apeirogons included
			const walk = buildWalk(hyperbolicDarts(decode(c, b), g), g.edge, { allDrawn: true });
			expect(walk.verts.length).toBeGreaterThan(0);
		}
	});
});

describe("geometry from the board", () => {
	const b = (text: string) => parse(text).board;
	it("solves the edge of {7,3} with regular faces", () => {
		const g = geometry(b("name t\nk 1 1\nangle A7\nface A7 x 7\nvertex A7 A7 A7\n"), [["A7", "A7", "A7"]]);
		expect(g.kind).toBe("hyperbolic");
		// cosh(l/2) = cos(π/p) / sin(π/q)
		if (g.kind === "hyperbolic")
			expect(Math.cosh(g.edge / 2)).toBeCloseTo(Math.cos(Math.PI / 7) / Math.sin(Math.PI / 3), 9);
	});
	it("names the corners that need an angle, and why", () => {
		const g = geometry(b("name t\nk 1 1\nangle A3\nangle Q\nface A3 x 3\nface A3 Q A3 Q\nvertex A3 Q A3 Q\n"), [
			["A3", "Q", "A3", "Q"],
		]);
		expect(g.kind === "none" && g.message).toMatch(
			/give “A3” and “Q” an angle: “A3” occurs in faces of different shapes; “Q” is in a face whose corners differ/,
		);
	});
	it("draws hybrid_2_9830 hyperbolic, at the edge length its name gives", () => {
		const board = parse(readFileSync(join(SEARCHER, "boards/hybrid_2_9830.board"), "utf8")).board;
		const g = geometry(
			board,
			board.vertices.map((v) => v.word),
		);
		expect(g.kind === "hyperbolic" && g.edge).toBeCloseTo(2.983, 3);
	});
	it("refuses vertices that close at different edge lengths", () => {
		const board = b(
			"name t\nk 1 1\nangle A3\nangle A4\nface A3 x 3\nface A4 x 4\nvertex A3 A3 A3 A3 A3 A3 A3\nvertex A4 A4 A4 A4 A4\n",
		);
		const g = geometry(
			board,
			board.vertices.map((v) => v.word),
		);
		expect(g.kind === "none" && g.message).toMatch(/different edge lengths/);
	});
	it("sends the sphere away for now", () => {
		const g = geometry(b("name t\nk 1 1\nangle A5\nface A5 x 5\nvertex A5 A5 A5\n"), [["A5", "A5", "A5"]]);
		expect(g.kind === "none" && /sphere/.test(g.message)).toBe(true);
	});
});
