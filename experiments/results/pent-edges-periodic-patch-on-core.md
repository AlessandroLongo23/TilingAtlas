# Periodic patch build over the whole pentagon-edges corpus — on the shared core

Same sweep as `pent-edges-periodic-patch.md`, re-run after the duplicated lattice recovery in
`lib/pentagon/edgePatch.ts` was deleted and the board pointed at `lib/freedraw/edgePatchCore.ts`
with `periodFacesExactly`. A build counts as a success only when the fundamental domain comes out
with exactly k faces, 2k vertices and 3k edges.

Started 2026-08-04T15:27:30.257Z

## default  {}

| k | records | built | failed | mean ms | max ms | rank0 | rank1 | rank2 |
|---|---|---|---|---|---|---|---|---|
| 2 | 13 | 13 | 0 | 4.9 | 8 | 6 | 8 | 1 |
<!-- progress 1/15 shards · elapsed 0s · eta 1s -->
| 4 | 103 | 103 | 0 | 4.1 | 5 | 122 | 59 | 0 |
<!-- progress 2/15 shards · elapsed 0s · eta 3s -->
| 6 | 628 | 628 | 0 | 4.1 | 22 | 1134 | 390 | 13 |
<!-- progress 3/15 shards · elapsed 3s · eta 12s -->
| 8 | 3977 | 3977 | 0 | 4.0 | 31 | 9738 | 2281 | 62 |
<!-- progress 4/15 shards · elapsed 19s · eta 52s -->
| 10 | 13272 | 13272 | 0 | 4.0 | 24 | 40924 | 9016 | 203 |
<!-- progress 5/15 shards · elapsed 72s · eta 143s -->

## t=0.02  {"t":0.02}

| k | records | built | failed | mean ms | max ms | rank0 | rank1 | rank2 |
|---|---|---|---|---|---|---|---|---|
| 2 | 13 | 13 | 0 | 1.5 | 2 | 6 | 8 | 1 |
<!-- progress 6/15 shards · elapsed 72s · eta 107s -->
| 4 | 103 | 103 | 0 | 1.5 | 2 | 122 | 60 | 0 |
<!-- progress 7/15 shards · elapsed 72s · eta 82s -->
| 6 | 628 | 628 | 0 | 5.3 | 19 | 1134 | 390 | 13 |
<!-- progress 8/15 shards · elapsed 75s · eta 66s -->
| 8 | 3977 | 3977 | 0 | 5.3 | 51 | 9738 | 2282 | 62 |
<!-- progress 9/15 shards · elapsed 96s · eta 64s -->
| 10 | 13272 | 13272 | 0 | 19.8 | 79176 | 40924 | 9016 | 203 |
<!-- progress 10/15 shards · elapsed 359s · eta 179s -->

## skew  {"A":160,"B":30,"D":155,"b":2.4,"t":0.15}

| k | records | built | failed | mean ms | max ms | rank0 | rank1 | rank2 |
|---|---|---|---|---|---|---|---|---|
| 2 | 13 | 13 | 0 | 10.2 | 11 | 6 | 8 | 1 |
<!-- progress 11/15 shards · elapsed 359s · eta 131s -->
| 4 | 103 | 103 | 0 | 10.4 | 12 | 122 | 60 | 0 |
<!-- progress 12/15 shards · elapsed 360s · eta 90s -->
| 6 | 628 | 628 | 0 | 10.4 | 14 | 1134 | 390 | 13 |
<!-- progress 13/15 shards · elapsed 367s · eta 56s -->
| 8 | 3977 | 3977 | 0 | 10.4 | 50 | 9738 | 2284 | 62 |
<!-- progress 14/15 shards · elapsed 408s · eta 29s -->
| 10 | 13272 | 13272 | 0 | 10.9 | 102 | 40924 | 9016 | 203 |
<!-- progress 15/15 shards · elapsed 553s · eta 0s -->

Finished 2026-08-04T15:36:42.850Z — 0 failures in total.
