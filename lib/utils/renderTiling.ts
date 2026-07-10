// Shared canvas rendering for tilings. Used by thumbnails and screenshot capture.

export interface RawPolygon {
	n: number;
	vertices: { x: number; y: number }[];
	/** star tile ({n|α}: n points, 2n vertices) — colored by the star hue, not the regular ramp. */
	star?: boolean;
}

export interface TranslationalCellData {
	p?: unknown[];
	cellPolygons?: unknown[];
	b?: number[][];
	basis?: number[][];
}

interface CellPolyData {
	v?: (number[] | { x: number; y: number })[];
	vertices?: (number[] | { x: number; y: number })[];
	n?: number;
	star?: boolean;
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

function mapRange(value: number, fromLow: number, fromHigh: number, toLow: number, toHigh: number) {
	return ((value - fromLow) / (fromHigh - fromLow)) * (toHigh - toLow) + toLow;
}

export function polygonHue(n: number) {
	return mapRange(Math.log(n), Math.log(3), Math.log(40), 0, 300);
}

// Star tiles use the original StarPolygon.calculateHue ramp (lib/classes/polygons/StarPolygon.ts):
// by point count n (= vertices.length / 2) over [3,12] → [300,0], plus a 25° offset — a distinct
// violet→red ramp, NOT the regular-polygon log ramp above.
export function starHue(points: number) {
	return mapRange(points, 3, 12, 300, 0) + 300 / 12;
}

export function hsbToHsla(h: number, s: number, b: number, a: number) {
	const sf = s / 100;
	const bf = b / 100;
	const l = bf * (1 - sf / 2);
	const sl = l === 0 || l === 1 ? 0 : (bf - l) / Math.min(l, 1 - l);
	return `hsla(${h.toFixed(1)}, ${(sl * 100).toFixed(1)}%, ${(l * 100).toFixed(1)}%, ${a})`;
}

export function parseBaseCell(cell: TranslationalCellData): BaseCell | null {
	const polyArray = (cell.p ?? cell.cellPolygons ?? []) as CellPolyData[];
	const basisRaw = (cell.b ?? cell.basis ?? [[1, 0], [0, 1]]) as number[][];
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
		polys.push({ n: poly.n ?? verts.length, vertices: verts, star: poly.star === true || ((poly.n ?? verts.length) >= 3 && verts.length === 2 * (poly.n ?? verts.length)) });
	}
	if (polys.length === 0 || edges.length === 0) return null;
	edges.sort((a, b) => a - b);
	const medianEdge = edges[Math.floor(edges.length / 2)] || 1;
	return { polys, basis, minX, maxX, minY, maxY, medianEdge };
}

export function expandToViewport(
	base: BaseCell,
	viewCx: number,
	viewCy: number,
	viewHalfW: number,
	viewHalfH: number,
	maxRadius: number,
): RawPolygon[] {
	const { polys, basis, minX, maxX, minY, maxY } = base;
	const [[v1x, v1y], [v2x, v2y]] = basis;
	const out: RawPolygon[] = [];

	const cellInView = (i: number, j: number) => {
		const ox = i * v1x + j * v2x;
		const oy = i * v1y + j * v2y;
		return (
			maxX + ox >= viewCx - viewHalfW &&
			minX + ox <= viewCx + viewHalfW &&
			maxY + oy >= viewCy - viewHalfH &&
			minY + oy <= viewCy + viewHalfH
		);
	};

	const emit = (i: number, j: number) => {
		const ox = i * v1x + j * v2x;
		const oy = i * v1y + j * v2y;
		for (const poly of polys) {
			out.push({
				n: poly.n,
				star: poly.star,
				vertices: poly.vertices.map((v) => ({ x: v.x + ox, y: v.y + oy })),
			});
		}
	};

	if (cellInView(0, 0)) emit(0, 0);
	for (let r = 1; r <= maxRadius; r++) {
		let added = 0;
		for (let i = -r; i <= r; i++) {
			for (let j = -r; j <= r; j++) {
				if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
				if (cellInView(i, j)) {
					emit(i, j);
					added++;
				}
			}
		}
		if (added === 0) break;
	}
	return out;
}

