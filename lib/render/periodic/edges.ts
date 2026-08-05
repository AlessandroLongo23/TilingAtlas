// Edge patterns (Čtrnáct's freedraw) as a PeriodicCell. The class has no polygon cell — its faces can be
// infinite strips or unbounded sheets, which have no vertex list — so the fill is emitted PER GRID CELL,
// coloured by the face the cell belongs to. Same-face neighbours therefore share a colour and read as one
// merged tile, which is exactly what the 2D canvas draws (lib/freedraw/render.ts) and why that renderer
// also fills cell by cell, not face by face.
//
// Three layers, in paint order: cell fills, the scaffold (every grid edge, faint), the drawn edges on top.

import {
	classifyFaces,
	classifyPatchFaces,
	type FaceAnalysis,
} from "@/lib/freedraw/faces";
import { coset, gridOf, type Curve4, type FreedrawPattern } from "@/lib/freedraw/pattern";
import type { FillMode } from "@/lib/freedraw/render";
import { cubicAt, cubicFlatness, cubicSegmentCount, type Cubic } from "../cubic";
import type { PeriodicCell, PeriodicPrim } from "../periodicCell";
import { hslToRgb } from "./color";

const SQRT3_2 = Math.sqrt(3) / 2;

/** Golden-angle hue walk — the RGB twin of `orbitColour` in lib/freedraw/render.ts. */
const orbitRgb = (i: number, dark: boolean) =>
	hslToRgb((34 + i * 137.508) % 360, 46, dark ? 36 : 74);

/** Finite / strip / unbounded as three fixed hues — the RGB twin of `rankColour`. */
const rankRgb = (rank: 0 | 1 | 2, dark: boolean) =>
	hslToRgb(rank === 0 ? 150 : rank === 1 ? 40 : 265, 55, dark ? 32 : 76);

const scaffoldRgb = (dark: boolean): [number, number, number] => (dark ? [1, 1, 1] : [0, 0, 0]);
const drawnRgb = (dark: boolean): [number, number, number] =>
	dark ? [0.949, 0.957, 0.973] : [0.063, 0.075, 0.094]; // #f2f4f8 / #101318

const SCAFFOLD_ALPHA = 0.13;
/** Stroke weights relative to the global "Line stroke" slider. The drawn edges have to out-read the
 *  scaffold at every zoom, so they carry both the wider scale and full alpha. */
const DRAWN_SCALE = 1.4;
const SCAFFOLD_SCALE = 0.5;

/** Paint order within the cell. */
const Z_FILL = 0;
const Z_SCAFFOLD = 1;
const Z_DRAWN = 2;

export interface EdgesCellOptions {
	dark: boolean;
	fillMode: FillMode;
	showScaffold: boolean;
	/** The face analysis for this pattern (memoised by the caller — it walks the whole period). */
	analysis: FaceAnalysis;
}

export function edgesPeriodicCell(p: FreedrawPattern, opts: EdgesCellOptions): PeriodicCell | null {
	return p.patch ? patchCell(p, opts) : gridCell(p, opts);
}

