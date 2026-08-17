// A data-driven substitution engine.
//
// The atlas already inflates two substitutions, but both are hardcoded: hatPatch.ts carries Kaplan's
// four metatiles and their gluing rules in TypeScript, penrosePatch.ts deflates Robinson triangles by
// a fixed recursion. Neither can be pointed at a third tiling. This is the same operation with the
// rule moved out into data, so a new entry from the Tilings Encyclopedia is a `SubstitutionRule`
// literal and nothing else.
//
// A rule is the standard object: a set of prototiles, an expansion factor λ, and for each prototile a
// list of rigid motions placing smaller prototiles so that they exactly fill the prototile scaled by λ.
//
//     φ(P_t) = ⋃_j g_j(P_{c_j}),   φ = scale by λ about the origin
//
// Inflating n times gives a patch filling φⁿ(P_t). Iterating that identity outward:
//
//     φⁿ(P_t) = ⋃_j (φ^{n-1} g_j φ^{-(n-1)}) · φ^{n-1}(P_{c_j})
//
// and because φ is a similarity, conjugating a rigid motion by it only scales the translation — the
// rotation part is untouched. So the driver never inverts anything: at each step it multiplies the
// accumulated transform's translation by λ and composes with the child's motion. That is `inflate`
// below, and it is the whole engine.
//
// Coordinates are floats. The prototiles here sit on the square and triangular lattices, where the
// child motions have entries in {0, ±1/2, ±1, ±√3/2}, so a double carries ~15 significant digits
// through the 8 levels the view offers; the accumulated error at level 8 is far below a pixel. Moving
// to Cyclotomic (lib/classes/Cyclotomic.ts, which holds ζ₁₂ and ζ₂₄ exactly) would make vertex
// identity decidable, which matters for adjacency and dedup work but not for drawing a patch.

import type { RawPolygon } from "@/lib/utils/renderTiling";

/** A 2×3 affine, row-major: (x, y) ↦ (a·x + b·y + c, d·x + e·y + f). hatPatch.ts's `Aff` layout. */
export type Aff = readonly [number, number, number, number, number, number];

export const IDENT: Aff = [1, 0, 0, 0, 1, 0];

/** A ∘ B — B applied first. */
export function affMul(A: Aff, B: Aff): Aff {
	return [
		A[0] * B[0] + A[1] * B[3],
		A[0] * B[1] + A[1] * B[4],
		A[0] * B[2] + A[1] * B[5] + A[2],
		A[3] * B[0] + A[4] * B[3],
		A[3] * B[1] + A[4] * B[4],
		A[3] * B[2] + A[4] * B[5] + A[5],
	];
}

/** Negative for a reflected placement — the handedness of a chiral prototile. */
export const affDet = (m: Aff): number => m[0] * m[4] - m[1] * m[3];

/** A 2×2 linear map, row-major [a, b, c, d]. The expansion φ of a rule. */
export type Linear = readonly [number, number, number, number];

/**
 * φ·M·φ⁻¹ — what `inflate` needs to grow a patch outward without ever forming φ⁻¹ at the call site.
 *
 * When φ is a pure scaling by λ this is the cheap case everyone expects: the linear part is untouched
 * and the translation scales by λ. It is NOT the general case. The pinwheel expands by multiplication
 * by 2+i, which scales by √5 AND turns by arctan(1/2), and conjugating a REFLECTION by a rotation
 * turns its mirror axis — z ↦ u·z̄ becomes z ↦ u·e^{2iθ}·z̄. Scaling the translation alone would place
 * every reflected child at the wrong angle, and the patch would tear at the second level.
 *
 * So the general path multiplies the matrices out. `expansion` is the rule's φ; passing a scalar keeps
 * the fast path, which is what the three factor-2 rep-tiles use.
 */
