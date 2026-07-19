@AGENTS.md

# CLAUDE.md

You are my ruthless mentor and sparring partner. Your job is to find the truth and tell it to me straight. Hurt my feelings if needed.
Default rules:
Never agree with me just to be agreeable. If I'm wrong, say so directly.
Find the weak spots and blind spots in my thinking. Point them out even if I didn't ask.
No flattery. No "great question!" No softening the blow unnecessarily.
If you're unsure about something, say you're unsure. Verify with research, and provide me sources to your research.
Push back hard. Make me defend my ideas or abandon bad ones.
If I ever seem to want validation more than truth. call it out.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Next.js 16 notice:** see `AGENTS.md`. APIs and file conventions differ from older Next.js. Consult `node_modules/next/dist/docs/` before writing framework code.

## Project goal (the mission — durable)

Create an atlas of tilings that presents a complete catalogue of hyberbolic, euclidian, spherical tilings
 

## The engine — what "the algorithm" means (durable; added 2026-07-12, AL directive)

Unless AL says otherwise, **"the algorithm" / "our algorithm" / "the engine" / "the solver" means the
Čtrnáct combinatorial engine at `tools/ctrnact-oracle/`** — NOT the TS lattice/PeriodSolver code. This
is the current primary enumeration method (thesis pivot 2026-07-10, `docs/thesis-pivot-ctrnact-2026-07-10.md`).

- **What it is.** Marek Čtrnáct's combinatorial dual-search ("čtrnáct" = Czech for 14; his original was
  hardcoded to k=14), ported to a C++ pipeline. It searches *duals* of k-uniform tilings by gluing
  vertex-figure half-edges (Conway symbols), checks each vertex closes to a divisor of 360°, and prunes
  isomorphic duplicates (WL/DFA canonical form). It touches geometry only at the end (develop) — no
  per-node cyclotomic arithmetic, which is why it reaches k=16 in hours where the lattice method stalled at k=3.
- **Palette-driven.** The tile alphabet is data: `alphabets/palettes/*.json` → `alphabets/gen_alphabet.py`
  builds the alphabet the C++ solver loads. Existing palettes: `regular`, `regular-z24`, `star{18,20,24,...}`,
  `isotoxal-*`, `composite-convex`, `composite-decomp`, `combined-z24`. A new tile family is mostly a new
  palette + a bounded `gen_alphabet.py` generalization — no search rewrite. See the composite-tiles spec
  (`docs/superpowers/specs/2026-07-11-composable-tiles-design.md`) for the template.
- **Pipeline.** `eu_solver` (raw) → `eu_pruner` (dedup) → `eu_develop` (exact ℤ[ζ₁₂] geometry, `{T1,T2,Seed}`
  cells). Run: `cd tools/ctrnact-oracle && make PALETTE=<name>` then `PALETTE=<name> ./run-oracle.sh <k>`.
  Regular palette reproduces A068599 to k=16 (k=1 = 10, octagon-blind; re-add t1002 by hand).
- **Guard.** `make check-regular` must stay byte-identical after any engine edit — the load-bearing
  regression proving an alphabet/engine change did not disturb the regular catalog.
- **The TS `PeriodSolver` / `LatticeEnumerator` / `KUniformityChecker` path is AL's OWN prior lattice
  method, now SUPERSEDED.** It stalled at k=3 and carries a proven negative result (HNF incompleteness on
  mixed √2/√3 cells). Kept as a characterized-barrier thesis result and an independent k≤3 cross-check —
  NOT the engine to extend for new work unless AL names it. `scripts/th10-scout.ts` belongs to this legacy path.

## Session start — read these BEFORE coding

1. `docs/STATUS.md` — **the current-state cache: frontier, the one live NEXT per party, active gates.**
   Read this first — it's the 30-second "where are we." Regenerable from the logs, so treat it as a
   pointer, not history.
2. `docs/SYNC.md` — the CC⇄TA handoff log (append-only, 3–6-line entries). Full pre-2026-06 history is
   rotated into `docs/archive/`.
3. `docs/DEVELOPMENT_NOTES.md` — the narrative source of truth; at minimum the **latest section** and
   the **⚑ flag lists**. `docs/K2_DIAGNOSIS.md` holds the measurement log, `docs/LATTICE_ENUMERATION_DESIGN.md`
   the enumeration design (read its STATUS header — parts are corrected), `docs/RESEARCH_NOTES.md` the literature.

