// TILE FIGURES: the same binary edge state as a freedraw pattern, drawn as filled black regions on the
// tiles instead of as marks along the edges. Christopher Carlson's multi-scale Truchet construction
// (Bridges 2018), generalised off the square. AL's idea, 2026-08-14.
//
// THE PORT. Every edge is cut into thirds and the middle third is its PORT. A connected edge's port is
// black, an unconnected edge's is white. Two tiles sharing an edge cut it the same way, so their ports
// coincide exactly and the black regions meet across it — on ANY tiling, with no rule about it, and
// with no assumption that the tiles are regular or that the edge lengths agree. The one third is not
// decoration: it is what lets a tile be replaced by a scaled copy of the whole pattern later, which is
// the point of a multi-scale set.
//
// THE COUNT IS c FACTORIAL. Walk the tile's boundary. Along a connected edge the colour runs
// white → black → white, so each connected edge contributes two transition points, and going round they
// ALTERNATE: c points where black opens, c where it closes. A boundary arc through the interior has to
// leave a closing point and arrive at an opening one, so a drawing is exactly a bijection from the
// connected edges to themselves — `sigma` below. c! of them: 1 for one connected edge, 2 for two, 6 for
// three, and 24 for four, which is the "24 distinct pairwise connections of edge points" in Carlson's
// figure. Every cycle of sigma closes one loop, so the components fall out of the permutation and are
// never chosen separately.
//
// This is why the construction needs no continuity rule. A port is a SEGMENT, not a point: it carries
// exactly one boundary-in and one boundary-out on each side, whatever its neighbour does. The branch
// points the centre-line version had (two arc ends on one midpoint) cannot be expressed here.
//
// THE ARCS. Every interior arc leaves and arrives PERPENDICULAR to its edge, and one cubic with the
// classical (4/3)tan(theta/4) handle is exact wherever the true boundary is circular:
//
//   same edge (a cap)        turn 180°, and the handle lands on the standard single-cubic semicircle
//   across one vertex        turn = the exterior angle; on a square, the quarter circle of radius 1/3
//                            centred on the corner — the inner wall of a bend, radius 2/3 the outer
//   opposite edges           turn 0, so the cubic degenerates to the straight side of a bar
//
// Three named wirings cover the useful part of the c! space; the rest is reachable by handing
// `tileFigure` a permutation directly.

export type Pt = readonly [number, number];

/** One side of a closed boundary: a straight run along a port, or a cubic through the interior. */
export type Seg = { kind: "line"; to: Pt } | { kind: "curve"; c1: Pt; c2: Pt; to: Pt };

/** One boundary component of a tile's black region, implicitly closed back to `start`. */
export interface TileLoop {
	start: Pt;
	segs: Seg[];
}

/**
 * Which bijection to take.
 *
 *   "ribbons"   pair up neighbouring connected edges, so the black runs across the tile as bands of
 *               constant width. An odd count leaves one edge over and it is capped. `twist` picks
 *               which of the two pairings, and there is no canonical answer: no turn of a square
 *               carries one pairing of four connected edges onto the other.
 *   "junction"  one cycle through every connected edge in order, so the black is a single region — a
 *               bar at two, a T at three, a cross at four. Keeps the tile's own symmetry.
 *   "caps"      the identity: each port is capped where it stands and nothing crosses the tile.
 */
export type Wiring = "ribbons" | "junction" | "caps";

export interface TileRule {
	wiring: Wiring;
	/** "ribbons" only: which of the two neighbour pairings. Ignored by the other two. */
	twist: 0 | 1;
}

export const DEFAULT_TILE_RULE: TileRule = { wiring: "ribbons", twist: 0 };

export const WIRINGS: { value: Wiring; label: string; help: string }[] = [
	{
		value: "ribbons",
		label: "Ribbons",
		help: "Bands of constant width joining neighbouring connected edges. An odd one out is capped.",
	},
	{
		value: "junction",
		label: "Junction",
		help: "One region through every connected edge: a bar at two, a T at three, a cross at four.",
	},
	{ value: "caps", label: "Caps", help: "Every connected edge capped where it stands. Nothing crosses." },
];

/** Where an edge's port starts and ends, as fractions along it. The whole construction rests on these. */
export const PORT_START = 1 / 3;
export const PORT_END = 2 / 3;

