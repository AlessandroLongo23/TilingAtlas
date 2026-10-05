# Hyperbolic 2D path and bake: performance, 2026-10-05

Machine: this Mac, production build (`pnpm start`), headed Chromium, 1500x950 at DPR 2.
Pan: a continuous back-and-forth drag, about 0.08 hyperbolic units per mouse step.

## Frame time while panning, frame-rate limit off

| tiling | before | after (30k) | after (50k, shipped) |
|---|---|---|---|
| hp17-9-00001 (3.4.17.4, k=9) | 13.7 ms mean, every frame | 7.4 ms p90 | 10.6 ms p90, 12.0 p99 |
| hpy17627-3-00500 (apeirogons) | 8.5 ms mean | 5.9 ms p90 | 4.0 ms p90, 5.9 p99 (at 70k) |

"Before" did the full develop on every frame, moving or not, so its mean is its per-frame cost.
"After" skips the develop when the view centre did not move, so the mean (4 to 6 ms) is diluted by
idle frames and p90 is the cost of a frame that moved.
With vsync on, every run read 33.3 ms: the display was asleep and Chromium ran at 30 Hz. No 60 Hz
measurement was taken.

## JavaScript only, node, 240 panning frames, canvas calls mocked

| tiling | develop before | develop after | draw before | draw after | worst frame before | after |
|---|---|---|---|---|---|---|
| hp17 k=9 | 27.6 ms | 11.8 ms | 13.7 ms | 5.0 ms | 209 ms | 45 ms |
| hpy17627 k=3 #500 | 11.5 ms | 5.7 ms | 23.2 ms | 3.3 ms | 232 ms | 21 ms |
| hpq3555 k=15 #10 | 23.7 ms | 11.8 ms | 17.1 ms | 7.2 ms | 106 ms | 43 ms |

Canvas calls per frame, hp17: fill 2,773 -> 71, stroke 13,992 -> 114.
Apeirogon board: fill 14,221 -> 15, stroke 21,528 -> 108.

## Field bake (certified records, main thread), node

| record | before | after | field hash |
|---|---|---|---|
| hpq3555-15-00010 | 1951 ms | 893 ms | identical |
| hp7-40-00001 | 3881 ms | 1197 ms | identical |
| hp7-20-00001 | 4389 ms | 2319 ms | identical |
| hyp-6-6-7 (plain) | 87 ms | 31 ms | identical |

What is left in a bake, hp7-20: Dirichlet domain 1431 ms, texel loop 737 ms (edge distances and 64k
folded lookups), everything else under 150 ms.

## Second pass, same day: bake in a worker, thumbnails, develop hot loop

### At the display's real refresh (120 Hz), production build, panning from 1.5 s after load

| tiling | p50 | p99 | max | frames over 12 ms |
|---|---|---|---|---|
| hp17-9-00001 (2D path, 50k budget) | 8.3 ms | 9.4 ms | 49.9 ms | 8 of 987 |
| hpy17627-3-00500 (apeirogons, 2D) | 8.3 ms | 9.3 ms | 9.4 ms | 0 of 736 |
| hpq3555-15-00010 (certified, GL) | 8.3 ms | 9.3 ms | 9.4 ms | 0 |
| hp7-40-00001 (certified, GL) | 8.3 ms | 9.3 ms | 24.1 ms | not counted |

### Main-thread tasks over 80 ms in the first 10 s after opening a tiling

| tiling | bake on the main thread | bake in a worker |
|---|---|---|
| hp7-40-00001 | 817, 2074, 814, 2291 ms and four shorter | none (one of 104 ms in an earlier run) |
| hpq3555-15-00010 | ten, up to 462 ms | none |
| hp17-9-00001 | 1925, 637, 1148 ms and three shorter | none (one of 85 ms) |

The "before" column was taken with the frame-rate limit off, the "after" with it on.

### Develop, node, 240 panning frames at the 50k budget

| tiling | before this pass | after |
|---|---|---|
| hp17 k=9 | 15.1 ms (extend 7.9, trace 4.1, prune 2.9) | 13.0 ms (extend 7.5, trace 3.6, prune 1.6) |
| hpq3555 k=15 | 15.5 ms | 10.9 ms |

### A 2D thumbnail from scratch, node

| budget | hp17 k=9 before | after | hpq3555 k=15 before | after |
|---|---|---|---|---|
| 20,000 | 29.4 ms | 17.1 ms | 18.8 ms | 12.3 ms |
| 35,000 (shipped) | 33.9 ms | 25.9 ms | 41.2 ms | 25.4 ms |
| 50,000 | 49.8 ms | 38.7 ms | 67.7 ms | 34.9 ms |
