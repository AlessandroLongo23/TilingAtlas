// The Atlas Wall stage: expands the 4.6.12 unit cell (t1003) across a fixed design canvas and
// assigns roles to cells (doors, daily specimen, muted specimens, notation glyphs). Pure — the
// landing server component renders straight from these structures, and the vitest suite pins the
// classification and the determinism. Ported and generalized from the retired
// components/landing-tiling-background.tsx (same ring-expansion with bbox culling).

import type { TranslationalCellData, CellPolygonData } from "@/classes/algorithm/types";

export interface WallPolygon {
	n: number;
	/** Design-canvas px, y down (SVG). */
	vertices: { x: number; y: number }[];
	cx: number;
	cy: number;
	/** Max centroid→vertex distance in px. */
	r: number;
	/** Stable "i,j,idx" cell id. */
	key: string;
}

export interface WallCells {
	dodecagons: WallPolygon[];
	hexagons: WallPolygon[];
	squares: WallPolygon[];
}

interface RawPolygon {
	n: number;
	vertices: { x: number; y: number }[];
}

interface BaseCell {
	polys: RawPolygon[];
	basis: [[number, number], [number, number]];
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
	medianEdge: number;
}

function parseBaseCell(cell: TranslationalCellData): BaseCell | null {
	const polyArray: CellPolygonData[] = cell.p ?? cell.cellPolygons ?? [];
	const basisRaw = cell.b ?? cell.basis ?? [[1, 0], [0, 1]];
	const basis: [[number, number], [number, number]] = [
		[basisRaw[0][0], basisRaw[0][1]],
		[basisRaw[1][0], basisRaw[1][1]],
	];
	const polys: RawPolygon[] = [];
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	const edges: number[] = [];
	for (const poly of polyArray) {
		const raw = poly.v ?? poly.vertices ?? [];
		const verts = raw.map((v) =>
			Array.isArray(v) ? { x: v[0], y: v[1] } : { x: v.x, y: v.y },
		);
		if (verts.length < 3) continue;
		for (const v of verts) {
			if (v.x < minX) minX = v.x;
			if (v.x > maxX) maxX = v.x;
			if (v.y < minY) minY = v.y;
			if (v.y > maxY) maxY = v.y;
		}
		for (let i = 0; i < verts.length; i++) {
			const a = verts[i];
			const b = verts[(i + 1) % verts.length];
			edges.push(Math.hypot(b.x - a.x, b.y - a.y));
		}
		polys.push({ n: poly.n ?? verts.length, vertices: verts });
	}
	if (polys.length === 0 || edges.length === 0) return null;
	edges.sort((a, b) => a - b);
	const medianEdge = edges[Math.floor(edges.length / 2)] || 1;
	return { polys, basis, minX, maxX, minY, maxY, medianEdge };
}

/**
 * Expand `cell` to cover a width×height design canvas at a fixed pixels-per-edge scale.
 * Tiling y grows up; the canvas is SVG (y down), so y is negated in the output.
 */
export function buildWallCells(
	cell: TranslationalCellData,
	width: number,
	height: number,
	pxPerEdge: number,
): WallCells | null {
	const base = parseBaseCell(cell);
	if (!base) return null;

	const scale = pxPerEdge / base.medianEdge;
	const cellCx = (base.minX + base.maxX) / 2;
	const cellCy = (base.minY + base.maxY) / 2;
	// View window in tiling coords, plus one cell diagonal of overscan so edge cells aren't clipped.
	const viewHalfW = width / (2 * scale);
	const viewHalfH = height / (2 * scale);
	const margin = Math.hypot(base.maxX - base.minX, base.maxY - base.minY) * 0.5;
	const [[v1x, v1y], [v2x, v2y]] = base.basis;

	const cellInView = (i: number, j: number) => {
		const ox = i * v1x + j * v2x;
		const oy = i * v1y + j * v2y;
		return (
			base.maxX + ox >= cellCx - viewHalfW - margin &&
			base.minX + ox <= cellCx + viewHalfW + margin &&
			base.maxY + oy >= cellCy - viewHalfH - margin &&
			base.minY + oy <= cellCy + viewHalfH + margin
		);
	};

	const out: WallPolygon[] = [];
	const emit = (i: number, j: number) => {
		const ox = i * v1x + j * v2x;
		const oy = i * v1y + j * v2y;
		base.polys.forEach((poly, idx) => {
			const vertices = poly.vertices.map((v) => ({
				x: (v.x + ox - cellCx) * scale + width / 2,
				y: -(v.y + oy - cellCy) * scale + height / 2,
			}));
			let cx = 0, cy = 0;
			for (const v of vertices) {
				cx += v.x;
				cy += v.y;
			}
			cx /= vertices.length;
			cy /= vertices.length;
			let r = 0;
			for (const v of vertices) r = Math.max(r, Math.hypot(v.x - cx, v.y - cy));
			out.push({ n: poly.n, vertices, cx, cy, r, key: `${i},${j},${idx}` });
		});
	};

	if (cellInView(0, 0)) emit(0, 0);
	for (let rr = 1; rr <= 200; rr++) {
		let added = 0;
		for (let i = -rr; i <= rr; i++) {
			for (let j = -rr; j <= rr; j++) {
				if (Math.max(Math.abs(i), Math.abs(j)) !== rr) continue;
				if (cellInView(i, j)) {
					emit(i, j);
					added++;
				}
			}
		}
		if (added === 0) break;
	}
	if (out.length === 0) return null;

	const cells: WallCells = { dodecagons: [], hexagons: [], squares: [] };
	for (const p of out) {
		if (p.vertices.length >= 10) cells.dodecagons.push(p);
		else if (p.vertices.length >= 5) cells.hexagons.push(p);
		else cells.squares.push(p);
	}
	return cells;
}
