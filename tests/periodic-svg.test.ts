import { describe, expect, it } from "vitest";
import {
	inversionMap,
	periodicCellToSvg,
	spiralMapForward,
	type PeriodicSvgOptions,
} from "@/lib/render/periodicSvg";
import type { PeriodicCell } from "@/lib/render/periodicCell";

// lib/render/periodicSvg.ts turns the periodic-cell IR into static SVG, and is what the error and 404
// walls draw with (lib/render/errorSpecimen.ts). What is worth pinning here is not the exact path
// strings — those are a formatting detail — but the four things a wrong answer would be invisible in:
// that the lattice actually tiles the frame, that the paint order and fill rules survive the grouping,
// that the two lenses are the maps they claim to be, and that the culls only remove what they say.

/** A unit square per lattice cell: one prim, area 1, a lattice of 1 × 1. */
const unitSquare = (extra: Partial<PeriodicCell["prims"][number]> = {}): PeriodicCell => ({
	v1: [1, 0],
	v2: [0, 1],
	feature: 1,
	prims: [{ verts: [0, 0, 1, 0, 1, 1, 0, 1], fillRgb: [1, 0, 0], ...extra }],
});

const subpaths = (d: string) => d.split("M").length - 1;

describe("periodicCellToSvg — lattice coverage", () => {
	it("emits one copy per lattice cell meeting the world box, including the ones it clips", () => {
		// The unit square based at (0,0), shifted by integer (di, dj). It meets [-2, 2] when di + 1 ≥ −2
		// and di ≤ 2, so di runs −3…2: six values, 36 copies. The three that only overlap the frame
		// partly are the point — a tiling that emitted only the copies wholly inside would leave a gap
		// all the way round the crop.
		const svg = periodicCellToSvg(unitSquare(), { view: [-2, -2, 4, 4] })!;
		expect(svg.pieces).toBe(36);
		expect(svg.paths).toHaveLength(1);
		expect(subpaths(svg.paths[0].d)).toBe(36);
	});

	it("shares one relative outline across the copies, so a copy costs only its own M", () => {
		const svg = periodicCellToSvg(unitSquare(), { view: [-2, -2, 4, 4] })!;
		// Every copy is a translate, so the same "l …" run appears after each M.
		const runs = svg.paths[0].d.split(/M[-\d.,]+/).filter(Boolean);
		expect(new Set(runs).size).toBe(1);
	});

	it("stops at maxPieces instead of writing out an unbounded picture", () => {
		const svg = periodicCellToSvg(unitSquare(), { view: [-20, -20, 40, 40], maxPieces: 40 })!;
		expect(svg.pieces).toBeLessThanOrEqual(40);
	});

	it("returns null for a degenerate lattice", () => {
		const collapsed: PeriodicCell = { ...unitSquare(), v2: [2, 0] };
		expect(periodicCellToSvg(collapsed, { view: [-2, -2, 4, 4] })).toBeNull();
	});
});

