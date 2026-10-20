"use client";

// The Heesch article's figures, drawn from the /heesch census itself:
//   <hcp-corona set="omino11" shapes="0" caption>   a shape's witness patch, one corona at a time, with
//                                                    the strict / holes-allowed switch where they differ;
//   <hcp-heesch-census caption>                      the census counts per size, by Heesch number.

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/shelf";
import { Figure, FigureLoading, OUTLINE, Stage, svgPoints, tileFill } from "@/components/about/figure";
import {
	cellSeams,
	heeschNumber,
	loadHeeschIndex,
	loadHeeschSet,
	patchPolygons,
	polyformName,
	ringSizes,
	type HeeschDefinition,
	type HeeschIndex,
	type HeeschShape,
} from "@/lib/heesch/data";

const DEFS: { v: HeeschDefinition; label: string }[] = [
	{ v: "strict", label: "Strict" },
	{ v: "holes", label: "Holes allowed" },
];

export function CoronaFigure({ set = "", shapes = "0", caption }: { set?: string; shapes?: string; caption?: string }) {
	const picks = useMemo(() => shapes.split(",").map(Number), [shapes]);
	const [all, setAll] = useState<HeeschShape[] | null>(null);
	const [pick, setPick] = useState(0);
	const [def, setDef] = useState<HeeschDefinition>("strict");
	const [ring, setRing] = useState<number | null>(null);
	useEffect(() => {
		let live = true;
		loadHeeschSet(set).then((s) => live && setAll(s));
		return () => {
			live = false;
		};
	}, [set]);
	const shape = all?.[picks[pick]];
	const H = shape ? heeschNumber(shape, def) : 0;
	const k = Math.min(ring ?? H, H);
	const full = useMemo(() => (shape ? patchPolygons(shape, def, H) : []), [shape, def, H]);
	const seams = useMemo(() => (shape ? cellSeams(shape) : []), [shape]);
	if (!shape)
		return (
			<Figure caption={caption}>
				<FigureLoading what="patch" />
			</Figure>
		);
	const sizes = ringSizes(shape, def);
	const differ = shape.hc !== shape.hh;
	const label = (s: HeeschShape) => s.name ?? polyformName(s);
	return (
		<Figure caption={caption}>
			<Stage fit={full}>
				{patchPolygons(shape, def, k).map((p, i) => (
					<polygon key={i} points={svgPoints(p)} fill={tileFill(p)} {...OUTLINE} />
				))}
				<path
					d={Array.from({ length: seams.length / 4 }, (_, i) => {
						const [a, b, c, e] = seams.slice(4 * i, 4 * i + 4);
						return `M${a},${b}L${c},${e}`;
					}).join("")}
					stroke="#000"
					strokeOpacity={0.35}
					strokeWidth={0.75}
					vectorEffect="non-scaling-stroke"
				/>
			</Stage>
			<div className="mx-auto mt-3 grid max-w-md gap-2">
				{picks.length > 1 && (
					<Segmented
						options={picks.map((i, j) => ({
							v: String(j),
							label: !all?.[i]
								? "…"
								: new Set(picks.map((q) => all[q] && label(all[q]))).size < picks.length
									? `Shape ${j + 1}`
									: label(all[i]),
							sub: all?.[i] ? `H = ${heeschNumber(all[i], def)}` : undefined,
						}))}
						value={String(pick)}
						onChange={(v) => {
							setPick(Number(v));
							setRing(null);
						}}
						cols={picks.length}
					/>
				)}
				{differ && (
					<Segmented
						options={DEFS.map((d) => ({ v: d.v, label: d.label, sub: `H = ${heeschNumber(shape, d.v)}` }))}
						value={def}
						onChange={(v) => {
							setDef(v as HeeschDefinition);
							setRing(null);
						}}
					/>
				)}
			</div>
			<div className="mt-2 flex items-center justify-center gap-1">
				<Button
					variant="ghost"
					size="icon"
					icon={ChevronLeft}
					aria-label="Fewer coronas"
					onClick={() => setRing(Math.max(0, k - 1))}
				/>
				<Button
					variant="ghost"
					size="icon"
					icon={ChevronRight}
					aria-label="More coronas"
					onClick={() => setRing(Math.min(H, k + 1))}
				/>
				<span className="ml-2 font-mono text-xs text-fg-muted tabular-nums">
					corona {k} of {H}
				</span>
			</div>
			<p className="mt-2 text-center text-xs text-fg-muted">
				{k === 0
					? `The ${label(shape)} on its own, with the seams between its cells.`
					: k < H
						? `Corona ${k}: ${sizes[k]} copies, closing a ring around everything inside it.`
						: H === 0
							? "No ring of copies closes around this shape."
							: `Corona ${k}: ${sizes[k]} copies. No patch of ${H} corona${H === 1 ? "" : "s"} can be surrounded again.`}
			</p>
		</Figure>
	);
}

