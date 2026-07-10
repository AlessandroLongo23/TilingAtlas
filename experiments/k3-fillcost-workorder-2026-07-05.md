# k=3 fill-cost measurement under √2 pruning — CC follow-up (2026-07-05)

**Owner: CC. Follows: `efficiency-pruning-workorder-2026-07-04.md` + `eff-pruning-2026-07-05.md`
(Exp A/B). Status: OPEN.**

**One-liner:** the efficiency filter made the OOM-ing k=2 case tractable — use it to run the k=3
fill stage that was previously out of reach, and return the two numbers missing from every k=3
estimate: the real **distinct-lattice count** and the real **per-fill cost** at k=3. This closes
the *timing* half of "how long does k=3 take." **EXAMPLE MODE throughout — W(8) is the unproven
2k+2 pool; no count/completeness claim.**

## Why now

Exp A measured k=3 **pool-only** (`runK3` = pair-timing sample). Every k=3 time downstream — pairs
~2 min, joins ~0.5–2 d, fills **~1 d – 7 wk** on 8 cores — rests on a *modeled* distinct count
(~1.7e7) and an *unmeasured* per-fill cost. The "1 day vs 7 weeks" width **is** that missing
per-fill number. At √2 the k=3 pool drops to 21.1% (~230k vectors), so the pair→distinct→fill path
that OOM'd unfiltered should now run — the same wall the filter already cleared at k=2.

## What to run — c = √2 (`PRUNE_EFF_C2=2/1`), k=3, W(8), EXAMPLE MODE

1. **Pairs → distinct lattices (full).** Report admissible pairs and the **distinct admissible
   lattice count** — the k=3 quantity never measured (replaces the ~1.7e7 extrapolation). Pool
   ~230k ⟹ ~2.6e10 pairs ≈ minutes on 8 cores.
2. **Joins.** Run the closure. Report whether it **completes** at k=3-pruned (k=2 unfiltered
   budget-cut) or needs a budget; rounds, +lattices, admissible-det joined (expect 0 per the k≤2
   pattern — but measure, don't assume).
3. **Fills — the measurement.** Mirror the scout's k=2 tuned-fast-path method (PS_PROFILE): fill a
   **representative sample** of the distinct lattices — a few thousand, spread across seeds **and
   cell sizes**, not just the small ones. Report the **per-fill distribution: mean, p50, p90, p99,
   max** (fills are heavy-tailed; the tail is the risk — the scout's own "treat as a floor" note).
   Then **project** full fill wall-clock = distinct-count × mean, on 1 / 8 / N cores, tail caveat
   stated. If the full stage is cheap enough to finish, run it (budget + progress/ETA per CLAUDE.md);
   otherwise sample + projection is the deliverable.
4. *Optional:* repeat at c = 1.25 (tightest-sound certified threshold) to show per-fill/time
   sensitivity to the constant.

## Deliverables

- Real k=3 **distinct-lattice count** and **per-fill distribution** (mean + p99 + max) at √2.
- Updated k=3 three-way split (pairs / joins / fills wall-clock) with **measured** fills replacing
  the model, on 8 cores.
- Whether the join closure completes at k=3-pruned.
- `experiments/results/eff-pruning-k3fill-<date>.log` (synchronous, progress/ETA) + 3–6 line SYNC entry.

## Guardrails

- **EXAMPLE MODE.** W(8) assumes s\*(k=3) ≤ 8 — unproven. Loud labels, no count/completeness claim;
  this is a *timing* run. If it happens to reproduce 61 k=3 tilings, note it as an observation, not
  a result.
- Per-fill sample must span the cell-size distribution; report the **tail**, not just the mean —
  W(8) cells skew large and the p99/max drive the real cost.
- √2 is completeness-sound for the certified k≤3 catalogue (breaking threshold 1.2426 < √2), so the
  filter drops nothing here; the only unproven thing is the W(8) pool depth — the standing
  EXAMPLE-MODE caveat.
- This closes only the **timing** half of k=3. The **pool-depth** half stays with the AL/TA
  √2 + weight-bound proof: total k=3 feasibility = this measured per-fill × the pool the proof
  licenses (s=8 vs s=10). Report the per-fill so both scenarios can be costed.
