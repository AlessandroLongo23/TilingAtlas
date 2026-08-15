// Hyperbolic TILINGS BY REGULAR POLYGONS — not edge systems and not colourings. Every edge is a real
// tile boundary and every face is its own tile. Two of Marek Čtrnáct's infinite families share the
// shelf, each a one-parameter board indexed by n:
//
//   ai1 — 3.4.n.4 (2026-07-31). ℓ is the edge length at which the figure 3.4.n.4 closes, and at that
//         one ℓ exactly three figures close: 3.4.n.4, 3.4.4.n (the same multiset in another cyclic
//         order) and 4.n.2n, the last by the identity α(3,ℓ) + α(4,ℓ) = α(2n,ℓ). Alphabet {3, 4, n, 2n}.
//         Board ids are the bare n; records read `hp7-14-00003`.
//
//   ai2 — {3,n} (2026-08-07). ℓ is the REGULAR tiling {3,n}'s own edge length, n·α(3,ℓ) = 2π, and there
//         the n-gon's angle is exactly twice the triangle's: α(n,ℓ) = 4π/n = 2·α(3,ℓ), again an identity
//         and not a coincidence. Alphabet {3, n}, and a vertex closes iff a + 2b = n for a triangles and
//         b n-gons — so {3,7} carries 3^7, 3^5.7, 3.3.7.3.7 and 3.7.7.7, and {3,12} runs from 3^12 all
//         the way to 12^6 = {12,6}. Board ids are prefixed `t` (the triangle board), records read
//         `hpt7-3-00005`, and the shards sit beside ai1's in the same directory.
//
// Both render through the renderer the colored-tiling shelf already uses: a record ships DARTS, and
// lib/render/hyperbolicDevelopClient.ts::developColors re-develops them under the live view, fills each
// face by its `faceColor` index and strokes every edge. `faceColor` is the index of the face's SIZE in
// the board's sorted alphabet, so one colour means one polygon size across the whole shelf. Decoded by
// tools/ctrnact-oracle/develop_ai1.py and develop_ai2.py.
//
// Small n is not hyperbolic in either family and lives elsewhere: ai1 is spherical at n = 3, 4, 5 and
// Euclidean at n = 6; ai2 is spherical at n = 3, 4, 5 (tetrahedron, octahedron, icosahedron) and
// Euclidean at n = 6, where it is the triangle-hexagon catalogue the regular-palette shelf already
// carries. Marek's ai1 drops cover n = 7…12, 14…20 and 23 (no 13, 21, 22); ai2 covers 7…15, contiguous.

import type { Darts } from "@/lib/render/hyperbolicDevelopClient";

/** One board: every tiling in its family's alphabet at the one edge length that family fixes. */
export interface HypPolyBoard {
	/** Board id, and the shard's file stem: "7" for ai1's 3.4.7.4, "t7" for ai2's {3,7}. */
	id: string;
	/** The family parameter. NOT unique on its own — n = 7 names one board in each family. */
	n: number;
	/** The defining figure, "3.4.7.4" or "{3,7}" — also what names the board's edge length. */
	label: string;
	/** Which one-parameter family the board belongs to. Drives the sub-axis prefix and nothing else. */
	family: "ai1" | "ai2";
	/** k slices eager-loaded on entering the Hyperbolic geometry — the five lowest, all tiny. */
	eagerKs: number[];
	/** k slices fetched only when that k comes into view. */
	lazyKs: number[];
	/** k values Marek ENUMERATED and this shelf does NOT ship (the develop budget, not the board).
	 *  Kept so a surface can say the board is truncated instead of implying it is exhausted. */
	dropped: number[];
	/**
	 * k values Marek's own CENSUS counts and whose certificates his drop does not contain.
	 *
	 * ⚑ A THIRD claim, and the strongest one against calling a board complete: `dropped` is our budget,
	 * `hypPolyKGaps` is a hole the enumeration proved empty, and this is neither — the count exists and
	 * the data does not. Present only where the drop shipped a `solution_list.txt` to compare the files
	 * against: ai1 n = 13, 17, 18, 19, 20, 23 and every ai2 board but t13 and t15. ABSENT means UNKNOWN
	 * and never "none". Do not default it to an empty array.
	 */
	missing?: number[];
	/** Tilings per shipped k. */
	counts: Record<number, number>;
}

