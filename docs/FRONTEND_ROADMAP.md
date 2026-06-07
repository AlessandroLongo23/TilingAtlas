# Frontend Roadmap — the Certified-Results Atlas

> **What this is.** A high-level roadmap (NOT an implementation plan) for the next phase of `/lab`
> `/play` `/library` work, written to be peer-reviewed by the TA. It maps: what's live, what's
> dead, what's *shared* across methods, what must be ported to source from certified results, and
> the tasks in order. Per Alessandro's direction (2026-06-07), scope is **frontend only** — no git
> housekeeping, no orbifold merge, no proven-config compute.
>
> **Status:** drafted by CC 2026-06-07, peer of `FRONTEND_LAB_PLAN.md`. Awaiting TA peer review.
> No frontend code has been changed yet — implementation follows review.

---

## Context — why this work, now

The live research console (`/lab`, M1–M3 + inspector) shipped and merged to master (`d3683b0`): the
local scout emits runs/seeds/found_tilings to Supabase, the web mirrors them live. That covers the
*research-in-progress* surface. What it does **not** cover: the two public-facing surfaces, `/play`
and `/library`, still read the **legacy `tilings` table** (202 rows from the dead expand-and-extract
pipeline). They show stale, uncertified, superseded data.

The thesis has been reframed (TA, 2026-06) into a **3-method exploration** — torus → orbifold →
Delaney–Dress — under one certification discipline. The frontend's job now: **display the results of
the best method we currently have, at each step, with honest certification status.** Today the best
(and only certified) method is the **torus** path; the design must let **orbifold** transparently
replace it later without a frontend rewrite.

This roadmap makes `/play` and `/library` clean read-only views over the **enumerated tilings**
(certified *and* candidate, badge-distinguished), preserves the shared algorithm-step pages and the
expand-and-extract reference (both still carry thesis value), and removes only what is provably dead.

---

## Guiding principles (the spine — keep these straight)

1. **§0 holds: the site DISPLAYS certification, never PRODUCES it.** The certified digest is computed
   by the local scout; `runs.certified` is flipped only by the human step (`scripts/certify-run.ts`).
   The web reads it.
2. **The `catalogue` / `found_tilings` layer IS the method-agnostic contract.** Torus writes
   `found_tilings` today; orbifold will write the *same table* tomorrow (verified: both go through
   `PeriodSolver.solve()` and emit the same `SerializedCell`). The frontend reads tilings + a
   `certified` flag and **never needs to know which method produced them.** This is how we satisfy
   "wire up the best method at each step" for free.
