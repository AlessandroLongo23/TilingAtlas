// The adjacency graph a cellular automaton runs on, derived from a tiling's fundamental cell.
//
// WHY THIS SHAPE. Every Euclidean record in the atlas is a fundamental cell (n polygons) plus a lattice
// basis (v1, v2); the plane is the ℤ² family of translates. So a tile in the plane is addressed by
// (i, j, t) — lattice cell (i, j), slot t within it — and the adjacency is TRANSLATION-INVARIANT: slot
// t's neighbours are always the same fixed list of (Δi, Δj, t'). That list is what this module computes,
// once per tiling, and it is the tiling analogue of "the eight Moore offsets" on the square grid.
//
// Everything downstream depends on that invariance. It is what lets the engine store a chunk of C×C
// lattice cells as a flat typed array with ONE precomputed offset table shared by every chunk, and it is
// what makes the unbounded plane tractable at all: an infinite board is a sparse map of chunks, not an
// infinite adjacency list. See lib/automata/engine.ts.
//
// MATCHING IS DONE MODULO THE LATTICE, PAIRWISE, NOT BY HASHING. Two tiles share an edge when one's edge
// midpoint equals the other's up to a lattice vector. Hashing quantized fractional coordinates would put
// a midpoint sitting exactly on the cell boundary in one bucket or its neighbour depending on the last
// bit of a floating-point divide, and silently drop the adjacency. The cell has tens to a few hundred
// edges, so the O(m²) pairwise test is microseconds and cannot fall off a boundary.

import { parseBaseCell, type RawPolygon, type TranslationalCellData } from "@/lib/utils/renderTiling";

/** A neighbour of slot `t` in the SAME lattice cell, reached by stepping (di, dj) lattice cells. */
export interface NeighborRef {
	/** Slot index within the fundamental cell. */
	t: number;
	di: number;
	dj: number;
}

export interface PeriodicAdjacency {
	/** Tiles per fundamental cell. */
	n: number;
	/** Side count per slot, for the per-shape rule mode and for labelling. */
	sides: number[];
	/** Slot centroids in world coordinates — the render anchor and the click target. */
	centroids: { x: number; y: number }[];
	/** The cell's closed polygons, in slot order. Carried so a symmetry test can compare OUTLINES and not
	 *  just centroids — a square and a rhombus of equal area share a centroid. See lib/automata/topology.ts. */
	polys: RawPolygon[];
	/** Median edge length: the scale every tolerance in this module and its consumers is measured in. */
	medianEdge: number;
	/** Edge-sharing neighbours (the von Neumann analogue): tiles sharing a full edge. */
	edge: NeighborRef[][];
	/** Edge- OR corner-sharing neighbours (the Moore analogue): everything touching. */
	moore: NeighborRef[][];
	/** Lattice basis, carried through so the engine and the renderer agree on the same v1, v2. */
	basis: [[number, number], [number, number]];
	/**
	 * Light-cone radius: the largest |di| or |dj| appearing in `moore`.
	 *
	 * One generation propagates influence at most this many lattice cells. The chunked engine uses it to
	 * size its halo, and it is the reason a chunk cannot be updated from its own contents alone.
	 */
	radius: number;
}

const EPS = 1e-7;

/**
 * Express `d` in the lattice basis and return the integer coefficients, or null when `d` is not a
 * lattice vector.
 *
 * Tolerance is on the RESIDUAL in world units, not on the coefficients: a near-degenerate basis (a long
 * thin cell, which several length families have) blows small coefficient error up into a large position
 * error, and it is the position that decides whether two tiles are actually the same tile.
 */
function latticeCoeffs(
	dx: number,
	dy: number,
	basis: [[number, number], [number, number]],
	tol: number,
): { di: number; dj: number } | null {
	const [[ax, ay], [bx, by]] = basis;
	const det = ax * by - bx * ay;
	if (Math.abs(det) < EPS) return null;
	const a = (dx * by - dy * bx) / det;
	const b = (ax * dy - ay * dx) / det;
	const di = Math.round(a);
	const dj = Math.round(b);
	const rx = dx - (di * ax + dj * bx);
	const ry = dy - (di * ay + dj * by);
	if (Math.hypot(rx, ry) > tol) return null;
	return { di, dj };
}

interface MarkedPoint {
	t: number;
	x: number;
	y: number;
}

