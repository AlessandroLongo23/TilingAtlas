# Spherical k=1 developer — design

Date: 2026-07-19
Status: approved design, pre-implementation
Author: CC (with AL)

## Goal

Prove the Čtrnáct engine works end to end on the sphere: take the k=1 output of the
spherical (positive-defect) palette search and *develop* it into actual polyhedra, then
cross-check that those polyhedra are exactly the known uniform solids the atlas already
draws by hand. This is a **validation artifact**, not an atlas feature — the live atlas UI
and the hand-authored solids are untouched. The developed geometry is emitted render-ready
so a future "wire into the atlas" step is trivial, but that step is out of scope here.

The thesis claim this backs: *the same engine that reproduces A068599 in the Euclidean
plane reproduces the classical uniform polyhedra on the sphere.*

## Decisions (locked)

- **Finish line:** validation artifact only. No atlas UI change; no swap-in of developed solids.
- **Match test:** metric + combinatorial invariants (vertex config, Euler V−E+F=2,
  face-size multiset, all-edges-equal and all-faces-regular within a float tolerance).
  Not exact coordinates — frame/scale/handedness differences are expected and ignored.
- **Embedding method:** geodesic development on S². (Superseded the initial energy-relaxation
  pick during planning — see "Method correction" below. Relaxation cannot stand alone: it
  needs the *unfolded* graph, but the pruned block is the symmetry-quotient, so an
  unfolding/development pass is unavoidable. For k=1 that pass closes analytically via a
  single edge-length solve, making relaxation redundant.) The realizability/A6 signal is
  preserved — it comes from *closure failure* rather than relaxation stalling.

### Method correction (during planning)

The k=1 pruned block encodes the polyhedron as a symmetry-quotient (a cube is `(4,4,4)`
with a single vertex type, not 8 vertices). Energy relaxation needs the *actual* graph, so
an unfolding pass is required regardless. For k=1 every vertex shares one config, so a single
1-D solve for the edge length ρ (the spherical face angles around a vertex must sum to 2π)
fixes the metric, and the flood-fill then closes by discrete Gauss–Bonnet. That development
IS the answer; relaxation would only re-derive residual ≈ 0. So the developer mirrors
`develop.py`'s dart-instance flood-fill with SO(3) rotations (by ρ) in place of ℤ[ζ₁₂]
translations, and reports non-realizability when the flood-fill fails to close consistently
or the developed faces are not regular.
- **Language split:** combinatorial reconstruction stays in Python (reuse the proven
  `pruner.decode()`, do not re-port). The new geometry (relaxation + emit) is Python
  (numpy), beside `develop.py`. The cross-check against the authored solids is a TS Vitest
  in the atlas that consumes the emitted JSON.

## Context this builds on

- `eu_solver.spherical` / `eu_pruner.spherical` already exist and run. At k=1 they emit 28
  distinct combinatorial solutions (verified). The spherical palette is D=120,
  closure=positive-defect, tiles {3,4,5,6,8,10}, maxValence 6.
- `develop.py` already separates the geometry-agnostic combinatorial reconstruction (it
  imports `pruner.decode()` to get the folded half-edge arrays `rneig,lneig,mirro,lvert,glue,label`)
  from the Euclidean-specific coordinate placement (the `star()` angle-walk in 30° units,
  `ZK[d]` cyclotomic steps, translation-lattice extraction). The spherical developer reuses
  the former verbatim and replaces the latter.
- The atlas render layer consumes a `Polyhedron = {vertices: Vec3[], faces: number[][], ...}`
  (`lib/render/platonicSolids.ts`); it derives face normals and edge arcs itself
  (`lib/render/sphericalGeometry.ts`). The 5 Platonic solids are hard-coded canonical
  coordinates; the 13 Archimedean are constructed from them; both are invariant-tested. The
  atlas has NO prisms or antiprisms.
- The pruner's A6 dedup soundness certificate fails on the sphere: under maximal symmetry
  `(3,3,3)` ≅ `(3,3,3,3)` ≅ `(3,3,3,3,3)` fold to the same colored structure. So the count of
  28 is uncertified. The developer doubles as the audit for this: geometric duplicates and
  non-realizable maps are surfaced by the relaxation.

## Architecture and data flow

```
eu_solver.spherical → eu_pruner.spherical → out/pruned/eupruned_01_*.txt        (already works)
                                                        │
              develop_spherical.py  (NEW, beside develop.py)
                ├─ reuse pruner.decode()  →  quotient half-edge arrays               [geometry-agnostic]
                ├─ solve edge length ρ  →  SO(3) geodesic flood-fill (develop.py analog)  [the new geometry]
                ├─ emit spherical-cells-k1.json  (render-ready records)
                └─ emit spherical-develop-report.txt  (realizability + A6 audit)
                                                        │
              tests/spherical-develop.test.ts  (NEW, atlas Vitest)
                └─ load JSON, match invariants vs PLATONIC_SOLIDS / ARCHIMEDEAN_SOLIDS
                   (+ closed-form prism/antiprism invariants for the slice the atlas lacks)
```

Two output artifacts:

- `spherical-cells-k1.json`: one record per *realized* block,
  `{ id, vertexConfig, vertices: Vec3[], faces: number[][], realized: true, residual: {edgeCV, planarity} }`.
  Light record (not the full render `Polyhedron` interface); adaptable to it trivially later.
- `spherical-develop-report.txt`: blocks in, realized count, non-realizable list (with
  residuals), and A6 duplicate groups (blocks whose realized invariants coincide).

## The developer algorithm (`develop_spherical.py`)

Per pruned block:

1. **Decode the quotient** (reuse `pruner.decode()`, geometry-free). Gives the folded
   half-edge arrays `rneig, lneig, mirro, lvert, glue, label` and the vertex config. This is
   the symmetry-QUOTIENT (one vertex type for the whole solid), not the geometric graph — the
   geometric vertices/edges/faces are produced by the development in step 3, exactly as
   `develop.py` unfolds the quotient into the actual (Euclidean) tiling. The face permutation
   on darts is `F(h) = glue[rneig[h]]` (the Conway polygon-build of algorithm.txt Part 2);
   its orbits become faces once developed.
   - Face sizes and per-vertex config fall out of this. Sanity: every face ring length
     equals its polygon size; Euler V−E+F must equal 2 (χ=2 sphere) before embedding.

2. **Solve the edge length ρ.** All k=1 vertices share one config `(p1,...,pd)`. The interior
   angle of a regular spherical `p`-gon with edge arc-length ρ is a monotone function
   `angle_p(rho)` (computed numerically: build the regular spherical p-gon of edge ρ from its
   circumradius via `sin(rho/2) = sin(r)*sin(pi/p)`, measure the vertex angle from adjacent
   edge tangents). Solve `sum_i angle_pi(rho) = 2*pi` for ρ by bisection on (0, pi); the sum
   is monotone decreasing in ρ, so bisection is unconditional. No root ⇒ the config has no
   spherical vertex figure (reject).

3. **Develop by SO(3) flood-fill** (mirror `develop.py`'s BFS/`star`, swap the geometry). State
   is (dart `h`, frame `R` in SO(3)); the geometric vertex position is `R * z_hat`. `star(h,R)`
   walks `rneig` around the vertex, rotating the frame about the local vertical by `angle_p(rho)`
   per corner, enumerating the darts sharing that vertex position. Crossing a glued edge
   (`h -> glue[h]`) advances the frame by the fixed edge rotation (geodesic step ρ about the
   shared-edge axis). BFS from `(0, I)`; dedup geometric vertices by position within `tol`
   (default 1e-6). Edges = `glue` pairs; faces = orbits of `F(h)=glue[rneig[h]]`, each emitted
   as an ordered ring of geometric-vertex ids.

4. **Verify closure or reject.** Realized iff: every revisited dart lands on its existing
   position within `tol`; V-E+F = 2; every developed face is a regular polygon (edges equal,
   coplanar) within `tol`. Realized -> emit the Polyhedron record. Any failure -> flag the
   block *non-realizable*, emit a report line only. (A genuine uniform polyhedron closes
   exactly; an A6 artifact or an unrealizable map yields an inconsistent revisit or a
   non-regular face.)

**Guard.** The BFS is bounded by a hard pop cap (default 200k, as in `develop.py`); hitting it
means non-closure and is reported, never silently truncated. At k=1 the target set is the known
closed list, so any block that fails to close is logged loudly for manual inspection.

## Validation (`tests/spherical-develop.test.ts`)

Load `spherical-cells-k1.json`. For each realized record compute invariants: sorted vertex
config, V, E, F, face-size multiset, edge-length CV (assert < tol), face regularity (each
face's edges and angles equal within tol).

Match each against a target index:

- Platonic + Archimedean: build the invariant index from the authored `PLATONIC_SOLIDS` and
  `ARCHIMEDEAN_SOLIDS` records (the actual atlas ground truth). This is the thesis-relevant
  cross-check: the search reproduces exactly what the atlas draws.
- Prisms / antiprisms: the atlas has none, so check closed-form invariants instead —
  prism n: V=2n, E=3n, F=n+2 (two n-gons + n squares), config 4.4.n; antiprism n: V=2n,
  E=4n, F=2n+2 (two n-gons + 2n triangles), config 3.3.3.n. Only the n ∈ {3,4,5,6,8,10}
  slice the fixed palette can emit.

Assertions: every realized record matches exactly one known target; the count of realized
records equals the expected number; the non-realizable / duplicate blocks match the expected
A6 finding (documented, not a silent pass). Unmatched or unexpected realized records fail
the test.

## Files

- `tools/ctrnact-oracle/develop_spherical.py` — NEW. The developer + report.
- `tools/ctrnact-oracle/run-oracle.sh` — extend Phase 3: for `PALETTE=spherical`, call
  `develop_spherical.py` instead of the current skip.
- `tools/ctrnact-oracle/run-k1-spherical/` (or the existing run dir) — holds
  `spherical-cells-k1.json` + `spherical-develop-report.txt`.
- `tests/spherical-develop.test.ts` — NEW. The invariant cross-check.

## Success criteria

- Every Platonic, Archimedean, and palette-emittable prism/antiprism block the k=1 spherical
  search produces relaxes to a regular-faced polyhedron and matches its known invariants.
- Blocks that do not realize (A6 artifacts, unrealizable maps) are surfaced in the report,
  with the tetra/octa/icosa A6 collision called out as the expected known finding.
- The whole run is reproducible from `PALETTE=spherical ./run-oracle.sh 1` plus `pnpm vitest
  run tests/spherical-develop.test.ts`, and the Vitest passes.

## Out of scope (YAGNI)

- Any atlas UI change; swapping developed solids in for the hand-authored ones.
- k≥2 spherical (the relaxation is written to extend there, but it is neither run nor
  validated here).
- The infinite prism/antiprism families (only the fixed-palette n-slice is produced).
- Exact/algebraic coordinates; a certified count. Numerical + invariant validation only.
- Fixing the pruner's A6 dedup. The developer *audits* it; it does not repair it.
