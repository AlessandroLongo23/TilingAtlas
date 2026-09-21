import { describe, it, expect } from "vitest";
import { orbitColor, ORBIT_SAT, ORBIT_BRI } from "@/lib/utils/orbitColors";
import { TILE_SAT_PCT, TILE_VAL_PCT } from "@/lib/render/tilePalette";

describe("orbitColors", () => {
  it("spreads hues equidistantly around the wheel by orbit id / k", () => {
    expect(orbitColor(0, 4)).toEqual({ h: 0, s: ORBIT_SAT, b: ORBIT_BRI });
    expect(orbitColor(1, 4)).toEqual({ h: 90, s: ORBIT_SAT, b: ORBIT_BRI });
    expect(orbitColor(2, 4)).toEqual({ h: 180, s: ORBIT_SAT, b: ORBIT_BRI });
    expect(orbitColor(3, 4)).toEqual({ h: 270, s: ORBIT_SAT, b: ORBIT_BRI });
  });

  // Asserted against the palette constants, not against 40/100. The dots are meant to echo the tiles'
  // own colour, so the test that protects that has to move WITH the palette — a hardcoded 40 only says
  // "40" and fails noisily the day the palette moves, which is exactly what it did.
  it("uses the tile-default saturation and brightness at every k", () => {
    expect(ORBIT_SAT).toBe(TILE_SAT_PCT);
    expect(ORBIT_BRI).toBe(TILE_VAL_PCT);
    for (let k = 1; k <= 8; k++) {
      for (let i = 0; i < k; i++) {
        const c = orbitColor(i, k);
        expect(c.s).toBe(TILE_SAT_PCT);
        expect(c.b).toBe(TILE_VAL_PCT);
        expect(c.h).toBeGreaterThanOrEqual(0);
        expect(c.h).toBeLessThan(360);
      }
    }
  });

  it("folds out-of-range / negative ids back into [0, k)", () => {
    expect(orbitColor(4, 4)).toEqual(orbitColor(0, 4));
    expect(orbitColor(-1, 4)).toEqual(orbitColor(3, 4));
  });

  it("single orbit (k=1) → hue 0", () => {
    expect(orbitColor(0, 1)).toEqual({ h: 0, s: TILE_SAT_PCT, b: TILE_VAL_PCT });
  });
});
