# Weight-bound B(k) = ⌊max(5√k, 2k+2)⌋ — CC work order (2026-07-06)

**Owner: CC. Requested by AL. Status: OPEN. Example-mode measurement behind existing flags;
byte-identical off. Follows `eff-pruning-2026-07-05.md` + `eff-pruning-k3fill-2026-07-05.md`.**

**One-liner:** confirm the candidate closed-form weight bound `B(k) = ⌊max(5√k, 2k+2)⌋ = {5, 7, 8}`
(k=1,2,3) keeps the full certified k≤3 catalogue under the √2 efficiency filter, and record the
wall-clock — **reusing the 2026-07-05 runs where the pool is identical, actively running only the one
new cell (k=2, W(7)).**

---

## 0. Read before running — what this actually tests

- `B(k) = ⌊max(5√k, 2k+2)⌋` → **k=1: 5 · k=2: 7 · k=3: 8**. The two arms cross at k=4 (5√4 = 2·4+2 = 10),
  so **for k=1,2,3 the `2k+2` arm is INERT — this exercises the `5√k` arm only.** The linear arm first
  binds at k≥4, where no certified oracle exists (unfalsifiable by this method).
- Completeness is decided **analytically, already**, not by this run. A pool W(s) recovers the whole
  certified k-set iff `s ≥ s*(k)`, where `s*(k) = max over the certified k-set of max(wt(u), wt(v))` on
  the exact reduced period basis. From `eff-pruning-ratios-2026-07-05.{log,csv}`: **s* = {5, 6, 7}.**
  `B = {5, 7, 8} ≥ s*` at every k ⇒ **no certified tiling can drop.** The √2 filter is also non-binding
  (max certified ratio = 1.2426 = 3(√2−1) < √2). So the empirical run **confirms + times**; it does not
  decide completeness — the `B ≥ s*` comparison does.
- **k=1 (B=5) and k=3 (B=8) were already run at these EXACT pool weights on 2026-07-05** (the scout
  example pools are s=5 / s=8, `th10-scout.ts:8`). Reuse them. **Do NOT re-run k=3 (~3.7 d, identical
  pool).**

## 1. Reuse — cite, do not re-run

- **k=1, W(5) + √2 — END-TO-END, done.** `PRUNE_EFF_C2=2`, ~2.1 min, pool 12,192/43,776 kept, 25,587
  fills, **digest `6f9ca9cf2d16c75f`, 11/11 oracle bijection.** (`eff-pruning-expA-{k1,table}-2026-07-05`,
  `eff-pruning-2026-07-05.md §1/§4`.) B=5 is the *tight* cell (5 = s*(1)=5, zero slack) and it PASSES.
- **k=3, W(8) + √2 — done (example mode).** Pool 1,086,912 → 229,800 (21.14%), 14,504,172 distinct,
  23,436,240 fills, **≈ 3.7 d / 8-core projected** (fill-dominated; pairs ~2 min; joins budget-cut).
  (`eff-pruning-k3fill-2026-07-05.md`.) ⌊5√3⌋ = 8 = this pool. **Reuse; do not re-run.**

## 2. Run — the ONE new cell: k=2 at W(7) + √2, END-TO-END

- **Flags:** `TH10_EXAMPLE_MODE=1 PRUNE_EFF_C2=2` (c=√2, c²=2/1), k=2, **weight pool s = 7 = ⌊5√2⌋.**
  The 07-05 k=2 run used s=6 and stopped at pairs+joins (fills only projected — `SYNC.md:770`); **s=7
  has never been run, and no k=2 end-to-end digest exists at all.**
- **Route k=2 through the full fill + certificate + k-gate to a COMPOSITION digest** — the same
  end-to-end path the k=1 baseline used (extend the `TH10_K3_FILL`-style full-pipeline routing to k=2,
  or run the production `PeriodSolver` with the W(7) example pool + `PRUNE_EFF_C2`). Dedup up to
  **congruence** (`dedupeByCongruence`), not `canonicalKey` alone (snub over-count — NOTES §12.7/§12.11).
- **GATE:** the digest **MUST** equal the certified k=2 anchor **`f3e2e0517191362c`, count 20**,
  per-tiling bijection both directions. Since **W(7) ⊇ W(6) ⊇ certified**, a MISMATCH is a **bug**
  (over/under-merge, join handling, snub dedup) — **not** a completeness loss. Diff per-tiling and log
  loud either way (INCOMPLETE-REGION channel); never silence a digest change.
- **Record:** |W(7)| kept vs full, distinct lattices, Σ fills, and wall-clock split (pairs / joins /
  fills / total). Expect > the W(6) projection (6.17M lattices, Σ1.67M fills, ~6.2 h/8-core) since W(7)
  is one shell looser.

## 3. Optional — k=2 breaking-weight sweep (higher value for the proof)

Run k=2 end-to-end at **s ∈ {5, 6, 7}** (all + √2). Expectation: digest MATCHES `f3e2e051…`/20 at s ≥ 6,
**CHANGES at s = 5** (drops the s*=6 tiling t2016). This empirically **pins s*(2) = 6** — the weight
analogue of the c-sweep that pinned the √2 breaking threshold — and measures exactly how much slack
B(2)=7 carries (one shell). This is the number the TH-10 proof wants; the single W(7) point is not.

## 4. Completeness doctrine (settled rules)

- **Byte-identical flag-off.** Loud ⚑ banner when set. Example mode: **W(7)/W(8) pool depth is UNPROVEN
  ⇒ NO completeness claim** — this is measurement behind a flag.
- **A digest change is the datum, not a bug to silence.** Name every dropped/added tiling.
- Exact `wt` (unpruned all-24-root BFS, not the pruned `shortVectorPool` depth); only the ratio
  threshold uses rational c². (`effFilter.ts` doctrine.)

## 5. Deliverables

- `experiments/results/weight-bound-5sqrtk-<date>.log` — synchronous, progress/ETA, human-readable.
- Table: `k | B(k)=⌊max(5√k,2k+2)⌋ | s*(k) | pool kept | distinct | Σ fills | digest | oracle match | wall`.
  Rows k=1 / k=3 from reuse (cited); k=2 fresh (+ the s∈{5,6,7} rows if the sweep is run).
- One-line verdict: does B(k) keep the full certified k≤3 set? (expected **yes** — k=1 tight at s*=5,
  k=2/k=3 +1 shell slack) + the k=2 wall-clock.
- 3–6 line SYNC entry → the log + this order.

## 6. The real open problem (NOT this run)

This confirms `5√k ≥ s*` on three data points. It does **not** prove `B(k) ≥ s*(k)` for all k: the
tightest currently *provable* O(√k) coefficient is **~8.5** (`th10-walk-stretch-2026-07-06`,
bounded-dilation round bound); the proposal here is **5**. Closing 8.5 → 5 is a proof task (tighten the
dilation / joint-det constant), and k≥4 — where the `2k+2` arm finally binds — has no certified oracle
to test against. **Empirics are settled; the coefficient is the work.**
