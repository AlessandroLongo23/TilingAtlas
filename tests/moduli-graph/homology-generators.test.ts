import { describe, it, expect } from 'vitest';
import { homologyGenerators } from '../../scripts/moduli-graph/homologyGenerators';
import type { CellComplex } from '../../scripts/moduli-graph/chainComplex';

// The standard one-face torus: a single square a b a⁻¹ b⁻¹ over one vertex, with a,b two self-loops.
// ∂2(face)=0 (edges cancel) ⇒ ker∂2 dim 1 ⇒ H2=1; ∂1=0 (self-loops) ⇒ ker∂1 dim 2, im∂2=0 ⇒ H1=2.
const torus: CellComplex = {
  nodes: ['v'],
  edges: [[0, 0], [0, 0]], // a, b : two self-loops at the single vertex
  faces: [[{ edge: 0, sign: 1 }, { edge: 1, sign: 1 }, { edge: 0, sign: -1 }, { edge: 1, sign: -1 }]],
};

describe('homologyGenerators', () => {
  it('a one-face torus has one H2 generator and two H1 generators', () => {
    const g = homologyGenerators(torus);
    expect(g.h2.length).toBe(1);
    expect(g.h2[0].faces).toEqual([0]);            // the single face is the 2-cycle
    expect(g.h1.length).toBe(2);                   // a and b survive as loops
  });
  it('a single square disk has no H2 and no H1', () => {
    const disk: CellComplex = {
      nodes: ['a', 'b', 'c', 'd'],
      edges: [[0, 1], [1, 2], [2, 3], [3, 0]],
      faces: [[{ edge: 0, sign: 1 }, { edge: 1, sign: 1 }, { edge: 2, sign: 1 }, { edge: 3, sign: 1 }]],
    };
    const g = homologyGenerators(disk);
    expect(g.h2.length).toBe(0);
    expect(g.h1.length).toBe(0);
  });
});
