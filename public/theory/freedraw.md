# Freedraw: the edges carry the tiling

The rest of this atlas is strict about its tiles: every tile is a regular polygon, the polygons meet edge to edge, and the whole catalogue is decided by which regular polygons fit around a vertex. Marek Čtrnáct's freedraw construction drops that rule and asks a different question. We fix a grid, we decide which of its edges are "drawn", and we look at the regions the drawn edges cut out. The tiles are whatever falls out of that choice, so we never draw a tile directly: the only thing we ever choose is the set of drawn edges, and the tiling is a by-product.

That inversion is the whole idea, and it is the thing to hold onto before any definition arrives: in the classical theory the tiles carry the information and the vertices follow, while here the drawn edges carry the information and the tiles follow.

## The tiles are whatever falls out

Take the square grid, the integer lattice $\mathbb{Z}^2$ with its horizontal and vertical unit edges. A freedraw pattern is a choice, periodic under some sublattice, of which of those edges are drawn, subject to one rule: no vertex may have exactly one drawn edge. A vertex with a single drawn edge is a dead end, a segment that starts nowhere, and a dead end would make the figure a maze, not a tiling, so we forbid it. Every other local configuration is allowed, including a vertex with no drawn edge at all.

The figure below is one period of four by four grid squares, repeated across the plane; the dashed square is the period. Click an edge to draw or erase it (in every copy at once), and the tiles are recomputed as you go. A grid point with exactly one drawn edge gets a ring until you fix it.

<fd-draw caption="A four-by-four period of the square grid. Click an edge to toggle it; the tiles are the regions the drawn edges leave, coloured so that congruent tiles share a colour. The presets show the three kinds of tile: finite ones (Squares, Ring), strips, and a single sheet that reaches to infinity in every direction (Sheet).">
</fd-draw>

The tiles are the connected regions the drawn edges leave behind, and here is what makes freedraw its own thing: those regions need not be nice. A tile can be a finite polyomino, possibly with holes, like the ring of eight squares around a ninth in the last preset. It can just as well be an infinite strip, or one connected sheet that runs off to infinity in two independent directions, the way the sea surrounds a scattering of islands. None of these last two are tiles in the sense of Grünbaum and Shephard, who require a tile to be a closed topological disk, so the classical uniform-tiling theory doesn't apply to them at all. We are counting something different, and it took me a while to stop expecting the old invariants to mean anything here.

Telling the three kinds apart is a small piece of topology. Walk through a region from square to square without crossing a drawn edge, and keep track of which copy of the period you are in. If some walk comes back to its starting square in a different copy, the region is invariant under that translation; the translations collected this way span a lattice of rank 0 (a finite tile), rank 1 (a strip) or rank 2 (a sheet).

The same game runs on other grids. On the triangular grid every vertex has six edges in three directions, so the tiles are polyiamonds, strips, or sheets; on the hexagonal grid they are polyhexes. Two Archimedean tilings serve as grids as well, 3.4.6.4 and 4.8.8, and on the mixed square-and-triangle grid there is no single lattice to index into, because the underlying tiling itself varies from solution to solution. The rule is always the same: drawn edges, no dead ends, classify up to symmetry.

## k measures how decorated the grid is

We need one number to organise the catalogue. The obvious candidate is the number of tiles, but it misses the point, so we use a different one: $k$, the number of orbits of grid vertices under the pattern's own symmetry group. It's easy to misread, so we pin it down with an example.

Take the blank square grid with nothing drawn. Every vertex looks like every other one, the symmetry group is the full wallpaper group of the grid, and all vertices form a single orbit: $k = 1$. Drawing every horizontal edge keeps $k = 1$ too, because every vertex then sits on a drawn line and a translation still carries any vertex to any other. Draw only every third horizontal line and the plane is cut into strips three squares high: a vertex on a line is no longer equivalent to one off it, while the two rows inside a strip are swapped by a reflection, so $k = 2$. In general, lines $w$ apart give $k = \lfloor w/2 \rfloor + 1$, which the catalogue confirms row by row (lines eight apart sit at $k = 5$). The point of the example is that $k$ tracks the complexity of the *decoration*, and the tiling that decoration draws can look far plainer than $k$ suggests: a strip pattern is visually dull and combinatorially rich at once, because the tiling and the decoration behind it are two different things.

<fd-catalogue ids="fd-1-003,fd-2-003,fd-1-005,fd-2-010" labels="Squares,Strips,Sheet,Mixed" caption="Four patterns from the square catalogue. The squares are finite tiles; lines drawn every third row cut the plane into strips at k = 2; isolated squares leave a sheet around them; the last mixes finite tiles with a strip.">
</fd-catalogue>

