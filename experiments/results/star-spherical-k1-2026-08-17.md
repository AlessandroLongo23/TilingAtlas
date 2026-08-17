# Star spherical polyhedra through the STS engine — k=1

Goal: make the Čtrnáct solve→prune→develop pipeline find the uniform STAR polyhedra at k=1, counting
how many code changes each category costs. k=1 has a published complete catalogue (75 uniform plus two
prismatic families, Coxeter–Longuet-Higgins–Miller 1954 / Sopov 1970 / Skilling 1975), so unlike every
Marek corpus this shelf has a real oracle to be checked against.

Live log; newest at the bottom.

## The changes, in the order they were needed

1. `starpoly` tile kind in `alphabets/gen_alphabet.py` — a self-intersecting {n/d} with `L = n`,
   `p = 1`, one corner class, interior angle `(n-2d)*pi/n`. NOT the existing `star` kind, which is an
   isotoxal dented 2n-gon (`L = 2n`, `p = 2`) and a different object. `is_point = False` on the new
   class, so the point-adjacency lemma does not fire: that lemma is proved for dented stars and is
   false for {n/d}, where five adjacent pentagram corners is the small stellated dodecahedron.
2. `CLASS_WIND` emitted beside `CLASS_L`, so the developer can tell a pentagon from a pentagram.
3. `develop_spherical.py`: winding parameter on `regular_spherical_polygon` / `interior_angle`
   (`sin(rho/2) = sin(r)*sin(pi*d/n)`, corner spanned by the edges to ±d), a `dens` target on
   `solve_rho` (`Σ angle = 2π·dens`), and `develop_block` keeping EVERY density that realizes.
4. `check_realized`: χ=2 dropped as the certificate (false for two of the four Kepler–Poinsot) and
   replaced by Σ face area = 4π·D for integer D ≥ 1, which is Cayley's relation in geometric form,
   plus a map-consistency test (darts = 2|E| = Σ face degrees, and a {n/d} face traces n darts).
5. `closure: "density"` in `enum_configs` — accept `0 < total < D*maxDensity`, excluding exact
   multiples of a full turn (those are flat Euclidean vertices). Needed by exactly one of the four.

## T0 — baseline, `spherical` palette, k=1

28 blocks in, 28 realized, 0 non-realizable: the 5 Platonic, the 13 Archimedean, and the prisms and
antiprisms available in the {3,4,5,6,8,10} tile set. Re-run after every change below; still 28.

## T1 — `star-ico` (changes 1–4 only, closure UNTOUCHED)

Tiles {3}, {5}, {5/2}; `positive-defect`; maxValence 6. 30 pruned blocks. Found, with no change to the
search or its closure rule:

| solid | word | D | V/E/F |
|---|---|---|---|
| small stellated dodecahedron {5/2,5} | 5/2⁵ | 3 | 12/30/12 |
| great stellated dodecahedron {5/2,3} | 5/2³ | 7 | 20/30/12 |
| great icosahedron {3,5/2} | 3⁵ at d_v=2 | 7 | 12/30/20 |
| dodecadodecahedron U36 | (5.5/2)² | 3 | 30/60/24 |
| great icosidodecahedron U54 | (5/2.3)² | 7 | 30/60/32 |
| small ditrigonal icosidodecahedron U30 | (5/2.3)³ | 2 | 20/60/32 |
| small snub icosicosidodecahedron U32 | 5/2.3⁵ | 2 | 60/180/112 |
| snub dodecadodecahedron U40 | 5/2.3.5.3.3 | 3 | 60/150/84 |
| great snub icosidodecahedron U57 | 5/2.3⁴ | 7 | 60/150/92 |
| great inverted snub icosidodecahedron U69 | 5/2.3⁴ | 37 | 60/150/92 |
| pentagrammic antiprism | 5/2.3³ | 2 | 10/20/12 |

One false positive appeared (V=12, E=30, F=104, χ=86) from dropping the χ gate; the map-consistency
test in change 4 kills it. Missing: the great dodecahedron, exactly as predicted, because 5×108 = 540
is past a full turn.

