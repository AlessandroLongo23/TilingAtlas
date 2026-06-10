# STATUS — TilingAtlas (current-state cache)

> **What this file is.** The 30-second "where are we" snapshot. **Mutable, disposable,
> clobber-tolerant** — if two agents overwrite it, nothing is lost, because the *canonical*
> history lives in the append-only **ledgers** below. Regenerate it from the latest signed
> entry of each ledger. **Never write history here.** — last updated 2026-06-10, CC.

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

## Frontier (2026-06-10)

- ★★ **k ≤ 2 THEOREM-CERTIFIED, oracle-independent (NEW — the thesis contribution, delivered).**
  Chain: B1 (δ≤12k, proven) → published canonical-augmentation generation (complete) →
  **lem:ddrealize** (B2.2+B2.3+B2.6+B2.7, TA-proven 2026-06-10, two adversarial passes) →
  **lem:ddrealizer** realizer (`DSymRealizer.ts`, Lemma R steps 1–6) → lem:corona certificate on
  every accept. k=1 = 11/11, k=2 = 20/20, **per-tiling congruence match vs the independent torus
  catalogue both directions**. The oracle is consulted nowhere. NOTES §27; proof note
  `delaney-dress-B22-realizability-proof-2026-06-10.md`.
- **k = 3 = 61: certified oracle-anchored via the torus path** (digest `eb34499d5fba3457`). The
  CB-1 formal acceptance (full no-cap k=3 re-run on the CB-fixed branch) is **in flight**
  (`experiments/results/k3-oracle-regression-cb1-2026-06-10.log`). D-D generation walls at δ≤36 ⇒
  the theorem-certified frontier stays k≤2 until a tighter size bound B(k) (TA, optional).
- **DG-1 verdict (2026-06-09/10 review): the proven-configuration lattice run is INFEASIBLE even
  at k=1** (pair stage ≈ 1,370 yr) ⇒ thesis rewritten honest (TX option (b), merged). The
  infeasibility measurement is itself a thesis result. NOTES §25.
- **Seed-anchored D-D (SA): dead by mechanism** — species info cannot reach the D-set tree
  (identical 205.8M nodes per anchor). Geometric anchoring (contract 06 §6) is the only surviving
  escalation. NOTES §26.
- Orbifold: correct-but-gated (count wall, super-k⁴ oblique class — NOTES §23.9). Star: 4(j)
  spike certified k=1 exact; conventions ST-1/TX-7 gate the next increment (TA).

## Thesis state

- **Thesis master = `1913b4c`** (2026-06-10): TX-1..7 honest-rewrite batch + B2 landing
  (lem:ddrealize 5.52 / lem:ddrealizer 5.53 / rem:ddscope 5.54) merged fast-forward, 68pp,
  0 undefined refs. TX-8 (`\describedcommit` re-anchor) deferred until CB fixes merge to
  TilingAtlas master.

## Live NEXT — one per party

See `docs/NEXT.md` (the single curated source — duplicated nowhere else).

## Repo state (re-verify on read — this section goes stale fastest)

- master `71eace0` (D-D engine M0+M1). **Live branch: `feat/m2-realizer`** (tip `3664746`) =
  `feat/c7-star-spike` (CB-1/CB-3 + star + review docs) ∪ master + the M2 realizer. Merge to
  master is gated on the in-flight k=3 oracle regression digest.
- Review work-orders: `docs/review-2026-06-09/` (DG/CB/TX/TH/OP/ST/SA — README has the order).
- Scout artifacts: `.scout-cache/k<k>_<tiles>_cap<ms>.ndjson` (crash-resume + cross-check input).
- `resources/` under git; thesis repo branch `tx-alignment-2026-06-10` merged (can be deleted).

## Ledger index

`DEVELOPMENT_NOTES.md` (CC narrative) · `SYNC.md` (handoff) + `archive/` (rotated history) ·
`../../resources/research/TA_LOG.md` (TA narrative) + `resources/research/*.md` (topical:
delaney-dress-\*, method-exploration-roadmap, pool-bypass-\*, reflection-\*, orbifold-\*,
route-a-proven-box, star-\*) · `../../thesis/chapters/journey.tex` (the sink the ledgers feed).
