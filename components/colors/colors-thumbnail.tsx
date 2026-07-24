"use client";

import { useMemo } from "react";
import { ColorsCanvas } from "@/components/colors/colors-canvas";
import { useConfiguration } from "@/stores/configuration";
import type { ColorPattern } from "@/lib/colors/pattern";
import type { ColorsStyle } from "@/lib/colors/render";

// The colored-tiling preview used by the /library card and the /play picker — the sibling of
// FreedrawThumbnail. In a colored tiling the palette IS the picture, so unlike the other thumbnails
// this one can follow the /play view options (`live`): the picker then previews the same two colors
// and the same tile-edge setting as the big canvas, and picking a tiling holds its look.
//
// The two overlays stay off either way. Period lattice and orbit dots are diagnostics sized for the
// full canvas; at ~100px they bury the coloring they annotate, and orbit dots need a hover the picker
// never gets.

// Module-level, not inline: ColorsCanvas takes `style` as an effect dependency, and a fresh object per
// render would redraw every thumbnail on every parent commit.
const THUMB_STYLE: Omit<ColorsStyle, "dark"> = {
	showEdges: true,
	showVertices: false,
	showLattice: false,
};

export function ColorsThumbnail({
	pattern,
	cells = 7,
	live = false,
}: {
	pattern: ColorPattern;
	cells?: number;
	/** Follow the Options tab's tile-edge toggle and palette (the /play picker). */
	live?: boolean;
}) {
	// Subscribed unconditionally (hooks can't be), but both selectors are primitives/stable references,
	// so a static thumbnail never re-renders off them.
	const showEdges = useConfiguration((s) => s.colorsEdges);
	const palette = useConfiguration((s) => s.colorsPalette);
	const style = useMemo<Omit<ColorsStyle, "dark">>(
		() => (live ? { showEdges, showVertices: false, showLattice: false, palette } : THUMB_STYLE),
		[live, showEdges, palette],
	);
	return <ColorsCanvas pattern={pattern} style={style} cells={cells} />;
}
