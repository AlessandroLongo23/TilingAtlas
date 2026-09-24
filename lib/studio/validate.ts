// Gate every gesture BEFORE it commits. AL chose block-the-gesture over commit-then-flag, so this file
// is the whole answer to "can I do that": one predicate per tool, each run against a TRIAL state, each
// returning a `Verdict` that carries the reason the inspector shows. Nothing here mutates a doc, and
// nothing here knows about React.
//
// THE ARITHMETIC EACH BLOCK IS ALLOWED, because the three are not equally exact:
//
//   MERGE is exact. `mergeFaces` classifies a merged tile from integer lattice holonomy alone
//   (lib/freedraw/topology.ts explains the trick), so "this merge goes infinite" is a decision with no
//   tolerance anywhere in it. That is why the merge block is the one we can make absolute.
//
//   MOVE is float, and has to be: dragging a vertex leaves ℤ[ζ₂₄] on the first pixel. Two tests per
//   incident ring, the sign of its signed area and whether it is still simple, with every threshold
//   scaled off `patch.medianEdge` because no board here has a unit edge.
//
//   CUT is float, but only ever reads SIGNS of orientations. We refuse crossings, so we never have to
//   CONSTRUCT an intersection point. That is the point, not a shortcut: `Cyclotomic` offers no field
//   inversion, and lib/classes/algorithm/exact/exactOverlap.ts never builds an intersection coordinate
//   because those generally leave the ring, so a tool obliged to place one would have nothing exact to
//   place it with. Refuse the crossing and every cut endpoint stays a construction point, which IS
//   exactly derivable.

import { Vector } from "@/classes/Vector";
import { ringArea } from "@/lib/freedraw/edgePatchCore";
import { ringKey,
	canonicalEdge,
	halfEdgeKey,
	mergeFaces,
	type DrawnLookup,
	type Ring,
} from "@/lib/freedraw/topology";
import { segmentsIntersect } from "@/lib/utils/geometry";
import {
	OK,
	REJECT,
	type Basis,
	type PointRef,
	type Pt,
	type StudioDoc,
	type StudioPatch,
	type Verdict,
} from "./types";

const ZERO: Pt = [0, 0];

/** Displacement of one QUOTIENT vertex. A trial move is this function with one vertex shifted, which is
 *  what makes "the vertex moves in all its lattice copies" fall out instead of being remembered. */
type Disp = (vi: number) => Pt;

const dispOf =
	(moved: Readonly<Record<string, Pt>>): Disp =>
	(vi) =>
		moved[String(vi)] ?? ZERO;

/** Where the `(ox, oy)` copy of quotient vertex `vi` sits, with the doc's displacement applied. */
function vertexAt(patch: StudioPatch, vi: number, ox: number, oy: number, disp: Disp): Pt {
	const [x, y] = patch.verts[vi];
	const [dx, dy] = disp(vi);
	const [[t1x, t1y], [t2x, t2y]] = patch.basis;
	return [x + dx + ox * t1x + oy * t2x, y + dy + ox * t1y + oy * t2y];
}

/**
 * A construction point as a world position, against the CURRENT geometry.
 *
 * Exported because a `PointRef` is structural on purpose (types.ts says why: a stored float detaches
 * from the geometry the moment a vertex moves) and every consumer needs the same resolution. `moved` is
 * the doc's displacement map, so a cut drawn before a drag is tested against where its endpoints are
 * NOW, not where they were clicked.
 */
