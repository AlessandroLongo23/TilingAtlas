// The board axis for the BASE hyperbolic tilings shelf — every k-uniform tiling by regular polygons the
// Čtrnáct engine found in H², k = 1 and 2, 28,453 of them in public/reference-atlas-hyperbolic.json.
//
// WHY IT EXISTS. That shelf shipped as one flat list: /play showed two rows, "k = 1  12168" and
// "k = 2  16285", and /library offered no board chips at all. Two numbers are not a catalogue. Every
// other shelf here is one row per BOARD — a fixed tile set at a fixed edge length — but this corpus has
// no board in that sense, because in H² each vertex configuration forces its OWN edge length. So the
// axis is built from the configuration itself, on the two things that describe a hyperbolic tiling
// before you look at it:
//
//   VALENCE   how many tiles meet at a vertex (the max over the k orbits), 3…8 here. The leading axis:
//             six rows, ordered, and it reads as a difficulty gradient — 7 tilings at valence 3 against
//             10,688 at valence 8.
//   ALPHABET  which polygon sizes the tiling uses, {3,4} or {4,6,8}. The same key the ai1/ai2 and edge
//             shelves are organised by, and what a reader actually asks for ("the ones with heptagons").
//
// A board is one (valence, alphabet) pair that occurs; there are 227. Beneath a board the tree splits
// once more, by VERTEX CONFIGURATION — 3,280 of them across the shelf — because a hyperbolic config does
// NOT determine its tiling the way a Euclidean one does: 12,168 uniform tilings realise only 2,591
// configs, and `4.6⁷` alone admits 147 distinct tilings. That level is where the shelf finally reaches
// human scale: the largest cell, valence 8 over {3,4} at k=2, is 5,581 tilings but only 77 configs, the
// biggest holding 876 and the median 24.
//
// THE TABLE IS GENERATED, never hand-edited: `node scripts/emit-hyp-tiling-boards.mjs`. Its `counts` and
// `configs` are what the shipped records actually contain, and hyp-tilings.test.ts re-derives both off
// the atlas so a stale row fails a test instead of mislabelling a row.

/** One board: the tilings of one alphabet whose busiest vertex carries `valence` tiles. */
export interface HypTilingBoard {
	/** Board id, "v8-3-4" — valence, then the alphabet. The sub-axis key is this with a "hyt-" prefix. */
	id: string;
	/** Tiles at the busiest vertex, the max over the k orbits. */
	valence: number;
	/** Polygon sizes used, ascending. */
	alphabet: number[];
	/** Distinct vertex configurations on this board — how many rows the config level renders. */
	configs: number;
	/** Tilings per k. */
	counts: Record<number, number>;
}

/** Every (valence, alphabet) pair that occurs, valence-major then alphabet ascending — the order the
 *  tree renders top to bottom. */