export function conjugateByExpansion(m: Aff, expansion: number | Linear): Aff {
	if (typeof expansion === "number") {
		return [m[0], m[1], m[2] * expansion, m[3], m[4], m[5] * expansion];
	}
	const [a, b, c, d] = expansion;
	const det = a * d - b * c;
	// φ⁻¹, as the adjugate over the determinant.
	const [ia, ib, ic, id] = [d / det, -b / det, -c / det, a / det];
	// φ · L
	const l0 = a * m[0] + b * m[3];
	const l1 = a * m[1] + b * m[4];
	const l2 = c * m[0] + d * m[3];
	const l3 = c * m[1] + d * m[4];
	return [
		l0 * ia + l1 * ic,
		l0 * ib + l1 * id,
		a * m[2] + b * m[5],
		l2 * ia + l3 * ic,
		l2 * ib + l3 * id,
		c * m[2] + d * m[5],
	];
}

export interface Prototile {
	name: string;
	/** The outline in lattice coordinates, one winding, no repeated closing vertex. */
	outline: readonly (readonly [number, number])[];
}

export interface SubstitutionChild {
	/** Index into `SubstitutionRule.prototiles`. */
	tile: number;
	/** Places the child inside the PARENT SCALED BY λ, in the parent's own coordinates. */
	m: Aff;
}

export interface SubstitutionRule {
	id: string;
	/** Linear expansion factor λ. Areas grow by λ². */
	factor: number;
	/**
	 * The expansion φ as a 2×2 map, when it is not the pure scaling by `factor`.
	 *
	 * Only rules whose inflation turns as well as scales need this — the pinwheel's φ is multiplication
	 * by 2+i. Omit it and φ is diag(factor, factor), which is right for every rep-tile here.
	 */
	expansion?: Linear;
	prototiles: readonly Prototile[];
	/** `children[t]` exactly fills `prototiles[t]` mapped through φ. */
	children: readonly (readonly SubstitutionChild[])[];
	/**
	 * Further dissections of the same inflated prototile — what makes a rule RANDOM.
	 *
	 * `variants[t]` holds the alternatives to `children[t]`; each one fills φ(prototiles[t]) on its own,
	 * so a substitution may pick freely between them at every tile, independently. That is the standard
	 * "locally random" construction (Godrèche & Luck 1989), and it is only legitimate when the
	 * alternatives are COMPATIBLE — same multiset of child prototiles, so the substitution matrix, the
	 * inflation factor and the tile frequencies are untouched and only the arrangement is random.
	 * `sameAbelianisation` below is that check, and the test suite enforces it.
	 *
	 * Most rules have none: a rep-tile whose dissection is unique cannot be randomised at its own
	 * factor, no matter how its tiles are coloured.
	 */
	variants?: readonly (readonly (readonly SubstitutionChild[])[])[];
}

/** Every dissection available for prototile `t`: the default first, then any variants. */
export const childSets = (rule: SubstitutionRule, t: number): readonly (readonly SubstitutionChild[])[] => [
	rule.children[t],
	...(rule.variants?.[t] ?? []),
];

/**
 * Do two child sets substitute the same multiset of prototiles?
 *
 * The compatibility condition. Equal abelianisations mean both alternatives contribute the same column
 * to the substitution matrix, so mixing them leaves the inflation factor and the asymptotic tile
 * frequencies exactly where the deterministic rule put them — which is why a compatible random
 * substitution can carry positive entropy and still keep its Bragg peaks (Baake, Spindeler &
 * Strungaru 2018). Incompatible alternatives are a different, much worse-behaved object.
 */
export function sameAbelianisation(
	a: readonly SubstitutionChild[],
	b: readonly SubstitutionChild[],
	nPrototiles: number,
): boolean {
	const count = (cs: readonly SubstitutionChild[]) => {
		const v = new Array<number>(nPrototiles).fill(0);
		for (const c of cs) v[c.tile]++;
		return v;
	};
	const [x, y] = [count(a), count(b)];
	return x.every((n, i) => n === y[i]);
}

/** mulberry32 — a small seeded PRNG, so a sampled patch is reproducible from its seed alone. */
export function makeRng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** The rule's expansion in the form `conjugateByExpansion` wants. */
export const expansionOf = (rule: SubstitutionRule): number | Linear => rule.expansion ?? rule.factor;

