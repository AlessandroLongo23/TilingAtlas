/**
 * Offline derivation of each pentagon type's translational unit. Run once; the app never searches.
 *
 *   pnpm tsx scripts/derive-pentagon-units.ts [typeIds...]
 *
 * Writes progress synchronously to experiments/results/pentagon-units.txt, and the derived recipes to
 * lib/pentagon/assemblies.json, which lib/pentagon/assembly.ts imports. Re-run to regenerate.
 *
 * PROVENANCE. Nothing here is transcribed from another implementation. Kit Wallace's OpenSCAD library
 * (github.com/KitWallace/openscad/pentagonal-tiles) is the only complete public encoding of all 15 and
 * it carries NO LICENCE, so it is all-rights-reserved and was not read into this code. The search below
 * derives each unit from the pentagon alone. The tiles-per-unit column it is checked against
 * (2,4,3,4,6,4,8,8,8,6,8,8,8,6,12) is an independently published fact, in Wikipedia's per-type
 * primitive-unit captions and in Schattschneider 1978.
 *
 * METHOD. Backtracking growth over vertex gaps:
 *
 *   1. Seed one tile at the identity.
 *   2. Find the incomplete vertex (covered angle < 360°) nearest the origin. Nearest, not any, because
 *      a search that wanders outward grows a strip, and a strip's same-orientation copies are all
 *      collinear, so no lattice can be read off it.
 *   3. Enumerate placements that touch that vertex, by aligning one endpoint of one edge of a fresh
 *      (optionally mirrored) copy onto one endpoint of one edge of a tile already touching it.
 *   4. Reject overlaps by SAT, which is exact for convex polygons, and reject any vertex whose covered
 *      angle would exceed 360°.
 *   5. Recurse; backtrack on a dead end.
 *
 * Greedy does not work: without backtracking the growth wedges after a handful of tiles on every type.
 *
 * The endpoint-alignment generator is what makes T-junctions reachable, and they are mandatory. Types
 * 10 to 13 have conditions (a = b = c + e, 2a + c = d, 2a = d = c + e, d = 2a = 2e) that literally say
 * one tile's long edge is covered by two neighbours' short edges. An edge-to-edge-only generator cannot
 * assemble them at all.
 */

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PENTAGON_TYPES, type PentagonType } from "../lib/pentagon/types";
import { area, solvePentagon, type Point } from "../lib/pentagon/solve";
import { assembleUnit, placeTile, type Assembly, type Glue } from "../lib/pentagon/assembly";

const LOG = resolve(process.cwd(), "experiments/results/pentagon-units.txt");

const EPS = 1e-7;
/** Quantisation for identifying coincident points. Well below any real feature, well above fp noise. */
const Q = 1e6;

function log(line: string) {
	process.stdout.write(line + "\n");
	appendFileSync(LOG, line + "\n");
}

// ---------------------------------------------------------------------------- geometry

type Mat = [number, number, number, number, number, number]; // a b c / d e f

const apply = (m: Mat, p: Point): Point => ({
	x: m[0] * p.x + m[1] * p.y + m[2],
	y: m[3] * p.x + m[4] * p.y + m[5],
});

const key = (p: Point) => `${Math.round(p.x * Q)},${Math.round(p.y * Q)}`;

function centroid(pts: Point[]): Point {
	let x = 0;
	let y = 0;
	for (const p of pts) {
		x += p.x;
		y += p.y;
	}
	return { x: x / pts.length, y: y / pts.length };
}

/** Exact for convex polygons. Shared edges and touching corners are not overlaps. */
function overlaps(A: Point[], B: Point[]): boolean {
	for (const poly of [A, B]) {
		for (let i = 0; i < poly.length; i++) {
			const p = poly[i];
			const q = poly[(i + 1) % poly.length];
			const nx = -(q.y - p.y);
			const ny = q.x - p.x;
			let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
			for (const v of A) {
				const d = nx * v.x + ny * v.y;
				if (d < aMin) aMin = d;
				if (d > aMax) aMax = d;
			}
			for (const v of B) {
				const d = nx * v.x + ny * v.y;
				if (d < bMin) bMin = d;
				if (d > bMax) bMax = d;
			}
			const scale = Math.hypot(nx, ny) || 1;
			if (aMax < bMin + EPS * scale || bMax < aMin + EPS * scale) return false; // separating axis
		}
	}
	return true;
}

