// The board Marek Čtrnáct's `edges_isohedral_IH<nn>` corpora decorate: an isohedral tile, taken from
// Craig Kaplan's Tactile at the live parameter point. Decoded by tools/ctrnact-oracle/develop_ih_edges.py,
// which ships combinatorics only.
//
// WHY THIS FILE IS SHORT, unlike lib/pentagon/edge-board.ts. That board is a Kershner type 1 pentagon
// with a split side, and no parameterisation in the repo closed it, so it had to solve its own two-
// equation side system. An isohedral type is ALREADY parameterised — Tactile gives the tile at any
// point of the family, and /isohedral has been drawing it since 2026-07-31 — so all this file does is
// read the tile off `buildCell` and check that Tactile's description and Marek's agree.
//
// THE CORRESPONDENCE, asserted and not assumed. For IH01, Tactile reports numVertices 6, numEdgeShapes 3
// and edgeWord "abcABC", and its `edges` come back as id0, id1, id2, id0R, id1R, id2R — the edge leaving
// tiling vertex i. Marek's corpus independently says the boundary is
//
//     A -a- B -b- C -c- D -a- E -b- F -c- A
//
// So corner letters map to Tactile's vertex indices in order and edge classes map to its edge ids in
// order. `checkBoardAgreesWithTactile` asserts exactly that, per build, rather than trusting it.

import {
	buildCell,
	curvesOf,
	defaultEdgeStates,
	makeTiling,
	straightCurves,
	type EdgeCurves,
} from "./build";
import { ISOHEDRAL_TYPES } from "./catalogue";
import { EdgeShape, mul } from "./vendor/tactile";

export interface IhEdgeBoardSpec {
	ih: number;
	label: string;
	/** Corner letters, in the cyclic order Tactile's `tilingVertices` uses. */
	corners: string[];
	/** Edge classes, in the order Tactile's edge ids use. */
	classes: string[];
	/** The cyclic boundary as (corner, class of the side LEAVING it). Mirrors develop_ih_edges.py. */
	sides: [string, string][];
	/**
	 * Per class, how many DIGON SLOTS the corpus's alphabet gives it: 2 when the letters `X11`/`X13`
	 * appear, 1 when only `X10`/`X12` do. Read off the corpora, asserted by edge-board.test.ts.
	 *
	 * ⚑ This is what decides whether a class may be BOWED. A slot says which end of an edge a dart sits
	 * at, so a two-slot class knows which way it is being crossed and a one-slot class does not. On IH04
	 * to IH09 every one-slot class is an S edge, equal to its own reverse, so the missing bit costs
	 * nothing. IH10 is where that stops: its single class is used SIX times, is a J edge, and still gets
	 * one slot — so a bowed IH10 edge cannot know which way to bend, and `solveIhBoardFor` refuses the
	 * bulge instead of drawing half the tiles mirrored.
	 */
	slots: number[];
}

