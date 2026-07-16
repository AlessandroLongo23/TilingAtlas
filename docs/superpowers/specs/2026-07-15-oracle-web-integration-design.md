# Getting the Čtrnáct oracle onto the website — findings and proposed architecture

Date: 2026-07-15
Status: design / decision capture (no code yet). Long-term project (months), not a thesis deliverable.
Author: CC session with AL.

## The problem

Marek runs the Čtrnáct C++ oracle (`tools/ctrnact-oracle/`) locally. Some searches run for hours,
longer than Vercel serverless functions or Supabase Edge functions allow (execution caps are seconds
to a few minutes). We want to (a) run these long searches and (b) see their progress and results on
the website. AL's first instinct was a Capacitor app that runs terminal commands, with a
desktop-only "experiments" page absent from the web.

## What we ruled out, and why

**Capacitor is the wrong tool.** Capacitor is a mobile framework (iOS/Android plus a web target). It
wraps a web app in a WebView and exposes native plugins (camera, filesystem, geolocation). It gives
you no shell. There is no "run this terminal command" capability, and on iOS the sandbox forbids
spawning subprocesses or executing your own compiled binaries as separate processes. Its only desktop
story is a community Electron target, so going that route means running Electron underneath anyway.
"Use Capacitor to run C++ searches" fails at the OS-sandbox level, not just the API level.

**A dedicated always-on server is overbuilt for now.** The searches reach k=16 in hours across ~8
parallel workers. Matching that is not a cheap VPS; it is a $40–80/mo dedicated box, plus getting the
C++/Python toolchain onto it and keeping it in sync with the repo. For a two-person project that runs
searches occasionally, that is paying monthly to do worse than the Mac you already own. Deferred, not
forbidden.

## The key reframe: two separate problems

The request conflated two things that have different solutions and should be decided independently.

1. Compute hosting: long C++ runs cannot live on Vercel/Supabase because serverless kills anything
   past its execution cap. This is a "where does the process run" problem. Answer: locally, where it
   already runs.
2. Control plane: we want a nice page to start a run and watch progress instead of babysitting a
   shell. This is a UI problem, and it is just a mirror over whatever ran the compute.

The heavy compute has to run somewhere that permits hours-long processes. Everything else is a
control panel over that. "Access control for two people" does not require a server or an installable
app; it is simply not deploying the trigger page to the public internet.

## Trigger models considered

**Shape 1 (chosen for now): localhost is the trigger.** Each operator runs the Next app locally. The
browser hits `localhost:3000/experiments`, which talks to the local server (not Vercel). That server
has `child_process` and spawns the oracle. The run writes progress and results to Supabase. The
public deployed site reads that from Supabase in realtime. No always-on infra, no agent. Each of you
runs on your own machine; results pool into Supabase; both watch everything live on the public
platform.

**Shape 2 (deferred): Supabase as a mailbox.** To trigger a run from the public site while away from
the machine, add a small local agent left running. The site inserts a "job requested" row into
Supabase; the agent subscribes, spawns the process locally, writes progress back. This is how
self-hosted CI runners work. Caveat: the agent must be running and the machine awake when the job is
enqueued.

Decision: build Shape 1 now. The `runs`/`run_events` schema is already mailbox-shaped, so the Shape 2
agent later reads a "requested" row instead of taking an HTTP call. Additive, not a rewrite.

## Key discovery: ~80% is already built (for the legacy engine)

There is a complete "local run to Supabase mirror to realtime web console" system already in the
repo, built for the legacy TypeScript scout. The Čtrnáct C++ oracle was never wired into it.

Existing pieces to reuse:

- `scripts/emitter.ts` — fire-and-forget one-way mirror writing `runs` / `run_events` / `run_seeds` /
  `found_tilings`. Opt-in via `EMIT=1` with service-role creds. Never blocks the compute. Doctrine:
  the website never joins the claim-carrying path; a human flips `certified` via `scripts/certify-run.ts`.
