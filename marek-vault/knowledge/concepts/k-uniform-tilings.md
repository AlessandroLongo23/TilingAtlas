---
type: concept
tags: [concept]
status: seeded
sources: ["tools/ctrnact-oracle/README.md", "OEIS A068599", "repo CLAUDE.md (settled decisions)"]
---

# k-uniform tilings

## Definition

A tiling by regular polygons is **k-uniform** if its vertices fall into exactly *k* orbits under the
tiling's symmetry group — k distinct "kinds" of vertex, each kind a transitivity class. k=1 is the
uniform (Archimedean + regular) tilings; higher k allows more vertex types in one periodic pattern.

Edge-to-edge is assumed (edges meet whole-edge to whole-edge).

## The counts (A068599)

The number of k-uniform tilings by regular polygons, from OEIS **A068599**, which the `regular`
palette reproduces:

| k | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|----|----|
| tilings | 11 | 20 | 61 | 151 | 332 | 673 | 1472 | 2850 | 5960 | 11866 | 24459 |

## Two settled facts (don't re-litigate — proofs in the repo)

- **Mirror pairs merge** — a tiling and its mirror image are counted once, which is what makes k=2 =
  20. See CLAUDE.md §12.8 and [[canonical-form]].
- **The octagon is a solved special case, not a gap.** With 12 directions (ℤ[ζ₁₂]) the one
  octagon-bearing tiling — `t1002`, the 4.8.8 — is absent by construction, so the engine gives k=1 =
  **10**, and you re-add `t1002` by hand. The argument that this is the *only* octagon tiling (any
  octagon forces 4.8.8 everywhere, propagating to the unique 4.8.8 tiling ⇒ 1-uniform, so zero
  octagon tilings at k ≥ 2) is in CLAUDE.md's octagon decision. So 12 directions are complete for all
  k ≥ 2, and complete for k=1 minus exactly `t1002`.

## Scope of the atlas

The thesis aims at a complete catalogue across **hyperbolic, Euclidean, and spherical** tilings.
Marek's algorithm.txt notes the same combinatorial method works "for a wide range of hyperbolic
tessellation systems," not just Euclidean — worth pressing him on for the hyperbolic side.

## From the chat

- His own counts run to **k=18 complete** (4,177,507 tilings; ~17.5 GB of solution files); the limit
  is disk space, not the algorithm. Full table in [[solution-file-format]].
- He also skips 4.8.8 ("cannot be used for anything apart from that one uniform tiling"), so his k=1
  is 10 too. ![[archive/2026-07-13#^msg-1526148830356181074]]
- **A068599's higher terms come from STS itself**, so they can't be used to cross-check STS.
  ![[archive/2026-07-14#^msg-1526689846838562877]]
- Galebach (k≤7 before Marek) had a similar algorithm but never got past 7; nobody knows why. See
  [[contacts]].
- k-uniform Euclidean tilings are "a special case of hybrids existing outside of hyperbolic space"
  ([[classification]]); and in hyperbolic space one configuration doesn't imply uniform
  ([[hyperbolic-tilings]]).
- He wants k refined to exclude degenerate (2-tile, dent) vertices, converging with Myers's
  convention. ![[archive/2026-07-14#^msg-1526666323818713211]]
