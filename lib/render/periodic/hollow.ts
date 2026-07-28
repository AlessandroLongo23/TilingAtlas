// Hollow tilings as a PeriodicCell. This is the class the IR's fill model exists for: the faces of a
// hollow tiling OVERLAP by construction (a {n/d} star straddles its own edge), so "which tile contains
// this point" has no single answer. Two things fall out of that:
//
//   nonzero winding — a self-intersecting {n/d} ring encloses its core more than once, and the
//                     even-odd rule would punch that core out as a hole. The 2D canvas fills with
//                     ctx.fill("nonzero") for the same reason.
//   alpha < 1       — overlapping faces accumulate, which is what makes the areal density visible.
//                     The shader composites fills in z order, so the stack reads the same as the
//                     canvas's repeated translucent fills.

import type { HollowFace, HollowPatch } from "@/lib/hollow/pattern";
import { fundamentalFaces, tileHue, type HollowFillMode } from "@/lib/hollow/render";
import type { PeriodicCell, PeriodicPrim } from "../periodicCell";
import { hslToRgb } from "./color";

/** Face fill alpha — the 0.30 the canvas uses for tile mode, and the fainter wash for density mode. */
const TILE_ALPHA = 0.3;
const DENSITY_ALPHA_DARK = 0.13;
const DENSITY_ALPHA_LIGHT = 0.11;

export interface HollowCellOptions {
	dark: boolean;
	fillMode: HollowFillMode;
}

export function hollowPeriodicCell(patch: HollowPatch, opts: HollowCellOptions): PeriodicCell | null {
	const L = patch.lattice;
	if (!L) return null;
	const [[ax, ay], [bx, by]] = L;

	const faces = fundamentalFaces(patch);
	if (faces.length === 0) return null;

	// The canvas draws with ctx.scale(zoom, −zoom) — y up. The lens works in the p5 world, y down.
	const strokeRgb: [number, number, number] = opts.dark ? [0.922, 0.933, 0.961] : [0.094, 0.11, 0.149];
	const densityRgb: [number, number, number] = opts.dark ? [0.549, 0.706, 1] : [0.157, 0.314, 0.706];

	const prims: PeriodicPrim[] = [];
	const edgeLens: number[] = [];
	faces.forEach((f: HollowFace, i: number) => {
		const verts: number[] = [];
		for (const [x, y] of f.v) verts.push(x, -y);
		for (let k = 0; k < f.v.length; k++) {
			const a = f.v[k];
			const b = f.v[(k + 1) % f.v.length];
			edgeLens.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
		}
		const fill =
			opts.fillMode === "none"
				? undefined
				: opts.fillMode === "density"
					? densityRgb
					: hslToRgb(tileHue(f.n, f.d), 72, opts.dark ? 60 : 54);
		prims.push({
			verts,
			fillRgb: fill,
			fillAlpha: fill
				? opts.fillMode === "density"
					? (opts.dark ? DENSITY_ALPHA_DARK : DENSITY_ALPHA_LIGHT)
					: TILE_ALPHA
				: 0,
			// The whole point of this class: a {n/d} ring winds more than once around its own core.
			nonzero: true,
			strokeRgb,
			strokeAlpha: 0.85,
			// Calibrated against the 2D canvas, which strokes 1.25 CSS px FULL width — at its default zoom
			// of 50 that is 0.0125 world units half-width, against the lens default of 0.042. Left at 1 the
			// outlines are 3× too fat, and on the dense patches (|v1| ≈ 0.5 with edge-1 faces, so ~100 faces
			// cover every point) the union of that many bands inks over the whole picture.
			strokeScale: 0.3,
			// z orders the FILLS only — the shader accumulates strokes in a separate layer that composites
			// over the finished fill, which is already the canvas's fill-all-then-stroke-all order.
			z: i,
		});
	});

	edgeLens.sort((a, b) => a - b);
	return {
		v1: [ax, -ay],
		v2: [bx, -by],
		prims,
		feature: edgeLens[edgeLens.length >> 1] || 1,
	};
}
