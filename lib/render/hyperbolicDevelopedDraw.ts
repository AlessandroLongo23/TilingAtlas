// Draw an engine-developed hyperbolic tiling patch (Poincaré coordinates from the Čtrnáct SU(1,1)
// developer, tools/ctrnact-oracle/develop_hyperbolic.py) to a 2D canvas under an SU(1,1) view isometry.
// This is the explicit-geometry renderer that replaces the (2,p,q) fold shader for the hyperbolic shelf:
// the fold shader can only draw regular {p,q}, whereas a developed patch is an arbitrary regular-faced
// tiling (mixed tiles, any vertex configuration). Möbius maps geodesics to geodesics, so panning is just
// su11Apply on each vertex followed by re-drawing the geodesic edges between the moved endpoints.
//
// Pure drawing (no React, no store) so it is shared by the interactive canvas and the static thumbnail.

import { type Complex, type Su11, su11Apply, tileHue } from "@/lib/render/hyperbolic";
import { tileHueRgb01 } from "@/lib/render/hueRing";

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
 * Dirichlet renderer, the 2D fallback, the thumbnails, the Islamic bake — re-develops from the darts
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
	/**
	 * Per-pixel renderability, stamped by scripts/stamp-hyperbolic-certification.ts. False means
	 * buildDirichletDomain refuses this tiling (its deck orbit needs developing past the float64 safety
	 * rim — the big-ℓ tail lands at Rdev ≈ 11 > 10.6) and clients go straight to the 2D developed
	 * renderer instead of paying the ~0.2–1 s doomed certification attempt. Capability metadata, not
	 * catalog policy: the tiling itself is real and ships. Absent = untried (legacy file) → attempt.
	 */
	certified?: boolean;
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

