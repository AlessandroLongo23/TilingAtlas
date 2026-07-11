# STATUS — TilingAtlas (current-state cache)

> **What this file is.** The 30-second "where are we" snapshot. **Mutable, disposable,
> clobber-tolerant** — if two agents overwrite it, nothing is lost, because the *canonical*
> history lives in the append-only **ledgers** below. Regenerate it from the latest signed
> entry of each ledger. **Never write history here.** — last updated 2026-07-11, CC
> (acting as TA too, AL authorization 2026-07-10).

## Knowledge model (read once, then follow it)

Two tiers. Do not mix them.

- **Ledgers — sacred: append-only, never trimmed, ONE writer per file.** The natural-language
  history the thesis (`../../thesis/chapters/journey.tex`) is written from. Rotate to
  `archive/<name>-YYYY-MM.md` when large (rotation loses nothing).
  - `DEVELOPMENT_NOTES.md` — CC's session-by-session narrative (code/algorithm).
  - `../../resources/research/TA_LOG.md` — TA's chronological ledger (theory/proofs); topical
    detail in the sibling `resources/research/*.md` notes.
  - `SYNC.md` — CC⇄TA handoff log. Entries **3–6 lines**: what landed + commit + ledger link.
    Full pre-2026-06 history in `archive/SYNC-2026-06.md`.
- **Cache — this file.** Current state only. Overwrite freely.

## Frontier (2026-07-11) — the weight-law program

- ★★★ **k=3 COMPLETENESS CLAIM CLOSED — 61 theorem-covered at the proven pool** (2026-07-11).
  Proof-anchored SMALLK_PROVEN=1 run certified three ways, all 61 / 303 raw cells / **0 ⚑**:
  serial probe (digest `6ef92456`), scout ×2 byte-identical (digest `7f2f4160`, = stability ×2).
  Per-tiling oracle bijection PASS (61/61 both ways, t3007 present, CB-4 differential 242+1830
  clean). The 61 no longer rest on the oracle — the proven W-pool (SMALLK_W_BOUND v2) reaches
  every k=3 period by theorem. Frozen artifact `.scout-cache/k3-proven-accepted-7f2f4160092c7ff3.ndjson`;
  SYNC 2026-07-11. Open (benign, confirm before thesis): probe-vs-scout digest gap is
  representative-selection (raw-min-key vs primitive-reduced), same partition — diagnosis in flight.
- ★★ **Small-k weight theorem PROVEN + REFEREED (3 agents, no fatal): max W = 5, 6, 7 at
  k = 1, 2, 3 EXACT**, per-branch proven pool radii (hex 6/8/10 via census+shells, square
  3/6/7, hol ≤ 4 via thm:weight generators 7/15/23 + joins). `docs/SMALLK_W_BOUND.md` (v2)
  + appendix PDF + artifacts `experiments/results/smallk-*`. **Consumed by the pipeline**:
  `SMALLK_PROVEN=1` mode (PeriodSolver poolConfig) is the proof-anchored k≤3 regime — full W(23)
  generator pool, per-branch census area boxes, solved axes by theorem, block-cap fail-fast throw.
- ★★ **pgg law proven for width-2 (Thms A/B/C, refereed)**: W = 2k + 2⌊(k−1)/3⌋ exact,
  attained ∀k ≥ 2; global-max-for-k≥4 claim is measured (k ≤ 13) + partially proven.
  `docs/WEIGHT_CEILING_PROOF.md` + appendix PDF.
- ★ **The no-caveats program has a DAG** (`docs/WEIGHT_PROOF_DAG.md`, 10 nodes, critical
  path D1→D6→D10). Landed 2026-07-10: **D1 slab engine incr. 1a** (width-2 T/S/H world
  machine-reproduced; `tools/slab-engine/engine.py`); **D3 consolidation REFEREED** — two
  bands CLOSED vs the pgg law via c₀-bypass word climbs (λ₁ = 1: W ≤ 2k; λ₁ = √3 hex:
  W ≤ 2k), one blocker (write E2-v2); **D2 ≡ E4-A′ ≡ 3.1(d)** identified (one finite check
  gates 378 tilings + unconditionalizes Thms A/C — engine incr. 1b closes it); **D6-snub
  re-scoped honestly** (0.966-forcing refuted, 829 domino vertices in-catalogue; route =
  row-word classification via engine incr. 2). Ledgers: SYNC 2026-07-10 entries ×5,
  `resources/research/th10-D3-consolidation-2026-07-10.md`, TA_LOG.
