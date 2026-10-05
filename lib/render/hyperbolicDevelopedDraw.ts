// Draw an engine-developed hyperbolic tiling patch (Poincaré coordinates from the Čtrnáct SU(1,1)
// developer, tools/ctrnact-oracle/develop_hyperbolic.py) to a 2D canvas under an SU(1,1) view isometry.
// This is the explicit-geometry renderer that replaces the (2,p,q) fold shader for the hyperbolic shelf:
// the fold shader can only draw regular {p,q}, whereas a developed patch is an arbitrary regular-faced
// tiling (mixed tiles, any vertex configuration). Möbius maps geodesics to geodesics, so panning is just
// su11Apply on each vertex followed by re-drawing the geodesic edges between the moved endpoints.
//
// Pure drawing (no React, no store) so it is shared by the interactive canvas and the static thumbnail.

import { type Su11, tileHue } from "@/lib/render/hyperbolic";
import { tileHueRgb01 } from "@/lib/render/hueRing";

/**
 * A stroke colour under the same depth shade the fill gets.
 *
 * The rim shade is a lamp over the whole disk, so it has to fall on the ink as well as the paper. It used
 * to fall only on the fill, which inverted the figure halfway out: a fill running from luma 0.86 at the
 * centre to 0.55 at the rim, against a stroke pinned at 0.76, gave lines that read darker than their tile
 * in the middle, vanished into it at r = 0.61, and read lighter than it outside. Scaling both by `dim`
 * holds the ratio constant at every radius. Mirrors `ink` in the shader (hyperbolicPerPixelGL.ts), which
 * this path is byte-matched against.
 *
 * `dim` of 1 returns the colour untouched, which is what the no-fill mode passes: there the background is
 * flat, so shading the ink would invent a gradient instead of matching one.
 */
function shadeStroke(hex: string, dim: number): string {
	if (dim >= 0.999) return hex;
	const h = hex.slice(1);
	const w = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
	const n = Number.parseInt(w, 16);
	const r = Math.round(((n >> 16) & 255) * dim);
	const g = Math.round(((n >> 8) & 255) * dim);
	const b = Math.round((n & 255) * dim);
	return `rgb(${r},${g},${b})`;
}

export interface Darts {
	rneig: number[];
	glue: number[];
	lvert: number[];
	seed: number;
}

/**
 * A row of the shipped catalogue (public/hyperbolic-developed.json): the tiling's quotient half-edge
 * structure and its forced edge length, with NO baked geometry.
 *
 * The file used to carry developed vertices/faces as well, but every render path — the per-pixel
 * walk, the 2D fallback, the thumbnails — works from the darts
 * under the current view anyway, so the baked copy was dead weight that nothing read. At ~1000 tilings
 * it would also have been a 10 MB eager fetch against 0.2 MB for the darts.
 */
export interface CataloguePatch {
	id: string;
	name: string;
	config: string;
	edge: number;
	/** Tiles in the reference development — a size hint for the UI, not geometry. */
	tiles: number;
	darts: Darts;
}

/** Developed geometry: what HyperbolicDeveloper.develop() hands back, and what drawDevelopedPatch draws. */
export interface DevelopedPatch {
	id: string;
	name: string;
	config: string;
	edge: number;
	vertices: [number, number][];
	faces: number[][];
	tiles: number;
	darts?: Darts;
}

const SEG = 14; // cap on geodesic tessellation per edge (the big central tiles still reach it)
const TWO_PI = 2 * Math.PI;
const SAG_PX = 0.35; // max polyline sagitta in device px; under this a chord reads as the exact arc