## Settled decisions — do NOT re-litigate (proofs/measurements behind each)

- **Chirality: mirror pairs MERGE** (count once) — matches A068599; k=2 target is 20. (NOTES §12.8)
- **HNF sublattice enumeration is provably incomplete** for mixed √2/√3 cells (the 4.8.8 obstruction) — do not implement it, despite RESEARCH_NOTES §0 recommending it. (NOTES §12.3)
- **Emit-on-validated-closure + prune is UNSOUND** in the planar expander (boundary can extend non-periodically into a *different* tiling). (NOTES §6)
- **ℤ[ζ₂₄] is dense in ℂ**: finiteness arguments must bound the **step count**, never Euclidean length. (NOTES §12.5)
- **Float `Polygon.intersects` is sound only for convex regular tiles**; exact segment intersection is a prerequisite for star/non-convex polygons. (NOTES §9.4)
- **`V_i ≤ 12` is a per-ORBIT bound, not per-VC-type** (orbits can share a VC type). (NOTES §12.8)
- **Measure at the real threshold/gate** — the threshold-4 profiling verdict was an artifact. (NOTES §5)
- **Completeness knobs are not speed dials** (node caps, area caps, direction filters): if turning one down can lose a tiling, the fast regime is the incomplete regime. (NOTES §11.4)
- **Default to 12 directions (ℤ[ζ₁₂], even ζ₂₄ powers) — the octagon is a solved special case, NOT a completeness gap** — AL decision, 2026-07-08. The full 24 directions (ℤ[ζ₂₄]) are needed ONLY to represent octagon periods (odd-power √2 lengths); {3,4,6,12} all live in even powers. **Proven fact (do NOT re-litigate):** the octagon appears in exactly ONE vertex configuration, 4.8.8 (the only regular-polygon vertex whose angles include 135° and sum to 360°; 3.8.24 is angle-valid but killed by the odd-polygon adjacency lemma — G&S *Tilings and Patterns*). A single octagon forces every one of its vertices to be 4.8.8, its corona alternates square/octagon, and this propagates deterministically to the UNIQUE 4.8.8 tiling. So **any tiling containing an octagon IS the 4.8.8 tiling ⇒ 1-uniform**; there are provably ZERO octagon-bearing tilings at k ≥ 2. ⟹ 12-direction is **complete for all k ≥ 2** (targets 20/61/151/332/673 unchanged) and complete for k=1 **minus exactly t1002** (11 → 10). t1002 is the unique, known 4.8.8 tiling — re-add it by hand; the exhaustiveness claim stands (everything else provably complete, the one octagon tiling handled analytically). Use 24 directions only to re-derive/verify t1002 itself. Knob: `TH10_DIRS=12` in `scripts/th10-scout.ts`.

## Workflow rule

After every code change, run `pnpm build` to check for errors and warnings before reporting the task complete. `pnpm lint` and `pnpm test` are not substitutes — only a full build surfaces the real issues.

## Visual inspection (Playwright — the default tool)

To SEE a change in the real running app, drive it with Playwright and screenshot it, then Read the PNG back. Playwright (`playwright` ^1.61, Chromium already installed) is the default visual-inspection tool — prefer it over guessing or asking AL to check.

- Helper: `node scripts/visual-check.mjs --out /tmp/shot.png` (defaults to `http://localhost:3000/play`). Flags: `--url`, `--setup "<js>"` (evaluated in the page after load), `--wait <ms>`, `--width`/`--height`, `--selector`. It waits for `domcontentloaded` + the selector — NOT `networkidle`, which never settles because the dev server holds an HMR socket open — lets a few RAF frames paint, then writes the PNG.
- Needs the dev server up: `pnpm dev` (port 3000). Next 16 refuses a second dev server for the same dir, so reuse the running one; if it is wedged (no HTTP response), kill it and restart.
- Drive any store flag from the page via the dev-only `window.__stores` hook (attached in `lib/stores/configuration.ts`) — this is how to exercise a flag with no UI, e.g. the flat-shader path: `--setup "window.__stores.configuration.setState({ euclideanShader: true, showPolygonPoints: true })"`.
- For parity checks, capture flag-on vs flag-off at the same viewport and compare the two PNGs (how M1b was verified).
- Frame-time / FPS: `node scripts/measure-fps.mjs` samples RAF deltas across store scenarios (default: `showPolygonPoints` on/off at min zoom, p5 vs GPU). **Run it HEADED (the default) — headless Chromium uses software WebGL (SwiftShader) and makes the shader path look ~15× slower than it is; only trust WebGL perf from a headed run, and check the printed `webgl renderer` is a real GPU, not SwiftShader.** RAF delta is capped at the display refresh (e.g. 8.3ms on a 120Hz panel), so "at the cap" means the frame budget is not the bottleneck.

