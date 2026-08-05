// The shelf manifest for the isohedral edge boards: what ships, per k, and where to fetch it.
// Numbers are the develop's own (experiments/results/ih-edges-01.md), matching Marek's census exactly:
// 5 / 15 / 60 / 275 / 744 / 4380 / 9280.
//
// Three claims about coverage, kept apart because they answer different questions and do not move
// together — the same vocabulary the spherical edge boards use (lib/freedraw/sph-edges.ts):
//
//   `complete`  — did the ENUMERATION finish? No: Marek's census carries no MAX line, so the search
//                 itself has further to go and the shelf must not read as exhausted.
//   `missing`   — k this drop does not carry a real count for. Empty on seven of the eight boards.
//                 ⚑ IH07 carries k = 14, and what it carries is a literal ZERO between 1,100 at k=12
//                 and 22,240 at k=16. No enumeration profile on this shelf jumps like that (the ratios
//                 either side are 4.8x and 20x, so k=14 should be somewhere near 5,000), so the census
//                 is read as SHORT at that k, not as proving it empty. Recorded here so the shelf does
//                 not present 12 -> 16 as contiguous. Worth a line to Marek.
//   `dropped`   — k the census counts, the drop carries, and OUR develop budget declined to ship: k=16
//                 on the first three boards, k=10 and k=12 on IH04, k=12 on IH05, k=12 and k=14 on
//                 IH06, k=16 and k=18 on IH07, k=9 and k=10 on IH08, k=12 on IH09, k=8 on IH10. A
//                 separate claim from the other two: nothing is wrong with those tilings, we simply have
//                 not paid for them yet, and the per-board budget is a size decision, not a fact about
//                 the corpus.

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

/** ⚑ ODD k IS EMPTY ON SEVEN BOARDS AND THAT IS THE BOARD, not a short run: their undecorated tiling
 *  already has two vertex orbits, so the bare record sits at k = 2 and there is no k = 1 to have, and
 *  Marek's census agrees with a literal zero at every odd k. IH08, IH09 and IH10 are the
 *  exceptions and none is a glitch: their bare tiling has a SINGLE vertex orbit, so their shelves start
 *  at k = 1 and every k after that is populated. Any code walking these boards two at a time is wrong;
 *  walk `counts`. ⚑ Nor is `counts` monotone in k — IH09 falls from 4,152 at k=10 to 3,244 at k=11. */
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
	{
		id: "05",
		ih: 5,
		label: "IH05",
		tile: "hexagon, four edge classes, four aspects",
		eagerKs: [2, 4, 6, 8],
		lazyKs: [10], // 6.2 MB
		complete: false,
		missing: [],
		dropped: { 12: 18737 },
		counts: { 2: 7, 4: 28, 6: 166, 8: 1040, 10: 2336 },
	},
	{
		id: "06",
		ih: 6,
		label: "IH06",
		tile: "hexagon, no side reversed, four aspects",
		eagerKs: [2, 4, 6, 8],
		lazyKs: [10], // 3.2 MB
		complete: false,
		missing: [],
		dropped: { 12: 7875, 14: 18844 },
		counts: { 2: 3, 4: 14, 6: 74, 8: 580, 10: 1224 },
	},
	{
		id: "07",
		ih: 7,
		label: "IH07",
		tile: "hexagon, three side pairs reversed, 3-fold centres",
		// Starts at k=4, not k=2: three of its six corners are 120° and meet three copies of themselves,
		// so the bare tiling already carries four vertex orbits.
		eagerKs: [4, 6, 8, 10],
		lazyKs: [12], // 3.5 MB
		complete: false,
		missing: [14], // a literal zero the counts either side contradict — see the header
		dropped: { 16: 22240, 18: 47180 },
		counts: { 4: 5, 6: 15, 8: 60, 10: 230, 12: 1100 },
	},
	{
		id: "08",
		ih: 8,
		label: "IH08",
		tile: "hexagon, three S edges, corners in three classes",
		// The only board with odd k, and the only one starting at k=1: one aspect and `abcabc` give it a
		// bare tiling with a single vertex orbit. Also the densest per k, which is why the budget stops
		// at 8 with 6,500 there against IH07's 1,100 at 12.
		eagerKs: [1, 2, 3, 4, 5, 6],
		lazyKs: [7, 8], // 3.4 MB and 13.7 MB
		complete: false,
		missing: [],
		dropped: { 9: 10777, 10: 29532 },
		counts: { 1: 5, 2: 15, 3: 52, 4: 175, 5: 360, 6: 1288, 7: 1840, 8: 6500 },
	},
	{
		id: "09",
		ih: 9,
		label: "IH09",
		tile: "hexagon, two edge classes, corners in three",
		// ⚑ Its census is NOT monotone: 4,152 at k=10 and 3,244 at k=11. That is the board and not a short
		// run — a k with more vertex orbits is not obliged to admit more edge systems, and the drop carries
		// every certificate the census counts at both.
		eagerKs: [1, 2, 3, 4, 5, 6, 7, 8],
		lazyKs: [9, 10, 11], // 3.1, 11.0 and 9.5 MB
		complete: false,
		missing: [],
		dropped: { 12: 30199 },
		counts: { 1: 3, 2: 4, 3: 14, 4: 41, 5: 64, 6: 205, 7: 244, 8: 1328, 9: 1313, 10: 4152, 11: 3244 },
	},
	{
		id: "10",
		ih: 10,
		label: "IH10",
		tile: "regular hexagon, one edge class, no parameters",
		// ⚑ The one board with NO parameters: Tactile hands back a single fixed tile, so the /play sliders
		// offer curvature and nothing else. One edge class and one corner class, which is also why its
		// drawn-edge minimum is 4 where every other board's is 8 or more.
		eagerKs: [1, 2, 3, 4, 5, 6],
		lazyKs: [7], // 5.4 MB
		complete: false,
		missing: [],
		dropped: { 8: 8192 },
		counts: { 1: 5, 2: 16, 3: 80, 4: 175, 5: 465, 6: 1651, 7: 3117 },
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
