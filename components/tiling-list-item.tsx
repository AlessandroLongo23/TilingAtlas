"use client";

import type { MouseEvent, ReactNode } from "react";
import { Camera } from "lucide-react";
import { compactSeedName, compactToHtml } from "@/lib/utils/compactSeedName";

interface TilingListItemProps {
	id: number;
	name: string;
	polygonCount: number;
	thumbnail?: ReactNode;
	onScreenshot?: (e: MouseEvent<HTMLButtonElement>) => void;
}

export function TilingListItem({
	id,
	name,
	polygonCount,
	thumbnail,
	onScreenshot,
}: TilingListItemProps) {
	return (
		<div className="flex items-center gap-3 px-3 py-2 rounded-md border border-line bg-surface-overlay/30 hover:border-line-strong transition-colors">
			<div className="shrink-0 w-16 h-16 rounded overflow-hidden border border-line bg-surface-raised">
				{thumbnail ?? (
					<div className="w-full h-full flex items-center justify-center text-fg-disabled text-[10px]">—</div>
				)}
			</div>
			<span className="text-xs text-fg-muted tabular-nums shrink-0 w-6 text-right">{id}</span>
			<span
				className="truncate font-mono text-sm text-fg-secondary flex-1 min-w-0"
				title={name}
				dangerouslySetInnerHTML={{ __html: compactToHtml(compactSeedName(name || "")) }}
			/>
			<span className="shrink-0 text-xs text-fg-muted">{polygonCount} polys</span>
			{onScreenshot ? (
				<button
					type="button"
					onClick={onScreenshot}
					title="Screenshot"
					aria-label="Take screenshot"
					className="p-1.5 rounded-md bg-surface-overlay/90 border border-line-strong text-fg-muted hover:text-fg hover:bg-surface-overlay/90 shrink-0"
				>
					<Camera size={14} />
				</button>
			) : null}
		</div>
	);
}
