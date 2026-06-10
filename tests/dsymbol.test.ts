/**
 * M0 — Delaney–Dress symbol core. Ports the verified behavior of
 * experiments/delaney-dress/{dsymbol,minimal_image_test,ground_truth}.py.
 * Pure combinatorics, no geometry. The numbers here are the SHA-cross-checked
 * ground-truth oracle (FINDINGS §3); they must not drift.
 */
import { describe, it, expect } from 'vitest';
import {
  DSymbol,
  validate,
  components,
  tileOrbits,
  vertexOrbits,
  edgeOrbits,
  kUniformity,
  cycleLengthIJ,
  isEuclidean,
  perComponentFlat,
  minimalImage,
  compareInts,
} from '@/classes/algorithm/delaney';

// ---- ground-truth symbols (ground_truth.py, 0-indexed) --------------------
const HEX = new DSymbol([0], [0], [0], [6], [3]); // {6,3}
const SQUARE = new DSymbol([0], [0], [0], [4], [4]); // {4,4}
const TRIANGULAR = new DSymbol([0], [0], [0], [3], [6]); // {3,6}
// 4.8.8 truncated square (Archimedean, 1-uniform), size 3
const TRUNC488 = new DSymbol([0, 1, 2], [0, 2, 1], [1, 0, 2], [4, 8, 8], [3, 3, 3]);
// hexagon-square HYPERBOLIC contrast, K = -1/12
const HYPERBOLIC = new DSymbol([0, 1], [0, 1], [1, 0], [4, 6], [4, 4]);

// non-minimal (sub-symmetry) encodings that fold back under minimal image.
// Doubled-hex breaks the s0 mirror (m01=6 even ⇒ r01=2 divides); breaking s2 instead
// would make m12=3 violate DS4 (r12=2), i.e. an invalid symbol.
const DOUBLED_HEX = new DSymbol([1, 0], [0, 1], [0, 1], [6, 6], [3, 3]);
const DOUBLED_SQUARE = new DSymbol([0, 1], [0, 1], [1, 0], [4, 4], [4, 4]); // "2-chamber rectangle"

describe('M0: validate (DS0–DS4)', () => {
  it('accepts the ground-truth symbols with correct read-offs', () => {
    expect(validate(HEX).ok).toBe(true);
    expect(validate(TRUNC488).ok).toBe(true);
    expect(validate(HYPERBOLIC).ok).toBe(true);

    expect(kUniformity(HEX)).toBe(1);
    expect(tileOrbits(TRUNC488).length).toBe(2);
    expect(vertexOrbits(TRUNC488).length).toBe(1);
    expect(edgeOrbits(TRUNC488).length).toBe(2);
    expect(kUniformity(TRUNC488)).toBe(1);
  });

  it('classifies Euclidean vs hyperbolic via curvature, with per-component flatness stricter', () => {
    expect(isEuclidean(HEX)).toBe(true);
    expect(perComponentFlat(HEX)).toBe(true);
    expect(isEuclidean(TRUNC488)).toBe(true);
    expect(perComponentFlat(TRUNC488)).toBe(true);
    expect(isEuclidean(HYPERBOLIC)).toBe(false); // K = -1/12
    expect(perComponentFlat(HYPERBOLIC)).toBe(false);
  });

  it('rejects a non-involution (DS1)', () => {
    const bad = new DSymbol([1, 1], [0, 1], [0, 1], [4, 4], [4, 4]); // s0[s0[0]]=s0[1]=1≠0
    const r = validate(bad);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/DS1/);
  });

  it('rejects non-commuting s0,s2 (DS2)', () => {
    const bad = new DSymbol([1, 0, 2], [0, 1, 2], [2, 1, 0], [4, 4, 4], [4, 4, 4]);
    const r = validate(bad);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/DS2/);
  });

  it('rejects a disconnected symbol (DS0)', () => {
    const bad = new DSymbol([0, 1], [0, 1], [0, 1], [4, 4], [4, 4]); // 0 and 1 never linked
    const r = validate(bad);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/DS0/);
  });

  it('rejects m not a multiple of the cycle length (DS4)', () => {
    // r01 = 2 (s0 swaps, s1 fixed), m01 = 3 → 3 % 2 ≠ 0
    const bad = new DSymbol([1, 0], [0, 1], [0, 1], [3, 3], [4, 4]);
    expect(cycleLengthIJ(bad, 0, 1, 0)).toBe(2);
    const r = validate(bad);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/DS4/);
  });
});

describe('M0: canonical form (DF Alg. 8, plain — chirality auto-merges)', () => {
  it('is idempotent: canon(from(canon(x))) === canon(x)', () => {
    for (const sym of [HEX, SQUARE, TRIANGULAR, TRUNC488, HYPERBOLIC]) {
      const c1 = sym.canonicalForm();
      const c2 = DSymbol.fromSerialization(c1).canonicalForm();
      expect(c2).toEqual(c1);
    }
  });

  it('is invariant under every chamber relabeling (covers the mirror = isomorphic-relabel case)', () => {
    // exhaustive over all permutations for the small multi-chamber symbols
    const perms3 = [
      [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
    ];
    const base = TRUNC488.canonicalForm();
    for (const p of perms3) {
      const r = TRUNC488.relabel(p);
      expect(validate(r).ok).toBe(true);
      expect(r.canonicalForm()).toEqual(base);
    }
    const baseH = HYPERBOLIC.canonicalForm();
    for (const p of [[0, 1], [1, 0]]) {
      expect(HYPERBOLIC.relabel(p).canonicalForm()).toEqual(baseH);
    }
  });

  it('gives the three regular tilings pairwise-distinct canonical keys', () => {
    const keys = new Set([HEX, SQUARE, TRIANGULAR].map((s) => s.canonicalKey()));
    expect(keys.size).toBe(3);
  });

  it('compares serialization fields numerically, not digit-lexicographically (the "10 < 2" hazard)', () => {
    expect(compareInts([10, 0], [2, 0])).toBeGreaterThan(0);
    expect(compareInts([2, 0], [10, 0])).toBeLessThan(0);
    expect(compareInts([1, 2, 3], [1, 2, 3])).toBe(0);
    expect(compareInts([1, 2], [1, 2, 0])).toBeLessThan(0); // shorter prefix is smaller
  });

  it('distinguishes the size-1 square from the 2-chamber rectangle encoding', () => {
    expect(SQUARE.canonicalKey()).not.toBe(DOUBLED_SQUARE.canonicalKey());
  });
});

describe('M0: minimal image (DF Alg. 10 — the genuine-k collapse)', () => {
  it('leaves an already-minimal symbol unchanged', () => {
    expect(minimalImage(HEX).n).toBe(1);
    expect(minimalImage(TRUNC488).n).toBe(3);
    expect(validate(minimalImage(TRUNC488)).ok).toBe(true);
  });

  it('folds the doubled-hex back to size 1', () => {
    expect(validate(DOUBLED_HEX).ok).toBe(true);
    expect(minimalImage(DOUBLED_HEX).n).toBe(1);
  });

  it('reduces the rectangle-with-restored-diagonal (doubled-square) to the square, genuine k=1', () => {
    const mi = minimalImage(DOUBLED_SQUARE);
    expect(mi.n).toBeLessThan(DOUBLED_SQUARE.n);
    expect(mi.canonicalKey()).toBe(SQUARE.canonicalKey());
    expect(kUniformity(mi)).toBe(1);
  });
});
