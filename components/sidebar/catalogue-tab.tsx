"use client";

import { cn } from "@/lib/utils/cn";
import {
	GEOMETRY_ORDER,
	GEOMETRY_LABEL,
	DECORATION_ORDER,
	DECORATION_LABEL,
	type Geometry,
	type Decoration,
} from "@/lib/services/referenceAtlas";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { CatalogueListPanel } from "./catalogue-list-panel";

interface CatalogueTabProps {
	/** Already filtered to the active geometry AND decoration — both splits live in the parent. */
	items: CatalogueTiling[];
	selectedKey: string | null;
	onSelect?: (t: CatalogueTiling) => void;
	geometry: Geometry;
	/** Tiling count per geometry — labels the segments and disables the empty ones (unloaded shards). */
	geometryCounts: Record<Geometry, number>;
	onGeometryChange: (g: Geometry) => void;
	decoration: Decoration;
	/** Count per decoration WITHIN the active geometry — same labelling/disabling rule as geometry. */
	decorationCounts: Record<Decoration, number>;
	onDecorationChange: (d: Decoration) => void;
}

// The Catalogue tab: two segmented toggles (geometry, then decoration — the picker's top two layers)
// pinned above the class→k thumbnail list. This component takes plain props and never touches the
// configuration store, so dragging a sidebar slider (which re-renders the Options tab) leaves the
// catalogue untouched.
export function CatalogueTab({
	items,
	selectedKey,
	onSelect,
	geometry,
	geometryCounts,
	onGeometryChange,
	decoration,
	decorationCounts,
	onDecorationChange,
}: CatalogueTabProps) {
	// Both rows are the same control at different altitudes, so they share one renderer — a second
	// hand-rolled copy is how the two would drift apart.
	const segments = <T extends string>(
		order: readonly T[],
		label: Record<T, string>,
		value: T,
		counts: Record<T, number>,
		onChange: (v: T) => void,
	) => (
		<div className="grid grid-cols-3 gap-px flex-shrink-0">
			{order.map((v) => {
				const active = value === v;
				const empty = counts[v] === 0;
				return (
					<button
						key={v}
						type="button"
						disabled={empty}
						aria-pressed={active}
						onClick={() => onChange(v)}
						className={cn(
							"ta-tab ta-wall-cell flex cursor-pointer flex-col items-center justify-center px-1 py-2 transition-colors",
							"focus:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-fg",
							active ? "text-fg" : "text-fg-muted hover:text-fg-secondary",
							empty && "opacity-50 cursor-not-allowed pointer-events-none",
						)}
					>
						<span className="text-xs font-medium leading-tight text-center text-balance">{label[v]}</span>
						<span className={cn("text-[10px] leading-tight tabular-nums", active ? "text-fg-secondary" : "text-fg-muted")}>
							{counts[v]}
						</span>
					</button>
				);
			})}
		</div>
	);
	return (
		<div className="h-full flex flex-col gap-px">
			{/* Three segments, edge to edge — and the SAME grammar as the Catalogue/Options tabs above
			    (ta-tab: idle cells filled with the line colour, the active one with the panel colour).
			    Geometry is a second row of tabs, so it shouldn't speak a second language. */}
			{segments(GEOMETRY_ORDER, GEOMETRY_LABEL, geometry, geometryCounts, onGeometryChange)}
			{/* Decoration: the same control one level down, scoped to the active geometry. Its counts are
			    per-geometry, so entering Hyperbolic before its edge/colour shards land shows those segments
			    disabled and fills them in as the fetches resolve. */}
			{segments(DECORATION_ORDER, DECORATION_LABEL, decoration, decorationCounts, onDecorationChange)}
			{/* Opaque: the wall's line colour lives on an ancestor, so a transparent scroll region
			    would show it wherever the list runs out. `isolate` pins the sticky headers' z-index
			    contest (catalogue-list-panel.tsx) inside this scroller, so raising them above the tile
			    ring can never reach the canvas overlay buttons next door. */}
			<div className="isolate flex-1 overflow-y-auto bg-surface-chrome" data-sidebar-scroll>
				<CatalogueListPanel items={items} selectedKey={selectedKey} onSelect={onSelect} />
			</div>
		</div>
	);
}