function gridCell(p: FreedrawPattern, opts: EdgesCellOptions): PeriodicCell | null {
	const tri = gridOf(p) === "triangle";
	const bx = tri ? 0.5 : 0;
	const by = tri ? SQRT3_2 : 1;
	const wx = (x: number, y: number) => x + bx * y;
	const wy = (y: number) => -by * y;

	const { analysis } = opts;
	const classes =
		opts.fillMode === "shape" || opts.fillMode === "pose" ? classifyFaces(analysis) : null;
	const faceRgb = analysis.faces.map((f) =>
		opts.fillMode === "rank"
			? rankRgb(f.rank, opts.dark)
			: orbitRgb(classes ? classes[opts.fillMode as "shape" | "pose"][f.id] : f.id, opts.dark),
	);

	const prims: PeriodicPrim[] = [];
	const fillOf = (cellIdx: number) =>
		opts.fillMode === "none" ? undefined : faceRgb[analysis.cellFace[cellIdx]];

	for (let y = 0; y < p.d; y++) {
		for (let x = 0; x < p.a; x++) {
			const c = coset(p, x, y);
			if (tri) {
				const up = fillOf(2 * c);
				const down = fillOf(2 * c + 1);
				if (up) {
					prims.push({
						verts: [wx(x, y), wy(y), wx(x + 1, y), wy(y), wx(x, y + 1), wy(y + 1)],
						fillRgb: up, z: Z_FILL,
					});
				}
				if (down) {
					prims.push({
						verts: [wx(x + 1, y), wy(y), wx(x, y + 1), wy(y + 1), wx(x + 1, y + 1), wy(y + 1)],
						fillRgb: down, z: Z_FILL,
					});
				}
			} else {
				const f = fillOf(c);
				if (f) {
					prims.push({
						verts: [wx(x, y), wy(y), wx(x + 1, y), wy(y), wx(x + 1, y + 1), wy(y + 1), wx(x, y + 1), wy(y + 1)],
						fillRgb: f, z: Z_FILL,
					});
				}
			}

			// One segment per grid edge based at (x, y): east, north, and on the triangular grid the
			// downhill diagonal. Every edge gets a scaffold stroke; the drawn ones get a second, heavier
			// prim on top. (The shader keeps the STRONGEST stroke per pixel, so the drawn one wins where
			// both land, exactly as the 2D renderer's paint order does.)
			const seg = (x0: number, y0: number, x1: number, y1: number, drawn: boolean) => {
				const verts = [wx(x0, y0), wy(y0), wx(x1, y1), wy(y1)];
				if (opts.showScaffold) {
					prims.push({
						verts, open: true, strokeRgb: scaffoldRgb(opts.dark), strokeAlpha: SCAFFOLD_ALPHA,
						strokeScale: SCAFFOLD_SCALE, z: Z_SCAFFOLD,
					});
				}
				if (drawn) {
					prims.push({
						verts: [...verts], open: true, strokeRgb: drawnRgb(opts.dark), strokeAlpha: 1,
						strokeScale: DRAWN_SCALE, z: Z_DRAWN,
					});
				}
			};
			seg(x, y, x + 1, y, p.h[c] === 1);
			seg(x, y, x, y + 1, p.v[c] === 1);
			if (tri) seg(x, y, x + 1, y - 1, p.w?.[c] === 1);
		}
	}
	if (prims.length === 0) return null;

	return {
		v1: [wx(p.a, 0), wy(0)],
		v2: [wx(p.b, p.d), wy(p.d)],
		prims,
		feature: 1, // unit grid edges on both fixed grids
	};
}

/**
 * Flattening budget for a curved patch edge, as a fraction of that edge's own chord.
 *
 * Fixed, unlike the isohedral page's screen-space budget (lib/isohedral/build.ts), and it has to be:
 * the lens packs a cell ONCE and the conformal map then magnifies it by an amount that varies across
 * the screen and has no upper bound near the singularity, so there is no single zoom to tessellate
 * for. A relative budget is the honest answer — 0.4% of a chord stays under a pixel until you are
 * ~250× into one edge, by which point the shader is blending that region to the cell average anyway.
 *
 * Chosen so the deepest bow the sliders allow lands just under the cap below: at bulge ±0.5 the
 * canonical S curve has max|Δ²P| ≈ 1.52 chords, giving √(0.75·1.52/0.004) ≈ 17 segments.
 */
const ARC_TOL_FRAC = 0.004;
/** Per-arc cap. A board tile is at most a hexagon, so a ring stays well under the shader's
 *  MAX_VERTS_PER_PRIM of 256 (6 × 24 = 144) and no geometry is silently dropped. */
const MAX_ARC_SEGMENTS = 24;

