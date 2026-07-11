"use client";

import { useMemo } from "react";
import { Camera } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { compactSeedName, compactToHtml } from "@/lib/utils/compactSeedName";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import {
	renderTilingToDataUrl,
	type RawPolygon,
	type TranslationalCellData,
} from "@/lib/utils/renderTiling";
import { useScreenshotPreview } from "@/stores/screenshotPreview";
import { AlgorithmTiling } from "@/classes/algorithm/Tiling";
import { sanitizeForStorage } from "@/lib/utils/storageKey";
import type { CampaignTiling } from "@/lib/services/campaignService";

type Density = "comfortable" | "compact";

interface TilingCardProps {
	tiling: CampaignTiling;
	density?: Density;
	onClick?: (tiling: CampaignTiling) => void;
}

export function resolveTilingLabel(tiling: CampaignTiling): string {
	const encName = (tiling.encoded_tiling as { name?: string } | undefined)?.name;
	const tcName = (tiling.translational_cell as { n?: string } | null)?.n;
	return (
		encName ??
		tcName ??
		tiling.polygon_names?.join(" + ") ??
		`k=${tiling.k} m=${tiling.m}`
	);
}

export function TilingCard({ tiling, density = "comfortable", onClick }: TilingCardProps) {
	const label = resolveTilingLabel(tiling);
	const compact = useMemo(
		() => (label.startsWith("[") && label.endsWith("]") ? compactToHtml(compactSeedName(label)) : label),
		[label],
	);
	const openScreenshot = useScreenshotPreview((s) => s.open);

	const isCompact = density === "compact";
	const wrapperClass = cn(
		"relative flex flex-col rounded-lg border border-line bg-surface-overlay/30 hover:border-line-strong hover:bg-surface-overlay/50 transition-colors overflow-hidden group",
		onClick && "cursor-pointer text-left",
	);
	const padClass = isCompact ? "px-1.5 py-1 gap-0.5" : "px-2.5 py-2 gap-1.5";
	const nameClass = isCompact
		? "text-[10px] text-fg-secondary font-mono leading-tight truncate"
		: "text-xs text-fg-secondary font-mono leading-tight break-all";
	const badgeClass = isCompact
		? "text-[8px] px-1 py-0.5 rounded bg-surface-overlay/50 text-fg-muted"
		: "text-[10px] px-1.5 py-0.5 rounded bg-surface-overlay/50 text-fg-muted";
	const badgeInfoClass = isCompact
		? "text-[8px] px-1 py-0.5 rounded text-info bg-info-subtle"
		: "text-[10px] px-1.5 py-0.5 rounded text-info bg-info-subtle";
	const badgeRegClass = isCompact
		? "text-[8px] px-1 py-0.5 rounded text-emerald-400 bg-emerald-400/10"
		: "text-[10px] px-1.5 py-0.5 rounded text-emerald-400 bg-emerald-400/10";
	const badgeStarClass = isCompact
		? "text-[8px] px-1 py-0.5 rounded text-yellow-400 bg-yellow-400/10"
		: "text-[10px] px-1.5 py-0.5 rounded text-yellow-400 bg-yellow-400/10";

	const pxPerEdge = isCompact ? 16 : 22;

	const canScreenshot = Boolean(tiling.translational_cell || tiling.encoded_tiling);

	const handleScreenshot = (e: React.MouseEvent) => {
		e.stopPropagation();
		let polygons: RawPolygon[] | undefined;
		const translationalCell = tiling.translational_cell as TranslationalCellData | null;
		if (!translationalCell && tiling.encoded_tiling && (tiling.encoded_tiling as { seed?: unknown }).seed) {
			try {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				polygons = (AlgorithmTiling as any).expandToPolygons(tiling.encoded_tiling);
			} catch (err) {
				console.warn("screenshot: failed to expand encoded tiling", err);
			}
		}
		const dataUrl = renderTilingToDataUrl(
			{
				translationalCell,
				polygons,
				pxPerEdge: 48,
				background: "#1e1e22",
			},
			1024,
			"image/png",
		);
		if (!dataUrl) return;
		const safe = sanitizeForStorage(label || `tiling-${tiling.id}`);
		openScreenshot({
			imageDataUrl: dataUrl,
			filename: `${safe || "tiling"}.png`,
			rulestring: label,
			groupId: null,
			allowSupabaseUpload: false,
		});
	};

	const content = (
		<>
			<div className="relative aspect-square bg-surface-raised">
				{tiling.translational_cell ? (
					<TilingThumbnail translationalCell={tiling.translational_cell} pxPerEdge={pxPerEdge} />
				) : tiling.encoded_tiling ? (
					<TilingThumbnail encodedTiling={tiling.encoded_tiling} pxPerEdge={pxPerEdge} />
				) : tiling.image_url ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img src={tiling.image_url} alt="tiling" className="w-full h-full object-cover" />
				) : (
					<div className="w-full h-full flex items-center justify-center text-fg-disabled text-xs">
						k={tiling.k}
					</div>
				)}
				{canScreenshot ? (
					<button
						type="button"
						onClick={handleScreenshot}
						title="Screenshot"
						aria-label="Take screenshot"
						className="absolute top-1.5 right-1.5 p-1.5 rounded-md bg-surface-overlay/80 border border-line-strong text-fg-muted hover:text-fg hover:bg-surface-overlay opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
					>
						<Camera size={13} />
					</button>
				) : null}
			</div>
			<div className={cn("flex flex-col", padClass)}>
				<p
					className={nameClass}
					title={label}
					dangerouslySetInnerHTML={{ __html: compact }}
				/>
				<div className="flex flex-wrap gap-1">
					{tiling.k != null ? <span className={badgeClass}>k={tiling.k}</span> : null}
					{!isCompact && tiling.m != null ? <span className={badgeClass}>m={tiling.m}</span> : null}
					{tiling.wallpaper_group ? (
						<span className={badgeInfoClass}>{tiling.wallpaper_group}</span>
					) : null}
					{tiling.is_regular ? <span className={badgeRegClass}>reg</span> : null}
					{tiling.is_star ? <span className={badgeStarClass}>star</span> : null}
				</div>
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
