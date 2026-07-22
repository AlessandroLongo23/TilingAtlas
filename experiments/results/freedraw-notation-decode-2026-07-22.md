# Freedraw — decoding Marek's notation, and the enumerator that made it unnecessary

**Date:** 2026-07-22. Companion to `freedraw-pt-run-2026-07-22.md`, which covers running his solver.

## The problem

Marek's `pt_*_edges.exe` emits a combinatorial certificate, not coordinates. We can generate 1.8M
solutions locally and draw none of them above k = 2, because the viewer needs an edge bitmask. He
said he would not know how to dump one. Two routes: decode his notation, or enumerate the patterns
ourselves in coordinates. Both were pursued; the second won.

## What his format means

Established against a Rosetta stone: 166 patterns at k ≤ 2 whose geometry we already knew from an
independent enumerator, paired against his `.txt` for the same 166.

**The filename parameter is the structure-line item count.** 1420 of 1420 blocks. It is *not* the
tile-orbit line count (87 of 1420).

**The listed vertex figure is reduced by the rotational part of the site symmetry.** Every vertex of
the square grid has exactly four square corners, so the reduction factor is `4/(#A4 listed)` and the
true drawn-edge degree is `(#A2 listed) * 4 / (#A4 listed)`. Checked against the k = 1 A2-count
profile (1, 2, 5, 5), which decomposes exactly onto the true degree tally: one degree-0, one degree-4
cross and one degree-2 straight (both folded to a single listed digon), five degree-2 turns, five
degree-3 tees.

**The structure line is the edge-gluing table.** Walking a vertex counterclockwise, the tiling
alternates slot, corner, slot, corner. Slot *j* sits immediately before corner *j*, and its direction
is the running sum of the turns of corners `0..j-1`, with `turn(A4) = 90°`, `turn(A2) = 0°`,
`turn(A3) = 60°`. A slot is a digon side — that is, its grid edge is drawn — exactly when corner *j*
or corner *j−1* is `A2`. Each structure item collects the slot-orbits that belong to one tiling-edge
orbit; `[...]` and `(...)` distinguish whether the two ends are identified by a reflection or a
rotation, and primes name the vertex orbit.

Worked example, `fd-1-008` (our id), his `(A2,A4,A2,A4,A2,A4,A4)Ae` with structure `(0 1)[2](6)`:
slots 0–6 come out N, N, W, W, S, S, E, matching its true drawn set exactly; the three items cover
{0,5} ∪ {1,4}, {2,3}, {6}, i.e. all seven slots with nothing left over.

## Cross-side agreement

Bucketing both sides by `(k, degree profile, edge-orbit count)`:

| | patterns | buckets |
|---|---|---|
| independent enumerator | 166 | 57 |
| Marek's blocks (k ≤ 2) | 166 | 57 |

Every bucket agrees on its count. Computing his structure line from our geometry refines this to 130
classes over 166 patterns (99 singletons, 28 pairs, one triple, two quadruples).

One subtlety cost a round: the two sides of a digon must be told apart by which hand of the directed
edge they lie on, not by the neighbouring cell. On a small period lattice both neighbours can be the
same coset, which silently merges them and throws the edge-orbit count off.

## The enumerator that made decoding unnecessary

`scratchpad/fd_enum2.py`. Brute force over `2^(D*n)` per sublattice dies around index 8. The
replacement uses the fact that for a primitive pattern `Stab(P)/L` embeds in the point group, so a
pattern with more vertices per period than orbits must be fixed by some non-identity element.
Enumerate patterns invariant under each single element instead: the free bits collapse from `D*n` to
that element's edge-orbit count, roughly `D*n/r` for an element of order *r*. Patterns with a trivial
point group have `n <= k` and are brute-forced at those tiny indices.

Completeness comes from sweeping every element and skipping only those whose orbit count exceeds a
budget: the maximal-order element of any stabiliser is always cheap, because `n <= m*k` bounds the
index by the point-group order.