// ── Non-crossing wirings ──────────────────────────────────────────────────────────────────────────
//
// Only c! of the wirings are DRAWINGS; the ones whose arcs cross are not. Where two arcs cross, the
// black region stops being a region: the overlap is inside two loops at once, so its colour has to come
// from a winding or parity rule, and "outside times outside" is not an answer to what colour a patch of
// a tile is. AL, 2026-08-14. An embedded wiring has no such patch — its loops are disjoint simple
// curves, each touching the tile boundary along its own ports, and black/white is just containment.
//
// The embedded ones are exactly the NON-CROSSING PERFECT MATCHINGS of the 2c boundary points, so there
// are Catalan(c) of them: 1, 2, 5, 14, 42, 132 as c runs 1..6, against 1, 2, 6, 24, 120, 720. The
// matching condition comes for free — a non-crossing chord has an even number of points on each side,
// so its ends have opposite parity, and the points alternate open/close round the boundary. Nothing has
// to check that a matching pairs a close with an open; it cannot do otherwise.
//
// Carlson's square set is 15 tiles and Catalan(4) is 14, which reads as the fourteen embedded drawings
// plus the one crossed tile he kept for its own sake.

const CATALAN: number[] = [1];
const catalan = (n: number): number => {
	while (CATALAN.length <= n) {
		const m = CATALAN.length;
		let sum = 0;
		for (let i = 0; i < m; i++) sum += CATALAN[i] * CATALAN[m - 1 - i];
		CATALAN.push(sum);
	}
	return CATALAN[n];
};

/** How many drawings a tile with `c` connected edges has, once the crossed ones are dropped. */
export const wiringCount = (c: number): number => catalan(c);

/**
 * A uniform random NON-CROSSING wiring over `c` connected edges. `next` returns [0, 1).
 *
 * Boundary points run open_0, close_0, open_1, close_1, … so position 2k opens edge k and 2k + 1 closes
 * it. The recursion is the standard one for non-crossing matchings: the first free point pairs with one
 * of the odd offsets ahead of it, weighted by the Catalan numbers of the two intervals that split off,
 * and each interval is matched the same way. Uniform over all Catalan(c), and linear in c per draw — it
 * never enumerates, so a dodecagon's 208,012 drawings cost the same as a square's 14.
 */
export function randomWiring(c: number, next: () => number): number[] {
	if (c === 0) return [];
	const partner = new Array<number>(2 * c).fill(-1);
	const match = (lo: number, hi: number): void => {
		if (lo > hi) return;
		const m = (hi - lo + 1) / 2;
		let r = next() * catalan(m);
		let j = 0;
		for (; j < m - 1; j++) {
			const w = catalan(j) * catalan(m - 1 - j);
			if (r < w) break;
			r -= w;
		}
		const q = lo + 2 * j + 1;
		partner[lo] = q;
		partner[q] = lo;
		match(lo + 1, q - 1);
		match(q + 1, hi);
	};
	match(0, 2 * c - 1);
	const sigma = new Array<number>(c);
	// Read it off the closes: each one's partner is an open, and which edge that opens is the answer.
	for (let k = 0; k < c; k++) sigma[k] = partner[2 * k + 1] / 2;
	return sigma;
}

/** Do any two of this wiring's arcs cross? The test every drawing has to pass to be a drawing. */
export function wiringCrosses(sigma: readonly number[]): boolean {
	const c = sigma.length;
	// Chord k joins the point that closes edge k to the one that opens edge sigma[k].
	const chords = sigma.map((j, k) => {
		const a = 2 * k + 1;
		const b = 2 * j;
		return a < b ? ([a, b] as const) : ([b, a] as const);
	});
	for (let i = 0; i < c; i++) {
		for (let j = i + 1; j < c; j++) {
			const [a, b] = chords[i];
			const [p, q] = chords[j];
			const insideP = p > a && p < b;
			const insideQ = q > a && q < b;
			if (insideP !== insideQ) return true;
		}
	}
	return false;
}

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/**
 * The bijection a named wiring means, over `c` connected edges indexed in boundary order.
 * Exposed so a caller can compare against a hand-built permutation, and so the tests can.
 */
export function wiringPermutation(c: number, rule: TileRule = DEFAULT_TILE_RULE): number[] {
	if (c === 0) return [];
	if (rule.wiring === "caps") return Array.from({ length: c }, (_, k) => k);
	if (rule.wiring === "junction") return Array.from({ length: c }, (_, k) => (k + 1) % c);
	// Ribbons: pair neighbours round the cycle, starting `twist` in. An odd count cannot be paired
	// through, and the leftover becomes a fixed point — a cap, which is the only thing it can be.
	const sigma = new Array<number>(c);
	const rot = (t: number) => (t + rule.twist) % c;
	for (let t = 0; t + 1 < c; t += 2) {
		sigma[rot(t)] = rot(t + 1);
		sigma[rot(t + 1)] = rot(t);
	}
	if (c % 2 === 1) sigma[rot(c - 1)] = rot(c - 1);
	return sigma;
}