/**
 * Poincaré geodesic arc a→b as a polyline, subdivided just finely enough that its sagitta stays under
 * SAG_PX at the device-pixel scale `R`, and never past SEG.
 *
 * The arc inside the disk is always the MINOR arc at the orthogonal circle's centre C: that circle meets
 * the unit circle at an angle 2·arccos(r/|C|), which is < π because r < |C| = √(1+r²). So the short
 * angular step IS the geodesic, with no need to test candidates.
 *
 * The catch is the wrap. JS `%` keeps the DIVIDEND's sign, so the previous `((tb-ta+π) % 2π) - π` returned
 * a step outside (-π, π] whenever tb-ta < -π, which is 4.2% of edges on a 3.4.17.4 board. The shipped code
 * covered for that by building BOTH arcs at full resolution and keeping whichever stayed nearer the origin,
 * paying double the trigonometry plus a hypot per point on every edge. Normalising the step properly picks
 * the same arc (verified bit-identical over 53,368 edges across two views) for half the work.
 *
 * Subdividing by size matters because the fixed 14 segments were spent mostly on rim tiles a few pixels
 * across: the median edge's 1-segment sagitta is 0.06 px at a 565 px disk, so most edges need no
 * subdivision at all, while the big central tiles still get the full 14.
 */
/** Longest screen span a single tapered piece may cover. Small enough that the width steps between
 *  consecutive pieces stay under a pixel, large enough that a full patch is still one cheap pass. */
const TAPER_SEG_PX = 6;

/**
 * Poincaré geodesic a→b as a polyline in disk units, written into `out` as [x0, y0, x1, y1, …] with both
 * ends included; returns the point count. Subdivided just finely enough that the sagitta stays under
 * SAG_PX at the device-pixel scale `R`, never past SEG. See the note above on why the short angular step
 * IS the geodesic. A diameter comes back as its two ends: the chord is the geodesic.
 */
function geodesicInto(out: number[], ax: number, ay: number, bx: number, by: number, R: number): number {
	const det = ax * by - ay * bx;
	out[0] = ax;
	out[1] = ay;
	// A chord under 1.5 px cannot bow by SAG_PX whatever its circle, and most sides of a full disk are
	// that small: they are the rim. They skip the circle and its two atan2.
	if (Math.abs(det) < 1e-9 || ((bx - ax) ** 2 + (by - ay) ** 2) * R * R < 2.25) {
		out[2] = bx;
		out[3] = by;
		return 2;
	}
	const r1 = (ax * ax + ay * ay + 1) / 2;
	const r2 = (bx * bx + by * by + 1) / 2;
	const ox = (r1 * by - r2 * ay) / det;
	const oy = (ax * r2 - bx * r1) / det;
	const rad = Math.sqrt(Math.max(ox * ox + oy * oy - 1, 0));
	const ta = Math.atan2(ay - oy, ax - ox);
	let d = (Math.atan2(by - oy, bx - ox) - ta) % TWO_PI;
	if (d > Math.PI) d -= TWO_PI;
	else if (d < -Math.PI) d += TWO_PI;
	// sagitta of an n-chord approximation ≈ ρ·d²/(8n²) px, with ρ = rad·R the arc's pixel radius
	const n = Math.max(1, Math.min(SEG, Math.ceil(Math.abs(d) * Math.sqrt((rad * R) / (8 * SAG_PX)))));
	for (let i = 1; i < n; i++) {
		const t = ta + d * (i / n);
		out[2 * i] = ox + rad * Math.cos(t);
		out[2 * i + 1] = oy + rad * Math.sin(t);
	}
	out[2 * n] = bx;
	out[2 * n + 1] = by;
	return n + 1;
}

/** Screen positions of a patch's vertices under `view`, flat [x0, y0, …] in disk units: (az + b)/(b̄z + ā). */
function transformVerts(V: [number, number][], view: Su11): Float64Array {
	const { x: ar, y: ai } = view.a;
	const { x: br, y: bi } = view.b;
	const out = new Float64Array(V.length * 2);
	for (let i = 0; i < V.length; i++) {
		const x = V[i][0];
		const y = V[i][1];
		const nr = ar * x - ai * y + br;
		const ni = ar * y + ai * x + bi;
		const dr = br * x + bi * y + ar;
		const di = br * y - bi * x - ai;
		const dd = dr * dr + di * di;
		out[2 * i] = (nr * dr + ni * di) / dd;
		out[2 * i + 1] = (ni * dr - nr * di) / dd;
	}
	return out;
}

/** Shade and width are functions of the radius alone, quantised to this many levels. At 128 the fill
 *  steps by at most one 8-bit value and a stroke by under 2% of its width, so a bucket per level draws
 *  what a style per face did. */
