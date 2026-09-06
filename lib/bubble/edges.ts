// The EDGE PROFILES a bubble tiling can be drawn with. Sibling of lib/bubble/pattern.ts, which owns
// the combinatorics; this file owns nothing but the shape of one decorated edge.
//
// WHAT A PROFILE IS. An edge from a to b carries an offset h(t) off the chord, t running 0→1 along it
// and h measured on the chord's left normal. The tile that owns the BUMP draws +h; its neighbour
// traverses the same edge backwards and draws the BITE, which is forced:
//
//     bite(t) = -bump(1 - t)
//
// (Derivation: the neighbour's frame has u' = -u and n' = -n, and its parameter is t' = 1-t; equating
// the two point sets gives exactly that.) So the bite is the bump point-reflected through the chord
// midpoint, and NOT its mirror. The two coincide only when the bump is an even function of t - 1/2,
// which every profile here is, and which is why the single-arc code this replaces could get away with
// negating. Keeping the general rule costs three lines and is what lets an asymmetric profile be added
// without silently drawing two different curves on the two sides of one edge.
//
// ⚑ THE ONE FORBIDDEN FAMILY: profiles ANTISYMMETRIC about the midpoint, h(1-t) = -h(t). There
// bite = bump, so the decoration stops encoding the bit it exists to show and the whole shelf renders
// as an undecorated substrate. That is precisely Heesch's C-edge (the edge carried to itself by a half
// turn about its midpoint), so the entire S-curve / ogee family is out — which is a shame, because an
// ogee is the first thing anyone reaches for after an arc.
//
// HOW DEEP A PROFILE MAY GO, and why the paper's arc is 60°. A decorated tile has to stay a SIMPLE
// closed curve; complementarity then makes the tiles fit with no further condition, so tile simplicity
// is the whole geometric constraint. It binds at a tile's TIGHTEST CORNER, where two bites cut in from
// edges meeting at φ, and it is exactly proportional to tan(φ/2): measured against the equilateral
// triangle, every profile in this file admits ×1.732 = tan45/tan30 on the square and ×3.000 =
// tan60/tan30 on the hexagon, to within 1%. Two consequences the code below is built on:
//
//   • Profiles are authored at the TRIANGLE scale — the tightest board — and their depth is multiplied
//     by tan(φ/2)/tan(30°) on the looser ones, so each board gets the deepest version that fits.
//   • The deepest CIRCULAR arc a tile admits is an arc of its own corner angle: 60° on triangles, 90°
//     on squares, 120° on hexagons. So the 60° arc the catalogue is enumerated and thumbnailed in is
//     not a taste; on the triangular substrate it is the extremal one, and that is what "Arc" stays,
//     unscaled, on every board.
//
// The 60° rhombus measures identically to the triangle, its 60° corner being the binding one, which is
// why the board table below asks only for the smallest interior angle on the board.
//
// lib/bubble/edges.test.ts re-derives all of this: every profile, on every board, for every bite word.

import { cubicFlatness, cubicSegmentCount, flattenCubicOpen, type Cubic, type Pt } from "@/lib/render/cubic";
import type { BubbleGrid } from "@/lib/bubble/pattern";

export type BubbleEdgeStyle = "shallow" | "arc" | "koch" | "crenel" | "dovetail" | "jigsaw";

/** The picker's contents: order, label, and the one-line gloss under it. */
export const BUBBLE_EDGE_STYLES: { value: BubbleEdgeStyle; label: string; help: string }[] = [
	{ value: "shallow", label: "Shallow", help: "A 30° arc. The faintest bulge that still reads as a bump at thumbnail size." },
	{ value: "arc", label: "Arc", help: "A 60° circular arc — the profile the catalogue is drawn in, and on the triangular substrate the deepest one a tile admits." },
	{ value: "koch", label: "Koch", help: "The Koch generator: the middle third of the edge replaced by a bump, then the same done to every segment it leaves behind. At level 1 it is a plain chevron, and the one profile that survives a 40-pixel thumbnail." },
	{ value: "crenel", label: "Squared Koch", help: "The quadratic Koch generator: the middle third of the edge replaced by three sides of a rectangle, then the same done to every segment it leaves behind. At level 1 it is a plain crenel, which turns every bubble tile into a polyomino on a refined grid — the same tiling readable as a polyform. Rougher than the triangular Koch: dimension 1.465 against 1.262." },
	{ value: "dovetail", label: "Dovetail", help: "A trapezoidal tab widening outward, the woodworking joint: interlocking like the jigsaw knob, but straight-sided." },
	{ value: "jigsaw", label: "Jigsaw tab", help: "Neck and round head — the puzzle trade's tab and blank. The deepest profile here, and the only one whose head overhangs its own neck." },
];

