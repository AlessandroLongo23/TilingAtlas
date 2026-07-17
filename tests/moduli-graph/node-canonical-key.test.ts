import { describe, it, expect } from 'vitest';
import { nodeCanonicalKey } from '../../scripts/moduli-graph/nodeCanonicalKey';
import type { FloatTiling } from '../../scripts/moduli-graph/types';

// A scalene triangle — the canonical 2D chiral shape: sides 3, 2√2, √5 are all distinct, so no
// reflection maps it to itself and its mirror is NOT superimposable by any rotation+translation.
const scalene: [number, number][] = [[0, 0], [3, 0], [1, 2]];
const chiral: FloatTiling = { polys: [{ n: 3, verts: scalene }], basis: [[4, 0], [0, 3]] };
const mirror = (t: FloatTiling): FloatTiling => ({
  polys: t.polys.map((p) => ({ n: p.n, verts: p.verts.map(([x, y]) => [x, -y] as [number, number]) })),
  basis: [[t.basis[0][0], -t.basis[0][1]], [t.basis[1][0], -t.basis[1][1]]],
});
const rotScale = (t: FloatTiling, deg: number, s: number): FloatTiling => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const m = ([x, y]: [number, number]): [number, number] => [s * (x * c - y * sn), s * (x * sn + y * c)];
  return { polys: t.polys.map((p) => ({ n: p.n, verts: p.verts.map(m) })), basis: [m(t.basis[0]), m(t.basis[1])] };
};
// A square unit cell (achiral).
const square: FloatTiling = { polys: [{ n: 4, verts: [[0, 0], [1, 0], [1, 1], [0, 1]] }], basis: [[1, 0], [0, 1]] };

describe('nodeCanonicalKey', () => {
  it('is invariant under rotation + uniform scale', () => {
    expect(nodeCanonicalKey(rotScale(chiral, 41, 2.3)).key).toBe(nodeCanonicalKey(chiral).key);
  });
  it('splits a chiral tiling from its mirror and flags handed', () => {
    const a = nodeCanonicalKey(chiral), b = nodeCanonicalKey(mirror(chiral));
    expect(a.key).not.toBe(b.key);
    expect(a.handed).toBe(true);
  });
  it('merges an achiral tiling with its mirror and flags achiral', () => {
    const a = nodeCanonicalKey(square), b = nodeCanonicalKey(mirror(square));
    expect(a.key).toBe(b.key);
    expect(a.handed).toBe(false);
  });
  it('distinguishes genuinely different tilings', () => {
    expect(nodeCanonicalKey(chiral).key).not.toBe(nodeCanonicalKey(square).key);
  });
});
