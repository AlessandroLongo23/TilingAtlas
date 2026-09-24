// A catalogued tiling, turned into something editable.
//
// Every Euclidean record in the Atlas ships as one fundamental cell plus a 2x2 translation basis
// (`renderCell` = `{ cellPolygons, basis }`, derived from the exact `{T1, T2, Seed}` by
// lib/services/renderCellDerive.ts). That is already the right shape for an editor: an edit recorded
// against the cell is an edit to every copy of that cell across the plane, which is what makes "every
// edit affects the whole tiling" true by construction instead of by bookkeeping.
//
// What the cell does NOT carry is topology. Its polygons are independent float vertex rings with no
// shared indices, so nothing in it can answer "which two tiles share this edge" — the question every
// tool here asks first. `Polygon.neighbors` and `Polygon.edgeNeighbors` were meant to hold that and are
// populated nowhere in the repo. So this module builds it.
//
// THE FOLD, and why it is the only interesting part. Two tiles that meet across the cell boundary do
// not share a vertex in the cell: one of them is a lattice TRANSLATE of a polygon listed elsewhere in
// the same cell. So welding by position alone (which is what lib/render/truchetTiling.ts does, and can
// afford to, because it works on a 6x6 block where almost every edge is interior) would leave every
// boundary edge looking like a free end. Vertices are therefore welded MODULO THE LATTICE: each is
// reduced to a representative and carries the integer lattice vector back to where it actually sat.
// From there the rings are index rings with lattice offsets, which is exactly what
// lib/freedraw/topology.ts consumes, and the half-edge table and the tile merge come out of it free.

import { canonicalRing, mergeFaces, ringKey, type Lift, type Ring } from "@/lib/freedraw/topology";
import { parseBaseCell, type RawPolygon, type TranslationalCellData } from "@/lib/utils/renderTiling";
import type { Basis, Pt, StudioPatch } from "./types";

/** Vertex weld tolerance as a fraction of the cell's median edge — the same constant, and the same
 *  reasoning, as lib/render/truchetTiling.ts's WELD_FRAC. */
const WELD_FRAC = 1e-4;

/** How far a corner's lattice offset may miss an integer before we call the cell malformed. In units
 *  of one lattice step, so it is scale free. */
const LATTICE_SLOP = 1e-3;

/** Every member carries every key, the shape `EdgePatchResult` already uses in edgePatchCore.ts: the
 *  project compiles with `strict: false`, where a boolean discriminant does not narrow reliably, so an
 *  absent-on-purpose key has to be declared as `?: undefined` to be readable after a guard. */
export type PatchFailure =
	| { ok: false; reason: string; patch?: undefined }
	| { ok: true; patch: StudioPatch; reason?: undefined };

const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];

/**
 * Lagrange-Gauss reduction of a 2-D basis: repeatedly subtract the nearest multiple of the shorter
 * vector from the longer. Two reasons to bother. The drawn fundamental cell is the parallelogram the
 * basis spans, so an unreduced basis draws a long thin cell that reads as nothing recognisable (the
 * same reason `analyzeSymmetry` opens with `gaussReduceExact`). And the lattice OFFSETS a fold
 * produces are small in a reduced basis and can be large in a skewed one, which matters because they
 * are the integers every key downstream is built from.
 *
 * Float, like the rest of the editor. `gaussReduceExact` in LatticeEnumerator.ts is the exact twin and
 * is not reachable from here: the render cell has already left the ring.
 */
export function gaussReduce(t1: Pt, t2: Pt): Basis {
	let a: Pt = [t1[0], t1[1]];
	let b: Pt = [t2[0], t2[1]];
	for (let guard = 0; guard < 64; guard++) {
		const na = a[0] * a[0] + a[1] * a[1];
		const nb = b[0] * b[0] + b[1] * b[1];
		if (nb < na) {
			const t = a;
			a = b;
			b = t;
			continue;
		}
		if (na < 1e-18) break;
		const m = Math.round((a[0] * b[0] + a[1] * b[1]) / na);
		if (m === 0) break;
		b = [b[0] - m * a[0], b[1] - m * a[1]];
	}
	// Positive orientation, so signed areas and turn directions mean one thing everywhere downstream.
	return cross(a, b) < 0 ? [a, [-b[0], -b[1]]] : [a, b];
}