export const BUBBLE_EDGE_STYLE_VALUES = BUBBLE_EDGE_STYLES.map((s) => s.value);
export const DEFAULT_BUBBLE_EDGE_STYLE: BubbleEdgeStyle = "arc";

/** Iterations the level slider offers, and where it starts. Level 1 IS the chevron (triangular Koch)
 *  and IS the crenel (squared Koch), which is why there is no separate chevron and no separate crenel:
 *  each fractal subsumes its own generator and the slider is how you get back to it.
 *
 *  ⚑ The ceiling is a COST bound, not a geometric one. A level costs 4ⁿ+1 points per edge for the
 *  triangular generator (5, 17, 65, 257) and 5ⁿ+1 for the squared one (6, 26, 126, 626), and neither
 *  depth budget breaks past it — nothing breaks at level 5 except the machine. The ear clipper is
 *  quadratic in the ring, and at 1,025 points per edge that is ~287k points per cell on the k=5 square
 *  board. Four is where the slower of the two stays under a second. */
export const BUBBLE_KOCH_LEVELS = { min: 1, max: 4, default: 1 } as const;

/** Which profiles the level slider means anything for: the two that are generators, not polylines. */
export const hasLevels = (style: BubbleEdgeStyle) => style === "koch" || style === "crenel";

/**
 * The smallest interior angle any tile on this board has, in degrees — the one number the depth budget
 * depends on. Every mixed board carries triangles, so only the two single-tile boards loosen.
 */
export function boardCornerAngle(grid: BubbleGrid): number {
	return grid === "square" ? 90 : grid === "hex" ? 120 : 60;
}

/**
 * How much deeper than the triangle scale this board lets a profile go: tan(φ/2) / tan(30°), CAPPED at
 * the square's 1.732.
 *
 * The cap is not decoration. The corner rule is the binding constraint only while corners are the
 * tightest thing on the tile, and on the hexagon they stop being: opposite edges are 1.732·L apart, so
 * two facing bites at the corner-implied ×3 depth clear each other by under 2% of an edge. That passes
 * a bare crossing test and looks like a catastrophe — the tabs render as slivers with the fills spilling
 * across them, which is how this was caught. Rather than model a second constraint, the hexagonal board
 * draws the square's profile: still twice the triangle's depth, and with room to spare.
 */
const depthScale = (grid: BubbleGrid) =>
	Math.min(Math.tan((boardCornerAngle(grid) * Math.PI) / 360), Math.tan(Math.PI / 4)) / Math.tan(Math.PI / 6);

// Flattening tolerance for the curved profiles, as a fraction of the edge. Tighter than the 0.004 that
// lib/render/periodic/edges.ts uses for its Truchet arcs, because those are line art and these are a
// tile BOUNDARY the eye reads as smooth along its whole length. Sized against the zoom range: the
// bound is error = 0.75·M/n², and a 60° arc's cubic has M ≈ 0.1925, so 0.004 gives 7 segments and
// ≈0.003 world units — 0.44 px at ZOOM_MAX = 150 px per world unit, visible on a long arc and much
// worse under the conformal lens, whose magnification is unbounded near the inversion centre. 0.0004
// gives 19 segments and ≈0.075 px, under the flat view's resolution with room left for the lens.
//
// ⚑ FIXED resolution, not zoom-adaptive. Re-tessellating per zoom would mean keying the mesh cache on
// the zoom level, which no shelf does; flattening finer than the range can resolve buys the same
// result for one constant.
const TOL_FRAC = 0.0004;
const MAX_SEGMENTS = 48;

const pt = (x: number, y: number): Pt => ({ x, y });

