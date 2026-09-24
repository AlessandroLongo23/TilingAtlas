// Hit-testing, and the construction points a cut snaps to.
//
// Every function here answers a question about the QUOTIENT while the user is pointing at a COPY. The
// cursor is somewhere out in the plane, many periods from the cell, and the answer has to be "vertex 3,
// in the lattice cell four across and two up" — because an edit is recorded against the quotient and
// the offset is what lets it be drawn back where the user is looking.
//
// So each pick reduces the cursor to the cell by rounding its lattice coordinates, then probes the nine
// neighbouring cells. The probe is not decoration: reduction is ambiguous at a half-integer coordinate,
// and a point sitting just over a cell boundary has its nearest candidate in the NEXT cell. Testing one
// cell would make the snap dead along every cell edge. lib/render/orbitHover.ts does the same rounding
// for the same reason; this adds the neighbourhood because it must return an offset and not just a hit.

import { ringKey } from "@/lib/freedraw/topology";
import { rayCastContains, type Pt as XY } from "@/lib/utils/canvasPick";
import type { ConstructionPoint, Lift, PointKind, PointRef, Pt, StudioPatch } from "./types";

/** Snap radius in world units, as a fraction of the median edge. A twelfth of an edge is close enough
 *  that two neighbouring construction points never contend, and far enough to catch a loose click. */
export const SNAP_FRAC = 1 / 12;

const xy = (p: Pt): XY => ({ x: p[0], y: p[1] });

/** World position of vertex class `vi` in lattice cell `off`. */
export function vertexAt(patch: StudioPatch, vi: number, off: Lift): Pt {
	const [t1x, t1y] = patch.T1;
	const [t2x, t2y] = patch.T2;
	const v = patch.verts[vi];
	return [v[0] + off[0] * t1x + off[1] * t2x, v[1] + off[0] * t1y + off[1] * t2y];
}

/** The world ring of face `f` in lattice cell `off`, corner by corner. */
export function faceRing(patch: StudioPatch, f: number, off: Lift = [0, 0]): Pt[] {
	const ring = patch.rings[f];
	if (!ring) return [];
	return ring.map(([vi, ox, oy]) => vertexAt(patch, vi, [ox + off[0], oy + off[1]]));
}

/** Vertex mean of a face's ring. The mean and not the signed-area centroid, matching
 *  `Polygon.exactCentroid`: the two differ on a non-convex tile and the mean stays inside a ring the
 *  editor may have made concave, which is what a cut endpoint needs. */
export function faceCentroid(patch: StudioPatch, f: number, off: Lift = [0, 0]): Pt | null {
	const ring = faceRing(patch, f, off);
	if (ring.length === 0) return null;
	let sx = 0;
	let sy = 0;
	for (const p of ring) {
		sx += p[0];
		sy += p[1];
	}
	return [sx / ring.length, sy / ring.length];
}

/** Lattice coordinates of a world point. */
function latticeCoords(patch: StudioPatch, p: Pt): Pt {
	const [t1x, t1y] = patch.T1;
	const [t2x, t2y] = patch.T2;
	const det = t1x * t2y - t1y * t2x;
	return [(p[0] * t2y - p[1] * t2x) / det, (p[1] * t1x - p[0] * t1y) / det];
}

/** The nine lattice cells to probe around a world point: the nearest, and its neighbours. */
function candidateCells(patch: StudioPatch, p: Pt): Lift[] {
	const [a, b] = latticeCoords(patch, p);
	const i0 = Math.round(a);
	const j0 = Math.round(b);
	const out: Lift[] = [];
	for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) out.push([i0 + di, j0 + dj]);
	return out;
}

/**
 * The construction points of one cell: every vertex, every edge midpoint, every face centroid.
 *
 * The same three families `showPolygonPoints` draws and `Tiling.drawConstructionPoints` labels, and
 * the reason a cut can stay exactly derived: a vertex is a cell vertex, a midpoint is a half-sum, a
 * centroid is a vertex mean, and all three live inside the ring the cell came from even though they
 * are stored as floats here.
 *
 * Labelled by INDEX, not by the angular sort `drawConstructionPoints` uses. A cut stores a ref and the
 * inspector shows its label, so the label has to name the same point after a rebuild; an angular sort
 * about the origin renumbers everything the moment a vertex moves.
 */
