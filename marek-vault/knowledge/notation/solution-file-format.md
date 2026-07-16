---
type: concept
tags: [notation, io]
status: from-chat
sources: ["archive/2026-07-13", "marek-vault/euclideansolver_18_A3A4A6Ac_44.txt", "marek-vault/output_A.txt", "marek-vault/input_pg32_0_4947a.txt"]
---

# Solution and edge-database file formats

The raw, geometry-free outputs of the two searches. STS never computes coordinates until the search
ends, so these files are combinatorial; a converter adds geometry to make TES ([[tes-format]]).

## Solver output filename

Example: `euclideansolver_18_A3A4A6Ac_44.txt`. ![[archive/2026-07-13#^msg-1526147472865493123]]

- `euclideansolver` — the search.
- `18` — number of vertices (the vertex-k of this batch).
- `A3A4A6Ac` — the polygon list: triangle, square, hexagon, dodecagon (`Ac` = 12-gon; letter codes
  because a size needs a single char).
- `44` — number of edge types.
- A trailing `_o` (as in `euclideansolver_18_A3A4A6_o_49.txt`) marks a file of **chiral** tilings;
  chiral results get their own marker. ![[archive/2026-07-13#^msg-1526147883546575009]]

Each tiling the program finds is appended to the matching file. Solutions inside a file are separated
by a `---` block (the converter splits on `---\n\n`). The full tree of Euclidean tilings up to
18-uniform is about 17.5 GB. ![[archive/2026-07-13#^msg-1526148204750569482]]

## Enumeration counts (his numbers)

From the same session, the k-uniform Euclidean counts STS produces:

| k | tilings | k | tilings |
|---|---|---|---|
| 1 | 10 | 10 | 11866 |
| 2 | 20 | 11 | 24459 |
| 3 | 61 | 12 | 49794 |
| 4 | 151 | 13 | 103082 |
| 5 | 332 | 14 | 212631 |
| 6 | 673 | 15 | 445289 |
| 7 | 1472 | 16 | 933637 |
| 8 | 2850 | 17 | 1972148 |
| 9 | 5960 | 18 | 4177507 |

k=1 shows **10**, not 11, because he doesn't use the `(4,8,8)` vertex (it serves only that one uniform
tiling and was left out to speed the solver). ![[archive/2026-07-13#^msg-1526148830356181074]] This is
the same octagon caveat the repo hits, see [[k-uniform-tilings]]. **18 is the highest fully complete
search**; the limits are about conserving disk space, not the algorithm.
![[archive/2026-07-14#^msg-1526652621497045003]]

Caution: the higher A068599 values were themselves produced by STS, so they can't be used to
independently cross-check STS. ![[archive/2026-07-14#^msg-1526689846838562877]]

## Edge database (`output_A.txt`, the hybrid master file)

His main output file, cut down to normal hybrid identities (all polygons at the same edge). One entry:

```
0.36442876005704637410190335211335396650185610186995
A3, A4, A7, A14
(A3,A4^2,A7)
(A4,A7,A14)
```

- Line 1 — the **edge length**, to ~50 decimals (found numerically, see [[edge-length-solver]]).
- Line 2 — the set of polygons involved.
- Following lines — the vertex combinations of the identity.

A `Verified` line and mixing-rule lines (`(A5,A18)=(A6,A9)`) appear on entries he has confirmed; see
[[hybrid-identities]]. The whole edge master file is the one artifact he treats as the source of
truth: everything else can be regenerated from it. ![[archive/2026-07-15#^msg-1527062177083687063]]

## Hybrid-finder input/output (`input_pg32_0_4947a.txt`)

The Rust hybrid finder searches spaces of up to ~100 billion vertex combinations to find identities.
This file is an example run aimed at the massive `0.494717` family (only a slice of its full solution
set). Its results are merged into the edge master file by another script.
![[archive/2026-07-13#^msg-1526184631404073120]] ![[archive/2026-07-13#^msg-1526185462501212211]]

## Related

[[tes-format]] · [[edge-length-solver]] · [[hybrid-identities]] · [[main-cpp-workflow]] · [[glossary]]
