"use client";

import { ChevronDown, Play } from "lucide-react";
import { Fragment, useId, useState, type ReactNode, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { OptionWall } from "@/components/ui/option-wall";
import type { Tri } from "@/lib/freedraw/filter";
import { cn } from "@/lib/utils/cn";

export type FreedrawGeometry = "planar" | "spherical" | "hyperbolic";

// The catalogue workbench kit shared by the freedraw arms and /colors: a filter band over a thumbnail
// grid with a detail pane on the right. (The "Wall" names are from the squared system this replaced;
// the pieces are now plain controls on one panel, spaced apart.)

// The filter band: one raised panel with a 16px gutter. The header line carries the page title, the
// result count on its baseline, the collapse chevron right after them and any actions (`top`) at the far
// end; the title or chevron retracts the controls (grid-rows 1fr to 0fr) so the list gets the room back.
export function WallBar({
	title = "Freedraw tilings",
	count,
	top,
	children,
}: {
	title?: string;
	count?: ReactNode;
	top?: ReactNode;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(true);
	const toggle = () => setOpen((o) => !o);
	const bodyId = useId();
	return (
		<div className="w-full bg-surface-raised px-4 py-2.5">
			<div className="flex h-8 items-center gap-2 text-xs">
				<button
					type="button"
					onClick={toggle}
					aria-expanded={open}
					aria-controls={bodyId}
					className="flex cursor-pointer items-baseline gap-2 text-left"
				>
					<span className="text-[15px] font-semibold tracking-tight text-fg">{title}</span>
					{count != null && <span className="text-[13px] tabular-nums text-fg-muted">{count}</span>}
				</button>
				<button
					type="button"
					onClick={toggle}
					aria-expanded={open}
					aria-controls={bodyId}
					aria-label={open ? "Collapse filters" : "Expand filters"}
					className="flex cursor-pointer rounded-control items-center p-1 text-fg-muted transition-colors hover:text-fg-secondary"
				>
					<ChevronDown
						size={14}
						className={cn("transition-transform duration-200 ease-out motion-reduce:transition-none", !open && "-rotate-90")}
					/>
				</button>
				<div className="ml-auto flex items-center gap-3">{top}</div>
			</div>
			<div
				id={bodyId}
				className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
				style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
			>
				<div className="overflow-hidden">
					<div
						className={cn(
							"flex flex-wrap items-start gap-x-8 gap-y-5 pb-2 pt-3 transition duration-200 ease-out motion-reduce:transition-none",
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

// One column of the band: its groups stacked. Columns grow from a 15rem basis in equal shares, so a
// wide band splits into equal tracks and a narrow one wraps.
export function WallColumn({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cn("flex min-w-0 flex-[1_1_15rem] flex-col gap-5", className)}>{children}</div>;
}

// A filter group: a mono section label, an optional muted gloss after a middot, then the controls.
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
		<div className={cn("flex flex-col gap-2", className)}>
			<div className="flex h-4 items-center gap-1.5 whitespace-nowrap">
				<span className="ta-label">{title}</span>
				{note ? <span className="text-[11px] text-fg-muted">· {note}</span> : null}
			</div>
			{children}
		</div>
	);
}

// A caption inside a group: names a sub-section ("Polygons", "Wiring") in the group label's style.
export function WallSubLabel({ children }: { children: ReactNode }) {
	return <div className="ta-label pt-2">{children}</div>;
}

const GEOMETRY_OPTIONS: { value: FreedrawGeometry; label: string }[] = [
	{ value: "planar", label: "Planar" },
	{ value: "spherical", label: "Spherical" },
	{ value: "hyperbolic", label: "Hyperbolic" },
];

// The high-level geometry picker, rendered as the first group of either arm so the arms share it.
export function GeometryGroup({
	value,
	onChange,
}: {
	value: FreedrawGeometry;
	onChange: (g: FreedrawGeometry) => void;
}) {
	return (
		<WallGroup title="Geometry">
			<OptionWall columns={3} options={GEOMETRY_OPTIONS} selected={value} onChange={onChange} />
		</WallGroup>
	);
}

// The three states of a per-class / per-polygon filter, in control order.
const TRI_COLS: { value: Tri; label: string }[] = [
	{ value: "require", label: "Has" },
	{ value: "exclude", label: "None" },
	{ value: "any", label: "Any" },
];

export interface TriRow {
	id: string;
	label: ReactNode;
	value: Tri;
	onChange: (v: Tri) => void;
}

// Has / None / Any per row (finite, strips, … or △, ▢, …): a label column, then one compact 24px
// segmented control per row, so the rows align into a table without a header.
export function TriMatrix({ rows }: { rows: TriRow[] }) {
	return (
		<div className="grid grid-cols-[auto_auto] items-center gap-x-3 gap-y-1">
			{rows.map((row) => (
				<Fragment key={row.id}>
					<span className="whitespace-nowrap text-xs text-fg-secondary">{row.label}</span>
					<div className="ta-seg grid grid-cols-3" style={{ padding: 2 }}>
						{TRI_COLS.map((c) => {
							const on = row.value === c.value;
							return (
								<button
									key={c.value}
									type="button"
									aria-pressed={on}
									onClick={() => row.onChange(c.value)}
									className={cn(
										"ta-tab h-5 cursor-pointer px-2 text-[11px] font-medium transition-colors",
										"focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
										on ? "text-fg" : "text-fg-muted hover:text-fg-secondary",
									)}
								>
									{c.label}
								</button>
							);
						})}
					</div>
				</Fragment>
			))}
		</div>
	);
}

// An independent on/off cell for the overlay toggles, a multi-select tab in a segmented track so "on"
// reads exactly like a selected segment. `shortcut` names the key that also flips it (bound by the page
// through useKeyShortcuts, the same keys as /play's View options), set as a quiet mono suffix.
export function ToggleCell({
	label,
	on,
	onClick,
	shortcut,
}: {
	label: string;
	on: boolean;
	onClick: () => void;
	shortcut?: string;
}) {
	return (
		<button
			type="button"
			aria-pressed={on}
			aria-keyshortcuts={shortcut}
			onClick={onClick}
			className={cn(
				"ta-tab inline-flex min-h-7 flex-1 cursor-pointer items-center justify-center gap-1.5 px-2.5 text-xs font-medium transition-colors",
				"focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
				on ? "text-fg" : "text-fg-muted hover:text-fg-secondary",
			)}
		>
			{label}
			{shortcut ? <span className="font-mono text-[10px] font-normal text-fg-muted">{shortcut}</span> : null}
		</button>
	);
}

// A row of ToggleCells: one segmented track.
export function ToggleRow({ children }: { children: ReactNode }) {
	return <div className="ta-seg flex">{children}</div>;
}

// A catalogue thumbnail card: the render, then an id (12px mono ink) over a subtitle (11px muted).
// `data-selected` is what useGridArrowNav scrolls into view; the selection ring is ink, never accent.
export function CatalogueCard({
	selected,
	onClick,
	title,
	subtitle,
	children,
}: {
	selected: boolean;
	onClick: () => void;
	title: ReactNode;
	subtitle: ReactNode;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			data-selected={selected ? "" : undefined}
			onClick={onClick}
			className={cn(
				"overflow-hidden rounded-surface border bg-surface-raised text-left transition-colors",
				selected ? "border-fg ring-1 ring-fg" : "border-line-subtle hover:border-line-strong",
			)}
		>
			<div className="aspect-square">{children}</div>
			<div className="border-t border-line-subtle px-2.5 py-2 leading-tight">
				<div className="truncate font-mono text-xs font-medium text-fg">{title}</div>
				<div className="mt-0.5 truncate text-[11px] text-fg-muted">{subtitle}</div>
			</div>
		</button>
	);
}

// The thumbnail grid the cards sit in.
export const CATALOGUE_GRID = "grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(116px,1fr))]";

// The right-hand detail pane: a framed interactive preview at a fixed 320px height (so the title, the
// primary action and the metadata stay above the fold) with the interaction hint as a chip in its corner
// until the first press, then the id over an optional subtitle, "Open in play", the metadata as stacked
// label/value pairs and any extra sections (`children`). Children never shrink, so the pane scrolls.
export function DetailPane({
	preview,
	previewRef,
	previewClassName,
	title,
	subtitle,
	hint,
	playHref,
	meta,
	children,
}: {
	preview: ReactNode;
	previewRef?: Ref<HTMLDivElement>;
	previewClassName?: string;
	title: ReactNode;
	subtitle?: ReactNode;
	hint: ReactNode;
	playHref: string | null;
	meta: [ReactNode, ReactNode][];
	children?: ReactNode;
}) {
	const [touched, setTouched] = useState(false);
	return (
		<aside className="flex w-[380px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-line-subtle p-4 *:shrink-0">
			<div
				ref={previewRef}
				onPointerDown={() => setTouched(true)}
				className={cn("relative h-80 overflow-hidden rounded-xl border border-line-subtle", previewClassName)}
			>
				{preview}
				<div
					className={cn(
						"pointer-events-none absolute bottom-2 left-2 rounded-control bg-surface/95 px-2 py-1 text-[11px] text-fg-muted ring-1 ring-line-subtle transition-opacity duration-300",
						touched && "opacity-0",
					)}
				>
					{hint}
				</div>
			</div>
			<div>
				<div className="font-mono text-base font-semibold text-fg">{title}</div>
				{subtitle ? <div className="mt-0.5 text-xs text-fg-muted">{subtitle}</div> : null}
			</div>
			{playHref && <Button href={playHref} variant="primary" size="sm" icon={Play} label="Open in play" fullWidth />}
			<dl className="flex flex-col gap-3">
				{meta.map(([k, v], i) => (
					<div key={i}>
						<dt className="ta-label">{k}</dt>
						<dd className="mt-1 font-mono text-xs tabular-nums text-fg-secondary">{v}</dd>
					</div>
				))}
			</dl>
			{children}
		</aside>
	);
}
