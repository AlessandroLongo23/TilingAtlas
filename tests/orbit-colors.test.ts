import { describe, it, expect } from "vitest";
import { orbitColor, ORBIT_SAT, ORBIT_BRI } from "@/lib/utils/orbitColors";

describe("orbitColors", () => {
  it("spreads hues equidistantly around the wheel by orbit id / k", () => {
    expect(orbitColor(0, 4)).toEqual({ h: 0, s: ORBIT_SAT, b: ORBIT_BRI });
    expect(orbitColor(1, 4)).toEqual({ h: 90, s: ORBIT_SAT, b: ORBIT_BRI });
    expect(orbitColor(2, 4)).toEqual({ h: 180, s: ORBIT_SAT, b: ORBIT_BRI });
    expect(orbitColor(3, 4)).toEqual({ h: 270, s: ORBIT_SAT, b: ORBIT_BRI });
  });

  it("uses the tile-default saturation and brightness at every k", () => {
    expect(ORBIT_SAT).toBe(40);
    expect(ORBIT_BRI).toBe(100);
    for (let k = 1; k <= 8; k++) {
      for (let i = 0; i < k; i++) {
        const c = orbitColor(i, k);
        expect(c.s).toBe(40);
        expect(c.b).toBe(100);
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
    expect(orbitColor(0, 1)).toEqual({ h: 0, s: 40, b: 100 });
  });
});