interface Placed {
	pts: Point[];
	m: Mat;
	mirror: boolean;
	/** How this tile was placed, for emitting the recipe. Null for the seed. */
	via: Glue | null;
	/** Cached for the broad phase and the duplicate check, both inner loops of the search. */
	bbox: [number, number, number, number];
	tk: string;
}

/**
 * Where a placement puts the prototile.
 *
 * The new tile's chosen edge endpoint lands on the ref tile's chosen edge endpoint, and the new edge
 * runs ANTIPARALLEL to the ref edge, which is what puts the two tiles on opposite sides of the shared
 * line. Mirroring flips the copy first; the antiparallel rule is applied afterwards either way, so the
 * generator covers both handednesses.
 */
/** Placement is the shared runtime implementation, so a derived recipe replays identically. */
function placement(proto: Point[], ref: Placed, g: Glue): Point[] | null {
	return placeTile(proto, ref.pts, g);
}

// ------------------------------------------------------------------- vertex bookkeeping

interface VertexInfo {
	p: Point;
	covered: number;
	tiles: number[];
}

/**
 * Covered angle at every distinct point of the patch. A tile contributes its interior angle when the
 * point is one of its corners, and 180° when the point lies strictly inside one of its edges, which is
 * how T-junctions are accounted for.
 */
function vertexTable(tiles: Placed[]): Map<string, VertexInfo> {
	const table = new Map<string, VertexInfo>();
	const seen = new Set<string>();
	for (const t of tiles) for (const p of t.pts) seen.add(key(p));

	const pointOf = new Map<string, Point>();
	for (const t of tiles) for (const p of t.pts) if (!pointOf.has(key(p))) pointOf.set(key(p), p);

	for (const [k, p] of pointOf) {
		let covered = 0;
		const touching: number[] = [];
		tiles.forEach((t, ti) => {
			let hit = false;
			for (let i = 0; i < 5; i++) {
				if (key(t.pts[i]) === k) {
					const prev = t.pts[(i + 4) % 5];
					const next = t.pts[(i + 1) % 5];
					// Interior angle of a CCW ring is measured from the NEXT corner round to the PREVIOUS
					// one. Taking it the other way round yields 360 − interior, which reads as every
					// vertex being nearly full and rejects every placement.
					const a1 = Math.atan2(next.y - p.y, next.x - p.x);
					const a2 = Math.atan2(prev.y - p.y, prev.x - p.x);
					let d = a2 - a1;
					while (d <= 0) d += 2 * Math.PI;
					while (d > 2 * Math.PI) d -= 2 * Math.PI;
					covered += d;
					hit = true;
					break;
				}
			}
			if (!hit) {
				// Strictly interior to an edge?
				for (let i = 0; i < 5; i++) {
					const a = t.pts[i];
					const b = t.pts[(i + 1) % 5];
					const ab = Math.hypot(b.x - a.x, b.y - a.y);
					if (ab < EPS) continue;
					const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
					if (Math.abs(cross) / ab > 1e-6) continue;
					const dot = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (ab * ab);
					if (dot > 1e-6 && dot < 1 - 1e-6) {
						covered += Math.PI;
						hit = true;
						break;
					}
				}
			}
			if (hit) touching.push(ti);
		});
		table.set(k, { p, covered, tiles: touching });
	}
	void seen;
	return table;
}

/**
 * The angle one tile contributes at a point: its interior angle if the point is a corner, 180° if the
 * point lies strictly inside one of its edges (a T-junction), and 0 otherwise.
 *
 * Split out of `vertexTable` so a candidate can be scored INCREMENTALLY. Rebuilding the whole table
 * per candidate is O(tiles²) each, and with ~1000 candidates a node that is O(tiles²·1000); on the
 * 48-tile types it stopped the search dead. Only the points the new tile actually touches can change.
 */
function contribAt(pts: Point[], p: Point): number {
	for (let i = 0; i < 5; i++) {
		if (key(pts[i]) === key(p)) {
			const prev = pts[(i + 4) % 5];
			const next = pts[(i + 1) % 5];
			const a1 = Math.atan2(next.y - p.y, next.x - p.x);
			const a2 = Math.atan2(prev.y - p.y, prev.x - p.x);
			let d = a2 - a1;
			while (d <= 0) d += 2 * Math.PI;
			while (d > 2 * Math.PI) d -= 2 * Math.PI;
			return d;
		}
	}
	for (let i = 0; i < 5; i++) {
		const a = pts[i];
		const b = pts[(i + 1) % 5];
		const ab = Math.hypot(b.x - a.x, b.y - a.y);
		if (ab < EPS) continue;
		const cr = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
		if (Math.abs(cr) / ab > 1e-6) continue;
		const dt = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (ab * ab);
		if (dt > 1e-6 && dt < 1 - 1e-6) return Math.PI;
	}
	return 0;
}

