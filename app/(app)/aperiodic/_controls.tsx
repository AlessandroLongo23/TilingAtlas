"use client";

// The /aperiodic sidebar shell. The control primitives it used to define now live in
// components/shelf/, shared with /isohedral and /pentagons; this file keeps only the shell.
//
// Two things are borrowed from /play and neither is cosmetic. The shell is `PageSidebar`, the same
// w-80 chrome column every page uses, and the layout is the "wall": the container paints the line
// colour and every child is an opaque cell, so the 1px gaps between them are the only rules in the
// panel (see globals.css `.ta-wall`, and components/sidebar/tilings-tab.tsx for the original).
//
// What that replaced: a hand-rolled column of uppercase micro-labels, rounded chips and bare
// <input type="range"> — a second visual language for controls the atlas already had components for.

import type { ReactNode } from "react";
import { PageSidebar } from "@/components/page-sidebar";

export { Section, Segmented } from "@/components/shelf";

/**
 * The sidebar shell every aperiodic view renders into: the view switcher (`header`, supplied by the
 * page so it is identical across views) pinned above this view's own scrolling controls.
 *
 * `header` is expected to be bare wall cells — it drops straight into the wall instead of nesting.
 */
export function AperiodicSidebar({ header, children }: { header: ReactNode; children: ReactNode }) {
	return (
		<PageSidebar scrollable={false}>
			<div className="ta-wall ta-wall-dense h-full flex flex-col gap-px">
				{header}
				{/* Opaque: the wall's line colour is on the ancestor, and a transparent panel would show it
				    through every gap in this panel's own padding. */}
				<div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide bg-surface-chrome">
					<div className="p-3 flex flex-col gap-3">{children}</div>
				</div>
			</div>
		</PageSidebar>
	);
}
