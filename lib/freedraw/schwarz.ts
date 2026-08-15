// Schwarz-triangle edge systems (Marek Čtrnáct, 2026-07-28): the freedraw object on a (p,q,r) board,
// in all three geometries. A pattern is a periodic subset of the edges of the triangle tiling; drawn
// edges are modelled as DIGONS in the vertex figure; the tiles are the regions that fall out when
// triangles are merged across UNDRAWN edges. `k` counts vertex orbits of the decorated tiling.
//
// The board is the plane / sphere / disk cut by the mirrors of the (p,q,r) reflection group, so its
// one tile is a triangle with angles π/p, π/q, π/r and, when the three differ, THREE EDGE LENGTHS.
// That is what separates this shelf from every other freedraw catalogue: the tile is scalene, so a
// dart's turn and its edge length are both per-dart data, not "the interior angle of a regular
// p-gon at the one forced ℓ". Decoded by tools/ctrnact-oracle/develop_schwarz.py.
//
// The EUCLIDEAN board (2,3,6) is not here: it is the `sch236` planar-freedraw grid, developed exactly
// in ℤ[ζ₁₂] by develop_freedraw.py, because a Euclidean board has a period lattice to reduce onto and
// the other two do not. This file is the spherical and hyperbolic halves.

import type { Darts } from "@/lib/render/hyperbolicDevelopClient";

export type SchwarzGeometry = "spherical" | "hyperbolic";

export interface SchwarzBoard {
	/** Stable id, the digit triple Marek's corpora use: "234". */
	id: string;
	/** Angle triple (p, q, r) — the triangle's angles are π/p, π/q, π/r. */
	pqr: [number, number, number];
	/** Display label, "(2,3,4)". */
	label: string;
	geometry: SchwarzGeometry;
	/** k slices eager-loaded on entering the geometry (small). */
	eagerKs: number[];
	/** k slices fetched only when that k comes into view (the dense tails). */
	lazyKs: number[];
	/** Tilings per k, so a catalogue can show the size of a slice before fetching it. */
	counts: Record<number, number>;
}

/** Shared record fields: what every Schwarz pattern carries whatever its curvature. */
interface SchwarzCommon {
	/** "ss234-5-00012" (spherical) | "hs237-3-00001" (hyperbolic). */
	id: string;
	k: number;
	/** Board id — the sub-axis, e.g. "234". */
	board: string;
	/** Board label, "(2,3,4)". */
	label: string;
	/** A chiral solution (from an `_o_` certificate); its mirror image is implied, not listed. */
	chiral?: boolean;
}

/** The board itself: the (p,q,r) sphere every pattern on it decorates. Shipped ONCE per shard, not per
 *  record — every development of one board is the same sphere (a decoration says which edges are drawn,
 *  never where the triangles are), and the developer aligns them all onto this one indexing. Doing that
 *  is what makes the dense slices shippable: (2,2,4) at k=10 is 61,914 tilings, which cost 74 MB with
 *  the geometry repeated and under 10 MB without.
 *
 *  There is no canonical solid to index into instead — the (2,3,4) board is the disdyakis dodecahedron,
 *  the (2,3,5) the disdyakis triacontahedron, and the (2,2,n) boards have no Platonic name at all — so
 *  the geometry travels with the catalogue. */
export interface SphBoardGeometry {
	/** Unit vectors, one per board vertex. */
	vertices: [number, number, number][];
	/** The Schwarz triangles, each a ring of three vertex indices. */
	faces: [number, number, number][];
	/** Every board edge, as a vertex-index pair. Indexes the per-pattern `drawn` string. */
	edges: [number, number][];
}

/** One spherical pattern as shipped: which board edges it draws, and which merged tile each triangle
 *  ended up in. Both are indexed against the shard's board. */
export interface SphSchwarzPattern extends SchwarzCommon {
	geometry: "spherical";
	/** Merged-tile id per board triangle (parallel to `geom.faces`) — the fill colour key. */
	faceTile: number[];
	/** One "0"/"1" per board edge (parallel to `geom.edges`): 1 is a drawn tile boundary, 0 the faint
	 *  scaffold. A string, not an array — at 61,914 records a JSON array of ints doubles the shard. */
	drawn: string;
	/** Certificate vertex-orbit label per board vertex. */
	vorbit: number[];
	/** The shard's board, attached at load and SHARED by every pattern in it (never copied). */
	geom: SphBoardGeometry;
	stats: {
		/** Merged tiles on the whole sphere — the real count, not an orbit count. */
		tiles: number;
		/** Triangles per tile, descending. */
		tileSizes: number[];
		triangles: number;
		verts: number;
		edges: number;
		drawnEdges: number;
		/** Tile ORBITS (tiles up to the tiling's own symmetry), from the quotient. */
		tileOrbits: number;
		edgeOrbits: number;
		drawnEdgeOrbits: number;
	};
}

