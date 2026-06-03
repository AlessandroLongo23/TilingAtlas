# Why k≥2 expansion won't finish — diagnose before optimizing

> This is the detailed **measurement log** for the k≥2 performance problem. For the full narrative
> — assessment, design, the development journey, the ideas that were tried and rejected, and the
> open problems — see [`DEVELOPMENT_NOTES.md`](DEVELOPMENT_NOTES.md). Read that first for context.

k=1 reproduces 11 (validated). k≥2 doesn't finish. Three optimization passes
(memoization, O(n²) frontier, state-dedup) failed because the cause was never
isolated. The summary's own diagnosis is ambiguous ("heavy bigint cost" vs
"branching divergence"), and the logged symptom (`frames=1 … then silence`)
fits neither cleanly. **Do the measurement below before writing any more code.**

## Decisive experiment (~20 min, one failing k=2 seed)

Use the seed decoded from `…/reg_undefined/seedConfigurations/k=2/m=2`, threshold
unchanged (12) AND a reduced run at threshold=4. Add **flushed** instrumentation
(`process.stderr.write`, not buffered console.log):

1. **Heartbeat every 1s** (setInterval, `.unref()`): print a module-level
   `currentPhase` string — set it at entry of `computeFrontier`,
   `findValidIsometries`, the per-transform `applyIsometry`/`mergePatch`, and any
   `canonicalPatchKey`/cell-extraction call — plus `framesPopped`, `stack.length`,
   and the **max bigint bit-length** seen.
2. **Per popped frame:** print `validTransforms.length`.
3. **Re-exploration meter:** keep `Set<string>` of `canonicalPatchKey(patch)` for
   every popped frame; print `(framesPopped, distinctCanonicalPatches)`.

Run ~20s, read the tape:

| Observation | Cause | Fix |
|---|---|---|
| frames climb fast; `distinctCanonical ≪ framesPopped` | DAG explored as tree (no canonical memo) | **H1** — memoize visited states by *canonical* key |
| frames climb; `validTransforms.length ≥ ~4` per frame; `distinctCanonical ≈ frames` | candidate isometries over-admitted | **H2** — audit alignment/collision vs float |
| frames stuck at 1; heartbeat pins one phase | hang/loop in that function | **H3** — bisect that function |
| max bigint bit-length grows without bound | normalization bug | **H4** — (unlikely; Cyclotomic looks clean) |

## Hypotheses, ranked, with the fix

**H1 — no canonical visited-state memoization (most likely lever).** The reverted
dedup used the *absolute* `expandedSeedKey`, so it never collapsed a partial
patch against its translated/rotated/reflected equivalents. Different fill orders
reach the same patch → the search DAG is explored as an exponential tree.
*Fix:* before expanding a popped frame, compute the **canonical, symmetry-invariant**
patch key (the same boundary-robust `canonicalPatchKey` that makes the final count
11 — NOT `expandedSeedKey`) and skip it if already expanded. **Sound for
completeness:** two paths reaching the same canonical partial patch have identical
sets of reachable distinct tilings, so skipping the second loses no tiling.

**H2 — over-admitted candidate isometries.** If exact admits placements that float
pruned, every spurious placement spawns a garbage subtree. Prime suspect: collision
is still a **float `intersects()` broadphase** (my earlier review flag E). If a true
interior overlap that shares no vertex isn't exactly rejected, overlapping
macro-seed stamps get pushed and expand. *Check:* assert `validTransforms.length`
is small (≤ a handful) per frame; if not, compare the exact vs float candidate set
on frame 1 and find which predicate differs (alignment, orbit, footprint, or
collision). *Fix:* make proper-overlap rejection correct (exact rational segment
intersection, or a sound float test), not just vertex-coincidence + bbox.

**H3 — genuine hang in one step.** Less likely (Cyclotomic is clean) but not
excluded: a loop in `findBasisExact`/`canonicalPatchKey` or a per-corona
cell-extraction attempt that doesn't terminate for k=2 geometry. The heartbeat
pins it immediately.

