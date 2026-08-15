// SPHERICAL HALF-TILES: what you get when a Platonic face is cut in two and the halves are allowed to
// reassemble however they like (Alessandro Longo's idea, 2026-08-14).
//
// Halve a regular tile and the halves carry edges of two or three DIFFERENT lengths, so gluing has to
// be constrained by edge type — and once it is, the pieces can be laid down in ways the whole tile
// could not. The cube's face cut by a diagonal is the clearest case: seven distinct tilings, of which
// the cube itself is one.
//
// The tile is rigid, because a spherical triangle's sides follow from its angles, and that fixes the
// count before any search runs: a tile's angles overshoot pi by exactly its area, the sphere's area is
// 4pi, so every tiling by one tile uses 4pi/excess of them — 16, 12 and 40 for the three boards here.
// Enumerated by the Čtrnáct engine (tools/ctrnact-oracle/alphabets/palettes/sph-*-half.json) and
// developed by develop_sph_half.py; each board's count is independently reproduced by a group
// computation (the cube: orbits of the 2^6 diagonal choices; the altitude cuts: perfect matchings of
// the face graph, since a foot lands at an edge MIDPOINT and edge-to-edge forces the neighbour across
// that edge to cut there too).
//
// A record IS a SphPolyPattern: these are spherical tilings carrying their own geometry, which is what
// that type holds, so populating it routes /play, the thumbnails and the cards through the three.js
// sphere the rest of the spherical shelf already draws on. Every face is a triangle, so a half-tiling
// draws in ONE fill — correct, since the palette has one tile — and the halving is still visible
// because that renderer inks every edge, including the cut across each original face.

import type { SphPolyPattern } from "@/lib/tilings/sph-poly";

export interface SphHalfBoard {
	/** Stable id, also the shard name: "oct-half". */
	id: string;
	/** Display label: "Octahedron halved". */
	label: string;
	/** What was cut, and how. */
	cut: string;
	/** The tile's angles in degrees, largest first. */
	angles: number[];
	/** Its side arcs in degrees, ascending — as many distinct values as the palette has edge types. */
	arcsDeg: number[];
	/** How many tiles every tiling on this board uses; the area bound, not an observation. */
	tiles: number;
	/** The k values shipped. The whole shelf is 11 tilings, so nothing is deferred. */
	ks: number[];
	/** Tilings per k. */
	counts: Record<number, number>;
}

export const SPH_HALF_BOARDS: SphHalfBoard[] = [
	{
		id: "oct-half",
		label: "Octahedron halved",
		cut: "the octahedron's 90-90-90 face, cut by an altitude",
		angles: [90, 90, 45],
		arcsDeg: [45, 90],
		tiles: 16,
		ks: [2, 3],
		counts: { 2: 1, 3: 1 },
	},
	{
		id: "cube-half",
		label: "Cube halved",
		cut: "the cube's 120-degree square face, cut by a diagonal",
		angles: [120, 60, 60],
		arcsDeg: [70.528779, 109.471221],
		tiles: 12,
		ks: [2, 4, 6],
		counts: { 2: 5, 4: 1, 6: 1 },
	},
	{
		id: "dodec-half",
		label: "Dodecahedron halved",
		// A pentagon has no halving DIAGONAL — a diagonal cuts off a triangle and leaves a quadrilateral —
		// so the cut is the mirror, and this is the first half-tile here that is not a triangle. Which
		// matters beyond bookkeeping: a spherical triangle is pinned by its angles and a quadrilateral is
		// not (2n-3 degrees of freedom against n angles), so this board's sides are declared, not derived.
		cut: "the dodecahedron's 120-degree pentagon face, cut by a mirror",
		angles: [120, 120, 90, 60],
		arcsDeg: [20.905157, 41.810315, 69.094843],
		tiles: 24,
		ks: [3, 4, 5, 7, 13],
		counts: { 3: 1, 4: 1, 5: 1, 7: 1, 13: 1 },
	},
	{
		id: "ico-half",
		label: "Icosahedron halved",
		cut: "the icosahedron's 72-72-72 face, cut by an altitude",
		angles: [90, 72, 36],
		arcsDeg: [31.717474, 58.282526, 63.434949],
		tiles: 40,
		ks: [3, 6],
		counts: { 3: 1, 6: 1 },
	},
];

export const SPH_HALF_BOARD_BY_ID = new Map(SPH_HALF_BOARDS.map((b) => [b.id, b]));

/** Shard URL. One file per board per k; the whole shelf is 11 tilings, all eager. */
export const sphHalfShardUrl = (id: string, k: number): string => `/spherical-half/sphalf-${id}-k${k}.json`;

/** The sub-axis key, "sph-" namespaced. It shares the AXIS with the 3.4.n.4 boards — which spherical
 *  tiling board you are looking at — but not the FAMILY: these boards are not members of that family, and
 *  while they briefly shared its "spp-" prefix the shelf filed them under its "3.4.n.4 solids" heading,
 *  which is simply false. Own prefix, own family, own heading. */
export const sphHalfSub = (p: SphPolyPattern): string => `sph-${p.base}`;
export const sphHalfSubOfBoard = (b: SphHalfBoard): string => `sph-${b.id}`;

/** Is this record one of ours? The 3.4.n.4 boards are "3", "4", "5"; these are named. */
export const isSphHalf = (p: SphPolyPattern): boolean => SPH_HALF_BOARD_BY_ID.has(p.base);

const POLYGON_NAME = ["", "", "", "triangle", "quadrilateral", "pentagon", "hexagon"];

/** Card / search label: the board, the tile it is made of, and how symmetric this particular one is —
 *  which is the only thing separating two tilings that agree on V, E, F and the tile. */
export function sphHalfFamilyLabel(p: SphPolyPattern): string {
	const b = SPH_HALF_BOARD_BY_ID.get(p.base);
	// NOT always a triangle: the dodecahedron's half is a quadrilateral, and this said "triangle" for it.
	const tile = b ? `${b.angles.join("-")} ${POLYGON_NAME[b.angles.length] ?? "tile"}` : "half-tile";
	return `${b?.label ?? p.base} · ${tile} · symmetry order ${p.stats.symmetryOrder}`;
}
