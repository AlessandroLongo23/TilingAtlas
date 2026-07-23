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

/** Poincaré geodesic arc a→b as a polyline of n+1 disk points. Picks the arc that stays inside the disk
 *  (the orthogonal circle has two arcs between a,b; the geodesic is the one bulging toward the centre). */
function geodesicPts(a: Complex, b: Complex, n: number): Complex[] {
	const oc = orthoCircle(a, b);
	if (!oc) {
		const out: Complex[] = [];
		for (let i = 0; i <= n; i++) {
			const t = i / n;
			out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
		}
		return out;
	}
	const ta = Math.atan2(a.y - oc.cy, a.x - oc.cx);
	const tb = Math.atan2(b.y - oc.cy, b.x - oc.cx);
	const d = ((tb - ta + Math.PI) % (2 * Math.PI)) - Math.PI; // short angular arc
	const build = (dd: number): Complex[] => {
		const o: Complex[] = [];
		for (let i = 0; i <= n; i++) {
			const t = ta + dd * (i / n);
			o.push({ x: oc.cx + oc.r * Math.cos(t), y: oc.cy + oc.r * Math.sin(t) });
		}
		return o;
	};
	const maxR = (pts: Complex[]): number => pts.reduce((m, q) => Math.max(m, Math.hypot(q.x, q.y)), 0);
	const A = build(d);
	const B = build(d > 0 ? d - 2 * Math.PI : d + 2 * Math.PI);
	return maxR(A) <= maxR(B) ? A : B;
}

const SEG = 14; // geodesic tessellation per edge — enough to look like an exact arc at any zoom

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
			const pts = geodesicPts(tv[face[i]], tv[face[(i + 1) % sides]], SEG);
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
