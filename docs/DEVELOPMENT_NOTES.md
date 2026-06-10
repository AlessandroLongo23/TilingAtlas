# Development notes & assessment — k-uniform tiling algorithm

> **Purpose.** A complete narrative record of the algorithm's design, an assessment of its
> correctness and direction, and the full development journey — *including the ideas that did not
> work and why* — so the thesis can be written from the actual history, not just the final state.
>
> Companion docs: [`CYCLOTOMIC_SPEC.md`](CYCLOTOMIC_SPEC.md) (exact-arithmetic engineering brief),
> [`K2_DIAGNOSIS.md`](K2_DIAGNOSIS.md) (the detailed k≥2 performance measurement log),
> `algorithm.md` (the *documented* 7-step design — **removed from the app 2026-06-03** as stale;
> archived at `../../resources/drafts/website-theory-algorithm-2026-06.md`).
> Where this doc references measurements, the raw tables live in `K2_DIAGNOSIS.md`.

---

## 1. Goal and definitions

Enumerate **all and only** the tilings of the plane that are
- **edge-to-edge** (tiles meet full-edge to full-edge),
- **periodic** (a rank-2 translation lattice),
- **k-uniform** = exactly **k transitivity classes of vertices** under the tiling's *full* symmetry
  group (a wallpaper group),

using a chosen set of polygons, for a given k.

**Acceptance targets (regular polygons).** The known counts are
`k = 1..6 → 11, 20, 61, 151, 332, 673`. The thesis plan: reproduce these (validating the method),
then generalize to other polygon families (regular stars, isotoxal stars, equilateral irregular)
and to higher k.

The defining property is the **vertex-orbit count**. A tiling is k-uniform iff its vertices fall
into exactly k orbits under its symmetry group. Two vertices are in the same orbit iff some symmetry
of the tiling (translation, rotation, reflection, or glide) maps one onto the other. This is the
property the whole pipeline must ultimately certify — and the one it historically never checked
(see §4 and §6).

---

## 2. The pipeline (7 stages) and the documented-vs-implemented divergence

The documented algorithm ([`algorithm.md`](../public/theory/algorithm.md)) has 7 steps:
1. select polygon categories;
2. generate the vertex-configuration (VC) set (DFS around a vertex to 360°, filter to unique-under-symmetry);
3. build the VC **compatibility graph** (edge iff two VCs share a 2-polygon adjacency, i.e. can be stitched);
4. select **seed sets** — multisets of k compatible VCs (connected subgraphs, padded with replacement);
5. build the **seed** — concrete k-vertex patches realising each seed set;
6. **apply the 17 wallpaper groups** — fit a fundamental domain onto the seed's construction points;
7. **final checks** — gaps/overlaps (angle-sum) and **verify k by counting vertex-transitivity classes**.

### The divergence (confirmed by reading both the docs and the code)
The **implementation does not run steps 6–7 as documented.** There is **no wallpaper-group code on
the live path** (`grep` finds only commented-out / post-hoc-label / UI references; the
`TilingGenerator` / `conwayCost` machinery is off the regular path). Instead:

- **Step 6 is replaced** by [`SeedExpander`](../lib/classes/algorithm/SeedExpander.ts): a DFS that
  grows a patch outward by **stamping rigid copies of the whole seed** at frontier vertices (exact
  isometries: rotate ζ^k, reflect conj∘ζ^k, translate), until every frontier vertex reaches
  graph-distance `threshold = 6·k` from the core. Each leaf is a finite patch.
- The lattice is recovered **afterward** by
  [`TranslationalCellExtractor`](../lib/classes/algorithm/TranslationalCellExtractor.ts).
- **Step 7's k-check never existed** — the count was simply the number of distinct
  `canonicalPatchKey` survivors that yielded a non-null cell.

The thesis write-up therefore currently documents an algorithm the code does not run, and omits the
one it does. *(Resolved 2026-06-03 by **removal**: the `/theory` page and `algorithm.md` were deleted
from the app — archived at `../../resources/drafts/website-theory-algorithm-2026-06.md`. The thesis
LaTeX (`../../thesis/chapters/algorithm.tex`) is now the single prose description to keep aligned.)*

**Judgement on direction.** Expand-and-extract is *more* well-posed than the documented
wallpaper-fitting (which the author himself flagged as unproven): a periodic k-uniform tiling **is**
a fundamental domain + lattice, so recovering the lattice is the right object. The problem is the
*implementation* (an unpruned brute-force growth), not the idea. See §5.

---

## 3. The exact-arithmetic foundation (why it exists)

Every *decisive* test in the pipeline — vertex coincidence, collision, orbit identity, lattice
detection, dedup — is an **exact equality**. In floating point these are unsafe (coordinates are
irrational; error accumulates under repeated rotation), and the symptom is an off-by-one in the
counts. The fix ([`CYCLOTOMIC_SPEC.md`](CYCLOTOMIC_SPEC.md), implemented in
[`Cyclotomic.ts`](../lib/classes/Cyclotomic.ts)): represent a plane point as one element of the
cyclotomic field ℚ(ζ_N), ζ_N = e^{2πi/N}, in the canonical degree-φ(N) power basis, `bigint`
coefficients over a common denominator, reduced mod the cyclotomic polynomial Φ_N. For the regular
core N = 24 (φ = 8, Φ₂₄ = x⁸−x⁴+1), since i, √2, √3 ∈ ℚ(ζ₂₄). Float survives **only** at the render
boundary (`toVector`). Polygons are built by **boundary walk** (`vertexᵢ₊₁ = vertexᵢ + d; d ← d·ζ^t`),
never by `radius·(cosθ,sinθ)`, so all vertices stay in ℤ[ζ_N].

This is a **bankable result**: k=1 reproduces 11 with fully exact dedup, proving the representation
and canonicalization. Confirmed during this work: **bigint growth is NOT a bottleneck** — coefficients
stay tiny (≤4–6 bits) even at the real threshold=12.

---

## 4. Assessment — is the algorithm correct and a good direction?

**Verdict: completeness `at-risk`, correctness `at-risk` — not because the direction is wrong, but
because the implementation never checked its own defining property and the search pruned nothing on
it.** (This assessment came from a direct code read plus a multi-agent review with adversarial
verification.)

### What is sound and cheap
- VC generation, the compatibility graph, seed-set extraction and seed building are correct and fast
  (~0.4s for the regular core). Stages 1–5 are a good, reusable foundation.
- Exact arithmetic is canonical and the equality/key tests are sound.

### Correctness holes identified (independent of speed)
1. **No k-uniformity gate (the big one).** Nothing counted vertex orbits. "k=1 = 11" was a dedup
   count that *coincided* with the known value, not a verified k-gate. Safe at k=2 (two distinct VC
   types ⇒ ≥2 orbits, growth bounds ≤2 ⇒ exactly 2), but an **over-count risk at k≥3** when a seed
   repeats a VC type whose two copies are actually in the same orbit (then the tiling is really
   (<k)-uniform). *This was fixed — see §6, Step 1.*
2. **`threshold = 6k` is asserted, never derived.** Too large ⇒ wasted depth (the dominant cost);
   too small ⇒ silent **under-count** (a tiling whose period needs radius > 6k is missed). Also
   `findBasisExact` restricts basis candidates to the origin-polygon type and caps the scan at 12,
   which can miss the primitive basis on a sparse-origin k≥2 patch and silently drop it.
3. **Chirality convention is inconsistent across layers.** VC canonicalization is rotation-only (it
   yields 18 VC nodes for the regular core where rotation+reflection gives 15 — 3 chiral pairs:
   3,3,4,12 / 3,3,12,4 ; 3,4,4,6 / 3,6,4,4 ; 4,6,12 / 4,12,6), while the tiling-level `canonicalKey`
   is reflection-invariant and **merges** chiral tilings. Whether the target series counts
   enantiomorphic pairs once or twice is a convention that directly decides correctness and must be
   made consistent end-to-end. **Unresolved — a thesis decision point.**
4. **One decisive predicate is still float.** Proper overlap in both `hasFatalCollision` and
   `isLatticeVector` uses float `Polygon.intersects` (convex-hull based). Fine for the convex
   regular core (k=1=11 holds); **unsound for non-convex/star tiles**, which is a prerequisite for
   the later polygon families.
5. **Silent truncation.** A per-seed 90s cap dropped hard seeds with zero output, and the API expand
   route had no cap at all. *Made loud — see §6, Step 2.*

### The connectivity assumption (completeness, unproven)
Seed-set extraction requires the m distinct VC-types of a k-uniform tiling to form a **connected
subgraph** of the compatibility graph (`algorithm.md` §3, code in
[`SeedSetExtractor.ts`](../lib/classes/algorithm/SeedSetExtractor.ts)). This is plausible (the tiling
is edge-connected, and tiling-adjacency implies compatibility-graph adjacency) but **not proven**.
A thesis-grade completeness argument should establish it (or characterise exceptions).

---

## 5. The k≥2 performance wall — root-cause analysis

Full measurements are in [`K2_DIAGNOSIS.md`](K2_DIAGNOSIS.md). The conclusion, ranked:

**#1 (architectural, critical) — the DFS prunes nothing on the target property.** The only
termination is "frontier empty OR min-frontier graph-distance ≥ 6k". There is no admissibility /
branch-and-bound test that abandons a partial that can never become a valid k-uniform periodic
tiling, so every locally-legal branch is grown to the full 6k radius. For k=2 the radius doubles
(6→12); patch size and per-frame O(patch) work (spatial hash, BFS distances, frontier, candidate
loop) grow with it. Hard seeds grow ~730-polygon patches, keep ~400 such patches on the stack, and
emit 1400–2500+ leaves — **almost all boundary-variants or non-periodic junk**.

**#2 (combinatorial, high) — per-frame candidate product.** `findValidIsometries` builds the
Cartesian product coreVertices × boundaryEdges × seedEdges × {reflect}; ~96–98% of candidates are
rejected, but each still paid exact-transform + footprint + (for survivors) float-collision work.

