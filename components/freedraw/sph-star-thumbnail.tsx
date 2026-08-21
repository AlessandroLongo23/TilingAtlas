"use client";

import { useMemo } from "react";
import { SphereFreedrawThumbnail } from "@/components/freedraw/sphere-freedraw-thumbnail";
import { sphStarScene } from "@/lib/render/sphStar";
import type { SphStarPattern } from "@/lib/tilings/sph-star";

import type { IcoMode } from "@/lib/render/icoFreedraw";

// Static preview of one SPHERICAL STAR polyhedron, for the library grid and the /play sidebar. The
// sibling of SphPolyThumbnail; only the adapter differs, and the mode defaults to the faceted view for
// the same reason the canvas does.

export function SphStarThumbnail({
	pattern,
	mode = "polyhedron",
	showGrid = false,
	size = 256,
	edges = "all",
}: {
	pattern: SphStarPattern;
	mode?: IcoMode;
	showGrid?: boolean;
	size?: number;
	/** How much edge ink to draw; see SphStarCanvas. Defaults to "all", matching the canvas's default
	 *  view: a thumbnail that omits the creases shows a different solid from the one clicking it opens. */
	edges?: "none" | "true" | "all";
}) {
	const scene = useMemo(() => sphStarScene(pattern), [pattern]);
	return (
		<SphereFreedrawThumbnail
			pattern={scene.pattern}
			solidId={`sphstar-${pattern.id}`}
			vertices={scene.vertices}
			allEdges={scene.allEdges}
			mode={mode}
			keepRadius
			showGrid={showGrid}
			size={size}
			crossings={scene.crossings}
			showCrossings={edges === "all"}
			showEdges={edges !== "none"}
			tileHsb={scene.tileHsb}
		/>
	);
}
