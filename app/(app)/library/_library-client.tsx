"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Library, X } from "lucide-react";
import type { CampaignTiling } from "@/lib/services/campaignService";
import { PageSidebar } from "@/components/page-sidebar";
import { LibraryFilters, type LibraryFiltersValue } from "@/components/library-filters";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { Pagination } from "@/components/ui/pagination";
import { compactSeedName, compactToHtml } from "@/lib/utils/compactSeedName";

interface LibraryClientProps {
	tilings: CampaignTiling[];
}

const PAGE_SIZE = 24;

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
	const [gridColumns, setGridColumns] = useState(0);
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

	const filteredTilings = useMemo(() => all.filter((t) => matchesFilters(t, filters)), [all, filters]);

	const paginatedTilings = useMemo(
		() => filteredTilings.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
		[filteredTilings, currentPage],
	);

	const gridStyle =
		gridColumns === 0
			? { gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }
			: { gridTemplateColumns: `repeat(${gridColumns}, 1fr)` };

	return (
		<div className="flex flex-1 min-h-0 overflow-hidden">
			<PageSidebar>
				<div className="flex items-center justify-between px-3 pt-3">
					<span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Filters</span>
					{activeFilterCount > 0 ? (
						<button
							onClick={() => setFilters({})}
							className="flex items-center gap-1 text-xs text-zinc-500 hover:text-red-400 transition-colors"
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
					<Library size={18} className="text-green-400" />
					<h1 className="text-base font-semibold text-zinc-100">Tiling Library</h1>
					<span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700/50 text-zinc-400">
						{filteredTilings.length} tilings
					</span>
				</div>

				{filteredTilings.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-24 text-center">
						<Library size={40} className="text-zinc-700 mb-4" />
						<p className="text-zinc-400 font-medium">No tilings yet</p>
						<p className="text-zinc-600 text-sm mt-1">
							{Object.keys(filters).length > 0 ? (
								<>
									No tilings match the current filters.{" "}
									<button
										onClick={() => setFilters({})}
										className="text-green-400 hover:underline ml-1"
									>
										Clear filters
									</button>
								</>
							) : (
								<>
									Run a search in the{" "}
									<Link href="/lab" className="text-green-400 hover:underline">
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
							pageSize={PAGE_SIZE}
							currentPage={currentPage}
							onPageChange={setCurrentPage}
						/>
						<div className="grid gap-3 mt-4" style={gridStyle}>
							{paginatedTilings.map((tiling) => (
								<TilingCard key={tiling.id} tiling={tiling} />
							))}
						</div>
						<div className="mt-4">
							<Pagination
								totalItems={filteredTilings.length}
								pageSize={PAGE_SIZE}
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

function TilingCard({ tiling }: { tiling: CampaignTiling }) {
	const label =
		(tiling.encoded_tiling as { name?: string } | undefined)?.name ??
		tiling.polygon_names?.join(" + ") ??
		`k=${tiling.k} m=${tiling.m}`;
	const compact = label.startsWith("[") && label.endsWith("]") ? compactToHtml(compactSeedName(label)) : label;

	return (
		<div className="flex flex-col rounded-lg border border-zinc-700/30 bg-zinc-800/30 hover:border-zinc-600/50 hover:bg-zinc-800/50 transition-colors overflow-hidden cursor-pointer">
			<div className="aspect-square bg-zinc-900">
				{tiling.translational_cell ? (
					<TilingThumbnail translationalCell={tiling.translational_cell} size={200} />
				) : tiling.encoded_tiling ? (
					<TilingThumbnail encodedTiling={tiling.encoded_tiling} size={200} />
				) : tiling.image_url ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img src={tiling.image_url} alt="tiling" className="w-full h-full object-cover" />
				) : (
					<div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs">
						k={tiling.k}
					</div>
				)}
			</div>
			<div className="px-2.5 py-2 flex flex-col gap-1.5">
				<p
					className="text-xs text-zinc-300 font-mono leading-tight break-all"
					title={label}
					dangerouslySetInnerHTML={{ __html: compact }}
				/>
				<div className="flex flex-wrap gap-1">
					<span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-400">
						k={tiling.k}
					</span>
					<span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-400">
						m={tiling.m}
					</span>
					{tiling.wallpaper_group ? (
						<span className="text-[10px] px-1.5 py-0.5 rounded text-blue-400 bg-blue-400/10">
							{tiling.wallpaper_group}
						</span>
					) : null}
					{tiling.is_regular ? (
						<span className="text-[10px] px-1.5 py-0.5 rounded text-emerald-400 bg-emerald-400/10">reg</span>
					) : null}
					{tiling.is_star ? (
						<span className="text-[10px] px-1.5 py-0.5 rounded text-yellow-400 bg-yellow-400/10">star</span>
					) : null}
				</div>
			</div>
		</div>
	);
}
