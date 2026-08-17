// One declaration per shelf, so a shelf is a THING and not a pattern of if-else branches.
//
// WHY THIS EXISTS. A `CatalogueTiling` carries fifteen mutually exclusive optional payloads, one per
// shelf, and every consumer used to be its own chain over them. Nothing forced a new shelf into any
// chain, so a shelf could ship complete and correct and still be invisible or mis-controlled in one
// consumer that nobody thought to update. That is not hypothetical: the Schwarz board dropped out of the
// /play sidebar tree the day it landed (2026-07-27), eleven shelves shipped in v1.13.0 with no display
// label, and the two copies of the control predicates below had already diverged in two places by the
// time anyone read them side by side.
//
// `SHELVES` is a `Record<ShelfId, ShelfDef>`, which is the whole point: adding a member to `ShelfId`
// without an entry is a compile error, in the same way `TILE_CLASS_LABEL` already guards the tile-class
// axis and `FREEDRAW_GRID_SUBS` guards the freedraw grids.
//
// WHAT THIS IS NOT. It does not reshape the records — `CatalogueTiling.pentEdges` stays a
// `PentEdgeRecord` and every call site keeps its type. It does not own the sub axis either: `subOf` and
// `SUB_ORDER` in referenceAtlas.ts remain the single source of truth for the sidebar tree AND the linear
// browse order, and one shelf can span two families anyway (a `freedraw` record's sub is a plain grid or
// a Schwarz grid depending on its pattern), so a per-shelf family constant would be a lie.

import { freedrawKNoun, gridOf } from "@/lib/freedraw/pattern";
import type { CatalogueTiling } from "./catalogueService";

export type ShelfId =
	| "developed"
	| "spherical"
	| "freedraw"
	| "colors"
	| "hollow"
	| "sphericalFreedraw"
	| "hypEdges"
	| "hypColors"
	| "sphColors"
	| "schwarz"
	| "sphEdges"
	| "hypPoly"
	| "sphPoly"
	| "sphStar"
	| "pentEdges"
	| "ihEdges";

/**
 * Which renderer paints the main canvas — and therefore which block of controls the Options tab shows.
 *
 * The two questions have one answer, which is exactly what the old code got wrong. Each predicate in
 * `_play-client` and `options-tab` was recomputed from its own list of shelf fields, so `hypPoly` could
 * route to the Poincaré disk in one file and count as flat in the other, and the Options tab would offer
 * the p5 overlays (symmetry elements, fundamental domain, vertex orbits, polygon points) over a canvas
 * that had already been blanked.
 *
 * The names are the renderer, not the geometry: `sphereEdges` is the three.js canvas the spherical
 * Schwarz boards, the uniform polyhedra and the spherical 3.4.n.4 solids all share, and they share it
 * because they are the same object drawn the same way.
 */
export type ShelfSurface =
	| "flat" // the p5 polygon canvas — every plain Euclidean tiling
	| "grid2d" // the freedraw 2D grid canvas (lib/freedraw/render.ts)
	| "colors2d" // the Euclidean colorings canvas
	| "hollow2d" // the self-intersecting {n/d} canvas
	| "disk" // the per-pixel Poincaré shader, plain tilings
	| "diskEdges" // the developed-edge disk canvas
	| "diskColors" // the per-pixel disk shader in colors mode
	| "sphere" // the three.js Platonic solid
	| "sphereEdges" // the three.js ico-freedraw / Schwarz / polyhedron canvas
	| "sphereColors"; // the three.js solid in colors mode

export interface ShelfDef {
	/** The optional field on `CatalogueTiling` that carries this shelf's record. */
	field: ShelfId;
	/** A function only where the payload names its own geometry — the Schwarz boards, and only those. */
	surface: ShelfSurface | ((t: CatalogueTiling) => ShelfSurface);
	/**
	 * What this shelf's `k` counts, when it is NOT the vertex-orbit count of a uniform tiling.
	 *
	 * Null is the default reading and renders a bare `k = 2`; a string is appended, so the sidebar names
	 * the quantity exactly where it deviates. Naming it everywhere would be noise — most shelves mean the
	 * ordinary thing — and naming it nowhere is how "k = 2" came to mean three different quantities in one
	 * list. A function where the noun depends on the record: a freedraw `k` counts grid points, and which
	 * grid decides what to call them.
	 */
	kNoun: string | null | ((t: CatalogueTiling) => string | null);
}

/**
 * Dispatch order, and it is load-bearing rather than cosmetic.
 *
 * The payloads are meant to be mutually exclusive, but nothing in the type system says so, and the canvas
 * chain in `_play-client` has always had an order. This is that order, written down once: `shelfOf` walks
 * it and takes the first field present, so every consumer resolves the same shelf for the same record
 * even if a future corpus ever sets two fields at once.
 */
export const SHELF_ORDER: ShelfId[] = [
	"hollow",
	"schwarz",
	"pentEdges",
	"ihEdges",
	"sphEdges",
	"sphPoly",
	"sphStar",
	"hypPoly",
	"spherical",
	"sphericalFreedraw",
	"hypEdges",
	"hypColors",
	"sphColors",
	"developed",
	"freedraw",
	"colors",
];

const EDGE_ORBITS = "vertex orbits";
const COLORED = "colored vertices";

