import { describe, it, expect } from 'vitest';
import { classifySurface } from '../../scripts/moduli-graph/surfaceClassify';
import type { CellComplex } from '../../scripts/moduli-graph/chainComplex';

// one face, boundary a b a^-1 b^-1 over a single vertex, 2 edges → V'=1 E'=2 F'=1 → χ'=0 → torus.
const torus: CellComplex = {
  nodes: ['v'], edges: [[0, 0], [0, 0]],
  faces: [[{ edge: 0, sign: 1 }, { edge: 1, sign: 1 }, { edge: 0, sign: -1 }, { edge: 1, sign: -1 }]],
};
// pinch: single face a a⁻¹ over one vertex → V'=1 E'=1 F'=1 → χ'=1 (odd, orientable) → degenerate,
// the self-fold signature (what k2-82/83 should produce).
const pinch: CellComplex = {
  nodes: ['v'], edges: [[0, 0]],
  faces: [[{ edge: 0, sign: 1 }, { edge: 0, sign: -1 }]],
};
// genuine sphere: two bigons sharing both edges a,b between p,q → V'=2 E'=2 F'=2 → χ'=2 → sphere.
const sphere: CellComplex = {
  nodes: ['p', 'q'], edges: [[0, 1], [0, 1]],
  faces: [
    [{ edge: 0, sign: 1 }, { edge: 1, sign: -1 }],
    [{ edge: 1, sign: 1 }, { edge: 0, sign: -1 }],
  ],
};

describe('classifySurface', () => {
  it('a b a⁻¹ b⁻¹ on one vertex is a torus (χ=0, orientable)', () => {
    const s = classifySurface(torus, [0]);
    expect(s.closed).toBe(true);
    expect(s.chi).toBe(0);
    expect(s.name).toBe('torus');
  });
  it('two bigons sharing both edges form a sphere (χ=2)', () => {
    const s = classifySurface(sphere, [0, 1]);
    expect(s.closed).toBe(true);
    expect(s.chi).toBe(2);
    expect(s.name).toBe('sphere');
  });
  it('a single a a⁻¹ face is a degenerate pinch, not a clean surface', () => {
    expect(classifySurface(pinch, [0]).name).toBe('degenerate');
  });
  it('a disk (boundary edge used once) is not a closed surface', () => {
    const disk: CellComplex = {
      nodes: ['a', 'b', 'c', 'd'], edges: [[0, 1], [1, 2], [2, 3], [3, 0]],
      faces: [[{ edge: 0, sign: 1 }, { edge: 1, sign: 1 }, { edge: 2, sign: 1 }, { edge: 3, sign: 1 }]],
    };
    expect(classifySurface(disk, [0]).closed).toBe(false);
  });
});
