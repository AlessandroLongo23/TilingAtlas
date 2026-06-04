# Algorithm weak-spot audit — k-uniform tiling enumeration

> **Provenance.** Authored by Claude Code (diagnostic session, 2026-06-04, plan `jaunty-chasing-wozniak`);
> archived into the repo verbatim by the thesis agent (user-directed) so future sessions can execute the
> roadmap without access to the original plan file. The roadmap's research questions were answered the
> same day — see `../../resources/research/oblique-enumeration-survey-2026-06-04.md` and the SYNC entry;
> the survey REFINES Phase 1 (target the proven envelope) and UNBLOCKS Phase 3's theory (Route A
> bounded-weight theorem, proofs owned by TA). Phase 0 is unaffected.

> **This is a diagnostic report, not an implementation plan.** Scope (per the request): analyze and
> document the weak spots across **completeness, correctness, performance, generalization**, rank what
> most affects each, and propose a *balanced* remediation roadmap that alternates optimization and
> generalization while climbing k. No code is changed in this session.

## Context

The live path (`PeriodSolver` + `LatticeEnumerator` + `KUniformityChecker`) is **solve-for-period**:
enumerate candidate primitive lattices Λ algebraically (seed-free), then for each Λ fill the torus
ℝ²/Λ by corner-completion, certify gap-free, reject supercells, gate to exactly k vertex orbits, and
dedup up to congruence. It is **certified and deterministic at k=1 (11) and k=2 (20)**. At **k=3 it is
intractable to completion** and **structurally incomplete** (no oblique lattices). The user's three
explicit asks — (1) auto-derive the per-k hardcoded params, (2) reach oblique tilings at k≥3, (3) prune
the search — are not three problems; **they collapse onto one root cause** (below). The mission's
claimed contribution is *provable* exhaustiveness, so "empirical bound sized to the known answer" is not
just a perf wart — it is a hole in the central claim.

Sources ground-truthed this session: `PeriodSolver.ts` (read in full), `LatticeEnumerator.ts`,
`probe-pipeline.ts`, `DEVELOPMENT_NOTES.md` §1–§14, `K2_DIAGNOSIS.md`, `SYNC.md`.

---

## Verdict (the honest position)

- **k=1, k=2: solid.** Certified orbit count, congruence-deduped, oracle-matched, deterministic digest.
- **The candidate-lattice math is correct** but its *finiteness* rests on bounds **fit to the oracle**,
  which is **circular for a completeness proof** — you cannot prove "found them all" with a search radius
  derived from the tilings you were trying to find.
- **k≥3 is blocked by ONE structural fact** (next section). Everything else is secondary.
- The codebase is unusually honest (loud ⚑ flags, logged truncation, measured perf). The weak spots are
  mostly **known and documented**; this report's value is **ranking** them and exposing that several
  "separate" items are the same problem.

---

## THE root cause (read this first) — anisotropy in a dense ring

A primitive cell is two vectors `(short, long)`. How they're found governs everything:

| Bravais class | short vector | long vector | status |
|---|---|---|---|
| hex / square | both short, both symmetry-pinned (Hermite bounds them) | pinned by 60°/90° rotation of short | ✅ cheap, complete |
| rect / cmm | short side **grid-aligned** (one of 24 directions) | **solved from area** `A/|short|` — *not enumerated by length* | ✅ works *because* short is grid-pinned |
| **oblique (p1/p2)** | **nothing pins it** | **nothing pins it** — bounded only by `area/|short|` ≈ up to `16k` | ❌ explodes / absent |

The trick that makes rect/cmm tractable is **pinning the short vector to the 24-direction grid, then
solving the long vector from the exact area** (`LatticeEnumerator.ts:1-15, 45-102`). Oblique cells have
**no symmetry and no grid alignment**, so neither vector is pinned; the only complete method
(reference-free short-vector pairing) must enumerate the long vector up to length `area/short`, and in a
**dense ring** (ℤ[ζ₂₄], φ=8) "all vectors up to length L" is ~L² points that grows astronomically
(measured: ~198k candidates for k=3 oblique; 700k-point pool for octagons — `DEV_NOTES §12.3, §14.4`).

