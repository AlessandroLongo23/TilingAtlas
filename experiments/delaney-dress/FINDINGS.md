# Delaney–Dress for k-uniform regular tilings — exploration findings (CC, 2026-06-08)

A self-contained study of whether the Delaney–Dress (D-symbol) formalism can enumerate k-uniform
edge-to-edge tilings of the plane by regular polygons, with the project's completeness discipline.
Reproducible code + dumps live beside this file; the verdict below is grounded in run-verified numbers,
not assertion. All sources are primary (Delgado-Friedrichs TCS-I, Tegula, Goetschalckx et al., Lenngren).

---

## TL;DR (the verdict)

1. **The formalism is exactly as the primer states** — verified against Delgado-Friedrichs's TCS-I
   (axioms DS0–DS4, curvature `K = Σ(1/m01+1/m12−1/2)`, Algorithm-8 canonical form). One refinement:
   the primer's filter "keep Euclidean (K=0)" is **insufficient for k≥2**; the correct filter is
   **per-component flatness** (every {1,2}-component's curvature sub-sum = 0 ⇔ that vertex orbit's
   regular-polygon angles sum to 360°). Global K=0 admits "mixed-sign ghosts" (proven: smallest is a
   size-2 k=2 symbol with a 270° orbit + a 540° orbit cancelling to K=0).

2. **The front-end reproduces A068599 exactly at k=1, combinatorially, with NO metric realizability
   check.** Enumerating minimal D-symbols of size ≤12 with regular labels + per-component-flat yields
   **exactly 11** = A068599(1). The naïve candidate set is 93 (sub-symmetry/redundant encodings), but it
   **collapses to 11 by the minimal-image algorithm — a cheap combinatorial partition refinement, not the
   metric closure the literature/experiment assumed.** k=2 (partial, sizes ≤12 of the ≤24 range) gives 17
   genuine-k=2 minimal symbols, all ≤ 20, no over-count.

3. **The realizability gate B2 does NOT bite at low k — but it is genuinely open at higher k.** The 4
   in-family angle-360 ghosts (3.4.4.6, 3.3.6.6, 3.3.4.12, 3.4.3.12) are killed by the D-symbol *axioms*
   (an odd-cycle edge-colouring obstruction the axioms encode), not by metric closure. So at k=1–2 the
   combinatorial filters do all the work. Theory (the 3.4².6→forces-3.4.3.6 strip obstruction) predicts
   flat-minimal-but-unrealizable symbols WILL appear at higher k, requiring the same exact metric-closure
   check the lattice method already performs. The scout could not reach that range to settle it.

4. **The real wall is generation cost, and it is unmeasured.** Brute-force symbol generation walls at
   size ≈12. Tractability past k=1 requires *constrained orderly generation* (push regular-labels +
   per-component angle equation into generation so the hyperbolic 99.9% is never built) — the actual
   prototype, not built here. Tegula hit ~2.4 billion symbols at complexity 24; whether the regular-family
   constraints prune size-≤48 (k=4) to tractable is the decisive open engineering question.

5. **Novelty is real but narrow.** Delgado-Friedrichs himself (2009, to Lenngren): D-symbols "have yet to
   be applied to k-uniform tilings by regular polygons." Still true. But Tegula already does complete
   D-symbol enumeration (by tile-orbits/complexity, **no regular gate**), and Galebach/Čtrnáct already have
   the counts (unproven search). Honest framing: an **independent, complexity-bounded cross-method
   completeness witness**, not the first enumeration. A Tegula-aware referee will press exactly here.

**Recommendation:** build the low-k DD prototype as the independent verifier (it's essentially prototyped
below and reproduces 11 exactly). Frame DD as the combinatorial-front-end method whose *front-end*
completeness is provable and clean (B1 + orderly generation + minimal-image) and whose *realizability
bridge* (B2) is the honest frontier. **Do not bet certified k=4–6 on DD** — that needs two unbuilt,
unmeasured pieces (constrained orderly generation + B2 metric closure at scale). Certified k≤3 stands on
the torus method regardless.

---

## 1. What a D-symbol is (verified formalism)

A 2-D Delaney–Dress symbol is `(D, σ0,σ1,σ2, m01,m12)` with `m02≡2`. Chambers `D` are barycentric flags
(vertex, edge, tile). Axioms (Delgado-Friedrichs TCS-I Def 2, verbatim-checked):
- **DS0** `⟨σ0,σ1,σ2⟩` acts transitively on `D` (connected).
- **DS1** each `σi` an involution; **fixed points allowed** (`σi(c)=c` = a mirror axis on type-`i` edges).
- **DS2** `σ0,σ2` commute (= `m02=2`: every edge borders exactly two tiles).
- **DS3** `m01` constant on `⟨σ0,σ1⟩`-orbits, `m12` on `⟨σ1,σ2⟩`-orbits.
- **DS4** `c·(σiσj)^{mij(c)}=c`, i.e. `mij` is a positive-integer multiple of the cycle length `rij`;
  `vij = mij/rij` (rotation order) is a positive integer.

