"use client";

import { Play } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { polygonClassLabel } from "@/lib/utils/tilingLabel";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";

// A Reference (Oracle) tiling card. Same renderer as the certified catalogue (TilingThumbnail ←
// float TranslationalCellData), but the metadata is honest about provenance: source (Galebach/Myers)
// + oracle id + k, and NO certification badge — these are external literature tilings, not our proven
// results (§0). A "family" one-parameter tiling gets an α chip so it's discoverable.
interface ReferenceCardProps {
	tiling: ReferenceTiling;
	onClick?: (t: ReferenceTiling) => void;
}

const SOURCE_LABEL: Record<ReferenceTiling["source"], string> = {
	galebach: "Galebach",
	myers: "Myers",
	ctrnact: "Čtrnáct",
	"ctrnact-star": "Star engine",
};

export function ReferenceCard({ tiling, onClick }: ReferenceCardProps) {
	const isFamily = Array.isArray(tiling.alphaRange);
	const wrapperClass = cn(
		"relative flex flex-col rounded-lg border border-line bg-surface-overlay/30 hover:border-line-strong hover:bg-surface-overlay/50 transition-colors overflow-hidden group",
		onClick && "cursor-pointer text-left",
	);

	const content = (
		<>
			<div className="relative aspect-square bg-surface-raised">
				<TilingThumbnail translationalCell={tiling.renderCell} pxPerEdge={22} />
				<div className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full border border-sky-400/25 bg-sky-400/10 px-1.5 py-0.5 text-[9px] font-medium text-sky-400 backdrop-blur-sm">
					{SOURCE_LABEL[tiling.source]}
				</div>
				{isFamily || tiling.candidate ? (
					<div className="absolute top-1.5 right-1.5 flex items-center gap-1">
						{tiling.candidate ? (
							<div className="inline-flex items-center rounded-full border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-400 backdrop-blur-sm">
								NEW?
							</div>
						) : null}
						{isFamily ? (
							<div className="inline-flex items-center rounded-full border border-violet-400/25 bg-violet-400/10 px-1.5 py-0.5 text-[9px] font-medium text-violet-400 backdrop-blur-sm">
								α
							</div>
						) : null}
					</div>
				) : null}
				{onClick ? (
					<div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
						<span className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-accent/90 px-2 py-1 text-[10px] font-medium text-white shadow-sm">
							<Play size={11} fill="currentColor" /> Open in Play
						</span>
					</div>
				) : null}
			</div>
			<div className="flex flex-col px-2.5 py-2 gap-1">
				<p className="text-xs text-fg-secondary font-mono leading-tight" title={`{${tiling.family}}`}>
					k={tiling.k} · {polygonClassLabel(tiling.family)}
				</p>
				<p className="text-[10px] text-fg-disabled font-mono truncate" title={tiling.id}>
					{tiling.id}
				</p>
			</div>
		</>
	);

	if (onClick) {
		return (
			<div
				className={wrapperClass}
				role="button"
				tabIndex={0}
				onClick={() => onClick(tiling)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onClick(tiling);
					}
				}}
			>
				{content}
			</div>
		);
	}
	return <div className={wrapperClass}>{content}</div>;
}
