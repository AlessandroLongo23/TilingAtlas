# Star-forcing the k-orbit search, and whether k=4 is reachable — 2026-08-22

Live log. Appended as measurements land. Machine: Apple M-series, 10 cores, 24 GB, shared with two
other agents; every run here uses `--workers 4`.

## 0. Setup

Binaries: `eu_solver_rt` rebuilt at **MAXNUM=3** (stamp `.maxnumrt-3`, 19:44), `eu_pruner.star-wide`
already current against `eu_pruner.cpp`. A second runtime solver at **MAXNUM=4** was compiled into the
scratchpad (`eu_solver_rt4`) so the k=3 baseline could keep running against the MAXNUM=3 binary — the
Makefile's stamp rule deletes `eu_solver_rt` whenever MAXNUM changes, and rebuilding it mid-run is
exactly the "bogus 0 blocks" trap.

## 1. Baseline: the full star-wide k=3 search, re-measured at --workers 4

```
[19:45:13] start                3902 buckets, 4 workers
[19:48:58] DONE                 40,487,641 pruned k=3 blocks in 220 s
total solve+prune CPU           850.2 s      (perfect packing over 4 = 212.6 s; observed 220 s)
slowest buckets    b03719 30.9s  b00118 20.9s  b03199 19.4s  b03737 16.9s  b03872 13.5s
merged pruned tree              10 GB, 2393 family files
```

40,487,641 is the exact figure the previous nine full runs agree on, so the MAXNUM=3 binary is the
right one and this run is a valid baseline. Note the CPU total has moved a long way since the
`--cost-out` file the last session left behind: **850 s now against 2803 s then**, because the pruner
got 21x faster and it was most of the old total.

## 2. Question 1(a) — is star-forcing sound?

**Yes, and the code says so more strongly than the argument does.**

The search never edits a vertex figure. `initex` seeds a configuration with one whole vertex-type
gadget copied out of `mainlist`, and the add-a-vertex branch in `extend` appends another whole gadget
(`newconf.vertype.push_back(gr)`), copying that type's `rneig/lneig/mirro/lvert/label/etype` arrays
verbatim. Gluing only ever writes `glue[]`, which pairs half-edges; it never touches `lvert` or the
tile assignment inside a gadget. So orbit j of an emitted block has exactly the face multiset of
`mainlist[vertype[j]]`, and a {5/2} face can only exist if some vertex type in the block carries {5/2}.
There is no gluing that manufactures a face nobody's vertex figure lists.

`slice_tables.multiset_of` reads that multiset off the SYMBOL, not off `cls`, which matters: an entry
is the quotient of its vertex under the word's own symmetry, so `(3,3,3,3,3)S5` materialises ONE
representative dart while its symbol still lists all five triangles. Checked on the whole palette:
58,682 entries, 0 unparsable symbols, 0 non-numeric tiles, 0 noncounting (dent-fill) entries, valences
3–6. So symbol-based star detection sees every face at every vertex.

What the filter loses is the all-convex solids. At k=3 the star-wide run found five of them (the
Johnson solids J63, J11, J19, J34, J80) — and `run-k3-spherical/cells-k3.json` holds exactly five
records with the same tile-family signatures (`03_35`, `03_35`, `03_348`, `03_35`, `03_345a`). They are
already enumerated on the convex shelf; the star run was rediscovering them.

**The empirical confirmation.** Every merged block file is named for the tile families in its blocks
(`eupruned_03_b00118_58q.txt`), so the star content of all 40.5M blocks can be read off the filenames:

```
                buckets      blocks      of which star-free
star-free           587   6,314,170       6,314,170  (100.00%)
all-star           3288  33,084,968               0  (  0.00%)
mixed                27   1,088,503         254,221  ( 23.36%)
```

A bucket with no star-bearing vertex type emitted no star-bearing block, and a bucket where every
vertex type is star-bearing emitted no star-free block. Both are what the argument predicts, on 40.5M
blocks, with no exceptions.

## 3. Question 1(b) — the prize, weighted by cost

```
                buckets   solve+prune CPU        pruned blocks
star-free           587    150.4 s  (17.69%)   6,314,170  (15.60%)
all-star           3288    684.2 s  (80.48%)  33,084,968  (81.72%)
mixed                27     15.6 s  ( 1.83%)   1,088,503  ( 2.69%)
```

Skipping the 587 star-free buckets is **17.7% of the search and 15.6% of develop**, for free.

