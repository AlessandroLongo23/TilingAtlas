# Final optimizer plan — torusFill DFS

## Regime call (drives everything below)
Per-node, not combinatorial. The DFS tree is tiny (pops/fill 3.7→19.6 across k1→k3, branching ~1). No node explosion, so node-count levers are the wrong target. Time concentrates in work that runs once per CLOSURE: at k3, certify is 216056ms over 554 closures (~390ms/closure), and 85–86% of that is `blockHasProperOverlap` running O(block²) float `Polygon.intersects` on the cellDiam+8 certificate block. The union of float overlap testing is 70–90% of all fill at every k. Lever: cheaper primitives on that overlap test, plus skipping the certificate entirely for closures that can't be the answer. Not fewer nodes.

Three proposals survive completeness+correctness review; two are disqualified.

---

## RANK 1 — Periodic reduction of the certify overlap leg (proposal #4)
One-line swap at `PeriodSolver.ts:1448`: replace `blockHasProperOverlap(block, ctx)` with `reps.some(rep => properOverlapWithBlock(rep, block, ctx))`. Plus the identical swap at the setup site `:1161` (`initial` reps vs `initialBlock`).

Why it's #1: it hits the single dominant bucket (53% of ALL k3 fill, 60% k2, 75% k1) with the largest factor and the smallest, safest change. The outer loop shrinks from |block| to reps.length; the intersects-call count drops by F = |block|/|reps| ≈ 20–100 for typical unit-edge k3 cells. The overlap leg collapses from 53% toward ~1–3% of fill.

Measured expected win: ~1.7–2.1× total wall-clock on the k3 record, proportionally more at k2/k1 (higher leg share, smaller absolute time). The setup-site swap adds the ~13.6% setup bucket on top.

Why it's safe where the near-identical proposal #2 is not: #4 tests reps against the EXISTING already-built block (a strict subset of the pairs the old check tests, same exact `translateExact` tiles, same intersects primitive). It derives no new translate ring and no new radius. The no-drop direction is unconditional (NEW-hit ⟹ OLD-hit, so any tiling old accepts, new accepts). Reuses the CB-6 cullR already trusted in `place()`.

