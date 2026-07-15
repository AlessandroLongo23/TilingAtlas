# Hyperbolic polygon fill + points, and space-specific toggle visibility

Date: 2026-07-15
Status: approved, implementing

## Problem

The `/play` sidebar exposes render toggles that only work in the Euclidean p5 canvas. In hyperbolic
mode the flat p5 grid is skipped (`skipFlat = inversive || hyperbolic`, `components/canvas.tsx`) and
the tiling is painted by the WebGL Poincaré-disk shader (`lib/render/hyperbolicShader.ts`). So:

- **Polygon fill** does nothing in hyperbolic — tiles are always coloured.
- **Show Polygon Points** does nothing in hyperbolic.
- **Symmetry elements**, **Fundamental domain**, and **Transition animation** are shown but inert
  (the p5 overlay that reads those flags draws nothing while hyperbolic is on).

## Goals

1. `showPolygonFill` works in hyperbolic. Fill off ⇒ tiles paint the theme background (`uSurface`),
   edges still drawn — matching the Euclidean `noFill()` semantics, including the light-stroke fallback
   in dark theme.
2. `showPolygonPoints` works in hyperbolic, at full parity with Euclidean: centroid (red), edge
   midpoints (green), vertices (blue), fixed screen size, across all families — regular `{p,q}`,
   Wythoffian uniform, and snub.
3. Hide **Symmetry elements**, **Fundamental domain**, **Transition animation** in the sidebar when
   the selected tiling is hyperbolic.

Non-goals: changing Euclidean behaviour; adding new hyperbolic families; touching the inversive view.

## Design

### UI (`components/sidebar/tilings-tab.tsx`)

`isHyperbolic = !!selected?.wythoff` already exists. Wrap the three inert checkboxes
(`tilingTransition`, `showSymmetryElements`, `showFundamentalDomain`) in `{!isHyperbolic && …}`.
`showPolygonFill` (top-level) and `showPolygonPoints` (advanced) stay and become functional.

### Fill (`lib/render/hyperbolicShader.ts`, `components/hyperbolic-canvas.tsx`)

New uniform `uShowFill` (int). After the shade block computes `baseFill`, `if (uShowFill == 0)
baseFill = uSurface;`. The `!converged` and rim mixes toward `uSurface` are unaffected.

Dark-theme stroke visibility: mirror `Polygon.ts` (`lightStroke = !showPolygonFill && dark`). Set
`uLine` from JS — light (`0.9,0.9,0.92`) when fill is off in dark theme, else the usual dark
(`0.05,0.05,0.07`). Fill-off in light theme keeps the dark stroke (visible on white).

Dark-theme "all white": paints the theme background, i.e. dark in dark mode — matches Euclidean.

### Points — feature geometry in JS (`lib/render/hyperbolic.ts`)

New pure, unit-tested function:

```ts
export type PointKind = 0 | 1 | 2; // 0 centroid, 1 edge-midpoint, 2 vertex
export interface HyperbolicFeaturePoint { pos: Complex; kind: PointKind; }
export function hyperbolicFeaturePoints(g: HyperbolicUniformValues): HyperbolicFeaturePoint[];
```

All positions are in the fundamental fold-kite frame (same frame the shader folds a pixel into).
Off-axis non-snub points include their `±y` mirror copy so the shader needs no reflection logic.
Near-duplicate points (e.g. on-axis mirror) are de-duplicated.

Non-snub (regular + uniform) — exactly the set `pickClickAnchor` builds:
- centroids: occupied corners among `O=(0,0)`, `cornerV`, `E=(rIn,0)` (per `occ`).
- vertices: the Wythoff-vertex orbit `W`.
- edge midpoints: feet `fA/fB/fC` where `dist(foot, W) > eps` (a foot on which `W` lies carries no edge).

Snub (chiral, no y-reflection):
- vertices: the real snub neighbours already in `SnubData` — `s, as, ais, bs, bis, n, b2s`.
- centroids: `O`, `cornerV` (q-gon), and the three snub-triangle centres `{s,as,bis} {s,ais,n}
  {s,n,bs}` via a Klein-model average (`hypCentroid`).
- edge midpoints: the 5 edges at `s` (`s-as, s-ais, s-bs, s-bis, s-n`) + 3 triangle third-edges
  (`as-bis, ais-n, n-bs`) via `hypMidpoint`.

Worst case ≈ 20 points; cap `MAX_POINTS = 32`.

### Points — rendering (shader + `hyperbolic-canvas.tsx`)

New uniforms: `uShowPoints` (int), `uNumPoints` (int), `uPoints[32]` (vec2), `uPointKind[32]` (int),
`uPointRadius` (float, device px). Fully guarded — when `uShowPoints == 0` the loop is skipped, so the
default pays nothing.

```glsl
if (uShowPoints == 1) {
  float dR=1e9, dG=1e9, dB=1e9;
  for (int i=0;i<MAX_POINTS;i++){ if(i>=uNumPoints) break;
    float d = distance(z, uPoints[i]); int k = uPointKind[i];
    if(k==0) dR=min(dR,d); else if(k==1) dG=min(dG,d); else dB=min(dB,d); }
  float rad = uPointRadius * pwf, aa = pwf;            // rad in fundamental units ⇒ fixed screen size
  float cR=(1.0-smoothstep(rad-aa,rad+aa,dR))*(1.0-rim);
  float cG=(1.0-smoothstep(rad-aa,rad+aa,dG))*(1.0-rim);
  float cB=(1.0-smoothstep(rad-aa,rad+aa,dB))*(1.0-rim);
  col = mix(col, vec3(1,0,0), cR);                     // centroid, drawn first
  col = mix(col, vec3(0,1,0), cG);                     // edge midpoint
  col = mix(col, vec3(0,0,1), cB);                     // vertex, on top
}
```

`z` is the final folded fundamental coord (unchanged by the uniform/snub classify branches). `pwf` is
the existing screen→fundamental scale (fundamental units per device px), so `rad = uPointRadius·pwf`
gives a fixed device-px dot. Draw order red→green→blue matches Euclidean (`Polygon.ts`). JS passes the
flattened arrays via `uniform2fv` / `uniform1iv`; `uPointRadius ≈ 3·dpr`.

### Thumbnail (`components/hyperbolic-thumbnail.tsx`)

Set `uShowFill=1`, `uShowPoints=0`, `uNumPoints=0` so previews stay filled and point-free.

## Testing

- Unit: `hyperbolicFeaturePoints` — regular `{5,4}` (1 centroid at O, vertices = W orbit, one edge
  midpoint at `(rIn,0)`); a uniform (e.g. rectified) with ≥2 tile types; a snub — assert kinds/counts,
  in-disk positions, and that no point exceeds `MAX_POINTS`.
- Build: `pnpm build`.
- Manual: `/play`, hyperbolic tiling — toggle fill (colour ↔ background, light stroke in dark), toggle
  points (three colours on the right features), confirm the three toggles are gone from the sidebar.
```

## Risks

- Snub feature geometry is new and approximate for triangle centres (Klein average) — acceptable for a
  marker dot; verified only to sit inside the tile.
- Rim smear: fixed-screen dots near the disk boundary overlap; faded by `rim` like strokes.
