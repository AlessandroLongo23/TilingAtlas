// POLYFORMS: tilings whose tiles are unions of n copies of one atomic regular tile, glued edge to
// edge. Three lattices — squares (polyominoes), equilateral triangles (polyiamonds), hexagons
// (polyhexes) — and one board per (lattice, n). The shelf started as the seven Tetris tetrominoes
// alone (2026-08-08) and became nine boards on 2026-08-24.
//
// WHY IT NEEDED NO NEW SEARCH. A tile reaches the Čtrnáct engine as a cyclic interior-angle word and
// nothing else, so a polyiamond is the same KIND of object as a polyomino: only the word differs
// (60°…300° on triangles, 90°/180°/270° on squares, 120°/240° on hexagons). The whole addition was a
// boundary walk that knows three lattices — tools/ctrnact-oracle/alphabets/polyform.py — plus one
// generated palette per board. Enumeration is checked against OEIS: A000105/A000988 (polyominoes),
// A000577/A006534 (polyiamonds), A000228/A006535 (polyhexes), free and one-sided both.
//
// ⚑ CHIRALITY IS DISTINGUISHED, a deliberate departure from the A068599 mirror-merge convention this
// atlas otherwise keeps (AL, 2026-08-08). S ≠ Z and J ≠ L; a chiral shape with no traditional second
// letter is X and X'. Measured on the tetromino board: dropping the twins took k=1 from 27 distinct
// tilings to 16, and four of them use both handednesses of one piece at once, so they cannot be
// represented at all by a single twin.
//
// ⚑ COVERAGE IS A BUDGET, NOT A THEOREM. Each board runs to its own k (`maxK` below) and polyform
// tilings exist well past it: even the domino admits infinitely many tilings, and k only counts vertex
// ORBITS. The catalogue is complete AT AND BELOW each board's k and says nothing above it. No external
// oracle exists for any of these families — k-uniform theory is regular-polygon-only, and Myers and
// Kaplan cover single-tile isohedral protosets, not mixed ones — so the counts are observations.
//
// ⚑ ORDER 1 IS ABSENT ON PURPOSE. The 1-omino, 1-iamond and 1-hex are the square, triangular and
// hexagonal grids, which the Regular shelf already holds.
//
// ⚑ WHY ORDER STOPS AT 4. The alphabet costs (corner classes at the smallest angle) ^ (360 / that
// angle), and the exponent is the ATOMIC tile's: 4 on squares, 6 on triangles, 3 on hexagons. Order 5
// puts every family past the wall — 71M configurations for pentominoes and pentahexes, 7.5M for
// pentiamonds, against 105K for the largest board that ships (tetrahex). Same ceiling the bubble
// polyform palettes hit, from the same formula (DEVELOPMENT_NOTES, 2026-08-24).

/** Which atomic tile the pieces are made of. The shelf's family headings, one per lattice. */
export type PolyformFamily = "polyomino" | "polyiamond" | "polyhex";

export interface PolyformBoard {
	/** Palette id, sub-axis suffix and the value stamped on every row as `polyformOrder`. */
	id: string;
	family: PolyformFamily;
	/** How many atomic cells a piece has. */
	order: number;
	/** How many one-sided pieces the board's protoset holds (free count in parentheses). */
	pieces: number;
	free: number;
	/** Highest k the shipped catalogue reaches. Complete at and below it; silent above. */
	maxK: number;
	label: string;
	/** Row-id prefix, so ids stay unique and readable across the nine boards. */
	idPrefix: string;
}

/** Display order: lattice-major (so each family heading is one contiguous run), then order. */
export const POLYFORM_BOARDS: PolyformBoard[] = [
	{ id: "domino", family: "polyomino", order: 2, pieces: 1, free: 1, maxK: 4, label: "Dominoes", idPrefix: "dom" },
	{ id: "tromino", family: "polyomino", order: 3, pieces: 2, free: 2, maxK: 3, label: "Trominoes", idPrefix: "tro" },
	{ id: "tetromino", family: "polyomino", order: 4, pieces: 7, free: 5, maxK: 2, label: "Tetrominoes", idPrefix: "tet" },
	{ id: "diamond", family: "polyiamond", order: 2, pieces: 1, free: 1, maxK: 5, label: "Diamonds", idPrefix: "dia" },
	{ id: "triamond", family: "polyiamond", order: 3, pieces: 1, free: 1, maxK: 4, label: "Triamonds", idPrefix: "tra" },
	{ id: "tetriamond", family: "polyiamond", order: 4, pieces: 4, free: 3, maxK: 2, label: "Tetriamonds", idPrefix: "tia" },
	{ id: "dihex", family: "polyhex", order: 2, pieces: 1, free: 1, maxK: 5, label: "Dihexes", idPrefix: "dih" },
	{ id: "trihex", family: "polyhex", order: 3, pieces: 3, free: 3, maxK: 3, label: "Trihexes", idPrefix: "trh" },
	{ id: "tetrahex", family: "polyhex", order: 4, pieces: 10, free: 7, maxK: 2, label: "Tetrahexes", idPrefix: "teh" },
];

/** The id every row of a board carries, and the key the sub-axis is built from. */
export type PolyformOrder = string;

const BY_ID = new Map(POLYFORM_BOARDS.map((b) => [b.id, b]));
export const polyformBoard = (order: PolyformOrder): PolyformBoard | undefined => BY_ID.get(order);

/** "pfm-" namespaced so a board id can never collide with a freedraw grid or a bubble lattice. */
export const polyformSub = (order: PolyformOrder): string => `pfm-${order}`;
export const polyformSubOfBoard = (b: PolyformBoard): string => polyformSub(b.id);

/** The family heading a sub belongs to; null for anything not a polyform board. */
export function polyformFamilyOfSub(sub: string): PolyformFamily | null {
	return BY_ID.get(sub.slice(4))?.family ?? null;
}

export const POLYFORM_FAMILY_LABEL: Record<PolyformFamily, string> = {
	polyomino: "Polyominoes (squares)",
	polyiamond: "Polyiamonds (triangles)",
	polyhex: "Polyhexes (hexagons)",
};

/** The three forms in board order, so the facet and the tree list them the same way. Derived, so a
 *  fourth lattice would arrive in both from one edit to POLYFORM_BOARDS. */
export const POLYFORM_FAMILIES: PolyformFamily[] = [...new Set(POLYFORM_BOARDS.map((b) => b.family))];

/** The heading names the atomic tile; a chip standing under it does not need to. */
export const polyformFamilyShort = (f: PolyformFamily): string =>
	POLYFORM_FAMILY_LABEL[f].replace(/\s*\(.*\)$/, "");

/** The board's name UNDER its form heading, where the axis that is left to name is n: "n = 3 ·
 *  triamonds". The traditional word stays, because it is what the pieces are called everywhere else. */
export const polyformOrderLabel = (b: PolyformBoard): string =>
	`n = ${b.order} · ${b.label.toLowerCase()}`;
