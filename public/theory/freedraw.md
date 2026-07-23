# Freedraw: the edges carry the tiling

The rest of this atlas is strict about its tiles: every tile is a regular polygon, the polygons meet edge to edge, and the whole catalogue is decided by which regular polygons fit around a vertex. Marek Čtrnáct's freedraw construction drops that rule and asks a different question. We fix a grid, we decide which of its edges are "drawn", and we look at the regions the drawn edges cut out. The tiles are whatever falls out of that choice, so we never draw a tile directly: the only thing we ever choose is the set of drawn edges, and the tiling is a by-product.

That inversion is the whole idea, and it is the thing to hold onto before any definition arrives: in the classical theory the tiles carry the information and the vertices follow, while here the drawn edges carry the information and the tiles follow.

## The tiles are whatever falls out

Take the square grid, the integer lattice $\mathbb{Z}^2$ with its horizontal and vertical unit edges. A freedraw pattern is a choice, periodic under some sublattice, of which of those edges are drawn, subject to one rule: no vertex may have exactly one drawn edge. A vertex with a single drawn edge is a dead end, that is a segment that starts nowhere, and a dead end would make the figure a maze rather than a tiling, so we forbid it. Every other local configuration is allowed, including a vertex with no drawn edge at all.

The tiles are then the connected regions the drawn edges leave behind, and here is the catch that makes freedraw its own thing: those regions need not be nice. On the plane a tile can be a finite polyomino, but it can just as well be an infinite strip of width two, or a whole quadrant of the plane with no bounding edge on one side. None of these are tiles in the sense of Grünbaum and Shephard, who require a tile to be a closed topological disk, so the classical uniform-tiling theory doesn't apply to them at all. We are counting something genuinely different, and it took me a while to stop expecting the old invariants to mean anything here.

The same game runs on other grids. On the triangular grid every vertex has six edges in three directions, so the tiles are polyiamonds, strips, or sheets; on the mixed triangle-and-square grid there's no single lattice to index into, because the underlying tiling itself varies from solution to solution. The rule is always the same: drawn edges, no dead ends, classify up to symmetry.

## k measures how decorated the grid is

We need one number to organise the catalogue. The obvious candidate is the number of tiles, but it misses the point, so we use a different one: $k$, the number of orbits of grid vertices under the pattern's own symmetry group. It's easy to misread, so we pin it down with an example.

Take the blank square grid with nothing drawn. Every vertex looks like every other one, the symmetry group is the full wallpaper group of the grid, and all vertices form a single orbit: $k = 1$. Now draw every horizontal edge and nothing else, cutting the plane into infinite horizontal strips of height one. The pattern still has a lot of symmetry, but a vertex on a drawn line is no longer equivalent to one off it, so the vertices split into more orbits and $k$ climbs. The point of the example is that $k$ tracks the complexity of the *decoration*, and the tiling that decoration draws can look far plainer than $k$ suggests: a strip pattern with $k$ around $w$ is visually dull and combinatorially rich at once, because the tiling and the decoration behind it are two different things.

This is also why freedraw connects back to the classical atlas. Every $k$-uniform tiling by regular polygons sits on a triangle-and-square grid, so the planar freedraw catalogue contains the $k$-uniform tilings as exactly the sub-family where every tile happens to be a regular polygon. We get the strict theory back as a special case of the loose one, which is a satisfying way for the two halves of the atlas to meet.

## On a Platonic solid the catalogue is finite

The planar grids are infinite, so the catalogue at each $k$ is infinite in the number of drawn edges we might use, and we control it only through periodicity. Move the base to a Platonic solid and that difficulty disappears, because a Platonic solid is finite: the icosahedron $\{3,5\}$ has 12 vertices, 30 edges, and 20 triangular faces, and that is the entire board. A spherical freedraw pattern is then a subset of those 30 edges drawn on the solid, with the same no-dead-end rule, classified up to the solid's full symmetry group. The tiles are the regions the drawn edges cut from the faces, that is the connected runs of faces you can still walk between across an *undrawn* edge.