3. **Show all, badge honestly.** `/play` + `/library` show every enumerated tiling with a
   **Certified vs Candidate** badge (Alessandro's call: the counts match Galebach/literature; we're
   confident they're the right tilings, certification just proves it). Never silently hide a
   candidate; never silently promote one to certified.
4. **Conservative cleanup.** Delete only code with **zero importers** that serves neither the shared
   steps nor the expand-and-extract reference. When in doubt, keep + relabel. (Theory-page remnants:
   keep, per Alessandro — cheap to revive.)
5. **Completeness > polish.** Polish is the *last* phase, never a reason to ship a surface that
   misrepresents what's certified.

---

## Verified facts (evidence the TA can check)

### A. The shared/divergent algorithm boundary — CONFIRMED
Traced `scripts/scout-worker.ts:32-63`, `lib/classes/algorithm/PeriodSolver.ts:243-282`,
`lib/algorithm/run-pipeline.ts`, and the orbifold worktree (`feat/orbifold-branch-enum`).

**Shared by expand-and-extract, torus, AND orbifold** (identical classes, no fork):
`PolygonsGenerator → VCGenerator → CompatibilityGraph → SeedSetExtractor → SeedBuilder`
(i.e. polygons → VCs → compatibility graph → **seed construction**).

**Divergence is exactly at/after seed construction:**

| Method | First method-only step | Where |
|---|---|---|
| Expand-and-extract (original, superseded) | `SeedExpander` → `TranslationalCellExtractor` (forward) → `TilingGenerator` | `lib/algorithm/run-pipeline.ts`, `app/api/pipeline/expand-seeds`, `.../extract-translational-cells` |
| Torus (certified) | `PeriodSolver.solve(mode='torus')` → `torusFill` | `scout-worker.ts:63`, `PeriodSolver.ts:243` |
| Orbifold (in progress) | `PeriodSolver.solve(mode='orbifold')` → `equivariantFillForLattice` | `PeriodSolver.ts:281`, `OrbifoldNormalized.ts` |

`SeedExpander` and `TilingGenerator` are **expand-and-extract-only** (not imported by
scout/torus/orbifold). `TranslationalCellExtractor` is shared but the torus path uses it only for
canonical-key dedup, not forward extraction. → **Alessandro's claim is correct.** This directly
justifies keeping the polygons/vcs/seeds stage pages as a *shared preamble* and the
expanded-seeds/extract pages as the *expand-and-extract reference*.

### B. Data state — the load-bearing blocker
Live Supabase (2026-06-07): `runs` = 3 rows, **1 certified** (k=1, family `{3,4,6,8,12}`, 11 tilings,
digest `6f9ca9cf2d16c75f`). `found_tilings` = 33 rows (11 certified + 22 from junk uncertified k=1
runs). `catalogue` view = 11 rows. Legacy `tilings` = 202 rows (dead pipeline) — **what `/play` +
`/library` read today.**

On disk (`.scout-cache/`): k=1 `{3,4,6,8,12}` (11 cells, already in Supabase) and **k=3 `{3,4,6,12}`
(447 seeds, 446 raw cells → 61 distinct, digest target `eb34499d5fba3457`) — NOT in Supabase.**
**No k=2 cache exists** (k=2=20, target `f3e2e0517191362c`, must be re-run).

⚑ The k=1 and k=3 caches use **different polygon families** (`{3,4,6,8,12}` vs `{3,4,6,12}`). Which
family/families constitute the "official" certified catalogue is an **open decision for the TA**
(below) — it affects labeling and grouping, not feasibility.

### C. Backfill feasibility — CONFIRMED
`.scout-cache` NDJSON stores the exact `SerializedCell` (= `cell_codec`). `canonical_key` and float
`render_cell` are both derivable via existing `scoutCodec.deserializeCell` + the emitter's
`cellToRenderData` + `TranslationalCellExtractor.canonicalKey` (`scripts/emitter.ts:123-145`). So **k=3
can be mirrored into Supabase without the ~36 h recompute.** Missing fields (`run_id`, per-seed
`ms`/`timed_out`) are display-irrelevant. The proven-config theorem run is a *separate, out-of-scope*
backend effort.

---

## Current frontend map (condensed)

**KEEP / reuse as-is (method-agnostic render + UI):**
`components/tiling-thumbnail.tsx`, `lib/utils/renderTiling.ts`, `components/canvas.tsx` (cell path),
`components/tiling-card.tsx`, `components/library-filters.tsx`, `components/run/*`,
`lib/hooks/useLiveRun.ts`, `lib/services/runsService.ts`, `components/ui/*`, `components/nav.tsx`,
`lib/algorithm/pipeline-core.ts` + the shared generator classes (§A — **do not delete**).

**SHARED algorithm-step pages (keep, relabel as the common preamble):**
`/lab/[experimentHash]/{polygons,vcs,seeds}` + `polygon-card`, `vc-card`, `seed-card`.

**EXPAND-AND-EXTRACT reference (keep, label as the superseded original method):**
`/lab/[experimentHash]/{expanded-seeds,tilings}` + `expanded-seed-card`, `legacy-stage-banner.tsx`.

**PORT (re-point from legacy `tilings` → enumerated `found_tilings`):**
`app/(app)/play/*`, `app/(app)/library/*`, and the data access they use
(`lib/services/campaignService.ts::fetchAllTilings`, `lib/stores/campaignStore.ts`).

**CLEANUP candidates (verify zero-importers first):**
`lib/stores/campaignStore.ts` (only re-exported, no consumers); the old pipeline-runner UI cluster
`components/pipeline-progress-dialog.tsx` + `lib/utils/fetchPipelineWithProgress.ts` +
`lib/stores/pipelineProgress.ts` (replaced by the live console — verify); dead `/theory` links in
`app/error.tsx` + `app/not-found.tsx` (**a real bug** — point them at `/library`).

**KEEP per Alessandro (do NOT prune):** `react-markdown`/`remark-*` deps + any theory-page remnants
(reviving the theory page later should be cheap).

---

## The plan — phased, in order

> Each task lists **Goal · Key files · Notes · Verify**. Phases 0–1 unblock everything; 2–3 are the
> visible payoff; 4–6 finish the story.

### Phase 0 — Prerequisite: certified torus data into Supabase *(data; required for the frontend goal)*
- **0.0 Verify cache completeness (honesty gate).** A small script recomputes the DJB2 digest over
  *distinct canonical keys with current dedup code* for the k=3 cache; assert it equals
  `eb34499d5fba3457` and the distinct count is 61. Mismatch ⇒ STOP, flag loudly, do not certify.
- **0.1 Backfill script** (`scripts/backfill-from-cache.ts`). Read `.scout-cache/*.ndjson` → insert one
  `runs` row per (k, family) + deduped `found_tilings` (`canonical_key`, `cell_codec`, `render_cell`,
  `k`, `seed_idx`) as **uncertified**. Reuse `scoutCodec.deserializeCell`, emitter cell→render logic.
  k=3 only (k=1 already in DB).
- **0.2 k=2** (no cache): run `EMIT=1 pnpm tsx --env-file=.env scripts/scout-parallel.ts 2` (fast) to
  populate `found_tilings`; confirm digest `f3e2e0517191362c`, count 20.
- **0.3 Certify** (§0 human step): extend `scripts/certify-run.ts` `KNOWN_TARGETS` with k=2/k=3
  digests; run it per backfilled/emitted run → flips `certified`.
- **Verify:** `catalogue` returns the certified sets; distinct counts per (k, family) = 11 / 20 / 61.
- **Owner question for Alessandro:** who runs 0.1–0.3 (you / spare machine / me with your go).

### Phase 1 — Method-agnostic data layer *(frontend)*
- **Goal:** one read path that returns **distinct enumerated tilings + a derived `certified` flag**,
  method-agnostic, filterable by k / family.
- **Key files:** new `lib/services/catalogueService.ts` (or extend `runsService.ts` — *open decision*);
  a `components/ui/certification-badge.tsx`.
- **Notes:** dedup by `canonical_key` across runs; `certified = true` iff some certified run contains
  that key (collapses the 22 junk k=1 rows to the 11 distinct, all certified). This service is the
  swap point: when orbifold runs land, nothing here changes.
- **Verify:** returns the full enumerated set with correct badges; unit test the dedup + flag logic.

### Phase 2 — Port `/library` to the results view
- **Goal:** `/library` = filtered gallery of all enumerated tilings, certified/candidate badged.
- **Key files:** `app/(app)/library/page.tsx`, `_library-client.tsx`, `components/library-filters.tsx`.
- **Notes:** swap `campaignService.fetchAllTilings` → `catalogueService`. Map the leaner schema
  (`found_tilings` has no `m`/`is_regular`/`is_star`/`wallpaper_group` yet — omit those badges or
  defer to the symmetry/orbit work). Add a Certified/Candidate filter; keep k-filter, polygon-family
  filter, pagination, `tiling-card`, `tiling-thumbnail`.
- **Verify:** `/library` shows all k≤3 with accurate badges; filters work; build + tests green.

### Phase 3 — Port `/play` to a read-only viewer
- **Goal:** `/play` = inspect a chosen enumerated tiling on the interactive canvas; certified/candidate
  badged. Decision: **`/play` becomes a viewer, not a rulestring playground.**
- **Key files:** `app/(app)/play/page.tsx`, `_play-client.tsx`, `components/sidebar/*`,
  `components/canvas.tsx`.
- **Notes:** swap data source → `catalogueService`; render from `render_cell` (already supported by
  `buildTilingFromCell`). The dead rulestring-input path and the `legacy_tilings` `LegacyCatalog`
  fallback are **decisions** (retire vs keep-behind-toggle — below), not silent deletions.
- **Verify:** selecting a tiling renders the correct cell; badge shown; zoom/pan/screenshot work.

### Phase 4 — Reframe the algorithm-step pages (no rewrite)
- **Goal:** the `/lab/[experimentHash]` stages tell the *real* structure: shared preamble, then the
  method branch — matching the thesis's 3-method arc.
- **Key files:** the stage clients + `legacy-stage-banner.tsx` + `_experiment-layout-client.tsx`.
- **Notes:** relabel **polygons/vcs/seeds** = "Steps 1–3 · common to all methods (expand-and-extract,
  torus, orbifold)"; relabel **expanded-seeds/tilings** = "Expand-and-extract · the original method,
  superseded by torus/orbifold after seed construction." Replace the generic "superseded" banner with
  this accurate method context. Building live torus/orbifold *branch* views is **explicitly future**
  (moving target — see Out of scope).
