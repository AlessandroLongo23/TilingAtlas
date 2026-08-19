// The shipped shape: what scripts/build-squaring-shelf.ts writes and what the /theory page reads.
//
// Sides are decimal STRINGS, not numbers. This is not defensive typing — the low-symmetry records in
// public/spherical-poly/ produce squarings whose sides run to twenty-seven digits, tens of orders of
// magnitude past the 2^53 where a JS number stops being able to tell two integers apart. A squaring is
// perfect exactly when all its sides differ, so rounding them to doubles would not merely blur the
// picture, it would silently turn perfect tilings into imperfect ones and vice versa. Everything is
// parsed back to BigInt on read and only converted to floating point inside the SVG renderer, where the
// output is a few hundred pixels wide and the loss is the point.

export interface SquaringRecordSquare {
	/** Bottom-left corner and side, decimal integer strings. Origin is the rectangle's bottom-left. */
	x: string;
	y: string;
	side: string;
	/** The polyhedron edge that produced this tile. */
	edge: [number, number];
}

export interface SquaringRecord {
	/** The battery edge, as a vertex pair of the polyhedron. */
	battery: [number, number];
	width: string;
	height: string;
	squares: SquaringRecordSquare[];
	/** Tiles that came out with side zero and were dropped — forced by the solid's own symmetry. */
	degenerate: number;
	order: number;
	/** How many DISTINCT sizes appear. Equals `order` exactly when the squaring is perfect. */
	distinct: number;
	perfect: boolean;
	simple: boolean;
	bouwkamp: string;
}

export interface PolyhedronSquarings {
	/** Stable polyhedron id — a SPHERICAL_SOLIDS id, or a shelf record id like "shcube-half-4-00001". */
	id: string;
	/** Display name. */
	name: string;
	/** Which corpus it came from. */
	source: "solid" | "sph-poly" | "sph-half" | "sph-star";
	counts: { vertices: number; edges: number; faces: number };
	/** Order of the solid's own isometry group where the corpus records it, else null. */
	symmetryOrder: number | null;
	/** Every distinct squaring, deduplicated on (width, height, sorted sides). */
	squarings: SquaringRecord[];
}

/** One line of the manifest: everything the article needs to build a table without loading a shard. */
export interface SquaringSummary {
	id: string;
	name: string;
	source: PolyhedronSquarings["source"];
	counts: PolyhedronSquarings["counts"];
	symmetryOrder: number | null;
	/** How many distinct squarings this polyhedron has. Edge-transitive solids have exactly one. */
	squarings: number;
	/** How many of them are perfect, and how many simple. */
	perfect: number;
	simple: number;
	/** The richest one, by distinct sizes then by order — the card the article shows. */
	best: { battery: [number, number]; width: string; height: string; order: number; distinct: number; perfect: boolean; simple: boolean };
}

export interface SquaringManifest {
	/** Total polyhedra processed. */
	polyhedra: number;
	/** Total distinct squarings across the corpus. */
	squarings: number;
	entries: SquaringSummary[];
}

export const squaringShardUrl = (id: string): string => `/squarings/${id}.json`;
export const SQUARING_MANIFEST_URL = "/squarings/manifest.json";

// ---- the four-stage pipeline view ------------------------------------------------------------------
//
// Everything /theory/perfect-rectangles/pipeline needs to show one polyhedron becoming one rectangle:
// the solid, its graph drawn flat, the circuit, and the tiling. Shipped only for the curated set, since
// it carries the 3D geometry and the per-vertex solve on top of the squaring itself.

export interface PipelineRecord {
	id: string;
	name: string;
	source: PolyhedronSquarings["source"];
	counts: { vertices: number; edges: number; faces: number };
	symmetryOrder: number | null;
	/** Unit vectors, one per vertex — stage 1 draws the skeleton from these. */
	vertices: [number, number, number][];
	faces: number[][];
	edges: [number, number][];
	/** The edge carrying the battery: the one choice the whole construction depends on. */
	battery: [number, number];
	/** Potential per vertex, decimal strings, in the tiling's own units (0 at the negative pole). */
	potential: string[];
	/** Current per edge, oriented downhill. Equals the side of the square that edge becomes. */
	currents: { from: number; to: number; value: string }[];
	/** Tutte equilibrium positions, the settled state stage 2 animates toward. */
	tutte: [number, number][];
	/** The face pinned as the outer polygon, in boundary order. Contains both poles. */
	outerFace: number[];
	/** Spanning trees of the whole graph; equals width + height before gcd reduction. */
	spanningTrees: string;
	squaring: SquaringRecord;
}

