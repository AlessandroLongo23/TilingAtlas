# Tile taxonomy: a formalization of the shape space, and where the Atlas actually sits

**Status: PROPOSAL for AL review (2026-07-25).** Written from AL's verbal scheme (transcribed), then
checked against the engine and measured against the shipped palettes. Every count below was computed, not
estimated; the scripts are named so you can re-run them. Read §5 (corrections) and §7 (gaps) first if
you only read two sections.

> The attached sketch arrived as a 0-byte file, so the four shapes were reconstructed from the verbal
> description (hexagram; S-octagon; 60/120 rhombus; equilateral hexagon 90/150/120) and each was verified
> numerically instead. All four are consistent, see §2.4. If the drawing held anything else, re-send it.

---

## 1. The model

Fix an **angular resolution** `D`: every interior angle is an integer multiple of 2π/D. The engine already
works this way, one `D` per palette (`alphabets/palettes/*.json`, field `"D"`; shipped values 12, 18, 20,
24, 180).

A **tile** is a simple closed polygon with all edges of unit length, written as its cyclic interior-angle
word

```
A = (a_0, …, a_{n−1}),   a_i ∈ {1, …, D−1}          (angle a_i · 2π/D)
```

subject to three conditions:

| condition | statement | meaning |
|---|---|---|
| angle sum | Σ a_i = D(n−2)/2 | interior angles sum to (n−2)π; equivalently total turning is one full loop |
| closure | Σ_k **u**(Dir_k) = **0**, Dir_k = Σ_{i<k}(D/2 − a_i) mod D | the boundary returns to its start |
| simplicity | no two non-adjacent edges cross | it is a polygon, not a self-overlapping path |

`**u**(d)` is the unit vector at direction 2πd/D. The turn at vertex i is `D/2 − a_i`; reflex vertices
(`a_i > D/2`) turn negatively.

This is not a new model. It is exactly what `alphabets/gen_alphabet.py` implements: tile kind `composite`
takes a raw `angles` word, and `_word_period(angles)` already computes the period. The formalization below
names what the code already does.

### 1.1 Two readings of the same tile

The single most useful move is to distinguish two readings, because it dissolves the apparent tension in
your scheme between "same edge length" and "same interior angles".

**Fine reading.** All edges unit, and `a_i = D/2` (a flat 180° vertex) is *allowed*. This is the engine's
internal form. In this reading **every tile in the Atlas is equilateral, by construction.**

**Coarse reading.** Merge every maximal run of collinear edges into one edge. You get an edge-length word
`E = (ℓ_1, …, ℓ_m)` of positive integers and an angle word `A' = (α_1, …, α_m)` with no 180° entry.

The collapse Fine → Coarse is a function; the inverse subdivides each `ℓ_j` into `ℓ_j` unit edges joined by
flat vertices. So "equilateral with flat vertices" and "equiangular with unequal integer edges" are the
same objects seen twice. Your remark that scaled tiles "fall in the same edge length, although it feels
like the edge length is not the same" is exactly this, and it is the reason the two properties in your
scheme are not independent axes.

### 1.2 The invariants

Per tile, in the **coarse** reading:

- `m` — number of genuine corners; `n` — perimeter in unit edges (`n = Σ ℓ_j`)
- `E`, `A'` — the edge-length and angle words
- **`p`** — the **period**: the least `p` dividing `m` such that the *combined* word
  `((ℓ_1,α_1), …, (ℓ_m,α_m))` is invariant under a shift by `p`
- **rotational symmetry order = `m / p`**
- **convex** ⟺ all `α_j < π`; **concave** ⟺ some `α_j > π`
- **equilateral** ⟺ all `ℓ_j` equal; **equiangular** ⟺ all `α_j` equal

Your instinct to put the period on the angle sequence for equilateral tiles and on the edge sequence for
equiangular tiles is right, and the combined word is the statement that covers both at once plus the case
where both vary. `p` divides `m` necessarily: the shifts fixing a cyclic word form a subgroup of ℤ/m.

---

## 2. What the model forces (four small theorems)

These are worth stating because three of them pin down cells of your Venn diagram, and one of them is a
correction.

### 2.1 Equiangular implies convex. The "concave and equiangular" cell is empty.

If all `α_j` are equal then each equals `(m−2)π/m < π`, so no angle is reflex. Therefore:

