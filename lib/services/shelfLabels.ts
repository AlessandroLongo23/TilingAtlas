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

import { SPH_BUBBLE_SOLIDS } from "@/lib/services/referenceAtlas";
import { HYP_EDGES_BASES } from "@/lib/freedraw/hyp-edges";
import { SCHWARZ_BOARDS, schwarzSubOfBoard } from "@/lib/freedraw/schwarz";
import { SPH_EDGES_BOARDS, sphEdgesSubOfBoard } from "@/lib/freedraw/sph-edges";
import { IH_EDGE_BOARDS, ihEdgeSubOfBoard } from "@/lib/isohedral/edge-shelf";
import { PENT_EDGE_BOARDS, pentEdgeSubOfBoard } from "@/lib/pentagon/edge-shelf";
import { HYP_POLY_BOARDS, hypPolySubOfBoard } from "@/lib/tilings/hyp-poly";
import {
	HYP_TILING_BOARDS,
	HYP_TILING_VALENCES,
	hypTilingBoardLabel,
	hypTilingSubOfBoard,
	hypTilingValenceLabel,
} from "@/lib/tilings/hyp-tilings";
import {
	polyformOrderLabel,
	polyformSubOfBoard,
	POLYFORM_BOARDS,
	POLYFORM_FAMILY_LABEL,
} from "@/lib/tilings/polyform";

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
	// Bubble tiles get their own family row rather than joining "Regular grids": the lattice is the
	// SUBSTRATE the tiles decorate, and its tile set differs per lattice (4 triangular, 6 square,
	// 14 hexagonal), so these are three catalogues and not three views of one.
	// No "Bubble" prefix: these headings only ever render inside the bubble class, so the word is
	// already on screen twice above them.
	"bubble-grid": "Regular polygons",
	"bubble-poly": "Polyiamonds",
	// The third heading, and the reason the first two can stay honest. A hexagon is the 6-iamond as
	// much as a rhombus is the 2-iamond, so "is this board regular or polyiamond" has no answer once
	// two families share a board — the mixtures get their own row instead of being filed under
	// whichever family was named first (AL, 2026-08-27). Triangle+hexagon and triangle+square moved
	// here from "Regular polygons" for the same reason: one mixture under one heading and another
	// under a different one was the incoherence.
	"bubble-mixed": "Mixed families",
	// The spherical bubble boards. Named for the solids rather than "Bubble tiles" because the heading
	// renders inside the bubble class, where that word is already on screen.
	"sph-bubble": "Spherical solids",
	// The polyform shelf: one heading per atomic tile, named for what the pieces are made of.
	...Object.fromEntries(
		(Object.keys(POLYFORM_FAMILY_LABEL) as (keyof typeof POLYFORM_FAMILY_LABEL)[])
			.map((f) => [`pf-${f}`, POLYFORM_FAMILY_LABEL[f]]),
	),
	"schwarz-eu": "Schwarz boards",
	"schwarz-board": "Schwarz boards",
	platonic: "Platonic solids",
	"sph-colors": "Platonic solids",
	"sph-edges": "Uniform polyhedra",
	"hyp-edges": "Base tilings",
	"hyp-colors": "Base tilings",
	"hyp-poly": "3.4.n.4 boards",
	"hyp-poly-t": "{3,n} boards",
	"hyp-poly-q": "4-valent boards",
	// The base hyperbolic shelf, one heading per valence. Derived, so a corpus that reaches valence 9
	// arrives named instead of rendering "hyt-v9" at a visitor.
	...Object.fromEntries(HYP_TILING_VALENCES.map((v) => [`hyt-v${v}`, hypTilingValenceLabel(v)])),
	// CONVEXITY, the spherical shelf's top split (AL, 2026-08-21). A hard property and an exact partition:
	// every star polyhedron is non-convex, everything else here is convex. Convex gathers the reference
	// solids, the 3.4.n.4 boards and the halved boards; non-convex is the star shelf alone.
	"sph-convex": "Convex",
	"sph-nonconvex": "Non-convex",
	"hyp-half": "Halved {p,q} faces",
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
	// Named after the vertex figure, like the two Schwarz boards are named after their triple: the id is
	// Marek's digit string and "4436" says nothing to a reader.
	"4436": "3.4.6.4 grid",
	"488": "4.8.8 grid",
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
	// The reference solids as ONE row: Platonic, Archimedean, prisms, antiprisms and Johnson, every face a
	// regular polygon. The k rows beneath already draw the line that matters — k = 1 is exactly the
	// UNIFORM solids and k > 1 is exactly the JOHNSON ones (a Johnson solid is by definition a convex
	// regular-faced polyhedron that is not uniform), which is why the k row names them.
	"spx-solid": "Regular polygons",
	// One row for the whole star shelf; the k rows beneath split it (52 at k=1, 37 at k=2). Density is on
	// every card and in every record — it is just no longer the axis, which is what AL asked for.
	// ⚑ Its k = 1 row gained the three star-faced HEMIPOLYHEDRA on 2026-08-30 and is NOT named for them:
	// 52 of its 55 members are ordinary uniform star polyhedra. Only the non-convex shelf's k = 1 row,
	// which is nothing but hemipolyhedra, carries that noun.
	// ⚑ THE SYMBOL IS THE POINT (AL, 2026-08-31). Two shelves now hold star-faced solids and the word
	// "star" alone does not say which star: this one's faces are the {n/d} of Schlafli, n sides that
	// CROSS, drawn in one stroke, one corner angle. Its sibling's are the simple 2n-gon outline.
	sst: "Star polyhedra {n/d}",
	// The other star, written the way the cards and the census write it: 5*, 8*, 10*. A simple 2n-gon
	// alternating a sharp point with a REFLEX dent — no self-intersection, and no gcd(n,d) = 1 either,
	// which is why this shelf can hold the outline of a compound like {6/2} that is not a polygon at all.
	"sis-solid": "Star polyhedra n*",
	// The star shelf's sibling, and the non-convex half of the same face-type split the convex side makes:
	// every face here is an ordinary regular polygon and the SOLID is what bends past pi, where the star
	// shelf's faces are the {n/d} themselves. Unnamed by design; nothing enumerates this class.
	//
	// ⚑ It read "No circumsphere" while every one of the 34 the k=2 sweep produced lacked one. The k=3
	// harvest brought a solid that HAS a circumsphere (ncx-7-15-10-a), so the label described 67 of 68 and
	// a shelf name has to be true of the shelf. The circumsphere is still measured per solid and still
	// decides whether the spherical view is offered; it is not what these are.
	// ⚑ Its k = 1 row is SIX of the nine HEMIPOLYHEDRA (2026-08-30), and it was empty until they landed.
	// k = 1 regular-faced means vertex-transitive means uniform, so that row could only ever hold the
	// uniform non-convex solids, and the ones with a face through the centre are the ones no other shelf
	// can take — the star shelf orders by density and a central face has none. The other three of the
	// nine carry a {5/2} or {10/3} face and file under "sst" with the rest of the star-faced records,
	// because that is the split these two headings already make. See lib/render/hemiSolids.ts.
	"spn-solid": "Regular polygons",
	// Genus 1: the surface closes at V - E + F = 0. Its own row and not a facet under the
	// non-convex one, because the topology is what these ARE — every other solid in the atlas,
	// star and non-convex included, is a map on a sphere.
	"spt-solid": "Toroidal",
	// …and one row per genus above it. Written over a RANGE and not over the genera that happen to
	// exist today: the search that produces these is still running, a genus with no records simply
	// never draws a row, and the alternative is a code change every time the run finds a new one.
	...Object.fromEntries(
		Array.from({ length: 23 }, (_, i) => [`spg${i + 2}-solid`, `Genus ${i + 2}`]),
	),
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
	// One per polyform board. Derived, so a pentomino board would arrive named.
	...Object.fromEntries(POLYFORM_BOARDS.map((b) => [polyformSubOfBoard(b), b.label])),
	// One per bubble lattice. Named by the substrate polygon, which is what the tile set follows from.
	"bub-triangle": "Triangle lattice",
	"bub-square": "Square lattice",
	"bub-hex": "Hexagon lattice",
	// Not a lattice: a mixed substrate, the board the paper's (T,H) rows live on.
	"bub-tri-hex": "Triangle + hexagon",
	"bub-tri-square": "Triangle + square",
	"bub-tri-sq-hex": "Triangle + square + hexagon",
	"bub-rhombus": "Rhombus (2-iamond)",
	"bub-rhomb-tri": "Rhombus + triangle",
	"bub-rhomb-hex": "Rhombus + hexagon",
	"bub-rhomb-tri-hex": "Rhombus + triangle + hexagon",
	// The spherical bubble boards, named by their solid. Derived so a board cannot be added to the shelf
	// and left unnamed in the tree.
	...Object.fromEntries(
		SPH_BUBBLE_SOLIDS.map((s) => [
			`sbub-${s}`,
			s.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()),
		]),
	),
	// The palettes under "Different edge lengths".
	"el-tri45": "Triangles and squares",
	"el-planigon": "Planigons",
	"el-penrose": "Penrose kite and dart",
	"el-plen": "Parametric edge lengths",
	// The Euclidean half-polygons. Named by the polygon and the cut, because the cut is what decides
	// the board — a hexagon halved two ways gives two entirely different catalogues.
	"el-euh-tri": "Half equilateral triangle",
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
	// The base hyperbolic boards. Under their valence heading the alphabet is the whole name; standing
	// alone (in /library's board wall, where the heading may be scrolled away) it carries the valence too.
	...Object.fromEntries(
		HYP_TILING_BOARDS.map((b) => [
			hypTilingSubOfBoard(b),
			`${hypTilingBoardLabel(b)}, ${hypTilingValenceLabel(b.valence)}`,
		]),
	),
	// Star polyhedra, one row per density the shelf actually holds. Derived for the same reason as the
	// board shelves above: which densities exist is a fact about the records, and writing them out by
	// hand is how a new solid ships a row labelled with its own slug.
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
	// The polyform boards under their form heading: the form is on screen, so the chip names n.
	...Object.fromEntries(POLYFORM_BOARDS.map((b) => [polyformSubOfBoard(b), polyformOrderLabel(b)])),
	// Derived from the board tables, like the long names above, so a new board arrives short too.
	...Object.fromEntries(PENT_EDGE_BOARDS.map((b) => [pentEdgeSubOfBoard(b), `Kershner ${b.type}`])),
	...Object.fromEntries(IH_EDGE_BOARDS.map((b) => [ihEdgeSubOfBoard(b), b.label])),
	...Object.fromEntries(SCHWARZ_BOARDS.map((b) => [schwarzSubOfBoard(b), b.label])),
	...Object.fromEntries(SPH_EDGES_BOARDS.map((b) => [sphEdgesSubOfBoard(b), solidName(b.solid)])),
	...Object.fromEntries(HYP_EDGES_BASES.map((b) => [`hyp-${b.id}`, b.label])),
	...Object.fromEntries(HYP_POLY_BOARDS.map((b) => [hypPolySubOfBoard(b), b.label])),
	...Object.fromEntries(
		HYP_TILING_BOARDS.map((b) => [hypTilingSubOfBoard(b), hypTilingBoardLabel(b)]),
	),
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
