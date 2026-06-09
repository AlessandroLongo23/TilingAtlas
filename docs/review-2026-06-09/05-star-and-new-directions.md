# 05 — Star lane & new directions (ST-1..ST-9)

Work-order spec from the verified findings of the 2026-06-09 adversarial review. Back-link: [README.md](README.md).

Scope rule for this whole file: **ST-1 is the gate.** No star text enters the thesis and no star
k≥2 code is written until the conventions layer (ST-1) lands. Star results until then are phrased
"under Myers's conventions", never under the thesis's.

| ID | title | severity | owner | depends on | status |
|----|-------|----------|-------|------------|--------|
| ST-1 | Star conventions layer (gate) | critical | TA+CC | [TH-3](03-theory-obligations.md), [TH-4](03-theory-obligations.md), [TH-5](03-theory-obligations.md), [TH-6](03-theory-obligations.md), [TX-7](02-thesis-alignment.md) | [ ] |
| ST-2 | Honest run-matrix + §24 retitle + vocabulary | major | CC | ST-1 (thesis text only), [TH-3](03-theory-obligations.md) (pool bound) | [ ] |
| ST-3 | Myers-2009 k=2 oracle (crown deliverable) | major | CC+TA (AL: conjecture) | ST-1, [TH-5](03-theory-obligations.md), [TH-6](03-theory-obligations.md), [TX-3](02-thesis-alignment.md) (bib) | [ ] |
| ST-4 | One-family stratified certificate | major | TA+CC | [TH-8](03-theory-obligations.md) | [ ] |
| ST-5 | N≠24 rings = explicit non-goal | minor | TA (text) + CC ([CB-5](01-code-bugs.md)) | — | [ ] |
| ST-6 | Quotient-first oblique probe ⚠ unverified (cap) | major | TA (note) + CC (probe) | [DG-1](00-decision-gate.md) context, [TH-9](03-theory-obligations.md) adjacent | [ ] |
| ST-7 | Thesis scope-and-non-goals section | major | TA | [TX-6](02-thesis-alignment.md), ST-5, ST-8 | [ ] |
| ST-8 | Irregular-polygon honest scope | major | TA | ST-7, [TX-7](02-thesis-alignment.md) | [ ] |
| ST-9 | Productive star-fill validation gap | minor | CC | [CB-9](01-code-bugs.md) (commit hygiene) | [ ] |

Digest discipline (applies to every CC item below): any change touching the decisive path must keep
the k≤2 digests `6f9ca9cf2d16c75f` (k=1, 11) / `f3e2e0517191362c` (k=2, 20) byte-identical via
`pnpm tsx scripts/probe-pipeline.ts 1` / `2`, and pass the k=3 oracle regression. A changed digest =
loud stop.

---

### ST-1 — Star conventions layer (THE GATE)

- **Severity / verdict:** critical; verified isReal, confidence high (finding _idx 20; chirality leg
  _idx 26, also verified high). Not already addressed — the Myers convention lives only in code/contracts
  (`StarVC`, NOTES §23.1 A2, star-vc-implementation-contract §3), never in the thesis.
- **Evidence:** `../thesis/chapters/preliminaries.tex:11-13` (edge-to-edge = "empty, a common vertex,
  or a common full edge"), `:63-78` (def:vc — reflections NOT identified), `:80-85` (def:k-uniform, no
  tiling-vertex definition); `docs/DEVELOPMENT_NOTES.md` §23.1 A2 + §23.3 (16 dent-fills "correctly NOT
  counted" in the certified 4(j) block); `lib/classes/algorithm/StarVC.ts` `canonicalVCName` (~:74-88,
  rotation+reflection-merged) vs def:vc; Myers 2004 p.21 (G&S definitional adjustment, quoted in the
  star-vc-implementation-contract).
- **Problem:** The headline result "Myers 4(j) 8.4\*.8.4\* certified k=1 exact" is **inexpressible under
  the thesis's own definitions**: at every dent-fill point the star∩octagon intersection is two full
  unit edges + shared endpoint — none of the three intersections preliminaries.tex allows — so under
  the thesis 4(j) is not edge-to-edge, and reading "vertex" as any corner it is not 1-uniform (dent
  points form extra orbits). Worse, def:vc makes the 2-tile dent-fill point a legitimate VC that the
  certified pipeline deliberately refuses to count — a direct formal contradiction. And
  rem:starsweight/results.tex already assert the completeness theorem "covers" star families, vacuously
  under the current definitions. Code and contracts run on Myers's conventions; the thesis was never
  updated, and no re-audit of the soundness lemmas under the new definitions is recorded anywhere.
