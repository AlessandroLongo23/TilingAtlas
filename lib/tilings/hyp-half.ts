// HYPERBOLIC HALF-TILES: a {p,q} face cut in two, and what the halves tile (Alessandro Longo's idea,
// 2026-08-14). The hyperbolic half of the same family as lib/tilings/sph-half.ts.
//
// Halve a regular tile and the halves carry edges of two or three different lengths, so gluing has to be
// constrained by edge type — and once it is, the pieces lie down in ways the whole tile could not.
//
// TWO KINDS OF CUT, and the kind decides how the board behaves.
//
// A DIAGONAL runs vertex to vertex, so it halves the two corners it lands on, halves no edge, and can
// never leave a T-junction — every choice of diagonal tiles, and the catalogues are large. What limits
// them instead is counting: a {p,q} face contributes 2 cut endpoints, pF = qV, so the average vertex is
// an endpoint of 2q/p of them, and a vertex-transitive tiling needs that to be a whole number.
//   {4,5} halved   five squares per vertex, corner 72 degrees, diagonal gives 36-72-36 triangles.
//                  2q/p = 5/2, so no k=1 — and 76 tilings at k=2.
//   {4,6} halved   the same cut one valence along: corner 60, halves are 30-60-30. 2q/p = 3, so k=1 is
//                  ALLOWED, and it is the one board here that has any: 14 of them, each vertex the
//                  endpoint of exactly 3 of its 6 diagonals.
//   {6,4} halved   four hexagons per vertex, corner 90, and the hexagon's long diagonal gives
//                  45-90-90-45 QUADRILATERALS. 2q/p = 4/3, so no k=1.
//
// An ALTITUDE or MIRROR lands its foot at an edge MIDPOINT, so edge-to-edge forces the neighbour across
// that edge to cut there too, and the constraint bites much harder.
//   {3,7} halved   corner 360/7, halves are scalene pi/2, pi/7, 2pi/7 — the first CHIRAL board here, and
//                  nothing exists below k=6. Parity is why: each half-triangle's corner at a vertex is
//                  flanked by one full edge and one half-edge, the two kinds must alternate round the
//                  vertex, and 7 is odd, so a {3,7} vertex can never be left entirely uncut.
//   {3,8} halved   the test of that argument. Eight is even, the alternation closes, the alphabet duly
//                  contains an uncut vertex, and the floor drops from k=6 to k=3.
//   {5,4} halved   a pentagon has no halving diagonal, so the cut is the mirror and the halves are
//                  45-90-90-90 quadrilaterals.
//
// Unlike the spherical boards nothing bounds the tile count: a hyperbolic tiling is infinite, so the
// catalogue grows with k instead of stopping. What ships is the QUOTIENT plus per-dart angle and edge
// length, and the client re-develops under the live view — a record is a `HypPolyPattern`, the type the
// 3.4.n.4 hyperbolic shelf already uses, so no new renderer was needed.

import type { HypPolyPattern } from "@/lib/tilings/hyp-poly";

export interface HypHalfBoard {
	/** Stable id, also the shard stem: "45-half". */
	id: string;
	/** Display label: "{4,5} halved". */
	label: string;
	/** What was cut, and how. */
	cut: string;
	/** The tile's angles in degrees, largest first. */
	angles: number[];
	/** Its side lengths, ascending — as many distinct values as the palette has edge types. */
	sides: number[];
	/** k slices that load with the hyperbolic atlas (all small). */
	eagerKs: number[];
	/** k slices fetched only when that k comes into view. */
	lazyKs: number[];
	/** Tilings per k, for the SHIPPED k only. */
	counts: Record<number, number>;
	/**
	 * The highest k the search ran to. Above it nothing is known — not "none exist", not "we have them
	 * and left them off". A hyperbolic board has infinitely many tilings, so every one of these stops
	 * somewhere, and saying where is the only way the shelf's coverage claim can be read correctly.
	 */
	enumeratedTo: number;
	/**
	 * k values the search COVERED and found nothing at. Not gaps: facts about the board, and on two of
	 * them facts with proofs. {3,7} is empty below k=6 because a vertex flanks each half-corner with one
	 * full and one half edge, the two must alternate, and 7 is odd. {4,5}, {5,4} and {6,4} have no k=1
	 * because a diagonal cut puts 2q/p cut-endpoints on the average vertex and a vertex-transitive tiling
	 * needs that to be whole — 5/2, and 4/3 for {6,4}. {4,6}'s is 3, and it duly has 14 tilings at k=1.
	 */
	emptyKs: number[];
	/**
	 * k values that were enumerated, are NOT empty, and are still off the shelf — our budget, not the
	 * board's. Only {4,6} k=4 today: the solver produced 1.92 M raw blocks and 3.4 GB, and the pruner
	 * finished at 564,906 distinct tilings — thirty-five times the 15,919 of k <= 3 put together, and
	 * well over a gigabyte of JSON at the shelf's ~3 KB per quotient. Enumerated, certified at k <= 3,
	 * developed no further.
	 * Kept separate from `emptyKs` because blurring the two is how a truncated corpus starts reading as
	 * a complete one.
	 */
	dropped: number[];
}

