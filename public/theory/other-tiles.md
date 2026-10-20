# Other tiles

The [k-uniform](/play/about/k-uniform) shelf rests on three rules: every tile is a regular polygon, every side has length one, and tiles meet edge to edge. Each class on this page breaks one of them, or keeps the rules and changes what a tile is. The counting stays the same throughout: a vertex is a point where three or more tiles meet, and k is the number of orbits of vertices under the tiling's symmetries. Most of these classes have no published enumeration to compare with, so their counts say what the atlas's searches found, and the page says where a count is known to be partial.

## Regular polygons at two or three sizes

Let regular polygons come in side lengths 1, 2 and 3 together. A triangle of side 2 is then met along one side by two unit tiles, so the tiling is no longer edge-to-edge in the strict sense. The trick that brings it back is to treat the side-2 triangle as a hexagon with three flat corners: every side is a unit side again, and the flat corners, where only two tiles meet, are not vertices. Only tilings that use at least two sizes are kept, since a tiling by side-2 polygons alone is a scaled copy of one already on the regular shelf.

The shelf holds 6, 41, 208, 745, 2,792, 9,020 and 29,500 tilings with sides 1 and 2 for k = 1 to 7, and 10, 31, 195 and 857 that also use side 3, for k = 1 to 4.

<card-grid cols="2" caption="Left, triangles and hexagons of side 1 with triangles of side 2. Right, triangles at all three sizes. A corner of a small tile sits at the middle of a large tile's side; that point is a flat corner of the large tile.">
<tiling-card tiling="d-ctrnact-01_3h-3cm-1" title="sides 1 and 2"></tiling-card>
<tiling-card tiling="s-ctrnact-01_3ta-2ct_4oa-1" title="sides 1, 2 and 3"></tiling-card>
</card-grid>

## Equilateral polygons that flex

Keep every side of length one and let the corners vary, under one constraint: the corner angles repeat with period p as you walk round the tile. A hexagon with corners 135°, 120°, 105°, 135°, 120°, 105° has period 3. The isotoxal polygons of the [star and isotoxal](/play/about/star-and-isotoxal) page are the case p = 2. Such tiles flex, and many tilings by them come in families with one or two free angles, which the catalogue stores once with their ranges. The period-p shelf holds 1, 66, 256, 73, 16 and 15 families and tilings for k = 1 to 6. The k = 3 count is a lower bound, and the smaller counts beyond it should be read the same way: they say how far the search was run, not how many tilings exist.

<tiling-card tiling="period-k2-044" title="a period-3 hexagon" caption="A 2-uniform family of a hexagon with unit sides and corners repeating with period 3, beside regular hexagons. Its corner angles move together along a one-parameter family.">
</tiling-card>

A third relaxation keeps unit sides and convexity but allows convex polygons built from regular ones, such as a rhombus of two triangles, used as single tiles beside the regular polygons. The convex composite shelf holds 20, 211 and 1,220 such tilings for k = 1 to 3. It was built to show that the search does not depend on the tiles being regular, and it is a sample from a chosen set of composites, not a complete list.

<tiling-card tiling="composable-k1-000" title="a composite rhombus" caption="A 1-uniform tiling with a 60° rhombus (two triangles fused into one tile), triangles and hexagons.">
</tiling-card>

## Different edge lengths

Every class so far has unit sides. The next ones do not, and tiles may only meet along sides of the same length. Five tile sets are on the shelf.

The 45-45-90 set has the right isosceles triangle with legs 1 and hypotenuse √2, the unit square, the square of side √2, and doubled copies; it holds 17, 227, 2,057 and 14,664 tilings for k = 1 to 4. The two squares show why lengths must be tracked: they have the same four right angles and differ only in their sides.

Planigons are the tiles of the Laves tilings, the duals of the uniform tilings: put a vertex at the centre of every polygon of a tiling by regular polygons, and join the centres of polygons that share a side. Each of the 15 vertex configurations that occur in tilings gives one planigon, with as many sides as the configuration has polygons: a triangle, quadrilateral, pentagon or hexagon. The planigon shelf holds 18, 67, 233 and 737 tilings by them for k = 1 to 4.

