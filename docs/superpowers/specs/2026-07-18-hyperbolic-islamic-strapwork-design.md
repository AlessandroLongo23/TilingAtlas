# Hyperbolic Islamic strapwork (v1) — design

> Spec (CC), 2026-07-18. Brings the polygons-in-contact star pattern to the Poincaré-disk hyperbolic
> renderer. Scope fixed with AL: **strap lines only**, **regular {p,q} only**. Interlace, colored-region
> fills, uniform/snub coverage, edge-offset, and multi-contact are explicit follow-ups.

## Problem

The atlas already draws the Islamic construction on two surfaces:

- **Flat** — explicit vector geometry. `Polygon.calculateIslamicSegments` emits rays at each edge
  midpoint, `lib/utils/islamicArrangement.ts` builds a planar arrangement, traces faces, weaves
  interlace; drawn on Canvas2D via `lib/render/flatView.ts`.
- **Spherical** — explicit great-circle ribbon meshes. `lib/render/sphericalIslamicMesh.ts` →
  `buildIslamicPattern`, rendered as three.js geometry (`components/spherical-canvas.tsx`).

The **hyperbolic** renderer is a different paradigm with *no explicit polygons*:
`lib/render/hyperbolicShader.ts` folds each pixel into the fundamental Schwarz triangle of the (2,p,q)
group per-fragment. It already computes edge midpoints (the feature-point overlay) and draws geodesic
strokes (`segDistGeo`). So the flat/spherical code cannot be reused; the construction must be expressed
in the fold paradigm.

## Approach (chosen: shader-fold)

Compute the polygons-in-contact motif **inside the fundamental domain** and render the strap geodesics
per-pixel in the existing fold shader. Rejected alternatives: an explicit hyperbolic tiling-generator +
arc mesh (needed only if we later want interlace parity; finite, fights the zero-geometry design), and a
Klein-model reuse of the flat arrangement (splits the work across two models, distorts contact points and
stroke width).

Because the PIC motif has the tile's full D_p symmetry, restricted to the fundamental domain it is a
**single geodesic segment** E→P. This is the whole idea and why v1 is small.

### Geometry (Poincaré disk, same frame as `mirrorParams`/`schwarzCorners`)

For regular {p,q} at the disk origin:

- `O = (0,0)` tile centre; `E = (rIn, 0)` edge midpoint; `V = (rC·cos(π/p), rC·sin(π/p))` vertex.
- Mirror A = real axis (apothem, O–E), Mirror B = diameter at angle π/p (O–V), Mirror C = edge geodesic
  (E–V), circle centre `(edgeA, 0)` radius `edgeRho`, `edgeA² = edgeRho² + 1`.

The strap segment:

- Contact angle from the shared slider: `a = islamicTipsAngleFromSlider(islamicAngle)` (radians;
  `a = π − 2·sliderRad`), `β = a/2 ∈ [0, π/2]`.
- Strap tangent at E (Euclidean = conformal): `t = (−cos β, sin β)`. β=0 ⇒ inward normal (toward O);
  β=π/2 ⇒ along the edge (toward V).
- Its geodesic is the circle orthogonal to the unit circle through E with tangent t:
  centre `κ = E + λ·(sin β, cos β)`, `λ = (1 − rIn²) / (2·rIn·sin β)`, radius `s = √(|κ|² − 1)`.
- P = intersection with mirror B. With `d = (cos π/p, sin π/p)`:
  `u = (d·κ) − sign(d·κ)·√((d·κ)² − 1)`, `P = u·d` (the in-disk root, |u| < 1).
- Degenerate `sin β ≈ 0` (slider 90°): the geodesic is the real-axis diameter ⇒ `P = O`.

Endpoints verified analytically:

- slider 90° (β=0) ⇒ `P = O` — dual tiling (tips at centroid).
- slider 0° (β=π/2) ⇒ `κ = (edgeA, 0)`, `s = edgeRho` ⇒ the strap *is* the edge circle and `P = V` —
  original tiling (tips on vertices).

So the shared `islamicAngle` slider spans the same original↔dual range as the flat regular path. Between
the endpoints the strap follows the true hyperbolic geodesic, so the mid-slider star opening is not
pixel-identical to the flat slider at the same value — endpoints and character match, and the hyperbolic
curve is the more correct object. This is intended, not a bug.

## Components

### `lib/render/hyperbolic.ts` — `islamicStrap(p, q, sliderDeg)`

Pure function returning `{ E: Complex; P: Complex }` (fundamental-frame, upper-half representatives),
using `mirrorParams` for `rIn`/`rC`/`edgeA`. No WebGL, no store — unit-testable, matching the file's
existing pure-function ethos. Interface, what it does, dependencies: given (p,q,slider) it returns the two
endpoints of the strap segment; depends only on `mirrorParams`.

### `lib/render/hyperbolicShader.ts` — strap uniforms + blend

New uniforms: `uIslamic` (int 0/1), `uStrapE` (vec2), `uStrapP` (vec2), `uStrapColor` (vec3). Declare in
the GLSL, the `HyperbolicUniforms` interface, `UNIFORM_NAMES`, and the location loop.

