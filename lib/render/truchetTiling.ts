// A PLAIN TILING, drawn Truchet-style: the tile-figure system of lib/freedraw/arcs.ts applied to a
// k-uniform tiling instead of to an edge pattern. AL's idea, 2026-08-14.
//
// An edge pattern says which edges are connected; a tiling says nothing, so EVERY edge counts as
// connected and the only freedom left is the drawing. A tile with c edges has Catalan(c) of them — 14
// for a square, 2 for a triangle, 132 for a hexagon, counting only the embedded ones, since a wiring
// whose arcs cross has no black region to speak of (see arcs.ts). That is the whole content here: pick
// one per tile, at random, and the plane fills with Truchet patterns over the atlas's own tilings.
// Reshuffling means a new seed.
//
// WHY A SUPERCELL. A tiling reaches every renderer as a fundamental cell stamped across the view, so a
// choice made per tile OF THE CELL repeats with the period — on a k=1 tiling that is one drawing on
// every tile, which is a wallpaper, not a Truchet pattern. The randomness has to outlive the period, so
// the pattern this builds is a BLOCK of `side` x `side` copies of the cell whose tiles are drawn
// independently, republished as one period. The picture still repeats, just `side` times further out;
// at 6 that is 36 independently drawn copies, past the edge of the screen at any zoom that shows the
// tiles. Regrouping copies into blocks cannot break the tiling: the base polygons already cover the
// plane under the basis, so any block of them stamped by (side*v1, side*v2) covers it too — including
// the ones that straddle a block edge, which their neighbour's copies complete exactly.
//
// The result is a FreedrawPattern with a patch, so everything downstream works unchanged: the 2D canvas,
// the /play overlay, the conformal lens, the Grid overlay, the wiring chips. The one addition is
// `patch.wirings`, the per-tile permutation this picks.

import {
	figureEscapes,
	figureSelfIntersects,
	randomWiring,
	tileFigure,
	wiringPermutation,
	type Pt,
	type TileRule,
} from "@/lib/freedraw/arcs";
import type { FreedrawPattern } from "@/lib/freedraw/pattern";
import { parseBaseCell, type TranslationalCellData } from "@/lib/utils/renderTiling";

/** Copies of the fundamental cell per side of the block. 6 => 36 independently drawn copies. */
export const TRUCHET_BLOCK = 6;

/** Vertex dedup tolerance, as a fraction of the cell's median edge. */
const WELD_FRAC = 1e-4;

export interface TruchetOptions {
	/** Reshuffle handle. The same seed rebuilds the same pattern, so a link reproduces a picture. */
	seed: number;
	/** Block side. Larger repeats further out and costs proportionally more geometry. */
	block?: number;
	/**
	 * Where a tile's drawing comes from. `null` (the default) draws each tile at random over the
	 * Catalan(c) NON-CROSSING drawings; a rule instead applies that one named wiring to every tile,
	 * which is the un-shuffled comparison.
	 */
	rule?: TileRule | null;
}

/** xorshift32 — a seeded stream, so "the same seed gives the same pattern" is a real guarantee. */
function rng(seed: number): () => number {
	let s = (seed | 0) || 0x9e3779b9;
	return () => {
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		return ((s >>> 0) % 0x100000000) / 0x100000000;
	};
}

/** Random tries before a tile falls back to the named wirings, in order. */
const DRAW_TRIES = 16;

/**
 * One tile's drawing, at random over the NON-CROSSING wirings only.
 *
 * A crossed wiring has no black region to speak of: its loops overlap, and the overlap is inside two of
 * them at once, so its colour has to come from a winding rule instead of from containment — which is not
 * an answer to what colour a patch of a tile is. `randomWiring` rules those out combinatorially, over
 * the Catalan(c) embedded drawings rather than the c! wirings. The geometric check on top catches the
 * residue: on a REGULAR tile every embedded wiring also draws disjointly, but a long enough scalene one
 * can still send a band through a cap, and the atlas's flat shelves are not all regular (the star and
 * polyomino tiles are neither regular nor convex).
 */
function drawWiring(corners: readonly Pt[], next: () => number): number[] {
	const all = corners.map(() => true);
	const ok = (w: number[]) => {
		const loops = tileFigure(corners, all, undefined, w);
		return !figureSelfIntersects(loops) && !figureEscapes(corners, loops);
	};
	for (let i = 0; i < DRAW_TRIES; i++) {
		const w = randomWiring(corners.length, next);
		if (ok(w)) return w;
	}
	// A tile the random draw cannot satisfy in sixteen tries is a hard one — a thin reflex wedge on the
	// scaled shelf, usually. Walk the named wirings from the most adventurous to the least, and end on
	// "caps", whose arcs are semicircles a sixth of an edge deep and so the last thing to escape anything.
	const c = corners.length;
	for (const rule of [
		{ wiring: "ribbons", twist: 0 },
		{ wiring: "ribbons", twist: 1 },
		{ wiring: "junction", twist: 0 },
		{ wiring: "caps", twist: 0 },
	] as const) {
		const w = wiringPermutation(c, rule);
		if (ok(w)) return w;
	}
	return wiringPermutation(c, { wiring: "caps", twist: 0 });
}

