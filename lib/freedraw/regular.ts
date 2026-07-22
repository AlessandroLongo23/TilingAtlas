// Which freedraw tiles are REGULAR POLYGONS, and therefore which patterns are tilings by regular
// polygons. AL, 2026-07-22: "in theory every k-uniform tiling sits on a triangle and square grid, so
// these patterns should be a superset of the k-uniform tilings" — true, and this is the filter that
// finds them.
//
// The dissections that make it true: a unit hexagon is 6 unit triangles, and a unit dodecagon is
// 6 squares + 12 triangles (area 6 + 12·√3/4 = 3(2+√3) ✓). The one exception is the octagon: 135° is
// not a non-negative integer combination of 60° and 90°, so 4.8.8 has no dissection into unit
// triangles and squares — the same lone exception as t1002 under the settled 12-direction decision.
//
// THE TRAP. A tile is a component of the underlying faces glued across UNDRAWN edges, so its boundary
// is the DRAWN edges it touches, NOT the outer hull of its cells. A drawn edge with the same component
// on both sides is a slit reaching into the tile; the boundary walk crosses it twice and the tile is
// not a polygon at all. Cancelling interior edges geometrically instead of by drawn-status turns such
// a tile into a clean n-gon — which reported 7 all-hexagon patterns at k=2, where the honeycomb is the
// unique edge-to-edge tiling by regular hexagons and exactly one is possible. Hence `walkBoundary`
// below keys on drawn-status alone and rejects any corner with two exits.
//
// Because all tiles regular implies every boundary grid point is a corner of every incident tile,
// such a pattern has no T-junctions: it IS an edge-to-edge tiling by regular polygons, i.e. k'-uniform
// for some k'. On the combined grid the {3,4}-only slice comes out 4 / 7 / 17 at k = 1 / 2 / 3, which
// is exactly what the `tri-square` oracle palette independently enumerates — for a tiling made only of
// unit triangles and squares no dissection happens, so its grid points are its vertices and freedraw k
// equals classical k.

import { componentLifts, type FaceAnalysis, type FaceInfo } from "./faces";
import { coset, gridOf, type FreedrawGrid, type FreedrawPattern } from "./pattern";

/** Regular polygons reachable on a triangle/square grid. The octagon provably cannot appear. */
export const REGULAR_KINDS = [3, 4, 6, 12] as const;
export type RegularKind = (typeof REGULAR_KINDS)[number];

export interface RegularFace {
	/** Corner count after merging collinear runs. */
	n: RegularKind;
	/** Side length in grid edges — 1 for an edge-to-edge tile, 2+ for a dilated one (a 2x2 block). */
	side: number;
}

export interface RegularInfo {
	/** Per face id, aligned with FaceAnalysis.faces. Null when the face is not a regular polygon. */
	perFace: (RegularFace | null)[];
	/** Which regular polygons occur, at any scale. */
	kinds: Set<RegularKind>;
	/** Every face is a regular polygon: the pattern is a tiling by regular polygons. */
	allRegular: boolean;
	/** ...and every one of them is edge-to-edge with the grid. These are the k-uniform tilings. */
	allUnit: boolean;
}

const SQRT3_2 = Math.sqrt(3) / 2;
const EPS = 1e-6;

type Pt = [number, number];
/** A boundary corner as an integer grid vertex, so the walk compares exactly. */
type Corner = string;

const world = (grid: FreedrawGrid, x: number, y: number): Pt =>
	grid === "triangle" ? [x + 0.5 * y, y * SQRT3_2] : [x, y];

/**
 * Directed boundary edges of one cell, counter-clockwise, as [fromVertex, toVertex, drawn].
 * Square cell (x, y) is the unit square with corner (x, y). Triangle cells come from the tripled-
 * centroid encoding in FaceInfo.lifts: (3x+r, 3y+r) with r = 1 up, r = 2 down.
 */
