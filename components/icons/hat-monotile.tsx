import { createLucideIcon } from "lucide-react";

// The hat — the aperiodic monotile of Smith, Myers, Kaplan and Goodman-Strauss (2023) — drawn as a
// lucide icon so it sits with the rest of the nav pack: 24x24 grid, currentColor stroke, round caps
// and joins, stroke width from the caller.
//
// The path is the real outline, not a sketch of one. Its 13 vertices are `hatOutline()` from
// lib/render/landingPatches.ts (eight kites of the deltoidal trihexagonal tiling; edges of length 1,
// √3 and one of 2), scaled and centred on the 24 grid — the same y-down mapping the landing page's
// hat mini uses, so icon and mini show the tile the same way round.
//
// It spans 22 wide, past the pack's usual 20, because the hat is wider than it is tall (22 x 15.9)
// and at 20 it read as the smallest icon in the nav. The cost is that the stroke's outer edge lands
// exactly on the viewBox at x = 0 and 24, with no padding left. Scaling it up further would clip;
// stretching it to fill the square would mean drawing a shape that does not tile the plane.
// tests/hat-monotile-icon.test.ts re-derives this string — regenerate it there, never nudge it by hand.
export const HAT_ICON_PATH =
	"M6.5 10.41L1 7.24L2.83 4.06L10.17 4.06L12 7.24L17.5 4.06L23 7.24L21.17 10.41L17.5 10.41L17.5 16.76L12 19.94L10.17 16.76L6.5 16.76Z";

export const HatMonotile = createLucideIcon("HatMonotile", [["path", { d: HAT_ICON_PATH, key: "hat" }]]);
