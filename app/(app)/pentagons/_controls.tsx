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
}: {
	/** Bare wall cells: the current type's identity line. */
	header: ReactNode;
	/** The 15-entry grid, pinned. */
	types: ReactNode;
	/** Prototile, parameters, view, details. */
	children: ReactNode;
	/** Immersive mode: slide the whole panel shut and give the canvas the window. */
	collapsed?: boolean;
}) {
	return (
		<PageSidebar scrollable={false} collapsed={collapsed}>
			<div className="ta-wall ta-wall-dense h-full flex flex-col gap-px">
				{header}
				{/* Unpadded: the grid is a wall of cells like the header above it, so it runs edge to edge
				    and its gaps are the panel's rules. Padding here would float it inside a chrome margin. */}
				<div className="bg-surface-chrome shrink-0">{types}</div>
				<div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide bg-surface-chrome">
					<div className="p-3 flex flex-col gap-3">{children}</div>
				</div>
			</div>
		</PageSidebar>
	);
}
