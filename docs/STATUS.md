# STATUS — TilingAtlas (current-state cache)

> **What this file is.** The 30-second "where are we" snapshot. **Mutable, disposable,
> clobber-tolerant** — if two agents overwrite it, nothing is lost, because the *canonical*
> history lives in the append-only **ledgers** below. Regenerate it from the latest signed
> entry of each ledger. **Never write history here.** — last updated 2026-06-08, TA.

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
- **k=4: torus path walls** — seed-count explosion (13k–27k useSeeds) × per-fill; coverage fine
  (`DEVELOPMENT_NOTES.md` §22).
- **Orbifold method — MEASURED, verdict in (2026-06-08).** C4 cyclic-rot pool-bypass + incidence 𝒜 +
  two sound fill prechecks all committed (`feat/c4-pool-bypass`, tip `465ad4c`); orbifold **k=1 = 11
  EXACT, uncapped**. **Per-fill DFS measured FLAT / O(1)** — 1 node at k=1, ≤2 at k=2 (incl. a 15-tile
  hex cell), ≤4 at k=3: the seed over-determines the cell, there is *no* fill search. ⇒ **the fill is
  NOT the wall; the fundamental-domain redesign is DEAD** (nothing to cut). **The wall is the candidate
  COUNT** (lattices × branches): ΣcandidateLattices grew 183→3103 (≈17×, ~k⁴) k=1→k=2; k=2 walls with
  the DFS idle — time is in lattice/branch enumeration + `buildBlock`/overlap setup. **Verdict:
  polynomial-but-STEEP, viable IFF the count is tamed.** Delaney–Dress is **not forced** by fill cost,
  but k=4 (≈16× a walling k=2) needs real count-reduction. Detail: NOTES §23.8 + `pool-bypass-theory-conclusions` memory.
- **Count re-measure IN (2026-06-08) — P0 suspicion REFUTED; count is structural-oblique; CC recommends the
  Delaney–Dress pivot.** P0 fires at full strength on the bypass path (it's *post-counted*; `mvUndefined=0`
  measured; P0 cuts **75–83%** of candidates, rising with k) — there is **no pruning gap to fix**.
  **ΣcandidateLattices 183→3103→186190 = 17×→60×/step, ACCELERATING (super-k⁴)**, dominated by the **oblique
  (hol=2) class (48→1956→127746, 69% of survivors)** which sits at P0's floor where **no sound lever reaches it**
  (point-group-P0 can't lower hol=2; reflection lemma cuts branches; oblique is completeness-required ⇒
  un-droppable). k=4 ≈ 11M+ candidates, un-tameable by sound means. **k≤3 certified stands via torus.** Detail:
  NOTES §23.9.

## Reflection-coverage gate — CLEARED for the regular family (2026-06-07)

The load-bearing step is **proved** (TA, Obligation 1a): Prop 0 (grid-confinement) + Prop 1a
(name-reversal + on-grid rotation = reflection) make `PeriodSolver`'s "shared name" assertion a
theorem — reflection adds **no** seeding incompleteness for the regular family. **Now written into
the thesis**: `lem:reflectioncover` (Lemma 5.20) + proof + `rem:reflectioncover` in `correctness.tex`.
Status:
- **CC's confirmatory falsifier returned PASS** — k≤2 full (reflected stream B ⊆ A, 0 new classes,
  exact ℚ(ζ_N)); k=3 via the 61-catalogue's 22 chiral carriers (stream A already complete); direct
  proven-k3 reflected run deferred (tractability). Gate fully cleared; **proven-k3 + C4 unblocked**.
- The live completeness question is now **C1 Part B (positional/fill completeness)**, not reflection.
- **Star/parametric families break Prop 0** (free angle α off-grid) → need explicit `mirrorZeta`
  seeding (input to C7).
Refs: `../../resources/research/reflection-coverage-lemma-2026-06-07.md` +
`reflection-coverage-experiment-2026-06-07.md`.

## Live NEXT — one per party

- **CC** — **Count re-measure DONE (2026-06-08).** P0 suspicion **refuted** (P0 post-counted, fires at
  75–83%, `mvUndefined=0` measured — no gap); the `|𝒜|≥1` guard is **already a diagnostic** (no throw).
  ΣcandidateLattices **183→3103→186190 = 17×→60×/step (super-k⁴)**, dominated by oblique (hol=2) at P0's
  floor — **no sound count-lever**. **CC recommendation: pivot the home-run to Delaney–Dress** (lattice
  programme pays the un-prunable oblique-Bravais cost; k≤3 certified stands via torus). **Awaiting
  Alessandro's build-vs-pivot call.** Detail: NOTES §23.9 + SYNC 2026-06-08 CC→TA.
- **TA** — the **reflection lemma** (`reflection-tileaxis-lemma-2026-06-07.md`) is now a **count-reduction
  lever**: it cuts the *branch* count (the ~k² reflection sub-pool; rotation/dihedral already k-flat).
  Harden it (pure/edge mirrors pool-free via `lem:equicert(iii)`; §6 obligations) **once CC's count
  re-measure shows branches are a material term** — don't build it on spec. Also close the `|𝒜|≥1 /
  prop:incidencefill` rotation-case proof. Then T1 (3-method thesis arc) + Delaney–Dress chapter.
- **Alessandro** — after CC's count re-measure, make the **build-vs-pivot call**: tame the orbifold count
  toward k=4, or commit to Delaney–Dress for the home run. **k ≤ 3 certified stands either way.**

## Repo state (re-verify on read — this section goes stale fastest)

- master `e11aa7b` (2026-06-07); ahead of `origin`. **`\describedcommit` = `2c8ad69` → thesis
  describes code ~14+ commits stale; re-anchor when T1's chapters land.**
- **`feat/c4-pool-bypass` tip `465ad4c`** — C4 cyclic-rot bypass + incidence 𝒜 + fill prechecks +
  `measure-fill-scaling.ts` (the per-fill-FLAT measurement). The live orbifold branch; build off it.
  `feat/orbifold-branch-enum` `0636ded` is its Increment-2 parent (superseded). Other worktrees:
  `feat/c1-proven-seeding`, `feat/lab-live-console` (merged).
- `docs/SYNC.md` rotated to a thin board 2026-06-07; full prior history in `archive/SYNC-2026-06.md`.
  `docs/FRONTEND_ROADMAP.md` is CC's Certified-Results Atlas plan (awaiting TA's 6 decisions).
- `resources/` placed under git 2026-06-07 (heavy `papers/` + `archive/` gitignored).

## Ledger index

`DEVELOPMENT_NOTES.md` (CC narrative) · `SYNC.md` (handoff) + `archive/` (rotated history) ·
`../../resources/research/TA_LOG.md` (TA narrative) + `resources/research/*.md` (topical:
method-exploration-roadmap, pool-bypass-\*, reflection-\*, orbifold-\*, route-a-proven-box, star-\*) ·
`../../thesis/chapters/journey.tex` (the sink the ledgers feed).
