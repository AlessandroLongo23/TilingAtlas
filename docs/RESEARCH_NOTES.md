# Research notes — literature & resources for the deterministic-lattice approach

> **Provenance.** Produced from a structured web research sweep (2026-06-02): 7 parallel agents over
> distinct angles (prior enumeration algorithms, toroidal/semi-equivelar maps, wallpaper/orbifold
> methods, lattice/sublattice enumeration, cyclotomic-exact geometry, validation datasets, fill-as-CSP),
> 57 findings, plus synthesis. **Confidence is annotated per item; some URLs returned 403 / were
> paywalled / abstract-only — those are flagged and have NOT been independently re-verified here.** Read
> against [`LATTICE_ENUMERATION_DESIGN.md`](LATTICE_ENUMERATION_DESIGN.md) (the design this informs) and
> [`DEVELOPMENT_NOTES.md`](DEVELOPMENT_NOTES.md).

---

## 0. The headline: HNF sublattice enumeration replaces "fix-short-solve-long"

The design doc §2/§3 proposed enumerating candidate Λ by fixing the short vector and solving the long
one, to dodge the `cmm` long-thin-rhombus blow-up. **The literature gives the clean, canonical form of
this idea: Hermite Normal Form (HNF) sublattice enumeration.**

Every index-`n` sublattice of a fixed reference lattice has a **unique** HNF basis
`[[a, b], [0, d]]` with `a·d = n`, `0 ≤ b < d`. So for each index `n` (= area / reference-cell-area, a
value on our area ladder), iterate divisors `a | n` (set `d = n/a`) and `b ∈ [0, d)`. This yields **all
`σ(n)` candidate sublattices — seed-free and duplicate-free by construction.** Three of our problems
collapse at once:
- **`cmm` anisotropy → gone.** You bound the *index* `n`, not vector length; the long vector is
  enumerated *implicitly* by the off-diagonal `b`, never searched directly. The elongated rhombus is
  just a particular small `(a, b, d)`.
- **Super-cell rejection** = reject non-primitive HNF (`gcd(a, b, d) > 1`); the primitive count is the
  Dedekind ψ function `A001615 = n·∏(1+1/p)`.
- **Seed-independence / determinism** = free; there are no seeds and no wall-clock.

**My reality-check (the nuance the synthesis glossed):** HNF enumerates sublattices of a *fixed
reference lattice* `L₀`. The toroidal-map papers (Datta–Maity, Kundu–Maity) apply it to
**semi-equivelar = single-vertex-type** maps, where `L₀` is the one Archimedean tiling's translation
lattice. Our k-uniform tilings are **mixed-type**, so there isn't a single Archimedean `L₀`. The honest
resolution: enumerate **per Bravais class** — for each candidate point group / Bravais type
(hexagonal, square, rectangular, rhombic, oblique) and each of the finitely many grid orientations,
fix a canonical grid-commensurate reference of that class and HNF-enumerate its **symmetry-preserving**
sublattices up to the area bound (these have their own generating functions, item §3E below). This
keeps HNF's anisotropy-immunity while covering mixed-type Λ. *This is a design refinement to prove out,
not a settled recipe — but it is strictly better-founded than fix-short-solve-long.*

