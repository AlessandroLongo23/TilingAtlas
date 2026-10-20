"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useConfiguration } from "@/stores/configuration";
import { polyhedronForId } from "@/lib/render/sphericalSolids";
import { buildBubbleSphere } from "@/lib/render/sphBubble";
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
	/** Spherical bubble: the decoration's per-face bite words. Its presence swaps the flat solid for the
	 *  meshed bubble surface — those records have no flat-faced solid to draw (lib/render/sphBubble.ts). */
	bubbleBites?: number[][];
	/** Render resolution in device px (square). The canvas scales to fill its slot. */
	size?: number;
}

export function SphericalThumbnail({ solidId, bubbleBites, size = 256 }: SphericalThumbnailProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	// The key that has painted, not a boolean: resetting a boolean at the top of the effect would be a
	// synchronous setState inside it (a cascading render), where comparing keys just re-derives.
	const [readyKey, setReadyKey] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);
	// ⚑ The effect below keys on this STRING, never on `bubbleBites` itself. An array prop is a fresh
	// identity on every render, so listing it as a dep tore the thumbnail down and rebuilt it forever and
	// `onReady` never fired — every spherical bubble card sat on its skeleton, blank.
	const bitesKey = bubbleBites ? bubbleBites.map((w) => w.join("")).join("|") : "";
	// The effect reads the array through this ref; the key above says when it changed.
	const bitesRef = useRef(bubbleBites);
	useLayoutEffect(() => {
		bitesRef.current = bubbleBites;
	});
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
				const bubbleBites = bitesRef.current;
				if (bubbleBites) {
					const cfg = useConfiguration.getState();
					const bubble = buildBubbleSphere(poly, bubbleBites, {
						style: cfg.bubbleEdgeStyle,
						kochLevel: cfg.bubbleKochLevel,
						hueOffset,
						lineWidth,
						dark,
					});
					return bubble ? { object: bubble.object, dispose: bubble.dispose } : null;
				}
				const solid = buildFlatSolid(poly, { hueOffset, lineWidth, dark });
				if (!solid) return null;
				applyStudioMaterials(solid.object);
				return { object: solid.object, dispose: solid.dispose };
			},
			onReady: () => setReadyKey(solidId),
			onFail: () => setFailed(true),
		});
	}, [solidId, size, hueOffset, bitesKey]);

	if (failed) {
		return (
			<div className="flex h-full w-full items-center justify-center rounded bg-surface-raised text-[10px] text-fg-disabled">
				sphere
			</div>
		);
	}

	return (
		<div className="relative h-full w-full">
			<ThumbnailSkeleton done={ready} />
			<canvas
				ref={canvasRef}
				width={size}
				height={size}
				aria-label={`${solidId} spherical tiling`}
				className={`relative block h-full w-full rounded object-cover ${ready ? "ta-fade-in" : "opacity-0"}`}
			/>
		</div>
	);
}