export function resolveRef(
	patch: StudioPatch,
	ref: PointRef,
	moved: Readonly<Record<string, Pt>> = {},
): Pt {
	const disp = dispOf(moved);
	const [ox, oy] = ref.off;
	if (ref.kind === "vertex") return vertexAt(patch, ref.vi, ox, oy, disp);
	// A midpoint names its EDGE by canonical key and a centroid names its face by canonical ring key,
	// neither of which is an index, because `cutFaces` renumbers faces on every rebuild and an index
	// then means a different element in a different frame.
	if (ref.kind === "midpoint") {
		const i = patch.edgeKeys.indexOf(ref.edge);
		if (i < 0) return [Number.NaN, Number.NaN];
		const [vi, vj, dx, dy] = patch.edges[i];
		const pa = vertexAt(patch, vi, ox, oy, disp);
		const pb = vertexAt(patch, vj, dx + ox, dy + oy, disp);
		return [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
	}
	const f = patch.rings.findIndex((r) => ringKey(r) === ref.ring);
	if (f < 0) return [Number.NaN, Number.NaN];
	const ring = patch.rings[f];
	let sx = 0;
	let sy = 0;
	for (const [u, cx, cy] of ring) {
		const p = vertexAt(patch, u, cx + ox, cy + oy, disp);
		sx += p[0];
		sy += p[1];
	}
	return [sx / ring.length, sy / ring.length];
}

/** One ring as `Vector`s: the one point shape both `ringArea` and `segmentsIntersect` accept, so a ring
 *  is built once and handed to both. */
function ringPoints(patch: StudioPatch, ring: Ring, disp: Disp): Vector[] {
	return ring.map(([u, ox, oy]) => {
		const [x, y] = vertexAt(patch, u, ox, oy, disp);
		return new Vector(x, y);
	});
}

/**
 * Whether a ring is still non-self-intersecting.
 *
 * NOT `isSimple` from lib/isohedral/build.ts, whose signature would have fitted. Two reasons. It pulls
 * the Tactile vendor, the cell-mesh builders and the render layer in behind it, which is a lot of module
 * graph for a pure predicate; and its `segmentsCross` returns false for parallel pairs, so a ring folded
 * flat back along itself would read as simple, which is exactly the fold we are here to catch.
 * `segmentsIntersect` is imported for the cut block anyway and does report collinear overlap.
 */
function isSimpleRing(pts: Vector[], tol: number): boolean {
	const n = pts.length;
	for (let i = 0; i < n; i++) {
		for (let j = i + 2; j < n; j++) {
			if (i === 0 && j === n - 1) continue; // the closing segment is adjacent to the first
			if (segmentsIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n], tol)) return false;
		}
	}
	return true;
}

/** Parameter threshold and point-equality distance for the float blocks. Derived from the cell, never
 *  assumed: `medianEdge` is the shortest edge, so this stays a fraction of the smallest feature. */
const tolOf = (patch: StudioPatch): number => patch.medianEdge * 1e-6;

/** Below this a ring has collapsed, and its "sign" is noise. Area scales as length², so the threshold
 *  has to as well. */
const areaEpsOf = (patch: StudioPatch): number => patch.medianEdge * patch.medianEdge * 1e-9;

/** The reversed spelling of a directed half-edge key: the twin that names the same edge from the other
 *  face. `${-0}` is `"0"`, so a zero step round-trips. */
function reverseKey(key: string): string {
	const [va, vb, dx, dy] = key.split(",").map(Number);
	return halfEdgeKey(vb, va, -dx, -dy);
}

/**
 * `mergeFaces` asks by DIRECTED half-edge; a doc drops UNDIRECTED ones, so fold the question back to the
 * canonical spelling.
 *
 * Answering `true` for everything outside the set is a fact here, not the guess `DrawnLookup`'s tri-state
 * guards against: every edge of a StudioPatch's ring set is a real quotient edge of that patch, so it is
 * drawn or it is dropped, never unknown.
 */
function drawnExcept(dropped: ReadonlySet<string>): DrawnLookup {
	return (key) => {
		const [va, vb, dx, dy] = key.split(",").map(Number);
		return !dropped.has(canonicalEdge(va, vb, dx, dy).key);
	};
}

/** Refuse a merge that would make the resulting tile infinite. */
export function canDropEdge(
	patch: StudioPatch,
	dropped: ReadonlySet<string>,
	edgeKey: string,
): Verdict {
	if (dropped.has(edgeKey)) return REJECT("degenerate", "that edge is already merged away");

	const here = patch.half.get(edgeKey)?.[0];
	const there = patch.half.get(reverseKey(edgeKey))?.[0];
	if (!here && !there) return REJECT("degenerate", "there is no tile edge with that key");
	if (!here || !there)
		return REJECT("degenerate", "that edge has only one side, so dropping it would merge nothing");

	const trial = new Set(dropped);
	trial.add(edgeKey);
	const after = mergeFaces(patch.rings, drawnExcept(trial));
	const rank = after.compRank[after.polyComp[here.p]];
	if (rank === 1)
		return REJECT("infinite-tile", "merging here would make one tile an infinite strip");
	if (rank === 2)
		return REJECT("infinite-tile", "merging here would make one tile an unbounded sheet");

	// Checked AFTER the rank, and the order is the whole subtlety. On a torus an edge whose two sides are
	// already one tile is USUALLY the edge that closes that tile onto its own translate, which is the
	// infinite case above and not this one. What survives to here is the zero-holonomy remainder: the two
	// cells already sit flush in the assembled tile (so the merge changes nothing at all) or the new bond
	// encloses a hole. Either way the tile's outline does not change, so there is nothing to commit.
	const before = mergeFaces(patch.rings, drawnExcept(dropped));
	if (before.polyComp[here.p] === before.polyComp[there.p])
		return REJECT(
			"degenerate",
			"both sides of that edge are already one tile, so merging them changes nothing",
		);

	return OK;
}

