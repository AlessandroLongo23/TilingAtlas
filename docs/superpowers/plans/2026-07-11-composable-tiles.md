# Composable Tiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete finite family of convex unit-edge "composable" polygons (unions of regular {3,4,6,12} tiles) to the Čtrnáct engine and run it at k=1 as a palette-agnosticism demo — combinatorial catalog + counts, plus per-family size tables.

**Architecture:** A TS generator builds the family by exact ℤ[ζ₁₂] tile-gluing BFS and emits a `composite12` palette JSON (regular {3,4,6,12} + all composites). The Python alphabet generator (`gen_alphabet.py`) gains a `composite` tile kind with arbitrary boundary period p (adds a `CLASS_PREV` table, drops the `p≤2` assert). The C++ solver's face-check (`checkpart`) gains direction-locking so mirror-placed period-p>2 tiles verify correctly. Then `PALETTE=composite12 ./run-oracle.sh 1` produces the k=1 count; develop is skipped (counts only).

**Tech Stack:** TypeScript (`tsx` + Vitest, exact `Cyclotomic`/`Polygon`), Python 3 (`gen_alphabet.py`), C++17 (`eu_solver.cpp`), Make + bash.

**Spec:** `docs/superpowers/specs/2026-07-11-composable-tiles-design.md`. Read it first — especially "What this is NOT": decomposition ambiguity means the k=1 count here is NOT an "all and only" count and must never touch the exhaustiveness claim.

---

## File structure

Created:
- `lib/classes/algorithm/composable/Polyform.ts` — a connected set of exact placed regular tiles; boundary half-edges, congruence-canonical key, convex-angle-word readout, gluing. Pure geometry, no `node:fs`.
- `lib/classes/algorithm/composable/generateFamily.ts` — the gluing BFS; returns the family (canonical angle-words + names) and the per-family size table.
- `scripts/gen-composable-family.ts` — CLI: run the BFS, print Table A, write `composite12.json`. Uses `node:fs`, server-only.
- `tests/composable-family.test.ts` — Vitest for `Polyform` + `generateFamily`.
- `tools/ctrnact-oracle/alphabets/palettes/composite12.json` — generated palette (regular + composites).
- `tools/ctrnact-oracle/alphabets/report_growth.py` — Table B (alphabet growth) instrumentation.

Modified:
- `tools/ctrnact-oracle/alphabets/gen_alphabet.py` — composite tile kind, `prev_class`, `CLASS_PREV` emission, relaxed assert, systematic naming for composite corner classes.
- `tools/ctrnact-oracle/eu_solver.cpp:239-277` — `checkpart` direction-locking; `#include`/use `CLASS_PREV`.
- `tools/ctrnact-oracle/eu_pruner.cpp` — verify; patch only if it walks tile boundaries.

Key interfaces (locked here, referenced by every task):
- `class Polyform { tiles: RegularPolygon[]; boundaryHalfEdges(): HalfEdge[]; glue(n: number): Polyform[]; canonicalKey(): string; convexAngleWord(): number[] | null; tileCounts(): Map<number, number>; }`
- `type HalfEdge = { startKey: string; endKey: string; start: Cyclotomic; end: Cyclotomic; dir: number };`
- `generateFamily(maxTiles: number): { tiles: CompositeTile[]; table: FamilyRow[] }`
- `type CompositeTile = { angles: number[]; name: string; sides: number; tileCounts: Record<number, number> };`
- `type FamilyRow = { sides: number; numTiles: number; numCornerClasses: number };`

---

## Task 1: Ring + single-tile placement smoke test

Establishes the exact ℤ[ζ₁₂] ring and the tile primitive the whole generator stands on.

**Files:**
- Test: `tests/composable-family.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { CyclotomicRing, Cyclotomic } from '@/classes';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';

const ring = CyclotomicRing.create(12);
const origin = Cyclotomic.fromRational(ring, 0n); // exact 0 (confirmed: no Cyclotomic.zero)

describe('exact tile primitive', () => {
  it('places a unit triangle with three 60° (=2 unit) corners', () => {
    const t = RegularPolygon.fromAnchorAndDirExact(3, origin, 0);
    expect(t.exactVertices!.length).toBe(3);
    expect([0, 1, 2].map(i => t.cornerAngleUnits(i))).toEqual([2, 2, 2]);
  });
  it('places a unit square with four 90° (=3 unit) corners', () => {
    const s = RegularPolygon.fromAnchorAndDirExact(4, origin, 0);
    expect([0, 1, 2, 3].map(i => s.cornerAngleUnits(i))).toEqual([3, 3, 3, 3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/composable-family.test.ts`
Expected: FAIL only if `cornerAngleUnits` or the import paths are wrong. `Cyclotomic.fromRational(ring, 0n)` and the `@/classes` barrel exports of `Cyclotomic`/`CyclotomicRing` are confirmed to exist. If `@/classes/polygons/RegularPolygon` does not resolve, import `RegularPolygon` from the `@/classes` barrel instead.

- [ ] **Step 3: Make it pass**

No production code — this task pins the confirmed primitive API (exact ring, tile placement, `cornerAngleUnits`). If anything fails, it is an import-path fix, not new logic.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/composable-family.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/composable-family.test.ts
git commit -m "test(composable): pin exact ℤ[ζ12] tile primitive"
```

---

## Task 2: Polyform — boundary half-edges

A `Polyform` is a list of exact placed tiles. Its boundary is the set of tile edges whose reverse edge is not also present (shared internal edges cancel).

**Files:**
- Create: `lib/classes/algorithm/composable/Polyform.ts`
- Test: `tests/composable-family.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { Polyform } from '@/classes/algorithm/composable/Polyform';
// ... ring, origin as in Task 1