export const HYP_TILING_BOARDS: HypTilingBoard[] = [
	{ id: "v3-5-8", valence: 3, alphabet: [5, 8], configs: 1, counts: { 1: 1 } },
	{ id: "v3-6-7", valence: 3, alphabet: [6, 7], configs: 1, counts: { 1: 1 } },
	{ id: "v3-6-8", valence: 3, alphabet: [6, 8], configs: 2, counts: { 1: 2 } },
	{ id: "v3-7", valence: 3, alphabet: [7], configs: 1, counts: { 1: 1 } },
	{ id: "v3-7-8", valence: 3, alphabet: [7, 8], configs: 1, counts: { 1: 1 } },
	{ id: "v3-8", valence: 3, alphabet: [8], configs: 1, counts: { 1: 1 } },
	{ id: "v4-3-4-6", valence: 4, alphabet: [3, 4, 6], configs: 2, counts: { 1: 1, 2: 1 } },
	{ id: "v4-3-4-7", valence: 4, alphabet: [3, 4, 7], configs: 1, counts: { 1: 1 } },
	{ id: "v4-3-4-8", valence: 4, alphabet: [3, 4, 8], configs: 4, counts: { 1: 2, 2: 2 } },
	{ id: "v4-3-5-6", valence: 4, alphabet: [3, 5, 6], configs: 1, counts: { 1: 1 } },
	{ id: "v4-3-5-8", valence: 4, alphabet: [3, 5, 8], configs: 1, counts: { 1: 1 } },
	{ id: "v4-3-6", valence: 4, alphabet: [3, 6], configs: 2, counts: { 1: 3, 2: 2 } },
	{ id: "v4-3-6-7", valence: 4, alphabet: [3, 6, 7], configs: 1, counts: { 1: 1 } },
	{ id: "v4-3-6-8", valence: 4, alphabet: [3, 6, 8], configs: 4, counts: { 1: 2, 2: 2 } },
	{ id: "v4-3-7", valence: 4, alphabet: [3, 7], configs: 2, counts: { 1: 1, 2: 1 } },
	{ id: "v4-3-7-8", valence: 4, alphabet: [3, 7, 8], configs: 1, counts: { 1: 1 } },
	{ id: "v4-3-8", valence: 4, alphabet: [3, 8], configs: 4, counts: { 1: 2, 2: 4 } },
	{ id: "v4-4-5", valence: 4, alphabet: [4, 5], configs: 4, counts: { 1: 2, 2: 2 } },
	{ id: "v4-4-5-6", valence: 4, alphabet: [4, 5, 6], configs: 2, counts: { 1: 2 } },
	{ id: "v4-4-5-7", valence: 4, alphabet: [4, 5, 7], configs: 1, counts: { 1: 1 } },
	{ id: "v4-4-5-8", valence: 4, alphabet: [4, 5, 8], configs: 2, counts: { 1: 2 } },
	{ id: "v4-4-6", valence: 4, alphabet: [4, 6], configs: 7, counts: { 1: 7, 2: 13 } },
	{ id: "v4-4-6-7", valence: 4, alphabet: [4, 6, 7], configs: 2, counts: { 1: 2 } },
	{ id: "v4-4-6-8", valence: 4, alphabet: [4, 6, 8], configs: 11, counts: { 1: 8, 2: 16 } },
	{ id: "v4-4-7", valence: 4, alphabet: [4, 7], configs: 2, counts: { 1: 2 } },
	{ id: "v4-4-7-8", valence: 4, alphabet: [4, 7, 8], configs: 2, counts: { 1: 2 } },
	{ id: "v4-4-8", valence: 4, alphabet: [4, 8], configs: 7, counts: { 1: 6, 2: 16 } },
	{ id: "v4-5", valence: 4, alphabet: [5], configs: 1, counts: { 1: 1 } },
	{ id: "v4-5-6", valence: 4, alphabet: [5, 6], configs: 4, counts: { 1: 4, 2: 3 } },
	{ id: "v4-5-6-7", valence: 4, alphabet: [5, 6, 7], configs: 1, counts: { 1: 1 } },
	{ id: "v4-5-6-8", valence: 4, alphabet: [5, 6, 8], configs: 2, counts: { 1: 2 } },
	{ id: "v4-5-7", valence: 4, alphabet: [5, 7], configs: 1, counts: { 1: 1 } },
	{ id: "v4-5-7-8", valence: 4, alphabet: [5, 7, 8], configs: 1, counts: { 1: 1 } },
	{ id: "v4-5-8", valence: 4, alphabet: [5, 8], configs: 4, counts: { 1: 2, 2: 2 } },
	{ id: "v4-6", valence: 4, alphabet: [6], configs: 1, counts: { 1: 1 } },
	{ id: "v4-6-7", valence: 4, alphabet: [6, 7], configs: 3, counts: { 1: 4, 2: 1 } },
	{ id: "v4-6-7-8", valence: 4, alphabet: [6, 7, 8], configs: 2, counts: { 1: 2 } },
	{ id: "v4-6-8", valence: 4, alphabet: [6, 8], configs: 7, counts: { 1: 7, 2: 19 } },
	{ id: "v4-7", valence: 4, alphabet: [7], configs: 1, counts: { 1: 1 } },
	{ id: "v4-7-8", valence: 4, alphabet: [7, 8], configs: 2, counts: { 1: 2 } },
	{ id: "v4-8", valence: 4, alphabet: [8], configs: 1, counts: { 1: 1 } },
	{ id: "v5-3-4", valence: 5, alphabet: [3, 4], configs: 4, counts: { 1: 3, 2: 9 } },
	{ id: "v5-3-4-5", valence: 5, alphabet: [3, 4, 5], configs: 1, counts: { 1: 1 } },
	{ id: "v5-3-4-6", valence: 5, alphabet: [3, 4, 6], configs: 18, counts: { 1: 7, 2: 23 } },
	{ id: "v5-3-4-6-8", valence: 5, alphabet: [3, 4, 6, 8], configs: 2, counts: { 1: 2 } },
	{ id: "v5-3-4-7", valence: 5, alphabet: [3, 4, 7], configs: 1, counts: { 1: 1 } },
	{ id: "v5-3-4-8", valence: 5, alphabet: [3, 4, 8], configs: 16, counts: { 1: 5, 2: 22 } },
	{ id: "v5-3-5", valence: 5, alphabet: [3, 5], configs: 3, counts: { 1: 1, 2: 3 } },
	{ id: "v5-3-5-6", valence: 5, alphabet: [3, 5, 6], configs: 2, counts: { 1: 3 } },
	{ id: "v5-3-5-7", valence: 5, alphabet: [3, 5, 7], configs: 1, counts: { 1: 1 } },
	{ id: "v5-3-5-8", valence: 5, alphabet: [3, 5, 8], configs: 1, counts: { 1: 1 } },
	{ id: "v5-3-6", valence: 5, alphabet: [3, 6], configs: 8, counts: { 1: 7, 2: 29 } },
	{ id: "v5-3-6-7", valence: 5, alphabet: [3, 6, 7], configs: 2, counts: { 1: 3 } },
	{ id: "v5-3-6-8", valence: 5, alphabet: [3, 6, 8], configs: 18, counts: { 1: 7, 2: 25 } },
	{ id: "v5-3-7", valence: 5, alphabet: [3, 7], configs: 6, counts: { 1: 2, 2: 10 } },
	{ id: "v5-3-7-8", valence: 5, alphabet: [3, 7, 8], configs: 1, counts: { 1: 1 } },
	{ id: "v5-3-8", valence: 5, alphabet: [3, 8], configs: 9, counts: { 1: 8, 2: 51 } },
	{ id: "v5-4", valence: 5, alphabet: [4], configs: 1, counts: { 1: 1 } },
	{ id: "v5-4-5", valence: 5, alphabet: [4, 5], configs: 5, counts: { 1: 3, 2: 12 } },
	{ id: "v5-4-5-6", valence: 5, alphabet: [4, 5, 6], configs: 7, counts: { 1: 6, 2: 4 } },
	{ id: "v5-4-5-6-8", valence: 5, alphabet: [4, 5, 6, 8], configs: 2, counts: { 1: 2 } },
	{ id: "v5-4-5-8", valence: 5, alphabet: [4, 5, 8], configs: 7, counts: { 1: 4, 2: 7 } },
	{ id: "v5-4-6", valence: 5, alphabet: [4, 6], configs: 14, counts: { 1: 24, 2: 242 } },
	{ id: "v5-4-6-7", valence: 5, alphabet: [4, 6, 7], configs: 6, counts: { 1: 6, 2: 2 } },
	{ id: "v5-4-6-7-8", valence: 5, alphabet: [4, 6, 7, 8], configs: 2, counts: { 1: 2 } },
	{ id: "v5-4-6-8", valence: 5, alphabet: [4, 6, 8], configs: 51, counts: { 1: 46, 2: 633 } },
	{ id: "v5-4-7", valence: 5, alphabet: [4, 7], configs: 5, counts: { 1: 3, 2: 21 } },
	{ id: "v5-4-7-8", valence: 5, alphabet: [4, 7, 8], configs: 6, counts: { 1: 4, 2: 3 } },
	{ id: "v5-4-8", valence: 5, alphabet: [4, 8], configs: 14, counts: { 1: 25, 2: 459 } },
	{ id: "v5-5", valence: 5, alphabet: [5], configs: 1, counts: { 1: 1 } },
	{ id: "v5-5-6", valence: 5, alphabet: [5, 6], configs: 6, counts: { 1: 5, 2: 11 } },
	{ id: "v5-5-6-7", valence: 5, alphabet: [5, 6, 7], configs: 1, counts: { 1: 2 } },
	{ id: "v5-5-6-8", valence: 5, alphabet: [5, 6, 8], configs: 7, counts: { 1: 6, 2: 5 } },
	{ id: "v5-5-7", valence: 5, alphabet: [5, 7], configs: 1, counts: { 2: 6 } },
	{ id: "v5-5-8", valence: 5, alphabet: [5, 8], configs: 5, counts: { 1: 5, 2: 33 } },
	{ id: "v5-6", valence: 5, alphabet: [6], configs: 1, counts: { 1: 1 } },
	{ id: "v5-6-7", valence: 5, alphabet: [6, 7], configs: 7, counts: { 1: 5, 2: 29 } },
	{ id: "v5-6-7-8", valence: 5, alphabet: [6, 7, 8], configs: 6, counts: { 1: 6, 2: 3 } },
	{ id: "v5-6-8", valence: 5, alphabet: [6, 8], configs: 14, counts: { 1: 27, 2: 558 } },
	{ id: "v5-7", valence: 5, alphabet: [7], configs: 1, counts: { 1: 1 } },
	{ id: "v5-7-8", valence: 5, alphabet: [7, 8], configs: 5, counts: { 1: 5, 2: 40 } },
	{ id: "v5-8", valence: 5, alphabet: [8], configs: 1, counts: { 1: 1 } },
	{ id: "v6-3-4", valence: 6, alphabet: [3, 4], configs: 23, counts: { 1: 16, 2: 94 } },
	{ id: "v6-3-4-5", valence: 6, alphabet: [3, 4, 5], configs: 25, counts: { 1: 10, 2: 25 } },
	{ id: "v6-3-4-5-6", valence: 6, alphabet: [3, 4, 5, 6], configs: 8, counts: { 1: 5, 2: 6 } },
	{ id: "v6-3-4-5-7", valence: 6, alphabet: [3, 4, 5, 7], configs: 1, counts: { 1: 1 } },
	{ id: "v6-3-4-5-8", valence: 6, alphabet: [3, 4, 5, 8], configs: 3, counts: { 1: 3 } },
	{ id: "v6-3-4-6", valence: 6, alphabet: [3, 4, 6], configs: 119, counts: { 1: 38, 2: 466 } },
	{ id: "v6-3-4-6-7", valence: 6, alphabet: [3, 4, 6, 7], configs: 4, counts: { 1: 5 } },
	{ id: "v6-3-4-6-8", valence: 6, alphabet: [3, 4, 6, 8], configs: 20, counts: { 1: 24 } },
	{ id: "v6-3-4-7", valence: 6, alphabet: [3, 4, 7], configs: 7, counts: { 1: 10 } },
	{ id: "v6-3-4-7-8", valence: 6, alphabet: [3, 4, 7, 8], configs: 3, counts: { 1: 3 } },
	{ id: "v6-3-4-8", valence: 6, alphabet: [3, 4, 8], configs: 18, counts: { 1: 37 } },
	{ id: "v6-3-5", valence: 6, alphabet: [3, 5], configs: 14, counts: { 1: 8, 2: 63 } },
	{ id: "v6-3-5-6", valence: 6, alphabet: [3, 5, 6], configs: 28, counts: { 1: 10, 2: 34 } },
	{ id: "v6-3-5-6-7", valence: 6, alphabet: [3, 5, 6, 7], configs: 2, counts: { 1: 2 } },
	{ id: "v6-3-5-6-8", valence: 6, alphabet: [3, 5, 6, 8], configs: 4, counts: { 1: 5 } },
	{ id: "v6-3-5-7", valence: 6, alphabet: [3, 5, 7], configs: 3, counts: { 1: 3 } },
	{ id: "v6-3-5-7-8", valence: 6, alphabet: [3, 5, 7, 8], configs: 1, counts: { 1: 1 } },
	{ id: "v6-3-5-8", valence: 6, alphabet: [3, 5, 8], configs: 7, counts: { 1: 13 } },
	{ id: "v6-3-6", valence: 6, alphabet: [3, 6], configs: 23, counts: { 1: 22, 2: 351 } },
	{ id: "v6-3-6-7", valence: 6, alphabet: [3, 6, 7], configs: 9, counts: { 1: 10 } },
	{ id: "v6-3-6-7-8", valence: 6, alphabet: [3, 6, 7, 8], configs: 4, counts: { 1: 5 } },
	{ id: "v6-3-6-8", valence: 6, alphabet: [3, 6, 8], configs: 19, counts: { 1: 43 } },
	{ id: "v6-3-7", valence: 6, alphabet: [3, 7], configs: 3, counts: { 1: 3 } },
	{ id: "v6-3-7-8", valence: 6, alphabet: [3, 7, 8], configs: 7, counts: { 1: 13 } },
	{ id: "v6-3-8", valence: 6, alphabet: [3, 8], configs: 9, counts: { 1: 22 } },
	{ id: "v6-4", valence: 6, alphabet: [4], configs: 1, counts: { 1: 1 } },
	{ id: "v6-4-5", valence: 6, alphabet: [4, 5], configs: 18, counts: { 1: 13, 2: 157 } },
	{ id: "v6-4-5-6", valence: 6, alphabet: [4, 5, 6], configs: 57, counts: { 1: 30, 2: 188 } },
	{ id: "v6-4-5-6-7", valence: 6, alphabet: [4, 5, 6, 7], configs: 3, counts: { 1: 4 } },
	{ id: "v6-4-5-6-8", valence: 6, alphabet: [4, 5, 6, 8], configs: 19, counts: { 1: 23 } },
	{ id: "v6-4-5-7", valence: 6, alphabet: [4, 5, 7], configs: 2, counts: { 1: 4 } },
	{ id: "v6-4-5-7-8", valence: 6, alphabet: [4, 5, 7, 8], configs: 2, counts: { 1: 2 } },
	{ id: "v6-4-5-8", valence: 6, alphabet: [4, 5, 8], configs: 11, counts: { 1: 28 } },
	{ id: "v6-4-6", valence: 6, alphabet: [4, 6], configs: 28, counts: { 1: 82, 2: 3560 } },
	{ id: "v6-4-6-7", valence: 6, alphabet: [4, 6, 7], configs: 12, counts: { 1: 30 } },
	{ id: "v6-4-6-7-8", valence: 6, alphabet: [4, 6, 7, 8], configs: 19, counts: { 1: 23 } },
	{ id: "v6-4-6-8", valence: 6, alphabet: [4, 6, 8], configs: 56, counts: { 1: 267 } },
	{ id: "v6-4-7", valence: 6, alphabet: [4, 7], configs: 4, counts: { 1: 8 } },
	{ id: "v6-4-7-8", valence: 6, alphabet: [4, 7, 8], configs: 11, counts: { 1: 28 } },
	{ id: "v6-4-8", valence: 6, alphabet: [4, 8], configs: 11, counts: { 1: 105 } },
	{ id: "v6-5", valence: 6, alphabet: [5], configs: 1, counts: { 1: 1 } },
	{ id: "v6-5-6", valence: 6, alphabet: [5, 6], configs: 18, counts: { 1: 16, 2: 374 } },
	{ id: "v6-5-6-7", valence: 6, alphabet: [5, 6, 7], configs: 4, counts: { 1: 5 } },
	{ id: "v6-5-6-7-8", valence: 6, alphabet: [5, 6, 7, 8], configs: 3, counts: { 1: 4 } },
	{ id: "v6-5-6-8", valence: 6, alphabet: [5, 6, 8], configs: 12, counts: { 1: 35 } },
	{ id: "v6-5-7", valence: 6, alphabet: [5, 7], configs: 2, counts: { 1: 6 } },
	{ id: "v6-5-7-8", valence: 6, alphabet: [5, 7, 8], configs: 2, counts: { 1: 7 } },
	{ id: "v6-5-8", valence: 6, alphabet: [5, 8], configs: 5, counts: { 1: 19 } },
	{ id: "v6-6", valence: 6, alphabet: [6], configs: 1, counts: { 1: 1 } },
	{ id: "v6-6-7", valence: 6, alphabet: [6, 7], configs: 4, counts: { 1: 11 } },
	{ id: "v6-6-7-8", valence: 6, alphabet: [6, 7, 8], configs: 12, counts: { 1: 35 } },
	{ id: "v6-6-8", valence: 6, alphabet: [6, 8], configs: 11, counts: { 1: 100 } },
	{ id: "v6-7", valence: 6, alphabet: [7], configs: 1, counts: { 1: 1 } },
	{ id: "v6-7-8", valence: 6, alphabet: [7, 8], configs: 4, counts: { 1: 14 } },
	{ id: "v6-8", valence: 6, alphabet: [8], configs: 1, counts: { 1: 1 } },
	{ id: "v7-3", valence: 7, alphabet: [3], configs: 1, counts: { 1: 1 } },
	{ id: "v7-3-4", valence: 7, alphabet: [3, 4], configs: 41, counts: { 1: 40, 2: 670 } },
	{ id: "v7-3-4-5", valence: 7, alphabet: [3, 4, 5], configs: 107, counts: { 1: 27, 2: 376 } },
	{ id: "v7-3-4-5-6", valence: 7, alphabet: [3, 4, 5, 6], configs: 14, counts: { 1: 24 } },
	{ id: "v7-3-4-5-6-8", valence: 7, alphabet: [3, 4, 5, 6, 8], configs: 4, counts: { 1: 4 } },
	{ id: "v7-3-4-5-7", valence: 7, alphabet: [3, 4, 5, 7], configs: 6, counts: { 1: 7 } },
	{ id: "v7-3-4-5-8", valence: 7, alphabet: [3, 4, 5, 8], configs: 16, counts: { 1: 28 } },
	{ id: "v7-3-4-6", valence: 7, alphabet: [3, 4, 6], configs: 45, counts: { 1: 143 } },
	{ id: "v7-3-4-6-7", valence: 7, alphabet: [3, 4, 6, 7], configs: 14, counts: { 1: 24 } },
	{ id: "v7-3-4-6-7-8", valence: 7, alphabet: [3, 4, 6, 7, 8], configs: 4, counts: { 1: 4 } },
	{ id: "v7-3-4-6-8", valence: 7, alphabet: [3, 4, 6, 8], configs: 87, counts: { 1: 204 } },
	{ id: "v7-3-4-7", valence: 7, alphabet: [3, 4, 7], configs: 14, counts: { 1: 19 } },
	{ id: "v7-3-4-7-8", valence: 7, alphabet: [3, 4, 7, 8], configs: 16, counts: { 1: 28 } },
	{ id: "v7-3-4-8", valence: 7, alphabet: [3, 4, 8], configs: 46, counts: { 1: 168 } },
	{ id: "v7-3-5", valence: 7, alphabet: [3, 5], configs: 25, counts: { 1: 15, 2: 367 } },
	{ id: "v7-3-5-6", valence: 7, alphabet: [3, 5, 6], configs: 13, counts: { 1: 33 } },
	{ id: "v7-3-5-6-7", valence: 7, alphabet: [3, 5, 6, 7], configs: 3, counts: { 1: 3 } },
	{ id: "v7-3-5-6-8", valence: 7, alphabet: [3, 5, 6, 8], configs: 14, counts: { 1: 30 } },
	{ id: "v7-3-5-7", valence: 7, alphabet: [3, 5, 7], configs: 2, counts: { 1: 8 } },
	{ id: "v7-3-5-7-8", valence: 7, alphabet: [3, 5, 7, 8], configs: 6, counts: { 1: 10 } },
	{ id: "v7-3-5-8", valence: 7, alphabet: [3, 5, 8], configs: 16, counts: { 1: 35 } },
	{ id: "v7-3-6", valence: 7, alphabet: [3, 6], configs: 13, counts: { 1: 81 } },
	{ id: "v7-3-6-7", valence: 7, alphabet: [3, 6, 7], configs: 11, counts: { 1: 25 } },
	{ id: "v7-3-6-7-8", valence: 7, alphabet: [3, 6, 7, 8], configs: 14, counts: { 1: 30 } },
	{ id: "v7-3-6-8", valence: 7, alphabet: [3, 6, 8], configs: 45, counts: { 1: 172 } },
	{ id: "v7-3-7", valence: 7, alphabet: [3, 7], configs: 1, counts: { 1: 3 } },
	{ id: "v7-3-7-8", valence: 7, alphabet: [3, 7, 8], configs: 14, counts: { 1: 27 } },
	{ id: "v7-3-8", valence: 7, alphabet: [3, 8], configs: 13, counts: { 1: 71 } },
	{ id: "v7-4", valence: 7, alphabet: [4], configs: 1, counts: { 1: 1 } },
	{ id: "v7-4-5", valence: 7, alphabet: [4, 5], configs: 30, counts: { 1: 40, 2: 1649 } },
	{ id: "v7-4-5-6", valence: 7, alphabet: [4, 5, 6], configs: 25, counts: { 1: 108 } },
	{ id: "v7-4-5-6-7", valence: 7, alphabet: [4, 5, 6, 7], configs: 8, counts: { 1: 16 } },
	{ id: "v7-4-5-6-7-8", valence: 7, alphabet: [4, 5, 6, 7, 8], configs: 4, counts: { 1: 4 } },
	{ id: "v7-4-5-6-8", valence: 7, alphabet: [4, 5, 6, 8], configs: 76, counts: { 1: 185 } },
	{ id: "v7-4-5-7", valence: 7, alphabet: [4, 5, 7], configs: 8, counts: { 1: 16 } },
	{ id: "v7-4-5-7-8", valence: 7, alphabet: [4, 5, 7, 8], configs: 10, counts: { 1: 18 } },
	{ id: "v7-4-5-8", valence: 7, alphabet: [4, 5, 8], configs: 26, counts: { 1: 136 } },
	{ id: "v7-4-6", valence: 7, alphabet: [4, 6], configs: 16, counts: { 1: 338 } },
	{ id: "v7-4-6-7", valence: 7, alphabet: [4, 6, 7], configs: 23, counts: { 1: 100 } },
	{ id: "v7-4-6-7-8", valence: 7, alphabet: [4, 6, 7, 8], configs: 76, counts: { 1: 185 } },
	{ id: "v7-4-6-8", valence: 7, alphabet: [4, 6, 8], configs: 147, counts: { 1: 1482 } },
	{ id: "v7-4-7", valence: 7, alphabet: [4, 7], configs: 4, counts: { 1: 16 } },
	{ id: "v7-4-7-8", valence: 7, alphabet: [4, 7, 8], configs: 24, counts: { 1: 128 } },
	{ id: "v7-4-8", valence: 7, alphabet: [4, 8], configs: 16, counts: { 1: 462 } },
	{ id: "v7-5", valence: 7, alphabet: [5], configs: 1, counts: { 1: 1 } },
	{ id: "v7-5-6", valence: 7, alphabet: [5, 6], configs: 7, counts: { 1: 65 } },
	{ id: "v7-5-6-7", valence: 7, alphabet: [5, 6, 7], configs: 4, counts: { 1: 14 } },
	{ id: "v7-5-6-7-8", valence: 7, alphabet: [5, 6, 7, 8], configs: 8, counts: { 1: 22 } },
	{ id: "v7-5-6-8", valence: 7, alphabet: [5, 6, 8], configs: 25, counts: { 1: 137 } },
	{ id: "v7-5-7", valence: 7, alphabet: [5, 7], configs: 3, counts: { 1: 12 } },
	{ id: "v7-5-7-8", valence: 7, alphabet: [5, 7, 8], configs: 8, counts: { 1: 24 } },
	{ id: "v7-5-8", valence: 7, alphabet: [5, 8], configs: 8, counts: { 1: 63 } },
	{ id: "v7-6", valence: 7, alphabet: [6], configs: 1, counts: { 1: 1 } },
	{ id: "v7-6-7", valence: 7, alphabet: [6, 7], configs: 3, counts: { 1: 44 } },
	{ id: "v7-6-7-8", valence: 7, alphabet: [6, 7, 8], configs: 23, counts: { 1: 129 } },
	{ id: "v7-6-8", valence: 7, alphabet: [6, 8], configs: 16, counts: { 1: 462 } },
	{ id: "v7-7", valence: 7, alphabet: [7], configs: 1, counts: { 1: 1 } },
	{ id: "v7-7-8", valence: 7, alphabet: [7, 8], configs: 4, counts: { 1: 39 } },
	{ id: "v7-8", valence: 7, alphabet: [8], configs: 1, counts: { 1: 1 } },
	{ id: "v8-3", valence: 8, alphabet: [3], configs: 1, counts: { 1: 1 } },
	{ id: "v8-3-4", valence: 8, alphabet: [3, 4], configs: 99, counts: { 1: 111, 2: 5581 } },
	{ id: "v8-3-4-5", valence: 8, alphabet: [3, 4, 5], configs: 46, counts: { 1: 122 } },
	{ id: "v8-3-4-5-6", valence: 8, alphabet: [3, 4, 5, 6], configs: 83, counts: { 1: 148 } },
	{ id: "v8-3-4-5-6-7", valence: 8, alphabet: [3, 4, 5, 6, 7], configs: 12, counts: { 1: 16 } },
	{ id: "v8-3-4-5-7", valence: 8, alphabet: [3, 4, 5, 7], configs: 25, counts: { 1: 32 } },
	{ id: "v8-3-4-6", valence: 8, alphabet: [3, 4, 6], configs: 137, counts: { 1: 668 } },
	{ id: "v8-3-4-6-7", valence: 8, alphabet: [3, 4, 6, 7], configs: 77, counts: { 1: 136 } },
	{ id: "v8-3-4-7", valence: 8, alphabet: [3, 4, 7], configs: 32, counts: { 1: 71 } },
	{ id: "v8-3-5", valence: 8, alphabet: [3, 5], configs: 14, counts: { 1: 51 } },
	{ id: "v8-3-5-6", valence: 8, alphabet: [3, 5, 6], configs: 50, counts: { 1: 169 } },
	{ id: "v8-3-5-6-7", valence: 8, alphabet: [3, 5, 6, 7], configs: 24, counts: { 1: 41 } },
	{ id: "v8-3-5-7", valence: 8, alphabet: [3, 5, 7], configs: 14, counts: { 1: 29 } },
	{ id: "v8-3-6", valence: 8, alphabet: [3, 6], configs: 23, counts: { 1: 193 } },
	{ id: "v8-3-6-7", valence: 8, alphabet: [3, 6, 7], configs: 36, counts: { 1: 126 } },
	{ id: "v8-3-7", valence: 8, alphabet: [3, 7], configs: 6, counts: { 1: 69 } },
	{ id: "v8-4", valence: 8, alphabet: [4], configs: 1, counts: { 1: 1 } },
	{ id: "v8-4-5", valence: 8, alphabet: [4, 5], configs: 16, counts: { 1: 107 } },
	{ id: "v8-4-5-6", valence: 8, alphabet: [4, 5, 6], configs: 78, counts: { 1: 515 } },
	{ id: "v8-4-5-6-7", valence: 8, alphabet: [4, 5, 6, 7], configs: 48, counts: { 1: 89 } },
	{ id: "v8-4-5-7", valence: 8, alphabet: [4, 5, 7], configs: 25, counts: { 1: 77 } },
	{ id: "v8-4-6", valence: 8, alphabet: [4, 6], configs: 28, counts: { 1: 1244 } },
	{ id: "v8-4-6-7", valence: 8, alphabet: [4, 6, 7], configs: 61, counts: { 1: 442 } },
	{ id: "v8-4-7", valence: 8, alphabet: [4, 7], configs: 7, counts: { 1: 96 } },
	{ id: "v8-5", valence: 8, alphabet: [5], configs: 1, counts: { 1: 1 } },
	{ id: "v8-5-6", valence: 8, alphabet: [5, 6], configs: 16, counts: { 1: 208 } },
	{ id: "v8-5-6-7", valence: 8, alphabet: [5, 6, 7], configs: 22, counts: { 1: 103 } },
	{ id: "v8-5-7", valence: 8, alphabet: [5, 7], configs: 8, counts: { 1: 75 } },
	{ id: "v8-6", valence: 8, alphabet: [6], configs: 1, counts: { 1: 1 } },
	{ id: "v8-6-7", valence: 8, alphabet: [6, 7], configs: 7, counts: { 1: 164 } },
	{ id: "v8-7", valence: 8, alphabet: [7], configs: 1, counts: { 1: 1 } },
];

