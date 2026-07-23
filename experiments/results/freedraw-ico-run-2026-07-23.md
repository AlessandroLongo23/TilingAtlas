# Freedraw {3,5} icosahedral (triangles_edges_3_5) — local PT run

**Date:** 2026-07-23 · **Machine:** Apple Silicon (arm64), macOS 25.5 · wine 11.0 via Rosetta 2
**Binary:** `pt_triangles_edges_3_5.exe`, 492 032 bytes, built 09:29 today
**SHA-256:** `8a4d5f2aa4bdf0b39683329c28516df14f790421845441a6f8c8c0a772be8d37`

The `triangles_edges` solver retargeted from the planar {3,6} triangular grid to the {3,5}
icosahedron. Alphabet A2 (digon, drawn edge) + A3 (triangle). Output folder must exist first:
`solver_triangles_edges_3_5/`. Input is two stdin prompts, min then max vertices.

## What Marek reported (Discord, this morning)

k=1: 5 (0.16 s), k=2: 39 (1.036 s), k=3: 61 (1.243 s), k=4: 257 (1.322 s), k=5: 257 (1.770 s),
k=6: 6727 (10.933 s), k=7: 0 (23.474 s), k=8: 11304 (76.899 s). Max k is 12 — the icosahedron has
12 vertices, so no solution can have more than 12 vertex orbits. He expects 0 at k=9,10,11 and a
large asymmetric batch at k=12.

## Local reproduction — eight runs, min=1 max=K, K=1..8

Counts are solutions at exactly k=K (achiral / chiral split from the `_o_` filename tag). Times are
the solver's own printed figure (`Finished with N solutions after Ts`), not wall.

| maxk | achiral | chiral | total (mine) | Marek | match | solver time | Marek time |
|------|---------|--------|--------------|-------|-------|-------------|------------|
| 1 | 3 | 2 | **5** | 5 | ✓ | 0.011 s | 0.16 s |
| 2 | 20 | 19 | **39** | 39 | ✓ | 0.019 s | 1.036 s |
| 3 | 14 | 47 | **61** | 61 | ✓ | 0.070 s | 1.243 s |
| 4 | 157 | 100 | **257** | 257 | ✓ | 0.384 s | 1.322 s |
| 5 | 257 | 0 | **257** | 257 | ✓ | 2.050 s | 1.770 s |
| 6 | 165 | 6562 | **6727** | 6727 | ✓ | 9.349 s | 10.933 s |
| 7 | 0 | 0 | **0** | 0 | ✓ | 28.310 s | 23.474 s |
| 8 | 11304 | 0 | **11304** | 11304 | ✓ | 80.601 s | 76.899 s |

All eight match to the unit. The maxk=8 run prints `Finished with 18650 solutions` — the cumulative
k≤8 total, 5+39+61+257+257+6727+0+11304 = 18650 — an independent check that no per-k file was missed.

My small-k times are much shorter than Marek's (0.011 s vs 0.16 s at k=1) and converge at large k
(80.6 s vs 76.9 s at k=8). Consistent with his own guess that his figures fold in the vertex-table
build overhead; the per-solution search cost agrees.

### Texture worth noting

- **k=5 and k=8 are entirely achiral** (0 chiral); k=6 is almost all chiral (6562 / 6727).
- **k=7 is empty.** Marek's reading: the icosahedron has a tetrahedral sub-symmetry (order-12
  subgroup of the order-60 rotation group); solutions with k ≥ 6 start breaking through it, and k=7
  happens to admit none. Not a bug — the search ran the full 28 s and found nothing.
- k=4 and k=5 coincide at 257 — Marek's "ALSO 257". Coincidence, not a copy: the k=5 batch is all
  achiral, the k=4 batch is 157/100.

## The decode step does NOT work, and the reason is structural, not a config problem

Running the shipped decoder on these certificates fails immediately:

```
$ develop_freedraw.py icorun-k1/solver_triangles_edges_3_5 --grid triangle --out ico-k1.json
parsed 5 certificates
DevelopError: tag D10a order != 2 * rotation order 6 of ['A2', 'A3']
```

This is the whole story of why {3,5} is not a drop-in extension. `develop_freedraw.py` is planar by
construction:

