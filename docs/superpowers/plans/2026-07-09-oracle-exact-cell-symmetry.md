# Oracle exact-cell symmetry overlay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Symmetry elements" and "Fundamental domain" overlays work on oracle (Reference-shelf) tilings by giving each atlas entry its exact cyclotomic cell and reconstructing it in the browser.

**Architecture:** Store the minimal cyclotomic generators `{T1, T2, Seed}` per oracle atlas entry (a pass-through of data the builder already feeds `reconstructOracleCell`). Extract `reconstructOracleCell` into a browser-safe module. In `useSymmetryData`, when a tiling carries an inline exact source, reconstruct the cell and run `analyzeSymmetry` locally instead of fetching a Supabase `cell_codec` (which oracles never have). The certified-catalogue path is untouched.

**Tech Stack:** TypeScript, Next 16 / React 19, Vitest, exact arithmetic in `Cyclotomic` (ℚ(ζ₂₄)), p5.js canvas overlays.

**Spec:** `docs/superpowers/specs/2026-07-09-oracle-exact-cell-symmetry.md`

---

## File structure

- Create: `lib/classes/algorithm/oracleCellReconstruct.ts` — browser-safe `reconstructOracleCell(ring, tCode, o)` + helpers. Single source of truth for the reconstruction.
- Create: `lib/services/oracleSymmetry.ts` — `symmetryFromExactSource(ring, id, source)`: the pure exact-source → `SymmetryData | null` resolver (branches seed vs serialized cell).
- Create: `scripts/validate-oracle-symmetry.ts` — full-atlas acceptance gate (every reconstructed cell classifies to a valid wallpaper group).
- Create: `tests/oracle-cell-reconstruct-module.test.ts`, `tests/seed-from-period-cell.test.ts`, `tests/reference-to-catalogue-exact.test.ts`, `tests/oracle-symmetry-resolve.test.ts`.
- Modify: `scripts/oracle-match.ts` — drop local `dec`/`zetaExp`/`reconstructOracleCell` body; import the browser-safe impl; keep a 2-arg wrapper bound to its ring so existing importers/tests are unchanged.
- Modify: `lib/services/cellCodecService.ts` — add `ExactCellSource` type + `seedFromPeriodCell(cell)`; refactor `seedFromCell` to use it.
- Modify: `lib/services/catalogueService.ts` — add optional `exactSource?: ExactCellSource` to `CatalogueTiling`.
- Modify: `lib/services/referenceAtlas.ts` — add `exactSource?` to `ReferenceTiling`; `referenceToCatalogue` copies it.
- Modify: `lib/hooks/useSymmetryData.ts` — branch on `tiling.exactSource` before the Supabase fetch.
- Modify: `scripts/build-reference-atlas.ts` — emit `exactSource` per entry; per-kind count logging; then regenerate `public/reference-atlas.json`.

Dependency order: Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8.

---

## Task 1: Extract browser-safe `reconstructOracleCell`

**Files:**
- Create: `lib/classes/algorithm/oracleCellReconstruct.ts`
- Modify: `scripts/oracle-match.ts:19-59` (imports + local helpers) and the function body at `scripts/oracle-match.ts:57-259`
- Test: `tests/oracle-cell-reconstruct-module.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/oracle-cell-reconstruct-module.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { reconstructOracleCell } from '@/classes/algorithm/oracleCellReconstruct';
import { loadOracle, reconstructOracleCell as reconstructLegacy } from '../scripts/oracle-match';
import { cellsCongruent } from '@/classes/algorithm/TilingCongruence';

// The new browser-safe module (ring passed in) must reproduce the legacy script wrapper (module ring),
// which is the proven float reconstruction. Congruence is the authoritative equality.
describe('oracleCellReconstruct (browser-safe, ring param)', () => {
  const ring = CyclotomicRing.create(24);
  setActiveRing(ring);
  const oracle = loadOracle();
  const k1 = Object.entries(oracle).filter(([key]) => /^t1\d\d\d$/.test(key));

  it('reconstructs all 11 k=1 galebach entries identically to the legacy wrapper', () => {
    expect(k1.length).toBe(11);
    for (const [tCode, o] of k1) {
      const neo = reconstructOracleCell(ring, tCode, o);
      const leg = reconstructLegacy(tCode, o);
      expect('error' in neo, `${tCode}: error parity`).toBe('error' in leg);
      if ('error' in neo || 'error' in leg) continue;
      expect(cellsCongruent(neo.cell, leg.cell, new Map()), `${tCode} congruent`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/oracle-cell-reconstruct-module.test.ts`
Expected: FAIL — cannot resolve `@/classes/algorithm/oracleCellReconstruct` (module does not exist yet).

- [ ] **Step 3: Create the browser-safe module**

Create `lib/classes/algorithm/oracleCellReconstruct.ts`. Header + helpers + signature in full; the body is the reconstruction from `scripts/oracle-match.ts` lines 61-258 moved verbatim with three mechanical substitutions (listed below the code):

