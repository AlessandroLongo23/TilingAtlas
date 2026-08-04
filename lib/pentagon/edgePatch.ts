// Turn one parametric-pentagon edge record into a PERIODIC patch: a fundamental domain plus the two
// translations that stamp it across the plane.
//
// WHY. The first version of this shelf drew a single breadth-first patch fitted to the canvas. That is
// wrong in three ways at once — the walk stops mid-tile, so the boundary is a fringe of dangling
// stubs; there is nothing to pan or zoom into, because everything outside the developed disc simply
// does not exist; and a segment list has no faces, so the tiles could not be coloured. Every other
// Euclidean decoration in the atlas solved this years ago by drawing ONE period and instancing it over
// a lattice (lib/freedraw/render.ts, drawPatchPattern). This file is what lets the pentagon shelf join
// them: it hands back a FreedrawPatch, the same structure Marek's own combined-grid and Schwarz
// records ship pre-baked, so the shelf inherits infinite scrolling, the five fill modes and the
// scaffold toggle without a renderer of its own.
//
// The catch that makes this file more than a format conversion: those records ship their patch from
// the developer, because their board is fixed. This board is a FAMILY, so nothing can be baked — the
// lattice itself moves when a slider moves. So the patch is recovered from the develop, per parameter
// point:
//
//   1. Walk the darts (lib/pentagon/edgeDevelop.ts) out to a radius wide enough to hold a few periods.
//   2. Find the period lattice EMPIRICALLY: every re-placement of dart 0 at the seed's heading is a
//      translation of the figure onto itself (the walk only ever composes rotations and steps, so two
//      placements of one dart pointing the same way differ by a translation). The shortest two
//      independent such vectors are a basis — in two dimensions the successive minima always are.
//   3. Fold the vertices onto that lattice, cut the faces out of the planar rotation system, and merge
//      faces across UNDRAWN edges into tiles, carrying each face's lift so an infinite tile is
//      recognised as infinite (the holonomy trick from lib/freedraw/faces.ts, which explains it).
//
// Step 2 is verified, not assumed: a candidate vector only becomes a basis vector once translating a
// sample of real edges by it lands on edges with the same drawn bit. Without that check a GLIDE (half
// a translation, composed with a mirror) would pass for a period on any pattern that has one, and the
// figure would render as a plausible-looking lie.

import type { FreedrawPatch } from "@/lib/freedraw/pattern";
import type { SolvedBoard } from "./edge-board";
import { walkPentEdges, type PentEdgeRecord, type PentWalk } from "./edgeDevelop";

type Vec = [number, number];

export interface PentPatchOptions {
	/** Develop radius, in units of the LONGEST edge class. Grown automatically when the period is big. */
	reach?: number;
	/** Hard ceiling on developed dart instances. */
	budget?: number;
}

export interface PentPatchDiag {
	/** Instances the walk placed. */
	placed: number;
	/** Vertices, faces and edges in one period. */
	verts: number;
	faces: number;
	edges: number;
	/** Tiles (faces merged across undrawn edges) per period. */
	comps: number;
	/** Area of the fundamental cell divided by the area of one board tile — the face count it must match. */
	expectedFaces: number;
	reach: number;
	ms: number;
}

export type PentPatchResult =
	| { ok: true; patch: FreedrawPatch; diag: PentPatchDiag; reason?: undefined }
	| { ok: false; patch?: undefined; diag: PentPatchDiag; reason: string };

const cross = (a: Vec, b: Vec) => a[0] * b[1] - a[1] * b[0];
const norm2 = (a: Vec) => a[0] * a[0] + a[1] * a[1];

/** Signed area of a ring, positive counter-clockwise. */
function ringArea(pts: { x: number; y: number }[]): number {
	let s = 0;
	for (let i = 0; i < pts.length; i++) {
		const a = pts[i];
		const b = pts[(i + 1) % pts.length];
		s += a.x * b.y - b.x * a.y;
	}
	return s / 2;
}