Read-off (Tegula): `{0,1}`-components = **tile** orbits, `{1,2}` = **vertex** orbits (`= k`),
`{0,2}` = **edge** orbits. Curvature `K = Σ_chambers (1/m01+1/m12−1/2)`; `K<0/=0/>0` ⇒ hyperbolic /
Euclidean / spherical (Theorem 5, an *iff* for the topological/orbifold question — full proof in Balke 1990,
not self-contained in TCS-I). **k-uniform ⇔ exactly k {1,2}-components.** Chirality auto-merges (a reflection
is an allowed equivariant homeomorphism, so a chiral tiling and its mirror share one symbol — matches
A068599's mirror-merge; the unique chiral k=1 tiling 3.3.3.3.6 / p6 / size 10 is counted once).

`dsymbol.py` implements and **validates all of this against hand-derived ground truth** (3 regular tilings,
4.8.8 size-3, a hyperbolic hexagon-square K=−1/12), with Algorithm-8 canonical form cross-checked against
brute-force lex-min over all relabelings.

## 2. How DD generates k-uniform regular tilings (the pipeline)

```
                          B1: size δ ≤ 12k  (PROVEN; k ≤ δ ≤ 12k)  -> FINITE search
 orderly generation  ->   enumerate D-symbols up to size 12k
   + cheap filters:       regular labels (m01∈{3,4,6,8,12}, m12∈{3,4,5,6})
                          exactly k {1,2}-components
                          PER-COMPONENT FLAT  (each vertex orbit angle-sum = 360°)   <- correct filter
 minimal image       ->   collapse sub-symmetry/redundant encodings (combinatorial, cheap)
                          keep those whose minimal form genuinely has k vertex orbits
 B2 (realizability)  ->   metric closure: does it develop to a unit-edge regular tiling?  <- the open gate
                          (trivial at k=1; partial-clean at k=2; predicted non-trivial at higher k)
```

The decisive, non-obvious step the literature and even the experiment under-stated: **minimal-image**, not
metric development, is what reduces the inflated candidate set to the geometric-tiling count. It is the
unique maximal-symmetry representative (Delgado-Friedrichs), computed by coarsest label-respecting
congruence (DFA-minimization-style partition refinement) — O(n²)-ish, purely on the symbol.

## 3. Run-verified numbers

| quantity | value | how verified |
|---|---|---|
| angle-360 vertex multisets over {3,4,6,8,12}, deg 3–6 | 11 | `my_vertex_check.py` |
| same over all polygons 3–42 | 17 (6 use forbidden polygons: 3.7.42,3.8.24,3.9.18,3.10.15,4.5.20,5.5.10) | `my_consistency_check.py` (matches literature) |
| distinct vertex species (necklaces) over the family | 15 = 11 realizable + 4 ghosts | `my_vertex_check.py` |
| 4 in-family ghosts caught by | the **axioms** (odd-cycle edge-colouring), not metric B2 | `my_consistency_check.py`, `investigate_ghosts.py` |
| **k=1 candidate symbols** (axioms + regular labels + k=1 + per-component-flat, deduped, size ≤12 COMPLETE) | **93** | `strategy_a.py`; independently confirmed byte-identical (SHA256 `2abbc5aa…`) by a second agent |
| **k=1 minimal symbols (genuine k=1)** | **11 = A068599(1)** | `minimal_image_test.py`, `k2_minimal_fixed.py` |
| mixed-sign ghosts at k=1 (global K=0 but not per-component-flat) | 0 (impossible for single component) | `strategy_a.py` |
| smallest mixed-sign ghost | size-2 k=2: orbits 270° + 540° → K=0 | `mixed_sign.py` |
| k=2 candidate symbols (size ≤12 = HALF the ≤24 range) | 144 | `k2_minimal_fixed.py` |
| **k=2 minimal symbols (genuine k=2, PARTIAL ≤12)** | **17 ≤ 20** (no over-count; 3 more expected at size 13–24) | `k2_minimal_fixed.py` |
| candidate-count vs torus lattice-count, k=1 | DD 93 < torus 183 | scout `scout_k2.py` + STATUS |

The 11 minimal symbols ARE the 11 uniform tilings (square, triangular, hexagonal, 3.6.3.6, 4.8.8, 3.12.12,
3.4.6.4, snub-square, elongated-triangular, 4.6.12, snub-hex) — matched by `(m01,m12)` signature and size.

## 4. The corrected B2 story (the key insight, and where the experiment erred)

The research (R3/R4) and the experiment concluded "B2 is the closure problem re-skinned" because the 93
candidates collapse to 11 only after recognising same-tiling duplicates — which they attributed to the
**global metric-closure / periodicity computation** the lattice method performs.

**This attribution is wrong at k=1.** The 82 extras are sub-symmetry / alternative-gluing encodings of the
same 11 tilings, and collapsing them is exactly the **minimal-image algorithm** — combinatorial, cheap, and
purely on the symbol. I implemented it and verified 93 → 11 (and the genuine non-realizable angle-360 ghosts
never enter the 93 — the axioms kill them). So at k=1 the entire DD pipeline is combinatorial and exact;
**B2 does no work.**

What remains genuinely open: at higher k, are there per-component-flat **minimal** symbols that are
nonetheless not realizable by unit-edge regular polygons? Theory says yes (global strip/boundary
obstructions à la 3.4².6→3.4.3.6 are not local). The partial k=2 sweep found 17 ≤ 20 with no over-count
(encouraging, not conclusive — coverage incomplete and realizability of the 17 not independently certified).
**If/when such ghosts appear, B2 becomes the exact metric-closure check in ℚ(ζ_N) — the same hard step the
torus method already implements.** DD does not delete the geometry; it pre-filters and defers it.

## 5. Honest weaknesses / open questions

- **Generation cost unmeasured past size 12.** The whole tractability bet rests on constrained orderly
  generation (unbuilt). B1's 12k bound is loose; working sizes are smaller (k=1 ≤10, k=2 ≤~16), but
  brute-force walls at 12. This is the single biggest unknown for "DD reaches k=4–6."
- **B2 at higher k is the live theoretical gap** (the project's Lemma B2 is unproven for a reason).
- **Orderly-generation pruning is a "completeness knob."** A homemade partial-canonicity prune can silently
  drop classes; soundness is tied to the exact Read/Faradžev order. Use brute-generate + canonical-dedup,
  or reproduce the published order — do not invent one (CLAUDE.md's loud-truncation rule applies).
- **Counting requires two easily-missed steps**: minimal-image AND filtering minimal forms to *genuine* k
  (a j-uniform tiling at sub-symmetry appears as a k>j candidate). The first version of this analysis — and
  the experiment — both initially mishandled this.
- **Theorem 5's full proof is in Balke 1990** (German, possibly hard to obtain); cite it, don't reprove
  casually.

## 6. Recommendation (build-vs-pivot)

- **Build the low-k DD prototype** (it is ~prototyped here; reproduces 11 exactly, 17/20 partial at k=2).
  Value: an independent, complexity-bounded completeness witness for the certified k≤3 — genuinely
  publishable as cross-method confirmation, and the cleanest realisation of the thesis's progression arc.
- **Frame honestly**: DD's *front-end* completeness is provable and clean (B1 + orderly + minimal-image);
  its *realizability bridge* (B2) is the open frontier and is the lattice method's closure problem deferred.
- **Do NOT stake certified k=4–6 on DD.** It needs constrained orderly generation + B2 metric closure at
  scale — both unbuilt and unmeasured. Certified k≤3 stands on the torus method either way.
- The progression-arc sentence ("more combinatorial structure ⇒ better scaling + more generality, at the
  price of a harder realizability bridge") is **exactly right and now empirically grounded**: DD has the
  most general, cheapest front-end and the hardest (deferred-geometry) back-end.

## 7. Artifacts (this directory)

- `dsymbol.py` — validated foundation: axioms, components, exact curvature (global + per-component),
  Algorithm-8 canonical form. **Reusable for C5.**
- `ground_truth.py` — hand-derived verified symbols (3 regular, 4.8.8, hyperbolic contrast).
- `strategy_a.py` — complete k=1 enumeration (BFS-canonical-layout generate + canonical-dedup) → 93.
- `minimal_image_test.py` — **the minimal-image algorithm** (the missing piece) + the 93→11 collapse.
- `k2_minimal_fixed.py` — k=1 (=11) and k=2 (partial, =17) minimal-symbol counts filtered by genuine k.
- `my_vertex_check.py`, `my_consistency_check.py` — the vertex-census + odd-cycle ghost anchors.
- `mixed_sign.py`, `investigate_ghosts.py` — mixed-sign ghost + ghost-elimination probes.
- `develop5.py` — exact unit-edge metric development in ℚ(ζ_48) (a *semi*-decision; 4.8.8 → 55-tile patch).
- `E2_RESULTS.txt`, `E3_RESULTS.txt`, `ANCHORS_verified.md` — consolidated dumps.

> Exploratory; NOT wired into the build. `dsymbol.py` + `minimal_image_test.py` are the load-bearing,
> reusable pieces if the DD prototype (C5) is pursued.
