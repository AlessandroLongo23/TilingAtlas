"use client";

import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { useExpandableGroups } from "@/lib/hooks/useExpandableGroups";
import { compactVertexConfig, tileClassOf, TILE_CLASS_ORDER, TILE_CLASS_LABEL, SUB_ORDER, subOf, familyOfSub, type TileClass } from "@/lib/services/referenceAtlas";
import { cn } from "@/lib/utils/cn";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { COLOR_SUB, FAMILY_LABEL, SUB_LABEL, shortSubLabel } from "@/lib/services/shelfLabels";
import { kNounOf } from "@/lib/services/shelfRegistry";
import { tierKey, type UnloadedTier } from "@/lib/services/atlasManifest";
import { TileGrid } from "./tile-grid";

// The /play picker: tilings nested by polygon class (regular / star / convex / isotoxal) then by k, each a
// thumbnail + badge. Click selects (renders large on the canvas)
interface CatalogueListPanelProps {
	items: CatalogueTiling[];
	selectedKey: string | null;
	onSelect?: (t: CatalogueTiling) => void;
	/** Tiers that exist but are not loaded — drawn as rows so their data can be asked for. */
	unloaded?: UnloadedTier[];
	onLoadTier?: (t: UnloadedTier) => void;
	loadingTiers?: ReadonlySet<string>;
}

// Initial expand state: EVERY row starts collapsed, nested ones included (class `c:…`, grid `s:…`,
// k `k:…`), so the picker opens as a short list of headings and each level is unrolled by hand.

// Row height for both header levels; the nested one parks one hairline below the outer one so an open
// path reads as an indented tree pinned to the top of the scrollport.
const ROW_H = 36;
const NESTED_TOP = ROW_H + 1;

