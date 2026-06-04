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

**2026-06-04 — CC** — **k=2 = 20** ✅ (the fill gap is closed). Implemented **targeted union seeding**
(`PeriodSolver.solve`): on lattices where the rigid 2-VC core overflows the cell (`footprintArea > |det Λ|`
— only the smallest cells, e.g. t2014's 1×(1+√3)), seed instead from the single-VC fans, which recover the
small-cell tilings the rigid core can't hold. Full k=2 probe = **20**, **0 timeouts, deterministic**
(identical composition digest across two runs), ~750s. t2014 recovered (orbit 2). 109 tests green
(incl. a t2014 regression), build green; live per-seed cap raised 60s→120s. **For the thesis: k=2 = 20 is
now reproduced exactly and certified (orbit-gated, congruence-deduped, oracle-matched).** ⚑ One caveat to
record: "fans only on core-overflow lattices" is *exact for k=2* (verified across all 20) but a *heuristic
at k≥3* (a fan-only tiling on a core-fitting cell would be missed) — see DEVELOPMENT_NOTES §13.5. Open:
exact-`Surd` area guard (drops a float-slack fragility), k≥3 seeding completeness, k≥3 oblique (§12.3).

**2026-06-04 — CC** — Started k=3 (DEVELOPMENT_NOTES §14). **Verdict: the method generalizes
STRUCTURALLY (produces correct orbit-3 tilings) but is NOT tractable to completion at k=3** — the hard
3⁶-family seeds time out (the §11 dense-pool wall at k=3 scale; 447 seeds, ~125s just to build them).
Oracle characterization (new tool `scripts/oracle-characterize.ts`): **reachable ceiling = 59/61** (2
genuinely oblique: t3046, t3055, not in our candidate set). Two issues fixed to enable k=3: (1) the
pool params were k=2-hardcoded (longest k=3 cell vector 6.732 > 5.6) → now k-scaled; (2) the Surd
enumeration is **N=24-only** but `computeRing` picks the minimal ring (N=12 for {3,4,6,12}) → force
N=24. A {3,4,6,12} k=3 scout (octagons excluded — 24-dir 700k-pool wall) was launched but the full
result was not captured (multi-hour). **For the thesis: k=3 is the tractability frontier — the
contribution there is documenting that the method generalizes but the dense-pool/per-fill cost (and
oblique) must be solved for a complete higher-k enumeration.** All code committed; re-run the scout
(`pnpm tsx scripts/probe-pipeline.ts 3 3,4,6,12 60000`) to get the X/59 lower bound.

**2026-06-04 — TA** — Read CC's weak-spot audit (user-approved roadmap). **TA takes the research
track**: (a) the oblique second-vector-pinning question — deep literature pass launched (similar-
sublattice/CSL theory Baake–Zeiner, Chavey II/III, how Galebach/Čtrnáct actually enumerate, Delaney–
Dress/Tegula as a *lattice-free* complete route); (b) the proof-obligation queue (union-seeding
criterion at k≥3, connectivity assumption, derive-params-from-proven-bounds write-up). Two TA additions
to the audit: A4 is concretely real at k=3 — **22 of the 61** k=3 tilings have shared VC types
(Krötenheerdt 39 vs A068599 61), so the per-type cap can genuinely exclude real cells; and the research
framing should include **combinatorial-first enumeration** (edge-pairing / Delaney–Dress, then
geometrize) which sidesteps lattice enumeration entirely — Čtrnáct's solver reaches k=13 that way.
Findings will land in `resources/research/` + summarized here. Thesis chapter rewrite stays queued
behind this pass (it changes what `correctness.tex` may claim).

**2026-06-04 — TA** — **Oblique research pass DONE** → `../../resources/research/oblique-enumeration-survey-2026-06-04.md`
(5-agent deep research, primary sources quoted). Headlines for CC: (1) **No finite oblique enumeration
exists in the literature; multiplier/SSL theory is PROVABLY blind to generic oblique lattices** (rank-2
multipliers have degree ≤ 2 — Zeiner) — don't extrapolate the snub/4.8.8 ring-multiplier picture.
(2) **Route A (recommended): prove the bounded-weight theorem** — Λ is generated by quotient-graph
fundamental-cycle voltages, V(Q) ≤ 12k ⇒ generators have ≤ 24k−1 unit-edge steps ⇒ finite WITHOUT
density problems; this same theorem de-magics the pool params (audit #1+#2 in one). TA writes the
proofs; CC's Phase 0/1 should target the proven box (weight + Gram/area) with logged sound prunes.
(3) **Claim rescope:** k=2 (Krötenheerdt 1969) and k=3 (Krötenheerdt+Chavey 1984) HAVE published hand
proofs — thesis claims "first provable for k≥4, first machine-checkable for k=2,3". (4) Route B
(Delaney–Dress sweep, δ ≤ 12k lemma) = independent verifier, k≤3 realistic. (5) ⚑ k=8 oracle
discrepancy: Čtrnáct count.txt 258 vs Wikipedia 298 (2-Archimedean class) — check vs JSON before
trusting per-class counts at k=8.

**NEXT (CC) — execute Phase 0 of `docs/WEAK_SPOT_AUDIT_2026-06-04.md`** (the 2026-06-04 audit,
user-approved, now archived in-repo with TA research updates inline). Pure optimization, NO
completeness-knob changes (pool/area/caps FROZEN): C1 incremental `buildBlock` + incidence cache,
C2 distance-cull in `analyze`, C3 cheap pre-`buildBlock` candidate reject, C5 memoize
`reducedClassKey` per (polygon, lattice) in the congruence dedup. Acceptance: k=1 = 11 and k=2 = 20
with **byte-identical composition digests** to current; build + 109 tests green; then run the k=3
scout twice (`pnpm tsx scripts/probe-pipeline.ts 3 3,4,6,12 60000`) → report the stable X/59 lower
bound + digest here. Do NOT start Phase 3 (oblique) — TA is writing the Route-A theorem
(bounded-weight box) that Phase 1/3 must target; work order will follow here when the proofs land.

**NEXT (TA)** — Write the Route-A theorem + proofs (quotient-graph connectivity, V(Q) ≤ 12k
bookkeeping, cycle-length/weight bound) → `resources/research/` note + `correctness.tex`; Lemma B1
(δ ≤ 12k); then the algorithm.tex/correctness.tex rewrite around solve-for-period with the rescoped
claim.

**2026-06-04 — TA** — **Route-A theorem + proofs WRITTEN and compiled** (`thesis/chapters/correctness.tex`,
thesis repo initialized, commit `ac073a8`; thesis describes repo commit 45d8023 via \describedcommit).
Chapter now proves: soundness (corona certificate + grid-isometry lemma + orbit-gate exactness +
congruence-merge iff-congruent), structural termination, and **completeness stage C2: Λ is generated by
quotient-graph fundamental-cycle voltages of weight ≤ 2k|P|−1 ≤ 24k−1** (degree/ring-independent —
covers oblique with zero symmetry assumptions) + the proven candidate box (area ≤ 24k·a_max; |u| ≤
~17.6√k; join-closure enumeration, terminating, provably complete). Remaining obligations stated as O1
(seed coverage) + O2 (fill seeding) — both TA's queue. Route-B flag-orbit lemma (k ≤ δ ≤ 12k) proven.
**For CC:** implementation-facing constants + licensed-vs-unproven prune list in
`../../resources/research/route-a-proven-box.md` — read it before Phase 1 (key: ⚑ monotone pool growth
is an UNPROVEN prune at k≥3 under the proven box; VC-area filter and Gram bounds are licensed; add the
loud INCOMPLETE-REGION assertion instead of silently trusting tuned radii).

**2026-06-04 — TA** — **O1 + O2 DISCHARGED (thesis d7cbf04): the completeness factorization is now
fully proven** under the "proven configuration". Two NEW implementation switches for CC (details +
rationale in `route-a-proven-box.md`, updated):
(1) ⚑ **Include singleton seed multisets for k>1** — the historical exclusion is unproven; cost
negligible. (2) ⚑ **Add a blanket-fan seeding mode** (`fan(v, r)` for all grid orientations r per
candidate Λ; reducible by Λ's rotational symmetry) — proven complete (`prop:fanseed`); the rigid
k-VC core stays as the sound fast path but must not carry the completeness claim (a connected
k-orbit transversal need not exist — this supersedes/absorbs the §13.5 fan-on-overflow caveat).
Regression for the mode: k=1=11, k=2=20 with identical digests under proven seeding. Neither switch
is urgent for Phase 0 — they slot into Phase 1/2.
