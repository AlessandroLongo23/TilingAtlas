// EUCLIDEAN HALF-POLYGONS: a regular n-gon cut in two, and what the halves tile in the plane
// (Alessandro Longo's idea, 2026-08-14). The flat member of the family whose curved siblings are
// lib/tilings/sph-half.ts and lib/tilings/hyp-half.ts.
//
// Halve a regular tile and the halves carry edges of two or three lengths, so gluing has to be
// constrained by edge type — and once it is, the pieces lie down in ways the whole tile could not. In
// the plane there is no curvature to hide in the faces, so the tile is simply a flat polygon and the
// vertex rule is the ordinary one: the angles at a vertex sum to 360.
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
// Two of the six were already shipped under names that do not say "half": the 30-60-90 half-triangle is
// `P12.6.4` in the planigon palette, and the 45-45-90 half-square is the whole tri45 shelf. The four
// here are the rest of the family, and there is no more of it — every board from n = 7 up is empty, and
// always the same way (the α corners become unplaceable and only the right angle survives).
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
		counts: { 1: 2, 2: 4, 3: 15, 4: 34, 5: 62, 6: 166, 7: 226, 8: 752, 9: 1006, 10: 2273, 11: 2556, 12: 11645, 13: 8418 },
		enumeratedTo: 13,
		emptyKs: [],
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
	},
	{
		id: "hexm",
		label: "{6} halved between opposite edges",
		tile: "90-120-120-120-90 pentagon",
		cut: "the regular hexagon, cut between the midpoints of two opposite edges",
		angles: [90, 120, 120, 120, 90],
		sides: [1, 2, 2, 1, 3.4641016151377544], // 2√3, the width across the hexagon
		D: 12,
		eagerKs: [2],
		lazyKs: [],
		counts: { 2: 1 },
		enumeratedTo: 6,
		emptyKs: [1, 3, 4, 5, 6],
	},
	{
		id: "sqmid",
		label: "{4} halved between opposite edges",
		tile: "1×2 rectangle (the domino)",
		cut: "the square, cut between the midpoints of two opposite edges",
		angles: [90, 90, 90, 90],
		sides: [1, 2, 1, 2],
		D: 4,
		eagerKs: [1],
		lazyKs: [],
		// ONE tiling, and provably the only one — not merely the only one below the k the search reached.
		// Every corner is a right angle flanked by one long and one short side, so the four edges at a
		// vertex alternate long/short; two edges separated by one other sit at 180° and are therefore
		// collinear; so the long edges lie on one family of parallel lines and the short edges on the
		// perpendicular family, which is the aligned grid and nothing else. Running bond, herringbone and
		// basketweave are T-junction patterns — absent from an edge-to-edge enumeration by definition,
		// not missing from it.
		counts: { 1: 1 },
		enumeratedTo: 6,
		emptyKs: [2, 3, 4, 5, 6],
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
	const out: number[] = [];
	for (let k = ks[0] + 1; k < ks[ks.length - 1]; k++) if (!have.has(k)) out.push(k);
	return out;
}
