# Colorings of the regular grids

Paint every square of the square grid one of two colors, in a pattern that repeats. The grid stays the same, but the painted plane has fewer symmetries than the bare one, and the vertices that were all alike fall into classes. The [colorings explorer](/colors) lists every periodic coloring of the square, triangle and hexagon grids, and of the tilings by squares and triangles, up to a bound on the number of those classes: 246,312 colorings in all, computed by Marek Čtrnáct.

<hcp-colorings grids="square" colors="2" ks="1,2,3" caption="Two-colorings of the square grid with k = 1, 2 and 3 colored vertex classes. Switch on the vertex classes to see them: grid points with the same dot color are carried onto each other by some symmetry of the coloring. The label under each panel is the colored vertex figure of its first class. Click a panel to pan, zoom and turn it.">
</hcp-colorings>

## A coloring's symmetry

A symmetry of a coloring is an isometry of the plane that maps the grid onto itself and every tile onto a tile of the same color. These symmetries form a group, a subgroup of the grid's own symmetry group. The checkerboard keeps the translations that move a square to a square of its own color, the quarter turns about the centre of every square, the half turns about every vertex, and the reflections in the diagonals and in the lines through square centres parallel to the edges; it loses the translation by one step and the quarter turn about a vertex, which both turn black into white.

Two vertices belong to the same *colored vertex class* when a symmetry of the coloring carries one to the other. The number of classes is $k$, the same count that makes a tiling $k$-uniform, applied to the painted plane. All four corners of a checkerboard square look alike, so the checkerboard has $k = 1$. Paint one square in four, on a 2 by 2 lattice, and the picture still has $k = 1$: every vertex touches exactly one colored square. Paint whole rows, alternating, and every vertex sits on the boundary between two stripes, again $k = 1$.

Each class has a colored vertex figure: the colors of the tiles around the vertex, in order. The explorer writes it in Čtrnáct's notation, where `(A4, B4)` is a vertex whose four squares alternate between colors A and B, followed by a code of his for the symmetry the vertex keeps. A coloring with $k = 2$ has two such figures, and so on. Two colorings with the same figures can still differ, so the figures are a label, not an identity.

## What counts as one coloring

Three conventions decide the counts, and the explorer states them because the literature does not settle them.

A coloring and its mirror image are counted once. Isometries include reflections, so a chiral coloring and its reflection are congruent and appear as a single entry. This is the convention of the uniform tilings elsewhere in the atlas.

Colors are labelled. Swapping the two colors of a coloring gives a different entry unless the swap can be undone by a symmetry of the grid. The checkerboard with its colors swapped is the same checkerboard moved one step, so it counts once; one square in four painted A, the rest B, and its swap, three in four painted A, count twice. So do the two plain colorings, all A and all B.

Each palette size lists only the colorings that use every color. A three-color coloring that happens to use two colors is already in the two-color list, once for each pair of letters it could use, so the three-color lists hold the surjective colorings only. The two-color lists keep the two single-color colorings, which is why the square grid has 8 two-colorings at $k = 1$: 6 that use both colors, plus all A and all B.

## Perfect colorings

The best-known colorings in the literature are a different subset. Branko Grünbaum and G. C. Shephard (1977) call a coloring of a tile-transitive tiling *perfect* when every symmetry of the uncolored tiling permutes the colors: it may swap black and white, but it never sends two tiles of one color to tiles of two different colors. The checkerboard is perfect. So is the coloring of the hexagonal grid by three colors in which no two neighbours share a color, their first example.

Most entries here are not perfect. In a perfect coloring of a tile-transitive tiling every color covers the same share of the tiles, since the tiling's symmetries move any tile onto any other and carry color classes along. One square in four painted already fails that test. The stripes fail differently: they cover half the squares each, but a quarter turn of the grid sends a row to a column, so a row of one color lands across both colors. The catalogue asks less of a coloring. Only its own symmetries count, and only the vertex classes they leave are measured. Grünbaum and Shephard's *Tilings and Patterns* gives colored patterns a chapter of their own (chapter 8); Marjorie Senechal's survey of color groups (1979) treats the general theory of symmetries paired with permutations of colors.

