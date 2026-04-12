"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { generateVCsWithCompatibilityGraph } from "@/lib/algorithm/pipeline-core";
import { CompatibilityGraph } from "@/classes/algorithm/CompatibilityGraph";
import { SeedSetExtractor } from "@/classes/algorithm/SeedSetExtractor";
import { SeedBuilder } from "@/classes/algorithm/SeedBuilder";
import { SeedExpander } from "@/classes/algorithm/SeedExpander";
import { VertexConfiguration } from "@/classes/algorithm/VertexConfiguration";
import type { Polygon } from "@/classes/polygons/Polygon";
import { ExpandedSeedCard } from "@/components/expanded-seed-card";
import { ExperimentSidebar } from "@/components/experiment-sidebar";
import { Pagination } from "@/components/ui/pagination";
import { useExperiment } from "../_experiment-context";

const PAGE_SIZE = 25;

interface ExpandedItem {
	id: number;
	k: number;
	m: number;
	polygons: Polygon[];
}

interface Props {
	polygonNames: string[];
	kValues: number[];
}

export function ExpandedSeedsClient({ polygonNames, kValues }: Props) {
	const { setBadge } = useExperiment();
	const [items, setItems] = useState<ExpandedItem[] | null>(null);
	const [error, setError] = useState("");
	const [gridColumns, setGridColumns] = useState(5);
	const [filterK, setFilterK] = useState<number | null>(null);
	const [filterM, setFilterM] = useState<number | null>(null);
	const [currentPage, setCurrentPage] = useState(1);

	useEffect(() => {
		if (polygonNames.length === 0) {
			setItems([]);
			return;
		}
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
			const builder = new SeedBuilder();

			const result: ExpandedItem[] = [];
			for (const k of kValues) {
				const seedSets = extractor.findSeedSets(k);
				const expander = new SeedExpander(k);
				for (let setIdx = 0; setIdx < seedSets.length; setIdx++) {
					const m = setIdx + 1;
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const seeds = (builder as any).buildSeedsFromSet(seedSets[setIdx]);
					for (const seed of seeds) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const expandedPatches = (expander as any).expand(seed);
						if (Array.isArray(expandedPatches)) {
							for (const patch of expandedPatches) {
								result.push({ id: result.length, k, m, polygons: patch });
							}
						}
					}
				}
			}
			setItems(result);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to compute expanded seeds");
			setItems([]);
		}
	}, [polygonNames, kValues]);

	useEffect(() => {
		if (items) setBadge("expanded-seeds", items.length);
	}, [items, setBadge]);

	useEffect(() => {
		setCurrentPage(1);
	}, [filterK, filterM]);

	const kOptions = useMemo(
		() => (items ? [...new Set(items.map((s) => s.k))].sort((a, b) => a - b) : []),
		[items],
	);
	const mOptions = useMemo(
		() => (items ? [...new Set(items.map((s) => s.m))].sort((a, b) => a - b) : []),
		[items],
	);

	const filtered = useMemo(
		() =>
			(items ?? []).filter(
				(item) => (filterK === null || item.k === filterK) && (filterM === null || item.m === filterM),
			),
		[items, filterK, filterM],
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
					{items === null ? (
						<div className="flex items-center justify-center py-16 text-fg-disabled gap-2">
							<Loader2 size={16} className="animate-spin" />
							<span className="text-sm">Computing expanded seeds…</span>
						</div>
					) : error ? (
						<div className="flex items-center justify-center py-16">
							<p className="text-sm text-danger">{error}</p>
						</div>
					) : filtered.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-16 text-fg-disabled">
							<p className="text-sm">
								{items.length === 0
									? "No expanded seeds found for this polygon set."
									: "No expanded seeds match the current filters."}
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
								{paginated.map(({ id, k, m, polygons }) => (
									<ExpandedSeedCard key={id} polygons={polygons} k={k} m={m} index={id} />
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
