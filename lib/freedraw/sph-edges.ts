// Edge systems on a UNIFORM POLYHEDRON (Marek Čtrnáct, 2026-07-31, extended 2026-08-02): the freedraw
// object on a prism, an antiprism, the truncated tetrahedron and octahedron, the cuboctahedron and the
// rhombicuboctahedron, each of the last two beside the Johnson twin that shares its edge length and its
// V/E/F (J27, J37). A pattern is a periodic
// subset of the solid's edges; drawn edges are modelled as DIGONS in the vertex figure; the tiles are
// the regions that fall out when faces are merged across UNDRAWN edges. `k` counts vertex orbits of the
// decorated tiling. Decoded by tools/ctrnact-oracle/develop_sph_edges.py.
//
// It is the same object as the {p,q} hyperbolic edge shelf and the Schwarz shelf, on a third kind of
// board — so it renders through the SAME adapter (lib/render/sphSchwarz.ts::sphSchwarzScene → the
// three.js ico-freedraw sphere). What is new is that these boards MIX FACE SIZES: a prism is squares
// plus two n-gons, the cuboctahedron triangles plus squares. Nothing in the adapter ever assumed a
// triangle, so a board ring is `number[]` and the render path is untouched.
//
// THE BOARD IS SHIPPED ONCE PER SHARD, not per record: every decoration of one solid develops the same
// polyhedron, and the developer aligns all of them onto one indexing. The cuboctahedron's k=12 slice is
// 96,804 tilings — ~150 MB with the geometry repeated, ~13 MB without.

import type { V3 } from "@/lib/render/icoFreedraw";

/** The polyhedron a shelf row decorates. */
export interface SphEdgesBoard {
	/** Stable id, the one Marek's corpus uses ("443", "cuboctahedron") or the twin's own ("j27"). */
	id: string;
	/** Vertex figure, the display label: "3.4.4", "3.4.3.4". */
	config: string;
	/** The solid's name, for the card and the sub-axis row. */
	solid: string;
	/** k slices eager-loaded on entering the Spherical geometry (small). */
	eagerKs: number[];
	/** k slices fetched only when that k comes into view (the dense tails). */
	lazyKs: number[];
	/** Whether Marek's ENUMERATION finished on this board: his census carries the MAX marker, or it
	 *  reaches k = V, which is the ceiling because k counts vertex orbits of a V-vertex solid. False
	 *  means his search stopped where this drop stops and the board may hold more. */
	complete: boolean;
	/** k values the census COUNTS and this drop carries no certificates for — the board has them, our
	 *  copy does not. A different claim from `complete`, and the two do not move together: 3337 is a
	 *  finished enumeration whose k = 14 slice (334,772 tilings) was left out of the zip, while 4443
	 *  ships every k its census lists and is still mid-run. */
	missing: number[];
	/** Tilings per k, so a catalogue can show the size of a slice before fetching it. */
	counts: Record<number, number>;
}

/** The board itself: the polyhedron every pattern in a shard decorates. Shipped once per shard. */
export interface SphEdgesGeometry {
	/** Unit vectors, one per board vertex. */
	vertices: V3[];
	/** The solid's faces, each a ring of vertex indices. Mixed arity — a prism has squares and n-gons. */
	faces: number[][];
	/** Every board edge, as a vertex-index pair. Indexes the per-pattern `drawn` string. */
	edges: [number, number][];
}

export interface SphEdgesPattern {
	/** "xe443-2-00003". */
	id: string;
	k: number;
	/** Board id — the sub-axis, e.g. "cuboctahedron". */
	board: string;
	/** Vertex figure of the undecorated solid, "3.4.3.4". */
	config: string;
	/** Solid name, "cuboctahedron". */
	solid: string;
	/** A chiral solution (from an `_o_` certificate); its mirror image is implied, not listed. */
	chiral?: boolean;
	/** Merged-tile id per board face (parallel to `geom.faces`) — the fill colour key. */
	faceTile: number[];
	/** One "0"/"1" per board edge: 1 is a drawn tile boundary, 0 the faint scaffold. A string, not an
	 *  array — at 96,804 records a JSON array of ints doubles the shard. */
	drawn: string;
	/** Certificate vertex-orbit label per board vertex. */
	vorbit: number[];
	/** The shard's board, attached at load and SHARED by every pattern in it (never copied). */
	geom: SphEdgesGeometry;
	stats: {
		/** Merged tiles on the whole solid — the real count, not an orbit count. */
		tiles: number;
		/** Faces per tile, descending. */
		tileSizes: number[];
		faces: number;
		verts: number;
		edges: number;
		drawnEdges: number;
		/** Vertex orbits of the certificate. */
		tileOrbits: number;
	};
}

