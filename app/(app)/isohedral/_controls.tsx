"use client";

// The /isohedral sidebar shell. The control primitives it used to carry now live in
// components/shelf/, shared with /aperiodic and /pentagons; this file keeps only the shell, because
// the three shelves genuinely differ in how their panels are split.
//
// This page has TWO scrolling regions, not one: the 93-entry type grid and the selected type's
// controls. A single scroll pane would put the parameter sliders below ninety-three chips, so choosing
// a type would scroll the thing you came to adjust off the bottom of the panel.

import type { ReactNode } from "react";
import { PageSidebar } from "@/components/page-sidebar";

export { Section, Details, Segmented, type SegmentedOption } from "@/components/shelf";

export function IsohedralSidebar({
	header,
	filters,
	types,
	children,
	collapsed = false,
}: {
	/** Bare wall cells: the current type's identity line. */
	header: ReactNode;
	/** Pinned above the type grid, so narrowing the list never scrolls the filters away. */
	filters: ReactNode;
	/** The 93-entry grid. Capped and scrolled on its own. */
	types: ReactNode;
	/** Parameters, edge curvature, view, details. */
	children: ReactNode;
	/** Immersive mode: slide the whole panel shut and give the canvas the window. */
	collapsed?: boolean;
}) {
	return (
		<PageSidebar scrollable={false} collapsed={collapsed}>
			<div className="ta-wall ta-wall-dense h-full flex flex-col gap-px">
				{header}
				<div className="bg-surface-chrome shrink-0 p-3 flex flex-col gap-3">{filters}</div>
				{/* Capped, not proportional: nine rows of chips is enough to browse in, and a proportional
				    split would shrink the controls to nothing on a short window. */}
				<div className="bg-surface-chrome shrink-0 max-h-64 overflow-y-auto overflow-x-hidden scrollbar-hide">
					<div className="p-3">{types}</div>
				</div>
				<div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide bg-surface-chrome">
					<div className="p-3 flex flex-col gap-3">{children}</div>
				</div>
			</div>
		</PageSidebar>
	);
}
