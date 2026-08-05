"use client";

import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useExpandableGroups } from "@/lib/hooks/useExpandableGroups";
import { tileClassOf, TILE_CLASS_ORDER, TILE_CLASS_LABEL, SUB_ORDER, subOf, familyOfSub, type TileClass } from "@/lib/services/referenceAtlas";
import { cn } from "@/lib/utils/cn";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { COLOR_SUB, FAMILY_LABEL, SUB_LABEL, shortSubLabel } from "@/lib/services/shelfLabels";
import { kNounOf } from "@/lib/services/shelfRegistry";
import { TileGrid } from "./tile-grid";

// The /play picker: tilings nested by polygon class (regular / star / convex / isotoxal) then by k, each a
// thumbnail + badge. Click selects (renders large on the canvas)
interface CatalogueListPanelProps {
	items: CatalogueTiling[];
	selectedKey: string | null;
	onSelect?: (t: CatalogueTiling) => void;
}

// Initial expand state: EVERY row starts collapsed, nested ones included (class `c:…`, grid `s:…`,
// k `k:…`), so the picker opens as a short list of headings and each level is unrolled by hand.

// Row height for both header levels; the nested one parks one hairline below the outer one so an open
// path reads as an indented tree pinned to the top of the scrollport.
const ROW_H = 36;
const NESTED_TOP = ROW_H + 1;

// Class order + labels come from the shared registry (referenceAtlas TILE_CLASS_ORDER / TILE_CLASS_LABEL),
// the same source /library uses — so a new class appears here automatically. A class section only appears
// when it has tilings.