const LEVELS = 128;

/**
 * Subpaths grouped by style, so a patch costs one fill or stroke per style and not one per face: a
 * 3.4.17.4 board at the 30k budget went from 2,500 fills and 13,000 strokes a frame to under 300 of both.
 * Faces sharing a bucket also fill as one region, with no antialiasing seam along the sides they share.
 * A bucket is a flat list of pixel coordinates in which NaN opens a new subpath.
 */
class Batch {
	private readonly buckets = new Map<number, number[]>();
	at(key: number): number[] {
		let b = this.buckets.get(key);
		if (!b) this.buckets.set(key, (b = []));
		return b;
	}
	/** Trace each bucket as the current path and hand its key to `paint`, which fills and/or strokes. */
	each(ctx: CanvasRenderingContext2D, paint: (key: number) => void): void {
		for (const [key, b] of this.buckets) {
			ctx.beginPath();
			for (let i = 0; i < b.length; ) {
				if (b[i] !== b[i]) {
					ctx.moveTo(b[i + 1], b[i + 2]);
					i += 3;
				} else {
					ctx.lineTo(b[i], b[i + 1]);
					i += 2;
				}
			}
			paint(key);
		}
	}
}

/** Append `face` to the bucket `keyOf` picks from its centroid radius, as one subpath of geodesic sides
 *  that ends on its own first point. closePath on a path of thousands of subpaths was a tenth of a frame;
 *  a fill closes them itself, and a stroke with round caps and joins cannot tell the difference. */
function pushFace(b: Batch, keyOf: (dep: number) => number, face: number[], tv: Float64Array, o: DrawOpts): void {
	const sides = face.length;
	let ccx = 0;
	let ccy = 0;
	for (const idx of face) {
		ccx += tv[2 * idx];
		ccy += tv[2 * idx + 1];
	}
	const out = b.at(keyOf(Math.min(1, Math.hypot(ccx / sides, ccy / sides))));
	out.push(NaN);
	const first = out.length;
	for (let i = 0; i < sides; i++) {
		const u = face[i];
		const v = face[(i + 1) % sides];
		const n = geodesicInto(SCRATCH, tv[2 * u], tv[2 * u + 1], tv[2 * v], tv[2 * v + 1], o.R);
		for (let k = 0; k < n - 1; k++) out.push(o.cx + SCRATCH[2 * k] * o.R, o.cy - SCRATCH[2 * k + 1] * o.R);
	}
	out.push(out[first], out[first + 1]);
}
const SCRATCH: number[] = [];
const level = (dep: number): number => Math.round(dep * (LEVELS - 1));
const depOf = (key: number): number => (key % LEVELS) / (LEVELS - 1);
const rgb = (r: number, g: number, b: number, dim: number): string =>
	`rgb(${Math.round(r * dim * 255)},${Math.round(g * dim * 255)},${Math.round(b * dim * 255)})`;

export interface DrawOpts {
	/** Disk radius in device px. */
	R: number;
	/** Disk centre in device px. */
	cx: number;
	cy: number;
	dark: boolean;
	/** Draw the surrounding disk boundary + background (true for the main view, false for a transparent thumbnail). */
	frame?: boolean;
	/** false = edges only (fill each tile with the surface colour). Default true. */
	showFill?: boolean;
	/** Tile saturation 0–100, the Fill slider. Omitted ⇒ the palette default. See showFill for 0. */
	fillSatPct?: number;
	/** global hue rotation (deg) from the hue ring. */
	hueOffset?: number;
	/** stroke width in device px. Default ~R·0.006. */
	strokePx?: number;
	/** true = taper the stroke toward the rim with the tiles (geometry line mode). */
	taper?: boolean;
}

/** Draw the patch under `view` (an SU(1,1) isometry: identity = centred). Clips to the disk so nothing
 *  spills past the rim, shades each tile lighter toward the centre (the fold shader's depth feel), and
 *  strokes geodesic edges. */