const CELL = "border-b border-line-subtle px-2 py-0.5 text-right";

const GRIDS = [
	{ v: "omino", label: "Polyominoes" },
	{ v: "iamond", label: "Polyiamonds" },
	{ v: "hex", label: "Polyhexes" },
];

export function HeeschCensusFigure({ caption }: { caption?: string }) {
	const [index, setIndex] = useState<HeeschIndex | null>(null);
	const [grid, setGrid] = useState("omino");
	const [def, setDef] = useState<HeeschDefinition>("holes");
	useEffect(() => {
		let live = true;
		loadHeeschIndex().then((i) => live && setIndex(i));
		return () => {
			live = false;
		};
	}, []);
	const rows = useMemo(() => {
		if (!index) return [];
		// A size's counts by Heesch number. Where the size lists only the shapes with H ≥ 2 (holes
		// allowed), the strict split of the rest is not known: those shapes are counted together as "≤ 1".
		const out = index.sets
			.filter((s) => s.grid === grid && !(s.census?.slices && s.census.slices[0] < s.census.slices[1]))
			.filter((s) => !(s.census?.slices && s.count === 0))
			.map((s) => {
				const hh = s.census?.hh?.length ? s.census.hh : s.hh;
				const total = hh.reduce((a, b) => a + b, 0);
				if (def === "holes") return { cells: s.cells, total, counts: hh, merged: false };
				if (!s.census?.listedFrom) return { cells: s.cells, total, counts: s.hc, merged: false };
				const high = s.hc.slice(2);
				const low = total - high.reduce((a, b) => a + b, 0);
				return { cells: s.cells, total, counts: [low, 0, ...high], merged: true };
			});
		const first = out.findIndex((r) => r.total > 0);
		return first < 0 ? [] : out.slice(first);
	}, [index, grid, def]);
	const width = Math.max(1, ...rows.map((r) => r.counts.length));
	const fmt = (n: number | undefined) => (n ? n.toLocaleString("en-US") : "·");
	return (
		<Figure caption={caption}>
			<div className="mx-auto grid max-w-lg gap-2">
				<Segmented options={GRIDS} value={grid} onChange={setGrid} cols={3} />
				<Segmented options={DEFS} value={def} onChange={(v) => setDef(v as HeeschDefinition)} />
			</div>
			{index ? (
				// A grid of divs, not a <table>: the article styles every table full-width at prose size.
				<div className="mt-3 overflow-x-auto">
					<div
						className="mx-auto grid w-max font-mono text-[11px] tabular-nums sm:text-xs"
						style={{ gridTemplateColumns: `repeat(${width + 2}, auto)` }}
					>
						{["cells", "non-tilers", ...Array.from({ length: width }, (_, h) => `H = ${h}`)].map((t) => (
							<div key={t} className="border-b border-line px-2 py-1 text-right text-fg-muted">
								{t}
							</div>
						))}
						{rows.flatMap((r) => [
							<div key={`${r.cells}c`} className={CELL}>
								{r.cells}
							</div>,
							<div key={`${r.cells}n`} className={CELL}>
								{fmt(r.total)}
							</div>,
							...(r.merged
								? [
										<div key={`${r.cells}m`} className={`${CELL} col-span-2 text-center! text-fg-muted`}>
											≤ 1: {fmt(r.counts[0])}
										</div>,
									]
								: []),
							...Array.from({ length: width }, (_, h) =>
								r.merged && h < 2 ? null : (
									<div key={`${r.cells}-${h}`} className={CELL}>
										{fmt(r.counts[h])}
									</div>
								),
							),
						])}
					</div>
				</div>
			) : (
				<FigureLoading what="census" />
			)}
		</Figure>
	);
}
