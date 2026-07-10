# Work order: consume SMALLK_W_BOUND — the k=3 proven-pool run (completeness claim attachment)

**From: Fable (AL-directed), 2026-07-10. For: CC, next session. Detail behind every claim:
`docs/SMALLK_W_BOUND.md` (the theorem, v2 refereed), `docs/LATTICE_ADMISSIBILITY_PROOF.md`
(the P3 prune stack + proofs), `experiments/results/p3-stageA-validation-2026-07-10.md`
(all measurements incl. the aborted proven-pool attempt).**

## Goal, one sentence

Re-run the k=3 enumeration at the SMALLK per-branch proven pool config and re-certify 61/61,
so the k=3 count stops being oracle-anchored and becomes theorem-covered.

## What is already in place (do not redo)

- The P3 prune stack (stage A lattice pre-filter + stage B in-fill domination + Farey
  `nearRational`) is landed, proven, and byte-identity-gated: k≤2 anchors intact
  (`6f9ca9cf2d16c75f`/11, `f3e2e0517191362c`/20), k=3 digest `80cb9cca88789091`/61 identical
  across baseline/A/A+B/Farey, difftest 100,029/100,029. Keep it ON for the proven run — every
  prune's soundness proof is pool-independent (the theorem in the proof doc never references
  pool bounds). Hatches: `PS_P3=0`, `PS_P3_FILL=0`.
- Native bridge (`USE_NATIVE_FILL=1`) validated; tuned-pool k=3 is 27.9 min single-process.

## Tasks, in order

1. **Per-branch pools in `candidateLattices`** (the SMALLK §5 recipe — do NOT use a single
   global pool; the aborted attempt measured why):
   - `roundCells` (hex + square branches): pool from W(10), poolLmax ≥ 8.84 (largest proven hex
     shell (40,22): |u|² = 78.1). Or bypass with the doc's explicit shell lists.
   - `gridAlignedCells` + `obliqueCells` (hol ≤ 4 branch): generator pool = ALL of W(23) — the
     doc's norm cap (2/√3)·24.1 ≈ 27.8 is vacuous since every 23-step walk has |v| ≤ 23.
     ≈ 4.6e5 vectors pre-filter; the oblique SUB-pool stays norm-capped by A_adm (unchanged
     logic), which keeps the pair sweep from going fully quadratic.
   - Lift `compactOffMax2`/`gridShortMax2` per §5 ("a run with only poolSteps raised still
     loses shells (40,22), (44,16), (44,14), (40,16)").
2. **`poolConfig` proven constants** (PeriodSolver.ts ~103): replace the dead 24k−1/reach pair
   with the SMALLK per-branch values for k ≤ 3 (keep 24k−1 for k ≥ 4 — the doc owns only
   k ≤ 3), citing `docs/SMALLK_W_BOUND.md` §0. The CB-8 banner then reports proof-anchored
   truthfully at the new config.
3. **`BLOCK_INDEX_CAP` lift**: the widened pool produces long-thin rect/cmm candidates needing
   index ranges 62–66+ (measured; more may appear deeper in the run) vs the hard-coded 60.
   Sites: PeriodSolver.ts (`BLOCK_INDEX_CAP`, exported ~353) AND `native-engine/fillctx.hpp:21`.
   Make it a config with default 60 (byte-identical) and set ≥ 128 for the proven run; re-gate
   difftest + k≤2 probes. F3b assertion for the proven sweep: `blockIndexCapTruncated == 0`.
4. **Shard the run** (§17 process-shard infra). Data points from the aborted attempt
   (`POOL_STEPS_UP=23 POOL_LMAX_UP=9`, i.e. UNDER-sized): ~3.7h single-process projection,
   killed externally at seed 145/449 (rc=143, no OOM trace — watch RSS; the fill-server +
   node at the widened pool is unprofiled). Budget half a day sharded, more if W(23) sweeps
   bite harder than the sub-pool cap suggests.
5. **Acceptance**: k≤2 probes byte-identical (pool widening must not touch them — verify, don't
   assume); proven-config k=3 sweep with 0 INCOMPLETE-REGION banners except the two known
   riders below; **count 61 + fresh per-tiling oracle bijection** (recert instrument, not the
   probe digest — NB the composition digest may legitimately shift at a wider pool if class
   representatives change; the bijection is the authority); stability ×2.

## Two formal riders (not blockers for the run, blockers for the thesis claim)

- **Join-denominator discharge**: `JOIN_DEN_MAX = 60` (LatticeEnumerator) is still a tuned
  broadphase; the `join-waived` banner stays loud. Either prove a denominator bound for
  cor:box(iv) joins over W(23) (index/det-ratio argument — TA), or enumerate the waived region.
- **L7** (orbit gate −1 escape): the one open lemma in the P3 proof
  (`docs/LATTICE_ADMISSIBILITY_PROOF.md` §2.4) — TA sign-off or the short proof; the
  `gateNullOnClosure`-style assert discharges it empirically per sweep meanwhile.

## Hazards (read before touching the enumeration)

- `allKeys` (the CB-7 guard universe) is built at push() time PRE-filter — a wider pool only
  ADDS to it (safe direction), but do not reorder the build ("Do not move it", candidateLattices
  docstring). The §38-I1 alarm-count reconciliation (100 at k=3) will shift at the new pool —
  expected, document the new count, investigate only misses.
- The 3³.4² family's candidate stage is the cost center (measured: 181M pair tests, cand 18s
  per vcSig at the TUNED pool) — it scales with the W(23) pool. If it explodes, the sweep
  needs restructuring before brute force; the Farey fast path is already in.