Blend block, inserted right after `vec3 col = mix(baseFill, uLine, lineCov);`, guarded to the regular
path so uniform/snub folds are untouched:

```glsl
if (uIslamic == 1 && uNTiles == 1 && uSnub == 0) {
    vec2 zk = vec2(z.x, abs(z.y));
    float ds = min(segDistGeo(zk, uStrapE, uStrapP), min(distance(zk, uStrapE), distance(zk, uStrapP)));
    float strapCov = (1.0 - smoothstep(halfW - pwf, halfW + pwf, ds)) * (1.0 - rim);
    col = mix(col, uStrapColor, strapCov);
}
```

Reuses `segDistGeo`, the vertex-cap `distance` rounding, `halfW`, `pwf`, and `rim` — the same
stroke+cap+boundary-fade machinery the snub path uses. `uNTiles == 1` in the shader is the regular {p,q}
path; the guard keeps every uniform/snub render byte-identical when Islamic is off or on.

### `components/hyperbolic-canvas.tsx` — compute + upload

Memoise `islamicStrap(g.p, g.q, cfg.islamicAngle)` on `[p, q, islamicAngle]` (cheap; recomputable each
frame if simpler). Each frame set `uIslamic` from `cfg.isIslamic && g.nTiles === 1 && !g.snub`, and upload
`uStrapE`/`uStrapP`/`uStrapColor`. Strap colour: reuse the stroke-colour rule (near-black on light, light
on dark) so it reads on both themes. `g.q` must be available on the geom object — add it to
`hyperbolicUniformValues`'s return if absent (it is trivially `spec.q`).

### `app/(app)/play/_play-client.tsx` — allow Islamic when hyperbolic-regular

Today the hyperbolic branch force-clears `isIslamic` (≈ line 268). Change: clear it only for
uniform/snub hyperbolic (`rings` non-empty or `snub`); leave it set for regular {p,q}. `polygonClassSupportsIslamic`
must admit hyperbolic regular tilings (verify; extend if needed).

### `components/sidebar/tilings-tab.tsx` — gate controls for hyperbolic

When the selection is hyperbolic, show only the contact-angle slider (`islamicAngle`) and strap
colour/width; hide style / bandwidth / outline / chirality / intersection-count / edge-offset / animate /
checkerboard (they map to v1-out-of-scope features). Mirror the spherical convention: while Islamic is on,
dim the base tile edges so the straps carry the linework.

## Data flow

`cfg.isIslamic` + `cfg.islamicAngle` (Zustand) → `hyperbolic-canvas` render loop →
`islamicStrap(p,q,slider)` → `uStrapE/uStrapP/uIslamic/uStrapColor` uniforms → fragment shader blends the
strap over the folded tile colour. No new store fields; the shared master toggle and angle slider drive
all three surfaces.

## Testing

- Unit (`tests/`, mirroring existing hyperbolic.ts tests): `islamicStrap`
  - `E == (rIn, 0)` for a few {p,q}.
  - slider 0° ⇒ `P ≈ V` (within 1e-6); slider 90° ⇒ `P ≈ O`.
  - interior slider ⇒ `P` lies on the O–V geodesic (angle(P) == π/p, |P| < 1) and inside segment O–V.
- `pnpm build` clean (type-check + lint per the workflow rule).
- Visual check in `/play` on {7,3}, {5,4}, {8,3}: straps continuous across edges, star closes at the tile
  centre, slider sweeps original→dual, panning stays smooth (no stroke shimmer), off ⇒ byte-identical to
  today.

## Out of scope (v1) — follow-ups, in rough order of effort

- **`edgeOffset`** — slide E along the edge geodesic off the midpoint; small extension of `islamicStrap`.
- **Uniform/Wythoffian coverage** — one strap motif per edge-orbit in the `uNTiles>1` fold; reuses the
  same `segDistGeo` blend.
- **Colored-region fills** — classify the strap-arrangement faces in the fundamental domain (like the
  `uNTiles` region classifier), fill by region type.
- **`intersectionCount > 1`** — continue the ray past first contact; needs multi-segment reflection, not a
  single E→P segment.
- **Interlace over/under** — requires a globally consistent crossing parity the fold discards; the hard
  one, likely wants the explicit-geometry path.
- **Snub coverage** — chiral, no edge mirror; strap motif loses reflection symmetry.
- **Thumbnails** — `components/hyperbolic-thumbnail.tsx` shares the shader; trivial once the uniforms exist.

## Notes / consistency

- Angle convention: hyperbolic uses `islamicTipsAngleFromSlider` (the flat *regular* mapping), so a
  hyperbolic {p,q} feels like a flat regular tiling under the same slider. The spherical canvas passes the
  raw slider as radians — a pre-existing discrepancy this spec does not touch.
- Different render substrates already diverge (flat Canvas2D, spherical three.js meshes, hyperbolic fold
  shader); computing the strap in-shader for hyperbolic while spherical builds ribbon meshes is consistent
  with that split, not a new inconsistency.
