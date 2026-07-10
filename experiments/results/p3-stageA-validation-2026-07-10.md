# P3 stage A (C lattice pre-filter) — validation runs, 2026-07-10

Change under test: `vcFeasAreaSets` + `bravaisClassExact` (LatticeEnumerator) + the C(Λ,S)
divisor-feasibility skip in `candidateLattices` (PeriodSolver), scoped to k ≥ 3, regular seeds,
`PS_P3=0` escape hatch, `cSkipped` diag counter. Proof: docs/LATTICE_ADMISSIBILITY_PROOF.md.
V0 scout: 0 violations / 1311 candidates. All runs `USE_NATIVE_FILL=1`, per-seed cap 0 (uncapped).

Acceptance: k=1 and k=2 digests OFF == ON (and == historical anchors); k=3 digest OFF == ON,
count 61 both; wall-clock ratio is the deliverable.


## k1-OFF  (PS_P3=0, k=1, {3,4,6,8,12}, native, uncapped)
k=1: 11 distinct tilings (from 11 raw cells), 0 seeds timed out, 1.3s total
COMPOSITION digest=6f9ca9cf2d16c75f count=11
wall=2s rc=0 (full log: /private/tmp/claude-501/-Users-alessandro-Desktop-University-Thesis-TilingAtlas/22bac33c-286e-44e4-9265-48bb4be45ab2/scratchpad/probe-k1-OFF.log)

## k1-ON  (PS_P3=1, k=1, {3,4,6,8,12}, native, uncapped)
k=1: 11 distinct tilings (from 11 raw cells), 0 seeds timed out, 1.3s total
COMPOSITION digest=6f9ca9cf2d16c75f count=11
wall=2s rc=0 (full log: /private/tmp/claude-501/-Users-alessandro-Desktop-University-Thesis-TilingAtlas/22bac33c-286e-44e4-9265-48bb4be45ab2/scratchpad/probe-k1-ON.log)

## k2-OFF  (PS_P3=0, k=2, {3,4,6,12}, native, uncapped)
k=2: 20 distinct tilings (from 25 raw cells), 0 seeds timed out, 26.9s total
COMPOSITION digest=f3e2e0517191362c count=20
wall=31s rc=0 (full log: /private/tmp/claude-501/-Users-alessandro-Desktop-University-Thesis-TilingAtlas/22bac33c-286e-44e4-9265-48bb4be45ab2/scratchpad/probe-k2-OFF.log)

## k2-ON  (PS_P3=1, k=2, {3,4,6,12}, native, uncapped)
k=2: 20 distinct tilings (from 25 raw cells), 0 seeds timed out, 26.9s total
COMPOSITION digest=f3e2e0517191362c count=20
wall=31s rc=0 (full log: /private/tmp/claude-501/-Users-alessandro-Desktop-University-Thesis-TilingAtlas/22bac33c-286e-44e4-9265-48bb4be45ab2/scratchpad/probe-k2-ON.log)

## k3-ON  (PS_P3=1, k=3, {3,4,6,12}, native, uncapped)
started 11:36:49 — tail -f /private/tmp/claude-501/-Users-alessandro-Desktop-University-Thesis-TilingAtlas/22bac33c-286e-44e4-9265-48bb4be45ab2/scratchpad/probe-k3-ON.log for live per-seed progress
k=3: 61 distinct tilings (from 303 raw cells), 0 seeds timed out, 1681.7s total
COMPOSITION digest=80cb9cca88789091 count=61
wall=1808s rc=0 cSkip-sum(logged seeds only)=17136 (full log: /private/tmp/claude-501/-Users-alessandro-Desktop-University-Thesis-TilingAtlas/22bac33c-286e-44e4-9265-48bb4be45ab2/scratchpad/probe-k3-ON.log)

