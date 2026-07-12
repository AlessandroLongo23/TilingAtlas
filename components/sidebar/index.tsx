"use client";

import { memo } from "react";
import { PageSidebar } from "@/components/page-sidebar";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { TilingsTab } from "./tilings-tab";

interface SidebarProps {
	tilings?: CatalogueTiling[];
	selected?: CatalogueTiling | null;
	onSelect?: (t: CatalogueTiling) => void;
	/** Jump to a random tiling (wired to the sidebar button and the "R" shortcut). */
	onRandom?: () => void;
	/** Step to the previous / next tiling in list order (arrow buttons and ←/→ shortcuts). */
	onPrev?: () => void;
	onNext?: () => void;
}

// Memoized: the /play viewer holds transient state (the parametric-angle slider) in the parent, so the
// parent re-renders on every slider tick. The tiling catalogue rendered here (thousands of thumbnails)
// has none of that as input, so re-reconciling it per tick was the dominant slider-drag cost (React
// jsxDEV + reconciliation, not the canvas). memo skips it while its props are referentially stable —
// the parent keeps `tilings`/`selected` stable and passes stable useCallback handlers.
export const Sidebar = memo(function Sidebar({
	tilings = [], selected = null, onSelect, onRandom, onPrev, onNext,
}: SidebarProps) {
	return (
		<PageSidebar scrollable={false}>
			<TilingsTab
				tilings={tilings}
				selected={selected}
				onSelect={onSelect}
				onRandom={onRandom}
				onPrev={onPrev}
				onNext={onNext}
			/>
		</PageSidebar>
	);
});
