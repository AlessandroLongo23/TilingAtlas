import { describe, it, expect } from 'vitest';
import { homology, type CellComplex } from '../../scripts/moduli-graph/chainComplex';

// One square face: 4 nodes, 4 edges around, one 2-cell. A disk ⇒ b=[1,0,0], χ=1.
const square: CellComplex = {
  nodes: ['a', 'b', 'c', 'd'],
  edges: [[0, 1], [1, 2], [2, 3], [3, 0]],
  faces: [[{ edge: 0, sign: 1 }, { edge: 1, sign: 1 }, { edge: 2, sign: 1 }, { edge: 3, sign: 1 }]],
};
// Same four edges, NO face: a hollow ring (annulus/circle) ⇒ b₁=1.
const ring: CellComplex = { ...square, faces: [] };
// Two squares sharing edge 1 (b→c). Still a disk ⇒ b=[1,0,0], χ=1.
const twoSquares: CellComplex = {
  nodes: ['a', 'b', 'c', 'd', 'e', 'f'],
  edges: [[0, 1], [1, 2], [2, 3], [3, 0], [1, 4], [4, 5], [5, 2]],
  faces: [
    [{ edge: 0, sign: 1 }, { edge: 1, sign: 1 }, { edge: 2, sign: 1 }, { edge: 3, sign: 1 }],
    [{ edge: 4, sign: 1 }, { edge: 5, sign: 1 }, { edge: 6, sign: 1 }, { edge: 1, sign: -1 }],
  ],
};
// Two disjoint square faces ⇒ b₀=2.
const disjoint: CellComplex = {
  nodes: ['a', 'b', 'c', 'd', 'A', 'B', 'C', 'D'],
  edges: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4]],
  faces: [
    [{ edge: 0, sign: 1 }, { edge: 1, sign: 1 }, { edge: 2, sign: 1 }, { edge: 3, sign: 1 }],
    [{ edge: 4, sign: 1 }, { edge: 5, sign: 1 }, { edge: 6, sign: 1 }, { edge: 7, sign: 1 }],
  ],
};

describe('homology of small complexes', () => {
  it('a single square is a disk', () => {
    const h = homology(square);
    expect(h.betti).toEqual([1, 0, 0]);
    expect(h.chi).toBe(1);
    expect(h.selfCheckOK).toBe(true);
  });
  it('four edges with no face is a circle (b1=1)', () => {
    const h = homology(ring);
    expect(h.betti).toEqual([1, 1, 0]);
    expect(h.chi).toBe(0);
    expect(h.selfCheckOK).toBe(true);
  });
  it('two squares sharing an edge is still a disk', () => {
    const h = homology(twoSquares);
    expect(h.betti).toEqual([1, 0, 0]);
    expect(h.chi).toBe(1);
  });
  it('two disjoint faces give b0=2', () => {
    const h = homology(disjoint);
    expect(h.betti).toEqual([2, 0, 0]);
    expect(h.chi).toBe(2);
  });
});
