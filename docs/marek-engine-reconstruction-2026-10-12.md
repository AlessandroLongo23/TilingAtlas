# Marek's solver engine, reconstructed from the binaries (2026-10-12)

What `pt_*.exe` does, read out of the executables with REA and Ghidra. Setup and commands are in
`docs/DEVELOPMENT_NOTES.md`, 2026-10-12 (second). Decompiled output lives under the gitignored
`materials/re/` and is not committed: it is Marek's code.

**How far to trust this.** Three kinds of statement appear below, and they are marked.

- **Checked**: tested against something outside the decompiler (a run of the binary, a closure equation,
  13,911 real certificates, a byte comparison between binaries).
- **Read twice**: two agents reading the pseudocode independently, with different questions, reported
  the same thing.
- **Read once**: one reading of the pseudocode, not tested.

## One engine, many boards (checked)

`hybrid_2_9830`, `squares_edges` and `triangles_2_colors` each have exactly 1,003 functions and the same
assert inventory (90 functions over nine source files). After masking addresses, the edge solver and the colouring solver are
identical in 51,004 of 52,650 decompiled lines (97%); what differs is `main` and a dozen functions whose
only change is a shifted data address. The hybrid is 71% identical to either by the same measure, an
older or newer build of the same source.

So a solver is `main` plus the engine, and `main` is a board:

```
find_and_write_tilings(name, kmin, kmax, vertex_types, faces, extra, flag, n_root_types, threads)
```

- A **face** and a **vertex type** are both cyclic words of 32-bit corner labels `(u16 number, u16 letter)`.
  The letter indexes `SMLABCDEFG` (4 prints as A, 5 as B). The number is a label, not a size: the size of
  a face is the length of its word.
- **Edge patterns are digons.** `squares_edges` has faces `A2` (two corners) and `A4`; a marked edge is a
  digon between two squares, and the five vertex types are the five ways digons sit round a 4.4.4.4 vertex.
- **Colourings are letters.** `triangles_2_colors` has faces `A3` and `B3` and the seven vertex types
  A3⁶ … B3⁶.
- **`flag`** (read twice): when set, each vertex type is a multiset and the engine expands it to every
  distinct cyclic arrangement up to rotation and reflection. Set for the hybrids and the colouring solver,
  clear for `squares_edges`, whose types are written in their cyclic order. The k=1 output of
  `hybrid_2_9830` does contain several arrangements of 3⁵.4.30⁴ (checked).
- **`threads`** is the last argument: 2 for the hybrids, 3 for the two July solvers, 4 for `ai3`.

`tools/ctrnact-oracle/marek_board.py <exe>...` prints the board of a solver without running it. The table
of every binary on disk is at the end of this file.

## The search (read twice unless marked)

**State.** A flat array of 0x20-byte half-edge records, one block per vertex orbit:

| offset | field |
|---|---|
| +0x00 | previous half-edge round the vertex |
| +0x04 | next half-edge round the vertex |
| +0x08 | opposite half-edge, -1 while free |
| +0x0c | mirror-image half-edge |
| +0x10 | first half-edge of this vertex's block |
| +0x14 | vertex index |
| +0x18 | corner label between this half-edge and the next |

It is the orientation double cover of the quotient by the full symmetry group. A vertex off every mirror
is n half-edges plus n mirror copies; a vertex on a mirror is n half-edges with the mirror link pointing
inside the block. Gluing a pair glues the mirror pair with it. A half-edge glued to itself is a 2-fold
centre on an edge midpoint. Mirror images are therefore one object, which is the chirality-merge the
atlas already assumes.

**Vertex templates.** Each vertex word is reduced to its primitive period P with repetition r. For every
divisor d of r the engine registers the quotient vertex P^d with rotation order r/d: once off any mirror,
once on a mirror if P is mirror-symmetric, and a second mirror variant when d is even (the other
conjugacy class of axes). That is one template per stabiliser subgroup.

**One node** (`FUN_14001648c`, threaded twin `FUN_140016574`):

1. Pick the free half-edge whose adjacent face already has the longest glued run; ties go to the lowest
   index. No free half-edge means the state is closed.
2. Try gluing it to every free half-edge in index order, itself included.
3. If fewer than kmax vertices are placed, also try appending a vertex of each template from the root's
   index upward and gluing to each of its representative half-edges.

**A glue is rejected by three tests and nothing else** (`FUN_140019c50`, `tiling_extender.h:133`):

1. `halfedges_compatible` (`tiling.h:101`): both half-edges lie on a mirror axis or neither does.
2. The two corner-label pairs the glue creates must be adjacent in some face word.
3. The face through the new edge must still match a face word: an open run by containment at some
   rotation in either direction, a closed face by length dividing the word length.

