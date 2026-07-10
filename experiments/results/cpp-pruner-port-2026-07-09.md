# C++ pruner port — benchmark & validation (2026-07-09)

Ported Marek Čtrnáct's `euclidean_pruner.py` (adapted `work/pruner.py`) to C++
(`scratchpad/cpp-build/eu_pruner.cpp`). Faithful transliteration of the dedup core
(`decode` → glue graph, `simplify` = WL canonical-form test, `comparesolutions` = isomorphism
dedup), plus two optimizations that preserve exact semantics:

1. **Isomorphism-invariant fingerprint** (3-round WL colour-refinement hash) buckets candidates by
   `(signature, fingerprint)`. Isomorphic solutions always share both keys, so `comparesolutions`
   still sees every real duplicate — the fingerprint only skips work, never changes the result.
   Turns the O(Σ n²) compare into near-linear.
2. **Bitset WL refinement** in both `simplify` and `comparesolutions` (word-parallel membership /
   clear, reusable buffers). `comparesolutions` was the true bottleneck: called once per duplicate
   block (tens of thousands), each building an O(n²) `std::set` structure.

## Validation — exact match to count.txt (k=1 octagon-blind: 11−1)

| k  | C++ pruner | count.txt |
|----|-----------:|----------:|
| 1  | 10         | 10 (−t1002) |
| 2  | 20         | 20 |
| 3  | 61         | 61 |
| 4  | 151        | 151 |
| 5  | 332        | 332 |
| 6  | 673        | 673 |
| 7  | 1472       | 1472 |
| 8  | 2850       | 2850 |
| 9  | 5960       | 5960 |
| 10 | 11866      | 11866 |
| 11 | 24459      | 24459 |

## Speedup vs the Python pruner (same raw input, same box)

| dataset | Python | C++ | speedup |
|---------|-------:|----:|--------:|
| k≤10 (70,919 raw blocks) | 353 s | 4 s  | 88×  |
| k≤11 (152,801 raw blocks) | 1447 s | 10 s | 145× |

Profile of the pre-bitset version (k≤10): decode 0.49 s, simplify 0.74 s, I/O floor 0.08 s,
`comparesolutions` 50 s — confirming the dedup was the whole cost, not parsing or I/O.

## Whole-oracle-pipeline impact (k=11)

- Solve (C++ `eu_solver`, maxnum=11): 361 s
- Prune (C++ `eu_pruner`): 10 s
- Total: ~6 min, vs the all-Python route (~5 h estimated solve + 1447 s prune).

## Follow-on (not blocking; needed only for end-to-end decode→cells with the C++ solver)

- The C++ **solver**'s `TES file:` line omits the `NN/NN_fam/filesig/` dir prefix the Python solver
  writes, so `decode.py`'s `tes_id` can't build the id. Fix in the solver's `writesolution` or make
  `tes_id` tolerant.
- The port emits empty cycle lines (decode tolerates them). Faithful `writecyclefinal` cycle output
  is only needed if `develop.py` consumes the corner cycles for reconstruction.
