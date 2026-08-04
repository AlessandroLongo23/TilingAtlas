
## Run started 2026-08-03 09:49:34 — palette=regular, k=1..13

Machine: Apple M5, 10 cores. Solver is single-threaded.
Each row is a FULL pipeline run at MAXNUM=K (build + solve + prune + develop),
which enumerates every k <= K. Marginal cost of level K = T(K) - T(K-1).

### k <= 1   (started 09:49:34)
  build      3.06s
  solve      0.11s   peak RSS 1.7 MB   raw 0.0 MB   11 raw blocks
  prune      0.09s   peak RSS 1.6 MB
  develop    0.04s   peak RSS 13.0 MB
  counts     1:10   [MATCHES A068599]
  TOTAL      3.30s   (engine solve+prune 0.21s)
  marginal   n/a (first level)

### k <= 2   (started 09:49:37)
  build      2.47s
  solve      0.13s   peak RSS 2.0 MB   raw 0.0 MB   35 raw blocks
  prune      0.09s   peak RSS 1.8 MB
  develop    0.05s   peak RSS 13.1 MB
  counts     1:10 2:20   [MATCHES A068599]
  TOTAL      2.74s   (engine solve+prune 0.22s)
  marginal   -0.56s vs k<=1

### k <= 3   (started 09:49:40)
  build      2.47s
  solve      0.15s   peak RSS 2.2 MB   raw 0.0 MB   124 raw blocks
  prune      0.09s   peak RSS 2.1 MB
  develop    0.07s   peak RSS 13.3 MB
  counts     1:10 2:20 3:61   [MATCHES A068599]
  TOTAL      2.78s   (engine solve+prune 0.24s)
  marginal   0.03s vs k<=2

### k <= 4   (started 09:49:43)
  build      2.40s
  solve      0.17s   peak RSS 2.3 MB   raw 0.2 MB   427 raw blocks
  prune      0.11s   peak RSS 2.6 MB
  develop    0.12s   peak RSS 13.7 MB
  counts     1:10 2:20 3:61 4:151   [MATCHES A068599]
  TOTAL      2.81s   (engine solve+prune 0.29s)
  marginal   0.03s vs k<=3

### k <= 5   (started 09:49:46)
  build      2.81s
  solve      0.49s   peak RSS 2.6 MB   raw 0.7 MB   1162 raw blocks
  prune      0.13s   peak RSS 3.2 MB
  develop    0.27s   peak RSS 14.6 MB
  counts     1:10 2:20 3:61 4:151 5:332   [MATCHES A068599]
  TOTAL      3.71s   (engine solve+prune 0.62s)
  marginal   0.90s vs k<=4

### k <= 6   (started 09:49:49)
  build      2.52s
  solve      0.84s   peak RSS 2.9 MB   raw 1.9 MB   2775 raw blocks
  prune      0.24s   peak RSS 4.1 MB
  develop    0.64s   peak RSS 16.7 MB
  counts     1:10 2:20 3:61 4:151 5:332 6:673   [MATCHES A068599]
  TOTAL      4.23s   (engine solve+prune 1.07s)
  marginal   0.52s vs k<=5

### k <= 7   (started 09:49:54)
  build      2.39s
  solve      2.12s   peak RSS 3.2 MB   raw 5.3 MB   6678 raw blocks
  prune      0.30s   peak RSS 6.8 MB
  develop    1.48s   peak RSS 21.2 MB
  counts     1:10 2:20 3:61 4:151 5:332 6:673 7:1472   [MATCHES A068599]
  TOTAL      6.29s   (engine solve+prune 2.42s)
  marginal   2.06s vs k<=6

### k <= 8   (started 09:50:00)
  build      2.46s
  solve      5.38s   peak RSS 3.5 MB   raw 13.4 MB   14849 raw blocks
  prune      0.63s   peak RSS 14.3 MB
  develop    3.47s   peak RSS 30.9 MB
  counts     1:10 2:20 3:61 4:151 5:332 6:673 7:1472 8:2850   [MATCHES A068599]
  TOTAL      11.94s   (engine solve+prune 6.01s)
  marginal   5.65s vs k<=7
  ETA        ~25m39.4s for k=9..13 (solve ratio 2.54x/level, fitted k=7..8)

