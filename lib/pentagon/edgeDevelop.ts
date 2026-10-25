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

import { walkDarts, type DartWalk } from "@/lib/render/flatDartWalk";
import { letterAngle, letterLength, type SolvedBoard } from "./edge-board";

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

/** A walk of the record's darts: lib/render/flatDartWalk.ts, which both Euclidean edge shelves share. */
export type PentWalk = DartWalk;

/** Position tolerance, as a fraction of the SHORTEST edge class: two distinct vertices are at least one
 *  edge apart, and float drift over a few thousand trig steps is many orders below this. */
const POS_TOL_FRACTION = 1e-6;

const posTol = (board: SolvedBoard) => Math.min(...Object.values(board.sides)) * POS_TOL_FRACTION;

/**
 * Walk the record's dart graph at this board.
 *
 * Breadth-first from dart 0 so the budget spends itself on the patch nearest the seed rather than
 * running off in one direction, which matters because every caller frames on the result.
 */
export function walkPentEdges(rec: PentEdgeRecord, board: SolvedBoard, opts: DevelopOptions = {}): PentWalk {
	// Precompute per-dart angle and length so the inner loop never parses a letter.
	const n = rec.rneig.length;
	const turn = new Float64Array(n);
	const length = new Float64Array(n);
	for (let h = 0; h < n; h++) {
		turn[h] = letterAngle(rec.corner[h], board);
		length[h] = letterLength(rec.edge[h], board);
	}
	return walkDarts(
		{ rneig: rec.rneig, glue: rec.glue, turn, length, drawn: (h) => rec.drawn[h] === "1", orbit: rec.orbit },
		{ tol: posTol(board), radius: opts.radius ?? 12, budget: opts.budget ?? 20000 },
	);
}

/** The walk as a drawable scene: vertices, edges and the box to frame on. */
export function developPentEdges(rec: PentEdgeRecord, board: SolvedBoard, opts: DevelopOptions = {}): PentEdgeScene {
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