Load-bearing refs: Kundu–Maity [arXiv:2111.15484](https://arxiv.org/abs/2111.15484) (HNF + point-group
`G₀`-matrix quotient, worked for toroidal maps — the `G₀` quotient *is* our symmetry-dedup step);
sublattice counts OEIS [A000203](https://oeis.org/A000203) (σ(n), total) and
[A001615](https://oeis.org/A001615) (primitive); Baake–Zeiner review
[arXiv:1709.07317](https://arxiv.org/abs/1709.07317).

---

## 1. Validate — oracles to diff our output against (ordered by signal strength)

Per-tiling structural diffs beat count-only checks.

| # | Resource | What it gives | Conf. |
|---|---|---|---|
| A | OEIS [A068599](https://oeis.org/A068599) / A068600 | The canonical count sequence 11,20,61,151,332,673 (… to k=13), with the `%C` note that **confirms our orbit-gate semantics** (distinct *orbits* may share a vertex *type*). Cite as the thesis target. | high |
| B | Wikipedia [List of k-uniform tilings](https://en.wikipedia.org/wiki/List_of_k-uniform_tilings) | The full **(orbits × vertex-types) histogram** to match cell-by-cell (k=3→22+39, k=4→33+85+33, …) and the Krötenheerdt diagonal (11,20,39,33,15,10) as a proven easier sub-target. **Directly confirms the cmm hypothesis: lists the per-tiling 2-uniform wallpaper groups; 7 of the 20 are cmm.** | high |
| C | **Soto-Sánchez datasets** [chequesoto.info/tilings.html](https://chequesoto.info/tilings.html) | ★ Per-tiling **machine-readable JSON** encoding each tiling as a `(2+n)×4` integer matrix = **two translation vectors + n seed vertices in lattice coordinates — structurally identical to our Λ + torus cell.** Build a comparator: per k, assert our set equals theirs up to symmetry. Turns acceptance from "got 673?" into "got *these* 673?". (hi-res thesis PDF is ~7-8 MB — `curl` it, WebFetch truncates.) | high |
| D | tes-catalog [github.com/zenorogue/tes-catalog](https://github.com/zenorogue/tes-catalog) | `.tes` per-tiling files for k=01..12 (clone recursively). Second open per-tiling corpus + C++ generators as a corner-completion reference. | high |
| E | Fulgur14 [k-uniform-solver](https://github.com/Fulgur14/k-uniform-solver) | An **orthogonal** solver (pure combinatorial edge-pairing, no lattice/torus) whose `count.txt` reproduces 11/20/61/151/332/673→k=13. Shares *no machinery* with us → agreement is real evidence, not a shared bug. (Caveat: user pre-specifies vertex types.) | high |
| F | Kharkongor–Bhowmik–Maity [arXiv:2101.04373](https://arxiv.org/pdf/2101.04373) | Treats the 20 + 61 tilings **explicitly as torus quotients** with per-tiling vertex-orbit counts (m≤9 for 2-uniform K20; m≤15 for all 3-uniform). Use to (validate) our gate and (optimize) cap torus complexity a priori. | high |
| G | RCSR layer nets [rcsr.net/layers](http://rcsr.net/layers) | All 20 two-uniform as 2-periodic nets with exact coords + certified plane group (independent wallpaper check, again confirms cmm). ⚠ **403 to the agent — fetch via browser / Systre.** | med |
| H | Chavey 1989 catalog; the 21-vs-15-vs-14 admissible-vertex-figure lists | Primary hand-verified source for the 61 (paywalled). The admissible-vertex lists are a unit test that our ℤ[ζ₂₄] angle arithmetic reproduces exactly those and no spurious ones. ⚠ **Corpus discrepancy: "21 species" vs "15 figures" vs "m≤14" count different things — pin down which gates which step before asserting in code.** | med |

Galebach [probabilitysports.com/tilings.html](https://probabilitysports.com/tilings.html) is the
*origin* of the counts but is **image-only (no coordinate dump) and undocumented with no completeness
proof** — which is itself the thesis motivation (an exact, provably-exhaustive recomputation would be
the first).

---

## 2. Optimize — faster, dedup'd enumeration and fill

- **★ HNF lattice enumeration** (the headline, §0). Three independent angles converged on it.
- **Filtered exact predicates (CGAL doctrine)** [doc.cgal.org](https://doc.cgal.org/latest/Manual/devman_robustness.html) — attach a float/interval approx to each ℤ[ζ₂₄] vertex; run the float test first, fall back to exact only when the sign is ambiguous. Cuts inner-loop cost with zero correctness loss. *(Conf: high)*
- **Explicit surd sign-tests** — Pirogov, ["Intersecting segments without tears"](https://pirogov.de/blog/intersecting-segments-without-tears/): generalizes our ad-hoc "u² vs 3v²" to all surds in ℚ(ζ₂₄) (√2,√3,√6), and validates *why* our design stays exact — we only ever place unit-step vertices at 15° multiples, so vertices stay *in the ring* ℤ[ζ₂₄] (we never compute a general intersection point, which would need division and leave the ring). *(high)*
- **Cheapest dedup keys** — exact integer-tuple equality for vertex coincidence (no canonicalization; same point by any route compares equal), plus tilezz's [lex-min cyclic rotation](https://github.com/apirogov/tilezz) of the exterior-angle sequence as a cheap exact vertex-figure key. *(high; tilezz uses N=12 — confirm ζ₂₄ coverage, which the GomJau-Hogg find settles)*
- **DLX exact-cover harness (prototyping only)** — SageMath [TilingSolver](https://doc.sagemath.org/html/en/reference/combinat/sage/combinat/tiling.html): reduce the per-period fill to exact cover via Dancing Links. ⚠ **Two documented gaps that are exactly our needs:** no torus wrap-around (we supply Λ-quotiented columns) and no symmetry dedup (its docs "divide by 8 by hand" — *unsound* with nontrivial stabilizers; never divide by |G|). Prototype only. *(med)*
- **Canonical seed chamber** [arXiv:2511.20915](https://arxiv.org/pdf/2511.20915) — pick a canonical sub-region under the point group *before* filling so symmetric duplicates are never generated. ⚠ abstract-only; verify the guarantee for regular-polygon symmetry. *(med/low)*

---

## 3. New ideas / theory — completeness & framework

- **★ Completeness backbone — Datta & Maity** [arXiv:1705.05236](https://arxiv.org/abs/1705.05236): proves **every semi-equivelar map on the torus is a lattice quotient of one of the 11 Archimedean tilings** — the closest theorem to our per-period completeness claim, plus per-type orbit-count pruning (≤6 globally, ≤3 for 10 of 11 types). ⚠ **Scope flag: single-type, so it bounds the per-Archimedean-type contribution, not the global mixed-type k count.** Use as completeness *template* + per-type pruning, not a global cap. *(high)*
- **★ HNF for toroidal covers — Kundu & Maity** [arXiv:2111.15484](https://arxiv.org/abs/2111.15484): item §0 applied to *our exact object* — HNF sublattice enumeration **then quotient by the point group as integer matrices** (= our symmetry dedup), with achievable orbit-counts per type. The concrete recipe to implement. *(high)*
- **Framework — Pellicer & Williams** [arXiv:0910.4207](https://arxiv.org/abs/0910.4207): formalizes "torus tiling = finite quotient + identification rules" and that splitting symmetry into (lattice) × (point-group on torus) loses nothing — to underpin our certificate write-up. *(med)*
- **Wallpaper/orbifold checklist — Lan, "Wallpaper Groups & the Magic Theorem"** [PDF](https://www.weixianlan.com/projects/wallpaper_groups.pdf): the 5+3+9=17 case split by rotation order ∈{1,2,3,4,6} + reflections — a ready finite checklist of admissible point groups / Bravais classes (prunes cmm and friends *up front*), plus the orbifold-cost (sum = 2) sanity check. Serves our shape-quantization. *(high)*
- **Symmetry-preserving sublattice generating functions — ITC §9.3.6 / Billiet-Bertaut** ([IUCr](https://journals.iucr.org/paper?S0108767392000898), reproduced open in Baake-Zeiner [1709.07317](https://arxiv.org/abs/1709.07317)): per-Bravais-type generating function for sublattices of each index that *preserve* the symmetry — gives the `cmm` branch its own enumerator instead of brute-forcing all oblique sublattices. **This is the rigorous backing for the per-Bravais-class HNF in §0.** *(med, paywall → use the review)*
- **Well-rounded vs elongated counts — Baake, Scharlau & Zeiner** [arXiv:1311.6306](https://arxiv.org/abs/1311.6306): "well-rounded" (compact) sublattices are very sparse vs σ(n) total; lets you *count* how many genuinely-elongated sublattices you must additionally consider per index — turns the open-ended cmm worry into a bounded one. *(med)*
- **★ Battle-tested symmetry detection — Gavrog/Systre** [github.com/odf/gavrog](https://github.com/odf/gavrog): computes a canonical "Systre key" (two nets equal iff keys match) + recovers the maximal wallpaper group for 2D periodic nets. **Consider adopting wholesale instead of reimplementing exact symmetry detection in ℤ[ζ₂₄]** — feed our torus-quotient adjacency as a 2D net → Systre key = dedup oracle; Systre's group output = independent primitivity + plane-group certificate. *(high)*
- **Delaney-Dress / orderly generation — Tegula, EPINET, Delgado-Friedrichs TCS** ([Tegula](https://arxiv.org/pdf/2007.10625), [TCS.pdf](http://gavrog.org/TCS.pdf)): the canonical isomorph-free enumeration framework for tile-k-transitive tilings — and **vertex-k-transitive (= our k-uniform) tilings are their DUALS**, a genuinely independent enumeration route. Reusable: lex-min BFS canonical form (seed-independent, dedup-free, no post-filtering) + quad-tree reference-point test (drop-in super-cell rejection). ⚠ **Do NOT use their counts as a validation oracle — they enumerate over *all* polygon degrees (irregular included), so their Euclidean counts are a strict superset (98,076 at complexity 24) and cannot confirm 11/20/61.** Reuse the bookkeeping, not the numbers. *(high on method, with the count caveat)*
- **ζ₂₄ is exactly right — GomJau-Hogg / ANTWERP** [MDPI](https://www.mdpi.com/2073-8994/13/12/2376): their shapes use θ in **π/12 increments = exactly our ℤ[ζ₂₄] angular grid** — independent confirmation that 24th roots are the right *and sufficient* resolution (settles the tilezz N=12-vs-24 question). *(high)*

---

## 4. Recommended sequencing (from the synthesis, with my edits)

1. **Implement the HNF enumerator + primitive filter** (§0) — per Bravais class with symmetry-preserving
   sublattices; kills `cmm` anisotropy *and* seed-dependence *and* non-determinism at once. Replaces
   `PeriodSolver.candidateLattices()`. Unit-test fixture: the 7 index-4 sublattices (σ(4)=7).
2. **Validate per-tiling, not just by total:** Soto-Sánchez JSON (§1C) + Wikipedia histogram (§1B) +
   Kharkongor orbit bounds (§1F); then cross-check totals against the orthogonal Fulgur14 solver (§1E).
3. **Consider Systre** (§3H) as the canonical-key / wallpaper oracle instead of reimplementing exact
   symmetry detection — at least as an independent check during validation.
4. **Completeness write-up** leans on Datta–Maity + Kundu–Maity + Pellicer–Williams (§3), being careful
   about the single-type vs mixed-type scope.

### Caveats to keep visible
- HNF needs a *reference lattice*; for mixed-type k-uniform that means **per-Bravais-class** references
  (§0 reality-check) — a refinement to prove, not yet settled.
- Datta-Maity's bounds are **per-type**, not a global k cap.
- Tegula/Delaney-Dress counts are a **superset** (irregular polygons) — method yes, numbers no.
- Galebach is image-only/undocumented; Soto's *paper* classifies rather than enumerates (its *datasets*
  are still the gold validation source); neither *proves* completeness — that is our contribution.
- Access failures / unverified: RCSR (403), Chavey & C&G-2021 (paywall), Soto hi-res thesis (>10 MB),
  arXiv:2511.20915 & Billiet-Bertaut (abstract/paywall only). Retrieve via browser / `curl` / library
  before relying on specifics.
