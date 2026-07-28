// The Islamic (Hankin) construction as a PeriodicCell — all five styles.
//
// This was the worst of the lens's silent gaps: `isIslamic` was never force-cleared like the other
// decorations, so switching the lens on with the construction up simply dropped it and showed the bare
// tiling, with nothing in the UI to say so (components/canvas.tsx gated both Islamic WebGL layers on
// `!cfg.inversive`).
//
// It reuses the SAME geometry the flat renderers build, one step earlier in the pipeline:
//
//   plain / checkerboard   the arrangement's faces (extractFaces → colorFacesAbc or twoColorFaces),
//                          filtered to the origin lattice cell exactly as buildInstancedIslamicMesh
//                          does, plus the construction segments as strokes
//   interlace / outline    buildIslamicInterlace's woven `Band`s: a convex body polygon per band and a
//   / emboss               quad per border segment. The over/under weave is already baked into the band
//                          geometry (an under strand's side edges stop on the over strand's border line),
//                          so it survives the port with no z-ordering of its own.
//
// Faces reach past the origin cell — straps cross tile edges — and that is fine: each periodic face has
// exactly one representative here, its lattice copies are the other cells' representatives, and the
// packer's index registers a primitive under every lattice shift that brings it into the unit cell.

import type { Vector } from "@/classes/Vector";
import { buildTilingFromCell } from "@/lib/render/buildPatchTiling";
import { latticeCellOf } from "@/lib/render/buildIslamicMesh";
import { latticeBasisFromCell } from "@/lib/render/flatView";
import { tileHueRgb01 } from "@/lib/render/hueRing";
import { colorFacesAbc, extractFaces, type Marker, type Segment } from "@/lib/utils/islamicArrangement";
import {
	buildIslamicInterlace,
	strapWidthScale,
	type Band,
	type OutlineSeg,
} from "@/lib/utils/islamicInterlace";
import { twoColorFaces } from "@/lib/utils/islamicInterlace";
import { islamicNormalAngleFromSlider } from "@/lib/utils/islamicNoise";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import type { TranslationalCellData as AlgoCellData } from "@/classes/algorithm/types";
import type { PeriodicCell, PeriodicPrim } from "../periodicCell";

/** Cells of context around the origin — the same constant components/islamic-canvas.tsx pools over, so
 *  the construction sees the same neighbourhood and produces the same faces. */
const PATCH_MARGIN = 3;

/** Strap palette, matching components/strap-canvas.tsx (hsb01 of the p5 colours). */
const hsb01 = (h: number, s: number, b: number): [number, number, number] => {
	const ss = s / 100, bb = b / 100, hh = ((h % 360) + 360) / 60;
	const k = (n: number) => {
		const x = (n + hh) % 6;
		return Math.min(Math.max(Math.abs(x - 3) - 1, 0), 1);
	};
	return [bb * (1 - ss + k(0) * ss), bb * (1 - ss + k(4) * ss), bb * (1 - ss + k(2) * ss)];
};
const FILL_PLAIN = hsb01(40, 12, 96);
const FILL_EMBOSS = hsb01(40, 28, 74);
const BORDER_DARK = hsb01(28, 22, 14);
const EMBOSS_HIGHLIGHT = hsb01(45, 10, 100);
const EMBOSS_SHADOW = hsb01(35, 45, 26);
const EMBOSS_LIGHT = { x: -0.6, y: 0.8 };

const STRAP_STYLES = {
	interlace: { weave: true, emboss: false },
	outline: { weave: false, emboss: false },
	emboss: { weave: true, emboss: true },
} as const;

export type IslamicStyle = "plain" | "checkerboard" | "interlace" | "outline" | "emboss";

export interface IslamicCellOptions {
	style: IslamicStyle;
	/** Slider values, already in store units — clamped here exactly as the canvases clamp them. */
	angle: number;
	edgeOffset: number;
	intersectionCount: number;
	bandWidth: number;
	outlineWidth: number;
	chirality: boolean;
	checkerHueA: number;
	checkerHueB: number;
	fillHueB: number;
	fillHueC: number;
}

