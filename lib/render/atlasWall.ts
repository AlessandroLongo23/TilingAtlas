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

export interface WallDoorSpec {
	id: string;
	href: string;
	label: string;
	sublabel?: string;
}

export interface WallPlan {
	doors: { spec: WallDoorSpec; cell: WallPolygon }[];
	reserved: { spec: WallDoorSpec; cell: WallPolygon }[];
	/** Hexagon for the specimen of the day (full color at rest). */
	daily: WallPolygon;
	/** Other fully-visible hexagons, muted renders. */
	specimens: WallPolygon[];
	/** ~1 in 20 squares carries a vertex-configuration glyph linking into /theory. */
	glyphs: { cell: WallPolygon; text: string }[];
}

export interface WallPlanOptions {
	width: number;
	height: number;
	seed: number;
	doorSpecs: WallDoorSpec[];
	reservedSpecs: WallDoorSpec[];
	/** Canvas-fraction anchors, one per door then per reserved door, in order. */
	anchors: { x: number; y: number }[];
	/** Masthead rect in canvas fractions — door centroids must stay out of it. */
	exclude: { x: number; y: number; w: number; h: number };
	glyphTexts: string[];
}

// Deterministic PRNG so a (cells, opts) pair always yields the same wall. The daily seed comes
// from the UTC date upstream; per-request variety is the caller's choice of seed.
function mulberry32(seed: number) {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function planWall(cells: WallCells, opts: WallPlanOptions): WallPlan {
	const { width, height, exclude } = opts;
	const rand = mulberry32(opts.seed);

	const fullyInside = (p: WallPolygon) =>
		p.cx - p.r >= 0 && p.cx + p.r <= width && p.cy - p.r >= 0 && p.cy + p.r <= height;
	const inExclude = (p: WallPolygon) =>
		p.cx >= exclude.x * width &&
		p.cx <= (exclude.x + exclude.w) * width &&
		p.cy >= exclude.y * height &&
		p.cy <= (exclude.y + exclude.h) * height;

	// Doors: greedily take the unused eligible dodecagon nearest each anchor.
	const eligible = cells.dodecagons.filter((p) => fullyInside(p) && !inExclude(p));
	const used = new Set<string>();
	const specs = [...opts.doorSpecs, ...opts.reservedSpecs];
	const picks: { spec: WallDoorSpec; cell: WallPolygon }[] = [];
	specs.forEach((spec, i) => {
		const anchor = opts.anchors[i] ?? { x: 0.5, y: 0.5 };
		const ax = anchor.x * width;
		const ay = anchor.y * height;
		let best: WallPolygon | null = null;
		let bestD = Infinity;
		for (const p of eligible) {
			if (used.has(p.key)) continue;
			const d = Math.hypot(p.cx - ax, p.cy - ay);
			if (d < bestD) {
				bestD = d;
				best = p;
			}
		}
		if (best) {
			used.add(best.key);
			picks.push({ spec, cell: best });
		}
	});
	const doors = picks.slice(0, opts.doorSpecs.length);
	const reserved = picks.slice(opts.doorSpecs.length);

	// Hexagons touching a door stay quiet so door labels breathe; the rest are specimens.
	const nearDoor = (p: WallPolygon) =>
		picks.some((d) => Math.hypot(p.cx - d.cell.cx, p.cy - d.cell.cy) < d.cell.r + p.r * 0.4);
	const hexes = cells.hexagons.filter((p) => fullyInside(p) && !nearDoor(p));
	const dailyTarget = { x: 0.62 * width, y: 0.55 * height };
	let daily = hexes[0];
	let dailyD = Infinity;
	for (const p of hexes) {
		const d = Math.hypot(p.cx - dailyTarget.x, p.cy - dailyTarget.y);
		if (d < dailyD) {
			dailyD = d;
			daily = p;
		}
	}
	const specimens = hexes.filter((p) => p.key !== daily.key);

	// Glyphs: every ~20th fully-visible square by PRNG order, cycling the provided texts.
	const sqs = cells.squares.filter((p) => fullyInside(p) && !inExclude(p) && !nearDoor(p));
	const shuffled = [...sqs];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	const glyphCount = Math.max(1, Math.floor(sqs.length / 20));
	const glyphs = shuffled.slice(0, glyphCount).map((cell, i) => ({
		cell,
		text: opts.glyphTexts[i % Math.max(1, opts.glyphTexts.length)] ?? "",
	}));

	return { doors, reserved, daily, specimens, glyphs };
}
