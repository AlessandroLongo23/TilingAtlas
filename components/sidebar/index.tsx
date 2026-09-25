"use client";

import { memo, useCallback } from "react";
import { ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import { PageSidebar } from "@/components/page-sidebar";
import { Button } from "@/components/ui/button";
import { showPickOnCanvas } from "@/components/dock-peek";
import type { Geometry, Decoration } from "@/lib/services/referenceAtlas";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import type { UnloadedTier } from "@/lib/services/atlasManifest";
import { NavHeader } from "./nav-header";
import { TilingsTab } from "./tilings-tab";

interface SidebarProps {
	selected?: CatalogueTiling | null;
	onSelect?: (t: CatalogueTiling) => void;
	unloaded?: UnloadedTier[];
	onLoadTier?: (t: UnloadedTier) => void;
	loadingTiers?: ReadonlySet<string>;
	/** Active geometry — the catalogue's top-level split; also scopes random/prev/next. */
	geometry: Geometry;
	/** The active (geometry, decoration) cell's tilings (catalogue list + nav count). */
	geometryList: CatalogueTiling[];
	geometryCounts: Record<Geometry, number>;
	geometryPending?: Partial<Record<Geometry, boolean>>;
	onGeometryChange: (g: Geometry) => void;
	/** Active decoration — the split below geometry (Tilings / Edge patterns / Colorings); scopes browsing too. */
	decoration: Decoration;
	/** Counts WITHIN the active geometry, so an unloaded shard reads as a disabled segment. */
	decorationCounts: Record<Decoration, number>;
	decorationPending?: Partial<Record<Decoration, boolean>>;
	onDecorationChange: (d: Decoration) => void;
	/** Catalogue stepping, the same three actions the canvas toolbar carries. Phone only: they sit in the
	 *  dock's peek row, so the commonest action on the page works without opening the sheet. */
	onPrev?: () => void;
	onRandom?: () => void;
	onNext?: () => void;
	/** False while stepping is blocked (the editor is open), which hides the three buttons. */
	canStep?: boolean;
}

// Memoized: the /play viewer holds transient state (the parametric-angle slider) in the parent, so the
// parent re-renders on every slider tick. The tiling catalogue rendered here (thousands of thumbnails)
// has none of that as input, so re-reconciling it per tick was the dominant slider-drag cost (React
// jsxDEV + reconciliation, not the canvas). memo skips it while its props are referentially stable —
// the parent keeps `geometryList`/`geometryCounts`/`selected` stable and passes stable useCallback handlers.
export const Sidebar = memo(function Sidebar({
	selected = null,
	onSelect,
	unloaded,
	onLoadTier,
	loadingTiers,
	geometry,
	geometryList,
	geometryCounts,
	geometryPending,
	onGeometryChange,
	decoration,
	decorationCounts,
	decorationPending,
	onDecorationChange,
	onPrev,
	onRandom,
	onNext,
	canStep = true,
}: SidebarProps) {
	const stepDisabled = geometryList.length < 2;
	// On a phone a pick at full snap drops the sheet to half and brings the tapped tile back into view.
	const pick = useCallback(
		(t: CatalogueTiling) => {
			onSelect?.(t);
			showPickOnCanvas(`aside [data-tiling-key="${CSS.escape(t.canonicalKey)}"]`);
		},
		[onSelect],
	);
	// The phone dock's header row: the sidebar's own header (what is on the canvas), which the tabs hide
	// on a phone since this row stays in view at every snap, and the three ways to step off it.
	const peek = (
		<>
			<div className="min-w-0 flex-1">
				<NavHeader selected={selected} />
			</div>
			{canStep ? (
				<div className="flex shrink-0 items-center gap-1">
					<Button variant="ghost" size="icon" icon={ChevronLeft} aria-label="Previous tiling" onClick={onPrev} disabled={stepDisabled} />
					<Button variant="primary" size="icon" icon={Shuffle} aria-label="Random tiling" onClick={onRandom} disabled={stepDisabled} />
					<Button variant="ghost" size="icon" icon={ChevronRight} aria-label="Next tiling" onClick={onNext} disabled={stepDisabled} />
				</div>
			) : null}
		</>
	);
	return (
		<PageSidebar scrollable={false} mobile="dock" title="Tilings" peek={peek} halfHeight="60dvh">
			<TilingsTab
				selected={selected}
				onSelect={pick}
				unloaded={unloaded}
				onLoadTier={onLoadTier}
				loadingTiers={loadingTiers}
				geometry={geometry}
				geometryList={geometryList}
				geometryCounts={geometryCounts}
				geometryPending={geometryPending}
				onGeometryChange={onGeometryChange}
				decoration={decoration}
				decorationCounts={decorationCounts}
				decorationPending={decorationPending}
				onDecorationChange={onDecorationChange}
			/>
		</PageSidebar>
	);
});
