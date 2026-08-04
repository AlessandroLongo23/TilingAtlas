"use client";

import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useExpandableGroups } from "@/lib/hooks/useExpandableGroups";
import { tileClassOf, TILE_CLASS_ORDER, TILE_CLASS_LABEL, SUB_ORDER, subOf, type TileClass } from "@/lib/services/referenceAtlas";
import { cn } from "@/lib/utils/cn";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { TileGrid } from "./tile-grid";
import { freedrawKNoun, gridOf } from "@/lib/freedraw/pattern";

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
// class uses (no row rendered for it). SUB_LABEL below is the display name — presentation, so it stays here.
const SUB_LABEL: Record<string, string> = {
	square: "Square grid",
	triangle: "Triangle grid",
	hex: "Hexagon grid",
	ts: "Triangle + square grid",
	sch236: "Schwarz (2,3,6) grid",
	sch244: "Schwarz (2,4,4) grid",
	// The two PARAMETRIC boards, whose tile is a family and not a fixed grid.
	"pen-1": "Pentagon (Kershner 1) edges",
	"ih-1": "Isohedral IH01 edges",
	"ih-2": "Isohedral IH02 edges",
	"ih-3": "Isohedral IH03 edges",
	"ih-4": "Isohedral IH04 edges",
	// Colors splits the same grids again by palette size — each is its own catalogue.
	"square-2": "Square grid, 2 colors",
	"square-3": "Square grid, 3 colors",
	"triangle-2": "Triangle grid, 2 colors",
	"triangle-3": "Triangle grid, 3 colors",
	"hex-3": "Hexagon grid, 3 colors",
	"ts-2": "Triangle + square, 2 colors",
	"ts-3": "Triangle + square, 3 colors",
	tetrahedron: "Tetrahedron",
	octahedron: "Octahedron",
	cube: "Cube",
	dodecahedron: "Dodecahedron",
	icosahedron: "Icosahedron",
	// Schwarz boards: one sub per (p,q,r) reflection group. The board is the sphere / disk cut by its
	// mirrors, so the label names the triple, not a Schläfli symbol — (2,3,4) has no {p,q} name.
	"sps-223": "(2,2,3) board",
	"sps-224": "(2,2,4) board",
	"sps-233": "(2,3,3) board",
	"sps-234": "(2,3,4) board",
	"sps-235": "(2,3,5) board",
	"hys-237": "(2,3,7) board",
	"hys-245": "(2,4,5) board",
	// Uniform-polyhedron edge systems: one sub per solid. The label is the solid, since a prism has no
	// Schläfli symbol and "3.4.4" alone would not read as a shape.
	"spe-443": "Triangular prism edges",
	"spe-445": "Pentagonal prism edges",
	"spe-446": "Hexagonal prism edges",
	"spe-447": "Heptagonal prism edges",
	"spe-663": "Truncated tetrahedron edges",
	"spe-3334": "Square antiprism edges",
	"spe-3335": "Pentagonal antiprism edges",
	"spe-3336": "Hexagonal antiprism edges",
	"spe-cuboctahedron": "Cuboctahedron edges",
	"spe-j27": "Triangular orthobicupola edges",
	"spe-448": "Octagonal prism edges",
	"spe-664": "Truncated octahedron edges",
	"spe-3337": "Heptagonal antiprism edges",
	"spe-4443": "Rhombicuboctahedron edges",
	"spe-j37": "Pseudo-rhombicuboctahedron edges",
	"spe-33334": "Snub cube edges",
	// The 3.4.n.4 family on the sphere, n = 3, 4, 5 — the same rows as "hpo-", other side of the split.
	"spp-3": "3.4.3.4 solids",
	"spp-4": "3.4.4.4 solids",
	"spp-5": "3.4.5.4 solids",
	// The 3.4.n.4 family: one sub per board. Labelled by the defining vertex figure, which is also what
	// names the edge length the whole board is built at.
	"hpo-7": "3.4.7.4 tilings",
	"hpo-8": "3.4.8.4 tilings",
	"hpo-9": "3.4.9.4 tilings",
	"hpo-10": "3.4.10.4 tilings",
	"hpo-11": "3.4.11.4 tilings",
	"hpo-12": "3.4.12.4 tilings",
	"hpo-14": "3.4.14.4 tilings",
	"hpo-15": "3.4.15.4 tilings",
	"hpo-16": "3.4.16.4 tilings",
	"hpo-17": "3.4.17.4 tilings",
	"hpo-18": "3.4.18.4 tilings",
	"hpo-19": "3.4.19.4 tilings",
	"hpo-20": "3.4.20.4 tilings",
	"hpo-23": "3.4.23.4 tilings",
	// Hyperbolic edge systems: one sub per base tiling.
	"hyp-667": "6.6.7 edges",
	"hyp-668": "6.6.8 edges",
	"hyp-37": "{3,7} edges",
	"hyp-38": "{3,8} edges",
	"hyp-45": "{4,5} edges",
	"hyp-46": "{4,6} edges",
	"hyp-54": "{5,4} edges",
	"hyp-55": "{5,5} edges",
	"hyp-64": "{6,4} edges",
	"hyp-65": "{6,5} edges",
	"hyp-73": "{7,3} edges",
	"hyp-74": "{7,4} edges",
	"hyp-83": "{8,3} edges",
	"hyp-84": "{8,4} edges",
	// Hyperbolic colored tilings: one sub per base {p,q}.
	"hyc-37": "{3,7} colored",
	"hyc-73": "{7,3} colored",
	"hyc-83": "{8,3} colored",
	"hyc-54": "{5,4} colored",
	"hyc-64": "{6,4} colored",
	"hyc-45": "{4,5} colored",
	// Spherical colored tilings: one sub per Platonic solid.
	"spc-tetrahedron": "Tetrahedron colored",
	"spc-octahedron": "Octahedron colored",
	"spc-cube": "Cube colored",
	"spc-dodecahedron": "Dodecahedron colored",
	"spc-icosahedron": "Icosahedron colored",
};

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
		openGroups(selectedSubId ? [selectedClassId, selectedSubId, selectedKId] : [selectedClassId, selectedKId]);
	}, [selectedKey, selectedClassId, selectedSubId, selectedKId, openGroups]);

	// When the geometry filter leaves a single tile class (hyperbolic is always one; spherical is one until
	// its freedraw shelf loads, then it splits into Spherical + Freedraw), drop the redundant class level and
	// pin the k rows at the top — the geometry IS the top layer, so a lone "Hyperbolic ▸" wrapper would just
	// be a second identical one. With two or more classes the class headers render normally.
	const single = byClass.length === 1;

	const kSections = (cls: TileClass, sub: string, ks: { k: number; list: CatalogueTiling[] }[], depth: 0 | 1 | 2) =>
		ks.map((kk) => {
			const id = `k:${cls}:${sub}:${kk.k}`;
			const open = expanded[id];
			// Freedraw shares the k axis but not its meaning. For PLANAR freedraw k counts GRID-POINT orbits of
			// the decoration; for SPHERICAL freedraw it counts VERTEX orbits of the solid. Either way it is not
			// the vertex-orbit count of a uniform tiling in the way the other classes mean it, so name it on the
			// row instead of letting a bare "k = 2" imply the quantities are the same.
			const kLabel =
				cls === "freedraw"
					? kk.list[0]?.sphericalFreedraw || kk.list[0]?.hypEdges || kk.list[0]?.schwarz || kk.list[0]?.sphEdges || kk.list[0]?.pentEdges || kk.list[0]?.ihEdges
						? `k = ${kk.k} vertex orbits`
						: `k = ${kk.k} ${kk.list[0]?.freedraw ? freedrawKNoun(gridOf(kk.list[0].freedraw)) : "grid points"}`
					: cls === "colors"
						? `k = ${kk.k} colored vertices`
						: `k = ${kk.k}`;
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
				// Every level sits ABOVE a tile's z-10 selection/hover ring (tile-grid.tsx): the ring and
				// these headers share one stacking context, so a header at the ring's own z-10 only tied it
				// and — later in DOM order — the ring won, bleeding its outline up over the pinned k-row. Keep
				// the depth order (class over grid over k) but start it past 10. The scroller isolates this
				// context (catalogue-tab.tsx), so these values never reach the canvas overlay buttons.
				depth === 0 ? "pl-3 z-40" : depth === 1 ? "pl-7 z-30" : "pl-11 z-20",
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