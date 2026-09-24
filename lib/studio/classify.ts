// The editor's three recolour classes: which tiles one paint click repaints. `PAINT_SCOPES` in types.ts
// carries the labels and the glosses; this file is the only place that decides when two tiles are alike.
//
// WHY NOT lib/freedraw/faces.ts's classifyPatchFaces. That one fingerprints a component by its point set
// and then searches for a congruence over PATCH_SYM: 12 rotations in 30° steps times a reflection. Its
// own comment justifies the 30° step by the tile edges lying in 30°-multiple directions, and that
// assumption dies the moment the move tool drags a vertex. After one free drag an edge points anywhere,
// so a fixed 24-element set both misses real congruences and reports two identical tiles as two shapes.
//
// So the key here is INTRINSIC and guesses at no symmetry group: walk the tile's boundary and emit the
// cyclic word of (edge length, interior angle) at each corner. Two tiles are congruent exactly when the
// words agree up to where the walk started and which way it ran. Same construction as
// `polyform_angle_word` in tools/ctrnact-oracle/alphabets/polyform.py, in floats and with no lattice to
// index directions against, and an interior angle for the same reason that file uses one (see `wordOf`).
//
//   shape        the word canonicalised over cyclic rotation AND reversal; reversal is the reflection.
//   orientation  the same word plus the absolute world headings of its canonical starts. A translation
//                moves neither the word nor a heading; a rotation shifts every heading.
//   tile         the component id, since one component already IS one period orbit.
//
// What the word does NOT read: edge decorations. Two tiles with the same corner skeleton and different
// bumps key alike. A decoration is stored per QUOTIENT edge (`StudioDoc.edges`), so it is identical on
// every copy of that edge and cannot separate two tiles the skeleton calls equal. True today, and the
// place to add a letter if a decoration ever becomes per-tile.

import { componentLifts } from "@/lib/freedraw/faces";
import { ringKey } from "@/lib/freedraw/topology";
import type { PaintScope, Pt, StudioPatch } from "./types";

/** One key per COMPONENT id (0 .. compRank.length-1). Parallel arrays, and the field names are exactly
 *  the `PaintScope` values so a scope indexes them directly. */
export interface ClassKeys {
	shape: string[];
	orientation: string[];
	tile: string[];
}

// Angular resolution: 4096 steps of the full turn (~0.088°). A divisor of the circle, so a heading a
// hair under 2π wraps to 0 instead of to one step past the top. Angles are scale-free, which is why this
// one is absolute; lengths are not and take their step from the patch instead.
const ANG_STEPS = 4096;
const PER_RAD = ANG_STEPS / (2 * Math.PI);

/** Length resolution: a thousandth of the cell's shortest edge. Never a unit scale: a studio cell sits
 *  wherever the catalogue put it, at whatever size. The `|| 1` only keeps an edgeless patch from
 *  dividing by zero. */
const lenStep = (patch: StudioPatch) => (patch.medianEdge || 1) / 1024;

const qLen = (d: number, step: number) => Math.round(d / step);

/** An angle as an integer step count. Signed for a turn in (-π, π), unsigned for an interior angle in
 *  (0, 2π); neither reaches the wrap, so no reduction is wanted here. */
const qAng = (a: number) => Math.round(a * PER_RAD);

/** An absolute heading as an integer step count in [0, ANG_STEPS). */
const qDir = (a: number) => ((Math.round(a * PER_RAD) % ANG_STEPS) + ANG_STEPS) % ANG_STEPS;

const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const heading = (a: Pt, b: Pt) => Math.atan2(b[1] - a[1], b[0] - a[0]);

/** The exterior turn from a->b onto b->c. atan2 of (cross, dot), so a reflex corner falls out signed
 *  with no special case. */
const turn = (a: Pt, b: Pt, c: Pt) => {
	const ux = b[0] - a[0];
	const uy = b[1] - a[1];
	const vx = c[0] - b[0];
	const vy = c[1] - b[1];
	return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
};

const rotated = (w: readonly number[], k: number) => [...w.slice(k), ...w.slice(0, k)];