- **Fix spec:** Land the FOUR convention decisions as one preliminaries patch + one audit pass, before
  any other star work:
  1. **≥3-tile vertex definition** — a tiling vertex is a point where ≥3 tiles meet; a 2-tile 2π point
     is a dent-fill (dent + complementary corner — the classification is exhaustive, see NOTES §23.1 A2),
     a corner of polygons but NOT a vertex of the tiling. Cite G&S *Tilings and Patterns* §2.5 and Myers
     2004 p.21 for the convention. Substance/proof obligations: [TH-3](03-theory-obligations.md),
     [TX-7](02-thesis-alignment.md) — do not re-derive here.
  2. **Star edge-to-edge definition** — for star families: tile interiors pairwise disjoint AND every
     side of every tile is a full side of exactly one other tile (replaces the intersection-based
     definition, which 4(j) violates at every dent-fill). Restate def:k-uniform over the ≥3-tile
     vertices. Text spec: [TX-7](02-thesis-alignment.md).
  3. **Dent-fill bookkeeping** — fix how dent-fill points enter the quotient graph Γ (degree-2 nodes;
     handshake deficit 2D; dent-class bound; restated thm:weight/cor:box with explicit star a_max).
     Entirely [TH-3](03-theory-obligations.md)'s job — ST-1 only requires that the convention chosen
     here matches TH-3's Γ definition.
  4. **Star VC naming + mirror policy** — `StarVC.canonicalVCName` is rotation+reflection-merged with
     ONE fan per merged name; def:vc requires chiral pairs as two separate VCs and lem:seedcover
     requires mirror-closed node sets. Decide and write down: k=1 either add the mirrored fan (≤2× on a
     run measured in seconds/seed) or write the single-handedness-sufficiency remark; k≥2 mirror-closed
     VC nodes mandatory. Substance: [TH-6](03-theory-obligations.md); pinned-α reflection split:
     [TX-4](02-thesis-alignment.md) rem:reflectioncover(iii).
  5. One-pass audit of every soundness lemma (lem:corona, prop:gate, prop:congruence,
     prop:representability, def:vc/def:compatibility, lem:seedcover) for uses of the old
     intersection-based definition; record per lemma "unchanged" or the fix, in the TA ledger.
  6. Until 1–5 land: every star statement (docs, SYNC, thesis drafts) carries "under Myers's
     conventions (G&S §2.5)".
- **Acceptance:** preliminaries.tex contains the star edge-to-edge + ≥3-tile vertex definitions with
  citations; the per-lemma audit table exists in `../resources/research/`; 4(j)/4(p) are formally
  expressible (edge-to-edge + 1-uniform) under the new text; no thesis sentence asserts star coverage
  via the unrepaired rem:starsweight. No code digest impact (definitions + audit only), except the
  optional mirrored fan (star lane only, regular digests untouched).
- **Cross-refs:** [TH-3](03-theory-obligations.md), [TH-4](03-theory-obligations.md),
  [TH-5](03-theory-obligations.md), [TH-6](03-theory-obligations.md), [TX-7](02-thesis-alignment.md),
  [TX-4](02-thesis-alignment.md).

---

### ST-2 — Honest run-matrix for the current scout; retitle §24; certification vocabulary

- **Severity / verdict:** major; verified isReal, confidence medium (_idx 23) + minor _idx 13
  (Increment-3 ordering) + note _idx 16 (vocabulary). Partially flagged internally: the TA review in
  `docs/SYNC.md:364-378` already downgraded scope to "Fig-4(13)-first then Fig-3 a,f best-effort" with
  "(6 for 3f)" — but the contracts' hard-fail text, the scout header, and §24's title were never
  reconciled with it.
