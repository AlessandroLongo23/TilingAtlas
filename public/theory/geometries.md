# Three geometries

Put regular polygons edge to edge around a point and add up their angles at that point. If the angles make exactly 360°, the polygons lie flat and can go on to tile the plane. If they make less, the corner cannot lie flat: it buckles into a cone, and a surface built from such corners curves round and closes up, which is how a polyhedron is made. If they make more, the polygons crumple like a lettuce leaf, and the surface they build is the hyperbolic plane. Every tiling in this catalogue sits in one of those three places, and the [explorer](/play) is split along exactly that line.

<geo-vertex start="3.3.3.3.3" caption="Regular polygons around one vertex, drawn in the geometry their angles put them in. Add polygons with the buttons or pick a preset. The polygons keep one common edge length, solved so that they close exactly around the vertex: on a sphere seen from outside when the flat angles fall short of 360°, flat when they make 360°, and in the Poincaré disk when they exceed it.">
</geo-vertex>

## One number per vertex

A regular polygon with $n$ sides has interior angles of

$$\alpha_n = \frac{(n-2)\cdot 180^\circ}{n},$$

so a triangle contributes 60°, a square 90°, a pentagon 108°, a hexagon 120°, and the angle creeps toward 180° as $n$ grows. A vertex surrounded by polygons with $n_1, n_2, \dots, n_r$ sides, written $n_1.n_2.\dots.n_r$ in the vertex notation the atlas uses throughout, has angle sum $\alpha_{n_1} + \dots + \alpha_{n_r}$.

Run through the triangles. Three of them make 180°, four make 240°, five make 300°: all short of a full turn, so each of these corners is the corner of a solid (the tetrahedron, the octahedron and the icosahedron). Six triangles make 360° and give the flat triangular tiling. Seven make 420°, and seven equilateral triangles cannot be laid flat around a point at all. They fit only in a space where the angles of a triangle are smaller than 60°, and that space is the hyperbolic plane.

The figure draws each case where it lives. On a sphere a polygon's angles grow with its size, so the edge length can be chosen to make the five triangles' angles add up to exactly 360°; in the hyperbolic plane they shrink with size, and the same trick closes seven. The polygons stay regular and keep one edge length in every case: only the edge, and the geometry it is measured in, changes.

The same split shows up with mixed polygons. Try the presets 4.6.8, 4.6.12 and 4.6.14 in the figure: a square, a hexagon and one more polygon. With an octagon the sum is 345° and the vertex belongs to a solid, the truncated cuboctahedron. With a dodecagon it is exactly 360°, the truncated trihexagonal tiling of the plane. With a 14-gon it is about 364.3°, and the tiling is hyperbolic.

<tiling-card tiling="t1003" title="4.6.12" caption="The flat member of the 4.6.n family: a square, a hexagon and a dodecagon at every vertex, 90° + 120° + 150° = 360°. Swap the dodecagon for an octagon and the same pattern closes into a solid; swap it for a 14-gon and it no longer fits in the plane.">
</tiling-card>

## The regular case and the inequality behind it

When every face is the same regular $p$-gon and $q$ of them meet at each vertex, the tiling is written $\{p,q\}$, the symbol Ludwig Schläfli introduced for regular polytopes. The angle sum is $q\,\alpha_p$, and comparing it with 360° gives, after dividing through by $180^\circ q$ and rearranging,

$$q\,\alpha_p \lessgtr 360^\circ \iff \frac{1}{p} + \frac{1}{q} \gtrless \frac{1}{2}.$$

A sum above one half is the sphere. With $p, q \geq 3$ that leaves only five pairs, $\{3,3\}$, $\{3,4\}$, $\{4,3\}$, $\{3,5\}$ and $\{5,3\}$: the tetrahedron, octahedron, cube, icosahedron and dodecahedron. A sum of exactly one half is the plane, and only $\{3,6\}$, $\{4,4\}$ and $\{6,3\}$ solve it. Every other pair is hyperbolic, and there are infinitely many of those: $\{7,3\}$, $\{3,7\}$, $\{4,5\}$, $\{5,4\}$, and on without end. The article on the [hyperbolic catalogue](/play/about/hyperbolic) explains what that endlessness does to an enumeration.

<geo-solid solids="icosahedron" caption="{3,5}: five triangles at a vertex, 1/3 + 1/5 > 1/2. Drag to turn it. The readout counts 12 vertices, each 60° short of flat, for a total defect of 720°.">
</geo-solid>

<tiling-card tiling="t1011" title="3.3.3.3.3.3" caption="{3,6}: six triangles at a vertex, 1/3 + 1/6 = 1/2. The angles close exactly, and the tiling goes on forever without bending.">
</tiling-card>

<hyperbolic-card patch="hyp-3-3-3-3-3-3-3" label="{3,7}" caption="{3,7}: seven triangles at a vertex, 1/3 + 1/7 < 1/2, drawn in the Poincaré disk. The triangles are all congruent; they look smaller toward the rim because the disk squeezes an infinite plane into a bounded circle.">
</hyperbolic-card>

## Angle defect, and why the sphere always adds up to 720°

The amount by which a vertex falls short of flat is its *angle defect*, $\delta = 360^\circ - (\text{angle sum})$. On a polyhedron every vertex has positive defect, in the plane every vertex has zero, and in a hyperbolic tiling every vertex has negative defect, an excess.

