"use client";

import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useExpandableGroups } from "@/lib/hooks/useExpandableGroups";
import { tileClassOf, TILE_CLASS_ORDER, TILE_CLASS_LABEL, type TileClass } from "@/lib/services/referenceAtlas";
import { gridOf, type FreedrawGrid } from "@/lib/freedraw/pattern";
import { cn } from "@/lib/utils/cn";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { TileGrid } from "./tile-grid";

// The /play picker: tilings nested by polygon class (regular / star / convex / isotoxal) then by k, each a
// thumbnail + badge. Click selects (renders large on the canvas)
interface CatalogueListPanelProps {
	items: CatalogueTiling[];
	selectedKey: string | null;
	onSelect?: (t: CatalogueTiling) => void;
}

// Initial expand state: top-level class categories (`c:…`) start collapsed so the picker opens as a short
// list of headings; their grid subsections (`s:…`, freedraw only) and k-subsections (`k:…`) start open so
// unrolling a class reveals its thumbnails straight away rather than another layer of closed rows.
const defaultOpenById = (id: string) => id.startsWith("k:") || id.startsWith("s:");

// Row height for both header levels; the nested one parks one hairline below the outer one so an open
// path reads as an indented tree pinned to the top of the scrollport.
const ROW_H = 36;
const NESTED_TOP = ROW_H + 1;

// Class order + labels come from the shared registry (referenceAtlas TILE_CLASS_ORDER / TILE_CLASS_LABEL),
// the same source /library uses — so a new class appears here automatically. A class section only appears
// when it has tilings.

// The freedraw class alone carries an extra layer between class and k: WHICH GRID the edge subset
// decorates. sub = "" is the spine every other class uses (no row rendered for it).
const SUB_LABEL: Record<string, string> = {
	square: "Square grid",
	triangle: "Triangle grid",
	ts: "Triangle + square grid",
};
const SUB_ORDER = ["", "square", "triangle", "ts"];
const subOf = (t: CatalogueTiling): string =>
	t.freedraw ? (gridOf(t.freedraw) as FreedrawGrid) : "";

