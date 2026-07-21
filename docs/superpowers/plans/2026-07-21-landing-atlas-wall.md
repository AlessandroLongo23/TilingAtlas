# Atlas Wall Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the welcome-card landing with the Atlas Wall: a full-viewport 4.6.12 tiling whose dodecagons are section doors, hexagons are catalog specimens, and edges carry the spherical/hyperbolic caps, per `docs/superpowers/specs/2026-07-21-landing-atlas-wall-design.md`.

**Architecture:** A pure geometry lib (`lib/render/atlasWall.ts`) expands the t1003 unit cell across a fixed 1920x1200 design canvas and deterministically assigns roles to cells (doors, daily specimen, specimens, glyphs). A server component renders the whole wall as one SVG (paths, clip-pathed specimen fills, `<a>` doors, masthead with live counts read from the public atlas JSONs). A small client scaler covers the viewport; two client cap islands reuse the existing spherical/hyperbolic thumbnails. Hover states are pure CSS.

**Tech Stack:** Next 16 App Router server components, SVG, CSS Modules, Vitest, existing atlas JSONs in `public/`, existing pure libs (`parquetTiling`, `parquetSvg`), existing thumbnails (`spherical-thumbnail`, `hyperbolic-developed-thumbnail`).

**Verified facts this plan builds on** (checked in-session, 2026-07-21):

- `public/reference-atlas.json` has 2,892 entries; library total (4,596) = base + eager shards `composable, isotoxal, mixed, scaled, polyomino, islamic` (+ hyperbolic 59, spherical 40) per `lib/services/referenceAtlas.ts:414-425`.
- `t1003` is 4.6.12: 6 cell polygons (1 dodecagon, 2 hexagons, 3 squares), `renderCell.{cellPolygons,basis}`, vertices as `[x,y]` pairs, edge length ~1.73 (median).
- The eleven uniform tilings are ids `t1001`..`t1011`.
- `buildDeformedTiling(instance, opts): DeformedTile[]` (`lib/render/parquetTiling.ts:165`) + `buildParquetSvgModel(tileOutlines)` (`lib/render/parquetSvg.ts:42`) are pure and server-usable.
- `SphericalThumbnail({solidId, size})` and `HyperbolicDevelopedThumbnail({patch, size})` are lazy client components rendering to `<img>`.
- Hyperbolic entries carry `developed.patch` (a patch id string, e.g. "hyp-8-8-8"); spherical entries carry `spherical.solid`.
- Theme tokens: `--color-surface`, `--color-fg`, `--color-fg-muted`, `--color-accent`, `--color-line-subtle` (`app/globals.css`).
- Old landing: `app/page.tsx` (server, force-dynamic, module-level atlas cache) + `components/landing-tiling-background.tsx` (parse/expand logic to generalize) + `components/landing-actions.tsx` (delete).

---

### Task 1: `lib/render/atlasWall.ts` — cell expansion + classification

**Files:**
- Create: `lib/render/atlasWall.ts`
- Test: `lib/render/atlasWall.test.ts`

API (exact):

```ts
import type { TranslationalCellData } from "@/classes/algorithm/types";

export interface WallPolygon {
  n: number;                      // polygon family size (12 | 6 | 4 for t1003)
  vertices: { x: number; y: number }[]; // design-canvas px, y down (SVG)
  cx: number; cy: number;         // centroid
  r: number;                      // max centroid->vertex distance (px)
  key: string;                    // stable "i,j,idx" cell id
}
export interface WallCells {
  dodecagons: WallPolygon[]; hexagons: WallPolygon[]; squares: WallPolygon[];
}
export function buildWallCells(
  cell: TranslationalCellData, width: number, height: number, pxPerEdge: number,
): WallCells | null
```

Implementation: port `parseBaseCell` + `expandToViewport` from `components/landing-tiling-background.tsx` (keep the ring-expansion with `maxRadius` stop and the `cellInView` bbox test), then map tiling coords to design px: `scale = pxPerEdge / medianEdge`, canvas center = cell bbox center, y negated. Classify by `poly.n` (12/6/4; anything else goes to the nearest bucket by vertex count). Overscan margin: one cell diagonal, as the old code does.

- [ ] Write failing tests (see Task 1 test block below)
- [ ] `pnpm vitest run lib/render/atlasWall.test.ts` fails with "buildWallCells is not a function"
- [ ] Implement `buildWallCells`
- [ ] Tests pass
- [ ] Commit `feat(landing): atlas wall cell expansion + classification`

Test block (real t1003 from disk; vitest runs in node so `node:fs` is fine):

```ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { buildWallCells, planWall } from "./atlasWall";

const atlas = JSON.parse(readFileSync("public/reference-atlas.json", "utf8"));
const t1003 = atlas.find((e: { id: string }) => e.id === "t1003");

describe("buildWallCells", () => {
  const cells = buildWallCells(t1003.renderCell, 1920, 1200, 46)!;
  it("classifies the three families", () => {
    expect(cells.dodecagons.length).toBeGreaterThan(4);
    expect(cells.hexagons.length).toBeGreaterThan(cells.dodecagons.length);
    expect(cells.squares.length).toBeGreaterThan(cells.hexagons.length);
    for (const d of cells.dodecagons) expect(d.vertices.length).toBe(12);
  });
  it("covers the canvas", () => {
    const all = [...cells.dodecagons, ...cells.hexagons, ...cells.squares];
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const p of all) for (const v of p.vertices) {
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    expect(minX).toBeLessThanOrEqual(0); expect(maxX).toBeGreaterThanOrEqual(1920);
    expect(minY).toBeLessThanOrEqual(0); expect(maxY).toBeGreaterThanOrEqual(1200);
  });
  it("keys are unique and stable", () => {
    const a = buildWallCells(t1003.renderCell, 1920, 1200, 46)!;
    const keys = [...a.dodecagons, ...a.hexagons, ...a.squares].map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(a.dodecagons[0].key).toBe(cells.dodecagons[0].key);
  });
});
```

### Task 2: `planWall` — deterministic role assignment

**Files:**
- Modify: `lib/render/atlasWall.ts`
- Test: `lib/render/atlasWall.test.ts` (append)

API (exact):

```ts
export interface WallDoorSpec { id: string; href: string; label: string; sublabel?: string }
export interface WallPlan {
  doors: { spec: WallDoorSpec; cell: WallPolygon }[];
  reserved: { spec: WallDoorSpec; cell: WallPolygon }[];
  daily: WallPolygon;                      // hexagon for the specimen of the day
  specimens: WallPolygon[];                // other visible hexagons, muted renders
  glyphs: { cell: WallPolygon; text: string }[]; // ~1 in 20 squares
}
export function planWall(cells: WallCells, opts: {
  width: number; height: number; seed: number;
  doorSpecs: WallDoorSpec[];               // in anchor order
  reservedSpecs: WallDoorSpec[];
  anchors: { x: number; y: number }[];     // canvas-fraction anchors, one per door+reserved
  exclude: { x: number; y: number; w: number; h: number }; // masthead rect, canvas fractions
  glyphTexts: string[];
}): WallPlan
```

Rules: seeded mulberry32 PRNG; doors greedily take the unused dodecagon nearest each anchor whose centroid avoids `exclude` and sits fully inside the canvas (`cx±r`, `cy±r` within bounds); daily = the in-canvas hexagon nearest the canvas point (0.62, 0.55) not touching a door; specimens = all remaining fully-in-canvas hexagons; glyphs = every 20th in-canvas square by PRNG order.

- [ ] Append failing tests: same seed twice gives deep-equal plans; door cells are 6 distinct dodecagons outside the exclusion rect; daily is not among specimens
- [ ] Run: fails with "planWall is not a function"
- [ ] Implement
- [ ] Tests pass
- [ ] Commit `feat(landing): deterministic wall role assignment`

### Task 3: server data loader + counts

**Files:**
- Create: `lib/services/landingData.ts` (server-only; `node:fs`, NOT re-exported from any barrel)

```ts
export interface LandingData {
  wallCell: TranslationalCellData;         // t1003
  uniform11: { id: string; family: string; cell: TranslationalCellData }[]; // t1001..t1011
  euclideanCount: number;                  // base + eager shards (library semantics)
  hyperbolicCount: number; sphericalCount: number;
  dailyEntry: { id: string; k: number; kCount: number; cell: TranslationalCellData };
  specimenEntries: { id: string; cell: TranslationalCellData }[]; // request-random pool
  libraryMosaic: TranslationalCellData[];  // 9 for the Library door
  playPatch: { id: string; cell: TranslationalCellData };
  capHyperbolicPatch: string;              // developed.patch id
  capSphericalSolid: string;               // spherical.solid id
  dateSeed: number;                        // UTC yyyymmdd
}
export async function loadLandingData(): Promise<LandingData>
```

Module-level cache of parsed files (same pattern as old `app/page.tsx`); per-request randomness only for specimen/mosaic picks; `dailyEntry` picked by `dateSeed % pool.length` from entries with small cells (cellPolygons.length <= 12 so the hexagon render stays legible). Counts are best-effort sums (missing shard file logs and contributes 0, mirroring `referenceAtlas.ts`).

- [ ] Implement loader
- [ ] Add temporary `pnpm tsx` smoke script call or rely on Task 6 build; verify counts print 4596/59/40 via `node -e` one-liner
- [ ] Commit `feat(landing): server landing data loader with live counts`

### Task 4: `components/atlas-wall.tsx` + CSS module — the SVG stage

**Files:**
- Create: `components/atlas-wall.tsx` (server) — exports `AtlasWall({ data }: { data: LandingData })`
- Create: `components/atlas-wall.module.css`
- Create: `components/atlas-wall-scaler.tsx` (client, ~40 lines)

Structure (exact):

