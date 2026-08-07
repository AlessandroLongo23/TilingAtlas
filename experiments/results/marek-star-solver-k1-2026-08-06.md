# Marek's `solver_star` k=1 vs our star24full k=1 (2026-08-06)

Source: `materials/solvers/stars/solver_star.zip` (265 KB, `pt_star.exe` + 28 certificate files).
His timing, reported in chat: **15 s for k=1**. Ours, rerun today: **10 s solve + <1 s prune** on one
core (`PALETTE=star24full ./run-oracle.sh 1`), plus a one-off 46 s build of the palette tables.

## Counts

|  | k=1 total | pure-convex | star-bearing |
|---|---|---|---|
| Marek `solver_star` | 29 | 11 | 18 |
| ours `star24full` | 44 | 11 | 33 |

The 44 reproduces the certified figure in `star24full-k2-2026-07-25.log`, so the rerun is a clean
regression as well as a comparison.

**His 29 is a strict subset of our 44 — nothing of his is missing from ours.** Compared as multisets
of vertex angle-multisets (his `S<n>` → n units of 15°, our `n*pA`/`n*dB`/regular → the same units),
the diff is 15 signatures in ours and **0 in his**.

## The 15 extras are exactly the tilings with a valence-2 vertex

| | valence 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|
| his 29 (every vertex figure) | 0 | 19 | 6 | 3 | 1 | 0 |
| our 44 (every vertex type) | 22 | 20 | 13 | 7 | 2 | 2 |

Those 22 valence-2 types sit in exactly 15 of our 44 tilings, and those 15 are exactly the 15 he does
not have. A valence-2 vertex is a star's dent meeting one convex corner — `6*d18 + 3` = 270° + 90°,
`8*d20 + 3`, `4*d14 + 12`, and so on. Every one of his 29 has `Number of vertices: 1` and no vertex
figure below valence 3.

⚑ **Two readings, and his k=2 settles it.** Either his solver COUNTS a dent vertex as its own orbit
(so our 15 reappear at his k=2/k=3), or it FORBIDS valence-2 vertices (so they never appear at any k).
If any 2-corner vertex figure shows up in his k=2 drop it is the first; if none does, the second.
Under Myers' convention — the one the Atlas uses — a valence-2 vertex is free and does not count
toward k, which is why our k=1 holds 33 star tilings against his 18.

## The families, and they are the whole of his star-bearing k=1

Grouping our 44 by species key (the tile tokens with the point angle erased) gives 30 keys, 4 of them
holding more than one α pin — the free-alpha families:

| family | pins | α |
|---|---|---|
| `(n*d, n*p, 3)F` on 6* | 7 | 1..7 |
| `(n*d, n*p, 4)F` on 4* | 5 | 1..5 |
| `(n*d, 3, n*p, 3)A` on 3* | 3 | 1..3 |
| `(n*d, n*p, 6)F` on 3* | 3 | 1..3 |

7 + 5 + 3 + 3 = **18 snapshots, and his 18 star-bearing solutions are precisely those**. His k=1 is
the 11 classical uniform tilings plus four one-parameter families sampled on the 15° grid, and nothing
else. So yes — the families are readable straight off his output: convert `S<n>` to units, group by
"same vertex shape, one unit slid from a point to a dent," and the four chains fall out. The 15 rigid
star tilings, the ones that are not family snapshots, are exactly the ones his convention costs extra k.

## Format differences

- **Hex in filenames, decimal in bodies.** `starsolver_01_S4S6Se_o_2.txt` holds `(S4, S6, S14)` —
  `Se` is 14, `S13` is 19. Reading the filenames as decimal silently mis-sorts the corpus.
- **His alphabet is angle-only; ours carries tile identity.** `S<n>` says "a corner of n × 15°" and
  nothing about which polygon it belongs to. The cost is visible in his own output: `S4S6Se` holds
  TWO solutions, and they are our `(6*d14, 6*p6, 3)F` and `(4*d14, 4*p4, 4)F` — the same angle
  multiset {4, 6, 14} built from a 6-pointed star + triangle and from a 4-pointed star + square. His
  format separates them only by the glue permutation, `(0)(1 2)` vs `(0 1)(2)`; ours names them apart
  at the filename level (`eupruned_01_3sK` vs `eupruned_01_4sE`).
- **His tile space is strictly larger in principle.** Angle-only corners with unit edges admit every
  equilateral polygon whose angles are multiples of 15° — including the 150-90-150-90-150-90 hexagon
  he raised in chat. Our `star24full` is regular {3,4,6,8,12,24} + the 42 isotoxal star species. At
  k=1 the difference does not bite (his output is a subset of ours), but at higher k his search can
  produce tilings our palette structurally cannot.
- Our blocks carry `Count type:` and a `TES file:` provenance line; his carry the face/glue lines
  (`1/0(S4) - 0/2(S14)`) directly.

## For when his k=2 lands

Ours, certified complete over the closed in-ring species set (`star24full-k2-2026-07-25.log`):
**k=2 = 74 blocks, 20 pure-convex + 54 star-bearing**, EU_NCBUDGET fixpoint at 6 vs 7, zero star24
blocks lost. Cost: 5,797 s wall on 10 workers, ~16 CPU-hours. If his k=2 charges dent vertices, expect
his number to sit below 74 and to contain our k=1 leftovers.