## k3-OFF  (PS_P3=0, k=3, {3,4,6,12}, native, uncapped)
started 12:06:57 — tail -f /private/tmp/claude-501/-Users-alessandro-Desktop-University-Thesis-TilingAtlas/22bac33c-286e-44e4-9265-48bb4be45ab2/scratchpad/probe-k3-OFF.log for live per-seed progress
k=3: 61 distinct tilings (from 303 raw cells), 0 seeds timed out, 2492.2s total
COMPOSITION digest=80cb9cca88789091 count=61
wall=2621s rc=0 cSkip-sum(logged seeds only)=0 (full log: /private/tmp/claude-501/-Users-alessandro-Desktop-University-Thesis-TilingAtlas/22bac33c-286e-44e4-9265-48bb4be45ab2/scratchpad/probe-k3-OFF.log)

# VERDICT (all legs complete)

| leg | digest | count | wall |
|---|---|---|---|
| k=1 OFF / ON | `6f9ca9cf2d16c75f` both | 11 both | 2s / 2s |
| k=2 OFF / ON | `f3e2e0517191362c` both | 20 both | 31s / 31s |
| k=3 OFF (baseline) | `80cb9cca88789091` | 61 | 2621s (43.7 min) |
| k=3 ON | `80cb9cca88789091` | 61 | 1808s (30.1 min) |

- **Digest-neutral at every k** (ON == OFF byte-identical); k≤2 also equal the certified anchors.
  k=3 count = 61 = the oracle target on BOTH legs — the filter dropped nothing.
- **Speedup: 1.45× wall (1.48× on solve time, excluding the ~130s seed-gen both legs pay).**
  Bimodal: the hex 3⁶/3⁴.6 family drops 6–8× per seed (55.7→8.7s, 62.9→11.9s — the scout's
  prediction realized); the 3³.4² family barely moves and now owns the budget (~611 surviving
  candidates, fan multiplicity 270–370, its C-killed candidates were the cheap oblique fills).
- The V0 scout's "79% of fill time on C-rejected lattices" was measured on a sample whose heavy
  seed was hex-family; the whole-run heavy tail is 3³.4². Lesson recorded: sample the tail by
  family before projecting.
- NB the k=3 probe COMPOSITION digest has no historical anchor (the June `11ee1b1d…` is a sweep-
  artifact digest from a different instrument); the ON==OFF equality on this tree is the gate.
- Remaining V2 formal step (CC/AL lane): per-tiling oracle bijection (recert harness) on a P3-ON
  sweep artifact, and TA sign-off on lemma L7 (the gate −1 escape).

## k3-A+B  (PS_P3 on, PS_P3_FILL on = stage A + stage B domination, k=3, {3,4,6,12}, native, uncapped)
started 13:05:04
k=3: 61 distinct tilings (from 303 raw cells), 0 seeds timed out, 1542.6s total
COMPOSITION digest=80cb9cca88789091 count=61
wall=1671s rc=0 (stage-A reference: 1808s, digest 80cb9cca88789091/61)

## k3-A+B  (PS_P3 on, PS_P3_FILL on = stage A + B + Farey nearRational, k=3, {3,4,6,12}, native, uncapped)
started 13:45:50

# Stage B (in-fill domination) + the 3³.4² profile finding + Farey nearRational

- **k3-A+B leg: digest `80cb9cca88789091`, count 61, wall 1671s (27.9 min)** — digest identical to
  stage-A and baseline; cumulative speedup 2621→1671 = 1.57×. Stage B's marginal is 7.6%: it halves
  the hex family again (seed [12]: 8.1→4.7s) but is a **no-op on the 3³.4² family** (seed [75]:
  38.6→39.6s) — that family's tile multiset is already FORCED by the det (triangle/square areas are
  ℚ-independent), so its waste is arrangement redundancy, which counts cannot cut.
- **PS_PROFILE on seed [75] `[3⁶;3³.4.4;4⁴]` (native fills): cand=21.2s, fill=4.1s, prep≈13.6s** —
  the §49 "cand≈0ms" claim is family-biased: on 3³.4² the candidate stage is ~55% of the seed (the
  oblique join-closure swept 181,648,754 nearRational tests). Also `ssDedup=1500` — the seed-state
  dedup DOES fire on this fan-heavy family (mechanism healthy), `p1Prune=0` as expected,
  `p3Prune=0` is the bridge-counter artifact (native does not report inner counters).
