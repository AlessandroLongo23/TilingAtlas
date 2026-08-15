// One taxonomy for every catalogue facet, shared by /library's filter panel and /play's browse tree.
//
// WHY THIS EXISTS. The two surfaces browse the SAME data — both call `loadReferenceAtlas` and the same
// nine lazy shard loaders — but each used to carry its own hand-typed description of what that data
// contains. /play's tree reads `SUB_ORDER` / `familyOfSub` / `SUB_LABEL`; /library's panel had a parallel
// set of literal arrays. Nothing tied them together, so they drifted, and the drift is invisible: a
// missing chip does not throw, it just means a corpus no visitor can reach.
//
// That is not hypothetical, and it happened at least three times:
//
//   * The isotoxal k = 4 tier was known to the shelf and not to /play (fixed by importing the tier list,
//     see the comment on HIGHER_K in components/reference-shelf.tsx — the precedent for this file).
//   * Eleven shelves shipped in v1.13.0 with no display name, reaching visitors as `spe-448`, `hpo-23`.
//   * The pentagon and isohedral boards never got a chip in /library's grid facet, so 128,944 edge-pattern
//     records were paginated with no way to narrow to them. Present, unreachable, reported as missing.
//
// THE RULE THAT PREVENTS THE NEXT ONE. Every facet's options are declared as an EXHAUSTIVE
// `Record<Value, string>` over the facet's own value type, never as a literal array. `Record` makes the
// compiler demand a label for each member, so widening a value type (a new tile class, a new grid, a new
// Islamic system) fails to build until every surface can show it. An array typed `{ value: "all" | T }[]`
// — which is what these were — permits any subset, which is exactly how a value goes missing in silence.
//
// The BOARD facet is derived instead of declared: it reads `SUB_ORDER` and `familyOfSub` directly, so a
// board Marek sends lands in both surfaces from the one edit that adds it to its shelf table. Marek sent
// four isohedral boards in a single day while this was being written, which is the rate this has to keep up
// with.

import type { ColorsGrid } from "@/lib/colors/pattern";
import {
	familyOfSub,
	SUB_ORDER,
	TILE_CLASS_LABEL,
	TILE_CLASS_ORDER,
	type Certification,
	type FreedrawKind,
	type FreedrawRegular,
	type IslamicSystem,
	type EdgeBoard,
	type SubFamily,
	type TileClass,
} from "./referenceAtlas";
import { COLOR_SUB, FAMILY_LABEL, SUB_LABEL, shortSubLabel } from "./shelfLabels";

/** An option as the filter walls want it. */
export interface FacetOption<T> {
	value: T;
	label: string;
}

/**
 * Turn an exhaustive label table into a wall of chips with "All" in front.
 *
 * `order` exists because `Object.keys` on a Record is insertion-ordered but not TYPE-ordered: a member
 * added to the union but appended to the literal would sort last even when it belongs first. Passing the
 * order explicitly keeps display order a decision instead of an accident.
 */
export function withAll<T extends string | number>(
	order: readonly T[],
	label: Record<T, string>,
): FacetOption<"all" | T>[] {
	return [{ value: "all" as const, label: "All" }, ...order.map((v) => ({ value: v, label: label[v] }))];
}

/** The values of a facet, as the URL parser needs them for validation. */
export const valuesOf = <T extends string | number>(order: readonly T[]): T[] => [...order];

// ── The shape axis ───────────────────────────────────────────────────────────────────────────────────
// hyperbolic/spherical are geometries and freedraw/colors are decorations, so each is the sole occupant of
// its (geometry, decoration) cell and a chip for it would restate the segment already chosen. What is left
// is the shape axis proper.
export const SHAPE_CLASS_ORDER = TILE_CLASS_ORDER.filter(
	(c): c is Exclude<TileClass, "hyperbolic" | "spherical" | "freedraw" | "colors"> =>
		c !== "hyperbolic" && c !== "spherical" && c !== "freedraw" && c !== "colors",
);
export const SHAPE_CLASS_LABEL = Object.fromEntries(
	SHAPE_CLASS_ORDER.map((c) => [c, TILE_CLASS_LABEL[c].short]),
) as Record<(typeof SHAPE_CLASS_ORDER)[number], string>;

// ── Per-shelf sub-class facets ───────────────────────────────────────────────────────────────────────

