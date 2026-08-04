
## Clean sequential vs parallel — 2026-08-03 13:48:03

90s settle before every measurement; a fixed canary (MAXNUM=8 solve) timed just
before each one so thermal drift is visible rather than silent. Streamed both ways.

### k <= 10
  canary 5.54s (1.00x baseline)
  sequential   30.4s   [A068599 ok]
  canary 5.05s (0.91x baseline)
  parallel     7.3s   [A068599 ok]  speedup 4.18x
    slowest shard 7.2s, total shard CPU 43.2s, Amdahl ceiling 6.0x

### k <= 11
  canary 5.06s (0.91x baseline)
  sequential   1m12.9s   [A068599 ok]
  canary 5.11s (0.92x baseline)
  parallel     17.4s   [A068599 ok]  speedup 4.20x
    slowest shard 16.7s, total shard CPU 1m40.8s, Amdahl ceiling 6.0x

### k <= 12
  canary 5.05s (0.91x baseline)
  sequential   2m56.1s   [A068599 ok]
  canary 5.16s (0.93x baseline)
  parallel     43.6s   [A068599 ok]  speedup 4.04x
    slowest shard 42.7s, total shard CPU 4m03.5s, Amdahl ceiling 5.7x

### k <= 13
  canary 5.30s (0.96x baseline)
  sequential   7m44.6s   [A068599 ok]
  canary 5.35s (0.96x baseline)
  parallel     1m56.3s   [A068599 ok]  speedup 3.99x
    slowest shard 1m55.0s, total shard CPU 11m03.7s, Amdahl ceiling 5.8x

### Summary

| k<= | sequential | parallel | speedup | slowest shard | shard CPU | Amdahl | canary seq/par |
|---|---|---|---|---|---|---|---|
| 10 | 30.4s | 7.3s | **4.18x** | 7.2s | 43.2s | 6.0x | 1.00x / 0.91x |
| 11 | 1m12.9s | 17.4s | **4.20x** | 16.7s | 1m40.8s | 6.0x | 0.91x / 0.92x |
| 12 | 2m56.1s | 43.6s | **4.04x** | 42.7s | 4m03.5s | 5.7x | 0.91x / 0.93x |
| 13 | 7m44.6s | 1m56.3s | **3.99x** | 1m55.0s | 11m03.7s | 5.8x | 0.96x / 0.96x |

Finished 2026-08-03 14:16:16
