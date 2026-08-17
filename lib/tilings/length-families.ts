// PARAMETRIC EDGE LENGTHS — Euclidean tilings that are a FAMILY over their edge lengths (2026-08-17).
//
// AL's observation, and it is correct: nothing in the STS search ever knew how long an edge was.
// `enum_configs` closes a vertex on an ANGLE sum, and the half-edge gluing only ever asserts that two
// edges are the SAME type, i.e. that their lengths are equal — never what those lengths are. A number
// is first attached in the developer (`develop_tri45.surd_offsets`: 'S' is the unit edge, 'H' the
// sqrt2). Leaving the length symbolic instead costs the search nothing and turns a tiling into a
// family, with one slider per independent edge type.
//
// Why this is the EASY half of machinery the Atlas already ships: an angle parameter enters a vertex
// position as e^{i·δ}, which is why `paramCell.cellPolygons` are Laurent polynomials in ℤ[ζ₂₄]. A
// LENGTH enters linearly — a vertex is Σ_j ℓ_j·d_j with the directions d_j pinned by the angles — so a
// coordinate is a dot product and the validity region is a box.
//
// What decides whether a family is worth having is whether it is affinely trivial. The rectangle grid
// is the square grid under a diagonal map, so it is a slider demo and nothing more, and it is labelled
// that way. The two-square (Pythagorean) tiling is not: no single affine map can send both square
// sizes to one, which is why its ratio is a real parameter and not a change of basis.

import { evaluateParamCell, type ParametricCellData, type LenTerm } from "@/lib/utils/paramCell";
import { vertexOrbits } from "@/lib/tilings/vertex-orbits";
import { ENUMERATED_FAMILIES, ENUMERATION_SCOPE } from "@/lib/tilings/enumerated-families.generated";

/** A length slider: `name` is what the panel prints, the range is the OPEN interval it may take. */
function lenParam(name: string, def: number, lo: number, hi: number): ParametricCellData["params"][number] {
	return {
		name,
		kind: "length",
		alpha0Deg: def,
		deltaRangeDeg: [lo - def, hi - def],
		alphaRangeDegOpen: [lo, hi],
		defaultAlphaDeg: def,
	};
}

/** Evaluate a length-linear coordinate at the family's default lengths — the anchor cell. */
function atDefaults(terms: LenTerm[], def: number[]): [number, number] {
	let x = 0, y = 0;
	for (const [j, re, im] of terms) {
		const l = j < 0 ? 1 : def[j];
		x += l * re;
		y += l * im;
	}
	return [x, y];
}

/** Build the ParametricCellData, filling the constant-term anchor so a consumer that ignores
 *  `lengths` still renders the default member instead of nothing (the contract `intrinsic` set). */
function lengthFamily(
	params: ParametricCellData["params"],
	cellPolygons: { n: number; vertices: LenTerm[][] }[],
	basis: [LenTerm[], LenTerm[]],
	sizeHue = true,
): ParametricCellData {
	const def = params.map((p) => p.defaultAlphaDeg);
	return {
		params,
		lengths: { cellPolygons, basis, sizeHue },
		// anchor: the same geometry frozen at the defaults, as degree-0 terms
		cellPolygons: cellPolygons.map((p) => ({
			n: p.n,
			vertices: p.vertices.map((t) => {
				const [x, y] = atDefaults(t, def);
				return [[0, x, y]] as [number, number, number][];
			}),
		})),
		basis: basis.map((t) => {
			const [x, y] = atDefaults(t, def);
			return [[0, x, y]] as [number, number, number][];
		}) as ParametricCellData["basis"],
	};
}

const A = 0, B = 1;
const O: LenTerm[] = [];
const a: LenTerm[] = [[A, 1, 0]];        // A to the right
const b: LenTerm[] = [[B, 0, 1]];        // B upwards
const add = (...ts: LenTerm[][]): LenTerm[] => ts.flat();

/** The A×B rectangle grid. Affinely the square grid — a slider smoke test, not a new tiling. */
export const RECT_GRID: ParametricCellData = lengthFamily(
	[lenParam("A", 1, 0.1, 3), lenParam("B", 1, 0.1, 3)],
	[{ n: 4, vertices: [O, a, add(a, b), b] }],
	[a, b],
);

