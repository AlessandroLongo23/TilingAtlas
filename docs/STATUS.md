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
  FINAL incl. t3007.pdf. NOTES §31. ⚑ **Stability ×2 sweep in flight**
  (`experiments/results/k3-stability-regression-0d6c96b-2026-06-10.log`, ETA ~2.3h) — also the k=3
  batch acceptance for the CB landings below.
- ★ **Review batch CB-2/7/8 LANDED, digest-neutral** (k≤2 byte-identical post-merge, `b81e823`):
  CB-2 Surd.sign provable error-bound filter (`216302b` — the fuzz test found a REAL wrong-sign at
  coefficient height ~2⁵⁶: the old 1e-6 gate was unsound in fact, not just in principle; NOTES §30);
  CB-7 primitivity-rejection guard + CB-8 tuned-pool regime banner/reach counting (`eefa6ac`,
  diagnostics-only; NOTES §32). ⚑ **TA sign-off needed: §32.2 Finding 2** (guard's area-set miss
  suppression). Remaining review code items: CB-4, CB-5, CB-6, CB-9 (push branches!).
- **DG-1 verdict stands:** proven-config lattice run INFEASIBLE even at k=1 (≈1,370 yr) ⇒ thesis
  honest-rewrite (TX option (b)) merged; the measurement is itself a thesis result. NOTES §25.
- Orbifold: correct-but-gated (NOTES §23.9). Star: 4(j) spike certified k=1 exact; ST-1/TX-7
  conventions gate the next increment (TA). Seed-anchored D-D dead by mechanism (NOTES §26).

## Thesis state

- Thesis master: TX-1..7 + B2 (lem:ddrealize/ddrealizer/rem:ddscope) + TH-1 octagon lemma landed;
  k=3 gallery FINAL on the recert digest (thesis commit `01a7dd5`), 79pp clean.
- ⚑ TA prose swap pending in results.tex (~:271-275): digest → `99919f42a7b58e76`, seeds 447→**449**,
  and the 33,972 truncation count is the OLD run's number — re-derive from `k3-recert-2026-06-10.log`.
  TODO marker at results.tex:337.

## Live NEXT — one per party

See `docs/NEXT.md` (the single curated source — duplicated nowhere else).

## Repo state (re-verify on read — this section goes stale fastest)

- **master = `0d6c96b` = `feat/m2-realizer`** (ff). Nothing pushed to origin (CB-9). Accepted k=3
  artifact preserved at `.scout-cache/k3-accepted-99919f42a7b58e76.ndjson`; the live cache path is
  being rewritten by the in-flight stability sweep. ⚑ Old k=3 resume caches INVALID (seed indices
  shifted) — always fresh.
- Review work-orders: `docs/review-2026-06-09/` (CB-4/5/6/9 still open in 01; OP/ST files untouched).
- Supabase: k=3 run `52d0cb2e` certified (61); old `d522b481` de-certified, rows retained.

## Ledger index

`DEVELOPMENT_NOTES.md` (CC narrative) · `SYNC.md` (handoff) + `archive/` (rotated history) ·
`../../resources/research/TA_LOG.md` (TA narrative) + `resources/research/*.md` (topical) ·
`../../thesis/chapters/journey.tex` (the sink the ledgers feed).
