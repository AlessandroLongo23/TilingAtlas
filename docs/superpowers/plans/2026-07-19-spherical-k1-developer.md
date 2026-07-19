# Spherical k=1 developer — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Develop the k=1 spherical (positive-defect) search output into polyhedra on S² and cross-check that they are exactly the known uniform solids.

**Architecture:** `develop_spherical.py` (beside `develop.py`) reuses `pruner.decode()` for the quotient half-edge arrays, solves the edge length ρ from the vertex-angle-sum equation, geodesic-flood-fills on S² (SO(3) frames), and emits render-ready Polyhedron JSON + a realizability report. A TS Vitest cross-checks invariants against the atlas's hand-authored solids.

**Tech Stack:** Python 3 + numpy (oracle), reusing `pruner.py`; TypeScript + Vitest (atlas).

---

## Expected result (the target the whole thing validates against)

The k=1 spherical search emits **28** distinct blocks; every one is a genuine uniform
polyhedron. The developer must realize all 28, zero non-realizable, zero geometric duplicates.

| config (as decoded) | solid | V | E | F |
|---|---|---|---|---|
| 3.3.3 | tetrahedron | 4 | 6 | 4 |
| 4.4.4 | cube | 8 | 12 | 6 |
| 3.3.3.3 | octahedron | 6 | 12 | 8 |
| 5.5.5 | dodecahedron | 20 | 30 | 12 |
| 3.3.3.3.3 | icosahedron | 12 | 30 | 20 |
| 6.6.3 | truncated tetrahedron | 12 | 18 | 8 |
| 4.3.4.3 | cuboctahedron | 12 | 24 | 14 |
| 8.8.3 | truncated cube | 24 | 36 | 14 |
| 6.6.4 | truncated octahedron | 24 | 36 | 14 |
| 4.4.4.3 | rhombicuboctahedron | 24 | 48 | 26 |
| 8.6.4 | truncated cuboctahedron | 48 | 72 | 26 |
| 5.3.5.3 | icosidodecahedron | 30 | 60 | 32 |
| 10.10.3 | truncated dodecahedron | 60 | 90 | 32 |
| 6.6.5 | truncated icosahedron | 60 | 90 | 32 |
| 5.4.3.4 | rhombicosidodecahedron | 60 | 120 | 62 |
| 10.6.4 | truncated icosidodecahedron | 120 | 180 | 62 |
| 4.3.3.3.3 | snub cube | 24 | 60 | 38 |
| 5.3.3.3.3 | snub dodecahedron | 60 | 150 | 92 |
| 4.4.3 | triangular prism | 6 | 9 | 5 |
| 5.4.4 | pentagonal prism | 10 | 15 | 7 |
| 6.4.4 | hexagonal prism | 12 | 18 | 8 |
| 8.4.4 | octagonal prism | 16 | 24 | 10 |
| 10.4.4 | decagonal prism | 20 | 30 | 12 |
| 4.3.3.3 | square antiprism | 8 | 16 | 10 |
| 5.3.3.3 | pentagonal antiprism | 10 | 20 | 12 |
| 6.3.3.3 | hexagonal antiprism | 12 | 24 | 14 |
| 8.3.3.3 | octagonal antiprism | 16 | 32 | 18 |
| 10.3.3.3 | decagonal antiprism | 20 | 40 | 22 |

Note: all 28 realize ⇒ the pruner's uncertified count of 28 is confirmed correct here despite
the A6 warning (the maximally-symmetric alphabet-fold collisions did not conflate distinct
solids). That confirmation is a reportable finding, not a coincidence to bury.

---

## File structure

- Create: `tools/ctrnact-oracle/develop_spherical.py` — the developer + report + `--selftest`.
- Modify: `tools/ctrnact-oracle/run-oracle.sh` — Phase 3 spherical branch.
- Create: `tests/spherical-develop.test.ts` — invariant cross-check against authored solids.
- Output: `run-k1-spherical/spherical-cells-k1.json`, `run-k1-spherical/spherical-develop-report.txt`.

---

## Task 1: Spherical polygon geometry + ρ solver

**Files:** Create `tools/ctrnact-oracle/develop_spherical.py`