// The two-square (Pythagorean) tiling: squares of side A and side B, one of each per period, with
// lattice (A, B) and (−B, A). |det| = A² + B², which is exactly the two squares' area — the check the
// test then makes good on by sampling. Non-edge-to-edge: a big square's side is met by one small
// square's side and the remainder, which is precisely the case the SPHERICAL scaled work could not
// express, because there the two sub-pieces were forced equal.
const A2: LenTerm[] = [[A, 1, 0]];
const B2: LenTerm[] = [[B, 1, 0]];
const Ay: LenTerm[] = [[A, 0, 1]];
const By: LenTerm[] = [[B, 0, 1]];

export const PYTHAGOREAN: ParametricCellData = lengthFamily(
	[// NOT "large"/"small": the sliders are independent, so B may exceed A and the labels would lie.
		lenParam("A", 1, 0.1, 3), lenParam("B", 0.55, 0.1, 3)],
	[
		{ n: 4, vertices: [O, A2, add(A2, Ay), Ay] },                          // the A-square at the origin
		{ n: 4, vertices: [A2, add(A2, B2), add(A2, B2, By), add(A2, By)] },   // the B-square beside it
	],
	[add(A2, By), [[B, -1, 0], [A, 0, 1]]],                                    // T1 = (A, B), T2 = (−B, A)
);


// ── EQUIANGULAR TILES ────────────────────────────────────────────────────────────────────────────
// The tile kind the finiteness argument is built on: a fixed ANGLE WORD on the 2*pi/D grid with a
// symbolic length per side. Closure — the edge vectors summing to zero — is 2 real equations that are
// LINEAR in the lengths, so the realizable assignments form a convex cone and the family is that cone
// modulo scale.
//
// The equiangular hexagon is the first case where this pays. Its six directions turn 60 deg each, so
// d_k + d_(k+3) = 0 and the closure Σ ℓ_k·d_k = 0 holds IDENTICALLY once opposite sides are equal:
// every (a, b, c) > 0 is realizable, a 3-parameter cone, 2 after scale. n = 3 by contrast gives 0 free
// parameters (equilateral triangles are rigid), which is why free lengths do nothing for the
// triangular grid, and n = 4 gives 1 — the rectangle's aspect ratio.
const S3 = Math.sqrt(3) / 2;
const C = 2;
const h0: LenTerm[] = [[A, 1, 0]];          // a·d0
const h1: LenTerm[] = [[B, 0.5, S3]];       // b·d1
const h2: LenTerm[] = [[C, -0.5, S3]];      // c·d2

export const EQUIANGULAR_HEX: ParametricCellData = lengthFamily(
	[lenParam("A", 1, 0.1, 3), lenParam("B", 1, 0.1, 3), lenParam("C", 1, 0.1, 3)],
	[{ n: 6, vertices: [O, h0, add(h0, h1), add(h0, h1, h2), add(h1, h2), h2] }],
	[add(h0, h1), add(h1, h2)],
);

// ── SLIDING STRIPS — the construction that makes this space uncountable ──────────────────────────
//
// Corrected 2026-08-17 after AL pushed back, and he was right. I had enumerated equiangular VERTEX
// configurations, got 14, found only three carrying a T-junction (3.6.T, 4.4.T, 3.3.3.T), and reported
// that as the size of the space. The vertex alphabet being small bounds nothing: each of those types
// generates a CONTINUOUS family, and the families compose.
//
// The mechanism: a strip of regular polygons bounded above and below by two parallel straight lines
// can be slid along its own axis by any real amount and still meet its neighbours, because a straight
// boundary line has no features to align to. Every interface is therefore one free real parameter, and
// stacking strips in any order gives one family per binary word. Wikipedia's table of "periodic
// isogonal tilings by non-edge-to-edge convex regular polygons" lists seven families with a real
// parameter; entries 1-3 (rows of squares with horizontal offsets, cmm and p2; rows of triangles with
// horizontal offsets, cmm) are the words S and T of exactly this construction. The remaining four are
// NOT of this kind and are not built here: the Pythagorean tiling is (below, by hand), while families
// 5-7 (three hexagons around each triangle, six triangles around every hexagon, three size triangles)
// are gyrations, whose vertices move as cos/sin of a rotation and so are not linear in any length.
//
// Only two strips exist over {3, 4} at unit edge: a row of squares (height 1) and a row of alternating
// triangles (height sqrt3/2). Both have horizontal period 1, which is what lets any word stack. A row
// of hexagons has a zigzag boundary and cannot slide, which is the precise sense in which "hexagons are
// fixed and unable to slide" while squares and triangles are not.
//
// Parameters: one shift per interface, d_1..d_m for a word of length m, where d_m is the shift onto the
// next period. None is removable. A shear WOULD remove one, but a shear is not available here: it turns
// the squares into rhombi and the triangles into scalene ones, leaving the class of regular polygons.
// That is also why RECT_GRID below is marked affinely trivial and these are not.