/**
 * The black region of one tile, as closed loops in world coordinates.
 *
 * `corners` in either winding; edge i runs from corner i to corner i + 1, and `connected[i]` is its
 * state. `sigma` overrides the rule with an explicit bijection over the connected edges, indexed in
 * boundary order — the door to the rest of the c! space.
 *
 * Loops all carry the traversal's own orientation, so overlapping ones (a permutation whose arcs cross)
 * union under a nonzero fill instead of punching holes in each other.
 */
export function tileFigure(
	corners: readonly Pt[],
	connected: readonly boolean[],
	rule: TileRule = DEFAULT_TILE_RULE,
	sigma?: readonly number[],
): TileLoop[] {
	const n = corners.length;
	if (n < 3) return [];

	const live: number[] = [];
	for (let i = 0; i < n; i++) if (connected[i]) live.push(i);
	const c = live.length;
	if (c === 0) return [];

	// The winding decides which way a +90° turn points, and every normal below has to point INTO the
	// tile — a mirrored cell would otherwise bulge its arcs out through its own edges.
	let area2 = 0;
	for (let i = 0; i < n; i++) {
		const [ax, ay] = corners[i];
		const [bx, by] = corners[(i + 1) % n];
		area2 += ax * by - bx * ay;
	}
	const sign = area2 >= 0 ? 1 : -1;

	// Per connected edge, in boundary order: where black opens, where it closes, and the inward normal.
	const open: Pt[] = [];
	const close: Pt[] = [];
	const inward: Pt[] = [];
	for (const i of live) {
		const p = corners[i];
		const q = corners[(i + 1) % n];
		open.push(lerp(p, q, PORT_START));
		close.push(lerp(p, q, PORT_END));
		const dx = q[0] - p[0];
		const dy = q[1] - p[1];
		const len = Math.hypot(dx, dy) || 1;
		inward.push([(-dy / len) * sign, (dx / len) * sign]);
	}

	const perm = sigma ?? wiringPermutation(c, rule);
	const loops: TileLoop[] = [];
	const seen = new Array<boolean>(c).fill(false);
	for (let k = 0; k < c; k++) {
		if (seen[k]) continue;
		const segs: Seg[] = [];
		let t = k;
		do {
			seen[t] = true;
			const j = perm[t];
			// Along the port, then through the interior to where the next port opens.
			segs.push({ kind: "line", to: close[t] });
			segs.push(interiorArc(close[t], inward[t], open[j], inward[j]));
			t = j;
		} while (t !== k);
		loops.push({ start: open[k], segs });
	}
	return loops;
}

/**
 * The cubic from where black closes on one edge to where it opens on another, perpendicular to both.
 *
 * `theta` is the turn between the two tangents, which for a circular boundary is the arc's own angle, so
 * the classical handle (4/3)tan(theta/4)·r written through the chord — r = L / (2 sin(theta/2)) — is
 * exact whenever the true boundary IS circular, and goes to L/3, a straight cubic, as theta goes to zero.
 * At theta = 180° (a cap) it lands on the standard single-cubic semicircle, whose worst radial error is
 * 2.7% of a radius: here the radius is a sixth of an edge, so a third of a pixel at any honest zoom.
 */
function interiorArc(from: Pt, nFrom: Pt, to: Pt, nTo: Pt): Seg {
	const dx = to[0] - from[0];
	const dy = to[1] - from[1];
	const L = Math.hypot(dx, dy);
	if (L < 1e-12) return { kind: "line", to };
	// Leaving `from` the boundary heads into the tile along nFrom; arriving at `to` it heads back out
	// to the edge, against nTo. The turn is the angle between those two forward directions.
	const ox = -nTo[0];
	const oy = -nTo[1];
	const theta = Math.abs(Math.atan2(nFrom[0] * oy - nFrom[1] * ox, nFrom[0] * ox + nFrom[1] * oy));
	const h = theta < 1e-6 ? L / 3 : ((4 / 3) * Math.tan(theta / 4) * L) / (2 * Math.sin(theta / 2));
	return {
		kind: "curve",
		c1: [from[0] + h * nFrom[0], from[1] + h * nFrom[1]],
		c2: [to[0] + h * nTo[0], to[1] + h * nTo[1]],
		to,
	};
}