/** Union-find whose members carry an integer lattice offset relative to their root, and which records
 *  every offset mismatch it meets. Those mismatches generate the period subgroup of the component —
 *  the whole basis of telling a finite tile from a strip from a sheet. */
class OffsetDSU {
	private readonly parent: number[];
	private readonly ox: number[];
	private readonly oy: number[];
	readonly periods: Vec[] = [];

	constructor(n: number) {
		this.parent = Array.from({ length: n }, (_, i) => i);
		this.ox = new Array(n).fill(0);
		this.oy = new Array(n).fill(0);
	}

	find(i: number): { root: number; x: number; y: number } {
		let root = i;
		let ax = 0;
		let ay = 0;
		while (this.parent[root] !== root) {
			ax += this.ox[root];
			ay += this.oy[root];
			root = this.parent[root];
		}
		let cur = i;
		let cx = ax;
		let cy = ay;
		while (this.parent[cur] !== cur) {
			const p = this.parent[cur];
			const px = this.ox[cur];
			const py = this.oy[cur];
			this.parent[cur] = root;
			this.ox[cur] = cx;
			this.oy[cur] = cy;
			cx -= px;
			cy -= py;
			cur = p;
		}
		return { root, x: ax, y: ay };
	}

	/** Assert offset(j) - offset(i) = (dx, dy). */
	union(i: number, j: number, dx: number, dy: number): void {
		const a = this.find(i);
		const b = this.find(j);
		if (a.root === b.root) {
			const mx = b.x - (a.x + dx);
			const my = b.y - (a.y + dy);
			if (mx !== 0 || my !== 0) this.periods.push([mx, my]);
			return;
		}
		this.parent[b.root] = a.root;
		this.ox[b.root] = a.x + dx - b.x;
		this.oy[b.root] = a.y + dy - b.y;
	}
}

/** 0 finite, 1 strip, 2 unbounded — the rank of the Q-span of a component's period vectors. */
function spanRank(vs: Vec[]): 0 | 1 | 2 {
	let first: Vec | null = null;
	for (const w of vs) {
		if (w[0] === 0 && w[1] === 0) continue;
		if (!first) {
			first = w;
			continue;
		}
		if (cross(first, w) !== 0) return 2;
	}
	return first ? 1 : 0;
}

/**
 * The period lattice, read off the walk and then checked against the figure.
 *
 * Candidates are the placements of dart 0 that point the way the seed points. Both walk moves are
 * direct isometries, so two placements of one dart with one heading differ by a translation of the
 * developed figure — but only up to the group the certificate quotients by, which is why each
 * candidate is put to `isPeriod` before it is believed.
 *
 * `cellArea` is known in advance (see `buildPentEdgePatch`), and that is what makes the second
 * generator exact instead of a guess: any lattice vector spanning EXACTLY that area with the shortest
 * one completes a basis, and one spanning a multiple of it does not. Without the area the pair could
 * be an index-n sublattice, which draws a period n times too big and splits every tile orbit n ways.
 */
function findLattice(
	walk: PentWalk,
	board: SolvedBoard,
	coreR: number,
	cellArea: number,
): { basis: [Vec, Vec]; shortest: number } | null {
	const tol = Math.min(...Object.values(board.sides)) * 1e-5;
	const cand: Vec[] = [];
	for (const inst of walk.instances) {
		if (inst.h !== 0) continue;
		if (Math.abs(Math.cos(inst.th) - 1) > 1e-6 || Math.abs(Math.sin(inst.th)) > 1e-6) continue;
		const v: Vec = [inst.x, inst.y];
		if (norm2(v) < tol * tol) continue;
		if (Math.hypot(inst.x, inst.y) > coreR) continue;
		cand.push(v);
	}
	if (cand.length === 0) return null;
	cand.sort((a, b) => norm2(a) - norm2(b));
	const edges = sampleEdges(walk, coreR);
	let v1: Vec | null = null;
	for (const v of cand) {
		if (v1 && Math.abs(Math.abs(cross(v1, v)) - cellArea) > 1e-4 * cellArea) continue;
		if (!isPeriod(edges, v)) continue;
		if (!v1) v1 = v;
		// The shortest verified vector is primitive, so the first partner spanning one cell with it is a
		// basis, and Lagrange reduction then makes the pair as square as the lattice allows.
		else return { basis: reduce(v1, v), shortest: Math.hypot(...v1) };
	}
	// A shortest vector but no partner: the cell is elongated and its second generator is further out
	// than this develop reaches. Report how far, so the caller can size the next attempt exactly.
	return v1 ? { basis: [v1, [0, 0]], shortest: Math.hypot(...v1) } : null;
}