export interface HypPolyPattern {
	/** "hp7-14-00003" or "hpt7-3-00005" — board id, k, index. */
	id: string;
	name: string;
	k: number;
	/** Board id: "7" (ai1) or "t7" (ai2). */
	base: string;
	/** Vertex figures of the k orbits, joined: "3.4.7.4 + 4.7.14", "3.3.3.3.3.3.3 + 3.3.3.3.3.7". Full
	 *  cycles — Marek's certificates list one corner per site orbit, so `(A3)D14a` is 3^7 and the
	 *  decoder expands it before it ships. */
	config: string;
	/** Board label, "3.4.7.4" or "{3,7}". */
	family: string;
	/** The forced edge length ℓ — a coordinate, since H² has no similarity. */
	edge: number;
	/** A chiral solution (from an `_o_` certificate); its mirror is implied, not listed. */
	chiral?: boolean;
	/**
	 * Per-pixel renderability, stamped offline by scripts/stamp-hyp-poly-certification.ts. False means
	 * buildDirichletDomain refuses this tiling (its deck orbit needs developing past the float64 safe rim,
	 * Rdev > 10.6) and clients go straight to the 2D developed renderer instead of paying the doomed
	 * attempt, which costs a median 210 ms and up to 1.2 s on the main thread. Capability metadata, not
	 * catalog policy: the tiling is real and ships either way. Absent = untried → attempt it.
	 */
	certified?: boolean;
	/** Reference-development face count — a size hint, not geometry. */
	tiles: number;
	/** The sole render input, re-developed under the view. */
	darts: Darts;
	stats: {
		faceOrbits: number;
		/** The board's polygon sizes, ascending — indexes `darts.faceColor`. */
		sizes: number[];
		/** How many quotient faces of each size. */
		sizeCensus: number[];
		vertexOrbits: number;
	};
}

/** The boards shipped today, derived from the shards in public/hyperbolic-poly/ — nothing here is
 *  transcribed by hand. tools/ctrnact-oracle/emit_board_tables.py prints this table off the shards and
 *  the develop reports; re-run it after a develop and paste.
 *
 *  ALMOST EVERY BOARD IS TRUNCATED, and `dropped` says where. ai1's drop is 232,000 hyperbolic
 *  certificates at ~1.5 KB of darts each and ai2's is 601,437 at ~1 KB; `--budget` (4,000 for ai1,
 *  15,000 for ai2) ships a contiguous k prefix per board and names the tail it left behind. A board's
 *  highest shipped k is a budget, never an enumeration result — the four ai2 boards with an empty
 *  `dropped` (t11, t13, t14, t15) are the exception, and they carry every certificate Marek's run
 *  produced, which is still not the same as the board being exhausted: t11 and t14 have a `missing` k
 *  their own census counts.
 *
 *  The k holes BELOW the cap are different, and real: n = 11 has nothing at k = 2…5, 8…10, 15, 16, and
 *  that is the corpus, not the budget. `hypPolyKGaps` separates the two. */
