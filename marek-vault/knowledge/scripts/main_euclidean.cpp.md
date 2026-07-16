---
type: script
tags: [scripts, cpp, solver]
status: annotated
source_file: "marek-vault/main_euclidean.cpp (also attachments/1526180736510591076_main_euclidean.cpp)"
source_message: "archive/2026-07-13 ^msg-1526180736795672629"
---

# main_euclidean.cpp

**What it is:** the driver for his main Euclidean k-uniform search, the one that produced the 1..18
counts in [[solution-file-format]]. One of the many `main.cpp` variants ([[main-cpp-workflow]]); this
is the vanilla {3,4,6,12} one ("Generic 10" per its comment). He challenged me to compile it and race
it against my implementation to 16 vertices. ![[archive/2026-07-13#^msg-1526180880509571092]]

**Pipeline stage:** search ([[dual-search]]); prints raw solution files, no geometry.

## Structure (70 lines)

- Prompts for min/max vertex count on stdin (answering nonsense gets "I'm not sure what to make of
  that"). `n_threads = 4`.
- Angle constants: `PI_ANGLE = 0` and `A3/A4/A6/A12 = encode_corner(4, n, 0)` for n = 3,4,6,12.
  `encode_corner` also controls how angles print in solution files (symbolic codes; the angles are
  mostly irrational). The meaning of the first and third arguments is still unconfirmed, see
  [[open-questions]].
- `face_types`: the four polygons, each written as its full corner sequence (`{A3,A3,A3}`,
  `{A4,A4,A4,A4}`, …, twelve `A12`s).
- `apeirogon_types`: empty here (Euclidean; no apeirogons).
- `vertex_types`: **10 combinations**, `{A3,A12,A12}` through `{A3,A3,A3,A3,A3,A3}`. These are
  multisets; `include_permutations = true` expands the cyclic orderings. `(4,8,8)` is deliberately
  absent (it can only make the one uniform tiling), which is why k=1 counts 10, see
  [[solution-file-format]].
- `num_initial_vertices = vertex_types.size()` — every vertex may start a search; the G3-style
  variants shrink this to force a tile into every result.
- `find_and_write_tilings("euclidean", min, max, vertex_types, face_types, apeirogon_types,
  include_permutations, num_initial_vertices, n_threads)` does everything; geometry name is a string,
  so the same driver shape serves hyperbolic searches.

The heavy lifting (`tiling.h`, `solutions_processor.h`) is Griffin's implementation inside
`planar_tilings-main.zip` (vault root, local).

## Related

[[main-cpp-workflow]] · [[dual-search]] · [[solution-file-format]] · [[Tes_Maker_euclidean_enum.py]]
