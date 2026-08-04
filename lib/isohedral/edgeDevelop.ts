// Realise one `edges_isohedral_IH<nn>` record in the plane, and recover the lattice that makes it
// INFINITE.
//
// The record is parameter-free (tools/ctrnact-oracle/develop_ih_edges.py): rneig, glue, the corner
// letter each dart crosses, the edge class each dart lies on, the drawn bits. The geometry comes from
// Tactile at the live parameter point (edge-board.ts). That much mirrors the pentagon shelf.
//
// The walk is exported separately from the scene because lib/freedraw/edgePatchCore.ts needs what a
// scene throws away — which dart each instance is and which way it points. That is what the period
// lattice is recovered from: two placements of the SAME quotient dart at the SAME heading differ by a
// translation carrying the decoration onto itself, because both walk moves are direct isometries. The
// recovery, and the verification that a candidate really is a period, live in that shared file; this
// one only has to hand over the evidence.
//
// The lattice is NOT Tactile's t1/t2. Those are the BASE tiling's, and a decoration is periodic on a
// sublattice of them: measured over the shipped IH01 corpus, one period holds k/2 tiles. Marek's
// certificate cell is twice that — 2k board vertices carrying only k distinct orbit labels — so the
// certificate is not itself a fundamental domain for the translations, and the walk has to find them.

import {
	ihLetterAngle,
	ihLetterCurve,
	ihLetterLength,
	type ChordCurve,
	type SolvedIhBoard,
} from "./edge-board";

/** A record exactly as it sits in public/isohedral-edges/ie<nn>-k<k>.json. */
export interface IhEdgeRecord {
	id: string;
	k: number;
	ih: number;
	chiral?: boolean;
	rneig: number[];
	glue: number[];
	/** Per dart, the letter of the corner crossed stepping h → rneig[h]. */
	corner: string[];
	/** Per dart, the digon letter naming its edge class. */
	edge: string[];
	/** Per dart, "1" when its edge is drawn. */
	drawn: string;
	orbit: number[];
	stats: { darts: number; drawnEdges: number; vertexOrbits: number };
}

export interface IhEdge {
	u: number;
	v: number;
	drawn: boolean;
	/** The bow of this edge in its own u→v chord frame, or null when it is straight. Chord-local, so it
	 *  needs no knowledge of which tile or which aspect placed the edge — see edge-board.ts. */
	curve?: ChordCurve | null;
}

/** One placed dart: which quotient dart, where its vertex is, and which way it points. */
export interface IhWalkInstance {
	h: number;
	x: number;
	y: number;
	/** Heading in radians, continuous (not folded) — fold before comparing directions. */
	th: number;
}

/** Structurally a `DevelopedWalk` (lib/freedraw/edgePatchCore.ts), which is what lets the patch
 *  builder be shared with the pentagon board. */
export interface IhWalk {
	vertices: { x: number; y: number }[];
	/** Certificate vertex-orbit label per vertex, in [0, k). Drives the orbit fill mode. */
	vorbit: number[];
	edges: IhEdge[];
	instances: IhWalkInstance[];
	/** The vertex index, for callers that need to look a position up (period detection). */
	index: PointIndex;
	placed: number;
	truncated: boolean;
}

export interface IhWalkOptions {
	/** Stop once an instance would sit further than this from the seed, in world units. */
	radius?: number;
	/** Hard ceiling on placed instances, so a malformed record cannot hang a frame. */
	budget?: number;
}

/** Position tolerance as a fraction of the SHORTEST edge class: two tiling vertices are at least one
 *  edge apart, and float drift over a few thousand trig steps is orders below this. */
const POS_TOL_FRACTION = 1e-6;
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
 * Walk the record's dart graph at this board.
 *
 * Breadth-first from dart 0, so the budget spends itself near the seed instead of running off in one
 * direction, which matters because every caller frames on the result. A dart instance is (quotient dart
 * h, vertex position, heading): `rneig` pivots about the shared vertex by the interior angle of the
 * corner crossed, `glue` walks the edge and turns around.
 */
export function walkIhEdges(
	rec: IhEdgeRecord,
	board: SolvedIhBoard,
	opts: IhWalkOptions = {},
): IhWalk {
	const shortest = Math.min(...board.classLengths);
	const tol = shortest * POS_TOL_FRACTION;
	const radius = opts.radius ?? 10 * board.period;
	const budget = opts.budget ?? 40000;

	const n = rec.rneig.length;
	const ang = new Float64Array(n);
	const len = new Float64Array(n);
	// Per dart, the bow of its edge oriented along that dart's travel. Precomputed with the angles and
	// lengths so the inner loop never parses a letter.
	const bow: (ChordCurve | null)[] = new Array(n).fill(null);
	for (let h = 0; h < n; h++) {
		ang[h] = ihLetterAngle(rec.corner[h], board);
		len[h] = ihLetterLength(rec.edge[h], board);
		if (board.curved) bow[h] = ihLetterCurve(rec.edge[h], board);
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
	const instances: IhWalkInstance[] = [];
	const queue: IhWalkInstance[] = [];
	const push = (h: number, x: number, y: number, th: number) => {
		// An instance is its dart plus its position plus its heading: the same dart reached with a
		// different heading is a different placement and must not be collapsed.
		const k = `${h}|${Math.round(x / tol)},${Math.round(y / tol)}|${Math.round(Math.cos(th) / DIR_TOL)},${Math.round(Math.sin(th) / DIR_TOL)}`;
		if (seen.has(k)) return;
		seen.add(k);
		queue.push({ h, x, y, th });
	};

	const edgeSeen = new Set<string>();
	const edges: IhEdge[] = [];

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
		instances.push({ h, x, y, th });

		// Around the vertex: same point, heading turned by the corner this dart crosses.
		const a = ang[h];
		if (Number.isFinite(a)) push(rec.rneig[h], x, y, th + a);

		// Across the edge: advance by its class length, then face back.
		const g = rec.glue[h];
		const L = len[h];
		if (g >= 0 && Number.isFinite(L)) {
			const x2 = x + L * Math.cos(th);
			const y2 = y + L * Math.sin(th);
			const v = vidOf(x2, y2, g);
			if (vid !== v) {
				const ek = vid < v ? `${vid}-${v}` : `${v}-${vid}`;
				if (!edgeSeen.has(ek)) {
					edgeSeen.add(ek);
					// Recorded u→v along THIS dart's travel, and `bow[h]` is oriented the same way, so the
					// two stay consistent however the other dart of this edge would have recorded it.
					edges.push({ u: vid, v, drawn: rec.drawn[h] === "1", curve: bow[h] });
				}
			}
			push(g, x2, y2, th + Math.PI);
		}
	}

	return { vertices, vorbit, edges, instances, index, placed, truncated: qi < queue.length };
}
