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

import { HYP_EDGES_BASES } from "@/lib/freedraw/hyp-edges";
import { SCHWARZ_BOARDS, schwarzSubOfBoard } from "@/lib/freedraw/schwarz";
import { SPH_EDGES_BOARDS, sphEdgesSubOfBoard } from "@/lib/freedraw/sph-edges";
import { IH_EDGE_BOARDS, ihEdgeSubOfBoard } from "@/lib/isohedral/edge-shelf";
import { PENT_EDGE_BOARDS, pentEdgeSubOfBoard } from "@/lib/pentagon/edge-shelf";
import { HYP_POLY_BOARDS, hypPolySubOfBoard } from "@/lib/tilings/hyp-poly";

/** "pseudo-rhombicuboctahedron (J37)" → "Pseudo-rhombicuboctahedron". The parenthetical is the Johnson
 *  number, which the card already carries and a 14-character sidebar chip cannot. */
const solidName = (s: string): string =>
	s.replace(/\s*\([^)]*\)\s*$/, "").replace(/^./, (c) => c.toUpperCase());

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
	"hyp-poly-t": "{3,n} boards",
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
	// A Platonic face cut in two, and what the halves tile — the count is 4pi/(tile area) exactly.
	// A {p,q} face cut in two, and what the halves tile. Infinite boards, so no tile count in the name.
	"hph-45-half": "{4,5} halved",
	"hph-37-half": "{3,7} halved",
	"hph-38-half": "{3,8} halved",
	"hph-54-half": "{5,4} halved",
	"hph-64-half": "{6,4} halved",
	"hph-46-half": "{4,6} halved",
	"sph-oct-half": "Octahedron halved (16 tiles)",
	"sph-cube-half": "Cube halved (12 tiles)",
	"sph-ico-half": "Icosahedron halved (40 tiles)",
	"sph-dodec-half": "Dodecahedron halved (24 tiles)",
	"spp-3": "3.4.3.4 solids",
	"spp-4": "3.4.4.4 solids",
	"spp-5": "3.4.5.4 solids",
	// The two hyperbolic-poly families are NOT here either: their boards carry a label, so "3.4.7.4
	// tilings" and "{3,7} tilings" are derived below off HYP_POLY_BOARDS.
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
	// The palettes under "Different edge lengths".
	"el-tri45": "Triangles and squares",
	"el-planigon": "Planigons",
	"el-penrose": "Penrose kite and dart",
	// The Euclidean half-polygons. Named by the polygon and the cut, because the cut is what decides
	// the board — a hexagon halved two ways gives two entirely different catalogues.
	"el-euh-hexv": "Half hexagon (long diagonal)",
	"el-euh-pent": "Half pentagon",
	"el-euh-hexm": "Half hexagon (edge midpoints)",
	"el-euh-sqmid": "Domino (half square)",
	...Object.fromEntries(
		PENT_EDGE_BOARDS.map((b) => [pentEdgeSubOfBoard(b), `Pentagon (Kershner ${b.type}) edges`]),
	),
	...Object.fromEntries(IH_EDGE_BOARDS.map((b) => [ihEdgeSubOfBoard(b), `Isohedral ${b.label} edges`])),
	// The three board-driven edge shelves, derived for the same reason: the 2026-08-12 drop added 21 subs
	// across them in one afternoon and every one would have needed a second edit here. The tables already
	// carry the words — a Schwarz board its triple, a spherical board its solid, a hyperbolic base its
	// vertex figure — so the name follows the board. `NAMED` still wins where one earns a better phrase.
	...Object.fromEntries(SCHWARZ_BOARDS.map((b) => [schwarzSubOfBoard(b), `${b.label} board`])),
	...Object.fromEntries(SPH_EDGES_BOARDS.map((b) => [sphEdgesSubOfBoard(b), `${solidName(b.solid)} edges`])),
	...Object.fromEntries(HYP_EDGES_BASES.map((b) => [`hyp-${b.id}`, `${b.label} edges`])),
	// Both hyperbolic-poly families at once — the board's own label decides which words appear, so the
	// {3,n} boards arrived named on the day they landed and a third family would too.
	...Object.fromEntries(HYP_POLY_BOARDS.map((b) => [hypPolySubOfBoard(b), `${b.label} tilings`])),
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
	...Object.fromEntries(SCHWARZ_BOARDS.map((b) => [schwarzSubOfBoard(b), b.label])),
	...Object.fromEntries(SPH_EDGES_BOARDS.map((b) => [sphEdgesSubOfBoard(b), solidName(b.solid)])),
	...Object.fromEntries(HYP_EDGES_BASES.map((b) => [`hyp-${b.id}`, b.label])),
	...Object.fromEntries(HYP_POLY_BOARDS.map((b) => [hypPolySubOfBoard(b), b.label])),
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
