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

import { walkDarts, type DartBow, type DartWalk } from "@/lib/render/flatDartWalk";
import { ihLetterAngle, ihLetterCurve, ihLetterLength, type SolvedIhBoard } from "./edge-board";

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

export interface IhWalkOptions {
	/** Stop once an instance would sit further than this from the seed, in world units. */
	radius?: number;
	/** Hard ceiling on placed instances, so a malformed record cannot hang a frame. */
	budget?: number;
}

/** Position tolerance as a fraction of the SHORTEST edge class: two tiling vertices are at least one
 *  edge apart, and float drift over a few thousand trig steps is orders below this. */
const POS_TOL_FRACTION = 1e-6;

/**
 * Walk the record's dart graph at this board.
 *
 * Breadth-first from dart 0, so the budget spends itself near the seed instead of running off in one
 * direction, which matters because every caller frames on the result. A dart instance is (quotient dart
 * h, vertex position, heading): `rneig` pivots about the shared vertex by the interior angle of the
 * corner crossed, `glue` walks the edge and turns around.
 */
export function walkIhEdges(rec: IhEdgeRecord, board: SolvedIhBoard, opts: IhWalkOptions = {}): DartWalk {
	const n = rec.rneig.length;
	const turn = new Float64Array(n);
	const length = new Float64Array(n);
	// Per dart, the bow of its edge oriented along that dart's travel. Precomputed with the angles and
	// lengths so the inner loop never parses a letter.
	const bow: DartBow[] = new Array(n).fill(null);
	for (let h = 0; h < n; h++) {
		turn[h] = ihLetterAngle(rec.corner[h], board);
		length[h] = ihLetterLength(rec.edge[h], board);
		if (board.curved) bow[h] = ihLetterCurve(rec.edge[h], board);
	}
	return walkDarts(
		{ rneig: rec.rneig, glue: rec.glue, turn, length, drawn: (h) => rec.drawn[h] === "1", orbit: rec.orbit, bow },
		{
			tol: Math.min(...board.classLengths) * POS_TOL_FRACTION,
			radius: opts.radius ?? 10 * board.period,
			budget: opts.budget ?? 40000,
		},
	);
}
