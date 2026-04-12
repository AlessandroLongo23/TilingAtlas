"use client";

import { useState } from "react";
import { useLegacyTilingStore } from "@/stores/legacyTilingStore";
import { vertexTypes } from "@/stores/vertexTypes";
import { Toggle } from "./ui/toggle";
import { Button } from "./ui/button";
import { ButtonGroup } from "./ui/button-group";
import { SidebarSection } from "./ui/sidebar-section";
import { Switch } from "./ui/switch";
import { VertexTypeCard } from "./vertex-type-card";

export type FilterMode = "exact" | "contains";

interface TilingFilterBarProps {
	selectedTypes: string[];
	onSelectedTypesChange: (v: string[]) => void;
	selectedPolygons: number[];
	onSelectedPolygonsChange: (v: number[]) => void;
	selectedVertexTypes: string[];
	onSelectedVertexTypesChange: (v: string[]) => void;
	showDual: boolean;
	onShowDualChange: (v: boolean) => void;
	polygonFilterMode: FilterMode;
	onPolygonFilterModeChange: (mode: FilterMode) => void;
	vertexTypeFilterMode: FilterMode;
	onVertexTypeFilterModeChange: (mode: FilterMode) => void;
}

const POLYGONS = [3, 4, 5, 6, 8, 9, 12];

type SectionKey = "types" | "polygons" | "dual" | "vertexTypes";

export function TilingFilterBar({
	selectedTypes,
	onSelectedTypesChange,
	selectedPolygons,
	onSelectedPolygonsChange,
	selectedVertexTypes,
	onSelectedVertexTypesChange,
	showDual,
	onShowDualChange,
	polygonFilterMode,
	onPolygonFilterModeChange,
	vertexTypeFilterMode,
	onVertexTypeFilterModeChange,
}: TilingFilterBarProps) {
	const initialized = useLegacyTilingStore((s) => s.initialized);
	const store = useLegacyTilingStore();
	const activeRules = initialized ? store.tilingRules() : [];
	const types = activeRules.map((r) => ({ id: r.id, label: r.title }));

	const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
		types: true,
		polygons: true,
		dual: true,
		vertexTypes: true,
	});
	const setOpen = (key: SectionKey) => (open: boolean) =>
		setExpanded((prev) => ({ ...prev, [key]: open }));

	const toggleType = (id: string) => {
		onSelectedTypesChange(
			selectedTypes.includes(id)
				? selectedTypes.filter((t) => t !== id)
				: [...selectedTypes, id],
		);
	};
	const togglePolygon = (p: number) => {
		onSelectedPolygonsChange(
			selectedPolygons.includes(p)
				? selectedPolygons.filter((x) => x !== p)
				: [...selectedPolygons, p],
		);
	};
	const toggleVertexType = (id: string) => {
		onSelectedVertexTypesChange(
			selectedVertexTypes.includes(id)
				? selectedVertexTypes.filter((v) => v !== id)
				: [...selectedVertexTypes, id],
		);
	};

	const clearFilters = () => {
		onSelectedTypesChange([]);
		onSelectedPolygonsChange([]);
		onSelectedVertexTypesChange([]);
		onShowDualChange(false);
		onPolygonFilterModeChange("exact");
		onVertexTypeFilterModeChange("exact");
	};

	return (
		<div className="h-full overflow-y-auto border-r border-line">
			<div className="flex flex-col gap-2 p-4">
				<SidebarSection
					title="Class"
					summary={selectedTypes.length ? selectedTypes.length : null}
					open={expanded.types}
					onOpenChange={setOpen("types")}
				>
					<ButtonGroup
						multi
						variant="pill"
						size="sm"
						options={types.map((t) => ({ value: t.id, label: t.label }))}
						selected={selectedTypes}
						onChange={toggleType}
					/>
				</SidebarSection>

				<SidebarSection
					title="Polygon"
					summary={selectedPolygons.length ? selectedPolygons.length : null}
					open={expanded.polygons}
					onOpenChange={setOpen("polygons")}
					rightSlot={
						<Toggle
							leftValue="exact"
							rightValue="contains"
							value={polygonFilterMode}
							onChange={(v) => onPolygonFilterModeChange(v as FilterMode)}
							padding="py-1 px-3"
						/>
					}
				>
					<ButtonGroup
						multi
						variant="pill"
						size="md"
						options={POLYGONS.map((p) => ({ value: p, label: p, classes: "w-9 px-0" }))}
						selected={selectedPolygons}
						onChange={togglePolygon}
					/>
				</SidebarSection>

				<SidebarSection
					title="Vertex Type"
					summary={selectedVertexTypes.length ? selectedVertexTypes.length : null}
					open={expanded.vertexTypes}
					onOpenChange={setOpen("vertexTypes")}
					rightSlot={
						<Toggle
							leftValue="exact"
							rightValue="contains"
							value={vertexTypeFilterMode}
							onChange={(v) => onVertexTypeFilterModeChange(v as FilterMode)}
							padding="py-1 px-3"
						/>
					}
				>
					<div className="grid grid-cols-2 gap-2">
						{vertexTypes.map((vt) => (
							<div key={vt.id} className="w-full aspect-square">
								<VertexTypeCard
									id={vt.id}
									name={vt.name}
									isSelected={selectedVertexTypes.includes(vt.id)}
									onToggle={toggleVertexType}
								/>
							</div>
						))}
					</div>
				</SidebarSection>

				<SidebarSection
					title="Dual Tilings"
					summary={showDual ? "on" : null}
					open={expanded.dual}
					onOpenChange={setOpen("dual")}
				>
					<div className="flex justify-between items-center px-1">
						<div className="text-sm text-fg-secondary">Show Dual Tilings</div>
						<Switch
							checked={showDual}
							onCheckedChange={onShowDualChange}
							aria-label="Toggle dual tilings"
						/>
					</div>
				</SidebarSection>

				<Button
					variant="secondary"
					size="md"
					onClick={clearFilters}
					classes="mt-2"
					label="Clear Filters"
				/>
			</div>
		</div>
	);
}