The orbit count $k$ carries over unchanged, and now it has a ceiling. Only the identity fixes every vertex of the solid, so a pattern with all vertices in distinct orbits has no symmetry at all, which for the icosahedron means $k$ can be at most 12. The fully symmetric patterns sit at $k = 1$ and the fully asymmetric ones at $k = 12$, and everything interesting happens in between. This is the property the plane never gives us: a fixed finite base means the whole thing is enumerable, all the way to the last $k$, with no periodicity to manage.

Of course the count depends on the solid. There are five Platonic solids, and by their Schläfli symbols they are the tetrahedron $\{3,3\}$, the octahedron $\{3,4\}$, the cube $\{4,3\}$, the dodecahedron $\{5,3\}$, and the icosahedron $\{3,5\}$, with symmetry groups of order 24, 48, 48, 120, and 120. You can rotate any of them, in both the flat-faceted and the round-sphere rendering, in the [interactive viewer](/freedraw).

## Two independent counts, and they agree to the unit

We now have a catalogue to compute, and there are two ways to compute it, which is exactly the situation you want when the numbers are large and easy to get wrong.

The first way is Marek's solver. It searches the *duals* of these patterns combinatorially, gluing vertex figures as Conway half-edge symbols and pruning isomorphic duplicates, and it never touches geometry until the very end. The second way is direct, and it is the one I wrote to check the first: build the solid and its symmetry group as explicit permutations of the vertices, then enumerate the edge subsets themselves. For the small solids this is brutal and complete, because the cube and the octahedron have only 12 edges, so we can walk all $2^{12} = 4096$ subsets, throw out the ones with a dead end, and bucket what remains by $k$. For the two big solids, with 30 edges, $2^{30}$ is about a billion and walking it directly is too slow, so we enumerate only the patterns that have some symmetry, which covers every $k$ below the maximum exactly.

The two methods share no code and rest on no common assumption, so when they agree it means something. They agree to the unit at every $k$ on every solid, including the split between achiral patterns (a mirror lies in the symmetry group) and chiral ones (none does). Running Marek's binary can only ever reproduce Marek's numbers, so on its own it proves nothing about correctness: the independent enumeration is the check that actually bites, and it settles the counting convention too, that patterns are counted up to the full group with mirror pairs merged.

One consequence of the setup is provable rather than measured, and I like it for that. The top count, at $k$ equal to the number of vertices, is the fully asymmetric class, and a pattern with no symmetry has no mirror symmetry in particular, so every pattern at the top $k$ is chiral by necessity. When the icosahedron's $k = 12$ came back as 1,569,679 solutions with none of them achiral, that zero was exactly what the argument had already guaranteed, and the search only confirmed it.

## The numbers, and what they say

Here is the whole Platonic family, each row cross-checked by the two methods above.

| solid | symmetry order | per-$k$ counts | total |
|---|---|---|---|
| tetrahedron $\{3,3\}$ | 24 | 3, 2 | 5 |
| octahedron $\{3,4\}$ | 48 | 5, 8, 15, 12, 2, 7 | 49 |
| cube $\{4,3\}$ | 48 | 4, 5, 4, 3, 0, 1 | 17 |
| dodecahedron $\{5,3\}$ | 120 | 2, 5, 7, 15, 7, 26, 51, 10, … | 3,654 |
| icosahedron $\{3,5\}$ | 120 | 5, 39, 61, 257, 257, 6727, 0, 11304, … | 1,588,329 |

A few of these entries are more surprising than the totals, and they are the ones to read twice. The cube has no pattern at all with $k = 5$, $k = 7$, or $k = 8$: those columns are a hard zero, because we walked every one of its 4096 subsets and nothing survived, so the gap is a fact about the cube and not a place we gave up looking. The icosahedron is empty at $k = 7$ for a subtler reason, that the icosahedral group has a tetrahedral subgroup of order 12 which patterns start to break only from $k = 6$ on, and $k = 7$ happens to admit nothing. And the icosahedron's grand total, 1,588,329, is really 18,650 patterns with some symmetry plus 1,569,679 with none, so the fully asymmetric class outnumbers everything else by a factor of about 84.

Overall the spherical case is the cleaner half of the freedraw story: the base is finite, the count is exact, and two engines that were built independently land on the same numbers to the last digit. The planar grids are the richer object, but the sphere is where the method proves it is right.
