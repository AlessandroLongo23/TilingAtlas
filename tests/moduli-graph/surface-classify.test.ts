import { describe, it, expect } from 'vitest';
import { classifySurface } from '../../scripts/moduli-graph/surfaceClassify';
import type { CellComplex } from '../../scripts/moduli-graph/chainComplex';

// classifySurface takes the SIGNED coefficient vector of the 2-cycle (indexed by face), not the support,
// and runs a real manifold (dart-rotation) check — χ' alone would mislabel a pinched sphere as a torus.

// one face, boundary a b a⁻¹ b⁻¹ over a single vertex, 2 self-loops → torus (χ'=0, manifold).
const torus: CellComplex = {
  nodes: ['v'], edges: [[0, 0], [0, 0]],
  faces: [[{ edge: 0, sign: 1 }, { edge: 1, sign: 1 }, { edge: 0, sign: -1 }, { edge: 1, sign: -1 }]],
};
// pinch: single face a a⁻¹ → χ'=1 (odd) → degenerate, the self-fold signature.
const pinch: CellComplex = {
  nodes: ['v'], edges: [[0, 0]],
  faces: [[{ edge: 0, sign: 1 }, { edge: 0, sign: -1 }]],
};
// genuine sphere: two bigons sharing both edges a,b between p,q → χ'=2 → sphere. 2-cycle = face0+face1.
const sphere: CellComplex = {
  nodes: ['p', 'q'], edges: [[0, 1], [0, 1]],
  faces: [
    [{ edge: 0, sign: 1 }, { edge: 1, sign: -1 }],
    [{ edge: 1, sign: 1 }, { edge: 0, sign: -1 }],
  ],
};
// two triangles stored with the SAME orientation on 3 nodes/3 edges. The 2-cycle that closes is
// face0 − face1 (coeffs [1,-1]); a genuine sphere (χ'=2). Exercises sign handling.
const twinTri: CellComplex = {
  nodes: ['a', 'b', 'c'], edges: [[0, 1], [1, 2], [2, 0]],
  faces: [
    [{ edge: 0, sign: 1 }, { edge: 1, sign: 1 }, { edge: 2, sign: 1 }],
    [{ edge: 0, sign: 1 }, { edge: 1, sign: 1 }, { edge: 2, sign: 1 }],
  ],
};
// A k=2 PINCHED sphere: a 4-edge pillow (two squares glued on all 4 edges = sphere) with two pairs of
// boundary vertices identified → χ'=0. χ' alone reads this as a "torus"; the manifold check must catch
// that the true surface is a sphere pinched at 2 points, NOT a torus. Model on 2 nodes:
//   e0=[0,1] e1=[1,0] e2=[0,1] e3=[1,0]; face0 = e0+e1+e2+e3, face1 = -(e0+e3+e2+e1) (reverse loop).
const pinched2: CellComplex = {
  nodes: ['x', 'y'], edges: [[0, 1], [1, 0], [0, 1], [1, 0]],
  faces: [
    [{ edge: 0, sign: 1 }, { edge: 1, sign: 1 }, { edge: 2, sign: 1 }, { edge: 3, sign: 1 }],
    [{ edge: 0, sign: -1 }, { edge: 3, sign: -1 }, { edge: 2, sign: -1 }, { edge: 1, sign: -1 }],
  ],
};

describe('classifySurface', () => {
  it('a b a⁻¹ b⁻¹ on one vertex is a torus (χ=0, manifold)', () => {
    const s = classifySurface(torus, [1]);
    expect(s.closed).toBe(true);
    expect(s.chi).toBe(0);
    expect(s.pinches).toBe(0);
    expect(s.name).toBe('torus');
  });
  it('two bigons sharing both edges form a sphere (χ=2)', () => {
    const s = classifySurface(sphere, [1, 1]);
    expect(s.chi).toBe(2);
    expect(s.name).toBe('sphere');
  });
  it('a single a a⁻¹ face is a 1-pinched sphere, not a clean surface', () => {
    const s = classifySurface(pinch, [1]);
    expect(s.pinches).toBe(1);
    expect(s.name).toBe('pinched-sphere');
    expect(s.name).not.toBe('sphere');
  });
  it('respects coefficient SIGNS: a mixed-sign 2-cycle closes into a sphere, all-+1 does not', () => {
    expect(classifySurface(twinTri, [1, -1]).name).toBe('sphere');
    expect(classifySurface(twinTri, [1, 1]).closed).toBe(false);
  });
  it('catches a 2-pinched sphere (χ=0) as pinched, NOT a torus', () => {
    const s = classifySurface(pinched2, [1, 1]);
    expect(s.closed).toBe(true);
    expect(s.chi).toBe(0);          // χ' = 0, which alone would say "torus"
    expect(s.pinches).toBe(2);      // but two CW vertices each split into two surface vertices
    expect(s.name).toBe('pinched-sphere');
    expect(s.name).not.toBe('torus');
  });
  it('a disk (boundary edge used once) is not a closed surface', () => {
    const disk: CellComplex = {
      nodes: ['a', 'b', 'c', 'd'], edges: [[0, 1], [1, 2], [2, 3], [3, 0]],
      faces: [[{ edge: 0, sign: 1 }, { edge: 1, sign: 1 }, { edge: 2, sign: 1 }, { edge: 3, sign: 1 }]],
    };
    expect(classifySurface(disk, [1]).closed).toBe(false);
  });
});
