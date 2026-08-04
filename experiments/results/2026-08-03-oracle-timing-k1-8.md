> **SUPERSEDED — do not cite the k=5 row.** This first sweep hit the `make MAXNUM=<k>`
> silent no-op (GNU Make 3.81, 1s mtime granularity): the k=4 binary was reused, so k=5 reports
> 0 tilings instead of 332 and the marginal column goes negative. Kept as the evidence for that
> bug. The correct table is `2026-08-03-oracle-timing-k1-13.md`.


## Run started 2026-08-03 09:47:04 — palette=regular, k=1..8

Machine: Apple M5, 10 cores. Solver is single-threaded.
Each row is a FULL pipeline run at MAXNUM=K (build + solve + prune + develop),
which enumerates every k <= K. Marginal cost of level K = T(K) - T(K-1).

### k <= 1   (started 09:47:04)
  build      6.86s
  solve      0.22s   peak RSS 1.7 MB   raw 0.0 MB   11 raw blocks
  prune      0.22s   peak RSS 1.6 MB
  develop    0.06s   peak RSS 13.1 MB
  counts     1:10   [MATCHES A068599]
  TOTAL      7.35s   (engine solve+prune 0.44s)
  marginal   n/a (first level)

### k <= 2   (started 09:47:12)
  build      2.26s
  solve      0.42s   peak RSS 2.1 MB   raw 0.0 MB   35 raw blocks
  prune      0.02s   peak RSS 1.8 MB
  develop    0.16s   peak RSS 13.1 MB
  counts     1:10 2:20   [MATCHES A068599]
  TOTAL      2.86s   (engine solve+prune 0.43s)
  marginal   -4.50s vs k<=1

### k <= 3   (started 09:47:15)
  build      3.77s
  solve      0.29s   peak RSS 2.2 MB   raw 0.0 MB   124 raw blocks
  prune      0.05s   peak RSS 2.2 MB
  develop    0.19s   peak RSS 13.3 MB
  counts     1:10 2:20 3:61   [MATCHES A068599]
  TOTAL      4.30s   (engine solve+prune 0.34s)
  marginal   1.45s vs k<=2
  ETA        ~8.02s for k=4..8 (solve ratio 0.69x/level)

### k <= 4   (started 09:47:19)
  build      2.07s
  solve      0.31s   peak RSS 2.4 MB   raw 0.2 MB   427 raw blocks
  prune      0.01s   peak RSS 2.7 MB
  develop    0.17s   peak RSS 14.1 MB
  counts     1:10 2:20 3:61 4:151   [MATCHES A068599]
  TOTAL      2.56s   (engine solve+prune 0.32s)
  marginal   -1.74s vs k<=3
  ETA        ~12.22s for k=5..8 (solve ratio 1.07x/level)

### k <= 5   (started 09:47:21)
  build      0.02s
  solve      0.09s   peak RSS 2.3 MB   raw 0.2 MB   427 raw blocks
  prune      0.01s   peak RSS 2.7 MB
  develop    0.18s   peak RSS 13.7 MB
  counts     1:10 2:20 3:61 4:151 5:0   [MISMATCH vs A068599]
  TOTAL      0.30s   (engine solve+prune 0.10s)
  marginal   -2.26s vs k<=4
  ETA        ~0.12s for k=6..8 (solve ratio 0.28x/level)

### k <= 6   (started 09:47:22)
  build      1.18s
  solve      1.33s   peak RSS 3.0 MB   raw 1.9 MB   2775 raw blocks
  prune      0.08s   peak RSS 4.3 MB
  develop    0.97s   peak RSS 16.8 MB
  counts     1:10 2:20 3:61 4:151 5:332 6:673   [MATCHES A068599]
  TOTAL      3.56s   (engine solve+prune 1.41s)
  marginal   3.25s vs k<=5
  ETA        ~14m48.5s for k=7..8 (solve ratio 15.31x/level)

### k <= 7   (started 09:47:25)
  build      1.16s
  solve      3.29s   peak RSS 3.1 MB   raw 5.3 MB   6678 raw blocks
  prune      0.28s   peak RSS 7.7 MB
  develop    2.28s   peak RSS 21.3 MB
  counts     1:10 2:20 3:61 4:151 5:332 6:673 7:1472   [MATCHES A068599]
  TOTAL      7.01s   (engine solve+prune 3.57s)
  marginal   3.45s vs k<=6
  ETA        ~17.32s for k=8..8 (solve ratio 2.47x/level)

### k <= 8   (started 09:47:32)
  build      1.20s
  solve      7.46s   peak RSS 3.2 MB   raw 13.4 MB   14849 raw blocks
  prune      0.66s   peak RSS 15.4 MB
  develop    4.38s   peak RSS 30.9 MB
  counts     1:10 2:20 3:61 4:151 5:332 6:673 7:1472 8:2850   [MATCHES A068599]
  TOTAL      13.70s   (engine solve+prune 8.12s)
  marginal   6.70s vs k<=7

### Summary

| k<= | build | solve | prune | develop | TOTAL | marginal | solve x/lvl | raw disk | solve RSS | prune RSS | tilings at k |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 6.86s | 0.22s | 0.22s | 0.06s | 7.35s | 7.35s | — | 0.0 MB | 1.7 MB | 1.6 MB | 10 |
| 2 | 2.26s | 0.42s | 0.02s | 0.16s | 2.86s | -4.50s | 1.90x | 0.0 MB | 2.1 MB | 1.8 MB | 20 |
| 3 | 3.77s | 0.29s | 0.05s | 0.19s | 4.30s | 1.45s | 0.69x | 0.0 MB | 2.2 MB | 2.2 MB | 61 |
| 4 | 2.07s | 0.31s | 0.01s | 0.17s | 2.56s | -1.74s | 1.07x | 0.2 MB | 2.4 MB | 2.7 MB | 151 |
| 5 | 0.02s | 0.09s | 0.01s | 0.18s | 0.30s | -2.26s | 0.28x | 0.2 MB | 2.3 MB | 2.7 MB | 0 |
| 6 | 1.18s | 1.33s | 0.08s | 0.97s | 3.56s | 3.25s | 15.31x | 1.9 MB | 3.0 MB | 4.3 MB | 673 |
| 7 | 1.16s | 3.29s | 0.28s | 2.28s | 7.01s | 3.45s | 2.47x | 5.3 MB | 3.1 MB | 7.7 MB | 1472 |
| 8 | 1.20s | 7.46s | 0.66s | 4.38s | 13.70s | 6.70s | 2.27x | 13.4 MB | 3.2 MB | 15.4 MB | 2850 |

Finished 2026-08-03 09:47:46
