# The eleven uniform tilings

Every preview on this page is live: click a card to activate it, then drag to pan, scroll to zoom, hold Shift and scroll to rotate, and right-click to reset the view. Press Esc or click elsewhere when you are done. The corner buttons expand a card in place or open the tiling in the Play view with the full set of overlays and controls.

## Tilings, vertices, and notation

A tiling of the plane is a countable family of closed regions (the tiles) that cover the plane without gaps or overlaps. This page restricts attention to the classical case: every tile is a regular polygon, and the tiling is *edge-to-edge*, meaning any two tiles meet either in a full common edge, in a single vertex, or not at all.

Under these rules a vertex is described completely by the cyclic sequence of polygons around it. The *vertex configuration* $n_1.n_2.\cdots.n_k$ lists the polygon sizes in order: $3.4.6.4$ is a vertex surrounded by a triangle, a square, a hexagon, and another square. Repetition is often abbreviated with exponents, so the all-triangle vertex $3.3.3.3.3.3$ is written $3^6$.

A tiling is *uniform* (or 1-uniform) when its symmetry group acts transitively on vertices: any vertex can be carried to any other by a symmetry of the whole tiling. All vertices then share one configuration, and the tiling is named by it. There are exactly eleven such tilings. Johannes Kepler first enumerated them in *Harmonices Mundi* (1619); the modern reference is Grünbaum and Shephard, *Tilings and Patterns* (1987), section 2.1.

## Why the angles must fit

The interior angle of a regular $n$-gon is

$$\theta_n = \frac{(n-2)\,180°}{n},$$

which gives 60° for the triangle, 90° for the square, 120° for the hexagon, and approaches 180° as $n$ grows. At a vertex where polygons $n_1, \dots, n_k$ meet, the angles must sum to a full turn:

$$\sum_{i=1}^{k} \frac{n_i - 2}{n_i} = 2.$$

Since every interior angle is at least 60°, a vertex hosts at most six polygons; since it is less than 180°, at least three. This equation has exactly 17 solutions as multisets of polygon sizes, which spread into 21 distinct cyclic orderings. Most of them die locally: placing the polygons around one vertex forces contradictions at the neighbouring vertices. Only 15 of the 21 vertex types occur in any edge-to-edge tiling by regular polygons, and only 11 can occur as the *sole* vertex type. Those 11 are the uniform tilings below.

The cyclic order genuinely matters. The multiset $\{3, 4, 4, 6\}$ solves the angle equation in two arrangements, $3.4.4.6$ and $3.4.6.4$, yet only the second extends to a uniform tiling.

## The three regular tilings

Demand the strictest regularity: a single polygon size $n$, with $k$ copies at each vertex. The angle equation collapses to $k\,(1 - 2/n) = 2$, so

$$k = \frac{2n}{n-2},$$

which is a positive integer only for $n = 3, 4, 6$. The pentagon fails ($k = 10/3$), and every $n > 6$ lands strictly between $k = 2$ and $k = 3$. Three solutions, three tilings, known since antiquity:

<card-grid>
<tiling-card tiling="t1011" title="3.3.3.3.3.3 · triangular" subtitle="p6m · hexagonal lattice"></tiling-card>
<tiling-card tiling="t1005" title="4.4.4.4 · square" subtitle="p4m · square lattice"></tiling-card>
<tiling-card tiling="t1001" title="6.6.6 · hexagonal" subtitle="p6m · hexagonal lattice"></tiling-card>
</card-grid>

These three are *regular* tilings: not only are the vertices all alike, the tiles and the edges are too (the symmetry group is transitive on all three). The triangular and hexagonal tilings share the wallpaper group p6m on a hexagonal lattice; the square tiling has p4m on a square lattice. The triangular and hexagonal tilings are each other's duals, obtained by swapping tiles and vertices; the square tiling is its own dual.

## The eight semiregular tilings

Allow two or three polygon sizes at a vertex while keeping vertex-transitivity and the eight *semiregular* (Archimedean) tilings appear. Each is listed with its wallpaper group, the crystallographic name of its symmetry group.

### Truncated square 4.8.8

Cut the corners off every square of the square tiling and the cut corners become new squares between octagons. This tiling is rigid in a strong sense: the octagon's 135° angle fits into a full turn only as $4.8.8$, and one octagon forces the configuration of every vertex around it. Any edge-to-edge tiling of regular polygons that contains a single octagon anywhere is this tiling. In the atlas that fact matters computationally: no tiling with $k \ge 2$ vertex orbits can contain an octagon at all.

<card-grid cols="2">
<tiling-card tiling="t1002" title="4.8.8 · truncated square" subtitle="p4m · square lattice"></tiling-card>
</card-grid>