**H4 — pure bigint throughput.** Least likely: vertices stay `den=1` small-integer,
and the threshold=4 patch is tiny. The bit-length meter rules it in or out.

## MEASUREMENT RESULTS (2026-06-01) — verdict: per-frame cost, NOT branching

Ran `scripts/diag-k2.ts` on the worst k=2 seed `[3,3,3,3,3,3;3,3,3,3,6]`, threshold=4, 20s cap.

| metric | value | reading |
|---|---|---|
| frames in 20s | ~641 | **~31 ms/frame** — frames are SLOW, not numerous. Not a frame explosion. |
| maxBits | 3 | **H4 ruled out** — bigint coeffs are tiny; arithmetic is cheap. |
| avgBranch | 1.06 | **H2 ruled out** — ~44 candidate isometries built/frame, ~1 survives; tree is near-linear. |
| distinctAbs / frames | 255/641 (2.5×) | absolute-key reconvergence is mild |
| distinctCanon (interior) | 8 | LOOKS like H1, but the interior key is **unsound** for partial frames |
| distinctCanon (full, sound) | == distinctAbs | **H1 ruled out** — sound full-patch symmetry memo gives NO gain over absolute dedup (~2.5×). Interior=8 was an illusion: patches genuinely differ at the boundary, which is where growth happens. |

**The cost is per-frame, concentrated in `findValidIsometries` (94% of all time).**
Sub-profile: `collision=10876ms (58%) + align=6573ms (35%)` = 93%. Both call
`applyIsometryToPolygon` = `mirrorZeta`→`rotateZeta`→`translateExact`, i.e. **3× `refreshFloatCache`
per transformed polygon**, each running live `Math.cos/sin` in `Cyclotomic.toVector` +
`calculateSides/Angles/Angle`. Two structural wastes:
1. **Alignment uses `exactKey()` (pure exact) but pays full float trig anyway** — it needs no float.
2. `mirrorZeta` → `recomputeEdgeDirsExact` is an **O(n·N) bigint-equality search** per reflect candidate.

### Fix (constant-factor, sound — no count change):
- **A.** Precompute a cos/sin basis table in `CyclotomicRing` → `toVector` trig-free.
- **B.** Precompute a `key(ζ^k)→k` map in the ring → `recomputeEdgeDirsExact` O(n) not O(n·N).
- **C.** Fused single-pass rigid isometry on `Polygon` (reflect∘rotate∘translate in one map) →
  ONE float refresh instead of three.
- **D.** Exact-only transform for the alignment stage (no float at all); float only for collision.
- **E.** `refreshFloatCacheLite` (vertices/halfways/centroid only) for the hot path.

Memoization (H1) is NOT the lever; this is. Expected ≥3–5× from constant factors; re-measure and
escalate to candidate pre-filtering (by polygon-type/edge-dir match) only if still short.

## IMPLEMENTED + RE-MEASURED (2026-06-01)

Applied A–E plus two more found by re-profiling. All correctness-preserving — **k=1 still = 11**,
all 52 tests green.

- **A** cos/sin basis table in `CyclotomicRing` → `toVector` trig-free.
- **B** `expFromZetaKey` map → `recomputeEdgeDirsExact` O(n) not O(n·N).
- **C/D/E** `Polygon.transformedRigid(mode)` — fused single-pass isometry; `'exact'` (no float, for
  the alignment test) vs `'full'` (one lite refresh, for collision/patch). Replaces
  clone+mirror+rotate+translate (up to 4× float rebuilds). + `refreshFloatCacheLite`.
