// The tilings class as a PeriodicCell: one ring per tile of the translational cell, filled by the same
// polygon-size hue the flat renderers use and stroked with the shared tile-edge colour. This is the
// adapter that reproduces what the inversive view drew before the IR existed, so any pixel difference
// against the pre-IR build is a bug in the port, not a design change.

import {
	parseBaseCell,
	polygonFillHue,
	starApexAngleDeg,
	starHue,
	type TranslationalCellData,
} from "@/lib/utils/renderTiling";
import type { PeriodicCell } from "../periodicCell";

/** The tile-edge stroke, matching the old shader's `uLine` (theme-independent by design — the fills
 *  carry the theme, the edges stay near-black in both). */
export const TILE_LINE_RGB: [number, number, number] = [0.05, 0.05, 0.07];

export function tilingPeriodicCell(cell: TranslationalCellData | null): PeriodicCell | null {
	if (!cell) return null;
	const base = parseBaseCell(cell);
	if (!base || base.polys.length === 0) return null;

	const [[v1x, v1y], [v2x, v2y]] = base.basis;
	const prims = base.polys.map((poly) => {
		const verts: number[] = [];
		for (const v of poly.vertices) verts.push(v.x, v.y);
		return {
			verts,
			hue: poly.star ? starHue(poly.n, starApexAngleDeg(poly.vertices)) : polygonFillHue(poly.vertices),
			strokeRgb: TILE_LINE_RGB,
			strokeAlpha: 1,
			// Every tile edge paints above every fill, which is what the old shader's "compute minD across
			// all polygons, then blend the line in once at the end" amounted to.
			z: 1,
		};
	});

	return {
		v1: [v1x, v1y],
		v2: [v2x, v2y],
		prims,
		feature: base.medianEdge,
	};
}