export const SHELVES: Record<ShelfId, ShelfDef> = {
	// --- Euclidean, the flat p5 canvas and the 2D canvases that replace it ---
	freedraw: {
		field: "freedraw",
		surface: "grid2d",
		// The one per-record noun: a square grid's points and a triangle grid's points are different
		// quantities, and lib/freedraw/pattern.ts is what knows the difference.
		kNoun: (t) => (t.freedraw ? freedrawKNoun(gridOf(t.freedraw)) : null),
	},
	colors: { field: "colors", surface: "colors2d", kNoun: COLORED },
	hollow: {
		field: "hollow",
		// ⚑ The hollow shelf draws on its own canvas and the flat p5 layer is blanked for it
		// (`skipFlat` in components/canvas.tsx includes `cfg.hollow`), yet the Options tab has always
		// shown it the flat control block. That is the same defect as the hypPoly one this registry was
		// written to fix, but fixing it changes which controls a shipped shelf offers, so it is recorded
		// here and left alone rather than folded into a refactor. See `isFlat` in options-tab.tsx.
		surface: "hollow2d",
		kNoun: null,
	},
	// Both parametric boards render through the SAME 2D grid canvas as freedraw, off the same store
	// fields — their patch is built on the client instead of shipped, which changes nothing above the
	// renderer — so they take that whole control block instead of growing near-duplicates of it.
	pentEdges: { field: "pentEdges", surface: "grid2d", kNoun: EDGE_ORBITS },
	ihEdges: { field: "ihEdges", surface: "grid2d", kNoun: EDGE_ORBITS },

	// --- Hyperbolic ---
	developed: { field: "developed", surface: "disk", kNoun: null },
	hypEdges: { field: "hypEdges", surface: "diskEdges", kNoun: EDGE_ORBITS },
	hypColors: { field: "hypColors", surface: "diskColors", kNoun: COLORED },
	// Not a decoration: every edge of a 3.4.n.4 tiling is a real tile boundary, so each face is filled by
	// its POLYGON SIZE. That is the colored-tiling render exactly, with the size index standing in for the
	// colour index, which is why it shares that surface — and why counting it as flat blanked its canvas.
	hypPoly: { field: "hypPoly", surface: "diskColors", kNoun: null },

	// --- Spherical ---
	spherical: { field: "spherical", surface: "sphere", kNoun: null },
	sphericalFreedraw: { field: "sphericalFreedraw", surface: "sphereEdges", kNoun: EDGE_ORBITS },
	sphEdges: { field: "sphEdges", surface: "sphereEdges", kNoun: EDGE_ORBITS },
	sphPoly: { field: "sphPoly", surface: "sphereEdges", kNoun: null },
	// Star polyhedra draw on the same three.js canvas as every other spherical shelf; what is different
	// is inside the adapter, where a self-intersecting {n/d} face is decomposed before it can be filled
	// (lib/render/sphStar.ts). k is the ordinary vertex-orbit count, so kNoun stays null — it reads 1 for
	// the uniform polyhedra, which are vertex-transitive by definition, and 2 for the pentagrammic
	// pyramid, which is regular-faced and NOT uniform. DENSITY is the extra number that orders this
	// shelf, and it has its own sub-axis.
	sphStar: { field: "sphStar", surface: "sphereEdges", kNoun: null },
	sphColors: { field: "sphColors", surface: "sphereColors", kNoun: COLORED },

	// --- The one shelf that spans two geometries ---
	// A Schwarz board is Čtrnáct's freedraw on the board cut by a (p,q,r) reflection group. It names its
	// own geometry, so it is the only shelf whose surface is a function: a spherical board is finite and
	// draws on the three.js canvas, a hyperbolic one re-develops in the disk.
	schwarz: {
		field: "schwarz",
		surface: (t) => (t.schwarz?.geometry === "spherical" ? "sphereEdges" : "diskEdges"),
		kNoun: EDGE_ORBITS,
	},
};

/** The shelf a record belongs to, or null for the plain Euclidean tilings that carry no payload at all. */
export function shelfOf(t: CatalogueTiling | null | undefined): ShelfDef | null {
	if (!t) return null;
	for (const id of SHELF_ORDER) if (t[id]) return SHELVES[id];
	return null;
}

/** Which renderer owns this record's canvas. "flat" is the answer for the plain tilings and for nothing. */
export function surfaceOf(t: CatalogueTiling | null | undefined): ShelfSurface {
	const shelf = shelfOf(t);
	if (!shelf) return "flat";
	return typeof shelf.surface === "function" ? shelf.surface(t!) : shelf.surface;
}

/** What this record's `k` counts, or null when it means the ordinary vertex-orbit count. */
export function kNounOf(t: CatalogueTiling): string | null {
	const shelf = shelfOf(t);
	if (!shelf) return null;
	return typeof shelf.kNoun === "function" ? shelf.kNoun(t) : shelf.kNoun;
}

// --- Derived groupings. Every consumer asks one of these instead of rebuilding it from shelf fields. ---

const DISK: ShelfSurface[] = ["disk", "diskEdges", "diskColors"];
const SPHERE: ShelfSurface[] = ["sphere", "sphereEdges", "sphereColors"];

/** Renders in the Poincaré disk: shares the disk line controls and the disk's own scroll-to-zoom. */
export const isDiskSurface = (s: ShelfSurface) => DISK.includes(s);
/** Renders on a three.js solid, which owns its own pointer input. */
export const isSphereSurface = (s: ShelfSurface) => SPHERE.includes(s);

/**
 * Whether the conformal lens can draw this record.
 *
 * A WIDER set than the flat p5 overlays: the lens draws from the shared periodic-cell IR
 * (lib/render/periodicCell.ts), so it covers the classes with no polygon cell — colorings, edge
 * patterns, hollow — as well as the plain tilings. All it needs is a period lattice, which is exactly
 * what the hyperbolic and spherical shelves do not have.
 */
export const lensAppliesTo = (t: CatalogueTiling | null | undefined) => {
	const s = surfaceOf(t);
	return !isDiskSurface(s) && !isSphereSurface(s);
};
