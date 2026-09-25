"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ColorsCanvas } from "@/components/colors/colors-canvas";
import {
	CATALOGUE_GRID,
	CatalogueCard,
	DetailPane,
	LIST_PANE,
	ToggleCell,
	ToggleRow,
	WallBar,
	WallGroup,
} from "@/components/freedraw/filter-wall";
import { OptionWall } from "@/components/ui/option-wall";
import { Pagination } from "@/components/ui/pagination";
import {
	cellCount,
	colorCountOf,
	colorsCatalogue,
	colorsGridOf,
	COLORS_CATALOGUES,
	type ColorPattern,
	type ColorsGrid,
} from "@/lib/colors/pattern";
import type { ColorsStyle } from "@/lib/colors/render";
import { useGridArrowNav } from "@/lib/hooks/useGridArrowNav";
import { useKeyShortcuts } from "@/lib/hooks/useKeyShortcuts";
import { requestViewReset } from "@/lib/render/touchGestures";
import { serializePlayState } from "@/lib/services/playUrlState";
import { readAtlas } from "@/lib/services/atlasCodec";

// The colored-tiling workbench: the /freedraw layout (filter band over a paginated thumbnail grid
// with a detail pane). One catalogue per grid × palette size, so the band is one toolbar row of grid,
// colors, k and the overlay toggles; the class facets (vertex tokens, tile/edge orbit counts) can
// grow here later the way freedraw's did.

const GRID_OPTIONS: { value: ColorsGrid; label: string }[] = [
	{ value: "square", label: "Square" },
	{ value: "triangle", label: "Triangle" },
	{ value: "hex", label: "Hexagon" },
	{ value: "ts", label: "Tri + squares" },
];

const COLOR_OPTIONS = [...new Set(COLORS_CATALOGUES.map((c) => c.colors))].map((n) => ({
	value: n,
	label: `${n} colors`,
}));

// The k range is per (grid, palette size) — what Marek's runs reached, not a limit of the method.
// Every k the catalogue holds, eager or lazy — this page fetches one k at a time, so a lazy slice is
// no more expensive here than an eager one. (The atlas shelf is the one that cares about the split.)
const kRange = (grid: ColorsGrid, colors: number) => {
	const c = colorsCatalogue(grid, colors);
	return [...c.ks, ...(c.lazyKs ?? [])].sort((a, b) => a - b);
};
const kOptions = (grid: ColorsGrid, colors: number) =>
	[0, ...kRange(grid, colors)].map((k) => ({ value: k, label: k ? String(k) : "All" }));

// Thumbnails per page — every mounted thumbnail is a live canvas; square k=6 alone is 21k entries.
const PAGE_SIZE = 240;

const fileFor = (grid: ColorsGrid, colors: number, k: number) =>
	`${colorsCatalogue(grid, colors).prefix}${k}.json`;
const filesFor = (grid: ColorsGrid, colors: number, k: number): string[] =>
	k === 0 ? kRange(grid, colors).map((kk) => fileFor(grid, colors, kk)) : [fileFor(grid, colors, k)];

// url -> loaded patterns, kept for the session so re-opening a slice is instant.
const catalogueCache = new Map<string, ColorPattern[]>();

const loadFile = (url: string): Promise<void> =>
	catalogueCache.has(url)
		? Promise.resolve()
		: fetch(url)
				.then((r) => (r.ok ? readAtlas<ColorPattern>(r) : []))
				.catch(() => [] as ColorPattern[])
				.then((d) => {
					catalogueCache.set(url, d);
				});