- **Regular = Equilateral ∩ Equiangular**, and every regular polygon is convex.
- Your "of course they are convex, because a concave polygon cannot be regular" is a theorem, not an
  observation. The empty cell is a real feature of the diagram, not an accident of what we happen to have.

Caveat: this holds for **simple** polygons. The regular star polygons {n/k} are equilateral and
equiangular as *self-intersecting* paths. The Atlas only ever uses their simple outlines, which are
equilateral with alternating angles, so the theorem applies throughout and stars land in §2.3 instead.

### 2.2 p = 1 ⟺ regular.

`p = 1` means the combined word is constant, so all edges are equal and all angles are equal. With §2.1
that is exactly regular, and the symmetry order is `m/1 = m`. So **the period axis subsumes "regular" as
its degenerate case**, not sitting beside it. This is the cleanest justification for making `p` the
organizing parameter.

### 2.3 p = 2 and equilateral ⟺ the star / isotoxal band.

For an equilateral `2k`-gon with angles alternating `α, β`, the angle sum gives

```
α + β = 2π − 2π/k          (in degrees: 360 − 360/k)
```

which is precisely the relation the code uses (`dU = D − D//n − aU` in `gen_alphabet.py`). These polygons
are edge-transitive, i.e. **isotoxal**. Splitting by convexity:

- `β < π` → a convex isotoxal polygon: today's **convex irregular** / **isotoxal** tiles
- `β > π` → a star: today's **star** tiles

So "star" and "isotoxal" are not two ideas. They are one cell of the lattice cut by convexity, which is
what you were reaching for with "Isotoxal: the same, just more generalized."

### 2.4 The four sketched shapes, verified

| shape | n | angle word | Σ check | p | order `m/p` |
|---|---|---|---|---|---|
| hexagram (6-point star) | 12 | (60, 240)⁶ | 6·300 = 1800 = (12−2)·180 ✓ | 2 | 6 |
| S-octagon | 8 | (90, 45, 270, 135)² | 2·540 = 1080 = (8−2)·180 ✓ | 4 | 2 |
| rhombus | 4 | (60, 120)² | 2·180 = 360 ✓ | 2 | 2 |
| equilateral hexagon | 6 | (90, 150, 120)² | 2·360 = 720 ✓ | 3 | 2 |

All four close geometrically as well as satisfying the angle sum (checked by summing unit edge vectors).
Your reading of each, including "period 4 gives 180° rotational symmetry" for the S-octagon, is correct
and matches `order = m/p`.

---

## 3. The structural correction: three axes, not one list

The current `TILE_CLASS_ORDER` is a single flat list:

```
regular, star, convex, isotoxal, mixed, scaled, polyomino, islamic, freedraw, colors, hyperbolic, spherical
```

That list flattens three independent things, which is why "Hyperbolic" appears both as a geometry toggle
and as a tile class, and why "Colored" sits beside "Regular" as though they were alternatives. They are
not: a colored tiling of regular polygons is both.

**Axis 1, geometry.** E² / H² / S². Sets the angle-sum law (`= (n−2)π`, `<`, `>`). In H² and S² there is no
similarity, so edge length is pinned by the angles and the shape space is parameterized differently (§8.3).

**Axis 2, tile shape.** The `(D, m, E, A', p, convexity)` stratification of §1. This is where regular,
star, convex-irregular, isotoxal, polyomino and the girih shapes all live, as *regions* of one space.

**Axis 3, decoration.** What is carried on top of a tiling, independent of tile shape:

| decoration | current class | shape-dependent? |
|---|---|---|
| none | (plain) | — |
| face coloring | `colors` | no |
| edge system (subset of edges drawn; tiles = merged regions) | `freedraw` | no |
| strapwork (Hankin) | `islamic` | partly (needs a girih-like palette) |

The Atlas already crosses axes 1 and 3 (colorings and edge systems now exist in E², H² and S²), which is
proof that they are orthogonal. The class list just does not say so.

**Recommendation:** the shelf facets should read `geometry × shape-region × decoration`, and the "tile
class" should become a *derived* label computed from a tiling's tile multiset, not a curated tag.

---

## 4. Where the Atlas actually sits (measured)

`/tmp/survey.py` loads every Euclidean palette through the engine's own `load_palette`, reconstructs each
tile's angle word, and computes `p`. Result over all Euclidean palettes (321 tile entries):

