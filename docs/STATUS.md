# STATUS — TilingAtlas (current-state cache)

> **What this file is.** The 30-second "where are we" snapshot. **Mutable, disposable,
> clobber-tolerant** — if two agents overwrite it, nothing is lost, because the *canonical*
> history lives in the append-only **ledgers** below. Regenerate it from the latest signed
> entry of each ledger. **Never write history here.** — last updated 2026-06-10 (evening), CC.

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

## Frontier (2026-06-10 evening)

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
  (`cb7-followups-probes-d433b95-2026-06-10.log`). Remaining review code items: CB-4, CB-5, CB-6
  (CB-9 push ✓ 2026-06-10).
- **DG-1 verdict stands:** proven-config lattice run INFEASIBLE even at k=1 (≈1,370 yr) ⇒ thesis
  honest-rewrite (TX option (b)) merged; the measurement is itself a thesis result. NOTES §25.
- Orbifold: correct-but-gated (NOTES §23.9). Star: 4(j) spike certified k=1 exact; ST-1/TX-7
  conventions gate the next increment (TA). Seed-anchored D-D dead by mechanism (NOTES §26).

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
  ⚑ CC work orders from the audit: buildBlock `min(60,·)` index cap (measured worst 16/19/23 at
  k=1/2/3 vs 60 — record stands; make loud) and maxCellPolys=20k+24 < 24k at k≥7 (silent pop-site
  discard). Detail: `../../resources/research/fill-completeness-lemma-TH2-2026-06-10.md`.

## Live NEXT — one per party

See `docs/NEXT.md` (the single curated source — duplicated nowhere else).

## Repo state (re-verify on read — this section goes stale fastest)

- **master = `9674c95` = `feat/m2-realizer`** (ff; stability PASS + Finding-2 follow-ups merged).
  ALL branches pushed to origin 2026-06-10 (CB-9 ✓). Accepted k=3 artifact at
  `.scout-cache/k3-accepted-99919f42a7b58e76.ndjson`; the live cache holds the stability sweep's
  identical artifact. ⚑ Old k=3 resume caches INVALID (seed indices shifted) — always fresh.
- Review work-orders: `docs/review-2026-06-09/` (CB-4/5/6/9 still open in 01; OP/ST files untouched).
- Supabase: k=3 run `52d0cb2e` certified (61); old `d522b481` de-certified, rows retained.

## Ledger index

`DEVELOPMENT_NOTES.md` (CC narrative) · `SYNC.md` (handoff) + `archive/` (rotated history) ·
`../../resources/research/TA_LOG.md` (TA narrative) + `resources/research/*.md` (topical) ·
`../../thesis/chapters/journey.tex` (the sink the ledgers feed).
