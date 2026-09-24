// lib/utils/orbitColors.ts
// Vertex-orbit dot color. No fixed palette: each orbit gets an equidistant hue around the wheel
// (id / k · 360°), painted with the tile palette itself (tileFill). So the dots read as a crisp,
// evenly-spaced echo of the tiling's own palette, and k orbits always get k distinct hues — no
// collision at any k.

import { tileFill } from "@/lib/render/tilePalette";

/** Hue in degrees for orbit `id` of `k` total orbits, spread equidistantly. Ids are taken mod k
 *  (0..k-1), so an out-of-range or negative id folds back into range. */
export function orbitHue(id: number, k: number): number {
  const n = Math.max(1, k);
  return ((((id % n) + n) % n) * 360) / n;
}

/** CSS colour for orbit `id` of `k`: its hue in the tile palette. */
export const orbitColor = (id: number, k: number): string => tileFill(orbitHue(id, k));