### Truncated hexagonal 3.12.12

The same corner-cutting applied to the hexagonal tiling: hexagons grow into dodecagons and the cut corners leave triangles.

<card-grid cols="2">
<tiling-card tiling="t1004" title="3.12.12 · truncated hexagonal" subtitle="p6m · hexagonal lattice"></tiling-card>
</card-grid>

### Trihexagonal 3.6.3.6

Triangles and hexagons alternate around every vertex. Physicists know it as the kagome lattice, after the Japanese basket-weaving pattern; it is also the medial tiling of both the hexagonal and triangular tilings, with a vertex on every one of their edge midpoints.

<card-grid cols="2">
<tiling-card tiling="t1007" title="3.6.3.6 · trihexagonal" subtitle="p6m · hexagonal lattice"></tiling-card>
</card-grid>

### Rhombitrihexagonal 3.4.6.4

Each hexagon is ringed by alternating squares and triangles. This is the uniform realisation of the $3.4.6.4$ ordering discussed above, the one the multiset $\{3,4,4,6\}$ actually admits.

<card-grid cols="2">
<tiling-card tiling="t1006" title="3.4.6.4 · rhombitrihexagonal" subtitle="p6m · hexagonal lattice"></tiling-card>
</card-grid>

### Truncated trihexagonal 4.6.12

The largest vertex zoo in the family: a square, a hexagon, and a dodecagon at every vertex. It is the omnitruncation of the hexagonal tiling and has the largest translational cell of the eleven.

<card-grid cols="2">
<tiling-card tiling="t1003" title="4.6.12 · truncated trihexagonal" subtitle="p6m · hexagonal lattice"></tiling-card>
</card-grid>

### Elongated triangular 3.3.3.4.4

Rows of squares slide between rows of triangles. It is the odd one out in two ways: its symmetry group cmm is the only one here with a rhombic (rather than square or hexagonal) lattice, and it is the only uniform tiling that no Wythoff construction produces.

<card-grid cols="2">
<tiling-card tiling="t1008" title="3.3.3.4.4 · elongated triangular" subtitle="cmm · rhombic lattice"></tiling-card>
</card-grid>

### Snub square 3.3.4.3.4

Squares tilted against pairs of triangles, with symmetry group p4g. Compare its vertex with the elongated triangular tiling: the same polygons, triangle three times and square twice, in a different cyclic order, and the resulting tilings share nothing beyond their ingredients.

<card-grid cols="2">
<tiling-card tiling="t1009" title="3.3.4.3.4 · snub square" subtitle="p4g · square lattice"></tiling-card>
</card-grid>

### Snub hexagonal 3.3.3.3.6

Each hexagon swims in a sea of triangles. This is the only chiral uniform tiling: its symmetry group p6 contains rotations but no reflections, so no combination of translations and rotations maps it onto its mirror image. Following the standard convention (and this atlas), the two mirror forms count as one tiling; counting them separately would make twelve.

<card-grid cols="2">
<tiling-card tiling="t1010" title="3.3.3.3.6 · snub hexagonal" subtitle="p6 · hexagonal lattice"></tiling-card>
</card-grid>

## Why exactly eleven

The full argument runs in three steps. First, the angle equation admits 17 multisets, hence 21 cyclic vertex types; this is pure arithmetic. Second, local extension kills most candidates: a vertex type containing an odd polygon flanked by two different neighbours often cannot be continued consistently around that odd polygon (the parity argument Grünbaum and Shephard formalise), which eliminates six types ($3.7.42$, $3.8.24$, $3.9.18$, $3.10.15$, $4.5.20$, $5.5.10$) from ever appearing. Third, among the 15 surviving types, demanding that *every* vertex share the single type pins down the tiling completely, and exactly 11 types succeed, each in a unique way.

That uniqueness carries real weight: for each of the 11 configurations there is exactly one tiling realising it, so the vertex configuration is a complete name.

## Beyond one orbit

Relax vertex-transitivity to $k$ orbits of vertices and the count explodes: 20 tilings for $k = 2$, then 61, 151, 332, and 673 for $k = 3$ through $6$ (OEIS A068599). Enumerating these is the core computational problem of this project; the combinatorial engine behind the atlas reproduces the known counts through $k = 6$ and extends the regular catalogue to $k = 16$. The eleven tilings on this page are the $k = 1$ floor of that hierarchy, the only cases simple enough to settle by hand, and the fixed points every larger search is checked against.

These same regular polygons are also the base of one Islamic design system. For the tessellations behind Islamic geometric patterns — and the strapwork construction they carry — see [Islamic geometric systems](/theory/islamic).