```python
s = sum(units[c] for c in figure)        # angle sum, in 30-degree units
if s == 0 or 12 % s:                      # <-- must divide 360 degrees
    raise DevelopError("angle sum does not divide 360")
rot = 12 // s                             # <-- rotation order ASSUMES 360-degree closure
...
if head.startswith("D") and Dn != 2 * rot:   # site symmetry must match the planar rot
    raise DevelopError("tag order != 2 * rotation order")
```

The `12 % s` divisibility test and `rot = 12 // s` ARE the Euclidean assumption "the tiles around a
vertex fill exactly 360 degrees." On the icosahedron a vertex has five triangles, and the certificate
records that as a `D10a` site tag (dihedral order 10 = 5-fold rotation + mirror). The planar code
computes `rot = 6` (360/60) and demands the tag be `D12`; it gets `D10` and rejects. Five-valent
vertices simply are not representable in a solver that hardcodes six.

Everything downstream inherits the same assumption:

- `develop()` BFS-develops on a fixed integer grid basis and ends by asserting `period lattice rank
  == 2`. A spherical tiling has **no translation lattice** — the development closes on itself and is
  finite. Rank 2 is unreachable, so even past the vertex-tag check it would fail.
- The data model (`lib/freedraw/pattern.ts`) stores every pattern as an HNF lattice `(a,b,d)` with
  per-coset edge bits, or (ts grid) an explicit patch carrying `T1`/`T2` period translations. Both
  encode planar periodicity. There is no field for "on the sphere, 30 edges, no period."
- The renderer (`components/freedraw/freedraw-canvas.tsx`, `lib/freedraw/render.ts`) tiles the plane
  by repeating one period across a 2-D lattice. There is nothing to repeat here.

**Conclusion.** The {3,5} freedraw is a spherical / finite object, not a planar one. Reproducing the
enumeration was easy and is done (table above). Displaying it is a separate build: a new develop path
that lays certificates onto the icosahedron (spherical coordinates or an unfolded net, no period
lattice), a data shape that does not assume HNF/T1-T2, and a renderer that draws on a sphere or a net.
That is closer to the atlas's "spherical tilings" arm than to the planar freedraw grids, and it should
live there rather than being bolted onto the freedraw lattice model.

## Independent enumeration on the fixed icosahedron — and it matches Marek to the unit

Rather than fight the planar decoder into unfolding a spherical orbifold (fiddly, orientation-risky),
the underlying tiling is ALWAYS the icosahedron, so a {3,5} freedraw solution is nothing more than a
choice of which of the 30 edges are DRAWN, classified up to the icosahedral group I_h (order 120), with
k = number of vertex orbits under the pattern's stabiliser. That is enumerable directly on the real
polyhedron, which gives exact 3D geometry for the viewer AND an independent cross-check of the solver.

`scratchpad/ico_enum.py`: builds the icosahedron + I_h numerically (120 symmetries found as the maps
sending one oriented face-flag to another; verified vertex- and edge-transitive, all degree 5), then
enumerates every degree-1-free edge subset with a non-trivial stabiliser (invariant under ≥ 1 non-
identity element — which covers all k ≤ 11 exactly, since only the identity fixes all 12 vertices),
canonicalises under I_h, and classifies by k and chirality. Runs in ~20 s.

| k | achiral (mine) | chiral (mine) | total | Marek | match |
|---|----------------|---------------|-------|-------|-------|
| 1 | 3 | 2 | 5 | 5 | ✓ |
| 2 | 20 | 19 | 39 | 39 | ✓ |
| 3 | 14 | 47 | 61 | 61 | ✓ |
| 4 | 157 | 100 | 257 | 257 | ✓ |
| 5 | 257 | 0 | 257 | 257 | ✓ |
| 6 | 165 | 6562 | 6727 | 6727 | ✓ |
| 8 | 11304 | 0 | 11304 | 11304 | ✓ |

k=7,9,10,11 correctly empty. The two engines share no code — Marek's is a threaded C++ Conway half-edge
dual-search run under wine; mine is a numpy edge-subset enumeration on the icosahedron — yet they agree
on all 18 650 patterns AND on the achiral/chiral split at every k. This is the real validation of the
{3,5} catalogue (running his binary only reproduces his numbers by construction). It also settles the
counting convention: patterns are classified up to the FULL group I_h (mirror pairs merged), a chiral
class being one whose stabiliser holds no reflection. Note k=5 and k=8 are entirely achiral.

## The spherical viewer

