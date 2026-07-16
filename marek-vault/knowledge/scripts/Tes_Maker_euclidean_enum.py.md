---
type: script
tags: [scripts, python, converter]
status: annotated
source_file: "marek-vault/Tes_Maker_euclidean_enum.py (also attachments/1526148204750569482_Tes_Maker_euclidean_enum.py)"
source_message: "archive/2026-07-13 ^msg-1526148205325324338"
---

# Tes_Maker_euclidean_enum.py

**What it is:** one of his `Tes_Maker` Python converters. The family's job is turning each raw solver
solution into an individual TES file HyperRogue can load ([[tes-format]]), which requires the
vertex-based → tile-based conversion (HyperRogue only works with cells). This `_enum` variant is the
**statistics** pass: it walks every `*solver*` file in the directory, counts solutions, and writes
`statistics.txt` with the "N-uniform: X tilings" table (the numbers in [[solution-file-format]]).
![[archive/2026-07-13#^msg-1526148378805927946]]

**Pipeline stage:** post-search conversion/reporting, downstream of the raw solution files.

## How it reads a solution file

- Splits the file on `---\n\n` (one chunk per solution) and drops the trailing empty chunk.
- Parses the vertex count out of the filename (the number between the first two underscores, so
  `euclideansolver_18_...` → 18) and accumulates counts per k into `whole[]`.

## The conversion machinery (used by its non-enum siblings)

- `shorthand = {'A3':'2', 'A4':'3', 'A6':'4', 'A12':'5'}` and `angle = {'A3':4, 'A4':3, 'A6':2,
  'A12':1}` with `angleunit(pi/6)` in the emitted header: Euclidean angles as multiples of 30°
  (A3 = 4·(π/6) interior... note the maps are per-palette parameters, "change to fit solutions").
- `mirror` / `flippa` / `converse`: transform edge pairs under mirroring, respecting a self-mirrored
  list `sm`; `*` prefixes mark mirror half-edges exactly as in [[conway-symbol]].
- `edgeconv(edge, tile)`: renders an edge reference as `2'`, `2''`, `2'''` for tiles ≤ 3 and `2@n`
  beyond, the same prime/`@` notation as the TES `conway(...)` string ([[tes-format]]).
- `selfmirrored(vl)` / `maxsymmetry(vl)` / `mirrorfind(vl)`: parse the solution's vertex list; the
  symmetry suffix letters (`A`, `D` = mirror-bearing, `C` = cyclic with `Cn` order, `D2n` dihedral)
  drive which edges are self-mirrored and the maximal rotation order. This is the F/A/R/S symmetry
  data flowing through the converter, see [[vertex-configuration]].
- `code.txt` + `amendcode()`: an interactive lookup that asks *me* (the operator) to name a code for
  each new tile string, then stores all its cyclic rotations. So the tile-naming is semi-manual and
  persistent across runs.

Sibling variants of this script sort millions of solutions into directories by tile combination and
symmetry. ![[archive/2026-07-14#^msg-1526707959097331733]] Windows heritage: it writes
`pathname+"\statistics.txt"`, so paths need adapting on macOS/Linux.

## Related

[[tes-format]] · [[solution-file-format]] · [[conway-symbol]] · [[main-cpp-workflow]]