Total star-free blocks anywhere are 6,568,391 = **16.22%**, so the bucket filter captures **96.1%** of
the whole available prize. The in-solver form — requiring a star-bearing type among the k — could add
at most 254,221 blocks, **0.63 percentage points**, all of it inside 27 buckets that are 1.8% of the
run. It is not worth a solver change, and I did not build it.

## 4. Question 1(c) — implemented, and validated by diff

`run_k2_buckets.py --require-star`. It reads the palette JSON, collects the tiles declared
`kind: "starpoly"`, and drops any bucket none of whose sliced vertex types carries one. Eleven lines,
no solver change.

### k=3, the strongest form of the check

```
                            blocks        wall (4 workers)   merged files
full                    40,487,641              220 s            2393
--require-star          34,173,471              213 s            1946
```

34,173,471 = 40,487,641 − 6,314,170, to the block. The 447 files that disappear are **all** from
star-free buckets (0 exceptions), and the 1946 that remain are **byte-for-byte identical** to the
baseline's copies — `shasum -a 256` over both trees, `diff` clean. The filtered search is not "close
to" the star part of the full search; it is exactly it.

⚑ The 213 s against 220 s is NOT the saving — the other agents on this box got busier between the two
runs. Measuring on the 3315 buckets both runs share: **699.8 CPU-s in the baseline, 815.8 CPU-s in the
filtered run, a 1.166x contention factor.** Corrected for it, the filtered run is 82.31% of the
baseline CPU, i.e. exactly the 17.69% the bucket accounting predicts.

### k=2, the certificate diff

```
full           422,879 blocks  ->  9 records
--require-star 351,302 blocks  ->  8 records
dropped: ctrnact-02_348-5hks_4bpk-1-d2_2-r4_18_1   (tiles 3,4,8 — all convex)
added:   none
```

One record goes and it is convex. Note the filter is CONSERVATIVE: three of the nine k=2 records are
all-convex and only one of them is lost, because the other two also come out of mixed buckets, which
`--require-star` keeps.

### ⚑ A discrepancy found on the way, and it is not mine

The fresh full k=2 run gives **422,879** blocks where the shipped `run-k2-star-wide/pruned` (Aug 20
10:39) holds **422,206**. Nothing is missing — 43 files gained blocks and 5 files are new, none lost.
The cause is commit `2885309` (Aug 21), "the search dropped every all-triangle polyhedron": the
minimality seed colour was the corner class, so configurations whose orbits differ only by vertex
figure were rejected as non-minimal. Post-fix the solver emits them. Ruled out as the cause:
`EU_SKIP_MINIMALITY` — re-pruning bucket b02923's raw blocks with and without it gives 646 either way.

The develop of those 673 extra blocks produces **no new solids**: the fresh full k=2 gives the same 9
distinct records the Aug-20 file does (that file has 11 rows for 9 ids; the duplicate collapse in
`finalise_records` has since tightened). So the shipped k=2 star shelf is not missing anything. The
stale block tree on disk is, and the 422,206 figure quoted in yesterday's notes is a pre-fix number.

## 5. VERDICT ON QUESTION 1: yes, with the honest size of it

Sound, implemented, validated. **17.7% off the search and 15.6% off develop.** On the current
pipeline that is 133 s → ~110 s of search and 19.6 min → ~16.5 min of develop; end to end ~22 min →
~18.5 min. It is worth the eleven lines because it is exact and free, and it matters much more at k=4
where both stages are hours. It is NOT a breakthrough and I am not going to dress it up as one.

The in-solver form is not worth building: it would add 0.63 percentage points.

---

# Part II — is k=4 reachable? (second agent, from 20:46)

Machine state at handover: four `verify_prefilter.py` processes from another agent are pinning four
cores, so every timing below is on a ~6-core budget and is a CPU-second figure unless it says wall.
Free disk at 20:46: **527 GB** on `/System/Volumes/Data` (the k=3 trees in this scratchpad are 21 GB
of that; the abandoned `k4-pipe.jsonl.work` from the previous agent, 2.6 GB, deleted).

## 6. What the first agent already measured at k=4, and what it leaves open

The k=4 sampling was run but never written up. Reconstructed from the scratchpad JSONL:

* **setA** — the 200 buckets that dominate k=3: 64.3% of the 850.2 s solve+prune CPU and **73.3% of
  the 40,487,641 pruned blocks**. All 200 are star buckets, so `--require-star` keeps every one.
