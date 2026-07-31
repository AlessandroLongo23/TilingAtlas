/**
 * The 15 types of convex pentagon that tile the plane: Kershner's classification, closed by Rao (2017).
 *
 * Labelling convention is Mann, McLoud-Mann and Von Derau 2015 (arXiv:1510.01186, Fig. 1): vertices
 * A..E in order, side `b` joins A-B, `c` joins B-C, `d` joins C-D, `e` joins D-E, `a` joins E-A. So
 * side X is the side ARRIVING at vertex X, and the two sides meeting at A are `a` and `b`. Every major
 * source uses a different cyclic rotation of A..E for the same type; this file uses one and only one.
 *
 * Degrees of freedom, excluding size: a pentagon has 6 (four free angles, two free side ratios), and
 * each type's conditions remove some. The counts here are not copied from a source, they fall out of
 * the solver in solve.ts, and solve.test.ts pins them.
 *
 * The over-determined types (6, 7, 8, 9, 14, 15) are the subtle ones. Their side conditions supply
 * three or more equations which, with the two closure equations, over-determine the five side lengths.
 * A nonzero solution exists only where a determinant vanishes, a transcendental condition that pins one
 * further angle. That is why those types' angles are irrational, and why their DOF is one lower than
 * the angle conditions alone suggest. `solveAngle` names the angle the root find recovers.
 */

export type Angles = [A: number, B: number, C: number, D: number, E: number];
export type Sides = [a: number, b: number, c: number, d: number, e: number];

/** d/a for Type 15: 2·cos15° = (√6+√2)/2 ≈ 1.9318516525781366.
 *
 *  NOT Wikipedia's `1/(√2(√3−1))` ≈ 0.9659. The pentagon does not close with that value; the walk ends
 *  a full unit from where it started. It is a relabelling artefact: Mann et al. normalise a different
 *  side to 1, and their `1/(√2(√3−1))` is the ratio for `c`, not `d`. */
export const TYPE15_D_OVER_A = Math.sqrt(2 + Math.sqrt(3));

/**
 * A slider.
 *
 * `min` and `max` are MEASURED by scripts/scan-pentagon-ranges.ts, which walks each parameter outward
 * from its default over the whole mathematically possible domain until the tiling actually breaks. Not
 * derived from the convexity inequalities, which describe a strictly larger region than the family, and
 * emphatically not guessed: a guessed bound cannot be corrected by a scan that only searches inside it,
 * which is how Type 13 shipped with A ∈ [95°, 135°] when its family really begins at 90°.
 *
 * EVERY ANGLE BOUND IS ITS DEGENERATE LIMIT. At the end of the range the pentagon flattens into a
 * quadrilateral, one of two ways: an angle reaches exactly 180° and a corner stops being a corner
 * (Type 13's A = 90° makes D straight; Type 4 reaches A = 180° outright), or a side shrinks to zero and
 * two corners merge (Type 13's A = 135°). The first is attainable and the slider lands on it; the second
 * is not, because a zero-length edge has no direction to glue along, so those bounds stop one step short.
 *
 * The two ratio sliders on Type 1 are the exception worth naming. `b/a` has NO upper limit — the tile
 * just elongates, and it still tiles at b/a = 10000 — so its max is a usability cap, not a limit. `c/a`
 * does have a real one at 16.608, and that is the number below.
 *
 * The scan moves one parameter at a time with the others at their defaults, so on the multi-parameter
 * types (1, 2, 4, 5) these bounds are a bounding BOX around a region that is not one. Tuples inside the
 * box can still fail, which is why the page keeps the last valid tiling on screen and names the reason
 * instead of trusting the bounds to be sufficient.
 */
export interface ParamSpec {
	/** The quantity itself, as the literature names it: "B", "D", "b/a". Never "p0". */
	key: string;
	kind: "angle" | "ratio";
	min: number;
	max: number;
	step: number;
	def: number;
}