/**
 * One component's boundary loops, as world-coordinate point lists: one loop for a simply connected tile,
 * one more per hole.
 *
 * The faces are first laid out CONNECTED through `componentLifts`. The developer emits one face per
 * orbit at its fundamental-domain position, so the cells of a single tile can sit a full period apart
 * with no shared corner, and reading geometry off the raw positions gives a wrong shape. That helper
 * already crosses undrawn edges only, which is the restriction that keeps a tile from folding onto its
 * own period copy; reusing it is also the only reason this file needs `patch.edges`.
 *
 * Every loop comes back with the tile's INTERIOR ON THE LEFT, hole loops included, so `wordOf` can read
 * an interior angle off it without asking again which way it runs.
 *
 * A developed directed edge is on the boundary when its reverse is absent from the developed edge set.
 * Testing the reverse against `patch.half` instead would be wrong, and not in a corner case: a tile with
 * one cell per period (a honeycomb hexagon, a 2x2 block on the square lattice) borders its own period
 * translates all the way round, so every one of its boundary half-edges has a reverse carried by a face
 * of the SAME component. Only the lifted position separates the two, and the key `${vi},${x},${y}` is
 * exact integer lattice identity, so two faces agree on a shared developed corner without a tolerance.
 */
function boundaryLoops(patch: StudioPatch, comp: number): Pt[][] {
	const [t1x, t1y] = patch.T1;
	const [t2x, t2y] = patch.T2;
	const lift = componentLifts(patch, comp);
	const pos = new Map<string, Pt>();
	const directed = new Set<string>();
	const arcs: [string, string][] = [];
	let area2 = 0;
	for (let p = 0; p < patch.polys.length; p++) {
		if (patch.polyComp[p] !== comp) continue;
		const [lx, ly] = lift.get(p) ?? [0, 0];
		const ring = patch.polys[p].map(([vi, ox, oy]) => {
			const x = ox + lx;
			const y = oy + ly;
			const k = `${vi},${x},${y}`;
			if (!pos.has(k))
				pos.set(k, [
					patch.verts[vi][0] + x * t1x + y * t2x,
					patch.verts[vi][1] + x * t1y + y * t2y,
				]);
			return k;
		});
		for (let i = 0; i < ring.length; i++) {
			const a = ring[i];
			const b = ring[(i + 1) % ring.length];
			directed.add(`${a}>${b}`);
			arcs.push([a, b]);
			const pa = pos.get(a)!;
			const pb = pos.get(b)!;
			area2 += pa[0] * pb[1] - pb[0] * pa[1];
		}
	}

	const leave = new Map<string, string[]>();
	const bound: [string, string][] = [];
	for (const [a, b] of arcs) {
		if (directed.has(`${b}>${a}`)) continue; // interior: the face across it is ours too
		bound.push([a, b]);
		const l = leave.get(a);
		if (l) l.push(b);
		else leave.set(a, [b]);
	}

	// Which way the rings run decides which turn keeps the tile's interior on the left, and that only
	// matters at a PINCH vertex, where two boundary edges leave one corner and the wrong choice cuts the
	// loop in two. The shoelace sum over the developed rings answers it without assuming a convention.
	const hand = area2 >= 0 ? 1 : -1;
	const loops: Pt[][] = [];
	const walked = new Set<string>();
	for (const start of bound) {
		if (walked.has(`${start[0]}>${start[1]}`)) continue;
		const pts: Pt[] = [];
		let cur = start;
		for (let guard = 0; guard <= bound.length; guard++) {
			walked.add(`${cur[0]}>${cur[1]}`);
			pts.push(pos.get(cur[0])!);
			const opts = leave.get(cur[1]) ?? [];
			let next = opts[0];
			if (opts.length > 1) {
				// The tightest turn towards the interior, so the walk hugs the tile instead of cutting
				// across the pinch. A u-turn cannot be a candidate: if (a,b) is a boundary edge then
				// (b,a) is not a developed edge at all.
				let bestT = Infinity;
				for (const w of opts) {
					const t = hand * turn(pos.get(cur[0])!, pos.get(cur[1])!, pos.get(w)!);
					if (t < bestT) {
						bestT = t;
						next = w;
					}
				}
			}
			if (next === undefined) break; // an open chain: the ring set is not edge-closed
			cur = [cur[1], next];
			if (walked.has(`${cur[0]}>${cur[1]}`)) break; // back to the start, or into a finished loop
		}
		loops.push(hand < 0 ? pts.reverse() : pts);
	}
	return loops;
}

