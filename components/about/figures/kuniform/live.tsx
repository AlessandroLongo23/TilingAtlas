"use client";

// Figures for shelves whose tilings are not plain atlas cells, so the server-side card tag cannot
// ship them: each fetches its few records from /public once.
//
//   <ku-tegula ids="tegula-…,tegula-…" labels="…,…" caption="…">  topological types, with a slider
//        that bends every edge by its class's own symmetric curve (the /play cell editor's shapes).
//        Drawn as SVG: the live card uploads its mesh once, and a slider makes a new cell per step;
//   <ku-hollow …>  hollow tilings, below;
//   <ku-bubble ids="tri-k1:bt-1-00001,…" labels="…,…" caption="…">  bubble tilings, one per board.

import { useEffect, useMemo, useState } from "react";
import { Segmented } from "@/components/shelf";
import { Slider } from "@/components/ui/slider";
import { Figure, FigureLoading, OUTLINE, Stage, svgPoints, tileFill } from "@/components/about/figure";
import { InteractiveTilingPreviewCard } from "@/components/interactive-tiling-preview-card";
import { fetchAtlas } from "@/lib/services/atlasCodec";
import { bendTegula, clampHandle, type TegulaCell } from "@/lib/tilings/tegula";
import { bubbleRenderCell, type BubblePattern } from "@/lib/bubble/pattern";
import { HollowCanvas } from "@/components/hollow/hollow-canvas";
import { DEFAULT_HOLLOW_STYLE, type HollowStyle } from "@/lib/hollow/render";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

const list = (s?: string) =>
	(s ?? "")
		.split(",")
		.map((x) => x.trim())
		.filter(Boolean);

/** Module-level, so a figure that remounts (or a second one on the page) does not fetch again. */
const loads = new Map<string, Promise<unknown>>();
function once<T>(url: string, load: () => Promise<T>): Promise<T> {
	if (!loads.has(url))
		loads.set(
			url,
			load().catch(() => null),
		);
	return loads.get(url) as Promise<T>;
}

/** The live card. Keyed by the caller per tiling: it builds its mesh once, on mount. */
function LiveCard({ id, cell }: { id: string; cell: TranslationalCellData }) {
	return (
		<InteractiveTilingPreviewCard
			key={id}
			cell={cell}
			tilingId={id}
			square
			showExpand={false}
			homePeriods={3}
			className="aspect-[16/9]! max-md:aspect-square!"
		/>
	);
}

function Picker({
	ids,
	labels,
	value,
	onChange,
}: {
	ids: string[];
	labels: string[];
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<Segmented
			options={ids.map((v, i) => ({ v, label: labels[i] ?? v }))}
			value={value}
			onChange={onChange}
			cols={Math.min(ids.length, 4)}
		/>
	);
}

type TegulaRecord = { id: string; tegula: TegulaCell; family: string };

/** A patch of translates of one cell, framed on the middle so its ragged rim stays outside the box. */
function CellPatch({ cell }: { cell: TranslationalCellData }) {
	const { tiles, frame } = useMemo(() => {
		const [[ax, ay], [bx, by]] = cell.basis ?? [
			[1, 0],
			[0, 1],
		];
		const tiles: { n: number; hue: number; vertices: { x: number; y: number }[] }[] = [];
		for (let i = -3; i <= 3; i++)
			for (let j = -3; j <= 3; j++)
				for (const p of cell.cellPolygons ?? []) {
					if (p.mark) continue;
					const vs = (p.vertices ?? p.v ?? []) as number[][];
					tiles.push({
						n: p.n ?? vs.length,
						hue: p.hue ?? 0,
						vertices: vs.map(([x, y]) => ({
							x: Math.round((x + i * ax + j * bx) * 1e4) / 1e4,
							y: Math.round((y + i * ay + j * by) * 1e4) / 1e4,
						})),
					});
				}
		// The frame: the translates within one period of the origin, a 16:9-ish window on the patch.
		const r = 1.2 * Math.max(Math.hypot(ax, ay), Math.hypot(bx, by));
		const frame = [
			{
				vertices: [
					{ x: -1.6 * r, y: -0.9 * r },
					{ x: 1.6 * r, y: 0.9 * r },
				],
			},
		];
		return { tiles, frame };
	}, [cell]);
	return (
		<div className="border border-line">
			<Stage fit={frame} className="max-h-[360px]">
				{tiles.map((p, i) => (
					<polygon key={i} points={svgPoints(p)} fill={tileFill(p)} {...OUTLINE} />
				))}
			</Stage>
		</div>
	);
}

