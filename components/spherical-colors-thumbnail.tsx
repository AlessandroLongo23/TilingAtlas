"use client";

import { useEffect, useRef, useState } from "react";
import { buildSphColors } from "@/lib/render/sphColors";
import { paletteRgb255 } from "@/lib/colors/render";
import { applyStudioMaterials } from "@/lib/render/sphericalLook";
import { mountSpinningThumb, thumbPhase } from "@/lib/render/sphereThumbStage";
import { ThumbnailSkeleton } from "@/components/ui/thumbnail-skeleton";
import { useConfiguration } from "@/stores/configuration";
import type { IcoMode } from "@/lib/render/icoFreedraw";
import type { SphColorsPattern } from "@/lib/colors/sph-colors";

// A slowly turning preview of one colored Platonic solid — the sibling of SphereFreedrawThumbnail.
// Same geometry builder as the interactive canvas (buildSphColors), drawn by the shared turntable:
// one WebGL context and one clock for every preview on the page. See lib/render/sphereThumbStage.ts.

interface Props {
	pattern: SphColorsPattern;
	mode: IcoMode;
	size?: number;
}

export function SphericalColorsThumbnail({ pattern, mode, size = 256 }: Props) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	// The key that has painted, not a boolean: resetting a boolean at the top of the effect would be a
	// synchronous setState inside it (a cascading render), where comparing keys just re-derives.
	const [readyKey, setReadyKey] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);
	const palette = useConfiguration((s) => s.colorsPalette);
	const specKey = `${pattern.id}-${mode}-${palette.join(",")}`;
	const ready = readyKey === specKey;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		return mountSpinningThumb({
			canvas,
			flavor: "catalogue",
			phase: thumbPhase(specKey),
			build: () => {
				const dark = document.documentElement.classList.contains("dark");
				const content = buildSphColors(
					pattern.vertices,
					pattern.faces,
					pattern.faceColor,
					pattern.edges,
					paletteRgb255(pattern.colors, palette, dark),
					{ dark, mode },
				);
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
				aria-label={`colored ${pattern.solid} ${pattern.id}`}
				className={`relative w-full h-full rounded block object-cover${ready ? " ta-fade-in" : " opacity-0"}`}
			/>
		</div>
	);
}
