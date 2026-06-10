/**
 * M1 — the sound D-symbol generator. The base D-set enumeration is a faithful port
 * of the PUBLISHED canonical-augmentation order (odf/julia-dsymbols, DSetGenerator);
 * the regular-Euclidean label layer matches the verified oracle k2_minimal_fixed.py.
 *
 * The cross-check numbers below ARE the ground-truth oracle (FINDINGS §3, SHA-checked):
 *   k=1, δ≤12, P={3,4,6,8,12}:  93 candidates → 11 genuine minimal (= A068599(1))
 *   k=2, δ≤12:                 144 candidates → 17 genuine minimal (partial ≤12)
 *   k=2, δ≤24:                  20 genuine minimal (= A068599(2), the full count)
 * A drop here = an unsound prune silently losing an iso-class. The chiral snub-hex
 * (3.3.3.3.6, p6, size 10) is in the k=1 set and is auto-merged by plain canonical
 * form — so k=1 === 11 (not 12) IS the chirality regression.
 */
import { describe, it, expect } from 'vitest';
import { generateCandidateSymbols } from '@/classes/algorithm/delaney';

const P = [3, 4, 6, 8, 12];

describe('M1: sound generator vs the Python ground-truth oracle', () => {
  it('k=1, δ≤12: 93 candidates → 11 genuine minimal (chirality auto-merged)', () => {
    const r = generateCandidateSymbols(1, P, 12);
    expect(r.completed).toBe(true);
    expect(r.candidatesRaw).toBe(93);
    expect(r.candidateSymbols).toBe(11);
  });

  it('k=2, δ≤12: 144 candidates → 17 genuine minimal (partial range)', () => {
    const r = generateCandidateSymbols(2, P, 12);
    expect(r.completed).toBe(true);
    expect(r.candidatesRaw).toBe(144);
    expect(r.candidateSymbols).toBe(17);
  });

  // Beyond the Python oracle's δ≤12 range: the count must keep climbing SOUNDLY toward 20.
  // (The full δ≤24 → 20 run is a ~15-min gate measurement, exercised by scripts/dsym-probe.ts,
  // not a fast unit test.)
  it('k=2, δ≤16: 18 genuine minimal (sound continuation past the oracle range)', () => {
    const r = generateCandidateSymbols(2, P, 16);
    expect(r.completed).toBe(true);
    expect(r.candidateSymbols).toBe(18);
  });

  it('is deterministic: the candidateSymbols count is stable across two runs', () => {
    const a = generateCandidateSymbols(1, P, 12);
    const b = generateCandidateSymbols(1, P, 12);
    expect(a.candidateSymbols).toBe(b.candidateSymbols);
    expect(a.symbols.map((s) => s.canonicalKey()).sort()).toEqual(
      b.symbols.map((s) => s.canonicalKey()).sort(),
    );
  });

  it('monotonicity: candidateSymbols ≤ candidatesRaw ≤ generated', () => {
    const r = generateCandidateSymbols(1, P, 12);
    expect(r.candidateSymbols).toBeLessThanOrEqual(r.candidatesRaw);
    expect(r.candidatesRaw).toBeLessThanOrEqual(r.generated);
  });
});
