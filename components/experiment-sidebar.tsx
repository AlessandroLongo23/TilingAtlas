"use client";

import { cn } from "@/lib/utils/cn";

interface ExperimentSidebarProps {
	visible?: boolean;
	gridColumns: number;
	onGridColumnsChange: (cols: number) => void;
	filterK: number | null;
	onFilterKChange: (k: number | null) => void;
	filterM: number | null;
	onFilterMChange: (m: number | null) => void;
	kOptions?: number[];
	mOptions?: number[];
	showFilters?: boolean;
}

const COLUMN_PRESETS = [3, 4, 5, 6, 0];

/**
 * Lab experiment sidebar — grid-column picker + optional k/m filters.
 *
 * In the source, `visible` came from `getContext('experiment-sidebar')`.
 * Here, pass `visible` explicitly from a React Context provider at the
 * lab layout level (see Phase 4/5 plan).
 */
export function ExperimentSidebar({
	visible = true,
	gridColumns,
	onGridColumnsChange,
	filterK,
	onFilterKChange,
	filterM,
	onFilterMChange,
	kOptions = [],
	mOptions = [],
	showFilters = false,
}: ExperimentSidebarProps) {
	return (
		<aside
			className={cn(
				"h-full shrink-0 flex flex-col bg-zinc-800/50 border-r border-zinc-800/80 overflow-hidden transition-all duration-200",
				visible ? "w-56" : "w-0 border-r-0",
			)}
		>
			<div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 min-w-[14rem]">
				<div>
					<p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">Grid columns</p>
					<div className="flex gap-1.5 flex-wrap">
						{COLUMN_PRESETS.map((col) => {
							const active = gridColumns === col;
							return (
								<button
									key={col}
									onClick={() => onGridColumnsChange(col)}
									className={cn(
										"w-9 h-7 rounded-md text-xs font-medium border transition-colors",
										active
											? "bg-green-500/20 text-green-400 border-green-500/40"
											: "bg-zinc-800 text-zinc-400 border-zinc-700/50 hover:border-zinc-600",
									)}
								>
									{col === 0 ? "Auto" : col}
								</button>
							);
						})}
					</div>
				</div>

				{showFilters && kOptions.length > 0 ? (
					<FilterGroup
						title="Filter by K"
						value={filterK}
						options={kOptions}
						onChange={onFilterKChange}
					/>
				) : null}

				{showFilters && mOptions.length > 0 ? (
					<FilterGroup
						title="Filter by M"
						value={filterM}
						options={mOptions}
						onChange={onFilterMChange}
					/>
				) : null}
			</div>
		</aside>
	);
}

function FilterGroup({
	title,
	value,
	options,
	onChange,
}: {
	title: string;
	value: number | null;
	options: number[];
	onChange: (val: number | null) => void;
}) {
	return (
		<div>
			<p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">{title}</p>
			<div className="flex gap-1.5 flex-wrap">
				<button
					onClick={() => onChange(null)}
					className={cn(
						"px-2.5 h-7 rounded-md text-xs font-medium border transition-colors",
						value === null
							? "bg-green-500/20 text-green-400 border-green-500/40"
							: "bg-zinc-800 text-zinc-400 border-zinc-700/50 hover:border-zinc-600",
					)}
				>
					All
				</button>
				{options.map((opt) => {
					const active = value === opt;
					return (
						<button
							key={opt}
							onClick={() => onChange(opt)}
							className={cn(
								"w-9 h-7 rounded-md text-xs font-medium border transition-colors",
								active
									? "bg-green-500/20 text-green-400 border-green-500/40"
									: "bg-zinc-800 text-zinc-400 border-zinc-700/50 hover:border-zinc-600",
							)}
						>
							{opt}
						</button>
					);
				})}
			</div>
		</div>
	);
}
