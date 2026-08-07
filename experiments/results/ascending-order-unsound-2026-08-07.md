# A global VC order on the placement sequence is unsound (2026-08-07)

AL's idea: three vertex types can be glued in 6 orders, so impose a global order on the alphabet and
at each step only consider types ahead of the last one placed. Same results, 6x less work.

**It loses 26% of the catalog.** star24full k<=2, AC-pruned alphabet, uncapped budget:

| | k=1 | k=2 | total | digest | user s |
|---|---|---|---|---|---|
| min-type-root (current) | 44 | 74 | 118 | `0b6cb12bb7f5f797` | 2.06 |
| nondecreasing sequence | 37 | 50 | **87** | `70f8e74d30bb976f` | 0.88 |

The one-line change tested (`eu_solver_asc.cpp`), current behaviour on the left of the ternary:

```cpp
const int lo = std::getenv("EU_ASCENDING") ? slist.vertype.back() : slist.vertype[0];
int gidx = (int)(std::lower_bound(pool->begin(), pool->end(), lo,
                 [](CandEnt const& e, int v) { return e.gr < v; }) - pool->begin());
```

## Why it fails

The placement order is not a free permutation of a set. `mincycle` picks `firstfree`
deterministically, so the solver never chooses WHICH type to add next — it chooses what goes in a slot
the configuration already forced. "A then B" and "B then A" are not two orderings of one choice: the
second vertex's attachment point depends on the first.

The decisive counterexample, from the raw k=2 output:

```
placement order [26, 14701, 27405, 26]
(12*d20,3)A, (12*p2,3,4,3,3,3)F, (3,3,3,3,3,3)S3b, (12*d20,3)A
```

Type 26 occurs in TWO distinct orbits with 14701 and 27405 forced between them. No global order admits
that sequence, and non-strict `>=` does not rescue it, because the repeats are not adjacent and cannot
be moved. Two more, both genuine descents between distinct types: `[26, 34928, 27, 14683]` and
`[268, 872, 7208, 290]`. Across the k=3 raw catalog, **260 of 415 multi-vertex blocks have a
descending step**.

k=1 breaks too (44 -> 37) through the same door: noncounting dent-fill vertices also enter `vertype`,
so even a 1-uniform tiling has a multi-element placement sequence to descend on.

## What is already there, and why it is sound

`extend()` never adds a type below `vertype[0]` — the min-type-root invariant. That is AL's idea
applied against the FIRST element instead of the running maximum, and it is sound for exactly the
reason the strong form is not: the minimum of a set is order-independent, the sequence is not. It is
also what makes the 200-shard partition disjoint (`run-oracle-parallel.sh`, `run-oracle-pool.sh`).

## The sound version of what AL wanted

Canonical construction path (orderly generation): at each node ask whether the partial configuration is
the canonical representative of its isomorphism class and cut if not. `eu_pruner` already computes such
a form (WL/DFA canonical) — it just applies it after the fact, to finished tilings.

Prize, bounded by the duplication actually present in the raw output: 146 -> 118 at k=2 (1.24x),
445 -> 287 at k=3 (1.55x). The duplicate SUBTREE work is the number that would matter and is not
measured. Not a breakthrough either way.