Roger Penrose's kite and dart, found in 1974 and made famous by Martin Gardner's column of January 1977, tile the plane only aperiodically when their matching rules are enforced. Without the rules, the same two shapes, with sides 1 and the golden ratio φ and every angle a multiple of 36°, also tile periodically, and those periodic tilings are what this shelf counts: 7, 18, 91, 287, 890 and 3,212 for k = 1 to 6. The aperiodic tilings are on the [aperiodic](/aperiodic) page.

Half polygons cut a regular polygon along a mirror. The half triangle is the 30-60-90 triangle, the half square through the midpoints of two opposite sides is the domino, the hexagon has two cuts (a trapezoid and a pentagon with two right angles), and the pentagon has one, a quadrilateral with corners 54°, 108°, 108° and 90°. The regular pentagon does not tile the plane, and its half does, already with one vertex orbit. The 30-60-90 triangle alone has 8, 67, 397, 2,000 and 9,092 tilings for k = 1 to 5.

<ku-switch caption="One tiling from each tile set with more than one edge length. Click a card to pan and zoom it.">
<tiling-card tiling="tri45a-k1-015" title="45-45-90" caption="Right isosceles triangles at two scales with the √2 square."></tiling-card>
<tiling-card tiling="planigon-k1-001" title="planigons" caption="A tiling by planigons, the tiles of the duals of the uniform tilings."></tiling-card>
<tiling-card tiling="penrose-k3-082" title="kite and dart" caption="Penrose's kite and dart without matching rules, in a periodic tiling with three vertex orbits."></tiling-card>
<tiling-card tiling="euhtri-k1-0001" title="half triangle" caption="The 30-60-90 triangle, half of an equilateral triangle."></tiling-card>
<tiling-card tiling="euhpent-k1-0001" title="half pentagon" caption="Half a regular pentagon. The whole pentagon cannot tile; its half does, with one vertex orbit."></tiling-card>
</ku-switch>

## Polyforms

A polyomino is a shape made of unit squares joined along whole sides, a name Solomon Golomb introduced in 1954; polyiamonds are made of equilateral triangles and polyhexes of regular hexagons. Treated as tiles, they are polygons with flat corners where two cells meet along the boundary, and the same vertex rule applies: a point where only two pieces meet does not count. Each set allows every piece of one size, a piece and its mirror image being the same piece. Tilings, unlike pieces, are counted with their mirror images separately on this shelf, so a chiral tiling contributes two.

The shelf has nine sets: dominoes (3, 7, 23 and 62 tilings for k = 1 to 4), trominoes (8, 39, 184), tetrominoes (38, 540), diamonds (3, 8, 23, 52, 119), triamonds (2, 11, 39, 78), tetriamonds (22, 277), dihexes (6, 4, 21, 35, 87), trihexes (8, 30, 70) and tetrahexes (20, 228). No published list of k-uniform polyform tilings exists to check them against, so every record is a candidate.

<ku-switch caption="Polyform tilings with few vertex orbits, one per set. A point where two pieces meet along a straight line is not a vertex.">
<tiling-card tiling="dom-ctrnact-01_i-3aa-1" title="dominoes"></tiling-card>
<tiling-card tiling="tro-ctrnact-01_i-2aa_4aa-1" title="trominoes"></tiling-card>
<tiling-card tiling="tet-ctrnact-01_i-2aa_2af_4aa-1" title="tetrominoes"></tiling-card>
<tiling-card tiling="tia-ctrnact-01_c-2aa_4ng-1" title="tetriamonds"></tiling-card>
<tiling-card tiling="trh-ctrnact-01_a-2ab_2ah_3bq-1" title="trihexes"></tiling-card>
</ku-switch>

## Topological types

Forget shapes altogether. Two periodic tilings have the same *topological type* when one can be deformed into the other, keeping which tiles meet and how the symmetries act on them. Andreas Dress's theory encodes each type as a finite combinatorial object, its Delaney–Dress symbol, and the size of that symbol measures how complicated the type is. In 2021 Rüdiger Zeller, Olaf Delgado-Friedrichs and Daniel Huson enumerated all 2.4 billion types of Dress complexity up to 24 and published them with Tegula, a program to search and draw them.

The shelf takes the 93 types with one vertex orbit and the 1,270 with two from that database. Each is drawn by its equilibrium embedding, with every vertex at the centre of its neighbours; that drawing has more symmetry than the type requires, so the figure lets you bend each class of edge by a curve with exactly the symmetry its edges have.

