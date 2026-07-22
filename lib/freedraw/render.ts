// Canvas 2D renderer for freedraw patterns.
//
// Why not the flat WebGL path (lib/render/flatTilingGL.ts): that pipeline consumes a fundamental cell
// as a LIST OF POLYGONS and fan-triangulates each from its centroid. A freedraw tile can be an
// infinite strip (no centroid, no vertex list) or an annulus (not star-shaped), so it has no polygon
// representation at all. The fix is to stop drawing tiles and draw the grid instead: fill unit CELLS
// coloured by which face they belong to, and stroke the drawn edges as line segments. Every degenerate
// case then renders correctly with no special-casing, and the whole thing is line art, so 2D canvas is
// fast enough and a tenth of the code. Promoting it to the GL path later is mechanical.

import { analyseFaces, classifyFaces, type FaceAnalysis } from "./faces";
import { coset, type FreedrawPattern } from "./pattern";

export interface FreedrawView {
	/** World coordinates at the canvas centre. */
	cx: number;
	cy: number;
	/** Pixels per grid unit. */
	scale: number;
}

/**
 * How much two cells must have in common to share a colour, coarse to fine. Each mode is a refinement
 * of the one before it, so moving right only ever splits a colour in two — see classifyFaces.
 *
 *   rank   the tile's kind: finite polyomino, infinite strip, unbounded sheet
 *   shape  congruent tiles, counting rotations and mirrors as the same shape
 *   pose   congruent AND identically turned: a 1x3 and a 3x1 part company
 *   orbit  carried onto each other by a translation OF THE PERIOD LATTICE
 */
export type FillMode = "none" | "rank" | "shape" | "pose" | "orbit";

/**
 * Chip label and gloss per fill mode, in ladder order. Lives here rather than in either sidebar so
 * /play's options tab and the freedraw browser can't drift apart on what the modes are called.
 */
export const FILL_MODES: { value: FillMode; label: string; help: string }[] = [
	{ value: "none", label: "None", help: "Bare line art: only the drawn edges." },
	{
		value: "rank",
		label: "Kind",
		help: "By tile kind: finite polyomino, infinite strip, or unbounded sheet.",
	},
	{
		value: "shape",
		label: "Shape",
		help: "One hue per shape. A 1×3 and a 3×1 share a colour — rotations and mirrors count as the same tile.",
	},
	{
		value: "pose",
		label: "Pose",
		help: "Shape and orientation. A 1×3 and a 3×1 now differ, but every 3×1 in the figure stays one colour.",
	},
	{
		value: "orbit",
		label: "Orbit",
		help: "One hue per face orbit. Two tiles share a colour only when a period translation carries one onto the other.",
	},
];

export interface FreedrawStyle {
	fillMode: FillMode;
	/** Thin lines for the underlying grid, including the edges that are not drawn. */
	showScaffold: boolean;
	/** Dots at grid points, coloured by grid-point orbit — makes k-uniformity visible. */
	showVertices: boolean;
	/** Period-lattice overlay: the fundamental cell tinted, and its translates outlined across the view. */
	showLattice: boolean;
	/**
	 * Multiplier on the drawn-edge stroke. The base weight is proportional to the zoom (so the line art
	 * keeps its proportions as you zoom); this scales it, and 0 drops the stroke entirely — the same
	 * contract as the flat canvas's Line stroke slider, which reads the same store field.
	 */
	lineWidth: number;
	dark: boolean;
}

export const DEFAULT_STYLE: FreedrawStyle = {
	fillMode: "none",
	showScaffold: true,
	showVertices: false,
	showLattice: false,
	lineWidth: 1,
	dark: false,
};

// Orbit-dot hover, ported from Tiling.drawVertexOrbits: the radius factor the hovered orbit grows toward,
// and the per-frame ease toward it. Same constants as the Euclidean overlay, so the two feel identical.
const ORBIT_HOVER_GROW = 2;
const ORBIT_HOVER_DAMP = 0.2;

/** Grid-point orbit dot colour. Inverts `dark` so the dots sit against the cell fill, not with it. */
const vertexColour = (orbit: number, dark: boolean) => orbitColour(orbit + 3, !dark);