<hcp-colorings grids="square,triangle,hex,ts" colors="2,2,3,2" ks="1" show="12" caption="Colorings with a single colored vertex class on each grid: two colors on the square and triangle grids and on the tilings by squares and triangles, three on the hexagonal grid. The last tab shows the 10 that mix the two tile shapes, on the snub square tiling 3.3.4.3.4 and the elongated triangular tiling 3.3.3.4.4; the other 17 are the square and triangle colorings again.">
</hcp-colorings>

## Four grids

The square and triangle grids carry the largest lists, with two colors to $k = 6$ and three colors to $k = 4$. On the hexagonal grid the catalogue holds the colorings that use all three of three colors, to $k = 8$; it has exactly one with $k = 1$, Grünbaum and Shephard's perfect three-coloring, and none with $k = 2$, because every coloring with two vertex classes on that grid uses at most two colors.

The fourth list is a different kind of object. Its tilings are not fixed: any edge-to-edge tiling by squares and equilateral triangles can be colored, so the same $k$ counts both the colors and the arrangement of the tiles. At $k = 1$ its 27 two-colorings are the 8 of the square grid, the 9 of the triangle grid, 6 of the snub square tiling and 4 of the elongated triangular tiling. With three colors the same row holds 21, and none of them is a coloring of the elongated triangular tiling: every vertex-transitive coloring of 3.3.3.4.4 uses at most two colors.

<hcp-colorings grids="hex,ts" colors="3,2" ks="1,3,4" show="8" caption="The hexagonal grid in three colors, which skips k = 2, beside the two-colorings of tilings by squares and triangles, restricted to the tilings that mix both shapes. The k switch applies to whichever grid is open.">
</hcp-colorings>

| Grid | Colors | k = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Square | 2 | 8 | 53 | 309 | 1,292 | 4,725 | 21,092 | | |
| Square | 3 | 9 | 285 | 3,868 | 39,549 | | | | |
| Triangle | 2 | 9 | 54 | 556 | 2,002 | 9,655 | 57,871 | | |
| Triangle | 3 | 9 | 145 | 6,449 | 47,028 | | | | |
| Squares and triangles | 2 | 27 | 250 | 1,851 | 11,192 | | | | |
| Squares and triangles | 3 | 21 | 814 | 17,214 | | | | | |
| Hexagon | 3 | 1 | 0 | 69 | 155 | 384 | 1,937 | 4,346 | 13,083 |

Each row stops where Čtrnáct's runs stop, not where the colorings do. The counts climb fast, by a factor between about 3.7 and 6.6 per class on the square grid with two colors, and the three-color rows overtake the two-color ones by $k = 2$.

<hcp-colorings grids="square,triangle" colors="3" ks="1,2" caption="Three-colorings that use all three colors, with one and two colored vertex classes. The square grid has 9 at k = 1, the triangle grid 9.">
</hcp-colorings>

## Credits

The colorings were enumerated by **Marek Čtrnáct** with his combinatorial solver, which builds each coloring from its colored vertex figures and closes it into a periodic pattern. His three-color run contains every two-color coloring again, once for each pair of letters, and those copies reproduce the two-color counts of the separate run exactly (8, 53, 309, 1,292 on the square grid; 9, 54, 556, 2,002 on the triangle grid), a second computation agreeing with the first. The atlas turned his certificates into drawings and checked that each develops to a pattern with the stated number of vertex classes.

## References

- B. Grünbaum, G. C. Shephard, [Perfect colorings of transitive tilings and patterns in the plane](https://faculty.washington.edu/moishe/branko/BG109%20Perfect%20colorings.pdf), *Discrete Mathematics* 20 (1977), 235–247.
- B. Grünbaum, G. C. Shephard, *Tilings and Patterns*, W. H. Freeman, 1987, chapter 8, "Colored patterns and tilings".
- M. Senechal, Color groups, *Discrete Applied Mathematics* 1 (1979), 51–73.
