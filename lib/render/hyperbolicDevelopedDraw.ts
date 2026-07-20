// Draw an engine-developed hyperbolic tiling patch (Poincaré coordinates from the Čtrnáct SU(1,1)
// developer, tools/ctrnact-oracle/develop_hyperbolic.py) to a 2D canvas under an SU(1,1) view isometry.
// This is the explicit-geometry renderer that replaces the (2,p,q) fold shader for the hyperbolic shelf:
// the fold shader can only draw regular {p,q}, whereas a developed patch is an arbitrary regular-faced
// tiling (mixed tiles, any vertex configuration). Möbius maps geodesics to geodesics, so panning is just
// su11Apply on each vertex followed by re-drawing the geodesic edges between the moved endpoints.
//
// Pure drawing (no React, no store) so it is shared by the interactive canvas and the static thumbnail.

import { type Complex, type Su11, su11Apply, tileHue } from "@/lib/render/hyperbolic";

export interface DevelopedPatch {
	id: string;
	name: string;
	config: string;
	edge: number;
	vertices: [number, number][];
	faces: number[][];
	tiles: number;
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
		const dep = Math.min(1, Math.hypot(ccx, ccy));
		const hue = tileHue(sides);
		const light = dark ? 22 + 26 * (1 - dep) : 44 + 32 * (1 - dep);
		const sat = dark ? 38 : 46;
		ctx.fillStyle = `hsl(${hue} ${sat}% ${light}%)`;
		ctx.strokeStyle = edgeCol;
		ctx.lineWidth = Math.max(1, R * 0.006);
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
		ctx.stroke();
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

let _cache: Promise<Record<string, DevelopedPatch>> | null = null;

/** Load and index the developed-patch catalogue (public/hyperbolic-developed.json) by id, once. */
export function loadDevelopedPatches(): Promise<Record<string, DevelopedPatch>> {
	if (!_cache) {
		_cache = fetch("/hyperbolic-developed.json")
			.then((r) => r.json() as Promise<DevelopedPatch[]>)
			.then((arr) => Object.fromEntries(arr.map((p) => [p.id, p])));
	}
	return _cache;
}
