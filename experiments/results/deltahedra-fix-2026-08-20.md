# The missing all-triangle polyhedra: three bugs, one blind spot

2026-08-20. AL: *"It's useless to run k=3 if we don't first fix the algorithm and why is it
dropping the all triangles polyhedra. I need you to debug the algorithm, understand why it doesn't
find them, and fix it. We need to ensure completeness."*

## What was missing

The k=2 Johnson gate ran clean on 21 convex solids and flagged one systematic hole: the five 2-orbit
deltahedra — J12 triangular bipyramid, J13 pentagonal bipyramid, J17 gyroelongated square bipyramid,
J51 triaugmented triangular prism, J84 snub disphenoid. There was no `eupruned_02_3.txt` at all: the
triangles-only family produced zero k=2 blocks.

## The blind spot

All three bugs are the same mistake made independently in three places: **reasoning about a block
from its corner classes**, on the one alphabet where the corner class says nothing. Equilateral
triangles alone give every dart of every configuration corner class 0.

`gen_alphabet`'s A6 certificate had been printing the warning for this the whole time and nobody
followed it up:

```
[cert] A6 WARNING (non-pinned palette): 4 isomorphic-fold collisions — pruner dedup unreliable here:
        (3,3,3)S3  ~=  (3,3,3,3)S4
        (3,3,3)R3  ~=  (3,3,3,3)R4
```

One dart each, same corner class, indistinguishable.

### 1. `eu_solver.cpp` — `simplify()` deleted the blocks at closure

`simplify_inner` is Moore partition refinement: the coarsest congruence on darts refining a seed
colour and commuting with rneig/lneig/mirro/glue, accepted iff trivial. That is the right question —
a configuration is `T/H` for a subgroup `H` of the tiling's symmetry group and is a record only when
`H` is the whole group, i.e. when it admits no proper quotient.

The seed was the corner class alone. A covering `C -> C'` preserves much more: a dart of `C` is an
`H`-orbit of darts of `T`, it sits at one vertex of `T`, and its image sits at the *same* vertex, so
the entire vertex figure is a covering invariant. Corner class does not imply vertex figure, and over
a single-tile alphabet it implies nothing.

Triangles only, k <= 5: the solver builds **308** closed configurations and the old seed passes
**3** — tetrahedron, octahedron, icosahedron. The triangular bipyramid *is* built,
`v0 = (3,3,3)S3, v1 = (3,3,3,3)S2a, glue (0 0')(1')`, three darts — and thrown away, because with one
seed colour the whole three-dart set is a congruence. Its quotient is the one-dart tetrahedron block,
which merges a 3-valent vertex with a 4-valent one and is a covering of nothing. Checked by hand:
1-WL gives 1 class of 3, `|Aut| = 1`, so the configuration is minimal and the rejection was wrong.

Fix: seed with the vertex figure — the alphabet symbol with its site-symmetry variant stripped, so
`(3,3,3)S3`, `R3`, `A` and `F` share the key `(3,3,3)`. Strictly a loosening: a finer seed gives a
finer congruence, and every closure the old test accepted was already discrete.

