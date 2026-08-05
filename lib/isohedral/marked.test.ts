/**
 * The twelve marked types, checked against Grünbaum and Shephard's Table 1 rather than against
 * themselves.
 *
 * Every number in `MARKED` came off a scan of the 1977 paper, and a transcribed table is exactly the
 * kind of thing this project does not trust. So nothing here re-reads the constants and confirms they
 * equal themselves. Each test recomputes a table column FROM the constructed geometry — the induced
 * tile group order from which cosets fix the prototile, the aspect count from how many distinct tiles a
 * cell holds, the wallpaper group from where the rotation centres sit relative to the mirrors — and
 * fails if the construction and the table disagree.
 *
 * The identity |S'/T| = |I(T)| × aspects ties columns (3) and (8) together and holds for all twelve. It
 * is the cheapest test here and the one that earned its keep: it rejected four subgroup choices that
 * looked right on paper.
 */

import { describe, expect, it } from "vitest";
import { MARKED_TYPES } from "./catalogue";
import {
	MARKED,
	MARKED_IH,
	buildMarkedCell,
	classifyWallpaper,
	markedGroup,
	mapPoly,
	markDistance,
	pathInside,
	polyKey,
	tiledArea,
	type MarkedType,
	type Poly,
} from "./marked";

const SQ3 = Math.sqrt(3);