- **Evidence (spot-verified in working tree):** `scripts/scout-star-inring.ts:14-19` ("the fully-sound
  run over all 4896 dent-reg VCs is ~8h … The completeness CLAIM holds only for the full unscoped sound
  run"), `:41` (`--dents` default OFF), `:51-52` (ORACLE includes `6*@6`, comment "only for Fig-3(f)");
  `docs/DEVELOPMENT_NOTES.md:1758` (§24 title "…made sound"), `:1883` (§24.9 "Full sound run (≈8 h) …
  (no scope flags)" — i.e. dents OFF), §24.5 (fill seats only star points), §24.8.5 (poolLmax skips
  "millions"), §22.3 (truncation doctrine: a firing INCOMPLETE-REGION log alone disqualifies a certified
  count); `lib/classes/algorithm/PeriodSolver.ts:725-728` (C3 palette: only `ExactStarPolygon.isotoxal`
  points placed; dent-seating "NOT yet attempted — flagged loudly"); `StarVC.ts`
  `dentRegularFillableVariants` (~:46-59, single-REGULAR-corner dent-fill assumption, flagged ⚑ in the
  doc comment); `../resources/research/star-scout-scoping-2026-06-06.md:70-72`.
- **Problem:** The advertised "full sound run (no scope flags)" is structurally guaranteed to miss
  Fig-3(f)'s `6*@6` (dent VCs exist only under `--dents`), so it fails its own oracle and the contracts'
  "any in-ring Myers tiling not recovered = hard fail" as written — while §24's title ("made sound") and
  the scout header ("completeness CLAIM") advertise the run as the completeness-claim bearer. Even with
  `--dents`, the fill seats only points and the dent-fillability filter assumes a single regular corner
  (oracle-anchored, not theorem-anchored), so Fig-3 is best-effort at most. And the loosened ladder
  floods INCOMPLETE-REGION to millions, which under §22.3 disqualifies any certified count regardless of
  runtime. §24.7's RUN_RESULTS is still "(results pending)".
- **Fix spec:**
  1. **Run-matrix** (write it into the scout header AND §24, one table): default `--variants dentreg`
     (19 variants, no `--dents`) → scope = Myers **Fig-4 in-ring point-at-vertex subclass (13 tilings)**,
     Fig-3 structurally out (6\*@6 unreachable); `--dents` → adds Fig-3 dent-at-vertex VCs, **best-effort
     only** (point-only fill, single-regular-corner filter); `--variants all` → 32-variant sound superset;
     `--single-star`/`--limit`/`--max-corners`/`--maxMs` → CAPS, each can drop an in-ring tiling, logged
     loud. Every report must state which Myers figures are in scope for the flags used.
  2. Reconcile the contracts with the SYNC downgrade: replace the C3 "hard fail on any in-ring miss"
     with "hard fail on any Fig-4 in-ring miss; Fig-3 a,f reported best-effort" (matching
     `docs/SYNC.md:364-378`), or restore Fig-3 to the hard set only once dent seeding + dent-aware fill
     exist as a named increment with its own completeness argument.
  3. **Retitle §24**: "the in-ring k=1 star enumeration made sound **for the Fig-4 point-at-vertex
     subclass**". Same edit in the scout header (drop "fully-sound run" for the no-flag config).
  4. **Truncation reporting**: aggregate INCOMPLETE-REGION skips per cause with counts (one legible
     line per cause, not the millionth log line); no star poolLmax increase and no full-sweep
     completeness claim until the sharp dent-aware area set (Increment 3, [TH-3](03-theory-obligations.md)
     D-bound) lands and truncation counts return to enumerable magnitudes. Pool-reach assertion itself:
     [CB-8](01-code-bugs.md).
  5. **Vocabulary rule** (adopt everywhere, including the results-chapter stub before any star number is
     drafted): **"certified-correct"** = this tiling exists, is k-uniform, verified exactly — what
     4(j)/4(p) have; **"certified-complete"** = the enumeration provably found all — what NOTHING in the
     star lane has, and cannot have until [TH-3](03-theory-obligations.md)/[TH-6](03-theory-obligations.md)
     close and the truncation logs are silent under a proven star pool bound. The scoping note's own
     honesty is the anchor — quote it: the Myers list "is **not** a machine-checked, proven-complete
     catalogue … the G&S→Myers correction shows the genre's fallibility (exactly the Galebach situation
     we already cite)" (`star-scout-scoping-2026-06-06.md:70-72`).
- **Acceptance:** §24 retitled; scout header prints the figure-scope line per config; a `--dents`-less
  run's report explicitly says "Fig-3 out of scope (6\*@6 not expected)"; truncation summary is
  per-cause aggregated; grep for "certified" in star docs returns only "certified-correct" usages.
  Regular digests untouched (star-lane-only edits).
- **Cross-refs:** [TH-3](03-theory-obligations.md), [TH-13](03-theory-obligations.md) (dent-fillability
  filter soundness), [CB-8](01-code-bugs.md), ST-9.

---

### ST-3 — Myers-2009 k=2 star oracle: machine-readable file + acceptance harness + conjecture correction (CROWN DELIVERABLE)

