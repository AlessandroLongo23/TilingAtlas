import { describe, it, expect } from 'vitest';
import { isotoxalVertices } from '@/lib/isotoxal/enumerate';
import {
  polygonFillHue,
  polygonHue,
  regularityDefect,
  starApexAngleDeg,
  starHue,
} from '@/lib/utils/renderTiling';
import { StarParametricPolygon } from '@/classes';

const IRREGULAR_HUE_SPAN = 22;

const regular = (n: number) => {
  const R = 1 / (2 * Math.sin(Math.PI / n));
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    return { x: R * Math.cos(a), y: R * Math.sin(a) };
  });
};

// Unit-edge rhombus with smaller angle α — the play page's flexing 4α tile. α=90 is the square.
const rhombus = (alphaDeg: number) => {
  const a = (alphaDeg * Math.PI) / 180;
  return [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1 + Math.cos(a), y: Math.sin(a) },
    { x: Math.cos(a), y: Math.sin(a) },
  ];
};

const rectangle = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }];

describe('regularityDefect', () => {
  it('is zero exactly on regular polygons', () => {
    for (const n of [3, 4, 5, 6, 8, 12]) {
      expect(regularityDefect(regular(n))).toBeLessThan(1e-9);
    }
  });

  it('scores a rectangle as irregular (equiangular, not equilateral)', () => {
    expect(regularityDefect(rectangle)).toBeGreaterThan(0.5);
  });

  it('scores a rhombus as irregular (equilateral, not equiangular)', () => {
    expect(regularityDefect(rhombus(60))).toBeGreaterThan(0.3);
  });

  it('rises monotonically as a rhombus skews away from the square', () => {
    const ds = [89, 75, 60, 45].map((a) => regularityDefect(rhombus(a)));
    for (let i = 1; i < ds.length; i++) expect(ds[i]).toBeGreaterThan(ds[i - 1]);
  });

  it('vanishes continuously at the regular limit', () => {
    expect(regularityDefect(rhombus(89.99))).toBeLessThan(1e-3);
  });
});

// The point of the scheme: a tile flexing onto a regular shape must flex onto that shape's colour.
describe('polygonFillHue is continuous at regularity', () => {
  it('a rhombus converges on the square hue as α → 90°', () => {
    const square = polygonHue(4);
    expect(polygonFillHue(rhombus(90))).toBeCloseTo(square, 6);
    expect(Math.abs(polygonFillHue(rhombus(89.9)) - square)).toBeLessThan(1);
    expect(Math.abs(polygonFillHue(rhombus(89)) - square)).toBeLessThan(4);
  });

  it('an isotoxal 2n-gon converges on the regular 2n-gon hue at α = C/2', () => {
    // C = α + β = 360 − 360/n; the regular point is α = C/2, the regular 2n-gon's interior angle.
    for (const sideCount of [6, 8, 12]) {
      const n = sideCount / 2;
      const alphaReg = (360 - 360 / n) / 2;
      const base = polygonHue(sideCount);
      const h = polygonFillHue(isotoxalVertices(sideCount, alphaReg - 0.05));
      expect(Math.abs(h - base)).toBeLessThan(1);
    }
  });

  it('regular polygons land exactly on the by-side-count ramp', () => {
    for (const n of [3, 4, 6, 8, 12]) {
      expect(polygonFillHue(regular(n))).toBeCloseTo(polygonHue(n), 6);
    }
  });
});

describe('polygonFillHue still separates irregular tiles from their regular sibling', () => {
  it('hue drifts monotonically down the ramp as the tile skews', () => {
    const hues = [89, 75, 60, 45].map((a) => polygonFillHue(rhombus(a)));
    for (let i = 1; i < hues.length; i++) expect(hues[i]).toBeLessThan(hues[i - 1]);
  });

  it('same side count, different α ⇒ different hue', () => {
    const h1 = polygonFillHue(isotoxalVertices(6, 75));
    const h2 = polygonFillHue(isotoxalVertices(6, 90));
    expect(Math.abs(h1 - h2)).toBeGreaterThan(1);
  });

  it('a rectangle never reads as a square', () => {
    expect(Math.abs(polygonFillHue(rectangle) - polygonHue(4))).toBeGreaterThan(10);
  });

  it('the drift stays inside the span, so no tile crosses onto a neighbouring side count', () => {
    const cases = [rhombus(45), rhombus(60), rectangle, isotoxalVertices(6, 61), isotoxalVertices(8, 95)];
    for (const verts of cases) {
      const base = polygonHue(verts.length);
      const drift = (((base - polygonFillHue(verts)) % 360) + 360) % 360;
      expect(drift).toBeGreaterThan(0);
      expect(drift).toBeLessThanOrEqual(IRREGULAR_HUE_SPAN + 1e-6);
    }
  });
});

// Guard: the star path is untouched.
describe('starHue still keys off the apex angle', () => {
  it('sharper apex ⇒ different hue than a blunt one', () => {
    const sharp = StarParametricPolygon.fromCentroidAndAngle(6, (1 * 2 * Math.PI) / 24);
    const blunt = StarParametricPolygon.fromCentroidAndAngle(6, (5 * 2 * Math.PI) / 24);
    const hs = starHue(6, starApexAngleDeg(sharp.vertices.map((v) => ({ x: v.x, y: v.y }))));
    const hb = starHue(6, starApexAngleDeg(blunt.vertices.map((v) => ({ x: v.x, y: v.y }))));
    expect(hs).not.toBeCloseTo(hb, 2);
  });
});
