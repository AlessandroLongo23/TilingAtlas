import type { PeriodicCell, PeriodicPrim } from "./periodicCell";
import { hsb2rgb } from "./periodicCell";

// Static SVG for anything the periodic-cell IR can describe — tilings, colorings, edge patterns,
// hollow tilings, the Islamic construction — with an optional conformal map so the inversive lenses
// come out too. The CPU twin of the inversive shader (components/inversive-canvas.tsx): the shader
// walks pixels backwards through the lens into the fundamental cell, this walks lattice copies
// forwards through it into the picture.
//
// It exists for the same reason lib/render/tilingSvg.ts does: the error and 404 walls have to paint
// with no server data, no canvas and no WebGL context. tilingSvg covers one class (a translational
// cell of tiles); this covers all of them, because every Euclidean decoration already emits the IR
// for the lens. Runs at BUILD time (scripts/build-error-specimens.ts) — the wall ships the finished
// path data, so nothing here reaches the browser.
//
// The output is deliberately dumb: one <path> per (primitive, style), every lattice copy of it a
// subpath. For an unwarped picture the copies are translates, so they share one relative outline and
// each costs an "M x,y" — a few hundred tiles come out as a handful of DOM nodes. Under a warp the
// copies stop being congruent and each carries its own point list, which is why the warped specimens
// are framed tighter.

/** Cell point → output point, or `null` where the map is undefined (a pole, a branch it must not cross). */
export type PlaneMap = (x: number, y: number) => [number, number] | null;

export interface PeriodicSvgPath {
	d: string;
	fill?: string;
	fillOpacity?: number;
	/** Emitted for every fill EXCEPT the IR's `nonzero` prims — SVG's default is nonzero, the IR's is not. */
	fillRule?: "evenodd";
	stroke?: string;
	strokeOpacity?: number;
	/** User units, so it scales with the viewBox the way a world-space band does. */
	strokeWidth?: number;
}

export interface PeriodicSvg {
	viewBox: string;
	paths: PeriodicSvgPath[];
	/**
	 * Area-weighted average fill. The shader blends to this where the lens magnifies past resolving;
	 * here it is the backdrop the mapped copies sit on, so the places geometry cannot reach — the
	 * centre of an inversion, the eye of a spiral — read as the picture's own colour and not as a hole.
	 */
	background: string;
	/** Lattice copies actually drawn, for the generator's size budget. */
	pieces: number;
}

export interface PeriodicSvgOptions {
	/** Output viewBox as [minX, minY, width, height]. */
	view: [number, number, number, number];
	/**
	 * Cell-space region to instantiate lattice copies over, [minX, minY, maxX, maxY]. Defaults to
	 * `view`, which is right exactly when there is no map. Under a map it is the caller's job: only the
	 * caller knows which preimage fills the frame.
	 */
	world?: [number, number, number, number];
	map?: PlaneMap;
	/** Most segments an edge is ever cut into when `map` is set — straight edges do not stay straight
	 *  under a conformal map. The count actually used is per copy; see `detail`. */
	samples?: number;
	/**
	 * Output units a single segment should span, which is what turns `samples` into a per-copy count:
	 * a copy of output size `s` gets ceil(s / detail) segments an edge, capped at `samples`. Defaults to
	 * 1/60 of the view width, so a tile a sixtieth of the frame across is drawn straight and only the
	 * big ones near the rim pay for their curvature.
	 */
	detail?: number;
	/** Negate y before anything else. The tilings adapter works y-up, SVG and the other adapters y-down. */
	flipY?: boolean;
	/** Global hue rotation in degrees, applied to hue-driven fills only — the sidebar's hue ring. */
	hueOffset?: number;
	/** Stroke width at `strokeScale` 1, in the space `strokeSpace` names. */
	strokeWidth?: number;
	/**
	 * Which space `strokeWidth` is measured in. Only matters under a map, where the two diverge.
	 *
	 * "cell" (the default) is a band painted on the plane: the map magnifies it along with everything
	 * else, so a tile the lens has blown up carries a proportionally fat outline. "output" is a constant
	 * width in the finished picture, which is what the inversive shader does — its `uStrokeW` is in CSS
	 * pixels, so a stroke is the same weight wherever the lens has taken the tile it belongs to. Use
	 * "output" for a lens specimen; "cell" magnifies the rim tiles' outlines into black bands.
	 */
	strokeSpace?: "cell" | "output";
	/**
	 * Drop a mapped copy whose output bbox is smaller than this, in output units.
	 *
	 * The lenses are the reason it exists: a conformal map takes an infinite run of lattice copies into
	 * every neighbourhood of its pole, and past a fraction of a pixel each one is bytes for nothing. The
	 * shader stops resolving there too and blends to `background`, which is what the SVG then shows.
	 * Defaults to 1/400 of the view width.
	 */
	minSize?: number;
	/** Decimal places in the emitted path data. Default 3. */
	precision?: number;
	/** Hard stop, so a mis-set `world` cannot emit a million tiles into a source file. */
	maxPieces?: number;
}

