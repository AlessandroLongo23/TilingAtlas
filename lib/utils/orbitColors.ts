// lib/utils/orbitColors.ts
// Vertex-orbit dot color. No fixed palette: each orbit gets an equidistant hue around the wheel
// (id / k · 360°), at the SAME saturation and brightness the tiles are filled with. So the dots read as
// a crisp, evenly-spaced echo of the tiling's own palette, and k orbits always get k distinct hues — no
// collision at any k.

import { TILE_SAT_PCT, TILE_VAL_PCT } from "@/lib/render/tilePalette";

export type Hsb = { h: number; s: number; b: number };

// Match the tile fill, by taking its numbers instead of restating them (lib/render/tilePalette.ts).
export const ORBIT_SAT = TILE_SAT_PCT;
export const ORBIT_BRI = TILE_VAL_PCT;

/** HSB color for orbit `id` of `k` total orbits: hue spread equidistantly, tile-matched S and B.
 *  Ids are taken mod k (0..k-1), so an out-of-range or negative id folds back into range. */
export function orbitColor(id: number, k: number): Hsb {
  const n = Math.max(1, k);
  const i = ((id % n) + n) % n;
  return { h: (i * 360) / n, s: ORBIT_SAT, b: ORBIT_BRI };
}