// The freedraw class alone carries an extra layer between class and k (SUB_ORDER / subOf, shared from
// referenceAtlas so this tree and the linear browse order can't drift). For PLANAR freedraw (euclidean) it
// is WHICH GRID the edge subset decorates; for SPHERICAL freedraw WHICH SOLID. Both live under the one
// "freedraw" class, but never in the same list — the catalogue is filtered to one geometry first, so a given
// list shows only grid subs (euclidean) or only solid subs (spherical). sub = "" is the spine every other
// class uses (no row rendered for it). The display names live in lib/services/shelfLabels.ts — SUB_LABEL,
// FAMILY_LABEL and the COLOR_SUB split. Presentation, like they always were, but out of this "use client"
// module so a test can import them: tests/catalogue-sub-family.test.ts asserts every sub in SUB_ORDER has
// a label, which is what nothing did when eleven shelves shipped in v1.13.0 rendering as raw ids.

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
			// Gather the subs into families, in SUB_ORDER (families are contiguous there, which is what
			// referenceAtlas' familyOfSub guarantees and its test enforces), so this pass is a scan and
			// never a re-sort. A family of one still gets a run: whether it earns a ROW is decided at
			// render time, once we know how many the class has.
			const families: { family: string | null; subs: typeof subs; count: number }[] = [];
			for (const s of subs) {
				const family = familyOfSub(s.sub);
				const last = families[families.length - 1];
				if (last && last.family === family && family !== null) {
					last.subs.push(s);
					last.count += s.count;
				} else {
					families.push({ family, subs: [s], count: s.count });
				}
			}
			return { cls, subs, families, count: subs.reduce((s2, g) => s2 + g.count, 0) };
		});
	}, [items]);

	// One flat expand-state set over every node id (class rows, grid rows, and their k rows).
	const nodeIds = useMemo(() => {
		const ids: string[] = [];
		for (const g of byClass) {
			ids.push(`c:${g.cls}`);
			// Family rows exist in the id set whether or not this class renders them: a class with one
			// family skips the row, and an id nobody toggles costs nothing, where a MISSING one would
			// leave a row that cannot open.
			for (const f of g.families) ids.push(`f:${g.cls}:${f.family ?? "_spine"}`);
			for (const s of g.subs) {
				const stem = COLOR_SUB.exec(s.sub)?.[1];
				if (stem) ids.push(`g:${g.cls}:${stem}`);
			}
			for (const s of g.subs) {
				if (s.sub) ids.push(`s:${g.cls}:${s.sub}`);
				for (const kk of s.ks) ids.push(`k:${g.cls}:${s.sub}:${kk.k}`);
			}
		}
		return ids;
	}, [byClass]);
	const { expanded, toggle, openGroups } = useExpandableGroups(nodeIds, (id) => id, false);

	// One width for every bucket. Measured here, not per grid, so that a single commit gives
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
	// `_spine` included: a tiling on the anonymous spine now sits under a heading too (see subSections).
	const selectedFamilyId = selectedTile
		? `f:${tileClassOf(selectedTile)}:${familyOfSub(subOf(selectedTile)) ?? "_spine"}`
		: null;
	// The grid row a coloring sits under, between its family and its palette row.
	const selectedGridId = selectedTile
		? (() => {
				const stem = COLOR_SUB.exec(subOf(selectedTile))?.[1];
				return stem ? `g:${tileClassOf(selectedTile)}:${stem}` : null;
			})()
		: null;
	const selectedKId = selectedTile
		? `k:${tileClassOf(selectedTile)}:${subOf(selectedTile)}:${selectedTile.k}`
		: null;

	// Open the path to the current tiling on every selection change; the bucket's TileGrid handles the
	// scroll and the pulse itself (with the tiles virtualised, the target row may not be mounted yet, so
	// there is no element to scroll to — only a row index).
	//
	// The page's FIRST selection is exempt: /play picks one as soon as the catalogue resolves, and
	// revealing it would leave the panel opened to a class the visitor never asked for, against the
	// everything-collapsed default. Later changes (random, ←/→, a click) still unroll their path.
	const revealedFirst = useRef(false);
	useEffect(() => {
		if (!selectedClassId || !selectedKId) return;
		if (!revealedFirst.current) {
			revealedFirst.current = true;
			return;
		}
		// Every level on the path, family included; a closed family row would hide the sub the reveal
		// just opened.
		openGroups(
			[selectedClassId, selectedFamilyId, selectedGridId, selectedSubId, selectedKId].filter(
				(x): x is string => !!x,
			),
		);
	}, [selectedKey, selectedClassId, selectedFamilyId, selectedGridId, selectedSubId, selectedKId, openGroups]);

	// When the geometry filter leaves a single tile class (hyperbolic is always one; spherical is one until
	// its freedraw shelf loads, then it splits into Spherical + Freedraw), drop the redundant class level and
	// pin the k rows at the top — the geometry IS the top layer, so a lone "Hyperbolic ▸" wrapper would just
	// be a second identical one. With two or more classes the class headers render normally.
	const single = byClass.length === 1;

	const kSections = (cls: TileClass, sub: string, ks: { k: number; list: CatalogueTiling[] }[], depth: 0 | 1 | 2 | 3) =>
		ks.map((kk) => {
			const id = `k:${cls}:${sub}:${kk.k}`;
			const open = expanded[id];
			// Freedraw shares the k axis but not its meaning. For PLANAR freedraw k counts GRID-POINT orbits of
			// the decoration; for SPHERICAL freedraw it counts VERTEX orbits of the solid. Either way it is not
			// the vertex-orbit count of a uniform tiling in the way the other classes mean it, so name it on the
			// row instead of letting a bare "k = 2" imply the quantities are the same.
			//
			// Which shelves deviate, and what to call their k, is one field on the shelf registry — this used
			// to be a chain over six payload fields that a new shelf had to be added to by hand. A null noun is
			// the ordinary reading and keeps the bare "k = 2", so most of the catalogue reads as it always did.
			const kNoun = kk.list[0] ? kNounOf(kk.list[0]) : null;
			const kLabel = kNoun ? `k = ${kk.k} ${kNoun}` : `k = ${kk.k}`;
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

	// The palette leaf: "2 colors" under its grid. Its k rows sit one deeper again.
	const paletteRows = (g: (typeof byClass)[number], subs: (typeof byClass)[number]["subs"], baseDepth: 0 | 1 | 2) =>
		subs.map((s) => {
			const id = `s:${g.cls}:${s.sub}`;
			const n = COLOR_SUB.exec(s.sub)?.[2] ?? "";
			return (
				<div key={id} className="flex flex-col gap-px">
					<TreeRow
						label={`${n} colors`}
						count={s.count}
						open={expanded[id]}
						depth={baseDepth}
						onToggle={() => toggle(id)}
					/>
					{expanded[id] ? kSections(g.cls, s.sub, s.ks, (baseDepth + 1) as 1 | 2 | 3) : null}
				</div>
			);
		});

	// One row per GRID, with its palettes beneath. Subs arrive in SUB_ORDER, which is grid-major, so
	// this is a scan too and the grids keep the catalogue's own order.
	const gridSections = (
		g: (typeof byClass)[number],
		subs: (typeof byClass)[number]["subs"],
		baseDepth: 0 | 1 | 2,
		underFamily = false,
	) => {
		const stems: { stem: string; subs: typeof subs; count: number }[] = [];
		for (const s of subs) {
			const stem = COLOR_SUB.exec(s.sub)?.[1] ?? s.sub;
			const last = stems[stems.length - 1];
			if (last && last.stem === stem) {
				last.subs.push(s);
				last.count += s.count;
			} else stems.push({ stem, subs: [s], count: s.count });
		}
		return stems.map((st) => {
			const id = `g:${g.cls}:${st.stem}`;
			return (
				<div key={id} className="flex flex-col gap-px">
					<TreeRow
						label={underFamily ? shortSubLabel(st.stem) : (SUB_LABEL[st.stem] ?? st.stem)}
						count={st.count}
						open={expanded[id]}
						depth={baseDepth}
						onToggle={() => toggle(id)}
					/>
					{expanded[id] ? paletteRows(g, st.subs, (baseDepth + 1) as 1 | 2) : null}
				</div>
			);
		});
	};

	// `underFamily` says whether a family heading is already on screen above these rows. When it is, the row
	// only has to name its member — "IH01", not "Isohedral IH01 edges" — and /library's board wall makes the
	// same call from the same table (lib/services/shelfLabels.ts). When no family row was rendered, the long
	// name is all the context there is, so it stays.
	const subRows = (
		g: (typeof byClass)[number],
		subs: (typeof byClass)[number]["subs"],
		baseDepth: 0 | 1 | 2,
		family: string | null = null,
		underFamily = false,
	) => {
		// Colorings split one more time, into grid then palette size.
		if (family === "grid-colors" && baseDepth < 2) return gridSections(g, subs, baseDepth, underFamily);
		return subs.map((s) => {
			if (!s.sub) return <Fragment key="_">{kSections(g.cls, s.sub, s.ks, baseDepth)}</Fragment>;
			const id = `s:${g.cls}:${s.sub}`;
			return (
				<div key={id} className="flex flex-col gap-px">
					<TreeRow
						label={underFamily ? shortSubLabel(s.sub) : (SUB_LABEL[s.sub] ?? s.sub)}
						count={s.count}
						open={expanded[id]}
						depth={baseDepth}
						onToggle={() => toggle(id)}
					/>
					{expanded[id] ? kSections(g.cls, s.sub, s.ks, (baseDepth + 1) as 1 | 2 | 3) : null}
				</div>
			);
		});
	};

	// The family layer earns a row only when it actually divides something: at least one named family,
	// and at least two groups once the unnamed run is counted. A lone "Base tilings ▸" wrapping every
	// row beneath it is a second copy of the heading above it, and costs a click.
	//
	// The unnamed run is the anonymous spine, and at baseDepth 0 it gets a heading of its own — the
	// CLASS label, which the tree dropped precisely because the class was the only one. Hyperbolic and
	// spherical Tilings are the lists that need it: without it their `k = 1` rows sit as siblings of
	// "3.4.7.4 tilings", two different shelves reading as one flat list. Deeper than that the class row
	// is already on screen, so repeating its label under itself would say nothing.
	const subSections = (g: (typeof byClass)[number], baseDepth: 0 | 1) => {
		const named = g.families.filter((f) => f.family !== null);
		const spineGetsRow = baseDepth === 0 && named.length >= 1;
		if (named.length < 1 || (g.families.length < 2 && baseDepth > 0))
			return subRows(g, g.subs, baseDepth, named[0]?.family ?? null);
		return g.families.map((f) => {
			if (f.family === null && !spineGetsRow)
				return <Fragment key="_none">{subRows(g, f.subs, baseDepth)}</Fragment>;
			const id = f.family === null ? `f:${g.cls}:_spine` : `f:${g.cls}:${f.family}`;
			return (
				<div key={id} className="flex flex-col gap-px">
					<TreeRow
						label={f.family === null ? TILE_CLASS_LABEL[g.cls].long : FAMILY_LABEL[f.family] ?? f.family}
						count={f.count}
						open={expanded[id]}
						depth={baseDepth}
						onToggle={() => toggle(id)}
					/>
					{/* A family row was just rendered above, so the subs beneath it drop the family word. */}
					{expanded[id] ? subRows(g, f.subs, (baseDepth + 1) as 1 | 2, f.family, f.family !== null) : null}
				</div>
			);
		});
	};

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
	depth: 0 | 1 | 2 | 3;
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
				// Every level sits ABOVE a tile's z-10 selection/hover ring (tile-grid.tsx): the ring and
				// these headers share one stacking context, so a header at the ring's own z-10 only tied it
				// and — later in DOM order — the ring won, bleeding its outline up over the pinned k-row. Keep
				// the depth order (class over grid over k) but start it past 10. The scroller isolates this
				// context (catalogue-tab.tsx), so these values never reach the canvas overlay buttons.
				depth === 0 ? "pl-3 z-40" : depth === 1 ? "pl-7 z-30" : depth === 2 ? "pl-11 z-20" : "pl-[3.75rem] z-[15]",
			)}
			style={{ height: ROW_H, top: depth === 0 ? 0 : NESTED_TOP * depth }}
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