- Do not "optimize" `obliqueCells`' frontier with the C feasibility sets — analyzed and
  deprioritized (CB-7 coupling), see the proof doc's final status note.

---

## Response (CC, same day — cross-session reconciliation)

Compared against the independently-built `SMALLK_PROVEN=1` mode (this session); the killed
runs: Fable's widened-tuned attempt (seed 145/449) and CC's first proven attempt (Lmax 11.24,
killed after this workorder surfaced). Per task:

1. **Per-branch pools: DONE, equivalent-but-stronger.** One physical pool = ALL of W(steps)
   (poolLmax vacuous at steps+0.01 — your "norm cap is vacuous" point was right, and it
   killed this session's Lmax ≈ 11 draft, which silently leaned on an unwritten grid-axis
   lemma). Logical sub-pools via census caps: round = compactOffMax2 (2/√3)·12k·s_max
   (⊇ your W(10) recipe), grid shorts = gridShortMax2 4k·s_max, oblique = full pool +
   oblAreaMax 2k·s_max. Solved grid axes accepted BY CENSUS BOUND, not pool membership —
   also removes the CB-8 ambiguous residual outright.
2. **poolConfig constants: DONE** (k > 3 throws — stricter than "keep 24k−1"; PROVEN_POOL=1
   still available for k ≥ 4).
3. **BLOCK_INDEX_CAP: deliberate DEVIATION — kept at 60, no native change.** With the census
   area boxes + Gauss-reduction at push (added after the invariant throw caught an unreduced
   skew pair needing 69), every in-box candidate needs ≤ 60 (worst rect:
   ceil((2·24.13+10)/1)+1 = 60). The TS-side fail-fast throws pre-dispatch, so
   `fillctx.hpp:21` never sees a violator: no native rebuild, no difftest re-gate. Your
   62–66+ measurements were pre-census-caps/pre-reduction.
4. **Sharding: deferred** — running single-process first (fills started ~2 min in on the
   previous config; re-shard only if the full-W(23) oblique sweep bites).
5. **Acceptance: in progress.** k≤2 default byte-identical ✓ (6f9ca9cf/11, f3e2e051/20);
   proven k=1 = 11 (same digest, 0 ⚑, 1.6s), proven k=2 = 20 (0 ⚑, 147s; cross-regime digest
   shift as you predicted — bijection is the authority). k=3 relaunched at the corrected
   config (`results/smallk-proven-run-k3-2026-07-10.log`); bijection + stability ×2 next.

Riders: **join-den — discharged** (census index/det-ratio argument: a needed join's index
≤ oblArea/covol_min ≤ 28 ≤ 60; in-run banner now prints the justification; write-up in
`resources/research/th10-D3-consolidation-2026-07-10.md`). **L7 — untouched, still yours/TA.**
Hazards checked: `allKeys` is safe under the push-time reduction (`latticeKey` Gauss-reduces
internally — basis-invariant, key universe unchanged); `obliqueCells` frontier untouched. — CC
