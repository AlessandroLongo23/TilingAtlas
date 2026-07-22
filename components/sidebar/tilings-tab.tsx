"use client";

import { useEffect, useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import type { Geometry } from "@/lib/services/referenceAtlas";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { NavHeader } from "./nav-header";
import { CatalogueTab } from "./catalogue-tab";
import { OptionsTab } from "./options-tab";

// The /play sidebar composition: a persistent nav header (metadata + prev/random/next) over a
// Catalogue/Options tab pair. Both panels stay mounted (keepMounted) so switching tabs never rebuilds
// the catalogue's thumbnail canvases, and each keeps its own scroll position. Geometry is the
// catalogue's top-level split, owned by the parent (it scopes random/step too) and threaded through.
interface TilingsTabProps {
	selected: CatalogueTiling | null;
	onSelect?: (t: CatalogueTiling) => void;
	onRandom?: () => void;
	onPrev?: () => void;
	onNext?: () => void;
	geometry: Geometry;
	/** The active geometry's tilings — feeds the catalogue list and the nav count. */
	geometryList: CatalogueTiling[];
	geometryCounts: Record<Geometry, number>;
	onGeometryChange: (g: Geometry) => void;
}

const TABS = ["Catalogue", "View options"];
// Bare-key shortcuts that jump straight to a tab, shown as a keycap on each trigger. C = Catalogue,
// V = View options (V freed from the Inversive toggle, which moved to X; C freed by hiding Circle Packing).
const TAB_SHORTCUTS: Record<string, string> = { [TABS[0]]: "C", [TABS[1]]: "V" };

export function TilingsTab({
	selected,
	onSelect,
	onRandom,
	onPrev,
	onNext,
	geometry,
	geometryList,
	geometryCounts,
	onGeometryChange,
}: TilingsTabProps) {
	const [tab, setTab] = useState(TABS[0]);
	// C / V jump to a tab, matching the keycaps on the triggers. Same guards as the /play canvas
	// shortcuts (skip modifier chords and typing targets) so they don't fire mid-text-entry. Tab state
	// is local to this component, so the listener lives here rather than in the canvas keydown handler.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			const el = e.target as HTMLElement | null;
			if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
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
		// The sidebar is one wall: this container paints the line colour and every row below is an
		// opaque cell, so the 1px gaps between them are the only rules in the panel — and where a
		// vertical gap crosses a horizontal one, four rounded corners open the little diamond.
		<div className="ta-wall ta-wall-dense h-full flex flex-col gap-px">
			<NavHeader selected={selected} count={geometryList.length} onRandom={onRandom} onPrev={onPrev} onNext={onNext} />
			<div className="flex-1 min-h-0">
				<Tabs value={tab} onValueChange={setTab} tabs={TABS} shortcuts={TAB_SHORTCUTS} keepMounted>
					{(t) =>
						t === "Catalogue" ? (
							<CatalogueTab
								items={geometryList}
								selectedKey={selected?.canonicalKey ?? null}
								onSelect={onSelect}
								geometry={geometry}
								geometryCounts={geometryCounts}
								onGeometryChange={onGeometryChange}
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
