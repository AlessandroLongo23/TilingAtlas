// Applying an edit: `StudioDoc` + the base patch -> the edited patch.
//
// A full rebuild from the base cell on every change, never an incremental mutation. Two reasons, and
// the first one is what makes the rest of the editor simple. Undo becomes a snapshot of a small plain
// object instead of a command with an inverse, so nothing in the editor has to know how to un-cut a
// face or un-merge a tile. And a rebuild cannot drift: there is exactly one function that turns an
// edit into geometry, so a bug shows up on every path at once instead of on the fifth undo.
//
// It is affordable because the thing being rebuilt is one fundamental cell. The shipped catalogue
// averages 30 faces per cell, and `analyseFaces` was measured at 6 microseconds per pattern, so the
// whole pipeline below is far inside a frame. A live vertex DRAG still skips the topology half through
// `moveOnly`, because dragging changes where things are and never what is glued to what.
//
// THE ORDER MATTERS, and each step depends on the one before:
//
//   1. move      displace vertices. Geometry only, no topology.
//   2. subdivide promote each cut endpoint to a real vertex. A midpoint endpoint SPLITS its edge,
//                which is felt by both faces sharing it because the edge is one quotient edge.
//   3. re-cut    extract every face afresh from the planar rotation system. Uniform: a cut face and
//                an untouched face go through the identical walk, so there is no special case for
//                "the face that was cut" and no chance of the two disagreeing.
//   4. merge     lib/freedraw/topology.ts, across the edges the doc dropped.
//   5. edges     the quotient edge list and its keys. Bows are not baked in here: the renderer reads
//                them off the doc per frame (`bowsFor` in the canvas), which is what lets a drag preview.

import {
	canonicalEdge,
	canonicalRing,
	halfEdgeKey,
	mergeFaces,
	ringKey,
	type Lift,
	type Ring,
} from "@/lib/freedraw/topology";
import { refEdge, refPosition } from "./snap";
import type { PeriodMode, PointRef, Pt, StudioDoc, StudioPatch } from "./types";

/** A directed quotient dart: from class `u` to class `v` across the lattice step `d`. */
interface Dart {
	u: number;
	v: number;
	d: Lift;
}

/** The working graph a rebuild mutates before the faces are re-cut. */
interface Graph {
	verts: Pt[];
	/** Undirected quotient edges, each listed once. */
	edges: Dart[];
}

const key = (d: Dart) => halfEdgeKey(d.u, d.v, d.d[0], d.d[1]);
const rev = (d: Dart): Dart => ({ u: d.v, v: d.u, d: [-d.d[0], -d.d[1]] });

/** World position of class `vi` displaced into lattice cell `off`. */
function at(g: Graph, T1: Pt, T2: Pt, vi: number, off: Lift): Pt {
	const p = g.verts[vi];
	return [p[0] + off[0] * T1[0] + off[1] * T2[0], p[1] + off[0] * T1[1] + off[1] * T2[1]];
}

/**
 * Where a construction point sits, against the CURRENT geometry.
 *
 * A cut stores WHAT its endpoint is, never where it was, so a cut drawn before a vertex drag still
 * lands on the geometry after it. Resolving therefore happens on every rebuild, and it goes through
 * `snap.refPosition` so the position a cut is built against and the position it resolves to cannot
 * come from two different pieces of arithmetic.
 */
export const resolveRef = refPosition;

/**
 * Faces, cut out of the planar rotation system.
 *
 * At each class the outgoing darts are sorted by heading; a face walk arrives along a dart, finds its
 * reverse in that order, and leaves along the dart one step CLOCKWISE from it. That is the standard
 * traversal and it yields each face counter-clockwise; on a torus every face is bounded, so there is
 * no outer face to recognise and discard. Each of the 2E darts belongs to exactly one face, which is
 * also the loop's own termination argument.
 *
 * The walk runs in the QUOTIENT and carries the lift: stepping along a dart adds its lattice step, so
 * a face straddling the cell boundary comes out as offsets instead of as a second copy.
 */