/** Refuse a vertex move that would fold any incident tile.
 *
 *  `delta` is an INCREMENT on top of whatever `moved` already holds for `vi`, which is what makes t = 0
 *  in `clampVertexMove` mean "leave the doc as it stands" and therefore trivially valid. */
export function canMoveVertex(
	patch: StudioPatch,
	vi: number,
	delta: Pt,
	moved: Readonly<Record<string, Pt>>,
): Verdict {
	const sites = patch.incident[vi];
	if (!sites) return REJECT("degenerate", `there is no vertex ${vi} in this patch`);
	if (delta[0] === 0 && delta[1] === 0) return OK;

	const base = dispOf(moved);
	const after: Disp = (u) => {
		const d = base(u);
		return u === vi ? [d[0] + delta[0], d[1] + delta[1]] : d;
	};
	const tol = tolOf(patch);
	const areaEps = areaEpsOf(patch);

	// `incident` lists one entry per CORNER, and a ring can touch the same vertex at several corners (at
	// several lattice offsets), so the faces are deduped and each ring is then checked whole. Checking the
	// whole ring is also what handles those repeated corners: every one of them moves.
	for (const f of new Set(sites.map((s) => s.face))) {
		const ring = patch.rings[f];
		const bArea = ringArea(ringPoints(patch, ring, base));
		const pts = ringPoints(patch, ring, after);
		const aArea = ringArea(pts);
		if (Math.abs(aArea) < areaEps || Math.sign(aArea) !== Math.sign(bArea))
			return REJECT("folds-tile", `this would turn tile ${f} inside out`);
		if (!isSimpleRing(pts, tol))
			return REJECT("folds-tile", `this would fold tile ${f} across itself`);
	}
	return OK;
}

/**
 * The furthest valid position along `vi -> vi + delta`, for a live drag that sticks instead of jumping.
 *
 * `lo` is always a t that was TESTED and found valid, starting at 0, which is valid by construction
 * (t = 0 is the doc as it stands), so the returned displacement always passes `canMoveVertex`. 24
 * halvings put it within |delta| · 2⁻²⁴ of the boundary: sub-pixel at any zoom the editor offers.
 *
 * The search assumes the valid t form an interval containing 0. Both tests are continuous in t, so that
 * holds for the cases the tools produce; where it does not, the answer is still a valid t, just not
 * provably the largest one, and sticking short is the failure the drag can live with.
 */
export function clampVertexMove(
	patch: StudioPatch,
	vi: number,
	delta: Pt,
	moved: Readonly<Record<string, Pt>>,
): Pt {
	if (canMoveVertex(patch, vi, delta, moved).ok) return delta;
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < 24; i++) {
		const mid = (lo + hi) / 2;
		if (canMoveVertex(patch, vi, [delta[0] * mid, delta[1] * mid], moved).ok) lo = mid;
		else hi = mid;
	}
	return [delta[0] * lo, delta[1] * lo];
}

/** World -> lattice coordinates, inverted once per call so the copy windows below are integer ranges and
 *  not a guessed neighbourhood. */
function latticeFrame(basis: Basis) {
	const [[ax, ay], [bx, by]] = basis;
	return { ax, ay, bx, by, det: ax * by - ay * bx };
}

type Frame = ReturnType<typeof latticeFrame>;

const toLattice = (f: Frame, p: Pt): Pt => [
	(p[0] * f.by - p[1] * f.bx) / f.det,
	(p[1] * f.ax - p[0] * f.ay) / f.det,
];

/** Slack in LATTICE units. World tolerances are `medianEdge · 1e-6` and no period here is shorter than
 *  one edge, so this covers them with room to spare; an extra copy in the window only costs a test. */
const LATTICE_PAD = 1e-6;

