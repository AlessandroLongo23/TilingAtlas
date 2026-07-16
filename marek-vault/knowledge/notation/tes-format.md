---
type: concept
tags: [notation, hyperrogue, rendering]
status: from-chat
sources: ["archive/2026-07-14", "archive/2026-07-15", "marek-vault/46def.tes", "marek-vault/solutions/"]
---

# The TES file format (HyperRogue)

A `.tes` file is a render-ready tiling description that HyperRogue loads. It is the last stage of his
pipeline: the abstract solver output has no geometry, so a converter script adds the exact edge
lengths and angles and emits TES (see [[solution-file-format]] and [[Tes_Maker_euclidean_enum.py]]).
This is the format the Tiling Atlas renderer must eventually read, so it is worth knowing well.

He walked through it line by line on 2026-07-15 using a file from `solutions.zip`.
![[archive/2026-07-15#^msg-1526928981482279012]]

## Anatomy of a file

```
## A1 hybrid, A3+A5 (3 vertices, 6 edges)      ← comment, identifies the tiling
h2.                                            ← geometry: h2 = hyperbolic, e2 = Euclidean
distunit(arcmedge(3,5:^3))                     ← compute + set the default edge length
let(a3 = regangle(1,3))                         ← name the angles
let(a5 = regangle(1,5))
unittile(a3,*3)                                 ← define tiles (equilateral)
unittile(a5,a5,a5,a5,a5)
unittile(a5,a5,a5,a5,a5,|3)
unittile(a3,a3,a3,|2)
conway("(0 1')(0' 1'')(2' 0'')(3')(4' 0''')(4'' 1''')")   ← the gluing
```

## The functions

- `h2.` / `e2.` — geometry (hyperbolic / Euclidean). A leading `##` line is a human comment.
- `distunit(x)` — set the default edge length to `x`. Downstream `1` means "this edge."
- `arcmedge(3,5:^3)` — compute the edge length at which the given polygon group closes, using the same
  Newton numerical method as the solver (see [[edge-length-solver]]). Here it's the edge where a
  triangle plus three pentagons close: `a3 + 3·a5 = 2π`. ![[archive/2026-07-15#^msg-1526929633260343377]]
- `regangle(edge, sides)` — interior angle of a regular polygon. `regangle(1,3)` = triangle at the
  default edge; `regangle(1,inf)` = apeirogon. ![[archive/2026-07-15#^msg-1526931533011751086]]
- `unittile(...)` — define an **equilateral** tile by its sequence of angles (simpler than `tile`).
- `tile(...)` — the full form, alternating edge lengths and angles (used when edges differ).
- `slider(name, start, min, max)` — a live parameter for morphs; move it and the tiling re-renders in
  real time. His `46def.tes` runs `slider(alpha, pi/3, 0, 2*pi/3)`. See [[hyperbolic-tilings]] (morphs).
- `conway("...")` — the [[conway-symbol]] as the final line, tying the tiles together.

## Symmetry markers inside `unittile`

These are the same symmetry data the Conway symbol carries, and they decide which edges appear in the
final symbol:

- `*n` — repeat the whole angle sequence `n` times: an `n`-fold **rotational** axis. `unittile(a3,*3)`
  is a triangle with a 3-fold axis. `*inf` marks an apeirogon (repeat infinitely).
- `|n` — **axial** symmetry: edge `0` mirrors edge `n`. `unittile(a5,a5,a5,a5,a5,|3)` mirrors edges
  0↔3, so 1↔2 and edge 4 is self-mirrored; the mirror passes through the 1–2 vertex and the middle of
  edge 4. ![[archive/2026-07-15#^msg-1526930645295562932]]

Because a symmetric tile only contributes one edge of each mirrored pair to the symbol, a mirror tile
lists fewer primed edges. Marek's walkthrough of exactly which edges survive:
![[archive/2026-07-15#^msg-1526931062054326492]]

## Edge-index notation in the symbol

Within a `conway(...)` string, `'` marks tile 1, `''` tile 2, `'''` tile 3; beyond that `@n` gives the
edge index, so `0@4` is edge 0 of tile 4. ![[archive/2026-07-15#^msg-1526931293684760738]]

## Caveats for a converter

- Not all solution files are laid out identically, and most geometry (exact edge lengths, angles) is
  **absent from the raw solutions**; the TES converter is what adds it. So a Tiling-Atlas importer
  either reproduces the converter's math or ingests TES directly.
  ![[archive/2026-07-15#^msg-1526924911770210386]]
- The hardest files are hand-made: a base tiling cut into pieces, each chunk becoming a new tile, with
  several rounds of hyperbolic trigonometry before it can render (e.g. `a1solver_03_S3S5_6_1_penta2.tes`,
  the pentagram version). ![[archive/2026-07-15#^msg-1526932619323772950]]

## Related

[[conway-symbol]] · [[edge-length-solver]] · [[solution-file-format]] · [[hyperbolic-tilings]] · [[glossary]]
