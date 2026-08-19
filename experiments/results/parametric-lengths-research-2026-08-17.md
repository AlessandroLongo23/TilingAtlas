# Parametric edge lengths — literature sweep and the sliding-strip enumerator

2026-08-17. Triggered by AL's correction: I had claimed "the triangular grid can never be parametric".

## The claim I got wrong

What I proved: an EQUIANGULAR triangle (all three corners pinned at 60 deg) with symbolic sides has
zero freedom. Σ ℓ_k·d_k = 0 with the three directions 120 deg apart forces ℓ0 = ℓ1 = ℓ2. That stands.

What I said: the triangular grid can never be parametric. False. AL's counterexample — scale one axis
— produces isosceles triangles with two distinct edge lengths. It escapes the equiangular class
because it MOVES THE ANGLES, which is exactly the freedom my condition C1 forbade. I reported the size
of my own cage as the size of the space.

The second, larger error: I enumerated equiangular VERTEX configurations on the 30 deg grid, got 14
multisets with only 3 carrying a T-junction (3.6.T, 4.4.T, 3.3.3.T), and treated that as a bound on
the number of tilings. It bounds nothing. Each of those vertex types generates a CONTINUOUS family,
and the families compose. 3.3.3.T and 4.4.T turn out to be Wikipedia's non-edge-to-edge families 3
and 1-2 respectively, and 3.6.T is family 6.

## What the literature says

### The seven isogonal non-edge-to-edge families (Wikipedia, sourced to Grünbaum–Shephard)

> "There are seven families of isogonal figures, each family having a real-valued parameter determining
> the overlap between sides of adjacent tiles or the ratio between the edge lengths of different tiles."

Verbatim from the article's wikitext table "Periodic isogonal tilings by non-edge-to-edge convex
regular polygons":

| # | Family | Symmetry | Topologically identical to |
|---|--------|----------|----------------------------|
| 1 | Rows of squares with horizontal offsets | cmm (2*22) | hexagonal tiling |
| 2 | Rows of squares with horizontal offsets | p2 (2222) | hexagonal tiling |
| 3 | Rows of triangles with horizontal offsets | cmm (2*22) | square tiling |
| 4 | A tiling by squares (Pythagorean) | p4m (*442) | truncated square tiling |
| 5 | Three hexagons surround each triangle | p6 (632) | truncated hexagonal tiling |
| 6 | Six triangles surround every hexagon | p6 (632) | hexagonal tiling |
| 7 | Three size triangles | p3 (333) | trihexagonal tiling |

Families 5, 6, 7 are the "triangles and hexagons together" cases AL asked about. Note 6 has vertex
3.6.T = (60, 120, 180), which is precisely one of the three T-junction configurations I found and then
dismissed.

### The space is uncountable, not finite

> "One can slide any of the rows in a regular tiling by unit squares with respect to the rest for any
> real number between 0 and 1/2 to obtain a distinct tiling by squares."

and the mechanism, stated generally: triangles and squares have strips that can slide in one
direction; hexagons are fixed and unable to slide (their strip boundary is a zigzag, not a line).

### Isohedral parameterisation is the same idea, already industrialised

Craig Kaplan's Tactile (isohedral.ca/software/tactile, github.com/isohedral/tactile-js) carries all 93
Grünbaum–Shephard isohedral types, each with "a small set of real-valued parameters that control the
positions of the prototile's tiling vertices... Some tiling types have zero parameters; others have as
many as six free parameters." Same structure as `LengthFamilyData`: constraints encoded as a small
real vector, sliders over it. Worth mining as a corpus — Kaplan is a collaborator.

### Corpus lead

Brian Wichmann's tiling database, now hosted by MIT Libraries (tilingsearch.mit.edu, formerly
tilingsearch.org). Indexes G&S figures directly, including 2.5.4 "uniform tilings with corners which
are not vertices" (i.e. T-junctions) and 2.5.5 "uniform tilings with star polygons which are not
edge-to-edge".

## What I built: the sliding-strip enumerator

`stripFamily(word)` in `lib/tilings/length-families.ts`.

The mechanism, stated so it is checkable: a strip of regular polygons bounded above and below by two
parallel straight lines can be slid along its axis by any real amount and still meet its neighbours,
because a straight line has no features to align to. Every interface is one free real parameter.

Over {3, 4} at unit edge there are exactly two such strips, and both have horizontal period 1, which
is what lets any word stack:

- `S` — a row of unit squares, height 1
- `T` — a row of alternating up/down triangles, height sqrt(3)/2

For a word of length m the family has m parameters, d_1..d_m, one shift per interface (d_m is the
shift onto the next period). None is removable: a shear would remove one, but a shear turns squares
into rhombi and equilateral triangles into scalene ones, leaving the class. This is the difference
between these families and `plen-rect`, which IS affinely trivial.

Cell: the strips' contents, strip k translated by (d_1 + ... + d_k, y_k).
Lattice: T1 = (1, 0), T2 = (d_1 + ... + d_m, H) with H the total height.
Area identity: |det| = H = sum of strip heights = cell area. Verified in the test.

