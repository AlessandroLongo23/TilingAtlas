# Star and isotoxal polygons

A regular polygon has one free number, its count of sides. Give it a second, an angle, and it can bend: take a polygon with 2n equal sides whose corners alternate between two angles. When one of the two angles is reflex the polygon is a star with n points; when both are under 180° it is a convex polygon whose sides are all alike. Both kinds tile the plane together with regular polygons, and the angle is often free to move while the tiling stays a tiling. This page is about those tiles, the tilings they make, and how far their enumeration has got.

## One polygon, two shapes

Write α for the angle at the points. The 2n corners of any 2n-gon add up to $(2n-2)\cdot 180°$, so the other angle, at the dents, is

$$\beta = \frac{(2n-2)\cdot 180°}{n} - \alpha.$$

For small α the dents are reflex and the polygon is a star. Following *Tilings and Patterns*, Joseph Myers writes it $n^*_\alpha$: $6^*_{30°}$ is a six-pointed star whose points are 30°. As α grows the dents open out, and at $\alpha = (n-2)\cdot 180°/n$ they reach 180°: the star has become a regular n-gon with a flat corner in the middle of each side. Past that point both angles are below 180°, and the polygon is a convex *isotoxal* polygon, one whose symmetries carry any side onto any other. At $\alpha = \beta$ it is the regular 2n-gon.

<ku-star-shape caption="The polygon with 2n unit sides and corners alternating between α and β. Drag α to pass from a sharp star through the regular n-gon (β = 180°) and the convex isotoxal 2n-gon to the regular 2n-gon (α = β). Colours follow the catalogue's: stars by their number of points, convex tiles by their number of sides.">
</ku-star-shape>

These are the star polygons Kepler used. In *Harmonices Mundi* he drew patches of tilings that mix them with regular polygons, without saying exactly which polygons or which tilings he allowed. The other modern meaning of a star polygon, the self-intersecting $\{n/d\}$ whose sides cross, gives a different theory with its own rules, described on the [other tiles](/play/about/other-tiles) page under hollow tilings.

## The uniform star tilings

The rules are the ones of the [k-uniform](/play/about/k-uniform) shelf, with one change that the stars force. A vertex of the tiling is a point where three or more tiles meet. When the dent of a star is filled by a single corner of one other tile, the two tiles meet there, but the point is not a vertex of the tiling, so it is not counted in an orbit.

Branko Grünbaum and Geoffrey Shephard made the first attempt to list the uniform tilings by regular polygons and stars in 1977, and refined the definitions and the lists in *Tilings and Patterns* (1987), where they asked as an exercise whether the lists were complete. Joseph Myers took up the exercise in 1993 and found three uniform tilings missing from them. His article *Tiling with regular star polygons* (Eureka, 2004) gives the whole enumeration: six uniform tilings that are not edge-to-edge, and 23 edge-to-edge ones. Four of those 23 are families in which the star's angle α can take any value in a range, and stay uniform throughout.

<card-grid cols="2" caption="Four of the 23 uniform edge-to-edge tilings with star polygons in Myers's 2004 list. Every vertex is alike; the points where a star's dent holds a single corner are not vertices.">
<tiling-card tiling="ctrnact-star-k1-02" title="3.12* · stars with triangles"></tiling-card>
<tiling-card tiling="ctrnact-star-5fold-k1-01" title="4*.5 · four-pointed stars with pentagons"></tiling-card>
<tiling-card tiling="ctrnact-star-9fold-k1-01" title="3*.18 · three-pointed stars with 18-gons"></tiling-card>
<tiling-card tiling="ctrnact-star-k1-04" title="3*.6*.8 · two stars and an octagon"></tiling-card>
</card-grid>

Look again at the pentagon and the 18-gon. No edge-to-edge tiling by regular polygons alone contains either, since their vertex configurations ($4.5.20$, $5.5.10$, $3.9.18$) are among the six that never tile; a star fills the angle that no regular polygon fits. Myers closed his 2004 article with the question this raises: with no uniformity condition at all, which polygons can occur in an edge-to-edge tiling by regular polygons and stars? Can a regular heptagon occur, or a polygon with more than 18 sides, or a star with more than 18 points?

## Families with a free angle

In some tilings the star's angle is not fixed. Myers's families are the cleanest case: the tiles around a vertex keep fitting as α moves, because a point of one star and a dent of another meet at the same vertex, and whatever α adds at the point the dent gives back. The catalogue stores each family once, with its range of α, and draws it at one value.

<ku-switch caption="The four families with a free angle among Myers's uniform star tilings. Each card shows one member; the line under the control gives the range of α over which the tiling exists.">
<tiling-card tiling="ctrnact-s24f-family-k1-02" title="3.3*" caption="Triangles and three-pointed stars, for any α between 0° and 60°."></tiling-card>
<tiling-card tiling="ctrnact-s24f-family-k1-03" title="4.4*" caption="Squares and four-pointed stars, for any α between 0° and 90°."></tiling-card>
<tiling-card tiling="ctrnact-s24f-family-k1-04" title="3.6*" caption="Triangles and six-pointed stars, for any α between 0° and 120°."></tiling-card>
<tiling-card tiling="ctrnact-s24f-family-k1-01" title="3*.6" caption="Hexagons and three-pointed stars, for any α between 0° and 60°."></tiling-card>
</ku-switch>

