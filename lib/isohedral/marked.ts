/**
 * The twelve isohedral types that exist only as MARKED tilings: IH19, 35, 48, 60, 63, 65, 70, 75, 80,
 * 87, 89, 92.
 *
 * Why they are separate from the other eighty-one. Tactile parameterizes a tiling by its tile
 * BOUNDARY, and for these twelve the boundary carries no information: every edge of the tile lies on
 * a mirror of the tiling, so every edge is forced straight and the tile is forced to be a regular
 * hexagon, a 60/120 rhombus, a rectangle, a square or a triangle. Those shapes are more symmetric than
 * the type's incidence symbol allows, so the boundary alone always lands on some OTHER type. Grünbaum
 * and Shephard's own example, from p.180 of the 1977 paper: IH19 wants a hexagonal tile whose induced
 * group is D3, but a hexagon with all edges equal and all six vertices equivalent under the tiling is
 * regular, and the regular hexagon tiling is IH20, not IH19.
 *
 * What replaces the boundary. G&S mark the interior, and the construction is theirs, quoted from p.180:
 *
 *     "all we have to do is to assign a mark to any one tile (the mark may be chosen arbitrarily so
 *      long as its symmetry group is E — we have used an ⌐) and then apply the operations of S(T) to
 *      mark all the other tiles. If I(T) ≠ E then each tile may carry more than one mark."
 *
 * So the whole picture is the orbit of ONE asymmetric glyph under ONE wallpaper group, drawn over a
 * base net whose own symmetry is larger. Each tile ends up carrying |I(T)| superimposed copies of the
 * glyph, where I(T) is the induced tile group: six for IH19, four for IH63 and IH75, three for IH89,
 * two for IH35/60/65/70/92, and one for IH48, IH80 and IH87 — the only three whose tile group is
 * trivial and which therefore take a single mark.
 *
 * That reduces the whole job to a pair: a base net, and a subgroup S' of the net's symmetry group. The
 * tiles are the net's; the marks are S''s orbit of the seed; and because the seed is asymmetric and in
 * general position, the marked tiling's symmetry group is EXACTLY S' (see markedGroup's contract).
 *
 * The data below — induced tile group, wallpaper group, aspect count — is transcribed from Table 1,
 * columns (3), (5) and (8), of
 *
 *     B. Grünbaum and G. C. Shephard, "The eighty-one types of isohedral tilings in the plane",
 *     Math. Proc. Camb. Phil. Soc. 82 (1977), 177–196; Table 1 on pp. 183–186.
 *
 * Transcription is a risk this project normally refuses, so nothing here is trusted on its word.
 * marked.test.ts recomputes the induced tile group order, the aspect count and the wallpaper group
 * FROM the constructed geometry and fails if any disagrees with the table. The identity
 * |point group| = |I(T)| × aspects holds for all twelve and is checked too; it is what caught the
 * subgroup choices that looked plausible and were wrong.
 */

import { polygonHue, type RawPolygon } from "@/lib/utils/renderTiling";
import type { TactileMatrix, TactilePoint } from "./vendor/tactile";

const SQ3 = Math.sqrt(3);
const EPS = 1e-7;

/* ------------------------------------------------------------------ isometries */

/** An affine map [a b c; d e f]: (x,y) ↦ (ax+by+c, dx+ey+f). Tactile's own layout, so `mul` fits. */
export type Iso = TactileMatrix;

export const IDENT: Iso = [1, 0, 0, 0, 1, 0];

export function apply(m: Iso, p: TactilePoint): TactilePoint {
	return { x: m[0] * p.x + m[1] * p.y + m[2], y: m[3] * p.x + m[4] * p.y + m[5] };
}

/** A ∘ B: apply B first. */
export function compose(a: Iso, b: Iso): Iso {
	return [
		a[0] * b[0] + a[1] * b[3],
		a[0] * b[1] + a[1] * b[4],
		a[0] * b[2] + a[1] * b[5] + a[2],
		a[3] * b[0] + a[4] * b[3],
		a[3] * b[1] + a[4] * b[4],
		a[3] * b[2] + a[4] * b[5] + a[5],
	];
}

export function translate(x: number, y: number): Iso {
	return [1, 0, x, 0, 1, y];
}

/** Rotation by `deg` about (cx, cy). */
export function rotate(deg: number, cx = 0, cy = 0): Iso {
	const t = (deg * Math.PI) / 180;
	const c = Math.cos(t);
	const s = Math.sin(t);
	return [c, -s, cx - c * cx + s * cy, s, c, cy - s * cx - c * cy];
}

/** Reflection in the line through (px, py) at `deg` to the x-axis. */
export function reflect(deg: number, px = 0, py = 0): Iso {
	const t = (2 * deg * Math.PI) / 180;
	const c = Math.cos(t);
	const s = Math.sin(t);
	// Linear part [[c, s], [s, -c]], then conjugated by the translation to (px, py).
	return [c, s, px - c * px - s * py, s, -c, py - s * px + c * py];
}

/** True when the isometry reverses orientation. Exact: the linear part's determinant is ±1. */
export function isReflected(m: Iso): boolean {
	return m[0] * m[4] - m[1] * m[3] < 0;
}

/**
 * The direction the glyph's reference axis points after `m`, in degrees.
 *
 * Reported, not drawn. The marks are flat ink — see MARK_INK for why the orientation is not also coded
 * as hue — but the number is what a caller would need to label or inspect a mark, and it is the honest
 * definition of "which way this copy points".
 */
export function orientationDeg(m: Iso): number {
	const deg = (Math.atan2(m[3], m[0]) * 180) / Math.PI;
	return ((deg % 360) + 360) % 360;
}

/* ------------------------------------------------------------------ lattices and closure */

export interface Lattice {
	t1: TactilePoint;
	t2: TactilePoint;
}

