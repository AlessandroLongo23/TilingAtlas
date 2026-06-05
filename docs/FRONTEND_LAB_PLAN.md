# Frontend plan — the `/lab` live research console (M1)

> CC, 2026-06-05. Plan for the frontend refactor requested by Alessandro, off TA's brief
> `../resources/drafts/atlas-frontend-brief-2026-06-05.md` + TA's mockup. **This doc is the
> CC schema/emitter plan the brief routes through TA for §0 review before implementation.**
> Status: **APPROVED** by TA (brief §5 gate cleared, SYNC 2026-06-05) with three amendments — all
> folded below (search "TA note"). Awaiting Alessandro's go to start the M1 build. No code written yet.

## Context

The certified enumeration runs entirely in a **local CLI scout** (`scripts/scout-parallel.ts`):
it computes the k=1/2/3 catalogues (11/20/61, digests in SYNC), writes results to an in-repo
NDJSON (`.scout-cache/…`), and prints the digest. **None of that reaches the web.** The web
`/lab` today drives the *superseded expand-and-extract pipeline* (the `/api/pipeline/*` routes),
which no longer reflects how tilings are actually produced. So the researcher's real work — a
2.5 h no-cap sweep — is invisible except in a terminal.

This refactor builds the **research console** the brief describes: the local scout fire-and-forgets
events to Supabase; the web subscribes via Realtime and renders a live run view (the mockup). The
gate that makes this safe to build while proofs/sweeps are in flight is **§0 below**.

### Decisions locked with Alessandro (2026-06-05)

1. **Scope = M1 end-to-end slice.** Schema + emitter + run list + the seed-queue/workers panel.
   The other three mockup panels (gallery, diagnostics, certification) are stubbed placeholders so
   the screen matches the mockup skeleton; they are M2/M3.
