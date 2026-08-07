# Schwarz (2,3,4) — Marek's full corrected solve, k=1..8 (2026-08-06)

Source: `materials/solvers/edges/Schwarz/234.zip` (7.5 MB, 2026-08-06 08:37), 211 certificate files in
the SLOTTED alphabet, staged at `materials/corpora/schwarz_edges_234_slotted/`. The drop's own
`solution_list.txt`:

| k | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|----|------|------|-------|-------|
| solutions | 0 | 0 | 10 | 13 | 1568 | 2181 | 24603 | 62095 |

This REPLACES the short solver's k=5..8 and confirms the 2026-08-04 partial rerun at k=3 and k=4.

## Develop

`develop_schwarz.py materials/corpora/schwarz_edges_234_slotted --board 234`

```
edge lengths    : A10=0.615479709, B10=0.785398163, C10=0.955316618
certificates in : 90470
developed       : 90470
failed          : 0
multi-variant   : 3605
wall            : 365.8s (4.0 ms/certificate)
shared board    : V=26 E=72 F=48 (every pattern lands on it)

   k   tilings  tiles: min    max        shard
   3        10           1     48        7.1 KB
   4        13           4     36        8.7 KB
   5      1568           2     44        842 KB
   6      2181           2     44        1.1 MB
   7     24603           2     44         13 MB
   8     62095           2     44         32 MB
```

Full report: `schwarz-develop-234-full.txt`; progress stream: `schwarz-234-full-rerun.log`.

## Checks

**k=3 and k=4 reproduce the shipped shards byte-identically** (`cmp`), which is what says this is the
same corrected solver as the 2026-08-04 drop and not a third answer.

**Every previously shipped k=5..8 tiling survives — but only up to the board's symmetry.** Compared as
raw 72-bit `drawn` strings, 176 old records (20 / 32 / 38 / 86 at k = 5 / 6 / 7 / 8) are absent from
the new corpus, which looks like a loss and is not one: the board's orthogonal symmetry group has
order 48 (computed from the 26 vertices, then induced on the 72 edges), and under it every one of the
176 matches a new record. The legacy and slotted alphabets simply land the same tiling on the board in
different positions. Missing up to symmetry: 0 at every k.

**No symmetry duplicates in the new corpus.** All 90,470 records are distinct up to those 48
symmetries — 10 / 13 / 1568 / 2181 / 24603 / 62095 canonical forms for the same record counts, so the
counts are classes and not placements.

## Shipped

`public/schwarz-sph/s234-k{3..8}.json`, and k=9 / k=10 / k=11 (86 / 1,603 / 3,529) were DROPPED — they
were the F2-buggy solver's output, and beside a corrected k=8 of 62,095 a k=9 of 86 reads as a fact
about the board. The dropped shards are recoverable from git (`HEAD:public/schwarz-sph/s234-k9.json`
and siblings) if Marek's run reaches k=9.
