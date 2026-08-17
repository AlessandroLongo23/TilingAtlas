// EUCLIDEAN HALF-POLYGONS: a regular n-gon cut in two, and what the halves tile in the plane
// (Alessandro Longo's idea, 2026-08-14). The flat member of the family whose curved siblings are
// lib/tilings/sph-half.ts and lib/tilings/hyp-half.ts.
//
// Halve a regular tile and the halves carry edges of two or three lengths, so gluing has to be
// constrained by edge type — and once it is, the pieces lie down in ways the whole tile could not. In
// the plane there is no curvature to hide in the faces, so the tile is simply a flat polygon and the
// vertex rule is the ordinary one: the angles at a vertex sum to 360.
//
// ⚑ EDGE-TO-EDGE IS NOT THE WHOLE STORY (Marek Čtrnáct, 2026-08-16). Everything the next two paragraphs
// prove is a statement about EDGE-TO-EDGE tilings, where every edge is matched whole against exactly one
// other. Both filters say so if read closely: the angle filter needs a vertex's corners to sum to 360,
// and the edge-slot filter says out loud that "each edge is shared by exactly TWO corners". Let one
// tile's edge be met by TWO neighbours and neither holds. Every board here has a side of length 2 and a
// side of length 1, so every board admits such a division, and the boards were re-run with it allowed:
// the counts below at k ≤ `dividedTo` include those tilings, and the shelf grew from 27,728 to 35,487.
// The half-decagon is the one board where no edge decomposes, so its exclusion survives untouched; the
// half-octagon's does not survive as an argument, and was re-run to confirm the board is empty anyway.
// See experiments/results/euhalf-nonedge-to-edge-2026-08-17.log.
//
// THE FAMILY IS FINITE, and unusually for this atlas the bound is a proof rather than a budget. An
// n-gon has a vertex-to-vertex long diagonal and a midpoint-to-midpoint cut when n is even, and one
// vertex-to-opposite-midpoint mirror when n is odd — infinitely many candidate boards, of which six can
// hold a tiling at all. Two filters do it.
//
//   ANGLES. A vertex figure needs the half's corners to compose 360 with every corner class appearing
//   somewhere. For the vertex cut the corners are α/2 and α with α = 180(n−2)/n, so a·(α/2) + b·α = 360
//   forces a + 2b = 4n/(n−2) = 4 + 8/(n−2), whole only when (n−2) divides 8: n ∈ {4, 6, 10}. The
//   midpoint cut resolves to n ∈ {4, 6, 8}, the odd mirror to n ∈ {3, 5}. Eight boards.
//
//   EDGE SLOTS, which cuts it to six. Each corner at a vertex contributes two edge-slots and each edge
//   is shared by exactly two corners, so every edge TYPE's slot count must be EVEN — the flat cousin of
//   the full/half alternation that empties {3,7} in H². The half-DECAGON dies on it: only its 72°
//   corners touch the long diagonal and a + 2b = 5 makes their count odd, so its alphabet is empty. The
//   half-OCTAGON dies too: only its 90° corners touch the cut, so four right angles is the sole
//   surviving vertex, and then nothing can host the four 135° corners every tile carries.
//
// FIVE of the six are here. The 45-45-90 half-square is the whole tri45 shelf and stays there. The
// 30-60-90 half-triangle was the sixth, and for a while it was nowhere: the same triangle is `P12.6.4`
// in the planigon palette, one tile among fifteen, so it had never been catalogued as a BOARD. It is
// `tri` below as of 2026-08-17, which is also the board that gains most from a divided edge. There is
// no more of the family — every board from n = 7 up is empty, and always the same way (the α corners
// become unplaceable and only the right angle survives).
//
// A record is a plain `renderCell` reference tiling, the same shape the tri45, planigon and Penrose
// shelves ship, so no renderer was needed.