- Scaler: `'use client'`; renders `<div class=viewport><div class=canvas style={transform}>{children}</div></div>`; on mount + resize sets `scale = Math.max(vw/1920, vh/1200)`, `transform: translate(-50%,-50%) scale(s)` from a centered anchor; pre-JS CSS fallback is the same translate without scale.
- One `<svg viewBox="0 0 1920 1200" width=1920 height=1200>`:
  - paper `<rect>` fill `var(--color-surface)`
  - all cell paths, stroke `color-mix(in oklab, var(--color-fg) 45%, transparent)`, `stroke-width` 1.1, fill `var(--color-surface)` (hover/click targets need fill)
  - specimens: per hexagon a `<clipPath>` (its polygon) + inner `<g>` with the entry's cellPolygons expanded to fill the hexagon bbox (reuse `expandToViewport` via a `renderCellIntoBox(cell, box, pxPerEdge)` helper added to `atlasWall.ts`), fills from the existing `polygonHue` HSB mapping; `.specimenMuted` applies `filter: saturate(0.12) opacity(0.5)`, hover/focus lifts it; daily specimen gets `.specimenDaily` (no muting) + `<text>` label `id · one of {kCount} at k = {k}` under the hexagon
  - doors: `<a href className=door>` around the dodecagon path + door content + `<text>` label (small caps, `letter-spacing`) with count sublabel; door content muted at rest like specimens
  - reserved doors: `stroke-dasharray 5 4`, faint content, label + "in preparation"
  - glyph squares: `<text>` vertex config, `fill var(--color-fg-muted)`, links to `/theory`
- Door contents (all server SVG):
  - Play: `renderCellIntoBox(playPatch)`
  - Library: 3x3 grid of `renderCellIntoBox` minis inside the dodecagon bbox
  - Theory: 11 circles on a ring (radius 0.62R), each clip-pathed mini of t1001..t1011
  - Parquet: `buildDeformedTiling({tiling:"square", cols:14, rows:3}, {from:STRAIGHT, to:PINWHEEL, profile:ramp, amount:0.8})` -> outlines -> `buildParquetSvgModel` -> paths, clipped to the dodecagon; `.parquetDrift` CSS animation translates the group slowly left and back (the page's only resting motion; `prefers-reduced-motion` disables it)
  - Reserved Aperiodic: hat polykite outline (13-vertex polykite on the kite lattice; hardcode the standard vertex list) repeated 3-4 times, faint; Reserved Substitution: 5 thick + 5 thin Penrose rhombs fanned around a point, hardcoded
- Masthead: HTML absolutely positioned over the SVG's upper-left (inside the canvas div, so it scales with the wall): h1 "Tiling Atlas", the one-sentence subtitle, counts line where each fragment links (`/library`, `/play?geometry=hyperbolic`, `/play?geometry=spherical`, `/theory`); text sits on `color-mix` paper wash so strokes underneath don't collide with glyphs
- Caps: absolutely positioned islands at left/right edges (in-canvas coords): circle-clipped `SphericalThumbnail solidId={capSphericalSolid} size=220` and `HyperbolicDevelopedThumbnail patch={capHyperbolicPatch} size=220` inside an `<a>`; server-drawn SVG circle + count label beneath serves as the no-JS fallback

- [ ] Implement scaler, stage, doors, masthead, caps
- [ ] `pnpm build` green
- [ ] Commit `feat(landing): atlas wall SVG stage, doors, masthead, caps`

### Task 5: rewrite `app/page.tsx`, delete old landing components

**Files:**
- Modify: `app/page.tsx` — `loadLandingData()` + `<AtlasWallScaler><AtlasWall data/></AtlasWallScaler>`, keep `force-dynamic`
- Delete: `components/landing-tiling-background.tsx`, `components/landing-actions.tsx`

- [ ] Rewrite page, delete files, `grep -rn "landing-tiling-background\|landing-actions"` shows no references
- [ ] `pnpm build` green
- [ ] Commit `feat(landing): swap welcome card for the atlas wall`

### Task 6: verification + visual pass

- [ ] `pnpm vitest run lib/render/atlasWall.test.ts` green
- [ ] `pnpm build` green (the workflow gate)
- [ ] Screenshot light + dark at 1440x900 and 390x844 via `scripts/visual-check.mjs` (dark: `--setup` toggles the theme store/localStorage), Read the PNGs
- [ ] Iterate on stroke weight, mute levels, label type, door scale until the wall reads as ink-on-paper with one colored specimen and one moving door; each iteration re-screenshots
- [ ] Verify every door/cap/glyph navigates (Playwright click-through: `/play`, `/library`, `/theory`, `/parquet`, geometry-filtered play URLs)
- [ ] Commit `feat(landing): visual tuning pass`; append 3-6 line SYNC.md entry

## Self-review

Spec coverage: P1 stage (T1/T4), P2 doors (T4), P3 reserved (T4), P4 caps (T4), P5 specimens/daily/glyphs (T2/T3/T4), P6 counts (T3), P7 hover/focus CSS (T4), P9 scaler crop (T4), P10 deletions (T5); deferred items listed in spec Out-of-scope. Types consistent: `WallPolygon/WallCells/WallPlan/LandingData` defined once, consumed in T4/T5. No placeholders: door contents, cap components, count semantics, and test bodies are specified concretely; the only open-ended step is the explicitly-bounded visual iteration loop in T6.