// A board on the base hyperbolic shelf ("hyt-…") earns the configuration level only when the level
// DIVIDES something — the same test the family row already applies one level up. Under 60 tilings the
// board lists them directly, because 167 of the 227 boards are that small and most of their
// configurations hold one or two tilings: a level of one-item rows is a click, not a structure. Above it,
// 60 boards split into 6…147 configuration rows (median 25) and the biggest cell drops 5,581 → 876.
const CONFIG_LEVEL_MIN = 60;
const splitsByConfig = (sub: string, count: number) => sub.startsWith("hyt-") && count > CONFIG_LEVEL_MIN;

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
export const CatalogueListPanel = memo(function CatalogueListPanel({
	items,
	selectedKey,
	onSelect,
	unloaded,
	onLoadTier,
	loadingTiers,
}: CatalogueListPanelProps) {
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
		// Tiers that ship but are not loaded get an EMPTY k bucket, so the row exists and clicking it
		// is what fetches. Without this a row can only appear once its data has arrived, and the data
		// only arrives when the row is clicked — the circularity that left 84,424 tilings unreachable.
		// A tier whose records did arrive (deep link, another route) is skipped: unloadedTiers() has
		// already cancelled it against the loaded set, and re-adding it here would draw an empty
		// duplicate beside the real one.
		const pendingAt = new Map<string, UnloadedTier>();
		for (const u of unloaded ?? []) {
			if (map.get(u.cls)?.get(u.sub)?.has(u.k)) continue;
			pendingAt.set(tierKey(u.cls, u.sub, u.k), u);
			if (!map.has(u.cls)) map.set(u.cls, new Map());
			const subMap = map.get(u.cls)!;
			if (!subMap.has(u.sub)) subMap.set(u.sub, new Map());
			subMap.get(u.sub)!.set(u.k, []);
		}
		return TILE_CLASS_ORDER.filter((c) => map.has(c)).map((cls) => {
			const subMap = map.get(cls)!;
			const subs = SUB_ORDER.filter((s) => subMap.has(s)).map((sub) => {
				const kMap = subMap.get(sub)!;
				const ks = Array.from(kMap.entries())
					.sort(([a], [b]) => a - b)
					.map(([k, list]) => ({ k, list, pending: pendingAt.get(tierKey(cls, sub, k)) }));
				// An unloaded tier contributes its MANIFEST count to the parent totals, so a class header
				// reads the number of tilings that exist, not the number currently in memory.
				return { sub, ks, count: ks.reduce((s2, g) => s2 + (g.pending?.count ?? g.list.length), 0) };
			});
			// Gather the subs into families, in SUB_ORDER (families are contiguous there, which is what
			// referenceAtlas' familyOfSub guarantees and its test enforces), so this pass is a scan and
			// never a re-sort. A family of one still gets a run: whether it earns a ROW is decided at
			// render time, once we know how many the class has.
			//
			// Grouped by KEY, not by adjacency. The old scan started a fresh run for every unfamilied
			// sub (`family !== null` in the merge test), so a class with two of them produced two runs
			// that both render as `f:<cls>:_spine` — duplicate React keys, and rows that toggle each
			// other. Keying the bucket makes the spine exactly one run, which is what every comment here
			// already assumes, and it survives a SUB_ORDER edit that splits a family instead of failing
			// the next time someone adds a shelf.
			const byFamily = new Map<string, { family: string | null; subs: typeof subs; count: number }>();
			const families: { family: string | null; subs: typeof subs; count: number }[] = [];
			for (const s of subs) {
				const family = familyOfSub(s.sub);
				const key = family ?? "|spine";
				const run = byFamily.get(key);
				if (run) {
					run.subs.push(s);
					run.count += s.count;
				} else {
					const fresh = { family, subs: [s], count: s.count };
					byFamily.set(key, fresh);
					families.push(fresh);
				}
			}
			return { cls, subs, families, count: subs.reduce((s2, g) => s2 + g.count, 0) };
		});
	}, [items, unloaded]);

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
	// The configuration row, where a board splits by one (see configSections). It stands INSTEAD of the k
	// row, so both ids go into the reveal below and whichever the tree rendered is the one that opens.
	const selectedConfigId = selectedTile
		? `cfg:${tileClassOf(selectedTile)}:${subOf(selectedTile)}:${selectedTile.family}`
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
			[selectedClassId, selectedFamilyId, selectedGridId, selectedSubId, selectedKId, selectedConfigId].filter(
				(x): x is string => !!x,
			),
		);
	}, [
		selectedKey,
		selectedClassId,
		selectedFamilyId,
		selectedGridId,
		selectedSubId,
		selectedKId,
		selectedConfigId,
		openGroups,
	]);

	// When the geometry filter leaves a single tile class (hyperbolic is always one; spherical is one until
	// its freedraw shelf loads, then it splits into Spherical + Freedraw), drop the redundant class level and
	// pin the k rows at the top — the geometry IS the top layer, so a lone "Hyperbolic ▸" wrapper would just
	// be a second identical one. With two or more classes the class headers render normally.
	const single = byClass.length === 1;

	const kSections = (
		cls: TileClass,
		sub: string,
		ks: { k: number; list: CatalogueTiling[]; pending?: UnloadedTier }[],
		depth: 0 | 1 | 2 | 3,
	) =>
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
			// A row for a tier that ships but is not in memory. It shows the manifest count and fetches
			// on click; it never expands, because there is nothing to expand into yet. Once the records
			// merge, unloadedTiers() stops reporting it and it becomes an ordinary row on the next
			// render, at which point the expand state it never used is simply unread.
			if (kk.pending) {
				const busy = loadingTiers?.has(kk.pending.key) ?? false;
				return (
					<div key={id} className="flex flex-col gap-px">
						<TreeRow
							label={kLabel}
							count={kk.pending.count}
							open={false}
							depth={depth}
							pending={busy ? "loading" : "unloaded"}
							onToggle={() => {
								if (!busy) onLoadTier?.(kk.pending!);
							}}
						/>
					</div>
				);
			}
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

	// ── The base hyperbolic shelf's fourth level: one row per VERTEX CONFIGURATION ────────────────────
	//
	// It REPLACES the k row instead of sitting above it. A configuration fixes its own k (k is the number
	// of orbits listed in it), so a "k = 2" row underneath would hold exactly the row above it and cost a
	// click to say nothing.
	//
	// Why this level exists at all: in H² a vertex configuration does NOT determine the tiling. 12,168
	// uniform tilings realise only 2,591 configurations — `4.6⁷` alone admits 147 — so the configuration
	// is a real family with real members, and it is the only cut that brings this shelf to human scale.
	// Its board rows still hold up to 5,581 tilings; under them no configuration holds more than 876, and
	// only 6 of 2,336 hold more than 300.
	//
	// BIGGEST FIRST, unlike every other level here, which sorts by its own axis (SUB_ORDER, k ascending).
	// There is no meaningful order on configurations, and the whole point of the level is to surface the
	// crowded ones; the tie-break on the string keeps it stable.
	const configGroups = (ks: { k: number; list: CatalogueTiling[] }[]) => {
		const m = new Map<string, CatalogueTiling[]>();
		for (const kk of ks)
			for (const t of kk.list) {
				const list = m.get(t.family);
				if (list) list.push(t);
				else m.set(t.family, [t]);
			}
		return [...m.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));
	};

	const configSections = (cls: TileClass, sub: string, ks: { k: number; list: CatalogueTiling[] }[], depth: 0 | 1 | 2 | 3) =>
		configGroups(ks).map(([family, list]) => {
			const id = `cfg:${cls}:${sub}:${family}`;
			const open = expanded[id];
			return (
				<div key={id} className="flex flex-col gap-px">
					<TreeRow
						label={compactVertexConfig(family)}
						count={list.length}
						open={open}
						depth={depth}
						onToggle={() => toggle(id)}
					/>
					{open ? (
						<TileGrid
							items={list}
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
					{expanded[id]
						? splitsByConfig(s.sub, s.count)
							? configSections(g.cls, s.sub, s.ks, (baseDepth + 1) as 1 | 2 | 3)
							: kSections(g.cls, s.sub, s.ks, (baseDepth + 1) as 1 | 2 | 3)
						: null}
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
	pending,
}: {
	label: string;
	count: number;
	open: boolean;
	depth: 0 | 1 | 2 | 3;
	onToggle: () => void;
	/** Set on a row whose tilings ship but are not loaded: its count comes from the manifest. */
	pending?: "unloaded" | "loading";
}) {
	return (
		<button
			type="button"
			onClick={onToggle}
			aria-expanded={pending ? undefined : open}
			aria-busy={pending === "loading" || undefined}
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
			{pending ? (
				// A download glyph, not a chevron: this row fetches, it does not unfold. The count beside
				// it is the manifest's, so it is honest before anything has been loaded.
				<Download
					size={13}
					className={cn("shrink-0", pending === "loading" ? "text-fg animate-pulse" : "text-fg-muted")}
				/>
			) : open ? (
				<ChevronDown size={13} className="text-fg-muted shrink-0" />
			) : (
				<ChevronRight size={13} className="text-fg-muted shrink-0" />
			)}
		</button>
	);
}