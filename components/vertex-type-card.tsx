"use client";

import { cn } from "@/lib/utils/cn";

interface VertexTypeCardProps {
	id: string;
	name: string;
	isSelected: boolean;
	onToggle: (id: string) => void;
}

export function VertexTypeCard({ id, name, isSelected, onToggle }: VertexTypeCardProps) {
	return (
		<button
			type="button"
			onClick={() => onToggle(id)}
			aria-pressed={isSelected}
			className={cn(
				"group flex h-full w-full flex-col items-center justify-between overflow-hidden rounded-lg border transition-all",
				isSelected
					? "border-line-focus bg-surface-overlay"
					: "border-line bg-surface-overlay/50 hover:border-line-strong hover:bg-surface-overlay/80",
			)}
		>
			<div className="relative aspect-square w-full">
				<div
					className={cn(
						"absolute top-1 left-1 z-10 rounded-md px-2 py-1 text-sm font-medium backdrop-blur-sm",
						isSelected ? "bg-black/60 text-white" : "bg-black/50 text-fg",
					)}
				>
					{name}
				</div>
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={`/theory/images/vertexTypes/${id}.png`}
					alt={`Vertex type ${name}`}
					className={cn(
						"h-full w-full object-contain transition-all",
						isSelected ? "scale-105" : "grayscale group-hover:scale-105 group-hover:opacity-90 group-hover:grayscale-0",
					)}
				/>
			</div>
		</button>
	);
}