const H_TRI = Math.sqrt(3) / 2;
const KONST = -1; // the constant-term index, see LenTerm

// A strip's local geometry. `y` is a term list rather than a number because a RECTANGLE strip's height
// is a slider, so a vertex above it sits at a height that is itself a parameter.
interface Strip {
	kind: "S" | "T" | "R";
	/** Height as terms; `hp` is the index of this strip's own height parameter, or -1 if rigid. */
	height: (hp: number) => LenTerm[];
	polys: { n: number; v: [x: number, y: (hp: number) => LenTerm[]][] }[];
}

const ZERO = (): LenTerm[] => [];
const FLOOR1 = (): LenTerm[] => [[KONST, 0, 1]];
const FLOOR_T = (): LenTerm[] => [[KONST, 0, H_TRI]];
const OWN = (hp: number): LenTerm[] => [[hp, 0, 1]];

const STRIP_S: Strip = {
	kind: "S",
	height: FLOOR1,
	polys: [{ n: 4, v: [[0, ZERO], [1, ZERO], [1, FLOOR1], [0, FLOOR1]] }],
};

const STRIP_T: Strip = {
	kind: "T",
	height: FLOOR_T,
	// One up-triangle and one down-triangle: together the parallelogram spanned by (1,0) and (1/2, h),
	// so the pair tiles the strip under the unit horizontal translation.
	polys: [
		{ n: 3, v: [[0, ZERO], [1, ZERO], [0.5, FLOOR_T]] },
		{ n: 3, v: [[1, ZERO], [1.5, FLOOR_T], [0.5, FLOOR_T]] },
	],
};

/** A row of 1 x h rectangles. Width stays 1 so the strip still stacks against the others; the HEIGHT
 *  is a free edge length, which is what makes a stack containing one carry real length parameters
 *  instead of only shifts. A rectangle is an equiangular quadrilateral, so this is the same tile kind
 *  the closure argument is built on — it is simply not a regular polygon, and the shelf says so. */
const STRIP_R: Strip = {
	kind: "R",
	height: OWN,
	polys: [{ n: 4, v: [[0, ZERO], [1, ZERO], [1, OWN], [0, OWN]] }],
};

const STRIPS: Record<string, Strip> = { S: STRIP_S, T: STRIP_T, R: STRIP_R };

// Generic defaults, deliberately not 1/2. At 1/2 the extra symmetries that appear on measure-zero
// subsets of the box collapse vertex orbits, so a family filed under its generic k would draw a
// thumbnail with a smaller one. These values agree with what the shelf claims.
const SHIFT_DEFAULTS = [0.37, 0.61, 0.23, 0.79];
const HEIGHT_DEFAULTS = [0.62, 1.35, 0.88];

/** Build the family for one stacking word over {S, T, R}: heights first, then one shift per interface. */
export function stripFamily(word: string): ParametricCellData {
	const strips = [...word].map((c) => STRIPS[c]);
	const m = strips.length;
	// Parameter layout: every R strip's height, in strip order, then the m interface shifts.
	const heightIdx = strips.map((s) => (s.kind === "R" ? 1 : 0));
	const nH = heightIdx.reduce((a, b) => a + b, 0);
	let seen = -1;
	const hp = strips.map((s) => (s.kind === "R" ? ++seen : -1));

	// d_k is the shift ACROSS interface k. Strip k sits at cumulative shift s_k = d_1 + ... + d_k, so
	// s_0 = 0 and the next period's floor is at s_m — the lattice vector's horizontal part.
	const shiftTerms = (k: number): LenTerm[] =>
		Array.from({ length: k }, (_, j) => [nH + j, 1, 0] as LenTerm);

	const cellPolygons: { n: number; vertices: LenTerm[][] }[] = [];
	let yBase: LenTerm[] = [];
	for (let k = 0; k < m; k++) {
		const s = shiftTerms(k);
		for (const poly of strips[k].polys)
			cellPolygons.push({
				n: poly.n,
				vertices: poly.v.map(([px, yLocal]) => [
					[KONST, px, 0] as LenTerm, ...s, ...yBase, ...yLocal(hp[k]),
				]),
			});
		yBase = [...yBase, ...strips[k].height(hp[k])];
	}

	const params = [
		...strips.flatMap((s, k) =>
			s.kind === "R"
				? [lenParam(nH === 1 ? "Height" : `Height ${hp[k] + 1}`, HEIGHT_DEFAULTS[hp[k] % 3], 0.15, 3)]
				: []),
		...Array.from({ length: m }, (_, k) =>
			// The range is a full period; past it the pattern repeats, because a whole-period shift IS
			// the lattice vector (1, 0).
			lenParam(m === 1 ? "Shift" : `Shift ${k + 1}`, SHIFT_DEFAULTS[k % 4], 0, 1)),
	];

	const basis: [LenTerm[], LenTerm[]] = [[[KONST, 1, 0]], [...shiftTerms(m), ...yBase]];
	// The size ramp earns its place only where sizes actually differ: a pure S/T stack is entirely
	// unit-edged, so a size hue would paint squares and triangles identically and hide the one
	// distinction worth seeing. A stack with an R strip does vary, so it keeps it.
	return lengthFamily(params, cellPolygons, basis, nH > 0);
}

