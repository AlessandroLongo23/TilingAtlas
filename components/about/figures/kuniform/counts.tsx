"use client";

// <ku-counts set="regular|star" caption="…"> — how many tilings there are at each k, on a log scale,
// with a control that switches what the bars are split by. Click a bar for its number and its source.
//
// The numbers are the catalogue's own, counted from the shipped shelves, and for the regular polygons
// they agree with OEIS A068599 term for term as far as the shelf reaches (k ≤ 10); k = 11 to 13 are the
// published terms the shelf does not hold yet, drawn hollow. The vertex-type splits are the shelf's
// per-tiling counts of distinct vertex configurations, whose diagonal reproduces A068600.

import { useState } from "react";
import { Segmented } from "@/components/shelf";
import { Figure } from "@/components/about/figure";
import { cn } from "@/lib/utils/cn";

interface Row {
	k: number;
	/** Stacked parts, bottom first; their sum is the bar. */
	parts: number[];
	/** Who found this term, and when, or what the record's status is. */
	note: string;
	/** A published count the catalogue does not hold: drawn as an outline. */
	absent?: boolean;
}
interface View {
	label: string;
	sub?: string;
	/** One name per stacked part, for the readout. */
	parts: string[];
	rows: Row[];
}

const REGULAR_TOTALS = [11, 20, 61, 151, 332, 673, 1472, 2850, 5960, 11866, 24459, 49794, 103082];
const REGULAR_NOTES = [
	"Johannes Kepler, Harmonices Mundi (1619).",
	"Otto Krötenheerdt (1969).",
	"Darrah Chavey (1984).",
	"Brian Galebach (2002).",
	"Brian Galebach (2002).",
	"Brian Galebach (2002).",
	"Brian Galebach (2003).",
	"Brian Galebach (2020), confirmed by Marek Čtrnáct (2021).",
	"Marek Čtrnáct (2021).",
	"Marek Čtrnáct (2021).",
	"Marek Čtrnáct (2021). Not yet on the shelf.",
	"Marek Čtrnáct (2021). Not yet on the shelf.",
	"Marek Čtrnáct (2021). Not yet on the shelf.",
];
/** Tilings with k orbits by number of distinct vertex configurations m = 1, 2, …, 8. */
const BY_TYPES: Record<number, number[]> = {
	1: [11],
	2: [0, 20],
	3: [0, 22, 39],
	4: [0, 33, 85, 33],
	5: [0, 74, 149, 94, 15],
	6: [0, 100, 284, 187, 92, 10],
	7: [0, 175, 572, 426, 218, 74, 7],
	8: [0, 258, 1037, 795, 537, 203, 20],
	9: [0, 424, 1992, 1608, 1278, 570, 80, 8],
	10: [0, 663, 3772, 2979, 2745, 1468, 212, 27],
};

const regularRows = (split: boolean): Row[] =>
	REGULAR_TOTALS.map((n, i) => {
		const k = i + 1;
		const parts = split && BY_TYPES[k] ? BY_TYPES[k] : [n];
		return { k, parts, note: REGULAR_NOTES[i], absent: k > 10 };
	});

// Star polygons: "in Myers" are the records that match Joseph Myers's lists (k = 1 in 2004, k = 2 in
// 2009); everything else is a candidate, a tiling no published list has.
const STAR = [
	[23, 0],
	[43, 3],
	[0, 108],
	[0, 235],
	[0, 436],
	[0, 897],
	[0, 1728],
	[0, 3364],
	[0, 6123],
];
const ISOTOXAL = [16, 91, 523, 2897];
const MIXED = [33, 53, 185, 512];

const SETS: Record<string, Record<string, View>> = {
	regular: {
		count: { label: "Tilings", parts: ["tilings"], rows: regularRows(false) },
		types: {
			label: "By vertex types",
			sub: "m = 1 … 8",
			parts: ["1 type", "2 types", "3 types", "4 types", "5 types", "6 types", "7 types", "8 types"],
			rows: regularRows(true),
		},
	},
	star: {
		star: {
			label: "Star",
			parts: ["in Myers's lists", "candidates"],
			rows: STAR.map((parts, i) => ({
				k: i + 1,
				parts,
				note:
					i === 0
						? "All 23 are the edge-to-edge tilings of Myers (2004)."
						: i === 1
							? "43 match Myers (2009); 3 match nothing in his list."
							: "No published list to compare with: every record is a candidate.",
			})),
		},
		isotoxal: {
			label: "Isotoxal",
			parts: ["families"],
			rows: ISOTOXAL.map((n, i) => ({ k: i + 1, parts: [n], note: "Families with one or two free angles." })),
		},
		mixed: {
			label: "Mixed",
			parts: ["families and tilings"],
			rows: MIXED.map((n, i) => ({
				k: i + 1,
				parts: [n],
				note: "Star and isotoxal tiles in one tiling, with regular polygons.",
			})),
		},
	},
};

