# k=3 fill-cost measurement under √2 pruning — RESULTS (2026-07-05)

**Owner: CC. Work order: `experiments/k3-fillcost-workorder-2026-07-05.md`. Follows the eff-pruning
Exp A/B (`eff-pruning-2026-07-05.md`). Status: measured (n=4259); 15k-sample refinement of the mean
in flight. EXAMPLE MODE — W(8) is the unproven 2k+2 pool; no count/completeness claim.**

The efficiency filter made the OOM-ing k=2 case tractable; here it makes the k=3 pair→distinct→fill
path run (it OOM'd unfiltered), returning the two numbers every k=3 estimate previously MODELED: the
real **distinct-lattice count** and the real **per-fill cost**. Machinery: `scripts/th10-scout.ts`
`TH10_K3_FILL=1` (routes k=3 through the full pipeline + a stratified fill sample). Raw log:
`eff-pruning-k3fill-2026-07-05.log`.

## Setup

- c = √2 (`PRUNE_EFF_C2=2`), k=3, W(8). Pool pruned **1,086,912 → 229,800** (21.14% kept). Per-weight
  shell kept: wt1 100% · wt4 31% · wt6 23% · wt8 20% (higher shells prune harder).
- Single process, 10-core machine, heap 22 GB, `FAMILY_GUARD_M=30`. Total run 76.6 min (no OOM).

## 1. Distinct-lattice count (measured, replaces the ~1.7e7 model)

- Pairs: **2.64e10** examined in **14.4 min** (1 core, 3.05e7/s) → **14,504,172 distinct admissible
  lattices** (sharp ≤72-tile). The prior estimate MODELED ~1.7e7; **measured is ~15% below it.**
- All **449/449 seeds** admit ≥1 lattice; per-seed fill counts are extremely skewed (24 … 462,434 —
  a handful of seeds carry most of the work).
- **Σ per-seed fill work = 23,436,240** — the real total k=3 fill count at √2 (≈1.6 fills per distinct
  lattice, from seed multiplicity).

## 2. Joins at k=3 — measured, NOT the k≤2 pattern

- √2: join closure **budget-cut** (30 min cap) after **1 round**, +48,952 lattices, **0 admissible-det**
  — did **not** complete (14.5M-lattice closure is too big to finish in budget).
- BUT at a tight prune (smoke, c²=1.1) the closure **completed in 3 rounds and added 12 admissible-det
  lattices** — so **k=3 joins are NOT trivially empty** (unlike k≤2's proven 0). The work order said
  "expect 0 per the k≤2 pattern — but measure": measured, joins do contribute at k=3, and the closure
  is a real (budget-bound) cost the completeness story must account for.

## 3. Per-fill cost — HEAVY-TAILED, tail-dominated (the key finding) — two samples

| stat | n=4259 | **n=15,209** |
|------|--------|--------------|
| p50 | 43 | **42** |
| p90 | 87 | **81** |
| p99 | 151 | **135** |
| **mean** | 148.5 | **108.98** |
| **max** | 178,077 (178 s) | **202,676 (203 s!)** |

- **The bulk is fast and rock-stable across both samples** (p50 42–43 ms, p90 81–87 ms, p99 135–151 ms).
- But there are **rare catastrophic fills of 100+ seconds** — genuine hard cells (zero cap/INCOMPLETE
  warnings; a real long solve+certify), not artifacts.
- **The mean is tail-dominated and NOT fully pinnable by sampling.** At n=4259 the single 178 s fill
  was 28% of the sample time (mean 148.5); at n=15,209 the mean settled to 108.98 — but the **max GREW
  to 203 s**, exactly the signature of a heavy tail (a larger sample finds a larger max). So the mean
  is bounded to a range (~109–148 ms), not a point; the total-time projection inherits that.
- Per-fill mean by cell-size quartile (n=15k): Q1 33 · Q2 80 · Q3 200 · Q4 123 ms — the cost climbs
  with cell size then the giants (clustered in the larger-cell bands) perturb the top quartiles.

## 4. Projection — the measured 3-way wall-clock split (on 8 cores)

Full fill stage = 23,436,240 fills × per-fill (n=15,209 basis):

| per-fill basis | 1 core | **8 cores** |
|----------------|--------|-------------|
| p50 42 ms (bulk) | 11.4 d | **~1.4 d** |
| **mean 109 ms** (tail-incl., firmed) | 29.6 d | **~3.7 d** |
| p99 135 ms | 37 d | ~4.6 d |
| (n=4259 mean 148 ms, for range) | 40 d | ~5.0 d |

**Three-way split at √2 (8 cores, projected):**
- **Pairs:** ~2 min (14.4 min / 1 core; embarrassingly parallel).
- **Joins:** incomplete at √2 (budget-cut; 0 admissible-det in the completed round) — a bounded but
  unfinished cost.
- **Fills:** **~1.4–5 days (DOMINANT)**, best estimate **~3.7 days** — the whole k=3 wall-clock is the
  fill stage.

**Verdict:** at √2 the prior "fills ~1 day–7 weeks on 8 cores" width **narrows to ~1.4–5 days (best
estimate ~3.7 d), MEASURED** — k=3 is fill-dominated and lands in **days, not weeks**. The residual
uncertainty is entirely the **catastrophic-fill tail** (rare 100 s+ cells): it drives the mean,
sampling tightens but cannot eliminate it (n×3.5 firmed the mean 148→109 ms yet the max grew 178→203 s),
and it — not the typical 42 ms fill — is the real k=3 timing risk.

**EXAMPLE MODE:** W(8) pool depth (s\*≤3 = 8) is UNPROVEN. This closes only the **timing** half; total
k=3 feasibility = this measured per-fill × the pool the proof licenses (s=8 vs the proven s=10 ⇒ a
much larger pool, hence more fills at the same per-fill cost).

## 5. Refinement (15k sample) — DONE

The 15,209-fill re-run (`eff-pruning-k3fill-15k-2026-07-05.log`) **reproduced the distinct count
(14,504,172) and fill count (23,436,240) byte-identically** (deterministic), confirmed the **stable
bulk** (p50 42 / p90 81 / p99 135 ms), and **firmed the mean to 109 ms** (from 148 at n=4259). But the
**max grew 178 s → 203 s** — proof the tail is heavy and the mean is range-bounded, not point-pinnable
by sampling. §3/§4 now carry the 15k numbers.

## 6. Bottom line for the k=3 timing question

- k=3 distinct-lattice count at √2 = **14,504,172** (measured, was ~1.7e7 model); fill work =
  **23,436,240**.
- k=3 wall-clock at √2 is **fill-dominated ≈ 3.7 days on 8 cores** (range 1.4–5 d), pairs ~2 min,
  joins a bounded-but-unfinished closure that — unlike k≤2 — **does add admissible-det lattices**.
- The timing half of "how long does k=3 take" is now **measured, not modeled**. The pool-depth half
  stays with the AL/TA √2 + weight-bound proof (s=8 example vs s=10 proven ⇒ scale the fill count, same
  per-fill). Days, not weeks — the efficiency filter is what made this measurable at all.