/** Words over `alphabet` up to cyclic rotation (which strip you call first) and reversal (flipping). */
function stripWords(alphabet: string, minLen: number, maxLen: number): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	const grow = (w: string) => {
		if (w.length >= minLen) {
			const variants: string[] = [];
			for (const s of [w, [...w].reverse().join("")])
				for (let r = 0; r < w.length; r++) variants.push(s.slice(r) + s.slice(0, r));
			const canon = variants.sort()[0];
			if (!seen.has(canon)) { seen.add(canon); out.push(canon); }
		}
		if (w.length === maxLen) return;
		for (const c of alphabet) grow(w + c);
	};
	grow("");
	return out;
}

const STRIP_NAME: Record<string, string> = { S: "squares", T: "triangles", R: "rectangles" };
const names = (w: string, join: string) => [...w].map((c) => STRIP_NAME[c]).join(join);

function stripRow(w: string, note: string): LengthFamilyRow {
	const cell = stripFamily(w);
	return {
		id: `plen-strip-${w.toLowerCase()}`,
		label: `Sliding rows: ${names(w, ", ")}`,
		affineTrivial: false,
		note,
		discoverer: "classical",
		cell,
		// k is a property of a POINT in the box, not of the family. Reported at the defaults, which are
		// chosen generic precisely so this number is the one you see almost everywhere in the box.
		k: vertexOrbits(evaluateParamCell(cell, cell.params.map((p) => p.defaultAlphaDeg))).k,
	};
}

/** Stacks of square and triangle rows, up to four deep. Every tile is unit-edged: these are the
 *  T-junction families of the classical regular-polygon literature, words S and T reproducing
 *  Wikipedia's non-edge-to-edge families 1-2 and 3. */
export const STRIP_FAMILIES: LengthFamilyRow[] = stripWords("ST", 1, 4).map((w) =>
	stripRow(
		w,
		`Strips stacked ${names(w, " then ")}, repeating. Each of the ${w.length} interface` +
		`${w.length > 1 ? "s is" : " is"} bounded by a straight line on both sides, so the strip above it slides ` +
		`by any real amount and the tiling survives — one free parameter per interface, none removable by a ` +
		`similarity (a shear would remove one but turns the squares into rhombi and the triangles scalene, ` +
		`leaving the class). Every vertex on an interface is a T-junction: ` +
		`${w.includes("S") ? "90 + 90 + 180 where two squares meet a straight edge" : "60 + 60 + 60 + 180 where three triangles do"}. ` +
		`ALL EDGES ARE LENGTH 1 here — the sliders move strips, they do not resize tiles. The k quoted is the ` +
		`GENERIC one, measured by computing the symmetry group at the default sliders; special settings ` +
		`(all shifts equal, or all zero) gain extra symmetry and collapse orbits, so k drops there.`,
	));

/** Stacks that include a RECTANGLE row, whose height is a genuine edge-length slider. This is where
 *  the length machinery is actually exercised: a pure square/triangle stack has every edge at 1, so
 *  its sliders only ever translate strips. A rectangle is an equiangular quadrilateral — the tile kind
 *  the closure argument is built on — so its two edge lengths are independent and one of them is free
 *  against the rigid unit triangles it is stacked with. */
