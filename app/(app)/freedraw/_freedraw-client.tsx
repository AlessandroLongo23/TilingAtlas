"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FreedrawCanvas } from "@/components/freedraw/freedraw-canvas";
import { ButtonGroup } from "@/components/ui/button-group";
import { Pagination } from "@/components/ui/pagination";
import { Switch } from "@/components/ui/switch";
import { analyseFaces, rankLabel, summarise, type FaceAnalysis } from "@/lib/freedraw/faces";
import {
	DEFAULT_FILTER,
	matches,
	parseFilter,
	regularActive,
	serializeFilter,
	sizeOptions,
	type FreedrawFilter,
	type SizeMode,
	type Tri,
} from "@/lib/freedraw/filter";
import { gridOf, type FreedrawGrid, type FreedrawPattern } from "@/lib/freedraw/pattern";
import { classifyRegular, REGULAR_KINDS, type RegularKind } from "@/lib/freedraw/regular";
import { FILL_MODES, type FillMode } from "@/lib/freedraw/render";
import { cn } from "@/lib/utils/cn";

const GRID_OPTIONS: { value: FreedrawGrid; label: string }[] = [
	{ value: "square", label: "square grid" },
	{ value: "triangle", label: "triangle grid" },
	{ value: "ts", label: "triangles + squares" },
];

// k ranges per grid track what the catalogues hold: squares to k=5, triangles to k=4, the combined
// grid to k=3.
const K_OPTIONS: Record<FreedrawGrid, { value: number; label: string }[]> = {
	square: [0, 1, 2, 3, 4, 5].map((k) => ({ value: k, label: k ? `k = ${k}` : "all k" })),
	triangle: [0, 1, 2, 3, 4].map((k) => ({ value: k, label: k ? `k = ${k}` : "all k" })),
	ts: [0, 1, 2, 3].map((k) => ({ value: k, label: k ? `k = ${k}` : "all k" })),
};

// "has" / "none" / "any" per face class, so the classes COMBINE. The old single-choice chip row could
// say "has a strip" but never "a strip is fine, an unbounded sheet is not".
const TRI_OPTIONS: { value: Tri; label: string }[] = [
	{ value: "require", label: "has" },
	{ value: "exclude", label: "none" },
	{ value: "any", label: "any" },
];

const TRI_ROWS: { field: "unbounded" | "strip" | "finite" | "holes"; label: string }[] = [
	{ field: "finite", label: "finite" },
	{ field: "strip", label: "strips" },
	{ field: "unbounded", label: "unbounded" },
	{ field: "holes", label: "holes" },
];

const SIZE_MODE_OPTIONS: { value: SizeMode; label: string }[] = [
	{ value: "all", label: "all of" },
	{ value: "any", label: "any of" },
];

// The regular-polygon filter. Every k-uniform tiling dissects onto a triangle/square grid (the octagon
// excepted — 135° has no such dissection), so these patterns contain the k-uniform tilings as the
// subfamily where every tile is regular. "unit" is that subfamily exactly (edge-to-edge); "regular"
// also keeps dilations. Each polygon is a has/none/any chip. The dodecagon needs a large period, so it
// first appears at k=3 (two 3.12.12 tilings) — its chip is nearly empty but not idle.
const REGULARITY_OPTIONS: { value: FreedrawFilter["regularity"]; label: string }[] = [
	{ value: "any", label: "any tiles" },
	{ value: "regular", label: "all regular" },
	{ value: "unit", label: "k-uniform" },
];

const POLYGON_LABEL: Record<RegularKind, string> = { 3: "△ 3", 4: "▢ 4", 6: "⬡ 6", 12: "12-gon" };

const FILL_OPTIONS = FILL_MODES.map(({ value, label }) => ({ value, label: label.toLowerCase() }));

// Thumbnails per page. Every mounted thumbnail is a live canvas with a ResizeObserver; the square
// catalogue is 53060 entries (k≤5), so the grid HAS to window them — this is the knob.
const PAGE_SIZE = 240;