export function polygonsMedianEdge(polys: RawPolygon[]): number {
	const edges: number[] = [];
	for (const p of polys) {
		for (let i = 0; i < p.vertices.length; i++) {
			const a = p.vertices[i];
			const b = p.vertices[(i + 1) % p.vertices.length];
			edges.push(Math.hypot(b.x - a.x, b.y - a.y));
		}
	}
	if (edges.length === 0) return 1;
	edges.sort((a, b) => a - b);
	return edges[Math.floor(edges.length / 2)] || 1;
}

export function drawPolygons(
	ctx: CanvasRenderingContext2D,
	polygons: RawPolygon[],
	scale: number,
) {
	for (const poly of polygons) {
		ctx.fillStyle = hsbToHsla(poly.star ? starHue(poly.n) : polygonHue(poly.n), 40, 100, 0.9);
		ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
		ctx.lineWidth = 1 / scale;
		ctx.beginPath();
		ctx.moveTo(poly.vertices[0].x, poly.vertices[0].y);
		for (let i = 1; i < poly.vertices.length; i++) {
			ctx.lineTo(poly.vertices[i].x, poly.vertices[i].y);
		}
		ctx.closePath();
		ctx.fill();
		ctx.stroke();
	}
}

export interface RenderTilingOptions {
	translationalCell?: TranslationalCellData | null;
	polygons?: RawPolygon[];
	pxPerEdge: number;
	background?: string;
}

/**
 * Paint a tiling into `ctx` at `pxPerEdge` consistent edge length.
 * The context's transform is expected to already map (0,0) to the top-left in CSS pixels
 * and (W,H) to the bottom-right. Returns true on success.
 */
export function renderTilingToContext(
	ctx: CanvasRenderingContext2D,
	W: number,
	H: number,
	opts: RenderTilingOptions,
): boolean {
	const { background = "#1e1e22", pxPerEdge } = opts;
	ctx.fillStyle = background;
	ctx.fillRect(0, 0, W, H);

	if (opts.translationalCell) {
		const base = parseBaseCell(opts.translationalCell);
		if (!base) return false;
		const cellCx = (base.minX + base.maxX) / 2;
		const cellCy = (base.minY + base.maxY) / 2;
		const cellW = base.maxX - base.minX;
		const cellH = base.maxY - base.minY;
		const scale = pxPerEdge / base.medianEdge;
		const viewHalfW = W / (2 * scale);
		const viewHalfH = H / (2 * scale);
		const margin = Math.hypot(cellW, cellH) * 0.5;
		const polys = expandToViewport(
			base,
			cellCx,
			cellCy,
			viewHalfW + margin,
			viewHalfH + margin,
			200,
		);
		ctx.save();
		ctx.translate(W / 2, H / 2);
		ctx.scale(scale, -scale);
		ctx.translate(-cellCx, -cellCy);
		drawPolygons(ctx, polys, scale);
		ctx.restore();
		return true;
	}

	const polys = opts.polygons;
	if (!polys || polys.length === 0) return false;

	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	for (const p of polys) {
		for (const v of p.vertices) {
			if (v.x < minX) minX = v.x;
			if (v.x > maxX) maxX = v.x;
			if (v.y < minY) minY = v.y;
			if (v.y > maxY) maxY = v.y;
		}
	}
	const edge = polygonsMedianEdge(polys);
	const scale = pxPerEdge / edge;
	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;
	ctx.save();
	ctx.translate(W / 2, H / 2);
	ctx.scale(scale, -scale);
	ctx.translate(-cx, -cy);
	drawPolygons(ctx, polys, scale);
	ctx.restore();
	return true;
}

/** Render to an offscreen canvas at a target size and return a data URL. */
export function renderTilingToDataUrl(
	opts: RenderTilingOptions,
	size = 1024,
	type = "image/png",
): string | null {
	if (typeof document === "undefined") return null;
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	const ok = renderTilingToContext(ctx, size, size, opts);
	if (!ok) return null;
	return canvas.toDataURL(type);
}