| grid | k | our count | Marek | time | budget skips |
|---|---|---|---|---|---|
| square | 1 | **13** | 13 | 2.7 s | 0 |
| square | 2 | **153** | 153 | 118 s | 1647 |
| square | 3 | **1254** | 1254 | ~50 min | 9180 |
| triangle | 1 | **19** | 19 | 79 s | 1185 |

Skipped elements are redundant by the completeness argument, and the counts come out exact at every
level, which is the empirical confirmation of it.

The square k ≤ 3 run is the one that matters: 1420 patterns reproduced independently, **with
geometry**, matching Marek's solver exactly at each k. The triangle k = 1 result is the first
independent check of his brand-new triangle build, which nobody had validated.

It emits `{id, k, a, b, d, h, v, orbit}` directly, which is the viewer's input format. No notation
parsing sits anywhere in the pipeline — the decode above stands as documentation of his format and as
the fallback if we ever need k ≥ 4 without re-deriving it ourselves.

## The decoder: what is built, and what is not

`tools/ctrnact-oracle/develop_freedraw.py`, a sibling of `develop.py` / `develop_hyperbolic.py` /
`develop_spherical.py` and occupying the same pipeline slot.

**Built and validated — the vertex model.** Figure expansion by the `FACES/(faces listed)` factor,
slot directions from the running turn, and drawn-status per slot from the adjacent digons. It builds
a model for **1420 of 1420** square certificates, and its signature distribution `(k, sorted degree
profile)` matches the independently known geometry exactly, 27 classes on both sides. The same code
with no changes builds **5059 of 5059** triangle certificates. That is the alphabet-is-data property
carrying through: a new grid is a new entry in the `GRIDS` table, not new logic.

**Not built — the layout.** A decoder must walk the gluing to place vertices. I tried to skip that by
reconstructing from local constraints instead, since the vertex model already fixes each orbit's
drawn-direction set up to the point group. That does not work, and the experiment is worth recording
as a negative result:

| k=1 certificate signature | raw layouts | matching known patterns |
|---|---|---|
| degree 4 | 56 | 1 |
| degree 2 (five distinct certificates) | 1704 each | **the same 9 each** |
| degree 3 (five distinct certificates) | 4432 each | **the same 7 each** |
| degree 0 | 56 | 1 |

All 13 patterns are reached, but certificates sharing a signature are indistinguishable to the
constraint solver. **The vertex figures alone do not determine the tiling.** The structure line is
carrying real information, and a decoder has to read it.

Two further reasons the shortcut is a dead end: filtering the candidates by the certificate's
computable fingerprint would narrow but not always to one (the fingerprint gives 130 classes over 166
patterns, so pairs and triples remain), and the layout search is itself exponential in the period
index, so it inherits exactly the scaling problem the decoder was meant to escape.

**What remains** is resolving the slot-pairing conventions: which slot of the far vertex an edge
arrives at, how `*` composes on each end, and how the reduced numbering extends to the full cycle.
The semantics are understood; the index conventions are not yet pinned. With 1420 known-good patterns
available as an oracle this is now a bounded search over a handful of binary choices rather than
open-ended reverse engineering, but it is not done.

## The decoder, completed (same evening)

