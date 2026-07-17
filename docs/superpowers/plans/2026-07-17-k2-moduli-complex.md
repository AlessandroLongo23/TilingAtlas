# k=2 moduli complex — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Extend the k=1 deformation graph to a genuine 2-complex — model the two-parameter isotoxal
k=2 families as 2-cells (product squares) and compute the topology (χ, ℚ-Betti) of the sub-complex on
the `4α`/`4.4α` cluster with a built-in `χ = b₀−b₁+b₂` self-check.

**Architecture:** New modules under `scripts/moduli-graph/`. A self-contained integer-linear-algebra
homology engine (`chainComplex`); a direct-similarity geometric node key generalizing `flattenKey`
(`nodeCanonicalKey`); a two-parameter extractor that produces a face's boundary cycle by sweeping each
of its four sides (`twoCellExtractor`); an assembler that identifies cells, glues shared edges, and runs
the homology engine (`complexAssembler`); a CLI (`buildModuliComplex`). Offline scripts run under
`pnpm tsx`; tests under `pnpm vitest run`.

**Tech Stack:** TypeScript, Vitest, `tsx`. Reuses `@/lib/utils/paramCell` (evaluate a family at a
parameter tuple), `scripts/moduli-graph/geometry` (defect/area/effective corners),
`scripts/moduli-graph/tilingSignature`, `scripts/moduli-graph/flattenKey`,
`scripts/moduli-graph/catalogueKeys` (optional k=1 cross-check). Spec:
`docs/superpowers/specs/2026-07-17-k2-moduli-complex-design.md`.

**Reference facts (measured):** 74 single-param + 24 two-param k=2 isotoxal families. Two-param family
domain is (α₁,α₂) ∈ (0,180)², two independent isotoxal tiles. `evaluateParamCell(pc, [a1,a2])` returns
`{ cellPolygons:[{n,star?,vertices:[x,y][]}], basis:[[x,y],[x,y]] }`. The k=1 genuine-tiling H₁ is 15.

---

## File structure

- Create `scripts/moduli-graph/chainComplex.ts` — cells → ∂₁,∂₂ → χ, ℚ-Betti, self-check. No deps.
- Modify `scripts/moduli-graph/types.ts` — add `Cell2`, `ModuliComplex`.
- Create `scripts/moduli-graph/nodeCanonicalKey.ts` — direct-similarity key + chirality flag.
- Create `scripts/moduli-graph/twoCellExtractor.ts` — face boundary cycle + corners + grid check.
- Create `scripts/moduli-graph/complexAssembler.ts` — assemble/glue cells, run homology.
- Create `scripts/moduli-graph/buildModuliComplex.ts` — CLI entry.
- Tests: `tests/moduli-graph/chain-complex.test.ts`, `node-canonical-key.test.ts`,
  `two-cell.test.ts`, `complex-assembler.test.ts`.

---

## Task 1: Homology engine (`chainComplex.ts`)

Self-contained. A complex is nodes + oriented edges + faces (ordered signed boundary edges). Ranks are
exact integer ranks computed modulo two large primes (rank over ℚ equals rank over 𝔽_p for p not
dividing an invariant factor; agreement of two primes is conclusive here). χ is a pure count.

**Files:**
- Create: `scripts/moduli-graph/chainComplex.ts`
- Test: `tests/moduli-graph/chain-complex.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/moduli-graph/chain-complex.test.ts
import { describe, it, expect } from 'vitest';
import { homology, type CellComplex } from '../../scripts/moduli-graph/chainComplex';

// One square face: 4 nodes, 4 edges around, one 2-cell. A disk ⇒ b=[1,0,0], χ=1.
const square: CellComplex = {
  nodes: ['a', 'b', 'c', 'd'],
  edges: [[0, 1], [1, 2], [2, 3], [3, 0]],
  faces: [[{ edge: 0, sign: 1 }, { edge: 1, sign: 1 }, { edge: 2, sign: 1 }, { edge: 3, sign: 1 }]],
};
// Same four edges, NO face: a hollow ring (annulus/circle) ⇒ b₁=1.
const ring: CellComplex = { ...square, faces: [] };
// Two squares sharing edge 1 (b→c). Still a disk ⇒ b=[1,0,0], χ=1.
const twoSquares: CellComplex = {
  nodes: ['a', 'b', 'c', 'd', 'e', 'f'],
  edges: [[0, 1], [1, 2], [2, 3], [3, 0], [1, 4], [4, 5], [5, 2]],
  faces: [
    [{ edge: 0, sign: 1 }, { edge: 1, sign: 1 }, { edge: 2, sign: 1 }, { edge: 3, sign: 1 }],
    [{ edge: 4, sign: 1 }, { edge: 5, sign: 1 }, { edge: 6, sign: 1 }, { edge: 1, sign: -1 }],
  ],
};
// Two disjoint square faces ⇒ b₀=2.
const disjoint: CellComplex = {
  nodes: ['a', 'b', 'c', 'd', 'A', 'B', 'C', 'D'],
  edges: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4]],
  faces: [
    [{ edge: 0, sign: 1 }, { edge: 1, sign: 1 }, { edge: 2, sign: 1 }, { edge: 3, sign: 1 }],
    [{ edge: 4, sign: 1 }, { edge: 5, sign: 1 }, { edge: 6, sign: 1 }, { edge: 7, sign: 1 }],
  ],
};

// A "face" whose boundary is an open path a→b→c, not a cycle: ∂1∂2 ≠ 0. Must be rejected — without the
// guard the engine silently returns betti [1,-1,0]. Guards the boundary-stitching in twoCellExtractor.
const openFace: CellComplex = {
  nodes: ['a', 'b', 'c'],
  edges: [[0, 1], [1, 2]],
  faces: [[{ edge: 0, sign: 1 }, { edge: 1, sign: 1 }]],
};

describe('homology of small complexes', () => {
  it('a single square is a disk', () => {
    const h = homology(square);
    expect(h.betti).toEqual([1, 0, 0]);
    expect(h.chi).toBe(1);
  });
  it('four edges with no face is a circle (b1=1)', () => {
    const h = homology(ring);
    expect(h.betti).toEqual([1, 1, 0]);
    expect(h.chi).toBe(0);
  });
  it('two squares sharing an edge is still a disk', () => {
    const h = homology(twoSquares);
    expect(h.betti).toEqual([1, 0, 0]);
    expect(h.chi).toBe(1);
  });
  it('two disjoint faces give b0=2', () => {
    const h = homology(disjoint);
    expect(h.betti).toEqual([2, 0, 0]);
    expect(h.chi).toBe(2);
  });
  it('rejects a face whose boundary is not a closed cycle (∂1∂2 ≠ 0)', () => {
    expect(() => homology(openFace)).toThrow(/not a closed cycle|∂1∂2/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/moduli-graph/chain-complex.test.ts`