/** Reduce a translation into the half-open lattice cell, so cosets of T compare by value. */
function reduceMod(lat: Lattice, x: number, y: number): [number, number] {
	const det = lat.t1.x * lat.t2.y - lat.t1.y * lat.t2.x;
	// Coefficients of (x,y) in the lattice basis, via Cramer.
	let a = (x * lat.t2.y - y * lat.t2.x) / det;
	let b = (lat.t1.x * y - lat.t1.y * x) / det;
	// Round-then-floor: a coefficient that is 0.9999999999 is a 1 that lost a bit, and flooring it to 0
	// puts the same coset in two buckets and doubles the group.
	const snap = (v: number) => {
		const r = Math.round(v);
		return Math.abs(v - r) < 1e-6 ? r : Math.floor(v);
	};
	a -= snap(a);
	b -= snap(b);
	return [a * lat.t1.x + b * lat.t2.x, a * lat.t1.y + b * lat.t2.y];
}

const q = (v: number) => (Math.abs(v) < EPS ? 0 : Number(v.toFixed(6)));

/** Identity of an isometry modulo the lattice: its linear part plus its reduced translation. */
function cosetKey(lat: Lattice, m: Iso): string {
	const [tx, ty] = reduceMod(lat, m[2], m[5]);
	return `${q(m[0])},${q(m[1])},${q(m[3])},${q(m[4])}|${q(tx)},${q(ty)}`;
}

/**
 * The finite group S'/T: every coset of the translation lattice, from a generating set.
 *
 * Breadth-first closure under composition, capped so a wrong generator (one whose translation is not
 * commensurate with the lattice) fails loudly instead of hanging.
 */
export function closeGroup(lat: Lattice, gens: Iso[], cap = 256): Iso[] {
	const seen = new Map<string, Iso>();
	const queue: Iso[] = [IDENT];
	seen.set(cosetKey(lat, IDENT), IDENT);

	while (queue.length > 0) {
		const m = queue.shift()!;
		for (const g of gens) {
			const next = compose(g, m);
			const key = cosetKey(lat, next);
			if (seen.has(key)) continue;
			if (seen.size >= cap) {
				throw new Error(`closeGroup exceeded ${cap} cosets; a generator is off-lattice`);
			}
			// Store the reduced representative, so downstream geometry stays near the origin.
			const [tx, ty] = reduceMod(lat, next[2], next[5]);
			const rep: Iso = [next[0], next[1], tx, next[3], next[4], ty];
			seen.set(key, rep);
			queue.push(rep);
		}
	}

	return [...seen.values()];
}

/* ------------------------------------------------------------------ polygons */

export type Poly = TactilePoint[];

function mapPoly(m: Iso, poly: Poly): Poly {
	return poly.map((p) => apply(m, p));
}

/** Order-independent identity of a polygon at an absolute position. */
function polyKey(poly: Poly): string {
	return poly
		.map((p) => `${q(p.x)},${q(p.y)}`)
		.sort()
		.join(";");
}

/**
 * The induced tile group I(T): the elements of S' that carry the prototile to ITSELF.
 *
 * The filter has to be modulo the lattice, since that is the only way two cosets can be compared, but
 * the elements it returns must not be. `closeGroup` reduces every representative's translation into the
 * cell, so a coset that stabilizes the tile is generally represented by an isometry carrying the tile to
 * a lattice TRANSLATE of itself. Used as-is, such an element puts its copy of the mark in the wrong
 * cell: `placeSeed` then checked the rosette for overlap in positions the rosette never occupies, and
 * the drawn mark landed outside its tile. So each one is corrected by the lattice vector that brings
 * the image back home, which leaves it in the same coset and makes it a genuine stabilizer element.
 */
function stabilizerOf(cosets: Iso[], lat: Lattice, tile: Poly): Iso[] {
	const id = tileKey(lat, tile);
	const home = centroid(tile);
	const out: Iso[] = [];
	for (const g of cosets) {
		const image = mapPoly(g, tile);
		if (tileKey(lat, image) !== id) continue;
		const c = centroid(image);
		out.push(compose(translate(home.x - c.x, home.y - c.y), g));
	}
	return out;
}

/**
 * Identity of a polygon MODULO the lattice: its centroid reduced into the cell, plus its vertices
 * relative to that centroid.
 *
 * `closeGroup` hands back coset representatives whose translations are already reduced, so two cosets
 * that carry the prototile to the same tile of the tiling generally land it in different cells. Keying
 * on absolute position therefore counts one tile as many, which inflates the aspect count to the whole
 * group and empties the stabilizer down to the identity. Both are quotient-group facts and have to be
 * measured in the quotient.
 */
function tileKey(lat: Lattice, poly: Poly): string {
	const c = centroid(poly);
	const [cx, cy] = reduceMod(lat, c.x, c.y);
	const rel = poly
		.map((p) => `${q(p.x - c.x)},${q(p.y - c.y)}`)
		.sort()
		.join(";");
	return `${q(cx)},${q(cy)}|${rel}`;
}

function polyArea(poly: Poly): number {
	let a = 0;
	for (let i = 0; i < poly.length; ++i) {
		const p = poly[i];
		const r = poly[(i + 1) % poly.length];
		a += p.x * r.y - r.x * p.y;
	}
	return Math.abs(a) / 2;
}

function centroid(poly: Poly): TactilePoint {
	let x = 0;
	let y = 0;
	for (const p of poly) {
		x += p.x;
		y += p.y;
	}
	return { x: x / poly.length, y: y / poly.length };
}

/* ------------------------------------------------------------------ the seed glyph */

/**
 * The mark: an F, drawn as two open paths.
 *
 * G&S used an ⌐ and the atlas did too, until AL asked for an F. It is the better glyph for the job. An
 * ⌐ has two arms, so its only asymmetry is that they differ in length; an F has a spine and two arms at
 * different heights, so it is asymmetric along BOTH axes and its reflection is unmistakable. Reflection
 * is exactly what separates several of these twelve types, so the mark has to make it obvious.
 *
 * The spine is 1.0 long and the arms reach 0.40 and 0.24, giving a 2.5:1 box. Deliberately far from
 * square: at near-equal proportions the F and its quarter-turn read alike, which defeats the point of
 * marking orientation at all.
 *
 * Trivial symmetry is not styling here, it is the requirement. Arms of equal length at symmetric heights
 * would put a mirror through the spine, and a mark with a mirror cannot cut a tile group down to the
 * trivial group — it would leave standing the very symmetry the mark exists to destroy.
 *
 * Two paths, not three: the spine and the long arm share a corner, and drawing them as one polyline
 * mitres it. `GLYPH[0][0] → GLYPH[0][1]` is the spine, which is the arm `placeSeed` lays along a tile
 * edge and the one a caller should measure.
 */
