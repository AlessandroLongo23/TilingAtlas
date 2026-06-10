/**
 * SEED-ANCHORED generator (the dsym-seeded probe) — pinning tests.
 *
 * (a) The FOLDING reader: a {1,2}-orbit's species must be read by UNFOLDING the
 *     m12-step walk x ↦ s2(s1(x)) — never the raw r-length orbit sequence. The
 *     square tiling's minimal symbol (n=1, everything fixed, r12=1, m12=4) is the
 *     heaviest possible fold; a 2-chamber chain quotient exercises the dihedral fold.
 * (b) Anchored k=1: the union of survivors over every pipeline seed species equals
 *     the unanchored 11 — by canonical KEYS, not just count (the falsifier for a
 *     silently-lossy unfold).
 * (c) Flag-off equivalence: anchor undefined ⇒ same 11 canonical keys as ever.
 */
import { describe, it, expect } from 'vitest';
import {
  DSymbol,
  generateCandidateSymbols,
  vertexSpeciesAt,
  dihedralKey,
} from '@/classes/algorithm/delaney';
import { enumerateSeedSpecies } from '../scripts/dsym-seeded-species';

const P = [3, 4, 6, 8, 12];

describe('(a) folding reader: unfolded vertex species', () => {
  it('square minimal symbol (n=1, maximal fold): species is 4.4.4.4, not the raw fold [4]', () => {
    const sq = new DSymbol([0], [0], [0], [4], [4]); // s0=s1=s2=id, m01=4, m12=4, r12=1
    const species = vertexSpeciesAt(sq, 0);
    expect(species).toEqual([4, 4, 4, 4]); // m12=4 steps, NOT the raw 1-long orbit sequence
    expect(dihedralKey(species)).toBe(dihedralKey([4, 4, 4, 4])); // accepted by 4.4.4.4
    expect(dihedralKey(species)).not.toBe(dihedralKey([3, 4, 6, 4])); // rejected by 3.4.6.4
  });

  it('dihedral (chain) fold: 2-chamber quotient of the 4.4.4.4 vertex still unfolds to 4.4.4.4', () => {
    // {1,2}-orbit {0,1}: s1 swaps, s2 fixes both (two mirror chambers ⇒ chain), r12=2, m12=4.
    const sym = new DSymbol([0, 1], [1, 0], [0, 1], [4, 4], [4, 4]);
    expect(vertexSpeciesAt(sym, 0)).toEqual([4, 4, 4, 4]);
    expect(vertexSpeciesAt(sym, 1)).toEqual([4, 4, 4, 4]);
  });

  it('chain orbit with mixed faces: walk reads the true cyclic sequence 3.3.4.4', () => {
    // The dihedral quotient of a 3.3.4.4 vertex (axis through the 3|3 and 4|4 edges):
    // s1: 0↔1, 2↔3; s2 fixes 1 and 3, swaps 0↔2. r12=4=m12 (no cyclic fold, mirror ends).
    const sym = new DSymbol([0, 1, 2, 3], [1, 0, 3, 2], [2, 1, 0, 3], [3, 3, 4, 4], [4, 4, 4, 4]);
    expect(dihedralKey(vertexSpeciesAt(sym, 0))).toBe(dihedralKey([3, 3, 4, 4]));
    expect(dihedralKey(vertexSpeciesAt(sym, 0))).not.toBe(dihedralKey([3, 4, 3, 4]));
  });

  it('dihedralKey merges rotations and reflections (unoriented species identity)', () => {
    expect(dihedralKey([4, 6, 12])).toBe(dihedralKey([4, 12, 6])); // chiral VC pair = one species
    expect(dihedralKey([3, 3, 4, 12])).toBe(dihedralKey([3, 3, 12, 4]));
    expect(dihedralKey([3, 3, 4, 12])).not.toBe(dihedralKey([3, 4, 3, 12]));
  });
});

describe('(b)+(c) anchored k=1 union and flag-off equivalence', () => {
  it(
    'anchored union over all pipeline seed species == unanchored 11, by canonical keys',
    { timeout: 300_000 },
    () => {
      const off = generateCandidateSymbols(1, P, 12);
      expect(off.completed).toBe(true);
      const offKeys = off.symbols.map((s) => s.canonicalKey()).sort();
      expect(offKeys.length).toBe(11); // (c) flag-off path unchanged

      const sp = enumerateSeedSpecies(1, P);
      expect(sp.multisets.length).toBeGreaterThan(0);
      const union = new Set<string>();
      for (const anchor of sp.multisets) {
        const r = generateCandidateSymbols(1, P, 12, { anchor });
        expect(r.completed).toBe(true);
        for (const s of r.symbols) union.add(s.canonicalKey());
      }
      expect([...union].sort()).toEqual(offKeys); // (b) exact same canonical keys
    },
  );

  it('anchor multiset size must equal k (loud, not silent)', () => {
    expect(() => generateCandidateSymbols(2, P, 12, { anchor: [[4, 4, 4, 4]] })).toThrow(/anchor/);
  });

  it('anchored square-only run finds exactly the square tiling', () => {
    const r = generateCandidateSymbols(1, P, 12, { anchor: [[4, 4, 4, 4]] });
    expect(r.completed).toBe(true);
    expect(r.candidateSymbols).toBe(1);
    const sq = new DSymbol([0], [0], [0], [4], [4]);
    expect(r.symbols[0].canonicalKey()).toBe(sq.canonicalKey());
  });
});