/** Axis-aligned bounds, for rejecting far-apart tiles before running SAT on them. */
function bboxOf(pts: Point[]): [number, number, number, number] {
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
	for (const p of pts) {
		if (p.x < x0) x0 = p.x;
		if (p.x > x1) x1 = p.x;
		if (p.y < y0) y0 = p.y;
		if (p.y > y1) y1 = p.y;
	}
	return [x0, y0, x1, y1];
}

function bboxHit(a: [number, number, number, number], b: [number, number, number, number]): boolean {
	return !(a[2] < b[0] - EPS || b[2] < a[0] - EPS || a[3] < b[1] - EPS || b[3] < a[1] - EPS);
}

const FULL = 2 * Math.PI;

// ------------------------------------------------------------------------- the search

interface SearchResult {
	tiles: Placed[];
	nodes: number;
}

function grow(proto: Point[], target: number, nodeCap: number): SearchResult | null {
	const seed: Placed = {
		pts: proto,
		m: [1, 0, 0, 0, 1, 0],
		mirror: false,
		via: null,
		bbox: bboxOf(proto),
		tk: proto.map(key).sort().join("|"),
	};
	let nodes = 0;

	const dfs = (tiles: Placed[]): Placed[] | null => {
		if (tiles.length >= target) return tiles;
		if (++nodes > nodeCap) return null;

		const table = vertexTable(tiles);
		// Nearest incomplete vertex first, most-covered to break ties. Distance has to be the PRIMARY key:
		// ordering by covered angle first grows whichever tongue happens to be most constrained, which
		// runs off in one direction and leaves a strip. Every same-orientation pair in a strip is
		// collinear, so no two candidate periods are independent and the lattice search sees nothing to
		// work with (types 2, 6 and 15 each produced exactly zero usable pairs that way). Growing in
		// rings from the origin keeps the patch two-dimensional.
		let best: VertexInfo | null = null;
		let bestD = Infinity;
		for (const info of table.values()) {
			if (info.covered > FULL - 1e-6) continue;
			const d = Math.hypot(info.p.x, info.p.y);
			if (!best || d < bestD - 1e-9 || (Math.abs(d - bestD) < 1e-9 && info.covered > best.covered)) {
				best = info;
				bestD = d;
			}
		}
		if (!best) return tiles; // fully closed patch, nothing left to grow

		const cands: Placed[] = [];
		const seenT = new Set<string>();
		for (const ti of best.tiles) {
			const ref = tiles[ti];
			for (let refEdge = 0; refEdge < 5; refEdge++) {
				for (const refEnd of [0, 1] as const) {
					for (let newEdge = 0; newEdge < 5; newEdge++) {
						for (const newEnd of [0, 1] as const) {
							for (const mirror of [false, true]) {
								const g: Glue = { ref: ti, refEdge, refEnd, newEdge, newEnd, mirror };
								const pts = placement(proto, ref, g);
								if (!pts) continue;
								// Must actually touch the target vertex, or it is not filling this gap.
								if (!pts.some((p) => key(p) === key(best!.p))) {
									// Allow the vertex to fall strictly inside one of the new tile's edges.
									let onEdge = false;
									for (let i = 0; i < 5 && !onEdge; i++) {
										const a = pts[i];
										const b = pts[(i + 1) % 5];
										const ab = Math.hypot(b.x - a.x, b.y - a.y);
										if (ab < EPS) continue;
										const cr =
											(b.x - a.x) * (best!.p.y - a.y) - (b.y - a.y) * (best!.p.x - a.x);
										if (Math.abs(cr) / ab > 1e-6) continue;
										const dt =
											((best!.p.x - a.x) * (b.x - a.x) + (best!.p.y - a.y) * (b.y - a.y)) /
											(ab * ab);
										if (dt > 1e-6 && dt < 1 - 1e-6) onEdge = true;
									}
									if (!onEdge) continue;
								}
								const tk = pts.map(key).sort().join("|");
								if (seenT.has(tk)) continue;
								const bb = bboxOf(pts);
								// Broad phase first: SAT against every placed tile is the inner loop of the whole
								// search, and most pairs are nowhere near each other.
								let clash = false;
								for (let ti2 = 0; ti2 < tiles.length && !clash; ti2++) {
									const other = tiles[ti2];
									if (!bboxHit(bb, other.bbox)) continue;
									if (other.tk === tk) clash = true;
									else if (overlaps(other.pts, pts)) clash = true;
								}
								if (clash) continue;
								seenT.add(tk);
								cands.push({ pts, m: [1, 0, 0, 0, 1, 0], mirror, via: g, bbox: bb, tk });
							}
						}
					}
				}
			}
		}

		// Closest-to-origin placements first, then the ones that close the target vertex furthest. Same
		// reason as the vertex ordering above: pull the patch inward, not outward.
		const scored = cands.map((c) => {
			// Only points the new tile touches can change: its own five corners, plus any existing vertex
			// falling on one of its edges. Everything else keeps the coverage the table already recorded.
			let bad = false;
			const affected = new Map<string, { p: Point; base: number }>();
			for (const q of c.pts) {
				const k = key(q);
				if (affected.has(k)) continue;
				const known = table.get(k);
				// A corner landing inside an existing edge is not in the table, so its base has to be
				// summed over the placed tiles. Five points, so this stays cheap.
				const base =
					known?.covered ?? tiles.reduce((acc, t) => acc + contribAt(t.pts, q), 0);
				affected.set(k, { p: q, base });
			}
			for (const [k, info] of table) {
				if (affected.has(k)) continue;
				if (contribAt(c.pts, info.p) > 0) affected.set(k, { p: info.p, base: info.covered });
			}
			let score = 0;
			for (const [k, { p, base }] of affected) {
				const total = base + contribAt(c.pts, p);
				if (total > FULL + 1e-6) bad = true;
				if (k === key(best!.p)) score = total;
			}
			const cc = centroid(c.pts);
			return { c, score, dist: Math.hypot(cc.x, cc.y), bad };
		});
		scored.sort((a, b) => a.dist - b.dist || b.score - a.score);

		for (const { c, bad } of scored) {
			if (bad) continue;
			const out = dfs([...tiles, c]);
			if (out) return out;
		}
		return null;
	};

	const out = dfs([seed]);
	return out ? { tiles: out, nodes } : null;
}

