# TH-4 + TH-13 star tables — design (2026-06-10, CC)

**What.** The CC-side finite exact computations for the star lane, per the review work orders
(`docs/review-2026-06-09/03-theory-obligations.md` TH-4 / TH-13) and the TA's TH-3 discharge note
(`../resources/research/star-quotient-repair-TH3-2026-06-10.md` "CC follow-ups"):

- **TH-4:** the exact d_max table — max vertex degree consistent with the 2π angle equation and
  the two k-independent Myers prunes over the in-ring star corner alphabet. Consumed by TA in
  cor:starbox(i) (`F ≤ (d_max/2−1)·12k`) and the restated Remark 3 (`δ ≤ 2k·d_max`).
- **TH-13 step 1:** the exact γ-feasibility table — for each of the 32 in-ring variants, ALL
  corners (regular and star-point) matching the dent-fill angle γ = 24/n + α, classifying each
  variant REGULAR-FILLABLE / POINT-ONLY / UNFILLABLE.

**Honest framing of the deliverable (goes verbatim into SYNC):** these tables are the *constants
input* to TA's restated B1/flag-count transfer lemma. TH-4 is discharged when TA re-proves the
transfer with d_max — not when the tables land. TH-13 is discharged by TA's lemma-or-scope-cut;
the table tells TA where the lemma is vacuous and where the local exclusion must be attempted.

**Out of scope (decided with AL 2026-06-10):** the TH-13 fallback measurement run
(`scout-star-inring.ts --variants all`, multi-hour) — contingent on TA's lemma verdict and on
machine availability (parallel CC session running CB probes).

## Stated premises (table preamble — not inherited from the enumerator)

TH-4 exists because an unstated premise (d ≤ 6) was false. The tables therefore state their
premises as mini-lemmas rather than citing "the live enumerator implements them":

- **P1 (≤ 1 dent per vertex).** Dent corners are reflex: β = 24 − 24/n − α > 12 units (since
  α < 12 − 24/n). Two reflex corners sum to > 24 units = 2π. ∎ (k-independent.)
- **P2 (no two adjacent star points).** An isotoxal star's boundary corners alternate point/dent,
  so every star edge runs point→dent. If points of stars S₁, S₂ are adjacent at vertex v, the
  shared full edge e (edge-to-edge) runs point→dent on both, putting a dent of S₁ AND a dent of
  S₂ at e's far endpoint — two reflex corners at one point, > 2π by P1's arithmetic. ∎
  (k-independent; uses only edge-to-edge + isotoxality. NOT prune (iii), which is
  uniformity-dependent — TH-5.)
- **P3 (scope, stated not derived).** The universe is the registered in-ring orders
  n ∈ {3, 4, 6, 8, 12} with point angles 0 < α < 12(n−2)/n in π/12 units — the C7/ST-1 scope
  (32 variants). n = 24 and n ∤ 24 are outside scope; flagged in the table header.
- **P4 (degree = t, true vertices only).** d_max ranges over t ≥ 3 tiling vertices
  (def:tiling-vertex); t = 2 dent-fills are non-vertices. Vertex degree in Γ⋆ = number of
  incident corners = t.

**Prune (iii) is used NOWHERE in the published numbers.** See route design below — this is the
trap the original TH-4 finding documents, and it bites a second time at the Fig-3 column.

## TH-4 — `scripts/star-dmax-th4.ts`

### Module layout (one engine, three consumers — no copied constants)

The computation core is exported library code; the scripts are thin CLI wrappers (arg parsing +
log writing), and the pinned-constants test imports the SAME engine. A test that hard-codes
`expect(9)` against a hard-coded table tests nothing; here the test recomputes via the engine
and compares to the hand-derived constants, so alphabet drift breaks it.

- `lib/classes/algorithm/StarDmaxRoute2.ts` — the independent engine. **Zero imports from
  `StarVC.ts`** (mechanically greppable). Pure; no `node:fs` (safe for the `@/classes` direct
  import convention; NOT added to the barrel).
- `lib/classes/algorithm/StarTables.ts` — Route 1 wrapper (imports `enumerateStarVCs` /
  `inRingStarVariants` / `dentRegularFillableVariants`), the per-cell agreement + invariant
  checks, table assembly, and the TH-13 γ-table. Imports Route 2's module.
- `scripts/star-dmax-th4.ts`, `scripts/star-dentfill-th13.ts` — CLI wrappers; all `node:fs`
  logging lives here.
- `tests/star-vc.test.ts` — imports `StarTables.ts` / `StarDmaxRoute2.ts` and pins the
  constants below.

### Route 2 (published number) — independent multiset engine

