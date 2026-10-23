# Unified searcher: acceptance gate (2026-10-23)

`tools/searcher/tilesearch` (Marek's engine from his source, driven by a board file) against Marek's own
binaries. Both runs in the session scratchpad; outputs not kept.

## 1. Parser: board file -> engine arguments

Each `main_*.cpp` in `planar_tilings.zip` was converted to a board file, and the same `main` was compiled
against a stub `find_and_write_tilings` that prints its arguments. `tilesearch --dump` on the board must
print the same faces, apeirogons, vertex words (as corner codes), permutation flag and initial count.

| result | mains |
|---|---|
| identical | 80 |
| different | 0 |
| not comparable | 4: `main_123_2_4161`, `main_B2`, `main_C1` do not compile as shipped; `main_AI1` reads its labels from stdin |

## 2. Runs against the 2026 binaries under wine

Fingerprint per output file: name (k, labels used, orientability, edge orbits), record count, and SHA-256
of the sorted vertex-type lines. Thread order changes gluing lines and representatives, not these.

| board | k | tilesearch | binary (wine) | files | fingerprints |
|---|---|---|---|---|---|
| `squares_edges` | 1-5 | 13 / 153 / 1,254 / 7,848 / 43,792 = 53,060 in 6.1 s | 53,060 in 29.3 s | 120 | identical |
| `hybrid_2_9830` | 1-2 | 1,094 / 2,672,268 = 2,673,362 in 106 s | 2,673,362 in 981 s | 71 | identical |
| `1247_1_0612` (2022 source main vs 2023 .exe) | 1-3 | 7 / 27 / 96 | 7 / 27 / 96 | 64 | names and counts identical |

k=5 of `squares_edges` matches the 43,792 in `docs/RUNNING_MAREK_SOLVERS.md`; k=1 of `hybrid_2_9830`
matches the 1,094 records in `docs/marek-engine-reconstruction-2026-10-12.md`. The times are not an engine
comparison: the binary runs under Rosetta with its compiled-in 2 or 3 threads, tilesearch natively on
every core.

`hybrid_2_9830` at k=3 was abandoned: tilesearch had written 7.7M tilings (8.4 GB) after 20 minutes
when its time limit stopped it.
