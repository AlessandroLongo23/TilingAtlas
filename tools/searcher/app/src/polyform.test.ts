import { describe, expect, it } from "vitest";
import { cyclicKey, emptyBoard } from "./board";
import { seedWords, setFacesGeometry } from "./corners";
import { Grid, polyforms, regularGrid, withPolyforms, type GridSpec } from "./polyform";

const counts = (spec: GridSpec, upTo: number, mirror = true) =>
	Array.from({ length: upTo }, (_, i) => polyforms(spec, i + 1, mirror)).map((f) => [
		f.length,
		f.filter((x) => x.simple).length,
	]);

describe("Polyforms against OEIS", () => {
	it("polyominoes: A000105, without holes A000104, one-sided A000988", () => {
		const free = counts(regularGrid(4, 4), 9);
		expect(free.map((c) => c[0])).toEqual([1, 1, 2, 5, 12, 35, 108, 369, 1285]);
		expect(free.map((c) => c[1])).toEqual([1, 1, 2, 5, 12, 35, 107, 363, 1248]);
		expect(counts(regularGrid(4, 4), 8, false).map((c) => c[0])).toEqual([1, 1, 2, 7, 18, 60, 196, 704]);
	});
	it("polyiamonds: A000577, without holes A070765", () => {
		const c = counts(regularGrid(3, 6), 9);
		expect(c.map((x) => x[0])).toEqual([1, 1, 1, 3, 4, 12, 24, 66, 160]);
		expect(c.map((x) => x[1])).toEqual([1, 1, 1, 3, 4, 12, 24, 66, 159]);
	});
	it("polyhexes: A000228, without holes A018190", () => {
		const c = counts(regularGrid(6, 3), 7);
		expect(c.map((x) => x[0])).toEqual([1, 1, 3, 7, 22, 82, 333]);
		expect(c.map((x) => x[1])).toEqual([1, 1, 3, 7, 22, 81, 331]);
	});
});

// No published counts for these grids, so each class count is checked against a brute-force count of the cell
// sets holding one fixed cell: every class of n cells with s symmetries holds it in n·|stabiliser|/s ways.
function rooted(spec: GridSpec, n: number): number {
	const g = new Grid(spec);
	let level = new Map([[String(g.cell(0)), [g.cell(0)]]]);
	for (let s = 1; s < n; s++) {
		const next = new Map<string, number[]>();
		for (const cells of level.values())
			for (const c of cells)
				for (const d of g.neighbours(c))
					if (!cells.includes(d)) {
						const k = [...cells, d].sort((a, b) => a - b);
						next.set(k.join(","), k);
					}
		level = next;
	}
	return level.size;
}

describe("Polyforms on hyperbolic, spherical and Schwarz grids", () => {
	const grids: [string, GridSpec, number][] = [
		["{4,5}", regularGrid(4, 5), 8],
		["{7,3}", regularGrid(7, 3), 14],
		["{3,5}", regularGrid(3, 5), 6],
		["(2,3,7) triangles", { m: [2, 3, 7], cell: [] }, 1],
		["(6,6,7) triangles", { m: [2, 3, 7], cell: [0] }, 2],
	];
	for (const [name, spec, stab] of grids)
		it(`${name}: classes add up to the cell sets round one cell`, () => {
			// one-sided on bare triangles is left out: no rotation takes a triangle to its mirror image, so a
			// class does not hold the fixed cell n·|stabiliser|/s ways
			for (const mirror of stab === 1 ? [true] : [true, false])
				for (let n = 1; n <= 5; n++) {
					const fixed = mirror ? stab : stab / 2;
					const sum = polyforms(spec, n, mirror).reduce((a, f) => a + (n * fixed) / f.symmetries, 0);
					expect(sum).toBeCloseTo(rooted(spec, n), 9);
				}
		});

	it("angles obey Gauss–Bonnet: Σ(180° − α) = 360° + n · the cell's area", () => {
		for (const [p, q] of [
			[4, 5],
			[7, 3],
			[3, 5],
			[4, 4],
		]) {
			const n = 5;
			const area = (p - 2) * 180 - (p * 360) / q;
			for (const f of polyforms(regularGrid(p, q), n).filter((x) => x.simple)) {
				const turn = f.corners.reduce((a, c) => a + 180 - c.num / c.den, 0);
				expect(turn).toBeCloseTo(360 + n * area, 9);
				expect(new Set(f.sides.map((s) => s.toFixed(9))).size).toBe(1);
			}
		}
	});

	it("on the icosahedron a disk's complement is a disk: n and 20 − n cells agree", () => {
		const disks = (n: number) => polyforms(regularGrid(3, 5), n).filter((f) => f.simple).length;
		expect(disks(9)).toBe(disks(11));
	});
});

