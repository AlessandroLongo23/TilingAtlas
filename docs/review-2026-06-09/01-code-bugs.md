# 01 — Code bugs & hardening (CB-1..CB-9)

Work-order spec from the verified findings of the 2026-06-09 adversarial review. Back: [README.md](README.md).

Line numbers verified 2026-06-09 against the working tree on `feat/c7-star-spike` (drifts from the
review's citations are noted per item). **Digest discipline:** items marked *decisive path* must keep
the k=1/k=2 probe digests `6f9ca9cf2d16c75f` / `f3e2e0517191362c` byte-identical and pass the k=3
per-tiling oracle regression (61, byte-identical set). A changed digest = loud stop, investigate
before proceeding. Items marked *diagnostics-only* add stderr/throw/assert surfaces and must leave
digests trivially unchanged — run the k≤2 regression anyway.

| ID | Title | Severity | Owner | Depends on | Status |
|----|-------|----------|-------|------------|--------|
| CB-1 | Exact certificate area leg (replace float 1e-4) | major | CC | — | [x] done (`cellAreaSurd`, NOTES §30-era; k=3 oracle reg `k3-oracle-regression-cb1-*.log`) |
| CB-2 | Surd.sign semi-static error-bound filter | major | CC | — | [x] done `216302b` (NOTES §30) |
| CB-3 | Emit the join-waived truncation (nearRational) | major | CC | — | [x] done (join-waived emission live — fires on k≤2 runs) |
| CB-7 | Primitivity-rejection guard | major | CC | — | [x] done `eefa6ac` (NOTES §32; Finding-2 follow-ups `9674c95`) |
| CB-8 | Pool-reach loud truncation assertion | major | CC | [DG-1](00-decision-gate.md) (informs) | [x] done `eefa6ac` (NOTES §32) |
| CB-5 | KUniformityChecker N≠24 must throw | major | CC | — | [x] done `983b8e3` (NOTES §35) |
| CB-4 | Merge assertEquivalencePartition + standing congruence differential | major | CC | feat/c4-pool-bypass branch | [x] done `942da53` (+§35 guard-discovery fix `c802989`) |
| CB-6 | properOverlapWithBlock 2.5 centroid cull false for 8/12-gons | minor | CC | — | [x] done `46b0f79` (NOTES §35; OP-9 owns the k=4 re-measure) |
| CB-9 | Evidence hygiene (commit §23.9 + D-D artifacts, push branches) | major ⚠ unverified (cap) | CC | — | [x] done (experiments committed; all branches pushed 2026-06-10) |

---

### CB-1 — Exact certificate area leg (replace float 1e-4)

- **Severity / verdict:** major, verified (confidence high). Already flagged internally at
  `docs/WEAK_SPOT_AUDIT_2026-06-04.md` row B1 ("documented, not fixed") and NOTES §13.4/§13.6 — but
  the thesis text carries the unqualified exactness claim with no caveat (that wording fix is
  [TX-5](02-thesis-alignment.md)).
- **Evidence:** `lib/classes/algorithm/PeriodSolver.ts:841-842` (certificate leg:
  `Math.abs(area - ctx.cellArea) > 1e-4 * Math.max(1, ctx.cellArea)`); `tileAreaFloatFor` at
  `PeriodSolver.ts:98-100` (float `regularArea` tan-formula; stars degraded via `.toFloat()`);
  core-overflow guard `PeriodSolver.ts:610` (`1e-6` slack); `ctx.cellArea` from float det at
  `PeriodSolver.ts:565`. Thesis claims: `../thesis/chapters/correctness.tex:40-41`,
  `../thesis/chapters/algorithm.tex:179-180`, `../thesis/chapters/introduction.tex:61-63`.
- **Problem:** The three-part certificate that `lem:corona`'s soundness consumes claims leg (c)
  "total tile area equals |det Λ| exactly" — but the implementation decides it in floating point with
  1e-4 relative slack, on the decisive accept path (`isCompleteTiling`, called at
  `PeriodSolver.ts:694`). WEAK_SPOT B1 records three k=2 tilings (t2004/t2011/t2012) that pass *only*
  via the slack (true footprint == cell exactly; float noise needs the tolerance). Every primitive for
  an exact check exists (`polygonAreaSurd`, `detSurd` — present in `exactOverlap.ts`/`Surd.ts`/
  `LatticeEnumerator.ts`). The k≤3 counts are oracle-vouched; the latent unsoundness is at k≥4/stars.
- **Fix spec:**
  1. Add `tileAreaSurd(p: Polygon): Surd` — `polygonAreaSurd(p.exactVertices!)` uniformly (works for
     regular and star tiles; all vertices are in ℤ[ζ₂₄]). The regular closed forms all lie in
     ℚ(√2,√3) — √3/4, 1, 3√3/2, 2(1+√2), 3(2+√3) for n=3,4,6,8,12 — use them as a cross-check test,
     not as the implementation (shoelace is uniform and tile-identity-correct for stars).
  2. Thread the exact cell basis into `FillCtx` (or compute `cellAreaSurd = detSurd(u,v).abs()` once
     in `makeCtx` from the exact `Cyclotomic` basis the solver already holds) alongside the float
     `cellArea`.
  3. In the certificate leg replace the 1e-4 comparison with
     `sumSurd.cmp(ctx.cellAreaSurd) === 0`. Keep the float comparison as a *broadphase pre-reject
     only* (if float says wildly off, reject cheaply; the exact test decides acceptance).
  4. Apply the same treatment to the fill-time core-overflow guard at `PeriodSolver.ts:610` and the
     footprint checks at `:272-273` *if profiling allows*; at minimum the certificate leg (the one the
     proof cites) must be exact.
  5. Append a NOTES entry; flag TA so the thesis exactness wording can stay unqualified once this
     lands ([TX-5](02-thesis-alignment.md)).
- **Acceptance:** *Decisive path.* k≤2 digests byte-identical; k=3 oracle regression passes; t2004/
  t2011/t2012 still present in the k=2 set (they must now pass by exact equality, not slack). New unit
  test: `tileAreaSurd` equals the closed-form exact areas for n=3,4,6,8,12 and the float value within
  1e-12 for the 4*_{π/4} star.
- **Cross-refs:** [TX-5](02-thesis-alignment.md), [CB-2](#cb-2--surdsign-semi-static-error-bound-filter), [OP-7](04-optimizations.md).

---

### CB-2 — Surd.sign semi-static error-bound filter

- **Severity / verdict:** major, verified (confidence high; from findings #5 and #19). Not previously
  flagged — NOTES line ~451 describes the float-first design neutrally; WEAK_SPOT B1 is a different
  site (PeriodSolver area slack). Irony verified: `Surd.ts:169` documents `toFloat` as "debug /
  broadphase only, never a decision" while `sign()` decides from it at `:134-139`.
- **Evidence:** `lib/classes/algorithm/exact/Surd.ts:134-139` (`sign()`: returns float sign whenever
  `|toFloat()| > 1e-6`, **absolute** threshold, no operand-height guard; `signExact()` interval
  refinement only in the ambiguous band); `toFloat` at `:169-178`. Consumers: `cmp()` (`:141-143`),
  `orient2D`/`dotSign` in `exactOverlap.ts` (decisive star overlap), holohedry classification, area
  comparisons.
- **Problem:** Under cancellation the float error can exceed 1e-6 while the magnitude also does —
  wrong sign possible in principle on a decisive path (provability gap; coefficient heights ~1e9-1e10
  needed, not observed at k≤3, but heights are unbounded in principle since `cmp`/`sub` multiply
  denominators and shoelace sums accumulate). The thesis's central claim is "every decisive test in
  exact arithmetic"; an empirically-safe float gate does not support that claim.
- **Fix spec (the semi-static filter, concretely):**
  1. In `sign()`, compute alongside `f` the float majorant
     `M = (|P| + |Q|·√2 + |R|·√3 + |S|·√6) / D` (same `Number()` conversions as `toFloat`; use
     `Math.abs` on the converted values).
  2. Accept the float sign **iff `Math.abs(f) > c * EPS * M`** with `EPS = Number.EPSILON` (= 2⁻⁵³);
     otherwise fall through to `signExact()`. Delete the absolute 1e-6 threshold.
  3. Derive `c` in a comment, line by line: count the roundings in the implemented expression —
     5 bigint→Number conversions (each rel. err ≤ ε, exact below 2⁵³), 3 correctly-rounded irrational
     constants (≤ ε each... Math.SQRT2/Math.sqrt(3)/Math.sqrt(6)), 3 multiplications, 3 additions,
     1 division (≤ ε each) ⇒ ~15 first-order roundings; standard forward bound |f − v| ≤ γₙ·M with
     n ≈ 15. `M` itself is computed in floats with the same ≤ γₙ relative error — absorb by doubling.
     Pick `c` as the next power of two with margin: **expected c = 32**; whatever value lands, the
     comment must show the count that justifies it. (The review's "≤8 roundings, c ≤ 16" undercounts —
     verifier recount says ~15. Do the count against the final code, not the review.)
  4. The filter is never wrong (forward error bound ⇒ accepted float signs are provably correct) and
     is *faster* than today in the common case (same float path, one extra float expression, and the
     1e-6 band near zero no longer forces `signExact` when M is tiny).
  5. **Fuzz regression (required):** new test that brute-forces `sign() === signExact()` on ≥10⁵
     random Surds across coefficient heights (|coeffs| up to ≥2⁸⁰, random D > 0), plus adversarial
     near-cancellation cases (e.g. `x.sub(x)`, `x.sub(x.add(tiny))`, convergent-based near-zero
     combinations of √2/√3/√6). Also assert: every case the filter *accepts* matches `signExact`.
- **Acceptance:** *Decisive path.* k≤2 digests byte-identical; k=3 oracle regression passes; fuzz test
  green; existing exact-overlap and star test suites green. Any digest change = the filter changed a
  decision = bug, stop.
- **Cross-refs:** [OP-7](04-optimizations.md) (builds the star predicate stack on this filter),
  [CB-1](#cb-1--exact-certificate-area-leg-replace-float-1e-4), [TX-5](02-thesis-alignment.md).

---

### CB-3 — Emit the join-waived truncation (LatticeEnumerator nearRational)

- **Severity / verdict:** major, verified (confidence high; from findings #2 and #5). **Already flagged
  and ruled internally** — TA ruling "option (b)" at `docs/archive/SYNC-2026-06.md:475-495`, queued as
  a ride-along at `:598-604`, deferred at `:659` — still unimplemented. Worse: NOTES §19.3
  (`docs/DEVELOPMENT_NOTES.md:~1298`) falsely claims all three oblique truncation causes are "routed
  loudly to stderr".
- **Evidence:** `lib/classes/algorithm/LatticeEnumerator.ts:37` (`JOIN_DEN_MAX = 60`), `:42-43`
  (`nearRational`), `:196-200` (comment claiming the cut sits "within the logged-incomplete candidate
  region" — unsubstantiated when the subpool-clipped log has NOT fired), `:217` (the silent
  `continue`), `:550-554` (`ObliqueTruncation` type defines `{ cause: "join-waived" }` — **zero
  emission sites repo-wide**). Doctrine: `../thesis/chapters/correctness.tex:243-246` ("any cap that
  could truncate the search is required to report loudly").
- **Problem:** The oblique join-closure rejects any join whose (a,b)-coordinates need a rational
  denominator > 60, silently. The proven index bound admits denominators above 60 at k=3; skipping
  *irrational* coords is exact, but the rational-denominator cut is a tuned truncation and the loud-
  truncation doctrine requires a runtime event. The cause exists in the type system and is never
  fired — a doctrine violation in code, and the NOTES claim about it is wrong.
- **Fix spec:**
  1. At the `LatticeEnumerator.ts:217` reject, when the coordinate IS near-rational at some q > 60
     but not within `JOIN_DEN_MAX` — or more cheaply, on *any* `nearRational` reject — count it and
     route **one standing per-call disclosure** through the existing `onTruncate` callback (the
     `(info) =>` consumer at `PeriodSolver.ts:511` already prints the other causes). Per the TA
     ruling: fires **once per affected run** with a count, not per-pair spam.
  2. Reconcile naming: the SYNC ruling calls it `join-denominator-bounded`, the type says
     `join-waived`. Pick one (keep the type's `join-waived`, note the alias in the emission message),
     update both sites.
  3. Append a NOTES correction entry for the §19.3 "routed loudly" misstatement (ledger is
     append-only — correct forward, do not rewrite §19.3).
  4. The thesis-side disclosure (sec:val-method truncation clause, sec:val-k3 firing disclosure) is
     [TX-2](02-thesis-alignment.md) — link, do not duplicate.
- **Acceptance:** *Diagnostics-only.* Disclosure fires ≥once on a k=3 oblique-bearing run (stderr
  shows the cause + count); k≤2 digests unchanged (per the SYNC ruling: "Digest-safe"); pushed lattice
  set unchanged (no behavioral change — emission only).
- **Cross-refs:** [TX-2](02-thesis-alignment.md), [CB-8](#cb-8--pool-reach-loud-truncation-assertion),
  [DG-1](00-decision-gate.md) (under the proven config no truncation fires by construction).

---

### CB-7 — Primitivity-rejection guard (verify primitive lattice in candidate list)

- **Severity / verdict:** major, verified (confidence high). Substance appears exactly once repo-wide
  as a compressed parenthetical (`docs/DEVELOPMENT_NOTES.md:~1089`); the per-rejection guard is
  queued nowhere. Note the verifier's correction: `correctness.tex` prop:orbitfloor (~716-728) DOES
  carry the recovery condition explicitly; the unconditional sentence is in `algorithm.tex` only —
  the prose fix is [TX-5](02-thesis-alignment.md)'s, the code guard is this item.
- **Evidence:** `lib/classes/algorithm/PeriodSolver.ts:694` (`isPrimitive` on the accept path), `:931`
  (definition; docstring asserts unconditionally "rejecting supercells here loses no tiling" — review
  cited `:~926-949`, drifted), `:407-415` (tuned pool `poolSteps = 2k+2`, `poolLmax = √(22k)` — review
  cited `:400-410`, drifted); `../thesis/chapters/algorithm.tex:186-190` (unconditional "not lost"
  sentence); `../thesis/chapters/correctness.tex:278-283` (density footnote); CLAUDE.md settled
  decision (ℤ[ζ₂₄] dense — bound step count, never length).
- **Problem:** Rejecting a certified cell as a non-primitive supercell is sound *only if* the
  primitive lattice is itself in the candidate list. Under the proven box (cor:box) it always is;
  under the *executed tuned pool* it need not be: the pool is bounded by edge-STEP count, which is not
  monotone under sublattice (the primitive basis is Euclidean-shorter but can need more steps — the
  project's own density doctrine forbids the "shorter ⇒ in pool" defense). Supercell-in-pool +
  primitive-out-of-pool ⇒ the tiling is certified, then silently discarded, with no truncation log.
  k≤3 oracle says it never happened; it is a live silent-loss mode at k≥4 under any tuned regime.
- **Fix spec:**
  1. When `isPrimitive` rejects a cell, it has witness translation(s) t ∉ Λ mapping the cell to
     itself. Compute the primitive lattice Λ′ = closure of Λ under all witnesses (the full translation
     group of the cell's tiling).
  2. Canonicalize Λ′ with the same reduced-basis key used for candidate-lattice dedup and check
     membership in the seed's enumerated candidate set (thread the candidate key-set into the fill
     context, or collect rejected-supercell witnesses and check post-hoc per seed before discarding).
  3. On miss: emit `⚑ INCOMPLETE-REGION (primitivity-rejection): certified supercell discarded;
     primitive lattice <key> not in candidate list` to stderr, loudly, per occurrence.
  4. Soften the `isPrimitive` docstring (`PeriodSolver.ts:931`) and the P0-prune comment (~`:526-527`)
     to the conditional form: "sound provided stage 6 contains the primitive lattice — unconditional
     under cor:box, guarded here under any tuned pool".
- **Acceptance:** *Diagnostics-only* (the guard must not change which cells are kept — it only adds a
  loud log; a design that *keeps* the supercell on miss is a behavior change and needs TA sign-off
  first). k≤2 digests unchanged; k=3 oracle regression passes with **zero** primitivity-rejection
  INCOMPLETE events (the oracle says recovery always happened at k≤3 — the guard firing at k≤3 would
  itself be a discovery: stop and investigate).
- **Cross-refs:** [TX-5](02-thesis-alignment.md) (algorithm.tex wording),
  [CB-8](#cb-8--pool-reach-loud-truncation-assertion) (same tuned-regime root),
  [DG-1](00-decision-gate.md).

---

### CB-8 — Pool-reach loud truncation assertion (the queued §16.7 / WEAK_SPOT A1 item)

- **Severity / verdict:** major. Sourced from the prior-art trail in findings #5/#7 — explicitly
  queued at `docs/DEVELOPMENT_NOTES.md:1092-1100` (§16.7 NEXT: "de-magic `poolSteps`/`poolLmax` (loud
  INCOMPLETE-REGION assertion)") and `docs/WEAK_SPOT_AUDIT_2026-06-04.md:88` (row A1, 🔴, **silent**;
  its `PeriodSolver.ts:296-299` citation is stale — the bounds now live at `:407-415`). Already
  flagged internally in both places; never implemented.
- **Evidence:** `lib/classes/algorithm/PeriodSolver.ts:407-415` (tuned `poolSteps = 2k+2`,
  `poolLmax = √(22k)`, `compactOffMax2`, `gridShortMax2` sized to KNOWN oracle maxima, in-code ⚑
  flag); `:481-492` — the **grid long-side reach** log already exists and fires (`gridReachTrunc` →
  `⚑ INCOMPLETE-REGION (grid long-side reach)`), covering ONE source only. The pool itself
  (`shortVectorPool(ring, poolSteps, poolLmax, …, monotone:true)` at `:415`), `compactOffMax2`,
  `gridShortMax2`, and `areaBoundF` remain silent caps; the monotone pool restriction is itself an
  unproven heuristic (correctness.tex rem:box-implementation, ~:476-497).
- **Problem:** A cell vector beyond the tuned pool reach is silently never enumerated — the canonical
  silent-loss mode of the executed regime, 🔴 in the project's own audit, and the root that makes
  CB-7's coupling live. Unlike the grid long-side case, most of these truncations are *unknowable
  per-candidate* (the dropped vector was never generated) — so the assertion must be regime-level,
  not per-candidate, plus per-candidate where checkable.
- **Fix spec:**
  1. **Regime banner (the de-magic assertion):** at solver start, compare the active
     `poolSteps`/`poolLmax`/`compactOffMax2`/`gridShortMax2`/`areaBoundF` against the proven-box
     configuration (cor:box constants; see [DG-1](00-decision-gate.md) for what "proven config"
     means operationally). If ANY bound is below the proven value, emit once, loudly:
     `⚑ INCOMPLETE-REGION (tuned pool regime): poolSteps=…, poolLmax=… below proven box — run is
     oracle-anchored, not proof-anchored`. This makes the regime visible in every log an examiner
     reads, mirroring the doctrine sentence in algorithm.tex (~:100-144).
  2. **Per-candidate reach checks where a solved/derived vector exists:** extend the `:481-492`
     pattern (vector exists but exceeds `poolLmax` ⇒ count + one loud line) to every source that
     derives a vector it then looks up in the pool (audit `gridAlignedCells` consumers, the compact
     source, the oblique sub-pool sizing). Behavior-preserving: pushed lattice set unchanged.
  3. Centralize the constants + comparison in one place (e.g. a `poolConfig(k)` returning
     `{tuned, proven, isTuned}`) so DG-1's proven-config run can flip one switch and the banner
     provably cannot fire under it.
  4. Update WEAK_SPOT A1's "Logged?" column claim via a NOTES append (A1 becomes "loud, regime-level").
- **Acceptance:** *Diagnostics-only.* k≤2 digests unchanged; the banner fires on every current tuned
  run (k≥3) and provably cannot fire under the proven-box config; the k=3 oracle regression output
  shows the banner + unchanged 61.
- **Cross-refs:** [DG-1](00-decision-gate.md) (the measurement that decides whether the tuned regime
  is retired), [CB-7](#cb-7--primitivity-rejection-guard-verify-primitive-lattice-in-candidate-list),
  [CB-3](#cb-3--emit-the-join-waived-truncation-latticeenumerator-nearrational),
  [TX-2](02-thesis-alignment.md) (sec:val-method truncation clause).

---

### CB-5 — KUniformityChecker N≠24 must throw, not silently degrade

- **Severity / verdict:** major, verified (confidence high; sub-claim 4 of finding #6). Not previously
  flagged (WEAK_SPOT B4 flags only the null→keep design, different substance).
- **Evidence:** `lib/classes/algorithm/KUniformityChecker.ts:179` —
  `if (units !== 24) continue; // … (2π = 24 units)` — the full-surround test hardcodes 24 angle
  units. `Polygon.cornerAngleUnits` returns units of 2π/N with N = ring.N, so on any N≠24 ring no
  vertex ever sums to 24 ⇒ `reps` empty ⇒ gate returns null ⇒ **everything is kept**. Sibling star
  code throws on N≠24 (`StarVC.ts:169`, `ExactStarPolygon.ts:52,98`); the gate does not.
- **Problem:** Silent degeneracy: on a non-N=24 ring the k-uniformity gate stops gating without any
  signal. Conservative in the completeness direction, but the pipeline would then emit non-k-uniform
  candidates as if gated — violating "all and *only*" — and the thesis presents the pipeline as
  family-generic. The honest current scope is N=24-only ([ST-5](05-star-and-new-directions.md) makes
  N≠24 an explicit non-goal; this item makes the code agree).
- **Fix spec:**
  1. At checker construction (or first use), read the ring's N; `if (N !== 24) throw new Error(
     "KUniformityChecker: hardcoded to N=24 angle units; N=" + N + " unsupported — see ST-5")`.
  2. Replace the magic `24` at `:179` with the named constant derived from ring.N (still asserted
     === 24 by step 1), so a future N-generalization has one site to fix.
  3. Grep the gate module for other literal-24 angle assumptions (window constants, holohedry tables)
     and tag each with the same constant or a `// N=24-only` comment.
  4. Thesis-side disclosure of the hardcode is [TX-4](02-thesis-alignment.md) (prop:gate) — link.
- **Acceptance:** *Diagnostics-only* (N=24 runs untouched). k≤2 digests unchanged; new unit test:
  constructing/running the checker on a mock N≠24 ring throws.
- **Cross-refs:** [ST-5](05-star-and-new-directions.md), [TX-4](02-thesis-alignment.md).

---

### CB-4 — Merge assertEquivalencePartition guard + standing independent congruence differential

- **Severity / verdict:** major, verified (confidence high; finding #4). Not addressed at the pinned
  commit: `assertEquivalencePartition` exists **only** on `feat/c4-pool-bypass`
  (`TilingCongruence.ts` + `tests/merge-consistency.test.ts` there) — verified absent from master,
  the working tree, and `\describedcommit` (`2c8ad69`).
- **Evidence:** repo-wide grep: zero `assertEquivalencePartition` hits on `feat/c7-star-spike`;
  `git branch -a` = c1/c4/c7/master only. `../thesis/chapters/results.tex:28-30` (oracle match
  "decided by the exact congruence test" — the same `tilingsCongruent` doing the leg-1 dedup);
  `results.tex:144-146` (the 2c8ad69 fix verified by a **one-shot** independent re-implementation,
  NOTES §19.6); `correctness.tex:208-229` (rem:mergefidelity asymmetry scoped to *enumeration*
  defects — a verifier-side false positive is not covered and would over-merge AND falsely match the
  oracle simultaneously).
- **Problem:** No standing independent verification layer: a single systematic false-positive in
  `tilingsCongruent` corrupts dedup and oracle-match together, and the count-off-target tripwire only
  works where a target exists (none at k≥4 beyond the catalogue, none for novel star ground). The
  historical 2c8ad69 rotation-dedup bug is the live witness that congruence-code defects happen.
- **Fix spec:**
  1. Cherry-pick/merge the equivalence-partition consistency guard from `feat/c4-pool-bypass` into
     the certified path: symmetry (`congruent(a,b) ⇔ congruent(b,a)`), transitivity spot-checks, and
     argument-order invariance of `tilingsCongruent`, asserted during dedup (cheap: runs on the merged
     classes, throws loudly on violation). Bring `tests/merge-consistency.test.ts` with it.
  2. Promote the §19.6 one-shot independent congruence re-implementation (reduction-free differential)
     from a debugging diagnostic to a **standing differential oracle**: a script/flag that re-checks
     every merge decision of a certifying run against the independent implementation and diffs the
     partitions; wire it into the k≤3 oracle regression harness so every certifying run exercises it.
  3. Keep the two implementations import-disjoint (the independent one must not call into
     `TilingCongruence.ts` internals) — otherwise it is not a differential.
  4. The thesis-side honesty sentence ("leg 3 is not independent of leg 1's congruence code") is
     [TX-2](02-thesis-alignment.md)/[TX-4](02-thesis-alignment.md); the genuinely independent D-D
     audit is [TH-11](03-theory-obligations.md) — link, do not duplicate.
- **Acceptance:** *Diagnostics-only* (asserts must not change outputs). k≤2 digests byte-identical
  with the guard active; k=3 oracle regression passes with the differential oracle reporting zero
  partition mismatches; the guard demonstrably throws on an injected fault (test that monkey-patches a
  false-positive congruence and asserts the guard fires).
- **Cross-refs:** [TX-2](02-thesis-alignment.md), [TX-4](02-thesis-alignment.md),
  [TH-11](03-theory-obligations.md).

---

### CB-6 — properOverlapWithBlock 2.5 centroid cull constant false for 8/12-gons

- **Severity / verdict:** minor, plausible (minors list; not adversarially verified — geometry checked
  here: unit-edge 12-gon circumradius 1/(2 sin(π/12)) ≈ 1.932, pairs overlap to ≈ 3.86; octagon
  R ≈ 1.307, pairs to ≈ 2.61). Soundness of emitted output unaffected (certificate backstop).
- **Evidence:** `lib/classes/algorithm/PeriodSolver.ts:1034` —
  `if (Math.hypot(pc.x - qc.x, pc.y - qc.y) > 2.5) continue; // tiles ≥ this far apart can't overlap`
  (the comment is geometrically false for 8/12-gons); `:578` (`ctx.maxCircum` already computed);
  `:1062` (`blockHasProperOverlap` certificate backstop, bbox-filtered, catches anything missed);
  k=4 fill-timeout context NOTES §22 (25/25 strided fills timeout on the {3,4,6,8,12} family).
- **Problem:** During DFS placement, overlapping placements at centroid distance 2.5–3.86 are
  *admitted* and die only downstream (angular contradiction or the certificate's full pairwise check)
  — dead subtrees on exactly the 8/12-gon-heavy k=4 family whose fills time out. Emitted certified
  set provably unchanged (the fix prunes MORE, and only placements that were invalid anyway); this is
  perf + comment-honesty, not soundness.
- **Fix spec:**
  1. Replace the constant: `if (dist > circum(P) + ctx.maxCircum) continue;` (per-tile circumradius +
     max block circumradius), or conservatively `2 * ctx.maxCircum`. `ctx.maxCircum` exists at `:578`
     for exactly this purpose.
  2. Fix the comment to state the actual bound (R₁+R₂ is the true overlap-impossibility radius).
  3. Re-profile the k=4 strided sample afterward to measure how much timeout budget was overlap-junk
     ([OP-9](04-optimizations.md) owns the re-measurement protocol — coordinate, don't fork it).
- **Acceptance:** *Decisive path* (touches the fill DFS). k≤2 digests byte-identical — note the
  octagon (R ≈ 1.307 > 1.25) means 4.8.8 pairs at distance 2.5–2.61 were previously admitted even at
  k≤2, so the change is live there too; digests are expected unchanged (the fix only rejects
  placements the certificate would kill), but **verify, don't assume** — a changed digest = stop.
  k=3 oracle regression passes (61, byte-identical).
- **Cross-refs:** [OP-4](04-optimizations.md) (cull ordering), [OP-9](04-optimizations.md).

---

### CB-9 — Evidence hygiene: commit §23.9 instrumentation + D-D probe dumps, push branches

- **Severity / verdict:** major, **⚠ unverified (cap)** — verdict skipped at the verification cap;
  spot-check before acting. Spot-checked here 2026-06-09: `experiments/` contains only
  `delaney-dress/` and is entirely **untracked** (`?? experiments/` in git status); no
  `experiments/results/` exists despite the CLAUDE.md experiments doctrine; §23.9 /
  `measure-fill-scaling` absent from this checkout's `docs/DEVELOPMENT_NOTES.md`; side worktrees
  `c1-proven-seeding` and `orbifold-branch-enum` exist at
  `~/.config/superpowers/worktrees/TilingAtlas/`; `git branch -a` shows only c1/c4/c7/master, none
  pushed except master. Consistent with the finding's claims; the §23.9 content itself (worktree
  `docs/DEVELOPMENT_NOTES.md:1834+`) not independently re-read — spot-check it when executing.
- **Evidence:** CLAUDE.md "Experiments" doctrine (log synchronously to `/experiments/results`);
  ledger doctrine (append-only history the thesis is written from); `\describedcommit = 2c8ad69`
  contains none of the pivot evidence; the D-D k=2 result exists only as a SYNC ledger entry.
- **Problem:** The most decision-loaded measurements (the §23.9 183→3103→186190 scaling analysis and
  pivot rationale; the D-D M0/M1 build and its k=1=11 / k=2 results; the size-scaling experiment) are
  uncommitted, unpushed, or absent from the repository — unauditable by the project's own
  certification standards, and the project's history (threshold-4 artifact, overturned fill
  diagnosis) shows decision-grade measurements get mis-remembered when they can't be re-run.
- **Fix spec:**
  1. In the `orbifold-branch-enum` worktree: commit the §23.9 NOTES section + the
     `measure-fill-scaling` instrumentation; run it once and dump the human-readable log (progress,
     ETA per CLAUDE.md format) to `experiments/results/`.
  2. Commit `experiments/` (currently fully untracked — the D-D Python artifacts included), adding
     `experiments/results/` with the dumps backing any number quoted in a ledger or the thesis.
  3. Import/push the D-D TS probe (branch or directory) with its probe dumps and the digests backing
     the "k=2 certified at δ≤24" claim; if the TS build lives only on another machine/worktree,
     reconstruct or downgrade the SYNC claim with a correction entry.
  4. Push all local branches (`feat/c1-proven-seeding`, `feat/c4-pool-bypass`, `feat/c7-star-spike`)
     and the worktree branches to origin.
  5. Until 1–3 land, the thesis must not cite the pivot rationale (the pinned text's "k=4 torus wall
     measured; method exploration ongoing" stands) — coordinate with [TX-6](02-thesis-alignment.md).
- **Acceptance:** *No code path.* `git status` clean of untracked experiment evidence;
  `experiments/results/` contains the §23.9 and D-D dumps; every branch on origin; every number cited
  in SYNC/NOTES for the pivot traceable to a committed artifact. No digest implications.
- **Cross-refs:** [DG-1](00-decision-gate.md) (the decision the evidence must support),
  [OP-9](04-optimizations.md) (re-measurement protocol), [TX-6](02-thesis-alignment.md).