const GLYPH: Poly[] = [
	// Spine, then up the long arm at the far end.
	[
		{ x: 0.5, y: -0.2 },
		{ x: -0.5, y: -0.2 },
		{ x: -0.5, y: 0.2 },
	],
	// The shorter middle arm.
	[
		{ x: 0.0, y: -0.2 },
		{ x: 0.0, y: 0.04 },
	],
];

/**
 * Where the seed sits, as a rule instead of a number.
 *
 * Hand-picked coordinates were the first attempt and they were wrong in two ways at once: marks
 * straddled tile boundaries on IH35, and on IH92 the two copies of a D1 orbit landed on top of each
 * other and fused into a single blob. Both are the same failure — a seed placed without reference to
 * the tile it has to fit or the group that is about to copy it.
 *
 * So the placement is derived. Walk `along` of the way down an edge, step `inward` of the way from
 * there toward the tile's centre, and lay the glyph out ALONG that edge. Every element of the tile
 * group then carries the mark to a different edge, parallel to it, which is what makes a rosette read
 * as a rosette. `along` is deliberately not 0.5: an edge's midpoint sits on the perpendicular bisector,
 * which is a mirror for the D1 types, and a seed on a mirror has an orbit half the size it should be.
 */
export interface SeedPlan {
	/** Which boundary edge the mark lies along. */
	edge: number;
	/** Fraction along that edge. Never 0.5 — see above. */
	along: number;
	/** Fraction of the way from the edge point toward the tile centre. */
	inward: number;
}

const DEFAULT_SEED: SeedPlan = { edge: 0, along: 0.3, inward: 0.42 };

/** Breathing room left after the largest size that still fits and still separates. */
const SEED_SLACK = 0.9;

/** Minimum gap between two marks of one rosette, as a fraction of the mark's long arm. */
const SEED_CLEARANCE = 0.22;

/**
 * Ceiling on the mark's long arm, as a fraction of the tile's shortest edge.
 *
 * The anchor search maximizes the size that fits, and "fits" is not the same as "reads": at the fitted
 * maximum the rosette crowds its own tile boundary and the tiling's edges disappear behind it, which
 * costs the picture the very thing it is trying to show. A mark a little under half an edge long leaves
 * the net visible and the rosette legible. Where containment or the orbit is tighter than this, they
 * still win.
 */
const SEED_MAX_ARM = 0.56;

/**
 * Second ceiling: the mark's share of the tile's area.
 *
 * The edge-relative cap alone is blind to how many marks the tile has to hold. A triangle with C3 gets
 * three marks in the area a rectangle gives to one, and at 0.44 of an edge each they swallowed IH89's
 * net whole. Sizing against area/|I(T)| scales the mark with the room it actually has.
 */
const SEED_AREA_SHARE = 1.05;

/**
 * Anchors to try, when the caller has not pinned one.
 *
 * Fixing the anchor and shrinking the mark until it fits is the wrong way round: on IH92's D1 pair the
 * two anchors sat close together, so "fits" meant a glyph a few pixels across, drawn almost entirely in
 * its own outline stroke, and the orientation hue it carries was invisible. Searching the anchor first
 * and sizing second gives marks four to five times larger on the tight types, for the same guarantees.
 * 0.5 is absent from `along` on purpose: an edge midpoint lies on the perpendicular bisector, which is
 * a mirror for the D1 types, and a seed on a mirror has an orbit half the size it should.
 */
const ALONG_CANDIDATES = [0.16, 0.22, 0.28, 0.34, 0.42];
const INWARD_CANDIDATES = [0.3, 0.38, 0.46, 0.54, 0.62];

/**
 * How far the mark is held off the tile boundary, as a fraction of the tile.
 *
 * Containment alone is not enough to read well. Maximizing the fitted size drove every anchor hard
 * against an edge, and since the neighbouring tile's rosette did the same on its side, the marks of
 * two tiles met across the boundary and merged into one shape sitting on a vertex — IH19 looked like
 * a tiling of six-armed stars rather than of hexagons. Fitting inside a tile shrunk about its centroid
 * fixes it, and the guarantee survives: the tile group fixes the centroid, so it maps the shrunken tile
 * to itself just as it does the tile.
 */
const SEED_INSET = 0.84;

function pointInPoly(p: TactilePoint, poly: Poly): boolean {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const a = poly[i];
		const b = poly[j];
		if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
			inside = !inside;
		}
	}
	return inside;
}

