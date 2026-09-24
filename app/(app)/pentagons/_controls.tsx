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
				{/* Inside the panel gutter, on the shared segmented track like every other choice. */}
				<div className="bg-surface-chrome shrink-0 px-3.5 py-3">{types}</div>
				<div className="ta-scroll-fade flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide bg-surface-chrome">
					<div className="px-3.5 pt-3 pb-8 flex flex-col gap-4">{children}</div>
				</div>
			</div>
		</PageSidebar>
	);
}
