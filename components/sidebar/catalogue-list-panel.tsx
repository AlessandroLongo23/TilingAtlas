"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { SidebarSection } from "@/components/ui/sidebar-section";
import { useExpandableGroups } from "@/lib/hooks/useExpandableGroups";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { HyperbolicThumbnail } from "@/components/hyperbolic-thumbnail";
import { HyperbolicDevelopedThumbnail } from "@/components/hyperbolic-developed-thumbnail";
import { SphericalThumbnail } from "@/components/spherical-thumbnail";
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

// Scroll the sidebar so the just-selected tile is comfortably in view, then pulse it once to draw the eye
// after a jump (R / arrows / deep link). Only scrolls when it isn't already visible — respecting a top
// inset so it never lands under the sticky "Catalogue" heading, and never a jarring recenter when the tile
// was already on screen (e.g. you clicked it). Honors prefers-reduced-motion (instant scroll, no pulse).
const TOP_INSET = 48;
function revealTile(el: HTMLElement) {
	const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const behavior: ScrollBehavior = reduce ? "auto" : "smooth";
	const parent = el.closest<HTMLElement>("[data-sidebar-scroll]");
	if (parent) {
		const er = el.getBoundingClientRect();
		const pr = parent.getBoundingClientRect();
		if (er.top < pr.top + TOP_INSET) {
			parent.scrollBy({ top: er.top - pr.top - TOP_INSET, behavior });
		} else if (er.bottom > pr.bottom) {
			parent.scrollBy({ top: er.bottom - pr.bottom + 8, behavior });
		}
	} else {
		el.scrollIntoView({ block: "nearest", behavior });
	}
	if (reduce) return;
	// A one-shot accent outline that radiates and fades. Outline (not box-shadow) so it doesn't replace the
	// persistent selection ring; no fill:forwards, so it reverts to `outline: none` when done.
	el.animate(
		[
			{ outlineStyle: "solid", outlineWidth: "3px", outlineColor: "oklch(from var(--color-accent) l c h / 0.9)", outlineOffset: "2px" },
			{ outlineStyle: "solid", outlineWidth: "3px", outlineColor: "oklch(from var(--color-accent) l c h / 0)", outlineOffset: "7px" },
		],
		{ duration: 650, easing: "ease-out" },
	);
}

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
	const { expanded, toggle, openGroups } = useExpandableGroups(nodeIds, (id) => id, defaultOpenById);

	// The node ids (class + k) that hold the selected tiling — used to auto-open its sections on selection.
	const selectedTile = useMemo(
		() => (selectedKey ? items.find((t) => t.canonicalKey === selectedKey) ?? null : null),
		[items, selectedKey],
	);
	const selectedClassId = selectedTile ? `c:${tileClassOf(selectedTile)}` : null;
	const selectedKId = selectedTile ? `k:${tileClassOf(selectedTile)}:${selectedTile.k}` : null;

	// Reveal the current tiling in the picker on every selection change. A collapsed section unmounts its
	// thumbnails, so both the class and its k row must open before the tile exists to scroll to; wait out the
	// expand animation (0.15s, sidebar-section.tsx) + remount, then scroll it into view and pulse it. The ref
	// below is attached only to the selected button, so it points at the right tile once mounted.
	const selectedBtnRef = useRef<HTMLButtonElement | null>(null);
	useEffect(() => {
		if (!selectedClassId || !selectedKId) return;
		openGroups([selectedClassId, selectedKId]);
		const id = window.setTimeout(() => {
			if (selectedBtnRef.current) revealTile(selectedBtnRef.current);
		}, 170);
		return () => window.clearTimeout(id);
	}, [selectedKey, selectedClassId, selectedKId, openGroups]);

	// The k-bucket accordions for one class group — the inner tree shared by both layouts below.
	const renderKGroups = (g: (typeof byClass)[number]) =>
		g.ks.map((kk) => (
			<SidebarSection
				key={`k:${g.cls}:${kk.k}`}
				flush
				padded={false}
				title={`k = ${kk.k}`}
				summary={kk.list.length}
				open={expanded[`k:${g.cls}:${kk.k}`]}
				onOpenChange={() => toggle(`k:${g.cls}:${kk.k}`)}
			>
				<div className="grid grid-cols-2 gap-2 p-1.5 pt-2">
					{kk.list.map((t) => (
						<button
							key={t.canonicalKey}
							ref={t.canonicalKey === selectedKey ? selectedBtnRef : null}
							type="button"
							onClick={() => onSelect?.(t)}
							title={`${t.canonicalKey} · {${t.family}}`}
							className={cn(
								"relative flex flex-col rounded-lg border bg-surface-overlay/30 hover:border-line-strong transition-colors overflow-hidden cursor-pointer",
								// Selected: a high-contrast fg ring held off the tile by a surface-chrome gap
								// (ring-offset) so it reads clearly on any tiling. fg (not a fixed black) keeps it
								// visible in both themes: near-black in light, near-white in dark — a fixed black
								// would vanish against the dark chrome panel in dark mode.
								t.canonicalKey === selectedKey
									? "border-fg ring-2 ring-fg ring-offset-2 ring-offset-surface-chrome"
									: "border-line",
							)}
						>
							<div className="relative aspect-square bg-surface-raised">
								{t.spherical ? (
									<SphericalThumbnail solidId={t.spherical.solid} />
								) : t.developed ? (
									<HyperbolicDevelopedThumbnail patch={t.developed.patch} />
								) : t.wythoff ? (
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
		));

	return (
		<div className="flex flex-col gap-2">
			<div className="p-3 flex flex-col gap-2">
				{/* When the geometry filter leaves a single tile class (every hyperbolic/spherical tiling shares
				    one class), drop the redundant class accordion and show its k-buckets straight under the
				    geometry toggle — the geometry IS the top layer here, so a lone "Hyperbolic ▸" wrapper would
				    just be a second identical layer. The multi-class Euclidean list keeps the class → k tree. */}
				{byClass.length === 1
					? renderKGroups(byClass[0])
					: byClass.map((g) => (
							<SidebarSection
								key={`c:${g.cls}`}
								title={TILE_CLASS_LABEL[g.cls].long}
								summary={g.count}
								open={expanded[`c:${g.cls}`]}
								onOpenChange={() => toggle(`c:${g.cls}`)}
							>
								<div className="flex flex-col gap-2 pt-2">{renderKGroups(g)}</div>
							</SidebarSection>
						))}
			</div>
		</div>
	);
});