export const HYP_TILING_BOARD_BY_ID = new Map(HYP_TILING_BOARDS.map((b) => [b.id, b]));

/** The valences present, ascending — the family rows. */
export const HYP_TILING_VALENCES: number[] = [...new Set(HYP_TILING_BOARDS.map((b) => b.valence))].sort(
	(a, b) => a - b,
);

/**
 * (valence, alphabet) off a vertex configuration, or null when the string is not one.
 *
 * The ONE derivation, shared by the sub-axis and the emitter's check. "3.4.3.4.4.4.4 + 3.4.4.3.4.4.4"
 * → valence 7, alphabet [3, 4]: orbits are joined with " + ", faces within an orbit with ".", and the
 * valence is the MAX over orbits (not the sum, and not the first orbit's) — a 2-uniform tiling is as
 * crowded as its busiest vertex.
 */
export function hypTilingFacets(family: string): { valence: number; alphabet: number[] } | null {
	let valence = 0;
	const sizes = new Set<number>();
	for (const orbit of family.split("+")) {
		const ns = orbit.trim().split(".").map(Number);
		if (!ns.length || ns.some((n) => !Number.isInteger(n) || n < 3)) return null;
		valence = Math.max(valence, ns.length);
		for (const n of ns) sizes.add(n);
	}
	return { valence, alphabet: [...sizes].sort((a, b) => a - b) };
}