/** Lattice coordinates of a world vector, i.e. the (i, j) with v = i*T1 + j*T2. */
function latticeCoords(v: Pt, basis: Basis): Pt {
	const [t1, t2] = basis;
	const det = cross(t1, t2);
	return [cross(v, t2) / det, cross(t1, v) / det];
}

/**
 * Weld vertices modulo the lattice.
 *
 * Reduction is to the NEAREST lattice point, not the floor, so a representative sits near the origin
 * instead of near a cell corner — the same choice `reduceToAnchor` makes in the fundamental-domain
 * subdivision, and for the same reason: flooring straddles, rounding does not. Rounding still leaves
 * one ambiguity, a coordinate at exactly one half, so the index is PROBED over the nine neighbouring
 * lattice translates before a new class is opened. Without that probe two lattice-equivalent points
 * landing either side of the half would become two classes and the edge between their tiles would
 * never be found.
 */
class VertexFold {
	readonly verts: Pt[] = [];
	private readonly index = new Map<string, number>();

	constructor(
		private readonly basis: Basis,
		private readonly weld: number,
	) {}

	private key(x: number, y: number): string {
		return `${Math.round(x / this.weld)}|${Math.round(y / this.weld)}`;
	}

	/** The class of `p`, and the integer lattice offset from that class's representative back to `p`. */
	place(p: Pt): { vi: number; off: Lift } | null {
		const [t1, t2] = this.basis;
		const [a, b] = latticeCoords(p, this.basis);
		const i0 = Math.round(a);
		const j0 = Math.round(b);
		const rx = p[0] - (i0 * t1[0] + j0 * t2[0]);
		const ry = p[1] - (i0 * t1[1] + j0 * t2[1]);
		for (let di = -1; di <= 1; di++) {
			for (let dj = -1; dj <= 1; dj++) {
				const qx = rx + di * t1[0] + dj * t2[0];
				const qy = ry + di * t1[1] + dj * t2[1];
				const hit = this.index.get(this.key(qx, qy));
				if (hit === undefined) continue;
				// p = verts[hit] + off. Solve in lattice coordinates and insist the answer is integral:
				// a non-integral residue here means the weld matched two points that are NOT lattice
				// equivalent, which is a malformed cell and must not pass silently.
				const off = latticeCoords(
					[p[0] - this.verts[hit][0], p[1] - this.verts[hit][1]],
					this.basis,
				);
				const oi = Math.round(off[0]);
				const oj = Math.round(off[1]);
				if (Math.abs(off[0] - oi) > LATTICE_SLOP || Math.abs(off[1] - oj) > LATTICE_SLOP) return null;
				return { vi: hit, off: [oi, oj] };
			}
		}
		const vi = this.verts.length;
		this.verts.push([rx, ry]);
		this.index.set(this.key(rx, ry), vi);
		return { vi, off: [i0, j0] };
	}
}

/** The corner ring of a cell polygon. A ring that declares `corners` is a FLATTENED curve, so its true
 *  corners are that subset and every point between them is subdivision (see the comment at
 *  lib/utils/renderTiling.ts:11). Taking the subset is what keeps a curved tile's shape from reading as
 *  a many-sided polygon; the arc itself is dropped, which is why `tilingToPatch` is only offered on
 *  tilings `hasCurvedTiles` says are straight. */
function cornerRingOf(poly: RawPolygon): Pt[] {
	const vs = poly.vertices;
	const cs = poly.corners;
	if (cs && cs.length >= 3) return cs.map((i) => [vs[i].x, vs[i].y] as Pt);
	return vs.map((v) => [v.x, v.y] as Pt);
}

/**
 * The editable patch for one catalogued tiling, or a reason it cannot be built.
 *
 * A reason, not a throw and not a silent empty patch: the caller is a React component that has to say
 * something useful in the inspector, and a tiling the editor cannot open is a fact worth showing.
 */