export const HYP_POLY_BOARDS: HypPolyBoard[] = [
	{ id: "7", n: 7, label: "3.4.7.4", family: "ai1", eagerKs: [1, 4, 5, 8, 9], lazyKs: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34], dropped: [35, 36, 37, 38, 39, 40], counts: { 1: 1, 4: 2, 5: 2, 8: 3, 9: 2, 11: 3, 12: 6, 13: 3, 14: 7, 15: 12, 16: 11, 17: 4, 18: 11, 19: 17, 20: 16, 21: 40, 22: 39, 23: 64, 24: 61, 25: 64, 26: 95, 27: 190, 28: 397, 29: 314, 30: 319, 31: 335, 32: 418, 33: 403, 34: 713 } },
	{ id: "8", n: 8, label: "3.4.8.4", family: "ai1", eagerKs: [1, 2, 3, 4, 5], lazyKs: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], dropped: [19, 20, 21, 22], counts: { 1: 2, 2: 1, 3: 2, 4: 1, 5: 6, 6: 7, 7: 7, 8: 16, 9: 22, 10: 34, 11: 63, 12: 87, 13: 123, 14: 215, 15: 302, 16: 478, 17: 787, 18: 1327 } },
	{ id: "9", n: 9, label: "3.4.9.4", family: "ai1", eagerKs: [1, 2, 3, 5, 6], lazyKs: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21], dropped: [22, 23, 24, 25], counts: { 1: 1, 2: 1, 3: 1, 5: 1, 6: 4, 7: 7, 8: 4, 9: 15, 10: 17, 11: 10, 12: 23, 13: 10, 14: 54, 15: 59, 16: 102, 17: 156, 18: 252, 19: 475, 20: 578, 21: 1192 } },
	{ id: "10", n: 10, label: "3.4.10.4", family: "ai1", eagerKs: [1, 2, 3, 4, 5], lazyKs: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], dropped: [17, 18, 19, 20], counts: { 1: 2, 2: 1, 3: 2, 4: 2, 5: 1, 6: 8, 7: 14, 8: 15, 9: 28, 10: 50, 11: 89, 12: 114, 13: 248, 14: 263, 15: 599, 16: 1214 } },
	{ id: "11", n: 11, label: "3.4.11.4", family: "ai1", eagerKs: [1, 6, 7, 11, 12], lazyKs: [13, 14, 17, 18, 19, 20, 21, 22], dropped: [23, 24, 25, 26, 27, 28], counts: { 1: 1, 6: 2, 7: 2, 11: 15, 12: 34, 13: 27, 14: 4, 17: 193, 18: 370, 19: 310, 20: 87, 21: 8, 22: 472 } },
	{ id: "12", n: 12, label: "3.4.12.4", family: "ai1", eagerKs: [1, 2, 3, 4, 5], lazyKs: [6, 7, 8, 9, 10, 11, 12], dropped: [13, 14, 15], counts: { 1: 2, 2: 2, 3: 3, 4: 5, 5: 6, 6: 19, 7: 46, 8: 77, 9: 203, 10: 338, 11: 610, 12: 1344 } },
	{ id: "13", n: 13, label: "3.4.13.4", family: "ai1", eagerKs: [1, 7, 8, 13, 14], lazyKs: [15, 16, 20], dropped: [21, 22, 23, 24, 26], missing: [27, 28, 29, 30], counts: { 1: 1, 7: 4, 8: 4, 13: 33, 14: 104, 15: 94, 16: 23, 20: 2097 } },
	{ id: "14", n: 14, label: "3.4.14.4", family: "ai1", eagerKs: [1, 2, 4, 5, 6], lazyKs: [7, 8, 9, 10, 11, 12, 13, 14, 15], dropped: [16, 17, 18, 19, 20], counts: { 1: 2, 2: 1, 4: 4, 5: 6, 6: 3, 7: 3, 8: 24, 9: 39, 10: 48, 11: 81, 12: 163, 13: 175, 14: 659, 15: 1259 } },
	{ id: "15", n: 15, label: "3.4.15.4", family: "ai1", eagerKs: [1, 2, 3, 4, 5], lazyKs: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], dropped: [17, 18, 19, 20], counts: { 1: 1, 2: 1, 3: 2, 4: 1, 5: 1, 6: 2, 7: 3, 8: 20, 9: 20, 10: 38, 11: 92, 12: 104, 13: 156, 14: 287, 15: 781, 16: 1894 } },
	{ id: "16", n: 16, label: "3.4.16.4", family: "ai1", eagerKs: [1, 2, 3, 4, 5], lazyKs: [6, 7, 8, 9, 10, 11, 12, 13, 14], dropped: [15, 16, 17], counts: { 1: 2, 2: 1, 3: 2, 4: 1, 5: 6, 6: 7, 7: 7, 8: 39, 9: 104, 10: 163, 11: 312, 12: 501, 13: 915, 14: 1851 } },
	{ id: "17", n: 17, label: "3.4.17.4", family: "ai1", eagerKs: [1, 9, 10, 11, 17], lazyKs: [18, 19], dropped: [20, 21], missing: [26, 27, 28, 29, 30], counts: { 1: 1, 9: 9, 10: 18, 11: 9, 17: 716, 18: 1672, 19: 1274 } },
	{ id: "18", n: 18, label: "3.4.18.4", family: "ai1", eagerKs: [1, 2, 3, 4, 5], lazyKs: [6, 7, 8, 9, 10, 11, 12], dropped: [13, 14, 15, 16, 17], missing: [], counts: { 1: 2, 2: 2, 3: 1, 4: 3, 5: 9, 6: 19, 7: 22, 8: 34, 9: 125, 10: 256, 11: 474, 12: 1092 } },
	{ id: "19", n: 19, label: "3.4.19.4", family: "ai1", eagerKs: [1, 10, 11, 12, 13], lazyKs: [19], dropped: [20, 21, 22, 23], missing: [], counts: { 1: 1, 10: 21, 11: 26, 12: 12, 13: 7, 19: 2039 } },
	{ id: "20", n: 20, label: "3.4.20.4", family: "ai1", eagerKs: [1, 2, 3, 4, 5], lazyKs: [6, 7, 8, 9, 10, 11, 12], dropped: [13, 14, 15], missing: [], counts: { 1: 2, 2: 1, 3: 4, 4: 3, 5: 3, 6: 13, 7: 26, 8: 36, 9: 65, 10: 259, 11: 684, 12: 1183 } },
	{ id: "23", n: 23, label: "3.4.23.4", family: "ai1", eagerKs: [1, 12, 13, 14], lazyKs: [], dropped: [23], missing: [], counts: { 1: 1, 12: 54, 13: 108, 14: 54 } },
	{ id: "t7", n: 7, label: "{3,7}", family: "ai2", eagerKs: [1, 2, 3, 4], lazyKs: [5, 6], dropped: [7], missing: [], counts: { 1: 3, 2: 8, 3: 52, 4: 191, 5: 1452, 6: 6333 } },
	{ id: "t8", n: 8, label: "{3,8}", family: "ai2", eagerKs: [1, 2], lazyKs: [3], dropped: [4], missing: [], counts: { 1: 9, 2: 85, 3: 1656 } },
	{ id: "t9", n: 9, label: "{3,9}", family: "ai2", eagerKs: [1, 2], lazyKs: [3], dropped: [4], missing: [], counts: { 1: 10, 2: 169, 3: 7460 } },
	{ id: "t10", n: 10, label: "{3,10}", family: "ai2", eagerKs: [1], lazyKs: [2], dropped: [3], missing: [], counts: { 1: 16, 2: 1559 } },
	{ id: "t11", n: 11, label: "{3,11}", family: "ai2", eagerKs: [1, 2], lazyKs: [], dropped: [], missing: [3], counts: { 1: 18, 2: 681 } },
	{ id: "t12", n: 12, label: "{3,12}", family: "ai2", eagerKs: [1], lazyKs: [], dropped: [2], missing: [], counts: { 1: 152 } },
	{ id: "t13", n: 13, label: "{3,13}", family: "ai2", eagerKs: [1], lazyKs: [2], dropped: [], counts: { 1: 38, 2: 13107 } },
	{ id: "t14", n: 14, label: "{3,14}", family: "ai2", eagerKs: [1], lazyKs: [], dropped: [], missing: [2], counts: { 1: 235 } },
	{ id: "t15", n: 15, label: "{3,15}", family: "ai2", eagerKs: [1], lazyKs: [], dropped: [], counts: { 1: 566 } },
];

