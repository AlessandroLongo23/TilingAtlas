# k=2 cluster verification — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the 24-family two-parameter k=2 cluster homology defensible — sound cell identity
(multi-sample edge fingerprint + measured margins) plus explicit H₁/H₂ generator extraction and
per-H₂-generator surface classification (sphere vs torus).

**Architecture:** Extends the committed k=2 framework in `scripts/moduli-graph/`. Edge identity moves from
a single midpoint tiling to a K-sample fingerprint. New pure modules compute margins, exact rational
homology-generator bases, and surface classification. An orchestrator emits a `VerificationReport`; a CLI
runs it over the cluster. Spec: `docs/superpowers/specs/2026-07-18-k2-verification-design.md`.

**Tech Stack:** TypeScript, Vitest, `tsx`. Reuses committed `chainComplex`, `nodeCanonicalKey`,
`twoCellExtractor`, `complexAssembler`, `types`.

**Committed interfaces this builds on (verified):**
- `nodeCanonicalKey(t: FloatTiling): { key: string; handed: boolean; blind: string }`.
- `twoCellExtractor`: `BoundaryEdge { from: NodeState; to: NodeState; mid: FloatTiling }`,
  `TwoCell { corners; boundary: BoundaryEdge[]; productOK }`, `extractTwoCell(pc)`.
- `complexAssembler.assembleComplex(families)`; edge key today is `pair||nodeCanonicalKey(mid).key`.
- `chainComplex`: `FaceEdge{edge,sign}`, `CellComplex{nodes,edges,faces}`, `homology(cx)`.
- Measured: cluster is `V=44 E=79 F=24`, genuine `b=[12,11,6]`, degenerate faces `k2-82,k2-83`.

---

## File structure

