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

**Shipped and validated: n = 5 (10-fold) and n = 7 (14-fold).** `SUPPORTED_SYMMETRIES
= [5, 7]`; the UI symmetry selector offers both. n=5 = the two Penrose rhombs (1,4),
(2,3) → 72, 116 children. n=7 = three rhombs → 212, 380, 472 children. Both self-
compose gap/overlap-free (n=7 star→depth-1 = 2 968 tiles, single→depth-2 = 81 632,
edge-overuse 0, area exact).

**The interior fill** — tiling the serrated super-rhomb with unit rhombi — is a
**restart ear-clip**: try the deterministic sharpest-corner pass first, and on a
dead-end retry with seeded-random tie-breaking among the near-sharpest ears. Rhombus
ear-clipping isn't always greedily completable, but a valid tiling exists (the
boundary meets the crossing condition, §5.1), so a random pass escapes the dead-ends;
n=7 fills in a few tries (~1–2 s per symmetry, memoized). **Every returned fill is
exactly validated** (edge-consistency + boundary match) — the heuristic affects which
symmetries build, never whether a shown tiling is correct: a fill that can't be found
returns null and the UI drops that symmetry.

**n ≥ 9 is not yet supported.** The thin prototiles ((1,n−1), (2,n−2)) dead-end even
with restart (n=9 x=1 needs ~120 random tries / ~20 s — too slow, and n=11+ fails).
The correct general method is the **de Bruijn matched-line fill** (the region's
rhombus tiling read off the matched boundary word, §5 / refs [7,8]); that is the
documented next step that unlocks all n. ℤ[ζ₃₆], ℤ[ζ₄₄] rings are already in place.

This matches the agreed approach: set up all infrastructure + controls on the
anchor case, polish, then expand.

**The substitution self-composes to any depth** (update 2026-07-25, after
reading the paper's §5 in full). The break at depth ≥2 was a real method bug,
now fixed at the root — not capped. Three fixes, in order of importance:

1. **Point-symmetric boundary (the fix).** The paper's super-rhomb boundary is
   `u·ũ` where `ũ` is the *half-turn* of `u` (each direction +n, same order),
   so OPPOSITE super-edges are exact antiparallels. That antiparallel property is
   exactly what makes two adjacent super-rhombs share an identical serrated edge
   and interlock — the regions tile the inflated coarse tiling, so any valid
   per-region fill composes gap-free. The earlier boundary was *mirror*-symmetric
   (a reflected shape), so opposite edges were NOT antiparallel; neighbours failed
   to mesh and depth-2 overlapped ~1.8%. Construction (§5, p.13): a unit rhombus
   `(a,n−a)` on a super-edge of direction `k` contributes two boundary vectors
   `k+a/2, k−a/2`; laying Σ(n) on all four edges (first half tents out, second
   half in) yields `A·C·E·G = (A·C)·σₙ(A·C) = u·ũ`.
2. **Correct ring ℤ[ζ₄ₙ].** For odd n the boundary vectors sit at odd multiples of
   π/(2n) — ζ₄ₙ directions, not ζ₂ₙ. The old code rounded `k±a/2` to integers in
   ℤ[ζ₂ₙ], silently distorting the outline. n=5 now lives in ℤ[ζ₂₀] (Φ₂₀ added to
   `Cyclotomic.ts`), directions as integers 0..4n−1 in units of π/(2n).
3. **Inflate-then-subdivide + all-four-corner `similarity()`** — kept from the
   first round; both are still required.

Verification (all pass): the boundary closes to 1e-15, encloses exactly S²·area,
is simple, and is point-symmetric (`dirs[i+half] === (dirs[i]+2n) mod 4n`, a
unit test). Iterating a single tile to **depth 3 → 706 240 tiles** (thick tile →
1 142 720) has zero edge-overuse, area conserved to float precision, and **zero
polygon overlaps** (dense-grid coverage + spatial-hash pairwise test). The
10-fold star to depth 2 is 71 200 tiles, edgesOverused 0, one boundary loop.

The **corner rose sectors** (Kari-Rissanen §5) are NOT needed for gap-free
iteration — they only make specific corners equal the rose R₂¹, which the paper
uses for the R₂¹-seeded self-similar *limit* and for primitivity. This engine
does not build them.

In the editor, depth is bounded only by the render budget (`MAX_TILES` 130 000):
single-tile depths 0–2 and star depths 0–2 render in full. Viewport-culled
deeper zoom (depth 4–5 in a bounded window) is the next enhancement.

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
- **Super-rhomb boundary (point-symmetric).** For prototile (x,·): 4 super-edges
  at bisector directions 0, 2x, 2n, 2x+2n (units of π/(2n)). Each label a in Σ(n)
  contributes two unit vectors at k±a; the first half of Σ tents out, the second
  half in, giving `u·ũ` with opposite edges antiparallel. Verified: closes to
  1e-15, encloses exactly S²·(rhomb area), simple, and half-turn-symmetric.
- **Interior fill.** Greedy sharpest-corner ear-clip in exact ℤ[ζ₄ₙ] coords with
  a float containment guard (no vertex inside the ear, no edge crossing it).
  Positions exact; float only decides ear validity. n=5 → 72 and 116 children.
  (The paper's own method is the de Bruijn matched-line fill — needed for n≥7
  where greedy dead-ends — but ear-clip suffices for n=5.)
- **Ring.** Vertices in ℤ[ζ₂₀] (φ=8, Φ₂₀=x⁸−x⁶+x⁴−x²+1 = Φ₁₀(x²)). Added to
  Cyclotomic.ts's PHI table. Odd-n boundary vectors are odd multiples of π/(2n),
  i.e. ζ₂₀ directions — NOT the ζ₁₀ tile-edge grid, which is why the ring is ζ₄ₙ.
  `mulZeta` = rotation, `conj` = reflection, `scaleRational` = the only division.

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
