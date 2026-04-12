"use client";

import type { VertexConfiguration } from "@/classes/algorithm/VertexConfiguration";
import { compactVcName, compactToHtml } from "@/lib/utils/compactSeedName";
import { useVcCanvas } from "@/lib/hooks/useVcCanvas";
import { LabCard } from "./lab-card";

interface VCCardProps {
	id: number;
	name: string;
	vc: VertexConfiguration | null;
	vertexCount: number;
}

export function VCCard({ id, name, vc, vertexCount }: VCCardProps) {
	const canvasRef = useVcCanvas(vc, {
		backgroundColor: "rgba(24, 24, 27, 0.6)",
		padding: 16,
	});

	return (
		<LabCard
			canvas={
				vc ? (
					<canvas ref={canvasRef} className="block w-full h-full" />
				) : (
					<div className="w-full h-full flex items-center justify-center text-fg-disabled text-sm">—</div>
				)
			}
			body={
				<div className="space-y-1">
					<div className="flex items-center justify-between">
						<span
							className="truncate font-mono text-[11px] text-fg-secondary"
							title={name}
							dangerouslySetInnerHTML={{ __html: compactToHtml(compactVcName(name)) }}
						/>
						<span className="shrink-0 text-[11px] text-fg-muted tabular-nums">#{id}</span>
					</div>
					<div className="text-[11px] text-fg-muted">{vertexCount} tiles</div>
				</div>
			}
		/>
	);
}