// -------------------------------------------------------------------- lattice extraction

/** The linear part of the isometry that carries the seed onto this tile, as a rounded signature. */
function orientKey(proto: Point[], t: Placed): string {
	// Two corresponding edge vectors determine the linear part.
	const p0 = proto[0];
	const p1 = proto[1];
	const q0 = t.pts[0];
	const q1 = t.pts[1];
	const a = Math.atan2(q1.y - q0.y, q1.x - q0.x) - Math.atan2(p1.y - p0.y, p1.x - p0.x);
	const orient =
		(t.pts[1].x - t.pts[0].x) * (t.pts[2].y - t.pts[1].y) -
		(t.pts[1].y - t.pts[0].y) * (t.pts[2].x - t.pts[1].x);
	return `${Math.round(Math.cos(a) * 1e4)},${Math.round(Math.sin(a) * 1e4)},${orient > 0 ? 1 : -1}`;
}

/**
 * Candidate translation vectors: differences between tiles of the same orientation and handedness.
 *
 * Deliberately permissive. Deciding here which vectors are genuine periods needs a notion of "inside
 * the patch", and the growth heuristic makes an irregular blob, so any radius-based core test throws
 * away good candidates (it rejected every one on types 3, 4 and 5). The real filter is `tryLattice`
 * below, whose area-plus-SAT test is a proof rather than a heuristic.
 */
interface Candidate {
	v: Point;
	/** The same-orientation pair whose centroids differ by `v`. Carried so the emitted lattice can be
	 *  written as a corner difference between two tiles that actually exist in the patch. */
	from: number;
	to: number;
}

