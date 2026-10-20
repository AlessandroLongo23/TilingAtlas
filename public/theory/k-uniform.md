# k-uniform tilings

The eleven uniform tilings have one kind of vertex: a symmetry of the tiling carries any vertex onto any other. Allow two kinds, or three, or k, and the count grows quickly: 20 tilings with two kinds, 61 with three, 673 with six, and 103,082 with thirteen. This page explains what "kind of vertex" means here, why only fifteen arrangements of polygons can appear at a vertex at all, and who counted the tilings at each k.

## The rules: regular polygons, edge to edge

Every tile on this shelf is a regular polygon with sides of length one. The tiling is *edge-to-edge*: two tiles that touch share either a single corner or a whole side, so a corner never lands part-way along another tile's side. Both conditions do work. Drop regularity and the angles at a vertex stop being a short list; drop edge-to-edge and a row of squares can slide along a row of triangles by any amount, which gives a continuum of tilings in place of a finite count.

<card-grid cols="2" caption="Left, 3.6.3.6: every contact between two tiles is a whole side of both. Right, a tiling from the two-sizes shelf: the long side of a large triangle is met by two short sides, so a corner sits half-way along it. The second kind is counted on another shelf.">
<tiling-card tiling="t1007" title="edge-to-edge"></tiling-card>
<tiling-card tiling="d-ctrnact-01_3h-3cm-1" title="not edge-to-edge"></tiling-card>
</card-grid>

The tilings counted here are also periodic: some parallelogram of the tiling, repeated by two translations, covers the plane. A tiling whose vertices fall into finitely many classes under its symmetries, in the sense defined below, is always periodic, so this costs nothing.

## Twenty-one ways to close a vertex

The interior angle of a regular $n$-gon is $(n-2)\cdot 180°/n$: 60° for the triangle, 90° for the square, 120° for the hexagon, and closer to 180° the more sides there are. The polygons around a vertex must fill 360° exactly, so

$$\sum_{i} \frac{n_i - 2}{n_i} = 2.$$

Each angle is at least 60° and less than 180°, so between three and six polygons meet at a vertex, and the equation has 17 solutions as multisets of polygons. Reading them in cyclic order around the vertex gives 21 *vertex configurations*, written as the list of polygons met on the way round: $3.4.6.4$ is a triangle, a square, a hexagon and a second square. The multiset $\{3,4,4,6\}$ yields two of them, $3.4.4.6$ and $3.4.6.4$, and they behave differently.

Six of the 21 occur in no tiling. Each has three polygons, one of them with an odd number of sides and two different neighbours: in $3.7.42$, every corner of the heptagon has a triangle on one side and a 42-gon on the other, so the heptagon's sides must alternate between the two, and seven sides cannot alternate. The same argument removes $3.8.24$ (look at the triangle), $3.9.18$, $3.10.15$, $4.5.20$ and $5.5.10$. That leaves 15. Eleven of them are the vertices of the uniform tilings; the other four, $3.3.4.12$, $3.3.6.6$, $3.4.3.12$ and $3.4.4.6$, appear only beside other configurations.

<ku-vertex-types caption="The 21 vertex configurations, each drawn from its name with unit edges. The control picks out the 15 that occur in some tiling, the 11 that make a uniform tiling, and the 6 that occur in none. Click a configuration to add up its angles.">
</ku-vertex-types>

## The octagon decides everything

Of the 15 configurations that survive, only $4.8.8$ contains an octagon. That is enough to settle every tiling that has one. Take any octagon: each of its corners is a vertex holding an octagon, so each is $4.8.8$, and then its sides must go alternately to squares and octagons. The neighbouring octagons are in the same position as the first, so the argument repeats, and the tiling is the truncated square tiling, whole. Joseph Myers states this in his 2004 survey of star-polygon tilings: $4.8.8$ appears in its own uniform tiling and in no other tiling by regular polygons.

<ku-octagon caption="One octagon forces the whole tiling, one step at a time. The red dot is the vertex the argument starts from; each step adds only what the previous one left no choice about.">
</ku-octagon>

So no tiling with two or more kinds of vertex contains an octagon. The octagon is the only regular polygon on this shelf whose angle, 135°, needs the diagonal directions of the square grid; every other tile here lives on the twelve directions of the triangle and square grids together. A search for k-uniform tilings can leave the octagon out from k = 2 on and lose nothing.