An earlier attempt replaced 1-WL with an exact automorphism search (`Aut(C) = 1`, decidable in
`O(le^2)` because a connected map's automorphism is pinned by the image of one dart). It is the wrong
criterion and was reverted: `Aut(T/H) = N_G(H)/H`, so a non-normal `H` gives a trivial automorphism
group for a configuration that is not minimal. It let the tetrahedron back in as `(3,3,3)A` — the
tetrahedron quotiented by `D_2d`, index 3 in `T_d`, non-normal — and k=1 went from 3 blocks to 7.

### 2. `eu_pruner.cpp` — the survivors were deleted as duplicates

Same seed, twice: `simplify()` rejected the blocks the solver now emitted, and `comparesolutions()`
would have called any two blocks with the same dart count isomorphic. With the solver fixed and the
pruner not, 12 new k=2 triangle blocks went in and **0** came out. Fix: `Graph::fam` in
`ctrnact_decode.hpp`, one vertex-figure id per dart, added to the seed of both refinements, to the
fingerprint, and to the spilled `Sol` record.

### 3. `develop_euclid.py` — `unfold()` guessed the vertex word

A vertex of valence 5 whose figure has a 5-fold rotation is a cycle of ONE dart, and the link only
closes after five passes, so the developer needs `f = len(config) / len(cycle)`. It found the config
by matching the cycle's face sequence against every word in the block and keeping the smallest repeat
count. Here every word matches every other. The 1-dart cycle of `(3,3,3,3,3)S5` matched the *other*
orbit's `(3,3,3,3)` and came back `f=4`: a valence-5 vertex developed as a valence-4 one, J13's block
closed as the **octahedron**, and `(3,3,3)A + (3,3,3,3)S4` closed as the **tetrahedron** the same way.
Its own docstring said "invisible on an equilateral vertex and wrong everywhere else". Fix: take the
dart -> vertex-orbit map from `decode_block` — darts are laid out one vertex at a time in the header's
order, which is not a guess.

### 4. `develop_spherical.py` — a vertex that closes early (found by the star gate)

Not part of the original hole, but the loosened solver surfaced it. A vertex figure folded by an
m-fold rotation has a word of period `n/m`, so its first `n/m` angles already sum to `2*pi*d/m`: the
developed walk returns to its starting dart AND frame after `n/m` steps whenever `m | d`, and what
gets built is a valence-`n/m` vertex wearing the label of a valence-`n` one. Nothing downstream can
see it — the fill closes, Euler is 2, every edge is the same length — because the object built is a
perfectly good polyhedron, just not this one. `(5,5,5,5,5,5)S2` at `d=2` develops into the
**dodecahedron** and the star catalogue gained it a second time as a bogus k=2 record; the great
stellated dodecahedron picked up the same twin at D=7. Condition: `gcd(m, d) = 1`. Vacuous at `d = 1`,
so every convex palette is untouched, and genuinely wrapped vertices keep their records —
`(5,3,5,3,5,3)S3` has `m=3` and closes at `d=2`, `gcd = 1`.

## Result

| | before | after |
|---|---|---|
| tri-only k<=5 blocks emitted (of 308 closures) | 3 | 45 |
| spherical k<=2 raw blocks | 188 | 200 |
| spherical k=2 pruned blocks | 132 | 141 |
| develop_euclid k=2 congruence classes | 54 | 68 |
| **convex, no coplanar neighbours** | **21** | **26** |
| unidentified / false positives | 0 | 0 |

The five new ones are exactly the five that were missing: J12 (V=5 E=9 F=6), J13 (7/15/10),
J84 (8/18/12), J51 (9/21/14), J17 (10/24/16). Every one of the 26 is a genuine Johnson solid.

## Gates

* `make check-regular` — byte-identical to golden, A068599 10/20/61/151/332/673 at k<=6. PASS
* `make check-star` — k=1, k=2, rho-bucketed k=2 and the shipped shelf all match golden. PASS
* `make check-deltahedra` — NEW. The all-triangle alphabet at k<=2 must return exactly the eight
  convex deltahedra, F in {4,6,8,10,12,14,16,20} and nothing at 18 (Freudenthal & van der Waerden
  1947). A theorem, not a golden file. ~12s. PASS
* `develop_euclid` k=1: 30 records / 28 shapes, identical to before the change.
* `develop_spherical` k=2 on the spherical palette: the same 2 records as before.

The deltahedron gate is the one that matters going forward: nothing else in the repo exercises an
alphabet whose corner classes carry no information, which is why three separate stages could all get
this wrong and stay wrong.

---

# Follow-ups, 2026-08-21

Three things AL asked for after the deltahedra landed.

## 1. The spherical shelf now says which solids are TILINGS of the sphere

AL: *"some of them are polyhedra but not tilings of the sphere … there could be some tilings of the
sphere that are not polyhedra, so I think we should make a distinction between them."*

The correspondence fails in one direction and the shelf was pretending it did not. A polyhedron becomes
a spherical tiling by RADIAL PROJECTION, which needs one point equidistant from every vertex — a
circumsphere. Nineteen of the sixty-four shipped solids have none, so there is no centre to project from
and no spherical tiling to draw: the elongated bipyramids, the four bicupolas, the gyrobifastigium, the
two triaugmented prisms, the snub square antiprism, the snub disphenoid and the four other bipyramids.
They are perfectly good polyhedra sitting on a shelf called "Spherical tilings".

The test is a circumsphere FIT, not "same distance from the centroid" — the square pyramid's
circumcentre is the centre of its base and a diminished solid keeps its parent's sphere while its vertex
centroid walks off the centre, so the centroid reading calls J1, J11, J62, J63, J76 and J80
non-inscribable and every one of them plainly is. With the fit, the two populations are seven orders of
magnitude apart: the inscribed miss by at most 6.6e-10 of the radius, the rest by more than 3.1e-2.

    Spherical → Tilings
      Regular-faced solids        64
        Tilings of the sphere     45
        Polyhedra, no circumsphere 19
      3.4.n.4 solids              20
      Star polyhedra              89
      Halved Platonic faces       16

`lib/tilings/sph-inscribed.ts` holds the fit and the list; `sph-inscribed.test.ts` recomputes the list
from the vertices every run, so it cannot drift and a new solid cannot arrive unclassified.

## 2. A one-tile spherical tiling is no longer grey

AL: *"some polyhedra are still rendered as grey"* — `shoct-half-2-00001`. `tileColor` answers a
one-tile pattern with a neutral blue-grey, and that neutral is for a BLANK FREEDRAW BOARD, where a real
colour would claim a decoration that is not there. A tiling is never blank. Four half-tile records have
a single face orbit and all four came out grey: shoct-half-2-00001, shcube-half-2-00002,
shcube-half-2-00004, shdodec-half-3-00001.

`sphPolyScene` now hands the canvas an explicit `tileHsb`, hue = `polygonHue`, the same rule the star
shelf adopted in 2026-08-19 after the same complaint ("sometimes it's all gray"). A square is the same
yellow on a 3.4.n.4 solid, on a star polyhedron and on a Euclidean tiling. On a half-tile board every
face is the same polygon and the groups are symmetry ORBITS, so the polygon's hue is the starting point
and the orbits spread from it by golden angle — which leaves the triangle boards exactly where they were.

## 3. The face-through-face creases: what I found, and what I did not

AL: *"there are some cases where the intersections of planes are not drawn as edges … here in the
crossed square cupola."*

**The crease computation is not the problem.** I brute-forced it: for every pair of faces on every one
of the 89 star records, sample the line where their planes meet, keep the spans that lie inside both
filled regions and outside any shared real edge, and check that `faceCrossings` returned a crease
covering each one. **Zero uncovered spans, all 89 records.** On the crossed square cupola specifically it
returns 18 creases and every intersection is among them.

What I did find is that the ink was losing the depth fight. The crease ribbon was lifted off its face by
a fixed `thickness * 0.06` — 0.00036 world units on a solid of radius 1 — and a fixed offset in WORLD
units buys a share of the depth buffer that depends on the camera and the face's inclination, so it was
enough for some creases and not for others. Raising the lift to `thickness * 3` brought visibly more
crease pixels back, which is the proof it was the depth fight; but a lift that large detaches the ink
from the surface. It is a `polygonOffset` now — a bias in depth-buffer units, so a coplanar crease wins
by the same margin at every zoom and a face genuinely in front still occludes it.

⚑ **That may not be the case AL is looking at.** The default camera hides all five squares of the
crossed square cupola, and AL's screenshot is a rotated view where they are the large olive faces, so I
could not put my eye on the same missing line. If one is still missing after this, it is a case the
"both filled regions overlap" model does not cover, and I need the exact view to find it.

## 4. The star-wide k=2 catalogue is UNCHANGED by the engine fix

The loosened solver puts 673 more blocks into star-wide's k=2 pruned set (422,206 → 422,879), so the
shipped star shelf had to be re-derived to know whether it was missing anything. Full re-run, 2h25m
across 8 workers: **the same 9 distinct solids, identical in (V, F, density, rho, vertex configuration)
to the pre-fix catalogue.** Every one of the 673 new blocks fails to develop.

That is the answer for the star shelf and it is worth having in writing: the corner-class blind spot cost
the Euclidean-developer catalogue five solids and cost the star catalogue nothing. The new blocks are
all-triangle multi-orbit maps, and a triangles-only map on the star palette closes at a rho the other
orbit cannot match.

Gate for this: `make check-star` was already byte-identical, and this is the wide palette agreeing too.

---

# The spherical inflation, 2026-08-21

AL, on `sph-pentagonal-gyrobicupola`: *"doesn't seem to be consisting of only regular polygons"*, plus
*"all polyhedra should have the polyhedra view in the thumbnail instead of the spherical inflation. And
only those that are inscribable can, in the view options, be toggled to see the spherical inflation."*

Three symptoms, one cause, and the cause is a comment that was true when it was written.

## The data was never wrong

J31 measures exactly right: V=20, E=40, F=22, 10 triangles + 10 squares + 2 pentagons, **all 40 edges
0.618033989 to nine decimal places**, every face planar with equal interior angles. A sweep over all 64
shipped solids finds the same — no face on the shelf is irregular by more than 1e-6.

## The renderer was inflating it

`flatSolidTriangles` and `straightEdges` pushed **every vertex out to the sphere of `radius`**, and the
comment above them said why that was safe:

> Every vertex is normalised onto the sphere of `radius`; for a Platonic/Archimedean solid all vertices
> share one circumradius, so this is a UNIFORM scale that keeps the flat facets intact (a per-vertex
> normalise would only distort a solid whose corners sat at mixed radii — **none here do**).

None did, on the shelf that comment was written for. Nineteen do now. A per-vertex normalise moves each
corner a different distance, so every face comes out bent — the same shape of mistake as the deltahedra,
an invariant asserted in prose and invalidated by new data.

Both now call `solidFitScale`, one factor for the whole solid (`radius / max|v|`). For a solid whose
corners share a radius about the origin that factor is exactly the one the normalise applied, so every
Platonic, Archimedean, prism and antiprism render is untouched.

## And the default view was the sphere

Worse than the inflation: the default look for these records is the ROUND tiling sphere, which radially
projects the solid onto its circumsphere. Without one there is nothing to project onto and what appears
is a different object — J31 came out as a green blob with a few pink slivers. So:

* the thumbnail draws the POLYHEDRON for every record on the shelf;
* `spherical-canvas` forces the flat solid when the record has no circumsphere;
* the Options tab hides the Polyhedron checkbox for those, since the view it toggles back to does not
  exist. `hasSphereView` in `lib/tilings/sph-inscribed.ts` is the single decision.

## Gate

`lib/render/sphericalGeometry.test.ts` (new) measures what the RENDERER produces, not what the data
says: one scale factor for the whole solid, every drawn edge the same length, every drawn face
equilateral, and — the bug's own signature — a non-inscribable solid's corners must NOT come back on a
sphere. Verified to fail: re-introducing the normalise fails all four.

Tolerance is 1e-6, not machine epsilon: the hand-written Platonic tables already disagree at 2.1e-8
(icosahedron) and the inflation being guarded against moves edges by percent.

## Correction to the crease note above

The `polygonOffset` I added on 2026-08-20 was wrong, and AL caught it: *"on some others there are some
strange lying artefacts."* `polygonOffsetFactor` scales with the polygon's DEPTH SLOPE, and a star
polyhedron is layers of steeply inclined faces, so a slope term pulls creases on hidden layers forward
until they punch through the faces in front. On ss-60-120-62-d13 (V=60, F=62, density 13) factor -4 /
units -8 differs from no-offset-at-all by 1,171,827 in summed pixel difference, all of it hairlines
across faces that should be solid. **factor 0 / units -2 differs by 1,145**, which is antialiasing.

A crease is coplanar with its face, so a constant bias is the whole of what it needs; the slope term was
never doing anything but damage. And it was never the fix for the original complaint either — the crease
SET is complete (brute-forced on all 89 records) and a crease that does not appear is one correctly
hidden behind a face.

---

# The shelf hierarchy, and the 3.4.n.4 duplicates — 2026-08-21

## Convexity is the top split now

AL's shape, with two corrections I made and one thing I could not fit.

    Convex                              87
      Regular polygons                  71
        k = 1 uniform                   28
        k = 2 Johnson … k = 29 Johnson  43
      Octahedron halved (16 tiles)       2
      Cube halved (12 tiles)             7
      Dodecahedron halved (24 tiles)     5
      Icosahedron halved (40 tiles)      2
    Non-convex                          89
      Star polyhedra                    89
        k = 1                           52
        k = 2                           37

**Convex / non-convex is exact, not curatorial.** Every star polyhedron is non-convex and every other
solid on the shelf is convex, so the two families partition it with nothing left over.

**"regular polyhedra (k=1)" → "k = 1 uniform".** Only the five Platonic solids are *regular* polyhedra;
the 28 at k=1 are 5 Platonic + 13 Archimedean + 10 prisms and antiprisms, and what they share is being
UNIFORM — vertex-transitive, which is exactly what k = 1 means. The other half of AL's line is exact as
written: a Johnson solid is by definition a convex regular-faced polyhedron that is not uniform, so
k > 1 is precisely the Johnson solids. The k rows say so instead of leaving it to be known.

**Density is off the star axis.** It was one sub per density — thirteen rows from 2 to 38 plus an
unresolved one — which put a property of the SOLID on the axis that everywhere else in the catalogue
carries the vertex-orbit count. One row now, k underneath: 52 and 37. Density is still on every card.

⚑ **"halved" did not get its own parent.** The tree has exactly three grouping levels above the cards
(family → sub → k) and the convex branch spends all three on convex → group → k. The four halved boards
sit as siblings of "Regular polygons" instead of under a "Halved" heading; their names carry the word.

## The 3.4.n.4 shelf was a second copy of the reference one

AL: *"under 3.4.n.4 we have many regular and johnson solids … we shouldn't have duplicates."* All twenty
were. Matched by CONGRUENCE — the sorted multiset of pairwise vertex distances after a common fit, which
identifies mirror images, the repo's standing convention:

* **13 duplicates**: cuboctahedron, rhombicuboctahedron, rhombicosidodecahedron, octagonal prism, J3,
  J19, J27, J37, J72, J73, J76, J77, J80.
* **7 new**, and they are exactly the rest of J72–J83, the gyrate/diminished rhombicosidodecahedra —
  the shelf held five, these are the other seven, family complete.

**The seven are named by derivation.** Every member of that family is the rhombicosidodecahedron with two
integers on it, both readable off the vertex-configuration census:

    g = gyrations     = (# vertices at 3.4.4.5) / 10
    d = diminishments = (# vertices at 4.5.10)  / 10

calibrated on the five already shipped (the gyrate has 10 at 3.4.4.5, the parabigyrate 20; the
diminished has 10 at 4.5.10, the parabidiminished 20). (g, d) names ten of the twelve outright. The two
it cannot separate are the para/meta pairs at (2,0) and (0,2), and SYMMETRY ORDER separates those —
para is D_5d at 20, meta is C_2v at 4. Same test that settled J28/J29, and for the same reason: emission
order is not evidence. `tools/ctrnact-oracle/gen_johnson_rhombicosi.py`.

| | V | F | sym | g | d | |
|---|---|---|---|---|---|---|
| sp5-17-00001 | 60 | 62 | 4 | 2 | 0 | J74 metabigyrate |
| sp5-12-00001 | 60 | 62 | 6 | 3 | 0 | J75 trigyrate |
| sp5-29-00002 | 55 | 52 | 2 | 1 | 1 | J78 metagyrate diminished |
| sp5-29-00001 | 55 | 52 | 2 | 2 | 1 | J79 bigyrate diminished |
| sp5-14-00001 | 50 | 42 | 4 | 0 | 2 | J81 metabidiminished |
| sp5-27-00001 | 50 | 42 | 2 | 1 | 2 | J82 gyrate bidiminished |
| sp5-9-00001  | 45 | 32 | 6 | 0 | 3 | J83 tridiminished |

The spherical 3.4.n.4 shelf is retired: `loadSphericalPolyAtlas` no longer fetches those shards and the
`spp-` rows are gone. The shards stay in `public/spherical-poly/` (they are develop_ai1_sph's output and
the squaring shelf reads them) and the HYPERBOLIC half of the family is untouched — it is infinite, and
nothing else in the catalogue holds it. Reference shelf 64 → 71.

## Audit: what we produced against what we ship, and what the 92 are missing

AL: *"Is there any johnson solid that we produced and is not in the shelf? Also, which ones are missing
and why?"*

**Nothing convex is unshipped.** Congruence-matched every develop_euclid record against the shelf:

| run | records | convex | distinct convex shapes | convex NOT on the shelf |
|---|---|---|---|---|
| k = 1 | 30 | 28 | 28 | **0** |
| k = 2 | 68 | 26 | 26 | **0** |

**43 of the 92 are on the shelf**: J1–5, 11–17, 19, 26–31, 34–39, 51, 57, 62, 63, 72–85.

**Why the other 49 are missing is one sentence, and it is derived, not guessed.** A Johnson solid is a
convex regular-faced polyhedron that is not uniform, so none has one vertex orbit. develop_euclid is
exhaustive over the palette at a given k, the palette covers every Johnson face ({3,4,5,6,8,10}) and
valence (a convex vertex cannot take six faces — six triangles are flat), and it has been run at k = 1
and k = 2. It returned 26 convex solids at k = 2 and every one is a Johnson solid. **So the 26 Johnson
solids with exactly two vertex orbits are all here, and all 49 missing ones have three or more.** The 17
we do have above two orbits came from the other two pipelines: 12 from develop_spherical (k = 2..8,
inscribable only — the gyrate and diminished families keep their circumsphere) and 7 from Marek's
3.4.n.4 boards, which reach k = 29.

The blocker is a single run: **develop_euclid at k = 3**, launched 2026-08-20, parked the same day when
the deltahedra bug surfaced, and not re-run since the fix. It is unblocked.

⚑ **38 non-convex solids we produced are on no shelf.** They are not Johnson solids — Johnson is convex
by definition, so they do not touch the count above — but they are real regular-faced polyhedra that the
Euclidean developer found and nothing ships. At k = 1 both non-convex records are already on the star
shelf; at k = 2, of 39 distinct non-convex shapes only ONE is, because the star shelf comes from
develop_spherical and is therefore inscribable-only. The other 38 are exactly the non-inscribable
non-convex solids, which is the gap `develop_euclid` was written to close and the shelf has not caught
up with.

⚑ **One old hedge resolved on the way.** `gyrate-diminished-rhombicosidodecahedron` shipped named
"(J77/J78)" because the census cannot separate the two. Symmetry order can — J77 is C_5v at 10, J78 is
C_s at 2 — and this record measures 10, so it is **J77 paragyrate diminished**. J78 arrived from the
3.4.n.4 shelf measuring 2, which is what forced the question. The id keeps its spelling (links are in
the wild); the name carries the correction.

---

# The non-convex shelf, and k = 3 — 2026-08-21

## There is no catalogue to put them in, and that is the finding

AL asked me to look for a categorisation for the 38 non-convex solids online. There isn't one. Johnson's
92 and Zalgaller's completeness proof are for CONVEX regular-faced polyhedra; Zalgaller's own extension
is to "convex regular-faced polyhedra with conditional edges", still convex; Klitzing's survey of the
territory puts non-convexity explicitly out of scope, and the vocabulary it does offer — orbiform
(vertices on one circumsphere), scaliform — names other axes. What IS enumerated past convexity is the
uniform half: the 57 non-convex uniform polyhedra, all one vertex orbit, all already on the star shelf.
Beyond that, nothing systematic. So these ship the way the star shelf ships a record it cannot name:
with the measured signature and no invented name.

## What the 38 actually are

Three populations, and only the first two were ever "the 38":

| | records | |
|---|---|---|
| genuinely REFLEX (a dihedral past π) | 38 | the shelf |
| degenerate-convex (two coplanar neighbours) | 4 | dropped — a face drawn as two is not a solid |
| of the 38: distinct by congruence | 35 | |
| of the 35: already on the star shelf | 1 | |
| **shipped** | **34** | 26 self-intersecting, 8 embedded |

⚑ **The one already shelved is the only one of the 38 with a circumsphere**, and that is not a
coincidence — it is the whole causal story in one data point. `develop_spherical` realizes maps on S²,
so a solid without a circumsphere is not something it can miss, it is something it cannot express. All
34 new ones have none.

Two measured facts travel with each record, because they are different kinds of object: whether it
SELF-INTERSECTS (a face edge through the interior of a face it shares no vertex with — 26 of 34 do) and
whether it is INSCRIBED (none is, so none has a spherical view). AL's guess about placement was right:
they sit as a sibling of the star shelf, under **Non-convex → No circumsphere (34)**.

⚑ Two renderer bugs fell out of shipping them. `buildFlatSolid` used `THREE.FrontSide` on the grounds
that "the solid is convex and closed with its triangles wound outward" — and the winding that makes that
true orients each triangle away from the ORIGIN, which is only "outward" for a convex solid containing
it. On these, faces whose normal points back at the centre were culled and the solid rendered with holes
in it. DoubleSide now; identical on a convex solid, since the back faces it draws are the ones the front
already cover. And develop_euclid's records come out in its own frame — the flood fill starts at the
ORIGIN, so the seed vertex sits there — which `lib/render/sphericalGeometry.test.ts` caught by measuring
the scale factor: they are centred and normalised like every other record now.

## k = 3: nineteen more Johnson solids

The same exhaustive search one orbit deeper. Spherical palette, MAXNUM=3: 653 raw blocks, 460 pruned at
k=3, 68 realized in 14 minutes across 8 workers. **24 distinct convex solids, 5 already shipped, 19 new**
— and every one of them is a Johnson solid by Zalgaller's theorem rather than by inference from a census:
a convex polyhedron with regular faces is Platonic, Archimedean, a prism, an antiprism or one of the 92,
and none of those is uniform.

    J6  pentagonal rotunda              J42 elongated pentagonal orthobirotunda
    J7  elongated triangular pyramid    J43 elongated pentagonal gyrobirotunda
    J8  elongated square pyramid        J44 gyroelongated triangular bicupola
    J9  elongated pentagonal pyramid    J45 gyroelongated square bicupola
    J10 gyroelongated square pyramid    J46 gyroelongated pentagonal bicupola
    J18 elongated triangular cupola     J49 augmented triangular prism
    J20 elongated pentagonal cupola     J50 biaugmented triangular prism
    J55 parabiaugmented hexagonal prism J59 parabiaugmented dodecahedron
    J67 biaugmented truncated cube      J90 disphenocingulum
    J91 bilunabirotunda

Named against the published table of constituent polygons, with three pairs the signature cannot
separate settled by MEASUREMENT: J42/J43 by the equatorial mirror the ortho one has and the gyro one does
not (the J28/J29 test), J55/J56 and J59/J60 by the angle between the two pyramid apexes, which is π when
the augmentations are on opposite faces (para) and short of it otherwise (meta). Both came out para,
which is what one expects at k = 3 — the meta member is less symmetric and has more orbits.

**Shelf 43 → 62 of the 92.** The 30 still missing need k ≥ 4.
