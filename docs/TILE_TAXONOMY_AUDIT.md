# Taxonomy audit: classifying what the Atlas already has, and what it is missing and why

**Companion to `TILE_TAXONOMY.md`.** AL's question (2026-07-25): rather than adding polygons, classify the
existing results under the new taxonomy and report where a family is missing tilings *because a tile was
missing in the first place*.

Every number below is computed. Scripts, all read-only, run from `tools/ctrnact-oracle/alphabets/`:

| script | output |
|---|---|
| `analysis/classify_palette_tiles.py` | the taxonomy-cell placement of §2 |
| `analysis/survey_palettes.py` | per-tile `(D, n, p, convexity)` across every Euclidean palette |
| `analysis/enumerate_tilespace.py D nmax` | the shape space from scratch, for the diffs in §3 |

**Headline:** the largest gap is not a missing tile. It is a palette that AL built on 2026-07-12 to search
all families together, which was never compiled and never run (§3.1). Second largest is a cell of AL's own
Venn diagram that contains exactly one tile, by accident (§3.2).

---

## 1. Correction to the formalization: the Atlas runs in two modes

`TILE_TAXONOMY.md` models a tile as an angle word on a fixed 2π/D grid. That is only half of what ships.

| mode | how a tile is fixed | shelves | tilings |
|---|---|---|---|
| **discrete** | angles pinned to a `D`-grid palette | regular (ctrnact, galebach), star, composable, scaled, polyomino, islamic | ~26,100 |
| **parametric** | one angle left FREE, carried as `alphaRange` + `paramCell` | isotoxal, mixed | 4,761 |

A parametric entry is not one tiling. It is a one-parameter curve through shape space: `4α` with
`alphaRange = [0,180]` covers *every* rhombus, so the whole `n = 4`, `p = 2` line is present, not a
lattice sample of it. `ctrnact-star` is mixed (12 of its 172 entries are parametric).

This matters twice. It retracts a finding (see the ⚑ note in `TILE_TAXONOMY.md` §6). And it means the
taxonomy needs a third state per cell, not two: **covered discretely**, **covered as a continuum**, or
**absent**. A cell can be densely covered by one parametric family and still be empty for every
*combination* involving another family, which is exactly what §3.1 turns out to be.

---

## 2. Part A: the existing results, classified

### 2.1 AL's Venn diagram, populated by measurement

Every tile in every Euclidean palette, reduced to its **coarse** reading (flat 180° vertices merged, so
edge lengths become integers) and placed in the four cells AL described:

| cell | convexity | tile entries | distinct shapes | periods present |
|---|---|---|---|---|
| equilateral ∩ equiangular = **regular** | convex | 89 | 34 | `{1: 89}` |
| **equilateral** only | concave | 183 | 131 | `{2, 3, 4, 5, 7}` |
| **equilateral** only | convex | 58 | 30 | `{2, 3, 4, 5, 7}` |
| **equiangular** only (unequal edges) | convex | **1** | **1** | `{2}` |
| **neither** (fully irregular) | concave | 5 | 5 | `{4, 6, 8}` |

Combined-cell period histogram for the equilateral-only band: `{2: 217, 3: 10, 4: 5, 5: 6, 7: 3}`.

Three things this confirms or reveals:

**The `p = 1 ⟺ regular` theorem holds empirically.** Every one of the 89 regular entries has `p = 1`, and
nothing else does. The period axis really does subsume "regular" as its degenerate case.

**The equilateral band is a `p = 2` monoculture.** 217 of 241 entries. The `p ≥ 3` tail is 24 entries, and
those are almost all the convex composites plus the girih bowtie.

**AL's "same interior angles, different edge lengths" cell holds exactly one tile in the entire Atlas:**

```
tetromino  I  E = (4,1,4,1)  A' = (90°,90°,90°,90°)      ← the 1x4 rectangle
```

It is there by accident. It was added as the I-tetromino, filed under polyominoes, not because anyone was
populating the equiangular family. AL's own worked examples for this cell, the 1×3 rectangle and the
equiangular hexagon with edges 1,1,2, are both absent (§3.2).

### 2.2 Per-shelf placement

| shelf (source) | mode | palette | D | taxonomy region | tilings |
|---|---|---|---|---|---|
| ctrnact, galebach | discrete | `regular` | 12 | `p = 1`, convex | 22,148 + 1,248 |
| ctrnact-star | discrete + 12 param | `star18/20/24/24full` | 18, 20, 24, 180 | equilateral, `p = 2`, concave | 172 |
| composable | discrete | `composite-convex`, `composite-decomp` | 12 | equilateral, `p ∈ {2,3,4,5,7}`, convex | 1,451 |
| isotoxal | **parametric** | family search | none | equilateral, `p ≤ 2`, both convexities | 4,690 |
| mixed | **parametric** | family search | none | equilateral, `p ≤ 2`, α tiles + stars | 71 |
| scaled | discrete | `regular-scaled-123` | 12 | coarse-**regular**, `ℓ ∈ {1,2,3}` | 1,061 |
| polyomino | discrete | `tetromino` | 12 | order-4 only; `p ∈ {2,4,5,6,8,10}` | 27 |
| islamic | discrete | `girih` | 20 | shape + strapwork (axis 3) | 192 |

