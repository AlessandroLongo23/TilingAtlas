// tests/orbit-colors.test.ts
import { describe, it, expect } from "vitest";
import { hexToHsb, ORBIT_COLORS_HSB, orbitColor } from "@/lib/utils/orbitColors";

describe("orbitColors", () => {
  it("converts Okabe-Ito blue (0072B2) to HSB ~ (202, 100, 70)", () => {
    const { h, s, b } = hexToHsb("0072B2");
    expect(h).toBeGreaterThanOrEqual(200);
    expect(h).toBeLessThanOrEqual(204);
    expect(s).toBe(100);
    expect(b).toBe(70);
  });

  it("has 7 colorblind-safe orbit colors", () => {
    expect(ORBIT_COLORS_HSB).toHaveLength(7);
    for (const c of ORBIT_COLORS_HSB) {
      expect(c.h).toBeGreaterThanOrEqual(0);
      expect(c.h).toBeLessThanOrEqual(360);
      expect(c.s).toBeGreaterThanOrEqual(0);
      expect(c.b).toBeGreaterThanOrEqual(0);
    }
  });

  it("cycles orbit ids past the palette length and clamps negatives", () => {
    expect(orbitColor(7)).toEqual(orbitColor(0));
    expect(orbitColor(-1)).toEqual(orbitColor(6));
  });
});
