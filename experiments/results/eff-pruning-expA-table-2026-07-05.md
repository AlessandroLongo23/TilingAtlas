# Experiment A — pruning power (parsed 2026-07-05T10:20:48.461Z)

| k | c | pool kept | pool % | distinct lattices | fills | digest | count | vs certified | wall |
|---|---|-----------|--------|-------------------|-------|--------|-------|--------------|------|
| 1 | 1.20 | 6,096 | 13.93% | 52,816 | 9,028 | 476ebbd763fa6193 | 10 | ✗ CHANGED | 66s |
| 1 | 1.25 | 7,992 | 18.26% | 77,817 | 13,296 | 6f9ca9cf2d16c75f | 11 | ✓ MATCH | 80s |
| 1 | 1.30 | 9,600 | 21.93% | 104,026 | 17,369 | 6f9ca9cf2d16c75f | 11 | ✓ MATCH | 95s |
| 1 | 1.35 | 10,800 | 24.67% | 122,924 | 20,815 | 6f9ca9cf2d16c75f | 11 | ✓ MATCH | 108s |
| 1 | 1.50 | 14,160 | 32.35% | 194,056 | 31,482 | 6f9ca9cf2d16c75f | 11 | ✓ MATCH | 2.6min |
| 1 | 2/√3 | 4,392 | 10.03% | 34,699 | 5,264 | 476ebbd763fa6193 | 10 | ✗ CHANGED | 56s |
| 1 | √2 | 12,192 | 27.85% | 155,837 | 25,587 | 6f9ca9cf2d16c75f | 11 | ✓ MATCH | 2.1min |
| 1 | ∞ | 43,776 | 100.00% | 831,279 | 224,557 | 6f9ca9cf2d16c75f | 11 | ✓ MATCH | 23.1min |
| 2 | 1.20 | 16,224 | 11.07% | 232,976 | — | — | — | n/a (no fills) | 5.6min |
| 2 | 1.25 | 21,696 | 14.81% | 356,167 | — | — | — | n/a (no fills) | 7.7min |
| 2 | 1.30 | 26,400 | 18.02% | 487,452 | — | — | — | n/a (no fills) | 10.3min |
| 2 | 1.35 | 30,504 | 20.82% | 630,437 | — | — | — | n/a (no fills) | 13.7min |
| 2 | 1.50 | 43,272 | 29.53% | 1,160,616 | — | — | — | n/a (no fills) | 13.9min |
| 2 | 2/√3 | 10,920 | 7.45% | 133,742 | — | — | — | n/a (no fills) | 4.3min |
| 2 | √2 | 35,808 | 24.44% | 867,134 | — | — | — | n/a (no fills) | 13.9min |
| 2 | ∞ | 146,520 | 100.00% | — | — | — | — | n/a (no fills) | — |
| 3 | 1.20 | 85,632 | 7.88% | — | — | — | — | n/a (no fills) | 2s |
| 3 | 1.25 | 119,544 | 11.00% | — | — | — | — | n/a (no fills) | 2s |
| 3 | 1.30 | 153,240 | 14.10% | — | — | — | — | n/a (no fills) | 3s |
| 3 | 1.35 | 186,096 | 17.12% | — | — | — | — | n/a (no fills) | 3s |
| 3 | 1.50 | 292,296 | 26.89% | — | — | — | — | n/a (no fills) | 4s |
| 3 | 2/√3 | 54,600 | 5.02% | — | — | — | — | n/a (no fills) | 2s |
| 3 | √2 | 229,800 | 21.14% | — | — | — | — | n/a (no fills) | 3s |
| 3 | ∞ | 1,086,912 | 100.00% | — | — | — | — | n/a (no fills) | 15s |

## Per-stage reduction vs c=∞ baseline

**k=1** (baseline: pool 43,776, distinct 831,279, fills 224,557)
- c=1.20: pool 7.18× → distinct 15.74× → fills 24.87×    ⚑ DIGEST CHANGED (tiling dropped)
- c=1.25: pool 5.48× → distinct 10.68× → fills 16.89×  
- c=1.30: pool 4.56× → distinct 7.99× → fills 12.93×  
- c=1.35: pool 4.05× → distinct 6.76× → fills 10.79×  
- c=1.50: pool 3.09× → distinct 4.28× → fills 7.13×  
- c=2/√3: pool 9.97× → distinct 23.96× → fills 42.66×    ⚑ DIGEST CHANGED (tiling dropped)
- c=√2: pool 3.59× → distinct 5.33× → fills 8.78×  