export const HYP_HALF_BOARDS: HypHalfBoard[] = [
	{
		id: "45-half",
		label: "{4,5} halved",
		cut: "the {4,5} square, cut by a diagonal",
		angles: [72, 36, 36],
		sides: [1.253739326, 1.684964163],
		eagerKs: [2, 3],
		// 5,835 records, 21.4 MB — the first slice here too big to ride the atlas.
		lazyKs: [4],
		counts: { 2: 76, 3: 40, 4: 5835 },
		enumeratedTo: 4,
		emptyKs: [1],
		dropped: [],
	},
	{
		id: "37-half",
		label: "{3,7} halved",
		cut: "the {3,7} triangle, cut by an altitude",
		angles: [90, 51.428571, 25.714286],
		sides: [0.545274832, 0.903799891, 1.090549664],
		eagerKs: [6, 7, 8],
		lazyKs: [],
		// NOT a gap in the run: k <= 5 is empty because a {3,7} vertex cannot be left uncut (7 is odd),
		// which is a fact about the board. `emptyKs` is what says so.
		counts: { 6: 9, 7: 54, 8: 22 },
		enumeratedTo: 8,
		emptyKs: [1, 2, 3, 4, 5],
		dropped: [],
	},
	{
		id: "38-half",
		label: "{3,8} halved",
		cut: "the {3,8} triangle, cut by an altitude",
		angles: [90, 45, 22.5],
		sides: [0.76428546, 1.224226224, 1.528570919],
		eagerKs: [3, 4],
		lazyKs: [],
		// The board that TESTS the {3,7} parity argument, and confirms it: eight is even, so the two edge
		// kinds can alternate all the way round an uncut vertex, the alphabet duly contains that vertex
		// figure, and the floor drops from k=6 to k=3.
		counts: { 3: 4, 4: 56 },
		enumeratedTo: 4,
		emptyKs: [1, 2],
		dropped: [],
	},
	{
		id: "54-half",
		label: "{5,4} halved",
		// The hyperbolic twin of the dodecahedron board, and the second non-triangular half-tile: a
		// pentagon has no halving diagonal, so the cut is the mirror. Its sides are DECLARED, because a
		// hyperbolic quadrilateral is not pinned by its angles (2n-3 degrees of freedom against n).
		cut: "the {5,4} pentagon, cut by a mirror",
		angles: [90, 90, 90, 45],
		sides: [0.530637531, 1.061275062, 1.469351744],
		eagerKs: [3, 4, 5],
		lazyKs: [],
		counts: { 3: 4, 4: 38, 5: 19 },
		enumeratedTo: 5,
		emptyKs: [1, 2],
		dropped: [],
	},
	{
		id: "64-half",
		label: "{6,4} halved",
		// The hexagon's LONG diagonal — vertex to opposite vertex, through the face centre. It is a mirror
		// of the hexagon, so it bisects the two corners it lands on and the halves are achiral; and it is
		// the only halving diagonal a hexagon has, since a short one cuts off a triangle.
		cut: "the {6,4} hexagon, cut by its long diagonal",
		angles: [90, 90, 45, 45],
		// The long side is EXACTLY the {4,6} board's, to 1e-15: cosh R = cot(pi/p)cot(pi/q) is symmetric
		// in p and q, so a dual pair shares a circumradius and both cuts are 2R. Nothing else about the
		// two tiles matches. (The same is quietly true of {4,5} and {5,4}, whose 1.684964163 is 2R too.)
		sides: [1.316957897, 2.292431670],
		eagerKs: [2],
		lazyKs: [3, 4],
		counts: { 2: 24, 3: 509, 4: 763 },
		enumeratedTo: 4,
		emptyKs: [1],
		dropped: [],
	},
	{
		id: "46-half",
		label: "{4,6} halved",
		// {4,5} halved with the valence turned up one: same square, same diagonal, six round a vertex
		// instead of five. The one board here with tilings at k=1.
		cut: "the {4,6} square, cut by a diagonal",
		angles: [60, 30, 30],
		sides: [1.762747174, 2.292431670],
		eagerKs: [1],
		// k=2 is 1.1 MB and k=3 is 51 MB of JSON — which gzips to 1.0 MB, so the wire is not the cost;
		// parsing 15,443 quotients on the main thread is, and that is what laziness is buying here.
		lazyKs: [2, 3],
		counts: { 1: 14, 2: 462, 3: 15443 },
		enumeratedTo: 4,
		emptyKs: [],
		dropped: [4],
	},
];

