
## Clean re-measurement of streamed k=12/k=13 — 2026-08-03 13:19:44

Machine idle (no other oracle processes). Each run is the full streamed pipeline
`EU_STREAM=1 eu_solver | EU_STREAM=1 eu_pruner`, timed end to end, pruner peak RSS via
/usr/bin/time -l. Compared against the file-based engine times from the clean k1-13 sweep.

### k<=12  streamed
  wall 2m54.1s   pruner peak RSS 111.1 MB   [A068599 ok]
  store peak 66.2711 MB total, 66.2711 MB resident
  vs file-based engine 3m33.8s  ->  streamed is 0.81x the file path
  vs earlier contaminated reading 6m35.9s  ->  2.27x faster now

### k<=13  streamed
  wall 7m08.3s   pruner peak RSS 214.8 MB   [A068599 ok]
  store peak 148.868 MB total, 148.868 MB resident
  vs file-based engine 9m03.0s  ->  streamed is 0.79x the file path
  vs earlier contaminated reading 16m11.3s  ->  2.27x faster now

### k<=12  streamed + spill 8MB
  wall 2m56.0s   pruner peak RSS 54.6 MB   [A068599 ok]
  store peak 66.2711 MB total, 8.00048 MB resident

### k<=13  streamed + spill 8MB
  wall 7m10.2s   pruner peak RSS 75.6 MB   [A068599 ok]
  store peak 148.868 MB total, 8.00086 MB resident

### Summary

| k<= | mode | wall | pruner RSS | file-based engine | ratio |
|---|---|---|---|---|---|
| 12 | streamed | 2m54.1s | 111.1 MB | 3m33.8s | 0.81x |
| 13 | streamed | 7m08.3s | 214.8 MB | 9m03.0s | 0.79x |
| 12 | streamed + spill 8MB | 2m56.0s | 54.6 MB | 3m33.8s | 0.82x |
| 13 | streamed + spill 8MB | 7m10.2s | 75.6 MB | 9m03.0s | 0.79x |

Finished 2026-08-03 13:39:56