export const IH_EDGE_BOARDS: IhEdgeBoardSpec[] = [
	{
		ih: 1,
		label: "IH01",
		corners: ["A", "B", "C", "D", "E", "F"],
		classes: ["a", "b", "c"],
		sides: [
			["A", "a"],
			["B", "b"],
			["C", "c"],
			["D", "a"],
			["E", "b"],
			["F", "c"],
		],
		slots: [2, 2, 2],
	},
	{
		ih: 2,
		label: "IH02",
		// NOT alphabetical, and that is the whole difficulty of this board. IH01 has ONE aspect, so every
		// tile is met the same way round and the corpus states `corner -> class leaving it` outright.
		// IH02 has TWO — the tiling contains reflected copies — so a corner met on a reflected tile is
		// followed by the class ENTERING it instead, and the corpus gives corners B and F two classes
		// each. That narrows the labelling to eight candidates and no further. What picks this one is
		// geometry: at a parameter point where the six angles differ, it is the only candidate whose two
		// vertex triples both close to 360° AND whose records develop. See edge-board.test.ts.
		corners: ["F", "A", "B", "C", "D", "E"],
		classes: ["a", "b", "c"],
		sides: [
			["F", "a"],
			["A", "a"],
			["B", "b"],
			["C", "c"],
			["D", "c"],
			["E", "b"],
		],
		slots: [2, 2, 2],
	},
	{
		ih: 3,
		label: "IH03",
		// Two aspects again ("abacBc"), so the corner labelling was solved and not read —
		// `pnpm tsx scripts/solve-ih-board.ts 3 <corpus> <shards>` narrows 16 candidates to the 4 that
		// develop and then to this one, the only one whose letters run in boundary order.
		corners: ["A", "B", "C", "D", "E", "F"],
		classes: ["a", "b", "c"],
		sides: [
			["A", "a"],
			["B", "b"],
			["C", "a"],
			["D", "c"],
			["E", "b"],
			["F", "c"],
		],
		slots: [2, 2, 2],
	},
	{
		ih: 4,
		label: "IH04",
		// FIVE classes, and only `b` occurs twice — so a, c, d, e get ONE digon slot each and carry no
		// direction bit at all. Harmless because those four are Tactile's S edges, which are
		// point-symmetric and equal to their own reverse; `checkSlotsAreOpposite` asserts that pairing
		// rather than assuming it. Corner order solved by scripts/solve-ih-board.ts: of four candidates
		// only this one develops away from the defaults.
		corners: ["A", "B", "C", "D", "E", "F"],
		classes: ["a", "b", "c", "d", "e"],
		sides: [
			["A", "a"],
			["B", "b"],
			["C", "c"],
			["D", "d"],
			["E", "b"],
			["F", "e"],
		],
		slots: [1, 2, 1, 1, 1],
	},
	{
		ih: 5,
		label: "IH05",
		// FOUR aspects, the first board past two. Corner order solved by scripts/solve-ih-board.ts.
		// Classes `a` and `d` occur once each on the boundary, so they get one digon slot and no
		// direction bit; both are Tactile S edges, equal to their own reverse, so neither needs one —
		// the same arrangement IH04 has, and `checkSlotsAreOpposite` asserts it here too.
		corners: ["A", "B", "C", "D", "E", "F"],
		classes: ["a", "b", "c", "d"],
		sides: [
			["A", "a"],
			["B", "b"],
			["C", "c"],
			["D", "c"],
			["E", "b"],
			["F", "d"],
		],
		slots: [1, 2, 2, 1],
	},
	{
		ih: 6,
		label: "IH06",
		// Four aspects again, and `abcdbd` puts the single-slot classes at `a` and `c`, which are its two
		// S edges. ⚑ Solving this board is what caught the parameter point in scripts/solve-ih-board.ts:
		// IH06's boundary self-intersects at the first two points the script tried, and a tile whose
		// angles sum to 1080° instead of 720° fails the 360° vertex test for every labelling at once.
		corners: ["A", "B", "C", "D", "E", "F"],
		classes: ["a", "b", "c", "d"],
		sides: [
			["A", "a"],
			["B", "b"],
			["C", "c"],
			["D", "d"],
			["E", "b"],
			["F", "d"],
		],
		slots: [1, 2, 1, 2],
	},
	{
		ih: 7,
		label: "IH07",
		// THREE aspects, and the first board with ROTATION CENTRES. Its `aAbBcC` puts a 120° corner at
		// B, D and F, where three copies of the same corner meet; the corpus reports such a vertex either
		// whole (`BBB`, tagged F) or quotiented by the rotation (`B`, tagged C3), and a site tagged Cn
		// closes to 360/n. Reading every site as a full turn rejected both candidate labellings at once.
		corners: ["A", "B", "C", "D", "E", "F"],
		classes: ["a", "b", "c"],
		sides: [
			["A", "a"],
			["B", "a"],
			["C", "b"],
			["D", "b"],
			["E", "c"],
			["F", "c"],
		],
		slots: [2, 2, 2],
	},
	{
		ih: 8,
		label: "IH08",
		// ⚑ THE FIRST BOARD WHOSE CORNER LETTERS REPEAT, so `corners` is no longer six distinct names.
		// `abcabc` repeats with period three, its six corners fall into three classes, and the corpus
		// knows only A, B and C. Opposite corners carry equal angles, so reading a letter's angle off its
		// first occurrence is exact and not an approximation. One aspect, three S edges — and the only
		// board so far with ODD k, because its bare tiling has a single vertex orbit.
		corners: ["A", "B", "C", "A", "B", "C"],
		classes: ["a", "b", "c"],
		sides: [
			["A", "a"],
			["B", "b"],
			["C", "c"],
			["A", "a"],
			["B", "b"],
			["C", "c"],
		],
		slots: [1, 1, 1],
	},
	{
		ih: 9,
		label: "IH09",
		// Repeating corner letters again (`abbabb` at period three) and only TWO edge classes, the fewest
		// on the shelf: `a` is the S edge, occurring twice with a single slot, `b` the J edge, occurring
		// four times with two.
		corners: ["A", "B", "C", "A", "B", "C"],
		classes: ["a", "b"],
		sides: [
			["A", "a"],
			["B", "b"],
			["C", "b"],
			["A", "a"],
			["B", "b"],
			["C", "b"],
		],
		slots: [1, 2],
	},
	{
		ih: 10,
		label: "IH10",
		// ⚑ ZERO PARAMETERS. Tactile hands back one fixed tile for this type, the regular hexagon, so the
		// shelf has no sliders to offer beyond curvature and the board solver has no generic point to test
		// at. Nothing needed solving: one corner letter, one edge class, one surviving labelling. Its
		// corpus is also the first with MIRROR site tags (`Aa`, `Ac`, `D6a`) alongside rotation centres.
		corners: ["A", "A", "A", "A", "A", "A"],
		classes: ["a"],
		sides: [
			["A", "a"],
			["A", "a"],
			["A", "a"],
			["A", "a"],
			["A", "a"],
			["A", "a"],
		],
		slots: [1],
	},
];