/** Edge midpoints of the develop, plus the subset inside the core: the evidence `isPeriod` weighs. */
function sampleEdges(walk: PentWalk, coreR: number) {
	const key = (x: number, y: number) => `${Math.round(x / 1e-6)},${Math.round(y / 1e-6)}`;
	const all = new Map<string, boolean>();
	const inner: { x: number; y: number; drawn: boolean }[] = [];
	for (const e of walk.edges) {
		const a = walk.vertices[e.u];
		const b = walk.vertices[e.v];
		const mx = (a.x + b.x) / 2;
		const my = (a.y + b.y) / 2;
		all.set(key(mx, my), e.drawn);
		if (Math.hypot(mx, my) <= coreR) inner.push({ x: mx, y: my, drawn: e.drawn });
	}
	return { all, inner, key };
}

/** Lagrange reduction: subtract multiples until neither vector shortens the other. Leaves a basis of
 *  the SAME lattice, as short and as near-orthogonal as two dimensions allow. */
function reduce(a: Vec, b: Vec): [Vec, Vec] {
	let u: Vec = [...a];
	let v: Vec = [...b];
	for (let guard = 0; guard < 64; guard++) {
		if (norm2(v) < norm2(u)) [u, v] = [v, u];
		const m = Math.round((u[0] * v[0] + u[1] * v[1]) / norm2(u));
		if (m === 0) break;
		v = [v[0] - m * u[0], v[1] - m * u[1]];
		if (norm2(v) < 1e-18) break;
	}
	// Right-handed, so every face ring stays counter-clockwise in lattice coordinates too.
	return cross(u, v) < 0 ? [u, [-v[0], -v[1]]] : [u, v];
}

/**
 * Is `v` a translation of the developed figure onto itself?
 *
 * Samples interior edges by midpoint: the image of each must be an edge of the figure carrying the
 * same drawn bit. A glide reflection moves a symmetric figure onto itself as a SET but is not a
 * translation of it, and this is what catches that — the drawn bits, and the midpoints of the edges
 * that are not fixed by the mirror, fail to line up.
 */
function isPeriod(edges: ReturnType<typeof sampleEdges>, v: Vec): boolean {
	const { all, inner, key } = edges;
	if (inner.length < 8) return false;
	let checked = 0;
	for (const m of inner) {
		const hit = all.get(key(m.x + v[0], m.y + v[1]));
		if (hit === undefined) continue; // the image left the developed disc — no evidence either way
		if (hit !== m.drawn) return false;
		checked++;
	}
	// Demand real evidence: a vector whose images all fell outside the patch has proved nothing.
	return checked >= Math.max(8, inner.length * 0.15);
}

/** Faces of the developed planar graph, as vertex rings, counter-clockwise. Only complete board tiles
 *  survive: six corners, the tile's own area, and every corner well inside the developed disc. */
