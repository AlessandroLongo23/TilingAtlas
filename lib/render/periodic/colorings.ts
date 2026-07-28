// Colorings as a PeriodicCell: one ring per grid cell, filled with its palette colour. In this class
// every grid edge is a real tile boundary, so the cell outlines ARE the grid — no separate stroke pass.
//
// World convention follows lib/colors/render.ts exactly, with y negated: the 2D canvas maps a grid point
// to screen through py(y) = −(by·y), while the lens works in the p5 world where y already runs down. Get
// that sign wrong and the coloring renders mirrored against its own thumbnail.

import { coset } from "@/lib/freedraw/pattern";
import { colorCountOf, colorsGridOf, type ColorPattern } from "@/lib/colors/pattern";
import { paletteRgb255, type ColorChoice } from "@/lib/colors/render";
import type { PeriodicCell, PeriodicPrim } from "../periodicCell";

const SQRT3_2 = Math.sqrt(3) / 2;

/** Tile-boundary stroke, matching `edgeStroke` in lib/colors/render.ts: black at low alpha, stronger in
 *  the dark theme. Translucent on purpose — the colour field carries the picture, not the grid. */
const edgeAlpha = (dark: boolean) => (dark ? 0.45 : 0.28);

export interface ColorsCellOptions {
	dark: boolean;
	palette?: readonly ColorChoice[];
	/** The sidebar's "Tile edges" toggle (configuration.colorsEdges). */
	edges: boolean;
}

export function colorsPeriodicCell(p: ColorPattern, opts: ColorsCellOptions): PeriodicCell | null {
	const rgb = paletteRgb255(colorCountOf(p), opts.palette, opts.dark).map(
		([r, g, b]) => [r / 255, g / 255, b / 255] as [number, number, number],
	);
	const stroke = opts.edges
		? { strokeRgb: [0, 0, 0] as [number, number, number], strokeAlpha: edgeAlpha(opts.dark) }
		: {};

	return p.patch ? patchCell(p, rgb, stroke) : gridCell(p, rgb, stroke);
}

type StrokeSpec = Pick<PeriodicPrim, "strokeRgb" | "strokeAlpha">;

/** Square and triangle grids: the colours are a per-coset bitmask, the geometry implicit in the grid. */
function gridCell(
	p: ColorPattern, rgb: [number, number, number][], stroke: StrokeSpec,
): PeriodicCell | null {
	const tri = colorsGridOf(p) === "triangle";
	const bx = tri ? 0.5 : 0;
	const by = tri ? SQRT3_2 : 1;
	// Grid point (x, y) in the p5 world (y down, hence the negated second component).
	const wx = (x: number, y: number) => x + bx * y;
	const wy = (y: number) => -by * y;

	const prims: PeriodicPrim[] = [];
	for (let y = 0; y < p.d; y++) {
		for (let x = 0; x < p.a; x++) {
			const c = coset(p, x, y);
			if (tri) {
				// Two triangles per lattice cell — the lib/freedraw cellFace layout: 2c up, 2c+1 down.
				prims.push({
					verts: [wx(x, y), wy(y), wx(x + 1, y), wy(y), wx(x, y + 1), wy(y + 1)],
					fillRgb: rgb[p.cells[2 * c]] ?? rgb[0],
					...stroke,
				});
				prims.push({
					verts: [wx(x + 1, y), wy(y), wx(x, y + 1), wy(y + 1), wx(x + 1, y + 1), wy(y + 1)],
					fillRgb: rgb[p.cells[2 * c + 1]] ?? rgb[0],
					...stroke,
				});
			} else {
				prims.push({
					verts: [wx(x, y), wy(y), wx(x + 1, y), wy(y), wx(x + 1, y + 1), wy(y + 1), wx(x, y + 1), wy(y + 1)],
					fillRgb: rgb[p.cells[c]] ?? rgb[0],
					...stroke,
				});
			}
		}
	}
	if (prims.length === 0) return null;

	// Period lattice: the HNF generators (a, 0) and (b, d), taken into the world through the same map.
	return {
		v1: [wx(p.a, 0), wy(0)],
		v2: [wx(p.b, p.d), wy(p.d)],
		prims,
		feature: 1, // every grid edge is one unit long on both fixed grids
	};
}

/** Combined ("ts") and hexagonal ("hex") grids: explicit per-period geometry, one ring per face. */
function patchCell(
	p: ColorPattern, rgb: [number, number, number][], stroke: StrokeSpec,
): PeriodicCell | null {
	const patch = p.patch!;
	const [t1x, t1y] = patch.T1;
	const [t2x, t2y] = patch.T2;

	const prims: PeriodicPrim[] = [];
	const edgeLens: number[] = [];
	for (let pi = 0; pi < patch.polys.length; pi++) {
		const ring = patch.polys[pi];
		const verts: number[] = [];
		for (const [vi, ox, oy] of ring) {
			const v = patch.verts[vi];
			verts.push(v[0] + ox * t1x + oy * t2x, -(v[1] + ox * t1y + oy * t2y));
		}
		if (verts.length < 6) continue;
		for (let i = 0; i < verts.length; i += 2) {
			const j = (i + 2) % verts.length;
			edgeLens.push(Math.hypot(verts[j] - verts[i], verts[j + 1] - verts[i + 1]));
		}
		prims.push({ verts, fillRgb: rgb[patch.polyColor[pi]] ?? rgb[0], ...stroke });
	}
	if (prims.length === 0) return null;

	edgeLens.sort((a, b) => a - b);
	return {
		v1: [t1x, -t1y],
		v2: [t2x, -t2y],
		prims,
		feature: edgeLens[edgeLens.length >> 1] || 1,
	};
}