```
period histogram   {1: 76, 2: 226, 3: 14, 4: 5, 5: 9, 7: 3, 10: 3}
D values used      {12, 18, 20, 24, 180}
```

Mapping the classes onto §1:

| class | formal cell | verified |
|---|---|---|
| Regular | `p = 1` | ✓ |
| Star | equilateral, `p = 2`, concave | ✓ every star is an `{n/k}` outline |
| Isotoxal | equilateral, `p ≤ 2` | ✓ |
| Convex irregular | equilateral, convex, `p ∈ {2,3,4,5,7}` | ✗ **not `p = 2` only**, see §5.1 |
| Mixed | union of the above in one palette | palette-level, not a shape class |
| Scaled | coarse-**regular** with `ℓ = s > 1` | ✗ **not a shape class**, see §5.2 |
| Polyomino | equilateral, `α ∈ {90°, 270°}` coarse, `p` arbitrary | ✓ `p` up to 10 measured |
| Islamic | `D = 20` shapes **+ strapwork decoration** | axis-3 item |
| Freedraw | tiles *derived*, not chosen | different generative mode, §8.2 |
| Colors | decoration only | axis-3 item |

---

## 5. Corrections to the verbal scheme

### 5.1 "We are always using polygons with period 2, never more than that" is false

The convex composite tiles already reach periods 3, 4, 5 and 7, and polyominoes reach 10:

```
composite-convex (D=12):  cx6-3.4.5…  p=3     cx8-4.4.5.5…  p=4
                          cx5-2.5.3.3.5 p=5   cx7-3.5.4.5.3.5.5 p=7
tetromino (D=12):         S, Z, I p=5         T, J, L p=10
girih (D=20):             bowtie p=3 (and concave)
```

What *is* confined to `p ≤ 2` is the **star** family (every star is an `{n/k}` outline, so `p = 2` by
construction) and the **isotoxal** palettes (isotoxal means `p ≤ 2` by §2.3). So the restriction you
remembered is real, but it applies to the concave side only. That distinction is what §7.1 turns into the
main gap.

### 5.2 "Scaled" is not a shape class

A scaled tile is a side-`s` regular N-gon, represented in the fine reading as an `sN`-gon with one real
corner followed by `s−1` flat 180° corners (`gen_alphabet.py`: `self.p = self.scale`). In the **coarse**
reading it is simply a regular N-gon with `ℓ = s`. It is regular. Nothing about its shape is new.

What is new is a property of the **tile set**: the palette now contains more than one edge length. So
"Scaled" belongs with "Mixed" as a *palette-level* descriptor, one level up from the shape axis. Filing it
as a tile class is what makes the current taxonomy feel arbitrary.

### 5.3 The hexagon 1,1,2 example needs the coarse reading to be equiangular

You described "a hexagon with edge length 1, 1, 2, where the 2 is two edges with 180° in between". In the
fine reading that polygon has a 180° vertex among 120° vertices, so it is *not* equiangular. It is
equiangular only in the coarse reading, where `E = (1,1,2,1,1,2)` and `A' = (120°)⁶`. It does close (checked).
The example is right; it just lives on the coarse side of §1.1.

---

## 6. Reconstructing a palette from the model, as a test

To test whether the formalization is faithful, `/tmp/tilespace2.py` enumerates the shape space from
scratch (all simple closed unit-edge polygons on the `D`-grid, up to rotation and reflection) and compares
with what is shipped.

**Convex, `D = 12`, `n ≤ 10`: the model finds exactly 15 tiles.** Fourteen of them are in
`composite-convex`. One is not:

```
n=4  p=2  [30, 150, 30, 150]        ← the thin rhombus, absent from EVERY Euclidean palette
```

The omission is principled once you see why. `composite-convex` was built by gluing regular {3,4,6,12}
polygons, so every corner angle is a **sum of regular angles** drawn from {60, 90, 120, 150}. And 30° is
not such a sum. The palette is therefore complete for *unions of regular polygons* and incomplete for
*convex equilateral tiles on the 30° grid*. Those are different families, and the shelf is named after the
second while delivering the first.