describe("Polyforms as faces", () => {
	it("adds the 12 pentominoes with shared corners, and leaves out the heptomino with a hole", () => {
		const { board, added } = withPolyforms(emptyBoard(), regularGrid(4, 4), 5);
		expect(added).toBe(12);
		expect(board.angles.map((a) => `${a.sym}=${a.value ?? ""}`).sort()).toEqual(["F1_270=270", "F1_90=90", "Pi="]);
		const I = board.faces.find((f) => f.word.filter((c) => c === "Pi").length * (f.repeat as number) === 8)!;
		const full = [...Array(I.repeat as number)].flatMap(() => I.word);
		expect(cyclicKey(full)).toBe(
			cyclicKey(["F1_90", "Pi", "Pi", "Pi", "Pi", "F1_90", "F1_90", "Pi", "Pi", "Pi", "Pi", "F1_90"]),
		);
		expect(withPolyforms(emptyBoard(), regularGrid(4, 4), 7)).toMatchObject({ added: 107, holes: 1 });
	});

	// Marek, 2026-11-09: off the plane a polyform's shape is alien enough that its cells' sides help to read it
	it("draws each polyform in its own geometry, with the sides its cells share", () => {
		for (const [p, q] of [
			[4, 4],
			[4, 5],
			[7, 3],
			[4, 3],
		]) {
			const { added, pictures } = withPolyforms(emptyBoard(), regularGrid(p, q), 2);
			expect(pictures).toHaveLength(added);
			const [{ outline, lines }] = pictures;
			// a domino: 2p − 2 sides, each two half sides of 8 points off the plane, and its middle side in two halves
			expect(outline).toHaveLength((2 * p - 2) * 2 * (p === 4 && q === 4 ? 1 : 8));
			expect(lines).toHaveLength(2);
			const on = (a: { x: number; y: number }) => outline.some((b) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-9);
			expect(lines.every((l) => on(l[0]) || on(l[l.length - 1]))).toBe(true);
			if (q === 5 || p === 7) expect(Math.max(...outline.map((a) => Math.hypot(a.x, a.y)))).toBeLessThan(1);
		}
		expect(withPolyforms(emptyBoard(), regularGrid(4, 4), 7).pictures).toHaveLength(107);
	});

	// Marek, 2026-11-09: polyforms of a Schwarz triangle, (2,3,7) the one he made beautiful patterns with
	it("adds Schwarz triangle polyforms, each side typed by its length", () => {
		const { board, added, pictures } = withPolyforms(emptyBoard(), { m: [2, 3, 7], cell: [] }, 2);
		expect(added).toBe(3);
		// a domino of triangles: four sides, the one they share drawn inside
		expect(pictures.map((p) => p.lines.length)).toEqual([1, 1, 1]);
		const types = board.angles.filter((a) => a.edge).map((a) => a.sym);
		expect(types.sort()).toEqual(["E237_2", "E237_3", "E237_7"]);
		expect(board.vertices.map((v) => v.word.join(" ")).sort()).toEqual(types.map((t) => `${t} ${t}`));
		for (const f of board.faces) expect(f.word.filter((c) => types.includes(c))).toHaveLength(4);
		// glued along its right-angle side, the 90° corners make a straight angle
		expect(board.faces.some((f) => f.word.includes("Pi"))).toBe(true);
	});

	// Marek's 5-cell (2,3,7) polyforms froze Quick setup: 15 corners, every word to 14 tried for an edge that no
	// set angle can fix
	it("looks for no edge to solve on a board whose corners all keep their angles", () => {
		const { board } = withPolyforms(emptyBoard(), { m: [2, 3, 7], cell: [] }, 5);
		const t = performance.now();
		expect(seedWords(board, "hyperbolic", 14)).toEqual([]);
		expect(performance.now() - t).toBeLessThan(100);
	});

	it("says where faces of set angles lie: their corners against a plane polygon's", () => {
		const where = (p: number, q: number) => setFacesGeometry(withPolyforms(emptyBoard(), regularGrid(p, q), 3).board);
		expect([where(4, 4), where(4, 5), where(4, 3)]).toEqual(["plane", "hyperbolic", "sphere"]);
	});

	it("names hyperbolic corners by their angle: {4,5} cells have 72° corners", () => {
		const { board } = withPolyforms(emptyBoard(), regularGrid(4, 5), 3);
		expect(
			board.angles
				.map((a) => a.value)
				.filter(Boolean)
				.sort(),
		).toEqual(["144", "216", "72"]);
	});
});
