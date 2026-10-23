"use client";

import { Select } from "@base-ui/react/select";
import {
	ArrowDownWideNarrow,
	ArrowUpNarrowWide,
	Check,
	ChevronsUpDown,
	Download,
	LayoutGrid,
	Rows3,
	X,
} from "lucide-react";
import type { ReactNode } from "react";
import { SegIndicator } from "@/components/ui/seg-indicator";
import { Tooltip } from "@/components/ui/tooltip";
import { SORT_LABEL, type SortDir, type SortKey } from "@/lib/services/librarySort";
import { cn } from "@/lib/utils/cn";

export type ResultsView = "grid" | "table";

/** One applied filter, as the chip that names it and takes it off. */
export interface ActiveChip {
	key: string;
	label: ReactNode;
	clear: () => void;
}

/**
 * The line of applied filters above the results: the query sits next to what it produced, and any part
 * of it comes off with one click, without hunting for the group it was set in.
 */
export function ActiveFilters({ chips, onClearAll }: { chips: ActiveChip[]; onClearAll: () => void }) {
	if (!chips.length) return null;
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{chips.map((c) => (
				<span
					key={c.key}
					className="ta-rise-in inline-flex h-7 items-center gap-1 rounded-full bg-surface-sunken pr-1 pl-2.5 text-[12px] text-fg ring-1 ring-line-subtle"
				>
					{c.label}
					<button
						type="button"
						onClick={c.clear}
						aria-label="Remove filter"
						className="flex size-5 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-overlay hover:text-fg"
					>
						<X size={11} />
					</button>
				</span>
			))}
			{chips.length > 1 ? (
				<button
					type="button"
					onClick={onClearAll}
					className="h-7 cursor-pointer rounded-full px-2.5 text-[12px] text-fg-muted transition-colors hover:text-danger"
				>
					Clear all
				</button>
			) : null}
		</div>
	);
}

/** Sort key and direction: a menu of the orders that mean something for the tilings in view, and an arrow. */
export function SortControl({
	keys,
	sortKey,
	sortDir,
	onChange,
}: {
	keys: SortKey[];
	sortKey: SortKey;
	sortDir: SortDir;
	onChange: (key: SortKey, dir?: SortDir) => void;
}) {
	return (
		<div className="flex items-center">
			<Select.Root value={sortKey} onValueChange={(v) => onChange(v as SortKey)}>
				<Select.Trigger
					aria-label="Sort by"
					className="flex h-8 cursor-pointer items-center gap-1.5 rounded-l-control border border-line bg-surface-raised pr-1.5 pl-2.5 text-[13px] text-fg shadow-sm hover:bg-surface-overlay focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
				>
					<span className="text-fg-muted">Sort</span>
					<Select.Value>{(v: SortKey) => SORT_LABEL[v]}</Select.Value>
					<Select.Icon className="text-fg-muted">
						<ChevronsUpDown size={13} />
					</Select.Icon>
				</Select.Trigger>
				<Select.Portal>
					<Select.Positioner className="z-[var(--z-tooltip)] outline-none" sideOffset={4} alignItemWithTrigger={false}>
						<Select.Popup className="min-w-[var(--anchor-width)] origin-[var(--transform-origin)] rounded-lg bg-surface-raised p-1 shadow-lg ring-1 ring-line-subtle transition-[scale,opacity] duration-150 ease-out outline-none data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
							<Select.List>
								{keys.map((k) => (
									<Select.Item
										key={k}
										value={k}
										className="grid cursor-default grid-cols-[14px_1fr] items-center gap-2 rounded-md py-1.5 pr-3 pl-2 text-[13px] text-fg outline-none select-none data-highlighted:bg-surface-overlay"
									>
										<Select.ItemIndicator>
											<Check size={12} />
										</Select.ItemIndicator>
										<Select.ItemText className="col-start-2">{SORT_LABEL[k]}</Select.ItemText>
									</Select.Item>
								))}
							</Select.List>
						</Select.Popup>
					</Select.Positioner>
				</Select.Portal>
			</Select.Root>
			<Tooltip label={sortDir === "asc" ? "Ascending" : "Descending"} delay={0}>
				<button
					type="button"
					onClick={() => onChange(sortKey, sortDir === "asc" ? "desc" : "asc")}
					aria-label={sortDir === "asc" ? "Sorted ascending; reverse" : "Sorted descending; reverse"}
					className="-ml-px flex size-8 cursor-pointer items-center justify-center rounded-r-control border border-line bg-surface-raised text-fg-secondary shadow-sm hover:bg-surface-overlay hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
				>
					{sortDir === "asc" ? <ArrowUpNarrowWide size={14} /> : <ArrowDownWideNarrow size={14} />}
				</button>
			</Tooltip>
		</div>
	);
}

/** Grid of previews, or a table of properties. */
export function ViewToggle({ view, onChange }: { view: ResultsView; onChange: (v: ResultsView) => void }) {
	const opt = (v: ResultsView, label: string, icon: ReactNode) => (
		<Tooltip label={label} delay={0}>
			<button
				type="button"
				aria-pressed={view === v}
				aria-label={label}
				onClick={() => onChange(v)}
				className={cn(
					"ta-tab flex h-7 w-8 cursor-pointer items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 max-md:h-10 max-md:w-11",
					view === v ? "text-fg" : "text-fg-muted hover:text-fg",
				)}
			>
				{icon}
			</button>
		</Tooltip>
	);
	return (
		<div className="ta-seg flex" role="group" aria-label="View">
			<SegIndicator />
			{opt("grid", "Previews", <LayoutGrid size={14} />)}
			{opt("table", "Table", <Rows3 size={14} />)}
		</div>
	);
}

/** The filtered set as a CSV a reader can take into a notebook or a paper. */
export function ExportButton({ onExport, disabled }: { onExport: () => void; disabled?: boolean }) {
	return (
		<Tooltip label="Download the filtered set as CSV" delay={0}>
			<button
				type="button"
				onClick={onExport}
				disabled={disabled}
				aria-label="Export CSV"
				className="flex h-8 cursor-pointer items-center gap-1.5 rounded-control border border-line bg-surface-raised px-2.5 text-[13px] text-fg shadow-sm transition-[background-color,scale] hover:bg-surface-overlay focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 active:scale-[0.97] disabled:opacity-50 max-md:h-11 max-md:min-w-11 max-md:justify-center"
			>
				<Download size={14} />
				<span className="max-lg:sr-only">CSV</span>
			</button>
		</Tooltip>
	);
}
