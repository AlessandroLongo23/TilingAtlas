# The star combinatorial search: 4x to 25x, and the wall moves — 2026-08-22

AL: *"optimize as much as possible the STAR combinatorial search … every time you gain some
optimizations, even if you think that's enough, keep pushing."*

The previous session sized star-wide k=3 and stopped: ~7.5M blocks, ~16.5 h of develop for the cheap
96% of buckets, and 148 large buckets whose solve alone looked open-ended — b00000 ran nine minutes
without finishing and emitted 569 MB. Both halves of that estimate were wrong, in opposite
directions, and the reason is worth more than the numbers.

## Where the time actually was

`sample` on star-wide bucket b00002 at k<=3 (4,098,851 nodes, 187,522 solutions):

| | share of runtime |
|---|---|
| `vertypesolvedadd` — memmove + vector assign + memcmp | **64%** |
| everything else in the search | 36% |

The search was not the cost. **Emitting the answers was**, and superlinearly. `vertypesolvedadd`
numbers the `.tes` files, and it did that by walking every vertex-type signature seen so far and
COPYING each alphabet-sized occurrence vector before comparing it: O(solutions x signatures x
alphabet). Every previous optimisation pass on this solver measured on star24full, where a whole k=2
run emits 146 blocks. A star-wide bucket emits up to 1,076,011, and in that regime this one term is
the program.

## The fixes, each measured, all output byte-identical

**Solver** (`eu_solver.cpp`)

| | | b00002, streamed |
|---|---|---|
| `vertypesolvedadd` | hash the sorted vertype; the alphabet-sized vector is not needed at all | 8.31s -> 3.44s |
| `writecyclefinal` | `std::find` over a growing vector inside a loop over darts — the O(n^2) fix 5 removed from `writecycle` and left here as "output only" — plus a temporary chain per dart | 3.44s -> 2.72s |
| `writeconway`, `label_str`, the two signatures | same treatment, plus a rendered-label cache | ~0 here; real on big alphabets |
| `simplify_inner` | four allocations per call and one per refinement round, a loop-invariant seed recomputed each round, and a sort where a hash does | 18.2% -> 5.8% of profile |
| `writesolution` | opened AND CLOSED a file per solution: 3.0s of *system* time on one bucket | file path 6.91s -> 3.46s |
| `checkpart_inc` | the four changed positions share a face chain, so the backward walks repeated each other | 1.08x |
| `EU_NOCYCLES` | opt-in: stop writing face-cycle text nothing reads | 710 -> 267 bytes/block |

**Pruner** (`eu_pruner.cpp`, `ctrnact_decode.hpp`, `pruner.py`)

`buildvertextypes` resolved each vertex token with a linear `std::find` over `symbollist` — 50,229
string compares per token per block. 64% of the pruner by `sample`, plus most of the 21% in memcmp.
**8.31s -> 2.70s** on b00002, every pruned file byte-identical. `pruner.py` had the identical bug in
Python (`symbollist.index(sym)`), and `develop_spherical` calls it six times per k=3 block.

**Solver, interleaved min-of-4, streamed:**

```
bucket    baseline   now
b00002      7.55 s   1.77 s
b00006      0.107    0.055
b00010      0.070    0.039
b00000    133.74 s   5.36 s     <- the bucket that "would not finish"
```

**The speedup scales with how many solutions a bucket emits**, which is exactly what a star search
does: 4.3x on b00002 with 187,522 solutions, 25x on b00000 with 1,076,011.

## The bug the gates caught

`label_str` returns a reference into a cache, and `writeconway` holds the first label across the call
that produces the second. With a `std::vector` backing store the second call's growth MOVES the
strings, and the held reference reads freed memory. One character, in one block, of one k=4 family:
`(1 1')` printed as `( 1')`. Every star bucket hash still matched — those had warmed the row already
— and `make check-regular` is what found it. `std::deque` guarantees references to existing elements
survive insertion at either end; that is the fix.

Also fixed while in there: every generation-stamp counter was 32-bit and one of them is bumped
2.48e9 times in a single star24full k=2 run. On a wrap a stale stamp reads as current, a face check
is skipped, and a tiling is lost silently. One compare per call buys it back.

## Memory, not speed — the distinction that mattered