> **⚑ RETRACTED (2026-07-25, same day).** An earlier revision of this section claimed that
> `isotoxal-star-z24` ships "only 2 of 5" rhombi at `n = 4` and called it an oversight. That was wrong as
> a statement about the Atlas. The palette *file* does contain 2 of 5, but **no shipped shelf uses it**:
> the isotoxal shelf is **parametric** (all 4,690 entries carry an `alphaRange`; `4α` spans α ∈ (0°,180°)),
> so every rhombus is covered continuously. The formalization in §1 assumed a discrete `D`-grid and so
> could not see this. See `TILE_TAXONOMY_AUDIT.md` §1 for the discrete/parametric correction, which is a
> genuine hole in this document's model, not a detail.

**The point is not the rhombus.** It is that nobody can tell an oversight from a deliberate restriction by
looking at a hand-written palette, and the enumeration settles it in half a second. That remains true, and
the audit found a real instance of it (the `[30,150]` rhombus is genuinely absent from every *discrete*
palette, for a reason worth knowing).

---

## 7. What is missing

### 7.1 Concave with p ≥ 3 is essentially unexplored (the main gap)

Concave tiles in the Atlas are stars (`p = 2` by construction), polyominoes (hardcoded), and one girih
bowtie. There is no systematic search anywhere in `p ≥ 3` concave. Your own S-octagon is exactly this
family: `(90, 45, 270, 135)`, `p = 4`, all angles multiples of 15°, so it is representable at `D = 24`
today and it is in no palette.

### 7.2 Asymmetric tiles (p = m) are the overwhelming majority and are absent

Measured shape space, `D = 12`:

```
  n   total  convex  concave   period histogram
  3       1       1        0   {1: 1}
  4       3       3        0   {1: 1, 2: 2}
  5       3       1        2   {5: 3}
  6      21       4       17   {1: 1, 2: 2, 3: 6, 6: 12}
  7      54       1       53   {7: 54}
  8     327       3      324   {2: 3, 4: 42, 8: 282}
  9    1618       1     1617   {3: 10, 9: 1608}
 10    9738       1     9737   {5: 244, 10: 9494}
TOTAL 11765 (15 convex, 11750 concave)
periods {1:3, 2:7, 3:16, 4:42, 5:247, 6:12, 7:54, 8:282, 9:1608, 10:9494}
```

Two things jump out. Convexity is vanishingly rare (15 of 11,765), so a taxonomy organized around convex
families is describing a sliver of the space. And `p = m` (no rotational symmetry at all) dominates
completely, and the Atlas has essentially none of it outside the seven tetrominoes.

### 7.3 Easy shapes that are missing

- the **1×2 rectangle (domino)**. Coarse `E = (1,2,1,2)`, `A' = (90°)⁴`, `p = 2`. Tiles the plane trivially.
  Not in any palette (`tetromino` only carries the seven 4-cell pieces).
- the **thin rhombus** at `D = 12` (§6) and three of the five rhombi at `D = 24`.
- the **thin Penrose rhomb** `(36°, 144°)`. Valid at `D = 20`, where `girih` already ships the *fat* rhomb
  `(72°, 108°)`. With both, the engine could search rhombic tilings on the decagonal grid.
- the **equiangular hexagon** `E = (1,1,2,1,1,2)`, `A' = (120°)⁶` from your own description (§5.3).
- every convex tile with `p ≥ 3` at `D = 24` beyond the handful curated by hand.

### 7.4 A caution on scale

The enumeration is cheap (0.5 s to `n = 8`, ~90 s to `n = 10` at `D = 12`) but the space grows fast, and
the *tiling* search cost grows with alphabet size. A 11,765-tile palette would not survive the k-uniform
search. So the proposal in §9 is not "search everything". It is "enumerate the shape space for provenance
and taxonomy, then run searches on subsets defined by an explicit query", which converts every omission
from invisible into documented.

---

## 8. Hard limits of the scheme

Things the formalization cannot express at all. Worth knowing, because they bound the word "complete".

**8.1 Commensurability.** All angles are multiples of 2π/D, and `D` is fixed per palette. Two consequences:
tiles with angles incommensurable with 2π are unreachable, and two palettes with different `D` cannot be
mixed in one search (girih `D = 20` and the square grid `D = 12` would need `D = 60`, which no palette has).