- **Severity / verdict:** major; verified isReal, confidence high (_idx 25; conjecture leg also in
  _idx 24, high; bib leg in minor _idx 19). Existence-level awareness only (references.bib TODO block,
  resources/README to-acquire list); the active star lane never engaged the content — the roadmap's
  conjecture entry says "No literature found yet either way" while the refuting document sat in the
  project's own TODO list.
- **Evidence:** Myers 2009, https://www.polyomino.org.uk/publications/2009/star-polygon-tiling-2-uniform.pdf
  p.1 (verbatim, verified by the review): "this list of **38 individual tilings and 5 infinite families**
  (each determined by one variable angle) is intended to be complete, it has not been double-checked and
  should be treated with caution"; families = Figs 25-28, 32; pure-regular-orbit tilings = Figs 36,
  38-42 + family Fig 25; `../resources/research/star-parametric-roadmap-2026-06-05.md` §4 (the
  conjecture + "No literature found"); `../thesis/references.bib:263-272` (TODO block only);
  star-increment2-contract §7 (k≥2 deferred with no named target).
- **Problem:** The natural k=2 acceptance oracle exists, self-declared unchecked ("treated with
  caution"), carries Myers 2004's explicit computer-search invitation — i.e. it is exactly the genre of
  result the thesis claims as its contribution ("first machine verification of an unchecked hand
  enumeration") — and it settles AL's recorded conjecture: **five** one-parameter families at k=2
  falsify "parametric families exist only at k=1" as stated.
- **Fix spec:**
  1. **Oracle file** `experiments/star-oracle/myers-2009-k2.json` (commit it): one record per catalogue
     entry — `{ fig: "36", kind: "tiling"|"family", orbits: ["3.3.3.4.3.12*p@2", "3.3.3.3.3.3"], alphaU:
     {"12*": 2} | null, freeAlpha: false|true, inRing: true|false, notes }`. Orbit-pair VC names in the
     StarVC token syntax (`n*p@u` point / `n*d@u` dent / bare `n` regular; u in π/12 units), α as the
     figure-caption value (π/12 multiples where in-ring; symbolic for family interiors), figure
     reference mandatory. All 38+5 entries transcribed; `inRing` = all tiles in the N=24 ring with α a
     π/12 multiple. TA spot-checks the transcription against the PDF captions (it is the oracle — a
     transcription error becomes a false hard-fail or a silent pass).
  2. **In-ring subset + acceptance harness**: a k=2 scout run (future, gated on ST-1 +
     [TH-5](03-theory-obligations.md) k≥2 prune form + [TH-6](03-theory-obligations.md) mirror-closed
     nodes) must recover every `inRing && kind==="tiling"` record — any miss = hard fail; families enter
     as pinned in-ring representatives only (semantics per ST-4/[TH-8](03-theory-obligations.md)), with
     the count convention printed.
  3. **Regression pins NOW** (cheap, pre-k≥2): add Figs 36/40/42 (in-ring, one purely-regular orbit) as
     named oracle records that any future k≥2 star VC/seed layer must be able to represent — they are
     the falsifiers for the unscoped Myers prune (iii); the prune rescope itself is
     [TH-5](03-theory-obligations.md).
  4. **Conjecture correction** (AL decision, TA records): update roadmap §4 — the as-stated conjecture
     is FALSE modulo Myers's caution (5 families at k=2, Figs 25-28, 32). Reframe the open question as
     the **"primitive families"** version: do families exist at k≥2 that are NOT derived from a k=1
     family by orbit refinement? First test: is Fig 25 `(3.3.3*α.3**α; 3⁶)` derived from the k=1 family
     `3.3*α.3.3**α`? (checkable by exhibiting/refuting the orbit-refinement map).
  5. **Bib + novelty framing**: Myers 2004 + 2009 entries — [TX-3](02-thesis-alignment.md)'s job, link
     only. Frame the eventual k=2 star run in the thesis as "first verification of an unchecked hand
     enumeration", quoting Myers's own caution line — concrete, honest novelty.
- **Acceptance:** oracle JSON committed with all 43 records + a loader test validating the schema and
  the in-ring subset count; the three regression-pin records exist; roadmap §4 updated with the
  five-family data point and the primitive-family question; references.bib has real Myers 2004/2009
  entries. No decisive-path code touched → digests unchanged by construction.
- **Cross-refs:** [TH-5](03-theory-obligations.md), [TH-6](03-theory-obligations.md),
  [TX-3](02-thesis-alignment.md), ST-1, ST-4.

---

### ST-4 — One-family stratified certificate (the parametric deliverable)

- **Severity / verdict:** major; verified isReal, confidence high (_idx 24). The correct output
  semantics exists only in the PARKED `star-parametric-roadmap-2026-06-05.md` §2; no thesis chapter
  states it; "finitely many strata" is an unproven theorem ([TH-8](03-theory-obligations.md)).
- **Evidence:** `../thesis/chapters/preliminaries.tex:34-41` ("To make the search finite we constrain α
  to a rational multiple of 2π" — neither finite nor a definition; densely countable); roadmap §2-§3;
  `lib/classes/polygons/ExactStarPolygon.ts:52` (verified: throws unless N=24; the layer is the
  fixed-angle special case — nothing symbolic exists); Myers 2009 Figs 25-28, 32 (five k=2 families).
- **Problem:** Per-N enumeration provably misses family interiors (irrational α/π members are valid
  tilings unreachable by any per-N run) and other-N pinned tilings; the thesis currently presents the
  discretization as a definition, and results.tex's star TODO would launder it into the "all and only"
  claim. The honest structure is: (a) a pinned⇒rational-α lemma making per-N complete-for-pinned
  ([TH-7](03-theory-obligations.md) — note the review found the one-line "linear equations" justification
  too quick: closure conditions are trigonometric, the lemma needs a real proof); (b) a 1-parameter
  stratification theorem (1-D semialgebraic, root isolation, **no CAD** —
  [TH-8](03-theory-obligations.md)); (c) ONE family worked end-to-end as the thesis-grade deliverable.
- **Fix spec:**
  1. Gate: [TH-8](03-theory-obligations.md) must exist as a theorem statement (even before full proof)
     before any parametric thesis text. Definition rewrite ("to make the search finite" removal + scope
     statement): [TX-7](02-thesis-alignment.md).
  2. Pick ONE family — default candidate: the k=1 family `3.3*α.3.3**α` (in Myers Fig 3's free-α class;
     small, in-ring at pinned α, and the Fig-25 derivedness test of ST-3 reuses it).
  3. Deliverable contents: the finitely many critical α values as isolated real algebraic numbers
     (closure/degeneracy polynomial roots); the constant-combinatorics open intervals; per-stratum a
     combinatorial certificate + one pinned exact representative (N=24 where the α is in-ring); the
     exceptional-α tilings certified individually.
  4. Arithmetic honesty: fixed in-ring α stays in ℤ[ζ₂₄] (ExactStarPolygon, unit-tested); symbolic α
     needs ℚ(ζ_N)(c,s) with c²+s²=1 or real-algebraic arithmetic — NEW layer, scope it to evaluation at
     isolated algebraic points (no general symbolic geometry). If the layer costs more than the
     deliverable is worth, ST-4 degrades honestly to "pinned representatives only + the stated open
     theorem" — record the decision, don't fudge it.
  5. State the family-counting convention in results (family = one object vs one pinned representative)
     — the scoping note itself mandates this ("must be stated explicitly in results, per the
     certification doctrine").
- **Acceptance:** a `../resources/research/` certificate note (TA) + an `experiments/` artifact (CC)
  for the chosen family: list of critical α (isolating intervals), strata count, per-stratum
  certificate; the results chapter states the convention. Regular digests untouched.
- **Cross-refs:** [TH-7](03-theory-obligations.md), [TH-8](03-theory-obligations.md),
  [TX-7](02-thesis-alignment.md), ST-3, ST-7.

---

### ST-5 — N≠24 rings: explicit non-goal (backend reality, verified)

- **Severity / verdict:** minor; finding _idx 14 (minors list — not adversarially verified; treated as
  spot-checked here: **both code facts verified in the working tree**).
- **Evidence (spot-verified 2026-06-09):** `lib/classes/algorithm/exact/Surd.ts:1-13` — the exact real
  layer is the FIXED field ℚ(√2,√3) = ℚ(ζ₂₄)⁺, `(P+Q√2+R√3+S√6)/D`, with the header itself noting "the
  15°-sine table is N=24-specific"; `lib/classes/algorithm/KUniformityChecker.ts:179` — verified
  verbatim `if (units !== 24) continue;` — on any other ring every vertex is treated as unsaturated:
  the gate **silently degrades instead of throwing** (fix = [CB-5](01-code-bugs.md));
  `lib/classes/polygons/ExactStarPolygon.ts:52` and `StarVC.ts` `buildStarVCSeed` (~:169) at least
  throw on N≠24; `docs/DEVELOPMENT_NOTES.md` §14.3 (computeRing N=12 crashes; probe force-sets 24).
- **Problem:** The scoping note calls 5\*/10\* (N=20/40/60) and 9\*/18\* (N=36/72) "further-stretch,
  ring-change targets". "Ring-change" undersells a per-N engineering project comparable to the original
  exact layer: a Surd-equivalent over ℚ(ζ_N)⁺ with a different integral basis (e.g. ℚ(ζ₂₀)⁺ is degree 4
  with a different basis), new holohedry classification, re-verification of every Surd-consuming
  predicate. Myers 4(e) (α=4π/9, 9-fold), 4(g), 4(l), 4(q) (5-fold) and the pentagram {5/2} are
  therefore out of reach, not deprioritized.
- **Fix spec:**
  1. CC: turn `KUniformityChecker.ts:179` into a thrown invariant — already specced as
     [CB-5](01-code-bugs.md); do not duplicate, link it.
  2. TA: paste-ready thesis text (scope section, with ST-7): "The exact backend is built for N=24:
     the real-arithmetic layer is the fixed field ℚ(√2,√3)=ℚ(ζ₂₄)⁺ and the saturation gate tests 2π=24
     units. Supporting another ring order requires a new canonical real-subfield arithmetic (different
     ℚ-basis per N), a new holohedry classification, and re-verification of every exact predicate —
     a per-N engineering effort comparable to the original layer. We therefore declare N=24 a scope
     boundary: Myers 4(e), 4(g), 4(l), 4(q) and all 5-, 9-, 18-fold star variants are out of scope of
     this thesis, excluded by the ring, not by the method."
  3. TA: reconcile `background.tex:201-204`'s "N=120 … supported by the same machinery at higher
     arithmetic cost" — true at the theory level only; label it design-level, or prune (the review
     flagged the layer mismatch).
- **Acceptance:** CB-5's test (off-ring input throws); the scope text present in the discussion scope
  section; background.tex N=120 sentence labeled or removed. KUniformityChecker change is decisive-path:
  run the digest gate (no N≠24 input exists in the certified runs, so digests must be byte-identical).
- **Cross-refs:** [CB-5](01-code-bugs.md), ST-7, [TX-6](02-thesis-alignment.md).

---

### ST-6 — Quotient-first oblique probe ⚠ unverified (cap)

- **Severity / verdict:** major; **⚠ unverified (cap)** — verdict skipped at the verification cap
  (_idx 13 confirmed-list). Spot-check the load-bearing citations (correctness.tex lem:quotient :313-340,
  lem:voltage :342-367, thm:weight :369-405, prop:orbitfloor :707-728) before acting. Note: this is a
  REGULAR-family architecture idea filed in the star/new-directions doc — it concerns the k=4 oblique
  wall, not stars.
- **Evidence:** `../thesis/chapters/correctness.tex` lem:quotient/lem:voltage/thm:weight (Λ is generated
  by fundamental-cycle voltages of Q, each a sum of unit edges); prop:orbitfloor (|V(Q)| ≤ k·hol(Λ) = 2k
  for oblique, hol=2); the 127,746-candidates-for-2-hits oblique sweep at k=3 (NOTES §19); the
  three-method roadmap and §23.8-23.9 never list a quotient-first variant.
- **Problem (the claimed gap):** The lattice-first vs Delaney-Dress dichotomy skipped the intermediate
  the project's own theorems define: enumerate the quotient graph Q combinatorially (VC-labeled
  vertices, unit-direction edge labels) and read Λ OFF the cycle voltages — Λ becomes an output, the
  oblique candidate explosion disappears. Structural irony: D-D's intractable tail (δ near 12k, trivial
  stabilizers) is exactly the oblique class, where |V(Q)| ≤ 2k is smallest. Tractability of the
  constraint propagation is NOT established — that is what the probe measures.
- **Fix spec:**
  1. TA: one scoping note — define the enumeration object precisely: connected multigraphs Q on ≤2k
     VC-labeled vertices (oblique class, hol=2), each edge a single unit direction ζ^j; per-vertex the
     VC type pins the cyclic angle structure (≈ one rotation choice per vertex); consistency = angle
     sums + direction propagation around Q; voltage homomorphism on a cycle basis ⇒ Λ. State what
     "consistent assignment" means exactly and which symmetries (vertex relabeling, global rotation)
     are quotiented before counting.
  2. CC: one THROWAWAY probe (`scripts/`, not the pipeline): {3,4,6} at k=3, oblique class only;
     enumerate Q + assignments with exact direction algebra; log synchronously to
     `experiments/results/` (progress + ETA, per CLAUDE.md).
  3. **Success criterion (binary):** (a) the 2 known k=3 oblique tilings' quotients are recovered with
     voltage lattices EQUAL to t3046/t3055's certified Λ; (b) the consistent-assignment count is within
     ~10^4–10^5. If both hold, the k=4 oblique gap plausibly closes without the 11M-lattice sweep —
     then and only then commission the completeness argument (lem:quotient surjectivity in the
     generative direction + dedup bijection, cf. [TH-9](03-theory-obligations.md)). If either fails,
     record the numbers in the ledger and drop it.
  4. This is a PROBE. No completeness claim, no pipeline integration, no thesis text from the probe
     alone.
- **Acceptance:** the scoping note exists; the probe artifact + a ledger entry with the measured
  assignment count and the recover/not-recover verdict for t3046/t3055. No decisive-path change →
  digests untouched.
- **Cross-refs:** [DG-1](00-decision-gate.md) (decision-tree context), [TH-9](03-theory-obligations.md),
  [OP-9](04-optimizations.md) (re-measurement protocol).

---

### ST-7 — Thesis scope-and-non-goals section (paste-ready skeleton)

- **Severity / verdict:** major; verified isReal, confidence medium (_idx 27). Partial mitigation
  acknowledged by the verifier: `background.tex` sec:bg-constraints already states the method-level hard
  boundary (rational angles, unit edges, finite families) — this section ASSEMBLES the expansion-scope
  ruling, it does not duplicate the constraints.
- **Evidence:** `../thesis/chapters/preliminaries.tex:43-52`; `background.tex:190-208`;
  `discussion.tex:138-153` (star paragraph: no k-bound, no oracle named, zero "Myers" in any chapter),
  `:155-168` (relaxed-adjacency obligations); `results.tex:240-246` (sec:val-extensions TODO stub);
  CLAUDE.md mission line "then star/parametric polygon families" (open-ended).
- **Problem:** No consolidated thesis-resident scope ruling exists for the star/parametric expansion;
  the components live in parked research notes. The first sentence written into sec:val-extensions will
  either carry the boundary or quietly launder it.
- **Fix spec:** TA writes a half-page "Scope and non-goals" section in the discussion chapter
  (placement per [TX-6](02-thesis-alignment.md)); paste-ready skeleton:
  1. **Ceiling:** tiling by arbitrary tile sets is undecidable (Berger, *The Undecidability of the
     Domino Problem*, Mem. AMS 66, 1966) — "completeness for irregular polygons" has no general meaning;
     any completeness claim must name its finite universe.
  2. **Floor / precedent:** Rao's convex-pentagon classification (arXiv:1708.00274) — fix a finite list
     of combinatorial skeletons, solve the constraint systems exhaustively in exact arithmetic — is the
     methodological precedent for per-family symbolic certificates (the shape of ST-4).
  3. **Completeness attaches only to:** (i) finite rational-angle unit-edge families on a fixed ring
     order N (prop:representability's hypothesis), and (ii) single-parameter families with a proven
     stratification ([TH-8](03-theory-obligations.md)).
  4. **In reach (this thesis):** Fig-4-class in-ring k=1 stars vs Myers 2004 (after ST-1/ST-2); the
     Fig-3 dent class with a real fill extension (named increment); in-ring k=2 stars vs Myers 2009's
     38+5 (ST-3 — first verification of an unchecked hand enumeration); ONE 1-parameter family exactly
     stratified (ST-4).
  5. **Declared out:** star k beyond 2-3 (no oracle; the regular candidate-count wall returns with
     larger constants); N≠24 rings (ST-5 text); free-α k-uniform enumeration without the strata-finiteness
     theorem; equilateral-irregular beyond a fixed angle grid (ST-8); multi-parameter families; general
     irregular polygons. Resist any sentence implying star enumeration "for all k" or "all parametric
     families".
- **Acceptance:** the section exists in discussion.tex with Berger + Rao + Myers 2004/2009 cited
  (bib via [TX-3](02-thesis-alignment.md)); sec:val-extensions' eventual text links to it; no thesis
  sentence contradicts the out-list.
- **Cross-refs:** [TX-6](02-thesis-alignment.md), [TX-3](02-thesis-alignment.md), ST-3, ST-4, ST-5, ST-8.

---

### ST-8 — Irregular-polygon honest scope (rational-angle equilateral in; rest out)

- **Severity / verdict:** major (shares finding _idx 27, verified medium; the in/out split is the
  verified part — preliminaries.tex:43-52 confirmed by the verifier).
- **Evidence:** `../thesis/chapters/preliminaries.tex:43-52` (every defined category has
  rational-multiple-of-π angles — the hypothesis of prop:representability); `background.tex:196-201`
  (irrational angles "leave the ring"); `discussion.tex:155-168` (three named obligations before
  relaxed adjacency "is a theorem").
- **Problem:** "Irregular polygons" is open-ended in the mission framing; the framework actually draws
  a clean line that nobody has written as a ruling.
- **Fix spec (TA, one paragraph inside the ST-7 section):**
  1. **In-framework:** unit-edge, rational-angle (π·ℚ, on the fixed ring) equilateral irregular
     polygons — prop:representability covers them; completeness machinery applies modulo the
     [TH-3](03-theory-obligations.md) repair where the polygon is non-convex (dent-fill bookkeeping)
     and the exact-overlap predicate requirement (float `Polygon.intersects` is sound only for convex
     regular tiles — settled decision, NOTES §9.4).
  2. **Out:** free angles; irrational angles; non-unit edges (the three discussion.tex obligations
     stand un-discharged); multi-parameter families; anything approaching general irregular polygons
     (Berger ceiling, per ST-7).
  3. State it as a positive capability ("the framework extends as-is to X") + a negative ruling
     ("Y requires machinery this thesis does not build"), not as future-work hand-waving.
- **Acceptance:** the paragraph is in the ST-7 section; preliminaries' equilateral-irregular definition
  ([TX-7](02-thesis-alignment.md) rewrite) cross-references it.
- **Cross-refs:** ST-7, [TX-7](02-thesis-alignment.md), [TH-3](03-theory-obligations.md).

---

### ST-9 — Productive star-fill validation gap (C3 has no positive oracle)

- **Severity / verdict:** minor; finding _idx 15 (minors list — not adversarially verified; core
  citations spot-verified: the spike honesty note and the C3 palette loop check out).
- **Evidence (spot-verified):** `scripts/spike-star-4p.ts:60-65` (harness's own note: 4(p)'s
  translational cell = the single-VC fan, "it CLOSES mod Λ with NO productive fill — the star in the
  certified cell came from the SEED … (The TA contract assumed 4(p) needs fill; it does not.)");
  `lib/classes/algorithm/PeriodSolver.ts:725-728` (C3 palette loop — line drifted from the finding's
  :727 to :728 in the working tree); NOTES §23.2 B3b (4(j)'s independent G1-G4 gate rationale: "a
  validator bug and a bad cell are indistinguishable"); git status (Increment-2 soundness layer =
  uncommitted working tree on `feat/c7-star-spike`; sole commit d721b8d still contains the
  documented-unsound n-keyed area ladder).
- **Problem:** Both certified star tilings close from their seed fans with zero corner-completion, so
  the star-seating fill branch — the one code path that will carry star enumeration completeness — has
  only ever run on non-closing lattices where its output is discarded. A bug that wrongly rejects or
  mis-seats a fill-constructed star is invisible to every existing test and would surface only as
  silent incompleteness in the 8h run. Compounding: the entire §24 soundness layer is uncommitted, and
  4(p) never got the independent G1-G4 gate 4(j) got.
- **Fix spec:**
  1. Commit Increment 2 (the soundness fixes must not exist only as working tree) — evidence-hygiene
     umbrella: [CB-9](01-code-bugs.md).
  2. **Fill-requiring positive test** (the item's core): seed 4(j) from a STRICT sub-fan — a single
     octagon + one star point (not the full `8.4*.8.4*` fan) — so corner-completion MUST construct the
     second star via the C3 palette; assert the same certified 4(j) cell emerges (same |det Λ| = 4+2√2,
     same composition, congruent to the full-fan cell). Add as a vitest (`tests/`), not a script-only
     check. If the sub-fan seed is rejected upstream (allowed-VC set built from seed VCs — verify
     against PeriodSolver's allowed-VC construction before writing the test), use the smallest seed
     that passes the gate but still under-specifies one star; record which.
  3. Run the existing G1-G4 independent gate on the 4(p) cell (one-call addition to the spike harness);
     log the result in §24.
- **Acceptance:** the fill-requiring test passes and FAILS when the star palette line
  (`PeriodSolver.ts:728`) is commented out (mutation check — proves the test exercises C3); 4(p) G1-G4
  output recorded; branch committed. Regular digests byte-identical (star-lane changes only); probe 1/2
  re-run after the Increment-2 commit.
- **Cross-refs:** [CB-9](01-code-bugs.md), ST-2.
