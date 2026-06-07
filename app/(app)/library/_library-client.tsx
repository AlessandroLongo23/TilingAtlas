"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Library, X } from "lucide-react";
import { matchesCatalogueFilters, type CatalogueTiling } from "@/lib/services/catalogueService";
import { PageSidebar } from "@/components/page-sidebar";
import { LibraryFilters, type LibraryFiltersValue } from "@/components/library-filters";
import { CatalogueCard } from "@/components/catalogue-card";
import { Pagination } from "@/components/ui/pagination";
import { LIBRARY_TILINGS_PER_PAGE } from "@/lib/constants";

interface LibraryClientProps {
	tilings: CatalogueTiling[];
}

function parseFilters(sp: URLSearchParams): LibraryFiltersValue {
	const parsed: LibraryFiltersValue = {};
	const kParam = sp.get("k");
	const polygonParam = sp.get("polygon");
	const certParam = sp.get("cert");
	if (kParam) parsed.kValues = kParam.split(",").map(Number).filter(Boolean);
	if (polygonParam) parsed.polygonNames = polygonParam.split(",").map((s) => s.trim()).filter(Boolean);
	if (certParam === "certified" || certParam === "candidate") parsed.certification = certParam;
	return parsed;
}

export function LibraryClient({ tilings: all }: LibraryClientProps) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [filters, setFilters] = useState<LibraryFiltersValue>(() => parseFilters(searchParams));
	const [gridColumns, setGridColumns] = useState(5);
	const [currentPage, setCurrentPage] = useState(1);

	// Push filter changes into URL without navigation (mirrors the source's replaceState approach).
	useEffect(() => {
		const params = new URLSearchParams();
		if (filters.kValues?.length) params.set("k", filters.kValues.join(","));
		if (filters.polygonNames?.length) params.set("polygon", filters.polygonNames.join(","));
		if (filters.certification) params.set("cert", filters.certification);
		const q = params.toString();
		window.history.replaceState(null, "", q ? `${pathname}?${q}` : pathname);
	}, [filters, pathname]);

	useEffect(() => {
		setCurrentPage(1);
	}, [filters]);

	const activeFilterCount =
		(filters.kValues?.length ? 1 : 0) +
		(filters.polygonNames?.length ? 1 : 0) +
		(filters.certification ? 1 : 0);

	const filteredTilings = useMemo(() => {
		return all
			.filter((t) => matchesCatalogueFilters(t, filters))
			.sort((a, b) => a.k - b.k || (a.canonicalKey < b.canonicalKey ? -1 : a.canonicalKey > b.canonicalKey ? 1 : 0));
	}, [all, filters]);

	const certifiedCount = useMemo(() => filteredTilings.filter((t) => t.certified).length, [filteredTilings]);

	const paginatedTilings = useMemo(
		() => filteredTilings.slice((currentPage - 1) * LIBRARY_TILINGS_PER_PAGE, currentPage * LIBRARY_TILINGS_PER_PAGE),
		[filteredTilings, currentPage],
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
				<div className="p-3">
					<LibraryFilters
						filters={filters}
						onFiltersChange={setFilters}
						gridColumns={gridColumns}
						onGridColumnsChange={setGridColumns}
					/>
				</div>
			</PageSidebar>

			<main className="flex-1 overflow-y-auto p-5">
				<div className="flex items-center gap-3 mb-5">
					<Library size={18} className="text-accent" />
					<h1 className="text-base font-semibold text-fg">Tiling Library</h1>
					<span className="text-xs px-2 py-0.5 rounded-full bg-surface-overlay border border-line text-fg-muted">
						{filteredTilings.length} tilings · {certifiedCount} certified
					</span>
				</div>

				{filteredTilings.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-24 text-center">
						<Library size={40} className="text-fg-disabled mb-4" />
						<p className="text-fg-muted font-medium">No tilings</p>
						<p className="text-fg-disabled text-sm mt-1">
							{activeFilterCount > 0 ? (
								<>
									No tilings match the current filters.{" "}
									<button onClick={() => setFilters({})} className="text-accent hover:underline ml-1">
										Clear filters
									</button>
								</>
							) : (
								<>
									No certified runs yet. Run a sweep in the{" "}
									<Link href="/lab" className="text-accent hover:underline">
										Lab
									</Link>{" "}
									to populate the catalogue.
								</>
							)}
						</p>
					</div>
				) : (
					<>
						<Pagination
							totalItems={filteredTilings.length}
							pageSize={LIBRARY_TILINGS_PER_PAGE}
							currentPage={currentPage}
							onPageChange={setCurrentPage}
						/>
						<div className="grid gap-3 mt-4" style={gridStyle}>
							{paginatedTilings.map((tiling) => (
								<CatalogueCard
									key={tiling.canonicalKey}
									tiling={tiling}
									onClick={(t) => router.push(`/play?tiling=${encodeURIComponent(t.canonicalKey)}`)}
								/>
							))}
						</div>
						<div className="mt-4">
							<Pagination
								totalItems={filteredTilings.length}
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