function cellRing(p: FreedrawPattern, grid: FreedrawGrid, lift: [number, number]): [Pt, Pt, boolean][] {
	const h = (x: number, y: number) => p.h[coset(p, x, y)] === 1;
	const v = (x: number, y: number) => p.v[coset(p, x, y)] === 1;
	const w = (x: number, y: number) => (p.w ?? [])[coset(p, x, y)] === 1;
	if (grid === "square") {
		const [x, y] = lift;
		return [
			[[x, y], [x + 1, y], h(x, y)],
			[[x + 1, y], [x + 1, y + 1], v(x + 1, y)],
			[[x + 1, y + 1], [x, y + 1], h(x, y + 1)],
			[[x, y + 1], [x, y], v(x, y)],
		];
	}
	const r = ((lift[0] % 3) + 3) % 3;
	const x = (lift[0] - r) / 3;
	const y = (lift[1] - r) / 3;
	if (r === 1) {
		// Up triangle: (x,y) -> (x+1,y) -> (x,y+1).
		return [
			[[x, y], [x + 1, y], h(x, y)],
			[[x + 1, y], [x, y + 1], w(x, y + 1)],
			[[x, y + 1], [x, y], v(x, y)],
		];
	}
	// Down triangle: (x+1,y) -> (x+1,y+1) -> (x,y+1).
	return [
		[[x + 1, y], [x + 1, y + 1], v(x + 1, y)],
		[[x + 1, y + 1], [x, y + 1], h(x, y + 1)],
		[[x, y + 1], [x + 1, y], w(x, y + 1)],
	];
}

/**
 * Follow the drawn edges around one tile. Returns the corner cycle in world coordinates, or null
 * when the boundary is not a single simple cycle — a slit, a pinch point, or a hole all land here.
 */
function walkBoundary(edges: [Pt, Pt][], key: (p: Pt) => Corner): Pt[] | null {
	const next = new Map<Corner, Pt>();
	const at = new Map<Corner, Pt>();
	for (const [a, b] of edges) {
		const ka = key(a);
		if (next.has(ka)) return null; // two exits from one corner
		next.set(ka, b);
		at.set(ka, a);
	}
	if (next.size === 0) return null;
	const startKey = next.keys().next().value as Corner;
	const start = at.get(startKey) as Pt;
	const cycle: Pt[] = [start];
	let cur = next.get(startKey) as Pt;
	while (key(cur) !== startKey) {
		const step = next.get(key(cur));
		if (!step || cycle.length > edges.length) return null;
		cycle.push(cur);
		cur = step;
	}
	return cycle.length === edges.length ? cycle : null; // shorter cycle => a second loop exists
}

/**
 * Is this corner cycle a regular polygon? Collinear runs merge first, so a 2x2 block of cells reads
 * as a square of side 2 rather than an 8-gon. Regular = all sides equal and all turns equal.
 */
function regularOf(cycle: Pt[]): RegularFace | null {
	const pts: Pt[] = [];
	const m = cycle.length;
	for (let i = 0; i < m; i++) {
		const prev = cycle[(i - 1 + m) % m];
		const cur = cycle[i];
		const nxt = cycle[(i + 1) % m];
		const ux = cur[0] - prev[0];
		const uy = cur[1] - prev[1];
		const vx = nxt[0] - cur[0];
		const vy = nxt[1] - cur[1];
		if (Math.abs(ux * vy - uy * vx) > EPS) pts.push(cur); // a real turn
	}
	const n = pts.length;
	if (n < 3) return null;
	let side = -1;
	let turn = Number.NaN;
	for (let i = 0; i < n; i++) {
		const a = pts[i];
		const b = pts[(i + 1) % n];
		const c = pts[(i + 2) % n];
		const ux = b[0] - a[0];
		const uy = b[1] - a[1];
		const len = Math.hypot(ux, uy);
		if (side < 0) side = len;
		else if (Math.abs(len - side) > 1e-4) return null;
		const vx = c[0] - b[0];
		const vy = c[1] - b[1];
		const t = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
		if (Number.isNaN(turn)) turn = t;
		else if (Math.abs(t - turn) > 1e-4) return null;
	}
	if (Math.abs(Math.abs(turn) - (2 * Math.PI) / n) > 1e-4) return null;
	if (!REGULAR_KINDS.includes(n as RegularKind)) return null;
	return { n: n as RegularKind, side: Math.round(side) };
}

