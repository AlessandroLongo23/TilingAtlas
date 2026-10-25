// The flat develop of a quotient dart graph: every Euclidean shelf that ships darts walks them here.
//
// A dart instance is (quotient dart h, vertex position, heading): `rneig` pivots about the shared vertex
// by the turn of the corner crossed, `glue` walks the edge and turns around. The callers differ only in
// where the turn and length of each dart come from (the pentagon and isohedral boards solve them from a
// parameter point; TileSearch reads them off a board's angles), so they hand over the two arrays and this
// does the rest. Structurally a `DevelopedWalk` (lib/freedraw/edgePatchCore.ts).

/** A chord-local bow, [t1, s1, t2, s2], as lib/isohedral/edge-board.ts defines it; null when straight. */
export type DartBow = readonly [number, number, number, number] | null;

export interface DartGraph {
	rneig: ArrayLike<number>;
	/** The dart at the far end of this dart's edge; -1 when the certificate leaves it open. */
	glue: ArrayLike<number>;
	/** Turn in radians stepping h → rneig[h]. A non-finite turn stops the walk round that vertex. */
	turn: ArrayLike<number>;
	/** Length of dart h's edge. A non-finite length stops the walk across it. */
	length: ArrayLike<number>;
	/** Whether dart h's edge is drawn (a tile boundary) or faint scaffold. */
	drawn: (h: number) => boolean;
	/** Vertex-orbit label per dart. */
	orbit?: ArrayLike<number>;
	/** The bow of dart h's edge, oriented along its travel. */
	bow?: readonly DartBow[];
}

export interface DartWalkOptions {
	/** Position tolerance: two vertices closer than this are one. A small fraction of the shortest edge. */
	tol: number;
	/** Stop once an instance would sit further than this from the seed, in world units. */
	radius: number;
	/** Hard ceiling on placed instances, so a malformed record cannot hang a frame. */
	budget: number;
}

/** One placed dart: which quotient dart, where its vertex is, and which way it points. */
export interface DartInstance {
	h: number;
	x: number;
	y: number;
	/** Heading in radians, continuous (not folded): fold before comparing directions. */
	th: number;
	/** Index into `vertices` of the vertex this instance sits at. */
	vid: number;
}

export interface DartWalk {
	vertices: { x: number; y: number }[];
	/** Vertex-orbit label per vertex. Drives the orbit fill mode. */
	vorbit: number[];
	edges: { u: number; v: number; drawn: boolean; curve?: DartBow }[];
	instances: DartInstance[];
	/** The vertex index, for callers that need to look a position up (period detection). */
	index: PointIndex;
	placed: number;
	/** True when the walk stopped on the budget, not the radius: the patch is then ragged. */
	truncated: boolean;
}

const DIR_TOL = 1e-6;

/**
 * Find-or-insert point set with a real tolerance.
 *
 * A single rounded key is a lottery at the bucket boundary: two positions 1e-12 apart can round either
 * side and become two vertices, and that only shows up as a hole in the tiling far from the seed. Every
 * query scans the 3×3 cells around the point, so a match within `tol` is always found.
 */
export class PointIndex {
	private readonly cells = new Map<string, number[]>();
	private readonly cell: number;
	readonly pts: { x: number; y: number }[] = [];

	constructor(private readonly tol: number) {
		this.cell = tol * 64;
	}

	find(x: number, y: number): number {
		const cx = Math.floor(x / this.cell);
		const cy = Math.floor(y / this.cell);
		const t2 = this.tol * this.tol;
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				const bucket = this.cells.get(`${cx + dx},${cy + dy}`);
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

	add(x: number, y: number): number {
		const hit = this.find(x, y);
		if (hit >= 0) return hit;
		const i = this.pts.length;
		this.pts.push({ x, y });
		const k = `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`;
		const bucket = this.cells.get(k);
		if (bucket) bucket.push(i);
		else this.cells.set(k, [i]);
		return i;
	}
}

/**
 * Walk the dart graph breadth-first from dart 0, so the budget spends itself near the seed instead of
 * running off in one direction, which matters because every caller frames on the result.
 */
export function walkDarts(d: DartGraph, { tol, radius, budget }: DartWalkOptions): DartWalk {
	const index = new PointIndex(tol);
	const vertices = index.pts;
	const vorbit: number[] = [];
	const vidOf = (x: number, y: number, h: number) => {
		const before = vertices.length;
		const i = index.add(x, y);
		if (i === before) vorbit.push(d.orbit?.[h] ?? 0);
		return i;
	};

	const seen = new Set<string>();
	const instances: DartInstance[] = [];
	const queue: Omit<DartInstance, "vid">[] = [];
	const push = (h: number, x: number, y: number, th: number) => {
		// An instance is its dart plus its position plus its heading: the same dart reached with a
		// different heading is a different placement and must not be collapsed.
		const k = `${h}|${Math.round(x / tol)},${Math.round(y / tol)}|${Math.round(Math.cos(th) / DIR_TOL)},${Math.round(Math.sin(th) / DIR_TOL)}`;
		if (seen.has(k)) return;
		seen.add(k);
		queue.push({ h, x, y, th });
	};

	const edgeSeen = new Set<string>();
	const edges: DartWalk["edges"] = [];

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
		const a = d.turn[h];
		if (Number.isFinite(a)) push(d.rneig[h], x, y, th + a);

		// Across the edge: advance by its length, then face back.
		const g = d.glue[h];
		const L = d.length[h];
		if (g >= 0 && Number.isFinite(L)) {
			const x2 = x + L * Math.cos(th);
			const y2 = y + L * Math.sin(th);
			const v = vidOf(x2, y2, g);
			if (vid !== v) {
				const ek = vid < v ? `${vid}-${v}` : `${v}-${vid}`;
				if (!edgeSeen.has(ek)) {
					edgeSeen.add(ek);
					// Recorded u→v along THIS dart's travel, and the bow is oriented the same way, so the
					// two stay consistent however the other dart of this edge would have recorded it.
					edges.push(d.bow ? { u: vid, v, drawn: d.drawn(h), curve: d.bow[h] } : { u: vid, v, drawn: d.drawn(h) });
				}
			}
			push(g, x2, y2, th + Math.PI);
		}
	}

	return { vertices, vorbit, edges, instances, index, placed, truncated: qi < queue.length };
}
