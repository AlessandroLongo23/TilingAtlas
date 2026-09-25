"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Play } from "lucide-react";
import {
	Fragment,
	useEffect,
	useId,
	useRef,
	useState,
	type ReactNode,
	type Ref,
} from "react";
import { SHEET_PANEL, SheetBackdrop, SheetFooter, SheetHeader, SheetTrigger, useSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { ResetViewButton } from "@/components/reset-view-button";
import { OptionWall } from "@/components/ui/option-wall";
import type { Tri } from "@/lib/freedraw/filter";
import { scrollParent } from "@/lib/hooks/useGridArrowNav";
import { useIsPhone } from "@/lib/hooks/useIsPhone";
import { cn } from "@/lib/utils/cn";

export type FreedrawGeometry = "planar" | "spherical" | "hyperbolic";

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
			<div className="flex h-8 items-center gap-2 text-xs max-md:h-11">
				<button
					type="button"
					onClick={isPhone ? () => setSheet(true) : toggle}
					aria-expanded={isPhone ? sheet : open}
					aria-controls={bodyId}
					className="flex cursor-pointer items-baseline gap-2 text-left max-md:min-h-11 max-md:min-w-0 max-md:flex-col max-md:justify-center max-md:gap-0"
				>
					<span className="text-[15px] font-semibold tracking-tight text-fg max-md:truncate">{title}</span>
					{count != null && <span className="text-[13px] tabular-nums text-fg-muted max-md:truncate">{count}</span>}
				</button>
				<button
					type="button"
					onClick={toggle}
					aria-expanded={open}
					aria-controls={bodyId}
					aria-label={open ? "Collapse filters" : "Expand filters"}
					className="flex cursor-pointer rounded-control items-center p-1 text-fg-muted transition-colors hover:text-fg-secondary max-md:hidden"
				>
					<ChevronDown
						size={14}
						className={cn("transition-transform duration-200 ease-out motion-reduce:transition-none", !open && "-rotate-90")}
					/>
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
			</div>
			{sheetOpen && <SheetBackdrop onClose={closeSheet} />}
			<div
				id={bodyId}
				ref={bodyRef}
				{...dialogProps}
				className={cn(
					"grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
					SHEET_PANEL,
					"max-md:bg-surface-raised",
					sheet ? "ta-sheet-in" : "max-md:hidden",
				)}
				style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
			>
				<SheetHeader swipe={swipe} title="Filters" onClose={closeSheet} closeLabel="Close filters">
					<div className="flex items-center text-xs">{top}</div>
				</SheetHeader>
				<div className="overflow-hidden max-md:min-h-0 max-md:flex-1 max-md:overflow-y-auto max-md:overscroll-contain max-md:px-4">
					<div
						className={cn(
							"flex flex-wrap items-start gap-x-8 gap-y-5 pb-2 pt-3 transition duration-200 ease-out motion-reduce:transition-none",
							open ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
							"max-md:translate-y-0 max-md:pb-6 max-md:pt-4 max-md:opacity-100",
						)}
					>
						{children}
					</div>
				</div>
				<SheetFooter>
					<span className="min-w-0 flex-1 truncate text-[13px] tabular-nums text-fg-muted">{count}</span>
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
				{note ? <span className="text-[11px] text-fg-muted max-md:text-xs">· {note}</span> : null}
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
	return <p className="hidden text-[13px] leading-snug text-fg-muted max-md:block">{children}</p>;
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
		<div className="grid grid-cols-[auto_auto] items-center gap-x-3 gap-y-1 max-md:grid-cols-[auto_1fr] max-md:gap-y-1.5">
			{rows.map((row) => (
				<Fragment key={row.id}>
					<span className="whitespace-nowrap text-xs text-fg-secondary max-md:text-sm">{row.label}</span>
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
										"ta-tab h-5 cursor-pointer px-2 text-[11px] font-medium transition-colors max-md:text-[13px]",
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
			{shortcut ? <span className="font-mono text-[10px] font-normal text-fg-muted max-md:hidden">{shortcut}</span> : null}
		</button>
	);
}

// A row of ToggleCells: one segmented track.
export function ToggleRow({ children }: { children: ReactNode }) {
	return <div className="ta-seg flex">{children}</div>;
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
				"overflow-hidden rounded-surface border bg-surface-raised text-left transition-colors",
				selected ? "border-fg ring-1 ring-fg" : "border-line-subtle hover:border-line-strong",
			)}
		>
			<div className="aspect-square">{!isPhone || near ? children : null}</div>
			<div className="border-t border-line-subtle px-2.5 py-2 leading-tight max-md:px-2">
				<div className="truncate font-mono text-xs font-medium text-fg">{title}</div>
				<div className="mt-0.5 truncate text-[11px] text-fg-muted max-md:text-xs">{subtitle}</div>
			</div>
		</button>
	);
}

// The thumbnail grid the cards sit in. Three columns across a phone.
export const CATALOGUE_GRID =
	"grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(116px,1fr))] max-md:gap-2 max-md:[grid-template-columns:repeat(3,minmax(0,1fr))]";

// The list pane beside the detail pane: scrolls the grid and its pagination.
export const LIST_PANE = "flex-1 min-w-0 overflow-y-auto p-4 max-md:px-3 max-md:pb-[calc(env(safe-area-inset-bottom)+16px)]";

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
	const stepButton = (delta: number, label: string, Icon: typeof ChevronLeft, disabled: boolean) => (
		<button
			type="button"
			onClick={() => onStep?.(delta)}
			disabled={disabled}
			aria-label={label}
			className="flex size-11 shrink-0 items-center justify-center rounded-control text-fg-secondary hover:bg-surface-overlay hover:text-fg disabled:opacity-30"
		>
			<Icon size={20} />
		</button>
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
					className="sticky top-0 z-30 -mx-4 bg-surface-chrome"
				>
					{onStep && stepButton(-1, "Previous tiling", ChevronLeft, index <= 0)}
					{onStep && stepButton(1, "Next tiling", ChevronRight, index < 0 || index >= count - 1)}
				</SheetHeader>
				<div
					ref={previewRef}
					onPointerDown={() => setTouched(true)}
					className={cn(
						"relative h-80 overflow-hidden rounded-xl border border-line-subtle max-md:aspect-square max-md:h-auto",
						previewClassName,
					)}
				>
					{!isPhone || open ? preview : null}
					<div
						className={cn(
							"pointer-events-none absolute bottom-2 left-2 rounded-control bg-surface/95 px-2 py-1 text-[11px] text-fg-muted ring-1 ring-line-subtle transition-opacity duration-300 max-md:text-xs",
							touched && "opacity-0",
						)}
					>
						<span className="max-md:hidden">{hint}</span>
						<span className="md:hidden">{touchHint}</span>
					</div>
					{onResetView && <ResetViewButton onClick={onResetView} className="absolute right-3 top-3 z-20" />}
				</div>
				<div>
					<div className="font-mono text-base font-semibold text-fg">{title}</div>
					{subtitle ? <div className="mt-0.5 text-xs text-fg-muted max-md:text-[13px]">{subtitle}</div> : null}
				</div>
				{playHref && <Button href={playHref} variant="primary" size="sm" icon={Play} label="Open in play" fullWidth />}
				<dl className="flex flex-col gap-3">
					{meta.map(([k, v], i) => (
						<div key={i}>
							<dt className="ta-label">{k}</dt>
							<dd className="mt-1 font-mono text-xs tabular-nums text-fg-secondary max-md:break-words max-md:text-[13px]">{v}</dd>
						</div>
					))}
				</dl>
				{children}
			</aside>
		</>
	);
}