This is also why freedraw connects back to the classical atlas. A regular hexagon is six triangles and a regular dodecagon is a hexagon of six triangles ringed by six squares and six more triangles, so every tiling by triangles, squares, hexagons and dodecagons can be drawn by erasing edges of some square-and-triangle tiling. Only the octagon escapes, and it lives in exactly one tiling, 4.8.8, which is a freedraw grid of its own. The vertex counts differ (an erased grid point in the middle of a hexagon still counts towards $k$), but the strict theory comes back as a special case of the loose one, which is a satisfying way for the two halves of the atlas to meet.

## What the planar catalogue holds

Marek's solver enumerates the patterns grid by grid and $k$ by $k$, and the atlas ships every slice it has. On the square grid there are 13 patterns at $k = 1$, then 153, 1,254, 7,848 and 43,792 at $k = 2$ to $5$, which is 53,060 in all. The triangular grid has 19, 357, 4,683 and 39,662 for $k = 1$ to $4$ (44,721), and the hexagonal grid runs deepest, from 5 at $k = 1$ to 22,361 at $k = 9$, 36,062 patterns in total. The two Archimedean grids add 18,992 patterns on 3.4.6.4 (to $k = 6$) and 71,331 on 4.8.8 (to $k = 10$), and the mixed square-and-triangle grid 14,718 (to $k = 3$). Two Schwarz triangle boards, where every vertex already belongs to one of several classes, bring 462 and 12,755 more.

<fd-catalogue grids="square,triangle,hex,4436" caption="The catalogue itself, one pattern at a time: pick a grid and a k, step through the patterns or jump to a random one. The line under the controls lists the tiles of the pattern up to translation.">
</fd-catalogue>

## On a Platonic solid the catalogue is finite

The planar grids are infinite, so the catalogue at each $k$ is infinite in the number of drawn edges we might use, and we control it only through periodicity. Move the base to a Platonic solid and that difficulty disappears, because a Platonic solid is finite: the icosahedron $\{3,5\}$ has 12 vertices, 30 edges, and 20 triangular faces, and that is the entire board. A spherical freedraw pattern is then a subset of those 30 edges drawn on the solid, with the same no-dead-end rule, classified up to the solid's full symmetry group. The tiles are the regions the drawn edges cut from the faces, that is the connected runs of faces you can still walk between across an *undrawn* edge.

<fd-solid solid="octahedron" caption="Freedraw patterns on the five Platonic solids. Pick a solid and a k, then step through the patterns; drag the solid to turn it.">
</fd-solid>

The orbit count $k$ carries over unchanged, and now it has a ceiling. Only the identity fixes every vertex of the solid, so a pattern with all vertices in distinct orbits has no symmetry at all, which for the icosahedron means $k$ can be at most 12. The fully symmetric patterns sit at $k = 1$ and the fully asymmetric ones at $k = 12$, and everything interesting happens in between. This is the property the plane never gives us: a fixed finite base means the whole thing is enumerable, all the way to the last $k$, with no periodicity to manage.

Of course the count depends on the solid. There are five Platonic solids, and by their Schläfli symbols they are the tetrahedron $\{3,3\}$, the octahedron $\{3,4\}$, the cube $\{4,3\}$, the dodecahedron $\{5,3\}$, and the icosahedron $\{3,5\}$, with full symmetry groups of order 24, 48, 48, 120, and 120. You can rotate any of them, in both the flat-faceted and the round-sphere rendering, in the [interactive viewer](/freedraw).

## Two independent counts, and they agree to the unit

We now have a catalogue to compute, and there are two ways to compute it, which is exactly the situation you want when the numbers are large and easy to get wrong.

The first way is Marek's solver, which searches the patterns combinatorially and touches geometry only at the very end. The second way is direct, and it is the one I wrote to check the first: build the solid and its symmetry group as explicit permutations of the vertices, then enumerate the edge subsets themselves. For the small solids this is brutal and complete, because the cube and the octahedron have only 12 edges, so we can walk all $2^{12} = 4096$ subsets, throw out the ones with a dead end, and bucket what remains by $k$. For the two big solids, with 30 edges, $2^{30}$ is about a billion and walking it directly is too slow, so we enumerate only the patterns that have some symmetry, which covers every $k$ below the maximum exactly.

The two methods share no code and rest on no common assumption, so when they agree it means something. They agree to the unit at every $k$ on every solid, including the split between achiral patterns (a mirror lies in the symmetry group) and chiral ones (none does). Running Marek's binary can only ever reproduce Marek's numbers, so on its own it proves nothing about correctness: the independent enumeration is the check that bites, and it settles the counting convention too, that patterns are counted up to the full group with mirror pairs merged.