```ts
/**
 * Browser-safe exact reconstruction of an oracle cell from its cyclotomic generators {T1, T2, Seed}
 * (integer-coded in the ζ₁₂ power basis: [a,b,c,d] = a + b·ζ₁₂ + c·ζ₁₂² + d·ζ₁₂³, ζ₁₂ = ζ₂₄²).
 * Extracted from scripts/oracle-match.ts so the Play viewer's symmetry overlay can reconstruct oracle
 * cells on the client. NO node:fs — the ring is passed in; there are no module-level file reads.
 *
 *   vertices (seed ⊕ lattice window) → unit edges (float broadphase, EXACT normSquared()==1) → faces
 *   (directed-edge tracing) → one face per lattice class → RegularPolygon.fromAnchorAndDirExact → cell.
 */
import { Cyclotomic, type CyclotomicRing } from '@/classes/Cyclotomic';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';
import { detSurd } from '@/classes/algorithm/exact/Surd';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';

/** Decode an oracle [a,b,c,d] vertex into a Cyclotomic on `ring`. */
export function decodeGalebachVertex(ring: CyclotomicRing, [a, b, c, d]: number[]): Cyclotomic {
  return Cyclotomic.fromRational(ring, BigInt(a))
    .add(Cyclotomic.zeta(ring, 2).scaleRational(BigInt(b), 1n))
    .add(Cyclotomic.zeta(ring, 4).scaleRational(BigInt(c), 1n))
    .add(Cyclotomic.zeta(ring, 6).scaleRational(BigInt(d), 1n));
}

/** Exact ζ-exponent of a unit step on `ring`, or null. */
function zetaExp(ring: CyclotomicRing, step: Cyclotomic): number | null {
  for (let r = 0; r < ring.N; r++) if (step.equals(Cyclotomic.zeta(ring, r))) return r;
  return null;
}

export type OracleSeed = { T1: number[]; T2: number[]; Seed: number[][] };

export function reconstructOracleCell(
  ring: CyclotomicRing,
  tCode: string,
  o: OracleSeed,
): { cell: PeriodCell } | { error: string } {
  const oneC = Cyclotomic.ONE(ring);
  const dec = (abcd: number[]) => decodeGalebachVertex(ring, abcd);
  const u = dec(o.T1);
  const v = dec(o.T2);
  if (detSurd(u, v).isZero()) return { error: 'degenerate basis (det 0)' };
  // ... BODY: paste scripts/oracle-match.ts lines 64-258 verbatim, then apply the substitutions below ...
}
```

Body substitutions when pasting lines 64-258 from `scripts/oracle-match.ts` into the function above:
1. `dec` is now the local arrow defined above (uses `ring`) — no change needed to call sites like `dec(o.Seed[i])`; they already read `const seeds = o.Seed.map(dec);`.
2. Replace the single `ONE` reference (in `!verts[i].sub(verts[j]).normSquared().equals(ONE)`) with `oneC`.
3. Replace `zetaExp(cycle[1].sub(cycle[0]))` with `zetaExp(ring, cycle[1].sub(cycle[0]))`.

Everything else (the vertex cloud, edge broadphase, face tracing, lattice-class dedup, exact ζ-walk, area sanity check, and the final `return { cell: { cellPolygons, basisExact: [u, v] } };`) is copied unchanged.

- [ ] **Step 4: Point `scripts/oracle-match.ts` at the new module**

First confirm nothing else in the script uses the helpers you're about to remove:

Run: `git grep -n "zetaExp\|dec(" scripts/oracle-match.ts`
Expected: matches are confined to the `dec`/`zetaExp` definitions and the `reconstructOracleCell` body (all being removed). If `main()` or another helper references `dec`/`zetaExp`, keep a local `const dec = (abcd: number[]) => decodeGalebachVertex(ring, abcd);` instead of deleting it.

Then delete the local `dec` (lines 41-45), `zetaExp` (lines 48-51), and the entire `reconstructOracleCell` function (lines 57-259). Add this import near the other imports (after line 27) and re-define a 2-arg wrapper bound to the script's module `ring` so `main()`, `build-reference-atlas.ts`, and `tests/oracle-reconstruct-exact.test.ts` keep calling the existing 2-arg API:

```ts
import {
  reconstructOracleCell as reconstructOracleCellWithRing,
  decodeGalebachVertex,
  type OracleSeed,
} from '@/classes/algorithm/oracleCellReconstruct';

// 2-arg wrapper preserving the pre-extraction API (module `ring`); the impl now lives in the
// browser-safe module so the Play viewer can share it.
export function reconstructOracleCell(
  tCode: string,
  o: OracleSeed,
): { cell: PeriodCell } | { error: string } {
  return reconstructOracleCellWithRing(ring, tCode, o);
}
```