/**
 * Does `seg` properly cross any lattice copy of `other`?
 *
 * Only the copies whose lattice bounding box can reach `seg` are tested, so the answer is complete
 * instead of a fixed ±1 neighbourhood that would silently miss a crossing two cells out. In practice
 * that is one to four copies.
 */
function crossesSomeCopy(
	seg: readonly [Pt, Pt],
	other: readonly [Pt, Pt],
	basis: Basis,
	f: Frame,
	tol: number,
): boolean {
	const s0 = toLattice(f, seg[0]);
	const s1 = toLattice(f, seg[1]);
	const o0 = toLattice(f, other[0]);
	const o1 = toLattice(f, other[1]);
	const span = (k: 0 | 1): [number, number] => [
		Math.ceil(Math.min(s0[k], s1[k]) - Math.max(o0[k], o1[k]) - LATTICE_PAD),
		Math.floor(Math.max(s0[k], s1[k]) - Math.min(o0[k], o1[k]) + LATTICE_PAD),
	];
	const [i0, i1] = span(0);
	const [j0, j1] = span(1);
	const [[t1x, t1y], [t2x, t2y]] = basis;
	const a = new Vector(seg[0][0], seg[0][1]);
	const b = new Vector(seg[1][0], seg[1][1]);
	for (let i = i0; i <= i1; i++) {
		for (let j = j0; j <= j1; j++) {
			const dx = i * t1x + j * t2x;
			const dy = i * t1y + j * t2y;
			const c = new Vector(other[0][0] + dx, other[0][1] + dy);
			const d = new Vector(other[1][0] + dx, other[1][1] + dy);
			if (segmentsIntersect(a, b, c, d, tol)) return true;
		}
	}
	return false;
}

/** Every segment a new cut chord is not allowed to cross: the drawn tile edges that survive the doc's
 *  merges, then every segment of every cut including the path being drawn. */
function* blockingSegments(
	patch: StudioPatch,
	doc: StudioDoc,
	path: readonly PointRef[],
): Generator<readonly [Pt, Pt, "edge" | "cut"]> {
	const disp = dispOf(doc.moved);
	const dropped = new Set(doc.dropped);
	for (let i = 0; i < patch.edges.length; i++) {
		const [u, v, ox, oy, drawn] = patch.edges[i];
		// An undrawn or merged-away edge is not a tile boundary, so a cut is free to run straight across
		// it. Blocking those would refuse the most ordinary gesture there is: cutting a merged tile.
		if (!drawn || dropped.has(patch.edgeKeys[i])) continue;
		yield [vertexAt(patch, u, 0, 0, disp), vertexAt(patch, v, ox, oy, disp), "edge"];
	}
	for (const cut of [...doc.cuts, path]) {
		for (let i = 0; i + 1 < cut.length; i++)
			yield [
				resolveRef(patch, cut[i], doc.moved),
				resolveRef(patch, cut[i + 1], doc.moved),
				"cut",
			];
	}
}

/** Refuse a cut segment that would cross an existing edge or cut. */
export function canExtendCut(
	patch: StudioPatch,
	doc: StudioDoc,
	path: readonly PointRef[],
	next: PointRef,
): Verdict {
	if (path.length === 0) return OK; // the first click has no segment yet, so nothing can cross

	const tol = tolOf(patch);
	const a = resolveRef(patch, path[path.length - 1], doc.moved);
	const b = resolveRef(patch, next, doc.moved);
	if (Math.hypot(b[0] - a[0], b[1] - a[1]) < tol)
		return REJECT("degenerate", "that point is already where the cut ends");

	// `segmentsIntersect` reports a SHARED ENDPOINT as no intersection (its `sharedPoints` tally keeps
	// t and u off the interior), which is what this block depends on: consecutive cut segments share a
	// point by construction, and a cut leaving a vertex shares that vertex with every edge at it.
	const f = latticeFrame(patch.basis);
	const seg = [a, b] as const;
	for (const [c, d, what] of blockingSegments(patch, doc, path)) {
		if (crossesSomeCopy(seg, [c, d], patch.basis, f, tol))
			return REJECT(
				"chord-crosses",
				what === "edge"
					? "this cut would cross an existing tile edge"
					: "this cut would cross an existing cut",
			);
	}
	// A chord that lies ALONG something already there. `segmentsIntersect` cannot catch it: it ignores
	// shared endpoints, and a chord duplicating an edge shares BOTH of them, so it short-circuits to no
	// intersection. Such a cut was accepted and then split nothing, which reads as the tool silently
	// failing.
	//
	// The test is that BOTH endpoints sit on one segment, which is what "lies along it" means. Testing
	// the chord's midpoint instead also fired when a chord merely passed through some point of an edge,
	// and that is a legitimate cut, so it refused things it had no business refusing.
	for (const [c, d, what] of blockingSegments(patch, doc, path)) {
		if (
			pointOnSomeCopy(a, [c, d], patch.basis, f, tol) &&
			pointOnSomeCopy(b, [c, d], patch.basis, f, tol)
		)
			return REJECT(
				"degenerate",
				what === "edge"
					? "there is already an edge along that line"
					: "there is already a cut along that line",
			);
	}
	return OK;
}

