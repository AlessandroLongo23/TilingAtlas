// Substitution rules taken from the Tilings Encyclopedia (tilings.math.uni-bielefeld.de).
//
// PROVENANCE — how these numbers were obtained, because it decides whether they can be trusted.
// Reproduce every value below with `node scripts/derive-substitution-rules.mjs`.
//
// The encyclopedia publishes each substitution as a raster image. Reading transforms out of a PNG
// gives approximate motions that do not close, so nothing here was measured from a picture. What the
// encyclopedia states in PROSE is enough on its own for these two:
//
//   chair  — "the set of vertex points in the tiling obviously spans a square lattice"; tagged
//            Rep-Tiles, Self-Similar Substitution, Finite Rotations; one prototile.
//   sphinx — "a classical example of a substitution with inflation factor 2. It arises from the
//            well-known related rep-tile. […] The prototile is not mirror symmetric. It occurs in
//            two versions in the tiling."
//
// So both prototiles are lattice polyforms and both are rep-tiles at factor 2. That turns rule
// recovery into a finite search: build the prototile out of unit cells, scale it by 2, and enumerate
// every exact cover of the scaled copy by unscaled copies under all lattice symmetries. The chair is
// three unit squares in an L; the sphinx is the hexiamond whose bottom row is a base-3/top-2
// trapezoid with a sixth triangle standing on one end of its top edge.
//
// Every such search returned EXACTLY ONE dissection, which is the strongest available check: the rule
// is forced by the prototile, so there is no image-reading judgement left to get wrong. The outlines
// below were traced from the same cell unions, and the child transforms are the exact-cover output
// (the ORDER of the children is just the search's enumeration order, and only decides which slot gets
// which hue). tests/substitution-rules.test.ts re-checks that each child set covers the inflated
// prototile exactly once, so a typo here fails the suite instead of drawing a broken patch.
//
// The pinwheel below is the exception on both counts, and carries its own note.
//
// One consequence worth recording: because each factor-2 dissection is unique, NEITHER of these can
// be randomised at factor 2 — there is no second rule to choose between. Randomising a rigid rep-tile
// means composing inflations, and the chair at factor 4 has 409 distinct dissections into 16 chairs
// (same search, region refined twice). That is where a random-substitution shelf would start.

import type { SubstitutionRule } from "./engine";

const R3 = Math.sqrt(3);

/**
 * The chair (L-tromino), inflation factor 2, one prototile, four children.
 *
 * Two children are direct translates, one is a quarter turn, one is a reflection. The chair tiling is
 * limitperiodic: the encyclopedia notes it is a union of fully periodic subsets with period vectors of
 * length 2·2^i, which is why it is a cut-and-project tiling over a 2-adic internal space
 * (Baake, Moody & Schlottmann 1998).
 */
export const CHAIR: SubstitutionRule = {
	id: "chair",
	factor: 2,
	prototiles: [
		{ name: "chair", outline: [[0, 0], [0, 2], [1, 2], [1, 1], [2, 1], [2, 0]] },
	],
	children: [
		[
			{ tile: 0, m: [1, 0, 0, 0, 1, 0] },
			{ tile: 0, m: [1, 0, 1, 0, 1, 1] },
			{ tile: 0, m: [0, -1, 4, 1, 0, 0] },
			{ tile: 0, m: [1, 0, 0, 0, -1, 4] },
		],
	],
};

/**
 * The sphinx (hexiamond), inflation factor 2, one prototile, four children.
 *
 * The outline is a PENTAGON, not a hexagon: the two left-hand unit edges are collinear, so the long
 * side from the apex down to the origin is a single edge of length 2. The trace found this; it is easy
 * to miscount from the picture.
 *
 * Three of the four children are reflected (negative determinant) and one is a rotation by 240°, so a
 * right-handed sphinx substitutes to three left-handed and one right-handed. The substitution matrix
 * on {right, left} is [[1,3],[3,1]], eigenvalue 4 = the area factor, with equal asymptotic frequencies
 * — which is the encyclopedia's "it occurs in two versions in the tiling".
 */