Around 1630, in a manuscript now called *De solidorum elementis*, René Descartes stated that the defects of a convex polyhedron always add up to two full turns, 720°, however many vertices it has and whatever its faces are. The manuscript itself is lost; it survives because Gottfried Wilhelm Leibniz copied it in 1676, and his copy turned up in Hannover around 1860.

The theorem is Euler's formula in disguise. A face with $n$ sides has angles adding to $(n-2)\cdot 180^\circ$. Summing over all faces, and using that the side counts add up to twice the number of edges $E$, the angles of all faces together make $360^\circ(E - F)$. The vertices would need $360^\circ V$ to lie flat, so the total defect is

$$\sum_v \delta_v = 360^\circ\,(V - E + F),$$

which is 720° exactly when $V - E + F = 2$, as it is for every convex polyhedron. The same bookkeeping applies to any closed surface made of flat polygons, convex or not, and it gives 0° on a torus, where $V - E + F = 0$. The defect is a discrete curvature, and Descartes' theorem is the polyhedral case of the Gauss-Bonnet theorem.

For a solid whose vertices are all alike the theorem leaves no freedom in the vertex count: $V = 720^\circ/\delta$. Five triangles have defect 60°, so the icosahedron has 12 vertices. The vertex 4.6.8 has defect 15°, so the truncated cuboctahedron has 48. The truncated icosidodecahedron, 4.6.10, has the smallest defect of any Archimedean solid, 6°, and so the most vertices, 120.

<geo-solid solids="truncated-cuboctahedron,truncated-icosidodecahedron,square-cupola,tor-16-36-20" labels="4.6.8|4.6.10|A Johnson solid|A torus" caption="Descartes' theorem, solid by solid. The first three are convex, and each total defect is 720°, whether the vertices are all alike or, as on the square cupola, of two kinds. The fourth is a polyhedral torus from the atlas's genus shelf: V − E + F = 0, and its defects, some positive and some negative, cancel to 0°.">
</geo-solid>

The plane and the hyperbolic plane have no such total. A tiling of the plane has zero defect at every vertex and infinitely many vertices; a hyperbolic tiling has the same negative defect at every one of infinitely many vertices, which is another way of saying that the hyperbolic plane is infinite and curves the same way everywhere.

## Why a polyhedron is a tiling of the sphere

A polyhedron with regular faces is not, on its face, a tiling of anything: its faces are flat and it has corners. But when all its vertices lie on one sphere, as they do for every Platonic and Archimedean solid, projecting each face from the centre onto that sphere turns the solid into a tiling of the sphere by spherical polygons. The flat faces become curved ones, and the defect that sat at each corner is spread over the faces as the sphere's curvature. That is why the atlas files the solids under the spherical geometry, and why the same vertex notation describes a solid and a planar tiling alike.

Not every solid has such a sphere. Some Johnson solids have vertices at more than one distance from the centre, and for those the explorer shows the solid itself; the article on [polyhedra as tilings of the sphere](/play/about/polyhedra) takes up the whole shelf.

## How the explorer splits the catalogue

The explorer asks two questions before it shows anything: which geometry, and which decoration. The geometry chip separates Euclidean, hyperbolic and spherical. The decoration chip separates three kinds of object that live on top of the geometry.

*Tilings* are the tilings themselves, by regular polygons and by the wider classes the other articles describe (star and isotoxal polygons, two edge lengths, polyforms, topological types). *Edge patterns* fix a tiling as a scaffold and draw a chosen subset of its edges, Marek Čtrnáct's freedraw construction; the regions the drawn edges cut out are the tiles. *Colorings* keep a tiling and paint its tiles, so that vertices which were alike fall into classes by the colors around them.

The counts, as the explorer showed them in October 2026:

| Geometry | Tilings | Edge patterns | Colorings | All |
|---|---|---|---|---|
| Euclidean | 125,090 | 186,257 | 226,946 | 538,293 |
| Hyperbolic | about 2.23 million | 24,791 | 7,282 | about 2.26 million |
| Spherical | 1,645 | 92,478 edge patterns and colorings together | | 94,123 |

The spherical tilings are 773 solids (130 convex, 492 non-convex, 151 noble) and 872 topological types of spherical tiling. The hyperbolic column is the largest because the hyperbolic plane has room for infinitely many vertex types, and the enumeration there is bounded by a palette and a cut-off in the number of vertex orbits, not by a theorem that the list is finished.

## References

- P. J. Federico, [*Descartes on Polyhedra: A Study of the De Solidorum Elementis*](https://link.springer.com/book/9781461257615), Sources in the History of Mathematics and Physical Sciences 4, Springer, 1982. The history of Descartes' manuscript and Leibniz's copy is summarized in [Descartes on Polyhedra](https://en.wikipedia.org/wiki/Descartes_on_Polyhedra).
- [Angular defect](https://en.wikipedia.org/wiki/Angular_defect): Descartes' theorem, its relation to the Euler characteristic and the Gauss-Bonnet theorem.
- H. S. M. Coxeter, *Regular Polytopes*, 3rd ed., Dover, 1973: the symbols $\{p,q\}$ and the regular tilings of the sphere, plane and hyperbolic plane.
- [Uniform tilings in hyperbolic plane](https://en.wikipedia.org/wiki/Uniform_tilings_in_hyperbolic_plane): the hyperbolic $\{p,q\}$ and their uniform relatives.