/**
 * The loop's REAL corners: the ones whose turn does not quantise to zero.
 *
 * A ring can carry collinear subdivision points (the reason `RawPolygon.corners` exists, see
 * lib/utils/renderTiling.ts). Left in, each would add a phantom (length, 0) entry and a subdivided edge
 * would read as a different shape from the identical unsubdivided one. Dropping merges their edge
 * lengths automatically, because a length is measured to the next SURVIVING corner. One pass is enough:
 * removing a collinear point replaces two collinear steps with one of the same direction, so no
 * neighbour's turn changes.
 */
function corners(loop: readonly Pt[]): Pt[] {
	const m = loop.length;
	if (m < 3) return [...loop];
	const out: Pt[] = [];
	for (let i = 0; i < m; i++) {
		if (qAng(turn(loop[(i - 1 + m) % m], loop[i], loop[(i + 1) % m])) === 0) continue;
		out.push(loop[i]);
	}
	return out;
}

/**
 * The outer boundary of a merged tile, corner-reduced, in the developed frame.
 *
 * Exported because the RENDERER needs it, and for a reason worth stating: a merged tile has to take one
 * colour, and the colour the atlas gives any polygon is a function of its corner count and how far it
 * departs from regular (`polygonFillHue`). Handing that function this outline is what makes a
 * square-plus-triangle house pentagon come out the same colour as every other house pentagon in the
 * atlas, instead of keeping the two colours of the tiles it was made from.
 *
 * Corner-reduced because the constituent faces contribute collinear points where the removed edge met
 * the boundary: two squares merged give a rectangle whose raw loop has six points and whose corner
 * count is four, and the colour ramp is a function of the corner count.
 *
 * The outer loop is the one of greatest absolute area, which is also how a tile with holes is handled:
 * the holes are the other loops and they do not set the colour. Null for a strip or a sheet, which have
 * no finite boundary, and for a component whose loops do not close.
 */
export function componentOutline(patch: StudioPatch, comp: number): Pt[] | null {
	if (patch.compRank[comp] !== 0) return null;
	const loops = boundaryLoops(patch, comp);
	if (loops.length === 0) return null;
	let best: Pt[] | null = null;
	let bestArea = -1;
	for (const loop of loops) {
		const c = corners(loop);
		if (c.length < 3) continue;
		let a2 = 0;
		for (let i = 0; i < c.length; i++) {
			const p = c[i];
			const q = c[(i + 1) % c.length];
			a2 += p[0] * q[1] - q[0] * p[1];
		}
		const area = Math.abs(a2) / 2;
		if (area > bestArea) {
			bestArea = area;
			best = c;
		}
	}
	return best;
}

/**
 * The quantised (length to the next corner, interior angle at this corner) word of a corner loop, read
 * from corner 0. `sign` is +1 while the list keeps the tile's interior on the left and -1 once it has
 * been reversed.
 *
 * The INTERIOR angle, and not the signed turn, is what makes one list reversal cover the reflection. Any
 * congruence preserves an interior angle, mirrors included, and a reflection only reverses the order the
 * corners arrive in, so a reversed reading is exactly the mirror image's reading. A signed turn flips
 * sign under both operations, so reversing a signed-turn word describes the SAME tile walked backwards
 * instead of its mirror, and a chiral tile and its mirror would never meet. Measured: the J and L
 * tetrominoes produced two disjoint candidate sets under the turn word and one key under this one.
 */
function wordOf(pts: readonly Pt[], step: number, sign: number): number[] {
	const m = pts.length;
	const w: number[] = [];
	for (let i = 0; i < m; i++) {
		const next = pts[(i + 1) % m];
		const t = turn(pts[(i - 1 + m) % m], pts[i], next);
		w.push(qLen(dist(pts[i], next), step), qAng(Math.PI - sign * t));
	}
	return w;
}

/** A candidate reading of one loop: the word of a point list, started at corner `r`. */
interface Cand {
	w: number[];
	r: number;
	head: number;
}

/** Lexicographic compare of two candidate readings, both two numbers per corner and the same length. */
function cmpRot(x: Cand, y: Cand): number {
	const n = x.w.length;
	for (let i = 0; i < n; i++) {
		const d = x.w[(2 * x.r + i) % n] - y.w[(2 * y.r + i) % n];
		if (d !== 0) return d;
	}
	return 0;
}