function candidateVectors(proto: Point[], tiles: Placed[]): Candidate[] {
	const okey = tiles.map((t) => orientKey(proto, t));
	const cents = tiles.map((t) => centroid(t.pts));
	const out: Candidate[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < tiles.length; i++) {
		for (let j = 0; j < tiles.length; j++) {
			if (i === j || okey[i] !== okey[j]) continue;
			const t = { x: cents[j].x - cents[i].x, y: cents[j].y - cents[i].y };
			if (Math.hypot(t.x, t.y) < EPS) continue;
			if (seen.has(key(t))) continue;
			seen.add(key(t));
			out.push({ v: t, from: i, to: j });
		}
	}
	return out;
}

/**
 * Does this lattice actually tile? Area plus SAT, which together are a proof.
 *
 * No two tiles of the unit overlap, at any lattice offset, AND the unit's total area equals the cell's.
 * Given no overlap, the uncovered part of the fundamental domain is a finite union of polygons whose
 * total area is zero, so it is empty. No gaps, no overlaps, and no edge bookkeeping. That last part
 * matters: these tilings are generally NOT edge-to-edge, so the usual "every edge is used exactly
 * twice" check reports defects on correct tilings and cannot be used here.
 */
export function verifyLattice(unit: Point[][], t1: Point, t2: Point): { ok: boolean; areaError: number } {
	const cell = Math.abs(t1.x * t2.y - t1.y * t2.x);
	const total = unit.reduce((s, p) => s + area(p), 0);
	const areaError = Math.abs(total - cell) / Math.max(cell, 1e-12);
	if (areaError > 1e-9) return { ok: false, areaError };

	for (let m = -1; m <= 1; m++) {
		for (let n = -1; n <= 1; n++) {
			const dx = m * t1.x + n * t2.x;
			const dy = m * t1.y + n * t2.y;
			for (let i = 0; i < unit.length; i++) {
				for (let j = 0; j < unit.length; j++) {
					if (m === 0 && n === 0 && i >= j) continue;
					const shifted = unit[j].map((p) => ({ x: p.x + dx, y: p.y + dy }));
					if (overlaps(unit[i], shifted)) return { ok: false, areaError };
				}
			}
		}
	}
	return { ok: true, areaError };
}

/** Distinct-modulo-lattice representatives, taken nearest the origin so they form a cluster. */
function unitFor(
	tiles: Placed[],
	t1: Point,
	t2: Point,
	want: number,
): number[] | null {
	const det = t1.x * t2.y - t1.y * t2.x;
	if (Math.abs(det) < EPS) return null;
	const classOf = (p: Point) => {
		const a = (p.x * t2.y - p.y * t2.x) / det;
		const b = (-p.x * t1.y + p.y * t1.x) / det;
		const fa = a - Math.floor(a + 1e-9);
		const fb = b - Math.floor(b + 1e-9);
		return `${Math.round(fa * 1e5)},${Math.round(fb * 1e5)}`;
	};
	const order = tiles
		.map((tile, i) => ({ i, d: Math.hypot(centroid(tile.pts).x, centroid(tile.pts).y) }))
		.sort((x, y) => x.d - y.d);
	const chosen: number[] = [];
	const classes = new Set<string>();
	for (const { i } of order) {
		const c = classOf(centroid(tiles[i].pts));
		if (classes.has(c)) continue;
		classes.add(c);
		chosen.push(i);
		if (chosen.length === want) break;
	}
	return chosen.length === want ? chosen : null;
}

interface Lattice {
	t1: Point;
	t2: Point;
	/** Tile-index pairs realising t1 and t2, for the emitted LatticeRefs. */
	r1: [number, number];
	r2: [number, number];
	unit: number[];
	unitSize: number;
	areaError: number;
}

/**
 * Every lattice whose unit passes `verifyLattice`, smallest cell first.
 *
 * More than one can pass, and that is not a defect in the search: the 15 families OVERLAP, so a
 * particular pentagon can admit tilings belonging to several types at once. The default Type 5 tuple is
 * a live example. Its own conditions (A = 60°, D = 120°) plus E = 360 − B − C make E = 120° at
 * B = 110°, C = 130°, so A + E = 180° and the pentagon is simultaneously a Type 1: it tiles with a
 * 2-tile translational unit as well as with Type 5's 6-tile one. Returning the smallest would silently
 * put the wrong tiling on the Type 5 shelf, so the caller selects by the type's published unit size.
 */
