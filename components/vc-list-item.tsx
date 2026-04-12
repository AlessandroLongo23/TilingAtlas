"use client";

import type { KeyboardEvent } from "react";
import type { VertexConfiguration } from "@/classes/algorithm/VertexConfiguration";
import { useVcCanvas } from "@/lib/hooks/useVcCanvas";
import { cn } from "@/lib/utils/cn";

interface VCListItemProps {
	id: number;
	name: string;
	vc: VertexConfiguration | null;
	vertexCount: number;
	showCheckbox?: boolean;
	checked?: boolean;
	onToggle?: () => void;
}

export function VCListItem({
	id,
	name,
	vc,
	vertexCount,
	showCheckbox = false,
	checked = false,
	onToggle,
}: VCListItemProps) {
	const canvasRef = useVcCanvas(vc, {
		backgroundColor: "rgba(39, 39, 42, 0.5)",
		padding: 6,
		fallbackSize: 48,
	});

	const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		if (e.key === "Enter" && showCheckbox) onToggle?.();
	};

	return (
		<div
			role={showCheckbox ? "button" : undefined}
			tabIndex={showCheckbox ? 0 : undefined}
			onClick={() => showCheckbox && onToggle?.()}
			onKeyDown={handleKeyDown}
			className={cn(
				"flex items-center gap-3 px-3 py-2 rounded-md border border-zinc-700/30 bg-zinc-800/30 hover:border-zinc-600/40 transition-colors",
				showCheckbox && "cursor-pointer",
			)}
		>
			{showCheckbox ? (
				<div className="shrink-0" onClick={(e) => e.stopPropagation()}>
					<input
						type="checkbox"
						checked={checked}
						onChange={() => onToggle?.()}
						className="h-4 w-4 rounded border border-zinc-600/60 bg-zinc-800/50 checked:bg-green-500/90 checked:border-green-500/80 focus:ring-1 focus:ring-green-500/40"
					/>
				</div>
			) : null}
			<div className="shrink-0 w-12 h-12 rounded overflow-hidden border border-zinc-700/50 bg-zinc-900">
				{vc ? (
					<canvas ref={canvasRef} className="block w-full h-full" />
				) : (
					<div className="w-full h-full flex items-center justify-center text-zinc-600 text-[10px]">—</div>
				)}
			</div>
			<span className="text-xs text-zinc-500 tabular-nums shrink-0 w-6 text-right">{id}</span>
			<span className="truncate font-mono text-sm text-zinc-300" title={name}>
				{name}
			</span>
			<span className="shrink-0 text-xs text-zinc-500">{vertexCount} tiles</span>
		</div>
	);
}