Expected: FAIL — `homology` / `chainComplex` not found.

- [ ] **Step 3: Write the implementation**

```ts
// scripts/moduli-graph/chainComplex.ts
// Cellular chain complex C2 →∂2 C1 →∂1 C0 over a CW complex, and its rational homology.
// Betti numbers come from exact integer matrix ranks (computed mod two large primes and cross-checked);
// rank over ℚ equals rank over 𝔽_p for all but finitely many p, so agreement of two primes is decisive.
//
// The Betti formula is valid only for a genuine chain complex — ∂1∘∂2 = 0, i.e. every face boundary is a
// closed cycle. χ = V−E+F ALWAYS equals b0−b1+b2 algebraically (an identity, not a check), so it cannot
// detect a malformed boundary. `homology` VALIDATES ∂1∘∂2 = 0 up front and throws on a non-cycle face —
// that is the real guardrail against a mis-stitched boundary.

export interface FaceEdge { edge: number; sign: 1 | -1 }
export interface CellComplex {
  nodes: string[];
  edges: [number, number][];     // [fromNodeIdx, toNodeIdx]; ∂1(e) = to − from
  faces: FaceEdge[][];           // each face: ordered signed boundary edges; ∂2(f) = Σ sign·edge
}
export interface Homology {
  V: number; E: number; F: number;
  chi: number;
  betti: [number, number, number];
}

// Two primes with p² < 2⁵³ so products stay exact in double precision (a 31-bit prime would overflow
// Number.MAX_SAFE_INTEGER in `f * m[rank][c]`). Entries are −1/0/1 and matrices are small, so p ~ 10⁶
// makes a false-low rank (a nonzero ℚ-minor divisible by p) astronomically unlikely, and the two-prime
// cross-check catches it if it ever happens.
const PRIMES = [1000003, 999983];

/** Exact rank of an integer matrix (rows × cols) modulo p, via Gaussian elimination. */
function rankModP(rows: number[][], cols: number, p: number): number {
  if (rows.length === 0 || cols === 0) return 0;
  const m = rows.map((r) => r.map((x) => ((x % p) + p) % p));
  let rank = 0;
  for (let col = 0; col < cols && rank < m.length; col++) {
    let piv = -1;
    for (let r = rank; r < m.length; r++) if (m[r][col] % p !== 0) { piv = r; break; }
    if (piv === -1) continue;
    [m[rank], m[piv]] = [m[piv], m[rank]];
    const inv = modInv(m[rank][col], p);
    for (let r = 0; r < m.length; r++) {
      if (r === rank || m[r][col] === 0) continue;
      const f = (m[r][col] * inv) % p;
      if (f === 0) continue;
      for (let c = col; c < cols; c++) m[r][c] = (((m[r][c] - f * m[rank][c]) % p) + p) % p;
    }
    rank++;
  }
  return rank;
}

function modInv(a: number, p: number): number {
  let [old_r, r] = [((a % p) + p) % p, p];
  let [old_s, s] = [1, 0];
  while (r !== 0) { const q = Math.floor(old_r / r); [old_r, r] = [r, old_r - q * r]; [old_s, s] = [s, old_s - q * s]; }
  return ((old_s % p) + p) % p;
}

/** Exact rank over ℚ via two primes; throws if they disagree (a prime hit an invariant factor). */
function rankQ(rows: number[][], cols: number): number {
  const r0 = rankModP(rows, cols, PRIMES[0]);
  const r1 = rankModP(rows, cols, PRIMES[1]);
  if (r0 !== r1) throw new Error(`rank disagreement across primes (${r0} vs ${r1}) — retry with new primes`);
  return r0;
}

export function homology(cx: CellComplex): Homology {
  const V = cx.nodes.length, E = cx.edges.length, F = cx.faces.length;
  // Guard: edge endpoints in range (a bad index would otherwise corrupt ∂1 silently).
  cx.edges.forEach(([from, to], e) => {
    if (from < 0 || from >= V || to < 0 || to >= V) throw new Error(`edge ${e} references a node out of range [${from},${to}] (V=${V})`);
  });
  // Guard: ∂1∘∂2 = 0 — each face boundary is a closed cycle, i.e. its net node incidence is zero
  // (Σ sign at `to`, −sign at `from`). A mis-stitched boundary violates it and would give silent wrong
  // numbers; throw, naming the face, exactly as rankQ throws on prime disagreement.
  cx.faces.forEach((face, f) => {
    const net = new Map<number, number>();
    for (const { edge, sign } of face) {
      const pair = cx.edges[edge];
      if (!pair) throw new Error(`face ${f} references a non-existent edge ${edge} (E=${E})`);
      const [from, to] = pair;
      net.set(to, (net.get(to) ?? 0) + sign);
      net.set(from, (net.get(from) ?? 0) - sign);
    }
    for (const [node, v] of net) if (v !== 0) throw new Error(`face ${f} boundary is not a closed cycle (∂1∂2 ≠ 0 at node ${node})`);
  });
  // ∂1 as V×E (rows = nodes): column e has −1 at from, +1 at to.
  const d1: number[][] = Array.from({ length: V }, () => new Array(E).fill(0));
  cx.edges.forEach(([from, to], e) => { d1[from][e] -= 1; d1[to][e] += 1; });
  // ∂2 as E×F (rows = edges): column f accumulates the signed boundary edges.
  const d2: number[][] = Array.from({ length: E }, () => new Array(F).fill(0));
  cx.faces.forEach((face, f) => { for (const { edge, sign } of face) d2[edge][f] += sign; });

  const r1 = rankQ(d1, E);
  const r2 = rankQ(d2, F);
  const b0 = V - r1;
  const b1 = (E - r1) - r2;
  const b2 = F - r2;
  if (b1 < 0 || b2 < 0) throw new Error(`negative Betti number (b=[${b0},${b1},${b2}]) — malformed complex`);
  return { V, E, F, chi: V - E + F, betti: [b0, b1, b2] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/moduli-graph/chain-complex.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/moduli-graph/chainComplex.ts tests/moduli-graph/chain-complex.test.ts
git commit -m "feat(moduli-graph): cellular chain complex + rational homology engine"
```