One consequence of the setup is provable, not measured, and I like it for that. The top count, at $k$ equal to the number of vertices, is the fully asymmetric class, and a pattern with no symmetry has no mirror symmetry in particular, so every pattern at the top $k$ is chiral by necessity. When the icosahedron's $k = 12$ came back as 1,569,679 solutions with none of them achiral, that zero was exactly what the argument had already guaranteed, and the search only confirmed it.

## The numbers, and what they say

Here is the whole Platonic family, each row cross-checked by the two methods above.

| solid | symmetry order | per-$k$ counts | total |
|---|---|---|---|
| tetrahedron $\{3,3\}$ | 24 | 3, 2 | 5 |
| octahedron $\{3,4\}$ | 48 | 5, 8, 15, 12, 2, 7 | 49 |
| cube $\{4,3\}$ | 48 | 4, 5, 4, 3, 0, 1 | 17 |
| dodecahedron $\{5,3\}$ | 120 | 2, 5, 7, 15, 7, 26, 51, 10, … | 3,654 |
| icosahedron $\{3,5\}$ | 120 | 5, 39, 61, 257, 257, 6727, 0, 11304, … | 1,588,329 |

A few of these entries are more surprising than the totals, and they are the ones to read twice. Most of the zeros are forced before any search runs, by the orbit-counting lemma (usually credited to Burnside, though Cauchy and Frobenius had it first): a group $G$ splits the vertices into

$$
k = \frac{1}{|G|} \sum_{g \in G} \operatorname{fix}(g)
$$

orbits, where $\operatorname{fix}(g)$ counts the vertices $g$ leaves in place. On the icosahedron a mirror fixes the four vertices lying in its plane, a five-fold rotation fixes two, and every other non-identity symmetry fixes none. A pattern whose only symmetry is one mirror therefore has $(12 + 4)/2 = 8$ orbits, a single half-turn or the central inversion gives 6, and every larger group gives fewer, so no pattern on the icosahedron can have $k = 7$, nor $k$ from 9 to 11: the 0 in the table is arithmetic, and the "…" hides zeros at $k = 9$, 10 and 11 before the 1,569,679 at $k = 12$. The same count on the cube, where a mirror through two opposite edges fixes four vertices and a three-fold rotation two, rules out $k = 5$ and $k = 7$. The cube's empty $k = 8$ is different in kind: a pattern with no symmetry at all would have eight orbits, and the search walked all 4096 subsets and found that every one of them has some symmetry, so that zero is a fact about the cube and not a place we gave up looking. And the icosahedron's grand total, 1,588,329, is really 18,650 patterns with some symmetry plus 1,569,679 with none, so the fully asymmetric class outnumbers everything else by a factor of about 84.

Overall the spherical case is the cleaner half of the freedraw story: the base is finite, the count is exact, and two engines that were built independently land on the same numbers to the last digit. The planar grids are the richer object, but the sphere is where the method proves it is right.

## Credits

The freedraw construction, the no-dead-end rule and every planar catalogue are Marek Čtrnáct's, computed with his solvers; the face classification (finite, strip, sheet) and the independent Platonic enumeration were written for this atlas to check them. Čtrnáct also extended the count of $k$-uniform tilings by regular polygons from $k = 8$ to $k = 13$ in 2021, recorded in OEIS A068599, and with Eryk Kopczyński maintains a public catalogue of tessellations.

## References

- Branko Grünbaum and G. C. Shephard, *Tilings and Patterns*, W. H. Freeman, 1987; 2nd ed., Dover, 2016, ISBN 978-0-486-46981-2. The definition of a tile as a closed topological disk.
- B. Grünbaum and G. C. Shephard, "The eighty-one types of isohedral tilings in the plane", *Mathematical Proceedings of the Cambridge Philosophical Society* 82(2), 1977, 177–196. [doi:10.1017/S0305004100053810](https://doi.org/10.1017/S0305004100053810)
- OEIS A068599, "Number of n-uniform tilings", with the extensions by Marek Čtrnáct (2021). [oeis.org/A068599](https://oeis.org/A068599)
- Marek Čtrnáct and Eryk Kopczyński, Tessellation catalog. [zenorogue.github.io/tes-catalog](https://zenorogue.github.io/tes-catalog/?c=k-uniform%2F)
- Peter M. Neumann, "A lemma that is not Burnside's", *The Mathematical Scientist* 4(2), 1979, 133–141. On the history of the orbit-counting lemma; see also [Burnside's lemma](https://en.wikipedia.org/wiki/Burnside%27s_lemma).
- H. S. M. Coxeter, *Regular Polytopes*, 3rd ed., Dover, 1973. The Platonic solids, their Schläfli symbols and symmetry groups.