export function tilingToPatch(cell: TranslationalCellData | null): PatchFailure {
	if (!cell) return { ok: false, reason: "this tiling ships no translational cell" };
	const base = parseBaseCell(cell);
	if (!base) return { ok: false, reason: "the cell holds no polygons" };

	const basis = gaussReduce(
		[base.basis[0][0], base.basis[0][1]],
		[base.basis[1][0], base.basis[1][1]],
	);
	if (Math.abs(cross(basis[0], basis[1])) < 1e-12)
		return { ok: false, reason: "the cell's two periods are parallel" };

	const weld = Math.max(1e-9, base.medianEdge * WELD_FRAC);
	const fold = new VertexFold(basis, weld);

	const rings: Ring[] = [];
	const srcAttrs = new Map<string, { star?: boolean; hue?: number; n?: number }>();
	const seenRing = new Set<string>();
	for (const poly of base.polys) {
		// An open polyline is a mark, not a tile (the isohedral shelf's interior marks), and has no
		// inside to merge, cut or colour. lib/render/truchetTiling.ts drops them for the same reason.
		if (poly.open === true) continue;
		const pts = cornerRingOf(poly);
		if (pts.length < 3) continue;
		const corners: { vi: number; off: Lift }[] = [];
		let bad = false;
		for (const p of pts) {
			const placed = fold.place(p);
			if (!placed) {
				bad = true;
				break;
			}
			corners.push(placed);
		}
		if (bad) return { ok: false, reason: "the cell's vertices do not fold onto its own lattice" };
		const canon = canonicalRing(corners.map((c) => [c.vi, c.off[0], c.off[1]] as const));
		const k = ringKey(canon);
		// Two listings of the same face, or two faces that are lattice translates of each other, reach
		// the identical canonical word. A well-formed cell has neither, so this is a guard and not a
		// routine step; it is here because a cell that does would otherwise double a tile silently.
		if (seenRing.has(k)) continue;
		seenRing.add(k);
		rings.push(canon);
		// Only when the source says so. An absent entry means "take the by-side-count ramp", which is
		// what an ordinary polygon wants and what a cut face should fall back to.
		if (poly.star === true || poly.hue !== undefined) {
			// `n` comes along because it is NOT the ring length on a star: a {n/d} ring carries 2n points
			// and `starHue` is a function of n, so passing the ring length would put every star tile on
			// the wrong hue. This was visible as star tiles turning blue on the way into the editor.
			srcAttrs.set(k, {
				...(poly.star === true ? { star: true } : {}),
				...(poly.hue !== undefined ? { hue: poly.hue } : {}),
				...(poly.n !== undefined ? { n: poly.n } : {}),
			});
		}
	}
	if (rings.length === 0) return { ok: false, reason: "no closed tile survived the fold" };

	// Every edge of a tiling is drawn until the user merges across it — that is the whole difference
	// from an edge pattern, where the drawn subset IS the data (lib/render/truchetTiling.ts says the
	// same thing). So the base patch has one component per face and `mergeFaces` merges nothing.
	const merged = mergeFaces(rings, () => true);

	const edges: [number, number, number, number, number][] = [];
	const edgeKeys: string[] = [];
	const seenEdge = new Set<string>();
	for (const ring of rings) {
		for (let i = 0; i < ring.length; i++) {
			const [va, ax, ay] = ring[i];
			const [vb, bx, by] = ring[(i + 1) % ring.length];
			let vi = va;
			let vj = vb;
			let dx = bx - ax;
			let dy = by - ay;
			if (vj < vi || (vj === vi && (dx < 0 || (dx === 0 && dy < 0)))) {
				[vi, vj] = [vj, vi];
				dx = -dx;
				dy = -dy;
			}
			const k = `${vi},${vj},${dx},${dy}`;
			if (seenEdge.has(k)) continue;
			seenEdge.add(k);
			edges.push([vi, vj, dx, dy, 1]);
			edgeKeys.push(k);
		}
	}

	const incident: { face: number; cornerIdx: number }[][] = fold.verts.map(() => []);
	for (let f = 0; f < rings.length; f++) {
		const ring = rings[f];
		for (let i = 0; i < ring.length; i++) incident[ring[i][0]].push({ face: f, cornerIdx: i });
	}

	return {
		ok: true,
		patch: {
			T1: [basis[0][0], basis[0][1]],
			T2: [basis[1][0], basis[1][1]],
			verts: fold.verts.map((v) => [v[0], v[1]] as [number, number]),
			// The editor has no certificate and so no vertex-orbit labels. One orbit keeps the field total
			// for every consumer that reads it (analyseFaces, the orbit-dot mesh) without inventing data.
			vorbit: fold.verts.map(() => 0),
			edges,
			polys: rings as [number, number, number][][],
			polyComp: merged.polyComp,
			polyLift: merged.polyLift,
			compRank: merged.compRank,
			compCells: merged.compCells,
			compHoles: merged.compHoles,
			stats: merged.stats,
			half: merged.half,
			incident,
			edgeKeys,
			rings,
			basis,
			medianEdge: base.medianEdge,
			srcAttrs,
		},
	};
}