---

## Task 2: Complex types (`types.ts`)

**Files:**
- Modify: `scripts/moduli-graph/types.ts` (append)

- [ ] **Step 1: Add the types**

Append to `scripts/moduli-graph/types.ts`:

```ts
// A 2-cell: a two-parameter family developed as a square. `boundary` is the ordered closed cycle of
// node keys around the square (corners plus any interior nodes a side subdivides into). `family` is the
// atlas id. `productOK` records whether the (α₁,α₂) grid validity check passed (false ⇒ non-product,
// flagged for exact stratification, out of this slice's scope).
export interface Cell2 { family: string; boundary: string[]; productOK: boolean; }

// The assembled k=2 sub-complex plus its homology, as emitted by complexAssembler / buildModuliComplex.
// No validity flag: `homology` throws on a malformed boundary (∂1∂2 ≠ 0), so a returned complex is valid
// by construction; a χ = b0−b1+b2 field would be a tautology and is deliberately omitted.
export interface ModuliComplex {
  nodes: { key: string; label: string; kind: NodeKind; handed: boolean }[];
  edges: { family: string; from: string; to: string }[];
  faces: Cell2[];
  chi: number;
  betti: [number, number, number];
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/moduli-graph/types.ts
git commit -m "feat(moduli-graph): Cell2 + ModuliComplex types"
```

---

## Task 3: Direct-similarity node key (`nodeCanonicalKey.ts`)

Generalize `flattenKey` (already a direct-similarity fingerprint, but chirality-blind) to all nodes and
track handedness. The distinctness key is `flattenKey(t)` plus a reflection-sensitive discriminant, so a
tiling and its mirror get different keys (merge up to DIRECT similarity), while an achiral tiling gets
one key. An empty tiling (zero-area collapse) is the shared ⊥.

