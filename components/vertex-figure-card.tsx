"use client";

import { useMemo } from "react";
import { VertexConfigCard } from "@/components/vertex-config-card";
import type { VertexConfig } from "@/lib/configs/vertexConfigs";
import { figureFromWord } from "@/lib/render/vertexFigure";
import { cn } from "@/lib/utils/cn";

// One vertex configuration on a slide: the polygons fanned around their shared vertex, named
// underneath. Drawn by the /configs page's own card, so a configuration looks the same on a slide as
// it does in the atlas, but built from its name rather than from an alphabet file, so a slide can
// show configurations no palette ships.
//
// Each figure is fitted to its own card, as on /configs, rather than drawn at a scale shared across
// the row. A shared scale would be truer, but 3.7.42 is thirteen unit edges across and 6.6.6 is
// three, so sharing one would leave most of the slide too small to read.

interface VertexFigureCardProps {
	word: string;
	/** False for a configuration that closes 360 degrees and still appears in no tiling: drawn muted
	 *  and outlined in dashes, so the two groups read apart without a second grid. */
	tiles?: boolean;
}

export function VertexFigureCard({ word, tiles = true }: VertexFigureCardProps) {
	const config = useMemo<VertexConfig | null>(() => {
		const polys = figureFromWord(word);
		if (!polys) return null;
		return {
			word,
			corners: polys.map((p) => ((p.n - 2) * 180) / p.n),
			polys: polys.map((p) => ({
				kind: "regular" as const,
				n: p.n,
				verts: p.vertices.map((v) => [v.x, v.y] as [number, number]),
			})),
		};
	}, [word]);

	if (!config) {
		return (
			<div className="not-prose mx-auto flex aspect-square w-full items-center justify-center rounded-xl border border-line bg-surface-overlay/30 p-2 text-center text-[0.6rem] text-fg-muted">
				{word} does not close
			</div>
		);
	}

	return (
		<figure className={cn("not-prose m-0 mx-auto w-full", !tiles && "opacity-70")}>
			<div
				className={cn(
					"relative aspect-square w-full overflow-hidden rounded-xl bg-surface-base",
					tiles ? "border border-line" : "border border-dashed border-line-strong",
				)}
			>
				<VertexConfigCard config={config} />
			</div>
			<figcaption
				className={cn(
					"mt-2 text-center font-mono text-[clamp(0.6rem,0.85vh+0.28vw,0.95rem)]",
					tiles ? "text-fg-secondary" : "text-fg-muted",
				)}
			>
				{word}
			</figcaption>
		</figure>
	);
}