export const STACK_FAMILIES: LengthFamilyRow[] = stripWords("RT", 2, 3)
	.filter((w) => w.includes("R"))
	.map((w) =>
		stripRow(
			w,
			`Strips stacked ${names(w, " then ")}, repeating, with ${[...w].filter((c) => c === "R").length} ` +
			`independent height slider${[...w].filter((c) => c === "R").length > 1 ? "s" : ""} and ${w.length} shift ` +
			`sliders. Unlike the all-unit square/triangle stacks, the edge lengths here are NOT all 1: each ` +
			`rectangle row is 1 wide and h tall with h free, so the tiling carries real length parameters as well ` +
			`as offsets. ${w.includes("T") ? "The triangles stay rigid at unit edge — an equilateral triangle has no length freedom, which is what makes the rectangle-to-triangle height ratio a genuine parameter and not a change of scale. " : "Only the ratio of the heights is essential; scaling them together is a change of scale. "}` +
			`The k quoted is measured at the default sliders and is the generic value.`,
		));

// ── THE SHUTTER: unit triangles and a hexagon that opens ────────────────────────────────────────
//
// AL's construction, 2026-08-18, and it closes a gap I had argued was closed for the wrong reason.
// Take the triangular grid and open a regular hexagon at every third vertex, like a camera shutter;
// the triangles stay rigid at unit edge and the hexagon side g is the parameter. This is Wikipedia's
// non-edge-to-edge family 6, "six triangles surround every hexagon", p6.
//
// I had written this family off as a gyration — vertices moving as cos/sin of a rotation angle, and so
// outside a format that is linear in lengths. That was a parameterisation mistake, not a fact. Drive it
// by the HEXAGON SIDE instead of by the rotation angle and every coordinate is affine-linear in g.
//
// Derivation. Hexagon H at the origin, side g, vertices v_k = g*(cos 60k, sin 60k). Each of its sides
// is the first g of a unit triangle's side: triangle T_0 has vertices v_0, v_0 + u, v_0 + R(-60)u with
// u the unit vector along v_0 -> v_1, so v_1 lies ON the side [v_0, v_0+u] at distance g, and the
// remaining 1-g of that side abuts another triangle. Every triangle side splits the same way by the
// triangle's own 3-fold symmetry: g against a hexagon, 1-g against a triangle. Per period that is one
// hexagon, two triangles, six hexagon-triangle edges and three triangle-triangle edges — nine edges,
// six vertices, all of type 3.6.T (60 + 120 + 180). Faces are topological hexagons (a triangle has 3
// corners plus 3 T-junctions), which is why the family is topologically the hexagonal tiling.
//
// Closure. Following the splits round, the neighbouring hexagon centres come out at
//     C1 = g*(3/2, sqrt3/2) + (-1/2, sqrt3/2)      C2 = g*(3/2, -sqrt3/2) + (1/2, sqrt3/2)
// with |C1|^2 = |C2|^2 = 3g^2 + 1 and C1.C2 = (3g^2 + 1)/2, so cos = 1/2 EXACTLY, for every g. The
// centres form a triangular lattice at every parameter value — the family never has to be checked for
// closure, it closes identically, like the equiangular hexagon does. Cell area confirms it:
// (3sqrt3/2)g^2 + 2*(sqrt3/4) = (sqrt3/2)(3g^2 + 1) = |C1 x C2|.
//
// The two ends are the ones AL described: g -> 0 shuts the aperture and gives the triangular tiling,
// g = 1 opens it until the 1-g remainders vanish and gives the trihexagonal tiling 3.6.3.6. Everything
// strictly between is non-edge-to-edge, and this is the first family here with two DIFFERENT regular
// polygons whose size ratio is the slider — the triangle-hexagon analogue of the Pythagorean tiling.
const G = 0;
const gv = (k: number): LenTerm[] => [[G, Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3)]];
const kv = (x: number, y: number): LenTerm[] => [[KONST, x, y]];

export const TRI_HEX_SHUTTER: ParametricCellData = lengthFamily(
	[lenParam("Hexagon", 0.5, 0.08, 1)],
	[
		{ n: 6, vertices: [gv(0), gv(1), gv(2), gv(3), gv(4), gv(5)] },
		// T_0 on the hexagon side [v_0, v_1]
		{ n: 3, vertices: [gv(0), add(gv(0), kv(-0.5, H_TRI)), add(gv(0), kv(0.5, H_TRI))] },
		// T_1 = T_0 turned 60 deg. T_0 and T_1 are the two lattice classes; T_2..T_5 repeat them.
		{ n: 3, vertices: [gv(1), add(gv(1), kv(-1, 0)), add(gv(1), kv(-0.5, H_TRI))] },
	],
	[add(gv(0), gv(1), kv(-0.5, H_TRI)), add(gv(0), gv(5), kv(0.5, H_TRI))],
);

