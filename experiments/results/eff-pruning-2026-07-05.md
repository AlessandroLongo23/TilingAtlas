# Efficiency-pruning experiments — RESULTS (2026-07-05)

**Owner: CC. Work order: `experiments/efficiency-pruning-workorder-2026-07-04.md`. Status: COMPLETE
(Exp A + Exp B, byte-identical gate passed). Uncommitted pending AL sign-off.**

Tests whether an exact efficiency filter `keep pool vector v iff wt(v) ≤ c·|v|` (`wt(v)²  ≤ c²·|v|²`,
c² rational, decided in exact ℚ(√2,√3) Surd arithmetic) (A) prunes hard and (B) drops no certified
tiling above a safe threshold — feeding the parallel AL/TA √2 proof two numbers: how much √2 buys,
and whether any certified tiling (octagons included) violates a candidate c.

---

## 0. Four corrections to the work order (from the pre-flight double-check)

The work order's premises were verified against the repo before coding; four are wrong and are
corrected here (not silently worked around):

1. **`wt(v)` has no sound callable in the production pipeline.** `|v|²` is exact and ready
   (`reSurd(v.normSquared())`), but the only integer weight in the code is the `shortVectorPool` BFS
   depth, which is **inflated** by monotone + restricted-direction + `lmax` pruning — using it would
   **over-prune and silently drop tilings**. The sound weight is the scout's *unpruned all-24-root*
   BFS level. ⟹ the filter runs on the **scout / example path** (wt exact); the analytic ratios use a
   purpose-built unpruned wt-oracle (`scripts/eff-pruning-ratios.ts`, `-galebach.ts`), never
   `shortVectorPool`.
2. **The octagon premises are inverted.** Octagon period length is **1+√2 ≈ 2.414, not √2** (the √2
   is the target *ratio* c). There is **exactly one** octagon tiling in the certified k≤3 set
   (4.8.8 = t1002, k=1) — no "3.4.8-family", no k=2/k=3 octagons — and it is **present and
   oracle-matched**, not excluded (the ζ₁₂ exclusion was a property of the non-repo proxy). Its exact
   ratio is **1.2426 < √2** (see §2). The octagon is the *tightest* certified tiling, and it does
   **not** threaten √2.
3. **The committed catalogue carries the stale k=3 digest** `99919f42a7b58e76`; the live master
   anchor is `11ee1b1d582811d1`. Ratios are congruence-invariant, so the catalogue bases give correct
   ratios regardless; the empirical digest gate uses the live anchor.