- **Verify:** labels match §A exactly; build clean.

### Phase 5 — Conservative cleanup + bug fixes *(frontend)*
- Fix dead `/theory` links in `app/error.tsx` + `app/not-found.tsx` → `/library` (keep theory infra +
  deps per Alessandro).
- Remove **only after a zero-importer grep**: `lib/stores/campaignStore.ts`; the old pipeline-runner UI
  cluster (`pipeline-progress-dialog.tsx`, `fetchPipelineWithProgress.ts`, `pipelineProgress.ts`) *if*
  orphaned. Keep `campaignService.ts` (still used by landing/lab-journal/searchOracle) — annotate it
  "legacy campaign path" rather than deleting.
- **Verify:** each removal preceded by `grep -rl` = 0; `pnpm build` clean; `pnpm test` green.

### Phase 6 — Polish *(last)*
- a11y pass; empty/error states ("no certified runs yet for this family"); loading skeletons;
  responsive; badge legend; design-token consistency (`app/styles/tokens/*`); detailed UI/motion at
  this stage (visual-companion mockups available if useful).

---

## Open decisions for review (TA / Alessandro) — none block starting Phase 0

1. **Official certified family.** k=1 cache is `{3,4,6,8,12}`, k=3 is `{3,4,6,12}`. Which family (or
   set of families) is the canonical catalogue the atlas presents? Affects labeling/grouping only.