Derives the alphabet from the formulas in P3 (regular interiors (n−2)·12/n; points
0 < α < 12(n−2)/n; dents β = 24 − 24/n − α) — never from `inRingStarVariants()`. Enumerates corner multisets with Σu = 24, t ≥ 3, ≤ 1 dent (P1),
#points ≤ ⌊t/2⌋ (⟺ a cyclic arrangement with no two points adjacent exists — pigeonhole; P2).
**No constraint on point count from below** — dent-no-point and pure-regular multisets are in
the search space. Maximize t; record a witness multiset.

### Route 1 (agreement check) — the live enumerator + exhaustive fold-backs

Max token count over `enumerateStarVCs({variants, includeDents})`. The enumerator hard-codes
prune (iii) at `StarVC.ts:134` (unconditionally — `includeDents` does not bypass it), so its
output covers only point-carrying VCs. Exhaustive case split over all (i)/(ii)-admissible VCs:

1. **point-carrying** — covered by the enumerator;
2. **pure-regular** — corners ≥ 4 units ⇒ t ≤ 6 (witness 3⁶);
3. **dent-no-point** (Fig-3 only) — β ≥ 13 leaves ≤ 11 units ⇒ ≤ 2 regulars ⇒ t ≤ 3.

Route 1's value = max(enumerator max, 6, 3 if dents allowed). The explicit max() makes no
assumption that the point-carrying max beats 6 — it handles poor per-variant alphabets where it
might not. The case split is what makes Route 1 sound without prune (iii); each case's bound
goes in the NOTES entry as a one-line lemma.

### Agreement gate

Per-cell (every row × every column): Route 1 value == Route 2 value, else print both witnesses
and `process.exit(1)`. The published table is Route 2's numbers; Route 1 is the cross-check
that the citable enumerator semantics agree.

### Table shape

- **Rows:** 32 per-variant families 𝓕(n,α) = {regulars} ∪ {(n,α)}; envelopes: all-32 mixed,
  dent-reg-19 mixed, regular-only.
- **Columns — three strata per row:** Fig-4 (0 dent tokens) | Fig-3(=1) (exactly one dent token
  — the dent-at-vertex stratum TH-3's Γ⋆ bookkeeping consumes) | Fig-3(≤1) (the full Fig-3
  universe — reported because the work order asks for it, but its value is the identity
  max(Fig-4, Fig-3(=1)) and its envelope is dominated by dentless VCs). Each cell: d_max +
  witness VC. Same enumeration, one dent-count bookkeeping flag.
- **Per-cell structural invariants (checked, exit non-zero on failure):**
  Fig-3(≤1) == max(Fig-4, Fig-3(=1)), hence Fig-3(≤1) ≥ Fig-4.
- **Pinned expectations (hand-derived, acceptance gate for Fig-4):**
  - regular-only = **6**;
  - all-32 envelope = **9** (witness: 4 × (α=1 point) + 5 triangles = 4+20 = 24, p = 4 ≤ ⌊9/2⌋;
    t = 10 impossible: minimum 5·1 + 5·4 = 25 > 24);
  - dent-reg-19 envelope = **9** (3\*@1 and 8\*@1 are in the 19);
  - every 𝓕(n,1) = **9**; every 𝓕(n,2) = **8**;
  - **Fig-3(=1) all-32 envelope = 6** (witness: one dent β = 13 (3\*d@13, i.e. n=3, α=3) +
    3 × (α=1 point) + 2 triangles = 13+3+8 = 24, t = 6, p = 3 ≤ ⌊6/2⌋; t = 7 impossible:
    p ≤ 3 forces ≥ 3 regulars, min 13 + 3·1 + 3·4 = 28 > 24);
  - the review's degree-7 falsifier [8\*p@1, 3, 3, 3, 3\*p@3, 3, 3] appears in the all-32
    enumeration (witness-presence is a sanity anchor, NOT the acceptance — the max is).
- Remaining Fig-3(=1) per-family values: computed + route-agreement-checked; pinned in the test
  from the first verified run (no hand-derived expectation claimed for them). Fig-3(≤1) needs no
  independent pins — it is pinned by the per-cell identity invariant.
- **Transfer constant handed to TA explicitly:** δ ≤ 2k·d_max = **18k** for the in-ring
  universe (vs the crude envelope guess ≈ 11 ⇒ 22k, and the false regular-derived 12k).

## TH-13 — `scripts/star-dentfill-th13.ts`

Per variant (n,α), all computed, none asserted:

- β = 24 − 24/n − α; γ = 24 − β = 24/n + α;
- **regular matches:** {m ∈ {3,4,6,8,12} : (m−2)·12/m = γ};
- **same-family point match:** γ == α? (arithmetically impossible — γ = α + 24/n, 24/n > 0;
  the script checks anyway);