export function KuTegula({ ids, labels, caption }: { ids?: string; labels?: string; caption?: string }) {
	const wanted = useMemo(() => list(ids), [ids]);
	const [records, setRecords] = useState<Record<string, TegulaRecord>>({});
	const [pick, setPick] = useState(wanted[0] ?? "");
	const [bend, setBend] = useState(1);
	useEffect(() => {
		let live = true;
		once("/reference-atlas-tegula.json", () => fetchAtlas<TegulaRecord>("/reference-atlas-tegula.json")).then((all) => {
			if (live && all) setRecords(Object.fromEntries(all.filter((r) => wanted.includes(r.id)).map((r) => [r.id, r])));
		});
		return () => {
			live = false;
		};
	}, [wanted]);
	const rec = records[pick];
	const cell = useMemo(() => {
		if (!rec) return null;
		const t = rec.tegula;
		// Scale every class's default handle height; the clamp keeps each inside what its symmetry allows.
		return bendTegula(
			t,
			t.shape.map(([x, y], c) => clampHandle(t.kinds[c], x, y * bend)),
		);
	}, [rec, bend]);
	return (
		<Figure caption={caption}>
			{cell ? <CellPatch cell={cell} /> : <FigureLoading what="tiling" />}
			<div className="mx-auto mt-3 flex max-w-md flex-col gap-3">
				<Slider
					label="Edge bend"
					min={0}
					max={2}
					step={0.05}
					value={bend}
					onChange={setBend}
					format={(v) => (v === 0 ? "straight" : `${v.toFixed(2)}×`)}
				/>
				<Picker ids={wanted} labels={list(labels)} value={pick} onChange={setPick} />
			</div>
		</Figure>
	);
}

export function KuBubble({ ids, labels, caption }: { ids?: string; labels?: string; caption?: string }) {
	const wanted = useMemo(() => list(ids), [ids]);
	const [cells, setCells] = useState<Record<string, TranslationalCellData>>({});
	const [pick, setPick] = useState(wanted[0] ?? "");
	useEffect(() => {
		let live = true;
		Promise.all(
			wanted.map(async (key) => {
				const [file, id] = key.split(":");
				const url = `/bubble/${file}.json`;
				const all = await once(url, () => fetch(url).then((r) => r.json() as Promise<BubblePattern[]>));
				const p = all?.find((q) => q.id === id);
				return [key, p ? bubbleRenderCell(p) : null] as const;
			}),
		).then((pairs) => {
			if (live) setCells(Object.fromEntries(pairs.filter(([, c]) => c)) as Record<string, TranslationalCellData>);
		});
		return () => {
			live = false;
		};
	}, [wanted]);
	const cell = cells[pick];
	return (
		<Figure caption={caption}>
			{cell ? <LiveCard id={pick.split(":")[1]} cell={cell} /> : <FigureLoading what="tiling" />}
			<div className="mx-auto mt-3 max-w-md">
				<Picker ids={wanted} labels={list(labels)} value={pick} onChange={setPick} />
			</div>
		</Figure>
	);
}

// <ku-hollow ids="hollow-…,…" labels="…" caption="…">  uniform tilings with hollow tiles. Their faces
// overlap, so they have no cell for the live card; this is the shelf's own canvas, held still (a
// canvas that pans would take the page's scroll), with its fill modes as the control.
const HOLLOW_FILLS: Record<string, Omit<HollowStyle, "dark">> = {
	tile: { ...DEFAULT_HOLLOW_STYLE, fillMode: "tile" },
	density: { ...DEFAULT_HOLLOW_STYLE, fillMode: "density" },
	mod2: { ...DEFAULT_HOLLOW_STYLE, fillMode: "tile", mod2: true },
};

export function KuHollow({ ids, labels, caption }: { ids?: string; labels?: string; caption?: string }) {
	const wanted = useMemo(() => list(ids), [ids]);
	const [pick, setPick] = useState(wanted[0] ?? "");
	const [fill, setFill] = useState("tile");
	return (
		<Figure caption={caption}>
			<div className="aspect-[16/9] w-full border border-line max-md:aspect-square">
				<HollowCanvas patchId={pick} style={HOLLOW_FILLS[fill]} interactive={false} />
			</div>
			<div className="mx-auto mt-3 flex max-w-md flex-col gap-2">
				<Segmented
					options={[
						{ v: "tile", label: "By tile" },
						{ v: "density", label: "By density" },
						{ v: "mod2", label: "Even-odd" },
					]}
					value={fill}
					onChange={setFill}
					cols={3}
				/>
				<Picker ids={wanted} labels={list(labels)} value={pick} onChange={setPick} />
			</div>
		</Figure>
	);
}
