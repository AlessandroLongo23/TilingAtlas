"use client";

// The colorings article's figure, drawn from the /colors catalogue itself:
//   <hcp-colorings grids="square" colors="2" ks="1,2,3" caption>
// a row of colorings of one grid at one k, a Segmented for k (and for the grid when several are
// named), and a switch that marks the colored vertex classes. SVG, in the figure kit's look; the
// fills are the /colors palette (cellFill), so a coloring reads the same here and in the explorer.

import { useEffect, useId, useMemo, useState } from "react";
import { Segmented } from "@/components/shelf";
import { Figure, FigureLoading } from "@/components/about/figure";
import { coset } from "@/lib/freedraw/pattern";
import { colorsCatalogueFile, colorsGridOf, type ColorPattern, type ColorsGrid } from "@/lib/colors/pattern";
import { cellFill, paletteFor } from "@/lib/colors/render";
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

type XY = [number, number];
const R3 = Math.sqrt(3) / 2;
/** Half the window's side, in edge lengths. */
const HALF = 3;

/** The coloring's cells and grid points inside a square window about the origin. */
function draw(p: ColorPattern): { cells: { pts: XY[]; color: number }[]; dots: { at: XY; orbit: number }[] } {
	const cells: { pts: XY[]; color: number }[] = [];
	const dots: { at: XY; orbit: number }[] = [];
	const near = ([x, y]: XY, pad: number) => Math.abs(x) <= HALF + pad && Math.abs(y) <= HALF + pad;
	if (p.patch) {
		const { T1, T2, verts, vorbit, polys, polyColor } = p.patch;
		const at = (vi: number, m: number, n: number): XY => [
			verts[vi][0] + m * T1[0] + n * T2[0],
			verts[vi][1] + m * T1[1] + n * T2[1],
		];
		const det = T1[0] * T2[1] - T1[1] * T2[0];
		// Translates whose lattice coordinates can reach the window, padded by a period either way.
		const reach = Math.ceil((2 * HALF * Math.hypot(...T1, ...T2)) / Math.abs(det)) + 2;
		for (let m = -reach; m <= reach; m++)
			for (let n = -reach; n <= reach; n++) {
				polys.forEach((ring, i) => {
					const pts = ring.map(([vi, a, b]) => at(vi, a + m, b + n));
					if (pts.some((q) => near(q, 1))) cells.push({ pts, color: polyColor[i] });
				});
				verts.forEach((_, vi) => {
					const q = at(vi, m, n);
					if (near(q, 0.01)) dots.push({ at: q, orbit: vorbit[vi] });
				});
			}
		return { cells, dots };
	}
	const tri = colorsGridOf(p) === "triangle";
	const page = (x: number, y: number): XY => (tri ? [x + 0.5 * y, R3 * y] : [x, y]);
	const ny = Math.ceil(HALF / (tri ? R3 : 1)) + 1;
	for (let y = -ny; y <= ny; y++)
		for (let x = -ny - 5; x <= ny + 5; x++) {
			const c = coset(p, x, y);
			if (tri) {
				cells.push({ pts: [page(x, y), page(x + 1, y), page(x, y + 1)], color: p.cells[2 * c] });
				cells.push({ pts: [page(x + 1, y), page(x + 1, y + 1), page(x, y + 1)], color: p.cells[2 * c + 1] });
			} else cells.push({ pts: [page(x, y), page(x + 1, y), page(x + 1, y + 1), page(x, y + 1)], color: p.cells[c] });
			if (near(page(x, y), 0.01)) dots.push({ at: page(x, y), orbit: p.orbit[c] });
		}
	return { cells: cells.filter((c) => c.pts.some((q) => near(q, 1))), dots };
}

// The /colors orbit-dot hue walk (golden-angle hues), so a class has the same dot colour in both places.
const dotFill = (orbit: number) => `hsl(${((34 + (orbit + 3) * 137.508) % 360).toFixed(1)} 46% 36%)`;

function Panel({ p, marks }: { p: ColorPattern; marks: boolean }) {
	const { cells, dots } = useMemo(() => draw(p), [p]);
	const fills = paletteFor(p.colors ?? 2).map((c) => cellFill(c, false));
	const m = 0.15;
	const clip = useId();
	return (
		<div>
			<svg
				viewBox={`${-HALF - m} ${-HALF - m} ${2 * (HALF + m)} ${2 * (HALF + m)}`}
				className="block aspect-square w-full"
				role="img"
				aria-label={p.vcs.join(" ")}
			>
				<defs>
					<clipPath id={clip}>
						<rect x={-HALF} y={-HALF} width={2 * HALF} height={2 * HALF} />
					</clipPath>
				</defs>
				<g transform="scale(1,-1)" clipPath={`url(#${clip})`}>
					{cells.map((c, i) => (
						<polygon
							key={i}
							points={c.pts.map((q) => q.join(",")).join(" ")}
							fill={fills[c.color]}
							stroke="#000"
							strokeWidth={0.75}
							vectorEffect="non-scaling-stroke"
							strokeLinejoin="round"
						/>
					))}
					{marks &&
						dots.map((d, i) => (
							<circle
								key={i}
								cx={d.at[0]}
								cy={d.at[1]}
								r={0.17}
								fill={dotFill(d.orbit)}
								stroke="#fff"
								strokeWidth={1}
								vectorEffect="non-scaling-stroke"
							/>
						))}
				</g>
				<rect
					x={-HALF}
					y={-HALF}
					width={2 * HALF}
					height={2 * HALF}
					fill="none"
					stroke="#000"
					strokeWidth={1.25}
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
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
