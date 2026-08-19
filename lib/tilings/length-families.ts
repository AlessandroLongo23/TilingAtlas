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
// k comes from the Python side (tools/ctrnact-oracle/vertex_orbits.py, via emit_length_meta.py) and is
// no longer recomputed here. `lib/tilings/vertex-orbits.ts` was a re-implementation of that module and
// disagreed with it on three families, so it is gone rather than kept as a second opinion.
import { LENGTH_META } from "@/lib/tilings/length-meta.generated";
import { TJUNCTION_FAMILIES } from "@/lib/tilings/tjunction-families.generated";
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

// ONE EDGE IS THE UNIT, and it is not a slider. A family's geometry is homogeneous of degree 1 in its
// lengths, so scaling every slider together is a similarity and not a new tiling: the cone has one more
// dimension than the family has shapes. Pinning one length as the constant term cuts the cone by a
// hyperplane that meets every similarity class exactly once — nothing is lost, nothing is reachable
// twice, and the printed parameter count becomes the number of things the sliders can actually do.
// (Until 2026-08-18 four families here shipped that extra slider; `LENGTH_META.params` had recorded the
// honest count all along and nothing read it.)
const KONST = -1; // the constant-term index, see LenTerm
const B = 0, C = 1;
const O: LenTerm[] = [];
const a: LenTerm[] = [[KONST, 1, 0]];    // the unit edge, to the right
const b: LenTerm[] = [[B, 0, 1]];        // B upwards
const add = (...ts: LenTerm[][]): LenTerm[] => ts.flat();

/** The 1×B rectangle grid. Affinely the square grid — a slider smoke test, not a new tiling. */
export const RECT_GRID: ParametricCellData = lengthFamily(
	[lenParam("Height", 1, 0.1, 3)],
	[{ n: 4, vertices: [O, a, add(a, b), b] }],
	[a, b],
);

// The two-square (Pythagorean) tiling: squares of side A and side B, one of each per period, with
// lattice (A, B) and (−B, A). |det| = A² + B², which is exactly the two squares' area — the check the
// test then makes good on by sampling. Non-edge-to-edge: a big square's side is met by one small
// square's side and the remainder, which is precisely the case the SPHERICAL scaled work could not
// express, because there the two sub-pieces were forced equal.
const A2: LenTerm[] = [[KONST, 1, 0]];
const B2: LenTerm[] = [[B, 1, 0]];
const Ay: LenTerm[] = [[KONST, 0, 1]];
const By: LenTerm[] = [[B, 0, 1]];

