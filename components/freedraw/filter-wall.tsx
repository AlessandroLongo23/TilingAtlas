"use client";

import { AboutCornerButton } from "@/components/about-corner-button";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { Fragment, useEffect, useId, useRef, useState, type ReactNode, type Ref } from "react";
import {
	SHEET_PANEL,
	SheetBackdrop,
	SheetFooter,
	SheetHeader,
	SheetTrigger,
	useSheet,
} from "@/design-system/components/bottom-sheet";
import { Button } from "@/design-system/components/button";
import { ResetViewButton } from "@/components/reset-view-button";
import { OptionWall } from "@/design-system/components/option-wall";
import type { Tri } from "@/lib/freedraw/filter";
import { scrollParent } from "@/lib/hooks/useGridArrowNav";
import { useIsPhone } from "@/lib/hooks/useIsPhone";
import { cn } from "@/lib/utils/cn";
import { FoldChevron } from "@/design-system/components/disclosure";
import { HoverPill } from "@/design-system/components/hover-pill";
import { GEOMETRIES, type Geometry } from "@/lib/vocabulary";

export type FreedrawGeometry = Geometry;

// The catalogue workbench kit shared by the freedraw arms and /colors: a filter band over a thumbnail
// grid with a detail pane on the right. (The "Wall" names are from the squared system this replaced;
// the pieces are now plain controls on one panel, spaced apart.)
//
// On a phone (docs/mobile/DESIGN.md) the same pieces rearrange by CSS: the band shrinks to its title
// row plus a "Filters" button that opens the controls as a full-height sheet, the grid runs three
// columns across the whole width, and the detail pane becomes a sheet that a thumbnail tap opens, with
// previous / next in its header where the desktop has the arrow keys.