/** Edge midpoints of every closed polygon in the cell, tagged with the slot they belong to. */
function edgeMidpoints(polys: RawPolygon[]): MarkedPoint[] {
	const out: MarkedPoint[] = [];
	for (let t = 0; t < polys.length; t++) {
		const p = polys[t];
		if (p.open) continue;
		const vs = p.vertices;
		for (let e = 0; e < vs.length; e++) {
			const a = vs[e];
			const b = vs[(e + 1) % vs.length];
			out.push({ t, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
		}
	}
	return out;
}

/** Corners of every closed polygon in the cell, tagged with the slot they belong to. */
function corners(polys: RawPolygon[]): MarkedPoint[] {
	const out: MarkedPoint[] = [];
	for (let t = 0; t < polys.length; t++) {
		const p = polys[t];
		if (p.open) continue;
		for (const v of p.vertices) out.push({ t, x: v.x, y: v.y });
	}
	return out;
}

/** Deduplicated, sorted neighbour list — a stable order so a soup seeded by index is reproducible. */
function normalize(refs: NeighborRef[]): NeighborRef[] {
	const seen = new Set<string>();
	const out: NeighborRef[] = [];
	for (const r of refs) {
		const key = `${r.t}|${r.di}|${r.dj}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(r);
	}
	out.sort((p, q) => p.t - q.t || p.di - q.di || p.dj - q.dj);
	return out;
}

/**
 * Collect the pairs of marked points that coincide modulo the lattice.
 *
 * A hit at (t, t', di, dj) means: slot t in cell (0,0) touches slot t' in cell (di, dj). The relation is
 * symmetric under (t, di, dj) → (t', -di, -dj), and both directions are recorded, so every slot's list is
 * complete on its own.
 */
function pairUp(points: MarkedPoint[], basis: [[number, number], [number, number]], tol: number, n: number): NeighborRef[][] {
	const acc: NeighborRef[][] = Array.from({ length: n }, () => []);
	for (let i = 0; i < points.length; i++) {
		const p = points[i];
		for (let j = i + 1; j < points.length; j++) {
			const q = points[j];
			// q sits at lattice cell (di, dj) relative to p when p - q is that lattice vector.
			const c = latticeCoeffs(p.x - q.x, p.y - q.y, basis, tol);
			if (!c) continue;
			// The same tile, not a neighbour of itself.
			if (p.t === q.t && c.di === 0 && c.dj === 0) continue;
			acc[p.t].push({ t: q.t, di: c.di, dj: c.dj });
			acc[q.t].push({ t: p.t, di: -c.di, dj: -c.dj });
		}
	}
	return acc.map(normalize);
}

/**
 * Build the periodic adjacency of a tiling from its fundamental cell.
 *
 * Returns null when the cell will not parse or carries no closed polygon — the same contract every other
 * consumer of `parseBaseCell` has, and the caller then has nothing to simulate.
 */
export function buildPeriodicAdjacency(cell: TranslationalCellData | null): PeriodicAdjacency | null {
	if (!cell) return null;
	const base = parseBaseCell(cell);
	if (!base) return null;
	const polys = base.polys.filter((p) => !p.open);
	if (polys.length === 0) return null;

	// Tolerance rides on the median edge, so a cell scaled to unit edges and the same cell scaled to
	// pixels both match. A twentieth of an edge is far below any real gap between distinct tiles and far
	// above the float error in a cyclotomic evaluation.
	const tol = base.medianEdge / 20;
	const n = polys.length;

	const edge = pairUp(edgeMidpoints(polys), base.basis, tol, n);
	const vertex = pairUp(corners(polys), base.basis, tol, n);

	// Moore = edge ∪ corner. Corner matching already returns every edge-neighbour too (a shared edge
	// shares its two endpoints), so the union is really just the corner set — but taking it explicitly
	// keeps the two independent, which is what the test asserts.
	const moore = edge.map((es, t) => normalize([...es, ...vertex[t]]));

	let radius = 0;
	for (const list of moore) {
		for (const r of list) radius = Math.max(radius, Math.abs(r.di), Math.abs(r.dj));
	}

	const centroids = polys.map((p) => {
		let cx = 0;
		let cy = 0;
		for (const v of p.vertices) {
			cx += v.x;
			cy += v.y;
		}
		return { x: cx / p.vertices.length, y: cy / p.vertices.length };
	});

	return {
		n,
		sides: polys.map((p) => p.n),
		centroids,
		polys,
		medianEdge: base.medianEdge,
		edge,
		moore,
		basis: base.basis,
		radius: Math.max(1, radius),
	};
}

/**
 * The neighbour list actually used for a run, given the neighbourhood choice and a range.
 *
 * Range r > 1 (the Larger-than-Life case) is the r-step ball in the chosen graph, computed by BFS over
 * the periodic structure — walk out from slot t accumulating (Δi, Δj) as you go, which is exactly the
 * DFS the original TilingLife engine intended and never actually ran (its result was overwritten before
 * use, so every rule there ran on plain edge adjacency).
 */
export function neighborhoodOf(
	adj: PeriodicAdjacency,
	kind: "edge" | "moore",
	range = 1,
): NeighborRef[][] {
	const base = kind === "edge" ? adj.edge : adj.moore;
	if (range <= 1) return base;

	const out: NeighborRef[][] = [];
	for (let t = 0; t < adj.n; t++) {
		const seen = new Map<string, NeighborRef>();
		let frontier: NeighborRef[] = [{ t, di: 0, dj: 0 }];
		const visited = new Set<string>([`${t}|0|0`]);
		for (let step = 0; step < range; step++) {
			const next: NeighborRef[] = [];
			for (const cur of frontier) {
				for (const nb of base[cur.t]) {
					const ref = { t: nb.t, di: cur.di + nb.di, dj: cur.dj + nb.dj };
					const key = `${ref.t}|${ref.di}|${ref.dj}`;
					if (visited.has(key)) continue;
					visited.add(key);
					// The starting tile is not its own neighbour even if a cycle walks back onto it.
					if (!(ref.t === t && ref.di === 0 && ref.dj === 0)) seen.set(key, ref);
					next.push(ref);
				}
			}
			frontier = next;
		}
		out.push(normalize([...seen.values()]));
	}
	return out;
}

/** Largest |Δi| or |Δj| in a neighbour table — the halo the chunked engine has to carry. */
export function tableRadius(table: NeighborRef[][]): number {
	let r = 1;
	for (const list of table) {
		for (const ref of list) r = Math.max(r, Math.abs(ref.di), Math.abs(ref.dj));
	}
	return r;
}
