# The star solver's inner loop rescans the whole alphabet to skip it (2026-08-06)

Asked whether there is a clever insight to make the star search faster. Probed the hot loop before
proposing anything, and the answer was sitting in the counters.

## What the probe measured

Instrumented copy of `eu_solver.cpp` (counters only), star24full, k=1, uncapped:

```
scanned=8,161,133,346   materialized=30,546,326
reps=244,391,580        mirror_ok=244,252,808   checkpart_pass=90,459
```

**99.6% of all loop trips are pure skip.** The extension loop runs `for gr = vertype[0]; gr < symbolcount`
over all 60,927 vertex types. Once `kcnt == maxnum` the guard `if (mainlist[gr].counting) { if (!canK)
continue; }` rejects every one of the 60,623 counting types, one at a time, at every node on the k
frontier. Only 304 types are noncounting and can still be added there.

Two smaller findings from the same numbers: the mirror test filters nothing (244,252,808 of
244,391,580 pass, 99.94%), and `checkpart` accepts 90,459 of 244M rep attempts — 0.037%.

## Fix A — walk the noncounting index, not the alphabet

Five lines: build `NC_IDX`, the ascending indices of noncounting types, once at startup; when the k
budget is spent, drive the loop from `NC_IDX` (lower-bounded at `vertype[0]`) instead of the full
range. `NC_IDX` is ascending, so the same types are visited in the same order and emission order is
untouched — which is why the digests match exactly, not just the counts.

```
scanned=30,546,326   materialized=30,546,326      (was 8,161,133,346)
```

Zero wasted trips remain: every candidate the loop visits is one it tries.

## Timing, and a correction

Counter-free builds of both, interleaved, on a quiet-ish machine (2 solver shards + a runaway
`duetexpertd` busy):

| | user |
|---|---|
| baseline | 12.27 s, 12.10 s |
| fix A | 5.04 s, 5.08 s |

**2.4x at k=1.** An earlier reading of 3.2–4.9x was taken with 8 slots busy and is an artifact: the
baseline's 8 billion iterations are far more exposed to memory pressure than fix A's 30 million, so
contention inflates the ratio. Both binaries are stable to <1.5% in the clean run.

⚑ **267x fewer loop trips buys only 2.4x**, and that is the useful lesson. The skipped iterations were
nearly free — increment, well-predicted branch, no memory traffic. The remaining cost is the 30.5M
vertex materializations (six `push_back` loops each, then `resize` to undo) and the 244M `checkpart`
walks. That is where the next win has to come from.

## Correctness

| catalog | digest | blocks |
|---|---|---|
| star24full k=1, baseline and fix A | `cc1a4e57bde39378` | 44 (50 raw) |
| regular k<=6, baseline and fix A | `884968dca36a6c41` | 1247 |

The regular palette is untouched by construction: with no noncounting types, `nc_only` requires `canK`
false, which requires `canNC` true, which requires noncounting types to exist. The branch is
unreachable there.

## Next

**Fix B — index candidates by corner class.** 244M rep attempts for 90,459 `checkpart` passes means a
cheap necessary condition is being checked far too late. `checkpart` reads the required class as
`expect = conf.lvert[rfree]`; bucketing the alphabet by (corner class, mirroredness) at startup would
reject most candidates before the vertex is materialized at all. The palette has 90 corner classes.

**Fix C — the non-adjacency lemma in the search.** Two valence-2 vertices cannot be adjacent (proved
2026-08-06). Nothing in the solver knows this; once a dent-fill vertex is placed, both neighbouring
slots could refuse all 304 noncounting types immediately.

⚑ Timing environment: `/usr/libexec/duetexpertd` was pinned at 99.9% CPU for over four hours today.
Every wall-clock number taken in that window is suspect, including the pooled-vs-static k=2
comparison, which is not salvageable as a controlled experiment and needs re-running on a quiet box.
