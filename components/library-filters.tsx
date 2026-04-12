"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface LibraryFiltersValue {
	kValues?: number[];
	polygonNames?: string[];
	wallpaperGroup?: string;
	exhaustiveOnly?: boolean;
}

interface LibraryFiltersProps {
	filters: LibraryFiltersValue;
	onFiltersChange: (filters: LibraryFiltersValue) => void;
	gridColumns: number;
	onGridColumnsChange: (cols: number) => void;
}

const K_OPTIONS = [1, 2, 3, 4, 5, 6];
const WALLPAPER_GROUPS = [
	"p1", "p2", "pm", "pg", "cm",
	"pmm", "pmg", "pgg", "cmm",
	"p4", "p4m", "p4g",
	"p3", "p3m1", "p31m",
	"p6", "p6m",
];
const COLUMN_PRESETS = [3, 4, 5, 6, 0];

type SectionKey = "k" | "polygons" | "wallpaper" | "options";

export function LibraryFilters({ filters, onFiltersChange, gridColumns, onGridColumnsChange }: LibraryFiltersProps) {
	const [sectionsOpen, setSectionsOpen] = useState<Record<SectionKey, boolean>>({
		k: true,
		polygons: false,
		wallpaper: false,
		options: false,
	});

	const toggleSection = (key: SectionKey) => {
		setSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }));
	};

	const toggleK = (k: number) => {
		const cur = filters.kValues ?? [];
		onFiltersChange({
			...filters,
			kValues: cur.includes(k) ? cur.filter((v) => v !== k) : [...cur, k],
		});
	};

	const setPolygonSearch = (val: string) => {
		const names = val.split(",").map((s) => s.trim()).filter(Boolean);
		onFiltersChange({ ...filters, polygonNames: names.length ? names : undefined });
	};

	const setWallpaper = (val: string) => {
		onFiltersChange({ ...filters, wallpaperGroup: val || undefined });
	};

	return (
		<div className="flex flex-col gap-1 text-sm">
			{/* k values */}
			<FilterSection
				open={sectionsOpen.k}
				onToggle={() => toggleSection("k")}
				title="Vertex count (k)"
				summary={filters.kValues?.length ? filters.kValues.join(", ") : null}
			>
				<div className="flex gap-1.5 p-2 bg-zinc-900/30">
					{K_OPTIONS.map((k) => {
						const active = filters.kValues?.includes(k);
						return (
							<button
								key={k}
								onClick={() => toggleK(k)}
								className={cn(
									"w-8 h-8 rounded-md text-xs font-medium border transition-colors",
									active
										? "bg-green-500/20 text-green-400 border-green-500/40"
										: "bg-zinc-800 text-zinc-400 border-zinc-700/50 hover:border-zinc-600",
								)}
							>
								{k}
							</button>
						);
					})}
				</div>
			</FilterSection>

			{/* Polygon names */}
			<FilterSection
				open={sectionsOpen.polygons}
				onToggle={() => toggleSection("polygons")}
				title="Polygon types"
				summary={filters.polygonNames?.length ? `${filters.polygonNames.length} set` : null}
			>
				<div className="p-2 bg-zinc-900/30">
					<input
						type="text"
						placeholder="e.g. 3, 4, 6"
						value={filters.polygonNames?.join(", ") ?? ""}
						onChange={(e) => setPolygonSearch(e.target.value)}
						className="w-full bg-zinc-800 border border-zinc-700/60 rounded px-2 py-1 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
					/>
					<p className="mt-1 text-zinc-600 text-[10px]">Comma-separated polygon names</p>
				</div>
			</FilterSection>

			{/* Wallpaper group */}
			<FilterSection
				open={sectionsOpen.wallpaper}
				onToggle={() => toggleSection("wallpaper")}
				title="Wallpaper group"
				summary={filters.wallpaperGroup ?? null}
			>
				<div className="p-2 bg-zinc-900/30">
					<select
						value={filters.wallpaperGroup ?? ""}
						onChange={(e) => setWallpaper(e.target.value)}
						className="w-full bg-zinc-800 border border-zinc-700/60 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-zinc-500"
					>
						<option value="">All groups</option>
						{WALLPAPER_GROUPS.map((group) => (
							<option key={group} value={group}>
								{group}
							</option>
						))}
					</select>
				</div>
			</FilterSection>

			{/* Options */}
			<FilterSection
				open={sectionsOpen.options}
				onToggle={() => toggleSection("options")}
				title="Options"
			>
				<div className="p-3 bg-zinc-900/30 flex flex-col gap-2">
					<label className="flex items-center gap-2 cursor-pointer">
						<input
							type="checkbox"
							checked={filters.exhaustiveOnly ?? false}
							onChange={(e) =>
								onFiltersChange({ ...filters, exhaustiveOnly: e.target.checked || undefined })
							}
							className="h-3.5 w-3.5 rounded accent-green-400"
						/>
						<span className="text-xs text-zinc-300">Exhaustive campaigns only</span>
					</label>
				</div>
			</FilterSection>

			{/* Grid columns */}
			<div className="border border-zinc-700/40 rounded-lg overflow-hidden">
				<div className="px-3 py-2 bg-zinc-800/50">
					<p className="text-xs font-medium text-zinc-300 mb-2">Grid columns</p>
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
			</div>
		</div>
	);
}

function FilterSection({
	open,
	onToggle,
	title,
	summary,
	children,
}: {
	open: boolean;
	onToggle: () => void;
	title: string;
	summary?: string | null;
	children: React.ReactNode;
}) {
	return (
		<div className="border border-zinc-700/40 rounded-lg overflow-hidden">
			<button
				onClick={onToggle}
				className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
			>
				<span className="text-xs font-medium text-zinc-300">
					{title}
					{summary ? <span className="ml-1 text-green-400">{summary}</span> : null}
				</span>
				{open ? <ChevronDown size={13} className="text-zinc-500" /> : <ChevronRight size={13} className="text-zinc-500" />}
			</button>
			{open ? children : null}
		</div>
	);
}
