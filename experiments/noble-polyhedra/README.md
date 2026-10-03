# Noble polyhedra: sources and data audit (2026-10-02)

Research for a noble-polyhedra section. Nothing here is shipped; this is the source list and the
measurements taken on the data before any of it goes on a shelf.

## Sources

| What | Where |
|---|---|
| Video | Numberphile, "Big News in Polyhedra", https://www.youtube.com/watch?v=95335U-cUh8 (captions in `numberphile-transcript.txt`; the classification is announced at 17:28) |
| Paper | Connor Hill, "The complete set of noble polyhedra", arXiv:2607.28711, submitted 2026-07-30, https://arxiv.org/abs/2607.28711 |
| Code and models | https://github.com/Plasmath/noble-tools-revised, GPL-3.0, commit a801da75 (2026-06-19). `library/` holds 148 `.off` models plus `coordinates.txt` and `summary.txt` (exact orbit coordinates and minimal polynomials) per orbit type |
| Names and discoverers | Polytope Wiki, https://polytope.miraheze.org/wiki/List_of_noble_polyhedra (does not use Hill's symbols; a name-to-symbol map has to be built by congruence) |
| The 2020 wave | Ulrich Mikloweit, "Exploring Noble Polyhedra With the Program Stella4D", Bridges 2020, https://archive.bridgesmathart.org/2020/bridges2020-257.pdf |
| The 2008 find | Robert Webb, noble faceting of the snub cube, https://www.software3d.com/NobleSnub.php |
| Definitions | Grünbaum, "Polyhedra with hollow faces" (1993) and "Are your polyhedra the same as my polyhedra?" (2003) |
| Originals | Hess 1875, 1876, 1877; Brückner, *Vielecke und Vielflache* (1900) and the 1905 to 1907 papers |
| Background | https://en.wikipedia.org/wiki/Noble_polyhedron ; https://www.societyforscience.org/regeneron-sts/2026-student-finalists/connor-hill/ |

## What the classification says

Noble means vertex-transitive and face-transitive. Hill's Theorem 1.2: discounting stephanoids and
disphenoids there are exactly 146 up to similarity, under Definition 2.3 (finite, faithful realization,
planar faces, no two faces sharing an edge are coplanar).

* 146 = 9 regular (5 Platonic, 4 Kepler-Poinsot, already in the atlas) + 137 others.
* By orbit type: T 1, O 1, C 1, tO 1, tC 1, rC 1, I 4, ID 6, D 7, tI 17, tD 6, rD 19, sC 7, gC 3, sD 33, gD 38.
* Prismatic symmetry gives only the two infinite families. Disphenoids are a continuum (one per
  triangle shape); stephanoids are a discrete infinite family of prism and antiprism facetings.
* Four more "fissary" figures (tI-F, rD-F, D-F1, D-F2) are the duals of gD-19.1, gD-28.1, D-4, D-5.
  They have coinciding vertices and are NOT among the 146. The repo ships models for tI-F and rD-F only.

## Audit of the models: `verify.py`

`python3 verify.py <clone of noble-tools-revised> <main.tex from the arXiv source>`

Checked on all 148 `.off` files: no coincident vertices, every vertex on one sphere, every edge in
exactly two faces, every face planar, no two edge-adjacent faces coplanar, one face size and one vertex
degree per model. All 148 pass. Totals: 9,950 vertices, 10,150 faces, 688 KB of text.

Face sizes: 91 of the 148 are {5,5}, 28 are {6,6}; the rest are {3,q}, {4,q}, {8,4}, {9,3}, {12,3}.

Not checked: vertex- and face-transitivity themselves, and exactness. The `.off` coordinates are 16-digit
floats; exact values come from `coordinates.txt` plus the minimal polynomials.

## Four rows of the paper's Appendix A disagree with its own models

The models are self-consistent (Euler counts and the dual column both agree with them), so these are
typos in the table, v1 of the preprint:

| Symbol | Table says | Model says |
|---|---|---|
| D-2 | {9,3} | {3,9} (V 20, E 90, F 60; its dual rD-5.1 is the {9,3}) |
| D-7 | {5,3} | {3,9} (V 20, E 90, F 60; its dual tI-5.7 is {9,3}) |
| rD-5.2 | E 180, F 60 | E 120, F 30 (dual of ID-5: V 30, E 120, F 60) |
| tI-5.6 | {5,5}, E 150 | {6,6}, E 180 (matches its dual rD-5.7) |

## Where this went (2026-10-02)

Shipped as the Noble heading under Spherical. No file of Hill's is in this repo: each solid is regenerated
from a point group, a seed solved from his minimal polynomials, and one face
(`lib/render/nobleSolids.ts`, built by `scripts/build-noble-shelf.ts` from a clone of his repository).
The build also confirms the symmetry column of Appendix A for all 146, so the four rows above are the
only disagreements found. Still owed: D-F1 and D-F2, and names by congruence against the Polytope Wiki.
See `docs/DEVELOPMENT_NOTES.md`, 2026-10-02.