/** One clockwise sub-arc of the circle (centre `c`, radius `r`) as a cubic, from angle `s` by `d`. */
function arcCubic(cx: number, cy: number, r: number, s: number, d: number): Cubic {
	const e = s - d;
	// Tangent of a clockwise traversal at angle α is (sin α, −cos α), of unit length already, so k·r is
	// exactly the handle the quarter-circle fit asks for.
	const k = (4 / 3) * Math.tan(d / 4);
	return [
		pt(cx + r * Math.cos(s), cy + r * Math.sin(s)),
		pt(cx + r * Math.cos(s) + k * r * Math.sin(s), cy + r * Math.sin(s) - k * r * Math.cos(s)),
		pt(cx + r * Math.cos(e) - k * r * Math.sin(e), cy + r * Math.sin(e) + k * r * Math.cos(e)),
		pt(cx + r * Math.cos(e), cy + r * Math.sin(e)),
	];
}

/** Flatten a chain of cubics running from (0,0) to (1,0), keeping both endpoints and no duplicates. */
function chain(cubics: Cubic[]): Pt[] {
	const out: Pt[] = [];
	for (const c of cubics) flattenCubicOpen(c, cubicSegmentCount(cubicFlatness(c), 1, TOL_FRAC, MAX_SEGMENTS), out);
	out.push(cubics[cubics.length - 1][3]);
	return out;
}

/**
 * A circular arc of `deg` on the unit chord (0,0)→(1,0), bulging to +y.
 *
 * Split into 90°-or-less pieces before the cubic fit: one cubic carries a quarter circle to ~1e-4 of
 * the radius and a half circle only to ~1e-2, which on a 120° arc is a visibly flat-topped bump. At the
 * 60° default the split is a no-op (one piece, handle (4/3)·tan 15°), so the shelf's shipped geometry
 * is the arc it always was.
 */
function arcProfile(deg: number): Pt[] {
	const th = (deg * Math.PI) / 180;
	// r = chord / (2·sin(θ/2)); the centre sits below the chord so the arc bulges up.
	const r = 1 / (2 * Math.sin(th / 2));
	const cy = -Math.sqrt(Math.max(0, r * r - 0.25));
	// (0,0) as an angle about the centre. Sweeping DOWN from there passes through 90°, the top of the
	// circle, which is the side we want to bulge to.
	const a0 = Math.atan2(-cy, -0.5);
	const pieces = Math.ceil(deg / 90);
	return chain(Array.from({ length: pieces }, (_, i) => arcCubic(0.5, cy, r, a0 - (i * th) / pieces, th / pieces)));
}

/**
 * The jigsaw tab: a straight run, a pinched neck, a round head, and the mirror of both.
 *
 * The head is a 250° arc — past a half circle, which is what makes the tab lock instead of merely
 * bulge, and what makes the tile non-convex in a way no arc is (the head overhangs its own neck).
 * Anything that reads a bubble tile as convex is already disabled on this shelf (hasCurvedTiles in
 * lib/services/shelfRegistry.ts), so this deepens an existing restriction instead of adding one.
 *
 * The 0.30 straight run at each end is the corner inset every profile here keeps, and the head sits at
 * 85% of the depth the triangle admits: the tab is the tightest fit in the file, so it gets the margin.
 */
function jigsawProfile(): Pt[] {
	const R = 0.1105; // head radius
	const cy = 0.132; // head centre height
	const A = (215 * Math.PI) / 180; // where the neck meets the head, measured about the centre
	const SWEEP = (250 * Math.PI) / 180;
	const ex = 0.5 + R * Math.cos(A);
	const ey = cy + R * Math.sin(A);
	return chain([
		[pt(0, 0), pt(0.1, 0), pt(0.2, 0), pt(0.3, 0)],
		// The neck overshoots RIGHT (x = 0.44) before arriving at the head's left flank (x ≈ 0.41):
		// that overshoot IS the undercut, and removing it turns the tab back into a plain bump.
		[pt(0.3, 0), pt(0.4, 0.004), pt(0.44, 0.051), pt(ex, ey)],
		arcCubic(0.5, cy, R, A, SWEEP / 3),
		arcCubic(0.5, cy, R, A - SWEEP / 3, SWEEP / 3),
		arcCubic(0.5, cy, R, A - (2 * SWEEP) / 3, SWEEP / 3),
		[pt(1 - ex, ey), pt(1 - 0.44, 0.051), pt(1 - 0.4, 0.004), pt(0.7, 0)],
		[pt(0.7, 0), pt(0.8, 0), pt(0.9, 0), pt(1, 0)],
	]);
}