export interface EuHalfBoard {
	/** Stable id, also the shard stem: "hexv". */
	id: string;
	/** Display label. */
	label: string;
	/** The half-tile, named. */
	tile: string;
	/** Which regular polygon, and how it was cut. */
	cut: string;
	/** The tile's interior angles in degrees, in cyclic order. */
	angles: number[];
	/** Its side lengths in the same cyclic order, at the scale the shelf develops. */
	sides: number[];
	/** The cyclotomic ring the board develops in — angles are multiples of 360/D. */
	D: number;
	/** k slices that ride the eager atlas bundle. */
	eagerKs: number[];
	/** k slices fetched when that k comes into view. */
	lazyKs: number[];
	/** Tilings per k. */
	counts: Record<number, number>;
	/**
	 * The highest k the search ran to. Above it nothing is claimed — these two boards were still
	 * growing when the runs stopped, so their top k is a budget and not an enumeration result.
	 */
	enumeratedTo: number;
	/** k values the search covered and found nothing at. Facts about the board, not gaps. */
	emptyKs: number[];
	/**
	 * The highest k searched for NON-EDGE-TO-EDGE tilings, where a tile's edge may be met by two
	 * neighbours instead of one. At or below it the board is complete; above it only the edge-to-edge
	 * subset is counted, because the divided-edge palette costs enough depth that it cannot reach as
	 * far. On `hexv` that is visible in the counts as a fall from 423 at k=6 to 226 at k=7: the two
	 * sides of that step are counting different things, and neither number is wrong.
	 */
	dividedTo: number;
}

export const EU_HALF_BOARDS: EuHalfBoard[] = [
	{
		id: "hexv",
		label: "{6} halved by its long diagonal",
		tile: "60-120-120-60 trapezoid",
		cut: "the regular hexagon, cut from a vertex to the opposite vertex",
		angles: [60, 120, 120, 60],
		sides: [1, 1, 1, 2],
		D: 6,
		// Two of these glue along the long side to make a hexagon and hexagons tile, so this board cannot
		// come back empty — which is why it was run first, as a check on the wiring rather than a result.
		eagerKs: [1, 2, 3, 4],
		lazyKs: [5, 6, 7, 8, 9, 10, 11, 12, 13],
		counts: { 1: 2, 2: 10, 3: 35, 4: 68, 5: 145, 6: 423, 7: 226, 8: 752, 9: 1006, 10: 2273, 11: 2556, 12: 11645, 13: 8418 },
		enumeratedTo: 13,
		emptyKs: [],
		dividedTo: 6,
	},
	{
		id: "pent",
		label: "{5} halved by its mirror",
		tile: "54-108-108-90 quadrilateral",
		// Five is odd, so this is the only cut a pentagon has.
		cut: "the regular pentagon, cut from a vertex to the midpoint of the opposite edge",
		angles: [54, 108, 108, 90],
		// The long side is the pentagon's HEIGHT, R + apothem = cot 18° = √(5+2√5) = 3.077683537175254 —
		// an algebraic integer of ℤ[ζ₂₀], but none of the named surds; it is the chord sum
		// 2cos 18° + 2cos 54°, which is why the developer's length grammar grew a general chord token.
		sides: [1, 2, 2, 3.077683537175254],
		D: 20,
		eagerKs: [1, 2, 3, 4],
		lazyKs: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
		counts: { 1: 2, 2: 1, 3: 2, 4: 3, 5: 6, 6: 7, 7: 14, 8: 18, 9: 28, 10: 39, 11: 62, 12: 82, 13: 126, 14: 177 },
		enumeratedTo: 14,
		emptyKs: [],
		dividedTo: 9,
	},
	{
		id: "hexm",
		label: "{6} halved between opposite edges",
		tile: "90-120-120-120-90 pentagon",
		cut: "the regular hexagon, cut between the midpoints of two opposite edges",
		angles: [90, 120, 120, 120, 90],
		sides: [1, 2, 2, 1, 3.4641016151377544], // 2√3, the width across the hexagon
		D: 12,
		eagerKs: [2, 4],
		lazyKs: [5, 6, 7, 8, 9],
		counts: { 2: 1, 4: 4, 5: 5, 6: 8, 7: 19, 8: 20, 9: 36 },
		enumeratedTo: 9,
		emptyKs: [1, 3],
		dividedTo: 9,
	},
	{
		id: "tri",
		label: "{3} halved by its mirror",
		tile: "30-60-90 triangle",
		// Three is odd, so like the pentagon this is the only cut it has.
		cut: "the equilateral triangle, cut from a vertex to the midpoint of the opposite edge",
		angles: [30, 60, 90],
		// The hypotenuse is exactly TWO SHORT LEGS, the most divisible edge in the family: this board gains
		// more from a divided edge than any other, and is the only one that gains at k=1 (4 becomes 5).
		sides: [2, 1, 1.7320508075688772],
		D: 12,
		eagerKs: [1, 2, 3, 4],
		lazyKs: [5, 6],
		counts: { 1: 5, 2: 64, 3: 391, 4: 1989, 5: 1043, 6: 3280 },
		enumeratedTo: 6,
		emptyKs: [],
		dividedTo: 4,
	},
	{
		id: "sqmid",
		label: "{4} halved between opposite edges",
		tile: "1×2 rectangle (the domino)",
		cut: "the square, cut between the midpoints of two opposite edges",
		angles: [90, 90, 90, 90],
		sides: [1, 2, 1, 2],
		D: 4,
		eagerKs: [1, 2, 3, 4],
		lazyKs: [5, 6],
		// ONE tiling EDGE-TO-EDGE, and provably the only one: every corner is a right angle flanked by one
		// long and one short side, so the four edges at a vertex alternate long/short; two edges separated
		// by one other sit at 180° and are therefore collinear; so the long edges lie on one family of
		// parallel lines and the short edges on the perpendicular family, which is the aligned grid and
		// nothing else. That proof assumes every edge is matched WHOLE, and a domino's long side is two
		// short sides. Allow it to be met by two tiles and running bond, herringbone and basketweave all
		// arrive: 1 tiling becomes 496, the largest relative gain on the shelf.
		counts: { 1: 2, 2: 6, 3: 21, 4: 55, 5: 131, 6: 281 },
		enumeratedTo: 6,
		emptyKs: [],
		dividedTo: 6,
	},
];

