"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Library, Loader2, X } from "lucide-react";
import { PageSidebar } from "@/components/page-sidebar";
import { ButtonGroup } from "@/components/ui/button-group";
import { ToggleButton } from "@/components/ui/toggle-button";
import { Pagination } from "@/components/ui/pagination";
import { ReferenceCard } from "@/components/reference-card";
import {
	loadReferenceAtlas,
	loadReferenceAtlasShard,
	matchesReferenceFilters,
	partitionKeyOf,
	starFoldsOf,
	tileClassOf,
	type Certification,
	type ReferenceTiling,
	type ReferenceFilter,
	type TileClass,
} from "@/lib/services/referenceAtlas";
import { WALLPAPER_GROUPS, type LatticeShape, type WallpaperGroup } from "@/lib/classes/symmetry/types";
import { LIBRARY_TILINGS_PER_PAGE } from "@/lib/constants";

// The unified Tiling Library: one display-only atlas of every tiling (regular k=1..7 + stars in the
// base file; regular k=8..10 as lazy per-k shards loaded on demand), fetched from public/reference-
// atlas*.json. Each entry carries a DISCOVERER (historical
// first-finder), a CERTIFICATION (proven / reproduced / candidate), and a vertex-type classification
// (k, M, partition — see referenceAtlas.ts). Filters are flat and always-open (no accordion); groups
// irrelevant to the current tile-class selection are hidden rather than shown as dead controls.
//
// k / M / partition are SINGLE-select (pick one, or "All"). M and partition only appear once a k is
// chosen, and their chips are faceted to values that actually occur under the current filters — so at
// k=4 you see M ∈ {2,3,4}, never a dead M=1 button.
const CLASS_OPTIONS: { value: "all" | TileClass; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "regular", label: "Regular" },
	{ value: "star", label: "Star" },
	{ value: "composable", label: "Composable" },
];
// Composable-shelf facet: the whole demo, only decomposable-family tilings, or only the ones that
// reach for a non-decomposable composite. Shown only while the Composable tile class is selected.
const DECOMP_OPTIONS: { value: "all" | "decomposable" | "non-decomposable"; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "decomposable", label: "Decomposable" },
	{ value: "non-decomposable", label: "Uses non-decomp." },
];
const PARAM_OPTIONS: { value: "all" | "rigid" | "family"; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "rigid", label: "Rigid" },
	{ value: "family", label: "α-family" },
];
const DISCOVERER_OPTIONS: { value: string; label: string }[] = [
	{ value: "Kepler", label: "Kepler" },
	{ value: "Krötenheerdt", label: "Krötenheerdt" },
	{ value: "Chavey", label: "Chavey" },
	{ value: "Brian Galebach", label: "Galebach" },
	{ value: "Marek Čtrnáct", label: "Čtrnáct" },
	{ value: "Joseph Myers", label: "Myers" },
	{ value: "Alessandro Longo", label: "Longo" },
];
const CERT_OPTIONS: { value: Certification; label: string }[] = [
	{ value: "proven", label: "Proven" },
	{ value: "reproduced", label: "Reproduced" },
	{ value: "candidate", label: "Candidate" },
];
const LATTICE_ORDER: LatticeShape[] = ["square", "hexagonal", "rhombic", "rectangular", "oblique"];
const COLUMN_PRESETS = [3, 4, 5, 6];
// Čtrnáct tiers beyond the base atlas (k≤7), shipped as separate lazy shards (public/reference-atlas-
// k{k}.json). Their k chips always show; selecting one fetches the shard on demand and merges it in.
const HIGHER_K = [8, 9, 10];
const ALL_NUM = 0; // sentinel: the "All" chip for a single-select numeric group (k / M)
const ALL_STR = ""; // sentinel: the "All" chip for the partition group

// A flat, always-visible filter group: a static heading (optional accent summary + right-aligned note)
// over its controls. Replaces the old collapsible SidebarSection in this shelf.
function FilterGroup({
	title,
	summary,
	note,
	children,
}: {
	title: string;
	summary?: ReactNode;
	note?: string;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-2 border-t border-line-subtle pt-3 first:border-t-0 first:pt-0">
			<div className="flex items-baseline justify-between gap-2">
				<h3 className="text-xs font-medium text-fg-secondary">
					{title}
					{summary ? <span className="ml-1.5 font-normal text-accent">{summary}</span> : null}
				</h3>
				{note ? <span className="text-[10px] uppercase tracking-wide text-fg-disabled">{note}</span> : null}
			</div>
			{children}
		</section>
	);
}