export function drawDevelopedPatch(
	ctx: CanvasRenderingContext2D,
	patch: DevelopedPatch,
	view: Su11,
	opts: DrawOpts,
): void {
	const { R, cx, cy, dark } = opts;
	const tv = transformVerts(patch.vertices, view);
	const bg = dark ? "#14110d" : "#faf8f5";

	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, cy, R, 0, 2 * Math.PI);
	if (opts.frame) {
		ctx.fillStyle = bg;
		ctx.fill();
	}
	ctx.clip();

	// PER-TILE depth: one shade per tile, dimmed by its centre's screen radius (dim = 1 − 0.5·r²), the
	// shader / euclidean / spherical fill (tileHueRgb01·dim, theme-independent). A bucket is (sides, level).
	const batch = new Batch();
	for (const face of patch.faces) pushFace(batch, (dep) => face.length * LEVELS + level(dep), face, tv, opts);
	const showFill = opts.showFill !== false;
	batch.each(ctx, (key) => {
		const dep = depOf(key);
		const [fr, fg, fb] = tileHueRgb01(tileHue(Math.floor(key / LEVELS)) + (opts.hueOffset ?? 0), opts.fillSatPct);
		ctx.fillStyle = showFill ? rgb(fr, fg, fb, 1 - 0.5 * dep * dep) : bg;
		ctx.fill();
	});
	// Perspective width: the exact conformal factor (1 − r²) at the tile's centre with the same 3× overall
	// boost as the shader (AL-tuned final law: metric-exact thinning, thicker base). baseW ≤ 0 (slider at
	// 0) = no stroke at all: the 0.35 floor must not resurrect it. Strokes go after EVERY fill, so no
	// face paints over the half of a neighbour's stroke that lies on its side.
	const baseW = opts.strokePx ?? Math.max(1, R * 0.006);
	if (baseW > 0.01) {
		ctx.lineJoin = "round";
		ctx.lineCap = "round";
		batch.each(ctx, (key) => {
			const dep = depOf(key);
			ctx.strokeStyle = shadeStroke(dark ? "#000" : "#111", showFill ? 1 - 0.5 * dep * dep : 1);
			ctx.lineWidth = opts.taper ? Math.max(0.35, baseW * 3 * (1 - dep * dep)) : baseW;
			ctx.stroke();
		});
	}
	ctx.restore();

	if (opts.frame) {
		ctx.beginPath();
		ctx.arc(cx, cy, R, 0, 2 * Math.PI);
		ctx.strokeStyle = dark ? "#3a342b" : "#222";
		ctx.lineWidth = Math.max(1.5, R * 0.008);
		ctx.stroke();
	}
}

/** A developed hyperbolic EDGE pattern: base faces coloured by merged-tile orbit, plus the edge list
 *  with per-edge drawn flags. What HyperbolicDeveloper.developEdges() hands back. */
export interface DevelopedEdgePatch {
	id: string;
	name: string;
	config: string;
	edge: number;
	vertices: [number, number][];
	faces: number[][];
	faceOrbit: number[];
	edges: [number, number, number][];
	tiles: number;
}

/** Draw a developed hyperbolic edge pattern under `view`. Two layers, matching the /freedraw look moved
 *  to the Poincaré disk: fill each base face by its MERGED-TILE orbit hue (so one tile reads as one
 *  region), then stroke edges — drawn edges bold (the tile boundaries the user "drew"), undrawn edges a
 *  faint scaffold (the underlying uniform tiling). `showFill=false` drops the fill for a line-only view;
 *  `showScaffold=false` hides the undrawn grid. */
