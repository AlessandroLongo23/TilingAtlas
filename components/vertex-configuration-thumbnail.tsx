"use client";

import type { VertexConfiguration } from "@/classes/algorithm/VertexConfiguration";
import { useVcCanvas } from "@/lib/hooks/useVcCanvas";

interface VertexConfigurationThumbnailProps {
	vc: VertexConfiguration | null;
	size?: number;
	showName?: boolean;
	showOccurrences?: boolean;
	occurrences?: number;
}

export function VertexConfigurationThumbnail({
	vc,
	size = 200,
	showName = false,
	showOccurrences = false,
	occurrences,
}: VertexConfigurationThumbnailProps) {
	const canvasRef = useVcCanvas(vc, {
		backgroundColor: "rgba(39, 39, 42, 0.5)",
		padding: 12,
		fallbackSize: size,
	});

	return (
		<div className="flex flex-col rounded-lg overflow-hidden border border-zinc-700/40 bg-zinc-800/40">
			<canvas
				ref={canvasRef}
				className="block w-full aspect-square"
				style={{ minWidth: size, minHeight: size }}
			/>
			{(showName || showOccurrences) && vc ? (
				<div className="px-2 py-1.5 text-sm font-mono text-zinc-300 bg-zinc-800/60 border-t border-zinc-700/30 flex items-center justify-between gap-2 min-w-0">
					{showName ? (
						<span className="truncate" title={vc.name}>
							{vc.name}
						</span>
					) : null}
					{showOccurrences && occurrences !== undefined && occurrences > 1 ? (
						<span className="shrink-0 text-zinc-500">×{occurrences}</span>
					) : null}
				</div>
			) : null}
		</div>
	);
}
