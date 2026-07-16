"use client";

import { memo, useMemo } from "react";
import { SidebarSection } from "@/components/ui/sidebar-section";
import { SectionHeading } from "@/components/ui/section-heading";
import { useExpandableGroups } from "@/lib/hooks/useExpandableGroups";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { HyperbolicThumbnail } from "@/components/hyperbolic-thumbnail";
import { tileClassOf, TILE_CLASS_ORDER, TILE_CLASS_LABEL, type TileClass } from "@/lib/services/referenceAtlas";
import { cn } from "@/lib/utils/cn";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import type { CatalogueTiling } from "@/lib/services/catalogueService";

// The /play picker: tilings nested by polygon class (regular / star / convex / isotoxal) then by k, each a
// thumbnail + badge. Click selects (renders large on the canvas)
interface CatalogueListPanelProps {
	items: CatalogueTiling[];
	selectedKey: string | null;
	onSelect?: (t: CatalogueTiling) => void;
}

// Initial expand state: top-level class categories (`c:…`) start collapsed so the picker opens as a short
// list of headings; their k-subsections (`k:…`) start open so unrolling a class reveals its thumbnails
// straight away rather than another layer of closed rows.
const defaultOpenById = (id: string) => id.startsWith("k:");

// Class order + labels come from the shared registry (referenceAtlas TILE_CLASS_ORDER / TILE_CLASS_LABEL),
// the same source /library uses — so a new class appears here automatically. A class section only appears
// when it has tilings.

// Memoized: the catalogue's inputs (items/selectedKey/onSelect) don't change while a sidebar
// slider is dragged, but its parent TilingsTab subscribes to the WHOLE config store, so it re-renders on
// every slider tick. Without memo, that re-rendered this whole thumbnail list (each a canvas) every tick
// — the dominant cost of dragging the Islamic-angle / rotation / line-stroke sliders. memo skips it while
// its props are referentially stable.
export const CatalogueListPanel = memo(function CatalogueListPanel({ items, selectedKey, onSelect }: CatalogueListPanelProps) {
	// Two-level grouping: class → k. Each class keeps its k-buckets sorted ascending.
	const byClass = useMemo(() => {
		const map = new Map<TileClass, Map<number, CatalogueTiling[]>>();
		for (const t of items) {
			const cls = tileClassOf(t);
			if (!map.has(cls)) map.set(cls, new Map());
			const kMap = map.get(cls)!;
			if (!kMap.has(t.k)) kMap.set(t.k, []);
			kMap.get(t.k)!.push(t);
		}
		return TILE_CLASS_ORDER.filter((c) => map.has(c)).map((cls) => {
			const kMap = map.get(cls)!;
			const ks = Array.from(kMap.entries())
				.sort(([a], [b]) => a - b)
				.map(([k, list]) => ({ k, list }));
			const count = ks.reduce((s, g) => s + g.list.length, 0);
			return { cls, count, ks };
		});
	}, [items]);

	// One flat expand-state set over every node id (class rows and their k rows).
	const nodeIds = useMemo(() => {
		const ids: string[] = [];
		for (const g of byClass) {
			ids.push(`c:${g.cls}`);
			for (const kk of g.ks) ids.push(`k:${g.cls}:${kk.k}`);
		}
		return ids;
	}, [byClass]);
	const { expanded, toggle } = useExpandableGroups(nodeIds, (id) => id, defaultOpenById);

	return (
		<div className="flex flex-col gap-2">
			<div className="sticky top-0 z-10 p-3 bg-surface-overlay">
				<SectionHeading count={items.length}>Catalogue</SectionHeading>
			</div>
			<div className="p-3 flex flex-col gap-2">
				{byClass.map((g) => (
					<SidebarSection
						key={`c:${g.cls}`}
						title={TILE_CLASS_LABEL[g.cls].long}
						summary={g.count}
						open={expanded[`c:${g.cls}`]}
						onOpenChange={() => toggle(`c:${g.cls}`)}
					>
						<div className="flex flex-col gap-2 pt-2">
							{g.ks.map((kk) => (
								<SidebarSection
									key={`k:${g.cls}:${kk.k}`}
									flush
									padded={false}
									title={`k = ${kk.k}`}
									summary={kk.list.length}
									open={expanded[`k:${g.cls}:${kk.k}`]}
									onOpenChange={() => toggle(`k:${g.cls}:${kk.k}`)}
								>
									<div className="grid grid-cols-2 gap-2 pt-2">
										{kk.list.map((t) => (
											<button
												key={t.canonicalKey}
												type="button"
												onClick={() => onSelect?.(t)}
												title={`${t.canonicalKey} · {${t.family}}`}
												className={cn(
													"relative flex flex-col rounded-lg border bg-surface-overlay/30 hover:border-line-strong transition-colors overflow-hidden cursor-pointer",
													t.canonicalKey === selectedKey ? "border-accent ring-1 ring-accent/40" : "border-line",
												)}
											>
												<div className="relative aspect-square bg-surface-raised">
													{t.wythoff ? (
														<HyperbolicThumbnail wythoff={t.wythoff} />
													) : t.renderCell ? (
														<TilingThumbnail translationalCell={t.renderCell as TranslationalCellData} pxPerEdge={14} />
													) : null}
													{t.paramCell ? (
														<span
															title="One-parameter family (adjustable α)"
															className="absolute top-1 left-1 inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold leading-none bg-white text-black ring-1 ring-black/20 shadow-sm dark:bg-black dark:text-white dark:ring-white/20"
														>
															α
														</span>
													) : null}
												</div>
											</button>
										))}
									</div>
								</SidebarSection>
							))}
						</div>
					</SidebarSection>
				))}
			</div>
		</div>
	);
});
