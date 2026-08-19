"use client";

import { useMemo } from "react";
import { IcoFreedrawCanvas } from "@/components/freedraw/ico-freedraw-canvas";
import { sheetCount, sphStarScene } from "@/lib/render/sphStar";
import type { SphStarPattern } from "@/lib/tilings/sph-star";

import type { IcoMode } from "@/lib/render/icoFreedraw";

// Interactive view of one SPHERICAL STAR polyhedron — the sibling of SphPolyCanvas, differing only in
// which adapter builds the scene.
//
// Both display modes mean something here, but they do not mean the same thing they do on a convex
// shelf. POLYHEDRON is the flat-facet figure everyone recognises, faces coloured by their {n/d} and the
// face-through-face creases drawn. SPHERE cannot be the convex mode's curved tiling, because a star
// polyhedron covers its circumsphere `sheets` times over and those sheets are coincident at radius 1 —
// so instead of a tiling it draws the covering itself, shading each direction by how many faces lie
// over it, with the solid's edges as great-circle arcs on top. See the density fill in
// lib/render/icoFreedraw.ts, and `sheetCount` for where the number comes from.
//
// ⚑ Until 2026-08-20 this was pinned to "polyhedron" and ignored the mode entirely, while the sidebar
// went on offering Polyhedron/Sphere for all 54 records because the shelf's surface is "sphereEdges".
// The button did nothing on this shelf.

export function SphStarCanvas({
	pattern,
	mode = "polyhedron",
	showGrid,
	showCrossings = true,
}: {
	pattern: SphStarPattern;
	mode?: IcoMode;
	showGrid: boolean;
	/** Draw the creases where two faces cut through each other. On by default: without them a face that
	 *  passes through another reads as unbroken, which is the thing that looked wrong. Sphere mode has
	 *  no creases to draw, so it ignores this. */
	showCrossings?: boolean;
}) {
	const scene = useMemo(() => sphStarScene(pattern), [pattern]);
	// Only sphere mode reads it, and it costs a sample sweep over every face — so it is measured here on
	// demand instead of inside the scene, which the thumbnails build too.
	const sheets = useMemo(() => (mode === "sphere" ? sheetCount(pattern) : undefined), [pattern, mode]);
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
			tileHsb={scene.tileHsb}
			showCrossings={showCrossings}
			densitySheets={sheets}
		/>
	);
}
