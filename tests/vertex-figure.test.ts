// The deck names vertex configurations itself rather than trusting the name in the alphabet file, so
// the check that matters is against the literature: the regular palette's fifteen figures are exactly
// the fifteen vertex configurations of regular polygons, and every one has a settled name.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PaletteConfigs } from "@/lib/configs/vertexConfigs";
import { canonicalWord, figureFromPlacedPolys, figureFromWord } from "@/lib/render/vertexFigure";
import type { RawPolygon } from "@/lib/utils/renderTiling";

const palette = JSON.parse(
	readFileSync(path.join(process.cwd(), "public", "vertex-configs", "regular-z24.json"), "utf8"),
) as PaletteConfigs;

const asPolys = (cfg: PaletteConfigs["configs"][number]): RawPolygon[] =>
	cfg.polys.map((p) => ({ n: p.n, vertices: p.verts.map(([x, y]) => ({ x, y })) }));

/** Grünbaum & Shephard, Tilings and Patterns §2.1: the vertex configurations of regular polygons.
 *  Eleven of these extend to a uniform tiling; 3.3.4.12, 3.4.3.12, 3.3.6.6 and 3.4.4.6 do not on
 *  their own, which is why the alphabet is bigger than the catalogue. */
const KNOWN = [
	"3.3.3.3.3.3", "3.3.3.3.6", "3.3.3.4.4", "3.3.4.3.4", "3.3.4.12", "3.3.6.6", "3.4.3.12",
	"3.4.4.6", "3.4.6.4", "3.6.3.6", "3.12.12", "4.4.4.4", "4.6.12", "4.8.8", "6.6.6",
];

describe("figureFromPlacedPolys", () => {
	it("names the regular alphabet exactly as the literature does", () => {
		const got = palette.configs.map((c) => figureFromPlacedPolys(asPolys(c))?.word ?? "(failed)");
		expect([...got].sort()).toEqual([...KNOWN].sort());
	});

	it("returns the tiles in cyclic order around the vertex", () => {
		const cfg = palette.configs.find((c) => figureFromPlacedPolys(asPolys(c))?.word === "3.4.6.4")!;
		const fig = figureFromPlacedPolys(asPolys(cfg))!;
		// Read straight off, with no rotation, the cyclic order is a rotation of the canonical word.
		const ns = fig.polys.map((p) => p.n);
		const rotations = ns.map((_, i) => [...ns.slice(i), ...ns.slice(0, i)].join("."));
		expect(rotations).toContain("3.4.6.4");
		// And their interior angles close the full turn: 60 + 90 + 120 + 90.
		const interior = ns.reduce((sum, n) => sum + ((n - 2) * 180) / n, 0);
		expect(interior).toBeCloseTo(360, 9);
	});

	it("rejects tiles that do not meet at the origin", () => {
		const cfg = palette.configs[0];
		const moved = asPolys(cfg).map((p) => ({ ...p, vertices: p.vertices.map((v) => ({ x: v.x + 5, y: v.y })) }));
		expect(figureFromPlacedPolys(moved)).toBeNull();
	});
});

/** The 21 distinct cyclic arrangements of regular polygons whose angles close 360 degrees. Fifteen of
 *  them appear in some tiling; the six using a polygon outside {3,4,6,8,12} appear in none. */
const ALL_21 = [
	"3.3.3.3.3.3", "3.3.3.3.6", "3.3.3.4.4", "3.3.4.3.4", "3.3.4.12", "3.3.6.6", "3.4.3.12",
	"3.4.4.6", "3.4.6.4", "3.6.3.6", "3.12.12", "4.4.4.4", "4.6.12", "4.8.8", "6.6.6",
	"3.7.42", "3.8.24", "3.9.18", "3.10.15", "4.5.20", "5.5.10",
];

describe("figureFromWord", () => {
	it("draws every one of the 21 arrangements, closing the turn exactly", () => {
		for (const word of ALL_21) {
			const polys = figureFromWord(word);
			expect(polys, word).not.toBeNull();
			// Reading the drawing back gives the name it was drawn from.
			expect(figureFromPlacedPolys(polys!)?.word, word).toBe(word);
			// Every tile is a unit-edge regular polygon with a corner on the vertex.
			for (const p of polys!) {
				expect(p.vertices).toHaveLength(p.n);
				expect(Math.hypot(p.vertices[0].x, p.vertices[0].y)).toBeCloseTo(0, 12);
				for (let i = 0; i < p.n; i++) {
					const a = p.vertices[i];
					const b = p.vertices[(i + 1) % p.n];
					expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(1, 9);
				}
			}
		}
	});

	it("agrees with the shipped alphabet on the fifteen it also holds", () => {
		for (const cfg of palette.configs) {
			const theirs = figureFromPlacedPolys(asPolys(cfg))!;
			const mine = figureFromWord(theirs.word)!;
			// Same tiles, same total area. The cyclic ORDER of the arrays need not agree: both are the
			// same cycle, but each starts wherever its own construction happened to start.
			const sorted = (ns: number[]) => [...ns].sort((a, b) => a - b);
			expect(sorted(mine.map((p) => p.n))).toEqual(sorted(theirs.polys.map((p) => p.n)));
			expect(figureFromPlacedPolys(mine)!.word).toBe(theirs.word);
		}
	});

	it("refuses a name whose angles do not close", () => {
		expect(figureFromWord("3.4.5")).toBeNull(); // 60 + 90 + 108 = 258
		expect(figureFromWord("4.4.4.4.4")).toBeNull(); // 450
		expect(figureFromWord("6.6")).toBeNull(); // too few tiles to surround a point
	});
});

describe("canonicalWord", () => {
	it("does not care where the walk starts or which way it goes", () => {
		expect(canonicalWord([3, 4, 6, 4])).toBe("3.4.6.4");
		expect(canonicalWord([6, 4, 3, 4])).toBe("3.4.6.4");
		expect(canonicalWord([4, 6, 4, 3])).toBe("3.4.6.4");
		// Reversal is a different cycle only when the figure is chiral; 3.3.4.3.4 reads the same.
		expect(canonicalWord([4, 3, 4, 3, 3])).toBe("3.3.4.3.4");
	});

	it("keeps configurations with the same tiles but different order apart", () => {
		// Same multiset {3,3,4,12}, genuinely different vertices.
		expect(canonicalWord([3, 3, 4, 12])).toBe("3.3.4.12");
		expect(canonicalWord([3, 4, 3, 12])).toBe("3.4.3.12");
	});
});
