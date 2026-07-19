"use client";

import { memo } from "react";
import { PageSidebar } from "@/components/page-sidebar";
import type { Geometry } from "@/lib/services/referenceAtlas";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { TilingsTab } from "./tilings-tab";

interface SidebarProps {
	selected?: CatalogueTiling | null;
	onSelect?: (t: CatalogueTiling) => void;
	/** Jump to a random tiling in the active geometry (wired to the sidebar button and the "R" shortcut). */
	onRandom?: () => void;
	/** Step to the previous / next tiling in list order (arrow buttons and ←/→ shortcuts). */
	onPrev?: () => void;
	onNext?: () => void;
	/** Active geometry — the catalogue's top-level split; also scopes random/prev/next. */
	geometry: Geometry;
	/** The active geometry's tilings (catalogue list + nav count). */
	geometryList: CatalogueTiling[];
	geometryCounts: Record<Geometry, number>;
	onGeometryChange: (g: Geometry) => void;
}

// Memoized: the /play viewer holds transient state (the parametric-angle slider) in the parent, so the
// parent re-renders on every slider tick. The tiling catalogue rendered here (thousands of thumbnails)
// has none of that as input, so re-reconciling it per tick was the dominant slider-drag cost (React
// jsxDEV + reconciliation, not the canvas). memo skips it while its props are referentially stable —
// the parent keeps `geometryList`/`geometryCounts`/`selected` stable and passes stable useCallback handlers.
export const Sidebar = memo(function Sidebar({
	selected = null,
	onSelect,
	onRandom,
	onPrev,
	onNext,
	geometry,
	geometryList,
	geometryCounts,
	onGeometryChange,
}: SidebarProps) {
	return (
		<PageSidebar scrollable={false}>
			<TilingsTab
				selected={selected}
				onSelect={onSelect}
				onRandom={onRandom}
				onPrev={onPrev}
				onNext={onNext}
				geometry={geometry}
				geometryList={geometryList}
				geometryCounts={geometryCounts}
				onGeometryChange={onGeometryChange}
			/>
		</PageSidebar>
	);
});