<ku-tegula ids="tegula-DS02-10A,tegula-DS04-20WN,tegula-DS04-22KN-2,tegula-DS02-118" labels="3,4,3.6,6" caption="Four topological types from Tegula's database with one vertex orbit. Bend 0 is the straight equilibrium drawing; as the edges bend, each type shows the symmetry it has, and no more. The labels give the tiles' numbers of sides.">
</ku-tegula>

## Hollow tilings

The other kind of star polygon, $\{n/d\}$, has n sides that cross each other: $\{5/2\}$ is the pentagram drawn in one stroke. Branko Grünbaum, J. C. P. Miller and Geoffrey Shephard worked out in 1981 what a uniform tiling by such polygons should mean, treating each tile as its boundary. A single drawing can then stand for several distinct tilings, which is part of what makes the theory delicate. The hollow shelf holds 14 of their uniform tilings, each matching an entry of their list.

<ku-hollow ids="hollow-8_4-3_8-5,hollow-4_4_3-2_3-2_3-2,hollow-12-5_12-5_3-2" labels="8.4/3.8/5,4.4.3/2.3/2.3/2,12/5.12/5.3/2" caption="Three uniform hollow tilings from the 1981 list of Grünbaum, Miller and Shephard. By tile colours each tile type; by density shades each point by how many tiles wind round it; even-odd fills a self-crossing tile the way a pentagram drawn in one stroke is usually filled, with a hole in the middle.">
</ku-hollow>

## Bubble tiles

A bubble tile is an equilateral polygon whose every side is decorated with a bump or a bite, under one matching rule: a bump must meet a bite. The decorated sides make a tile that is not a polygon at all, but the tiling underneath is an ordinary tiling by triangles, squares, hexagons or rhombi, and k counts its vertex orbits as before. The shelf follows a 2026 study by John Chase, Will Field and Alex McCluer and holds 52,800 tilings on ten boards, from single tile shapes to mixtures of three; the square board reaches k = 5. Bubble tilings exist at every k, so no bound on k makes this shelf complete.

<ku-bubble ids="tri-k1:bt-1-00001,sq-k1:bs-1-00001,hex-k1:bh-1-00001" labels="triangles,squares,hexagons" caption="Bubble tilings with one vertex orbit on the three single-shape boards. Every bump sits in a bite.">
</ku-bubble>

## Credits

The size, period-p, composite, edge-length and polyform shelves were computed by the atlas with Marek Čtrnáct's engine. Solomon Golomb named the polyominoes. Roger Penrose found the kite and dart. Rüdiger Zeller, Olaf Delgado-Friedrichs and Daniel Huson enumerated the topological types, and Andreas Dress created the symbols they rest on. Branko Grünbaum, J. C. P. Miller and Geoffrey Shephard defined and listed the uniform hollow tilings. John Chase, Will Field and Alex McCluer defined the bubble tiles the bubble shelf follows.

## References

- B. Grünbaum, G. C. Shephard, *Tilings and Patterns*, W. H. Freeman, 1987.
- S. W. Golomb, [Checker boards and polyominoes](https://doi.org/10.1080/00029890.1954.11988548), *American Mathematical Monthly* 61 (1954), 675–682.
- M. Gardner, Mathematical Games: Extraordinary nonperiodic tiling that enriches the theory of tiles, *Scientific American* 236 (January 1977), 110–121.
- R. Penrose, The role of aesthetics in pure and applied mathematical research, *Bulletin of the Institute of Mathematics and its Applications* 10 (1974), 266–271.
- R. Zeller, O. Delgado-Friedrichs, D. H. Huson, [Tegula: exploring a galaxy of two-dimensional periodic tilings](https://doi.org/10.1016/j.cagd.2021.102027), *Computer Aided Geometric Design* 90 (2021), 102027. Software at [ab.inf.uni-tuebingen.de/software/tegula](https://ab.inf.uni-tuebingen.de/software/tegula).
- B. Grünbaum, J. C. P. Miller, G. C. Shephard, [Uniform tilings with hollow tiles](https://doi.org/10.1007/978-1-4612-5648-9_3), in *The Geometric Vein: The Coxeter Festschrift*, Springer, 1981, 17–64.
- J. Chase, W. Field, A. McCluer, *Puzzle pieces and bubble tiles*, working draft, 2026.
