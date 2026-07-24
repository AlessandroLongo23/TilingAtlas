// Canvas 2D renderer for colored square tilings. Deliberately a thin sibling of lib/freedraw/render:
// same view contract (world = grid units, HNF lattice), and the two overlays that need real care —
// the sheared period-lattice overlay and the orbit-dot hover — are REUSED from there (exported with
// structural types), since a ColorPattern carries the same a/b/d/orbit fields. What's new is only
// the content pass: every unit cell filled with its color, every grid line a real tile edge.

import { coset } from "@/lib/freedraw/pattern";
import {
	beginViewRotation,
	drawLattice,
	drawOrbitDots,
	rotatedExtent,
	visibleSpan,
	type FreedrawView,
} from "@/lib/freedraw/render";
import { colorCountOf, colorsGridOf, type ColorPattern } from "./pattern";

const SQRT3_2 = Math.sqrt(3) / 2;

export type ColorsView = FreedrawView;

/**
 * One tile color of the palette: a HUE (degrees, rendered at a fixed legible saturation/lightness per
 * theme) or one of the two specials no hue can express — "cream", the warm near-white that reads as
 * paper, and "dark", its almost-black complement. The palette is an ARRAY indexed by the pattern's
 * color id, so a wider solver output only grows the array, not the type.
 */
export type ColorChoice = number | "cream" | "dark";

/** The shipped look: A cream, B the deep blue (hue 215), C terracotta — the third stays legible next
 * to the blue for red-green color blindness, where a green would not. */
export const DEFAULT_PALETTE: readonly ColorChoice[] = ["cream", 215, 15];

/** The palette a pattern with `n` colors renders through: the caller's choices, filled PER SLOT from
 * the default (a store palette left short by an older URL still colors a wider pattern), then spread
 * hues beyond the defaults so a future 4+-color catalogue is never two identical fills. */
export function paletteFor(n: number, palette?: readonly ColorChoice[]): readonly ColorChoice[] {
	return Array.from({ length: n }, (_, i) => palette?.[i] ?? DEFAULT_PALETTE[i] ?? (i * 97) % 360);
}

export interface ColorsStyle {
	/** Stroke the grid lines — in this class every one is a real tile boundary. */
	showEdges: boolean;
	/** Dots at grid points, colored by colored-vertex orbit — makes k visible. */
	showVertices: boolean;
	/** Period-lattice overlay: fundamental cell tinted, translates dashed. */
	showLattice: boolean;
	/** One entry per tile color; omitted (thumbnails, /colors) means DEFAULT_PALETTE. */
	palette?: readonly ColorChoice[];
	dark: boolean;
}

export const DEFAULT_COLORS_STYLE: ColorsStyle = {
	showEdges: true,
	showVertices: false,
	showLattice: false,
	dark: false,
};

// A hue renders at fixed saturation/lightness per theme (the numbers the original blue used), so any
// two picked hues keep comparable weight. The specials are tuned per theme the same way the old
// hard-coded pair was: cream stays paper-like, dark stays near-black but lifted enough off the dark
// theme's background for the edge strokes to read.
export function cellFill(choice: ColorChoice, dark: boolean, alpha = 1): string {
	if (choice === "cream") return dark ? `hsl(42 18% 24% / ${alpha})` : `hsl(42 52% 88% / ${alpha})`;
	if (choice === "dark") return dark ? `hsl(222 14% 21% / ${alpha})` : `hsl(222 20% 14% / ${alpha})`;
	return dark ? `hsl(${choice} 42% 58% / ${alpha})` : `hsl(${choice} 48% 48% / ${alpha})`;
}

// The (h, s%, l%) of one palette slot per theme — the SAME numbers cellFill bakes into its hsl strings,
// factored out so the non-Euclidean colored shelves (hyperbolic disk shader, spherical three.js) fill by
// the exact colors the Euclidean /colors canvas uses. Every colored tiling across the atlas therefore
// shares one palette and one palette control (configuration.colorsPalette).
function cellHsl(choice: ColorChoice, dark: boolean): [number, number, number] {
	if (choice === "cream") return dark ? [42, 18, 24] : [42, 52, 88];
	if (choice === "dark") return dark ? [222, 14, 21] : [222, 20, 14];
	return dark ? [choice, 42, 58] : [choice, 48, 48];
}