/**
 * The tiling as a Truchet pattern, or null when the cell carries no polygons.
 *
 * Vertices are WELDED across tiles (rounded to a grid a ten-thousandth of a median edge), so two tiles
 * meeting at an edge reference the same pair of indices and that edge appears once. Without the weld
 * every edge would be listed twice — the scaffold would stroke it twice, and, worse, an edge found
 * under one tile's indices would not be found under the other's.
 */
export function truchetPattern(
	cell: TranslationalCellData | null,
	opts: TruchetOptions,
): FreedrawPattern | null {
	if (!cell) return null;
	const base = parseBaseCell(cell);
	if (!base || base.polys.length === 0) return null;
	const block = Math.max(1, Math.floor(opts.block ?? TRUCHET_BLOCK));
	const [[v1x, v1y], [v2x, v2y]] = base.basis;

	const weld = Math.max(1e-9, base.medianEdge * WELD_FRAC);
	const index = new Map<string, number>();
	const verts: [number, number][] = [];
	const vertexAt = (x: number, y: number): number => {
		const key = `${Math.round(x / weld)}|${Math.round(y / weld)}`;
		const hit = index.get(key);
		if (hit !== undefined) return hit;
		const id = verts.length;
		verts.push([x, y]);
		index.set(key, id);
		return id;
	};

	const polys: [number, number, number][][] = [];
	const wirings: number[][] = [];
	const edgeSeen = new Set<string>();
	const edges: [number, number, number, number, number][] = [];
	const next = rng(opts.seed);

	for (let n = 0; n < block; n++) {
		for (let m = 0; m < block; m++) {
			const dx = m * v1x + n * v2x;
			const dy = m * v1y + n * v2y;
			for (const poly of base.polys) {
				// Open polylines are marks, not tiles (the isohedral shelf's interior ⌐), and they have no
				// inside to draw a figure in.
				if (poly.open === true || poly.vertices.length < 3) continue;
				// The tile in world coordinates, which the draw needs: on this shelf a wiring has to be
				// checked against the actual shape, not just counted, so `drawWiring` sees the corners.
				const corners = poly.vertices.map((p): Pt => [p.x + dx, p.y + dy]);
				const ring = corners.map((c): [number, number, number] => [vertexAt(c[0], c[1]), 0, 0]);
				polys.push(ring);
				wirings.push(
					opts.rule ? wiringPermutation(ring.length, opts.rule) : drawWiring(corners, next),
				);
				for (let i = 0; i < ring.length; i++) {
					const a = ring[i][0];
					const b = ring[(i + 1) % ring.length][0];
					const key = a < b ? `${a}|${b}` : `${b}|${a}`;
					if (edgeSeen.has(key)) continue;
					edgeSeen.add(key);
					// Every edge of a tiling is connected — that is the whole difference from an edge pattern.
					edges.push([a, b, 0, 0, 1]);
				}
			}
		}
	}
	if (polys.length === 0) return null;

	return {
		id: `truchet-${opts.seed}`,
		k: 1,
		a: 1,
		b: 0,
		d: 1,
		h: [0],
		v: [0],
		orbit: [0],
		grid: "ts", // a patch board: the geometry is explicit and there is no lattice to index
		patch: {
			T1: [block * v1x, block * v1y],
			T2: [block * v2x, block * v2y],
			verts,
			vorbit: verts.map(() => 0),
			edges,
			polys,
			wirings,
			// One component per tile. Nothing downstream classifies a Truchet board — the cell fill is off
			// whenever the figures are up — but the fields have to be total for analyseFaces.
			polyComp: polys.map((_, i) => i),
			compRank: polys.map(() => 0 as const),
			compCells: polys.map(() => 1),
			compHoles: polys.map(() => 0),
			stats: {
				faceOrbits: polys.length,
				finite: polys.length,
				strips: 0,
				unbounded: 0,
				withHoles: 0,
			},
		},
	};
}

/** World units across the shorter canvas side that show a readable number of tiles. */
export const truchetCells = (cell: TranslationalCellData | null): number => {
	const base = cell ? parseBaseCell(cell) : null;
	return Math.max(1, (base?.medianEdge ?? 1) * 14);
};