// While the orbit dots are up the cell fill drops to this alpha — otherwise the pastel faces and the
// dots compete. Same move as the flat canvas, which dims its tiles to 0.3 in orbit mode.
const ORBIT_MODE_FILL_ALPHA = 0.4;

/**
 * Golden-angle hue walk, so neighbouring face ids never land on neighbouring hues. The +34° offset
 * keeps face 0 off pure red, which reads as an error state against a dark background.
 */
export function orbitColour(i: number, dark: boolean, alpha = 1): string {
	const hue = (34 + i * 137.508) % 360;
	const l = dark ? 36 : 74;
	return `hsl(${hue.toFixed(1)} 46% ${l}% / ${alpha})`;
}

/** Finite / strip / unbounded, as three fixed hues so the classification reads at a glance. */
export function rankColour(rank: 0 | 1 | 2, dark: boolean, alpha = 1): string {
	const hue = rank === 0 ? 150 : rank === 1 ? 40 : 265;
	const l = dark ? 32 : 76;
	return `hsl(${hue} 55% ${l}% / ${alpha})`;
}

/** A view centred on the origin showing roughly `cells` grid units across the shorter canvas side. */
export function fitView(width: number, height: number, cells: number): FreedrawView {
	return { cx: 0, cy: 0, scale: Math.min(width, height) / Math.max(1, cells) };
}

// Guard against pathological zoom-out: at most this many grid units are ever iterated per axis.
const MAX_SPAN = 400;

interface Span {
	x0: number;
	x1: number;
	y0: number;
	y1: number;
}

function visibleSpan(width: number, height: number, view: FreedrawView): Span {
	const halfW = width / (2 * view.scale);
	const halfH = height / (2 * view.scale);
	const x0 = Math.floor(view.cx - halfW) - 1;
	const y0 = Math.floor(view.cy - halfH) - 1;
	return {
		x0,
		x1: Math.min(Math.ceil(view.cx + halfW) + 1, x0 + MAX_SPAN),
		y0,
		y1: Math.min(Math.ceil(view.cy + halfH) + 1, y0 + MAX_SPAN),
	};
}

/**
 * Draw one pattern into a 2D context sized `width` x `height` CSS px. The caller owns the device
 * pixel ratio transform. `analysis` is optional: pass a memoised one to avoid re-flooding per frame.
 *
 * `hover` is the pointer in WORLD (grid) coordinates, or null. When the orbit dots are up it selects the
 * grid-point orbit under the cursor, and every dot of that orbit grows — the same hover affordance as the
 * flat canvas's vertex-orbit overlay (Tiling.drawVertexOrbits). `orbitScales` is the caller-owned ease
 * state, one entry per orbit; pass the same array every frame or the growth restarts each draw.
 */