/** A shard exactly as it sits in public/spherical-edges/x<board>-k<k>.json. */
export interface SphEdgesShard extends SphEdgesGeometry {
	board: string;
	config: string;
	solid: string;
	geometry: "spherical";
	k: number;
	edge: number;
	patterns: Omit<SphEdgesPattern, "geom">[];
}

/** Attach the shard's board to each of its patterns. One shared object per shard. */
export function hydrateSphEdgesShard(shard: SphEdgesShard): SphEdgesPattern[] {
	const geom: SphEdgesGeometry = { vertices: shard.vertices, faces: shard.faces, edges: shard.edges };
	return shard.patterns.map((p) => ({ ...p, geom }));
}

/** The boards shipped today, one row per polyhedron decoded under public/spherical-edges/. Adding a
 *  board is one row here plus one row in develop_sph_edges.py's BOARDS. Every field below is PRINTED by
 *  tools/ctrnact-oracle/emit_board_tables.py off the shipped shards and Marek's census files — re-run it
 *  after a develop and paste, so a wrong row is a diff rather than an argument.
 *
 *  THREE DIFFERENT CLAIMS LIVE HERE, and conflating any two of them tells the reader a board is
 *  exhausted when it is not:
 *
 *    `sphEdgesKGaps` — holes BETWEEN the shipped k. On a censused board these are real properties of
 *      the solid: (4,4,7) genuinely has no k = 3, 5, 6, 9…13, and the triangular prism's own census is
 *      0 at k = 5 and 6 even though it has six vertices. k = V is NOT always attainable.
 *    `complete`      — whether the enumeration FINISHED. 4443 and its twin j37 are the exception on
 *      this shelf: Marek's census for that corpus stops at k = 8 of a 24-vertex solid with no MAX
 *      marker, so that board is mid-run and must never be presented as a full catalogue.
 *    `missing`       — k the census counts and the drop does not carry. 3337 is the case: a finished
 *      enumeration (its census reaches k = 14 = V) whose k = 14 slice, 334,772 tilings, is not in the
 *      zip. The board is exhausted; our copy of it is short by one slice.
 *
 *  cuboctahedron/j27 and 4443/j37 each come out of ONE corpus: Marek's solver enumerates by angle
 *  closure, so a twin sharing the edge length and the V/E/F comes back in the same run. J37 is the
 *  harder pair — it has 3.4.4.4 at every vertex exactly like the rhombicuboctahedron, so only the
 *  measured isometry group separates them (|G| = 48 in one vertex orbit against 16 in two). They are
 *  different polyhedra and ship as different boards. */
