// Turn a DEVELOPED edge decoration into a periodic patch: one fundamental domain plus the two
// translations that stamp it across the plane.
//
// WHY THIS EXISTS, AND WHY IT IS BOARD-AGNOSTIC. Marek Čtrnáct's fixed boards (combined grid, both
// Schwarz boards) ship their patch pre-baked from the developer, because their geometry never moves.
// The parametric boards cannot: a Kershner pentagon and an isohedral type are FAMILIES, so the lattice
// itself moves when a slider moves and the patch has to be rebuilt on the client at whatever point of
// the family the sliders name. Both families need exactly the same recovery, and neither needs to know
// what the other's tile is, so it lives here once:
//
//   1. Walk the darts (the caller's developer) out to a radius wide enough to hold a few periods.
//   2. Recover the period lattice EMPIRICALLY. Every re-placement of one quotient dart at one heading is
//      a translation of the figure onto itself, because both walk moves are direct isometries. The two
//      shortest independent such vectors are a basis; in two dimensions the successive minima always are.
//   3. Fold the vertices onto that lattice, cut the faces out of the planar rotation system, and merge
//      faces across UNDRAWN edges into tiles, carrying each face's lift so an infinite tile is recognised
//      as infinite (the holonomy trick from lib/freedraw/faces.ts, which explains it).
//
// Step 2 is verified, not assumed, in two independent ways. A candidate only becomes a basis vector once
// translating a sample of real edges by it lands on edges carrying the same drawn bit — without that a
// GLIDE would pass for a period on any pattern that has one, and the figure would render as a plausible
// lie. And the fold then has to agree with the certificate's own VERTEX ORBIT labels: a translation of
// the drawn edges that permutes orbit labels is a symmetry of the tiling but not of the decoration as
// the certificate describes it, and folding on it would silently merge two orbits into one colour.
//
// The face, vertex and edge counts per period are cross-checked against Euler on the torus. For a board
// whose tile is an n-gon, 2E = nF and V - E + F = 0, so E = nF/2 and V = F(n - 2)/2 — three independent
// counts from one number, each catching a different way of being wrong.

import type { Curve4, FreedrawPatch } from "./pattern";

type Vec = [number, number];

/** What a developer must hand over. `lib/pentagon/edgeDevelop.ts` and `lib/isohedral/edgeDevelop.ts`
 *  both satisfy this structurally, which is the whole point of the shape. */
export interface DevelopedWalk {
	vertices: { x: number; y: number }[];
	/** Certificate vertex-orbit label per vertex. */
	vorbit: number[];
	/** `curve` is the edge's bow in its own u→v chord frame — [t1, s1, t2, s2], t along the chord and s
	 *  on its left, in units of the chord's length. Absent or null means a straight edge, which is what
	 *  every board that is not a parametric isohedral type gives. */
	edges: {
		u: number;
		v: number;
		drawn: boolean;
		curve?: readonly [number, number, number, number] | null;
	}[];
	/** Placed darts: which quotient dart, where its vertex is, which way it points. The period lattice
	 *  is read off these, so a developer that throws them away cannot be patched. */
	instances: { h: number; x: number; y: number; th: number }[];
	/** Position lookup, so the fold can ask whether a translated point is a vertex of the walk. */
	index: { find(x: number, y: number): number };
	placed: number;
	truncated: boolean;
}

/** The board tile at one parameter point: everything the builder needs to know about the geometry. */
export interface EdgePatchTile {
	/** The tile's corners, in boundary order. Its AREA sizes the period and its CORNER COUNT cuts the
	 *  faces, so a board whose tile is a hexagon and one whose tile is a pentagon differ only here. */
	outline: { x: number; y: number }[];
	/** Edge-class lengths. The shortest sets tolerances, the longest sizes the develop. */
	classLengths: number[];
}

