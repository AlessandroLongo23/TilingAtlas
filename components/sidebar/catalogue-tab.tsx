"use client";

import { cn } from "@/lib/utils/cn";
import { GEOMETRY_ORDER, GEOMETRY_LABEL, type Geometry } from "@/lib/services/referenceAtlas";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { CatalogueListPanel } from "./catalogue-list-panel";

interface CatalogueTabProps {
	/** Already filtered to the active geometry — the catalogue's top-level split lives in the parent. */
	items: CatalogueTiling[];
	selectedKey: string | null;
	onSelect?: (t: CatalogueTiling) => void;
	geometry: Geometry;
	/** Tiling count per geometry — labels the segments and disables the empty ones (unloaded shards). */
	geometryCounts: Record<Geometry, number>;
	onGeometryChange: (g: Geometry) => void;
}

// The Catalogue tab: a geometry segmented toggle (the top layer of the picker) pinned above the
// class→k thumbnail list. This component takes plain props and never touches the configuration store,
// so dragging a sidebar slider (which re-renders the Options tab) leaves the catalogue untouched.
export function CatalogueTab({ items, selectedKey, onSelect, geometry, geometryCounts, onGeometryChange }: CatalogueTabProps) {
	return (
		<div className="h-full flex flex-col gap-px">
			{/* Three segments, edge to edge — and the SAME grammar as the Catalogue/Options tabs above
			    (ta-tab: idle cells filled with the line colour, the active one with the panel colour).
			    Geometry is a second row of tabs, so it shouldn't speak a second language. */}
			<div className="grid grid-cols-3 gap-px flex-shrink-0">
				{GEOMETRY_ORDER.map((g) => {
					const active = geometry === g;
					const empty = geometryCounts[g] === 0;
					return (
						<button
							key={g}
							type="button"
							disabled={empty}
							aria-pressed={active}
							onClick={() => onGeometryChange(g)}
							className={cn(
								"ta-tab ta-wall-cell flex cursor-pointer flex-col items-center justify-center px-1 py-2 transition-colors",
								"focus:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-fg",
								active ? "text-fg" : "text-fg-muted hover:text-fg-secondary",
								empty && "opacity-50 cursor-not-allowed pointer-events-none",
							)}
						>
							<span className="text-xs font-medium leading-tight">{GEOMETRY_LABEL[g]}</span>
							<span className={cn("text-[10px] leading-tight tabular-nums", active ? "text-fg-secondary" : "text-fg-muted")}>
								{geometryCounts[g]}
							</span>
						</button>
					);
				})}
			</div>
			{/* Opaque: the wall's line colour lives on an ancestor, so a transparent scroll region
			    would show it wherever the list runs out. */}
			<div className="flex-1 overflow-y-auto bg-surface-chrome" data-sidebar-scroll>
				<CatalogueListPanel items={items} selectedKey={selectedKey} onSelect={onSelect} />
			</div>
		</div>
	);
}