function regularOfFace(p: FreedrawPattern, grid: FreedrawGrid, face: FaceInfo): RegularFace | null {
	if (face.rank !== 0 || face.holes !== 0) return null;
	const edges: [Pt, Pt][] = [];
	for (const lift of face.lifts) {
		for (const [a, b, drawn] of cellRing(p, grid, lift)) {
			if (drawn) edges.push([world(grid, a[0], a[1]), world(grid, b[0], b[1])]);
		}
	}
	const cycle = walkBoundary(edges, (q) => `${q[0].toFixed(4)},${q[1].toFixed(4)}`);
	return cycle ? regularOf(cycle) : null;
}

/**
 * Combined grid: the patch carries explicit geometry, so the same drawn-boundary walk runs on its
 * polys — but only after reassembling the tile. The developer emits scattered cells (a hexagon's six
 * triangles can sit a period apart), so componentLifts lifts each poly into a connected layout first;
 * without it a hexagon's boundary edges never close into one cycle and the tile reads as non-regular.
 * The drawn lookup keys on the offset DIFFERENCE along an edge, which the lift leaves unchanged, so it
 * still resolves; only the world positions carry the lift.
 */
function regularOfPatch(p: FreedrawPattern, comp: number): RegularFace | null {
	const patch = p.patch;
	if (!patch) return null;
	if (patch.compRank[comp] !== 0 || patch.compHoles[comp] !== 0) return null;
	const drawn = new Map<string, boolean>();
	for (const [a, b, dx, dy, d] of patch.edges) {
		drawn.set(`${a},${b},${dx},${dy}`, d === 1);
		drawn.set(`${b},${a},${-dx},${-dy}`, d === 1);
	}
	const pos = (vi: number, ox: number, oy: number): Pt => [
		patch.verts[vi][0] + ox * patch.T1[0] + oy * patch.T2[0],
		patch.verts[vi][1] + ox * patch.T1[1] + oy * patch.T2[1],
	];
	const lift = componentLifts(patch, comp);
	const edges: [Pt, Pt][] = [];
	for (let pi = 0; pi < patch.polys.length; pi++) {
		if (patch.polyComp[pi] !== comp) continue;
		const [lx, ly] = lift.get(pi) ?? [0, 0];
		const ring = patch.polys[pi];
		for (let i = 0; i < ring.length; i++) {
			const a = ring[i];
			const b = ring[(i + 1) % ring.length];
			const hit = drawn.get(`${a[0]},${b[0]},${b[1] - a[1]},${b[2] - a[2]}`);
			if (hit === undefined) return null;
			if (hit) edges.push([pos(a[0], a[1] + lx, a[2] + ly), pos(b[0], b[1] + lx, b[2] + ly)]);
		}
	}
	const cycle = walkBoundary(edges, (q) => `${q[0].toFixed(4)},${q[1].toFixed(4)}`);
	return cycle ? regularOf(cycle) : null;
}

const cache = new WeakMap<FaceAnalysis, RegularInfo>();

/**
 * Classify every tile of a pattern. Memoised on the analysis object, which callers already keep per
 * pattern, so a catalogue sweep pays for each pattern once.
 */
export function classifyRegular(p: FreedrawPattern, a: FaceAnalysis): RegularInfo {
	const hit = cache.get(a);
	if (hit) return hit;
	const grid = gridOf(p);
	const perFace: (RegularFace | null)[] =
		grid === "ts"
			? a.faces.map((f) => regularOfPatch(p, f.id))
			: a.faces.map((f) => regularOfFace(p, grid, f));
	const kinds = new Set<RegularKind>();
	let allRegular = perFace.length > 0;
	let allUnit = allRegular;
	for (const r of perFace) {
		if (!r) {
			allRegular = false;
			allUnit = false;
			continue;
		}
		kinds.add(r.n);
		if (r.side !== 1) allUnit = false;
	}
	const out: RegularInfo = { perFace, kinds, allRegular, allUnit };
	cache.set(a, out);
	return out;
}