### Enumeration

Binary words over {S, T} of length 1..4, quotiented by cyclic rotation (which strip you call first) and
reversal (flipping the stack): **15 families, 40 sliders total.**

    s  t  ss  st  tt  sss  sst  stt  ttt  ssss  ssst  sstt  stst  sttt  tttt

`s` reproduces Wikipedia families 1-2 (brick; cmm at shift 1/2, p2 generically).
`t` reproduces family 3.
`st` contains the elongated triangular tiling 3.3.3.4.4 at the aligned setting and leaves it at every
other one.

### Verification

`lib/tilings/length-families.test.ts`, 12 tests, all passing. The load-bearing one samples 40 points
per member and counts covering multiplicity over a lattice patch: exactly 1 is a tiling, 0 is a gap, 2
is an overlap. Shifts swept over {0, 0.137, 0.5, 0.813, 1} with each interface varied independently,
so a four-deep stack is not tested only on its diagonal. 0 and 1 both included: they are the same
tiling by one lattice vector and both must pass.

Patch radius is computed from the lattice's narrowest WIDTH (det / longest vector), not from vector
norms — a stack four deep has strongly unequal basis vectors and a norm-based radius reports phantom
gaps. That bug bit twice already.

## Shipped

18 entries under Euclidean > Tilings > Different edge lengths > Parametric edge lengths, in both
/library and /play, verified by screenshot at `plen-strip-sstt` with all four sliders driven to
distinct values (0.13, 0.61, 0.29, 0.84).

Strip families opt out of the size-based hue (`lengths.sizeHue: false`) because every tile in them has
unit edge — a size ramp would paint squares and triangles identically and hide the only distinction
that matters. Families that do vary in size (Pythagorean, equiangular hexagon) keep it.

## Not built

Families 5, 6, 7 are gyrations: hexagons or triangles rotate about their centres, so vertex positions
move as cos/sin of the rotation and are NOT linear in any length. The `lengths` format is linear by
construction and cannot express them. The Atlas already has the machinery that can — the angle-
parametric path, where `cellPolygons` are Laurent polynomials in e^{i·delta}. These three belong there,
not here. Deriving the closure relation for each is the next piece of work.

---

# 2026-08-18 — two corrections from AL, and the shutter

## 1. k was hard-coded, and it was wrong

`lengthFamilyRows()` set `k: 1` for every family. AL: offset two strips by different amounts and the
vertices on one interface can no longer be carried onto those on another, so the orbit count is not 1.
Correct, and the fix is to measure it.

`lib/tilings/vertex-orbits.ts` computes the full symmetry group and then the orbits. A periodic
tiling's symmetries carry the vertex set to itself, so every symmetry sends a fixed vertex v0 to SOME
vertex w; enumerating (linear part L, target w) and setting the translation to w - L*v0 enumerates the
whole group with no candidate missed. Tiles are matched by a canonical key (shape, centroid mod
lattice). Orbits are the union-find closure.

Calibration against tilings whose groups are published, all exact:

| tiling | k | |G| mod translations | expected |
|---|---|---|---|
| square grid | 1 | 8 | p4m |
| triangular grid | 1 | 12 | p6m |
| regular hexagonal | 1 | 12 | p6m |
| rows of squares, generic offset | 1 | 2 | p2, isogonal (Wikipedia 2) |
| rows of triangles, generic offset | 1 | 2 | cmm, isogonal (Wikipedia 3) |
| Pythagorean | 1 | 4 | p4m, isogonal (Wikipedia 4) |

One bug found and fixed on the way: a rotated coordinate of -1e-17 keys as "-0.00000" and never matches
the "0.00000" it equals, so every rotation was rejected and the REGULAR HEXAGONAL TILING reported k = 2
with a trivial symmetry group. Negative zero, collapsed at the rounding step.

Measured k for the stacks (generic point of the box):

    s 1   t 1   ss 2   tt 2   st 4   sss/sst/stt/ttt 6   all four-deep 8
    rr 4  rt 4  rrr/rrt/rtt 6

k is a property of a POINT in the parameter box, not of the family. ST is 4 generically and 3 at all
shifts 1/2; STST is 8 generically and 3 at all shifts 1/2. Family defaults were moved off 1/2 to
generic values (0.37, 0.61, 0.23, 0.79) so that the thumbnail agrees with the shelf it is filed under.

## 2. Every edge was length 1

Also correct: a stack of unit squares and unit triangles has one edge length, so its sliders only ever
translate strips. They never exercised the length machinery.

Added a RECTANGLE strip: a row of 1 x h rectangles, width 1 so it still stacks, height h a free
slider. A rectangle is an equiangular quadrilateral — the tile kind the closure argument is built on —
so its two edge lengths are independent. Stacked against rigid unit triangles the ratio is a genuine
parameter, not a change of scale. Words over {R, T} of length 2-3 containing at least one R, modulo
rotation and reflection: **rr, rrr, rrt, rt, rtt** — 5 families, 22 sliders, of which 8 are heights.
Swept over an 8x height ratio in the covering test.