export interface EdgePatchOptions {
	/** Develop radius in units of the LONGEST edge class. Grown automatically when the period is big. */
	reach?: number;
	/** Hard ceiling on developed dart instances. */
	budget?: number;
	/** Tiles in the CERTIFICATE's cell, when the caller can count them.
	 *
	 *  A constraint, never a search key. The certificate cell is always a whole number of periods, but
	 *  WHICH number is a property of the record, not of the board — every IH01 record's cell is exactly
	 *  two periods, while IH02's is one for most records and two for a handful. So the check is that the
	 *  period DIVIDES it: that still catches a sublattice (which gives a period too big to divide it) and
	 *  a mis-scaled fold, without pretending the ratio is known in advance. */
	certFaces?: number;
	/** How many attempts to grow the develop before giving up. */
	attempts?: number;
}

export interface EdgePatchDiag {
	/** Dart instances the walk placed. */
	placed: number;
	/** Vertices, faces and edges in one period. */
	verts: number;
	faces: number;
	edges: number;
	/** Tiles (faces merged across undrawn edges) per period. */
	comps: number;
	/** Cell area divided by tile area: how many board tiles one period holds. */
	facesPerPeriod: number;
	reach: number;
	ms: number;
}

export type EdgePatchResult =
	| { ok: true; patch: FreedrawPatch; diag: EdgePatchDiag; reason?: undefined }
	| { ok: false; patch?: undefined; diag: EdgePatchDiag; reason: string };

const cross = (a: Vec, b: Vec) => a[0] * b[1] - a[1] * b[0];
const norm2 = (a: Vec) => a[0] * a[0] + a[1] * a[1];

/** A chord-local cubic: the two interior control points as (t along the chord, s to its left). */
type Chord = readonly [number, number, number, number];

/** The same arc described from the other end. */
const flipChord = (c: Chord): Chord => [1 - c[2], -c[3], 1 - c[0], -c[1]];

/**
 * Chord-local control points to WORLD offsets from the edge's start.
 *
 * The chord frame is (along, left) scaled by the chord's own length, so this is one similarity and the
 * curve keeps its shape under whatever rotation the develop applied to this edge. Storing OFFSETS and
 * not absolute points is what lets the renderer stamp a curved edge across the lattice by adding the
 * same translation it already adds to the endpoints.
 */
function chordToWorld(c: Chord, ax: number, ay: number, bx: number, by: number): Curve4 {
	const dx = bx - ax;
	const dy = by - ay;
	return [
		c[0] * dx - c[1] * dy,
		c[0] * dy + c[1] * dx,
		c[2] * dx - c[3] * dy,
		c[2] * dy + c[3] * dx,
	];
}