- Star lane (parked, scoped 2026-07-10): Myers anatomy + parametrization analysis done in
  conversation; W-machinery splits universal/family-modular; free-α families need TH-8
  regardless. No new artifacts beyond `experiments/results/smallk-*` siblings.

## Frontier (2026-06-10 evening — previous)

- ★★ **k ≤ 2 THEOREM-CERTIFIED, oracle-independent** (B1 + canonical augmentation + lem:ddrealize +
  lem:ddrealizer realizer + lem:corona; per-tiling torus match both directions). NOTES §27.
- ★★ **k = 3 RE-CERTIFIED PER-TILING, end-to-end CLOSED** (2026-06-10): the old certified digest
  `eb34499d5fba3457` was per-tiling WRONG (canceling duplicate + missing t3007 — NOTES §28); both
  defects fixed (§29), full no-cap re-sweep 449/449 seeds → **new anchor `99919f42a7b58e76`/61**,
  per-tiling oracle bijection PASSED ×2 (`recert-oracle-match.ts`); DB: old run de-certified, recert
  run `52d0cb2e` certified; figures snapshot/orbits/oracle-map regenerated → **92/92**; k=3 gallery
  FINAL incl. t3007.pdf. NOTES §31. ★ **Stability ×2 PASSED** (fresh sweep reproduced
  `99919f42a7b58e76`/61 byte-identical, 449/449, 0 timeouts —
  `experiments/results/k3-stability-regression-0d6c96b-2026-06-10.log`) — single-run residue closed;
  also the k=3 batch acceptance for the CB landings below.
- ★ **Review batch CB-2/7/8 LANDED, digest-neutral** (k≤2 byte-identical post-merge, `b81e823`):
  CB-2 Surd.sign provable error-bound filter (`216302b` — the fuzz test found a REAL wrong-sign at
  coefficient height ~2⁵⁶: the old 1e-6 gate was unsound in fact, not just in principle; NOTES §30);
  CB-7 primitivity-rejection guard + CB-8 tuned-pool regime banner/reach counting (`eefa6ac`,
  diagnostics-only; NOTES §32). **§32.2 Finding 2 SIGNED OFF by TA 2026-06-10** (sound; see
  `../resources/research/cb7-finding2-signoff-2026-06-10.md`); **all 3 sign-off asks LANDED** on
  `fix/cb7-finding2-followups` @ `d433b95` (counter + loud star-ladder truncation + docstring;
  NOTES §33) — **MERGED `9674c95`** after k≤2 probe re-check byte-identical on d433b95
  (`cb7-followups-probes-d433b95-2026-06-10.log`). (CB-9 push ✓ 2026-06-10.)
- ★ **Review batch CB-5/CB-4/CB-6 LANDED on `fix/cb5-cb4-cb6` @ `74e03a9` — ALL CB items now
  closed** (NOTES §35): CB-5 N≠24 throw (`983b8e3`); CB-4 always-on equivalence guard + standing
  import-disjoint congruence differential wired into the recert harness (`942da53`); CB-6 cull
  R_P+maxCircum (`46b0f79`). **The CB-4 guard fired on first contact with the k=3 artifact** —
  `reducedClassKey`'s float-window reduction was NOT class-canonical on skewed bases (direction-
  dependent false negatives; completeness, never soundness; certified 61 unaffected — lucky third
  rep). Fixed exact (`c802989`). Acceptance: k≤2 probes byte-identical ×2, suite 327/327, recert
  ★ PASS 61/61 + differential 0/2131 mismatches (`cb456-probes-*`, `k3-recert-...-18-22.log`).
  **MERGED to master 2026-06-11** (NOTES §35); the fresh k=3 batch-acceptance sweep ran under OP-1/2/3
  below (449/449, recert 61/61). ⚑ TA: thesis §19.6 congruence narrative gains the §35 sibling caveat.