## 3. The shutter — AL's construction, and my "gyration" claim was wrong

AL: take the triangular grid and open a regular hexagon at every third vertex, like a camera shutter.
Triangles stay rigid at unit edge; the hexagon side g is the parameter. This is Wikipedia's
non-edge-to-edge family 6, "six triangles surround every hexagon", p6.

I had written families 5-7 off as gyrations — vertices moving as cos/sin of a rotation angle, hence
outside a format linear in lengths. That was a bad parameterisation, not a fact. Drive it by the
HEXAGON SIDE instead of the rotation angle and every coordinate is affine-linear in g.

Hexagon H at the origin, side g, vertices v_k = g*(cos 60k, sin 60k). Each hexagon side is the first g
of a unit triangle's side; the remaining 1-g abuts another triangle, the same way round every triangle
by its own 3-fold symmetry. Per period: 1 hexagon, 2 triangles, 6 hexagon-triangle edges, 3
triangle-triangle edges, 6 vertices all of type 3.6.T (60 + 120 + 180). Neighbouring hexagon centres:

    C1 = g*(3/2,  sqrt3/2) + (-1/2, sqrt3/2)
    C2 = g*(3/2, -sqrt3/2) + ( 1/2, sqrt3/2)
    |C1|^2 = |C2|^2 = 3g^2 + 1        C1.C2 = (3g^2 + 1)/2   =>   cos = 1/2 EXACTLY, for every g

So closure is identical, not conditional: the centres form a triangular lattice at every aperture, the
same way the equiangular hexagon's opposite edges cancel identically. Cell area confirms:
(3sqrt3/2)g^2 + 2*(sqrt3/4) = (sqrt3/2)(3g^2 + 1) = |C1 x C2|.

g -> 0 shuts the aperture to the triangular tiling; g = 1 opens it to the trihexagonal tiling 3.6.3.6
(cell area 2sqrt3, verified); everything strictly between is non-edge-to-edge. Measured k = 1, matching
the literature's claim that family 6 is isogonal. This is the first family here with two DIFFERENT
regular polygons whose size ratio is the slider — the triangle-hexagon analogue of the Pythagorean
tiling, which is exactly how AL described it.

## State

24 parametric families in both /library and /play, spread across k = 1 (6), 2 (2), 4 (3), 6 (7), 8 (6).
22 tests green, build clean. Screenshots verified for plen-strip-sstt (4 shift sliders),
plen-strip-rrt (2 height + 3 shift sliders, k = 6) and plen-tri-hex-shutter (k = 1).

Still not built: families 5 (three hexagons around each triangle) and 7 (three size triangles). Given
that family 6 turned out linear under the right parameterisation, the "these are gyrations" excuse no
longer covers them and they should be attempted the same way.

## 4. Families 5 and 7 — the last two, same method

Both linear once parameterised by a LENGTH instead of a rotation angle, exactly as the shutter was.

### Family 5, the rotor: "three hexagons surround each triangle", p6

