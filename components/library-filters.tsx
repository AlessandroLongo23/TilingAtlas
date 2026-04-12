"use client";

import { useState } from "react";
import { SidebarSection } from "./ui/sidebar-section";
import { ButtonGroup } from "./ui/button-group";

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
const COLUMN_PRESETS = [3, 4, 5, 6];

type SectionKey = "k" | "polygons" | "wallpaper" | "options" | "grid";

export function LibraryFilters({ filters, onFiltersChange, gridColumns, onGridColumnsChange }: LibraryFiltersProps) {
	const [sectionsOpen, setSectionsOpen] = useState<Record<SectionKey, boolean>>({
		k: true,
		polygons: false,
		wallpaper: false,
		options: false,
		grid: true,
	});

	const setOpen = (key: SectionKey) => (open: boolean) =>
		setSectionsOpen((prev) => ({ ...prev, [key]: open }));

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
			<SidebarSection
				title="Vertex count (k)"
				summary={filters.kValues?.length ? filters.kValues.join(", ") : null}
				open={sectionsOpen.k}
				onOpenChange={setOpen("k")}
			>
				<ButtonGroup
					multi
					options={K_OPTIONS.map((k) => ({ value: k, label: k, classes: "w-8" }))}
					selected={filters.kValues ?? []}
					onChange={toggleK}
				/>
			</SidebarSection>

			<SidebarSection
				title="Polygon types"
				summary={filters.polygonNames?.length ? `${filters.polygonNames.length} set` : null}
				open={sectionsOpen.polygons}
				onOpenChange={setOpen("polygons")}
			>
				<input
					type="text"
					placeholder="e.g. 3, 4, 6"
					value={filters.polygonNames?.join(", ") ?? ""}
					onChange={(e) => setPolygonSearch(e.target.value)}
					className="w-full bg-surface-overlay border border-line rounded-control px-2 py-1 text-xs text-fg-secondary placeholder:text-fg-disabled focus:outline-none focus:border-line-strong"
				/>
				<p className="mt-1 text-fg-disabled text-[10px]">Comma-separated polygon names</p>
			</SidebarSection>

			<SidebarSection
				title="Wallpaper group"
				summary={filters.wallpaperGroup ?? null}
				open={sectionsOpen.wallpaper}
				onOpenChange={setOpen("wallpaper")}
			>
				<select
					value={filters.wallpaperGroup ?? ""}
					onChange={(e) => setWallpaper(e.target.value)}
					className="w-full bg-surface-overlay border border-line rounded-control px-2 py-1 text-xs text-fg-secondary focus:outline-none focus:border-line-strong"
				>
					<option value="">All groups</option>
					{WALLPAPER_GROUPS.map((group) => (
						<option key={group} value={group}>
							{group}
						</option>
					))}
				</select>
			</SidebarSection>

			<SidebarSection
				title="Options"
				open={sectionsOpen.options}
				onOpenChange={setOpen("options")}
			>
				<label className="flex items-center gap-2 cursor-pointer px-1 py-1">
					<input
						type="checkbox"
						checked={filters.exhaustiveOnly ?? false}
						onChange={(e) =>
							onFiltersChange({ ...filters, exhaustiveOnly: e.target.checked || undefined })
						}
						className="h-3.5 w-3.5 rounded accent-accent"
					/>
					<span className="text-xs text-fg-secondary">Exhaustive campaigns only</span>
				</label>
			</SidebarSection>

			<SidebarSection
				title="Grid columns"
				summary={gridColumns}
				open={sectionsOpen.grid}
				onOpenChange={setOpen("grid")}
			>
				<ButtonGroup
					options={COLUMN_PRESETS.map((col) => ({ value: col, label: col, classes: "w-9" }))}
					selected={gridColumns}
					onChange={onGridColumnsChange}
				/>
			</SidebarSection>
		</div>
	);
}