export const HYP_POLY_BOARD_BY_ID = new Map(HYP_POLY_BOARDS.map((b) => [b.id, b]));

/** Board label: the figure the board's family is defined by, and the figure that fixes its edge length.
 *  Read off the table, not rebuilt from the id — with two families sharing the shelf there is no rule
 *  from "t7" to "{3,7}" that would not also have to know the families. */
export const hypPolyBoardLabel = (id: string): string => HYP_POLY_BOARD_BY_ID.get(id)?.label ?? id;

/** Every k a board ships, ascending. */
export function hypPolyBoardKs(b: HypPolyBoard): number[] {
	return [...b.eagerKs, ...b.lazyKs].sort((x, y) => x - y);
}

/** The k values missing BETWEEN a board's lowest and highest shipped k. These are corpus facts (Marek
 *  enumerated nothing there), unlike `dropped`, which is this shelf's develop budget. Two different
 *  claims, so two different fields — a surface that conflates them tells the reader a board is exhausted
 *  when it is only truncated. */
export function hypPolyKGaps(b: HypPolyBoard): number[] {
	const ks = hypPolyBoardKs(b);
	if (ks.length < 2) return [];
	const have = new Set(ks);
	const out: number[] = [];
	for (let k = ks[0] + 1; k < ks[ks.length - 1]; k++) if (!have.has(k)) out.push(k);
	return out;
}

