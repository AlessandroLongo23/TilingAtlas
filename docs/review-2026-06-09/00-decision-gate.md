# 00 — Decision gate: is the proven configuration runnable? (DG-1)

> Owner: **CC** (measurement) + **AL** (decision) + **TA** (theory lever if infeasible).
> Blocks: TX-1, TX-2 (the headline wording), and the choice between "run the regression" and
> "honest rewrite". Run this **in parallel with 01-code-bugs**, not after.

## DG-1 — Measure the proven-config candidate pool, k=1 first

**Why this is the single highest-value item.** The completeness proof closes only under the *proven
configuration* (proven candidate box `cor:box`, singleton seeds, blanket fan seeding —
`correctness.tex` §obligations). Every certified run used the tuned pool
(`poolSteps=2k+2`, `poolLmax=√(22k)`, flagged "NOT proven" at `PeriodSolver.ts:400-410`). The thesis
calls the proven-config regression "in flight" (`discussion.tex:126-127`). **Nobody has measured
whether it terminates in feasible time.** Naive counting says it may not: `thm:weight` licenses
generators of weight ≤ 24k−1; W(23) at k=1 is sums of ≤23 of the 24 unit directions in a rank-8
ring — the raw value count is astronomically larger than the tuned pool. The proven *filters*
(exact VC-area set, `cor:box(iii)` Gram/length bounds, Steinitz-style partial-sum pruning in the
bounded-step BFS) may collapse it. Measure; don't assume in either direction.

**Spec.**
1. Implement a `PROVEN_POOL=1` mode in `PeriodSolver` (or a standalone
   `scripts/measure-proven-pool.ts`): bounded-step BFS to weight s = 24k−1 with the two **proven**
   in-search prunes only — (a) partial-sum radius prune: discard a partial sum that cannot return
   within the `cor:box(iii)` length bound `|v| ≤ (2/√3)·24k·a_max` in the remaining steps; (b) the
   exact cell-area admissibility set for the pair stage. Log: pool size |W∩filters|, distinct
   values, peak RSS, wall time — synchronously to `experiments/results/` per the experiments
   doctrine, with progress + ETA.
2. k=1 first (s=23). If it completes: report pool size and the implied pair count for the lattice
   stage; proceed to k=2 (s=47) with the same instrumentation and a hard RSS/time budget that
   **aborts loudly** (this is a measurement, not a certified run — caps are legal here).
3. Decision table (AL):

| Outcome | Action |
|---|---|
| k≤3 feasible (days on 8 cores) | Run the proven-config regression k=1,2,3; the per-tiling oracle match becomes *confirmation*, the theorems carry the claim. TX-1/TX-2 keep the strong wording. This is the thesis finish line. |
| k=1 feasible, k≥2 not | Run k=1 proven-config (claim: "proof-bearing run executed at k=1; k=2,3 oracle-certified, proof-bearing run obstructed by X — measured"). TX-1/TX-2 take the two-tier wording **explicitly**. TH-10 (tighter weight bound) becomes a live TA item. |
| k=1 infeasible | The honest rewrite (TX-1 option b) is mandatory, and TH-10 is the only route back. Report the measurement itself in the thesis — an intractable proven box is a *result*, and it motivates TH-10 precisely. |

**Acceptance.** A written number (pool size or the abort point) in `experiments/results/`, cited in
the ledger, before any thesis contribution sentence is edited.

**Note on `rem:box-implementation`.** The thesis already says the implementation "may search a
smaller region *only* behind filters proven sound". DG-1 is the test of whether that sentence
describes something executable. If a new filter is needed to make it executable, the filter needs a
proof first (TA) — the registry pattern applies.