// ── THE ROTOR: hexagons with triangles between them (Wikipedia family 5) ────────────────────────
//
// The DUAL of the shutter, and it falls out the same way. The shutter opens hexagonal gaps between
// rigid triangles; this opens TRIANGULAR gaps between rigid hexagons. "Three hexagons surround each
// triangle", p6, topologically the truncated hexagonal tiling — meaning the HEXAGON is the subdivided
// face this time (6 corners plus 6 T-junctions = 12 topological corners) and the triangles are plain,
// exactly the other way round from the shutter.
//
// Hexagon side 1, vertices w_k = omega^k on the unit circle (omega = e^{i*60}); triangle side t. Each
// hexagon side splits into t against a triangle and 1-t against another hexagon. The triangle at corner
// w_k is [w_k, w_k + t*omega^{k+2}, w_k + t*omega^{k+1}]: its first side runs along the hexagon's edge
// (so w_k + t*omega^{k+2} is the split point, ON that edge) and its second along the NEIGHBOURING
// hexagon's edge, which passes straight through w_k — that flat is what makes the vertex 3.6.T.
//
// Closure. Matching the 1-t pieces hexagon-to-hexagon forces the neighbour's centre to
//     L_0 = (1 + omega) + t*(omega - 1)        L_1 = omega * L_0
// and since L_1 is literally omega*L_0, the centres are a triangular lattice for every t with no
// condition to check. |L_0|^2 = 3 + t^2, so the cell area is (sqrt3/2)(3 + t^2) = one hexagon
// (3sqrt3/2) plus two triangles of side t ((sqrt3/2)t^2). Exact at every t.
//
// t -> 0 closes the gaps to the regular hexagonal tiling; t = 1 opens them until the hexagon-hexagon
// contacts vanish, giving the trihexagonal tiling 3.6.3.6 again. So the shutter runs triangular ->
// trihexagonal and the rotor runs hexagonal -> trihexagonal, meeting at the same place.
const T5 = 0;
const wv = (k: number): LenTerm[] => kv(Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3));
const tw = (k: number): LenTerm[] => [[T5, Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3)]];

export const HEX_ROTOR: ParametricCellData = lengthFamily(
	[lenParam("Triangle", 0.5, 0.05, 1)],
	[
		{ n: 6, vertices: [wv(0), wv(1), wv(2), wv(3), wv(4), wv(5)] },
		{ n: 3, vertices: [wv(0), add(wv(0), tw(2)), add(wv(0), tw(1))] },
		{ n: 3, vertices: [wv(1), add(wv(1), tw(3)), add(wv(1), tw(2))] },
	],
	[add(kv(1.5, H_TRI), [[T5, -0.5, H_TRI]]), add(kv(0, Math.sqrt(3)), [[T5, -1, 0]])],
);

// ── THREE SIZE TRIANGLES (Wikipedia family 7) ───────────────────────────────────────────────────
//
// p3, topologically the trihexagonal tiling: 4-valent vertices, faces alternating topological triangles
// and topological hexagons. Here EVERY face is an equilateral triangle, and the "hexagon" is a big one
// with all three sides subdivided (3 corners + 3 T-junctions = 6). Every vertex is 3.3.3.T — a flat
// from the big triangle's side plus one corner of each of the three sizes, which is the whole content
// of the name.
//
// Counting forces the shape before any geometry: 6 pieces from the big triangle's subdivided sides must
// match the 6 sides of the two small triangles, so each side of the big one splits into b + c with b
// and c the two small sides, and a = b + c. One free ratio after scale, one real parameter, as the
// literature says.
//
// Lattice. At the origin the big triangle has a corner, the b-triangle has a corner, and some other big
// triangle must supply the 180 flat; the only side-line of the right direction is [a, a*zeta], and the
// origin has to land on ITS split point, giving the translation -(a + b(zeta - 1)) = -(c + b*zeta). So
//     L1 = c + b*zeta        L2 = e^{i120} * L1 = (-b - c/2, (sqrt3/2)c)
// a triangular lattice by construction, with |L1|^2 = b^2 + bc + c^2. Cell area (sqrt3/2)(b^2+bc+c^2)
// equals (sqrt3/4)((b+c)^2 + b^2 + c^2), the three triangles, identically.
const Bp = 0, Cp = 1;