Note the scaled row: in the coarse reading a scaled tile is a **regular** polygon with `ℓ = s`. The shelf
carries no non-regular shape at all. This is why the equiangular cell stayed empty: "scaled" looked like it
was covering "same angles, different edges", but every one of its tiles has *all* edges equal.

---

## 3. Part B: what is missing, and why

Each item is labelled **PROVEN** (the tile is absent and demonstrably tiles the plane, so tilings are
certainly missing), **OPEN** (the tile or combination is absent; whether tilings exist is unknown without a
search), or **NO GAP**.

### 3.1 The un-run all-families palette — PROVEN gap in coverage, largest single item

`alphabets/palettes/combined-z24.json` exists in the repo:

```
"ALL-FAMILIES-TOGETHER palette (AL 2026-07-12): the ζ₂₄ union of star24
 (regular {3,4,6,8,12} + Myers in-ring star species) and composite-convex …"
D = 24, 31 tiles = 5 regular + 15 star + 11 composite
```

It was **never compiled** (there is no `eu_develop.combined-z24` among the 17 built variants) and **never
run** (no `run-*combined*` directory; the only file in the repo that mentions the palette is the palette).

Consequence: **every shipped shelf is single-family.** The searched tile-set combinations are

```
regular×regular ✓   regular×star ✓   regular×α ✓   α×star ✓   regular×composite ✓
composite×star ✗    composite×α ✗    scaled×anything-else ✗    girih×anything-else ✗
```

So every tiling that needs a star *and* a composite tile is absent from the Atlas, and no missing tile
explains it. Both tiles are already in the inventory; they have simply never been offered to the solver at
the same time. This is a gap of *combination*, which the current taxonomy cannot even express, because it
classifies tiles and shelves but never the cross product.

Cheap to test: the palette and the whole toolchain already exist. `make PALETTE=combined-z24` then
`PALETTE=combined-z24 ./run-oracle.sh 1` (and `2`) settles it with no new tiles and no new code.

### 3.2 The empty equiangular cell — PROVEN, three monohedral tilings missing

The cell holds only the 1×4 rectangle (§2.1). Absent, and each tiles the plane, so each is a 1-uniform
tiling the Atlas does not contain:

| tile | coarse form | why it certainly tiles |
|---|---|---|
| 1×2 rectangle (domino) | `E = (2,1,2,1)`, `A' = (90°)⁴` | aligned grid, edge-to-edge |
| 1×3 rectangle | `E = (3,1,3,1)`, `A' = (90°)⁴` | same; **AL's own example** |
| equiangular hexagon | `E = (1,1,2,1,1,2)`, `A' = (120°)⁶` | opposite sides equal and parallel ⇒ tiles by translation; closure verified |

The 1×4 is present and the 1×2 and 1×3 are not, which is the sharpest possible illustration that this cell
was never curated as a family. Nothing in the engine objects to any of them: all three are legal angle
words at `D = 12`.

Related and already documented: the polyomino shelf is **order 4 only** (`polyominoOrderOf` says so in
code). The monomino is covered as the square; the domino, both trominoes and all twelve pentominoes are
absent. The domino therefore falls through two gaps at once, as an equiangular tile and as an order-2
polyomino.

### 3.3 The `[30,150]` rhombus — OPEN, and the reason is instructive

`enumerate_tilespace.py 12 10` finds exactly 15 convex equilateral tiles at `D = 12`. Fourteen are in
`composite-convex`. The missing one is the thin rhombus `[30°,150°]`, and it is absent from **every**
discrete Euclidean palette.

The cause is principled: `composite-convex` was generated by gluing regular {3,4,6,12} polygons, so every
corner angle is a **sum** of angles from {60,90,120,150}, and 30° is not such a sum. The palette is
complete for *unions of regular polygons* and incomplete for *convex equilateral tiles on the 30° grid*.
The shelf is named after the second.

But the loss is narrower than it looks, because of §1: the **monohedral** 30/150-rhombus tiling *is* in the
Atlas, as the point α = 30° of the parametric `4α` isotoxal family. What is missing is the rhombus **in
combination with the composites**, which is un-searched for the same reason as §3.1. Whether such tilings
exist is open.

