// The atlas's shared vocabularies: the string values that classify a tiling and cross module
// boundaries (geometry, decoration, tile class, source, freedraw board). Each is an `as const` object
// with its type derived from the values, so `GEOMETRIES.HYPERBOLIC` and the bare "hyperbolic" a JSON
// shard carries are the same type and decoded data needs no cast. A TS `enum` would be nominal and
// reject the bare string. This module imports nothing, so any module can import it without a cycle
// (lib/freedraw/schwarz.ts is imported BY referenceAtlas.ts and needs GEOMETRIES at module scope).

type ValueOf<T> = T[keyof T];

export const GEOMETRIES = {
	EUCLIDEAN: "euclidean",
	HYPERBOLIC: "hyperbolic",
	SPHERICAL: "spherical",
} as const;
export type Geometry = ValueOf<typeof GEOMETRIES>;
/** The two curved geometries: the Schwarz boards and every shelf that is never planar. */
export type CurvedGeometry = Exclude<Geometry, typeof GEOMETRIES.EUCLIDEAN>;

export const DECORATIONS = {
	TILINGS: "tilings",
	EDGES: "edges",
	COLORINGS: "colorings",
} as const;
export type Decoration = ValueOf<typeof DECORATIONS>;

// tileClass, the primary shelf axis: "convex" (convex-irregular) iff the tiling comes from the convex
// unit-edge super-tile demo (source-driven — source "composable" — since it has no "*" token); else
// "star" iff its family carries a star token ("n*"); "regular" otherwise. Matches polygonClassLabel.
export const TILE_CLASSES = {
	REGULAR: "regular",
	STAR: "star",
	HOLLOW: "hollow",
	CONVEX: "convex",
	ISOTOXAL: "isotoxal",
	MIXED: "mixed",
	SCALED: "scaled",
	PERIOD: "period",
	POLYOMINO: "polyomino",
	ISLAMIC: "islamic",
	FREEDRAW: "freedraw",
	BUBBLE: "bubble",
	COLORS: "colors",
	HYPERBOLIC: "hyperbolic",
	SPHERICAL: "spherical",
	EDGELEN: "edgelen",
	TOPOLOGICAL: "topological",
} as const;
export type TileClass = ValueOf<typeof TILE_CLASSES>;

/** Which corpus a ReferenceTiling came from. Some values share a spelling with a tile class or a
 *  geometry ("hyperbolic", "freedraw") but they are a different axis; compare a source with SOURCES. */
export const SOURCES = {
	GALEBACH: "galebach",
	MYERS: "myers",
	CTRNACT: "ctrnact",
	CTRNACT_STAR: "ctrnact-star",
	COMPOSABLE: "composable",
	ISOTOXAL: "isotoxal",
	MIXED: "mixed",
	SCALED: "scaled",
	POLYOMINO: "polyomino",
	ISLAMIC: "islamic",
	FREEDRAW: "freedraw",
	BUBBLE: "bubble",
	COLORS: "colors",
	HYPERBOLIC: "hyperbolic",
	SPHERICAL: "spherical",
	HOLLOW: "hollow",
	PERIOD: "period",
	TRI45: "tri45",
	PLANIGON: "planigon",
	PENROSE: "penrose",
	EUHALF: "euhalf",
	LENGTHPARAM: "lengthparam",
	TEGULA: "tegula",
} as const;
export type TilingSource = ValueOf<typeof SOURCES>;

/** Every board a freedraw pattern can decorate. The catalogue boards are the ones the freedraw browser
 *  offers; the two parametric boards (`pent`, `ih`) are their own shelves, reached from the Edge
 *  patterns tab, so they must not appear in that browser's grid pickers. */
export const FREEDRAW_GRIDS = {
	SQUARE: "square",
	TRIANGLE: "triangle",
	TS: "ts",
	HEX: "hex",
	SCH236: "sch236",
	SCH244: "sch244",
	/** The two ARCHIMEDEAN boards: 3.4.6.4 and 4.8.8, both patch grids. */
	ARCH_4436: "4436",
	ARCH_488: "488",
	PENT: "pent",
	IH: "ih",
} as const;
export type FreedrawGrid = ValueOf<typeof FREEDRAW_GRIDS>;
export type FreedrawCatalogueGrid = Exclude<FreedrawGrid, typeof FREEDRAW_GRIDS.PENT | typeof FREEDRAW_GRIDS.IH>;
