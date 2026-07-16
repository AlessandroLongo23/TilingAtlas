# Spiral conformal shader for the inversive view

Date: 2026-07-16
Status: approved (AL, 2026-07-16), building without further gates

## Goal

Add a spiral lens to the `/play` inversive view: render the selected periodic tiling through the
complex-exponential map, the way Craig Kaplan's "Escher-like spiral tilings" post does, but as a live
WebGL post-effect over the tiling we already enumerate. Two variants, toggleable:

- single center — one log pole at the origin (Escher *Whirlpools* / *Path of Life III* look);
- two centers (Droste) — poles at ±sep, arms flowing between them (*Print Gallery* / *Path of Life I*).

This is an exhibition lens, not an enumeration feature. It adds zero catalogue entries; it warps a
tiling that is already in the atlas. Same category as the existing circle-inversion and Möbius lenses.

## Why it slots into the existing shader

The inversive shader ([components/inversive-canvas.tsx](../../../components/inversive-canvas.tsx)) is
already "output pixel → inverse map → undo affine → reduce into the lattice → locate the point
analytically." Circle inversion (`uMode==0`) and loxodromic Möbius (`uMode==1`) are two branches of one
switch at lines 94–102. A spiral is a third branch that produces a `world` coordinate; everything from
line 109 on (lattice reduction, 3×3 point-location, stroke AA, the `uAvg` center blend, the parametric
family upload path) runs unchanged. Approach B (a separate canvas like `hyperbolic-canvas`) and
approach C (render-to-texture then resample) were both rejected: B duplicates ~170 lines of
point-location and AA machinery; C reintroduces the raster blur the analytic shader exists to avoid and
worsens center aliasing.

## The map (corrected 2026-07-16 — replicates Kaplan's tactile-js/spirals exactly)

> **Correction.** The first implementation mapped `(r, θ)` to lattice coordinates through a general 2×2
> (θ-column = seam, r-column = unimodular complement · density + a pitch shear). That map is seamless
> but NOT conformal — a general real-linear map shears the tiling before exp, so tiles lose their shape
> and the output diverges from Kaplan's (visibly wrong on a hex lattice at (1,6)). His transform is
> `matchSeg(0→2πi) ∘ matchSeg(0→v)⁻¹`: the unique **similarity** carrying the seam onto the vertical 2π
> segment — one complex multiplication, no free radial column, no pitch. Sections below describe the
> corrected design; the old construction is kept only in this note as the characterized failure.

Let `s` be the centred CSS pixel (complex), `w = s / σ` with σ = half the viewport minor axis. The pole
is locked to the screen centre. Single center:
```
merc = log w = (ln|w|, arg w)
world = K · (merc − V)          // complex multiplication; K = (a·v₁ + b·v₂) / (2πi)
```
Two centers (Droste): pre-compose the Möbius sending the two poles to 0 and ∞, then identical:
```
w ← (w − P) / (w + P),   P = (sep, 0)      // sep from the Pole-separation slider
```

`K` is the inverse of the similarity taking the seam `S = a·v₁ + b·v₂` to `(0, 2π)`: advancing θ by 2π
advances world by exactly `cmul(K, (0,2π)) = S`, a lattice translation, so the `atan2` branch cut at
θ = ±π is the map's only discontinuity and it closes onto the same tile — **seamless for any `(a,b)`
and any lattice**, single or double center. Because K is a single complex number the map is conformal:
tiles keep their shape, and the spiral's lean and ring spacing are **intrinsic to `(a,b)` and the
lattice** — there is deliberately no pitch/density knob, matching Kaplan's tool.

`V` is Kaplan's `tiling_V`: a translation in strip space applied before K. Pan, zoom, and rotation all
act through it — drag-x = self-similar dolly, drag-y/rotation = spin (scaled 2π per half-viewport, his
`TWO_PI/(HEIGHT/2)`), wheel-zoom folds in as `V.x −= ln(zoom/50)`. The pole never moves.

One knowing deviation: Kaplan renders by sampling an FBO texture of the translational unit; we keep the
analytic point-location backend (crisp strokes at any magnification). His `rv` colour-permutation factor
(rank of `p1^A·p2^B`) is 1 for us — our cell colourings are translation-invariant by construction.

## The CPU helper (unit-tested)

`lib/render/spiralMap.ts` — pure math, no WebGL:

```
spiralSimilarity(a, b, v1, v2) -> { k: [Kx, Ky], seam: [Sx, Sy], arms: gcd(|a|,|b|) }
```

`K = S/(2πi) = (S.y, −S.x)/(2π)`. Degenerate guards: `a=b=0`, or a ~zero seam from a collinear basis,
fall back to seam `v₁`. Arm count follows Kaplan's `(a,b)` parametrization; `gcd>1` widens the strip to
`g` primitive cells (the arm-multiplication mechanism).

## UI and state

Mode row in [tilings-tab.tsx](../../../components/sidebar/tilings-tab.tsx) gains a third button,
**Spiral**, beside Inversion / Möbius. When Spiral is active the controls are: `Arm a` and `Arm b`
integer steppers (default 1, 0 → plain single wind) and a `1 center / 2 centers` toggle. In 2-center
mode the existing **Lens radius** slider is relabelled to pole separation and feeds `uR`. No pitch
slider (see the correction note). Drag = dolly + spin in strip space; wheel = dolly; rotation = spin.

Config additions to [configuration.ts](../../../lib/stores/configuration.ts): `inversiveMode` gains
`"spiral"`; new fields `spiralArmA: number` (1), `spiralArmB: number` (0), `spiralDouble: boolean`
(false).

Shader uniforms: `uMode==2`, `uSpiralK` (vec2, complex K), `uSpiralV` (vec2, strip pan), `uSpiralDouble`
(int), reusing `uR` for pole separation.

## Testing

- `tests/spiral-map.test.ts` (Vitest, no WebGL): seam closure `cmul(K, (0,2π)) == a·v₁+b·v₂` on square
  AND hex bases; similarity check (orthogonal equal-norm columns — the conformality that the first
  implementation lacked); `gcd` arm factor; degenerate `(0,0)` and collinear-basis fallbacks.
- `pnpm build` (the workflow gate — type-checks the shader wiring and UI).
- Drive `/play`: hexagonal t1001 at (1, 6) must reproduce Kaplan's nested-hexagon flower (verified
  headless 2026-07-16); drag must spin/dolly with the pole locked to centre.

## Out of scope

Three-or-more centers (the post shows the strip has only two ends; more needs non-tile filler).
Hyperbolic tilings (separate renderer; the spiral lens is for the flat p5/inversive path only).