2. **`/play` legacy modes.** Retire the rulestring playground + `legacy_tilings` "all rules" browse,
   or keep them behind a clearly separate toggle?
3. **Service shape.** New `catalogueService.ts` vs extend `runsService.ts`.
4. **`/atlas`.** `FRONTEND_LAB_PLAN.md` mentioned a future `/atlas`; does it differ from the ported
   `/library`, or is `/library` now the atlas?
5. **k≥4 candidates.** When uncertified k≥4 data appears, confirm the badge/filter story (the
   show-all-with-badge model already accommodates it).
6. **api/pipeline routes.** Verify whether campaign creation triggers them; if fully orphaned, are
   they a later cleanup, or kept as part of the expand-and-extract reference?

---

## Out of scope (frontend-only mandate)

Git housekeeping (orbifold merge, k4 commits, push); the ~36 h proven-config k=3 theorem run;
orbifold completion + Delaney–Dress; k≥4 enumeration; building new *live* torus/orbifold branch stage
views (the old "M-unify" — deferred while the orbifold target moves); pruning theory-page remnants.

## End-to-end verification (when the roadmap's phases land)
`catalogue` count = 11/20/61 per family · `/library` and `/play` read `found_tilings` (never legacy
`tilings`) · every tile badged certified/candidate truthfully · `EMIT`-on/off scout digests unchanged
(§0 regression) · `pnpm build` + `pnpm test` green · zero links to non-existent routes.
