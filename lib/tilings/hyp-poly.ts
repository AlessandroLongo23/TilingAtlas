// The 3.4.n.4 FAMILY of hyperbolic tilings by regular polygons (Marek Čtrnáct, 2026-07-31 — his `ai1_n`
// solvers). Fix n and let ℓ be the edge length at which the vertex figure 3.4.n.4 closes. At that one ℓ
// exactly three figures close and no others:
//
//     3.4.n.4        3.4.4.n        4.n.2n
//
// (the first two are one multiset in two cyclic orders; the third is the identity α(3,ℓ) + α(4,ℓ) =
// α(2n,ℓ), which holds to 1e-14 on every board here). So the alphabet is {3, 4, n, 2n} and a record is a
// k-uniform TILING BY REGULAR POLYGONS — not an edge system and not a colouring. Every edge is a real
// tile boundary and every face is its own tile.
//
// It renders through the renderer the colored-tiling shelf already uses: a record ships DARTS, and
// lib/render/hyperbolicDevelopClient.ts::developColors re-develops them under the live view, fills each
// face by its `faceColor` index and strokes every edge. Here `faceColor` is the index of the face's SIZE
// in the board's sorted alphabet (3 → 0, 4 → 1, n → 2, 2n → 3), so one colour means one polygon size
// across the whole shelf. Decoded by tools/ctrnact-oracle/develop_ai1.py.
//
// n = 3, 4, 5 are spherical and n = 6 Euclidean; only n ≥ 7 is hyperbolic and lives here. Marek's drops
// cover n = 7…12, 14…20 and 23; there is no n = 13, 21 or 22 yet.

import type { Darts } from "@/lib/render/hyperbolicDevelopClient";

/** One board of the family: the tilings by {3, 4, n, 2n} at the edge length 3.4.n.4 forces. */
export interface HypPolyBoard {
	/** The family parameter. The board id is its decimal string. */
	n: number;
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
	 * the data does not. Present only on n = 13, the first AI1 drop to ship a `solution_list.txt` at all;
	 * on every other board there is no census to compare the files against, so ABSENT here means UNKNOWN
	 * and never "none". Do not default it to an empty array.
	 */
	missing?: number[];
	/** Tilings per shipped k. */
	counts: Record<number, number>;
}

