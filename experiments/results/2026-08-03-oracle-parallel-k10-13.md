> **SUPERSEDED — timings contaminated.** These sequential baselines were measured while other
> oracle work ran on the same machine; k=12 and k=13 are both ~2.27x slow, which made the speedup
> look like it decayed with k. It does not. Clean re-run: `2026-08-03-parallel-clean-k10-13.md`.


## Sequential vs root-split parallel — started 2026-08-03 10:26:29

Apple M5, 10 cores. Streamed both ways (`EU_STREAM=1 eu_solver | eu_pruner`), so the
only variable is the parallelism. Shards: EU_SHARD_N=44 (one per vertex-type seed),
run 10 at a time. Speedup is wall-clock of the whole batch vs the single process.

### k <= 10
  sequential   30.5s   [A068599 ok]
  parallel     7.4s   [A068599 ok]  speedup 4.14x
    slowest shard 7.2s (17% of all shard CPU), top-3 7.2s, 6.8s, 5.6s
    total shard CPU 43.3s vs 30.5s sequential (sharding overhead 1.42x)
    Amdahl ceiling from slowest shard: 6.0x

### k <= 11
  sequential   1m16.7s   [A068599 ok]
  parallel     21.7s   [A068599 ok]  speedup 3.53x
    slowest shard 20.9s (17% of all shard CPU), top-3 20.9s, 20.5s, 17.7s
    total shard CPU 2m00.3s vs 1m16.7s sequential (sharding overhead 1.57x)
    Amdahl ceiling from slowest shard: 5.7x

### k <= 12
  sequential   6m35.9s   [A068599 ok]
  parallel     2m04.0s   [A068599 ok]  speedup 3.19x
    slowest shard 1m58.5s (18% of all shard CPU), top-3 1m58.5s, 1m52.9s, 1m42.5s
    total shard CPU 10m53.3s vs 6m35.9s sequential (sharding overhead 1.65x)
    Amdahl ceiling from slowest shard: 5.5x

### k <= 13
  sequential   16m11.3s   [A068599 ok]
  parallel     4m30.3s   [A068599 ok]  speedup 3.59x
    slowest shard 4m27.0s (18% of all shard CPU), top-3 4m27.0s, 3m56.8s, 3m46.6s
    total shard CPU 24m32.7s vs 16m11.3s sequential (sharding overhead 1.52x)
    Amdahl ceiling from slowest shard: 5.5x

### Summary

| k<= | sequential | parallel | speedup | slowest shard | total shard CPU | Amdahl ceiling |
|---|---|---|---|---|---|---|
| 10 | 30.5s | 7.4s | 4.14x | 7.2s | 43.3s | 6.0x |
| 11 | 1m16.7s | 21.7s | 3.53x | 20.9s | 2m00.3s | 5.7x |
| 12 | 6m35.9s | 2m04.0s | 3.19x | 1m58.5s | 10m53.3s | 5.5x |
| 13 | 16m11.3s | 4m30.3s | 3.59x | 4m27.0s | 24m32.7s | 5.5x |

Finished 2026-08-03 10:58:13
