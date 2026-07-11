"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers } from "lucide-react";
import type { CampaignTiling } from "@/lib/services/campaignService";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { ExperimentSidebar } from "@/components/experiment-sidebar";
import { Pagination } from "@/components/ui/pagination";
import { compactSeedName, compactToHtml } from "@/lib/utils/compactSeedName";
import { useExperiment } from "../_experiment-context";

interface TilingsClientProps {
	tilings: CampaignTiling[];
	total: number;
	page: number;
	pageSize: number;
	k: number | null;
	kValues: number[];
}

function tilingLabel(t: CampaignTiling) {
	return (
		(t.encoded_tiling as { name?: string } | undefined)?.name ??
		t.polygon_names?.join(" + ") ??
		`k=${t.k} m=${t.m}`
	);
}

function compactLabel(label: string) {
	if (label.startsWith("[") && label.endsWith("]")) return compactToHtml(compactSeedName(label));
	return label;
}

export function TilingsClient({ tilings, total, page, pageSize, k, kValues }: TilingsClientProps) {
	const router = useRouter();
	const { setBadge } = useExperiment();
	const [gridColumns, setGridColumns] = useState(5);
	const [filterK, setFilterK] = useState<number | null>(k);

	useEffect(() => {
		setBadge("tilings", total);
	}, [total, setBadge]);

	useEffect(() => {
		setFilterK(k);
	}, [k]);

	const updateUrl = (nextK: number | null, nextPage: number) => {
		const url = new URL(window.location.href);
		if (nextK === null) url.searchParams.delete("k");
		else url.searchParams.set("k", String(nextK));
		if (nextPage === 1) url.searchParams.delete("page");
		else url.searchParams.set("page", String(nextPage));
		router.replace(url.pathname + url.search, { scroll: false });
	};

	const handleKChange = (nextK: number | null) => {
		setFilterK(nextK);
		updateUrl(nextK, 1);
	};

	const handlePageChange = (nextPage: number) => {
		updateUrl(filterK, nextPage);
	};

	const gridStyle = { gridTemplateColumns: `repeat(${gridColumns}, 1fr)` };

	return (
		<>
			<ExperimentSidebar
				gridColumns={gridColumns}
				onGridColumnsChange={setGridColumns}
				filterK={filterK}
				onFilterKChange={handleKChange}
				filterM={null}
				onFilterMChange={() => {}}
				kOptions={kValues}
				showFilters
			/>

			<div className="flex-1 flex flex-col min-h-0 overflow-hidden">
				<div className="flex-1 overflow-y-auto px-6 py-4">
					{tilings.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-16 text-center text-fg-disabled gap-3">
							<Layers size={36} className="opacity-30" />
							{total === 0 ? (
								<>
									<p className="text-sm text-fg-muted">No tilings yet — the experiment may still be running.</p>
									<p className="text-xs">Results will appear here as the worker finds them.</p>
								</>
							) : (
								<p className="text-sm">No tilings found for the current filter.</p>
							)}
						</div>
					) : (
						<>
							<Pagination
								totalItems={total}
								pageSize={pageSize}
								currentPage={page}
								onPageChange={handlePageChange}
							/>
							<div className="grid gap-4 mt-4" style={gridStyle}>
								{tilings.map((tiling, i) => {
									const label = tilingLabel(tiling);
									const html = compactLabel(label);
									const cellPolys =
										// eslint-disable-next-line @typescript-eslint/no-explicit-any
										(tiling.translational_cell as any)?.cellPolygons;
									return (
										<div
											key={tiling.id ?? `${page}-${i}`}
											className="flex flex-col rounded-xl border border-line bg-surface-overlay/30 hover:border-line-strong transition-colors overflow-hidden cursor-pointer"
										>
											<div className="w-full aspect-square bg-surface-raised/80 flex items-center justify-center border-b border-line">
												{cellPolys ? (
													<TilingThumbnail polygons={cellPolys} />
												) : tiling.image_url ? (
													// eslint-disable-next-line @next/next/no-img-element
													<img src={tiling.image_url} alt="tiling" className="w-full h-full object-contain" />
												) : (
													<span
														className="text-fg-muted font-mono text-xs text-center leading-relaxed break-all p-5"
														dangerouslySetInnerHTML={{ __html: html }}
													/>
												)}
											</div>
											<div className="px-3 py-2.5 flex flex-col gap-2">
												<p
													className="text-xs text-fg-secondary font-mono leading-tight break-all"
													title={label}
													dangerouslySetInnerHTML={{ __html: html }}
												/>
												<div className="flex flex-wrap gap-1">
													<span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-overlay/50 text-fg-muted">
														k={tiling.k}
													</span>
													<span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-overlay/50 text-fg-muted">
														m={tiling.m}
													</span>
													{tiling.wallpaper_group ? (
														<span className="text-[10px] px-1.5 py-0.5 rounded text-info bg-info-subtle">
															{tiling.wallpaper_group}
														</span>
													) : null}
													{tiling.is_regular ? (
														<span className="text-[10px] px-1.5 py-0.5 rounded text-accent bg-accent-subtle">
															regular
														</span>
													) : null}
													{tiling.is_star ? (
														<span className="text-[10px] px-1.5 py-0.5 rounded text-yellow-400 bg-yellow-400/10">
															star
														</span>
													) : null}
												</div>
											</div>
										</div>
									);
								})}
							</div>
							<div className="mt-4">
								<Pagination
									totalItems={total}
									pageSize={pageSize}
									currentPage={page}
									onPageChange={handlePageChange}
								/>
							</div>
						</>
					)}
				</div>
			</div>
		</>
	);
}