/** A side parameter also says which side index (0..4 = a..e) it pins, as a multiple of `a`. */
export interface SideParamSpec extends ParamSpec {
	index: number;
}

export interface Constraint {
	/** The condition as written in the literature. */
	text: string;
	/** The same condition with the current numbers in it, so a slider drag reads as the condition holding. */
	live: (ang: Angles, s: Sides) => string;
}

export interface PentagonType {
	id: number;
	label: string;
	/** Who found it and when. Types 1-5 Reinhardt; 6-8 Kershner; 10 James; 11-13 Rice; 14 Stein; 15 MMV. */
	discovered: string;
	/** Wallpaper groups the type's tilings can achieve. Not single valued: Type 1 alone reaches six. */
	groups: string;
	/** Tiles in the translational unit. */
	tilesPerUnit: number;
	dof: number;
	constraints: Constraint[];
	/** Slider-driven free angles, in the order `angles` reads them. */
	angleParams: ParamSpec[];
	/** Slider-driven free sides (types 1 and 2 only), each adding a row `side[index] = value · a`. */
	sideParams: SideParamSpec[];
	/**
	 * The five angles in degrees. `extra` is the angle the determinant root find recovered, and is
	 * ignored by every type whose `solveAngle` is null.
	 */
	angles: (free: number[], extra: number) => Angles;
	/** Where to hunt for the determinant root, when the type needs one. */
	solveAngle: { key: string; bracket: [number, number] } | null;
	/** Side conditions as rows over (a, b, c, d, e), each row · sides = 0. */
	sideRows: number[][];
}

const deg = (v: number) => v.toFixed(1);

