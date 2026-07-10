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
	matchesReferenceFilters,
	type ReferenceTiling,
	type ReferenceFilter,
} from "@/lib/services/referenceAtlas";
import { LIBRARY_TILINGS_PER_PAGE } from "@/lib/constants";

// The Reference (Oracle) shelf: a display-only atlas of literature tilings (Galebach regular k=1..6 +
// Myers stars), lazy-fetched from the static asset public/reference-atlas.json. Kept entirely off the
// certified Supabase catalogue (§0). Its own filters (k + source) — the certified LibraryFilters is
// tied to the certified data (k=1..3), so it isn't reused here.
const K_OPTIONS = [1, 2, 3, 4, 5, 6, 7];
const SOURCE_OPTIONS: { value: ReferenceTiling["source"]; label: string }[] = [
	{ value: "galebach", label: "Galebach" },
	{ value: "myers", label: "Myers" },
	{ value: "ctrnact", label: "Čtrnáct" },
	{ value: "ctrnact-star", label: "Star engine" },
];
const COLUMN_PRESETS = [3, 4, 5, 6];

type SectionKey = "k" | "source" | "grid";

export function ReferenceShelf() {
	const router = useRouter();
	const [tilings, setTilings] = useState<ReferenceTiling[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [filters, setFilters] = useState<ReferenceFilter>({});
	const [gridColumns, setGridColumns] = useState(5);
	const [currentPage, setCurrentPage] = useState(1);
	const [sectionsOpen, setSectionsOpen] = useState<Record<SectionKey, boolean>>({
		k: true,
		source: true,
		grid: true,
	});

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

	const setOpen = (key: SectionKey) => (open: boolean) =>
		setSectionsOpen((prev) => ({ ...prev, [key]: open }));

	const toggleK = (k: number) => {
		const cur = filters.kValues ?? [];
		setFilters({ ...filters, kValues: cur.includes(k) ? cur.filter((v) => v !== k) : [...cur, k] });
	};
	const toggleSource = (s: ReferenceTiling["source"]) => {
		const cur = filters.sources ?? [];
		setFilters({ ...filters, sources: cur.includes(s) ? cur.filter((v) => v !== s) : [...cur, s] });
	};

	const activeFilterCount =
		(filters.kValues?.length ? 1 : 0) + (filters.sources?.length ? 1 : 0) + (filters.query?.trim() ? 1 : 0);

	const filtered = useMemo(() => {
		if (!tilings) return [];
		return tilings
			.filter((t) => matchesReferenceFilters(t, filters))
			.sort(
				(a, b) =>
					(a.source < b.source ? -1 : a.source > b.source ? 1 : 0) ||
					a.k - b.k ||
					(a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
			);
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
					</SidebarSection>

					<SidebarSection
						title="Source"
						summary={filters.sources?.length ? filters.sources.join(", ") : null}
						open={sectionsOpen.source}
						onOpenChange={setOpen("source")}
					>
						<ButtonGroup
							multi
							options={SOURCE_OPTIONS}
							selected={filters.sources ?? []}
							onChange={toggleSource}
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
					<h1 className="text-base font-semibold text-fg">Reference Atlas</h1>
					<span className="text-xs px-2 py-0.5 rounded-full bg-surface-overlay border border-line text-fg-muted">
						{filtered.length} oracle tilings
					</span>
				</div>

				{error ? (
					<div className="flex flex-col items-center justify-center py-24 text-center">
						<p className="text-danger font-medium">Could not load the reference atlas</p>
						<p className="text-fg-disabled text-sm mt-1 font-mono">{error}</p>
					</div>
				) : tilings === null ? (
					<div className="flex flex-col items-center justify-center py-24 text-center text-fg-muted">
						<Loader2 size={28} className="animate-spin mb-3 text-sky-400" />
						<p className="text-sm">Loading reference atlas…</p>
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
