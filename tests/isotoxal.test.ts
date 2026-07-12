import { describe, it, expect } from 'vitest';
import {
  enumerateConvexIsotoxal,
  isotoxalVertices,
  polygonName,
  type IsotoxalTile,
} from '@/lib/isotoxal/enumerate';

/** All tiles of a catalog flattened. */
function flat(gridN: number, maxSideCount = 24): IsotoxalTile[] {
  return enumerateConvexIsotoxal({ gridN, maxSideCount }).groups.flatMap((g) => g.tiles);
}

function has(tiles: IsotoxalTile[], sideCount: number, alpha: number, beta: number): boolean {
  return tiles.some((t) => t.sideCount === sideCount && t.alpha === alpha && t.beta === beta);
}

describe('enumerateConvexIsotoxal — the 30° grid is exactly the two known non-decomposable members', () => {
  const cat = enumerateConvexIsotoxal({ gridN: 12 });
  const tiles = cat.groups.flatMap((g) => g.tiles);

  it('has the 90/150 hexagon and 120/150 octagon (AL’s two examples)', () => {
    expect(has(tiles, 6, 90, 150)).toBe(true);
    expect(has(tiles, 8, 120, 150)).toBe(true);
  });

  it('those are the ONLY members with 6+ sides on ζ₁₂ (the rest are rhombi)', () => {
    const bigger = tiles.filter((t) => t.sideCount >= 6);
    expect(bigger.map((t) => t.key).sort()).toEqual([bigger.find((t) => t.sideCount === 6)!.key, bigger.find((t) => t.sideCount === 8)!.key].sort());
    expect(bigger.length).toBe(2);
  });

  it('both ζ₁₂ members are flagged onZeta12', () => {
    for (const t of tiles) expect(t.onZeta12).toBe(true);
  });
});

describe('enumerateConvexIsotoxal — 15° grid surfaces the off-grid members', () => {
  const cat = enumerateConvexIsotoxal({ gridN: 24 });
  const bySide = new Map(cat.groups.map((g) => [g.sideCount, g.tiles]));

  it('hexagon gains 75/165 and 105/135 (plus the ζ₁₂ 90/150)', () => {
    const hex = bySide.get(6) ?? [];
    expect(hex.length).toBe(3);
    expect(has(hex, 6, 75, 165)).toBe(true);
    expect(has(hex, 6, 90, 150)).toBe(true);
    expect(has(hex, 6, 105, 135)).toBe(true);
  });

  it('octagon has 105/165 and 120/150', () => {
    const oct = bySide.get(8) ?? [];
    expect(oct.length).toBe(2);
    expect(has(oct, 8, 105, 165)).toBe(true);
    expect(has(oct, 8, 120, 150)).toBe(true);
  });

  it('the decagon has NO members on ζ₂₄ (5-fold ∤ 24) — shown as empty, not hidden', () => {
    expect(bySide.has(10)).toBe(false);
    expect(cat.emptySideCounts.some((e) => e.sideCount === 10)).toBe(true);
  });

  it('only ζ₁₂ members carry the onZeta12 flag', () => {
    const hex = bySide.get(6)!;
    expect(hex.find((t) => t.alpha === 90)!.onZeta12).toBe(true);
    expect(hex.find((t) => t.alpha === 75)!.onZeta12).toBe(false);
    expect(hex.find((t) => t.alpha === 105)!.onZeta12).toBe(false);
  });
});

describe('mirror dedup and regular exclusion', () => {
  it('every tile has α < β (mirror pairs merged, regular α=β excluded) on every grid', () => {
    for (const gridN of [12, 24, 36, 48]) {
      for (const t of flat(gridN)) expect(t.alpha).toBeLessThan(t.beta);
    }
  });
});

describe('isotoxalVertices realizes the geometry (closure, unit edges, convexity, correct angles)', () => {
  const samples: [number, number][] = [
    [6, 90], // 90/150 hexagon
    [8, 120], // 120/150 octagon
    [8, 135], // regular octagon (α=β) — geometry check only
    [6, 105], // 105/135 hexagon (ζ₂₄)
    [12, 135], // 135/165 dodecagon
    [4, 60], // 60/120 rhombus
  ];

  for (const [sideCount, alpha] of samples) {
    const n = sideCount / 2;
    const beta = 360 - 360 / n - alpha;
    it(`${polygonName(sideCount)} ${alpha}/${beta} closes with unit edges and is convex`, () => {
      const v = isotoxalVertices(sideCount, alpha);
      expect(v.length).toBe(sideCount);

      // Unit edges (including the closing edge v_{last} → v0).
      for (let i = 0; i < sideCount; i++) {
        const a = v[i];
        const b = v[(i + 1) % sideCount];
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(1, 9);
      }

      // Closure: edge vectors sum to zero.
      let sx = 0;
      let sy = 0;
      for (let i = 0; i < sideCount; i++) {
        const a = v[i];
        const b = v[(i + 1) % sideCount];
        sx += b.x - a.x;
        sy += b.y - a.y;
      }
      expect(Math.hypot(sx, sy)).toBeCloseTo(0, 9);

      // Interior angles: alternating α, β, all strictly convex (turn same sign throughout).
      let firstCross = 0;
      for (let i = 0; i < sideCount; i++) {
        const prev = v[(i - 1 + sideCount) % sideCount];
        const cur = v[i];
        const next = v[(i + 1) % sideCount];
        const ux = cur.x - prev.x;
        const uy = cur.y - prev.y;
        const wx = next.x - cur.x;
        const wy = next.y - cur.y;
        const cross = ux * wy - uy * wx;
        if (i === 0) firstCross = Math.sign(cross);
        expect(Math.sign(cross)).toBe(firstCross); // convex: all turns same direction
        const interior = 180 - (Math.atan2(cross, ux * wx + uy * wy) * 180) / Math.PI;
        const expected = i % 2 === 0 ? alpha : beta;
        expect(interior).toBeCloseTo(expected, 6);
        expect(interior).toBeLessThan(180);
      }
    });
  }
});
