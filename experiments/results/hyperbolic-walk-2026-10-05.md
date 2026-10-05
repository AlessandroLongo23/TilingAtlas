# The per-pixel walk renderer, 2026-10-05

Machine: Apple M-series, headed Chromium (Playwright), 120 Hz panel, production build on port 3100,
viewport 1500 x 950 at device scale 2.

## Why the Dirichlet certificate cannot cover the shelf

`buildDirichletDomain` with `maxInstances` 6,000,000 and 20 rounds, node.

| record | darts | result | time |
|---|---|---|---|
| hp17-1-00001 (3.4.17.4) | 4 | R_D 1.40, 20 sides, 8,708 instances | 30 ms |
| hp7-5-00001 | 32 | R_D 1.01, 14 sides, 2,770 instances | 13 ms |
| hpq3555-15-00010 | 120 | R_D 2.96, 18 sides, 77,106 instances | 210 ms |
| hp17-9-00001 | 60 | no certificate: develop bound 0.999956, R_dev 10.74 | 673 ms |
| hp17-17-00193 | 132 | no certificate: develop bound 0.999956, R_dev 10.74 | 959 ms |
| hp10-20-00001 | 128 | no certificate: develop bound 0.999978, R_dev 11.42 | 2003 ms |

## Panning, frame intervals over about 750 frames

Started 1.5 s after the canvas appears (page still loading):

| record | p50 | p90 | p99 | max | over 12 ms |
|---|---|---|---|---|---|
| hp17-17-00193 | 8.3 | 9.1 | 41.7 | 125.1 | 17/779 |
| hp17-9-00001 | 8.3 | 9.0 | 25.1 | 358.4 | 10/769 |
| hpq3555-15-00010 | 8.3 | 9.1 | 9.4 | 108.4 | 7/754 |
| hpy17627-3-00500 | 8.3 | 9.1 | 9.4 | 200.0 | 6/759 |
| hyp-5-6-6-8-7-8-6 | 8.3 | 9.1 | 25.9 | 158.4 | 20/840 |
| he667-5-00012 | 8.3 | 9.1 | 17.4 | 183.3 | 15/820 |
| hs237-3-00004 | 8.3 | 9.1 | 17.4 | 225.0 | 11/807 |

Started 9 s after (page settled):

| record | p50 | p90 | p99 | max | over 12 ms |
|---|---|---|---|---|---|
| hp17-17-00193 | 8.3 | 9.0 | 9.4 | 9.4 | 0/741 |
| hyp-5-6-6-8-7-8-6 | 8.3 | 8.9 | 9.3 | 9.4 | 0/756 |
| he667-5-00012 | 8.3 | 8.9 | 9.3 | 9.4 | 0/738 |

## Page load

| record | first disk frame | main-thread tasks of 80 ms or more |
|---|---|---|
| hp17-17-00193 | 1659 ms | 112, 161, 111, 121, 106 (676 ms in 6 long tasks) |
| hyp-5-6-6-8-7-8-6 | 2369 ms | 121, 157, 118, 96, 165 (851 ms in 8) |
| hpy17627-1-00004 | 1723 ms | 112, 148, 99, 128 (708 ms in 8) |

## The rejected first attempt: completing open frontier faces in the 2D developer

Node, 240 panning frames, 50k budget, develop ms per frame.

| record | before | all open faces | faces over 0.002 only |
|---|---|---|---|
| hp17 k=9 | 13.0 | traceFaced alone 41 | 29.8 |
| hpq3555 k=15 | 10.9 | not measured | 28.3 |