## T2 — `star-ico-d` (change 5 added)

50 pruned blocks, 20 distinct solids after geometric dedup: 7 convex and 13 star. The great
dodecahedron {5,5/2} arrives at ρ=63.43°, d_v=2, D=3, χ=−6. So does the great ditrigonal
icosidodecahedron U47 ((3.5)³, D=6). **All four Kepler–Poinsot present. Zero false positives:** every
one of the 13 is a catalogued uniform star polyhedron.

Two duplicate mechanisms had to be handled and they pull opposite ways: the same word can be two
solids (3⁵ is the icosahedron at ρ=63.43° and the great icosahedron at ρ=116.57°), and two words can
be one solid (5⁶ develops to the same dodecahedron as 5³). Signature is therefore geometric
(V, E, F, face types, density, ρ) with the word deliberately excluded.

Independent geometric check on the three 12-vertex star solids: each developed vertex set is the
icosahedron's, up to rotation (pairwise-distance multiset identical), and the face censuses are
20 {3} for the great icosahedron, 12 {5} for the great dodecahedron and 12 {5/2} for the small
stellated dodecahedron. Those match the hand analysis done before any code was touched.

Completeness of T2 against the literature: the uniform star polyhedra whose faces all lie in
{3, 5, 5/2} with at most six faces per vertex and no retrograde face are the four Kepler–Poinsot,
U30, U32, U36, U40, U47, U54, U57, one of the two density-37 snubs (U69/U74 share V/E/F and are not
separated by this signature), and the pentagrammic antiprism. That is 13, and 13 is what came out.

## T3 — `star-wide`, the cost of breadth

Tiles {3,4,5,6,8,10,5/2,8/3,10/3}, maxDensity 3, maxValence 6.

- alphabet: **58,682 entries** against 176 for `star-ico` and 125 for the convex `spherical` palette.
  maxDensity 2 gives 57,304, so the blowup is the tile count and the valence, not the density cap.
- solve: 6m41s at k=1 (the convex palette is under a second).
- prune: **15,936 blocks** kept at k=1, against 28 convex.
- develop: running.

The prediction that a density closure inherits the hyperbolic cost profile is confirmed: the angle
bound that made `positive-defect` cheap is gone, and only maxValence bounds the words.

Develop: 221s, **59 distinct solids — 28 convex and 31 star**. The 28 convex are exactly the T0
baseline, which is the regression that matters: turning on the star machinery neither lost nor
invented a convex solid.

Split of the 31 star solids by which change each one actually needed:

- **29 need only changes 1–4.** The closure rule is untouched; their planar angle sums are all under a
  full turn, from 108° (great stellated dodecahedron) to 336°. This is the headline: most of the star
  space was already inside the existing spherical closure and was being missed only because the tile
  alphabet had no self-intersecting face.
- **2 need change 5**, the density closure: the great dodecahedron (540°) and the great ditrigonal
  icosidodecahedron U47 (504°).

Identified against the literature, all matching on V, E, F and face composition: the four
Kepler–Poinsot, U30, U31, U32, U36, U37, U38, U40, U42, U43, U45, U47, U54, U55, U57, U58, U66, U68,
U14, U16, U19, one density-37 snub, and six star prisms/antiprisms.

## T4 — the third category: face ORIENTATION, not a new tile

The wide run rejected `3.8.4.8`, which is the small cubicuboctahedron U13 and a perfectly good uniform
polyhedron with all edges equal. The word is enumerated; the develop says "no spherical vertex figure"
at every density. The reason is not the alphabet.

Through n equally spaced points at edge arc ρ there are TWO regular spherical n-gons, the one at
circumradius r = asin(s) and its complement at π − r, with interior angles summing to 2π. The
developer only ever built the small one. A direct scan over per-face orientation closes U13 at
ρ = 41.882° with vertex density 2 and three complementary faces, and 41.882° is exactly the
rhombicuboctahedron's edge arc in the T0 baseline, which is U13's convex hull. That is the standard
retrograde notation ({8/5} for {8/3}) and it is invisible to the combinatorial search: the word is
identical either way.

