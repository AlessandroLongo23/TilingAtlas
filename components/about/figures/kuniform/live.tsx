"use client";

// Figures for shelves whose tilings are not plain atlas cells, so the server-side card tag cannot
// ship them: each fetches its few records from /public once.
//
//   <ku-tegula ids="tegula-…,tegula-…" labels="…,…" caption="…">  topological types, with a slider
//        that bends every edge by its class's own symmetric curve (the /play cell editor's shapes);
//   <ku-hollow …>  hollow tilings, below;
//   <ku-bubble ids="tri-k1:bt-1-00001,…" labels="…,…" caption="…">  bubble tilings, one per board.

import { useEffect, useMemo, useState } from "react";
import { Segmented } from "@/components/shelf";
import { Slider } from "@/components/ui/slider";
import { Figure, FigureLoading, LiveFigure } from "@/components/about/figure";
import { InteractiveTilingPreviewCard } from "@/components/interactive-tiling-preview-card";
import { fetchAtlas, shardBody } from "@/lib/services/atlasCodec";
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

/** The live card. A new tiling gets a fresh view; a new shape of the same one (`keepView`) keeps it. */
function LiveCard({ id, cell, keepView }: { id: string; cell: TranslationalCellData; keepView?: boolean }) {
	return (
		<InteractiveTilingPreviewCard
			key={id}
			keepView={keepView}
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

export function KuTegula({ ids, labels, caption }: { ids?: string; labels?: string; caption?: string }) {
	const wanted = useMemo(() => list(ids), [ids]);
	const [records, setRecords] = useState<Record<string, TegulaRecord>>({});
	const [pick, setPick] = useState(wanted[0] ?? "");
	const [bend, setBend] = useState(1);
	useEffect(() => {
		let live = true;
		once("/reference-atlas-tegula.json.gz", () => fetchAtlas<TegulaRecord>("/reference-atlas-tegula.json.gz")).then((all) => {
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
			{cell ? <LiveCard id={pick} cell={cell} keepView /> : <FigureLoading what="tiling" />}
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
				const url = `/bubble/${file}.json.gz`;
				const all = await once(url, () => fetch(url).then((r) => shardBody(r) as Promise<BubblePattern[]>));
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
// overlap, so they have no cell for the live card; this is the shelf's own canvas, with its fill modes
// as the control. It pans and zooms only once clicked, so it never takes the page's scroll.
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
			<LiveFigure label="Hollow tiling" className="aspect-[16/9] w-full border border-line max-md:aspect-square">
				{({ interactive }) => <HollowCanvas patchId={pick} style={HOLLOW_FILLS[fill]} interactive={interactive} />}
			</LiveFigure>
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
