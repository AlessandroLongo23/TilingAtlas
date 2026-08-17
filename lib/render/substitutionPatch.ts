// Patches of the encyclopedia substitutions, in the shape the /aperiodic patch view wants:
// (level) => RawPolygon[], alongside hatPatch and penrosePatch.
//
// The inflation itself is generic and lives in lib/substitution/engine.ts; the rules are data in
// lib/substitution/rules.ts. What this file decides is the two things the rule cannot state because
// neither is geometry: how a tile is coloured, and how the patch is framed.

import {
	affMul,
	childSets,
	inflate,
	inflateCount,
	makeRng,
	toPolygons,
	affDet,
	type Aff,
	type PlacedTile,
	type SubstitutionRule,
} from "@/lib/substitution/engine";
import { CHAIR, HALF_HEX, HALF_HEX_3, PINWHEEL, SPHINX } from "@/lib/substitution/rules";
import type { RawPolygon } from "@/lib/utils/renderTiling";

/**
 * The chair and the half-hex, coloured by which of the four child slots the tile filled at the last
 * substitution step.
 *
 * That is the encyclopedia's own scheme — "the tiles appear in three colours, depending on their
 * relative position in the first-order super-tile" — with four hues instead of its three, so the two
 * translate children stay distinguishable from each other as well as from the turned and reflected
 * ones.
 *
 * It is a DECORATION, not four prototiles and not four rules. The encyclopedia is explicit about this
 * for the chair: "the colours do not mean that there are different substitution rules, all tiles are
 * substituted in the same way". The same holds for the half-hex. Both have one prototile, one rule,
 * and a dissection that the exhaustive search in scripts/derive-substitution-rules.mjs shows is
 * unique — so permuting these four hues changes the picture's palette and nothing else.
 */
const SLOT_HUES = [28, 96, 200, 320];

/** The sphinx, coloured by handedness — the encyclopedia's "the colours indicate if a tile is left-
 *  or right-handed". Determinant of the accumulated transform, so it costs nothing to track. */
const SPHINX_RIGHT_HUE = 28;
const SPHINX_LEFT_HUE = 258;

/** Matched to Penrose depth 6 (1,140 rhombi) and hat level 4 (1,156 hats): 4^5 = 1,024 tiles. */
export const SUBSTITUTION_LEVEL = 5;

/**
 * Level cap. The factor-2 rules quadruple the tile count per level, so level 8 is 65,536 tiles — the
 * same order as the hat's own cap of 54,289 at level 6, and well under Penrose's 143,010 at depth 11.
 * Level 9 would be 262,144, which pushes the build and the triangulator past the tenth of a second
 * the other two views hold to.
 */
export const SUBSTITUTION_MAX_LEVEL = 8;

/**
 * The pinwheel's own default and cap. It multiplies by 5 per level, not 4, so the rungs land
 * differently: level 4 is 625 tiles (the closest to the other views' 1,024) and level 7 is 78,125,
 * which is the same order as the hat's cap.
 */
export const PINWHEEL_LEVEL = 4;
export const PINWHEEL_MAX_LEVEL = 7;

/**
 * The random half-hex's levels. It multiplies by 9 per level: level 3 is 729 tiles, near the other
 * views' 1,024, and level 5 is 59,049, the same order as the hat's cap.
 */
export const HALF_HEX_3_LEVEL = 3;
export const HALF_HEX_3_MAX_LEVEL = 5;

/** The pinwheel's expansion angle, arctan(1/2): the argument of 2 + i. */
const PINWHEEL_TURN = Math.atan2(1, 2);

/**
 * Undo the expansion's accumulated turn, so raising the level does not spin the patch.
 *
 * φ = ×(2+i) turns by arctan(1/2) as well as scaling, so φⁿ(T) sits at n·arctan(1/2) and each notch of
 * the slider rotates everything on screen by 26.57°. That is faithful to the algebra and useless to
 * read: the tiling you were looking at swings away every time you ask for more of it. Pre-multiplying
 * the whole patch by a rotation of −n·arctan(1/2) puts the seed triangle back on the axes at every
 * level. A global rotation is an isometry, so this changes where the patch is drawn and nothing about
 * which tiling it is — and it also holds the orientation colouring still from one level to the next.
 */
function deSpin(tiles: PlacedTile[], level: number): PlacedTile[] {
	const a = -level * PINWHEEL_TURN;
	const c = Math.cos(a);
	const s = Math.sin(a);
	const R: Aff = [c, -s, 0, s, c, 0];
	return tiles.map((t) => ({ ...t, m: affMul(R, t.m) }));
}

/** A rule plus the two things the rule does not carry: its colouring and any patch framing. */
export interface SubstitutionView {
	rule: SubstitutionRule;
	hue: (t: PlacedTile) => number;
	/** Applied after inflation. Only the pinwheel needs one. */
	orient?: (tiles: PlacedTile[], level: number) => PlacedTile[];
	level: { def: number; max: number };
}