**Why this is the spine of all three asks:**
1. **Auto-params (#1):** the *provable* short-vector bound is Hermite: `|s| ≤ √(2A/√3) ≤ √(2·24k·maxTileArea/√3)` ≈ **17.6·√k** for the regular core. The shipped empirical bound is `poolLmax = √(22k)` ≈ **4.7·√k** (`PeriodSolver.ts:297`). The provable bound is ~4× larger → ~16× more pool points in 2D → the dense ring explodes. **The reason the params are hand-tuned is precisely that the honest bound is intractable in the dense ring.**
2. **Oblique (#2):** same dense-ring explosion, with the *added* problem that the long vector isn't area-solvable (no grid pin).
3. **Pruning (#3):** the dense pool feeds `#candidates × fill_cost`; both factors are large exactly when the ring is dense.

**The breakthrough the project actually needs** is a way to **pin or bound the second vector of a
low/zero-symmetry cell without enumerating it by length in the dense ring** — the analogue, for oblique,
of "grid-align + solve-from-area." That is a research problem (see Research Track). Until then, k≥3
oblique is genuinely open and the empirical params are genuinely unproven.

> **⟦TA update, same day⟧** The research track returned: the breakthrough exists as a provable theorem
> (Route A, "bounded weight": Λ is generated by quotient-graph fundamental-cycle voltages; V(Q) ≤ 12k ⇒
> generators are sums of ≤ 24k−1 unit edges — finite regardless of ring density). See the survey §2.
> Phase 1/3 below should be read with that in hand.

---

## Weak spots by attribute (ranked within each)

Severity: 🔴 blocks the thesis claim or k≥3 progress · 🟠 real risk, bounded · 🟡 latent / future-scope.
"Logged?" = does the code shout when it bites, or drop silently.

### A. Completeness (can a valid tiling be silently dropped?)

| # | Weak spot | Where | Sev | Logged? |
|---|---|---|---|---|
| A1 | **Pool/area bounds are empirical, fit to oracle maxima** (`poolSteps=2k+2`, `poolLmax=√(22k)`, `gridShortMax2`, `compactOffMax2`, `areaBoundF=16k`). A cell vector beyond the reach is dropped. Circular for a completeness proof. | `PeriodSolver.ts:296-299, 309`; ⚑ comment 292-295 | 🔴 | **silent** |
| A2 | **Oblique (p1/p2) lattices are not enumerated at all.** Missing counts: 0,0,**2,5,18,30** at k=1..6 (oracle census). HNF ruled out (incomplete for mixed √2/√3 — the 4.8.8 obstruction); reference-free pairing explodes. | `candidateLattices` has no oblique source (`PeriodSolver.ts:325-343`); `DEV_NOTES §12.3` | 🔴 | partial (oracle tool reports the ceiling; live run is **silent**) |
| A3 | **Union-seeding heuristic "fans only where the rigid core overflows the cell" is exact for k=2 but a heuristic at k≥3** — a tiling reachable only by a fan on a cell the core *also* fits would be missed. | `PeriodSolver.ts:202-205`; ⚑ comment 198-201; `DEV_NOTES §13.5` | 🟠 | loud per-seed (`fanLat`) but the *risk* is silent |
| A4 | **`MAX_ORBIT_VERTICES=12` is a per-ORBIT bound applied per VC-TYPE.** Two orbits can share one VC type, so the real per-type count can reach ~12·(orbits sharing type). Capping the `vcAreaSet` enumeration at 12 per type can omit a real cell's area at k≥3 → its lattice never generated. | `LatticeEnumerator.ts:27`, used in `vcAreaSet`; ⚑ `DEV_NOTES §12.8 flag 4, §12.6` | 🟠 | **silent** |
| A5 | **`maxCellPolys = 20k+24` and the area-ladder caps** (`LADDER_SIZE_CAP=4000`, practical `8k`) are runaway backstops; if a real k≥3 cell exceeds them it is dropped. | `PeriodSolver.ts:125`; `LatticeEnumerator.ts:24,152` | 🟡 | ladder truncation **logged**; poly-cap **silent** |
| A6 | **Connectivity assumption** (the m VC-types of a k-uniform tiling form a connected subgraph of the compatibility graph) is **plausible but unproven** — a thesis-grade completeness argument needs it or its exceptions. | `SeedSetExtractor.ts`; `DEV_NOTES §4` | 🟡 | n/a (assumption) |
| A7 | **Per-seed wall-clock timeout** (120s k≥2) drops a seed's contribution if hit. At k=3 the hard 3⁶-family seeds time out. | `run-pipeline.ts ~777`; probe `:43` | 🟠 | **loud** (INCOMPLETE) but reintroduces **non-determinism** at k≥3 |

### B. Correctness (can an invalid tiling be accepted, or a real one mis-merged?)

| # | Weak spot | Where | Sev | Logged? |
|---|---|---|---|---|
| B1 | **Decisive area comparisons use float slack, not exact `Surd`.** Core-overflow guard `initialArea > cellArea + 1e-6` and the certificate `|area − cellArea| > 1e-4·…`. Three k=2 tilings (t2004/t2011/t2012) pass *only* by the slack (footprint == cell exactly). Fragile under any upstream float noise. | `PeriodSolver.ts:402, 552, 203`; ⚑ `DEV_NOTES §13.4, §13.6` | 🟠 | documented, **not fixed** |
| B2 | **Proper-overlap test is float `Polygon.intersects`** (convex-hull based). Sound for the convex regular core (k=1..6 are all convex) but **unsound for non-convex / star tiles** — a hard blocker for the later polygon families the thesis wants. | `PeriodSolver.ts:742, 753`; `DEV_NOTES §4 hole 4, §9.4` | 🟡 (now) → 🔴 (star families) | documented |
| B3 | **Chirality convention not consistent end-to-end.** Decision is settled (MERGE mirrors → matches A068599), and the tiling-level dedup is reflection-invariant. But the **VC layer is rotation-only (18 nodes vs 15)**; the inconsistency is latent and must be reconciled before trusting higher-k seed enumeration. | `VertexConfiguration.ts`; `DEV_NOTES §4 hole 3, §12.8 flag 1` | 🟡 | documented |
| B4 | **Orbit gate returns `null` ⇒ kept.** Sound by design (gate can only *remove* a definite non-k), but it means a degenerate/corrupt cell upstream is *not* caught by the gate — correctness then rests entirely on the constructor. | `KUniformityChecker`; `PeriodSolver.ts:221-226`; `DEV_NOTES §6 step 1` | 🟡 | by design |
| B5 | **Determinism is proven only at k=2.** k≥3 timeouts make *which* tilings survive CPU-timing-dependent → a hidden completeness drop. A reproducible count is a prerequisite for any "= N" proof. | probe digest `:64-67`; `DEV_NOTES §14.4` | 🟠 | digest printed (k=2 stable) |

*Verified sound (no action): congruence dedup (grid-isometry, independently cross-checked, `DEV_NOTES
§13.1`); exact ℚ(ζ₂₄)/Surd arithmetic (unit tests + k=1=11); float-guess-then-exact-verify lattice
reduction.*

### C. Performance (where the time actually goes)

Ranked by measured/structural contribution. The project's own measurement (`DEV_NOTES §12.9`):
`torusFill ≈ 40 ms/pop`, dominated by **`buildBlock` (rebuilt every pop) + the exact vertex-incidence
map in `analyze`**.

| # | Cost sink | Where | Sev | Lever (not yet done) |
|---|---|---|---|---|
| C1 | **`buildBlock` rebuilt on every DFS pop**, though a child cell differs from its parent by **one** polygon. Plus `analyze` recomputes the full exact vertex-key incidence map every pop. | `PeriodSolver.ts:438, 468, 471-480` | 🔴 | **incremental block** (add the one new tile's neighbours); cache incidence; this is the single biggest measured win |
| C2 | **`analyze` scans all block polygons** to find vertices within `judgeR`, but only tiles within `judgeR+~2` can touch an in-range vertex. | `PeriodSolver.ts:463-498` | 🟠 | distance-cull the incidence loop (stated future lever, `DEV_NOTES §12.9`) |
| C3 | **#candidates × fill_cost.** Every wrong candidate lattice pays a `buildBlock` + self-overlap check (`:407`) even when killed fast. Hundreds–thousands of candidates per seed at k≥3. | `PeriodSolver.ts:184-211` | 🔴 | cheaper necessary-condition reject *before* `buildBlock`; the **VC-area filter** is the main existing cut (`§12.4`) |
| C4 | **Dense pool generation:** exact ℤ[ζ₂₄] BFS = 700k points for octagons / {3,4,6,8,12} at k=3. `edgeStepDirs` collapses {3,6}/{4} to a discrete ring but {3,4}-type stays dense. | `shortVectorPool`, `PeriodSolver.ts:303-304`; `DEV_NOTES §12.5, §14.4` | 🔴 | the dense-ring problem (= the root cause); needs the breakthrough, not tuning |
| C5 | **Cross-seed `dedupeByCongruence` over ALL raw cells** is O(C²) pairwise (cheap name-multiset/`|det|` prefilters first). C grows sharply at k≥3. `reducedClassKey` recomputed per pair. | `probe-pipeline.ts:60`; `TilingCongruence.ts` | 🟠 | memoize `reducedClassKey` per (polygon, lattice); bucket tighter |
| C6 | **Union-seeding fan fills** on small overflow cells run extra torusFills (fanLat 14–20 at k=3). | `PeriodSolver.ts:204-211`; `DEV_NOTES §14.6` | 🟡 | fast pre-fill reject for fan seeds |
| C7 | **KUniformityChecker** O(reps²·syms) per emitted cell — fine at k=2, scales with cell count at k≥3. | `KUniformityChecker.ts:201-209` | 🟡 | only if profiling shows it dominates |

### D. Generalization (does the method extend in k and in polygon set?)

| # | Weak spot | Where | Sev | Note |
|---|---|---|---|---|
| D1 | **Per-k params are hand-coded with a `k≤2 ? … : …` switch**, not derived. The k≥3 laws (`2k+2`, `√(22k)`, `16k`) are curve-fits to oracle maxima. (This *is* ask #1.) | `PeriodSolver.ts:296-299, 309` | 🔴 | replace fits with first-principles bounds (Hermite + crystallographic) — but the honest bound is dense-ring-intractable (root cause) |
| D2 | **Surd layer is N=24-only.** `computeRing` picks the *minimal* ring ({3,4,6,12}→N=12), which **crashes** `imSurd`/`gridDirOf`. Probe forces N=24; a non-octagon param in `run-pipeline` would hit the same crash. | `Surd.ts`; `DEV_NOTES §14.3`; probe `:19-24` | 🟠 | extend Surd to ℚ(√3) (N=12) or always force the containing ring |
| D3 | **Float `Polygon.intersects`** (= B2) blocks star/non-convex families structurally. | `Polygon.ts` | 🟡→🔴 | exact rational segment intersection |
| D4 | **Edge-direction restriction `g = gcd(N/2, {N/n})`** is proven for the regular core (even directions only) but **must be re-verified** before star/irregular polygons (which can break ℤ[ζ_N] entirely). | `edgeStepDirs`; `DEV_NOTES §12.5, §12.8 flag 6` | 🟡 | re-derive for each new family |
| D5 | **MAX_K=2 hard gate** in the production pipeline. | `run-pipeline.ts ~108` | 🟡 | bump per validated k |

---

## The three named concerns, expanded

### #1 — Auto-derive the per-k hardcoded parameters

**Full inventory** (the generalization debt):

| Param | file:line | k-law shipped | principled? |
|---|---|---|---|
| `POOL_STEPS` | `PeriodSolver.ts:53,296` | k≤2:6; k≥3:`2k+2` | ❌ curve-fit |
| `POOL_LMAX` | `:54,297` | k≤2:5.6; k≥3:`√(22k)` | ❌ curve-fit (Hermite gives ~`17.6√k`, ~4× larger) |
| `GRID_SHORT_MAX2` | `:57,299` | k≤2:12.25; k≥3:`poolLmax²` | ❌ from observed short≤2 |
| `COMPACT_OFFGRID_MAX2` | `:61,298` | k≤2:16; k≥3:`poolLmax²` | ❌ from snub compactness |
| `areaBoundF` | `:309` | `16k` | ◻ loose over-estimate of the proven `24k·maxTileArea` |
| `maxCellPolys` | `:125` | `20k+24` | ◻ near the proven `F≤24k` |
| `LADDER_SIZE_CAP` | `LatticeEnumerator.ts:24` | 4000 | ◻ perf cap (logged) |
| `MAX_ORBIT_VERTICES` | `:27` | 12 | ✅ proven per-orbit, ⚠ misapplied per-type (A4) |
| `minLen` reject | `PeriodSolver.ts:372` | 0.9 | ✅ proven (unit edge) |

**The proven bounds that should replace the fits** (all in `DEV_NOTES §12.6`, just not wired into the
param laws): `V_cell ≤ 12k`, `F ≤ 24k` ⇒ `A ≤ 24k·maxTileArea`; **Hermite** `|short| ≤ √(2A/√3)`. These
make `areaBoundF`, `maxCellPolys`, and the *short*-vector reach **derivable and provable**. The catch is
exactly the root cause: the provable short reach (~17.6√k) blows up the dense ring. So #1 is **half
mechanical** (area/poly/short bounds → derive them, kill the magic numbers, keep a *loud* assertion when
the proven bound is exceeded) and **half blocked on the breakthrough** (making the proven-size pool
tractable in the dense ring).

### #2 — Oblique tilings at k≥3

In scope (completeness is the goal) but needs a breakthrough + literature. Current state: **absent**,
ceiling = 59/61, 146/151, 314/332, 643/673. Two dead ends already burned (HNF — incomplete for mixed
√2/√3; reference-free pairing — explodes). The open question is the **second-vector pinning** problem
(root cause). Treat as: (a) a **research track** to find a pinning/bounding principle, in
parallel with (b) a **correct-but-slow reference implementation** of reference-free pairing, gated
behind the VC-area filter and orbit gate, used to *generate ground truth* at k=3 (only 2 oblique) so any
future fast method can be validated against it. Do **not** ship the slow path as the answer; use it to
de-risk and to make the k=3 count honest-complete while the fast method is researched.

### #3 — Prune the search / find the time sinks

Already ranked in section C. The **two highest-leverage, low-risk** wins (both project-identified,
neither done): **C1 incremental `buildBlock`** (kills the dominant ~40ms/pop rebuild) and **C3 a cheap
necessary-condition reject before `buildBlock`** on wrong candidates. These are pure speed (no
completeness knob) — the safe kind. Everything touching pool size / area cap / node cap is a
**completeness knob, not a speed dial** (the load-bearing §11.4 lesson): turning it down to go faster
*is* turning the completeness regime off. Keep those exact and provable; get speed from C1/C2/C3/C5.

---

## Priority matrix — what most affects the four attributes

| Rank | Item | Completeness | Correctness | Performance | Generalization |
|---|---|:---:|:---:|:---:|:---:|
| 1 | Root cause: anisotropy in dense ring (A1+A2+C4+D1) | 🔴 | — | 🔴 | 🔴 |
| 2 | Incremental `buildBlock` + analyze culling (C1, C2) | — | — | 🔴 | 🟠 (unblocks k≥3 runs) |
| 3 | Derive params from proven bounds (D1, A1, A5) | 🔴 | — | 🟠 | 🔴 |
| 4 | Oblique enumeration (A2) | 🔴 | — | 🔴 | 🔴 |
| 5 | Cheap pre-fill candidate reject (C3) | — | — | 🔴 | — |
| 6 | Exact `Surd` area guards (B1) | 🟠 | 🟠 | — | 🟠 |
| 7 | Per-type vs per-orbit V cap (A4) | 🟠 | — | — | 🟠 |
| 8 | Union-seeding proof/fix at k≥3 (A3) | 🟠 | — | 🟡 | 🟠 |
| 9 | N=24-only Surd (D2) | — | — | — | 🟠 |
| 10 | Cross-seed dedup memoization (C5) | — | — | 🟠 | — |
| 11 | Float `intersects` → exact (B2/D3) | — | 🔴(star) | — | 🔴(star) |
| 12 | Connectivity proof (A6), chirality VC layer (B3) | 🟡 | 🟡 | — | 🟡 |

---

## Recommended sequencing (balanced — alternate optimization & generalization, climb k)

**Phase 0 — make k=3 *runnable* (pure optimization, no completeness risk).**
C1 incremental `buildBlock` + C2 analyze culling + C3 pre-fill reject + C5 dedup memoization. Target:
hard 3⁶ seeds finish under the cap, deterministically. Re-run the k=3 scout
(`pnpm tsx scripts/probe-pipeline.ts 3 3,4,6,12 60000`) to get a stable **X/59** lower bound. Gate of
success: a reproducible composition digest at k=3 (the determinism prerequisite, B5).

**Phase 1 — de-magic the params (generalization + completeness).**
Replace the curve-fit laws with the proven bounds (Hermite + `24k·maxTileArea`), keep a **loud
assertion** when the proven reach is exceeded, fix A4 (per-orbit, not per-type), harden B1 to exact
`Surd`. This converts "20/20 because we tuned to 20" into "20/20 within a proven box" and exposes,
honestly, where the dense ring makes the proven box intractable.
*⟦TA update⟧ Target the Route-A proven envelope (weight ≤ 24k−1 + Gram/area box) — survey §2.*

**Phase 2 — close the non-oblique k=3..6 ceiling (optimization + the dense-ring attack).**
Tackle the octagon/{3,4} 700k pool (C4): the discrete-ring collapse already handles {3,6}/{4}; the
dense subsets need either a smarter pool (monotone + necessary-condition pruning at generation) or the
second-vector pinning idea from the research track. Verify the union-seeding heuristic at k=3 (A3) —
prove "core + overflow-fans suffice" or switch to a proven blanket union with the perf budget from
Phase 0. Goal: certified 59/61, then 146/151, … (non-oblique ceiling) with stable digests.

**Phase 3 — oblique (generalization breakthrough).**
Land the slow-but-correct reference-free oblique generator as ground truth (k=3 has only 2), drive the
research track for a tractable method, validate fast against slow. Only then claim 61/151/….
*⟦TA update⟧ The research track delivered Route A; hold implementation until TA's theorem note lands
(proofs in progress) so the implementation targets the proven box, not a guessed one.*

**Phase 4 — beyond regular polygons (generalization).**
Exact segment intersection (B2/D3), N=12 Surd or forced containing ring (D2), re-derive direction
restriction (D4) — prerequisites for star/irregular families.

Each phase ends with: `pnpm build` green, the relevant `probe-pipeline` digest stable across two runs,
and a dated `SYNC.md` entry. Optimization and generalization alternate by construction (0/2 optimize,
1/3/4 generalize), per the balanced directive.

---

## Research track (for oblique — do this in parallel)

*⟦TA update, 2026-06-04⟧ DONE — see `../../resources/research/oblique-enumeration-survey-2026-06-04.md`.
Verdict: no finite oblique method exists in the literature; multiplier/SSL theory provably cannot cover
generic oblique lattices; the viable path is the Route-A bounded-weight theorem (+ Route B Delaney–Dress
sweep as independent verifier). Galebach k≥4 has no completeness proof (verbatim citations in the
survey); k=2/k=3 have Krötenheerdt/Chavey hand proofs → thesis claim rescoped to "first provable k≥4,
first machine-checkable k=2,3".*

## Verification approach (for whoever executes the roadmap)

- **Counts:** `pnpm tsx scripts/probe-pipeline.ts <k> [tiles] [maxMs]` → `N distinct tilings` + digest.
  A change is safe iff k=1=11 and k=2=20 with the **same** `COMPOSITION digest` as before.
- **Oracle match:** `scripts/oracle-characterize.ts` for the per-tiling ceiling and Bravais census.
- **Determinism:** run any probe twice; digests must match (this is the k≥3 acceptance gate, B5).
- **Build:** `pnpm build` after every change (type-check + warnings), per CLAUDE.md workflow rule.
- **Tests:** the PeriodSolver + k-uniformity + Surd + lattice-enumerator suites (109+ tests) must stay green.