/** Circle orthogonal to the unit circle through disk points a,b, or null for a diameter (a,b,0 collinear). */
function orthoCircle(a: Complex, b: Complex): { cx: number; cy: number; r: number } | null {
	const det = a.x * b.y - a.y * b.x;
	if (Math.abs(det) < 1e-9) return null;
	const r1 = (a.x * a.x + a.y * a.y + 1) / 2;
	const r2 = (b.x * b.x + b.y * b.y + 1) / 2;
	const cx = (r1 * b.y - r2 * a.y) / det;
	const cy = (a.x * r2 - b.x * r1) / det;
	return { cx, cy, r: Math.sqrt(Math.max(cx * cx + cy * cy - 1, 0)) };
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
function geodesicPts(a: Complex, b: Complex, R: number): Complex[] {
	const oc = orthoCircle(a, b);
	if (!oc) return [a, b]; // a diameter: the chord IS the geodesic, subdivision cannot improve it
	const ta = Math.atan2(a.y - oc.cy, a.x - oc.cx);
	const tb = Math.atan2(b.y - oc.cy, b.x - oc.cx);
	let d = (tb - ta) % TWO_PI;
	if (d > Math.PI) d -= TWO_PI;
	else if (d < -Math.PI) d += TWO_PI;
	// sagitta of an n-chord approximation ≈ ρ·d²/(8n²) px, with ρ = oc.r·R the arc's pixel radius
	const n = Math.max(1, Math.min(SEG, Math.ceil(Math.abs(d) * Math.sqrt((oc.r * R) / (8 * SAG_PX)))));
	const out: Complex[] = new Array(n + 1);
	for (let i = 0; i <= n; i++) {
		const t = ta + d * (i / n);
		out[i] = { x: oc.cx + oc.r * Math.cos(t), y: oc.cy + oc.r * Math.sin(t) };
	}
	return out;
}


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
	const V = patch.vertices;
	// transform every vertex once per frame
	const tv: Complex[] = new Array(V.length);
	for (let i = 0; i < V.length; i++) tv[i] = su11Apply(view, { x: V[i][0], y: V[i][1] });
	const toPx = (p: Complex): [number, number] => [cx + p.x * R, cy - p.y * R];

	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, cy, R, 0, 2 * Math.PI);
	if (opts.frame) {
		ctx.fillStyle = dark ? "#14110d" : "#faf8f5";
		ctx.fill();
	}
	ctx.clip();

	const edgeCol = dark ? "#000" : "#111";
	for (const face of patch.faces) {
		const sides = face.length;
		// depth = transformed centroid radius; lighter toward the centre
		let ccx = 0, ccy = 0;
		for (const idx of face) {
			ccx += tv[idx].x;
			ccy += tv[idx].y;
		}
		ccx /= sides;
		ccy /= sides;
		// PER-TILE depth: one shade per tile, dimmed by its centre's screen radius (dim = 1 − 0.5·r²) —
		// byte-identical to the shader / euclidean / spherical fill (HSB(h,0.40,1.0)·dim, theme-independent).
		const dep = Math.min(1, Math.hypot(ccx, ccy));
		const dim = 1 - 0.5 * dep * dep;
		const [fr, fg, fb] = tileHueRgb01(tileHue(sides) + (opts.hueOffset ?? 0));
		ctx.fillStyle =
			opts.showFill === false
				? dark
					? "#14110d"
					: "#faf8f5"
				: `rgb(${Math.round(fr * dim * 255)},${Math.round(fg * dim * 255)},${Math.round(fb * dim * 255)})`;
		ctx.strokeStyle = edgeCol;
		const baseW = opts.strokePx ?? Math.max(1, R * 0.006);
		// Perspective width: the exact conformal factor (1 − r²) at the tile's centre with the same
		// 3× overall boost as the shader (AL-tuned final law: metric-exact thinning, thicker base).
		// baseW ≤ 0 (slider at 0) = no stroke at all — the 0.35 floor must not resurrect it.
		const drawStroke = baseW > 0.01;
		ctx.lineWidth = drawStroke ? (opts.taper ? Math.max(0.35, baseW * 3 * Math.pow(1 - dep * dep, 1.0)) : baseW) : 0;
		ctx.lineJoin = "round";
		ctx.beginPath();
		let started = false;
		for (let i = 0; i < sides; i++) {
			const pts = geodesicPts(tv[face[i]], tv[face[(i + 1) % sides]], R);
			for (const p of pts) {
				const [px, py] = toPx(p);
				if (!started) {
					ctx.moveTo(px, py);
					started = true;
				} else {
					ctx.lineTo(px, py);
				}
			}
		}
		ctx.closePath();
		ctx.fill();
		if (drawStroke) ctx.stroke();
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
	const V = patch.vertices;
	const tv: Complex[] = new Array(V.length);
	for (let i = 0; i < V.length; i++) tv[i] = su11Apply(view, { x: V[i][0], y: V[i][1] });
	const toPx = (p: Complex): [number, number] => [cx + p.x * R, cy - p.y * R];
	const bg = dark ? "#14110d" : "#faf8f5";

	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, cy, R, 0, 2 * Math.PI);
	if (opts.frame) {
		ctx.fillStyle = bg;
		ctx.fill();
	}
	ctx.clip();

	// Fill pass: one hue per merged-tile orbit, dimmed toward the rim exactly like drawDevelopedPatch.
	const showFill = opts.showFill !== false;
	for (let fi = 0; fi < patch.faces.length; fi++) {
		const face = patch.faces[fi];
		const sides = face.length;
		let ccx = 0;
		let ccy = 0;
		for (const idx of face) {
			ccx += tv[idx].x;
			ccy += tv[idx].y;
		}
		ccx /= sides;
		ccy /= sides;
		const dep = Math.min(1, Math.hypot(ccx, ccy));
		// Colors mode dims less toward the rim (pale fills stay legible), matching the shader's colors branch.
		const dim = opts.palette ? 1 - 0.28 * dep * dep : 1 - 0.5 * dep * dep;
		const [fr, fg, fb] = opts.palette
			? (opts.palette[patch.faceOrbit[fi]] ?? opts.palette[opts.palette.length - 1]).map((c) => c / 255) as [number, number, number]
			: tileHueRgb01(tileHue(patch.faceOrbit[fi] + 2) + (opts.hueOffset ?? 0));
		ctx.beginPath();
		let started = false;
		for (let i = 0; i < sides; i++) {
			const pts = geodesicPts(tv[face[i]], tv[face[(i + 1) % sides]], R);
			for (const p of pts) {
				const [px, py] = toPx(p);
				if (!started) {
					ctx.moveTo(px, py);
					started = true;
				} else {
					ctx.lineTo(px, py);
				}
			}
		}
		ctx.closePath();
		ctx.fillStyle = showFill
			? `rgb(${Math.round(fr * dim * 255)},${Math.round(fg * dim * 255)},${Math.round(fb * dim * 255)})`
			: bg;
		ctx.fill();
	}

	// Edge pass: drawn edges bold (tile boundaries), undrawn edges a faint scaffold (the base tiling).
	const showScaffold = opts.showScaffold !== false;
	const drawnCol = dark ? "#000" : "#111";
	const scaffoldCol = dark ? "#4a4436" : "#c9c2b4";
	const baseW = opts.strokePx ?? Math.max(1, R * 0.006);
	if (baseW > 0.01) {
		ctx.lineJoin = "round";
		ctx.lineCap = "round";
		for (let pass = 0; pass < 2; pass++) {
			const drawnPass = pass === 1; // scaffold first, drawn edges on top
			if (drawnPass ? false : !showScaffold) continue;
			ctx.strokeStyle = drawnPass ? drawnCol : scaffoldCol;
			for (const [a, b, drawn] of patch.edges) {
				if ((drawn === 1) !== drawnPass) continue;
				const mid = { x: (tv[a].x + tv[b].x) / 2, y: (tv[a].y + tv[b].y) / 2 };
				const dep = Math.min(1, Math.hypot(mid.x, mid.y));
				const w = drawnPass ? baseW * 3 : baseW * 1.2;
				ctx.lineWidth = opts.taper ? Math.max(0.35, w * Math.pow(1 - dep * dep, 1.0)) : w;
				const pts = geodesicPts(tv[a], tv[b], R);
				ctx.beginPath();
				let started = false;
				for (const p of pts) {
					const [px, py] = toPx(p);
					if (!started) {
						ctx.moveTo(px, py);
						started = true;
					} else {
						ctx.lineTo(px, py);
					}
				}
				ctx.stroke();
			}
		}
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
