# Sub Rosa substitution-tiling editor — design

Status: approved to build (Approach A, live editor). Author: CC, 2026-07-25.

## Goal

An interactive editor in the atlas for **Sub Rosa** rhombic substitution tilings
(Kari & Rissanen, *Discrete Comput. Geom.* 55:972-996, 2016; arXiv 1512.01402):
aperiodic quasiperiodic tilings with 2n-fold rotational symmetry built from
⌊n/2⌋ rhombic prototiles with unit edges, vertices in the cyclotomic ring
ℤ[ζ₂ₙ]. This is the first member of a planned "substitutions" section; the engine
is written general, the first shipped symmetry is n=5.

The editor lets a user pick the symmetry, scrub through substitution iterations,
watch the patch grow, and read off the mechanism (inflation factor, edge word,
prototiles, per-prototile substitution rule). Read-only ("show + scrub"), fully
auto-derived — no figure transcription.

## Why Sub Rosa (vs Pautze CAST triangles)

Every geometric fact is derived from a recursively-defined edge word Σ(n); no
raster figure is transcribed. Pautze's triangle CASTs give closed-form
*counting* (substitution matrix, inflation multiplier) but the *dissection* lives
only in figures. Sub Rosa gives the dissection deterministically from Σ(n) via a
rhombus tiling of the super-rhomb region. It is a rhombic CAST, so this also sets
up the general CAST infrastructure.

## Scope of the first cut (honest)

**Shipped and validated: n = 5** (10-fold, the two Penrose rhombs (1,4) and
(2,3)). The engine is general (Σ(n), boundary word, ring arithmetic all work for
any n), but the **interior fill** — tiling the serrated super-rhomb region with
unit rhombi — currently uses a greedy sharpest-corner ear-clip that is proven
correct for n=5 (both prototiles: 72 and 116 children, area-exact,
edge-consistent) and n=7 x=1, but **dead-ends for n=7 x=2, x=3**. Greedy rhombus
ear-clipping is not always completable, and backtracking explodes. The correct
general method is the de Bruijn matched-line algorithm (the region's rhombus
tiling from the matched boundary word); implementing its position formula is the
documented **next step** that unlocks n≥7. Until then the UI exposes only
symmetries whose every prototile fills.

This matches the agreed approach: set up all infrastructure + controls on the
anchor case, polish, then expand.

**Iteration is capped at depth 1** (update 2026-07-25, after two rounds of
debugging). One substitution is exact and gap/overlap-free — verified by
dense-grid coverage: single-tile 1→116 and the 10-fold star 10→720 are 100%
exactly-once covered. Two things were fixed to get there: (a) substitution must
**inflate the tile by S first, then subdivide** (`substituteOnce`); mapping the
size-S children straight onto a unit tile piled ~40× overlap hidden by opaque
overdraw. (b) `similarity()` must **search all four corner correspondences**
(children come out of the fill in arbitrary vertex order). But composing a
*second* time still overlaps ~1.8% of area: the simplified super-rhomb boundary
here omits the shared **corner rose sectors** (Kari-Rissanen §5) that make the
rule self-compose — one super-rhomb tiles correctly and the star's symmetric
adjacencies mesh, but general depth-2 adjacencies do not. The boundary is
mirror-symmetric where the paper's clockwise-inclusion rule makes it
180°-symmetric; a 180°-symmetric boundary + paired-symmetric fill was tried and
did **not** suffice, confirming the roses (not just symmetry) are the missing
piece. Multi-level iteration is the concrete next step: implement the
rose-sector boundary word (paper §5, Example 1) and place the roses shared
between adjacent super-rhombs.

## The math (validated in prototype)

- **Prototiles.** For symmetry n, rhombs (x, n−x), x=1..⌊n/2⌋, angles xπ/n and
  (n−x)π/n, unit edges. n=5 → (1,4) thin (36°/144°), (2,3) thick (72°/108°).