/** A spherical shard exactly as it sits in public/schwarz-sph/s<board>-k<k>.json. */
export interface SphSchwarzShard extends SphBoardGeometry {
	board: string;
	label: string;
	geometry: "spherical";
	k: number;
	patterns: Omit<SphSchwarzPattern, "geom">[];
}

/** Attach the shard's board to each of its patterns. One shared object per shard. */
export function hydrateSphShard(shard: SphSchwarzShard): SphSchwarzPattern[] {
	const geom: SphBoardGeometry = { vertices: shard.vertices, faces: shard.faces, edges: shard.edges };
	return shard.patterns.map((p) => ({ ...p, geom }));
}

/** A hyperbolic board develops forever, so the record ships the quotient half-edge structure and every
 *  render path re-develops it under the live view — the same contract as the {p,q} edge shelf. What is
 *  new is `alpha`/`elen`/`drawn` inside `darts`: on a scalene board none of the three is derivable from
 *  polygon sizes (every face is a triangle, every edge carries a digon), so all three are explicit. */
export interface HypSchwarzPattern extends SchwarzCommon {
	geometry: "hyperbolic";
	/** The board's three edge-class lengths, ascending — a coordinate, since H² has no similarity. */
	edges: number[];
	/** Reference-development triangle count — a size hint, not geometry. */
	tiles: number;
	darts: Darts;
	stats: {
		tileOrbits: number;
		/** Merged-tile orbits that closed to a finite polyform. */
		finite: number;
		/** Merged-tile orbits that never closed within the develop cap. */
		unbounded: number;
		/** Triangle count per tile orbit; -1 = unbounded. */
		sizes: number[];
		edgeOrbits: number;
		drawnEdgeOrbits: number;
	};
	residual: { edgeErr: number; faceErr: number };
}

export type SchwarzPattern = SphSchwarzPattern | HypSchwarzPattern;

/** The boards shipped today, one row per corpus decoded under public/schwarz-{sph,hyp}/. Adding a board
 *  is one row here plus one row in schwarz_board.py's BOARDS. Depth tracks Marek's runs, and the
 *  eager/lazy split tracks the decoded shard sizes: small slices load with the geometry, the dense tails
 *  wait for their k chip. */