/**
 * Does this figure's boundary cross itself on the page?
 *
 * A non-crossing wiring CAN be drawn with disjoint arcs; that these particular cubics are disjoint is a
 * separate, geometric fact, and it holds on every REGULAR tile — all 14 embedded wirings of a square,
 * all 5 of a triangle, all 132 of a hexagon. It does not hold universally: on a 30-60-90 drafter one
 * wiring of the five sends a band's outer wall clean through the third edge's cap, because the tile is
 * long enough for the sweep to reach. Callers that pick a wiring at random check with this and draw
 * again; callers that name one (the three in `WIRINGS`, all embedded everywhere tested) do not need to.
 *
 * Arcs sharing a port endpoint touch by construction and do not count as crossing.
 */
export function figureSelfIntersects(loops: readonly TileLoop[], samples = 12): boolean {
	const arcs: Pt[][] = [];
	for (const loop of loops) {
		let from = loop.start;
		for (const seg of loop.segs) {
			if (seg.kind === "curve") {
				const pts: Pt[] = [];
				for (let i = 0; i <= samples; i++) pts.push(cubicAt(from, seg, i / samples));
				arcs.push(pts);
			}
			from = seg.to;
		}
	}
	for (let i = 0; i < arcs.length; i++) {
		for (let j = i + 1; j < arcs.length; j++) {
			if (sharesEnd(arcs[i], arcs[j])) continue;
			for (let u = 0; u + 1 < arcs[i].length; u++) {
				for (let v = 0; v + 1 < arcs[j].length; v++) {
					if (properCross(arcs[i][u], arcs[i][u + 1], arcs[j][v], arcs[j][v + 1])) return true;
				}
			}
		}
	}
	return false;
}

const cubicAt = (from: Pt, s: Extract<Seg, { kind: "curve" }>, t: number): Pt => {
	const u = 1 - t;
	const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
	const ps = [from, s.c1, s.c2, s.to];
	return [
		ps.reduce((a, p, i) => a + w[i] * p[0], 0),
		ps.reduce((a, p, i) => a + w[i] * p[1], 0),
	];
};

const sharesEnd = (a: Pt[], b: Pt[]): boolean => {
	for (const p of [a[0], a[a.length - 1]]) {
		for (const q of [b[0], b[b.length - 1]]) {
			if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-7) return true;
		}
	}
	return false;
};

const properCross = (a: Pt, b: Pt, c: Pt, d: Pt): boolean => {
	const side = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
	return (
		side(a, b, c) * side(a, b, d) < -1e-12 && side(c, d, a) * side(c, d, b) < -1e-12
	);
};

/**
 * Does any of this figure leave its tile?
 *
 * Convex tiles cannot fail: an arc joins two boundary points with tangents pointing inward. A tile with
 * a REFLEX corner can, and the scaled shelf is full of them — a T-uniform tile there is a big polygon
 * whose sides are split at every junction, so "9 sides / 7 corners" shapes are ordinary. Ray-cast rather
 * than half-plane test, so non-convex tiles are handled honestly.
 */
export function figureEscapes(
	corners: readonly Pt[],
	loops: readonly TileLoop[],
	samples = 10,
): boolean {
	const inside = (p: Pt): boolean => {
		let hit = false;
		for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
			const a = corners[i];
			const b = corners[j];
			if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) {
				hit = !hit;
			}
		}
		return hit;
	};
	// A boundary point sits exactly ON an edge, where the ray cast is a coin flip — so only interior
	// samples are judged, and only when they are a real distance off the boundary.
	const eps = 1e-6;
	for (const loop of loops) {
		let from = loop.start;
		for (const seg of loop.segs) {
			if (seg.kind === "curve") {
				for (let i = 1; i < samples; i++) {
					const q = cubicAt(from, seg, i / samples);
					if (!inside(q) && distToBoundary(corners, q) > eps) return true;
				}
			}
			from = seg.to;
		}
	}
	return false;
}

const distToBoundary = (corners: readonly Pt[], p: Pt): number => {
	let best = Infinity;
	for (let i = 0; i < corners.length; i++) {
		const a = corners[i];
		const b = corners[(i + 1) % corners.length];
		const dx = b[0] - a[0];
		const dy = b[1] - a[1];
		const L2 = dx * dx + dy * dy || 1;
		const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
		best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)));
	}
	return best;
};

/** The same figure, moved. Lets a renderer build one period once and stamp it. */
export function translateLoops(loops: readonly TileLoop[], dx: number, dy: number): TileLoop[] {
	const mv = (p: Pt): Pt => [p[0] + dx, p[1] + dy];
	return loops.map((l) => ({
		start: mv(l.start),
		segs: l.segs.map((s) =>
			s.kind === "line" ? { kind: "line", to: mv(s.to) } : { kind: "curve", c1: mv(s.c1), c2: mv(s.c2), to: mv(s.to) },
		),
	}));
}