export interface PipelineIndexEntry {
	id: string;
	name: string;
	source: PolyhedronSquarings["source"];
	counts: { vertices: number; edges: number; faces: number };
	symmetryOrder: number | null;
	order: number;
	distinct: number;
	perfect: boolean;
	simple: boolean;
	width: string;
	height: string;
	/** How many distinct rectangles the whole solid has, of which this is one. */
	squarings: number;
	/** Which family it belongs to, for the picker's folders. See PIPELINE_CATEGORIES for the order. */
	category: string;
	/**
	 * Enough geometry to draw a wireframe thumbnail in the picker, carried on the INDEX so a list of 31
	 * solids costs one request instead of 31. About 700 bytes each at these sizes, against ~5 kB for the
	 * full record with its solve and its Tutte embedding.
	 */
	vertices: [number, number, number][];
	edges: [number, number][];
}

export interface PipelineIndex {
	/** The legibility rule the curation applied, stated so the page can say it out loud. */
	maxOrder: number;
	entries: PipelineIndexEntry[];
}

/**
 * Folder order for the picker, from the most familiar family to the most particular to this atlas.
 * A category with nothing in it is simply not rendered, so this list can name families the curated
 * set happens not to reach.
 */
export const PIPELINE_CATEGORIES = [
	"Platonic",
	"Archimedean",
	"Prisms and antiprisms",
	"Johnson",
	"Halved Platonic",
	"Spherical 3.4.n.4",
	"Star polyhedra",
] as const;

export const PIPELINE_INDEX_URL = "/squarings/pipeline/index.json";
export const pipelineShardUrl = (id: string): string => `/squarings/pipeline/${id}.json`;

/** Parse a shipped square back to exact integers. */
export const parseSquare = (s: SquaringRecordSquare) => ({
	x: BigInt(s.x),
	y: BigInt(s.y),
	side: BigInt(s.side),
	edge: s.edge,
});

/**
 * The richest squaring of a set: most distinct sizes, then most tiles. "Most distinct" and not "most
 * tiles" because a perfect order-17 tiling is a better exhibit than an imperfect order-25 one, and
 * distinctness is the property the whole search was ever about.
 */
export function bestSquaring<T extends { distinct: number; order: number }>(list: T[]): T | null {
	let best: T | null = null;
	for (const s of list) {
		if (!best || s.distinct > best.distinct || (s.distinct === best.distinct && s.order > best.order)) {
			best = s;
		}
	}
	return best;
}

// ---- squared tori (genus 1) -------------------------------------------------------------------------
//
// The same pipeline one genus up. A periodic tiling divided by its translation lattice is a graph on a
// torus, and there is no battery edge to choose: the choice is a class in H¹(T;ℝ) ≅ ℝ², so instead of
// one rectangle per edge orbit each tiling carries a whole family of squared tori indexed by coprime
// (m, n). See lib/squaring/torusSquaring.ts.
//
// Unlike the spherical shards these carry the CELL rather than the finished squaring, because the
// reader can move the class continuously and the client re-solves. The cell is a few hundred bytes; 61
// precomputed squarings would be tens of kB for a control most readers move twice.

/** One primitive translation cell, as shipped. */
export interface TorusCellData {
	polygons: [number, number][][];
	basis: [[number, number], [number, number]];
}

export interface TorusRecord {
	id: string;
	name: string;
	category: string;
	/** How many vertex orbits the tiling has: 1 for uniform, 2 for 2-uniform, and so on. */
	k: number;
	cell: TorusCellData;
	/** Counts for the QUOTIENT map, where V - E + F = 0 rather than 2. */
	counts: { vertices: number; edges: number; faces: number };
	/** Sides of the tiles in one cell, ascending. */
	tiles: number[];
	/** Whether a half-turn moves an edge, which forbids a perfect squaring at every class. */
	halfTurn: boolean;
	halfTurnMoves: number;
	tjunctions: number;
	/** The class the shelf opens on: the one with the most distinct sizes. */
	bestClass: [number, number];
}

