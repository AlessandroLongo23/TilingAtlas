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

// A composite/decomposable tile shares its side count with a regular polygon — a rhombus (two glued
// equilateral triangles) is a quadrilateral like the square; a skewed hexagon has six sides like the
// regular one — so the by-side-count ramp above paints the two identically. Detect genuine regularity
// (equal sides AND equal angles) and rotate everything else to the complementary side of the wheel:
// a regular n-gon and its irregular sibling then read as different colours (square→orange vs
// rhombus→blue, regular hexagon→green vs skewed hexagon→violet) while side count stays legible within
// each family. Star tiles are excluded — they keep starHue().
const IRREGULAR_HUE_SHIFT = 180;

export function isRegularPolygon(vertices: { x: number; y: number }[]): boolean {
	const n = vertices.length;
	if (n < 3) return false;
	let side0 = -1;
	let angle0 = -1;
	for (let i = 0; i < n; i++) {
		const prev = vertices[(i - 1 + n) % n];
		const cur = vertices[i];
		const next = vertices[(i + 1) % n];
		const side = Math.hypot(next.x - cur.x, next.y - cur.y);
		if (side < 1e-9) return false;
		if (side0 < 0) side0 = side;
		else if (Math.abs(side - side0) > 1e-3 * side0) return false;
		const ax = prev.x - cur.x, ay = prev.y - cur.y;
		const bx = next.x - cur.x, by = next.y - cur.y;
		const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
		if (la < 1e-9 || lb < 1e-9) return false;
		const angle = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb))));
		if (angle0 < 0) angle0 = angle;
		else if (Math.abs(angle - angle0) > 1e-2) return false;
	}
	return true;
}

// Convex isotoxal tiles (equilateral 2n-gons whose interior angles alternate α ≤ β < 180 — the convex
// sibling of the star) share their side count with every other same-n isotoxal tile, so the by-side-count
// ramp above would paint an isotoxal hexagon at 90°/150° identically to one at 60°/180⁻. Nudge the base
// hue by where α sits inside its valid interval — the same trick starHue() plays with a star's apex angle
// — so two same-n isotoxal tiles of different sharpness (and the live play-page slider as it flexes α)
// read as distinct colours. Centred (mid-interval keeps the base hue), clamped to ±ISOTOXAL_ANGLE_HUE_SPAN
// so the nudge stays well inside the ±180 irregular band and, for the side counts that share tilings
// (4/6/8/12, ≥33° apart on the ramp), never crosses into a neighbouring side count's colour.
const ISOTOXAL_ANGLE_HUE_SPAN = 12;

// The smaller alternating interior angle α of a convex isotoxal 2n-gon, in degrees. NaN when the outline
// isn't a convex isotoxal tile: odd side count, unequal edges, a reflex corner (that's a star — coloured
// by the star path, not here), angles that don't fall into two strictly-alternating classes, or the
// degenerate regular case (α = β). Float trig, display-only.
export function isotoxalCharAngleDeg(vertices: { x: number; y: number }[]): number {
	const m = vertices.length;
	if (m < 4 || m % 2 !== 0) return NaN;
	let side0 = -1;
	let crossSign = 0;
	let evenAng = -1;
	let oddAng = -1;
	for (let i = 0; i < m; i++) {
		const prev = vertices[(i - 1 + m) % m];
		const cur = vertices[i];
		const next = vertices[(i + 1) % m];
		const side = Math.hypot(next.x - cur.x, next.y - cur.y);
		if (side < 1e-9) return NaN;
		if (side0 < 0) side0 = side;
		else if (Math.abs(side - side0) > 1e-3 * side0) return NaN;
		const ax = prev.x - cur.x, ay = prev.y - cur.y;
		const bx = next.x - cur.x, by = next.y - cur.y;
		const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
		if (la < 1e-9 || lb < 1e-9) return NaN;
		// Convexity: every corner must turn the same way (all cross products one sign). A mixed sign is a
		// reflex dent ⇒ the tile is a star, not a convex isotoxal, and is handled by the star path.
		const cross = ax * by - ay * bx;
		if (Math.abs(cross) > 1e-9) {
			const s = cross > 0 ? 1 : -1;
			if (crossSign === 0) crossSign = s;
			else if (s !== crossSign) return NaN;
		}
		const ang = (Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)))) * 180) / Math.PI;
		if (i % 2 === 0) {
			if (evenAng < 0) evenAng = ang;
			else if (Math.abs(ang - evenAng) > 0.5) return NaN;
		} else {
			if (oddAng < 0) oddAng = ang;
			else if (Math.abs(ang - oddAng) > 0.5) return NaN;
		}
	}
	if (evenAng < 0 || oddAng < 0 || Math.abs(evenAng - oddAng) < 0.5) return NaN; // regular / degenerate
	return Math.min(evenAng, oddAng);
}

// Fill hue for a plain (non-star) tile: the regular by-side-count ramp, rotated to its complement when
// the tile isn't actually regular, then nudged by the isotoxal angle when the tile is a convex isotoxal.
export function polygonFillHue(vertices: { x: number; y: number }[]): number {
	const base = polygonHue(vertices.length);
	if (isRegularPolygon(vertices)) return base;
	const irregular = (base + IRREGULAR_HUE_SHIFT) % 360;
	const alpha = isotoxalCharAngleDeg(vertices);
	if (!Number.isFinite(alpha)) return irregular;
	// α ∈ (max(0, C−180), C/2) with C = α + β = 360 − 360/n; map that open interval onto [−SPAN, +SPAN].
	const n = vertices.length / 2;
	const c = 360 - 360 / n;
	const aLo = Math.max(0, c - 180);
	const aHi = c / 2;
	if (aHi - aLo < 1e-6) return irregular;
	const t = Math.min(1, Math.max(0, (alpha - aLo) / (aHi - aLo)));
	const shift = (t - 0.5) * 2 * ISOTOXAL_ANGLE_HUE_SPAN;
	return (((irregular + shift) % 360) + 360) % 360;
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
		ctx.fillStyle = hsbToHsla(poly.star ? starHue(poly.n, starApexAngleDeg(poly.vertices)) : polygonFillHue(poly.vertices), 40, 100, 0.9);
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
