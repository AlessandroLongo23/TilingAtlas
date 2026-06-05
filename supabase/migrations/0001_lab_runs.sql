-- 0001_lab_runs.sql — live research-console schema (frontend M1)
-- See docs/FRONTEND_LAB_PLAN.md §2. Run this once in the Supabase SQL editor.
-- Separate namespace from legacy search_campaigns/tilings — nothing existing is altered.
--
-- §0 doctrine: the website never joins the claim-carrying path. These tables are a
-- fire-and-forget MIRROR written by the local scout's service-role emitter; the digest is
-- still computed locally. `runs.certified` is NEVER emitter-written (TA note 1) — it is
-- flipped only by an explicit human step (scripts/certify-run.ts / manual SQL).

-- ── runs: one row per scout invocation ──────────────────────────────────────────────────
create table if not exists public.runs (
  id            uuid primary key,                  -- crypto.randomUUID() in the coordinator
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  commit        text,                              -- git HEAD (short) at launch
  k             int  not null,
  family        text not null,                     -- e.g. '3,4,6,12'
  params        jsonb not null,                    -- { maxMs, workers, mode: 'certified'|'capped', resumed }
  status        text not null default 'running',   -- running | finished | failed
  count         int,                               -- final distinct count (= reps.length)
  digest        text,                              -- DJB2 over sorted canonical keys
  timeouts      int  not null default 0,
  -- ⚑ M1: timeouts>0 only (logged TODO — INCOMPLETE-log aggregation lands with diagnostics, M3)
  incomplete    boolean not null default false,
  -- ⚑ NEVER emitter-written (TA note 1). k<=3 = digest == known target + 0 timeouts;
  --    k>=4 = digest stable twice + 0 timeouts + 0 INCOMPLETE. Flipped by a human certify step.
  certified     boolean not null default false
);
create index if not exists runs_started_at_idx on public.runs (started_at desc);

-- ── run_seeds: one row per seed, idempotent (crash-resume replays are harmless) ──────────
create table if not exists public.run_seeds (
  run_id     uuid not null references public.runs(id) on delete cascade,
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

-- ── run_events: append-only decisive-event log (diagnostics feed + 'copy as SYNC entry') ──
create table if not exists public.run_events (
  run_id  uuid not null references public.runs(id) on delete cascade,
  seq     bigint not null,
  type    text not null,                            -- run_started | seed_claimed | seed_done | cell_certified | run_finished
  payload jsonb not null,
  at      timestamptz not null default now(),
  primary key (run_id, seq)
);

-- ── found_tilings: one row per certified cell, idempotent on (run_id, canonical_key) ──────
create table if not exists public.found_tilings (
  run_id        uuid not null references public.runs(id) on delete cascade,
  canonical_key text not null,                      -- TranslationalCellExtractor.canonicalKey
  cell_codec    jsonb not null,                     -- exact SerializedCell (faithful mirror)
  render_cell   jsonb,                              -- float TranslationalCellData (for TilingThumbnail; M2)
  orbit_data    jsonb,                              -- per-polygon orbit ids + verified syms (M2/M3 — needs gate extension)
  k             int  not null,
  vc_types      text[],                             -- realized VC names (M2)
  symmetry      text,                               -- wallpaper group (deferred — plan §5)
  bravais       text,                               -- Bravais class (deferred — plan §5)
  first_seen_at timestamptz not null default now(),
  seed_idx      int,
  primary key (run_id, canonical_key)
);

-- ── catalogue view: /atlas later — certified runs only ───────────────────────────────────
create or replace view public.catalogue as
  select f.* from public.found_tilings f
  join public.runs r on r.id = f.run_id
  where r.certified;

-- ── RLS: read-only public access; writes are service-role only (bypasses RLS) ────────────
alter table public.runs          enable row level security;
alter table public.run_seeds     enable row level security;
alter table public.run_events    enable row level security;
alter table public.found_tilings enable row level security;

drop policy if exists anon_read on public.runs;
drop policy if exists anon_read on public.run_seeds;
drop policy if exists anon_read on public.run_events;
drop policy if exists anon_read on public.found_tilings;
create policy anon_read on public.runs          for select using (true);
create policy anon_read on public.run_seeds     for select using (true);
create policy anon_read on public.run_events    for select using (true);
create policy anon_read on public.found_tilings for select using (true);

-- ── Realtime: add tables to the supabase_realtime publication (idempotent) ────────────────
-- runs/run_seeds/run_events ride postgres_changes directly; found_tilings is poke-then-refetch
-- (TA note 2 — large cell_codec rows exceed Realtime's payload limit).
do $$
begin
  alter publication supabase_realtime add table public.runs;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.run_seeds;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.run_events;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.found_tilings;
exception when duplicate_object then null; end $$;