export function drawFreedraw(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	pattern: FreedrawPattern,
	view: FreedrawView,
	style: FreedrawStyle = DEFAULT_STYLE,
	analysis: FaceAnalysis = analyseFaces(pattern),
	hover: { x: number; y: number } | null = null,
	orbitScales: number[] = [],
): void {
	const { scale } = view;
	const sx = (x: number) => width / 2 + (x - view.cx) * scale;
	const sy = (y: number) => height / 2 - (y - view.cy) * scale;
	const span = visibleSpan(width, height, view);

	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = style.dark ? "#12151a" : "#ffffff";
	ctx.fillRect(0, 0, width, height);

	if (style.fillMode !== "none") {
		// One colour per face, resolved before the cell loop — the loop runs over every visible grid
		// square, and building an hsl() string in there was the frame's whole cost.
		const alpha = style.showVertices ? ORBIT_MODE_FILL_ALPHA : 1;
		const classes =
			style.fillMode === "shape" || style.fillMode === "pose" ? classifyFaces(analysis) : null;
		const fill = analysis.faces.map((f) =>
			style.fillMode === "rank"
				? rankColour(f.rank, style.dark, alpha)
				: orbitColour(classes ? classes[style.fillMode as "shape" | "pose"][f.id] : f.id, style.dark, alpha),
		);
		for (let y = span.y0; y <= span.y1; y++) {
			for (let x = span.x0; x <= span.x1; x++) {
				ctx.fillStyle = fill[analysis.cellFace[coset(pattern, x, y)]];
				// +1px on the far edges so neighbouring cells of one face never show a seam.
				ctx.fillRect(sx(x), sy(y + 1), scale + 1, scale + 1);
			}
		}
	}

	if (style.showScaffold) {
		ctx.beginPath();
		for (let y = span.y0; y <= span.y1 + 1; y++) {
			ctx.moveTo(sx(span.x0), sy(y));
			ctx.lineTo(sx(span.x1 + 1), sy(y));
		}
		for (let x = span.x0; x <= span.x1 + 1; x++) {
			ctx.moveTo(sx(x), sy(span.y0));
			ctx.lineTo(sx(x), sy(span.y1 + 1));
		}
		ctx.strokeStyle = style.dark ? "rgba(255,255,255,0.13)" : "rgba(0,0,0,0.13)";
		ctx.lineWidth = 1;
		ctx.stroke();
	}

	if (style.lineWidth > 0) {
		ctx.beginPath();
		for (let y = span.y0; y <= span.y1 + 1; y++) {
			for (let x = span.x0; x <= span.x1 + 1; x++) {
				const c = coset(pattern, x, y);
				if (pattern.h[c] === 1) {
					ctx.moveTo(sx(x), sy(y));
					ctx.lineTo(sx(x + 1), sy(y));
				}
				if (pattern.v[c] === 1) {
					ctx.moveTo(sx(x), sy(y));
					ctx.lineTo(sx(x), sy(y + 1));
				}
			}
		}
		ctx.strokeStyle = style.dark ? "#f2f4f8" : "#101318";
		// Zoom-proportional base weight, scaled by the slider. The clamp keeps the line art readable at both
		// ends of the zoom range; the multiplier is what the Line stroke control moves.
		ctx.lineWidth = Math.max(1.4, Math.min(6, scale * 0.11)) * style.lineWidth;
		ctx.lineCap = "round";
		ctx.stroke();
	}

	if (style.showLattice) drawLattice(ctx, pattern, style, sx, sy, span);

	if (style.showVertices) drawOrbitDots(ctx, pattern, view, style, sx, sy, span, hover, orbitScales);
}

/**
 * The period lattice, drawn as the fundamental cell repeated: the origin cell tinted, and every cell
 * boundary stroked. The lattice is generated by u = (a, 0) and v = (b, d), so its cell boundaries are two
 * line families — the u-family is the horizontals y = n·d, and the v-family is the shears x − (b/d)·y = m·a.
 * Together they cut the plane into copies of the parallelogram (0,0), (a,0), (a+b,d), (b,d), which is
 * exactly the tile of pattern data the whole figure is stamped out of.
 */
function drawLattice(
	ctx: CanvasRenderingContext2D,
	p: FreedrawPattern,
	style: FreedrawStyle,
	sx: (x: number) => number,
	sy: (y: number) => number,
	span: Span,
): void {
	const accent = style.dark ? "hsl(345 90% 66%)" : "hsl(345 80% 46%)";

	// The origin cell, tinted so "this is the piece that repeats" reads without counting lines.
	ctx.beginPath();
	ctx.moveTo(sx(0), sy(0));
	ctx.lineTo(sx(p.a), sy(0));
	ctx.lineTo(sx(p.a + p.b), sy(p.d));
	ctx.lineTo(sx(p.b), sy(p.d));
	ctx.closePath();
	ctx.fillStyle = style.dark ? "hsl(345 90% 66% / 0.2)" : "hsl(345 80% 46% / 0.13)";
	ctx.fill();

	// Both families are clipped to the visible span, widened by one cell so a shear never stops short of
	// the corner it should reach.
	const n0 = Math.floor(span.y0 / p.d) - 1;
	const n1 = Math.ceil((span.y1 + 1) / p.d) + 1;
	const yLo = n0 * p.d;
	const yHi = n1 * p.d;
	// A v-family line at index m passes x = m·a + (b/d)·y. Solve for the m range that can cross the span at
	// either end of the y extent, so a steep shear is not culled before it enters the view.
	const shear = p.b / p.d;
	const mAt = (x: number, y: number) => (x - shear * y) / p.a;
	const ms = [mAt(span.x0, yLo), mAt(span.x0, yHi), mAt(span.x1 + 1, yLo), mAt(span.x1 + 1, yHi)];
	const m0 = Math.floor(Math.min(...ms)) - 1;
	const m1 = Math.ceil(Math.max(...ms)) + 1;

	ctx.beginPath();
	for (let n = n0; n <= n1; n++) {
		ctx.moveTo(sx(span.x0 - 1), sy(n * p.d));
		ctx.lineTo(sx(span.x1 + 2), sy(n * p.d));
	}
	for (let m = m0; m <= m1; m++) {
		ctx.moveTo(sx(m * p.a + shear * yLo), sy(yLo));
		ctx.lineTo(sx(m * p.a + shear * yHi), sy(yHi));
	}
	ctx.strokeStyle = accent;
	ctx.lineWidth = 1.5;
	// Dashed, so the overlay never reads as another drawn edge of the pattern.
	ctx.setLineDash([5, 4]);
	ctx.stroke();
	ctx.setLineDash([]);
}