type Fmt = (v: number) => string;

/** Fixed-point formatter, trailing zeros stripped and −0 folded so the output round-trips. */
const formatter = (decimals: number): Fmt => (v) => {
	const s = v.toFixed(decimals).replace(/\.?0+$/, "");
	return s === "-0" || s === "" ? "0" : s;
};

const css = (rgb: readonly [number, number, number]) =>
	`#${rgb.map((c) => Math.round(Math.min(Math.max(c, 0), 1) * 255).toString(16).padStart(2, "0")).join("")}`;

/** The fill the shader would paint, or null for a stroke-only prim. */
function fillOf(prim: PeriodicPrim, hueOffset: number): [number, number, number] | null {
	if (prim.open) return null;
	const hue = prim.hue ?? -1;
	if (hue >= 0) return hsb2rgb((hue + hueOffset) / 360, 0.4, 1);
	return prim.fillRgb ?? null;
}

function areaOf(verts: number[]): number {
	const n = verts.length >> 1;
	let a2 = 0;
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n;
		a2 += verts[2 * i] * verts[2 * j + 1] - verts[2 * j] * verts[2 * i + 1];
	}
	return Math.abs(a2) * 0.5;
}

function perimeterOf(pts: number[], open: boolean): number {
	const n = pts.length >> 1;
	let p = 0;
	for (let i = 0; i + 1 < n || (!open && i < n); i++) {
		const j = (i + 1) % n;
		if (open && j === 0) break;
		p += Math.hypot(pts[2 * j] - pts[2 * i], pts[2 * j + 1] - pts[2 * i + 1]);
	}
	return p;
}

/**
 * The outline as relative steps from its first point.
 *
 * Two reasons, both about size. Identical for every TRANSLATE of a prim, so the unwarped copies share
 * one of these and each costs only its own "M x,y". And a step is a short number where an absolute
 * coordinate is a long one, which is what a warped copy — sharing nothing — gets out of it.
 */
function relSteps(pts: number[], num: Fmt): string {
	const steps: string[] = [];
	for (let i = 1; i * 2 < pts.length; i++) {
		steps.push(`${num(pts[2 * i] - pts[2 * i - 2])},${num(pts[2 * i + 1] - pts[2 * i - 1])}`);
	}
	return `l${steps.join(" ")}`;
}

/** Each edge as `samples` steps, so a straight side bends the way the map bends it. */
function subdivide(verts: number[], open: boolean, samples: number): number[] {
	const n = verts.length >> 1;
	const out: number[] = [];
	const last = open ? n - 1 : n;
	for (let i = 0; i < last; i++) {
		const j = (i + 1) % n;
		const ax = verts[2 * i], ay = verts[2 * i + 1];
		const bx = verts[2 * j], by = verts[2 * j + 1];
		for (let s = 0; s < samples; s++) {
			const t = s / samples;
			out.push(ax + (bx - ax) * t, ay + (by - ay) * t);
		}
	}
	if (open) out.push(verts[2 * n - 2], verts[2 * n - 1]);
	return out;
}

/**
 * Local stroke width for a mapped copy.
 *
 * A conformal map has one scale factor at a point, and across a spiral it runs over decades — a
 * constant output-space stroke would ink the eye solid and vanish at the rim. The ratio of mapped to
 * unmapped perimeter is that factor averaged over the copy, which is the honest estimate available
 * without differentiating the map.
 *
 * Snapped to a √2 grid afterwards, which is what makes the picture cheap: a width is part of a path's
 * style, so an unsnapped one gives every copy its own <path> and its own copy of the fill and stroke
 * colours. Eight buckets cover three decades and the step is under the eye's threshold for a hairline.
 */
const WIDTH_STEP = Math.SQRT2;
function localWidth(base: number, mapped: number[], world: number[], open: boolean): number {
	const p0 = perimeterOf(world, open);
	const p1 = perimeterOf(mapped, open);
	if (p0 <= 0 || p1 <= 0) return base;
	const raw = base * (p1 / p0);
	if (!(raw > 0)) return base;
	const snapped = Math.pow(WIDTH_STEP, Math.round(Math.log(raw) / Math.log(WIDTH_STEP)));
	return Number(snapped.toPrecision(3));
}

