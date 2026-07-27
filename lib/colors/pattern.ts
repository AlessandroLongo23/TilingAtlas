// The colored-tiling catalogue: periodic colorings of the 4^4 square grid, the 3^6 triangle grid and
// the square-triangle patch, decoded from Marek Čtrnáct's PT certificates by
// tools/ctrnact-oracle/develop_colors.py. A NEW CLASS, not freedraw: every grid edge is a real tile
// boundary and the content is the color field itself — which color each cell carries. k counts
// COLORED vertex classes: vertices are equivalent only under symmetries that preserve the coloring,
// so the vertex figure is a color word around the vertex ((A4, B4)D4a is the checkerboard vertex).
// Mirror pairs merge (the atlas convention, and provably Marek's: adding mirrors to the canonical
// group folds nothing across his whole corpus); colors are LABELED — all-A and all-B are two
// solutions, not one.
//
// Each catalogue is one grid at one PALETTE SIZE (2 or 3 colors so far). The n-color catalogues hold
// only the solutions using every color: an n-color solver run re-finds every smaller coloring (once
// per choice of letters), and those are already shipped as the (n-1)-color catalogue.

/** Which grid the coloring lives on. Two of them are PATCH grids with no cell bitmask: the combined
 * grid ("ts") has no fixed lattice at all, and the hexagonal grid ("hex", {6,3}) has a honeycomb
 * vertex set rather than a lattice. Both carry dummy lattice fields and the real geometry under
 * `patch` — see lib/freedraw/pattern.ts for the honeycomb argument. */
export type ColorsGrid = "square" | "triangle" | "ts" | "hex";

/** Patch geometry: one period of the colored tiling, explicit. Every endpoint/ring corner is a
 * (vertex index, integer T1/T2 offset) pair, instanced by the renderer. */
export interface ColorsPatch {
	T1: [number, number];
	T2: [number, number];
	verts: [number, number][];
	/** Colored-vertex orbit id per vertex. */
	vorbit: number[];
	/** [vi, vj, offM, offN]: vertex vi to vertex vj translated by offM·T1 + offN·T2. */
	edges: [number, number, number, number][];
	/** Polygon rings, corners as [vi, offM, offN] anchored at the first corner. */
	polys: [number, number, number][][];
	/** Color index (0 = A, 1 = B, 2 = C, …) per polygon. */
	polyColor: number[];
}

export interface ColorPattern {
	id: string; // "col-<k>-<n>" (square) | "colt-…" (triangle) | "colts-…" (combined)
	/** Colored vertex classes (vertex orbits under color-preserving symmetry). */
	k: number;
	/** Period lattice in HNF: generators (a, 0) and (b, d). Dummy 1×1 on the combined grid. */
	a: number;
	b: number;
	d: number;
	/**
	 * Color index (0 = A, 1 = B, 2 = C, …) per cell. Square grid: one entry per lattice coset, indexed j*a + i.
	 * Triangle grid: TWO entries per coset — 2*coset for the up triangle, 2*coset+1 for the down
	 * (the lib/freedraw cellFace layout). Combined grid: dummy [0]; colors live in patch.polyColor.
	 */
	cells: number[];
	/** Grid-point orbit id per lattice coset. Dummy [0] on the combined grid (see patch.vorbit). */
	orbit: number[];
	/** One folded colored vertex figure per orbit, e.g. "(A4, B4, B4, B4)Aa". */
	vcs: string[];
	/** Tile orbits under the coloring's full symmetry group (from the certificate's tile lines). */
	tileOrbits: number;
	/** Edge orbits (the certificate's structure items; also the n in Marek's file names). */
	edgeOrbits: number;
	/** Absent means "square" — the original catalogue predates the grid axis. */
	grid?: ColorsGrid;
	/** Palette size. Absent means 2 — the original catalogue predates the color axis. */
	colors?: number;
	/** Present exactly on the patch grids ("ts", "hex"). */
	patch?: ColorsPatch;
}

/**
 * The shipped catalogues: one per grid × palette size, each split into a file per k. The single source
 * of truth for both the /colors workbench and the reference-atlas loader, so neither can drift from
 * what public/colors actually holds. The k ceilings are Marek's runs, not a limit of the method.
 *
 * `ks` load eagerly with the atlas; `lazyKs` are the dense tails, fetched only when that k comes into
 * view (colorsLazyShardsForK, the same policy the hyperbolic bases use). The hexagonal grid is the
 * only catalogue deep enough to need it: its k=8 slice alone is 13,083 colorings / 28.6 MB.
 * Hexagonal k=2 is genuinely absent, not missing — all twelve k=2 certificates use at most two colors.
 */
export const COLORS_CATALOGUES: {
	grid: ColorsGrid;
	colors: number;
	ks: number[];
	lazyKs?: number[];
	prefix: string;
}[] = [
	{ grid: "square", colors: 2, ks: [1, 2, 3, 4, 5, 6], prefix: "/colors/squares-2-k" },
	{ grid: "square", colors: 3, ks: [1, 2, 3, 4], prefix: "/colors/squares-3-k" },
	{ grid: "triangle", colors: 2, ks: [1, 2, 3, 4, 5, 6], prefix: "/colors/tri-2-k" },
	{ grid: "triangle", colors: 3, ks: [1, 2, 3, 4], prefix: "/colors/tri-3-k" },
	{ grid: "ts", colors: 2, ks: [1, 2, 3, 4], prefix: "/colors/ts-2-k" },
	{ grid: "ts", colors: 3, ks: [1, 2, 3], prefix: "/colors/ts-3-k" },
	{ grid: "hex", colors: 3, ks: [1, 3, 4, 5], lazyKs: [6, 7, 8], prefix: "/colors/hex-3-k" },
];

/** Lazy (catalogue prefix, k) shards to fetch when vertex-count `k` comes into view. */
export function colorsLazyShardsForK(k: number): { prefix: string; k: number }[] {
	return COLORS_CATALOGUES.filter((c) => c.lazyKs?.includes(k)).map((c) => ({ prefix: c.prefix, k }));
}

export const colorsCatalogue = (grid: ColorsGrid, colors: number) =>
	COLORS_CATALOGUES.find((c) => c.grid === grid && c.colors === colors) ?? COLORS_CATALOGUES[0];

export const colorsCatalogueFile = (grid: ColorsGrid, colors: number, k: number) =>
	`${colorsCatalogue(grid, colors).prefix}${k}.json`;

export const colorsGridOf = (p: Pick<ColorPattern, "grid">): ColorsGrid => p.grid ?? "square";

export const colorCountOf = (p: Pick<ColorPattern, "colors">): number => p.colors ?? 2;

/** The color letters, in catalogue order: A, B, C, … */
export const colorLetter = (i: number) => String.fromCharCode(65 + i);

export const cellCount = (p: Pick<ColorPattern, "a" | "d">) => p.a * p.d;

/** Cells per color per period, indexed by color id, from whichever representation the grid carries. */
export function colorCensus(p: Pick<ColorPattern, "cells" | "patch" | "colors">): number[] {
	const src = p.patch ? p.patch.polyColor : p.cells;
	const counts = new Array<number>(colorCountOf(p)).fill(0);
	for (const c of src) counts[c] = (counts[c] ?? 0) + 1;
	return counts;
}