`processfile` slurped the whole raw block file into a `vector<string>`. Streaming it instead is the
same wall clock on b00000's 749 MB file (38.8s vs 40.2s, noise) but takes peak RSS from **2.41 GB to
0.67 GB**. Ten pruners run at once under `--workers 10`, so the old version wanted 24 GB on a 24 GB
machine: the first full k=3 run's twenty-minute stragglers were pruners thrashing, not computing.

## Gates

`check-regular` (byte-identical vs golden), `check-star` all four claims, `check-deltahedra` all eight
convex deltahedra, and star24full k<=1/2/3/4 reproducing `cc1a4e57bde39378` / `0b6cb12bb7f5f797` /
`de09102dc86ded53` / `0d6c89a535a16ad8` at 44 / 118 / 287 / 678. `run_k2_buckets.py --workers 6`
reproduces the star-ico-d k=2 golden exactly, as `--workers 1` does.

## What did NOT pay, measured

**Piping solver into pruner** to keep raw blocks off disk. It is *slower*: 20.5s against the file
path's 10.3s on the same bucket, because eu_pruner's stream mode costs 19.3s where its file mode
costs 8.3s on identical input. `sync_with_stdio(false)` plus untying `cin` changed that by **exactly
nothing**, so the stdio tie is not the reason and the reason is still unknown. Not on the production
path, so not chased. (The same call in the solver is worth 1.07x and is kept.)

**Quotient Euler characteristic as a pre-filter.** The tempting cheap kill: only 30.7% of k=2 blocks
have chi = 2. It is WRONG. The eleven realized k=2 records have chi in {0, 1, 2}, and three of the
k=2 star solids come out at chi = -10, -10 and -6. A chi = 2 gate would have deleted them. Measured
before building, which is the only reason it cost nothing.

**A single-walk `checkpart_inc`.** The backward walk calls `checkface` at every position and
`checkface` walks forward from each, so the chain costs O(m^2): 317M steps against 57M calls. An O(m)
version has to reproduce `checkface`'s per-start direction lock exactly, and the case where
`CLASS_NEXT` and `CLASS_PREV` coincide at one dart and diverge later does not obviously collapse.
Worth ~12%, and a subtle error there loses tilings silently. Analysed and declined; the cheap
half — skipping starts another position already covered — is in.

## The whole star-wide k=3 search, end to end

```
3902 rho buckets, solve + prune, 10 workers          359 s
pruned k=3 blocks                             40,487,641
slowest single bucket (b00118)                   223.9 s
merged output                                       10 GB
```

**Six minutes.** The estimate carried into this session was multi-day, with 148 buckets whose solve
"looked open-ended". Both halves of that estimate were wrong: the solve was overestimated by orders of
magnitude (the quadratic emission term, now gone) and the BLOCK COUNT was underestimated more than
5x — 40.5M against the ~7.5M extrapolated from 200 singleton buckets.

Three independent runs (before NOCYCLES, with NOCYCLES, and with the six-round fingerprint) agree
block-for-block at every logged checkpoint: 965,533 / 2,109,627 / 3,037,322 / 5,228,688 / 9,640,661 /
15,665,544 …, which is the evidence that none of these changes moved the catalogue.

## The lesson, and it is not the same one as last time

`docs/ctrnact-solver-optimizations.md` ends with "measure what the work COSTS, not how much of it
there is." That still holds. The one this pass adds is narrower and cost more:

> **A profile is a statement about a workload, not about a program.**

Every one of the nine earlier fixes is still right. They were measured on star24full, where a whole
k=2 run emits 146 blocks and the emission path is free. Move to a palette where one bucket emits
1,076,011 and a term that never appeared in any profile becomes 64% of the program. Nothing regressed;
the workload moved three orders of magnitude and nobody re-profiled.

## Where the wall is now: develop, and precisely why

Random 400 of the k=2 star-wide blocks, developed single-process:

```
400 blocks in 20.1 s        19.9 blocks/s, 50.2 ms/block
flood fills            1700
  hit the 1500 guard   1696
  closed                  4
records                   0
```

**The developer's entire cost is the cost of failing.** Not rho solving, not the retrograde subsets:
1,696 of 1,700 flood fills run all the way to the 1500-instance guard.