The enumerator emits per-k JSON (`public/freedraw-ico/ico-solutions-k{1..6,8}.json`, keyed by vertex
index in the platonicSolids.ts ICOSAHEDRON order): each pattern is its drawn edges (vertex-index pairs)
and its tiles (each tile = the icosahedron faces it covers, flood-filled across undrawn edges). Route
`/freedraw/sphere` renders one pattern on a real 3D sphere, reusing the existing spherical stack rather
than anything new:

- `components/freedraw/ico-freedraw-canvas.tsx` — three.js WebGL scene + `ArcballControls` quaternion
  trackball (same input model as `SphericalCanvas`), rebuilds on pattern change.
- `lib/render/icoFreedraw.ts` — flat facets coloured by tile (golden-angle hues) + the drawn edges as
  raised great-circle tubes via the wireframe's own `buildTubeSkeleton`.

Verified live: k=1 blank icosahedron; k=2 fdi-2-00001 = a 6-edge loop cutting a cap tile; k=3 8-edge
loop, larger cap; drag-rotate and zoom work; no console errors; `pnpm build` clean (`/freedraw/sphere`
prerenders static). Data ships ~10 MB total, lazy-loaded per k (k6 3.7 MB, k8 6.2 MB load only when
selected). The k=6/k=8 patterns are the low-symmetry bulk; k ≤ 5 (619 patterns) are the symmetric,
gallery-worthy ones.

## k=12 complete: the icosahedron catalogue closes at 1,588,329

The min=9 max=12 solver run finished (4645 s ≈ 77 min, 3.5 GB of certificates): k=9,10,11 empty,
**k=12 = 1,569,679, every one chiral**. That achiral=0 is a structural certainty, not a measurement
quirk — k=12 means all 12 vertices are distinct orbits, i.e. the stabiliser is trivial, so the pattern
has no symmetry at all, mirror included; a fully asymmetric pattern is chiral by definition. So the full
icosahedral freedraw catalogue is 18,650 (k≤11, symmetric, independently validated) + 1,569,679 (k=12,
asymmetric) = **1,588,329**. The k=12 batch is the huge asymmetric bulk — not shipped to the viewer
(3.5 GB raw; individually the least interesting since none has symmetry). Its count rests on Marek's
solver; the independent enumeration validated the entire symmetric part (k≤11).

## The whole Platonic family (2026-07-23, second batch)

Marek then sent result zips for the other four solids (certificates, not exes). The same
edge-subset-on-the-solid model generalises to all of them — `scratchpad/platonic_enum.py` reads each
solid's geometry from the app (`platonicSolids`, so vertex indices line up with the viewer), builds its
symmetry group numerically, and enumerates. Small solids (E≤12) are brute-forced over all 2^E subsets,
so they are exact at EVERY k including the fully-asymmetric top; the dodecahedron (E=30) uses the
non-identity-element enumeration (k≤19), with k=20 from Marek.

Every count matches Marek to the unit, including the achiral/chiral split:

| solid | E | group | per-k totals | validated |
|-------|---|-------|--------------|-----------|
| tetrahedron {3,3} | 6 | 24 | k1=3, k2=2 | all k (brute) — nothing at k≥3 |
| octahedron {3,4} | 12 | 48 | 5,8,15,12,2,7 | all k (brute) incl. asymmetric k6=7 |
| cube {4,3} | 12 | 48 | 4,5,4,3,·,1 | all k (brute) — provably 0 at k=5,7,8 |
| dodecahedron {5,3} | 30 | 120 | 2,5,7,15,7,26,51,10,236,472 | k≤19; k=20=2823 (Marek) |
| icosahedron {3,5} | 30 | 120 | 5,39,61,257,257,6727,11304 | k≤11; k=12=1,569,679 (Marek) |

The brute-force solids close a gap the icosahedron/dodecahedron enumerations leave open: they exactly
reproduce even the fully-asymmetric top k (octahedron k=6, and the cube's ZERO there), so the model —
not just its symmetric part — is confirmed against Marek independently.

The viewer (`/freedraw/sphere`) now carries all five: a solid selector, per-solid k options, and a
renderer generalised to square and pentagon faces (fan-triangulation; smooth sphere via a 22-subdiv
projected mesh; grid + drawn edges centred on the surface so half sits inside the sphere). Data:
`public/freedraw-ico/<solid>-k<k>.json` (~10 MB, lazy per solid+k). The asymmetric tops (icosa k=12,
dodeca k=20) are not shipped.
