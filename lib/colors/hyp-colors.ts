// Hyperbolic colored tilings (Marek Čtrnáct, 2026-07): the colors object moved to H². A pattern is a
// periodic n-coloring of a regular {p,q} hyperbolic tiling — every face is a real tile carrying one of n
// colors, `k` counts COLORED vertex classes (vertices equivalent only under symmetries that preserve the
// coloring, Marek's "Number of vertices"). Same convention as the Euclidean colors class (lib/colors),
// and the same disk machinery as the hyperbolic edge systems: decoded to darts by
// tools/ctrnact-oracle/develop_hyp_colors.py, re-developed per view by
// lib/render/hyperbolicDevelopClient.ts::developColors, drawn by the per-pixel shader in colors mode
// (R = color index → palette) or the 2D fallback.
//
// Unlike the edge systems there is NO drawn/undrawn split: every {p,q} edge is a tile boundary. The
// content is the color field — the `faceColor` array on the darts (one color index per quotient dart,
// constant along a base face).

import type { Darts } from "@/lib/render/hyperbolicDevelopClient";

/** The base regular {p,q} tiling a coloring decorates — the sub-axis, one per solver family. */
export interface HypColorsBase {
	/** Stable id used in record ids and the sub-axis key, e.g. "73". */
	id: string;
	/** Display label, e.g. "{7,3}". */
	label: string;
	/** k slices eager-loaded on entering the Hyperbolic geometry (small — a couple of MB total). */
	eagerKs: number[];
	/** k slices loaded on demand when their k row / chip is opened (the dense high-k shards). */
	lazyKs: number[];
}

export interface HypColorsPattern {
	/** Stable catalogue id, e.g. "hc73-4-00012" (base 73, k=4, 12th coloring). */
	id: string;
	/** Number of colored vertex classes. */
	k: number;
	/** Base tiling id (the sub-axis), e.g. "73". */
	base: string;
	/** Base tiling label, e.g. "{7,3}". */
	config: string;
	/** Palette size (3 today). */
	colors: number;
	/** Forced edge length ℓ solving q·interior_angle(p, ℓ) = 2π for the base {p,q}. */
	edge: number;
	/** A chiral solution (from an `_o_` certificate file); its mirror image is implied, not listed. */
	chiral?: boolean;
	/** Reference-development face count — a size hint, not geometry. */
	tiles: number;
	/** Quotient half-edge structure with the per-dart color (the sole render input). */
	darts: Darts;
	/** Census used by the card label and the /library facets. */
	stats: {
		faceOrbits: number;
		colorsUsed: number;
		/** Faces per color per fundamental domain, indexed by color id. */
		colorCensus: number[];
		edgeOrbits: number;
	};
}

/** The base tilings shipped today. One row per corpus decoded under public/hyperbolic-colors/. `k` counts
 *  colored vertex orbits; only surjective colorings (using all `colors` colors) ship — the monochrome and
 *  2-colorings are the plain uniform tiling and the smaller catalogues re-embedded. Depth tracks growth:
 *  {3,7} explodes at k=3 (57k, dropped), {7,3} at k=12 (64k, dropped). Big tails go lazy.
 *  The last four arrived 2026-07-25 and carry the corpus to its full depth — every k Marek solved ships,
 *  the terminal one lazily. {5,4} has no k=1 row: one colored vertex class cannot use three colors there. */
export const HYP_COLORS_BASES: HypColorsBase[] = [
	{ id: "37", label: "{3,7}", eagerKs: [1, 2], lazyKs: [] }, // k=3 is 57k colorings (50 MB) — omitted
	{ id: "73", label: "{7,3}", eagerKs: [3, 4, 5, 6, 7, 8], lazyKs: [9, 10, 11] }, // k=12 is 64k (71 MB) — omitted
	{ id: "83", label: "{8,3}", eagerKs: [1, 2, 3, 4, 5], lazyKs: [6] }, // k=6 is 13,356 (10.5 MB)
	{ id: "54", label: "{5,4}", eagerKs: [2, 3, 4], lazyKs: [5] }, // k=5 is 12,096 (8.7 MB)
	{ id: "64", label: "{6,4}", eagerKs: [1, 2], lazyKs: [3] }, // k=3 is 9,336 (5.8 MB)
	{ id: "45", label: "{4,5}", eagerKs: [1], lazyKs: [2] }, // k=2 is 7,902 (4.8 MB)
];

/** Lazy (base, k) shards to fetch when vertex-count `k` comes into view under the Hyperbolic geometry. */
export function hypColorsLazyShardsForK(k: number): { base: string; k: number }[] {
	return HYP_COLORS_BASES.filter((b) => b.lazyKs.includes(k)).map((b) => ({ base: b.id, k }));
}

export const hypColorsBaseOf = (p: HypColorsPattern): string => p.base;

/** Display label for a base id ("73" → "{7,3}"), from HYP_COLORS_BASES; falls back to the id. */
export function hypColorsBaseLabel(baseId: string): string {
	return HYP_COLORS_BASES.find((b) => b.id === baseId)?.label ?? baseId;
}

/** The sub-axis key for the /play tree and SUB_ORDER — namespaced so it can't collide with the edge
 *  systems ("hyp-") or a grid. "hyc-73". */
export const hypColorsSub = (p: HypColorsPattern): string => `hyc-${p.base}`;

/** Card / search label: what the tiles are. The base face is a p-gon (from the Schläfli symbol), so
 *  "3-colored heptagons" / "2-colored triangles". */
const POLY_NOUN: Record<number, string> = { 3: "triangles", 4: "squares", 5: "pentagons", 6: "hexagons", 7: "heptagons", 8: "octagons" };

export function hypColorsFamilyLabel(p: HypColorsPattern): string {
	const pgon = Number(p.config.replace(/[{}]/g, "").split(",")[0]);
	const noun = POLY_NOUN[pgon] ?? `${pgon}-gons`;
	return `${p.stats.colorsUsed}-colored ${noun}`;
}
