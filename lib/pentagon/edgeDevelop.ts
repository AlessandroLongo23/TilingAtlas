// Realise one `edges_pentagons_01` record in the plane at a LIVE parameter point.
//
// The record (tools/ctrnact-oracle/develop_pent_edges.py) is parameter-free: rneig, glue, the corner
// letter each dart crosses, the edge class each dart lies on, and the drawn bits. None of it moves when
// a slider moves. This file supplies the only thing that does — the geometry — exactly as
// lib/render/hyperbolicDevelopClient.ts re-develops hyperbolic darts under the live view. There the
// view moves; here the tile's shape does.
//
// A dart instance is (quotient dart h, VERTEX position, heading along its edge). Two moves generate
// everything: `rneig` pivots about the shared vertex by the interior angle of the corner crossed, and
// `glue` walks the edge to the neighbour and turns around. Positions are deduplicated on a tolerant
// point index so the same tiling vertex reached by different routes is one vertex, which is what makes
// the edge list a graph instead of a pile of segments.
//
// The walk is exported separately from the scene because lib/pentagon/edgePatch.ts needs what a scene
// throws away — which dart each instance is and which way it points — to recover the period lattice.

import {
	letterAngle,
	letterLength,
	type SolvedBoard,
} from "./edge-board";

/** A record exactly as it sits in public/pentagon-edges/pe1-k<k>.json. */
export interface PentEdgeRecord {
	id: string;
	k: number;
	type: number;
	chiral?: boolean;
	/** Next dart around the same vertex. */
	rneig: number[];
	/** The dart at the far end of this dart's edge; -1 when the certificate leaves it open. */
	glue: number[];
	/** Per dart, the letter of the corner crossed stepping h → rneig[h]. */
	corner: string[];
	/** Per dart, the digon letter naming its edge class. */
	edge: string[];
	/** Per dart, "1" when its edge is drawn (a tile boundary) and "0" when it is faint scaffold. */
	drawn: string;
	/** Certificate vertex-orbit label per dart. */
	orbit: number[];
	stats: { darts: number; drawnEdges: number; vertexOrbits: number };
}

export interface PentEdgeScene {
	vertices: { x: number; y: number }[];
	/** Undirected edges as vertex-index pairs, with the drawn bit the shelf renders bold. */
	edges: { u: number; v: number; drawn: boolean }[];
	bounds: { minX: number; minY: number; maxX: number; maxY: number };
	/** Instances placed before the budget stopped the walk; a size readout, not geometry. */
	placed: number;
}

export interface DevelopOptions {
	/** Stop once a dart instance would sit further than this from the seed, in units of a = 1. */
	radius?: number;
	/** Hard ceiling on placed instances, so a malformed record cannot hang the frame. */
	budget?: number;
}

/**
 * Find-or-insert point set with a real tolerance, instead of a single rounded string key.
 *
 * A rounded key is a lottery at the bucket boundary: two positions 1e-12 apart can round either side
 * of it and become two vertices, and the failure only shows up as a hole in the tiling somewhere far
 * from the seed. Here every query scans the 3x3 cells around the point, so a match within `tol` is
 * always found however the coordinates fall. The cell is `tol * 64`, which keeps that scan at nine
 * near-empty buckets.
 */
export class PointIndex {
	private readonly cells = new Map<string, number[]>();
	private readonly cell: number;
	readonly pts: { x: number; y: number }[] = [];

	constructor(private readonly tol: number) {
		this.cell = tol * 64;
	}

	private key(cx: number, cy: number) {
		return `${cx},${cy}`;
	}

	/** Index of a stored point within `tol` of (x, y), or -1. */
	find(x: number, y: number): number {
		const cx = Math.floor(x / this.cell);
		const cy = Math.floor(y / this.cell);
		const t2 = this.tol * this.tol;
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				const bucket = this.cells.get(this.key(cx + dx, cy + dy));
				if (!bucket) continue;
				for (const i of bucket) {
					const p = this.pts[i];
					const ex = p.x - x;
					const ey = p.y - y;
					if (ex * ex + ey * ey <= t2) return i;
				}
			}
		}
		return -1;
	}

	/** The index of (x, y), inserting it if no stored point is within `tol`. */
	add(x: number, y: number): number {
		const hit = this.find(x, y);
		if (hit >= 0) return hit;
		const i = this.pts.length;
		this.pts.push({ x, y });
		const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell));
		const bucket = this.cells.get(k);
		if (bucket) bucket.push(i);
		else this.cells.set(k, [i]);
		return i;
	}
}

/** One placed dart: which quotient dart, where its vertex is, and which way it points. */
export interface PentWalkInstance {
	h: number;
	x: number;
	y: number;
	/** Heading in radians, continuous (not folded) — fold before comparing directions. */
	th: number;
	/** Index into `vertices` of the vertex this instance sits at. */
	vid: number;
}

