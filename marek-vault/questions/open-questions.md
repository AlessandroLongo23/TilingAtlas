---
type: questions
tags: [questions]
---

# Open questions for Marek

Things I don't understand yet. Move each one to the relevant knowledge note (with his answer + the
source message) once it's resolved, and strike it here.

## Notation

- Symmetric-vertex half-edge numbering: how the F/A/R/S symmetry collapses the corner labels — worked
  fully for `(3,6,3,6)` in algorithm.txt but I stopped at the first page. See [[half-edges-and-corners]].
- The full `famchar` code table for tiles with n ≥ 10 (12 → `c`; what about star/composite tiles?).
  See [[palette-json-schema]].

## The search

- The exact divisor-of-360° closure test, and where it fires during the walk. See [[dual-search]].
- Search order and backtracking — how the solver decides what to glue next.
- How global symmetry is exploited to cut the search.
- "Arbitrary tiles" mode vs. "k-uniform vertices" mode (algorithm.txt Note 1): what actually differs.

## The pruner

- What structure gets canonicalised, and how Weisfeiler-Leman + DFA minimisation combine into one
  canonical label. See [[canonical-form]].
- Where mirror-pair merging happens — in the pruner, or later?

## Scope

- How the same method extends to hyperbolic tessellations (he says it does). See [[k-uniform-tilings]].
- Spherical case — does the divisor-of-360° closure become a different angle condition?
