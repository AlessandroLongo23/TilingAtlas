"use client";

import { useMemo, type KeyboardEvent } from "react";
import type { Polygon } from "@/classes/polygons/Polygon";
import { usePolygonsCanvas } from "@/lib/hooks/usePolygonsCanvas";
import { cn } from "@/lib/utils/cn";

interface PolygonListItemProps {
	id: number;
	name: string;
	polygon: Polygon | null;
	tagLabel: string;
	tagClass?: "regular" | "star_regular" | "star_parametric" | "equilateral" | "generic";
	showCheckbox?: boolean;
	checked?: boolean;
	onToggle?: () => void;
}

const TAG_COLORS: Record<NonNullable<PolygonListItemProps["tagClass"]>, string> = {
	regular: "text-info bg-info-subtle",
	star_regular: "text-warning bg-warning-subtle",
	star_parametric: "text-pink-400 bg-pink-400/10",
	equilateral: "text-emerald-400 bg-emerald-400/10",
	generic: "text-violet-400 bg-violet-400/10",
};

export function PolygonListItem({
	id,
	name,
	polygon,
	tagLabel,
	tagClass = "regular",
	showCheckbox = false,
	checked = false,
	onToggle,
}: PolygonListItemProps) {
	const polygonArray = useMemo(() => (polygon ? [polygon] : null), [polygon]);
	const canvasRef = usePolygonsCanvas(polygonArray, {
		backgroundColor: "#1e1e24",
		padding: 6,
		fallbackSize: 48,
		strokeColor: "rgba(0, 0, 0, 0.7)",
	});

	const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
		if (e.key === "Enter" && showCheckbox) onToggle?.();
	};

	return (
		<div
			role={showCheckbox ? "button" : undefined}
			tabIndex={showCheckbox ? 0 : undefined}
			onClick={() => showCheckbox && onToggle?.()}
			onKeyDown={handleKey}
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
				{polygon ? (
					<canvas ref={canvasRef} className="block w-full h-full" />
				) : (
					<div className="w-full h-full flex items-center justify-center text-fg-disabled text-[10px]">—</div>
				)}
			</div>
			<span className="text-xs text-fg-muted tabular-nums shrink-0 w-6 text-right">{id}</span>
			<span className="truncate font-mono text-sm text-fg-secondary" title={name}>
				{name}
			</span>
			<span
				className={cn(
					"shrink-0 px-1.5 py-[1px] rounded-xl text-[0.55rem] font-medium",
					TAG_COLORS[tagClass],
				)}
			>
				{tagLabel}
			</span>
		</div>
	);
}
