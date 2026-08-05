// The pentagon edge shelf's patch: one period of a Kershner decoration, built at the live parameter point.
//
// WHY THIS SHELF NEEDS ONE. The first version drew a single breadth-first patch fitted to the canvas.
// That is wrong in three ways at once — the walk stops mid-tile, so the boundary is a fringe of dangling
// stubs; there is nothing to pan or zoom into, because everything outside the developed disc simply does
// not exist; and a segment list has no faces, so the tiles could not be coloured. Every other Euclidean
// decoration in the atlas solved this by drawing ONE period and instancing it over a lattice
// (lib/freedraw/render.ts, drawPatchPattern), and handing back a FreedrawPatch is what lets this shelf
// join them: infinite scrolling, the five fill modes and the scaffold toggle, with no renderer of its own.
//
// Almost nothing happens in this file, which is the point. Recovering the lattice from a develop and
// folding the figure onto it is the same job for every parametric board, so it lives once in
// lib/freedraw/edgePatchCore.ts. What is genuinely this board's own is the tile — a family, not a fixed
// shape, which is why nothing can be baked and the patch is rebuilt whenever a slider moves — and the
// count below.

import {
	buildEdgePatch,
	type EdgePatchOptions,
	type EdgePatchResult,
} from "@/lib/freedraw/edgePatchCore";
import type { SolvedBoard } from "./edge-board";
import { walkPentEdges, type PentEdgeRecord } from "./edgeDevelop";

/**
 * Tiles in one period, known EXACTLY and before any searching.
 *
 * The corpus is uniform on the fact this rests on, and lib/pentagon/edgePatch.test.ts checks it against
 * all 17,993 records: every certificate carries exactly 12k darts and glues all of them. Summing two
 * darts per incident edge over the vertices gives darts = 4E, so E = 3k. Every face walks six sides — the
 * Kershner tile is a pentagon, but its class b occurs twice across a straight vertex, so `BOARD_SIDES`
 * is six long — and each edge borders two faces, so 6F = 2E and F = k. Euler on the torus closes it:
 * V = E - F = 2k.
 *
 * This is the one piece of information the isohedral boards cannot supply — there a period can hold
 * twice k — and it is worth having. It makes the second basis vector exact instead of merely independent,
 * and it lets a develop that came up short be re-sized from the area it is looking for rather than
 * doubled blindly, which is what keeps the elongated cells at the ends of the family in reach.
 */
export const certCellFaces = (rec: PentEdgeRecord): number => rec.rneig.length / 12;

export function buildPentEdgePatch(
	rec: PentEdgeRecord,
	board: SolvedBoard,
	opts: EdgePatchOptions = {},
): EdgePatchResult {
	const classLengths = Object.values(board.sides);
	return buildEdgePatch(
		{ outline: board.outline, classLengths },
		(radius, budget) => walkPentEdges(rec, board, { radius, budget }),
		{ periodFacesExactly: certCellFaces(rec), ...opts },
	);
}