describe("periodicCellToSvg — style and paint order", () => {
	it("defaults fills to even-odd, which is the IR's rule and not SVG's", () => {
		const svg = periodicCellToSvg(unitSquare(), { view: [-1, -1, 2, 2] })!;
		expect(svg.paths[0].fillRule).toBe("evenodd");
	});

	it("gives a nonzero prim one path per copy, so translucent overlaps still stack", () => {
		// The hollow class: faces overlap their own lattice copies on purpose, and one <path> would fill
		// the union flat instead of accumulating the alpha.
		const svg = periodicCellToSvg(unitSquare({ nonzero: true, fillAlpha: 0.3 }), {
			view: [-1, -1, 2, 2],
		})!;
		expect(svg.paths).toHaveLength(svg.pieces);
		expect(svg.paths.every((p) => p.fillRule === undefined)).toBe(true);
		expect(svg.paths[0].fillOpacity).toBe(0.3);
	});

	it("keeps z layers apart while merging same-style prims inside one", () => {
		const cell: PeriodicCell = {
			v1: [1, 0],
			v2: [0, 1],
			feature: 1,
			prims: [
				{ verts: [0, 0, 1, 0, 1, 1, 0, 1], fillRgb: [1, 0, 0], z: 1 },
				{ verts: [0, 0, 0.5, 0, 0.5, 0.5, 0, 0.5], fillRgb: [0, 0, 1], z: 0 },
				{ verts: [0.5, 0.5, 1, 0.5, 1, 1, 0.5, 1], fillRgb: [0, 0, 1], z: 0 },
			],
		};
		const svg = periodicCellToSvg(cell, { view: [0, 0, 1, 1] })!;
		// The two blue prims share a style and a layer, so they share a path; the red one is above them.
		expect(svg.paths).toHaveLength(2);
		expect(svg.paths[0].fill).toBe("#0000ff");
		expect(svg.paths[1].fill).toBe("#ff0000");
	});

	it("drops a prim with neither a fill nor a stroke", () => {
		const cell: PeriodicCell = {
			v1: [1, 0],
			v2: [0, 1],
			feature: 1,
			prims: [{ verts: [0, 0, 1, 0, 1, 1, 0, 1] }],
		};
		expect(periodicCellToSvg(cell, { view: [0, 0, 1, 1] })).toBeNull();
	});

	it("averages the fills by area for the backdrop", () => {
		// Half the cell red, half white: the average is the midpoint, which is what a lens's unreachable
		// centre is painted with.
		const cell: PeriodicCell = {
			v1: [1, 0],
			v2: [0, 1],
			feature: 1,
			prims: [
				{ verts: [0, 0, 0.5, 0, 0.5, 1, 0, 1], fillRgb: [1, 0, 0] },
				{ verts: [0.5, 0, 1, 0, 1, 1, 0.5, 1], fillRgb: [1, 1, 1] },
			],
		};
		expect(periodicCellToSvg(cell, { view: [0, 0, 1, 1] })!.background).toBe("#ff8080");
	});
});

describe("periodicCellToSvg — flipY", () => {
	it("mirrors the picture, and mirrors the lattice with it", () => {
		const cell: PeriodicCell = {
			v1: [1, 0],
			v2: [0.5, 1],
			feature: 1,
			prims: [{ verts: [0, 0, 1, 0, 0, 2], fillRgb: [1, 0, 0] }],
		};
		const view: [number, number, number, number] = [-2, -2, 4, 4];
		const up = periodicCellToSvg(cell, { view })!;
		const down = periodicCellToSvg(cell, { view, flipY: true })!;
		// A mirror is an isometry of the frame, so the same tiles land in it — just reflected.
		expect(down.pieces).toBe(up.pieces);
		expect(down.paths[0].d).not.toBe(up.paths[0].d);
	});
});

const lensOpts = (opts: Partial<PeriodicSvgOptions>): PeriodicSvgOptions => ({
	view: [-2, -2, 4, 4],
	world: [-30, -30, 30, 30],
	samples: 4,
	maxPieces: 3000,
	...opts,
});

