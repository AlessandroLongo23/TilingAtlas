# Hyperbolic Islamic strapwork v2 — all tilings + edge offset — design

> Spec (CC), 2026-07-18. Extends the v1 regular-{p,q} strapwork
> (`2026-07-18-hyperbolic-islamic-strapwork-design.md`) to **every** hyperbolic tiling the shader draws —
> uniform/Wythoffian and snub — and adds the **edge-offset** (two-point) parameter. Still strap lines only.

## Why this is one construction, not three

Every hyperbolic uniform and snub tiling has **regular-polygon tiles** (vertex-transitive ⇒ regular
faces: truncated → regular 2p-gons + q-gons, rectified → p-gons + q-gons, snub → p-gons + q-gons +
triangles). So the polygons-in-contact motif is the *same symmetric rosette* in every tile: from each edge
midpoint a ray leaves at the contact angle, and by the tile's own rotational symmetry the strap vertex
lands on the tile's centre-to-vertex bisector. There is no per-tile-type geometry difference. v1's regular
case is this construction with one tile type; uniform adds more tile types; snub is identical geometry in a
chiral (mirror-free) fold frame.

## The unified construction

A single pure function returns the strap as a **list of geodesic segments in the fundamental frame**; the
shader draws them all with the v1 `segDistGeo` + vertex-cap machinery, looping over an array instead of one
segment. v1's single segment becomes the length-1 case (byte-identical when off).

### Per-(region, foot) rule

The shader folds a pixel into the Schwarz triangle O-V-E; the tile regions O, V, E meet at the Wythoff
vertex W, and the feet footA/footB/footC (`wythoffFeet`) are the edge midpoints. Region incidences (from
the shader classifier): O borders E via footA and V via footB; V borders E via footC; centres are
O=(0,0), V=`cornerV`, E=(rIn,0). A foot is present iff foot ≠ W.

For each present region (occ) and each of its present feet M (centre C, shared vertex W):

1. Unit geodesic tangents at M: `n̂` = tangent of geodesic M→C (inward normal, ⊥ edge for a regular
   tile), `ê` = tangent of geodesic M→W (along the edge toward the shared vertex).
2. Strap tangent `t = cos β · n̂ + sin β · ê`, with `β = islamicTipsAngleFromSlider(slider)/2 ∈ [0, π/2]`
   (the exact v1 convention). β=0 ⇒ along the normal (→ dual); β=π/2 ⇒ along the edge (→ original).
3. Strap vertex `S` = intersection of the geodesic through M with tangent t and the bisector geodesic
   C→W. Emit segment `M→S`.

Two feet of a region give two segments meeting at the same S on the bisector (mirror images), so the
rosette is continuous; continuity across every tiling edge is automatic (both regions end a segment at the
shared foot, at angle β, mirror images). Segment counts: omnitruncated (3 feet, 3 regions) = 6; rectified
(1 foot, 2 regions) = 2; etc.

### Snub (chiral)

