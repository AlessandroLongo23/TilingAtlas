"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import type { VertexConfiguration } from "@/classes/algorithm/VertexConfiguration";
import { VertexConfigurationThumbnail } from "./vertex-configuration-thumbnail";

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
			<button
				aria-label="Tiling information"
				className="flex items-center justify-center w-8 h-8 rounded-md bg-zinc-800/80 backdrop-blur-sm border border-zinc-700/50 text-white/70 hover:text-white hover:bg-zinc-700/80 hover:border-zinc-600/60 transition-all duration-200"
			>
				<Info size={16} />
			</button>

			{isHovered ? (
				<div className="absolute left-0 top-10 min-w-44 max-w-[320px] bg-zinc-800/95 backdrop-blur-sm rounded-lg border border-zinc-700/50 shadow-xl p-3 z-50">
					<div className="flex flex-col gap-3">
						<h4 className="text-xs font-medium text-white/60 uppercase tracking-wider">Tiling Info</h4>
						<div className="flex items-center justify-between gap-4">
							<span className="text-sm text-white/80">Tiles</span>
							<span className="text-sm font-medium text-green-400/90 bg-green-400/10 px-2 py-0.5 rounded">
								{tileCount.toLocaleString()}
							</span>
						</div>
						{vcs.length > 0 ? (
							<div className="border-t border-zinc-700/50 pt-3">
								<h4 className="text-xs font-medium text-white/60 uppercase tracking-wider mb-2">
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