* **setB** — 200 random buckets, disjoint from setA, also all star: 0.99% of cost, 0.55% of blocks.
* Shard sanity: `EU_SHARD_N=16, EU_SHARD_W=0` on setA at k=3 gives 3,981,737 raw against 67,848,358
  for the whole of setA, i.e. **×16 undercounts by 6.5%** (correction factor 1.065 applied below).
  The shard key is the configuration's minimum vertex type, an isomorphism invariant, so a shard is
  dedup-closed and a kept/raw ratio measured inside one is the real ratio.

RAW blocks and solve CPU, k=3 against k=4:

```
            k=3 raw       k=4 raw          growth   k=3 solve   k=4 solve   growth
setA     67,848,358   12.3e9 (×16, +6.5%)   181x       361 s     71,400 s    198x
setB        328,162   18,702,201             57x       4.9 s        290 s     59x
```

Nothing censored in either k=4 count run. What this does NOT yet give: the kept/raw prune ratio at
k=4, the prune CPU, the develop cost, or the disk. Those are what Part II measures.

## 7. k=4 solve+prune, measured — the random tail (setB, 200 buckets, unsharded)

`sample_k2.py` (new, in the scratchpad): the production per-bucket recipe (`EU_NOCYCLES=1`,
`EU_SKIP_MINIMALITY=1`, palette `eu_pruner.star-wide`) on an explicit bucket list, with a per-bucket
timeout, a free-disk guard, and raw/pruned BYTES recorded. `eu_solver_rt4` re-verified as MAXNUM=4
before use — its k-histogram on b03225 is {01:1, 02:2, 03:6, 04:60}, and rt3 stops at 03, rt2 at 02.

```
[20:50:31 -> 20:52:42, 5 workers]  setB, k=4, 200 buckets, nothing censored
raw blocks (file mode, all k)   19,034,605      (stream count of k=4 only: 18,702,201)
pruned k=4 blocks               10,002,148      kept/raw = 0.535
solve CPU                          230.5 s
prune CPU                           91.0 s      (28% of solve+prune)
raw bytes/block                        348 B    pruned bytes/block  352 B
raw written                           6.6 GB    pruned kept        3.5 GB
```

