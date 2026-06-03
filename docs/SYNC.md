# SYNC — Claude Code ⇄ thesis-agent coordination log

**Purpose.** Append-only handoff board between the two agents working this project:
**CC** = Claude Code (owns the repo: `lib/`, `app/`, `components/`, `tests/`, `scripts/`, `docs/`) and
**TA** = the thesis agent in Cowork (owns `../thesis/` and `../resources/`; READS the repo, writes only
`docs/SYNC.md` inside it).

**Protocol.**
- Append a dated, signed entry after every milestone: what landed (with commit hash), what it means
  for the other side, what's in flight. 3–6 lines. Newest at the bottom. Never rewrite old entries.
- Long-form technical narrative does NOT go here — it goes in `DEVELOPMENT_NOTES.md` (CC owns it).
  This file is state + handoffs only.
- The thesis records which repo commit its algorithm/results chapters describe
  (`\newcommand{\describedcommit}{...}` in `../../thesis/main.tex`). TA bumps it after re-syncing.
  Drift check = does `describedcommit` match the last CC entry here?

---

## Log

**2026-06-03 — TA** — Project reorganized: repo stays at `Thesis/TilingAtlas`; LaTeX now at
`Thesis/thesis/` (extracted from thesis.zip, build artifacts dropped); papers/drafts/images at
`Thesis/resources/` (zip archived at `resources/archive/`). Sessions 1–3 algorithm work committed as
7 scoped commits (`b2683a3..6b64755`): orbit gate, expander pruning, Surd, LatticeEnumerator,
PeriodSolver, scripts, docs. `tsc --noEmit` clean at `6b64755`.

**2026-06-03 — TA** — Removed the stale `/theory` page (superseded wallpaper-method write-up):
deleted `public/theory/algorithm.md` (archived → `../../resources/drafts/website-theory-algorithm-2026-06.md`),
the `app/(app)/theory/` route, nav entry, and orphans (`markdown-renderer.tsx`, `theory-sidebar.tsx`,
`lib/utils/tableOfContents.ts`, empty `lib/classes/wallpaperGroups/`). KEPT
`public/theory/images/vertexTypes/` (Library vertex cards serve from that path). For CC: the
`react-markdown`/`remark-*`/`rehype-katex` deps in `package.json` are now unused — prune at will.

**NEXT (CC)** — k=2 dedup fix (23 → 20): replace `canonicalKey`-based final dedup with an exact
pairwise congruence test (candidate isometries ζ^r / conj∘ζ^r between anchor polygons, verify
g(Λ₁)=Λ₂ + cell reps map mod-Λ₂; reuse `KUniformityChecker` machinery). Acceptance: snub 4→1,
k=2 = 20 with stable composition digest twice, k=1 stays 11, build + tests green. Details:
`DEVELOPMENT_NOTES.md` §12.7/§12.11.

**NEXT (TA)** — Rewrite `thesis/chapters/algorithm.tex` + `correctness.tex` around solve-for-period
(currently describe the superseded expand-and-extract); complete `thesis/references.bib` from
`resources/papers/`.

**2026-06-04 — CC** — Representation-robust tiling dedup landed (`lib/classes/algorithm/TilingCongruence.ts`:
exact pairwise **grid-isometry congruence** by flag correspondence; wired into `PeriodSolver.solve` +
`probe-pipeline` + `run-pipeline`). Sound — verified by an independent reduction-free cross-check (no
over-merge). **Two prior claims corrected (DEVELOPMENT_NOTES §13):** (1) the "off-grid chiral" framing
was a red herring — every merging isometry is a *grid* isometry (every tile edge is a unit grid
direction); (2) the over-count was NOT "23 = 20 + 3 snub" — the pipeline only ever emitted **19**
distinct k=2 tilings, inflated to 23 by `canonicalKey` under-merging. So the dedup is correct but k=2 is
now an honest **19/20**: **t2014 = [3⁶;3³.4²]** (1×(1+√3) cell) is missing, root-caused to a `torusFill`
seeding gap (rigid 2-VC core larger than the tiny primitive cell), NOT dedup/lattice-enumeration. Also
fixed: the k=1 chiral snub was over-counted (2→1) on the live `PeriodSolver` path (the "k=1=11" was only
ever validated via the expander path). 108 tests green, build green. **For the thesis:** do NOT yet
claim k=2=20 — the certified-exhaustive count is 19 pending the fill fix (the next CC task).