/**
 * Grid-point orbit dots, with the flat canvas's hover behaviour: the dot under the cursor and every other
 * dot in its orbit grow together, easing in and out. Growth is what makes the orbit legible — it answers
 * "which other points are the same as this one" without a legend.
 */
function drawOrbitDots(
	ctx: CanvasRenderingContext2D,
	p: FreedrawPattern,
	view: FreedrawView,
	style: FreedrawStyle,
	sx: (x: number) => number,
	sy: (y: number) => number,
	span: Span,
	hover: { x: number; y: number } | null,
	scales: number[],
): void {
	const r = Math.max(1.6, Math.min(5, view.scale * 0.09));

	// Hit test: grid points are the integer points of Z², so the only candidate is the nearest one.
	let hoverOrbit = -1;
	if (hover) {
		const gx = Math.round(hover.x);
		const gy = Math.round(hover.y);
		const dx = (gx - hover.x) * view.scale;
		const dy = (gy - hover.y) * view.scale;
		// A generous pick radius: at the smallest dot size an exact hit is a 3px target.
		const pick = Math.max(r, 7);
		if (dx * dx + dy * dy <= pick * pick) hoverOrbit = p.orbit[coset(p, gx, gy)];
	}

	// Ease each orbit toward its target (grown when hovered, 1 at rest), snapping within a hair so a
	// settled orbit takes the cheap at-rest path below. A size change (new pattern) resets every scale.
	if (scales.length !== p.k) {
		scales.length = p.k;
		for (let o = 0; o < p.k; o++) scales[o] = 1;
	}
	for (let o = 0; o < p.k; o++) {
		const target = o === hoverOrbit ? ORBIT_HOVER_GROW : 1;
		const d = target - scales[o];
		scales[o] = Math.abs(d) < 0.01 ? target : scales[o] + d * ORBIT_HOVER_DAMP;
	}

	ctx.strokeStyle = style.dark ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.55)";
	ctx.lineWidth = 1;
	// Two passes, so a grown orbit sits on top of its at-rest neighbours instead of being clipped by
	// whichever dot happens to be drawn later.
	const enlarged: number[] = [];
	for (let y = span.y0; y <= span.y1 + 1; y++) {
		for (let x = span.x0; x <= span.x1 + 1; x++) {
			const o = p.orbit[coset(p, x, y)];
			if (o < p.k && scales[o] > 1.001) {
				enlarged.push(x, y, o);
				continue;
			}
			ctx.beginPath();
			ctx.arc(sx(x), sy(y), r, 0, Math.PI * 2);
			ctx.fillStyle = vertexColour(o, style.dark);
			ctx.fill();
			ctx.stroke();
		}
	}
	for (let i = 0; i < enlarged.length; i += 3) {
		const o = enlarged[i + 2];
		ctx.beginPath();
		ctx.arc(sx(enlarged[i]), sy(enlarged[i + 1]), r * scales[o], 0, Math.PI * 2);
		ctx.fillStyle = vertexColour(o, style.dark);
		ctx.fill();
		ctx.stroke();
	}
}