There is no geometry, no angle sum and no Euler test in the search. Plain recursion with glue and unglue
in place; no node cap, depth cap or time limit. kmax is the only bound.

**Closure.** A closed state with at least kmin vertices goes to `FUN_14000e450` (`tiling_properties.h:85`),
Moore partition refinement over (label, opposite, prev, next, mirror). If refinement leaves two half-edges
in one class, the state covers a smaller quotient and is dropped. Otherwise the refined numbering is a
canonical labelling and the relabelled structure is the key: a complete invariant, compared in full, in
one mutex-guarded `std::set` shared by all threads for the whole run. Counts are post-dedup. This is why
two runs agree on the count and not on order or representative.

**Threads.** One task per root template, each a full copy of the state. A running task hands its current
subtree to the pool whenever its node counter is a multiple of 10 and fewer than 64 tasks are queued.

### How this compares with our port

`tools/ctrnact-oracle/eu_solver.cpp` already has the same shape: `mirro` links, a most-constrained-face
choice (`mincycle`), Moore refinement at closure, the same certificate brackets. A first comparison,
by reading our file's own comments against the reconstruction, found no step ours lacks. Two differences
stand out:

- **Work distribution.** Marek splits dynamically inside the search; ours shards statically by root
  (`EU_SHARD_N`, `EU_SHARD_D2`). His needs no tuning and balances skewed subtrees. Not measured.
- **Pruning.** Ours adds at least the pair-reachability filter described at the top of `eu_solver.cpp`,
  which his generic engine does not have. His three tests are label-only, which is what lets one binary
  serve digons, colours and hybrids.

### Completeness knobs (read twice)

- **`n_root_types` below the number of vertex types loses tilings.** Roots come only from the leading
  types and later vertices must have a template index at or above the root's. Of the 48 boards read,
  45 pass the full count. The three Schwarz boards pass 7 of 74, 159 and 190, and that is exact: the
  first seven types are the ones at the triangle's S2 corner, and every tiling by a triangle with an S2
  corner has such a vertex. It is symmetry breaking, and it stays exact only while the board's faces all
  carry the root corner.
- **kmin above 1 relies on the refinement drop being exact**: a dropped state is assumed to reappear as a
  smaller quotient at lower k. Neither agent proved that; our port makes the same assumption and
  reproduces A068599 to k=16 with it.
- **Dead code that would be lossy if revived** (read once): an older `tiling_search::start` path keeps
  only the low 16 bits of each label in its canonical form, so two tilings differing only in letter
  would collide. It has no caller in these builds.

## The certificate (checked on 13,911 records)

A reconstruction of the writer regenerates the gluing line and every face line byte for byte on all 1,094
k=1 records of `hybrid_2_9830` and on 12,817 k=2 records. The checker is
`materials/re/certificate_verify.py`.

```
record   := "Number of vertices: " INT NL  vline NL  tline NL  glue NL  faceline{1+}  "---" NL NL
vline    := vname (", " vname)*                  one per vertex, in vertex order
tline    := vname ["x" INT] (", " ...)*          distinct types with multiplicity
vname    := "(" corner (", " corner)* ")" sym
sym      := "F" | "C" INT | "A" AX | "D" INT AX  AX = chr('a' + offset)
glue     := group{1+}                            one group per edge orbit
group    := "(" a [" " b] ")" | "[" a [" " b] "]"
faceline := step (" - " step)*
step     := lab "/" lab "(" corner ")"
lab      := ["*"] INT ("" | "'" | "''" | "'''" | "@" INT)
```

- `(a b)`: a glued to b, and `*a` to `*b`. `[a b]`: a glued to `*b`. `(a)`: a glued to itself. `[a]`: a
  glued to `*a`.
- `sym` is the vertex stabiliser: F trivial, Cn rotation, A one mirror, D2n dihedral. The printed word is
  one sector, repeated n times.
- A face line with s steps for a p-corner face means a p/s-fold centre in that face. Faces are listed up
  to reflection; the gluing line and the vertex names already determine everything.
- File name: `<name>solver_<kk>_<labels>[_o]_<E>.txt`, kk the vertex count, labels the corner labels used
  with numbers in hex, E the number of edge orbits, `_o` when the symmetry group has no
  orientation-reversing element.

**Three traps.**

1. **The reflection letter is only right modulo 2.** The writer looks the vertex up with a comparator
   that tests the parity of the reflection offset and takes the first match: 136 vertices in the k=2
   sample print the wrong letter. `develop_freedraw.py` already refuses to trust it (it develops every
   valid axis and keeps the one that closes), so nothing shipped is affected.
2. **The number in a label is not the polygon size.** See `hybrid_2_9830` below.
3. **`_o` files contain `[..]` groups** from k=2 on, because which copy of a later vertex is unstarred is
   arbitrary.

**Silent failures in the output path (the first one checked by running it).**

