# hybrid_2_9830 k=1..3: resource profile (2026-10-25)

| t (s) | tilings | RSS (GB) | output on disk (GB) | swap used |
|---|---|---|---|---|
| 5 | 81946 | 0.10 | 0.07 | 0.00M |
| 10 | 141224 | 0.16 | 0.12 | 0.00M |
| 15 | 219149 | 0.24 | 0.20 | 0.00M |
| 20 | 343487 | 0.38 | 0.31 | 0.00M |
| 25 | 441754 | 0.48 | 0.42 | 0.00M |
| 30 | 535281 | 0.57 | 0.47 | 0.00M |
| 35 | 602316 | 0.64 | 0.52 | 0.00M |
| 40 | 680603 | 0.72 | 0.59 | 0.00M |
| 45 | 763162 | 0.81 | 0.65 | 0.00M |
| 50 | 850280 | 0.90 | 0.74 | 0.00M |
| 55 | 953171 | 1.00 | 0.80 | 0.00M |
| 60 | 1033719 | 1.08 | 0.88 | 0.00M |
| 65 | 1110506 | 1.13 | 0.93 | 0.00M |
| 70 | 1193660 | 1.23 | 1.02 | 0.00M |
| 75 | 1306121 | 1.33 | 1.13 | 0.00M |
| 80 | 1411679 | 1.44 | 1.20 | 0.00M |
| 85 | 1511477 | 1.54 | 1.28 | 0.00M |
| 90 | 1620717 | 1.65 | 1.40 | 0.00M |
| 95 | 1726955 | 1.77 | 1.49 | 0.00M |
| 100 | 1828349 | 1.87 | 1.56 | 0.00M |
| 105 | 1902663 | 1.95 | 1.61 | 0.00M |
| 110 | 1964409 | 2.02 | 1.66 | 0.00M |
| 115 | 2035310 | 2.09 | 1.71 | 0.00M |
| 120 | 2104387 | 2.16 | 1.77 | 0.00M |

Above: the engine's own duplicate tracker, a std::set holding every canonical form (~1 KB per tiling at
k=3 here) for the whole run. RSS grows linearly with tilings found; 24 GB would fill at ~20M, and k=3 of
this board has tens of millions, so the Mac swaps. Output on disk grows at ~0.85 KB per tiling as well.

## After (tilesearch with 128-bit fingerprints, per-root trackers, one shared pool)

| board | old loop | new loop | output |
|---|---|---|---|
| squares_edges k<=5 | 4.2 s | 3.7 s | 120 files, identical fingerprints |
| hybrid_2_9830 k<=2 | 63.9 s | 67.1 s, peak RSS 64 MB | 71 files, identical fingerprints |

Stop/resume: hybrid_2_9830 k<=2 killed after 30 s (79/156 roots done), a half-done merge planted (junk
appended to an output file plus merge.pending), restarted without --resume (refused), then with --resume:
junk rolled back, 156/156 roots, census 1,094 / 2,672,268, output identical to the uninterrupted run.
Through the app: stop at 12 s, resume at 20 s, finished with the same census; no process left on quit.

A first per-root version ran one root at a time: 209 s (idle threads at the end of each of 156 roots),
and wrote nothing because the engine does not create its output folder. Both fixed before the numbers above.