export const SPHINX: SubstitutionRule = {
	id: "sphinx",
	factor: 2,
	prototiles: [
		{ name: "sphinx", outline: [[0, 0], [1, R3], [3 / 2, R3 / 2], [5 / 2, R3 / 2], [3, 0]] },
	],
	children: [
		[
			{ tile: 0, m: [-1, 0, 6, 0, 1, 0] },
			{ tile: 0, m: [1, 0, 2, 0, -1, R3] },
			{ tile: 0, m: [-1 / 2, R3 / 2, 2, -R3 / 2, -1 / 2, 2 * R3] },
			{ tile: 0, m: [-1, 0, 3, 0, 1, 0] },
		],
	],
};

/**
 * The half-hex, inflation factor 2, one prototile, four children.
 *
 * The prototile is half a regular hexagon: an isosceles trapezoid with sides 2, 1, 1, 1, which is
 * three unit triangles. The name pins the shape exactly, which is why it can be searched for at all.
 * The encyclopedia notes the substitution "occurs already in [GS87], see Exercise 10.1.3", and that
 * the tiling is limitperiodic, so cut-and-project over a p-adic internal space, like the chair.
 *
 * Its factor-2 dissection is unique. Its factor-3 dissection is NOT — that search returns 49 — so the
 * atlas ships only the factor-2 rule; naming one of 49 as the encyclopedia's would be a guess.
 */
export const HALF_HEX: SubstitutionRule = {
	id: "half-hex",
	factor: 2,
	prototiles: [
		{ name: "half hexagon", outline: [[0, 0], [1 / 2, R3 / 2], [3 / 2, R3 / 2], [2, 0]] },
	],
	children: [
		[
			{ tile: 0, m: [1 / 2, R3 / 2, 0, R3 / 2, -1 / 2, 0] },
			{ tile: 0, m: [1, 0, 1, 0, 1, 0] },
			{ tile: 0, m: [-1 / 2, -R3 / 2, 4, R3 / 2, -1 / 2, 0] },
			{ tile: 0, m: [1, 0, 1, 0, -1, R3] },
		],
	],
};

/**
 * The pinwheel (Radin–Conway), inflation factor √5, one prototile, five children.
 *
 * The prototile is the right triangle with legs 1 and 2. This is the shelf's first rule whose
 * expansion TURNS as well as scales: φ is multiplication by the Gaussian integer 2+i, which scales by
 * √5 and rotates by arctan(1/2), an irrational multiple of π. Every level therefore adds that angle,
 * and tile orientations end up equidistributed on the circle — Radin's result, and the reason the
 * encyclopedia tags this one "Infinite Rotations" and "lacking Finite Local Complexity".
 *
 * DERIVATION. Lattice exact cover does not apply: the children are not lattice-aligned. What makes the
 * search finite instead is the encyclopedia's own sentence — "despite the occurrance of irrational
 * edge lengths and incommensurate angles, all vertices of the pinwheel tiling have rational
 * coordinates". A child with rational vertices has a rational unit leg vector, so its rotation comes
 * from the rational unit circle; at denominator 5 that is exactly 12 directions, 24 motions with
 * reflections. Searching those against translations on (1/5)ℤ² inside φ(T) returns TWO dissections.
 *
 * They differ by one diagonal: four of the five tiles are forced, and the remaining region is a 1×2
 * rectangle, which two copies of the prototile fill across either diagonal. The one below is the one
 * whose children are 3 reflected and 2 direct, so both handednesses occur at every level — which is
 * what the literature describes ("two prototiles consisting of a right triangle with legs of lengths
 * 1 and 2 and its reflection […] both orientations occur"). The other cut makes all five children
 * reflected, so handedness would alternate by level and any finite patch would be single-handed.
 *
 * That rectangle is also the cheapest genuine random substitution in this shelf: the two rules have
 * identical tile counts, so they are compatible, and mixing them per tile is a legal randomisation.
 */