- With the `solver_<name>/` folder missing the run prints its "Created" lines and "Finished with N
  solutions", exits 0 and writes nothing. The open is never checked.
- The final count is the engine's counter, not records on disk.
- A killed run loses whatever is buffered and can leave a partial last record.
- Files are truncated only when a solution with that exact key appears, so files from an earlier run
  survive beside the new ones.

The HTML/SVG writer and the whole embedding (hyperboloid model, Klein projection, Newton solvers for the
edge length) are dead code in these builds: no vtable and no caller reaches them. The text certificate
carries no geometry.

## `hybrid_2_9830`: a 24-gon labelled 30 (checked)

The third face has 24 corners, each labelled 30. Closure of 3⁵.4.x⁴ at the edge length 2.98302 that
3⁶.4⁶ fixes is exact for a regular 24-gon (360.0000°) and fails for a 30-gon (360.67°). Its face lines
take 1, 2, 3, 4, 6 or 8 steps, and 8 does not divide 30. The label never enters a computation in this
binary. It is the only face in the 48 boards read whose number differs from its corner count, which makes
a slip the likelier reading. Either way a decoder must take sizes from the board, never from the label.

## Not determined

- Why the label is 30.
- The exact rule for which half-edges of a new mirror-symmetric vertex are tried as gluing targets
  (`FUN_140028e40`). Both readings took it to be one fundamental domain of the stabiliser; neither
  checked every branch.
- What `extra`, the empty third list, is for beyond being folded into the face set.
- Labels `Pi` (letter 0) and `oo` (number 0), which the printer knows and no board read here uses.
- Whether "No reflections" in the dead HTML writer mislabels tilings whose mirrors pass only through
  vertices and face centres.

## Every board on disk

Read by `marek_board.py` from 48 of the 53 distinct binaries under `materials/` (59 files, many byte-identical copies).
Vertex types are counted as written in `main`; with multiset on, each expands to all its cyclic arrangements.