- **cross-family point matches:** {m : m\*@γ exists as an in-ring variant, i.e.
  0 < γ < 12(m−2)/m} — phrased as variant-validity, not as an angle comparison;
- **dent matches:** {(m,α′) : 24 − 24/m − α′ = γ} (expect ∅: γ < 12 < 13 ≤ β′ — provable in a
  line, computed anyway);
- **gear column (first rung of lem:dentchain):** for each cross-family filler m\*@γ, the
  filler's own dent-fill angle γ′ = 24/m + γ and its match class;
- **verdict:** REGULAR-FILLABLE (kept by today's filter) / POINT-ONLY (dropped today;
  gear-fillable in the mixed universe only) / UNFILLABLE (no single corner matches —
  provably Fig-4-absent, sharper than the filter's current justification).

**Cross-checks:** REGULAR-FILLABLE count == `dentRegularFillableVariants().length` == 19;
verdict classes partition the 32.

**Analytical rider for TA (verified by the same-family column):** within any single-variant
tiling, star-point dent-fill is impossible ⇒ the regular-filler hypothesis (= the sharp tier of
thm:starweight/lem:dentchain) holds **unconditionally** for single-star-variant in-ring tilings;
the entire at-risk class is mixed-variant. Gear chains require ≥ 2 distinct variants.

## Artifacts & landing

- Branch `feat/th4-th13-star-tables` off master@`0291e83`, worktree
  `~/.config/superpowers/worktrees/TilingAtlas/th4-th13-star-tables`.
- New library modules `lib/classes/algorithm/StarDmaxRoute2.ts` + `StarTables.ts` (additive;
  pure, no `node:fs`; not barrel-exported) — the single engine shared by scripts and test.
- `scripts/star-dmax-th4.ts`, `scripts/star-dentfill-th13.ts` — thin `pnpm tsx` CLI wrappers;
  exit non-zero on any cross-check failure; write logs synchronously (experiments rule).
- Logs committed: `experiments/results/th4-star-dmax-<commit>-2026-06-10.log`,
  `experiments/results/th13-dentfill-table-<commit>-2026-06-10.log`.
- Pinned-constants tests appended to `tests/star-vc.test.ts`, importing the engine (recompute,
  compare to hand-derived constants — no copied tables): Fig-4 pinned expectations + the
  Fig-3(=1) envelope = 6 + the per-cell identity/inclusion invariants + the 19-count; remaining
  Fig-3(=1) constants pinned post-verification. Guards the committed tables against silent
  alphabet drift.
- `StarVC.ts` and `scout-star-inring.ts` UNTOUCHED — zero decisive-path risk by construction;
  regular digests untouched trivially (no regular-path file changes).
- Docs: NOTES §35 (premise mini-lemmas P1/P2 + fold-back lemmas + results + the same-family
  rider + honest flags), 3–6-line SYNC entry CC→TA with the honest framing above, NEXT/STATUS
  refresh. `pnpm build` before reporting done (workflow rule).

## Acceptance

1. Both scripts run clean (exit 0), logs committed, per-cell route agreement + the
   Fig-3(≤1) == max(Fig-4, Fig-3(=1)) identity on every cell.
2. Fig-4 pinned expectations all match (6 / 9 / 9 / 9-per-𝓕(n,1) / 8-per-𝓕(n,2));
   Fig-3(=1) all-32 envelope = 6; degree-7 falsifier present.
3. TH-13: 19/32 REGULAR-FILLABLE, same-family column all-impossible, dent-match column all-∅,
   verdicts partition 32.
4. `pnpm build` clean; star-vc tests green (8 baseline + new pinned).
5. SYNC/NOTES/STATUS/NEXT updated with the constants-input framing (TH-4 NOT claimed
   discharged).

## Honest flags

- Route 2's "#points ≤ ⌊t/2⌋ ⟺ cyclic non-adjacent arrangement exists" is a standard pigeonhole
  reformulation of P2's adjacency form; the per-cell route agreement is the guard.
- P3's n-set {3,4,6,8,12} is inherited scope (C7/ST-1), not derived — if the star scope ever
  widens (n=24, off-ring α), every constant in these tables must be recomputed; the pinned test
  will not catch THAT (it pins the current alphabet's values, it cannot know the scope changed).
  Flagged in both table headers.
- Fig-3 d_max is published for completeness of the TH-4 work order; the Fig-3 *class* itself
  remains best-effort in the solver (dent-at-vertex VCs, `--dents`), outside the certified
  in-ring k=1 record.
