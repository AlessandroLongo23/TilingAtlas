# Marek's freedraw-by-edge-type proposal, tried on the square grid

**Date** 2026-08-13 · **Engine** `tools/ctrnact-oracle` · **Palette** `alphabets/palettes/fdsq.json`

## The proposal

Freedraw today marks a drawn edge by inserting a degenerate two-sided tile. The square-grid alphabet
is literally `{A2 digon, A4 square}`, "the digon marking a drawn edge" (`develop_colors.py`). That is
a workaround for an alphabet that can say *tiles meet at a vertex* and cannot say anything about an
*edge*, and it costs degenerate faces, extra degree-2 vertices and a larger alphabet.

Marek's suggestion once edge types existed: put the property on the edge. **Split every edge type
into a drawn and an undrawn variant, glue like to like, ink only the drawn ones.** Where an edge is
undrawn the two tiles across it merge visually into one cell, so the cells are polyforms glued from
the palette's tiles. "The only thing we need is to seed the vertices correctly" — read each vertex
type you already have as the case where nothing is drawn, then extend with the variants where some
subset of its edges is drawn.

## What it takes

A palette file and nothing else. `fdsq.json` is the unit square at one length with two edge types,
`u` and `d`, and six tiles: the six binary necklaces of length 4 up to the dihedral group
(0000, 1000, 1100, 1010, 1110, 1111). No new search, no new solver, no recompile — the alphabet is
data, so `EU_TABLES=tables/fdsq/tables.bin ./eu_solver_rt` runs it against the same binary the
45-45-90 palettes use. The alphabet comes out at 728 vertex types, roughly the 16 marked squares'
corners crossed with the ways four of them can meet.

THREE things in the generator had to be corrected first — none of them scaffolding, and the third is
the one that matters.

**The reflection axis of a tile need not pass through a corner.** `_MIRROR` tested only the reversal
about boundary position 0. The square with one marked edge, `[d,u,u,u]`, is achiral with its axis at
`s = 1`, and the old test called it chiral and refused the palette. It now searches for the shift.

**The frame of a vertex word is a property of the word, not of each half-edge.** `fold()` decided per
half-edge whether to read a word forwards or mirrored, taking whichever matched first. A word can
admit forwards at one half-edge and mirrored at another, and then the same edge is typed two ways and
the solver enforces a scrambled gluing rule. It now decides once per word, forwards preferred. This
is a real bug fix with a measurement behind it: **tri45all at k ≤ 3 went from 34/298/2044 developed
with 227 develop failures, to 34/354/2734 with zero.** More tilings and no rejects left over.

**A vertex and its own mirror were two different vertices.** The third, and the subject of the
diagnosis below.

## What came out

Solver at k ≤ 4 with the face filter off (`EU_NOFILTER=1`; that prune assumes unit edges and is
unsound on an edge-typed palette): 19 / 142 / 830 / 4570 pruned solutions, every one of which
developed — **zero develop failures**, and `develop_marked.py` re-checks each solution's gluings
against the alphabet's own `ETYPE` array, so "the search honoured its edge types" is a certificate
here and not an assumption.

`public/freedraw/solutions.json` holds 1420 square patterns at k ≤ 3 (13 / 153 / 1254), enumerated
independently and already checked bijectively against Marek's digon solver. `check_marked_square.py`
computes an exact canonical form for a periodic drawn-edge set — minimal period lattice, then the
lexicographic minimum over the 8 point-group elements crossed with every translation of the cell —
and it separates all 1420 oracle patterns and reproduces every one of their k values from the
geometry alone, so it is a fair referee.

| geometric k | found | freedraw | missing | **not in freedraw** |
|---|---|---|---|---|
| 1 | 7 | 13 | 6 | **0** |
| 2 | 34 | 153 | 119 | **0** |
| 3 | 125 | 1254 | 1129 | **0** |

**Nothing invented, most missing.** Every pattern the edge-type search produces is a genuine freedraw
pattern; it finds 166 of 1420. The mechanism works. The enumeration behind it does not yet, and the
next section is one fault, not a list.

## The result

**13 / 153 / 1254 — every one of freedraw's 1420 square patterns at k ≤ 3, none invented, and the
solver's k equals the geometric k in every single case.** The proposal works, and getting there took
four corrections to the alphabet generator, all of them real bugs that an equilateral palette can
never expose.

| geometric k | found | freedraw | missing | not in freedraw |
|---|---|---|---|---|
| 1 | 13 | 13 | 0 | 0 |
| 2 | 153 | 153 | 0 | 0 |
| 3 | 1254 | 1254 | 0 | 0 |
| 4 | 7848 | 7848 | 0 | 0 |