### k <= 9   (started 09:50:12)
  build      2.86s
  solve      13.41s   peak RSS 4.2 MB   raw 33.7 MB   32963 raw blocks
  prune      1.52s   peak RSS 31.2 MB
  develop    7.49s   peak RSS 50.1 MB
  counts     1:10 2:20 3:61 4:151 5:332 6:673 7:1472 8:2850 9:5960   [MATCHES A068599]
  TOTAL      25.28s   (engine solve+prune 14.93s)
  marginal   13.34s vs k<=8
  ETA        ~22m38.3s for k=10..13 (solve ratio 2.52x/level, fitted k=7..9)

### k <= 10   (started 09:50:37)
  build      2.62s
  solve      41.47s   peak RSS 5.1 MB   raw 80.2 MB   70919 raw blocks
  prune      5.31s   peak RSS 65.2 MB
  develop    26.44s   peak RSS 95.6 MB
  counts     1:10 2:20 3:61 4:151 5:332 6:673 7:1472 8:2850 9:5960 10:11866   [MATCHES A068599]
  TOTAL      1m15.8s   (engine solve+prune 46.78s)
  marginal   50.56s vs k<=9
  ETA        ~33m27.6s for k=11..13 (solve ratio 2.70x/level, fitted k=7..10)

### k <= 11   (started 09:51:54)
  build      5.01s
  solve      1m31.9s   peak RSS 6.8 MB   raw 190.9 MB   152801 raw blocks
  prune      10.82s   peak RSS 166.4 MB
  develop    38.19s   peak RSS 200.6 MB
  counts     1:10 2:20 3:61 4:151 5:332 6:673 7:1472 8:2850 9:5960 10:11866 11:24459   [MATCHES A068599]
  TOTAL      2m25.9s   (engine solve+prune 1m42.7s)
  marginal   1m10.1s vs k<=10
  ETA        ~19m51.2s for k=12..13 (solve ratio 2.57x/level, fitted k=7..11)

### k <= 12   (started 09:54:20)
  build      2.69s
  solve      3m04.4s   peak RSS 9.3 MB   raw 445.3 MB   325173 raw blocks
  prune      29.39s   peak RSS 392.3 MB
  develop    1m26.5s   peak RSS 420.6 MB
  counts     1:10 2:20 3:61 4:151 5:332 6:673 7:1472 8:2850 9:5960 10:11866 11:24459 12:49794   [MATCHES A068599]
  TOTAL      5m03.0s   (engine solve+prune 3m33.8s)
  marginal   2m37.1s vs k<=11
  ETA        ~11m02.0s for k=13..13 (solve ratio 2.44x/level, fitted k=7..12)

### k <= 13   (started 09:59:25)
  build      2.55s
  solve      7m36.6s   peak RSS 12.0 MB   raw 1034.7 MB   693487 raw blocks
  prune      1m26.4s   peak RSS 846.4 MB
  develop    3m22.2s   peak RSS 924.8 MB
  counts     1:10 2:20 3:61 4:151 5:332 6:673 7:1472 8:2850 9:5960 10:11866 11:24459 12:49794 13:103082   [MATCHES A068599]
  TOTAL      12m27.7s   (engine solve+prune 9m02.9s)
  marginal   7m24.7s vs k<=12

### Summary

| k<= | build | solve | prune | develop | TOTAL | marginal | solve x/lvl | raw disk | solve RSS | prune RSS | tilings at k |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 3.06s | 0.11s | 0.09s | 0.04s | 3.30s | 3.30s | — | 0.0 MB | 1.7 MB | 1.6 MB | 10 |
| 2 | 2.47s | 0.13s | 0.09s | 0.05s | 2.74s | -0.56s | 1.16x | 0.0 MB | 2.0 MB | 1.8 MB | 20 |
| 3 | 2.47s | 0.15s | 0.09s | 0.07s | 2.78s | 0.03s | 1.09x | 0.0 MB | 2.2 MB | 2.1 MB | 61 |
| 4 | 2.40s | 0.17s | 0.11s | 0.12s | 2.81s | 0.03s | 1.20x | 0.2 MB | 2.3 MB | 2.6 MB | 151 |
| 5 | 2.81s | 0.49s | 0.13s | 0.27s | 3.71s | 0.90s | 2.80x | 0.7 MB | 2.6 MB | 3.2 MB | 332 |
| 6 | 2.52s | 0.84s | 0.24s | 0.64s | 4.23s | 0.52s | 1.71x | 1.9 MB | 2.9 MB | 4.1 MB | 673 |
| 7 | 2.39s | 2.12s | 0.30s | 1.48s | 6.29s | 2.06s | 2.53x | 5.3 MB | 3.2 MB | 6.8 MB | 1472 |
| 8 | 2.46s | 5.38s | 0.63s | 3.47s | 11.94s | 5.65s | 2.54x | 13.4 MB | 3.5 MB | 14.3 MB | 2850 |
| 9 | 2.86s | 13.41s | 1.52s | 7.49s | 25.28s | 13.34s | 2.49x | 33.7 MB | 4.2 MB | 31.2 MB | 5960 |
| 10 | 2.62s | 41.47s | 5.31s | 26.44s | 1m15.8s | 50.56s | 3.09x | 80.2 MB | 5.1 MB | 65.2 MB | 11866 |
| 11 | 5.01s | 1m31.9s | 10.82s | 38.19s | 2m25.9s | 1m10.1s | 2.22x | 190.9 MB | 6.8 MB | 166.4 MB | 24459 |
| 12 | 2.69s | 3m04.4s | 29.39s | 1m26.5s | 5m03.0s | 2m37.1s | 2.01x | 445.3 MB | 9.3 MB | 392.3 MB | 49794 |
| 13 | 2.55s | 7m36.6s | 1m26.4s | 3m22.2s | 12m27.7s | 7m24.7s | 2.48x | 1034.7 MB | 12.0 MB | 846.4 MB | 103082 |