| solver | kind | faces | vertex types | multiset | roots | threads |
|---|---|---|---|---|---|---|
| `3_7_3_colors` | colouring | A3, B3, C3 | 36 types, 7 to 7 corners | yes | all | 3 |
| `7_3_3_colors` | colouring | A7, B7, C7 | 10 types, 3 to 3 corners | yes | all | 3 |
| `ai2_3` | tiling | A3, B3 | A3^3, A3.B3 | yes | all | 4 |
| `cube_3_colors` | colouring | A4, B4, C4 | 10 types, 3 to 3 corners | yes | all | 3 |
| `dodecahedron_3_colors` | colouring | A5, B5, C5 | 10 types, 3 to 3 corners | yes | all | 3 |
| `icosahedron_3_colors` | colouring | A3, B3, C3 | 21 types, 5 to 5 corners | yes | all | 3 |
| `octahedron_3_colors` | colouring | A3, B3, C3 | 15 types, 4 to 4 corners | yes | all | 3 |
| `squares_2_colors` | colouring | A4, B4 | 6 types, 4 to 4 corners | no | all | 3 |
| `tetrahedron_3_colors` | colouring | A3, B3, C3 | 10 types, 3 to 3 corners | yes | all | 3 |
| `triangles+squares_2_colors` | colouring | A3, B3, A4, B4 | 24 types, 4 to 6 corners | yes | all | 3 |
| `triangles_2_colors` | colouring | A3, B3 | 7 types, 6 to 6 corners | yes | all | 3 |
| `edges_667` | edge pattern | A2, A6, A7 | A6^2.A7, A2.A6.A2.A6.A7, A2.A6^2.A2.A7, A2.A6.A2.A6.A2.A7 | no | all | 3 |
| `heptagons_edges_7_3` | edge pattern | A2, A7 | A7^3, A2.A7.A2.A7^2, A2.A7.A2.A7.A2.A7 | no | all | 3 |
| `heptagons_edges_7_4` | edge pattern | A2, A7 | 5 types, 4 to 8 corners | no | all | 3 |
| `hexagons_edges_6_4` | edge pattern | A2, A6 | 5 types, 4 to 8 corners | no | all | 3 |
| `hexagons_edges_6_5` | edge pattern | A2, A6 | 7 types, 5 to 10 corners | no | all | 3 |
| `octagons_edges_8_3` | edge pattern | A2, A8 | A8^3, A2.A8.A2.A8^2, A2.A8.A2.A8.A2.A8 | no | all | 3 |
| `octagons_edges_8_4` | edge pattern | A2, A8 | 5 types, 4 to 8 corners | no | all | 3 |
| `pentagons_edges_5_4` | edge pattern | A2, A5 | 5 types, 4 to 8 corners | no | all | 3 |
| `pentagons_edges_5_5` | edge pattern | A2, A5 | 7 types, 5 to 10 corners | no | all | 3 |
| `schwarz_edges_234` | edge pattern | A2, B2, C2, D2, E2, F2, S2.S3.S4 | 74 types, 8 to 16 corners | no | first 7 | 3 |
| `schwarz_edges_235` | edge pattern | A2, B2, C2, D2, E2, F2, S2.S3.S5 | 159 types, 8 to 20 corners | no | first 7 | 3 |
| `schwarz_edges_245` | edge pattern | A2, B2, C2, D2, E2, F2, S2.S4.S5 | 190 types, 8 to 20 corners | no | first 7 | 3 |
| `squares_edges` | edge pattern | A2, A4 | 5 types, 4 to 8 corners | no | all | 3 |
| `squares_edges_4_5` | edge pattern | A2, A4 | 7 types, 5 to 10 corners | no | all | 3 |
| `squares_edges_4_6` | edge pattern | A2, A4 | 12 types, 6 to 12 corners | no | all | 3 |
| `triangles_edges` | edge pattern | A2, A3 | 12 types, 6 to 12 corners | no | all | 3 |
| `triangles_edges_3_5` | edge pattern | A2, A3 | 7 types, 5 to 10 corners | no | all | 3 |
| `triangles_edges_3_7` | edge pattern | A2, A3 | 17 types, 7 to 14 corners | no | all | 3 |
| `triangles_edges_3_8` | edge pattern | A2, A3 | 29 types, 8 to 16 corners | no | all | 3 |
| `triangles_squares_edges` | edge pattern | A2, A3, A4 | 51 types, 4 to 12 corners | no | all | 3 |
| `ai2_10` | tiling | A3, A10 | 6 types, 5 to 10 corners | yes | all | 4 |
| `ai2_11` | tiling | A3, A11 | 6 types, 6 to 11 corners | yes | all | 4 |
| `ai2_12` | tiling | A3, A12 | 7 types, 6 to 12 corners | yes | all | 4 |
| `ai2_13` | tiling | A3, A13 | 7 types, 7 to 13 corners | yes | all | 4 |
| `ai2_14` | tiling | A3, A14 | 8 types, 7 to 14 corners | yes | all | 4 |
| `ai2_15` | tiling | A3, A15 | 8 types, 8 to 15 corners | yes | all | 4 |
| `ai2_4` | tiling | A3, A4 | A3^4, A3^2.A4, A4^2 | yes | all | 4 |
| `ai2_5` | tiling | A3, A5 | A3^4, A3^3.A5, A3.A5^2 | yes | all | 4 |
| `ai2_6` | tiling | A3, A6 | A3^5, A3^4.A6, A3^2.A6^2, A6^3 | yes | all | 4 |
| `ai2_7` | tiling | A3, A7 | A3^7, A3^5.A7, A3^3.A7^2, A3.A7^3 | yes | all | 4 |
| `ai2_8` | tiling | A3, A8 | 5 types, 4 to 8 corners | yes | all | 4 |
| `ai2_9` | tiling | A3, A9 | 5 types, 5 to 9 corners | yes | all | 4 |
| `ai3_1` | tiling | A3, A5 | A3^10, A3^5.A5^3, A5^6 | yes | all | 4 |
| `ai3_2` | tiling | A3, A6, A10 | A3^10.A6^10, A3^6.A6^9.A10^3, A3^2.A6^8.A10^6 | yes | all | 4 |
| `ai3_3` | tiling | A3, A9, A15 | A3^15.A9^15, A3^11.A9^14.A15^3, A3^7.A9^13.A15^6, A3^3.A9^12.A15^9 | yes | all | 4 |
| `hybrid_2_9830` | tiling | A3, A4, A30 (24 corners) | A3^5.A4.A30^4, A3^6.A4^6 | yes | all | 2 |
| `hybrid_3_3086` | tiling | A4, A5, A6, A12 | 6 types, 10 to 10 corners | yes | all | 2 |

Not read. The three large Schwarz builds have a `main` of several thousand lines that Ghidra's decompiler
does not finish; going by their names they are the 2,3,6 and 2,3,7 analogues of the three above. `abcdtest` is the one
parametric solver. The 2023 build is older and its `main` stores constants in a way the reader does not
replay; its faces are visibly S3, S4, S5, S10.

- `_as-received/corrections/pt_schwarz_edges_236.exe`: Ghidra did not return main within 500 s
- `_as-received/corrections/pt_schwarz_edges_237.exe`: Ghidra did not return main within 500 s
- `solvers/euclidean/edges/schwarz_236.exe`: Ghidra did not return main within 500 s
- `solvers/hyperbolic/tilings/abcdtest.exe`: no fixed board: face sizes a, b, c, d are read from stdin before kmin and kmax
- `solvers/hyperbolic/tilings/hybrid_1_0612.2023.exe`: main shape not parsed (KeyError)
