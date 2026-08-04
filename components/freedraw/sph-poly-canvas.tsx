"use client";

import { useMemo } from "react";
import { IcoFreedrawCanvas } from "@/components/freedraw/ico-freedraw-canvas";
import { sphPolyScene } from "@/lib/render/sphPoly";
import type { SphPolyPattern } from "@/lib/tilings/sph-poly";

import type { IcoMode } from "@/lib/render/icoFreedraw";

// Interactive view of one SPHERICAL 3.4.n.4 tiling — the sibling of SphSchwarzCanvas, differing only
// in which adapter builds the scene. A record carries its own solid (at k > 1 these are not uniform
// and have no table to index into), so the geometry is handed to IcoFreedrawCanvas directly, and
// trackball, lighting, face colours and edge tubes are the Platonic freedraw canvas unchanged.

export function SphPolyCanvas({
	pattern,
	mode,
	showGrid,
}: {
	pattern: SphPolyPattern;
	mode: IcoMode;
	showGrid: boolean;
}) {
	const scene = useMemo(() => sphPolyScene(pattern), [pattern]);
	return (
		<IcoFreedrawCanvas
			pattern={scene.pattern}
			solidId={`sphpoly-${pattern.base}`}
			vertices={scene.vertices}
			allEdges={scene.allEdges}
			mode={mode}
			showGrid={showGrid}
		/>
	);
}
