# Reference (Oracle) atlas — k=8–10 via per-k lazy shards

Date: 2026-07-11
Status: design approved, pending spec review
Owner: CC (AL directed)

## Problem

The Reference (Oracle) shelf on `/library` shows regular-polygon tilings through k=7. We have the
Čtrnáct enumeration data committed through k=11 in `figures/data/ctrnact.json` (k≤11) plus separate
k=12/k=13 dumps, but none past k=7 is wired into the app.

The reason it stops at k=7 is not a data gap — it is architecture:

- `scripts/build-reference-atlas.ts` (`buildCtrnact`) hard-filters `if (t.k !== 7) continue`, and the
  Galebach path only covers k≤6.
- `loadReferenceAtlas()` fetches the entire `public/reference-atlas.json` (12 MB, k≤7) into memory on
  shelf open. Dumping k=8–10 into that one file would push it to ~100 MB — a single blocking fetch.

Rendering is already solved: `ReferenceShelf` paginates at `LIBRARY_TILINGS_PER_PAGE = 24`, so no more
than 24 canvas cards mount at once regardless of how many tilings match. The work is a data-loading
change, not a rendering one.

## Counts and shard sizes

Distinct-tiling counts match OEIS A068599 (verified against our own `figures/data/ctrnact.json`):

| k | tilings | rendered shard (est.) | notes |
|---|---|---|---|
| ≤7 | 2,720 (+ stars) | 12 MB (existing `reference-atlas.json`) | unchanged |
| 8 | 2,850 | ~15 MB | this step |
| 9 | 5,960 | ~36 MB | this step |
| 10 | 11,866 | ~77 MB | this step (heaviest shard) |

Rendered size grows with k (k=7 is 4.9 KB/record; k=8–10 run ~5–6.5 KB because the translational unit
cell holds more polygons). All k=8–10 records in `ctrnact.json` carry full `{T1,T2,Seed}` geometry, so
reconstruction has complete input.

## Goal and scope

Extend the Reference (Oracle) shelf on `/library` to k=8, 9, 10, loaded per-k on demand.

In scope:
- Build-script emission of per-k rendered shards for k=8, 9, 10.
- On-demand shard loading + merge in `ReferenceShelf`.
- K-filter extension to [1..10] with an on-demand loading affordance.

Out of scope (follow-ups, each its own cycle):
- k=11 (already in `ctrnact.json` — same pattern, deferred only to keep this step bounded).
- k=12–16 (needs seed-form payload + real list virtualization — a rearchitect, not a data drop).
- The /play picker sidebar (`CatalogueListPanel`).
- Seed-form shards + client-side reconstruction (the noted fallback, below).

These tilings are `reproduced` (Čtrnáct enumeration), not proven-complete. Only k≤3 is proven in this
work. The existing certification axis already labels them; this step adds no completeness claim.

## Approach: rendered-geometry shards

Chosen over seed-form shards for this step. Emit `renderCell` float geometry per tiling exactly like
the existing atlas, so `ReferenceShelf` renders them with zero new client code. Cost is fat shards
(k=10 ≈ 77 MB), mitigated by the shards being on-demand — nobody pays for k=10 unless they open it.

Fallback (not built now): seed-form shards ship only `{T1,T2,Seed}` (~1.25 KB/record → k=10 ≈ 15 MB)
and reconstruct `renderCell` on the client for the 24 visible cards. 5× smaller payload, but needs a
client-safe port of `reconstructOracleCell` (exact cyclotomic arithmetic) + 24 reconstructions/page.
If k=10's weight bites in practice, swapping that one shard to seed-form is a bounded follow-up.

## Design

### 1. Data pipeline — `scripts/build-reference-atlas.ts`

Generalize `buildCtrnact(k)` to take a k instead of hard-coding 7. Add a build phase that, for each
k ∈ {8, 9, 10}, reconstructs every `ctrnact.json` record at that k via `reconstructOracleCell` and
writes a **separate** file `public/reference-atlas-k{k}.json` (an array of `ReferenceTiling`, same shape
as the base file). The base `public/reference-atlas.json` stays k≤7 and is not touched.

Reuse the existing helpers unchanged: `attribute()` (already maps k=8–10 → discoverer "Marek Čtrnáct",
certification "reproduced"), `familyLabel`, `cellToRenderData`, and the seed `exactSource` stamp.

Completeness logging (matches the existing k=7=1472 check): per-k, log
`reconstructed / total (target A068599[k])`, mark `✓` only on an exact match, and list every skip
loudly. Reconstruction of 20,676 cells via exact arithmetic is a one-time offline cost — log progress
(e.g. every N records) so the build is inspectable, per the experiments logging rule.

### 2. Loading model — `lib/services/referenceAtlas.ts`

Add `loadReferenceAtlasShard(k: number): Promise<ReferenceTiling[]>` that fetches
`/reference-atlas-k{k}.json`, with the same per-key cache + in-flight dedup pattern as
`loadReferenceAtlas()`. The base loader is unchanged.

### 3. Shelf state — `components/reference-shelf.tsx`

- Keep base tilings (k≤7) loaded on shelf open as today.
- Hold loaded higher-k shards in a `Map<number, ReferenceTiling[]>` (or equivalent), plus a set of
  `loadingShards`.
- When `filters.kValues` gains a k ≥ 8 whose shard is not loaded, fetch it; on resolve, merge into the
  working array. Default view (no k filter) shows only what is loaded = k≤7, so a heavy shard never
  loads by accident.
- The merged array flows through the existing filter → sort → paginate path unchanged.

### 4. UI — `components/reference-shelf.tsx`

- Extend `K_OPTIONS` from `[1..7]` to `[1..10]`.
- While a selected k≥8 shard is fetching, show an inline "loading k=8…" indicator near the count (not
  the full-page loader, which is reserved for the initial base load).
- One-line hint under the k-filter: "k ≥ 8 loads on demand."

## Testing

- Build script: coverage assertions — k=8/9/10 counts equal 2850/5960/11866, zero skips; fail loud
  otherwise.
- Unit test (`referenceAtlas` / `catalogueService`): shard load, cache/in-flight dedup, and merge with
  the base array (no duplicate ids, correct k grouping).
- Manual verify: open shelf → toggle k=8, then k=9, then k=10 → each shard fetches once, the count
  updates, pagination works, cards render, and the total matches the target.

## Open risk

k=10's ~77 MB on-demand shard is the weak point. Accepted for this step because it is on-demand and
gated behind an explicit filter selection. Seed-form shards (above) are the drop-in mitigation if it
proves too heavy on real devices.