// The filter band: one raised panel with a 16px gutter. The header line carries the page title, the
// result count on its baseline, the collapse chevron right after them and any actions (`top`) at the far
// end; the title or chevron retracts the controls (grid-rows 1fr to 0fr) so the list gets the room back.
export function WallBar({
	title = "Freedraw tilings",
	count,
	top,
	active = 0,
	children,
}: {
	title?: string;
	count?: ReactNode;
	top?: ReactNode;
	/** Phone only: how many filters are off their default, shown on the "Filters" button. */
	active?: number;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(true);
	const toggle = () => setOpen((o) => !o);
	const bodyId = useId();
	// Phone: the controls live in a sheet. The body below is the same element on every viewport; CSS
	// hides it on a phone until the sheet opens, then pins it over the page.
	const isPhone = useIsPhone();
	const [sheet, setSheet] = useState(false);
	const closeSheet = () => setSheet(false);
	const bodyRef = useRef<HTMLDivElement>(null);
	const { active: sheetOpen, swipe, dialogProps } = useSheet(bodyRef, sheet, closeSheet, `${title} filters`);
	return (
		<div className="w-full bg-surface-raised px-4 py-2.5 max-md:py-1.5">
			<div className="flex h-8 items-center gap-2 text-small max-md:h-11">
				<button
					type="button"
					onClick={isPhone ? () => setSheet(true) : toggle}
					aria-expanded={isPhone ? sheet : open}
					aria-controls={bodyId}
					className="flex cursor-pointer items-baseline gap-2 text-left max-md:min-h-11 max-md:min-w-0 max-md:flex-col max-md:justify-center max-md:gap-0"
				>
					<span className="text-title font-semibold tracking-tight text-fg max-md:truncate">{title}</span>
					{count != null && <span className="text-ui text-fg-muted tabular-nums max-md:truncate">{count}</span>}
				</button>
				<button
					type="button"
					onClick={toggle}
					aria-expanded={open}
					aria-controls={bodyId}
					aria-label={open ? "Collapse filters" : "Expand filters"}
					className="flex cursor-pointer items-center rounded-control p-1 text-fg-muted transition-colors hover:text-fg-secondary max-md:hidden"
				>
					<FoldChevron open={open} size={14} className="text-current" />
				</button>
				<div className="ml-auto flex items-center gap-3 max-md:hidden">{top}</div>
				<SheetTrigger
					label="Filters"
					count={active}
					onClick={() => setSheet(true)}
					expanded={sheet}
					controls={bodyId}
					className="ml-auto"
				/>
				{/* A wall page has no canvas corner, so the way to its articles sits at the end of this row. */}
				<AboutCornerButton />
			</div>
			{sheetOpen && <SheetBackdrop onClose={closeSheet} />}
			<div
				id={bodyId}
				ref={bodyRef}
				{...dialogProps}
				className={cn(
					"grid transition-[grid-template-rows] motion-glide motion-reduce:transition-none",
					SHEET_PANEL,
					"max-md:bg-surface-raised",
					sheet ? "ta-sheet-in" : "max-md:hidden",
				)}
				style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
			>
				<SheetHeader swipe={swipe} title="Filters" onClose={closeSheet} closeLabel="Close filters">
					<div className="flex items-center text-small">{top}</div>
				</SheetHeader>
				<div className="overflow-hidden max-md:min-h-0 max-md:flex-1 max-md:overflow-y-auto max-md:overscroll-contain max-md:px-4">
					<div
						className={cn(
							"flex flex-wrap items-start gap-x-8 gap-y-5 pt-3 pb-2 transition motion-glide motion-reduce:transition-none",
							open ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
							"max-md:translate-y-0 max-md:pt-4 max-md:pb-6 max-md:opacity-100",
						)}
					>
						{children}
					</div>
				</div>
				<SheetFooter>
					<span className="min-w-0 flex-1 truncate text-ui text-fg-muted tabular-nums">{count}</span>
					<Button variant="primary" label="Show results" onClick={closeSheet} />
				</SheetFooter>
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
		// Full width on a phone, where the filters sheet is one column: a group sized to its content left
		// /colors' k cells 27px wide.
		<div className={cn("flex flex-col gap-2 max-md:w-full", className)}>
			<div className="flex h-4 items-center gap-1.5 whitespace-nowrap">
				<span className="ta-label">{title}</span>
				{note ? <span className="text-caption text-fg-muted">· {note}</span> : null}
			</div>
			{children}
		</div>
	);
}

// A caption inside a group: names a sub-section ("Polygons", "Wiring") in the group label's style.
export function WallSubLabel({ children }: { children: ReactNode }) {
	return <div className="ta-label pt-2">{children}</div>;
}

// What the selected option does, as a line of text on a phone only: the desktop keeps these in hover
// tooltips (or leaves them out), and a finger never hovers.
export function PhoneNote({ children }: { children: ReactNode }) {
	return <p className="hidden text-ui leading-tight text-fg-muted max-md:block">{children}</p>;
}

const GEOMETRY_OPTIONS: { value: FreedrawGeometry; label: string }[] = [
	{ value: GEOMETRIES.EUCLIDEAN, label: "Euclidean" },
	{ value: GEOMETRIES.SPHERICAL, label: "Spherical" },
	{ value: GEOMETRIES.HYPERBOLIC, label: "Hyperbolic" },
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

// Has / None / Any per row (finite, strips, … or △, ▢, …): a label column, then one dense 24px
// segmented control per row, so the rows align into a table without a header.
export function TriMatrix({ rows }: { rows: TriRow[] }) {
	return (
		<div className="grid grid-cols-[auto_auto] items-center gap-x-3 gap-y-1 max-md:grid-cols-[auto_1fr] max-md:gap-y-1.5">
			{rows.map((row) => (
				<Fragment key={row.id}>
					<span className="text-small whitespace-nowrap text-fg-secondary max-md:text-body">{row.label}</span>
					<OptionWall dense columns={3} options={TRI_COLS} selected={row.value} onChange={row.onChange} />
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
				"ta-tab inline-flex min-h-7 flex-1 cursor-pointer items-center justify-center gap-1.5 px-2.5 text-small font-medium transition-colors",
				"focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
				on ? "text-fg" : "text-fg-muted hover:text-fg-secondary",
			)}
		>
			{label}
			{shortcut ? (
				<span className="font-mono text-micro font-normal text-fg-muted max-md:hidden">{shortcut}</span>
			) : null}
		</button>
	);
}

// A row of ToggleCells: one segmented track. Kept by hand: as a multi OptionWall the shortcut keycaps
// overflow the four overlay cells in a 15rem column below a ~1360px viewport, where this quiet mono suffix
// fits from ~1180px.
export function ToggleRow({ children }: { children: ReactNode }) {
	return (
		<div className="ta-seg flex">
			<HoverPill />
			{children}
		</div>
	);
}

// A catalogue thumbnail card: the render, then an id (12px mono ink) over a subtitle (11px muted).
// `data-selected` is what useGridArrowNav scrolls into view; the selection ring is ink, never accent.
//
// On a phone the render mounts only while the card is within a screen or so of its scroll pane's view
// and unmounts again when it leaves: a page of 240 live canvases is more backing store than a phone
// browser will give one tab. The square slot holds the layout still while a card is empty.
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
	const isPhone = useIsPhone();
	const ref = useRef<HTMLButtonElement>(null);
	const [near, setNear] = useState(false);
	useEffect(() => {
		const el = ref.current;
		if (!isPhone || !el) return;
		const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), {
			root: scrollParent(el),
			rootMargin: "600px 0px",
		});
		io.observe(el);
		return () => io.disconnect();
	}, [isPhone]);
	return (
		<button
			ref={ref}
			type="button"
			data-selected={selected ? "" : undefined}
			onClick={onClick}
			className={cn(
				"ta-card overflow-hidden text-left transition-colors",
				selected ? "border-fg ring-1 ring-fg" : "hover:border-line-strong",
			)}
		>
			<div className="aspect-square">{!isPhone || near ? children : null}</div>
			<div className="border-t border-line-subtle px-2.5 py-2 leading-tight max-md:px-2">
				<div className="truncate font-mono text-small font-medium text-fg">{title}</div>
				<div className="mt-0.5 truncate text-caption text-fg-muted">{subtitle}</div>
			</div>
		</button>
	);
}

