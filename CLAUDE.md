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

## Workflow rule

After every code change, run `pnpm build` to check for errors and warnings before reporting the task complete. `pnpm lint` and `pnpm test` are not substitutes — only a full build surfaces the real issues.

## Commands

- `pnpm dev` — Next dev server (Turbopack)
- `pnpm build` / `pnpm start` — production build / serve
- `pnpm lint` — ESLint (`eslint-config-next`)
- `pnpm test` — Vitest once; `pnpm test:watch` for watch mode; `pnpm vitest run path/to/file.test.ts` for a single file
- `pnpm pipeline` — runs `lib/algorithm/run-pipeline.ts` under `tsx` (server-only; uses `node:fs`)

`pnpm build` runs the TypeScript type checker; type errors fail the build. For fast iterative checking, run `pnpm tsc --noEmit`.

## Environment variables

Uses **SvelteKit-style `PUBLIC_*`** names, not `NEXT_PUBLIC_*`. `next.config.ts` whitelists them in the `env` block so the browser bundle can see them.

- `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` — public
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, used by `lib/supabase/service.ts` for pipeline writes
- `PIPELINE_SECRET` — server-only; `proxy.ts` requires `Authorization: Bearer $PIPELINE_SECRET` on every `POST /api/pipeline/*`

## Architecture

This is a port of a SvelteKit app (`../TilingAtlas` @ `svelte-final`) to Next 16 App Router + React 19. The port preserves the original layer boundaries rather than rewriting them idiomatically — understanding those boundaries matters more than understanding Next conventions.

**Routing.** Route groups under `app/(app)/` share the app-shell layout (`Nav` + store bootstrap). Top-level routes: `/library`, `/lab` (+ `/lab/[hash]/{polygons,vcs,seeds,expanded-seeds,tilings}`), `/play`. (The `/theory` markdown page was removed 2026-06 — it documented the superseded wallpaper-fitting method; the historical write-ups live in `../resources/drafts/`, the implemented method in `docs/DEVELOPMENT_NOTES.md`.) Seven pipeline API handlers live under `app/api/pipeline/*/`. Next 16 replaces `middleware.ts` with `proxy.ts` at the root — that's where pipeline auth is enforced.

**State & data.** Zustand owns client state (13 slices under `lib/stores/`: configuration, audio, debug, modal, …). TanStack Query owns server data (`lib/query/` provider + key factory). Supabase is accessed through three clients in `lib/supabase/`: browser, server, session (SSR), plus a service-role factory used only by pipeline routes.

**Algorithm pipeline.** `lib/algorithm/` is the core domain — `pipeline-core` composes `generatePolygons` → `generateVCs` → `generateVCsWithCompatibilityGraph` etc., with results gzip-batched to Supabase Storage via `pipelineStorageFormat`. `run-pipeline.ts` is the CLI entry. `lib/classes/` holds the domain TS classes (polygons, algorithm types, exact arithmetic: `Cyclotomic.ts`, `algorithm/exact/Surd.ts`). The live enumeration path is `algorithm/PeriodSolver.ts` + `algorithm/LatticeEnumerator.ts` + `algorithm/KUniformityChecker.ts` — see `docs/DEVELOPMENT_NOTES.md`.

**Server-only import hazards.** `lib/classes/algorithm/TilingGenerator.ts` and all of `lib/classes/generator/*` are **intentionally not re-exported from `@/classes`** — they import `node:fs` or reference pre-Zustand store names. Import them directly from their specific files, and only in server-only contexts. A client component pulling them through the barrel will break the build.

**Rendering primitives.** p5.js is wrapped by `lib/hooks/useP5.ts` (Strict-Mode safe) with domain variants `useVcCanvas`, `usePolygonsCanvas`. Chart.js goes through `react-chartjs-2`. (The `react-markdown` theory-rendering stack was removed with the `/theory` page, 2026-06; its npm deps linger in `package.json` until pruned.)

**UI.** `components/ui/` is 14 primitives — Modal and Tabs via Radix, the rest hand-rolled. Domain components in `components/*.tsx`.

## Agent sync protocol (two agents, one project)

This repo is one of three siblings under `../`: `TilingAtlas/` (this repo — **you own it**),
`../thesis/` (LaTeX) and `../resources/` (papers/drafts) — **owned by the thesis agent (Cowork); do
not edit those two folders.**

- **`docs/SYNC.md` is the shared handoff board.** Read it at session start. After every milestone
  (feature landed, counts changed, method pivoted), append a dated, signed (`CC`) entry: commit hash,
  what changed, what it means for the thesis. 3–6 lines, newest last, never rewrite old entries.
- Keep the long-form record in `docs/DEVELOPMENT_NOTES.md` as before — including failed ideas and
  *why* they failed; the thesis must reconstruct the full development journey from it.
- The algorithm's prose description lives in the thesis (`../thesis/chapters/algorithm.tex`), not in
  the app. Don't recreate an in-app theory page.

## Migration history

Port was done in 8 phases, each its own commit — replay via `git log`. High-level phases are documented in `README.md`. Full plan: `c:\Users\longo\.claude\plans\sorted-marinating-plum.md`.
