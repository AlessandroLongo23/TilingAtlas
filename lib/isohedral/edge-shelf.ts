// The shelf manifest for the isohedral edge boards: what ships, per k, and where to fetch it.
// Numbers are the develop's own (experiments/results/ih-edges-01.md), matching Marek's census exactly:
// 5 / 15 / 60 / 275 / 744 / 4380 / 9280.
//
// Three claims about coverage, kept apart because they answer different questions and do not move
// together — the same vocabulary the spherical edge boards use (lib/freedraw/sph-edges.ts):
//
//   `complete`  — did the ENUMERATION finish? No: Marek's census carries no MAX line, so the search
//                 itself has further to go and the shelf must not read as exhausted.
//   `missing`   — k the census counts and this drop does not carry. None; every k it counts is here.
//   `dropped`   — k the census counts, the drop carries, and OUR develop budget declined to ship. k=16,
//                 at 54,630 certificates. A separate claim from the other two: nothing is wrong with
//                 those tilings, we simply have not paid for them yet.

import type { IhEdgeRecord } from "./edgeDevelop";

export interface IhEdgeBoard {
	/** Board id, the isohedral type number zero-padded to two digits, as it appears in the shard name. */
	id: string;
	/** Tactile's type number, 1 to 93. */
	ih: number;
	label: string;
	/** What the tile IS, for the card. */
	tile: string;
	/** k slices loaded on entering the shelf. */
	eagerKs: number[];
	/** k slices fetched only when that k comes into view. */
	lazyKs: number[];
	/** Whether Marek's enumeration finished. */
	complete: boolean;
	/** k the census counts and this drop does not carry. */
	missing: number[];
	/** k the drop carries and our develop budget declined to ship, with their census counts. */
	dropped: Record<number, number>;
	counts: Record<number, number>;
}

/** ODD k IS EMPTY AND THAT IS THE BOARD, not a short run: the undecorated tiling already has two vertex
 *  orbits, so its bare record sits at k = 2 and there is no k = 1 to have. Marek's census agrees, with a
 *  literal zero at every odd k. */
export const IH_EDGE_BOARDS: IhEdgeBoard[] = [
	{
		id: "01",
		ih: 1,
		label: "IH01",
		tile: "general hexagon, opposite sides paired",
		eagerKs: [2, 4, 6, 8, 10],
		lazyKs: [12, 14], // 14.1 MB and 35.0 MB
		complete: false,
		missing: [],
		dropped: { 16: 54630 },
		counts: { 2: 5, 4: 15, 6: 60, 8: 275, 10: 744, 12: 4380, 14: 9280 },
	},
	{
		id: "02",
		ih: 2,
		label: "IH02",
		tile: "hexagon, one side pair reflected",
		eagerKs: [2, 4, 6, 8, 10],
		lazyKs: [12, 14], // 14.1 MB and 35.1 MB
		complete: false,
		missing: [],
		dropped: { 16: 54630 },
		// IDENTICAL to IH01's, k for k, and it is not a mistake: zero of the 14,759 decoded records is
		// shared between the two boards and no source file is byte-identical, so the two corpora really
		// are different data. Both boards are hexagons with three edge classes over the same four-letter
		// digon alphabet, so the number of edge systems up to symmetry comes out the same at every k.
		counts: { 2: 5, 4: 15, 6: 60, 8: 275, 10: 744, 12: 4380, 14: 9280 },
	},
	{
		id: "03",
		ih: 3,
		label: "IH03",
		tile: "hexagon, two side pairs reflected",
		eagerKs: [2, 4, 6, 8, 10],
		lazyKs: [12, 14], // 14.1 MB and 35.1 MB
		complete: false,
		missing: [],
		dropped: { 16: 54630 },
		counts: { 2: 5, 4: 15, 6: 60, 8: 275, 10: 744, 12: 4380, 14: 9280 },
	},
	{
		id: "04",
		ih: 4,
		label: "IH04",
		tile: "hexagon, five edge classes, four of them S",
		eagerKs: [2, 4, 6],
		lazyKs: [8], // 8.4 MB
		complete: false,
		missing: [],
		// A much deeper board than the first three, and the counts say why: FIVE edge classes instead of
		// three, so k grows the search far faster and our budget stops at 8 where theirs reached 14.
		dropped: { 10: 13272, 12: 95328 },
		counts: { 2: 13, 4: 103, 6: 628, 8: 3977 },
	},
];

export const IH_EDGE_BOARD_BY_ID = new Map(IH_EDGE_BOARDS.map((b) => [b.id, b]));

export const ihEdgeShardUrl = (board: string, k: number): string =>
	`/isohedral-edges/ie${board}-k${k}.json`;

/** Every k a board ships, ascending. */
export function ihEdgeBoardKs(b: IhEdgeBoard): number[] {
	return [...b.eagerKs, ...b.lazyKs].sort((x, y) => x - y);
}

/** Lazy (board, k) shards to fetch when vertex-count `k` comes into view. */
export function ihEdgeLazyShardsForK(k: number): IhEdgeBoard[] {
	return IH_EDGE_BOARDS.filter((b) => b.lazyKs.includes(k));
}

/** The /play sub-axis key, namespaced so it cannot collide with the other edge shelves. */
export const ihEdgeSub = (p: IhEdgeRecord): string => `ih-${p.ih}`;
export const ihEdgeSubOfBoard = (b: IhEdgeBoard): string => `ih-${b.ih}`;

/** Card label: what the decoration IS. A tile here is a run of hexagons merged across undrawn edges, so
 *  the honest noun is the drawn-edge count, which is what varies across the shelf. */
export function ihEdgeFamilyLabel(p: IhEdgeRecord): string {
	const n = p.stats.drawnEdges;
	return `${n} drawn edge${n === 1 ? "" : "s"}`;
}