export const IH_EDGE_BOARD_BY_IH = new Map(IH_EDGE_BOARDS.map((b) => [b.ih, b]));

/**
 * A cubic edge curve in its own CHORD frame: the two interior control points as (t, s), where t runs
 * along the chord from start to end and s is the left-hand perpendicular, both in units of the chord's
 * length. `[t1, s1, t2, s2]`.
 *
 * Chord-local and not world coordinates, because the develop knows where an edge IS but not which tile
 * or which aspect put it there. Given any developed edge P → Q, the control points are
 * P + t·(Q−P) + s·perp(Q−P) — no matrix, no aspect, no case analysis.
 */
export type ChordCurve = readonly [number, number, number, number];

export interface SolvedIhBoard {
	spec: IhEdgeBoardSpec;
	/** Interior angle in RADIANS at each corner, indexed like `spec.corners`. */
	cornerAngles: number[];
	/** Length of each edge class, indexed like `spec.classes`. */
	classLengths: number[];
	/** The tile's corners in the plane, in `spec.corners` order. Straight chords: the CORNERS never move
	 *  when an edge bows, which is why curvature costs the develop and the period lattice nothing. */
	outline: { x: number; y: number }[];
	/** Per edge class, the curve traversed FORWARD; null when the class is straight here. Reverse it
	 *  with `reverseChordCurve` for a dart crossing the same edge the other way. */
	classCurves: (ChordCurve | null)[];
	/** True when at least one class bows — the shelf's cheap "is anything curved" test. */
	curved: boolean;
	/** Tactile's own translations of the BASE tiling. The decoration's lattice is a sublattice of this
	 *  one and is recovered from the walk, not from here. */
	t1: { x: number; y: number };
	t2: { x: number; y: number };
	/** Linear size of one base lattice cell — the natural unit for a zoom default. */
	period: number;
}

export type IhBoardError =
	| "unknown-type"
	| "build-failed"
	| "degenerate"
	| "tactile-mismatch"
	/** The board has a class that can be bowed but cannot say which way it is crossed. See below. */
	| "unbowable";
export type SolveIhResult =
	| { ok: true; board: SolvedIhBoard; error?: undefined }
	| { ok: false; board?: undefined; error: IhBoardError };

/** Interior angle at corner i of a simple polygon given counter-clockwise. */
function interiorAngle(pts: { x: number; y: number }[], i: number): number {
	const n = pts.length;
	const p = pts[i];
	const a = pts[(i - 1 + n) % n];
	const b = pts[(i + 1) % n];
	const ux = a.x - p.x;
	const uy = a.y - p.y;
	const vx = b.x - p.x;
	const vy = b.y - p.y;
	const dot = ux * vx + uy * vy;
	const cross = ux * vy - uy * vx;
	// atan2 of the turn from v to u; negated cross because the outline is counter-clockwise, so the
	// interior lies clockwise of v. Folded into (0, 2π) to admit reflex corners, which the non-convex
	// parameter regions of a type genuinely have.
	let ang = Math.atan2(-cross, dot);
	if (ang <= 0) ang += 2 * Math.PI;
	return ang;
}

/** Reverse a chord curve: the same physical arc, described from the other end. t mirrors about the
 *  midpoint, s flips because the left-hand side of P→Q is the right-hand side of Q→P, and the two
 *  control points swap because a cubic's control points are ordered along the curve. */
export function reverseChordCurve(c: ChordCurve): ChordCurve {
	return [1 - c[2], -c[3], 1 - c[0], -c[1]];
}