function patchCell(p: FreedrawPattern, opts: EdgesCellOptions): PeriodicCell | null {
	const patch = p.patch!;
	const [t1x, t1y] = patch.T1;
	const [t2x, t2y] = patch.T2;
	const vx = (vi: number, ox: number, oy: number) => patch.verts[vi][0] + ox * t1x + oy * t2x;
	// Negated: the 2D canvas maps world y up through py(), the lens works in the p5 world where y is down.
	const vy = (vi: number, ox: number, oy: number) => -(patch.verts[vi][1] + ox * t1y + oy * t2y);

	/**
	 * One arc as a polyline, appended to `out` WITHOUT its endpoint.
	 *
	 * `curve` holds the two cubic control points as world offsets from the arc's start, in the patch's
	 * y-up frame — so the y component flips along with the endpoints above, and nothing else about the
	 * curve has to be re-derived. Null (every board but the parametric isohedral types) emits the start
	 * point alone, which is exactly the straight-edge behaviour this replaced.
	 */
	const arc = (
		curve: Curve4 | null | undefined,
		sx: number, sy: number, ex: number, ey: number,
		out: number[],
	) => {
		if (!curve) {
			out.push(sx, sy);
			return;
		}
		const c: Cubic = [
			{ x: sx, y: sy },
			{ x: sx + curve[0], y: sy - curve[1] },
			{ x: sx + curve[2], y: sy - curve[3] },
			{ x: ex, y: ey },
		];
		const chord = Math.hypot(ex - sx, ey - sy);
		const n = cubicSegmentCount(cubicFlatness(c), 1, ARC_TOL_FRAC * chord, MAX_ARC_SEGMENTS);
		for (let i = 0; i < n; i++) {
			const q = cubicAt(c, i / n);
			out.push(q.x, q.y);
		}
	};

	const classes =
		opts.fillMode === "shape" || opts.fillMode === "pose" ? classifyPatchFaces(patch) : null;
	const compRgb = patch.compRank.map((r, i) =>
		opts.fillMode === "rank"
			? rankRgb(r, opts.dark)
			: orbitRgb(classes ? classes[opts.fillMode as "shape" | "pose"][i] : i, opts.dark),
	);

	const prims: PeriodicPrim[] = [];
	const edgeLens: number[] = [];

	if (opts.fillMode !== "none") {
		for (let pi = 0; pi < patch.polys.length; pi++) {
			const ring = patch.polys[pi];
			const arcs = patch.polyCurves?.[pi];
			const verts: number[] = [];
			// One arc per side, INCLUDING the closing one, so a curved tile's last edge bows like the rest
			// instead of being straightened by the ring's implicit close — the same rule the 2D canvas
			// follows (lib/freedraw/render.ts).
			for (let ci = 0; ci < ring.length; ci++) {
				const [vi, ox, oy] = ring[ci];
				const [wi, wox, woy] = ring[(ci + 1) % ring.length];
				arc(arcs?.[ci], vx(vi, ox, oy), vy(vi, ox, oy), vx(wi, wox, woy), vy(wi, wox, woy), verts);
			}
			if (verts.length < 6) continue;
			prims.push({ verts, fillRgb: compRgb[patch.polyComp[pi]], z: Z_FILL });
		}
	}

	for (let ei = 0; ei < patch.edges.length; ei++) {
		const [vi, vj, ox, oy, drawn] = patch.edges[ei];
		const sx = vx(vi, 0, 0), sy = vy(vi, 0, 0);
		const ex = vx(vj, ox, oy), ey = vy(vj, ox, oy);
		edgeLens.push(Math.hypot(ex - sx, ey - sy));
		// An open polyline keeps its endpoint — there is no next arc to supply it.
		const verts: number[] = [];
		arc(patch.edgeCurves?.[ei], sx, sy, ex, ey, verts);
		verts.push(ex, ey);
		if (opts.showScaffold && drawn !== 1) {
			prims.push({
				verts, open: true, strokeRgb: scaffoldRgb(opts.dark), strokeAlpha: SCAFFOLD_ALPHA,
				strokeScale: SCAFFOLD_SCALE, z: Z_SCAFFOLD,
			});
		}
		if (drawn === 1) {
			prims.push({
				verts: [...verts], open: true, strokeRgb: drawnRgb(opts.dark), strokeAlpha: 1,
				strokeScale: DRAWN_SCALE, z: Z_DRAWN,
			});
		}
	}
	if (prims.length === 0) return null;

	edgeLens.sort((a, b) => a - b);
	return {
		v1: [t1x, -t1y],
		v2: [t2x, -t2y],
		prims,
		feature: edgeLens[edgeLens.length >> 1] || 1,
	};
}