function hslToRgb255(h: number, s: number, l: number): [number, number, number] {
	const S = s / 100;
	const L = l / 100;
	const c = (1 - Math.abs(2 * L - 1)) * S;
	const hp = (((h % 360) + 360) % 360) / 60;
	const x = c * (1 - Math.abs((hp % 2) - 1));
	let r = 0;
	let g = 0;
	let b = 0;
	if (hp < 1) [r, g, b] = [c, x, 0];
	else if (hp < 2) [r, g, b] = [x, c, 0];
	else if (hp < 3) [r, g, b] = [0, c, x];
	else if (hp < 4) [r, g, b] = [0, x, c];
	else if (hp < 5) [r, g, b] = [x, 0, c];
	else [r, g, b] = [c, 0, x];
	const m = L - c / 2;
	return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** The palette a pattern with `n` colors renders through, as RGB 0..255 per color index — the shared
 *  source for the hyperbolic disk shader (÷255 → 0..1) and the spherical three.js builder. */
export function paletteRgb255(n: number, palette: readonly ColorChoice[] | undefined, dark: boolean): [number, number, number][] {
	return paletteFor(n, palette).map((c) => {
		const [h, s, l] = cellHsl(c, dark);
		return hslToRgb255(h, s, l);
	});
}

// While the orbit dots are up the fill dims, same move (and same constant) as the freedraw canvas.
const ORBIT_MODE_FILL_ALPHA = 0.4;

/** A view centred on the origin showing roughly `cells` grid units across the shorter side. */
export function fitColorsView(width: number, height: number, cells: number): ColorsView {
	return { cx: 0, cy: 0, scale: Math.min(width, height) / Math.max(1, cells) };
}

export function drawColors(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	p: ColorPattern,
	view: ColorsView,
	style: ColorsStyle = DEFAULT_COLORS_STYLE,
	hover: { x: number; y: number } | null = null,
	orbitScales: number[] = [],
): void {
	if (p.patch) {
		drawColorsPatch(ctx, width, height, p, view, style, hover, orbitScales);
		return;
	}
	const { scale } = view;
	const rot = view.rot ?? 0;
	const tri = colorsGridOf(p) === "triangle";
	// Lattice basis: square identity, triangle with e2 at 60° — the freedraw map exactly.
	const bx = tri ? 0.5 : 0;
	const by = tri ? SQRT3_2 : 1;
	const px = (x: number, y: number) => width / 2 + (x + bx * y - view.cx) * scale;
	const py = (y: number) => height / 2 - (by * y - view.cy) * scale;
	// Span against the rotated extent — see rotatedExtent: the maths stays upright, the context turns.
	const ext = rotatedExtent(width, height, rot);
	const span = visibleSpan(ext.w, ext.h, view, bx, by);

	// The DPR the caller left on the transform, read BEFORE the view rotation composes into it (after
	// which .a is dpr·cos θ, and 0 at a quarter turn). The square path's pixel snapping below needs it.
	const dpr = ctx.getTransform().a || 1;

	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = style.dark ? "#12151a" : "#ffffff";
	ctx.fillRect(0, 0, width, height);
	beginViewRotation(ctx, width, height, rot);

	const alpha = style.showVertices ? ORBIT_MODE_FILL_ALPHA : 1;
	const pal = paletteFor(colorCountOf(p), style.palette);
	const fills = pal.map((c) => cellFill(c, style.dark, alpha));

	if (!tri) {
		// ONE snapped coordinate per grid line, shared by the fill pass and the edge pass. Snapping is
		// in DEVICE pixels (the ctx transform holds the DPR): every cell boundary lands on a
		// device-pixel edge, so abutting fills never leave an antialiasing seam (no need for the +1px
		// bleed the freedraw renderer uses, which shifted every fill down-right of its stroke — at
		// thumbnail cell sizes that read as the grid sliding off the colors) and the strokes sit
		// exactly on the fill boundaries at every zoom and DPR. Square-only: the skewed triangle basis
		// has no axis-aligned lattice to snap to, so that path keeps freedraw's hairline-stroke trick.
		// Under a view rotation the snapped grid is no longer the device grid (nothing is), but the
		// coordinates stay shared between the two passes, which is what keeps the seams closed.
		const snap = (v: number) => Math.round(v * dpr) / dpr;
		const xs: number[] = [];
		const ys: number[] = [];
		for (let x = span.x0; x <= span.x1 + 1; x++) xs.push(snap(px(x, 0)));
		for (let y = span.y0; y <= span.y1 + 1; y++) ys.push(snap(py(y)));

		for (let y = span.y0; y <= span.y1; y++) {
			const yBot = ys[y - span.y0];
			const yTop = ys[y - span.y0 + 1];
			for (let x = span.x0; x <= span.x1; x++) {
				const x0 = xs[x - span.x0];
				const x1 = xs[x - span.x0 + 1];
				ctx.fillStyle = fills[p.cells[coset(p, x, y)]];
				ctx.fillRect(x0, yTop, x1 - x0, yBot - yTop);
			}
		}

		if (style.showEdges) {
			// A 1-CSS-px line on a snapped coordinate straddles the boundary; when that is an odd
			// number of device pixels, offset by half a device pixel so the stroke stays crisp.
			const half = Math.round(dpr) % 2 ? 0.5 / dpr : 0;
			ctx.beginPath();
			for (const y of ys) {
				ctx.moveTo(xs[0], y + half);
				ctx.lineTo(xs[xs.length - 1], y + half);
			}
			for (const x of xs) {
				ctx.moveTo(x + half, ys[ys.length - 1]);
				ctx.lineTo(x + half, ys[0]);
			}
			ctx.strokeStyle = edgeStroke(style.dark);
			ctx.lineWidth = 1;
			ctx.stroke();
		}
	} else {
		// Two triangles per lattice cell (up = cells[2c], down = cells[2c+1]); the square path's rect
		// snapping cannot skew, so seams are killed the patch way instead: stroke every triangle in
		// its own color FIRST (round joins — a miter would spike the 60° tips ~1px into the
		// neighbour), then fill on top, so the strokes only back the fills' antialiasing residue.
		const triPath = (x: number, y: number, up: boolean) => {
			ctx.beginPath();
			if (up) {
				ctx.moveTo(px(x, y), py(y));
				ctx.lineTo(px(x + 1, y), py(y));
				ctx.lineTo(px(x, y + 1), py(y + 1));
			} else {
				ctx.moveTo(px(x + 1, y), py(y));
				ctx.lineTo(px(x, y + 1), py(y + 1));
				ctx.lineTo(px(x + 1, y + 1), py(y + 1));
			}
			ctx.closePath();
		};
		ctx.lineJoin = "round";
		ctx.lineWidth = 1.5;
		for (let y = span.y0; y <= span.y1; y++) {
			for (let x = span.x0; x <= span.x1; x++) {
				const c = coset(p, x, y);
				ctx.strokeStyle = fills[p.cells[2 * c]];
				triPath(x, y, true);
				ctx.stroke();
				ctx.strokeStyle = fills[p.cells[2 * c + 1]];
				triPath(x, y, false);
				ctx.stroke();
			}
		}
		ctx.lineJoin = "miter";
		for (let y = span.y0; y <= span.y1; y++) {
			for (let x = span.x0; x <= span.x1; x++) {
				const c = coset(p, x, y);
				ctx.fillStyle = fills[p.cells[2 * c]];
				triPath(x, y, true);
				ctx.fill();
				ctx.fillStyle = fills[p.cells[2 * c + 1]];
				triPath(x, y, false);
				ctx.fill();
			}
		}

		if (style.showEdges) {
			// Three straight line families: rows, columns, and constant x+y — freedraw's scaffold
			// geometry with the colors view's tile-edge weight.
			ctx.beginPath();
			for (let y = span.y0; y <= span.y1 + 1; y++) {
				ctx.moveTo(px(span.x0, y), py(y));
				ctx.lineTo(px(span.x1 + 1, y), py(y));
			}
			for (let x = span.x0; x <= span.x1 + 1; x++) {
				ctx.moveTo(px(x, span.y0), py(span.y0));
				ctx.lineTo(px(x, span.y1 + 1), py(span.y1 + 1));
			}
			for (let s = span.x0 + span.y0; s <= span.x1 + span.y1 + 2; s++) {
				ctx.moveTo(px(s - span.y0, span.y0), py(span.y0));
				ctx.lineTo(px(s - span.y1 - 1, span.y1 + 1), py(span.y1 + 1));
			}
			ctx.strokeStyle = edgeStroke(style.dark);
			ctx.lineWidth = 1;
			ctx.stroke();
		}
	}

	if (style.showLattice) drawLattice(ctx, p, style, px, py, span);

	if (style.showVertices)
		drawOrbitDots(ctx, p, view, style, px, py, bx, by, span, hover, orbitScales);

	ctx.restore(); // the view rotation
}

// Stronger than freedraw's scaffold (these are tile edges, not construction lines), but still
// translucent so the color field, not the grid, carries the picture.
const edgeStroke = (dark: boolean) => (dark ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.28)");

/**
 * Combined-grid patches: the explicit per-period geometry instanced over the T1/T2 lattice — the
 * freedraw patch renderer's shape with polygons filled by their own COLOR through the palette, every
 * edge a real tile boundary, and the same lattice overlay and orbit-dot hover.
 */
function drawColorsPatch(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	p: ColorPattern,
	view: ColorsView,
	style: ColorsStyle,
	hover: { x: number; y: number } | null,
	orbitScales: number[],
): void {
	const patch = p.patch!;
	const { scale } = view;
	const rot = view.rot ?? 0;
	const [t1x, t1y] = patch.T1;
	const [t2x, t2y] = patch.T2;
	const det = t1x * t2y - t1y * t2x;
	const px = (x: number) => width / 2 + (x - view.cx) * scale;
	const py = (y: number) => height / 2 - (y - view.cy) * scale;

	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = style.dark ? "#12151a" : "#ffffff";
	ctx.fillRect(0, 0, width, height);
	if (Math.abs(det) < 1e-9) return;

	// Instance range: invert the basis at the corners of the rotated extent, pad by the patch's diameter.
	const ext = rotatedExtent(width, height, rot);
	const halfW = ext.w / (2 * scale);
	const halfH = ext.h / (2 * scale);
	const inv = (wx: number, wy: number): [number, number] => [
		(wx * t2y - wy * t2x) / det,
		(t1x * wy - t1y * wx) / det,
	];
	let m0 = Infinity;
	let m1 = -Infinity;
	let n0 = Infinity;
	let n1 = -Infinity;
	for (const [cx, cy] of [
		[view.cx - halfW, view.cy - halfH],
		[view.cx - halfW, view.cy + halfH],
		[view.cx + halfW, view.cy - halfH],
		[view.cx + halfW, view.cy + halfH],
	]) {
		const [m, n] = inv(cx, cy);
		m0 = Math.min(m0, m);
		m1 = Math.max(m1, m);
		n0 = Math.min(n0, n);
		n1 = Math.max(n1, n);
	}
	const PAD = 2;
	m0 = Math.floor(m0) - PAD;
	m1 = Math.ceil(m1) + PAD;
	n0 = Math.floor(n0) - PAD;
	n1 = Math.ceil(n1) + PAD;
	// Runaway guard, same spirit as the fixed grids' MAX_SPAN.
	if ((m1 - m0 + 1) * (n1 - n0 + 1) > 4000) return;

	beginViewRotation(ctx, width, height, rot);

	const vx = (vi: number, ox: number, oy: number) => patch.verts[vi][0] + ox * t1x + oy * t2x;
	const vy = (vi: number, ox: number, oy: number) => patch.verts[vi][1] + ox * t1y + oy * t2y;

	const alpha = style.showVertices ? ORBIT_MODE_FILL_ALPHA : 1;
	const pal = paletteFor(colorCountOf(p), style.palette);
	const fills = pal.map((c) => cellFill(c, style.dark, alpha));
	// Two passes: every outline stroked FIRST (round joins), then every fill on top. Stroking the same
	// path together with its fill — the freedraw seam trick — puts each stroke's outer half INTO the
	// neighbouring tile, where a miter join can spike a triangle tip's color ~2px across the boundary
	// and the last-drawn neighbour shifts a shared edge by half a pixel (the notched, stepped seams of
	// the first ts screenshots). As an UNDERLAY the strokes only ever peek through the fills' own
	// antialiasing residue, backing it with tile color instead of the background; the visible boundary
	// is the fills' symmetric AA edge, exactly on the shared segment.
	const ringPath = (pi: number, m: number, n: number) => {
		const ring = patch.polys[pi];
		for (let ci = 0; ci < ring.length; ci++) {
			const [vi, ox, oy] = ring[ci];
			const x = px(vx(vi, ox + m, oy + n));
			const y = py(vy(vi, ox + m, oy + n));
			if (ci === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.closePath();
	};
	ctx.lineJoin = "round";
	ctx.lineWidth = 1.5;
	for (let n = n0; n <= n1; n++) {
		for (let m = m0; m <= m1; m++) {
			for (let pi = 0; pi < patch.polys.length; pi++) {
				ctx.strokeStyle = fills[patch.polyColor[pi]];
				ctx.beginPath();
				ringPath(pi, m, n);
				ctx.stroke();
			}
		}
	}
	ctx.lineJoin = "miter";
	for (let n = n0; n <= n1; n++) {
		for (let m = m0; m <= m1; m++) {
			for (let pi = 0; pi < patch.polys.length; pi++) {
				ctx.fillStyle = fills[patch.polyColor[pi]];
				ctx.beginPath();
				ringPath(pi, m, n);
				ctx.fill();
			}
		}
	}

	if (style.showEdges) {
		ctx.beginPath();
		for (const [vi, vj, ox, oy] of patch.edges) {
			for (let n = n0; n <= n1; n++) {
				for (let m = m0; m <= m1; m++) {
					ctx.moveTo(px(vx(vi, m, n)), py(vy(vi, m, n)));
					ctx.lineTo(px(vx(vj, ox + m, oy + n)), py(vy(vj, ox + m, oy + n)));
				}
			}
		}
		ctx.strokeStyle = edgeStroke(style.dark);
		ctx.lineWidth = 1;
		ctx.stroke();
	}

	if (style.showLattice) {
		const accent = style.dark ? "hsl(345 90% 66%)" : "hsl(345 80% 46%)";
		ctx.beginPath();
		ctx.moveTo(px(0), py(0));
		ctx.lineTo(px(t1x), py(t1y));
		ctx.lineTo(px(t1x + t2x), py(t1y + t2y));
		ctx.lineTo(px(t2x), py(t2y));
		ctx.closePath();
		ctx.fillStyle = style.dark ? "hsl(345 90% 66% / 0.2)" : "hsl(345 80% 46% / 0.13)";
		ctx.fill();
		ctx.beginPath();
		for (let n = n0; n <= n1; n++) {
			ctx.moveTo(px(m0 * t1x + n * t2x), py(m0 * t1y + n * t2y));
			ctx.lineTo(px(m1 * t1x + n * t2x), py(m1 * t1y + n * t2y));
		}
		for (let m = m0; m <= m1; m++) {
			ctx.moveTo(px(m * t1x + n0 * t2x), py(m * t1y + n0 * t2y));
			ctx.lineTo(px(m * t1x + n1 * t2x), py(m * t1y + n1 * t2y));
		}
		ctx.strokeStyle = accent;
		ctx.lineWidth = 1.5;
		ctx.setLineDash([5, 4]);
		ctx.stroke();
		ctx.setLineDash([]);
	}

	if (style.showVertices) {
		const r = Math.max(1.6, Math.min(5, scale * 0.09));
		let hoverOrbit = -1;
		if (hover) {
			const pick = Math.max(r, 7) / scale;
			let best = pick * pick;
			for (let n = n0; n <= n1; n++) {
				for (let m = m0; m <= m1; m++) {
					for (let vi = 0; vi < patch.verts.length; vi++) {
						const dx = vx(vi, m, n) - hover.x;
						const dy = vy(vi, m, n) - hover.y;
						const d2 = dx * dx + dy * dy;
						if (d2 <= best) {
							best = d2;
							hoverOrbit = patch.vorbit[vi];
						}
					}
				}
			}
		}
		if (orbitScales.length !== p.k) {
			orbitScales.length = p.k;
			for (let o = 0; o < p.k; o++) orbitScales[o] = 1;
		}
		for (let o = 0; o < p.k; o++) {
			const target = o === hoverOrbit ? 2 : 1;
			const d = target - orbitScales[o];
			orbitScales[o] = Math.abs(d) < 0.01 ? target : orbitScales[o] + d * 0.2;
		}
		ctx.strokeStyle = style.dark ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.55)";
		ctx.lineWidth = 1;
		for (let n = n0; n <= n1; n++) {
			for (let m = m0; m <= m1; m++) {
				for (let vi = 0; vi < patch.verts.length; vi++) {
					const o = patch.vorbit[vi];
					ctx.beginPath();
					ctx.arc(px(vx(vi, m, n)), py(vy(vi, m, n)), r * (orbitScales[o] ?? 1), 0, Math.PI * 2);
					ctx.fillStyle = orbitDotFill(o, style.dark);
					ctx.fill();
					ctx.stroke();
				}
			}
		}
	}

	ctx.restore(); // the view rotation
}

// The freedraw orbit-dot hue walk (vertexColour there), restated locally: golden-angle hues against
// the inverted theme so the dots sit on the fills rather than with them.
function orbitDotFill(orbit: number, dark: boolean): string {
	const hue = (34 + (orbit + 3) * 137.508) % 360;
	return `hsl(${hue.toFixed(1)} 46% ${!dark ? 36 : 74}% / 1)`;
}
