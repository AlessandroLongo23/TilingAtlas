"use client";

import { FreedrawCanvas } from "@/components/freedraw/freedraw-canvas";
import type { FreedrawPattern } from "@/lib/freedraw/pattern";
import type { FreedrawStyle } from "@/lib/freedraw/render";

// The freedraw preview used by the /library card and the /play picker — the sibling of
// HyperbolicDevelopedThumbnail and SphericalThumbnail, and the only way those two surfaces can show a
// freedraw pattern at all (it has no polygon cell for TilingThumbnail to draw).
//
// Static, like the other two: it does NOT follow the /play view options. A thumbnail is read at ~100px,
// where a solid fill is the only thing that survives — bare line art at that size is a smudge. Filled by
// shape (congruent tiles share a hue; rotations and mirrors count as one), and no scaffold grid — the
// bare lattice under the tiles just adds noise at thumbnail size.

// Module-level, not inline: FreedrawCanvas takes `style` as an effect dependency, and a fresh object per
// render would redraw every thumbnail on every parent commit.
const THUMB_STYLE: Omit<FreedrawStyle, "dark"> = {
	fillMode: "shape",
	showScaffold: false,
	showVertices: false,
	showLattice: false,
	lineWidth: 1,
};

export function FreedrawThumbnail({ pattern, cells = 7 }: { pattern: FreedrawPattern; cells?: number }) {
	return <FreedrawCanvas pattern={pattern} style={THUMB_STYLE} cells={cells} />;
}