function extractFaces(walk: PentWalk, tileArea: number, coreR: number): number[][] {
	const n = walk.vertices.length;
	const adj: number[][] = Array.from({ length: n }, () => []);
	for (const e of walk.edges) {
		adj[e.u].push(e.v);
		adj[e.v].push(e.u);
	}
	const at = (u: number, v: number) => {
		const p = walk.vertices[u];
		const q = walk.vertices[v];
		return Math.atan2(q.y - p.y, q.x - p.x);
	};
	const slot = new Map<number, number>();
	for (let u = 0; u < n; u++) {
		adj[u].sort((p, q) => at(u, p) - at(u, q));
		for (let i = 0; i < adj[u].length; i++) slot.set(u * n + adj[u][i], i);
	}

	const seen = new Set<number>();
	const faces: number[][] = [];
	for (const e of walk.edges) {
		for (const [s0, t0] of [
			[e.u, e.v],
			[e.v, e.u],
		]) {
			if (seen.has(s0 * n + t0)) continue;
			const ring: number[] = [];
			let s = s0;
			let t = t0;
			let ok = true;
			for (let step = 0; step < 16; step++) {
				seen.add(s * n + t);
				ring.push(s);
				// Turn as far clockwise as the rotation system allows: that keeps the face on the left,
				// so every interior ring comes out counter-clockwise and the outer one comes out reversed.
				const i = slot.get(t * n + s);
				if (i === undefined) {
					ok = false;
					break;
				}
				const d = adj[t].length;
				const w = adj[t][(i - 1 + d) % d];
				s = t;
				t = w;
				if (s === s0 && t === t0) break;
			}
			if (!ok || s !== s0 || t !== t0 || ring.length !== 6) continue;
			const pts = ring.map((i) => walk.vertices[i]);
			if (pts.some((p) => Math.hypot(p.x, p.y) > coreR)) continue;
			const area = ringArea(pts);
			if (Math.abs(area - tileArea) > 1e-6 * tileArea) continue;
			faces.push(ring);
		}
	}
	return faces;
}

/**
 * Build the periodic patch for one record at one parameter point, or say why it could not.
 *
 * Cost is dominated by the develop, so the caller should memoise on (record, parameters) and NOT call
 * this per frame — panning and zooming re-instance the finished patch and never rebuild it.
 */
export function buildPentEdgePatch(
	rec: PentEdgeRecord,
	board: SolvedBoard,
	opts: PentPatchOptions = {},
): PentPatchResult {
	const t0 = Date.now();
	const longest = Math.max(...Object.values(board.sides));
	const tileArea = Math.abs(ringArea(board.outline));
	// The corpus is uniform on this point, and it is checked in lib/pentagon/edgePatch.test.ts against
	// all 17,993 records: every certificate carries exactly 12k darts and glues all of them. Each vertex
	// contributes two darts per incident edge, so darts = 4E; every face is the one hexagon, so 6F = 2E;
	// Euler on the torus then gives V - E + F = 0. Together: F = k, E = 3k, V = 2k per period.
	// Knowing the cell's AREA before the search is what lets the develop be sized in one step instead of
	// doubled blindly, and what makes the second basis vector exact rather than merely independent.
	const facesPerPeriod = rec.rneig.length / 12;
	const cellArea = facesPerPeriod * tileArea;
	let reach = (opts.reach ?? 5) * longest;
	const budget = opts.budget ?? 60000;

	let diag: PentPatchDiag = {
		placed: 0,
		verts: 0,
		faces: 0,
		edges: 0,
		comps: 0,
		expectedFaces: facesPerPeriod,
		reach,
		ms: 0,
	};

	// A cell of fixed area can be arbitrarily elongated — push t toward either end of its range and one
	// side of the tile goes to zero, so the period stretches. Each attempt therefore re-sizes the develop
	// from what it just learned: given the shortest period, the second one is at least cellArea/|v1| away,
	// and that is the radius the walk actually needs.
	for (let attempt = 0; attempt < 4; attempt++) {
		const walk = walkPentEdges(rec, board, { radius: reach, budget });
		const coreR = reach * 0.62;
		diag = { ...diag, placed: walk.placed, reach, ms: Date.now() - t0 };
		const last = attempt === 3;

		const found = findLattice(walk, board, coreR, cellArea);
		if (found && norm2(found.basis[1]) > 0) {
			const built = assemble(rec, walk, found.basis, tileArea, coreR, facesPerPeriod);
			diag = { ...diag, ...built.diag, ms: Date.now() - t0 };
			if (built.patch) return { ok: true, patch: built.patch, diag };
			if (last) return { ok: false, diag, reason: built.reason };
			reach *= 1.8;
			continue;
		}
		if (last)
			return {
				ok: false,
				diag,
				reason: found ? "period too elongated to develop" : "no period found in the developed patch",
			};
		// Sized, not doubled: reach past the second generator with enough margin that the faces can be
		// cut from a core that holds a whole period.
		const need = found ? (cellArea / found.shortest + found.shortest) * 1.25 : reach * 1.8 * 0.62;
		reach = Math.max(reach * 1.4, need / 0.62);
	}
	return { ok: false, diag, reason: "period larger than the develop budget allows" };
}

