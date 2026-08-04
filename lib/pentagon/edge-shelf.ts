// The shelf manifest for the parametric-pentagon edge boards: what ships, per k, and where to fetch it.
// Numbers are the develop's own (experiments/results/pent-edges-1.md), matching Marek's census exactly:
// 13 / 103 / 628 / 3977 / 13272.

import type { PentEdgeRecord } from "./edgeDevelop";

export interface PentEdgeBoard {
	/** Board id, the Kershner type number as a string. */
	id: string;
	/** Kershner type. */
	type: number;
	label: string;
	/** The family's defining angle constraint, for the card. */
	constraint: string;
	/** k slices loaded on entering the shelf. */
	eagerKs: number[];
	/** k slices fetched only when that k comes into view. */
	lazyKs: number[];
	/** Whether Marek's enumeration finished. His census carries no MAX line and stops at k = 10, so no. */
	complete: boolean;
	/** k the census counts and this drop does not carry. None: every slice it counts is here. */
	missing: number[];
	counts: Record<number, number>;
}

/** ODD k IS EMPTY AND THAT IS THE BOARD, not a short run: the undecorated tiling already has two vertex
 *  orbits, so its bare record sits at k = 2 and there is no k = 1 to have. Marek's census agrees, with a
 *  literal zero at every odd k. `complete: false` because the census stops at k = 10 with no MAX marker,
 *  so the search itself has further to go. */
export const PENT_EDGE_BOARDS: PentEdgeBoard[] = [
	{
		id: "1",
		type: 1,
		label: "Type 1",
		constraint: "B + C = 180°",
		eagerKs: [2, 4, 6],
		lazyKs: [8, 10], // 8.4 MB and 35.2 MB
		complete: false,
		missing: [],
		counts: { 2: 13, 4: 103, 6: 628, 8: 3977, 10: 13272 },
	},
];

export const PENT_EDGE_BOARD_BY_ID = new Map(PENT_EDGE_BOARDS.map((b) => [b.id, b]));

export const pentEdgeShardUrl = (board: string, k: number): string =>
	`/pentagon-edges/pe${board}-k${k}.json`;

/** Every k a board ships, ascending. */
export function pentEdgeBoardKs(b: PentEdgeBoard): number[] {
	return [...b.eagerKs, ...b.lazyKs].sort((x, y) => x - y);
}

/** Lazy (board, k) shards to fetch when vertex-count `k` comes into view. */
export function pentEdgeLazyShardsForK(k: number): PentEdgeBoard[] {
	return PENT_EDGE_BOARDS.filter((b) => b.lazyKs.includes(k));
}

/** The /play sub-axis key, namespaced so it cannot collide with the other edge shelves. */
export const pentEdgeSub = (p: PentEdgeRecord): string => `pen-${p.type}`;
export const pentEdgeSubOfBoard = (b: PentEdgeBoard): string => `pen-${b.type}`;

/** Card label: what the decoration IS. A tile here is a run of pentagons merged across undrawn edges,
 *  so the honest noun is the drawn-edge count, which is what varies across the shelf. */
export function pentEdgeFamilyLabel(p: PentEdgeRecord): string {
	const n = p.stats.drawnEdges;
	return `${n} drawn edge${n === 1 ? "" : "s"}`;
}