export const PINWHEEL: SubstitutionRule = {
	id: "pinwheel",
	factor: Math.sqrt(5),
	// Multiplication by 2 + i.
	expansion: [2, -1, 1, 2],
	prototiles: [
		{ name: "pinwheel triangle", outline: [[0, 0], [2, 0], [0, 1]] },
	],
	children: [
		[
			{ tile: 0, m: [1, 0, 2, 0, -1, 2] },
			{ tile: 0, m: [0, -1, 0, -1, 0, 2] },
			{ tile: 0, m: [1, 0, 0, 0, -1, 1] },
			{ tile: 0, m: [1, 0, 0, 0, 1, 1] },
			{ tile: 0, m: [-1, 0, 2, 0, -1, 2] },
		],
	],
};

/**
 * The half-hex at inflation factor 3, with TWO dissections — the shelf's first random substitution.
 *
 * WHY FACTOR 3, and not the factor-2 rule above. The half-hex's factor-2 dissection is unique, and a
 * unique dissection cannot be randomised: there is no second rule to choose between. The four colours
 * in the HALF_HEX view are the four child SLOTS of that one rule — four placements of one trapezoid,
 * not four prototiles and not four rules — so permuting them repaints the picture and changes no
 * geometry at all. Randomising a rigid rep-tile means going up a factor, which is the standard
 * "composition of inflation rules" route in the random-substitution literature.
 *
 * At factor 3 the same prototile has 49 dissections into 9 copies (scripts/derive-substitution-rules.mjs).
 * Two of them are shipped here. They are COMPATIBLE — one prototile, 9 children each — so the
 * substitution matrix is [9] either way, the inflation factor stays 3, and the tile frequencies are
 * untouched. Only the arrangement is random. That is the case where Baake, Spindeler and Strungaru
 * (Indag. Math. 2018) show randomness need not destroy long-range order.
 *
 * Two, not 49, on purpose: this is the smallest thing that demonstrates the mechanism, and every extra
 * alternative multiplies the sample space without making the point any clearer.
 */
export const HALF_HEX_3: SubstitutionRule = {
	id: "half-hex-3",
	factor: 3,
	prototiles: HALF_HEX.prototiles,
	children: [
		[
			{ tile: 0, m: [1, 0, 0, 0, 1, 0] },
			{ tile: 0, m: [1, 0, 4, 0, 1, 0] },
			{ tile: 0, m: [1, 0, 1 / 2, 0, 1, R3 / 2] },
			{ tile: 0, m: [1, 0, 3 / 2, 0, -1, R3 / 2] },
			{ tile: 0, m: [1 / 2, R3 / 2, 3, R3 / 2, -1 / 2, 0] },
			{ tile: 0, m: [-1 / 2, -R3 / 2, 11 / 2, R3 / 2, -1 / 2, R3 / 2] },
			{ tile: 0, m: [1, 0, 1, 0, 1, R3] },
			{ tile: 0, m: [1, 0, 2, 0, -1, R3] },
			{ tile: 0, m: [1, 0, 5 / 2, 0, -1, (3 * R3) / 2] },
		],
	],
	variants: [
		[
			[
				{ tile: 0, m: [1, 0, 0, 0, 1, 0] },
				{ tile: 0, m: [1, 0, 4, 0, 1, 0] },
				{ tile: 0, m: [1 / 2, R3 / 2, 1 / 2, R3 / 2, -1 / 2, R3 / 2] },
				{ tile: 0, m: [1, 0, 7 / 2, 0, 1, R3 / 2] },
				{ tile: 0, m: [1, 0, 5 / 2, 0, -1, R3 / 2] },
				{ tile: 0, m: [-1 / 2, -R3 / 2, 3, R3 / 2, -1 / 2, 0] },
				{ tile: 0, m: [1, 0, 3, 0, 1, R3] },
				{ tile: 0, m: [1, 0, 2, 0, -1, R3] },
				{ tile: 0, m: [1, 0, 3 / 2, 0, -1, (3 * R3) / 2] },
			],
		],
	],
};

export const SUBSTITUTION_RULES = {
	chair: CHAIR,
	sphinx: SPHINX,
	"half-hex": HALF_HEX,
	pinwheel: PINWHEEL,
	"half-hex-3": HALF_HEX_3,
} as const;
export type SubstitutionRuleId = keyof typeof SUBSTITUTION_RULES;
