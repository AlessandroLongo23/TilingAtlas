---
type: index
tags: [algorithm]
---

# STS — the Synthetic Tiling Searcher

Marek's engine. He named it against "analytic" (top-down) methods: STS assembles tilings bottom-up
from local rules and lets the global symmetry emerge. It is combinatorial, geometry-agnostic (the
same search does Euclidean, hyperbolic, spherical), and touches geometry only at the very end. The
repo's C++ port is `ctrnact-oracle`; CLAUDE.md's "the engine" means this.

Read in this order:

1. [[dual-search]] — the search: partial solutions, half-edge pairing, the edge-selector heuristic.
2. [[edge-length-solver]] — the Newton iteration that turns a polygon combination into an edge length.
3. [[canonical-form]] — what dedup exists (Eryk's) and what canonization is still missing.
4. [[main-cpp-workflow]] — how Marek actually drives it: one `main.cpp` per search.
5. [[pipeline]] — the repo port's three stages and how to run them here.

Notation first: [[conway-symbol]], [[vertex-configuration]], [[half-edges-and-corners]].

## Where the code lives

- **Marek's current implementation** — Griffin's C++, private GitHub repo; the copy he sent is
  `planar_tilings-main.zip` at the vault root (local only). See [[contacts]] for the Griffin story.
- **His Rust hybrid finder** — separate program, searches vertex-combination spaces (up to ~10¹¹) for
  edge identities; only its input/output files are here so far.
- **His write-up:**
  [../../../tools/ctrnact-oracle/reference/algorithm.txt](../../../tools/ctrnact-oracle/reference/algorithm.txt)
  and [../../../tools/ctrnact-oracle/reference/README-ctrnact.md](../../../tools/ctrnact-oracle/reference/README-ctrnact.md).
- **His unmodified originals:**
  [../../../tools/ctrnact-oracle/reference/](../../../tools/ctrnact-oracle/reference/)
  (`euclidean_solver_mega.py`, `euclidean_pruner.py`, `eu_solver.orig.cpp`, `count.txt`).
- **The repo port that actually runs here:**
  [../../../tools/ctrnact-oracle/](../../../tools/ctrnact-oracle/)
  (`eu_solver.cpp`, `eu_pruner.cpp`, `eu_develop.cpp`, `run-oracle.sh`).
