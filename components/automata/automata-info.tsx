"use client";

// The sidebar's top zone: what is selected, and what it is doing.
//
// The identity + prev/random/next half IS /play's — the shared NavHeader, not a copy of it, so a tiling
// reads the same here as it does there. This module only adds the row underneath: a live readout of the
// run. It sits ABOVE the tabs so you can watch the population while editing the rule instead of instead
// of it.
//
// Returns bare rows. The parent is the wall (background = line colour, gap-px) and these drop into it.

import { NavHeader } from "@/components/sidebar/nav-header";
import type { BoardPlan } from "@/lib/automata/board";
import { UNIFORM_BY_ID } from "@/lib/automata/uniformTilings";
import type { EngineReport } from "@/lib/automata/useAutomatonEngine";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { topologyDef } from "@/lib/automata/topology";
import { cn } from "@/lib/utils/cn";

const CELL = "ta-wall-cell bg-surface-chrome transition-colors";

interface AutomataInfoProps {
	selected: CatalogueTiling | null;
	count: number;
	report: EngineReport;
	/** The board as planned: which surface, and how wide it really came out. */
	plan: BoardPlan | null;
	onRandom?: () => void;
	onPrev?: () => void;
	onNext?: () => void;
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
	return (
		<div className="flex items-baseline justify-between gap-2" title={title}>
			<dt className="text-[10px] uppercase tracking-wider text-fg-muted">{label}</dt>
			<dd className="font-mono text-[11px] text-fg-secondary tabular-nums">{value}</dd>
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

export function AutomataInfo({ selected, count, report, plan, onRandom, onPrev, onNext }: AutomataInfoProps) {
	const def = topologyDef(plan?.topology ?? "plane");
	const boardW = plan ? widthLabel(plan.domainW) : "—";
	const boardH = plan?.domainH ?? 0;

	const degrees = [...new Set(report.degrees)].sort((a, b) => a - b);
	const extinct = report.population === 0 && report.generation > 0;
	// The eleven uniform tilings under their usual names. NavHeader shows the atlas's compressed family
	// ("4" for the square grid) in a tooltip, which is the wrong level of detail on a page where the
	// vertex configuration is what decides every tile's neighbour count.
	const named = selected ? UNIFORM_BY_ID.get(selected.canonicalKey) : undefined;

	return (
		<>
			<NavHeader selected={selected} count={count} onRandom={onRandom} onPrev={onPrev} onNext={onNext} />

			<div className={cn(CELL, "px-3 py-2.5 space-y-2")}>
				{named && (
					<div className="flex items-baseline gap-2">
						<span className="font-mono text-[11px] text-fg-secondary">{named.config}</span>
						<span className="text-[10px] text-fg-muted">{named.name}</span>
					</div>
				)}
				<dl className="grid grid-cols-2 gap-x-4 gap-y-1">
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
					<p className="text-[10px] leading-relaxed text-fg-muted">
						Extinct. Try a new soup, or a rule that births on fewer neighbours.
					</p>
				)}
			</div>
		</>
	);
}