Guards (mandatory, both reviewers): add the one-line assert `(2·cellDiam+10) − (cellDiam + 2·maxCircum) > 0`, flagged ⚑ INCOMPLETE-REGION (the byte-identity direction needs the rep's overlap-neighbor to sit inside the block; holds for the {3,4,6,12}+star palette at maxCircum≈1.93, would silently break only if a future tile pushed maxCircum past ~5). Validate with a byte-identical composition digest at k=1,2,3 (`scripts/probe-pipeline.ts`), not merely count-identical.

---

## RANK 2 — Move OP-1 orbit/type filters before the closure certificate (proposal #1)
In torusFill's closure branch (`~L1247–1259`) run the two existing OP-1 discards (`vReps.length < k`, `occ.size !== ctx.allowed.size`) BEFORE `isCompleteTiling`, not after. Requires `analyze` (L1311) to return the VC-name Set it already computes at L1350.

Why it's #2 and not #1: it's orthogonal to Rank 1 and stacks multiplicatively. It removes whole closures before the certificate runs, so it compounds with a cheaper certificate rather than competing for the same bucket. But its ceiling is smaller. Measured closure fates: k3 554→325 certCalls (229 closures OP-1-doomed = 41% of certify calls), k2 141→93 (46 = 33%), k1 77→77 (0 — OP-1 cannot fire at k=1). Expected win 15–25% at k3, ~23% at k2, nothing at k1. The benefit shape is right: zero cost to the already-cheap k1, bites hardest at the k3 fill wall. Only integer comparisons move; no new float at any gate; the predicate is an already-proven-sound filter, so this is timing-only.

Guards: the drop-risk is `occ_analyze` under-collecting a VC name that `occ_certify` would collect (→ wrong `p2Skipped` → silent drop). Both reviewers verified this is impossible on the gated regular path (shared judgeR, cellDiam+2.43 inclusion inside both blocks), but the Prime Directive says verify, not trust: debug-assert `occ_analyze === occ_certify` at every closure across all 92 certified k≤3 cells + byte-identical digest. One instrumentation defect to fix: running OP-1 before the certificate makes `vBelowKSkipped`/`p2Skipped` also count cert-FAILING closures (0/2/1 at k3/k2/k1), breaking the L283/L290 accounting identity. Either use the counter-preserving leg-reorder variant (reorder isCompleteTiling's internal legs, skip only the overlap leg) or explicitly redefine the counter semantics.

---

## RANK 3 — Exact shared-edge certificate (proposal #5)
Directed-edge index over the block; for edge-adjacent convex pairs, replace O(V²) `intersects` with an O(1) reverse-key lookup (separating-edge lemma). Star-gated.

Why it's LAST, and conditional: it targets the SAME bucket as Rank 1 (`blockHasProperOverlap`). Do NOT bank #4 and #5 at full value — they overlap. On its own #5 gives ~1.7–2× (collapses ~85% of edge-adjacent O(V²) intersects to O(1) hash lookups). But after Rank 1 lands, the overlap leg is already ~1–3% of fill, so #5's headline win is largely captured and its marginal value shrinks to a residual ~3× on a now-tiny leg (plus the properOverlapWithBlock/expand and setup sites). It's also the most code (edge index, star gating) and carries an unstated load-bearing dependency the reviewers flagged: global CCW winding consistency (currently held by post-reflection renormalization, but never asserted).

Recommendation: defer #5. Land Rank 1 + Rank 2, re-profile, and only pursue #5 if the residual overlap primitive is still measurably on the critical path. If pursued, the guards are non-negotiable: star-gate per pair, key strictly on the FULL directed edge (endpoint,endpoint) via Cyclotomic `.key()` never float (T-junction hazard), assert the CCW winding invariant, byte-identical digest k=1,2,3.

---

## REJECTED for risk

Proposal #2 — periodic reps overlap with a `minLen` translate ring. Completeness-safe (it only ever over-accepts) but SOUNDNESS-broken, which still breaks the exact oracle bijection (over-count). The ring half-width `ceil((R_i+R_j)/minLen)+1` sizes by basis LENGTH and drops the `sinθ` factor; the correct perpendicular-distance reach is `R·|v|/area`, which buildBlock and `blockIndexRangeNeeded` already use. For an oblique cell (small sinθ) the ring is provably too small, misses an overlapping translate at large integer (m,n) but tiny Euclidean length, and admits an invalid tiling. Oblique holohedry-2 cells are real at k≥3 (t3046/t3055). This is exactly the failure CLAUDE.md's settled decision forbids: bound the step count, never Euclidean length. The insight is right; the execution re-derives a bound and botches the geometry. Rank 1 gets the same periodicity win safely by reusing the already-proven block instead. Salvageable only with the area-based ring plus a permanently retained side-by-side block path, not as written.

Proposal #3 — integer lattice-key dedup in buildBlock. completenessSafe=false. The gain is single-digit (3–6% at k3, and the exact-arith lens ceiling is only the ~7% Cyclotomic CPU, which cannot touch the float overlap bottleneck). It trades away a firewall: the exactKey `seen` set is a block-level backstop against `canonicalRep`'s float rounding splitting one Λ-class into two reps. If that ever happens, a coincident duplicate double-counts a vertex angle → spurious over-full contradiction → silently pruned valid closure. Removing a float-boundary firewall for a single-digit win is disqualified.

---

## LEAVE AS-IS
- The cellDiam+8 block radius. It is a SOUNDNESS knob, not a speed dial. Do not touch.
- buildBlock's exactKey dedup (see #3). Firewall, keep it.
- Exact ℚ(ζ_N) / Cyclotomic arithmetic (~7% CPU). Not the bottleneck; the profile's 70–90% is float `Polygon.intersects`, unreachable through the exact-arith lens.
- area(Surd) 0.0%, vertexJudge 0.5%, dedupKey/bookkeeping 0.0%. Off the critical path.
- The DFS tree / node count. Branching barely above 1, no explosion — chasing node-count levers is the wrong regime.
- The O(n²) bbox broadphase double-loop. After Rank 1 the outer loop is reps not block, so this is already O(reps×block) and small. The spatial-grid rewrite is a separately-provable follow-on, not now.

## Sequencing
Land Rank 1 first (one line + setup-site line, biggest bucket, largest factor). Then Rank 2 (orthogonal, stacks). Re-profile. Only then decide on Rank 3, sized against the post-Rank-1 residual. Every step gated behind a byte-identical `scripts/probe-pipeline.ts` composition digest at k=1,2,3 before the old path is deleted.

Relevant file: `/Users/alessandro/Desktop/University/Thesis/TilingAtlas/lib/classes/algorithm/PeriodSolver.ts` (all cited line numbers).