export function constructionPoints(patch: StudioPatch): ConstructionPoint[] {
	const out: ConstructionPoint[] = [];
	for (let vi = 0; vi < patch.verts.length; vi++) {
		out.push({
			ref: { kind: "vertex", vi, off: [0, 0] },
			kind: "vertex",
			at: [patch.verts[vi][0], patch.verts[vi][1]],
			label: `v${vi + 1}`,
		});
	}
	// One midpoint per EDGE, taken straight off the edge list instead of walked per corner: an edge is
	// shared by two faces, and emitting it twice would put two snap targets on one point and make which
	// ref the user gets arbitrary. Keyed by the canonical edge key, which is what makes the ref mean the
	// same edge after a rebuild has renumbered the faces.
	for (let i = 0; i < patch.edges.length; i++) {
		const [vi, vj, dx, dy] = patch.edges[i];
		const A = vertexAt(patch, vi, [0, 0]);
		const B = vertexAt(patch, vj, [dx, dy]);
		out.push({
			ref: { kind: "midpoint", edge: patch.edgeKeys[i], off: [0, 0] },
			kind: "midpoint",
			at: [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2],
			label: `h${i + 1}`,
		});
	}
	for (let f = 0; f < patch.rings.length; f++) {
		const c = faceCentroid(patch, f);
		if (!c) continue;
		out.push({
			ref: { kind: "centroid", ring: ringKey(patch.rings[f]), off: [0, 0] },
			kind: "centroid",
			at: c,
			label: `c${f + 1}`,
		});
	}
	return out;
}

/** The world position a ref names, against `patch`. The one resolver: `doc.ts` and `validate.ts` both
 *  go through it so a ref cannot mean two things. */
export function refPosition(patch: StudioPatch, ref: PointRef): Pt | null {
	const [ox, oy] = ref.off;
	if (ref.kind === "vertex") {
		if (ref.vi < 0 || ref.vi >= patch.verts.length) return null;
		return vertexAt(patch, ref.vi, [ox, oy]);
	}
	if (ref.kind === "midpoint") {
		const i = patch.edgeKeys.indexOf(ref.edge);
		if (i < 0) return null;
		const [vi, vj, dx, dy] = patch.edges[i];
		const A = vertexAt(patch, vi, [ox, oy]);
		const B = vertexAt(patch, vj, [dx + ox, dy + oy]);
		return [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
	}
	const f = patch.rings.findIndex((r) => ringKey(r) === ref.ring);
	if (f < 0) return null;
	const c = faceCentroid(patch, f, [ox, oy]);
	return c;
}

/**
 * The faces a construction point sits on.
 *
 * A cut has to lie inside ONE tile, so this is what lets the tool offer only the points the current
 * path can legally reach: a vertex belongs to every incident face, a midpoint to the two faces sharing
 * its edge, a centroid to its own face. Without it the second click can land on another tile, the chord
 * crosses edges, and the cut is refused with nothing to suggest where a valid one would be.
 */
export function pointFaces(patch: StudioPatch, ref: PointRef): number[] {
	if (ref.kind === "vertex") return patch.incident[ref.vi]?.map((x) => x.face) ?? [];
	if (ref.kind === "midpoint") {
		const i = patch.edgeKeys.indexOf(ref.edge);
		if (i < 0) return [];
		const [vi, vj, dx, dy] = patch.edges[i];
		const out: number[] = [];
		for (const site of patch.half.get(`${vi},${vj},${dx},${dy}`) ?? []) out.push(site.p);
		for (const site of patch.half.get(`${vj},${vi},${-dx},${-dy}`) ?? []) out.push(site.p);
		return out;
	}
	const f = patch.rings.findIndex((r) => ringKey(r) === ref.ring);
	return f < 0 ? [] : [f];
}

/** The edge a midpoint ref names, in `patch`, or null when the rebuild no longer carries it. */
export function refEdge(
	patch: StudioPatch,
	ref: PointRef,
): { vi: number; vj: number; dx: number; dy: number } | null {
	if (ref.kind !== "midpoint") return null;
	const i = patch.edgeKeys.indexOf(ref.edge);
	if (i < 0) return null;
	const [vi, vj, dx, dy] = patch.edges[i];
	return { vi, vj, dx, dy };
}


/**
 * The construction point nearest a world position, with the lattice offset of the copy that was hit.
 *
 * `kinds` narrows the families a tool will accept, because the tools genuinely differ: a cut takes all
 * three, while an endpoint that has to lie on a face boundary cannot be a centroid.
 */
export function nearestPoint(
	patch: StudioPatch,
	points: readonly ConstructionPoint[],
	world: Pt,
	radius: number,
	kinds?: readonly PointKind[],
): ConstructionPoint | null {
	const [t1x, t1y] = patch.T1;
	const [t2x, t2y] = patch.T2;
	let best: ConstructionPoint | null = null;
	let bestD = radius * radius;
	for (const cell of candidateCells(patch, world)) {
		const ox = cell[0] * t1x + cell[1] * t2x;
		const oy = cell[0] * t1y + cell[1] * t2y;
		for (const p of points) {
			if (kinds && !kinds.includes(p.kind)) continue;
			const dx = p.at[0] + ox - world[0];
			const dy = p.at[1] + oy - world[1];
			const d = dx * dx + dy * dy;
			if (d >= bestD) continue;
			bestD = d;
			best = {
				...p,
				at: [p.at[0] + ox, p.at[1] + oy],
				ref: { ...p.ref, off: [p.ref.off[0] + cell[0], p.ref.off[1] + cell[1]] },
			};
		}
	}
	return best;
}

/**
 * The face under a world position, and which lattice copy of it.
 *
 * `rayCastContains` and not a convex-hull test: it reports the TRUE interior, so a click inside a star
 * tile's reflex dent goes to the neighbour that owns it (NOTES §9.4, and the comment on the function
 * itself). The editor makes concave tiles routinely, so this is the only correct choice here.
 */
export function pickFace(patch: StudioPatch, world: Pt): { face: number; off: Lift } | null {
	for (const cell of candidateCells(patch, world)) {
		for (let f = 0; f < patch.rings.length; f++) {
			const ring = faceRing(patch, f, cell);
			if (ring.length >= 3 && rayCastContains(ring.map(xy), world[0], world[1])) {
				return { face: f, off: cell };
			}
		}
	}
	return null;
}

/** Squared distance from `p` to the segment `a`-`b`, and where along it the foot fell. */
function segDist2(p: Pt, a: Pt, b: Pt): { d2: number; t: number } {
	const vx = b[0] - a[0];
	const vy = b[1] - a[1];
	const len2 = vx * vx + vy * vy;
	const t = len2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2));
	const dx = a[0] + t * vx - p[0];
	const dy = a[1] + t * vy - p[1];
	return { d2: dx * dx + dy * dy, t };
}