export const SUBSTITUTION_VIEWS = {
	chair: {
		rule: CHAIR,
		hue: (t: PlacedTile) => SLOT_HUES[t.slot % SLOT_HUES.length],
		level: { def: SUBSTITUTION_LEVEL, max: SUBSTITUTION_MAX_LEVEL },
	},
	sphinx: {
		rule: SPHINX,
		hue: (t: PlacedTile) => (affDet(t.m) < 0 ? SPHINX_LEFT_HUE : SPHINX_RIGHT_HUE),
		level: { def: SUBSTITUTION_LEVEL, max: SUBSTITUTION_MAX_LEVEL },
	},
	"half-hex": {
		rule: HALF_HEX,
		hue: (t: PlacedTile) => SLOT_HUES[t.slot % SLOT_HUES.length],
		level: { def: SUBSTITUTION_LEVEL, max: SUBSTITUTION_MAX_LEVEL },
	},
	pinwheel: {
		rule: PINWHEEL,
		/**
		 * By ORIENTATION — the encyclopedia's own choice ("the colours in the images on this page are
		 * based on the orientations of the tiles"), and the only colouring that shows what this tiling is
		 * for. Every level adds arctan(1/2) to the accumulated angle, an irrational multiple of π, so the
		 * palette keeps splitting instead of settling onto a fixed set of hues. Reflected tiles are pushed
		 * half a turn round the wheel so handedness stays legible inside the ramp.
		 */
		hue: (t: PlacedTile) => {
			const deg = (Math.atan2(t.m[3], t.m[0]) * 180) / Math.PI;
			const flip = affDet(t.m) < 0 ? 180 : 0;
			return (((deg + flip) % 360) + 360) % 360;
		},
		orient: deSpin,
		level: { def: PINWHEEL_LEVEL, max: PINWHEEL_MAX_LEVEL },
	},
	"half-hex-3": {
		rule: HALF_HEX_3,
		/**
		 * By WHICH DISSECTION the parent used, with a small nudge by slot so structure stays readable.
		 *
		 * This is the only colouring that shows anything about a random substitution. Every alternative
		 * fills the same region with the same nine trapezoids and differs only in arrangement, so a patch
		 * coloured by slot or by shape looks exactly like the deterministic one. Coloured by variant, the
		 * two rules separate into visible territories and the mixing is the picture.
		 */
		hue: (t: PlacedTile) => (t.variant === 0 ? 200 : 28) + t.slot * 4,
		level: { def: HALF_HEX_3_LEVEL, max: HALF_HEX_3_MAX_LEVEL },
	},
} satisfies Record<string, SubstitutionView>;

export type SubstitutionViewId = keyof typeof SUBSTITUTION_VIEWS;

/**
 * How a random rule picks a dissection for this patch.
 *
 * A number pins every tile to that variant, which is how the deterministic rules are shown on their
 * own. "mix" draws independently per tile from a seeded generator, so the sample is reproducible from
 * its seed and a re-roll is just a new number.
 */
export type Sample = { pick: number } | { pick: "mix"; seed: number };

/** A patch of `id` at `level`, coloured and framed as that view wants. */
export function substitutionPatch(id: SubstitutionViewId, level: number, sample?: Sample): RawPolygon[] {
	const v: SubstitutionView = SUBSTITUTION_VIEWS[id];
	let choose: ((t: number, n: number) => number) | undefined;
	if (sample && sample.pick === "mix") {
		const rng = makeRng(sample.seed);
		choose = (_t, n) => Math.floor(rng() * n);
	} else if (sample && typeof sample.pick === "number") {
		const fixed = sample.pick;
		choose = () => fixed;
	}
	const tiles = inflate(v.rule, level, 0, choose);
	return toPolygons(v.rule, v.orient ? v.orient(tiles, level) : tiles, v.hue);
}

/**
 * The rule diagram: one panel per prototile, each holding that prototile's children.
 *
 * This is LEVEL 1 of the same builder, not a second drawing of the same idea, so the sidebar figure
 * cannot drift from the patch beside it — the pieces, their placements and their hues are the ones
 * the canvas uses. `orient` is skipped: the diagram wants the rule in the prototile's own frame.
 */
export function substitutionRuleFigure(id: SubstitutionViewId): { caption: string; pieces: RawPolygon[] }[] {
	const v: SubstitutionView = SUBSTITUTION_VIEWS[id];
	const out: { caption: string; pieces: RawPolygon[] }[] = [];
	v.rule.prototiles.forEach((proto, t) => {
		// One panel PER DISSECTION, not per prototile: a random rule’s whole content is that there is more
		// than one of them, and a figure showing only the default would say the opposite.
		const sets = childSets(v.rule, t);
		sets.forEach((kids, i) => {
			const label = sets.length > 1 ? ` · rule ${String.fromCharCode(65 + i)}` : "";
			out.push({
				caption: `${proto.name}${label} → ${kids.length} tiles`,
				pieces: toPolygons(v.rule, inflate(v.rule, 1, t, () => i), v.hue),
			});
		});
	});
	return out;
}

export const chairPatch = (level = SUBSTITUTION_LEVEL) => substitutionPatch("chair", level);
export const sphinxPatch = (level = SUBSTITUTION_LEVEL) => substitutionPatch("sphinx", level);
export const halfHexPatch = (level = SUBSTITUTION_LEVEL) => substitutionPatch("half-hex", level);
export const pinwheelPatch = (level = PINWHEEL_LEVEL) => substitutionPatch("pinwheel", level);
export const halfHex3Patch = (level = HALF_HEX_3_LEVEL, sample: Sample = { pick: "mix", seed: 1 }) =>
	substitutionPatch("half-hex-3", level, sample);

/** Tile count without building the patch, for the slider's budget label. */
export const chairCount = (level: number) => inflateCount(CHAIR, level);
export const sphinxCount = (level: number) => inflateCount(SPHINX, level);

/**
 * How the sphinx patch splits by handedness at a given level.
 *
 * A right-handed sphinx substitutes to three left-handed and one right-handed, so the count vector
 * iterates by [[1,3],[3,1]], whose eigenvalues are 4 and −2. From a right-handed seed that closes to
 * right = (4^n + (−2)^n)/2 and left = (4^n − (−2)^n)/2: the two only equalise in the limit, and at any
 * finite level the minority side is short by (−2)^n. At level 5 that is 496 against 528.
 */
export function sphinxHandedness(level: number): { right: number; left: number } {
	const total = 4 ** level;
	const gap = (-2) ** level;
	return { right: (total + gap) / 2, left: (total - gap) / 2 };
}
