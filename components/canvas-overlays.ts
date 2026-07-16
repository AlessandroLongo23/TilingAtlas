import type { Axis, Center, SymmetryData, Vec2 } from "@/lib/classes/symmetry/types";

// p5 is the same untyped instance canvas.tsx uses. Every draw here runs INSIDE the canvas world
// transform (…translate·rotate·scale·scale(1,-1)), so geometry is in WORLD units and follows
// pan/zoom/rotate for free. Colour mode is HSB(360,100,100) with alpha 0..1 (set in canvas.tsx setup).
// World-unit stroke weights ≈ pixels/zoom; the canvas draws at zoom≈40–150, so 0.02–0.05 → ~1–4 px.
type P5 = any; // eslint-disable-line @typescript-eslint/no-explicit-any

// The canvas draw state the overlay needs to map screen<->world and replicate elements across the whole
// viewport (the same transform canvas.tsx applies before calling us).
export interface OverlayView {
	zoom: number;
	rotation: number; // radians
	offset: Vec2; // the (wrapped) draw offset, pixels
	width: number;
	height: number;
}

function polygon(p5: P5, pts: Vec2[]) {
	p5.beginShape();
	for (const q of pts) p5.vertex(q.x, q.y);
	p5.endShape(p5.CLOSE);
}

// Plain (monochrome) tiling render for the symmetry-elements view: light-grey tiles + thin dark edges,
// no per-tile hue — colour is reserved for the symmetry axes and rotation centres drawn on top.
export function drawTilingPlain(p5: P5, tiling: { nodes: { vertices: Vec2[] }[] }, zoom: number) {
	p5.push();
	p5.stroke(0, 0, 25);
	p5.strokeWeight(1 / zoom);
	p5.fill(0, 0, 88);
	for (const node of tiling.nodes) {
		p5.beginShape();
		for (const v of node.vertices) p5.vertex(v.x, v.y);
		p5.endShape(p5.CLOSE);
	}
	p5.pop();
}

// World point currently under the SCREEN CENTRE: invert the canvas transform
// screen = (W/2+off.x, H/2+off.y) + Rot(rot)·(zoom·wx, −zoom·wy) at screen = (W/2, H/2).
function worldUnderCentre(view: OverlayView): Vec2 {
	const { zoom, rotation: rot, offset } = view;
	const c = Math.cos(rot), s = Math.sin(rot);
	const px = -offset.x, py = -offset.y;
	const rx = c * px + s * py, ry = -s * px + c * py;
	return { x: rx / zoom, y: -ry / zoom };
}

// The whole-lattice-vector translate (m·c1 + n·c2, integer m,n) that brings `anchor` to its copy nearest
// the world point under the screen centre. The symmetry analysis anchors the FD/cell polygons at ONE
// fixed world spot, and the pan wrap only keeps that spot within ~a cell of the centre — for a large
// cell that can be the corner of the screen. Round-reduction in LATTICE coordinates picks the nearest
// copy under any pan/rotation (same convention as canvas.tsx wrapOffset). Degenerate basis → no move.
export function fdSnapTranslate(view: OverlayView, cell: [Vec2, Vec2], anchor: Vec2): Vec2 {
	const [c1, c2] = cell;
	const det = c1.x * c2.y - c1.y * c2.x;
	if (Math.abs(det) < 1e-12) return { x: 0, y: 0 };
	const w = worldUnderCentre(view);
	const dx = w.x - anchor.x, dy = w.y - anchor.y;
	const m = Math.round((dx * c2.y - dy * c2.x) / det);
	const n = Math.round((-dx * c1.y + dy * c1.x) / det);
	return { x: m * c1.x + n * c2.x, y: m * c1.y + n * c2.y };
}