- **F (re-profile #1)** Reuse the collision-built `transformedFullPatch` as the merge delta
  (merge 891→~150ms).
- **G (re-profile #2 — biggest collision win)** `hasFatalCollision` skips any transformed polygon
  whose `exactKey()` is already in the patch (it re-stamps an existing tile → can add no overlap).
  Patch key-set built once per frame. intersects calls 325k→116k; collide 40s→17s.
- **H (re-profile #3)** Intermediate-state **DAG memoization**: `seenState` keyed by
  `stateKey(patch, collapsed)` (absolute polygon keys + orbit labels). Re-exploration was found to
  GROW with depth (2.5× shallow → 6× at threshold-4 tail), so this IS a real lever after all —
  the earlier "absolute dedup didn't help" was measured too shallow. Sound: leaves are globally
  deduped, identical states ⇒ identical leaf-sets, count unchanged.

Net at threshold 4: ~32 → ~97 fps before memo (3×). **Caveat: threshold=4 is an unfaithful model**
— it makes every distance-4 patch a leaf (2448 shallow leaves/seed), whereas the real threshold=12
prunes most partials as dead-ends. Real-threshold k=2 validation is the actual gate; running now.

## REAL-THRESHOLD BASELINE (2026-06-01, post A–H + memo) — the gate that was never recorded

Ran `scripts/diag-k2.ts` at the **real threshold=12** (6·k, k=2), 20s/seed cap, current
optimized code. This is the faithful measurement the earlier "94% in findValidIsometries"
verdict lacked (that verdict was drawn entirely from threshold=4).

k=2: 63 seed sets → 40 concrete seeds (all multi-VC). First 3:

| seed | result | frames | leaves | stack@end | patch size | maxBits |
|---|---|---|---|---|---|---|
| #0 `[3⁶;3⁴.6]` | **ABORTED @20s** | 5401 | 1428↑ | ~411 (not draining) | ~734 polys | 4 |
| #1 `[3⁶;3⁴.6]` (other concrete) | finished @12.0s | 4577 | 64 | 0 | 18 (trimmed) | 4 |
| #2 `[3⁶;3⁴.4²]` | **ABORTED @20s** | 5545 | 2008↑ | ~411 (not draining) | ~770 polys | 4 |

Readings:
- **Hard seeds do NOT finish at threshold=12** — stack stays ~410 deep, leaves climb past
  1400–2000, patches reach **~730–770 polygons**. In production they hit the 90s cap and are
  **silently dropped** (run-pipeline.ts:424). Some seeds (#1) do finish fast. → confirms root
  cause #1 (no target-property pruning + grow-to-6k radius).
- **Frame rate ~270 fps** (vs the old threshold-4 ~97 fps). Per-frame is NOT the wall;
  **frame-count × patch-size** is. Time split (seed#0): `findValidIsometries` ~65% (was 94% at
  threshold-4), the O(patch-size) BFS `computeDistancesToCore` ~16%, `computeFrontier` ~6% — the
  per-frame O(patch-size) work is now a major slice, the signature of root cause #1. The "94% in
  fvi" was a threshold-4 artifact (root cause #3 confirmed).
- Within fvi: collision ~44%, align ~30%, footprint ~16%, orbit ~10%; **~319k candidates built /
  seed but only ~14k reach collision** → ~96% rejected before collision, so a cheap integer
  edge-dir/poly-type **pre-filter** removes most candidate-build + orbit + footprint work (Step 2).
- **maxBits=4** → bigint coefficients tiny; arithmetic is NOT the bottleneck.
- **KEY: leaves are NOT distinct tilings.** 1400–2000+ leaves/seed are boundary-variant finite
  patches of a *handful* of tilings, later collapsed by `canonicalPatchKey`. The expander
  manufactures massive redundancy then throws it away. → strongest motivation for Step 3a (detect
  the period early and emit ONE cell per distinct tiling, not thousands of boundary variants).

Verdict: architectural (root cause #1), as predicted. Next: Step 1 (orbit gate) then Steps 2–3.

## IMPLEMENTATION PROGRESS (2026-06-01) — orbit gate + pruning direction

**Step 1 — exact k-uniformity gate: DONE & validated.** New `lib/classes/algorithm/KUniformityChecker.ts`
computes the true vertex-orbit count under the full symmetry group, exactly: it replicates the
extracted cell over the lattice into a clean block, enumerates candidate symmetries (rotations ζ^r
and reflections/glides conj∘ζ^r with a carried translation — covers glides, which the old float
`TilingChecker` missed), verifies each by reducing images **modulo the lattice** (so a symmetry is
never falsely rejected because its un-reduced image leaves the finite block — this was a real
over-counting bug found during validation), then union-finds vertex lattice-classes under the
verified group. Wired as the final filter in `extractTranslationalCellForK` (orbit-count must == k;
`null` ⇒ can't decide ⇒ keep, so the gate never reduces completeness). Tests (`tests/k-uniformity.test.ts`):
the 11 regular 1-uniform tilings each → 1 orbit; the **k=1 pipeline reproduces exactly 11** with the
gate (so 11 is now a *validated* orbit-count, not a dedup coincidence); two genuine 2-uniform seeds → 2.

**Step 2 — sound candidate pre-filter + honesty: DONE.** `findValidIsometries` now skips a whole core
when a polygon name already at the target vertex is absent from that core's polygons (necessary
condition for alignment, which matches by exact key ⇒ preserves name). Measured: candidates built
~320k→249k/seed (~22%), seed#1 finishes 12.0s→9.9s — counts unchanged (sound). The silent 90s cap is
now logged loudly in `run-pipeline` and the API expand route got the same cap (was uncapped → could
hang to the 300s function timeout); capped seeds are surfaced as INCOMPLETE, never hidden.

**Step 3b — sound disallowed-VC prune: DONE.** Discovery (probe): the expander never checked that
emerging vertices have *allowed* VCs, so it grew mountains of patches containing fully-surrounded
vertices whose VC is outside the seed's k VCs — invalid by construction. New prune in `SeedExpander`
(`hasDisallowedSurroundedVertex`, run on each popped frame before any frontier/isometry/leaf work):
if any fully-surrounded vertex (interior-angle sum = 2π, exact 24-unit check) has a VC outside the
seed's allowed set, abandon the whole branch. **Sound** (necessary condition for a valid k-uniform
tiling using exactly those VCs ⇒ never drops a valid tiling) and also a correctness fix (the expander
no longer emits invalid-VC patches; new test asserts every leaf uses only allowed VCs).

Measured impact (threshold=12): seed#1 9.9s→**2.3s**, 64→**2** leaves (pruned 190 frames). Full k=2
survey (40 seeds, 10s/seed cap): **27/40 now FINISH** (avg ~0.5s each); 13 still cap. k=1 still = 11 and
the two 2-uniform first-cell tests still = 2 (counts preserved). `pnpm build` green, 66 tests pass.

**Remaining — the 13 capped seeds** (e.g. another `[3⁶;3⁴.6]` concrete seed, and `[3⁶;3³.4²]`). Their junk
is **allowed-VC but non-periodic** (verified: pruned=0 on seed#2 — my vertex-anchored VC check disagrees
with the earlier probe's `VertexConfiguration.getName()` ordering, which had false positives). The
disallowed-VC prune cannot touch them. A naive "emit-on-validated-closure + prune-branch" is **UNSOUND**
here: a periodically-complete patch can still be extended *non-periodically* at its boundary into a
different valid tiling, so pruning the closed branch can drop tilings (worked through and rejected). These
seeds need the deeper **solve-for-period / fundamental-domain** construction (assessment option C) or a
proven sound non-periodicity bound — not a quick prune.

## SOLVE-FOR-PERIOD IMPLEMENTATION (2026-06-02) — the 13 hard seeds now FINISH

Built [`PeriodSolver.ts`](../lib/classes/algorithm/PeriodSolver.ts) (full narrative:
[`DEVELOPMENT_NOTES.md`](DEVELOPMENT_NOTES.md) §7). It fixes the period first and fills the **bounded
torus** T = ℝ²/Λ by single-polygon corner-completion (positions reduced mod Λ), so the unbounded
allowed-VC non-periodic growth that capped the expander **cannot occur** — every branch closes the
torus or hits a contradiction within O(cell-size) placements. A closed cell is exact-certified
(area = |det Λ|, no overlap, every interior vertex a surrounded allowed VC), supercells are rejected
(`isPrimitive`), then gated to exactly k orbits and deduped up to symmetry.

**Outcome:**
- **k=1 → 11**, each a single *primitive* cell with orbit 1 (re-validates the gate on the construction).
- **All 40 k=2 seeds terminate** (full run: **0 timeouts, 203 s total** vs the expander's per-seed
  90 s caps; hard seeds finish in ~8–12 s). The bounded-torus fill replaced the architectural wall.
- **k=2 distinct count: 15/20** (the gate keeps exactly the 2-orbit cells; supercells/3-uniform
  arrangements are correctly rejected). The 5 missing are the discovery-coverage gap below, **not** a
  hang — every seed produced a definite (possibly empty) answer.
- The genuine 2-uniform **`[3⁶;3⁴.6]`** cell (orbit 2) is **recovered** — it had eluded the
  expand-and-extract path entirely (that seed always capped).
- Fast 2-uniform seeds (`[3⁶;3.3.6.6]`, `[3⁶;3².4.3.4]`, `[3³.4²;4⁴]`) → orbit-2 cells.

**Iteration log (the bugs that shaped it — see DEVELOPMENT_NOTES §7 for detail):** half-integer
lattice reduction split classes → canonical lex-min rep; supercell over-counting (`4.8.8` → 6 cells)
→ primitivity filter; chiral discovery (snub seeds found only tiny wrong lattices) → key candidate
vectors by name **and orientation**; oriented-vectors alone missed lattices `extract()` found, while
`extract()` alone hung on ~700-tile hard leaves → run **both** with a time budget on `extract`;
per-lattice area cap + tight lattice-point block range for speed (`3.4.6.4` 45 s → ~14 s); rigid k-VC
core seeding beats single-VC (single-VC regressed the fast seeds).

**Remaining gap (now precisely characterized):** not a hang — a **lattice-discovery coverage** limit.
Discovery still expands the concrete seed, so a tiling's period is found only if the seed's expansion
reaches that tiling's structure within the budget. **The exact 5 missing** (vs the authoritative 20):
`[3⁶;3³.4²]` both variants (seed `[3⁶;3,3,3,4,4]` produces 0), one of two `[3⁶;3⁴.6]`, one of two
`[4⁴;3³.4²]`, and `[3.4.6.4;3.4².6]`. **Pattern:** four are the *second tiling of a two-tiling
vertex-pair* (discovery finds one of the pair's two lattices); the fifth is a seed discovery can't
read any lattice from. **Non-deterministic:** the time-budgeted `extract()` makes *which* lattices
are found depend on CPU timing — two runs both gave 15 with different compositions, so the count is
not yet run-to-run stable. Fix = **seed-decoupled, deterministic lattice enumeration**
(DEVELOPMENT_NOTES §9.1). Wired into the CLI behind `USE_PERIOD_SOLVER=1`.

## Strategic note

k=1 = 11 via fully exact arithmetic is a **bankable, validated result** — it proves
the representation and the canonicalization. Do not let k≥2 hold the thesis hostage:
timebox this diagnosis to the experiment above. If it's H1/H2 it's a real fix worth
making (it gets you 20/61/151/…); if it turns out to be a deep scaling wall, the
honest thesis position is "exact method validated at k=1 (and k=2 if recovered),
with a characterized performance barrier and its cause at higher k" — which is a
legitimate result, not a failure.
