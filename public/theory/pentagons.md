# The fifteen pentagons

Every triangle tiles the plane, and so does every quadrilateral, convex or not: rotate a copy half a turn about the midpoint of each side and the copies fill everything. No convex polygon with seven or more sides tiles at all. Hexagons sit in between, and Karl Reinhardt settled them in his 1918 dissertation: a convex hexagon tiles exactly when it belongs to one of three types. That leaves the pentagon, the one case where the answer took a century. Fifteen families of convex pentagons tile the plane, found by six groups of people between 1918 and 2015, and in 2017 Michaël Rao showed by an exhaustive computer search that there is no sixteenth.

<pent-history-figure caption="The fifteen types by who found them. Each tile is drawn at its explorer default, with one translational unit outlined heavier; the colours mark the tiles of that unit.">
</pent-history-figure>

## What a type is

A type is a list of equations on the angles and sides of a pentagon. Every pentagon that satisfies the equations tiles the plane, and they all tile it in the same pattern: the same corners meet at each vertex, the same sides lie against each other, and only the shape of the tile moves.

The letters follow one convention throughout this page and the explorer. The corners are A, B, C, D, E in order around the tile. Side *a* joins E to A, side *b* joins A to B, and so on, so each corner is named after the side that arrives at it, and side *d* lies opposite corner A. Type 1, for example, is the condition B + C = 180°: the two angles at the ends of side *c* add to a straight angle. Nothing more is required, and every pentagon with that property tiles.

Sources do not agree on the starting letter. Mann, McLoud-Mann and Von Derau write their Type 15 with A = 60°, B = 135°, C = 105°, D = 90° and E = 150°; shifting every letter one place gives the form below, A = 150°, B = 60°, C = 135°, D = 105°, E = 90°. The tile is the same. When two papers seem to disagree about a type's conditions, a relabelling is the first thing to check.

<pent-type-figure caption="All fifteen types. Pick one and move its first free angle: the conditions listed under the slider stay true while every number in them changes. Beside the tile is a patch of its tiling, with one translational unit outlined. Types 14 and 15 have nothing to move.">
</pent-type-figure>

## Counting the freedom

A pentagon has six degrees of freedom once its size is forgotten. Its five angles must add to 540°, which leaves four. Given the angles, the direction of every side is fixed, and the walk around the boundary has to return to its start: two linear equations on the five side lengths, so three lengths are free, and two once the scale is set aside. Four and two make six.

Each condition of a type removes one. Type 1 has one condition and five free parameters; Type 2 (B + D = 180° and *c* = *e*) has four. Types 3, 4 and 5 fix several angles outright and keep one or two.

The later types are subtler. Type 9 asks for four equal sides and two angle sums, five conditions, which would leave one parameter. But the four equal sides, together with the two closure equations, put more constraints on the side lengths than there are lengths to satisfy them, and a solution exists only where a certain determinant vanishes. That is one more equation, on the angles this time, and it is transcendental. Types 6, 7, 8, 9 and 14 work this way, which is why their angles are in general numbers you can compute but not round values you can state.

At the end of the scale, two types have no freedom left. Type 14, found by Rolf Stein, has A = 90° and an angle B fixed by sin B = (√57 − 3)/8, about 145.34°. Type 15 has the round angles above and side ratios built from √3. Up to size, each is a single pentagon.

<pent-type-figure types="1" sliders="all" caption="Type 1, the freest of the fifteen: three angle sliders and two side ratios, five parameters in all. Only B + C = 180° is imposed, and C follows from B. Some combinations inside the slider ranges leave the convex pentagons; the figure says so when they do.">
</pent-type-figure>

## Reinhardt's five

Reinhardt asked a narrower question than the whole problem. A tiling is *isohedral* when its symmetries can carry any tile onto any other, so that every tile sits in the tiling the same way. He showed that a convex pentagon admits an isohedral tiling exactly when it is of Types 1 to 5. That part of the classification has stood since 1918, and it says where the rest must hide: a pentagon outside those five, if it tiles at all, tiles only with its copies in two or more inequivalent positions. The other ten types all live there.

## Kershner's claim and Gardner's readers

Richard Kershner of Johns Hopkins published three new types in 1968, Types 6, 7 and 8, whose tilings have their tiles in two inequivalent positions, and claimed with them that the list of eight was complete.

Martin Gardner reported Kershner's result in his *Scientific American* column of July 1975. Within a month a reader, the computer scientist Richard James III, sent him a pentagon that was not on the list, and Gardner printed it in December 1975. It is now Type 10.

