# Frontend Roadmap — the Certified-Results Atlas

> **What this is.** A high-level roadmap (NOT an implementation plan) for the next phase of `/lab`
> `/play` `/library` work, written to be peer-reviewed by the TA. It maps: what's live, what's
> dead, what's *shared* across methods, what must be ported to source from certified results, and
> the tasks in order. Per Alessandro's direction (2026-06-07), scope is **frontend only** — no git
> housekeeping, no orbifold merge, no proven-config compute.
>
> **Status:** drafted by CC 2026-06-07; **revised 2026-06-07 per TA peer review**
> (`../resources/research/frontend-roadmap-review-2026-06-07.md` — verdict: *approve the shape, 3 fixes*;
> all folded in below and tagged `[TA fix #n]`). Peer of `FRONTEND_LAB_PLAN.md`. No `lib/`/`app/` code
> changed yet — implementation follows.

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
2. **The `catalogue` / `found_tilings` layer is the *intended* method-agnostic contract —
   DESIGN INTENT, not yet verified in integration `[TA fix #1]`.** Torus writes `found_tilings`
   today; the plan is for orbifold to write the *same table*, so the frontend reads tilings + a
   `certified` flag and never needs to know which method produced them. ⚑ This is **not** provable in
   any single checkout right now: on `master`, `PeriodSolver.solve(seed, opts)` is **torus-only** (no
   `mode` arg, returns `PeriodCell[]`); the orbifold variant lives only in the
   `feat/orbifold-branch-enum` worktree with a *different* API (§A). So "orbifold swaps in for free" is
   a **hope until proven by a Phase-1 round-trip contract test** — make the swap-point a test, not a hope.
3. **Show all, badge honestly.** `/play` + `/library` show every enumerated tiling with a
   **Certified vs Candidate** badge. **Certified = proven complete & correct** (digest matches the
   recorded target + the §0 human certify step). **Candidate = enumerated but NOT YET proven**
   complete/correct `[TA nit]` — *not* a formality, since the thesis's whole contribution **is** the
   proof. The counts matching Galebach/literature is *evidence*, not the claim. Never silently hide a
   candidate; never silently promote one to certified.
4. **Conservative cleanup.** Delete only code with **zero importers** that serves neither the shared
   steps nor the expand-and-extract reference. When in doubt, keep + relabel. (Theory-page remnants:
   keep, per Alessandro — cheap to revive.)
5. **Completeness > polish.** Polish is the *last* phase, never a reason to ship a surface that
   misrepresents what's certified.

---

## Verified facts (evidence the TA can check)

### A. The shared/divergent algorithm boundary

**Shared preamble — VERIFIED on `master`** (TA concurs): `PolygonsGenerator → VCGenerator →
CompatibilityGraph → SeedSetExtractor → SeedBuilder` (polygons → VCs → compatibility graph → **seed
construction**) is identical across expand-and-extract, torus, and orbifold. `SeedExpander` and
`TilingGenerator` are **expand-and-extract-only**; `TranslationalCellExtractor` is shared but torus
uses it only for canonical-key dedup, not forward extraction. → keeping polygons/vcs/seeds as a
*shared preamble* and expanded-seeds/extract as the *expand-and-extract reference* is well-justified.

**Divergence — the APIs DIFFER per branch; this is cross-branch, NOT verified-in-integration `[TA fix #1]`:**

| Method | Divergent step | Where | Checkout |
|---|---|---|---|
| Expand-and-extract (superseded) | `SeedExpander` → `TranslationalCellExtractor` (forward) → `TilingGenerator` | `run-pipeline.ts`, `app/api/pipeline/{expand-seeds,extract-translational-cells}` | master |
| Torus (certified) | `PeriodSolver.solve(seed, opts)` → `torusFill` — **torus-only, no `mode` arg, returns `PeriodCell[]`** | `scout-worker.ts:63`, `PeriodSolver.ts:132,243` | **master** |
| Orbifold (in progress) | `equivariantFillForLattice` + `OrbifoldNormalized` — a *different* `solve` API | worktree files | **`feat/orbifold-branch-enum` only — ABSENT from master** |

⚑ **My first draft was wrong here**: it cited `solve(mode='torus')` / `solve(mode='orbifold')` as one
unified master API — a branch-merge error (worktree line-refs written in the present tense). Confirmed
on `master 9033b26`: `solve()` has no `mode` arg (`PeriodSolver.ts:132`) and there is **zero** orbifold
code in `lib`/`scripts`. So the method-agnostic contract (principle #2) is **design intent**, to be
proven by the Phase-1 contract test — not a fact about the current tree.

### B. Data state — the load-bearing blocker
Live Supabase (**verified via Supabase MCP, 2026-06-07**): `runs` = 3, **1 certified** (k=1, family
`{3,4,6,8,12}`, 11 tilings, digest `6f9ca9cf2d16c75f`); `found_tilings` = 33 (3 k=1 runs × 11, **11
distinct keys**); `catalogue` view = 11; legacy `tilings` = 202 (dead pipeline) — **what `/play` +
`/library` read today.** So **today's entire certified atlas is one run, k=1, 11 tilings** (see the
Phase-0 reality check below).

