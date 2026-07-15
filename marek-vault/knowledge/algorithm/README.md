---
type: index
tags: [algorithm]
---

# The engine

Marek's combinatorial dual-search for k-uniform tilings — what this thesis validates its own
enumerator against. It is combinatorial, not geometric: it searches *duals* of k-uniform tilings by
gluing vertex-figure half-edges, checks each vertex closes to a divisor of 360°, prunes isomorphic
duplicates, and only touches geometry at the very end. That's why it reaches k=16 in hours where a
per-node cyclotomic method stalls.

Read in this order:

1. [[dual-search]] — the solver: how candidate tilings are built by gluing corners.
2. [[canonical-form]] — the pruner: how duplicates are detected and removed.
3. [[pipeline]] — the three stages end to end, and how to run them.

Notation you'll need first: [[vertex-configuration]] and [[half-edges-and-corners]].

## Where the code lives

- Marek's own write-up:
  [../../../tools/ctrnact-oracle/reference/algorithm.txt](../../../tools/ctrnact-oracle/reference/algorithm.txt)
  and [../../../tools/ctrnact-oracle/reference/README-ctrnact.md](../../../tools/ctrnact-oracle/reference/README-ctrnact.md).
- His unmodified originals:
  [../../../tools/ctrnact-oracle/reference/](../../../tools/ctrnact-oracle/reference/)
  (`euclidean_solver_mega.py`, `euclidean_pruner.py`, `eu_solver.orig.cpp`, `count.txt`).
- The C++ path that actually runs:
  [../../../tools/ctrnact-oracle/](../../../tools/ctrnact-oracle/)
  (`eu_solver.cpp`, `eu_pruner.cpp`, `eu_develop.cpp`, `run-oracle.sh`).
- Pipeline overview: [../../../tools/ctrnact-oracle/README.md](../../../tools/ctrnact-oracle/README.md).
