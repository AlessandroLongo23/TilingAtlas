"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Library, Loader2, X } from "lucide-react";
import { PageSidebar } from "@/components/page-sidebar";
import { SidebarSection } from "@/components/ui/sidebar-section";
import { ButtonGroup } from "@/components/ui/button-group";
import { Pagination } from "@/components/ui/pagination";
import { ReferenceCard } from "@/components/reference-card";
import {
	loadReferenceAtlas,
	loadReferenceAtlasShard,
	matchesReferenceFilters,
	type ReferenceTiling,
	type ReferenceFilter,
} from "@/lib/services/referenceAtlas";
import { LIBRARY_TILINGS_PER_PAGE } from "@/lib/constants";

// The unified Tiling Library: one display-only atlas of every tiling (regular k=1..7 in the base file,
// k=8..10 lazy-loaded per-k shards, + stars), fetched from public/reference-atlas*.json. Each entry carries a DISCOVERER (historical
// first-finder) and a CERTIFICATION (proven / reproduced / candidate — orthogonal axes). No more
// certified-vs-reference split; each tiling appears exactly once.
const K_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
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
const COLUMN_PRESETS = [3, 4, 5, 6];

type SectionKey = "k" | "discoverer" | "certification" | "grid";

export function ReferenceShelf() {
	const router = useRouter();
	const [tilings, setTilings] = useState<ReferenceTiling[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [filters, setFilters] = useState<ReferenceFilter>({});
	const [gridColumns, setGridColumns] = useState(5);
	const [currentPage, setCurrentPage] = useState(1);
	const [sectionsOpen, setSectionsOpen] = useState<Record<SectionKey, boolean>>({
		k: true,
		discoverer: true,
		certification: true,
		grid: true,
	});
	const [shards, setShards] = useState<Map<number, ReferenceTiling[]>>(new Map());
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

	// Fetch a k≥8 shard the first time that k is selected. k≤7 lives in the base atlas already.
	useEffect(() => {
		const wanted = (filters.kValues ?? []).filter((k) => k >= 8);
		for (const k of wanted) {
			if (shards.has(k) || loadingShards.has(k) || shardErrors.has(k)) continue;
			setLoadingShards((s) => new Set(s).add(k));
			loadReferenceAtlasShard(k)
				.then((data) => setShards((m) => new Map(m).set(k, data)))
				.catch((e) =>
					setShardErrors((m) => new Map(m).set(k, e instanceof Error ? e.message : String(e))),
				)
				.finally(() =>
					setLoadingShards((s) => {
						const n = new Set(s);
						n.delete(k);
						return n;
					}),
				);
		}
	}, [filters.kValues, shards, loadingShards, shardErrors]);

	const setOpen = (key: SectionKey) => (open: boolean) =>
		setSectionsOpen((prev) => ({ ...prev, [key]: open }));

	const toggleK = (k: number) => {
		const cur = filters.kValues ?? [];
		setFilters({ ...filters, kValues: cur.includes(k) ? cur.filter((v) => v !== k) : [...cur, k] });
	};
	const toggleDiscoverer = (d: string) => {
		const cur = filters.discoverers ?? [];
		setFilters({ ...filters, discoverers: cur.includes(d) ? cur.filter((v) => v !== d) : [...cur, d] });
	};
	const toggleCert = (c: ReferenceTiling["certification"]) => {
		const cur = filters.certifications ?? [];
		setFilters({ ...filters, certifications: cur.includes(c) ? cur.filter((v) => v !== c) : [...cur, c] });
	};

	const activeFilterCount =
		(filters.kValues?.length ? 1 : 0) +
		(filters.discoverers?.length ? 1 : 0) +
		(filters.certifications?.length ? 1 : 0) +
		(filters.query?.trim() ? 1 : 0);

	const allTilings = useMemo(() => {
		if (!tilings) return null;
		const extra: ReferenceTiling[] = [];
		for (const list of shards.values()) extra.push(...list);
		return extra.length ? [...tilings, ...extra] : tilings;
	}, [tilings, shards]);

	const filtered = useMemo(() => {
		if (!allTilings) return [];
		return allTilings
			.filter((t) => matchesReferenceFilters(t, filters))
			.sort((a, b) => a.k - b.k || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	}, [allTilings, filters]);

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
				<div className="p-3 flex flex-col gap-1 text-sm">
					<input
						type="text"
						value={filters.query ?? ""}
						onChange={(e) => setFilters({ ...filters, query: e.target.value })}
						placeholder="Search id or family…"
						className="mb-2 w-full rounded-md border border-line bg-surface-raised px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-disabled focus:border-line-strong focus:outline-none"
					/>
					<SidebarSection
						title="Vertex count (k)"
						summary={filters.kValues?.length ? filters.kValues.join(", ") : null}
						open={sectionsOpen.k}
						onOpenChange={setOpen("k")}
					>
						<ButtonGroup
							multi
							options={K_OPTIONS.map((k) => ({ value: k, label: k, classes: "w-8" }))}
							selected={filters.kValues ?? []}
							onChange={toggleK}
						/>
						<p className="mt-1.5 text-[10px] text-fg-disabled">k ≥ 8 loads on demand.</p>
					</SidebarSection>

					<SidebarSection
						title="Discoverer"
						summary={filters.discoverers?.length ? `${filters.discoverers.length} selected` : null}
						open={sectionsOpen.discoverer}
						onOpenChange={setOpen("discoverer")}
					>
						<ButtonGroup
							multi
							options={DISCOVERER_OPTIONS}
							selected={filters.discoverers ?? []}
							onChange={toggleDiscoverer}
						/>
					</SidebarSection>

					<SidebarSection
						title="Certification"
						summary={filters.certifications?.length ? filters.certifications.join(", ") : null}
						open={sectionsOpen.certification}
						onOpenChange={setOpen("certification")}
					>
						<ButtonGroup
							multi
							options={CERT_OPTIONS}
							selected={filters.certifications ?? []}
							onChange={toggleCert}
						/>
					</SidebarSection>

					<SidebarSection
						title="Grid"
						summary={`${gridColumns} cols`}
						open={sectionsOpen.grid}
						onOpenChange={setOpen("grid")}
					>
						<ButtonGroup
							options={COLUMN_PRESETS.map((c) => ({ value: c, label: c, classes: "w-8" }))}
							selected={gridColumns}
							onChange={setGridColumns}
						/>
					</SidebarSection>
				</div>
			</PageSidebar>

			<main className="flex-1 overflow-y-auto p-5">
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
