# Efficiency-pruning experiments — CC work order (2026-07-04)

**Owner: CC. Requested by AL. Status: OPEN. Proof pursued in parallel by AL/TA (target c = √2).**

**One-liner:** quantify the *pruning power* and stress-test the *completeness* of an
efficiency-based pool filter across thresholds, so the proof effort knows (a) how much the
theorem actually buys and (b) which constant is provably safe — including the octagon tilings the
upstream analysis could not see. **Data-gathering only: no proven-path semantics change; inject
behind a flag, byte-identical when off.**

---

## 0. Context — the finding this tests

`fig:weight-tightness` + the fig7 basis-vs-pool analysis (Cowork session, 2026-07-04) show valid
tilings are built from a thin, efficient sliver of the pool: **every reduced-basis vector of a
valid tiling has wt(v)/|v| ≤ ~1.30**, while the pool spreads out to √2 and past it (near-cancelling
junk reaches wt/|v| ≈ 449). So pruning the pool to `wt(v) ≤ c·|v|` should keep every valid lattice
while deleting most of the pool.

**Sandbox proxy numbers to reproduce EXACTLY and extend** (mine used a float weight + the galebach
ζ₁₂ oracle, which *excludes octagon-bearing tilings* — that gap is a main reason this order exists):

| quantity (proxy) | value |
|---|---|
| pool kept at c = 1.30 (W(8)) | ~14% |
| pool kept at c = √2 (W(8)) | ~21% |
| distinct-admissible-lattice (fill) reduction, k=1, c=1.30 | ~8.0× |
| distinct-admissible-lattice reduction, k=1, c=√2 | ~5.8× |
| pair reduction = (pool reduction)²; k=1 c=1.30 | ~12.6× |
| max reduced-basis ratio over galebach k≤6 (no octagons) | **1.2957** (t6268, k=6) |
| c = 2/√3 ≈ 1.155 | drops ~15 tilings (UNSOUND) |
| c ≥ 1.296 | drops 0 (of the oracle set) |
| "monotone-reachable" variant (always-outward walk) | SOUND (⊇ efficient) but weak, ~1.9× fills |

The proxy says the gain **reaches the fill wall** (unlike the symmetry levers, which conserve
fills). Confirm with the real pipeline and the exact digest.

---

## 1. The filter

Keep pool vector `v` iff `wt(v) ≤ c·|v|`  ⟺  **`wt(v)² ≤ c²·|v|²`**. Use a **rational c²** so the
test is exact against the algebraic `|v|²` (repo Surd arithmetic; `wt(v)²` is an integer):

- c = √2 → `wt² ≤ 2·|v|²`  (fully exact — this is why √2 is the clean proof target)
- c = 2/√3 → `wt² ≤ (4/3)·|v|²`
- c = 1.30 → `wt² ≤ (169/100)·|v|²`

`wt` must be the repo's **exact** weight (min unit-24th-root sum), not a float embedding. Only the
threshold constant is rational-approximate; the completeness verdict is the digest, so that's fine.

Inject behind a flag (`PRUNE_EFF_C2=<rational>`), hard-gated, ⚑-banner when set, **byte-identical
flag-off** — mirror the `th10Override` / `TH10_EXAMPLE_MODE` seam. This is a completeness knob, not
a speed dial (settled rule: if turning it up can lose a tiling, that regime is the incomplete one).

Sweep c ∈ {2/√3, 1.20, 1.25, 1.30, 1.35, √2, 1.50, ∞(baseline)}.

---

## 2. Experiment A — pruning power (where does the gain land?)

For k ∈ {1, 2, 3}, each c, measure vs the c=∞ baseline and report the per-stage reduction factor:

- `|pool_kept| / |pool_full|`  — vector reduction (also report per weight-shell; efficient
  fraction shrinks with weight, so higher k prunes harder).
- number of **admissible pairs** (pre-dedup).
- number of **distinct admissible lattices** (fill candidates) — *the fill-relevant number*.
- **fills executed, fill wall-clock, end-to-end wall-clock.**

Key question this settles: does the reduction reach the distinct-lattice / fill count (the actual
wall), or stall at the cheap pair stage? Proxy says it reaches fills at k=1 (~8×) and should grow
at k=3 (harder pruning) — **measure the k=2 and k=3 distinct-lattice + fill reduction I could not
run.** Reuse `scripts/th10-scout.ts` (already has pool→pairs→joins→fills, example mode) or standard
`PeriodSolver` + the flag.

---

## 3. Experiment B — completeness / counterexample hunt (the sacred gate)

For k ∈ {1, 2, 3} (certified), each c:

1. Run the **full pipeline** with the pruned pool; compute the COMPOSITION digest.
2. Compare to the certified anchors: **k=1 `6f9ca9cf2d16c75f`**, **k=2 `f3e2e0517191362c`**,
   **k=3 `11ee1b1d582811d1` / 61**.
3. Match → SOUND at (c, k). Mismatch → UNSOUND: diff per-tiling vs the certified snapshot, **name
   every dropped tiling, log LOUD** (INCOMPLETE-REGION channel).
4. Report the **breaking threshold per k** = the largest c at which the digest first changes = the
   smallest reduced-basis efficiency ratio among certified tilings. Also report it directly: for
   each certified tiling, `max(wt(u)/|u|, wt(v)/|v|)` of its **exact** reduced basis; the per-k
   maximum is the tightest tiling.
5. **Octagons (the proxy blind spot):** the certified catalogue includes 4.8.8 / 3.4.8-family
   tilings the ζ₁₂ oracle dropped (√2 periods aren't in ℤ[ζ₁₂]). Report their ratios explicitly —
   √2-length octagon periods are the most likely thing to push the true sup above √2.

---

## 4. Deliverables

- `experiments/results/eff-pruning-<date>.log` — synchronous, progress/ETA, human-readable (per
  CLAUDE.md experiments rule).
- Table keyed by (k, c): pool %, adm pairs, distinct lattices, fills, wall-clock, digest match Y/N,
  first-dropped tiling id. (md or CSV in `experiments/results/`.)
- Per-k breaking threshold + tightest tiling id + its exact ratio (octagon cases flagged).
- 3–6 line SYNC entry → the log + this order.

## 5. Guardrails

- Proven-path digests stay byte-identical flag-off. This is measurement behind a flag.
- A digest change is **not a bug to silence — it is the datum** (the breaking threshold). Log which
  tiling dropped, loudly.
- Exact `wt`; only the threshold uses rational c².
- Surface the tightest tilings and octagon cases *especially* when uncomfortably close to a
  candidate c. Do not round upper bounds down.

## 6. Why this, now (for the parallel proof)

AL/TA are proving `wt(v) ≤ c·|v|` for the successive minima of valid period lattices, target
**c = √2** — the natural constant (density-trap worst case `wt(n(1+i)) = √2·|v|`) and 9% clear of
the 1.296 empirical max. This order returns two numbers the proof needs: **how much √2 actually
buys** (Exp A: pool/pair/lattice/fill reductions at √2 vs 1.30), and **whether any certified tiling
— octagons included — violates a candidate c** before it's committed to (Exp B: the exact per-k
breaking threshold). If Exp B finds the true sup above √2, the target moves; if it confirms ≤1.30
with octagons in the set, √2 ships with margin.

*Note on scope:* run Exp A/B at the example pools W(2k+2) (feasible). The efficient fraction only
shrinks at the proven weight bound, so the pruning is at least this aggressive there — report the
per-shell fractions so the extrapolation to the proven pool is explicit, never assumed.