export const SCHWARZ_BOARDS: SchwarzBoard[] = [
	// Spherical. (2,2,n) is the dihedral family — 4n triangles round two poles, a board with no Platonic
	// name; (2,3,3) (2,3,4) (2,3,5) are the tetrahedral, octahedral and icosahedral boards, 24 / 48 / 120
	// triangles, the barycentric subdivisions whose duals are the tetrakis and disdyakis solids.
	//
	// The k COVERAGE IS MAREK'S RUN, NOT THE BOARD. Two boards have holes in it — (2,2,4) has no k=8 and
	// (2,3,5) no k=4 — and those are gaps in the solve, not empty slices. schwarzKGaps() below is what the
	// UI says that with; do not quietly present the list as a complete enumeration.
	//
	// ⚑ TWO BOARDS ARE STILL SHORT — (2,3,5) and (2,3,7). Two solver bugs, both fixed upstream:
	//   · a wrong definition on the boards whose triangle has THREE different angles — (2,3,4) (2,3,5)
	//     (2,3,6) (2,3,7) (2,4,5) — dropped every tiling that draws the longest edge class. This is the
	//     F2-never-appears flag: on a short board E2 (third class undrawn) names every scalene
	//     certificate and F2 (drawn) names none. Corrected solvers are in
	//     materials/_as-received/corrections.zip. (2,3,6) and (2,4,5) were re-derived 2026-07-29;
	//     (2,3,4) is Marek's full corrected solve of 2026-08-06, below. Those reruns arrive in a NEW
	//     ALPHABET (corners A<n>, digons X10..X13 instead of S<n> and A2..F2) — see the `Dialect` note
	//     in tools/ctrnact-oracle/schwarz_board.py.
	//   · too few starting vertices on (2,2,3) and (2,2,4), losing tilings built only from the excluded
	//     ones. (2,2,3) is CORRECTED here (2,297 → 2,347, and the all-edges-drawn pattern it was missing
	//     is back at ss223-2-00007); (2,2,4) is still rerunning.
	// (2,3,3) and (2,4,4) are in neither bug and stand as shipped.
	{ id: "223", pqr: [2, 2, 3], label: "(2,2,3)", geometry: "spherical", eagerKs: [2, 3, 4, 5, 6, 7, 8], lazyKs: [] , counts: { 2: 7, 3: 35, 4: 129, 5: 171, 6: 121, 7: 34, 8: 1850 } },
	{ id: "224", pqr: [2, 2, 4], label: "(2,2,4)", geometry: "spherical", eagerKs: [2, 3, 4, 5, 6, 7, 9], lazyKs: [10] , counts: { 2: 10, 3: 52, 4: 52, 5: 780, 6: 1165, 7: 963, 9: 321, 10: 61914 } }, // k=10 is 61,914 tilings / 23 MB
	// (2,2,5), Marek's 2026-08-12 drop. Its two holes are NOT like the others on this shelf: his census
	// counts a literal 0 at k=9 and k=10, so those slices are empty properties of the board, and the
	// same census stops at k=11 without a MAX line, so the run itself is budget-capped there. Every
	// shipped k reproduces the census exactly (21,642 certificates, 0 develop failures).
	{ id: "225", pqr: [2, 2, 5], label: "(2,2,5)", geometry: "spherical", eagerKs: [2, 3, 4, 5], lazyKs: [6, 7, 8, 11] , counts: { 2: 7, 3: 4, 4: 244, 5: 98, 6: 4709, 7: 7372, 8: 6532, 11: 2676 } }, // k=6 1.8 MB, k=7 2.8 MB, k=8 2.5 MB, k=11 1.1 MB
	{ id: "233", pqr: [2, 3, 3], label: "(2,3,3)", geometry: "spherical", eagerKs: [2, 3, 4, 5, 6], lazyKs: [7] , counts: { 2: 4, 3: 111, 4: 464, 5: 654, 6: 1966, 7: 45580 } }, // k=7 is 45,580 / 19 MB
	// (2,3,4) is Marek's CORRECTED solve of 2026-08-06, k=1..8 in one run — 90,470 certificates against
	// the short solver's 5,974, and the shelf now stops at k=8 because the corrected run does. The old
	// k=9/10/11 slices (86 / 1,603 / 3,529) were the F2-buggy solver's and were DROPPED, not kept as
	// lower bounds: with k=8 at 62,095 a k=9 of 86 reads as a fact about the board and is not one. What
	// the bug cost, per slice: 5 → 10, 2 → 13, 80 → 1,568, 81 → 2,181, 196 → 24,603, 392 → 62,095.
	{ id: "234", pqr: [2, 3, 4], label: "(2,3,4)", geometry: "spherical", eagerKs: [3, 4, 5, 6], lazyKs: [7, 8] , counts: { 3: 10, 4: 13, 5: 1568, 6: 2181, 7: 24603, 8: 62095 } }, // k=7 is 24,603 / 13 MB, k=8 62,095 / 32 MB
	{ id: "235", pqr: [2, 3, 5], label: "(2,3,5)", geometry: "spherical", eagerKs: [3, 5], lazyKs: [] , counts: { 3: 4, 5: 31 } },
	// Hyperbolic. Marek's runs here are short — these two are the small end of the hyperbolic Schwarz
	// family, and (2,3,7) is the smallest hyperbolic triangle there is.
	{ id: "237", pqr: [2, 3, 7], label: "(2,3,7)", geometry: "hyperbolic", eagerKs: [3], lazyKs: [] , counts: { 3: 4 } },
	{ id: "245", pqr: [2, 4, 5], label: "(2,4,5)", geometry: "hyperbolic", eagerKs: [3, 4], lazyKs: [] , counts: { 3: 10, 4: 13 } },
];

export const SCHWARZ_BOARD_BY_ID = new Map(SCHWARZ_BOARDS.map((b) => [b.id, b]));

