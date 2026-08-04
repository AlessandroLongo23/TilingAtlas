"use client";

import { useMemo } from "react";
import { SphereFreedrawThumbnail } from "@/components/freedraw/sphere-freedraw-thumbnail";
import { sphPolyScene } from "@/lib/render/sphPoly";
import type { SphPolyPattern } from "@/lib/tilings/sph-poly";

import type { IcoMode } from "@/lib/render/icoFreedraw";

// Static preview of one SPHERICAL 3.4.n.4 tiling, for the library grid and the /play sidebar. The
// sibling of SphSchwarzThumbnail; only the adapter differs. Lighting, face colours, edge tubes, the
// render queue and the lazy observer are the Platonic freedraw thumbnail unchanged.

export function SphPolyThumbnail({
	pattern,
	mode = "polyhedron",
	showGrid = false,
	size = 256,
}: {
	pattern: SphPolyPattern;
	mode?: IcoMode;
	showGrid?: boolean;
	size?: number;
}) {
	const scene = useMemo(() => sphPolyScene(pattern), [pattern]);
	return (
		<SphereFreedrawThumbnail
			pattern={scene.pattern}
			solidId={`sphpoly-${pattern.base}`}
			vertices={scene.vertices}
			allEdges={scene.allEdges}
			mode={mode}
			showGrid={showGrid}
			size={size}
		/>
	);
}
