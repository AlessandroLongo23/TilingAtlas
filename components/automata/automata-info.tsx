"use client";

// The sidebar's top zone: what is selected, and what it is doing. It sits ABOVE the tabs so you can watch
// the population while editing the rule instead of instead of it.
//
// The identity is /play's NavHeader, titled by the uniform tiling's usual name where it has one: on
// this page the vertex configuration decides every tile's neighbour count, so the atlas's compressed
// family ("4" for the square grid) is the wrong title.

import type { BoardPlan } from "@/lib/automata/board";
import { UNIFORM_BY_ID } from "@/lib/automata/uniformTilings";
import type { EngineReport } from "@/lib/automata/useAutomatonEngine";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { NavHeader } from "@/components/sidebar/nav-header";
import { topologyDef } from "@/lib/automata/topology";

interface AutomataInfoProps {
	selected: CatalogueTiling | null;
	report: EngineReport;
	/** The board as planned: which surface, and how wide it really came out. */
	plan: BoardPlan | null;
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
	return (
		<div className="flex h-[22px] min-w-0 items-center justify-between gap-2" title={title}>
			<dt className="truncate text-[11px] text-fg-muted">{label}</dt>
			<dd className="font-mono text-[11px] text-fg tabular-nums">{value}</dd>
		</div>
	);
}

/**
 * Board width, which is a half-integer whenever the tiling's glide shifts by half a cell.
 *
 * Not a rounding artefact: on such a tiling the seam really does close up half a cell over, and rounding
 * it away would print a width the board does not have.
 */
function widthLabel(w: number): string {
	return Number.isInteger(w) ? String(w) : `${Math.floor(w)}½`;
}

export function AutomataInfo({ selected, report, plan }: AutomataInfoProps) {
	const def = topologyDef(plan?.topology ?? "plane");
	const boardW = plan ? widthLabel(plan.domainW) : "—";
	const boardH = plan?.domainH ?? 0;

	const degrees = [...new Set(report.degrees)].sort((a, b) => a - b);
	const extinct = report.population === 0 && report.generation > 0;
	const named = selected ? UNIFORM_BY_ID.get(selected.canonicalKey) : undefined;

	return (
		<div className="flex-shrink-0 space-y-5 p-4 pb-3">
			{/* One step up from NavHeader's default so the title outranks the catalogue rows below it. */}
			<div className="[&>div]:gap-1 [&>div>span:first-child]:text-base">
				<NavHeader selected={selected} title={named ? `${named.config} · ${named.name}` : undefined} />
			</div>

			<div>
				<span className="ta-label">Stats</span>
				<dl className="mt-1.5 grid grid-cols-2 gap-x-6 border-y border-line-subtle py-1 [&>div:nth-child(even)]:border-l [&>div:nth-child(even)]:border-line-subtle [&>div:nth-child(even)]:pl-3">
					<Stat label="Gen" value={report.generation.toLocaleString()} />
					<Stat label="Alive" value={report.population.toLocaleString()} />
					<Stat
						label="Density"
						value={`${(report.density * 100).toFixed(1)}%`}
						title="Live cells over the cells the board currently holds"
					/>
					<Stat label="Churn" value={`+${report.born} −${report.died}`} title="Born and died this generation" />
					<Stat
						label="Nbrs"
						value={degrees.length ? degrees.join("/") : "—"}
						title="Neighbours per tile in the active neighbourhood — the number a rule string is read against"
					/>
					<Stat label="Tiles/cell" value={report.slots ? String(report.slots) : "—"} />
					<Stat
						label="Board"
						value={
							def.closed
								? `${boardW}×${boardH}`
								: def.i === "open" && def.j === "open"
									? `${report.blocks} blk`
									: `${boardW}×∞`
						}
						title={
							def.closed
								? `${def.label}: period in fundamental cells${def.needsFlip ? " — held as a double cover twice this wide, so the counts above are the surface's own" : ""}`
								: `${def.label}: ${report.blocks} allocated blocks — the open direction grows with the pattern`
						}
					/>
					<Stat label="Rate" value={report.rate ? `${report.rate.toFixed(0)}/s` : "—"} />
				</dl>
				{extinct && (
					<p className="mt-1.5 text-[11px] leading-relaxed text-fg-muted">
						Extinct. Try a new soup, or a rule that births on fewer neighbours.
					</p>
				)}
			</div>
		</div>
	);
}