export function islamicPeriodicCell(
	cell: TranslationalCellData | null, opts: IslamicCellOptions,
): PeriodicCell | null {
	if (!cell) return null;
	const { v1, v2 } = latticeBasisFromCell(cell);
	if (Math.abs(v1.x * v2.y - v2.x * v1.y) < 1e-12) return null;

	const patch = buildTilingFromCell(cell as unknown as AlgoCellData, PATCH_MARGIN, PATCH_MARGIN, null, null);
	const theta = islamicNormalAngleFromSlider(Math.min(Math.max(opts.angle, 0), 90));
	const offset = Math.min(Math.max(opts.edgeOffset, 0), 100) / 100;
	const count = Math.min(Math.max(Math.round(opts.intersectionCount), 1), 3);
	const splitCrossings = offset > 0 || count > 1;

	const strap = STRAP_STYLES[opts.style as keyof typeof STRAP_STYLES];
	const prims = strap
		? strapPrims(patch, theta, offset, count, opts, strap.weave, strap.emboss, splitCrossings, v1, v2)
		: facePrims(patch, theta, offset, count, opts, splitCrossings, v1, v2);
	if (!prims || prims.length === 0) return null;

	// The construction's length scale, not the tile's: the straps and their borders are sized off the
	// median segment, so the stroke width and centre fade should track the same ruler.
	return { v1: [v1.x, v1.y], v2: [v2.x, v2.y], prims, feature: featureOf(prims) };
}

/** Median primitive edge length — the resolution scale the shader's stroke width and centre fade use. */
function featureOf(prims: PeriodicPrim[]): number {
	const lens: number[] = [];
	for (const p of prims) {
		const n = p.verts.length >> 1;
		for (let i = 0; i < n; i++) {
			const j = (i + 1) % n;
			if (p.open && j === 0) continue;
			lens.push(Math.hypot(p.verts[2 * j] - p.verts[2 * i], p.verts[2 * j + 1] - p.verts[2 * i + 1]));
		}
	}
	if (lens.length === 0) return 1;
	lens.sort((a, b) => a - b);
	return lens[lens.length >> 1] || 1;
}

const centroidOf = (vs: readonly Vector[]): [number, number] => {
	let cx = 0, cy = 0;
	for (const v of vs) { cx += v.x; cy += v.y; }
	return [cx / vs.length, cy / vs.length];
};

const inOriginCell = (cx: number, cy: number, v1: Vector, v2: Vector) => {
	const [i, j] = latticeCellOf(cx, cy, [v1.x, v1.y], [v2.x, v2.y]);
	return i === 0 && j === 0;
};

/** Pool the construction segments over the patch — the shared first step of both branches. */
function poolSegments(
	patch: ReturnType<typeof buildTilingFromCell>, theta: number, offset: number, count: number,
	withMarkers: boolean,
): { segments: Segment[]; markers: Marker[] } {
	const segments: Segment[] = [];
	const markers: Marker[] = [];
	for (const node of patch.nodes) {
		if (!node.vertices || !node.halfways) continue;
		for (const s of node.calculateIslamicSegments(theta, offset, count, withMarkers)) segments.push(s);
		if (withMarkers) for (const m of node.islamicMarkers()) markers.push(m);
	}
	return { segments, markers };
}

