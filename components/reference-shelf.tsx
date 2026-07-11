"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Library, Loader2, X } from "lucide-react";
import { PageSidebar } from "@/components/page-sidebar";
import { ButtonGroup } from "@/components/ui/button-group";
import { ToggleButton } from "@/components/ui/toggle-button";
import { Pagination } from "@/components/ui/pagination";
import { ReferenceCard } from "@/components/reference-card";
import {
	loadReferenceAtlas,
	matchesReferenceFilters,
	partitionKeyOf,
	starFoldsOf,
	type ReferenceTiling,
	type ReferenceFilter,
} from "@/lib/services/referenceAtlas";
import { WALLPAPER_GROUPS, type LatticeShape, type WallpaperGroup } from "@/lib/classes/symmetry/types";
import { LIBRARY_TILINGS_PER_PAGE } from "@/lib/constants";

// The unified Tiling Library: one display-only atlas of every tiling (regular k=1..7 + stars),
// lazy-fetched from public/reference-atlas.json. Each entry carries a DISCOVERER (historical
// first-finder), a CERTIFICATION (proven / reproduced / candidate), and a vertex-type classification
// (k, M, partition — see referenceAtlas.ts). Filters are flat and always-open (no accordion); groups
// irrelevant to the current tile-class selection are hidden rather than shown as dead controls.
const K_OPTIONS = [1, 2, 3, 4, 5, 6, 7];
const M_OPTIONS = [1, 2, 3, 4, 5, 6, 7];
const CLASS_OPTIONS: { value: "all" | "regular" | "star"; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "regular", label: "Regular" },
	{ value: "star", label: "Star" },
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
const CERT_OPTIONS: { value: ReferenceTiling["certification"]; label: string }[] = [
	{ value: "proven", label: "Proven" },
	{ value: "reproduced", label: "Reproduced" },
	{ value: "candidate", label: "Candidate" },
];
const LATTICE_ORDER: LatticeShape[] = ["square", "hexagonal", "rhombic", "rectangular", "oblique"];
const COLUMN_PRESETS = [3, 4, 5, 6];

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

	// ── Multi-toggle helpers (empty ⇒ undefined so the filter clears and the active-count stays honest) ──
	const toggleIn = <T,>(key: keyof ReferenceFilter, cur: readonly T[], v: T) => {
		const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
		setFilters({ ...filters, [key]: next.length ? next : undefined } as ReferenceFilter);
	};
	const toggleK = (k: number) => toggleIn("kValues", filters.kValues ?? [], k);
	const toggleM = (m: number) => toggleIn("mValues", filters.mValues ?? [], m);
	const togglePartition = (p: string) => toggleIn("partitions", filters.partitions ?? [], p);
	const toggleFold = (n: number) => toggleIn("starFolds", filters.starFolds ?? [], n);
	const toggleGroup = (g: WallpaperGroup) => toggleIn("wallpaperGroups", filters.wallpaperGroups ?? [], g);
	const toggleShape = (s: LatticeShape) => toggleIn("latticeShapes", filters.latticeShapes ?? [], s);
	const toggleDiscoverer = (d: string) => toggleIn("discoverers", filters.discoverers ?? [], d);
	const toggleCert = (c: ReferenceTiling["certification"]) => toggleIn("certifications", filters.certifications ?? [], c);
	const toggleMaximal = () => setFilters({ ...filters, maximalOnly: filters.maximalOnly ? undefined : true });

	// Changing tile class clears the now-hidden filters so no invisible constraint lingers.
	const setTileClass = (v: "all" | "regular" | "star") => {
		const next: ReferenceFilter = { ...filters, tileClass: v === "all" ? undefined : v };
		if (v === "regular") {
			next.starFolds = undefined;
			next.parametric = undefined;
		} else if (v === "star") {
			next.wallpaperGroups = undefined;
			next.latticeShapes = undefined;
		}
		setFilters(next);
	};
	const setParametric = (v: "all" | "rigid" | "family") =>
		setFilters({ ...filters, parametric: v === "all" ? undefined : v });

	// ── Data-derived option sets: only offer filters some in-scope tiling can actually satisfy ──
	const availableM = useMemo(() => {
		if (!tilings) return [];
		const s = new Set<number>();
		for (const t of tilings) if (t.m != null) s.add(t.m);
		return M_OPTIONS.filter((m) => s.has(m));
	}, [tilings]);

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

	// Partition chips are faceted to the current view MINUS the partition filter itself, so they behave
	// like the user's "per-k groups": pick k=7 and only 7's partitions (511, 421, 331, …) appear.
	const availablePartitions = useMemo(() => {
		if (!tilings) return [];
		const byKey = new Map<string, number>(); // key → m
		for (const t of tilings) {
			if (!matchesReferenceFilters(t, { ...filters, partitions: undefined })) continue;
			const key = partitionKeyOf(t);
			if (key && t.m != null) byKey.set(key, t.m);
		}
		return [...byKey.entries()]
			.map(([key, m]) => ({ key, m }))
			.sort((a, b) => a.m - b.m || (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
	}, [tilings, filters]);

	const tileClass = filters.tileClass ?? "all";
	const showStar = tileClass !== "regular" && availableFolds.length > 0;
	const showGroup = tileClass !== "star" && availableGroups.length > 0;
	const showLattice = tileClass !== "star" && availableShapes.length > 0;

	const activeFilterCount =
		(filters.kValues?.length ? 1 : 0) +
		(filters.tileClass ? 1 : 0) +
		(filters.mValues?.length ? 1 : 0) +
		(filters.partitions?.length ? 1 : 0) +
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

					<FilterGroup title="Vertex count (k)" summary={filters.kValues?.length ? filters.kValues.join(", ") : null}>
						<ButtonGroup
							multi
							options={K_OPTIONS.map((k) => ({ value: k, label: k, classes: "w-8" }))}
							selected={filters.kValues ?? []}
							onChange={toggleK}
						/>
					</FilterGroup>

					{availableM.length > 0 ? (
						<FilterGroup
							title="Distinct configs (M)"
							summary={filters.mValues?.length ? filters.mValues.join(", ") : null}
							note="M ≤ k"
						>
							<ButtonGroup
								multi
								options={availableM.map((m) => ({ value: m, label: m, classes: "w-8" }))}
								selected={filters.mValues ?? []}
								onChange={toggleM}
							/>
							{availablePartitions.length > 0 ? (
								<div className="mt-1 flex flex-col gap-1.5">
									<span className="text-[10px] text-fg-disabled">Partition (multiplicity group)</span>
									<ButtonGroup
										multi
										options={availablePartitions.map((p) => ({ value: p.key, label: p.key }))}
										selected={filters.partitions ?? []}
										onChange={togglePartition}
									/>
								</div>
							) : null}
							<ToggleButton
								size="sm"
								pressed={!!filters.maximalOnly}
								onPressedChange={toggleMaximal}
								label="Maximal (M = k)"
								classes="mt-1 self-start"
							/>
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

			<main className="flex-1 overflow-y-auto p-5">
				<div className="flex items-center gap-3 mb-5">
					<Library size={18} className="text-sky-400" />
					<h1 className="text-base font-semibold text-fg">Tiling Library</h1>
					<span className="text-xs px-2 py-0.5 rounded-full bg-surface-overlay border border-line text-fg-muted">
						{filtered.length} tilings
					</span>
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
