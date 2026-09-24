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
	/** The family parameter. NOT unique on its own — n = 7 names one board in each family. 0 on the
	 *  `abcd` boards, which are not a one-parameter family: their id IS their vertex figure. */
	n: number;
	/** The defining figure, "3.4.7.4" or "{3,7}" — also what names the board's edge length. */
	label: string;
	/** Which family the board belongs to. Drives the sub-axis prefix and nothing else.
	 *
	 *  "abcd" is Marek's `abcdtest`: not a one-parameter family but every 4-valent vertex figure a.b.c.d
	 *  over polygon sizes 3…11 that closes hyperbolically — 248 boards. Its alphabet is exactly its own
	 *  digits, where ai1's is {3, 4, n, 2n}; `Board.abcd` in develop_ai1.py is the whole difference. */
	family: "ai1" | "ai2" | "abcd";
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
 *  NOTHING IS TRUNCATED ANY MORE, and `dropped` is empty on every row. Until 2026-08-31 this shelf ran
 *  ai1 and ai2 under a `--budget` (4,000 and 15,000 certificates) that shipped a contiguous k prefix per
 *  board and named the tail it left behind: 64 k slices across 19 boards, ~950,000 tilings Marek had
 *  enumerated and a reader could not reach. That is the omission CLAUDE.md now forbids outright, and it
 *  was affordable to undo the moment the shards were stored gzipped — 2,191,775 tilings in 110 MB.
 *  `dropped` stays on the type because a future corpus may not fit in one run, but an entry here is now
 *  a bug to fix, not a fact to record.
 *
 *  The k holes are the ones that remain, and they are real: n = 11 has nothing at k = 2…5, 8…10, 15, 16,
 *  and that is the corpus. `hypPolyKGaps` reports them; `missing` is the third and strongest claim, a k
 *  Marek's own census counts whose certificates his drop does not carry. */