/** Lazy (board, k) shards to fetch when vertex-count `k` comes into view under the Hyperbolic geometry. */
export function hypPolyLazyShardsForK(k: number): HypPolyBoard[] {
	return HYP_POLY_BOARDS.filter((b) => b.lazyKs.includes(k));
}

export const hypPolyShardUrl = (n: string | number, k: number): string => `/hyperbolic-poly/hp${n}-k${k}.json`;

/** The /play sub-axis key — namespaced against the "hyp-" edge bases and the "hyc-" colourings, and
 *  split by family so the tree can head the two separately ("3.4.n.4 boards" against "{3,n} boards")
 *  while `familyOfSub` stays a prefix test. One rule, two callers: a board and a record must never
 *  disagree about which row a tiling belongs to. */
const subOfBoardId = (id: string): string => (id.startsWith("t") ? `hpt-${id.slice(1)}` : `hpo-${id}`);
export const hypPolySub = (p: HypPolyPattern): string => subOfBoardId(p.base);
export const hypPolySubOfBoard = (b: HypPolyBoard): string => subOfBoardId(b.id);

/** What the colored-tiling canvas and thumbnail read (HypColorsThumbInput). The "colour count" is the
 *  board's alphabet size — this shelf fills a face by its POLYGON SIZE, so the palette needs one entry
 *  per size, and `darts.faceColor` is already the index into `stats.sizes`. */
export function hypPolyMeta(p: HypPolyPattern) {
	// `certified` has to come along: this object IS what the canvas and thumbnail see, so dropping it here
	// would read as "untried" and put every hyp-poly tiling back on the doomed certification attempt.
	return { id: p.id, config: p.family, edge: p.edge, darts: p.darts, colors: p.stats.sizes.length, certified: p.certified };
}

/** Card / search label: which regular polygons the tiling actually uses, e.g. "3 · 4 · 7". The board's
 *  alphabet has four sizes but most tilings use three, so this names the ones present, not the alphabet. */
export function hypPolyFamilyLabel(p: HypPolyPattern): string {
	const used = p.stats.sizes.filter((_, i) => p.stats.sizeCensus[i] > 0);
	return used.join(" · ");
}
