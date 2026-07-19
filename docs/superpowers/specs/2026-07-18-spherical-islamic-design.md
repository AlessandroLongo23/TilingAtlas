# Spherical Islamic patterns — v1 (star lines)

Date: 2026-07-18
Status: approved (AL), scope locked to lines-only.

## Goal

Bring the Islamic (Hankin / contact-angle) construction to the spherical renderer. Selecting a
Platonic {p,q} solid and toggling Islamic on draws the contact-angle star pattern over the sphere as
thin great-circle ribbons on the surface, driven live by the three existing construction sliders
(contact angle, edge offset, intersection count).

This is the first slice. Colored star cells, the woven interlace, and the checkerboard 2-coloring are
explicitly deferred — each needs a spherical planar arrangement and/or a band/weave builder that this
slice does not build.

## Why lines-only is a clean first slice

The flat construction is per-tile, not global. `Polygon.calculateIslamicSegments(angle, offset, count)`
(`lib/classes/polygons/Polygon.ts:516`) generates each tile's rays independently and terminates them on
that same tile's rays. The cross-tile "flow" is only in the arrangement/coloring layer, which lines-only
does not need. So the lines port face-by-face with no global solver.

## Construction technique — native spherical, not gnomonic reuse

The flat construction produces straight 2D segments. A tempting shortcut is to gnomonically project each
spherical face to its tangent plane, run the tested flat code verbatim, and project the segments back to
great circles. That fails here: the flat code roots rays at chord-midpoints, and the chord-midpoint of a
face's two projected vertices does not map to the same sphere point from two adjacent faces' charts (the
gnomonic image of a chord-midpoint depends on the chart center). The result is a visible kink at every
edge, worst on the tetrahedron/octahedron where the spherical faces are fat.

Instead we port the *algorithm* and reimplement its three primitives on the sphere:

- **Ray origin** = the true arc midpoint `M = normalize(V[i] + V[j])` of each edge great-circle arc
  (chart-independent — this is what makes edges continuous). Edge offset slides `M` along the arc by
  `frac · 0.5 · arcLength` via `slide(M, s) = cos(s)·M + sin(s)·eHat`.
- **Ray direction** = the inward edge-normal at `M` (tangent to the sphere, perpendicular to the edge,
  pointing toward the face centroid direction `C`), rotated by ±angle in the tangent plane at `M` about
  the radial axis `M`: `rot(v, a) = cos(a)·v + sin(a)·(M × v)` for a tangent vector `v ⟂ M`.
- **Ray–ray intersection** = the great-circle plane intersection `±normalize(Pᵢ × Pⱼ)`, where each ray's
  great-circle plane normal is `P = normalize(O × tangentAtM)`. The forward arc-length of a candidate
  intersection `X` along ray i is `sᵢ = atan2(dot(X, tᵢ), dot(X, Oᵢ))`, forward when `sᵢ ∈ (eps, π)`.

Continuity across a shared edge is *exact*: both faces reference the same two `poly.vertices`, so `M` is
identical from both, and reflection across the edge's great-circle plane (a real isometry of the solid)
maps one face's rays to the other's. No kinks.

The termination logic — the growing-line simulation from `Polygon.ts:555-601` (partner-covered arrivals,
stop at the N-th qualifying crossing, fallback clamp to last-covered-else-nearest so no ray is dropped) —
ports 1:1 with the 2D line parameter `t` replaced by the arc-length `s`.

## Modules

### New: `lib/render/sphericalIslamic.ts` (pure, no three.js, unit-tested)

```
sphericalIslamicArcs(
  poly: Polyhedron,
  opts: { angleRad: number; edgeOffsetFrac?: number; intersectionCount?: number; segments?: number; radius?: number },
) : Float32Array[]   // one sampled great-circle polyline per construction segment, across all faces
```