// The thumbnail grid the cards sit in. Three columns across a phone.
export const CATALOGUE_GRID =
	"grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(116px,1fr))] max-md:gap-2 max-md:[grid-template-columns:repeat(3,minmax(0,1fr))]";

// The list pane beside the detail pane: scrolls the grid and its pagination.
export const LIST_PANE =
	"flex-1 min-w-0 overflow-y-auto p-4 max-md:px-3 max-md:pb-[calc(env(safe-area-inset-bottom)+16px)]";

// The right-hand detail pane: a framed interactive preview at a fixed 320px height (so the title, the
// primary action and the metadata stay above the fold) with the interaction hint as a chip in its corner
// until the first press, then the id over an optional subtitle, "Open in play", the metadata as stacked
// label/value pairs and any extra sections (`children`). Children never shrink, so the pane scrolls.
//
// On a phone it is a full-height sheet, closed until a thumbnail is tapped (`open`), with a square
// preview, a reset-view button over it (the desktop resets with a double-click), and a header holding
// the selection's place in the list, previous / next (`onStep`, the arrow keys' move) and close. Swipe
// the header down to dismiss. The preview is not mounted while the sheet is closed, so a hidden live
// canvas never runs its frame loop.
export function DetailPane({
	preview,
	previewRef,
	previewClassName,
	title,
	subtitle,
	hint,
	touchHint = hint,
	playHref,
	meta,
	children,
	open = false,
	onClose,
	index = -1,
	count = 0,
	onStep,
	onResetView,
}: {
	preview: ReactNode;
	previewRef?: Ref<HTMLDivElement>;
	previewClassName?: string;
	title: ReactNode;
	subtitle?: ReactNode;
	hint: ReactNode;
	/** The hint in touch words, for the phone. */
	touchHint?: ReactNode;
	playHref: string | null;
	meta: [ReactNode, ReactNode][];
	children?: ReactNode;
	/** Phone: the sheet is showing. */
	open?: boolean;
	onClose?: () => void;
	/** Phone header: the selection's position in the filtered list and its length. */
	index?: number;
	count?: number;
	/** Phone header: move the selection by `delta` entries. */
	onStep?: (delta: number) => void;
	/** Phone: send the preview back to its home view. */
	onResetView?: () => void;
}) {
	const [touched, setTouched] = useState(false);
	const isPhone = useIsPhone();
	const ref = useRef<HTMLElement>(null);
	const close = () => onClose?.();
	const { active: sheetOpen, swipe, dialogProps } = useSheet(ref, open, close, "Tiling details");
	const stepButton = (delta: number, label: string, icon: typeof ChevronLeft, disabled: boolean) => (
		<Button
			variant="ghost"
			size="bar"
			icon={icon}
			onClick={() => onStep?.(delta)}
			disabled={disabled}
			aria-label={label}
		/>
	);
	return (
		<>
			{sheetOpen && <SheetBackdrop onClose={close} />}
			<aside
				ref={ref}
				{...dialogProps}
				className={cn(
					"flex w-[380px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-line-subtle p-4 *:shrink-0",
					SHEET_PANEL,
					"max-md:w-full max-md:border-l-0 max-md:bg-surface-chrome max-md:pt-0 max-md:pb-[calc(env(safe-area-inset-bottom)+24px)]",
					open ? "ta-sheet-in" : "max-md:hidden",
				)}
			>
				<SheetHeader
					swipe={swipe}
					title={count > 0 && index >= 0 ? `${(index + 1).toLocaleString()} of ${count.toLocaleString()}` : title}
					onClose={close}
					closeLabel="Close details"
					className="sticky top-0 z-chrome -mx-4 bg-surface-chrome"
				>
					{onStep && stepButton(-1, "Previous tiling", ChevronLeft, index <= 0)}
					{onStep && stepButton(1, "Next tiling", ChevronRight, index < 0 || index >= count - 1)}
				</SheetHeader>
				<div
					ref={previewRef}
					onPointerDown={() => setTouched(true)}
					className={cn("ta-well relative h-80 overflow-hidden max-md:aspect-square max-md:h-auto", previewClassName)}
				>
					{!isPhone || open ? preview : null}
					<div
						className={cn(
							"pointer-events-none absolute bottom-2 left-2 rounded-control bg-surface/95 px-2 py-1 text-caption text-fg-muted ring-1 ring-line-subtle transition-opacity motion-floating",
							touched && "opacity-0",
						)}
					>
						<span className="max-md:hidden">{hint}</span>
						<span className="md:hidden">{touchHint}</span>
					</div>
					{onResetView && <ResetViewButton onClick={onResetView} className="absolute top-3 right-3 z-20" />}
				</div>
				<div>
					<div className="font-mono text-title font-semibold text-fg">{title}</div>
					{subtitle ? <div className="mt-0.5 text-small text-fg-muted max-md:text-ui">{subtitle}</div> : null}
				</div>
				{playHref && (
					<Button href={playHref} variant="primary" size="sm" icon={Play} label="Open in play" className="w-full" />
				)}
				<dl className="flex flex-col gap-3">
					{meta.map(([k, v], i) => (
						<div key={i}>
							<dt className="ta-label">{k}</dt>
							<dd className="mt-1 font-mono text-small text-fg-secondary tabular-nums max-md:text-ui max-md:break-words">
								{v}
							</dd>
						</div>
					))}
				</dl>
				{children}
			</aside>
		</>
	);
}
