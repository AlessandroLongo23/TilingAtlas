// Dress a built IH patch as a FreedrawPattern, so the shelf draws through the renderer every other
// Euclidean edge system already uses (components/freedraw/freedraw-canvas.tsx).
//
// Same move as lib/pentagon/edgeShelfPattern.ts, and for the same reason: the record ships no geometry,
// because the tile is a family, so the patch is built per parameter point and everything downstream —
// infinite panning, the five fill modes, the scaffold and orbit toggles, the lattice overlay — is
// unchanged. The 1x1 dummy lattice fields keep the bitmask type total, exactly as Marek's own combined
// and Schwarz records do (see lib/freedraw/pattern.ts).

import type { FreedrawPattern } from "@/lib/freedraw/pattern";
import type { EdgePatchDiag } from "@/lib/freedraw/edgePatchCore";
import type { SolvedIhBoard } from "./edge-board";
import type { IhEdgeRecord } from "./edgeDevelop";
import { buildIhEdgePatch } from "./edgePatch";

export interface IhShelfPattern {
	pattern: FreedrawPattern | null;
	reason: string | null;
	diag: EdgePatchDiag;
	/** World units across the shorter canvas side at the home zoom.
	 *
	 *  A fixed TILE COUNT, not a fixed number of periods, which is the opposite of what the pentagon
	 *  shelf does and is forced by the shape of these cells. IH01's period is long and thin — the short
	 *  generator stays at one tile at every k while the long one grows with k — so "show five periods"
	 *  means five of the LONG side, and the home zoom would swing by 6x across the shelf and sit far
	 *  closer than every other Euclidean shelf at low k. A constant density reads the same at every k,
	 *  and the period still always fits, since fourteen tiles across is wider than the longest generator
	 *  the shipped corpus has. */
	cells: number;
}

/** Cache one built pattern per (record, parameter point). Dragging a slider back and forth over the
 *  same value is then free, and so is a re-render that did not change the parameters. */
const cache = new Map<string, IhShelfPattern>();
const CACHE_MAX = 48;

// The curves are part of the key, not just the corners: two boards can agree on every angle and length
// and still draw different tiles when an edge bows.
const signature = (rec: IhEdgeRecord, board: SolvedIhBoard) =>
	`${rec.id}|${board.cornerAngles.map((v) => v.toFixed(5)).join(",")}|${board.classLengths
		.map((v) => v.toFixed(6))
		.join(",")}|${board.classCurves.map((c) => (c ? c.map((v) => v.toFixed(4)).join(":") : "-")).join(",")}`;

export function ihEdgePattern(rec: IhEdgeRecord, board: SolvedIhBoard): IhShelfPattern {
	const key = signature(rec, board);
	const hit = cache.get(key);
	if (hit) return hit;

	const built = buildIhEdgePatch(rec, board);
	let out: IhShelfPattern;
	if (!built.ok) {
		out = { pattern: null, reason: built.reason, diag: built.diag, cells: 12 };
	} else {
		const span = Math.max(Math.hypot(...built.patch.T1), Math.hypot(...built.patch.T2));
		// The tile's linear size, from the cell area it divides — so the clamp below is in tiles and does
		// not drift when a slider changes the tile's scale.
		const tile = Math.sqrt(
			Math.abs(
				built.patch.T1[0] * built.patch.T2[1] - built.patch.T1[1] * built.patch.T2[0],
			) / built.patch.polys.length,
		);
		out = {
			pattern: {
				id: rec.id,
				k: rec.k,
				a: 1,
				b: 0,
				d: 1,
				h: [0],
				v: [0],
				orbit: [0],
				grid: "ih",
				patch: built.patch,
			},
			reason: null,
			diag: built.diag,
			// ...and the `span` term is the guard, not the rule: if a parameter point ever stretches the
			// cell past fourteen tiles, the zoom follows it out so the repeat is never cropped.
			cells: Math.max(14 * tile, span * 1.15),
		};
	}

	if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
	cache.set(key, out);
	return out;
}
