# 04 — Optimizations (sound levers, mechanical wins, rejected options)

Provenance: verified findings of the 2026-06-09 adversarial review. Back to [README.md](README.md).

**Mandated sequence:** OP-1 → OP-2 → OP-3 → OP-9 (re-measure) BEFORE any k=4 verdict is re-stated.
OP-4 / OP-5 / OP-6 are mechanical and parallelizable. OP-7 / OP-8 are star-lane / deep-fill items.
OP-R records rejected options so they are not re-proposed.

**Digest discipline (applies to every item):** decisive-path changes must keep the k≤2 digests
`6f9ca9cf2d16c75f` / `f3e2e0517191362c` byte-identical and pass the k=3 oracle regression
(`eb34499d5fba3457`). A changed digest = loud stop. Exceptions (OP-1, OP-3) change per-seed *raw*
emissions by design: there the acceptance is catalogue-level per-tiling oracle equality (11/20/61)
plus a one-time digest re-baseline, recorded as such — never a silent baseline swap.

| ID | title | severity | owner | depends on | status |
|----|-------|----------|-------|------------|--------|
| OP-1 | Implement prop:typeprune (closed-cell half + V<k check) | major→minor (verifier) | CC | — | [ ] |
| OP-2 | S1 cross-seed branch-enum amortization / lattice-first inversion | major | CC | — | [ ] |
| OP-3 | S2 grid-isometry lattice orbit dedup + seed-stabilizer quotient | major | CC (+TA lemma) | [TH-9](03-theory-obligations.md) | [ ] |
| OP-4 | Centroid-first cull reorder (canonicalRep / buildBlock / reducedClassKey) | major→minor (verifier) | CC | — | [ ] |
| OP-5 | k=4 seed-build serialize + shard | major→moderate (verifier) | CC | — | [ ] |
| OP-6 | Sub-seed (seed, lattice-index) checkpoints | major→moderate (verifier) | CC | — | [ ] |
| OP-7 | Star predicate stack (filter + coord orient2D + edge bbox) | major | CC | [CB-2](01-code-bugs.md) | [ ] |
| OP-8 | Incremental analyze() vertex-incidence (nearBlock) | minor | CC | — | [ ] |
| OP-9 | Re-measurement protocol before any k=4 verdict | major | CC (verdict: AL/TA) | OP-1, OP-2, OP-3 | [ ] |
| OP-R | Rejected options register | minor/note | CC (docs) | — | [ ] |

---

### OP-1 — Implement prop:typeprune: closed-cell type-set filter + V<k closure check

- **Severity / verdict:** major (finding) → verifier downgraded to minor; **already flagged
  internally** at `../resources/research/route-a-proven-box.md` §"Early-prune rulings" item 3,
  `docs/DEVELOPMENT_NOTES.md` §15.5 P2 bullet, and the SYNC archive (~line 155) — deliberately
  de-prioritized, not overlooked. It leads the mandated sequence because it is the only
  theorem-backed prune still unimplemented and it cuts cross-seed duplicate certification before
  OP-9's re-measure.
- **Evidence:** proof: `../thesis/chapters/correctness.tex:731-751` (prop:typeprune, two-sided).
  Absence: `lib/classes/algorithm/PeriodSolver.ts:873` (`if (!ctx.allowed.has(name)) return false;`
  — subset test only, in `isCompleteTiling`) and `:781` (same in the analyze path); `solve()` sends
  every raw cell to `canonicalKey` + `countVertexOrbits` (~301-319); grep for
  supp/occurring/typeFeas = nothing. Measurements: NOTES §15.3/§15.5 (hard k=3 seed: fill 50.1s/83%,
  gate 9.9s/16.5%, 67/73 completed cells gate-rejected), §19.5 (446 raw certified cells → 61).
- **Problem:** prop:typeprune licenses (i) mid-fill abandonment when a type in supp(M) can no longer
  occur and (ii) discarding a closed cell whose occurring VC-type set ≠ supp(M), *without running the
  orbit gate*. Neither half exists in code. **Honest payoff ceiling (verifier-corrected):** NOTES
  §15.5 records that the 92% gate-rejected <k degenerations on the wall seeds use *full* type
  support, so P2's equality test catches none of them and never touches the 83-88% fill cost; the
  realistic win is a sub-slice of the 16.5% gate share (strict-subset-support fills, e.g. a pure 3⁶
  cell inside a mixed-supp run, die in an O(cell) string compare instead of a ~135ms 7×7 exact
  symmetry search) plus an unquantified cut of cross-seed duplicates (446→61 population).
