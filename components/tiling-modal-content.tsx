"use client";

import { useEffect, useMemo, useState } from "react";
import { Grid3x3 as Grid, Filter, Loader2 } from "lucide-react";
import { useLegacyTilingStore } from "@/stores/legacyTilingStore";
import { useTilingModal, useTilingFilters } from "@/stores/modalState";
import { useConfiguration, type SelectedTiling } from "@/stores/configuration";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { LegacyTilingCard } from "./legacy-tiling-card";
import { TilingFilterBar, type FilterMode } from "./tiling-filter-bar";
import { cn } from "@/lib/utils/cn";

interface TilingGroupRule {
	id: number;
	name: string;
	cr: string;
	rulestring: string;
	dualname: string;
	alternatives: string[];
	imageUrl: string;
	dualImageUrl: string;
	isRegular: boolean;
	isSemiregular: boolean;
	isStar: boolean;
	isConcave: boolean;
}
interface TilingGroup {
	id: string;
	title: string;
	dual: boolean;
	rules: TilingGroupRule[];
}

type FlatTiling = TilingGroupRule & {
	group: string;
	groupId: string;
};

function matchesPolygon(rulestring: string, sides: number[], mode: FilterMode): boolean {
	const polygonParts = rulestring.split("/")[0].replaceAll(",", "-").split("-");
	const polygonSides: number[] = [];
	for (const part of polygonParts) {
		const match = part.match(/^(\d+)/);
		if (match) {
			const side = parseInt(match[1]);
			if (side > 0) polygonSides.push(side);
		}
	}
	if (mode === "exact") {
		return (
			!sides.some((s) => !polygonSides.includes(s)) &&
			!polygonSides.some((s) => !sides.includes(s))
		);
	}
	return !sides.some((s) => !polygonSides.includes(s));
}

function containsVertexType(rule: TilingGroupRule, vts: string[], mode: FilterMode): boolean {
	if (!rule.cr) return false;
	if (mode === "exact") {
		return (
			!vts.some((vt) => !rule.cr.includes(vt)) &&
			!rule.cr.split(";").some((group) => !vts.some((vt) => group.includes(vt)))
		);
	}
	return !vts.some((vt) => !rule.cr.includes(vt));
}

