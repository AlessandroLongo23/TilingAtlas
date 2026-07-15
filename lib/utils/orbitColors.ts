// lib/utils/orbitColors.ts
// Vertex-orbit marker palette. Okabe–Ito (colorblind-safe), the SAME order the thesis figure exporter
// uses (figures/style/palette.ts ORBIT_COLORS), converted to the p5 HSB model so the web canvas and the
// thesis figures agree on which color is which orbit.

export type Hsb = { h: number; s: number; b: number };

/** Convert a 6-hex-digit RGB string (no '#') to HSB with h in [0,360], s,b in [0,100]. */
export function hexToHsb(hex: string): Hsb {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const bl = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, bl);
  const min = Math.min(r, g, bl);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - bl) / d) % 6);
    else if (max === g) h = 60 * ((bl - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  return { h: Math.round(h), s: Math.round(s * 100), b: Math.round(max * 100) };
}

// Okabe–Ito hex in the figures ORBIT_COLORS order: blue, vermillion, green, purple, orange, skyBlue, yellow.
const ORBIT_HEX = ["0072B2", "D55E00", "009E73", "CC79A7", "E69F00", "56B4E9", "F0E442"];

export const ORBIT_COLORS_HSB: Hsb[] = ORBIT_HEX.map(hexToHsb);

/** Orbit id → HSB color, cycling past the palette length; negative ids clamp into range. */
export function orbitColor(id: number): Hsb {
  const n = ORBIT_COLORS_HSB.length;
  return ORBIT_COLORS_HSB[((id % n) + n) % n];
}