export const EU_HALF_BOARD_BY_ID = new Map(EU_HALF_BOARDS.map((b) => [b.id, b]));

/** The sub-axis key, "el-euh-" namespaced: these sit in the "Different edge lengths" class beside
 *  tri45, the planigons and Penrose, and each board is its own row. */
export const euHalfSubOfBoard = (b: EuHalfBoard): string => `el-euh-${b.id}`;
export const euHalfSub = (board: string): string => `el-euh-${board}`;

/** The boards with a lazy slice at this k, so a surface can fetch it when the chip comes into view. */
export function euHalfLazyShardsForK(k: number): EuHalfBoard[] {
	return EU_HALF_BOARDS.filter((b) => b.lazyKs.includes(k));
}

/** Every k any board ships, ascending — the lazy fetch is per k across the whole shelf. */
export const EU_HALF_LAZY_KS: number[] = [
	...new Set(EU_HALF_BOARDS.flatMap((b) => b.lazyKs)),
].sort((a, b) => a - b);

/** The k values missing between a board's lowest and highest shipped slice. Empty on all four. */
export function euHalfKGaps(b: EuHalfBoard): number[] {
	const ks = [...b.eagerKs, ...b.lazyKs].sort((x, y) => x - y);
	if (ks.length < 2) return [];
	const have = new Set(ks);
	// A k the search covered and found nothing at is a MEASURED ABSENCE, not a hole in the corpus, and
	// `emptyKs` is where the board records it. hexm reaches k=9 with k=1 and k=3 genuinely empty; before
	// the divided-edge run it shipped a single k and this loop never ran, which is why the distinction
	// only had to be made now.
	const empty = new Set(b.emptyKs);
	const out: number[] = [];
	for (let k = ks[0] + 1; k < ks[ks.length - 1]; k++) if (!have.has(k) && !empty.has(k)) out.push(k);
	return out;
}
