// Preview geometry for the shelf ids in lib/updates/preview-ids.ts.
//
// Every other preview is a lookup: the entry names an atlas id, and both consumers (the /updates
// page at build time, scripts/gen-updates-data.ts for the modal) pull its renderCell out of a
// reference shard. The isohedral and pentagon shelves have no shard. Their tilings are solved from a
// type number and a parameter vector when the page opens, so a release announcing them had nothing
// to point at and degraded to a text chip.
//
// So the id is a recipe rather than a key, and this builds it with the same code the pages draw
// with: lib/pentagon/build.ts and lib/isohedral/build.ts. Both run at BUILD time only — the page is
// force-static and the modal reads the generated JSON — so neither builder reaches the client
// bundle. Defaults throughout, so a card shows the type as its page opens on it.
import {
	buildCell as buildIsohedralCell,
	curvesOf,
	defaultEdgeStates,
	straightCurves,
	type EdgeCurves,
} from "@/lib/isohedral/build";
import { isohedralType } from "@/lib/isohedral/catalogue";
import { buildCell as buildPentagonCell } from "@/lib/pentagon/build";
import { parseShelfPreviewId } from "@/lib/updates/preview-ids";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

/** Edge amplitude for an isohedral card, on the same [-0.5, 0.5] track the page's slider runs. */
const PREVIEW_BULGE = 0.25;

/** The cell, or `null` when the curves fold the prototile over itself. */
function buildValid(ih: number, params: number[], curves: EdgeCurves) {
	const cell = buildIsohedralCell({ ih, params, curves });
	return cell && !cell.degenerate ? cell : null;
}

/**
 * The translational cell for a shelf preview id, or `null` for anything else — an atlas id, a type
 * that does not exist, one of the twelve isohedral types with no boundary geometry, or a pentagon
 * type whose unit has not been derived.
 *
 * `periods` is not passed: it only sets each builder's home framing, and the preview card supplies
 * its own through `homePeriods`.
 */
export function shelfPreviewCell(id: string): TranslationalCellData | null {
	const shelf = parseShelfPreviewId(id);
	if (!shelf) return null;

	if (shelf.kind === "pentagon") {
		const built = buildPentagonCell({ id: shelf.n });
		if (!built.ok) return null;
		return { cellPolygons: built.cell.polygons, basis: [built.cell.v1, built.cell.v2] };
	}

	const info = isohedralType(shelf.n);
	if (!info || !info.available) return null;
	// Every edge bowed by the same fixed amount off its canonical template, which is what the page's
	// edge sliders do and the whole reason the type is a type: it fixes how tiles meet and leaves the
	// boundary free. At amplitude 0 the quadrilateral types are graph paper and say nothing. The
	// figure is deterministic (no PRNG), and an amplitude that folds a prototile over itself falls
	// back to straight edges instead of dropping the card.
	const bowed = defaultEdgeStates(info.edgeShapes).map((s) => ({
		...s,
		amount: s.base ? PREVIEW_BULGE : 0,
	}));
	const cell =
		buildValid(shelf.n, info.defaultParams, curvesOf(bowed)) ??
		buildValid(shelf.n, info.defaultParams, straightCurves(info.edgeShapes));
	if (!cell) return null;
	return { cellPolygons: cell.polygons, basis: [cell.v1, cell.v2] };
}
