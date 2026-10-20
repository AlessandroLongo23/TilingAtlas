"use client";

// Sidebar primitives shared by the catalogue shelves: /aperiodic, /isohedral, /pentagons, /heesch, /frames.
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
 * A labelled control group, captioned with the shared `.ta-label` (globals.css).
 *
 * `flush` is for a group whose region has no padding of its own: the group then brings the panel
 * gutter itself, caption and control alike.
 */
export function Section({ label, flush = false, children }: { label: string; flush?: boolean; children: ReactNode }) {
	return (
		<div className={cn("flex flex-col gap-2", flush && "px-3.5")}>
			<span className="ta-label">{label}</span>
			{children}
		</div>
	);
}

/**
 * Page rings fitted to a small square and filled with the text colour: a picker cell's picture of a
 * tile (/heesch) or of a frame, drawn as its tiles with no outlines so they read as one region (/frames).
 */
export function RingGlyph({ rings, size = 22 }: { rings: { x: number; y: number }[][]; size?: number }) {
	let minx = Infinity,
		miny = Infinity,
		maxx = -Infinity,
		maxy = -Infinity;
	for (const ring of rings)
		for (const v of ring) {
			minx = Math.min(minx, v.x);
			maxx = Math.max(maxx, v.x);
			miny = Math.min(miny, v.y);
			maxy = Math.max(maxy, v.y);
		}
	const k = size / Math.max(maxx - minx, maxy - miny, 1);
	const ox = (size - k * (maxx - minx)) / 2,
		oy = (size - k * (maxy - miny)) / 2;
	// y is flipped because SVG counts down and every tiling in the atlas counts up.
	return (
		<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="my-0.5">
			{rings.map((ring, i) => (
				<polygon
					key={i}
					points={ring.map((v) => `${ox + k * (v.x - minx)},${size - oy - k * (v.y - miny)}`).join(" ")}
					className="fill-current"
				/>
			))}
		</svg>
	);
}

/** The facts block a shelf sidebar ends on: a definition list, no prose. */
export function Details({ rows }: { rows: [string, ReactNode][] }) {
	return (
		<dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5 text-xs">
			{rows.map(([k, v]) => (
				<div key={k} className="contents">
					<dt className="text-fg-muted">{k}</dt>
					<dd className="font-mono text-fg tabular-nums">{v}</dd>
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
 * Segmented choice on the shared track (.ta-seg). `cols` sets the grid width so a long option set wraps
 * to further rows instead of shrinking; the isohedral type grid runs to ninety-three. A short last row
 * either stretches to the full width (`fill`, the default, right for words) or keeps the column grid
 * (`fill={false}`, right for numbers and codes, which should line up in columns).
 */
export function Segmented({
	options,
	value,
	onChange,
	cols = 2,
	fill = true,
}: {
	options: SegmentedOption[];
	value: string;
	onChange: (v: string) => void;
	cols?: number;
	fill?: boolean;
}) {
	const r = fill ? options.length % cols || cols : cols;
	const lastRow = options.length - (options.length % cols || cols);
	return (
		<div className="ta-seg grid" style={{ gridTemplateColumns: `repeat(${cols * r}, minmax(0, 1fr))` }}>
			{options.map((o, i) => {
				const active = value === o.v;
				return (
					<button
						key={o.v}
						type="button"
						disabled={o.disabled}
						aria-pressed={active}
						title={o.title}
						onClick={() => onChange(o.v)}
						style={{ gridColumn: `span ${fill && i >= lastRow ? cols : r}` }}
						className={cn(
							"ta-tab flex min-h-7 cursor-pointer flex-col items-center justify-center px-1 py-1 transition-colors",
							"focus:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-accent/50",
							active ? "text-fg" : "text-fg-muted hover:text-fg",
							o.dim && !active && "text-fg-disabled hover:text-fg-muted",
							o.disabled && "pointer-events-none cursor-not-allowed opacity-50",
						)}
					>
						<span className="text-center text-xs leading-tight font-medium text-balance">{o.label}</span>
						{o.sub ? (
							<span className="font-mono text-[11px] leading-tight text-fg-muted tabular-nums">{o.sub}</span>
						) : null}
					</button>
				);
			})}
		</div>
	);
}