/**
 * Enough of the cell to draw a 54px patch of the tiling in the picker.
 *
 * Carried on the INDEX and not left to the shard, because the sidebar shows two dozen rows at once and
 * a thumbnail that needed its own shard would mean two dozen fetches to draw a list. Normalised at build
 * time so the longer lattice vector is one unit, which keeps the JSON to three decimals.
 */
export interface TorusThumb {
	polygons: [number, number][][];
	basis: [[number, number], [number, number]];
}

export interface TorusIndexEntry {
	id: string;
	name: string;
	category: string;
	thumb: TorusThumb;
	k: number;
	counts: { vertices: number; edges: number; faces: number };
	tiles: number[];
	halfTurn: boolean;
	/** How many integral classes inside the sweep produced a certified squaring. */
	classes: number;
	/** How many of those were perfect. */
	perfect: number;
	bestClass: [number, number];
	bestOrder: number;
	bestDistinct: number;
}

export interface TorusIndex {
	/** Classes (m, n) were swept with |m|, n up to this bound. */
	classLimit: number;
	entries: TorusIndexEntry[];
}

export const TORUS_CATEGORIES = ["Uniform tilings", "2-uniform", "3-uniform", "Other periodic"] as const;

export const TORUS_INDEX_URL = "/squarings/torus/index.json";
export const torusShardUrl = (id: string): string => `/squarings/torus/${id}.json`;

// ---- squared cylinders (hyperbolic) -----------------------------------------------------------------
//
// The third geometry. A hyperbolic tiling is infinite, so there is no closed surface to divide by; what
// is squared instead is a BALL cut out of it with its whole boundary shorted to one vertex, and the
// answer is a tiling of a cylinder whose bottom edge is the boundary at infinity (Benjamini–Schramm,
// Ann. Probab. 24, 1996). Growing the radius is the control, standing where the battery edge stood on
// the sphere and the homology class on the torus.
//
// Unlike the other two shelves these numbers are FLOATS. The solve is exact and both certificates are
// checked in integers at build time, but the integers involved count spanning forests of a few-hundred
// vertex graph and run to hundreds of digits. Shipping them would buy nothing: the question exactness
// protects elsewhere is whether two tiles are the same size, and here the tiling has hundreds of tiles
// in a q-fold symmetric arrangement where equal sides are the rule and carry no meaning.

export interface CylinderLayerData {
	radius: number;
	counts: { vertices: number; edges: number; faces: number };
	/** Total current: the circumference of the cylinder, at height normalised to 1. */
	circumference: number;
	/** Poincaré-disk positions, null for the wired sink which stands for the whole boundary. */
	positions: ([number, number] | null)[];
	potential: number[];
	edges: [number, number][];
	squares: { x: number; y: number; side: number; edge: number }[];
}

export interface CylinderRecord {
	id: string;
	name: string;
	/** {3,q}. q ≥ 7 is hyperbolic; q = 6 is the Euclidean member, kept for the contrast. */
	q: number;
	geometry: "hyperbolic" | "euclidean";
	layers: CylinderLayerData[];
}

/**
 * A small ball of the {3,q} tiling laid out in the disk, for the picker.
 *
 * Straight chords, not geodesics: at 54px the two are a pixel apart, and what actually distinguishes
 * {3,7} from {3,12} at that size is how fast the triangles crowd toward the rim, which chords keep.
 */
export interface CylinderThumb {
	points: [number, number][];
	edges: [number, number][];
}

export interface CylinderIndexEntry {
	id: string;
	name: string;
	q: number;
	thumb: CylinderThumb;
	geometry: "hyperbolic" | "euclidean";
	radii: number[];
	/** Circumference per radius. Converges iff the walk is transient, which is the whole point. */
	conductance: number[];
	maxOrder: number;
}

export interface CylinderIndex {
	entries: CylinderIndexEntry[];
}

export const CYLINDER_INDEX_URL = "/squarings/cylinder/index.json";
export const cylinderShardUrl = (id: string): string => `/squarings/cylinder/${id}.json`;
