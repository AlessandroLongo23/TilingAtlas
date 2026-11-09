// The certificate decoder against the one the atlas ships with (develop_freedraw.py), on a real run.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cyclicKey, emptyBoard, engineText, parse, serialize } from "./board";
import { closingVertices } from "./corners";
import { withFamily } from "./family";
import { regularGrid, withPolyforms } from "./polyform";
import { su11Apply } from "@/lib/render/hyperbolic";
import { buildWalk, walkPoint, WALK_POLYGON } from "@/lib/render/hyperbolicWalk";
import {
	abstractBoard,
	decode,
	faceEdges,
	faceWalk,
	flatCell,
	flatCellWithOverlays,
	flatPattern,
	geometry,
	isColoring,
	hyperbolicDarts,
	missOf,
	vertexWords,
	vertexWordsOf,
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

describe("a tiling whose second period is no longer than its first", () => {
	// The one tiling of the scaled+stars row B4,B12,A12p90 up to k = 20 (2026-11-08). Both periods are 17.7
	// long; the develop sized its walk for a second four times the first, ran out of budget and drew nothing.
	const board = parse(`name B4,B12,A12p90
angle A3 60
angle A4 90
angle A6 120
angle Pi
angle B4 90
angle B12 150
angle A12p90 90
angle A12d90 240
face A3 x 3
face A4 x 4
face A6 x 6
face B4 Pi x 4
face B12 Pi x 12
face A12p90 A12d90 x 12
`).board;
	const cert = `Number of vertices: 21
(A3, A4, A6, A12p90)F, (A3, A3, A12d90)Ab, (A3, A3, A4, A3, A4)Ab, (A3, A4, A6, B4)F, (A3, A3, A4, A3, A4)F, (Pi, A3, A3, A3)Aa, (A6, A12d90)F, (Pi, A3, A6)F, (A3, A4, A6, A12p90)F, (A3, A4, A4, A6)F, (A3, A3, A4, A3, B4)F, (Pi, A3, A3, A3)Aa, (A3, A3, A3, A3, A3, A3)F, (A3, A3, A4, A3, A4)F, (A3, A3, A3, A4, A4)F, (A3, A3, A4, A3, A4)Ab, (A3, A3, A12d90)Ab, (Pi, A3, A3, A3)Aa, (A3, A3, A4, B12)F, (A3, A3, A3, A4, A4)Ac, (Pi, A4, A4)Aa
(A3, A4, A6, A12p90)Fx2, (A6, A12d90)F, (A3, A3, A12d90)Abx2, (Pi, A3, A6)F, (Pi, A4, A4)Aa, (Pi, A3, A3, A3)Aax3, (A3, A3, A4, B12)F, (A3, A4, A4, A6)F, (A3, A4, A6, B4)F, (A3, A3, A3, A4, A4)F, (A3, A3, A3, A4, A4)Ac, (A3, A3, A4, A3, A4)Fx2, (A3, A3, A4, A3, A4)Abx2, (A3, A3, A4, A3, B4)F, (A3, A3, A3, A3, A3, A3)F
[0 0'](1 0'')[2 2'''][3 1@6](1' 1'')[3'' 3@4](0''' 0@5)[1''' 2@4][3''' 0@7][0@4](1@4 2@5)[4@4](0@6 3@8)(1@7 4@10)(2@7 0@9)[0@8 0@16](1@8 0@15)[2@8 3@9](1@9 3@10)[2@9 4@14](0@10 0@11)[1@10 0@12][2@10 2@13](2@11 5@12)(1@12 1@13)(2@12 1@18)[3@12 2@17][4@12](0@13 2@18)(3@13 3@14)(4@13 0@19)[0@14 3@15][1@14](2@14 1@19)(1@15 1@16)(0@17 0@18)[3@18 0@20](4@19 2@20)
1/0(A3) - *0'/1'(A3) - 1''/0''(A3)
2/1(A4) - 0''/*3''(A4) - 3@4/2@4(A4) - *1'''/*2'''(A4)
3/2(A6) - *2'''/*3'''(A6) - 0@7/2@7(A6) - 0@9/3@9(A6) - *2@8/*3@8(A6) - *0@6/*1@6(A6)
0/3(A12p90) - *1@6/*0@6(A12d90) - *3@8/*0@8(A12p90) - 0@16/*0@16(A12d90) - 0@8/3@8(A12p90) - 0@6/1@6(A12d90) - *3/*0(A12p90) - 0'/*0'(A12d90)
*3''/3''(A3) - *3@4/*4@4(A3) - 4@4/3@4(A3)
1'''/0'''(A3) - 0@5/*2@5(A3) - *1@4/*2@4(A3)
0'''/3'''(B4) - *0@7/*1@7(Pi) - *4@10/*0@10(B4) - *0@11/0@11(Pi) - 0@10/4@10(B4) - 1@7/0@7(Pi) - *3'''/*0'''(B4) - *0@5/0@5(Pi)
1@4/0@4(A3) - *0@4/*1@4(A3) - *2@5/2@5(A3)
0@4/4@4(A4) - *4@4/*0@4(A4)
2@7/1@7(A3) - 4@10/3@10(A3) - 1@9/0@9(A3)
1@8/0@8(A3) - *0@16/1@16(A3) - 1@15/0@15(A3)
2@8/1@8(A4) - 0@15/*3@15(A4) - 0@14/4@14(A4) - *2@9/*3@9(A4)
2@9/1@9(A4) - 3@10/2@10(A4) - *2@13/*3@13(A4) - *3@14/*4@14(A4)
1@10/0@10(A3) - 0@11/*2@11(A3) - *5@12/*0@12(A3)
2@10/1@10(A3) - *0@12/*1@12(A3) - *1@13/*2@13(A3)
*2@11/2@11(A3) - 5@12/4@12(A3) - *4@12/*5@12(A3)
2@12/1@12(A3) - 1@13/0@13(A3) - 2@18/1@18(A3)
3@12/2@12(A3) - 1@18/0@18(A3) - 0@17/*2@17(A3)
4@12/3@12(A3) - *2@17/2@17(A3) - *3@12/*4@12(A3)
4@13/3@13(A3) - 3@14/2@14(A3) - 1@19/0@19(A3)
0@13/4@13(A4) - 0@19/4@19(A4) - 2@20/*0@20(A4) - 3@18/2@18(A4)
1@14/0@14(A3) - *3@15/3@15(A3) - *0@14/*1@14(A3)
2@14/1@14(A3) - *1@14/*2@14(A3) - *1@19/1@19(A3)
*0@17/0@17(Pi) - 0@18/3@18(B12) - *0@20/0@20(Pi) - *3@18/*0@18(B12)`;
	it("finds its period inside the budget: 216 faces covering it once", () => {
		const g = geometry(board, vertexWords(cert));
		if (g.kind !== "plane") throw new Error(g.kind);
		const { cell, orbits } = flatCellWithOverlays(decode(cert, board), board, g.turn);
		expect(cell.p!.length).toBe(216);
		expect(orbits.k).toBe(20);
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

describe("faces of set angles in the hyperbolic plane", () => {
	it("closes an equal-sided face at the side its angles fix", () => {
		const a = (2 * Math.PI) / 7;
		// cosh s = cos α / (1 − cos α) for the triangle; the {5,4} pentagon's side from cosh(s/2) = cos(π/5)/sin(π/4)
		expect(faceEdges([a, a, a])[0]).toBeCloseTo(Math.acosh(Math.cos(a) / (1 - Math.cos(a))), 9);
		expect(faceEdges([a, 2 * a, a, 2 * a])[0]).toBeCloseTo(faceEdges([a, a, a])[0], 9);
		expect(faceEdges(Array(5).fill(Math.PI / 2))[0]).toBeCloseTo(edgeOf(5, 4), 9);
		expect(faceEdges(Array(4).fill(Math.PI / 2))).toEqual([]); // a square closes only in the plane
	});

	// Marek, 2026-11-09: {4,5} pentominoes did not draw. Their turns add up to 720°, so the walk closes in the
	// plane too and the miss also falls to nothing as the side shrinks: the deepest sample sat there.
	it("draws every {4,5} pentomino at the {4,5} edge", () => {
		const { board: b } = withPolyforms(emptyBoard(), regularGrid(4, 5), 5);
		const rad = (s: string) => (Number(b.angles.find((x) => x.sym === s)!.value) * Math.PI) / 180;
		for (const f of b.faces)
			expect(faceEdges([...Array(f.repeat as number)].flatMap(() => f.word).map(rad))).toEqual([
				expect.closeTo(edgeOf(4, 5), 9),
			]);
		const g = geometry(b, closingVertices(b, "hyperbolic", 0, 12).words);
		expect(g.kind === "hyperbolic" && g.edge).toBeCloseTo(edgeOf(4, 5), 9);
	});

	it("closes an angle word at each side it can, and draws a board at the side all its faces share", () => {
		// four pentagons of {5,4} round a vertex, or four hexagons of {6,4}: the same corners
		const ring = [...Array(4)].flatMap(() => [90, 90, 90, 180].map((d) => (d * Math.PI) / 180));
		expect(faceEdges(ring).map((s) => +s.toFixed(9))).toEqual([edgeOf(5, 4), edgeOf(6, 4)].map((s) => +s.toFixed(9)));
		const { board: b } = withPolyforms(emptyBoard(), regularGrid(6, 4), 4);
		const g = geometry(b, closingVertices(b, "hyperbolic", 0, 12).words);
		expect(g.kind === "hyperbolic" && g.edge).toBeCloseTo(edgeOf(6, 4), 9);
	});
});

/** The side of {p,q}: cosh(s/2) = cos(π/p) / sin(π/q). */
const edgeOf = (p: number, q: number) => 2 * Math.acosh(Math.cos(Math.PI / p) / Math.sin(Math.PI / q));

// Marek's {3,7} polyiamonds: every vertex adds up to 360° at any edge, the faces close only in the
// hyperbolic plane. It drew nothing (2026-10-31), then drew the rhombi as triangles.
// Marek, 2026-11-09: polyforms of (2,3,7) Schwarz triangles. Their three sides differ, so a drawing off the
// plane walks each at its own typed length; it had only one edge length there and drew nothing.
// AL's 78 {3,7} octiamonds (2026-11-09): their corners reach 308° and no point of most of them sees every side, so
// the disk's wedges about a centre sent points round in circles (tilings in one colour with edges missing, or
// blank), and geometry() re-solved every face's side for every tiling drawn (5.4 s each).
describe("{3,7} octiamonds on the disk", () => {
	const angles = [1, 2, 3, 4, 6].map((i) => `angle F1_${360 * i}_7 ${360 * i}/7`);
	const two = parse(
		[
			...angles,
			"face F1_360_7 F1_1440_7 F1_360_7 F1_1080_7 F1_360_7 F1_2160_7 F1_360_7 F1_720_7 F1_720_7 F1_1080_7",
			"face F1_1080_7 F1_360_7 F1_720_7 F1_1440_7 F1_720_7 x 2",
		].join("\n"),
	).board;
	// run 8-{3,7}, k = 3: a face of the first kind, centred inside, sits beside one read by wedges before
	const cert = [
		"Number of vertices: 6",
		"(F1_360_7, F1_2160_7)F, (F1_360_7, F1_360_7, F1_1080_7, F1_720_7)F, (F1_360_7, F1_720_7, F1_720_7, F1_720_7)F, (F1_1080_7, F1_1440_7)F, (F1_1080_7, F1_1440_7)F, (F1_360_7)C7",
		"(F1_360_7, F1_2160_7)F, (F1_360_7, F1_720_7, F1_720_7, F1_720_7)F, (F1_360_7, F1_360_7, F1_1080_7, F1_720_7)F, (F1_1080_7, F1_1440_7)Fx2, (F1_360_7)C7",
		"[0 2'][1 0''](0' 1''')[1' 0@4](3')[1'' 2''](3'' 0''')(1@4 0@5)",
		"1/0(F1_360_7) - *2'/*3'(F1_1080_7) - *3'/*0'(F1_720_7) - *1'''/*0'''(F1_1440_7) - *3''/*0''(F1_720_7)",
		"0/1(F1_2160_7) - *0''/*1''(F1_360_7) - 2''/1''(F1_720_7) - *2''/*3''(F1_720_7) - *0'''/*1'''(F1_1080_7) - *0'/*1'(F1_360_7) - 0@4/1@4(F1_1440_7) - 0@5/0@5(F1_360_7) - 1@4/0@4(F1_1080_7) - *1'/*2'(F1_360_7)",
	].join("\n");
	it("walks every point into the face that holds it", () => {
		const g = geometry(two, vertexWords(cert));
		if (g.kind !== "hyperbolic") throw new Error(g.kind === "none" ? g.message : g.kind);
		expect(g.edge).toBeCloseTo(1.0905497, 6);
		const t = buildWalk(hyperbolicDarts(decode(cert, two), g, two), g.edge);
		expect(t.verts.map((_, f) => t.data[f * t.width * 4]).every((k) => k === WALK_POLYGON)).toBe(true);
		// the point in the Klein model, where the faces' sides are straight, against the face it was walked into
		const klein = (p: { x: number; y: number }) => ({ x: (2 * p.x) / (1 + p.x ** 2 + p.y ** 2), y: (2 * p.y) / (1 + p.x ** 2 + p.y ** 2) });
		const inside = (vs: { x: number; y: number }[], p: { x: number; y: number }) =>
			vs.slice(0, -1).reduce((c, a, i) => {
				const b = vs[i + 1];
				return a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x ? !c : c;
			}, false);
		for (let i = 0; i < 2000; i++) {
			const [r, th] = [0.9 * Math.sqrt((i * 0.618) % 1), i * 2.39996];
			const res = walkPoint(t, t.dev.face, su11Apply(t.dev.home, { x: r * Math.cos(th), y: r * Math.sin(th) }));
			expect(res.ok).toBe(true);
			expect(inside(t.verts[res.f].map(klein), klein(res.w))).toBe(true);
		}
	});
	it("solves the side of all 78 once a tiling, not once a face", () => {
		const { board: all } = withPolyforms(emptyBoard(), regularGrid(3, 7), 8);
		expect(all.faces).toHaveLength(78);
		const t = performance.now();
		const g = geometry(all, [Array(7).fill(all.angles.find((a) => a.value === "360/7")!.sym)]);
		expect(g.kind === "hyperbolic" && g.edge).toBeCloseTo(1.0905497, 6);
		expect(performance.now() - t).toBeLessThan(500);
	});
});

// Tile orbits (`search faces`, AL 2026-11-09): the engine runs the board with faces and vertices swapped. Against Joseph
// Myers' counts of the polyforms that tile isohedrally (polyomino.org.uk/mathematics/polyform-tiling, its translation,
// 180° and isohedral columns) and of those that need two tile orbits.
describe.skipIf(!existsSync(ENGINE))("searching by tile orbits", () => {
	const faceBoard = (p: number, q: number, n: number, kmax: number) => {
		const { board: b } = withPolyforms(emptyBoard(), regularGrid(p, q), n);
		const vertices = closingVertices(b, "plane", 0, 12).words.map((word) => ({ word }));
		return { ...b, name: "tiles", kmin: 1, kmax, vertices, permutations: true, extra: [{ text: "search faces" }] };
	};
	/** Per k, the tiles that tile alone with that many orbits, each once, up to turning and mirroring. */
	const alone = (board: ReturnType<typeof faceBoard>) => {
		const byK = new Map<number, Set<string>>();
		for (const f of run("tiles", board.kmax, engineText(serialize(board)))) {
			const k = Number(/solver_(\d+)_/.exec(f)![1]);
			for (const c of certificates(f)) {
				// the swapped tiling's vertex types are the tiles
				const tiles = new Set(vertexWords(c).map((w) => cyclicKey(w)));
				if (tiles.size === 1) byK.set(k, new Set([...(byK.get(k) ?? []), ...tiles]));
			}
		}
		return byK;
	};
	it("finds every polyform that tiles isohedrally, and the 9-iamonds that need two orbits", () => {
		expect(alone(faceBoard(4, 4, 6, 1)).get(1)!.size).toBe(35);
		expect(alone(faceBoard(3, 6, 8, 1)).get(1)!.size).toBe(66);
		expect(alone(faceBoard(6, 3, 5, 1)).get(1)!.size).toBe(22);
		const nine = alone(faceBoard(3, 6, 9, 2));
		expect(nine.get(1)!.size).toBe(133);
		expect([...nine.get(2)!].filter((t) => !nine.get(1)!.has(t))).toHaveLength(5);
	});
	it("draws the two {3,7} octiamonds that tile isohedrally, read back as the board's own tiling", () => {
		const board = faceBoard(3, 7, 8, 1);
		const certs = run("tiles", 1, engineText(serialize(board))).flatMap(certificates);
		expect(certs).toHaveLength(2);
		for (const c of certs) {
			const g = geometry(board, vertexWordsOf(c, board));
			if (g.kind !== "hyperbolic") throw new Error(g.kind === "none" ? g.message : g.kind);
			expect(g.edge).toBeCloseTo(1.0905497, 6);
			// one tile, the board's: its faces are the board's (decode checks), and every vertex closes at 360°
			const d = decode(c, board);
			expect(new Set(d.orbit).size).toBeGreaterThan(1);
			buildWalk(hyperbolicDarts(d, g, board), g.edge);
		}
	});
});

describe.skipIf(!existsSync(ENGINE))("a board of (2,3,7) triangles, sides typed by length", () => {
	const tri = withFamily(emptyBoard(), { kind: "schwarz", pqr: [2, 3, 7] }).board;
	const corner = (deg: string) => tri.angles.find((a) => a.value === deg)!.sym;
	const board = {
		...tri,
		name: "tri237",
		kmin: 1,
		kmax: 3,
		vertices: [
			...tri.vertices,
			...[
				["90", 4],
				["60", 6],
				["180/7", 14],
			].map(([d, k]) => ({ word: Array<string>(k as number).fill(corner(d as string)) })),
		],
	};
	it("draws each tiling hyperbolic, every half side at its length", () => {
		const certs = run("tri237", 3, serialize(board)).flatMap(certificates);
		expect(certs.length).toBeGreaterThan(0);
		const halves = tri.angles.flatMap((a) => (a.edge ? [Number(a.edge.length) / 2] : []));
		expect(halves).toHaveLength(3);
		for (const c of certs) {
			const g = geometry(board, vertexWords(c));
			if (g.kind !== "hyperbolic") throw new Error(g.kind === "none" ? g.message : g.kind);
			const darts = hyperbolicDarts(decode(c, board), g, board);
			expect(darts.elen!.every((l) => halves.some((h) => Math.abs(h - l) < 1e-12))).toBe(true);
			// every face, walked with the turns and lengths the disk is given, closes
			const { rneig, glue, alpha, elen } = darts;
			for (let h0 = 0; h0 < rneig.length; h0++) {
				const ring = [h0];
				for (let h = glue[rneig[h0]]; h !== h0; h = glue[rneig[h]]) ring.push(h);
				const steps = ring.map((_, i) => elen![rneig[ring[(i + ring.length - 1) % ring.length]]]);
				const turns = ring.map((h) => alpha![h]);
				expect(missOf(faceWalk(turns, 0, steps).end)).toBeLessThan(1e-6);
			}
			buildWalk(darts, g.edge);
		}
	});
});

describe.skipIf(!existsSync(ENGINE))("a board of {3,7} triangles and rhombi, angles set", () => {
	const text = [
		"name poly37\nk 1 1",
		...[1, 2, 3].map((i) => `angle A${i} ${360 * i}/7`),
		"face A1 x 3\nface A1 A2 x 2",
		"vertex A1 A1 A1 A1 A1 A1 A1\nvertex A1 A1 A1 A2 A2\nvertex A1 A1 A2 A3\nvertex A1 A2 A2 A2\nvertex A2 A2 A3\nvertex A1 A3 A3",
		"permutations yes\n",
	].join("\n");
	const board = parse(text).board;
	it("draws each tiling hyperbolic, its rhombi with four sides", () => {
		const certs = run("poly37", 1, text).flatMap(certificates);
		expect(certs.length).toBeGreaterThan(1);
		for (const c of certs) {
			const g = geometry(board, vertexWords(c));
			if (g.kind !== "hyperbolic") throw new Error(g.kind === "none" ? g.message : g.kind);
			expect(g.edge).toBeCloseTo(1.0905497, 6);
			const darts = hyperbolicDarts(decode(c, board), g, board);
			const words = new Set(vertexWords(c).flat());
			if (words.has("A2")) expect(darts.sizes).toContain(4);
			expect(darts.sizes.every((s) => s === 3 || s === 4)).toBe(true);
			buildWalk(darts, g.edge);
		}
	});
});

// Marek's abstract A³.B board: two apeirogons, no angles; every tiling looked the same (2026-10-31)
describe.skipIf(!existsSync(ENGINE))("abstract mode: apeirogons drawn as the polygons their rings close into", () => {
	const text = "name ab\nk 1 2\nangle Aoo\nangle Boo\nface Aoo x inf\nface Boo x inf\nvertex Aoo Aoo Aoo Boo\npermutations yes\n";
	const board = parse(text).board;
	it("makes each apeirogon a polygon its rings go round a whole number of times, and draws it", () => {
		const certs = run("ab", 2, text).flatMap(certificates);
		expect(certs.length).toBe(64); // 4 at k=1, 60 at k=2
		const kinds = new Set<string>();
		for (const c of certs) {
			const d = decode(c, board);
			const ab = abstractBoard(board, d)!;
			expect(ab.faces.every((f) => typeof f.repeat === "number" && f.repeat >= 3)).toBe(true);
			// every ring of the quotient divides its face's new size
			const seen = new Set<number>();
			for (let h0 = 0; h0 < d.rneig.length; h0++) {
				if (seen.has(h0)) continue;
				const ring: number[] = [];
				for (let h = h0; !seen.has(h); h = d.glue[d.rneig[h]]) seen.add(h), ring.push(h);
				const face = ab.faces.find((f) => f.word[0] === d.corner[ring[0]])!;
				expect((face.repeat as number) % ring.length).toBe(0);
			}
			const g = geometry(ab, vertexWords(c));
			kinds.add(g.kind);
			if (g.kind === "hyperbolic") buildWalk(hyperbolicDarts(d, g, ab), g.edge);
		}
		// small rings close on the sphere (not drawn yet), larger ones in the plane or the hyperbolic plane
		expect([...kinds].sort()).toEqual(["hyperbolic", "none", "plane"]);
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
			// every vertex closes on both boards, and develop_ai1.py ships every tiling: it takes face sizes from
			// the run's board.txt, where hybrid_2_9830's A30 is `face A30 x 24`
			expect(refused).toBe(0);
			expect(ref.length).toBe(mine.size);
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
	it("solves the edge from a vertex that fixes it, past a flat one listed first", () => {
		const board = b("name t\nk 1 1\nangle Pi\nangle A3\nface A3 x 3\nvertex Pi Pi\nvertex A3 A3 A3 A3 A3 A3 A3\n");
		const g = geometry(
			board,
			board.vertices.map((v) => v.word),
		);
		expect(g.kind).toBe("hyperbolic");
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
