"use client";

import { useMemo } from "react";
import { IcoFreedrawCanvas } from "@/components/freedraw/ico-freedraw-canvas";
import { sphSchwarzScene } from "@/lib/render/sphSchwarz";
import type { SphSchwarzPattern } from "@/lib/freedraw/schwarz";
import type { IcoMode } from "@/lib/render/icoFreedraw";

// Interactive view of one SPHERICAL Schwarz edge system. The whole component is the adapter: a Schwarz
// record carries its own board (no Platonic solid to index into), so it hands IcoFreedrawCanvas that
// geometry instead of a solid id. Trackball, lighting, tile colours and drawn-edge tubes are the
// Platonic freedraw canvas unchanged, which is the point — the two shelves read as one look.

export function SphSchwarzCanvas({
	pattern,
	mode,
	showGrid,
}: {
	pattern: SphSchwarzPattern;
	mode: IcoMode;
	showGrid: boolean;
}) {
	const scene = useMemo(() => sphSchwarzScene(pattern), [pattern]);
	return (
		<IcoFreedrawCanvas
			pattern={scene.pattern}
			solidId={`schwarz-${pattern.board}`}
			vertices={scene.vertices}
			allEdges={scene.allEdges}
			mode={mode}
			showGrid={showGrid}
		/>
	);
}
