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
		<div className="flex items-center gap-3 px-3 py-2 rounded-md border border-zinc-700/30 bg-zinc-800/30 hover:border-zinc-600/40 transition-colors">
			<div className="shrink-0 w-16 h-16 rounded overflow-hidden border border-zinc-700/50 bg-zinc-900">
				{thumbnail ?? (
					<div className="w-full h-full flex items-center justify-center text-zinc-600 text-[10px]">—</div>
				)}
			</div>
			<span className="text-xs text-zinc-500 tabular-nums shrink-0 w-6 text-right">{id}</span>
			<span
				className="truncate font-mono text-sm text-zinc-300 flex-1 min-w-0"
				title={name}
				dangerouslySetInnerHTML={{ __html: compactToHtml(compactSeedName(name || "")) }}
			/>
			<span className="shrink-0 text-xs text-zinc-500">{polygonCount} polys</span>
			{onScreenshot ? (
				<button
					type="button"
					onClick={onScreenshot}
					title="Screenshot"
					aria-label="Take screenshot"
					className="p-1.5 rounded-md bg-zinc-800/90 border border-zinc-600/60 text-zinc-400 hover:text-white hover:bg-zinc-700/90 shrink-0"
				>
					<Camera size={14} />
				</button>
			) : null}
		</div>
	);
}