/** A patch of the base net, big enough that every image of the prototile lands inside it. */
function netPatch(type: MarkedType, param: number): Poly[] {
	const out: Poly[] = [];
	const R = 4;

	const push = (poly: Poly) => out.push(poly);
	const shift = (poly: Poly, dx: number, dy: number) =>
		poly.map((p) => ({ x: p.x + dx, y: p.y + dy }));

	if (type.net === "triangular") {
		const up: Poly = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: SQ3 / 2 }];
		const down: Poly = [{ x: 1, y: 0 }, { x: 1.5, y: SQ3 / 2 }, { x: 0.5, y: SQ3 / 2 }];
		for (let i = -R; i <= R; ++i)
			for (let j = -R; j <= R; ++j) {
				const dx = i + j * 0.5;
				const dy = (j * SQ3) / 2;
				push(shift(up, dx, dy));
				push(shift(down, dx, dy));
			}
		return out;
	}

	if (type.net === "hexagonal" || type.net === "rhombille") {
		const hex: Poly = Array.from({ length: 6 }, (_, k) => ({
			x: Math.cos((k * Math.PI) / 3),
			y: Math.sin((k * Math.PI) / 3),
		}));
		for (let i = -R; i <= R; ++i)
			for (let j = -R; j <= R; ++j) {
				const dx = i * 1.5;
				const dy = (i * SQ3) / 2 + j * SQ3;
				if (type.net === "hexagonal") {
					push(shift(hex, dx, dy));
				} else {
					for (const k of [0, 2, 4]) {
						push(
							shift(
								[{ x: 0, y: 0 }, hex[k], hex[(k + 1) % 6], hex[(k + 2) % 6]],
								dx,
								dy,
							),
						);
					}
				}
			}
		return out;
	}

	if (type.net === "rectangular" || type.net === "square") {
		const h = type.net === "square" ? 1 : param;
		const cell: Poly = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 1, y: h },
			{ x: 0, y: h },
		];
		for (let i = -R; i <= R; ++i) for (let j = -R; j <= R; ++j) push(shift(cell, i, j * h));
		return out;
	}

	// tetrakis: the unit square cut by both diagonals.
	const quarters: Poly[] = [
		[{ x: 0.5, y: 0.5 }, { x: 0, y: 0 }, { x: 1, y: 0 }],
		[{ x: 0.5, y: 0.5 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
		[{ x: 0.5, y: 0.5 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
		[{ x: 0.5, y: 0.5 }, { x: 0, y: 1 }, { x: 0, y: 0 }],
	];
	for (let i = -R; i <= R; ++i)
		for (let j = -R; j <= R; ++j) for (const qd of quarters) push(shift(qd, i, j));
	return out;
}

describe("the twelve marked isohedral types", () => {
	it("covers exactly the twelve the catalogue flags, in the same order", () => {
		expect([...MARKED_IH]).toEqual([...MARKED_TYPES]);
	});

	for (const type of MARKED) {
		describe(`IH${type.ih} (${type.laves}, ${type.tileGroup}, ${type.wallpaper})`, () => {
			const param = type.param?.def ?? 0;
			const group = markedGroup(type, param);

			it("satisfies |S'/T| = |I(T)| x aspects, G&S Table 1 columns (3) and (8)", () => {
				expect(group.cosets.length).toBe(type.tileGroupOrder * type.aspects);
			});

			it("has translation lattice exactly T: one coset is the identity", () => {
				const trivial = group.cosets.filter(
					(m) =>
						Math.abs(m[0] - 1) < 1e-9 &&
						Math.abs(m[1]) < 1e-9 &&
						Math.abs(m[3]) < 1e-9 &&
						Math.abs(m[4] - 1) < 1e-9 &&
						Math.abs(m[2]) < 1e-9 &&
						Math.abs(m[5]) < 1e-9,
				);
				expect(trivial.length).toBe(1);
			});

			it(`induces tile group of order ${type.tileGroupOrder}, column (3)`, () => {
				expect(group.stabilizer.length).toBe(type.tileGroupOrder);
			});

			it(`has ${type.aspects} aspects, column (8)`, () => {
				expect(group.tiles.length).toBe(type.aspects);
			});

			it("tiles the lattice cell exactly, with no overlap and no gap", () => {
				const { t1, t2 } = group.lattice;
				const det = Math.abs(t1.x * t2.y - t1.y * t2.x);
				expect(tiledArea(group.tiles)).toBeCloseTo(det, 9);
			});

			it("maps the prototile onto tiles of the base net", () => {
				const net = new Set(netPatch(type, param).map(polyKey));
				for (const g of group.cosets) {
					expect(net.has(polyKey(mapPoly(g, group.tile)))).toBe(true);
				}
			});

			it("places one distinct mark per coset, so the seed is in general position", () => {
				// The load-bearing claim of the whole construction. Distinct cosets placing distinct glyphs
				// is what makes the marked tiling's symmetry group EXACTLY S' and not something larger that
				// happened to preserve a coincidentally symmetric mark set.
				const keys = new Set(group.glyphs.map((g) => g.paths.map(polyKey).join("/")));
				expect(keys.size).toBe(group.cosets.length);
			});

			it(`is ${type.wallpaper}, column (5), recomputed from the geometry`, () => {
				expect(classifyWallpaper(group.lattice, group.cosets)).toBe(type.wallpaper);
			});

			it(`gives each tile ${type.tileGroupOrder} mark(s)`, () => {
				expect(group.glyphs.length / group.tiles.length).toBe(type.tileGroupOrder);
			});

			it("keeps every mark inside its own tile, and the rosette's copies apart", () => {
				// The two things hand-picked seed coordinates got wrong: marks that straddled a tile
				// boundary (IH35) and a D1 pair that fused into one blob (IH92). `placeSeed` derives the
				// size by bisection so both hold; this is the guard on any future SeedPlan override.
				const seed = group.glyphs[0].paths;
				for (const path of seed) expect(pathInside(path, group.tile)).toBe(true);
				const rosette = group.stabilizer.map((g) => seed.map((path) => mapPoly(g, path)));
				const spine = seed[0];
				const arm = Math.hypot(spine[1].x - spine[0].x, spine[1].y - spine[0].y);
				for (let i = 0; i < rosette.length; ++i) {
					for (let j = i + 1; j < rosette.length; ++j) {
						// A clear GAP, not merely no crossing: the marks are strokes with width on screen.
						expect(markDistance(rosette[i], rosette[j])).toBeGreaterThan(0.1 * arm);
					}
				}
			});

			it("lays every mark along an edge of the tile it sits in", () => {
				// AL's second note: the marks should run parallel to the tile's edges, not at an arbitrary
				// angle. The seed is laid along one edge and the tile group carries it to the others, so
				// every mark's long arm should match SOME edge direction of its own tile.
				const dirs = group.tile.map((p, i) => {
					const r = group.tile[(i + 1) % group.tile.length];
					return Math.atan2(r.y - p.y, r.x - p.x);
				});
				const spine = group.glyphs[0].paths[0];
				const arm = Math.atan2(spine[1].y - spine[0].y, spine[1].x - spine[0].x);
				const gap = dirs.map((d) => Math.abs(((arm - d + Math.PI) % Math.PI) - 0) % Math.PI);
				expect(Math.min(...gap.map((g) => Math.min(g, Math.PI - g)))).toBeLessThan(1e-6);
			});

			it("puts every mark inside a tile the same cell draws", () => {
				// Not the same as "inside its own tile". The cell is what reaches the GPU, and its polygons
				// are painted in order with no depth test, so a mark whose tile is not in this cell gets
				// covered by whichever instance does carry that tile — fill gone, stroke left behind. Every
				// IH89 rosette had one such mark before the cell was anchored per tile.
				for (const g of group.glyphs) {
					for (const path of g.paths) {
						expect(group.tiles.some((t) => pathInside(path, t))).toBe(true);
					}
				}
			});

			it("builds a drawable cell", () => {
				const cell = buildMarkedCell(type.ih, param);
				expect(cell).not.toBeNull();
				// One ring per tile, then one open path per stroke of every mark.
				const strokesPerMark = group.glyphs[0].paths.length;
				expect(cell!.polygons.length).toBe(
					type.aspects + strokesPerMark * type.tileGroupOrder * type.aspects,
				);
				expect(cell!.stabilizerOrder).toBe(type.tileGroupOrder);
				expect(cell!.period).toBeGreaterThan(0);
			});
		});
	}

	it("distinguishes the three types whose tile group is trivial", () => {
		// IH48, IH80 and IH87 are the only ones that take a single mark — the only three where an
		// asymmetric motif filling the whole tile, a colour wheel included, is the right decoration.
		const trivial = MARKED.filter((t) => t.tileGroupOrder === 1).map((t) => t.ih);
		expect(trivial).toEqual([48, 80, 87]);
	});
});
