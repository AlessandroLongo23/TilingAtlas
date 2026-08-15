// Pattern -> tile figures: the adapter between a freedraw record's edge bits and the pure geometry in
// ./arcs.ts. Two renderers consume it — the 2D canvas (./render.ts) and the periodic-cell IR the
// conformal lens packs (lib/render/periodic/edges.ts) — and they have to agree exactly, or turning the
// lens on would redraw the picture with a different pairing. One adapter, both callers.
//
// Everything here works in the Y-UP world frame, the one ./render.ts draws in. The lens frame has y
// down; it negates on the way out, and must NOT flip the corners instead, because `twist` is chiral and
// a mirrored tile pairs its edges the other way round.

import { DEFAULT_TILE_RULE, tileFigure, translateLoops, type Pt, type TileLoop, type TileRule } from "./arcs";
import { coset, cosetCount, gridOf, type FreedrawPatch, type FreedrawPattern } from "./pattern";

const SQRT3_2 = Math.sqrt(3) / 2;

const ruleKey = (r: TileRule) => `${r.wiring}:${r.twist}`;

/** The lattice-to-world map per grid, matching `basisOf` in ./render.ts. */
export const arcBasis = (p: FreedrawPattern) =>
	gridOf(p) === "triangle" ? { bx: 0.5, by: SQRT3_2 } : { bx: 0, by: 1 };

const gridCache = new WeakMap<FreedrawPattern, { key: string; arcs: TileLoop[][] }>();
const patchCache = new WeakMap<FreedrawPatch, { key: string; arcs: TileLoop[][] }>();

/**
 * One period of tile figures on a BITMASK grid, each relative to its own cell's lower-left corner.
 *
 * Indexed the way `analysis.cellFace` is: `[c]` on the square grid, `[2c]` (up) and `[2c + 1]` (down)
 * on the triangular one. Origin-relative because the lattice-to-world map is linear, so every other
 * copy of a cell is this figure translated — which is what lets a draw loop stamp instead of recompute.
 * Cached per pattern and rule; without it the frame cost was one `tileArcs` per visible cell per frame.
 */
export function gridCellArcs(p: FreedrawPattern, rule: TileRule = DEFAULT_TILE_RULE): TileLoop[][] {
	const key = ruleKey(rule);
	const hit = gridCache.get(p);
	if (hit && hit.key === key) return hit.arcs;
	const tri = gridOf(p) === "triangle";
	const { bx, by } = arcBasis(p);
	const w = (x: number, y: number): Pt => [x + bx * y, by * y];
	const bit = (arr: number[] | undefined, i: number, j: number) => arr?.[coset(p, i, j)] === 1;
	const arcs: TileLoop[][] = [];
	for (let c = 0; c < cosetCount(p); c++) {
		// Recover the coset's representative point so its neighbours' bits can be read, then subtract its
		// own world position (see `coset`: the index is row * a + column).
		const y = Math.floor(c / p.a);
		const x = c - y * p.a;
		const [ox, oy] = w(x, y);
		const shift = (loops: TileLoop[]) => translateLoops(loops, -ox, -oy);
		if (!tri) {
			// Corners counterclockwise from the lower left; edge i runs from corner i to corner i + 1, so
			// the bits are south, east, north, west.
			arcs.push(
				shift(
					tileFigure(
						[w(x, y), w(x + 1, y), w(x + 1, y + 1), w(x, y + 1)],
						[bit(p.h, x, y), bit(p.v, x + 1, y), bit(p.h, x, y + 1), bit(p.v, x, y)],
						rule,
					),
				),
			);
			continue;
		}
		// U(x, y) = (x,y), (x+1,y), (x,y+1); its third side is the w edge based at (x, y+1), which is
		// also D's first — the two triangles of a lattice cell share that diagonal.
		arcs.push(
			shift(
				tileFigure(
					[w(x, y), w(x + 1, y), w(x, y + 1)],
					[bit(p.h, x, y), bit(p.w, x, y + 1), bit(p.v, x, y)],
					rule,
				),
			),
		);
		arcs.push(
			shift(
				tileFigure(
					[w(x + 1, y), w(x + 1, y + 1), w(x, y + 1)],
					[bit(p.v, x + 1, y), bit(p.h, x, y + 1), bit(p.w, x, y + 1)],
					rule,
				),
			),
		);
	}
	gridCache.set(p, { key, arcs });
	return arcs;
}

/**
 * One period of tile figures on a PATCH board (hexagons, tri+squares, the two Schwarz grids, and the
 * two parametric families), in absolute patch coordinates, one entry per `patch.polys` ring.
 *
 * A ring's corners are lifted vertex ids, and the edge list is keyed on the same ids, so the drawn bit
 * of a side is a lookup once the two traversal directions are normalised to one key.
 */
export function patchTileArcs(patch: FreedrawPatch, rule: TileRule = DEFAULT_TILE_RULE): TileLoop[][] {
	const key = ruleKey(rule);
	const hit = patchCache.get(patch);
	if (hit && hit.key === key) return hit.arcs;
	const edgeKey = (vi: number, ax: number, ay: number, vj: number, bx: number, by: number) => {
		const dx = bx - ax;
		const dy = by - ay;
		const forward = vi < vj || (vi === vj && (dx > 0 || (dx === 0 && dy > 0)));
		return forward ? `${vi}|${vj}|${dx}|${dy}` : `${vj}|${vi}|${-dx}|${-dy}`;
	};
	const drawn = new Map<string, boolean>();
	for (const [vi, vj, ox, oy, d] of patch.edges) drawn.set(edgeKey(vi, 0, 0, vj, ox, oy), d === 1);
	const arcs = patch.polys.map((ring, i) => {
		const corners = ring.map(([vi, ox, oy]): Pt => [
			patch.verts[vi][0] + ox * patch.T1[0] + oy * patch.T2[0],
			patch.verts[vi][1] + ox * patch.T1[1] + oy * patch.T2[1],
		]);
		const state = ring.map((_, i) => {
			const [vi, ax, ay] = ring[i];
			const [vj, bx, by] = ring[(i + 1) % ring.length];
			return drawn.get(edgeKey(vi, ax, ay, vj, bx, by)) ?? false;
		});
		// A per-tile wiring, where the patch carries one, beats the sidebar's: on a Truchet board the
		// drawing is the whole content, so it is randomised per tile and the chips have nothing to say.
		return tileFigure(corners, state, rule, patch.wirings?.[i]);
	});
	patchCache.set(patch, { key, arcs });
	return arcs;
}