k=4 is the honest half of that table: `public/freedraw/solutions-k4.json` was never looked at while any
of this was being fixed, so its 7,848 are a held-out set, and all 7,848 come out. 9,268 patterns
matched exactly across four tiers.

`make check-regular` is byte-identical throughout: sigma is the identity on every equilateral palette,
so none of this touches the regular, star or isotoxal line.

## The four bugs, and the one idea behind three of them

The first version of this palette encoded the marking as six pre-marked squares — the six binary
necklaces of length 4 — because that is the only thing the alphabet model allowed. It found 437 of
1420. Everything below is why, and the fix is one sentence: **the marking belongs on the edge, not on
the tile.**

### 1. A tile's reflection axis need not pass through a corner

`_MIRROR` tested only the reversal about boundary position 0. The square with one marked edge,
`[d,u,u,u]`, is achiral with its axis at `s = 1`, and the old test called it chiral and refused the
palette outright. Now it searches for the shift.

### 2. The frame of a vertex word is a property of the word, not of each half-edge

`fold()` decided per half-edge whether to read a word forwards or mirrored, taking whichever matched
first. A word can admit forwards at one half-edge and mirrored at another, and then the same edge is
typed two ways and the solver enforces a scrambled gluing rule. It now decides once per word.
Measured on tri45all at k ≤ 3: **227 develop failures → 0**, and 34/298/2044 developed → 34/354/2734.
Those failures were never a developer weakness; they were the solver emitting configurations its own
alphabet forbids.

### 3. A vertex and its own mirror were two different vertices

`cyclic_reps` deduplicates words up to rotation and reflection, and took the reflection to be the
literal reversal. Reflecting a vertex figure also **mirrors every tile in it**, so the reversed word
has to be read through σ; without that, a figure and its own mirror both survive as separate symbols.
That is where the inflated k came from — a pattern whose grid points are all alike was being built out
of two "different" vertex types. Found by reversing one inflated pair through σ and landing exactly on
the other. The square grid's alphabet fell from 978 configurations to 570, `tri45all` from 267 vertex
types to 234, `regular` unchanged at 14 and 44.

Fixing it made the pattern count go **down**, 437 → 166, which is what exposed the fourth bug and the
real one.

### 4. The marking was on the tile, so mirrors could not be described

A mirror through a vertex maps each adjacent tile to itself reflected, and if the tile is marked that
**swaps its two corner classes**: the corner with the drawn edge on its left becomes the one with it on
its right. `Entry.cls` holds one integer per dart, so the folded orbit could not be written and the
entry was unusable. While bug 3 was alive, a mirror-symmetric pattern could dodge this by being built
from two chiral vertex types; merging the duplicates removed the escape route.

The count of what this cost, per abstract vertex configuration — every one with a drawn and an undrawn
edge meeting at it lost all of its mirror-symmetric variants:

| necklace | vertex words | with a mirror | mirror usable |
|---|---|---|---|
| uuuu | 43 | 16 | 6 |
| dddd | 43 | 16 | 6 |
| dddu | 136 | 16 | **0** |
| dduu | 136 | 16 | **0** |
| dudu | 76 | 16 | **0** |
| duuu | 136 | 16 | **0** |

That is also what the pseudo-digon had been buying. In Marek's alphabet the square is unmarked — one
corner class, its own mirror — and the marking rides on a separate digon tile, so a reflection never
touches a marked tile's corners.

**The fix: free edges.** A palette may now declare `edgeTypes` and give a tile `"*"` for an edge,
meaning the tile fixes nothing and the SEARCH assigns the type. The corner class then records no edge
information, σ is the identity, and each vertex word splits into the edge assignments it admits,
deduped under its own symmetries. `fdsq2.json` is the whole square grid in one tile:

    { "edgeTypes": ["u", "d"], "edgeLengths": { "u": "1", "d": "1" },
      "tiles": [ { "kind": "composite", "name": "Q", "angles": [6,6,6,6],
                   "edges": ["*","*","*","*"] } ] }

Alphabet: 1 word, 6 configurations, **27 vertex types** — exactly uuuu, duuu, dduu, dudu, dddu, dddd
with their site symmetries, where the six-marked-squares version needed 728. A6 passes: pairwise
non-isomorphic.

### 5. …and one more, which the free-edge palette then exposed

With the marking off the corner class, three places that had been separating darts *by class* stopped
working, because now every dart of the square grid is the same class and only its edge type differs:

- **`simplify()`**, the solver's WL refinement, seeded its colour with the corner class alone. The
  refinement went homogeneous, never discretized, and every closure was rejected as non-rigid: 9,112
  closures, **2** accepted. Seeded with (class, edge type) it is 4,285.
- **The pruner's WL** reads `clslistin` for the same purpose. Its colour now folds in the edge type
  wherever the class alone is ambiguous, which leaves every palette whose classes already carry their
  edges byte-identical.