/**
 * The curve of each edge class, in chord-local coordinates, read off Tactile at this parameter point.
 *
 * Tactile gives each boundary edge a transform mapping the canonical edge (0,0)→(1,0) onto that edge's
 * chord, plus a `rev` flag saying the curve is traversed backwards there. `prototileOutline` applies
 * `rev` AFTER the transform, and this has to match it exactly or a bowed edge lands on the wrong side.
 *
 * The result is per CLASS, not per side, because a class occurs twice on the tile — once forward and
 * once reversed — and those two are the same arc seen from its two ends. Taking the forward occurrence
 * as canonical means one curve per class and `reverseChordCurve` for the other.
 */
function extractClassCurves(
	ih: number,
	params: number[],
	curves: EdgeCurves,
	corners: { x: number; y: number }[],
	nClasses: number,
): (ChordCurve | null)[] {
	const out: (ChordCurve | null)[] = new Array(nClasses).fill(null);
	const tiling = makeTiling(ih, params);
	let i = 0;
	for (const edge of tiling.shape()) {
		const side = i++;
		const curve = edge.shape === EdgeShape.I ? null : (curves[edge.id] ?? null);
		// Only the FORWARD occurrence defines the class; the reversed one is its mirror and would
		// overwrite it with the same information described backwards.
		if (!curve || edge.rev || out[edge.id]) continue;
		const from = corners[side];
		const to = corners[(side + 1) % corners.length];
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const len2 = dx * dx + dy * dy;
		if (!(len2 > 0)) continue;
		// Into chord coordinates: t along the chord, s on its left, both scaled by the chord's length so
		// the numbers are dimensionless and survive any similarity the develop applies to this edge.
		const local = (p: { x: number; y: number }): [number, number] => {
			const ux = p.x - from.x;
			const uy = p.y - from.y;
			return [(ux * dx + uy * dy) / len2, (uy * dx - ux * dy) / len2];
		};
		const a = local(mul(edge.T, { x: curve.a.x, y: curve.a.y }));
		const b = local(mul(edge.T, { x: curve.b.x, y: curve.b.y }));
		out[edge.id] = [a[0], a[1], b[0], b[1]];
	}
	// A curve within a whisker of its chord is straight: drawing it as a cubic costs the renderer three
	// extra numbers per edge and buys a line.
	return out.map((c) => (c && (Math.abs(c[1]) > 1e-6 || Math.abs(c[3]) > 1e-6) ? c : null));
}

/** Tactile's edge ids around the tile must be the board's classes in order, each class appearing as
 *  many times as the board says. Cheap, and it is the only thing standing between a Tactile version
 *  bump and a silently mislabelled shelf. */
export function checkBoardAgreesWithTactile(
	spec: IhEdgeBoardSpec,
	edgeIds: number[],
): boolean {
	if (edgeIds.length !== spec.sides.length) return false;
	for (let i = 0; i < edgeIds.length; i++) {
		if (spec.classes[edgeIds[i]] !== spec.sides[i][1]) return false;
	}
	return true;
}

/**
 * The tile at a parameter point.
 *
 * `params` is Tactile's own parameter vector for the type (length `numParameters()`), so the shelf's
 * sliders are the type's real degrees of freedom and not a reparameterisation invented here. `curves`
 * defaults to straight edges: an edge system marks which EDGES are drawn, and a curved edge would make
 * the drawn/undrawn distinction harder to read, so curvature is opt-in.
 */
export function solveIhBoard(ih: number, params?: number[], curves?: EdgeCurves): SolveIhResult {
	const spec = IH_EDGE_BOARD_BY_IH.get(ih);
	const info = ISOHEDRAL_TYPES.find((t) => t.ih === ih);
	if (!spec || !info) return { ok: false, error: "unknown-type" };
	const cell = buildCell({
		ih,
		params: params ?? info.defaultParams,
		curves: curves ?? straightCurves(info.edgeShapes),
		periods: 4,
	});
	if (!cell?.tilingVertices) return { ok: false, error: "build-failed" };
	if (cell.degenerate) return { ok: false, error: "degenerate" };
	if (!checkBoardAgreesWithTactile(spec, cell.edges.map((e) => e.id))) {
		return { ok: false, error: "tactile-mismatch" };
	}

	const outline = cell.tilingVertices.map((p) => ({ x: p.x, y: p.y }));
	const cornerAngles = outline.map((_, i) => interiorAngle(outline, i));
	const classLengths = spec.classes.map(() => 0);
	for (let i = 0; i < spec.sides.length; i++) {
		const j = spec.classes.indexOf(spec.sides[i][1]);
		const p = outline[i];
		const q = outline[(i + 1) % outline.length];
		classLengths[j] = Math.hypot(q.x - p.x, q.y - p.y);
	}
	if (classLengths.some((L) => !(L > 1e-9))) return { ok: false, error: "degenerate" };

	const classCurves = curves
		? extractClassCurves(ih, params ?? info.defaultParams, curves, outline, spec.classes.length)
		: spec.classes.map(() => null);

	return {
		ok: true,
		board: {
			spec,
			cornerAngles,
			classLengths,
			outline,
			classCurves,
			curved: classCurves.some((c) => c !== null),
			t1: { x: cell.t1.x, y: cell.t1.y },
			t2: { x: cell.t2.x, y: cell.t2.y },
			period: cell.period,
		},
	};
}

