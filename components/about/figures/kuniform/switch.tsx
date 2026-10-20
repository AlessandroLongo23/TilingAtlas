"use client";

// <ku-switch caption="…" orbits="on"> <tiling-card tiling="…" title="k = 1" caption="…"> … </ku-switch>
//
// One live tiling at a time out of several, picked with a segmented control. The cards are written as
// ordinary <tiling-card> children so the server ships their cells exactly as it does for any card; this
// figure only reads them back and draws the picked one. With orbits="on" the card arrives with /play's
// vertex-orbit overlay showing, and hovering a dot names its orbit.

import { Children, isValidElement, useMemo, useState, type ReactNode } from "react";
import { useAboutData } from "@/components/about/data-context";
import { Segmented } from "@/components/shelf";
import { Figure } from "@/components/about/figure";
import { InteractiveTilingPreviewCard } from "@/components/interactive-tiling-preview-card";
import { orbitsFor } from "@/lib/defense/orbitCache";
import { symmetryFor } from "@/lib/services/symmetryCache";
import type { ExactCellSource } from "@/lib/services/cellCodecService";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

type Tag = Record<string, string | undefined>;

interface Option {
	id: string;
	title: string;
	note?: string;
	cell?: TranslationalCellData;
	source?: ExactCellSource;
}

/** The options a run of <tiling-card> children names; their cells come from the article's data. */
function optionsOf(children: ReactNode, { cells, sources }: ReturnType<typeof useAboutData>): Option[] {
	return Children.toArray(children).flatMap((el) => {
		if (!isValidElement(el)) return [];
		const tag = el.props as Tag;
		if (!tag.tiling) return [];
		return [
			{
				id: tag.tiling,
				title: tag.title ?? tag.tiling,
				note: tag.caption,
				cell: cells[tag.tiling],
				source: sources[tag.tiling],
			},
		];
	});
}

const ORBITS_ON = { orbits: true } as const;

export function KuSwitch({ caption, orbits, children }: { caption?: string; orbits?: string; children?: ReactNode }) {
	const data = useAboutData();
	const options = useMemo(() => optionsOf(children, data), [children, data]);
	const [pick, setPick] = useState(options[0]?.id ?? "");
	const [hover, setHover] = useState(-1);
	const current = options.find((o) => o.id === pick) ?? options[0];
	const withOrbits = orbits === "on";
	const orbitData = current?.source ? orbitsFor(current.id, current.source) : null;
	const symmetryData = current?.source ? symmetryFor(current.id, current.source) : null;
	const cols = options.length <= 3 ? options.length : options.length === 4 ? 4 : options.length <= 6 ? 3 : 4;

	return (
		<Figure caption={caption}>
			{current?.cell ? (
				<InteractiveTilingPreviewCard
					key={current.id}
					cell={current.cell}
					tilingId={current.id}
					title={current.title}
					square
					showExpand={false}
					homePeriods={withOrbits ? 2 : 3}
					className="aspect-[16/9]! max-md:aspect-square!"
					orbitData={orbitData}
					symmetryData={symmetryData}
					onOrbitHover={withOrbits ? setHover : undefined}
					initialOverlays={withOrbits ? ORBITS_ON : undefined}
				/>
			) : (
				<div className="flex h-48 items-center justify-center text-sm text-fg-muted">
					No cell for {current?.id ?? "(none)"}.
				</div>
			)}
			<div className="mx-auto mt-3 max-w-xl">
				<Segmented
					options={options.map((o) => ({ v: o.id, label: o.title }))}
					value={current?.id ?? ""}
					onChange={(v) => {
						setPick(v);
						setHover(-1);
					}}
					cols={cols}
				/>
			</div>
			{(current?.note || withOrbits) && (
				<p className="mt-2 text-center text-xs text-fg-muted">
					{withOrbits && orbitData
						? hover >= 0
							? `Orbit ${hover + 1} of ${orbitData.k}: every dot of this colour is carried onto every other by a symmetry of the tiling.`
							: (current?.note ?? `${orbitData.k} vertex orbits. Hover a dot to pick one out.`)
						: current?.note}
				</p>
			)}
		</Figure>
	);
}
