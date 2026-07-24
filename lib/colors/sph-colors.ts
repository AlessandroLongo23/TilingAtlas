// Spherical colored tilings (Marek Čtrnáct, 2026-07): the colors object on the sphere. A pattern is a
// periodic n-coloring of a Platonic solid — every face is a real tile carrying one of n colors, `k`
// counts COLORED vertex classes. The spherical twin of lib/colors/hyp-colors.ts and the colored sibling
// of the spherical FREEDRAW (lib/render/icoFreedraw.ts, where edges are drawn/undrawn). Decoded to a
// self-contained polyhedron by tools/ctrnact-oracle/develop_sph_colors.py and drawn by
// lib/render/sphColors.ts (three.js) — the record ships its own vertices, faces and edges, so nothing
// indexes into a canonical solid.

import type { V3 } from "@/lib/render/icoFreedraw";

/** The base Platonic solid a coloring decorates — the sub-axis, one per solver family. */
export interface SphColorsSolid {
	/** Stable id used in record ids and the sub-axis key, e.g. "cube". */
	id: string;
	/** Display label — the Schläfli symbol, e.g. "{4,3}". */
	label: string;
	/** k slices eager-loaded on entering the Spherical geometry. */
	eagerKs: number[];
	/** k slices loaded on demand when their k row / chip is opened. */
	lazyKs: number[];
}

export interface SphColorsPattern {
	/** Stable catalogue id, e.g. "sccub-1-00001". */
	id: string;
	/** Number of colored vertex classes. */
	k: number;
	/** Base solid id (the sub-axis), e.g. "cube". */
	solid: string;
	/** Schläfli label, e.g. "{4,3}". */
	config: string;
	/** Palette size (3 today). */
	colors: number;
	/** Unit vertex positions of the developed polyhedron. */
	vertices: V3[];
	/** Face rings (indices into `vertices`). */
	faces: number[][];
	/** Color index (0=A, 1=B, …) per face (parallel to `faces`). */
	faceColor: number[];
	/** All edges (index pairs) — every one a tile boundary. */
	edges: [number, number][];
	chiral?: boolean;
	stats: {
		faceOrbits: number;
		colorsUsed: number;
		colorCensus: number[];
	};
}

/** The five Platonic solids. Only surjective colorings ship (using all `colors` colors); the monochrome
 *  and 2-colorings are the plain solid and the smaller catalogues re-embedded. Big tails go lazy. */
export const SPH_COLORS_SOLIDS: SphColorsSolid[] = [
	{ id: "tetrahedron", label: "{3,3}", eagerKs: [3], lazyKs: [] },
	{ id: "octahedron", label: "{3,4}", eagerKs: [2, 3, 4, 5, 6], lazyKs: [] },
	{ id: "cube", label: "{4,3}", eagerKs: [1, 2, 3, 4, 6, 8], lazyKs: [] },
	{ id: "icosahedron", label: "{3,5}", eagerKs: [1, 2, 3, 4, 5], lazyKs: [6] }, // k=8 is 10k colorings (11 MB) — omitted
	{ id: "dodecahedron", label: "{5,3}", eagerKs: [4, 6, 7, 10], lazyKs: [12, 20] },
];

/** Lazy (solid, k) shards to fetch when vertex-count `k` comes into view under the Spherical geometry. */
export function sphColorsLazyShardsForK(k: number): { solid: string; k: number }[] {
	return SPH_COLORS_SOLIDS.filter((s) => s.lazyKs.includes(k)).map((s) => ({ solid: s.id, k }));
}

export const sphColorsSolidOf = (p: SphColorsPattern): string => p.solid;

/** Display label for a solid id ("cube" → "{4,3}"), from SPH_COLORS_SOLIDS; falls back to the id. */
export function sphColorsSolidLabel(solidId: string): string {
	return SPH_COLORS_SOLIDS.find((s) => s.id === solidId)?.label ?? solidId;
}

/** The sub-axis key for the /play tree and SUB_ORDER — namespaced so it can't collide with the spherical
 *  freedraw (which subs on the bare solid name). "spc-cube". */
export const sphColorsSub = (p: SphColorsPattern): string => `spc-${p.solid}`;

/** Card / search label: "3-colored {4,3}". */
export function sphColorsFamilyLabel(p: SphColorsPattern): string {
	return `${p.stats.colorsUsed}-colored ${p.config}`;
}