/** Shape and pose keys of one boundary loop, or null when it carries no real corner left to read. */
function loopKeys(loop: readonly Pt[], step: number): { shape: string; pose: string } | null {
	const pts = corners(loop);
	if (pts.length < 3) return null; // collapsed to a segment: there is no shape to name
	const cands: Cand[] = [];
	const readings: [Pt[], number][] = [
		[pts, 1],
		[[...pts].reverse(), -1],
	];
	for (const [list, sign] of readings) {
		const w = wordOf(list, step, sign);
		for (let r = 0; r < list.length; r++)
			cands.push({ w, r, head: qDir(heading(list[r], list[(r + 1) % list.length])) });
	}
	let best = cands[0];
	for (const c of cands) if (cmpRot(c, best) < 0) best = c;
	// EVERY start achieving the minimal word contributes its heading, and the whole sorted set is the
	// pose key. A tie is the rule and not the exception (a square's four rotations all win), and keeping
	// one winner would keep whichever the walk happened to reach first, so two translates of one tile
	// could disagree. The set cannot disagree: a translation leaves it alone, and a rotation shifts all
	// of it. Keeping the set and not its minimum also matters: min{0°,10°} and min{350°,0°} are both 0°
	// at two different orientations, while the sorted sets differ.
	const heads = [...new Set(cands.filter((c) => cmpRot(c, best) === 0).map((c) => c.head))].sort(
		(a, b) => a - b,
	);
	const shape = rotated(best.w, 2 * best.r).join(",");
	return { shape, pose: `${shape}@${heads.join("/")}` };
}

// The renderer asks per frame and a patch is rebuilt only on an edit, so memoise on the patch object the
// way faces.ts memoises classifyFaces.
const cache = new WeakMap<StudioPatch, ClassKeys>();

/** The three class keys of every component of `patch`, one array per paint scope. */
export function classify(patch: StudioPatch): ClassKeys {
	const hit = cache.get(patch);
	if (hit) return hit;
	const step = lenStep(patch);
	const out: ClassKeys = { shape: [], orientation: [], tile: [] };
	// Representative ring per component, so the TILE scope keys on a shape and not on a component index.
	// Indices renumber whenever a cut adds a face (mergeFaces numbers in face order), and a colour keyed
	// on one would jump to a different tile the next time anything was cut.
	const rep: string[] = patch.compRank.map(() => "");
	for (let f = 0; f < patch.rings.length; f++) {
		const c = patch.polyComp[f];
		const k = ringKey(patch.rings[f]);
		if (rep[c] === "" || k < rep[c]) rep[c] = k;
	}
	for (let c = 0; c < patch.compRank.length; c++) {
		out.tile.push(rep[c] || `comp#${c}`);
		// A strip (rank 1) or a sheet (rank 2) runs off to infinity, so it has no finite boundary and no
		// word: any figure we could read off it would be the emitted representative, not the tile. Give it
		// a key derived from its own component id, which makes it equal to itself and to nothing else. So
		// painting one strip never spreads to another that merely looks alike, which is the honest answer
		// when there is no finite shape to compare. The `#` can never appear in a word, so the two key
		// spaces cannot collide.
		const self = `rank${patch.compRank[c]}#${c}`;
		const keys = (patch.compRank[c] === 0 ? boundaryLoops(patch, c) : []).map((l) =>
			loopKeys(l, step),
		);
		if (keys.length === 0 || keys.some((k) => k === null)) {
			out.shape.push(self);
			out.orientation.push(self);
			continue;
		}
		// Sorted before joining, so a tile with holes keys the same whichever loop the walk found first.
		out.shape.push(
			keys
				.map((k) => k!.shape)
				.sort()
				.join("|"),
		);
		out.orientation.push(
			keys
				.map((k) => k!.pose)
				.sort()
				.join("|"),
		);
	}
	cache.set(patch, out);
	return out;
}

/** The class key of the component containing face `f`, under one scope: what a paint click writes into
 *  `StudioDoc.paint`. */
export function keyFor(keys: ClassKeys, patch: StudioPatch, face: number, scope: PaintScope): string {
	return keys[scope][patch.polyComp[face]];
}