export function ReferenceShelf() {
	const router = useRouter();
	const [tilings, setTilings] = useState<ReferenceTiling[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [filters, setFilters] = useState<ReferenceFilter>({});
	const [gridColumns, setGridColumns] = useState(5);
	const [currentPage, setCurrentPage] = useState(1);
	const [loadedShards, setLoadedShards] = useState<Set<number>>(new Set());
	const [loadingShards, setLoadingShards] = useState<Set<number>>(new Set());
	const [shardErrors, setShardErrors] = useState<Map<number, string>>(new Map());

	useEffect(() => {
		let alive = true;
		loadReferenceAtlas()
			.then((d) => alive && setTilings(d))
			.catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
		return () => {
			alive = false;
		};
	}, []);

	useEffect(() => {
		setCurrentPage(1);
	}, [filters]);

	// Lazy k≥8 shards: selecting the k fetches public/reference-atlas-k{k}.json once and merges the
	// records into `tilings`, so every derived facet (k chips, filtered, pagination) picks them up. A
	// failed shard is sticky (won't refetch until Clear) and surfaces an inline error by the count.
	useEffect(() => {
		const k = filters.kValue;
		if (k == null || k < 8) return;
		if (loadedShards.has(k) || loadingShards.has(k) || shardErrors.has(k)) return;
		setLoadingShards((s) => new Set(s).add(k));
		loadReferenceAtlasShard(k)
			.then((data) => {
				setTilings((prev) => (prev ? [...prev, ...data] : data));
				setLoadedShards((s) => new Set(s).add(k));
			})
			.catch((e) => setShardErrors((m) => new Map(m).set(k, e instanceof Error ? e.message : String(e))))
			.finally(() =>
				setLoadingShards((s) => {
					const n = new Set(s);
					n.delete(k);
					return n;
				}),
			);
	}, [filters.kValue, loadedShards, loadingShards, shardErrors]);

	// ── single-select setters (each clears the now-stale downstream selections) ──
	const setKValue = (k: number | undefined) =>
		setFilters({ ...filters, kValue: k, mValue: undefined, partitionKey: undefined });
	const setMValue = (m: number | undefined) => setFilters({ ...filters, mValue: m, partitionKey: undefined });
	const setPartitionKey = (p: string | undefined) => setFilters({ ...filters, partitionKey: p });
	const toggleMaximal = () => setFilters({ ...filters, maximalOnly: filters.maximalOnly ? undefined : true });
	const setParametric = (v: "all" | "rigid" | "family") =>
		setFilters({ ...filters, parametric: v === "all" ? undefined : v });
	const setTileClass = (v: "all" | TileClass) => {
		const cls = v === "all" ? undefined : v;
		const next: ReferenceFilter = { ...filters, tileClass: cls };
		// k chips are faceted per class — if the current k isn't covered by the new class (e.g. k=10
		// under Star), drop it (and its now-stale M/partition) so we don't silently filter to 0.
		if (next.kValue != null && !kValuesForClass(cls).has(next.kValue)) {
			next.kValue = undefined;
			next.mValue = undefined;
			next.partitionKey = undefined;
		}
		// The decomposable facet only means something inside the composable class — drop it otherwise.
		if (v !== "composable") next.composableDecomp = undefined;
		if (v === "regular") {
			next.starFolds = undefined;
			next.parametric = undefined;
		} else if (v === "star") {
			next.wallpaperGroups = undefined;
			next.latticeShapes = undefined;
		} else if (v === "composable") {
			// No star folds, α-family, wallpaper group, or lattice on the composite-tile demo.
			next.starFolds = undefined;
			next.parametric = undefined;
			next.wallpaperGroups = undefined;
			next.latticeShapes = undefined;
		}
		setFilters(next);
	};
	const setComposableDecomp = (v: "all" | "decomposable" | "non-decomposable") =>
		setFilters({ ...filters, composableDecomp: v === "all" ? undefined : v });

	// ── multi-select setters (empty ⇒ undefined so the filter clears and the active-count stays honest) ──
	const toggleIn = <T,>(key: keyof ReferenceFilter, cur: readonly T[], v: T) => {
		const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
		setFilters({ ...filters, [key]: next.length ? next : undefined } as ReferenceFilter);
	};
	const toggleFold = (n: number) => toggleIn("starFolds", filters.starFolds ?? [], n);
	const toggleGroup = (g: WallpaperGroup) => toggleIn("wallpaperGroups", filters.wallpaperGroups ?? [], g);
	const toggleShape = (s: LatticeShape) => toggleIn("latticeShapes", filters.latticeShapes ?? [], s);
	const toggleDiscoverer = (d: string) => toggleIn("discoverers", filters.discoverers ?? [], d);
	const toggleCert = (c: Certification) => toggleIn("certifications", filters.certifications ?? [], c);

	// ── option sets: only offer filters some in-scope tiling can actually satisfy ──
	// The k's a given tile class actually covers. Faceted, so Star/Composable (k=1..3 today) never show
	// a dead k=10 button. The lazy higher-k tiers (8/9/10) are all regular Čtrnáct, so they're offered
	// only when regular tilings are in scope (All or Regular) — before their shard is even fetched.
	const kValuesForClass = useCallback(
		(cls: TileClass | undefined): Set<number> => {
			const s = new Set<number>();
			if (tilings) for (const t of tilings) if (!cls || tileClassOf(t) === cls) s.add(t.k);
			if (!cls || cls === "regular") for (const k of HIGHER_K) s.add(k);
			return s;
		},
		[tilings],
	);
	const kChips = useMemo(
		() => [...kValuesForClass(filters.tileClass)].sort((a, b) => a - b),
		[kValuesForClass, filters.tileClass],
	);

	// M chips are faceted to the current view MINUS M/partition: at k=4 they resolve to {2,3,4}.
	const mOptions = useMemo(() => {
		if (!tilings || filters.kValue == null) return [];
		const s = new Set<number>();
		for (const t of tilings) {
			if (t.m == null) continue;
			if (matchesReferenceFilters(t, { ...filters, mValue: undefined, partitionKey: undefined })) s.add(t.m);
		}
		return [...s].sort((a, b) => a - b);
	}, [tilings, filters]);

	// Partition chips faceted to the current view MINUS the partition itself — so they narrow with the
	// chosen k (and M, if one is picked): k=7 → 511/421/331/…; k=7,M=3 → just the M=3 partitions.
	const partitionOptions = useMemo(() => {
		if (!tilings || filters.kValue == null) return [];
		const byKey = new Map<string, number>(); // key → m (for ordering)
		for (const t of tilings) {
			if (!matchesReferenceFilters(t, { ...filters, partitionKey: undefined })) continue;
			const key = partitionKeyOf(t);
			if (key && t.m != null) byKey.set(key, t.m);
		}
		return [...byKey.entries()]
			.map(([key, m]) => ({ key, m }))
			.sort((a, b) => a.m - b.m || (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
	}, [tilings, filters]);

	const availableFolds = useMemo(() => {
		if (!tilings) return [];
		const s = new Set<number>();
		for (const t of tilings) for (const n of starFoldsOf(t)) s.add(n);
		return [...s].sort((a, b) => a - b);
	}, [tilings]);

	const availableGroups = useMemo(() => {
		if (!tilings) return [];
		const present = new Set(tilings.map((t) => t.wallpaperGroup).filter((g): g is WallpaperGroup => !!g));
		return WALLPAPER_GROUPS.filter((g) => present.has(g));
	}, [tilings]);

	const availableShapes = useMemo(() => {
		if (!tilings) return [];
		const present = new Set(tilings.map((t) => t.latticeShape).filter((s): s is LatticeShape => !!s));
		return LATTICE_ORDER.filter((s) => present.has(s));
	}, [tilings]);

	const tileClass = filters.tileClass ?? "all";
	const showM = filters.kValue != null && tileClass !== "composable";
	const showStar = tileClass !== "regular" && tileClass !== "composable" && availableFolds.length > 0;
	const showGroup = tileClass !== "star" && tileClass !== "composable" && availableGroups.length > 0;
	const showLattice = tileClass !== "star" && tileClass !== "composable" && availableShapes.length > 0;
	const showComposable = tileClass === "composable";

	const activeFilterCount =
		(filters.kValue != null ? 1 : 0) +
		(filters.tileClass ? 1 : 0) +
		(filters.composableDecomp ? 1 : 0) +
		(filters.mValue != null ? 1 : 0) +
		(filters.partitionKey != null ? 1 : 0) +
		(filters.maximalOnly ? 1 : 0) +
		(filters.starFolds?.length ? 1 : 0) +
		(filters.parametric ? 1 : 0) +
		(filters.wallpaperGroups?.length ? 1 : 0) +
		(filters.latticeShapes?.length ? 1 : 0) +
		(filters.discoverers?.length ? 1 : 0) +
		(filters.certifications?.length ? 1 : 0) +
		(filters.query?.trim() ? 1 : 0);

	const filtered = useMemo(() => {
		if (!tilings) return [];
		return tilings
			.filter((t) => matchesReferenceFilters(t, filters))
			.sort((a, b) => a.k - b.k || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	}, [tilings, filters]);

	const paginated = useMemo(
		() => filtered.slice((currentPage - 1) * LIBRARY_TILINGS_PER_PAGE, currentPage * LIBRARY_TILINGS_PER_PAGE),
		[filtered, currentPage],
	);

	const gridStyle = { gridTemplateColumns: `repeat(${gridColumns}, 1fr)` };

	return (
		<div className="flex flex-1 min-h-0 overflow-hidden">
			<PageSidebar>
				<div className="flex items-center justify-between px-3 pt-3">
					<span className="text-xs font-medium text-fg-muted uppercase tracking-wider">Filters</span>
					{activeFilterCount > 0 ? (
						<button
							onClick={() => setFilters({})}
							className="flex items-center gap-1 text-xs text-fg-muted hover:text-danger transition-colors"
						>
							<X size={11} /> Clear ({activeFilterCount})
						</button>
					) : null}
				</div>
				<div className="p-3 flex flex-col gap-4 text-sm">
					<input
						type="text"
						value={filters.query ?? ""}
						onChange={(e) => setFilters({ ...filters, query: e.target.value })}
						placeholder="Search id or family…"
						className="w-full rounded-md border border-line bg-surface-raised px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-disabled focus:border-line-strong focus:outline-none"
					/>

					<FilterGroup title="Tile class" summary={filters.tileClass ?? null}>
						<ButtonGroup options={CLASS_OPTIONS} selected={tileClass} onChange={setTileClass} />
					</FilterGroup>

					{showComposable ? (
						<FilterGroup
							title="Composite palette"
							summary={filters.composableDecomp ?? null}
							note="demo, not all-and-only"
						>
							<ButtonGroup
								options={DECOMP_OPTIONS}
								selected={filters.composableDecomp ?? "all"}
								onChange={setComposableDecomp}
							/>
						</FilterGroup>
					) : null}

					<FilterGroup title="Vertex count (k)" summary={filters.kValue ?? null}>
						<ButtonGroup
							options={[
								{ value: ALL_NUM, label: "All", classes: "px-2.5" },
								...kChips.map((k) => ({ value: k, label: k, classes: "w-8" })),
							]}
							selected={filters.kValue ?? ALL_NUM}
							onChange={(v) => setKValue(v === ALL_NUM ? undefined : v)}
						/>
						<ToggleButton
							size="sm"
							pressed={!!filters.maximalOnly}
							onPressedChange={toggleMaximal}
							label="Maximal (M = k)"
							classes="mt-1 self-start"
						/>
						{kChips.some((k) => k >= 8) ? (
							<p className="mt-1 text-[10px] text-fg-disabled">k ≥ 8 loads on demand.</p>
						) : null}
					</FilterGroup>

					{showM ? (
						<FilterGroup title="Distinct configs (M)" summary={filters.mValue ?? null} note="M ≤ k">
							<ButtonGroup
								options={[
									{ value: ALL_NUM, label: "All", classes: "px-2.5" },
									...mOptions.map((m) => ({ value: m, label: m, classes: "w-8" })),
								]}
								selected={filters.mValue ?? ALL_NUM}
								onChange={(v) => setMValue(v === ALL_NUM ? undefined : v)}
							/>
							{partitionOptions.length > 0 ? (
								<div className="mt-1 flex flex-col gap-1.5">
									<span className="text-[10px] text-fg-disabled">Partition (multiplicity group)</span>
									<ButtonGroup
										options={[
											{ value: ALL_STR, label: "All", key: "__all__" },
											...partitionOptions.map((p) => ({ value: p.key, label: p.key })),
										]}
										selected={filters.partitionKey ?? ALL_STR}
										onChange={(v) => setPartitionKey(v === ALL_STR ? undefined : v)}
									/>
								</div>
							) : null}
						</FilterGroup>
					) : null}

					{showStar ? (
						<FilterGroup title="Star" note="star polygons">
							<div className="flex flex-col gap-1.5">
								<span className="text-[10px] text-fg-disabled">Fold (n-pointed)</span>
								<ButtonGroup
									multi
									options={availableFolds.map((n) => ({ value: n, label: `${n}★`, classes: "px-2" }))}
									selected={filters.starFolds ?? []}
									onChange={toggleFold}
								/>
							</div>
							<div className="mt-1 flex flex-col gap-1.5">
								<span className="text-[10px] text-fg-disabled">Shape</span>
								<ButtonGroup
									options={PARAM_OPTIONS}
									selected={filters.parametric ?? "all"}
									onChange={setParametric}
								/>
							</div>
						</FilterGroup>
					) : null}

					{showGroup ? (
						<FilterGroup
							title="Wallpaper group"
							summary={filters.wallpaperGroups?.length ? `${filters.wallpaperGroups.length} sel` : null}
							note="regular"
						>
							<ButtonGroup
								multi
								options={availableGroups.map((g) => ({ value: g, label: g }))}
								selected={filters.wallpaperGroups ?? []}
								onChange={toggleGroup}
							/>
						</FilterGroup>
					) : null}

					{showLattice ? (
						<FilterGroup
							title="Lattice"
							summary={filters.latticeShapes?.length ? `${filters.latticeShapes.length} sel` : null}
							note="regular"
						>
							<ButtonGroup
								multi
								options={availableShapes.map((s) => ({ value: s, label: s }))}
								selected={filters.latticeShapes ?? []}
								onChange={toggleShape}
							/>
						</FilterGroup>
					) : null}

					<FilterGroup
						title="Discoverer"
						summary={filters.discoverers?.length ? `${filters.discoverers.length} selected` : null}
					>
						<ButtonGroup
							multi
							options={DISCOVERER_OPTIONS}
							selected={filters.discoverers ?? []}
							onChange={toggleDiscoverer}
						/>
					</FilterGroup>

					<FilterGroup
						title="Certification"
						summary={filters.certifications?.length ? filters.certifications.join(", ") : null}
					>
						<ButtonGroup
							multi
							options={CERT_OPTIONS}
							selected={filters.certifications ?? []}
							onChange={toggleCert}
						/>
					</FilterGroup>

					<FilterGroup title="Grid" summary={`${gridColumns} cols`}>
						<ButtonGroup
							options={COLUMN_PRESETS.map((c) => ({ value: c, label: c, classes: "w-8" }))}
							selected={gridColumns}
							onChange={setGridColumns}
						/>
					</FilterGroup>
				</div>
			</PageSidebar>

			{/* `relative` makes this scroll pane the containing block for the Pagination's absolutely-
			    positioned sr-only <label>; without it the label anchors to <html> and stretches the
			    document ~1000px below the app shell (a phantom black scroll region). */}
			<main className="relative flex-1 overflow-y-auto p-5">
				<div className="flex items-center gap-3 mb-5">
					<Library size={18} className="text-sky-400" />
					<h1 className="text-base font-semibold text-fg">Tiling Library</h1>
					<span className="text-xs px-2 py-0.5 rounded-full bg-surface-overlay border border-line text-fg-muted">
						{filtered.length} tilings
					</span>
					{loadingShards.size > 0 ? (
						<span className="flex items-center gap-1.5 text-xs text-fg-muted">
							<Loader2 size={12} className="animate-spin text-sky-400" />
							loading k={[...loadingShards].sort((a, b) => a - b).join(", ")}…
						</span>
					) : null}
					{shardErrors.size > 0 ? (
						<span className="text-xs text-danger">
							failed to load k={[...shardErrors.keys()].sort((a, b) => a - b).join(", ")}
						</span>
					) : null}
				</div>

				{error ? (
					<div className="flex flex-col items-center justify-center py-24 text-center">
						<p className="text-danger font-medium">Could not load the tiling library</p>
						<p className="text-fg-disabled text-sm mt-1 font-mono">{error}</p>
					</div>
				) : tilings === null ? (
					<div className="flex flex-col items-center justify-center py-24 text-center text-fg-muted">
						<Loader2 size={28} className="animate-spin mb-3 text-sky-400" />
						<p className="text-sm">Loading tiling library…</p>
					</div>
				) : filtered.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-24 text-center">
						<Library size={40} className="text-fg-disabled mb-4" />
						<p className="text-fg-muted font-medium">No tilings match the current filters.</p>
						{activeFilterCount > 0 ? (
							<button onClick={() => setFilters({})} className="text-accent hover:underline text-sm mt-1">
								Clear filters
							</button>
						) : null}
					</div>
				) : (
					<>
						<Pagination
							totalItems={filtered.length}
							pageSize={LIBRARY_TILINGS_PER_PAGE}
							currentPage={currentPage}
							onPageChange={setCurrentPage}
						/>
						<div className="grid gap-3 mt-4" style={gridStyle}>
							{paginated.map((tiling) => (
								<ReferenceCard
									key={tiling.id}
									tiling={tiling}
									onClick={(t) => router.push(`/play?source=reference&tiling=${encodeURIComponent(t.id)}`)}
								/>
							))}
						</div>
						<div className="mt-4">
							<Pagination
								totalItems={filtered.length}
								pageSize={LIBRARY_TILINGS_PER_PAGE}
								currentPage={currentPage}
								onPageChange={setCurrentPage}
							/>
						</div>
					</>
				)}
			</main>
		</div>
	);
}
