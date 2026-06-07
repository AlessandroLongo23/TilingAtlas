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

## ⛔ Active gate — blocks ALL k=3/k=4 compute

**Reflection-coverage.** Proven seeding places by on-grid rotation; reflection is covered only
indirectly (name-reversal + mirror-merge dedup). If rotation+name yields **neither** twin of a
class, it drops **silently** — the one failure exhaustiveness can't tolerate. Clear before the
proven k=3 run and before C4.
- **CC** runs the falsifier — `../../resources/research/reflection-coverage-experiment-2026-06-07.md`
  (PASS = 0 new congruence classes, digest ×2; FAIL = STOP + report the witness tiling).
- **TA** proves the lemma — `../../resources/research/reflection-coverage-lemma-2026-06-07.md`
  (load-bearing step: on-grid reflection-axis discretization).

## Live NEXT — one per party

- **CC** — run the reflection-coverage falsifier (gate above). If it clears: C4 orbifold pool-bypass
  → deliver k=4-hex fill timing; C1 proven k≤3 regression (upgrades 11/20/61 to theorems).
- **TA** — reflection-coverage lemma; then T1 (reframe thesis around the 3-method arc:
  torus → orbifold → Delaney–Dress) + the Delaney–Dress method chapter.
- **Alessandro** — once the gate clears: start proven-k=3 torus on the spare machine (~36 h / 8 cores,
  the bankable theorem). C4 = GO, gated on the gate.

## Repo state (re-verify on read — this section goes stale fastest)

- master `60a4d69` (k=4 scout committed 2026-06-07); ahead of `origin`. **`\describedcommit` =
  `2c8ad69` → thesis describes code ~14 commits stale; re-anchor when T1's chapters land.**
- Worktrees: `feat/c1-proven-seeding`, `feat/lab-live-console` (merged), `feat/orbifold-branch-enum`
  (**ongoing — Increment-1/2 orbifold work; diverged on `SYNC.md`/`DEVELOPMENT_NOTES.md`; leave it**).
- ⚠ `docs/FRONTEND_ROADMAP.md` + live edits on `docs/SYNC.md` are an agent's in-flight work
  (2026-06-07). The SYNC→thin rotation is **staged in `docs/SYNC.thin.md`, pending a quiet worktree.**
- `resources/` placed under git 2026-06-07 (heavy `papers/` + `archive/` gitignored).

## Ledger index

`DEVELOPMENT_NOTES.md` (CC narrative) · `SYNC.md` (handoff) + `archive/` (rotated history) ·
`../../resources/research/TA_LOG.md` (TA narrative) + `resources/research/*.md` (topical:
method-exploration-roadmap, pool-bypass-\*, reflection-\*, orbifold-\*, route-a-proven-box, star-\*) ·
`../../thesis/chapters/journey.tex` (the sink the ledgers feed).