/** The palettes inside the "Multiple edge lengths" class. Planigons first: it is the larger tile set
 *  and the one whose name explains the class. */
export const EDGE_BOARD_ORDER: EdgeBoard[] = ["planigon", "tri45", "penrose",
	"euh-hexv", "euh-pent", "euh-hexm", "euh-sqmid"];
/** ONE ROW PER TILE SHAPE. The four halved-polygon boards share a source but are four different
 *  tiles, and a visitor choosing here is choosing a shape — a single "Halved regular polygons"
 *  chip would hide a trapezoid, a quadrilateral, a pentagon and a domino behind one word. Two more
 *  members of that family are already above under their own names: the half-triangle is one of the
 *  planigons and the half-square is the tri45 board. */
export const EDGE_BOARD_LABEL: Record<EdgeBoard, string> = {
	planigon: "Planigons",
	tri45: "45-45-90 triangles and squares",
	penrose: "Penrose kite and dart",
	"euh-hexv": "Half hexagon (long diagonal)",
	"euh-pent": "Half pentagon",
	"euh-hexm": "Half hexagon (edge midpoints)",
	"euh-sqmid": "Domino (half square)",
};

export const ISLAMIC_SYSTEM_ORDER: IslamicSystem[] = [
	"regular",
	"fourfold-a",
	"fourfold-b",
	"fivefold",
	"sevenfold",
	"nonsystematic",
	"dual-level",
];
export const ISLAMIC_SYSTEM_LABEL: Record<IslamicSystem, string> = {
	regular: "Regular",
	"fourfold-a": "Fourfold A",
	"fourfold-b": "Fourfold B",
	fivefold: "Fivefold",
	sevenfold: "Sevenfold",
	nonsystematic: "Nonsystematic",
	"dual-level": "Dual-level",
};

export const FREEDRAW_KIND_ORDER: FreedrawKind[] = ["finite", "strip", "unbounded", "holes"];
export const FREEDRAW_KIND_LABEL: Record<FreedrawKind, string> = {
	finite: "All finite",
	strip: "Has strip",
	unbounded: "Has unbounded",
	holes: "Has holes",
};

export const FREEDRAW_REGULAR_ORDER: FreedrawRegular[] = ["unit", "regular", "tri", "square", "hex"];
export const FREEDRAW_REGULAR_LABEL: Record<FreedrawRegular, string> = {
	unit: "k-uniform",
	regular: "All regular (+ dilations)",
	tri: "Has a triangle",
	square: "Has a square",
	hex: "Has a hexagon",
};

export const CERTIFICATION_ORDER: Certification[] = ["proven", "reproduced", "candidate"];
export const CERTIFICATION_LABEL: Record<Certification, string> = {
	proven: "Proven",
	reproduced: "Reproduced",
	candidate: "Candidate",
};

/** Palette sizes the colouring catalogues ship. Derived below from the subs, so a 4-colour run needs no
 *  edit here; the literal is the DISPLAY order for the sizes that exist. */
export const COLORS_COUNT_LABEL = (n: number) => `${n} colors`;

// ── The board axis: derived from SUB_ORDER, never declared ───────────────────────────────────────────

/** One board row: the sub id, its display name, and the family heading it sits under. */
export interface BoardOption {
	sub: string;
	label: string;
	family: SubFamily;
}

/** A family heading with its boards, in SUB_ORDER sequence. */
export interface BoardFamily {
	family: SubFamily;
	label: string;
	boards: BoardOption[];
}

/**
 * Every sub in SUB_ORDER that belongs to a family, grouped by family and kept in SUB_ORDER sequence.
 *
 * Grouping by a SCAN, not a re-sort, which is what keeps this list in the same order the ← / → browse
 * keys walk and the /play tree renders. It works because each family occupies one contiguous run of
 * SUB_ORDER; `tests/catalogue-sub-family.test.ts` is the guard on that.
 */
