# Four fixes to the star solver's inner loop (2026-08-06)

All four are local optimisations. No mathematics changed, and every catalog is identical.

## What each one is

**Fix 1 — don't rescan the alphabet to skip it.** Once `kcnt == maxnum`, only noncounting types can
still be added (304 of 60,927 in star24full), but the loop walked all 60,927 to `continue` past the
rest. Keep the noncounting indices in a sorted list and walk that instead.

**Fix 2 — index candidates by corner class.** `checkpart` walks a face across a glue (x,y) and demands
`lvert[rneig[y]] in {NEXT,PREV}[lvert[x]]` both ways. That is two O(1) class equalities knowable
before the vertex is built, but the solver was discovering them by constructing the vertex, gluing it,
walking every face and throwing it away. Bucket every (type, rep) by (class at the rep, class at its
right neighbour, mirroredness); look up (NEXT[b], NEXT[a], mirrored).

**Fix 3 — bucket (type, rep), not type.** Fix 2 admitted a whole type if any of its ~12 reps matched,
then tried them all: 6,691,818 reps iterated against 724,811 that can match, 89.2% waste.

**Fix 4 — incremental `checkpart`.** The parent configuration already passed, and gluing one edge can
only change the faces whose walk reaches it. Step backwards from the changed positions
(`free -> lneig[glue[free]]`) to find those starts and check only them, instead of walking a face from
every dart in the object.

## Timings, single core, user seconds

k=1 (mean of 3 reps x 5 runs):

| | time | step | cumulative |
|---|---|---|---|
| baseline | 10.05 | | |
| + fix 1 | 4.69 | 2.14x | 2.1x |
| + fix 2 | 0.086 | 55x | 117x |
| + fix 3 | 0.083 | 1.04x | 121x |
| + fix 4 | 0.081 | 1.02x | 124x |

k=2 (mean of 2 interleaved reps):

| | time | step | cumulative |
|---|---|---|---|
| pre-fix | ~56,990 (see caveat) | | |
| fixes 1+2 | 103.5 | | ~550x |
| + fix 3 | 91.5 | 1.13x | ~620x |
| + fix 4 | 79.1 | 1.16x | ~720x |

⚑ The pre-fix k=2 number is the sum of 200 shard wall-times from the pooled run, measured while the
machine was contended (a runaway `duetexpertd` held a core for four hours). An independent measurement
put the contention factor at 2.4x, so the true single-core pre-fix cost is somewhere in
25,000-57,000 s and the cumulative speedup is between roughly 300x and 720x. Nobody has run the
unfixed solver single-core at k=2 on a quiet machine and nobody should — it is hours.

Regular palette, k<=6: baseline 0.65 s, fix 2 0.46 s, fix 3 0.46 s, fix 4 0.34 s.

## Correctness

Every variant, every k, order-insensitive digests:

| catalog | digest | blocks |
|---|---|---|
| star24full k=1 | `cc1a4e57bde39378` | 44 (50 raw) |
| star24full k=2 | `0b6cb12bb7f5f797` | 118 (146 raw) |
| regular k<=6 | `884968dca36a6c41` | 1247 |

Stronger than the digests: `checkpart_pass` is 90,459 at k=1 for the baseline and for every fix. The
filters only ever remove candidates, and the number that succeed never moves, so nothing that would
have passed was skipped.

## The lesson, which cost two wrong predictions

**Counting wasted work overestimates the payoff every time.** Fix 1 removed 99.6% of loop trips and
bought 2.1x. Fix 3 removed 89% of rep attempts and bought 1.13x. Both times the removed work was
cheap — a branch, or a `checkpart` call that exits on its first comparison. Fix 2 was the exception
because what it removed was expensive: building a vertex, gluing it, and walking every face.

Before optimising, measure what the removed work COSTS, not how much of it there is.

## Where fix 4 should pay better

1.16x at star k=2 but 1.35x at regular k<=6, and the difference is configuration size: the old
`checkpart` cost scales with the number of darts in the object, the new one with chain length. k=2
objects are small. The gain should grow with k, which is where it is needed.

## Not implemented

The non-adjacency lemma (two valence-2 vertices cannot be adjacent) is already enforced implicitly by
fix 2 — instrumented across the whole k=2 search, the solver tries that pairing zero times out of 1.8
billion rep attempts. An explicit check would be dead code.

Symbolic alpha remains the one structural idea: collapse `6*1 ... 6*7` into one species with a free
parameter, cutting the alphabet ~7x and making families first-class output instead of snapshots to be
reassembled afterwards.

---

## Fixes 5 and 6: outside the search loop (2026-08-07)

Asked whether anything else in the solver could be sped up. Profiled the parts that are not the
candidate loop, and the biggest single win since fix 2 was there.

**Fix 5a — `edgelabel` took its base string BY VALUE.** One `std::string` copy per dart per
materialisation, ~1.8e9 at k=2. Changed to `const&`. Worth **1.03x**. The copies were cheap.

**Fix 5b — `writecycle`'s seen-set was a vector + linear `std::find`.** `writecycle` runs once per node
(102.7M times at k=2) to compute `mincycle`, which picks the next dart to glue. Its "already visited"
set was a `std::vector<int>` searched linearly inside a loop over every dart: O(darts^2) plus a fresh
heap allocation, per node. Replaced with a stamp array. Worth **1.54x** — and this is bookkeeping, not
search.

