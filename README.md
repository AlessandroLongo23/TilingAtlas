# The Tiling Atlas

A Next.js 16 app for exploring uniform tilings of the plane. Ported from a
SvelteKit codebase (see [../TilingAtlas](../TilingAtlas) tagged
`svelte-final`).

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind v4** + **Motion** for animations
- **Zustand** (client state) + **TanStack Query** (server data)
- **Supabase** via `@supabase/ssr`
- **p5.js** via a custom `useP5` hook (Strict-Mode safe)
- **Chart.js** via `react-chartjs-2`
- **Radix** + hand-rolled primitives under `components/ui/`

## Getting started

```bash
pnpm install
cp .env.local.example .env.local   # fill in PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, PIPELINE_SECRET
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

| | |
| --- | --- |
| `pnpm dev` | Next.js dev server with Turbopack |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm test` | Vitest (classes + algorithm parity) |
| `pnpm pipeline` | Runs `lib/algorithm/run-pipeline.ts` via `tsx` |
| `pnpm lint` | ESLint |

### Environment

The app uses **SvelteKit-style env var names** (`PUBLIC_*`) rather than
Next.js's `NEXT_PUBLIC_*`. `next.config.ts` lists them in the `env` block so
the browser bundle sees them. Required:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, for `/api/pipeline/*` writes)
- `PIPELINE_SECRET` (server-only, guards `POST /api/pipeline/*`)

## Project layout

```
app/
  (app)/                 App shell (Nav + store bootstrap)
    layout.tsx
    library/             /library
    lab/                 /lab, /lab/[hash]/{polygons,vcs,seeds,expanded-seeds,tilings}
    play/                /play (Canvas + Sidebar — in-progress)
  api/pipeline/*/        7 route handlers (gzip-batched Supabase Storage pipeline)
  error.tsx, not-found.tsx, page.tsx, layout.tsx
components/
  ui/                    14 primitives (Modal, Tabs via Radix; rest hand-rolled)
  *.tsx                  Domain components (Cards, Pickers, Sidebars, Modals, …)
lib/
  algorithm/             pipeline-core, run-pipeline, paramsFolder, conwayCost,
                         transformFinder, generatorEncoding, PipelineLogger,
                         pipelineStorageFormat
  classes/               domain TS classes (polygons, algorithm, exact arithmetic, …)
  hooks/                 useP5, useVcCanvas, usePolygonsCanvas
  query/                 TanStack Query provider + key factory
  services/              Supabase-backed services (campaigns, storage, search oracle)
  stores/                13 Zustand slices (configuration, audio, debug, modal, …)
  supabase/              browser/server/session clients + service-role factory
  utils/                 pure utils (math, geometry, …)
proxy.ts                 Next 16 request proxy (was middleware.ts in Next 15)
```

## Auth + API

- `/api/pipeline/*` **GET** endpoints (`list-folders`, `structure`) are open.
- `/api/pipeline/*` **POST** endpoints require
  `Authorization: Bearer $PIPELINE_SECRET`. Enforced in `proxy.ts`.
- Supabase Storage writes use a service-role client
  (`lib/supabase/service.ts`), scoped to server code only.

## Known caveats

- The `/theory` page (markdown rendering of the original 7-step design) was
  **removed 2026-06**: it documented a superseded method. The historical
  write-ups live in `../resources/drafts/`; the implemented algorithm is
  documented in `docs/DEVELOPMENT_NOTES.md`. `public/theory/images/vertexTypes/`
  is kept — the Library vertex cards serve images from that path.
- `lib/classes/algorithm/TilingGenerator.ts` and the entire
  `lib/classes/generator/*` tree are intentionally **not** re-exported from
  `@/classes` — they import `node:fs` or pre-Zustand store names. Import
  directly from the specific files in server-only contexts.

## Tests

```bash
pnpm test
```

Currently covers:

- `Vector` math (add/sub/rotate/dot/cross/heading/…)
- Polygon-name parsing (`extractDataFromPolygonName`, `comparePolygonNames`)
- `pipeline-core` high-level chain: `generatePolygons`, `generateVCs`,
  `generateVCsWithCompatibilityGraph` on `reg n_max=4`

## Migration notes

Port history is in the git log — each phase was committed separately and
can be replayed. High-level:

1. Scaffold (Next 16, Tailwind v4, Supabase SSR helpers)
2. Port utils, algorithm core, classes, services, Zustand slices
3. Port 14 UI primitives + rendering primitives (p5, Chart.js)
4. Port 33/36 domain components (Canvas/Sidebar wired through `useP5` and the configuration store)
5. Port 22 routes to App Router (13 page routes + 7 API + proxy middleware)
6. Port API pipeline handlers with proxy auth
7. Markdown infrastructure for /theory + tilings-storage pagination
8. Cutover — this README + archived legacy repo

Full plan:
`c:\Users\longo\.claude\plans\sorted-marinating-plum.md`