**#3 (measurement artifact) — the original "94% in findValidIsometries, not branching" verdict was
measured at `threshold=4`,** which the diagnosis itself calls "unfaithful." At threshold=4 the tree
is shallow so per-frame cost dominates by construction; at the real threshold=12 the depth /
frame-count dimension (#1) takes over. **Lesson for the thesis: always measure at the real gate.**

> Bottom line: constant-factor tuning cannot make k≥2 finish, because the search has no early-exit on
> the property it enumerates. It needs pruning, or a different (solve-for-period) construction.

---

## 6. Development journey — what we did, what worked, what didn't

Chronological. Every code step preserved `pnpm build` green, k=1 = 11, and the k=2 first-cell tests
= 2. Tests live in [`tests/k-uniformity.test.ts`](../tests/k-uniformity.test.ts).

### Prior work (before this session), recorded for completeness
Three optimization passes (memoization, O(n²) frontier, state-dedup) and a constant-factor pass
(A–H: trig-free `toVector`, O(n) `recomputeEdgeDirsExact`, fused `transformedRigid`,
`refreshFloatCacheLite`, exact-key collision skip, DAG state-memo) — all in `K2_DIAGNOSIS.md`. They
took threshold-4 from ~32→~97 fps but **did not make k≥2 finish at the real threshold**, because they
attacked per-frame cost, not the architecture.

### Step 0 — Baseline at the real threshold=12 (measurement only)
The decisive measurement that had never been recorded. Hard seeds do not finish in 20s (stack stays
~410 deep, patches ~730 polys, leaves climbing); a few seeds finish fast. Confirmed root cause #1 and
that bigint is irrelevant. **This is the methodological turning point: it invalidated the prior
threshold-4 conclusions.**

### Step 1 — Exact k-uniformity gate ✅ (the correctness foundation)
New [`KUniformityChecker.ts`](../lib/classes/algorithm/KUniformityChecker.ts). Given the extracted
cell + exact lattice basis (which *define* the infinite tiling), it:
1. replicates the cell over the lattice into a clean, centred block;
2. enumerates candidate symmetries `g(z)=ζ^r·z + T` (rotation) and `g(z)=ζ^r·conj(z) + T`
   (reflection/**glide** — the carried translation `T` covers glides, which the old float
   `TilingChecker` could not detect), keeping those that map a reference polygon exactly onto a
   same-type polygon and **preserve the lattice**;
3. verifies each candidate is a global symmetry;
4. union-finds the vertex lattice-classes under the verified group; the number of classes is the
   true k.

Wired as the final filter in `extractTranslationalCellForK`: a tiling counts only if orbit-count == k;
a `null` (can't-decide) result is **kept**, so the gate can only ever *remove* a definite non-k
tiling — it never reduces completeness.

**A real bug found during validation (worth telling in the thesis).** The first version restricted
the symmetry search and verification to a fraction of the patch's bounding radius. On a *large* cell
(the `[3⁶;3⁴.6]` snub with a 22-polygon supercell) it reported **12 orbits instead of 2**: legitimate
symmetries were being rejected because their (un-reduced) images fell *outside* the finite block, and
`maxMag`-fraction regions are anisotropic on a parallelogram lattice. **Fix:** size the search
regions in **cell units** (from |u|,|v|) and verify each symmetry by **reducing its images modulo the
lattice** before testing membership — making verification independent of the block's finite extent.
After the fix the three genuine 2-uniform cells found 100+ symmetries and reported 2; the snub
"12" was confirmed to be a genuine non-2-uniform supercell (correctly rejected).

**Validation:** the 11 regular 1-uniform tilings each → 1 orbit (incl. the chiral snub, rotation-only);
the full **k=1 pipeline reproduces exactly 11** with the gate (so 11 is now a *validated* orbit-count,
not a coincidence); two genuine 2-uniform seeds → 2.

### Step 2 — Sound candidate pre-filter + honesty ✅
- **Pre-filter** in `findValidIsometries`: skip a whole core when a polygon name already present at
  the target vertex is absent from that core's polygons. Sound (alignment matches by exact key ⇒
  preserves name ⇒ necessary condition). Measured ~22% fewer candidates; counts unchanged. *As
  predicted, a constant-factor win that does not by itself make k≥2 finish.*
- **Honesty:** the silent 90s cap is now logged loudly; the API expand route got the same cap (was
  uncapped → could hang to the 300s function timeout). Capped seeds are surfaced as INCOMPLETE.

### Step 3b — Sound disallowed-VC prune ✅ (the biggest single win so far)
**Discovery (empirical, hypothesis-tested).** The expander never checked that *emerging* interior
vertices have an **allowed** VC. A probe found it floods the search with invalid patches — one hard
seed had a disallowed vertex configuration in **188 of 192** leaves. These are invalid by
construction (a k-uniform tiling using exactly the seed's k VCs has *every* vertex with one of those
VCs), yet the expander grew them to radius 6k before discarding them.

**Fix** (`SeedExpander.hasDisallowedSurroundedVertex`, run on each popped frame before any
frontier/isometry/leaf work): if any fully-surrounded vertex (interior-angle sum = 2π, checked via an
exact integer "units of π/12" scheme) has a VC outside the seed's allowed set, abandon the whole
branch. **Sound** (a necessary condition ⇒ never drops a valid tiling) and **also a correctness fix**
(the expander no longer emits invalid-VC patches; a new test asserts every emitted leaf uses only
allowed VCs).

**Impact (threshold=12):** a hard snub seed 9.9s → **2.3s**, 64 → **2** leaves. Full k=2 survey of
all 40 concrete seeds: **27/40 now FINISH** (avg ~0.5s each); 13 still cap. k=1 = 11 and k=2
first-cell = 2 preserved.

### Ideas tried and **rejected** (record these — they shape the thesis argument)
- **Reduce `threshold` (8 instead of 12).** Finishable seeds got faster (seed#1 3.4s) but the hard
  seeds still did not finish (they emit 2000–3500 leaves at radius 8 too). Reducing the radius is not
  the lever, and risks completeness. *Rejected.*
- **Canonical (symmetry-invariant) memoization of *partial* patches (hypothesis H1).** Measured to
  give no gain over absolute dedup: partial patches genuinely differ at the boundary — which is
  exactly where growth happens — so the symmetry-canonical key does not collapse them. *Rejected.*
- **Emit-on-validated-closure + prune the branch (the tempting "3a").** Idea: when a branch's patch
  closes into a period that the gate validates as k-uniform, emit it and stop growing that branch.
  **Proven UNSOUND for completeness:** a periodically-complete patch can still be extended
  *non-periodically at its boundary* into a *different* valid tiling (the boundary vertices are only
  partially constrained, so more than one completion can be locally legal → different global
  tilings). Pruning the closed branch would silently drop those. The orbit gate guards the *count*
  of emitted tilings but cannot recover a tiling the *search* never produced. *Rejected — do not
  ship.* (The radius-6k design is, in effect, the heuristic that tries to make boundary completions
  "forced enough"; shrinking it or short-circuiting it reintroduces this risk.)

---

## 7. Solve-for-period — the implemented central construction (`PeriodSolver`)

The expand-and-extract path's wall is **architectural**: it grows every locally-legal partial to
radius 6k with no early-out, so the hard seeds explore unboundedly many allowed-VC but *non-periodic*
boundary variants (§5). The principled fix (assessment "option C") is to **fix the period first**: a
periodic tiling is a tiling of the torus T = ℝ²/Λ, and once Λ is fixed the fill is **finite** — the
torus has bounded area, hence a bounded number of polygons, so the non-periodic junk simply cannot
grow. This is implemented in [`PeriodSolver.ts`](../lib/classes/algorithm/PeriodSolver.ts).

### The construction
For each seed:
1. **Discover candidate lattices Λ.** A shallow, time-boxed planar expansion of the seed surfaces the
   short translation vectors two complementary ways: (A) `extract()` on the small periodic leaves the
   easier seeds produce (the confirmed primitive basis — the reliable source, time-budgeted because
   `extract` is O(patch²)); (B) differences between same-name **same-orientation** tiles (period
   vectors appear as local repetitions even on patches that never fully close — the fallback for the
   hard seeds). Independent pairs, Gauss-reduced, are the candidate primitive lattices.
2. **Fill the torus** (`torusFill`). Seeded by the rigid k-VC core, corner-completion places one
   regular polygon at a time into the angular gap of an open vertex, all positions reduced **mod Λ**
   (so the patch never leaves one fundamental cell). Every vertex must end fully surrounded (2π) with
   an **allowed** VC; proper overlaps are rejected by the same float `intersects` (strict-interior, so
   edge-adjacency is legal) the planar expander uses. The fill is a finite DFS bounded by the cell's
   area (`cellArea / min-tile-area`).
3. **Certify** (`isCompleteTiling`). A closed cell is accepted only if, exactly: total tile area =
   |det Λ| (gap-free), no proper overlap, and every interior vertex is a surrounded allowed VC.
4. **Reject supercells** (`isPrimitive`). A non-primitive Λ tiles the *same* tiling as its primitive
   sublattice; counting both over-counts (the orbit count is tiling-intrinsic, so the gate cannot tell
   them apart). A sub-lattice translation mapping the cell onto itself ⇒ reject.
5. **Gate** to exactly k vertex orbits (`KUniformityChecker`) and **dedup** up to the full isometry
   group (`canonicalKey`).

**Why it is sound.** A certified torus tiling is a complete, fully-determined tiling — there is no
boundary to extend, so nothing is dropped (the objection that sank emit-on-closure, §6, does not apply
to a *closed* torus). Given Λ, corner-completion branches over every legal polygon at the chosen gap,
so it reaches every edge-to-edge filling of T.

### Development of the construction — the bugs and fixes (thesis-worthy)
- **Half-integer reduction split classes.** Reducing each tile mod Λ by `round()` of its lattice
  coordinates is fragile when centroids land on half-integer coordinates (the common case — e.g. the
  4 unit squares around a vertex), where float noise rounds Λ-equivalent tiles into *different* cells
  (the square tiling reported 2 cells/cell, area 2 ≠ 1, and never closed). **Fix:** a canonical class
  representative = the lex-min exact key among the class's near-origin lattice translates (the same
  *set* for every class member ⇒ boundary-immune).
- **Supercell over-counting.** Without the primitivity filter, a 1-uniform tiling was emitted once per
  candidate lattice (primitive + 5 supercells = 6 cells for `4.8.8`). The orbit gate can't catch this
  (orbit count is intrinsic). Fixed by `isPrimitive`.
- **Chirality in discovery.** Keying candidate vectors by polygon *name* alone fails on chiral/snub
  tilings: every triangle is "3" but sits at many orientations, and differently-oriented triangle
  differences are short *non-period* vectors that crowd out the true (longer) lattice vectors (the
  snub seeds found only tiny wrong lattices, all rejected at "initial self-overlap"). **Fix:** key by
  name **and orientation** (edge-direction set).
- **Discovery is the completeness-and-speed frontier.** Oriented-vector discovery alone missed some
  lattices the old `extract()` found (`[3⁶;3.3.6.6]` → 0); `extract()` alone was O(patch²) and hung on
  the hard seeds' ~700-tile leaves (the original 140 s). The shipped discovery runs **both**, with a
  time budget on `extract` — restoring the easy seeds and keeping the hard seeds bounded. The budgeted
  `extract` also *recovered* the genuine 2-uniform `[3⁶;3⁴.6]` cell (orbit 2), which neither source
  found alone.
- **Per-lattice speed.** Each fill is bounded by `ceil(cellArea / min-tile-area)`; the block is built
  over the tight lattice-point range within radius (not a loose M² box); near-degenerate candidates
  (a lattice vector shorter than a unit edge — impossible for a real period) are rejected. This took
  `3.4.6.4` from 45 s → ~14 s; supercell candidates are tried (a coarse lattice *can* be another
  tiling's primitive, so they cannot be skipped) but fail fast.
- **Seeding: rigid core, not single-VC.** Seeding from one VC (to free the gluing) is *strictly
  worse*: with Λ and the VC orientation fixed it then misses the very 2-uniform tilings the rigid core
  reaches (it regressed the fast seeds to 0). The rigid k-VC core pins a concrete sub-patch of the
  target tiling, so corner-completion reaches it.

---

## 8. Current state (summary)

| Stage | Status | Note |
|---|---|---|
| Exact arithmetic (ℚ(ζ₂₄)) | ✅ sound | bigint not a bottleneck |
| VC / compat-graph / seed-set / seed build | ✅ sound, fast | connectivity assumption unproven |
| Expansion (`SeedExpander`) | ⚠ partial | 27/40 k=2 seeds finish; 13 cap |
| **Solve-for-period (`PeriodSolver`)** | ✅ **new** | **bounded — all 40 k=2 seeds FINISH (0 timeouts, 203 s total)**; k=1=11 (primitive cells); fast k=2 seeds → 2; `[3⁶;3⁴.6]` 2-uniform recovered |
| Lattice/cell extraction | ✅ (regular core) | float collision; basis-cap caveat |
| **k-uniformity gate** | ✅ | k=1=11 validated; k=2 cells→2; supercell-safe via primitivity filter |
| **k=2 count = 20** | ✅ **20/20** (§13.5) | dedup correct (congruence, §13.1) + targeted union seeding recovers t2014 (§13.5); deterministic, 0 timeouts, identical digest across runs |

Tests: PeriodSolver suite (8) + the k-uniformity suite pass. Wired into the CLI behind
`USE_PERIOD_SOLVER=1` (replaces seedsExpansion + extractTranslationalCell). Changes uncommitted at
time of writing.

---

## 9. Open problems / future work (thesis "future work" section material)

1. **Lattice-discovery coverage — the new completeness frontier.** The hard seeds now *finish*
   (bounded torus), and the torus fill is *exhaustive given Λ*, so the remaining gap is purely **which
   lattices get discovered**. Discovery is still **coupled to expanding the concrete seed**: a
   tiling's period appears only if the seed's (junk-prone) expansion reaches that tiling's structure
   within the time budget.

   **The exact 5 missing (k=2 run = 15/20), matched against the authoritative 20** (Wikipedia
   *Euclidean tilings by convex regular polygons* §2-uniform; image numbers = `2-uniform_nNN.svg`):

   | Missing tiling | Seed | Why missed |
   |---|---|---|
   | `[3⁶; 3³.4²]` **both** variants (n14, n15) | `[3,3,3,3,3,3;3,3,3,4,4]` | seed produces **0** cells — discovery finds *no* valid lattice |
   | `[3⁶; 3⁴.6]` 1 of 2 (n19/n20) | `[3,3,3,3,3,3;3,3,3,3,6]` | found one variant's lattice, not the second |
   | `[4⁴; 3³.4²]` 1 of 2 (n3/n4) | `[3,3,3,4,4;4,4,4,4]` | found one variant's lattice, not the second |
   | `[3.4.6.4; 3.4².6]` (n5) | `[3,4,6,4;3,4,4,6]` | found 0 in this run (found in a *previous* run — see jitter below) |

   **The pattern is diagnostic.** Four of the five are the *second tiling of a vertex-pair that admits
   two distinct tilings* (different lattices, same two VC types): discovery surfaces one lattice but
   not the other. The fifth (`[3⁶;3³.4²]`, two variants) is a seed whose expansion never reaches a
   tiling structure discovery can read a lattice from. So the frontier is specifically **enumerating
   *all* primitive period-lattices compatible with a VC-pair, not just the first one the expansion
   stumbles into.**

   **Non-determinism (a real wart, must fix for a reproducible/provable count).** The discovery
   `extract()` is **time-budgeted**, so under different CPU timing it processes different leaves and
   finds different lattices. Two full runs both gave 15 but with *different* compositions (run 1 had
   `[3.4.6.4;3.4².6]` and one fewer `[3.4².6;3.6.3.6]`; run 2 the reverse). The count is therefore not
   yet run-to-run stable — a property any *proof* of "= 20" would require.

   The principled fix is **seed-decoupled, deterministic lattice enumeration** (enumerate candidate
   primitive lattices from the polygon set's geometry / bounded realizable translation vectors,
   independent of any one seed and of wall-clock) — the natural next step and the route to a *proven*,
   *reproducible* k=2 = 20. (Note ℤ[ζ₂₄] is dense in ℂ, so "all short lattice vectors" is not finite;
   the enumeration must be over *tiling-realizable* vectors.) **Full design spec for this next phase:
   [`LATTICE_ENUMERATION_DESIGN.md`](LATTICE_ENUMERATION_DESIGN.md)** — the geometric principle (Λ is
   over-determined by *area* + *shape/crystallographic* + *grid* quantizations), the algorithm
   outline, scaling in k and polygons, and the integration plan.

   **The anisotropy soft-spot is now empirically confirmed (project author, 2026-06-02):** the
   low-symmetry wallpaper groups — notably **`cmm`, whose primitive cell is a long, thin rhombus** —
   are exactly the dangerous case (area is hard-bounded but the *long* lattice vector is not), and **at
   least 3 of the 5 missing k=2 tilings fall in this category.** This makes the elongated-rhombic case
   the *dominant* failure mode, not a corner case: the deterministic enumerator must handle it by
   *fixing the short vector and solving the long one* from the area + grid + symmetry constraints
   (never enumerating the long vector by length) — see the design doc §2.
2. **Chirality convention.** Decide whether enantiomorphic pairs count once or twice (to match the
   target series) and make the VC layer (18 nodes) and the cell layer (reflection-merged) consistent.
3. **k≥3 over-count.** With repeated VC types in a seed, the orbit gate + primitivity filter are the
   safeguard — verify they give 61/151/332/673 once discovery is complete at those k.
4. **Non-convex tiles (stars, irregular).** Replace the float `Polygon.intersects` overlap test with
   exact rational segment-intersection before extending beyond the convex regular core.
5. ~~Update `algorithm.md`~~ — **resolved 2026-06-03 by removal** (the `/theory` page documented the
   unused wallpaper approach; archived in `../../resources/drafts/`). The implemented solve-for-period
   method gets its prose description in the thesis (`../../thesis/chapters/algorithm.tex`), kept in
   sync via `docs/SYNC.md`.

---

## 10. Honest position

"Exact method **validated at k=1** (a *certified* orbit-count over primitive cells, not a coincidence),
the **k≥2 wall converted from an unbounded hang into a bounded, terminating construction** (the
solve-for-period torus fill — sound, gap-free-certified, supercell-safe), the majority of the k=2
space computed including a recovered hard 2-uniform tiling, with the remaining shortfall **root-caused
to lattice-discovery coverage** (seed-coupled) and the precise fix identified (seed-decoupled lattice
enumeration)" is a legitimate, defensible thesis result — and a strictly stronger position than the
expand-and-extract path, which could not finish the hard seeds at all.

---

## 11. Deterministic lattice enumeration — implementation attempt + the tractability wall (2026-06-02, session 2)

This session implemented the seed-decoupled enumeration (§9.1 / `LATTICE_ENUMERATION_DESIGN.md`),
**discovered the area+alignment geometry empirically** (a real result — see below), built and **unit-validated**
the core math, then hit a **performance/tractability wall** when integrating it into `PeriodSolver`.
Recorded in full so the next session resumes informed, not from scratch.

### 11.1 The geometry we pinned down empirically (this is solid and thesis-worthy)
A read-only investigation (the 26 cells the solver already emits + the **Soto-Sánchez oracle**
[`chequesoto.info/tiling/JSON_Galebach.json`] for the 5 it misses, with an independent index
recomputation) settled how the k=2 period lattices split:
- **Grid-aligned long-thin cells (square / rectangular / `cmm`).** The conventional (mirror) axes lie
  on the 24-direction grid (multiples of 15°); side lengths are **exact sums of tile heights/apothems**;
  the long axis is **pinned by the exact area ladder** (`|long| = area ÷ |short|`), never searched.
  **All 5 currently-missing tilings are here** — verified index 1–2, grid-aligned (e.g. `[3⁶;3³.4²]` =
  `1 × (6+√3)` centered rectangle; `[4⁴;3³.4²]` = `1 × (1+√3)` rectangle; `[3.4.6.4;3.4².6]` =
  `√(2+√3) × 2√(2+√3)` at 105°/195°). *Restricting the "solve-long" step to the 24 grid directions is
  what makes it finite* (one long vector per (short, area)) — it dodges the density of ℤ[ζ₂₄] that makes
  a free "fix-short-solve-long" infinite.
- **Tilted "round" cells (snub-type).** snub-hexagonal `[3⁶;3⁴.6]`-family = a hexagonal lattice rotated
  **19.1° off the grid** (shortest vector `√7 = |2+ζ₆|`, grid-aligned rectangle has index **14**). These
  have **short primitive vectors**, so they fall out of construction-point differences in a shallow patch.
  Snub *square* tilts by exactly 15° (stays on-grid); only snub *hexagonal* escapes — subtle.
- **Consequence:** HNF-with-reference-lattices (the literature route, whose reference-set completeness is
  unproven — 4.8.8 = `(1+√2)·ℤ[i]` is *not* an integer-index sublattice of `ℤ[i]`) is **not needed for
  k≤2**. Grid-aligned cells come from grid directions + the area ladder; tilted cells from differences.
- **Agent error caught + corrected (process note):** a research sub-agent first mislabeled t2003/4/15 as
  "oblique/tilted" because it judged grid-alignment on the *primitive* basis. For a centered-rectangular
  (cmm) lattice the primitive vectors are the *centering* vectors (deliberately diagonal); the mirror
  axes are the *conventional* cell. Building the conventional cell from its own raw vectors flipped the
  verdict — all 5 are grid-aligned, index ≤ 2 (confirmed by a clean index recomputation, with
  snub-hexagonal = index 14 and the unit square = index 1 as controls).

### 11.2 What was built and is UNIT-VALIDATED (solid)
- **`lib/classes/algorithm/exact/Surd.ts`** — exact arithmetic in the real subfield ℚ(√2,√3) =
  ℚ(ζ₂₄)⁺: value `(P+Q√2+R√3+S√6)/D` (bigint), with `+ − × ÷ equals sign abs` (`sign` = float-first,
  exact rational-interval refinement; `÷` via conjugate rationalisation). Plus `imSurd`/`reSurd`
  (Cyclotomic→Surd via the exact 15° sin/cos tables), `surdToCyclotomic` (real Surd→Cyclotomic, cached
  √2/√3/√6 per ring), `detSurd(u,v)=Im(conj(u)·v)`, and `tileAreaSurd(n)` (△=√3/4, □=1, ⬡=3√3/2,
  8-gon=2+2√2, 12-gon=6+3√3). **`tests/surd.test.ts` — 14 tests pass** (radical algebra, division,
  exact sign on near-equal surds, det(1,i)=1, det(unit-hex)=√3/2, det(4.8.8)=3+2√2).
- **`lib/classes/algorithm/LatticeEnumerator.ts`** — `gridAlignedCells(shortVecs, polySizes, ring)`
  returns `[Cyclotomic,Cyclotomic][]`: for each grid-aligned short side `u` (`gridDirOf`) and each area
  `A` on the ladder, solves the perpendicular long vector (`A/|u|` index-1 rect; `(u, ½(u+ζ^⊥·2A/|u|))`
  index-2 cmm). Plus `areaLadder`, `gaussReduceExact`, `latticeKey` (basis-independent dedup),
  `sameLattice`/`isIntCombo`. **`tests/lattice-enumerator.test.ts` — 8 tests pass, incl. recovering
  ALL 5 oracle cmm/rect cells in isolation.** ⇒ **the enumeration math is correct.**
- **`lib/classes/algorithm/SeedExpander.ts`** — added `maxExpandNodes` (DETERMINISTIC frame-count cap,
  wall-clock-free) so the difference pool can be bounded reproducibly.

### 11.3 The integration + the wall (`PeriodSolver.candidateLattices` rewrite — WIP, currently REGRESSED)
`candidateLattices` was rewired to a deterministic union: (A) **pairs** of short difference-pool vectors
(round/tilted cells), (B) **`gridAlignedCells`** (long-thin cmm/rect), deduped by exact `latticeKey`,
sorted by exact area. The difference pool (`shortDifferenceVectors`) now uses `maxExpandNodes` (no
wall-clock). **`tsc --noEmit` clean; Surd + LatticeEnumerator unit tests green.** But a full k=2 run
**hit a tractability wall** — measured precisely (env `PS_PERF=1`, `scripts/_perf.ts`):
- **The branching expander is the dominant cost:** `expand` = **10–12 s** on hard `3⁶` seeds (e.g.
  `[3⁶;3⁴.6]`, `[3⁶;3³.4²]`, `[3⁶;3,3,6,6]`), <200 ms on the rest. `gridGen` is **fast** (4–35 ms,
  producing 1.2k–18k candidates) and `gridPush` (the exact `latticeKey` dedup) is 10–180 ms. So the
  candidate *math* is cheap; the *pool expander* and the *per-candidate fill* are the costs.
- **`torusFill` ≈ 33 ms per wrong candidate** ⇒ feeding it hundreds of `gridGen` candidates blows the
  per-seed budget. With node cap 1200, seed 0 `[3⁶;3⁴.6]` found **0 cells and timed out** (20 s) —
  worse than the old code, which found its round cell.

### 11.4 THE HONEST DIAGNOSIS (the reason to refocus — read before resuming)
1. **The parameters I reduced are COMPLETENESS knobs, and they are in TENSION** — not free speed dials:
   - **node cap** (pool depth): lower ⇒ faster expander, but the pool surfaces fewer period vectors ⇒
     the pair-logic **loses round cells** (seed 0 → 0). Speed and completeness are the *same dial*,
     opposite directions.
   - **area cap**: a bound on which cmm cells `gridGen` can express (sound for k=2 only because those
     cells are small; truncation must be logged).
   - **long-axis filter** (`gridGen` skips compact cells as "the pair-logic's job"): sound *only if* the
     pool is deep — which **conflicts with lowering the node cap**. Two "fixes" fight each other.
   ⇒ **The fast regime is the incomplete regime.** That is the tractability red flag.
2. **The approach as integrated did NOT remove the expensive expander — it added `gridGen` on top.**
   `candidateLattices` still runs the branching expander for the pool (the original k≥2 wall) *and* now
   validates many candidates with a 33 ms fill. Architecture = `#candidates × fill_cost`, both large.
3. **What is validated vs broken:** the geometry + enumeration **math is correct** (unit tests, all 5
   cells recovered). The **integration is intractable as built** — slow branching pool (also a
   completeness knob) + slow per-candidate validation.

### 11.5 NEXT PROBLEM TO TACKLE (the refocus — two cost drivers, attack the root first)
1. **The pool's branching expander is the ROOT** (slow *and* a completeness knob — it *was* the original
   k≥2 wall). Stop depending on it. Two candidate directions:
   - **(C) Replace it with a cheap, deterministic, non-branching patch grower** (single corner-completion
     patch, grown deep & cheap → pairs find round *and* cmm cells, likely **retiring `gridGen` and the
     area ladder entirely**). Risk: a greedy single patch can diverge from the true tiling at ambiguous
     vertices — must confirm it still surfaces the right periods.
   - **(B′) Enumerate the tilted/round cells algebraically too** — the snub cell is `(2+ζ₆)·triangular`,
     a small **ring-element multiplier** (the thing the HNF-reference route was actually for). Removes the
     pool, but reopens the reference-set completeness question (which ring multipliers `c`? finiteness?).
2. **Validation cost** — `torusFill` ~33 ms/candidate is too slow to call hundreds of times. Either
   generate *few* high-quality candidates (validate ~tens), or add a fast necessary-condition reject
   (μs) before the full fill, or a per-candidate frame cap (bounds wrong cells; risk: cuts a correct
   large fill — must size against measured correct-cell pop counts, which we did NOT yet measure).

**Recommended starting point:** attack #1 (the expander) first — it is the genuine root, fixing it can
collapse the candidate-explosion problem (a deep cheap pool makes `gridGen`/area-ladder unnecessary),
and it directly retires the original k≥2 wall rather than working around it.

### 11.6 Working-tree state at handoff (everything UNCOMMITTED; last commit `c6aebf8`)
- **Solid (keep):** `exact/Surd.ts` + `tests/surd.test.ts` (14✅); `LatticeEnumerator.ts` +
  `tests/lattice-enumerator.test.ts` (8✅, all 5 cmm recovered); `SeedExpander.maxExpandNodes`.
- **WIP / currently regressed:** `PeriodSolver.candidateLattices` rewrite (deterministic union) — builds
  + type-checks, but full k=2 is slow/incomplete (perf wall). Contains **temporary `PS_PERF` stderr
  instrumentation** (remove later) and currently-experimental knobs: `maxExpandNodes=1200`,
  `areaLadder` cap `min(orbit, 8k)`, `LONG_AXIS_MIN=2.5`, `LADDER_SIZE_CAP=4000`, `DEN_PREFILTER=48`.
  The OLD (committed-quality) `candidateLattices` that yields a deterministic-ish **15/20** is recoverable
  from git history / the prior file state if a clean baseline is wanted.
- **Temporary scaffolding:** `scripts/_perf.ts` (perf harness, env `PS_PERF=1`, modes `gen`/`full`) —
  delete before finalizing. `scripts/probe-pipeline.ts` is the durable count harness (keep).
- **Caveat:** `pnpm build` / `pnpm test` were NOT run to completion after the `candidateLattices`
  rewrite (the test run was killed at the perf wall). Re-establish a green baseline before resuming.

---

## 12. Seed-free algebraic enumeration — built, validated to the oblique class, VC-area filter; k=2 = 23 with the over-count localized (2026-06-02, session 3)

This session **deleted the branching expander from the live path** and replaced lattice discovery with a
**seed-free, deterministic, algebraic enumeration**. It is built, type-clean, `pnpm build` green, unit
tests pass. Coverage is **proven complete up to the oblique Bravais class** at k=2,3,4 against the
Soto-Sánchez oracle. The k=2 run now **terminates with no timeouts and is deterministic**, but counts
**23 (target 20)** — and the entire +3 is one localized dedup bug (chiral snub), not an algorithm
failure. Full record below so nothing is re-litigated or re-broken.

### 12.1 What the live `candidateLattices` is now (replaces the expander)
`PeriodSolver.candidateLattices(seed)` is seed-FREE in content (depends only on the ring, the tile set,
and the seed's VC tile-incidence — never the seed geometry), cached per `(ring.N, vcSignature, k)`:
1. **`shortVectorPool(ring, steps, lmax, dirs, monotone)`** (`LatticeEnumerator.ts`) — BFS of all distinct
   vertex-difference vectors reachable as **sums of ≤ `steps` unit edges** within length `lmax`, exact
   (ℤ[ζ₂₄]), deduped. A period vector IS a sum of edges, so bounding the STEP count (not length — ℤ[ζ₂₄]
   is dense) makes it finite. `steps=6, lmax=5.6` covers every k=2 cell vector (largest 2+2√3≈5.46).
2. **`edgeStepDirs(ring, polySizes)`** restricts the pool to the directions the tiles can actually
   produce — see §12.5. Sound; collapses {3,6}/{4} seeds to a small lattice.
3. **monotone** pool growth (only outward steps) — sound, ~20–30% fewer points/candidates (§12.5).
4. **`roundCells`** (hex `(v, v·ω)` + square `(v, v·i)`) over the pool, restricted to grid-aligned ∪
   compact-off-grid short vectors; + existing **`gridAlignedCells`** (rect + cmm, long axis solved from
   area, kept only if the solved vector is itself in the pool).
5. **VC-area filter** as the area test (§12.4) — replaces the generic tile-ladder.
Deleted from the live path: `shortDifferenceVectors`, the `SeedExpander` dependency, all `PS_PERF`
instrumentation, the `discoveryThreshold/discoveryMaxMs/lmax` knobs.

### 12.2 Coverage proven complete up to the oblique class (oracle-validated)
The candidate set CONTAINS every realizable period lattice except oblique (p1/p2), checked against the
**Soto-Sánchez oracle** by decoding each tiling's two translation vectors and testing `sameLattice`:

| k | tilings | covered by hex/sq/rect/cmm | missed |
|---|---|---|---|
| 2 | 20  | **20** | 0 |
| 3 | 61  | **59** | 2 oblique |
| 4 | 151 | **146** | 5 oblique |
| 5 | 332 | (oblique census only) | 18 oblique |
| 6 | 673 | (oblique census only) | 30 oblique |

Findings: **no oblique lattice occurs at k=2** (special to k=2 — they first appear at k=3 and grow
0,2,5,18,30); **no octagons** in the regular k≤6 tilings (all oracle coordinates are ℤ[ζ₁₂] = even
directions). So the method **generalizes** — it is complete for 4 of the 5 Bravais classes at every k
tested, with a precise, bounded gap.

### 12.3 ⚑ HNF sublattice enumeration is INCOMPLETE for our mixed tiles — DO NOT IMPLEMENT IT
The literature route (Hermite-Normal-Form sublattices of a reference lattice) was tested and **ruled
out**. Oblique cells whose short vector is a **√2/√3-mixed** length (|u|=√(2+√3)≈1.932, or 2.909) are
**not integer-index sublattices of any** hexagonal/square/rect/cmm reference — the documented
`4.8.8 = (1+√2)·ℤ[i]` obstruction. Measured: HNF-over-symmetric-references missed 1/2, 1/5, 3/18, 6/30
oblique cells at k=3..6. The only COMPLETE method for oblique is **reference-free short-vector pairing**
(fix a short pool vector u, pair with pool v whose area is admissible) — which covers 100% of oblique at
k=3..6 but produces **~198k candidates** (the dense-ladder explosion, worse). **Conclusion:** oblique
completeness and the dense-{3,4} tractability are the SAME unsolved problem; HNF does not solve it.
Oblique is therefore **out of scope for the immediate k=2 goal** (k=2 has zero oblique) and is a real
open problem for k≥3.

### 12.4 ★ The VC-area filter — the key new insight (sound + complete + sharp)
The generic area ladder ("area = any sum of tile areas") is far too permissive and is the root of the
candidate explosion. The **cell's tile multiset is FORCED by the seed's VCs**, not free: a translation
cell with `V_i` vertices of VC-orbit `i` contains `#n-gons = (Σ_i V_i·c_{i,n}) / n` (an integer ≥ 0,
because each n-gon is shared by its n corners), so its **area = Σ_n area(n)·(Σ_i V_i·c_{i,n})/n** — a
sparse set over admissible `(V_i)`, NOT the dense ladder. Implemented as `vcAreaSet(vcIncidences,
areaBound)` in `LatticeEnumerator.ts`; `roundCells`/`gridAlignedCells` take it as the area test.
- **Sound + complete**: every real cell's area is in its own seed's set (each n-gon count must be a
  non-negative integer; both VCs present ⇒ V_i ≥ 1). Hand-verified: snub-hex [3⁶;3⁴.6], area 6.5√3, is
  6×3⁶ + 6×3⁴.6 (= 20 triangles + 1 hexagon) → in the set.
- **Crystallographic cap `V_i ≤ |P| ≤ 12`** (`MAX_ORBIT_VERTICES`): each orbit splits into at most |P|
  lattice-classes per primitive cell (|P| ≤ 12 = D₆, the largest 2D point group). Sound bound on the
  enumeration. ⚑ NOTE it is **NOT** an orbit-count bound — multiple ORBITS can share one VC TYPE, so the
  per-type total can exceed 12; capping per type does not exclude high-orbit fills (see §12.7).
- **Measured cut (real k=2 path)**: {3,4} `[3⁶;3³.4²]` 1315→**402**, {3,4,6} `[3.4.6.4;3³.4²]` 1318→**27**,
  {3,6} `[3⁶;3⁴.6]` 88→52. Made k=2 terminate.

### 12.5 Direction restriction + monotone growth (the dense↔discrete insight)
Every edge of an edge-to-edge tiling points along a direction the tiles' angles generate, so a period
vector (a sum of edges) lies in the subgroup of ℤ/N generated by the tiles' EXTERIOR angles **and**
180° (undirected edges): **`g = gcd(N/2, {N/n : n ∈ tiles})`**, directions = multiples of `g`. Sound (no
edge points elsewhere; all 20 / all k≤6 regular tilings use only EVEN directions = ℤ[ζ₁₂]).
- The real payoff is **dense → discrete**: the restricted ring is `ℤ[ζ_{N/g}]`, which is a genuine 2-D
  lattice exactly when `φ(N/g) ≤ 2`, i.e. `N/g ∈ {3,4,6}`. So **{3,6}/{3}/{6} → 6 hexagonal directions →
  Eisenstein lattice ≈ 120 points** (vs ~145k for all 24); **{4} → Gaussian ≈ 80**. **{3,4} / {3,4,6,12}
  → ζ₁₂ stays DENSE (~2.6k)** — the persistent hard case. Pool sizes (steps 6, lmax 5.6): 24-dir 143k,
  12-dir 2.6k, 6-dir 120, 4-dir 80.
- **monotone** (each BFS step strictly increases |position|): sound (the cell basis vectors are always
  reachable by an increasing path — verified, all 20 still covered), ~20–30% fewer points. ⚑ Keep the
  step CAP — monotone WITHOUT the cap explodes the dense ring (>2M).

### 12.6 Bounds established this session (thesis-worthy, load-bearing)
- `V_cell ≤ k·|P| ≤ 12k`; **`V_i ≤ |P| ≤ 12` per orbit** (crystallographic restriction).
- Edge directions = multiples of `g = gcd(N/2, {N/n})`; the restricted ring is discrete iff `φ(N/g) ≤ 2`.
- Hermite: a lattice of area A has a vector of length ≤ √(2A/√3) — bounds the "short" vector in pairing.
- Oblique census (oracle): 0,2,5,18,30 oblique at k=2..6; short vector of every oblique cell ≤ 3.61,
  area ≤ 13.

### 12.7 k=2 result and the over-count diagnosis (the remaining gap)  *(PARTLY WRONG — corrected in §13.3: "23 = 20 + 3" was actually 19 distinct inflated by canonicalKey under-merging; t2014 was never emitted)*
Full k=2 probe: **23 distinct tilings, 0 timeouts, 407 s (~6.8 min)**, a stable composition digest (so it
is deterministic). The +3 over 20 is **entirely one tiling**: the **snub-hex 2-uniform (oracle t2020),
counted 4× instead of 1×**. Diagnosis (`scripts/probe-pipeline.ts` + ad-hoc checks):
- The 4 cells are all the **identical hexagonal lattice shape** (Gram g11=g22=13, g12=−6.5, 120°; the
  snub √13 norm), but `sameLattice` splits them into **two mirror-image lattices** (the **+ and −
  chirality** of the off-grid snub) × **two fundamental-domain representations** each = 4.
- Every cell is gap-free-certified, primitive, allowed-VC, and **orbit = 2** (the gate is not at fault;
  it returns no `null` here). T-junctions are impossible (unit edges either coincide or don't), so the
  cells are valid tilings — they are just the SAME tiling over-counted.
- **`canonicalKey` / `canonicalPatchKey` fail to merge them.** They fingerprint ONE polygon
  representation and try only GRID rotations (`mulZeta`), so they are robust neither to the
  fundamental-domain choice (basis-dependent mod-Λ reps) nor to the off-grid chiral orientation, even
  though `canonicalKey` does loop reflections.

### 12.8 ⚑⚑ FLAGS — things to NOT get wrong again
1. **Chirality convention = MERGE mirrors → target 20** (author-confirmed, matches OEIS A068599 /
   Galebach). A chiral tiling and its enantiomorph count as ONE. The tiling-level dedup MUST be
   reflection-invariant AND representation-invariant AND orientation-invariant (incl. OFF-grid). The
   current `canonicalKey` is none of the latter two for the snub. ~~**This is the only thing standing
   between the current pipeline and a correct k=2 = 20.**~~ *(WRONG — §13: a robust dedup was built and
   is correct, but it is NOT the only gap; t2014 is missing to a separate `torusFill` bug. The dedup
   merging isometry is also a GRID isometry, not off-grid as claimed below.)*
2. **`canonicalKey` is not a true tiling invariant** — it depends on the cell's polygon representation
   (which depends on the basis used for mod-Λ reduction) and only tries 15° rotations. Needs a
   representation-robust canonical key (research notes point at Systre/Gavrog for exactly this).
3. **Do NOT implement textbook HNF** for oblique (§12.3) — provably incomplete for mixed √2/√3 cells.
4. **`V_i ≤ 12` is a per-ORBIT bound, not per-VC-TYPE** — capping per type does not bound the orbit count
   (multiple orbits share a VC), so it does NOT prune high-orbit fills (it is sound but perf-neutral).
5. **Coverage ≠ enumeration.** The oracle checks confirm the candidate SET contains the right lattices;
   producing exactly N tilings additionally needs the fill + gate + a CORRECT dedup (the current gap).
6. **No octagons / oblique at k=2; even directions only** for regular k≤6 — relied upon; re-verify before
   extending to star/irregular polygons (those break ℤ[ζ_N] and the float `intersects`).

### 12.9 Performance status (acceptable, improvable; not the blocker)
The fill (`torusFill`) is ~40 ms/pop, dominated by `buildBlock` (rebuilt every pop) + the exact
vertex-key incidence map in `analyze`. The k=2 run is ~7 min with no timeouts. This session reduced the
per-pop block radius from `2·cellDiam+6` to `cellDiam+7` (`buildBlock(reps, ctx, 5)` on the hot path;
the certification block at `+8` is unchanged as the safety net) — minor, because for small cells the
radius change is small. **Future levers (not yet done):** skip far polygons in the `analyze` incidence
loop (only those within `judgeR + ~2` can touch an in-range vertex); incremental block across the DFS;
float broadphase for the incidence/overlap with exact confirm. None are needed for correctness.

### 12.10 The validation oracle (infrastructure — keep)
`https://chequesoto.info/tiling/JSON_Galebach.json`, a JS assignment `Galebach={ "tKNNN": {T1,T2,Seed},
… }` (K = uniformity; trailing commas ⇒ not strict JSON, strip them). Each translation vector is
`[a,b,c,d]` = `a + b·ζ₁₂ + c·ζ₁₂² + d·ζ₁₂³`, and **ζ₁₂ = ζ₂₄²**, so it embeds into our ring as
`a + b·ζ²+ c·ζ⁴ + d·ζ⁶` (even powers only). This is THE authority for "got exactly these N tilings".

### 12.11 Immediate next step  *(SUPERSEDED — see §13: dedup is DONE, and it revealed the real count is 19, not 23-as-distinct)*
Implement the **chirality- and representation-robust tiling dedup** (merge the snub's mirror lattices +
representations). Cleanest: dedup by a canonical key computed from a fixed-radius vertex-star patch,
normalized over reflection AND the actual (possibly off-grid) lattice orientation — rather than over the
24 grid rotations of one cell's polygon set. Expectation: k=2 → exactly 20. Then re-run twice to confirm
the composition digest is identical (determinism), then `algorithm.md` update + the fill speed pass.

> **Correction (§13):** the dedup was implemented as an **exact pairwise congruence test** (not a
> canonical key), and the "off-grid orientation" premise above is **wrong** — every merging isometry is
> a *grid* isometry. The dedup is correct, but it did **not** yield 20: it revealed that the pipeline only
> ever emitted **19** distinct tilings (the old "23" was 19 inflated by `canonicalKey` under-merging),
> with **t2014 missing** to a separate `torusFill` gap. Read §13.

---

## 13. Representation-robust dedup DONE — and it uncovered that k=2 coverage is 19/20, not 20/20 (2026-06-03/04, session 4)

This session implemented the dedup (§12.11), which is **correct and sound**, and in verifying it
end-to-end discovered that two long-standing claims in this document were **wrong**: the over-count was
not "20 + 3 snub", and coverage was never complete. The dedup did its job — it removed the over-count
*and exposed a real, separate, pre-existing completeness bug the over-count had masked*.

### 13.1 The dedup: exact pairwise CONGRUENCE, grid-only (the "off-grid" premise was a red herring)
`lib/classes/algorithm/TilingCongruence.ts` — `tilingsCongruent(cellA,uA,vA, cellB,uB,vB)` and
`dedupeByCongruence(cells, keyOf?)`. Two periodic tilings are the same iff some plane isometry maps one
onto the other (chirality MERGED). The candidate isometries are derived by **flag correspondence**: pick
a reference polygon P0 of A; for every same-name Q of B, every grid rotation r∈[0,N) and reflect∈{F,T},
pin `T` so g(P0)=Q exactly, then verify (i) `g(Λ_A)=Λ_B` (`sameLattice`) and (ii) the whole cell maps
onto cell B mod Λ_B by exact-key set equality (lex-min canonical class rep on both sides). Reuses
`KUniformityChecker`'s isometry machinery, `sameLattice`/`isIntCombo`, `Polygon.exactKey`.

**The grid-only finding (refutes §12.7/§12.8's "off-grid chiral orientation").** Every tile is built by
`RegularPolygon.fromAnchorAndDirExact`, a unit-ζ-step boundary walk, so **every edge vector is a unit
grid direction ζ^t** (and the oracle confirms all regular k≤6 coords are in ℤ[ζ₁₂]). Any
tiling→tiling isometry maps edges to edges, so its rotation generator is a ratio of two unit grid edges
= a **grid power** (for a unit edge `e=ζ^a`, `e⁻¹=conj(e)`, so no field inverse is needed). The
off-gridness lives **only** in the lattice period vector (3+ζ₆), never in an edge or in the merging
isometry. So a *grid*-isometry test is complete; the scary off-grid cyclotomic-unit enumeration the docs
feared is unnecessary. A throwaway verify-first spike confirmed `0` non-grid edges and merged the snub's
representations under grid isometries before any production code was written.

**Sound (no over-merge), proven two ways.** (a) Argument: a passing g is an explicit grid isometry with
`g(Λ_A)=Λ_B` and an exact-key bijection of A's tiles onto B's — a genuine tiling isomorphism, so only
truly-isometric tilings merge. (b) Empirical: every merge `dedupeByCongruence` makes was independently
re-checked with a **reduction-free** test (does a grid isometry map one tiling's central disk *exactly*
onto the other's patch, comparing actual placed polygons — no mod-Λ reduction?). All merges confirmed,
including 3-member classes that merge cells on *different* lattices (`sameLattice=false`) that are the
same tiling at different orientations.

Applied at three layers: a cheap `canonicalKey` pre-filter is kept intra-loop; `PeriodSolver.solve` then
runs `dedupeByCongruence` on its few survivors (final authority per seed); and the cross-seed
aggregation in `scripts/probe-pipeline.ts` + `lib/algorithm/run-pipeline.ts` runs it again (the snub's
duplicates are produced across different seeds). The probe's composition digest is re-pointed at the
congruence-class id (min-`canonicalKey` member), so it is order-independent.

### 13.2 A broader instance of the same bug: the k=1 chiral snub was also over-counted
`PeriodSolver.solve` for the single VC `3,3,3,3,6` returned **2** cells, not 1 (a test failing already at
HEAD `468ebc6`). The k=1 chiral snub's two mirror lattices were never merged by `canonicalKey` either.
The "k=1 = 11 validated" claim (§3, §6) held only via the **expander** path (`k-uniformity.test.ts`),
which is *not* the live `PeriodSolver` path — so the live path silently over-counted the k=1 snub
(its true k=1 output was 12). The congruence dedup in `solve` fixes it (2→1). Lesson for the thesis:
validate the *live* path, not a parallel one.

### 13.3 ⚑⚑ The over-count diagnosis in §12.7 was WRONG: the true emitted count is 19, not 20
The probe now reports **19**, not 20. The reduction-free cross-check proves the dedup is **not**
over-merging, so 19 is the genuine number of distinct tilings the pipeline emits. Therefore the old
"23 = 20 real + 3 snub duplicates" (§12.7, and the memory) was **incorrect**. The real decomposition,
confirmed against the Soto-Sánchez oracle:
- **19 distinct tilings are emitted**, inflated to 23 by `canonicalKey` *under*-merging: the snub t2020
  split into 4 keys (+3) and one other tiling split into 2 keys (+1). `canonicalKey` never over-merges
  (equal key ⇒ congruent), so its 23 was an over-count of a true 19, never an undercount-masking-20.
- Matched each emitted cell's lattice against all 20 oracle k=2 lattices: **19/20 covered, t2014 missing**.
  (Aside: the 20 oracle tilings occupy only **17 distinct lattice classes** — several share a lattice —
  so "20 lattices covered" in §12.2 was about lattice coverage, which is *necessary but not sufficient*
  for emitting 20 tilings. §12.8 flag 5 — "coverage ≠ enumeration" — is exactly this, now concrete.)

### 13.4 The missing tiling t2014 = [3⁶;3³.4²], and its root cause: a `torusFill` gap (NOT dedup, NOT enumeration)
`t2014` (oracle T1=[1,0,0,0], T2=[-1,0,2,1]) is the **1×(1+√3) rectangle**, cell = **1 square + 4
triangles**, on VCs **3⁶ and 3³.4²** (V₀=1 hexagonal-VC vertex, V₁=2 mixed vertices — the tile/vertex
arithmetic is consistent only for this VC pair, *not* for [4⁴;3³.4²]). Its seed is
`[3,3,3,3,3,3;3,3,3,4,4]` — the very seed §9.1 flagged as "produces 0 cells".

Probed directly: its lattice **is** in the live `candidateLattices` (one of 397 candidates for that
seed; matches the oracle basis exactly), but `torusFill` produces **0** cells on it. So the gap is in the
**fill**, not lattice enumeration and not dedup.

**Mechanism — verified (a 3-agent adversarial workflow, `PeriodSolver.DEBUG` traces + reduction probes).**
`torusFill` rejects at the **"core area > cell area" guard** (`initialArea > cellArea`,
[`PeriodSolver.ts`](../lib/classes/algorithm/PeriodSolver.ts) ~351): the rigid 2-VC seed core (9 polys: a
full 3⁶ fan = 6 triangles + a full 3³.4² fan = 3 triangles + 2 squares) reduces mod Λ to **6 distinct
classes = 2 squares + 4 triangles = area 2+√3 ≈ 3.73**, but the cell holds only **1 square + 4 triangles
= 1+√3 ≈ 2.73**. The extra square is the tell: in t2014 the two squares of a 3³.4² vertex are Λ-translates
by `u=(1,0)` (ONE class), but the SeedBuilder glued the 3⁶ and 3³.4² blocks at a **non-lattice relative
offset** (square-centroid difference `(-0.5,-1.866)`, *not* an integer combo of `u,v`), so the two
squares stay distinct and the core spans 2+√3 in one domain. **The rigid core is therefore NOT a valid
sub-patch of t2014** — its frozen adjacency can never reduce to t2014's cell.

**The seeding hypothesis above was WRONG (corrected).** It is *not* that any seed bigger than this tiny
cell fails, and *not* that sub-vertex seeding is required. With the allowed-VC set fixed to t2014's two
VCs, `torusFill` **fills and certifies orbit=2** when seeded from **either full single-vertex fan** (the
3⁶ hexagon reduces to 4 classes / area √3 < cell; the 3³.4² fan to 3 classes / area 1.866 < cell — both
pass the guards), and even from a **single triangle or single square**. The 6-triangle hexagon does NOT
self-overlap mod Λ (its triangles collapse to 4 classes). **Only the rigid 2-VC core fails.** So t2014 is
genuinely reachable; the defect is *purely* the rigid core's size+arrangement, which §7 chose for
completeness ("single-VC misses the tilings the rigid core reaches"). The truth is **neither seeding alone
is complete**: the rigid core misses t2014, single-VC reaches it — so the fix is **union seeding** (seed
torusFill from the rigid core *and* per-VC single-vertex fans; `coreSets` is already a `Polygon[][]`).

**Why uniquely t2014 (verified across all 20).** It has the **smallest k=2 cell** (1+√3 ≈ 2.73, narrow
side exactly 1 — the unit-edge minimum a period can be), and it is the **only** tiling whose rigid-core
footprint exceeds its cell on *every* congruent basis (its 6 candidate bases give footprints
{3.17…5.03}, all > 2.73). All other 19 fit. ⚑ **Latent fragility:** three tilings (t2004, t2011, t2012)
fit *only by exact equality* (footprint == cell), passing solely because the guard compares with a
`+1e-6` float slack — the area comparison should really be **exact in ℚ(√2,√3)** (`Surd`), not float, to
be robust. That is a separate hardening item.

### 13.5 The fix — targeted union seeding — and **k=2 = 20** ✅
Implemented in `PeriodSolver.solve`. The rigid k-VC core stays the default seed, but **per-lattice** the
solver now checks whether the core OVERFLOWS the cell — `footprintArea(corePolys mod Λ) > |det Λ|` (with a
cheap exact short-circuit: skip the check when `|det Λ| ≥ totalCoreArea`, since the reduced footprint
never exceeds the unreduced total). On the few small cells where it overflows (the core would be
area-rejected and yield nothing), it seeds instead from the **single-VC fans** (`corePolys` incident to
each VC's shared vertex — exact, correctly placed). A `diag.fanLattices` counter surfaces how many
lattices used fans (loud, not silent).

- **Why targeted, not blanket union:** seeding from the fans on *every* lattice (the naive union) tripled
  the work and pushed the hardest 3⁶ seeds past the 120s cap → **timeout → non-determinism** (the very
  wart §12.7 eliminated). Restricting fans to overflow lattices keeps the fast rigid-only path on every
  large cell, so the run stays **deterministic** (0 timeouts) and only ~2× the dedup-only time.
- **Result:** full k=2 probe = **20**, 0 timeouts, **deterministic** — identical composition digest
  `f3e2e0517191362c` across two runs (745s without the short-circuit, **405s with it** — the short-circuit
  nearly halved the time while leaving the digest unchanged, confirming it is behavior-preserving). t2014
  (the 1×(1+√3) cell, 4 triangles + 1 square, orbit 2) is recovered. 109 tests
  pass (incl. a t2014 regression test asserting `fanLattices>0`, the cell shape, and orbit 2), `pnpm build`
  green. Live `run-pipeline` per-seed cap raised 60s→120s for headroom (timeouts there are logged INCOMPLETE).
- **⚑ COMPLETENESS NOTE (load-bearing, do not lose):** "fans only where the core overflows the cell" is
  **exact for k=2** — verified across all 20 that the rigid core misses ONLY the core-overflow tiling
  t2014. It is a **heuristic at k≥3**: a tiling could in principle be reachable only by a fan on a cell the
  rigid core *also* fits (a different relative-orientation gluing), which this trigger would not cover.
  Revisit before trusting k≥3 counts — the honest general fix is either blanket union seeding (with the
  timeout/perf cost addressed) or a proof that the rigid core + overflow-fans suffice.

### 13.6 Remaining (future work)
1. **Harden the `torusFill` area guard to exact `Surd`.** t2004/t2011/t2012 currently fit only by the
   guard's float `+1e-6` slack (footprint == cell exactly); an exact ℚ(√2,√3) comparison removes that
   fragility.
2. **k≥3 seeding completeness** (the §13.5 caveat) and **k≥3 oblique lattices** (§12.3 — the deep open
   problem; HNF is ruled out).
3. **Performance:** union seeding is ~2× the dedup-only time; the fan fills on overflow lattices are the
   cost. A fast necessary-condition reject before each fan fill, or incremental block reuse, would help.

---

## 14. k=3 — structural generalization confirmed, but the tractability wall is real (2026-06-04, session 5)

Goal: check whether the method generalizes to k=3 (target 61). Verdict, now empirical: **it generalizes
STRUCTURALLY (produces correct orbit-3 tilings) but is NOT tractable to completion at k=3 as built** —
the hard 3⁶-family seeds time out. Setting it up correctly also surfaced two real issues a naive
`probe 3` would have hit silently. **All k=3 code changes below are committed but the full-run RESULT
was not yet captured** (the scout was mid-flight at handoff — re-run it; see §14.5).

### 14.1 Oracle characterization (new durable tool `scripts/oracle-characterize.ts`)
Decodes the Soto-Sánchez oracle for any k and classifies each lattice's Bravais type by **exact
symmetry** (lattice automorphism: invariant under a rotation ζ^r or reflection conj∘ζ^r). k=3 = 61
tilings: **hex 22, cmm/rect-conventional 17, rectangular 16, square 2, rhombic-cmm 2, OBLIQUE 2**.
- **Reachable ceiling = 59/61.** The 2 oblique (**t3046, t3055**) are not in our candidate set (no
  oblique enumeration — §12.3, HNF ruled out), so they cannot be produced.
- ⚑ **Classifier trap (re-hit and caught):** my first classifier judged oblique on the *primitive*-basis
  angle/length and reported 19 oblique at k=3 — the exact long-thin-cmm mistake §11.1 warned about. The
  **controls** (known oblique census 0,0,2,5 at k=1..4) exposed it (k=2 showed 5 instead of 0 — the 5
  cmm cells). The symmetry-based classifier gives the correct 0,0,2,5. *Always validate a classifier on
  the known-answer controls.*

### 14.2 Parameter scaling (PeriodSolver.candidateLattices) — committed
`POOL_STEPS=6 / POOL_LMAX=5.6` were **k=2-hardcoded**; the longest k=3 cell vector is **6.732 > 5.6** and
needs **≥7 > 6** edge-steps, so those tilings were silently un-generated. Now **k-scaled**: k≤2 keeps the
validated 6/5.6 (so k=2=20 is unchanged); k≥3 uses `poolSteps = 2k+2`, `poolLmax = √(22k)` (k=3 → 8 /
8.12), and the short-side caps (`compactOffMax2`, `gridShortMax2`) are loosened to the pool length.
`areaBound = 16k` already scaled (k=3: 48 > max area 39.25 ✓). ⚑ These are **empirical bounds sized to
the known oracle maxima, NOT proven** — a tiling whose cell vector exceeds the pool reach is silently
missed, and a longer pool blows up the dense ring (see §14.4). A real completeness bound is future work.

### 14.3 ⚑ The Surd lattice enumeration is N=24-ONLY (architectural constraint)
`imSurd`/`gridDirOf`/`detSurd` (Surd = ℚ(√2,√3) = ℚ(ζ₂₄)⁺) **require N=24**. But `computeRing` picks the
*minimal* ring — {3,4,6,12} → **N=12** — which **crashes** (`imSurd: requires the N=24 ring`). This never
surfaced at k=2 (the full set {3,4,6,8,12} → N=24). Workaround in the probe: **force N=24** (every regular
n ∈ {3,4,6,8,12} divides 24, so it is always valid — just a larger containing ring). To run a non-octagon
subset *natively* in N=12 would need the Surd layer extended to ℚ(√3). The live `run-pipeline` is only safe
because it uses the full N=24 set; a non-octagon param there would hit the same crash.

### 14.4 The tractability wall (the genuine blocker)
- **447 multi-VC seeds at k=3**; building them alone takes ~125s.
- The machinery **works**: sampled seeds produce orbit-3 cells (`orbits=[3,3,3,3]`), dedup + union
  seeding fine. But the **hard 3⁶-family seeds time out** — all 6 sampled concretes of
  `[3⁶;3⁴.6;3⁴.6]` hit the 120s cap (fanLat 14–20 — union seeding is firing on many small cells). This
  is the §11 dense-pool / per-candidate-fill wall at k=3 scale.
- **Tile-set tractability** (pool size at k=3 params, steps 8 / lmax 8.12): {3,6}=216, {3,4,6}=6624,
  {3,4,6,12}=6624 (12-dir) — all OK; **{3,4,6,8,12}=700k** (octagons → 24 directions = the wall).
- So the run is scoped to **{3,4,6,12}** (12-dir, tractable); it excludes octagon tilings, so it reaches
  at most the non-octagon subset of the 59.

### 14.5 The scout (re-run in the new chat) + how the probe changed
`pnpm tsx scripts/probe-pipeline.ts 3 3,4,6,12 60000` — launched in the background at handoff (60s
per-seed cap for a faster first look), **result not captured** (multi-hour run, was in progress). Re-run
it to get the **X/59 lower bound** + the timed-out-seed breakdown. Coverage is the **union over seeds**,
so per-seed timeouts don't necessarily lose a tiling (often reachable via another seed) — the count is a
meaningful lower bound. The probe now: takes a tile-set arg (`argv[3]`), a per-seed `maxMs` arg
(`argv[4]`), **forces N=24**, and prints `fanLat` per seed. Then oracle-match the emitted cells (decode
+ `latticeCongruent`, as in session 4) to report which of the 59 were found/missed and why.

### 14.6 NEXT (priority order)
1. **Optimize the hard-seed per-fill cost** — the genuine blocker for tractable k≥3. Levers (§12.9/§11.5):
   skip far polygons in `torusFill.analyze`; incremental block reuse instead of rebuilding `buildBlock`
   every pop; a fast necessary-condition reject before each (union-seeding) fan fill; float broadphase
   with exact confirm. The union-seeding fan fills on small cells are a measurable contributor.
2. **Verify the k≥3 union-seeding heuristic** (fans-only-on-core-overflow — exact at k=2, unproven at
   k≥3; §13.5): at k=3 a tiling could be reachable only by a fan on a core-FITTING cell.
3. **Oblique** (2 at k=3, growing 0,2,5,18,30) — the deep open problem (§12.3; HNF ruled out).
4. **N=12 Surd support** if non-octagon subsets are wanted without forcing N=24; **octagon (24-dir)
   tractability** for the full set.

---

## 15. Weak-spot audit → Phase 0 (the 4.6.12 fix + behaviour-preserving perf), the k=3 profile, and the early-prune rulings (2026-06-04, session 6)

This session executed **Phase 0** of the weak-spot audit (`docs/WEAK_SPOT_AUDIT_2026-06-04.md`), which
uncovered a **real completeness bug on the live path**, landed four behaviour-preserving optimizations,
then **profiled k=3 for the first time** and got an early-prune soundness ruling from TA. Work is on
branch `perf/phase0-buildblock-dedup` (commits below); k=1=11/k=2=20 reproduced byte-identical.

### 15.1 ⚑ The live solve-for-period path was k=1 = **10**, not 11 — 4.6.12 silently dropped (commit `96051f8`)
Capturing the Phase-0 baseline exposed that the **live `PeriodSolver` path drops 4.6.12** (truncated
trihexagonal, one of the 11 Archimedean tilings): the k=1 probe gives **10 distinct tilings, digest
`78c43fdc3e372188`**. The `k=1=11` test never caught it because that test exercises the **`SeedExpander`
path** ([`tests/k-uniformity.test.ts:89`](../tests/k-uniformity.test.ts)), not `PeriodSolver` — the exact
"validate the live path, not a parallel one" trap §13.2 flagged for the snub, *still open* for 4.6.12.
- **Root cause (confirmed by experiment):** `candidateLattices` returned **0** for `[4,6,12]`. Its
  primitive cell is 1 dodecagon + 2 hexagons + 3 squares = **`9 + 6√3 ≈ 19.39`** (12 vertices = the
  tight `V=12k` bound), but `areaBoundF = 16·k = 16` at k=1 filtered the area out, so no lattice was
  generated. The code comment even asserted "the largest k=1 cell ≈ 14.8" — **wrong** (it overlooked
  4.6.12). Temporarily lifting the bound → `[4,6,12]` immediately yields 3 lattices → 1 cell → k=1 = 11.
- **Fix:** `areaBoundF = 24·k·a_max`, `a_max` = largest tile area in the seed's tile set — the **proven**
  cell-area bound (Route-A `thm:weight`/`cor:box`; `../resources/research/route-a-proven-box.md`). Raising
  the area *ceiling* does **not** enlarge the pool (the binding completeness knob is the pool reach), so
  no tractability blow-up. Verified: live **k=1 = 11** (digest `6f9ca9cf2d16c75f`); **k=2 = 20**
  byte-identical (`f3e2e0517191362c` — the pool already caps k=2 area below the old 32, so no k=2 change).
- **Lesson:** the empirical `16k` was not merely "unproven" (audit A1/A5/D1) — it **demonstrably dropped a
  target tiling at the simplest k**, silently. This is the mission rule's forbidden case. Other empirical
  bounds (`poolSteps`, `poolLmax`, the per-orbit-vs-per-type cap A4) remain to be de-magicked in Phase 1.

### 15.2 Phase 0 behaviour-preserving optimizations (commit `79f8a95`)
Four optimizations, completeness-knobs FROZEN, **byte-identical** results (k=1=11/`6f9ca9cf`,
k=2=20/`f3e2e051`), 109 tests + build green. Speedups: test suite **160 s → 77 s (~2×)**, k=2 probe
**443 s → 278 s (~1.6×)**, 0 timeouts.
- **C1 — incremental `buildBlock`:** the torus-fill DFS now *carries* each cell's block on the stack and
  extends it by ONE new tile's lattice translates per child (disjoint classes ⇒ a set union), instead of
  rebuilding the whole block every pop (the §12.9-named dominant cost). Block order is irrelevant to every
  consumer (incidence is a vertex-keyed map; overlap checks are boolean). The `canonicalRep`-based
  progress check reproduces the old `dedupModLattice(...).length` test exactly.
- **C2 — `analyze` incidence cull:** skip block tiles whose centroid is beyond `judgeR + maxCircum` (no
  vertex within `judgeR`); the *full* block is still returned for the wider overlap check.
- **C3 — `coreSelfOverlapsNearest`:** a cheap O(reps) reject of too-small Λ via the 8 nearest translates,
  a strict subset of `blockHasProperOverlap`, run before the initial block build.
- **C5 — memoize `reducedClassKey`** per `(polygon.exactKey, lattice)` across all pairwise congruence
  tests in `dedupeByCongruence`.

### 15.3 ★ The k=3 profile — the FIRST real measurement (env `PS_PROFILE`)
Profiled one hard seed `[3⁶;3⁴.6;3⁴.6]` (12-dir `{3,4,6,12}`, 60 s cap). The breakdown rewrites the lever
ranking:

| phase | time | share |
|---|---|---|
| **torus fill** | **50.1 s** | **83%** |
| orbit gate (`KUniformityChecker`) | 9.9 s | 16.5% |
| candidate enumeration | **0.024 s** | 0.04% |
| canonicalKey + congruence dedup | 0.43 s | <1% |

`lat=171` candidate lattices, only **89 tried** in 60 s; **`gateRej=67` of 73 completed cells (92%) fail
the orbit==3 gate** — the repeated-`3⁴.6` seed fills mostly into **2-uniform** tilings. So: candidate
enumeration and dedup are NEGLIGIBLE (Gram-first sieve / the C5 memo do **nothing** for the k=3 wall);
**the wall is filling cells that aren't even k-uniform.** Phase 0 made each fill ~2× faster but
`#fills × cost` still blows 60 s. Many seeds (the whole `[3⁶;3⁴.6;3⁴.6]` family — 15 concretes) time out.

### 15.4 Idea tried and **rejected** — the core-coincidence prune (UNSOUND; TA `48e1160`, `rem:unsoundprunes(3)`)
Tempted by the 92% waste, I implemented "abandon a fill when two of the seed's k core vertices coincide
mod Λ — same vertex ⇒ <k orbits ⇒ the gate rejects anyway." Behind a flag it caught ~0 on the test seed.
**TA ruled it NOT SOUND, and the reasoning was the bug:** coinciding core vertices share *one* orbit, but
the **missing orbits can be realized by FILL-CREATED vertices**, so such completions can be genuinely
k-uniform and the gate **accepts** them — the prune would *silently drop valid tilings*. Reverted. The
deep reason (TA `b68732e`, `rem:unsoundprunes`): **no upper bound on final orbit count is readable from a
partial fill** — only the lower bound is monotone. So *symmetry-based abandonment* and *cross-branch
subsumption* are both prohibited (the latter is the §6 emit-on-closure mistake again).

### 15.5 The early-prune rulings — what IS sound (TA `b68732e`; `route-a-proven-box.md` §"Early-prune rulings")
The honest k=3 ceiling: the **<k degenerations (the 92%) use full type support, so NO sound early prune
can detect them mid-fill** — their fill cost is the structural price of completeness. Reduce it via
*cheaper* and *fewer* fills, not riskier prunes. Let `hol(Λ)` = holohedry order: **oblique 2, rect/cmm 4,
square 8, hex 12** (from reduced Gram data; if unsure use the LARGER — always sound).
- **P1 — orbit-floor (mid-fill, "the big one"):** abandon when `vertexClasses(partial) > k·hol(Λ)`.
  Catches too-MANY-orbit junk / supercells (hex k=3 fires at 37 classes; oblique at 7 — makes oblique
  fills cheap when they arrive in Phase 3). Sound: classes only accumulate; a primitive completion then
  has orbits > k (gate-rejected), a supercell is primitivity-rejected and re-found at its finer lattice.
- **P0 — arithmetic lattice pre-filter (before any fill):** skip Λ if NO feasible tile multiset with
  `V = Σ tₙ(n−2)/2 ≤ k·hol(Λ)` (per-tile V: △ ½, □ 1, ⬡ 2, 8-gon 3, 12-gon 5). Pure integer arithmetic
  over the area decomposition the enumerator already computes; cuts the `lat=171` list upfront.
- **P2 — type-feasibility + cheap pre-gate:** at closure, if occurring types ≠ `supp(M)`, drop without
  the gate. ⚑ Sound ONLY in all-seed-sets runs (the probe) — guard by run mode.
- **Sound, no-ruling-needed levers:** **seed-state dedup per lattice** (canonicalize initial torus states,
  fill identical ones once — deflates fan×orientation×placement) and **incremental incidence map** (the C1
  extension — carry the incidence map across pops). Plus everything else in the audit's perf table.
- **PROHIBITED:** cross-branch subsumption; symmetry-based abandonment (see §15.4).

### 15.6 State at handoff + NEXT
- **Branch `perf/phase0-buildblock-dedup`**, off `45d8023`. Commits: `96051f8` (area-bound fix),
  `79f8a95` (C1/C2/C3/C5), + the `PS_PROFILE` diagnostic. Verified byte-identical k=1=11/k=2=20; build +
  109 tests green. **Ready to merge to master.** k=3 NOT yet run to completion (the hard 3⁶ seeds still
  time out at 60 s — Phase 0 helps but does not crack the wall, exactly as the audit predicted).
- **NEXT (Phase 1/2, all sound + licensed):** merge the branch, then implement **P0 + P1** (orbit-floor +
  lattice pre-filter) and **seed-state dedup + incremental incidence**, each verified byte-identical
  against k=1=11/k=2=20 and re-measured on the `[3⁶;3⁴.6;3⁴.6]` seed via `PS_PROFILE`. Then re-run the k=3
  scout (`pnpm tsx scripts/probe-pipeline.ts 3 3,4,6,12 60000`) for the X/59 lower bound + digest. Also
  pending from Phase 1: de-magic `poolSteps`/`poolLmax` (loud INCOMPLETE-REGION assertion), fix A4
  (per-orbit vs per-type cap), exact-`Surd` area guards (B1).
- **Escalation (GATED — do NOT implement yet):** if the 3⁶ family still caps after the licensed levers,
  the user-proposed **orbifold-fill** is the structural cure for the 92% <k waste — branch each Λ over
  candidate wallpaper groups `(Λ, P, placement)` and fill the **orbifold** (quotient by P) with a budget
  of ≤ k vertex-orbits per branch, so the fill depth is divided by |P| and the redundant lower-symmetry
  copies are never built. It is NOT the abandoned wallpaper-fitting (Λ is fixed first; no shape matching),
  and sound by the same reject-or-recover pattern. **Designed in
  `../resources/research/orbifold-fill-design.md`; gated** behind: land the licensed levers + re-scout,
  and TA writes the `(G, placement)` completeness proof FIRST (the t2014/core-coincidence lesson — a
  symmetry assumption that *looks* sound can drop tilings), THEN CC implements behind a flag. (SYNC
  2026-06-04 TA.)

## 16. Phase 1 — the sound k=3 fill levers (P0 lattice pre-filter, P1 orbit-floor, seed-state dedup, the exact holohedry classifier), byte-identical at k=1/k=2, and the honest k=3 profile (2026-06-04, session 7)

Branch `perf/phase1-k3-fill-levers` (off Phase 0 `4ce0ba6`). Implements the four TA-licensed sound levers
from `route-a-proven-box.md` §"Early-prune rulings". **All four verified byte-identical** against the
Phase-0 baseline: live **k=1 = 11** (`6f9ca9cf2d16c75f`), **k=2 = 20** (`f3e2e0517191362c`); `pnpm build`
green; **124 tests** green (109 + 15 new). The levers are sound (they cut only branches/lattices that the
gate/primitivity would reject anyway) — the byte-identical digest is the empirical proof, exactly the
safety net the mission rule demands.

### 16.1 `holohedry(u, v)` — the exact Bravais-class divisor (`lib/classes/algorithm/LatticeEnumerator.ts`)
P0/P1 divide the vertex count by `hol(Λ)` (oblique 2, rect/cmm 4, square 8, hex 12), the order of Λ's
Bravais point group and an **upper bound** on any tiling's point group `|P|`. Computed exactly from the
Gram matrix `(|u|², |v|², u·v)` of the Gauss-reduced basis — `reSurd(u.normSquared())`,
`reSurd(u.conj().mul(v))`, compared with exact `Surd.equals`/`.cmp`. The three reduced-cell symmetry
signatures are `u·v = 0` (perp), `|u| = |v|` (eqLen), `2|u·v| = |u|²` (centered); square = eqLen∧perp,
hex = eqLen∧centered, rect/cmm = any one signature, oblique = none. ⚑ **Soundness rule: it must NEVER
underestimate** (a too-low floor drops valid tilings), so on any doubt — a basis not provably
Lagrange-reduced (`2|u·v| ≤ |u|² ≤ |v|²` checked exactly), or a degenerate input — it returns **12**, the
2D maximum, which is always sound (weaker prune). TDD'd against square/hex/rect/cmm/oblique and the
off-grid snub-hex t2020 (Bravais class hex, NOT oblique — the trap) + basis-independence.

### 16.2 ★ P0 — arithmetic lattice pre-filter (the big win: candidate lattices 171 → 69)
Skip a candidate Λ when **every** tile multiset realizing its exact cell area needs more vertex classes
than `k·hol(Λ)` allows: `minVerts(|det Λ|) > k·hol(Λ)`. `vcAreaMinVerts` (sibling of `vcAreaSet`) returns,
per realizable area, the minimum `V = Σ_i V_i` over the VC-orbit multiplicity assignments — and by Euler
`V = Σ_i V_i = Σ_n t_n(n−2)/2` is exactly the torus vertex count, so `orbits ≥ V/hol(Λ) > k` ⇒ the cell is
gate-rejected (or a supercell, re-found at its primitive sublattice — a separate, smaller candidate).
Cached with the candidate list (per ring/vcSig/k). On the hard `[3⁶;3⁴.6;3⁴.6]` seed it removed **102 of
171** candidates upfront (`p0Skip=102`, `lat=69`). Sound + licensed (NOT a completeness knob): it removes
only lattices that can carry no k-uniform tiling with these VCs. Area-key miss ⇒ keep (never drop on doubt).

### 16.3 P1 — orbit-floor prune (sound, but a **0× no-op on the hard seed** — confirms TA's <k ceiling)
The DFS carries the running set of vertex classes mod Λ (`vReps`, extended one tile at a time via the
exact `latticeEquivExact`); a child whose count exceeds `ctx.orbitFloor = k·hol(Λ)` is pruned. Sound
because every k-uniform tiling has `V_final ≤ k·hol(Λ)` (orbit size ≤ |P| ≤ hol) and `V` is monotone under
filling, so a branch toward a valid tiling NEVER exceeds the floor (prune is strict `>`; the boundary
`V = k·hol` is kept). The exact vertex counter (`vertexClassCount`, TDD'd: square cell V=1, honeycomb V=2,
trihexagonal V=3 — proving V ≠ orbit count) cannot over-count, so it never prunes early.
- ⚑ **The measurement that matters:** on `[3⁶;3⁴.6;3⁴.6]` (hex, floor 3·12 = 36) **P1 fired 0 times**
  (`p1Prune=0`). Reason: the 92% wasted fills are **<k degenerations** (2-uniform, V ≤ 24), which have too
  FEW orbits, not too many — they never reach 37 classes. This **empirically confirms TA's honest ceiling**
  (`rem:unsoundprunes`): the dominant <k degenerations are provably NOT early-prunable; their fill cost is
  the structural price of completeness. P1's value is real but lies elsewhere — too-many-orbit junk /
  supercells, and (Phase 3) the brutal oblique floor (`2k+1`).

### 16.4 Seed-state dedup — implemented, guarded; near-no-op in the fast path (infra for the proven mode)
On lattices with >1 seed set (only the core-overflow / fan lattices), fill each distinct initial torus
state (canonical `stateKey` mod Λ) once. Sound by determinism of the fill on its initial state. Guarded by
`seedSets.length > 1` so the single-seed fast path is byte-identical and unpenalized. In the current rigid-
core fast path this fires rarely (fans already deduped at the planar level), so its real payoff is the
**proven blanket-fan mode (O2)**, where `fan × orientation × placement` multiplies redundant states.

### 16.5 Incremental incidence map — **DEFERRED** (profile-driven, documented)
The fourth listed lever. Deferred after the profile: the k=3 wall is the irreducible <k-degeneration fills
(P1 = 0×, §16.3), **not** analyze-overhead. An incremental inc map needs a per-child clone (siblings can't
share a mutable map) which is `O(block)` — the *same order* as the rebuild it replaces — so a constant-
factor (~1.5–2×) win on a sub-part of fill that does NOT crack the wall, while carrying the highest byte-
identical risk of the four (Map-insertion-order → open-vertex tie-break; safe only because the k=1/k=2
digest is set-based on non-timeout runs). Not worth the risk for the gain. The structural cure for the <k
bucket is the gated **orbifold-fill** (§15.6 escalation), not this micro-opt. Revisit if a future profile
shows analyze dominating fill on a seed where P1 *does* fire.

### 16.6 Verification + the k=3 profile/scout
- **Byte-identical:** k=1 probe `6f9ca9cf2d16c75f` (11), k=2 probe `f3e2e0517191362c` (20) — unchanged.
  Build green, 124 tests green. The k=2 probe also ran faster (~96 s vs the Phase-0 278 s) — likely P0
  trimming back-of-queue large-cell candidates, though some is environmental; the digest is the hard fact.
- **k=3 profile** (`scripts/profile-k3-seed.ts`, env `PS_PROFILE`): `lat=69` (was 171), `p0Skip=102`,
  `fill=51.6s`, `gate=8.2s`, `p1Prune=0`, `gateRej=48/71`, still `timedOut` at the 60 s cap. P0 helps but
  does not crack the per-seed wall (as the audit predicted).
- **k=3 scout** (`pnpm tsx scripts/probe-pipeline.ts 3 3,4,6,12 60000`, 447 seeds, ~1h59m): **59 distinct
  tilings, digest `a4d05490f47eccf3`** (317 raw cells, **55 seeds timed out**). 59 = the FULL reachable
  ceiling (oracle: 59/61; the 2 genuinely-oblique t3046/t3055 are outside the candidate set, awaiting the
  cor:box oblique join-closure). ⚑ Honest status: this is a **lower bound from a run with 55 timeouts** —
  it MATCHES the reachable ceiling (so every non-oblique k=3 tiling was recovered, strong evidence the SET
  is complete), but it is NOT a timeout-free *certified-exhaustive* count. The digest is over the deduped
  set, so it is stable iff every run recovers all 59; only one run was taken — a confirmation run (or the
  no-wall-cap parallel runner) is the way to certify stability. This is TA's orbifold reproduce-or-beat
  baseline (orbifold milestone, SYNC `af7534a`).
- **Adversarial soundness review** (4-agent workflow, this session): all four dimensions — holohedry
  never-underestimates, P0, P1 monotonicity, seed-state dedup + byte-identical — returned **sound**, no
  counterexamples, grounded in the diff + `route-a-proven-box.md`. The only caveat raised is the
  PRE-EXISTING pool-completeness heuristic (isPrimitive-guarded; the open INCOMPLETE-REGION item), not
  introduced here.

### 16.7 State + NEXT
- Branch `perf/phase1-k3-fill-levers`. New exports: `holohedry`, `vcAreaMinVerts`, `areaKey`
  (`LatticeEnumerator`), `vertexClassCount` (`PeriodSolver`); new diag fields `p0Skipped`/`p1Pruned`/
  `seedStateDedup`; new harness `scripts/profile-k3-seed.ts`.
- **NEXT:** still queued from Phase 1 — de-magic `poolSteps`/`poolLmax` (loud INCOMPLETE-REGION assertion),
  A4 (per-orbit vs per-type cap), exact-`Surd` area guards (B1). The 3⁶ family still caps ⇒ the
  **orbifold-fill escalation gate is now reached** (licensed levers landed + re-scouted) — per §15.6 / SYNC
  this hands back to TA for the `(G, placement)` completeness proof before CC implements it behind a flag.

## 17. Parallelization v1 — the process-sharded scout, and the discovery that the 3⁶ wall is *slow*, not intractable (2026-06-04, session 8)

TA approved per-seed parallelization (SYNC, work order `640595a`) with four binding guards + a
serial/parallel digest-identity acceptance test. Implemented as pure **orchestration** (PeriodSolver and
LatticeEnumerator UNTOUCHED — the orbifold freeze): `scripts/scoutCodec.ts` (exact cell (de)serialization),
`scripts/scout-worker.ts` (per-core process), `scripts/scout-parallel.ts` (coordinator). Branch
`perf/parallel-scout`, commit `2931682`; build + 128 tests green.

### 17.1 Design + the four guards
- **Guard #4 (exact coefficients cross the wire):** a cell tile is a `RegularPolygon` from the unit-ζ-step
  boundary walk, so `{n, exact anchor, first edge-dir}` reconstructs it EXACTLY via
  `fromAnchorAndDirExact` → identical `exactVertices`/`exactCentroid` → identical `canonicalKey`. TDD'd
  (`tests/scout-codec.test.ts`): serialize→JSON→deserialize preserves canonicalKey AND congruence.
- **Guard #1 (order-independent digest):** the coordinator collects every worker's cells and runs the
  *same* `dedupeByCongruence(cells, canonicalKey)` + DJB2 as the serial probe. That dedup keeps the
  **min-canonicalKey representative per class and sorts by it** (TilingCongruence.ts) — so the digest is a
  pure function of the SET of raw cells, independent of arrival order. Hence digest-identity is *by
  construction*, not luck.
- **Guard #3 (dynamic queue):** the coordinator hands out seed indices one at a time over stdio (not static
  shards), so the front-loaded 3⁶ family can't starve a shard. **Guard #4 also** = each worker rebuilds the
  ring + seed list itself (≈126 s, concurrent) — no shared mutable state.
- **Acceptance PASSED:** parallel k=1 = 11/`6f9ca9cf2d16c75f` (8.0 s vs 15.8 s), k=2 = 20/`f3e2e0517191362c`
  (30.2 s vs 96.4 s, ~3.2×) — byte-identical to serial.

### 17.2 ★ The capped k=3 run, and why guard #2 exists (the result got WORSE)
Parallel k=3 at the **same 60 s cap** as the 119 min serial baseline, 8 workers: **1447.5 s (~24 min) =
~4.9×** wall-clock — **but it recovered only 56 distinct (digest `eaefaab5…`, 72 timeouts) vs serial's 59
(55 timeouts).** This is **guard #2 made visible** ("contention + time caps = run-to-run truncation
jitter"): a *wall-clock* cap under 8-way contention gives each capped seed slightly less CPU in its 60 s
window, so 17 more seeds tip over the cap and 3 tilings are lost. The ~4.9× is partly inflated — the
parallel run did *less* total fill work. Lesson, now empirical: **never wall-clock-cap a parallel run you
want a stable/certified number from.** (A per-CPU-time cap would dodge this but needs editing the frozen
`PeriodSolver`, so it waits.)

### 17.3 ★ The discovery: the 3⁶ wall is *slow*, not intractable — no-cap parallel is the certified path
Probed the worst-looking seed `[3⁶;3⁶;3⁴.6]` with **no cap** (`maxMs=0`): it **completes in 369.6 s
(~6.2 min), `timedOut=false`**, lat=50 (P0 cut 93), raw=397, gateRej=222, **p1Prune=0** (the 92% gate
rejections are <k degenerations again — §16.3), fill 88%. So the seeds the 60 s cap was killing are not
unbounded — they are ~minutes-long finite fills. ⇒ a **no-cap parallel sweep is tractable for the first
time**: ~72 hard seeds × a few min / 8 cores. **RESULT: the no-cap sweep finished — 59 distinct, digest
`a4d05490f47eccf3`, 0 timeouts, 447/447 seeds, ~149 min on 8 workers** (inflated ~1.6× by a concurrent DS
emulator + Spotlight indexing; ~90-110 min on a free box). It reproduces the EXACT digest the capped serial
run found (55 timeouts there), so it **certifies** the 59 rather than lower-bounding it — the orbifold
Phase-C reproduce-or-beat baseline, timeout-free. The hard cost is real: the worst concretes are
single-threaded ~10-22-min torus fills (one `[3⁶;3⁶;3⁴.6]` concrete took 1328 s uncapped — concretes of a
single seed *name* vary 4× in cost), so a *serial* no-cap sweep would be ~20 h; parallelization is what
makes a certified k=3 obtainable at all. **Honest framing:** parallelization is a sound ~core-count
accelerator (it does NOT crack the per-seed cost — that's the orbifold's job), but by removing the
wall-clock cap it converts the k=3 scout from "incomplete lower bound" to a *certified* sweep that finishes.

### 17.4 Crash-resume (commit `8ce89d5`)
A long no-cap sweep must survive shutdowns. The coordinator writes each finished seed to an in-repo,
reboot-safe NDJSON (`.scout-cache/k<k>_<tiles>_cap<ms>.ndjson`, gitignored, keyed by run params) and on
startup reads it to SKIP done seeds and reuse their cells — so an interruption loses at most the seeds in
flight. `scoutCodec.readResumeNdjson` tolerates a truncated final line (mid-write kill). Verified: fresh
k=1 → 11/`6f9ca9cf2d16c75f` (writes a 15-seed file); a re-run RESUMES all 15, 0 new work, 1.1 s, identical
digest. Orphan-safety FIXED in the same pass: the worker now exits on stdin `'close'` (coordinator death),
so an unclean coordinator exit no longer leaves workers burning a core — a mid-solve worker finishes its
current seed, then exits.

## 18. Chirality audit — the orbifold-contract §4 obligation, discharged (2026-06-04, session 9)

The proof pass for the orbifold (G, placement) theorem (thesis `8c9b454`, `rem:chirality`) raised a latent
ambiguity that, per the contract, had to be checked against the **existing** pipeline before any k≥3
completeness claim (including the upcoming join-closure k=3=61). This audit is the discharge. **No code
change resulted — the pipeline was already correct; the value is the proof of robustness, which gates
everything downstream.**

### 18.1 The hazard

A vertex configuration (VC) is a cyclic sequence of polygon edge-counts; it is **chiral** when its mirror
(reversed sequence) is not equal to itself up to rotation — over {3,4,6,8,12} there are exactly **3 chiral
mirror-pairs**: `{3.4.4.6 ↔ 3.6.4.4}`, `{3.3.4.12 ↔ 3.3.12.4}`, `{4.6.12 ↔ 4.12.6}` (12 of the 18 VC types
are achiral). In a **reflective** tiling that contains a chiral VC `u`, the mirror symmetry sends a
`u`-vertex to a vertex of the mirror type `ū` — chiral vertices never lie *on* a mirror line, so they occur
in mirror pairs that, under the full group, form a **single chirality-mixed orbit** with member oriented
types `{u, ū}`. The feared hole: if a pre-gate check compared VC types **rotation-only** and the admissible
set held only `u`, the torus fill would hit a `ū`-vertex, fail the closure check, and **silently drop the
whole tiling** — fatal for the completeness claim, with no oracle backstop at k≥3.

### 18.2 What the three contract checks actually do

- **(a) closure type-check** (`PeriodSolver.analyze` `:606-607`, `isCompleteTiling` `:692-693`) and **(b) the
  admissible-vc list** `allowed` (`:144-146` via `vcNameAt` → `:894-902`) both run every comparison through
  the local **`canonicalVCName`** (`:69-81`), which takes the lex-least over rotations **AND the reversed
  sequence** — i.e. **mirror-merged**. Both sides of every closure comparison use the *same* function, so a
  `ū`-vertex resolves to the *same* key as `u` and is accepted whenever `u` is admissible. The hole's premise
  ("`allowed` holds only `u`") is structurally impossible: `allowed` is never keyed by an oriented name.
- **(c) per-orbit type recording**: there is **none that is name-based**. The gate (`KUniformityChecker`)
  counts orbits **geometrically** — it searches reflections unconditionally (`reflect ∈ {false,true}`,
  `:145`), verifies each candidate as an exact global symmetry, and unions vertex reps under *any* verified
  symmetry incl. reflections (`:201-209`). A `{u, ū}` mixed orbit is unioned to **one** orbit by the actual
  mirror symmetry, with no VC-name comparison involved.
- **Upstream** is mirror-closed too: `SeedBuilder` seeds both `seedSet[0]` and `getMirrorVCName(seedSet[0])`
  (`:113`), tries both forms at each expansion step (`:193`, `:259`), and its closure check `isVCNameInSet`
  → `vcNamesMatch` (`:384-406`) tests reversed rotations. The one rotation-only producer in that path,
  `getEmergingVCNameAtVertex` → `getName` (`:380`), is consumed by the mirror-inclusive `vcNamesMatch` — so
  even there the *comparison* is mirror-merged. `VertexConfiguration.getName` (`:235-246`) and
  `VCGenerator.canonicalCyclicForm` are rotation-only and so emit `u` and `ū` as **distinct nodes** — that is
  harmless (and correct): the dedup/merge happens at the geometric gate + congruence dedup, not by name.

### 18.3 Evidence (4-agent audit workflow + independent re-read)

A parallel workflow ran a static code audit, a computational data check, and an adversarial attack, then a
reconciling verifier; I re-read the decisive sites myself.
- **Canonicalization demo:** replicated `canonicalVCName` — `[3,4,4,6]` and `[3,6,4,4]` both → `"3,4,4,6"`;
  `[3,3,4,12]`/`[3,3,12,4]` both → `"12,3,3,4"`; `[4,6,12]`/`[4,12,6]` both → `"12,4,6"`; distinct types stay
  distinct. `VertexConfiguration.getName` does **not** merge any chiral pair (proving the two conventions
  diverge exactly on chirality, and that the fill uses the mirror-merged one).
- **The merge is LOAD-BEARING, not vacuous:** chirality-mixed-orbit carriers in the oracle are real and
  numerous — **k=1: 1** (t1003 = 4.6.12), **k=2: 5** (t2001, t2005, t2006, t2007, t2013), **k=3: 22**. Each
  carrier's geometry contains both `u` and `ū`.
- **No carrier is dropped:** the probe emits **k=1 = 11** (`6f9ca9cf2d16c75f`) and **k=2 = 20**
  (`f3e2e0517191362c`), byte-identical to certified, with chiral-VC seeds actively producing tilings.
  Stretch check: dumping per-vertex oriented types in two emitted k=2 cells showed a single merged group
  holding **both** `{3.3.4.12, 3.3.12.4}` (resp. `{3.4.4.6, 3.6.4.4}`) — a genuine mixed orbit collapsed to
  one allowed name. Adversarial end-to-end trace of 4.6.12 (reflective p6m, chiral VC): emitted with
  orbits=1, 0 gate rejections; the gate found 114 symmetries and unioned all 12 reps to one orbit.
- **Adversarial:** 7 attacks (the three checks; a concrete reflective+chiral trace; the gate; upstream seed
  generation; `isChiralOnlySet`; the `isPrimitive` rotation-only `getName` seam; an over-acceptance/
  unsoundness probe) — **no counterexample**. `isPrimitive` (`:756`) uses rotation-only `getName` correctly:
  translations preserve orientation, so rotation-only is exact there and strictly conservative (can only keep
  a cell, never drop one).

### 18.4 ⚑ One reported "leak" was a misread — corrected

The static agent flagged `KUniformityChecker.ts:140` (`targets = patch.filter(p => p.getName() === p0Name …)`)
as a rotation-only chirality leak that could miss `u↔ū` reflections and inflate orbit counts. **False — it
conflated `Polygon.getName()` with `VertexConfiguration.getName()`.** At `:140` `p` is a *polygon*;
`RegularPolygon.getName()` returns `this.name = n.toString()` (`RegularPolygon.ts:9`, `:114-123`) — the n-gon
shape descriptor (e.g. `"12"`), with **zero chirality content**. A reflection maps a 12-gon to a 12-gon and
trivially passes this same-shape candidate filter; reflections are then searched and verified geometrically
(`:145`). There is no rotation-only VC seam anywhere in the gate. (Recorded here because the seam between
`Polygon.getName` and `VertexConfiguration.getName` is a real readability trap.)

### 18.5 Verdict + the residual non-chirality caveat

**HOLE NOT LIVE.** Checks (a)+(b) are mirror-merged, (c) is geometric/reflection-aware; the recommended fix
("mirror-close supp(M) in those comparisons") is **already the default** — applying it would be a no-op. The
**chirality gate is CLEARED for k≥3**, including the join-closure k=3=61 work. ⚑ **Caveat that this audit does
NOT clear:** chirality is necessary-but-not-sufficient. The k=3 certified *emitted* count is **59** while the
oracle has **61** — that 59→61 gap is the two oblique tilings (t3046, t3055), a **separate, non-chirality**
completeness item that join-closure (`join-closure-implementation-contract.md`, `cor:box`) must close on its
own. No `lib/` files changed.

## 19. Oblique join-closure — closing the k=3 catalogue 59 → 61 (2026-06-05, session 10)

The candidate-lattice enumeration had two symmetry-pinned sources — (A) `roundCells` (hex/square similar
sublattices) and (B) `gridAlignedCells` (rect/cmm, long axis solved from the area ladder). Both encode a
Bravais symmetry, so neither can produce an **oblique** lattice (no symmetry beyond ±1). The two k=3 tilings
**t3046** and **t3055** have oblique period lattices, so they were structurally unreachable: certified k=3 was
**59/61**. This session adds source **(C) oblique**, the proven `cor:box` completion (thesis `8c9b454`;
contracts in `../resources/research/{route-a-proven-box,join-closure-implementation-contract}.md`), entirely
in the candidate stage — the back half (torusFill → certify → primitivity → k-gate → congruence dedup) is
reused UNCHANGED, so soundness rides on it. Commits `d2df217` (source C) + `c5e40fc` (side-catch).

### 19.1 The method — pool-pairing + join-closure (not Gram-realisation)

`cor:box` says every realisable period is reachable by weight-bounded join-closure with no symmetry pin. Two
ways to realise it: (i) enumerate Gram triples `(|u|², |v|², u·v)` then *realise* them as ring elements, or
(ii) **pool-pairing** — iterate pairs of existing pool vectors and read their exact Gram. We took (ii): the
pool vectors are already realisable edge-direction-restricted vertex differences, so pairing reuses every
exact primitive with ZERO new ring-realisation code — and avoids the dense-ℤ[ζ₂₄] / mixed-√2√3 realisation
problem the design doc warns is incomplete (the 4.8.8/HNF obstruction, §12.3). `obliqueCells`
(`lib/classes/algorithm/LatticeEnumerator.ts`):

- **(C.1) seed pairs:** `u` over the SUB-pool `|u|² ≤ (2/√3)·A_adm`, `v` over the FULL pool. The bound is the
  reduced short side of an oblique cell: angle ∈ [60°,120°] ⇒ area ≥ (√3/2)|u||v| ≥ (√3/2)|u|². **`A_adm` is
  the load-bearing constant** = the largest admissible area realisable by ≤ 2k vertex classes (the P0 floor
  at `hol=2`, `vcAreaMinVerts ≤ 2k`). ⚑ The measured trap: bounding by the *raw* max VC area (~806 at k=3)
  gives 21.9M pairs/family (~17 min, floods the fill); bounding by `A_adm` gives ~15k candidates in ~1.5 s.
  Sizing the sub-pool by `A_adm` is what makes (C) tractable.
- **(C.2) join-closure (cor:box step 2):** `joinLattice(a,b,w)` = the finer lattice ⟨a,b,w⟩, via an exact
  2×2 rational solve (`w = α·a + β·b`, both ∈ ℚ via `Surd.isRational`) + an integer **HNF** on the three
  generators in (a,b)-coords, mapped back with `scaleRational`. Repeated to a fixpoint; each proper join
  divides covolume by an integer ≥ 2, so it terminates in ≤ log₂ rounds (implemented as a round-counter
  assert). ⚑ **Why the join is load-bearing, not decoration:** pairs-only misses any lattice with no
  two-pool-vector basis (a lattice generated only by ≥ 3 short vectors). "Both k=3 targets are pairs
  (measured)" is *answer-tuned* reasoning — sound for k=3 but it would silently block k≥4. A TDD test
  constructs such a ≥3-generator oblique lattice and shows the join finds it where pairs-only cannot.
- **(C.3) contribution rule:** push ONLY `holohedry==2` results. The higher-symmetry lattices traversed
  internally (needed to seed joins toward ≥3-generator oblique children) are NOT emitted — (A)/(B) stay the
  sole round/grid source, so (C) cannot perturb the round/grid catalogues. This is what keeps **k≤2
  byte-identical** (the oracle has 0 oblique at k≤2, so any oblique candidate gate-rejects there).

### 19.2 TA review — two binding amendments folded in (SYNC 2026-06-05)

The plan was reviewed GO after two amendments, both valid (they caught real flaws in the draft): (1) **add the
actual join** — pairs-only ≠ cor:box (the answer-tuned trap above); (2) **`v` over the FULL pool, `u` over the
sub-pool** — the (2/√3) bound binds only the short side, so sub×sub was tuned to the targets' both-short
bases. (3) one consolidated INCOMPLETE log. Rulings: R5 — the inclusive `V ≤ k·hol` P0 floor is the proven
bound (strict-`>` skip correct; t3055 survives at the boundary `minVerts=6 = k·hol=6` — a regression test
guards it); R3 — the `poolLmax` length cap is acceptable *under* the loud INCOMPLETE log; the full proven-box
run is a separate Phase-2, not this PR's burden.

### 19.3 INCOMPLETE-REGION logging (the doctrine, made consistent)

One `onTruncate` with three causes (subpool-clipped / v-range-truncated / join-waived), routed loudly to
stderr — the candidate-stage boundary is never silent. **Side-catch (`c5e40fc`, behaviour-preserving):**
source (B) used to drop a solved cmm/rect long axis exceeding the pool reach *silently*; it now logs the
reach truncation. ⚑ At k=3 this log fires with large counts (e.g. 33972 long axes > poolLmax on a 3⁶-family
seed) — but those drops are empirically all *spurious* solved lengths, not real cells: the certified k=3 = 59
(pre-oblique) recovered every non-oblique oracle cell, so nothing real was lost. The log surfaces a
pre-existing tuned-pool boundary, it does not introduce one.

### 19.4 Performance — the join broadphase (the regression and its fix)

First cut made the k=1 probe 15 s → **104 s**: the join-closure called the exact `joinLattice` (with its exact
`Surd` division) for every (working lattice, pool vector), overwhelmingly to discover the coords are
irrational. Fix (still byte-identical): (a) precompute the pool float coords once (no `toVector` per pair),
(b) a float **near-rational broadphase** — skip `w` unless its float (a,b)-coords are near a rational with
denominator ≤ `JOIN_DEN_MAX=60` before the exact confirm. This is a tuned cut inside the logged-incomplete
region; the targets are pairs (denominator-free), so unaffected. Result: k=1 back to **15.3 s**, k=2 ~150 s
(from 96 s baseline — the per-family oblique generation, cached once per family).

### 19.5 Verification

- **Byte-identical k≤2** (the hard gate): k=1 = 11 / `6f9ca9cf2d16c75f`, k=2 = 20 / `f3e2e0517191362c`,
  re-verified AFTER the §19.6 congruence fix, 0 timeouts. Build + full suite **160 tests** green (lattice-enumerator
  gains 11 oblique/join tests; `tiling-congruence.test.ts` adds the 4 rotation-congruence regression tests, TDD).
- **`joinLattice` exactness fuzzed** (~5000 random a,b,w): every rational join satisfies covolume =
  covol(a,b)·gcd(Dc,A,B)/Dc EXACTLY and contains a,b,w; every `w∈L` and every irrational-coord `w` returns
  null. 0 failures — the rational-solve + integer-HNF realisation is concretely verified.
- **De-risk (6 s-cap targeted run):** of 447 k=3 seeds, 69 admit a target oblique area with minVerts ≤ 6.
  **t3046 (3√3) emits + gates to k=3 = orbits 3** ✓ from 3⁶-family seeds. **t3055 ((6+3√3)/2)** did not appear
  *under the 6 s cap* — every t3046 hit was itself `TIMEOUT`-flagged, so the cap (not a generation miss) is the
  cause: t3055's candidate lattice is generated (unit-test-proven; both basis vectors in pool; survives P0 at
  the boundary), its producing 3⁶ seed just needs more fill time. Resolved by the no-cap sweep.
- **Certified k=3 (no-cap parallel scout):** the cap-free run completed all 447 seeds with **0 timeouts** in
  7236 s (446 raw certified cells, `.scout-cache/k3_3.4.6.12_cap0.ndjson`). Its first final reduce returned **66**
  — which exposed a pre-existing congruence-dedup bug (§19.6), NOT a generation error: the raw certified cells are
  correct and complete. With the §19.6 fix, the (deterministic) final reduce over those exact cells gives **61** /
  digest `eb34499d5fba3457` — t3046 (area 3√3 ≈ 5.196) + t3055 ((6+3√3)/2 ≈ 5.598), the only two `holohedry==2`
  reps. **k=3 = 61/61, the catalogue is closed.** (The certification — every seed solved, 0 timeouts — is a
  property of raw-cell production, untouched by the fix, which lives only in the post-hoc reduce.)

### 19.6 The no-cap scout exposed a pre-existing congruence-dedup false-negative (66 → 61)

The certified scout's first reduce gave **66**, not 61 — five un-merged duplicates, all in the oblique class
(t3046 appeared as 3 cells, t3055 as 4; the oracle has 1 each). These are different fundamental-domain
extractions of the *same* tiling that failed to merge. The cause is **NOT in the oblique diff** — it is a
pre-existing bug in `tilingsCongruent` (`TilingCongruence.ts`), latent for the whole project and first triggered
by low-symmetry oblique cells.

- **The bug.** `tilingsCongruent` pins the candidate isometry with `mapPoint` (`z ↦ (conj?)·ζ^r + T`) but mapped
  the whole cell with `transformedRigid(ZERO, reflect, r, 0, T)` — passing the rotation power `r` as the
  **reflection axis** `axisK`, with `rotK = 0`. Per `transformedRigid`'s composition (`rk = rotK`,
  `ak = axisK + rotK`): the `reflect=true` branch uses `ak = r` (correct), but the **`reflect=false` branch uses
  `rk = 0`** ⇒ it computes `z + T`, a **pure translation — the rotation is silently dropped**.
- **Why it hid until now.** A congruence whose only witness is a non-trivial rotation (`reflect=false`, `r≠0`)
  was missed; reflection witnesses (`reflect=true`) map correctly. Every k≤2 merge `tilingsCongruent` was built
  for is a **reflection** (the chiral snub, §12.7), where the buggy call is accidentally right — so all tests and
  both byte-identical digests passed despite the latent fault. The oblique k=3 cells are the **first** case where
  two extractions of one tiling relate ONLY by a rotation (ζ⁴/ζ¹⁶) and by no reflection: extraction A≅B via
  reflections (found), A≅C via a ζ⁴ rotation (missed) — so the relation came out **intransitive**, the tell-tale
  of a false negative.
- **Diagnosis discipline (systematic-debugging).** An exhaustive *single-P0* brute force still found A≇C → the
  reference-polygon choice was not the gap. A fully **exact, self-consistent** re-implementation (one map function
  for BOTH the flag-pin and the cell-set, `surdFloor` reduction throughout — no `transformedRigid`, no
  float-window `reducedClassKey`) gave a clean transitive equivalence: the 7 oblique cells partition into exactly
  **2 complete-graph components** {t3055×4, t3046×3}. The controlled swap that isolated the bug: replacing only
  the cell-set map (`transformedRigid` → the same pointwise map as the flag-pin) flipped A~C from F to T —
  pinpointing `transformedRigid`'s argument order, not the lattice reduction.
- **The fix (`TilingCongruence.ts:160`).** Pass `r` as `rotK`, `0` as `axisK` —
  `transformedRigid(ZERO, reflect, 0, r, T, 'full')` gives `rk = ak = r`, matching `mapPoint` for *both* branches.
  One-argument fix. TDD (`tests/tiling-congruence.test.ts`): a synthetic oblique cell vs its ζ⁴/ζ⁸/ζ¹⁶ rotation,
  built independently of `transformedRigid` — RED before, GREEN after; plus a soundness guard (non-congruent cells
  stay rejected) and a symmetry check.
- **⚑ Thesis impact (flagged to TA).** The module header's **completeness** claim ("the candidate loop tries every
  `(Q, reflect, r)`, so if a congruence exists it is found") was *violated*: the loop tried every `(Q, reflect, r)`
  at the flag-pin but applied the wrong isometry at the cell-set step for `reflect=false`. **Soundness was never at
  risk** — a passing merge is still an explicitly-verified grid isometry, so the dedup only ever **under**-merged
  (over-counted), never over-merged. The fix restores the proven completeness; the thesis's "complete dedup" claim
  is now matched by the implementation. Any prior certified count produced by this dedup is safe IF it hit the
  acceptance target (an under-merge would have shown as a count *above* target — which is exactly how this surfaced
  at k=3, and exactly why k=1=11/k=2=20 hitting target proves no rotation-only merge was missed there).

## 20. Orbifold Phase A, step 1 — branch enumeration + the branch-count measurement; the re-anchoring lemma is required before the fill (2026-06-05, session 11)

The orbifold-fill milestone (NOTES §15.6 escalation, contract `orbifold-implementation-contract.md`)
branches each candidate lattice Λ over candidate wallpaper groups G = ⟨Λ, S⟩ and fills ℝ²/G with a
budget of exactly k vertex-orbits per branch. Per the user's scoping, **this session builds only the
branch-enumeration machinery + a measurement** and **defers the equivariant fill**, because the
contract (§5 Phase B) gates the fill on a measured branch count: "Measure branch counts per Bravais
class and report — those numbers decide whether the re-anchoring lemma is needed before k=3." All work
is in a separate git worktree (branch `feat/orbifold-branch-enum`, off `5bdb4ad`) per the (then-live)
sweep guard; UNCOMMITTED.

### 20.1 What was built
- `lib/classes/algorithm/OrbifoldBranches.ts` (NEW, pure, standalone — no `PeriodSolver` internals):
  `latticePointGroup`, `branchTranslationPool` (quotient-BFS), `reduceVecModLattice` (canonical class
  rep), `enumerateGeneratorMultisets`, `enumerateBranches`. Implements contract §1 with TA's three
  rev.2 amendments (SYNC 2026-06-05) and the licensed cuts.
- `tests/orbifold-branches.test.ts` — 25 TDD tests (point-group orders incl. the off-grid `u=2+i`
  C₄<D₄ lock; BFS↔brute-force cross-check; A2 generator shapes; the no-coboundary-merge pm/pg
  distinctness; glide + arithmetic filters; determinism).
- `PeriodSolver.candidateLatticesFor` — a thin additive public accessor (behaviour-preserving; the
  measurement needs the exact pipeline lattices).
- `scripts/measure-orbifold-branches.ts` — the per-Bravais-class measurement.

### 20.2 The amendments + licensed cuts (as implemented)
- **A1 quotient-BFS pool.** The translation pool W(depth) is BFS'd in the quotient (state = canonical
  class mod Λ), never generate-then-reduce — the edge-direction subgroup is ζ₁₂/ζ₂₄-generated (rank 4 /
  8), so a raw step-≈35 pool is ~10⁸ vectors; the quotient ball is ~depth².
- **A2 generators = ∅ + singletons + rotation×reflection pairs only**, no identity-L (a crystallographic
  group is cyclic ⟨rotation⟩ or dihedral ⟨rotation, reflection⟩).
- **A3 grid-survivors ≤ holohedry.** The grid-realized point group can be strictly smaller than the
  Bravais holohedry (off-grid axes — square Λ on `u=2+i` is D₄ but only C₄ is grid-realized); pool
  depth uses `k·|grid survivors|−1` (the proven `lem:symrep` sharpening), not `k·hol−1`.
- Licensed cuts: edge-direction subgroup on the pool, glide pre-filter `(1+L)w∈Λ`, arithmetic branch
  filter (skip when min feasible V > k·|P|), group-key dedup + canonical order.
- NOT licensed (deliberately absent): coboundary/origin normalization `w ↦ w+(1−L)τ` — a unit test
  asserts pm and pg stay distinct branches.

### 20.3 ★ The structural finding — branch count is O(P²) per lattice
The decisive discovery: **every rotation coset is viable**. For a rotation `L` of order p (a primitive
p-th root), `1 + L + … + L^{p−1} = 0`, so `(L, w)^p = (id, (1+L+…+L^{p−1})w) = id` for ANY translation
class `[w]` — a p-fold rotation about *any* center closes to a finite cyclic group. Hence the rotation
cosets number ≈ P (the pool size), the dihedral generator-pairs ≈ P², and — because coboundary/origin
normalization is NOT licensed (it breaks anchoring; the proof-pass ruling) — **each placement `[w]` is
a DISTINCT branch** (e.g. the oblique p2 groups ⟨Λ, (−1,[w])⟩ are pairwise distinct subgroups, one per
class). So the branch count is not the design-note's optimistic "order tens"; it is **P (cyclic/oblique)
to P² (dihedral)** per lattice, where P is a ball in the **rank-(φ(N)−2) quotient** (rank-2 for the
12-direction ring {3,4,6,12}, rank-6 for the 24-direction octagon ring {3,4,6,8,12}). This is the
per-placement explosion the design note §7.2 / `rem:branchpool` flagged after ruling out coboundary
normalization — now measured.

### 20.4 The branch-count table (licensed cuts active; `poolClassCap`, `enumCap` bound the work)
Distinct candidate lattices are deduped by latticeKey across all VC-signatures, then each is
branch-enumerated once. "fully-enum" = exact distinct branch count; "enum-capped" = generator-multisets
> 4000 (closure skipped, magnitude reported); "pool-capped" = pool > cap (even the pool is intractable).

| run | Bravais | #latt | pool min/med/max | EXACT branches/latt (fully-enum) | full / enumCap / poolCap |
|---|---|---|---|---|---|
| **k=2 {3,4,6,12}** (rank-2) | oblique | 1104 | 55/113/225 | 56/**114**/226 (Σ 133 992) | 1104/0/0 |
| | rect/cmm | 348 | 169/561/1163 | 273 (only 6 full) | 6/342/0 |
| | square | 78 | 505/1137/6350 | 1011/**1893**/2515 (Σ 99 822) | 54/24/0 |
| | hex | 55 | 1453/4009/8000 | — (all capped; genMs max **13.7 M**) | 0/37/18 |
| **k=2 {3,4,6,8,12}** (octagon, rank-6) | oblique | 1104 | 1099/**1578**/2061 | 1100/1579/2062 (Σ 1 769 832) | 1104/0/0 |
| | rect/cmm | 348 | →8000 | — | 0/0/348 |
| | square | 78 | →8000 | — | 0/0/78 |
| | hex | 55 | →8000 | — | 0/0/55 |
| **k=3 {3,4,6,12}** (rank-2, cap 2000) | oblique | 7362 | 169/477/1106 | 170/**478**/1107 (Σ 3 703 218) | 7362/0/0 |
| | rect/cmm | 1307 | 529/→2000 | — (genMs med 137 683, max 265 220) | 0/640/667 |
| | square | 225 | 1233/→2000 | 2467 (6 full) | 6/6/213 |
| | hex | 482 | →2000 | — (all capped) | 0/0/482 |

Reading: at k=2 even the **rank-2** ring forces ~114 (oblique) to ~1893 (square) DISTINCT branches per
lattice, with hex/rect already intractable; the **rank-6** octagon ring forces ~1579 oblique branches
and caps rect/square/hex outright. At **k=3** (the certified-catalogue ring) the oblique class — 7362
of the 9376 candidate lattices, the t3046/t3055 regime — averages **478** distinct p2 branches each
(Σ 3.7 M), and rect/square/hex are almost entirely capped. All are 10²–10³⁺× the **single** bare-torus
fill the pipeline does per lattice today — the per-placement explosion, scaling with depth (hence k).

### 20.5 Verdict — Phase B infeasible without the re-anchoring lemma
The orbifold fill's intended trade is "branch count replaces fill depth." But without fixing the
placement, the branch count IS the (huge) pool — so the orbifold fill would do P–P² fills per lattice
where the current method does one, making it **net-negative**. Critically, this is the **distinct**
branch count (the real fill cost: each p2 placement is a genuinely different space group on Λ that must
be filled), **not** mere enumeration overhead — a faster enumerator does not help; only **fixing the
anchor** (the re-anchored-seeding companion lemma, contract §3 / design-note §7.2) collapses the P
placements per group-type to O(1). **Hand-off to TA: the re-anchoring lemma is REQUIRED before any
equivariant-fill code.** The module stays unmerged and flag-absent pending it.

### 20.6 Verification
- **k≤2 byte-identical** (the additive accessor + new module touch no decisive path): probe k=1 =
  11 / `6f9ca9cf2d16c75f`, k=2 = 20 / `f3e2e0517191362c`.
- `pnpm build` green; full suite **166 tests** green (25 new + 141 existing unaffected); `tsc` clean.

### 20.7 The perf journey (failed/learned, for the record)
- **Per-(vcSig × lattice) enumeration was O(redundant).** Branch enumeration depends only on (Λ, k),
  not the seed — fixed by deduping lattices by latticeKey and enumerating each once.
- **`reduceVecModLattice` crawled on anisotropic cells** (the canonical-class scan ranged up to ±60 on
  non-reduced bases). Fixed by gauss-reducing the basis first (cached) — on a Lagrange-reduced basis a
  fixed ±2 scan covers the Voronoi cell; the min-norm rep is basis-independent so counts are unchanged.
- **The "viable singletons → pair them" optimization** (only pair generators whose singletons close)
  is what exposed §20.3: ALL rotation singletons are viable, so the pairing is O(P²), not the hoped-for
  small set. That cost is the finding, not a bug — capped via `enumCap` (report magnitude, skip closure).

## 21. Orbifold normalized mode — Increment 1: the re-anchoring lemma, implemented and measured; the branch explosion collapses (2026-06-05, session 12)

The re-anchoring lemma (TA, thesis `7a0586e`, `correctness.tex` §"Re-anchored seeding"; CC recipe
`../resources/research/reanchoring-lemma-2026-06-05.md`) made coboundary normalization **licensed**
when paired with re-anchored seeding from the full sets 𝒳(Λ,G,k) — superseding the contract's §3
"NOT licensed" ruling that §20 ran into. This increment **implements the normalized branch family +
re-anchor sets and measures the collapse** (the fill itself — Increment 2 — is deferred; same
build+measure-then-fill discipline as Phase A). Worktree `feat/orbifold-branch-enum` (rebased onto
master `f41179e`); commits `6dc5396` (Phase-A checkpoint), `299d6f8` (Increment 1).

### 21.1 What was built (all TDD, 40 new tests)
- **`exact/IntLinalg.ts`** — the load-bearing primitive that did not exist (only a rank-2 `hnf2`): a
  general bigint **HNF** (`hnf`, with the unimodular transform U), `reduceModColumnLattice` (the
  HNF-least class key), `solveModLattice` (the re-anchor solve `(1−Lᵢ)t ≡ w′ᵢ−dᵢ mod Λ`),
  `columnLatticeIndex`, and compiled (HNF-once) reducer/solver. **Rank-deficient handling (A2):**
  reflection systems `[B_Λ|M_{1−σ}]` have rank φ/2+2 < φ at N=24 — free coordinates pass through the
  HNF zero-pivot rows, and `columnLatticeIndex` returns a **null sentinel** (never a wrong pivot
  product).
- **`OrbifoldNormalized.ts`** — `coboundaryMatrix(L)=M_{1−L}` and `latticeBasisMatrix(u,v)=B_Λ` (den==1
  asserts); **`enumerateSubgroupTypes` (A1 — per SUBGROUP, not per lattice):** p1 + one type per cyclic
  rotation subgroup + each reflection + each dihedral subgroup, distinguished at minimal exponents, NO
  group closure (dihedral reflection exponents = `a−jb mod N`); `cyclicBranchKey` (HNF-least residue),
  `dihedralCommutatorPrefilter` + coupled `dihedralBranchKey` (Λ-block **per slot**), `reAnchorPoint`,
  and `enumerateNormalizedBranches` (full assembly: linear dihedral pairing via the commutator bucket;
  the conservation tripwires).
- **`scripts/measure-normalized-branches.ts`** — the A/B harness (optional `--baseline` re-runs Phase A
  on the same lattices).

### 21.2 ★ The measurement — the branch explosion collapses to the quotient orders (A/B vs §20.4)
Per distinct candidate lattice: §20.4's non-normalized branch count vs the normalized branch count,
the cyclic-rotation class count (the collapse target), and Σ|𝒳| (the conserved seeded-fill count).

| run | Bravais | #latt | §20.4 non-norm | **NORM branches**/latt med | cyclicRot classes med/max | Σ\|𝒳\| med | conservation |
|---|---|---|---|---|---|---|---|
| **k=2 {3,4,6,12}** (rank-2) | oblique | 1104 | 114 | **5** | 4/8 | 114 | 1104/1104 OK |
| | rect/cmm | 348 | 273 (342 enumCap) | **13** | 4/16 | 973 | 348 OK |
| | square | 78 | 1893 | **7** | 4/16 | 2275 | 78 OK |
| | hex | 55 | all capped | **9** | 4/16 | 12028 | 55 OK (18 poolCap) |
| **k=2 {3,4,6,8,12}** (octagon, rank-6) | oblique | 1104 | 1579 | **65** | 64/110 | 1579 | 1104 OK |
| | rect/cmm | 348 | all poolCap | **85** | 64/256 | 9482 | 348 OK (348 poolCap) |
| | square | 78 | all poolCap | **73** | 64/256 | 16001 | 78 OK (78 poolCap) |
| | hex | 55 | all poolCap | **93** | 64/256 | 24001 | 55 OK (55 poolCap) |
| **k=3 {3,4,6,12}** (rank-2, cap 2000) | oblique | 7362 | **478** | **5** | **4/16** | **478** | 7362/7362 OK |
| | rect/cmm | 1307 | all capped | **13** | 4/16 | 3087 | 1307 OK (667 poolCap) |
| | square | 225 | mostly capped | **7** | 4/16 | 4001 | 225 OK (213 poolCap) |
| | hex | 482 | all capped | **9** | 4/16 | 6001 | 482 OK (482 poolCap) |

**Reading.** The cyclic-rotation branch count collapses to the **coboundary quotient order ÷ image of
Λ** exactly as the lemma predicts: **4** at N=12 (= 16 pre-Λ ÷ 4) and **64** at N=24 octagon (= 256 ÷
4), with the per-lattice max reaching the full pre-Λ index (16 / 256) where Λ's image is trivial. The
headline §20.4 case — **oblique p2 @ k=3, 478 branches/lattice over 7362 lattices** — collapses to
**~4 classes (5 total branches incl. p1, max 16)**. The previously **uncomputable** hex/rect/square
branches (all `enumCap`/`poolCap` in §20.4) now enumerate to single/double digits. **Conservation:
0 violations across all 12 528 lattices measured** (1585+1585+9376) — the Σ|𝒳| = pool (rotation) /
glide-passing-pool (reflection) bijection holds everywhere it is checked.

### 21.3 The honest accounting (read before celebrating the fill)
Σ|𝒳| **equals** the §20.4 branch count (oblique k=3: Σ|𝒳| med 478 = the old 478). This is the lemma's
own "failure-criterion provision", confirmed empirically: **cyclic-type seeded-fill counts are
conserved** — d ↦ t(d) is a bijection, so the placements relocate from group-enumeration into seed
positions; the orbifold fill still does ~478 *fills* per oblique lattice at k=3, organized as ~4
branches × ~120 positions. The runtime win (Increment 2) is therefore **per-fill** (budget exactly k
orbits-under-G, ÷|G| depth, the 92%-gateRej deep class dies) **plus the bookkeeping/closure collapse**
(closures run once per class, not once per placement — the 13.7M-genMs hex wall of §20.4 is gone) and
the dihedral linearisation — **NOT** fewer fills on cyclic types.

### 21.4 The residual frontier (honest)
The lemma collapses branch **formation**; it does **not** touch the translation-class **pool** (the
rank-(φ(N)−2) ball at depth k·n_Λ−1). That pool is still `poolCap`-truncated on the high-symmetry
lattices (k=3: 667 rect + 213 square + 482 hex = 1362/9376; k=2 octagon: all rect/square/hex). This is
the pre-existing candidate-box / pool-depth frontier (§20.4 capped the same lattices), unchanged here.
For the **certified target family {3,4,6,12}** the oblique class (7362/9376 at k=3, the t3046/t3055
regime) is **fully uncapped** and fully collapsed — the clean win. Conservation on a pool-capped
lattice is relative to the enumerated pool (both sides truncate consistently), so it stays a valid
bijection check.

### 21.5 Verification
- **k≤2 byte-identical** (no decisive path touched): probe k=1 = 11 / `6f9ca9cf2d16c75f`, k=2 = 20 /
  `f3e2e0517191362c`.
- PRE-Λ collapse tables {16,9,4,1} (N=12) / {256,81,16,1,4} (N=24) and TA's SNF-verified per-Λ oracles
  (N=12 Λ=⟨2+ζ,1+3ζ²⟩ p2 → **4**; hex Λ=⟨1,ζ²⟩ p6 → **1**) green; dihedral commutator cross-checked
  against an independent brute-force closure oracle; off-grid square u=2+i → C₄+C₂ only (survivors <
  holohedry) green; reAnchorPoint round-trip exact.
- `pnpm build` clean; full suite **210 tests** green (40 new); `tsc` clean.

### 21.6 Status / hand-off
Increment 1 done. The normalized enumeration is correct (collapse numbers match the proof, conservation
holds everywhere). **Increment 2 (the equivariant fill) is unblocked** behind a flag — `equivariantFill`
cloned from `torusFill`, gated at `solve()`, budget exactly k orbits-under-G, mirror-closed re-anchored
seeding at x∈𝒳, the gate-confirm assert, and the chirality R7 audit when it lands; acceptance =
flag-off digests byte-identical, orbifold mode k=1=11 / k=2=20 per-tiling, Phase C reproduce-or-beat
k=3 = 61 / `eb34499d5fba3457`.

## 22. k=4 torus scout (C2) — the measured wall: structurally reachable, computationally intractable (2026-06-07, session 13)

**The question (C2, method-exploration roadmap `method-exploration-roadmap-2026-06-06.md`).** Does the
lattice/torus programme reach **k=4** ({3,4,6,8,12}, target **151**)? The TA framed this as the *vertical
probe*: a certified 151 needs 0 timeouts / 0 INCOMPLETE / digest stable twice, **but a measured wall is an
equally valid deliverable** — the experiment that says whether the lattice method reaches k=4 at all.
Approach: calibrate the scout's component costs (seed-build, candidate enumeration, fill) before
committing to a multi-day no-cap run; "no new core code" — `PeriodSolver`/`scout-*` untouched, only
throwaway measurement scripts (`scripts/scale-k4.ts`, `scripts/profile-k4-sample.ts`; cf. the existing
`profile-k3-seed.ts`).

### 22.1 Structural coverage — the proven box REACHES k=4 (so the wall is NOT a coverage gap)
`scripts/oracle-characterize.ts 4` against the Soto-Sánchez/Galebach JSON:
- **151 tilings** = hex 43 + cmm/rect 45 + rect 45 + rhombic(cmm) 5 + square 8 + **OBLIQUE 5**
  (t4099, t4112, t4116, t4143, t4151 — recovered via the cor:box join-closure, as the 2 oblique at k=3).
- **Param coverage at k=4** (`poolLmax=√88≈9.38`, `areaBoundF=24·k·a_max`): **longest oracle cell vector
  8.660 ≤ 9.38 ✓**, max cell area 58.177 ≤ bound ✓, **0 small cells** (no fan-heuristic risk). So the
  Route-A proven box is large enough for every k=4 period — a certified 151 is **not structurally
  precluded**. The wall is purely combinatorial tractability (seed-count × per-fill-cost), not a missing
  region. Pool k-scaling verified live in `PeriodSolver.ts:342-361`; ring force-set to N=24
  (`scout-parallel.ts:39`, octagon → 24-dir handled, not dropped).

### 22.2 Seed-stage explosion (~30–60× the k=3 seed count + a multi-hour per-worker build tax)
- VCs = **18** ({3,4,6,12} gives 17; the octagon adds **only 4.8.8**, and **0 new compatibility edges** —
  the octagon VC is nearly *isolated* in the compat graph, so multi-VC seeds are dominated by the
  triangle/hexagon families).
- `findSeedSets(4)` = **2072 seed-sets in 0.1 s** — seed-*set* enumeration is **not** the wall (identical
  count for {3,4,6,12} and {3,4,6,8,12}).
- `buildSeeds(4)` — the geometric expansion — IS heavy: **~6.1 useSeeds/set** (strided sample) to
  **~13.2/set** (3⁶-dense head) ⇒ **~13,000–27,000 useSeeds** total (vs **447 at k=3**). Exact total not
  obtained: a full `buildSeeds` run **exceeded 43 min single-threaded (RSS 1.7 GB) without completing**;
  per-set build time ranges 1.9 s (strided) to 9.0 s (dense head) ⇒ **~1–5 h to build the seed list**.
  ⚑ In the real scout **every worker rebuilds the seed list independently at startup** (`scout-worker.ts:33-44`)
  — so this is a ~1–5 h *parallel* startup tax paid *before the first fill*.

### 22.3 Fill-stage wall (the binding cost: 100% timeout, fill-DFS dominates)
Strided representative sample (every ~51st of 2072 sets, 25 fills, `PS_PROFILE=1`):
- **25 / 25 fills timed out (100%)** — at both a 15 s and a 30 s per-seed cap; **0 cells found** within 30 s.
- The representative population is **entirely triangle/hexagon-dense** (14× 3⁶, 11× 3⁴.6) — the §11/§15
  dense-pool family, now confirmed to *be* the seed population, not a head-bias artifact.
- `PS_PROFILE`: **`cand≈0 ms, fill≈27000 ms (the entire budget), gate≈0`** — candidate enumeration is
  instant; the **torus-fill DFS is the wall**; fills never reach the gate.
- Per-seed candidate lattices observed **126 → 11,769** (median ~3300); **oblique join-closure candidates
  up to ~58,000** per seed with the **v-range-truncated INCOMPLETE** firing. P0 pre-filter skips ~58k
  lattices per dense seed — working as designed, but the surviving few thousand still don't fill in 30 s.
- INCOMPLETE-REGION logs fire loudly (never silent): (a) **grid long-side reach** (≈1980 candidates >
  poolLmax — *benign* per the oracle, whose real max period 8.66 < 9.38, but logged); (b) **oblique
  v-range-truncated**. Either alone disqualifies a *certified* count under the doctrine.

### 22.4 Extrapolation, verdict, and why the full scout was NOT run to completion
Full no-cap certified run ≈ (13k–27k seeds) × (per-fill cost) ÷ 8 workers, on top of the ~1–5 h build tax.
Per-fill cost is **> 30 s and exponential** (the k=3 hard 3⁶ seed alone took **6.2 min uncapped**, NOTES
§17; k=4 cells are larger ⇒ worse). Even at an absurdly optimistic flat 60 s/seed: 13,000×60/8 ≈ **27 h**;
realistically (hard fills minutes–hours each) ⇒ **weeks-to-months on 8 laptop cores**. The full
`scout-parallel 4 3,4,6,8,12 0` was therefore **deliberately not launched**: each worker would spend ~1–5 h
in `buildSeeds` *before the first fill*, then grind ~13k–27k timeout-bound seeds — a week+ of laptop time
for a partial lower bound already bounded by the component measurements. Measuring the components is the
honest, cheap equivalent of running the wall.

**Verdict (C2): k=4 {3,4,6,8,12} via the torus path is INTRACTABLE on commodity hardware — a measured
wall, not a certified 151.** The lattice/torus programme does **not** reach k=4. The cause is the
seed-count × per-fill-cost product (the §11/§15 dense-pool wall, amplified ~30–60× in seeds and with
larger cells), **not** a proven-box coverage gap — the box reaches every k=4 period. This vindicates the
thesis's three-method framing: **certified ceiling at k≤3 via the torus path**; k≥4 needs Delaney–Dress
(Route B, δ ≤ 12k) or the **orbifold pool-bypass lemma** (gated on TA's soundness verdict, the standing
C4). A k=4 *certified* number from the lattice programme is not on the table without one of those.

### 22.5 Reproduction
- `pnpm tsx scripts/oracle-characterize.ts 4` — the 151 target + param-coverage check.
- `pnpm tsx scripts/scale-k4.ts 0 0 3,4,6,8,12` — seed-stage counts/timing (per-stage stderr; `buildSeeds`
  is the long pole — expect >40 min, multi-GB).
- `PS_PROFILE=1 pnpm tsx scripts/profile-k4-sample.ts 30000 40 40 3,4,6,8,12` — strided fill profile
  (100% timeout, fill-DFS dominant). For the dense-head bias check: `... 15000 40 3,4,6,8,12` on the
  pre-strided variant reproduced the same 100%-timeout conclusion.

## 23. C7 star spike — Myers 4(j) `8.4*.8.4*` end-to-end; the convex layer made star-aware, and 4(j) certified k=1 exact (2026-06-08, session 14)

**Branch `feat/c7-star-spike` (off master `4381401`), NOT merged.** The horizontal star lane (C7),
parallel to and independent of the orbifold-vs-Delaney–Dress decision (k≤3 stays certified via torus).
Per the TA work order + two contracts (`resources/research/star-vc-implementation-contract-2026-06-08.md`,
`star-spike-4j-contract-2026-06-08.md`): a **diagnostic spike**, not a feature — make the
vertex/angle/VC/area layer star-aware (Part A) + a minimal star tile + exact non-convex overlap (minimal
B), drive **one** pinned tiling — Myers 4(j) `8.4*_{π/4}.8.4*_{π/4}` (octagon + a 4-pointed star, point
45°/dent 225°) — through the live solve, and deliver the **break list** of every convex assumption a star
reaches. Primary deliverable = the break list; 4(j) emergence secondary.

**Hard invariant held at every stage:** regular k=1=11 `6f9ca9cf2d16c75f`, k=2=20 `f3e2e0517191362c`
**byte-identical** (`scripts/probe-pipeline.ts`), full build green, all 195 vitest pass.

### 23.1 Part A — the layer fix (digest-safe; every star branch dormant on the regular path)
- **A1 — corner-aware angle.** New `Polygon.cornerAngleUnits(i)` reads the interior angle EXACTLY from
  `edgeDirs` (reflex-aware: `ext=(edgeDirs[i]−edgeDirs[i−1]) mod N`, `interior=(N/2−ext) mod N`). Equals
  the old `angleUnits(n)=12(n−2)/n` for every regular corner; gives 3/15 for a star point/dent. Replaced
  the convex `angleUnits(n)` at `KUniformityChecker`, `SeedExpander`, and the inline copy in
  `PeriodSolver.coveredIntervals`.
- **A2 — ≥3-tile vertex predicate + legal 2-tile dent-fill.** Classify a 2π point by distinct incident
  tile count `t` (by `exactKey`, not corners): `t≥3` = real vertex (allowed-VC check, orbit rep); `t=2` =
  forced dent-fill (Myers non-vertex) — **accepted, NOT a vertex, NOT a contradiction**. Threaded through
  `KUniformityChecker` (orbit reps), `PeriodSolver.analyze` + `isCompleteTiling`, `SeedExpander.has­Disallowed­SurroundedVertex`.
  Inert on the regular path (no two `{3,4,6,8,12}` interior angles sum to 2π ⇒ every regular surrounded
  vertex has `t≥3`).
- **A3 — star-aware VC tokens.** `Polygon.cornerToken(i)`: bare `n` for regular corners (byte-identical),
  `4*p@3`/`4*d@15` for star point/dent. `canonicalVCName` now takes `string[]`; the allowed-set builder
  and every tested namer (`vcNameAt`/`vcRingNames`/`computeVCNameAtVertex`) share the one token function.
- **A4 — exact star area.** New `polygonAreaSurd(verts)` (exact shoelace `½·|Σ detSurd(vᵢ,vᵢ₊₁)|`, abs ⇒
  winding-independent) + `tileAreaFloatFor(p)` (star → shoelace, else `regularArea`). Routed the
  polygon-iterating float-area sites — the **certificate** (`isCompleteTiling`), `aMax`, core/initial/
  footprint areas. The **`n`-keyed candidate-lattice ladder** (`vcAreaSet`/`vcAreaMinVerts`) was left as a
  **documented break** (see 23.3) — fixing it is the Increment-2 ladder refactor.

### 23.2 Part B — the star tile, the exact overlap, and the harnesses
- **B1 — `lib/classes/polygons/ExactStarPolygon.ts`.** The exact `4*_{π/4}` in ℤ[ζ₂₄] by a unit-edge
  boundary walk (turns cycle −3/+9), `isStar=true` (disambiguates from the square — both `n=4`). Unit-test
  (`tests/exact-star-polygon.test.ts`): 8 vertices in-ring, `cornerAngleUnits=[3,15,…]`, closes exactly,
  area > 0, tokens disjoint from `"4"`.
- **B2 — `lib/classes/algorithm/exact/exactOverlap.ts`.** Certificate-grade exact proper-overlap, SIGN-ONLY
  (no intersection coordinates): `orient2D`/`segmentsProperlyCross`/`collinearSameSideOverlap`/non-convex
  `pointInPolygon` (winding by `imSign`+`orient2D`). Overlap iff proper edge cross ∨ vertex/midpoint
  strictly interior ∨ collinear same-side (parallel) sub-segment overlap. Wired into `Polygon.intersects`,
  **star-gated** (`isStar` operand → exact; convex×convex → the float path, so digest-identical).
  TDD-first (`tests/exact-overlap.test.ts`, 12 cases) incl. the decisive **octagon-seated-in-star-dent →
  NOT overlap**, overlapping stars → true, and **agreement with float `intersects` on convex pairs**.
- **Harness 1 `scripts/spike-star-4j.ts`** — REAL solve of the hand-seeded `8.4*.8.4*` VC.
- **Harness 2 `scripts/spike-star-4j-cell.ts`** — independent EXACT verification of the emitted cell. Per
  the TA's B3b hardening (SYNC 2026-06-08): the cell is an *unvalidated input*, so it must pass its OWN
  correctness gate built only from the independently unit-tested primitives — **G1** no proper overlap
  (exact B2) · **G2** every interior vertex at 2π and well-typed (t≥3 real or t=2 dent) · **G3** exact area
  = |det Λ| · **G4** edge-to-edge (every directed edge reverse-matched) — NOT from `isCompleteTiling` /
  `KUniformityChecker`. Only after the gate passes is the orbit count trusted (else a validator bug and a
  bad cell are indistinguishable).
- **Env-gated `spikeBreak`** (`exact/spikeTrace.ts`, fires only on `SPIKE_TRACE=1`) at the two silent core
  sites (the `n`-keyed ladder; the regular-only fill loop) — inert otherwise.

### 23.3 Result — 4(j) emerged through the REAL solve, k=1, verified EXACT (better than predicted)
The plan/review predicted Harness 1 would block at the regular-only corner-completion fill loop (finding
1), so the break list would miss the post-fill validators. **It did not block:** the 4-tile seed mod the
right Λ closes with **no corner-completion** — Harness 1 emitted **1 certified k=1 cell**, reaching the
certificate and the orbit gate. Harness 2 then confirmed it independently with exact arithmetic:
- exact `4*_{π/4}` area = **2** (rational; *not* the square's 1);
- fundamental cell = **{1 octagon + 1 star}**, Σ shoelace = **4+2√2 = |det Λ| as an exact Surd equality**;
- **k = 1** (`KUniformityChecker`, 64 symmetries → 1 orbit);
- **16 two-tile-at-2π dent-fills + 9 ≥3-tile real vertices** in one cell — the octagon-in-dent points are
  present and correctly NOT counted (the A2 fix, verified end-to-end).

**All of A1–A4 + B1 + B2 were necessary** for 4(j) to certify: without A4's exact star area the certificate
rejects (octArea+1 = 5.828 ≠ 6.828); without B2 the dent-seat reads as overlap; without A2 the 16 dent
points fail the allowed-VC check; without A1/A3 the angles/tokens are wrong. The spike thus both produced
the break list AND drove a real non-convex star tiling end-to-end.

### 23.4 The break list (the deliverable — pre-fill ∪ post-fill)
**FIXED this session (and validated by 4(j)):** A1 corner angle; A2 dent-fill classify; A3 VC tokens; A4
exact area in the certificate/`aMax`/core-area; B2 exact non-convex overlap; the exact star area + tile.

**LATENT breaks — confirmed by inspection/run, deferred to Increment 2 (NOT needed for 4(j)):**
1. **⚑ `n`-keyed candidate-lattice ladder** (`LatticeEnumerator.vcAreaSet`/`vcAreaMinVerts` via
   `PeriodSolver.candidateLattices`) — `tileAreaSurd(n)` + the Euler relation `V=Σtₙ(n−2)/2`. A star and a
   square both have `n=4`, so the ladder silently uses the SQUARE area (1) and a convex vertex count ⇒ a
   wrong candidate-lattice set + unsound P0 prune (findings 2,3). **For 4(j) this was MASKED by an area
   coincidence** — the star's true area (2) = 2× the square area, so the wrong ladder admitted the true Λ
   via a different convex multiset (`octagon + 2 squares` = `octagon + 1 star` = 4+2√2). For any star whose
   area is not a coincidental match, the wrong ladder would **drop the true Λ** ⇒ silent incompleteness.
   Fix = key the ladder by tile identity + per-corner vertex contribution.
2. **⚑ Regular-only fill loop** (`PeriodSolver.ts torusFill corner-completion`, `for n of ctx.polySizes →
   RegularPolygon.fromAnchorAndDirExact`). Cannot construct a star during fill. 4(j) needs no fill so it
   never bit, but any star tiling whose cell requires corner-completion would block here (finding 1).
   Fix = a star-aware gap-fill.
3. **`makeCtx` `n`-keyed bounds** — `minTileArea = min(polySizes.map(regularArea))` and
   `maxCircum = max(1/(2 sin(π/n)))` use edge-count only (finding 2 / the circumradius break). A spiky star
   can be larger/reach farther than the regular n-gon of the same `n` ⇒ `areaCap`/incidence-cull could
   clip. Not exercised by 4(j) (no fill); fix needs the polygons threaded into `makeCtx`.
4. **Latent, not exercised:** `holohedry`/`gridDirOf` (off-grid star periods), `TilingCongruence`/
   `TranslationalCellExtractor` `exactCentroid` keying (a non-issue for the **isotoxal** in-ring stars —
   Cₙ symmetry ⇒ vertex-mean = true centroid = kernel, strictly interior — but latent for asymmetric
   stars), and `setExactVertices`' vertex-mean centroid. The B2 predicate deliberately does NOT use the
   centroid as its interior witness.
5. **File-health aside (not a star break):** `lib/classes/algorithm/SeedExpander.ts` contains an embedded
   NUL byte (offset ~8273) so plain `grep` treats it as binary and silently skips it; use `grep -a`/`rg
   --text`. Pre-existing; tolerated by the build; flagged for cleanup.

### 23.5 Reproduction
- `pnpm tsx scripts/probe-pipeline.ts 1` / `2` — regression gate (`6f9ca9cf2d16c75f`/11, `f3e2e0517191362c`/20).
- `SPIKE_TRACE=1 pnpm tsx scripts/spike-star-4j.ts` — real solve → 1 certified k=1 cell + the ladder break.
- `SPIKE_TRACE=1 pnpm tsx scripts/spike-star-4j-cell.ts` — exact verification (area=|det Λ|, k=1, dent-fills).
- `pnpm vitest run tests/exact-star-polygon.test.ts tests/exact-overlap.test.ts` — B1/B2 units.

## 24. C7 star Increment 2 — closing the completeness gap; the in-ring k=1 star enumeration made sound (2026-06-08, session 15)

**Branch `feat/c7-star-spike` (continues §23), NOT merged.** Per the TA contract
(`resources/research/star-increment2-contract-2026-06-08.md`): turn the §23 *correctness* result (4(j)
certified, but DESPITE break #1, masked by an area coincidence) into a *completeness* one — make the full
in-ring k=1 star enumeration sound, then validate per-tiling against Myers (2004). Doctrine throughout:
**completeness knobs are not speed dials** — where a star breaks a *prune*, LOOSEN it (sound, slower,
never drops), never feed it a regular-tile formula.

**Hard invariant held at every stage:** regular k=1=11 `6f9ca9cf2d16c75f`, k=2=20 `f3e2e0517191362c`
**byte-identical** (`scripts/probe-pipeline.ts`), full build green, all star units pass (51 across
`exact-star-polygon` + `star-vc`; + the §23 `exact-overlap`).

### 24.1 C1 — identity-keyed exact area through the candidate-lattice ladder
`vcAreaSet`/`vcAreaMinVerts` (`LatticeEnumerator`) were `n`-keyed: a star and a regular n-gon share `n`,
so the ladder used the SQUARE's area for the 4* star (§23 break #1). Re-keyed every area lookup by **tile
identity** (`tileIdToken`: `String(n)` regular, `${n}*@${α}` star — α = min corner angle, read
geometrically). `vcIncidences` is now `Map<string,number>[]`; `vcAreaSet(vcIncidences, tileArea,
tileCorners, …)` consumes side maps built from `seed.polygons` (star area = `polygonAreaSurd`). Regular
seeds → token `String(n)` ⇒ **byte-identical**.

### 24.2 ★ The finding C1 surfaced — `vcAreaSet`'s tile-count model is UNSOUND for stars
Once the star area was *correct* (4*_{π/4} = **2**), Harness 1 emitted **0 cells**: identity-keying made
the coincidence (§23.3, star area 2 = 2× square) no longer paper over the bug. Root cause deeper than the
contract's C1/C2 split: `vcAreaSet` derives the candidate area set from the **VC-forced tile multiset**
(`corners / n = tile count`), which assumes **every tile corner is a counted vertex**. FALSE for stars —
a star's dents are filled at **t=2 dent-fill non-vertices**, so an octagon abutting a dent contributes
fewer than 8 counted corners. The model dropped the true 4(j) cell `{1 oct + 1 star}` = 4+2√2 (its
smallest admitted multiset was `{1 oct + 2 stars}` = 6+2√2). This is a *combinatorial* unsoundness, not
just a mis-valued constant.

### 24.3 C2 — loosen the candidate ladder + the P0 prune for star seeds
Doctrine fix: when `seed.polygons.some(isStar)`, replace the sharp VC-forced `vcAreaSet` with the generic
identity-keyed `areaLadderFromTiles` (ANY sum of tile areas ≤ `aMax` = 24k·max-tile-area — a sound
superset; the fill + certificate + k-gate reject the extras) and **empty `minVerts`** (the P0
admissibility prune cannot fire). `spikeBreak`-logged (never silent). Regular seeds untouched ⇒
byte-identical. **Result:** 4(j) re-emerges via the real solve for the RIGHT area (ladder star entry = 2),
Harness 2 re-CONFIRMS the cell. The tightened, still-sound star area set (the dent-aware model) is
**Increment 3, TA-owed.**

### 24.4 B1-gen — `ExactStarPolygon` generalized to isotoxal `n*_α`
`ExactStarPolygon.isotoxal(nPoints, αU, anchor, dir)`: a `2n`-gon by a unit-edge walk with exterior turns
cycling `[12−β, 12−α]` (π/12 units, β = 24 − 24/n − α), Σturns = `n·(24−α−β) = 24` ⇒ every vertex in
ℤ[ζ₂₄]. Carries `alphaU` (for the C3 fill palette) and `betaU`. `fourStarPi4` is now a thin wrapper.
**Admissible in-ring set: 32 variants** — n ∈ {3,4,6,8,12} (n | 24), `0 < α < 12(n−2)/n` (the upper bound
⟺ β > 12, a genuine reflex dent), counts [3,5,7,8,9]. Unit-tested across all 32 (corner angles `[α,β,…]`,
closure, area > 0) + range/divisibility rejection + the gap-seating primitive (point at anchor, edge d0).

### 24.5 C3 — star-aware fill loop + the P1 loosening
`torusFill`'s corner-completion placed only `RegularPolygon`s. Added a **star palette** on `FillCtx`
(`starTiles` = the seed's distinct `(n,α)` star variants, with exact area + circumradius folded into
`minTileArea`/`maxCircum` so star-only / star-smallest seeds get a sound area cap). The fill loop now also
seats each star variant's **POINT** (`ExactStarPolygon.isotoxal(n,α,w,d0)`, covering [d0, d0+α]) into the
open gap, reusing the §23 B2 exact overlap. Regular seeds: empty palette ⇒ byte-identical.
- **★ The P1 finding.** The orbit-floor prune (`vReps.length > k·hol(Λ)`, both the seed-core gate and the
  per-child cut) counts **every tile corner as a vertex class** — UNSOUND for stars, whose dents are t=2
  **non-vertices** wrongly inflating V, so P1 could prune a branch leading to a valid star tiling (a DROP).
  **LOOSENED:** P1 disabled for star seeds (`skipP1`), logged; `maxCellPolys` (area cap) still bounds the
  cell. Tightened bound `V = [Σ_reg(n−2) + Σ_star(2nₛ−2)]/2 − D` (D = dent-fills) needs D-per-cell ⇒
  **Increment 3.**
- **★ The 4(p) surprise.** The contract assumed Myers 4(p) `4.6.4*_{π/6}.6` needs fill. It does **not** —
  its translational cell = the single-VC fan `{square, star, 2 hex}`, closing mod Λ with NO
  corner-completion (like 4(j)). So neither pinned tiling exercises *productive* star-fill; that is an
  empirical property checked in the Run. C3 is verified to (a) keep 4(p)/4(j) at exactly 1 certified cell
  with star-fill now active on the ~1134/~204 non-closing lattices, (b) hold the regular digests.
- **⚑ Dent-seating NOT attempted (Fig-3 gap).** The fill loop seats only star POINTS. The Fig-3
  dent-AT-vertex class (a reflex dent corner at a real ≥3-tile vertex) is not generated by fill ⇒ those
  tilings can be DROPPED — a completeness gap (not soundness), flagged loud. (`isotoxalDentAt` exists for
  the seed-construction side; the fill-loop dent branch is Increment-3/best-effort.)

### 24.6 C4 — exact in-ring star VC enumeration (standalone, NOT the legacy float VCGenerator)
`lib/classes/algorithm/StarVC.ts` — a STANDALONE exact enumerator, deliberately **not** an extension of
the legacy float `VCGenerator`/`PolygonSignature`/`SeedBuilder`: that front-end is float and feeds the
REGULAR pipeline; plumbing stars through it risks the regular byte-identical invariant and re-introduces
float on the decisive star path. The §23 spike already established the exact hand-built-seed pattern.
- `enumerateStarVCs` — cyclic corner sequences (regular interiors + star points [+ dents]) summing to 2π,
  under Myers's prunes: **≥1 point, no two adjacent points (cyclic), ≤1 dent, t≥3.** Names match
  `Polygon.cornerToken`/`canonicalVCName` exactly. Recovers the 4(j) and 4(p) figures (tested).
- **★ The dent-fillability filter (sound, derived not hand-listed).** A Fig-4 dent is a t=2 point where
  dent(β) + γ = 2π, so the dent-fill angle γ = 24/n + α must be a single available corner. Requiring it
  to be a **regular** corner (γ ∈ {4,6,8,9,10}) cuts the 32 variants to **19** — and is a SOUND SUPERSET
  of the TA oracle: it **equals** the oracle for the constrained n=3,4,6 (`3*@{1,2}`, `4*@{2,3,4}`,
  `6*@{2,4,5,6}`) and **contains** it for n=8,12 (`8*@{1,3,5,6,7}⊇{1}`, `12*@{2,4,6,7,8}⊇{2}`; the solver
  rejects the extras). ⚑ Assumption flagged: dents filled by a single *regular* corner — a Fig-4 tiling
  with a star-point-filled dent would be missed (not in the oracle, but a real caveat for the general/Fig-3
  case). `buildStarVCSeed` materialises the exact seed fan (point via `isotoxal`, dent via `isotoxalDentAt`).

### 24.7 Run — `scripts/scout-star-inring.ts`; the feasibility wall, and the recovered set
Standalone scout: enumerate → exact seed fan → `PeriodSolver(1).solve` → `dedupeByCongruence`, reporting
recovered tilings + star variants vs the oracle. Keeps `pnpm pipeline` byte-identical.
- **⚑ Feasibility wall (measured, surfaced — the plan assumed the run was tractable; it is not).** The
  C2/C3 loosening inflates `candidateLattices` to ~100–1100 per seed (the sharp star area set is the
  Increment-3 dent-aware bound, not yet available), so each solve is ~1–30 s. The fully-sound run over all
  **4896** dent-reg VCs is ≈ **8 h** — a background batch, not interactive. Any scope reduction
  (`--single-star`, `--limit`, `--max-corners`, per-seed `--maxMs`) is a CAP that can drop an in-ring
  tiling and is printed loudly; the completeness CLAIM holds only for the full unscoped sound run.
- **Demonstration run (single-star-type, 483 VCs, dent-reg variants).** <!-- RUN_RESULTS -->_(results
  pending — fill from `scripts/scout-star-inring.ts --single-star`)_

### 24.8 The Increment-2 break/finding ledger
**FIXED + sound this session:** C1 identity-keyed area; C2 loosened ladder + P0 for star seeds; B1-gen
isotoxal `n*_α`; C3 star point-fill + P1 loosening + star-aware `makeCtx` bounds; C4 exact VC enumeration
+ the sound dent-fillability filter.

**Deferred / flagged (loud, never silent):**
1. **⚑ Sharp star area set (Increment 3, TA-owed)** — the dent-aware `vcAreaSet`/`vcAreaMinVerts`
   (`V = [Σ_reg(n−2)+Σ_star(2nₛ−2)]/2 − D`). Without it the candidate ladder is a loose superset ⇒ the 8 h
   wall. Soundness is NOT at risk (superset); only speed.
2. **⚑ Dent-seating in the fill loop (Fig-3 gap)** — only points are seated; dent-at-vertex tilings can be
   dropped. `isotoxalDentAt` + the Fig-3 VC enumeration exist; the fill-loop branch does not.
3. **⚑ Dent-fillability filter assumption** — Fig-4 dents filled by a *single regular* corner (sound for
   the oracle; a star-point-filled dent would be missed).
4. **Standalone scout, not legacy VCGenerator** — a deliberate architecture choice (keep the regular
   pipeline exact + byte-identical), flagged for TA review.
5. **⚑ Grid long-side reach (`poolLmax`) not raised for stars** — the candidate enumeration prints
   `INCOMPLETE-REGION` (cmm/rect long axes beyond `poolLmax=5.6` not enumerated). For regular k=1 this was
   sound (all 11 cells fit; ~108 skipped); for star seeds the loosened ladder pushes this to **millions**
   skipped, so a star tiling whose primitive cell has a long axis > 5.6 would be MISSED. Loud (printed),
   not silent; a real completeness bound for the star run, shared with the §13.6/§11.5 pool-reach issue.

### 24.9 Reproduction
- `pnpm tsx scripts/probe-pipeline.ts 1` / `2` — regression gate (`6f9ca9cf2d16c75f`/11, `f3e2e0517191362c`/20).
- `pnpm vitest run tests/star-vc.test.ts tests/exact-star-polygon.test.ts` — C4 enumerator + B1-gen units (51).
- `SPIKE_TRACE=1 pnpm tsx scripts/spike-star-4p.ts` — 4(p) certifies k=1 from its fan (star-fill active, breaks logged).
- `pnpm tsx scripts/scout-star-inring.ts --single-star` — the in-ring demonstration run (caps printed loud).
- Full sound run (≈8 h): `pnpm tsx scripts/scout-star-inring.ts` (no scope flags).

## 25. Adversarial review work-orders + CB-1/CB-3 landed + DG-1 verdict: the proven pool is NOT enumerable at k=1 (2026-06-10, session 16)

**Review pack.** The 2026-06-09 multi-agent adversarial review (32 verified critical/major findings)
is now structured work-orders in `docs/review-2026-06-09/` (`cbeb0c1`): DG decision gate, CB code
bugs, TX thesis alignment, TH theory obligations, OP optimizations, ST star/new directions. Read
`README.md` there for the amended execution order. Hygiene commits: star Increment-2 working tree
(`4c4c5a5`), `experiments/` tracked (`03e15ba`).

**CB-1 — certificate area leg is now EXACT** (commit this session). The decisive leg (c) compares
`Σ tileAreaSurdFor(p)` to `ctx.cellAreaSurd = |det Λ|` by exact `Surd.cmp`; the old 1e-4 float
compare is demoted to broadphase pre-reject (provably cannot contradict the exact decider — float
error ≲1e-10 ≪ 1e-4). Core-overflow guard at fill entry RULED stays-float (hot path; its +1e-6 slack
only ever over-accepts, caught by the exact certificate downstream). New `tileAreaSurdFor` = exact
shoelace, placement-invariant; tests pin closed forms n∈{3,4,6,8,12} and the 4(j) identity
star+octagon = 4+2√2 exactly. **Digest gate: k=1 `6f9ca9cf2d16c75f`/11, k=2 `f3e2e0517191362c`/20 —
byte-identical; 244/244 tests.** ⚑ The three §13.4 float-slack tilings (t2004/t2011/t2012) now pass
by exact equality, confirming the slack was accommodating float noise, not masking inequality.
⚑ k=3 oracle regression (2.5 h no-cap scout) queued as the formal acceptance — run before the next
certified-claim refresh.

**CB-3 — `join-waived` now fires.** The den≤60 near-rational join cut in `obliqueCells` emits
`{cause:"join-waived", rejects, denMax}` once per run through `onTruncate` (TA ruling
SYNC-2026-06 option (b)). **Correction to §19.3:** the claim that all three oblique truncation
causes were "routed loudly to stderr" was WRONG until this session — `join-waived` was defined in
the type and had zero emission sites; only subpool-clipped/v-range-truncated fired. The count is an
upper bound (float can't split irrational coords from den>60 rationals). Test pins once-per-run +
positive count.

**DG-1 — the proven-configuration pool measured INFEASIBLE at k=1** (`scripts/measure-proven-pool.ts`,
log `experiments/results/dg1-proven-pool-k1.log`). Level-BFS over distinct W(t) values (ℤ[ζ₂₄] as
8 int coords, Φ₂₄ reduction; hand-checked new(2)=264): aborted at budget during level 16 of 23 with
|W(15)| = 114,510,529 (88.7 s, RSS 2.65 GB). Projected |W(23)| ≈ 3.02e9 (poly fit d=6.85 ≈ the
theoretical t⁷ frontier) — value enumeration alone needs ~55 GB; the PAIR stage is ≥3.45e17 naive
pairs ≈ **1,370 years on 8 cores**. ⚑ Structural: the proven cor:box filters prune NOTHING at k=1 —
|v|≤310 never binds (weight 23 ⇒ |w|≤23) and |u|≤17.61 is vacuous below level 18. For scale: the
tuned pool lives at ~level 4 (~10⁴ values vs ~10⁹·⁵). **Verdict per the DG-1 decision table:
"k=1 infeasible" ⇒ the honest thesis rewrite (TX-1/TX-2 option b) is MANDATORY — no thesis sentence
may state or imply a proven-configuration run was executed — and TH-10 (tighter weight bound) is
the route back, with the bar set by the PAIR count (≥5 orders), not |W| (~recoverable on 128 GB).**
The measurement itself is thesis-grade: an intractable proven box is a result, and it motivates
TH-10 precisely (correctness.tex rem:box-implementation's "may search a smaller region only behind
filters proven sound" now has a measured floor on what those filters must achieve).

## 26. Seed-anchored D-D probe (SA, contract 06) — NEGATIVE by mechanism: species can't reach the D-set tree (2026-06-10, session 16b)

Alessandro's partial-symbol sketch → contract `docs/review-2026-06-09/06-seed-anchored-dsym.md` →
probe on `feat/dsym-seeded` (off master, pushed). Anchored `generateCandidateSymbols` (flag-off
byte-identical, digest `e91646625684e01f`; fresh k=2 baseline 20 / 54,911 dsets / 404,533,320 nodes
reproduces §23.5). **Anchored k=1 PASSED its falsifier**: union over 15 species = the exact 11
canonical keys; the 4 non-extendable species die combinatorially (classical 15→11, 0.1 s — the
per-VC expansion idea machine-validated at k=1). **Anchored k=2 KILLED the idea**: multisets [1/43]
and [2/43] cost an identical 205,822,063 nodes (~51% of the full tree EACH) — the D-set tree
depends only on the (faces, degrees) divisor signature, so species information never reaches the
level where 2.24^δ lives; Σ over 43 anchors ≈ 10–20× WORSE than unanchored. Sweep killed at [2/43]
(re-measuring a constant); anchored k=3 pointless (same walling tree). ⚑ Corollary: wherever
unanchored completes, anchoring = pure overhead (species post-filter is free). ⚑ The surviving
escalation is GEOMETRIC anchoring (contract §6, SA-4/SA-5): pinned σ-structure must cut the D-set
branching itself. B2/TH-11 remains the realizability gate for every D-D variant.
