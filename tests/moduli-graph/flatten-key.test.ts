import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { evaluateParamCell } from '@/lib/utils/paramCell';
import { polyArea } from '../../scripts/moduli-graph/geometry';
import { flattenKey } from '../../scripts/moduli-graph/flattenKey';
import type { FloatTiling } from '../../scripts/moduli-graph/types';

const atlas = JSON.parse(readFileSync('public/reference-atlas-isotoxal.json', 'utf8'));
const recs = (Array.isArray(atlas) ? atlas : atlas.records) as { id: string; paramCell: any }[];
const pc = (id: string) => recs.find((r) => r.id === id)!.paramCell;

const limit = (id: string, which: 'lo' | 'hi'): FloatTiling => {
  const p = pc(id);
  const [lo, hi] = p.params[0].alphaRangeDegOpen;
  const cell = evaluateParamCell(p, which === 'lo' ? lo + 1e-3 : hi - 1e-3);
  const polys = (cell.cellPolygons as { n: number; vertices: [number, number][] }[])
    .map((q) => ({ n: q.n, verts: q.vertices }))
    .filter((q) => polyArea(q.verts) > 1e-4);
  return { polys, basis: cell.basis as FloatTiling['basis'] };
};

const rotateScale = (t: FloatTiling, deg: number, s: number): FloatTiling => {
  const th = (deg * Math.PI) / 180, c = Math.cos(th), sn = Math.sin(th);
  const m = ([x, y]: [number, number]): [number, number] => [s * (x * c - y * sn), s * (x * sn + y * c)];
  return { polys: t.polys.map((p) => ({ n: p.n, verts: p.verts.map(m) })), basis: [m(t.basis[0]), m(t.basis[1])] };
};

describe('flattenKey identifies non-edge-to-edge flatten limits up to direct similarity', () => {
  it("merges a family's two ends into one limit (k1-16: lo == hi)", () => {
    expect(flattenKey(limit('ctrnact-isotoxal-family-k1-16', 'lo')))
      .toBe(flattenKey(limit('ctrnact-isotoxal-family-k1-16', 'hi')));
  });

  it('is invariant under rotation + uniform scale', () => {
    const t = limit('ctrnact-isotoxal-family-k1-16', 'hi');
    expect(flattenKey(rotateScale(t, 37, 2.5))).toBe(flattenKey(t));
  });

  it('merges mirror-image ends (chirality-blind): k1-15 lo == hi despite the reflected lattice', () => {
    expect(flattenKey(limit('ctrnact-isotoxal-family-k1-15', 'lo')))
      .toBe(flattenKey(limit('ctrnact-isotoxal-family-k1-15', 'hi')));
  });

  it('distinguishes the four genuinely different limit tilings', () => {
    const k = (id: string) => flattenKey(limit(id, 'hi'));
    const keys = new Set([
      k('ctrnact-isotoxal-family-k1-01'), k('ctrnact-isotoxal-family-k1-14'),
      k('ctrnact-isotoxal-family-k1-15'), k('ctrnact-isotoxal-family-k1-16'),
    ]);
    expect(keys.size).toBe(4);
  });
});