- [ ] **Step 1: numpy vector helpers + regular spherical polygon.** `regular_spherical_polygon(p, rho)`: circumradius `r = asin( sin(rho/2) / sin(pi/p) )` (reject if `sin(rho/2)/sin(pi/p) > 1`); return `p` unit vectors at polar angle `r`, azimuths `2*pi*k/p`, as an (p,3) array. `interior_angle(p, rho)`: at vertex 0 of that polygon, the angle between the geodesic tangents to the two neighbors (tangent of geodesic v0->v1 at v0 = normalize(v1 - (v1·v0) v0); angle via atan2 of the two tangents in v0's tangent plane).

- [ ] **Step 2: ρ solver.** `solve_rho(config)`: bisection on rho in (1e-9, pi-1e-9) for `sum(interior_angle(p, rho) for p in config) - 2*pi == 0`. Monotone decreasing, so standard bisection. Return None if no sign change (no spherical vertex figure).

- [ ] **Step 3: selftest asserts.** In a `--selftest`: for `[4,4,4]` (cube) rho solves and `interior_angle(4, rho)` ~ 2*pi/3; for `[3,3,3]` (tetra) sum==2pi; for `[6,6,6]` (Euclidean) solver returns None (angle sum reaches 2pi only at rho->0). Run `python3 develop_spherical.py --selftest`, expect these to pass.

- [ ] **Step 4: Commit.** `git add tools/ctrnact-oracle/develop_spherical.py && git commit -m "feat(spherical-dev): regular spherical polygon geometry + rho solver"`

## Task 2: Quotient decode wrapper

**Files:** Modify `tools/ctrnact-oracle/develop_spherical.py`

- [ ] **Step 1: import pruner.decode the way develop.py does** (set `EU_KMIN/EU_KMAX/EU_QUIET/EU_OUT` env, `importlib` load `pruner.py`). `read_blocks(path)` and `tes_id(tes)` copied from `develop.py` (identical block IO). `decode_block(b)`: call `pr.decode(b[0]+"\n", b[1]+"\n", b[3]+"\n", b[4]+"\n")`, return dict with `rneig,lneig,mirro,lvert,glue,label` (copies of the `pr.*` lists) and `config` (from `parse_symbols(b[0])[0]`).

- [ ] **Step 2: selftest against a known block.** Build the k=1 cube block from a real pruned file (run `PALETTE=spherical` pipeline once into a fixture, or read `run-k1-spherical/out/pruned/eupruned_01_4.txt`). Assert `decode_block` on the `(4,4,4)` block yields `len(rneig)==3` (cube quotient has 3 darts) and `config==[4,4,4]`.

- [ ] **Step 3: Commit.** `git commit -am "feat(spherical-dev): quotient decode wrapper (reuse pruner.decode)"`

## Task 3: SO(3) geodesic flood-fill developer

**Files:** Modify `tools/ctrnact-oracle/develop_spherical.py`

- [ ] **Step 1: developer.** `develop_sphere(dec)`: mirror `develop.py`'s BFS. State keyed by dart index with a frame `R` (3x3). Vertex pos = `R @ [0,0,1]`. `star(h, R)` walks `rneig` accumulating a rotation about the vertex axis by `interior_angle(lvert[rneig[cur]], rho)` per step until returning to `(h,R-equivalent)`; all visited darts share the vertex position. Crossing `glue[h]`: compose the fixed edge-crossing rotation (rotate by `rho` about the axis = the tangent-perpendicular at the current dart). Dedup vertex positions into a list `V` with a tolerance KD-lookup (`tol=1e-6`). Collect edges from `glue` pairs (as vertex-id pairs, deduped) and faces from orbits of `F(h)=glue[rneig[h]]` mapped to vertex ids. Guard: pop cap 200000 -> raise.

- [ ] **Step 2: TDD on the three smallest solids.** selftest: develop the tetra `(3,3,3)`, cube `(4,4,4)`, octa `(3,3,3,3)` blocks; assert `(len(V), len(E), len(F))` == `(4,6,4)`, `(8,12,6)`, `(6,12,8)`. Iterate the frame/rotation composition until these pass (this is where matrix-order bugs surface).

- [ ] **Step 3: Commit.** `git commit -am "feat(spherical-dev): SO(3) geodesic flood-fill -> vertices/edges/faces"`

## Task 4: Closure + regularity verification and Polyhedron emit

**Files:** Modify `tools/ctrnact-oracle/develop_spherical.py`

- [ ] **Step 1: verify.** `check_realized(V,E,F,rho,tol)`: (a) Euler `len(V)-len(E)+len(F)==2`; (b) every edge chord length equal within tol; (c) every face coplanar within tol and its edges equal (regular). Return `(ok, residuals)`. `to_record(id,config,V,F)`: `{id, vertexConfig, vertices:[[x,y,z]...], faces:[[...]...], realized:True, residual:{...}}`.

- [ ] **Step 2: selftest.** Assert cube record: 6 faces all size 4, all edges equal, Euler holds. Assert a deliberately broken config (e.g. force rho wrong) fails `check_realized`.

- [ ] **Step 3: Commit.** `git commit -am "feat(spherical-dev): closure/regularity verification + Polyhedron record"`

## Task 5: Driver over the pruned dir -> JSON + report

**Files:** Modify `tools/ctrnact-oracle/develop_spherical.py`

- [ ] **Step 1: main().** argparse `--pruned`, `--out`, `--report`, `--kmin/--kmax` (default 1/1), `--selftest`. Iterate pruned blocks (same globbing as `develop.py`), develop each, collect realized records + non-realizable/failed report lines. Dedup by invariant signature `(sorted config, V, E, F, face multiset)` to surface geometric duplicates. Write JSON (realized records) and the report (in: N, realized: R, non-realizable: list, duplicate-groups: list).

- [ ] **Step 2: run for real.** `PALETTE=spherical ./run-oracle.sh 1` must exist first (Task 6); until then run stages by hand into `run-k1-spherical`. Expect report: `28 in, 28 realized, 0 non-realizable, 0 duplicates`.

- [ ] **Step 3: Commit.** `git commit -am "feat(spherical-dev): driver emits cells JSON + realizability report"`

## Task 6: Wire run-oracle.sh Phase 3 for spherical

**Files:** Modify `tools/ctrnact-oracle/run-oracle.sh`

- [ ] **Step 1:** Add a `spherical` branch to the Phase-3 `if`: call `python3 "$HERE/develop_spherical.py" --kmin 1 --kmax "$MAXK" --pruned "$OUT/out/pruned" --out "$CELLS" --report "$OUT/spherical-develop-report.txt"`. Keep the existing branches unchanged.

- [ ] **Step 2:** Run `PALETTE=spherical ./run-oracle.sh 1`; confirm it produces `run-k1-spherical/ctrnact-cells-k1.json` and the report with 28/28.

- [ ] **Step 3: Commit.** `git commit -am "feat(spherical-dev): run-oracle Phase 3 spherical develop branch"`

## Task 7: TS invariant cross-check

**Files:** Create `tests/spherical-develop.test.ts`

- [ ] **Step 1: failing test.** Load `tools/ctrnact-oracle/run-k1-spherical/ctrnact-cells-k1.json`. For each record compute invariants (sorted config, V, E from faces, F, face-size multiset, edge-length CV < 1e-6, per-face regularity). Build the target index: Platonic+Archimedean invariants from `import { PLATONIC_SOLIDS } from "@/lib/render/platonicSolids"` and `ARCHIMEDEAN_SOLIDS` from `@/lib/render/archimedeanSolids`; prism/antiprism invariants from closed form. Assert: 28 records, each matches exactly one target, 0 unmatched.

- [ ] **Step 2: run.** `pnpm vitest run tests/spherical-develop.test.ts` — iterate until green.

- [ ] **Step 3: Commit.** `git commit -am "test(spherical-dev): invariant cross-check vs authored solids (28/28)"`

## Task 8: End-to-end verification + report

- [ ] **Step 1:** From clean: `cd tools/ctrnact-oracle && make PALETTE=spherical MAXNUM=1 && PALETTE=spherical ./run-oracle.sh 1`, then `pnpm vitest run tests/spherical-develop.test.ts`. Confirm 28/28 and the Vitest passes.
- [ ] **Step 2:** Run `python3 tools/ctrnact-oracle/develop_spherical.py --selftest` and `make -C tools/ctrnact-oracle check-regular` (the Euclidean guard must still pass — we touched only run-oracle's spherical branch and added a new file).
- [ ] **Step 3: Commit** any report/artifact and write a SYNC entry.

---

## Self-review notes

- Spec coverage: Tasks 1–2 = decode+ρ (spec algo 1–2); Task 3 = flood-fill (spec algo 3); Task 4 = verify/emit (spec algo 4); Task 5 = driver+report; Task 7 = validation. All spec sections covered.
- The one real risk is Task 3 Step 2 (SO(3) frame composition). It is gated by exact V/E/F on three solids of increasing valence, so an order/handedness bug cannot pass silently.
- `check-regular` (Task 8 Step 2) guarantees the Euclidean path is byte-identical — the only shared file touched is `run-oracle.sh`, and only in a new `spherical` branch.