export function periodicCellToSvg(cell: PeriodicCell | null, opts: PeriodicSvgOptions): PeriodicSvg | null {
	if (!cell || cell.prims.length === 0) return null;

	const sign = opts.flipY ? -1 : 1;
	const [v1x, v1y] = [cell.v1[0], sign * cell.v1[1]];
	const [v2x, v2y] = [cell.v2[0], sign * cell.v2[1]];
	const det = v1x * v2y - v2x * v1y;
	if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;

	// cell → lattice (a, b)
	const m00 = v2y / det, m01 = -v2x / det, m10 = -v1y / det, m11 = v1x / det;

	const [viewX, viewY, viewW, viewH] = opts.view;
	const world = opts.world ?? [viewX, viewY, viewX + viewW, viewY + viewH];
	const map = opts.map;
	const samples = Math.max(1, Math.round(opts.samples ?? 6));
	const hueOffset = opts.hueOffset ?? 0;
	const strokeBase = opts.strokeWidth ?? 0.03 * cell.feature;
	const strokeInOutput = opts.strokeSpace === "output";
	const maxPieces = opts.maxPieces ?? 20000;
	const minSize = opts.minSize ?? viewW / 400;
	const detail = opts.detail ?? viewW / 60;
	const num = formatter(opts.precision ?? 3);

	// Lattice bbox of the target region. The map is affine, so the box over the four mapped corners
	// contains every lattice coordinate the region can reach.
	let wa0 = Infinity, wa1 = -Infinity, wb0 = Infinity, wb1 = -Infinity;
	for (const [x, y] of [
		[world[0], world[1]], [world[2], world[1]], [world[0], world[3]], [world[2], world[3]],
	] as const) {
		const a = m00 * x + m01 * y;
		const b = m10 * x + m11 * y;
		if (a < wa0) wa0 = a;
		if (a > wa1) wa1 = a;
		if (b < wb0) wb0 = b;
		if (b > wb1) wb1 = b;
	}

	// Painter's order: z ascending, ties on array order — the order the shader's bucket walk composites in.
	const order = cell.prims.map((_, i) => i).sort((a, b) => (cell.prims[a].z ?? 0) - (cell.prims[b].z ?? 0) || a - b);

	// One entry per <path>: a style plus every subpath sharing it.
	//
	// Same-style pieces merge across the whole of a z LAYER, not just with the piece before them, which
	// is what keeps a warped specimen from paying its fill and stroke colours once per copy. Safe
	// because a layer is where the producers put geometry that does not overlap — the only class whose
	// copies deliberately cover each other is hollow, and its faces carry distinct z (and `nonzero`,
	// which opts out of merging entirely so the alpha still stacks). The layer boundary is honoured, so
	// nothing is ever lifted over a decoration meant to paint above it.
	interface Group { style: PeriodicSvgPath; parts: string[] }
	const groups: Group[] = [];
	let layer = new Map<string, Group>();
	let layerZ: number | null = null;
	const pushGroup = (style: PeriodicSvgPath, d: string, z: number) => {
		if (layerZ !== z) {
			layer = new Map();
			layerZ = z;
		}
		const key = styleKey(style);
		const hit = layer.get(key);
		if (hit) {
			hit.parts.push(d);
			return;
		}
		const group: Group = { style, parts: [d] };
		layer.set(key, group);
		groups.push(group);
	};

	let pieces = 0;
	let avgR = 0, avgG = 0, avgB = 0, avgW = 0;

	for (const pi of order) {
		const prim = cell.prims[pi];
		const n = prim.verts.length >> 1;
		if (n < 2) continue;

		// The prim in the renderer's frame, and its own bbox.
		const base: number[] = new Array(n * 2);
		let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
		for (let i = 0; i < n; i++) {
			const x = prim.verts[2 * i];
			const y = sign * prim.verts[2 * i + 1];
			base[2 * i] = x;
			base[2 * i + 1] = y;
			if (x < bx0) bx0 = x;
			if (x > bx1) bx1 = x;
			if (y < by0) by0 = y;
			if (y > by1) by1 = y;
		}

		const rgb = fillOf(prim, hueOffset);
		const fillAlpha = rgb ? (prim.fillAlpha ?? 1) : 0;
		const strokeRgb = prim.strokeRgb;
		const strokeAlpha = strokeRgb ? (prim.strokeAlpha ?? 1) : 0;
		if (fillAlpha <= 0 && strokeAlpha <= 0) continue;
		const width = strokeBase * (prim.strokeScale ?? 1);

		// Area-weighted average fill, the same reduction packPeriodicCell does for the shader's uAvg.
		if (rgb) {
			const w = areaOf(base) * fillAlpha;
			avgR += rgb[0] * w;
			avgG += rgb[1] * w;
			avgB += rgb[2] * w;
			avgW += w;
		}

		// Lattice shifts whose copy can meet the target region. Same reasoning as packPeriodicCell's
		// index: the shifted lattice box [pa0 + di, pa1 + di] has to overlap the region's.
		const corners = [[bx0, by0], [bx1, by0], [bx0, by1], [bx1, by1]] as const;
		let pa0 = Infinity, pa1 = -Infinity, pb0 = Infinity, pb1 = -Infinity;
		for (const [x, y] of corners) {
			const a = m00 * x + m01 * y;
			const b = m10 * x + m11 * y;
			if (a < pa0) pa0 = a;
			if (a > pa1) pa1 = a;
			if (b < pb0) pb0 = b;
			if (b > pb1) pb1 = b;
		}
		const di0 = Math.floor(wa0 - pa1), di1 = Math.ceil(wa1 - pa0);
		const dj0 = Math.floor(wb0 - pb1), dj1 = Math.ceil(wb1 - pb0);

		// Unwarped copies are translates: one outline, one "M" apiece.
		const rel = map ? null : relSteps(base, num);
		const open = prim.open === true;
		// Subdivisions are keyed by segment count, not built per copy: the count is chosen per copy from
		// how big that copy comes out (see below), but a given count recurs across hundreds of them.
		const subs = new Map<number, number[]>();
		const subFor = (s: number) => {
			let f = subs.get(s);
			if (!f) {
				f = subdivide(base, open, s);
				subs.set(s, f);
			}
			return f;
		};
		const closeMark = prim.open ? "" : "z";

		for (let dj = dj0; dj <= dj1; dj++) {
			for (let di = di0; di <= di1; di++) {
				const ox = di * v1x + dj * v2x;
				const oy = di * v1y + dj * v2y;
				if (bx1 + ox < world[0] || bx0 + ox > world[2]) continue;
				if (by1 + oy < world[1] || by0 + oy > world[3]) continue;
				if (pieces >= maxPieces) break;

				const style: PeriodicSvgPath = {
					d: "",
					...(rgb
						? {
								fill: css(rgb),
								...(fillAlpha < 1 ? { fillOpacity: fillAlpha } : {}),
								...(prim.nonzero ? {} : { fillRule: "evenodd" as const }),
							}
						: { fill: "none" }),
					...(strokeAlpha > 0
						? {
								stroke: css(strokeRgb!),
								...(strokeAlpha < 1 ? { strokeOpacity: strokeAlpha } : {}),
								strokeWidth: width,
							}
						: {}),
				};

				if (!map) {
					// A nonzero prim overlaps its own copies on purpose (the hollow class), and one <path>
					// would fill that union flat instead of stacking the alpha. Give each copy its own.
					const d = `M${num(base[0] + ox)},${num(base[1] + oy)}${rel!}${closeMark}`;
					if (prim.nonzero) groups.push({ style, parts: [d] });
					else pushGroup(style, d, prim.z ?? 0);
					pieces++;
					continue;
				}

				// Warped, and sized before it is drawn. A lens spreads one prim's copies over decades of
				// scale, so a segment count that flatters the two tiles at the rim is a hundredfold waste
				// on the thousand behind them. The corners alone give the copy's size, which picks the
				// count; only then is the outline subdivided and mapped in full.
				let rx0 = Infinity, ry0 = Infinity, rx1 = -Infinity, ry1 = -Infinity;
				let ok = true;
				for (let i = 0; i < n; i++) {
					const p = map(base[2 * i] + ox, base[2 * i + 1] + oy);
					if (!p) { ok = false; break; }
					if (p[0] < rx0) rx0 = p[0];
					if (p[0] > rx1) rx1 = p[0];
					if (p[1] < ry0) ry0 = p[1];
					if (p[1] > ry1) ry1 = p[1];
				}
				if (!ok) continue;
				const est = Math.max(rx1 - rx0, ry1 - ry0);
				// Below `minSize` the copy is smaller than the picture can show — see the option's note.
				// A bowed edge can push a little past the corners' box, hence the margin before the real
				// test below; this one only saves the work.
				if (est < minSize * 0.5) continue;
				const steps = Math.min(samples, Math.max(1, Math.ceil(est / detail)));
				const flat = subFor(steps);

				const out: number[] = [];
				const src: number[] = [];
				let ox0 = Infinity, oy0 = Infinity, ox1 = -Infinity, oy1 = -Infinity;
				for (let i = 0; i * 2 < flat.length; i++) {
					const wx = flat[2 * i] + ox;
					const wy = flat[2 * i + 1] + oy;
					const p = map(wx, wy);
					if (!p) { ok = false; break; }
					src.push(wx, wy);
					out.push(p[0], p[1]);
					if (p[0] < ox0) ox0 = p[0];
					if (p[0] > ox1) ox1 = p[0];
					if (p[1] < oy0) oy0 = p[1];
					if (p[1] > oy1) oy1 = p[1];
				}
				if (!ok || out.length < 4) continue;
				if (ox1 < viewX || ox0 > viewX + viewW || oy1 < viewY || oy0 > viewY + viewH) continue;
				if (Math.max(ox1 - ox0, oy1 - oy0) < minSize) continue;

				const w =
					strokeAlpha > 0 && !strokeInOutput
						? localWidth(width, out, src, prim.open === true)
						: undefined;
				const warped: PeriodicSvgPath = { ...style, ...(w !== undefined ? { strokeWidth: w } : {}) };
				const d = `M${num(out[0])},${num(out[1])}${relSteps(out, num)}${closeMark}`;
				if (prim.nonzero) groups.push({ style: warped, parts: [d] });
				else pushGroup(warped, d, prim.z ?? 0);
				pieces++;
			}
		}
	}

	if (pieces === 0) return null;

	const avg: [number, number, number] = avgW > 0 ? [avgR / avgW, avgG / avgW, avgB / avgW] : [0.5, 0.5, 0.5];

	return {
		viewBox: `${num(viewX)} ${num(viewY)} ${num(viewW)} ${num(viewH)}`,
		paths: groups.map((g) => ({ ...g.style, d: g.parts.join("") })),
		background: css(avg),
		pieces,
	};
}

