// The isohedral edge shelf's patch: one period of an IH decoration, built at the live parameter point.
//
// Almost nothing happens here, which is the point. The recovery — find the period lattice off the walk,
// verify it, fold, cut the faces, merge tiles across undrawn edges — is board-agnostic and lives in
// lib/freedraw/edgePatchCore.ts. This file supplies the two things that are specific to this corpus:
// the tile (from Tactile, via edge-board.ts) and how many tiles a period should hold.
//
// ⚑ THE CERTIFICATE'S FACE COUNT IS NOT A CONSTRAINT ON THE PERIOD, and this file used to say it was.
// A certificate carries 2n·F darts for F tiles, so `certCellFaces` reads F back off the dart count — and
// on all 48,998 shipped records of IH01 to IH04, and on IH05's too, that number is IDENTICALLY k. It
// carries no information the record does not already state. The old gate ("the period must divide the
// certificate's count") was therefore just "F divides k", which held on the first four boards by
// coincidence and is false on IH05: at k=6 its period is 12 tiles, TWICE k, and the gate rejected every
// record of the board including the correct labelling.
//
// What replaces it is a fact about the board instead of about the data. A decoration is preserved only by
// translations that already preserve the undecorated tiling, so its lattice is a sublattice of Tactile's
// and its cell holds a whole multiple of the |t1 x t2| / tileArea tiles that Tactile's own cell holds —
// one on IH01, two on IH02 to IH04, four on IH05. That is `periodFacesMultipleOf`, and it still catches
// the fold that loses or duplicates an aspect. It does NOT catch a sublattice; nothing here does, and
// the shortest-verified-pair search in edgePatchCore is what keeps that from happening.

import { buildEdgePatch, type EdgePatchOptions, type EdgePatchResult } from "@/lib/freedraw/edgePatchCore";
import { ihLetterSlot, reverseChordCurve, type SolvedIhBoard } from "./edge-board";
import { walkIhEdges, type IhEdgeRecord } from "./edgeDevelop";

/** Tiles in one certificate cell: darts / (2 · sides), the digon count inverted.
 *
 *  Equal to `rec.k` on every record of every board shipped so far, which is why it constrains nothing —
 *  see the note at the top of this file. Kept because it sizes the develop and because the tests assert
 *  that equality instead of assuming it. */
export const certCellFaces = (rec: IhEdgeRecord, board: SolvedIhBoard): number =>
	rec.rneig.length / (2 * board.spec.sides.length);

/**
 * Can every edge tell which way it is being crossed, whenever that matters?
 *
 * `ihLetterCurve` reads a class's slot 0 as its forward sense and slot 1 as its reverse, so a bowed edge
 * knows which side to bulge toward. The claim it needs is: **the two darts glued across one edge carry
 * the same class, at opposite slots WHENEVER THE ANSWER DEPENDS ON IT.**
 *
 * The qualifier is not a hedge; it is what IH04 taught. A class gets two digon slots only when it occurs
 * TWICE on the tile — IH01 to IH03 have three classes occurring twice each, so every class has a slot
 * bit, while IH04's boundary "abcdBe" uses class b twice and a, c, d, e once, and those four get a
 * single slot. So on IH04 both ends of an a-edge carry the same letter and no direction can be read off.
 *
 * That is exactly harmless, and not by luck: the once-occurring classes are IH04's S edges, which are
 * point-symmetric and therefore EQUAL to their own reverse, so which way you traverse them changes
 * nothing. This asserts that correspondence instead of assuming it — a board with a single-slot class
 * whose curve is not self-reverse would be one where curvature genuinely could not be resolved, and it
 * would fail here rather than draw half its tiles mirrored.
 *
 * Reads the QUOTIENT, so it costs one pass over the darts and no geometry.
 */
export function checkSlotsAreOpposite(rec: IhEdgeRecord, board: SolvedIhBoard): boolean {
	const classOf = (h: number) => board.spec.classes.indexOf(rec.edge[h][0].toLowerCase());
	for (let h = 0; h < rec.glue.length; h++) {
		const g = rec.glue[h];
		if (g < 0 || g <= h) continue; // each undirected edge once; open darts prove nothing
		const c = classOf(h);
		if (c < 0 || c !== classOf(g)) return false;
		if (ihLetterSlot(rec.edge[h]) !== ihLetterSlot(rec.edge[g])) continue;
		// Same slot at both ends: legal only where the arc cannot tell its two directions apart.
		const curve = board.classCurves[c];
		if (!curve) continue; // straight, so nothing to orient
		const rev = reverseChordCurve(curve);
		if (curve.some((v, i) => Math.abs(v - rev[i]) > 1e-9)) return false;
	}
	return true;
}

export function buildIhEdgePatch(
	rec: IhEdgeRecord,
	board: SolvedIhBoard,
	opts: EdgePatchOptions = {},
): EdgePatchResult {
	const cert = certCellFaces(rec, board);
	const longest = Math.max(...board.classLengths);
	const ring = board.outline;
	let area = 0;
	for (let i = 0; i < ring.length; i++) {
		const p = ring[i];
		const q = ring[(i + 1) % ring.length];
		area += p.x * q.y - q.x * p.y;
	}
	const tileArea = Math.abs(area / 2);
	// Tiles in Tactile's OWN cell: one for IH01, two for IH02 to IH04, four for IH05. Measured off the
	// geometry the develop is about to use, not read from the catalogue, so the two cannot disagree.
	const baseFaces = Math.round(Math.abs(board.t1.x * board.t2.y - board.t1.y * board.t2.x) / tileArea);
	// Size the develop from the period it is looking for: a cell of F tiles is about sqrt(F·tileArea)
	// across, and the walk needs a few of those to see two generators AND a core holding a whole one.
	// Guessing a constant here is what makes a high-k record fail on a develop that was never big enough.
	// F can run to twice k (IH05 at k=6), so this is a starting size and the attempt loop grows it.
	const worldR = 3.2 * Math.sqrt(Math.max(1, cert, baseFaces) * tileArea) + 2 * longest;

	return buildEdgePatch(
		{ outline: board.outline, classLengths: board.classLengths },
		(radius, budget) => walkIhEdges(rec, board, { radius, budget }),
		{
			reach: worldR / longest,
			budget: 120000,
			periodFacesMultipleOf: baseFaces > 0 ? baseFaces : undefined,
			...opts,
		},
	);
}