function cutFaces(g: Graph, T1: Pt, T2: Pt): Ring[] {
	const darts: Dart[] = [];
	for (const e of g.edges) {
		darts.push(e);
		darts.push(rev(e));
	}
	const out = new Map<number, number[]>(); // class -> dart indices leaving it, sorted by heading
	for (let i = 0; i < darts.length; i++) {
		const list = out.get(darts[i].u);
		if (list) list.push(i);
		else out.set(darts[i].u, [i]);
	}
	const heading = (i: number): number => {
		const d = darts[i];
		const a = g.verts[d.u];
		const b = at(g, T1, T2, d.v, d.d);
		return Math.atan2(b[1] - a[1], b[0] - a[0]);
	};
	for (const list of out.values()) list.sort((p, q) => heading(p) - heading(q));
	const slot = new Map<string, number>();
	for (const list of out.values()) for (let i = 0; i < list.length; i++) slot.set(String(list[i]), i);
	const indexOf = new Map<string, number>();
	for (let i = 0; i < darts.length; i++) indexOf.set(key(darts[i]), i);

	const used = new Array<boolean>(darts.length).fill(false);
	const rings: Ring[] = [];
	for (let start = 0; start < darts.length; start++) {
		if (used[start]) continue;
		const ring: [number, number, number][] = [];
		let cur = start;
		let lift: Lift = [0, 0];
		for (let guard = 0; guard <= darts.length; guard++) {
			if (used[cur]) break;
			used[cur] = true;
			const d = darts[cur];
			ring.push([d.u, lift[0], lift[1]]);
			lift = [lift[0] + d.d[0], lift[1] + d.d[1]];
			const back = indexOf.get(key(rev(d)));
			if (back === undefined) break;
			const list = out.get(d.v);
			const s = slot.get(String(back));
			if (!list || s === undefined) break;
			cur = list[(s - 1 + list.length) % list.length];
			if (cur === start) break;
		}
		if (ring.length >= 3) rings.push(ring);
	}
	return rings;
}

/** Geometry-only rebuild, for a live drag. Same topology, moved vertices — which is exactly what a
 *  drag is, so the merge and the face walk are skipped and the patch is reused in place. */
export function moveOnly(base: StudioPatch, moved: Readonly<Record<string, Pt>>): StudioPatch {
	const verts = base.verts.map((v, i) => {
		const d = moved[String(i)];
		return (d ? [v[0] + d[0], v[1] + d[1]] : [v[0], v[1]]) as [number, number];
	});
	return { ...base, verts };
}

export interface BuildResult {
	patch: StudioPatch;
	/** Face key -> face index, so a doc entry written against an earlier rebuild still finds its face. */
	faceKeys: string[];
	/** Cuts the rebuild could not place, with the reason. Shown in the inspector, never thrown. */
	dropped: string[];
	/** Vertex index -> the key `doc.moved` stores its displacement under: the decimal index for a base
	 *  vertex, the JSON ref for one a cut created. A drag writes through this, never `String(vi)`. */
	moveKeys: string[];
}

/**
 * The edited patch.
 *
 * `mode` is carried for the symmetry pass: under `wallpaper` the caller has already expanded each
 * edit over the point group before it reaches the doc, so this function stays mode-agnostic and there
 * is one rebuild, not two. It is taken as a parameter only so the signature does not change
 * when the expansion moves inside.
 */
export { ringKey };