The dual of the shutter. The shutter opens hexagonal gaps between rigid triangles; the rotor opens
TRIANGULAR gaps between rigid hexagons, and the subdivided face swaps over — here the hexagon carries
6 corners plus 6 T-junctions (12 topological corners, hence "topologically the truncated hexagonal
tiling") and the triangles are plain.

Hexagon side 1, vertices w_k = omega^k on the unit circle; triangle side t; each hexagon side splits t
against a triangle and 1-t against another hexagon. The triangle at corner w_k is

    [ w_k,  w_k + t*omega^{k+2},  w_k + t*omega^{k+1} ]

the second vertex being the split point ON the hexagon's own edge and the third lying along the
NEIGHBOURING hexagon's edge, which runs straight through w_k — that flat is the 180 of the 3.6.T vertex.
Matching the 1-t pieces forces the neighbour centre to L_0 = (1 + omega) + t(omega - 1), and L_1 comes
out as literally omega*L_0, so the centres are a triangular lattice at every t with nothing to check.
|L_0|^2 = 3 + t^2 and the cell area (sqrt3/2)(3+t^2) is one unit hexagon plus two triangles of side t.

t -> 0 gives the hexagonal tiling, t = 1 the trihexagonal. So the shutter runs triangular ->
trihexagonal and the rotor runs hexagonal -> trihexagonal; they meet at 3.6.3.6.

### Family 7, three size triangles, p3

Every face is an equilateral triangle. The counting fixes the shape before any geometry: the big
triangle is the topological hexagon (3 corners + 3 T-junctions), so its 6 side-pieces must match the 6
sides of the two small triangles, forcing each big side to split into b + c with b, c the small sides
and a = b + c. Every vertex is 3.3.3.T with one corner of each size plus a flat, which is the name.

For the lattice: at the origin the big triangle has a corner and the b-triangle has a corner, so some
other big triangle must supply the flat; the only side-line of the right direction is [a, a*zeta], and
the origin must land on ITS split point. That gives the translation -(a + b(zeta-1)) = -(c + b*zeta),
so L1 = c + b*zeta and L2 = e^{i120}L1 = (-b - c/2, (sqrt3/2)c), with |L1|^2 = b^2 + bc + c^2. Cell area
(sqrt3/2)(b^2+bc+c^2) equals (sqrt3/4)((b+c)^2 + b^2 + c^2) identically.

### All seven now present

    1, 2  rows of squares, offsets        plen-strip-s          (cmm at 1/2, p2 generic)
    3     rows of triangles, offsets      plen-strip-t          (cmm)
    4     Pythagorean, two squares        plen-pythagorean      (p4m)
    5     three hexagons per triangle     plen-hex-rotor        (p6)
    6     six triangles per hexagon       plen-tri-hex-shutter  (p6)
    7     three size triangles            plen-tri-three-size   (p3)

Families 4, 5, 6, 7 all measure k = 1, agreeing with the literature calling them isogonal, and that
agreement was not put in by hand — vertexOrbits computes it from the geometry.

26 parametric families, k = 1 (8), 2 (2), 4 (3), 6 (7), 8 (6). 24 tests green.

---

# 2026-08-18b — completeness at level k WITHOUT an oracle

AL's objection: at k = 1 there is a published list of seven families to check against; at k >= 2 there
is nothing, so "we matched the literature" stops being available and we are working blind. What has to
replace the oracle is an ARGUMENT. Here it is, in four stages, with the third one now executable.

## Stage 1 — the vertex alphabet is finite

Every non-edge-to-edge tiling is an edge-to-edge MAP once each T-junction is promoted to a vertex. The
only way it differs from an ordinary edge-to-edge tiling is that some corner of some face is FLAT.

A vertex carries at most ONE flat: two flats already sum to 360 leaving nothing, and a point that is
straight on both sides is interior to an edge, not a vertex at all. So valence <= 1 + 180/60 = 4 at a
flat vertex and <= 6 otherwise. Given a declared palette with corner-angle set A, the vertex types are
the cyclic words over A + {180} summing to 360 with at most one flat and length <= 6. Finite, and
computable from the palette — which is already how the Ctrnact engine is organised.

This is the stage my earlier "14 equiangular vertex configurations" enumeration was groping at. It was
not wrong as an alphabet; it was wrong as a bound on the number of TILINGS.

## Stage 2 — the combinatorial search is finite, bounded explicitly by k

A tiling with finitely many vertex orbits has its symmetry group acting cocompactly, hence
crystallographic by Bieberbach, hence the tiling is PERIODIC. (This is also why an incommensurate
strip stack is not a counterexample: it has infinitely many vertex orbits, k = infinity, and falls
outside the claim rather than refuting it.)

A wallpaper point group has order <= 12, so k orbits give at most 12k vertices per translational
period; valence <= 6 gives E <= 36k; Euler on the torus V - E + F = 0 gives F <= 24k. Every count is
bounded by an explicit function of k, so there are finitely many maps to search. This is the stage the
STS engine performs, and the stage Delaney-Dress symbols formalise: two periodic tilings are
equivariantly equivalent iff their D-symbols are isomorphic, and D-symbols of bounded size can be
enumerated systematically (Delgado-Friedrichs and Huson, who classified the 1270 proper 2-isohedral
types by exactly this route; Tegula is the current software).

## Stage 3 — geometric realization is a decidable linear problem (implemented)

The map fixes every ANGLE, therefore every edge DIRECTION. Only the lengths are unknown.

  - one variable l_e > 0 per edge orbit (<= 36k of them);
  - each face must close: sum of l_e * d_e = 0 around its boundary, two real equations, LINEAR;
  - each tile the palette declares regular adds equalities between its geometric SIDES, a side being a
    maximal collinear run of map edges — which is precisely what a T-junction subdivides.

So the realizable assignments are ker(A) intersect {l > 0}: a relatively open convex polyhedral cone.
Nonempty iff a linear program is feasible, decidable exactly in rational arithmetic. Its dimension
minus one (for scale) is the family's parameter count. Each surviving map yields exactly ONE family,
and that family's dimension is computed rather than guessed.

**This resolves the uncountability worry.** There are uncountably many tilings at each k but only
FINITELY many families, because stage 2 is finite and stage 3 turns each surviving map into one cone.
"Enumerate everything at level k" is a coherent goal precisely at the level of families.

## Stage 4 — soundness

If every face closes as a convex polygon with positive sides and every vertex angle sums to exactly
2*pi, the quotient torus carries a flat metric with no cone points, so the developing map to the plane
is a covering and hence a bijection: a genuine tiling, no gaps and no overlaps. Convexity is what buys
embeddedness of each face. The argument does NOT extend to self-intersecting star tiles — the same
boundary Marek Ctrnact identified for STS, and it shows up here for the same reason.

## What was implemented and what it found

`lib/tilings/length-system.ts` executes stage 3 in reverse as a check: it takes a RENDERED cell, knows
nothing about how the family was authored, recovers the map (promoting T-junctions by finding vertices
strictly inside tile sides), and rebuilds the linear system from the combinatorics.

Result over all 26 shipped families: **26 of 26 agree.** The parameter count derived from the map
equals the authored slider count (minus one where scaling every slider scales the tiling) in every
case, from `plen-rect` at 1 to `plen-strip-rrr` at 6.

Two findings on the way, both of the same kind — a quantity read at a symmetric point is not the
quantity of the family:

  1. **Tile regularity must be read at a GENERIC point.** At A = B = C the equiangular hexagon IS
     regular, so detecting "regular" there imposes all-sides-equal and reports the family as rigid.
     Same for the rectangle grid at A = B. This is the exact analogue of measuring k at all-shifts-1/2.
  2. **Euler is the genericity test.** Four strip stacks initially disagreed; every one had V - E + F
     != 0, meaning the sampled point had collided two vertices. Requiring chi = 0 before trusting a
     sample fixed all four. A degenerate sample announces itself rather than lying.

## The independent check that is not circular

Wikipedia's table names, for each of the seven families, the edge-to-edge tiling it is TOPOLOGICALLY
identical to. That fixes V : E : F per period with no reference to geometry, so it is a prediction the
construction cannot fake. Measured:

    family 1-2  rows of squares       V,E,F = 2,3,1   hexagonal tiling, 3-valent
    family 3    rows of triangles     V,E,F = 2,4,2   square tiling, 4-valent
    family 4    Pythagorean           V,E,F = 4,6,2   truncated square tiling
    family 5    rotor                 V,E,F = 6,9,3   truncated hexagonal tiling
    family 6    shutter               V,E,F = 6,9,3   hexagonal tiling, 3-valent
    family 7    three size triangles  V,E,F = 3,6,3   trihexagonal tiling, 4-valent

All six match, and all six come out as ONE-parameter families, which is what "seven families, each
with a real-valued parameter" asserts. The seven families have therefore changed role: they are no
longer the source of truth, they are the REGRESSION TEST for machinery whose correctness rests on the
argument above.

## What is still missing before the claim is airtight

  1. **Stage 2 is asserted for STS, not proved here.** The bounds V <= 12k, E <= 36k, F <= 24k are
     correct, but that STS's dual-search visits every map within them is a property of the engine that
     needs its own statement. The `make check-regular` byte-identity guard is evidence, not a proof.
  2. **The flat corner is not yet in the palette.** `gen_alphabet.py` has no 180 corner, so the engine
     cannot currently emit a T-junction at all. Stage 1 says exactly what to add.
  3. **Exact arithmetic.** The rank is computed in floats with a 1e-9 pivot threshold. The realizability
     decision should be a rational LP; the directions live in Z[zeta_24], so this is available.
  4. **Family deduplication.** Two different maps can give similar or affinely equivalent tilings. A
     canonical form for families (not just for maps) is needed before a count at level k means anything.
  5. **Convexity is load-bearing** (stage 4). Any extension to star tiles loses the soundness argument.

---

# 2026-08-18c — the enumerator, built and shipped

Stages 1-3 are now executable end to end in `lib/tilings/enumerate-families.ts`, driven by
`scripts/enum-families.ts`, with the result committed as `lib/tilings/enumerated-families.generated.ts`
and shipped to the Atlas as 7 families with ids `plen-enum-01..07`.

## What it does

STAGE 1 `vertexTypes` — cyclic words over the palette's corner angles plus the flat 180, summing to
360, at most one flat, valence 3..6. For {3, 4, 6}: **15 types**, including the three that carry a
T-junction (90.90.180, 60.60.60.180, 60.120.180).

STAGE 2 `matchings` — torus maps as a rotation system (each vertex's darts spaced by its angle word)
plus a perfect dart matching. Faces are the orbits of sigma . alpha. Pruned on PARTIAL face words: the
first non-flat corner determines n, so a second distinct corner angle, or an (n+1)-th real corner, kills
the branch immediately. Euler on the torus is checked at the end.

STAGE 3 `realize` — directions are forced by the angles (one BFS, conflicts reject the map); the length
system is face closure plus regular-tile side equalities; the cone is ker(A) intersect {l > 0}.

## Two exact bounds that were not in the write-up, and one that was wrong

1. **maxFlats <= V is a theorem, not a knob.** Each vertex carries at most one flat and each flat
   belongs to exactly one face, so the flats on any single face are at most V per period. This is now
   applied automatically per level and it prunes hard.
2. **Vertex-type assignments are MULTISETS.** Vertex labels are arbitrary, so generating ordered tuples
   costs |types|^V where multisets cost C(|types|+V-1, V) — a 16x factor at V = 4, pure waste.
3. **PRIMITIVITY had to be added.** Without it the square grid is reported once at V = 1, again at V = 2
   and again at V = 3. A cell is primitive iff no translation by a difference of tile centroids, other
   than a lattice vector, preserves the tiling. This cut 18 "families" to 14 at V <= 3.

## Result at V <= 3, palette {3, 4, 6}

**7 parametric families**, each with exactly one essential parameter, in 1.0s. (7 rigid tilings are
also found and correctly NOT emitted as families — the square, triangular, hexagonal, elongated
triangular, trihexagonal and snub square tilings have a 1-dimensional cone, which is scale alone.)

| V | E | F | tiles | note |
|---|---|---|-------|------|
| 2 | 3 | 1 | 4 | = plen-strip-s, offset rows of squares (Wikipedia 1-2) |
| 2 | 4 | 2 | 3, 3 | = plen-strip-t, offset rows of triangles (Wikipedia 3) |
| 3 | 5 | 2 | 4, 4 | NEW here |
| 3 | 5 | 2 | 4, 4 | NEW here, a different map with the same counts |
| 3 | 6 | 3 | 3, 3, 4 | NEW here |
| 3 | 6 | 3 | 3, 3, 3 | = plen-tri-three-size (Wikipedia 7) |
| 3 | 7 | 4 | 3, 3, 3, 3 | NEW here |

**Three of the seven are rediscoveries of families that were built by hand, and the search was told
nothing about them.** That is the check working: the same map counts come out of a blind sweep.

## The slider range is exact

Edge e has length K0[e] + t*K1[e], so the valid interval is an intersection of half-lines, computed
rather than chosen. Tested: the minimum edge length is strictly positive throughout the interior,
reaches zero at each finite endpoint, and goes negative just outside.

A caveat found while testing, worth keeping: past an endpoint the TILING often still exists — for the
brick, sliding the shift past 1 is the same tiling with the pieces relabelled. The interval bounds this
MAP, not the plane.

## Bugs found, all mine

1. **The wrap-around side was not merged.** If a face's last corner is flat, its first dart continues
   the side the last dart started; treating them as two sides splits one tile side in half and
   over-constrains a regular tile into rigidity. This made the BRICK report an empty kernel — the
   simplest non-edge-to-edge tiling there is, missing from the first working sweep.
2. **Lattice vectors were chosen by length.** Sorting by length can pick different discrepancies at the
   two sample points used for the affine fit, silently corrupting it. Now chosen by index, with the
   Gauss reduction recorded as integer steps at one sample and replayed at the other.
3. **T-junctions were emitted as polygon vertices.** `lengthSystem` recovers them by finding vertices
   inside a side, so leaving them in the tile outline double-counts them and reports a square with two
   subdivided sides as a rigid hexagon. Cell polygons now carry real corners only.

## Verification

34 tests green across the three files. The load-bearing one is covering multiplicity over every
enumerated family at three slider positions each: exactly one tile covers each sample, so the search's
output genuinely tiles and is not merely linear-algebraically consistent. `lengthSystem` independently
re-derives the parameter count for all 33 shipped families from their combinatorics — 33 of 33 agree.
Build clean. Verified on /play at `plen-enum-03` (k=2, two squares) and `plen-enum-05` (k=3, squares
and triangles with offset rows).

## Still open

  - **V = 4 is running and has not finished.** V <= 3 takes 1.0s; V = 4 has been going for minutes. The
    dart matching needs isomorphism rejection during the search, not just at the end, before V >= 5 is
    reachable — and the shutter and rotor live at V = 6, so the sweep cannot yet reach two of the seven
    published families.
  - The positive-point test is a projection plus randomised search, not a rational LP. False negatives
    only, since an accepted family carries the explicit vector that is then laid out and checked.
  - Only cones of dimension 2 are emitted. Higher-dimensional cones are real families and are rejected
    with a reason rather than silently dropped; the interval slider cannot describe them.
  - Family deduplication is by map signature, so two different maps giving similar or affinely
    equivalent tilings would both ship. `plen-enum-03` and `plen-enum-04` have identical counts and may
    be such a pair.

---

# 2026-08-18d — the five optimizations, after checking what already existed

AL stopped me before I applied them and asked whether the code already existed. It did. Four of the five
are already in the engine, and one of my numbers from the previous turn was measuring the wrong thing.

| asked for | status |
|---|---|
| check directions during the search | the C++ search is combinatorial by design; angle closure is checked at every vertex as it goes |
| break the symmetry | `eu_solver.cpp:125` min-type-root: `extend()` never adds a type below `vertype[0]` |
| use face count | solver-side non-issue; it was an artifact of my TS rewrite |
| stop allocating | solver reuses `std::vector` members across the search; also my rewrite's problem, not the engine's |
| run it in parallel | `run-oracle-parallel.sh` — depth-1 AND depth-2 sharding, measured ceilings (N=64 D2=8 → 5.80x), documented acceptance gate |

And **isomorph-free generation was already priced**, `eu_solver.cpp:925` and `:1664`, on 2026-08-07, with
instrumentation (`simplify_calls`, `simplify_true`, `EU_DOUBLE_SIMPLIFY=1` for a clean per-call cost). It
contains the correction to my own analysis in writing: *"canonical augmentation pays a canonicity test at
every NODE, so the break-even is a ratio of per-node costs, not of leaf counts."* My "189x duplicated
work" was a leaf ratio — the exact metric that note calls wrong — and it conflated real isomorph
duplication with rigid tilings being legitimately rediscovered and with maps dying on geometry. The
honest figure already recorded there is raw/kept = 3.84x at k=8.

I also had a fact wrong last session: I said `gen_alphabet.py` has no 180-degree corner so the engine
cannot emit a T-junction. It does — `polyomino_angle_word` maps 90 -> D/4, **180 -> D/2**, 270 -> 3D/4,
used by the tetromino, tetromino-free, fdsq and fdhex palettes. Flat corners have been in the alphabet all
along.

## What was actually missing, and is now built

`build_map` pairs darts by edge MIDPOINT, so a side a neighbour meets part-way along has no partner and
the map is refused — "not edge-to-edge here; caller decides what that means". That single line was the
reason the whole Python toolchain could not see this shelf.

**`tiling_key.refine(polys, basis)`** — promotes every T-junction to a vertex. The outline is unchanged,
only the vertex list grows. Idempotent on edge-to-edge cells. With it, `build_map`, `orbit_count`,
`corner_angles` and everything downstream work on non-edge-to-edge cells unaltered.

**`length_family.py`** — the counterpart to `intrinsic_freedom.py`, and the pair is the whole picture:

    intrinsic_freedom   one ANGLE per dart, edges pinned at 1. Closure is NONLINEAR, so the answer is
                        the LOCAL dimension at the tiling in hand. "How far can it bend?"
    length_family       one LENGTH per edge, angles pinned. The angles fix every direction, so closure
                        is LINEAR and the answer is GLOBAL: ker(A) ∩ {l > 0}. "How far can it stretch?"

**`emit_length_meta.py`** — runs both `vertex_orbits.orbit_count` and `length_family.freedom` over every
shipped family and writes `lib/tilings/length-meta.generated.ts`. k is measured at the DEFAULTS (the
member the card draws); params at a GENERIC point (regularity read at a symmetric member reports a
3-parameter family as rigid).

## Deleted, as duplicates of the above

  - `lib/tilings/vertex-orbits.ts`   — re-implementation of `vertex_orbits.py`
  - `lib/tilings/length-system.ts`   — re-implementation of this directory's map machinery
  - `lib/tilings/length-system.test.ts`

## Results

46/46 families agree between the Python length system and the TypeScript slider counts. Two bugs found by
the move, both in the TypeScript that is now gone:

  1. The scale heuristic checked only `basis[0]`. A family whose first lattice vector happens to be
     proportional to t while the rest of the cell is not read as pure scale, and its one parameter was
     discounted away — that is what put `plen-enum-13` one below its own map's dimension.
  2. `orbit_count` returns 0 on an unrefined non-edge-to-edge cell (no vertex to walk the figure from),
     which is what `refine` is for.

**Three k values disagreed** between the deleted TS counter and `vertex_orbits.py`: `plen-enum-06` (TS 1,
Python 2), `plen-enum-15` and `plen-enum-17` (TS 2, Python 3). Python is taken as authoritative —
`vertex_orbits.py` exists precisely because the fixed-24-rotation approach the TS copied was found wrong
before, and its docstring records that counter reporting 19 orbits for a 3-tile cell. The three are worth
a look: `plen-enum-06` has the same map counts as `plen-tri-three-size`, which comes out k=1 at ITS
defaults under the SAME Python counter, so the difference is between two members, not two counters.

## ⚑ Not mine, and untouched

`lib/tilings/eu-half.test.ts` fails on two assertions (`hexv k=2` 9 vs 10, `hexv k=5` 125 vs 145). The
cause is `public/reference-atlas-euhalf*.json` and `public/euhalf/manifest.json` being rewritten at 01:59
with fewer records (eager 2661 -> 2561, k5 9357 -> 9207), so they no longer match the counts declared in
the committed `eu-half.ts`. Nothing in my changes reads or writes those files, `pnpm build` only reads
them (`gen-updates-data.ts`), and three commits landed in this repo during the session that I did not make
(`47dd895`, `1a1f5bf`, `d40dc75`) — another session is working here concurrently, on this very topic
(`9b56de1 feat(atlas): tri45 learns the T-junction`). I have NOT restored them: they look like another
session's in-flight work and overwriting them would destroy it. A verified backup of the current state is
at `scratchpad/euhalf-backup/`.

---

# Session 2026-08-18 (later) — the shelf audited, and most of it was one tiling

Run by CC after AL reported that the first two cards on the shelf are the same tiling, both with three
sliders on a rectangle where the first and third move the same width. Both observations hold and both
generalise. Everything below is measured, not argued; the measurements are reproducible from the files
named.

## What was shipped (before)

| quantity | value |
|---|---|
| rows on `el-plen` | 192 |
| of which T-junction (`plen-tj-*`) | 146 |
| T-junction rows byte-identical to another row | **102** (44 distinct symbolic payloads) |
| T-junction rows with more sliders than degrees of freedom | **134 of 146** |
| sliders on the T-junction rows | 1422 |
| records with V − E + F ≠ 0 | 113 of 146 |
| tests passing | 29 |

Slider inflation by shape (claimed → actually independent, measured by the rank of the geometry map
with collinear corners suppressed): 12 → 4 on 24 rows, 13 → 5 on 22 rows, 9 → 3 on 14 rows,
11 → 3 on 8 rows, 10 → 4 on 14 rows.

Congruence collapse of the 146, by three independent invariants, each stronger than the last:
face shapes + reduced lattice → 29 classes; face shapes + vertex stars → 21; face shapes + vertex stars
+ reduced lattice → 34. The canonical angled map (the right notion) gives **21**.

## Root causes

1. **False vertices counted as parameters.** `tiling_key.refine` promotes every point where a side is met
   part-way to a vertex. Where EVERY incident tile runs straight through, that point is a corner of
   nothing and its position is a free relabelling. `plen-tj-…-1-00001`: one face, basis (0, ℓ₁) and
   (ℓ₀+ℓ₂, 0), so ℓ₀ and ℓ₂ enter only as their sum. Fix: `tiling_key.smooth`, run before `refine`.
   Verified a no-op on all 66 shipped cells and idempotent on 60 split cells.
2. **No deduplication at all.** `emit_tjunction_families.py` walked the blocks and appended.
3. **Scale shipped as a slider.** `d` built, `d - 1` printed, on all 146 plus four authored rows.
4. **Everything measured at the developed member**, which is the cone's most symmetric point.

## After

| quantity | before | after |
|---|---|---|
| rows on `el-plen` | 192 | **58** |
| T-junction families | 146 | **21** |
| T-junction sliders | 1422 | **77** |
| rows whose slider count exceeds their freedom | 134 | **0** |
| records with χ ≠ 0 | 113 | **0** |
| tests | 29 | 33 |

Cross-shelf dedup absorbed 9 further rows into 8 survivors: `plen-rect` ← `plen-tj-…-1-00001` (AL's
first card), `plen-strip-rr` ← `plen-tj-…-2-00124`, `plen-strip-s` ← `plen-enum-01`, `plen-strip-t` ←
`plen-enum-02`, `plen-enum-09` ← `-10, -11`, `plen-enum-03` ← `-04`, `plen-enum-14` ← `-15`,
`plen-enum-16` ← `-17`.

## The dedup key took three attempts, and the first two are worth recording

- **map alone** (`tiling_key`): merges the equiangular hexagon grid with the offset rows of squares. Both
  are one face, two vertices, three edges, because a square met part-way along top and bottom is a
  six-cornered face of the map. Dart labels are face SIZE, not angle.
- **map + angles**: still merges rows of unit squares with rows of 1×h rectangles — same map, same
  angles, 2 parameters against 4. The difference is a CONSTRAINT (which tiles are held equilateral) and
  cannot be read off one member's lengths.
- **map + angles + equalities, at a generic member** (`tiling_key.family_key`): correct. Generic matters
  twice over — at every-edge-1 distinct edges coincide AND a primitive cell can look like a supercell, so
  `build_map` folds a 2-parameter family onto a 1-parameter one.

## Verification

- `lib/tilings/length-families.test.ts`: slider count == `LENGTH_META.params`; no two rows share a
  `family_key`; and the rank of the geometry map equals the slider count (this one re-derives the whole
  question in TypeScript and trusts none of the Python). 33 tests, all passing; `pnpm tsc --noEmit` clean.
- `scripts/check-length-sliders.mjs`, rewritten to sweep each slider ALONE: 9 families driven in the real
  browser, every slider moves the tiling. (Its old form screenshotted `canvas.first()`, which on /play is
  a 150 px catalogue thumbnail, so it reported live families as dead; it takes the largest canvas now.)
- Independent JS pass over the emitted bytes: 21 of 21 have rank == slider count and area == |det|.

## Postscript: the search's completeness, once restored, bought a confirmation

Lifting the `ker.length !== 2` rejection takes the V ≤ 4 sweep from 20 families to **25, none rigid**.
All five recovered families are two-parameter, and every one of them keys identically to a strip stack
the hand construction already had — `plen-strip-ss`, `plen-strip-st` and `plen-strip-tt` (which absorbs
three of them). A search that knows nothing about strips rediscovering exactly the two-shift stacks is
the strongest cross-check on this shelf so far. The shelf total stays at 58, now for the right reason.

⚑ The interior sample must be the ROUNDEST member (largest shortest/longest edge ratio), not the one
with the largest shortest edge. The cone is usually unbounded, so the latter runs away: the first attempt
centred families at coordinates in the tens and left 25 of 30 sliders with their whole useful range in
the first few percent of a track running to 40. Unbounded directions now stop 4 past the sample, and the
default steps off the round member by an irrational fraction of each half-width, since the round member
is where the extra symmetry lives.