export function TilingModalContent() {
	const { isOpen, setOpen } = useTilingModal();
	const filters = useTilingFilters();
	const setFilters = useTilingFilters((s) => s.set);
	const loading = useLegacyTilingStore((s) => s.loading);
	const initialized = useLegacyTilingStore((s) => s.initialized);
	const tilingRulesFn = useLegacyTilingStore((s) => s.tilingRules);
	const activeRules = initialized ? (tilingRulesFn() as TilingGroup[]) : [];
	const setConfig = useConfiguration((s) => s.set);

	const [showFilters, setShowFilters] = useState(true);

	// Derive filter sub-fields from the consolidated filters slice for convenience.
	const selectedTypes = filters.selectedTypes;
	const selectedPolygons = useMemo(() => {
		// filters.selectedPolygons is string[] in the source; coerce to number[] here.
		return (filters.selectedPolygons || []).map((s) => Number(s)).filter((n) => !Number.isNaN(n));
	}, [filters.selectedPolygons]);
	const selectedVertexTypes = filters.selectedVertexTypes;
	const showDual = filters.showDual;
	const polygonFilterMode = filters.polygonFilterMode;
	const vertexTypeFilterMode = filters.vertexTypeFilterMode;

	const activeFiltersCount =
		selectedTypes.length + selectedPolygons.length + selectedVertexTypes.length + (showDual ? 1 : 0);

	const filteredTilings = useMemo<FlatTiling[]>(() => {
		const result: FlatTiling[] = [];
		for (const group of activeRules) {
			const typeId = group.id;
			if (selectedTypes.length > 0 && !selectedTypes.includes(typeId)) continue;
			for (const rule of group.rules) {
				if (
					selectedPolygons.length > 0 &&
					!matchesPolygon(rule.rulestring, selectedPolygons, polygonFilterMode)
				)
					continue;
				if (
					selectedVertexTypes.length > 0 &&
					!containsVertexType(rule, selectedVertexTypes, vertexTypeFilterMode)
				)
					continue;

				result.push({ ...rule, group: group.title, groupId: group.id });
				if (showDual && group.dual) {
					result.push({
						...rule,
						name: rule.dualname,
						rulestring: rule.rulestring + "*",
						group: group.title,
						groupId: group.id,
						imageUrl: rule.dualImageUrl || rule.imageUrl,
					});
				}
			}
		}
		return result;
	}, [
		activeRules,
		selectedTypes,
		selectedPolygons,
		selectedVertexTypes,
		showDual,
		polygonFilterMode,
		vertexTypeFilterMode,
	]);

	useEffect(() => {
		// Ensure the legacy tiling store has loaded (idempotent).
		useLegacyTilingStore.getState().initialize();
	}, []);

	const loadTiling = (payload: { name: string; cr: string; rulestring: string }) => {
		setConfig({ selectedTiling: payload as SelectedTiling });
		setOpen(false);
	};

	const clearAll = () => {
		setFilters({
			selectedTypes: [],
			selectedPolygons: [],
			selectedVertexTypes: [],
			showDual: false,
		});
	};

	return (
		<Modal
			isOpen={isOpen}
			onOpenChange={setOpen}
			title="Tiling Rules List"
			maxWidth="max-w-7xl"
			header={
				<button
					onClick={() => setShowFilters((v) => !v)}
					aria-label={showFilters ? "Hide filters" : "Show filters"}
					title={showFilters ? "Hide filters" : "Show filters"}
					className="p-1 rounded-md hover:bg-surface-overlay/70 transition-all text-fg-secondary hover:text-fg relative"
				>
					<Filter size={18} className={showFilters ? "text-accent" : ""} />
					{activeFiltersCount > 0 ? (
						<span className="absolute -top-1 -right-1 bg-accent text-accent-contrast text-xs rounded-full w-4 h-4 flex items-center justify-center">
							{activeFiltersCount}
						</span>
					) : null}
				</button>
			}
		>
			<div className="relative flex h-[80vh] overflow-hidden">
				<div
					className={cn(
						"h-full transition-all duration-300 ease-in-out overflow-y-auto flex-shrink-0 bg-surface-raised/95",
						showFilters ? "w-80 mr-4 opacity-100" : "w-0 mr-0 opacity-0 pointer-events-none",
					)}
				>
					<TilingFilterBar
						selectedTypes={selectedTypes}
						onSelectedTypesChange={(v) => setFilters({ selectedTypes: v })}
						selectedPolygons={selectedPolygons}
						onSelectedPolygonsChange={(v) => setFilters({ selectedPolygons: v.map(String) })}
						selectedVertexTypes={selectedVertexTypes}
						onSelectedVertexTypesChange={(v) => setFilters({ selectedVertexTypes: v })}
						showDual={showDual}
						onShowDualChange={(v) => setFilters({ showDual: v })}
						polygonFilterMode={polygonFilterMode}
						onPolygonFilterModeChange={(v) => setFilters({ polygonFilterMode: v })}
						vertexTypeFilterMode={vertexTypeFilterMode}
						onVertexTypeFilterModeChange={(v) => setFilters({ vertexTypeFilterMode: v })}
					/>
				</div>

				<div className="h-full overflow-y-auto flex-grow p-4">
					{loading ? (
						<div className="py-8 text-center text-fg-muted">
							<Loader2 size={48} className="mx-auto mb-4 opacity-40 animate-spin" />
							<p>Loading tilings...</p>
						</div>
					) : filteredTilings.length === 0 ? (
						<div className="py-8 text-center text-fg-muted">
							<Grid size={48} className="mx-auto mb-4 opacity-40" />
							<p>No tilings match your filters</p>
							<Button
								variant="secondary"
								size="sm"
								onClick={clearAll}
								classes="mt-2"
								label="Clear Filters"
							/>
						</div>
					) : (
						<>
							<div className="mb-4">
								<p className="text-sm text-fg-muted">{filteredTilings.length} tilings found</p>
							</div>
							<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 pb-4">
								{filteredTilings.map((tiling) => (
									<LegacyTilingCard
										key={`${tiling.groupId}-${tiling.rulestring}`}
										name={tiling.name}
										cr={tiling.cr}
										rulestring={tiling.rulestring}
										groupId={tiling.groupId}
										onClick={loadTiling}
										imageUrl={tiling.imageUrl}
										dualImageUrl={tiling.dualImageUrl}
									/>
								))}
							</div>
						</>
					)}
				</div>
			</div>
		</Modal>
	);
}
