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
				"w-full h-full group flex flex-col items-center justify-between border rounded-lg overflow-hidden transition-all",
				isSelected
					? "border-line-focus bg-accent-subtle"
					: "border-line bg-surface-overlay/50 hover:border-line-strong hover:bg-surface-overlay/80",
			)}
		>
			<div className="w-full aspect-square relative">
				<div
					className={cn(
						"absolute top-1 left-1 z-10 px-2 py-1 rounded-md font-medium text-sm backdrop-blur-sm",
						isSelected ? "bg-black/60 text-accent" : "bg-black/50 text-fg",
					)}
				>
					{name}
				</div>
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={`/theory/images/vertexTypes/${id}.png`}
					alt={`Vertex type ${name}`}
					className={cn(
						"w-full h-full object-contain transition-all",
						isSelected
							? "scale-105"
							: "grayscale group-hover:opacity-90 group-hover:grayscale-0 group-hover:scale-105",
					)}
				/>
			</div>
		</button>
	);
}