/**
 * Is `p` on the segment `[c, d]`, or on any lattice copy of it, within `tol`.
 *
 * The copy span is computed the way `crossesSomeCopy` computes it, from the lattice coordinates of the
 * two extents, so a coincidence a cell away is caught as readily as one inside the cell.
 */
function pointOnSomeCopy(
	p: Pt,
	other: readonly [Pt, Pt],
	basis: Basis,
	f: Frame,
	tol: number,
): boolean {
	const s0 = toLattice(f, p);
	const o0 = toLattice(f, other[0]);
	const o1 = toLattice(f, other[1]);
	const span = (k: 0 | 1): [number, number] => [
		Math.ceil(s0[k] - Math.max(o0[k], o1[k]) - LATTICE_PAD),
		Math.floor(s0[k] - Math.min(o0[k], o1[k]) + LATTICE_PAD),
	];
	const [i0, i1] = span(0);
	const [j0, j1] = span(1);
	const [[t1x, t1y], [t2x, t2y]] = basis;
	for (let i = i0; i <= i1; i++) {
		for (let j = j0; j <= j1; j++) {
			const ox = i * t1x + j * t2x;
			const oy = i * t1y + j * t2y;
			const cx = other[0][0] + ox;
			const cy = other[0][1] + oy;
			const vx = other[1][0] + ox - cx;
			const vy = other[1][1] + oy - cy;
			const len2 = vx * vx + vy * vy;
			if (len2 < 1e-18) continue;
			const t = ((p[0] - cx) * vx + (p[1] - cy) * vy) / len2;
			if (t < -1e-9 || t > 1 + 1e-9) continue;
			if (Math.hypot(cx + t * vx - p[0], cy + t * vy - p[1]) < tol) return true;
		}
	}
	return false;
}

/**
 * Refuse committing a cut path that would leave a degree-1 vertex.
 *
 * A path splits a face only when BOTH ends sit on that face's boundary. An end at a face CENTROID leaves
 * a degree-1 vertex, and lib/freedraw/pattern.ts forbids those outright: "a degree-1 vertex is a dead
 * end, which would make the figure a maze, not a tiling". Which is precisely why the cut tool chains
 * clicks: vertex -> centroid -> vertex is one committable path, and the state halfway through is
 * legitimately uncommittable, not broken.
 */
export function canCommitCut(
	patch: StudioPatch,
	doc: StudioDoc,
	path: readonly PointRef[],
): Verdict {
	if (path.length < 2) return REJECT("dead-end", "a cut needs at least two points");

	const ends = [path[0], path[path.length - 1]] as const;
	for (const e of ends) {
		// Refs are structural, so a rebuild can leave one naming a face or vertex that is gone. Catching it
		// here keeps a stale path from committing as a chord to NaN.
		const alive =
			e.kind === "vertex"
				? !!patch.verts[e.vi]
				: e.kind === "midpoint"
					? patch.edgeKeys.includes(e.edge)
					: patch.rings.some((r) => ringKey(r) === e.ring);
		if (!alive) return REJECT("degenerate", "this cut names a point that is no longer in the tiling");
	}
	if (ends[0].kind === "centroid" || ends[1].kind === "centroid")
		return REJECT("dead-end", "a cut has to end on a tile boundary, not inside a tile");

	// Resolving both ends is the cheapest way to be sure the path has real geometry behind it before it
	// enters the doc.
	for (const e of ends) {
		const [x, y] = resolveRef(patch, e, doc.moved);
		if (!Number.isFinite(x) || !Number.isFinite(y))
			return REJECT("degenerate", "this cut names a point with no position");
	}
	return OK;
}
