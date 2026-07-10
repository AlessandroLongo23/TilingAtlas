# torusFill internals profile — where the fill time actually goes

Date: 2026-07-08. Goal: profile the fill (torusFill DFS) at multiple levels to decide what to optimize
and what to leave. Prompted by the k=3 fill-cost wall (fill ≈ 84% of solve; the question was *inside* the fill).

## Method

Two instruments, byte-identical when off:

1. `PS_FILL_PROFILE=1` — per-pop semantic timers (`performance.now`) + counters in `torusFill`
   (`PeriodSolver.ts`). Splits the fill into the two categories the question named — *selection/expansion*
   (`expand`: pick the gap, construct each candidate n-gon, reduce mod Λ, extend the block) vs *validity*
   (`analyze` open-vertex/contradiction, `certify` = `isCompleteTiling`, `primitive` = `isPrimitive`) vs
   *bookkeeping* (`dedupKey`). `isCompleteTiling` is further split into area(Surd) / buildBlock / overlap /
   vertexJudge (distortion-free — it runs ~once per closure). Counters give the search-tree shape.
2. `node --cpu-prof` — sampling profiler. Under tsx the function names come back mangled (esbuild `__name`
   wrappers), so it corroborates but does not lead; the manual timers are the authority. Analyzer:
   `scripts/analyze-cpuprofile.mjs <file> --subtree torusFill` (restricts to the fill call tree).

Driver: `scripts/fill-profile-driver.ts` builds real k-uniform seeds and runs the NORMAL `solve()` pipeline
(bounded per-seed candidate enumeration + fill) — NOT the scout's example-mode W(s)×W(s) pair
cross-product, which OOMs at ~4 GB before any fill (measured: k=2 died at 54% of the pair stage, 3.86 M
distinct lattices).

## Byte-identical (the measurement is not contaminated)

- `tests/period-solver.test.ts`: 32/32 pass identically with the profiler OFF and ON.
- k=1 full example-mode fill-match with the profiler ON: digest `6f9ca9cf2d16c75f`, 11/11 bijection vs the
  certified k=1 snapshot — the exact certified reference. Toggling the profiler changes nothing.

## Consolidated (setup-aware, all three k) + the one caveat

| bucket | k=1 | k=2 | k=3 (all timed out) |
|---|---|---|---|
| setup (per-fill init overlap) | 21% | 45% | 14% |
| certify (isCompleteTiling) | 68% | 39% | 62% |
| └ overlap share OF certify | **86%** | **86%** | **86%** |
| expand (selection) | 3% | 8% | 12% |
| primitive | 7% | 7% | 10% |
| pops/fill | 1.6–3.7 | 1.5–15 | 20 |

CAVEAT (measured, honest): the `maxMs` cap is wall-clock, so under CPU contention a timed-out solve tries a
non-deterministic NUMBER of candidate lattices — the cheap ones get rejected at `setup`, the survivors reach
`certify`. So the **setup↔certify split is candidate-mix-dependent and noisy** (k=2 torusFill count swung
379↔4075 between two runs at the same 40 seeds). Two things are NOT noisy and carry the conclusion:
(1) certify's internal overlap share is a stable **86%** at every k; (2) the UNION — float overlap testing
across setup + certify + expand — is **~70–90% of fill** always. `blockHasProperOverlap` is the primitive in
BOTH setup and certify; `properOverlapWithBlock` is its sibling in expand. One spatial-index fix hits all
three, so the noisy split doesn't affect the recommendation.

## Headline (k=1, confirmed on two independent runs)

The cost is NOT "selecting what to place." It is one validity sub-step: the closure certificate's
all-pairs overlap test.

```
VALIDITY 96.5% | SELECTION 3.5% | BOOKKEEPING 0.0%
  certify (isCompleteTiling)  86.6%
  primitive (isPrimitive)      9.3%
  expand (selection)           3.5%
  analyze                      0.5%

certify breakdown:
  overlap  (blockHasProperOverlap, O(block²) exact intersects)  86.0%   → ≈ 74% of ALL fill
  buildBlock (radius cellDiam+8)                                13.4%
  vertexJudge                                                    0.6%
  area (Surd)                                                    0.0%

tree shape: 289 pops over 79 fills = 3.7 pops/fill; 65 closures; 1.16 places/pop, 0.73 children/pop
```

