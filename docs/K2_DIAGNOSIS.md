# Why k≥2 expansion won't finish — diagnose before optimizing

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

## Strategic note

k=1 = 11 via fully exact arithmetic is a **bankable, validated result** — it proves
the representation and the canonicalization. Do not let k≥2 hold the thesis hostage:
timebox this diagnosis to the experiment above. If it's H1/H2 it's a real fix worth
making (it gets you 20/61/151/…); if it turns out to be a deep scaling wall, the
honest thesis position is "exact method validated at k=1 (and k=2 if recovered),
with a characterized performance barrier and its cause at higher k" — which is a
legitimate result, not a failure.
