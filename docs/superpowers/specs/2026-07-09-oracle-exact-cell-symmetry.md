# Exact cyclotomic cells for oracle tilings (symmetry overlay fix)

Date: 2026-07-09
Author: CC
Status: design approved, pre-plan

## Problem

Toggling "Symmetry elements" (or "Fundamental domain") on an oracle tiling in the Reference shelf
highlights nothing. The k=7 ctrnact tiling `ctrnact-07_36-4j5_5b2-1` is the reported case.

Root cause (verified): the overlays render only from `symmetryData`, and for oracle tilings that value
is always null. `useSymmetryData` (`lib/hooks/useSymmetryData.ts`) fetches an exact cell via
`fetchCellCodec` (`lib/services/cellCodecService.ts`), which queries the Supabase `found_tilings` table
by `canonical_key`. Oracle tilings are deliberately kept off that table (they are external oracles, not
our certified output), so the fetch returns null, and both overlay gates in `components/canvas.tsx`
(`showSymmetryInfo` at line 195, the per-frame draw at line 390) fail silently.

`analyzeSymmetry` (`lib/classes/symmetry/WallpaperSymmetry.ts`) needs the exact cell: the two cyclotomic
basis vectors T1, T2 and the exact vertex set of one fundamental cell. The oracle atlas
(`public/reference-atlas.json`) currently ships only float `renderCell`, so there is no exact input to
analyze.

## What already exists (the reason this is cheap)

- `scripts/build-reference-atlas.ts` builds an exact `PeriodCell` for every one of the 2722 atlas
  entries (Galebach k=1..6 via `reconstructOracleCell`, Myers via `PeriodSolver`, ctrnact k=7 via
  `reconstructOracleCell`), then `cellToRenderData` discards it to float in all three phases.
- `figures/data/ctrnact.json` already ships the minimal cyclotomic generators `{T1, T2, Seed}` per
  tiling (integer-coded in the ζ₁₂ power basis: `[a,b,c,d] = a + b·ζ₁₂ + c·ζ₁₂² + d·ζ₁₂³`). Galebach's
  `figures/data/galebach.json` ships the same shape. These are exactly the input to
  `reconstructOracleCell`.
- The exact codec is shared: `scripts/scoutCodec.ts` re-exports `serializeCell`/`deserializeCell` from
  `lib/classes/algorithm/cellCodec.ts`, and `SerializedCell` is already the on-disk exact format used by
  `figures/data/catalogue-k1-3.json`.
- The exact arithmetic stack (`Cyclotomic`, `RegularPolygon`, `Surd`) is already in the browser bundle;
  `useSymmetryData` itself constructs a `CyclotomicRing`. `reconstructOracleCell`'s function body uses
  only these, no `node:fs`.

## Goal and scope

Make the symmetry-elements and fundamental-domain overlays work on oracle (Reference-shelf) tilings by
giving each atlas entry its exact cyclotomic cell, using the minimal-generator representation
(`{T1, T2, Seed}`) reconstructed in the browser.

In scope:
- Atlas carries the exact seed (or a serialized cell for the seedless minority).
- A browser-safe reconstruction module shared by the build scripts and the app.
- `useSymmetryData` reconstructs from the inline exact source for oracles; the certified-catalogue
  Supabase path is unchanged.

Explicitly out of scope:
- The "exact per-tiling congruence oracle across all k" idea (matching each certified tiling to a named
  oracle by exact congruence). Larger, separate effort.
- Any change to what the certified catalogue stores or how certified tilings resolve their cell.
- Approximate/float symmetry detection. This uses the exact cell only.

## Chosen representation (settled)

Minimal seed plus reconstruct. Store `{T1, T2, Seed}` in the atlas (a pass-through of data the builder
already has), reconstruct the full exact cell in the browser once per selection (cached). Rejected
alternatives: full serialized cell embedded in the main atlas (bloats the shelf-open payload ~4x, 10 MB
to ~45 MB) and full serialized cell in a lazy sidecar file (~35 MB extra, more fetch plumbing). The
chosen option grows the atlas ~0.5 MB and matches the project's "store the cyclotomic generators, derive
the geometry" stance.

## Data model

Add one optional field to `ReferenceTiling` (declared in both `scripts/build-reference-atlas.ts` and
`lib/services/referenceAtlas.ts`) and thread it onto `CatalogueTiling`
(`lib/services/catalogueService.ts`) as an optional exact source:

```ts
type ExactCellSource =
  | { kind: 'seed'; T1: number[]; T2: number[]; Seed: number[][] }  // Galebach (non-t1002), ctrnact
  | { kind: 'cell'; cell: SerializedCell };                          // Myers, Galebach t1002
```

- Field name on the atlas entry: `exactSource?: ExactCellSource`.
- `renderCell` is unchanged.
- Certified `CatalogueTiling`s leave `exactSource` undefined and keep using the Supabase path.
- `ExactCellSource` is declared once in `lib/services/cellCodecService.ts` (already the home of the exact
  seed/codec plumbing and a `SerializedCell` importer) and imported by `catalogueService.ts`,
  `referenceAtlas.ts`, and `useSymmetryData.ts`. The build scripts redeclare the same shape locally (they
  do not import app service modules), matching the existing `ReferenceTiling` duplication.

Why two kinds: Galebach (minus t1002) and ctrnact have a `{T1, T2, Seed}` encoding, so they store the
seed verbatim (no serialization). Myers cells come from `PeriodSolver` with no oracle seed encoding, and
Galebach t1002 (the 4.8.8 octagon case) comes from the certified snapshot's `cellCodec`; those two carry
a serialized cell. Myers is 2 entries and t1002 is 1, so the `cell` branch is a 3-entry minority.