- `scripts/emit_run.py` — the Python twin, but it posts only a single final `runs` summary row (no
  live events, no results). stdlib `urllib` only.
- `lib/hooks/useLiveRun.ts` — Supabase Realtime subscription for one run, folding `runs` + `run_seeds`
  (not `run_events` yet). Read-only.
- `app/(app)/history/page.tsx` + `app/(app)/history/run/[runId]/page.tsx` — the run history table and
  per-run live console, wired to `lib/services/runsService.ts`.
- `lib/services/catalogueService.ts` — reads `found_tilings` + `runs`, dedupes by `canonical_key`,
  fetches `render_cell` but deliberately NOT `cell_codec` ("large; fetched on demand"). The
  "serve render geometry, keep the exact codec cold" decision is already baked in here.
- `scripts/oracleReconstructExact.ts` + `scripts/ctrnact-recon-check.ts` — turn oracle
  `{id,k,T1,T2,Seed}` cells into exact geometry and render cells with an area certificate.
- Render components: `components/tiling-thumbnail.tsx`, `tiling-card.tsx`, `canvas.tsx`,
  `run/gallery-panel.tsx`, `run/inspector-drawer.tsx`, `sidebar/catalogue-list-panel.tsx`. The run
  gallery already draws `found_tilings` render cells.
- Auth: `proxy.ts` gates `/api/pipeline/*` with the `PIPELINE_SECRET` header. `lib/supabase/service.ts`
  is the server-only service-role client factory.

What is a separate, static thing: `/library` renders `public/reference-atlas.json` (proven k≤3), not
Supabase. Marek's data is a new Supabase-backed view, not a change to the current library.

The C++ oracle (`tools/ctrnact-oracle/run-oracle.sh`, `run-oracle-parallel.sh`) is an island: shell +
C++ + Python, no trigger UI, no live events, and it writes a `ctrnact-cells-k*.json` file that nobody
imports into Supabase.

## Relevant Supabase schema (already exists)

- `runs` — id, started_at, finished_at, commit, k, family, params (jsonb), status, count, digest,
  timeouts, incomplete, certified. One row per enumeration run. `family` = palette, `k` = maxk.
- `run_events` — run_id, seq, type, payload (jsonb), at. Append-only progress event log. Natural
  channel for oracle phase transitions and per-k counts. RLS enabled.
- `run_seeds` — per-seed status. Seed-centric, from the legacy scout. The oracle has no "seeds", so it
  is unused on the oracle path.
- `found_tilings` — run_id, canonical_key, cell_codec (jsonb), render_cell (jsonb), orbit_data, k,
  vc_types, symmetry, bravais, seed_idx. Results. RLS enabled.
- `search_campaigns`, `tilings` — campaign-scoped catalogue. RLS currently DISABLED (see Security).

## Proposed architecture and data flow (Shape 1)

```
[browser: /experiments page]  ── POST /api/experiments/run ──▶  [LOCAL Next server only]
   (palette dropdown, maxk, shards)                                  │ validates + guards + lockfile
                                                                     │ spawns detached wrapper, returns runId
   ▲ subscribes (Supabase Realtime)                                  ▼
   │                                                        [run-oracle-emit wrapper (Node/tsx)]
   │                                                          spawns run-oracle.sh (C++/Python)
[Supabase: runs, run_events, found_tilings] ◀── mirrors ───  tails stdout → run_events
   │                                                          imports cells JSON → found_tilings
   ▼
[public Vercel site: /library, /history — READ ONLY from Supabase]
```

The trigger request returns a `runId` in milliseconds and does NOT await the hours-long run. The child
is detached (`unref`); the browser watches Supabase, not the HTTP response. This preserves the
one-way-mirror doctrine: the website starts and observes the local process but never participates in
the computation.

## The four net-new seams (trigger system, later spec)