`OracleSeed` is defined and exported by `oracleCellReconstruct.ts` (Step 3). Import `decodeGalebachVertex` only if the grep above showed `dec` is still needed elsewhere; otherwise drop it from the import. Leave `loadOracle`, `loadSnapshot`, `MANUAL_BY_VC`, and `main()` in `scripts/oracle-match.ts` unchanged.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run tests/oracle-cell-reconstruct-module.test.ts tests/oracle-reconstruct-exact.test.ts`
Expected: PASS — the new module matches the legacy wrapper on all 11 k=1 entries, and the pre-existing extraction regression test still passes.

- [ ] **Step 6: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors (no `node:fs` reaches the new module; `oracle-match` still compiles).

- [ ] **Step 7: Commit**

```bash
git add lib/classes/algorithm/oracleCellReconstruct.ts scripts/oracle-match.ts tests/oracle-cell-reconstruct-module.test.ts
git commit -m "refactor(symmetry): extract browser-safe reconstructOracleCell(ring, ...)"
```

---

## Task 2: `seedFromPeriodCell` helper

**Files:**
- Modify: `lib/services/cellCodecService.ts:27-40`
- Test: `tests/seed-from-period-cell.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/seed-from-period-cell.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { deserializeCell, type SerializedCell } from '@/classes/algorithm/cellCodec';
import { seedFromCell, seedFromPeriodCell } from '@/lib/services/cellCodecService';
import catalogue from '../figures/data/catalogue-k1-3.json';

