"use client";

import { ColorsCanvas } from "@/components/colors/colors-canvas";
import type { ColorPattern } from "@/lib/colors/pattern";
import { useConfiguration } from "@/stores/configuration";
import { useMemo } from "react";

// The /play overlay for a colored square tiling — the sibling of FreedrawPlayCanvas: an absolutely
// positioned 2D canvas with its own pan/zoom, mounted over the blanked flat canvas (there is no
// polygon cell to drive the p5 view). Style comes from the configuration store (the Options tab's
// colors trio), so the edges / lattice / orbit toggles and their G/P/O shortcuts drive this view.
export function ColorsPlayCanvas({ pattern }: { pattern: ColorPattern }) {
	const showEdges = useConfiguration((s) => s.colorsEdges);
	const showVertices = useConfiguration((s) => s.colorsVertices);
	const showLattice = useConfiguration((s) => s.colorsLattice);
	const palette = useConfiguration((s) => s.colorsPalette);
	const style = useMemo(
		() => ({ showEdges, showVertices, showLattice, palette }),
		[showEdges, showVertices, showLattice, palette],
	);
	// 24 cells across the shorter side, matching FreedrawPlayCanvas: roughly the zoom at which several
	// periods sit in view in both directions.
	return (
		<div className="absolute inset-0 z-10">
			<ColorsCanvas pattern={pattern} style={style} cells={24} interactive />
		</div>
	);
}
