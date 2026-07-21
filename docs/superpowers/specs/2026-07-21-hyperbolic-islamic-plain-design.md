# Hyperbolic Islamic plain fill (developed renderer) — design

> Spec (CC), 2026-07-21. First feature of the Islamic construction on the NEW certified-Dirichlet
> per-pixel renderer (`2026-07-21-hyperbolic-certified-dirichlet-renderer.md`): the **plain style**
> (colored cells + construction lines), matching the euclidean and spherical plain fills. Interlace,
> checkerboard, edge-offset, intersection-count are explicit follow-ups (AL: feature by feature).
> The three 2026-07-18/19 hyperbolic Islamic specs targeted the (2,p,q) fold shader, which was removed
> with the Wythoff renderer (37033f4) — this replaces them on the developed pipeline.

## Theory — why no new system is needed

- Kaplan & Salesin, *Islamic star patterns in absolute geometry* (ACM TOG 23(2), 2004): Hankin's
  polygons-in-contact construction is valid in absolute geometry — the identical edge-midpoint-ray
  recipe works in the hyperbolic plane with rays as geodesics. It is the same construction the atlas
  ships for flat (`Polygon.calculateIslamicSegments`) and spherical.
- **Klein trick**: hyperbolic geodesics are straight chords in the Klein model, and ordering along a
  geodesic is preserved. So once ray *origins/directions* are computed hyperbolically (midpoints,
  conformal angles in Poincaré), the entire flat arrangement machinery
  (`lib/utils/islamicArrangement.ts`: `buildArrangement`, `extractFaces`, `colorFacesAbc`) runs
  **verbatim** on Klein coordinates — crossings, T-junctions, face tracing, point-in-polygon are all
  exact there. Only *metric* quantities (midpoints, angles, arrival times, distances) use hyperbolic
  formulas.
- **Γ-invariance**: the construction is canonical per tile (edge midpoints + conformal angle), so it
  commutes with every isometry ⇒ the pattern is invariant under the tiling's symmetry group ⇒ it can
  be baked over the Dirichlet fundamental domain and looked up after the shader's fold, with the same
  soundness as the base tile field.

## Construction (lib/render/hyperbolicIslamic.ts, new)

Per developed tile (all engine tiles are regular-faced): for each edge, contact point
M = `hypMidpoint(v0,v1)`; inward unit normal at M from the edge tangent (`geodesicTangentAt(M,v1)`
rotated 90°, oriented toward the tile's hyp barycenter); two rays at ±θ from the normal
(θ = `islamicNormalAngleFromSlider(islamicAngle)`, the flat segment-path convention). Each ray's
geodesic → its two ideal endpoints (orthogonal-circle construction; ideal points are shared between
models) → a Klein chord with exact origin `k(M)` and forward direction. The **growing-ray race** of
`calculateIslamicSegments` is ported: crossings are Klein line intersections; arrival *times* are
hyperbolic (`hypDist(M, X)`); coverage/N-th-crossing/clamp/warn logic identical. Segments from all
tiles pool into one arrangement (scaled Klein, `KLEIN_SCALE = 256` so the 1e-5 vertex quantum in
`islamicArrangement` sits ~2 orders below the smallest feature at bake depth), then
`extractFaces` + `colorFacesAbc` with one centroid marker per tile (hyp barycenter → Klein,
hue = tileHue(sides)). Degenerate parity ⇒ C collapses to B (euclid `classNum` rule).

## Baked Islamic field (same fold, second texture)

`prepareIslamicField(st, darts, edge, meta, angleDeg)` → `TileField` with the SAME `rTex` as the base
field (independent res, capped 1024). Patch developed to the base bake's bound (faces that touch the
square close inside it). Per texel (same centres as the base bake; fold-into-domain for cracks, ring
post-pass for the rest, deep-unresolved errors loudly):

- **R** = face class + 1 (1 = A star body, 2 = B side field, 3 = C diamond) — located by
  point-in-Klein-polygon over the arrangement faces (grid-accelerated).
- **G** = hyperbolic distance to the nearest construction segment × EDGE_SCALE (tessellated
  Poincaré polylines × conformal factor — byte-identical convention to the base edge channel, so the
  whole stroke pipeline — conformal width, taper law, slider-0 gate — applies untouched).
- **B/A** = the containing FACE's hyp barycenter (equivariant ⇒ per-face depth shade with no seams,
  even for faces straddling tiles or the domain boundary).

Cached per (tiling, angle°, res) in a small module map shared by canvas + thumbnails.

## Shader (hyperbolicPerPixelGL.ts)

Second texture unit + `uIslamicOn`, `uResI`, `uColB`, `uColC` (vec3, from `tileHueRgb01` of
`islamicFillHueB/C` — like euclid, the hue ring rotates class A only). When on: fill colour = class A
→ the base tile hue (sides from the base field, same texel), B/C → the uniform colours; depth dim
from the Islamic B/A channels; stroke distance from the Islamic G channel (tile edges vanish — the
construction carries the linework, as in euclid plain). Off ⇒ byte-identical to today.

## Wiring

- `polygonClassSupportsIslamic` → true for hyperbolic (all 59 certify; a certificate-failed tiling
  falls back to 2D which ignores the toggle). Play-client force-clear becomes dead; stale comments
  updated.
- Canvas + thumbnail: bake on (tiling, angle) change with a trailing ~250 ms throttle during slider
  drags; upload via `setIslamicField`; `islamic` draw param from `cfg.isIslamic` (style forced plain
  in v1). 2D fallback ignores Islamic in v1 (one console.info).
- Options-tab hyperbolic branch: prune to Plain (angle slider + acute/median/obtuse presets stay);
  interlace band-width reveal drops its hyperbolic clause.

## Testing

`tests/hyperbolic-islamic.test.ts`: Klein round-trip; ray-chord forward-endpoint validity; segment
equivariance under the tiling's own gens (the invariance the bake rests on); rosette closure (no
no-partner warns) on samples incl. hole-alumni k=2s; slider-0 degeneracy (segments retrace the tile
edges); field totality (no deep unresolved, R∈{1,2,3}) at res 128 across the atlas; texel at every
in-square tile barycenter is class A; CPU face-classify vs baked field agreement ≥ 0.97.
