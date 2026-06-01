"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Library, X } from "lucide-react";
import type { CampaignTiling } from "@/lib/services/campaignService";
import { PageSidebar } from "@/components/page-sidebar";
import { LibraryFilters, type LibraryFiltersValue } from "@/components/library-filters";
import { TilingCard, resolveTilingLabel } from "@/components/tiling-card";
import { Pagination } from "@/components/ui/pagination";
import { LIBRARY_TILINGS_PER_PAGE } from "@/lib/constants";

interface LibraryClientProps {
	tilings: CampaignTiling[];
}

function matchesFilters(t: CampaignTiling & { campaign?: { is_exhaustive?: boolean } }, f: LibraryFiltersValue) {
	if (f.kValues?.length && !f.kValues.includes(t.k)) return false;
	if (f.polygonNames?.length) {
		const hasAll = f.polygonNames.every((n) => t.polygon_names?.includes(n));
		if (!hasAll) return false;
	}
	if (f.wallpaperGroup && t.wallpaper_group !== f.wallpaperGroup) return false;
	if (f.exhaustiveOnly && !t.campaign?.is_exhaustive) return false;
	return true;
}

function parseFilters(sp: URLSearchParams): LibraryFiltersValue {
	const parsed: LibraryFiltersValue = {};
	const kParam = sp.get("k");
	const polygonParam = sp.get("polygon");
	const wallpaperParam = sp.get("wallpaper");
	const exhaustiveParam = sp.get("exhaustive");
	if (kParam) parsed.kValues = kParam.split(",").map(Number).filter(Boolean);
	if (polygonParam)
		parsed.polygonNames = polygonParam.split(",").map((s) => s.trim()).filter(Boolean);
	if (wallpaperParam) parsed.wallpaperGroup = wallpaperParam;
	if (exhaustiveParam === "true") parsed.exhaustiveOnly = true;
	return parsed;
}

export function LibraryClient({ tilings: all }: LibraryClientProps) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [filters, setFilters] = useState<LibraryFiltersValue>(() => parseFilters(searchParams));
	const [gridColumns, setGridColumns] = useState(5);
	const [currentPage, setCurrentPage] = useState(1);

	// Push filter changes into URL without navigation (mirrors source's replaceState approach)
	useEffect(() => {
		const params = new URLSearchParams();
		if (filters.kValues?.length) params.set("k", filters.kValues.join(","));
		if (filters.polygonNames?.length) params.set("polygon", filters.polygonNames.join(","));
		if (filters.wallpaperGroup) params.set("wallpaper", filters.wallpaperGroup);
		if (filters.exhaustiveOnly) params.set("exhaustive", "true");
		const q = params.toString();
		const next = q ? `${pathname}?${q}` : pathname;
		window.history.replaceState(null, "", next);
	}, [filters, pathname]);

	useEffect(() => {
		setCurrentPage(1);
	}, [filters]);

	const activeFilterCount =
		(filters.kValues?.length ? 1 : 0) +
		(filters.polygonNames?.length ? 1 : 0) +
		(filters.wallpaperGroup ? 1 : 0) +
		(filters.exhaustiveOnly ? 1 : 0);

	const filteredTilings = useMemo(() => {
		const matched = all.filter((t) => matchesFilters(t, filters));
		const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
		return matched.sort((a, b) => collator.compare(resolveTilingLabel(a), resolveTilingLabel(b)));
	}, [all, filters]);

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
						{filteredTilings.length} tilings
					</span>
				</div>

				{filteredTilings.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-24 text-center">
						<Library size={40} className="text-fg-disabled mb-4" />
						<p className="text-fg-muted font-medium">No tilings yet</p>
						<p className="text-fg-disabled text-sm mt-1">
							{Object.keys(filters).length > 0 ? (
								<>
									No tilings match the current filters.{" "}
									<button
										onClick={() => setFilters({})}
										className="text-accent hover:underline ml-1"
									>
										Clear filters
									</button>
								</>
							) : (
								<>
									Run a search in the{" "}
									<Link href="/lab" className="text-accent hover:underline">
										Lab
									</Link>{" "}
									to populate the library.
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
								<TilingCard
									key={tiling.id}
									tiling={tiling}
									onClick={(t) => router.push(`/play?tiling=${encodeURIComponent(t.id)}`)}
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