export interface PentWalk {
	vertices: { x: number; y: number }[];
	/** Certificate vertex-orbit label per vertex, in [0, rec.k). */
	vorbit: number[];
	edges: { u: number; v: number; drawn: boolean }[];
	instances: PentWalkInstance[];
	/** The vertex index, for callers that need to look a position up (period detection). */
	index: PointIndex;
	placed: number;
	/** True when the walk stopped on the budget rather than the radius — the patch is then ragged. */
	truncated: boolean;
}

/** Position tolerance, as a fraction of the SHORTEST edge class: two distinct vertices are at least one
 *  edge apart, and float drift over a few thousand trig steps is many orders below this. */
const POS_TOL_FRACTION = 1e-6;

const posTol = (board: SolvedBoard) =>
	Math.min(...Object.values(board.sides)) * POS_TOL_FRACTION;

/**
 * Walk the record's dart graph at this board.
 *
 * Breadth-first from dart 0 so the budget spends itself on the patch nearest the seed rather than
 * running off in one direction, which matters because every caller frames on the result.
 */
export function walkPentEdges(
	rec: PentEdgeRecord,
	board: SolvedBoard,
	opts: DevelopOptions = {},
): PentWalk {
	const radius = opts.radius ?? 12;
	const budget = opts.budget ?? 20000;
	const tol = posTol(board);

	// Precompute per-dart angle and length so the inner loop never parses a letter.
	const n = rec.rneig.length;
	const ang = new Float64Array(n);
	const len = new Float64Array(n);
	for (let h = 0; h < n; h++) {
		ang[h] = letterAngle(rec.corner[h], board);
		len[h] = letterLength(rec.edge[h], board);
	}

	const index = new PointIndex(tol);
	const vertices = index.pts;
	const vorbit: number[] = [];
	const vidOf = (x: number, y: number, h: number) => {
		const before = vertices.length;
		const i = index.add(x, y);
		if (i === before) vorbit.push(rec.orbit[h] ?? 0);
		return i;
	};

	const seen = new Set<string>();
	const instances: PentWalkInstance[] = [];
	const queue: { h: number; x: number; y: number; th: number }[] = [];
	const keyOf = (x: number, y: number) => `${Math.round(x / tol)},${Math.round(y / tol)}`;
	const push = (h: number, x: number, y: number, th: number) => {
		// An instance is its dart plus its position plus its heading: the same dart reached with a
		// different heading is a different placement and must not be collapsed.
		const k = `${h}|${keyOf(x, y)}|${Math.round(Math.cos(th) / 1e-6)},${Math.round(Math.sin(th) / 1e-6)}`;
		if (seen.has(k)) return;
		seen.add(k);
		queue.push({ h, x, y, th });
	};

	const edgeSeen = new Set<string>();
	const edges: { u: number; v: number; drawn: boolean }[] = [];

	push(0, 0, 0, 0);
	let placed = 0;
	let qi = 0;
	for (; qi < queue.length && placed < budget; qi++) {
		const { h, x, y, th } = queue[qi];
		placed++;
		// Past the radius an instance is only a frontier marker: it is not expanded, so it has no edges,
		// and materialising its vertex would leave isolated points outside the patch the caller frames on.
		if (Math.hypot(x, y) > radius) continue;
		const vid = vidOf(x, y, h);
		instances.push({ h, x, y, th, vid });

		// Around the vertex: same point, heading turned by the corner this dart crosses.
		const a = ang[h];
		if (Number.isFinite(a)) push(rec.rneig[h], x, y, th + a);

		// Across the edge: advance by its class length, then face back.
		const g = rec.glue[h];
		const L = len[h];
		if (g >= 0 && Number.isFinite(L)) {
			const x2 = x + L * Math.cos(th);
			const y2 = y + L * Math.sin(th);
			const u = vid;
			const v = vidOf(x2, y2, g);
			if (u !== v) {
				const ek = u < v ? `${u}-${v}` : `${v}-${u}`;
				if (!edgeSeen.has(ek)) {
					edgeSeen.add(ek);
					edges.push({ u, v, drawn: rec.drawn[h] === "1" });
				}
			}
			push(g, x2, y2, th + Math.PI);
		}
	}

	return { vertices, vorbit, edges, instances, index, placed, truncated: qi < queue.length };
}

/** The walk as a drawable scene: vertices, edges and the box to frame on. */
export function developPentEdges(
	rec: PentEdgeRecord,
	board: SolvedBoard,
	opts: DevelopOptions = {},
): PentEdgeScene {
	const walk = walkPentEdges(rec, board, opts);
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const p of walk.vertices) {
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	return {
		vertices: walk.vertices,
		edges: walk.edges,
		bounds: { minX, minY, maxX, maxY },
		placed: walk.placed,
	};
}