export function ColorsClient() {
	const searchParams = useSearchParams();
	// Read the URL once on mount, write-only afterwards (replaceState) — the ReferenceShelf pattern.
	const [grid, setGrid] = useState<ColorsGrid>(() => {
		const g = searchParams.get("g");
		return g === "triangle" || g === "ts" || g === "hex" ? g : "square";
	});
	const [colors, setColors] = useState(() => {
		const n = Number(searchParams.get("c"));
		return COLOR_OPTIONS.some((o) => o.value === n) ? n : 2;
	});
	const [k, setK] = useState(() => {
		const n = Number(searchParams.get("k"));
		return Number.isInteger(n) && n >= 1 && n <= 6 ? n : 0;
	});
	const [loadTick, setLoadTick] = useState(0);
	const [page, setPage] = useState(1);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [showEdges, setShowEdges] = useState(true);
	const [showLattice, setShowLattice] = useState(false);
	const [showVertices, setShowVertices] = useState(false);
	const gridRef = useRef<HTMLDivElement | null>(null);
	// Phone only: the detail sheet is up (a thumbnail tap opens it).
	const [detailOpen, setDetailOpen] = useState(false);

	useEffect(() => {
		let live = true;
		Promise.all(filesFor(grid, colors, k).map(loadFile)).then(() => live && setLoadTick((n) => n + 1));
		return () => {
			live = false;
		};
	}, [grid, colors, k]);

	useEffect(() => {
		const q = new URLSearchParams();
		if (grid !== "square") q.set("g", grid);
		if (colors !== 2) q.set("c", String(colors));
		if (k) q.set("k", String(k));
		const s = q.toString();
		window.history.replaceState(null, "", s ? `${window.location.pathname}?${s}` : window.location.pathname);
	}, [grid, colors, k]);

	const slice = useMemo(() => {
		const urls = filesFor(grid, colors, k);
		if (!urls.every((u) => catalogueCache.has(u))) return null;
		return urls.flatMap((u) => catalogueCache.get(u) ?? []);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [grid, colors, k, loadTick]);

	const pageRows = useMemo(
		() => (slice ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
		[slice, page],
	);

	const selected = useMemo(
		() => (slice ?? []).find((p) => p.id === selectedId) ?? pageRows[0] ?? null,
		[slice, pageRows, selectedId],
	);

	const style = useMemo<Omit<ColorsStyle, "dark">>(
		() => ({ showEdges, showLattice, showVertices }),
		[showEdges, showLattice, showVertices],
	);
	const thumbStyle = useMemo<Omit<ColorsStyle, "dark">>(
		() => ({ showEdges, showLattice: false, showVertices: false }),
		[showEdges],
	);

	// Arrow keys walk the grid: ←/→ by one, ↑/↓ by a row. The index is into the whole filtered slice, so
	// stepping off a page pulls the next one in; the page follows the selection.
	const selectedIndex = selected ? (slice ?? []).findIndex((p) => p.id === selected.id) : -1;
	const nav = useGridArrowNav({
		gridRef,
		count: slice?.length ?? 0,
		index: selectedIndex,
		page,
		onMove: (next) => {
			setSelectedId((slice ?? [])[next].id);
			setPage(Math.floor(next / PAGE_SIZE) + 1);
		},
	});

	// The overlay keys, identical to /play's colors view (COLORS_TOGGLES there): G = tile edges,
	// P = period lattice, O = colored-vertex orbits. Each control shows its key as a Kbd badge.
	useKeyShortcuts({
		g: () => setShowEdges((v) => !v),
		p: () => setShowLattice((v) => !v),
		o: () => setShowVertices((v) => !v),
	});

	// The /play deep link for the selection. Every colored pattern is in the base reference atlas (keyed by
	// its id), so `tiling` alone resolves; the three overlay toggles ride along through the shared
	// serializer so the viewer opens showing what the preview shows. Defaults are omitted by design.
	const playHref = useMemo(() => {
		if (!selected) return null;
		const q = serializePlayState(
			{ colorsEdges: showEdges, colorsLattice: showLattice, colorsVertices: showVertices },
			null,
			selected.id,
		);
		return q ? `/play?${q}` : "/play";
	}, [selected, showEdges, showLattice, showVertices]);

	const setKAndReset = (next: number) => {
		setK(next);
		setPage(1);
		setSelectedId(null);
	};

	// Switching grid or palette size resets k (the catalogues stop at different k) and the selection.
	const setGridAndReset = (next: ColorsGrid) => {
		setGrid(next);
		setK(0);
		setPage(1);
		setSelectedId(null);
	};
	const setColorsAndReset = (next: number) => {
		setColors(next);
		setK(0);
		setPage(1);
		setSelectedId(null);
	};

	return (
		<div className="flex flex-1 min-w-0 flex-col min-h-0">
			<header className="shrink-0 border-b border-line-subtle">
				<WallBar
					title="Colored tilings"
					count={slice === null ? "loading…" : `${slice.length.toLocaleString()} colorings`}
				>
					<WallGroup title="Grid">
						<OptionWall columns={GRID_OPTIONS.length} options={GRID_OPTIONS} selected={grid} onChange={setGridAndReset} />
					</WallGroup>
					<WallGroup title="Colors" note="palette size">
						<OptionWall columns={COLOR_OPTIONS.length} options={COLOR_OPTIONS} selected={colors} onChange={setColorsAndReset} />
					</WallGroup>
					<WallGroup title="k" note="colored vertex classes">
						<OptionWall
							columns={kOptions(grid, colors).length}
							fill={false}
							options={kOptions(grid, colors)}
							selected={k}
							onChange={setKAndReset}
						/>
					</WallGroup>
					<WallGroup title="Overlays">
						<ToggleRow>
							<ToggleCell label="Edges" shortcut="G" on={showEdges} onClick={() => setShowEdges(!showEdges)} />
							<ToggleCell label="Lattice" shortcut="P" on={showLattice} onClick={() => setShowLattice(!showLattice)} />
							<ToggleCell label="Orbits" shortcut="O" on={showVertices} onClick={() => setShowVertices(!showVertices)} />
						</ToggleRow>
					</WallGroup>
				</WallBar>
			</header>

			<div className="flex-1 min-h-0 flex">
				<div className={LIST_PANE}>
					{slice === null && <div className="p-8 text-fg-muted">Loading the colored-tiling catalogue…</div>}
					<div ref={gridRef} className={CATALOGUE_GRID}>
						{pageRows.map((p) => (
							<CatalogueCard
								key={p.id}
								selected={selected?.id === p.id}
								onClick={() => {
									setSelectedId(p.id);
									setDetailOpen(true);
								}}
								title={p.id}
								subtitle={`${p.tileOrbits} tile${p.tileOrbits === 1 ? "" : "s"} · ${p.edgeOrbits} edge${p.edgeOrbits === 1 ? "" : "s"}`}
							>
								<ColorsCanvas pattern={p} style={thumbStyle} cells={7} />
							</CatalogueCard>
						))}
					</div>
					{(slice?.length ?? 0) > PAGE_SIZE && (
						<div className="mt-4 flex justify-center">
							<Pagination
								totalItems={slice?.length ?? 0}
								pageSize={PAGE_SIZE}
								currentPage={page}
								onPageChange={setPage}
							/>
						</div>
					)}
				</div>

				{selected && (
					<DetailPane
						preview={<ColorsCanvas pattern={selected} style={style} cells={11} interactive />}
						title={selected.id}
						subtitle={`${GRID_OPTIONS.find((o) => o.value === colorsGridOf(selected))?.label} · ${colorCountOf(selected)} colors · k=${selected.k}`}
						hint="drag to pan, wheel to zoom, double-click to reset"
						touchHint="drag to pan, pinch to zoom, double-tap to reset"
						playHref={playHref}
						open={detailOpen}
						onClose={() => setDetailOpen(false)}
						index={selectedIndex}
						count={slice?.length ?? 0}
						onStep={nav.step}
						onResetView={requestViewReset}
						meta={[
							["colored vertex classes", `k = ${selected.k}`],
							["palette", `${colorCountOf(selected)} colors`],
							[
								"period lattice",
								selected.patch ? (
									// Combined grid: the true world-coordinate period basis (the record's
									// lattice fields are 1x1 placeholders).
									<>
										T1 ({selected.patch.T1[0]}, {selected.patch.T1[1]}), T2 ({selected.patch.T2[0]},{" "}
										{selected.patch.T2[1]}) · {selected.patch.polys.length} tiles
									</>
								) : (
									<>
										({selected.a}, 0), ({selected.b}, {selected.d}) ·{" "}
										{colorsGridOf(selected) === "triangle" ? cellCount(selected) * 2 : cellCount(selected)}{" "}
										cells{colorsGridOf(selected) === "triangle" && " · basis at 60°"}
									</>
								),
							],
							["tile orbits", selected.tileOrbits],
							["edge orbits", selected.edgeOrbits],
						]}
					>
						<div>
							<div className="ta-label mb-1.5">colored vertex figures</div>
							<ul className="space-y-1">
								{selected.vcs.map((vc, i) => (
									<li key={i} className="font-mono text-xs text-fg-secondary">
										{vc}
									</li>
								))}
							</ul>
						</div>
					</DetailPane>
				)}
			</div>
		</div>
	);
}
