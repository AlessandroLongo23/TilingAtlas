// Shared canvas rendering for tilings. Used by thumbnails and screenshot capture.

export interface RawPolygon {
	n: number;
	vertices: { x: number; y: number }[];
	/** star tile ({n|α}: n points, 2n vertices) — colored by the star hue, not the regular ramp. */
	star?: boolean;
	/** Explicit fill hue (degrees), overriding both the star and by-side-count ramps. Used by polyominoes,
	 *  whose boundary side count doesn't distinguish the pieces — a per-piece identity hue does. */
	hue?: number;
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
	hue?: number;
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
	return mapRange(Math.log(n), Math.log(3), Math.log(30), 0, 360);
}

// An irregular tile shares its side count with a regular polygon — a rhombus is a quadrilateral like the
// square, a skewed hexagon has six sides like the regular one — so the by-side-count ramp above paints
// the two identically. Separate them by drifting the hue DOWN the wheel (toward red) in proportion to how
// far the outline is from regular. The drift is continuous and vanishes at regularity, which is the point:
// the parametric families flex their tiles through the regular shape (the play-page α slider takes the
// 4α rhombus to an exact square at α=90°), and a tile whose shape converges on the square must have its
// colour converge on the square's. A hard regular/irregular branch made that a ~170° hue snap.
//
// The span is deliberately small. The regular ramp is log-spaced and crowded (3→0°, 4→45°, 5→80°, 6→108°,
// 8→153°, 12→217°: only 35° from square to pentagon), so a bigger drift would walk an irregular tile
// straight onto another regular polygon's colour. Cost of the small span: a moderately skewed tile reads
// close to its regular sibling — mitigated by the sqrt easing, which spends most of the span on the first
// few degrees of skew. Star tiles are excluded; they keep starHue().
const IRREGULAR_HUE_SPAN = 22;

// Defect normalisers: the distortion that earns the FULL span. 60° of RMS angular deviation from the
// regular interior angle (a 60°/120° rhombus sits at 30°, i.e. half a span), or a relative RMS edge
// spread of 0.30 (a 2:1 rectangle sits at 0.33, just past a full span).
const ANGLE_FULL_DEFECT_DEG = 60;
const EDGE_FULL_DEFECT = 0.3;

// How far an outline is from the regular polygon on the same side count, in [0,1]: 0 iff equilateral AND
// equiangular (⟺ regular), rising with distortion and saturating at 1. Both terms are needed — angles
// alone would score a rectangle as regular, edges alone would score a rhombus as regular. Continuous in
// the vertices, and a function of the outline ALONE, so a given shape gets the same colour in every
// tiling it appears in. Float trig, display-only.
export function regularityDefect(vertices: { x: number; y: number }[]): number {
	const m = vertices.length;
	if (m < 3) return 1;
	const thetaReg = 180 - 360 / m;
	const edges: number[] = [];
	let angSq = 0;
	for (let i = 0; i < m; i++) {
		const prev = vertices[(i - 1 + m) % m];
		const cur = vertices[i];
		const next = vertices[(i + 1) % m];
		const side = Math.hypot(next.x - cur.x, next.y - cur.y);
		if (side < 1e-9) return 1; // degenerate outline — treat as maximally irregular
		edges.push(side);
		const ax = prev.x - cur.x, ay = prev.y - cur.y;
		const bx = next.x - cur.x, by = next.y - cur.y;
		const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
		if (la < 1e-9 || lb < 1e-9) return 1;
		const ang = (Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)))) * 180) / Math.PI;
		angSq += (ang - thetaReg) ** 2;
	}
	const angleDefect = Math.sqrt(angSq / m) / ANGLE_FULL_DEFECT_DEG;
	const meanEdge = edges.reduce((a, b) => a + b, 0) / m;
	const edgeVar = edges.reduce((a, e) => a + (e - meanEdge) ** 2, 0) / m;
	const edgeDefect = Math.sqrt(edgeVar) / meanEdge / EDGE_FULL_DEFECT;
	return Math.min(1, Math.hypot(angleDefect, edgeDefect));
}

// Fill hue for a plain (non-star) tile: the regular by-side-count ramp, drifted down the wheel by the
// outline's distance from regular. A regular tile lands exactly on its ramp hue; a flexing tile slides
// smoothly onto it as it regularises. sqrt easing so a small skew already shows.
export function polygonFillHue(vertices: { x: number; y: number }[]): number {
	const base = polygonHue(vertices.length);
	const defect = regularityDefect(vertices);
	// Float noise on an exactly-regular outline would otherwise wrap a base hue of 0 (the triangle) round
	// to 359.99…; at this threshold the drift is < 0.001°, well under any perceptible step.
	if (defect < 1e-9) return base;
	const shift = IRREGULAR_HUE_SPAN * Math.sqrt(defect);
	return (((base - shift) % 360) + 360) % 360;
}