const HEADER: Record<FreedrawGrid, string> = {
	square:
		"Periodic edge subsets of the square grid with no dead ends; tiles are whatever faces fall out " +
		"and may be infinite. k ≤ 3 (13 / 153 / 1254) enumerated independently AND reproduced from " +
		"Čtrnáct's solver; k = 4 (7848) and k = 5 (43792) decoded from his certificates only.",
	triangle:
		"The same game on the triangular grid: six edges per vertex, tiles are polyiamonds, strips or " +
		"sheets. k = 1 (19) verified against an independent enumeration; k = 2 (357), k = 3 (4683) and " +
		"k = 4 (39662) decoded from Čtrnáct's certificates only.",
	ts:
		"The combined triangles-and-squares grid. Records arrive as patches with their face " +
		"classification pre-baked, since there is no fixed lattice to flood.",
};

// Which catalogue files hold each grid's slices, and which k each covers. The page loads LAZILY: only
// the files for the selected grid+k are fetched and classified, so opening square k=5 pulls one 7.6MB
// file, not the whole ~35MB / 112k-pattern atlas. Cached module-wide, so switching back is instant.
const CATALOGUE: Record<FreedrawGrid, { url: string; ks: number[] }[]> = {
	square: [
		{ url: "/freedraw/solutions.json", ks: [1, 2, 3] },
		{ url: "/freedraw/solutions-k4.json", ks: [4] },
		{ url: "/freedraw/solutions-k5.json", ks: [5] },
	],
	triangle: [
		{ url: "/freedraw/tri-solutions.json", ks: [1, 2, 3] },
		{ url: "/freedraw/tri-solutions-k4.json", ks: [4] },
	],
	ts: [
		{ url: "/freedraw/ts-solutions-k1.json", ks: [1] },
		{ url: "/freedraw/ts-solutions-k2.json", ks: [2] },
		{ url: "/freedraw/ts-solutions-k3.json", ks: [3] },
	],
};

/** The catalogue files needed to show a grid+k slice (k = 0 means every k for that grid). */
const filesFor = (grid: FreedrawGrid, k: number): string[] =>
	CATALOGUE[grid].filter((f) => k === 0 || f.ks.includes(k)).map((f) => f.url);

// url -> loaded patterns. Populated on demand and kept for the session so re-opening a slice is instant.
const catalogueCache = new Map<string, FreedrawPattern[]>();

/** Fetch one catalogue file into the cache, tolerating absence (an empty list, never a broken page). */
const loadFile = (url: string): Promise<void> =>
	catalogueCache.has(url)
		? Promise.resolve()
		: fetch(url)
				.then((r) => (r.ok ? (r.json() as Promise<FreedrawPattern[]>) : []))
				.catch(() => [] as FreedrawPattern[])
				.then((d) => {
					catalogueCache.set(url, d);
				});

