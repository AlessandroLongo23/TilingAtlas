# Landing page — conventional skeleton, catalog material (2026-07-22)

Approved by AL 2026-07-22 after the Atlas Wall direction was rejected as too unconventional.
The page reads instantly as a landing page; the uniqueness lives in the material: every visual
is a real render from the atlas, every number is computed from the atlas files at request time.

## Bands (top to bottom)

**P1 Hero (~65vh).** Full-bleed live tiling background: a random Euclidean entry from the merged
eager atlas, drawn with the shared `renderTilingToContext` (same colors as the library thumbnails),
theme-aware background. No dark overlay; a soft legibility gradient sits behind the text block only.
Bottom-right caption names the specimen: id · compact vertex config · k, with "Open in Play →"
(`/play?source=reference&tiling=<id>`) and a shuffle button (`router.refresh()`; the page is
force-dynamic so the server re-picks).

**P2 Masthead.** Left-aligned on the hero: title, one sentence
("A catalogue of tilings of the plane, the sphere, and the hyperbolic plane."), and a counts line
computed from the atlas files: `4,596 Euclidean · 59 hyperbolic · 40 spherical · complete through
k = 6 · frontier at k = 16`. Count fragments link to /library (per-geometry via `?geo=`); the two
claims link into /theory. Buttons: "Start exploring" → /play (primary), "Browse the library" →
/library (secondary). Headline number is the Euclidean eager-atlas count (the library's own number).

**P3 Collections grid.** One card per section, each with a live miniature, name, one sentence,
count, and a completeness badge:
- Play — interactive draggable patch (`InteractiveTilingPreviewCard`, t1003 = 4.6.12).
- Library — 3×3 mosaic of random Euclidean thumbnails, re-dealt per page load.
- Theory — the 11 uniform tilings (galebach k=1, t1001–t1011) as a ring of micro-thumbnails.
- Parquet — miniature strip morphing on a slow loop (square → pinwheel, sine D(x)); the page's
  only resting motion; paused under `prefers-reduced-motion`.
- Hyperbolic — `HyperbolicDevelopedThumbnail` patch hyp-7-7-7, count 59 → /library?geo=hyperbolic.
- Spherical — `SphericalThumbnail` truncated icosahedron (the football), count 40 → /library?geo=spherical.

**P4 Coming-soon cards.** Same grid, dashed border, muted: Aperiodic (faint hat-monotile patch,
computed polykite geometry) and Substitution (faint Penrose sun of 5 thick rhombs), labeled
"in preparation". Not links.

**P5 Completeness badges.** Pill component with the vocabulary: proven complete · complete through
k = 6 · open frontier · infinite family. Assignments: Theory "exactly 11 — proven", Library
"complete through k = 6", Play "all three geometries", Parquet/Hyperbolic "infinite family",
Spherical "finite catalogue".

**P6 Start-here strip.** One quiet line of three deep links into /theory (rehype-slug anchors):
What is a tiling? → #tilings-vertices-and-notation · The eleven uniform tilings →
#the-three-regular-tilings · Why exactly eleven? → #why-exactly-eleven.

**P7 Footer.** Author/thesis line + citation block (Bielefeld convention: "If you use this atlas,
cite as…").

**P8 Motion budget.** At rest only the parquet miniature moves. Hover wakes a card (saturate +
border). No scroll animations, no parallax.

## Data contract

`lib/services/landingData.ts` (server-only, NOT re-exported from any barrel): reads the eager
`public/reference-atlas*.json` files with `node:fs` (module-level cache of the parsed files, fresh
random picks per call), returns counts by geometry + hero specimen (cell + id/family/k) + library
mosaic cells + the 11 uniform cells + play card cell. Geometry derived with `geometryOf`
(spherical > developed > euclidean), labels via `compactVertexConfig`.

## Non-goals

No nav header on the landing (unchanged from the welcome page). No new render pipelines. No
changes to /play, /library, /theory, /parquet. No View Transitions in v1. The k8–k10 lazy shards
are not counted (headline = eager scope).

## Verification

`pnpm build` clean; vitest for landingData (counts sum, 11 uniform selection, specimen shape) and
the hat/penrose patch generators; Playwright screenshots light + dark + 390px mobile.