## Vertex configuration and vertex orbit

Two vertices can look alike without being alike. Call two vertices *equivalent* when some symmetry of the whole tiling (a translation, rotation, reflection or glide reflection that maps the tiling onto itself) carries one onto the other. The classes of this relation are the *vertex orbits*, and a tiling by regular polygons, edge to edge, with exactly k vertex orbits is *k-uniform*.

Equivalent vertices always have the same configuration, since the symmetry carries the polygons along. The converse fails. A tiling can have two orbits whose vertices are both $3.4.6.4$, sitting in places the tiling's symmetries cannot exchange. The number of distinct configurations, usually written m, is therefore at most k. Grünbaum and Shephard call a tiling with m distinct configurations *m-Archimedean*; the word *k-isogonal* is their name for k vertex orbits in any tiling at all, so a k-uniform tiling is a k-isogonal tiling whose tiles are regular polygons meeting edge to edge.

<ku-switch orbits="on" caption="One tiling for each k from 1 to 5, with a dot on every vertex coloured by its orbit. Click the card to pan and zoom it; hover a dot to see its orbit. At k = 5 two orbits share one configuration: five orbits, four configurations.">
<tiling-card tiling="t1006" title="k = 1" caption="3.4.6.4: one orbit, and one configuration."></tiling-card>
<tiling-card tiling="t2001" title="k = 2" caption="Two orbits with two different configurations, 3.4.6.4 and 4.6.12."></tiling-card>
<tiling-card tiling="t3001" title="k = 3" caption="Three orbits, three configurations, all made of triangles and hexagons."></tiling-card>
<tiling-card tiling="t4003" title="k = 4" caption="Four orbits and four configurations, from triangles, squares and hexagons."></tiling-card>
<tiling-card tiling="t5001" title="k = 5" caption="Five orbits but four configurations: the two rows of vertices away from the strip are both 6.6.6, and no symmetry exchanges them."></tiling-card>
</ku-switch>

The difference matters for counting. Otto Krötenheerdt, in three papers of 1969 and 1970, classified the tilings with k orbits and k distinct configurations, the case m = k; they are now called Krötenheerdt tilings. There are 11, 20, 39, 33, 15, 10 and 7 of them for k = 1 to 7, and none beyond. Every 2-uniform tiling has two different configurations, so his list includes all 20 tilings with two orbits. From k = 3 on the two counts part: 39 of the 61 three-uniform tilings have three configurations, and the other 22 have two.

## Mirror images count once

The snub hexagonal tiling $3.3.3.3.6$ has no mirror symmetry, so it comes in a left-handed and a right-handed form. The classical count of eleven uniform tilings counts the pair once, and so do all the counts on this page: two tilings are the same when one can be moved onto the other by an isometry of the plane, reflections included. Counting mirror pairs separately would give twelve uniform tilings and larger numbers at every k. The regular shelf follows this convention at every k, which is what makes its counts comparable with A068599.

## The counts and who made them

The number of k-uniform tilings is OEIS sequence A068599. Its known terms, and the people behind them:

| k | tilings | first count |
|---:|---:|:---|
| 1 | 11 | Johannes Kepler, *Harmonices Mundi* (1619) |
| 2 | 20 | Otto Krötenheerdt (1969) |
| 3 | 61 | Darrah Chavey (1984) |
| 4 | 151 | Brian Galebach (2002) |
| 5 | 332 | Brian Galebach (2002) |
| 6 | 673 | Brian Galebach (2002) |
| 7 | 1,472 | Brian Galebach (2003) |
| 8 | 2,850 | Brian Galebach (2020) |
| 9 | 5,960 | Marek Čtrnáct (2021) |
| 10 | 11,866 | Marek Čtrnáct (2021) |
| 11 | 24,459 | Marek Čtrnáct (2021) |
| 12 | 49,794 | Marek Čtrnáct (2021) |
| 13 | 103,082 | Marek Čtrnáct (2021) |