- **Farey fast path for `nearRational`** (identical accept set: Farey-grid binary search decides
  the dominant FALSE case, near-boundary falls back to the verbatim loop; differential-tested over
  200k random + ~38k boundary probes): cand 21.2→18.2s (−14%). The remaining sweep cost is the
  O(frontier×pool) pair count itself (~181M coordinate solves), not the per-pair test.
- **Named residuals (k=3 wall after this session), in size order:**
  1. the 3³.4² join-closure pair count (~18s per heavy vcSig, cached per name) — cutting it needs
     a frontier shrink, which is CB-7-universe-coupled (see the proof doc's deprioritization note);
  2. per-seed TS seed-prep on fan lattices (~13.6s on [75]: dedupModLattice+stateKey × 611 lattices
     × fan seed-sets) — candidates: memoize applySeedMapInv per map, or move stateKey native;
  3. process sharding (§17 infra): pure wall-clock division, no proof surface.
k=3: 61 distinct tilings (from 303 raw cells), 0 seeds timed out, 1542.9s total
COMPOSITION digest=80cb9cca88789091 count=61
wall=1675s rc=0 (A+B reference: 1671s, digest 80cb9cca88789091/61)

# FINAL (all legs, 2026-07-10 session close)

| k=3 leg (449 seeds, {3,4,6,12}, native, uncapped) | digest | count | wall |
|---|---|---|---|
| baseline (PS_P3=0) | `80cb9cca88789091` | 61 | 2621s (43.7 min) |
| stage A (C pre-filter) | `80cb9cca88789091` | 61 | 1808s (30.1 min) |
| stage A+B (+ in-fill domination) | `80cb9cca88789091` | 61 | 1671s (27.9 min) |
| + Farey nearRational | `80cb9cca88789091` | 61 | 1675s (≈ A+B: wall-neutral in aggregate; real but small per heavy seed, [75] 39.6→36.8s) |

**Cumulative: 43.7 → 27.9 min (1.57×), digest byte-identical on every leg, count 61 = oracle
target throughout; k≤2 anchors byte-identical after every change.** The k=3 digest is also
stability-confirmed (three independent runs, same digest). Pure-TS pre-session reference: ~14 h.

## k3-PROVEN-POOL  (POOL_STEPS_UP=23 POOL_LMAX_UP=9 per docs/SMALLK_W_BOUND.md; P3 on; native; uncapped)
started 14:41:51
INCOMPLETE-REGION banners: 2589
wall=4428s rc=143 (tuned-pool reference: 1671s, digest 80cb9cca88789091/61)

# k3-PROVEN-POOL attempt (POOL_STEPS_UP=23 POOL_LMAX_UP=9) — ABORTED, three findings

Run killed externally (rc=143/SIGTERM, no OOM message) at seed ~145/449, 4428s — projected ~3.7h.
Findings that gate the real proven-config run (all consumption-side, none touching the theorem):
1. **My config was NOT the proven superset**: SMALLK §5 requires the non-rigid generator pool
   W(23) ∩ {|v| ≤ (2/√3)·24.1 ≈ 27.8} — and since every weight-23 walk has |v| ≤ 23 < 27.8, the
   norm cap is VACUOUS: the generator pool is ALL of W(23) ≈ 4.6e5 vectors. POOL_LMAX_UP=9
   under-covered the hol≤4 branch. Per-branch pools (doc's own recommendation) are required:
   hex/square from W(10)/Lmax ≥ 8.84 (or the explicit shell lists), non-rigid from W(23).
2. **F3b fires at the widened pool**: long-thin gridAligned candidates need block index ranges
   62–66+ > BLOCK_INDEX_CAP=60 ⇒ blocks under-built ⇒ those candidates are not
   completeness-grade. The cap must be raised (config + native fillctx.hpp + difftest re-gate)
   before any proven-config run counts.
3. **Cost**: even at the under-sized pool, ~3.7h single-process; W(23) oblique pair/join sweeps
   are O(sub×4.6e5) per vcSig — needs sharding and/or sweep restructuring.
Consumption work order (CC lane): per-branch pool wiring per SMALLK §5, BLOCK_INDEX_CAP lift,
poolConfig proven-constant update citing the doc, sharded run, then recert 61/61 bijection.
