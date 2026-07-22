"use client";

import { ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Kbd } from "@/components/ui/kbd";
import { tileClassOf, TILE_CLASS_LABEL } from "@/lib/services/referenceAtlas";
import type { CatalogueTiling } from "@/lib/services/catalogueService";

interface NavHeaderProps {
	selected: CatalogueTiling | null;
	/** Tilings in the current geometry — prev/random/next are scoped to it, so they disable below 2. */
	count: number;
	onRandom?: () => void;
	onPrev?: () => void;
	onNext?: () => void;
}

// A cell of the sidebar wall: no border of its own (the 1px gaps between cells ARE the rules) and an
// opaque background, or the wall's line colour bleeds through the fill.
const CELL = "ta-wall-cell bg-surface-chrome transition-colors";
const NAV_CELL = cn(
	CELL,
	"flex items-center justify-center gap-2 h-9 text-xs font-medium text-fg-secondary",
	// One step of ink on hover, spelled out per theme: `surface-overlay` collapses onto `chrome` in
	// light and `surface-sunken` collapses onto it in dark, so neither token alone moves both ways.
	"hover:bg-surface-sunken dark:hover:bg-surface-overlay hover:text-fg cursor-pointer",
	"disabled:opacity-40 disabled:pointer-events-none",
	// Inset ring: an outset one would sit in the 1px gap and paint over the neighbouring cells.
	"focus:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-fg",
);

// The /play sidebar's top zone: selected-tiling metadata + prev/random/next. It sits ABOVE the
// Catalogue/Options tabs so it stays visible on both, and its nav buttons stay scoped to the geometry
// mode (the parent hands it that geometry's list and count). Returns bare rows — the parent is the
// wall (background = line colour, gap-px), and these drop straight into it.
export function NavHeader({ selected, count, onRandom, onPrev, onNext }: NavHeaderProps) {
	const navDisabled = count < 2;
	return (
		<>
			<div className={cn(CELL, "px-3 py-2.5 flex flex-col gap-1")}>
				{selected ? (
					<>
						{/* Freedraw's k counts grid-point orbits, not vertex orbits — spelled out so the shared
						    axis never reads as the same quantity. */}
						<span className="text-xs font-mono text-fg-secondary" title={`{${selected.family}}`}>
							k={selected.k}
							{selected.freedraw ? " grid pts" : null} · {TILE_CLASS_LABEL[tileClassOf(selected)].long}
						</span>
						<span className="text-[10px] font-mono text-fg-disabled truncate" title={selected.canonicalKey}>
							{selected.canonicalKey}
						</span>
					</>
				) : (
					<span className="text-xs text-fg-muted">Select a tiling below.</span>
				)}
			</div>

			{/* Three joined cells, edge to edge: the hairlines between them are the only separation. */}
			<div className="grid grid-cols-[2.25rem_1fr_2.25rem] gap-px">
				<button
					type="button"
					className={NAV_CELL}
					onClick={onPrev}
					disabled={!onPrev || navDisabled}
					title="Previous tiling (←)"
					aria-label="Previous tiling"
				>
					<ChevronLeft size={15} />
				</button>
				<button
					type="button"
					className={NAV_CELL}
					onClick={onRandom}
					disabled={!onRandom || navDisabled}
					title="Pick a random tiling (R)"
				>
					<Shuffle size={14} />
					Random tiling
					<Kbd>R</Kbd>
				</button>
				<button
					type="button"
					className={NAV_CELL}
					onClick={onNext}
					disabled={!onNext || navDisabled}
					title="Next tiling (→)"
					aria-label="Next tiling"
				>
					<ChevronRight size={15} />
				</button>
			</div>
		</>
	);
}
