"use client";

import type { Polygon } from "@/classes/polygons/Polygon";
import { usePolygonsCanvas } from "@/lib/hooks/usePolygonsCanvas";
import { LabCard } from "./lab-card";

interface ExpandedSeedCardProps {
	polygons: Polygon[];
	k: number;
	m: number;
	index: number;
}

export function ExpandedSeedCard({ polygons, k, m, index }: ExpandedSeedCardProps) {
	const canvasRef = usePolygonsCanvas(polygons);

	return (
		<LabCard
			canvas={<canvas ref={canvasRef} className="block w-full h-full" />}
			body={
				<div className="space-y-1">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<span className="font-mono text-[11px] text-fg-muted">k={k}</span>
							<span className="font-mono text-[11px] text-fg-muted">m={m}</span>
						</div>
						<span className="font-mono text-[11px] text-fg-muted">#{index + 1}</span>
					</div>
					<div className="text-[11px] text-fg-muted">{polygons.length} polygons</div>
				</div>
			}
		/>
	);
}
