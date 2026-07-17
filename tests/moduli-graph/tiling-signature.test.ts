import { describe, it, expect } from 'vitest';
import { tilingSignature } from '../../scripts/moduli-graph/tilingSignature';
import type { FloatTiling } from '../../scripts/moduli-graph/types';

// 3^6 fundamental region: one triangle up + one down over a unit triangular lattice.
const SQRT3_2 = Math.sqrt(3) / 2;
const TRI66: FloatTiling = {
  polys: [
    { n: 3, verts: [[0, 0], [1, 0], [0.5, SQRT3_2]] },
    { n: 3, verts: [[1, 0], [1.5, SQRT3_2], [0.5, SQRT3_2]] },
  ],
  basis: [[1, 0], [0.5, SQRT3_2]],
};

describe('tilingSignature', () => {
  it('gives 3^6 the all-triangle vertex configuration', () => {
    expect(tilingSignature(TRI66)).toBe('3.3.3.3.3.3');
  });

  it('is invariant under a rigid rotation of the whole tiling', () => {
    const rot = (t: number, [x, y]: [number, number]): [number, number] =>
      [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];
    const T = 0.7;
    const rotated: FloatTiling = {
      polys: TRI66.polys.map((p) => ({ ...p, verts: p.verts.map((v) => rot(T, v)) })),
      basis: [rot(T, TRI66.basis[0]), rot(T, TRI66.basis[1])],
    };
    expect(tilingSignature(rotated)).toBe(tilingSignature(TRI66));
  });

  it('is independent of fundamental-domain multiplicity (a doubled 3^6 cell signs like the primitive)', () => {
    // A 2×1 supercell of 3^6: the primitive two triangles plus their copies shifted by
    // basis[0], over a doubled first basis vector. Same tiling, larger fundamental domain.
    const shift = (dx: number, verts: [number, number][]): [number, number][] =>
      verts.map(([x, y]) => [x + dx, y]);
    const doubled: FloatTiling = {
      polys: [
        ...TRI66.polys,
        ...TRI66.polys.map((p) => ({ ...p, verts: shift(1, p.verts) })),
      ],
      basis: [[2, 0], [0.5, SQRT3_2]],
    };
    expect(tilingSignature(doubled)).toBe('3.3.3.3.3.3');
    expect(tilingSignature(doubled)).toBe(tilingSignature(TRI66));
  });

  it('welds a near-degenerate split vertex (eps merges a ~1e-4 gap)', () => {
    // 3^6 with the shared apex of the two triangles split by 1e-4 — as happens when a
    // family is evaluated just short of a degenerate limit. The default weld tolerance
    // must merge it back into one 6-valent vertex, not read two 3-valent ones.
    const split: FloatTiling = {
      polys: [
        { n: 3, verts: [[0, 0], [1, 0], [0.5, SQRT3_2]] },
        { n: 3, verts: [[1, 0], [1.5, SQRT3_2], [0.5 + 1e-4, SQRT3_2]] },
      ],
      basis: [[1, 0], [0.5, SQRT3_2]],
    };
    expect(tilingSignature(split)).toBe('3.3.3.3.3.3');
  });
});