export const TRI_THREE_SIZE: ParametricCellData = lengthFamily(
	[lenParam("B", 1, 0.15, 3), lenParam("C", 0.6, 0.15, 3)],
	[
		// the big triangle, side B + C, pointing up
		{ n: 3, vertices: [[], [[Bp, 1, 0], [Cp, 1, 0]], [[Bp, 0.5, H_TRI], [Cp, 0.5, H_TRI]]] },
		// the B-triangle on [0, B], pointing down
		{ n: 3, vertices: [[], [[Bp, 1, 0]], [[Bp, 0.5, -H_TRI]]] },
		// the C-triangle on [B, B + C], pointing down
		{ n: 3, vertices: [[[Bp, 1, 0]], [[Bp, 1, 0], [Cp, 1, 0]], [[Bp, 1, 0], [Cp, 0.5, -H_TRI]]] },
	],
	[[[Cp, 1, 0], [Bp, 0.5, H_TRI]], [[Bp, -1, 0], [Cp, -0.5, H_TRI]]],
);

// ── ENUMERATED — found by search, not authored ──────────────────────────────────────────────────
//
// These come out of `scripts/enum-families.ts`, which runs the oracle-free search: a finite vertex
// alphabet over the palette's corner angles plus the flat 180, a finite sweep of torus maps with at
// most Vmax vertices per period, and a linear solve for the lengths. Nothing about them was written by
// hand, which is the point — at k = 1 the literature supplies seven families to check against, but at
// higher k there is no list, so the catalogue has to come from a search whose completeness is argued.
//
// Provenance is kept visible: `discoverer` says "enumerated", and where the search rediscovers a
// family that was built by hand the note says so. Three of the seven do, which is the check working.
const KNOWN: Record<string, string> = {
	"2-3-1-4": "the same family as plen-strip-s, the offset rows of squares (Wikipedia 1-2)",
	"2-4-2-3,3": "the same family as plen-strip-t, the offset rows of triangles (Wikipedia 3)",
	"3-6-3-3,3,3": "the same family as plen-tri-three-size (Wikipedia 7)",
};

export const ENUM_FAMILIES: LengthFamilyRow[] = ENUMERATED_FAMILIES.map((f) => {
	const terms = (v: [number, number][]): LenTerm[] => [[KONST, v[0][0], v[0][1]], [0, v[1][0], v[1][1]]];
	const cellPolygons = f.cellPolygons.map((p) => ({ n: p.n, vertices: p.v.map(terms) }));
	const basis: [LenTerm[], LenTerm[]] = [terms(f.basis[0]), terms(f.basis[1])];
	const cell = lengthFamily([lenParam("t", f.t0, f.range[0], f.range[1])], cellPolygons, basis, true);
	const known = KNOWN[`${f.V}-${f.E}-${f.F}-${f.tiles.join(",")}`];
	const flats = f.words.reduce((a, w) => a + [...w].filter((c) => c === "6").length, 0);
	return {
		id: f.id,
		label: `Enumerated: ${f.label}`,
		affineTrivial: false,
		discoverer: "enumerated",
		note:
			`Found by search, not authored. Map: V = ${f.V}, E = ${f.E}, F = ${f.F} per translational period, ` +
			`with ${flats} T-junction${flats === 1 ? "" : "s"}; face corner words ${f.words.join(", ")} in 30-degree ` +
			`units, where a 6 is the flat 180 of a subdivided side. The slider range (${f.range[0].toFixed(3)}, ` +
			`${f.range[1].toFixed(3)}) is EXACT: it is the interval on which every edge length stays positive, ` +
			`read off the closure system rather than chosen. ` +
			(known ? `The search rediscovered ${known}. ` : `Not among the families built by hand here. `) +
			`Search scope: regular polygons {${ENUMERATION_SCOPE.palette.join(", ")}}, at most ` +
			`${ENUMERATION_SCOPE.Vmax} vertices per period. Complete within that scope and silent outside it.`,
		cell,
		k: vertexOrbits(evaluateParamCell(cell, [f.t0])).k,
	};
});

export interface LengthFamilyRow {
	id: string;
	label: string;
	/** True when the family is an affine image of a fixed tiling, so the slider only stretches it. */
	affineTrivial: boolean;
	note: string;
	discoverer: string;
	cell: ParametricCellData;
	/** Vertex orbits at the family's DEFAULT sliders, measured by `vertexOrbits`. Omitted means 1. */
	k?: number;
}