export interface HypPolyPattern {
	/** "hp7-14-00003" — board n, k, index. */
	id: string;
	name: string;
	k: number;
	/** Board id, the decimal n. */
	base: string;
	/** Vertex figures of the k orbits, joined: "3.4.7.4 + 4.7.14". */
	config: string;
	/** Board label, "3.4.7.4". */
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
 *  EVERY BOARD IS TRUNCATED, and `dropped` says where. Marek's drop is 232,000 hyperbolic certificates
 *  at ~1.5 KB of darts each; develop_ai1.py's `--budget 4000` ships a contiguous k prefix per board and
 *  names the tail it left behind. A board's highest shipped k is a budget, never an enumeration result.
 *
 *  The k holes BELOW the cap are different, and real: n = 11 has nothing at k = 2…5, 8…10, 15, 16, and
 *  that is the corpus, not the budget. `hypPolyKGaps` separates the two. */
export const HYP_POLY_BOARDS: HypPolyBoard[] = [
	{ n: 7, eagerKs: [1, 4, 5, 8, 9], lazyKs: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34], dropped: [35, 36, 37, 38, 39, 40], counts: { 1: 1, 4: 2, 5: 2, 8: 3, 9: 2, 11: 3, 12: 6, 13: 3, 14: 7, 15: 12, 16: 11, 17: 4, 18: 11, 19: 17, 20: 16, 21: 40, 22: 39, 23: 64, 24: 61, 25: 64, 26: 95, 27: 190, 28: 397, 29: 314, 30: 319, 31: 335, 32: 418, 33: 403, 34: 713 } },
	{ n: 8, eagerKs: [1, 2, 3, 4, 5], lazyKs: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], dropped: [19, 20, 21, 22], counts: { 1: 2, 2: 1, 3: 2, 4: 1, 5: 6, 6: 7, 7: 7, 8: 16, 9: 22, 10: 34, 11: 63, 12: 87, 13: 123, 14: 215, 15: 302, 16: 478, 17: 787, 18: 1327 } },
	{ n: 9, eagerKs: [1, 2, 3, 5, 6], lazyKs: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21], dropped: [22, 23, 24, 25], counts: { 1: 1, 2: 1, 3: 1, 5: 1, 6: 4, 7: 7, 8: 4, 9: 15, 10: 17, 11: 10, 12: 23, 13: 10, 14: 54, 15: 59, 16: 102, 17: 156, 18: 252, 19: 475, 20: 578, 21: 1192 } },
	{ n: 10, eagerKs: [1, 2, 3, 4, 5], lazyKs: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], dropped: [17, 18, 19, 20], counts: { 1: 2, 2: 1, 3: 2, 4: 2, 5: 1, 6: 8, 7: 14, 8: 15, 9: 28, 10: 50, 11: 89, 12: 114, 13: 248, 14: 263, 15: 599, 16: 1214 } },
	{ n: 11, eagerKs: [1, 6, 7, 11, 12], lazyKs: [13, 14, 17, 18, 19, 20, 21, 22], dropped: [23, 24, 25, 26, 27, 28], counts: { 1: 1, 6: 2, 7: 2, 11: 15, 12: 34, 13: 27, 14: 4, 17: 193, 18: 370, 19: 310, 20: 87, 21: 8, 22: 472 } },
	{ n: 12, eagerKs: [1, 2, 3, 4, 5], lazyKs: [6, 7, 8, 9, 10, 11, 12], dropped: [13, 14, 15], counts: { 1: 2, 2: 2, 3: 3, 4: 5, 5: 6, 6: 19, 7: 46, 8: 77, 9: 203, 10: 338, 11: 610, 12: 1344 } },
	// n = 13, and the ONE board with a census to check against. Its `missing` is 416,137 certificates the
	// census counts at k = 27…30 that the drop does not carry; see the field's note. Its k holes below
	// the cap (2…6, 9…12, 17…19) are corpus facts, the same kind n = 11 has.
	{ n: 13, eagerKs: [1, 7, 8, 13, 14], lazyKs: [15, 16, 20], dropped: [21, 22, 23, 24, 26], missing: [27, 28, 29, 30], counts: { 1: 1, 7: 4, 8: 4, 13: 33, 14: 104, 15: 94, 16: 23, 20: 2097 } },
	{ n: 14, eagerKs: [1, 2, 4, 5, 6], lazyKs: [7, 8, 9, 10, 11, 12, 13, 14, 15], dropped: [16, 17, 18, 19, 20], counts: { 1: 2, 2: 1, 4: 4, 5: 6, 6: 3, 7: 3, 8: 24, 9: 39, 10: 48, 11: 81, 12: 163, 13: 175, 14: 659, 15: 1259 } },
	{ n: 15, eagerKs: [1, 2, 3, 4, 5], lazyKs: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], dropped: [17, 18, 19, 20], counts: { 1: 1, 2: 1, 3: 2, 4: 1, 5: 1, 6: 2, 7: 3, 8: 20, 9: 20, 10: 38, 11: 92, 12: 104, 13: 156, 14: 287, 15: 781, 16: 1894 } },
	{ n: 16, eagerKs: [1, 2, 3, 4, 5], lazyKs: [6, 7, 8, 9, 10, 11, 12, 13, 14], dropped: [15, 16, 17], counts: { 1: 2, 2: 1, 3: 2, 4: 1, 5: 6, 6: 7, 7: 7, 8: 39, 9: 104, 10: 163, 11: 312, 12: 501, 13: 915, 14: 1851 } },
	{ n: 17, eagerKs: [1, 9, 10, 11, 17], lazyKs: [18, 19], dropped: [20, 21], counts: { 1: 1, 9: 9, 10: 18, 11: 9, 17: 716, 18: 1672, 19: 1274 } },
	{ n: 18, eagerKs: [1, 2, 3, 4, 5], lazyKs: [6, 7, 8, 9, 10, 11, 12], dropped: [13, 14, 15, 16, 17], counts: { 1: 2, 2: 2, 3: 1, 4: 3, 5: 9, 6: 19, 7: 22, 8: 34, 9: 125, 10: 256, 11: 474, 12: 1092 } },
	{ n: 19, eagerKs: [1, 10, 11, 12, 13], lazyKs: [19], dropped: [20, 21, 22, 23], counts: { 1: 1, 10: 21, 11: 26, 12: 12, 13: 7, 19: 2039 } },
	{ n: 20, eagerKs: [1, 2, 3, 4, 5], lazyKs: [6, 7, 8, 9, 10, 11, 12], dropped: [13, 14, 15], counts: { 1: 2, 2: 1, 3: 4, 4: 3, 5: 3, 6: 13, 7: 26, 8: 36, 9: 65, 10: 259, 11: 684, 12: 1183 } },
	{ n: 23, eagerKs: [1, 12, 13, 14], lazyKs: [], dropped: [23], counts: { 1: 1, 12: 54, 13: 108, 14: 54 } },
];

export const HYP_POLY_BOARD_BY_ID = new Map(HYP_POLY_BOARDS.map((b) => [String(b.n), b]));

/** Board label: the vertex figure the family is defined by. */
export const hypPolyBoardLabel = (id: string): string => `3.4.${id}.4`;

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

/** The /play sub-axis key — namespaced against the "hyp-" edge bases and the "hyc-" colourings. */
export const hypPolySub = (p: HypPolyPattern): string => `hpo-${p.base}`;
export const hypPolySubOfBoard = (b: HypPolyBoard): string => `hpo-${b.n}`;

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
