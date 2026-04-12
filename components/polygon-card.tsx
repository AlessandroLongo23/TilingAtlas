"use client";

import { useMemo } from "react";
import type { Polygon } from "@/classes/polygons/Polygon";
import { LabCard } from "./lab-card";
import { usePolygonsCanvas } from "@/lib/hooks/usePolygonsCanvas";
import { cn } from "@/lib/utils/cn";

interface PolygonCardProps {
	id: number;
	name: string;
	polygon: Polygon | null;
	tagLabel: string;
	tagClass?: "regular" | "star_regular" | "star_parametric" | "equilateral" | "generic";
}

const TAG_COLORS: Record<NonNullable<PolygonCardProps["tagClass"]>, string> = {
	regular: "text-info bg-info-subtle",
	star_regular: "text-warning bg-warning-subtle",
	star_parametric: "text-pink-400 bg-pink-400/10",
	equilateral: "text-emerald-400 bg-emerald-400/10",
	generic: "text-violet-400 bg-violet-400/10",
};

export function PolygonCard({
	id,
	name,
	polygon,
	tagLabel,
	tagClass = "regular",
}: PolygonCardProps) {
	const polygonArray = useMemo(() => (polygon ? [polygon] : null), [polygon]);
	const canvasRef = usePolygonsCanvas(polygonArray);

	return (
		<LabCard
			canvas={
				polygon ? (
					<canvas ref={canvasRef} className="block w-full h-full" />
				) : (
					<div className="w-full h-full flex items-center justify-center text-fg-disabled text-sm">—</div>
				)
			}
			body={
				<div className="space-y-1">
					<div className="flex items-center justify-between">
						<span className="truncate font-mono text-[11px] text-fg-secondary" title={name}>
							{name}
						</span>
						<span className="shrink-0 text-[11px] text-fg-muted tabular-nums">#{id}</span>
					</div>
					<span
						className={cn(
							"inline-block px-1.5 py-[1px] rounded-xl text-[0.55rem] font-medium",
							TAG_COLORS[tagClass],
						)}
					>
						{tagLabel}
					</span>
				</div>
			}
		/>
	);
}