describe('Polyform boundary', () => {
  it('a single triangle has 3 boundary half-edges', () => {
    const pf = new Polyform([RegularPolygon.fromAnchorAndDirExact(3, origin, 0)]);
    expect(pf.boundaryHalfEdges().length).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/composable-family.test.ts -t "boundary"`
Expected: FAIL — cannot find module `Polyform`.

- [ ] **Step 3: Implement `Polyform` + `boundaryHalfEdges`**

```ts
import { Cyclotomic } from '@/classes';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';

export type HalfEdge = { startKey: string; endKey: string; start: Cyclotomic; end: Cyclotomic; dir: number };

export class Polyform {
  constructor(public readonly tiles: RegularPolygon[]) {}

  /** All directed unit edges of all tiles (CCW), keyed by exact endpoints. */
  private allHalfEdges(): HalfEdge[] {
    const out: HalfEdge[] = [];
    for (const t of this.tiles) {
      const v = t.exactVertices!;
      const d = t.edgeDirs!;
      for (let i = 0; i < v.length; i++) {
        const a = v[i], b = v[(i + 1) % v.length];
        out.push({ startKey: a.key(), endKey: b.key(), start: a, end: b, dir: d[i] });
      }
    }
    return out;
  }

  /** Boundary = edges whose reverse (endKey,startKey) is absent (shared edges cancel). */
  boundaryHalfEdges(): HalfEdge[] {
    const present = new Set(this.allHalfEdges().map(e => `${e.startKey}|${e.endKey}`));
    return this.allHalfEdges().filter(e => !present.has(`${e.endKey}|${e.startKey}`));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/composable-family.test.ts -t "boundary"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/classes/algorithm/composable/Polyform.ts tests/composable-family.test.ts
git commit -m "feat(composable): Polyform boundary half-edge extraction"
```

---

## Task 3: Polyform — glue a regular tile onto each boundary edge

Gluing places a unit regular n-gon on the exterior side of a boundary half-edge (A→B): anchor B, first direction reversed (`dir+6 mod 12`), so the new tile is CCW on the exterior. Reject placements that properly overlap an existing tile (exact predicate).

**Files:**
- Modify: `lib/classes/algorithm/composable/Polyform.ts`
- Test: `tests/composable-family.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('Polyform glue', () => {
  it('gluing a triangle onto a triangle yields a 4-tile-edge rhombus (2 tiles)', () => {
    const tri = new Polyform([RegularPolygon.fromAnchorAndDirExact(3, origin, 0)]);
    const grown = tri.glue(3);                       // all triangle-gluings, deduped by shape
    // every result has 2 tiles and a 4-edge boundary (rhombus) — triangles glue one way up to congruence
    expect(grown.every(pf => pf.tiles.length === 2)).toBe(true);
    expect(grown.some(pf => pf.boundaryHalfEdges().length === 4)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/composable-family.test.ts -t "glue"`
Expected: FAIL — `pf.glue is not a function`.

- [ ] **Step 3: Implement `glue`**

```ts
import { exactPolygonsOverlap } from '@/classes/algorithm/exact/exactOverlap';

// inside class Polyform:
/** All ways to attach one unit regular n-gon across a boundary edge, overlap-rejected. */
glue(n: number): Polyform[] {
  const ring = this.tiles[0].ring!;
  const out: Polyform[] = [];
  for (const e of this.boundaryHalfEdges()) {
    const revDir = ((e.dir + ring.N / 2) % ring.N + ring.N) % ring.N; // +6 mod 12: B->A
    const nu = RegularPolygon.fromAnchorAndDirExact(n, e.end, revDir);
    const overlaps = this.tiles.some(t =>
      exactPolygonsOverlap(nu.exactVertices!, t.exactVertices!));      // proper overlap; edge-sharing is NOT overlap
    if (!overlaps) out.push(new Polyform([...this.tiles, nu]));
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/composable-family.test.ts -t "glue"`
Expected: PASS. (If `exactPolygonsOverlap`'s signature differs, read `lib/classes/algorithm/exact/exactOverlap.ts` and adapt the call — it must be the *proper*-overlap predicate so a shared glue edge is not a false positive.)

- [ ] **Step 5: Commit**

```bash
git add lib/classes/algorithm/composable/Polyform.ts tests/composable-family.test.ts
git commit -m "feat(composable): glue regular tiles onto boundary edges, exact overlap-reject"
```

---

## Task 4: Polyform — congruence-canonical key (dedup)

Two polyforms are the same shape iff congruent (24 grid symmetries × translation). Canonical key = min over all symmetries of the translation-normalized sorted tile keys.

**Files:**
- Modify: `lib/classes/algorithm/composable/Polyform.ts`
- Test: `tests/composable-family.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('Polyform canonicalKey', () => {
  it('a rhombus built from edge A equals one built from edge B (same shape)', () => {
    const tri = new Polyform([RegularPolygon.fromAnchorAndDirExact(3, origin, 0)]);
    const grown = tri.glue(3);
    const keys = new Set(grown.map(pf => pf.canonicalKey()));
    expect(keys.size).toBe(1);                       // all triangle+triangle glues are one rhombus
  });
  it('a rhombus and a square are different shapes', () => {
    const rhombus = new Polyform([RegularPolygon.fromAnchorAndDirExact(3, origin, 0)]).glue(3)[0];
    const square = new Polyform([RegularPolygon.fromAnchorAndDirExact(4, origin, 0)]);
    expect(rhombus.canonicalKey()).not.toBe(square.canonicalKey());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/composable-family.test.ts -t "canonicalKey"`
Expected: FAIL — `pf.canonicalKey is not a function`.

- [ ] **Step 3: Implement `canonicalKey`**

```ts
// inside class Polyform:
/** Congruence-invariant key: min over the 24 grid isometries of the translation-normalized
 *  sorted per-tile exactKeys. transformedRigid('exact') gives a fresh transformed tile with no
 *  float rebuild; translateExact re-anchors to a canonical origin before keying. */
canonicalKey(): string {
  const ring = this.tiles[0].ring!;
  const zero = this.tiles[0].exactVertices![0].sub(this.tiles[0].exactVertices![0]); // exact 0
  let best: string | null = null;
  for (const reflect of [false, true]) {
    for (let rotK = 0; rotK < ring.N; rotK++) {
      const moved = this.tiles.map(t =>
        t.transformedRigid(zero, reflect, 0, rotK, zero, 'exact') as RegularPolygon);
      // canonical translation: subtract the lexicographically-min vertex over all tiles
      let anchor: Cyclotomic | null = null, anchorKey = '';
      for (const t of moved) for (const v of t.exactVertices!) {
        const k = v.key();
        if (anchor === null || k < anchorKey) { anchor = v; anchorKey = k; }
      }
      const negAnchor = zero.sub(anchor!);
      const parts = moved
        .map(t => (t.translateExact(negAnchor) as RegularPolygon).exactKey())
        .sort();
      const key = parts.join('#');
      if (best === null || key < best) best = key;
    }
  }
  return best!;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/composable-family.test.ts -t "canonicalKey"`
Expected: PASS (2 tests). If `transformedRigid('exact')` leaves `exactKey()` stale, call `.refreshFloatCacheLite()` is unnecessary (exactKey reads exact fields and clears its memo on transform); if a stale-memo bug appears, construct fresh `RegularPolygon` copies via `clone()` before transforming.

- [ ] **Step 5: Commit**

```bash
git add lib/classes/algorithm/composable/Polyform.ts tests/composable-family.test.ts
git commit -m "feat(composable): congruence-canonical polyform key for dedup"
```

---

## Task 5: Polyform — convex angle-word readout (result filter)

A polyform is a valid composable tile iff its boundary is a single simple loop whose every interior corner is in {2,3,4,5} units (60/90/120/150°). Straight (6) or reflex (>6) corners disqualify it. Returns the cyclic angle-word (canonicalized to its lexicographically-min rotation/reflection) or `null`.

**Files:**
- Modify: `lib/classes/algorithm/composable/Polyform.ts`
- Test: `tests/composable-family.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('Polyform convexAngleWord', () => {
  it('rhombus (2 triangles) -> [2,4,2,4]', () => {
    const rhombus = new Polyform([RegularPolygon.fromAnchorAndDirExact(3, origin, 0)]).glue(3)[0];
    expect(rhombus.convexAngleWord()).toEqual([2, 4, 2, 4]);
  });
  it('a domino (2 squares) -> null (has 180° corners, not unit-edge convex)', () => {
    const domino = new Polyform([RegularPolygon.fromAnchorAndDirExact(4, origin, 0)]).glue(4)[0];
    expect(domino.convexAngleWord()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/composable-family.test.ts -t "convexAngleWord"`
Expected: FAIL — `pf.convexAngleWord is not a function`.

- [ ] **Step 3: Implement `convexAngleWord` (+ a small canonical-rotation helper)**

```ts
// inside class Polyform:
/** Ordered boundary loop of vertex keys, or null if the boundary is not a single simple cycle. */
private boundaryLoop(): HalfEdge[] | null {
  const bs = this.boundaryHalfEdges();
  const byStart = new Map<string, HalfEdge>();
  for (const e of bs) { if (byStart.has(e.startKey)) return null; byStart.set(e.startKey, e); }
  const loop: HalfEdge[] = [];
  let cur = bs[0];
  for (let i = 0; i < bs.length; i++) {
    loop.push(cur);
    const nxt = byStart.get(cur.endKey);
    if (!nxt) return null;
    cur = nxt;
    if (cur === bs[0]) break;
  }
  return loop.length === bs.length ? loop : null;   // single cycle covering every boundary edge
}

/** Interior angle (units of 2π/12) at the turn between two consecutive boundary edges. */
private static interiorUnits(inDir: number, outDir: number, N: number): number {
  const ext = (((outDir - inDir) % N) + N) % N;      // left turn
  return (((N / 2 - ext) % N) + N) % N;              // interior = π − exterior
}

convexAngleWord(): number[] | null {
  const loop = this.boundaryLoop();
  if (!loop) return null;
  const N = this.tiles[0].ring!.N;
  const word: number[] = [];
  for (let i = 0; i < loop.length; i++) {
    const prev = loop[(i - 1 + loop.length) % loop.length];
    const u = Polyform.interiorUnits(prev.dir, loop[i].dir, N);
    if (u < 2 || u > 5) return null;                 // straight (6) or reflex (>6) ⇒ not a composable tile
    word.push(u);
  }
  return Polyform.canonicalCyclicWord(word);
}

/** Lexicographically-min rotation of the word or its reverse (dihedral canonical form). */
static canonicalCyclicWord(w: number[]): number[] {
  const rots = (a: number[]) => a.map((_, s) => a.slice(s).concat(a.slice(0, s)));
  const all = [...rots(w), ...rots([...w].reverse())].map(a => a.join(','));
  const min = all.reduce((m, x) => (x < m ? x : m));
  return min.split(',').map(Number);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/composable-family.test.ts -t "convexAngleWord"`
Expected: PASS (2 tests). The domino returns null because its shared-edge endpoints are 90+90=180° = 6 units.

- [ ] **Step 5: Commit**

```bash
git add lib/classes/algorithm/composable/Polyform.ts tests/composable-family.test.ts
git commit -m "feat(composable): convex angle-word readout + dihedral canonical form"
```

---

## Task 6: The family BFS

Grow polyforms from every seed tile, deduping by `canonicalKey`, capped at `maxTiles`. Collect distinct convex angle-words (the composable tiles). Loop-until-dry on `maxTiles` happens in the CLI (Task 8); this function is the fixed-`maxTiles` core.

**Files:**
- Create: `lib/classes/algorithm/composable/generateFamily.ts`
- Test: `tests/composable-family.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { generateFamily } from '@/classes/algorithm/composable/generateFamily';

describe('generateFamily', () => {
  it('maxTiles=2 yields exactly the rhombus and the house', () => {
    const { tiles } = generateFamily(2);
    const words = tiles.map(t => t.angles.join(',')).sort();
    expect(words).toEqual(['2,4,2,4', '2,5,3,3,5'].sort()); // rhombus, house (canonical forms)
  });
});
```

Note: the house's canonical dihedral form of `[3,5,2,5,3]` is `[2,5,3,3,5]`; if the implementation's canonical form differs, assert against the value `generateFamily` actually returns after confirming by hand that it is the house pentagon (angles 60,150,90,90,150). Keep whichever canonical string the code produces and reuse it verbatim in later assertions.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/composable-family.test.ts -t "generateFamily"`
Expected: FAIL — cannot find module `generateFamily`.

- [ ] **Step 3: Implement `generateFamily`**

```ts
import { CyclotomicRing, Cyclotomic } from '@/classes';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';
import { Polyform } from './Polyform';

const REGULAR_ORDERS = [3, 4, 6, 12];

export type CompositeTile = { angles: number[]; name: string; sides: number; tileCounts: Record<number, number> };
export type FamilyRow = { sides: number; numTiles: number; numCornerClasses: number };

/** Fundamental rotation period of a cyclic word (smallest p | len with w[i]==w[i+p]). */
function period(w: number[]): number {
  const L = w.length;
  for (let p = 1; p <= L; p++) {
    if (L % p) continue;
    if (w.every((x, i) => x === w[(i + p) % L])) return p;
  }
  return L;
}

export function generateFamily(maxTiles: number): { tiles: CompositeTile[]; table: FamilyRow[]; peakFrontier: number } {
  const ring = CyclotomicRing.create(12);
  const origin = Cyclotomic.fromRational(ring, 0n); // exact 0
  const seen = new Set<string>();
  const results = new Map<string, CompositeTile>(); // keyed by canonical angle-word
  let frontier: Polyform[] = REGULAR_ORDERS.map(n =>
    new Polyform([RegularPolygon.fromAnchorAndDirExact(n, origin, 0)]));
  for (const pf of frontier) seen.add(pf.canonicalKey());
  let peak = frontier.length;

  for (let size = 1; size < maxTiles; size++) {
    const next: Polyform[] = [];
    for (const pf of frontier) {
      for (const n of REGULAR_ORDERS) {
        for (const grown of pf.glue(n)) {
          const key = grown.canonicalKey();
          if (seen.has(key)) continue;
          seen.add(key);
          next.push(grown);
          const word = grown.convexAngleWord();
          if (word && grown.tiles.length >= 2 && !isBareRegular(word)) {
            const wkey = word.join(',');
            if (!results.has(wkey)) results.set(wkey, toTile(grown, word));
          }
        }
      }
    }
    frontier = next;
    peak = Math.max(peak, next.length);
    if (next.length === 0) break;
  }
  return { tiles: [...results.values()], table: buildTable([...results.values()]), peakFrontier: peak };
}

/** A convex composite whose word equals a single regular n-gon (all angles equal, n∈{3,4,6,12}). */
function isBareRegular(word: number[]): boolean {
  const uniq = new Set(word);
  if (uniq.size !== 1) return false;
  const u = word[0];
  return (u === 2 && word.length === 3) || (u === 3 && word.length === 4)
      || (u === 4 && word.length === 6) || (u === 5 && word.length === 12);
}

function toTile(pf: Polyform, word: number[]): CompositeTile {
  const counts: Record<number, number> = {};
  for (const t of pf.tiles) counts[t.n] = (counts[t.n] ?? 0) + 1;
  return { angles: word, sides: word.length, name: nameFor(word), tileCounts: counts };
}

/** Stable name: side count + dash + the canonical angle-word (e.g. "cx4-2.4.2.4"). */
function nameFor(word: number[]): string { return `cx${word.length}-${word.join('.')}`; }

function buildTable(tiles: CompositeTile[]): FamilyRow[] {
  const bySides = new Map<number, CompositeTile[]>();
  for (const t of tiles) (bySides.get(t.sides) ?? bySides.set(t.sides, []).get(t.sides)!).push(t);
  return [...bySides.keys()].sort((a, b) => a - b).map(sides => {
    const fam = bySides.get(sides)!;
    return { sides, numTiles: fam.length, numCornerClasses: fam.reduce((s, t) => s + period(t.angles), 0) };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/composable-family.test.ts -t "generateFamily"`
Expected: PASS. If the house's canonical string differs, update the assertion to the produced value (after confirming by hand it is the 60/150/90/90/150 pentagon) and keep it consistent.

- [ ] **Step 5: Commit**

```bash
git add lib/classes/algorithm/composable/generateFamily.ts tests/composable-family.test.ts
git commit -m "feat(composable): family BFS with dedup, convex+bare-regular filters, family table"
```

---

## Task 7: `period` unit test (locks the corner-class count the palette will use)

`period` is also what `gen_alphabet.py` will recompute; pin it so Table A's corner-class counts are trustworthy.

**Files:**
- Test: `tests/composable-family.test.ts`

- [ ] **Step 1: Write the failing test** (export `period` from `generateFamily.ts` first — change `function period` to `export function period`)

```ts
import { period } from '@/classes/algorithm/composable/generateFamily';

describe('period', () => {
  it('rhombus word has period 2', () => expect(period([2, 4, 2, 4])).toBe(2));
  it('scalene 5-word has period 5', () => expect(period([2, 5, 3, 3, 5])).toBe(5));
  it('regular hexagon word has period 1', () => expect(period([4, 4, 4, 4, 4, 4])).toBe(1));
});
```

- [ ] **Step 2: Run** `pnpm vitest run tests/composable-family.test.ts -t "period"` → PASS (after the `export`).

- [ ] **Step 3: Commit**

```bash
git add lib/classes/algorithm/composable/generateFamily.ts tests/composable-family.test.ts
git commit -m "test(composable): pin cyclic-word period (corner-class count)"
```

---

## Task 8: CLI — Table A + `composite12.json` (loop-until-dry on maxTiles)

**Files:**
- Create: `scripts/gen-composable-family.ts`

- [ ] **Step 1: Implement the CLI**

```ts
// Run: pnpm tsx scripts/gen-composable-family.ts
import { writeFileSync } from 'node:fs';
import { generateFamily } from '@/classes/algorithm/composable/generateFamily';

const REGULAR = [
  { kind: 'regular', n: 3, name: '3', famchar: '3' },
  { kind: 'regular', n: 4, name: '4', famchar: '4' },
  { kind: 'regular', n: 6, name: '6', famchar: '6' },
  { kind: 'regular', n: 12, name: '12', famchar: 'c' },
];

// loop-until-dry: grow maxTiles until two consecutive increments add no new tile (logged if capped)
let prev = -1, dry = 0, K = 2, out = generateFamily(2);
const CAP = 16; // hard budget; if hit, log loudly (completeness caveat)
while (dry < 2 && K < CAP) {
  K++;
  out = generateFamily(K);
  if (out.tiles.length === prev) dry++; else dry = 0;
  prev = out.tiles.length;
  console.log(`[gen] maxTiles=${K}  tiles=${out.tiles.length}  peakFrontier=${out.peakFrontier}`);
}
if (K >= CAP && dry < 2) console.log(`[gen] WARNING: hit maxTiles cap ${CAP} before convergence — family may be INCOMPLETE (logged per completeness-knob rule)`);

console.log('\nTable A — family breakdown (family = side count):');
console.log('sides | #tiles | #corner-classes');
for (const r of out.table) console.log(`${String(r.sides).padStart(5)} | ${String(r.numTiles).padStart(6)} | ${r.numCornerClasses}`);
console.log(`total | ${out.tiles.length} | ${out.table.reduce((s, r) => s + r.numCornerClasses, 0)}`);

const palette = {
  name: 'composite12',
  D: 12,
  pinnedLegacy: false,
  comment: 'Regular {3,4,6,12} + complete convex composable family (gen-composable-family.ts). DEMO of palette-agnosticism; counts are NOT all-and-only (decomposition ambiguity). Not a completeness target.',
  tiles: [
    ...REGULAR,
    ...out.tiles.map((t, i) => ({ kind: 'composite', name: t.name, angles: t.angles, famchar: `x${i}` })),
  ],
};
writeFileSync('tools/ctrnact-oracle/alphabets/palettes/composite12.json', JSON.stringify(palette, null, 2) + '\n');
console.log(`\n[gen] wrote composite12.json (${out.tiles.length} composites + 4 regulars)`);
```

- [ ] **Step 2: Run it**

Run: `pnpm tsx scripts/gen-composable-family.ts`
Expected: prints the maxTiles growth lines, Table A, and writes `composite12.json`. Record the printed peakFrontier — this is the BFS-breadth number the spec's gate calls for. If `peakFrontier` is very large (say >1e6) or the run does not finish in a couple of minutes, stop and report the numbers before continuing (gate).

- [ ] **Step 3: Eyeball the palette**

Run: `python3 -c "import json;d=json.load(open('tools/ctrnact-oracle/alphabets/palettes/composite12.json'));print(len(d['tiles']),'tiles');print([t['name'] for t in d['tiles'] if t['kind']=='composite'][:12])"`
Expected: prints the tile count and the first composite names (e.g. `cx4-2.4.2.4`).

- [ ] **Step 4: Commit**

```bash
git add scripts/gen-composable-family.ts tools/ctrnact-oracle/alphabets/palettes/composite12.json
git commit -m "feat(composable): CLI emits Table A + composite12 palette (loop-until-dry)"
```

---

## Task 9: `gen_alphabet.py` — composite tile kind + `CLASS_PREV`

Teach the alphabet generator the `composite` kind: corner classes are the fundamental-period positions of the `angles` word; add a `CLASS_PREV` table; drop the `p≤2` assert.

**Files:**
- Modify: `tools/ctrnact-oracle/alphabets/gen_alphabet.py`

- [ ] **Step 1: Extend `Tile.__init__`** (lines 46-60) — replace the `assert self.p <= 2` block:

```python
class Tile:
    def __init__(self, tid, spec):
        self.tid = tid
        self.kind = spec["kind"]              # "regular" | "star" | "composite"
        self.name = spec["name"]
        self.famchar = spec["famchar"]
        if self.kind == "regular":
            self.n = spec["n"]
            self.L = self.n
            self.p = 1
        elif self.kind == "star":
            self.n = spec["n"]
            self.alphaU = spec["alphaU"]
            self.L = 2 * self.n
            self.p = 2
        else:  # composite: rigid convex tile given by its cyclic interior-angle word (D-units)
            self.angles = spec["angles"]      # e.g. [2,4,2,4]
            self.n = len(self.angles)
            self.L = self.n
            self.p = _word_period(self.angles)
        # p<=2 assert removed: composite tiles are period-p; checkpart uses CLASS_PREV.
```

- [ ] **Step 2: Add `_word_period`** near the top (after imports):

```python
def _word_period(w):
    L = len(w)
    for p in range(1, L + 1):
        if L % p == 0 and all(w[i] == w[(i + p) % L] for i in range(L)):
            return p
    return L
```

- [ ] **Step 3: Extend `load_palette`** (lines 77-93) — add the composite branch after the star branch:

```python
        elif tile.kind == "star":
            aU = tile.alphaU
            dU = D - D // tile.n - aU
            assert 0 < aU < D // 2 < dU < D, f"star {tile.name} angles invalid"
            cp = CornerClass(len(classes), tile, 0, aU, f"{tile.n}*p{aU}")
            cp.is_point = True
            classes.append(cp)
            cd = CornerClass(len(classes), tile, 1, dU, f"{tile.n}*d{dU}")
            cd.is_point = False
            classes.append(cd)
        else:  # composite
            assert sum(tile.angles) == (tile.n - 2) * (D // 2), \
                f"composite {tile.name} angle sum {sum(tile.angles)} != {(tile.n-2)*(D//2)}"
            for pos in range(tile.p):
                cc = CornerClass(len(classes), tile, pos, tile.angles[pos], f"{tile.name}@{pos}")
                cc.is_point = False
                classes.append(cc)
        tile.classes = [c for c in classes if c.tile is tile]
```

(Keep the existing `if tile.kind == "regular":` branch above unchanged.)

- [ ] **Step 4: Add `prev_class` and emit `CLASS_PREV`** — after `next_class` (line 561):

```python
def prev_class(c, classes):
    for x in classes:
        if x.tile is c.tile and x.pos == (c.pos - 1) % c.tile.p:
            return x.cid
    raise AssertionError
```

In `class_tables_cxx` (line 569) add, right after the `CLASS_NEXT` line:

```python
    s += "static const std::vector<int> CLASS_PREV = " + cxx_intlist([prev_class(c, classes) for c in classes]) + ";\n"
```

In `emit`'s `tables.py` block (after line 549 `CLASS_NEXT`):

```python
        f.write("CLASS_PREV = %r\n" % [prev_class(c, classes) for c in classes])
```

- [ ] **Step 5: Run the generator on the composite palette**

Run: `cd tools/ctrnact-oracle && python3 alphabets/gen_alphabet.py --palette alphabets/palettes/composite12.json --out tables/composite12 --certify`
Expected: prints `[gen] palette=composite12 D=12 ...` and `[gen] wrote tables/composite12/...`; certificates pass (no assertion). Record the printed `configs=<N>` — this feeds Table B.

- [ ] **Step 6: Verify `CLASS_PREV` is present and inverse of `CLASS_NEXT`**

Run: `cd tools/ctrnact-oracle && python3 -c "import importlib.util,sys; spec=importlib.util.spec_from_file_location('t','tables/composite12/tables.py'); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); assert all(m.CLASS_NEXT[m.CLASS_PREV[c]]==c for c in range(len(m.CLASS_NEXT))); print('CLASS_PREV inverse of CLASS_NEXT: PASS', len(m.CLASS_NEXT),'classes')"`
Expected: `CLASS_PREV inverse of CLASS_NEXT: PASS`.

- [ ] **Step 7: Commit**

```bash
git add tools/ctrnact-oracle/alphabets/gen_alphabet.py
git commit -m "feat(ctrnact): composite tile kind + CLASS_PREV, drop p<=2 assert"
```

---

## Task 10: `eu_solver.cpp` — `checkpart` direction-locking

Make the face-check pick forward/backward successor from the first observed step, so mirror-placed period-p>2 tiles verify. Degenerates to today's behavior at p≤2.

**Files:**
- Modify: `tools/ctrnact-oracle/eu_solver.cpp:239-277`

- [ ] **Step 1: Replace the body of `checkpart`** (lines 239-277) with the direction-locked walk:

```cpp
bool checkpart(configuration const& conf) {
    for (int i = 0; i < (int)conf.rneig.size(); i++) {
        int free = i;
        int rfree = conf.rneig[free];
        int expect = conf.lvert[rfree];
        const int L = CLASS_L[expect];
        const int p = CLASS_P[expect];
        int count = 1;
        int dirlock = 0;            // 0 = undetermined, +1 = CLASS_NEXT, -1 = CLASS_PREV
        bool passt = false;
        while (!passt) {
            free = conf.glue[rfree];
            if (free == -1) {
                if (count > L) return false; else passt = true;
            } else if (free == i) {
                if (count % p != 0 || L % count != 0) return false; else passt = true;
            } else {
                rfree = conf.rneig[free];
                int actual = conf.lvert[rfree];
                if (dirlock == 0) {                        // lock orientation on the first step
                    if (actual == CLASS_NEXT[expect]) dirlock = 1;
                    else if (actual == CLASS_PREV[expect]) dirlock = -1;
                    else return false;
                }
                expect = (dirlock == 1) ? CLASS_NEXT[expect] : CLASS_PREV[expect];
                count++;
                if (actual != expect) return false;
            }
        }
    }
    return true;
}
```

- [ ] **Step 2: Confirm `CLASS_PREV` is in scope** — it is emitted into `solver_tables.inc` by `class_tables_cxx` (Task 9), which `eu_solver.cpp` already `#include`s via `-I tables/$(PALETTE)`. No new include needed. Grep to be sure after building: `grep -c CLASS_PREV tools/ctrnact-oracle/tables/composite12/solver_tables.inc` → expect ≥ 1.

- [ ] **Step 3: Build the regular solver to confirm no compile regression**

Run: `cd tools/ctrnact-oracle && make PALETTE=regular MAXNUM=6`
Expected: compiles clean. (Regular `CLASS_PREV` = identity, so the new branch locks `dirlock=+1` immediately and behaves exactly as before.)

- [ ] **Step 4: Commit**

```bash
git add tools/ctrnact-oracle/eu_solver.cpp
git commit -m "feat(ctrnact): checkpart direction-locking for period-p>2 tiles"
```

---

## Task 11: Regular gate — byte-identical (the load-bearing guard)

**Files:** none (verification).

- [ ] **Step 1: Run the regular regression gate**

Run: `cd tools/ctrnact-oracle && make check-regular`
Expected: ends with `check-regular: PASS (byte-identical catalogs vs golden)`. This proves the composite generalization and `checkpart` change did not disturb the regular alphabet or catalog.

- [ ] **Step 2: If it FAILS** — stop. The regular path must be byte-identical. Most likely cause: the `dirlock` branch changed behavior when `CLASS_NEXT[expect] == CLASS_PREV[expect]` (p≤2). Confirm that for p=1 the first step still locks `+1` and matches; for p=2 (if any star/degenerate case) both directions agree so either lock passes. Do not proceed until PASS. Do NOT edit `golden/regular-k6.sha256` to make it pass — that would hide a real regression.

- [ ] **Step 3: Commit** (only the confirmation, if any notes were added; otherwise skip)

No file change expected; this is a gate.

---

## Task 12: `eu_pruner.cpp` — verify (patch only if it walks faces)

**Files:**
- Read, maybe modify: `tools/ctrnact-oracle/eu_pruner.cpp`

- [ ] **Step 1: Check whether the pruner uses `CLASS_NEXT` (i.e. walks tile boundaries)**

Run: `grep -n "CLASS_NEXT\|checkpart\|CLASS_P\b" tools/ctrnact-oracle/eu_pruner.cpp`
Expected: one of two outcomes.

- [ ] **Step 2a: If NO matches** — the pruner canonicalizes via WL over the vertex graph and does not re-walk faces. No change needed. Note it in the commit message of the run task. Done.

- [ ] **Step 2b: If it DOES walk faces with `CLASS_NEXT`** — apply the same `dirlock` transform as Task 10 to that loop (read the surrounding function, add the `dirlock` variable, choose `CLASS_NEXT`/`CLASS_PREV` on the first step). Rebuild `eu_pruner` and re-run `make check-regular` (must stay PASS). Commit:

```bash
git add tools/ctrnact-oracle/eu_pruner.cpp
git commit -m "fix(ctrnact): pruner face-walk direction-locking for period-p>2 tiles"
```

---

## Task 13: Table B — alphabet growth report

Measures how the vertex-configuration count grows as families are added — the gate before the full solve.

**Files:**
- Create: `tools/ctrnact-oracle/alphabets/report_growth.py`

- [ ] **Step 1: Implement the report**

```python
#!/usr/bin/env python3
"""Table B: vertex-configuration growth as composite side-count families are added to the
regular {3,4,6,12} base. Reuses gen_alphabet's palette loader + config enumerator."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import gen_alphabet as G

def count_for(tiles, D):
    spec = {"name": "growth", "D": D, "tiles": tiles}
    path = "/tmp/_growth.json"; json.dump(spec, open(path, "w"))
    _, D2, tset, classes = G.load_palette(path)
    configs = G.enum_configs(D2, classes, 3, 24)
    return len(classes), len(configs)

def main():
    pal = json.load(open(sys.argv[1] if len(sys.argv) > 1
                         else os.path.join(os.path.dirname(__file__), "palettes/composite12.json")))
    D = pal["D"]
    regular = [t for t in pal["tiles"] if t["kind"] == "regular"]
    comps = [t for t in pal["tiles"] if t["kind"] == "composite"]
    sides = sorted({len(t["angles"]) for t in comps})
    print("Table B — alphabet growth")
    print("palette                | #corner-classes | #vertex-configs")
    cc, vc = count_for(regular, D); print(f"{'regular only':22} | {cc:15} | {vc}")
    acc = list(regular)
    for s in sides:
        acc += [t for t in comps if len(t["angles"]) == s]
        cc, vc = count_for(acc, D); print(f"{'regular + n<=' + str(s):22} | {cc:15} | {vc}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

Run: `cd tools/ctrnact-oracle && python3 alphabets/report_growth.py`
Expected: prints Table B. Read the final `#vertex-configs`: this is the alphabet the solver will load. If it is very large (say > ~1e5) the `gen_alphabet.py --certify` build in Task 9 and the solve in Task 14 may be slow; note the number and decide (proceed / cap `maxValence` / subset families) explicitly — logged, never silent.

- [ ] **Step 3: Commit**

```bash
git add tools/ctrnact-oracle/alphabets/report_growth.py
git commit -m "feat(ctrnact): Table B alphabet-growth report"
```

---

## Task 14: Run k=1, log the catalog + tables

**Files:**
- Create (log): `experiments/results/composable-k1-2026-07-11.log`

- [ ] **Step 1: Build the composite palette + solver**

Run: `cd tools/ctrnact-oracle && make PALETTE=composite12 MAXNUM=1`
Expected: regenerates `tables/composite12/` and builds `eu_solver.composite12` (+ pruner). If it hangs on table generation, that is the alphabet-size gate firing — stop and report Table B numbers.

- [ ] **Step 2: Run the k=1 pipeline with a synchronous log**

Run:
```bash
cd tools/ctrnact-oracle && PALETTE=composite12 ./run-oracle.sh 1 2>&1 | tee ../../experiments/results/composable-k1-2026-07-11.log
```
Expected: PHASE 1 solve, PHASE 2 prune, PHASE 3 "develop skipped" (non-regular palette). The pruned catalog + counts are the deliverable. Capture the k=1 count from the pruner output.

- [ ] **Step 3: Prepend the caveat header + both tables to the log**

Prepend to `experiments/results/composable-k1-2026-07-11.log` (do NOT overwrite the run output below it):

```
# Composable tiles — k=1 combinatorial catalog (2026-07-11)
#
# DEMO of Ctrnact palette-agnosticism. NOT a completeness result.
# Decomposition ambiguity: with regular + composite tiles in one palette a single
# geometric tiling is representable many ways (a rhombus tiling == a triangle tiling
# with shared edges erased), so this k=1 COUNT is over the palette's tile alphabet and
# is NOT an "all and only" count. Do not compare to A068599 / feed the exhaustiveness claim.
#
# Table A (family breakdown) and Table B (alphabet growth) below; run parameters:
#   PALETTE=composite12  maxk=1  develop=skipped
#   family maxTiles converged at K=<fill from Task 8>  peakFrontier=<fill from Task 8>
#   [if any knob capped: LOG the cap and what it could drop]
```
Paste Table A (Task 8) and Table B (Task 13) beneath the header, then the run output.

- [ ] **Step 4: Commit**

```bash
git add experiments/results/composable-k1-2026-07-11.log
git commit -m "experiment(composable): k=1 combinatorial catalog + size tables"
```

---

## Task 15: SYNC + STATUS ledger entries

Per the agent-sync protocol, record the milestone.

**Files:**
- Modify: `docs/SYNC.md` (append), `docs/STATUS.md` (overwrite current-state), `docs/DEVELOPMENT_NOTES.md` (append narrative).

- [ ] **Step 1: Append a 3–6 line SYNC entry** (newest last, signed `CC`, with the run commit hash and the k=1 count; link to the spec and the log). Keep it ≤6 lines (the docs:check hook enforces this).

- [ ] **Step 2: Add a DEVELOPMENT_NOTES section** — what landed (composite family + engine lift), the family size (Table A totals), the alphabet size (Table B final), the peakFrontier, and the loud caveat that this is a demo, not a completeness target. Note any capped knob.

- [ ] **Step 3: Update STATUS.md** current-state (composable demo done at k=1; frontier note).

- [ ] **Step 4: Run docs lint + commit**

```bash
pnpm docs:check
git add docs/SYNC.md docs/STATUS.md docs/DEVELOPMENT_NOTES.md
git commit -m "docs(composable): ledger + status for k=1 palette-agnosticism demo"
```

---

## Final verification

- [ ] `pnpm vitest run tests/composable-family.test.ts` — all green.
- [ ] `pnpm build` — no type errors or new warnings (per the repo workflow rule; the TS generator + module must typecheck).
- [ ] `cd tools/ctrnact-oracle && make check-regular` — PASS (byte-identical regular catalog).
- [ ] `experiments/results/composable-k1-2026-07-11.log` exists with the caveat header, Table A, Table B, and the k=1 count.
- [ ] No completeness knob was turned silently — any cap (`maxTiles` CAP, `maxValence`, family subset) is logged in the experiment log and DEVELOPMENT_NOTES.

## Notes on risk (from the spec, restated for the implementer)

- The BFS `peakFrontier` and the Table B `#vertex-configs` are the two numbers that decide tractability. They are printed BEFORE the expensive solve. If either explodes, stop and report — do not push through a multi-hour hang.
- `pnpm build` covers the TS side; the C++ side is covered by `make check-regular` (regression) plus the composite run completing. There is no golden catalog for composites (no oracle exists — spec §"What this is NOT").
- Confirmed against source: `Cyclotomic.fromRational(ring, 0n)` (zero), `@/classes` barrel exports `Cyclotomic`/`CyclotomicRing`, `exactPolygonsOverlap(A, B): boolean`, `transformedRigid(origin, reflect, axisK, rotK, translation, mode)`. If `transformedRigid('exact')` leaves a stale `exactKey` memo in practice, `clone()` each tile before transforming; keep the corrected form consistent across later tasks.
