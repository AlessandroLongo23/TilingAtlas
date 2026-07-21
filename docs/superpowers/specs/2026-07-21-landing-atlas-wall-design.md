# Landing page: the Atlas Wall (2026-07-21)

Approved by AL 2026-07-21 ("go ahead and build it") after the research pass logged in this
session; concept selected from three directions (curvature continuum / tiling-as-navigation /
single specimen). This spec is the buildable v1 with the growth path noted inline.

## Concept

The landing viewport is a single edge-to-edge 4.6.12 tiling (t1003, truncated trihexagonal,
one of the eleven uniform tilings) drawn as ink on paper. Its three cell sizes are the page's
three information tiers:

- dodecagons: doors into the atlas sections, each holding a live miniature of its destination
- hexagons: real specimens from the catalog, one per cell, deep-linked into /play
- squares: quiet filler; a few carry a vertex-configuration glyph linking into /theory

No welcome card, no overlay, no scroll, no marketing copy. The header nav from the app shell
is NOT on the landing (as today); the wall's doors plus masthead links are the navigation,
and every door is a server-rendered `<a>` so the page works without JavaScript.

## Layout (design canvas)

Fixed design canvas 1920x1200 units, shared by the SVG stage and all HTML overlays, wrapped
in a scaler that covers the viewport (JS measures and applies transform scale/translate;
no-JS fallback is a centered crop via plain CSS). Stage cells come from expanding t1003's
`renderCell` (same ring-expansion logic as the old `LandingTilingBackground`, generalized and
moved to a pure lib).

Regions:

- Masthead, upper left, on the paper: "Tiling Atlas" / "A catalogue of tilings of the plane,
  the sphere, and the hyperbolic plane." / counts line (live, see below).
- Four live doors (dodecagons picked nearest ideal anchors, avoiding the masthead area):
  Play (static patch of a real tiling, v1), Library (3x3 mosaic of catalog thumbnails,
  re-dealt per request), Theory (the eleven uniform tilings t1001-t1011 as a ring of
  micro-previews), Parquet (strip from `buildParquetSvgModel`, slow CSS drift as the page's
  only resting motion).
- Two reserved doors, dashed stroke: Aperiodic (faint hat-monotile patch, hardcoded coords)
  and Substitution (faint Penrose rhomb patch, hardcoded), labeled "in preparation".
- Curvature caps: left edge, a small sphere (existing `spherical-thumbnail`) labeled
  "40 spherical"; right edge, a small Poincare disk (existing
  `hyperbolic-developed-thumbnail`) labeled "59 hyperbolic". Both link to /play filtered to
  that geometry. v1 caps are clipped client islands with a server-drawn outline + count as
  the no-JS fallback; the stroke-curling integration is a later phase.
- Specimen of the day: exactly one hexagon in full color at rest, date-seeded
  (UTC day hash) so it is shared and citable; label under it with id + "one of N at k=K".
  Other hexagons hold muted static micro-renders of per-request random catalog entries.

## Counts (masthead line)

Read server-side at request time, never hardcoded: Euclidean = entries in
reference-atlas.json + the eager class shards (composable, isotoxal, mixed, scaled,
polyomino, islamic), matching the /library total; hyperbolic and spherical = their file
lengths. Completeness fragment: "complete through k = 6 - frontier at k = 16", linking to
/theory. If a shard file is missing the count degrades to the sum of what loaded (same
best-effort semantics as the library).

## Interaction (P7, v1 scope)

Hover/focus wakes a cell (CSS only): doors saturate to full color, specimens saturate and
show id, caps get a subtle scale. Click navigates (plain navigation v1; View Transitions
morph is a later phase). Tab order: masthead links, then doors in reading order, then caps.
The 1-5 number-key shortcuts remain a /play-shell feature, not a landing feature.

## Theming

Both themes from the existing token system: paper = surface background token, ink = fg
token at reduced opacity, accent only on hover and on the specimen of the day. Parquet-lab
register: thin strokes, no fills at rest except the daily specimen.

## Out of scope for v1 (explicitly deferred)

Stroke-curling into the caps, View Transitions door morph, pannable Play door, parquet
morph driven by the real D(x) animation (v1 is a CSS drift loop), mobile-specific reflow
beyond the cover-crop scaler, mid-k specimen curation.

## Files

- `lib/render/atlasWall.ts` (new, pure): expand t1003 cell to the design canvas, classify
  polygons by n, pick door/specimen/glyph cells deterministically from a seed.
- `lib/render/atlasWall.test.ts` (new): coverage, classification, door selection
  determinism, seed stability.
- `components/atlas-wall.tsx` (new): server SVG stage + overlay islands; small client
  scaler component.
- `app/page.tsx`: rewritten to load atlas files, compute counts, seed the wall, render.
- `components/landing-tiling-background.tsx`, `components/landing-actions.tsx`: deleted
  (superseded; the cell-expansion logic moves into `lib/render/atlasWall.ts`).