/**
 * The board at the shelf's live controls: the type, its parameter vector and its per-class bulges.
 *
 * One place that turns the two store fields into a board, because five callers need exactly the same
 * answer — flat canvas, thumbnail, controls readout, conformal lens, tests — and each doing its own
 * length check would be five chances to hand Tactile a vector belonging to a different type. A vector
 * of the wrong length is DROPPED for the type's own defaults, not padded: padding would silently draw a
 * tile nobody asked for.
 */
export function solveIhBoardFor(
	ih: number,
	params: number[] | null | undefined,
	bulge: number[] | null | undefined,
): SolveIhResult {
	const info = ISOHEDRAL_TYPES.find((t) => t.ih === ih);
	if (!info) return { ok: false, error: "unknown-type" };
	const p = params?.length === info.numParams ? params : undefined;
	const b = bulge?.length === info.numEdgeShapes ? bulge : undefined;
	const curves =
		b && b.some((v) => Math.abs(v) > 1e-6)
			? curvesOf(defaultEdgeStates(info.edgeShapes).map((s, i) => ({ ...s, amount: b[i] })))
			: undefined;
	// ⚑ Refuse a bulge the board cannot orient. A class with ONE digon slot carries no direction bit, so
	// bowing it is only safe when the bow is its own reverse — an S edge. That held on every board up to
	// IH09 and fails on IH10, whose single J class is used six times and still gets one slot. Drawing it
	// anyway would mirror the bow on half the edges, which is a plausible-looking lie, so this says no
	// and lets the shelf show the reason.
	const spec = IH_EDGE_BOARD_BY_IH.get(ih);
	if (curves && spec) {
		for (let i = 0; i < spec.classes.length; i++) {
			if (spec.slots[i] !== 1) continue;
			if (info.edgeShapes[i] === "S" || info.edgeShapes[i] === "I") continue;
			return { ok: false, error: "unbowable" };
		}
	}
	return solveIhBoard(ih, p, curves);
}

/** Interior angle in radians for a certificate letter: "A6"…"F6" a corner, any digon a zero-angle slot. */
export function ihLetterAngle(letter: string, board: SolvedIhBoard): number {
	const i = board.spec.corners.indexOf(letter[0]);
	if (i < 0) return Number.NaN;
	return /^[A-Z]1[0-3]$/.test(letter) ? 0 : board.cornerAngles[i];
}

/** Edge-class length for a certificate digon letter: "B12" → the b length. */
export function ihLetterLength(letter: string, board: SolvedIhBoard): number {
	const j = board.spec.classes.indexOf(letter[0].toLowerCase());
	return j < 0 ? Number.NaN : board.classLengths[j];
}

/**
 * Which of a class's two digon slots this letter is: 10 and 12 are slot 0, 11 and 13 are slot 1.
 *
 * MEASURED, not decreed: the two darts of every glued edge carry one slot-0 letter and one slot-1
 * letter of the same class, across the corpus, so the slot says which END of the edge the dart sits at
 * — which is exactly the direction the edge is being crossed. That is the bit a bowed edge needs, and
 * the reason curvature works at all without tracking which tile or which aspect placed the edge.
 */
export const ihLetterSlot = (letter: string): 0 | 1 =>
	letter.charCodeAt(letter.length - 1) % 2 === 0 ? 0 : 1;

/**
 * The curve a dart crosses, oriented along that dart's own direction of travel.
 *
 * Slot 0 is taken as the class's forward sense. Which of the two slots Marek's encoder calls first is
 * his convention and not derivable from the letters, so it is CHECKED instead: `checkCurveOrientation`
 * in edgePatch.ts folds a tile and asserts the six sides come out as three forward then three reversed,
 * which is the boundary word "abcABC" and fails loudly if the sense is inverted.
 */
export function ihLetterCurve(letter: string, board: SolvedIhBoard): ChordCurve | null {
	const j = board.spec.classes.indexOf(letter[0].toLowerCase());
	if (j < 0) return null;
	const c = board.classCurves[j];
	if (!c) return null;
	return ihLetterSlot(letter) === 0 ? c : reverseChordCurve(c);
}
