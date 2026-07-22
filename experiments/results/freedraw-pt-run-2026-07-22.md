# Freedraw (squares_edges) — running Marek's PT solver locally

**Date:** 2026-07-22 · **Machine:** Apple Silicon (arm64), macOS 25.5
**Binary:** `pt_squares_edges.exe` (Planar Tilings, MSVC x64 console; from `pt_squares_edges.zip`)
**SHA-256:** `4821338959ed346e9a4d39fd723e378cc070fededed57d2a81c04ffa2a3e1c69`

## How it runs here

No Docker, no VM, no wine installed, and every Homebrew wine cask is deprecated and fails the macOS
Gatekeeper check. The `wine-stable` cask install aborts because its `gstreamer-runtime` dependency is a
`.pkg` needing a sudo password. Worked around without sudo:

1. `brew install --cask wine-stable` (fails at the gstreamer step, but caches the wine tarball)
2. Extract `wine-stable-11.0_1-osx64.tar.xz` from `~/Library/Caches/Homebrew/downloads/` into the scratchpad
3. `xattr -d -r com.apple.quarantine "Wine Stable.app"`
4. Run `.../Contents/Resources/wine/bin/wine` (x86_64, via Rosetta 2). GStreamer is only needed for
   media playback, so a console app does not miss it.

The exe needs a folder named `solver_squares_edges/` to exist in the working directory beforehand; it
does not create one. Input is two prompts on stdin: minimum then maximum number of vertices.

Driver: `scratchpad/run_pt.sh <kmin> <kmax> <tag>`.

## Results

| k | solutions | solver time | wall (incl. wine start) | output size | files |
|---|-----------|-------------|--------------------------|-------------|-------|
| 1 | 13 | — | — | — | 7 |
| 2 | 153 | — | — | — | 18 |
| 3 | 1254 | — | — | — | 24 |
| 1–3 combined | **1420** | 0.173 s | 16 s (first run, prefix creation) | 920 KB | 49 |
| 4 | **7 848** | 1.131 s | 5 s | 6.8 MB | 33 |
| 5 | **43 792** | 8.070 s | 12 s | 52 MB | 38 |
| 6 | **279 905** | 69.907 s | 74 s | 370 MB | 45 |
| 7 | **1 481 438** | 515.496 s | 520 s | 2.3 GB | 54 |

Total for k ≤ 7: **1 814 403** solutions, ~2.7 GB of text. Growth is roughly 6.4× per k in count and
7–8× in time.

### A label discrepancy worth raising with Marek

He wrote "the search has finished with 1805135 solutions for k 4-7". Our runs give

- k=4 + k=5 + k=6 + k=7 = 7848 + 43 792 + 279 905 + 1 481 438 = **1 812 983** (≠ his figure)
- k=5 + k=6 + k=7 = 43 792 + 279 905 + 1 481 438 = **1 805 135** (= his figure exactly)

So his number is the k = 5–7 total, not k = 4–7. Given that k ≤ 3 matched him file-for-file and the
k=5–7 sum matches to the unit, the numbers agree and only the label is off by one. Worth confirming
before either of us quotes "1.8M for k=4–7" in writing.

## The other two builds

Marek sent `pt_triangles_edges.exe` and `pt_triangles_squares_edges.exe` the same evening. Both run
under the same wine setup; each needs its own pre-made output folder (`solver_triangles_edges/`,
`solver_triangles_squares_edges/`).

### Triangular grid (alphabet A2 digon + A3 triangle)

| k | achiral | chiral | total |
|---|---------|--------|-------|
| 1 | 16 | 3 | **19** |
| 2 | 229 | 128 | **357** |
| 3 | 2692 | 1991 | **4683** |

5059 total, 1.09 s.

### Triangles + squares (alphabet A2 + A3 + A4)

| k | achiral | chiral | total |
|---|---------|--------|-------|
| 1 | 47 | 9 | **56** |
| 2 | 954 | 340 | **1294** |
| 3 | 11 226 | 5625 | **16 851** |

18 201 total, 4.32 s, 167 files, 12 MB.

**External validation.** The digon-free solutions (no drawn edges at all) are just the underlying
tilings by triangles and squares. Counting them:

| k | digon-free solutions |
|---|----------------------|
| 1 | **4** |
| 2 | 7 |
| 3 | 17 |

k = 1 gives exactly the four 1-uniform tilings by triangles and squares — 3⁶, 4⁴, 3³.4², 3².4.3.4 —
which is the set Marek named when he described the design.

**Cross-checked against our own oracle, and it matches.** Added `alphabets/palettes/tri-square.json`
(the regular palette restricted to {3, 4}) and ran the Čtrnáct pipeline at k ≤ 3:

```
$ PALETTE=tri-square ./run-oracle.sh 3
[gen] palette=tri-square D=12 tiles=2 classes=2 configs=4
  k=1 : 4
  k=2 : 7
  k=3 : 17
```

| k | our oracle (tri-square palette) | Marek's combined solver, digon-free |
|---|--------------------------------|-------------------------------------|
| 1 | 4 | 4 |
| 2 | 7 | 7 |
| 3 | 17 | 17 |

Two independent engines, no shared code, same mirror-merge convention. The generator also reports
`configs=4`, i.e. exactly the four vertex configurations Marek named. This validates the ambient-tiling
half of his brand-new combined solver on its first outing. It does not check the decorated (digon-
bearing) solutions, which nothing external covers yet.

`make check-regular` still PASSes byte-identical after adding the palette.

**No fixed grid, as Marek said.** The 7 distinct underlying tilings at k = 2 and 17 at k = 3 confirm
that the ambient tiling varies per solution, so an edge bitmask has nothing to index into here. This
case needs vertex positions carried with each solution (ℤ[ζ₁₂], 4 integers per point).

## Agreement with the zip Marek sent

`solver_squares_edges.zip` contains k ≤ 3 only: 13 + 153 + 1254 = 1420.

- File names: identical set (49 files).
- Per-file solution counts: all match.
- Totals: match exactly.
- Byte-identical files: 12 of 49.

The other 37 files differ in the *order* of solutions and in which representative of a vertex figure
gets written. Example, same tiling written two ways:

```
ours:   (0 1)[2][3](4)[5]        Marek's: [0][1](2 3)[4](5)
```

This is the solver's own nondeterminism, not a disagreement with Marek. **Two runs of the same binary
on this machine disagree with each other in the same way**, with identical counts every time — the
binary uses `for_each_tiling_threaded`, so thread scheduling picks which representative is emitted.

## Independent cross-check (this is the one that means something)

Running Marek's binary reproduces his numbers by construction, so it verifies nothing about
correctness. The real check is `scratchpad/fd_enum.py`, written from the definition alone without
looking at his notation: periodic edge subsets of Z² with no vertex of degree exactly 1, classified up
to p4m, k = number of grid-point orbits.

| k | independent enumerator | Marek / PT |
|---|------------------------|------------|
| 1 | 13 | 13 |
| 2 | 153 | 153 |

Complete only to translation index 8, which covers k = 1 (needs ≤ 8) and, empirically, k = 2. k = 3
reaches index 24, where brute force over 2^(2n) dies; the enumerator finds 291 of the 1254 there, so it
is a lower bound and not a check at that level.