export function build(base: StudioPatch, doc: StudioDoc, _mode: PeriodMode): BuildResult {
	const T1 = base.T1 as Pt;
	const T2 = base.T2 as Pt;
	const failed: string[] = [];

	// 1. move
	const g: Graph = {
		verts: base.verts.map((v, i) => {
			const d = doc.moved[String(i)];
			return (d ? [v[0] + d[0], v[1] + d[1]] : [v[0], v[1]]) as Pt;
		}),
		edges: base.edges.map(([u, v, dx, dy]) => ({ u, v, d: [dx, dy] as Lift })),
	};

	// 2. subdivide: every cut endpoint becomes a real vertex of the working graph.
	const moved = moveOnly(base, doc.moved);
	const refVert = new Map<string, { vi: number; off: Lift }>();
	const refKey = (r: PointRef) => JSON.stringify(r);
	const moveKeys = base.verts.map((_, i) => String(i));

	/** Split the undirected edge carrying `a -> b` at its midpoint, in place. Both faces sharing it
	 *  see the split, because there is only one edge to split. */
	const splitEdge = (u: number, v: number, d: Lift, mid: Pt): number | null => {
		const want = canonicalEdge(u, v, d[0], d[1]);
		const idx = g.edges.findIndex((e) => canonicalEdge(e.u, e.v, e.d[0], e.d[1]).key === want.key);
		if (idx < 0) return null;
		const e = g.edges[idx];
		// `mid` arrives already expressed in e.u's own cell, so the first half takes no lattice step and
		// the second half carries the whole of the original one. Keeping the split that way is what makes
		// the new class's offsets as small as its neighbours'.
		const nv = g.verts.length;
		g.verts.push(mid);
		g.edges.splice(idx, 1);
		g.edges.push({ u: e.u, v: nv, d: [0, 0] });
		g.edges.push({ u: nv, v: e.v, d: e.d });
		return nv;
	};

	for (const path of doc.cuts) {
		const ids: { vi: number; off: Lift }[] = [];
		let ok = true;
		for (const ref of path) {
			const cached = refVert.get(refKey(ref));
			if (cached) {
				ids.push(cached);
				continue;
			}
			if (ref.kind === "vertex") {
				const rec = { vi: ref.vi, off: ref.off };
				refVert.set(refKey(ref), rec);
				ids.push(rec);
				continue;
			}
			const p = resolveRef(moved, ref);
			if (!p) {
				ok = false;
				break;
			}
			if (ref.kind === "centroid") {
				const nv = g.verts.length;
				// A cut vertex can be dragged too, and its displacement cannot be stored against a base
				// index because it has none. So `moved` carries TWO key spaces: a decimal string is a base
				// vertex index, and a JSON string is the ref of a vertex a cut created.
				const d = doc.moved[refKey(ref)];
				g.verts.push(d ? [p[0] + d[0], p[1] + d[1]] : p);
				moveKeys[nv] = refKey(ref);
				const rec = { vi: nv, off: ref.off };
				refVert.set(refKey(ref), rec);
				ids.push(rec);
				continue;
			}
			// The EDGE, by its canonical key. Not by a ring index: the ref was built against a rebuilt
			// patch whose faces the dart walk numbered, and `base.rings` carries the fold's order, so an
			// index means two different edges in the two frames. That mismatch is what made a cut attach
			// somewhere unrelated and read as a merge.
			const e = refEdge(base, ref);
			if (!e) {
				ok = false;
				break;
			}
			const { vi: va, vj: vb, dx: ex, dy: ey } = e;
			// The midpoint in the SOURCE class's frame: the half-step to the target, so the new class is
			// positioned relative to `va` and the two halves of the split carry the original step.
			const A = g.verts[va];
			const B = at(g, T1, T2, vb, [ex, ey]);
			const d = doc.moved[refKey(ref)];
			const mid: Pt = [(A[0] + B[0]) / 2 + (d?.[0] ?? 0), (A[1] + B[1]) / 2 + (d?.[1] ?? 0)];
			const nv = splitEdge(va, vb, [ex, ey], mid);
			if (nv === null) {
				ok = false;
				break;
			}
			moveKeys[nv] = refKey(ref);
			const rec = { vi: nv, off: ref.off };
			refVert.set(refKey(ref), rec);
			ids.push(rec);
		}
		if (!ok || ids.length < 2) {
			failed.push("a cut lost the geometry it was drawn against");
			continue;
		}
		for (let i = 0; i + 1 < ids.length; i++) {
			const a = ids[i];
			const b = ids[i + 1];
			g.edges.push({
				u: a.vi,
				v: b.vi,
				d: [b.off[0] - a.off[0], b.off[1] - a.off[1]] as Lift,
			});
		}
	}

	// 3. re-cut every face from the planar rotation system
	// ALWAYS re-cut, even with no cuts in the doc. Reusing `base.rings` when nothing was cut would be a
	// shortcut with a cost: the walk would then run only on edited tilings, so a defect in it would be
	// invisible until someone made a cut. One path, exercised by every tiling that opens.
	const rings = cutFaces(g, T1, T2).map(canonicalRing);

	// 4. merge across the dropped edges
	const dropped = new Set(doc.dropped);
	// Precomputed, because `mergeFaces` asks 2E times and a scan per question would make the rebuild
	// quadratic in the edge count for no reason.
	const live = new Set(g.edges.map((e) => canonicalEdge(e.u, e.v, e.d[0], e.d[1]).key));
	const isDrawn = (k: string): boolean | undefined => {
		const d = k.split(",").map(Number);
		if (d.length !== 4) return undefined;
		const c = canonicalEdge(d[0], d[1], d[2], d[3]);
		// Tri-state on purpose (see `DrawnLookup`): an edge this graph does not carry is a boundary, not
		// a merge, and must answer `undefined` and not `true`.
		if (!live.has(c.key)) return undefined;
		return !dropped.has(c.key);
	};
	const merged = mergeFaces(rings, isDrawn);

	// 5. the edge list
	const edges: [number, number, number, number, number][] = [];
	const edgeKeys: string[] = [];
	for (const e of g.edges) {
		const c = canonicalEdge(e.u, e.v, e.d[0], e.d[1]);
		edges.push([c.vi, c.vj, c.dx, c.dy, dropped.has(c.key) ? 0 : 1]);
		edgeKeys.push(c.key);
	}

	const incident: { face: number; cornerIdx: number }[][] = g.verts.map(() => []);
	for (let f = 0; f < rings.length; f++) {
		const ring = rings[f];
		for (let i = 0; i < ring.length; i++) incident[ring[i][0]].push({ face: f, cornerIdx: i });
	}

	return {
		patch: {
			T1: base.T1,
			T2: base.T2,
			verts: g.verts.map((v) => [v[0], v[1]] as [number, number]),
			vorbit: g.verts.map(() => 0),
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
			basis: base.basis,
			medianEdge: base.medianEdge,
			srcAttrs: base.srcAttrs,
		},
		faceKeys: rings.map(ringKey),
		dropped: failed,
		moveKeys,
	};
}
