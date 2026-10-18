"use client";

// The /pentagons sidebar shell. The control primitives live in components/shelf/, shared with
// /aperiodic and /isohedral; this file keeps only the shell.
//
// Same two-region split as /isohedral and for the same reason: the type grid is pinned above its own
// rule, and the selected type's parameters scroll separately, so choosing a type never scrolls the
// sliders you came to move off the bottom of the panel. Fifteen types need no filter row, so unlike
// /isohedral there are three regions here, not four.

import type { ReactNode } from "react";
import { PageSidebar } from "@/components/page-sidebar";

export { Section, Details, Segmented, type SegmentedOption } from "@/components/shelf";

export function PentagonSidebar({
	header,
	types,
	children,
	collapsed = false,
	peek,
}: {
	/** Bare wall cells: the current type's identity line. */
	header: ReactNode;
	/** The 15-entry grid, pinned. */
	types: ReactNode;
	/** Prototile, parameters, view, details. */
	children: ReactNode;
	/** Immersive mode: slide the whole panel shut and give the canvas the window. */
	collapsed?: boolean;
	/** The phone dock sheet's peek row (the current type, and stepping through the grid). */
	peek?: ReactNode;
}) {
	// On a phone the pinned grid and the scroll region become one scrolling column: pinned, the header
	// and the grid would take most of a half-height sheet before the first slider.
	return (
		<PageSidebar scrollable={false} collapsed={collapsed} mobile="dock" title="Pentagons" peek={peek}>
			<div className="ta-wall ta-wall-dense flex h-full flex-col gap-px max-md:overflow-x-hidden max-md:overflow-y-auto max-md:overscroll-contain">
				{header}
				{/* Inside the panel gutter, on the shared segmented track like every other choice. */}
				<div className="shrink-0 bg-surface-chrome px-3.5 py-3">{types}</div>
				<div className="ta-scroll-fade scrollbar-hide min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-surface-chrome max-md:flex-none max-md:overflow-visible">
					<div className="flex flex-col gap-4 px-3.5 pt-3 pb-8">{children}</div>
				</div>
			</div>
		</PageSidebar>
	);
}