- **Edge word Σ(n).** Recursion (matches paper Table 1/2 exactly, incl. Σ(9)):
  odd n first half = [1,3,…,n−2] ++ reverse(under(3)) ++ … ++ reverse(under(n−2)),
  where under(k)=[1,3,…,k−2]; Σ = firstHalf ++ reverse(firstHalf). Even n
  analogous with [0,2,…]. Σ(5) = 1,3,1,1,3,1.
- **Scaling factor.** Odd n: S(n)=cos(π/2n)/sin²(π/2n). S(5)=9.9596 (linear),
  area ×S²=99.19. (Not the textbook golden-ratio Penrose rule — a larger Sub
  Rosa inflation on the Penrose tiles.)
- **Super-rhomb boundary.** For prototile (x,·): 4 super-edges, bisector
  directions k₁=½, k₂=½+x (and +n). Each label a in Σ(n) contributes two unit
  vectors at integer directions k±a/2. Verified: boundary closes exactly and
  encloses exactly S²·(rhomb area) in ℤ[ζ₂ₙ].
- **Interior fill.** Greedy sharpest-corner ear-clip in exact ℤ[ζ₂ₙ] coords with
  a float containment guard (no vertex inside the ear, no edge crossing it).
  Positions exact; float only decides ear validity. Validated for n=5.
- **Ring.** Vertices in ℤ[ζ₁₀] (φ=4, Φ₁₀=x⁴−x³+x²−x+1). Added to Cyclotomic.ts's
  PHI table. `mulZeta` = rotation, `conj` = reflection, `scaleRational` = the
  only division needed — no field inversion.

## Architecture

New route `app/(app)/substitutions/` (server `page.tsx` → client
`_substitutions-client.tsx`), one entry in `nav.tsx`. `/play`-style layout: one
canvas + a control panel.

Engine (pure TS, `lib/subrosa/`), isolated and unit-tested:

- `sigma.ts` — Σ(n) recursion + scaling factor. Pure data, no geometry.
- `boundary.ts` — Σ(n) → super-rhomb boundary word (exact ℤ[ζ₂ₙ] vertices).
- `fill.ts` — boundary word → list of child rhombi (greedy exact ear-clip) +
  an exact structural validator (every interior edge shared by exactly 2 tiles;
  boundary edges == the boundary word; area == S²·A).
- `substitution.ts` — per-prototile rule: each child as
  `{ protoId, rot: ζ-power, reflected, offset: Cyclotomic }`. Derived once per n,
  memoized.
- `iterate.ts` — seed patch (single prototile; rose R₂¹ if time permits) →
  substitute k times → `Polygon[]` for render. Depth capped (S(5)≈10 ⇒ ~100×
  tiles/step; practical depth ≤3), viewport-culled.

Rendering: the existing p5 path (`Tiling.nodes` + `Tiling.show`, per-tile hue,
viewport `cull`, per-tile `scaleOf` growth wave), NOT the periodic
`FlatCellRenderer`. Pan/zoom via `lib/render/viewControls.ts`.

State: a small slice (or fields on `configuration.ts`) for current n, iteration
depth, seed type, color scheme. Dev hook `window.__stores` for Playwright.

Info panel (the "see how they work"): inflation S(n) and area factor S², prototile
count + angles, tile count at current depth, the edge word Σ(n), and the
per-prototile substitution rule rendered from the engine (not an image).

## Validation

- Vitest: Σ(n) golden values vs paper Table 1/2 (n=3,5,7,9 and even 2,4,6);
  scaling factors; the exact structural validator on the n=5 fill (both
  prototiles: closure, area ratio 1, no edge used >2×, boundary matches Σ).
- Visual: Playwright screenshot of the n=5 patch at depths 0–2; compare to the
  paper's Fig 4/5 by eye (recognizable 10-fold Penrose-rhomb rose).
- `pnpm build` clean before done.

## Non-goals (first cut)

Author-your-own edge rule; tile-lineage inspection; the catalogue/gallery + shard
persistence; n≥7 (pending robust fill); even-n fixed-point handling; exact-area
(Surd) generalization (the structural edge-count check suffices).
