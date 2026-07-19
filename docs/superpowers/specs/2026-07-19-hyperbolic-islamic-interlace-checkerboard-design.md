# Hyperbolic Islamic styles: interlace + checkerboard

Date: 2026-07-19. Author: CC. Status: implemented (session 35). Checkerboard: done, all tilings. Interlace:
woven across regular (stub-completed clean break), uniform, and snub (fallback disc-break at each crossing
origin, since the reflected fold precludes stubs); truncated/rectified read near-flat at boundary-tracing
angles where there are few real crossings. See DEVELOPMENT_NOTES §66.

## Problem

`islamicStyle` (`plain | interlace | outline | emboss | checkerboard`) is fully wired for the flat and
spherical views, but the Poincaré-disk fold shader only ever renders `plain`. The sidebar says so:
"Star lines only … Weave / style options apply to flat tilings." AL wants **interlace** and
**checkerboard** on the disk too (outline/emboss deliberately skipped).

The disk renderer is a per-pixel fold shader ([hyperbolicShader.ts](../../../lib/render/hyperbolicShader.ts)):
each pixel folds into the fundamental Schwarz triangle and is tested against a ≤64-entry strap list
(`uStrapA/B[]`, tagged by tile). There is no planar arrangement to 2-color or offset, so the flat
approach (`islamicInterlace.ts` builds an arrangement → `assignOverUnder` → band polygons) and the
spherical approach (3D ribbon mesh) do not port directly.

## Strap structure (the fact the design rests on)

`constructTileStraps` emits, per tile, `2n` rays: origin = edge midpoint, endpoint = the `count`-th
forward ray-ray crossing (star tip). For the clean construction (`intersectionCount = 1`,
`edgeOffset = 0`):

- **Weave crossings are the shared edge midpoints** — 4-valent (2 rays from each of the two adjacent
  tiles).
- **Star tips are 2-valent bends** (no over/under).
- Therefore every strap has exactly **one** crossing, at its origin end ⇒ a single over/under bit per
  strap fully describes the weave. Alternation along a strand is carried across *different* straps
  (successive edge midpoints), which `assignOverUnder` already makes consistent.

## Checkerboard (the easy one)

Fill only; the strap line-stroke stays. Reuse the crossing test the shader already has: count strap
crossings from the disk origin `O` to the folded pixel over **all** straps (ignore the tile tag),
`parity → uCheckerA / uCheckerB`, dimmed by screen radius. No arrangement, no new geometry.

- New uniforms: `uIslamicStyle` (int 0/1/2), `uCheckerA`, `uCheckerB` (vec3).
- Shader: in the `uIslamic == 1` fill branch, `style == 2` overrides `baseFill` with the parity color.
  The existing strap stroke still draws the black linework on top.
- Sidebar (hyperbolic branch): Plain / Interlace / Checkerboard buttons; the two color pickers for
  checkerboard (reuse `islamicCheckerColorA/B`).

Risk: the parity is computed on the folded coord, so every tile gets the same internal 2-coloring;
whether tiles agree across shared edges needs a visual check. Low risk, cheap to adjust.

## Interlace (the real work)

Promote the strap distance field from a thin line to a **band** of half-width `uBandHalf` (fundamental
units, so it tapers toward the rim like geometry-mode strokes), with a per-strap over/under bit driving
the weave break.

CPU (`hyperbolicInterlaceData`, new, in `hyperbolicIslamicPatch.ts`):

1. Regular {p,q}: build a **1-ring patch** (`buildRegularPatch(p,q,1)`), run `constructTileStraps` on
   every tile with the live `theta/frac/count`, collect all straps. The neighbors are what make the
   edge-midpoint vertices genuinely 4-valent.
2. Feed the pooled straps (as straight `Segment`s — endpoints are shared exactly, so the combinatorics
   are right even though the true arcs are geodesic) to `buildInterlaceMap(segs, false)` +
   `assignOverUnder(map, startUnder = islamicChirality)`.
3. For each **central** strap, read the under-flag at its origin (edge-midpoint) end. Pack into
   `uStrapUnder[MAX_STRAP]` (int 0/1), aligned with the existing `uStrapA/B` order. Carry a `degenerate`
   flag; if set, the shader draws flat bands (no break).
4. Uniform/snub first cut: build the arrangement from the central multi-tile set only. Where midpoints
   are 2-valent (fundamental-domain boundary) `assignOverUnder` may go degenerate ⇒ flat bands there.
   Refine with a neighbor patch later if the seams are bad.

Shader interlace branch (replaces the thin stroke when `style == 1`):

- Min-layer band SDF: for each strap with `segDistGeo < uBandHalf + pwf`, its layer = `uStrapUnder[i]`
  if the pixel is nearer the origin end, else 0 (tip = bend = always drawn). Choose min layer,
  tie-break min distance. Over straps therefore paint over the under strand near a crossing — that
  break is the weave.
- Ribbon appearance: core filled with the tile hue `uTileHueA[tile]` (dimmed), `uLine` border of the
  existing stroke half-width, flat single-color background (`uIslamicB` dimmed) between ribbons.
- New uniforms: `uBandHalf` (float), `uStrapUnder[MAX_STRAP]` (int).
- Sidebar (hyperbolic): Band Width slider (`islamicBandWidth`) + Flip Weave (`islamicChirality`).

Risks (verify empirically, iterate):

- **Reflection seams.** The fold reflects tiles across edges; the over strand must stay over across the
  shared edge from both sides. `assignOverUnder` on the 1-ring patch *should* be reflection-consistent,
  but a seam is the most likely defect. Chase with the CPU render harness + Playwright.
- **Strap-count cap.** Only the central straps go to the shader (neighbors are CPU-only), so `MAX_STRAP`
  stays 64.
- **Non-clean construction** (offset > 0 or count > 1): straps gain mid-segment crossings ⇒ single bit
  insufficient ⇒ degenerate ⇒ flat bands. Acceptable; the clean construction is the target.

## Order of work

Checkerboard end-to-end (fast confidence), verify in-app; then interlace for regular {p,q}, verify and
chase seams; then extend interlace to uniform/snub. Build (`pnpm build`) + the hyperbolic test suites
after each. Ledger entry in `DEVELOPMENT_NOTES.md` at the end.
