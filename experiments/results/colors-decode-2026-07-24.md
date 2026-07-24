# Colored squares: decoding Marek's 2-colorings of the 4⁴ grid (2026-07-24)

Marek's `_colors.zip` holds `pt_squares_2_colors.exe` and its complete output to k = 6: periodic
2-colorings of the square tiling, where k counts COLORED vertex classes (vertices equivalent only
under color-preserving symmetries; the vertex figure is a color word like `(A4, B4)D4a`). Not proper
colorings: all-A is a valid k = 1 solution. This note records the decode, the convention experiments
that settled his counting rules, and what shipped. Raw run log: `colors-decode-2026-07-24.log`.

## Decoder

`tools/ctrnact-oracle/develop_colors.py`, a thin sibling of `develop_freedraw.py` that IMPORTS the
parser, vertex tables, glue and star-walk develop from it. The whole alphabet change is one dict:
`{A4: 3, B4: 3}` (two squares, both 90°, distinguished only by letter) instead of freedraw's
`{A2: 0, A4: 3}`. The new part is the emitter: no drawn-edge bit; instead the corner crossed while
star-walking sector [d, d+90°) at a vertex is the tile filling that quadrant, so every unit cell is
claimed up to four times and all claims must agree — a per-cell consistency check the freedraw
emitter never had. Output: color per lattice coset + grid-point orbit per coset, HNF lattice.

## Results

All 27,479 blocks develop cleanly: 0 failures, 0 disagreeing table variants, 0 cell-color
conflicts. Per-block checks all pass corpus-wide: developed orbit count = certificate k = filename
k, and the filename's trailing number = the certificate's structure items, settling that **n in the
file names is the edge-orbit count**.

| k | 1 | 2 | 3 | 4 | 5 | 6 | total |
|---|---|---|---|---|---|---|---|
| colorings | 8 | 53 | 309 | 1292 | 4725 | 21092 | 27,479 |

k = 1's 8 verified by eye on /colors?k=1: all-A, all-B, checkerboard, width-1 stripes, the two
sparse-dot patterns (swap partners), and two 4-edge-orbit scatter patterns.

## Convention experiments (the freedraw method: canonicalize and see what matches)

Every solution canonicalized under four candidate groups (translations always included):

| convention | distinct | folds |
|---|---|---|
| rotations only | 27,479 | 0 |
| + mirrors | 27,479 | 0 |
| + color swap | 14,152 | 13,327 |
| + mirrors + swap | 13,981 | 13,498 |

So Marek's counts are exact under rotations+mirrors with LABELED colors: **mirror pairs merge**
(adding mirrors folds nothing, so no solution's mirror partner is separately listed — the same
chirality convention as the rest of the atlas) and **color swaps stay separate** (all-A and all-B
are two solutions; folding swaps would halve most of the catalogue).

**The `_o_` files are the chiral solutions.** Chirality test (rotation-only canonical vs the
canonical over the reflection coset): 627 of 627 blocks in `_o_` files are chiral, 0 chiral blocks
anywhere in the main files. "o" plausibly = orientation(-only symmetry group). Each chiral solution
appears once, its mirror image implied. An earlier guess that o-blocks pair up under color swap was
a k = 2 coincidence: only 10 of 311 adjacent o-pairs are swap-related.

## Shipped

- `public/colors/squares-2-k{1..6}.json` — 27,479 records, 8.4 MB total (k=6 is 6.7 MB), ids
  `col-<k>-<n>`, each self-contained: HNF lattice, color per cell, orbit per grid point, the folded
  colored vertex figures, tile/edge orbit counts.
- `/colors` page: the /freedraw workbench layout (filter wall, paginated thumbnails, interactive
  detail aside with pan/zoom, lattice overlay, orbit-dot hover). The lattice and orbit overlays are
  the freedraw renderer's own functions, exported with structural types — a ColorPattern shares the
  HNF + orbit fields, so nothing was ported twice. Not in the header nav yet; not in /library or
  /play yet — inspection first.
- Decode is ~1 ms/solution; full corpus + all four convention canonicalizations + chirality pass
  + write ≈ 3 min.

## The triangle and combined grids (added later the same day)

Marek's `solver_triangles_2_colors` (66 files, k ≤ 6) and `solver_triangles+squares_2_colors`
(294 files, k ≤ 4) decode through the same driver with two grid modes: the triangle grid is a
fixed-lattice develop with TWO cells per coset (up/down, index 2·coset + type via the
tripled-centroid encoding — the same trick that makes D6 act linearly, reused for the canonical
form), and the combined grid is patch mode — exact ℤ[ζ₁₂] develop plus the freedraw PatchComplex
(face-walk closure and torus Euler run unchanged, zero digons), emitted as explicit per-period
polygons each carrying its color.

| grid | k=1 | 2 | 3 | 4 | 5 | 6 | total |
|---|---|---|---|---|---|---|---|
| triangle | 9 | 54 | 556 | 2002 | 9655 | 57871 | 70,147 |
| tri+square | 27 | 250 | 1851 | 11192 | — | — | 13,320 |

All 83,467 develop cleanly (0 failures, 0 mismatches). The convention experiments REPLICATE on the
triangle grid: 0 duplicates under rotations and under rotations+mirrors (mirror pairs merged, colors
labeled — Marek's counts exact again), swap folds ~40%, and the `_o_` files are once more exactly
the chiral solutions (21,235 of 21,235 chiral in o files, 0 in main). The combined grid has no cell
lattice to canonicalize over, so Marek's dedup is trusted there — the convention being proven on
both cell grids. Note the ts corpus CONTAINS the pure-square and pure-triangle colorings as
degenerate cases (its k=1 tokens include A3B3); they are distinct catalogue entries on a different
underlying tessellation, kept under the ts grid label.

Shipped: `public/colors/tri-2-k{1..6}.json` (27 MB, k=6 alone 23 MB) and `ts-2-k{1..4}.json`
(17.2 MB, k=4 alone 15 MB) — public/colors now totals ~54 MB, the repo-size flag of this batch.
The colors class spans three grids on /colors (grid selector), /library (Grid facet, `cogrid=`)
and /play (Colored tilings → grid → k in the tree, `colt-`/`colts-` deep links) — 110,946
colorings total.

## Open

- Certification when this joins the atlas: no independent enumeration exists, so by the freedraw
  precedent the class would ship as "candidate" — with the k=1 hand check and the internal
  consistency battery as evidence. Worth asking Marek if any published count exists for small k
  (perfect-coloring literature) to anchor at least one slice.
- The solver exe can go past k=6 and, presumably, to 3+ colors and other grids; the decoder
  generalizes the same way freedraw's did (a new units dict + color map).