export const LENGTH_FAMILIES: LengthFamilyRow[] = [
	{
		id: "plen-hex",
		label: "Equiangular hexagon",
		affineTrivial: false,
		note: "All six corners 120 deg, opposite sides equal, sides A, B, C free. Closure is automatic because opposite edge directions cancel, so every positive (A, B, C) tiles — a 3-parameter cone, 2 after scale. At A = B = C it is the regular hexagonal grid; away from it the tile is a genuinely different hexagon, not a stretched one, because an affine map cannot hold all six angles at 120 deg while changing the side ratios.",
		discoverer: "classical",
		cell: EQUIANGULAR_HEX,
	},
	{
		id: "plen-rect",
		label: "Rectangle grid",
		affineTrivial: true,
		note: "The square grid under a diagonal map. Both sliders only stretch it, which is why it is here as the machinery's smoke test and not as a tiling.",
		discoverer: "classical",
		cell: RECT_GRID,
	},
	{
		id: "plen-pythagorean",
		label: "Two-square (Pythagorean) tiling",
		affineTrivial: false,
		note: "Squares of two sizes, one of each per period, lattice (A, B) and (−B, A). No affine map sends both sizes to one, so the ratio is a genuine parameter. Non-edge-to-edge: a large square's side is met by a small square's side plus the remainder.",
		discoverer: "classical",
		cell: PYTHAGOREAN,
	},
	{
		id: "plen-tri-hex-shutter",
		label: "Shutter: triangles and an opening hexagon",
		affineTrivial: false,
		note: "Unit equilateral triangles with a regular hexagon of side g opened at every third vertex of the triangular grid, like a camera shutter. Six triangles surround every hexagon; each triangle side splits g against a hexagon and 1 - g against another triangle, and every vertex is 3.6.T (60 + 120 + 180). Closure is identical rather than conditional: the neighbouring hexagon centres satisfy |C1| = |C2| and cos(C1, C2) = 1/2 for EVERY g, so the centres form a triangular lattice throughout. g -> 0 shuts the aperture and returns the triangular tiling; g = 1 opens it to the trihexagonal tiling 3.6.3.6; everything between is non-edge-to-edge. Wikipedia's non-edge-to-edge family 6, p6.",
		discoverer: "classical",
		cell: TRI_HEX_SHUTTER,
		k: vertexOrbits(evaluateParamCell(TRI_HEX_SHUTTER, [0.5])).k,
	},
	{
		id: "plen-hex-rotor",
		label: "Rotor: hexagons with triangles between",
		affineTrivial: false,
		note: "Unit regular hexagons turned against each other, opening an equilateral triangle of side t at every three-hexagon meeting. The dual of the shutter: here the HEXAGON is the subdivided face (6 corners plus 6 T-junctions) and the triangles are plain. Each hexagon side splits t against a triangle and 1 - t against another hexagon; every vertex is 3.6.T. The neighbouring centres are L and omega*L for L = (1 + omega) + t(omega - 1), so they form a triangular lattice at every t with no condition to check, and the cell area (sqrt3/2)(3 + t^2) is one hexagon plus two triangles of side t exactly. t -> 0 gives the hexagonal tiling, t = 1 the trihexagonal tiling 3.6.3.6. Wikipedia's non-edge-to-edge family 5, p6.",
		discoverer: "classical",
		cell: HEX_ROTOR,
		k: vertexOrbits(evaluateParamCell(HEX_ROTOR, [0.5])).k,
	},
	{
		id: "plen-tri-three-size",
		label: "Three size triangles",
		affineTrivial: false,
		note: "Equilateral triangles in three sizes B, C and B + C. The big one has all three sides subdivided, each into B + C, and the two small ones fill against those pieces — so every vertex is 3.3.3.T with one corner of each size plus a flat, which is where the name comes from. The counting forces the shape before any geometry: six pieces from the big triangle must match the six sides of the two small ones, so the big side is exactly the sum. Lattice C + B*zeta and its 120 deg turn, cell area (sqrt3/2)(B^2 + BC + C^2), equal to the three triangles identically. Wikipedia's non-edge-to-edge family 7, p3.",
		discoverer: "classical",
		cell: TRI_THREE_SIZE,
		k: vertexOrbits(evaluateParamCell(TRI_THREE_SIZE, [1, 0.6])).k,
	},
	...STRIP_FAMILIES,
	...STACK_FAMILIES,
	...ENUM_FAMILIES,
];
