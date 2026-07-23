// Canvas 2D renderer for freedraw patterns.
//
// Why not the flat WebGL path (lib/render/flatTilingGL.ts): that pipeline consumes a fundamental cell
// as a LIST OF POLYGONS and fan-triangulates each from its centroid. A freedraw tile can be an
// infinite strip (no centroid, no vertex list) or an annulus (not star-shaped), so it has no polygon
// representation at all. The fix is to stop drawing tiles and draw the grid instead: fill unit CELLS
// coloured by which face they belong to, and stroke the drawn edges as line segments. Every degenerate
// case then renders correctly with no special-casing, and the whole thing is line art, so 2D canvas is
// fast enough and a tenth of the code. Promoting it to the GL path later is mechanical.

import { analyseFaces, classifyFaces, classifyPatchFaces, type FaceAnalysis } from "./faces";
import { coset, gridOf, type FreedrawPattern } from "./pattern";

export interface FreedrawView {
	/** World coordinates at the canvas centre. */
	cx: number;
	cy: number;
	/** Pixels per grid unit. */
	scale: number;
}

// Lattice basis per grid: world = (x + bx*y, by*y). Square is the identity; the triangular lattice
// has e2 at 60°, so bx = 1/2 and by = √3/2. Pan/zoom stay in world (euclidean) coordinates — only
// the lattice-to-world map changes, and every straight lattice line stays straight through it.
const SQRT3_2 = Math.sqrt(3) / 2;
const basisOf = (p: FreedrawPattern) =>
	gridOf(p) === "triangle" ? { bx: 0.5, by: SQRT3_2 } : { bx: 0, by: 1 };

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
	 * Drawn-edge stroke width in CSS px, constant at every zoom, and 0 drops the stroke entirely — the
	 * exact same contract as the flat canvas's Line stroke slider (uHalfStrokePx = lineWidth/2), which
	 * reads the same store field. At lineWidth 1 a freedraw edge is 1 px, matching a normal tiling's edge.
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

function visibleSpan(
	width: number,
	height: number,
	view: FreedrawView,
	bx: number,
	by: number,
): Span {
	// Invert the basis at the view rect's corners: y = wy/by, x = wx - bx*y. On the square grid this
	// is the old axis-aligned span; on the skewed triangle basis the x extent widens with the shear.
	const halfW = width / (2 * view.scale);
	const halfH = height / (2 * view.scale);
	const yLo = (view.cy - halfH) / by;
	const yHi = (view.cy + halfH) / by;
	const xs = [
		view.cx - halfW - bx * yLo,
		view.cx - halfW - bx * yHi,
		view.cx + halfW - bx * yLo,
		view.cx + halfW - bx * yHi,
	];
	const x0 = Math.floor(Math.min(...xs)) - 1;
	const y0 = Math.floor(yLo) - 1;
	return {
		x0,
		x1: Math.min(Math.ceil(Math.max(...xs)) + 1, x0 + MAX_SPAN),
		y0,
		y1: Math.min(Math.ceil(yHi) + 1, y0 + MAX_SPAN),
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
	if (pattern.patch) {
		drawPatchPattern(ctx, width, height, pattern, view, style, hover, orbitScales);
		return;
	}
	const { scale } = view;
	const { bx, by } = basisOf(pattern);
	const tri = gridOf(pattern) === "triangle";
	// Lattice (x, y) -> screen px, through the world basis. On the square grid this is the old sx/sy.
	const px = (x: number, y: number) => width / 2 + (x + bx * y - view.cx) * scale;
	const py = (y: number) => height / 2 - (by * y - view.cy) * scale;
	const span = visibleSpan(width, height, view, bx, by);

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
				const c = coset(pattern, x, y);
				if (!tri) {
					ctx.fillStyle = fill[analysis.cellFace[c]];
					// +1px on the far edges so neighbouring cells of one face never show a seam.
					ctx.fillRect(px(x, y), py(y + 1), scale + 1, scale + 1);
					continue;
				}
				// Two triangles per lattice cell. Each is stroked hairline in its own fill colour so
				// same-face neighbours never show an antialiasing seam (the rect trick can't skew).
				ctx.lineWidth = 1;
				ctx.fillStyle = ctx.strokeStyle = fill[analysis.cellFace[2 * c]];
				ctx.beginPath();
				ctx.moveTo(px(x, y), py(y));
				ctx.lineTo(px(x + 1, y), py(y));
				ctx.lineTo(px(x, y + 1), py(y + 1));
				ctx.closePath();
				ctx.fill();
				ctx.stroke();
				ctx.fillStyle = ctx.strokeStyle = fill[analysis.cellFace[2 * c + 1]];
				ctx.beginPath();
				ctx.moveTo(px(x + 1, y), py(y));
				ctx.lineTo(px(x, y + 1), py(y + 1));
				ctx.lineTo(px(x + 1, y + 1), py(y + 1));
				ctx.closePath();
				ctx.fill();
				ctx.stroke();
			}
		}
	}

	if (style.showScaffold) {
		// Two (square) or three (triangle) straight line families; all stay straight under the basis.
		ctx.beginPath();
		for (let y = span.y0; y <= span.y1 + 1; y++) {
			ctx.moveTo(px(span.x0, y), py(y));
			ctx.lineTo(px(span.x1 + 1, y), py(y));
		}
		for (let x = span.x0; x <= span.x1 + 1; x++) {
			ctx.moveTo(px(x, span.y0), py(span.y0));
			ctx.lineTo(px(x, span.y1 + 1), py(span.y1 + 1));
		}
		if (tri) {
			// The w family: lines of constant x + y, entering at the top edge and leaving at the bottom.
			for (let s = span.x0 + span.y0; s <= span.x1 + span.y1 + 2; s++) {
				ctx.moveTo(px(s - span.y0, span.y0), py(span.y0));
				ctx.lineTo(px(s - span.y1 - 1, span.y1 + 1), py(span.y1 + 1));
			}
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
					ctx.moveTo(px(x, y), py(y));
					ctx.lineTo(px(x + 1, y), py(y));
				}
				if (pattern.v[c] === 1) {
					ctx.moveTo(px(x, y), py(y));
					ctx.lineTo(px(x, y + 1), py(y + 1));
				}
				if (tri && pattern.w?.[c] === 1) {
					ctx.moveTo(px(x, y), py(y));
					ctx.lineTo(px(x + 1, y - 1), py(y - 1));
				}
			}
		}
		ctx.strokeStyle = style.dark ? "#f2f4f8" : "#101318";
		// Constant CSS-px width, matching the flat canvas's outline (lineWidth px at any zoom) so a
		// freedraw edge and a normal tiling edge read the same weight at the same slider value.
		ctx.lineWidth = style.lineWidth;
		ctx.lineCap = "round";
		ctx.stroke();
	}

	if (style.showLattice) drawLattice(ctx, pattern, style, px, py, span);

	if (style.showVertices)
		drawOrbitDots(ctx, pattern, view, style, px, py, bx, by, span, hover, orbitScales);
}

