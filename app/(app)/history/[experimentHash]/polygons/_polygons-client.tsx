"use client";

import { useEffect, useMemo, useState } from "react";
import { polygonNamesToSignatures } from "@/lib/algorithm/pipeline-core";
import {
	PolygonType,
	RegularPolygon,
	StarRegularPolygon,
	StarParametricPolygon,
	EquilateralPolygon,
	Vector,
	type Polygon,
} from "@/classes";
import { PolygonCard } from "@/components/polygon-card";
import { ExperimentSidebar } from "@/components/experiment-sidebar";
import { Pagination } from "@/components/ui/pagination";
import { LAB_ITEMS_PER_PAGE } from "@/lib/constants";
import { useExperiment } from "../_experiment-context";

const TAG_LABEL: Record<string, string> = {
	[PolygonType.REGULAR]: "Reg",
	[PolygonType.STAR_REGULAR]: "Star",
	[PolygonType.STAR_PARAMETRIC]: "Param",
	[PolygonType.EQUILATERAL]: "Equil",
	[PolygonType.GENERIC]: "Generic",
};

interface Signature {
	name?: string;
	type: string;
	n: number;
	d?: number;
	alpha?: number;
	angles?: number[];
	startsWith?: string;
}

function polygonFromSignature(sig: Signature): Polygon | null {
	const anchor = new Vector(0, 0);
	const dir = new Vector(1, 0);
	try {
		switch (sig.type) {
			case PolygonType.REGULAR:
				return RegularPolygon.fromCentroidAndAngle(sig.n, new Vector(0, 0), 0);
			case PolygonType.STAR_REGULAR:
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				return StarRegularPolygon.fromAnchorAndDir(sig.n, anchor, dir, sig.d!, sig.startsWith as any);
			case PolygonType.STAR_PARAMETRIC:
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				return StarParametricPolygon.fromAnchorAndDir(sig.n, anchor, dir, sig.alpha!, sig.startsWith as any);
			case PolygonType.EQUILATERAL:
				return EquilateralPolygon.fromAnchorAndDir(sig.n, anchor, dir, [...(sig.angles ?? [])]);
			default:
				return null;
		}
	} catch {
		return null;
	}
}

export function PolygonsClient({ polygonNames }: { polygonNames: string[] }) {
	const { setBadge } = useExperiment();
	const [gridColumns, setGridColumns] = useState(5);
	const [currentPage, setCurrentPage] = useState(1);

	const items = useMemo(() => {
		const signatures = polygonNamesToSignatures(polygonNames) as unknown as Signature[];
		return signatures.map((sig, i) => ({
			id: i + 1,
			name: sig.name ?? "",
			type: sig.type,
			polygon: polygonFromSignature(sig),
		}));
	}, [polygonNames]);

	useEffect(() => {
		setBadge("polygons", items.length);
	}, [items.length, setBadge]);

	const paginated = items.slice((currentPage - 1) * LAB_ITEMS_PER_PAGE, currentPage * LAB_ITEMS_PER_PAGE);
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
					{items.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-16 text-fg-disabled">
							<p className="text-sm">No polygons configured for this experiment.</p>
						</div>
					) : (
						<>
							<Pagination
								totalItems={items.length}
								pageSize={LAB_ITEMS_PER_PAGE}
								currentPage={currentPage}
								onPageChange={setCurrentPage}
							/>
							<div className="grid gap-4 mt-4" style={gridStyle}>
								{paginated.map((item) => (
									<PolygonCard
										key={item.id}
										id={item.id}
										name={item.name}
										polygon={item.polygon}
										tagLabel={TAG_LABEL[item.type] ?? item.type}
										// eslint-disable-next-line @typescript-eslint/no-explicit-any
										tagClass={item.type as any}
									/>
								))}
							</div>
							<div className="mt-4">
								<Pagination
									totalItems={items.length}
									pageSize={LAB_ITEMS_PER_PAGE}
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
