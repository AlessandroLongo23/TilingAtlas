"use client";

import { ChevronDown } from "lucide-react";
import { Fragment, useId, useState, type ReactNode } from "react";
import { OptionWall } from "@/components/ui/option-wall";
import type { Tri } from "@/lib/freedraw/filter";
import { cn } from "@/lib/utils/cn";

export type FreedrawGeometry = "planar" | "spherical";

// The freedraw filter bar, built from the library's "wall" vocabulary (globals.css .ta-wall / .ta-tab):
// every control is an opaque chrome cell on a line-coloured container, so the 1px gaps read as mortar and
// the selected cell lifts to pure white/black. Unlike the library's single vertical column, this wall runs
// full-width as a row of equal-height COLUMNS, each column a stack of filter groups — one cohesive block,
// not a scatter of free-floating cards.

// The whole bar: one line-coloured container spanning the full width. A slim strip on top — the "Filters"
// title, the count / reset (`top`), and a chevron — doubles as the collapse toggle. The columns row lives
// under it and, when collapsed, retracts upward under the strip (grid-rows 1fr→0fr + a small translate/fade)
// so the list + preview get the room back. Both freedraw arms share this, so both collapse identically.
export function WallBar({
	top,
	title = "Filters",
	children,
}: {
	top?: ReactNode;
	title?: string;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(true);
	const toggle = () => setOpen((o) => !o);
	const bodyId = useId();
	return (
		<div className="ta-wall ta-wall-dense flex w-full flex-col gap-px overflow-hidden rounded">
			<div className="ta-wall-cell bg-surface-chrome flex h-8 items-center gap-3 px-3 text-xs">
				<button
					type="button"
					onClick={toggle}
					aria-expanded={open}
					aria-controls={bodyId}
					className="cursor-pointer font-semibold uppercase tracking-[0.08em] text-fg-muted transition-colors hover:text-fg-secondary"
				>
					{title}
				</button>
				<div className="ml-auto flex items-center gap-3">{top}</div>
				<button
					type="button"
					onClick={toggle}
					aria-expanded={open}
					aria-controls={bodyId}
					aria-label={open ? "Collapse filters" : "Expand filters"}
					className="-mr-1 flex cursor-pointer items-center p-1 text-fg-muted transition-colors hover:text-fg-secondary"
				>
					<ChevronDown
						size={14}
						className={cn(
							"transition-transform duration-200 ease-out motion-reduce:transition-none",
							open ? "" : "-rotate-90",
						)}
					/>
				</button>
			</div>
			<div
				id={bodyId}
				className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
				style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
			>
				<div className="overflow-hidden">
					<div
						className={cn(
							"flex items-stretch gap-px transition duration-200 ease-out motion-reduce:transition-none",
							open ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
						)}
					>
						{children}
					</div>
				</div>
			</div>
		</div>
	);
}

// One column of the bar. Equal width (flex-1) and, because the row stretches, equal height — a trailing
// chrome cell soaks up any slack so every column ends flush at the bottom, no ragged edge.
export function WallColumn({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div className={cn("flex flex-1 flex-col gap-px", className)}>
			{children}
			<div className="ta-wall-cell bg-surface-chrome min-h-0 flex-1" />
		</div>
	);
}

// A filter group inside a column: an uppercase heading cell over its controls. No border of its own — the
// column and the bar supply the wall; this is just heading + content, ruled off by the 1px gaps.
export function WallGroup({
	title,
	note,
	children,
	className,
}: {
	title: string;
	note?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex flex-col gap-px", className)}>
			<div className="ta-wall-cell bg-surface-chrome flex items-baseline justify-between gap-3 px-2.5 py-1.5">
				<span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted whitespace-nowrap">
					{title}
				</span>
				{note ? <span className="text-[10px] leading-tight text-fg-muted whitespace-nowrap">{note}</span> : null}
			</div>
			{children}
		</div>
	);
}

// A thinner caption inside a column — names a sub-section under one heading (e.g. "polygons" below the
// regularity mode). Same chrome band as the heading, a notch quieter.
export function WallSubLabel({ children }: { children: ReactNode }) {
	return (
		<div className="ta-wall-cell bg-surface-chrome px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
			{children}
		</div>
	);
}

const GEOMETRY_OPTIONS: { value: FreedrawGeometry; label: string }[] = [
	{ value: "planar", label: "Planar" },
	{ value: "spherical", label: "Spherical" },
];

// The high-level geometry picker, rendered as the first group of either arm so the two arms share it.
export function GeometryGroup({
	value,
	onChange,
}: {
	value: FreedrawGeometry;
	onChange: (g: FreedrawGeometry) => void;
}) {
	return (
		<WallGroup title="Geometry">
			<OptionWall columns={2} options={GEOMETRY_OPTIONS} selected={value} onChange={onChange} />
		</WallGroup>
	);
}

// The three states of a per-class / per-polygon filter, in column order.
const TRI_COLS: { value: Tri; label: string }[] = [
	{ value: "require", label: "has" },
	{ value: "exclude", label: "none" },
	{ value: "any", label: "any" },
];

export interface TriRow {
	id: string;
	label: ReactNode;
	value: Tri;
	onChange: (v: Tri) => void;
}

// A has / none / any matrix: rows down (finite, strips, … or △, ▢, …), the three states across. The
// column header names the state once; each body cell is a radio in its row, the selected one lit.
export function TriMatrix({ rows }: { rows: TriRow[] }) {
	return (
		<div className="grid gap-px" style={{ gridTemplateColumns: "auto repeat(3, minmax(0, 1fr))" }}>
			<div className="ta-wall-cell bg-surface-chrome" />
			{TRI_COLS.map((c) => (
				<div
					key={c.value}
					className="ta-wall-cell bg-surface-chrome flex items-center justify-center px-1.5 py-1 text-[10px] uppercase tracking-wide text-fg-muted"
				>
					{c.label}
				</div>
			))}
			{rows.map((row) => (
				<Fragment key={row.id}>
					<div className="ta-wall-cell bg-surface-chrome flex items-center whitespace-nowrap px-2.5 py-1 text-xs text-fg-secondary">
						{row.label}
					</div>
					{TRI_COLS.map((c) => {
						const on = row.value === c.value;
						return (
							<button
								key={c.value}
								type="button"
								aria-pressed={on}
								title={`${typeof row.label === "string" ? row.label : row.id}: ${c.label}`}
								onClick={() => row.onChange(c.value)}
								className="ta-tab ta-wall-cell flex min-h-7 cursor-pointer items-center justify-center transition-colors focus:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-fg"
							>
								<span className={cn("h-1.5 w-1.5 rounded-full transition-colors", on ? "bg-fg" : "bg-fg-disabled")} />
							</button>
						);
					})}
				</Fragment>
			))}
		</div>
	);
}

// A standalone on/off cell for an independent boolean (the display toggles). Lit when on, exactly like a
// selected tab; nothing else in the row moves when it flips.
export function ToggleCell({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			aria-pressed={on}
			onClick={onClick}
			className={cn(
				"ta-tab ta-wall-cell flex min-h-8 cursor-pointer items-center justify-center px-2.5 text-xs font-medium leading-tight transition-colors",
				"focus:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-fg",
				on ? "text-fg" : "text-fg-muted hover:text-fg-secondary",
			)}
		>
			{label}
		</button>
	);
}