1. `/experiments` page + `POST /api/experiments/run` route (`runtime="nodejs"`), gated to exist ONLY
   off-Vercel. Validates inputs, refuses if a run is already active (one CPU-bound run per machine, a
   PID lockfile), spawns the wrapper detached.
2. `run-oracle-emit` wrapper (Node/tsx) — spawns `run-oracle.sh` / `-parallel.sh`, inserts the `runs`
   row, parses the script's `[HH:MM:SS] PHASE …` and per-k lines into `run_events`, marks
   `finished` / `failed`. Reuses `scripts/emitter.ts`.
3. Cells → `found_tilings` importer — feed `ctrnact-cells-k*.json` through `oracleReconstructExact` to
   get `canonical_key` + `render_cell` (and store `cell_codec`), upsert to `found_tilings`. This is
   what makes oracle results appear in the catalogue.
4. Extend `useLiveRun` (or a sibling `useLiveOracleRun`) to fold `run_events` — the oracle has phases
   and per-k counts, not seeds, so the live console reads the event log instead of `run_seeds`.

## Storage and cost analysis

Supabase bills three separate meters (the pricing screenshot AL shared):

| Meter | Free | Pro (from $25/mo) | Overage on Pro |
|---|---|---|---|
| Database size (Postgres rows) | 500 MB | 8 GB / project | $0.125 / GB / mo |
| File storage (buckets, S3-style) | 1 GB | 100 GB | $0.0213 / GB / mo |
| Egress (bytes to browsers) | 5 GB | 250 GB | $0.09 / GB |
| Cached egress (CDN) | 5 GB | 250 GB | $0.03 / GB |

Findings:

- Free is a hard no for many GB. 500 MB DB is a wall; Supabase flips the project to read-only when you
  cross it. Pro is the floor the moment you are past toy scale.
- Database size is the expensive meter. Putting many GB of blob JSONB into Postgres rows is an
  anti-pattern: it bloats the DB, slows queries, and pays the premium rate. Blobs belong in Storage
  buckets ($0.02/GB) or Cloudflare R2 (zero egress, $0.015/GB storage).
- Egress is the sleeper cost. You pay it every time a browser downloads data, forever, not once. If
  the public site serves large data and gets real traffic, egress can dwarf storage.
- Do not host Marek's raw "many gigabytes." Most of it is raw solver/pruner byproduct (`eusolver_*.txt`,
  `pruned` family files, raw combinatorial blocks) the website never needs. That stays local or cold.
  Only the developed catalog (one row per unique tiling) needs serving, and even there `cell_codec`
  (exact ℤ[ζ₂₄], heavy) is not needed by the browser — serve `render_cell`.

The real question is not "many GB, so Pro?" It is "of Marek's many GB, how big is just the render
catalog?" That number decides whether Pro is $25 flat or $25 plus creeping overages. Get it from
Marek before committing.

## Size-reduction levers (ranked)

Compression will not rescue Free, and the biggest lever is not a codec.

1. Store the codec, materialize render cells lazily. A tiling is fully determined by its
   `{T1, T2, Seed}` codec (small integer arrays). `render_cell` is computed from it. Keep a complete
   catalog of tiny exact codecs; generate and cache `render_cell` only for tilings someone views. A
   million-tiling catalog becomes a million small rows plus a render cache of the few thousand ever
   looked at. Cost: "regenerate" means an Edge Function / API route that develops and caches, or a
   WASM developer client-side (the whole reason `render_cell` exists is to keep Cyclotomic out of the
   browser bundle). The edge-function-with-cache path is the pragmatic one.
2. Gzip/brotli + serve from a Storage bucket, lazy-loaded. `pipelineStorageFormat` already gzip-batches
   to `PIPELINE_BUCKET`. Repetitive small-integer JSON compresses 5–10×. Pagination makes egress track
   what users view, not catalog size. Handles most of the problem with almost no new code. (Postgres
   JSONB is already TOAST-compressed at rest, so the DB is not where this win hides; egress and
   bucket-vs-row is.)