// Star tiles use the original StarPolygon.calculateHue ramp (lib/classes/polygons/StarPolygon.ts):
// by point count n (= vertices.length / 2) over [3,12] → [300,0], plus a 25° offset — a distinct
// violet→red ramp, NOT the regular-polygon log ramp above.
// Nudge the base hue by the star's apex (tip) angle so two same-n stars of different sharpness are
// visually distinct. Centred so a ~60° apex keeps the base hue; clamped to ±STAR_APEX_HUE_SPAN so the
// nudge never crosses into a neighbouring point-count's band (those are ~33° apart on this ramp).
const STAR_APEX_HUE_SPAN = 25;

export function starHue(points: number, apexAngleDeg?: number): number {
	const base = mapRange(points, 3, 12, 300, 0) + 300 / 12;
	if (apexAngleDeg == null || !Number.isFinite(apexAngleDeg)) return base;
	const shift = Math.max(-STAR_APEX_HUE_SPAN, Math.min(STAR_APEX_HUE_SPAN, (apexAngleDeg - 60) * 0.5));
	return (((base + shift) % 360) + 360) % 360;
}

// The apex (tip) angle of a star tile, in degrees: the sharpest TIP's corner opening. Tips are the
// star's points — the vertices at a local maximum of radius from the centroid — so we measure the
// unsigned wedge (winding-/convexity-agnostic) only there, never at the valleys between points (which
// on a blunt star can be sharper than the tips). NaN if there's no clear tip or the outline degenerates.
export function starApexAngleDeg(vertices: { x: number; y: number }[]): number {
	const m = vertices.length;
	if (m < 3) return NaN;
	let cx = 0, cy = 0;
	for (const v of vertices) { cx += v.x; cy += v.y; }
	cx /= m; cy /= m;
	const rad = vertices.map((v) => Math.hypot(v.x - cx, v.y - cy));
	let min = Infinity;
	for (let i = 0; i < m; i++) {
		const rc = rad[i], rp = rad[(i - 1 + m) % m], rn = rad[(i + 1) % m];
		// tip = strict local radius maximum (a point of the star), skipping valleys and flat runs
		if (!(rc >= rp && rc >= rn && (rc > rp || rc > rn))) continue;
		const cur = vertices[i];
		const prev = vertices[(i - 1 + m) % m];
		const next = vertices[(i + 1) % m];
		const ax = prev.x - cur.x, ay = prev.y - cur.y;
		const bx = next.x - cur.x, by = next.y - cur.y;
		const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
		if (la < 1e-9 || lb < 1e-9) continue;
		const cos = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)));
		const ang = Math.acos(cos);
		if (ang < min) min = ang;
	}
	return Number.isFinite(min) ? (min * 180) / Math.PI : NaN;
}

// Tiles are painted OPAQUE. At α<1 the near-black surface bleeds through and drops every fill's perceived
// lightness by ~0.13 — that was the whole reason the inversive view (whose shader writes alpha 1) looked
// brighter and more vivid than everything else. Shared by the thumbnails, the figures and the VC cards so
// a catalogue thumbnail is the colour you get on the play canvas.
export const TILE_FILL_ALPHA = 1;

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
		polys.push({ n: poly.n ?? verts.length, vertices: verts, star: poly.star === true || ((poly.n ?? verts.length) >= 3 && verts.length === 2 * (poly.n ?? verts.length)), hue: poly.hue });
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
				hue: poly.hue,
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
		const hue = poly.hue ?? (poly.star ? starHue(poly.n, starApexAngleDeg(poly.vertices)) : polygonFillHue(poly.vertices));
		ctx.fillStyle = hsbToHsla(hue, 40, 100, TILE_FILL_ALPHA);
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

/**
 * Render a fixed FIGURE — a single prototile, or the tiles fanned around one vertex — fit to ~`fill` of a
 * square frame. The `polygons` branch of renderTilingToContext scales by a fixed pxPerEdge, so a lone
 * shape lands tiny (huge margins) or clipped depending on its side count; here we size pxPerEdge from the
 * figure's own bounding box so the framing is consistent whatever the tile count or edge length. For a
 * repeating tiling use renderTilingToDataUrl with a translationalCell instead — that path already fills
 * the viewport. Returns a data URL, or null off the main thread / for an empty figure.
 */
export function renderFigureToDataUrl(
	polygons: RawPolygon[],
	size = 1024,
	fill = 0.9,
	background = "#1e1e22",
	type = "image/png",
): string | null {
	if (typeof document === "undefined" || polygons.length === 0) return null;
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	for (const p of polygons) {
		for (const v of p.vertices) {
			if (v.x < minX) minX = v.x;
			if (v.x > maxX) maxX = v.x;
			if (v.y < minY) minY = v.y;
			if (v.y > maxY) maxY = v.y;
		}
	}
	const span = Math.max(maxX - minX, maxY - minY, 1e-6);
	// renderTilingToContext scales by pxPerEdge / medianEdge and centres on the bbox, so pick pxPerEdge to
	// map the figure's larger bbox dimension onto fill*size.
	const pxPerEdge = (polygonsMedianEdge(polygons) * fill * size) / span;
	return renderTilingToDataUrl({ polygons, pxPerEdge, background }, size, type);
}