## Two orbits, and beyond Myers's lists

In August 2009 Myers posted a list of the edge-to-edge 2-uniform tilings with regular polygons and stars: 38 tilings and 5 one-parameter families. He described it as a hand enumeration intended to be complete that had not been double-checked, and asked that it be treated with caution.

The atlas searched the same problem with Marek Čtrnáct's engine, run over an alphabet of star tiles. At k = 1 it finds exactly Myers's 23. At k = 2 it finds his 43 records and three more that match nothing in his list. Those three are marked *candidate*. A candidate is a tiling the catalogue holds that no published enumeration contains: it may be new, or it may be a duplicate or an error that a careful second look would catch, and until someone checks it by hand the catalogue says which. From k = 3 on there is no published list at all, so every record is a candidate in this sense.

<ku-switch caption="The three 2-uniform star tilings the search found that are not in Myers's 2009 list. Each is a candidate until an independent check confirms or rejects it.">
<tiling-card tiling="ctrnact-star-k2-01" title="3.6.12*" caption="Triangles, hexagons and twelve-pointed stars."></tiling-card>
<tiling-card tiling="ctrnact-star-k2-04" title="3.4.12*" caption="Triangles, squares and twelve-pointed stars."></tiling-card>
<tiling-card tiling="ctrnact-s24f-family-k2-02" title="3.3*" caption="Triangles and three-pointed stars, a family with a free angle."></tiling-card>
</ku-switch>

The star shelf holds 23, 46, 108, 235, 436, 897, 1,728, 3,364 and 6,123 tilings for k = 1 to 9, counting a family once. These are the tilings the search found over its alphabet of stars. They are not claimed to be every star tiling with k orbits: a star whose angle the alphabet does not contain cannot appear.

## Isotoxal and mixed tilings

The convex half of the slider gives a second shelf. Isotoxal means edge-transitive, and for a polygon with equal sides it comes to the same thing as the alternating angles above. An isotoxal polygon with 2n sides is free to flex, and in many tilings it does: its two angles trade against each other as α moves, and the regular tiles around it hold still. The catalogue lists these as families with one free angle, or two when two isotoxal tiles flex independently, and labels the flexing tile by its number of sides with α attached, so that $3.12\alpha$ is a tiling by triangles and a flexing isotoxal 12-gon. A third shelf, *mixed*, holds tilings that use a convex isotoxal tile and a star at once.

<card-grid cols="2" caption="Left, an isotoxal family: triangles with a convex isotoxal 12-gon whose angles can move. Right, a mixed family, with a convex isotoxal octagon beside three- and six-pointed stars.">
<tiling-card tiling="ctrnact-isotoxal-family-k1-01" title="3.12α · isotoxal"></tiling-card>
<tiling-card tiling="ctrnact-mixed-family-k1-04" title="8α.3*.6* · mixed"></tiling-card>
</card-grid>

The isotoxal shelf holds 16, 91, 523 and 2,897 families for k = 1 to 4, and the mixed shelf 33, 53, 185 and 512. Each family's closure was checked over its whole range of α. Both shelves are drawn from a chosen set of tiles, so like the star shelf beyond k = 2 they report what was found, and no published enumeration exists to compare them with.

<ku-counts set="star" caption="What the three shelves hold at each k, on a logarithmic scale. For stars, the dark part of each bar matches Myers's published lists and the light part is candidates; click a bar for the numbers.">
</ku-counts>

## Credits

Johannes Kepler drew the first tilings with star polygons. Branko Grünbaum and Geoffrey C. Shephard posed their enumeration and fixed the definitions. Joseph Myers completed the uniform case and listed the 2-uniform tilings by hand; every record at k ≤ 2 that matches his lists is credited to him in the catalogue. The higher-k star, isotoxal and mixed shelves were computed by the atlas with Marek Čtrnáct's engine.

## References

- J. Kepler, *Harmonices Mundi*, Linz, 1619, Book II.
- B. Grünbaum, G. C. Shephard, [Tilings by regular polygons](https://doi.org/10.1080/0025570X.1977.11976655), *Mathematics Magazine* 50 (1977), 227–247.
- B. Grünbaum, G. C. Shephard, *Tilings and Patterns*, W. H. Freeman, 1987, section 2.5.
- J. Myers, [Tiling with regular star polygons](https://www.polyomino.org.uk/publications/2004/star-polygon-tiling.pdf), *Eureka* 56 (2004), 20–27.
- J. Myers, [2-uniform tilings with regular polygons and regular star polygons](https://www.polyomino.org.uk/publications/2009/star-polygon-tiling-2-uniform.pdf), August 2009.