Finished 2026-08-03 10:11:56

## Streaming path measured (k=10), for comparison with the run-oracle.sh default

`EU_STREAM=1 eu_solver | EU_STREAM=1 eu_pruner`, MAXNUM=10:

    wall 31.03s   peak RSS 27.7 MB   raw files on disk: 0

versus the file-based default at the same k: 46.8s engine, 65.2 MB pruner RSS, 80.2 MB raw.
Reproduces DEVELOPMENT_NOTES §44 ("fused k<=10: 32s, 27 MB, 0 raw") almost exactly.

## Fitted growth, k=7..13 (geometric, per level)

    solve      2.449x      prune     2.563x      develop  2.269x
    raw disk   2.407x      prune RSS 2.234x      engine   2.465x

## Projection to higher k (streamed engine; develop scaled at 2.27x)

| k | engine (streamed) | +develop | streamed RSS | file-path RSS | file-path raw disk |
|---|---|---|---|---|---|
| 14 | 18.6 min | 26.3 min | 134 MB | 1.8 GB | 2.4 GB |
| 15 | 45.6 min | 1.0 h | 201 MB | 4.1 GB | 5.9 GB |
| 16 | 1.9 h | 2.5 h | 301 MB | 9.2 GB | 14.1 GB |
| 17 | 4.6 h | 6.0 h | 451 MB | 20.6 GB | 33.9 GB |
| 18 | 11.2 h | 14.5 h | 677 MB | 46.0 GB | 81.6 GB |
| 19 | 1.1 days | 1.5 days | 1015 MB | 102.7 GB | 196.3 GB |
| 20 | 2.8 days | 3.5 days | 1.5 GB | 229.4 GB | 472.4 GB |
| 21 | 6.8 days | 8.5 days | 2.2 GB | 512.4 GB | 1.1 TB |
| 22 | 16.7 days | 20.5 days | 3.3 GB | 1.1 TB | 2.7 TB |

## BUG found during this run: `make MAXNUM=<k>` can silently no-op

macOS ships GNU Make 3.81, which compares mtimes at 1-SECOND granularity. The Makefile's
`.maxnum-$(PALETTE)-$(MAXNUM)` stamp is touched and then `eu_solver` is rebuilt only if the stamp
is strictly NEWER. When a full pipeline round-trips inside one wall-clock second (true for k<=5,
~0.3s end to end), the stamp lands in the same second as the previous `eu_solver` and make judges
the binary up to date. The PREVIOUS MAXNUM stays compiled in and the solver silently
under-enumerates.

Observed in the first sweep of this session: `make MAXNUM=5` no-opped after a MAXNUM=4 build at
09:47:21, the k=4 binary ran again (427 raw blocks, identical to k=4), and the catalogue reported
**k=5: 0 tilings** instead of 332. Caught only by the A068599 assertion.

This is exactly the failure the stamp was added to prevent; the stamp fixes the "flag is not a file
dependency" half of the problem but not the timestamp-granularity half. Suggested fix: have the
stamp recipe also `rm -f eu_solver$(SFX) eu_pruner$(SFX) eu_develop$(SFX)`, so the rebuild is forced
by absence instead of by mtime ordering.

The k=1..13 table above was produced with the binaries deleted before every `make`, so every row is
an honest rebuild and all 13 counts match A068599.