describe('seedFromPeriodCell', () => {
  const ring = CyclotomicRing.create(24);
  setActiveRing(ring);
  const sc = (catalogue as { tilings: { cellCodec: SerializedCell | null }[] }).tilings
    .find((t) => t.cellCodec)!.cellCodec as SerializedCell;

  it('matches seedFromCell (same T1/T2 and same vertex key set)', () => {
    const viaCodec = seedFromCell(ring, sc);
    const viaCell = seedFromPeriodCell(deserializeCell(ring, sc));
    expect(viaCell.T1.equals(viaCodec.T1)).toBe(true);
    expect(viaCell.T2.equals(viaCodec.T2)).toBe(true);
    const a = viaCell.seed.map((c) => c.key()).sort();
    const b = viaCodec.seed.map((c) => c.key()).sort();
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/seed-from-period-cell.test.ts`
Expected: FAIL — `seedFromPeriodCell` is not exported from `cellCodecService`.

- [ ] **Step 3: Refactor `seedFromCell` and add `seedFromPeriodCell`**

In `lib/services/cellCodecService.ts`, add a `PeriodCell` import and replace the `seedFromCell` function (lines 27-40) with:

```ts
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';

// Exact seed = the two basis vectors + the deduped union of all cell-polygon vertices, as Cyclotomic.
// This is the exact input to analyzeSymmetry — no floats.
export function seedFromPeriodCell(cell: PeriodCell): {
  T1: Cyclotomic;
  T2: Cyclotomic;
  seed: Cyclotomic[];
} {
  const [T1, T2] = cell.basisExact;
  const byKey = new Map<string, Cyclotomic>();
  for (const poly of cell.cellPolygons) {
    for (const w of poly.exactVertices ?? []) {
      if (!byKey.has(w.key())) byKey.set(w.key(), w);
    }
  }
  return { T1, T2, seed: Array.from(byKey.values()) };
}

export function seedFromCell(
  ring: CyclotomicRing,
  sc: SerializedCell,
): { T1: Cyclotomic; T2: Cyclotomic; seed: Cyclotomic[] } {
  return seedFromPeriodCell(deserializeCell(ring, sc));
}
```

Keep the existing `import { deserializeCell, type SerializedCell } from '@/classes/algorithm/cellCodec';` and the `Cyclotomic` import at the top of the file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/seed-from-period-cell.test.ts tests/wallpaper-symmetry-catalogue.test.ts`
Expected: PASS — the new helper matches `seedFromCell`, and the 92-tiling catalogue test (which imports `seedFromCell`) still passes unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib/services/cellCodecService.ts tests/seed-from-period-cell.test.ts
git commit -m "refactor(symmetry): factor seedFromPeriodCell out of seedFromCell"
```

---

## Task 3: `ExactCellSource` type + thread onto catalogue/reference

**Files:**
- Modify: `lib/services/cellCodecService.ts` (add type)
- Modify: `lib/services/catalogueService.ts:12-23`
- Modify: `lib/services/referenceAtlas.ts:14-20, 47-56`
- Test: `tests/reference-to-catalogue-exact.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/reference-to-catalogue-exact.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { referenceToCatalogue, type ReferenceTiling } from '@/lib/services/referenceAtlas';

describe('referenceToCatalogue passes exactSource through', () => {
  it('copies a seed exactSource onto the CatalogueTiling', () => {
    const r = {
      id: 'ctrnact-07_36-4j5_5b2-1',
      source: 'ctrnact',
      k: 7,
      family: '3.6',
      renderCell: { cellPolygons: [], basis: [[1, 0], [0, 1]] },
      exactSource: { kind: 'seed', T1: [-1, 0, 1, 0], T2: [1, 0, 0, 0], Seed: [[0, 0, 0, 0]] },
    } as unknown as ReferenceTiling;
    const c = referenceToCatalogue(r);
    expect(c.exactSource).toEqual(r.exactSource);
    expect(c.canonicalKey).toBe('ctrnact-07_36-4j5_5b2-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/reference-to-catalogue-exact.test.ts`
Expected: FAIL — `exactSource` is not on `ReferenceTiling`/`CatalogueTiling` and `referenceToCatalogue` does not copy it (type error / undefined).

- [ ] **Step 3: Add the `ExactCellSource` type**

In `lib/services/cellCodecService.ts`, after the `export type { SerializedCell };` line, add:

```ts
// The exact cyclotomic cell an oracle tiling carries inline (it has no Supabase cell_codec). Either the
// minimal generators {T1,T2,Seed} (reconstructed via reconstructOracleCell — Galebach/ctrnact) or a
// serialized cell (Myers stars + Galebach t1002, which have no {T1,T2,Seed} encoding).
export type ExactCellSource =
  | { kind: 'seed'; T1: number[]; T2: number[]; Seed: number[][] }
  | { kind: 'cell'; cell: SerializedCell };
```

- [ ] **Step 4: Add `exactSource?` to `CatalogueTiling`**

In `lib/services/catalogueService.ts`, add an import and the optional field. After line 3's imports add:

```ts
import type { ExactCellSource } from "@/lib/services/cellCodecService";
```

Inside `interface CatalogueTiling` (after the `wallpaperGroup?` line, before the closing brace):

```ts
	// Inline exact cell for oracle tilings (Reference shelf), which have no Supabase cell_codec row.
	// Undefined for certified catalogue tilings — those resolve their exact cell via fetchCellCodec.
	exactSource?: ExactCellSource;
```

- [ ] **Step 5: Add `exactSource?` to `ReferenceTiling` and copy it in `referenceToCatalogue`**

In `lib/services/referenceAtlas.ts`, add the import at the top:

```ts
import type { ExactCellSource } from "@/lib/services/cellCodecService";
```

In `interface ReferenceTiling`, after the `alphaRange?` line add:

```ts
	exactSource?: ExactCellSource; // exact cyclotomic cell for the symmetry overlay (added 2026-07)
```

In `referenceToCatalogue`, add one line to the returned object (after `runIds: [],`):

```ts
		exactSource: r.exactSource,
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run tests/reference-to-catalogue-exact.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm tsc --noEmit`
Expected: no errors.

```bash
git add lib/services/cellCodecService.ts lib/services/catalogueService.ts lib/services/referenceAtlas.ts tests/reference-to-catalogue-exact.test.ts
git commit -m "feat(symmetry): carry ExactCellSource on CatalogueTiling/ReferenceTiling"
```

---

## Task 4: `symmetryFromExactSource` resolver

**Files:**
- Create: `lib/services/oracleSymmetry.ts`
- Test: `tests/oracle-symmetry-resolve.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/oracle-symmetry-resolve.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { symmetryFromExactSource } from '@/lib/services/oracleSymmetry';
import { WALLPAPER_GROUPS } from '@/lib/classes/symmetry/types';
import { loadOracle } from '../scripts/oracle-match';
import ctrnact from '../figures/data/ctrnact.json';

describe('symmetryFromExactSource', () => {
  const ring = CyclotomicRing.create(24);
  setActiveRing(ring);

  it('classifies a galebach k=1 seed to one of the 17 groups', () => {
    const [tCode, o] = Object.entries(loadOracle()).find(([key]) => /^t1\d\d\d$/.test(key))!;
    const d = symmetryFromExactSource(ring, tCode, { kind: 'seed', T1: o.T1, T2: o.T2, Seed: o.Seed });
    expect(d).not.toBeNull();
    expect(WALLPAPER_GROUPS).toContain(d!.group);
  });

  it('classifies the reported ctrnact k=7 tiling ctrnact-07_36-4j5_5b2-1', () => {
    const t = (ctrnact as { tilings: { id: string; T1?: number[]; T2?: number[]; Seed?: number[][] }[] })
      .tilings.find((x) => x.id === 'ctrnact-07_36-4j5_5b2-1')!;
    expect(t.T1 && t.T2 && t.Seed).toBeTruthy();
    const d = symmetryFromExactSource(ring, t.id, { kind: 'seed', T1: t.T1!, T2: t.T2!, Seed: t.Seed! });
    expect(d).not.toBeNull();
    expect(WALLPAPER_GROUPS).toContain(d!.group);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/oracle-symmetry-resolve.test.ts`
Expected: FAIL — `@/lib/services/oracleSymmetry` does not exist.

- [ ] **Step 3: Create the resolver**

Create `lib/services/oracleSymmetry.ts`:

```ts
import type { CyclotomicRing } from '@/classes/Cyclotomic';
import { deserializeCell } from '@/classes/algorithm/cellCodec';
import { reconstructOracleCell } from '@/classes/algorithm/oracleCellReconstruct';
import { analyzeSymmetry } from '@/lib/classes/symmetry/WallpaperSymmetry';
import type { SymmetryData } from '@/lib/classes/symmetry/types';
import { seedFromPeriodCell, type ExactCellSource } from '@/lib/services/cellCodecService';

// Exact wallpaper analysis of an oracle tiling from its inline cell (no network). Returns null if a seed
// fails to reconstruct — the caller then shows no overlay (never a crash). The caller must have set the
// active ring to `ring` before calling (analyzeSymmetry and RegularPolygon read exact arith on it).
export function symmetryFromExactSource(
  ring: CyclotomicRing,
  id: string,
  source: ExactCellSource,
): SymmetryData | null {
  let cell;
  if (source.kind === 'seed') {
    const rec = reconstructOracleCell(ring, id, { T1: source.T1, T2: source.T2, Seed: source.Seed });
    if ('error' in rec) return null;
    cell = rec.cell;
  } else {
    cell = deserializeCell(ring, source.cell);
  }
  const { T1, T2, seed } = seedFromPeriodCell(cell);
  return analyzeSymmetry(ring, T1, T2, seed);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/oracle-symmetry-resolve.test.ts`
Expected: PASS — both the galebach seed and the reported ctrnact k=7 tiling classify to a valid group.

- [ ] **Step 5: Commit**

```bash
git add lib/services/oracleSymmetry.ts tests/oracle-symmetry-resolve.test.ts
git commit -m "feat(symmetry): symmetryFromExactSource resolver (seed | cell → SymmetryData)"
```

---

## Task 5: Wire `useSymmetryData` to the exact source

**Files:**
- Modify: `lib/hooks/useSymmetryData.ts:30-47`

This is an integration step (a React hook over Supabase — no unit test; correctness is carried by Task 4's resolver test plus `tsc` and the manual check in Task 8).

- [ ] **Step 1: Branch on `tiling.exactSource` before the fetch**

In `lib/hooks/useSymmetryData.ts`, add the import:

```ts
import { symmetryFromExactSource } from "@/lib/services/oracleSymmetry";
```

Replace the body of the `(async () => { ... })()` IIFE (lines 30-47) with:

```ts
			try {
				const ring = CyclotomicRing.create(24);
				setActiveRing(ring);
				// Oracle tilings (Reference shelf) have no Supabase cell_codec; they carry the exact cell
				// inline and are reconstructed locally.
				if (tiling.exactSource) {
					const result = symmetryFromExactSource(ring, key, tiling.exactSource);
					cache.set(key, result);
					if (alive) setData(result);
					return;
				}
				const codec = await fetchCellCodec(createClient(), key);
				if (!codec) {
					cache.set(key, null);
					if (alive) setData(null);
					return;
				}
				const { T1, T2, seed } = seedFromCell(ring, codec);
				const result = analyzeSymmetry(ring, T1, T2, seed);
				cache.set(key, result);
				if (alive) setData(result);
			} catch {
				if (alive) setData(null);
			}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/useSymmetryData.ts
git commit -m "feat(symmetry): useSymmetryData reconstructs oracle cells from exactSource"
```

---

## Task 6: Full-atlas validation gate (script + fast regression test)

**Files:**
- Create: `scripts/validate-oracle-symmetry.ts`
- Create: `tests/oracle-symmetry-catalogue.test.ts`

- [ ] **Step 1: Write the fast regression test (failing)**

Create `tests/oracle-symmetry-catalogue.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { symmetryFromExactSource } from '@/lib/services/oracleSymmetry';
import { WALLPAPER_GROUPS, ORBIFOLD_SIGNATURE } from '@/lib/classes/symmetry/types';
import { _polyAreaForTest } from '@/lib/classes/symmetry/WallpaperSymmetry';
import { loadOracle } from '../scripts/oracle-match';
import ctrnact from '../figures/data/ctrnact.json';

// Fast guard for the browser reconstruction → analyze path: all 11 galebach k=1 + a slice of ctrnact
// k=7 must classify to a valid group with an area-exact FD. The full 2722-entry gate is
// scripts/validate-oracle-symmetry.ts (too slow for the default suite).
describe('oracle symmetry — reconstruct + classify (sample)', () => {
  const ring = CyclotomicRing.create(24);
  setActiveRing(ring);

  const cases: { id: string; T1: number[]; T2: number[]; Seed: number[][] }[] = [];
  for (const [tCode, o] of Object.entries(loadOracle())) {
    if (/^t1\d\d\d$/.test(tCode) && tCode !== 't1002') cases.push({ id: tCode, ...o }); // t1002=4.8.8, no seed
  }
  const cj = (ctrnact as { tilings: { id: string; k: number; T1?: number[]; T2?: number[]; Seed?: number[][] }[] }).tilings;
  for (const t of cj.filter((x) => x.k === 7 && x.T1 && x.T2 && x.Seed).slice(0, 25)) {
    cases.push({ id: t.id, T1: t.T1!, T2: t.T2!, Seed: t.Seed! });
  }

  it('classifies every sampled oracle cell to one of the 17 groups with area(FD)=cell/|G|', () => {
    expect(cases.some((c) => c.id === 'ctrnact-07_36-4j5_5b2-1')).toBe(true);
    for (const c of cases) {
      const d = symmetryFromExactSource(ring, c.id, { kind: 'seed', T1: c.T1, T2: c.T2, Seed: c.Seed });
      expect(d, `${c.id} reconstructs`).not.toBeNull();
      expect(WALLPAPER_GROUPS, `${c.id} group`).toContain(d!.group);
      expect(d!.orbifold).toBe(ORBIFOLD_SIGNATURE[d!.group]);
      const [c1, c2] = d!.cell;
      const cellArea = Math.abs(c1.x * c2.y - c1.y * c2.x);
      expect(Math.abs(_polyAreaForTest(d!.fd) - cellArea / d!.pointGroupOrder)).toBeLessThan(
        1e-3 * Math.max(1, cellArea),
      );
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails, then passes**

Run: `pnpm vitest run tests/oracle-symmetry-catalogue.test.ts`
Expected: PASS (the resolver from Task 4 already exists). If any sampled cell returns null or an area mismatch, that is a real reconstruction/classifier bug — fix it in `oracleCellReconstruct.ts` or `WallpaperSymmetry.ts`, never by loosening the assertion. (Include the ctrnact slice that contains `ctrnact-07_36-4j5_5b2-1` — the assertion on line 1 of the `it` guards that.)

- [ ] **Step 3: Write the full-atlas validation script**

Create `scripts/validate-oracle-symmetry.ts`:

```ts
/*
 * Acceptance gate (spec §Acceptance criterion 3): every oracle atlas cell must reconstruct and classify
 * to one of the 17 wallpaper groups. Runs the SAME browser path (reconstruct/deserialize → seedFromPeriodCell
 * → analyzeSymmetry) over all galebach (loadOracle) + all ctrnact k≤8, plus Myers via the built atlas cells.
 * Logs per-source pass/fail to experiments/results/oracle-symmetry-validate-<date>.log. Read that as it runs.
 *
 * Run: pnpm tsx scripts/validate-oracle-symmetry.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { symmetryFromExactSource } from '@/lib/services/oracleSymmetry';
import { WALLPAPER_GROUPS } from '@/lib/classes/symmetry/types';
import { loadOracle } from './oracle-match';

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const ROOT = process.cwd();
const LOG = path.join(ROOT, 'experiments', 'results', `oracle-symmetry-validate-2026-07-09.log`);
const lines: string[] = [];
const log = (m: string) => { lines.push(m); console.log(m); fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.writeFileSync(LOG, lines.join('\n') + '\n'); };

type Seed = { id: string; T1: number[]; T2: number[]; Seed: number[][] };
const bySource: Record<string, { ok: number; fail: number; bad: string[] }> = {};
function run(source: string, seeds: Seed[]) {
  bySource[source] = { ok: 0, fail: 0, bad: [] };
  const b = bySource[source];
  seeds.forEach((s, i) => {
    const d = symmetryFromExactSource(ring, s.id, { kind: 'seed', T1: s.T1, T2: s.T2, Seed: s.Seed });
    if (d && WALLPAPER_GROUPS.includes(d.group)) b.ok++;
    else { b.fail++; if (b.bad.length < 20) b.bad.push(s.id); }
    if ((i + 1) % 200 === 0) log(`  ${source}: ${i + 1}/${seeds.length} (${b.fail} fail)`);
  });
  log(`=== ${source}: ${b.ok} ok, ${b.fail} FAIL ===`);
  if (b.bad.length) log(`  first failures: ${b.bad.join(', ')}`);
}

const gal: Seed[] = Object.entries(loadOracle())
  .filter(([k]) => k !== 't1002') // 4.8.8: no {T1,T2,Seed}, carried as a serialized cell in the atlas
  .map(([id, o]) => ({ id, T1: o.T1, T2: o.T2, Seed: o.Seed }));
run('galebach', gal);

const ctr = JSON.parse(fs.readFileSync(path.join(ROOT, 'figures', 'data', 'ctrnact.json'), 'utf8')) as {
  tilings: { id: string; T1?: number[]; T2?: number[]; Seed?: number[][] }[];
};
run('ctrnact', ctr.tilings.filter((t) => t.T1 && t.T2 && t.Seed).map((t) => ({ id: t.id, T1: t.T1!, T2: t.T2!, Seed: t.Seed! })));

const total = Object.values(bySource).reduce((a, b) => ({ ok: a.ok + b.ok, fail: a.fail + b.fail }), { ok: 0, fail: 0 });
log(`\nTOTAL: ${total.ok} ok, ${total.fail} FAIL`);
if (total.fail > 0) process.exitCode = 1;
```

- [ ] **Step 4: Run the full validation gate**

Run: `pnpm tsx scripts/validate-oracle-symmetry.ts`
Expected: `TOTAL: <N> ok, 0 FAIL` (exit 0). galebach = 1247 ok (1248 minus t1002), ctrnact = every k≤8 entry with a seed. If any FAIL, investigate that id's reconstruction before proceeding — this is the completeness gate, not a formality.

Coverage note (state it, do not leave it silent): this script gates the `kind:'seed'` sources only (galebach + ctrnact, the 2719 reconstructed entries). The 3 `kind:'cell'` entries — Myers ×2 and t1002 (4.8.8) — are not reconstructed from a seed, so they are covered elsewhere: t1002 is one of the 92 tilings in `tests/wallpaper-symmetry-catalogue.test.ts`, and the 2 Myers stars are spot-checked in Task 8 Step 2. That is the full coverage of all `exactSource` entries.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-oracle-symmetry.ts tests/oracle-symmetry-catalogue.test.ts
git commit -m "test(symmetry): oracle reconstruct→classify gate (sample test + full script)"
```

---

## Task 7: Builder emits `exactSource` + regenerate the atlas

**Files:**
- Modify: `scripts/build-reference-atlas.ts:50-64` (type), `116-169` (galebach), `233-240` (myers), `260-290` (ctrnact), `24-32` (imports)

- [ ] **Step 1: Extend the builder's `ReferenceTiling` type and imports**

In `scripts/build-reference-atlas.ts`, add to the `import { deserializeCell, type SerializedCell } from './scoutCodec';` line the `serializeCell` name:

```ts
import { serializeCell, deserializeCell, type SerializedCell } from './scoutCodec';
```

In the local `interface ReferenceTiling` (after the `alphaRange?` line) add:

```ts
	exactSource?:
		| { kind: 'seed'; T1: number[]; T2: number[]; Seed: number[][] }
		| { kind: 'cell'; cell: SerializedCell };
```

- [ ] **Step 2: Emit `exactSource` in `buildGalebach`**

In `buildGalebach`, the `out.push({...})` at lines 144-150 pushes `id/source/k/family/renderCell`. Change it to also carry the exact source. The `o` in scope (from `for (const [tCode, o] of entries)`) is `{T1,T2,Seed}`; t1002 uses the snapshot `cell`:

```ts
				out.push({
					id: tCode,
					source: 'galebach',
					k,
					family: familyLabel(cell),
					renderCell: cellToRenderData(cell),
					exactSource:
						tCode === 't1002'
							? { kind: 'cell', cell: serializeCell(cell) }
							: { kind: 'seed', T1: o.T1, T2: o.T2, Seed: o.Seed },
				});
```

- [ ] **Step 3: Emit `exactSource` in `buildMyersK1Stars`**

In the `return reps.map((cell, idx) => ({...}))` at lines 233-239, add the serialized cell (Myers has no `{T1,T2,Seed}`):

```ts
		return reps.map((cell, idx) => ({
			id: `myers-k1-star-${String(idx + 1).padStart(2, '0')}`,
			source: 'myers' as const,
			k: 1,
			family: familyLabel(cell),
			renderCell: cellToRenderData(cell),
			exactSource: { kind: 'cell' as const, cell: serializeCell(cell) },
		}));
```

- [ ] **Step 4: Emit `exactSource` in `buildCtrnact`**

In the `out.push({...})` at lines 272-278, add the seed (which is exactly the reconstruction input `t.T1/t.T2/t.Seed`, guaranteed non-null by the guard above it):

```ts
			out.push({
				id: t.id,
				source: 'ctrnact',
				k: 7,
				family: familyLabel(rec.cell),
				renderCell: cellToRenderData(rec.cell),
				exactSource: { kind: 'seed', T1: t.T1, T2: t.T2, Seed: t.Seed },
			});
```

- [ ] **Step 5: Add per-kind coverage logging in `main`**

In `main()`, after the `for (const key of Object.keys(byK).sort())` loop (around line 318), add a loud count so a missing exact source is visible, not silent:

```ts
	const withSeed = atlas.filter((t) => t.exactSource?.kind === 'seed').length;
	const withCell = atlas.filter((t) => t.exactSource?.kind === 'cell').length;
	const without = atlas.filter((t) => !t.exactSource).length;
	log(`  exactSource: ${withSeed} seed + ${withCell} cell = ${withSeed + withCell}/${atlas.length}` +
		(without ? `  ⚑ ${without} MISSING` : '  ✓'));
```

- [ ] **Step 6: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Regenerate the atlas**

Run: `pnpm tsx scripts/build-reference-atlas.ts`
Expected: the log ends with `exactSource: 2719 seed + 3 cell = 2722/2722  ✓` (galebach 1247 seed + t1002 cell; ctrnact 1472 seed; Myers 2 cell → 2719 seed + 3 cell). The gate is `MISSING = 0`; if the Myers count differs from 2 (the star solve is capped/timeout-sensitive), the totals shift but `MISSING` must still be 0.

- [ ] **Step 8: Verify the regenerated atlas has the field**

Run:
```bash
node -e "const d=require('./public/reference-atlas.json'); const c=d.find(t=>t.id==='ctrnact-07_36-4j5_5b2-1'); console.log('has exactSource:', !!c.exactSource, c.exactSource?.kind); const miss=d.filter(t=>!t.exactSource).length; console.log('missing:', miss); const sz=require('fs').statSync('./public/reference-atlas.json').size; console.log('atlas MB:', (sz/1e6).toFixed(2));"
```
Expected: `has exactSource: true seed`, `missing: 0`, atlas MB roughly 10.5 (was ~10.0).

- [ ] **Step 9: Commit**

```bash
git add scripts/build-reference-atlas.ts public/reference-atlas.json
git commit -m "feat(symmetry): builder emits exactSource per oracle entry; regen atlas"
```

Note: `public/reference-atlas.json` is currently untracked. Committing it makes the exact-cell atlas reproducible with the code that consumes it. If the team prefers it stay a build artifact, skip staging it and instead document the rebuild command; confirm with the user before deciding (see Task 8 Step 3).

---

## Task 8: Build + manual overlay verification

**Files:** none (verification only)

- [ ] **Step 1: Full production build (acceptance criterion 1)**

Run: `pnpm build`
Expected: build succeeds with no errors and no warnings about a server-only module in the client bundle. If `oracleCellReconstruct.ts` or `oracleSymmetry.ts` pulled in `node:fs` transitively, the build fails here — fix the import, do not suppress.

- [ ] **Step 2: Manual overlay check (acceptance criterion 2)**

Run `pnpm dev`, open `/play?source=reference`, select `ctrnact-07_36-4j5_5b2-1`, and toggle "Symmetry elements" then "Fundamental domain". Expected: both overlays now draw (axes/centers for the group; a shaded FD polygon). Spot-check one galebach entry and the two Myers star entries the same way. (Use the `run` or `verify` skill to drive the app if available.)

- [ ] **Step 3: Confirm atlas-tracking decision with the user**

Ask the user whether `public/reference-atlas.json` should be committed (reproducible atlas) or remain an untracked build artifact (rebuild via `pnpm tsx scripts/build-reference-atlas.ts`). Apply their choice; if untracked, `git rm --cached public/reference-atlas.json` and note the rebuild command in `docs/SYNC.md`.

- [ ] **Step 4: Full test suite**

Run: `pnpm test`
Expected: all tests pass, including the four new ones and the unchanged `oracle-reconstruct-exact` and `wallpaper-symmetry-catalogue` suites.

- [ ] **Step 5: Append a SYNC handoff entry**

Add a 3-6 line dated, signed (`CC`) entry to `docs/SYNC.md`: oracle tilings now carry `{T1,T2,Seed}` in the reference atlas; the Play symmetry/FD overlays reconstruct and classify them client-side; the full-atlas gate (`scripts/validate-oracle-symmetry.ts`) is green; link to the spec. Commit:

```bash
git add docs/SYNC.md
git commit -m "docs(sync): oracle symmetry overlays via inline exact cells"
```

---

## Notes for the implementer

- Exact arithmetic shares one ring instance per analysis. Every entry point (`useSymmetryData`, both new tests, the validation script) creates `CyclotomicRing.create(24)` and calls `setActiveRing(ring)` before reconstructing, then passes that same `ring` to `reconstructOracleCell`/`symmetryFromExactSource`/`analyzeSymmetry`. Do not create a second ring mid-flow (it causes a ring mismatch — see the note atop `tests/oracle-reconstruct-exact.test.ts`).
- `t1002` (the 4.8.8 octagon tiling) has no `{T1,T2,Seed}` encoding (√2 ∉ ℤ[ζ₁₂]); it is carried as a serialized cell, and the validation script/test skip it in the seed loop. This is expected, not a gap (NOTES §12.3).
- The reconstruction is deterministic and identical at build time and in the browser, so a cell that reconstructed during `build-reference-atlas.ts` will reconstruct in the browser. A null from `symmetryFromExactSource` therefore means a genuine bug surfaced by Task 6's gate, not a flaky runtime condition.
```
