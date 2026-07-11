# Library sidebar: vertex-type classification + expanded filters

Date: 2026-07-11 · Author: CC (with AL) · Status: approved, implementing

## Problem

The Reference (Oracle) shelf sidebar (`components/reference-shelf.tsx`) exposes four filters —
k, Discoverer, Certification, Grid — as collapsible accordion sections. AL wants:

1. Sections not collapsible (content always shown).
2. A **lattice** filter and a **wallpaper-group** filter.
3. A **regular-vs-star** filter, plus two star-specific filters (star fold, and rigid-vs-α-family).
4. An **M** filter alongside k. M = number of *distinct* vertex configurations in a tiling
   (M ≤ k). k counts vertex orbits; several orbits can share a vertex configuration, so M ≤ k.
5. A **partition classification**: the multiplicities of the distinct vertex configs, e.g. for k=7
   a tiling with configs of multiplicity (5,1,1) is in the "511" group; other k=7 groups are 421,
   331, 2221, etc. Filterable, and shown on the card.

The blocker is data, not layout: `public/reference-atlas.json` carries only
`id, source, k, family, renderCell, exactSource, discoverer, certification`. Lattice, group, M,
and partition are not present and must be computed at build time.

## What already exists (verified)

- `ctrnact` source (regular k=7, 1472 tilings) already stores `distinctTypePartition` (format
  `"3 (511)"` = M=3, parts 5·1·1) and `vertexSymbols` (length k). AL's model is this notation
  verbatim.
- `galebach` source (regular k=1–6, 1248 tilings) stores raw geometry only (T1/T2/Seed in ℤ[ζ]
  integer coords). M/partition must be recomputed from the reconstructed cell.
- `build-reference-atlas.ts` already reconstructs a `PeriodCell` per galebach tiling and computes
  `familyLabel(cell)`, so the geometry pipeline to derive vertex configs exists.
- Exact `WallpaperSymmetry` computes group + lattice for regular cells. It is **deliberately
  disabled for every star tiling** (no `exactSource` emitted; NOTES §9.4 — float segment
  intersection is unsound for non-convex tiles). So group/lattice are **regular-only**, by design,
  until exact star-segment intersection lands.

## Classification model (new per-tiling fields)

Computed at build time, written into the atlas and mirrored in the client `ReferenceTiling` type:

- `m: number` — distinct vertex-configuration count. `m = 1` at k=1; else `2..k`.
- `partition: number[]` — multiplicities of the distinct configs, descending, `sum === k`. Stored
  as an array; a display/filter key `partitionKey` is the digits joined (`[5,1,1] → "511"`).
  (Partitions with a part ≥ 10 are unreachable in practice at these k, but the key uses a `.`
  separator when any part ≥ 10 to stay unambiguous.)
- `tileClass: "regular" | "star"` — `star` iff source ∈ {myers, ctrnact-star} or family contains
  `*`.
- `starFolds?: number[]` — the star folds present (the *n* of each `n*` token), sorted. Undefined
  for regular tilings.
- `parametric: boolean` — true iff the tiling is a one-parameter family (`alphaRange`/`paramCell`
  present). Lets the "rigid vs α-family" star filter work.
- `wallpaperGroup?: WallpaperGroup`, `latticeShape?: LatticeShape` — **regular only**; undefined
  for stars.

`m === k` (all-1s partition) is exactly the Krötenheerdt (maximal) class — surfaced as a one-click
toggle, derived, no stored field.

### Where each field comes from, per source

- **ctrnact (k=7):** parse `distinctTypePartition` → `m` + `partition`; validate against a
  recomputation from `vertexSymbols` (they must agree).
- **galebach (k=1–6):** derive per-orbit vertex configs from the reconstructed cell (or from
  `orbits.json` if it already holds the orbit→config map — resolved during implementation), count
  distinct → `m`, multiplicities → `partition`.
