// The certificate decoder against the one the atlas ships with (develop_freedraw.py), on a real run.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "./board";
import { su11Identity } from "@/lib/render/hyperbolic";
import { FALLBACK_BOUND_R, HyperbolicDeveloper, THUMB_BUDGET } from "@/lib/render/hyperbolicDevelopClient";
import { decode, flatPattern, geometry, hyperbolicDarts, vertexWords } from "./develop";

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
		}
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
			const dev = new HyperbolicDeveloper(hyperbolicDarts(decode(c, hybrid), g), g.edge);
			const patch = dev.develop(
				{ id: "t", name: "t", config: "", edge: g.edge },
				su11Identity(),
				FALLBACK_BOUND_R,
				THUMB_BUDGET,
			);
			expect(patch.faces.length).toBeGreaterThan(10);
			expect(new Set(patch.faces.map((f) => f.length)).isSubsetOf(new Set([3, 4, 24]))).toBe(true);
		}
	});
});

describe.skipIf(!existsSync(ENGINE))("123_1_4657, whose faces have sides cut by Pi corners", () => {
	const b = parse(readFileSync(join(SEARCHER, "boards/123_1_4657.board"), "utf8")).board;
	const certs = run("123_1_4657", 2).flatMap(certificates);
	it("develops every k <= 2 tiling in the disk", () => {
		expect(certs.length).toBe(45);
		for (const c of certs) {
			const g = geometry(b, vertexWords(c));
			expect(g.kind).toBe("hyperbolic");
			if (g.kind !== "hyperbolic") continue;
			const dev = new HyperbolicDeveloper(hyperbolicDarts(decode(c, b), g), g.edge);
			// colours mode, which also fills apeirogons: a tiling of apeirogons only has no finite face
			expect(
				dev.developColors({ id: "t", name: "t", config: "", edge: g.edge }, su11Identity(), 0.99, 8000).edges.length,
			).toBeGreaterThan(20);
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
		expect(g.kind === "none" && g.message).toMatch(/give “A3” an angle: “A3” occurs in faces of different shapes/);
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