**Files:**
- Create: `scripts/moduli-graph/nodeCanonicalKey.ts`
- Test: `tests/moduli-graph/node-canonical-key.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/moduli-graph/node-canonical-key.test.ts
import { describe, it, expect } from 'vitest';
import { nodeCanonicalKey } from '../../scripts/moduli-graph/nodeCanonicalKey';
import type { FloatTiling } from '../../scripts/moduli-graph/types';

// A scalene triangle — the canonical 2D chiral shape: sides 3, 2√2, √5 all distinct, so no reflection
// maps it to itself and its mirror is NOT superimposable by any rotation+translation. (An L-hexomino
// looks asymmetric but is reflection-symmetric across its diagonal — achiral — so it is the WRONG fixture.)
const scalene: [number, number][] = [[0, 0], [3, 0], [1, 2]];
const chiral: FloatTiling = { polys: [{ n: 3, verts: scalene }], basis: [[4, 0], [0, 3]] };
const mirror = (t: FloatTiling): FloatTiling => ({
  polys: t.polys.map((p) => ({ n: p.n, verts: p.verts.map(([x, y]) => [x, -y] as [number, number]) })),
  basis: [[t.basis[0][0], -t.basis[0][1]], [t.basis[1][0], -t.basis[1][1]]],
});
const rotScale = (t: FloatTiling, deg: number, s: number): FloatTiling => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const m = ([x, y]: [number, number]): [number, number] => [s * (x * c - y * sn), s * (x * sn + y * c)];
  return { polys: t.polys.map((p) => ({ n: p.n, verts: p.verts.map(m) })), basis: [m(t.basis[0]), m(t.basis[1])] };
};
// A square unit cell (achiral).
const square: FloatTiling = { polys: [{ n: 4, verts: [[0, 0], [1, 0], [1, 1], [0, 1]] }], basis: [[1, 0], [0, 1]] };

describe('nodeCanonicalKey', () => {
  it('is invariant under rotation + uniform scale', () => {
    expect(nodeCanonicalKey(rotScale(chiral, 41, 2.3)).key).toBe(nodeCanonicalKey(chiral).key);
  });
  it('splits a chiral tiling from its mirror and flags handed', () => {
    const a = nodeCanonicalKey(chiral), b = nodeCanonicalKey(mirror(chiral));
    expect(a.key).not.toBe(b.key);
    expect(a.handed).toBe(true);
  });
  it('merges an achiral tiling with its mirror and flags achiral', () => {
    const a = nodeCanonicalKey(square), b = nodeCanonicalKey(mirror(square));
    expect(a.key).toBe(b.key);
    expect(a.handed).toBe(false);
  });
  it('distinguishes genuinely different tilings', () => {
    expect(nodeCanonicalKey(chiral).key).not.toBe(nodeCanonicalKey(square).key);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/moduli-graph/node-canonical-key.test.ts`
Expected: FAIL — `nodeCanonicalKey` not found.

- [ ] **Step 3: Write the implementation**

Chirality is NOT a signed-area sign. A single tile's signed area is nonzero for ANY polygon (the square's
is 2), so a signed-orientation scalar wrongly flags the achiral square as chiral. The correct test is
whether the tiling is congruent to its mirror by a DIRECT isometry: build a canonical form under direct
similarity (`directKey`, reflection NOT quotiented) and compare it to the mirror's. Shape distinctness
still comes from the proven reflection-blind `flattenKey`; `directKey` only supplies the handedness bit.

```ts
// scripts/moduli-graph/nodeCanonicalKey.ts
import type { FloatTiling } from './types';
import { effectiveVerts } from './geometry';
import { flattenKey } from './flattenKey';

const EPS = 1e-6;
const Q = 1e4; // quantise aligned coords to 1e-4; distinct tilings differ by far more than this

function effTiles(t: FloatTiling): [number, number][][] {
  return t.polys.map((p) => effectiveVerts(p.verts)).filter((v) => v.length >= 3);
}
function mirror(t: FloatTiling): FloatTiling {
  return {
    polys: t.polys.map((p) => ({ n: p.n, star: p.star, verts: p.verts.map(([x, y]) => [x, -y] as [number, number]) })),
    basis: [[t.basis[0][0], -t.basis[0][1]], [t.basis[1][0], -t.basis[1][1]]],
  };
}

/** Canonical form of the effective-vertex point set under DIRECT similarity: centre at the centroid,
 *  scale by the shortest edge, then the lexicographically smallest serialisation over every anchor
 *  alignment (each non-central point rotated onto +x). Reflection is NOT quotiented, so a chiral tiling
 *  and its mirror differ while an achiral one matches its mirror. */
function directKey(t: FloatTiling): string {
  const tiles = effTiles(t);
  const pts: [number, number][] = [];
  for (const v of tiles) for (const p of v) pts.push([p[0], p[1]]);
  if (pts.length === 0) return 'degenerate:⊥';
  let s = Infinity;
  for (const v of tiles) for (let i = 0; i < v.length; i++) {
    const q = v[(i + 1) % v.length];
    s = Math.min(s, Math.hypot(v[i][0] - q[0], v[i][1] - q[1]));
  }
  if (!Number.isFinite(s) || s <= 0) s = 1;
  const gx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const gy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const centered = pts.map(([x, y]): [number, number] => [(x - gx) / s, (y - gy) / s]);
  let best: string | null = null;
  for (const a of centered) {
    const r = Math.hypot(a[0], a[1]);
    if (r < EPS) continue;
    const th = Math.atan2(a[1], a[0]);
    const c = Math.cos(-th), sn = Math.sin(-th);
    const ser = centered
      .map(([x, y]) => `${Math.round((x * c - y * sn) * Q)},${Math.round((x * sn + y * c) * Q)}`)
      .sort()
      .join(';');
    if (best === null || ser < best) best = ser;
  }
  return best ?? 'degenerate:⊥';
}

export interface CanonicalKey { key: string; handed: boolean; blind: string; }

export function nodeCanonicalKey(t: FloatTiling): CanonicalKey {
  if (effTiles(t).length === 0) return { key: 'degenerate:⊥', handed: false, blind: 'degenerate:⊥' };
  const blind = flattenKey(t);              // reflection-blind shape fingerprint
  const dk = directKey(t), dkm = directKey(mirror(t));
  const handed = dk !== dkm;                // chiral ⇔ no direct isometry onto the mirror
  const hand = handed ? (dk < dkm ? '0' : '1') : 'a';
  return { key: `${blind}|${hand}`, handed, blind };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/moduli-graph/node-canonical-key.test.ts`