All 11 composite tiles appear in at least one shipped tiling (usage counts 16 to 5,585), so the palette has
no dead weight. That raises rather than lowers the prior that a twelfth tile would yield new tilings.

### 3.4 Concave with `p ≥ 3` — OPEN, largest unexplored region

Concave tiles in the Atlas are: stars (`p = 2` by construction), the five non-square tetrominoes, and the
single girih bowtie (`p = 3`). Nothing has ever been searched systematically in concave `p ≥ 3`. AL's
S-octagon `[90°,45°,270°,135°]`, `p = 4`, is a legal `D = 24` word and is in no palette.

For scale, from `enumerate_tilespace.py 12 10`: the `D = 12` shape space to `n = 10` holds 11,765 tiles, of
which 11,750 are concave and 9,494 have `p = m` (no symmetry at all). The Atlas holds 131 distinct concave
shapes. This is the region where "how much is missing" is least knowable, and the honest answer is: most of
it, but nobody knows how much of it tiles.

### 3.5 Star orders — OPEN, bounded by which `D` exist

An `n`-pointed star needs `360/n` on the grid, i.e. `D mod n = 0`. Available `D ∈ {18, 20, 24, 180}` gives

```
reachable n = {3, 4, 5, 6, 8, 9, 10, 12, 18, 20, 24}
absent      n = 7, 11, 13, 14, 16, 17, 19, 21, 22, 23, …   (no palette with a compatible D)
```

`n = 7` would need `D` divisible by 7 and no palette has one. This is principled (a 7-fold star cannot meet
regular {3,4,6,12} tiles at a legal vertex) but it is nowhere stated. Separately, `star180u` at `D = 180`
ships 8 star orders where the grid admits roughly 16, so that palette is not exhaustive for its own `D`.

### 3.6 NO GAP — three positive results worth recording

**Regular shelf is complete.** Palette {3,4,6,12} at `D = 12`. The regular polygons that can appear in an
edge-to-edge tiling by regular polygons are exactly {3,4,6,8,12}; the octagon is excluded by the settled
12-direction decision and handled analytically (any octagon-bearing tiling *is* the 4.8.8 tiling, hence
1-uniform, re-added by hand as `t1002`). Angle-valid but non-realizable configurations such as 3.7.42,
3.8.24, 3.9.18, 3.10.15, 4.5.20 and 5.5.10 are correctly absent.

**`star24full` is provably complete for isotoxal stars at `D = 24`.** For an `n`-pointed star,
`α + β = 360° − 360°/n` with `β > 180°`, so `α < 180° − 360°/n`. On the 15° grid that admits 42 valid
`(n, α)` pairs across `n ∈ {3,4,6,8,12,24}`. The palette ships **42, missing 0.** Verified by enumeration,
not by inspection.

**`girih` is complete for the classical girih set:** regular decagon, regular pentagon, bobbin hexagon
`(72,144,144)`, bowtie `(72,72,216)`, rhombus `(72,108)`. All five present.

---

## 4. Answering the question directly

**Are families missing tilings because a tile is missing?** Yes, in two places, and both are narrower than
the headline suggests:

- the **equiangular** cell is missing three tiles that provably tile (§3.2), so at least three 1-uniform
  tilings are absent, and the cell has no curated family behind it at all;
- the **convex** shelf is missing one tile (§3.3), whose solo tiling is nevertheless covered parametrically
  elsewhere, so the real loss is combinational.

**But the dominant cause of missing tilings is not a missing tile.** It is that the tile inventory is
siloed into single-family palettes and the cross-family palette was never run (§3.1). No new tile is
needed to fix that, only a build and two solver runs.

**And the regular and star shelves are provably complete** for their families (§3.6), which is a stronger
statement than the Atlas currently makes anywhere. Those completeness proofs are worth surfacing in the UI,
because right now a complete shelf and a hand-sampled one look identical to a reader.

## 5. Recommended order of work

1. **Build and run `combined-z24` at k = 1 and k = 2.** Zero new tiles, zero new code, tests the biggest
   gap. If it yields tilings, the composite×star region is a new shelf and the taxonomy gains its first
   cross-family cell.
2. **Fill the equiangular cell**: 1×2 rectangle, 1×3 rectangle, equiangular hexagon `(1,1,2)²`. Each is
   provably productive, so this is guaranteed to add tilings rather than merely possibly.
3. **Record the completeness statements** from §3.6 as machine-checked assertions next to the palettes,
   so "complete" and "hand-sampled" stop looking alike.
4. Only then consider a concave `p ≥ 3` probe (§3.4), which is the largest region but the least certain.

Items 1 and 2 together are a day's work and are the whole answer to AL's question. Item 4 is the open
research direction.
