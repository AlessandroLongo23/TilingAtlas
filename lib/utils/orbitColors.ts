// lib/utils/orbitColors.ts
// Vertex-orbit dot color. No fixed palette: each orbit gets an equidistant hue around the wheel
// (id / k · 360°), at the SAME saturation and brightness the tiles use by default (lib/classes/Tiling.ts
// draws fills at S=40, B=100). So the dots read as a crisp, evenly-spaced echo of the tiling's own
// palette, and k orbits always get k distinct hues — no collision at any k.

export type Hsb = { h: number; s: number; b: number };

// Match the default tile fill (Tiling.show draws fill(hue, 40, 100)).
export const ORBIT_SAT = 40;
export const ORBIT_BRI = 100;

/** HSB color for orbit `id` of `k` total orbits: hue spread equidistantly, tile-matched S and B.
 *  Ids are taken mod k (0..k-1), so an out-of-range or negative id folds back into range. */
export function orbitColor(id: number, k: number): Hsb {
  const n = Math.max(1, k);
  const i = ((id % n) + n) % n;
  return { h: (i * 360) / n, s: ORBIT_SAT, b: ORBIT_BRI };
}
