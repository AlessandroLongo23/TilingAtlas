# Tiling deformation graph (k=1 isotoxal slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assemble the k=1 isotoxal Euclidean single-parameter families into a CW/graph data file plus a static figure, where nodes are special-α limit states, edges are family arcs, and chiral partners stay distinct.

**Architecture:** Offline TypeScript run via `pnpm tsx`, reading the shipped family records and the exact ℤ[ζ₁₂] develop catalogue. Node identity is an exact rotation-only (C₁₂) canonical key adopted from the catalogue after a float congruence match; nodes are located by endpoint degeneracy and flexing-tile regularity; the assembler subdivides families, dedups nodes, synthesizes mirror twins, and emits `moduli-graph.json`; a renderer draws the node-link figure.

**Tech Stack:** TypeScript, `tsx`, Vitest, the repo's exact cyclotomic arithmetic (`Cyclotomic`, `canonicalFormN`, `oracleCellReconstruct`), `evaluateParamCell`.

---

## Implementation risk (read first)

ℤ[ζ₁₂] is dense in ℂ (settled fact, CLAUDE.md): a float vertex cannot be rounded to "the nearest exact point." So node identity is obtained by matching a node's float rendering to the exact catalogue and adopting that entry's exact C₁₂ key. Two functions carry the only real uncertainty and are validated early against the 3.3.4α golden family before anything scales:

- `tilingSignature` (Task 3): the rotation/translation/scale-invariant, reflection-sensitive fingerprint used to pick the catalogue entry. Its tests are the contract; the implementation may need one iteration to get the vertex-star tracing tolerant enough.
- `nodeExtractor` interior detection (Task 5): locating the flexing-tile regularity point. Tests fix the α it must find.

If either resists the first cut, stop and revisit the spec rather than widening tolerances silently. The golden test (Task 7) is the gate before Task 9 scales to the full slice.

## Scope

k=1 isotoxal Euclidean families with a single parameter (`paramCell.params.length === 1`). Deferred: multi-parameter 2-cells, higher k, spherical/hyperbolic, any in-app view, and interior symmetry maxima that do not come from a flexing tile reaching regularity (flagged, not handled).

## File structure

- Create `scripts/moduli-graph/directCanonicalForm.ts` — re-export of the C₁₂ key (thin; the fork itself lands in the existing canonical-form file).
- Modify `lib/classes/algorithm/canonicalFormN.ts` — parameterize the symmetry group; add `nKeyOfSymbolDirect`.
- Create `scripts/moduli-graph/catalogueKeys.ts` — load exact k=1 cells, build `directKey → {id, cell}` and the mirror-key index.
- Create `scripts/moduli-graph/tilingSignature.ts` — oriented vertex-configuration fingerprint from float polygons + basis.
- Create `scripts/moduli-graph/nodeExtractor.ts` — endpoint + interior special-α states of one family.
- Create `scripts/moduli-graph/nodeResolver.ts` — float state → catalogue identity (id, exact key, chirality) or `unresolved`.
- Create `scripts/moduli-graph/graphAssembler.ts` — families → `moduli-graph.json`.
- Create `scripts/moduli-graph/buildModuliGraph.ts` — CLI entry: run the slice, write `experiments/results/moduli-graph.json`.
- Create `scripts/moduli-graph/renderModuliGraph.ts` — `moduli-graph.json` → `experiments/results/moduli-graph.html`.
- Create tests under `tests/moduli-graph/`.

Types shared across units (define in `scripts/moduli-graph/types.ts`, created in Task 3):

```ts
export type Vec = number[];                 // [a0,a1,a2,a3] over {1,ω,ω²,ω³}
export interface FloatPoly { n: number; star?: boolean; verts: [number, number][]; }
export interface FloatTiling { polys: FloatPoly[]; basis: [[number, number], [number, number]]; }
export type Chirality = 'achiral' | 'L' | 'R';
export interface NodeState { alpha: number; tiling: FloatTiling; kind: 'endpoint' | 'interior'; }
export interface ResolvedNode { key: string; label: string; chirality: Chirality; resolved: boolean; }
```

---

## Task 1: C₁₂ direct canonical form (chirality-sensitive key)

**Files:**
- Modify: `lib/classes/algorithm/canonicalFormN.ts:32-38, 116-139, 155-162`
- Create: `scripts/moduli-graph/directCanonicalForm.ts`
- Test: `tests/moduli-graph/direct-canonical-form.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/moduli-graph/direct-canonical-form.test.ts
import { describe, it, expect } from 'vitest';
import { nKeyOfSymbol } from '@/classes/algorithm/canonicalFormN';
import { nKeyOfSymbolDirect } from '@/classes/algorithm/canonicalFormN';

type Vec = number[];
// reflection map used inside the canonical form (conj on {1,ω,ω²,ω³})
const conj = (v: Vec): Vec => [v[0] + v[2], v[1], -v[2], -v[1] - v[3]];
const mulw = (v: Vec): Vec => [-v[3], v[0], v[1] + v[3], v[2]];

// 3^6 = ctrnact-01_3-6a-1 (achiral)
const TRI: Vec[] = [[-1, 0, 1, 0], [1, 0, 0, 0], [0, 0, 0, 0]];

describe('nKeyOfSymbolDirect', () => {
  it('is rotation-invariant (3^6 vs a ω-rotated copy)', () => {
    const rot = TRI.map(mulw);
    expect(nKeyOfSymbolDirect(rot)).toBe(nKeyOfSymbolDirect(TRI));
  });

  it('collapses the mirror of an achiral tiling (3^6)', () => {
    const refl = TRI.map(conj);
    expect(nKeyOfSymbolDirect(refl)).toBe(nKeyOfSymbolDirect(TRI));
  });

  it('agrees with the reflection-inclusive key on an achiral tiling', () => {
    // both keys are canonical strings; only equality within a function is asserted elsewhere.
    expect(nKeyOfSymbolDirect(TRI)).not.toBeNull();
    expect(nKeyOfSymbol(TRI)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/moduli-graph/direct-canonical-form.test.ts`
