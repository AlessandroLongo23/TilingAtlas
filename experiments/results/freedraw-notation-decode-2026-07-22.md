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
