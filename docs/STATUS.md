# STATUS — TilingAtlas (current-state cache)

> **What this file is.** The 30-second "where are we" snapshot. **Mutable, disposable,
> clobber-tolerant** — if two agents overwrite it, nothing is lost, because the *canonical*
> history lives in the append-only **ledgers** below. Regenerate it from the latest signed
> entry of each ledger. **Never write history here.** — last updated 2026-06-07, TA.

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

## Frontier

- **Certified exhaustive: k ≤ 3, torus path.** k=1=11, k=2=20, k=3=61 — oracle-matched
  (A068599 / Soto-Sánchez per-tiling).
- **k=4: torus path MEASURED to wall** (tractability, not coverage; `DEVELOPMENT_NOTES.md` §22).
  Forward routes: orbifold pool-bypass (branch enumeration theory-complete & pool-free; **the
  equivariant fill at k=4-hex is UNMEASURED — the make-or-break**) or Delaney–Dress (fallback).

## Reflection-coverage gate — theory CLOSED for the regular family (2026-06-07)

The load-bearing step is **proved** (TA, Obligation 1a): Prop 0 (grid-confinement) + Prop 1a
(name-reversal + on-grid rotation = reflection) make `PeriodSolver`'s "shared name" assertion a
theorem — reflection adds **no** seeding incompleteness for the regular family. Residuals:
- **CC** — finish the confirmatory falsifier
  (`../../resources/research/reflection-coverage-experiment-2026-06-07.md`); **predicted PASS**.
  A FAIL ⇒ implementation defect (name-reversal ≠ true mirror, coarse rotation set), not math.
- The live completeness question is now **C1 Part B (positional/fill completeness)**, not reflection.
- **Star/parametric families break Prop 0** (free angle α off-grid) → need explicit `mirrorZeta`
  seeding (input to C7).
Lemma: `../../resources/research/reflection-coverage-lemma-2026-06-07.md` (proved-for-regular-family).

## Live NEXT — one per party

- **CC** — finish the reflection falsifier (predicted PASS). Then: **Certified-Results Atlas** frontend
  (`FRONTEND_ROADMAP.md` — read-only Certified-vs-Candidate views over `catalogue`/`found_tilings`);
  C4 orbifold pool-bypass → k=4-hex fill timing; C1 Part B positional/fill completeness.
- **TA** — resolve the 6 open decisions in `FRONTEND_ROADMAP.md` (chief: which polygon family is the
  *official* certified catalogue — the k=1 `{3,4,6,8,12}` vs k=3 `{3,4,6,12}` caches differ). Then T1
  (reframe thesis around torus → orbifold → Delaney–Dress) + the Delaney–Dress method chapter.
- **Alessandro** — start proven-k=3 torus on the spare machine (~36 h / 8 cores, the bankable theorem);
  C4 = GO; make the official-catalogue-family call for the Atlas.

## Repo state (re-verify on read — this section goes stale fastest)

- master `e11aa7b` (2026-06-07); ahead of `origin`. **`\describedcommit` = `2c8ad69` → thesis
  describes code ~14+ commits stale; re-anchor when T1's chapters land.**
- Worktrees: `feat/c1-proven-seeding`, `feat/lab-live-console` (merged), `feat/orbifold-branch-enum`
  (**ongoing — Increment-1/2 orbifold work; diverged on `SYNC.md`/`DEVELOPMENT_NOTES.md`; leave it**).
- `docs/SYNC.md` rotated to a thin board 2026-06-07; full prior history in `archive/SYNC-2026-06.md`.
  `docs/FRONTEND_ROADMAP.md` is CC's Certified-Results Atlas plan (awaiting TA's 6 decisions).
- `resources/` placed under git 2026-06-07 (heavy `papers/` + `archive/` gitignored).

## Ledger index

`DEVELOPMENT_NOTES.md` (CC narrative) · `SYNC.md` (handoff) + `archive/` (rotated history) ·
`../../resources/research/TA_LOG.md` (TA narrative) + `resources/research/*.md` (topical:
method-exploration-roadmap, pool-bypass-\*, reflection-\*, orbifold-\*, route-a-proven-box, star-\*) ·
`../../thesis/chapters/journey.tex` (the sink the ledgers feed).
