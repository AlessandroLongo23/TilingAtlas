import { evaluateParamCell, type ParametricCellData } from "@/lib/utils/paramCell";
import { useConfiguration } from "@/stores/configuration";
import type { TranslationalCellData } from "@/classes/algorithm/types";

/**
 * Evaluate a parametric family at an angle tuple, dropping the per-tile size hue when the viewer has
 * asked for the fixed scheme. Only LENGTH families carry one (see paramCell.sizeHue), so the drop is a
 * no-op everywhere else.
 *
 * Lives here, not in the canvas that used to own it, because the image export needs the same evaluation:
 * `renderCell` on a parametric selection is the ALPHA-INDEPENDENT base cell (the canvases derive the live
 * shape per frame), so an SVG export rendering from that would come out at the family's default parameter
 * while the screen shows another. One function, so the two cannot drift. Importing it from the canvas
 * would have pulled the whole flat WebGL renderer into the app-shell bundle, since the export dialog is
 * mounted in the layout and therefore ships on every route.
 */
export function evalWithHue(
	pc: ParametricCellData,
	alphas: number | number[],
): TranslationalCellData {
	const cell = evaluateParamCell(pc, alphas);
	if (!pc.lengths || useConfiguration.getState().lengthSizeHue) return cell;
	return {
		...cell,
		cellPolygons: (cell.cellPolygons as Array<Record<string, unknown>>)?.map(({ hue: _h, ...rest }) => rest),
	};
}
