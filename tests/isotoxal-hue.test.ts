import { describe, it, expect } from 'vitest';
import { isotoxalVertices } from '@/lib/isotoxal/enumerate';
import {
  isotoxalCharAngleDeg,
  polygonFillHue,
  polygonHue,
  starApexAngleDeg,
  starHue,
} from '@/lib/utils/renderTiling';
import { StarParametricPolygon } from '@/classes';

// Ground truth: isotoxalVertices(2n, α) builds the unit-edge convex isotoxal 2n-gon whose smaller
// alternating angle is α (β = 360 − 360/n − α). isotoxalCharAngleDeg must recover α from the outline.
describe('isotoxalCharAngleDeg recovers the smaller alternating angle', () => {
  const cases: [sideCount: number, alpha: number][] = [
    [4, 60],   // 60°/120° rhombus
    [6, 90],   // hexagon 90°/150°
    [6, 75],   // hexagon 75°/165°
    [8, 105],  // octagon 105°/165°
    [12, 135], // dodecagon 135°/165° (n=6, C=300 ⇒ α ∈ (120,150), 150 is the regular point)
  ];
  for (const [sideCount, alpha] of cases) {
    it(`${sideCount}-gon α=${alpha}`, () => {
      const got = isotoxalCharAngleDeg(isotoxalVertices(sideCount, alpha));
      expect(got).toBeCloseTo(alpha, 3);
    });
  }
});

describe('isotoxalCharAngleDeg rejects non-isotoxal outlines', () => {
  it('regular polygons → NaN (α = β)', () => {
    // A regular n-gon walked as a 2n "isotoxal" with α = β = interior angle: both classes equal.
    const reg = (n: number) => {
      const R = 1 / (2 * Math.sin(Math.PI / n));
      return Array.from({ length: n }, (_, i) => {
        const a = (2 * Math.PI * i) / n - Math.PI / 2;
        return { x: R * Math.cos(a), y: R * Math.sin(a) };
      });
    };
    expect(isotoxalCharAngleDeg(reg(4))).toBeNaN();
    expect(isotoxalCharAngleDeg(reg(6))).toBeNaN();
    expect(isotoxalCharAngleDeg(reg(8))).toBeNaN();
  });

  it('stars (reflex dents) → NaN — they are coloured by the star path', () => {
    const star = StarParametricPolygon.fromCentroidAndAngle(6, (2 * 2 * Math.PI) / 24); // 6★ 30°
    expect(isotoxalCharAngleDeg(star.vertices.map((v) => ({ x: v.x, y: v.y })))).toBeNaN();
  });

  it('odd side count → NaN', () => {
    expect(isotoxalCharAngleDeg([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }])).toBeNaN();
  });
});

describe('polygonFillHue nudges isotoxal tiles by angle, monotonically, within the band', () => {
  const SPAN = 12;
  it('same side count, different α ⇒ different hue', () => {
    const h1 = polygonFillHue(isotoxalVertices(6, 75));
    const h2 = polygonFillHue(isotoxalVertices(6, 90));
    expect(Math.abs(h1 - h2)).toBeGreaterThan(1);
  });

  it('hue increases with α across a side-count family', () => {
    const hues = [65, 75, 90, 105, 115].map((a) => polygonFillHue(isotoxalVertices(6, a)));
    for (let i = 1; i < hues.length; i++) expect(hues[i]).toBeGreaterThan(hues[i - 1]);
  });

  it('the nudge stays within ±SPAN of the irregular base', () => {
    const base = (polygonHue(6) + 180) % 360;
    for (const a of [61, 75, 90, 105, 119]) {
      const h = polygonFillHue(isotoxalVertices(6, a));
      expect(Math.abs(h - base)).toBeLessThanOrEqual(SPAN + 1e-6);
    }
  });

  it('leaves non-isotoxal irregular tiles on the plain irregular base', () => {
    // A scalene triangle: not equilateral ⇒ no isotoxal nudge.
    const tri = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0.3, y: 1 }];
    expect(polygonFillHue(tri)).toBeCloseTo((polygonHue(3) + 180) % 360, 6);
  });
});

// Guard: the star path is untouched by the isotoxal change.
describe('starHue still keys off the apex angle', () => {
  it('sharper apex ⇒ different hue than a blunt one', () => {
    const sharp = StarParametricPolygon.fromCentroidAndAngle(6, (1 * 2 * Math.PI) / 24);
    const blunt = StarParametricPolygon.fromCentroidAndAngle(6, (5 * 2 * Math.PI) / 24);
    const hs = starHue(6, starApexAngleDeg(sharp.vertices.map((v) => ({ x: v.x, y: v.y }))));
    const hb = starHue(6, starApexAngleDeg(blunt.vertices.map((v) => ({ x: v.x, y: v.y }))));
    expect(hs).not.toBeCloseTo(hb, 2);
  });
});
