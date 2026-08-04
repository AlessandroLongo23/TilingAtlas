"use client";

import { useMemo } from "react";
import { SphereFreedrawThumbnail } from "@/components/freedraw/sphere-freedraw-thumbnail";
import { sphSchwarzScene, type SphBoardPattern } from "@/lib/render/sphSchwarz";

import type { IcoMode } from "@/lib/render/icoFreedraw";

// Static preview of one SPHERICAL Schwarz edge system, for the library grid and the /play sidebar.
// The whole component is the adapter: a Schwarz record carries its own board (there is no Platonic
// solid to index into), so it hands SphereFreedrawThumbnail that geometry instead of a solid id and
// everything else — lighting, tile colours, drawn-edge tubes, the queue, the lazy observer — is the
// Platonic freedraw thumbnail unchanged.

export function SphSchwarzThumbnail({
	pattern,
	mode = "polyhedron",
	showGrid = false,
	size = 256,
}: {
	pattern: SphBoardPattern & { board: string };
	mode?: IcoMode;
	showGrid?: boolean;
	size?: number;
}) {
	const scene = useMemo(() => sphSchwarzScene(pattern), [pattern]);
	return (
		<SphereFreedrawThumbnail
			pattern={scene.pattern}
			solidId={`sphboard-${pattern.board}`}
			vertices={scene.vertices}
			allEdges={scene.allEdges}
			mode={mode}
			showGrid={showGrid}
			size={size}
		/>
	);
}
