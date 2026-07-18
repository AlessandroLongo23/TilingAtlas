import { describe, it, expect } from 'vitest';
import { nullSpace, matRank } from '../../scripts/moduli-graph/exactLinAlg';

describe('exact rational linear algebra', () => {
  it('rank of a rank-2 matrix', () => {
    expect(matRank([[1, 0, 1], [0, 1, 1], [1, 1, 2]])).toBe(2); // row3 = row1+row2
  });
  it('null space of [[1,1,0],[0,0,1]] is spanned by (1,-1,0)', () => {
    const ns = nullSpace([[1, 1, 0], [0, 0, 1]], 3);
    expect(ns.length).toBe(1);
    const v = ns[0];
    expect(v[2]).toBe(0);
    expect(v[0]).toBe(-v[1]);
    expect(v[0]).not.toBe(0);
  });
  it('full-rank square matrix has trivial null space', () => {
    expect(nullSpace([[1, 0], [0, 1]], 2).length).toBe(0);
  });
  it('zero matrix null space is the whole space', () => {
    expect(nullSpace([[0, 0, 0]], 3).length).toBe(3);
  });
});