/** The /play sub-axis key for a base hyperbolic tiling, "hyt-v8-3-4". "" when the family is not a plain
 *  configuration, which puts the record back on the anonymous spine instead of inventing a board. */
export function hypTilingSub(family: string): string {
	const f = hypTilingFacets(family);
	return f ? `hyt-v${f.valence}-${f.alphabet.join("-")}` : "";
}

export const hypTilingSubOfBoard = (b: HypTilingBoard): string => `hyt-${b.id}`;

/** The family key a sub sits under — one per valence, so the tree heads them "8 at a vertex". */
export function hypTilingFamilyOfSub(sub: string): string | null {
	const m = /^hyt-v(\d+)-/.exec(sub);
	return m ? `hyt-v${m[1]}` : null;
}

/** "8 at a vertex" — the family heading. Says what the number IS; "valence 8" names the jargon and not
 *  the thing, and the sidebar has room for four words. */
export const hypTilingValenceLabel = (v: number): string => `${v} at a vertex`;

/**
 * The board row: which polygons, "3 · 4". The same separator hypPolyFamilyLabel uses on the ai1/ai2
 * shelf, so one alphabet reads the same everywhere in the atlas.
 *
 * ONE SIZE IS A REGULAR TILING, and it gets its Schläfli symbol instead: alphabet {7} at valence 3 is
 * {7,3}, not "7". There are 27 such boards and each holds exactly one tiling — the regular hyperbolic
 * tilings, which the shelf carried all along under a row that read "7  1".
 */
export const hypTilingBoardLabel = (b: Pick<HypTilingBoard, "alphabet" | "valence">): string =>
	b.alphabet.length === 1 ? `{${b.alphabet[0]},${b.valence}}` : b.alphabet.join(" · ");

/** Tilings on a board, across k. */
export const hypTilingBoardCount = (b: HypTilingBoard): number =>
	Object.values(b.counts).reduce((s, n) => s + n, 0);