export interface EdgeHit {
	/** Index into `patch.edges` / `patch.edgeKeys`. */
	index: number;
	key: string;
	off: Lift;
	/** Where along the edge the cursor fell, 0 at the start class. Orients a decoration's bump. */
	t: number;
}

/** The edge nearest a world position. The handle for merging across an edge and for decorating one. */
export function pickEdge(patch: StudioPatch, world: Pt, radius: number): EdgeHit | null {
	let best: EdgeHit | null = null;
	let bestD = radius * radius;
	for (const cell of candidateCells(patch, world)) {
		for (let i = 0; i < patch.edges.length; i++) {
			const [vi, vj, dx, dy] = patch.edges[i];
			// The cell offset goes through `vertexAt` on both ends, so the edge's own lattice step and
			// the copy's translation compose without being added twice.
			const A = vertexAt(patch, vi, [cell[0], cell[1]]);
			const B = vertexAt(patch, vj, [dx + cell[0], dy + cell[1]]);
			const { d2, t } = segDist2(world, A, B);
			if (d2 >= bestD) continue;
			bestD = d2;
			best = { index: i, key: patch.edgeKeys[i], off: cell, t };
		}
	}
	return best;
}

/** The vertex nearest a world position — the grab test for the move tool. */
export function pickVertex(
	patch: StudioPatch,
	world: Pt,
	radius: number,
): { vi: number; off: Lift } | null {
	const [t1x, t1y] = patch.T1;
	const [t2x, t2y] = patch.T2;
	let best: { vi: number; off: Lift } | null = null;
	let bestD = radius * radius;
	for (const cell of candidateCells(patch, world)) {
		const ox = cell[0] * t1x + cell[1] * t2x;
		const oy = cell[0] * t1y + cell[1] * t2y;
		for (let vi = 0; vi < patch.verts.length; vi++) {
			const dx = patch.verts[vi][0] + ox - world[0];
			const dy = patch.verts[vi][1] + oy - world[1];
			const d = dx * dx + dy * dy;
			if (d >= bestD) continue;
			bestD = d;
			best = { vi, off: cell };
		}
	}
	return best;
}