Implemented as a per-face-type orientation subset in `develop_block`, tried alongside the density.
On `star-ico-d` that lifts 13 star solids to 18, adding the pentagrammic crossed antiprism, the snub
icosidodecadodecahedron U46 (D=4), the inverted snub dodecadodecahedron U60 (D=9), and a second
density-37 record at a different ρ, which is the U69/U74 pair that V/E/F alone cannot separate.

One convention bug found by this: a retrograde face is the small polygon traversed BACKWARDS, so it
subtracts covering. Taking the complement's positive area instead overstates the density by exactly
one per retrograde face. U46 read as density 28 before the fix and 4 after; U60 as 33 and then 9.

## Independent audit: vertex-transitivity

The developer only inherits the k=1 the SOLVER asserted, which is combinatorial. Measuring the
isometry group on the developed geometry is the J27/J37 lesson from this repo, and it is what can
reject a figure whose area happens to land on a multiple of 4π without being uniform. All 25
`star-ico-d` records pass with one vertex orbit and the expected group orders: 24 for the tetrahedral,
48 octahedral, 120 icosahedral, 60 for the chiral snubs, 20 for the pentagonal antiprisms.

## What is still out of reach

The hemipolyhedra. The tetrahemihexahedron closes at ρ = 90° where its square faces are exactly
hemispheres (interior angle π, circumradius π/2), which is the boundary of the developer's
parameterisation and the point where density stops being defined. That is a separate edge case from
retrograde orientation and is not addressed here.

## T5 — k=2 scouting run (`star-ico-d`, 3 tiles)

Measured, not estimated:

| | k=1 | k=2 |
|---|---|---|
| raw solver blocks | 30 | 9,326 |
| pruned blocks | 50 | 3,636 |
| solve wall time | <1s | 1s |
| develop wall time | <1s | 12s |
| distinct realized | 25 | **1** |

The one k=2 star tiling is `5/2.3.3 + 3.3.3.3.3`, density 2, V=6 E=10 F=6, five triangles and one
pentagram, ρ=116.57°. That is the pentagrammic pyramid: apex 3⁵, five base vertices 5/2.3.3. A real
object and the star analogue of a Johnson pyramid, so the k≥2 machinery works. But the yield is
**1 in 3,636**, 0.03%.

The filter doing the killing is `solve_rho_common`: at k>1 every orbit must close at the SAME edge arc,
and two different vertex words generically do not. That is geometry, not a tuning knob.

Cost model for `star-wide` at k=2, from these numbers: blocks scale ×73 per k on this palette, so
15,936 → ~1.2M, and the develop is ~3× heavier per block (9 per-orbit density tuples against 3). At the
measured wide-palette k=1 rate that is on the order of **40 hours of develop** for an expected yield in
the low tens. Not worth running as it stands.

Where the cost actually is, checked rather than assumed: 3,636 blocks carry 1,083 distinct config
PAIRS, about 3.4 blocks per pair, and `solve_rho` is already memoized on (config, density, retro). So
hoisting the ρ test to the pair level buys roughly 3×, not the orders of magnitude I expected. The
dominant term is simply the block count, which is a property of the search and not of the developer.

## Prerequisites completed alongside

- **Per-orbit vertex densities.** `develop_block` looped a single `dens` across all orbits, which at
  k>1 can only find tilings whose orbits happen to wind identically. Now iterates
  `product(1..MAXDENS, repeat=k)`, ordered by total winding. At k=1 the tuples are (1,), (2,), (3,) so
  the shipped catalogue is unchanged, and `make check-star` proves it.
- **`make check-star`.** Two independent claims: re-derive the small palette end to end and diff an
  INVARIANT digest (word, density, V/E/F, face census, ρ to 9dp) against `golden/star-ico-d-k1.txt`,
  and hash-check the 46 shipped shards against `golden/star-k1.sha256`. Hashing the cells JSON would be
  useless as a gate — it is floats, and a bisection reorder rewrites every byte without changing a fact.
  The wide palette is deliberately excluded: ~20 minutes, and it exercises no code path the small one misses.