export const PENTAGON_TYPES: PentagonType[] = [
	{
		id: 1,
		label: "Type 1",
		discovered: "Reinhardt 1918",
		groups: "p2, cmm, cm, pmg, pgg, p1",
		tilesPerUnit: 2,
		dof: 5,
		constraints: [
			{ text: "B + C = 180°", live: (a) => `${deg(a[1])} + ${deg(a[2])} = ${deg(a[1] + a[2])}°` },
		],
		angleParams: [
			{ key: "A", kind: "angle", min: 70, max: 180, step: 0.1, def: 120 },
			{ key: "B", kind: "angle", min: 22.7, max: 157.3, step: 0.1, def: 100 },
			{ key: "D", kind: "angle", min: 60, max: 156.7, step: 0.1, def: 110 },
		],
		sideParams: [
			{ key: "b/a", kind: "ratio", min: 0.001, max: 8, step: 0.001, def: 2.253835, index: 1 },
			{ key: "c/a", kind: "ratio", min: 0.88, max: 16.608, step: 0.001, def: 2.251052, index: 2 },
		],
		angles: ([A, B, D]) => [A, B, 180 - B, D, 360 - A - D],
		solveAngle: null,
		sideRows: [],
	},
	{
		id: 2,
		label: "Type 2",
		discovered: "Reinhardt 1918",
		groups: "pgg",
		tilesPerUnit: 4,
		dof: 4,
		constraints: [
			{ text: "B + D = 180°", live: (a) => `${deg(a[1])} + ${deg(a[3])} = ${deg(a[1] + a[3])}°` },
			{ text: "c = e", live: (_, s) => `${s[2].toFixed(4)} = ${s[4].toFixed(4)}` },
		],
		angleParams: [
			{ key: "A", kind: "angle", min: 92.6, max: 134.5, step: 0.1, def: 100 },
			{ key: "B", kind: "angle", min: 104.4, max: 129.9, step: 0.1, def: 110 },
			{ key: "C", kind: "angle", min: 124.4, max: 178.6, step: 0.1, def: 130 },
		],
		sideParams: [{ key: "b/a", kind: "ratio", min: 0.395, max: 1.532, step: 0.001, def: 0.533048, index: 1 }],
		angles: ([A, B, C]) => [A, B, C, 180 - B, 360 - A - C],
		solveAngle: null,
		sideRows: [[0, 0, 1, 0, -1]],
	},
	{
		id: 3,
		label: "Type 3",
		discovered: "Reinhardt 1918",
		groups: "p3, p31m",
		tilesPerUnit: 3,
		dof: 1,
		constraints: [
			{ text: "A = C = D = 120°", live: (a) => `${deg(a[0])} = ${deg(a[2])} = ${deg(a[3])}°` },
			{ text: "a = b", live: (_, s) => `${s[0].toFixed(4)} = ${s[1].toFixed(4)}` },
			{ text: "d = c + e", live: (_, s) => `${s[3].toFixed(4)} = ${s[2].toFixed(4)} + ${s[4].toFixed(4)}` },
		],
		angleParams: [{ key: "B", kind: "angle", min: 60.1, max: 119.9, step: 0.1, def: 100 }],
		sideParams: [],
		angles: ([B]) => [120, B, 120, 120, 180 - B],
		solveAngle: null,
		sideRows: [
			[1, -1, 0, 0, 0],
			[0, 0, -1, 1, -1],
		],
	},
	{
		id: 4,
		label: "Type 4",
		discovered: "Reinhardt 1918",
		groups: "p4, p4g",
		tilesPerUnit: 4,
		dof: 2,
		constraints: [
			{ text: "B = D = 90°", live: (a) => `${deg(a[1])} = ${deg(a[3])}°` },
			{ text: "b = c", live: (_, s) => `${s[1].toFixed(4)} = ${s[2].toFixed(4)}` },
			{ text: "d = e", live: (_, s) => `${s[3].toFixed(4)} = ${s[4].toFixed(4)}` },
		],
		angleParams: [
			{ key: "A", kind: "angle", min: 50, max: 180, step: 0.1, def: 120 },
			{ key: "C", kind: "angle", min: 90.1, max: 180, step: 0.1, def: 130 },
		],
		sideParams: [],
		angles: ([A, C]) => [A, 90, C, 90, 360 - A - C],
		solveAngle: null,
		sideRows: [
			[0, 1, -1, 0, 0],
			[0, 0, 0, 1, -1],
		],
	},
	{
		id: 5,
		label: "Type 5",
		discovered: "Reinhardt 1918",
		groups: "p6",
		tilesPerUnit: 6,
		dof: 2,
		constraints: [
			{ text: "A = 60°, D = 120°", live: (a) => `${deg(a[0])}°, ${deg(a[3])}°` },
			{ text: "a = b", live: (_, s) => `${s[0].toFixed(4)} = ${s[1].toFixed(4)}` },
			{ text: "d = e", live: (_, s) => `${s[3].toFixed(4)} = ${s[4].toFixed(4)}` },
		],
		angleParams: [
			{ key: "B", kind: "angle", min: 60.1, max: 139.9, step: 0.1, def: 110 },
			{ key: "C", kind: "angle", min: 70, max: 159.9, step: 0.1, def: 130 },
		],
		sideParams: [],
		angles: ([B, C]) => [60, B, C, 120, 360 - B - C],
		solveAngle: null,
		sideRows: [
			[1, -1, 0, 0, 0],
			[0, 0, 0, 1, -1],
		],
	},
	{
		id: 6,
		label: "Type 6",
		discovered: "Kershner 1968",
		groups: "p2, pgg",
		tilesPerUnit: 4,
		dof: 1,
		constraints: [
			{ text: "B + D = 180°", live: (a) => `${deg(a[1])} + ${deg(a[3])} = ${deg(a[1] + a[3])}°` },
			{ text: "E = 2B", live: (a) => `${deg(a[4])} = 2 × ${deg(a[1])}` },
			{ text: "a = d = e", live: (_, s) => `${s[0].toFixed(4)} = ${s[3].toFixed(4)} = ${s[4].toFixed(4)}` },
			{ text: "b = c", live: (_, s) => `${s[1].toFixed(4)} = ${s[2].toFixed(4)}` },
		],
		angleParams: [{ key: "B", kind: "angle", min: 30.5, max: 90, step: 0.1, def: 70 }],
		sideParams: [],
		angles: ([B], A) => [A, B, 360 - 2 * B - A, 180 - B, 2 * B],
		solveAngle: { key: "A", bracket: [1, 179] },
		sideRows: [
			[1, 0, 0, -1, 0],
			[0, 0, 0, 1, -1],
			[0, 1, -1, 0, 0],
		],
	},
	{
		id: 7,
		label: "Type 7",
		discovered: "Kershner 1968",
		groups: "pgg",
		tilesPerUnit: 8,
		dof: 1,
		constraints: [
			{ text: "B + 2E = 360°", live: (a) => `${deg(a[1])} + 2 × ${deg(a[4])} = ${deg(a[1] + 2 * a[4])}°` },
			{ text: "2C + D = 360°", live: (a) => `2 × ${deg(a[2])} + ${deg(a[3])} = ${deg(2 * a[2] + a[3])}°` },
			{ text: "b = c = d = e", live: (_, s) => `${s[1].toFixed(4)} (×4)` },
		],
		angleParams: [{ key: "E", kind: "angle", min: 90, max: 178.9, step: 0.1, def: 110 }],
		sideParams: [],
		angles: ([E], C) => [C + E - 180, 360 - 2 * E, C, 360 - 2 * C, E],
		solveAngle: { key: "C", bracket: [95, 179] },
		sideRows: [
			[0, 1, -1, 0, 0],
			[0, 0, 1, -1, 0],
			[0, 0, 0, 1, -1],
		],
	},
	{
		id: 8,
		label: "Type 8",
		discovered: "Kershner 1968",
		groups: "pgg",
		tilesPerUnit: 8,
		dof: 1,
		constraints: [
			{ text: "2B + C = 360°", live: (a) => `2 × ${deg(a[1])} + ${deg(a[2])} = ${deg(2 * a[1] + a[2])}°` },
			{ text: "D + 2E = 360°", live: (a) => `${deg(a[3])} + 2 × ${deg(a[4])} = ${deg(a[3] + 2 * a[4])}°` },
			{ text: "b = c = d = e", live: (_, s) => `${s[1].toFixed(4)} (×4)` },
		],
		angleParams: [{ key: "B", kind: "angle", min: 90, max: 173.9, step: 0.1, def: 110 }],
		sideParams: [],
		angles: ([B], E) => [B + E - 180, B, 360 - 2 * B, 360 - 2 * E, E],
		solveAngle: { key: "E", bracket: [95, 179] },
		sideRows: [
			[0, 1, -1, 0, 0],
			[0, 0, 1, -1, 0],
			[0, 0, 0, 1, -1],
		],
	},
	{
		id: 9,
		label: "Type 9",
		discovered: "Kershner 1968",
		groups: "pgg",
		tilesPerUnit: 8,
		dof: 1,
		constraints: [
			{ text: "2A + C = 360°", live: (a) => `2 × ${deg(a[0])} + ${deg(a[2])} = ${deg(2 * a[0] + a[2])}°` },
			{ text: "D + 2E = 360°", live: (a) => `${deg(a[3])} + 2 × ${deg(a[4])} = ${deg(a[3] + 2 * a[4])}°` },
			{ text: "b = c = d = e", live: (_, s) => `${s[1].toFixed(4)} (×4)` },
		],
		angleParams: [{ key: "A", kind: "angle", min: 90, max: 134.9, step: 0.1, def: 110 }],
		sideParams: [],
		angles: ([A], E) => [A, A + E - 180, 360 - 2 * A, 360 - 2 * E, E],
		solveAngle: { key: "E", bracket: [95, 179] },
		sideRows: [
			[0, 1, -1, 0, 0],
			[0, 0, 1, -1, 0],
			[0, 0, 0, 1, -1],
		],
	},
	{
		id: 10,
		label: "Type 10",
		discovered: "James 1975",
		groups: "p2, cmm",
		tilesPerUnit: 6,
		dof: 1,
		constraints: [
			{ text: "A = 90°", live: (a) => `${deg(a[0])}°` },
			{ text: "B + E = 180°", live: (a) => `${deg(a[1])} + ${deg(a[4])} = ${deg(a[1] + a[4])}°` },
			{ text: "B + 2C = 360°", live: (a) => `${deg(a[1])} + 2 × ${deg(a[2])} = ${deg(a[1] + 2 * a[2])}°` },
			{ text: "a = b = c + e", live: (_, s) => `${s[0].toFixed(4)} = ${s[2].toFixed(4)} + ${s[4].toFixed(4)}` },
		],
		angleParams: [{ key: "B", kind: "angle", min: 53.2, max: 126.8, step: 0.1, def: 100 }],
		sideParams: [],
		angles: ([B]) => [90, B, 180 - B / 2, 90 + B / 2, 180 - B],
		solveAngle: null,
		sideRows: [
			[1, -1, 0, 0, 0],
			[1, 0, -1, 0, -1],
		],
	},
	{
		id: 11,
		label: "Type 11",
		discovered: "Rice 1976",
		groups: "pgg",
		tilesPerUnit: 8,
		dof: 1,
		constraints: [
			{ text: "A = 90°", live: (a) => `${deg(a[0])}°` },
			{ text: "2B + C = 360°", live: (a) => `2 × ${deg(a[1])} + ${deg(a[2])} = ${deg(2 * a[1] + a[2])}°` },
			{ text: "C + E = 180°", live: (a) => `${deg(a[2])} + ${deg(a[4])} = ${deg(a[2] + a[4])}°` },
			{ text: "2a + c = d = e", live: (_, s) => `2 × ${s[0].toFixed(4)} + ${s[2].toFixed(4)} = ${s[3].toFixed(4)}` },
		],
		angleParams: [{ key: "B", kind: "angle", min: 139.4, max: 158.5, step: 0.1, def: 149 }],
		sideParams: [],
		angles: ([B]) => [90, B, 360 - 2 * B, 270 - B, 2 * B - 180],
		solveAngle: null,
		sideRows: [
			[2, 0, 1, -1, 0],
			[0, 0, 0, 1, -1],
		],
	},
	{
		id: 12,
		label: "Type 12",
		discovered: "Rice 1977",
		groups: "pgg",
		tilesPerUnit: 8,
		dof: 1,
		constraints: [
			{ text: "A = 90°", live: (a) => `${deg(a[0])}°` },
			{ text: "2B + C = 360°", live: (a) => `2 × ${deg(a[1])} + ${deg(a[2])} = ${deg(2 * a[1] + a[2])}°` },
			{ text: "C + E = 180°", live: (a) => `${deg(a[2])} + ${deg(a[4])} = ${deg(a[2] + a[4])}°` },
			{ text: "2a = d = c + e", live: (_, s) => `2 × ${s[0].toFixed(4)} = ${s[3].toFixed(4)}` },
		],
		angleParams: [{ key: "B", kind: "angle", min: 139.4, max: 165.5, step: 0.1, def: 153 }],
		sideParams: [],
		angles: ([B]) => [90, B, 360 - 2 * B, 270 - B, 2 * B - 180],
		solveAngle: null,
		sideRows: [
			[2, 0, 0, -1, 0],
			[0, 0, -1, 1, -1],
		],
	},
	{
		id: 13,
		label: "Type 13",
		discovered: "Rice 1977",
		groups: "pgg",
		tilesPerUnit: 8,
		dof: 1,
		constraints: [
			{ text: "B = E = 90°", live: (a) => `${deg(a[1])} = ${deg(a[4])}°` },
			{ text: "2A + D = 360°", live: (a) => `2 × ${deg(a[0])} + ${deg(a[3])} = ${deg(2 * a[0] + a[3])}°` },
			{ text: "d = 2a = 2e", live: (_, s) => `${s[3].toFixed(4)} = 2 × ${s[0].toFixed(4)}` },
		],
		angleParams: [{ key: "A", kind: "angle", min: 90, max: 134.9, step: 0.1, def: 105 }],
		sideParams: [],
		angles: ([A]) => [A, 90, A, 360 - 2 * A, 90],
		solveAngle: null,
		sideRows: [
			[-2, 0, 0, 1, 0],
			[1, 0, 0, 0, -1],
		],
	},
	{
		id: 14,
		label: "Type 14",
		discovered: "Stein 1985",
		groups: "p2",
		tilesPerUnit: 6,
		dof: 0,
		constraints: [
			{ text: "A = 90°", live: (a) => `${deg(a[0])}°` },
			{ text: "2B + C = 360°", live: (a) => `2 × ${deg(a[1])} + ${deg(a[2])} = ${deg(2 * a[1] + a[2])}°` },
			{ text: "C + E = 180°", live: (a) => `${deg(a[2])} + ${deg(a[4])} = ${deg(a[2] + a[4])}°` },
			{ text: "2a = 2c = d = e", live: (_, s) => `2 × ${s[0].toFixed(4)} = ${s[3].toFixed(4)}` },
		],
		angleParams: [],
		sideParams: [],
		angles: (_, B) => [90, B, 360 - 2 * B, 270 - B, 2 * B - 180],
		// sin B = (√57−3)/8 puts B in the obtuse branch, ≈ 145.3383362615°. Bracketing above 91° is what
		// picks it: the acute branch (≈34.66°) satisfies the determinant too but gives E = 2B − 180 < 0.
		solveAngle: { key: "B", bracket: [91, 179] },
		sideRows: [
			[1, 0, -1, 0, 0],
			[2, 0, 0, -1, 0],
			[0, 0, 0, 1, -1],
		],
	},
	{
		id: 15,
		label: "Type 15",
		discovered: "Mann, McLoud-Mann & Von Derau 2015",
		groups: "pgg",
		tilesPerUnit: 12,
		dof: 0,
		constraints: [
			{ text: "A = 150°, B = 60°, C = 135°, D = 105°, E = 90°", live: (a) => a.map(deg).join(", ") },
			{ text: "a = c = e, b = 2a", live: (_, s) => `${s[0].toFixed(4)}, ${s[1].toFixed(4)}` },
			{ text: "d = a·√(2+√3)", live: (_, s) => `${s[3].toFixed(6)}` },
		],
		angleParams: [],
		sideParams: [],
		angles: () => [150, 60, 135, 105, 90],
		solveAngle: null,
		sideRows: [
			[1, 0, -1, 0, 0],
			[1, 0, 0, 0, -1],
			[-2, 1, 0, 0, 0],
			[-TYPE15_D_OVER_A, 0, 0, 1, 0],
		],
	},
];

export const DEFAULT_TYPE = 1;

export function pentagonType(id: number): PentagonType | null {
	return PENTAGON_TYPES.find((t) => t.id === id) ?? null;
}

/** `?type=` accepts "7" or "Type7"; anything unparseable falls back to the default. */
export function parseType(raw: string | null): number {
	if (!raw) return DEFAULT_TYPE;
	const n = Number(raw.replace(/^type\s*/i, "").trim());
	return Number.isInteger(n) && n >= 1 && n <= 15 ? n : DEFAULT_TYPE;
}

/** The slider tuple a type opens on. */
export function defaultParams(t: PentagonType): { angles: number[]; sides: number[] } {
	return {
		angles: t.angleParams.map((p) => p.def),
		sides: t.sideParams.map((p) => p.def),
	};
}