Same rule, but the snub shader folds by rotation with **no mirror**, so segments are emitted directly in
the kite frame (tested against `z`, not `(z.x,|z.y|)`), and each edge midpoint emits **both** rays (toward
each of its two endpoint vertices) since there is no reflection to generate the second. Tiles touching the
central kite: the p-gon (centre O), q-gon (centre V), and the three snub triangles about s (centroids from
`hypCentroid`); edges and vertices come from `snubData` (s, as, ais, bs, bis, n, b2s). Each (edge, tile,
endpoint-vertex) emits `M→S` with S on the tile-centre→endpoint bisector. Over-enumeration of a tile's full
rosette is harmless (far segments don't match kite pixels); budget stays within the array cap.

### Edge offset (two-point family)

`islamicEdgeOffset ∈ [0,100]%` slides each contact off the midpoint along the edge geodesic by
`±(offset/100)·(half-edge)`, giving two contacts M⁺, M⁻ per edge. Each contact runs the per-(region,foot)
rule, so a region gets two strap vertices (one biased toward W, one toward C) and up to 4 segments —
Bonner's two-point pattern. offset=0 collapses to the single-contact case above. Lines-only ⇒ the extra
crossings render as overlaps, no interlace state.

## Geometry kernel (new, in `lib/render/hyperbolic.ts`, TDD)

Represent a geodesic as `(c0, c1, c2)` for `c0(|z|²+1) + c1·x + c2·y = 0` (orthogonal circles c0≠0,
diameters c0=0 — one form for both):

- `geodesicThroughPoints(a, b)` — cross product of rows `[|a|²+1, a.x, a.y]`, `[|b|²+1, b.x, b.y]`.
- `geodesicThroughPointTangent(p, t)` — cross product of `[|p|²+1, p.x, p.y]` and `[2(p·t), t.x, t.y]`.
- `geodesicIntersect(g1, g2)` — radical line passes through the origin (both ⊥ unit circle); parametrise
  `z = τ·dir`, solve the quadratic, return the in-disk root (|z|<1). Handles the diameter cases.
- `geodesicTangentAt(p, toward)` — unit tangent at `p` of the geodesic p→toward (for n̂, ê).

Then `islamicStrapSegments(spec, sliderDeg, offsetPct): { a: Complex; b: Complex }[]` dispatching
regular (v1 segment, reused) / uniform (per-region) / snub (kite). Pure, unit-tested.

## Shader (`lib/render/hyperbolicShader.ts`)

Replace v1's `uStrapE`/`uStrapP` with an array:

```glsl
#define MAX_STRAP 32
uniform int uIslamic;
uniform int uStrapReflect;      // 1: test (z.x,|z.y|) (regular/uniform); 0: test z (snub)
uniform int uStrapCount;
uniform vec2 uStrapA[MAX_STRAP];
uniform vec2 uStrapB[MAX_STRAP];
```

Blend block (after `col = mix(baseFill, uLine, lineCov)`, guard `uIslamic==1`, no `uNTiles` gate):

```glsl
vec2 zk = uStrapReflect == 1 ? vec2(z.x, abs(z.y)) : z;
float ds = 1e9;
for (int i = 0; i < MAX_STRAP; i++) {
    if (i >= uStrapCount) break;
    ds = min(ds, segDistGeo(zk, uStrapA[i], uStrapB[i]));
    ds = min(ds, min(distance(zk, uStrapA[i]), distance(zk, uStrapB[i])));
}
float strapCov = (1.0 - smoothstep(halfW - pwf, halfW + pwf, ds)) * (1.0 - rim);
col = mix(baseFill, uLine, strapCov);   // straps carry the linework (drops tile-edge lineCov)
```

`baseFill` is common to the regular/uniform/snub paths, so re-mixing from it works everywhere.

## Wiring + UI

- **canvas:** compute `islamicStrapSegments` (memoised on specKey + islamicAngle + islamicEdgeOffset),
  pack into reused `Float32Array(64)` for `uStrapA`/`uStrapB`, upload count + `uStrapReflect` (from
  `g.snub`); set `uIslamic` from `cfg.isIslamic` for ALL hyperbolic (drop the `nTiles===1 && !snub` gate).
- **UI:** `islamicSupported` widens to all hyperbolic (replace `isHyperbolicRegular` with `isHyperbolic`
  in the two play-client effects, the `I`-key gate, and the tilings-tab flag). Unhide the edge-offset
  slider for hyperbolic; keep style/weave/intersection hidden (still lines-only, first contact). Retire the
  now-unused `isHyperbolicRegular` helper if nothing else references it.

## Testing

- Geometry kernel: `geodesicThroughPoints`/`ThroughPointTangent` pass through their inputs and are ⊥ the
  unit circle (c0² identity); `geodesicIntersect` recovers a known crossing; regular-{p,q} via the new
  `islamicStrapSegments` reproduces v1's `islamicStrap` endpoints exactly.
- `islamicStrapSegments`: every segment endpoint that is a foot equals the corresponding `wythoffFeet`
  point; each present foot is an endpoint of ≥1 segment (continuity); slider 0°→strap vertices at tile
  vertices, 90°→at tile centres; offset>0 doubles the contacts per edge.
- `pnpm build` clean; re-run `tests/hyperbolic.test.ts`; visual check in /play on {7,3}, t{7,3},
  tr{7,3}, sr{7,3} (rectified, truncated, omnitruncated, snub) and with the edge-offset slider.

## Out of scope (unchanged from v1)

Interlace over/under, colored-region fills, intersection-count > 1. Thumbnails share the shader — a
follow-up once this lands.
