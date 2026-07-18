import { describe, it, expect } from 'vitest';
import { classifySurface } from '../../scripts/moduli-graph/surfaceClassify';
import type { CellComplex } from '../../scripts/moduli-graph/chainComplex';

// classifySurface takes the SIGNED coefficient vector of the 2-cycle (indexed by face), not the support.

// one face, boundary a b a⁻¹ b⁻¹ over a single vertex, 2 edges → V'=1 E'=2 F'=1 → χ'=0 → torus.
const torus: CellComplex = {
  nodes: ['v'], edges: [[0, 0], [0, 0]],
  faces: [[{ edge: 0, sign: 1 }, { edge: 1, sign: 1 }, { edge: 0, sign: -1 }, { edge: 1, sign: -1 }]],
};
// pinch: single face a a⁻¹ → V'=1 E'=1 F'=1 → χ'=1 (odd) → degenerate, the self-fold signature.
const pinch: CellComplex = {
  nodes: ['v'], edges: [[0, 0]],
  faces: [[{ edge: 0, sign: 1 }, { edge: 0, sign: -1 }]],
};
// genuine sphere: two bigons sharing both edges a,b between p,q → V'=2 E'=2 F'=2 → χ'=2 → sphere. The
// 2-cycle is face0 + face1 (coeffs [1,1]) because face1 already traverses the shared edges oppositely.
const sphere: CellComplex = {
  nodes: ['p', 'q'], edges: [[0, 1], [0, 1]],
  faces: [
    [{ edge: 0, sign: 1 }, { edge: 1, sign: -1 }],
    [{ edge: 1, sign: 1 }, { edge: 0, sign: -1 }],
  ],
};
// two triangles stored with the SAME orientation (both +e0+e1+e2) on 3 nodes, 3 edges. The 2-cycle that
// closes is face0 − face1 (coeffs [1,-1]); the naive all-+1 support would NOT cancel. → sphere, χ'=2.
const twinTri: CellComplex = {
  nodes: ['a', 'b', 'c'], edges: [[0, 1], [1, 2], [2, 0]],
  faces: [
    [{ edge: 0, sign: 1 }, { edge: 1, sign: 1 }, { edge: 2, sign: 1 }],
    [{ edge: 0, sign: 1 }, { edge: 1, sign: 1 }, { edge: 2, sign: 1 }],
  ],
};

describe('classifySurface', () => {
  it('a b a⁻¹ b⁻¹ on one vertex is a torus (χ=0)', () => {
    const s = classifySurface(torus, [1]);
    expect(s.closed).toBe(true);
    expect(s.chi).toBe(0);
    expect(s.name).toBe('torus');
  });
  it('two bigons sharing both edges form a sphere (χ=2)', () => {
    const s = classifySurface(sphere, [1, 1]);
    expect(s.closed).toBe(true);
    expect(s.chi).toBe(2);
    expect(s.name).toBe('sphere');
  });
  it('a single a a⁻¹ face is a degenerate pinch, not a clean surface', () => {
    expect(classifySurface(pinch, [1]).name).toBe('degenerate');
  });
  it('respects coefficient SIGNS: a mixed-sign 2-cycle closes, the all-+1 support does not', () => {
    expect(classifySurface(twinTri, [1, -1]).name).toBe('sphere');   // signed cycle closes → sphere
    expect(classifySurface(twinTri, [1, 1]).closed).toBe(false);     // naive support fails to cancel
  });
  it('a disk (boundary edge used once) is not a closed surface', () => {
    const disk: CellComplex = {
      nodes: ['a', 'b', 'c', 'd'], edges: [[0, 1], [1, 2], [2, 3], [3, 0]],
      faces: [[{ edge: 0, sign: 1 }, { edge: 1, sign: 1 }, { edge: 2, sign: 1 }, { edge: 3, sign: 1 }]],
    };
    expect(classifySurface(disk, [1]).closed).toBe(false);
  });
});