/** The prototile outline after one expansion — the region `children[t]` has to fill. */
export function inflatedOutline(rule: SubstitutionRule, t: number): [number, number][] {
	const e = rule.expansion;
	return rule.prototiles[t].outline.map(([x, y]) =>
		e ? [e[0] * x + e[1] * y, e[2] * x + e[3] * y] : [x * rule.factor, y * rule.factor],
	);
}

export interface PlacedTile {
	tile: number;
	m: Aff;
	/** Which child slot this tile occupied at the LAST substitution step — the encyclopedia's
	 *  "relative position in the first-order super-tile", and what the chair is coloured by. */
	slot: number;
	/**
	 * Which dissection the PARENT used to produce this tile: 0 for the default, 1+ for a variant.
	 *
	 * Only a random rule ever sets this above 0, and it is the one thing worth colouring such a patch
	 * by — otherwise the randomness is invisible, because every alternative fills the same region with
	 * the same tiles and only the arrangement differs.
	 */
	variant: number;
}

/**
 * Tiles after `level` substitutions of one seed prototile: `factor²`^level of them for a rule whose
 * every prototile has the same child count.
 *
 * `choose` decides which dissection each tile uses, and is what separates a deterministic run from a
 * random one. It is called once PER TILE PER STEP — not once per level — because that independence is
 * exactly what "locally random" means; choosing once per level instead gives the globally random
 * construction, which has zero entropy and behaves like a deterministic rule.
 */
export function inflate(
	rule: SubstitutionRule,
	level: number,
	seed = 0,
	choose?: (prototile: number, options: number) => number,
): PlacedTile[] {
	const phi = expansionOf(rule);
	let tiles: PlacedTile[] = [{ tile: seed, m: IDENT, slot: 0, variant: 0 }];
	for (let i = 0; i < level; i++) {
		const next: PlacedTile[] = [];
		for (const t of tiles) {
			const grown = conjugateByExpansion(t.m, phi);
			const sets = childSets(rule, t.tile);
			const v = sets.length > 1 && choose ? choose(t.tile, sets.length) % sets.length : 0;
			const kids = sets[v];
			for (let j = 0; j < kids.length; j++) {
				next.push({ tile: kids[j].tile, m: affMul(grown, kids[j].m), slot: j, variant: v });
			}
		}
		tiles = next;
	}
	return tiles;
}

/** How many tiles `inflate` would return, without building them — for a slider's budget label. */
export function inflateCount(rule: SubstitutionRule, level: number, seed = 0): number {
	let counts: number[] = rule.prototiles.map((_, i) => (i === seed ? 1 : 0));
	for (let i = 0; i < level; i++) {
		const next: number[] = counts.map(() => 0);
		counts.forEach((n, t) => {
			if (n === 0) return;
			for (const c of rule.children[t]) next[c.tile] += n;
		});
		counts = next;
	}
	return counts.reduce((a, b) => a + b, 0);
}

/** Placed tiles as drawable polygons. `hue` decides the fill; see the rules' own choices. */
export function toPolygons(
	rule: SubstitutionRule,
	tiles: readonly PlacedTile[],
	hue: (t: PlacedTile) => number,
): RawPolygon[] {
	const out: RawPolygon[] = new Array(tiles.length);
	for (let i = 0; i < tiles.length; i++) {
		const t = tiles[i];
		const m = t.m;
		const outline = rule.prototiles[t.tile].outline;
		const vertices = outline.map(([x, y]) => ({
			x: m[0] * x + m[1] * y + m[2],
			y: m[3] * x + m[4] * y + m[5],
		}));
		out[i] = { n: vertices.length, vertices, hue: hue(t) };
	}
	return out;
}

/** Signed area of a ring; the sign is the winding. */
export function ringArea(pts: readonly (readonly [number, number])[]): number {
	let s = 0;
	for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
	return s / 2;
}
