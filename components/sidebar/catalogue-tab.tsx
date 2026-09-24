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
import type { UnloadedTier } from "@/lib/services/atlasManifest";

interface CatalogueTabProps {
	/** Already filtered to the active geometry AND decoration — both splits live in the parent. */
	items: CatalogueTiling[];
	selectedKey: string | null;
	onSelect?: (t: CatalogueTiling) => void;
	/** Tiers that ship but are not loaded — passed straight through to the tree. */
	unloaded?: UnloadedTier[];
	onLoadTier?: (t: UnloadedTier) => void;
	loadingTiers?: ReadonlySet<string>;
	geometry: Geometry;
	/** Tiling count per geometry — labels the segments and disables the empty ones (unloaded shards). */
	geometryCounts: Record<Geometry, number>;
	/** Geometries whose catalogue is deferred — same reason as decorationPending. */
	geometryPending?: Partial<Record<Geometry, boolean>>;
	onGeometryChange: (g: Geometry) => void;
	decoration: Decoration;
	/** Count per decoration WITHIN the active geometry — same labelling/disabling rule as geometry. */
	decorationCounts: Record<Decoration, number>;
	/** Decorations whose catalogue is deferred and not fetched yet. Their count reads 0 but they are
	 *  NOT empty — disabling them would deadlock, since the click is what triggers the fetch. */
	decorationPending?: Partial<Record<Decoration, boolean>>;
	onDecorationChange: (d: Decoration) => void;
}

// 123727 → "123,727", 2227510 → "2.23M": a segment is ~90px wide and a seven-digit count does not fit.
const compactCount = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n.toLocaleString("en-US"));

// The Catalogue tab: two segmented toggles (geometry, then decoration — the picker's top two layers)
// pinned above the class→k thumbnail list. This component takes plain props and never touches the
// configuration store, so dragging a sidebar slider (which re-renders the Options tab) leaves the
// catalogue untouched.
export function CatalogueTab({
	items,
	selectedKey,
	onSelect,
	unloaded,
	onLoadTier,
	loadingTiers,
	geometry,
	geometryCounts,
	geometryPending,
	onGeometryChange,
	decoration,
	decorationCounts,
	decorationPending,
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
		pending?: Partial<Record<T, boolean>>,
	) => (
		<div className="ta-seg grid grid-cols-3 flex-shrink-0">
			{order.map((v) => {
				const active = value === v;
				const isPending = !!pending?.[v];
				const empty = counts[v] === 0 && !isPending;
				return (
					<button
						key={v}
						type="button"
						disabled={empty}
						aria-pressed={active}
						onClick={() => onChange(v)}
						className={cn(
							"ta-tab flex cursor-pointer flex-col items-center justify-center px-1 py-1 transition-colors",
							"focus:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-accent/50",
							active ? "text-fg" : "text-fg-muted hover:text-fg-secondary",
							empty && "opacity-50 cursor-not-allowed pointer-events-none",
						)}
					>
						<span className="text-[12.5px] font-medium leading-tight text-center text-balance">{label[v]}</span>
						{/* A deferred catalogue has no count until it is fetched; a dash keeps every segment two lines tall. */}
						<span className="font-mono text-[10.5px] leading-tight tabular-nums text-fg-muted">
							{isPending ? "–" : compactCount(counts[v])}
						</span>
					</button>
				);
			})}
		</div>
	);
	return (
		<div className="h-full flex flex-col">
			<div className="flex flex-col gap-1.5 border-y border-line-subtle px-3.5 py-3">
			{/* The SAME segmented control as the Catalogue/Options tabs above (.ta-seg / .ta-tab):
			    geometry is a second row of tabs, so it shouldn't speak a second language. */}
			<span className="ta-label">Geometry</span>
			{segments(GEOMETRY_ORDER, GEOMETRY_LABEL, geometry, geometryCounts, onGeometryChange, geometryPending)}
			{/* Decoration: the same control one level down, scoped to the active geometry. Its counts are
			    per-geometry, so entering Hyperbolic before its edge/colour shards land shows those segments
			    disabled and fills them in as the fetches resolve. */}
			<span className="ta-label mt-1.5">Decoration</span>
			{segments(DECORATION_ORDER, DECORATION_LABEL, decoration, decorationCounts, onDecorationChange, decorationPending)}
			</div>
			{/* `isolate` pins the sticky headers' z-index
			    contest (catalogue-list-panel.tsx) inside this scroller, so raising them above the tile
			    ring can never reach the canvas overlay buttons next door. */}
			<div className="ta-scroll-fade isolate flex-1 overflow-y-auto overflow-x-hidden bg-surface-chrome px-1.5 pb-6" data-sidebar-scroll>
				<CatalogueListPanel
					items={items}
					selectedKey={selectedKey}
					onSelect={onSelect}
					unloaded={unloaded}
					onLoadTier={onLoadTier}
					loadingTiers={loadingTiers}
				/>
			</div>
		</div>
	);
}