Another reader of the July column was Marjorie Rice, a California homemaker with no mathematics beyond a general high-school course. She invented her own notation for how corners meet, worked through the combinations at her kitchen table, and in February 1976 sent Gardner a new type. Gardner passed it to Doris Schattschneider, who confirmed it and corresponded with Rice from then on. By the end of 1977 Rice had found four new types, now Types 9, 11, 12 and 13, and many new tilings by the known ones. Schattschneider announced Rice's work in *Mathematics Magazine* in 1978. The numbers do not follow the order of discovery: James's type, found first, is Type 10, and Rice's are 9, 11, 12 and 13.

Rolf Stein found Type 14 in 1985. Thirty years passed before the next.

## The fifteenth, and the end of the list

Casey Mann, Jennifer McLoud-Mann and David Von Derau, at the University of Washington Bothell, turned the question into a finite computer search. A tiling is *i-block transitive* when the tiles group into blocks of *i*, and the blocks form an isohedral tiling; Reinhardt's five are the case *i* = 1. They enumerated every convex pentagon admitting such a tiling for *i* = 1, 2 and 3, and found, in 2015, one that was not of any known type. It tiles in blocks of three, with twelve tiles in a translational unit, and it is Type 15.

Rao's proof, posted in 2017, closes the problem from the other side. It works from the ways the corners of pentagons can come together at a vertex of a tiling: Rao reduced these to 371 possible scenarios and checked each by computer, and every convex pentagon that survives belongs to one of the fifteen known types. Thomas Hales independently reproduced the central part of the computation in 2017. A related result came earlier: Olga Bagina showed in 2011 and 2012 that a convex pentagon with an edge-to-edge tiling, where tiles meet only along whole sides, belongs to one of eight types.

One consequence of the complete list is that every convex polygon that tiles the plane also tiles it periodically. All fifteen pentagon types, like the three hexagon types and all triangles and quadrilaterals, have a periodic tiling, so there is no convex aperiodic monotile.

## What the explorer holds

The [pentagons explorer](/pentagons) draws all fifteen types as periodic tilings, each with sliders for its free parameters. The slider ranges were measured, not guessed: each parameter was walked outward from its default until the pentagon degenerated, so a range ends where the tile flattens into a quadrilateral or a side shrinks to nothing. On the types with several parameters the ranges are taken one at a time, so a combination inside every range can still fail, and the explorer says why when it does. Each type's conditions are shown with the current numbers substituted, so a drag reads as the condition holding.

## Credits

Types 1 to 5 are Karl Reinhardt's (1918); Types 6, 7 and 8 Richard Kershner's (1968); Type 10 Richard E. James III's (1975); Types 9, 11, 12 and 13 Marjorie Rice's (1976 and 1977); Type 14 Rolf Stein's (1985); Type 15 is due to Casey Mann, Jennifer McLoud-Mann and David Von Derau (2015). The completeness proof is Michaël Rao's (2017). Doris Schattschneider verified and published Rice's discoveries and wrote the histories this page draws on.

## References

- K. Reinhardt, [Über die Zerlegung der Ebene in Polygone](http://resolver.sub.uni-goettingen.de/purl?PPN316479497), dissertation, Universität Frankfurt am Main (1918).
- R. B. Kershner, [On paving the plane](https://doi.org/10.2307/2314332), *American Mathematical Monthly* 75 (1968), 839–844.
- M. Gardner, On tessellating the plane with convex polygon tiles, *Scientific American* (July 1975), 112–117; reader responses in the December 1975 column.
- D. Schattschneider, [Tiling the plane with congruent pentagons](https://doi.org/10.1080/0025570X.1978.11976672), *Mathematics Magazine* 51 (1978), 29–44.
- D. Schattschneider, [In praise of amateurs](https://doi.org/10.1007/978-1-4684-6686-7_16), in *The Mathematical Gardner*, ed. D. Klarner (1981), 140–166.
- D. Schattschneider, A new pentagon tiler, *Mathematics Magazine* 58 (1985), cover and p. 308.
- D. Schattschneider, [Marjorie Rice and her pentagonal tilings](https://archive.bridgesmathart.org/2018/bridges2018-1.pdf), *Bridges 2018 Conference Proceedings*, 1–2.
- C. Mann, J. McLoud-Mann, D. Von Derau, [Convex pentagons that admit i-block transitive tilings](https://doi.org/10.1007/s10711-017-0270-9), *Geometriae Dedicata* 194 (2018), 141–167. [arXiv:1510.01186](https://arxiv.org/abs/1510.01186).
- M. Rao, [Exhaustive search of convex pentagons which tile the plane](https://arxiv.org/abs/1708.00274), arXiv:1708.00274 (2017).
- O. G. Bagina, [Convex pentagons that tile the plane (types: 11112, 11122)](https://mathnet.ru/eng/semr381), *Siberian Electronic Mathematical Reports* 9 (2012), 478–530.
- N. Wolchover, [Pentagon tiling proof solves century-old math problem](https://www.quantamagazine.org/pentagon-tiling-proof-solves-century-old-math-problem-20170711/), *Quanta Magazine* (11 July 2017).
