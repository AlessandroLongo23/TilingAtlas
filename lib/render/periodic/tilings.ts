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
			// Explicit override > star hue > the regular by-side ramp. The SAME precedence as
			// lib/render/buildCellMesh.ts and drawPolygons, which is what makes the lens agree with the
			// flat views instead of only looking as though it does.
			//
			// ⚑ The override was missing here until 2026-08-05, and it is not a hypothetical: it is the
			// only way a polyomino's pieces are told apart (their boundary side count does not), and it
			// carries the isohedral shelf's three-colouring and the pentagon shelf's per-unit hues. All of
			// them rendered under the lens in one flat colour.
			hue: poly.hue ?? (poly.star ? starHue(poly.n, starApexAngleDeg(poly.vertices)) : polygonFillHue(poly.vertices)),
			// An open prim is a drawn mark: stroked, never filled, and never closed back to its first
			// point. The isohedral shelf's interior markings are the only producer, and this is what keeps
			// them a ⌐ under the lens instead of a filled triangle.
			open: poly.open === true,
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
		feature: featureOf(base.polys),
	};
}

/**
 * The cell's feature size: how big one tile is, in world units.
 *
 * √area per tile, median across the cell — NOT the median segment length, which is what this used to
 * pass and which measures the wrong thing entirely. A curved edge reaches the renderer as a flattened
 * polyline, so the median segment is the FLATTENING resolution, not the tile. On IH73 it fell from 1.00
 * to 0.103 the instant the edge-bulge slider left zero, because one straight edge became ten short ones.
 *
 * Everything the lens does with distance keys off this number: the fill blends to the cell average at
 * `feature × 0.8`, and the stroke tapers out relative to it. So a tenfold error in it moved both by a
 * decade of zoom, and nudging a slider from 0.00 to 0.01 — a change you cannot see in the tile — redrew
 * the whole centre of the inversion. √area is invariant under flattening, which is the property that was
 * missing.
 *
 * `medianEdge` stays as it is: renderTilingToContext sizes thumbnails by it, and that IS an edge-length
 * question.
 */
function featureOf(polys: { vertices: { x: number; y: number }[]; open?: boolean }[]): number {
	const sizes: number[] = [];
	for (const poly of polys) {
		if (poly.open) continue; // a mark has no area, and is not what sets the scale
		const vs = poly.vertices;
		let a = 0;
		for (let i = 0; i < vs.length; i++) {
			const p = vs[i];
			const q = vs[(i + 1) % vs.length];
			a += p.x * q.y - q.x * p.y;
		}
		const area = Math.abs(a) / 2;
		if (area > 0) sizes.push(Math.sqrt(area));
	}
	if (sizes.length === 0) return 1;
	sizes.sort((p, q) => p - q);
	return sizes[sizes.length >> 1] || 1;
}
