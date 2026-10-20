# Frame search benchmark, 2026-10-19

Baseline = `baseline.js` (the FrameFinder engine made grid-generic), single thread, Node v24.14.1. Final = `frames.cpp`, 1 and 10 threads. "Same" = identical canonical frame sets.

| grid | tiles | N | frames | same | baseline s | final 1t s | final 10t s | speedup 1t | speedup 10t | nodes base / final |
|---|---|---|---|---|---|---|---|---|---|---|
| iamond | P pentiamond | 6 | 480 | yes | 57.1 | 4.69 | 0.69 | 12.2x | 83x | 2.52 |
| iamond | P pentiamond | 7 | 3741 | yes | 1131.0 | 86.53 | 11.31 | 13.1x | 100x | 2.58 |
| iamond | sphinx | 7 | 226 | yes | 188.5 | 16.41 | 1.89 | 11.5x | 100x | 2.74 |
| iamond | all 12 hexiamonds | 6 | 267 | yes | 77.5 | 6.44 | 0.89 | 12.0x | 87x | 2.54 |
| omino | all 5 tetrominoes | 6 | 11436 | yes | 977.4 | 65.72 | 7.89 | 14.9x | 124x | 2.52 |
| omino | all 12 pentominoes | 5 | 809 | yes | 47.0 | 3.19 | 0.40 | 14.7x | 119x | 2.63 |
| hex | all 7 tetrahexes | 5 | 15814 | yes | 1175.6 | 61.38 | 7.22 | 19.2x | 163x | 2.60 |
| kite | all 84 hexakites | 8 | 1266 | yes | 90.8 | 7.98 | 1.10 | 11.4x | 82x | 2.21 |
| kite | all 845 octakites | 6 | 517 | yes | 3.0 | 0.35 | 0.25 | 8.4x | 12x | 2.04 |
| drafter | all 38 hexadrafters | 8 | 82 | yes | 2.2 | 0.13 | 0.04 | 16.5x | 60x | 2.35 |
| abolo | all 22 hexabolos | 7 | 79 | yes | 14.7 | 0.93 | 0.14 | 15.7x | 103x | 2.74 |
| halfcairo | all 37 penta-half-Cairos | 8 | 314 | yes | 0.5 | 0.04 | 0.03 | 10.6x | 18x | 2.34 |
| octasquare | all 21 tetra-octasquares | 5 | 944 | yes | 30.8 | 1.97 | 0.28 | 15.6x | 110x | 2.39 |
| trihex | all 29 penta-trihexes | 6 | 8674 | yes | 132.2 | 7.71 | 1.18 | 17.2x | 112x | 2.06 |
| bevelhex | all 49 tetra-bevelhexes | 6 | 3481 | yes | 50.2 | 3.51 | 0.57 | 14.3x | 87x | 2.29 |

Original FrameFinder.html engine (unmodified, single thread) on the triangle-grid rows:

| tile | N | original s | baseline.js s | final 1t s | same |
|---|---|---|---|---|---|
| P pentiamond | 6 | 65.7 | 57.1 | 4.69 | yes |
| P pentiamond | 7 | 1281.5 | 1131.0 | 86.53 | yes |
| sphinx | 7 | 194.8 | 188.5 | 16.41 | yes |