function segsCross(a: TactilePoint, b: TactilePoint, c: TactilePoint, d: TactilePoint): boolean {
	const o = (p: TactilePoint, q: TactilePoint, r: TactilePoint) =>
		(q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
	const d1 = o(a, b, c);
	const d2 = o(a, b, d);
	const d3 = o(c, d, a);
	const d4 = o(c, d, b);
	return ((d1 > 0) !== (d2 > 0) || Math.abs(d1) < EPS || Math.abs(d2) < EPS) &&
		((d3 > 0) !== (d4 > 0) || Math.abs(d3) < EPS || Math.abs(d4) < EPS) &&
		Math.abs(d1) + Math.abs(d2) + Math.abs(d3) + Math.abs(d4) > EPS;
}

/** Distance from p to the segment ab. */
function pointSegDist(p: TactilePoint, a: TactilePoint, b: TactilePoint): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const l2 = dx * dx + dy * dy;
	const t = l2 < EPS ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function segSegDist(a: TactilePoint, b: TactilePoint, c: TactilePoint, d: TactilePoint): number {
	if (segsCross(a, b, c, d)) return 0;
	return Math.min(
		pointSegDist(a, c, d),
		pointSegDist(b, c, d),
		pointSegDist(c, a, b),
		pointSegDist(d, a, b),
	);
}

/** Closest approach between two open paths. Zero when they cross. */
export function pathDistance(a: Poly, b: Poly): number {
	let best = Infinity;
	for (let i = 0; i + 1 < a.length; ++i) {
		for (let j = 0; j + 1 < b.length; ++j) {
			best = Math.min(best, segSegDist(a[i], a[i + 1], b[j], b[j + 1]));
		}
	}
	return best;
}

/** Closest approach between two marks, each a list of open paths. */
export function markDistance(a: Poly[], b: Poly[]): number {
	let best = Infinity;
	for (const pa of a) for (const pb of b) best = Math.min(best, pathDistance(pa, pb));
	return best;
}

/** True when an OPEN path lies strictly within a closed polygon: every point in, no segment crossing out. */
export function pathInside(path: Poly, outer: Poly): boolean {
	if (!path.every((p) => pointInPoly(p, outer))) return false;
	for (let i = 0; i + 1 < path.length; ++i) {
		for (let j = 0; j < outer.length; ++j) {
			if (segsCross(path[i], path[i + 1], outer[j], outer[(j + 1) % outer.length])) return false;
		}
	}
	return true;
}

/**
 * The largest glyph at a given anchor that fits inside the prototile AND whose whole orbit under the
 * tile group stays disjoint.
 *
 * Both conditions shrink monotonically with the scale — every copy is scaled about its own anchor, and
 * the anchor is inside the tile — so a bisection finds the boundary. Containment only has to be checked
 * for the seed itself: each other copy is the seed's image under a symmetry that maps the tile to
 * itself, so if the seed is inside, all of them are.
 */
function fitAt(tile: Poly, stabilizer: Iso[], plan: SeedPlan): { scale: number; at: (s: number) => Poly[] } {
	const n = tile.length;
	const a = tile[((plan.edge % n) + n) % n];
	const b = tile[((plan.edge % n) + n + 1) % n];
	const c = centroid(tile);

	const on = { x: a.x + (b.x - a.x) * plan.along, y: a.y + (b.y - a.y) * plan.along };
	const anchor = { x: on.x + (c.x - on.x) * plan.inward, y: on.y + (c.y - on.y) * plan.inward };
	// The glyph's long arm runs along the edge, so every copy in the rosette is parallel to the edge it
	// sits against. AL asked for exactly this, and it is also what makes the marks read as a decoration
	// of the tile instead of confetti dropped on it.
	const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
	const frame = compose(translate(anchor.x, anchor.y), rotate(angle));
	const at = (s: number): Poly[] =>
		GLYPH.map((path) => path.map((p) => apply(frame, { x: p.x * s, y: p.y * s })));

	const inset = tile.map((p) => ({
		x: c.x + (p.x - c.x) * SEED_INSET,
		y: c.y + (p.y - c.y) * SEED_INSET,
	}));

	const fits = (s: number): boolean => {
		const seed = at(s);
		if (!seed.every((path) => pathInside(path, inset))) return false;
		// Not "do they cross" but "do they come close". The marks are strokes with real screen width, so
		// two paths that merely miss each other still read as one tangle; require a clear gap scaled to
		// the mark itself.
		const copies = stabilizer.map((g) => seed.map((path) => mapPoly(g, path)));
		const clear = SEED_CLEARANCE * s;
		for (let i = 0; i < copies.length; ++i) {
			for (let j = i + 1; j < copies.length; ++j) {
				if (markDistance(copies[i], copies[j]) < clear) return false;
			}
		}
		return true;
	};

	let hi = 2 * Math.max(...tile.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
	let lo = 0;
	for (let i = 0; i < 24; ++i) {
		const mid = (lo + hi) / 2;
		if (fits(mid)) lo = mid;
		else hi = mid;
	}
	return { scale: lo, at };
}

/**
 * The seed polygon: the anchor that admits the LARGEST mark, at that size less a little slack.
 *
 * Searching the anchor is what separates a readable mark from a speck. A fixed anchor with a fitted
 * size gave IH92 two marks a few pixels across, because its D1 pair sat close together and the only
 * way to keep them apart was to shrink both; moving the anchor apart instead buys back the size. The
 * search runs over one edge unless a type pins one, and its cost is bounded by the tile's five or six
 * sides — this is called once per type, not per frame.
 */
function placeSeed(tile: Poly, stabilizer: Iso[], plan: SeedPlan): Poly[] {
	let best = fitAt(tile, stabilizer, plan);
	let bestScale = best.scale;

	for (let e = 0; e < tile.length; ++e) {
		for (const along of ALONG_CANDIDATES) {
			for (const inward of INWARD_CANDIDATES) {
				const trial = fitAt(tile, stabilizer, { edge: plan.edge + e, along, inward });
				if (trial.scale > bestScale) {
					best = trial;
					bestScale = trial.scale;
				}
			}
		}
	}

	const shortestEdge = Math.min(
		...tile.map((p, i) => {
			const r = tile[(i + 1) % tile.length];
			return Math.hypot(r.x - p.x, r.y - p.y);
		}),
	);
	const share = Math.sqrt(polyArea(tile) / Math.max(1, stabilizer.length));
	return best.at(
		Math.min(bestScale * SEED_SLACK, SEED_MAX_ARM * shortestEdge, SEED_AREA_SHARE * share),
	);
}

/* ------------------------------------------------------------------ the twelve */

export type NetName = "hexagonal" | "rhombille" | "rectangular" | "square" | "tetrakis" | "triangular";

/** Grünbaum–Shephard Table 1 facts, plus the construction that reproduces them. */
export interface MarkedType {
	ih: number;
	/** Column (2), the Laves net the tile belongs to, e.g. "[3^6]". */
	laves: string;
	net: NetName;
	/** Column (3), the induced tile group's name and order, e.g. "D3" and 6. */
	tileGroup: string;
	tileGroupOrder: number;
	/** Column (3), the tile symbol. */
	tileSymbol: string;
	/** Column (4), the adjacency symbol. */
	adjacency: string;
	/** Column (5), the crystallographic group of the MARKED tiling. */
	wallpaper: string;
	/** Column (8), the aspect count; `D`/`R` split dropped where the table gives one. */
	aspects: number;
	/**
	 * One free shape parameter, or null where the tile is rigid. Only the rectangles have one: their
	 * height-to-width ratio is unconstrained, which is the whole freedom these twelve have left.
	 */
	param: { label: string; min: number; max: number; def: number } | null;
	/** Prototile, lattice, generators and seed, as functions of the parameter. */
	build: (param: number) => {
		tile: Poly;
		lattice: Lattice;
		/** Generators of S' modulo its translations. */
		gens: Iso[];
		/** Overrides `DEFAULT_SEED` where the default anchor lands badly. */
		seed?: SeedPlan;
	};
}

/** The equilateral triangle of the [6^3] net, side 1, sitting on the x-axis. */
const UP_TRIANGLE: Poly = [
	{ x: 0, y: 0 },
	{ x: 1, y: 0 },
	{ x: 0.5, y: SQ3 / 2 },
];

/** The [6^3] net's own lattice: two triangles per cell. */
const TRI_LATTICE: Lattice = { t1: { x: 1, y: 0 }, t2: { x: 0.5, y: SQ3 / 2 } };

/**
 * The index-3 sublattice of the triangular lattice, six triangles per cell.
 *
 * IH87 and IH92 both need it: their aspect counts are 6, and tiles-per-cell equals the aspect count,
 * so a cell holding the net's own two triangles cannot carry either type.
 */
const TRI_LATTICE_3: Lattice = { t1: { x: 1.5, y: SQ3 / 2 }, t2: { x: 0, y: SQ3 } };

/** Hexagon centres, one hexagon per cell. Also the rhombille's lattice: three rhombi per cell. */
const HEX_LATTICE: Lattice = { t1: { x: 1.5, y: SQ3 / 2 }, t2: { x: 0, y: SQ3 } };

/** Regular hexagon, circumradius 1, a vertex on +x. */
const HEXAGON: Poly = Array.from({ length: 6 }, (_, k) => ({
	x: Math.cos((k * Math.PI) / 3),
	y: Math.sin((k * Math.PI) / 3),
}));

/**
 * One rhombus of the [3.6.3.6] net: the hexagon at the origin split from its centre to three alternate
 * vertices. 120° corners at the hexagon centre and at W1; 60° corners at W0 and W2, which are the
 * net's six-valent vertices.
 */
const RHOMBUS: Poly = [
	{ x: 0, y: 0 },
	HEXAGON[0],
	HEXAGON[1],
	HEXAGON[2],
];

/** One tile of the [4.8^2] net: the unit square's south quarter, cut by both diagonals. */
const TETRAKIS: Poly = [
	{ x: 0.5, y: 0.5 },
	{ x: 0, y: 0 },
	{ x: 1, y: 0 },
];

const rect = (w: number, h: number): Poly => [
	{ x: 0, y: 0 },
	{ x: w, y: 0 },
	{ x: w, y: h },
	{ x: 0, y: h },
];

const RATIO = { label: "height / width", min: 0.35, max: 1.6, def: 0.68 } as const;

export const MARKED: MarkedType[] = [
	{
		ih: 19,
		laves: "[3^6]",
		net: "hexagonal",
		tileGroup: "D3",
		tileGroupOrder: 6,
		tileSymbol: "a+a-a+a-a+a-",
		adjacency: "a-",
		wallpaper: "p3m1",
		aspects: 1,
		param: null,
		// The regular hexagon of IH20, with p6m cut to p3m1: the surviving mirrors run through opposite
		// VERTICES, which is what the table's D3^1 means, and the six marks per tile are what stops the
		// picture from being IH20 again.
		build: () => ({
			tile: HEXAGON,
			lattice: HEX_LATTICE,
			gens: [rotate(120), reflect(0)],
		}),
	},
	{
		ih: 35,
		laves: "[3.6.3.6]",
		net: "rhombille",
		tileGroup: "D1",
		tileGroupOrder: 2,
		tileSymbol: "a+b+b-a-",
		adjacency: "a-b-",
		wallpaper: "p3m1",
		aspects: 3,
		param: null,
		// The rhombus keeps ONE of its two diagonal mirrors, and which one decides the type. The SHORT
		// diagonal, joining the two 120° corners, gives p3m1 and is IH35; the long diagonal through the
		// six-valent corners gives p31m, which is IH36 and already renders from Tactile. Nothing else
		// separates the two — same tile, same net, same D1, same three aspects — so the wallpaper
		// assertion in the test is the only thing standing between this file and drawing IH36 twice. It
		// caught the long diagonal on the first run.
		build: () => ({
			tile: RHOMBUS,
			lattice: HEX_LATTICE,
			gens: [rotate(120, 1, 0), reflect(60)],
		}),
	},
	{
		ih: 48,
		laves: "[4^4]",
		net: "rectangular",
		tileGroup: "E",
		tileGroupOrder: 1,
		tileSymbol: "a+b+c+d+",
		adjacency: "a-b-c-d-",
		wallpaper: "pmm",
		aspects: 4,
		param: { ...RATIO },
		// Every edge of the rectangle is on a mirror, and none of the mirrors cuts through the tile, so
		// nothing fixes it: the tile group is trivial and one mark per tile is the whole decoration. The
		// lattice is twice the tile in each direction, which is what makes the four mirror images four
		// distinct aspects instead of one.
		build: (h) => ({
			tile: rect(1, h),
			lattice: { t1: { x: 2, y: 0 }, t2: { x: 0, y: 2 * h } },
			gens: [reflect(90), reflect(0)],
		}),
	},
	{
		ih: 60,
		laves: "[4^4]",
		net: "rectangular",
		tileGroup: "C2",
		tileGroupOrder: 2,
		tileSymbol: "a+b+a+b+",
		adjacency: "a-b-",
		wallpaper: "cmm",
		aspects: 2,
		param: { ...RATIO },
		// cmm's centred lattice is the point: the translation (1, h) is what makes the tile's own 180°
		// turn a symmetry of the marked tiling while both mirrors of the rectangle stay out of the group.
		build: (h) => ({
			tile: rect(1, h),
			lattice: { t1: { x: 2, y: 0 }, t2: { x: 1, y: h } },
			gens: [reflect(90), reflect(0)],
		}),
	},
	{
		ih: 63,
		laves: "[4^4]",
		net: "square",
		tileGroup: "C4",
		tileGroupOrder: 4,
		tileSymbol: "a+a+a+a+",
		adjacency: "a-",
		wallpaper: "p4g",
		aspects: 2,
		param: null,
		// Four marks per tile in a pinwheel, and the neighbouring square's pinwheel spins the other way.
		// The diagonal lattice is what makes that checkerboard periodic, and putting the four-fold centres
		// off the mirrors is exactly what separates p4g from p4m.
		build: () => ({
			tile: rect(1, 1),
			lattice: { t1: { x: 1, y: 1 }, t2: { x: 1, y: -1 } },
			gens: [rotate(90, 0.5, 0.5), reflect(90)],
		}),
	},
	{
		ih: 65,
		laves: "[4^4]",
		net: "rectangular",
		tileGroup: "D1",
		tileGroupOrder: 2,
		tileSymbol: "ab+cb-",
		adjacency: "ab-c",
		wallpaper: "pmm",
		aspects: 2,
		param: { ...RATIO },
		// The table's D1^2: the surviving mirror runs through opposite EDGE midpoints, here the vertical
		// bisector, so the tile's two side edges swap and its top and bottom stay distinct. The lattice is
		// one tile wide and two tall, which keeps the horizontal bisector out of the group.
		build: (h) => ({
			tile: rect(1, h),
			lattice: { t1: { x: 1, y: 0 }, t2: { x: 0, y: 2 * h } },
			gens: [reflect(90, 0.5, 0), reflect(0)],
		}),
	},
	{
		ih: 70,
		laves: "[4^4]",
		net: "square",
		tileGroup: "D1",
		tileGroupOrder: 2,
		tileSymbol: "a+b+b-a-",
		adjacency: "a-b-",
		wallpaper: "p4m",
		aspects: 4,
		param: null,
		// The table's D1^1: the mirror runs through opposite VERTICES, so it is the square's main diagonal.
		// Doubling the lattice in both directions keeps the anti-diagonal and the four-fold centre out.
		build: () => ({
			tile: rect(1, 1),
			lattice: { t1: { x: 2, y: 0 }, t2: { x: 0, y: 2 } },
			gens: [rotate(90), reflect(45)],
		}),
	},
	{
		ih: 75,
		laves: "[4^4]",
		net: "square",
		tileGroup: "D2",
		tileGroupOrder: 4,
		tileSymbol: "a+a-a+a-",
		adjacency: "a-",
		wallpaper: "p4m",
		aspects: 2,
		param: null,
		// Both diagonals survive as mirrors — that is the table's D2^1 — but the four-fold turn at the
		// square's centre does not, so four marks make a tile with exactly D2 and the type is not the
		// plain square tiling.
		build: () => ({
			tile: rect(1, 1),
			lattice: { t1: { x: 1, y: 1 }, t2: { x: 1, y: -1 } },
			gens: [rotate(90), reflect(45)],
		}),
	},
	{
		ih: 80,
		laves: "[4.8^2]",
		net: "tetrakis",
		tileGroup: "E",
		tileGroupOrder: 1,
		tileSymbol: "a+b+c+",
		adjacency: "a-b-c-",
		wallpaper: "p4m",
		aspects: 8,
		param: null,
		// The same p4m as IH75, over the finer net: the tile is now a quarter of the square, and the
		// triangle's own axis (x = 1/2) is not one of the group's mirrors, so nothing fixes it. Eight
		// aspects, one mark each.
		build: () => ({
			tile: TETRAKIS,
			lattice: { t1: { x: 1, y: 1 }, t2: { x: 1, y: -1 } },
			gens: [rotate(90), reflect(45)],
		}),
	},
	{
		ih: 87,
		laves: "[6^3]",
		net: "triangular",
		tileGroup: "E",
		tileGroupOrder: 1,
		tileSymbol: "a+b+c+",
		adjacency: "a-b-c-",
		wallpaper: "p3m1",
		aspects: 6,
		param: null,
		// Mirrors along the triangle EDGE lines, not its altitudes: an altitude would fix the tile and
		// leave D1 where the type wants E. Six aspects means six triangles per cell, so the lattice is the
		// index-3 one.
		build: () => ({
			tile: UP_TRIANGLE,
			lattice: TRI_LATTICE_3,
			gens: [rotate(120), reflect(0)],
		}),
	},
	{
		ih: 89,
		laves: "[6^3]",
		net: "triangular",
		tileGroup: "C3",
		tileGroupOrder: 3,
		tileSymbol: "a+a+a+",
		adjacency: "a-",
		wallpaper: "p31m",
		aspects: 2,
		param: null,
		// Three marks in a pinwheel about the triangle's centroid, mirrored on the down-triangles. The
		// three-fold turn is about the centroid and the mirrors run along the edge lines, which do not
		// pass through it — that offset is what makes this p31m rather than p3m1.
		build: () => ({
			tile: UP_TRIANGLE,
			lattice: TRI_LATTICE,
			gens: [rotate(120, 0.5, SQ3 / 6), reflect(0)],
		}),
	},
	{
		ih: 92,
		laves: "[6^3]",
		net: "triangular",
		tileGroup: "D1",
		tileGroupOrder: 2,
		tileSymbol: "ab+b-",
		adjacency: "ab-",
		wallpaper: "p6m",
		aspects: 6,
		param: null,
		// Full p6m, but with the six-fold centres on only a third of the net's vertices. The triangle then
		// keeps one altitude as a mirror and loses its three-fold turn, which is the D1 the table asks for.
		build: () => ({
			tile: UP_TRIANGLE,
			lattice: TRI_LATTICE_3,
			gens: [rotate(60), reflect(30)],
		}),
	},
];

const BY_IH = new Map(MARKED.map((t) => [t.ih, t]));

export function markedType(ih: number): MarkedType | undefined {
	return BY_IH.get(ih);
}

export const MARKED_IH: readonly number[] = MARKED.map((t) => t.ih);

/* ------------------------------------------------------------------ the built tiling */

export interface MarkedGroup {
	/** Every coset of the translation lattice: the finite group S'/T. */
	cosets: Iso[];
	/** The distinct tiles in one lattice cell — one per aspect, by construction. */
	tiles: Poly[];
	/** One glyph per coset, so |I(T)| of them land in each tile. */
	/** One mark per coset. `paths` are the F's two open polylines, already placed in the plane. */
	glyphs: { paths: Poly[]; orientation: number; reflected: boolean }[];
	/** The subgroup of S' that fixes the prototile: the induced tile group I(T). */
	stabilizer: Iso[];
	lattice: Lattice;
	tile: Poly;
}

/**
 * Build one marked type's group, tiles and marks.
 *
 * The contract the whole file rests on: because the seed glyph is asymmetric and sits in general
 * position, distinct cosets place distinct glyphs, so the symmetry group of the resulting mark set is
 * exactly S' and not some larger group that happened to preserve it. `marked.test.ts` checks the
 * "distinct" half directly; the "not larger" half follows from it.
 */
export function markedGroup(type: MarkedType, param?: number): MarkedGroup {
	const p = param ?? type.param?.def ?? 0;
	const { tile, lattice, gens, seed } = type.build(p);
	const cosets = closeGroup(lattice, gens);

	const stabilizer = stabilizerOf(cosets, lattice, tile);
	const seedShape = placeSeed(tile, stabilizer, { ...DEFAULT_SEED, ...seed });

	/**
	 * One representative coset per tile, then that representative's whole rosette.
	 *
	 * Not `cosets.map(...)`, which is the obvious version and is wrong to draw. `closeGroup` hands back
	 * representatives with their translations reduced into the cell, so two cosets carrying the tile to
	 * the SAME tile of the tiling can still land it in different cells; deduping the tiles keeps one of
	 * those and throws the other's position away. Mapping the seed by every coset then leaves some marks
	 * sitting where the cell draws no tile at all. The union over the lattice is still correct, but the
	 * paint order is not: the tile that belongs under such a mark arrives with a LATER instance and
	 * covers its fill, leaving only the stroke. That is the hollow mark in every IH89 rosette.
	 *
	 * Anchoring each rosette to its own tile's representative fixes it. A tile's marks are its
	 * representative composed with the stabilizer, so every mark is inside the tile drawn just before it,
	 * in the same instance, and the mark set is still exactly one glyph per coset.
	 */
	const seen = new Set<string>();
	const tiles: Poly[] = [];
	const glyphs: MarkedGroup["glyphs"] = [];
	for (const g of cosets) {
		const poly = mapPoly(g, tile);
		const key = tileKey(lattice, poly);
		if (seen.has(key)) continue;
		seen.add(key);
		tiles.push(poly);
		for (const s of stabilizer) {
			const gs = compose(g, s);
			glyphs.push({
				paths: seedShape.map((path) => mapPoly(gs, path)),
				orientation: orientationDeg(gs),
				reflected: isReflected(gs),
			});
		}
	}

	return { cosets, tiles, glyphs, stabilizer, lattice, tile };
}

/* ------------------------------------------------------------------ drawable cell */

/** Hue step between the aspects' tints, so neighbouring tiles read apart. */
const TILE_TINT_STEP = 26;

/**
 * The marks are ink, not colour.
 *
 * They were briefly hue-coded by orientation — AL's colour-wheel idea, applied per mark — and it was
 * redundant twice over. The mark's SHAPE already carries everything the hue did: which way the L points
 * is the rotation, which way it is handed is the reflection, and both are read faster from a shape than
 * from a colour. Above that, the tile tint already separates the aspects, and an aspect IS an
 * orientation class, so the per-mark hue only distinguished copies inside one rosette — copies that are
 * equivalent by definition and have nothing worth telling apart.
 *
 * What it cost was real: two colour scales competing in one picture, which made the aspect tints harder
 * to read, and a channel that vanishes in greyscale and for red-green colour blindness, so it could
 * never have been the thing carrying the meaning. G&S and Kaplan both draw a flat motif on a tinted
 * tile; this does the same. Negative hue is the renderers' ink sentinel — see INK_FILL.
 */
const MARK_INK = -1;

export interface MarkedCell {
	polygons: RawPolygon[];
	v1: [number, number];
	v2: [number, number];
	tile: Poly;
	tiles: Poly[];
	glyphCount: number;
	stabilizerOrder: number;
	period: number;
}

/**
 * One translational cell of a marked tiling: the net's tiles, then the marks on top.
 *
 * Marks come last in the list because `buildIsohedralCellMesh` emits triangles in order and the flat
 * renderer draws them with no depth test, so list order IS paint order. The tiles are tinted on the
 * atlas' by-side-count ramp, stepped per aspect; each mark takes its hue from its own orientation, so
 * a tile's rosette reads as a colour wheel and two tiles related by a 90° turn sit a quarter of the
 * wheel apart.
 */
export function buildMarkedCell(ih: number, param?: number): MarkedCell | null {
	const type = markedType(ih);
	if (!type) return null;

	const group = markedGroup(type, param);
	const baseHue = polygonHue(type.build(param ?? type.param?.def ?? 0).tile.length);

	const polygons: RawPolygon[] = group.tiles.map((poly, i) => ({
		n: poly.length,
		vertices: poly,
		hue: (baseHue + i * TILE_TINT_STEP) % 360,
	}));

	for (const g of group.glyphs) {
		for (const path of g.paths) {
			polygons.push({ n: path.length, vertices: path, hue: MARK_INK, open: true });
		}
	}

	const { t1, t2 } = group.lattice;
	const det = Math.abs(t1.x * t2.y - t1.y * t2.x);

	return {
		polygons,
		v1: [t1.x, t1.y],
		v2: [t2.x, t2.y],
		tile: group.tile,
		tiles: group.tiles,
		glyphCount: group.glyphs.length,
		stabilizerOrder: group.stabilizer.length,
		period: Math.sqrt(det),
	};
}

/* ------------------------------------------------------------------ verification helpers */

/**
 * The wallpaper group of a finite coset set, recomputed from the geometry.
 *
 * Only the seven names the twelve types use are distinguished, which is all that has to be right here.
 * The two hard calls are the ones the table would otherwise be trusted on:
 *
 *   p3m1 vs p31m — whether EVERY three-fold centre lies on a mirror. IH35 and IH36 differ by nothing
 *                  else, so without this the rhombus's two diagonals are interchangeable and the
 *                  construction could quietly be IH36.
 *   p4m  vs p4g  — whether the four-fold centres lie on mirrors.
 *   pmm  vs cmm  — whether every two-fold centre lies on a mirror. cmm's centred lattice puts half of
 *                  them off, which is exactly what IH60 needs.
 */
export function classifyWallpaper(lat: Lattice, cosets: Iso[]): string {
	/**
	 * Cosets are not enough. A single coset of a rotation contains rotations about MANY centres — one
	 * for every lattice translate, spread over c + (I−L)⁻¹Λ, which is finer than c + Λ — and the
	 * reduced representative shows only one of them. Classifying off representatives alone put IH60's
	 * two-fold centre at the origin, where the mirrors cross, and called cmm pmm. So expand each coset
	 * over a small block of translations and work with actual isometries.
	 */
	const elements: Iso[] = [];
	for (const g of cosets) {
		for (let i = -2; i <= 2; ++i) {
			for (let j = -2; j <= 2; ++j) {
				elements.push(compose(translate(i * lat.t1.x + j * lat.t2.x, i * lat.t1.y + j * lat.t2.y), g));
			}
		}
	}

	const rotOrder = (m: Iso): number => {
		if (isReflected(m)) return 0;
		const deg = orientationDeg(m);
		for (const n of [1, 2, 3, 4, 6]) {
			if (Math.abs(((deg / (360 / n)) % 1) * (360 / n)) < 1e-4 && Math.abs(deg % (360 / n)) < 1e-4) {
				return n;
			}
		}
		return 1;
	};

	const mirrors: { angle: number; px: number; py: number }[] = [];
	// A reflection's axis: the fixed-point line. Take the midpoint of p and m(p) for two probes.
	for (const m of elements) {
		if (!isReflected(m)) continue;
		const a = { x: 0, y: 0 };
		const b = { x: 1, y: 0 };
		const ma = apply(m, a);
		const mb = apply(m, b);
		const p1 = { x: (a.x + ma.x) / 2, y: (a.y + ma.y) / 2 };
		const p2 = { x: (b.x + mb.x) / 2, y: (b.y + mb.y) / 2 };
		// The two midpoints both lie on the axis unless they coincide, which happens only for a glide.
		if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < EPS) continue;
		// A glide's midpoints also lie on the axis, so distinguish by testing that m really fixes p1.
		const fx = apply(m, p1);
		if (Math.hypot(fx.x - p1.x, fx.y - p1.y) > 1e-6) continue;
		mirrors.push({ angle: Math.atan2(p2.y - p1.y, p2.x - p1.x), px: p1.x, py: p1.y });
	}

	const onSomeMirror = (cx: number, cy: number): boolean =>
		mirrors.some(
			(L) => Math.abs((cx - L.px) * Math.sin(L.angle) - (cy - L.py) * Math.cos(L.angle)) < 1e-6,
		);

	const centreOf = (m: Iso): TactilePoint | null => {
		// Solve (I - L) c = t for the rotation centre.
		const a = 1 - m[0];
		const b = -m[1];
		const c = -m[3];
		const d = 1 - m[4];
		const det = a * d - b * c;
		if (Math.abs(det) < EPS) return null;
		return { x: (d * m[2] - b * m[5]) / det, y: (a * m[5] - c * m[2]) / det };
	};

	let maxRot = 1;
	const centres: { n: number; p: TactilePoint }[] = [];
	for (const m of elements) {
		const n = rotOrder(m);
		if (n <= 1) continue;
		maxRot = Math.max(maxRot, n);
		const p = centreOf(m);
		if (p) centres.push({ n, p });
	}

	const hasMirror = mirrors.length > 0;
	if (!hasMirror) return maxRot === 6 ? "p6" : maxRot === 4 ? "p4" : maxRot === 3 ? "p3" : maxRot === 2 ? "p2" : "p1";

	if (maxRot === 6) return "p6m";
	if (maxRot === 4) {
		const four = centres.filter((c) => c.n === 4);
		return four.every((c) => onSomeMirror(c.p.x, c.p.y)) ? "p4m" : "p4g";
	}
	if (maxRot === 3) {
		const three = centres.filter((c) => c.n === 3);
		return three.every((c) => onSomeMirror(c.p.x, c.p.y)) ? "p3m1" : "p31m";
	}
	if (maxRot === 2) {
		const two = centres.filter((c) => c.n === 2);
		return two.every((c) => onSomeMirror(c.p.x, c.p.y)) ? "pmm" : "cmm";
	}
	return "cm";
}

/** Total tile area in one cell, for the "these really do tile the cell" check. */
export function tiledArea(tiles: Poly[]): number {
	return tiles.reduce((a, t) => a + polyArea(t), 0);
}

export { polyArea, centroid, polyKey, mapPoly, placeSeed, GLYPH };