- **star sources:** `m`/`partition` only if per-orbit vertex configs are derivable from the star
  source data; otherwise the tiling has no `m` and is simply excluded from M/partition filters
  (never guessed). Every skipped tiling is logged with a count.
- **group/lattice:** computed via existing exact `WallpaperSymmetry` for regular cells; stars get
  `undefined` plus a logged skip count.

### Correctness gate (completeness ethos)

Where a source self-reports its partition (`ctrnact.distinctTypePartition`), the build **recomputes**
it and asserts equality. A mismatch is a **loud build failure**, not a silent overwrite — the
classifier is a decisive test and must be self-consistent with the oracle it mirrors. Counts of any
tilings left unclassified (no M, no group) are logged, never hidden.

## Sidebar UX

"Not collapsible" = remove the accordion chevrons; content always rendered. To avoid an
11-section wall of scroll and to avoid offering filters that match nothing, groups irrelevant to the
current **Tile class** selection are hidden (star filters hidden when class=Regular; group/lattice
hidden when class=Star). Order, top→bottom:

1. Search (id / family) — unchanged.
2. **Tile class** — All · Regular · Star (single-select segmented).
3. **Vertex count (k)** — 1–7 chips (multi).
4. **Distinct configs (M)** — 1–7 chips (multi), plus a **Partition** chip row beneath it. Partition
   chips are data-derived: only partitions present among the currently in-scope tilings appear
   (same pattern as today's `availableGroups`). A "Maximal (M=k)" quick toggle sits here.
5. **Star** *(hidden when class=Regular)* — Fold chips (5, 9, 12, …) + Shape: Rigid · α-family.
6. **Wallpaper group** *(hidden when class=Star)* — data-derived chips, header labeled "regular".
7. **Lattice** *(hidden when class=Star)* — data-derived chips, header labeled "regular".
8. **Discoverer** — unchanged.
9. **Certification** — unchanged.
10. **Grid** — unchanged.

Each `ReferenceCard` shows the classification label (`k=7 · M3 · 511`, star fold badge, group when
present) so the scheme is visible, not only filterable.

## Filter model

`ReferenceFilter` gains: `tileClass?`, `mValues?: number[]`, `partitions?: string[]` (partition
keys), `maximalOnly?: boolean`, `starFolds?: number[]`, `parametric?: "rigid" | "family"`,
`wallpaperGroups?: WallpaperGroup[]`, `latticeShapes?: LatticeShape[]`. `matchesReferenceFilters`
extends accordingly; a tiling with no `m` fails any active M/partition filter (excluded, not
matched).

## Scope / phasing

Landable in two chunks, one spec:

- **Chunk A (UI-only):** non-collapsible layout, Tile-class filter, star-fold + rigid/α-family
  filters. Derivable from fields already in the atlas (`source`, `family`, `alphaRange`) computed
  client-side or via a thin build addition (`tileClass`, `starFolds`, `parametric`). No classifier.
- **Chunk B (enrichment):** M/partition + wallpaper/lattice — the build-script classifier pass,
  atlas rebuild, correctness gate, card badges.

Implement A before B so the sidebar reshape is visible immediately while B's classifier is verified
against the oracle.

## Out of scope

- Star wallpaper-group/lattice (needs exact star-segment intersection; NOTES §9.4).
- Changes to the certified-catalogue `LibraryFilters` (`components/library-filters.tsx`) — this spec
  is the Reference shelf only. (Its group/lattice filters already exist via the symmetry index.)
- Recomputing k or re-deriving vertex orbits from scratch — orbit structure is taken as given by
  each source.

## Verification

- `pnpm build` clean (type check + lint).
- Atlas rebuild logs: per-source classified/skipped counts; ctrnact partition-gate passes for all
  1472 entries; galebach M distribution is sane (e.g. k=1 all M=1; k=6 spans M=2..6).
- Manual: each new filter narrows the grid; hidden-group behavior tracks Tile class; card badges
  render.
