"use client";

import { useMemo } from "react";
import type { SeedConfiguration } from "@/classes/algorithm/SeedConfiguration";
import { compactSeedName, compactToHtml } from "@/lib/utils/compactSeedName";
import { usePolygonsCanvas } from "@/lib/hooks/usePolygonsCanvas";
import { LabCard } from "./lab-card";

interface SeedCardProps {
	seed: SeedConfiguration;
	k: number;
	m: number;
}

export function SeedCard({ seed, k, m }: SeedCardProps) {
	const canvasRef = usePolygonsCanvas(seed.polygons);
	const compactName = useMemo(() => compactToHtml(compactSeedName(seed.name)), [seed.name]);

	return (
		<LabCard
			canvas={<canvas ref={canvasRef} className="block w-full h-full" />}
			body={
				<div className="space-y-1.5">
					<div className="flex items-center gap-3">
						<span className="font-mono text-[11px] text-zinc-500">k={k}</span>
						<span className="font-mono text-[11px] text-zinc-500">m={m}</span>
					</div>
					<p
						className="font-mono text-[11px] text-zinc-300 leading-tight break-all"
						title={seed.name}
						dangerouslySetInnerHTML={{ __html: compactName }}
					/>
				</div>
			}
		/>
	);
}