- ★ **OP-1/2/3 LANDED, `feat/op123-sound-levers` @ `cf1908e`** (off master `0291e83`; NOTES §35) —
  the three sound levers in the mandated order. OP-1 prop:typeprune P2+V<k (k≤2 byte-identical; k=3
  re-baselined `99919f42a7b58e76`→`b5c622070cff8b4`, raw 362→302 = duplicate-cert cut). OP-2 census +
  counters (digest byte-identical; ⚑ branch-enum memoization is orbifold-lane, DEFERRED). OP-3 stage 1
  oblique-only grid-orbit reduction per lem:orbitdedup (fills CONSERVED raw=302; k=3 re-baselined
  `11ee1b1d582811d1`/61). All three: **61/61 per-tiling bijection** (t3007 in, 0 orphans/dupes).
  ★ **OP-9 Σ-vs-distinct table exists** (oblique 17.4×, ALL 20.6×; post-OP-3 oblique work-items 12.0×
  down). ✓ **R1 RESOLVED** (`1aa1c84`, AL-directed) — the second `reducedClassKey` float-tie false-NEG
  (t3019, 1:4.73 skinny cell), surfaced by OP-1's sound P2, is fixed at the source: exact (u,v)-coord
  reduction, no float window. Digest-neutral (k≤2 byte-identical, k=3 recert 61/61 with the exact-witness
  fallback now DORMANT). No leg-1 congruence caveat remains for the regular family; CB-4 disjoint in-file.
  F3b banners 76→0 post-OP-3 (A/B discharge abandoned ~50h; discharged on census=0 + the bijection).
  **MERGED to master 2026-06-11 (NOTES §38, op123 merge `7a19b6a`)** — master keeps its EQUIVALENT exact
  `surdFloor` reducedClassKey (op123's t3019 fixture passes on it; R2 witness redundant). Fresh no-cap
  sweep 449/449 → recert ★ 61/61, digest `11ee1b1d582811d1`/61, differential 0/2071.
- **DG-1 verdict stands:** proven-config lattice run INFEASIBLE even at k=1 (≈1,370 yr) ⇒ thesis
  honest-rewrite (TX option (b)) merged; the measurement is itself a thesis result. NOTES §25.
- Orbifold: correct-but-gated (NOTES §23.9). Star: 4(j) spike certified k=1 exact; ST-1 conventions
  CLOSED in thesis master. Seed-anchored D-D dead by mechanism (NOTES §26).
- ★ **ST-2 + ST-3(1+3) + ST-9 MERGED to master** (2026-06-11, NOTES §36, digest-neutral; ★ TA oracle
  spot-check PASS 43/43 `d8fd260`): Myers-2009 k=2 oracle (43 records, 34 in-ring, pins 36/40/42);
  productive star-fill positively covered via 4(i) + mutation check; honest run-matrix + §24 retitle.
  ⚑ **4(i) is measured OUTSIDE the tuned pool ⇒ tuned dentreg ceiling 12/13 Fig-4 tilings**.
- ★ **TH-4 / TH-13 star tables MERGED to master** (NOTES §37): d_max(envelope) = 9 exact ⇒ δ ≤ 18k,
  F ≤ 42k; TH-13 19/8/5 + single-variant regular-filler rider — constants INPUT, discharge is TA's.
- ★ **star-fill suite-gate MERGED**: heavy 4(i) test behind `RUN_STAR_FILL=1` (was OOMing default
  `pnpm test`). Final full suite 40/40 files, 386 passed, 1 skipped, 0 OOM.
- Orbifold: correct-but-gated (NOTES §23.9), branch `feat/c4-pool-bypass` PARKED. Star: 4(j) spike
  certified k=1 exact; ST-1 closed + TH-3 star theory landed (TA). Seed-anchored D-D dead by
  mechanism (NOTES §26).

## Thesis state

- **Thesis master = `7d76b58`** (ff-merged 2026-06-10 late, AL-directed; 85pp clean post-merge,
  0 undefined refs). Contains, as scoped commits: TH-1 octagon lemma (`8595b7d`), results
  restructure + prose swap (`ece66b0`), ST-1 star conventions closed (`cefccc6`), TH-9
  lem:orbitdedup (`ae61853`), D-D bound closed — lem:flagsharp δ≤12k−2 tight (`efe6d6c`), TH-3
  star quotient repair (`7d76b58`). Resources ledger at `9b0638e` (incl. the exact-δ script/data
  for the certified 92). Detail: TA_LOG (2026-06-10).
- **TH-2/C1-Part-B DISCHARGED** (2026-06-10 late): fill completeness is a lemma, not an assumption
  — `lem:fillreach` + `rem:fillreach`, prop:fanseed restated; branch `th2-fillreach-2026-06-10` @
  `8c0a39d` (87pp clean, 0 undefined refs), pending AL review/merge. Resources at `24451c0`.
  ✓ Both CC work orders from the audit LANDED (`c8bc258`, NOTES §34): buildBlock `min(60,·)` index
  cap asserted per candidate (⚑ + `diag.blockIndexCapTruncated`; sweeps must assert 0) and
  maxCellPolys default = max(20k+24, 24k); k≤2 probes byte-identical, F3 flags silent on the
  certified record. Detail: `../../resources/research/fill-completeness-lemma-TH2-2026-06-10.md`.

## Live NEXT — one per party

See `docs/NEXT.md` (the single curated source — duplicated nowhere else).

## Repo state (re-verify on read — this section goes stale fastest)

- **master = `82c89f1` (suite-gate merge) + doc-cache commits on top** (2026-06-11 wind-down —
  **NOT pushed**, ~47 ahead of origin/master). Linear
  chain on top of the prior `0bfbd0f`: ST merge (`f4c0973`), th4-th13 merge (`22f16b4`), op123 merge
  (`7a19b6a`) + AL ST-3 spot-check (`d8fd260`) + TA SEAT DENTS entry (`a54fa4f`) + op123 evidence
  (`7e6716b`), star-fill suite-gate merge (`82c89f1`). Each batch digest-gated; full suite 40/40 files,
  386 pass / 1 skip / 0 OOM.
- **k=3 anchor RE-BASELINED `99919f42a7b58e76` → `11ee1b1d582811d1`/61** (OP-3 orbit-reduced reps; recert
  ★ 61/61 per-tiling bijection, t3007 in). Artifact `.scout-cache/k3_3.4.6.12_cap0.ndjson`.
  ⚑ Old k=3 resume caches INVALID (seed indices shifted) — always fresh.
- **Open branches: master + 2 PARKED** — `feat/c1-proven-seeding` (merged ref, **8 uncommitted WIP files**
  in its worktree — AL keep/discard call) and `feat/c4-pool-bypass` (orbifold, parked). Detached worktree
  `op123-op2-sweep` (15 uncommitted scratch files) left untouched.
- Review work-orders: `docs/review-2026-06-09/` (CB code items ALL closed; ST-2/3/9 + TH-4/13 done).
- Supabase: k=3 run `52d0cb2e` certified (61) — ⚑ reflects the OLD `99919f42` digest; a re-cert DB
  refresh for the new `11ee1b1d` anchor is a follow-up (not done in the wind-down).
- **Reference (Oracle) shelf now serves k=8–10** (branch `feat/reference-atlas-k8-10`): per-k lazy
  shards `public/reference-atlas-k{8,9,10}.json` (2850/5960/11866 tilings, ~15/34/73 MB), fetched
  on demand when that k is selected. Čtrnáct, `reproduced` (display-only, never certified). Base
  atlas + render (24/page) unchanged. Spec/plan under `docs/superpowers/`.

## Ledger index

`DEVELOPMENT_NOTES.md` (CC narrative) · `SYNC.md` (handoff) + `archive/` (rotated history) ·
`../../resources/research/TA_LOG.md` (TA narrative) + `resources/research/*.md` (topical) ·
`../../thesis/chapters/journey.tex` (the sink the ledgers feed).