const fmt = (n: number) => n.toLocaleString("en-US");
/** Shades for stacked parts, bottom first: solid ink fading towards the line colour. */
const SHADE = [1, 0.62, 0.48, 0.38, 0.29, 0.22, 0.16, 0.11];

export function KuCounts({ set = "regular", caption }: { set?: string; caption?: string }) {
	const views = SETS[set] ?? SETS.regular;
	const [viewKey, setViewKey] = useState(Object.keys(views)[0]);
	const view = views[viewKey] ?? Object.values(views)[0];
	const [picked, setPicked] = useState<number | null>(null);
	const held = view.rows.filter((r) => !r.absent);
	const row = view.rows.find((r) => r.k === picked) ?? held[held.length - 1];
	const max = Math.max(...view.rows.map((r) => r.parts.reduce((a, b) => a + b, 0)));
	// Log scale from 1, so 11 and 103,082 share one axis and both read.
	// 86% at most: the count sits above each bar and must stay inside the box.
	const height = (n: number) => (n <= 0 ? 0 : (Math.log10(n + 1) / Math.log10(max + 1)) * 86);
	const total = row.parts.reduce((a, b) => a + b, 0);

	return (
		<Figure caption={caption}>
			<div className="flex h-56 items-end gap-1 border-b border-line sm:gap-2" role="list">
				{view.rows.map((r) => {
					const sum = r.parts.reduce((a, b) => a + b, 0);
					const h = height(sum);
					return (
						<button
							key={r.k}
							type="button"
							role="listitem"
							onClick={() => setPicked(r.k)}
							aria-label={`k = ${r.k}: ${fmt(sum)}`}
							className="group relative flex h-full min-w-0 flex-1 cursor-pointer flex-col justify-end"
						>
							<span className="mb-1 text-center font-mono text-[10px] leading-none text-fg-muted tabular-nums max-sm:hidden">
								{fmt(sum)}
							</span>
							<span
								className={cn(
									"flex w-full flex-col-reverse overflow-hidden",
									r.absent ? "border border-dashed border-fg-muted" : "",
									r.k === row.k ? "outline-2 outline-offset-2 outline-fg" : "group-hover:opacity-80",
								)}
								style={{ height: `${h}%` }}
							>
								{!r.absent &&
									r.parts.map((p, i) =>
										p > 0 ? (
											<span
												key={i}
												className="block w-full bg-fg"
												style={{ flexGrow: p, flexBasis: 0, opacity: SHADE[i] ?? 0.1 }}
											/>
										) : null,
									)}
							</span>
						</button>
					);
				})}
			</div>
			<div className="mt-1 flex gap-1 sm:gap-2">
				{view.rows.map((r) => (
					<span key={r.k} className="min-w-0 flex-1 text-center font-mono text-[10px] text-fg-muted">
						{r.k}
					</span>
				))}
			</div>
			<p className="mt-2 text-center text-xs text-fg-muted">
				<span className="font-mono text-fg-secondary">k = {row.k}</span>: {fmt(total)}
				{view.parts.length > 1 &&
					` (${row.parts
						.map((p, i) => (p > 0 ? `${fmt(p)} ${view.parts[i]}` : ""))
						.filter(Boolean)
						.join(", ")})`}
				. {row.note}
			</p>
			{Object.keys(views).length > 1 && (
				<div className="mx-auto mt-3 max-w-md">
					<Segmented
						options={Object.entries(views).map(([v, w]) => ({ v, label: w.label, sub: w.sub }))}
						value={viewKey}
						onChange={(v) => {
							setViewKey(v);
							setPicked(null);
						}}
						cols={Object.keys(views).length}
					/>
				</div>
			)}
		</Figure>
	);
}