⚑ **The guard is a completeness knob, not a speed dial.** The eleven realized k=2 records close at
20, 40, 48, 50, 84, 96, 96, 96, 96, 144 and 144 dart instances — but the shipped k=1 shelf holds V=120
solids, whose fills are several hundred, so the real headroom over the largest realizable case is
about 2x. Lowering it to "1696 of 1700 fail before 200 anyway" is exactly the trap.

What is available instead: a failing fill is 1500 iterations of two numpy 3x3 matmuls and two hashed
keys at ~8 us each, and **none of that arithmetic needs to be bit-exact** — only fills that SUCCEED
produce shipped coordinates. A fast pass that decides closure, falling back to the exact path when it
closes or when a key lands near a rounding boundary, is the same shape as the batched Newton that
gave `develop_euclid` its 120x. That is the next piece of work and it is the developer, not the
search.

**Sized on the real k=3 blocks.** 150 sampled from the 40,487,641: **28.3 ms each, 916 of 916 flood
fills hitting the guard, zero records.** The whole set is therefore **318 CPU-hours**, and this box
gets about 4x effective parallelism from ten workers, so **roughly three and a half days**.

So: the search for star-wide k=3 is ready and takes six minutes. Developing what it found is not
ready. That is the honest state, and the ratio between the two is the argument for doing the
developer next.

## One more, found after the first full k=3 run: the fingerprint was too weak for star blocks

`sample` on the pruner over b00000's 1,076,011 k=3 blocks put `compareToSeen` at **46%** — not because
the buckets were huge (median 1) but because each miss costs an exact relation refinement over the
disjoint union of two graphs, about 8 us. The fingerprint is a Weisfeiler-Leman hash and it ran
**three** rounds, which is enough on the regular palette (the code's own note records mean bucket 6.3,
max 400 at k=13) and is not enough on star blocks:

```
WL rounds   distinct keys   max bucket   comparisons
    3          436,089          168       2,368,755
    6          586,836           16         518,313      <- 4.6x fewer
```

Same 597,760 kept either way, and the pruned files are byte-identical — more WL rounds refine an
isomorphism invariant, so isomorphic graphs still collide and no verdict can move. The three extra
passes are over a colour array that `sample` puts at 1.3% of the run. `check-regular` stays
byte-identical, which is the test that this did not disturb the Euclidean catalogue.

## Where the search floor is, and one thing left on the table deliberately

The whole run is 359 s and **one bucket is 224 s of it**: b00118, whose solve is only 10.7 s and whose
pruner is the other 101 s alone (213 s under ten-way contention). 99% of its 3,853,279 blocks sit in a
single family, so parallelising the pruner across families buys nothing there.

Sharding the pruner by `hash(signatureline)` WOULD work and is sound — a duplicate pair always shares
its signature, so an isomorphism class is always decided inside one shard, and the first-seen
representative per class does not move. It would take the run to roughly 150 s. **Not built**, because
the stage after it is three and a half days: two more minutes off a six-minute search is not worth a
change that reorders the emitted blocks (the same caveat depth-2 sharding carries — it changes the
catalogue TEXT, not the tiling set).

⚑ **The pruner's `simplify` rejected 0 of 3,836,914 blocks** on b00118. It cannot fire on eu_solver
output, because `simplify_inner` already ran the same minimality test at every closure — so it is
about 10% of the pruner spent on a check that has never once disagreed. **Kept on purpose.** It is an
independent implementation (bitset relation refinement against the solver's Moore partition
refinement) of the test that once deleted every 2-orbit deltahedron, and the pruner also reads output
from `pruner.py` and from Marek's solvers, which do not run it. If someone ever wants that 10%, this
is the measurement to start from — and the reason not to.

## The flood-fill guard was not a valid bound at k=3 (found while sizing the run)

`develop_sphere` cut the fill off at a hardcoded **1500 instances**. The fill returns `ninst = 2E`
exactly — verified on all eleven realized star-wide k=2 records against the sum of their face-ring
lengths — so that constant is a cap of **E ≤ 750**, and it is derived from nothing.

It is bounded properly by the point groups. Every vertex orbit of the developed solid is a single
G-orbit on S², so it holds at most |G| points; a rotation of G fixes an axis through a vertex, an edge
midpoint or a face centre, so its order divides a valence, or 2, or a face size; the finite subgroups
of O(3) are the polyhedral ones (≤ 120) and the axial families C_n, C_nh, C_nv, S_2n, D_n, D_nd, D_nh
(≤ 4n). Hence

