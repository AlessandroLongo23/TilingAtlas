"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { generateVCsWithCompatibilityGraph } from "@/lib/algorithm/pipeline-core";
import { CompatibilityGraph } from "@/classes/algorithm/CompatibilityGraph";
import { SeedSetExtractor } from "@/classes/algorithm/SeedSetExtractor";
import { SeedBuilder } from "@/classes/algorithm/SeedBuilder";
import { VertexConfiguration } from "@/classes/algorithm/VertexConfiguration";
import type { SeedConfiguration } from "@/classes/algorithm/SeedConfiguration";
import { getEffectiveUniqueCount } from "@/lib/utils/vcChiral";
import { SeedCard } from "@/components/seed-card";
import { ExperimentSidebar } from "@/components/experiment-sidebar";
import { Pagination } from "@/components/ui/pagination";
import { useExperiment } from "../_experiment-context";

const PAGE_SIZE = 25;

interface SeedItem {
	id: number;
	k: number;
	m: number;
	seed: SeedConfiguration;
}

interface SeedsClientProps {
	polygonNames: string[];
	kValues: number[];
}

export function SeedsClient({ polygonNames, kValues }: SeedsClientProps) {
	const { setBadge } = useExperiment();
	const [seedItems, setSeedItems] = useState<SeedItem[] | null>(null);
	const [error, setError] = useState("");
	const [gridColumns, setGridColumns] = useState(5);
	const [filterK, setFilterK] = useState<number | null>(null);
	const [filterM, setFilterM] = useState<number | null>(null);
	const [currentPage, setCurrentPage] = useState(1);

	useEffect(() => {
		try {
			const { vcNames } = generateVCsWithCompatibilityGraph(polygonNames);
			const vcs = vcNames.map((name) => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const vc = (VertexConfiguration as any).fromName(name);
				vc.computeNeighboringVertices();
				return vc;
			});
			const graph = new CompatibilityGraph(vcs);
			const extractor = new SeedSetExtractor(graph);

			const items: SeedItem[] = [];
			for (const k of kValues) {
				const seedSets = extractor.findSeedSets(k);
				if (seedSets.length === 0) continue;
				const builder = new SeedBuilder();
				const seeds = builder.buildSeeds(k, 1, {
					seedSetLoader: () => seedSets,
				});
				for (const seed of seeds) {
					const m = getEffectiveUniqueCount(seed.vertexConfigurations.map((vc) => vc.name));
					items.push({ id: items.length, k, m, seed });
				}
			}
			setSeedItems(items);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to derive seeds");
			setSeedItems([]);
		}
	}, [polygonNames, kValues]);

	useEffect(() => {
		if (seedItems) setBadge("seeds", seedItems.length);
	}, [seedItems, setBadge]);

	useEffect(() => {
		setCurrentPage(1);
	}, [filterK, filterM]);

	const kOptions = useMemo(
		() => (seedItems ? [...new Set(seedItems.map((s) => s.k))].sort((a, b) => a - b) : []),
		[seedItems],
	);
	const mOptions = useMemo(
		() => (seedItems ? [...new Set(seedItems.map((s) => s.m))].sort((a, b) => a - b) : []),
		[seedItems],
	);

	const filtered = useMemo(
		() =>
			(seedItems ?? []).filter(
				(item) =>
					(filterK === null || item.k === filterK) && (filterM === null || item.m === filterM),
			),
		[seedItems, filterK, filterM],
	);

	const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
	const gridStyle = { gridTemplateColumns: `repeat(${gridColumns}, 1fr)` };

	return (
		<>
			<ExperimentSidebar
				gridColumns={gridColumns}
				onGridColumnsChange={setGridColumns}
				filterK={filterK}
				onFilterKChange={setFilterK}
				filterM={filterM}
				onFilterMChange={setFilterM}
				kOptions={kOptions}
				mOptions={mOptions}
				showFilters
			/>
			<div className="flex-1 flex flex-col min-h-0 overflow-hidden">
				<div className="flex-1 overflow-y-auto px-6 py-4">
					{seedItems === null ? (
						<div className="flex items-center justify-center py-16 text-fg-disabled gap-2">
							<Loader2 size={16} className="animate-spin" />
							<span className="text-sm">Deriving seed configurations…</span>
						</div>
					) : error ? (
						<div className="flex items-center justify-center py-16">
							<p className="text-sm text-danger">{error}</p>
						</div>
					) : filtered.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-16 text-fg-disabled">
							<p className="text-sm">
								{seedItems.length === 0
									? "No seed configurations found for this polygon set."
									: "No seeds match the current filters."}
							</p>
						</div>
					) : (
						<>
							<Pagination
								totalItems={filtered.length}
								pageSize={PAGE_SIZE}
								currentPage={currentPage}
								onPageChange={setCurrentPage}
							/>
							<div className="grid gap-4 mt-4" style={gridStyle}>
								{paginated.map(({ id, k, m, seed }) => (
									<SeedCard key={id} seed={seed} k={k} m={m} />
								))}
							</div>
							<div className="mt-4">
								<Pagination
									totalItems={filtered.length}
									pageSize={PAGE_SIZE}
									currentPage={currentPage}
									onPageChange={setCurrentPage}
								/>
							</div>
						</>
					)}
				</div>
			</div>
		</>
	);
}
