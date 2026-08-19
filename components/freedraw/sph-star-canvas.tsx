"use client";

import { useMemo } from "react";
import { IcoFreedrawCanvas } from "@/components/freedraw/ico-freedraw-canvas";
import { sphStarScene } from "@/lib/render/sphStar";
import type { SphStarPattern } from "@/lib/tilings/sph-star";

import type { IcoMode } from "@/lib/render/icoFreedraw";

// Interactive view of one SPHERICAL STAR polyhedron — the sibling of SphPolyCanvas, differing only in
// which adapter builds the scene. The default mode is "polyhedron", not "sphere": a star polyhedron's
// faces overlap on the circumsphere by construction (that is what density means), so the curved patches
// would z-fight, while the flat facets are the picture everyone recognises.

export function SphStarCanvas({
	pattern,
	mode = "polyhedron",
	showGrid,
	showCrossings = false,
}: {
	pattern: SphStarPattern;
	mode?: IcoMode;
	showGrid: boolean;
	/** Draw the creases where two faces cut through each other. Off by default: they are not edges of
	 *  the solid, so the plain view is the one whose ink matches the record's V, E and F. */
	showCrossings?: boolean;
}) {
	const scene = useMemo(() => sphStarScene(pattern), [pattern]);
	return (
		<IcoFreedrawCanvas
			pattern={scene.pattern}
			solidId={`sphstar-${pattern.id}`}
			vertices={scene.vertices}
			allEdges={scene.allEdges}
			mode={mode}
			keepRadius
			showGrid={showGrid}
			crossings={scene.crossings}
			showCrossings={showCrossings}
		/>
	);
}