/**
 * Combined-grid patches: explicit per-period geometry instanced over the T1/T2 lattice — the same
 * move as the fixed grids (draw one period's cells, stamp it across the view), with the lattice now
 * an arbitrary 2x2 basis instead of HNF-on-a-known-grid. Fills colour polygons by tile component, or by
 * shape/pose via classifyPatchFaces (congruent tiles share a hue), or by rank.
 */
function drawPatchPattern(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	pattern: FreedrawPattern,
	view: FreedrawView,
	style: FreedrawStyle,
	hover: { x: number; y: number } | null,
	orbitScales: number[],
): void {
	const patch = pattern.patch!;
	const { scale } = view;
	const [t1x, t1y] = patch.T1;
	const [t2x, t2y] = patch.T2;
	const det = t1x * t2y - t1y * t2x;
	const px = (x: number) => width / 2 + (x - view.cx) * scale;
	const py = (y: number) => height / 2 - (y - view.cy) * scale;

	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = style.dark ? "#12151a" : "#ffffff";
	ctx.fillRect(0, 0, width, height);
	if (Math.abs(det) < 1e-9) return;

	// Instance range: invert the basis at the view corners, pad by the patch's own diameter.
	const halfW = width / (2 * scale);
	const halfH = height / (2 * scale);
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
	// Runaway guard, same spirit as MAX_SPAN.
	if ((m1 - m0 + 1) * (n1 - n0 + 1) > 4000) return;

	const vx = (vi: number, ox: number, oy: number) => patch.verts[vi][0] + ox * t1x + oy * t2x;
	const vy = (vi: number, ox: number, oy: number) => patch.verts[vi][1] + ox * t1y + oy * t2y;

	if (style.fillMode !== "none") {
		const alpha = style.showVertices ? ORBIT_MODE_FILL_ALPHA : 1;
		// shape/pose merge congruent (resp. identically-posed) tiles from the patch geometry; orbit and
		// the default keep one hue per tile component; rank colours by finite/strip/unbounded.
		const classes =
			style.fillMode === "shape" || style.fillMode === "pose" ? classifyPatchFaces(patch) : null;
		const compFill = patch.compRank.map((r, i) =>
			style.fillMode === "rank"
				? rankColour(r, style.dark, alpha)
				: orbitColour(classes ? classes[style.fillMode as "shape" | "pose"][i] : i, style.dark, alpha),
		);
		for (let n = n0; n <= n1; n++) {
			for (let m = m0; m <= m1; m++) {
				for (let pi = 0; pi < patch.polys.length; pi++) {
					const ring = patch.polys[pi];
					ctx.fillStyle = ctx.strokeStyle = compFill[patch.polyComp[pi]];
					ctx.lineWidth = 1;
					ctx.beginPath();
					for (let ci = 0; ci < ring.length; ci++) {
						const [vi, ox, oy] = ring[ci];
						const x = px(vx(vi, ox + m, oy + n));
						const y = py(vy(vi, ox + m, oy + n));
						if (ci === 0) ctx.moveTo(x, y);
						else ctx.lineTo(x, y);
					}
					ctx.closePath();
					ctx.fill();
					ctx.stroke();
				}
			}
		}
	}

	// Scaffold (all edges thin) and drawn strokes, both from the same edge list.
	for (const pass of ["scaffold", "drawn"] as const) {
		if (pass === "scaffold" && !style.showScaffold) continue;
		if (pass === "drawn" && style.lineWidth <= 0) continue;
		ctx.beginPath();
		for (const [vi, vj, ox, oy, drawn] of patch.edges) {
			if ((pass === "drawn") !== (drawn === 1)) continue;
			for (let n = n0; n <= n1; n++) {
				for (let m = m0; m <= m1; m++) {
					ctx.moveTo(px(vx(vi, m, n)), py(vy(vi, m, n)));
					ctx.lineTo(px(vx(vj, ox + m, oy + n)), py(vy(vj, ox + m, oy + n)));
				}
			}
		}
		if (pass === "scaffold") {
			ctx.strokeStyle = style.dark ? "rgba(255,255,255,0.13)" : "rgba(0,0,0,0.13)";
			ctx.lineWidth = 1;
		} else {
			ctx.strokeStyle = style.dark ? "#f2f4f8" : "#101318";
			// Constant CSS-px width, matching the flat canvas — see the fixed-grid branch above.
			ctx.lineWidth = style.lineWidth;
			ctx.lineCap = "round";
		}
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
		// Hover: nearest patch vertex over the visible instances (the counts are small).
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
		if (orbitScales.length !== pattern.k) {
			orbitScales.length = pattern.k;
			for (let o = 0; o < pattern.k; o++) orbitScales[o] = 1;
		}
		for (let o = 0; o < pattern.k; o++) {
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
					ctx.fillStyle = orbitColour(o + 3, !style.dark);
					ctx.fill();
					ctx.stroke();
				}
			}
		}
	}
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
	px: (x: number, y: number) => number,
	py: (y: number) => number,
	span: Span,
): void {
	const accent = style.dark ? "hsl(345 90% 66%)" : "hsl(345 80% 46%)";

	// The origin cell, tinted so "this is the piece that repeats" reads without counting lines.
	ctx.beginPath();
	ctx.moveTo(px(0, 0), py(0));
	ctx.lineTo(px(p.a, 0), py(0));
	ctx.lineTo(px(p.a + p.b, p.d), py(p.d));
	ctx.lineTo(px(p.b, p.d), py(p.d));
	ctx.closePath();
	ctx.fillStyle = style.dark ? "hsl(345 90% 66% / 0.2)" : "hsl(345 80% 46% / 0.13)";
	ctx.fill();

	// Both families are clipped to the visible span, widened by one cell so a shear never stops short of
	// the corner it should reach. All the maths is in LATTICE coordinates, where every family is straight
	// lines; the basis map at the ctx calls keeps them straight in the world, square or triangular.
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
		ctx.moveTo(px(span.x0 - 1, n * p.d), py(n * p.d));
		ctx.lineTo(px(span.x1 + 2, n * p.d), py(n * p.d));
	}
	for (let m = m0; m <= m1; m++) {
		ctx.moveTo(px(m * p.a + shear * yLo, yLo), py(yLo));
		ctx.lineTo(px(m * p.a + shear * yHi, yHi), py(yHi));
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
	px: (x: number, y: number) => number,
	py: (y: number) => number,
	bx: number,
	by: number,
	span: Span,
	hover: { x: number; y: number } | null,
	scales: number[],
): void {
	const r = Math.max(1.6, Math.min(5, view.scale * 0.09));

	// Hit test: invert the basis to fractional lattice coords, then check the four surrounding grid
	// points — under the skewed triangle basis "round both" is not always the nearest point.
	let hoverOrbit = -1;
	if (hover) {
		const fy = hover.y / by;
		const fx = hover.x - bx * fy;
		// A generous pick radius: at the smallest dot size an exact hit is a 3px target.
		const pick = Math.max(r, 7);
		let bestD = pick * pick;
		for (const gx of [Math.floor(fx), Math.ceil(fx)]) {
			for (const gy of [Math.floor(fy), Math.ceil(fy)]) {
				const dx = (gx + bx * gy - hover.x) * view.scale;
				const dy = (by * gy - hover.y) * view.scale;
				const d2 = dx * dx + dy * dy;
				if (d2 <= bestD) {
					bestD = d2;
					hoverOrbit = p.orbit[coset(p, gx, gy)];
				}
			}
		}
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
			ctx.arc(px(x, y), py(y), r, 0, Math.PI * 2);
			ctx.fillStyle = vertexColour(o, style.dark);
			ctx.fill();
			ctx.stroke();
		}
	}
	for (let i = 0; i < enlarged.length; i += 3) {
		const o = enlarged[i + 2];
		ctx.beginPath();
		ctx.arc(px(enlarged[i], enlarged[i + 1]), py(enlarged[i + 1]), r * scales[o], 0, Math.PI * 2);
		ctx.fillStyle = vertexColour(o, style.dark);
		ctx.fill();
		ctx.stroke();
	}
}
