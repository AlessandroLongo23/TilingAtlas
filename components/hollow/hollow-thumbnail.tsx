"use client";

import { HollowCanvas } from "@/components/hollow/hollow-canvas";
import type { HollowStyle } from "@/lib/hollow/render";

// The hollow-tiling preview for the /library card and the /play picker — sibling of
// FreedrawThumbnail and HyperbolicDevelopedThumbnail, and the only way those surfaces can show a
// hollow tiling (its overlapping faces give TilingThumbnail no cell to draw).
//
// Static and non-interactive, like the other two. Filled by tile type, not by density: at
// ~100px the accumulating density wash reads as one flat grey, whereas per-tile hue still separates
// the star from the polygon it interleaves with.

// Module-level: HollowCanvas takes `style` as an effect dependency, so a fresh object per render
// would repaint every thumbnail on every parent commit.
const THUMB_STYLE: Omit<HollowStyle, "dark"> = {
	fillMode: "tile",
	showVertices: false,
	lineWidth: 1,
};

export function HollowThumbnail({ patch }: { patch: string }) {
	return <HollowCanvas patchId={patch} style={THUMB_STYLE} interactive={false} />;
}