**8.2 Rational edge ratios only.** Unit edges force all coarse edge lengths to be integers, so only
rational edge ratios are representable. **The Penrose kite and dart are therefore outside the model**
(edges 1 and φ). The Penrose *rhombs* are inside it (all edges equal). This matters directly for the Sub
Rosa work on `feat/subrosa-editor`.

**8.3 Non-Euclidean shape space is a different object.** In H² a regular p-gon's angle is a function of
edge length, so "regular {p}" is a one-parameter family and the vertex-closure equation pins `ℓ`. The
combinatorial invariants (`m`, `p`, convexity) still apply, but `A'` is no longer free: you choose the
combinatorics and the geometry follows. The `hyp-*` palettes reflect this already.

**8.4 Topology.** A single cyclic word is a simply-connected bounded polygon. It cannot express tiles with
holes, disconnected tiles, or unbounded tiles. The freedraw class *does* produce all three
(`FreedrawKind = finite | strip | unbounded | holes`), so the shape model and the freedraw model disagree
about what a tile is. That disagreement is currently unstated.

**8.5 Edge-to-edge.** The engine glues half-edges, so tilings are edge-to-edge in the fine reading. The
flat-vertex trick buys *integer* offsets in the coarse reading (a long edge meeting several short ones),
which is genuinely non-edge-to-edge coarsely, but irrational offsets stay unreachable.

**8.6 Curved boundaries** are out of scope entirely.

---

## 9. Verdict and recommendation

**Does the scheme hold up?** Yes, with the corrections in §5. It is the right organizing idea, it is
already latent in the code (`_word_period`), and making `p` the primary axis is justified by §2.2 (`p = 1`
is regular) and §2.3 (`p = 2` is the star/isotoxal band). Two structural changes are needed: fold your two
axes into the fine/coarse readings of one word (§1.1), and separate geometry and decoration out of the
shape axis (§3).

**Is it complete?** As a *language*, yes, for bounded simply-connected polygons with angles commensurable
to 2π and rational edge ratios; every such tile has exactly one signature and the cells partition the
space. As *coverage*, no, and now quantifiably so: `p ≤ 2` systematically plus a hand-picked handful at
`p ∈ {3,4,5,7,10}`, out of a space where `p = m` dominates.

**Do we lose generality?** Not by adopting the scheme. The generality was already lost, in the palettes,
before any taxonomy existed. The scheme makes the loss visible and measurable, which is the improvement.

**Recommended next step: invert the pipeline.** Today a palette is hand-written and the class is a curated
tag. Instead:

1. Land the enumerator (`tools/ctrnact-oracle/alphabets/enumerate_tiles.py`) producing, for a given
   `(D, n_max)`, the canonical tile set with signatures. Prototype exists and reproduces `composite-convex`
   to within one tile.
2. Generate palettes as **queries** over that set ("convex, `p ≤ 2`, `D = 12`"), so each palette carries a
   machine-checkable completeness statement instead of a comment.
3. Compute each catalogue tiling's class from its tile multiset, making the shelf label **derived**.
4. Re-cut the facets as `geometry × shape-region × decoration`.

The cheapest concrete wins available immediately, independent of the above: add the missing rhombi
(§6), the domino, the thin Penrose rhomb, and one deliberate `p ≥ 3` concave family (the S-octagon is a
good probe) and see what the engine finds. If `p ≥ 3` concave turns out to tile richly, that is a new
shelf and it is the largest unexplored region in the measured space.

---

## Appendix: reproducing the numbers

Run both from `tools/ctrnact-oracle/alphabets/`:

| script | what it does |
|---|---|
| `python3 analysis/survey_palettes.py` | loads every Euclidean palette via the engine's own `load_palette`, prints per-tile `(D, n, p, convexity, angles)` and the period histogram of §4 |
| `python3 analysis/enumerate_tilespace.py D nmax` | enumerates the shape space from scratch, prints the tables of §7.2 and the convex list of §6 |

Both are **prototypes**, deliberately read-only (they touch no palette and no build output). Step 1 of §9
is to promote the second to a first-class generator with tests. The `simple()` check is O(n²) segment
intersection and is the bottleneck past `n = 10`; the DFS itself prunes on partial angle sum and on the
geometric closure bound (remaining unit edges cannot span more than their count).

Timings on this machine: `D=12 nmax=8` 0.5 s, `D=12 nmax=10` ~90 s, `D=24 nmax=6` 0.3 s.