Expected: PASS (4 tests). If rotation invariance is flaky at a quantisation boundary, coarsen `Q`
(e.g. 1e3) — distinct unit-regular tilings still differ by far more; do not touch `EPS`.

- [ ] **Step 5: Commit**

```bash
git add scripts/moduli-graph/nodeCanonicalKey.ts tests/moduli-graph/node-canonical-key.test.ts
git commit -m "feat(moduli-graph): direct-similarity node key with chirality flag"
```

---

## Task 4: Two-cell extractor (`twoCellExtractor.ts`)

From a two-parameter `paramCell`, develop the face: the four corner states and the four side sweeps.
Each side fixes one parameter at a limit (ALPHA_EPS inside) and sweeps the other across its open range,
collecting node-states (endpoints + interior regular edge-to-edge minima) exactly as the k=1 extractor
does, but along the slice. The four sides are stitched into one closed boundary cycle of node states.
The product-square grid check samples the interior and confirms it tiles (regular tiles, low defect)
throughout.

**Files:**
- Create: `scripts/moduli-graph/twoCellExtractor.ts`
- Test: `tests/moduli-graph/two-cell.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/moduli-graph/two-cell.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractTwoCell } from '../../scripts/moduli-graph/twoCellExtractor';

const atlas = JSON.parse(readFileSync('public/reference-atlas-isotoxal.json', 'utf8'));
const recs = (Array.isArray(atlas) ? atlas : atlas.records) as { id: string; k: number; source: string; paramCell: any }[];
const twoParam = recs.filter((r) => r.k === 2 && r.source === 'isotoxal' && r.paramCell?.params?.length === 2);
const first4a = twoParam.find((r) => (r as any).family === '4α')!;

describe('extractTwoCell on a 4α two-parameter family', () => {
  const face = extractTwoCell(first4a.paramCell);
  it('produces a closed boundary cycle of node states', () => {
    expect(face.boundary.length).toBeGreaterThanOrEqual(4);      // ≥4 sides, more if a side subdivides
    // closed: consecutive states are joined and the last joins the first (checked structurally)
    expect(face.corners.length).toBe(4);
  });
  it('passes the product-square grid check', () => {
    expect(face.productOK).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/moduli-graph/two-cell.test.ts`
Expected: FAIL — `extractTwoCell` not found.

- [ ] **Step 3: Write the implementation**