function findLattices(proto: Point[], tiles: Placed[], protoArea: number): Lattice[] {
	const cands = candidateVectors(proto, tiles);
	const pairs: { a: Candidate; b: Candidate; det: number }[] = [];
	for (let i = 0; i < cands.length; i++) {
		for (let j = i + 1; j < cands.length; j++) {
			const d = Math.abs(cands[i].v.x * cands[j].v.y - cands[i].v.y * cands[j].v.x);
			if (d < EPS) continue;
			pairs.push({ a: cands[i], b: cands[j], det: d });
		}
	}
	pairs.sort((x, y) => x.det - y.det);

	const out: Lattice[] = [];
	const seenSize = new Set<number>();
	const stats = { pairs: pairs.length, integral: 0, unitFound: 0, verified: 0 };
	for (const { a: ca, b: cb, det } of pairs) {
		const t1 = ca.v;
		const t2 = cb.v;
		const n = det / protoArea;
		const unitSize = Math.round(n);
		if (unitSize < 1 || Math.abs(n - unitSize) > 1e-6) continue;
		if (unitSize > tiles.length) continue;
		stats.integral++;
		if (seenSize.has(unitSize)) continue;
		const unit = unitFor(tiles, t1, t2, unitSize);
		if (!unit) continue;
		stats.unitFound++;
		const v = verifyLattice(
			unit.map((i) => tiles[i].pts),
			t1,
			t2,
		);
		if (!v.ok) continue;
		stats.verified++;
		seenSize.add(unitSize);
		out.push({
			t1, t2,
			r1: [ca.from, ca.to],
			r2: [cb.from, cb.to],
			unit, unitSize, areaError: v.areaError,
		});
	}
	lastStats = stats;
	return out;
}

/** Diagnostics from the most recent `findLattices`, reported when nothing passes. */
let lastStats = { pairs: 0, integral: 0, unitFound: 0, verified: 0 };

/**
 * A tuple away from the type's default, for deriving the assembly.
 *
 * Published sample pentagons sit on round numbers, and round numbers are exactly where a family meets
 * its neighbours (Type 5's default is also a Type 1, see above). Nudging every angle slider off the
 * default by an amount with no arithmetic relation to the constraints lands in the family's interior,
 * where only the type's own tiling exists. The assembly derived there is combinatorial and so replays
 * correctly at the default; build.test.ts checks exactly that.
 */
function genericParams(t: PentagonType): number[] {
	return t.angleParams.map((p, i) => {
		const nudge = [3.7, -2.9, 4.3][i % 3];
		const v = p.def + nudge;
		return Math.min(p.max, Math.max(p.min, v));
	});
}

// ------------------------------------------------------------------------------- driver

interface Derived {
	id: number;
	unitSize: number;
	expected: number;
	assembly: Assembly;
	areaError: number;
	/** Whether replaying the recipe at the type's DEFAULT tuple still tiles. */
	replaysAtDefault: boolean;
}

/**
 * Turn a chosen unit into a self-contained, parameter-free recipe.
 *
 * Every grown tile already records the gluing that placed it and the tile it was placed against, and
 * those references always point backwards, so the ancestor closure of the tiles we want is a valid
 * build order. We need three things in that closure: the unit itself, plus one pure translate of the
 * seed along each lattice vector. Those two extra tiles are what let t1 and t2 be written as corner
 * differences, which is what keeps the lattice parametric instead of two frozen numbers.
 */
function toAssembly(
	tiles: Placed[],
	unit: number[],
	r1: [number, number],
	r2: [number, number],
): Assembly | null {
	const need = new Set<number>([0, ...r1, ...r2, ...unit]);
	for (;;) {
		const before = need.size;
		for (const i of [...need]) {
			const via = tiles[i].via;
			if (via) need.add(via.ref);
		}
		if (need.size === before) break;
	}

	const order = [...need].sort((x, y) => x - y);
	if (order[0] !== 0) return null;
	const remap = new Map(order.map((old, idx) => [old, idx]));

	const glues: Glue[] = [];
	for (const old of order) {
		if (old === 0) continue;
		const via = tiles[old].via;
		if (!via) return null;
		const ref = remap.get(via.ref);
		if (ref === undefined) return null;
		glues.push({ ...via, ref });
	}

	const ref = (r: [number, number]) => ({
		from: [remap.get(r[0])!, 0] as [number, number],
		to: [remap.get(r[1])!, 0] as [number, number],
	});

	return {
		glues,
		unit: unit.map((i) => remap.get(i)!),
		t1: ref(r1),
		t2: ref(r2),
	};
}

