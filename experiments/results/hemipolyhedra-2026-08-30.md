# The nine hemipolyhedra — why no search here could produce them, and what shipped

Started from AL's observation: the non-convex spherical shelf ("Regular polygons", `spn-solid`) runs
k = 2 … 5 with nothing at k = 1, while the octahemioctahedron is plainly a non-convex polyhedron with
regular faces and one vertex orbit.

## Why the shelf has no k = 1, and it is not the bug

k = 1 with regular faces means vertex-transitive, which means UNIFORM. So the non-convex shelf having
no k = 1 row is correct by construction: a non-convex uniform polyhedron belongs on the star shelf, not
beside the Johnson-like k ≥ 2 records. The bug is one level up — the star shelf does not hold them all.

Measured, not assumed: of the 100 records in `public/spherical-star/`, 52 are k = 1 and 13 of those are
star prisms or antiprisms (config `n/d.4.4` or `n/d.3.3.3`, both infinite families). That leaves **39 of
the 57 non-convex uniform polyhedra**, against a shipped comment in `nonconvexSolids.ts` claiming all 57
were there. Nine of the missing eighteen are the hemipolyhedra; the sentence is corrected in place.

## Why the engine cannot emit them, in two separate places

1. **The flat vertex.** Every closure mode in `alphabets/gen_alphabet.py::enum_configs` keys on the SIGN
   of a vertex's angular defect — `positive-defect` (sphere), `negative-defect` (hyperbolic), `mixed`
   (the genus shelf) — and all three exclude the defect-zero vertex. The octahemioctahedron's vertex is
   3.6.3.6: 60 + 120 + 60 + 120 = 360°, exactly flat. It is the trihexagonal Euclidean tiling's vertex
   closed into a finite map instead of the infinite plane. No mode can emit that word at any k.
2. **Orientability.** `genus_harvest.py` refuses a non-orientable record outright rather than mislabel
   its genus ("None has appeared" — because the search that would produce one is the one blocked above).
   Eight of the nine hemipolyhedra are one-sided.

So the class was outside the search twice over, and neither exclusion is a tuning knob.

## What was built

`tools/ctrnact-oracle/gen_hemi_shelf.py` — the only shelf here that is CONSTRUCTED, because the class is
closed at nine and published. Every regular {n/d} polygon in the octahedron's 6, the cuboctahedron's 12
and the icosidodecahedron's 30 points is enumerated (planes through ≥ 3 points, concyclic, equally
spaced), split by distance from the origin, and each solid is one non-central face class plus one class
of faces whose plane passes THROUGH the centre. The face inventory came out exactly as the nine need it:

    cuboctahedron,      edge 1.000:  8{3}  6{4}  4{6}←hemi
    icosidodecahedron,  edge 0.618: 20{3} 12{5}  6{10}←hemi
    icosidodecahedron,  edge 1.000: 12{5/2} 12{5} 10{6}←hemi
    icosidodecahedron,  edge 1.618: 20{3} 12{5/2} 6{10/3}←hemi

Verified per solid: every face regular and planar, one edge length to 1e-9, every edge in exactly two
faces, one vertex orbit, and χ with orientability. Cross-checked against Wikipedia's uniform-polyhedron
list, 2026-08-30 — every V/E/F and face composition agrees.

