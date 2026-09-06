# Polyhedron coverage: what the atlas has, what it lacks, and what would need a different shelf

Survey of the Wikipedia polyhedron literature against the shipped shelves, 2026-08-31. Every count below
was either measured off this repo or read from the linked article; nothing is recalled.

**The atlas's remit is one predicate:** every face a regular polygon, every edge the same length. That
predicate is what makes a shelf here possible — it is the closure test the Čtrnáct engine searches on and
the invariant every shelf's tests assert. It is also the line that splits this document. A class of
polyhedra that satisfies it is a gap in a shelf we have. A class that does not is not a gap at all; it is
a different atlas, needing its own invariant, its own generator and its own certification.

---

## 1. Regular-faced classes the atlas already covers

| Class | Published | Atlas | Shelf |
|---|---|---|---|
| [Platonic solids](https://en.wikipedia.org/wiki/Platonic_solid) | 5 | **5** | Regular polygons, convex, k = 1 |
| [Archimedean solids](https://en.wikipedia.org/wiki/Archimedean_solid) | 13 | **13** | Regular polygons, convex, k = 1 |
| [Prisms and antiprisms](https://en.wikipedia.org/wiki/Prism_(geometry)) | infinite | **12** | Regular polygons, convex, k = 1 — a prefix of an infinite family, by design |
| [Johnson solids](https://en.wikipedia.org/wiki/Johnson_solid) | 92 (Zalgaller 1969, complete) | **84** | Regular polygons, convex, k ≥ 2 |
| [Kepler–Poinsot polyhedra](https://en.wikipedia.org/wiki/Kepler%E2%80%93Poinsot_polyhedron) | 4 | **4** | Star polyhedra, k = 1 |
| [Non-convex uniform polyhedra](https://en.wikipedia.org/wiki/List_of_uniform_polyhedra) | 57 | **48** | Star polyhedra k = 1 (39) + Regular polygons k = 1 (6 hemipolyhedra) + Star k = 1 (3 hemipolyhedra) |
| [Hemipolyhedra](https://en.wikipedia.org/wiki/Hemipolyhedron) | 9 | **9** | split by face type — see §2 of the hemipolyhedra log |
| [Star prisms and antiprisms](https://en.wikipedia.org/wiki/Prismatic_uniform_polyhedron) | infinite | **13** | Star polyhedra, k = 1 |
| [Convex deltahedra](https://en.wikipedia.org/wiki/Deltahedron) | 8 | **8** | all are Platonic or Johnson; no separate shelf needed |
| Non-convex regular-faced, non-uniform | **no catalogue exists** | **278** | Regular polygons, k = 2…5 (`ncx-`) |
| Regular-faced with V − E + F ≠ 2 | **no catalogue exists** | **86** | Toroidal (10) + Genus 3/4/5/9 (76) |
| [Isotoxal](https://en.wikipedia.org/wiki/Isotoxal_figure) spherical solids | — | **15** | `iso-` records |

The last two rows are the ones with no counterpart in the literature at all: Johnson's 92 and Zalgaller's
completeness proof are for **convex** regular-faced solids, Zalgaller's own extension ("convex
regular-faced polyhedra with conditional edges") is still convex, and Klitzing's survey puts non-convexity
out of scope. Those 364 records are this repo's own contribution and there is nothing to check them
against — which is exactly why they ship with a measured signature and no invented name.

---

## 2. Gaps in shelves we already have

These satisfy the remit. Each is a bug in a shipped shelf, not a new project.

### 2.1 Eight Johnson solids, of 92

Measured off `lib/render/johnsonSolids.ts`: 84 present, missing

| J | Name |
|---|---|
| [J47](https://en.wikipedia.org/wiki/Gyroelongated_pentagonal_cupolarotunda) | Gyroelongated pentagonal cupolarotunda |
| [J48](https://en.wikipedia.org/wiki/Gyroelongated_pentagonal_birotunda) | Gyroelongated pentagonal birotunda |
| [J60](https://en.wikipedia.org/wiki/Metabiaugmented_dodecahedron) | Metabiaugmented dodecahedron |
| [J61](https://en.wikipedia.org/wiki/Triaugmented_dodecahedron) | Triaugmented dodecahedron |
| [J68](https://en.wikipedia.org/wiki/Augmented_truncated_dodecahedron) | Augmented truncated dodecahedron |
| [J70](https://en.wikipedia.org/wiki/Metabiaugmented_truncated_dodecahedron) | Metabiaugmented truncated dodecahedron |
| [J71](https://en.wikipedia.org/wiki/Triaugmented_truncated_dodecahedron) | Triaugmented truncated dodecahedron |
| [J87](https://en.wikipedia.org/wiki/Augmented_sphenocorona) | Augmented sphenocorona |

All eight are high-orbit solids and the search has been run to k = 5. They are a coverage question
(deeper k, or the construct-and-verify route), not an exclusion. This is the single most closable gap in
the atlas: the class is finite, proved complete, and the shelf for it already exists.

### 2.2 Nine non-convex uniform polyhedra, of 57

| U | Name | Why it is not here |
|---|---|---|
| [U18](https://en.wikipedia.org/wiki/Small_rhombihexahedron) | Small rhombihexahedron | two face types, crossed p.q.p.q vertex figure, no defined density |
| [U21](https://en.wikipedia.org/wiki/Great_rhombihexahedron) | Great rhombihexahedron | " |
| [U39](https://en.wikipedia.org/wiki/Small_rhombidodecahedron) | Small rhombidodecahedron | " |
| [U73](https://en.wikipedia.org/wiki/Great_rhombidodecahedron) | Great rhombidodecahedron | " |
| [U50](https://en.wikipedia.org/wiki/Small_dodecicosahedron) | Small dodecicosahedron | " |
| [U63](https://en.wikipedia.org/wiki/Great_dodecicosahedron) | Great dodecicosahedron | " |
| [U56](https://en.wikipedia.org/wiki/Rhombicosahedron) | Rhombicosahedron | " |
| [U64](https://en.wikipedia.org/wiki/Great_snub_dodecicosidodecahedron) | Great snub dodecicosidodecahedron | ordinary snub with a real density — looks like plain run coverage |
| [U75](https://en.wikipedia.org/wiki/Great_dirhombicosidodecahedron) | Great dirhombicosidodecahedron | see §4.1 — not representable |

The route to the first seven is **construction, not search**, and it is demonstrated rather than argued:
they are facetings of convex uniform solids, so their faces already live in the parent's vertex set.
Enumerating every regular {n/d} polygon in the small rhombicuboctahedron's 24 points gives 8{3} + 18{4} +
6{8} at one edge length, and choosing the 12 squares that close the surface yields V=24, E=48, F=18,
χ = −6, 12{4}+6{8}, every edge in exactly two faces — the small rhombihexahedron, in one pass. A bounded
generalization of `gen_hemi_shelf.py` (parent vertex set and target census as parameters) reaches all
seven. A deeper k, a wider palette and a longer run would each reach none of them: the star pipeline's
developer needs a density and these have none. Detail in
`experiments/results/star-shelf-naming-2026-08-30.md`.

---

## 3. Regular-faced classes that would need a NEW shelf

These satisfy the remit, so they belong in this atlas eventually, but no existing shelf holds them.

### 3.1 [Stewart toroids](https://en.wikipedia.org/wiki/Stewart_toroid) — the big one

Regular faces, **no self-intersection**, adjacent faces not coplanar, genus ≥ 1. Infinite and not
enumerated ("unlike the Johnson solids, there are infinitely many"). This overlaps the atlas's genus
shelf and is the sharper half of it: our 86 genus records are mostly self-intersecting, and 22 of them
were measured as embedded. A Stewart toroid is by definition embedded. The quasi-convex subset
(excavated truncated cubes, octahedra, cuboctahedra) is the natural first target and is small.

### 3.2 [Crown polyhedra / stephanoids](https://en.wikipedia.org/wiki/Crown_polyhedron)

Toroidal, self-intersecting, and **noble** (isohedral and isogonal at once). Wikipedia does not state
whether the faces are regular, which has to be settled before deciding whether they belong here at all.
If they are, they sit beside the genus shelf.

### 3.3 [Non-convex deltahedra](https://en.wikipedia.org/wiki/Deltahedron)

Infinitely many. All faces equilateral triangles, so they pass the remit trivially. Named members
include the stella octangula, the excavated dodecahedron and the great icosahedron (already here as U53).
Wikipedia records a partial classification: one with a single vertex type, seventeen with two. That
17-member class is a finite, checkable target and the atlas's `ncx-` shelf may already contain some of
them unnamed — worth a cross-check, since it would be the first published catalogue that shelf could be
verified against.

### 3.4 [Regular skew apeirohedra](https://en.wikipedia.org/wiki/Regular_skew_polyhedron) (Petrie–Coxeter)

Regular polygon faces, infinite in extent, spanning 3-space. Different in kind from everything shipped —
these are not closed surfaces — so they would need their own renderer as well as their own shelf.

---

## 4. Different in nature: classes the remit excludes

Nothing here has regular faces, or is not a single polyhedron. Each would need a new invariant, a new
generator and a new certification story. Listed so the boundary is explicit rather than implied.

### 4.1 [Skilling's figure](https://en.wikipedia.org/wiki/Skilling%27s_figure) — excluded by the data model, not the remit

The great disnub dirhombidodecahedron: V=60, E=240 geometric (360 abstract), F=204, 120{3}+60{4}+24{5/2}.
Its faces ARE regular. It is excluded because **four faces meet at each of its double edges**, and every
shelf in this repo — star, non-convex, genus, hemi — gates on "every edge lies in exactly two faces" and
asserts it in tests. Admitting it means changing what a face ring means, everywhere.

### 4.2 Duals

| Class | Count | Link |
|---|---|---|
| Catalan solids (duals of Archimedean) | 13 | [link](https://en.wikipedia.org/wiki/Catalan_solid) |
| Duals of the non-convex uniform polyhedra | ~57 | [link](https://en.wikipedia.org/wiki/Dual_polyhedron) |
| Duals of the hemipolyhedra ("acrons") | 9, sharing 6 outward forms | [link](https://en.wikipedia.org/wiki/Hemipolyhedron) |
| Bipyramids and trapezohedra (duals of prisms/antiprisms) | infinite | [bipyramid](https://en.wikipedia.org/wiki/Bipyramid), [trapezohedron](https://en.wikipedia.org/wiki/Trapezohedron) |

Catalan faces are isosceles triangles, rhombi, kites, scalene triangles and irregular pentagons — never
regular. The acrons are stranger still and are the reason AL's original link pointed at the
Octahemioctacron: because a hemipolyhedron's faces pass through the centre, its dual has **vertices at
infinity**, on the real projective plane at infinity. No finite coordinate list can hold one.

### 4.3 [Stellations](https://en.wikipedia.org/wiki/Stellation)

The [59 icosahedra](https://en.wikipedia.org/wiki/The_Fifty-Nine_Icosahedra) under Miller's five rules,
plus 1 stellation of the octahedron (the stella octangula), 3 of the dodecahedron, and the stellations of
the cuboctahedron and icosidodecahedron that Wenninger models (W43–W46, W47–W66). Faces are face-PARTS
lying in the parent's face planes — generally disconnected, generally irregular. The invariant is
"lies in one of the twenty planes", not "is a regular polygon".

### 4.4 [Polyhedral compounds](https://en.wikipedia.org/wiki/Polyhedral_compound)

⚑ The DUAL compound — a solid and its own reciprocal in one figure, the stella octangula and its
relatives — is a shipped VIEW as of 2026-08-31 (`lib/render/dualSolid.ts`, the Solid/Dual/Compound
control). It is offered only where the solid has a MIDSPHERE, 67 of the 501, because that is what fixes
the two components' relative size and makes their edges cross. That does not touch the 75 uniform
compounds below, which are a different object: those are several DIFFERENT polyhedra sharing a centre,
not a solid paired with its own dual.


75 [uniform compounds](https://en.wikipedia.org/wiki/Uniform_polyhedron_compound) (Skilling 1976, six of
them infinite prismatic families), plus the 5 regular compounds. **These are not single polyhedra**: a
compound is several interpenetrating polyhedra sharing a centre. Every shelf here assumes one connected
face-and-edge structure, so a compound shelf is a different data model, not a different palette.

### 4.5 Infinite families with non-regular faces

| Class | Why it is out | Link |
|---|---|---|
| Zonohedra | centrally symmetric faces, generally rhombi | [link](https://en.wikipedia.org/wiki/Zonohedron) |
| Goldberg / geodesic polyhedra / fullerenes | hexagons need not be regular | [link](https://en.wikipedia.org/wiki/Goldberg_polyhedron) |
| Waterman polyhedra | convex hulls of sphere centres; irregular convex faces | [link](https://en.wikipedia.org/wiki/Waterman_polyhedron) |
| Space-filling: 5 parallelohedra, plesiohedra, stereohedra | the invariant is the tiling of 3-space, not the face | [link](https://en.wikipedia.org/wiki/Space-filling_polyhedron) |
| Near-miss Johnson solids | faces *approximately* regular — "close to" is not defined, so neither is the class | [link](https://en.wikipedia.org/wiki/Near-miss_Johnson_solid) |

The near-misses deserve a sentence of their own: they are the one class the atlas must refuse on
principle rather than on scope. Every shelf here certifies "all edges equal to nine decimal places". A
near-miss is defined by failing that, and shipping one beside the Johnson solids would make the
certification meaningless.

### 4.6 [Császár](https://en.wikipedia.org/wiki/Cs%C3%A1sz%C3%A1r_polyhedron) and [Szilassi](https://en.wikipedia.org/wiki/Szilassi_polyhedron)

The two famous toroids: Császár V=7, E=21, F=14 triangles, genus 1 (every pair of vertices joined —
the only known polyhedron besides the tetrahedron with no diagonals); Szilassi its dual, V=14, E=21,
F=7 hexagons, genus 1, every face touching every other.

Neither can be regular-faced, and the argument is the atlas's own flat-vertex argument: Császár has
2E/V = 6 triangles at every vertex, so equilateral faces would put 6 × 60° = 360° at each — a flat
vertex, where the six triangles are coplanar and the "solid" is degenerate. (Gauss–Bonnet does not
forbid it: genus 1 wants total defect zero. Degeneracy does.) So they are topology exhibits, not
candidates for the genus shelf.

---

## 5. Summary

Counting only what the atlas's own predicate admits:

* **Complete**: Platonic 5/5, Archimedean 13/13, Kepler–Poinsot 4/4, hemipolyhedra 9/9, convex deltahedra 8/8.
* **Nearly complete, finite, closable**: Johnson **84/92**, non-convex uniform **48/57**.
* **Uncatalogued and ours**: 278 non-convex regular-faced k ≥ 2, 86 at genus ≥ 1 — no literature to check against.
* **Regular-faced and absent entirely**: Stewart toroids, crown polyhedra, non-convex deltahedra, regular skew apeirohedra.
* **Out of remit**: duals (Catalan, acrons, bipyramids/trapezohedra), stellations, compounds, zonohedra,
  Goldberg/geodesic, Waterman, space-filling, near-misses, Császár/Szilassi — and Skilling's figure,
  which is out for a different reason: its faces are regular but four meet at an edge.

The two finite closable gaps — 8 Johnson solids and 7 constructible uniform stars — are the work with the
best ratio of coverage gained to machinery built. Everything in §3 is a new shelf; everything in §4 is a
new atlas.