> `2E = Σ_v valence(v) = Σ_orbits |orbit|·valence ≤ max(120, 4·maxrot) · Σ_orbits valence`

computable from the block's own vertex words. Checked against all eleven k=2 records (bounds 840–1080,
actual 20–144).

⚑ **star-wide allows valence 6, so a three-orbit block bounds at 120·(6+6+6) = 2160, and every one of
150 sampled k=3 blocks bounds there.** At 1500 the developer would have rejected any k=3 solid with
more than 750 edges as "did not close" — a lost tiling with no symptom. Whether one exists in that
window is exactly what the run is for, so the run could not have claimed completeness.

It is also **tighter than 1500 where that matters more**, because a failing fill runs to the guard and
failing is nearly all of the work:

```
                        guard      ms/block     (400 k=2 blocks, seed 1)
constant                 1500        50.2
derived                840-1080      21.1        2.4x
                        guard      ms/block     (150 k=3 blocks)
constant                 1500        28.3        <- incomplete
derived                  2160        39.6        <- correct
```

Records bit-identical: same nine ids, **max vertex coordinate difference 0**, same rho. `check-star`
all four, `check-deltahedra` pass.

**Corrected size for star-wide k=3 develop: 40,487,641 × 39.6 ms = 445 CPU-hours**, about four and a
half days at this machine's ~4x effective parallelism. The earlier 318 CPU-hours was measuring an
unsound guard.

⚑ **The constant was safe up to k=2 and breaks at exactly k=3.** star-wide's `maxValence` is 6, so the
worst case is 120·k·6: 720 at k=1, 1440 at k=2, **2160 at k=3**, 2880 at k=4. The shipped shelf — 52
k=1 and 37 k=2 solids — was never at risk; k=3 is the first depth where the constant stops being a
bound at all.

## Pushing past six minutes: two more levers, both measured, both capped

**Sharding the pruner (built, exact, off by default).** `compareToSeen` only compares blocks whose
full key — `keyOf(signatureline, fingerprint)` — matches, so partitioning the input by a hash of that
key is exact. `EU_SIGSHARD_N`/`EU_SIGSHARD_W` do it, and eight shards on b00118 reproduce the serial
903,188 blocks as an exact multiset.

⚑ **Sharding on the SIGNATURE alone does not work**, which is worth recording because it is the
obvious thing to try. b00118's dominant family is 3,813,645 blocks over just **189** distinct signature
lines, the heaviest 16.7% of them. Hashing 189 weights into 8 bins put 29–52% on one shard. Replacing
the hash with a count-weighted longest-processing-time assignment balanced the *counts* and barely
moved the clock — 48.4 s → 44.5 s — because cost is superlinear in signature size: the shard holding
the biggest signature ran **39.8 s while the other seven ran 6.5–10.4 s**. The full key splits the
same file into ~587,000 buckets and needs no plan at all.

Its ceiling is the decode. A shard cannot know a block's key without decoding and fingerprinting it,
so that work happens in every shard: measured at **23.5 s of the 86.8 s serial run** (a shard owning
nothing takes 23.5 s). The floor is therefore 23.5 + 63.3/N, i.e. **3.7× however many shards you
throw at it**, and eight shards delivered 1.6× (86.8 s → 53.4 s).

**And end to end it is a LOSS.** The whole run:

```
--workers 10                        359 s     40,487,641 blocks
--workers 10 --prune-shards 6       518 s     40,487,641 blocks
```

b00118 does improve, 224 s → 148 s. But the bucket pool already saturates ten cores, so every shard
process is taken from another bucket: b03719 went 84 s → 177 s and the rest with it. **Off by
default**, kept behind the flag for a machine with cores to spare.

**What the search is bound by now.** Not the algorithm — packing. Total prune CPU divided by ten
workers is around 250 s against the 359 s observed, and the gap is that the expensive buckets are
dispatched in bucket order while their cost is not predictable from anything known at slice time
(b03719 has two words and two multisets and takes 84 s; b00000 has 134 words and takes 5.4 s). Closing
it needs a two-phase runner — solve everything first, then prune longest-first on measured raw size —
at the cost of holding every bucket's raw blocks on disk at once. About 100 s, in front of a stage
that is four and a half days.

## The dedup is a canonical form now, and that is the last big one