| solid | V | E | F | χ | surface | census |
|---|---|---|---|---|---|---|
| Tetrahemihexahedron | 6 | 12 | 7 | 1 | projective plane | 4{3}, 3{4} |
| Octahemioctahedron | 12 | 24 | 12 | 0 | **torus (the only orientable one)** | 8{3}, 4{6} |
| Cubohemioctahedron | 12 | 24 | 10 | −2 | one-sided, 4 crosscaps | 6{4}, 4{6} |
| Small icosihemidodecahedron | 30 | 60 | 26 | −4 | one-sided, 6 | 20{3}, 6{10} |
| Small dodecahemidodecahedron | 30 | 60 | 18 | −12 | one-sided, 14 | 12{5}, 6{10} |
| Small dodecahemicosahedron | 30 | 60 | 22 | −8 | one-sided, 10 | 12{5/2}, 10{6} |
| Great dodecahemicosahedron | 30 | 60 | 22 | −8 | one-sided, 10 | 12{5}, 10{6} |
| Great icosihemidodecahedron | 30 | 60 | 26 | −4 | one-sided, 6 | 20{3}, 6{10/3} |
| Great dodecahemidodecahedron | 30 | 60 | 18 | −12 | one-sided, 14 | 12{5/2}, 6{10/3} |

⚑ One correction the geometry could not make. The SMALL dodecahemicosahedron takes the PENTAGRAMS and
the GREAT one the pentagons, which reads backwards and is right. Both sit at the same chord on the same
30 points, so nothing measurable separates them; only the literature does. This table shipped them
swapped for one revision, caught against the two Wikipedia pages.

## No sphere view, and it is the one case where measuring would lie

Every vertex IS on a circumsphere — they are the parent quasiregular solid's. But a hemi face's plane
contains the centre, so radial projection sends it to a great circle and not a spherical polygon, and
V − E + F is never 2 in the first place. `sph-inscribed.ts` withholds the view by id, not by the fit.

## Where they were filed

Three tries, and the third is the one that follows a rule the atlas already had.

1. Their own sibling row next to "Regular polygons". One level too high.
2. All nine inside "Regular polygons" as its k = 1 row. Right instinct — k = 1 with regular faces means
   vertex-transitive means uniform, so that row could only ever have held uniform non-convex solids, and
   it read empty because the class was missing. Wrong for three of them.
3. **Split by FACE TYPE**, which is exactly the split those two headings already make between them: the
   non-convex shelf is the one whose faces are ordinary regular polygons and whose SOLID bends past π,
   the star shelf is the one whose FACES are the {n/d}. So:

   * **Regular polygons → k = 1 hemipolyhedra, 6** — tetrahemihexahedron, octahemioctahedron,
     cubohemioctahedron, small icosihemidodecahedron, small dodecahemidodecahedron, great
     dodecahemicosahedron. Every member of that row is a hemipolyhedron, so the row takes the noun.
   * **Star polyhedra → k = 1, 55** — small dodecahemicosahedron, great icosihemidodecahedron, great
     dodecahemidodecahedron, joining 52 records that are NOT hemipolyhedra. That row takes no noun,
     which is what `kNoun` already returns for every star record.

The partition is `HEMI_STAR_FACED` in `lib/render/hemiSolids.ts`, emitted by the generator off the face
census — never hand-listed, because three ids written into a routing function is how a shelf and its
generator drift apart. `tests/hemi-solids.test.ts` re-derives it from each record's vertex configuration
and fails if the two disagree.

⚑ "k = 1 hemipolyhedra 6" names what is in that row, not the whole class. Six of the nine are there; the
count on the card and in the note says which class each record belongs to.

⚑ Known gap, not fixed: the star-shelf FACETS (`starKind`, and `ncxCrossing` on the other side) test for
a `sphStar` payload, which these three do not have — they are `Polyhedron` records on the spherical
shelf. Filtering the star shelf by kind silently omits them. They are on the shelf and in its k row;
only the facet misses them.

## Still missing after this

The star shelf now covers 48 of the 57. Nine remain, by V/E/F shortfall against the published list:
U18 and U21 (small/great rhombihexahedron), U39 and U73 (small/great rhombidodecahedron), U50 and U63
(small/great dodecicosahedron), U56 (rhombicosahedron), one of the U46/U64 snub pair, and U75, the
great dirhombicosidodecahedron. The first seven are the other one-sided uniform polyhedra — the same
density-undefined obstruction as the hemipolyhedra, a different construction. Not attempted here.