- Create `scripts/moduli-graph/edgeFingerprint.ts` — K-sample direction-normalised arc fingerprint.
- Modify `scripts/moduli-graph/twoCellExtractor.ts` — `BoundaryEdge.mid` → `BoundaryEdge.samples: FloatTiling[]`.
- Modify `scripts/moduli-graph/complexAssembler.ts` — edge key uses `edgeFingerprint`.
- Modify `scripts/moduli-graph/nodeCanonicalKey.ts` — export `canonicalCoords(t): number[]` (numeric aligned coords for margins).
- Create `scripts/moduli-graph/margins.ts` — node & edge separation / near-collision report.
- Create `scripts/moduli-graph/exactLinAlg.ts` — exact rational null space & rank (BigInt), for generators.
- Create `scripts/moduli-graph/homologyGenerators.ts` — explicit H₁/H₂ generator bases as cell-index sets.
- Create `scripts/moduli-graph/surfaceClassify.ts` — (χ', orientability) → surface name for a face-set.
- Create `scripts/moduli-graph/verifyComplex.ts` — orchestrate → `VerificationReport`.
- Extend `scripts/moduli-graph/types.ts` — `VerificationReport`.
- Create `scripts/moduli-graph/buildVerifiedComplex.ts` — CLI.
- Tests: `edge-fingerprint.test.ts`, `exact-linalg.test.ts`, `homology-generators.test.ts`,
  `surface-classify.test.ts`, `verify-complex.test.ts`.

---

## Task 1: Multi-sample edge fingerprint (Component 1)

Replace the single midpoint with K interior samples and a direction-normalised fingerprint.

**Files:** Create `edgeFingerprint.ts`; modify `twoCellExtractor.ts`, `complexAssembler.ts`; test
`tests/moduli-graph/edge-fingerprint.test.ts`.

- [ ] **Step 1: Write the failing test** `tests/moduli-graph/edge-fingerprint.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { edgeFingerprint } from '../../scripts/moduli-graph/edgeFingerprint';
import type { FloatTiling } from '../../scripts/moduli-graph/types';

// distinct single-square tilings scaled differently so their canonical keys differ
const sq = (s: number): FloatTiling => ({ polys: [{ n: 4, verts: [[0, 0], [s, 0], [s, s], [0, s]] }], basis: [[s, 0], [0, s]] });
const tri = (): FloatTiling => ({ polys: [{ n: 3, verts: [[0, 0], [1, 0], [0.5, Math.sqrt(3) / 2]] }], basis: [[1, 0], [0.5, Math.sqrt(3) / 2]] });

describe('edgeFingerprint', () => {
  it('is direction-normalised: same arc from either end gives the same fingerprint', () => {
    const samples = [sq(1), tri(), sq(2)];
    const fwd = edgeFingerprint(samples, 'A', 'B');       // from A(<B) to B
    const rev = edgeFingerprint(samples.slice().reverse(), 'B', 'A'); // reverse traversal, endpoints swapped
    expect(fwd).toBe(rev);
  });
  it('two arcs sharing endpoints and one congruent midpoint but differing elsewhere get different keys', () => {
    // single-midpoint identity would merge these; multi-sample separates them.
    const arcX = [sq(1), tri(), sq(3)];
    const arcY = [sq(2), tri(), sq(3)];       // same middle (tri) and same last, different first
    expect(edgeFingerprint(arcX, 'A', 'B')).not.toBe(edgeFingerprint(arcY, 'A', 'B'));
  });
  it('identical sample sequences with identical endpoints match (a real shared arc glues)', () => {
    const s = [sq(1), tri(), sq(2)];
    expect(edgeFingerprint(s, 'A', 'B')).toBe(edgeFingerprint([sq(1), tri(), sq(2)], 'A', 'B'));
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`edgeFingerprint` not found).
Run: `pnpm vitest run tests/moduli-graph/edge-fingerprint.test.ts`

- [ ] **Step 3: Implement** `scripts/moduli-graph/edgeFingerprint.ts`

```ts
import { nodeCanonicalKey } from './nodeCanonicalKey';
import type { FloatTiling } from './types';

/** Direction-normalised fingerprint of a 1-cell from K interior sample tilings taken in from→to order.
 *  Orient by the endpoint keys (smaller endpoint first) so an arc and its reverse traversal — the two
 *  faces sharing it — produce the same string. Each sample is a full canonical tiling key, so two
 *  genuinely different arcs agreeing at ALL K samples is astronomically unlikely (kills false-merge). */
export function edgeFingerprint(samples: FloatTiling[], fromKey: string, toKey: string): string {
  const keys = samples.map((t) => nodeCanonicalKey(t).key);
  const oriented = fromKey <= toKey ? keys : keys.slice().reverse();
  return oriented.join('>');
}
```

- [ ] **Step 4: Modify `twoCellExtractor.ts`** — carry K samples instead of one midpoint.

Replace the `BoundaryEdge` interface and `sideEdges`/`reverseSide`:

```ts
export const EDGE_SAMPLES = 5; // K interior samples per 1-cell

/** One boundary 1-cell: endpoints plus K tilings sampled evenly along the side (its multi-sample identity;
 *  see edgeFingerprint). Two segments are the same 1-cell iff endpoints and the K-sample sequence match. */
export interface BoundaryEdge { from: NodeState; to: NodeState; samples: FloatTiling[]; }
export interface TwoCell { corners: NodeState[]; boundary: BoundaryEdge[]; productOK: boolean; }

function sideEdges(evalAt: (a: number) => FloatTiling, nodes: NodeState[]): BoundaryEdge[] {
  const es: BoundaryEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i], b = nodes[i + 1];
    const samples = Array.from({ length: EDGE_SAMPLES }, (_, k) =>
      cleaned(evalAt(a.alpha + ((b.alpha - a.alpha) * (k + 1)) / (EDGE_SAMPLES + 1))));
    es.push({ from: a, to: b, samples });
  }
  return es;
}
const reverseSide = (es: BoundaryEdge[]): BoundaryEdge[] =>
  es.slice().reverse().map((e) => ({ from: e.to, to: e.from, samples: e.samples.slice().reverse() }));
```

(Leave `sweepNodes`, `extractTwoCell`, and the product-square check unchanged.)

- [ ] **Step 5: Modify `complexAssembler.ts`** — key edges by the fingerprint.

At the top, add the import:
```ts
import { edgeFingerprint } from './edgeFingerprint';
```
Replace the edge-key line inside `edgeId`:
```ts
    const key = `${pair}||${edgeFingerprint(be.samples, fromKey, toKey)}`; // endpoints + multi-sample identity
```

- [ ] **Step 6: Run the edge test + full suite.**

Run: `pnpm vitest run tests/moduli-graph/edge-fingerprint.test.ts` → PASS (3).
Run: `pnpm vitest run tests/moduli-graph/` → all pass. If `complex-assembler.test.ts` betti expectations
shift, that is a CAUGHT false-merge, not a failure — update the expected numbers AND log the change in the
commit body (old→new betti, which edges split). If nothing shifts, the single-midpoint key was already
sound on this data (also a valid, worth-recording result).

- [ ] **Step 7: Commit**
```bash
git add scripts/moduli-graph/edgeFingerprint.ts scripts/moduli-graph/twoCellExtractor.ts scripts/moduli-graph/complexAssembler.ts tests/moduli-graph/edge-fingerprint.test.ts
git commit --only scripts/moduli-graph/edgeFingerprint.ts scripts/moduli-graph/twoCellExtractor.ts scripts/moduli-graph/complexAssembler.ts tests/moduli-graph/edge-fingerprint.test.ts -m "feat(moduli-graph): multi-sample edge fingerprint (kill false-merge)"
```

---

## Task 2: Exact rational linear algebra (Component 3 foundation)

Exact null space and rank over ℚ via BigInt (matrices are tiny, ≤79×79, entries ±1). Foundation for
generator extraction. Self-contained.

**Files:** Create `exactLinAlg.ts`; test `tests/moduli-graph/exact-linalg.test.ts`.

- [ ] **Step 1: Write the failing test** `tests/moduli-graph/exact-linalg.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { nullSpace, matRank } from '../../scripts/moduli-graph/exactLinAlg';

