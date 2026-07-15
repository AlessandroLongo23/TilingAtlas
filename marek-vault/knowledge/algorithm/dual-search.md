---
type: concept
tags: [algorithm, concept]
status: seeded
sources: ["tools/ctrnact-oracle/reference/algorithm.txt (Marek)", "tools/ctrnact-oracle/README.md"]
---

# Dual-search (the solver)

My current understanding, seeded from Marek's
[../../../tools/ctrnact-oracle/reference/algorithm.txt](../../../tools/ctrnact-oracle/reference/algorithm.txt)
and the pipeline README. The details of the search order and pruning during the walk are exactly what
I want to nail down from the chat — flag gaps below.

## The idea

Build the *dual* of a k-uniform tiling rather than the tiling itself. Each of the k vertex orbits is a
vertex figure with labelled half-edges and corners ([[half-edges-and-corners]]). The search grows a
candidate by **gluing a corner of one vertex to a compatible corner of another**, half-edge against
half-edge, extending the partial tiling outward.

## The closure test

At each vertex the angles must sum so the vertex closes — the engine checks each vertex "closes to a
divisor of 360°." This is the local validity gate that prunes dead branches. *(Confirm the precise
statement of the divisor-of-360° test and where it fires in the walk — from chat.)*

## Why duals, why combinatorial

Working on the dual with corner-strings keeps the whole search combinatorial: no per-node exact
arithmetic. Geometry is deferred entirely to [[pipeline|develop]]. That deferral is the reason it
scales to k=16.

## Output

Raw solutions with duplicates, handed to the pruner. The originals are
`reference/euclidean_solver_mega.py` (Python) and `eu_solver.cpp` (the C++ port; `MAXNUM`
parametrised, was hardcoded to 14 — the "čtrnáct").

## Open gaps to fill from the chat

- Exact search order / backtracking strategy.
- How global symmetry (the F/A/R/S vertex symbols) is used to cut the search.
- The precise divisor-of-360° closure condition.
- What "arbitrary tiles" mode changes vs. the k-uniform-vertex mode (algorithm.txt Note 1).

## From the chat

- 
