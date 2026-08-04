"use client";

// Sidebar primitives shared by the catalogue shelves: /aperiodic, /isohedral and /pentagons.
//
// These began as a set in app/(app)/aperiodic/_controls.tsx and were copied once into
// app/(app)/isohedral/_controls.tsx, whose header set the rule for when to stop copying: "About sixty
// lines duplicated; if a third shelf wants them, that is the moment to promote them into components/."
// /pentagons is the third shelf, so here they are.
//
// The layout is /play's "wall": the container paints the line colour and every child is an opaque
// cell, so the 1px gaps between them are the only rules in the panel (globals.css `.ta-wall`, and
// components/sidebar/tilings-tab.tsx for the original). Segmented choices use `.ta-tab`, where idle
// cells sit at the panel colour and the active one fills with white/black.
//
// The sidebar SHELLS stay page-private on purpose. /aperiodic has one scrolling region, /isohedral and
// /pentagons have a pinned type grid above a second one, and a single component covering both would
// take more configuration than the twenty lines each shell costs.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A labelled control group, matching the Options tab's `text-[11px] text-fg-muted` caption.
 *
 * `flush` is for a group whose region has no padding of its own, so a grid of wall cells inside it
 * reaches both panel edges: the caption takes the indent the region would have given it, and the
 * control below keeps the full width.
 */
export function Section({
	label,
	flush = false,
	children,
}: {
	label: string;
	flush?: boolean;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2">
			<span className={cn("text-[11px] text-fg-muted", flush && "px-3")}>{label}</span>
			{children}
		</div>
	);
}

/** The facts block a shelf sidebar ends on: a definition list, no prose. */
export function Details({ rows }: { rows: [string, ReactNode][] }) {
	return (
		<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
			{rows.map(([k, v]) => (
				<div key={k} className="contents">
					<dt className="text-fg-muted">{k}</dt>
					<dd className="text-fg-secondary tabular-nums">{v}</dd>
				</div>
			))}
		</dl>
	);
}

export interface SegmentedOption {
	v: string;
	label: ReactNode;
	sub?: ReactNode;
	/**
	 * Dimmed but still selectable. /isohedral's twelve marked types use this: they have no geometry to
	 * draw, but "where is IH19?" is a question the page exists to answer, so clicking one must reach the
	 * explanation. A `disabled` button would swallow the click and leave the reader with a grey square
	 * and no way in.
	 */
	dim?: boolean;
	/** Genuinely unavailable: not clickable at all. */
	disabled?: boolean;
	title?: string;
}

/**
 * Segmented choice as wall cells. `cols` sets the grid width so a long option set wraps to further
 * rows instead of shrinking; the isohedral type grid runs to ninety-three.
 *
 * The wrapper repaints the wall colour because these sit INSIDE the padded panel, where the ancestor
 * wall is masked by the panel's own opaque background; without it the gaps would read as panel, not as
 * rules.
 */
export function Segmented({
	options,
	value,
	onChange,
	cols = 2,
}: {
	options: SegmentedOption[];
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
						title={o.title}
						onClick={() => onChange(o.v)}
						className={cn(
							"ta-tab ta-wall-cell flex cursor-pointer flex-col items-center justify-center px-1 py-1.5 transition-colors",
							"focus:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-fg",
							active ? "text-fg" : "text-fg-muted hover:text-fg-secondary",
							o.dim && !active && "text-fg-disabled hover:text-fg-muted",
							o.disabled && "opacity-50 cursor-not-allowed pointer-events-none",
						)}
					>
						<span className="text-xs font-medium leading-tight text-center text-balance">
							{o.label}
						</span>
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
			{/* Pad the last row. An empty grid area shows the container's wall colour, which reads as a grey
			    block sitting in the control, not as blank space. */}
			{Array.from({ length: (cols - (options.length % cols)) % cols }, (_, i) => (
				<div key={`pad-${i}`} className="ta-wall-cell bg-surface-chrome" aria-hidden />
			))}
		</div>
	);
}