## Commands

- `pnpm dev` — Next dev server (Turbopack)
- `pnpm build` / `pnpm start` — production build / serve
- `pnpm lint` — ESLint (`eslint-config-next`)
- `pnpm test` — Vitest once; `pnpm test:watch` for watch mode; `pnpm vitest run path/to/file.test.ts` for a single file
- `pnpm pipeline` — runs `lib/algorithm/run-pipeline.ts` under `tsx` (server-only; uses `node:fs`)
- `USE_PERIOD_SOLVER=1 pnpm pipeline` — the **live** solve-for-period path (replaces seedsExpansion + extract)
- `pnpm tsx scripts/probe-pipeline.ts` — per-seed k=2 count harness with composition digest (determinism check)

**Context tooling** (zero-dep Node — `scripts/status.mjs`, `scripts/docs-check.mjs`):
- `pnpm status` — the **derived** current-state board (push state, `\describedcommit` drift, last 5 SYNC handoffs, the curated `docs/NEXT.md`). Run it first; being derived, it can't go stale. `docs/STATUS.md` is the prose cache; this is the live view.
- `pnpm docs:check` — docs invariant linter (dead nav-doc links, staged litter, SYNC entries >6 lines, `\describedcommit` ancestry). Runs `--staged` as the pre-commit hook.
- `pnpm hooks:install` — once per clone: activates the pre-commit hook (`core.hooksPath=scripts/hooks`). Bypass a blocked commit with `git commit --no-verify`.

`pnpm build` runs the TypeScript type checker; type errors fail the build. For fast iterative checking, run `pnpm tsc --noEmit`.

## Environment variables

Uses **SvelteKit-style `PUBLIC_*`** names, not `NEXT_PUBLIC_*`. `next.config.ts` whitelists them in the `env` block so the browser bundle can see them.

- `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` — public
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, used by `lib/supabase/service.ts` for pipeline writes
- `PIPELINE_SECRET` — server-only; `proxy.ts` requires `Authorization: Bearer $PIPELINE_SECRET` on every `POST /api/pipeline/*`

## Architecture

This is a port of a SvelteKit app (`../TilingAtlas` @ `svelte-final`) to Next 16 App Router + React 19. The port preserves the original layer boundaries rather than rewriting them idiomatically — understanding those boundaries matters more than understanding Next conventions.

**Routing.** Route groups under `app/(app)/` share the app-shell layout (`Nav` + store bootstrap). Top-level routes: `/library`, `/lab` (+ `/lab/[hash]/{polygons,vcs,seeds,expanded-seeds,tilings}`), `/play`, `/theory`. (The original `/theory` method write-up was removed 2026-06 — it documented the superseded wallpaper-fitting method; the historical write-ups live in `../resources/drafts/`, the implemented method in `docs/DEVELOPMENT_NOTES.md`. The route returned 2026-07 as a mathematical-background page: markdown from `public/theory/uniform-tilings.md` with interactive tiling cards embedded via `<tiling-card>` tags.) Seven pipeline API handlers live under `app/api/pipeline/*/`. Next 16 replaces `middleware.ts` with `proxy.ts` at the root — that's where pipeline auth is enforced.

**State & data.** Zustand owns client state (13 slices under `lib/stores/`: configuration, audio, debug, modal, …). TanStack Query owns server data (`lib/query/` provider + key factory). Supabase is accessed through three clients in `lib/supabase/`: browser, server, session (SSR), plus a service-role factory used only by pipeline routes.

