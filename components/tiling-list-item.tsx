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

export function TilingListItem({ id, name, polygonCount, thumbnail, onScreenshot }: TilingListItemProps) {
	return (
		<div className="flex items-center gap-3 rounded-md border border-line bg-surface-overlay/30 px-3 py-2 transition-colors hover:border-line-strong">
			<div className="h-16 w-16 shrink-0 overflow-hidden rounded border border-line bg-surface-raised">
				{thumbnail ?? (
					<div className="flex h-full w-full items-center justify-center text-[10px] text-fg-disabled">—</div>
				)}
			</div>
			<span className="w-6 shrink-0 text-right text-xs text-fg-muted tabular-nums">{id}</span>
			<span
				className="min-w-0 flex-1 truncate font-mono text-sm text-fg-secondary"
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
					className="shrink-0 rounded-md border border-line-strong bg-surface-overlay/90 p-1.5 text-fg-muted hover:bg-surface-overlay/90 hover:text-fg"
				>
					<Camera size={14} />
				</button>
			) : null}
		</div>
	);
}
