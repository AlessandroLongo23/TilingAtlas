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

## The map

Let `s` be the centred CSS pixel (complex), `w = (s − offset) / σ` with σ derived from the zoom control.

Single center:
```
r = ln|w|
θ = arg(w) = atan2(w.y, w.x)
```
Two centers (Droste): pre-compose the Möbius that sends the two poles to 0 and ∞ — the sub-expression
already present in the Möbius branch (line 100):
```
mob = (w − P) / (w + P),   P = (sep, 0)     // sep from the Lens-radius slider
r = ln|mob|,  θ = arg(mob)                   // identical from here on
```

Then map `(r, θ)` to lattice coordinates and reconstruct world:
```
abLattice = uLogToLattice · (r, θ)ᵀ
world     = abLattice.x · v₁ + abLattice.y · v₂
```

`uLogToLattice` is a 2×2 built on the CPU (see helper below). Its **θ-column is `(a,b)`**, so advancing
θ by 2π advances world by `a·v₁ + b·v₂` — a genuine lattice translation. The only seam risk in the whole
map is the `atan2` branch cut at θ = ±π; there θ jumps by 2π, world jumps by the lattice vector, and
point-location returns the same tile on both sides. So **the map is seamless for any `(a,b)` and any
lattice**, single or double center — the branch cut is the only discontinuity and it lands on a lattice
vector by construction. The r-direction has no branch cut, so its column is free; we still set it to a
real lattice vector (the complement below) so the rings align with the tiling's own period.

## The CPU helper (unit-tested)

`lib/render/spiralMap.ts` — pure math, no WebGL:

```
spiralLogToLattice(a, b, pitchDeg, radialDensity) -> [m00, m01, m10, m11]   // row-major 2×2, latt = M·(r,θ)
```

- `g = gcd(|a|, |b|)`; primitive seam `(pa, pb) = (a/g, b/g)`. `g==0` (a=b=0) is degenerate → fall back
  to a=1, b=0.
- complement `(c, d)` via extended Euclid so that `pa·d − pb·c = 1` (det ±1 with the primitive seam).
- θ-column = `(a, b) / (2π)`  — the seam (guarantees closure at the branch cut).
- r-column = `(c, d)·radialDensity + θ-column·k(pitchDeg)` — the complement sets ring spacing; the
  `k(pitch)` shear adds angular drift per unit radius, leaning the concentric rings into logarithmic
  spirals (the Droste twist). Crucially the shear is added to the **r-column only**, never the θ-column,
  so seamlessness is untouched at any pitch.

Arm count follows Kaplan's `(a,b)` parametrization; when `g>1` the strip is `g` primitive cells wide,
which is the arm-multiplication mechanism. The UI labels the integers "Arm a/b" but does not hard-promise
"exactly a arms" until verified empirically in the app.

## UI and state

Mode row at [tilings-tab.tsx:249](../../../components/sidebar/tilings-tab.tsx#L249) gains a third button,
**Spiral**, beside Inversion / Möbius. When Spiral is active the controls are: `Arm a` and `Arm b`
integer steppers (default 1, 0 → plain single wind), a `Pitch` slider, and a `1 center / 2 centers`
toggle. In 2-center mode the existing **Lens radius** slider is relabelled to pole separation and feeds
`uR`. Rotation rotates the spiral (adds a constant to θ), zoom sets ring density / self-similar scale,
pan translates the pole(s).

Config additions to [configuration.ts:68](../../../lib/stores/configuration.ts#L68):
`inversiveMode` gains `"spiral"`; new fields `spiralArmA: number` (1), `spiralArmB: number` (0),
`spiralPitch: number` (degrees, default mid), `spiralDouble: boolean` (false).

New shader uniforms: `uMode==2`, `uLogToLattice` (mat2), `uSpiralDouble` (int), reusing `uR` for pole
separation and `uKinv`/`uOffset`/`uZoom` plumbing already uploaded each frame.

## Testing

- `tests/spiral-map.test.ts` (Vitest, no WebGL): `M·(0, 2π) == (a, b)` (seam closure) for several
  `(a,b)`; complement determinant is ±1; `a=1,b=0 → M·(0,2π)==(1,0)`; `gcd(a,b)>1` handled; degenerate
  `a=b=0` falls back without NaN.
- `pnpm build` (the workflow gate — type-checks the shader wiring and UI).
- Drive `/play`: select a square/hex tiling, toggle Spiral, and eyeball arm counts against `(a,b)`,
  seam continuity across the branch cut, single vs. double center, and pitch lean.

## Out of scope

Three-or-more centers (the post shows the strip has only two ends; more needs non-tile filler).
Hyperbolic tilings (separate renderer; the spiral lens is for the flat p5/inversive path only).