**Algorithm pipeline.** `lib/algorithm/` is the core domain — `pipeline-core` composes `generatePolygons` → `generateVCs` → `generateVCsWithCompatibilityGraph` etc., with results gzip-batched to Supabase Storage via `pipelineStorageFormat`. `run-pipeline.ts` is the CLI entry. `lib/classes/` holds the domain TS classes (polygons, algorithm types, exact arithmetic: `Cyclotomic.ts`, `algorithm/exact/Surd.ts`). `algorithm/PeriodSolver.ts` + `algorithm/LatticeEnumerator.ts` + `algorithm/KUniformityChecker.ts` are AL's **legacy lattice engine** — superseded 2026-07 by the Čtrnáct engine (`tools/ctrnact-oracle/`; see the "The engine" section above and `docs/thesis-pivot-ctrnact-2026-07-10.md`). They remain the k≤3 cross-check and a characterized-barrier thesis result, NOT the primary enumerator. Narrative in `docs/DEVELOPMENT_NOTES.md`.

**Server-only import hazards.** `lib/classes/algorithm/TilingGenerator.ts` and all of `lib/classes/generator/*` are **intentionally not re-exported from `@/classes`** — they import `node:fs` or reference pre-Zustand store names. Import them directly from their specific files, and only in server-only contexts. A client component pulling them through the barrel will break the build.

**Rendering primitives.** p5.js is wrapped by `lib/hooks/useP5.ts` (Strict-Mode safe) with domain variants `useVcCanvas`, `usePolygonsCanvas`. Chart.js goes through `react-chartjs-2`. The `react-markdown` stack (remark-math/rehype-katex/rehype-raw) renders `/theory`, with custom markdown tags mapped to React components. The flat WebGL pipeline is shared: GLSL + `FlatCellRenderer` in `lib/render/flatTilingGL.ts`, interaction constants/math in `lib/render/viewControls.ts` — both `euclidean-canvas.tsx` (/play) and `interactive-tiling-preview-card.tsx` (/theory) draw and feel through them.

**UI.** `components/ui/` is 14 primitives — Modal and Tabs via Radix, the rest hand-rolled. Domain components in `components/*.tsx`.

## Agent sync protocol (multiple agents, one project)

This repo is one of three siblings under `../`: `TilingAtlas/` (this repo — **you own it**),
`../thesis/` (LaTeX) and `../resources/` (papers/drafts/notes) — **owned by the thesis agent (TA, in
Cowork); do not edit those two folders.** All three are under git (`resources/` since 2026-06-07).

**Two tiers — never mix them.**

- **Ledgers — sacred: append-only, never trimmed, ONE writer per file.** The natural-language history
  the thesis (`../thesis/chapters/journey.tex`) is written from. Rotate to `docs/archive/<name>-YYYY-MM.md`
  when a file gets large — rotation *moves* history, never deletes it.
  - `docs/DEVELOPMENT_NOTES.md` — CC's session-by-session narrative (code/algorithm); failed ideas and
    *why* they failed belong here too.
  - `../resources/research/TA_LOG.md` — the TA's chronological ledger (theory/proofs); topical detail in
    the sibling `resources/research/*.md` notes.
  - `docs/SYNC.md` — the CC⇄TA **handoff log**. Append a dated, signed (`CC`/`TA`) entry per milestone:
    **3–6 lines** = what landed + commit hash + a link to the ledger note holding the detail. Newest
    last, never rewrite old entries, never inline long-form narrative (the ledgers are for that). Short
    entries also keep the merge-conflict surface small when branches land.
- **Cache — `docs/STATUS.md`.** Current state only (frontier, one live NEXT per party, active gates).
  Mutable, disposable, regenerable from the ledgers; overwrite freely. Never write history here.

- The algorithm's prose description lives in the thesis (`../thesis/chapters/algorithm.tex`), not in
  the app. Don't recreate an in-app write-up of the *method*. (The `/theory` page re-added 2026-07 is
  different in kind: it teaches the mathematical background — the 11 uniform tilings — with interactive
  previews, AL directive. Keep method prose out of it.)

## Migration history

Port was done in 8 phases, each its own commit — replay via `git log`. High-level phases are documented in `README.md`. (The full plan file lived on the original Windows machine — historical, unreachable.)

## Experiments

When run the experiments, log synchronously in a file in /experiments/results folder, so that I can inspect the data as it comes. For the format, log the progress, ETA, and make it human readable.