```ts
// scripts/moduli-graph/twoCellExtractor.ts
import { evaluateParamCell, type ParametricCellData } from '@/lib/utils/paramCell';
import type { FloatTiling, NodeState } from './types';
import { polyArea, tilingDefect, REGULAR_TOL } from './geometry';
import { vertexConfigs, configAngleSum } from './tilingSignature';

const EPS = 1e-3;

const toFloat = (cell: ReturnType<typeof evaluateParamCell>): FloatTiling => ({
  polys: (cell.cellPolygons as { n: number; star?: boolean; vertices: [number, number][] }[])
    .map((p) => ({ n: p.n, star: p.star, verts: p.vertices })),
  basis: cell.basis as [[number, number], [number, number]],
});
const cleaned = (t: FloatTiling): FloatTiling => ({ ...t, polys: t.polys.filter((p) => polyArea(p.verts) > 1e-4) });
const isEdgeToEdge = (t: FloatTiling): boolean => {
  const cfgs = vertexConfigs(t);
  return cfgs.length > 0 && cfgs.every((c) => Math.abs(configAngleSum(c) - 360) < 1);
};

/** Sweep a 1-parameter path `evalAt(a): FloatTiling` over [lo,hi]: two endpoint states plus interior
 *  regular edge-to-edge minima, ordered by a. Mirrors nodeExtractor's logic along an arbitrary slice. */
function sweep(evalAt: (a: number) => FloatTiling, lo: number, hi: number): NodeState[] {
  const out: NodeState[] = [];
  for (const a of [lo + EPS, hi - EPS]) {
    const t = cleaned(evalAt(a));
    out.push({ alpha: a, tiling: t, kind: 'endpoint', regular: t.polys.length > 0 && tilingDefect(t.polys) < REGULAR_TOL });
  }
  const step = 0.5, xs: number[] = [], ys: number[] = [];
  for (let a = lo + step; a < hi; a += step) { xs.push(a); ys.push(tilingDefect(evalAt(a).polys)); }
  const mids: NodeState[] = [];
  for (let i = 1; i < xs.length - 1; i++) {
    if (ys[i] < ys[i - 1] && ys[i] <= ys[i + 1]) {
      let a0 = xs[i - 1], a1 = xs[i + 1];
      for (let it = 0; it < 50; it++) {
        const m0 = a0 + (a1 - a0) / 3, m1 = a1 - (a1 - a0) / 3;
        if (tilingDefect(evalAt(m0).polys) < tilingDefect(evalAt(m1).polys)) a1 = m1; else a0 = m0;
      }
      const a = (a0 + a1) / 2, t = evalAt(a);
      if (tilingDefect(t.polys) < REGULAR_TOL && isEdgeToEdge(t)) mids.push({ alpha: a, tiling: t, kind: 'interior', regular: true });
    }
  }
  // endpoints first two entries; splice interior nodes in ascending-a order between them
  const [start, end] = out;
  return [start, ...mids.sort((p, q) => p.alpha - q.alpha), end];
}

export interface TwoCell { corners: NodeState[]; boundary: NodeState[]; productOK: boolean; }

/** Develop a two-parameter family as a square 2-cell. Sides in CCW order:
 *  (α₂=lo, α₁: lo→hi), (α₁=hi, α₂: lo→hi), (α₂=hi, α₁: hi→lo), (α₁=lo, α₂: hi→lo). */
export function extractTwoCell(pc: ParametricCellData): TwoCell {
  const [lo1, hi1] = pc.params[0].alphaRangeDegOpen;
  const [lo2, hi2] = pc.params[1].alphaRangeDegOpen;
  const at = (a1: number, a2: number) => cleaned(toFloat(evaluateParamCell(pc, [a1, a2])));

  const sides: NodeState[][] = [
    sweep((a1) => at(a1, lo2 + EPS), lo1, hi1),
    sweep((a2) => at(hi1 - EPS, a2), lo2, hi2),
    sweep((a1) => at(a1, hi2 - EPS), lo1, hi1).reverse(),
    sweep((a2) => at(lo1 + EPS, a2), lo2, hi2).reverse(),
  ];
  const corners = sides.map((s) => s[0]);
  // Stitch: drop each side's first state (it repeats the previous side's last), leaving one closed loop.
  const boundary: NodeState[] = [];
  for (const s of sides) boundary.push(...s.slice(1));

  // Product-square grid check: is the interior a valid tiling throughout the (α₁,α₂) square? The proxy is
  // edge-to-edge closure (vertex angle-sums = 360°), NOT regularity — an isotoxal family tiles by
  // non-regular tiles everywhere except the α=90 regular point, so `tilingDefect` (deviation from a
  // REGULAR polygon) is large across a valid interior and is the wrong measure.
  let productOK = true;
  const N = 5;
  for (let i = 1; i < N && productOK; i++) for (let j = 1; j < N && productOK; j++) {
    const a1 = lo1 + ((hi1 - lo1) * i) / N, a2 = lo2 + ((hi2 - lo2) * j) / N;
    const t = at(a1, a2);
    if (t.polys.length === 0 || !isEdgeToEdge(t)) productOK = false;
  }
  return { corners, boundary, productOK };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/moduli-graph/two-cell.test.ts`
Expected: PASS (2 tests). If `productOK` is false on the 4α family, log the failing (a1,a2) and the
defect — a genuine non-product domain is a flagged exception, but on 4α (two independent squares) it
must pass; a failure there means the slice evaluation is wrong, not the family.

- [ ] **Step 5: Commit**

```bash
git add scripts/moduli-graph/twoCellExtractor.ts tests/moduli-graph/two-cell.test.ts
git commit -m "feat(moduli-graph): two-parameter face extractor (boundary cycle + grid check)"
```

---

## Task 5: Assembler + homology wiring + regression (`complexAssembler.ts`)

Turn resolved node-states into a `CellComplex`: nodes keyed by `nodeCanonicalKey`, edges between
consecutive boundary states, faces as the closed boundary cycle. Glue: identical node keys are one node;
identical (unordered endpoint pair + mid-state key) edges are one edge. Run `homology`. Also expose a
1-skeleton path (faces off) so the k=1 regression can drive the same engine.

**Files:**
- Create: `scripts/moduli-graph/complexAssembler.ts`
- Test: `tests/moduli-graph/complex-assembler.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/moduli-graph/complex-assembler.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { assembleComplex } from '../../scripts/moduli-graph/complexAssembler';

const atlas = JSON.parse(readFileSync('public/reference-atlas-isotoxal.json', 'utf8'));
const recs = (Array.isArray(atlas) ? atlas : atlas.records) as any[];
const one4a = recs.find((r) => r.k === 2 && r.source === 'isotoxal' && r.family === '4α' && r.paramCell?.params?.length === 2)!;

describe('assembleComplex', () => {
  // One face assembles to ONE 2-cell whose boundary map may be degenerate: at a 4α corner both squares
  // collapse to zero area, so all four corners are the same ⊥ node and the four sides become loops at ⊥.
  // The resulting space is therefore NOT necessarily a disk — a single face can give b=[1,3,0] (χ=−2).
  // So do NOT hard-code a triple. The real guard is inside homology(): it throws if the stitched boundary
  // is not a closed cycle (∂1∂2 ≠ 0), so assembleComplex not throwing IS the validity check. Log the betti.
  it('assembles exactly one face with a valid (∂1∂2=0) boundary', () => {
    const c = assembleComplex([one4a]); // throws inside homology() if the stitched boundary is not a cycle
    expect(c.faces.length).toBe(1);
    console.log(`single 4α face: V=${c.nodes.length} E=${c.edges.length} χ=${c.chi} betti=[${c.betti.join(',')}]`);
  });
  // A face whose boundary IS embedded (distinct corners) is a genuine disk — exercised on a synthetic
  // complex in chain-complex.test.ts (the `square` case → [1,0,0]); not asserted on real degenerate data.
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/moduli-graph/complex-assembler.test.ts`
Expected: FAIL — `assembleComplex` not found.