export const HYP_POLY_BOARDS: HypPolyBoard[] = [
	{ id: "7", n: 7, label: "3.4.7.4", family: "ai1", eagerKs: [1, 4, 5, 8, 9], lazyKs: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40], dropped: [], counts: { 1: 1, 4: 2, 5: 2, 8: 3, 9: 2, 11: 3, 12: 6, 13: 3, 14: 7, 15: 12, 16: 11, 17: 4, 18: 11, 19: 17, 20: 16, 21: 40, 22: 39, 23: 64, 24: 61, 25: 64, 26: 95, 27: 190, 28: 397, 29: 314, 30: 319, 31: 335, 32: 418, 33: 403, 34: 713, 35: 1927, 36: 1832, 37: 1566, 38: 1985, 39: 2629, 40: 2968 } },
	{ id: "8", n: 8, label: "3.4.8.4", family: "ai1", eagerKs: [1, 2, 3, 4, 5], lazyKs: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22], dropped: [], counts: { 1: 2, 2: 1, 3: 2, 4: 1, 5: 6, 6: 7, 7: 7, 8: 16, 9: 22, 10: 34, 11: 63, 12: 87, 13: 123, 14: 215, 15: 302, 16: 478, 17: 787, 18: 1327, 19: 2050, 20: 3467, 21: 5243, 22: 9005 } },
	{ id: "9", n: 9, label: "3.4.9.4", family: "ai1", eagerKs: [1, 2, 3, 5, 6], lazyKs: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25], dropped: [], counts: { 1: 1, 2: 1, 3: 1, 5: 1, 6: 4, 7: 7, 8: 4, 9: 15, 10: 17, 11: 10, 12: 23, 13: 10, 14: 54, 15: 59, 16: 102, 17: 156, 18: 252, 19: 475, 20: 578, 21: 1192, 22: 1101, 23: 2065, 24: 3284, 25: 4705 } },
	{ id: "10", n: 10, label: "3.4.10.4", family: "ai1", eagerKs: [1, 2, 3, 4, 5], lazyKs: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], dropped: [], counts: { 1: 2, 2: 1, 3: 2, 4: 2, 5: 1, 6: 8, 7: 14, 8: 15, 9: 28, 10: 50, 11: 89, 12: 114, 13: 248, 14: 263, 15: 599, 16: 1214, 17: 1745, 18: 2920, 19: 4631, 20: 10463 } },
	{ id: "11", n: 11, label: "3.4.11.4", family: "ai1", eagerKs: [1, 6, 7, 11, 12], lazyKs: [13, 14, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28], dropped: [], counts: { 1: 1, 6: 2, 7: 2, 11: 15, 12: 34, 13: 27, 14: 4, 17: 193, 18: 370, 19: 310, 20: 87, 21: 8, 22: 472, 23: 3645, 24: 6745, 25: 4611, 26: 1819, 27: 231, 28: 32042 } },
	{ id: "12", n: 12, label: "3.4.12.4", family: "ai1", eagerKs: [1, 2, 3, 4, 5], lazyKs: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15], dropped: [], counts: { 1: 2, 2: 2, 3: 3, 4: 5, 5: 6, 6: 19, 7: 46, 8: 77, 9: 203, 10: 338, 11: 610, 12: 1344, 13: 2610, 14: 4756, 15: 10437 } },
	{ id: "13", n: 13, label: "3.4.13.4", family: "ai1", eagerKs: [1, 7, 8, 13, 14], lazyKs: [15, 16, 20, 21, 22, 23, 24, 26], dropped: [], missing: [27, 28, 29, 30], counts: { 1: 1, 7: 4, 8: 4, 13: 33, 14: 104, 15: 94, 16: 23, 20: 2097, 21: 3782, 22: 2246, 23: 853, 24: 72, 26: 10956 } },
	{ id: "14", n: 14, label: "3.4.14.4", family: "ai1", eagerKs: [1, 2, 4, 5, 6], lazyKs: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], dropped: [], counts: { 1: 2, 2: 1, 4: 4, 5: 6, 6: 3, 7: 3, 8: 24, 9: 39, 10: 48, 11: 81, 12: 163, 13: 175, 14: 659, 15: 1259, 16: 2127, 17: 2602, 18: 4811, 19: 9045, 20: 14801 } },
	{ id: "15", n: 15, label: "3.4.15.4", family: "ai1", eagerKs: [1, 2, 3, 4, 5], lazyKs: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], dropped: [], counts: { 1: 1, 2: 1, 3: 2, 4: 1, 5: 1, 6: 2, 7: 3, 8: 20, 9: 20, 10: 38, 11: 92, 12: 104, 13: 156, 14: 287, 15: 781, 16: 1894, 17: 1670, 18: 3781, 19: 7677, 20: 10590 } },
	{ id: "16", n: 16, label: "3.4.16.4", family: "ai1", eagerKs: [1, 2, 3, 4, 5], lazyKs: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17], dropped: [], counts: { 1: 2, 2: 1, 3: 2, 4: 1, 5: 6, 6: 7, 7: 7, 8: 39, 9: 104, 10: 163, 11: 312, 12: 501, 13: 915, 14: 1851, 15: 2691, 16: 9264, 17: 19700 } },
	{ id: "17", n: 17, label: "3.4.17.4", family: "ai1", eagerKs: [1, 9, 10, 11, 17], lazyKs: [18, 19, 20, 21], dropped: [], missing: [26, 27, 28, 29, 30], counts: { 1: 1, 9: 9, 10: 18, 11: 9, 17: 716, 18: 1672, 19: 1274, 20: 414, 21: 120 } },
	{ id: "18", n: 18, label: "3.4.18.4", family: "ai1", eagerKs: [1, 2, 3, 4, 5], lazyKs: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17], dropped: [], missing: [], counts: { 1: 2, 2: 2, 3: 1, 4: 3, 5: 9, 6: 19, 7: 22, 8: 34, 9: 125, 10: 256, 11: 474, 12: 1092, 13: 1992, 14: 4596, 15: 8549, 16: 15091, 17: 29858 } },
	{ id: "19", n: 19, label: "3.4.19.4", family: "ai1", eagerKs: [1, 10, 11, 12, 13], lazyKs: [19, 20, 21, 22, 23], dropped: [], missing: [], counts: { 1: 1, 10: 21, 11: 26, 12: 12, 13: 7, 19: 2039, 20: 5835, 21: 5822, 22: 2372, 23: 374 } },
	{ id: "20", n: 20, label: "3.4.20.4", family: "ai1", eagerKs: [1, 2, 3, 4, 5], lazyKs: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15], dropped: [], missing: [], counts: { 1: 2, 2: 1, 3: 4, 4: 3, 5: 3, 6: 13, 7: 26, 8: 36, 9: 65, 10: 259, 11: 684, 12: 1183, 13: 2731, 14: 4239, 15: 10416 } },
	{ id: "23", n: 23, label: "3.4.23.4", family: "ai1", eagerKs: [1, 12, 13, 14], lazyKs: [23], dropped: [], missing: [], counts: { 1: 1, 12: 54, 13: 108, 14: 54, 23: 43668 } },
	{ id: "t7", n: 7, label: "{3,7}", family: "ai2", eagerKs: [1, 2, 3, 4], lazyKs: [5, 6, 7], dropped: [], missing: [], counts: { 1: 3, 2: 8, 3: 52, 4: 191, 5: 1452, 6: 6333, 7: 31101 } },
	{ id: "t8", n: 8, label: "{3,8}", family: "ai2", eagerKs: [1, 2], lazyKs: [3, 4], dropped: [], missing: [], counts: { 1: 9, 2: 85, 3: 1656, 4: 27638 } },
	{ id: "t9", n: 9, label: "{3,9}", family: "ai2", eagerKs: [1, 2], lazyKs: [3, 4], dropped: [], missing: [], counts: { 1: 10, 2: 169, 3: 7460, 4: 269728 } },
	{ id: "t10", n: 10, label: "{3,10}", family: "ai2", eagerKs: [1], lazyKs: [2, 3], dropped: [], missing: [], counts: { 1: 16, 2: 1559, 3: 154668 } },
	{ id: "t11", n: 11, label: "{3,11}", family: "ai2", eagerKs: [1, 2], lazyKs: [], dropped: [], missing: [3], counts: { 1: 18, 2: 681 } },
	{ id: "t12", n: 12, label: "{3,12}", family: "ai2", eagerKs: [1], lazyKs: [2], dropped: [], missing: [], counts: { 1: 152, 2: 84502 } },
	{ id: "t13", n: 13, label: "{3,13}", family: "ai2", eagerKs: [1], lazyKs: [2], dropped: [], counts: { 1: 38, 2: 13107 } },
	{ id: "t14", n: 14, label: "{3,14}", family: "ai2", eagerKs: [1], lazyKs: [], dropped: [], missing: [2], counts: { 1: 235 } },
	{ id: "t15", n: 15, label: "{3,15}", family: "ai2", eagerKs: [1], lazyKs: [], dropped: [], counts: { 1: 566 } },
	{ id: "3369", n: 0, label: "3,3,6,9", family: "abcd", eagerKs: [], lazyKs: [2], dropped: [], counts: { 2: 1 } },
	{ id: "3377", n: 0, label: "3,3,7,7", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "3388", n: 0, label: "3,3,8,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "3399", n: 0, label: "3,3,9,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "33aa", n: 0, label: "3,3,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "33bb", n: 0, label: "3,3,11,11", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "3447", n: 0, label: "3,4,4,7", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "3448", n: 0, label: "3,4,4,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "3449", n: 0, label: "3,4,4,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "344a", n: 0, label: "3,4,4,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "344b", n: 0, label: "3,4,4,11", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "3466", n: 0, label: "3,4,6,6", family: "abcd", eagerKs: [], lazyKs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], dropped: [], counts: { 1: 1, 2: 1, 3: 1, 4: 2, 5: 7, 6: 7, 7: 7, 8: 12, 9: 22, 10: 35, 11: 38, 12: 98, 13: 177, 14: 231, 15: 331 } },
	{ id: "3477", n: 0, label: "3,4,7,7", family: "abcd", eagerKs: [], lazyKs: [7, 8, 14, 15], dropped: [], counts: { 7: 4, 8: 1, 14: 28, 15: 1 } },
	{ id: "3488", n: 0, label: "3,4,8,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "348a", n: 0, label: "3,4,8,10", family: "abcd", eagerKs: [], lazyKs: [12], dropped: [], counts: { 12: 6 } },
	{ id: "3499", n: 0, label: "3,4,9,9", family: "abcd", eagerKs: [], lazyKs: [6, 9, 10, 12, 13, 15], dropped: [], counts: { 6: 14, 9: 80, 10: 18, 12: 197, 13: 2, 15: 2391 } },
	{ id: "34aa", n: 0, label: "3,4,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "34bb", n: 0, label: "3,4,11,11", family: "abcd", eagerKs: [], lazyKs: [11, 12, 13], dropped: [], counts: { 11: 246, 12: 53, 13: 14 } },
	{ id: "3555", n: 0, label: "3,5,5,5", family: "abcd", eagerKs: [], lazyKs: [3, 5, 7, 8, 9, 10, 12, 13, 14, 15], dropped: [], counts: { 3: 1, 5: 3, 7: 2, 8: 3, 9: 2, 10: 16, 12: 9, 13: 4, 14: 2, 15: 151 } },
	{ id: "3558", n: 0, label: "3,5,5,8", family: "abcd", eagerKs: [], lazyKs: [10], dropped: [], counts: { 10: 8 } },
	{ id: "3559", n: 0, label: "3,5,5,9", family: "abcd", eagerKs: [], lazyKs: [8, 15], dropped: [], counts: { 8: 3, 15: 16 } },
	{ id: "355a", n: 0, label: "3,5,5,10", family: "abcd", eagerKs: [], lazyKs: [3, 10, 13, 15], dropped: [], counts: { 3: 1, 10: 12, 13: 3, 15: 60 } },
	{ id: "3566", n: 0, label: "3,5,6,6", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "3588", n: 0, label: "3,5,8,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "3599", n: 0, label: "3,5,9,9", family: "abcd", eagerKs: [], lazyKs: [5, 6, 8, 12, 13, 14, 15], dropped: [], counts: { 5: 1, 6: 14, 8: 11, 12: 110, 13: 2, 14: 1578, 15: 17056 } },
	{ id: "35aa", n: 0, label: "3,5,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "35bb", n: 0, label: "3,5,11,11", family: "abcd", eagerKs: [], lazyKs: [11, 12, 13], dropped: [], counts: { 11: 628, 12: 89, 13: 8 } },
	{ id: "3666", n: 0, label: "3,6,6,6", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 3 } },
	{ id: "3667", n: 0, label: "3,6,6,7", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "3668", n: 0, label: "3,6,6,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "3669", n: 0, label: "3,6,6,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "366a", n: 0, label: "3,6,6,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "366b", n: 0, label: "3,6,6,11", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "3677", n: 0, label: "3,6,7,7", family: "abcd", eagerKs: [], lazyKs: [7, 8, 9], dropped: [], counts: { 7: 12, 8: 6, 9: 4 } },
	{ id: "3688", n: 0, label: "3,6,8,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "3689", n: 0, label: "3,6,8,9", family: "abcd", eagerKs: [], lazyKs: [12], dropped: [], counts: { 12: 48 } },
	{ id: "368a", n: 0, label: "3,6,8,10", family: "abcd", eagerKs: [], lazyKs: [6, 12, 15], dropped: [], counts: { 6: 3, 12: 6, 15: 5 } },
	{ id: "3699", n: 0, label: "3,6,9,9", family: "abcd", eagerKs: [], lazyKs: [2, 5, 6], dropped: [], counts: { 2: 1, 5: 3, 6: 46 } },
	{ id: "369a", n: 0, label: "3,6,9,10", family: "abcd", eagerKs: [], lazyKs: [12, 15], dropped: [], counts: { 12: 48, 15: 258 } },
	{ id: "36aa", n: 0, label: "3,6,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "36bb", n: 0, label: "3,6,11,11", family: "abcd", eagerKs: [], lazyKs: [6, 7, 11, 12, 13, 14], dropped: [], counts: { 6: 4, 7: 6, 11: 2488, 12: 343, 13: 138, 14: 53 } },
	{ id: "3777", n: 0, label: "3,7,7,7", family: "abcd", eagerKs: [], lazyKs: [2, 4, 5], dropped: [], counts: { 2: 1, 4: 3, 5: 9 } },
	{ id: "3778", n: 0, label: "3,7,7,8", family: "abcd", eagerKs: [], lazyKs: [7, 8], dropped: [], counts: { 7: 4, 8: 5 } },
	{ id: "3779", n: 0, label: "3,7,7,9", family: "abcd", eagerKs: [], lazyKs: [7, 8], dropped: [], counts: { 7: 4, 8: 4 } },
	{ id: "377a", n: 0, label: "3,7,7,10", family: "abcd", eagerKs: [], lazyKs: [7, 8], dropped: [], counts: { 7: 4, 8: 1 } },
	{ id: "3888", n: 0, label: "3,8,8,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "3889", n: 0, label: "3,8,8,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "388a", n: 0, label: "3,8,8,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "388b", n: 0, label: "3,8,8,11", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "3899", n: 0, label: "3,8,9,9", family: "abcd", eagerKs: [], lazyKs: [6, 7, 9, 10], dropped: [], counts: { 6: 14, 7: 10, 9: 688, 10: 147 } },
	{ id: "389a", n: 0, label: "3,8,9,10", family: "abcd", eagerKs: [], lazyKs: [12], dropped: [], counts: { 12: 26 } },
	{ id: "38aa", n: 0, label: "3,8,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "38bb", n: 0, label: "3,8,11,11", family: "abcd", eagerKs: [], lazyKs: [11, 12, 13], dropped: [], counts: { 11: 2760, 12: 725, 13: 280 } },
	{ id: "3999", n: 0, label: "3,9,9,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "399a", n: 0, label: "3,9,9,10", family: "abcd", eagerKs: [], lazyKs: [5], dropped: [], counts: { 5: 6 } },
	{ id: "399b", n: 0, label: "3,9,9,11", family: "abcd", eagerKs: [], lazyKs: [8, 12, 13, 15], dropped: [], counts: { 8: 3, 12: 7660, 13: 1222, 15: 1665 } },
	{ id: "39aa", n: 0, label: "3,9,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "39bb", n: 0, label: "3,9,11,11", family: "abcd", eagerKs: [], lazyKs: [6, 11, 12], dropped: [], counts: { 6: 16, 11: 1166, 12: 266 } },
	{ id: "3aaa", n: 0, label: "3,10,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "3aab", n: 0, label: "3,10,10,11", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "3abb", n: 0, label: "3,10,11,11", family: "abcd", eagerKs: [], lazyKs: [6, 11, 12, 13], dropped: [], counts: { 6: 4, 11: 8454, 12: 1048, 13: 270 } },
	{ id: "3bbb", n: 0, label: "3,11,11,11", family: "abcd", eagerKs: [], lazyKs: [4, 5], dropped: [], counts: { 4: 32, 5: 9 } },
	{ id: "4445", n: 0, label: "4,4,4,5", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "4446", n: 0, label: "4,4,4,6", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 2 } },
	{ id: "4447", n: 0, label: "4,4,4,7", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "4448", n: 0, label: "4,4,4,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 2 } },
	{ id: "4449", n: 0, label: "4,4,4,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "444a", n: 0, label: "4,4,4,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 2 } },
	{ id: "444b", n: 0, label: "4,4,4,11", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "4455", n: 0, label: "4,4,5,5", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "4456", n: 0, label: "4,4,5,6", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "4457", n: 0, label: "4,4,5,7", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "4458", n: 0, label: "4,4,5,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "4459", n: 0, label: "4,4,5,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "445a", n: 0, label: "4,4,5,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "445b", n: 0, label: "4,4,5,11", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "4466", n: 0, label: "4,4,6,6", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 2 } },
	{ id: "4467", n: 0, label: "4,4,6,7", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "4468", n: 0, label: "4,4,6,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 3 } },
	{ id: "4469", n: 0, label: "4,4,6,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "446a", n: 0, label: "4,4,6,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 3 } },
	{ id: "446b", n: 0, label: "4,4,6,11", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "4477", n: 0, label: "4,4,7,7", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "4478", n: 0, label: "4,4,7,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "4479", n: 0, label: "4,4,7,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "447a", n: 0, label: "4,4,7,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "447b", n: 0, label: "4,4,7,11", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "4488", n: 0, label: "4,4,8,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 2 } },
	{ id: "4489", n: 0, label: "4,4,8,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "448a", n: 0, label: "4,4,8,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 3 } },
	{ id: "448b", n: 0, label: "4,4,8,11", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "4499", n: 0, label: "4,4,9,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "449a", n: 0, label: "4,4,9,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "449b", n: 0, label: "4,4,9,11", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "44aa", n: 0, label: "4,4,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 2 } },
	{ id: "44ab", n: 0, label: "4,4,10,11", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "44bb", n: 0, label: "4,4,11,11", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "4555", n: 0, label: "4,5,5,5", family: "abcd", eagerKs: [], lazyKs: [2], dropped: [], counts: { 2: 1 } },
	{ id: "4556", n: 0, label: "4,5,5,6", family: "abcd", eagerKs: [], lazyKs: [10, 11, 15], dropped: [], counts: { 10: 27, 11: 8, 15: 161 } },
	{ id: "4557", n: 0, label: "4,5,5,7", family: "abcd", eagerKs: [], lazyKs: [15], dropped: [], counts: { 15: 225 } },
	{ id: "4558", n: 0, label: "4,5,5,8", family: "abcd", eagerKs: [], lazyKs: [5, 6, 10], dropped: [], counts: { 5: 2, 6: 2, 10: 67 } },
	{ id: "4559", n: 0, label: "4,5,5,9", family: "abcd", eagerKs: [], lazyKs: [10], dropped: [], counts: { 10: 84 } },
	{ id: "455a", n: 0, label: "4,5,5,10", family: "abcd", eagerKs: [], lazyKs: [5], dropped: [], counts: { 5: 2 } },
	{ id: "4566", n: 0, label: "4,5,6,6", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "4568", n: 0, label: "4,5,6,8", family: "abcd", eagerKs: [], lazyKs: [10, 15], dropped: [], counts: { 10: 386, 15: 2216 } },
	{ id: "456a", n: 0, label: "4,5,6,10", family: "abcd", eagerKs: [], lazyKs: [5, 10, 15], dropped: [], counts: { 5: 3, 10: 133, 15: 1912 } },
	{ id: "4577", n: 0, label: "4,5,7,7", family: "abcd", eagerKs: [], lazyKs: [7, 14], dropped: [], counts: { 7: 2, 14: 10 } },
	{ id: "4588", n: 0, label: "4,5,8,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "458a", n: 0, label: "4,5,8,10", family: "abcd", eagerKs: [], lazyKs: [10, 15], dropped: [], counts: { 10: 767, 15: 10139 } },
	{ id: "4599", n: 0, label: "4,5,9,9", family: "abcd", eagerKs: [], lazyKs: [6], dropped: [], counts: { 6: 18 } },
	{ id: "45aa", n: 0, label: "4,5,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "45bb", n: 0, label: "4,5,11,11", family: "abcd", eagerKs: [], lazyKs: [11, 12], dropped: [], counts: { 11: 16448, 12: 1288 } },
	{ id: "4666", n: 0, label: "4,6,6,6", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 3 } },
	{ id: "4667", n: 0, label: "4,6,6,7", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "4668", n: 0, label: "4,6,6,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 2 } },
	{ id: "4669", n: 0, label: "4,6,6,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "466a", n: 0, label: "4,6,6,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 2 } },
	{ id: "466b", n: 0, label: "4,6,6,11", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "4677", n: 0, label: "4,6,7,7", family: "abcd", eagerKs: [], lazyKs: [7, 8, 9, 10], dropped: [], counts: { 7: 40, 8: 14, 9: 16, 10: 2 } },
	{ id: "4678", n: 0, label: "4,6,7,8", family: "abcd", eagerKs: [], lazyKs: [7], dropped: [], counts: { 7: 18 } },
	{ id: "467a", n: 0, label: "4,6,7,10", family: "abcd", eagerKs: [], lazyKs: [7], dropped: [], counts: { 7: 5 } },
	{ id: "4688", n: 0, label: "4,6,8,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 3 } },
	{ id: "4689", n: 0, label: "4,6,8,9", family: "abcd", eagerKs: [], lazyKs: [9], dropped: [], counts: { 9: 282 } },
	{ id: "468a", n: 0, label: "4,6,8,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 3 } },
	{ id: "468b", n: 0, label: "4,6,8,11", family: "abcd", eagerKs: [], lazyKs: [11], dropped: [], counts: { 11: 3600 } },
	{ id: "4699", n: 0, label: "4,6,9,9", family: "abcd", eagerKs: [], lazyKs: [6, 7, 9, 10], dropped: [], counts: { 6: 76, 7: 10, 9: 2744, 10: 1257 } },
	{ id: "469a", n: 0, label: "4,6,9,10", family: "abcd", eagerKs: [], lazyKs: [9], dropped: [], counts: { 9: 24 } },
	{ id: "46aa", n: 0, label: "4,6,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 2 } },
	{ id: "46ab", n: 0, label: "4,6,10,11", family: "abcd", eagerKs: [], lazyKs: [11], dropped: [], counts: { 11: 1204 } },
	{ id: "46bb", n: 0, label: "4,6,11,11", family: "abcd", eagerKs: [], lazyKs: [11, 12, 13, 14, 15], dropped: [], counts: { 11: 72354, 12: 41948, 13: 22354, 14: 13580, 15: 6268 } },
	{ id: "4777", n: 0, label: "4,7,7,7", family: "abcd", eagerKs: [], lazyKs: [4, 5], dropped: [], counts: { 4: 2, 5: 48 } },
	{ id: "4778", n: 0, label: "4,7,7,8", family: "abcd", eagerKs: [], lazyKs: [7, 8, 9, 10], dropped: [], counts: { 7: 20, 8: 24, 9: 20, 10: 4 } },
	{ id: "4779", n: 0, label: "4,7,7,9", family: "abcd", eagerKs: [], lazyKs: [7, 8], dropped: [], counts: { 7: 4, 8: 9 } },
	{ id: "477a", n: 0, label: "4,7,7,10", family: "abcd", eagerKs: [], lazyKs: [7, 8, 9], dropped: [], counts: { 7: 46, 8: 32, 9: 8 } },
	{ id: "477b", n: 0, label: "4,7,7,11", family: "abcd", eagerKs: [], lazyKs: [14, 15], dropped: [], counts: { 14: 5200, 15: 218 } },
	{ id: "4788", n: 0, label: "4,7,8,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "478a", n: 0, label: "4,7,8,10", family: "abcd", eagerKs: [], lazyKs: [14], dropped: [], counts: { 14: 211485 } },
	{ id: "4799", n: 0, label: "4,7,9,9", family: "abcd", eagerKs: [], lazyKs: [9, 10], dropped: [], counts: { 9: 240, 10: 26 } },
	{ id: "47aa", n: 0, label: "4,7,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "47bb", n: 0, label: "4,7,11,11", family: "abcd", eagerKs: [], lazyKs: [11, 12], dropped: [], counts: { 11: 120, 12: 4 } },
	{ id: "4888", n: 0, label: "4,8,8,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 2 } },
	{ id: "4889", n: 0, label: "4,8,8,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "488a", n: 0, label: "4,8,8,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 3 } },
	{ id: "488b", n: 0, label: "4,8,8,11", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "4899", n: 0, label: "4,8,9,9", family: "abcd", eagerKs: [], lazyKs: [6, 7, 8, 9, 10], dropped: [], counts: { 6: 14, 7: 12, 8: 6, 9: 2922, 10: 1028 } },
	{ id: "489a", n: 0, label: "4,8,9,10", family: "abcd", eagerKs: [], lazyKs: [12, 15], dropped: [], counts: { 12: 33011, 15: 20659 } },
	{ id: "48aa", n: 0, label: "4,8,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 2 } },
	{ id: "48ab", n: 0, label: "4,8,10,11", family: "abcd", eagerKs: [], lazyKs: [11], dropped: [], counts: { 11: 7924 } },
	{ id: "48bb", n: 0, label: "4,8,11,11", family: "abcd", eagerKs: [], lazyKs: [11, 12, 13, 14, 15], dropped: [], counts: { 11: 90056, 12: 55928, 13: 52898, 14: 39498, 15: 29976 } },
	{ id: "4999", n: 0, label: "4,9,9,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "499a", n: 0, label: "4,9,9,10", family: "abcd", eagerKs: [], lazyKs: [6, 7, 8, 9, 10], dropped: [], counts: { 6: 28, 7: 16, 8: 4, 9: 510, 10: 366 } },
	{ id: "499b", n: 0, label: "4,9,9,11", family: "abcd", eagerKs: [], lazyKs: [12, 13, 15], dropped: [], counts: { 12: 39544, 13: 1204, 15: 6648 } },
	{ id: "49aa", n: 0, label: "4,9,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "49bb", n: 0, label: "4,9,11,11", family: "abcd", eagerKs: [], lazyKs: [11, 12, 13], dropped: [], counts: { 11: 22186, 12: 2691, 13: 192 } },
	{ id: "4aaa", n: 0, label: "4,10,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "5555", n: 0, label: "5,5,5,5", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "5556", n: 0, label: "5,5,5,6", family: "abcd", eagerKs: [], lazyKs: [2, 3, 5], dropped: [], counts: { 2: 1, 3: 1, 5: 13 } },
	{ id: "5557", n: 0, label: "5,5,5,7", family: "abcd", eagerKs: [], lazyKs: [5], dropped: [], counts: { 5: 1 } },
	{ id: "5558", n: 0, label: "5,5,5,8", family: "abcd", eagerKs: [], lazyKs: [2, 5], dropped: [], counts: { 2: 1, 5: 8 } },
	{ id: "5559", n: 0, label: "5,5,5,9", family: "abcd", eagerKs: [], lazyKs: [3, 5], dropped: [], counts: { 3: 1, 5: 9 } },
	{ id: "555a", n: 0, label: "5,5,5,10", family: "abcd", eagerKs: [], lazyKs: [2, 3, 5], dropped: [], counts: { 2: 1, 3: 3, 5: 15 } },
	{ id: "5566", n: 0, label: "5,5,6,6", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "5677", n: 0, label: "5,5,6,7", family: "abcd", eagerKs: [], lazyKs: [13, 15], dropped: [], counts: { 13: 3, 15: 7647 } },
	{ id: "5688", n: 0, label: "5,6,8,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "568a", n: 0, label: "5,6,8,10", family: "abcd", eagerKs: [], lazyKs: [5, 10, 15], dropped: [], counts: { 5: 6, 10: 1769, 15: 131013 } },
	{ id: "5699", n: 0, label: "5,6,9,9", family: "abcd", eagerKs: [], lazyKs: [5], dropped: [], counts: { 5: 1 } },
	{ id: "569a", n: 0, label: "5,6,9,10", family: "abcd", eagerKs: [], lazyKs: [15], dropped: [], counts: { 15: 34129 } },
	{ id: "56aa", n: 0, label: "5,6,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "5777", n: 0, label: "5,7,7,7", family: "abcd", eagerKs: [], lazyKs: [4, 5], dropped: [], counts: { 4: 16, 5: 71 } },
	{ id: "5778", n: 0, label: "5,7,7,8", family: "abcd", eagerKs: [], lazyKs: [7], dropped: [], counts: { 7: 2 } },
	{ id: "5779", n: 0, label: "5,7,7,9", family: "abcd", eagerKs: [], lazyKs: [8], dropped: [], counts: { 8: 2 } },
	{ id: "577a", n: 0, label: "5,7,7,10", family: "abcd", eagerKs: [], lazyKs: [4], dropped: [], counts: { 4: 1 } },
	{ id: "5888", n: 0, label: "5,8,8,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "5889", n: 0, label: "5,8,8,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "588a", n: 0, label: "5,8,8,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "5899", n: 0, label: "5,8,9,9", family: "abcd", eagerKs: [], lazyKs: [6, 7, 9], dropped: [], counts: { 6: 18, 7: 6, 9: 14 } },
	{ id: "58aa", n: 0, label: "5,8,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "5999", n: 0, label: "5,9,9,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "599a", n: 0, label: "5,9,9,10", family: "abcd", eagerKs: [], lazyKs: [5], dropped: [], counts: { 5: 1 } },
	{ id: "59aa", n: 0, label: "5,9,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "5aaa", n: 0, label: "5,10,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "6666", n: 0, label: "6,6,6,6", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "6667", n: 0, label: "6,6,6,7", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 3 } },
	{ id: "6668", n: 0, label: "6,6,6,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 3 } },
	{ id: "6669", n: 0, label: "6,6,6,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 3 } },
	{ id: "666a", n: 0, label: "6,6,6,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 3 } },
	{ id: "6677", n: 0, label: "6,6,7,7", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "6678", n: 0, label: "6,6,7,8", family: "abcd", eagerKs: [], lazyKs: [1, 4, 5], dropped: [], counts: { 1: 1, 4: 7, 5: 27 } },
	{ id: "6679", n: 0, label: "6,6,7,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "667a", n: 0, label: "6,6,7,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "6688", n: 0, label: "6,6,8,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 2 } },
	{ id: "6689", n: 0, label: "6,6,8,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "668a", n: 0, label: "6,6,8,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 2 } },
	{ id: "6699", n: 0, label: "6,6,9,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "669a", n: 0, label: "6,6,9,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "66aa", n: 0, label: "6,6,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 2 } },
	{ id: "6777", n: 0, label: "6,7,7,7", family: "abcd", eagerKs: [], lazyKs: [2, 4, 5], dropped: [], counts: { 2: 1, 4: 13, 5: 50 } },
	{ id: "6778", n: 0, label: "6,7,7,8", family: "abcd", eagerKs: [], lazyKs: [7, 8, 9, 10], dropped: [], counts: { 7: 50, 8: 68, 9: 84, 10: 58 } },
	{ id: "6779", n: 0, label: "6,7,7,9", family: "abcd", eagerKs: [], lazyKs: [7, 8, 9], dropped: [], counts: { 7: 12, 8: 32, 9: 4 } },
	{ id: "677a", n: 0, label: "6,7,7,10", family: "abcd", eagerKs: [], lazyKs: [4, 5, 7, 8, 9, 10], dropped: [], counts: { 4: 1, 5: 1, 7: 140, 8: 116, 9: 27, 10: 56 } },
	{ id: "6788", n: 0, label: "6,7,8,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "678a", n: 0, label: "6,7,8,10", family: "abcd", eagerKs: [], lazyKs: [7], dropped: [], counts: { 7: 11 } },
	{ id: "6799", n: 0, label: "6,7,9,9", family: "abcd", eagerKs: [], lazyKs: [5], dropped: [], counts: { 5: 8 } },
	{ id: "67aa", n: 0, label: "6,7,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "6888", n: 0, label: "6,8,8,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 2 } },
	{ id: "6889", n: 0, label: "6,8,8,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "688a", n: 0, label: "6,8,8,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 3 } },
	{ id: "6899", n: 0, label: "6,8,9,9", family: "abcd", eagerKs: [], lazyKs: [6, 7, 8, 9, 10], dropped: [], counts: { 6: 122, 7: 82, 8: 30, 9: 19332, 10: 10504 } },
	{ id: "689a", n: 0, label: "6,8,9,10", family: "abcd", eagerKs: [], lazyKs: [6, 9, 12], dropped: [], counts: { 6: 3, 9: 74, 12: 84778 } },
	{ id: "68aa", n: 0, label: "6,8,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 2 } },
	{ id: "6999", n: 0, label: "6,9,9,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "699a", n: 0, label: "6,9,9,10", family: "abcd", eagerKs: [], lazyKs: [5], dropped: [], counts: { 5: 9 } },
	{ id: "69aa", n: 0, label: "6,9,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "6aaa", n: 0, label: "6,10,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "7777", n: 0, label: "7,7,7,7", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "7778", n: 0, label: "7,7,7,8", family: "abcd", eagerKs: [], lazyKs: [4, 5], dropped: [], counts: { 4: 2, 5: 54 } },
	{ id: "7779", n: 0, label: "7,7,7,9", family: "abcd", eagerKs: [], lazyKs: [2, 4, 5], dropped: [], counts: { 2: 1, 4: 3, 5: 9 } },
	{ id: "777a", n: 0, label: "7,7,7,10", family: "abcd", eagerKs: [], lazyKs: [4, 5], dropped: [], counts: { 4: 17, 5: 85 } },
	{ id: "7788", n: 0, label: "7,7,8,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "7789", n: 0, label: "7,7,8,9", family: "abcd", eagerKs: [], lazyKs: [7, 8], dropped: [], counts: { 7: 4, 8: 55 } },
	{ id: "778a", n: 0, label: "7,7,8,10", family: "abcd", eagerKs: [], lazyKs: [7, 8, 9, 10], dropped: [], counts: { 7: 70, 8: 90, 9: 82, 10: 56 } },
	{ id: "7799", n: 0, label: "7,7,9,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "779a", n: 0, label: "7,7,9,10", family: "abcd", eagerKs: [], lazyKs: [7, 8], dropped: [], counts: { 7: 4, 8: 39 } },
	{ id: "77aa", n: 0, label: "7,7,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "7888", n: 0, label: "7,8,8,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "7889", n: 0, label: "7,8,8,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "788a", n: 0, label: "7,8,8,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "7899", n: 0, label: "7,8,9,9", family: "abcd", eagerKs: [], lazyKs: [9, 10], dropped: [], counts: { 9: 1836, 10: 155 } },
	{ id: "78aa", n: 0, label: "7,8,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "799a", n: 0, label: "7,9,9,10", family: "abcd", eagerKs: [], lazyKs: [5], dropped: [], counts: { 5: 8 } },
	{ id: "79aa", n: 0, label: "7,9,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "7aaa", n: 0, label: "7,10,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "8888", n: 0, label: "8,8,8,8", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "8889", n: 0, label: "8,8,8,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "888a", n: 0, label: "8,8,8,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 2 } },
	{ id: "8899", n: 0, label: "8,8,9,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "889a", n: 0, label: "8,8,9,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "88aa", n: 0, label: "8,8,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 2 } },
	{ id: "8999", n: 0, label: "8,9,9,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "899a", n: 0, label: "8,9,9,10", family: "abcd", eagerKs: [], lazyKs: [6, 7, 8, 9, 10], dropped: [], counts: { 6: 46, 7: 72, 8: 58, 9: 3392, 10: 2698 } },
	{ id: "89aa", n: 0, label: "8,9,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "8aaa", n: 0, label: "8,10,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "9999", n: 0, label: "9,9,9,9", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "999a", n: 0, label: "9,9,9,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "99aa", n: 0, label: "9,9,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "9aaa", n: 0, label: "9,10,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
	{ id: "aaaa", n: 0, label: "10,10,10,10", family: "abcd", eagerKs: [], lazyKs: [1], dropped: [], counts: { 1: 1 } },
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

/** A board's shard URL. EVERY shard on this shelf is stored GZIPPED. `public/` is tracked in git, and
 *  the shelf now carries every k Marek enumerated — 271 boards, 2,191,775 tilings, 1,617 MB of packed
 *  JSON — which fits in 110 MB compressed. Dart arrays are thousands of small repeated integers, so the
 *  ratio is ~15x, and the WIRE is identical either way because the server gzips a plain .json on the fly
 *  anyway. atlasCodec's `shardBody` reads either form, sniffing the gzip magic. */
export const hypPolyShardUrl = (n: string | number, k: number): string => {
	// The abcd stems carry a "q" so a 4-digit board id can never collide with an ai1 one, and the ai2 ids
	// already carry their own "t". The developer prefixes record ids the same way, which is what keeps a
	// record and its file agreeing.
	const abcd = HYP_POLY_BOARD_BY_ID.get(String(n))?.family === "abcd";
	return `/hyperbolic-poly/hp${abcd ? "q" : ""}${n}-k${k}.json.gz`;
};

/** The /play sub-axis key — namespaced against the "hyp-" edge bases and the "hyc-" colourings, and
 *  split by family so the tree can head the two separately ("3.4.n.4 boards" against "{3,n} boards")
 *  while `familyOfSub` stays a prefix test. One rule, two callers: a board and a record must never
 *  disagree about which row a tiling belongs to. */
const SUB_PREFIX: Record<HypPolyBoard["family"], string> = { ai1: "hpo", ai2: "hpt", abcd: "hpq" };
/** The board TABLE decides the prefix, not the shape of the id. With three families sharing the shelf
 *  there is no rule from "4568" to its family that would not be guessing at string lengths — ai1's ids
 *  are bare digits too — and the table already carries the answer. Falls back to the 3.4.n.4 prefix for
 *  an id the table does not know, which is what every caller did before the third family existed. */
const subOfBoardId = (id: string): string => {
	const fam = HYP_POLY_BOARD_BY_ID.get(id)?.family;
	return `${fam ? SUB_PREFIX[fam] : "hpo"}-${fam === "ai2" ? id.slice(1) : id}`;
};
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

/** A vertex figure in its canonical cyclic order: the least of its rotations and reflections, so "4.8.4.3"
 *  and "3.4.8.4" read the same and mirror pairs merge (the shelf's chirality rule). */
function canonicalFigure(fig: string): string {
	const s = fig.split(".").map(Number);
	let best = s;
	for (const seq of [s, [...s].reverse()])
		for (let i = 0; i < seq.length; i++) {
			const r = [...seq.slice(i), ...seq.slice(0, i)];
			const d = r.findIndex((x, j) => x !== best[j]);
			if (d >= 0 && r[d] < best[d]) best = r;
		}
	return best.join(".");
}

/** Card / search label: the distinct vertex figures of the tiling, e.g. "3.4.8.4" or "3.4.7.4 + 4.7.14".
 *  The polygon sizes alone cannot tell 3.4.8.4 from 3.8.4.8, and the board label is only the multiset,
 *  so the cyclic order has to come from here. Past three figures the rest are counted, not listed. */
export function hypPolyFamilyLabel(p: HypPolyPattern): string {
	const figs = [...new Set(p.config.split(" + ").map(canonicalFigure))].sort();
	return figs.length > 3 ? `${figs.slice(0, 3).join(" + ")} + ${figs.length - 3} more` : figs.join(" + ");
}
