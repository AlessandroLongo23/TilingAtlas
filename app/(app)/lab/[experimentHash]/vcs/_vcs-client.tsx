"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { generateVCs } from "@/lib/algorithm/pipeline-core";
import { VertexConfiguration } from "@/classes/algorithm/VertexConfiguration";
import { VCCard } from "@/components/vc-card";
import { ExperimentSidebar } from "@/components/experiment-sidebar";
import { Pagination } from "@/components/ui/pagination";
import { useExperiment } from "../_experiment-context";

const PAGE_SIZE = 25;

export function VCsClient({ polygonNames }: { polygonNames: string[] }) {
	const { setBadge } = useExperiment();
	const [gridColumns, setGridColumns] = useState(5);
	const [currentPage, setCurrentPage] = useState(1);
	const [vcNames, setVcNames] = useState<string[] | null>(null);

	useEffect(() => {
		// Defer heavy computation off the render path.
		const names = generateVCs(polygonNames);
		setVcNames(names);
	}, [polygonNames]);

	useEffect(() => {
		if (vcNames) setBadge("vcs", vcNames.length);
	}, [vcNames, setBadge]);

	const makeVC = useMemo(
		() =>
			(name: string) => {
				try {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const vc = (VertexConfiguration as any).fromName(name);
					vc.computeNeighboringVertices();
					return vc as VertexConfiguration;
				} catch {
					return null;
				}
			},
		[],
	);

	const paginated = (vcNames ?? []).slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
	const gridStyle = { gridTemplateColumns: `repeat(${gridColumns}, 1fr)` };

	return (
		<>
			<ExperimentSidebar
				gridColumns={gridColumns}
				onGridColumnsChange={setGridColumns}
				filterK={null}
				onFilterKChange={() => {}}
				filterM={null}
				onFilterMChange={() => {}}
			/>
			<div className="flex-1 flex flex-col min-h-0 overflow-hidden">
				<div className="flex-1 overflow-y-auto px-6 py-4">
					{vcNames === null ? (
						<div className="flex items-center justify-center py-16 text-fg-disabled gap-2">
							<Loader2 size={16} className="animate-spin" />
							<span className="text-sm">Deriving vertex configurations…</span>
						</div>
					) : vcNames.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-16 text-fg-disabled">
							<p className="text-sm">No vertex configurations found for this polygon set.</p>
						</div>
					) : (
						<>
							<Pagination
								totalItems={vcNames.length}
								pageSize={PAGE_SIZE}
								currentPage={currentPage}
								onPageChange={setCurrentPage}
							/>
							<div className="grid gap-4 mt-4" style={gridStyle}>
								{paginated.map((name, i) => (
									<VCCard
										key={name}
										id={(currentPage - 1) * PAGE_SIZE + i + 1}
										name={name}
										vc={makeVC(name)}
										vertexCount={name.split(".").length}
									/>
								))}
							</div>
							<div className="mt-4">
								<Pagination
									totalItems={vcNames.length}
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
