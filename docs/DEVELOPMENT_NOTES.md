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

> **⚑ Merge note (2026-06-10, CC):** two parallel session-14 ledgers (master's C5 and the c7 branch)
> both claimed **§23**. Kept verbatim per append-only doctrine: the **Delaney–Dress §23** (next) is the
> one all `§23.x` cross-references point to (e.g. §23.5 wall data); the **star-spike §23** follows it and
> is referenced by title only. Numbering resumes consistently at §24.

## 23. Delaney–Dress engine (C5) — M0 (symbol core) + M1 (sound generator + wall-probe): the count is flat, the generation walls at k=3 (2026-06-08, session 14)

**The question (C5, contract `../resources/research/delaney-dress-implementation-contract-2026-06-08.md`).**
Stand up Delaney–Dress as a third enumeration engine, **probe-first**: M0 = the pure symbol core, M1 =
a *sound* constrained generator whose deliverable is **ΣcandidateSymbols vs k** — the analog of the
orbifold method's ΣcandidateLattices `183 → 3103 → 186190` (§22/§23.x). Gate: a dramatically flatter
curve earns the pivot; a wall is itself a verdict. Isolation: a self-contained `lib/classes/algorithm/delaney/`
module behind `USE_DSYM`, one branch at `run-pipeline.ts:147`, exact core untouched, **flag-off
byte-identical** (`6f9ca9cf2d16c75f`/11, `f3e2e0517191362c`/20). Built on `feat/delaney-dress` off
`master` (worktree). B2 (the realizability lemma) only enters via **B2.5** here (the angle prune is
completeness-safe); the geometric realizer (M2) is gated on this measurement and not built.

### 23.1 The two corrections the TA's plan-review forced (and why they mattered)
The review (`../resources/research/delaney-dress-c5-plan-review-2026-06-08.md`), checked against the
session's own run-verified `experiments/delaney-dress/FINDINGS.md`, overturned two things in the first plan:
- **Chirality: there is no reversed/mirror key.** The first design proposed `min(canonicalForm,
  canonicalFormReversed)`. Wrong on two counts: a 2-D Delaney symbol is *already* unoriented, so a chiral
  tiling and its mirror **share one symbol** (FINDINGS §1) — **plain** DF-Alg-8 `canonical_form` merges
  them; and the "reverse the BFS order" construction re-encodes the *same* symbol `D`, never the mirror
  `D*`, so it merges nothing. The chiral **snub-hex `3.3.3.3.6` (p6, size 10) lives at k=1** and is the
  regression: **k=1 = 11, not 12**, is the chirality test. The reversed key was deleted.
- **`strategy_a.py` is the ground-truth ORACLE, not a "phantom-wall anti-pattern."** It is *correct-but-
  slow* (brute-generate-all-BFS-layouts + canonical-dedup; SHA256-cross-checked 93→11). So a *new*
  generator's danger is the **opposite of over-counting — silently DROPPING an iso-class via a homemade
  prune** (FINDINGS §5: "soundness is tied to the exact Read/Faradžev order — do not invent one"). The
  mandate became: **port the published order, validate against `strategy_a` exactly at every δ it reaches.**

### 23.2 M0 — `lib/classes/algorithm/delaney/DSymbol.ts` (pure, fs-free; 14 tests green)
A faithful TS port of `dsymbol.py` + `minimal_image_test.py` (immutable, dense `number[]`): axioms
DS0–DS4 (`validate`), {0,1}/{1,2}/{0,2} orbits, exact per-component curvature via bigint fractions
(`perComponentFlat` — the operative filter; global `K=0` is insufficient, the mixed-sign-ghost finding),
**plain** DF-Alg-8 `canonicalForm` (numeric field comparison, not digit-lex — the "10 < 2" hazard), and
the DF-Alg-10 `minimalImage` (the maximal-symmetry quotient = the genuine-k collapse). Cross-checked
against the hand-verified ground truth (3 regular + **4.8.8** size-3 + a hyperbolic contrast); the
doubled-square folds to the square at genuine k=1; canonical form is invariant under every relabeling
(the mirror = an isomorphic relabel).

### 23.3 M1 — `DSymGenerator.ts`: the published order + sound interleaved prunes
**Base = a faithful port of the published canonical-augmentation order for 2-D Delaney SETS**
(`odf/julia-dsymbols`, `src/dsetGenerator.jl` — Delgado-Friedrichs / Read–Faradžev): `firstUndefined`
→ `scan02Orbit` (the m02=2 / DS2 closure) → `checkCanonicity` (reject if a remap-start chamber yields a
smaller renumbering). This visits each connected 2-D D-set iso-class of size ≤ δ **exactly once** — no
invented order. The regular-Euclidean **label layer matches the oracle `k2_minimal_fixed.py` exactly**:
per {0,1}-orbit `m01 ∈ P` with `r01|m01`; per {1,2}-orbit `m12 ∈ {3,4,5,6}` with `r12|m12`; keep iff
`validate` ∧ `perComponentFlat`; dedup by plain canonical form; genuine k via `minimalImage`. (No
VC-alphabet coupling: `perComponentFlat` + the axioms already kill the ghost arrangements — FINDINGS §3 —
so the module stays fully decoupled.) Three **interleaved, hereditary monotone prunes** make it tractable
without dropping a class (a closed orbit is frozen ⇒ sound): a closed {1,2}-orbit must admit `m12≤6`
(`r12≤6`); a closed {0,1}-orbit must admit some `m01∈P`; the count of **closed {1,2}-components ≤ k**.
The DFS is in-place (pre-allocated `op`, edge-undo on backtrack — allocation-free per node).

### 23.4 Soundness validated against the oracle (the trust anchor — three checkpoints)
`pnpm vitest run tests/dsym-generator.test.ts` reproduces `strategy_a`/`k2_minimal_fixed` **byte-exactly**:

| k | δ-bound | raw candidates (post-flat, deduped) | genuine-k minimal | oracle |
|---|---|---|---|---|
| 1 | ≤12 (= 12k, **provable**) | **93** | **11** | A068599(1)=11 ✓ |
| 2 | ≤12 (partial) | **144** | **17** | matches `k2_minimal_fixed` (17, ≤12) ✓ |
| 2 | ≤16 / ≤20 / ≤24 | — | **18 / 19 / 20** | A068599(2)=**20** at the full δ≤24 ✓ |

k=1 = 11 (not 12) confirms the chirality auto-merge (snub-hex counted once). The k=2 climb 17→18→19→**20**
across the proven envelope δ≤24 is the soundness proof at the **full** k=2 range — the Python oracle only
ever *verified* 17 (≤12) and *extrapolated* 20.

### 23.5 The gate — the count is FLAT, the generation COST explodes
Two curves, and they diverge sharply:
- **OUTPUT — ΣcandidateSymbols:** `11 (k=1) → 20 (k=2)` — the A068599 sequence, **dramatically flatter
  than orbifold's ΣcandidateLattices `183 → 3103 → 186190`.** The method's premise (a clean, small
  candidate set) is **confirmed**.
- **COST — D-set DFS nodes to reach the proven B1 bound δ≤12k:** k=1 = 18 k nodes (instant, 276 D-sets);
  k=2 δ≤24 = **404 M nodes / ~12 min** (0.6 M nodes/s). The node count grows **~25–29× per +4 size**
  (558 k @δ16 → 14 M @δ20 → 404 M @δ24), so k=3 (δ≤36) extrapolates to **~10¹²–10¹³ nodes ⇒ months**.
  **Confirmed walled**: k=3 at the *provable* δ≤36 bound, given 400 M nodes (the budget that fully solved
  k=2 δ≤24), made **zero** progress — `completed=false`, `dsets=0` (depth-first augmentation at maxSize 36
  never backtracks to the small raw-k=3 D-sets within budget). Yet at *tractable* sizes the count
  completes and climbs toward **A068599(3)=61**: **k=3 δ≤12 / 16 / 20 = 15 / 41 / 52** candidateSymbols
  (29 k → 0.7 M → 18 M nodes / 3 min, all complete) — so the k=3 set is ~tens (flat), **reachable as a
  sound FINDER (52 of 61 by δ≤20) but NOT exhaustible as a CERTIFIER** at δ≤36. The matched `{3,4,6}` curve (orbifold's
  baseline polygon set) tells the same story flatter still: **candidateSymbols `8 (k=1) → 17 (k=2)`**
  (both complete; k=2 δ≤24 = 273 M nodes / 7 min) **vs orbifold candidateLattices `183 → 3103`** — D-D's
  count is ~20× smaller and growing ~2× where orbifold grows ~17×.

### 23.6 Verdict — front-end tamed, provable completeness gated on a tighter size bound than B1
The Delaney–Dress front-end is exactly what FINDINGS predicted: the candidate **count** is clean and flat
(`11 → 20 → …`), the minimal-image collapse is cheap and combinatorial, and the port is **sound** (the
published order reproduces the oracle to the byte). But the **generation** — enumerating *all* D-sets up
to the B1 envelope δ≤12k — is the same explosion the published genDSyms has (it, too, generates every
D-set and prunes at the label stage); the regular-feasibility interleaving cuts the constant but not the
~25×/+4 asymptotic. So **D-D provably completes k≤2 (δ≤24 reachable) but walls at k=3 (δ≤36)** — it does
*not*, as-is, extend the certified frontier past the torus method's k≤3, and the k≥4 home-run is
unreachable. The decisive missing piece is **not** a faster generator but a **tighter proven size bound
than B1 = 12k** (the working sizes are far smaller — k=2's largest minimal symbol is ≤24 but most ≤16):
with a bound near the true max size, the flat candidate count would be reachable. That bound is a *theory*
deliverable (TA). Until then, D-D stands as an **independent, complexity-bounded cross-method completeness
*witness* for k≤2** (and a sound *finder* — not yet a *certifier* — at k=3 via a capped search), exactly
the honest framing FINDINGS §5 reached: Tegula already enumerates D-symbols (no regular gate),
Galebach/Čtrnáct already have the counts; D-D's novelty is the clean B1 + minimal-image front-end with B2
the open bridge.

### 23.7 Isolation discharged
`USE_DSYM` unset ⇒ both digests byte-identical (`6f9ca9cf2d16c75f`/11, `f3e2e0517191362c`/20, re-run after
all changes); `pnpm build` clean; `delaney/` is fs-free and off the `@/classes` barrel; the only shared-code
edit is one import + the dead-when-unset branch at `run-pipeline.ts:147` (verified, skips seeds/compat/expand).

### 23.8 Repro
- `pnpm vitest run tests/dsymbol.test.ts tests/dsym-generator.test.ts` — M0 (14) + M1 (5), the oracle cross-checks.
- `pnpm tsx scripts/dsym-probe.ts 4 3,4,6` / `... 3,4,6,8,12` — the gate table (ΣcandidateSymbols + completed-vs-walled per k; `[budget]M` nodes/k; a wall is loud, never silent truncation).
- `USE_DSYM=1 DSYM_BUDGET_M=5 pnpm tsx lib/algorithm/run-pipeline.ts` — the integrated path (k=1=11, k≥2 walls fast); writes `pipeline-output/<params>/dsym-probe.json`.

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

## 24. C7 star Increment 2 — closing the completeness gap; the in-ring k=1 star enumeration made sound **for the Fig-4 point-at-vertex subclass** (2026-06-08, session 15; retitled 2026-06-10 per ST-2 — the no-flag run is Fig-4-subclass only and structurally misses Fig-3, see §24.10)

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
  *[ST-2 correction, 2026-06-10: "fully-sound" here means sound **for the Fig-4 point-at-vertex
  subclass only** — the no-`--dents` run never enumerates dent-at-vertex VCs, so it structurally
  misses Fig-3 (incl. 3(f)'s `6*@6`) regardless of runtime. See the run-matrix, §24.10.]*
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
- Full sound run (≈8 h): `pnpm tsx scripts/scout-star-inring.ts` (no scope flags). *[ST-2, 2026-06-10:
  this config is the **Fig-4-subclass** run — Fig-3 is out of its scope by construction; §24.10.]*

### 24.10 Run-matrix + certification vocabulary (added 2026-06-10 per ST-2 — docs/review-2026-06-09/05)

The honest scope of every scout config, reconciling §24's original "fully-sound run" phrasing, the
scout header, and the TA review's downgrade (SYNC: "Fig-4(13)-first then Fig-3 a,f best-effort").
The scout prints its row at startup and aggregates `INCOMPLETE-REGION` per cause at exit.

| config | scope | claim ceiling |
|---|---|---|
| *(no flags)* `--variants dentreg`, no `--dents` | Myers Fig-4 **in-ring point-at-vertex subclass (13 tilings)**. Fig-3 structurally OUT — dent-at-vertex VCs (incl. 3(f)'s `6*@6`) exist only under `--dents` | Fig-4-subclass completeness, and only with **0 timeouts AND a zero truncation summary** |
| `--dents` | + Fig-3 dent-at-vertex VC class | **BEST-EFFORT only** — fill seats star POINTS only (§24.5), dent-fillability filter assumes a single regular corner (§24.6); a Fig-3 miss is NOT decisive |
| `--variants all` | 32-variant sound superset of dentreg | same row as above (solver rejects the extras; slower) |
| `--single-star` / `--limit` / `--max-corners` / `--maxMs` | — | **CAPS**: each can drop an in-ring tiling; any active cap or timeout disqualifies any completeness reading |

**Oracle split (hard vs best-effort).** The scout's hard set is the Fig-4 variants
(`3*@{1,2}, 4*@{2,3,4}, 6*@{2,4,5}, 8*@1, 12*@2`); a Fig-4 miss on an unscoped 0-timeout
zero-truncation run is a **hard fail**. `6*@6` (Fig-3(f) only) is **best-effort** and is reported
"out of scope (not expected)" on any no-`--dents` run. Restoring Fig-3 to the hard set requires dent
seeding + dent-aware fill as a named increment with its own completeness argument (Increment 3 / TH-3).

**Vocabulary (binding for every star result, incl. the eventual results chapter):**
**certified-correct** = this tiling exists, is k-uniform, verified exactly — what 4(j)/4(p) have;
**certified-complete** = the enumeration provably found all — what NOTHING in the star lane has, and
cannot have until TH-3/TH-6 close and the truncation counts are zero under a proven star pool bound.
The scoping note's own honesty is the anchor: the Myers list "is **not** a machine-checked,
proven-complete catalogue … the G&S→Myers correction shows the genre's fallibility (exactly the
Galebach situation we already cite)" (`star-scout-scoping-2026-06-06.md`).

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

## 27. B2 proven → M2 realizer built → k≤2 THEOREM-CERTIFIED, oracle-independent (2026-06-10, session 16c)

The session the project's claimed contribution became real at k≤2. TA closed TH-11
(`resources/research/delaney-dress-B22-realizability-proof-2026-06-10.md`, two logged adversarial
passes; thesis lem:ddrealize / lem:ddrealizer / rem:ddscope — thesis master now `1913b4c` after the
fast-forward merge of `tx-alignment-2026-06-10`, compile re-verified 68pp/0 undefined refs). CC then
wired `DSymRealizer.ts` per Lemma R and ran the acceptance.

### 27.1 The TA proof, and the trap my own spec set

TH-11 as written prescribed "assemble from DF TCS-303 Thm 5". TA re-read the paper: **Thm 5 is
topological/equivariant only** — it certifies the mixed-sign ghost (K=0, squashed quadrilaterals).
A proof following my spec route would have been UNSOUND. The metric statement is instead proven
directly: B2.0 chamber gluing → compact Euclidean orbifold (angle equation consumed exactly at the
vertex loci, nowhere else) → Thurston 13.3.2 (good + developing + discrete) → lift the chamber
decomposition → tiles from {0,1}-stars. The second adversarial pass also forced B2.7 (plain symbols
of k-uniform tilings are minimal — surjectivity of the counting bijection), proven internally via
orbit-refinement contradiction. Spot-checked here: the Step-2 orbit angle computations, the B2.7c
refinement argument, and the octagon field trap (`csc(π/8) ∉ ℚ(ζ₂₄)` since `ℚ(ζ₁₆)∩ℚ(ζ₂₄)=ℚ(ζ₈)`)
— all hold. Residual honest dependencies: Thurston 13.3.2 (published, standard), Bieberbach,
B2.0/B2.3/B2.4/B2.5 from the 06-08 note, lem:corona.

### 27.2 The realizer (Lemma R steps 1–6, `lib/classes/algorithm/delaney/DSymRealizer.ts`)

- **Step 1 angle gate** = exact rational; REJECT names its {1,2}-component, its developed face
  sequence, and Σ(1−2/p_j) as a fraction. Verified algebra: the developed sum S relates to the
  curvature sub-sum κ by S = 2 − v12·κ (cycle) / 2 − 2·v12·κ (chain) ⇒ gate ≡ perComponentFlat
  (B2.5) as a decision; the gate adds the naming.
- **Step 2 development**: chamber = (V,E,F) Cyclotomic triple; s0 = V′=2E−V (apothem-wall
  reflection, division-free); s1 = reflect E across (V,F); s2 = rebuild F on the other side with
  the NEIGHBOUR's apothem (cross-tile, the one place unit-edge is consumed). ⚑ Field rider
  implemented division-free: every reflection's linear part found by exact search d² = |d|²·ζ^k;
  no match ⇒ `FieldClosureError` (loud). `csc(π/8)` never appears as a scalar anywhere.
- **Steps 3–4**: holonomy generators = non-tree Delaney edges + mirror walls (Poincaré
  face-pairing of the developed tree = fundamental domain); linear parts are integer pairs
  (refl, k) ∈ D_24 ⇒ G₀ finite a priori; Schreier on the ≤48-coset action gives pure-translation
  generators of Λ (asserted: linear part = id).
- **Step 5**: exact unimodular HNF over the ζ-coefficient lattice (span preserved exactly ⇒ Λ is
  the FULL translation subgroup, not a sublattice); rank-2 asserted; Lagrange-reduced
  geometrically (float picks integers, exact subtraction — sound).
- **Step 6**: Λ-quotient chamber BFS with exact coset keys (rational pivot reduction against the
  HNF rows); **count asserted = δ·|G₀|**; tiles from {0,1}-stars via exact ζ^{N/p} rotation;
  emitted as `RegularPolygon.fromAnchorAndDirExact` (vertex-set re-asserted) → `PeriodCell` →
  **`PeriodSolver.certifyExternalCell`** (additive wrapper = the session's one shared-code touch)
  runs lem:corona, whose accept-side soundness is independent of B2.2 (defense in depth).
- ⚑ **Bug found by the δ·|G₀| assertion during build:** the SYMBOL folds mirror chambers but the
  TILING does not — the quotient BFS must cross mirror walls (s_i c = c) too. First build skipped
  them → 1 chamber instead of 8 on the square. The assertion caught it instantly; this is exactly
  why Lemma R's "precomputed target count" termination design is right.

### 27.3 Acceptance (TA note §6 ghost regressions, verbatim — ALL GREEN)

- (a) E3 mixed-sign witness `(2,(1,0),(0,1),(0,1),(4,4),(3,6))` → REJECT naming orbit {0},
  faces [4,4,4], sum 3/2 (the other orbit: [4×6], sum 3). Pure rational; no development.
- (b) No monogonal dead-necklace flat symbol at k=1 (3.4.4.6 / 3.3.4.12 / 3.3.6.6 / 3.4.3.12).
- (c) **k=1: 11/11** realized + corona-certified + KUniformityChecker-crosschecked +
  congruence-distinct; 4.8.8 exercises the octagon rider, zero field violations. **Per-tiling
  congruence match vs the torus catalogue: 11/11 both directions.**
  (`experiments/results/m2-realizer-k1-2026-06-10.log`)
- **k=2: 20/20** — M1 reproduced the §23.5 tree EXACTLY (404,533,320 nodes — determinism), all 20
  realized + certified (δ up to 22, |G₀| ∈ {4,6,8,12}, cells up to 21 tiles), 0 rejects,
  congruence-distinct, **per-tiling match vs the torus catalogue 20/20 both directions**
  (`experiments/results/m2-realizer-k2-2026-06-10.log`).

### 27.4 What is now true (and what is not)

**k=1 = 11 and k=2 = 20 are theorem-certified and oracle-independent**: B1 (δ≤12k, proven) bounds
the sweep; the published canonical-augmentation order enumerates symbols completely; lem:ddrealize
(B2.2+B2.3+B2.6+B2.7) gives the bijection minimal-flat-symbols ↔ tilings; every accept carries an
independently verified corona certificate. The Soto-Sánchez oracle is consulted NOWHERE in this
chain — the torus per-tiling match is a cross-validation between two independent methods, not a
certification input. **NOT changed:** k=3 = 61 stays oracle-anchored (D-D generation still walls at
δ≤36); the DG-1 verdict and the TX option-(b) wording stand; the k=3 CB-1 oracle regression was
still in flight at write time (its own entry when it lands). Branch: `feat/m2-realizer`
(= c7-star-spike ∪ master; M2 = `500893b`). ⚑ NOTES numbering: two §23 exist post-merge (see the
merge note above §23) — D-D §23 carries the `§23.x` cross-refs.

## 28. Figure pipeline built → its oracle matcher finds the certified k=3 catalogue per-tiling WRONG (2026-06-10, session 16d)

### 28.1 What was built (thesis figure infrastructure, approved plan)

`figures/`: one TypeScript figure IR → two emitters (TikZ standalone→PDF thesis-final; SVG preview),
shared style module (Okabe–Ito, `byOrbit`/`byNGon`/`lineArt` strategies), snapshot-driven
(`figures/data/catalogue-k1-3.json`, hard-gated 11/20/61 + digests), orbit recompute via a purely
additive `KUniformityChecker.vertexOrbits()` (the gate delegates to it; behavior-identical, 15/15
old tests green). Orbit cache regeneration re-verified orbit-count==k for all 92 certified tilings;
k=1 vertex-figure names reproduce the 11 Archimedean names exactly. 18 pilot figures compiled and
visually verified. Tests: `tests/figure-{orbits,emitters}.test.ts`.

### 28.2 The finding — count 61 was right by two canceling defects

`scripts/oracle-match.ts` ran the FIRST exact per-tiling congruence match of the certified catalogue
against the pinned Galebach JSON (decode per `oracle-characterize.ts`; tilings RECONSTRUCTED from
Seed vertex sets: unit edges by exact `normSquared()==1`, faces by directed-edge tracing, exact
ζ-walk regularity check, exact area partition, one face per lattice class by exact anchor-difference
dedup — float-floor dedup is a trap, it double-counts boundary-centroid faces). Result: **90/92
matched 1:1** (k=2 = 20/20 — per-tiling oracle validation, stronger than the count match; k=1 =
10/11 + t1002≡4.8.8 by elimination — the oracle's ζ₁₂ integer format cannot encode the √2 basis,
the 4.8.8 obstruction seen from the other side). The two residuals decompose the k=3 defect:

- **Duplicate**: certified `3:1|-1,0,0,0,-1,0,0,0;1|-1,0…` (det 8.928, 18 tiles) is a NON-PRIMITIVE
  index-2 cell of the same tiling as certified `3:1|-1,0,-1,0,-1,0,0,0;1|-1,…` (det 4.464, 9 tiles):
  `TranslationalCellExtractor` reduces it 2×, and the reduction is `cellsCongruent` to the other.
  Root cause: `tilingsCongruent`'s equal-det cheap reject silently ASSUMES primitive cells, so
  `dedupeByCongruence` can never merge a non-primitive encoding with its primitive twin.
- **Missing**: Galebach #7 (t3007), VC types {3.12.12; 3.3.4.12; 3.4.6.4}, is congruent to NONE of
  the 92. The reconstruction is a genuine 3-uniform tiling (exact regular faces, exact area
  partition, every interior vertex sums to exactly 24 units, primitive cell, orbit count 3) and
  visually matches Galebach's own probabilitysports.com/t3/7.png.

So the certified k=3 set is 60 distinct + 1 duplicate; the byte-identical digest reproduced both
deterministic defects. ⚑ **Digest stability cannot detect under-merge or a systematic miss.**

### 28.3 Consequences

- k=3 certification REOPENED. Fix 1 (cheap): primitive-reduce every cell before congruence dedup.
  Fix 2 (the real question): WHY did the scout never emit t3007's tiling — seed coverage, lattice
  pool, or a gate? Unexplained at write time; investigation is its own session.
- The oracle matcher graduates to a permanent verification gate (it found what three certifications
  missed). Thesis-quotable: per-tiling exact congruence vs an external catalogue ≫ count matching.
- Figure galleries for k=3 are gated until the catalogue is fixed (k=1/k=2 unaffected).

## 29. Both §28 defects root-caused and fixed: the emerging-VC naming bug + the primitivity assumption (2026-06-10, session 16e)

### 29.1 Missing t3007 — root cause: `SeedBuilder` mis-names surrounded emerging vertices

Probe chain (scripts/diag-t3007*.ts, run against the pinned oracle + live generators):
t3007's lattice is hexagonal, |u|=|v|=6.46 at 60°, well inside poolLmax=8.12 — **not** a pool/gate
truncation. Its vertex types are {3.3.4.12; 3.4.6.4; 3.12.12} (adjacent-triangle form), the
compatibility graph carries all three edges (the triple is even a clique), `findSeedSets(3)` emits
it — but `buildSeedsFromSet` returned **0 seeds** for every variant containing 3,3,4,12/3,3,12,4,
so the seed set vanished silently and the solver never saw t3007's types. (The only surviving
multiset variant, [3,12,12;3,4,3,12;3,4,6,4], pins the *separated*-triangle VC — a different vertex
type.) Inside the BFS: the faithful 3-cluster IS generated (601 of t3007's 3.3.4.12 vertices have
all three types as neighbors — the connected-cluster assumption holds here), but
`passesFinalVertexCheck` rejected it: the cluster's surrounded vertex (true cyclic figure
**3,3,4,12** — provably contains adjacent 3s, the two triangles share the edge to the B-center) was
named **3,4,3,12**. Cause: `getEmergingVCNameAtVertex` built `new VertexConfiguration(polygons)`
from the **seed.polygons FILTER order**, while `VertexConfiguration.getName()` canonicalizes only
over rotations of the list order, assuming cyclic angular order. Fix: sort the incident polygons by
centroid heading around the vertex first (the pattern `TilingChecker` already used). Measured
seed-list impact ({3,4,6,12}): k=1 14→14, k=2 40→40 (**k≤2 untouched**), k=3 **447→449** — restores
[3,12,12;3,3,12,4;3,4,6,4] (t3007) and [3,12,12;3,3,12,4;3,3,4,3,4] (no oracle tiling has those
types; it must still run for completeness). Regression: tests/seed-builder-emerging-vc.test.ts.

### 29.2 Duplicate — root cause: congruence dedup's bucket keys assume primitive cells

Reproduced end-to-end (scripts/diag-k3-duplicate.ts): the certified 18-tile det-8.928 cell and the
9-tile det-4.464 cell sit in different (name-multiset, |det Λ|) buckets, so `dedupeByCongruence`
keeps both; replicating the 18-tile cell and re-extracting yields a 9-tile cell exactly congruent
to the certified twin. A solver candidate lattice can be a proper **sublattice** of the tiling's
full translation lattice — the fill passes every gate but encodes the tiling as an index-2
supercell. Fix: new `primitiveReducedCell` (TilingCongruence.ts) — replicate 5×5, re-extract via
`TranslationalCellExtractor`, and accept ONLY under exact verification (Λ ⊆ Λ′ and every original
polygon an exact Λ′-translate of a reduced polygon — proves same infinite tiling); applied as a
pre-pass in `dedupeByCongruence`. Already-primitive cells return the SAME object — k≤2 catalogues
are byte-identical (their counts matched the oracle, so they carry no supercells). Regression:
tests/congruence-primitive.test.ts.

### 29.3 Consequences + flags

- **k=3 digest `eb34499d5fba3457` is SUPERSEDED** — with fixed code the same raw cells reduce
  61→60 distinct, and the 449-seed run should restore t3007 → expect 61 again with the *correct*
  membership. Full re-scout queued behind the in-flight CB-1 regression (8 workers since 10:26;
  that run uses pre-fix code and stays a valid CB-1 determinism check against the old digest).
- ⚑ **Old k=3 resume caches are INVALID**: `.scout-cache/k3_*.ndjson` keys results by seed INDEX
  only, and indices shifted (447→449). Always pass `fresh` after this fix; delete stale caches.
- ★ End-to-end acceptance PASSED (experiments/results/t3007-fix-verify-2026-06-10.log): the
  restored seed idx=378 solves (no cap) to exactly 1 cell, 21 tiles, **exactly `cellsCongruent` to
  the oracle's t3007** — in ~6 s. The control seed idx=401 (separated-triangle 3.4.3.12 variant)
  yields a non-congruent tiling, confirming the two VC variants pin different tilings. t3007 was
  never expensive — it was unreachable.
- ⚑ **Thesis flag (TA): the SeedBuilder paradigm's completeness rests on an UNPROVEN lemma** —
  "every k-uniform tiling contains a connected set of k vertices covering its k orbit types, one
  each." t3007 satisfies it (the bug was naming, not the paradigm), but a tiling whose types only
  connect through *repeated* intermediate vertices would have no buildable seed. Needs a proof or a
  fallback (e.g. allow >k-vertex clusters with repeated types). Related smaller risk, unverified:
  `computeCanonicalForm` layer-dedup keys on the (reflection-invariant) pairwise-distance profile —
  an incomplete congruence invariant; a collision between non-congruent partial clusters would
  silently drop one expansion branch.
- Probe scripts kept for reference: scripts/diag-t3007{,-compat,-seedbuild,-bfs,-finalcheck,-expand,
  -neighbors}.ts, scripts/diag-k3-duplicate.ts, scripts/diag-seedcount-impact.ts,
  scripts/verify-t3007-found.ts.

## 30. CB-2: Surd.sign semi-static error-bound filter — the 1e-6 float gate was provably wrong, now provably sound (2026-06-10, worktree feat branch)

(Numbered §30, not §24: this is written on a worktree branched at §23 while master is at §29 — sections
24–29 merge in from master.)

### 30.1 The defect (review CB-2, findings #5/#19)
`Surd.sign()` accepted the float sign whenever `|toFloat()| > 1e-6` — an **absolute** threshold with no
operand-height guard, on the decisive path (`cmp`, area comparisons, lattice predicates). Under
cancellation at coefficient heights ≳2³⁴ the float rounding noise (~ε·M, M the coefficient majorant)
exceeds 1e-6 while the true value can be arbitrarily smaller ⇒ wrong sign accepted. **Not hypothetical:**
the new fuzz test demonstrated it red — e.g. Pell-residual product
`(82450995619473798 + 58301658036173809√2 − 47603104448794160√3 − 33660478008806234√6)/1` → old
`sign() = −1`, exact sign `+1`. The thesis claim "every decisive test in exact arithmetic" did not hold
at this site.

### 30.2 The fix — semi-static forward-error filter
`sign()` now computes, sharing the same conversions, the float value `f` and the float majorant
`M = (|p|+|q|+|r|+|s|)/d`, and accepts the float sign **iff `|f| > 32·ε·M`** (ε = `Number.EPSILON`),
else falls through to `signExact()` (rational-interval ground truth). Derivation lives as a comment on
`C_SIGN` in `Surd.ts`, counted against the implemented expression: 5 bigint→Number conversions (relative
error ≤ u = ε/2 even above 2⁵³) + 3 correctly-rounded irrational constants (√3/√6 are now literals —
round-to-nearest by ES spec, asserted `=== Math.sqrt(·)` in the test) + 3 multiplications + 3 additions +
1 division = **15 first-order roundings** ⇒ `|f − v| ≤ γ₁₅·M_true ≈ 7.5ε·M_true`; M's own float error
(γ₈) absorbed by doubling → 15ε; next power of two with margin → **c = 32** (>4× the requirement). An
accepted float sign is therefore *provably* the true sign; nothing else changed (`toFloat` untouched,
still debug-only). Faster in the common case too: tiny-but-well-conditioned values (e.g. exact 1e-30)
no longer force `signExact`.

### 30.3 Verification
- **Fuzz regression** `tests/surd-sign-fuzz.test.ts`: 120 000 random Surds (heights 2⁸..2⁹⁶, random
  D > 0) + Pell residuals of √2/√3/√6 to ~2¹⁰⁰ (closed-form signs asserted independently) + mixed
  products/sums + `x.sub(x)` / `x.sub(x.add(10⁻³⁰))` + 2²⁰⁰⁰-height non-finite path; every case
  `sign() === signExact()`, and every filter-ACCEPTED case asserted against the oracle (soundness).
  Red on old code (2 adversarial suites failed), green on new.
- **Digests byte-identical** (the filter only re-routes ambiguity to ground truth): k=1
  `6f9ca9cf2d16c75f`/11, k=2 `f3e2e0517191362c`/20 (probe logs `experiments/results/cb2-probe-k{1,2}-2026-06-10.log`).
- `pnpm build` clean; full vitest 201/202 — the 1 failure (`dsym-generator`) is pre-existing at this
  branch point (verified by stash), fixed on master by §29.

## 31. k=3 RE-CERTIFIED per-tiling: 61/61 oracle bijection, t3007 present, duplicate gone — new digest 99919f42a7b58e76 (2026-06-10, session 16f)

The §28 defect is closed end-to-end. Full no-cap re-run on the committed fix (`8ef3a0b`:
SeedBuilder emerging-VC naming + congruence-dedup primitivity + CB-1/CB-3), under `caffeinate -i`
(the morning CB-1 regression died silently at 210/447 — sleep-killed workers the prime suspect;
that run is superseded and its log kept as record).

- **Run:** 449/449 seeds (was 447 — the fix adds the two t3007-multiset seeds), **0 timeouts**,
  362 raw cells → **61 congruence classes**, 2 h 20 m / 8 workers.
  **NEW k=3 digest: `99919f42a7b58e76`** (old `eb34499d5fba3457` INVALID — non-primitive
  duplicate + missing t3007, canceling). Log `experiments/results/k3-recert-2026-06-10.log`.
- **Pre-run gates:** build clean + 287/287 tests on the fix; k=1 digest byte-identical
  (`6f9ca9cf2d16c75f`/11) on the fixed code; stale k3 resume caches quarantined
  (`.scout-cache/invalid-pre-t3007-fix/`).
- **The decisive gate — per-tiling oracle match (`scripts/recert-oracle-match.ts`): ★ PASS.**
  All 61 oracle entries reconstructed exactly (0 errors) and congruence-matched against the new
  catalogue **bijectively**: 61/61 with exactly one match each, **t3007 matched**, 0 scout cells
  double-matched, 0 unmatched either side. Log `k3-recert-oracle-match-2026-06-10.log`.
  ⚑ Two traps for future matchers: oracle keys must be filtered `^t3\d{3}$` (the JSON also holds
  a 39-entry `t3uXXX` family), and `Cyclotomic.assertSameRing` compares ring INSTANCES — reuse
  the reconstruction module's ring, never `CyclotomicRing.create(24)` a second one.
- **Honest residue:** single-run digest (the digest is order-canonical and k≤2 reproduce
  byte-identically across runs and code changes, but a second confirming k=3 run has not been
  executed — cheap to queue if wanted). CB-1's old "byte-identical to eb34499d" acceptance is
  superseded by this re-certification, which is strictly stronger (per-tiling, not count).
- Count-matching alone hid this defect for five days. **Per-tiling match is now the k≤3
  certification bar** (certify-run/backfill/figure-snapshot digest anchors updated to
  `99919f42a7b58e76`).

## 32. CB-7 (primitivity-rejection guard) + CB-8 (pool-reach loud truncation) — the tuned regime is now self-announcing (2026-06-10, session 16f)

(Numbered §32 on merge: written as §31 on branch `fix/cb7-cb8-loud-truncation` concurrently with
§31 above — renumbered here, content unchanged.)

Work-orders CB-7 and CB-8 from `docs/review-2026-06-09/01-code-bugs.md`, on branch
`fix/cb7-cb8-loud-truncation` (base `8ef3a0b` on `feat/m2-realizer`). Both are **diagnostics-only**:
the kept-cell and pushed-lattice sets are exactly unchanged — verified by the k=1 probe digest
`6f9ca9cf2d16c75f` and the k=2 probe digest `f3e2e0517191362c` (both byte-identical, §32.3).

### 32.1 CB-8 — poolConfig centralization + regime banner + per-candidate reach checks

- **`poolConfig(k, aMax, provenMode)`** (exported, `PeriodSolver.ts`): the five candidate-stage
  bounds (`poolSteps`, `poolLmax`, `compactOffMax2`, `gridShortMax2`, `areaBoundF`) in ONE place,
  tuned regime side by side with the proven box (thm:weight `24k−1` steps; cor:box(ii) `24k·a_max`
  area; cor:box(iii) `(2/√3)·24k·a_max` reach). Tuned values byte-identical to the historical
  constants. `PROVEN_POOL=1` flips to the proven regime (the DG-1 switch; candidate cache key now
  carries the regime tag so the two never share entries).
- **Regime banner**: on any tuned run, once per `(k, a_max)` per process:
  `⚑ INCOMPLETE-REGION (tuned pool regime): poolSteps=… (proven …) … below proven box — run is
  oracle-anchored, not proof-anchored`. Provably cannot fire under `PROVEN_POOL=1`: `active ===
  proven`, so every strict `<` in `isTuned` is false (unit-test-pinned for k=1..6).
- **Per-candidate reach checks** (extending the pre-existing `gridReachTrunc` pattern): the compact
  off-grid cap (`roundCells` source) and the grid short-side cap (`gridAlignedCells` source) now
  count + report dropped pool vectors loudly; the oblique sub-pool sizing was already loud
  (`subpool-clipped`/`v-range-truncated`/`join-waived` via `onTruncate`, CB-3). ⚑ RESIDUAL,
  documented in-code: a solved grid long axis WITHIN `poolLmax` but absent from the pool is
  ambiguous (spurious vs step-count-truncated; ℤ[ζ₂₄] dense ⇒ length ≠ steps) and is covered only
  by the regime banner, not per-candidate.
- **WEAK_SPOT A1 correction**: `docs/WEAK_SPOT_AUDIT_2026-06-04.md` row A1 ("Logged?" = **silent**,
  🔴) is superseded — A1 is now **loud, regime-level** (the banner on every tuned run) **plus
  per-candidate where checkable** (compact cap, grid short cap, grid long reach, oblique causes).
  Its `PeriodSolver.ts:296-299` citation was already stale; the bounds now live in `poolConfig`.
  (A1's substance — the tuned bounds are oracle-fit, not proven — is unchanged; what changed is
  that no run can present itself as proof-anchored without the banner contradicting it.)

### 32.2 CB-7 — primitivity-rejection guard (+ two findings made along the way)

- `isPrimitive` now collects ALL rejection witnesses (same accept/reject verdict — a witness exists
  ⇔ non-primitive); on rejection, `supercellRejectionGuard` computes the primitive lattice Λ′ =
  ⟨Λ ∪ witnesses⟩ (`primitiveLatticeClosure`: exact `joinLattice` HNF folds) and checks membership
  in the seed's enumerated candidate set (pre-P0 `seen` keys, threaded through `FillCtx`). On a
  real miss: `⚑ INCOMPLETE-REGION (primitivity-rejection): certified supercell discarded; primitive
  lattice <key> not in candidate list`, per occurrence + `diag.primitivityGuardMisses`. Log-only;
  the supercell stays rejected (keeping it needs TA sign-off). Docstrings/comments at
  `isPrimitive`, the accept path, P0, P1, and `vertexClassCount` softened to the conditional form:
  sound provided stage 6 contains the primitive lattice — unconditional under cor:box, guarded
  under any tuned pool.
- **Finding 1 — `latticeKey` is NOT unique per lattice on tied minima.** First guard bring-up
  false-fired at k=1 on honeycomb supercells: the honeycomb primitive lattice keys differently as
  the `roundCells` candidate `(v, v·ω)` than as the witness closure. Cause: `gaussReduceExact` is
  canonical only up to ties (hexagonal = 3 tied shortest directions; rhombic/cmm = tied second
  minima), and `latticeKey` inherits the ambiguity. Fix CONFINED to the guard (touching
  `latticeKey` would change candidate dedup = digest risk): `latticeKeySet(a,b)` enumerates EVERY
  key the lattice can canonicalize to (all same-covolume signed pairs over
  {±r₁, ±r₂, ±(r₁+r₂), ±(r₁−r₂)} — exhaustive because any reduced-basis vector has coordinates in
  {0,±1}² over a reduced basis, and `gaussReduceExact` is a fixed point on its own outputs);
  membership = any key hits. ⚑ Side implication, recorded not fixed: the candidate `seen` dedup can
  hold the SAME lattice under two keys (sound — over-enumeration only, merged downstream by
  congruence; zero completeness risk).
- **Finding 2 — sub-multiset supercell completions are a benign, systematic miss class.** With
  tie-handling fixed, the guard still fired at k=2: pure-triangle (1-uniform) supercell completions
  certify inside multi-VC seeds (pre-gate), and their primitive lattice (unit triangular, area
  √3/2) is NOT a candidate there — `vcAreaSet` uses v ≥ 1 for EVERY VC, so sub-multiset areas are
  excluded by construction. That discard is provably harmless by the area filter's own
  Euler/incidence completeness contract: a tiling whose primitive area is outside the seed's
  admissible area set cannot carry the seed's orbit-VC multiset ⇒ it is another (smaller) seed's
  tiling. The guard therefore alarms only when the primitive area IS admissible and the lattice is
  still missing — the true silent-loss mode; suppression can never hide a real loss (a tiling with
  this seed's multiset has its primitive area in the set by the same contract). This is a
  DELIBERATE refinement over the literal spec ("emit per occurrence on miss"): without it every
  k≥2 run floods with false alarms and the ⚑ INCOMPLETE-REGION channel loses its meaning.
- **Result: zero primitivity-rejection events** across the full test suite, the k=1 probe, and the
  4,4,4,4 / 6,6,6 live-solve tests (which pin `supercellRejected > 0` with `misses = 0`). The
  guard firing anywhere remains a stop-and-investigate event.

### 32.3 Verification

- `pnpm build` clean (only the pre-existing turbopack workspace-root warning).
- `pnpm vitest run`: 301/302 — the 1 failure is `tests/dsym-generator.test.ts` k=2 δ≤16 timing out
  at its 5 s cap, **pre-existing on the clean base** (verified by stash; the in-flight k=3 cert run
  loads the machine). New `tests/pool-config.test.ts`: 15 tests (poolConfig tuned/proven/banner
  predicate; primitiveLatticeKey closure; latticeKeySet tie cases incl. the live honeycomb
  mismatch; two live-solve guard tests).
- k=1 probe digest `6f9ca9cf2d16c75f` count=11 and k=2 probe digest `f3e2e0517191362c` count=20 —
  both byte-identical; banner + reach lines on stderr. Logs:
  `experiments/results/cb7-cb8-probes-2026-06-10.log`.

## 33. Finding-2 SIGNED OFF by the TA + the three follow-ups landed (2026-06-10)

TA verdict on §32.2 Finding 2 (the guard's area-set miss suppression): **SOUND for the regular
family** — every link verified against the code, not the comments
(`../resources/research/cb7-finding2-signoff-2026-06-10.md`). The load-bearing link: `vcIncidences`
retains duplicate VC entries (plain `.map`, no merge) and seeds carry one entry per conjectured
orbit, so `vcAreaSet`'s `v ≤ 12` loop IS the per-orbit crystallographic bound — §12.8 not violated.

### 33.1 The scope rider — record verbatim, it bounds the thesis claim

**CB-7's protective claim is "pool-reach soundness, conditional on area-filter correctness" — NOT
"the candidate stage is guarded."** The suppression conditions on the same code-computed
`admissibleAreaKeys` the candidate stage filters by, so post-suppression the guard cannot detect a
`vcAreaSet` implementation bug (an under-generated area set drops the lattice AND suppresses the
alarm — correlated failure). Acceptable because (a) the TA verified the implementation against the
mathematical contract, (b) it is exact and cap-free for regular seeds, (c) k≤3 per-tiling oracle
bijection ×2 corroborates end-to-end. The incidental cross-seed flood-power Finding 2 removed is
covered by the CB-8 regime banner — the right channel for it. Standing inheritance unchanged: the
connected-k-cluster seed lemma (§29.3 ⚑) is NOT discharged by any of this.

### 33.2 Follow-ups landed (`fix/cb7-finding2-followups` @ `d433b95`, branched from master `0d6c96b`)

1. **`primitivityGuardAreaSuppressed` diag counter** (TA ask §3): suppressed-by-area was
   indistinguishable from suppressed-by-candidate-hit; the class is now countable — a jump is a
   cheap anomaly signal for the §33.1 correlated-failure mode.
2. **⚑ Star area-ladder truncation made loud** (TA ask §4): `PeriodSolver` star call site passed
   `onTruncate=undefined` — a silent `LADDER_SIZE_CAP` hit would under-generate
   `admissibleAreaKeys` AND let Finding-2 suppression mask the downstream alarm (the §33.1 mode
   made real). Now: ⚑ INCOMPLETE-REGION + `starLadderTruncated` (cache → diag) + the guard alarms
   UNCONDITIONALLY for truncated-ladder seeds. Rider: `areaLadderFromTiles`' initial
   below-bound check got the standard 1e-9 slack — the call site's `24k·a_max` travels a
   different float route (`regularArea` closed-form) than the ladder's `max(Surd.toFloat())`;
   an ULP gap would have fired the alarm spuriously once per star seed. Found by writing the
   test first; the failing case is pinned in `tests/lattice-enumerator.test.ts`.
3. **Stale `vcAreaSet` docstring fixed** (TA ⚑ in sign-off §1.2): "VCs with identical tile counts
   are merged" was false — no merge ever existed; the docstring now states the per-orbit
   semantics the sign-off rests on.

Digest-neutral by construction on regular seeds (counter = pure addition; bypass needs star +
truncation; slack changes only alarm timing at ULP equality). 57/57 tests, build clean. ⚑ k≤2
probe re-verification DEFERRED — the k=3 stability regression occupies the machine; run the probe
before merging the branch.

## 34. TH-2 work orders landed: the two F3 silent caps are now loud (2026-06-10)

The TA discharged TH-2 / C1 Part B — fill completeness is now `lem:fillreach`, a checkpoint-by-
checkpoint audit of `torusFill` under four named switches (F1)–(F4)
(`../resources/research/fill-completeness-lemma-TH2-2026-06-10.md`). The adversarial pass found
two REAL silent-truncation knobs — exactly the class the doctrine forbids — and handed CC two
work orders. Both landed on `fix/th2-f3-loud-caps` @ `b8fc197`.

### 34.1 F3b — `buildBlock`'s `min(60,·)` index cap, now asserted per candidate

The drop mode: for a sufficiently long-thin (anisotropic) reduced cell the clamped (m,n) range
under-builds the block → a covered vertex mis-classifies as OPEN → the no-progress test kills the
true continuation (a silent drop), AND a valid cell can fail the certificate's saturation leg.
The fix follows the lemma's option 1: `makeCtx` (the single ctx chokepoint, so the external-
certify path is covered too) asserts the worst-case requirement over every call site —
`blockIndexRangeNeeded(cellDiam, cellArea) = ⌈(2·cellDiam+10)·cellDiam/cellArea⌉+1 ≤ 60`
(certificate radius Rabs = cellDiam+8 dominates; the longer basis vector = cellDiam drives the
range) — and on violation emits ⚑ INCOMPLETE-REGION + sets `ctx.blockIndexCapBinds`, counted as
`diag.blockIndexCapTruncated` per candidate lattice. The cap itself stays (a runaway backstop) —
it is no longer silent. TA-measured worst requirement over the certified catalogues: 16/19/23 at
k=1/2/3 vs 60 ⇒ the guard never fires on the certified record (verified: probe flags silent).
**Non-zero `blockIndexCapTruncated` anywhere voids a completeness claim for that run** — sweep
acceptance must assert it 0, same as `timedOut`.

### 34.2 F3a — `maxCellPolys` default raised to `max(20k+24, 24k)`

`F ≤ 2|V(Q)| ≤ 24k` (torus Euler) is the proven per-cell tile bound; the old default `20k+24`
undersizes it from k=7 and the pop-site discard (`reps.length > maxCellPolys → continue`) is
silent. New default `defaultMaxCellPolys(k) = max(20k+24, 24k)` — identical for k ≤ 6 (the
acceptance range), so the certified record is untouched by construction; from k=7 the cap sits at
the proven bound and can never bind on a true tiling. An EXPLICIT `opts.maxCellPolys < 24k` now
flags ⚑ INCOMPLETE-REGION at solve start (no current caller passes one). F3c (the 45 s wall-clock
knob) needed no change — `diag.timedOut` is already per-run surfaced and sweep acceptance asserts
it (the k=3 recert did).

### 34.3 Acceptance

`blockIndexRangeNeeded` + `defaultMaxCellPolys` + `BLOCK_INDEX_CAP` exported; 4 new tests
(boundary k=6 = 144 unchanged, k=7 168 > old 164; unit-square range 13, long-thin 91 > 60) —
written first, red, then green. Full `period-solver.test.ts` 19/19, build clean. k≤2 probe
byte-identity vs `6f9ca9cf2d16c75f`/11 + `f3e2e0517191362c`/20:
`experiments/results/th2-f3-loud-caps-probes-b8fc197-2026-06-10.log`.

## 35. Review batch CB-5 + CB-4 + CB-6 — and the CB-4 guard's first catch: `reducedClassKey` was not class-canonical (2026-06-10, session 17, branch `fix/cb5-cb4-cb6`)

The last three open code items of the 2026-06-09 review (work-order `docs/review-2026-06-09/01-code-bugs.md`),
in NEXT order CB-5 → CB-4 → CB-6, each TDD'd and committed separately. Then the new CB-4 guard fired on its
FIRST contact with real data and exposed a latent completeness defect in the congruence dedup — diagnosed,
root-caused, and fixed in the same session (§35.2–35.3).

### 35.1 The three work-order items

- **CB-5 (`983b8e3`)** — `KUniformityChecker` now **throws** on any N≠24 ring instead of silently
  un-gating (on N≠24 the hardcoded full-surround `=== 24` could never fire → reps empty → gate
  returns null → caller KEEPS everything — a silent "all and only" violation). Magic 24 replaced by
  `FULL_TURN_UNITS = N` (asserted === 24) — one site for a future N-generalization; module grepped
  clean of other literal-24 angle assumptions. TDD: N=12 square cell throws, N=24 control gates 1 orbit.
- **CB-4 (`942da53`)** — two standing verification layers for the merge step. (1)
  `assertEquivalencePartition`, cherry-picked **surgically** from `feat/c4-pool-bypass` (the branch
  predates §29 — a merge would have clobbered `primitiveReducedCell`; ported function + call site +
  tests only): every dedup bucket's partition is asserted to be a genuine equivalence relation
  (reflexivity, argument-order symmetry, transitivity-vs-classes), always-on, throw-loud;
  `PS_MERGECHECK=full` adds reversed-input order-invariance. (2) `CongruenceDifferential.ts` — the
  §19.6 one-shot exact re-implementation (never committed; reconstructed from its design notes)
  promoted to a **standing differential oracle**, import-disjoint from `TilingCongruence.ts`: ONE
  map function for pin and cell-set, self-built keys, exact Surd-floor fundamental-domain reduction.
  `diffPartitionAgainstIndependent` re-checks every merge decision (member ~ rep) and every split
  (rep ≁ rep over ALL pairs, so production bucket-key bugs are also caught); wired into
  `recert-oracle-match.ts` with zero-mismatch required. `congruencePartition` exported (additive);
  `dedupeByCongruence` rebuilt on it byte-identically.
- **CB-6 (`46b0f79`)** — `properOverlapWithBlock`'s centroid cull constant 2.5 was geometrically
  FALSE for 8/12-gons (12-gon R ≈ 1.932 ⇒ pairs overlap to ≈ 3.86; octagon ≈ 2.61): real overlaps at
  distance 2.5–3.86 were admitted into the DFS and died only downstream — dead subtrees on exactly
  the 8/12-gon-heavy k=4 fills (§22). Now `circum(P) + ctx.maxCircum (+1e-9)` — the true
  R₁+R₂ overlap-impossibility radius, sound for every pair, tighter for small tiles. Emitted set
  provably unchanged (the certificate backstop killed those fills anyway); k=4 timeout-budget
  re-measure deferred to OP-9 (owns the protocol).

### 35.2 ★ The guard's first catch — `cong(a,b) ≠ cong(b,a)` on the k=3 artifact

Running the upgraded recert harness on the live k=3 artifact (362 raw cells), the partition aborted:
`⚑ IMPLEMENTATION-BUG: merge relation is not an equivalence (symmetry) in bucket
3,3,3,3,3,3,3,3,3,3,3,3,6,6@0,0,6,0,1` (12×3 + 2×6, |det Λ| = 6√3 — snub-class, skewed oblique bases).
Diagnosis (`scripts/diag-cb4-asymmetry.ts`; logs `diag-cb4-asymmetry-2026-06-10-*.log`):

- Exactly **one asymmetric pair** in the 18-cell bucket; the independent differential says
  **congruent both ways** — the false direction was a FALSE NEGATIVE in `tilingsCongruent`.
- Instrumented candidate loop: in the failing direction all 24 pin+lattice-passing candidates miss
  the reduced-key-set by ≥1 key — the **cell-set verification step** was the failure site.
- Root cause: `reducedClassKey`'s float-guessed ±2-window lex-min reduction **violates its own
  class-invariance claim** ("same key for every member of a class") on skewed bases — 7/140 and
  4/140 violations under plain lattice translates of the two cells' own polygons. Window/`lim`
  artifacts pick different representatives for members of one class ⇒ direction-dependent false
  negatives. A concrete violating instance was extracted verbatim (basis u = 2ζ⁴, v = −6+3ζ⁴;
  triangle anchored −1−5ζ⁴, dirs 0/8/16; λ = v) and pinned as the RED regression test.
- **Why the certified 61 survived:** the two cells merged into one class via a third
  representative (production tests `cong(c, members[0])` only), so the partition — oracle-bijection
  -verified ×2 — was correct; the *predicate* was unreliable. Same axis as §19.6: completeness of
  the merge, never soundness (keys are exact geometry; distinct classes cannot collide ⇒ no false
  positives possible from this site). The guard exists precisely to remove the dependence on this
  kind of luck, and it did so on first contact.

### 35.3 The fix (`c802989`): exact fundamental-domain reduction

`reducedClassKey` now translates `p` so its centroid's **exact** basis coordinates (α, β) — Surd
Cramer, values in ℚ(√2,√3) — land in [0,1)² (representative = p − ⌊α⌋u − ⌊β⌋v, exact `surdFloor`).
Class-canonical *by construction*: lattice translates shift (α, β) by integers, which cancel in the
floor. This simultaneously (a) closes the §35.2 defect class entirely, (b) **removes a float
decision from a decisive path** (the old `Math.round` guess + float `lim` cutoff chose which
translates were even considered — thesis exactness doctrine), and (c) replaces ≤25 clone+exactKey
window probes per polygon with 2 Surd divisions (cheaper).

### 35.4 Acceptance evidence (all in `experiments/results/`)

- k≤2 probes **byte-identical twice** — after CB-5+4+6 (`cb456-probes-46b0f79`) and after the §35
  fix (`cb456-probes-c802989`): k1 = `6f9ca9cf2d16c75f`/11, k2 = `f3e2e0517191362c`/20, 0 timeouts.
  (Expected: k≤2 classes are theorem-certified distinct, so the strictly-more-complete reduction
  cannot introduce merges there. Verified, not assumed.)
- Full suite **327/327** green (incl. 16 new tests across the batch); build clean.
- Post-fix diag: **0 asymmetric pairs** in the offending bucket.
- Recert + differential (`k3-recert-oracle-match-...-18-22.log`): **★ PASS** — partition 61, guard
  silent, **differential 301 merges + 1830 splits re-checked, 0 mismatches**, 61/61 per-tiling
  oracle bijection, t3007 present, no duplicates.
- ⚑ **Outstanding batch acceptance:** a fresh no-cap k=3 sweep must reproduce
  `99919f42a7b58e76`/61 byte-identical (CB-6 + §35 both touch decisive paths; the artifact-level
  evidence above says the partition is unchanged, and CB-6 only rejects certificate-dead
  placements — but the sweep is the standard, machine-occupying gate; schedule with AL as before).
- ⚑ **TA flag (thesis):** the §19.6/2c8ad69 congruence-dedup narrative gains a sibling caveat — the
  cell-set verification step contained a float-window reduction that was not class-canonical
  (completeness, never soundness; caught by the CB-4 guard, fixed exact same-day). The "exact
  congruence test" wording is now *more* true: one more float decision is gone from the decisive
  path. The §35.2 mechanism (merge-through-lucky-representative) is exactly the fragility class the
  thesis can now claim is guarded against by construction (equivalence guard + standing differential).
## 36. ST-2 / ST-3(1+3) / ST-9 star work orders landed — the Myers-2009 k=2 oracle, the honest run-matrix, and the first productive star-fill coverage (2026-06-10, session 17)

Work orders from `docs/review-2026-06-09/05-star-and-new-directions.md`, the three CC items marked
unblocked-now. Branch `feat/st-star-work-orders`. Digest gates: build clean, k≤2 probes
**byte-identical** (`6f9ca9cf2d16c75f`/11, `f3e2e0517191362c`/20, 0 timeouts), suite green (the one
`dsym-generator` fail was the known load-flake; passed on rerun).

### 36.1 ST-3 steps 1+3 — the Myers-2009 k=2 star oracle, machine-readable + pinned

`experiments/star-oracle/myers-2009-k2.json`: all **43 records** (38 tilings + 5 one-parameter
families, Figs 25-28/32) transcribed from the PDF figure captions into the StarVC token syntax
(⚑ dent tokens carry the INTERIOR reflex angle `u`, α = 24−24/n−u — the syntax the solver names by,
not Myers's subscript). Every orbit angle-checked to Σ=2π at transcription time; the loader test
(`tests/star-oracle-myers2009.test.ts`, 10 tests) re-derives everything in exact rational+symbolic
arithmetic: angle sums (families included, Σa-coeff=0), dent/point↔declared-α consistency, in-ring
reclassification from tokens (**34 in-ring tilings**; out-of-ring = Figs 18/19/22/23, all 9-/18-fold
or π/9-multiples — the ST-5 ring boundary), and the three **regression pins Figs 36/40/42** (in-ring,
one purely-regular orbit: `3⁶`, `4.8.8`, `4.4.4.4`) — asserted NOT enumerable by the k=1 StarVC
enumerator, i.e. the falsifiers for the unscoped Myers prune (iii) "every vertex carries ≥1 star
point" (k=1-only; rescope = TH-5). **Findings while transcribing:** (a) Fig 43
`(4.4.8*π/4.4.8*π/4; 4.4.4.4)` ALSO has a purely-regular orbit — omitted from the work-order's
"Figs 36, 38-42" list; recorded in the JSON + pinned in the test inventory. (b) The five k=2
families falsify the roadmap-§4 conjecture as stated — recorded in the JSON `_meta.observations`;
the roadmap edit itself is AL's call, TA records (step 4 untouched). ⚑ **TA spot-check of the
transcription against the PDF captions is pending** — it is the oracle; asked in SYNC.

### 36.2 ST-9 — productive star-fill finally has positive coverage (and what it took)

The work order's premise verified: both certified star tilings close from their fans with zero fill.
- **The spec'd strict 4(j) sub-fan dies upstream by construction** — `allowed` is built from seed
  polygons incident to each declared vertex, so a partial fan names the partial VC `4*p@3,8` and the
  true closed VC is never allowed; every branch contradicts (measured: 0 cells, 204/926/1092
  lattices across pool configs, no timeout — `experiments/results/st9-fill-probe-0291e83-*.log`).
  Stronger: for 4(j) ANY gate-passing seed contains the full closing fan ⇒ zero fill — no 4(j) seed
  can exercise productive star-fill, period.
- **The unique fill-requiring in-ring Fig-4 tiling is 4(i) `8.3*π/12.8.6*5π/12`** (dent/corner
  bookkeeping over the TA scoping note's 13: per species, stars/cell = pt-tokens·V/n vs the fan's
  pt-tokens; only 4(i) has a strict excess — V=6 ⇒ cell {3 oct (3 orientation classes), 2× 3*@1,
  1× 6*@5}, fan supplies one star per species). A first blind probe scan missed it: the
  `--single-star` heuristic excludes 4(i) (two species) — cap bias in action.
- **⚑ 4(i) is OUTSIDE the tuned k=1 pool (measured)**: its hexagonal basis is off-grid with
  ℓ≈5.05 (ℓ²≈25.5 > compactOffMax2=16) and needs ~8 edge-steps (> poolSteps=6). 0 cells under the
  tuned pool, INCOMPLETE-REGION loud. **Consequence for §24/ST-2: the tuned-pool dentreg sweep's
  ceiling is 12/13 Fig-4 tilings** — the scout now says so on any Fig-4 miss, and the hard-fail
  branch additionally requires an empty truncation summary (which the tuned pool never produces).
- **Widen-only pool override** (`POOL_STEPS_UP`/`POOL_LMAX_UP` env, `poolConfig`): Math.max against
  the tuned floor, proven box as ceiling, candidate-cache key suffixed when active, **default off ⇒
  byte-identical** (probes re-run green). A wider pool only ADDS candidates — each still fully
  certified downstream — so emitted cells stay certified-correct. NOT a sweep knob (the ST-2 ruling
  "no star poolLmax increase before Increment 3" stands for the sweep; this is a single-seed test
  opt-in). Measured boundary: steps 8 + Lmax 5.7 (caps 32.5) solves 4(i) in 104 s; Lmax 8 (caps 64)
  OOMs `gridAlignedCells` even at 12 GB heap.
- **The positive test** `tests/star-fill-positive.test.ts`: 4(i) certifies with **cellStars=3 >
  fanStars=2** — the second `3*@1` is fill-CONSTRUCTED by the C3 palette; composition + exact
  |det Λ| = 6+3√2+4√3+2√6 pinned; the cell passes the independent G1-G4 gate (factored to
  `scripts/_starCellGate.ts` from the §23 harness, which keeps its own copy as evidence) and
  KUniformityChecker says orbits=1. ⚑ HEAVY (~2-4 min idle; budgets sized for load).
- **4(p) G1-G4 (step 3)**: one-call addition to `spike-star-4p.ts` — PASSED all four (0 overlaps,
  17 real vertices + 16 dent-fills all at 2π, exact area = |det Λ|, 0 unmatched edges), orbits=1.

### 36.3 ST-2 — the run-matrix, the truncation summary, and the vocabulary

`scout-star-inring.ts` header rewritten (run-matrix per config; "fully-sound run" dropped for the
no-flag config), prints its scope row at startup ("Fig-3 out of scope (6*@6 not expected)" on any
no-dents run), splits the oracle into the **Fig-4 hard set** vs **Fig-3(f) best-effort** (`6*@6`),
aggregates `INCOMPLETE-REGION` per cause (first line verbatim, repeats swallowed, one Σ line per
cause at exit — the millions-line flood is gone, nothing silent), and closes with the
certified-correct/certified-complete vocabulary verdict. §24 retitled + §24.7/§24.9 ST-2-annotated +
**§24.10** added (the run-matrix table + vocabulary, the binding text). Contracts reconciliation
beyond CC's files (the resources/ contract wording) is TA's — asked in SYNC.

### 36.4 Acceptance log

- build ✓; `pnpm tsc --noEmit` ✓; k=1 probe `6f9ca9cf2d16c75f`/11 ✓; k=2 probe `f3e2e0517191362c`/20 ✓
  (0 timeouts both) — the `poolConfig`/cache-key edit is digest-neutral.
- oracle loader 10/10 ✓; suite 324/325 with the known dsym load-flake (rerun ✓).
- ST-9 positive test: passes in isolation; first combined run hit the 600 s maxMs under full-suite
  contention → budgets raised to 1200 s (a timeout there is a flake, not a finding).
- Mutation check (work-order acceptance): recorded below at §36.5 after execution.

### 36.5 Mutation check — executed and recorded (work-order acceptance)

`PeriodSolver.torusFill`'s C3 palette line (`for (const st of ctx.starTiles)
place(ExactStarPolygon.isotoxal(…))`) commented out → `tests/star-fill-positive.test.ts` FAILS at
exactly the intended assertion (`expected 0 to be greater than or equal to 1` — 4(i) emits 0 cells,
80 s, no timeout); line restored → 2/2 pass (101 s quiet-machine run). The 4(j)/4(p) full-fan
certifications would survive the same mutation (they close with zero fill) — this test is the ONLY
positive coverage of productive star-fill, which was the ST-9 point. (Vitest gotcha for the record:
`-t` is a regex — `-t "certifies 4(i)"` matches nothing because of the parens; filter on a
paren-free substring.)
## 37. TH-4 d_max + TH-13 γ-feasibility tables — the star lane's CC constants landed (2026-06-10)

The two CC-side finite exact computations the star lane was waiting on
(`docs/review-2026-06-09/03-theory-obligations.md` TH-4/TH-13; TA's TH-3 note "CC follow-ups").
Branch `feat/th4-th13-star-tables` off master `0291e83`; spec
`docs/superpowers/specs/2026-06-10-th4-th13-star-tables-design.md`. ⚑ **Neither TH-4 nor TH-13
is discharged by these tables** — they are the constants/scoping INPUT to TA's restated transfer
lemma (TH-4) and lemma-or-scope-cut (TH-13).

### 37.1 The prune-(iii) trap, second bite

TH-4 exists because Remark 3 asserted d ≤ 6 from a convex-regular premise. The first
implementation sketch nearly repeated the sin one level down: `StarVC.ts:134` applies Myers
prune (iii) (≥1 star point — **uniformity-only**, see TH-5) unconditionally, `includeDents`
does not bypass it, so a d_max read off `enumerateStarVCs` alone would silently rest on (iii)
at the Fig-3 column (dent-no-point VCs like [4*d@16, 3, 3] are admissible k≥2 vertices but
never enumerated). Resolution (AL review): **Route 2** — an independent multiset engine
(`StarDmaxRoute2.ts`, ZERO StarVC imports, alphabet from the P3 formulas, no lower bound on
points anywhere) publishes the numbers; **Route 1** (the live enumerator + computed point-free
fold-backs) is the per-cell agreement gate. Fold-back case split (exhaustive: every
(i)/(ii)-admissible vertex is point-carrying | pure-regular | dent-no-point):
pure-regular ≤ 6 (corners ≥ 4u); dent-no-point: β ≥ 13 ⇒ ≤ 11u left ⇒ ≤ 2 regulars ⇒ t ≤ 3.
Both are *computed per alphabet*, not asserted — the hard-coded 3 would phantom-floor empty
=1-dent strata (F(12,1) → 0) and fail the gate; the ≤ 3 lemma is enforced as a loud throw.

### 37.2 Premises stated, not inherited

P1 (≤1 dent): two reflex corners (β > 12u) sum > 2π. P2 (no adjacent points): isotoxal edges
run point→dent, so two adjacent points at v put a dent of each star at the shared edge's far
endpoint — > 2π by P1. Both k-independent; (iii) used nowhere. P3 (scope, inherited NOT
derived): n ∈ {3,4,6,8,12}, 0 < α < 12(n−2)/n. P4: degree = t over t≥3 true vertices.
Strata: Fig-4 (0 dents) | Fig-3(=1) (the TH-3 Γ⋆ stratum) | Fig-3(≤1) ≡ max of the two
(identity, checked per row).

### 37.3 Results (log `experiments/results/th4-star-dmax-be943b9-2026-06-10.log`, 7.5s, exit 0)

**d_max(in-ring envelope) = 9 exact, all strata** (witness 4×3*p@1 + 5 triangles; t=10 needs
≥ 25u) **⇒ δ ≤ 2k·d_max = 18k** (vs crude guess ≈11 ⇒ 22k; regular 12k is false for stars)
and **F ≤ (d_max/2 − 1)·12k = 42k** for cor:starbox(i). Fig-3(=1) envelope = 6 (β=13 + 3 pts
+ 2 triangles); ⚑ dent-reg-19 envelope's =1 stratum = **5**, not 6 — the β=13 dent is 3*d@13
from 3*@3, which the dent-reg filter excludes. Per-family: 𝓕(n,1) = 9, 𝓕(n,2) = 8, others 6;
=1-dent stratum ranges 0/3/4/5 (empty e.g. for all 𝓕(12,α) with α ∉ {6,8}). regular-only
recovers 6. Pinned in `tests/star-vc.test.ts` (engine recomputed, not copied constants);
agreement on the 33 cheap rows in CI, envelope rows agreement-checked by the script run (the
committed log is the artifact — enumerator cost).

### 37.4 TH-13 table (log `experiments/results/th13-dentfill-table-9f77e32-2026-06-10.log`)

Verdicts partition the 32: **19 REGULAR-FILLABLE** (== `dentRegularFillableVariants`, set
equality checked) / **8 POINT-ONLY** (γ ∈ {3,5,7}; star-point-fillable in the MIXED universe
only — dropped by today's filter, the real TH-13 risk class) / **5 UNFILLABLE** (γ=11 =
{3*@3, 4*@5, 6*@7, 8*@8, 12*@9}: no single corner matches — provably Fig-4-absent, *sharper*
than the filter's "solver rejects extras"). Dent-by-dent fill impossible (γ < 12 < β′).
**Rider:** same-family point-fill is arithmetically impossible (γ = α + 24/n ≠ α) ⇒ the
regular-filler hypothesis (TH-3's sharp tier) holds **unconditionally for single-variant
in-ring tilings**; gear chains require ≥ 2 distinct variants. Gear column (lem:dentchain rung
1): chains through γ′=11 fillers terminate immediately; the open gear-train candidates are
the 'point'-class continuations (e.g. 12*@1 → 12*@3 → γ′=5 point).

### 37.5 Honest flags

(a) ⚑ TH-4 discharged only when TA re-proves the flag-count transfer with d_max = 9; TH-13
needs TA's local exclusion on the 8 POINT-ONLY rows or the unfiltered sound-run fallback
(deferred with AL: contingent on TA's verdict + machine availability). (b) ⚑ P3 scope
sentinel: the variant-set-equality test catches StarVC alphabet drift, NOT a deliberate scope
widening (n=24, off-ring α) — then every constant must be recomputed. (c) Route 2's pigeonhole
form of (ii) (#points ≤ ⌊t/2⌋ ⟺ non-adjacent cyclic arrangement) is guarded by the per-cell
route agreement. (d) Fig-3 class remains best-effort in the solver; nothing decisive changed —
`StarVC.ts`/scout untouched, regular digests untouched trivially, build clean, 23/23 tests.
## 38. OP-1 / OP-2 / OP-3 — the three sound levers, the t3019 false-negative incident, the OP-9 Σ-vs-distinct table, and the F3b discharge (2026-06-11, worktree `feat/op123-sound-levers`)

**Frame.** The review's `04-optimizations.md` mandates the optimisations in the strict order OP-1 →
OP-2 → OP-3 (each must land and be accepted before the next). All work on a worktree branched off
master `0291e83`. The acceptance instrument is held fixed across the whole sequence: the three k≤2
byte-identity digests (`6f9ca9cf…`/11, `f3e2e051…`/20 — these never move) plus the k=3 per-tiling
oracle BIJECTION (61/61, t3007 present, 0 duplicates, 0 orphans). A digest may be *re-baselined* only
when the bijection licenses it — never a silent swap. Per-OP digest discipline: prove k≤2
byte-identical, then run a fresh 449/449 k=3 sweep with 0 timeouts and re-run the bijection.

**OP-1 (prop:typeprune P2 + the V<k gate short-circuit; `62e2434`→`b49f105`).** Two-sided
closed-cell type-support filter: a certified torus cell whose occurring VC-type set is a strict
subset of the seed's allowed set cannot realise this seed's orbit-VC multiset (it is another seed's
tiling), so it is discarded pre-primitivity; and V<k ⇒ orbits ≤ V < k ⇒ the k-gate would reject, so
the 7×7 exact symmetry search is skipped. k≤2 came back BYTE-IDENTICAL — REASON: no strict-subset-
support cell passes the k-gate at k≤2, so the filter has nothing to remove there. The witness at k=3
is `[3,3,3,3,3,3;3,3,6,6]`: `supercellRejected` 29→2, `p2Skipped`=27, emitted cells unchanged.
k=3 re-baselined `99919f42a7b58e76`→`b5c622070cff8b4` — raw cells 362→302, a cross-seed
duplicate-CERTIFICATION cut (the same congruence class certified under several seeds), 61/61 bijection
intact (the P2 removals were redundant emissions, not tilings).

**★ The t3019 incident (the centerpiece — thesis-relevant).** OP-1's first recert FAILED: 60/61
bijective + 1 orphan, t3019 reporting 0 congruent scout classes. Root cause was NOT OP-1 — it was a
SECOND `reducedClassKey` float-tie false NEGATIVE in `tilingsCongruent` (the first was fixed in
`2c8ad69`). `Math.round` ties on the half-integer centroid coordinates of skinny lattices: t3019's
cell is 1:4.73 (long-thin), float noise ~4e-16 straddles the rounding boundary and splits ONE
congruence class across two distinct "canonical" keys. The master baseline's 61/61 had been
ORDER-LUCKY — the emitted representative happened to be matcher-friendly. OP-1's P2 SOUNDLY removed
exactly that matcher-friendly duplicate emission, exposing the latent bug. NO TILING WAS LOST: the
orphan IS t3019, exact-isometry-verified (a pure translation). **FAILED IDEA recorded:** the first
remediation R2 — "accept if ANY surviving class member is `cellsCongruent` to the oracle" — was
insufficient, because for t3019 ALL surviving members are false-negative-prone (the investigation log
predicted this; R2 still missed). The working fix is an independent exact grid-isometry witness
fallback inside the recert INSTRUMENT (every accept carries an exact proof; loud ⚑ per use). It was
used exactly 1× at k=3 = t3019 (member 0 of class 31, all 3 members `cellsCongruent`-false).
Investigation committed (`experiments/results/op1-t3019-investigation-2026-06-11.log`, `f07b02c`).

**R1 — RESOLVED (`1aa1c84`, AL directed it implemented in-lane).** `reducedClassKey` no longer rounds
the centroid into the fundamental cell with float `Math.round` + a lex-min ±2 window. It reduces the
EXACT `(u,v)`-coordinates — α = `detSurd(c,v)/detSurd(u,v)`, β = `detSurd(u,c)/detSurd(u,v)` (cross
products as exact Surds) — with shift-equivariant half-up rounding (`roundHalfUpExact`: float-guess +
exact `Surd.cmp` correction). For `p+λ` the coordinates shift by exact integers, so the rounding
shifts identically and the reduced representative is the byte-identical exact polygon for every member
of a lattice class (ties included) — class invariance is now EXACT, not a contingent window
heuristic; the window (and its second float-tie point, the `lim` filter) is gone. Why it is
digest-neutral: a false-negative-only fix can only MERGE classes the old code wrongly split, and the
certified partitions were already minimal-correct (k≤2: 11/20; k=3 scout: 61, oracle-bijective), so
the partition — hence every composition digest — is unchanged. Measured: k≤2 probes byte-identical
(`6f9ca9cf2d16c75f`/11, `f3e2e0517191362c`/20); k=3 recert 61/61 per-tiling bijection with the
exact-witness fallback now DORMANT (0 uses, was 1 — the fast path recognizes t3019). New
class-invariance regression tests are mutation-verified (the old float body fails them); the frozen
t3019 fixture flipped red→green. Adversarial review: no blocking findings. The recert exact-witness
fallback is retained as a standing differential check (now expected dormant). CB-4's
`assertEquivalencePartition` guard touches a disjoint part of `TilingCongruence` — no conflict.

**OP-2 (honest scope).** The review's headline OP-2 — branch-enumeration memoization — is an
ORBIFOLD-lane construct; master's live path is the torus solver, which has no branch enumeration to
memoize. Recorded as DEFERRED-WITH-REASON, not done. What DID land: (a) census instrumentation
(`PS_LATTICE_CENSUS=1` + `scripts/lattice-census.ts`); (b) candidate-stage cache counters; (c) a
pool-lookup layer — DISCLOSED as redundant with `LatticeEnumerator`'s own internal memoization, kept
only to feed the counters. ⚑ The census's canonical key is `min(latticeKeySet)` over the orbit's
member keys — NOT a single `latticeKey`, because a single key SPLITS tied-minima hex lattices (measured
at k=1: holohedry-12 distinct 26→18, multiplicity 1.7×→2.5× once the split is healed). k=3 sweep
@`fa25672` (pinned, pre-OP-3) digest BYTE-IDENTICAL `b5c622070cff8b4`/61 ⇒ OP-2 is digest-neutral.

**★ THE OP-9 TABLE ({3,4,6,12}, canonical keys, pre-OP-3 — `op2-k3-census-table-2026-06-11.log`):**
oblique (hol=2) Σ=127746 vs 7362 distinct = 17.4× (this is `NOTES:1443/1522`'s ~17× redundancy now
MEASURED on one family in one run); hol=4 30.1×, hol=8 17.8×, hol=12 56.8×; ALL 189359/9210 = 20.6×.
"Never publish a Σ without its distinct companion" is now tooling. ⚑ The aggregator's "265 duplicate
seed entries" warning is a NAME-collision FALSE POSITIVE: 449 solve-calls span only 184 distinct
display names (names are non-unique across concrete seeds). The warning text was rewritten (M1) to be
self-explaining; the Σ/multiplicity figures are per-solve-call and correct.

**OP-3 stage 1 (`87c66d9`/`48ff7dd`/`a3dcc27`/`3535fca`).** Oblique-ONLY grid-orbit candidate
reduction per `lem:orbitdedup`, honouring all three `rem:orbitdedup` constraints: (1) exact
`sameLattice` grouping (no float); (2) g⁻¹ seeding of EXACTLY the members that were enumerated, so
the fill coverage is CONSERVED — raw cells stayed 302 across all three sweeps; (3) an orbit-aware CB-7
guard. The apparent TH-9-vs-OP-3 acceptance contradiction (byte-identical k≤2 vs a k=3 re-baseline)
is RESOLVED by the oblique-only staging: k≤2 has 0 oblique tilings, so it is provably immune to a
reduction that touches only hol=2. The reflective acceptance gate (AL's blocking amendment): ⚑
single-vertex fans are ACHIRAL, so a dropped conjugation is fill-INVISIBLE on them — the gate therefore
uses a CHIRAL two-fan core; 3 simulated bug modes all fail loudly
(`tests/op3-reflective-gate.test.ts`). k=3 re-baselined `11ee1b1d582811d1`/61, 61/61 bijection
(hardened recert, exact-witness used 1× = t3019, R1 still unchanged). Census post-reduction: oblique
Σ 127746→10662 (12.0× setup-work-item cut; distinct 7362→620 representatives, ~11.9 avg orbit). Wall
6753→6124s (~9%) — MODEST, exactly as AL pinned: fills are CONSERVED, so the deliverable is the OP-9
reconciliation basis, NOT a speedup.

**F3b story.** The 2026-06-10/11 pre-OP-3 sweeps fired 76 `⚑ block index cap (63 > 60)` banners = 4
skew-BASIS oblique lattices × 19 seeds. ⚑ `blockIndexRangeNeeded` is BASIS-dependent, NOT a lattice
invariant — a false G-invariance claim stood in `scripts/f3b-cap-census.ts` (only |det| is preserved
by grid isometries; cellDiam depends on the stored basis), caught in review and corrected (header +
the runtime verdict strings). Post-OP-3 banners = 0: those 4 skew bases now ride orbit representatives
whose ranges are ≤60 — a consequence of enumeration ORDER, NOT a theorem, so the F3b assertion remains
the loud guard. **FAILED IDEA:** a proof-grade A/B discharge (stock cap 60 vs raised cap 128 on the
affected seeds) was ABANDONED as impractical — the 19 affected seeds are the pathological
3³.4²-family at ~1.5h each, so ×19×2 ≈ 50h; the stock leg got through 13/19 and the raised leg 0/19
before the call. F3b was discharged instead by (a) census = 0 affected post-OP-3 and (b) the 61/61
oracle bijection on the certified artifact (ground truth, cap-independent). Evidence: `f3b-*.log`,
`cf1908e`.

**⚑ Two TA-flagged k≥4 caveats (from the whole-branch review — NULL at k≤3, live preconditions above):**

- **(I1) the orbit-aware CB-7 guard over-reaches.** Its ∃g∈G membership sweep checks all ≤2N images
  of the closure, which is BROADER than the member-conservation discharge strictly licenses:
  `rem:orbitdedup` constraint 3 presupposes blanket seeding, but under conservation the sharp test is
  `m(closure)` for the CURRENT seed map only. Empirically NULL at k=3 — CB-7 alarms = exactly 100 on
  the pre-branch baseline AND on all three branch sweeps. Refinement if ever needed: thread the seed
  map into `FillCtx`, alarm on `m(closure)`, and count all-G hits separately.
- **(I2) prop:typeprune's "processes every seed set" rider vs the harness single-name seed filter.**
  At k≥2 the harness filters to one representative per display name; P2 closes the accidental recovery
  path for MONOTYPIC k-uniform tilings, which is a k≥4 PRECONDITION — either drop the single-name
  filter at k≥4, or prove monotypic non-existence per k. NULL at k≤3 (no monotypic k-uniform tilings
  exist there).

## 39. TH-10 scout — the tightened weight bound BUYS RUNS (EXAMPLE MODE measurement; 2026-07-03, session 18)

**Mission** (TA program note `../resources/research/weight-bound-program-2026-07-03.md` §CC scout;
SYNC 2026-07-03): measure the run economics of the cor:box procedure (pairs → exact
area-admissibility → joins → fills → per-tiling match) with the weight-(24k−1) pool replaced by
W(s), s = the staged target (5/6/8 at k=1/2/3), BEFORE the TA spends proof-weeks on Route 2.
**Everything EXAMPLE MODE — the substituted bound is unproven; no count/completeness claim.**

**Harness.** `scripts/th10-scout.ts` + a flag-gated injection seam
`PeriodSolverOptions.th10Override` (hard-gated on `TH10_EXAMPLE_MODE=1`, throws otherwise; loud ⚑
banner; candidateCache untouched; **k≤2 probes byte-identical flag-off** — digest-neutral).
Design points, in soundness order:
- **W(s) BFS** = the DG-1 frontier BFS (8 int coords, Φ₂₄ reduction), asserted against the TA's
  exact |W(s)| table at every level ≤ 7 — all matched (25 / 289 / 2,089 / 10,825 / 43,777 /
  146,521 / 423,169). **New exact value: |W(8)| = 1,086,913** (the program note's s⁸ fit said
  ≈1.2e6).
- **Integer-exact pair stage**: 4·det(w₁,w₂) = a+b√2+c√3+d√6 with a..d ∈ ℤ computed in Number
  arithmetic (64 mults; cross-checked against `detSurd` at startup) — the admissibility DECISION is
  exact; float+quantized-bitmap is broadphase only. Pair-det cap = min(s², 24k·a_max) — s² is
  intrinsic (det ≤ |w₁||w₂|).
- **Pair-stage ladder carries NO tile-count cap** (value-capped only): a pair may span an index-m
  sublattice of the true cell, whose det = m·(cell area) is an m-fold multiset sum possibly >24k
  tiles. ⚑ FLAG FOR TA: cor:box(iv)'s "pairs whose exact cell area is admissible" needs this
  reading, or the two-of-the-gᵢ initial pair can be filtered before its joins reach Λ — check the
  corollary's wording. (Empirically moot at k≤3 scale: sharp = admissible in every run.)
- **Join closure keeps inadmissible-det intermediates** (joins chain; only admissible dets are fill
  candidates). Float rationality prefilter (denominator ≤ det/(√3/2) = the index bound), exact
  `joinLattice` decides.
- **Fills = the live pipeline unchanged**: per-seed exact vcAreaSet + P0 (the proven-sound
  filters), one lattice per solve, maxMs=0, identity seed map (no OP-3 — conservative superset).

**Numbers** (log `experiments/results/th10-scout-2026-07-03.log`; darwin arm64, 10 cores, 24 GB,
single-core measurements):
- **k=1, s=5 (|W(5)|=43,777) — END-TO-END 17.3 min**: 9.58e8 pairs in 38 s (2.51e7/s) → det-in-range
  8.77e8 (91.5% — the cor:box(ii) bound prunes ~nothing, as DG-1 predicted) → 4.77e6 exact-admissible
  → **831,279 distinct lattices**; joins 3 rounds/11.9 min, +45,851 — **0 admissible-det**; fills
  Σ 224,557 (vcAreaSet+P0 cut 12.2M seed×lattice items) in 4.5 min, mean 1.19 ms, p99 3 ms, max
  1.3 s; 22 raw cells, 0 gate-rejected → **11 distinct, COMPOSITION digest `6f9ca9cf2d16c75f`
  BYTE-IDENTICAL to the certified k=1 anchor; 11/11 per-tiling bijection vs the certified snapshot;
  10/10 vs Galebach** (t1002 reconstruction degenerate upstream — known, TA 2026-07-03).
- **k=2, s=6 (|W(6)|=146,521)**: pairs 1.07e10 in 5.3 min (3.37e7/s) → 3.46e7 admissible →
  **6,174,578 distinct lattices**; joins ⚑ budget-cut at 2 h (334 L/s, 44% of round 1; +194,257
  joined, again 0 admissible-det; full round 1 ≈ 5.1 h 1-core, parallelizable); fill work
  Σ **1,666,968** over 40 seeds (median 59, max 240,009); tuned fast-path per-fill 106.4 ms ⇒
  **projection ≈ 2.1 d single-core ≈ 6.2 h on 8 cores** (⚑ floor: W(6) cells can exceed tuned cells;
  heavy-tailed).
- **k=3, s=8**: 5.91e11 pairs; sampled 8.22e8 (0.139%): broadphase 19.6 ns/pair,
  exact-admissible rate 0.152%, canonicalization 5.1 µs/survivor ⇒ **pair stage ≈ 4.5 h single-core
  ≈ 34 min on 8 cores** (≈9e8 canonicalizations dominate; distinct count does not extrapolate —
  dedup saturates). Joins/fills not measured (per spec).

**Verdict against the TA decision rule** ("k=1 overnight + k=2 ≤ weeks ⇒ Route 2 worth full
effort"): k=1 took 17 MINUTES, k=2 projects ~6.2 h of fills + ~hours of joins on 8 cores, k=3's
pair gate is ~34 min — **GO for Route 2**, with margin. Honest residue: (a) the k=2 join closure is
truncated — its contribution is empirically 0 admissible lattices at both k (joined dets = det/m
fall off the tile-sum ladder), but the closure was not completed; (b) the k=2 fill projection uses
the tuned per-fill cost as a floor; (c) EXAMPLE MODE throughout — these numbers license proof
effort, not claims.

## 40. Efficiency-pruning — the octagon is the tightest tiling and √2 is safe with margin (2026-07-05, session 19; work order `experiments/efficiency-pruning-workorder-2026-07-04.md`)

AL's work order: quantify the pruning power and stress-test the completeness of an efficiency pool
filter `keep v iff wt(v) ≤ c·|v|`, feeding the parallel AL/TA proof (target `c = √2`) two numbers —
how much √2 buys, and whether any certified tiling (octagons included) violates a candidate `c`.
Full results in `experiments/results/eff-pruning-2026-07-05.md` (+ the `eff-pruning-*` logs/CSVs).

**Pre-flight double-check (a parallel 6-reader workflow) killed four of the work order's premises —
recorded here because "failed ideas and why" belong in the ledger:**
1. **`wt(v)` has no sound callable in the production pipeline.** `|v|²` is exact and ready
   (`reSurd(v.normSquared())`), but the only integer weight in-code is the `shortVectorPool` BFS depth,
   which is *inflated* by monotone + restricted-direction + `lmax` pruning — using it would OVER-prune
   and silently drop tilings (the "completeness knob as speed dial" §11.4 forbids). Sound weight = the
   scout's *unpruned all-24-root* BFS level. ⟹ the filter lives on the scout/example path; the analytic
   ratios use a purpose-built unpruned wt-oracle, never `shortVectorPool`.
2. **The octagon premises were inverted.** The work order feared "√2-length octagon periods push the
   sup above √2." Reality (computed exact from the stored basis): the 4.8.8 octagon (t1002, k=1) has
   |u|²=|v|²=**3+2√2** (period length **1+√2 ≈ 2.414, not √2**), u·v=0, wt=3, ratio 3/(1+√2)=**3(√2−1)
   ≈ 1.2426**. The √2 is the target *ratio*, not a period length; the √2 field-fact enters via an ODD
   power of ζ₂₄ (outside ℤ[ζ₁₂]) — that is what the ζ₁₂ proxy dropped. There is exactly ONE octagon
   tiling in certified k≤3 (no "3.4.8-family", no k=2/k=3 octagons), and it is oracle-matched, not
   excluded. **The octagon is the tightest certified tiling and sits 12% below √2.**
3. The committed catalogue carries the stale k=3 digest `99919f42`; live anchor is `11ee1b1d582811d1`.
   Ratios are congruence-invariant so the catalogue bases are fine for ratios; the empirical gate uses
   the live anchor.
4. The proxy table (14%/21%/8×/1.2957@t6268) is from AL's non-repo ζ₁₂ tool — `fillprof-sandbox.ts` is
   a fill-*timing* profiler, not it. Treated every proxy number as a hypothesis; did NOT round sups
   toward √2.

**The filter.** `lib/classes/algorithm/effFilter.ts` (TDD, `tests/eff-filter.test.ts` 9/9): exact test
`Surd.cmp((P/Q)|v|², wt²) ≥ 0` for rational c²=P/Q; `parseEffC2` rejects decimals and fails loud.
Injected into `scripts/th10-scout.ts` behind `PRUNE_EFF_C2` — `enumerateW` now records the BFS level
per vector (`Pool.wts`), `applyEffFilter` prunes after enumeration with a loud ⚑ banner + per-shell
kept-fractions. **Byte-identical-off GATE PASSED**: flag-off k=1 reproduces pool 43,776 / distinct
831,279 / 224,557 fills / digest `6f9ca9cf2d16c75f` / 11-11 bijection — all byte-for-byte vs history.

**Exp B — the breaking threshold (exact).** Per certified tiling, `max(wt(u)/|u|, wt(v)/|v|)` over the
gauss-reduced basis (unpruned wt-oracle self-checked vs |W(t)| to weight 7):
- **k=1 = 1.2426 (octagon t1002), k=2 = 1.1954 (t2016), k=3 = 4/3 = 2/√3 (t3038).** Overall
  **k≤3 sup = 1.2426 = 3(√2−1), exact c² = 27−18√2.** √2, 1.30, 1.25 all SOUND; 2/√3 UNSOUND (drops
  k=1/k=2). `scripts/eff-pruning-ratios.ts`.
- **Galebach k≤6 (octagon-blind ℤ[ζ₁₂] reference, meet-in-the-middle wt-oracle over W(≤7)):** sup =
  **1.2957 @ t6268, exact c² = (1664−448√3)/529** — the proxy's float-weight 1.2957 CONFIRMED exact.
  Galebach's k=1 max (1.1547) falls *below* the certified 1.2426 because it can't see the octagon —
  a clean demonstration of the blindness. ⟹ ζ₁₂ sup is a lower bound; cannot establish √2 for k≥4.
  `scripts/eff-pruning-galebach.ts`.

**Exp A — pruning power (`scripts/eff-pruning-sweep.sh` + `-table.ts`).** k=1 complete sweep:
**the reduction reaches the fills** (7–43× fills, > pool's 3–10×, since pairs~pool²). **√2 buys 3.6×
pool / 5.3× distinct / 8.8× fills** (all 11 kept); 1.30 → 4.6×/8.0×/12.9× (the 8.0× matches the proxy
exactly). **Empirical breaking ∈ (1.20, 1.25]** (digest `6f9ca9cf`/11 at c≥1.25, `476ebbd7`/**10** at
c≤1.20, the dropped tiling = the octagon) — **brackets the analytic 1.2426 and names the same tiling,
so the reduced-basis bound is TIGHT**, no alternate-generator rescue. Per-shell kept (2/√3):
100/45/20/12/9% ⟹ higher shells prune harder ⟹ the prune is ≥ this aggressive at the proven pool. k=2:
filtered points all complete; the **unfiltered ∞ point OOMs** (pre-existing scout heap limit, filter
OFF) — so the prune *makes k=2 tractable*. k=3: pool% only (runK3 samples); higher-k prunes harder
(√2 keeps 21.1% vs k=1's 27.9%).

**Verdict for the proof:** √2 holds over all octagon-complete data (certified k≤3) with a 12% margin,
confirmed analytically AND empirically (they agree). The octagon — the feared case — is the worst case
and is comfortably under √2. Honest caveat: octagon-completeness is k≤3 only; k≥4 rests on the
octagon-blind galebach reference, so an all-k √2 claim carries that extrapolation.

## 41. k=3 fill-cost measured under √2 pruning — days, not weeks; the tail is the risk (2026-07-05, session 19; work order `experiments/k3-fillcost-workorder-2026-07-05.md`)

The §40 filter made the OOM-ing k=2 case tractable; AL's follow-up: use it at k=3 to run the
pair→distinct→fill path that was previously out of reach and return the two numbers every k=3 estimate
MODELED. Added `TH10_K3_FILL=1` to `scripts/th10-scout.ts` — routes k=3 through the full
pairStage→joinStage→`runK3Fill` (a stratified fill sample: two-pass streaming setup keeps memory
bounded to the sample; the 449-seed × millions materialization would OOM). Byte-identical off, build
clean. Results: `experiments/results/eff-pruning-k3fill-2026-07-05.{md,log}` (+ the 15k re-run log).

**Measured at c=√2 (pool W(8) 21.14% = 229,800; EXAMPLE MODE, W(8) depth unproven):**
- **Distinct admissible lattices = 14,504,172** (deterministic across two runs) — the prior model was
  ~1.7e7, so **measured is ~15% below the model**. Total fill work Σ per-seed = **23,436,240**.
- **Per-fill cost is heavy-tailed and tail-dominated.** Bulk is fast and stable across a 4,259- and a
  15,209-fill sample (p50 42, p90 81, p99 135 ms), but rare **catastrophic 100 s+ fills** (genuine hard
  cells, no cap warnings) dominate the mean: at n=4,259 the single 178 s fill was 28% of sampled time
  (mean 148 ms); at n=15,209 the mean settled to 109 ms but the **max grew 178→203 s** — the mean is
  range-bounded (~109–148 ms), not point-pinnable by sampling.
- **k=3 wall-clock at √2 is FILL-DOMINATED ≈ 3.7 days on 8 cores** (range 1.4–5 d at p50→mean); pairs
  ~2 min (2.64e10 pairs, 14.4 min/1-core, embarrassingly parallel); the **join closure budget-cut**
  (14.5M-lattice closure too big to finish in 30 min).
- ⚑ **Measure-don't-assume win:** at a tight prune the join closure COMPLETED and **added 12
  admissible-det lattices** — so **k=3 joins are NOT trivially 0** (k≤2 had a proven 0). The
  completeness story must account for k=3 join contributions.

**Bottom line:** the *timing* half of "how long does k=3 take" is now measured — **days, not weeks** —
with the residual uncertainty entirely in the catastrophic-fill tail. The *pool-depth* half stays with
the AL/TA √2 + weight-bound proof (s=8 example vs s=10 proven ⇒ scale the fill count at the same
per-fill). The efficiency filter is what made this measurable at all.

## 42. torusFill internals profiled → Rank 1 + Rank 2 (overlap-leg collapse), byte-identical ~2× (2026-07-08/09, session 20)

AL: profile the fill (selection vs validity vs bookkeeping), decide what to optimise, then implement the
smart way. Full detail: `experiments/results/fill-profile-2026-07-08/FINDINGS.md`.

**Method.** `PS_FILL_PROFILE=1` adds per-pop semantic timers + tree-shape counters to `torusFill`
(byte-identical when off: 34/34 period-solver tests + k=1 digest match with the profiler on), corroborated
by `node --cpu-prof`. Driver `scripts/fill-profile-driver.ts` runs the normal solve() on real seeds; the
scout's example-mode pair cross-product OOMs before any fill (4 GB at 54% of the k=2 pair stage).

**Diagnosis.** The typical fill is per-node-expensive, not combinatorial: tiny DFS (3.7 pops/fill at k=1,
~20 at k=3, sub-exponential), and float overlap testing is ~70–90% of the fill at every k. certify's
internal overlap share is a stable 86% at k=1/2/3. Exact ℤ[ζ₂₄] arithmetic is only ~7% (a common wrong
guess). `Polygon.intersects` is O(V²); a valid tiling has no overlaps, so the cost is running full O(V²)
intersects to CONFIRM that edge-adjacent tiles are disjoint. Lever: cheaper nodes, not fewer nodes.

**Rank 1: periodic overlap reduction.** `blockHasProperOverlap(block)` (O(block²) all-pairs) →
`reps.some(r ⇒ properOverlapWithBlock(r, block))` (O(reps·block)) at the certify site (isCompleteTiling) and
the per-fill setup site. The block is a union of Λ-translates of the reps, so any proper overlap has a rep
witness inside the block; a reach guard falls back to exact all-pairs when the block might not contain it.
NEW-true ⇒ OLD-true unconditionally (a rep is the m=n=0 block term), so a valid tiling is never dropped.
Measured (k=3, per closure): certify overlap 334→26 ms (~13×), certify total 390→87 ms (~4.5×), overlap
share of certify 86%→30%. Adversarial review (3 skeptics + judge): the drop direction is unconditionally
safe; the review found a latent WRONG-ACCEPT gap in the first guard (`Rabs+2 < 2·maxCircum` omitted
canonicalRep's 1.5·cellDiam reach, reachable by a future acute-point isotoxal star with circumradius > ~5),
hardened to the exact witness-containment condition `1.5·cellDiam+0.1+2·maxCircum > Rabs+cellDiam+2 ⇒ fall
back to exact`. Never trips for {3,4,6,8,12}; chosen over star-gating because the invariant is
circumradius-vs-reach, not regular-vs-star.

**Rank 2: OP-1 before the overlap leg.** Failed idea first (belongs here): sourcing `occ` from `analyze` to
skip the WHOLE certificate is UNSOUND, analyze's small Rabs=5 block does not reliably reach a closure. The
differential test `occ_analyze === occ_certify` caught 1/92 (a k=3, 9-tile, cellDiam-4.464 cell where the
Rabs=5 block under-reaches). Reverted. Sound form: a leg reorder inside isCompleteTiling (judge, collect
occ, then an OP-1 short-circuit `opDoom`, non-star only, returning false for a V<k or occ⊊allowed closure
before the overlap leg). Byte-identical (a doomed cell is discarded either way; AND is commutative). Win
modest (~3.5% of fill): Rank 1 already collapsed the overlap leg, and the V<k half fires 0 times at k=2/k=3
(the type-prune is the whole lever).

**Total gain (byte-identical, direct OLD-vs-NEW, profiler off).** k=1 23.4→10.4 s (2.25×), k=2 204.0→132.7 s
(1.54×); k=1 digest `6f9ca9cf2d16c75f` and k=2 25 distinct cells / 91 raw identical on both. k=2 gains less
because solve() = candidate enumeration (unchanged by R1/R2) + fill (~2×), and the candidate stage is a
larger share at k=2. After R1+R2 the fill is balanced and the new dominant certify sub-cost is buildBlock
(14%→72% of certify, ~20% of fill). Rank 3 (shared-edge / SAT short-circuit) NOT implemented (AL decision):
it modifies the shared `Polygon.intersects` and leans on an unasserted CCW-winding invariant, and Rank 1
already collapsed its target. Test: `tests/certify-overlap-periodic.test.ts` (92 catalogue cells + 8
constructed overlaps, old ≡ periodic).

## 43. k=3 with all speedups; the catastrophic-cell diagnosis; the early k-gate (2026-07-09, session 20)

AL: run k=3 with all optimisations so far (12-dir + √2 prune + W(8)=2k+2 + Rank 1 + Rank 2), then
investigate one catastrophic cell and act on it. Logs: `experiments/results/k3-all-opts-2026-07-09.log`,
`k3-monster-hunt-2026-07-09.log`, `k3-monster-hunt-earlygate-2026-07-09.log`.

**All speedups on k=3.** The candidate stage is now trivial: 12-dir pool |W(8)| = 7,992, √2-pruned to 4,368,
9.54e6 pairs (21 s), joins complete (3.9 min), 662,465 fill candidates. That is 35× fewer fills than the
24-dir √2 count (23,436,240, §41). The candidate levers make generation minutes and deterministic. The FILL
is the wall. On the bounded stratified sample (4,169 lattices, identical to the 07-08 run because the
candidate stage is deterministic), Rank 1+2 give per-fill mean 35.6→29.9 ms (1.19×), p50 30→28, p90 60→46,
p99 103→67 (1.54×). The improvement grows toward the tail (Rank 1's certify win lands on the expensive
fills), but the k=3 sample is contradiction-dominated (2 closures / 4,169), so the mean gain is modest, not
the ~2× of k=1. Full k=3 stays infeasible: the 07-08 uncapped full-fill stalled inside seed 1 at a 27-day
instantaneous ETA. The wall is the catastrophic tail, not the mean, and Rank 1+2's ~2× does not cross
days→hours.

**Monster diagnosis (per-fill profiler-delta capture on seed 1 = 3⁶).** Env-gated scout hooks
(`TH10_SEED_ONLY`, `TH10_FILL_DESC`, `TH10_FILL_SLOW_MS/N`) snapshot the profiler counters around each
solve() and dump the tree shape of any fill over a threshold. The tail is COMBINATORIAL (thousands of pops
vs ~20 at a typical fill), in two classes:

| class | detF | wall | pops | closures | dominant cost |
|---|---|---|---|---|---|
| dead-end | 34.64 | ~7 s | 4,438 | 0 | expand 80% + analyze 19% |
| closure-storm | 33.77 | ~65 s | 10,513 | 93 (all rejected) | certify 23% + primitive 23% + expand 20% |

The aggregate settles what the closures are: certCalls 279 → certPass 279, primCalls 279 → primTrue 276,
gateRejected 276, cells 0. So the closure-storm's ~93 closures per fill are VALID PRIMITIVE tilings (not
supercells: 99% pass primitivity) that the k-gate rejects for orbit count ≠ k. `gateRejected` is documented
"orbit count ≠ k" and V<k is counted separately, so these have orbit count > k: the 3⁶ seed on a large
lattice keeps closing into higher-uniformity tilings, each fully certified (buildBlock + overlap) AND
primitivity-checked before the gate discards it. Rank 1+2 touch only ~10% of this (overlap = 40% of certify
= 25% of the tail), which is exactly why the tail barely moved (monster max 4454→3982 ms).

**The early k-gate (implemented).** Move the orbit-count gate from the post-pass into `torusFill` at the
closure: reject a closed cell with orbit count ≠ k BEFORE the buildBlock+overlap certificate and the
isPrimitive search. Soundness: orbit count is a property of the closed cell and is invariant to
certification (isCompleteTiling / isPrimitive do not mutate reps, verified), and the early gate calls the
SAME orbit function on the SAME reps as the post-pass, so its reject decision is identical. Reject-only: a
cell that would be emitted (orbit = k) is never dropped. Design:
- `FillCtx.gate` carries the gate closure, set only on the enumeration path (solve); single-cell verify
  paths keep it undefined and run unchanged.
- Scoped to k ≥ 3. At k ≤ 2 fills are cheap and virtually every closure is orbit = k (gateRej ≈ 0), so the
  extra orbit count per closure is pure overhead (measured: k=1 forced-on 14.5 s vs 11.0 s off).
  `PS_EARLY_GATE=1` forces it on at any k (A/B + tests), `=0` forces it off.
- The now-redundant post-pass gate is skipped when the early gate ran (no double orbit computation).
- New diag counter `earlyGateRejected`.

**Byte-identical, proven three ways.** k=1 composition digest `6f9ca9cf2d16c75f` unchanged (default AND
forced-on). `tests/early-gate-equivalence.test.ts` 8/8 (on vs off at k=1, identical emitted set where it
fires). 45/45 across period-solver + certify-overlap + op3 + early-gate suites. `pnpm build` passes.

**The win.** Closure-storm (detF 33.77) 65 s → 35 s (1.86×). certify (15 s) and primitive (15 s) go to 0
(certCalls 279 → 0, primCalls 279 → 0 over the same 12 monster fills; timed work 181 → 91 s). The DFS
(expand, pops) is unchanged, as it must be.

**What it does NOT cover (honest limits).**
- The dead-end class (0 closures) is UNCHANGED: with nothing closing, the gate never fires. That class needs
  earlier CONTRADICTION detection in the DFS (constraint propagation / lookahead), a separate and harder
  lever.
- The orbit-gate computation is now the exposed floor (~19 s per closure-storm, ~190 ms per
  countVertexOrbits on these large cells). The early gate MOVES this cost from the post-pass to the closure,
  it does not remove it; a cheaper orbit count or an even-earlier partial-orbit bound is the next target.
- It does NOT make the full 662,465-fill k=3 stage session-feasible. It halves the worst tail class; the
  tail is smaller, not gone.
- Scoped k ≥ 3 is a heuristic threshold, not a proof. EXAMPLE MODE throughout (W(8) pool unproven): a timing
  improvement, not a completeness change.

Artifacts: `lib/classes/algorithm/PeriodSolver.ts` (FillCtx.gate, diag.earlyGateRejected, ctx.gate at k≥3,
torusFill early reject, post-pass skip), `tests/early-gate-equivalence.test.ts`, `scripts/th10-scout.ts`
(env-gated monster-hunt hooks + the k3-fill measurement path).

## 44. C++ oracle — trace-gating + streaming fuse + compact exact dedup: past the disk/RAM walls, dedup still provably exact (2026-07-09, session 20, worktree `feat/ctrnact-streaming-pruner`)

The Čtrnáct C++ oracle (`tools/ctrnact-oracle/`) got two optimizations. Both were validated against a golden
capture of the pre-change output **plus** the A068599 counts (exact match k≤11: 10/20/61/151/332/673/1472/
2850/5960/11866/24459), so completeness is untouched. Subagent-driven build, 7 tasks, each gated before the next.

**Trace-gating — the wall-time win.** `eu_solver` wrote a per-node debug trace (`euoutput1.txt`) on every DFS
node: string-building + I/O done once per configuration, never read by the search or the emitted solutions
(the `mincycle` computation inside `writecycle` runs regardless). Gating it behind `EU_TRACE` (default off,
`-DEU_TRACE=1` restores it) cut solve ~4–6× with byte-identical solution files (sha256). Measured k=10 solve
137s→32s, k=6 3.75s→0.66s; the relative win shrinks with k as real search work dominates. This was the actual
speed lever, NOT multicore — root-split parallelism would give ~3–5× but with a concurrency race on the global
`mincycle`/output, a bad trade on a completeness oracle. Rejected with that reasoning recorded.

**Streaming fuse + compact dedup — the headroom win.** `eu_solver EU_STREAM | eu_pruner EU_STREAM` pipes each
solution block so raw output never lands on disk; the pruner stores each distinct solution as a packed `int16`
graph (the `Sol.label` field was stored-but-never-read — `comparesolutions` uses only the five index arrays —
so it was dropped, not narrowed) and frees the store between k; `EU_KONLY=k` drops non-target blocks before
`decode`, bounding pruner RAM to a single k. Before/after at the k≤10 full catalogue: original (trace on, file
two-step) 160s / 183 MB raw disk / 49 MB pruner RAM → fused (branch HEAD) 32s / **0** raw / 27 MB. Fused per-k:
k=11 66s, pruner peak 31 MB, 0 raw; k=12 157s, 64 MB, 0 raw. The streaming layer's wall win is small at low k
(1.26×) — its value is disk→0 and the RAM bound, i.e. the headroom that makes high k reachable at all.

**⚑ What this buys, and what's deferred.** On the target M5 (24 GB, 4P+6E) the memory stack unblocks to ~k22
on paper, but *time* is the true ceiling (~k19–20 on one machine; solve grows ~2.5×/k). k≥21 needs distribution
— root-split across machines, which the design already accommodates (the streaming pruner is stateless except
its bucket table, so it shards). A complete canonical-form dedup (store keys not graphs, ~50× less pruner RAM)
is the frontier lever but rests on canonicalization completeness; **deferred** to the distributed layer where
it's actually needed. The single-machine path keeps exact pairwise (packed), so no completeness-trust is
introduced here. Spec + TDD plan: `docs/superpowers/{specs,plans}/2026-07-09-ctrnact-streaming-compact-pruner*`.
Merged to `feat/wallpaper-symmetry` at `f9053f0` (branch commits `7c14bb1`…`971ecfc`).

## 45. A proven hashable canonical form for period cells (Fable-derived "N"), and it replaces the O(n²) congruence bucket (2026-07-10, session 21)

The §44 note flagged "a complete canonical-form dedup (store keys not graphs) is the frontier lever but rests on
canonicalization completeness — deferred." That lever now exists. AL posed the Soto-Sánchez normal-form problem
(one canonical symbol per tiling so congruence testing is an equality check, not a search) to Fable 5 as a
self-contained brief; Fable returned a method with proofs, `docs/canonical-form/canonical-form.{tex,pdf}` +
a Python reference and adversarial suite under `docs/canonical-form/verification/`. We reviewed, scored it 8/10,
and validated it on our own data.

**What N is, in one paragraph.** A tiling's symbol (period lattice + seed vertices in ℤ[ω], ω=ζ₁₂) has infinitely
many encodings. N canonicalizes them: (Stage A) recompute the **maximal** translation lattice Λmax — this is the
part the four-source ambiguity list *misses*, since the same tiling re-encodes over any finite-index sublattice,
and Fable's note proves the naive 24n-frame baseline is therefore NOT canonical without it; then HNF the lattice,
canonical coset reps for seeds, row-sort. The residual 24n orientation/origin ambiguity is cut to the **stabilizer
of the vertex-star multiset** by a direct rule (a star is a per-vertex 12-bit invariant a global rotation only
permutes), and a proved coincidence lemma says the frames that survive produce byte-identical candidates exactly
when they are true symmetries — so the remaining minimization only ever compares copies. Soundness (N(M)~M) and
canonicity (M~M' ⇒ N(M)=N(M')) are proved for the equivalence V'=gV+c, g∈D₁₂; octagon tilings are out of domain
(ζ₁₂ excludes the 45° directions — the same 12-direction scope as our path).

**Validated on the real oracle (`scripts/canonical-bench.ts`, `docs/canonical-form/verification/test_on_repo.py`).**
Ported N to TS operating on `PeriodCell` (project ζ₂₄ encode → ζ₁₂ even positions; octagon ⇒ null). Over the
ctrnact cells reconstructed via `reconstructOracleCellExact`: distinct-N per k = **10/20/61/151/332/673** (k=1..6),
i.e. exactly A068599 as a pure hash, matching `dedupeByCongruence`; zero false merges; invariant under 1638+
re-encodings (D₁₂ + basis + translation + sublattice). The one k=1 octagon tiling (t1002/4.8.8) correctly returns
null (out of domain), re-added by hand per the octagon decision.

**Speed.** N vs the repo's existing hashable key `TranslationalCellExtractor.canonicalKey`: **~18×** (k≤6 batch,
228 vs 4255 µs/cell) — part algorithmic (star-stabilizer vs canonicalKey's 48 D₂₄ frames), part representational
(ℤ[ζ₁₂] rank-4 machine ints vs ζ₂₄ rank-8 BigInt, legitimate since N excludes octagons). And N is *correct* where
canonicalKey is not: on a 2494-cell batch with re-encoded duplicates N gave 1247 (correct), canonicalKey 2428
(the §12.7 under-merge — canonicalKey canonicalizes a *fixed* cell's orientation/origin but not the
fundamental-domain / basis choice, which N's Stage A absorbs). NB canonicalKey **does** handle chirality (its
reflect loop merges the snub enantiomorph — all three methods merged it); N's edge over it is re-encoding
robustness, not chirality.

**Wired in — but it does NOT speed up `dedupeByCongruence` (corrected 2026-07-10, same session).** The first
wiring bucketed `congruencePartition` (TilingCongruence.ts) by `nKeyOfCell` (module
`lib/classes/algorithm/canonicalFormN.ts`), completeness-safe (N trusted only to *separate* — a false split can
only over-count, never drop; *merging* stays under the authoritative pairwise `cellsCongruent`). The bucketing is
correct and harmless, **but profiling proved it buys nothing**, because the pairwise it optimizes was never the
bottleneck. Per-call cost (k=3, 40 cells): **`primitiveReducedCell` 2245 ms/cell**, `nKeyOfCell` 0.23 ms/cell,
`cellsCongruent` 0.12 ms/**pair**. End-to-end `dedupeByCongruence` on the subset: N-bucket ON 96.8 s vs OFF 95.1 s
= **×0.98**. The 757 s for the 364-cell k=3 batch reported above was ~entirely `primitiveReducedCell`
(364 × 2.2 s ≈ 800 s), not the pairwise. My earlier "757 s → 1 s in the pipeline" claim was WRONG and is retracted.

**The real bottleneck is `primitiveReducedCell`** — it replicates a (2R+1)²=25-cell patch and runs a full
`TranslationalCellExtractor.extract` for *every* input cell, even already-primitive ones (all oracle cells are
primitive), and it dominates the dedup at ~2.2 s/cell. **Where N actually delivers speed:** as a *standalone*
hash dedup that BYPASSES `primitiveReducedCell` and the pairwise entirely — N's Stage A recomputes the maximal
lattice in 0.23 ms/cell, doing the same primitivity job `primitiveReducedCell` does at ~10⁴× the speed. Deduping
by `nKeyOfCell` into a Set is thus ~10⁴× faster per cell than `dedupeByCongruence`, but it TRUSTS N as the
authority (no pairwise fallback) — a completeness decision deferred to AL, not taken here. So the honest state:
N is a validated correct+fast canonical key; the bucket-wiring is a safe no-op; the true speed lever is either
(a) a trusted N-hash dedup replacing `dedupeByCongruence`, or (b) giving `primitiveReducedCell` a fast
already-primitive pre-check (independent of N). Gate on the landed change: `tiling-congruence` + `dsym-generator`
tests 7/7, typecheck clean, counts unchanged. `CANON_N_BUCKET=0` restores pure-invariant bucketing.

**⚑ Honest flags.** (1) The 18× (N vs `canonicalKey` as standalone keys) stands and is a mixed
algorithmic+representational number. (2) The pipeline-integration speedup does NOT stand — retracted above; the
bucket-wiring is ×0.98. (3) N-bucketing weakens one guard direction (a false *split* over-counts, uncaught
within-bucket); N is proved/empirically split-free, but a verification run should A/B against `CANON_N_BUCKET=0`.
(4) Scope is 12-direction (octagon out of domain). Fable's note leaves directness (T1) partly closed and entry
bounds (T2) sketched. The thesis contribution is the proven canonical form + the sublattice-maximality
correction; pitched as "correctness at hash speed," not "solved the open problem" — and NOT as a drop-in pipeline
speedup, which this session disproved.

**Fail-fast test: can N be the dedup AUTHORITY? (survived.)** AL's plan: use N as authority, try to break it against
ground truth; one genuine failure kills it, else invest in the proof. No pairwise needed — the oracle IS the
ground-truth partition, and N runs directly on `{T1,T2,Seed}` (`nKeyOfSymbol`). Results (`scripts/n-authority-test.ts`):
**no false merge** — distinct N-keys per k equal A068599 for **k=1..11 (10/20/61/151/332/673/1472/2850/5960/11866/
24459), zero collisions across all 47,854 tilings, 0 nulls, 12.2 s**; **no false split** — 300 tilings × (20
isometries + 5 non-primitive supercells) = 7,500 re-encodings, 0 splits (the supercell leg specifically validates
skipping `primitiveReducedCell`: N's Stage A recovers Λmax at indices 2/3/4/5/7). So option 1 is empirically viable.
Rigor: the completeness-critical direction (N(M)=N(M') ⇒ M~M', i.e. no drop) follows from N's **soundness** proof
(N(M)~M) plus the ℤ[ω] model, both in Fable's note — trusting N does not weaken the completeness proof beyond
accepting that proof + the 12-direction model (octagon handled separately, null-fallback). Residual risk is a
*port* bug, guarded by (a) this 47,854-tiling + 7,500-re-encoding differential and (b) keeping `dedupeByCongruence`
as an opt-in verification.

**LANDED — `dedupeByNKey` is the default final dedup.** `dedupeByNKey(cells, keyOf)` (TilingCongruence.ts) groups by
`nKeyOfCell`, no pairwise, no `primitiveReducedCell`; null-key cells (octagon/degenerate) route to the authoritative
`congruencePartition` (an octagon tiling is never congruent to a 12-direction one, so the subsets never cross); `keyOf`
picks the representative exactly as `dedupeByCongruence`, so it is a drop-in with identical output. Completeness guard
`PS_MERGECHECK=nkey|full` re-checks every N-group pairwise against `cellsCongruent` and throws loud if N ever merged
two non-congruent tilings (the only drop-causing direction). `congruencePartition` was reverted to pristine (the
earlier no-op N-bucket removed) so the authority stays untouched for verification. Wired at `PeriodSolver` final dedup;
`PS_DEDUPE=congruence` restores the exact pairwise path. Gate: full `pnpm build` green; `dedupe-nkey` test (distinct
set, duplicate collapse, octagon fallback, merge-guard) + `tiling-congruence` regression pass; N confirmed engaging
(non-null, distinct keys) on real cells. **Measured earning on a REAL solve** (`scripts/dedup-timing.ts`, k=2,
{3,4,6,12}, 40 seeds → 25 cross-seed cells → 20 distinct): the cross-seed aggregate dedup went **33.9 s → 0.30 s =
×111**, identical 20-tiling output (representative sets byte-identical). The multiplier is `primitiveReducedCell`
(~1.4 s/cell here) × every cell vs one hash each; it therefore GROWS with k (k=2's aggregate is only 25 cells; at
k≥3 it is hundreds–thousands, where the old path runs minutes–hours and N stays sub-second).

**Also moved the cross-seed dedup site** (the bigger one — the whole `allCells` aggregate, which the per-seed wiring
did NOT touch) in both `run-pipeline.ts` (the persisted catalogue producer) and `scripts/probe-pipeline.ts` (the
determinism harness), same `PS_DEDUPE=congruence` escape hatch. PROVEN drop-in: probe at k=2 gives the
**byte-identical COMPOSITION digest `f3e2e0517191362c` (count 20)** under both paths. Because `PS_DEDUPE` now governs
per-seed AND cross-seed dedup, the full k=2 probe pipeline went **175.9 s → 88.1 s (~2×)** — the dedup work was ~half
the wall-clock (per-seed congruence across 40 seeds + the cross-seed aggregate) and collapsed to <1 s. Trust write-up
for the thesis is AL's (the soundness-proof argument above).

## 46. nClassify — wallpaper classification in rank-4 machine int (58×), and a pmm↔cmm bug in analyzeSymmetry it exposed (2026-07-10, session 21)

The symclass cost was the pole in chart generation: `WallpaperSymmetry.analyzeSymmetry` runs in ℚ(ζ₂₄) dim-8
`bigint` and searches ~47 candidate isometries per tiling with an O(|seed|³) exact membership test —
32 ms/tiling, 806 s for the 24,459 k=11 tilings. A throwaway magnitude probe (`scripts/bignum-magnitude-probe.ts`,
48.8 M ops over the k=11 catalogue) settled that the bigint/rational layer is dead weight: max |coeff| = **210**,
every denominator **= 1**, worst multiply intermediate 3.5e5 (int32 headroom 26e12×). The cells are natively
rank-4 integer vectors `[a0,a1,a2,a3]` over {1,ω,ω²,ω³} (ω=ζ₁₂) — `analyzeSymmetry` decodes those INTO ζ₂₄ bigint.

`lib/classes/symmetry/nClassify.ts` reimplements only the classification half (group / orbifold / latticeShape)
in machine int: `inLattice` becomes an O(1) float-solve + exact int-verify (no dim-8 Cramer), the τ mirror/glide
test and `allTopCentersOnMirror` incidence stay exact int, `classifyLattice`'s oblique test is Surd-free mutual
integer-containment. The fundamental-domain float geometry (buildFD / buildSubdivision / Sutherland-Hodgman, ~half
of `analyzeSymmetry`) is RENDER-only and dropped. Step 1 of the "drop bigint → improve algorithm → C++" plan keeps
the same blind candidate enumeration; steps 2 (star-stabilizer pruning via N) and 3 (C++ int32 in the oracle) pending.

**Result:** `scripts/nclass-bench.ts` A/B against `analyzeSymmetry` on the full k≤11 catalogue (ctrnact.json,
47,854 tilings) = **47,854/47,854 identical labels, 58×** (30.5 → 0.53 ms/tiling; full symclass 25 s vs ~24 min).

**Bug found + fixed en route.** `analyzeSymmetry` mislabeled some **pmm as cmm** (94/2000 at k≤7). Its
essential-glide filter buckets each axis's perpendicular offset to 2 float decimals and string-matches a glide's
bucket against the mirror buckets; a trivial glide sitting ON a mirror at offset ≈0 formatted as `"-0.00"` vs the
mirror's `"0.00"` — a float-ε sign flip — so the on-mirror glide survived as "essential" and flipped pmm→cmm. The
tell is `rectangular|cmm`, impossible (cmm needs a centered=rhombic lattice). Root fix in BOTH classifiers: cm/cmm
vs pm/pmm/pmg is now decided by the EXACT Bravais lattice (centered=rhombic ⇒ cm/cmm), the textbook centering
criterion, not a float glide test; `hasGlide` is kept only where there is no mirror (pgg/pg vs p2/p1), where it is
exact. Wallpaper tests 24/24, `pnpm build` clean.

**Counts + charts corrected.** The k≤11 symclass CSV and the "weight by wallpaper group" chart were built with the
buggy labels; the k≤10 slice also carried the old develop undercount (k=8=2849, k=9=5959). Regenerated both symclass
(nClassify) and weights (wtF) from ctrnact.json: k=1..11 = 10/20/61/151/332/673/1472/2850/5960/11866/24459 (A068599
exact). Charts re-rendered. The cmm/pmm curves moved (now both ≈2k, near-overlapping); the by-lattice chart and the
2k+6 envelope (held by pgg on rectangular, never mislabeled) are unchanged — the headline result stands. Log:
`experiments/results/nclass-speedup-2026-07-10.md`.

## 47. Step 3 landed — C++ int32 wallpaper classifier in the oracle (462×), and the int32-safety question settled by measurement (2026-07-10, session 21)

Step 3 of the "drop bigint → improve → C++" plan: `tools/ctrnact-oracle/eu_classify.cpp`, a native int32 port of
blind `nClassify` over ℤ[ω]. Reads a flat tiling stream (cells JSON → flat via `cells_to_flat.py`), writes
`id,k,lattice,group,orbifold`. Faithful transliteration; the one semantic shortcut is dropping the
offset/essential-glide bookkeeping, which is safe because `hasGlide` is read only where there is no mirror (pgg/pg),
so it cannot change a label. Landed as commit `6de7035` — but that commit updated only the experiments log, so this
milestone and its verification were absent from the ledger until now.

**Independent reproduction this session** (did not trust the commit's numbers). Rebuilt clean, then re-ran every
claim: **200,730/200,730 identical** labels vs TS `nClassify` across k=1..13 (47,854 + 49,794 + 103,082), 0
mismatches, A068599-exact counts per k; **0.066 ms/tiling** (3.17 s for 47,854), = **462×** over the 30.5 ms bigint
baseline and 7.3× over TS. Clean under `-Wall -Wextra` and under UBSan (`-fsanitize=signed-integer-overflow`) over the
whole stream. The correctness chain closes fully only at k≤11 (there TS was gated against the exact `analyzeSymmetry`);
at k=12/13 it is C++ == TS, with TS's own exactness assumed by continuity, not re-proven against bigint. Harness:
`scripts/eu-classify-diff.ts` (the differential the original commit never shipped — now the "0 mismatches" claim is
reproducible).

**The int32-safety question, settled.** I first flagged the int32 arithmetic as a silent-overflow risk (the header's
soundness is a magnitude *probe*, not a bound, and a completeness tool should not fail silently). AL pushed back: if
it's safe, say so. It is. Instrumenting every int multiply/accumulate over all 200,730 tilings, the **peak absolute
intermediate is 176** — int32 (2.147e9) has ~12-million× headroom. And it grows the right way: raw cell coefficients
grow ~linearly in k (26 at k=11, 32 at k=13), and every hot-path multiply pairs one such factor with a
constant-bounded one (`D`, `Dc`, `DDc`, `ω^m`, none growing with k), so intermediates are linear in k, not quadratic.
Overflow would need k ≈ 10^8; the frontier is 13. The int64 hardening I proposed was ceremony — retracted, code stays
int32. Note: `eu_classify.cpp`'s header cites max intermediate 210 / product 3.5e5; those are the conservative dim-8
ζ₂₄ bigint-probe figures (§46) carried over, not the dim-4 int path, which peaks at 176. The code is safer than its
own comment.

Net: the port is correct, fast, and int32 is the right choice. No follow-up. The symclass ladder is closed: step 1
(int) 58×, step 2 (star) measured non-win, step 3 (C++) 462× and folded into the native oracle.

## 48. eu_develop — the last Python oracle stage ported to C++, k pushed to 16, and the proven weight ceiling drawn on the charts (2026-07-10, session 21)

`develop.py` (exact geometric reconstruction: pruned combinatorial solution → `{T1,T2,Seed}` cell in ℤ[ζ₁₂]) was
the only remaining Python holdout in the oracle — solve/prune/classify were already C++. `tools/ctrnact-oracle/eu_develop.cpp`
ports it: reuses the decode already validated in the pruner (vertex-figure tables in `pruner_tables.inc`), adds the
geometric developer — flood-fill placing half-edges at exact ℤ[ζ₁₂] positions, integer lattice HNF from the
wrap-around periods, Lagrange-Gauss reduction, seeds mod Λ. Faithful transliteration; to stay bit-close to Python I
matched its float semantics (banker's rounding via `nearbyint` for the reduction coefficient, floor division in egcd,
lexicographic seed sort). `develop()` needs only `rneig`/`lvert`/`glue`, so the port is small.

**Validation (completeness-grade).** Same-input differential vs `develop.py` on all k≤13 (`work/k16-run/pruned`):
**200,730/200,730 congruent** — 90% byte-identical, the other 10% the SAME lattice Λ with the SAME seed set mod Λ
(an equivalent Gauss-reduced basis; a 1-ULP float sign/tie in the reduction, immaterial to the tiling), 0 not-congruent,
and 0 classification-label diffs (eu_classify on both). For k=14–16 (no practical `develop.py` reference — Python would
be ~19 min) the independent gate is the exact area certificate `ctrnact-recon-check.ts` (Σ face areas = |det Λ|, exact
ℚ(ζ₂₄)): **1200/1200 sampled cells certified**. Every k=1..16 count is exact: 10/20/61/151/332/673/1472/2850/5960/
11866/24459/49794/103082 (A068599 / oracle) and the new records **212631/445289/933637** at k=14/15/16.

**Speed.** 1,792,287 tilings (k=1..16) developed in **67.5 s = 0.038 ms/tiling**, ~19× `develop.py` (0.73 ms/tiling;
the full job would be ~22 min in Python). The oracle is now native end-to-end: develop → classify runs without touching
Python. Also fixed a real bug in `develop.py`: its glob was `eupruned_%02d_*.txt` (family-file naming) and silently
skipped the streamed `eupruned_NN.txt` files — a completeness trap; it now accepts both.

**Charts — the proven ceiling, and it is attained to k=16.** Classified (eu_classify) and weighted (`ctrnact-wtF.ts`,
exact ℚ(ζ₂₄) F-formula on the gauss-reduced basis) the new k=14/15/16 cells, extended both weight charts
(`scripts/ctrnact-family-trends.py`) to k=16, and replaced the old empirical 2k+2 / 2k+4 / 2k+6 guide lines with the
single proven ceiling **W ≤ 2k + 2⌊(k−1)/3⌋** (`docs/WEIGHT_CEILING_PROOF.md`, Thm A/B — the pgg maximum). The
enumeration meets the theorem exactly: the empirical max weight **equals the ceiling at every k = 4..16** (attained,
never exceeded), and pgg is the UNIQUE holder at the jump points k ≡ 1 (mod 3) — k = 4,7,10,13,16 — with pmg tying at
the others, precisely the Theorem A (pgg) vs Theorem C (pmg, one phase behind) structure. The k=14/15/16 maxima are
36/38/42, all = ceiling. Nuance handled honestly: the formula is the width-2 tube maximum, so at k ≤ 3 small rigid
hexagonal (p6m) cells sit ABOVE it (max 5/6/7 vs 2/4/6) before tube economy overtakes them at k=4 — the ceiling line is
drawn only for k ≥ 4, where it is the global envelope. Compact result: `experiments/results/ctrnact-weight-envelope-k1-16.csv`.
The per-tiling k1-16 classify/weight CSVs (~195 MB) are gitignored (regenerable); the k≤13 slices stay committed.

## 49. Native torusFill at ~13×, the TS↔native fill bridge, and the k=3 cost profiled — it is a pruning wall, not a speed one (2026-07-10, session 21)

This is the `PeriodSolver` native track (`native-engine/`), separate from the Čtrnáct oracle track of §44–48. Full
native-side detail lives in `native-engine/README.md`; this note is the algorithmic narrative + the k=3 diagnosis that
hands off to Fable.

**The native torusFill DFS reached ~13× the TS, byte-identical.** Matched bench (`bench-tf`, 12 cases from real k=1/k=2
solves), sum ms/call, each step `make test`-gated at 100,029/100,029:
- memoize `Poly::exactKey` (mutable cache): **254 → 183** (−28%). The "string-bound" cost was *rebuild frequency*
  (stateKey per pop, gate keys), not the decimal format.
- gate `PolyKey` (allocation-free exact membership keys, `exactkey.hpp`) in `countVertexOrbits`: **183 → 161** (−6%).
  The same tuple-key swap in `analyze`/`buildBlock` gave ~0 and was reverted — those are `toVector`/`translate` work.
- fast Cyclo representation, in two byte-identical steps: stack `std::array<i128,8>` (no heap/op) **161 → 127**, then
  **deferred gcd** (reduce+sign eager, gcd lazy behind a `mutable` cache, `ensureCanon` at every reader) **127 → 90**.
  Net **254 → 90 (−65%), 4.6× → ~13×** — the arithmetic-kernel ceiling. Deferred gcd overshot the estimate because
  `latticeEquivExact`/`isLatticeCombo` resolve via `sub().isZero()`, which needs no canonical form, so those Cyclos
  never pay a gcd. Failed-idea note: the identical stack-array change gave ~0 in a *prior* session (pre-memoization,
  when strings still dominated) — same code, opposite result, because the bottleneck had moved.

**The TS↔native fill BRIDGE (`lib/classes/algorithm/nativeFill.ts` + `native-engine/fill-server.cpp`).** Rather than
port the (unsettled, proof-critical, 330-line-in-flight) candidate-lattice enumeration to C++, the TS `PeriodSolver`
keeps enumeration + seed-gen + dedup and ships each *regular* fill to a persistent native `fill-server` over a FIFO
pair (opened O_RDWR so blocking reads work without child fds — Node does not expose child stdio fds). Synchronous
(solve is sync), opt-in `USE_NATIVE_FILL=1` (read per-fill), off ⇒ pure-TS. One guarded line at the top of
`torusFill`; star cores fall back to the TS DFS. Response = compact `{n, anchor=verts[0], dir=edgeDirs[0]}` per rep,
rebuilt via `RegularPolygon.fromAnchorAndDirExact` (same trick as `cellCodec`), byte-equivalent to the TS output.
`ring` is always ζ₂₄ (the Surd lattice enum forces N=24), so the validated native ring is exactly right — no ζ₁₂ risk.
Diag inner-counters are not populated in bridge mode (only the emitted set + solve-level `rawCells`); fine for the
enumeration output. Verified with `probe-pipeline`'s composition digest (order-independent hash of the deduped set):
- k=1 `3,4,6,12`: **10 tilings, digest 476ebbd763fa6193** — TS == native, identical.
- k=2 `3,4,6,12`: **20 tilings, digest f3e2e0517191362c** — TS == native, identical; **85s → 27s (3.2× whole-solve)**.
- k=3: bridge is faithful (first ~10 seeds emit valid cells) but **cannot be digest-compared to pure TS** — TS bails
  heavy seeds at the wall-clock cap, native (13×) explores far more before the same deadline and finds more, so the two
  legitimately diverge on any timed-out seed; a full pure-TS k=3 (no cap) is ~14 h. So k=3's check is "does native-to-
  completion hit the known target 61", not a digest match. (Aside: native fills run uncapped = *most* complete, which
  is doctrinally correct; the recurring "exit 144" on long k=3 runs is the task harness terminating a long background
  job, not a crash.)

**k=3 cost profiled (native fills, 12 clean seeds + seed-gen timing). The cost is ~95% fills, and it is ALGORITHMIC.**
Per-seed `PS_PROFILE`: `fill` 7.6–56 s (99.5%), `cand` ~0 ms, `canon` ~13 ms, `dedup` ~20 ms, `gate` 0 (folded into
the fill). Seed-gen: `buildSeeds` **139.5 s** while `findSeedSets` = **1 ms** and graph = 57 ms. Structure: **449 seeds
/ 184 distinct names** (the `3.3.3.3.3.3 + 3.3.3.3.6` VC-set recurs a dozen+ times, ~9 s each); **~62 of every 69
candidate lattices yield NO cell** (`raw≈7`/69); and both existing prunes are **dormant: `p1Prune=0`, `ssDedup=0`**
across every seed. Total k=3 native ≈ 140 s + 449 × ~9 s ≈ **~70 min** (pure-TS ≈ 14 h). The k→ explosion is a product:
seeds 14 → 40 → **449**; cell-size cap `maxCellPolys = 24k` = 24 → 48 → **72** (DFS depth ⇒ exponential tree);
~69 lattices/seed ⇒ **~31,000 native DFS calls**, each a large exponential search.

**Verdict (grounded): C++/pure speed will NOT crack k=3.** The fills are already native at the arithmetic ceiling; a
further constant factor turns 70 min into 35 min, not into tractable. And porting the *outer* loop to C++ buys ~0 —
`cand` is already ~0 ms, `canon`+`dedup` ~0 ms. This retroactively confirms the bridge-vs-port call. k=3 is where the
enumeration's *algorithmic* cost dominates (the "oracle-anchored, not proof-anchored" region), and it needs **sound
pruning** (every prune proven not to drop a tiling — the doctrine), ranked by expected leverage:
1. A sound **lattice admissibility pre-filter** — a cheap necessary-condition "can this lattice admit a valid cell?"
   test to delete most of the ~62/69 empty fills *before* the DFS. Biggest lever; necessary-conditions are often
   provable. (P0 already removes 102 pre-filter; what survives is still ~90% non-productive.)
2. **Why are P1 orbit-floor + seed-state dedup dormant at k=3?** (`p1Prune=0`, `ssDedup=0`.) These are *already proven*
   and *already implemented*; if they are merely mis-tuned/not-triggering for k=3, re-engaging them is a cheap, sound
   win with no new proof burden. Cheapest thing to try first.
3. **`buildSeeds` = 140 s** (vs `findSeedSets` 1 ms) — an isolated, suspicious asymmetry; the one *outer* piece where a
   C++ port or an algorithmic fix clearly pays. ~3% now, likely worse at k≥4.
4. Cross-seed dedup (449 → 184 distinct + heavy same-name multiplicity) — proving a seed can't contribute a unique
   tiling; bigger proof burden, defer.

Files: `native-engine/{cyclotomic,exactkey,polygon,orbitgate,fillctx}.hpp`, `native-engine/fill-server.cpp`,
`lib/classes/algorithm/nativeFill.ts`, one guarded line + `FillCtx` export in `PeriodSolver.ts` (working-tree,
uncommitted). Handoff to Fable: attack lever #1/#2 (sound pruning), not more speed.