/**
 * A GENERATOR, iterated: every segment is replaced by the generator drawn in that segment's own frame,
 * then every segment THAT leaves behind is treated the same way. Both fractal profiles here are this
 * function under a different generator, which is the whole difference between them.
 *
 * The generator is a polyline on the unit chord from (0,0) to (1,0), endpoints included, exactly like a
 * profile. `y` is measured on the segment's left normal (-dy, dx), the side the profile bulges to, so
 * every bump points out of the tile that owns it.
 */
function fractalProfile(level: number, gen: readonly Pt[]): Pt[] {
	let pts: Pt[] = [pt(0, 0), pt(1, 0)];
	for (let l = 0; l < level; l++) {
		const next: Pt[] = [pts[0]];
		for (let i = 0; i < pts.length - 1; i++) {
			const a = pts[i];
			const dx = pts[i + 1].x - a.x;
			const dy = pts[i + 1].y - a.y;
			for (let g = 1; g < gen.length; g++)
				next.push(pt(a.x + gen[g].x * dx - gen[g].y * dy, a.y + gen[g].x * dy + gen[g].y * dx));
		}
		pts = next;
	}
	return pts;
}

/**
 * The TRIANGULAR Koch generator: the middle third replaced by two sides of a triangle. Dimension
 * log 4 / log 3 = 1.262.
 *
 * ⚑ The APEX is not the textbook one on every board. A true Koch bump is equilateral, apex height
 * √3/6 = 0.2887 of the segment, and the measured limit for a bump of that width at a 60° corner is
 * 0.288. The genuine Koch curve is, to three figures, exactly as deep as a triangular bubble tile can
 * take, with no margin at all. So the triangular boards get a flattened generator (a Cesàro-type Koch,
 * apex 0.23) and the square and hexagonal ones, whose budget is 1.732× larger, get the real thing —
 * the depth scale is capped at √3/6 for this style, because past that it stops being a Koch curve.
 *
 * The apex height of the whole curve is the LEVEL-1 apex whatever the level: every later bump sits on a
 * segment already tilted away from the peak, and none of them reaches over it. So the depth budget is
 * settled at level 1 and the slider is free.
 */
const kochGenerator = (apex: number): Pt[] => [pt(0, 0), pt(1 / 3, 0), pt(1 / 2, apex), pt(2 / 3, 0), pt(1, 0)];

/**
 * The SQUARED Koch generator (the quadratic Koch curve, dimension log 5 / log 3 = 1.465): the middle
 * third replaced by three sides of a rectangle. At level 1 it is a plain crenel, which is why there is
 * no separate crenel — the same relation the chevron has to the triangular Koch.
 *
 * ⚑ ITS DEPTH MOVES WITH THE LEVEL, and the triangular one's does not. A Koch bump sits on a segment
 * tilted away from the peak; this tab's top is PARALLEL to the chord, so the next level stands another
 * tab on top of it, and the one after that another. The extent is h(1 + 1/3 + 1/9 + …), which converges
 * to 1.5·h. So the authored number is the EXTENT, and `h` is divided back out of it per level
 * (`thirdsSum`): the profile reaches equally far at every setting, and level 1 is exactly the crenel
 * this shelf shipped with.
 *
 * ⚑ The classic squared fractal is NOT this one and cannot be used here. The Minkowski sausage
 * (dimension log 8 / log 4 = 1.5) rises on the first half of the chord and falls on the second, so
 * h(1-t) = -h(t): it is antisymmetric, bite = bump, and the edge stops carrying the bit it exists to
 * show. Same death as the ogee — see the forbidden family at the top of this file.
 */
const squaredGenerator = (h: number): Pt[] =>
	[pt(0, 0), pt(1 / 3, 0), pt(1 / 3, h), pt(2 / 3, h), pt(2 / 3, 0), pt(1, 0)];

/** 1 + 1/3 + … + 3^(1-level): what one unit of squared-Koch tab height adds up to at this level. */
function thirdsSum(level: number): number {
	let sum = 0;
	for (let i = 0, t = 1; i < level; i++, t /= 3) sum += t;
	return sum;
}

/** How far the squared Koch may reach, at the TRIANGLE scale. The tab spans the middle third, matching
 *  the Koch generator's own thirds, so the two read as the same subdivision of the edge. Narrower than
 *  the 0.44 it first shipped at, which buys depth: the limit at a 60° corner rises to ≈0.19 as the tab
 *  narrows, and 0.155 keeps the usual margin under it. */
