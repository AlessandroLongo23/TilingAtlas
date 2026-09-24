import { describe, it, expect } from "vitest";
import { orbitColor, orbitHue } from "@/lib/utils/orbitColors";
import { tileFill } from "@/lib/render/tilePalette";

describe("orbitColors", () => {
  it("spreads hues equidistantly around the wheel by orbit id / k", () => {
    expect([0, 1, 2, 3].map((i) => orbitHue(i, 4))).toEqual([0, 90, 180, 270]);
  });

  // The dots are meant to echo the tiles' own colour, so the test asserts against the palette itself.
  it("paints each orbit in the tile palette", () => {
    for (let k = 1; k <= 8; k++) {
      for (let i = 0; i < k; i++) expect(orbitColor(i, k)).toBe(tileFill(orbitHue(i, k)));
    }
  });

  it("folds out-of-range / negative ids back into [0, k)", () => {
    expect(orbitHue(4, 4)).toBe(orbitHue(0, 4));
    expect(orbitHue(-1, 4)).toBe(orbitHue(3, 4));
  });

  it("single orbit (k=1) → hue 0", () => {
    expect(orbitHue(0, 1)).toBe(0);
  });
});
