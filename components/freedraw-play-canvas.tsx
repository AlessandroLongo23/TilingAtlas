"use client";

import { useMemo } from "react";
import { FreedrawCanvas } from "@/components/freedraw/freedraw-canvas";
import { useConfiguration } from "@/stores/configuration";
import type { FreedrawPattern } from "@/lib/freedraw/pattern";

// The /play overlay for a freedraw pattern — the fourth renderer, alongside the flat p5 canvas, the
// Poincaré disk and the three.js sphere. It sits on top and owns its own pointer input (drag to pan,
// wheel to zoom, double-click to refit), the way SphericalCanvas does, because there is nothing for the
// flat canvas's pan/zoom to drive: a freedraw pattern has no polygon cell, only drawn grid edges.
//
// Style comes from the configuration store (the Options tab's freedraw section), so the fill / grid /
// orbit-dot toggles drive it live.
export function FreedrawPlayCanvas({ pattern }: { pattern: FreedrawPattern }) {
	const fillMode = useConfiguration((s) => s.freedrawFill);
	const showScaffold = useConfiguration((s) => s.freedrawScaffold);
	const showVertices = useConfiguration((s) => s.freedrawVertices);
	const showLattice = useConfiguration((s) => s.freedrawLattice);
	// The SAME store field the flat canvas's Line stroke slider drives, so the control means one thing
	// across the whole app and the `lw` URL param already round-trips it.
	const lineWidth = useConfiguration((s) => s.lineWidth);
	const style = useMemo(
		() => ({ fillMode, showScaffold, showVertices, showLattice, lineWidth }),
		[fillMode, showScaffold, showVertices, showLattice, lineWidth],
	);

	// 24 cells across the shorter side. fitView measures against min(w,h), so on a wide /play canvas a
	// smaller count blows one period up to fill the screen and the pattern's repeat stops reading; this is
	// roughly the zoom at which several periods sit in view in both directions.
	return (
		<div className="absolute inset-0 z-10">
			<FreedrawCanvas pattern={pattern} style={style} cells={24} interactive />
		</div>
	);
}