- **`automorphisms()`** preserved rneig, mirro and cls but not the edge type. |Aut| is the entry's
  ferkval and its orbits are the transversal the solver uses when ATTACHING a fresh vertex, so an
  automorphism it invents is a dart the search never tries. `duuu|F` came out with ferkval 8 and reps
  `[0]` — all eight darts "equivalent" — so a vertex with one drawn edge could only ever be glued on
  by that drawn edge. This was the last gap: fixing it took k=2 from 106 to **153** and k=3 from 448
  to **1254**.

## What is still open

The 45-45-90 palettes cannot use the free-edge route: their leg and hypotenuse are different LENGTHS,
so the corner class genuinely has to know which edge is which, and σ stays non-trivial there. 11 of
`tri45`'s 27 vertex types, and 79 of `tri45all`'s 234, are still σ-mixed and unusable, so that shelf
is still incomplete — by a smaller margin than before, since bugs 1, 2, 3 and 5 all applied to it too.
Closing it needs the deeper repair: a chirality bit per dart, which the doubled dart set already
carries in `b` and which folding by a reflection throws away.

## Files

- `alphabets/palettes/fdsq2.json` — the free-edge square palette (the one that works)
- `alphabets/palettes/fdsq.json` — the six-marked-squares version, kept as the counterexample
- `alphabets/palettes/probe-q3.json` — one tile, one vertex figure, zero solutions before the fix
- `develop_marked.py` — develops a marked palette, merges cells across undrawn edges, checks every
  gluing against the alphabet's own `ETYPE`
- `check_marked_square.py` — exact canonical form and geometric k, against `public/freedraw/solutions.json`
- `rebuild-tri45-shelf.sh` — the shelf rebuild

---

# Verification pass, and three more grids (2026-08-13, later)

Everything above was rebuilt from source and re-measured, then the same construction was run on the
three freedraw grids it had never been tried on. Nothing in the searcher changed to make them work:
each one is a palette file.

## Four grids, four exact reproductions

| grid | palette | k | search | dangling | kept | freedraw | referee |
|---|---|---|---|---|---|---|---|
| square | `fdsq2` | 1–4 | 25,010 | 15,742 | **9,268** | 9,268 | canonical form, set for set |
| triangle | `fdtri` | 1–3 | 6,698 | 1,639 | **5,059** | 5,059 | canonical form, set for set |
| hex | `fdhex` | 1–3 | 372 | 271 | **101** | 101 | canonical form on the DUAL, set for set |
| square-triangle | `fdts` | 1–3 | 23,143 | 8,425 | **14,718** | 14,718 | dangling filter, count for count |

Per k: square 13 / 153 / 1254 / 7848, triangle 19 / 357 / 4683, hex 5 / 16 / 80, square-triangle
52 / 1098 / 13568. Nothing invented anywhere, nothing missing, and no pattern filed under a k that
freedraw files differently.

The referee is `check_marked_grid.py`, which is `check_marked_square.py` with the lattice as a
parameter: edge directions, point group and basis come from a table, so the triangular grid's twelve
point-group elements and three bit planes are data. It reproduces the square numbers exactly, which is
the regression that licenses it on the other two. Hex needs one idea: its vertices are a honeycomb and
not a lattice, but its hexagon CENTRES are a triangular lattice and every hex edge crosses exactly one
edge of it, so the pattern is read on the dual and a hex vertex — three hexagons meeting — is a lattice
triangle, which is where the degree-1 filter goes.

The square-triangle grid has no lattice at all (its base tiling varies per solution), so there is no
canonical form to compare; what is checked there is the count after freedraw's own definition is
applied. That is weaker, and worth stating as weaker. It is not nothing: on all three grids where the
set comparison IS available, `search - dangling == freedraw` exactly, with no duplicates left over.

## The generic form: one parameter, not a hand-written alphabet

The four palettes above now say only this, and nothing about edges at all:

    { "name": "fdtri", "D": 24, "freedraw": true,
      "tiles": [ { "kind": "composite", "name": "T", "famchar": "t", "angles": [4, 4, 4] } ] }

`alphabets/palette_spec.py` normalises that, and both halves of the engine read the normalised form,
so the searcher's gluing constraint and the developer's step length cannot drift apart. Two shorthands:

- **`edgeLens`** on a tile gives the LENGTH of each boundary edge. Distinct lengths across the palette
  are interned as the types `L1`, `L2`, … — however many different lengths the tiles have, that many
  types, which is the rule stated as a rule instead of typed out. Writing `tri45.json`'s S and H by
  hand is the same thing longhand: the derived palette generates byte-identical tables.
