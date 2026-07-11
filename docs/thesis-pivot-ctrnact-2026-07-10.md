# Thesis pivot — context brief for Fable 5

You (Fable 5) are picking up a thesis in progress. This file is the full carry-forward context: what the thesis is, every method tried and why it failed, the realization that reframed the whole project, the new spine, and the concrete scope of work to execute next. Read it once end to end before doing anything. Two tracks (#1 and #2 below) are independent and can start in parallel.

Author is Alessandro (AL). The codebase agent is Claude Code (CC), owner of the `TilingAtlas/` repo. Theory/proof work has historically been handed to you as self-contained briefs; this is one of those, scaled up to the whole thesis direction.

---

## 1. The problem and the acceptance targets

Enumerate **all and only** the edge-to-edge k-uniform tilings of the plane for a chosen polygon set, with **provable completeness and correctness**. A tiling is *k-uniform* if its symmetry group has exactly k orbits of vertices. Every decisive test is in exact arithmetic (cyclotomic field ℚ(ζ_N); float only for rendering and broad-phase).

Acceptance counts for regular polygons (OEIS A068599):

| k | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|----|----|----|----|----|----|----|----|
| tilings | 11 | 20 | 61 | 151 | 332 | 673 | 1472 | 2850 | 5960 | 11866 | 24459 | 49794 | 103082 | 212631 | 445289 | 933637 |

k=14, 15, 16 are new records produced by the fast engine described below. The oracle is not just the count but the per-tiling data (which tilings), from Galebach / Soto-Sánchez JSON.

The thesis's claimed contribution is **provable exhaustiveness**. Galebach's counts (the origin of the sequence) have no completeness proof. So completeness beats speed: any cap, filter, or budget that could drop a tiling must be logged loudly, never silent.

### The octagon decision (settled, do not re-litigate)

Work in 12 directions, ℤ[ζ₁₂], edge directions on a 30° grid. This is **complete for all k ≥ 2** and complete for k=1 minus exactly one tiling: t1002, the unique 4.8.8 (square/octagon) tiling. Reason: any tiling containing an octagon is forced to be the single 4.8.8 tiling (the octagon appears in exactly one vertex configuration, 4.8.8, which propagates deterministically). So there are provably zero octagon-bearing tilings at k ≥ 2. k=1 gives 10 by construction; re-add t1002 by hand. Use the full 24 directions ℤ[ζ₂₄] (15° grid) only to re-derive t1002 itself. Interior angles: triangle 60°, square 90°, hexagon 120°, dodecagon 150° (all multiples of 30°, in ℤ[ζ₁₂]); octagon 135° (multiple of 15°, needs ℤ[ζ₂₄]).

---

## 2. The journey — methods tried, and why each stalled

AL spent roughly two months building original enumeration machinery. None of it scaled past k=3. That is not wasted work, but it counts in the thesis only as far as each failure is stated as a **theorem or a characterized complexity barrier**, not as "I ran it and it was slow." Discipline this hard when writing it up.

**Seed expansion.** Take a seed patch, grow it until you are sure it is large enough to contain the period lattice, then read off the lattice. Did not scale.

**Delaney-Dress symbols.** Explored heavily (there is substantial D-D material in the repo: realizability lemmas B1/B2, size-bound notes). The honest barrier is **not** "the reference dataset only reaches k=2." That is a data-availability statement, and Tegula/gavrog generate D-D symbols to high complexity with no dataset. The real barrier is the one already written in `docs/RESEARCH_NOTES.md`: D-D enumerates a **superset** over all polygon degrees (irregular included, 98,076 at complexity 24), so their Euclidean counts cannot confirm 11/20/61 and the filtering-to-regular step is the hard part. Present the real barrier, or a reviewer who knows the area unravels the chapter.

**The lattice / PeriodSolver method (AL's own, C++, parallelized).** Exact ℚ(ζ₂₄) arithmetic, candidate period-lattice enumeration, torus fill, symmetry dedup. Extensive optimization work and step-count proofs for the vectors. It produced k=3 and matched the oracle, but k=4 is already near-intractable and there is a **proven negative result**: HNF sublattice enumeration is **provably incomplete** for mixed √2/√3 cells (the 4.8.8 obstruction). This is the one genuinely strong negative result AL already holds. It is a theorem, and it is the template for how the other negative results must be leveled up or cut.

Note on wording: do not call AL's own k=3 output "proven complete." What is actually true is "12-direction complete for k ≥ 2, octagon handled analytically." The completeness *proof* the thesis is now building is for Čtrnáct's engine, not AL's lattice engine.

---

## 3. The realization

While chasing the lattice method to k=3-in-hours, a different engine was already reproducing the entire sequence to k=16 in a few hours: **Marek Čtrnáct's combinatorial solver** (GitHub handle Fulgur14; "čtrnáct" is Czech for *fourteen*, and the original solver was hardcoded to k=14). It lives in the repo at `tools/ctrnact-oracle/`, ported to a C++ pipeline. RESEARCH_NOTES already lists it as an orthogonal validation oracle (§1E) that "shares no machinery with us," which is exactly why its agreement with Galebach is real evidence.

### Why it is so fast (this is the load-bearing insight)

It never touches geometry during the search. It builds the tiling's **quotient object** (the combinatorial fundamental domain on a torus) directly, as a pure integer graph, and only converts survivors into coordinates at the very end. AL's lattice method does exact cyclotomic arithmetic, collision tests, and lattice enumeration at every node, and builds the whole period. That difference is thousands-fold per node, and it compounds. Both are exponential in k; the base and the per-node constant are what differ.

### How the algorithm works (mechanism, from `reference/eu_solver.orig.cpp` and `reference/algorithm.txt`)

- **Alphabet (`mainlist`).** A finite table of vertex configurations, each crossed with its site-symmetry variants (S = full symmetry, R = rotation, A = axial, F = fully asymmetric). The list is finite because the angle equation Σ(1 − 2/nᵢ) = 2 over nᵢ ∈ {3,4,6,12} has finitely many solutions. It is octagon-blind (no 4.8.8), matching the octagon decision above, which is why k=1 gives 10. Each entry carries: half-edges (`label`, with `*k` marking a mirror image), the rotation system (`lneig`/`rneig`), the reflection involution (`mirro`), the incident polygon sizes (`lvert`), and a symmetry-reduction count (`ferkval`/`ferk`).
- **Half-edges and gluing.** Each vertex has "half-edges" (stubs to edge midpoints). The one operation is gluing stub to stub; each gluing is one edge class of the tiling. Conway-style symbols `(a)`, `[a]`, `(a b)`, `[a b]` encode the four gluing types (self, to-mirror, to-other, to-other-mirror).
- **The two validity conditions (Part 2 of `algorithm.txt`).** (1) Every corner in a face-cycle has the same polygon size (all faces regular). (2) A *closed* face-cycle's length divides its polygon size; an *open* one's length must not exceed its size. Condition 2 is the "a face folds only by its own rotational symmetry" rule; for a regular n-gon that is "length divides n."
- **The DFS (`extend`).** Pick the most-constrained free stub (`mincycle`: the open face closest to overflowing). Try gluing it to each existing free stub of matching mirror-parity, and, if below the target vertex count, to a stub of each new vertex type (with a nondecreasing-type-order tie-break). After each glue, `checkpart` enforces conditions 1/2a/2b in O(cycle length) integer work; violations can never heal (glue is only added, never removed), so subtrees die instantly.
- **Closure and rigidity (`simplify`).** When no free stub remains and the vertex count equals the target k, run a Weisfeiler-Leman / DFA-minimization color refinement. Accept only if every half-edge is in its own class (the object is rigid, no hidden global symmetry). Non-rigid closures are the same tiling represented over a non-minimal domain; rejecting them drops nothing.
- **Pruner.** The solver reaches the same tiling by multiple paths, so `eu_pruner` groups by vertex multiset and dedups by exact isomorphism (the same canonical-form test).
- **Developer (`eu_develop`).** Once per distinct combinatorial solution: flood-fill placing half-edges at exact ℤ[ζ₁₂] positions, integer HNF for the wrap-around lattice, Lagrange-Gauss reduction, seeds mod Λ. Area-certified (Σ face areas = |det Λ|, exact).

### The catch that makes this a thesis, not a footnote

Čtrnáct **claims no proof**. His own words: reproducing the Wikipedia counts "gives me hope that the results for k > 6 are likewise correct." That is the exact epistemic status as Galebach. Having the catalogue to k=16 is not the same as having proven it complete. The proof is the open problem and the thesis deliverable.

There is also direct evidence the completeness question is real and checkable: an earlier Python port of the solver **silently dropped one tiling at k=8 and k=9** (2849/5959 instead of 2850/5960), caught only because a second implementation disagreed. That is exactly the "search drops a valid map" failure a completeness proof must rule out.

---

## 4. The new thesis spine

An exploration of methods for constructing k-uniform tilings — their computational pitfalls and scalability — culminating in:

- a **proven** exhaustive list of regular k-uniform tilings (currently to k=16, with room for a few more), by proving Čtrnáct's combinatorial method complete, which independently certifies (or would refute) Galebach; and
- an independent-method **cross-reference** list for star-polygon tilings against Myers, potentially upgraded to a completeness proof if the finiteness bound can be cracked.

The contribution is honestly framed as: the completeness proof (novel), the extension of a table-driven engine to new tile families (novel), and a disciplined account of why the geometric/lattice routes fail (one proven impossibility plus characterized barriers). Credit to Čtrnáct for the algorithm is explicit throughout.

Guard against the failure mode of a "museum of five attempts." Depth over breadth. One airtight result (the completeness proof) is the spine; everything else supports it or is labeled future work.

---

## 5. Scope of work

### Track #1 (PRIMARY) — Prove Čtrnáct's method complete for regular k-uniform tilings

Goal: a rigorous proof that the solver+pruner+develop pipeline outputs all and only the edge-to-edge k-uniform regular-polygon tilings (12-direction, octagon handled analytically), for each k up to the frontier. The structure is "generate a superset under necessary conditions, then dedup exactly," which is cleaner to prove than orderly generation because it avoids the canonical-augmentation argument. The proof decomposes into these obligations:

1. **Alphabet completeness.** The `mainlist` table is exactly the set of vertex configurations (multisets of {3,4,6,12} corner angles summing to 360°, plus their divisor-of-360° rotation-center variants) crossed with all their site-symmetry refinements. The angle part is a classical finite Diophantine enumeration; the site-symmetry enumeration (S/R/A/F variants) is the part to nail carefully.
2. **Local-rule soundness and necessity.** Conditions 1, 2a, 2b are each necessary for a valid regular-polygon tiling (so pruning on them drops nothing) and jointly sufficient for a closed configuration to be a valid combinatorial tiling. This is the angle/divisibility argument in `algorithm.txt` Part 2.
3. **Search exhaustiveness (no-drop).** The DFS reaches every valid combinatorial map at least once. It prunes only on necessary conditions and explores all gluings otherwise; the most-constrained-first order and nondecreasing-type tie-break are heuristics/canonical choices that must be shown not to skip any isomorphism class. This is the obligation the k=8/9 Python bug violated, so it is the highest-risk one.
4. **Dedup exactness (no over-merge).** The pruner's isomorphism test (WL/DFA canonical form) never merges two genuinely distinct tilings. Relate this to the proven canonical form N in `docs/canonical-form/` (Fable-derived; soundness N(M)~M and canonicity M~M' ⇒ N(M)=N(M') already proved for the ζ₁₂ model, octagon out of domain).
5. **Realizability.** Every closed rigid combinatorial map satisfying conditions 1/2 is geometrically realizable by unit regular polygons on a flat torus, and `develop` always succeeds. Argument shape: all vertices have angle sum 360° ⇒ zero discrete curvature ⇒ flat ⇒ the developing map descends to a periodic Euclidean tiling with a genuine translation lattice (discrete Gauss-Bonnet at Euler characteristic 0). The exact area certificate (Σ face areas = |det Λ|) is strong supporting evidence but is not the proof.
6. **The planar↔toroidal bridge.** k-uniform planar tiling ⇔ rigid toroidal quotient with k vertex-orbits. Needs: k-uniform ⇒ periodic (citable classical result), care with the point-group vs translation-group distinction (the site-symmetry variants are how the point group is tracked), and an a priori **bound on the period size per k** (the finiteness theorem; Datta-Maity arXiv:1705.05236 and Kundu-Maity arXiv:2111.15484 are the backbone, but their bounds are per-Archimedean-type, so the mixed-type global bound is the piece to establish).

Deliverable: the proof, with each lemma marked classical / owed / open, plus a clear statement of scope (12-direction, octagon analytic). Validation anchor: the pipeline already reproduces A068599 exactly to k=16.

### Track #2 (PRIMARY) — Extend the engine to produce star-polygon tilings, cross-referenced to Myers

Goal: run the same combinatorial engine on a star-polygon alphabet and reproduce Myers' enumerations (k=1 and k=2 star tilings; Myers enumerated but did not prove them, and posed proving/extending them as an open problem). This is a **produce-and-validate** track, not a proof track. Its oracle is Myers' lists, which makes it validatable (unlike the composite family below).

The engine is table-driven, so this is primarily an alphabet swap plus develop changes, not a rewrite:

1. **Build the star alphabet.** Precompute vertex configurations (multisets of corner angles summing to 360°) for the star set, with site-symmetry variants and edge-length labels. Corners are now (polygon, corner-index) pairs since star corners can differ.
2. **Check the field.** Likely good news: the star polygons in Euclidean star tilings are the 8- and 12-fold ones, whose point angles are multiples of 15° ({12/5} = 30°, {8/3} = 45°, {6/2} = 60°), so they should already live in ℤ[ζ₂₄], the field the repo already carries for the octagon. The 5- and 7-fold stars (which would need field extension) do not appear because they cannot tile periodically edge-to-edge. **Verify which stars Myers actually used before committing** — if any fall outside ℤ[ζ₂₄], the field must extend and cost rises.
3. **Generalize `checkpart`.** Face-cycle validity becomes "spells out a real polygon of the set" (corner angles and edge lengths in the right cyclic order), and the divisibility rule uses each polygon's rotational-symmetry order rather than its edge count.
4. **The main risk — non-convex realizability.** Star tiles are non-convex, with reflex vertices. The "flat ⇒ realizes" argument that makes `develop` never fail may not transfer cleanly; reflex angles allow global tile overlap that local angle-closure does not catch. The repo's own note flags "float `Polygon.intersects` is unsound for non-convex; exact segment intersection required." This bites the *produce/develop* step, not the proof.
5. **The concrete success test.** Does the extended engine reproduce Myers' k=1 and k=2 star counts and per-tiling lists exactly? If yes, realizability held and the cross-reference is delivered. If counts miss, that is where it broke, and #2 stays a cross-reference attempt rather than a certification.

### #3 (OPTIONAL, demo only) — Composite unit-30° polygons

A family AL is interested in: convex simple polygons with unit edges and all interior angles multiples of 30°, built by a turtle-graphics BFS/DFS (lay an edge, turn by a multiple of 30°, step, until a simple closed convex polygon results), edge count capped at a tunable parameter (~12). These stay inside ℤ[ζ₁₂], no field extension. Some are compositions of triangles and squares (a hexagon is six triangles; a **dodecagon** — not decagon; the decagon's 144° angle is off the 30° grid — is one hexagon + six squares + six triangles, areas 2.598 + 6 + 2.598 = 11.196, which checks).

Demote this to an illustrative demo, not a completeness target, for three reasons: there is **no external oracle** to validate against (unlike Galebach for regular, Myers for stars); the tile set is an arbitrary, exploding parameter (the BFS already yields an "incredibly long list"); and there is a **decomposition ambiguity** (the same region can partition into composite tiles multiple ways, so "one tiling or several?" is ill-defined until the equivalence relation is fixed). Show two or three hand-picked composite tiles producing a tiling, as evidence the engine is palette-agnostic. Do not build a completeness claim on it.

### #4 (OPTIONAL) — Prove star-tiling completeness

The stretch goal. This is Myers' open problem verbatim; the difficulty is the finiteness theorem (period bound per k), which is not inherited from the regular case. Pursue only if #1's realizability and finiteness lemmas generalize to the star class. If cracked, it upgrades #2 from certification to proof and is a genuine advance on Myers.

---

## 6. Key files and references

- Engine: `tools/ctrnact-oracle/` — `eu_solver.cpp`, `eu_pruner.cpp`, `eu_develop.cpp`, `eu_classify.cpp`; originals in `reference/` (`eu_solver.orig.cpp`, `algorithm.txt`, `README-ctrnact.md`, `count.txt`, the Python `euclidean_solver_mega.py` / `euclidean_pruner.py`).
- Engineering history: `docs/DEVELOPMENT_NOTES.md` §44–48 (trace-gating, streaming fuse, C++ ports, k pushed to 16, the weight ceiling).
- Canonical form N (for obligation #4): `docs/canonical-form/` (proofs + Python reference + adversarial suite); TS port `lib/classes/algorithm/canonicalFormN.ts`; dedup `dedupeByNKey` in `TilingCongruence.ts`.
- Literature and oracles: `docs/RESEARCH_NOTES.md` (Datta-Maity, Kundu-Maity, Tegula/gavrog, Fulgur14, Soto-Sánchez, Wikipedia histogram). Myers papers are in `../resources/papers/` (that folder is TA-owned, read-only for CC; readable for reference).
- The octagon decision and settled facts: repo `CLAUDE.md`.

## 7. Where to start

#1 and #2 are independent and have different oracles (Galebach vs Myers). Recommended first moves:

- #1: draft the six-obligation proof skeleton, mark each lemma classical / owed / open, and start with obligation #3 (no-drop search exhaustiveness) since it is the highest-risk and the one the historical k=8/9 bug violated. Lean on Datta-Maity / Kundu-Maity for obligation #6.
- #2: enumerate exactly which star polygons appear in Myers' k=1/k=2 tilings, confirm they sit in ℤ[ζ₂₄], build the star alphabet, and run the engine to reproduce Myers' counts as the pass/fail test. Settle the non-convex realizability question early.
