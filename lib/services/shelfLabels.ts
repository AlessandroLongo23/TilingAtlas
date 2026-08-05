// Display names for the sub axis and the family layer above it — the /play sidebar tree's presentation.
//
// Presentation, so it is deliberately NOT in referenceAtlas.ts, which owns ordering (`SUB_ORDER`,
// `subOf`, `familyOfSub`) and nothing else. It is not in catalogue-list-panel.tsx either, which is where
// it used to live: a "use client" component cannot be imported by a test without dragging every canvas
// underneath it into the run, and the guard in tests/catalogue-sub-family.test.ts is the whole reason
// this file exists.
//
// THE GUARD IS THE POINT. A sub with no entry here renders as its raw id — `spe-448`, `hpo-23` — and
// that is not hypothetical: eleven shelves shipped that way in v1.13.0 and were caught by eye, weeks
// after they landed. The test asserts every member of SUB_ORDER has a label, so the next board that
// arrives without one fails a test instead of reaching visitors as a slug.

import { IH_EDGE_BOARDS, ihEdgeSubOfBoard } from "@/lib/isohedral/edge-shelf";
import { PENT_EDGE_BOARDS, pentEdgeSubOfBoard } from "@/lib/pentagon/edge-shelf";

/**
 * A COLORING sub encodes two axes at once — "square-3" is the square grid, three colours — because a
 * coloring of a grid with n colours is its own catalogue and the shelf id has to name both. The tree
 * takes them apart again into a grid row and a palette row, so a visitor picks a grid first and a
 * palette second instead of reading seven pre-multiplied combinations.
 *
 * Deliberately anchored to the four grid stems instead of a loose /(.+)-(\d+)/: `hyp-668`, `spe-448`,
 * `pen-1` and `hpo-7` all match that shape and mean nothing of the kind.
 */
export const COLOR_SUB = /^(square|triangle|hex|ts)-(\d+)$/;

/**
 * Display name per FAMILY (referenceAtlas' `familyOfSub`) — the heading one level above a sub row.
 *
 * The split a visitor sees is boards whose tile is FIXED against boards whose tile is a family you can
 * move, with the Schwarz mirror boards their own thing in between. "Regular grids" is the loosest of the
 * four: {4,4}, {3,6} and {6,3} are regular, and the square-triangle board is a mix instead of a regular
 * tiling — but it is a fixed grid of regular polygons, which is the distinction the heading is drawing,
 * and "Fixed grids" reads like a bug report.
 */
export const FAMILY_LABEL: Record<string, string> = {
	grid: "Regular grids",
	"grid-colors": "Regular grids",
	"schwarz-eu": "Schwarz boards",
	"schwarz-board": "Schwarz boards",
	platonic: "Platonic solids",
	"sph-colors": "Platonic solids",
	"sph-edges": "Uniform polyhedra",
	"hyp-edges": "Base tilings",
	"hyp-colors": "Base tilings",
	"hyp-poly": "3.4.n.4 boards",
	"sph-poly": "3.4.n.4 solids",
	pent: "Pentagon families",
	ih: "Isohedral families",
};

/**
 * Hand-written names. Everything whose label says more than its id can — a "spe-443" is a triangular
 * prism, and no rule derives that.
 */
