"use client";

// The colorings article's figure, drawn from the /colors catalogue itself:
//   <hcp-colorings grids="square" colors="2" ks="1,2,3" caption>
// a row of colorings of one grid at one k, a Segmented for k (and for the grid when several are
// named), and a switch that marks the colored vertex classes. Each coloring is the explorer's own
// canvas, so it reads, pans and zooms the same here and on /colors.

import { useEffect, useMemo, useState } from "react";
import { Segmented } from "@/components/shelf";
import { Figure, FigureLoading, LiveFigure } from "@/components/about/figure";
import { ColorsCanvas } from "@/components/colors/colors-canvas";
import { colorsCatalogueFile, colorsGridOf, type ColorPattern, type ColorsGrid } from "@/lib/colors/pattern";
import { DEFAULT_COLORS_STYLE } from "@/lib/colors/render";
import { readAtlas } from "@/lib/services/atlasCodec";

const cache = new Map<string, Promise<ColorPattern[]>>();
function loadSlice(grid: ColorsGrid, colors: number, k: number) {
	const url = colorsCatalogueFile(grid, colors, k);
	let p = cache.get(url);
	if (!p) {
		p = fetch(url)
			.then((r) => (r.ok ? readAtlas<ColorPattern>(r) : []))
			.catch(() => []);
		cache.set(url, p);
	}
	return p;
}

/** One coloring as the /colors canvas itself: live once clicked, pan, zoom and turn as on /play. */
function Panel({ p, marks }: { p: ColorPattern; marks: boolean }) {
	const style = useMemo(() => ({ ...DEFAULT_COLORS_STYLE, showVertices: marks }), [marks]);
	return (
		<div>
			<LiveFigure label={p.vcs.join(" ")} className="aspect-square w-full border border-line">
				{(live) => <ColorsCanvas pattern={p} style={style} cells={6} {...live} />}
			</LiveFigure>
			<div className="mt-1 truncate text-center font-mono text-[10px] text-fg-muted" title={p.vcs.join("  ")}>
				{p.vcs.length > 1 ? `${p.vcs[0]} +${p.vcs.length - 1}` : p.vcs[0]}
			</div>
		</div>
	);
}

const GRID_LABEL: Record<ColorsGrid, string> = {
	square: "Square",
	triangle: "Triangle",
	hex: "Hexagon",
	ts: "Squares + triangles",
};

/** On the combined grid, only colorings whose tiling mixes squares and triangles (the rest are the
 *  square and triangle catalogues again). */
const tileSizes = (vc: string) => new Set([...vc.slice(0, vc.indexOf(")")).matchAll(/[A-Z](\d+)/g)].map((m) => m[1]));
const mixed = (p: ColorPattern) =>
	colorsGridOf(p) !== "ts" ||
	p.vcs.some((vc) => {
		const s = tileSizes(vc);
		return s.has("3") && s.has("4");
	});

export function ColoringsFigure({
	grids = "square",
	colors = "2",
	ks = "1",
	show = "8",
	caption,
}: {
	grids?: string;
	colors?: string;
	ks?: string;
	show?: string;
	caption?: string;
}) {
	const gridList = grids.split(",") as ColorsGrid[];
	// One palette size per grid, in the same order, or one for all.
	const colorList = colors.split(",").map(Number);
	const kList = ks.split(",").map(Number);
	const [g, setG] = useState(0);
	const [k, setK] = useState(kList[0]);
	const [marks, setMarks] = useState("off");
	const [slice, setSlice] = useState<{ key: string; rows: ColorPattern[] } | null>(null);
	const grid = gridList[g];
	const nColors = colorList[g] ?? colorList[0];
	const key = `${grid}-${nColors}-${k}`;
	useEffect(() => {
		let live = true;
		loadSlice(grid, nColors, k).then((rows) => live && setSlice({ key, rows: rows.filter(mixed) }));
		return () => {
			live = false;
		};
	}, [grid, nColors, k, key]);
	const rows = slice?.key === key ? slice.rows : null;
	const shown = rows?.slice(0, Number(show)) ?? [];
	return (
		<Figure caption={caption}>
			{rows ? (
				<div className="flex flex-wrap justify-center gap-3">
					{shown.map((p) => (
						<div key={p.id} className="w-[calc(50%-6px)] sm:w-[calc(25%-9px)]">
							<Panel p={p} marks={marks === "on"} />
						</div>
					))}
				</div>
			) : (
				<FigureLoading what="colorings" />
			)}
			<p className="mt-2 text-center text-xs text-fg-muted">
				{rows
					? `${GRID_LABEL[grid]} grid, ${nColors} colors, k = ${k}: ${rows.length === 1 ? "the only coloring" : `${shown.length === rows.length ? "all" : `${shown.length} of`} ${rows.length.toLocaleString("en-US")} colorings`}${grid === "ts" ? " of tilings that mix the two shapes" : ""}.`
					: " "}
			</p>
			<div className="mx-auto mt-2 grid max-w-md gap-2">
				{gridList.length > 1 && (
					<Segmented
						options={gridList.map((x, i) => ({ v: String(i), label: GRID_LABEL[x] }))}
						value={String(g)}
						onChange={(v) => setG(Number(v))}
						cols={Math.min(gridList.length, 4)}
					/>
				)}
				{kList.length > 1 && (
					<Segmented
						options={kList.map((x) => ({ v: String(x), label: `k = ${x}` }))}
						value={String(k)}
						onChange={(v) => setK(Number(v))}
						cols={kList.length}
						fill={false}
					/>
				)}
				<Segmented
					options={[
						{ v: "off", label: "Colors" },
						{ v: "on", label: "Vertex classes", sub: "one dot color per class" },
					]}
					value={marks}
					onChange={setMarks}
				/>
			</div>
		</Figure>
	);
}
