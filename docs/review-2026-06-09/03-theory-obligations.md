# 03 — Theory obligations (CC→TA handoff brief)

Provenance: verified findings of the 2026-06-09 adversarial review. Index: [README.md](README.md).
This doc is the CC→TA handoff: each item gives the statement-to-prove, a suggested proof route, what
it unblocks, and an honest effort class (*paragraph* / *real lemma* / *research question*). Thesis
paths are `../thesis/chapters/<file>.tex`; TA notes `../resources/research/`. Digest discipline:
none of these items may touch the decisive code path except where noted; any code change must keep
the k≤2 digests `6f9ca9cf…` / `f3e2e051…` byte-identical and pass the k=3 oracle regression.

| ID | title | severity | owner | depends on | status |
|----|-------|----------|-------|------------|--------|
| TH-1 | octagon-exclusion lemma (4.8.8 ⇒ Archimedean) | major | TA | — (gates step 2) | [x] 2026-06-10 |
| TH-2 | C1 Part B status (positional/fill completeness) | open obligation | TA | — | [ ] |
| TH-3 | star quotient repair (Γ + dent-fill nodes, restated thm:weight/cor:box) | major | TA | — (gates step 2) | [ ] |
| TH-4 | star vertex-degree bound (d≤6 false; δ≤2k·d_max) | minor ⚠ | TA+CC | — | [ ] |
| TH-5 | Myers prune (iii) re-scope to k=1 + sound k≥2 form | major | TA+CC | — | [ ] |
| TH-6 | star chirality (k=1 remark; k≥2 mirror-closed nodes) | major | TA | — | [ ] |
| TH-7 | pinned ⇒ rational-α lemma + per-N completeness-for-pinned | major | TA | — | [ ] |
| TH-8 | 1-parameter stratification theorem (root isolation, no CAD) | major | TA | TH-7 | [ ] |
| TH-9 | grid-stabilizer orbit-dedup bijection (gates OP-3) | major | TA | — | [ ] |
| TH-10 | tighter weight bound (min cycle basis / per-\|V(Q)\| strata) | conditional | TA | [DG-1](00-decision-gate.md) | [ ] |
| TH-11 | B2.2 D-D realizability + realizer termination ⚠ | major ⚠ | TA+CC | [DG-1](00-decision-gate.md) | [ ] |
| TH-12 | monogonal ⇒ uniform theorem check (G&S 1977) | minor ⚠ | TA+AL | — | [ ] |
| TH-13 | dent-fillability filter soundness (single-regular-corner) | obligation | TA+CC | TH-3 | [ ] |

---

### TH-1 — Octagon-exclusion lemma (4.8.8 monocoronal ⇒ Archimedean)

> **DISCHARGED 2026-06-10 (TA).** `lem:octagon` + `cor:octagon` landed in correctness.tex after
> rem:singleton, cited at the val-k3 restriction point. Proof is self-contained (no
> compatibility-graph import, no TH-12 dependency) and strengthened to arbitrary edge-to-edge
> tilings of the core. Detail: `../../../resources/research/octagon-exclusion-lemma-TH1-2026-06-10.md`.

- **Severity / verdict:** major, verified real (high confidence); **already flagged internally** at
  `docs/SYNC.md:48-51, 72-74`, `docs/FRONTEND_ROADMAP.md:100-109`, `../resources/research/TA_LOG.md:63`
  — *stated*, never *proven*, never carried into the thesis.
- **Evidence:** `../thesis/chapters/results.tex:4-6` (chapter scoped to {3,4,6,8,12}), `:117-118`
  (sweep covered "all 447 seed sets for the {3,4,6,12} family"), `:193-195` (4.8.8 isolated in the
  compatibility graph); `../thesis/chapters/preliminaries.tex:87-93` (six unrealizable species incl.
  3.8.24); `../thesis/chapters/correctness.tex:509` (lem:seedcover), `:536` (rem:singleton — the
  "single vc ⇒ vertex-transitive" step declared unproven); `docs/DEVELOPMENT_NOTES.md` §14.3-14.4.
- **Problem:** tab:counts reports k=3=61 for the full core {3,4,6,8,12}, but the certifying sweep ran
  only {3,4,6,12}. The implicit bridge — no 3-uniform tiling of the core contains an octagon — is
  exactly an instance of the monocoronal class rem:singleton declares unproven. The oracle cannot
  plug the hole: no oracle k≤6 tiling contains an octagon (all coordinates in ℤ[ζ₁₂]), so a
  hypothetically missed octagon-bearing 3-uniform tiling is invisible to per-tiling oracle match.
- **Statement to prove:** *Every edge-to-edge tiling of the plane by regular polygons from
  {3,4,6,8,12} that contains at least one octagon is the Archimedean tiling 4.8.8 (hence 1-uniform).
  Corollary: for k ≥ 2 the {3,4,6,12} sweep is complete for the full core.*
- **Proof route:** (1) the only realizable octagon species in-family is 4.8.8
  (preliminaries.tex:87-93 kills 3.8.24 and the rest); (2) 4.8.8 is isolated in the compatibility
  graph (results.tex:193-195), so by the lem:seedcover propagation argument every vertex of an
  octagon-bearing tiling is type 4.8.8 — the tiling is monocoronal with a single vc; (3)
  corona-rigidity: the first corona of a 4.8.8 vertex is forced (each octagon edge shared with
  octagon-or-square per the vertex types; squares isolated between four octagons), and the forcing
  propagates corona-by-corona, so the tiling is congruent to the Archimedean 4.8.8 — vertex-transitive,
  1-uniform. Step (3) is the singleton step *for this one species*: rigid, paragraph-level. Check
  TH-12 first — G&S 1977 may already contain the monogonal-4.8.8 case as a citable theorem.