Per face: build the per-edge ray origins/directions/planes, run the ported termination, and emit each
ray's arc from its origin to its stop point, sampled into `segments + 1` points via
`cos(s)·O + sin(s)·tO`, scaled by `radius`. Mirrors the flat helper's angle convention (0 = along the
normal → all meetings at the face centroid; π/2 = along the edge). Pure tuple math like
`sphericalGeometry.ts`, so it unit-tests without a WebGL context.

### New: `lib/render/sphericalIslamicMesh.ts` (client-only, imports three)

```
buildIslamicPattern(schlafli: [number, number], opts) : {
  object: THREE.Group;
  setColor: (dark: boolean) => void;
  dispose: () => void;
} | null
```

Calls `sphericalIslamicArcs`, then sweeps each arc into a thin flat surface ribbon: at each sample,
offset ±halfWidth along the surface-tangent `S` (perpendicular to the arc, using the same per-sample
frame as the wireframe), placed at radius `1.001` to clear the sphere and avoid z-fighting; ribbon
normals are radial so the strip lies flat facing outward. Halfwidth is an angular width mapped from the
`lineWidth` stroke slider. Material is a flat unlit `MeshBasicMaterial` in the theme-aware dark line
color the baker already uses (dark `[0.1, 0.105, 0.125]`, light `[0.06, 0.06, 0.08]`), `DoubleSide`.

### Modified: `components/spherical-canvas.tsx`

The Islamic pattern is an *overlay* on the solid sphere, not a third content kind. A dedicated effect
builds/rebuilds the overlay Group and adds it to the scene when `isIslamic && !wireframe`, keyed on
`[schlafli, wireframe, isIslamic, islamicAngle, islamicEdgeOffset, islamicIntersectionCount, lineWidth]`;
it removes/disposes the overlay when Islamic turns off or wireframe turns on. The existing hue/stroke
rebake effect passes `lineWidth: isIslamic ? 0 : lineWidth` to the base sphere (and gains an `isIslamic`
dependency), so the base sphere hides its own tiling edges while Islamic is on — the only linework is
the star pattern. Wireframe and Islamic are mutually exclusive (wireframe wins).

### Modified: `lib/utils/tilingLabel.ts`

`polygonClassSupportsIslamic` gains `|| c === "spherical"` — Platonic faces are regular polygons, so the
shape-agnostic construction applies. This makes the toggle available on spherical selections.

### Modified: `app/(app)/play/_play-client.tsx`

The spherical selection effect stops force-clearing `isIslamic` (it still clears
`hyperbolic`/`inversive`/`circlePacking`/`isTilingRegularOnly`). The existing
`polygonClassSupportsIslamic` guard already clears `isIslamic` when moving to a class that doesn't
support it, and spherical now qualifies, so no stale state leaks.

### Modified: `components/sidebar/tilings-tab.tsx`

In spherical mode, surface the Islamic toggle plus the three construction sliders (contact angle, edge
offset, intersection count). The flat-only rendering controls (style, band width, outline width,
chirality, animate) stay hidden — they belong to the deferred v2 styles.

### New: `tests/spherical-islamic.test.ts`

Pure-geometry invariants across the five solids:
- Two segments per edge per face (`2 · E` arcs total).
- At angle 0, every ray endpoint collapses to the face centroid direction.
- Every sampled point lies on the sphere (unit length × radius).
- Every ray terminates (finite arc, no dropped rays).
- Continuity: a ray rooted at a shared edge's midpoint has the same origin from both adjacent faces.

## Store

No new fields. The existing `isIslamic`, `islamicAngle`, `islamicEdgeOffset`,
`islamicIntersectionCount` drive both the flat and spherical paths. The `lineWidth` slider sets the
ribbon width. Hue-ring does not affect the dark lines.

## Deferred to v2 (not built here)

