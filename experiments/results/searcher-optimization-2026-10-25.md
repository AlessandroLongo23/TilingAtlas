# tilesearch optimisation log (2026-10-25)

Every row is one run of tools/searcher/bench.py on this Mac (10 cores, 24 GB). "vs reference" compares
every certificate file (record count and sorted vertex-type lines) with the reference build, commit 56b0a405.

| ref 56b0a405 | squares_edges k=1..6 | 332965 | 21.7 | 30 | 165 |  |
| ref 56b0a405 | hybrid_2_9830 k=1..2 | 2673362 | 48.9 | 55 | 71 |  |
| ref 56b0a405 | 123_1_4657 k=1..3 | 349 | 17.4 | 11 | 30 |  |
| ref 56b0a405 | 123_1_4657_init13 k=1..3 | 3 | 0.9 | 7 | 3 |  |
| ref 56b0a405 | 1247_1_0612 k=1..3 | 130 | 5.4 | 9 | 64 |  |
| O1 pool + O2 faces | squares_edges k=1..6 | 332965 | 12.0 | 30 | 165 | identical |
| O1 pool + O2 faces | hybrid_2_9830 k=1..2 | 2673362 | 26.6 | 54 | 71 | identical |
| O1 pool + O2 faces | 123_1_4657 k=1..3 | 349 | 10.8 | 11 | 30 | identical |
| O1 pool + O2 faces | 123_1_4657_init13 k=1..3 | 3 | 0.7 | 7 | 3 | identical |
| O1 pool + O2 faces | 1247_1_0612 k=1..3 | 130 | 2.8 | 8 | 64 | identical |
| O4 candidates + capacity | squares_edges k=1..6 | 332965 | 11.6 | 30 | 165 | identical |
| O4 candidates + capacity | hybrid_2_9830 k=1..2 | 2673362 | 26.0 | 54 | 71 | identical |
| O4 candidates + capacity | 123_1_4657 k=1..3 | 349 | 6.3 | 9 | 30 | identical |
| O4 candidates + capacity | 123_1_4657_init13 k=1..3 | 3 | 0.6 | 7 | 3 | identical |
| O4 candidates + capacity | 1247_1_0612 k=1..3 | 130 | 2.2 | 6 | 64 | identical |
| O3 fingerprint + output buffers | squares_edges k=1..6 | 332965 | 11.8 | 32 | 165 | identical |
| O3 fingerprint + output buffers | hybrid_2_9830 k=1..2 | 2673362 | 24.2 | 49 | 71 | identical |
| O3 fingerprint + output buffers | 123_1_4657 k=1..3 | 349 | 4.7 | 13 | 30 | identical |
| O3 fingerprint + output buffers | 123_1_4657_init13 k=1..3 | 3 | 0.5 | 8 | 3 | identical |
| O3 fingerprint + output buffers | 1247_1_0612 k=1..3 | 130 | 2.2 | 9 | 64 | identical |
| O5 lock-free counts, batched output, packed refinement | squares_edges k=1..6 | 332965 | 10.5 | 36 | 165 | identical |
| O5 lock-free counts, batched output, packed refinement | hybrid_2_9830 k=1..2 | 2673362 | 24.0 | 54 | 71 | identical |
| O5 lock-free counts, batched output, packed refinement | 123_1_4657 k=1..3 | 349 | 4.4 | 13 | 30 | identical |
| O5 lock-free counts, batched output, packed refinement | 123_1_4657_init13 k=1..3 | 3 | 0.3 | 8 | 3 | identical |
| O5 lock-free counts, batched output, packed refinement | 1247_1_0612 k=1..3 | 130 | 1.3 | 9 | 64 | identical |

Rows below: rerun after quitting an idle TileSearch window that was using ~2 cores (earlier rows ran beside it).

| ref 56b0a405 (clean) | squares_edges k=1..6 | 332965 | 20.2 | 34 | 165 | identical |
| ref 56b0a405 (clean) | hybrid_2_9830 k=1..2 | 2673362 | 49.4 | 55 | 71 | identical |
| ref 56b0a405 (clean) | 123_1_4657 k=1..3 | 349 | 16.4 | 11 | 30 | identical |
| ref 56b0a405 (clean) | 123_1_4657_init13 k=1..3 | 3 | 0.9 | 7 | 3 | identical |
| ref 56b0a405 (clean) | 1247_1_0612 k=1..3 | 130 | 5.6 | 9 | 64 | identical |
| O5 (clean) | squares_edges k=1..6 | 332965 | 9.9 | 34 | 165 | identical |
| O5 (clean) | hybrid_2_9830 k=1..2 | 2673362 | 22.9 | 53 | 71 | identical |
| O5 (clean) | 123_1_4657 k=1..3 | 349 | 4.3 | 13 | 30 | identical |
| O5 (clean) | 123_1_4657_init13 k=1..3 | 3 | 0.3 | 8 | 3 | identical |
| O5 (clean) | 1247_1_0612 k=1..3 | 130 | 1.4 | 9 | 64 | identical |
| O6 hand off near the top, only to idle threads (D=2) | squares_edges k=1..6 | 332965 | 6.0 | 37 | 165 | identical |
| O6 hand off near the top, only to idle threads (D=2) | hybrid_2_9830 k=1..2 | 2673362 | 14.1 | 50 | 71 | identical |
| O6 hand off near the top, only to idle threads (D=2) | 123_1_4657 k=1..3 | 349 | 1.5 | 13 | 30 | identical |
| O6 hand off near the top, only to idle threads (D=2) | 123_1_4657_init13 k=1..3 | 3 | 0.2 | 8 | 3 | identical |
| O6 hand off near the top, only to idle threads (D=2) | 1247_1_0612 k=1..3 | 130 | 0.6 | 8 | 64 | identical |
| O7 merger thread + O8 perfect-hash label ids | squares_edges k=1..6 | 332965 | 6.0 | 38 | 165 | identical |
| O7 merger thread + O8 perfect-hash label ids | hybrid_2_9830 k=1..2 | 2673362 | 14.0 | 53 | 71 | identical |
| O7 merger thread + O8 perfect-hash label ids | 123_1_4657 k=1..3 | 349 | 1.1 | 13 | 30 | identical |
| O7 merger thread + O8 perfect-hash label ids | 123_1_4657_init13 k=1..3 | 3 | 0.1 | 8 | 3 | identical |
| O7 merger thread + O8 perfect-hash label ids | 1247_1_0612 k=1..3 | 130 | 0.4 | 9 | 64 | identical |
| O9 allocation-free orientability | squares_edges k=1..6 | 332965 | 6.2 | 38 | 165 | identical |
| O9 allocation-free orientability | hybrid_2_9830 k=1..2 | 2673362 | 13.2 | 53 | 71 | identical |
| O9 allocation-free orientability | 123_1_4657 k=1..3 | 349 | 1.1 | 13 | 30 | identical |
| O9 allocation-free orientability | 123_1_4657_init13 k=1..3 | 3 | 0.1 | 7 | 3 | identical |
| O9 allocation-free orientability | 1247_1_0612 k=1..3 | 130 | 0.4 | 9 | 64 | identical |
