"use client";

// The /isohedral sidebar shell. The control primitives it used to carry now live in
// components/shelf/, shared with /aperiodic and /pentagons; this file keeps only the shell, because
// the three shelves genuinely differ in how their panels are split.
//
// This page has TWO scrolling regions, not one: the 93-entry type grid and the selected type's
// controls. A single scroll pane would put the parameter sliders below ninety-three chips, so choosing
// a type would scroll the thing you came to adjust off the bottom of the panel.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PageSidebar } from "@/components/page-sidebar";

export { Section, Details, Segmented, type SegmentedOption } from "@/components/shelf";

const SHADOW = "pointer-events-none absolute inset-x-0 h-2 from-black/10 dark:from-black/50 to-transparent";

export function IsohedralSidebar({
	header,
	filters,
	typeCount,
	totalCount,
	types,
	children,
	collapsed = false,
	peek,
}: {
	/** The current type's identity line. */
	header: ReactNode;
	/** Pinned above the type grid, so narrowing the list never scrolls the filters away. */
	filters: ReactNode;
	/** How many types the filters let through, shown beside the grid's label. */
	typeCount: number;
	/** The unfiltered total, so a narrowed grid reads "12 of 93". */
	totalCount: number;
	/** The 93-entry grid. Capped and scrolled on its own (on a desktop). */
	types: ReactNode;
	/** Parameters, edge curvature, view, details. */
	children: ReactNode;
	/** Immersive mode: slide the whole panel shut and give the canvas the window. */
	collapsed?: boolean;
	/** The phone dock sheet's peek row (the current type, and stepping through the grid). */
	peek?: ReactNode;
}) {
	// Which edges of the type box have rows past them. Remeasured on scroll and whenever a filter
	// changes how many rows there are.
	const boxRef = useRef<HTMLDivElement>(null);
	const [more, setMore] = useState({ up: false, down: false });
	const measure = useCallback(() => {
		const t = boxRef.current;
		if (t) setMore({ up: t.scrollTop > 1, down: t.scrollTop + t.clientHeight < t.scrollHeight - 1 });
	}, []);
	useEffect(measure, [measure, typeCount]);

	return (
		<PageSidebar scrollable={false} collapsed={collapsed} mobile="dock" title="Isohedral" peek={peek}>
			{/* One 14px gutter for every region; a full-bleed hairline and 16px between them. On a phone
			    the four regions scroll as one column: pinned, they would fill a half-height sheet before
			    the controls got a row. The type grid flows in that column too, uncapped: a box scrolling
			    inside the scrolling sheet traps a flick and clips its chips. */}
			<div className="h-full flex flex-col bg-surface-chrome divide-y divide-line-subtle max-md:overflow-y-auto max-md:overflow-x-hidden max-md:overscroll-contain">
				{/* The phone's peek row carries the identity line, so the sheet does not repeat it. */}
				<div className="shrink-0 px-3.5 py-4 max-md:hidden">{header}</div>
				<div className="shrink-0 px-3.5 py-4">{filters}</div>
				<div className="shrink-0 px-3.5 py-4 flex flex-col gap-2">
					<div className="flex items-baseline justify-between">
						<span className="ta-label">Type</span>
						<span className="font-mono text-[11px] tabular-nums text-fg-muted max-md:text-xs">
							{typeCount === totalCount ? `${totalCount} types` : `${typeCount} of ${totalCount}`}
						</span>
					</div>
					{/* Capped, not proportional: a proportional split would shrink the controls to nothing on a
					    short window. The cap is snapped to whole rows: four rows of chips at the Segmented pitch
					    (35.5px chip + 2px gap) plus the track's 3px inset, 153px, so the box never ends halfway
					    through a row. Four, not six: at a 900px window six pushed the sliders off the bottom. Overlay scrollbars draw nothing at rest, so an 8px inner shadow marks
					    whichever edge has more rows past it. The negative margin parks a classic scrollbar in
					    the gutter, so the grid lines up with the filters either way. */}
					<div className="relative">
						<div
							className="-mr-2.5 pr-2.5 max-h-[153px] overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line-strong max-md:max-h-none max-md:overflow-visible"
							ref={boxRef}
							onScroll={measure}
						>
							{types}
						</div>
						{more.up ? <div className={`${SHADOW} top-0 rounded-t-surface bg-gradient-to-b`} /> : null}
						{more.down ? <div className={`${SHADOW} bottom-0 rounded-b-surface bg-gradient-to-t`} /> : null}
					</div>
				</div>
				<div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide ta-scroll-fade max-md:flex-none max-md:overflow-visible">
					<div className="pb-10 divide-y divide-line-subtle [&>*]:px-3.5 [&>*]:py-4">{children}</div>
				</div>
			</div>
		</PageSidebar>
	);
}