export const SPH_EDGES_BOARDS: SphEdgesBoard[] = [
	{ id: "443", config: "3.4.4", solid: "triangular prism", eagerKs: [1, 2, 3, 4], lazyKs: [], complete: true, missing: [], counts: { 1: 3, 2: 6, 3: 1, 4: 4 } },
	{ id: "445", config: "4.4.5", solid: "pentagonal prism", eagerKs: [1, 2, 3, 5, 6, 10], lazyKs: [], complete: true, missing: [], counts: { 1: 3, 2: 1, 3: 18, 5: 10, 6: 21, 10: 11 } },
	{ id: "446", config: "4.4.6", solid: "hexagonal prism", eagerKs: [1, 2, 3, 4, 6, 8, 12], lazyKs: [], complete: true, missing: [], counts: { 1: 5, 2: 8, 3: 17, 4: 17, 6: 55, 8: 11, 12: 51 } },
	{ id: "447", config: "4.4.7", solid: "heptagonal prism", eagerKs: [1, 2, 4, 7, 8, 14], lazyKs: [], complete: true, missing: [], counts: { 1: 3, 2: 1, 4: 52, 7: 69, 8: 89, 14: 198 } },
	{ id: "448", config: "4.4.8", solid: "octagonal prism", eagerKs: [1, 2, 3, 4, 5, 6, 8, 10, 16], lazyKs: [], complete: true, missing: [], counts: { 1: 5, 2: 8, 3: 5, 4: 53, 5: 44, 6: 2, 8: 292, 10: 53, 16: 719 } },
	{ id: "663", config: "3.6.6", solid: "truncated tetrahedron", eagerKs: [1, 2, 3, 4, 6, 7, 12], lazyKs: [], complete: true, missing: [], counts: { 1: 3, 2: 5, 3: 11, 4: 14, 6: 11, 7: 58, 12: 53 } },
	{ id: "664", config: "4.6.6", solid: "truncated octahedron", eagerKs: [1, 2, 3, 4, 5, 6, 8, 10, 16], lazyKs: [12, 24], complete: true, missing: [], counts: { 1: 4, 2: 10, 3: 10, 4: 58, 5: 18, 6: 140, 8: 173, 10: 29, 12: 4776, 16: 885, 24: 101887 } }, // k=12 is 1.8 MB → lazy // k=24 is 38.6 MB → lazy
	{ id: "j27", config: "3.3.4.4 / 3.4.3.4", solid: "triangular orthobicupola (J27)", eagerKs: [2, 3, 4, 5, 6, 7, 9], lazyKs: [12], complete: true, missing: [], counts: { 2: 15, 3: 20, 4: 8, 5: 168, 6: 867, 7: 2159, 9: 504, 12: 77738 } }, // k=12 is 27.4 MB → lazy
	{ id: "j37", config: "3.4.4.4", solid: "pseudo-rhombicuboctahedron (J37)", eagerKs: [2, 3, 4, 6], lazyKs: [7], complete: false, missing: [], counts: { 2: 24, 3: 21, 4: 136, 6: 1068, 7: 4400 } }, // k=7 is 1.9 MB → lazy
	{ id: "3334", config: "3.3.3.4", solid: "square antiprism", eagerKs: [1, 2, 3, 4, 5, 8], lazyKs: [], complete: true, missing: [], counts: { 1: 5, 2: 9, 3: 8, 4: 91, 5: 105, 8: 504 } },
	{ id: "3335", config: "3.3.3.5", solid: "pentagonal antiprism", eagerKs: [1, 2, 3, 5, 6], lazyKs: [10], complete: true, missing: [], counts: { 1: 5, 2: 2, 3: 34, 5: 299, 6: 348, 10: 4477 } }, // k=10 is 1.4 MB → lazy
	{ id: "3336", config: "3.3.3.6", solid: "hexagonal antiprism", eagerKs: [1, 2, 3, 4, 6, 7], lazyKs: [12], complete: true, missing: [], counts: { 1: 5, 2: 17, 3: 33, 4: 33, 6: 974, 7: 1117, 12: 38698 } }, // k=12 is 12.9 MB → lazy
	{ id: "3337", config: "3.3.3.7", solid: "heptagonal antiprism", eagerKs: [1, 2, 4], lazyKs: [7, 8], complete: true, missing: [14], counts: { 1: 5, 2: 2, 4: 116, 7: 3124, 8: 3598 } },
	// ⚑ 5 / 9 / 8 / 91 / 105 at k = 1…5 is IDENTICAL to the square antiprism's, and it is not the same
	// data: zero drawn-sets are shared, and the solids differ (32 edges and 18 faces against 16 and 10).
	// The same coincidence IH01 and IH02 have on the isohedral shelf.
	// ⚑ `missing: [16]` is the big one: the census counts 2,925,191 there and the drop carries no k=16
	// file at all. Not our budget — the data is not in the drop.
	{ id: "3338", config: "3.3.3.8", solid: "octagonal antiprism", eagerKs: [1, 2, 3, 4, 5], lazyKs: [8, 9], complete: false, missing: [16], counts: { 1: 5, 2: 9, 3: 8, 4: 91, 5: 105, 8: 9928, 9: 11412 } }, // k=8 is 3.5 MB, k=9 is 4.1 MB -> lazy
	// The first CHIRAL board here: |G| = 24 (the rotation group O), not 48, so a mirrored development is
	// the enantiomorph and lands only because `board_project` tries the reflected frame too.
	{ id: "33334", config: "3.3.3.3.4", solid: "snub cube", eagerKs: [1, 2, 3, 4], lazyKs: [6], complete: false, missing: [8], counts: { 1: 7, 2: 8, 3: 152, 4: 1078, 6: 22029 } }, // k=6 is 10.1 MB → lazy // k=7 is 1.1 MB → lazy // k=8 is 1.2 MB → lazy
	{ id: "4443", config: "3.4.4.4", solid: "rhombicuboctahedron", eagerKs: [1, 2, 3, 4], lazyKs: [6, 7, 8], complete: false, missing: [], counts: { 1: 5, 2: 22, 3: 117, 4: 293, 6: 5118, 7: 5428, 8: 3288 } }, // k=6 is 2.1 MB → lazy // k=7 is 2.2 MB → lazy // k=8 is 1.4 MB → lazy
	{ id: "cuboctahedron", config: "3.4.3.4", solid: "cuboctahedron", eagerKs: [1, 2, 3, 4, 5, 6, 7, 8], lazyKs: [12], complete: true, missing: [], counts: { 1: 3, 2: 14, 3: 39, 4: 72, 5: 37, 6: 114, 7: 1304, 8: 150, 12: 19066 } }, // k=12 is 6.6 MB → lazy
];