Regime: **per-node-expensive, not combinatorial.** The DFS is tiny (≈4 pops/fill); almost all time is one
function — `blockHasProperOverlap` — doing O(n²) pairwise exact intersection on the big certificate block
(built at radius cellDiam+8, so the block reaches ~2·cellDiam+10). The scout k=1 run agrees (certify 81%,
overlap-dominated) despite CPU contention — ratios are contention-robust.

Implication for the lever: cheaper nodes, not fewer nodes. The overlap test admits a **provably lossless**
speedup (spatial-grid the pairwise test — same overlaps found, only far-apart pairs skipped). The block
radius `cellDiam+8` is a soundness-sensitive knob (too small → a missed overlap → an unsound accept), so it
is NOT a free speed dial; shrinking it needs a proof.

## k=2 (40 multi-VC seeds, 12 s cap; only 2 timed out → not cap-biased)

The k=1 regime generalizes — still certify/overlap-dominated, tree bigger but not exploding.

```
VALIDITY 84.9% | SELECTION 15.1% | BOOKKEEPING 0.0%
  certify 70.6%  (overlap 85.4% of it → 60% of ALL fill; buildBlock 14.0%)
  expand (selection) 15.1%
  primitive 12.2%
  analyze 2.0%

tree shape: 5754 pops / 379 fills = 15.2 pops/fill; 141 closures; 740 contradictions
placements: 11600 attempted, 5981 overlap-rejected (51%), 240 p1-pruned; 2.02 places/pop
```

Two shifts vs k=1: (1) `expand` rose 3.5% → 15% (bigger trees), but validity still owns 85%; (2)
overlap testing now dominates BOTH paths — `blockHasProperOverlap` in certify (60% of fill) AND the
incremental `properOverlapWithBlock` rejecting 51% of placements inside expand. Float `Polygon.intersects`
is the bottleneck end-to-end. Regime remains per-node (more nodes than k=1, not exponential): 15 pops/fill.

## k=3 (25 multi-VC seeds, 15 s cap; ALL 25 hit the cap → the genuine expensive case)

The expensive fills. All timed out, so this is the worst case, not the easy fills. Setup now measured.

```
VALIDITY 74.0% | SELECTION 12.4% | SETUP 13.6% | BOOKKEEPING 0.0%
  certify 61.9%  (overlap 85.7% of it → 53% of ALL fill; buildBlock 13.8%)
  setup 13.6%    (per-fill initial block + coreSelfOverlaps + blockHasProperOverlap — overlap again)
  expand (selection) 12.4%  (properOverlapWithBlock rejects 34296/60577 = 57% of placements)
  primitive 10.1%
  analyze 2.0%

tree shape: 27092 pops / 1382 fills = 19.6 pops/fill; 554 closures; 3027 contradictions
per-closure certify ≈ 390 ms of O(block²) exact intersects on a big cell
```

