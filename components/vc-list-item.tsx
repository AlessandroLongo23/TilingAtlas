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
				"flex items-center gap-3 px-3 py-2 rounded-md border border-line bg-surface-overlay/30 hover:border-line-strong transition-colors",
				showCheckbox && "cursor-pointer",
			)}
		>
			{showCheckbox ? (
				<div className="shrink-0" onClick={(e) => e.stopPropagation()}>
					<input
						type="checkbox"
						checked={checked}
						onChange={() => onToggle?.()}
						className="h-4 w-4 rounded border border-line-strong bg-surface-overlay/50 checked:bg-accent-subtle checked:border-line-focus focus:ring-1 focus:ring-line-focus/40"
					/>
				</div>
			) : null}
			<div className="shrink-0 w-12 h-12 rounded overflow-hidden border border-line bg-surface-raised">
				{vc ? (
					<canvas ref={canvasRef} className="block w-full h-full" />
				) : (
					<div className="w-full h-full flex items-center justify-center text-fg-disabled text-[10px]">—</div>
				)}
			</div>
			<span className="text-xs text-fg-muted tabular-nums shrink-0 w-6 text-right">{id}</span>
			<span className="truncate font-mono text-sm text-fg-secondary" title={name}>
				{name}
			</span>
			<span className="shrink-0 text-xs text-fg-muted">{vertexCount} tiles</span>
		</div>
	);
}