With the six-round fingerprint in, `compareToSeen` was still **46%** of the pruner on b00118 — not
because buckets are big (median 1) but because 76% of that bucket's blocks are duplicates and each
needs one exact relation refinement over the disjoint union of two graphs, ~5.5 µs. 3,836,914 calls,
7,252,663 comparisons.

A connected map's isomorphisms are pinned by the image of ONE dart: rneig, lneig, mirro and glue act
transitively, so `d0 → 0` determines the whole bijection. Relabel by BFS in a fixed generator order,
emit (images, cls, fam) per dart, take the lexicographic minimum over admissible starts — two blocks
are isomorphic exactly when their codes match, and dedup becomes a set insertion.

⚑ **The obvious version is a pessimisation.** Trying every dart as a start costs **15.1 µs per block**,
more than the 10.4 µs per block that pairwise comparison already cost there. Restricting starts to the
smallest WL colour class — which the fingerprint already computes, and which is an isomorphism
invariant so it cannot change the minimum — takes it to **0.85 µs**. Twelve times cheaper, and the
difference between a loss and the biggest single win in the pruner.

```
b00118, 3,853,279 raw blocks -> 903,188 kept
  pairwise (EU_NOCANON=1)   92.8 s    peak RSS 0.85 GB
  canonical form            36.5 s    peak RSS 0.39 GB     2.5x, and less memory
```

Verified rather than argued: a `EU_CANON_VERIFY` mode runs both and counts disagreements —
**0 over 3,836,914 blocks**, same 903,188 kept, pruned files byte-identical. The code is stored
exactly (one byte per entry, ~240 bytes per kept block against the ~400 the solution store held), not
hashed, so there is no collision argument to make. Connectedness is the assumption the construction
rests on; an unreached dart returns an empty code and falls back to the pairwise test.

**Whole star-wide k=3 search: 295 s → 228 s**, same 40,487,641 blocks, worst bucket 224 s → 91.4 s.

## Where the search floor is, measured

From the per-bucket costs of a full run (`--cost-out`), simulating the scheduler:

```
total prune+solve CPU        2803 s
perfect packing over 10       280 s
LPT makespan                  280 s
bucket-order makespan         295 s   <- what the dynamic queue does
observed                      295 s
```

**The queue is within 5% of optimal**, so there is no scheduling headroom — the earlier guess that
packing was worth ~100 s was wrong, and the simulation is what says so. The run is CPU-bound, and the
only remaining direction is less work per block.

## And the test that never fires

With the canonical form in, `sample` put **`simplify()` at the top of the pruner** — and it had
already been measured rejecting **0 of 3,836,914 blocks**. It cannot fire on eu_solver output:
`simplify_inner` computes the same coarsest congruence at every closure and only emits when it is
trivial. `EU_SKIP_MINIMALITY` skips it; `run_k2_buckets.py` sets it, because that script produced the
blocks itself two lines earlier.

Two conditions keep it off by default. The pruner also reads `pruner.py` and Marek's solvers, which
run no such test. And ⚑ **this file does not model edge types at all** — its seed is `(cls, fam)`
where the solver's is `(cls·ETSPAN + etype, fam)` — so on an EDGE-TYPED palette the pruner's seed is
strictly coarser, its congruence can be nontrivial where the solver's was not, and the two tests are
genuinely different. star-wide declares no edge types, so there they coincide. (That asymmetry is
worth a separate look: a coarser seed rejects MORE, so on the edge-typed palettes — eu-half-*, fdsq,
tri45, the planigons — the pruner may be dropping blocks the solver correctly emitted. Unmeasured.)

If the assumption ever breaks the failure is loud, not silent: a non-minimal block survives, the
catalogue grows, and the goldens fail on the count.

## The ladder, end to end

```
star-wide bucket b00118 (3,853,279 raw -> 903,188 kept), pruner alone
  as committed this morning                 ~213 s
  + symbol index, 6 WL rounds                 92.8 s
  + canonical form                            36.5 s
  + skip the redundant minimality test        30.6 s      7x

whole star-wide k=3 search, 3902 buckets, 10 workers
  estimate carried into the session         multi-day
  after the emission and pruner fixes          295 s
  + canonical form                             228 s
  + skip minimality                            187 s
  worst bucket                          224 s -> 68.8 s
```

40,487,641 pruned blocks every time, across six independent full runs.