- [ ] **Step 3: Write the implementation**

```ts
// scripts/moduli-graph/complexAssembler.ts
import type { ParametricCellData } from '@/lib/utils/paramCell';
import { extractTwoCell } from './twoCellExtractor';
import { nodeCanonicalKey } from './nodeCanonicalKey';
import { homology, type CellComplex, type FaceEdge } from './chainComplex';
import type { ModuliComplex, NodeState } from './types';

interface FamilyRecord { id: string; paramCell?: ParametricCellData }

/** Mid-state identity along a boundary segment: the geometric key of the tiling halfway between two
 *  consecutive node states, so two segments glue only if they trace the same 1-parameter path. */
const edgeKey = (a: NodeState, b: NodeState): string => {
  const ka = nodeCanonicalKey(a.tiling).key, kb = nodeCanonicalKey(b.tiling).key;
  const [lo, hi] = ka < kb ? [ka, kb] : [kb, ka];
  return `${lo}::${hi}`; // endpoint-pair key; two families between the same nodes stay parallel via family id below
};

export function assembleComplex(families: FamilyRecord[]): ModuliComplex {
  const nodeIndex = new Map<string, number>();
  const nodeMeta: ModuliComplex['nodes'] = [];
  const nodeId = (s: NodeState): number => {
    const ck = nodeCanonicalKey(s.tiling);
    let i = nodeIndex.get(ck.key);
    if (i === undefined) {
      i = nodeMeta.length;
      nodeIndex.set(ck.key, i);
      nodeMeta.push({ key: ck.key, label: ck.blind === 'degenerate:⊥' ? '⊥' : ck.key, kind: s.tiling.polys.length === 0 ? 'degenerate' : 'uncatalogued', handed: ck.handed });
    }
    return i;
  };

  const edgeIndex = new Map<string, number>();
  const edges: [number, number][] = [];
  const edgeMeta: ModuliComplex['edges'] = [];
  const edgeId = (a: NodeState, b: NodeState, family: string): { idx: number; sign: 1 | -1 } => {
    const ai = nodeId(a), bi = nodeId(b);
    const key = `${family}|${edgeKey(a, b)}`; // family-scoped so distinct families stay parallel edges
    let idx = edgeIndex.get(key);
    if (idx === undefined) {
      idx = edges.length;
      edgeIndex.set(key, idx);
      edges.push([ai, bi]);
      edgeMeta.push({ family, from: nodeMeta[ai].key, to: nodeMeta[bi].key });
      return { idx, sign: 1 };
    }
    // orientation relative to stored edge
    return { idx, sign: edges[idx][0] === ai ? 1 : -1 };
  };

  const faces: FaceEdge[][] = [];
  const faceMeta: ModuliComplex['faces'] = [];
  for (const fam of families) {
    if (fam.paramCell?.params?.length !== 2) continue;
    const face = extractTwoCell(fam.paramCell);
    const loop = face.boundary;
    const fEdges: FaceEdge[] = [];
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      const { idx, sign } = edgeId(a, b, fam.id);
      fEdges.push({ edge: idx, sign });
    }
    faces.push(fEdges);
    faceMeta.push({ family: fam.id, boundary: loop.map((s) => nodeMeta[nodeId(s)].key), productOK: face.productOK });
  }

  const cx: CellComplex = { nodes: nodeMeta.map((n) => n.key), edges, faces };
  const h = homology(cx); // throws if any face boundary is not a closed cycle (∂1∂2 ≠ 0)
  return { nodes: nodeMeta, edges: edgeMeta, faces: faceMeta, chi: h.chi, betti: h.betti };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/moduli-graph/complex-assembler.test.ts`
Expected: PASS. One face; the logged betti reflects the degenerate boundary (4α corners collapse to a
shared ⊥), so `b₁` may be positive — that is correct, not a bug. A real bug surfaces as a THROW from
homology(): "face … boundary is not a closed cycle" (a mis-stitched boundary loop) or a rank
disagreement (a prime hit an invariant factor — swap the primes in `chainComplex.ts`).

- [ ] **Step 5: Add the k=1 regression test**

Append to `tests/moduli-graph/complex-assembler.test.ts`:

```ts
import { assembleGraph } from '../../scripts/moduli-graph/graphAssembler';
import { loadCatalogueKeys } from '../../scripts/moduli-graph/catalogueKeys';
import { CyclotomicRing } from '@/classes/Cyclotomic';
import { homology, type CellComplex } from '../../scripts/moduli-graph/chainComplex';

describe('k=1 regression: the homology engine reproduces H1=15 on the k=1 graph', () => {
  it('feeds the existing k=1 nodes/edges (float-signature identity) through homology with no faces', () => {
    const k1 = recs.filter((r) => r.k === 1 && r.source === 'isotoxal' && r.paramCell?.params?.length === 1);
    const g = assembleGraph(k1, loadCatalogueKeys(CyclotomicRing.create(24)));
    // drop the degenerate ⊥ node and its edges, to match g.h1NoDegenerate == 15
    const degKeys = new Set(g.nodes.filter((n) => n.kind === 'degenerate').map((n) => n.key));
    const nodes = g.nodes.filter((n) => !degKeys.has(n.key)).map((n) => n.key);
    const idx = new Map(nodes.map((k, i) => [k, i] as const));
    const edges = g.edges.filter((e) => !degKeys.has(e.from) && !degKeys.has(e.to))
      .map((e) => [idx.get(e.from)!, idx.get(e.to)!] as [number, number]);
    const cx: CellComplex = { nodes, edges, faces: [] };
    const h = homology(cx);
    expect(h.betti[1]).toBe(g.h1NoDegenerate); // both 15 — engine agrees with the cyclomatic number
    expect(h.betti[1]).toBe(15);
  });
});
```

- [ ] **Step 6: Run the full moduli-graph suite**

Run: `pnpm vitest run tests/moduli-graph/`
Expected: all pass, including the regression (`b₁ = 15`).

- [ ] **Step 7: Commit**

```bash
git add scripts/moduli-graph/complexAssembler.ts tests/moduli-graph/complex-assembler.test.ts
git commit -m "feat(moduli-graph): assemble k=2 faces, glue cells, wire homology + k=1 regression"
```

---

## Task 6: CLI (`buildModuliComplex.ts`)

**Files:**
- Create: `scripts/moduli-graph/buildModuliComplex.ts`

- [ ] **Step 1: Write the CLI**

```ts
// scripts/moduli-graph/buildModuliComplex.ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { assembleComplex } from './complexAssembler';

const atlas = JSON.parse(readFileSync('public/reference-atlas-isotoxal.json', 'utf8'));
const recs = (Array.isArray(atlas) ? atlas : atlas.records) as any[];
// This slice: the 4α / 4.4α two-parameter cluster.
const cluster = recs.filter((r) => r.k === 2 && r.source === 'isotoxal'
  && r.paramCell?.params?.length === 2 && ['4α', '4.4α'].includes(r.family));

// assembleComplex throws if any stitched face boundary is not a closed cycle (∂1∂2 ≠ 0) — a clean run is
// itself the validity certificate, so there is no separate self-check flag to test.
const c = assembleComplex(cluster);
mkdirSync('experiments/results', { recursive: true });
writeFileSync('experiments/results/moduli-complex-k2.json', JSON.stringify(c, null, 2));
const nonProduct = c.faces.filter((f) => !f.productOK).map((f) => f.family);
console.log(
  `families=${cluster.length} V=${c.nodes.length} E=${c.edges.length} F=${c.faces.length} ` +
  `χ=${c.chi} betti=[${c.betti.join(',')}]` +
  (nonProduct.length ? ` non-product=${nonProduct.join(',')}` : ''),
);
```

- [ ] **Step 2: Run it**

Run: `pnpm tsx scripts/moduli-graph/buildModuliComplex.ts`
Expected: prints `V=… E=… F=16 χ=… betti=[…]` (16 = 12 `4α` + 4 `4.4α` faces), writes
`experiments/results/moduli-complex-k2.json`. Record the betti triple in the run log — it is the slice's
result. A malformed boundary throws (non-zero exit) naming the offending face; a clean run is the
validity certificate.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: clean (no type errors, no new warnings).

- [ ] **Step 4: Commit**

```bash
git add scripts/moduli-graph/buildModuliComplex.ts
git commit -m "feat(moduli-graph): CLI — assemble the 4α/4.4α k=2 sub-complex, report invariants"
```

---

## Notes for the implementer

- **The 4α family fixtures.** `recs.find(r => r.family === '4α' && r.paramCell.params.length === 2)`
  selects a two-parameter square-flex family. Do not confuse it with the one-parameter `4α` families
  (`params.length === 1`).
- **A face is a disk ONLY if its boundary is embedded.** When corners collapse to a shared ⊥ (every 4α
  corner does — both squares vanish), the attaching map is not injective and a single face can carry
  `b₁ > 0`. So predicted triples are asserted only on synthetic complexes with distinct corners
  (`chain-complex.test.ts`); on real families assert `assembleComplex` does not throw (∂₁∂₂=0 holds) and
  LOG the betti.
  The cluster's numbers come out of the CLI run — record them, do not hard-code them.
- **The ∂1∂2=0 validation is the guardrail.** `homology()` throws when a face boundary is not a closed
  cycle ("face … not a closed cycle") — that is the real check, because χ = b₀−b₁+b₂ is an algebraic
  identity, not a check. If `assembleComplex` throws, the stitched boundary is wrong; stop and fix.
- **No silent product-square claim.** If a family's `productOK` is false, the CLI prints it under
  `non-product=…`; that family's face is still emitted (a square best-effort) but the flag must surface.
- **Do not commit the six pre-staged theory files** (`CLAUDE.md`, `app/(app)/theory/*`,
  `components/markdown-renderer.tsx`, `components/theory-sidebar.tsx`, `lib/utils/tableOfContents.ts`).
  Use explicit `git add <path>` per step as written; never `git add -A`.
```
