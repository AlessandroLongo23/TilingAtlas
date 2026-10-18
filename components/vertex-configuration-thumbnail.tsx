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
		<div className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface-overlay/40">
			<canvas ref={canvasRef} className="block aspect-square w-full" style={{ minWidth: size, minHeight: size }} />
			{(showName || showOccurrences) && vc ? (
				<div className="flex min-w-0 items-center justify-between gap-2 border-t border-line bg-surface-overlay/60 px-2 py-1.5 font-mono text-sm text-fg-secondary">
					{showName ? (
						<span className="truncate" title={vc.name}>
							{vc.name}
						</span>
					) : null}
					{showOccurrences && occurrences !== undefined && occurrences > 1 ? (
						<span className="shrink-0 text-fg-muted">×{occurrences}</span>
					) : null}
				</div>
			) : null}
		</div>
	);
}