/** Signed area of a ring, positive counter-clockwise. */
export function ringArea(pts: { x: number; y: number }[]): number {
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

/** Edge midpoints of the develop, plus the subset inside the core: the evidence `isPeriod` weighs. */
function sampleEdges(walk: DevelopedWalk, tol: number, coreR: number) {
	const key = (x: number, y: number) => `${Math.round(x / tol)},${Math.round(y / tol)}`;
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

/**
 * Is `v` a translation of the developed decoration onto itself?
 *
 * Two conditions, and the second is the one a drawn-bit check alone would miss. Every sampled interior
 * edge must map to an edge carrying the same drawn bit — that is what catches a glide, whose midpoints
 * and drawn bits fail to line up even though it moves a symmetric figure onto itself as a set. And every
 * sampled vertex must map to a vertex with the same certificate ORBIT label, because a translation that
 * permutes orbits is a symmetry of the tiling but not of the decoration the certificate describes, and
 * folding on it would merge two orbits into one colour.
 */
function isPeriod(
	walk: DevelopedWalk,
	edges: ReturnType<typeof sampleEdges>,
	v: Vec,
	coreR: number,
): boolean {
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
	if (checked < Math.max(8, inner.length * 0.15)) return false;

	for (let i = 0; i < walk.vertices.length; i++) {
		const p = walk.vertices[i];
		if (Math.hypot(p.x, p.y) > coreR) continue;
		const j = walk.index.find(p.x + v[0], p.y + v[1]);
		if (j < 0) continue;
		if ((walk.vorbit[j] ?? 0) !== (walk.vorbit[i] ?? 0)) return false;
	}
	return true;
}

/** Lagrange reduction: subtract multiples until neither vector shortens the other. Leaves a basis of
 *  the SAME lattice, as short and as near-orthogonal as two dimensions allow — and a short basis is what
 *  keeps the draw loop from covering the view with far more cells than it needs. */
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
 * The period lattice, read off the walk and then checked against the figure.
 *
 * Candidates are the differences between placements of ONE dart at ONE heading. Grouping over every
 * dart, not just the seed, is what lets a small develop still see a short second generator: a period
 * that no re-placement of dart 0 witnesses inside the disc is usually witnessed by some other dart.
 *
 * Taking the shortest verified pair means the result can only ever be the true period lattice or a
 * sublattice of it, never a coarser lattice that is not a period at all. A sublattice draws a period
 * some integer multiple too big, which is wasteful and is caught by the face-count check; a non-period
 * would draw a lie, and `isPeriod` is what rules that out.
 */
function findLattice(
	walk: DevelopedWalk,
	tol: number,
	coreR: number,
): { basis: [Vec, Vec]; shortest: number } | null {
	const DIR = 1e-6;
	const first = new Map<string, Vec>();
	const cand: Vec[] = [];
	for (const inst of walk.instances) {
		if (Math.hypot(inst.x, inst.y) > coreR) continue;
		const dk = `${inst.h}|${Math.round(Math.cos(inst.th) / DIR)},${Math.round(Math.sin(inst.th) / DIR)}`;
		const seed = first.get(dk);
		if (!seed) {
			first.set(dk, [inst.x, inst.y]);
			continue;
		}
		const v: Vec = [inst.x - seed[0], inst.y - seed[1]];
		if (norm2(v) > tol * tol) cand.push(v);
	}
	if (!cand.length) return null;
	cand.sort((a, b) => norm2(a) - norm2(b));

	const edges = sampleEdges(walk, tol, coreR);
	let v1: Vec | null = null;
	for (const v of cand) {
		// Skip a repeat of a candidate already rejected or accepted, and anything parallel to v1: a
		// parallel vector is either v1 again or a multiple of it, never a second generator.
		if (v1 && Math.abs(cross(v1, v)) < tol * Math.hypot(...v1)) continue;
		if (!isPeriod(walk, edges, v, coreR)) continue;
		if (!v1) v1 = v;
		else return { basis: reduce(v1, v), shortest: Math.hypot(...v1) };
	}
	// A shortest vector but no partner: the cell is elongated and its second generator lies further out
	// than this develop reaches. Report how far, so the caller can size the next attempt.
	return v1 ? { basis: [v1, [0, 0]], shortest: Math.hypot(...v1) } : null;
}

/** Faces of the developed planar graph, as vertex rings, counter-clockwise. Only complete board tiles
 *  survive: `corners` corners, the tile's own area, and every corner well inside the developed disc. */
function extractFaces(
	walk: DevelopedWalk,
	tileArea: number,
	coreR: number,
	corners: number,
): number[][] {
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
			for (let step = 0; step <= corners + 2; step++) {
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
			if (!ok || s !== s0 || t !== t0 || ring.length !== corners) continue;
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
 * Build the periodic patch for one developed decoration, or say why it could not.
 *
 * Cost is dominated by the develop, so the caller should memoise on (record, parameter point) and NOT
 * call this per frame — panning and zooming re-instance the finished patch and never rebuild it.
 */
export function buildEdgePatch(
	tile: EdgePatchTile,
	walkAt: (radius: number, budget: number) => DevelopedWalk,
	opts: EdgePatchOptions = {},
): EdgePatchResult {
	const t0 = Date.now();
	const corners = tile.outline.length;
	const longest = Math.max(...tile.classLengths);
	const shortest = Math.min(...tile.classLengths);
	const tileArea = Math.abs(ringArea(tile.outline));
	const tol = shortest * 1e-5;
	const budget = opts.budget ?? 60000;
	const attempts = opts.attempts ?? 4;
	let reach = (opts.reach ?? 5) * longest;

	let diag: EdgePatchDiag = {
		placed: 0,
		verts: 0,
		faces: 0,
		edges: 0,
		comps: 0,
		facesPerPeriod: 0,
		reach,
		ms: 0,
	};

	// A cell of fixed area can be arbitrarily elongated — push a parameter toward the end of its range
	// and one side of the tile goes to zero, so the period stretches. Each attempt re-sizes the develop
	// from what it just learned: given the shortest period, the second is at least cellArea/|v1| away.
	for (let attempt = 0; attempt < attempts; attempt++) {
		const walk = walkAt(reach, budget);
		const coreR = reach * 0.62;
		diag = { ...diag, placed: walk.placed, reach, ms: Date.now() - t0 };
		const last = attempt === attempts - 1;

		const found = findLattice(walk, tol, coreR);
		if (found && norm2(found.basis[1]) > 0) {
			const cellArea = Math.abs(cross(found.basis[0], found.basis[1]));
			const fpp = cellArea / tileArea;
			diag = { ...diag, facesPerPeriod: fpp };
			const built = assemble(walk, found.basis, tileArea, coreR, corners, fpp, opts.certFaces);
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
		// cut from a core that holds a whole period. Without a first vector there is nothing to size on,
		// so fall back to growing.
		const need = found ? (found.shortest * 4 + longest * 2) * 1.25 : reach * 1.8 * 0.62;
		reach = Math.max(reach * 1.4, need / 0.62);
	}
	return { ok: false, diag, reason: "period larger than the develop budget allows" };
}

function assemble(
	walk: DevelopedWalk,
	basis: [Vec, Vec],
	tileArea: number,
	coreR: number,
	corners: number,
	facesPerPeriod: number,
	certFaces: number | undefined,
): { patch: FreedrawPatch | null; reason: string; diag: Partial<EdgePatchDiag> } {
	const [T1, T2] = basis;
	const nV = walk.vertices.length;
	const zero = { verts: 0, faces: 0, edges: 0, comps: 0 };

	// The cell has to hold a whole number of tiles before anything else is worth doing.
	const F = Math.round(facesPerPeriod);
	if (F < 1 || Math.abs(facesPerPeriod - F) > 1e-4 * Math.max(1, F))
		return {
			patch: null,
			reason: `period spans ${facesPerPeriod.toFixed(3)} tiles, which is not a whole number`,
			diag: zero,
		};
	if (certFaces !== undefined && (F > certFaces || certFaces % F !== 0))
		return {
			patch: null,
			reason: `period of ${F} tiles does not divide the certificate's ${certFaces}`,
			diag: zero,
		};
	// Euler on the torus for an n-gon board: 2E = nF and V - E + F = 0.
	const wantE = (corners * F) / 2;
	const wantV = wantE - F;

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
		if (
			cur === undefined ||
			norm2([walk.vertices[i].x, walk.vertices[i].y]) <
				norm2([walk.vertices[cur].x, walk.vertices[cur].y])
		)
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
	const raw = extractFaces(walk, tileArea, coreR, corners);
	const polys: [number, number, number][][] = [];
	const faceKey = new Map<string, number>();
	for (const ring of raw) {
		const cs = ring.map(place);
		// Canonical form: start the ring at whichever corner gives the lexicographically smallest
		// (class, offset) sequence once that corner is moved to the origin. Every ring is traversed the
		// same way round, so a rotation is the only freedom and no reflection has to be considered.
		let bestKey: string | null = null;
		let bestRing: [number, number, number][] | null = null;
		for (let r = 0; r < cs.length; r++) {
			const base = cs[r].off;
			const rot: [number, number, number][] = [];
			for (let i = 0; i < cs.length; i++) {
				const c = cs[(r + i) % cs.length];
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
	if (polys.length !== F)
		return { patch: null, reason: `period holds ${F} tiles but ${polys.length} were cut`, diag };
	if (verts.length !== wantV)
		return {
			patch: null,
			reason: `period holds ${wantV} vertices but ${verts.length} were folded`,
			diag,
		};

	// --- edges: every developed edge with both ends inside the core, reduced modulo the lattice ---
	const edges: [number, number, number, number, number][] = [];
	const edgeKey = new Set<string>();
	const drawnOf = new Map<string, boolean>();
	// Chord curve per ORIENTED quotient edge, so the fill pass can read the arc leaving any ring corner
	// without re-deriving which way round the ring is traversing it.
	const chordOf = new Map<string, Chord>();
	const edgeCurves: (Curve4 | null)[] = [];
	let anyCurve = false;
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
		let bow = e.curve ?? null;
		// One orientation per undirected edge, so the two developed copies of one quotient edge agree.
		// The bow is described in the edge's own u→v frame, so it has to turn round with it.
		if (vj < vi || (vj === vi && (dx < 0 || (dx === 0 && dy < 0)))) {
			[vi, vj] = [vj, vi];
			dx = -dx;
			dy = -dy;
			if (bow) bow = flipChord(bow);
		}
		const k = `${vi},${vj},${dx},${dy}`;
		if (edgeKey.has(k)) continue;
		edgeKey.add(k);
		edges.push([vi, vj, dx, dy, e.drawn ? 1 : 0]);
		drawnOf.set(k, e.drawn);
		drawnOf.set(`${vj},${vi},${-dx},${-dy}`, e.drawn);
		if (bow) {
			anyCurve = true;
			chordOf.set(k, bow);
			chordOf.set(`${vj},${vi},${-dx},${-dy}`, flipChord(bow));
			const A = verts[vi];
			const B = verts[vj];
			edgeCurves.push(
				chordToWorld(bow, A[0], A[1], B[0] + dx * T1[0] + dy * T2[0], B[1] + dx * T1[1] + dy * T2[1]),
			);
		} else {
			edgeCurves.push(null);
		}
	}
	diag.edges = edges.length;
	if (edges.length !== wantE)
		return { patch: null, reason: `period holds ${wantE} edges but ${edges.length} were folded`, diag };

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

	// Ring arcs for the fill pass. A ring corner sits at verts[va] + (ax, ay)·T, and the arc leaving it
	// is the oriented quotient edge to the next corner — looked up in the direction the RING travels,
	// which is why `chordOf` carries both orientations.
	const polyCurves: (Curve4 | null)[][] = polys.map((ring) =>
		ring.map((_, i) => {
			const [va, ax, ay] = ring[i];
			const [vb, bx, by] = ring[(i + 1) % ring.length];
			const bow = chordOf.get(`${va},${vb},${bx - ax},${by - ay}`);
			if (!bow) return null;
			const A = verts[va];
			const B = verts[vb];
			const d: Vec = [bx - ax, by - ay];
			return chordToWorld(
				bow,
				A[0],
				A[1],
				B[0] + d[0] * T1[0] + d[1] * T2[0],
				B[1] + d[0] * T1[1] + d[1] * T2[1],
			);
		}),
	);

	const compRank = compPeriods.map((ps) => spanRank(ps));
	const compCells = compLift.map((l) => l.length);
	const compHoles = compRank.map((r, c) => (r === 0 ? holesOf(polys, polyComp, compLift[c], c) : 0));

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
			// Omitted entirely when nothing bows, so a straight board's patch is byte-for-byte what it was
			// before curves existed and the renderer takes its fast path.
			...(anyCurve ? { edgeCurves, polyCurves } : {}),
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
