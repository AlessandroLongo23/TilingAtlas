// Dress a built pentagon patch as a FreedrawPattern, so the shelf draws through the renderer every
// other Euclidean edge system already uses (components/freedraw/freedraw-canvas.tsx).
//
// The patch grids in Marek's own corpora — combined, hexagonal, both Schwarz boards — ship a
// FreedrawPatch straight from the developer and carry 1x1 dummy lattice fields so the bitmask type
// stays total (see lib/freedraw/pattern.ts). This board is the same shape of record with one
// difference that runs all the way down: its patch cannot be shipped, because the tile is a family.
// So it is built here, per parameter point, and everything downstream is unchanged.

import type { EdgePatchDiag } from "@/lib/freedraw/edgePatchCore";
import type { FreedrawPattern } from "@/lib/freedraw/pattern";
import type { SolvedBoard } from "./edge-board";
import type { PentEdgeRecord } from "./edgeDevelop";
import { buildPentEdgePatch } from "./edgePatch";

export interface PentShelfPattern {
	pattern: FreedrawPattern | null;
	reason: string | null;
	diag: EdgePatchDiag;
	/** World units across the shorter canvas side at the home zoom: about two and a half periods, so
	 *  the repeat reads at a glance and the tile is still big enough to see its edges. Clamped at both
	 *  ends — a k=2 cell a few times over is only a handful of tiles, and a k=10 cell would otherwise
	 *  put the tiles below a pixel. */
	cells: number;
}

/** Cache one built pattern per (record, parameter point). Dragging a slider back and forth over the
 *  same value is then free, and so is a re-render that did not change the parameters. */
const cache = new Map<string, PentShelfPattern>();
const CACHE_MAX = 48;

const signature = (rec: PentEdgeRecord, board: SolvedBoard) =>
	`${rec.id}|${Object.values(board.angles)
		.map((v) => v.toFixed(4))
		.join(",")}|${Object.values(board.sides)
		.map((v) => v.toFixed(6))
		.join(",")}`;

export function pentEdgePattern(rec: PentEdgeRecord, board: SolvedBoard): PentShelfPattern {
	const key = signature(rec, board);
	const hit = cache.get(key);
	if (hit) return hit;

	const built = buildPentEdgePatch(rec, board);
	let out: PentShelfPattern;
	if (!built.ok) {
		out = { pattern: null, reason: built.reason, diag: built.diag, cells: 12 };
	} else {
		const span = Math.max(Math.hypot(...built.patch.T1), Math.hypot(...built.patch.T2));
		out = {
			pattern: {
				id: rec.id,
				k: rec.k,
				// No bitmask on a patch grid: the geometry is explicit and these exist only to keep the
				// type total, exactly as the combined and Schwarz records do.
				a: 1,
				b: 0,
				d: 1,
				h: [0],
				v: [0],
				orbit: [0],
				grid: "pent",
				patch: built.patch,
			},
			reason: null,
			diag: built.diag,
			cells: Math.max(14, Math.min(30, span * 2.5)),
		};
	}

	if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
	cache.set(key, out);
	return out;
}