export const SPH_EDGES_BOARD_BY_ID = new Map(SPH_EDGES_BOARDS.map((b) => [b.id, b]));

/** Every k a board ships, ascending. */
export function sphEdgesBoardKs(b: SphEdgesBoard): number[] {
	return [...b.eagerKs, ...b.lazyKs].sort((x, y) => x - y);
}

/** The k values missing between a board's lowest and highest. On a censused board every hole is a real
 *  property of the solid — Marek's census counts a literal zero there — and NOT a gap in the run. That
 *  is a claim about the holes only; whether the run itself finished is `complete`, and whether the drop
 *  carries every slice the census counts is `missing`. A surface that lists k values has to be able to
 *  say which of the three it is looking at, so the three stay separate. */
export function sphEdgesKGaps(b: SphEdgesBoard): number[] {
	const ks = sphEdgesBoardKs(b);
	if (ks.length < 2) return [];
	const have = new Set(ks);
	const out: number[] = [];
	for (let k = ks[0] + 1; k < ks[ks.length - 1]; k++) if (!have.has(k)) out.push(k);
	return out;
}

/** Lazy (board, k) shards to fetch when vertex-count `k` comes into view under the Spherical geometry. */
export function sphEdgesLazyShardsForK(k: number): SphEdgesBoard[] {
	return SPH_EDGES_BOARDS.filter((b) => b.lazyKs.includes(k));
}

export const sphEdgesShardUrl = (board: string, k: number): string => `/spherical-edges/x${board}-k${k}.json`;

/** The /play sub-axis key — namespaced so it cannot collide with a freedraw grid, a Platonic solid or
 *  the "sps-"/"hyp-"/"spc-" families. */
export const sphEdgesSub = (p: SphEdgesPattern): string => `spe-${p.board}`;
export const sphEdgesSubOfBoard = (b: SphEdgesBoard): string => `spe-${b.id}`;

/** Display label for a board id, from SPH_EDGES_BOARDS; falls back to the id. */
export function sphEdgesBoardLabel(boardId: string): string {
	return SPH_EDGES_BOARD_BY_ID.get(boardId)?.solid ?? boardId;
}

/** Card / search label: what the tiles ARE. A tile here is a run of the solid's own faces — squares,
 *  triangles, n-gons — so the honest noun is the count, not a polyform name that would imply one shape.
 *  On a closed board every tile is finite, so this is the real tile count. */
export function sphEdgesFamilyLabel(p: SphEdgesPattern): string {
	const n = p.stats.tiles;
	return `${n} tile${n === 1 ? "" : "s"}`;
}
