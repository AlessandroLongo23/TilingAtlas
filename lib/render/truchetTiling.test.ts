import { describe, expect, it } from "vitest";
import { truchetPattern, TRUCHET_BLOCK } from "./truchetTiling";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

/** The square tiling: one unit square per translational cell, basis (1,0) and (0,1). */
const SQUARE_CELL: TranslationalCellData = {
	p: [{ n: 4, v: [[0, 0], [1, 0], [1, 1], [0, 1]] }],
	b: [
		[1, 0],
		[0, 1],
	],
};

/** The triangular tiling: two triangles per cell, basis (1,0) and (1/2, sqrt3/2). */
const TRIANGLE_CELL: TranslationalCellData = {
	p: [
		{ n: 3, v: [[0, 0], [1, 0], [0.5, Math.sqrt(3) / 2]] },
		{ n: 3, v: [[1, 0], [1.5, Math.sqrt(3) / 2], [0.5, Math.sqrt(3) / 2]] },
	],
	b: [
		[1, 0],
		[0.5, Math.sqrt(3) / 2],
	],
};

const isPermutation = (p: readonly number[]) =>
	[...p].sort((a, b) => a - b).every((v, i) => v === i);

describe("a plain tiling read as a Truchet board", () => {
	it("republishes a block of cells as one period", () => {
		const p = truchetPattern(SQUARE_CELL, { seed: 7 })!;
		expect(p.patch).toBeDefined();
		expect(p.patch!.T1).toEqual([TRUCHET_BLOCK, 0]);
		expect(p.patch!.T2).toEqual([0, TRUCHET_BLOCK]);
		// One tile per cell, so the block holds block^2 of them.
		expect(p.patch!.polys).toHaveLength(TRUCHET_BLOCK * TRUCHET_BLOCK);
	});

	it("treats every edge as connected — that is the whole difference from an edge pattern", () => {
		const p = truchetPattern(SQUARE_CELL, { seed: 7 })!;
		expect(p.patch!.edges.every((e) => e[4] === 1)).toBe(true);
	});

	it("welds the corners tiles share, so an edge is listed once and both tiles find it", () => {
		const p = truchetPattern(SQUARE_CELL, { seed: 7 })!;
		const b = TRUCHET_BLOCK;
		// A b x b block of unit squares has (b+1)^2 corners, not 4 per square.
		expect(p.patch!.verts).toHaveLength((b + 1) * (b + 1));
		// And 2b(b+1) edges, not 4 per square.
		expect(p.patch!.edges).toHaveLength(2 * b * (b + 1));
	});

	it("gives every tile a wiring, and each is a genuine permutation of its own edges", () => {
		for (const cell of [SQUARE_CELL, TRIANGLE_CELL]) {
			const p = truchetPattern(cell, { seed: 31 })!;
			const w = p.patch!.wirings!;
			expect(w).toHaveLength(p.patch!.polys.length);
			w.forEach((perm, i) => {
				expect(perm).toHaveLength(p.patch!.polys[i].length);
				expect(isPermutation(perm)).toBe(true);
			});
		}
	});

	it("draws the copies INDEPENDENTLY — the shuffle has to outlive the period", () => {
		// The point of the block. A choice made per tile of the fundamental cell repeats with the period,
		// and on the square tiling that is one drawing on every square in the plane: a wallpaper, not a
		// Truchet pattern. Here the 36 copies must disagree.
		const p = truchetPattern(SQUARE_CELL, { seed: 4242 })!;
		const distinct = new Set(p.patch!.wirings!.map((w) => w.join(",")));
		expect(distinct.size).toBeGreaterThan(4);
	});

	it("is reproducible from its seed, and different seeds differ", () => {
		const key = (s: number) => truchetPattern(SQUARE_CELL, { seed: s })!.patch!.wirings!.join(";");
		expect(key(99)).toBe(key(99));
		expect(key(99)).not.toBe(key(100));
	});

	it("a rule instead of a seed puts the SAME wiring on every tile — the unshuffled comparison", () => {
		const p = truchetPattern(SQUARE_CELL, { seed: 0, rule: { wiring: "ribbons", twist: 0 } })!;
		const distinct = new Set(p.patch!.wirings!.map((w) => w.join(",")));
		expect(distinct.size).toBe(1);
		expect(p.patch!.wirings![0]).toEqual([1, 0, 3, 2]); // ribbons on four edges
	});

	it("returns null where there is nothing to draw", () => {
		expect(truchetPattern(null, { seed: 1 })).toBeNull();
		expect(truchetPattern({ p: [], b: [[1, 0], [0, 1]] }, { seed: 1 })).toBeNull();
	});
});
