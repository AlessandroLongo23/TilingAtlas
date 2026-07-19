# Islamic construction toggle on every tiling — design

> Spec (CC), 2026-07-19. Status: approved (Approach A). Ready for implementation plan.

## Goal

Offer the Islamic/Hankin construction toggle on every flat and spherical tiling class, not just
`regular`, `star`, `islamic`, `spherical`. Specifically add it to `convex`, `isotoxal`, `mixed`,
`scaled`, and `polyomino`. For the parametric families (`isotoxal`, and any α-family), the strapwork
must update live as the parameter slider moves, so one can watch the pattern morph.

## Why this is a small change

The construction geometry is already shape-agnostic and the exclusion of these classes was a
deliberate UI capability gate, not a geometric limitation. Three facts carry the design:

1. `Polygon.calculateIslamicSegments` ([lib/classes/polygons/Polygon.ts:516](../../../lib/classes/polygons/Polygon.ts))
   reads only vertices, edge midpoints (`halfways`), centroid, and per-edge inward normals. It has no
   polygon-type check. Its own docstring states it is shape-agnostic and handles non-convex tiles.
2. The scaled sub-edge behavior already emerges from the build encoding. `scripts/build-scaled-atlas.ts`
   models a side-*s* N-gon as a degenerate polygon with unit edges: one real corner plus *s−1* flat
   180° corners per side. The flat corners are exactly the T-junction points where neighbor tiles touch.
   They survive into the runtime `Polygon`, so `halfways` carries one midpoint per unit sub-edge, and the
   construction already emits a ray-pair ("V") at each sub-edge midpoint. Verified in
   `public/reference-atlas-scaled.json`: the `3.3₂` side-2 triangle stores `[1,0],[0,0],[-1,0]` collinear,
   with `[0,0]` a flat mid-edge corner.
3. The Islamic caches key on `Tiling.nodes` object identity, not tile class. A parameter slider bumps
   `tcId`, which rebuilds the tiling with a fresh `nodes` array, which invalidates the cache and forces a
   strapwork recompute. The throttled GPU mesh rebuild for slider drags is already in place. So live
   parametric morphing needs no new wiring.

## The change (Approach A)

Widen the single capability gate and let the existing render, cache, and rebuild machinery carry the
rest. No change to the construction geometry, the render paths, or the parametric rebuild.

### Edit site

`lib/utils/tilingLabel.ts:12` — `polygonClassSupportsIslamic`. Today it returns true only for
`regular | star | islamic | spherical`. Change it to admit every flat class the catalogue ships:
`regular`, `star`, `convex`, `isotoxal`, `mixed`, `scaled`, `polyomino`, `islamic`, `spherical`.
Hyperbolic keeps its own path (see out of scope), so the function excludes only `hyperbolic`. Update
the function's doc comment to record that the gate is now open to all flat classes and why (the
construction is shape-agnostic; scaled T-junctions are pre-encoded as flat corners).

### Sites that consume the gate (no logic change, they follow automatically)

- `components/sidebar/tilings-tab.tsx:34` — the checkbox availability (`islamicSupported`).
- `app/(app)/play/_play-client.tsx:230` — the force-off effect when selection changes class.
- `app/(app)/play/_play-client.tsx:381` — the `I` keyboard shortcut gate.

All three call `polygonClassSupportsIslamic`, so widening the function flows to every consumer. Review
each of the three surrounding comments and correct any that still assert "regular/star only".

### Render path (already generic, confirm during implementation)

`islamicShaderActive` ([components/canvas.tsx:308](../../../components/canvas.tsx)) gates only on the
presence of a translational cell, which every new class has, so these tilings take the GPU plain-fill
path (`components/islamic-canvas.tsx` → `buildMeshFromPatch` → `colorFacesAbc`). Rulestring tilings
without a cell stay on the p5 path. Neither path checks tile class.

## Verification

`pnpm build` must pass (type check plus lint). Then a visual pass in `/play` with the Islamic toggle on,
for one representative tiling of each newly enabled class:

- `convex` — straps should connect across every shared edge (these are edge-to-edge).
- `isotoxal` — enable Islamic, drag the α slider, confirm the strapwork morphs live without a stale
  frame or a crash. This is the "watch it behave as you move the parameter" acceptance check.
- `scaled` — confirm straps connect across the sub-edges of a large tile (the free sub-edge V behavior).
  Pick a side-2 or side-3 tiling. Watch FPS on the densest one for the O(rays²) per-tile cost.
- `mixed` — straps connect where tiles are edge-to-edge.
- `polyomino` — see caveat 2. Confirm whether straps connect at domino/L T-junctions or not.

Both the line/strapwork style and the plain-fill style should be exercised, since they take different
code (line always works; plain-fill may degrade, see caveat 1).

## Known caveats (documented, not fixed here)

1. **Plain-fill degrades to two-tone on multi-orbit tilings.** The A/B/C three-color split is verified
   only for single-orbit regular grids (`docs/ISLAMIC_TILINGS.md`, "A/B/C plain fill"). Convex, isotoxal,
   mixed, and scaled are mostly k≥2, so `colorFacesAbc` returns `degenerate = true` and the renderer paints
   the background as a single class (two-tone). This is a graceful, already-implemented fallback, not a
   break. The strapwork line style is unaffected.
2. **Polyomino is the one connection risk.** Whether polyomino straps meet at a T-junction depends on
   whether its tiles are encoded with flat corners (like scaled) or as minimal rectilinear outlines. If
   minimal, a length-2 edge meeting two unit tiles will not be subdivided and the straps will not meet at
   that seam. Check during verification. If it looks broken, either accept it under the "unconditional"
   directive or apply the general subdivision described under out of scope.
3. **Perf on large scaled tiles.** `calculateIslamicSegments` is O(rays²) per tile; a side-3 12-gon is
   36 sub-edges → 72 rays. Prior P0 work grid-accelerated the crossing split and throttled the mesh
   rebuild, so this is expected to hold, but confirm FPS on the densest scaled tiling.

## Out of scope

- **General contact-point subdivision (Approach B).** A Tiling-level pass that buckets all tile corners,
  tests point-on-edge, and injects subdivision points into the construction so any T-junction gets a V
  regardless of tile encoding. This would make every class connect robustly, but it is unnecessary where
  tiles are edge-to-edge or already carry flat corners, and it touches the construction signature and both
  render paths. Deferred. Reach for it only if verification exposes a broken seam (most likely polyomino,
  caveat 2). The bucketing pattern already exists at `lib/classes/Tiling.ts:574`
  (`drawIslamicVertexRegions`) as a starting point.
- **Hyperbolic.** Hyperbolic tilings already draw the strapwork through the Poincaré-disk shader and are
  gated by the separate `selected.wythoff` branch in `tilings-tab.tsx:34`. Untouched.
- **New parametric drag behavior.** Reuse the existing rebuild and throttle path exactly. No new caching,
  throttling, or animation code (AL directive).