Total float-overlap testing (certify-overlap 53% + most of setup ~12% + expand's incremental reject) ≈
**70%+ of ALL fill** — stable across k=1/2/3. The tree grows sub-exponentially (3.7 → 15 → 20 pops/fill):
decisively per-node, NOT a combinatorial blowup.

## cpu-prof corroboration (independent of the manual timers)

Subtree-restricted to `torusFill` (`scripts/analyze-cpuprofile.mjs --subtree torusFill`). tsx mangles
function names (esbuild `__name` wrappers, `:0` locations), so it corroborates rather than leads. The one
big mislabel — `set TextDecoder` (32–35%) — is a leaf called 435× from `Vector.ts` with no children: a
mislabeled hot Vector float-math leaf. Folding it into the float-geometry path:

```
k=3 torusFill self-time:  float geometry (Vector + set-TextDecoder + geometry + Polygon) ≈ 80%
                          exact Cyclotomic arithmetic ≈ 7%
```

Agrees with the manual timers: the bottleneck is **float `Polygon.intersects`**, run O(block²) times on the
certificate block — NOT exact ℤ[ζ₂₄] arithmetic (a common wrong guess). `intersects` itself is O(V²): a
centroid test + every vertex/halfway containment + all edge-pair `segmentsIntersect`. In a valid tiling the
tiles never overlap, so `blockHasProperOverlap` spends its time running full O(V²) intersects to *confirm*
that edge-adjacent tiles don't overlap.

## Levers (to be adversarially completeness-checked before any is adopted)

1. **Spatial-index the overlap tests** (blockHasProperOverlap, properOverlapWithBlock, coreSelfOverlaps):
   bucket the block by centroid grid, test only pairs within R_P+R_q. O(block²) → O(block). PROVABLY
   LOSSLESS (same overlapping pairs found; unit-edge tiles have bounded circumradius, so far pairs cannot
   overlap). Attacks ~70% of fill. THE lever.
2. **Cheaper `intersects` for the adjacent-tile common case** (SAT with early-out, or an exact
   shared-edge/vertex short-circuit): most intersects calls are on edge-adjacent pairs that return false.
3. **Certificate/incremental redundancy**: the DFS already overlap-checks each placement
   (properOverlapWithBlock); the closure certificate re-checks globally on a bigger block. Investigate
   whether the certificate's overlap leg can be narrowed to only the NEW periodic images — completeness-
   sensitive, needs proof.
4. **Block radius `cellDiam+8`** is a soundness knob (too small → missed overlap → unsound accept), NOT a
   free speed dial. Shrinking needs a proof; leave unless proven.
5. LEAVE AS-IS: selection/expand placement machinery (3–15%), exact arithmetic (~7–12%), dedup/bookkeeping
   (~0%), the k-uniformity gate (already handled by KUniformityFast; separate from the fill).


## RANK 1 IMPLEMENTED — periodic reduction of the overlap leg (2026-07-09)

`blockHasProperOverlap(block)` → `reps.some(r ⇒ properOverlapWithBlock(r, block))` at both the certify
site (`isCompleteTiling`) and the setup site, with a reach guard (`Rabs+2 ≥ 2·maxCircum`, else fall back
to the exact O(block²) check). New private `blockOverlapPeriodic`.

PROVEN byte-identical: differential test (`tests/certify-overlap-periodic.test.ts`) — old===periodic on
all 92 certified k≤3 cells + 8 constructed overlaps; k=1 enumeration digest `6f9ca9cf2d16c75f` unchanged;
32/32 period-solver tests pass. (Suite flakes — certify-overlap default-timeout under contention → fixed
with `{timeout:120000}`; dsym-generator passes standalone; star-general-path fails pre-change — none are
regressions.)

Measured win (k=3, per-closure, contention-robust):
- certify overlap/closure  334 ms → 26 ms  (~13× less; matches predicted F=|block|/|reps|)
- certify total/closure     390 ms → 87 ms  (~4.5× faster)
- overlap share of certify  85.7% → 30.0%

Fill is now balanced — no single bottleneck (certify 30% / primitive 27% / expand 26% / setup 12%). The
new dominant certify sub-cost is `buildBlock` (14% → 68% of certify) — which Rank 2 skips wholesale for
OP-1-doomed closures, so Rank 2 now bites harder than first estimated.

### Rank 1 adversarial review (3 skeptics + judge) — SAFE, guard hardened

- Completeness (drop direction): UNCONDITIONALLY safe. NEW-true ⟹ OLD-true by construction (a rep is in
  the block via buildBlock's m=n=0 term), so a valid tiling can never be dropped — independent of guard,
  stars, obliquity, or canonicalRep reach.
- Obliquity: no gap — buildBlock's index bound `Mm=ceil(limit·|v|/area)` carries the 1/sinθ factor, so it
  covers every Euclidean-close lattice vector regardless of skew. (Not the forbidden length-bound trap.)
- Soundness (wrong-accept): the ORIGINAL `Rabs+2 < 2·maxCircum` guard was an imprecise proxy — it omitted
  canonicalRep's 1.5·cellDiam reach, leaving a silent-wrong-accept gap at maxCircum > 0.25·cellDiam+4.95 on
  the CERTIFY leg, reachable by a future acute-point isotoxal star (circum > ~5). FIXED: guard is now the
  exact witness-containment condition `1.5·cellDiam+0.1+2·maxCircum > Rabs+cellDiam+2 ⇒ fall back to exact`.
  Never trips certify for {3,4,6,8,12} (byte-identical, digest unchanged), and closes the setup-leg gap too.
  Chosen over star-gating (the real invariant is circumradius-vs-reach, not regular-vs-star).

## RANK 2 IMPLEMENTED — OP-1 before the overlap leg (2026-07-09)

First finding (why the naive form is unsafe): getting `occ` from `analyze` to skip the WHOLE certificate
is UNSOUND — analyze's small Rabs=5 block can't reliably reach a closure on every cell (differential test
`occ_analyze === occ_certify` caught 1/92: a k=3 cell, 9 tiles, cellDiam 4.464). So occ must come from the
certificate's own reliable cellDiam+8 block. Also measured: the OP-1 split is 100% type-prune, 0 V<k at both
k=2 (0+41) and k=3 (0+71/0+123) — the trivially-safe V<k half saves nothing; the type-prune is the whole
lever, and it needs reliable occ.

Sound implementation: a leg-reorder INSIDE isCompleteTiling — judge (collect occ) before the overlap leg,
then an OP-1 short-circuit (`opDoom`, non-star only) that returns false (skipping the overlap leg) for a
V<k or occ⊊allowed closure. Byte-identical output (a doomed cell is discarded either way; AND is
commutative): 34/34 tests, k=1 digest 6f9ca9cf2d16c75f unchanged.

Measured win (k=3, per-closure): certify 87→76.5 ms (overlap 26→19 ms) ≈ 12% of certify ≈ ~3.5% of fill.
Modest — Rank 1 already collapsed the overlap leg, so skipping it for the 33% type-pruned closures is a
small increment. Post-R1+R2 the fill is: certify 28% (buildBlock 72% of it, overlap 25%), primitive 29%,
expand 27%, setup 11%. The dominant cost is now **buildBlock** (~20% of fill), NOT overlap.

## TOTAL GAIN — end-to-end, OLD (HEAD, pre-optimization) vs NEW (Rank 1+2)

Same workload, back-to-back, profiler OFF (scripts/measure-total-gain.sh). NEW = working tree, OLD =
git-stashed PeriodSolver.ts (HEAD).

| workload | OLD | NEW | speedup |
|---|---|---|---|
| k=1 (15 seeds, uncapped) | 23.4 s | 10.4 s | 2.25× |
| k=2 (40 seeds, 30 s cap, 0 timeouts either side) | 204.0 s | 132.7 s | 1.54× |

BYTE-IDENTICAL, proven by DIRECT OLD-vs-NEW comparison: k=1 digest `6f9ca9cf2d16c75f` on BOTH; k=2 same 25
distinct cells / 91 raw on both. Pure speed, zero completeness cost.

The k=2 number (1.54×) is lower than k=1 (2.25×) because the total is solve() = candidate-enumeration stage
(UNCHANGED by Rank 1+2) + fill (the part we optimized, ~2×). At k=2 the candidate stage is a larger share,
diluting the fill speedup; at k=1 the fill dominates, so the overall gain ≈ the fill gain. Rank 3 was NOT
implemented (user decision) — it modifies the shared Polygon.intersects primitive + depends on an unasserted
CCW-winding invariant, and Rank 1 already collapsed its main target; the dominant remaining fill cost is now
buildBlock (~20% of fill), not overlap.