## Components

### 1. Browser-safe reconstruction module

New file `lib/classes/algorithm/oracleCellReconstruct.ts`. Move `reconstructOracleCell` and its helpers
(`dec`, `zetaExp`) out of `scripts/oracle-match.ts`, changing the signature to take `ring` as a
parameter rather than reading a module-level singleton:

```ts
export function reconstructOracleCell(
  ring: CyclotomicRing,
  tCode: string,
  o: { T1: number[]; T2: number[]; Seed: number[][] },
): { cell: PeriodCell } | { error: string }
export function decodeGalebachVertex(ring: CyclotomicRing, abcd: number[]): Cyclotomic
```

Constraints:
- No `node:fs`, no `loadSnapshot`, no module-level file reads. `loadOracle`, `loadSnapshot`, and `main`
  stay in `scripts/oracle-match.ts` (unchanged behavior).
- `scripts/oracle-match.ts` and `scripts/build-reference-atlas.ts` import `reconstructOracleCell` from
  the new module instead of from `./oracle-match`.
- Because the identical function runs at build time and in the browser on the same integer input, the
  reconstructed cell matches by construction. No new geometry logic.

### 2. Builder emits the exact source

In `scripts/build-reference-atlas.ts`, alongside `renderCell: cellToRenderData(cell)`:
- `buildGalebach`: for non-t1002 entries, `exactSource: { kind:'seed', ...o }` (the `o` already passed to
  `reconstructOracleCell`). For t1002, `exactSource: { kind:'cell', cell: serializeCell(cell) }` using the
  `galebach4_8_8()` snapshot cell.
- `buildCtrnact`: `exactSource: { kind:'seed', T1: t.T1, T2: t.T2, Seed: t.Seed }`.
- `buildMyersK1Stars`: `exactSource: { kind:'cell', cell: serializeCell(cell) }`.

Import `serializeCell` (from `./scoutCodec`, already the cell codec). Coverage logging is unchanged; add
a one-line count of entries emitted with each `exactSource` kind so a missing seed is loud, not silent.

### 3. App wiring

- `lib/services/referenceAtlas.ts`: add `exactSource?` to `ReferenceTiling`; `referenceToCatalogue`
  copies it onto the returned `CatalogueTiling`.
- `lib/services/catalogueService.ts`: add optional `exactSource?: ExactCellSource` to `CatalogueTiling`.
- `lib/services/cellCodecService.ts`: extract the vertex-union logic currently inside `seedFromCell` into
  `seedFromPeriodCell(cell: PeriodCell): { T1, T2, seed }`; `seedFromCell` becomes
  `deserializeCell` then `seedFromPeriodCell`.
- `lib/hooks/useSymmetryData.ts`: the effect already constructs the ring and calls `setActiveRing(ring)`
  before analysis; keep that first, then (before the Supabase fetch) branch on `tiling.exactSource`:
  - `kind:'seed'` → `reconstructOracleCell(ring, tiling.canonicalKey, source)`; on `{cell}` →
    `seedFromPeriodCell(cell)` → `analyzeSymmetry`; on `{error}` → cache null (logged).
  - `kind:'cell'` → `deserializeCell(ring, source.cell)` → `seedFromPeriodCell` → `analyzeSymmetry`.
  - undefined → existing `fetchCellCodec` path, unchanged.
  - The existing per-`canonicalKey` cache and the null-on-failure caching are preserved, so detection
    still runs once per tiling, never per frame.

`components/canvas.tsx` needs no change: it already gates on `symmetryData` being non-null, which will
now be populated for oracles.

## Rebuild

Regenerate `public/reference-atlas.json` by running `pnpm tsx scripts/build-reference-atlas.ts`. The file
is untracked, so regeneration is safe. The Myers phase re-solves stars under its existing wall budget, so
the build takes a few minutes; Galebach and ctrnact are fast (pass-through + reconstruction).

## Acceptance criteria

1. `pnpm build` is clean: no server-only (`node:fs`) import reaches the browser bundle through the new
   module or the `useSymmetryData` changes.
2. In the Reference shelf, selecting `ctrnact-07_36-4j5_5b2-1` and toggling "Symmetry elements" draws the
   overlay; "Fundamental domain" likewise.
3. Batch validation over every atlas entry: `analyzeSymmetry` on the reconstructed cell returns a valid
   wallpaper group (∈ the 17) and no crash/null, mirroring the existing 92-tiling catalogue validation
   (group ∈ 17, area(FD) = cell/|G|). A one-off script under `scripts/` is acceptable; log a per-source
   pass/fail count.
4. The certified-catalogue symmetry path (Supabase `fetchCellCodec`) is unchanged and still works for a
   certified tiling.
5. Atlas size growth is on the order of ~0.5 MB (sanity check, not a hard gate).

## Risks and mitigations

- Browser bundle leak: the new module must import only browser-safe symbols. Mitigation: acceptance
  criterion 1; keep all fs-using code in `scripts/oracle-match.ts`.
- Reconstruction mismatch build vs browser: eliminated by construction (same function, same integer
  input, deterministic). Criterion 3 confirms across the whole atlas.
- A seed that fails to reconstruct in the browser (should not happen, since the build already
  reconstructed all 2722): `useSymmetryData` caches null and logs, so the overlay is a no-op rather than a
  crash. Criterion 3 surfaces any such entry at build/validation time.
- Myers/t1002 serialized-cell size: 3 entries, negligible.
