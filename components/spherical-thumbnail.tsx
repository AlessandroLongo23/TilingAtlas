"use client";

import { useEffect, useRef, useState } from "react";
import { useConfiguration } from "@/stores/configuration";
import { polyhedronForId } from "@/lib/render/sphericalSolids";
import { buildFlatSolid } from "@/lib/render/sphericalPolyhedron";
import { applyStudioMaterials } from "@/lib/render/sphericalLook";
import { mountSpinningThumb, thumbPhase } from "@/lib/render/sphereThumbStage";
import { ThumbnailSkeleton } from "@/components/ui/thumbnail-skeleton";

// A slowly turning 3D preview of a spherical tiling for the library grid and /play sidebar. It builds
// the solid with the same builder as the interactive view (one source of truth for the look) and hands
// it to the shared turntable — one WebGL context and one clock for every preview on the page, drawing
// into this card's own 2D canvas. See lib/render/sphereThumbStage.ts for why it is a stage and not a
// canvas each, and why they turn at all.

interface SphericalThumbnailProps {
	/** Stable solid id ("tetrahedron", "cuboctahedron", …). */
	solidId: string;
	/** Render resolution in device px (square). The canvas scales to fill its slot. */
	size?: number;
}

export function SphericalThumbnail({ solidId, size = 256 }: SphericalThumbnailProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	// The key that has painted, not a boolean: resetting a boolean at the top of the effect would be a
	// synchronous setState inside it (a cascading render), where comparing keys just re-derives.
	const [readyKey, setReadyKey] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);
	// Global hue ring: subscribed LIVE — every visible preview rebuilds per drag tick, matching the
	// hyperbolic thumbnails' exact-colours choice.
	const hueOffset = useConfiguration((s) => s.hueOffset);
	const ready = readyKey === solidId;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		return mountSpinningThumb({
			canvas,
			flavor: "tiling",
			phase: thumbPhase(solidId),
			build: () => {
				const poly = polyhedronForId(solidId);
				if (!poly) return null;
				const dark = document.documentElement.classList.contains("dark");
				const lineWidth = useConfiguration.getState().lineWidth;
				// ⚑ THE POLYHEDRON, NOT THE SPHERE (AL, 2026-08-21: "all polyhedra should have the polyhedra
				// view in the thumbnail instead of the spherical inflation"). Every card on this shelf is a
				// solid; the round tiling sphere is one WAY of looking at a solid and it is only available to
				// the ones that have a circumsphere. For the nineteen that do not, the sphere builder was
				// drawing the radial projection onto a sphere they do not have, which turns J31 into a green
				// blob with a few slivers on it. Faces first, projection second — the interactive view still
				// offers the sphere where it means something.
				const solid = buildFlatSolid(poly, { hueOffset, lineWidth, dark });
				if (!solid) return null;
				applyStudioMaterials(solid.object);
				return { object: solid.object, dispose: solid.dispose };
			},
			onReady: () => setReadyKey(solidId),
			onFail: () => setFailed(true),
		});
	}, [solidId, size, hueOffset]);

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
				aria-label={`${solidId} spherical tiling`}
				className={`relative w-full h-full rounded block object-cover${ready ? " ta-fade-in" : " opacity-0"}`}
			/>
		</div>
	);
}
