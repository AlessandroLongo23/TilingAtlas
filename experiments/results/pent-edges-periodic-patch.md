# Periodic patch build over the whole pentagon-edges corpus

Every record of `edges_pentagons_01` put through `buildPentEdgePatch` at three parameter points.
A build is a success only when the fundamental domain comes out with exactly k faces, 2k vertices
and 3k edges — the counts the certificate's dart total forces.

Started 2026-08-04T11:32:29.265Z

## default  {}

| k | records | built | failed | mean ms | max ms | rank0 | rank1 | rank2 |
|---|---|---|---|---|---|---|---|---|
| 2 | 13 | 13 | 0 | 4.2 | 6 | 6 | 8 | 1 |
| 4 | 103 | 103 | 0 | 3.5 | 4 | 122 | 59 | 0 |
| 6 | 628 | 628 | 0 | 3.5 | 7 | 1134 | 390 | 13 |
| 8 | 3977 | 3977 | 0 | 8.6 | 42 | 9738 | 2281 | 62 |
| 10 | 13272 | 13272 | 0 | 12.7 | 83 | 40924 | 9016 | 203 |

## t=0.02  {"t":0.02}

| k | records | built | failed | mean ms | max ms | rank0 | rank1 | rank2 |
|---|---|---|---|---|---|---|---|---|
| 2 | 13 | 13 | 0 | 1.5 | 2 | 6 | 8 | 1 |
| 4 | 103 | 103 | 0 | 3.5 | 8 | 122 | 60 | 0 |
| 6 | 628 | 628 | 0 | 8.3 | 52 | 1134 | 390 | 13 |
| 8 | 3977 | 3977 | 0 | 12.6 | 72 | 9738 | 2282 | 62 |
| 10 | 13272 | 13272 | 0 | 17.9 | 306 | 40924 | 9016 | 203 |

## skew  {"A":160,"B":30,"D":155,"b":2.4,"t":0.15}

| k | records | built | failed | mean ms | max ms | rank0 | rank1 | rank2 |
|---|---|---|---|---|---|---|---|---|
| 2 | 13 | 13 | 0 | 10.5 | 14 | 6 | 8 | 1 |
| 4 | 103 | 103 | 0 | 10.0 | 16 | 122 | 60 | 0 |
| 6 | 628 | 628 | 0 | 9.4 | 53 | 1134 | 390 | 13 |
| 8 | 3977 | 3977 | 0 | 14.7 | 187 | 9738 | 2284 | 62 |
| 10 | 13272 | 13272 | 0 | 17.8 | 190 | 40924 | 9016 | 203 |


Finished 2026-08-04T11:45:49.616Z