export function drawFundamentalDomain(p5: P5, data: SymmetryData, view: OverlayView) {
	p5.push();
	// Snap the whole group (cell + subdivision + FD) to the lattice copy nearest the view centre. ONE
	// shared translate keeps it coherent — the FD stays inside its cell. cellOrigin is the documented
	// anchor the cellPolygon is centred on.
	const t = fdSnapTranslate(view, data.cell, data.cellOrigin);
	p5.translate(t.x, t.y);
	// the drawn cell — the primitive parallelogram (hexagonal → 60° rhombus, cm/cmm → mirror rhombus); a
	// thin neutral outline.
	p5.noFill();
	p5.stroke(0, 0, 55);
	p5.strokeWeight(0.02);
	polygon(p5, data.cellPolygon);
	// subdivision — the cell tiled by all its fundamental-domain copies, faint orange outlines (a single
	// entry means the self-check declined a subdivision, so only the FD below is drawn).
	if (data.subdivision.length > 1) {
		p5.stroke(28, 60, 90);
		p5.strokeWeight(0.02);
		for (const copy of data.subdivision) polygon(p5, copy);
	}
	// emphasized fundamental domain — translucent yellow fill + orange edge, on top
	p5.fill(48, 85, 100, 0.5);
	p5.stroke(28, 90, 90);
	p5.strokeWeight(0.03);
	polygon(p5, data.fd);
	p5.pop();
}

// --- symmetry elements: rotation centres + mirror/glide axes, replicated across the whole viewport ---

// Wikipedia rotation-centre glyphs: 6-fold blue hexagon, 4-fold amber square, 3-fold red triangle,
// 2-fold magenta diamond. [hue, sat, bri] in the canvas HSB(360,100,100) space.
const CENTER_STYLE: Record<number, { h: number; s: number; b: number }> = {
	2: { h: 315, s: 80, b: 95 }, // magenta
	3: { h: 2, s: 85, b: 88 }, // red
	4: { h: 40, s: 90, b: 95 }, // amber
	6: { h: 222, s: 78, b: 88 }, // blue
};

function ngon(p5: P5, n: number, r: number, start: number) {
	p5.beginShape();
	for (let i = 0; i < n; i++) {
		const a = start + (2 * Math.PI * i) / n;
		p5.vertex(r * Math.cos(a), r * Math.sin(a));
	}
	p5.endShape(p5.CLOSE);
}

// One rotation-centre glyph at world point `z`, drawn at a fixed PIXEL size (unscaled by zoom, y-flip
// undone) so it stays legible and upright at any zoom. Shape + colour follow the Wikipedia legend.
function drawCenterGlyph(p5: P5, z: Vec2, order: number, zoom: number) {
	const r = 6; // px
	const st = CENTER_STYLE[order] ?? CENTER_STYLE[2];
	p5.push();
	p5.translate(z.x, z.y);
	p5.scale(1 / zoom, -1 / zoom); // pixel units, undo the world y-flip so glyphs are upright
	p5.stroke(0, 0, 15);
	p5.strokeWeight(1);
	p5.fill(st.h, st.s, st.b);
	if (order === 2) polygon(p5, [{ x: 0, y: r }, { x: 0.62 * r, y: 0 }, { x: 0, y: -r }, { x: -0.62 * r, y: 0 }]); // diamond
	else if (order === 3) ngon(p5, 3, r, Math.PI / 2); // triangle, point up
	else if (order === 4) ngon(p5, 4, r * 0.92, Math.PI / 4); // square, flat sides
	else ngon(p5, 6, r, Math.PI / 2); // hexagon, point up
	p5.pop();
}

// World-space visible rectangle (AABB), inverting the canvas transform
//   screen = (W/2+offx, H/2+offy) + Rot(rot)·(zoom·wx, −zoom·wy).
function visibleWorldBounds(view: OverlayView): { minX: number; minY: number; maxX: number; maxY: number } {
	const { zoom, rotation: rot, offset, width: W, height: H } = view;
	const c = Math.cos(rot), s = Math.sin(rot);
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const sx of [0, W]) {
		for (const sy of [0, H]) {
			const px = sx - (W / 2 + offset.x), py = sy - (H / 2 + offset.y);
			// Rot(−rot)·p, then /zoom and undo the y-flip
			const rx = c * px + s * py, ry = -s * px + c * py;
			const wx = rx / zoom, wy = -ry / zoom;
			if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
			if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
		}
	}
	return { minX, minY, maxX, maxY };
}

const MAX_REPL = 80; // per-axis cap on lattice replication (backstop against a near-degenerate basis)