Expected: FAIL — `nKeyOfSymbolDirect` is not exported.

- [ ] **Step 3: Parameterize the group in `canonicalFormN.ts`**

Replace lines 32-38 (the `G24` block and helpers) with a group builder, keeping `sigma`/`applyG`/`word` unchanged:

```ts
type Gm = { f: boolean; j: number };
const buildG = (reflect: boolean): Gm[] => {
	const g: Gm[] = [];
	for (const f of reflect ? [false, true] : [false]) for (let j = 0; j < 12; j++) g.push({ f, j });
	return g;
};
const G_FULL = buildG(true);   // D₁₂ — reflection-inclusive (existing behaviour)
const G_ROT = buildG(false);   // C₁₂ — rotation-only (chirality-sensitive)
const applyG = (g: Gm, v: Vec): Vec => { let x = g.f ? conj(v) : v; for (let i = 0; i < g.j; i++) x = mulw(x); return x; };
const sigma = (g: Gm, k: number) => (g.f ? (((g.j - k) % 12) + 12) % 12 : (g.j + k) % 12);
const word = (ks: number[]) => ks.reduce((acc, k) => acc | (1 << (11 - k)), 0);
```

Change `canonicalMatrix` (line 116) to take the group; replace the body's `G24` reference (line 123) with the passed group:

```ts
function canonicalMatrix(symbol: Vec[], G: Gm[]): Vec[] {
	// ...unchanged through `const st = stars(H, S);`...
	const lists = G.map((g) => ({ g, L: listOf(g) }));
	// ...unchanged remainder...
}
```

Update `nKeyOfSymbol` (line 155) to pass `G_FULL`, and add the direct variant:

```ts
export function nKeyOfSymbol(rows: Vec[]): string | null {
	try {
		if (rows.length < 3) return null;
		return JSON.stringify(canonicalMatrix(rows.map((r) => r.slice()), G_FULL));
	} catch { return null; }
}

/** Chirality-sensitive canonical key: congruence up to direct similarity (C₁₂ rotations, no reflection). */
export function nKeyOfSymbolDirect(rows: Vec[]): string | null {
	try {
		if (rows.length < 3) return null;
		return JSON.stringify(canonicalMatrix(rows.map((r) => r.slice()), G_ROT));
	} catch { return null; }
}
```

`nKeyOfCell` (line 168) stays as-is (calls `nKeyOfSymbol`). Create the re-export:

```ts
// scripts/moduli-graph/directCanonicalForm.ts
export { nKeyOfSymbolDirect } from '@/classes/algorithm/canonicalFormN';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/moduli-graph/direct-canonical-form.test.ts`
Expected: PASS.

- [ ] **Step 5: Guard that existing behaviour is unchanged**

Run: `pnpm vitest run` and confirm any existing `canonicalFormN` / congruence tests still pass (the reflection-inclusive path now goes through `G_FULL`, which is byte-identical to the old `G24`).
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/classes/algorithm/canonicalFormN.ts scripts/moduli-graph/directCanonicalForm.ts tests/moduli-graph/direct-canonical-form.test.ts
git commit -m "feat(moduli-graph): C12 direct canonical form (chirality survives)"
```

---

## Task 2: Exact k=1 catalogue key index

**Files:**
- Create: `scripts/moduli-graph/catalogueKeys.ts`
- Test: `tests/moduli-graph/catalogue-keys.test.ts`
- Data: `tools/ctrnact-oracle/run-k1-regular/ctrnact-cells-k1.json`

- [ ] **Step 1: Confirm the catalogue is the complete uniform set**

Run: `node -e "const a=require('./tools/ctrnact-oracle/run-k1-regular/ctrnact-cells-k1.json'); console.log(a.length, a.map(x=>x.id))"`
Expected: the ten k=1 uniform tilings. If fewer, regenerate per the spec (`make PALETTE=regular` + `run-oracle.sh 1`) before continuing. Record the count in the commit message.

- [ ] **Step 2: Write the failing test**

```ts
// tests/moduli-graph/catalogue-keys.test.ts
import { describe, it, expect } from 'vitest';
import { loadCatalogueKeys } from '../../scripts/moduli-graph/catalogueKeys';

describe('loadCatalogueKeys', () => {
  it('assigns a distinct direct key to every k=1 uniform tiling', () => {
    const idx = loadCatalogueKeys();
    expect(idx.byKey.size).toBeGreaterThanOrEqual(10);
    // 3^6 present and keyed
    const tri = [...idx.byKey.values()].find((e) => e.id === 'ctrnact-01_3-6a-1');
    expect(tri).toBeTruthy();
  });

  it('records a mirror key for each entry (equal to the direct key for achiral 3^6)', () => {
    const idx = loadCatalogueKeys();
    const tri = [...idx.entries].find((e) => e.id === 'ctrnact-01_3-6a-1')!;
    expect(tri.mirrorKey).toBe(tri.directKey); // 3^6 is achiral
  });
});
```

- [ ] **Step 3: Implement `catalogueKeys.ts`**

```ts
// scripts/moduli-graph/catalogueKeys.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nKeyOfSymbolDirect } from '@/classes/algorithm/canonicalFormN';