- **Fix spec:** 1. TA writes the lemma + proof in correctness.tex (near rem:singleton). 2. Cite it in
  sec:val-k3 at the family-restriction sentence (text edit owned by [TX-2](02-thesis-alignment.md)).
  3. Fallback if the proof resists: rescope tab:counts' k=3 row to {3,4,6,12}, or run the k=3 sweep
  including the 4.8.8-singleton seed sets.
- **Effort:** paragraph-to-half-page; a real (if elementary) proof, not hand-waving.
- **Acceptance:** lemma typeset and cited at the restriction point; no code change, digests untouched.
- **Cross-refs:** [TX-2](02-thesis-alignment.md), [TH-12](#th-12--monogonal--uniform-theorem-check-gs-1977). **Priority: HIGH — gates step 2.**

### TH-2 — C1 Part B (positional/fill completeness) — STATUS item

- **Severity / verdict:** standing open obligation (not a new review finding; restated here because
  several items above lean on it).
- **Evidence:** `docs/STATUS.md:56` — "The live completeness question is now **C1 Part B
  (positional/fill completeness)**, not reflection";
  `../resources/research/reflection-coverage-lemma-2026-06-07.md` §6 "Scope" (lines 90-93).
- **What it is:** the reflection-coverage lemma proves the *linear* half — every handedness and
  orientation a tiling can present is covered by {s₀, s̄₀} under C_N placement. It explicitly
  **assumes** the orthogonal half: that placing the correctly-oriented seed at the right position and
  running the deterministic fill inside the proven box actually recovers T (the proven-box /
  "searchable box" matter). That assumed half = C1 Part B, TA-deferred.
- **What the k≤3 claim means while open:** the certified 11/20/61 stand on per-tiling oracle match —
  every Soto-Sánchez tiling was recovered byte-exactly, which *witnesses* that fill reached each of
  them. Soundness and oracle-anchored completeness are intact. The *proof-grade*, oracle-independent
  completeness claim has C1 Part B as an open hypothesis: the chain c:seeds (lem:seedcover) +
  c:lattice (thm:weight/cor:box) + c:fill is only as proven as its fill leg.
- **Fix spec:** 1. TA states the fill-completeness lemma precisely: *for any Λ-periodic tiling T
  containing seed s at x, the torus fill on Λ from s placed at x terminates with T's torus cell*
  (fill exhaustiveness + reach, in the proven configuration). 2. Until proven, the thesis must carry
  it as a named hypothesis where the completeness theorem is asserted —
  [TX-4](02-thesis-alignment.md)'s prop:gate hypothesis item. 3. The measured shadow (pool reach) is
  [CB-8](01-code-bugs.md)'s loud-truncation assertion.
- **Effort:** real lemma, possibly hard — the genuinely open leg of the completeness proof.
- **Acceptance:** either the lemma lands (thesis + TA ledger), or every completeness statement in the
  thesis names the hypothesis explicitly.
- **Cross-refs:** [TX-4](02-thesis-alignment.md), [CB-8](01-code-bugs.md), [ST-2](05-star-and-new-directions.md).

### TH-3 — Star quotient repair: Γ with dent-fill nodes; restate thm:weight/cor:box; explicit star a_max

- **Severity / verdict:** major, verified real (high confidence), not previously connected to the
  thesis (the implementation-side analogue §24.2 is flagged; the thesis-level transfer claim is not).
- **Evidence:** `../thesis/chapters/correctness.tex:314` (lem:quotient — Γ = "tiling vertices and unit
  edges", |V(Q)| ≤ k|P| via the k-orbit split), `:370` (thm:weight), `:462-475` (rem:starsweight —
  "only the auxiliary constants of cor:box change"); `docs/DEVELOPMENT_NOTES.md` §24.2 (vcAreaSet
  "assumes every tile corner is a counted vertex — FALSE for stars", silently dropped the true 4(j)
  cell); `../resources/research/star-vc-implementation-contract-2026-06-08.md` §A4 (consistency claim
  stated backwards); 4(j) cell data: NOTES §23.3 ({1 oct + 1 star}, |det Λ| = 4+2√2).
- **Problem:** under the ≥3-tile star vertex convention (adopted by the implementation, see
  [TX-7](02-thesis-alignment.md)), the two unit edges flanking a dent-fill have an endpoint that is
  NOT a tiling vertex: Γ as defined is not a well-formed graph, lem:quotient's connectivity and
  orbit-split arguments fail, and lem:voltage's edge-by-edge lift breaks. Concrete counterexample
  from the project's own certified cell: 4(j) has 2 true-vertex classes (deg 4), 4 dent-fill classes,
  8 edge classes — the true-vertex handshake reads 8 = 16 (deficit 2D = 8) and |E| = 8 > 3|V| = 6
  breaks cor:box(i)'s chain. rem:starsweight's "only constants change" is therefore unsound as
  stated; the star lattice-enumeration completeness theorem does not yet exist. Secondary: a_max is
  left symbolic, but as α → 12(n−2)/n the in-ring star degenerates toward the edge-length-2 regular
  n-gon, so star a_max approaches 4× the regular a_max — the box/pool constants inherited from
  regulars are materially undersized (the §24.8.5 poolLmax flag is the measured shadow).
- **Statement(s) to prove:** (a) *Γ⋆ definition:* for star families let V(Γ⋆) = tiling vertices
  (≥3-tile points) ∪ dent-fill points (2-tile 2π points, as degree-2 nodes), E(Γ⋆) = unit edges; Γ⋆
  is a well-formed connected graph and lem:voltage's lift goes through. (b) *Dent-class bound:* per
  fundamental cell the number D of dent-fill Λ-classes satisfies D ≤ Σ_stars n_s (star corners per
  cell), with star-tile classes bounded through vertex incidences — formalize Myers's flanking-points
  argument for the edge-to-edge case, covering BOTH the filled-dent and dent-at-vertex classes; hence
  |V(Q⋆)| ≤ k|P| + D. (c) *Restated thm:weight/cor:box* with corrected |V(Q⋆)|, |E(Q⋆)|, and an
  explicitly computed star a_max per family.
- **Proof route:** option (a) (degree-2 nodes) is the right repair — the alternative (smoothing
  dent-fills into 2-step edges) inflates voltages past single ζ^j and wrecks the weight count. The
  TA's own `star-increment2-contract-2026-06-08.md` §3 already derives
  V = [Σ_reg(n−2) + Σ_star(2n_s−2)]/2 − D and names bounding D "the open piece I'll derive" — this
  item is that piece plus the theorem restatement. Sanity anchor: on the new Γ⋆, 4(j) satisfies
  Σdeg = 2·4 + 4·2 = 16 = 2|E| ✓.
- **Fix spec:** 1. TA proves (a)-(c). 2. Rewrite rem:starsweight as a remark-with-obligations
  discharged by the new lemmas (text edit owned by [TX-4](02-thesis-alignment.md)); revise
  discussion.tex's "extends mechanically" (the project's own §24.2 falsified "mechanically"). 3. CC
  audits the star path's aMax in `PeriodSolver` (currently the 24k·max-tile-area regular-derived
  bound, NOTES §24.3 "sound superset" — resting on the unproven transfer) against the new bound.
