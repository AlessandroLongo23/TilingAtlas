import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyseFaces } from "./faces";
import type { FreedrawPattern } from "./pattern";
import { classifyRegular } from "./regular";

const sq = (
	a: number, b: number, d: number, h: number[], v: number[],
): FreedrawPattern => ({ id: "t", k: 1, a, b, d, h, v, orbit: new Array(a * d).fill(0) });

const tri = (
	a: number, b: number, d: number, h: number[], v: number[], w: number[],
): FreedrawPattern => ({
	id: "t", k: 1, a, b, d, h, v, w, grid: "triangle", orbit: new Array(a * d).fill(0),
});

const info = (p: FreedrawPattern) => classifyRegular(p, analyseFaces(p));

describe("classifyRegular — mechanics", () => {
	it("reads the fully dissected square grid as unit squares", () => {
		const r = info(sq(1, 0, 1, [1], [1]));
		expect(r.perFace).toEqual([{ n: 4, side: 1 }]);
		expect(r.allRegular).toBe(true);
		expect(r.allUnit).toBe(true);
	});

	it("reads a 2x2 block tiling as squares of side 2, not as octagons", () => {
		// Horizontal lines on even rows, vertical lines on even columns.
		const r = info(sq(2, 0, 2, [1, 1, 0, 0], [1, 0, 1, 0]));
		expect(r.perFace).toEqual([{ n: 4, side: 2 }]);
		expect(r.allRegular).toBe(true);
		// A dilation of 4^4, not an edge-to-edge tiling by unit regular polygons.
		expect(r.allUnit).toBe(false);
	});

	it("reads the fully dissected triangular grid as unit triangles", () => {
		const r = info(tri(1, 0, 1, [1], [1], [1]));
		expect(r.perFace).toEqual([{ n: 3, side: 1 }, { n: 3, side: 1 }]);
		expect(r.allUnit).toBe(true);
	});

	it("does not call an undrawn plane a polygon", () => {
		const r = info(sq(1, 0, 1, [0], [0]));
		expect(r.perFace).toEqual([null]);
		expect(r.allRegular).toBe(false);
	});

	it("rejects a strip", () => {
		// Horizontal lines on every row: infinite strips, no polygon anywhere.
		const r = info(sq(1, 0, 1, [1], [0]));
		expect(r.allRegular).toBe(false);
		expect(r.kinds.size).toBe(0);
	});
});

const CATALOGUE = "public/freedraw";
const load = (file: string): FreedrawPattern[] | null =>
	existsSync(`${CATALOGUE}/${file}`)
		? (JSON.parse(readFileSync(`${CATALOGUE}/${file}`, "utf8")) as FreedrawPattern[])
		: null;

const allRegular = (ps: FreedrawPattern[]) => ps.filter((p) => info(p).allRegular);
const kindKey = (p: FreedrawPattern) => [...info(p).kinds].sort((x, y) => x - y).join(",");

describe("the combined-grid catalogue", () => {
	const k1 = load("ts-solutions-k1.json");
	const k2 = load("ts-solutions-k2.json");
	const k3 = load("ts-solutions-k3.json");

	it.skipIf(!k1)("finds the four 1-uniform triangle-square tilings at k=1", () => {
		const hits = allRegular(k1 as FreedrawPattern[]);
		expect(hits).toHaveLength(4);
		// 3^6, 4^4, and the two arrangements of 3^3.4^2 / 3^2.4.3.4.
		expect(hits.map(kindKey).sort()).toEqual(["3", "3,4", "3,4", "4"]);
	});

	it.skipIf(!k2)("finds exactly ONE tiling by regular hexagons", () => {
		// The honeycomb is the unique edge-to-edge tiling by regular hexagons, so any count above one
		// means the boundary walk is cancelling drawn edges it should be crossing. It reported seven
		// before the walk keyed on drawn-status.
		const hex = allRegular(k2 as FreedrawPattern[]).filter((p) => kindKey(p) === "6");
		expect(hex).toHaveLength(1);
	});

	it.skipIf(!k2)("treats a tile with slits as no polygon at all", () => {
		const all = k2 as FreedrawPattern[];
		const clean = all.find((p) => p.id === "fdts-2-00648") as FreedrawPattern;
		const slit = all.find((p) => p.id === "fdts-2-00653") as FreedrawPattern;
		// Same underlying grid and the same single 6-cell component; the second has drawn spokes
		// reaching into it, so its boundary is not a simple cycle.
		expect(info(clean).perFace).toEqual([{ n: 6, side: 1 }]);
		expect(info(slit).perFace).toEqual([null]);
	});

	it.skipIf(!k1 || !k2 || !k3)("reproduces the tri-square oracle on the {3,4} slice", () => {
		// A tiling made only of unit triangles and squares needs no dissection, so its grid points ARE
		// its vertices and freedraw k equals classical k. These counts must therefore match the
		// tri-square palette run of the Ctrnact oracle exactly: 4 / 7 / 17.
		const slice = (ps: FreedrawPattern[]) =>
			allRegular(ps).filter((p) => info(p).allUnit && ["3", "4", "3,4"].includes(kindKey(p))).length;
		expect(slice(k1 as FreedrawPattern[])).toBe(4);
		expect(slice(k2 as FreedrawPattern[])).toBe(7);
		expect(slice(k3 as FreedrawPattern[])).toBe(17);
	});

	it.skipIf(!k1 || !k2 || !k3)("has no dodecagon below k=4", () => {
		// A 12-gon dissects into 6 squares + 12 triangles and carries interior grid points, so it
		// cannot surface at these k. The 12 chip is legitimately empty on the shipped catalogue.
		for (const set of [k1, k2, k3] as FreedrawPattern[][]) {
			expect(set.some((p) => info(p).kinds.has(12))).toBe(false);
		}
	});

	// allRegular counts dilations too — a tiling by side-2 squares is a tiling by regular polygons,
	// just not an edge-to-edge one. allUnit is the slice that maps onto the classical k-uniform
	// catalogue, so both are pinned: the gap IS the dilation family.
	it.skipIf(!k2)("counts every tiling by regular polygons at k=2", () => {
		const hits = allRegular(k2 as FreedrawPattern[]);
		expect(hits).toHaveLength(11);
		expect(hits.filter((p) => info(p).allUnit)).toHaveLength(10);
	});

	it.skipIf(!k3)("counts every tiling by regular polygons at k=3", () => {
		const hits = allRegular(k3 as FreedrawPattern[]);
		expect(hits).toHaveLength(27);
		expect(hits.filter((p) => info(p).allUnit)).toHaveLength(22);
	});

	it.skipIf(!k3)("separates dilations from edge-to-edge tilings", () => {
		// The five extras at k=3 each carry at least one tile whose sides span more than one grid edge.
		// Two are pure dilations of 4^4; the other three mix scales — a unit tile beside a bigger one —
		// which is a tiling by regular polygons but NOT edge-to-edge. Neither kind is classically
		// k-uniform, which is why the {3,4} oracle check above filters on allUnit rather than allRegular.
		const dilated = allRegular(k3 as FreedrawPattern[]).filter((p) => !info(p).allUnit);
		expect(dilated).toHaveLength(5);
		for (const p of dilated) {
			expect(info(p).perFace.some((f) => f && f.side > 1)).toBe(true);
		}
		// Mixed-scale tilings are real and present, not a rounding artefact.
		expect(dilated.some((p) => info(p).perFace.some((f) => f && f.side === 1))).toBe(true);
	});
});