export const sphSchwarzBoards = () => SCHWARZ_BOARDS.filter((b) => b.geometry === "spherical");
export const hypSchwarzBoards = () => SCHWARZ_BOARDS.filter((b) => b.geometry === "hyperbolic");

/** Every k a board ships, ascending. */
export function schwarzBoardKs(b: SchwarzBoard): number[] {
	return [...b.eagerKs, ...b.lazyKs].sort((x, y) => x - y);
}

/** The k values MISSING from a board's run, between its lowest and highest. A hole here is a gap in
 *  Marek's solve, not a fact about the board — every surface that lists a board's k values has to be
 *  able to say so, or the shelf reads a partial corpus as a complete enumeration. */
export function schwarzKGaps(b: SchwarzBoard): number[] {
	const ks = schwarzBoardKs(b);
	if (ks.length < 2) return [];
	const have = new Set(ks);
	const out: number[] = [];
	for (let k = ks[0] + 1; k < ks[ks.length - 1]; k++) if (!have.has(k)) out.push(k);
	return out;
}

/** The static asset holding one (board, k) slice. */
export function schwarzShardUrl(b: SchwarzBoard, k: number): string {
	return b.geometry === "spherical" ? `/schwarz-sph/s${b.id}-k${k}.json` : `/schwarz-hyp/h${b.id}-k${k}.json`;
}

/** Lazy (board, k) shards to fetch when vertex-count `k` comes into view under a given geometry — the
 *  per-board analogue of freedrawLazyShardsForK / hypEdgesLazyShardsForK. */
export function schwarzLazyShardsForK(geometry: SchwarzGeometry, k: number): SchwarzBoard[] {
	return SCHWARZ_BOARDS.filter((b) => b.geometry === geometry && b.lazyKs.includes(k));
}

/** The /play sub-axis key. "sps-" spherical Schwarz, "hys-" hyperbolic Schwarz — namespaced so neither
 *  can collide with a freedraw grid, a solid name, or the "hyp-"/"hyc-"/"spc-" families. */
export const schwarzSubOfBoard = (b: SchwarzBoard): string =>
	`${b.geometry === "spherical" ? "sps" : "hys"}-${b.id}`;

export const schwarzSub = (p: SchwarzPattern): string =>
	`${p.geometry === "spherical" ? "sps" : "hys"}-${p.board}`;

/** Display label for a board id, from SCHWARZ_BOARDS; falls back to the id in parentheses. */
export function schwarzBoardLabel(boardId: string): string {
	return SCHWARZ_BOARD_BY_ID.get(boardId)?.label ?? `(${boardId.split("").join(",")})`;
}

/** Card / search label: what the tiles ARE. A Schwarz tile is a run of 30-60-90-style triangles, so the
 *  finite noun is "polydrafter" — the same word the Euclidean sch236 grid uses, and the reason the two
 *  read as one family across the geometry split. On the sphere every tile is finite (the board is
 *  closed), so the count is the real tile count; in H² a tile can be unbounded. */
export function schwarzFamilyLabel(p: SchwarzPattern): string {
	if (p.geometry === "spherical") {
		const n = p.stats.tiles;
		return `${n} polydrafter${n === 1 ? "" : "s"}`;
	}
	const { finite, unbounded } = p.stats;
	const parts: string[] = [];
	if (finite) parts.push(`${finite} polydrafter${finite === 1 ? "" : "s"}`);
	if (unbounded) parts.push(`${unbounded} unbounded`);
	return parts.join(" + ") || "empty";
}

/** What the hyperbolic render paths need off a Schwarz record — the same shape a HypEdgesPattern gives
 *  them, so HyperbolicEdgesThumbnail / HyperbolicEdgesCanvas draw this shelf unchanged. `edge` is the
 *  SHORTEST class length: it is only the renderer's base scale, since the real per-dart lengths travel
 *  inside `darts.elen`. */
export function hypSchwarzMeta(p: HypSchwarzPattern) {
	return { id: p.id, config: p.label, edge: p.edges[0], darts: p.darts };
}

/** Tile sizes present in a pattern, for the /library size facet: triangles per merged tile. -1 (an
 *  unbounded hyperbolic tile) is dropped — "how big" has no answer there. */
export function schwarzTileSizes(p: SchwarzPattern): number[] {
	const raw = p.geometry === "spherical" ? p.stats.tileSizes : p.stats.sizes;
	return [...new Set(raw.filter((n) => n > 0))].sort((a, b) => a - b);
}
