# A seed card for the symmetry-first slide

**Date:** 2026-07-28 · **Status:** approved (AL, 2026-07-28) · **Route:** `/defense`

The slide "Architecture one: symmetry-first" describes a method that starts from a seed patch and
tries to fit the fundamental domain of each wallpaper group onto tuples of the patch's construction
points. It currently has no picture. This adds one: a k=4 seed, drawn once, inert, with the polygon
points showing.

## What already exists, and what does not

`showPolygonPoints` is the real feature and it is complete on the /play side. `buildCellMesh` emits
`pointPos` / `pointCorner` / `pointColor` for every centroid (red), edge halfway (green) and vertex
(blue); `POINTS_VERT` and `POINTS_FRAG` are exported from `lib/render/flatTilingGL.ts`; the pass is
implemented inline in `components/euclidean-canvas.tsx` and bound to `p` in /play's shortcut table.
None of it is reachable from a preview card, because `FlatCellRenderer` — the class the cards draw
through — links fill, stroke and orbit-dot programs and no points program.

`showConstructionPoints` and `Tiling.drawConstructionPoints` are dead and stay dead. Nothing in the
repo writes `Tiling.anchorNodes`, so that path draws nothing for any tiling. It is not this feature
and is not touched here.

The deck ships `renderCell` (fundamental cell polygons + basis) and `exactSource` per referenced
tiling id, and derives vertex orbits from the latter through `lib/defense/orbitCache.ts`. There is no
seed artifact anywhere, so the seed is derived client-side from those two.

## The seed

A seed in the symmetry-first method is a patch containing one vertex of each orbit. `seedFromCell`
builds exactly that:

1. `parseBaseCell` the render cell, then replicate it over a 5×5 lattice window via
   `expandToViewport`, giving a patch wide enough to hold complete vertex figures.
2. Key every polygon vertex in the patch by quantised position (1e-4, the quantum
   `orbitsFromExactSource` already keys on) and ask `orbitAt` for its orbit id. Vertices returning −1
   are dropped.
3. Choose one representative per orbit: orbit 0 takes the vertex nearest the cell's bbox centre, and
   each subsequent orbit takes the vertex of that orbit nearest the centroid of the already-chosen
   set. Ties break on (x, y) so the result is deterministic and testable.
4. The seed is every patch polygon incident to a chosen vertex, deduplicated by quantised centroid.
5. Return a synthetic `TranslationalCellData` — `{ p: seedPolys, b: basis }` — carrying `n`, `hue`
   and `star` through so the tiles keep their atlas colours.

Returning a cell, not a polygon list, is what keeps this cheap: `buildCellMesh`,
`buildOrbitDotMesh` and the whole preview pipeline take it unchanged, so the seed's points, orbit
dots and symmetry overlays all land in one world frame with no second code path.

The nearest-to-the-clump rule is a heuristic. The result is *a* valid one-vertex-per-orbit seed, not
the seed the search would have picked; AL accepted that for the slide.

Requires orbit data. Without it there is no orbit partition and therefore no seed, so the card falls
back to drawing the plain tiling and the caller is expected to name a tiling with an `exactSource`
(every `t4…` in `reference-atlas.json` has one).

## Drawing one copy

`FlatDrawParams` gains `single?: boolean`. When set, the instance grid is `Ri = Rj = 0` and
`wrapOffset` is skipped — the wrap exists to keep a fixed grid covering the viewport by folding the
pan back by whole lattice vectors, which with a single copy would teleport the patch off-centre.

## The points pass

`FlatCellRenderer` gains a fourth program built from the existing `POINTS_VERT` / `POINTS_FRAG`, with
`pointPos` / `pointCorner` / `pointColor` uploaded in `uploadMesh` and drawn on the same instance
grid, blended, after the stroke pass. It mirrors the orbit-dot pass already in the class and the
inline pass in `euclidean-canvas.tsx`; the disk radius, the colours and the rim are the shared
shaders', so a card and /play draw the same dots. Gated on `FlatDrawParams.showPoints`.

## Overlay key

`OVERLAY_KEYS` gains `p: "polygonPoints"`, matching /play's `p`. That is the point of the table:
one letter, one meaning, across /play, /theory and the deck. `OverlayState` and `NO_OVERLAYS` follow,
and the /theory cards gain the key for free.

## Inert mode

`interactive?: boolean` (default true) on both `useFlatCellPreview` and
`InteractiveTilingPreviewCard`. When false: no pointer handlers, no wheel listener, no right-click
reset, no expand button, no grab cursor, no focus ring, `touchAction: auto`. The overlay keys still
answer, because they are handled by the page-level scope, not the surface.

Home zoom for a seed is `homeFit`: fit the cell's polygon bounding box to the host with a margin.
`homePeriods` is meaningless for a finite patch, and a lattice-derived zoom would frame a seed by the
size of a repeat it does not have.

## The tag

`<seed-card tiling="t4…" label="…">` in `app/defense/_defense-client.tsx`, resolving to the preview
card with `seed`, `interactive={false}` and `initialOverlays={{ polygonPoints: true }}`, placed on the
symmetry-first slide in `public/defense/talk.md`.

## Testing

`lib/render/seedPatch.test.ts`, co-located as `triangulate.test.ts` is:

- a synthetic cell with a hand-written `OrbitData` pins the selection rule — one representative per
  orbit, deterministic under tie, every returned polygon incident to a representative, no duplicates;
- `t4001` from `public/reference-atlas.json` through the real `orbitsFromExactSource` pins the
  end-to-end shape: four orbits, the seed contains a vertex of each, and it is smaller than the 5×5
  patch it came from.

Visual check with Playwright against the running deck, per the repo's standard, plus `pnpm build`.