The conventions were never unknowns. PT's structure line is the same Conway half-edge notation our
own pipeline emits — compare a pruned block's gluing line `(0 1')[0' 0''][2'][3'][4']`
(`run-star-k1b5/pruned/eupruned_01.txt`) with PT's `(0 1)[2](6)`: same brackets, same primes, same
stars. Same author, shared ancestry; our oracle IS a port of Čtrnáct's earlier code. So every
convention was ported from validated code instead of guessed:

- `pruner.py makeglue()`: `[a b]` glues `a ↔ *b`, `()` is orientation-preserving, and every gluing
  propagates through the mirror (`glue[mirro[a]] = mirro[b]`) — which is why a reduced structure
  line covers every half-edge, and why the star-side choice in `[]` is provably irrelevant.
- `pruner.py`'s hardcoded per-symbol tables (`labellistin`/`rneiglistin`/`mirrolistin`) revealed the
  quotient model: chiral sites (F/C tags) carry a full starred copy of the vertex, mirrored sites
  (A/D tags) star-label the mirror partner in place. `develop_freedraw.py` generates these tables
  from (figure, tag); the only per-figure freedom is the mirror axis, and wrong axes self-destruct
  (missing labels, conflicting glue, develop clash), so consistency picks the right one — no
  letter-map learning was needed at all.
- `develop.py`: the star-walk BFS keyed on (half-edge, direction), crossing edges at d+180°, with
  translation periods read off from key revisits. `angunits(n) = 180 − 360/n` extends to the digon
  (n=2 → 0°) without modification.

**Results.**

| run | developed | validation | time |
|---|---|---|---|
| square k ≤ 3 (1420 certs) | 1420/1420 | **bijection** with the 1420 independently enumerated bitmasks, up to p4m | 1.4 s |
| triangle k ≤ 3 (5059 certs) | 5059/5059 | k=1 slice a **bijection** with the 19 independently enumerated patterns; counts 19/357/4683 match PT; all forms distinct | 4.7 s |
| square k = 4 (7848 certs) | 7848/7848 | all distinct; count matches PT | 8.5 s |

~1 ms per solution against the enumerator's 189 ms, and O(certificate) instead of O(search). The
decoder is the only route that scales to k=7 and the only route that exists at all for the combined
triangles+squares grid (no fixed lattice to enumerate over — there the same develop BFS runs
unchanged and the emitter switches from bitmask to explicit coordinates).

New data produced tonight: `scratchpad/tri_solutions.json` (5059 triangle patterns, first time
drawable) and `scratchpad/sq_k4_dev.json` (7848 square k=4 patterns).

## Shipped to /freedraw (same night)

Both catalogues are live on the page, behind a square/triangle grid toggle:

- `public/freedraw/solutions-k4.json` — square k=4, ids `fd-4-0001..7848`. A separate file, NOT
  merged into `solutions.json`, because /library adapts that file wholesale via referenceAtlas and
  growing it 6.5x is a decision for later, not a side effect.
- `public/freedraw/tri-solutions.json` — the 5059 triangle patterns, `grid: "triangle"` per record,
  ids `fdt-k-NNNN`.

Viewer extensions: the whole pipeline is basis-mapped (lattice -> world at 60° for triangles), so
pan/zoom/lattice-overlay generalise unchanged. Face analysis flood-fills the two triangles per
lattice cell and encodes each cell by its TRIPLED CENTROID (up at (3x+1, 3y+1), down at
(3x+2, 3y+2)) — that turns mixed up/down cell sets into plain Z² points on which D6 acts linearly,
so the pose/shape congruence ladder runs on both grids with only the symmetry table swapped.
Thumbnails are paginated (240/page) — 9268 live canvases in one grid was never going to fly.

Page counts verified by Playwright: square 9268 (7848 at k=4); triangle 5059 = 19 + 357 + 4683,
filters partitioning 3357 finite / 1551 strip / 151 unbounded, and 20 polyiamonds with holes.
21 unit tests pass (incl. new triangle cases); `pnpm build` clean.

## Surfaced to /play and /library (same night, second pass)

All 14,327 patterns now flow through `loadReferenceAtlas` (the three catalogue files merge at load),
so both user-facing surfaces see them:

- **/play picker**: the Freedraw class gains a grid sub-level — class → "Square grid 9268" /
  "Triangle grid 5059" → k rows. Depth-2 tree rows are new in catalogue-list-panel; every other
  class keeps its two-level shape and its node ids, so nothing else moved.
- **/library**: a "Grid" filter section (All / Squares / Triangles) sits before "Tile kind" on the
  freedraw shelf, with a `fdgrid` URL param, reset-on-class-change, and active-filter counting.
  Family labels say polyiamond on the triangle grid.
- **Certification honesty**: square k ≤ 3 and triangle k = 1 stay "reproduced" (independently
  enumerated AND matched to the solver); square k = 4 and triangle k ≥ 2 are decode-only, so they
  carry "candidate" until something independent reaches them.

Verified live: `?class=freedraw&fdgrid=triangle` → 5059; play picker rows Square grid 9268 /
Triangle grid 5059 / "k = 1 grid points 19"; `?tiling=fdt-2-0004` renders the triangle pattern on
the play canvas with fills. Build clean.

## The combined triangles + squares grid (same night, third pass)

The case with no fixed lattice — the one that made the decoder mandatory rather than convenient.
Marek's `pt_triangles_squares_edges.exe` (alphabet A2 + A3 + A4) had already been run for k ≤ 3:
56 / 1294 / 16851 = 18,201 certificates.

**Developer** (`develop_freedraw.py --grid ts`): the same table builder and glue port — the alphabet
extension is literally one `units` entry, since the rotation order was always computed from the
angle sum rather than a face count. What is new: develop runs in exact ℤ[ζ₁₂] (ring helpers ported
from develop.py), the period lattice comes from `lattice_basis` + Gauss reduction, and the emitter
walks the quotient's combinatorial face map (`next(K) = (lneig[glue[h]], d + 180° − step)`),
classifies tile components by the same lift-holonomy flood (now over quotient faces instead of
lattice cells), and writes an explicit patch: vertices, edges and polygon rings per period, each
endpoint a (vertex index, T1/T2 offset) pair.

**Validation** — nothing independent can enumerate this class, so the checks are structural plus one
external anchor:
- 18,201/18,201 develop; 0 failures; 0 ambiguous mirror-axis variants.
- Every solution passes glue completeness, star closure, face-walk closure (every face returns to
  its start with zero lattice offset and the right corner count), and the torus Euler identity
  V − E + F + digons = 0.
- **The digon-free slice is exactly 4 / 7 / 17** — the known uniform and 2-/3-uniform
  square-triangle tilings, reproduced with correct geometry (the k=1 four: 3⁶, 4⁴, 3³.4², 3².4.3.4).
- 20 s for the full run.

**Shipping**: `public/freedraw/ts-solutions-k{1,2,3}.json` (0.03 / 1.1 / 19.8 MB — the k=3 file is
the one to think about before committing). Records are self-contained FreedrawPatterns with 1×1
dummy lattice fields and the real geometry under `patch`, so every existing consumer type-checks.

**Viewer**: a `drawPatchPattern` branch instancing the explicit patch over an arbitrary T1/T2 basis
(fills by tile component, scaffold = all underlying edges — exactly Marek's "the viewer couldn't
just project the grid in their mind" request — drawn strokes, dashed period overlay, orbit dots
with hover). Face analysis synthesizes from the baked classification; shape/pose fills fall back to
component colours. Surfaced on all three pages: /freedraw ("triangles + squares" grid chip),
/library (Grid facet "Tri + square" → 18,201), /play (picker row "Triangle + square grid 18201";
`?tiling=fdts-1-00017` renders the snub-square pinwheel polyform full-screen). All combined-grid
entries carry certification "candidate" — the digon-free anchor is strong evidence, not an
independent enumeration.

Freedraw across all grids now totals **32,528 patterns** in the atlas.

## Shipped

`public/freedraw/solutions.json` now holds all 1420 patterns for k ≤ 3 (175 KB). Ids kept their
previous scheme (`fd-1-001` … `fd-2-153`) so nothing already referencing them broke; k = 3 widens to
four digits (`fd-3-0001` … `fd-3-1254`). Spot-checked that `fd-1-001`, `-002`, `-003`, `-005` and
`-013` still denote the same patterns as before.

Filter counts on the live page partition exactly: 454 all-finite + 846 with a strip + 120 with an
unbounded tile = 1420.

**Holes appear at k = 3 for the first time**: nine patterns, none at k ≤ 2. `fd-3-0886` is a 3×3
period whose tiles are an 8-cell annulus with one hole plus a single cell — the exact figure written
by hand as a unit-test fixture before any of this data existed. That is Marek's "polyominoes with
holes would be easily accessible here", now enumerated and drawn.