- **`freedraw`** splits every edge type into an undrawn and a drawn variant at the same length and
  lets the search choose per half-edge. With no lengths declared it means the one-length grid, which
  is all four palettes above; the four generic files generate byte-identically to the hand-written
  ones they replace. With several lengths the edge is emitted as a two-element choice `["L1","L1#"]`
  — the LENGTH stays pinned to the tile, only the drawn bit is free.

`./run-sts.sh <palette> <kmax>` is the whole pipeline: alphabet, solve, prune, develop, and an optional
check against the independent enumeration. `CHECK="--grid hex --oracle ../../public/freedraw/hex-solutions-k1.json …" ./run-sts.sh fdhex 3`
prints the table above.

## Two bugs in the shared machinery

**`gen_alphabet.py` could not generate any palette with a chiral tile.** σ was searched for inside the
tile only, and a chiral tile's mirror image is a different symbol, so the search failed and the
generator exited: `--palette tetromino` died on tile S. σ now looks for the mirror image across the
whole palette and lands on the twin — the one `mirror_expand` builds, or one the palette already
carries, as tetromino carries S alongside Z. With that, tetromino generates again (54,856 entries).

**`mirror_expand` built twins without their edges.** A chiral tile with edge types got a mirror image
whose sides had lost their lengths. The twin's edge word is the reversal, so corner j of the twin is
corner n-1-j of the original and its edge j is the original's edge n-2-j. A 30-60-90 triangle at
1 : √3 : 2 — chiral, three distinct lengths — now generates.

`make check-regular` is byte-identical after both, and so are the tables of every palette on disk
(the only differences anywhere are the all-zero `ETYPE` array added to alphabets generated before it
existed).

## What the σ wall costs, measured

`fdsq.json` — the same square grid with the marking on the TILE, kept as the counterexample — is a
palette where σ is not the identity and the answer is known. Through the identical pipeline it finds
**164 of 1420** patterns at k ≤ 3, and 11 of those 164 are filed under the wrong k. `fdsq2`, the same
grid with the marking on the EDGE, finds all 1420 at the right k. So the σ hole does not only lose
tilings, it also miscounts vertex orbits on the ones it keeps.

The three ways σ could enter the word dedup were measured against that known answer:

| σ in `cyclic_reps` | σ in `word_symmetries` | fdsq at k ≤ 3 | girih alphabet |
|---|---|---|---|
| yes (current) | yes | 164 of 1420 | 412 entries, 112 A6 collisions, 42 σ-mixed |
| no | yes | **1** of 1420 | 443 entries, 2 collisions, 22 σ-mixed |
| no | no (pre-2026-08-13) | generator asserts | 569 entries, 0 collisions |

The current convention is the best of the three and it is the mathematically right one — a reflection
of a vertex figure mirrors every tile in it — so it stays. What the table also shows is the price:
a word and its LITERAL reversal fold to isomorphic coloured dart structures, always, because
φ(i,b) = (a−i, 1−b) commutes with `rneig` and `mirro`. Once the dedup identifies a word with its
σ-mirror instead, both members of a literal-reversal pair can survive, and the solver cannot tell them
apart. That is what the A6 collisions are.

⚑ **This lands on three palettes with tables on disk.** `girih` (42 of 412 σ-mixed, 112 collisions)
and `composite-decomp` (324 of 9159, 2714 collisions) were regenerated under the new rule at 19:35
today; `tetromino` (403 of 54,856, 24,005 collisions) regenerates only after the chiral fix above. A6
is the certificate that licenses the pruner's dedup, so those three alphabets are not shippable as
they stand, and the shelves built from them were built from the OLD tables. Nothing here rebuilds
them; the decision — rebuild the shelves on the corrected rule, or pin the old tables — is AL's.

The deep repair is unchanged and is the same one for σ-mixed orbits and for A6: the corner class at a
dart has to know its chirality. σ∘NEXT = PREV∘σ, so on σ-orbits of classes the face walk's two step
directions are well defined only as a pair, and `checkface` locks one direction at its first step.
Nothing short of a chirality bit per dart — through `checkface`, `simplify`, the pruner's WL and
`attach` — expresses it. **Every non-equilateral tile has a non-trivial σ**: it comes from the ANGLE
word, not from the edges (the 45-45-90 triangle's mirror swaps its two 45° corners whether or not the
palette names its edges), which is why freedraw over more than one edge length hits the same wall —
`tri45` with `"freedraw": true` comes out 116 σ-mixed of 369.

## Files

- `alphabets/palette_spec.py` — the shared normalisation: `edgeLens` → edge types, `freedraw` → the split
- `run-sts.sh` — palette in, catalogue out
- `check_marked_grid.py` — the referee with the lattice as a parameter (square, triangle, hex-on-dual)
- `count_marked_patch.py` — the dangling-edge filter for a grid with no lattice at all
- `alphabets/palettes/fd{sq2,tri,hex,ts}.json` — the four grids, in the generic form