On disk (`.scout-cache/`): k=1 `{3,4,6,8,12}` (11 cells, already in Supabase) and **k=3 `{3,4,6,12}`
(447 seeds, 446 raw cells → 61 distinct, digest target `eb34499d5fba3457`) — NOT in Supabase.**
**No k=2 cache exists** (k=2=20, target `f3e2e0517191362c`, must be re-run). The 0-byte
`k3_*_cap60000.ndjson` is junk.

⚑ **The family split is a SEARCH-SPACE RESTRICTION, not labeling `[TA fix #2]`.** The caches use
different families (`{3,4,6,8,12}` at k=1 vs `{3,4,6,12}` at k=3); dropping the octagon is exactly the
kind of filter §0 forbids doing *silently*. It is **sound via the octagon lemma**: the only
edge-to-edge regular-polygon tiling containing an octagon is the 1-uniform **4.8.8** (truncated square
tiling — [OEIS A068599](https://oeis.org/A068599), [Wikipedia](https://en.wikipedia.org/wiki/Truncated_square_tiling)),
so **no k≥2 tiling has an octagon** ⇒ `{3,4,6,12}` loses nothing at k≥2 and 61 is complete (this also
dodges the √2/√3 "4.8.8 obstruction" in CLAUDE.md). → **Resolves open-decision #1:** canonical family =
`{3,4,6,12}` for **k≥2**, `{3,4,6,8,12}` at **k=1** (to include 4.8.8). The UI must **label the family
per k**, and the **thesis must state the octagon lemma** — it's a relied-upon completeness step, not a
cosmetic choice.

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
>
> ⚑ **Reality check `[TA fix #3]` — the payoff is gated on Phase 0, which is NOT frontend.** Today the
> certified atlas = **one run, k=1, 11 tilings**. The 20 and 61 are *all* Phase 0 (backfill k=3 from
> cache, **re-run k=2** — no cache exists — and certify all three). Phases 1–3 will ship a real but
> **11-item** gallery without Phase 0. The bottleneck is **Phase 0 + orbifold + the proofs, not the
> frontend** — so **do not let Phase-6 polish (a11y, skeletons, motion) compete for hours with
> certifying more k.** My "who runs 0.1–0.3?" question is the tell: the critical path runs through
> work this doc labels out-of-scope.

### Phase 0 — Prerequisite: certified torus data into Supabase *(data; required for the frontend goal)*
> **STATUS — DONE & verified 2026-06-07 (CC, on Alessandro's go).** `catalogue` = **11 / 20 / 61** (92),
> all certified, all with `render_cell`. k=3 + k=2 backfilled from `.scout-cache` via
> `scripts/backfill-from-cache.ts` (digests `eb34499d5fba3457` / `f3e2e0517191362c` re-verified with
> current dedup code); certified via the §0 human step `scripts/certify-run.ts` (re-checks digest==target).
> No 36 h recompute. k=1 was already certified.
>
> ⚑ **Finding (matters for the catalogue AND the live console):** `found_tilings` is keyed by
> `canonical_key`, which **under-merges** (it splits chiral pairs the merge convention counts once — see
> `TilingCongruence.ts` header). The certified count uses `dedupeByCongruence`. So a run's raw per-cell
> emit **over-counts**: the live `EMIT=1` k=2 scout wrote **22** `found_tilings` for a certified count of
> **20**. The backfill avoids this by emitting the **congruence-deduped reps** (it asserts
> `distinct(canonical_key) == count`), so its `found_tilings` matches the certified count exactly. **The
> catalogue's correctness depends on `found_tilings` being reps-only** (the frontend can't run
> `tilingsCongruent` — it needs exact Cyclotomic, deliberately out of the browser bundle). I deleted the
> over-counted live k=2 run and replaced it with a backfilled (20-rep) one. **Follow-up (out of this
> phase, for TA):** the live M1/M2 emitter over-counts `found_tilings` for any k where canonical_key
> under-merges (k≥2) — it needs a `finish()`-time reconcile to the reps, or the gallery/catalogue must
> consume only reconciled runs.

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
  that key (collapses the extra k=1 rows to the 11 distinct, all certified). This service is the
  intended swap point — but per principle #2 it is built against the **torus `SerializedCell` shape
  only**; the method-agnostic claim is unproven until the contract test below passes.
- **1a. Contract test `[TA fix #1]` — makes the swap-point a test, not a hope.** When orbifold merges,
  assert its `solve` output round-trips `serializeCell → buildTilingFromCell` and renders identically
  to torus (same `canonical_key`, same render). Until then, principle #2 stays flagged "design intent,
  unverified." This is the gate before trusting any "orbifold drops in for free" wording.
- **Verify:** returns the full enumerated set with correct badges; unit test the dedup + flag logic;
  the contract test is wired (skipped/pending until orbifold lands).

### Phase 2 — Port `/library` to the results view
> **STATUS — DONE 2026-06-07 (CC).** `/library` now reads `fetchCatalogue` (certified-results
> catalogue), no longer the legacy `tilings` table. New: `components/ui/certification-badge.tsx`
> (Phase 1's badge), `components/catalogue-card.tsx` (reuses `TilingThumbnail` ← `render_cell`),
> `matchesCatalogueFilters` (TDD'd). Filters re-tooled: k (1–3), polygon-vs-family, **Certification
> (All/Certified/Candidate)**; dropped wallpaper/exhaustive (no symmetry data yet). Verified: build +
> 177 tests green; **runtime smoke** (dev server :3010) renders header + 24 thumbnails + badges + the
> Certified/Candidate filter, no error boundary; all visible (k≤2) cards Certified. Uncommitted.

- **Goal:** `/library` = filtered gallery of all enumerated tilings, certified/candidate badged.
- **Key files:** `app/(app)/library/page.tsx`, `_library-client.tsx`, `components/library-filters.tsx`.
- **Notes:** swap `campaignService.fetchAllTilings` → `catalogueService`. Map the leaner schema
  (`found_tilings` has no `m`/`is_regular`/`is_star`/`wallpaper_group` yet — omit those badges or
  defer to the symmetry/orbit work). Add a Certified/Candidate filter; keep k-filter, polygon-family
  filter, pagination, `tiling-card`, `tiling-thumbnail`.
- **Verify:** `/library` shows all k≤3 with accurate badges; filters work; build + tests green.

### Phase 3 — Port `/play` to a read-only viewer
> **STATUS — DONE 2026-06-07 (CC). Decision #2: retire both (pure viewer).** `/play` reads
> `fetchCatalogue`; opens a tiling via `?tiling=<canonical_key>` from `/library` (deterministic default
> = lowest k). New `components/sidebar/catalogue-list-panel.tsx` (catalogue grouped by k, thumbnail +
> badge, click-to-select); `tilings-tab`/`sidebar` rewired to `CatalogueTiling` + a selected-tiling
> badge/metadata header. The rulestring playground + `legacy_tilings` browse + `TilingModalContent`
> are unwired (files kept); `canvas.tsx` untouched (rule path already gated off by
> `showTilingRuleInput={false}` + a present cell). Verified: build clean; **runtime smoke** (:3010)
> rendered "Certified catalogue", k=1/2/3 groups, 92 thumbnails, all Certified, no error boundary.
> Uncommitted.

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
- Remove the dead pipeline-runner cluster **as a unit**: `pipeline-progress-dialog.tsx`,
  `fetchPipelineWithProgress.ts`, `pipelineProgress.ts`, `campaignStore.ts`. ⚑ **Gate `[TA nit]`:** NOT
  "`grep -rl` = 0" — these are re-exported via `lib/stores/index.ts` + `lib/utils/index.ts` and
  reference each other, so a zero-importer grep never passes and would falsely *retain* them (only
  `pipeline-progress-dialog.tsx` is truly zero-import). Correct gate: **no consumers outside the dead
  cluster + its barrels.** Keep `campaignService.ts` (still used by landing/lab-journal/searchOracle) —
  annotate "legacy campaign path".
- **Verify:** cluster-importer check per the gate above; `pnpm build` clean; `pnpm test` green.

### Phase 6 — Polish *(last)*
- a11y pass; empty/error states ("no certified runs yet for this family"); loading skeletons;
  responsive; badge legend; design-token consistency (`app/styles/tokens/*`); detailed UI/motion at
  this stage (visual-companion mockups available if useful).

---

## Open decisions for review (TA / Alessandro) — none block starting Phase 0

1. ~~**Official certified family.**~~ **RESOLVED — confirmed by Alessandro 2026-06-07:** canonical
   family = `{3,4,6,12}` for k≥2, `{3,4,6,8,12}` at k=1 — via the octagon lemma (§B). UI labels family
   per k; thesis states the lemma.
2. **`/play` legacy modes.** Retire the rulestring playground + `legacy_tilings` "all rules" browse,
   or keep them behind a clearly separate toggle?
3. ~~**Service shape.**~~ **RESOLVED:** new `lib/services/catalogueService.ts` (keeps the certified-read
   path cleanly separate from `runsService`'s live-run reads). Pure `dedupeCatalogue` is TDD'd
   (`tests/catalogueService.test.ts`, 6 cases) + validated against the real k=1 data; `fetchCatalogue`
   is thin glue. **Phase 1 data layer landed (uncommitted).**
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