- Colored star cells (a spherical planar arrangement + face coloring, baked into the sphere texture).
- Woven interlace as real 3D over/under ribbons.
- Checkerboard 2-coloring.
- Islamic on the catalogue thumbnails (thumbnails stay the plain textured sphere, as they already
  ignore wireframe mode).

## Revision — 2026-07-18 (post-implementation review, AL)

Two behavioural changes after seeing it run, superseding the "base sphere with edges hidden" and
"mutually exclusive" decisions above:

- **No base surface while Islamic is on.** The star pattern is *just* the construction lines — the
  underlying tiling (the solid sphere) is not shown at all, not even a colored ball. In
  `spherical-canvas.tsx` the base-surface effect returns `null` whenever `isIslamic`; the lines form a
  hollow structure drawn by the overlay effect. The `lineWidth: 0` bake hack is gone (there is no sphere).
- **Wireframe makes the star LINES rigid — it does not add tiling edges.** With Islamic on, the
  tiling-edge wireframe is suppressed entirely. The Wireframe toggle instead switches the Islamic lines
  between flat surface ribbons (off) and rigid tube/rect bars (on), swept by the SAME `buildTubeSkeleton`
  the tiling wireframe uses (factored out of `sphericalWireframe.ts`) and shaped by the Section /
  Thickness / Height / Bevel controls, tile-hued like the wireframe. The star pattern itself becomes the
  rigid 3D skeleton.

  Joint handling — the rigid star bars are NOT extended (unlike the wireframe's edge bars). A star ray
  stops on another ray's *body* (a mid-bar T-junction), so the crossing point lies on both bars'
  centrelines; both tubes already contain it and the joint fills by overlap with a clean seam. Extending
  a bar past that point (as the wireframe does at its polyhedron vertices, where bars meet only
  end-to-end) pokes a stub out the far side of the crossed bar — the overshoot artefact reported after
  the first rigid cut. So the star bars butt exactly at their crossings.

Known tradeoff: the flat-ribbon mode thins out when seen edge-on; the rigid tube mode fixes that. Both,
being hollow, overlap front-and-back lines like any see-through structure.

## Revision — 2026-07-18 (cell fill, AL)

Pulls the deferred "colored star cells" forward. With the "Polygon fill" toggle on (the atlas-wide Fill
control, `showPolygonFill` — same one the hyperbolic strapwork uses), the regions the star lines cut are
filled as coloured cells on the sphere, under the lines; off, the hollow just-lines look remains.

- **Per-face arrangement, reusing the flat code.** `sphericalIslamic.ts` gained `sphericalIslamicFaceData`,
  which gnomonically projects each face's rays + boundary into the face tangent plane (2D). Because
  gnomonic projection maps great circles to straight lines, the flat `extractFaces`
  (`lib/utils/islamicArrangement.ts`) traces exactly the spherical cells, and projecting a cell vertex back
  (`C + x·u + y·v`, normalise) lands it on the same arc the line renderer draws — fills and lines align
  exactly. `lib/render/sphericalIslamicFill.ts` builds the coloured triangle mesh.
- **Colour by cell shape.** Each cell is filled with the atlas `polygonHue` of its vertex count, so
  congruent cells share a hue (stars one colour, petals another…) and the hue-ring shifts them together.
- **Triangulation** is a fan from each cell centroid — valid for the star-shaped cells the regular motif
  produces; a pathological non-star cell would triangulate wrong (none observed on the Platonic motifs).
- Tested headlessly: the traced cells partition every face to within 2% area (3% with edge offset), so the
  fill tiles the surface with no gaps or double-cover.

## Deferred (still not built)

Woven interlace as real 3D over/under ribbons; checkerboard 2-coloring; Islamic on the catalogue
thumbnails.

## Verification

`pnpm build` clean (the repo gate), `pnpm test` green (including the new pure-geometry test), and an
end-to-end check on `/play`: a dodecahedron with Islamic on shows a continuous spherical star pattern,
the three sliders reshape it live, and the base tiling edges vanish under it.
