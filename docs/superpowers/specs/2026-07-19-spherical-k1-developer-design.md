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
- **Embedding method:** energy relaxation on S². Chosen over incremental geodesic
  development and Wythoff construction because it is the least code, geometry-agnostic,
  extends to k≥2 unchanged, and its failure-to-converge cleanly flags non-realizable maps
  and A6 pruner duplicates as diagnostics.
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
                ├─ reuse pruner.decode()  →  abstract map (vertices, edges, faces)   [geometry-agnostic]
                ├─ spherical Laplacian init  →  energy relaxation on S² (numpy)       [the new geometry]
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

1. **Reconstruct the abstract map** (reuse `pruner.decode()`, geometry-free).
   - Combinatorial vertices = the `rneig`-orbits (the star-walk `develop.py` uses, minus
     angle accumulation). Assign each orbit an integer id.
   - Edges = the `glue` pairs: dart `h` and `glue[h]` cross a shared edge, so their two
     vertices are edge-adjacent.
   - Faces = the polygon cycles from the Conway build (algorithm.txt Part 2), traced as
     cycles of the face permutation on darts. Emit each face as an ordered vertex-id ring.
   - Face sizes and per-vertex config fall out of this. Sanity: every face ring length
     equals its polygon size; Euler V−E+F must equal 2 (χ=2 sphere) before embedding.

2. **Initialize on the unit sphere.** Random points on S², then a few rounds of spherical
   Laplacian smoothing (each vertex → normalized mean of its graph neighbors). Enough for
   these small (≤ ~120-vertex) symmetric k=1 graphs.

3. **Relax.** Minimize `E = Σ_edges (‖vᵢ−vⱼ‖ − L)² + w · Σ_faces planarity`, where:
   - every vertex is constrained to the unit sphere (project gradient to the tangent plane,
     renormalize each step);
   - `L` = current mean edge length (scale is free; only edge *equality* is enforced);
   - planarity(face) = Σ over face vertices of squared distance to the face's best-fit plane.
   - Plain projected gradient descent; no scipy dependency. Fixed step or simple line search.
   - Converged when residual edge-length coefficient of variation AND max planarity error
     both fall below `tol` (default 1e-6).

4. **Emit or reject.**
   - Converged below `tol` → emit the Polyhedron record.
   - Stuck above `tol` after all restarts → flag the block *non-realizable*, emit a report
     line only. (A genuine uniform polyhedron drives E→0; an A6 artifact or an unrealizable
     regular-faced map cannot.)

**Local-minimum risk.** Projected gradient descent can stall in a shallow local minimum on
a *realizable* map and produce a false "non-realizable". Mitigation: N random restarts
(default 8) before declaring non-realizable; at k=1 the target set is the known closed list,
so any block that fails all restarts is logged loudly for manual inspection, never silently
dropped. This is the one place the artifact could lie, so the report makes it explicit.

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
