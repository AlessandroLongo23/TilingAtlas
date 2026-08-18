/**
 * Write the two polygon facets onto records at BUILD time, so /library never walks geometry to
 * answer a facet chip.
 *
 * Why this exists. `polygonTokenCounts` and `anglePeriodOptions` (components/reference-shelf.tsx)
 * are unconditional memos over `polygonScope`, which on a default load is every Euclidean record in
 * the atlas. Both call into lib/services/polygonSpecies.ts, which reads `renderCell.cellPolygons`.
 * That was cheap while cells were plain data — 47 ms measured. Once the container format made
 * `renderCell` a lazy self-collapsing accessor, and the strip made 36,239 of them reconstruct from
 * `exactSource` through exact ℤ[ζ₂₄] arithmetic, the same memo costs **18.0 s of main thread and
 * +89.8 MB retained**. The accessor was built "for the ~25 tilings a page actually draws"; these two
 * memos defeat it for the whole corpus.
 *
 * Gating the memo is not available: `showPolygons` tests `availablePolygons.length > 1`, and
 * `availablePolygons` is derived from `polygonTokenCounts`. The memo computes its own gate.
 *
 * So the answer moves to build time. Both facets are pure functions of the render cell, and both
 * walks live in polygonSpecies.ts — this module calls those, it does not reimplement them, because a
 * second copy is how the shipped field and the runtime fallback drift into disagreeing.
 *
 * Records whose cell has no polygons get NO field. That is every decoration row, and it is
 * deliberate: the reader answers those with a shared frozen empty array, which costs nothing and
 * keeps 342k useless `[]` entries out of the shipped files.
 */

import { speciesFromPolys, periodsFromPolys, type CellPoly } from "@/lib/services/polygonSpecies";

/** The shape this needs; deliberately looser than ReferenceTiling so scripts can pass raw rows. */
type Annotatable = {
	renderCell?: { cellPolygons?: unknown[] } | undefined;
	polygonSpecies?: string[];
	tilePeriods?: number[];
};

export interface AnnotateResult {
	/** Records that came out with both fields set. */
	annotated: number;
	/** Records skipped because their cell has no polygons — decoration rows, and the empty cell. */
	empty: number;
}

/**
 * Attach `polygonSpecies` and `tilePeriods` to every record whose render cell has polygons, in place.
 *
 * Reads `renderCell` once per record, which for a stripped record fires the derive accessor — that is
 * the 24.7 s this buys back on every future page load, paid once here.
 */
export function annotatePolygonFacets<T extends Annotatable>(records: T[]): AnnotateResult {
	let annotated = 0;
	let empty = 0;
	for (const r of records) {
		const polys = (r.renderCell?.cellPolygons ?? []) as CellPoly[];
		if (!polys.length) {
			empty++;
			continue;
		}
		r.polygonSpecies = speciesFromPolys(polys);
		r.tilePeriods = periodsFromPolys(polys);
		annotated++;
	}
	return { annotated, empty };
}
