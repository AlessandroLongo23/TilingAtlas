"use client";

import { useEffect, useState } from "react";
import { isTypingTarget } from "@/lib/hooks/useKeyShortcuts";
import { Tabs } from "@/components/ui/tabs";
import type { Geometry, Decoration } from "@/lib/services/referenceAtlas";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import type { UnloadedTier } from "@/lib/services/atlasManifest";
import { NavHeader } from "./nav-header";
import { CatalogueTab } from "./catalogue-tab";
import { OptionsTab } from "./options-tab";

// The /play sidebar composition: a persistent header naming the tiling on the canvas, over a
// Catalogue/Options tab pair. Both panels stay mounted (keepMounted) so switching tabs never rebuilds
// the catalogue's thumbnail canvases, and each keeps its own scroll position. Geometry is the
// catalogue's top-level split, owned by the parent (it scopes random/step too) and threaded through.
interface TilingsTabProps {
	selected: CatalogueTiling | null;
	onSelect?: (t: CatalogueTiling) => void;
	unloaded?: UnloadedTier[];
	onLoadTier?: (t: UnloadedTier) => void;
	loadingTiers?: ReadonlySet<string>;
	geometry: Geometry;
	/** The active (geometry, decoration) cell — feeds the catalogue list and the nav count. */
	geometryList: CatalogueTiling[];
	geometryCounts: Record<Geometry, number>;
	geometryPending?: Partial<Record<Geometry, boolean>>;
	onGeometryChange: (g: Geometry) => void;
	decoration: Decoration;
	decorationCounts: Record<Decoration, number>;
	/** Deferred decoration catalogues — see CatalogueTab.decorationPending. */
	decorationPending?: Partial<Record<Decoration, boolean>>;
	onDecorationChange: (d: Decoration) => void;
}

const TABS = ["Catalogue", "View options"];
// Bare-key shortcuts that jump straight to a tab, shown as a keycap on each trigger. C = Catalogue,
// V = View options (V freed from the Inversive toggle, which moved to X; C freed by hiding Circle Packing).
const TAB_SHORTCUTS: Record<string, string> = { [TABS[0]]: "C", [TABS[1]]: "V" };

export function TilingsTab({
	selected,
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
}: TilingsTabProps) {
	const [tab, setTab] = useState(TABS[0]);
	// C / V jump to a tab, matching the keycaps on the triggers. Same guards as the /play canvas
	// shortcuts (skip modifier chords and typing targets) so they don't fire mid-text-entry. Tab state
	// is local to this component, so the listener lives here, not in the canvas keydown handler.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (isTypingTarget(e)) return;
			const k = e.key.toLowerCase();
			if (k === "c") {
				e.preventDefault();
				setTab(TABS[0]);
			} else if (k === "v") {
				e.preventDefault();
				setTab(TABS[1]);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
	return (
		<div className="h-full flex flex-col">
			{/* On a phone the dock's peek row is this header, in view at every snap. */}
			<div className="px-3.5 pt-3.5 pb-3 max-md:hidden">
				<NavHeader selected={selected} />
			</div>
			<div className="flex-1 min-h-0">
				<Tabs value={tab} onValueChange={setTab} tabs={TABS} shortcuts={TAB_SHORTCUTS} keepMounted listClassName="mx-3.5 mb-3 max-md:mb-2">
					{(t) =>
						t === "Catalogue" ? (
							<CatalogueTab
								items={geometryList}
								selectedKey={selected?.canonicalKey ?? null}
								onSelect={onSelect}
								unloaded={unloaded}
								onLoadTier={onLoadTier}
								loadingTiers={loadingTiers}
								geometry={geometry}
								geometryCounts={geometryCounts}
								geometryPending={geometryPending}
								onGeometryChange={onGeometryChange}
								decoration={decoration}
								decorationCounts={decorationCounts}
								decorationPending={decorationPending}
								onDecorationChange={onDecorationChange}
							/>
						) : (
							<OptionsTab selected={selected} />
						)
					}
				</Tabs>
			</div>
		</div>
	);
}