const NAMED: Record<string, string> = {
	square: "Square grid",
	triangle: "Triangle grid",
	hex: "Hexagon grid",
	ts: "Triangle + square grid",
	sch236: "Schwarz (2,3,6) grid",
	sch244: "Schwarz (2,4,4) grid",
	// The two PARAMETRIC namespaces are NOT here: their boards carry a label of their own, so the entries
	// are derived below and a new board arrives named. Marek sends these in batches — IH05 and IH06 landed
	// while this file was being written, IH07 and IH08 an hour later — and a hand-written row per board is
	// a queue of slugs waiting to reach visitors.
	// Colors splits the same grids again by palette size — each is its own catalogue.
	"square-2": "Square grid, 2 colors",
	"square-3": "Square grid, 3 colors",
	"triangle-2": "Triangle grid, 2 colors",
	"triangle-3": "Triangle grid, 3 colors",
	"hex-3": "Hexagon grid, 3 colors",
	"ts-2": "Triangle + square, 2 colors",
	"ts-3": "Triangle + square, 3 colors",
	tetrahedron: "Tetrahedron",
	octahedron: "Octahedron",
	cube: "Cube",
	dodecahedron: "Dodecahedron",
	icosahedron: "Icosahedron",
	// Schwarz boards: one sub per (p,q,r) reflection group. The board is the sphere / disk cut by its
	// mirrors, so the label names the triple, not a Schläfli symbol — (2,3,4) has no {p,q} name.
	"sps-223": "(2,2,3) board",
	"sps-224": "(2,2,4) board",
	"sps-233": "(2,3,3) board",
	"sps-234": "(2,3,4) board",
	"sps-235": "(2,3,5) board",
	"hys-237": "(2,3,7) board",
	"hys-245": "(2,4,5) board",
	// Uniform-polyhedron edge systems: one sub per solid. The label is the solid, since a prism has no
	// Schläfli symbol and "3.4.4" alone would not read as a shape.
	"spe-443": "Triangular prism edges",
	"spe-445": "Pentagonal prism edges",
	"spe-446": "Hexagonal prism edges",
	"spe-447": "Heptagonal prism edges",
	"spe-663": "Truncated tetrahedron edges",
	"spe-3334": "Square antiprism edges",
	"spe-3335": "Pentagonal antiprism edges",
	"spe-3336": "Hexagonal antiprism edges",
	"spe-cuboctahedron": "Cuboctahedron edges",
	"spe-j27": "Triangular orthobicupola edges",
	"spe-448": "Octagonal prism edges",
	"spe-664": "Truncated octahedron edges",
	"spe-3337": "Heptagonal antiprism edges",
	"spe-3338": "Octagonal antiprism edges",
	"spe-4443": "Rhombicuboctahedron edges",
	"spe-j37": "Pseudo-rhombicuboctahedron edges",
	"spe-33334": "Snub cube edges",
	// The 3.4.n.4 family on the sphere, n = 3, 4, 5 — the same rows as "hpo-", other side of the split.
	"spp-3": "3.4.3.4 solids",
	"spp-4": "3.4.4.4 solids",
	"spp-5": "3.4.5.4 solids",
	// The 3.4.n.4 family: one sub per board. Labelled by the defining vertex figure, which is also what
	// names the edge length the whole board is built at.
	"hpo-7": "3.4.7.4 tilings",
	"hpo-8": "3.4.8.4 tilings",
	"hpo-9": "3.4.9.4 tilings",
	"hpo-10": "3.4.10.4 tilings",
	"hpo-11": "3.4.11.4 tilings",
	"hpo-12": "3.4.12.4 tilings",
	"hpo-13": "3.4.13.4 tilings",
	"hpo-14": "3.4.14.4 tilings",
	"hpo-15": "3.4.15.4 tilings",
	"hpo-16": "3.4.16.4 tilings",
	"hpo-17": "3.4.17.4 tilings",
	"hpo-18": "3.4.18.4 tilings",
	"hpo-19": "3.4.19.4 tilings",
	"hpo-20": "3.4.20.4 tilings",
	"hpo-23": "3.4.23.4 tilings",
	// Hyperbolic edge systems: one sub per base tiling.
	"hyp-667": "6.6.7 edges",
	"hyp-668": "6.6.8 edges",
	"hyp-37": "{3,7} edges",
	"hyp-38": "{3,8} edges",
	"hyp-45": "{4,5} edges",
	"hyp-46": "{4,6} edges",
	"hyp-54": "{5,4} edges",
	"hyp-55": "{5,5} edges",
	"hyp-64": "{6,4} edges",
	"hyp-65": "{6,5} edges",
	"hyp-73": "{7,3} edges",
	"hyp-74": "{7,4} edges",
	"hyp-83": "{8,3} edges",
	"hyp-84": "{8,4} edges",
	// Hyperbolic colored tilings: one sub per base {p,q}.
	"hyc-37": "{3,7} colored",
	"hyc-73": "{7,3} colored",
	"hyc-83": "{8,3} colored",
	"hyc-54": "{5,4} colored",
	"hyc-64": "{6,4} colored",
	"hyc-45": "{4,5} colored",
	// Spherical colored tilings: one sub per Platonic solid.
	"spc-tetrahedron": "Tetrahedron colored",
	"spc-octahedron": "Octahedron colored",
	"spc-cube": "Cube colored",
	"spc-dodecahedron": "Dodecahedron colored",
	"spc-icosahedron": "Icosahedron colored",
};

/**
 * The board-driven namespaces, derived from the very tables that generate `SUB_ORDER`.
 *
 * The two cannot fall out of step, which is the whole reason for doing it this way: a board declared in
 * `IH_EDGE_BOARDS` gets its sub row and its display name from one edit, instead of one edit and a second
 * one somebody has to remember. A hand-written entry in `NAMED` still wins, for a board that earns a
 * better name than its number.
 */
export const SUB_LABEL: Record<string, string> = {
	...Object.fromEntries(
		PENT_EDGE_BOARDS.map((b) => [pentEdgeSubOfBoard(b), `Pentagon (Kershner ${b.type}) edges`]),
	),
	...Object.fromEntries(IH_EDGE_BOARDS.map((b) => [ihEdgeSubOfBoard(b), `Isohedral ${b.label} edges`])),
	...NAMED,
};

/**
 * The same rows, named for the slot where the FAMILY HEADING IS ALREADY ON SCREEN.
 *
 * "Isohedral families / Isohedral IH01 edges" says isohedral twice and wraps a chip onto three lines for
 * the privilege. Under a heading, the row only has to say which member it is: IH01, Kershner 1, (2,3,6).
 *
 * One table, two slots — deliberately not a second naming scheme. `SUB_LABEL` is what a row is called when
 * it stands alone; this is what it is called under its family. Both surfaces read whichever slot they are
 * rendering, so the two cannot describe the same board differently.
 */
const FAMILY_WORD = /^(Schwarz|Isohedral|Pentagon)\s+/i;
const SHELF_WORD = /\s+(grid|edges|colored|tilings|solids|board)$/i;

export const SUB_SHORT_LABEL: Record<string, string> = {
	// Derived from the board tables, like the long names above, so a new board arrives short too.
	...Object.fromEntries(PENT_EDGE_BOARDS.map((b) => [pentEdgeSubOfBoard(b), `Kershner ${b.type}`])),
	...Object.fromEntries(IH_EDGE_BOARDS.map((b) => [ihEdgeSubOfBoard(b), b.label])),
	// Everything hand-named drops the family word in front and the shelf word behind, which is exactly the
	// redundancy the heading already covers: "Schwarz (2,3,6) grid" → "(2,3,6)", "3.4.7.4 tilings" → "3.4.7.4".
	...Object.fromEntries(
		Object.entries(NAMED).map(([sub, label]) => [
			sub,
			label.replace(FAMILY_WORD, "").replace(SHELF_WORD, "") || label,
		]),
	),
};

/** The row's name under its family heading, falling back to the standalone name and then the raw id. */
export const shortSubLabel = (sub: string): string =>
	SUB_SHORT_LABEL[sub] ?? SUB_LABEL[sub] ?? sub;