/** Plain (A/B/C) and checkerboard: filled arrangement faces plus the black construction lines. */
function facePrims(
	patch: ReturnType<typeof buildTilingFromCell>, theta: number, offset: number, count: number,
	opts: IslamicCellOptions, splitCrossings: boolean, v1: Vector, v2: Vector,
): PeriodicPrim[] {
	const { segments, markers } = poolSegments(patch, theta, offset, count, true);
	const faces = extractFaces(segments, splitCrossings);
	const prims: PeriodicPrim[] = [];

	if (opts.style === "checkerboard") {
		const colors = twoColorFaces(faces);
		const a = tileHueRgb01(opts.checkerHueA);
		const b = tileHueRgb01(opts.checkerHueB);
		faces.forEach((f, fi) => {
			const [cx, cy] = centroidOf(f.vertices);
			if (!inOriginCell(cx, cy, v1, v2)) return;
			prims.push({ verts: flat(f.vertices), fillRgb: colors[fi] === 0 ? a : b, z: 0 });
		});
	} else {
		const { faces: abc, degenerate } = colorFacesAbc(faces, markers);
		const bRgb = tileHueRgb01(opts.fillHueB);
		const cRgb = tileHueRgb01(opts.fillHueC);
		for (const { face, klass, hue } of abc) {
			const [cx, cy] = centroidOf(face.vertices);
			if (!inOriginCell(cx, cy, v1, v2)) continue;
			// Class A keeps the TILE HUE, so it stays live under the sidebar's hue ring exactly as the flat
			// shader does (its fill branch is the same hsb(h, 0.40, 1.0)). B and C are literal colours; when
			// the A/B split is degenerate, C collapses into B — the two-tone fallback.
			if (klass === "A") prims.push({ verts: flat(face.vertices), hue, z: 0 });
			else if (klass === "C" && !degenerate) prims.push({ verts: flat(face.vertices), fillRgb: cRgb, z: 0 });
			else prims.push({ verts: flat(face.vertices), fillRgb: bRgb, z: 0 });
		}
	}

	// The construction lines themselves, black, matching drawIslamicStarFill's border.
	for (const [a, b] of segments) {
		if (!inOriginCell((a.x + b.x) / 2, (a.y + b.y) / 2, v1, v2)) continue;
		prims.push({
			verts: [a.x, a.y, b.x, b.y], open: true,
			strokeRgb: [0, 0, 0], strokeAlpha: 1, strokeScale: 0.6, z: 1,
		});
	}
	return prims;
}

/** Interlace / outline / emboss: the woven band bodies and their borders. */
function strapPrims(
	patch: ReturnType<typeof buildTilingFromCell>, theta: number, offset: number, count: number,
	opts: IslamicCellOptions, weave: boolean, emboss: boolean, splitCrossings: boolean,
	v1: Vector, v2: Vector,
): PeriodicPrim[] {
	const { segments } = poolSegments(patch, theta, offset, count, false);
	const scale = strapWidthScale(segments);
	const width = Math.max(1e-6, opts.bandWidth * scale);
	const border = Math.max(0, opts.outlineWidth * scale);
	const { bands } = buildIslamicInterlace(segments, {
		width, border, startUnder: opts.chirality, squareCap: true, weave, splitCrossings,
	});

	const bodyRgb = emboss ? FILL_EMBOSS : FILL_PLAIN;
	const borderColorOf = emboss
		? (s: OutlineSeg) => (s.n.x * EMBOSS_LIGHT.x + s.n.y * EMBOSS_LIGHT.y > 0 ? EMBOSS_HIGHLIGHT : EMBOSS_SHADOW)
		: () => BORDER_DARK;

	const prims: PeriodicPrim[] = [];
	for (const band of bands as Band[]) {
		if (band.fill.length < 3) continue;
		const [cx, cy] = centroidOf(band.fill);
		if (!inOriginCell(cx, cy, v1, v2)) continue;
		prims.push({ verts: flat(band.fill), fillRgb: bodyRgb, z: 0 });
		// Each border segment is a world-space quad spanning the fill ring (a→b) to the outer ring
		// (oa→ob), so it keeps its proportion to the band at every zoom — a screen-width stroke would
		// not, and under the lens that difference is the whole picture.
		for (const seg of band.outline) {
			const col = borderColorOf(seg);
			prims.push({
				verts: [seg.a.x, seg.a.y, seg.b.x, seg.b.y, seg.ob.x, seg.ob.y, seg.oa.x, seg.oa.y],
				fillRgb: col as [number, number, number],
				z: 1,
			});
		}
	}
	return prims;
}

const flat = (vs: readonly Vector[]): number[] => {
	const out: number[] = [];
	for (const v of vs) out.push(v.x, v.y);
	return out;
};
