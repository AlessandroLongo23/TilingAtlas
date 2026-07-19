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
		<div className="h-full flex flex-col">
			<div className="p-3 flex-shrink-0 border-b border-line bg-surface-overlay/40">
				<div className="grid grid-cols-3 gap-2">
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
									"flex cursor-pointer flex-col items-center justify-center rounded-control border px-1 py-1.5 transition-colors",
									active
										? "bg-accent text-accent-contrast border-transparent"
										: "bg-surface-overlay/40 text-fg-secondary border-line hover:border-line-strong hover:text-fg",
									empty && "opacity-50 cursor-not-allowed pointer-events-none",
								)}
							>
								<span className="text-xs font-medium leading-tight">{GEOMETRY_LABEL[g]}</span>
								<span className={cn("text-[10px] leading-tight", active ? "text-accent-contrast/70" : "text-fg-muted")}>
									{geometryCounts[g]}
								</span>
							</button>
						);
					})}
				</div>
			</div>
			<div className="flex-1 overflow-y-auto" data-sidebar-scroll>
				<CatalogueListPanel items={items} selectedKey={selectedKey} onSelect={onSelect} />
			</div>
		</div>
	);
}