export function FreedrawClient() {
	const searchParams = useSearchParams();
	// Read the URL exactly once, on mount; from then on we only WRITE it (replaceState below), the way
	// ReferenceShelf does. Browser back/forward inside the page is therefore not a filter-state source.
	const [initialFilter] = useState(() => parseFilter(searchParams));
	const [error, setError] = useState<string | null>(null);
	const [filter, setFilter] = useState<FreedrawFilter>(initialFilter);
	// Bumped when a needed catalogue file finishes loading, to re-derive the slice from the mutable cache.
	const [loadTick, setLoadTick] = useState(0);
	const [page, setPage] = useState(1);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [fillMode, setFillMode] = useState<FillMode>("rank");
	const [showScaffold, setShowScaffold] = useState(true);
	const [showVertices, setShowVertices] = useState(false);
	const [showLattice, setShowLattice] = useState(false);

	// Fetch only the files the current grid+k needs, on demand. Switching grid or k triggers this; files
	// already cached resolve instantly and re-tick so the slice recomputes.
	useEffect(() => {
		let live = true;
		const urls = filesFor(filter.grid, filter.k);
		Promise.all(urls.map(loadFile))
			.then(() => live && setLoadTick((n) => n + 1))
			.catch((e: Error) => live && setError(e.message));
		return () => {
			live = false;
		};
	}, [filter.grid, filter.k]);

	// The grid + k slice, classified. ONLY this slice is analysed — the win over classifying all 112k
	// patterns up front. null while its files are still loading. Deriving the size chips from the SLICE
	// rather than from `shown` is deliberate: chips computed after the size filter would vanish as you
	// picked them, reshuffling the row under the cursor. loadTick is a dep so it recomputes on load.
	const slice = useMemo(() => {
		const urls = filesFor(filter.grid, filter.k);
		if (!urls.every((u) => catalogueCache.has(u))) return null;
		const out: { pattern: FreedrawPattern; stats: ReturnType<typeof summarise>; analysis: ReturnType<typeof analyseFaces> }[] = [];
		for (const u of urls) {
			for (const p of catalogueCache.get(u) ?? []) {
				if (gridOf(p) === filter.grid && (!filter.k || p.k === filter.k)) {
					const analysis = analyseFaces(p);
					out.push({ pattern: p, stats: summarise(analysis), analysis });
				}
			}
		}
		return out;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filter.grid, filter.k, loadTick]);

	const sizes = useMemo(() => sizeOptions((slice ?? []).map((r) => r.stats)), [slice]);

	const shown = useMemo(() => {
		if (!slice) return [];
		const needReg = regularActive(filter);
		return slice.filter(({ stats, pattern, analysis }) =>
			matches(stats, filter, needReg ? classifyRegular(pattern, analysis) : undefined),
		);
	}, [slice, filter]);

	const pageRows = useMemo(
		() => shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
		[shown, page],
	);

	const selected = useMemo(
		() => shown.find((r) => r.pattern.id === selectedId) ?? pageRows[0] ?? null,
		[shown, pageRows, selectedId],
	);
	const detail = useMemo(
		() => (selected ? analyseFaces(selected.pattern) : null),
		[selected],
	);

	// The detail pane is the interactive one, so it carries the lattice overlay and the orbit hover; the
	// thumbnails stay plain line art (neither reads at 116px, and the hover loop would run per canvas).
	const style = useMemo(
		() => ({ fillMode, showScaffold, showVertices, showLattice, lineWidth: 1 }),
		[fillMode, showScaffold, showVertices, showLattice],
	);
	const thumbStyle = useMemo(
		() => ({ fillMode, showScaffold, showVertices: false, showLattice: false, lineWidth: 1 }),
		[fillMode, showScaffold],
	);

	// Mirror the filter into the URL without navigating, so a reload restores the view and the address
	// bar is the share link. replaceState keeps this off the Next router: no server round-trip, no
	// history spam. Same pattern as components/reference-shelf.tsx.
	useEffect(() => {
		const q = serializeFilter(filter);
		window.history.replaceState(
			null,
			"",
			q ? `${window.location.pathname}?${q}` : window.location.pathname,
		);
	}, [filter]);

	// Every filter change lands on page 1. Done here, in the one funnel all of them pass through, rather
	// than in an effect on `filter` — that would be a second render for every click, and it would also
	// have to special-case the mount to keep a shared link from being clobbered back to page 1.
	const update = (patch: Partial<FreedrawFilter>) => {
		setFilter((f) => ({ ...f, ...patch }));
		setPage(1);
	};

	// Switching grid resets k (the two catalogues stop at different k) and the size set (sizes are
	// polyominoes on one grid and polyiamonds on the other, so a carried-over 12 would mean something
	// else). The rank toggles are grid-independent and survive.
	const switchGrid = (grid: FreedrawGrid) => {
		update({ grid, k: 0, sizes: [] });
		setSelectedId(null);
	};

	const toggleSize = (n: number) =>
		update({
			sizes: filter.sizes.includes(n)
				? filter.sizes.filter((s) => s !== n)
				: [...filter.sizes, n].sort((a, b) => a - b),
		});

	const setPolygon = (n: RegularKind, v: Tri) =>
		update({ polygons: { ...filter.polygons, [n]: v } });

	const resetFilters = () => {
		setFilter({ ...DEFAULT_FILTER, grid: filter.grid });
		setPage(1);
	};

	const sizesEnabled = filter.finite === "require";
	const isDefault =
		serializeFilter(filter) === serializeFilter({ ...DEFAULT_FILTER, grid: filter.grid });

	if (error) {
		return <div className="p-8 text-danger">Could not load the freedraw catalogue: {error}</div>;
	}

	return (
		<div className="flex flex-col h-full min-h-0">
			<header className="shrink-0 border-b border-line-subtle px-5 py-3">
				<div className="flex items-baseline gap-3 flex-wrap">
					<h1 className="text-lg font-semibold text-text-primary">Freedraw</h1>
					<p className="text-sm text-text-muted">{HEADER[filter.grid]}</p>
				</div>

				{/* Row 1 — what is shown. */}
				<div className="mt-3 flex items-center gap-x-5 gap-y-2 flex-wrap text-sm">
					<ButtonGroup options={GRID_OPTIONS} selected={filter.grid} onChange={switchGrid} size="sm" />
					<ButtonGroup
						options={K_OPTIONS[filter.grid]}
						selected={filter.k}
						onChange={(k) => update({ k })}
						size="sm"
					/>
					{TRI_ROWS.map(({ field, label }) => (
						<label key={field} className="flex items-center gap-2 text-text-secondary">
							{label}
							<ButtonGroup
								options={TRI_OPTIONS}
								selected={filter[field]}
								onChange={(v) => update({ [field]: v } as Partial<FreedrawFilter>)}
								size="sm"
							/>
						</label>
					))}
					<span className="text-text-muted ml-auto tabular-nums">
						{slice === null ? "loading…" : `${shown.length} of ${slice.length}`}
					</span>
				</div>

				{/* Row 2 — the size sub-filter, live only while the finite class is required. Sizes are the
				    ones actually present in the current grid + k slice: they are sparse and gappy (square
				    k=4 runs 2..8 then 12..14), so a fixed range would offer dead chips and hide real ones. */}
				{sizes.length > 0 && (
					<div
						className={cn(
							"mt-2 flex items-center gap-x-3 gap-y-2 flex-wrap text-sm",
							!sizesEnabled && "opacity-40",
						)}
					>
						<span className="text-text-secondary">
							tile size {sizesEnabled ? "" : "(needs finite: has)"}
						</span>
						<ButtonGroup
							options={SIZE_MODE_OPTIONS}
							selected={filter.sizeMode}
							onChange={(sizeMode) => update({ sizeMode })}
							size="sm"
							classes={sizesEnabled ? undefined : "pointer-events-none"}
						/>
						<ButtonGroup
							multi
							options={sizes.map((n) => ({ value: n, label: String(n) }))}
							selected={filter.sizes}
							onChange={toggleSize}
							size="sm"
							classes={sizesEnabled ? undefined : "pointer-events-none"}
						/>
						{filter.sizes.length > 0 && sizesEnabled && (
							<button
								type="button"
								onClick={() => update({ sizes: [] })}
								className="text-xs text-text-muted underline underline-offset-2 hover:text-text-primary"
							>
								clear
							</button>
						)}
					</div>
				)}

				{/* Row 2b — the regular-polygon filter. This is the bridge to the classical catalogue: the
				    "k-uniform" mode keeps only edge-to-edge tilings by regular polygons, and the per-polygon
				    chips select a composition ("triangles and dodecagons, no squares"). */}
				<div className="mt-2 flex items-center gap-x-4 gap-y-2 flex-wrap text-sm">
					<label className="flex items-center gap-2 text-text-secondary">
						regularity
						<ButtonGroup
							options={REGULARITY_OPTIONS}
							selected={filter.regularity}
							onChange={(regularity) => update({ regularity })}
							size="sm"
						/>
					</label>
					<span className="text-text-secondary">polygons</span>
					{REGULAR_KINDS.map((n) => (
						<label key={n} className="flex items-center gap-1.5 text-text-secondary">
							{POLYGON_LABEL[n]}
							<ButtonGroup
								options={TRI_OPTIONS}
								selected={filter.polygons[n]}
								onChange={(v) => setPolygon(n, v)}
								size="sm"
							/>
						</label>
					))}
				</div>

				{/* Row 3 — how it is drawn. */}
				<div className="mt-2 flex items-center gap-5 flex-wrap text-sm">
					<label className="flex items-center gap-2 text-text-secondary">
						fill
						<ButtonGroup options={FILL_OPTIONS} selected={fillMode} onChange={setFillMode} size="sm" />
					</label>
					<label className="flex items-center gap-2 text-text-secondary">
						<Switch checked={showScaffold} onCheckedChange={setShowScaffold} size="sm" />
						grid
					</label>
					<label className="flex items-center gap-2 text-text-secondary">
						<Switch checked={showLattice} onCheckedChange={setShowLattice} size="sm" />
						lattice
					</label>
					<label className="flex items-center gap-2 text-text-secondary">
						<Switch checked={showVertices} onCheckedChange={setShowVertices} size="sm" />
						orbits
					</label>
					{!isDefault && (
						<button
							type="button"
							onClick={resetFilters}
							className="ml-auto text-xs text-text-muted underline underline-offset-2 hover:text-text-primary"
						>
							reset filters
						</button>
					)}
				</div>
			</header>

			<div className="flex-1 min-h-0 flex">
				<div className="flex-1 min-w-0 overflow-y-auto p-4">
					{slice === null && <div className="p-8 text-text-muted">Loading the {filter.grid} catalogue…</div>}
					<div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(116px,1fr))]">
						{pageRows.map(({ pattern, stats }) => (
							<button
								key={pattern.id}
								type="button"
								onClick={() => setSelectedId(pattern.id)}
								className={cn(
									"rounded-md overflow-hidden border text-left transition-colors",
									selected?.pattern.id === pattern.id
										? "border-accent ring-1 ring-accent"
										: "border-line-subtle hover:border-border-strong",
								)}
							>
								<div className="aspect-square">
									<FreedrawCanvas pattern={pattern} style={thumbStyle} cells={7} />
								</div>
								<div className="px-1.5 py-1 text-[11px] leading-tight text-text-muted">
									<div className="text-text-secondary">{pattern.id}</div>
									<div>
										{stats.faceOrbits} tile{stats.faceOrbits === 1 ? "" : "s"}
										{stats.strips > 0 && " · strip"}
										{stats.unbounded > 0 && " · ∞"}
										{stats.withHoles > 0 && " · holes"}
									</div>
								</div>
							</button>
						))}
					</div>
					{shown.length > PAGE_SIZE && (
						<div className="mt-4 flex justify-center">
							<Pagination
								totalItems={shown.length}
								pageSize={PAGE_SIZE}
								currentPage={page}
								onPageChange={setPage}
							/>
						</div>
					)}
				</div>

				{selected && detail && (
					<aside className="w-[380px] shrink-0 border-l border-line-subtle flex flex-col min-h-0">
						<div className="aspect-square border-b border-line-subtle">
							<FreedrawCanvas pattern={selected.pattern} style={style} cells={11} interactive />
						</div>
						<div className="p-4 overflow-y-auto text-sm space-y-3">
							<div>
								<div className="font-semibold text-text-primary">{selected.pattern.id}</div>
								<div className="text-text-muted text-xs">
									drag to pan, wheel to zoom, double-click to reset
								</div>
							</div>
							<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
								<dt className="text-text-muted">grid-point orbits</dt>
								<dd className="text-text-secondary">k = {selected.pattern.k}</dd>
								<dt className="text-text-muted">period lattice</dt>
								<dd className="text-text-secondary">
									{selected.pattern.patch ? (
										// Combined grid: the true world-coordinate period basis, since the record's
										// lattice-bits fields are 1x1 placeholders.
										<>
											T1 ({selected.pattern.patch.T1[0]}, {selected.pattern.patch.T1[1]}), T2 (
											{selected.pattern.patch.T2[0]}, {selected.pattern.patch.T2[1]}) ·{" "}
											{selected.pattern.patch.verts.length} vertices
										</>
									) : (
										<>
											({selected.pattern.a}, 0), ({selected.pattern.b}, {selected.pattern.d}) · index{" "}
											{selected.pattern.a * selected.pattern.d}
											{gridOf(selected.pattern) === "triangle" && " · basis at 60°"}
										</>
									)}
								</dd>
								<dt className="text-text-muted">tile orbits</dt>
								<dd className="text-text-secondary">{detail.faces.length}</dd>
							</dl>
							<div>
								<div className="text-xs text-text-muted mb-1">tiles</div>
								<ul className="space-y-1">
									{detail.faces.map((f) => (
										<li key={f.id} className="text-xs text-text-secondary">
											<span className="text-text-primary">{rankLabel(f.rank, detail.grid)}</span>
											{f.rank === 0 && ` · ${f.cells} cell${f.cells === 1 ? "" : "s"}`}
											{f.rank === 0 && f.holes > 0 && ` · ${f.holes} hole${f.holes === 1 ? "" : "s"}`}
											{f.rank === 1 &&
												f.period &&
												` · ${f.cells} cell${f.cells === 1 ? "" : "s"} per period (${f.period[0]}, ${f.period[1]})`}
											{f.rank === 2 && " in both directions"}
										</li>
									))}
								</ul>
							</div>
						</div>
					</aside>
				)}
			</div>
		</div>
	);
}
