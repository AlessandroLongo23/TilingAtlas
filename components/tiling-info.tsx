"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import type { VertexConfiguration } from "@/classes/algorithm/VertexConfiguration";
import { VertexConfigurationThumbnail } from "./vertex-configuration-thumbnail";
import { Button } from "./ui/button";

interface VCWithOccurrences {
	vc: VertexConfiguration;
	occurrences: number;
}

interface TilingInfoProps {
	tileCount?: number;
	vcs?: VCWithOccurrences[];
}

export function TilingInfo({ tileCount = 0, vcs = [] }: TilingInfoProps) {
	const [isHovered, setIsHovered] = useState(false);

	return (
		<div
			className="relative"
			role="group"
			aria-label="Tiling information"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<Button
				variant="secondary"
				size="icon"
				icon={Info}
				aria-label="Tiling information"
			/>

			{isHovered ? (
				<div className="absolute left-0 top-10 min-w-44 max-w-[320px] bg-surface-overlay/95 backdrop-blur-sm rounded-lg border border-line shadow-xl p-3 z-50">
					<div className="flex flex-col gap-3">
						<h4 className="text-xs font-medium text-fg-muted uppercase tracking-wider">Tiling Info</h4>
						<div className="flex items-center justify-between gap-4">
							<span className="text-sm text-fg-secondary">Tiles</span>
							<span className="text-sm font-medium text-accent bg-accent-subtle px-2 py-0.5 rounded">
								{tileCount.toLocaleString()}
							</span>
						</div>
						{vcs.length > 0 ? (
							<div className="border-t border-line pt-3">
								<h4 className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">
									Vertex Configurations
								</h4>
								<div className="flex flex-wrap gap-3">
									{vcs.map(({ vc, occurrences }, i) => (
										<div key={vc.name + i} className="shrink-0 w-24">
											<VertexConfigurationThumbnail
												vc={vc}
												size={96}
												showName
												showOccurrences
												occurrences={occurrences}
											/>
										</div>
									))}
								</div>
							</div>
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}
