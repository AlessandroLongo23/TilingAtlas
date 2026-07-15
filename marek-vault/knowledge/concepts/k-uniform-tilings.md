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

- 