Against the same 200 buckets at k=3 (221,889 pruned blocks, 8.42 s of the baseline's solve+prune):

```
                        k=3          k=4        growth
pruned blocks       221,889   10,002,148        45.1x
solve+prune CPU        8.42 s     321.4 s       38.2x
dedup kept/raw         0.676        0.535
```

Two things worth having: **the growth in pruned blocks (45x) is below the growth in raw (57x)**,
because the pruner throws away a larger share at k=4; and **the pruner is no longer the bottleneck** —
28% of solve+prune at k=4 against roughly a third at k=3. The 21x pruner speedup moved the wall back
onto the solver.

## 8. k=4 on the head buckets (setA), and why the shard needs calibrating

`sample_k3.py` = the same harness plus `EU_SHARD_N/EU_SHARD_W` and a bounded merged output. The shard
key is the configuration's minimum vertex type (`eu_solver.cpp` line ~127), which `extend()` never
goes below, so a shard is dedup-closed and its kept/raw is a real ratio.

⚑ **Shard 0 is not 1/N of the work and its dedup ratio is not the global one.** Shard 0 always owns
root index 0, the largest subtree. Measured at k=3 on setA: shard 0/128 holds **5.35%** of setA's raw
(not 0.78%), and its kept/raw is **0.786** against **0.4375** for the whole of setA. Anyone reading a
single shard's ratio as the run's ratio is off by 1.8x. What survives calibration is the
*ratio of ratios* — kept growth over raw growth from k=3 to k=4 inside the SAME shard — which is
**0.937** over the 71 setA buckets that finished.

```
[20:52:47 -> 21:19, 5 workers, shard 0/128, k=4]  71 of 200 setA buckets before I stopped it
raw 118,594,700   kept 100,116,908   solve 787 s   prune 3,362 s
```

Two things came out of that run that matter more than the counts.

**The pruner is the bottleneck again at k=4, and part of that is the disk.** Prune was 81% of
solve+prune on the head buckets against 28% on the tail, and `ps` had the pruners sitting at 8–11%
CPU while five of them shared the SSD. The run was writing 52 GB of raw blocks at a time.

**The head buckets are enormous even at 1/128.** Single in-flight bucket directories reached 18 GB,
and the sample burned 66 GB of free space in eight minutes. I put a watchdog on it (kill at 180 GB
free) and stopped the run at 71/200 rather than let it chew through the disk for numbers I could get
another way — the full 200-bucket raw counts already exist at shard 1/16.

## 9. The projection

Estimator, in the order the numbers were taken:

1. setA raw growth, k=3 → k=4, measured **in the same shard (1/16) on all 200 buckets**: 3,981,737 →
   721,963,780 = **181.3x**.
2. Corrected to kept by the ratio-of-ratios above (0.937): **setA kept growth 169.9x**.
3. setA's k=3 kept is 29,680,713 → **k=4 ≈ 5.0e9**.
4. The tail (1,669 star buckets outside setA, 4,492,758 k=3 blocks) from setB's measured growth —
   45.1x flat, or a log-log fit of per-bucket growth on per-bucket size (R²=0.45) — gives
   1.9–2.0e8 either way, 4% of the total. The tail does not matter.

```
                            k=1        k=2         k=3           k=4 (projected)
pruned blocks, star-wide    ~4.4e3   422,879    40,487,641       6.3e9
growth per orbit                       96x          96x           156x
pruned blocks, --require-star           n/a    34,173,471         5.2e9
```

**The growth is accelerating, not constant.** 96x from k=1 to k=2, 96x from k=2 to k=3, and **156x**
from k=3 to k=4. Anyone extrapolating k=5 at 96x is out by a factor of 1.6 per orbit and climbing.

## 10. ⚑ THE DISK VERDICT: k=4 CANNOT BE MATERIALISED, and that changes the answer

Free space on this machine when I started: **566 GB** (`df` on `/System/Volumes/Data`; the task brief
said 568). Measured block sizes at k=4, from the sample runs: **348 B/raw block, 352 B/pruned block**.

```
                        blocks        on disk
k=4 raw (file mode)      ~1.2e10       4.1 TB
k=4 pruned tree           5.2e9        1.8 TB
free                                   0.57 TB
```

**A file-based k=4 run needs 4.1 TB of scratch and leaves a 1.8 TB catalogue on a disk with 0.57 TB
free. It is not "slow", it does not fit — by 7x on the scratch and 3x on the output.** Nothing about
buying more cores changes that. The pipeline has to stream, and streaming turns out to be both
available and, after one fix, faster than the file path. That is section 11.

The second half of the disk answer is that almost none of those blocks deserve to be written at all:
`eu_sphfill` rejects **99.973%** of them (40,476,751 of 40,487,641 at k=3). A pruner that piped kept
blocks into the prefilter instead of a file would land 5.2e9 × 0.00027 ≈ **1.4M blocks, about 0.5 GB**.
The pruner does not have that mode yet — even under `EU_STREAM` it writes kept blocks to
`pruned/eupruned_NN.txt` — and adding an `EU_PRUNED_STDOUT` plus a stdin reader on the develop side is
the one piece of work standing between "does not fit" and "fits with room to spare".

## 11. The optimisation that pays: the EU_STREAM fuse was broken, and now is not

`EU_STREAM=1 eu_solver | EU_STREAM=1 EU_KONLY=k eu_pruner` is documented in the oracle README as the
way to run a high k without landing raw blocks. `run_k2_buckets.py` does not use it. I measured why.

A/B on star-wide **b03228 at k=4, shard 0/128** — 1,991,043 blocks, 0.80 GB, 1,847,795 kept:

```
                                          wall      raw written   kept
file mode (what run_k2_buckets.py does)  27.80 s      0.80 GB     1,847,795
EU_STREAM fuse, BEFORE                   86.21 s      0            1,847,795   3.1x SLOWER
EU_STREAM fuse, AFTER                    17.72 s      0            1,847,795   1.58x FASTER
```

Two defects, both in `eu_pruner.cpp`, both found by taking the pipe out of the experiment (solver to
a FILE with `EU_STREAM`, pruner reading that file) so the slowdown could not be blamed on the pipe:

**The stream path was pre-optimisation code.** `processstream` still ran `keyOf` + `simplify` +
pairwise `compareToSeen` on every block, while `processfile` had moved to `refine_colours` + the
canonical form and to trusting the solver's minimality test under `EU_SKIP_MINIMALITY`. Porting the
file path's block verbatim: **80.99 s → 56.75 s**, same 1,847,795 kept.

**And then the real one: `std::cin`.** libc++ backs `std::cin` with `__stdinbuf`, which pulls one
character at a time through C stdio, and `sync_with_stdio(false)` does not change it — I added that
call first and it bought 4%. Reading fd 0 into a 1 MB buffer and splitting lines with `memchr`
(`FdLines` in `eu_pruner.cpp`) took the parse from **51.75 s to 3.01 s, 17x**, and the whole stream
prune from 56.75 s to **14.86 s**. `eu_solver` has had `sync_with_stdio(false)` on its write side
since the streaming work landed, with a comment saying exactly why; the pruner's matching read side
never got the equivalent. File mode uses `std::ifstream` and was never affected, which is why nine
full k=3 runs never showed it.

Gates: **`make check-regular` PASS** (byte-identical to `golden/regular-k6.sha256`, counts
10/20/61/151/332/673) and **`make check-star` PASS** (all four sub-gates: derived k=1, derived k=2,
rho-bucketed k=2 against the full k=2, shipped shelf against golden).

## 12. Optimisations tried that did NOT pay — with the numbers

* **`std::ios::sync_with_stdio(false)` alone.** 51.75 s → 48 s of parse. 4%. Kept anyway (it is one
  line and it is correct), but it is not the fix; the buffered fd reader is.
* **Shard-0 as a cheap stand-in for a bucket's dedup ratio.** Wrong by 1.8x — 0.786 against 0.4375 at
  k=3 on setA. Only the ratio-of-ratios between two k on the same shard survives. Recording this
  because it is an inviting shortcut and it silently overstates the catalogue by 80%.
* **Raising develop's `_PLAN_CAP` / making it an LRU.** The plan cache looked like the obvious target:
  96.5% of develop CPU at k=3 and 98.6% at k=4 is the miss that fills it (13.66 ms per miss at k=3,
  39.32 ms at k=4, the `MAXDENS^k` density tuples). But the cache never CLEARS in practice — the
  pruned files carry 728 blocks per distinct vertex-type line at k=3 and **521 at k=4**, so the miss
  amortises to 0.019 and 0.075 ms per block and a bigger cap has nothing to fix. My first
  measurement said 7.18 ms/block at k=4 and it was an artifact of sampling the first 20,000 blocks of
  each file, i.e. all cold-start. Not a bug in the code, a bug in my harness.
* **The in-solver star filter** (previous agent, section 3): 0.63 percentage points. Still not worth it.

## 13. What k=4 costs on this machine

Search, with the fused pipeline (so no raw on disk and no I/O stall). setA's k=4 solve CPU is measured
directly — the shard-1/16 streaming count run, 4,193 s, ×16 ×1.065 = **71,450 s** — and the pruner
rides at 0.86 of the solver from the b03228 fuse. The tail scales by setB's measured 38.2x on its
153.4 s of k=3 cost.

```
solve   setA         71,450 CPU-s
prune   setA         61,450 CPU-s
tail (1,669 star buckets)  5,859 CPU-s
                     ---------------
                    138,762 CPU-s = 38.5 CPU-hours
   6 workers  6.4 h wall      8 workers  4.8 h      10 workers  3.9 h
```

Develop. Per-block prefilter cost measured on real k=4 blocks against real k=3 blocks on the same
loaded machine: 0.1338 ms and 0.2274 ms all-in (marginal + amortised plan-cache miss), a ratio of
**1.70x**. Applying it to the k=3 full run's real 0.29 ms/block:

```
5.2e9 blocks x 0.49 ms = 712 CPU-hours = 29.7 CPU-days
   8 workers  3.7 days       10 workers  3.0 days
```

Disk, fused both ways (solver→pruner→prefilter): **~0.5 GB**, being the ~1.4M blocks the prefilter is
expected to pass. Disk, fused once (solver→pruner only): **1.8 TB**, which does not fit.

**The whole answer: about 5 hours of search and about 3.5 days of develop, 38.5 + 712 CPU-hours, on a
disk footprint of half a gigabyte — but only if the pruner learns to hand kept blocks to the
prefilter instead of to a file. Without that second fuse the run needs 1.8 TB it does not have.**

## 14. Yield, honestly

I cannot give you a k=4 solid count from a sample, and I want to be plain about why: the star shelf's
k=1/2/3 yields were 75/11/15 raw certificates (47/8/10 shelf-eligible) with no monotone trend to
extrapolate, and a 60,000-block sample of one shard of 200 buckets is not a basis for predicting a
count over 5.2e9 blocks. What the sample does say is that the *shape* of k=4 is the same as k=3: the
prefilter survival rate on k=4 blocks is 0.115% against 0.163% on k=3 blocks drawn the same way, so
the funnel is not collapsing and it is not opening up. At the k=3 full-run rejection rate of 99.973%
that is ~1.4M blocks reaching the exact developer at k=4, against 10,890 at k=3.

⚑ Low expected yield is NOT a reason to skip this. It is a reason to run it AFTER the second fuse
exists, because a 3.5-day develop that writes half a gigabyte is a weekend; a 3.5-day develop that
needs 1.8 TB of scratch is not runnable at all.

The one measurement I did run to the end: 60,000 k=4 blocks from the setA sample, prefiltered and then
developed exactly. **137 survivors, 0 realizations.** That is 0.001% of the projected corpus and
proves nothing about the total; I record it because it is the only k=4 develop that has ever been run.

## 15. `--fuse` landed in run_k2_buckets.py, with a caveat that matters

The fuse is now a flag on the bucket runner, off by default:

```sh
python3 run_k2_buckets.py --palette star-wide --buckets buckets-star-wide.json \
    --out run-k4-star-wide --k 4 --workers 8 --require-star --fuse
```

⚑ **Catalogue-equivalent, not byte-identical, and the flag's help says so.** The pruner keeps the
FIRST block of each isomorphism class it sees; the fuse hands it blocks in the solver's DFS order
where the file path hands them over family by family, so a class can come out represented by a
different member. Measured on 300 star-wide buckets at k=2: both paths give **26,444 distinct
blocks**, 25 of them differ in text, and feeding those 50 blocks back through the pruner collapses
them to exactly **25** — the same 25 tilings, different representatives. No golden may point at a
fused run's block text. The develop output of the two trees was also compared and is identical.

## 16. What is left, in the order it pays

1. **`EU_PRUNED_STDOUT` on the pruner and a stdin reader on `develop_spherical`.** This is the
   difference between 1.8 TB and 0.5 GB. Everything else in this note is arithmetic; this is the
   only thing that makes a k=4 run possible on this machine.
2. **Per-bucket solver sharding in `run_k2_buckets.py`.** `EU_SHARD_N/W` already exists and is exact.
   The wall clock of a k=4 run is not 38.5 CPU-hours over 8 cores, it is whatever the single worst
   bucket costs: b02242's shard 1/16 alone was 150 s of solve at k=4, so the whole bucket is ~40 min
   of solve on one core before its pruner starts. Splitting the top ~20 buckets across shards inside
   the bucket flattens that.
3. **Do not bother with an in-solver star filter, a bigger plan cache, or splitting the 27 mixed
   buckets.** All three measured, all three under one percent.

## 17. VERDICT ON k=4

**Reachable on compute, unreachable on disk as the pipeline stood this morning, and reachable on both
now that the fuse works.** The search is 38.5 CPU-hours — about 5 hours of wall clock on 8 of this
machine's 10 cores — and produces a projected **5.2e9 pruned blocks** under `--require-star`, 153x the
k=3 catalogue. Developing them is **712 CPU-hours, 3.7 days at 8 workers**, at a measured 1.70x the
per-block develop cost of k=3. The growth per orbit is **not** the 96x that k=1→2→3 showed; it is
**156x** at k=3→4 and rising, which is the number to plan k=5 with.

The disk is the part that changes the answer. A file-based k=4 run wants 4.1 TB of raw scratch and
leaves a 1.8 TB catalogue, against 566 GB free. The `EU_STREAM` fuse removes the 4.1 TB outright and,
after the two `eu_pruner` defects found today (the stale pre-canonical-form stream path, and
`std::cin` reading a character at a time through libc++'s `__stdinbuf`), is **1.58x faster** than the
file path instead of 3.1x slower. The remaining 1.8 TB is the pruned tree, and it should never be
written either: `eu_sphfill` rejects 99.973% of it, so a pruner that piped kept blocks into the
prefilter would land about **0.5 GB**. That one change — `EU_PRUNED_STDOUT` plus a stdin reader on the
develop side — is the whole distance between "does not fit" and "a weekend run".

Both gates pass byte-identically after every edit: **`make check-regular` PASS**, **`make check-star`
PASS** (all four sub-gates).
