# Development notes & assessment — k-uniform tiling algorithm

> **Purpose.** A complete narrative record of the algorithm's design, an assessment of its
> correctness and direction, and the full development journey — *including the ideas that did not
> work and why* — so the thesis can be written from the actual history, not just the final state.
>
> Companion docs: [`CYCLOTOMIC_SPEC.md`](CYCLOTOMIC_SPEC.md) (exact-arithmetic engineering brief),
> [`K2_DIAGNOSIS.md`](K2_DIAGNOSIS.md) (the detailed k≥2 performance measurement log),
> [`../public/theory/algorithm.md`](../public/theory/algorithm.md) (the *documented* 7-step design).
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
one it does. [`algorithm.md`](../public/theory/algorithm.md) should be updated to describe
*expand-and-extract + orbit gate* (this is tracked as a remaining task).

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
| k=2 count = 20 | ⚠ **15/20** | hard seeds now finish (no hang); the 5 missing are the lattice-discovery coverage gap (§9.1), not a termination failure |

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
5. **Update [`algorithm.md`](../public/theory/algorithm.md)** to document the implemented
   solve-for-period (torus-fill + orbit-gate) method (it currently describes the unused wallpaper
   approach).

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

### 12.7 k=2 result and the over-count diagnosis (the remaining gap)
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
   current `canonicalKey` is none of the latter two for the snub. **This is the only thing standing
   between the current pipeline and a correct k=2 = 20.**
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

### 12.11 Immediate next step
Implement the **chirality- and representation-robust tiling dedup** (merge the snub's mirror lattices +
representations). Cleanest: dedup by a canonical key computed from a fixed-radius vertex-star patch,
normalized over reflection AND the actual (possibly off-grid) lattice orientation — rather than over the
24 grid rotations of one cell's polygon set. Expectation: k=2 → exactly 20. Then re-run twice to confirm
the composition digest is identical (determinism), then `algorithm.md` update + the fill speed pass.
