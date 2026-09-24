"use client";

import { useEffect, useRef, useState } from "react";
import { useConfiguration } from "@/stores/configuration";
import { polyhedronForId } from "@/lib/render/sphericalSolids";
import { solidEdges } from "@/lib/render/sphericalGeometry";
import { buildIcoFreedraw, type IcoMode, type IcoPattern } from "@/lib/render/icoFreedraw";
import { applyStudioMaterials } from "@/lib/render/sphericalLook";
import { mountSpinningThumb, thumbPhase } from "@/lib/render/sphereThumbStage";
import { ThumbnailSkeleton } from "@/components/ui/thumbnail-skeleton";

// A slowly turning preview of ONE Platonic-solid freedraw pattern, for the catalogue grid on /freedraw
// (spherical), the star and Schwarz shelves, and the /play sidebar. Same geometry builder as the
// interactive IcoFreedrawCanvas (one source of truth for the look), drawn by the shared turntable —
// one WebGL context and one clock for every preview on the page. See lib/render/sphereThumbStage.ts.
//
// Thumbnails track the header's Display toggles — polyhedron/sphere, grid, edges — so the catalogue
// reads the same way as the interactive preview. Flipping one rebuilds the visible cards (lazy +
// queued, so only what is on screen re-builds).

interface SphereFreedrawThumbnailProps {
	pattern: IcoPattern;
	/** Which Platonic solid the pattern lives on ("icosahedron", "cube", …). Ignored when `vertices` is
	 *  given — a spherical SCHWARZ board has no canonical solid to name. */
	solidId: string;
	/** "polyhedron" flat facets + chord edges, or "sphere" curved patches + arc edges. */
	mode: IcoMode;
	keepRadius?: boolean;
	/** Draw the solid's full edge grid faintly under the pattern. */
	showGrid: boolean;
	/** Render resolution in device px (square). The canvas scales to fill its slot. */
	size?: number;
	/** Self-contained boards (Schwarz) ship their own unit vertices and edge list instead of indexing
	 *  into a canonical solid — the same override IcoFreedrawCanvas takes, so both stay one look. */
	vertices?: [number, number, number][];
	allEdges?: [number, number][];
	/** Face-through-face creases, and whether to draw them; see sphStar.faceCrossings. */
	crossings?: import("@/lib/render/sphStar").Crease[];
	showCrossings?: boolean;
	/** Draw the pattern's own edges at all; see IcoFreedrawCanvas. */
	showEdges?: boolean;
	/** Per-tile hue, parallel to the pattern's tiles, overriding the golden-angle tileColor. */
	tileHue?: number[];
}

export function SphereFreedrawThumbnail({
	pattern,
	solidId,
	mode,
	keepRadius,
	showGrid,
	size = 256,
	vertices,
	allEdges,
	crossings,
	showCrossings,
	showEdges,
	tileHue,
}: SphereFreedrawThumbnailProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	// The key that has painted, not a boolean: resetting a boolean at the top of the effect would be a
	// synchronous setState inside it (a cascading render), where comparing keys just re-derives.
	const [readyKey, setReadyKey] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);
	const specKey = `${solidId}-${pattern.id}-${mode}-${keepRadius ? "r" : ""}-${showGrid ? "g" : ""}-${showCrossings ? "x" : ""}-${showEdges === false ? "e0" : ""}`;
	const ready = readyKey === specKey;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		return mountSpinningThumb({
			canvas,
			flavor: "catalogue",
			phase: thumbPhase(specKey),
			build: () => {
				const solid = vertices ? null : polyhedronForId(solidId);
				const verts = vertices ?? (solid?.vertices as [number, number, number][] | undefined);
				if (!verts) return null;
				const dark = document.documentElement.classList.contains("dark");
				const content = buildIcoFreedraw(pattern, verts, {
					dark,
					mode,
					keepRadius,
					showGrid,
					allEdges: showGrid ? (allEdges ?? (solid ? solidEdges(solid) : undefined)) : undefined,
					crossings,
					showCrossings,
					showEdges,
					tileHue,
				});
				applyStudioMaterials(content.object);
				return { object: content.object, dispose: content.dispose };
			},
			onReady: () => setReadyKey(specKey),
			onFail: () => setFailed(true),
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [specKey, size]);

	if (failed) {
		return (
			<div className="w-full h-full flex items-center justify-center bg-surface-raised rounded text-fg-disabled text-[10px]">
				sphere
			</div>
		);
	}

	return (
		<div className="relative w-full h-full">
			<ThumbnailSkeleton done={ready} />
			<canvas
				ref={canvasRef}
				width={size}
				height={size}
				aria-label={`${solidId} freedraw ${pattern.id}`}
				className={`relative w-full h-full rounded block object-cover${ready ? " ta-fade-in" : " opacity-0"}`}
			/>
		</div>
	);
}