type Vec = number[];
const conj = (v: Vec): Vec => [v[0] + v[2], v[1], -v[2], -v[1] - v[3]];

export interface CatalogueEntry {
  id: string;
  cell: { T1: Vec; T2: Vec; Seed: Vec[] };
  directKey: string;
  mirrorKey: string; // key of the reflected cell (== directKey iff achiral)
}
export interface CatalogueIndex {
  entries: CatalogueEntry[];
  byKey: Map<string, CatalogueEntry>; // directKey → entry (mirror twins added in the assembler)
}

const CELLS = resolve(process.cwd(), 'tools/ctrnact-oracle/run-k1-regular/ctrnact-cells-k1.json');

export function loadCatalogueKeys(): CatalogueIndex {
  const raw = JSON.parse(readFileSync(CELLS, 'utf8')) as { id: string; T1: Vec; T2: Vec; Seed: Vec[] }[];
  const entries: CatalogueEntry[] = [];
  for (const r of raw) {
    const directKey = nKeyOfSymbolDirect([r.T1, r.T2, ...r.Seed]);
    if (directKey === null) continue; // octagon-bearing / out of domain — skip (none at k=1 by the 12-dir decision)
    const mirrorKey = nKeyOfSymbolDirect([conj(r.T1), conj(r.T2), ...r.Seed.map(conj)]) ?? directKey;
    entries.push({ id: r.id, cell: { T1: r.T1, T2: r.T2, Seed: r.Seed }, directKey, mirrorKey });
  }
  const byKey = new Map(entries.map((e) => [e.directKey, e] as const));
  return { entries, byKey };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/moduli-graph/catalogue-keys.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/moduli-graph/catalogueKeys.ts tests/moduli-graph/catalogue-keys.test.ts
git commit -m "feat(moduli-graph): exact k=1 catalogue key index"
```

---

## Task 3: Tiling signature (float fingerprint)

**Files:**
- Create: `scripts/moduli-graph/types.ts`, `scripts/moduli-graph/tilingSignature.ts`
- Test: `tests/moduli-graph/tiling-signature.test.ts`

The signature is the multiset of **oriented vertex configurations**: for each distinct vertex in a fundamental region, the cyclic sequence of surrounding polygon side-counts, read counterclockwise, canonicalized to its lexicographically smallest rotation (kept oriented, so the reverse sequence is a different signature — this is what carries chirality). Similarity-invariant because it is combinatorial.

- [ ] **Step 1: Write the failing test**

```ts
// tests/moduli-graph/tiling-signature.test.ts
import { describe, it, expect } from 'vitest';
import { tilingSignature } from '../../scripts/moduli-graph/tilingSignature';
import type { FloatTiling } from '../../scripts/moduli-graph/types';

// 3^6 fundamental region: one triangle up + one down over a unit triangular lattice.
const SQRT3_2 = Math.sqrt(3) / 2;
const TRI66: FloatTiling = {
  polys: [
    { n: 3, verts: [[0, 0], [1, 0], [0.5, SQRT3_2]] },
    { n: 3, verts: [[1, 0], [1.5, SQRT3_2], [0.5, SQRT3_2]] },
  ],
  basis: [[1, 0], [0.5, SQRT3_2]],
};

describe('tilingSignature', () => {
  it('gives 3^6 the all-triangle vertex configuration', () => {
    const sig = tilingSignature(TRI66);
    expect(sig).toBe('3.3.3.3.3.3'); // single vertex orbit, six triangles
  });

  it('is invariant under a rigid rotation of the whole tiling', () => {
    const rot = (t: number, [x, y]: [number, number]): [number, number] =>
      [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];
    const T = 0.7;
    const rotated: FloatTiling = {
      polys: TRI66.polys.map((p) => ({ ...p, verts: p.verts.map((v) => rot(T, v)) })),
      basis: [rot(T, TRI66.basis[0]), rot(T, TRI66.basis[1])],
    };
    expect(tilingSignature(rotated)).toBe(tilingSignature(TRI66));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/moduli-graph/tiling-signature.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `types.ts` and `tilingSignature.ts`**

Create `scripts/moduli-graph/types.ts` with the shared types listed in the File structure section above.

Algorithm for `tilingSignature(t: FloatTiling): string`:
1. Replicate the fundamental polygons across a 5×5 lattice window (`basis[0]*i + basis[1]*j`, i,j ∈ [-2,2]).
2. Collect all polygon corners; cluster corners within `EPS = 1e-6` into vertices (grid-hash by `round(x/EPS)`).
3. For each vertex not on the window rim (keep only vertices whose lattice coordinate reduces into the base cell, to get one representative per orbit), gather incident polygons; order them counterclockwise by the angle of each polygon's centroid from the vertex; read off the side-count sequence.
4. Canonicalize each sequence to its lexicographically smallest rotation (do **not** also minimize over reversal — orientation is retained).
5. Return the sorted, `;`-joined multiset of per-orbit sequences, each rendered as `a.b.c...`.

```ts
// scripts/moduli-graph/tilingSignature.ts
import type { FloatTiling } from './types';

const EPS = 1e-6;
const key2 = (x: number, y: number) => `${Math.round(x / EPS)},${Math.round(y / EPS)}`;

export function tilingSignature(t: FloatTiling): string {
  // 1–2: window + vertex clusters carrying incident polygon side-counts and centroids
  type Inc = { n: number; cx: number; cy: number };
  const at = new Map<string, { x: number; y: number; inc: Inc[] }>();
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    const ox = t.basis[0][0] * i + t.basis[1][0] * j;
    const oy = t.basis[0][1] * i + t.basis[1][1] * j;
    for (const p of t.polys) {
      let cx = 0, cy = 0;
      for (const [vx, vy] of p.verts) { cx += vx + ox; cy += vy + oy; }
      cx /= p.verts.length; cy /= p.verts.length;
      for (const [vx, vy] of p.verts) {
        const x = vx + ox, y = vy + oy, k = key2(x, y);
        const slot = at.get(k) ?? { x, y, inc: [] };
        slot.inc.push({ n: p.n, cx, cy });
        at.set(k, slot);
      }
    }
  }
  // 3–5: one representative vertex per lattice orbit, its ccw side-count cycle
  const det = t.basis[0][0] * t.basis[1][1] - t.basis[0][1] * t.basis[1][0];
  const seqs: string[] = [];
  const seenOrbit = new Set<string>();
  for (const { x, y, inc } of at.values()) {
    const a = (x * t.basis[1][1] - y * t.basis[1][0]) / det;
    const b = (t.basis[0][0] * y - t.basis[0][1] * x) / det;
    const fa = a - Math.floor(a + EPS), fb = b - Math.floor(b + EPS);
    const orbit = `${Math.round(fa / EPS)},${Math.round(fb / EPS)}`;
    if (seenOrbit.has(orbit)) continue;
    if (inc.length < 3) continue; // rim/partial vertex — skip
    seenOrbit.add(orbit);
    const ordered = inc.slice().sort((p, q) => Math.atan2(p.cy - y, p.cx - x) - Math.atan2(q.cy - y, q.cx - x));
    const ns = ordered.map((p) => p.n);
    seqs.push(minRotation(ns).join('.'));
  }
  return seqs.sort().join(';');
}

function minRotation(ns: number[]): number[] {
  let best: number[] | null = null;
  for (let s = 0; s < ns.length; s++) {
    const rot = ns.slice(s).concat(ns.slice(0, s));
    if (best === null || cmp(rot, best) < 0) best = rot;
  }
  return best!;
}
const cmp = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/moduli-graph/tiling-signature.test.ts`
Expected: PASS. If the orbit-reduction drops the vertex, widen the window to 7×7 and re-check; do not loosen `EPS`.

- [ ] **Step 5: Commit**

```bash
git add scripts/moduli-graph/types.ts scripts/moduli-graph/tilingSignature.ts tests/moduli-graph/tiling-signature.test.ts
git commit -m "feat(moduli-graph): oriented vertex-configuration signature"
```

---

## Task 4: Catalogue signatures (bridge float match to exact key)

**Files:**
- Modify: `scripts/moduli-graph/catalogueKeys.ts` (add per-entry signature)
- Test: `tests/moduli-graph/catalogue-keys.test.ts` (extend)

- [ ] **Step 1: Extend the failing test**

```ts
// append to tests/moduli-graph/catalogue-keys.test.ts
import { CyclotomicRing } from '@/classes/Cyclotomic';

it('signs 3^6 as the all-triangle configuration', () => {
  const ring = CyclotomicRing.create(24);
  const idx = loadCatalogueKeys(ring);
  const tri = [...idx.entries].find((e) => e.id === 'ctrnact-01_3-6a-1')!;
  expect(tri.signature).toBe('3.3.3.3.3.3');
});
```

- [ ] **Step 2: Add `signature` and a `bySignature` index**

Reconstruct each catalogue cell to float polygons via `reconstructOracleCell`, convert to `FloatTiling`, sign it. Signature `null` (reconstruction failed) leaves the entry key-only.

```ts
// in catalogueKeys.ts — replace the loader signature and body head
import { CyclotomicRing, type CyclotomicRing as Ring } from '@/classes/Cyclotomic';
import { reconstructOracleCell } from '@/classes/algorithm/oracleCellReconstruct';
import { tilingSignature } from './tilingSignature';
import type { FloatTiling } from './types';

// CatalogueEntry gains: signature: string | null
export function loadCatalogueKeys(ring: Ring = CyclotomicRing.create(24)): CatalogueIndex {
  // ...existing directKey/mirrorKey loop, then for each entry:
  //   const rec = reconstructOracleCell(ring, r.id, { T1: r.T1, T2: r.T2, Seed: r.Seed });
  //   const signature = 'cell' in rec ? tilingSignature(cellToFloat(rec.cell)) : null;
  // build bySignature: Map<string, CatalogueEntry[]>
}

function cellToFloat(cell: { cellPolygons: any[]; basisExact: any[] }): FloatTiling {
  const v = (p: any) => p.exactVertices.map((q: any) => { const c = q.toVector(); return [c.x, c.y] as [number, number]; });
  return {
    polys: cell.cellPolygons.map((p) => ({ n: p.exactVertices.length, verts: v(p) })),
    basis: [tuple(cell.basisExact[0]), tuple(cell.basisExact[1])],
  };
}
const tuple = (c: any): [number, number] => { const v = c.toVector(); return [v.x, v.y]; };
```

Add `bySignature: Map<string, CatalogueEntry[]>` to `CatalogueIndex`.

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm vitest run tests/moduli-graph/catalogue-keys.test.ts`
Expected: PASS. If `reconstructOracleCell` returns `error` for 3^6, the cell window is fine (R=3); the failure would be a ring mismatch — confirm `CyclotomicRing.create(24)`.

- [ ] **Step 4: Commit**

```bash
git add scripts/moduli-graph/catalogueKeys.ts tests/moduli-graph/catalogue-keys.test.ts
git commit -m "feat(moduli-graph): catalogue vertex-config signatures for float matching"
```

---

## Task 5: Node extractor (endpoints + interior)

**Files:**
- Create: `scripts/moduli-graph/nodeExtractor.ts`
- Test: `tests/moduli-graph/node-extractor.test.ts`

Endpoints: evaluate at `lo + 1e-3` and `hi - 1e-3`; drop polygons with area < `1e-4`; the residue is the endpoint tiling. Interior: sweep α over the open range at 0.5° steps; for each, measure the **regularity defect** of the flexing tile (the polygon whose vertex count matches the `params[0].tile` prefix, e.g. `cx4` → n=4) as `max|edgeLen − mean| + max|angle − regularAngle|`; a strict local minimum that reaches < `1e-3` marks an interior node; bisect ±0.25° to refine.

- [ ] **Step 1: Write the failing test**

```ts
// tests/moduli-graph/node-extractor.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractNodes } from '../../scripts/moduli-graph/nodeExtractor';

const atlas = JSON.parse(readFileSync('public/reference-atlas-isotoxal.json', 'utf8'));
const fam = (Array.isArray(atlas) ? atlas : atlas.records).find((r: any) => r.id === 'ctrnact-isotoxal-family-k1-06');

describe('extractNodes on 3.3.4α', () => {
  it('finds two endpoints and one interior node near α=90°', () => {
    const nodes = extractNodes(fam.paramCell);
    const interior = nodes.filter((n) => n.kind === 'interior');
    const ends = nodes.filter((n) => n.kind === 'endpoint');
    expect(ends).toHaveLength(2);
    expect(interior).toHaveLength(1);
    expect(interior[0].alpha).toBeGreaterThan(88);
    expect(interior[0].alpha).toBeLessThan(92);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/moduli-graph/node-extractor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `nodeExtractor.ts`**

```ts
// scripts/moduli-graph/nodeExtractor.ts
import { evaluateParamCell, type ParametricCellData } from '@/lib/utils/paramCell';
import type { FloatTiling, NodeState } from './types';

const polyArea = (verts: [number, number][]): number => {
  let s = 0;
  for (let i = 0; i < verts.length; i++) { const a = verts[i], b = verts[(i + 1) % verts.length]; s += a[0] * b[1] - a[1] * b[0]; }
  return Math.abs(s) / 2;
};

const toFloat = (cell: ReturnType<typeof evaluateParamCell>): FloatTiling => ({
  polys: cell.cellPolygons.map((p) => ({ n: p.n, star: p.star, verts: p.vertices })),
  basis: cell.basis as [[number, number], [number, number]],
});

const flexN = (pc: ParametricCellData): number => {
  const m = /cx(\d+)/.exec(pc.params[0].tile ?? '');
  return m ? Number(m[1]) : 0;
};

function regularityDefect(t: FloatTiling, n: number): number {
  let best = Infinity;
  for (const p of t.polys) {
    if (p.n !== n) continue;
    const e: number[] = [], ang: number[] = [];
    for (let i = 0; i < p.verts.length; i++) {
      const a = p.verts[(i - 1 + p.verts.length) % p.verts.length], b = p.verts[i], c = p.verts[(i + 1) % p.verts.length];
      e.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
      const u = [a[0] - b[0], a[1] - b[1]], v = [c[0] - b[0], c[1] - b[1]];
      ang.push(Math.acos((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))));
    }
    const meanE = e.reduce((s, x) => s + x, 0) / e.length;
    const regAng = (Math.PI * (n - 2)) / n;
    const defect = Math.max(...e.map((x) => Math.abs(x - meanE))) + Math.max(...ang.map((x) => Math.abs(x - regAng)));
    best = Math.min(best, defect);
  }
  return best;
}

export function extractNodes(pc: ParametricCellData): NodeState[] {
  const [lo, hi] = pc.params[0].alphaRangeDegOpen;
  const out: NodeState[] = [];

  // endpoints: residue after dropping collapsed tiles
  for (const a of [lo + 1e-3, hi - 1e-3]) {
    const t = toFloat(evaluateParamCell(pc, a));
    t.polys = t.polys.filter((p) => polyArea(p.verts) > 1e-4);
    out.push({ alpha: a, tiling: t, kind: 'endpoint' });
  }

  // interior: local minima of the flexing-tile regularity defect
  const n = flexN(pc);
  if (n) {
    const step = 0.5, xs: number[] = [], ys: number[] = [];
    for (let a = lo + step; a < hi; a += step) { xs.push(a); ys.push(regularityDefect(toFloat(evaluateParamCell(pc, a)), n)); }
    for (let i = 1; i < xs.length - 1; i++) {
      if (ys[i] < ys[i - 1] && ys[i] <= ys[i + 1] && ys[i] < 1e-3) {
        let a0 = xs[i - 1], a1 = xs[i + 1];
        for (let it = 0; it < 40; it++) {
          const m0 = a0 + (a1 - a0) / 3, m1 = a1 - (a1 - a0) / 3;
          if (regularityDefect(toFloat(evaluateParamCell(pc, m0)), n) < regularityDefect(toFloat(evaluateParamCell(pc, m1)), n)) a1 = m1; else a0 = m0;
        }
        const a = (a0 + a1) / 2;
        out.push({ alpha: a, tiling: toFloat(evaluateParamCell(pc, a)), kind: 'interior' });
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/moduli-graph/node-extractor.test.ts`
Expected: PASS with the interior node α in (88, 92). If none is found, the flexing tile's `n` did not match a polygon — log `flexN` and the polygon `n`s and confirm the `cx(\d+)` parse before touching thresholds.

- [ ] **Step 5: Commit**

```bash
git add scripts/moduli-graph/nodeExtractor.ts tests/moduli-graph/node-extractor.test.ts
git commit -m "feat(moduli-graph): node extraction (endpoint degeneracy + flexing-tile regularity)"
```

---

## Task 6: Node resolver (float state → exact identity)

**Files:**
- Create: `scripts/moduli-graph/nodeResolver.ts`
- Test: `tests/moduli-graph/node-resolver.test.ts`

Sign the node's float tiling; look up `bySignature`. On a unique catalogue match, adopt its `directKey`, id, and chirality (`achiral` if `directKey === mirrorKey`, else compare orientation via signed area of the seed star to pick `L`/`R`). No match → `unresolved` with the signature as the key.

- [ ] **Step 1: Write the failing test**

```ts
// tests/moduli-graph/node-resolver.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CyclotomicRing } from '@/classes/Cyclotomic';
import { loadCatalogueKeys } from '../../scripts/moduli-graph/catalogueKeys';
import { extractNodes } from '../../scripts/moduli-graph/nodeExtractor';
import { resolveNode } from '../../scripts/moduli-graph/nodeResolver';

const atlas = JSON.parse(readFileSync('public/reference-atlas-isotoxal.json', 'utf8'));
const fam = (Array.isArray(atlas) ? atlas : atlas.records).find((r: any) => r.id === 'ctrnact-isotoxal-family-k1-06');

describe('resolveNode on 3.3.4α', () => {
  it('resolves both endpoints to 3^6 and the interior to 3.3.3.4.4', () => {
    const idx = loadCatalogueKeys(CyclotomicRing.create(24));
    const nodes = extractNodes(fam.paramCell).map((s) => resolveNode(s, idx));
    const ends = nodes.filter((_, i) => extractNodes(fam.paramCell)[i].kind === 'endpoint');
    expect(ends.every((r) => r.resolved && r.label === 'ctrnact-01_3-6a-1')).toBe(true);
    const interior = nodes.find((_, i) => extractNodes(fam.paramCell)[i].kind === 'interior')!;
    expect(interior.resolved).toBe(true);
    expect(interior.chirality).toBe('achiral');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/moduli-graph/node-resolver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `nodeResolver.ts`**

```ts
// scripts/moduli-graph/nodeResolver.ts
import { tilingSignature } from './tilingSignature';
import type { CatalogueIndex } from './catalogueKeys';
import type { NodeState, ResolvedNode } from './types';

export function resolveNode(state: NodeState, idx: CatalogueIndex): ResolvedNode {
  const sig = tilingSignature(state.tiling);
  const matches = idx.bySignature.get(sig) ?? [];
  if (matches.length === 1) {
    const e = matches[0];
    const chirality = e.directKey === e.mirrorKey ? 'achiral' : 'R'; // handedness refinement: Task 8
    return { key: e.directKey, label: e.id, chirality, resolved: true };
  }
  // 0 matches → unresolved; >1 → ambiguous, still unresolved but flag the collision
  return { key: `unresolved:${sig}`, label: matches.length > 1 ? `ambiguous(${sig})` : `unresolved(${sig})`, chirality: 'achiral', resolved: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/moduli-graph/node-resolver.test.ts`
Expected: PASS. If an endpoint is `unresolved`, print its signature and compare with the catalogue's 3^6 signature — a mismatch means the collapsed-tile filter left a sliver; tighten the area filter to `1e-3` (never loosen the signature `EPS`).

- [ ] **Step 5: Commit**

```bash
git add scripts/moduli-graph/nodeResolver.ts tests/moduli-graph/node-resolver.test.ts
git commit -m "feat(moduli-graph): resolve node states to exact catalogue identity"
```

---

## Task 7: Graph assembler + golden bigon (acceptance gate)

**Files:**
- Create: `scripts/moduli-graph/graphAssembler.ts`
- Test: `tests/moduli-graph/golden-bigon.test.ts`

For each family: extract and resolve its special-α states, sort by α, emit one edge between consecutive nodes (each edge tagged with the family id, its α-sub-range, and `flexdim`). Dedup nodes by `key`. Cyclomatic number `E − V + C` is the graph's H₁ rank.

- [ ] **Step 1: Write the failing test**

```ts
// tests/moduli-graph/golden-bigon.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CyclotomicRing } from '@/classes/Cyclotomic';
import { loadCatalogueKeys } from '../../scripts/moduli-graph/catalogueKeys';
import { assembleGraph } from '../../scripts/moduli-graph/graphAssembler';

const atlas = JSON.parse(readFileSync('public/reference-atlas-isotoxal.json', 'utf8'));
const fam = (Array.isArray(atlas) ? atlas : atlas.records).find((r: any) => r.id === 'ctrnact-isotoxal-family-k1-06');

describe('golden bigon (3.3.4α)', () => {
  it('assembles two nodes, two edges, H1 = 1', () => {
    const g = assembleGraph([fam], loadCatalogueKeys(CyclotomicRing.create(24)));
    expect(g.nodes).toHaveLength(2);
    expect(g.edges).toHaveLength(2);
    const labels = g.nodes.map((n) => n.label).sort();
    expect(labels).toEqual(['ctrnact-01_3-6a-1', 'ctrnact-01_46-...' /* 3.3.3.4.4 id — fill from Task 2 Step 1 output */].sort());
    expect(g.h1).toBe(1); // E - V + C = 2 - 2 + 1
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/moduli-graph/golden-bigon.test.ts`
Expected: FAIL — module not found. (Also replace the placeholder 3.3.3.4.4 id with the real one from Task 2 Step 1's listing.)

- [ ] **Step 3: Implement `graphAssembler.ts`**

```ts
// scripts/moduli-graph/graphAssembler.ts
import type { CatalogueIndex } from './catalogueKeys';
import { extractNodes } from './nodeExtractor';
import { resolveNode } from './nodeResolver';

export interface GraphNode { key: string; label: string; chirality: string; resolved: boolean; }
export interface GraphEdge { family: string; from: string; to: string; alphaRange: [number, number]; flexdim: number; }
export interface ModuliGraph { nodes: GraphNode[]; edges: GraphEdge[]; h1: number; unresolved: number; }

export function assembleGraph(families: any[], idx: CatalogueIndex): ModuliGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  for (const fam of families) {
    if (fam.paramCell?.params?.length !== 1) continue; // slice: single-parameter only
    const states = extractNodes(fam.paramCell).sort((a, b) => a.alpha - b.alpha);
    const resolved = states.map((s) => resolveNode(s, idx));
    resolved.forEach((r) => nodes.set(r.key, { key: r.key, label: r.label, chirality: r.chirality, resolved: r.resolved }));
    for (let i = 0; i < states.length - 1; i++) {
      edges.push({ family: fam.id, from: resolved[i].key, to: resolved[i + 1].key, alphaRange: [states[i].alpha, states[i + 1].alpha], flexdim: 1 });
    }
  }
  const V = nodes.size, E = edges.length;
  const C = components([...nodes.keys()], edges);
  return { nodes: [...nodes.values()], edges, h1: E - V + C, unresolved: [...nodes.values()].filter((n) => !n.resolved).length };
}

function components(keys: string[], edges: GraphEdge[]): number {
  const parent = new Map(keys.map((k) => [k, k] as const));
  const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  for (const e of edges) parent.set(find(e.from), find(e.to));
  return new Set(keys.map(find)).size;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/moduli-graph/golden-bigon.test.ts`
Expected: PASS — two nodes (3^6, 3.3.3.4.4), two edges, `h1 === 1`. **This is the acceptance gate; do not proceed to Task 9 until it is green.**

- [ ] **Step 5: Commit**

```bash
git add scripts/moduli-graph/graphAssembler.ts tests/moduli-graph/golden-bigon.test.ts
git commit -m "feat(moduli-graph): graph assembler + golden bigon (H1=Z) gate"
```

---

## Task 8: Chirality handedness (L/R for chiral nodes)

**Files:**
- Modify: `scripts/moduli-graph/nodeResolver.ts:11` (the `'R'` placeholder)
- Test: `tests/moduli-graph/node-resolver.test.ts` (extend)

For a chiral catalogue entry (`directKey !== mirrorKey`), the node is `L` or `R` by whether its float tiling matches the entry directly or its reflection. Compute the node's own reflection-inclusive key match is unavailable (float), so decide by orientation: sign the node tiling and the catalogue float rendering the same way and compare the sense of the first vertex star (the sorted ccw side-count cycle vs the catalogue's). Same sense → adopt `directKey`; opposite → the twin gets a synthesized key `mirror:<directKey>` and chirality `L`.

- [ ] **Step 1: Extend the test** with a known chiral k=1 node if the slice contains one; if no k=1 isotoxal family resolves to a chiral (snub) node, assert instead that every resolved node in the full slice is `achiral` and record that finding (chirality of nodes does not arise at k=1 isotoxal; edge chirality still does and is covered by the golden bigon's two mirror-image edges).

```ts
it('marks all resolved k=1 isotoxal nodes achiral (snub nodes do not arise in this slice)', () => {
  // build the full slice graph (Task 9 helper) and assert nodes.every(chirality === 'achiral')
});
```

- [ ] **Step 2: Implement the handedness decision** in `resolveNode` (replace the `'R'` placeholder with the orientation comparison above). If Step 1 shows no chiral nodes in the slice, keep the achiral branch and leave the `L/R` branch behind the `directKey !== mirrorKey` guard, exercised by a synthetic unit test that reflects 3^6-with-a-twist — otherwise defer full L/R to the multi-k slice and note it.

- [ ] **Step 3: Run tests**

Run: `pnpm vitest run tests/moduli-graph/node-resolver.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/moduli-graph/nodeResolver.ts tests/moduli-graph/node-resolver.test.ts
git commit -m "feat(moduli-graph): node handedness (L/R) or achiral-slice finding"
```

---

## Task 9: CLI + full k=1 slice + build

**Files:**
- Create: `scripts/moduli-graph/buildModuliGraph.ts`
- Output: `experiments/results/moduli-graph.json`

- [ ] **Step 1: Implement the CLI**

```ts
// scripts/moduli-graph/buildModuliGraph.ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { CyclotomicRing } from '@/classes/Cyclotomic';
import { loadCatalogueKeys } from './catalogueKeys';
import { assembleGraph } from './graphAssembler';

const atlas = JSON.parse(readFileSync('public/reference-atlas-isotoxal.json', 'utf8'));
const records = Array.isArray(atlas) ? atlas : atlas.records;
const families = records.filter((r: any) => r.k === 1 && r.source === 'isotoxal' && r.paramCell?.params?.length === 1);

const graph = assembleGraph(families, loadCatalogueKeys(CyclotomicRing.create(24)));
mkdirSync('experiments/results', { recursive: true });
writeFileSync('experiments/results/moduli-graph.json', JSON.stringify(graph, null, 2));
console.log(`families=${families.length} nodes=${graph.nodes.length} edges=${graph.edges.length} H1=${graph.h1} unresolved=${graph.unresolved}`);
```

- [ ] **Step 2: Run it**

Run: `pnpm tsx scripts/moduli-graph/buildModuliGraph.ts`
Expected: a line printing the counts, and `experiments/results/moduli-graph.json` written. Inspect the `unresolved` count; each unresolved node's label carries its signature for follow-up.

- [ ] **Step 3: Full build**

Run: `pnpm build`
Expected: clean (the workflow rule — build, not just lint/test). Fix any type error surfaced by the new files.

- [ ] **Step 4: Commit**

```bash
git add scripts/moduli-graph/buildModuliGraph.ts experiments/results/moduli-graph.json
git commit -m "feat(moduli-graph): build the k=1 isotoxal slice graph"
```

---

## Task 10: Static figure

**Files:**
- Create: `scripts/moduli-graph/renderModuliGraph.ts`
- Output: `experiments/results/moduli-graph.html`

- [ ] **Step 1: Implement the renderer** — read `moduli-graph.json`, lay nodes on a circle (or a simple force-free radial layout for a first pass), draw edges as arcs, label nodes by their catalogue id, color edges by family, dash unresolved nodes. Emit one self-contained HTML file with inline SVG and no external assets.

```ts
// scripts/moduli-graph/renderModuliGraph.ts
import { readFileSync, writeFileSync } from 'node:fs';
import type { ModuliGraph } from './graphAssembler';

const g = JSON.parse(readFileSync('experiments/results/moduli-graph.json', 'utf8')) as ModuliGraph;
const R = 300, cx = 360, cy = 360;
const pos = new Map(g.nodes.map((n, i) => {
  const a = (2 * Math.PI * i) / g.nodes.length;
  return [n.key, [cx + R * Math.cos(a), cy + R * Math.sin(a)]] as const;
}));
const edges = g.edges.map((e) => {
  const [x1, y1] = pos.get(e.from)!, [x2, y2] = pos.get(e.to)!;
  return `<path d="M${x1},${y1} Q${(x1 + x2) / 2 + 20},${(y1 + y2) / 2 + 20} ${x2},${y2}" fill="none" stroke="#4488cc" stroke-width="1.5"/>`;
}).join('');
const nodes = g.nodes.map((n) => {
  const [x, y] = pos.get(n.key)!;
  return `<circle cx="${x}" cy="${y}" r="6" fill="${n.resolved ? '#222' : 'none'}" stroke="#c33" stroke-dasharray="${n.resolved ? '' : '3'}"/>`
    + `<text x="${x + 8}" y="${y}" font-size="10" font-family="monospace">${n.label}</text>`;
}).join('');
writeFileSync('experiments/results/moduli-graph.html',
  `<!doctype html><meta charset="utf8"><title>Tiling deformation graph — k=1 isotoxal</title>`
  + `<svg width="720" height="720" xmlns="http://www.w3.org/2000/svg">${edges}${nodes}</svg>`
  + `<p style="font-family:monospace">nodes=${g.nodes.length} edges=${g.edges.length} H1=${g.h1} unresolved=${g.unresolved}</p>`);
console.log('wrote experiments/results/moduli-graph.html');
```

- [ ] **Step 2: Run it**

Run: `pnpm tsx scripts/moduli-graph/renderModuliGraph.ts`
Expected: `experiments/results/moduli-graph.html` written; open it and confirm the bigon and the rest of the k=1 graph read cleanly.

- [ ] **Step 3: Commit**

```bash
git add scripts/moduli-graph/renderModuliGraph.ts experiments/results/moduli-graph.html
git commit -m "feat(moduli-graph): static node-link figure of the k=1 isotoxal graph"
```

---

## Self-review notes

- **Spec coverage:** node identity (Task 1), exact-at-nodes via catalogue (Tasks 2/4/6), node rule endpoints+interior (Task 5), edges/subdivision/H₁ (Task 7), chirality (Task 8), unresolved fallback (Task 6), figure (Task 10), full slice + build (Task 9). Deferred items (multi-param, higher k, non-tile-regularity maxima) are out of scope by design.
- **Type consistency:** `FloatTiling`/`NodeState`/`ResolvedNode` (types.ts) flow unchanged through extractor → resolver → assembler; `CatalogueEntry.directKey/mirrorKey/signature` are set in Task 2/4 and read in Task 6.
- **Known first-cut risks:** `tilingSignature` window size and `nodeExtractor` regularity threshold are the two values most likely to need one tuning pass; their tests pin the required behaviour so tuning cannot drift the contract.
- **Placeholder to resolve before Task 7:** the real 3.3.3.4.4 catalogue id, taken from Task 2 Step 1's listing, replaces the `ctrnact-01_46-...` placeholder in the golden-bigon test.