Kepler drew all eleven uniform tilings in the second book of *Harmonices Mundi*. Krötenheerdt's classification gave the twenty 2-uniform tilings. Darrah Chavey found the 61 three-uniform tilings in his 1984 doctoral thesis at the University of Wisconsin and published a catalogue of tilings by regular polygons in 1989. From k = 4 the counts come from computers: Brian Galebach's search produced k = 2 to 6 in 2002, k = 7 in 2003 and k = 8 in 2020, and posted every tiling as a drawing. Marek Čtrnáct reached k = 13 in 2021, and his count at k = 8 agreed with Galebach's 2,850; the k = 13 term was announced on the Tiling List on 21 December 2021. In 2021 José Ezequiel Soto Sánchez, Tim Weyrich, Asla Medeiros e Sá and Luiz Henrique de Figueiredo turned Galebach's drawings, which had no coordinates, into exact integer descriptions and confirmed the number of orbits of each tiling.

<ku-counts set="regular" caption="Tilings by regular polygons with k vertex orbits, on a logarithmic scale. Click a bar for its count and its source; outlined bars are published terms the catalogue does not hold yet. By vertex types splits each bar, in proportion, by the number m of distinct configurations, lighter for larger m. Up to k = 7 the lightest band is m = k, Krötenheerdt's case; after that it is empty. No tiling with two or more orbits has a single configuration.">
</ku-counts>

The catalogue on [/play](/play) holds every term up to k = 10, 23,396 tilings, computed with Marek Čtrnáct's engine, and its count agrees with the published one at every k. From k = 4 on the counts are the output of exhaustive computer searches, and what supports them is that independent programs, written years apart, agree. The vertex-type split shows a pattern the totals hide: from k = 8 on no tiling uses all of its orbits on different configurations, and the most configurations any tiling with up to ten orbits combines is eight.

## Credits

Johannes Kepler first drew the eleven uniform tilings. Otto Krötenheerdt classified the tilings with k orbits and k configurations. Darrah Chavey counted the 3-uniform tilings. Brian Galebach extended the count to k = 8 by computer and published every tiling. Marek Čtrnáct extended it to k = 13 and, with Eryk Kopczyński, published an online catalogue of the tilings; the regular shelf of this atlas is computed with his engine. José Ezequiel Soto Sánchez and his coauthors gave Galebach's tilings exact coordinates. Branko Grünbaum and Geoffrey C. Shephard set the vocabulary used here.

## References

- J. Kepler, *Harmonices Mundi*, Linz, 1619, Book II. English translation by E. J. Aiton, A. M. Duncan and J. V. Field, *The Harmony of the World*, American Philosophical Society, 1997.
- B. Grünbaum, G. C. Shephard, [Tilings by regular polygons](https://doi.org/10.1080/0025570X.1977.11976655), *Mathematics Magazine* 50 (1977), 227–247.
- B. Grünbaum, G. C. Shephard, *Tilings and Patterns*, W. H. Freeman, 1987, sections 2.1 and 2.2.
- O. Krötenheerdt, Die homogenen Mosaike n-ter Ordnung in der euklidischen Ebene I–III, *Wissenschaftliche Zeitschrift der Martin-Luther-Universität Halle-Wittenberg, Math.-Nat. Reihe* 18 (1969), 273–290; 19 (1970), 19–38 and 97–122.
- D. Chavey, [Periodic tilings and tilings by regular polygons](https://web.archive.org/web/20100602000932/https://www.beloit.edu/computerscience/faculty/chavey/thesis/), PhD thesis, University of Wisconsin–Madison, 1984.
- D. Chavey, [Tilings by regular polygons II: a catalog of tilings](https://doi.org/10.1016/0898-1221(89)90156-9), *Computers & Mathematics with Applications* 17 (1989), 147–165.
- B. Galebach, [n-Uniform tilings](https://probabilitysports.com/tilings.html), 2002–2020.
- M. Čtrnáct, E. Kopczyński, [Tessellation catalog: k-uniform tilings](https://zenorogue.github.io/tes-catalog/?c=k-uniform%2F).
- J. E. Soto Sánchez, T. Weyrich, A. Medeiros e Sá, L. H. de Figueiredo, [An integer representation for periodic tilings of the plane by regular polygons](https://doi.org/10.1016/j.cag.2021.01.007), *Computers & Graphics* 95 (2021), 69–80.
- J. Myers, [Tiling with regular star polygons](https://www.polyomino.org.uk/publications/2004/star-polygon-tiling.pdf), *Eureka* 56 (2004), 20–27.
- OEIS, [A068599](https://oeis.org/A068599) (k-uniform tilings) and [A068600](https://oeis.org/A068600) (k-uniform tilings with k distinct vertex configurations).