describe("the lenses", () => {
	it("circle inversion is an involution, and undefined at its pole", () => {
		const f = inversionMap(2);
		expect(f(0, 0)).toBeNull();
		for (const [x, y] of [[3, 1], [-0.5, 0.25], [0, 7]] as const) {
			const [px, py] = f(x, y)!;
			const [qx, qy] = f(px, py)!;
			expect(qx).toBeCloseTo(x, 9);
			expect(qy).toBeCloseTo(y, 9);
		}
		// A point on the lens circle is fixed; inside and outside swap.
		const [ox, oy] = f(2, 0)!;
		expect(ox).toBeCloseTo(2, 9);
		expect(oy).toBeCloseTo(0, 9);
		expect(Math.hypot(...f(1, 0)!)).toBeCloseTo(4, 9);
	});

	it("the spiral closes on its seam: one turn IS one lattice translation", () => {
		// The whole reason the map is built around a seam. w = exp(world/K) with K = S/(2πi), so shifting
		// the preimage by S multiplies the image by exp(2πi) = 1 — the same point, exactly. Get this
		// wrong and the picture has a visible cut along the branch of the logarithm.
		const seam: [number, number] = [3, 1.5];
		const f = spiralMapForward(seam, 0.5, 1e9);
		for (const [x, y] of [[0.4, -0.2], [-1.1, 2.3], [5, 5]] as const) {
			const a = f(x, y)!;
			const b = f(x + seam[0], y + seam[1])!;
			expect(b[0]).toBeCloseTo(a[0], 6);
			expect(b[1]).toBeCloseTo(a[1], 6);
		}
	});

	it("the spiral's outer radius is a hard bound on the image", () => {
		const f = spiralMapForward([3, 1.5], 0.5, 4);
		let seen = 0;
		for (let x = -40; x <= 40; x += 0.7) {
			for (let y = -40; y <= 40; y += 0.7) {
				const p = f(x, y);
				if (!p) continue;
				seen++;
				expect(Math.hypot(p[0], p[1])).toBeLessThanOrEqual(4 + 1e-9);
			}
		}
		expect(seen).toBeGreaterThan(0);
	});

	it("a degenerate seam yields a map that draws nothing, not a singular one", () => {
		expect(spiralMapForward([0, 0], 1, 10)(1, 1)).toBeNull();
	});
});

describe("periodicCellToSvg — under a map", () => {
	it("culls copies smaller than minSize, and keeps more as the floor drops", () => {
		const coarse = periodicCellToSvg(unitSquare(), lensOpts({ map: inversionMap(2), minSize: 0.4 }))!;
		const fine = periodicCellToSvg(unitSquare(), lensOpts({ map: inversionMap(2), minSize: 0.05 }))!;
		expect(fine.pieces).toBeGreaterThan(coarse.pieces);
	});

	it("subdivides a big copy more than a small one, so only the visible curvature is paid for", () => {
		// `detail` is output units per segment: raise it and every copy needs fewer segments, so the
		// same picture comes out with strictly less path data.
		const dense = periodicCellToSvg(
			unitSquare(),
			lensOpts({ map: inversionMap(2), minSize: 0.1, detail: 0.05 }),
		)!;
		const sparse = periodicCellToSvg(
			unitSquare(),
			lensOpts({ map: inversionMap(2), minSize: 0.1, detail: 2 }),
		)!;
		expect(sparse.pieces).toBe(dense.pieces);
		expect(sparse.paths[0].d.length).toBeLessThan(dense.paths[0].d.length);
	});

	it("scales a stroke with the map in cell space and leaves it alone in output space", () => {
		const cell = unitSquare({ strokeRgb: [0, 0, 0] });
		const inCell = periodicCellToSvg(
			cell,
			lensOpts({ map: inversionMap(2), minSize: 0.1, strokeWidth: 0.05 }),
		)!;
		const inOutput = periodicCellToSvg(
			cell,
			lensOpts({ map: inversionMap(2), minSize: 0.1, strokeWidth: 0.05, strokeSpace: "output" }),
		)!;
		// Cell space: the lens magnifies each copy differently, so the widths spread over several paths.
		expect(new Set(inCell.paths.map((p) => p.strokeWidth)).size).toBeGreaterThan(1);
		// Output space: one width everywhere, which is what the inversive shader's CSS-pixel stroke does.
		expect(new Set(inOutput.paths.map((p) => p.strokeWidth))).toEqual(new Set([0.05]));
	});

	it("returns null when the map is undefined across the whole preimage", () => {
		expect(periodicCellToSvg(unitSquare(), lensOpts({ map: () => null }))).toBeNull();
	});
});
