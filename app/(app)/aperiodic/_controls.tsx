"use client";

// Sidebar primitives for the /aperiodic views, in the /play sidebar's grammar.
//
// Two things are borrowed and neither is cosmetic. The shell is `PageSidebar` — the same w-80 chrome
// column every page uses — and the layout is the "wall": the container paints the line colour and
// every child is an opaque cell, so the 1px gaps between them are the only rules in the panel (see
// globals.css `.ta-wall`, and components/sidebar/tilings-tab.tsx for the original). Segmented choices
// use `.ta-tab`, where idle cells sit at the panel colour and the active one fills with white/black.
//
// What this replaces: a hand-rolled column of uppercase micro-labels, rounded chips and bare
// <input type="range"> — a second visual language for controls the atlas already had components for.

import type { ReactNode } from "react";
import { PageSidebar } from "@/components/page-sidebar";
import { cn } from "@/lib/utils/cn";

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

/** A labelled control group, matching the Options tab's `text-[11px] text-fg-muted` caption. */
export function Section({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-2">
			<span className="text-[11px] text-fg-muted">{label}</span>
			{children}
		</div>
	);
}

/**
 * Segmented choice as wall cells. `cols` sets the grid width so a long option set wraps to further
 * rows instead of shrinking — the symmetry pickers run to seven options.
 *
 * The wrapper repaints the wall colour because these sit INSIDE the padded panel, where the ancestor
 * wall is masked by the panel's own opaque background; without it the gaps would read as panel, not
 * as rules.
 */
export function Segmented({
	options,
	value,
	onChange,
	cols = 2,
}: {
	options: { v: string; label: ReactNode; sub?: ReactNode; disabled?: boolean }[];
	value: string;
	onChange: (v: string) => void;
	cols?: number;
}) {
	return (
		<div
			className="ta-wall ta-wall-dense grid gap-px"
			style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
		>
			{options.map((o) => {
				const active = value === o.v;
				return (
					<button
						key={o.v}
						type="button"
						disabled={o.disabled}
						aria-pressed={active}
						onClick={() => onChange(o.v)}
						className={cn(
							"ta-tab ta-wall-cell flex cursor-pointer flex-col items-center justify-center px-1 py-1.5 transition-colors",
							"focus:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-fg",
							active ? "text-fg" : "text-fg-muted hover:text-fg-secondary",
							o.disabled && "opacity-50 cursor-not-allowed pointer-events-none",
						)}
					>
						<span className="text-xs font-medium leading-tight text-center text-balance">{o.label}</span>
						{o.sub ? (
							<span
								className={cn(
									"text-[10px] leading-tight tabular-nums",
									active ? "text-fg-secondary" : "text-fg-muted",
								)}
							>
								{o.sub}
							</span>
						) : null}
					</button>
				);
			})}
			{/* Pad the last row. An empty grid area shows the container's wall colour, which reads as a
			    grey block sitting in the control, not as blank space — the symmetry pickers run to
			    seven options in a four-wide grid, so there is always one. */}
			{Array.from({ length: (cols - (options.length % cols)) % cols }, (_, i) => (
				<div key={`pad-${i}`} className="ta-wall-cell bg-surface-chrome" aria-hidden />
			))}
		</div>
	);
}
