# Completing the isotoxal palette at D=24 — feasibility, measured (2026-08-07)

AL asked whether the filters that took stars from k=2 to k=9 could also rescue an alphabet too big to
build, since "even if the total number of generated vcs is incredibly high, the tests might prune
most of them". The answer is: **in principle yes, on this palette family no**, and the reason is a
number nobody had looked at — the filter's kill rate is palette-dependent and it is weak here.

## What is actually missing from the shipped isotoxal shelf

`isotoxal-star-z24` (the palette behind both the isotoxal and mixed shelves) carries **15 of 42 star
species** and **9 of 12 convex isotoxal tiles**.

The star subset is `star24`, which star24full's own spec records as "provably NOT closed under
in-ring instantiation of the free-alpha families". Marek flagged the absence of 3*3 (45/195) — he was
right about this palette, though star24full does have it.

The convex side is missing exactly three rhombi. Derived, not guessed: an equilateral 2n-gon with
alternating angles has α+β = 24 − 24/n units (1 unit = 15°), convex needs both < 12, giving
cx4 {1,11}{2,10}{3,9}{4,8}{5,7}, cx6 {5,11}{6,10}{7,9}, cx8 {7,11}{8,10}, cx12 {9,11}, cx16 {10,11};
n=5 and n=10 give non-integer sums, n=12 leaves only the regular case. Present: [4,8], [5,7] and all
of cx6/cx8/cx12/cx16. **Missing: 15/165 [1,11], 30/150 [2,10], 45/135 [3,9].**

## Measurement 1 — the config space grows MULTIPLICATIVELY per added tile

| palette | vertex configs | note |
|---|---|---|
| `isotoxal-star-z24` (baseline) | 34,329 | generates in 35.5 s (documented) |
| + cx4-45.135 (3-unit corner) | **106,359** | 3.1x |
| + cx4-15.165 (1-unit corner) | **144,885** | 4.2x |
| + cx4-45.135 and cx4-30.150 | **360,539** | 10.5x, ~6 min |
| + all three rhombi (`isotoxal-cxfull-z24`) | >30 min, still running | projected ~1.1-1.5M |
| all 42 stars + all 12 cx (`isotoxal-full-z24`) | **did not finish in 86 min** | killed |

⚑ My first hypothesis — that the 1-unit (15°) corner blows it up because the point-adjacency lemma
bounds star points but not thin CONVEX corners — is WRONG. The 1-unit rhombus alone finished, and
faster than the 3-unit + 2-unit pair. Growth is multiplicative in the number of tiles, not driven by
any one thin corner.

For scale: `combined-z24`, already on record as infeasible (2026-07-12), was 1,747,450 configs
producing a 588 MB single-line `solver_tables.inc` that OOM'd `g++ -O2` on this 24 GB machine.
`isotoxal-full-z24` is the same kind of union with MORE tiles (60 vs 31), so it is at least that big.

## Measurement 2 — the filter's kill rate is palette-dependent, and isotoxal is its worst case

| palette | vertex types | live after face filter | dead |
|---|---|---|---|
| ring42 | 192,687 | 1,030 | **99.5%** |
| star24full | 60,927 | 2,372 | **96.1%** |
| ring18 | 3,839 | 331 | 91.4% |
| **isotoxal-star-z24** | 34,329 | **14,966** | **56.4%** |
| composite-convex | 18,969 | — | **0%** (BUCKET_OK false, filter inactive) |

This is the crux of the answer. The rings and stars are rescued because 96-99.5% of their types
cannot occur in any tiling. Isotoxal keeps 43.6% live — convex tiles have far more legitimate face
closures — so even a perfect generation-time implementation of the filter removes only just over half
the space. Applied to a projected 10M+ config `isotoxal-full-z24` that leaves ~4.4M, still well above
the 1.75M that already failed to compile.

**Verdict: filtering cannot rescue the full isotoxal palette.** Negative, and definitive.

## Where the same idea DOES pay

Two separable walls, and only one of them is about pruning.

**The compile wall is not about data volume at all.** The solver `#include`s `solver_tables.inc`; the
failure is `g++ -O2` on a 588 MB single-line source of millions of string literals. 1.75M entries is
~100-200 MB in RAM, nothing on a 24 GB machine. **Loading the tables at runtime from a binary file
removes this wall outright**, with no filtering needed, and would unblock `combined-z24` too. This is
the highest-value structural fix and it is contained — it touches table loading, not the search.

**The generation wall is about pruning, and the hook already exists.** `forbidden_adjacent_pairs()`
already prunes branches during enumeration on a geometric overlap test (measured 20.5x on the
enumeration stage). A face-closure prune could join it: the exact filter cannot be lifted verbatim,
because it builds its successor relation `R` by iterating the enumerated types and iterates to a
fixpoint, but a SUPERSET of `R` is computable from corner-class angles alone in O(NCLS²) with no
enumeration. More edges means more reachability means fewer kills, so a superset can only fail to
kill, never kill wrongly — sound by construction. The exact filter then runs in the solver on the
survivors. Worth doing for palettes where the kill rate is high; on isotoxal it buys ~56%.

## Recommendation

1. **Runtime table loading.** Removes the compile wall for every palette at once. Do this first.
2. **The convex-complete fallback `isotoxal-cxfull-z24` is the reachable target** — projected ~1.2M
   configs, ~400 MB `.inc` under the current scheme (marginal), comfortably fine with runtime
   loading. It fixes the derivable half of the completeness gap: all 12 convex isotoxal tiles.
3. **The full 42-star isotoxal palette is out of reach on this engine** and will stay so until the
   alphabet stops being a compiled artefact AND generation is pruned. Do not spend more on it as a
   compile-time table.
4. Whatever happens, **the shipped isotoxal/mixed shelves should be labelled as a sub-sampling** —
   15 of 42 star species on a set known not to be closed, and 9 of 12 convex tiles.