4. **The proxy table is unverifiable** (`fillprof-sandbox.ts` is a fill-*timing* profiler, not the
   proxy tool; the `14%/21%/8×/1.2957@t6268` numbers are from AL's non-repo ζ₁₂ tool). Every proxy
   number is treated as a hypothesis to confirm — the measured sups below are **not** rounded toward √2.

---

## 1. The filter — implementation

- `lib/classes/algorithm/effFilter.ts` (TDD, `tests/eff-filter.test.ts` 9/9): `parseEffC2` (rational
  c², rejects decimals, fails loud on garbage) + `passesEffFilter(wt, v, c2)` = exact
  `Surd.cmp((P/Q)|v|² , wt²) ≥ 0`.
- Scout injection (`scripts/th10-scout.ts`): `enumerateW` now records the BFS level per vector
  (`Pool.wts`); `applyEffFilter` prunes the pool after enumeration, emits a loud ⚑ banner + per-weight-
  shell kept-fractions. **Behind `PRUNE_EFF_C2`; unset ⇒ the pool object is returned untouched ⇒
  byte-identical.**
- Byte-identical-off GATE **PASSED**: k=1 flag-off reproduces pool = 43,776, distinct lattices =
  831,279, Σ = 224,557 fills (all match the historical run byte-for-byte), **COMPOSITION digest =
  `6f9ca9cf2d16c75f`, count 11, 11/11 bijection** (23.1 min single-core) — see
  `eff-pruning-expA-k1-baseline-2026-07-05.log`.

---

## 2. EXPERIMENT B (core) — exact breaking threshold over the CERTIFIED k≤3 catalogue

`scripts/eff-pruning-ratios.ts` → `eff-pruning-ratios-2026-07-05.{log,csv}`. For every certified
tiling: gauss-reduce the exact period basis, compute `max(wt(u)/|u|, wt(v)/|v|)` with exact wt
(unpruned all-24-root BFS, self-checked against the |W(t)| table to weight 7) and exact |·|. A tiling
survives threshold c iff c ≥ this ratio (its reduced basis then survives and regenerates the lattice),
so **per-k breaking threshold = max ratio**.

| k | breaking c | exact c² | tightest tiling | 2/√3 | 1.25 | 1.30 | √2 |
|---|-----------|----------|-----------------|------|------|------|----|
| 1 | **1.2426** | 27 − 18√2 | **t1002 (octagon 4.8.8)** | DROPS | SOUND | SOUND | SOUND |
| 2 | 1.1954 | ≈1.42906 | t2016 | DROPS | SOUND | SOUND | SOUND |
| 3 | 1.1547 | 4/3 (=2/√3) | t3038 (+4 more) | SOUND* | SOUND | SOUND | SOUND |
| **k≤3** | **1.2426 = 3(√2−1)** | **27 − 18√2** | **t1002 octagon** | DROPS | SOUND | SOUND | SOUND |

\* 2/√3 is the k=3 breaking value exactly (boundary kept); it DROPS k=1/k=2 tilings ⟹ 2/√3 is
UNSOUND overall.

**Headline for the proof:**
- The **octagon is the tightest certified tiling** (c = 1.2426), **12% below √2**. The work order's
  central fear is inverted: the octagon is the worst case *and* comfortably √2-safe.
- **√2 is sound at all k≤3** with margin; so is **1.30 and 1.25**. The exact overall breaking
  threshold is **1.2426**, closed form **c² = 27 − 18√2**. Any c ≥ 1.2426 keeps every certified tiling.
- Octagon exact datum (t1002): |u|²=|v|²=3+2√2, |u|=|v|=1+√2, u·v=0 (already reduced), wt=3, ratio
  3/(1+√2)=3(√2−1)≈1.2426.

---

## 3. EXPERIMENT B (extension) — exact ratios over the Galebach k≤6 reference

`scripts/eff-pruning-galebach.ts` → `eff-pruning-galebach-2026-07-05.{log,csv}`. Corrects the proxy's
float-weight `1.2957 @ t6268` to an **exact** weight (meet-in-the-middle wt-oracle over W(≤7), covers
wt ≤ 14). **⚑ OCTAGON-BLIND**: Galebach periods live in ℤ[ζ₁₂] (even ζ₂₄ powers), so octagon tilings
(odd powers) are absent — every sup here is a **lower bound** on the octagon-complete sup and cannot
establish √2-safety for k≥4.

<!-- FILL from eff-pruning-galebach-2026-07-05.log (H=7 rerun) -->
| k | exact max ratio | tightest |
|---|-----------------|----------|
| 1 | 1.1547 | t1001  *(octagon t1002 excluded — ζ₁₂ blind ⟹ galebach k=1 max < certified 1.2426)* |
| 2 | 1.1954 | t2016  *(= certified — cross-validates)* |
| 3 | 1.1547 | t3002 |
| 4 | 1.2604 | t4079 |
| 5 | 1.1809 | t5125 |
| 6 | **1.2957** | **t6268**  (exact c² = (1664 − 448√3)/529) |

- **The proxy's 1.2957 @ t6268 is confirmed exact** (its float weight was correct there); overall
  galebach k≤6 sup = **1.2957 < √2** (margin 0.1186).
- **Octagon-blindness demonstrated:** galebach's k=1 max (1.1547, t1001) is *below* the certified k=1
  max (1.2426, the octagon) — the reference drops exactly the tightest tiling.
- **Honest limitation:** no octagon-complete catalogue exists for k≥4 (the thesis stalls at certified
  k≤3), so a √2-safety claim for k≥4 is NOT established here — only that the ζ₁₂-representable
  reference tilings are √2-safe.

---

## 4. EXPERIMENT A — pruning power (c-sweep)

`scripts/eff-pruning-sweep.sh` + `eff-pruning-table.ts` → `eff-pruning-expA-{k1,k2,k3}-2026-07-05.log`
+ `eff-pruning-expA-table-2026-07-05.md`. Single-tenant (clean wall-clock).

### k=1 — COMPLETE (pool → pairs → distinct → fills → digest at every c)

| c | pool kept | distinct lattices | fills | count | digest | pool× | distinct× | **fills×** | wall |
|---|-----------|-------------------|-------|-------|--------|-------|-----------|-----------|------|
| ∞ | 43,776 (100%) | 831,279 | 224,557 | 11 | `6f9ca9cf` | 1.0 | 1.0 | 1.0 | 23.1min |
| 1.50 | 14,160 (32.4%) | 194,056 | 31,482 | 11 | `6f9ca9cf` | 3.1 | 4.3 | 7.1 | 2.6min |
| √2 | 12,192 (27.9%) | 155,837 | 25,587 | 11 | `6f9ca9cf` | 3.6 | 5.3 | **8.8** | 2.1min |
| 1.35 | 10,800 (24.7%) | 122,924 | 20,815 | 11 | `6f9ca9cf` | 4.1 | 6.8 | 10.8 | 108s |
| 1.30 | 9,600 (21.9%) | 104,026 | 17,369 | 11 | `6f9ca9cf` | 4.6 | 8.0 | 12.9 | 95s |
| 1.25 | 7,992 (18.3%) | 77,817 | 13,296 | 11 | `6f9ca9cf` | 5.5 | 10.7 | 16.9 | 80s |
| 1.20 | 6,096 (13.9%) | 52,816 | 9,028 | **10 ⚑** | `476ebbd7` | 7.2 | 15.7 | 24.9 | 66s |
| 2/√3 | 4,392 (10.0%) | 34,699 | 5,264 | **10 ⚑** | `476ebbd7` | 10.0 | 24.0 | 42.7 | 56s |

1. **The reduction reaches the fills** — the §2 question, settled. Fills reduce 7–43×, *more* than the
   pool (3–10×), because pairs ~ pool² and distinct/fills track pairs. It does **not** stall at the
   cheap pair stage.
2. **What √2 buys: 3.6× pool / 5.3× distinct / 8.8× fills** (all 11 kept). **1.30 buys 4.6×/8.0×/12.9×**
   — the 8.0× distinct-reduction matches the proxy's claimed ~8.0× exactly (exact: 7.99×). Tightest
   SOUND threshold is **1.25** (16.9× fills).
3. **Empirical breaking ∈ (1.20, 1.25]** — digest MATCHES `6f9ca9cf`/11 at c ≥ 1.25, CHANGES to
   `476ebbd7`/**10** at c ≤ 1.20. This brackets the analytic **1.2426** exactly, and the dropped
   tiling is the **octagon t1002** (11→10, the certified snapshot match drops to 10/11). ⟹ **the
   analytic reduced-basis bound is TIGHT** — the actual pipeline breaks exactly where the ratio says,
   no alternate-generator rescue below 1.2426.
4. Per-weight-shell kept (c=2/√3): **wt1 100% · wt2 45% · wt3 20% · wt4 12% · wt5 9%** — the efficient
   fraction shrinks with weight, so the pruning is *at least* this aggressive at the proven pool bound
   (higher shells prune harder). This is the extrapolation number the work order asked for.
5. Proxy discrepancy noted honestly: the proxy's *pool-kept* fractions (14% @1.30, 21% @√2) are
   **below** exact (21.9% @1.30, 27.9% @√2) — its float weight over-pruned — even though its
   *reduction factors* matched. Absolute proxy pool-fractions should not be trusted; the reduction
   factors happen to.

### k=2 — pool% + distinct (filtered points; no fills — scout projects)

| c | pool kept | distinct lattices |
|---|-----------|-------------------|
| 2/√3 | 10,920 (7.45%) | 133,742 |
| 1.20 | 16,224 (11.07%) | 232,976 |
| 1.30 | 26,400 (18.02%) | 487,452 |
| √2 | 35,808 (24.44%) | 867,134 |
| 1.50 | 43,272 (29.53%) | 1,160,616 |
| ∞ | 146,520 (100%) | ⚑ **OOM** (JS heap) |

⚑ The unfiltered (c=∞, filter OFF) k=2 pair stage **crashes with a JS-heap OOM** — a pre-existing scout
limit, not the filter. **Every filtered point completed** ⟹ the efficiency prune *makes the k=2 case
tractable*. Distinct grows monotonically with c; distinct-reduction √2→2/√3 = 6.5× for a 3.3× pool cut.

### k=3 — pool% only (runK3 is a pair-timing sample; no full distinct/fills)

| c | 2/√3 | 1.20 | 1.25 | 1.30 | 1.35 | √2 | 1.50 | ∞ |
|---|------|------|------|------|------|----|----|---|
| pool kept | 5.02% | 7.88% | 11.00% | 14.10% | 17.12% | 21.14% | 26.89% | 100% (1,086,912) |

**Higher k prunes harder:** at √2, k=3 keeps **21.1%** vs k=1 **27.9%** — the efficient fraction shrinks
as the pool weight grows (W(8) vs W(5)), so pruning is strictly more aggressive at higher k. (Full
k=3 distinct/fill reduction is beyond the example scout — runK3 samples pairs for timing only.)

---

## 5. Verdict for the √2 proof

**Does √2 hold?** Yes, over all octagon-complete data, with margin — and the octagon is the worst case,
not a threat.
- **Octagon-complete (certified k≤3): sup = 1.2426 = 3(√2−1), exact c² = 27−18√2.** √2 ships with a
  12% margin; 1.30 and 1.25 are sound too. The octagon (the feared case) is the *tightest* certified
  tiling and is well under √2. **Confirmed twice, two ways:** analytically (reduced-basis ratios) and
  empirically (the k=1 filtered-pipeline digest breaks in (1.20, 1.25] on exactly the octagon) — and
  the two agree, so the analytic bound is tight.
- **Reference (galebach k≤6, octagon-blind): sup = 1.2957 @ t6268 < √2** (margin 0.1186), proxy
  confirmed exact.

**What √2 buys (Exp A, k=1 exact):** 3.6× pool / 5.3× distinct-lattice / **8.8× fills** reduction, and
the reduction reaches the fill wall (unlike the symmetry levers, which conserve fills). At 1.30 it's
4.6×/8.0×/12.9×; at the tightest-sound 1.25, 5.5×/10.7×/16.9×. Pruning also makes the OOM-ing
unfiltered k=2 case tractable.

**Caveat the proof must carry:** the octagon-complete guarantee is **k≤3 only**; k≥4 rests on the
octagon-blind galebach reference (a ζ₁₂ lower bound). If √2 is claimed for all k, that extrapolation
must be stated, not assumed — no certified k≥4 catalogue exists to close it.

---

## 6. Artifacts

- `lib/classes/algorithm/effFilter.ts` + `tests/eff-filter.test.ts` (9/9) — the exact filter.
- `scripts/eff-pruning-ratios.ts` → `eff-pruning-ratios-2026-07-05.{log,csv}` — Exp B core (certified k≤3).
- `scripts/eff-pruning-galebach.ts` → `eff-pruning-galebach-2026-07-05.{log,csv}` — Exp B ext (galebach k≤6).
- `scripts/th10-scout.ts` (PRUNE_EFF_C2 injection) + `scripts/eff-pruning-sweep.sh` +
  `scripts/eff-pruning-table.ts` → `eff-pruning-expA-*-2026-07-05.log` + `-table-2026-07-05.md` — Exp A.
- `eff-pruning-expA-k1-baseline-2026-07-05.log` — the byte-identical gate (digest `6f9ca9cf2d16c75f`).