export const PYTHAGOREAN: ParametricCellData = lengthFamily(
	[// The A-square is the unit, so the one slider IS the ratio. NOT called "small": B may exceed 1,
		// which is the same tiling with the two roles swapped, and a size label would lie there.
		lenParam("B", 0.55, 0.1, 3)],
	[
		{ n: 4, vertices: [O, A2, add(A2, Ay), Ay] },                          // the A-square at the origin
		{ n: 4, vertices: [A2, add(A2, B2), add(A2, B2, By), add(A2, By)] },   // the B-square beside it
	],
	[add(A2, By), [[B, -1, 0], [KONST, 0, 1]]],                                // T1 = (1, B), T2 = (−B, 1)
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
const h0: LenTerm[] = [[KONST, 1, 0]];      // the unit side d0
const h1: LenTerm[] = [[B, 0.5, S3]];       // b·d1
const h2: LenTerm[] = [[C, -0.5, S3]];      // c·d2

export const EQUIANGULAR_HEX: ParametricCellData = lengthFamily(
	[lenParam("B", 1, 0.1, 3), lenParam("C", 1, 0.1, 3)],
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
		k: LENGTH_META[`plen-strip-${w.toLowerCase()}`]?.k ?? 1,
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
const Cp = 0;                                        // B is the unit; C is the one ratio that moves

export const TRI_THREE_SIZE: ParametricCellData = lengthFamily(
	[lenParam("C", 0.6, 0.15, 3)],
	[
		// the big triangle, side 1 + C, pointing up
		{ n: 3, vertices: [[], [[KONST, 1, 0], [Cp, 1, 0]], [[KONST, 0.5, H_TRI], [Cp, 0.5, H_TRI]]] },
		// the unit triangle on [0, 1], pointing down
		{ n: 3, vertices: [[], [[KONST, 1, 0]], [[KONST, 0.5, -H_TRI]]] },
		// the C-triangle on [1, 1 + C], pointing down
		{ n: 3, vertices: [[[KONST, 1, 0]], [[KONST, 1, 0], [Cp, 1, 0]], [[KONST, 1, 0], [Cp, 0.5, -H_TRI]]] },
	],
	[[[Cp, 1, 0], [KONST, 0.5, H_TRI]], [[KONST, -1, 0], [Cp, -0.5, H_TRI]]],
);

// ── ENUMERATED — found by search, not authored ──────────────────────────────────────────────────
//
// These come out of `scripts/enum-families.ts`, which runs the oracle-free search: a finite vertex
// alphabet over the palette's corner angles plus the flat 180, a finite sweep of torus maps with at
// most Vmax vertices per period, and a linear solve for the lengths. Nothing about them was written by
// hand, which is the point — at k = 1 the literature supplies seven families to check against, but at
// higher k there is no list, so the catalogue has to come from a search whose completeness is argued.
//
// Provenance is kept visible: `discoverer` says "enumerated". Where the search rediscovers a family
// that already has a row, the DEDUP below drops this one and names it on the survivor — which is a
// stronger statement than the prose note that used to sit here, because that note was written from a
// V-E-F-tiles lookup that is not a signature and it shipped both cards anyway.
export const ENUM_FAMILIES: LengthFamilyRow[] = ENUMERATED_FAMILIES.map((f) => {
	// Constant point first, then one derivative point per slider — read positionally, which is why the
	// generator writes (x, y) pairs and not a transposed [[x0, dx], [y0, dy]] that either side could
	// read the wrong way round without the types noticing.
	const terms = (v: [number, number][]): LenTerm[] =>
		v.map((q, i) => [i === 0 ? KONST : i - 1, q[0], q[1]] as LenTerm);
	const cellPolygons = f.cellPolygons.map((p) => ({ n: p.n, vertices: p.v.map(terms) }));
	const basis: [LenTerm[], LenTerm[]] = [terms(f.basis[0]), terms(f.basis[1])];
	const cell = lengthFamily(
		f.ranges.map((r, i) => lenParam(f.ranges.length === 1 ? "t" : `t${i + 1}`, f.c0[i], r[0], r[1])),
		cellPolygons, basis, true);
	const flats = f.words.reduce((a, w) => a + [...w].filter((c) => c === "6").length, 0);
	return {
		id: f.id,
		label: `Enumerated: ${f.label}`,
		affineTrivial: false,
		discoverer: "enumerated",
		note:
			`Found by search, not authored. Map: V = ${f.V}, E = ${f.E}, F = ${f.F} per translational period, ` +
			`with ${flats} T-junction${flats === 1 ? "" : "s"}; face corner words ${f.words.join(", ")} in 30-degree ` +
			`units, where a 6 is the flat 180 of a subdivided side. ` +
			(f.ranges.length === 1
				? `The slider range (${f.ranges[0][0].toFixed(3)}, ${f.ranges[0][1].toFixed(3)}) is EXACT: it is ` +
					`the interval on which every edge length stays positive, read off the closure system and not ` +
					`chosen. `
				: `The cone has ${f.ranges.length} parameters after scale, and the sliders are a box fitted ` +
					`inside it by interval arithmetic: every position is a tiling, and some tilings lie outside ` +
					`the box, which is the price of an axis-aligned range on a cone. `) +
			`Search scope: regular polygons {${ENUMERATION_SCOPE.palette.join(", ")}}, at most ` +
			`${ENUMERATION_SCOPE.Vmax} vertices per period. Complete within that scope and silent outside it.`,
		cell,
		k: LENGTH_META[f.id]?.k ?? 1,
	};
});



// ── T-JUNCTION SHELVES, MADE PARAMETRIC ─────────────────────────────────────────────────────────
//
// Not new tilings and not a new search. This is the half-square split shelf the engine already
// enumerates — Marek Čtrnáct's `eu-half-sq-mid-split`, where a side of length 2 = 1 + 1 carries a flat
// 180-degree corner so one tile's edge can be met by two — developed as usual with UNIT edges, because
// a unit edge is the only length the alphabet names. That is why they shipped as rigid tilings.
//
// They are not rigid: hold every angle and the lengths still move. Each slider is one edge length, and
// one edge is pinned as the unit so no slider is pure scale.
//
// ⚑ ONE ROW PER TILING, NOT PER SOLVED BLOCK — corrected 2026-08-18, and the correction is most of
// this shelf. The engine enumerates MAPS, and once a side may be split the same tiling carries many
// maps: a split at a point where both neighbouring tiles run straight through is a mark the tiling
// cannot see. The first version of this shelf counted those marks as parameters and never deduped, so
// 146 blocks shipped as 146 cards — the first two of them the plain rectangle grid under three sliders,
// two of which moved the same width. The emitter now deletes the false vertices before building the
// length system and keys each family by the canonical dart map of the smoothed tiling at a GENERIC
// member, which is also where k is measured and where the card draws.
export const TJUNCTION_ROWS: LengthFamilyRow[] = TJUNCTION_FAMILIES.map((f) => {
	const params = Array.from({ length: f.d }, (_, i) =>
		lenParam(`Edge ${i + 1}`, f.def[i], f.lo[i], f.hi[i]));
	const cell = lengthFamily(
		params,
		f.cellPolygons.map((p) => ({ n: p.n, vertices: p.vertices as LenTerm[][] })),
		[f.basis[0] as LenTerm[], f.basis[1] as LenTerm[]],
		true,
	);
	return {
		id: f.id,
		label: `Half-square, split · ${f.F} tile${f.F > 1 ? "s" : ""}, ${f.d} parameter${f.d === 1 ? "" : "s"}`,
		affineTrivial: false,
		discoverer: "Marek Čtrnáct",
		note:
			`Enumerated by the Čtrnáct engine on the eu-half-sq-mid-split palette, where a side of length ` +
			`2 = 1 + 1 carries a flat 180-degree corner so one tile's edge can be met by two. Map of the ` +
			`SMOOTHED tiling: V = ${f.V}, E = ${f.E}, F = ${f.F} per translational period, V - E + F = 0. ` +
			`The engine develops it with every edge at 1, and that is how it shipped — as a single rigid ` +
			`tiling. Holding the angles and solving for the LENGTHS instead gives a cone of dimension ` +
			`${f.d + 1}, so ${f.d} slider${f.d === 1 ? "" : "s"} once the longest edge is pinned as the ` +
			`unit. The range is a box fitted inside that cone by interval arithmetic, so every position ` +
			`is a tiling; it is conservative, and some members lie outside it. The default is a generic ` +
			`point of that box, NOT the developed member — the developed member is the box centre, where ` +
			`distinct edges coincide and vertex orbits fuse, so k read there would be the wrong number ` +
			`for almost every tiling in the family. Covering multiplicity was checked at the developed ` +
			`point, at this default and at a box corner before shipping. ` +
			`⚑ SCOPE: the scan covered blocks whose DEVELOPED member has k <= 2. A generic member of such ` +
			`a family has at least as many orbits and often more, and the k filed here is that generic ` +
			`one — so this shelf is a complete list of the split-palette families at developed k <= 2, ` +
			`and not a complete list of parametric families at the k it files them under.`,
		cell,
		k: f.k,
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

// Every row built here, before deduplication — the list `export-length-cells.ts` dumps so the Python
// side can measure k, the parameter count and the canonical family key for each one.
export const LENGTH_FAMILIES_ALL: LengthFamilyRow[] = [
	{
		id: "plen-hex",
		label: "Equiangular hexagon",
		affineTrivial: false,
		note: "All six corners 120 deg, opposite sides equal, sides 1, B, C. Closure is automatic because opposite edge directions cancel, so every positive (1, B, C) tiles — a 3-parameter cone, 2 once the first side is taken as the unit, which is what the two sliders are. At B = C = 1 it is the regular hexagonal grid; away from it the tile is a genuinely different hexagon, not a stretched one, because an affine map cannot hold all six angles at 120 deg while changing the side ratios.",
		discoverer: "classical",
		cell: EQUIANGULAR_HEX,
	},
	{
		id: "plen-rect",
		label: "Rectangle grid",
		affineTrivial: true,
		note: "The square grid under a diagonal map. The one slider only stretches it, which is why it is here as the machinery's smoke test and not as a tiling. The width is the unit, so the slider is the aspect ratio; a second slider for the width would only zoom.",
		discoverer: "classical",
		cell: RECT_GRID,
	},
	{
		id: "plen-pythagorean",
		label: "Two-square (Pythagorean) tiling",
		affineTrivial: false,
		note: "Squares of two sizes, one of each per period, lattice (1, B) and (−B, 1) with the first square taken as the unit. No affine map sends both sizes to one, so the ratio B is a genuine parameter and the only one. Non-edge-to-edge: a large square's side is met by a small square's side plus the remainder.",
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
		k: LENGTH_META["plen-tri-hex-shutter"]?.k ?? 1,
	},
	{
		id: "plen-hex-rotor",
		label: "Rotor: hexagons with triangles between",
		affineTrivial: false,
		note: "Unit regular hexagons turned against each other, opening an equilateral triangle of side t at every three-hexagon meeting. The dual of the shutter: here the HEXAGON is the subdivided face (6 corners plus 6 T-junctions) and the triangles are plain. Each hexagon side splits t against a triangle and 1 - t against another hexagon; every vertex is 3.6.T. The neighbouring centres are L and omega*L for L = (1 + omega) + t(omega - 1), so they form a triangular lattice at every t with no condition to check, and the cell area (sqrt3/2)(3 + t^2) is one hexagon plus two triangles of side t exactly. t -> 0 gives the hexagonal tiling, t = 1 the trihexagonal tiling 3.6.3.6. Wikipedia's non-edge-to-edge family 5, p6.",
		discoverer: "classical",
		cell: HEX_ROTOR,
		k: LENGTH_META["plen-hex-rotor"]?.k ?? 1,
	},
	{
		id: "plen-tri-three-size",
		label: "Three size triangles",
		affineTrivial: false,
		note: "Equilateral triangles in three sizes 1, C and 1 + C, the first taken as the unit so the one slider is the ratio. The big one has all three sides subdivided, each into 1 + C, and the two small ones fill against those pieces — so every vertex is 3.3.3.T with one corner of each size plus a flat, which is where the name comes from. The counting forces the shape before any geometry: six pieces from the big triangle must match the six sides of the two small ones, so the big side is exactly the sum. Lattice C + zeta and its 120 deg turn, cell area (sqrt3/2)(1 + C + C^2), equal to the three triangles identically. Wikipedia's non-edge-to-edge family 7, p3.",
		discoverer: "classical",
		cell: TRI_THREE_SIZE,
		k: LENGTH_META["plen-tri-three-size"]?.k ?? 1,
	},
	...STRIP_FAMILIES,
	...STACK_FAMILIES,
	...ENUM_FAMILIES,
	...TJUNCTION_ROWS,
];

// ── ONE ROW PER FAMILY ──────────────────────────────────────────────────────────────────────────
//
// Four independent sources feed this shelf and three of them rediscover each other: the search finds
// the offset rows of squares that `plen-strip-s` already had, the split-palette engine finds the
// rectangle grid that `plen-rect` already had, and the enumerator's own signature (a multiset of face
// words) is too coarse to see that two of its maps carry one tiling. Shipping all of them was the
// shelf's biggest error: 192 cards over 58 tilings.
//
// The key is `LENGTH_META[id].key`: the canonical dart map of the SMOOTHED tiling at a generic member,
// with its corner angles, computed once in `tools/ctrnact-oracle/emit_length_meta.py`. Angles are fixed
// across a length family, so that map determines the cone — two rows share a key exactly when they are
// the same family. The first row wins, and the order below is the priority: hand-authored (which carry
// the derivation and the literature reference), then strips, then the search, then the engine.
//
// A row whose id is missing from LENGTH_META is KEPT, never dropped: a stale meta table must not make
// families disappear silently. `length-families.test.ts` fails if any id is missing.
export const ABSORBED_BY: Record<string, string> = {};

export const LENGTH_FAMILIES: LengthFamilyRow[] = (() => {
	const byKey = new Map<string, LengthFamilyRow>();
	const absorbed = new Map<string, string[]>();
	const out: LengthFamilyRow[] = [];
	for (const f of LENGTH_FAMILIES_ALL) {
		const key = LENGTH_META[f.id]?.key;
		if (key === undefined) { out.push(f); continue; }
		const first = byKey.get(key);
		if (first) {
			ABSORBED_BY[f.id] = first.id;
			absorbed.get(first.id)!.push(f.id);
			continue;
		}
		byKey.set(key, f);
		absorbed.set(f.id, []);
		out.push(f);
	}
	// Provenance is not lost when a row is: the survivor says who else found it. This is the sentence
	// the old `KNOWN` table tried to write from a V-E-F-tiles lookup that was not a signature.
	return out.map((f) => {
		const also = absorbed.get(f.id) ?? [];
		if (!also.length) return f;
		const bucket = (i: string) =>
			i.startsWith("plen-enum-") ? "the search"
				: i.startsWith("plen-tj-") ? "the split-palette engine"
					: i.startsWith("plen-strip-") ? "the strip construction"
						: "another hand-built row";
		const groups = ["the search", "the split-palette engine", "the strip construction",
			"another hand-built row"].map((who) => [who, also.filter((i) => bucket(i) === who)] as const);
		const said = groups
			.filter(([, ids]) => ids.length)
			.map(([who, ids]) => `${who} found it ${ids.length === 1 ? "as" : `${ids.length} times, first as`} ${ids[0]}`)
			.join("; ");
		return { ...f, note: `${f.note} Rediscovered: ${said}.` };
	});
})();