- **Effort:** real lemma + restated theorem (the central star-theory deliverable).
- **Acceptance:** restated star thm:weight/cor:box typeset; explicit exact star a_max committed; 4(j)
  verifies the new identities; regular digests untouched by construction (regular family has no
  2-tile points, NOTES §23.1 A2 — no two regular core angles sum to 2π).
- **Cross-refs:** [TX-4](02-thesis-alignment.md), [TX-7](02-thesis-alignment.md),
  [ST-1](05-star-and-new-directions.md), [ST-2](05-star-and-new-directions.md),
  [TH-13](#th-13--dent-fillability-filter-soundness-single-regular-corner-assumption).
  **Priority: HIGH — gates step 2.**

### TH-4 — Star vertex-degree bound: d ≤ 6 is false; prove δ ≤ 2k·d_max(family)

- **Severity / verdict:** minor — **⚠ unverified (cap)**; spot-check the B1 note citation before
  acting. The degree-7 vertex arithmetic below was re-checked here and is correct.
- **Evidence:** `../resources/research/delaney-dress-size-bound-2026-06-06.md` lines 70-73 (Remark 3:
  transfer "unchanged" because "a star vertex still meets 3-6 tiles");
  `lib/classes/polygons/ExactStarPolygon.ts:44-62` (isotoxal guard: 0 < α < 12(n−2)/n units, N=24);
  `lib/classes/algorithm/StarVC.ts:33-40` (variants incl. 8\*@1, i.e. α = π/12 = 15°).
- **Problem:** the B1 flag-count bound δ ≤ 12k needs d_i ≤ 6, which is specific to convex regulars
  (min interior angle 60°). In-ring stars admit point angles down to 1 unit (15°). Counterexample
  vertex: [8\*p@1, 3, 3, 3, 3\*p@3, 3, 3] = 1+4+4+4+3+4+4 = 24 units = 2π, points non-adjacent —
  degree 7. Whether it occurs in an actual k-uniform tiling is irrelevant: the remark asserts the
  proof premise, which is false, so δ ≤ 12k is unproven for star families — completeness-critical for
  any star D-D alphabet sweep.
- **Statement to prove:** *for each star family F, δ ≤ 2k·d_max(F), where d_max(F) = the maximum
  vertex degree consistent with the exact 2π angle equation and Myers prunes (i)/(ii) over F's corner
  alphabet* — a finite exact computation over the registered variants (crude N=24 in-ring envelope:
  d_max ≈ 11, δ ≤ 22k).
- **Fix spec:** 1. CC scripts the exact d_max computation over `inRingStarVariants()` (units of π/12,
  prunes (i)/(ii) as in `enumerateStarVCs`). 2. TA restates Remark 3 as δ ≤ 2k·d_max(F) with the
  derived constant and propagates it into every star D-D cost estimate. 3. Restate the free-action
  premise for star flags explicitly (currently asserted, not checked, for reflex corners).
- **Effort:** paragraph + a finite computation.
- **Acceptance:** Remark 3 restated; d_max table committed under `experiments/results/`; no decisive
  code path touched.
- **Cross-refs:** [TH-11](#th-11--b22-d-d-realizability--realizer-termination--unverified-cap),
  [ST-3](05-star-and-new-directions.md).

### TH-5 — Myers prune (iii): re-scope to k=1; state the sound k≥2 form

- **Severity / verdict:** major, verified real (high confidence; Myers 2004 p.21 quote and the seven
  Myers-2009 counterexamples verified from the fetched PDFs), not already addressed.
- **Evidence:** Myers 2004 p.21 ("We only consider uniform tilings, so all vertices are alike … some
  vertex, *and so all vertices*, must have a star point" — the italicized step IS vertex-transitivity);
  Myers 2009 Figs 25, 36, 38-42 (2-uniform tilings with one purely regular vertex orbit, several
  in-ring); unscoped recordings: `../resources/research/star-scout-scoping-2026-06-06.md:95`,
  `star-vc-implementation-contract-2026-06-08.md:157`, `star-increment2-contract-2026-06-08.md:86`,
  `docs/DEVELOPMENT_NOTES.md:1834`; code (harmless today): `lib/classes/algorithm/StarVC.ts:99`
  (k=1 derivation comment), `:134` (`if (!stack.some(isPoint)) return`).
- **Problem:** three project documents record "every star-tiling vertex has ≥1 star point" as a fact
  about ANY star tiling; Myers proves it via vertex-transitivity for uniform tilings only, and his
  own k=2 list falsifies the general form at least seven times. Prunes (i)/(ii) are local-angle
  arguments, valid at all k; only (iii) is uniformity-dependent. The code is k=1-scoped and correct,
  but the contracts are the spec-in-waiting for k≥2 — a k≥2 seed layer built from the recorded triple
  would silently drop every counterexample tiling, the exact silent-incompleteness class the
  doctrine forbids. Aggravating: the project nowhere references Myers 2009, so the per-tiling-oracle
  safety net would be absent at k≥2 (see [ST-3](05-star-and-new-directions.md)).
- **Statement (sound k≥2 form):** *in any k-uniform star tiling, at least one vertex ORBIT carries a
  star point; equivalently, at the seed layer: at least one VC in the seed multiset carries a star
  corner.* (Proof: the tiling contains a star, the star has corners, each corner lies at a vertex or
  dent-fill; a star point at a t≥3 vertex gives the orbit — one line once TH-3's conventions exist.)
- **Fix spec:** 1. TA corrects the two contract notes + the scoping note (resources/ is TA-owned);
  CC corrects DEVELOPMENT_NOTES:1834 with a dated correction entry (append-only ledger — correct
  forward, don't rewrite). 2. CC adds a regression test pinned to Myers 2009 Figs 36/40/42 (in-ring,
  pure-regular second orbit): assert the k≥2 star VC layer does NOT exclude pure-regular VCs from
  multi-VC seeds (today: assert `enumerateStarVCs`'s (iii) gate is documented k=1-only).
- **Effort:** paragraph (documentation correction) + one regression test.
- **Acceptance:** notes restated; test added in `tests/star-vc.test.ts`; regular digests untouched.
- **Cross-refs:** [ST-3](05-star-and-new-directions.md), [TH-6](#th-6--star-chirality-k1-handedness-remark-k2-mirror-closed-vc-nodes).

### TH-6 — Star chirality: k=1 handedness remark; k≥2 mirror-closed VC nodes

- **Severity / verdict:** major, verified real (high confidence), not already addressed (the general
  star-reflection boundary is flagged at `docs/STATUS.md:57`; the three-way contradiction and the
  missing k=1 argument are recorded nowhere).
- **Evidence:** `../thesis/chapters/correctness.tex:650-658` (rem:reflectioncover(iii): star families
  — "explicit mirror seeding … must be reinstated", with a cross-ref to ch:discussion that dangles,
  see [TX-6](02-thesis-alignment.md)); `../resources/research/reflection-coverage-lemma-2026-06-07.md`
  §7 (pinned ring-multiple α: Prop 0 holds, lemma "transfers unchanged" — never carried into
  correctness.tex); `lib/classes/algorithm/StarVC.ts:73-86` (mirror-MERGED canonical name), `:135-137`
  (mirror VC deduped out of the node set), `:168-180` (`buildStarVCSeed`: ONE fan per merged name at
  dir = 0); `../thesis/chapters/preliminaries.tex:63-78` (def:vc: reflections NOT identified; chiral
  pairs must be two separate vcs).
- **Problem:** three artifacts disagree — thesis mandates mirror seeding, TA note waives it for
  pinned α, code does neither: it mirror-merges VC names and seeds one handedness, contravening
  def:vc and lem:seedcover's mirror-closure proviso. (In the regular path the merged name is labeling
  only — mirror-closure is enforced upstream at SeedBuilder via `getMirrorVCName`; the star path has
  no upstream, so the merged set IS the seed node set.) The k=1 safety argument exists but is written
  nowhere — "probably safe by an unwritten argument" violates the proof-before-implementation rule.
- **Statements to prove:** *(k=1 remark)* if every vertex of star tiling T carries chiral VC v, then
  the mirror tiling T̄ carries v̄, {T, T̄} is one mirror-merged congruence class, and — given fill
  exhaustiveness and a conjugation-closed lattice pool — seeding either handedness reaches the class;
  hence one fan per mirror-merged name suffices for k=1 single-VC seeds. *(pinned-α split)* for
  pinned ring-multiple α, Prop 0 (grid-confinement) holds and lem:reflectioncover transfers (assemble
  from TA note §7); for free α it fails and explicit mirror seeding is mandatory.
- **Fix spec:** 1. TA writes the k=1 remark (or, cheaper, CC adds the mirrored fan to
  `buildStarVCSeed` — at most 2× on a run measured in seconds/seed). 2. TA reconciles
  correctness.tex: split rem:reflectioncover(iii) into pinned-α vs free-α (text edit owned by
  [TX-4](02-thesis-alignment.md)). 3. For k≥2 star plans: revert StarVC to rotation-only
  canonicalization with mirror-closed node sets, matching the regular pipeline — record this as a
  design constraint in the k≥2 contract before any k≥2 code exists.
- **Effort:** k=1 remark = paragraph; pinned-α split = assembly from TA §7; k≥2 = spec constraint.
- **Acceptance:** remark recorded (thesis or TA ledger, cited from NOTES); if the mirrored fan is
  added: star k=1 class count unchanged (4(j) still one class), regular digests byte-identical.
- **Cross-refs:** [TX-4](02-thesis-alignment.md), [TX-6](02-thesis-alignment.md),
  [ST-2](05-star-and-new-directions.md), [TH-5](#th-5--myers-prune-iii-re-scope-to-k1-state-the-sound-k2-form).

### TH-7 — Pinned ⇒ rational-α lemma + per-N completeness-for-pinned

- **Severity / verdict:** major (from the verified free-α finding, high confidence). Caution from the
  verifier itself: the review's one-line proof sketch ("pinning equations are linear with rational
  coefficients") is **too quick** — vertex angle-sum equations are linear in α, but global closure
  conditions are trigonometric (sums of unit vectors at angles in (2π/N)ℤ + ℤα). Treat as a real
  lemma, not an assembly.
- **Evidence:** `../thesis/chapters/preliminaries.tex:34-41` (isotoxal definition: "To make the
  search finite we constrain α to a rational multiple of 2π" — verified verbatim; ℚ·2π is dense and
  countably infinite, so this is neither finite nor a definition);
  `../resources/research/star-scout-scoping-2026-06-06.md` §5 (other-N pinned tilings genuinely
  excluded: 4(e) α = 4π/9, 4(q) 5-fold); Myers 2009 abstract (38 tilings + 5 one-parameter families
  at k=2).
- **Problem:** the thesis presents a discretization as a definition. The honest scope is: per-N
  enumeration captures all pinned tilings whose α lies on the N-grid, plus one representative per
  family; family interiors and other-N pinned tilings are out of scope. That scope statement needs
  the lemma to be true.
- **Statement to prove:** *if an edge-to-edge isotoxal-star tiling's apex angle α is pinned (isolated
  in the realization space of its combinatorial type), then α ∈ ℚ·π.* Corollary
  (*per-N completeness-for-pinned*): the α ∈ (2π/N)ℤ enumeration is complete for pinned tilings whose
  α is an N-grid multiple; state explicitly which pinned tilings (other-N) and which families it
  misses.
- **Proof route:** first try to prove that pinning occurs only through vertex angle-sum equations
  (linear, rational coefficients over the family's rational-multiple-of-π regular angles) — then
  rationality is immediate. If global trigonometric closure can pin, the lemma needs the
  ℚ(ζ_N)(cos α, sin α) machinery of TH-8 (a pinned α is an algebraic point of the closure variety;
  rationality of α/π is then a genuine claim needing Niven-type / conjugate-symmetry arguments).
  Honest fallback: state the lemma for vertex-equation-pinned tilings only and scope the rest.
- **Effort:** real lemma, possibly research-question-adjacent in its full form.
- **Acceptance:** lemma (or its scoped fallback) typeset; preliminaries' definition rewritten as a
  scope statement (text edit owned by [TX-7](02-thesis-alignment.md)); the family-counting convention
  (family = one object vs one pinned representative) stated in results per
  [ST-8](05-star-and-new-directions.md).
- **Cross-refs:** [TX-7](02-thesis-alignment.md), [TH-8](#th-8--1-parameter-stratification-theorem-root-isolation-no-cad),
  [ST-8](05-star-and-new-directions.md).

### TH-8 — 1-parameter stratification theorem (root isolation, no CAD)

- **Severity / verdict:** major/expansion (same verified finding as TH-7). The correct output
  semantics exists only in the PARKED note `../resources/research/star-parametric-roadmap-2026-06-05.md`
  §2 ("'Finitely many strata' is the NEW completeness theorem to prove").
- **Evidence:** roadmap §2-§3; `lib/classes/polygons/ExactStarPolygon.ts:44-62` (the exact layer is
  the fixed-angle special case: N=24, integer α-units only; nothing symbolic exists); Myers 2009
  (five genuine one-parameter families at k=2, e.g. Fig 25 (3.3.3\*_α.3\*\*_α; 3⁶)).
- **Problem:** a per-N run sees each α as a different tiling and cannot count a family; members at
  irrational α/π are valid tilings unreachable by any per-N run. The honest deliverable is a
  stratification, and "finitely many strata" is currently an unproven theorem.
- **Statement to prove:** *for a fixed combinatorial type of a 1-parameter star family, the α-interval
  decomposes into finitely many maximal open subintervals of constant combinatorics (each a single
  congruence-class family) plus finitely many exceptional algebraic α; the critical values are real
  roots of the finitely many polynomial closure/degeneracy conditions of the type.*
- **Proof route:** one parameter ⇒ 1-D semialgebraic decomposition — NO cylindrical algebraic
  decomposition needed. Express closure/degeneracy conditions as polynomials in
  (c, s) = (cos α, sin α) over ℚ(ζ_N) modulo c² + s² = 1; finitely many conditions per type (voltage
  skeleton bounds the equations); isolate real roots exactly. The exactness story changes field —
  symbolic α needs ℚ(ζ_N)(c, s), and the planned ExactStarPolygon layer does not cover it; any
  implementation is new, off the decisive regular path.
- **Effort:** research question — but a realistic thesis-grade deliverable when scoped to ONE family
  ("one family, CAD-free, exactly stratified" = [ST-4](05-star-and-new-directions.md)).
- **Acceptance:** theorem proven for the chosen family; per-family symbolic certificate per ST-4;
  regular digests untouched (new code path only).
- **Cross-refs:** [TH-7](#th-7--pinned--rational-α-lemma--per-n-completeness-for-pinned),
  [ST-4](05-star-and-new-directions.md). **Priority: conditional — only if AL wants the parametric
  deliverable.**

### TH-9 — Grid-stabilizer orbit-dedup bijection lemma (gates OP-3)

- **Severity / verdict:** major, verified real (high confidence), not already addressed anywhere
  (grep of NOTES/STATUS/SYNC/WEAK_SPOT confirmed by the verifier).
- **Evidence:** `lib/classes/algorithm/LatticeEnumerator.ts:478` (`latticeKey` — Gauss-reduce + sign
  + order normalization only, NOT D_N-invariant: Λ and ζʳΛ get distinct keys), `:134-193 area`
  (obliqueCells pair-sweep over the direction-closed pool, dedup by latticeKey only);
  `../thesis/chapters/correctness.tex:661` (rem:fastpath — verbatim "the orientation range may
  soundly be reduced to coset representatives of the rotational symmetries of Λ" — the dual fact),
  `:550-575 area` (prop:fanseed, blanket seeding complete GIVEN Λ); lem:reflectioncover;
  `docs/DEVELOPMENT_NOTES.md:1443, 1522` (7362 distinct oblique lattices vs 127746 Σ-survivors at
  k=3 — the measured ~17× redundancy).
- **Problem:** the pool is closed under the family's direction group, so each oblique lattice shape
  is emitted in up to ~12 rotated (mod −1) plus reflected copies — and the oblique class (hol = 2,
  trivial stabilizer) carries the FULL orbit, i.e. the dominant class carries maximal redundancy.
  Filling one representative per grid-isometry orbit is sound but unproven; OP-3 must not ship
  without the lemma (completeness doctrine).
- **Statement to prove:** *let G be the grid point group (order ≤ 48 for N = 24). For any tiling T′
  with lattice gΛ (g ∈ G) and grid vertices, g⁻¹T′ has lattice Λ and grid vertices, and is reached
  when filling Λ in the proven configuration; the congruence merge identifies the outputs. Hence
  restricting the lattice pool to one generated representative per G-orbit of latticeKey classes
  yields the same set of certified congruence classes.*
- **Proof route (the promised 10-liner):** (1) g⁻¹T′ is Λ-periodic with the same orbit multiset
  (isometry-invariance, lem:equicert); (2) its seeds are on-grid rotations of the originals, all of
  which prop:fanseed places (blanket seeding covers all N rotations — in the fast path the rotated
  lattice copies currently double as implicit orientation coverage, so the lever is a bookkeeping
  swap: 12 seed rotations on 1 lattice instead of 1 orientation on 12 lattices); (3) reflections via
  lem:reflectioncover for the regular family; (4) the merge step identifies g-related outputs, and
  keeping one *generated* member per orbit cannot lose a shape — the generated member suffices.
- **Fix spec:** 1. TA writes the lemma (TA ledger note, then a remark in correctness.tex near
  rem:fastpath). 2. Hand to CC for [OP-3](04-optimizations.md): canonicalize latticeKey over the ≤48
  grid point-group images, with explicit rotation seeding. 3. Re-measure per
  [OP-9](04-optimizations.md) before re-projecting k=4.
- **Effort:** real-but-short lemma (10-20 lines).
- **Acceptance:** lemma written; OP-3's implementation then gated by byte-identical k≤2 digests
  (6f9ca9cf… / f3e2e051…) + k=3 oracle match — a changed digest = loud stop.
- **Cross-refs:** [OP-3](04-optimizations.md), [OP-2](04-optimizations.md), [OP-9](04-optimizations.md),
  [DG-1](00-decision-gate.md). **Priority: HIGH — gates OP-3; the §23.9 "no sound count-lever"
  decision input was computed without this lever.**

### TH-10 — Tighter weight bound (minimum cycle basis / per-|V(Q)| stratification)

- **Severity / verdict:** conditional obligation — no standalone verified finding; synthesized from
  the verified cost-analysis findings (S1/S2) and the unverified quotient-first finding (⚠ the
  quotient-first material passed the verification cap). Do not build on spec: condition on
  [DG-1](00-decision-gate.md)'s measurement showing the candidate-box term still binds after OP-1..3.
- **Evidence:** `../thesis/chapters/correctness.tex:370` (thm:weight — Λ generated by
  fundamental-cycle voltages of Q, each a sum of unit edges), `cor:box` (the single worst-case box),
  `:708` (prop:orbitfloor — |V(Q)| ≥ k·hol(Λ) lower bound already used as P0);
  `docs/STATUS.md:40-44` (oblique candidate counts at the P0 floor).
- **Problem:** cor:box uses one global worst case (weights ≤ |E(Q)| with |E(Q)| at its ceiling). If
  DG-1 shows the box still dominates, the sound tightening is structural, not a cap: shorter cycle
  bases give smaller voltage weights, and small quotients need small boxes.
- **Statement to prove:** *(a)* Λ is generated by the voltages of ANY cycle basis of Q (not just a
  fundamental one); choosing a minimum-weight basis gives generator weights ≤ w_min(Q) ≤ the current
  bound. *(b)* Stratify by q = |V(Q)| ∈ {1..k|P|}: for each q, a per-stratum box
  |det Λ| ≤ f(q) ≤ cor:box's global bound, enumerated per stratum — the union over q is exactly the
  current candidate set, so completeness is preserved by construction.
- **Proof route:** (a) is standard (basis change in H₁(Q); voltages are a homomorphism — thm:weight's
  own machinery). (b) needs the per-q area/degree counting of cor:box redone with |V(Q)| = q fixed;
  the quantified payoff is the research-question part.
- **Effort:** real lemma (a: short; b: moderate); payoff quantification = measurement, not theory.
- **Acceptance:** lemma typeset; per-stratum boxes verified to cover all currently-certified k≤3
  lattices (regression over the certified catalogue); digests byte-identical if/when implemented.
- **Cross-refs:** [DG-1](00-decision-gate.md), [OP-9](04-optimizations.md),
  [ST-6](05-star-and-new-directions.md). **Priority: conditional on DG-1.**

### TH-11 — B2.2 D-D realizability + realizer termination — ⚠ unverified (cap)

- **Severity / verdict:** major — **⚠ unverified (cap)**: the finding passed the verification cap
  (verdict skipped); spot-check the cited note lines before acting. The supporting literature note
  (also uncapped) is likewise unverified.
- **Evidence (as cited by the finding — spot-check):**
  `../resources/research/delaney-dress-realizability-lemma-B2-2026-06-08.md` lines 60-75 (B2.2),
  99-104 (Risk 1: "have NOT re-derived"), 113-119 (acceptance, unmet);
  `delaney-dress-implementation-contract-2026-06-08.md` §6 (B2 fallback: realizer as a FILTER);
  `experiments/delaney-dress/E3_RESULTS.txt` §5 (develop5.py an explicit SEMI-decision, "periodicity
  detection (translation-lattice recovery), NOT finished").
- **Problem:** certifying a k-count from Delaney symbols requires *deciding* realizability per
  surviving flat symbol. With B2.2 (flat symbol ⇒ plane tiling exists) underived and the realizer a
  semi-decision, a realizable symbol the realizer fails to confirm is a silently dropped tiling —
  the exact failure mode the doctrine exists to prevent. The proof burden re-enters in a new
  costume: torus "pool reach" becomes D-D "realizer termination/completeness". The shape is better
  (a one-time lemma, not a per-run reach parameter) — but only once B2.2 is written and the period
  recovery is implemented and proven terminating.
- **Statement to prove (one named obligation, same status as cor:box):** *(B2.2)* every flat
  (curvature-0) Delaney symbol over the family's alphabet is realized by an edge-to-edge plane tiling
  with the prescribed regular metric. *(Termination)* the Stage-2 realizer terminates on every flat
  symbol and decides realizability — every reject carries a proven obstruction.
- **Proof route:** assemble B2.2 from already-cited sources — Delgado-Friedrichs TCS 303 Thm 5
  (K = 0 iff Euclidean) + Balke-Huson 1996 (symbol-to-orbifold) + Thurston Ch. 13 (good-orbifold
  completeness) + the in-house B2.0/B2.3 regular-metric rigidity bridge — likely assembly, not new
  mathematics; run the adversarial pass. Realizer: develop the symbol's wallpaper group from chamber
  gluings (rigid by B2.0), extract the translation subgroup exactly, certify via the EXISTING torus
  certificate (lem:corona) — reusing the proven certifier makes accepts sound and rejects loud and
  auditable. Add the predicted-ghost test: a flat symbol with the 3.4.4.6-style strip obstruction at
  k ≥ 3 must be rejected for the documented reason. If assembly genuinely fails, that is itself
  DG-1-relevant information — discover it now.
- **Effort:** B2.2 = real lemma (assembly + adversarial pass); termination = real lemma + CC
  implementation.
- **Acceptance:** B2.2 written + adversarial pass logged in the TA ledger; M2 gated on the named
  obligation; ghost test in `experiments/delaney-dress/`; no decisive torus-path change.
- **Cross-refs:** [DG-1](00-decision-gate.md), [TX-6](02-thesis-alignment.md),
  [TH-4](#th-4--star-vertex-degree-bound-d--6-is-false-prove-δ--2kd_maxfamily) (star alphabet constant).

### TH-12 — Monogonal ⇒ uniform theorem check (G&S 1977)

- **Severity / verdict:** minor — **⚠ unverified (cap)** (no verdict recorded); the logical-gap claim
  is checkable by direct reading of background.tex and is consistent with rem:singleton.
- **Evidence:** `../thesis/chapters/background.tex:40-49` ("Since every 2-uniform tiling has two
  distinct vertex configurations, his n=2 result IS the proof that there are exactly 20");
  `../thesis/chapters/correctness.tex:536` (rem:singleton — the k-orbit generalization declared
  unproven); OEIS A068600 vs A068599; Grünbaum-Shephard, "Tilings by Regular Polygons", Math.
  Magazine 50 (1977) 227-247.
- **Problem:** Krötenheerdt's n=2 class is by definition 2-uniform with two DISTINCT configurations;
  A068599 would also include any tiling with two orbits of the SAME configuration (the analogue
  occurs at higher k — Galebach's "7-uniform, 6-Archimedean" example). The bridge is the classical
  theorem *every monogonal edge-to-edge regular-polygon tiling of the plane is uniform* — famously
  false in the hyperbolic plane, hence a real theorem needing statement + citation, currently a
  silent leap. Separately: nobody on the project has read Krötenheerdt's papers (German, not
  digitized); whether they contain reusable period/index bounds is unanswered, not answered-negative.
- **Fix spec:** 1. TA obtains and reads G&S 1977 (and T&P §2.1), confirms the theorem's exact
  statement and scope, and reports whether it covers the all-vertices-4.8.8 case — if yes, TH-1's
  step (3) may discharge by citation. 2. The bib + background text edits are owned by
  [TX-3](02-thesis-alignment.md). 3. AL orders ILL scans of the three Krötenheerdt papers; TA reads
  for (a) what he actually proved (protects the priority sentence, introduction.tex:93) and (b) any
  reusable bound.
- **Effort:** literature check (paragraph); ILL = logistics.
- **Acceptance:** theorem statement + citation recorded in the TA ledger and cited at
  background.tex:46-49; Krötenheerdt scans obtained or the "taken on trust" caveat kept explicitly.
- **Cross-refs:** [TX-3](02-thesis-alignment.md), [TH-1](#th-1--octagon-exclusion-lemma-488-monocoronal--archimedean).

### TH-13 — Dent-fillability filter soundness (single-regular-corner assumption)

- **Severity / verdict:** standing obligation — no standalone finding in the review JSON; lifted from
  the code's own loud flag (project doctrine: a flagged completeness assumption must be discharged or
  scoped before any "sound run" claim).
- **Evidence:** `lib/classes/algorithm/StarVC.ts:46-58` — `dentRegularFillableVariants` requires the
  dent-fill angle γ = 24/n + α to be a REGULAR interior (γ ∈ {4,6,8,9,10} units), cutting 32 variants
  to 19; the ⚑ flag at `:52-54` states it: "A Fig-4 tiling whose dent is filled by a STAR POINT (γ a
  point angle) would be DROPPED by this filter — not observed in the in-ring oracle, but a real
  completeness caveat for the general/Fig-3 case."
- **Problem:** the filter is angle-lossy by construction: γ values are also attainable by star POINT
  angles (e.g. n=8, α=1 ⇒ γ=4 — matched by the regular triangle but equally by point variants
  6\*p@4 or 4\*p@4), so star-point-filled dents are angle-feasible and the single-regular-corner
  restriction is a genuine assumption, not a consequence of the angle equation. At k=1 in-ring the
  Myers 2004 catalogue confirms it empirically; no proof exists, and the Fig-3 (dent-at-vertex) class
  is explicitly outside the empirical cover.
- **Statement to prove (or scope):** *in any in-ring k=1 isotoxal-star tiling of the Fig-4 class,
  every t=2 dent-fill corner is a regular corner* — OR, failing that, the sound-run configuration
  must enumerate star-point-fillable variants too, and the filter becomes a documented,
  oracle-checked optimization rather than a soundness assumption.
- **Proof route:** (1) CC first runs the finite exact feasibility table: for each of the 32 variants,
  list ALL corners (regular and point) matching γ — if for some family no star-point match exists,
  the lemma is vacuous there. (2) Where matches exist, TA attempts the local exclusion: a
  star-point-filled dent puts the filling star's point inside the dent, its two flanking dent edges
  adjacent to the point; propagate Myers prunes (i)/(ii) + the dent-fill angle equations around the
  filling star's own dents and look for a forced contradiction. Outcome unknown — this is a
  research-question-leaning lemma; budget a timebox and fall back to the scope statement (the
  fallback is [ST-2](05-star-and-new-directions.md)'s sound-run config: run with the unfiltered
  variant set; the solver rejects unrealizable extras at 0 cells, per the code's own comment).
- **Effort:** finite computation (CC, hours) + real lemma attempt (TA, timeboxed) or honest scope cut.
- **Acceptance:** either the lemma lands and the filter is cited to it, or the sound-run config drops
  the filter (solver-side rejection only) with the cost measured and logged in
  `experiments/results/`; star k=1 certified classes unchanged; regular digests untouched.
- **Cross-refs:** [TH-3](#th-3--star-quotient-repair-γ-with-dent-fill-nodes-restate-thmweightcorbox-explicit-star-a_max),
  [ST-2](05-star-and-new-directions.md), [ST-9](05-star-and-new-directions.md).