// Memoized: the catalogue's inputs (items/selectedKey/onSelect) don't change while a sidebar
// slider is dragged, but its parent TilingsTab subscribes to the WHOLE config store, so it re-renders on
// every slider tick. Without memo, that re-rendered this whole thumbnail list (each a canvas) every tick
// — the dominant cost of dragging the Islamic-angle / rotation / line-stroke sliders. memo skips it while
// its props are referentially stable.
export const CatalogueListPanel = memo(function CatalogueListPanel({ items, selectedKey, onSelect }: CatalogueListPanelProps) {
	// Three-level grouping: class → grid sub-level (freedraw only; one anonymous sub otherwise) → k.
	const byClass = useMemo(() => {
		const map = new Map<TileClass, Map<string, Map<number, CatalogueTiling[]>>>();
		for (const t of items) {
			const cls = tileClassOf(t);
			if (!map.has(cls)) map.set(cls, new Map());
			const subMap = map.get(cls)!;
			const sub = subOf(t);
			if (!subMap.has(sub)) subMap.set(sub, new Map());
			const kMap = subMap.get(sub)!;
			if (!kMap.has(t.k)) kMap.set(t.k, []);
			kMap.get(t.k)!.push(t);
		}
		return TILE_CLASS_ORDER.filter((c) => map.has(c)).map((cls) => {
			const subMap = map.get(cls)!;
			const subs = SUB_ORDER.filter((s) => subMap.has(s)).map((sub) => {
				const kMap = subMap.get(sub)!;
				const ks = Array.from(kMap.entries())
					.sort(([a], [b]) => a - b)
					.map(([k, list]) => ({ k, list }));
				return { sub, ks, count: ks.reduce((s2, g) => s2 + g.list.length, 0) };
			});
			return { cls, subs, count: subs.reduce((s2, g) => s2 + g.count, 0) };
		});
	}, [items]);

	// One flat expand-state set over every node id (class rows, grid rows, and their k rows).
	const nodeIds = useMemo(() => {
		const ids: string[] = [];
		for (const g of byClass) {
			ids.push(`c:${g.cls}`);
			for (const s of g.subs) {
				if (s.sub) ids.push(`s:${g.cls}:${s.sub}`);
				for (const kk of s.ks) ids.push(`k:${g.cls}:${s.sub}:${kk.k}`);
			}
		}
		return ids;
	}, [byClass]);
	const { expanded, toggle, openGroups } = useExpandableGroups(nodeIds, (id) => id, defaultOpenById);

	// One width for every bucket. Measured here rather than per grid so that a single commit gives
	// them ALL their real heights: a scroll target computed while some buckets were still zero-height
	// lands somewhere else entirely once they settle.
	const listRef = useRef<HTMLDivElement | null>(null);
	const [width, setWidth] = useState(0);
	useLayoutEffect(() => {
		const el = listRef.current;
		if (!el) return;
		setWidth(el.getBoundingClientRect().width);
		const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	// The node ids (class + grid + k) that hold the selected tiling — used to auto-open its sections.
	const selectedTile = useMemo(
		() => (selectedKey ? items.find((t) => t.canonicalKey === selectedKey) ?? null : null),
		[items, selectedKey],
	);
	const selectedClassId = selectedTile ? `c:${tileClassOf(selectedTile)}` : null;
	const selectedSubId =
		selectedTile && subOf(selectedTile) ? `s:${tileClassOf(selectedTile)}:${subOf(selectedTile)}` : null;
	const selectedKId = selectedTile
		? `k:${tileClassOf(selectedTile)}:${subOf(selectedTile)}:${selectedTile.k}`
		: null;

	// Open the path to the current tiling on every selection change; the bucket's TileGrid handles the
	// scroll and the pulse itself (with the tiles virtualised, the target row may not be mounted yet, so
	// there is no element to scroll to — only a row index).
	useEffect(() => {
		if (!selectedClassId || !selectedKId) return;
		openGroups(selectedSubId ? [selectedClassId, selectedSubId, selectedKId] : [selectedClassId, selectedKId]);
	}, [selectedKey, selectedClassId, selectedSubId, selectedKId, openGroups]);

	// When the geometry filter leaves a single tile class (every hyperbolic/spherical tiling shares one),
	// drop the redundant class level and pin the k rows at the top instead — the geometry IS the top layer
	// there, so a lone "Hyperbolic ▸" wrapper would just be a second identical one.
	const single = byClass.length === 1;

	const kSections = (cls: TileClass, sub: string, ks: { k: number; list: CatalogueTiling[] }[], depth: 0 | 1 | 2) =>
		ks.map((kk) => {
			const id = `k:${cls}:${sub}:${kk.k}`;
			const open = expanded[id];
			// Freedraw shares the k axis but not its meaning: there k counts GRID-POINT orbits of the
			// decoration, not vertex orbits of a tiling. Say so on the row rather than letting a bare "k = 2"
			// imply the two are the same quantity.
			const kLabel = cls === "freedraw" ? `k = ${kk.k} grid points` : `k = ${kk.k}`;
			return (
				// The wrapper is what bounds the sticky header: pinned while its own bucket is on screen,
				// pushed off by the next one. Transparent, so the wall's line colour still fills its gaps.
				<div key={id} className="flex flex-col gap-px">
					<TreeRow
						label={kLabel}
						count={kk.list.length}
						open={open}
						depth={depth}
						onToggle={() => toggle(id)}
					/>
					{open ? (
						<TileGrid
							items={kk.list}
							selectedKey={selectedKey}
							onSelect={onSelect}
							revealKey={selectedKey}
							width={width}
						/>
					) : null}
				</div>
			);
		});

	const subSections = (g: (typeof byClass)[number], baseDepth: 0 | 1) =>
		g.subs.map((s) => {
			if (!s.sub) return <Fragment key="_">{kSections(g.cls, s.sub, s.ks, baseDepth)}</Fragment>;
			const id = `s:${g.cls}:${s.sub}`;
			return (
				<div key={id} className="flex flex-col gap-px">
					<TreeRow
						label={SUB_LABEL[s.sub] ?? s.sub}
						count={s.count}
						open={expanded[id]}
						depth={baseDepth}
						onToggle={() => toggle(id)}
					/>
					{expanded[id] ? kSections(g.cls, s.sub, s.ks, (baseDepth + 1) as 1 | 2) : null}
				</div>
			);
		});

	return (
		// The list is a wall: rows stacked edge to edge, the 1px gaps between them the only rules.
		<div ref={listRef} className="ta-wall flex flex-col gap-px">
			{byClass.map((g) => {
				if (single) return <Fragment key={g.cls}>{subSections(g, 0)}</Fragment>;
				const id = `c:${g.cls}`;
				return (
					<div key={id} className="flex flex-col gap-px">
						<TreeRow
							label={TILE_CLASS_LABEL[g.cls].long}
							count={g.count}
							open={expanded[id]}
							depth={0}
							onToggle={() => toggle(id)}
						/>
						{expanded[id] ? subSections(g, 1) : null}
					</div>
				);
			})}
		</div>
	);
});

// A node of the open path. Sticky: scrolling into a bucket of 1,472 tilings used to strand you there
// with no way back to the top of the list, so the headers you opened stay pinned — indented by depth —
// and clicking one collapses it. Depth 2 exists only inside the freedraw class (class → grid → k).
function TreeRow({
	label,
	count,
	open,
	depth,
	onToggle,
}: {
	label: string;
	count: number;
	open: boolean;
	depth: 0 | 1 | 2;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onToggle}
			aria-expanded={open}
			className={cn(
				// ta-sticky-rule (globals.css): a pinned row paints its own hairlines, since the wall's
				// gaps have scrolling tiles behind them while it is stuck.
				"ta-sticky-rule bg-surface-chrome sticky flex items-center justify-between gap-2 pr-3 text-left cursor-pointer",
				"hover:bg-surface-sunken dark:hover:bg-surface-overlay transition-colors",
				"focus:outline-none focus-visible:relative focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-fg",
				depth === 0 ? "pl-3 z-20" : depth === 1 ? "pl-7 z-10" : "pl-11 z-[5]",
			)}
			style={{ height: ROW_H, top: depth === 0 ? 0 : depth === 1 ? NESTED_TOP : NESTED_TOP * 2 }}
		>
			<span className="text-xs font-medium text-fg-secondary truncate">
				{label}
				<span className="ml-1.5 text-fg tabular-nums">{count}</span>
			</span>
			{open ? (
				<ChevronDown size={13} className="text-fg-muted shrink-0" />
			) : (
				<ChevronRight size={13} className="text-fg-muted shrink-0" />
			)}
		</button>
	);
}