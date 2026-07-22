import {
	TILE_FILL_ALPHA,
	expandToViewport,
	hsbToHsla,
	parseBaseCell,
	polygonFillHue,
	type TranslationalCellData,
} from "@/lib/utils/renderTiling";

// Turns a translational cell into inline SVG, as the canvas path (renderTilingToContext) does for
// thumbnails. Used where a tiling has to exist in the server-rendered HTML with no canvas and no
// effect to wait on — the error and 404 walls, which must paint even when the app around them is
// broken. Colours come from the atlas's own hue ramp, so a patch here matches its library thumbnail.
//
// A periodic patch repeats a handful of tiles hundreds of times, so the output is one <path> per
// distinct tile shape carrying every copy of it as a subpath. Each copy costs an "M x,y" and reuses
// one shared relative outline, which is exact for a translational cell (every copy of a tile is a
// translate of the prototype) — a few hundred tiles come out as a handful of DOM nodes.

export interface TilingSvgPath {
	/** One subpath per tile: `M`, then the shape's relative outline. */
	d: string;
	fill: string;
}

export interface TilingSvg {
	viewBox: string;
	paths: TilingSvgPath[];
}

const num = (v: number) => {
	const s = v.toFixed(3).replace(/\.?0+$/, "");
	return s === "-0" || s === "" ? "0" : s;
};

/**
 * @param cell        the tiling's translational cell
 * @param edgesAcross how many tile edge-lengths span the viewBox's width — the zoom knob
 * @param aspect      viewBox width / height. Only a hint: `slice` crops whatever doesn't match the
 *                    real cell, so a wrong value wastes tiles or hides them but never leaves a gap.
 *                    Matching the cell's shape keeps the patch from generating rows nobody sees.
 */
export function tilingToSvg(
	cell: TranslationalCellData,
	edgesAcross: number,
	aspect = 1,
): TilingSvg | null {
	const base = parseBaseCell(cell);
	if (!base) return null;

	const viewW = edgesAcross * base.medianEdge;
	const viewH = viewW / aspect;
	const cx = (base.minX + base.maxX) / 2;
	const cy = (base.minY + base.maxY) / 2;
	// 0.55 not 0.5: half the viewBox, plus room for the tiles straddling its edge.
	const polys = expandToViewport(base, cx, cy, viewW * 0.55, viewH * 0.55, 300);
	if (polys.length === 0) return null;

	// Key on the outline relative to the first vertex — identical for every translate of a tile.
	const byShape = new Map<string, { index: number; rel: string }>();
	const paths: { starts: string[]; rel: string; fill: string }[] = [];

	for (const poly of polys) {
		const v0 = poly.vertices[0];
		// `l` chains from the previous point, so these are step deltas, not offsets from v0.
		// SVG's y axis points down and the atlas's world y points up, so flip here rather than
		// wrapping every tile in a transform.
		const steps: string[] = [];
		for (let i = 1; i < poly.vertices.length; i++) {
			const a = poly.vertices[i - 1];
			const b = poly.vertices[i];
			steps.push(`${num(b.x - a.x)},${num(-(b.y - a.y))}`);
		}
		const rel = `l${steps.join(" ")}z`;
		const start = `M${num(v0.x - cx)},${num(-(v0.y - cy))}`;
		const seen = byShape.get(rel);
		if (seen) paths[seen.index].starts.push(start);
		else {
			byShape.set(rel, { index: paths.length, rel });
			paths.push({
				starts: [start],
				rel,
				fill: hsbToHsla(polygonFillHue(poly.vertices), 40, 100, TILE_FILL_ALPHA),
			});
		}
	}

	return {
		viewBox: `${num(-viewW / 2)} ${num(-viewH / 2)} ${num(viewW)} ${num(viewH)}`,
		paths: paths.map((p) => ({ d: p.starts.map((s) => s + p.rel).join(""), fill: p.fill })),
	};
}