**Fix 6 — generation stamp + hoisted string in the same function.** Removes the per-call O(darts)
`std::fill` (3.1e9 writes) and the per-dart `std::string` construction (3.1e9 of them). Worth
**1.02x**. Both were already nearly free.

**Measured and NOT implemented: the completeness scan.** `std::find(glue, -1)` runs 102,687,377 times
but averages **1.66 iterations** before short-circuiting. A maintained free-dart counter would save
nothing. Third time today that measuring killed a plausible optimisation.

### k=2 single core, user seconds

| | time | step |
|---|---|---|
| fixes 1+2 | 103.5 | |
| + fix 3 | 91.5 | 1.13x |
| + fix 4 | 79.1 | 1.16x |
| + fix 5 | 50.1 | 1.58x |
| + fix 6 | 49.0 | 1.02x |

2.11x from fixes 3-6 together. Regular palette k<=6: 0.65 s baseline -> 0.25 s, 2.6x.

All gates green at every step: star24full k=1 `cc1a4e57bde39378` (44), k=2 `0b6cb12bb7f5f797` (118),
regular k<=6 `884968dca36a6c41` (1247).

### What is left

`writecycle` still touches 3.13 BILLION darts across 102.7M calls at k=2 — it re-derives `mincycle`
from scratch at every node. That is now the dominant cost and the only large target left, but it is a
redesign rather than a patch: `mincycle` is a global minimum over all chains, so making it incremental
needs a maintained min-structure, not a local fix like fix 4's.

---

## Fixes 7-9: data structures, memory, and the call site nobody filtered (2026-08-07)

AL asked to push on low-level data handling and on algorithmic methods (memoisation, hashing).

### Memoisation is impossible, and that is now measured

Fingerprinted every DFS node on (vertype sequence, glue array), 2^27 open-addressed table:

    nodes=102,747,186   distinct=102,700,438   repeats=0

**Zero repeats.** (The 46,748 "overflows" are linear-probe saturation at 77% load, not collisions.)
The search is a genuine tree, not a DAG: the min-type-root invariant plus the deterministic
most-constrained-edge choice of `firstfree` give every reachable state exactly one path. Nothing to
memoise, nothing to cache. Do not revisit this.

### Fix 7b — labels as packed ints

`edgelabel` still BUILT a string per dart per materialisation (concatenation + `std::to_string`),
~1.8e9 times at k=2. Double-call measurement put it at **15 s of a 50 s run, 30%**. Replaced with a
packed int (interned base id * 4096 + tile), rendered to text only on output paths; the one hot read
(`label[0] == '*'`) became a lookup on the interned base. **1.38x.**

⚑ First attempt was 26% SLOWER: the interning `std::map` lookup sat in the hot loop, so every
materialisation did a red-black-tree descent with string comparison — more expensive than the string
it replaced. Interning must happen once at startup into a `[type][dart]` table.

### Fix 8 — stop using push_back in the hot path

6 `push_back` per dart x ~12 darts x 147M materialisations = **10.6e9 capacity-checked appends**.
Replaced with one sized `resize` per array then raw-pointer stores. Capacity persists across the DFS
because teardown shrinks with `resize()`, so the grow almost never reallocates. **1.50x.**

### Fix 9 — the second call site had no filter at all

Instrumenting `checkpart_inc` showed **2,484,356,059 calls** at k=2 — far more than the candidate loop
can account for. There are TWO call sites and fixes 2/3 only filtered the add-a-vertex one. The other,
gluing `firstfree` to an existing free dart, loops over every dart of every node and had no test: it
was calling `checkpart_inc` billions of times to reject gluings that the SAME two class equalities
rule out in two comparisons. Hoisted them (loop-invariant `a_cls`/`b_cls`). **1.43x.**

Also measured there: duplicate face starts within a call are 0.36%, so there is no redundancy to
dedupe; 4.0e9 faces over 8.2e9 walk steps, 2.06 steps per face.

### k=2 single core, user seconds

| | time | step |
|---|---|---|
| fixes 1+2 | 103.5 | |
| + fix 3 | 91.5 | 1.13x |
| + fix 4 | 79.1 | 1.16x |
| + fix 5 | 50.1 | 1.58x |
| + fix 6 | 49.0 | 1.02x |
| + fix 7b | 35.6 | 1.38x |
| + fix 8 | 23.8 | 1.50x |
| + fix 9 | 16.6 | 1.43x |

**6.2x from fixes 3-9.** Regular palette k<=6: 0.65 s baseline -> 0.19 s, 3.4x.
All gates green throughout: star24full k=1 `cc1a4e57bde39378` (44), k=2 `0b6cb12bb7f5f797` (118),
regular k<=6 `884968dca36a6c41` (1247).

### Profile after fix 8 (before fix 9), for whoever picks this up

`checkpart_inc` 8.5 s of 23.4 (36%), `writecycle` 4.1 s (18%), everything else 10.8 s (46%). Fix 9
attacked the first by removing calls. The remaining structural idea for `checkpart` is co-locating
`lvert` and `glue` in one array, since the face walk reads both at the same index — expected ~1.1x,
against a broad refactor. Incremental `writecycle` is NOT worth it: measured at 10% of runtime, so
perfect elimination caps at 1.11x.