3. Binary encoding (MessagePack/CBOR, or pack coordinates into typed arrays). Kills repeated keys and
   ASCII numbers; another 2–4× on top of gzip. Only if step 2 is not enough.
4. Intern repeated strings (`polygon_names`, `vc_types`, `symmetry`, `bravais`) into lookup tables,
   store integer IDs. Classic normalization win.
5. Thumbnails for the grid. A few-KB WebP or tiny SVG per tiling is smaller than geometry and removes
   client render cost; ship full geometry only on click.

Measure the render-catalog size before building any of these. If it is ~800 MB, do step 2 and stop. If
it is tens of GB, do step 1 and the rest follows.

## Sequencing (step by step, AL's call)

Validate the pipeline end to end first, then port data, then handle scale when it actually bites.

**Spec #1 — the data-display pipeline (prerequisite, independent of the trigger).** The only genuinely
missing seam is the oracle → `found_tilings` importer; the read path (`catalogueService`), the render
components, and the run gallery already exist. Marek runs the oracle by hand (as today); we import the
JSON and confirm it renders.

Walking skeleton: build the importer, load a small dataset, open the existing run gallery at
`/history/run/[runId]`, confirm it renders from Supabase.

Validate on regular AND at least one star tiling, not regular alone. Regular is the easy path
(`develop.py`, convex, already certified by `make check-regular`). Marek's "many gigabytes" are the
exotic palettes (star, isotoxal, composite), which are exactly where the render layer is known to be
dicey (float `Polygon.intersects` is unsound for non-convex/star per the repo CLAUDE.md; those develop
via `eu_develop`, not `develop.py`). A regular-only slice would render green and then break on the
actual data.

**Spec #2 — the `/experiments` trigger page (later).** The four net-new seams above. Not needed to
prove we can display Marek's data.

## Things to bake in now (cheap now, expensive to retrofit)

1. Store `cell_codec` on import even though the read path skips it. The codec is the source of truth and
   the regenerate-don't-store lever depends on it existing.
2. Keep all reads behind `catalogueService` (already true) so swapping Postgres-rows → bucket → R2
   later never touches the UI.
3. Lock `canonical_key` to the `oracleReconstructExact` identity from the start. A weak key means
   duplicate/collision cleanup after loading a million rows.
4. Turn on RLS + a read-only anon policy on the result tables before any public data lands.

## Security items flagged

**RLS is off on `search_campaigns` and `tilings`.** Anyone with the anon key can read and write them
right now. Once results flow to the public site, writes must be service-role-only, reads anon-only.
Not auto-applied; decide the policy. Shape:

```sql
ALTER TABLE public.tilings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_campaigns ENABLE ROW LEVEL SECURITY;
-- then add an anon SELECT policy per table; writes go through the service role, which bypasses RLS.
```

`found_tilings` / `runs` / `run_events` already have RLS enabled — confirm they carry a read policy so
the public console can see them.

**The trigger route runs `child_process`, which is remote code execution if it ever ships.**
Non-negotiable guards for spec #2: hard-refuse when `process.env.VERCEL` is set, bind to localhost,
validate `maxk` as an int in range, take `palette` from an allowlist of known palette names, and spawn
with an argument array (never `sh -c "…${palette}…"`). One string interpolation there is shell
injection on your own machine.

## Open questions / pending decisions

- Render-catalog size for Marek's palettes (the number that decides the storage plan). Get from Marek.
- What exactly are Marek's "many gigabytes" — raw solver output, developed catalogs, or images?
- Should slice #1 reuse `/history/run/[runId]` as the viewer, or add a dedicated catalogue view?
- Develop-on-demand host: Supabase Edge Function vs Next API route vs client WASM (deferred until the
  size number says step 1 is needed).

## Explicitly out of scope for now

Capacitor, Electron/Tauri installables, a dedicated always-on server, a local agent/daemon, a job
queue, remote triggering, binary/columnar codecs. All deferred behind measurement or a proven need.
