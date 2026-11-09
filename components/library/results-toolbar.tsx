"use client";

import { ArrowDownWideNarrow, ArrowUpNarrowWide, Download, LayoutGrid, Rows3, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/design-system/components/button";
import { Dropdown } from "@/design-system/components/dropdown";
import { SegIndicator } from "@/design-system/components/seg-indicator";
import { Tooltip } from "@/design-system/components/tooltip";
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
					className="ta-rise-in inline-flex h-7 items-center gap-1 rounded-full bg-surface-sunken pr-1 pl-2.5 text-small text-fg ring-1 ring-line-subtle"
				>
					{c.label}
					{/* ds-check: keep (the chip's own remove ×; the library has no removable chip) */}
					<button
						type="button"
						onClick={c.clear}
						aria-label="Remove filter"
						className="flex size-5 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-overlay hover:text-fg"
					>
						<X className="size-icon-xs" />
					</button>
				</span>
			))}
			{chips.length > 1 ? <Button variant="ghost" size="sm" onClick={onClearAll} label="Clear all" /> : null}
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
			<Dropdown
				value={sortKey}
				options={keys.map((k) => ({ value: k, label: SORT_LABEL[k] }))}
				onChange={(k) => onChange(k)}
				label="Sort"
				aria-label="Sort by"
				className="rounded-r-none"
			/>
			<Tooltip label={sortDir === "asc" ? "Ascending" : "Descending"} delay="instant">
				{/* ds-check: keep (joined to the Dropdown as one split control; Button's phone size would break the join) */}
				<button
					type="button"
					onClick={() => onChange(sortKey, sortDir === "asc" ? "desc" : "asc")}
					aria-label={sortDir === "asc" ? "Sorted ascending; reverse" : "Sorted descending; reverse"}
					className="-ml-px flex size-8 cursor-pointer items-center justify-center rounded-r-control border border-line bg-surface-raised text-fg-secondary shadow-raised hover:bg-surface-overlay hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
				>
					{sortDir === "asc" ? (
						<ArrowUpNarrowWide className="size-icon-sm" />
					) : (
						<ArrowDownWideNarrow className="size-icon-sm" />
					)}
				</button>
			</Tooltip>
		</div>
	);
}

/** Grid of previews, or a table of properties. */
export function ViewToggle({ view, onChange }: { view: ResultsView; onChange: (v: ResultsView) => void }) {
	const opt = (v: ResultsView, label: string, icon: ReactNode) => (
		<Tooltip label={label} delay="instant">
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
			{opt("grid", "Previews", <LayoutGrid className="size-icon-sm" />)}
			{opt("table", "Table", <Rows3 className="size-icon-sm" />)}
		</div>
	);
}

/** The filtered set as a CSV a reader can take into a notebook or a paper. */
export function ExportButton({ onExport, disabled }: { onExport: () => void; disabled?: boolean }) {
	return (
		<Tooltip label="Download the filtered set as CSV" delay="instant">
			<Button
				variant="secondary"
				size="sm"
				icon={Download}
				onClick={onExport}
				disabled={disabled}
				aria-label="Export CSV"
				className="max-md:min-w-11"
				label={<span className="max-lg:sr-only">CSV</span>}
			/>
		</Tooltip>
	);
}