export const BOARD_FAMILIES: BoardFamily[] = (() => {
	const out: BoardFamily[] = [];
	const seen = new Set<string>();
	for (const sub of SUB_ORDER) {
		const family = familyOfSub(sub);
		if (!family) continue; // the anonymous spine the non-decoration classes share
		// A EUCLIDEAN colouring sub names two axes at once ("square-3" = the square grid, three colours),
		// and both surfaces split them: /play gives the grid its own row and the palette size another,
		// /library keeps a separate Colors facet. So the board is the STEM, and the seven combined subs
		// collapse to four boards. `boardOf` performs the same collapse on the record side.
		// Keyed by FAMILY too: "square" is a board in the edge-pattern family AND the stem of the colouring
		// family, and a global set would let whichever came first in SUB_ORDER swallow the other.
		const stem = COLOR_SUB.exec(sub)?.[1] ?? sub;
		if (seen.has(`${family}:${stem}`)) continue;
		seen.add(`${family}:${stem}`);
		const last = out[out.length - 1];
		// The SHORT name: these rows always render under their family heading, so repeating the family word
		// in the chip only costs a line wrap.
		const row: BoardOption = { sub: stem, label: shortSubLabel(stem), family };
		if (last && last.family === family) last.boards.push(row);
		else out.push({ family, label: FAMILY_LABEL[family] ?? family, boards: [row] });
	}
	return out;
})();

const FAMILY_INDEX = new Map<SubFamily, BoardFamily>(BOARD_FAMILIES.map((f) => [f.family, f]));

/**
 * The board families a given (geometry, decoration) segment can show, in display order.
 *
 * ⚑ TILINGS HAVE BOARDS TOO, and leaving that cell empty was itself a gap this file was written to close.
 * The 3.4.n.4 shelves are k-uniform tilings by regular polygons, not edge systems and not colourings, so
 * `decorationOf` files them under "tilings" — but they are still one corpus per board (hpo-7 … hpo-23,
 * spp-3 … spp-5) and /play groups them that way. Before this, /library offered no board axis on the
 * tilings segment at all, so those boards were as unreachable as the parametric ones were.
 * `tests/catalogue-one-taxonomy.test.ts` asserts every family lands in some segment, which is what caught it.
 */
export function boardFamiliesFor(
	geometry: "euclidean" | "hyperbolic" | "spherical",
	decoration: "tilings" | "edges" | "colorings",
): BoardFamily[] {
	const BY_SEGMENT: Record<typeof decoration, Record<typeof geometry, SubFamily[]>> = {
		// Two hyperbolic tiling families, both one corpus per board: 3.4.n.4 and {3,n}.
		tilings: {
			euclidean: [],
			hyperbolic: ["hyp-poly", "hyp-poly-t", "hyp-half"],
			spherical: ["sph-poly", "sph-half"],
		},
		edges: {
			euclidean: ["grid", "schwarz-eu", "pent", "ih"],
			hyperbolic: ["hyp-edges", "schwarz-board"],
			spherical: ["platonic", "sph-edges", "schwarz-board"],
		},
		colorings: {
			euclidean: ["grid-colors"],
			hyperbolic: ["hyp-colors"],
			spherical: ["sph-colors"],
		},
	};
	return BY_SEGMENT[decoration][geometry]
		.map((f) => FAMILY_INDEX.get(f))
		.filter((f): f is BoardFamily => f !== undefined);
}

/** Every board sub, for URL validation. */
export const BOARD_VALUES: string[] = BOARD_FAMILIES.flatMap((f) => f.boards.map((b) => b.sub));

/** One-word board names for the collapsed FilterGroup summary. Falls back to the full label. */
export function boardSummary(sub: string): string {
	return SUB_LABEL[sub] ?? sub;
}

/**
 * Palette sizes present in the colouring subs ("square-3" → 3), ascending and deduplicated.
 *
 * Read off the subs so a new palette size arrives with its catalogue instead of needing a second edit
 * here, which is the same reason the board rows are derived.
 */
export const COLORS_COUNT_ORDER: number[] = [
	...new Set(
		SUB_ORDER.flatMap((s) => {
			const m = /^(?:square|triangle|hex|ts)-(\d+)$/.exec(s);
			return m ? [Number(m[1])] : [];
		}),
	),
].sort((a, b) => a - b);

/** The colouring grids that actually ship, read off the subs for the same reason. */
export const COLORS_GRID_ORDER: ColorsGrid[] = [
	...new Set(
		SUB_ORDER.flatMap((s) => {
			const m = /^(square|triangle|hex|ts)-\d+$/.exec(s);
			return m ? [m[1] as ColorsGrid] : [];
		}),
	),
];