export function drawDevelopedEdgePatch(
	ctx: CanvasRenderingContext2D,
	patch: DevelopedEdgePatch,
	view: Su11,
	opts: DrawOpts & {
		showScaffold?: boolean;
		/** Colored-tiling mode: fill each face by `palette[faceOrbit]` (the color index) instead of a
		 *  merged-tile orbit hue. Every edge is already flagged drawn=1 by developColors, so all strokes
		 *  are bold and the scaffold pass draws nothing. RGB 0..255 per color. */
		palette?: [number, number, number][];
	},
): void {
	const { R, cx, cy, dark } = opts;
	const tv = transformVerts(patch.vertices, view);
	const bg = dark ? "#14110d" : "#faf8f5";

	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, cy, R, 0, 2 * Math.PI);
	if (opts.frame) {
		ctx.fillStyle = bg;
		ctx.fill();
	}
	ctx.clip();

	const showFill = opts.showFill !== false;
	const pal = opts.palette;

	// EDGE patterns: paint the disk ONCE as a radial gradient and skip the per-face fill entirely.
	//
	// ⚑ Per-face shading is what "each polygon has its own shade" actually was, and dropping the per-orbit
	// hue did not fix it. `dim` here is a function of the face CENTROID, so every polygon gets one flat
	// value and the mosaic survives in brightness even when every face shares a hue. The GL path has no
	// such problem — its edge branch shades per PIXEL — so a record drawn there looked smooth and one
	// drawn here did not. Same shelf, two renderers, two different pictures.
	//
	// The gradient stops sample the shader's own 1 − 0.5r² at sixteen radii, so the two paths agree to
	// within a linear interpolation between neighbouring stops. Colourings keep the per-face fill below:
	// there the fill IS the catalogued object, not a backdrop.
	if (showFill && !pal) {
		const [gr, gg, gb] = tileHueRgb01(tileHue(2) + (opts.hueOffset ?? 0));
		const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
		for (let s = 0; s <= 16; s++) {
			const t = s / 16;
			grad.addColorStop(t, rgb(gr, gg, gb, 1 - 0.5 * t * t));
		}
		ctx.fillStyle = grad;
		ctx.fillRect(cx - R, cy - R, R * 2, R * 2); // inside the disk clip set above
	}

	if (pal) {
		const colour = (i: number) => pal[i] ?? pal[pal.length - 1];
		// APEIROGONS arrive as a pair [vertex, ideal point ξ] (HyperbolicDeveloper.traceFaced). An apeirogon
		// lies inside the horodisk through its vertices, which in this model is a Euclidean circle tangent
		// to the rim at ξ, and the caps the circle adds belong to the neighbouring tiles, painted over it
		// below. One circle each, whatever the depth: inside a cusp the sides in view grow like e^depth.
		const disks = new Map<number, number[]>(); // colour index -> [x, y, r, …] in px
		for (let fi = 0; showFill && fi < patch.faces.length; fi++) {
			const face = patch.faces[fi];
			if (face.length !== 2) continue;
			const px = tv[2 * face[0]];
			const py = tv[2 * face[0] + 1];
			const ex = tv[2 * face[1]];
			const ey = tv[2 * face[1] + 1];
			const rho = ((px - ex) ** 2 + (py - ey) ** 2) / (2 * (1 - (px * ex + py * ey)));
			let d = disks.get(patch.faceOrbit[fi]);
			if (!d) disks.set(patch.faceOrbit[fi], (d = []));
			d.push(cx + ex * (1 - rho) * R, cy - ey * (1 - rho) * R, rho * R);
		}
		for (const [c, d] of disks) {
			const [r, g, b] = colour(c);
			ctx.beginPath();
			for (let i = 0; i < d.length; i += 3) {
				ctx.moveTo(d[i] + d[i + 2], d[i + 1]);
				ctx.arc(d[i], d[i + 1], d[i + 2], 0, TWO_PI);
			}
			ctx.fillStyle = rgb(r / 255, g / 255, b / 255, 0.86);
			ctx.fill();
		}
		// Fill: a bucket is (colour index, level). Colors mode dims less toward the rim (pale fills stay
		// legible), matching the shader's colors branch.
		const fills = new Batch();
		for (let fi = 0; fi < patch.faces.length; fi++) {
			const face = patch.faces[fi];
			if (face.length < 3) continue;
			const c = showFill ? patch.faceOrbit[fi] : 0;
			pushFace(fills, (dep) => c * LEVELS + (showFill ? level(dep) : 0), face, tv, opts);
		}
		fills.each(ctx, (key) => {
			const dep = depOf(key);
			const [r, g, b] = colour(Math.floor(key / LEVELS));
			ctx.fillStyle = showFill ? rgb(r / 255, g / 255, b / 255, 1 - 0.28 * dep * dep) : bg;
			ctx.fill();
		});
	}

	// Edge pass: drawn edges bold (tile boundaries), undrawn edges a faint scaffold (the base tiling).
	const showScaffold = opts.showScaffold !== false;
	const baseW = opts.strokePx ?? Math.max(1, R * 0.006);
	if (baseW > 0.01) {
		// PER SEGMENT, not per edge. Width and shade are both functions of the radius, and an edge spans a
		// range of radii, so one value for the whole edge steps at every vertex: two edges meeting there
		// were sized from their own midpoints, which sit at different depths. Walking the geodesic's own
		// polyline and sizing each piece at ITS midpoint makes the width agree from both sides of a vertex,
		// which is the continuity the per-pixel shader gets for free. Pieces are at most TAPER_SEG_PX long,
		// so a DIAMETER, whose polyline is its two ends, tapers like every curved edge. A bucket is
		// (drawn, level); scaffold buckets come first, so drawn edges land on top.
		const strokes = new Batch();
		for (const [a, b, drawn] of patch.edges) {
			if (drawn !== 1 && !showScaffold) continue;
			const n = geodesicInto(SCRATCH, tv[2 * a], tv[2 * a + 1], tv[2 * b], tv[2 * b + 1], R);
			for (let k = 1; k < n; k++) {
				const x0 = SCRATCH[2 * k - 2];
				const y0 = SCRATCH[2 * k - 1];
				const x1 = SCRATCH[2 * k];
				const y1 = SCRATCH[2 * k + 1];
				const m = Math.max(1, Math.min(64, Math.ceil((Math.hypot(x1 - x0, y1 - y0) * R) / TAPER_SEG_PX)));
				for (let j = 0; j < m; j++) {
					const ux = x0 + ((x1 - x0) * j) / m;
					const uy = y0 + ((y1 - y0) * j) / m;
					const vx = x0 + ((x1 - x0) * (j + 1)) / m;
					const vy = y0 + ((y1 - y0) * (j + 1)) / m;
					const out = strokes.at(drawn * LEVELS + level(Math.min(1, Math.hypot((ux + vx) / 2, (uy + vy) / 2))));
					const sx = cx + ux * R;
					const sy = cy - uy * R;
					// a piece that starts where the bucket's last one ended continues its subpath
					if (out[out.length - 2] !== sx || out[out.length - 1] !== sy) out.push(NaN, sx, sy);
					out.push(cx + vx * R, cy - vy * R);
				}
			}
		}
		ctx.lineJoin = "round";
		ctx.lineCap = "round"; // round caps close the joins between consecutive pieces
		for (const drawnPass of [0, 1])
			strokes.each(ctx, (key) => {
				if (Math.floor(key / LEVELS) !== drawnPass) return;
				const dep = depOf(key);
				const w = drawnPass ? baseW * 3 : baseW * 1.2;
				const passCol = drawnPass ? (dark ? "#000" : "#111") : dark ? "#4a4436" : "#c9c2b4";
				ctx.strokeStyle = shadeStroke(passCol, showFill ? (pal ? 1 - 0.28 * dep * dep : 1 - 0.5 * dep * dep) : 1);
				ctx.lineWidth = opts.taper ? Math.max(0.35, w * (1 - dep * dep)) : w;
				ctx.stroke();
			});
	}
	ctx.restore();

	if (opts.frame) {
		ctx.beginPath();
		ctx.arc(cx, cy, R, 0, 2 * Math.PI);
		ctx.strokeStyle = dark ? "#3a342b" : "#222";
		ctx.lineWidth = Math.max(1.5, R * 0.008);
		ctx.stroke();
	}
}

let _cache: Promise<Record<string, CataloguePatch>> | null = null;

/** Load and index the tiling catalogue (public/hyperbolic-developed.json) by id, once. */
export function loadDevelopedPatches(): Promise<Record<string, CataloguePatch>> {
	if (!_cache) {
		_cache = fetch("/hyperbolic-developed.json")
			.then((r) => r.json() as Promise<CataloguePatch[]>)
			.then((arr) => Object.fromEntries(arr.map((p) => [p.id, p])));
	}
	return _cache;
}