2. **Keep all algorithm stages interactive** (overrides the brief's "archive the dead lab"). Nothing
   is deleted this branch. ⚑ **Divergence to record for TA:** the existing stage pages render the
   *dead expander pipeline*, not the live solve-for-period algorithm — so "keep the stages" is
   honored literally now, and the real unification (re-map stage views onto the live algorithm +
   wire them to the scout engine) is the **explicit next milestone (M-unify)**, not M1.
3. **Auth: leave `/lab` open** this branch. No `LAB_PASSWORD`. (Revisit before any public deploy.)

## 0. The one safety principle (non-negotiable)

**The website must never join the claim-carrying path.** The NDJSON on disk stays the source of
truth; the DB is a fire-and-forget **mirror**; the certified digest is still computed locally by the
existing reduce in `scout-parallel.ts:99-106`. The site *displays* certification; it never *produces*
it. Concretely, this is enforced as:

- **Emitter is opt-in via `EMIT=1`.** Default OFF → existing certified sweeps run byte-identical,
  untouched. The frontend cannot perturb a claim run unless explicitly enabled.
- **Emitter is digest-neutral by construction.** Hooks are pure additions inside `onReady/assign/
  onResult/finish`; they never mutate `collected`, `reps`, `ids`, or the digest. Worker-protocol
  fields are additive (coordinator ignores unknown fields in its reduce).
- **Emitter never throws into the scout.** Every Supabase call is wrapped; failures are swallowed +
  logged to stderr. It uses a bounded queue with retry; **on overflow it drops and warns locally**,
  never blocks, never reorders, never caps.
- **Acceptance gate (binding):** k=1=`6f9ca9cf2d16c75f`, k=2=`f3e2e0517191362c`, k=3=`eb34499d5fba3457`
  reproduced **byte-identical with `EMIT=1` and `EMIT` unset**. This is the analog of the
  parallelization guards (SYNC 2026-06-04).
- **Worktree isolation** (TA guard, SYNC 2026-06-05): a live sweep can spawn/respawn workers that
  load scout code from disk; editing the live checkout risks a mixed-build digest. So this work runs
  in a **separate git worktree** and is not merged while a sweep is in flight.

## 1. Architecture

```
scout coordinator (scripts/scout-parallel.ts — unchanged reduce/digest)
  └─ EMITTER (new: scripts/emitter.ts, fire-and-forget, EMIT=1 gated, bounded queue + retry)
       └─ Supabase tables ──Realtime──▶ Next.js /lab (subscribe via anon key, render)
```

- The scout runs locally and writes **directly** to Supabase with the **service-role key** (it has
  it; no `/api/emitter` hop needed). It **cannot** reuse `lib/supabase/service.ts` (that file is
  `import "server-only"`, which throws under `tsx`). The emitter builds its own client:
  `createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })`.
- Env into the CLI: run with `EMIT=1 pnpm tsx --env-file=.env scripts/scout-parallel.ts …` (tsx
  passes `--env-file` to Node; the scout doesn't currently load `.env`). The emitter no-ops if the
  creds or `EMIT` are absent.
- The browser subscribes with the **anon key** + Supabase Realtime (already shipped in
  `@supabase/supabase-js@2.103`; **currently used nowhere** — build-from-scratch). Tables get
  anon-`SELECT` RLS + are added to the `supabase_realtime` publication.
- **`found_tilings` = poke-then-refetch (TA note 2):** its Realtime event carries only a poke; the
  client refetches the row(s) by `select` because `cell_codec`/`render_cell` exceed Realtime's
  row-payload limit (large rows get truncated). `runs`/`run_seeds` are small → their
  `postgres_changes` payloads ride directly. Adopt this from day one.

## 2. Schema (proposal — TA reviews against §0)

No SQL migrations exist in the repo today (schema lives only in the Supabase project). This
establishes `supabase/migrations/`. New tables are a **separate namespace** from the legacy
`search_campaigns`/`tilings` — nothing existing is altered.

```sql
-- runs: one row per scout invocation
create table runs (
  id            uuid primary key,                  -- crypto.randomUUID() in the coordinator
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  commit        text,                              -- git HEAD at launch
  k             int  not null,
  family        text not null,                     -- e.g. "3,4,6,12"
  params        jsonb not null,                    -- { maxMs, workers, mode: 'certified'|'capped', resumed }
  status        text not null default 'running',   -- running | finished | failed
  count         int,                               -- final distinct count (= reps.length)
  digest        text,                              -- DJB2 over sorted canonical keys
  timeouts      int  not null default 0,
  incomplete    boolean not null default false,    -- ⚑ M1: timeouts>0 only (logged TODO — INCOMPLETE-log aggregation lands with diagnostics, M3); never silently empty
  certified     boolean not null default false     -- ⚑ NEVER emitter-written (TA note 1): flipped only by an explicit human step (scripts/certify-run.ts / manual SQL). k≤3 = digest == known target + 0 timeouts; k≥4 = digest stable twice + 0 timeouts + 0 INCOMPLETE
);

-- run_seeds: one row per seed, idempotent (crash-resume replays are harmless)
create table run_seeds (
  run_id     uuid not null references runs(id) on delete cascade,
  seed_idx   int  not null,
  name       text,
  status     text not null default 'queued',       -- queued | active | done
  worker_id  int,
  outcome    int,                                   -- cells found
  ms         int,
  timed_out  boolean not null default false,
  diag       jsonb,                                 -- { p0Skipped, p1Pruned, gateRejected, obliqueCandidates, obliqueTruncated }
  updated_at timestamptz not null default now(),
  primary key (run_id, seed_idx)
);

-- run_events: append-only decisive-event log (diagnostics feed + "copy as SYNC entry" source)
create table run_events (
  run_id  uuid not null references runs(id) on delete cascade,
  seq     bigint not null,
  type    text not null,                            -- run_started | seed_claimed | seed_done | cell_certified | run_finished
  payload jsonb not null,
  at      timestamptz not null default now(),
  primary key (run_id, seq)
);

-- found_tilings: one row per certified cell, idempotent on (run_id, canonical_key)
create table found_tilings (
  run_id        uuid not null references runs(id) on delete cascade,
  canonical_key text not null,                      -- TranslationalCellExtractor.canonicalKey
  cell_codec    jsonb not null,                     -- exact SerializedCell (faithful mirror)
  render_cell   jsonb,                              -- float TranslationalCellData (for TilingThumbnail; M2)
  orbit_data    jsonb,                              -- per-polygon orbit ids + verified syms (M2/M3 — needs gate extension)
  k             int  not null,
  vc_types      text[],                             -- realized VC names (M2)
  symmetry      text,                               -- wallpaper group (deferred — see §5)
  bravais       text,                               -- Bravais class (deferred — see §5)
  first_seen_at timestamptz not null default now(),
  seed_idx      int,
  primary key (run_id, canonical_key)
);

create view catalogue as                            -- /atlas later: certified runs only
  select f.* from found_tilings f join runs r on r.id = f.run_id where r.certified;

-- read-only public access; writes are service-role only
alter table runs enable row level security;
alter table run_seeds enable row level security;
alter table run_events enable row level security;
alter table found_tilings enable row level security;
create policy anon_read on runs           for select using (true);
create policy anon_read on run_seeds      for select using (true);
create policy anon_read on run_events     for select using (true);
create policy anon_read on found_tilings  for select using (true);
-- realtime
alter publication supabase_realtime add table runs, run_seeds, run_events, found_tilings;
```

M1 uses `runs` + `run_seeds` for the live panel; `run_events` is written from day one (cheap, future
panels read it); `found_tilings` is written by the emitter but only **consumed** in M2 (gallery).
Columns that need work the scout doesn't do yet (`orbit_data`, `symmetry`, `bravais`, `vc_types`) are
nullable and **what's deferred is logged**, never silently empty (§0 honesty rule).

## 3. The emitter (new: `scripts/emitter.ts`)

A small module the coordinator imports. Public surface (all fire-and-forget, all swallow errors):

```ts
makeEmitter(): {
  runStarted(meta): void        // → insert runs + run_events(run_started)
  seedClaimed(seedIdx, worker): void   // → upsert run_seeds(status=active) + event
  seedCompleted(r, diag): void  // → upsert run_seeds(done, outcome, ms, timed_out, diag) + per-cell found_tilings + events
  runFinished(summary): void    // → update runs(status, count, digest, timeouts, incomplete) + event — ⚑ NEVER certified (TA note 1)
  flush(): Promise<void>        // drain queue at finish() before process.exit
}
```

Internals: an in-memory queue, a single async drain loop, capped length (drop-oldest + `console.error`
warn on overflow), per-insert try/catch. `seq` is a monotonic counter in the coordinator.

**Certification is a separate human step (TA note 1).** The emitter writes `digest`/`timeouts`/
`incomplete` but **never** `certified` — auto-setting it would make the emitter *produce* the claim
(§0 violation) and breaks at k≥4 (no known target). A small companion `scripts/certify-run.ts` (or
manual SQL) flips `certified` after a human checks the run against its acceptance criterion.

### Hook points (all pure additions; line refs against current `48d77bb`)

| Event | File:line | Call |
|---|---|---|
| run started | `scout-parallel.ts` `onReady` (78) | `emit.runStarted({ runId, k, family: tiles, params: { maxMs, W, resumed: doneSet.size }, commit })` |
| seed claimed | `scout-parallel.ts` `assign` (71) | `emit.seedClaimed(a, workerIndex)` |
| seed done + cells | `scout-parallel.ts` `onResult` (83) | `emit.seedCompleted(r, r.diag)` — **needs diag forwarded (below)** |
| run finished | `scout-parallel.ts` `finish` (93, after digest at 106) | `emit.runFinished({ count: reps.length, digest: h, timeouts }); await emit.flush()` |

**Worker-protocol extension (`scout-worker.ts:63`)** — additive, digest-neutral: the worker already
has `diag` (line 62) but forwards only `timedOut`. Add the counters to the result message:

```ts
send({ type:'result', idx, name: seed.name, cells: cells.map(serializeCell),
       timedOut: diag.timedOut, ms: Date.now()-ts,
       diag: { p0Skipped: diag.p0Skipped, p1Pruned: diag.p1Pruned, gateRejected: diag.gateRejected,
               obliqueCandidates: diag.obliqueCandidates, obliqueTruncated: diag.obliqueTruncated } });
```

`run_id` is generated once in the coordinator (`crypto.randomUUID()`); `commit` via `git rev-parse
--short HEAD` (child_process, best-effort). **Not in scope for M1:** `orbit_data` per cell (the gate
discards it at `PeriodSolver.ts:258`) and `vc_types` — both need a small gate/solver change, deferred
to M2 with a logged `null`.

## 4. The `/lab` UI (M1)

Unified information architecture that **keeps every existing stage** and adds the run console:

- **`/lab`** — keep the current campaign list; **add a "Runs" section** listing rows from `runs`
  (live status chip, k·family, started, count/timeouts). New `RealtimeProvider` mounted in
  `app/(app)/layout.tsx` next to the existing store bootstrap.
- **`/lab/run/[runId]`** — the mockup screen. M1 builds the header + **seed-queue/workers panel**
  fully; the gallery/diagnostics/certification panels are rendered as labeled **M2/M3 placeholders**
  so the layout matches the mockup.
- **State:** a new Zustand slice `lib/stores/liveRunStore.ts` modeled exactly on
  `lib/stores/pipelineProgress.ts` (`subscribe(runId)` opens a Supabase channel on `run_seeds`/`runs`
  filtered by `run_id`; reducers fold `postgres_changes` into `{ run, seeds[], counts }`;
  `unsubscribe()` on unmount). Realtime + an initial `select` snapshot (so a late joiner sees history).
- **Legacy stage pages get a banner (TA note 3):** a small notice on
  polygons/vcs/seeds/expanded-seeds/tilings marking them as the *superseded expand-and-extract*
  architecture (kept per Alessandro's recorded call; M-unify re-maps them onto the live algorithm).
  Unlabeled, they reopen the thesis↔artifact divergence inside the UI.

### Reuse map (confirmed by exploration — almost no new render code)

| Mockup element | Reuse |
|---|---|
| run header + status chip | new `ui/badge.tsx` (extract the inline spans from `components/tiling-card.tsx`) + `components/ui/button.tsx` |
| seed-queue progress bar | the animated bar in `components/pipeline-progress-dialog.tsx` |
| worker cards | `components/lab-card.tsx` (two-pane card; left = current-seed thumb later, right = idx/elapsed/vc) |
| found-tilings gallery (M2) | `components/tiling-thumbnail.tsx` + `lib/utils/renderTiling.ts` (`expandToViewport`) |
| stat tiles (M3) | new small `ui/stat.tsx`; charts via existing `react-chartjs-2` |
| tokens/colors | `app/globals.css` + `app/styles/tokens/{primitives,themed,derived}.css` (Tailwind v4, oklch, green `--color-accent` = "running"). **Defer to these, not the `design-system` skill's Svelte snippets** (the skill predates the Next port; its token/a11y *principles* apply, its component anatomy does not). |

## 5. Answers to TA's "Asks to CC" (from the brief §5)

- **Wire codec reusable as `cell_codec`?** **Yes.** `scripts/scoutCodec.ts::SerializedCell`
  (`{ polys:{n,a:EncCyc,d}[], basis:[EncCyc,EncCyc] }`) is exact and round-trip-tested
  (`tests/scout-codec.test.ts` preserves `canonicalKey` + congruence). Caveat: the module imports
  `node:fs`, so the **deserialize half isn't client-importable as-is** → store a float `render_cell`
  (`TranslationalCellData`) too, which `TilingThumbnail` already renders with zero Cyclotomic. (Or
  extract a fs-free codec module in M2.)
- **Emitter hook points?** §3 table above — `onReady`/`assign`/`onResult`/`finish` in
  `scout-parallel.ts`, plus the additive `diag` forward in `scout-worker.ts:63`.
- **Render component to reuse?** `components/tiling-thumbnail.tsx` (gallery cards + inspector) over
  `lib/utils/renderTiling.ts`; `components/lab-card.tsx` for the card shell.
- **Schema review?** §2 — over to TA against §0.
- **`symmetry`/`bravais`/`orbit_data`/`vc_types`** are **not computed by the scout today.** `orbit_data`
  + verified syms exist transiently in `KUniformityChecker.countVertexOrbits` (discarded on the gate);
  Bravais/wallpaper-group need a derivation from `(u,v)` + the gate's syms. **All deferred to M2/M3
  with logged `null`** — flagged here so TA doesn't assume M1 fills them.

## 6. Build order (M1)

1. `supabase/migrations/0001_lab_runs.sql` (§2) — user runs it in the Supabase dashboard + enables
   Realtime on the four tables. Smoke: insert a row, see it over a browser channel.
2. `scripts/emitter.ts` — client + bounded queue + the five methods + `flush()`. Unit test the queue
   (overflow drop, error-swallow) with a stubbed client.
3. Wire hooks in `scout-parallel.ts` (4 sites) + diag forward in `scout-worker.ts`. Guard all behind
   `EMIT=1`. Emitter writes `digest`/`timeouts`/`incomplete` but **never** `certified` (TA note 1).
   **Run the §0 acceptance gate: k=1/k=2/k=3 digests byte-identical, EMIT on vs off.** Verify `.env`
   is gitignored (it holds the service-role key) before any commit.
4. `lib/stores/liveRunStore.ts` + `RealtimeProvider` in `app/(app)/layout.tsx`. `found_tilings` reads
   are poke-then-refetch (TA note 2).
5. `/lab` Runs section + `/lab/run/[runId]` header + seed-queue/workers panel + M2/M3 placeholders +
   the legacy-stage banner (TA note 3). `ui/badge.tsx`. Reuse per §4.
6. `scripts/certify-run.ts` — the human certify step that flips `runs.certified` (TA note 1). Small;
   may slip to first M2 step since M1's panel doesn't gate on it.
7. `pnpm build` clean (workflow rule); add tests for the emitter queue + the store reducer.

**Non-goals this branch:** deleting any legacy route or `/api/pipeline/*`; the gallery/diagnostics/
certification panels (beyond placeholders); `/atlas`; auth; orbit coloring; `orbit_data`/`vc_types`/
`bravais` population; the M-unify stage re-mapping.

## 7. Verification

- **Digest gate (the load-bearing one):** `EMIT=1 pnpm tsx --env-file=.env scripts/scout-parallel.ts 1`
  and `… 2` reproduce `6f9ca9cf2d16c75f` / `f3e2e0517191362c`; compare to an `EMIT`-unset run — must be
  byte-identical. (k=3 once, opportunistically — it's a long sweep.)
- **Realtime smoke:** launch a short capped run with `EMIT=1`; the `/lab/run/[runId]` queue/workers
  panel updates live (done/active/queued counts climb, worker cards tick).
- **Late-join:** open the run page mid-run → initial `select` snapshot + live deltas (no gap).
- **Failure isolation:** point `PUBLIC_SUPABASE_URL` at a dead host with `EMIT=1` → the scout still
  finishes and prints the correct digest (emitter errors swallowed); stderr shows drop warnings.
- `pnpm build` + `pnpm test` green.

## 8. Branch + handoff

- **Worktree:** `feat/lab-live-console` off `master` (§0 worktree guard). Independent of the orbifold
  worktree and the proven-config regression — no shared code surface.
- **TA review gate (brief §5):** this doc is the schema/emitter plan; TA reviews §0–§2 before step 1.
- **SYNC entry to write when M1 lands:** record (a) the live-console bus + emitter (digest-neutral,
  acceptance passed), (b) ⚑ the **divergence**: Alessandro chose to keep all algorithm stages, so the
  brief's "archive the dead lab" is superseded by the M-unify milestone (re-map stages onto the live
  algorithm) — TA should note this in any frontend/results framing.