function assemble(
	rec: PentEdgeRecord,
	walk: PentWalk,
	basis: [Vec, Vec],
	tileArea: number,
	coreR: number,
	facesPerPeriod: number,
): { patch: FreedrawPatch | null; reason: string; diag: Partial<PentPatchDiag> } {
	const [T1, T2] = basis;
	const nV = walk.vertices.length;

	// --- vertices: one class per lattice orbit, anchored on the member nearest the origin ---
	const dsu = new OffsetDSU(nV);
	for (let i = 0; i < nV; i++) {
		const p = walk.vertices[i];
		for (const [t, dx, dy] of [
			[T1, 1, 0],
			[T2, 0, 1],
		] as const) {
			const j = walk.index.find(p.x + t[0], p.y + t[1]);
			if (j >= 0) dsu.union(i, j, dx, dy);
		}
	}
	// Pick the anchor of each class, then re-express every member relative to it.
	const anchor = new Map<number, number>();
	for (let i = 0; i < nV; i++) {
		const r = dsu.find(i).root;
		const cur = anchor.get(r);
		if (cur === undefined || norm2([walk.vertices[i].x, walk.vertices[i].y]) < norm2([walk.vertices[cur].x, walk.vertices[cur].y]))
			anchor.set(r, i);
	}
	const vClass = new Map<number, number>(); // root -> index into verts
	const verts: [number, number][] = [];
	const vorbit: number[] = [];
	const anchorOff = new Map<number, Vec>();
	for (const [root, a] of anchor) {
		vClass.set(root, verts.length);
		verts.push([walk.vertices[a].x, walk.vertices[a].y]);
		vorbit.push(walk.vorbit[a] ?? 0);
		const f = dsu.find(a);
		anchorOff.set(root, [f.x, f.y]);
	}
	/** Class index and integer lattice offset of a developed vertex, relative to its class anchor. */
	const place = (i: number): { vi: number; off: Vec } => {
		const f = dsu.find(i);
		const a = anchorOff.get(f.root)!;
		return { vi: vClass.get(f.root)!, off: [f.x - a[0], f.y - a[1]] };
	};

	// --- faces: cut from the develop, then reduced modulo the lattice ---
	const raw = extractFaces(walk, tileArea, coreR);
	const polys: [number, number, number][][] = [];
	const faceKey = new Map<string, number>();
	for (const ring of raw) {
		const corners = ring.map(place);
		// Canonical form: start the ring at whichever corner gives the lexicographically smallest
		// (class, offset) sequence once that corner is moved to the origin. Every ring is traversed the
		// same way round, so a rotation is the only freedom and no reflection has to be considered.
		let bestKey: string | null = null;
		let bestRing: [number, number, number][] | null = null;
		for (let r = 0; r < corners.length; r++) {
			const base = corners[r].off;
			const rot: [number, number, number][] = [];
			for (let i = 0; i < corners.length; i++) {
				const c = corners[(r + i) % corners.length];
				rot.push([c.vi, c.off[0] - base[0], c.off[1] - base[1]]);
			}
			const k = rot.map((c) => c.join(",")).join("|");
			if (bestKey === null || k < bestKey) {
				bestKey = k;
				bestRing = rot;
			}
		}
		if (bestKey === null || bestRing === null) continue;
		if (faceKey.has(bestKey)) continue;
		faceKey.set(bestKey, polys.length);
		polys.push(bestRing);
	}

	// Three independent counts have to land, and each catches a different way of being wrong: too few
	// faces means the core did not hold a whole period, too many means the basis is a sublattice, and
	// the vertex count going with neither means the fold merged or split classes.
	const diag = { verts: verts.length, faces: polys.length, edges: 0, comps: 0 };
	if (polys.length === 0)
		return { patch: null, reason: "no complete tile inside the developed patch", diag };
	if (polys.length !== facesPerPeriod)
		return {
			patch: null,
			reason: `period holds ${facesPerPeriod} tiles but ${polys.length} were cut`,
			diag,
		};
	if (verts.length !== 2 * facesPerPeriod)
		return {
			patch: null,
			reason: `period holds ${2 * facesPerPeriod} vertices but ${verts.length} were folded`,
			diag,
		};

	// --- edges: every developed edge with both ends inside the core, reduced modulo the lattice ---
	const edges: [number, number, number, number, number][] = [];
	const edgeKey = new Set<string>();
	const drawnOf = new Map<string, boolean>();
	for (const e of walk.edges) {
		const a = walk.vertices[e.u];
		const b = walk.vertices[e.v];
		if (Math.hypot(a.x, a.y) > coreR || Math.hypot(b.x, b.y) > coreR) continue;
		const pu = place(e.u);
		const pv = place(e.v);
		let vi = pu.vi;
		let vj = pv.vi;
		let dx = pv.off[0] - pu.off[0];
		let dy = pv.off[1] - pu.off[1];
		// One orientation per undirected edge, so the two developed copies of one quotient edge agree.
		if (vj < vi || (vj === vi && (dx < 0 || (dx === 0 && dy < 0)))) {
			[vi, vj] = [vj, vi];
			dx = -dx;
			dy = -dy;
		}
		const k = `${vi},${vj},${dx},${dy}`;
		if (edgeKey.has(k)) continue;
		edgeKey.add(k);
		edges.push([vi, vj, dx, dy, e.drawn ? 1 : 0]);
		drawnOf.set(k, e.drawn);
		drawnOf.set(`${vj},${vi},${-dx},${-dy}`, e.drawn);
	}
	diag.edges = edges.length;
	if (edges.length !== 3 * facesPerPeriod)
		return {
			patch: null,
			reason: `period holds ${3 * facesPerPeriod} edges but ${edges.length} were folded`,
			diag,
		};

	// --- tiles: faces merged across undrawn edges, carrying each face's lift ---
	// Directed half-edge -> the faces carrying it, and where that face sits when the half-edge starts
	// at its own class anchor. Two faces meet along every edge, which is how the merge finds them.
	const half = new Map<string, { p: number; off: Vec }[]>();
	for (let p = 0; p < polys.length; p++) {
		const ring = polys[p];
		for (let i = 0; i < ring.length; i++) {
			const [va, ax, ay] = ring[i];
			const [vb, bx, by] = ring[(i + 1) % ring.length];
			const k = `${va},${vb},${bx - ax},${by - ay}`;
			const list = half.get(k);
			if (list) list.push({ p, off: [ax, ay] });
			else half.set(k, [{ p, off: [ax, ay] }]);
		}
	}
	const merge = new OffsetDSU(polys.length);
	for (let p = 0; p < polys.length; p++) {
		const ring = polys[p];
		for (let i = 0; i < ring.length; i++) {
			const [va, ax, ay] = ring[i];
			const [vb, bx, by] = ring[(i + 1) % ring.length];
			const d: Vec = [bx - ax, by - ay];
			if (drawnOf.get(`${va},${vb},${d[0]},${d[1]}`) !== false) continue; // drawn, or unknown: a boundary
			for (const m of half.get(`${vb},${va},${-d[0]},${-d[1]}`) ?? []) {
				// The twin half-edge starts at vb, which sits at (bx, by) in p's frame and at m.off in the
				// neighbour's own frame — so the neighbour is lifted by the difference.
				merge.union(p, m.p, bx - m.off[0], by - m.off[1]);
			}
		}
	}

	const compOf = new Map<number, number>();
	const polyComp: number[] = [];
	const compLift: Vec[][] = [];
	const compPeriods: Vec[][] = [];
	for (let p = 0; p < polys.length; p++) {
		const f = merge.find(p);
		let c = compOf.get(f.root);
		if (c === undefined) {
			c = compLift.length;
			compOf.set(f.root, c);
			compLift.push([]);
			compPeriods.push([]);
		}
		polyComp.push(c);
		compLift[c].push([f.x, f.y]);
	}
	// Attribute each mismatch to its component by re-walking the undrawn adjacencies once more; the DSU
	// records them globally, and a strip's period must not classify its neighbour.
	for (let p = 0; p < polys.length; p++) {
		const ring = polys[p];
		const fp = merge.find(p);
		for (let i = 0; i < ring.length; i++) {
			const [va, ax, ay] = ring[i];
			const [vb, bx, by] = ring[(i + 1) % ring.length];
			const d: Vec = [bx - ax, by - ay];
			if (drawnOf.get(`${va},${vb},${d[0]},${d[1]}`) !== false) continue;
			for (const m of half.get(`${vb},${va},${-d[0]},${-d[1]}`) ?? []) {
				const fq = merge.find(m.p);
				if (fq.root !== fp.root) continue;
				const mx = fq.x - (fp.x + bx - m.off[0]);
				const my = fq.y - (fp.y + by - m.off[1]);
				if (mx !== 0 || my !== 0) compPeriods[compOf.get(fp.root)!].push([mx, my]);
			}
		}
	}

	const compRank = compPeriods.map((ps) => spanRank(ps));
	const compCells = compLift.map((l) => l.length);
	const compHoles = compRank.map((r, c) =>
		r === 0 ? holesOf(polys, polyComp, compLift[c], c) : 0,
	);

	const stats = {
		faceOrbits: compRank.length,
		finite: compRank.filter((r) => r === 0).length,
		strips: compRank.filter((r) => r === 1).length,
		unbounded: compRank.filter((r) => r === 2).length,
		withHoles: compHoles.filter((h) => h > 0).length,
	};
	diag.comps = compRank.length;

	return {
		patch: {
			T1,
			T2,
			verts,
			vorbit,
			edges,
			polys,
			polyComp,
			compRank,
			compCells,
			compHoles,
			stats,
		},
		reason: "",
		diag,
	};
}

/** Holes in a finite tile, as 1 - Euler characteristic of the assembled polyform. */
function holesOf(
	polys: [number, number, number][][],
	polyComp: number[],
	lifts: Vec[],
	comp: number,
): number {
	const members: number[] = [];
	for (let p = 0; p < polys.length; p++) if (polyComp[p] === comp) members.push(p);
	const V = new Set<string>();
	const E = new Set<string>();
	for (let i = 0; i < members.length; i++) {
		const ring = polys[members[i]];
		const [lx, ly] = lifts[i];
		for (let j = 0; j < ring.length; j++) {
			const [va, ax, ay] = ring[j];
			const [vb, bx, by] = ring[(j + 1) % ring.length];
			V.add(`${va},${ax + lx},${ay + ly}`);
			const a = `${va},${ax + lx},${ay + ly}`;
			const b = `${vb},${bx + lx},${by + ly}`;
			E.add(a < b ? `${a}|${b}` : `${b}|${a}`);
		}
	}
	return 1 - (V.size - E.size + members.length);
}