// Integer lattice window {m,n} such that `p0 + m·c1 + n·c2` covers the visible AABB (+1 cell margin).
function latticeWindow(
	bounds: { minX: number; minY: number; maxX: number; maxY: number },
	c1: Vec2, c2: Vec2, p0: Vec2,
): { mMin: number; mMax: number; nMin: number; nMax: number } {
	const det = c1.x * c2.y - c1.y * c2.x;
	if (Math.abs(det) < 1e-12) return { mMin: 0, mMax: 0, nMin: 0, nMax: 0 };
	let mMin = Infinity, mMax = -Infinity, nMin = Infinity, nMax = -Infinity;
	for (const cx of [bounds.minX, bounds.maxX]) {
		for (const cy of [bounds.minY, bounds.maxY]) {
			const dx = cx - p0.x, dy = cy - p0.y;
			const m = (dx * c2.y - dy * c2.x) / det;
			const n = (-dx * c1.y + dy * c1.x) / det;
			mMin = Math.min(mMin, m); mMax = Math.max(mMax, m);
			nMin = Math.min(nMin, n); nMax = Math.max(nMax, n);
		}
	}
	const clampLo = (x: number) => Math.max(-MAX_REPL, Math.floor(x) - 1);
	const clampHi = (x: number) => Math.min(MAX_REPL, Math.ceil(x) + 1);
	return { mMin: clampLo(mMin), mMax: clampHi(mMax), nMin: clampLo(nMin), nMax: clampHi(nMax) };
}

// Mirror axes solid crimson, glide axes dashed royal-blue, each replicated to fill the viewport. Every
// line runs through its (translated) point along its direction, spanning the whole AABB. Stroke weight
// and dash length scale by 1/zoom to stay ~constant in pixels. Deduped by (angle, perpendicular offset).
function drawAxes(p5: P5, axes: Axis[], c1: Vec2, c2: Vec2, view: OverlayView, bounds: ReturnType<typeof visibleWorldBounds>) {
	const L = 2 * Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) + 4;
	const seen = new Set<string>();
	const zoom = view.zoom;
	for (const ax of axes) {
		const nrm = { x: -ax.d.y, y: ax.d.x };
		const win = latticeWindow(bounds, c1, c2, ax.p);
		for (let m = win.mMin; m <= win.mMax; m++) {
			for (let n = win.nMin; n <= win.nMax; n++) {
				const p = { x: ax.p.x + m * c1.x + n * c2.x, y: ax.p.y + m * c1.y + n * c2.y };
				const ang = Math.round(((((Math.atan2(ax.d.y, ax.d.x) * 180) / Math.PI) % 180) + 180) % 180);
				const off = Math.round((p.x * nrm.x + p.y * nrm.y) * 1000) / 1000;
				const key = `${ang}|${off}|${ax.kind}`;
				if (seen.has(key)) continue;
				seen.add(key);
				p5.push();
				p5.strokeWeight(2 / zoom);
				if (ax.kind === "glide") {
					p5.stroke(220, 85, 90);
					p5.drawingContext.setLineDash([8 / zoom, 5 / zoom]);
				} else {
					p5.stroke(348, 90, 85);
				}
				p5.line(p.x - ax.d.x * L, p.y - ax.d.y * L, p.x + ax.d.x * L, p.y + ax.d.y * L);
				p5.drawingContext.setLineDash([]);
				p5.pop();
			}
		}
	}
}

export function drawSymmetryElements(p5: P5, data: SymmetryData, view: OverlayView) {
	const [c1, c2] = data.cell;
	const bounds = visibleWorldBounds(view);
	drawAxes(p5, data.axes, c1, c2, view, bounds); // axes first, so the rotation-centre glyphs sit on top

	const seen = new Set<string>();
	for (const cen of data.centers as Center[]) {
		const win = latticeWindow(bounds, c1, c2, cen.z);
		for (let m = win.mMin; m <= win.mMax; m++) {
			for (let n = win.nMin; n <= win.nMax; n++) {
				const z = { x: cen.z.x + m * c1.x + n * c2.x, y: cen.z.y + m * c1.y + n * c2.y };
				if (z.x < bounds.minX || z.x > bounds.maxX || z.y < bounds.minY || z.y > bounds.maxY) continue;
				const key = `${Math.round(z.x * 1000)},${Math.round(z.y * 1000)}`;
				if (seen.has(key)) continue;
				seen.add(key);
				drawCenterGlyph(p5, z, cen.order, view.zoom);
			}
		}
	}
}