function derive(t: PentagonType, budget: number): Derived | null {
	const res = solvePentagon(t, genericParams(t));
	if (!res.ok) {
		log(`  type ${t.id}: no pentagon at the generic tuple (${res.error})`);
		return null;
	}
	const proto = res.pentagon.corners as unknown as Point[];
	const protoArea = area(proto);

	const grown = grow(proto, budget, 400000);
	if (!grown) {
		log(`  type ${t.id}: growth failed within the node cap`);
		return null;
	}
	log(`  type ${t.id}: grew ${grown.tiles.length} tiles in ${grown.nodes} nodes`);

	const all = findLattices(proto, grown.tiles, protoArea);
	if (all.length === 0) {
		log(
			`  type ${t.id}: no lattice passed area + SAT — ${lastStats.pairs} pairs, ` +
				`${lastStats.integral} with integral cell/area, ${lastStats.unitFound} with a full unit`,
		);
		return null;
	}
	log(`  type ${t.id}: lattices passing area + SAT at unit sizes ${all.map((l) => l.unitSize).join(", ")}`);
	const found = all.find((l) => l.unitSize === t.tilesPerUnit) ?? all[0];

	const assembly = toAssembly(grown.tiles, found.unit, found.r1, found.r2);
	if (!assembly) {
		log(`  type ${t.id}: could not express the unit as a self-contained recipe`);
		return null;
	}

	// The claim the whole page rests on: the recipe is combinatorial, so replaying it at a DIFFERENT
	// member of the family still tiles. Check it here, at the type's default tuple, which is a different
	// pentagon from the generic one the search ran on.
	let replaysAtDefault = false;
	const atDefault = solvePentagon(t);
	if (atDefault.ok) {
		const replay = assembleUnit(atDefault.pentagon.corners as unknown as Point[], assembly);
		if (replay) replaysAtDefault = verifyLattice(replay.unit, replay.t1, replay.t2).ok;
	}
	log(`  type ${t.id}: recipe is ${assembly.glues.length + 1} tiles; replays at default: ${replaysAtDefault}`);

	return {
		id: t.id,
		unitSize: found.unitSize,
		expected: t.tilesPerUnit,
		assembly,
		areaError: found.areaError,
		replaysAtDefault,
	};
}

function main() {
	mkdirSync(dirname(LOG), { recursive: true });
	writeFileSync(LOG, "");
	const args = process.argv.slice(2).map(Number).filter(Number.isInteger);
	const types = args.length ? PENTAGON_TYPES.filter((t) => args.includes(t.id)) : PENTAGON_TYPES;

	log(`pentagon unit derivation — ${types.length} type(s)`);
	log(`started ${new Date().toISOString()}`);
	log("");

	const started = Date.now();
	const results: Derived[] = [];
	types.forEach((t, n) => {
		const t0 = Date.now();
		const budget = Math.max(24, t.tilesPerUnit * 6);
		log(`[${n + 1}/${types.length}] ${t.label} (expect ${t.tilesPerUnit}/unit, growing to ${budget})`);
		const d = derive(t, budget);
		const ms = Date.now() - t0;
		if (d) {
			const verdict = d.unitSize === d.expected ? "MATCH" : `MISMATCH (got ${d.unitSize})`;
			log(
				`  type ${t.id}: unit ${d.unitSize}, cell/protoArea error ${d.areaError.toExponential(2)} — ${verdict}`,
			);
			results.push(d);
		}
		const done = n + 1;
		const rate = (Date.now() - started) / done;
		log(`  ${ms} ms; ETA ${(((types.length - done) * rate) / 1000).toFixed(1)}s`);
		log("");
	});

	log(`derived ${results.length}/${types.length}`);
	log(
		`matching published unit size: ${results.filter((r) => r.unitSize === r.expected).map((r) => r.id).join(", ") || "none"}`,
	);
	log("");
	log(`replaying at default: ${results.filter((r) => r.replaysAtDefault).map((r) => r.id).join(", ") || "none"}`);
	log("");
	log("--- ASSEMBLIES ---");
	const out: Record<number, unknown> = {};
	for (const r of results) out[r.id] = r.assembly;
	writeFileSync(resolve(process.cwd(), "lib/pentagon/assemblies.json"), JSON.stringify(out, null, "\t") + "\n");
	log(JSON.stringify(out, null, "\t"));
}

main();