export const HYP_HALF_BOARD_BY_ID = new Map(HYP_HALF_BOARDS.map((b) => [b.id, b]));

export const hypHalfShardUrl = (id: string, k: number): string => `/hyperbolic-half/hyphalf-${id}-k${k}.json`;

/** The sub-axis key, "hph-" namespaced. Shares the AXIS with the 3.4.n.4 ("hpo-") and {3,n} ("hpt-")
 *  boards, but not the FAMILY: borrowing "hpo-" put these under a "3.4.n.4 boards" heading on screen,
 *  which they are not. Own prefix, own family, own heading. */
export const hypHalfSub = (p: HypPolyPattern): string => `hph-${p.base}`;
export const hypHalfSubOfBoard = (b: HypHalfBoard): string => `hph-${b.id}`;

/** Is this record one of ours? */
export const isHypHalf = (p: HypPolyPattern): boolean => HYP_HALF_BOARD_BY_ID.has(p.base);

/** The boards with a lazy slice at this k, so a surface can fetch it when the chip comes into view. */
export function hypHalfLazyShardsForK(k: number): HypHalfBoard[] {
	return HYP_HALF_BOARDS.filter((b) => b.lazyKs.includes(k));
}

/** The k values missing between a board's lowest and highest SHIPPED slice. Empty on every board today —
 *  the {3,7} board starts at 6 because nothing exists below it, which is a different statement from a
 *  hole and is why this measures INSIDE the range only. The three claims stay apart: a gap here is a
 *  hole in the middle of what we ship, `emptyKs` is the board having nothing, and `dropped` is us. */
export function hypHalfKGaps(b: HypHalfBoard): number[] {
	const ks = [...b.eagerKs, ...b.lazyKs].sort((x, y) => x - y);
	if (ks.length < 2) return [];
	const have = new Set(ks);
	const out: number[] = [];
	for (let k = ks[0] + 1; k < ks[ks.length - 1]; k++) if (!have.has(k)) out.push(k);
	return out;
}

/** Card / search label: the board, the tile, and how many tiles the quotient holds. */
export function hypHalfFamilyLabel(p: HypPolyPattern): string {
	const b = HYP_HALF_BOARD_BY_ID.get(p.base);
	// Every hyperbolic board here is a triangle today, but {5,4} halved will be a quadrilateral, and the
	// spherical sibling already shipped a card reading "120-120-90-60 triangle" before this was fixed.
	const shape = ["", "", "", "triangle", "quadrilateral", "pentagon"][b?.angles.length ?? 0] ?? "tile";
	const tile = b ? `${b.angles.map((a) => (Number.isInteger(a) ? a : a.toFixed(2))).join("-")} ${shape}` : "half-tile";
	return `${b?.label ?? p.base} · ${tile} · ${p.tiles} tiles per quotient`;
}