/** Everything about a path except its geometry — two pieces sharing it can share one <path>. */
const styleKey = (s: PeriodicSvgPath) =>
	`${s.fill}|${s.fillOpacity}|${s.fillRule}|${s.stroke}|${s.strokeOpacity}|${s.strokeWidth}`;

// ── The two conformal lenses, forward ────────────────────────────────────────────────────────────
//
// The shader runs these backwards (screen → cell, so it can reduce a pixel into the fundamental
// domain); geometry has to run them forwards. Both are complex-analytic, so a tile keeps its shape
// and only its size changes — which is what makes the pictures worth drawing at all.

const TAU = Math.PI * 2;

/**
 * Circle inversion of radius `r` about the origin: z ↦ r²·z/|z|².
 *
 * An involution, so it is its own inverse and matches the shader's `v = uR²·s/|s|²` exactly. The
 * origin has no image — a neighbourhood of it goes to infinity — so the map returns null there and
 * the disc it cannot reach is left to `background`.
 */
export function inversionMap(r: number): PlaneMap {
	const r2 = r * r;
	return (x, y) => {
		const d = x * x + y * y;
		if (d < 1e-9) return null;
		return [(r2 * x) / d, (r2 * y) / d];
	};
}

/**
 * Kaplan's spiral (tactile-js/spirals), forward: the shader's `world = K·(log w − V)` solved for w,
 * i.e. w = exp(world/K).
 *
 * K = S/(2πi) for the seam S = a·v₁ + b·v₂, so one full turn of the image advances the preimage by
 * exactly one lattice translation and the picture closes on itself — for any (a, b), which is the
 * property the seam is chosen for. `scale` sizes the image of the world origin.
 *
 * `outer` bounds the image radius. The exponential runs away fast, and the caller's world box is a
 * blunt instrument for stopping it: a box wide enough to reach the eye of the spiral is also wide
 * enough to throw thousands of copies far past the frame. Culling on the image is exact.
 */
export function spiralMapForward(seam: [number, number], scale: number, outer: number): PlaneMap {
	// K = (S.y, −S.x)/2π; world = K·m ⇒ m = world/K.
	const kx = seam[1] / TAU;
	const ky = -seam[0] / TAU;
	const kk = kx * kx + ky * ky;
	if (kk < 1e-18) return () => null;
	const maxLog = Math.log(outer / scale);
	return (x, y) => {
		// m = world / K (complex division)
		const mx = (x * kx + y * ky) / kk;
		const my = (y * kx - x * ky) / kk;
		if (mx > maxLog) return null;
		const r = Math.exp(mx) * scale;
		return [r * Math.cos(my), r * Math.sin(my)];
	};
}
