"use client";

import { useState } from "react";
import { SidebarSection } from "./ui/sidebar-section";
import { ButtonGroup } from "./ui/button-group";
import type { CatalogueFilter } from "@/lib/services/catalogueService";

// The library filters drive a CatalogueFilter over the certified-results catalogue. Certification is
// first-class (the atlas is about what's proven). Wallpaper-group / regular / star filters are gone for
// now — the scout doesn't yet emit symmetry/orbit data (deferred; FRONTEND_ROADMAP.md).
export type LibraryFiltersValue = CatalogueFilter;

interface LibraryFiltersProps {
	filters: LibraryFiltersValue;
	onFiltersChange: (filters: LibraryFiltersValue) => void;
	gridColumns: number;
	onGridColumnsChange: (cols: number) => void;
}

// The certified catalogue currently spans k=1..3 (octagon-lemma families); extend when k≥4 lands.
const K_OPTIONS = [1, 2, 3];
const COLUMN_PRESETS = [3, 4, 5, 6];
const CERT_OPTIONS: { value: NonNullable<CatalogueFilter["certification"]>; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "certified", label: "Certified" },
	{ value: "candidate", label: "Candidate" },
];

type SectionKey = "k" | "polygons" | "certification" | "grid";

export function LibraryFilters({ filters, onFiltersChange, gridColumns, onGridColumnsChange }: LibraryFiltersProps) {
	const [sectionsOpen, setSectionsOpen] = useState<Record<SectionKey, boolean>>({
		k: true,
		polygons: false,
		certification: true,
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

	const setCertification = (val: NonNullable<CatalogueFilter["certification"]>) => {
		onFiltersChange({ ...filters, certification: val === "all" ? undefined : val });
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
				title="Certification"
				summary={filters.certification ?? null}
				open={sectionsOpen.certification}
				onOpenChange={setOpen("certification")}
			>
				<ButtonGroup
					options={CERT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
					selected={filters.certification ?? "all"}
					onChange={setCertification}
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
				<p className="mt-1 text-fg-disabled text-[10px]">Comma-separated polygon names (matched against the family)</p>
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
