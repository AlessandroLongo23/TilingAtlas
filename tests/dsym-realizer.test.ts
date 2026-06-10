/**
 * M2 — Lemma R realizer (thesis lem:ddrealizer; TA note delaney-dress-B22-realizability-
 * proof-2026-06-10.md §6 ghost regressions, verbatim):
 *   (a) the E3 size-2 mixed-sign witness must REJECT at the angle gate, NAMING orbit {0}
 *       (3 squares, developed sum 3/2 ≠ 2) — pure rational arithmetic, no development;
 *   (b) no monogonal dead-necklace flat symbol is emitted at k=1 (re-runs E3 §4 inside
 *       the engine: 3.4.4.6 / 3.3.4.12 / 3.3.6.6 / 3.4.3.12 die in the axioms);
 *   (c) k=1: all 11 minimal flat symbols realize, pass the corona certificate
 *       (accept-side soundness independent of B2.2), agree with KUniformityChecker, and
 *       stay distinct under congruence (B2.3+B2.6: minimal symbols ↔ tilings injectively).
 * Plus the ⚑ field-closure rider: the octagon path (4.8.8) develops coordinate-wise in
 * ℚ(ζ₂₄) — covered by (c), which throws FieldClosureError on any out-of-field step.
 */
import { describe, it, expect } from 'vitest';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import {
  DSymbol,
  validate,
  perComponentFlat,
  generateCandidateSymbols,
  kUniformity,
  vertexOrbits,
  angleGate,
  developedFaces,
  realizeSymbol,
  allowedVCNames,
} from '@/classes/algorithm/delaney';
import { PeriodSolver } from '@/classes/algorithm/PeriodSolver';
import { KUniformityChecker } from '@/classes/algorithm/KUniformityChecker';
import { dedupeByCongruence } from '@/classes/algorithm/TilingCongruence';
import { canonicalVCName } from '@/classes/algorithm/StarVC';

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const P = [3, 4, 6, 8, 12];

describe('Lemma R step 1 — the angle gate (ghost regression a)', () => {
  it('rejects the E3 mixed-sign witness, naming orbit {0} with sum 3/2', () => {
    // (2,(1,0),(0,1),(0,1),(4,4),(3,6)): 3 squares at one vertex orbit, 6 at the other.
    // Globally K=0 (topologically Euclidean by DF Thm 5) — flatly unrealizable (rem:ddscope i).
    const ghost = new DSymbol([1, 0], [0, 1], [0, 1], [4, 4], [3, 6]);
    expect(validate(ghost).ok).toBe(true); // axiom-valid: the gate is what kills it
    const g = angleGate(ghost);
    expect(g.flat).toBe(false);
    if (!g.flat) {
      expect(g.component).toEqual([0]); // names the offending component
      expect(g.faces).toEqual([4, 4, 4]); // 3 squares
      expect(`${g.sumNum}/${g.sumDen}`).toBe('3/2'); // 270° ≠ 360°
    }
    // and the other orbit alone would fail with sum 3 (6 squares = 540°)
    const faces1 = developedFaces(ghost, 1);
    expect(faces1).toEqual([4, 4, 4, 4, 4, 4]);
    expect(perComponentFlat(ghost)).toBe(false); // gate ≡ B2.5 on the reject side
  });

  it('accepts the square symbol (developed sum exactly 2)', () => {
    const sq = new DSymbol([0], [0], [0], [4], [4]);
    expect(angleGate(sq)).toEqual({ flat: true });
  });
});

describe('dead necklaces (ghost regression b)', () => {
  it('k=1 emits no flat symbol with a dead-necklace vertex figure', () => {
    const dead = new Set(
      [
        [3, 4, 4, 6],
        [3, 3, 4, 12],
        [3, 3, 6, 6],
        [3, 4, 3, 12],
      ].map((f) => canonicalVCName(f.map(String))),
    );
    const gen = generateCandidateSymbols(1, P, 12);
    expect(gen.completed).toBe(true);
    for (const sym of gen.symbols) {
      for (const orbit of vertexOrbits(sym)) {
        const name = canonicalVCName(developedFaces(sym, orbit[0]).map(String));
        expect(dead.has(name)).toBe(false);
      }
    }
  });
});

describe('Lemma R steps 2–6 — realization (ghost regression c + field rider)', () => {
  it('realizes the square symbol to the unit square tiling (|G₀|=8, 1 tile, δ·|G₀| chambers)', () => {
    const sq = new DSymbol([0], [0], [0], [4], [4]);
    const r = realizeSymbol(sq, ring);
    expect(r.pointGroupOrder).toBe(8); // p4m point group
    expect(r.chamberCount).toBe(8); // δ·|G₀| = 1·8
    expect(r.cell.cellPolygons).toHaveLength(1);
    const solver = new PeriodSolver(1);
    const allowed = allowedVCNames([4], ring.N, canonicalVCName);
    expect(solver.certifyExternalCell(r.cell, allowed, [4])).toBe(true);
    const kk = new KUniformityChecker().countVertexOrbits(
      r.cell.cellPolygons,
      r.cell.basisExact[0],
      r.cell.basisExact[1],
    );
    expect(kk).toBe(1);
  });

  it('k=1 full: all 11 realize+certify (octagon 4.8.8 exercises the ℚ(ζ₂₄) rider), distinct under congruence', () => {
    const gen = generateCandidateSymbols(1, P, 12);
    expect(gen.candidateSymbols).toBe(11);
    const allowed = allowedVCNames(P, ring.N, canonicalVCName);
    const solver = new PeriodSolver(1);
    const checker = new KUniformityChecker();
    const cells = [];
    for (const sym of gen.symbols) {
      expect(angleGate(sym).flat).toBe(true);
      const r = realizeSymbol(sym, ring); // throws FieldClosureError on any out-of-field step
      expect(r.chamberCount).toBe(sym.n * r.pointGroupOrder); // δ·|G₀| invariant
      expect(solver.certifyExternalCell(r.cell, allowed, P)).toBe(true); // lem:corona accepts
      expect(checker.countVertexOrbits(r.cell.cellPolygons, r.cell.basisExact[0], r.cell.basisExact[1])).toBe(
        kUniformity(sym),
      );
      cells.push(r.cell);
    }
    // B2.3+B2.6: distinct minimal symbols ⇒ non-congruent tilings (injectivity of the bijection)
    expect(dedupeByCongruence(cells)).toHaveLength(11);
  }, 120_000);
});