- **Fix spec:**
  1. Closed-cell half: after `isCompleteTiling`, compute the set of canonical VC names occurring at
     t≥3 vertices (existing `vcRingNames` machinery) and discard unless it equals the seed's
     `allowed` set. Add `p2Skipped` to `PeriodSolverDiag`.
  2. V<k one-liner at closure: `vReps.length` = exact vertex-class count V is already on the DFS
     stack; orbits ≤ V always, so V < k ⇒ gate-reject without invoking KUniformityChecker. (Star
     path: the dent over-count only inflates vReps — sound but conservative.)
  3. Defer the mid-fill half (needs a per-branch "type still placeable" predicate) until the
     closed-cell half's measured win is known.
  4. Gate both OFF for star seeds initially (same doctrine as P0/P1), and enable unconditionally
     only in the proven configuration; in fast-path mode pair with the oracle regression
     (prop:typeprune's recovery routes through prop:fanseed — rem:fastpath caveat inherited).
  5. Do NOT compensate by shrinking the gate's 7×7 window / 1.6·cellDiam radii
     (`KUniformityChecker.ts:55, 85-87`; constants carry only asserted slack,
     correctness.tex ~167-170): a missed symmetry inflates orbit counts and gate-rejects a TRUE
     tiling — the dangerous direction.
- **Acceptance:** deduped catalogue provably unchanged — per-tiling oracle match 11/20/61. Per-seed
  composition digests WILL change (fewer raw emissions): re-baseline k≤3 digests in one commit with
  the oracle regression attached; record the re-baseline in SYNC.
- **Cross-refs:** [TH-13](03-theory-obligations.md) (star dent-fillability before enabling P2 on
  stars), [OP-9](#op-9--re-measurement-protocol-before-any-k4-verdict), [DG-1](00-decision-gate.md).

---

### OP-2 — S1: cross-seed branch-enum amortization / lattice-first loop inversion

- **Severity / verdict:** major, isReal, high confidence, not previously addressed. The strongest
  verified lever against the §23.9 "no sound count-lever" universal negative: it attacks the
  dominant setup term, and soundness is trivial (memoization of a deterministic function).
- **Evidence:** branch enumeration depends only on (Λ, ring, polySizes, k) — never the seed:
  worktree `~/.config/superpowers/worktrees/TilingAtlas/orbifold-branch-enum/lib/classes/algorithm/PeriodSolver.ts`
  `equivariantFillForLattice` calls `enumerateNormalizedBranches(u, v, ctx.ring, ctx.polySizes, k, …)`
  (no seed argument) per (seed, lattice); only the displacement set is cached
  (worktree `OrbifoldNormalized.ts` `_displacementCache`). Main repo: `candidateCache` is per
  (N, vcSig, k) and "SEED-FREE" by its own comment (`lib/classes/algorithm/PeriodSolver.ts:67, 396,
  538`) — generation is amortized but the downstream per-(seed,lattice) loop is not. Multiplicity:
  7362 *distinct* oblique lattices at k=3 (NOTES:1443, 1522 — measured on {3,4,6,12}) vs Σ oblique
  survivors 127746 on {3,4,6} ⇒ **~17× multiplicity** (strictly: ≤17×, families differ — see OP-9).
- **Problem:** the §23.9 cost model is cost ≈ count × setup, where count = Σ over seeds of
  per-seed candidate lattices, i.e. (seed,lattice) WORK ITEMS — the same lattice pays branch-enum
  once per seed whose candidate list contains it. The "11M+ candidate lattices, each needing
  branch-enum" k=4 projection charges branch-enum to every work item; amortizing it per distinct
  lattice removes ~17× of that charge at k=3, more at k=4 (seed multiplicity is the exploding
  factor: 10→26→323). Caveat (verifier): fills are conserved and the seed-dependent
  buildBlock/overlap residual remains ∝ work items — this is a setup lever, not a count lever.
- **Fix spec:**
  1. Memoize branch-family enumeration per `latticeKey` (a Map; key exists at
     `lib/classes/algorithm/LatticeEnumerator.ts:478`). No theory needed.
  2. Equivalently/additionally, invert the loop: the proven candidate box (cor:box) is seed-free —
     enumerate distinct lattices once, map each to its feasible seeds via the exact area set,
     iterate lattice-first.
  3. Emit a diag counter: branch-enum cache hits vs misses, and the distinct-lattice count per
     holohedry class (feeds OP-9 directly).
- **Acceptance:** byte-identical k≤2 digests + k=3 oracle regression (pure memoization — any digest
  change = bug = loud stop). Then re-run the k=1..3 curve reporting distinct-lattice counts
  alongside Σ (OP-9 input).
- **Cross-refs:** [OP-3](#op-3--s2-grid-isometry-lattice-orbit-dedup--seed-stabilizer-quotient),
  [OP-9](#op-9--re-measurement-protocol-before-any-k4-verdict).

---

### OP-3 — S2: grid-isometry lattice orbit dedup + seed-stabilizer quotient

- **Severity / verdict:** major, isReal, high confidence, not previously addressed (two verified
  findings merged: the grid-orbit form and the Stab(core) form — one group action factored two
  ways). Verifier caveat on the stabilizer form: live hard seeds use multi-VC rigid cores with
  generically trivial stabilizers, so the projected 6-12× is speculative — measure first (step 1).
  Explicitly NOT the prohibited mid-fill symmetry-abandonment prune (NOTES §15.4 /
  rem:unsoundprunes): this is a pre-fill reject-or-recover quotient, the isometric generalization
  of the licensed §16.4 seed-state dedup.
- **Evidence:** `latticeKey` (`lib/classes/algorithm/LatticeEnumerator.ts:478-486`) is
  Gauss-reduce + sign/order normalization only — NOT D_N-invariant: Λ and ζ^r·Λ get distinct keys.
  `obliqueCells` pair-sweeps the direction-closed pool (latticeKey use at `:181`), `roundCells`
  pairs every pool vector with ω/i (`:259`); an oblique (hol=2) lattice — 69% of post-P0 survivors
  (STATUS.md) — carries the maximal rotation orbit (up to 12 copies), hexagonal only ~4. Licensing:
  `../thesis/chapters/correctness.tex:660-674` (rem:fastpath) states verbatim the dual reduction:
  "the orientation range may soundly be reduced to coset representatives of the rotational
  symmetries of Λ". No stabilizer use anywhere in PeriodSolver (grep). Late merge is cheap:
  `dedupeByCongruence` (`lib/classes/algorithm/TilingCongruence.ts:197`) 0.43s vs fill 50.1s
  (NOTES §15.3) — the duplicate cost is paid in *generating congruent fills from rotated lattices*,
  not in the final merge.
- **Problem:** every grid-rotated/reflected copy of each oblique lattice shape is filled from the
  same fixed core and merged only at the end; one representative per grid-isometry orbit (with
  explicit rotation seeding) or per Stab(core)-orbit is provably lossless: g with g(core)=core maps
  completions of (core,Λ) bijectively to completions of (core,gΛ); certificate, primitivity, and
  orbit count are isometry-invariant (same invariance prop:gate/lem:equicert rely on).
- **Fix spec:**
  1. **Measurement first (hours):** instrument the k=3 sweep to log |Stab(core or fan)| per
     seed-set and S-orbit sizes of its post-P0 lattice list. Build step 3 only if aggregate >1.5×.
  2. **Theory gate:** TA writes the bijection lemma — [TH-9](03-theory-obligations.md) — alongside
     rem:fastpath (~10 lines reusing lem:equicert invariance). No code lands before TH-9.
  3. Implement `stabilizer(corePolys)` exactly (KUniformityChecker-style candidate+verify: map a
     reference tile onto each same-name core tile by ζ^r / conj·ζ^r + T, check exact-key set
     preservation; ≤ |core|·2N candidates on a ≤12-tile core). Filter the cached lattice list to
     orbit representatives keyed by `latticeKey(g·basis)`; per-seed-set stabilizer when
     coreOverflows produces multiple fan seeds (the lattice loop is shared). For the grid-orbit
     form: canonicalize latticeKey over the ≤48 grid point-group images with explicit rotation
     seeding (12 seed rotations on 1 lattice instead of 1 orientation on 12 lattices — fills
     conserved, per-lattice setup divided by ~12-24 on the dominant class). Verify the cached pool
     is closed under the stabilizer action before quotienting.
  4. Emit a diag counter (`orbitSkipped`).
- **Acceptance:** per-seed raw counts/digests change by design ⇒ catalogue-level per-tiling oracle
  equality 11/20/61 + k=3 oracle regression + one-time digest re-baseline (same procedure as OP-1).
  Reflections covered by lem:reflectioncover (regular family only — do NOT enable for stars until
  [TH-6](03-theory-obligations.md) settles star chirality).
- **Cross-refs:** [TH-9](03-theory-obligations.md) (blocking), [OP-2](#op-2--s1-cross-seed-branch-enum-amortization--lattice-first-loop-inversion),
  [OP-9](#op-9--re-measurement-protocol-before-any-k4-verdict), [TH-6](03-theory-obligations.md).

---

### OP-4 — Centroid-first cull reorder in canonicalRep / buildBlock / reducedClassKey

- **Severity / verdict:** major (finding) → verifier: real, byte-identical-by-construction, but a
  constant-factor cleanup misbadged major; one evidence citation (NOTES 1601-1628 "setup tax")
  actually describes the buildSeeds startup tax, and the "count × setup" wall attribution is the
  orbifold path while the edited code is the torus path — the churn still sits inside the per-pop
  fill timer, so the target is real but the 2-3× magnitude is unverified.
- **Evidence:** `lib/classes/algorithm/PeriodSolver.ts:953` `canonicalRep` — 5×5 translate loop
  doing `q = r0.clone(); q.translateExact(T)` BEFORE the float radius cull; `:987` `buildBlock` —
  per-(m,n) cull already centroid-first, but per-rep clone+translate precedes its cull; `:980`
  `stateKey` — sort+join of ~|reps| exact-key strings per DFS pop (pop sites `:682-684`, probe
  `:290`). `TilingCongruence.ts` `reducedClassKey` (function at `:42`; memoized per (polygon, Λ)
  at `:200` but every miss pays 24 clones). Cost asymmetry: `Polygon.translateExact` maps all
  exact vertices/halfways/centroid through `Cyclotomic.add` (per-op gcd canonicalization,
  `Cyclotomic.ts:174-192`) + `refreshFloatCache`; a centroid-only exact add is ~1 Cyclotomic op.
- **Problem:** in the three hottest setup loops the full polygon is cloned, exact-translated, and
  float-refreshed before the float radius cull that rejects most translates. Computing the
  translated exact centroid alone (`r0.exactCentroid.add(T).toVector()`), culling on its float, and
  cloning only survivors is decision-identical: Cyclotomic is an immutable canonical value type and
  toVector is a pure trig-free function of (num,den), so the kept/culled decision consumes the
  bit-identical float.
- **Fix spec:**
  1. Reorder all three sites: exact-centroid add → float cull → clone survivors only.
  2. stateKey: carry an insertion-sorted key array on the DFS stack, join once per pop. Do NOT
     replace with a lossy hash — `seenState` is a decisive dedup; a collision silently DROPS a DFS
     state = completeness bug. If hashing ever, keep full keys behind a collision check.
  3. Re-profile the k=4 strided sample (`scripts/profile-k4-sample.ts`) after landing to re-measure
     the setup share — do not assert the 2-3× without it.
- **Acceptance:** byte-identical k≤2 digests `6f9ca9cf2d16c75f` / `f3e2e0517191362c` — this change
  is in the MUST-be-digest-neutral class; its acceptance test is exactly that, plus the k=3 oracle
  regression.
- **Cross-refs:** [CB-6](01-code-bugs.md) (the adjacent `properOverlapWithBlock` 2.5-constant
  *correctness* finding — filed there, do not fix here), [OP-8](#op-8--incremental-analyze-vertex-incidence-nearblock).

---

### OP-5 — k=4 seed-build: serialize once + shard the build

- **Severity / verdict:** major (finding) → verifier: diagnosis **already flagged internally** at
  NOTES §22.2:1605-1606 (same file:lines), `../thesis/chapters/results.tex` sec:val-k4 item 2, and
  TA_LOG — only the remediation is new. Correction: workers rebuild CONCURRENTLY, so duplication
  costs CPU + RAM (≥1.7 GB × 8 ≈ 14 GB — real laptop swap risk), not W× wall; only sharding the
  build delivers wall-clock gains (~1-5 h → ~10-40 min). Value contingent on the torus/equivariant
  path ever re-running at k=4 — see [DG-1](00-decision-gate.md).
- **Evidence:** `scripts/scout-worker.ts:30-45` — every worker runs PolygonsGenerator → VCGenerator
  → CompatibilityGraph → SeedSetExtractor → SeedBuilder with the identical-ordering comment
  ("index i means the SAME seed in every worker") — 8× duplicated by design (guard #4, no shared
  mutable state). Measurements: NOTES §22.2 — buildSeeds(4) >43 min single-threaded DNF, RSS
  1.7 GB; 1.9-9.0 s × 2072 sets ⇒ ~1-5 h; §22.4: "deliberately not launched" partly for this.
  Wire codec exists: `scripts/scoutCodec.ts` (exact PeriodCell serialization; seeds also carry
  vertexConfigurations, so the seed codec is an extension, not a drop-in reuse).
- **Problem:** ~1-5 h of deterministic, identical-by-construction work duplicated per worker and
  re-paid on every crash-restart, plus an 8×1.7 GB RAM footprint before the first fill.
- **Fix spec:**
  1. Add `scripts/build-seeds.ts`: build + serialize per-(k,tiles) to
     `.scout-cache/seeds_k4_*.bin` with a content digest in the header.
  2. Add `--seeds-file` to scout-worker: deserialize instead of rebuild.
  3. Better: shard the BUILD itself — SeedBuilder per seed-set is independent; parallelize the 2072
     sets over the existing dynamic worker queue with deterministic index assembly.
  4. Pre-empt wasted effort: per-process poolCache/candidateCache duplication is measured
     negligible (candidate enum 0.024 s at k=3, NOTES §15.3) — do NOT build shared caching.
- **Acceptance:** one-time A/B at k=3: deserialized seed list's exact keys byte-equal a fresh
  build's. k≤3 scout digests unchanged.
- **Cross-refs:** [OP-6](#op-6--sub-seed-seed-lattice-index-checkpoints), [DG-1](00-decision-gate.md).

---

### OP-6 — Sub-seed (seed, lattice-index) checkpoints with enumeration-order version tag

- **Severity / verdict:** major (finding) → verifier: real and determinism-sound, medium
  confidence; severity overstated — the "8-hour run lost to macOS sleep" anecdote is NOT in the
  ledgers (only an unquantified sleep flag in agent memory; the 8 h figures are star-scout
  *projections*), and the strongest motivating regime (k=4 torus) is cancelled. Real beneficiaries:
  the outstanding proven-config k≤3 regression run and the ~8 h star sweep —
  `scripts/scout-star-inring.ts` has NO resume infrastructure at all.
- **Evidence:** `scripts/scout-parallel.ts:74` ("a shutdown loses at most the seeds in flight"),
  `:117` (NDJSON write only on seed completion), `:165` (dead worker → re-queue, seed restarts from
  lattice 0). Determinism premises hold: exact-area stable sort at
  `lib/classes/algorithm/PeriodSolver.ts:521`, `candidateCache` keyed (N:vcSig:k) `:396/:538`,
  per-lattice fills independent in the solve loop; within-seed `seenCanonical` dedup is idempotent
  under the coordinator's final `dedupeByCongruence`.
- **Problem:** the resume atom is the whole seed; at long-run scale (multi-hour star sweep,
  weeks-regime k=4 if ever revived) a crash/sleep loses all in-flight per-seed work even though the
  candidate list is deterministic and per-lattice results are independent.
- **Fix spec:**
  1. Extend the NDJSON schema: `{type:'partial', idx, latDone, cells:[…scoutCodec…], ms}` flushed
     every N≈50 lattices or T seconds.
  2. On resume: re-run candidateLattices (cheap, 0.024 s at k=3), skip the first `latDone` entries,
     feed PeriodSolver a `startLattice` offset + pre-found raw cells.
  3. **Enumeration-order version tag** in the file header (hash of enumeration-affecting code/
     params); refuse mismatched resumes LOUDLY — never silently, per doctrine.
  4. Aggregate cumulative ms across resume segments so "certified = 0 timeouts" stays meaningful.
  5. Port the same mechanism (or at minimum seed-level resume) to `scripts/scout-star-inring.ts`.
- **Acceptance:** kill/resume a k=3 sweep; final digest equals the uninterrupted run's
  `eb34499d5fba3457`.
- **Cross-refs:** [OP-5](#op-5--k4-seed-build-serialize-once--shard-the-build),
  [ST-2](05-star-and-new-directions.md) (star sound-run config).

---

### OP-7 — Star predicate stack: sound sign filter + coordinate-form orient2D + per-edge bbox broadphase

- **Severity / verdict:** major, isReal, high confidence, not previously addressed (WEAK_SPOT B1
  flags a *different* site — PeriodSolver float area comparisons; the Surd.sign filter,
  coordinate-form orient2D, and edge broadphase appear nowhere). The soundness half is
  [CB-2](01-code-bugs.md) — specified there; this item owns the performance half and the
  integration order.
- **Evidence:** `lib/classes/algorithm/exact/Surd.ts:137` — `sign()` returns the float sign
  whenever |toFloat()| > 1e-6 ABSOLUTE, no operand-height guard, on the decisive path (cmp, area,
  holohedry, star orient2D). `exactOverlap.ts:24` — orient2D = imSurd(conj(u)·v): one full ring
  conj-multiplication (8×8 bigint convolution + Φ₂₄ reduce + gcd, `Cyclotomic.ts:219-231`);
  `:45-53` — 4 orient2D per cross test; `:101` — `exactPolygonsOverlap` runs
  segmentsProperlyCross + collinearSameSideOverlap on ALL la·lb edge pairs (256 for two 16-gon
  stars), zero internal broadphase. Cost: NOTES §24.7 — ~100-1100 candidates/seed, ~1-30 s/solve,
  ≈8 h for the sound 4896-VC sweep.
- **Problem:** the star-exact predicate layer is architecturally right (sign-only, no constructed
  points) but pays 4 ring conj-muls per segment test with no edge-level cull, and its float fast
  path is the project's own decisive-path fragility. The CGAL/Shewchuk-style semi-static filter
  (accept float sign iff |f| > c·ε·M, M = (|P|+|Q|√2+|R|√3+|S|√6)/D) is simultaneously the
  soundness fix and the correct lazy-evaluation architecture — never wrong (forward error bound)
  and faster in the common case. **Honest ceiling:** the dominant star-lane lever is the dent-aware
  area set ([TH-3](03-theory-obligations.md) Increment 3), not the predicate — but the predicate
  stack is on the decisive path for every star family forever. Sequencing rule (verified minor
  finding): land the sharp dent-aware area set BEFORE any star poolLmax increase — the loose ladder
  both inflates candidates (~100-1100/seed = the 8 h wall) and floods INCOMPLETE-REGION to millions
  of skips (NOTES §24.8.5 vs ~108 regular), corroding the loud-truncation doctrine; aggregate
  truncation logs per-cause.
- **Fix spec (three increments, each digest-checked):**
  1. Semi-static filter in Surd.sign per [CB-2](01-code-bugs.md) (derive and comment the constant
     c — count the roundings carefully, the finding's "≤8" undercounts (~15), c≤16 with slack;
     regression brute-forcing random large-coefficient Surds against signExact).
  2. Cache (reSurd, imSurd) per exact vertex on Polygon; coordinate-form orient2D
     `(bx−ax)(cy−ay) − (by−ay)(cx−ax)` = 2 Surd.mul (16 bigint products each) instead of ~64 —
     identical exact value, est. 2-4× per predicate.
  3. Precompute per-edge float bboxes per polygon; cull edge pairs before exact tests (bbox overlap
     is a necessary condition for both predicates — conservative, sound). Expect less than the
     headline 5-10× because `properOverlapWithBlock` already restricts to close pairs.
- **Acceptance:** existing exact-overlap test suite + fuzz comparing old/new predicates on random
  star pairs; k≤2 digests byte-identical; star spike's Myers 4(j) certificate unchanged.
- **Cross-refs:** [CB-2](01-code-bugs.md) (blocking for increment 1), [TH-3](03-theory-obligations.md)
  (dent-aware area set — the bigger lever), [ST-2](05-star-and-new-directions.md) (pool-reach
  reporting), [CB-6](01-code-bugs.md).

---

### OP-8 — Incremental analyze(): carry a nearBlock on the DFS stack

- **Severity / verdict:** minor (⚠ unverified (cap) — verdict null; spot-checked code citations
  below myself: analyze/buildBlock/child-extension sites confirmed on the working tree).
- **Evidence:** `lib/classes/algorithm/PeriodSolver.ts:741` `analyze(reps, ctx, prebuilt?)` — full
  pass over every block polygon: float centroid cull against fixed incR, then per-vertex Map insert
  with key() string lookups, every pop. The block itself is already extended incrementally per
  child (`:720` `block.concat(this.buildBlock([pc.poly], ctx, 5))` — the audit C1 fix), so the
  sibling structure is missing: per-pop cost stays O(|block|) even when the pop adds one tile.
  Pre-C1 measurement ~40 ms/pop dominated by rebuild (NOTES §13.6). Payoff concentrates where fills
  are deep and blocks large — the k=4 torus regime (25/25 strided fills timeout, fill ≈ entire
  budget, NOTES §22) and large star cells.
- **Problem:** per-branch cost scales like O(tiles × block) ≈ O(area²) at k=4 cell sizes (~96
  tiles, blocks ~10³ polygons) because the incidence inputs are recomputed from scratch although
  the delta per pop is exactly the new tile's translates.
- **Fix spec:**
  1. Carry a `nearBlock` array (block tiles within incR — incR is fixed per lattice) on the DFS
     state, extended with the same disjoint-translate logic as block; have analyze iterate
     nearBlock. Allocation-free per pop beyond the child push; trivially correct (incR constant,
     translate sets disjoint) — identical analyze() inputs/outputs.
  2. Only optionally and AFTER measuring: copy-on-extend the incidence Map itself — copying a
     multi-thousand-entry Map per push can cost as much as rebuilding over nearBlock.
- **Acceptance:** byte-identical k=1/2 digests; then PS_PROFILE on the k=4 strided sample
  (`scripts/profile-k4-sample.ts`) to quantify — do not assume the share.
- **Cross-refs:** [OP-4](#op-4--centroid-first-cull-reorder-in-canonicalrep--buildblock--reducedclasskey).

---

### OP-9 — Re-measurement protocol: required before any k=4 verdict is re-stated

- **Severity / verdict:** major (two verified findings: the "super-k⁴ / un-tameable" over-read,
  medium confidence — operative conclusions partly insulated, but the Σ-vs-distinct multiplicity
  and the family mismatch are flagged nowhere; and the M1 count-curve gate critique, high
  confidence — the executed D-D-vs-torus comparisons contain ZERO oblique tilings, the class that
  forced the pivot).
- **Evidence:** worktree NOTES §23.9:1851-1879 — the 183→3103→186190 table ({3,4,6} in the header),
  "super-k⁴ **in this range**", the "~186k × (≥60×) ≈ 11M+ … un-tameable" projection with "≥60×"
  unfit; STATUS.md:40 and SYNC propagate "super-k⁴, ACCELERATING" *dropping the range hedge*. The
  metric is Σ per-seed `diag.candidateLattices` = (seed,lattice) work items; distinct oblique
  lattices at k=3 = 7362 (NOTES:1443/1522, on {3,4,6,12}) vs Σ 127746 (on {3,4,6}). Decomposition
  already recorded: per-seed candidates DECELERATE (18.3→119.3→576.4 = 6.5×→4.8×, "~cubic"), seed
  count explodes (10→26→323 = 2.6×→12.4×). Thesis k=4 wall: `../thesis/chapters/results.tex`
  sec:val-k4 — TORUS path on {3,4,6,8,12}, fill-cost binding (25/25 timeouts), equivariant-fill
  question explicitly held open. Oblique census 0,0,2,5,18,30 at k=1..6 (NOTES §12.2/§14.1). D-D
  cost asymmetry: ~404M generation-tree nodes for δ≤24 at k=2 (~2.24^δ) vs torus candidate enum
  0.024 s / 0.04% of k=3 runtime (NOTES §15.3).
- **Problem:** the current k=4 verdict rests on (a) a composite work-item metric never reported
  against distinct-object counts, (b) a {3,4,6} curve standing in for the {3,4,6,8,12} target, (c)
  two wall narratives (torus: fill cost; orbifold: candidate count) never reconciled on one family,
  and (d) a D-D pivot gate that compares differently-inflated proxies (output counts, not costs)
  on a population containing zero oblique tilings — the oblique class is anti-correlated with D-D's
  strength (trivial stabilizers ⇒ δ near the 12k ceiling ⇒ deepest tree region).
- **Fix spec (the protocol — run only AFTER OP-1, OP-2, OP-3 land):**
  1. **Distinct vs Σ:** every count table reports, per holohedry class, BOTH Σ (seed,lattice) work
     items AND distinct-lattice counts (instrumentation exists — the §20.4 harness; OP-2's diag
     counter). Never publish a Σ without its distinct companion again.
  2. **Target family:** measure the k=1..3 curve on {3,4,6,8,12}, not {3,4,6}. The {3,4,6} curve
     may be kept as a comparison row, clearly labeled.
  3. **One reconciliation table** with columns: path (torus | orbifold-equivariant), family, k,
     Σ work items, distinct lattices, per-fill cost (measured), wall = (fill-cost | candidate-count),
     completeness status of the measurement (complete post-P0 vs coverage-truncated). This table
     reconciles results.tex's "fill stage is the binding wall" (torus DFS, exponential in cell
     size) with §23.9's "the wall is the candidate count, per-fill O(1)" (orbifold seeded fill) —
     they describe different fills; the table must say so explicitly.
  4. **Verdict language:** restate as "the per-(seed,lattice) work-item count on {3,4,6} grew 17×
     then 60×; growth decomposes as decelerating per-seed lattices × exploding seed multiplicity."
     Delete "super-k⁴ ACCELERATING" from STATUS/SYNC propagation or restore the "in this range"
     hedge; the "≥60×" extrapolation must not survive into any thesis text
     ([TX-2](02-thesis-alignment.md) owns the results-chapter side).
  5. **Pivot-gate correction:** the M1 count-curve comparison is retained as a
     generator-correctness check only. Any k≥4 method decision uses a cost-curve at equal
     completeness — total cost (nodes or wall-clock) to COMPLETE δ≤12k (or a proven B(k)) at k vs
     total torus/orbifold cost to complete k — and requires ≥1 oblique-class data point: compute
     the D-symbols of t3046/t3055 from the certified catalogue, report their δ and the node budget
     to reach them (the quotient-first probe [ST-6](05-star-and-new-directions.md) supplies the
     same objects).
  6. Only after 1-5: re-project k=4 and put the number to [DG-1](00-decision-gate.md). If the
     re-projection lands within weeks of 8-core compute, the build-vs-pivot decision is formally
     revisited — the prior decision input was the un-amortized Σ.
- **Acceptance:** the reconciliation table exists in the engineering notes with both count columns
  on {3,4,6,8,12}; STATUS/SYNC verdict text updated; no thesis chapter cites 186190 / 11M /
  "super-k⁴" unhedged (grep). Digest discipline: measurement-only — no decisive-path change.
- **Cross-refs:** [OP-1](#op-1--implement-proptypeprune-closed-cell-type-set-filter--vk-closure-check),
  [OP-2](#op-2--s1-cross-seed-branch-enum-amortization--lattice-first-loop-inversion),
  [OP-3](#op-3--s2-grid-isometry-lattice-orbit-dedup--seed-stabilizer-quotient),
  [DG-1](00-decision-gate.md), [ST-6](05-star-and-new-directions.md), [TX-2](02-thesis-alignment.md),
  [TX-6](02-thesis-alignment.md).

---

### OP-R — Rejected options register (do not re-propose)

- **Severity / verdict:** minor/note (verified minors). Purpose: record rejections WITH reasons so
  future sessions do not re-litigate them — the project's own doctrine (cf. settled-decisions list
  in CLAUDE.md).
- **Evidence & rulings:**
  1. **Wholesale integer-rescaled / fixed-denominator / number-backed exact arithmetic — REJECT.**
     The measurements exonerate bigint: K2_DIAGNOSIS measured maxBits 3-4 at the real gate;
     "arithmetic never the bottleneck" — the exact layer's real cost is allocation, gcd
     canonicalization passes, and string-key construction (targeted by OP-4/OP-8). Coordinates
     already ARE integers over a small denominator (vertices den=1; centroids den ≤ n; lattice
     vectors den ≤ MAX_LATTICE_DEN=12, `LatticeEnumerator.ts:20`) — no rational tax to remove. A
     float53-with-overflow-promotion coefficient path adds a soundness surface on the decisive path
     for an unmeasured win — the exact trade the doctrine forbids. **Accepted residue (one commit,
     not a campaign):** den===1 / D===1 constructor fast paths in `Cyclotomic.ts` (g is seeded from
     |den|, so den=1 ⇒ the 8-element gcd loop provably yields 1 and the division map is a copy —
     skip both; identical canonical form) and the same in `Surd.ts`; digest-checked at k≤2. Keep
     string key() as-is: keys feed decisive Set/Map dedups (seenState, seenCanonical) where a hash
     collision = a silently dropped DFS state = completeness bug.
  2. **SAT/CP/ILP for the torus fill — REJECT.** Tile positions live in ℤ[ζ₂₄]/Λ, which is dense
     (CLAUDE.md settled decision; step-count-bounded pool in LatticeEnumerator): there is no finite
     a-priori variable set, so any encoding must embed the corner-completion search it is meant to
     check — circular. For the orbit gate — REJECT: already exact and 16.5% of cost. A post-hoc
     per-cell verifier needs no SAT: certificate predicates are independently re-checkable; the
     star spike's G1-G4 independent harness (NOTES §23.3) is the working template. **Narrow
     accepted role (recorded, gated):** IF the D-D lane ever carries a k≥3 claim, an
     enumeration-order-independent cross-check of per-δ layer counts at δ∈(12,~18] — CNF of DS0-DS4
     + m-labels with blocking-clause model enumeration canonicalized through the EXISTING Alg-8
     code, or (preferred if tooling friction is high) a second independently written orderly
     generator compared layer-by-layer. This guards the exact bug class that produced `2c8ad69`
     (correct-looking code, green tests, silent under-count) in the band above the brute oracle's
     reach (δ≤12) — but does NOT guard Alg-8 itself (shared component).
  3. **Canonical augmentation / orderly-generation restructuring — REJECT as restructuring.**
     Already in place where it matters: torus lattices are deduped at generation (`latticeKey`) and
     filtered arithmetically pre-fill (P0, `PeriodSolver.ts:523-536`), the expensive stage sees
     each lattice once, and the final congruence dedup costs 0.43 s vs 50.1 s fill; orbifold
     cyclic-rotation branches are generated once-per-class via the SNF quotient bypass; dihedral
     admission is an exact predicate, not generate-then-dedup. The one outstanding
     canonical-augmentation item: the **tile-axis pure-mirror enumerator** (reflections riding the
     bounded-weight pool are the worst measured generation cost — E1 hex keeps the pool on 37/45
     lattices at 414,954 ms vs oblique 25 ms), proof-backed by the TA tile-axis lemma
     (`../resources/research/reflection-tileaxis-lemma-2026-06-07.md` §2/§6) with the MANDATORY
     constraint of one branch per candidate axis and NO intersection pre-filter (the O(1)-survivors
     construction was ruled a forbidden completeness knob — it drops the 4.4.4.4 swapped-tile
     mirror). Build it only if the orbifold lane is revived (k≤3 cross-validator or star families);
     it does not move the oblique candidate COUNT and so does not reopen orbifold k=4.
- **Fix spec:** one paragraph per ruling in the engineering notes (DEVELOPMENT_NOTES, next
  section), each ending "rejected on <measurement> — do not re-propose without new measurements";
  the den==1 fast-path PR as the only code change.
- **Acceptance:** notes paragraph merged; den==1/D==1 PR passes byte-identical k≤2 digests.
- **Cross-refs:** [OP-4](#op-4--centroid-first-cull-reorder-in-canonicalrep--buildblock--reducedclasskey),
  [OP-9](#op-9--re-measurement-protocol-before-any-k4-verdict), [TH-11](03-theory-obligations.md)
  (D-D realizability — the SAT cross-check's neighbor), [DG-1](00-decision-gate.md).
