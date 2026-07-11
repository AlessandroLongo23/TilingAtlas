"use client";

import { cn } from "@/lib/utils/cn";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { CertificationBadge } from "@/components/ui/certification-badge";
import { polygonClassLabel } from "@/lib/utils/tilingLabel";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import type { CatalogueTiling } from "@/lib/services/catalogueService";

// A catalogue tiling card. Reuses the real renderer (TilingThumbnail ← render_cell, the float
// TranslationalCellData) and shows only catalogue-honest metadata: k, polygon family, the canonical
// key, and the certified/candidate badge. (Distinct from TilingCard, which is coupled to the legacy
// CampaignTiling shape — encoded_tiling/image_url/wallpaper/star.)
interface CatalogueCardProps {
	tiling: CatalogueTiling;
	onClick?: (t: CatalogueTiling) => void;
}

export function CatalogueCard({ tiling, onClick }: CatalogueCardProps) {
	const cell = tiling.renderCell as TranslationalCellData | null;
	const wrapperClass = cn(
		"relative flex flex-col rounded-lg border border-line bg-surface-overlay/30 hover:border-line-strong hover:bg-surface-overlay/50 transition-colors overflow-hidden group",
		onClick && "cursor-pointer text-left",
	);

	const content = (
		<>
			<div className="relative aspect-square bg-surface-raised">
				{cell ? (
					<TilingThumbnail translationalCell={cell} pxPerEdge={22} />
				) : (
					<div className="w-full h-full flex items-center justify-center text-fg-disabled text-xs">k={tiling.k}</div>
				)}
			</div>
			<div className="flex flex-col px-2.5 py-2 gap-1.5">
				<div className="flex flex-wrap items-center gap-1">
					<CertificationBadge certified={tiling.certified} size="sm" />
				</div>
				<p className="text-xs text-fg-secondary font-mono leading-tight" title={`{${tiling.family}}`}>
					k={tiling.k} · {polygonClassLabel(tiling.family)}
				</p>
				<p className="text-[10px] text-fg-disabled font-mono truncate" title={tiling.canonicalKey}>
					{tiling.canonicalKey}
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