const SQUARED_EXTENT = 0.155;
/** The apex of a true equilateral Koch bump, and the ceiling this style's depth scale is capped at. */
const TRUE_KOCH_APEX = Math.sqrt(3) / 6;
/** What a 60° corner will actually take: 80% of the measured 0.288, the margin every profile keeps. */
const KOCH_BASE_APEX = 0.23;

// The bump polyline of each style on the unit chord, INCLUDING both endpoints, at the TRIANGLE scale.
// The two arcs that are not depth-scaled are absolute: "arc" is the catalogue's own 60° and must not
// move, and "shallow" is a deliberately faint reading of the same bit. Depths for the rest sit at
// 85–90% of the measured triangle limit; edges.test.ts is what holds them there.
const BASE: Record<Exclude<BubbleEdgeStyle, "koch" | "crenel">, Pt[]> = {
	shallow: arcProfile(30),
	arc: arcProfile(60),
	dovetail: [pt(0, 0), pt(0.32, 0), pt(0.24, 0.115), pt(0.76, 0.115), pt(0.68, 0), pt(1, 0)],
	jigsaw: jigsawProfile(),
};

/** The two arcs whose depth is fixed by what they MEAN, not by what the board would allow. */
const UNSCALED = new Set<BubbleEdgeStyle>(["shallow", "arc"]);

/** The bump polyline for one (style, board, koch level), built on first use and kept. */
const bumpCache = new Map<string, Pt[]>();
function bump(style: BubbleEdgeStyle, grid: BubbleGrid, level: number): Pt[] {
	const key = `${style}:${boardCornerAngle(grid)}:${level}`;
	const hit = bumpCache.get(key);
	if (hit) return hit;
	const s = depthScale(grid);
	const prof =
		style === "koch"
			? fractalProfile(level, kochGenerator(Math.min(KOCH_BASE_APEX * s, TRUE_KOCH_APEX)))
			: style === "crenel"
				? fractalProfile(level, squaredGenerator((SQUARED_EXTENT * s) / thirdsSum(level)))
				: UNSCALED.has(style)
					? BASE[style]
					: BASE[style].map(({ x, y }) => pt(x, y * s));
	bumpCache.set(key, prof);
	return prof;
}

/** The bite polyline: the bump under the midpoint rule at the top of this file, t ↦ 1-t, h ↦ -h. */
const biteCache = new Map<string, Pt[]>();
function bite(style: BubbleEdgeStyle, grid: BubbleGrid, level: number): Pt[] {
	const key = `${style}:${boardCornerAngle(grid)}:${level}`;
	const hit = biteCache.get(key);
	if (hit) return hit;
	const prof = bump(style, grid, level).map(({ x, y }) => pt(1 - x, -y)).reverse();
	biteCache.set(key, prof);
	return prof;
}

/**
 * One decorated edge from `a` to `b`, appended to `out` WITHOUT its endpoint (the next edge starts
 * there). `outward` bulges the profile to the left of a→b; the caller orients that by the ring's
 * winding, and `outward === false` takes the bite branch, not a mirrored bump.
 *
 * `grid` is here only for the depth budget — the profile is a function of the BOARD and not of this
 * particular edge, which is what keeps the two sides of a shared edge drawing the same curve on a
 * mixed board where a triangle and a hexagon meet. `level` is read by the Koch profile alone.
 */
export function pushEdge(
	out: Pt[],
	a: readonly [number, number],
	b: readonly [number, number],
	outward: boolean,
	style: BubbleEdgeStyle,
	grid: BubbleGrid,
	level: number = BUBBLE_KOCH_LEVELS.default,
): void {
	const [ax, ay] = a;
	const dx = b[0] - ax;
	const dy = b[1] - ay;
	const L = Math.hypot(dx, dy);
	if (!(L > 0)) return;
	// Unit tangent and its LEFT normal — the (t, h) frame the profiles are written in. Both carry the
	// factor L, so a profile is scale-free and one cached polyline serves every edge length.
	const ux = dx / L;
	const uy = dy / L;
	const prof = outward ? bump(style, grid, level) : bite(style, grid, level);
	for (let i = 0; i < prof.length - 1; i++) {
		const { x: t, y: h } = prof[i];
		out.push({ x: ax + (t * ux - h * uy) * L, y: ay + (t * uy + h * ux) * L });
	}
}