describe('exact rational linear algebra', () => {
  it('rank of a rank-2 matrix', () => {
    expect(matRank([[1, 0, 1], [0, 1, 1], [1, 1, 2]])).toBe(2); // row3 = row1+row2
  });
  it('null space of [[1,1,0],[0,0,1]] is spanned by (1,-1,0)', () => {
    const ns = nullSpace([[1, 1, 0], [0, 0, 1]], 3);
    expect(ns.length).toBe(1);
    // vector proportional to (1,-1,0): second = -first, third = 0
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
```

- [ ] **Step 2: Run — expect FAIL.**
Run: `pnpm vitest run tests/moduli-graph/exact-linalg.test.ts`

- [ ] **Step 3: Implement** `scripts/moduli-graph/exactLinAlg.ts`

```ts
// Exact rational linear algebra over ℚ with BigInt fractions. Matrices here are tiny (≤ ~80²) with ±1
// entries, so plain Gauss-Jordan with normalised BigInt fractions is exact and fast. Used to extract
// homology-generator bases; ranks for Betti numbers stay with chainComplex's modular method.

type Frac = { n: bigint; d: bigint }; // invariant: d > 0, gcd(|n|,d)=1
const gcd = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a; };
const mk = (n: bigint, d: bigint): Frac => {
  if (d === 0n) throw new Error('zero denominator');
  if (d < 0n) { n = -n; d = -d; }
  if (n === 0n) return { n: 0n, d: 1n };
  const g = gcd(n, d); return { n: n / g, d: d / g };
};
const add = (a: Frac, b: Frac) => mk(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Frac, b: Frac) => mk(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Frac, b: Frac) => mk(a.n * b.n, a.d * b.d);
const div = (a: Frac, b: Frac) => mk(a.n * b.d, a.d * b.n);
const isZero = (a: Frac) => a.n === 0n;
const F = (x: number): Frac => mk(BigInt(x), 1n);

/** Reduced row echelon form (in place on a copy); returns { R, pivotCols }. */
function rref(rows: number[][], cols: number): { R: Frac[][]; pivots: number[] } {
  const R = rows.map((r) => r.map(F));
  const pivots: number[] = [];
  let row = 0;
  for (let col = 0; col < cols && row < R.length; col++) {
    let piv = -1;
    for (let r = row; r < R.length; r++) if (!isZero(R[r][col])) { piv = r; break; }
    if (piv === -1) continue;
    [R[row], R[piv]] = [R[piv], R[row]];
    const inv = R[row][col];
    R[row] = R[row].map((x) => div(x, inv));
    for (let r = 0; r < R.length; r++) {
      if (r === row || isZero(R[r][col])) continue;
      const f = R[r][col];
      R[r] = R[r].map((x, c) => sub(x, mul(f, R[row][c])));
    }
    pivots.push(col);
    row++;
  }
  return { R, pivots };
}

export function matRank(rows: number[][]): number {
  if (rows.length === 0) return 0;
  return rref(rows, rows[0].length).pivots.length;
}

/** Basis of the null space { x : M x = 0 } as integer vectors (each length `cols`). One vector per free
 *  column: set that free var to 1, back-solve the pivots, then clear denominators. */
export function nullSpace(rows: number[][], cols: number): number[][] {
  const src = rows.length ? rows : [new Array(cols).fill(0)];
  const { R, pivots } = rref(src, cols);
  const pivotSet = new Set(pivots);
  const pivotRowOf = new Map<number, number>();
  pivots.forEach((c, i) => pivotRowOf.set(c, i));
  const basis: number[][] = [];
  for (let free = 0; free < cols; free++) {
    if (pivotSet.has(free)) continue;
    const x: Frac[] = new Array(cols).fill(0).map(() => F(0));
    x[free] = F(1);
    for (const pc of pivots) {
      // pivot row: x[pc] + Σ_{free f} R[row][f]*x[f] = 0  ⇒  x[pc] = -R[row][free]
      x[pc] = sub(F(0), R[pivotRowOf.get(pc)!][free]);
    }
    // clear denominators to integers
    let lcm = 1n;
    for (const f of x) lcm = (lcm / gcd(lcm, f.d)) * f.d;
    basis.push(x.map((f) => Number((f.n * lcm) / f.d)));
  }
  return basis;
}
```

- [ ] **Step 4: Run — expect PASS (4).** `pnpm vitest run tests/moduli-graph/exact-linalg.test.ts`

- [ ] **Step 5: Commit**
```bash
git add scripts/moduli-graph/exactLinAlg.ts tests/moduli-graph/exact-linalg.test.ts
git commit --only scripts/moduli-graph/exactLinAlg.ts tests/moduli-graph/exact-linalg.test.ts -m "feat(moduli-graph): exact rational null space + rank (BigInt) for generators"
```

---

## Task 3: Homology generator extraction (Component 3)

Explicit H₂ (ker ∂₂) and H₁ (ker ∂₁ / im ∂₂) generator bases as signed cell-index sets.

**Files:** Create `homologyGenerators.ts`; test `tests/moduli-graph/homology-generators.test.ts`.

- [ ] **Step 1: Write the failing test** `tests/moduli-graph/homology-generators.test.ts`

```ts
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
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `scripts/moduli-graph/homologyGenerators.ts`

```ts
import type { CellComplex } from './chainComplex';
import { nullSpace, matRank } from './exactLinAlg';

export interface H2Gen { faces: number[]; coeffs: number[]; } // signed face combination in ker ∂2
export interface H1Gen { edges: number[]; coeffs: number[]; } // signed edge loop, representative of ker∂1/im∂2
export interface Generators { h2: H2Gen[]; h1: H1Gen[]; }

/** ∂1 as V×E, ∂2 as E×F (same convention as chainComplex.homology). */
function boundaryMatrices(cx: CellComplex): { d1: number[][]; d2: number[][] } {
  const V = cx.nodes.length, E = cx.edges.length, F = cx.faces.length;
  const d1 = Array.from({ length: V }, () => new Array(E).fill(0));
  cx.edges.forEach(([from, to], e) => { d1[from][e] -= 1; d1[to][e] += 1; });
  const d2 = Array.from({ length: E }, () => new Array(F).fill(0));
  cx.faces.forEach((face, f) => { for (const { edge, sign } of face) d2[edge][f] += sign; });
  return { d1, d2 };
}

const support = (v: number[]): number[] => v.map((x, i) => [x, i]).filter(([x]) => x !== 0).map(([, i]) => i);

export function homologyGenerators(cx: CellComplex): Generators {
  const E = cx.edges.length, F = cx.faces.length;
  const { d1, d2 } = boundaryMatrices(cx);

  // H2 = ker ∂2 (no ∂3). Each null vector is a face-combination that is a 2-cycle.
  const h2vecs = F === 0 ? [] : nullSpace(d2, F);
  const h2 = h2vecs.map((v) => ({ faces: support(v), coeffs: v }));

  // H1 = ker ∂1 / im ∂2. Take ker∂1 basis (edge-space), then keep those independent modulo the columns
  // of ∂2 (im ∂2). Independence test by rank increase.
  const kerD1 = E === 0 ? [] : nullSpace(d1, E);
  const imCols: number[][] = [];             // rows = edge-space vectors already in the span (im∂2 first)
  for (let f = 0; f < F; f++) imCols.push(cx.edges.map((_, e) => d2[e][f]));
  const spanRows = imCols.filter((c) => c.some((x) => x !== 0));
  const baseRank = spanRows.length ? matRank(spanRows) : 0;
  const h1: H1Gen[] = [];
  for (const v of kerD1) {
    const test = [...spanRows, ...h1.map((g) => g.coeffs), v];
    if (matRank(test) > baseRank + h1.length) h1.push({ edges: support(v), coeffs: v });
  }
  return { h2, h1 };
}
```

- [ ] **Step 4: Run — expect PASS (2).** If the torus H1 count is off, verify the fixture's ∂1∂2=0
(it must: each face boundary `a b a⁻¹ b⁻¹` nets zero at v). Do NOT weaken the assertions to pass.

- [ ] **Step 5: Commit**
```bash
git add scripts/moduli-graph/homologyGenerators.ts tests/moduli-graph/homology-generators.test.ts
git commit --only scripts/moduli-graph/homologyGenerators.ts tests/moduli-graph/homology-generators.test.ts -m "feat(moduli-graph): explicit H1/H2 generator bases"
```

---

## Task 4: Surface classification (Component 4)

Classify the closed surface a set of faces forms, from χ' and orientability of its sub-2-complex.

**Files:** Create `surfaceClassify.ts`; test `tests/moduli-graph/surface-classify.test.ts`.

- [ ] **Step 1: Write the failing test** `tests/moduli-graph/surface-classify.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { classifySurface } from '../../scripts/moduli-graph/surfaceClassify';
import type { CellComplex } from '../../scripts/moduli-graph/chainComplex';

// Sub-complex helpers reuse the CellComplex shape; classifySurface takes the complex + the face indices
// forming the 2-cycle.
const torus: CellComplex = {
  nodes: ['v'], edges: [[0, 0], [0, 0]],
  faces: [[{ edge: 0, sign: 1 }, { edge: 1, sign: 1 }, { edge: 0, sign: -1 }, { edge: 1, sign: -1 }]],
};
// one face, boundary a b a^-1 b^-1 over a single vertex, 2 edges → V'=1 E'=2 F'=1 → χ'=0 → torus.

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
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `scripts/moduli-graph/surfaceClassify.ts`

```ts
import type { CellComplex, FaceEdge } from './chainComplex';

export interface Surface {
  closed: boolean;                 // every edge used by the face-set is covered an even # of times (cancels)
  orientable: boolean;
  chi: number;                     // χ' = V' − E' + F' of the sub-complex
  name: string;                    // 'sphere' | 'torus' | 'genus-g' | 'RP2' | 'Klein' | 'open'
}

/** Classify the surface formed by a set of faces (a 2-cycle) within `cx`. Closed iff each incident edge's
 *  signed multiplicity over the face-set is zero (∂2 of the combination vanishes on every edge). χ' from
 *  the sub-complex of used nodes/edges/faces. Orientable iff a consistent ±1 face-orientation cancels
 *  every edge (i.e. the face-set is an integer 2-cycle — which, for a ker∂2 basis vector, it is). */
export function classifySurface(cx: CellComplex, faceIdx: number[]): Surface {
  const usedFaces = faceIdx.map((i) => cx.faces[i]);
  const edgeNet = new Map<number, number>();   // edge -> signed multiplicity (orientation test)
  const edgeUses = new Map<number, number>();  // edge -> count regardless of sign (incidence)
  for (const face of usedFaces) for (const { edge, sign } of face) {
    edgeNet.set(edge, (edgeNet.get(edge) ?? 0) + sign);
    edgeUses.set(edge, (edgeUses.get(edge) ?? 0) + 1);
  }
  const closed = [...edgeNet.values()].every((v) => v === 0) && [...edgeUses.values()].every((c) => c % 2 === 0);
  const orientable = [...edgeNet.values()].every((v) => v === 0); // signed cancellation ⇒ orientable

  const Ep = new Set<number>(edgeUses.keys());
  const Vp = new Set<number>();
  for (const e of Ep) { const [a, b] = cx.edges[e]; Vp.add(a); Vp.add(b); }
  const chi = Vp.size - Ep.size + usedFaces.length;

  let name = 'open';
  if (closed) {
    if (orientable) {
      // Closed orientable manifolds have EVEN χ' ≤ 2. An odd or >2 χ' is a non-manifold pinch (the
      // self-fold signature: a single face whose boundary collapses) — flag it, don't invent a genus.
      name = chi > 2 || chi % 2 !== 0 ? 'degenerate' : chi === 2 ? 'sphere' : chi === 0 ? 'torus' : `genus-${(2 - chi) / 2}`;
    } else {
      name = chi === 1 ? 'RP2' : chi === 0 ? 'Klein' : chi < 1 ? `non-orientable-genus-${1 - chi}` : 'degenerate';
    }
  }
  return { closed, orientable, chi, name };
}
```

Note: a single face `a a⁻¹` over one vertex gives V'=1, E'=1, F'=1 → χ'=1 (odd, orientable) → `degenerate`
— exactly the pinched-fold signature (this is what k2-82/83 should produce). A GENUINE sphere needs a
proper cell structure, e.g. two bigons sharing both edges → V'=2, E'=2, F'=2 → χ'=2 → `sphere`. Pick
fixtures whose χ' is unambiguous; the classifier's (χ', orientability)→name mapping is the invariant.

- [ ] **Step 4: Run — expect PASS (3).** Fix fixtures (not the classifier) if a χ' value differs from the
comment above; the classifier maps (χ', orientable) → name and that mapping is the invariant under test.

- [ ] **Step 5: Commit**
```bash
git add scripts/moduli-graph/surfaceClassify.ts tests/moduli-graph/surface-classify.test.ts
git commit --only scripts/moduli-graph/surfaceClassify.ts tests/moduli-graph/surface-classify.test.ts -m "feat(moduli-graph): surface classification (χ' + orientability)"
```

---

## Task 5: Margins + orchestrator + report (Component 2 + assembly)

**Files:** modify `nodeCanonicalKey.ts` (export `canonicalCoords`); create `margins.ts`, `verifyComplex.ts`;
extend `types.ts`; test `tests/moduli-graph/verify-complex.test.ts`.

- [ ] **Step 1: Add `canonicalCoords` to `nodeCanonicalKey.ts`** (numeric aligned coords for margins).

Append:
```ts
/** The numeric aligned+sorted coordinate vector behind directKey's best alignment (pre-quantisation) —
 *  a comparable feature vector for the separation-margin report. Empty for the ⊥ tiling. */
export function canonicalCoords(t: FloatTiling): number[] {
  const tiles = effTiles(t);
  const pts: [number, number][] = [];
  for (const v of tiles) for (const p of v) pts.push([p[0], p[1]]);
  if (pts.length === 0) return [];
  let s = Infinity;
  for (const v of tiles) for (let i = 0; i < v.length; i++) {
    const q = v[(i + 1) % v.length]; s = Math.min(s, Math.hypot(v[i][0] - q[0], v[i][1] - q[1]));
  }
  if (!Number.isFinite(s) || s <= 0) s = 1;
  const gx = pts.reduce((a, p) => a + p[0], 0) / pts.length, gy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const centered = pts.map(([x, y]): [number, number] => [(x - gx) / s, (y - gy) / s]);
  let best: number[] | null = null, bestKey: string | null = null;
  for (const a of centered) {
    const r = Math.hypot(a[0], a[1]); if (r < EPS) continue;
    const th = Math.atan2(a[1], a[0]), c = Math.cos(-th), sn = Math.sin(-th);
    const rot = centered.map(([x, y]): [number, number] => [x * c - y * sn, x * sn + y * c]);
    rot.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const flat = rot.flat();
    const key = flat.map((x) => Math.round(x * Q)).join(',');
    if (bestKey === null || key < bestKey) { bestKey = key; best = flat; }
  }
  return best ?? [];
}
```

- [ ] **Step 2: Extend `types.ts`** — append:
```ts
export interface VerificationReport {
  nodeMargin: number;   // min L∞ distance between distinct-key nodes' canonicalCoords (∞ if none comparable)
  edgeMargin: number;   // min # of differing samples between distinct edges sharing an endpoint pair (∞ if none)
  nearCollisions: string[];               // human notes on any margin within a few ε / a single sample
  h2: { faces: string[]; surface: string; chi: number }[];  // families per generator + classified surface
  h1: { edges: number; nodeLoop: string[] }[];              // size + the node loop it traces
  chi: number; betti: [number, number, number];
}
```

- [ ] **Step 3: Write the failing test** `tests/moduli-graph/verify-complex.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { verifyComplex } from '../../scripts/moduli-graph/verifyComplex';

const atlas = JSON.parse(readFileSync('public/reference-atlas-isotoxal.json', 'utf8'));
const recs = (Array.isArray(atlas) ? atlas : atlas.records) as any[];
const cluster = recs.filter((r) => r.k === 2 && r.source === 'isotoxal' && r.paramCell?.params?.length === 2);

describe('verifyComplex on the 24-family cluster', () => {
  const r = verifyComplex(cluster);
  it('reports betti and a positive separation margin', () => {
    expect(r.betti.length).toBe(3);
    expect(r.nodeMargin).toBeGreaterThan(0);           // distinct nodes are geometrically separated
  });
  it('extracts one classified surface per H2 generator', () => {
    expect(r.h2.length).toBe(r.betti[2]);              // one entry per b2 generator
    for (const g of r.h2) expect(typeof g.surface).toBe('string');
  });
  it('extracts one node-loop per H1 generator', () => {
    expect(r.h1.length).toBe(r.betti[1]);
  });
});
```

- [ ] **Step 4: Run — expect FAIL.**

- [ ] **Step 5: Implement** `scripts/moduli-graph/margins.ts`

```ts
import { canonicalCoords } from './nodeCanonicalKey';
import type { ModuliComplex } from './types';

/** Min L∞ distance between distinct nodes' canonicalCoords (only comparable when same length). Infinity if
 *  no two distinct nodes share a coord length (all trivially distinct). */
export function nodeMargin(nodes: { key: string; coords: number[] }[]): number {
  let m = Infinity;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    if (nodes[i].key === nodes[j].key) continue;
    const a = nodes[i].coords, b = nodes[j].coords;
    if (a.length === 0 || a.length !== b.length) continue;
    let d = 0; for (let k = 0; k < a.length; k++) d = Math.max(d, Math.abs(a[k] - b[k]));
    m = Math.min(m, d);
  }
  return m;
}
export { canonicalCoords };
```

- [ ] **Step 6: Implement** `scripts/moduli-graph/verifyComplex.ts`

```ts
import type { ParametricCellData } from '@/lib/utils/paramCell';
import { buildCellComplex } from './complexAssembler';
import { homologyGenerators } from './homologyGenerators';
import { classifySurface } from './surfaceClassify';
import { nodeMargin } from './margins';
import type { VerificationReport } from './types';

interface FamilyRecord { id: string; paramCell?: ParametricCellData }

export function verifyComplex(families: FamilyRecord[]): VerificationReport {
  const { complex, cx, faceFamily } = buildCellComplex(families);
  const gens = homologyGenerators(cx);
  const nMargin = nodeMargin(complex.nodeCoords);

  const h2 = gens.h2.map((g) => {
    const s = classifySurface(cx, g.faces);
    const fams = [...new Set(g.faces.map((fi) => faceFamily[fi]))];
    return { faces: fams, surface: s.name, chi: s.chi };
  });
  const h1 = gens.h1.map((g) => ({
    edges: g.edges.length,
    nodeLoop: [...new Set(g.edges.flatMap((e) => [cx.nodes[cx.edges[e][0]], cx.nodes[cx.edges[e][1]]]))],
  }));

  return {
    nodeMargin: nMargin,
    edgeMargin: complex.edgeMargin,
    nearCollisions: complex.nearCollisions,
    h2, h1,
    chi: complex.chi, betti: complex.betti,
  };
}
```

- [ ] **Step 7: Refactor `complexAssembler.ts`** to expose the raw `CellComplex`, per-node coords, per-face
family, and the edge margin. Replace the current `assembleComplex` with a `buildCellComplex` core plus a
thin `assembleComplex` wrapper.

Add imports at the top:
```ts
import { canonicalCoords } from './nodeCanonicalKey';
import type { CellComplex } from './chainComplex';
```

Add the return-shape type just above `buildCellComplex`:
```ts
export interface BuiltComplex {
  complex: ModuliComplex & { nodeCoords: { key: string; coords: number[] }[]; edgeMargin: number; nearCollisions: string[] };
  cx: CellComplex;
  faceFamily: string[];
}
```

Rename `export function assembleComplex(families)` to `export function buildCellComplex(families): BuiltComplex`
and, inside it, make these additions to the EXISTING body (keep node/edge/face building, `hasZeroBoundary`,
`inducedGenuine`, and the two `homology()` calls exactly as they are):

1. In `nodeId`, when a NEW node is created, also record its coords:
```ts
      nodeCoords.push({ key: ck.key, coords: canonicalCoords(s.tiling) });
```
   with `const nodeCoords: { key: string; coords: number[] }[] = [];` declared beside `nodeMeta`.
2. Push the family per face: `const faceFamily: string[] = [];` beside `faceMeta`, and inside the family
   loop after building `fEdges`, `faceFamily.push(fam.id);`.
3. After the loop, compute the edge margin from the fingerprint sample-arrays:
```ts
  // Edge margin: among distinct edges sharing an endpoint pair, the fewest sample positions that differ.
  // A margin of 1 means a single sample distinguishes two edges — a near-collision worth flagging.
  const byPair = new Map<string, string[][]>(); // endpoint pair -> list of sample-key arrays
  for (const key of edgeIndex.keys()) {
    const [pair, fp] = key.split('||');
    const arr = byPair.get(pair) ?? [];
    arr.push(fp.split('>'));
    byPair.set(pair, arr);
  }
  let edgeMargin = Infinity;
  const nearCollisions: string[] = [];
  for (const [pair, arrs] of byPair) {
    for (let i = 0; i < arrs.length; i++) for (let j = i + 1; j < arrs.length; j++) {
      let diff = 0;
      for (let k = 0; k < arrs[i].length; k++) if (arrs[i][k] !== arrs[j][k]) diff++;
      edgeMargin = Math.min(edgeMargin, diff);
      if (diff === 1) nearCollisions.push(`edges at ${pair} differ in a single sample`);
    }
  }
```
4. Build `cx` and return the extended object:
```ts
  const cx: CellComplex = { nodes: nodeMeta.map((n) => n.key), edges, faces };
  return {
    complex: {
      nodes: nodeMeta, edges: edgeMeta, faces: faceMeta,
      chi: genuine.chi, betti: genuine.betti,
      full: { chi: full.chi, betti: full.betti },
      degenerateFaces,
      nodeCoords, edgeMargin, nearCollisions,
    },
    cx,
    faceFamily,
  };
}

/** Thin wrapper: the plain ModuliComplex (drops the verification extras). */
export function assembleComplex(families: FamilyRecord[]): ModuliComplex {
  const { complex } = buildCellComplex(families);
  const { nodeCoords: _n, edgeMargin: _e, nearCollisions: _c, ...m } = complex;
  return m;
}
```

Leave `hasZeroBoundary` and `inducedGenuine` unchanged.

- [ ] **Step 8: Run — expect PASS (3).** `pnpm vitest run tests/moduli-graph/verify-complex.test.ts`

- [ ] **Step 9: Run full suite + build.** `pnpm vitest run tests/moduli-graph/` then `pnpm build`.

- [ ] **Step 10: Commit**
```bash
git add scripts/moduli-graph/nodeCanonicalKey.ts scripts/moduli-graph/margins.ts scripts/moduli-graph/verifyComplex.ts scripts/moduli-graph/complexAssembler.ts scripts/moduli-graph/types.ts tests/moduli-graph/verify-complex.test.ts
git commit --only scripts/moduli-graph/nodeCanonicalKey.ts scripts/moduli-graph/margins.ts scripts/moduli-graph/verifyComplex.ts scripts/moduli-graph/complexAssembler.ts scripts/moduli-graph/types.ts tests/moduli-graph/verify-complex.test.ts -m "feat(moduli-graph): margins + verification report orchestrator"
```

---

## Task 6: CLI + certified run

**Files:** create `buildVerifiedComplex.ts`.

- [ ] **Step 1: Implement** `scripts/moduli-graph/buildVerifiedComplex.ts`

```ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { verifyComplex } from './verifyComplex';

const atlas = JSON.parse(readFileSync('public/reference-atlas-isotoxal.json', 'utf8'));
const recs = (Array.isArray(atlas) ? atlas : atlas.records) as any[];
const cluster = recs.filter((r) => r.k === 2 && r.source === 'isotoxal' && r.paramCell?.params?.length === 2);

const r = verifyComplex(cluster);
mkdirSync('experiments/results', { recursive: true });
writeFileSync('experiments/results/moduli-complex-k2-verified.json', JSON.stringify(r, null, 2));
console.log(`genuine χ=${r.chi} betti=[${r.betti.join(',')}]`);
console.log(`node margin=${r.nodeMargin.toFixed(4)} (ε≈1e-4) | edge margin=${r.edgeMargin} differing samples`);
if (r.nearCollisions.length) console.log(`NEAR-COLLISIONS: ${r.nearCollisions.join('; ')}`);
console.log(`H2 generators (${r.h2.length}):`);
for (const g of r.h2) console.log(`  ${g.surface} (χ'=${g.chi}) from ${g.faces.join(', ')}`);
console.log(`H1 generators: ${r.h1.length}`);
```

- [ ] **Step 2: Run.** `pnpm tsx scripts/moduli-graph/buildVerifiedComplex.ts`
Expected: prints the genuine betti, a node margin ≫ 1e-4, the edge margin, and one classified surface per
H₂ generator (watch specifically whether the k2-82/83-derived generator classifies as `sphere` = pinched
fold or `torus` = genuine). Record the full output in the run log — it is the certified result.

- [ ] **Step 3: Build.** `pnpm build` — clean.

- [ ] **Step 4: Commit**
```bash
git add scripts/moduli-graph/buildVerifiedComplex.ts
git commit --only scripts/moduli-graph/buildVerifiedComplex.ts -m "feat(moduli-graph): CLI — certified k=2 cluster verification report"
```

---

## Notes for the implementer

- **Do NOT `git add -A`.** Six pre-staged theory files (`CLAUDE.md`, `app/(app)/theory/*`,
  `components/markdown-renderer.tsx`, `components/theory-sidebar.tsx`, `lib/utils/tableOfContents.ts`)
  must never enter a commit. Use the explicit `git commit --only <paths>` forms as written and verify with
  `git show --stat --oneline HEAD`.
- **Betti shifts are findings, not failures.** If multi-sample edges (Task 1) change the cluster betti from
  `[12,11,6]`, that is a caught false-merge — update expectations and LOG old→new; never force the old
  number.
- **Fix fixtures, not classifiers.** In Tasks 3–4, if a hand-built fixture's χ' differs from the intended
  surface, correct the fixture (the classifier's (χ', orientability)→name mapping is the invariant).
- **ℚ-b₂ generators are orientable.** classifySurface may report RP2/Klein for constructed inputs, but no
  real H₂ generator here can be non-orientable — if one does, it signals a ∂₂ sign bug, investigate.
- **Margins are measured evidence, not proof.** Report them; flag thin margins; do not claim a proof.
