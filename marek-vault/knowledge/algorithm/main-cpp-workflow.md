---
type: concept
tags: [algorithm, workflow]
status: from-chat
sources: ["archive/2026-07-14", "archive/2026-07-15", "marek-vault/main_euclidean.cpp"]
---

# The many-`main.cpp` workflow

How Marek actually drives STS. The search engine (Griffin's private C++, see [[people/contacts]]) was
built **without a way to read tile and vertex data from a file**, an oversight he admits. So instead
of one program with a config, he keeps a large collection of `main.cpp` variants, one per search, each
hardcoding its own tiles, vertices, and constraints. ![[archive/2026-07-14#^msg-1526698766730662038]]

Generalising this into a single program that reads tile/vertex data and parameters is a headline item
on the [[roadmap]] and a natural first contribution.

## Anatomy of a `main.cpp`

From `main_euclidean.cpp` (the main Euclidean {3,4,6,12} search), see [[main_euclidean.cpp]]:

- **Angle block** — `const int A3 = encode_corner(4, 3, 0)`, one per polygon, plus `PI_ANGLE = 0` for a
  straight angle. The middle argument is the polygon size; the first and third are unconfirmed (ask
  Marek, see [[open-questions]]). `encode_corner` also decides how the angle is *printed* in the
  solution files, using symbolic codes because the angles are mostly irrational.
  ![[archive/2026-07-14#^msg-1526699386636079114]]
- **`face_types`** — every polygon, as its angle sequence. Handles irregular polygons and polyforms too.
- **`apeirogon_types`** — apeirogons, kept separate because they use gentler pruning (immune to false
  closure). ![[archive/2026-07-14#^msg-1526700829816656033]]
- **`vertex_types`** — the vertex list. He does **not** write this by hand for hybrid systems; a script
  generates it from the mixing rules ([[hybrid-identities]]). ![[archive/2026-07-14#^msg-1526701694065442826]]
- **`include_permutations`**, **`num_initial_vertices`** — flags.
- **`find_and_write_tilings(...)`** — runs the search over a `min..max` vertex range with N threads.

## What a variant can pin down

Each file fixes not just the tile set but extra constraints:

| Variant | What it does |
|---|---|
| `main_euclidean.cpp` | The main Euclidean {3,4,6,12} search. |
| `main_1247_1_0612.cpp` | The full `1.0612` edge system (older `S/M/L` size codes, later the alphabetical `A/B/C…` multipliers). |
| `main_1247_1_0612_G3.cpp` | Same, but only **starts** from vertices containing the "big triangle": those vertices are moved to the front and `num_initial_vertices` limits starts to them, so tilings without the big triangle are never considered. ![[archive/2026-07-14#^msg-1526702733006999623]] |
| `main_1247_1_0612_G3_lim.cpp` | The big-triangle search reduced to essentials (small polygons + the big triangle only) for more speed. |
| `main_generic_{10,12,18,30}eu.cpp` | Star-like Euclidean sets: shapes with angles multiples of 36/30/20/12 degrees. He drew each shape in a turtle-graphics applet to check it doesn't self-intersect. ![[archive/2026-07-15#^msg-1526862217461497866]] |
| `main_generic_polyominoes.cpp` | Huge `face_types` (polyominoes up to size 11), tiny `vertex_types` (only 90/90/90/90, 90/90/180, 180/180, 90/270). ![[archive/2026-07-15#^msg-1526868244676477009]] |
| `main_BI1_3.cpp` | Another worked search variant. |
| (origami) | Custom search for a paper-folder: even-degree vertices, convex tiles only. See [[roadmap]]. |

## Runtime realities

- The `1.0612` 7-uniform run took **about 2 months** on a high-RAM machine; losing power mid-run would
  have wiped it. ![[archive/2026-07-14#^msg-1526701847736357005]]
- The polyomino search ran to vertex-k=7 for days and produced hundreds of thousands of results.
  ![[archive/2026-07-13#^msg-1526183317085618287]]
- There is **no interrupt/resume**, and memory management is Griffin's part that Marek doesn't
  understand. Both are needed features. ![[archive/2026-07-14#^msg-1526709557215367230]]

## Related

[[main_euclidean.cpp]] · [[dual-search]] · [[edge-length-solver]] · [[hybrid-identities]] · [[roadmap]]
