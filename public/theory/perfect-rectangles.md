# Every polyhedron hides a squared rectangle

Cut a rectangle into squares, all of them different sizes. It sounds like the kind of puzzle that either has an easy answer or no answer, and for forty years nobody could tell which. The thing that finally cracked it is the reason this page exists in a tiling atlas: the answer turned out to be about polyhedra, and the atlas is full of polyhedra.

What follows is that correspondence, run in the direction the atlas makes available. Every solid in the catalogue whose skeleton is planar yields squared rectangles, one for each way of choosing a single edge, so every one of them has a family of rectangles attached to it that nobody had drawn. There are 667 of them across 105 solids, and eleven are perfect.

## A gold bar that should have been a square

In 1902 Henry Dudeney published a puzzle called Lady Isabel's Casket in *The London Magazine*. A strip of gold sits in a square casket, and the rest of the space is packed with square wooden blocks, no two the same size; from that, deduce the casket's dimensions. The puzzle works, and the solution is not obvious.

What bothered Arthur Stone, reading it as a Cambridge undergraduate in the late 1930s, was the gold bar. Everything else in the casket was a square. Why was that one piece a rectangle? Perhaps Dudeney chose it for flavour, or perhaps he knew that making it square would make the puzzle impossible.

Stone brought the question to three friends at the Trinity Mathematical Society: R. L. Brooks, C. A. B. Smith and W. T. Tutte. The four of them published together under the shared pseudonym Blanche Descartes, and the paper they eventually wrote, *The dissection of rectangles into squares* (Brooks, Smith, Stone and Tutte, *Duke Mathematical Journal* **7** (1940), 312–340), is where all of this comes from.

Two words from that paper do most of the work here. A squaring is **perfect** when no two of its squares are the same size. It is **simple** when no smaller rectangle inside it is itself made of a group of the squares; a squaring that fails this is **compound**, and it is really two smaller puzzles stacked, so it does not count as a new solution.

## Smith noticed that a squaring is a circuit

Take any squared rectangle and look at one of its horizontal lines, the full segment from where it starts to where it ends. The squares sitting on top of that segment are exactly as wide, in total, as the squares hanging below it. They have to be, because there is no gap and no overlap.

Smith's observation was that this is Kirchhoff's current law. Collapse every maximal horizontal segment to a single point, turn every square into a wire joining the segment along its top edge to the segment along its bottom edge, and let the wire carry a current equal to the square's side. Current in equals current out at every junction, which is the statement above. Give each wire unit resistance and Ohm's law, $I = \Delta V$, says the square's height equals the difference between the two segments' heights, which is the other thing a tiling has to satisfy.

Both conditions for a valid squaring are electrical laws. A squared rectangle is not merely *like* a circuit; the tiling and the circuit are the same object written two ways. Attach a battery from the bottom edge to the top, switch it on, and the currents that settle are the side lengths you started with.

<card-grid cols="2">
<squaring-card solid="cube" caption="The cube's 12 edges are all equivalent under its symmetry group, so the cube has exactly one squared rectangle. This is it: 11 tiles, but only four distinct sizes, and the repeats are the equal colours."></squaring-card>
<squaring-card solid="octahedron" caption="The octahedron, the cube's dual, gives the same tiling turned on its side. Duality swaps the two potentials the construction uses, so it swaps width and height."></squaring-card>
</card-grid>

## Running it backwards needs a second potential

The direction that matters is the other one. Given a graph, build the rectangle.

Choose an edge of the graph to be the battery, delete it, and solve for the potential $V$ at every vertex with the two former endpoints held at fixed values. Away from those two poles the solution is harmonic: each potential is the average of its neighbours', which is Kirchhoff's law rearranged. That gives every square its vertical position and its size, since the current along an edge is $V(u) - V(v)$.

It does not give the horizontal position, and this is the step that looks like it should be hard. It is not, because the horizontal coordinate is a second potential living on the graph's **faces** instead of its vertices. Put the battery edge back so it carries the return current, and define $\psi$ on faces by

$$\psi(\text{right of } e) - \psi(\text{left of } e) = I(e)$$

Going around any vertex, the currents sum to zero, so $\psi$ is consistent, and one walk over the dual graph computes it. No second solve is needed.

Now the tile for the edge from $u$ down to $v$ is the box $[\psi_{\text{left}}, \psi_{\text{right}}] \times [V(v), V(u)]$, and it is automatically a **square**, because the edge's current is simultaneously its potential drop and its $\psi$ jump. The two sides are equal because they are the same number counted twice. That single identity is the entire trick.

The sides come out as whole numbers, and not by a convenient choice of scale. Max Dehn proved in 1903 that a rectangle can be cut into squares only when the ratio of its two sides is rational, and that when it can, all the squares are commensurable: fix any one of them as a unit and every other side is a rational multiple of it. A squared rectangle with two tiles in the ratio $\sqrt{2}$ does not exist and cannot be built. Whole numbers are the only thing the plane offers, which is worth remembering when the torus turns out to offer more.

The scale itself is worth stating too, since it gives a way to check the arithmetic. By Kirchhoff's matrix-tree theorem the natural scale for the solution is a count of spanning trees, and in that scale

$$W + H = \tau(G)$$

where $\tau(G)$ is the number of spanning trees of the whole graph. A spanning tree either uses the battery edge or avoids it, and those two counts are the height and the width. The cube has 384 spanning trees, and every rectangle built from it, whichever edge carries the battery, has width plus height equal to 384. The atlas checks this for every squaring it ships.

## The graph has to be a polyhedron

Here is the part that makes this a page in a tiling atlas.

Not every graph gives a usable rectangle. If some piece of the network is attached to the rest at only two points, current entering that piece has exactly one way out, the piece behaves as an isolated block, and what you get in the picture is a compound rectangle: a smaller squared rectangle sitting inside the big one. Brooks, Smith, Stone and Tutte proved the converse, which is the useful statement. A **simple** squared rectangle has a network that is **3-connected**: no two vertices can be removed to break it apart.

By Steinitz's theorem, the 3-connected planar graphs are exactly the edge skeletons of convex polyhedra. So a simple squared rectangle is a convex polyhedron with a battery attached to one of its edges, and the search for perfect squarings became a search through polyhedra. That is how Tutte found the first simple perfect squared square, working through polyhedral graphs with 56 edges.

The converse fails in one direction, and the failure is not an edge case in this catalogue; it is the main finding below. A 3-connected graph does not have to produce a simple squaring. If two vertices happen to land at the same potential, their horizontal segments merge, the picture has fewer segments than the graph had vertices, and compound blocks appear that the graph gave no warning of.

## What the atlas's own solids give

Every convex polyhedron in this catalogue is eligible, and so is any other solid whose skeleton happens to be planar. Running the construction over the 40 named solids, the 20 spherical $3.4.n.4$ tilings, the 16 halved-Platonic tilings and 29 star polyhedra gives 667 distinct rectangles.

The star polyhedra come with a gate attached. Only 29 of the 54 in the catalogue have Euler characteristic 2; the rest close up on a surface of higher genus, have no planar embedding, and so have no Smith diagram at all. Those that pass are a reminder that the construction sees nothing but the graph: the great icosahedron $\{3,5/2\}$ has the icosahedron's twelve vertices and thirty edges, and produces the very same rectangle.

The first surprise is how few. A polyhedron has one rectangle per edge, but edges related by a symmetry give literally the same rectangle, so what counts is the number of edge orbits. Every Platonic solid is edge-transitive and therefore has exactly **one** squared rectangle, and not one of the five is perfect. The most symmetric objects in the catalogue have the least to say here, which is precisely why the Trinity four had to look past them.

<card-grid cols="2">
<squaring-card solid="icosahedron" caption="The icosahedron: 25 tiles drawn from just 5 distinct sizes. Its symmetry group has order 120, and almost every tile has a twin somewhere."></squaring-card>
<squaring-card solid="metabidiminished-icosahedron" caption="The metabidiminished icosahedron (Johnson solid J62), which is the same solid with two vertices removed. 19 tiles, all different, and no compound block: a simple perfect squared rectangle, 1238 by 1102."></squaring-card>
</card-grid>

Those two are worth comparing directly, because they are nearly the same object. Remove two vertices from the icosahedron and its symmetry group collapses from order 120 to order 4; the number of distinct rectangles rises from one to seven; and two of those seven are perfect. Nothing about the tiles changed. What changed is how much freedom the solid had left.

The four steps between a solid and its rectangle are easier to watch than to read about, so they have [their own page](/theory/perfect-rectangles/pipeline): the polyhedron, its graph pulled flat by Tutte's springs, the circuit with height set to voltage, and the finished tiling, for the 73 solids whose rectangle is small enough to follow. An edge keeps its identity across all four, so pointing at one lights it up everywhere, and clicking one makes it the battery and re-solves the whole chain. That is the quickest way to see what this section is claiming: J62 has twenty edges and only seven distinct rectangles between them, because edges the solid's symmetries carry onto each other give literally the same tiling.

## Symmetry is the obstruction

Across the 65 records that carry a measured symmetry order, the pattern is clean and one-directional.

**No polyhedron whose isometry group has order 6 or more produces a perfect squaring.** That holds for all 54 such records, without exception. The mechanism is the one described above: a symmetry carrying one vertex to another forces the two onto the same potential, equal potentials force equal currents, and equal currents are equal tiles. Perfection asks every tile to be different, and a symmetry is a standing instruction that two of them be the same.

The obstruction is graded, not a threshold. Counting how many tile sizes the best squaring gives up to repeats, by the order of the solid's isometry group:

| symmetry order | records | sizes lost to repeats |
| --- | --- | --- |
| 2 | 5 | 0 |
| 4 | 6 | 0 (five of them), 4 |
| 6 | 4 | 1 |
| 8 | 3 | 1, 3, 4 |
| 10 | 4 | 2, 2, 2, 5 |
| 12 | 4 | 3, 4, 7, 8 |
| 14 | 2 | 7 |
| 16 | 1 | 3 |
| 20 | 6 | 4, 4, 4, 6, 9, 9 |
| 24 | 2 | 8, 25 |
| 28 | 5 | 9, 9, 13, 13, 13 |
| 32 | 5 | 12, 12, 12, 15, 15 |
| 40 | 2 | 13, 20 |
| 48 | 5 | 14, 22, 25, 25, 34 |
| 60 | 3 | 22 |
| 120 | 8 | 20, 20, 43, 53, 62, 66, 66, 92 |
At order 6 the best squaring misses perfection by exactly one repeated pair, in all four cases. At order 10 it misses by exactly two, in all three. At order 120, the icosahedron gives up 66 of its 119 sizes.

The converse does not hold, and I want to be plain about that because it would be the tidier claim. Low symmetry only permits perfection. Ten of the eleven records with symmetry order 4 or less have a perfect squaring; the exception is one halved-cube tiling which has symmetry order 4 but only four distinct rectangles to search, and none of the four is perfect. Having few edge orbits is its own obstruction, independent of the group's order.

<card-grid cols="2">
<squaring-card solid="shcube-half-4-00001" caption="A halved-cube tiling with symmetry order 4: seven distinct rectangles, three of them perfect. This is the best, 4031 by 3109, 17 tiles, all different, no compound block."></squaring-card>
<squaring-card solid="shcube-half-2-00005" caption="The exception. Same board, also symmetry order 4, but only four rectangles to choose from and none perfect: 17 tiles across 13 sizes."></squaring-card>
</card-grid>

## One genus up: the class replaces the battery

On a sphere you have to remove an edge, because a harmonic function on a finite graph with no boundary is constant and the battery is what breaks that. On a torus nothing has to be removed. A periodic plane tiling divided by its own translation lattice is a graph on a torus, and the potential can be quasi-periodic instead of periodic: it climbs by $m$ each time you cross the cell one way and by $n$ the other. So the choice is not an edge but a class in $H^1(T;\mathbb{R}) \cong \mathbb{R}^2$, and one tiling carries a whole family of squared tori where a polyhedron carries one rectangle per edge orbit.

Genus 1 is the last genus where this stays a flat picture, and the reason is Gauss–Bonnet. Cone angles in a square tiling are forced to be $2\pi k$ for integer $k \ge 1$, and $\sum (2\pi - \text{angle}) = 2\pi\chi$. At $\chi = 0$ every $k$ must be 1, so there are no cone points. At genus 2 and beyond, $\chi < 0$ forces $\sum (k_i - 1) = 2g - 2 > 0$ cone points and the result is a translation surface, not a plane tiling.

Nothing makes $m$ and $n$ integers. Every real direction is a genuine squared torus, and the certificate $\sum \text{side}^2 = \text{covolume}$ is the Riemann bilinear relation $\lVert\omega\rVert^2 = \int \omega \wedge \star\omega$, which holds over $\mathbb{R}$. What integrality buys is arithmetic: at an integer class the sides are integers a BigInt solve can compare, and off it they are reals in the $\mathbb{Q}$-span of $\{m, n\}$, where "these two tiles are the same size" stops being decidable. The pipeline page therefore prints the sides only on the lattice, and its class control sticks to the integer classes as you drag through the real ones.

## The family is not one smooth thing

Every square's side is a linear form in $(m, n)$. The reduced Laplacian is built from the lattice shifts alone, so its determinant never sees the class, and the class enters only on the right-hand side. Each edge $e$ therefore vanishes on its own line

$$L(e) = \{(m, n) : a_e m + b_e n = 0\}$$

through the origin, and those lines cut the circle of directions into angular sectors on which the arrangement is combinatorially constant. Crossing one makes a square shrink to nothing and reappear somewhere else. That is Dutour Sikirić's Sq-domain decomposition, and it is what the parameter plane on the pipeline page draws.

Two squares come out the same size where $|a_e m + b_e n| = |a_f m + b_f n|$, which is again a pair of lines through the origin. So a perfect squared torus is a class that misses every one of them: perfection is a condition on the parameter, not luck. And when $(a_e, b_e) = \pm(a_f, b_f)$ the two sides agree at every class at once and no line separates them, which is the half-turn rule made mechanical. A half-turn acts as $-1$ on $H^1$ for every class simultaneously, so it locks every edge orbit it moves and the tiling is imperfect everywhere. A 3-, 4- or 6-fold rotation costs nothing, because it fixes no non-zero class.

## How far the sizes can drift

Dehn's theorem is what makes the previous two sections surprising. In the plane the sides of a squaring are
locked to a single ruler. On a torus they are not, and Richard Kenyon worked out exactly how far they get.

Call a set of lengths $d$-dimensional over $\mathbb{Q}$ if you need $d$ fixed rulers to write them all as
rational combinations, and no fewer. Dehn's theorem says a squared rectangle is one-dimensional: one ruler
does the whole job. Kenyon's Corollary 12 says that a square tiling of a closed surface of genus $g$ is at
most $2g$-dimensional, and that the bound is achieved. The torus gets two rulers where the rectangle gets
one, and that second ruler is the entire extra freedom.

It is easy to see why our construction can never exceed two, and the reason is the linear form from the
previous section. Every side is $|a_e m + b_e n|$ with $a_e$ and $b_e$ integers fixed by the map, so every
side is a rational combination of $m$ and $n$ and nothing else. Two rulers, handed to you by the two
coordinates of the class. Kenyon's bound is not merely respected here; it is the same fact seen from the
other side.

Generically it is reached. Evaluating the trihexagonal record at the class $(1, \sqrt{2})$, a direction the
pipeline page's control snaps past precisely because it misses the integer lattice, four of its six tiles
pick up a non-zero $\sqrt{2}$ part, two come out in the ratio $\sqrt{2} - 1 = 0.41421356\ldots$, which no fraction equals, and
$\sum \text{side}^2$ still lands on the covolume. Incommensurable squares, tiling a surface, exactly the
thing Dehn ruled out one dimension down.

## Which tori can be squared at all

The freedom has a sharp limit in the other direction, and it is easy to miss while dragging the class around:
you are not choosing a tiling of a fixed torus. The torus moves too. Each class gives a lattice, so sweeping
the direction sweeps the shape of the surface as well as the sizes of the tiles.

Kenyon settled which shapes are reachable. Write a flat torus as the plane divided by the lattice generated
by $1$ and a complex number $z$ in the upper half-plane, so $z$ is the shape and every torus is some $z$. His
Theorem 10 says $T_z$ can be tiled by squares exactly when $z$ lies on a circle of rational centre and
rational radius that stays off the real axis, or on a horizontal line at rational height. Those curves are
dense, and they are still only curves: the square-tileable tori are a one-dimensional subset of the
two-dimensional space of shapes, so almost every flat torus admits no square tiling whatsoever.

Two examples make the shape of that result concrete. The equilateral torus, $z = \tfrac{1}{2} + i\tfrac{\sqrt{3}}{2}$,
the most symmetric one there is, cannot be squared in any direction at all. The rectangular torus of height
$1 - \tfrac{\sqrt{3}}{2}$, an irrational shape with no symmetry to recommend it, can. Being square-tileable
has nothing to do with looking regular.

This is also the consistency check on everything above. A single map contributes one curve of tori as its
class direction sweeps, because scaling a class scales the whole picture and leaves the shape alone. Countably
many maps contribute countably many curves. A dense one-dimensional subset is exactly what that adds up to.


## Hyperbolic: a ball, and a cylinder

A hyperbolic tiling is infinite, so there is no finite surface to divide it by and no homology class to choose. What gets squared instead is a ball cut out of the tiling with its whole boundary shorted to a single vertex. The answer is not a rectangle: the horizontal coordinate is only defined modulo the total current, because a loop around the centre picks that current up, so the tiling lives on a **cylinder**.

The circumference of that cylinder is the effective conductance from the centre out to the boundary, and it settles on a positive limit exactly when the random walk escapes to infinity. That is the whole content of the hyperbolic case. The Euclidean $\{3,6\}$ is the control that shows it: run the same construction there and the walk is recurrent, the circumference turns over and decays, and the cylinder collapses as the ball grows. The construction is Benjamini and Schramm's, and Georgakopoulos later showed the boundary circle the squares accumulate on is the Poisson boundary of the walk.

## What is and is not being claimed

These are not new rectangles. Every simple perfect squared rectangle up to order 21 has been catalogued exhaustively, and there are 31,426 of order 17 alone, so the order-17 examples above sit somewhere in a list that already exists. Nothing here extends that list.

The claim is the attachment. Each rectangle on this page belongs to a specific solid in this catalogue, arrived at by a construction with no choices in it beyond which edge carries the battery, and the arithmetic is exact from end to end, integers throughout, with no rounding anywhere. The largest sides in the corpus run to 27 digits, which is far past the point where floating point can tell two tile sizes apart, and since a squaring is perfect exactly when all its sides differ, rounding would not blur these results so much as invert them.

Every squaring shipped here has been certified to cover its rectangle exactly, with no gap and no overlap, on a grid where every tile boundary is a line. The spanning-tree identity $W + H = \tau(G)$ is checked for every edge of every solid. The Bouwkamp codes replay to the tilings they came from.

## Sources

The Brooks, Smith, Stone and Tutte paper is *The dissection of rectangles into squares*, *Duke Mathematical Journal* **7** (1940), 312–340. Tutte's own recollection of how the four of them worked is in *Graph Theory as I Have Known It*.

Stefan Felsner's survey *Rectangle and Square Representations of Planar Graphs* states the construction in its modern form; its Theorem 4.1 gives the side of each edge as a difference of spanning-tree counts, which is the integrality used here.

Stuart Anderson's [squaring.net](https://www.squaring.net/) holds the exhaustive catalogues, the counts by order, and the history.

The rationality of a planar squaring is Max Dehn, *Über Zerlegung von Rechtecken in Rechtecke*, *Mathematische Annalen* **57** (1903), 314–332; Andrew Putman's notes [*Tiling by squares*](https://academicweb.nd.edu/~andyp/notes/TilingBySquares.pdf) give a short modern proof.

The genus-1 case is Mathieu Dutour Sikirić, *Torus square tilings*, *Applicable Algebra in Engineering, Communication and Computing* **23** (2012), 251–261 ([arXiv:1101.0223](https://arxiv.org/abs/1101.0223)), whose Theorem 3(ii) identifies the space of periodic harmonic vectors with $H_1(T,\mathbb{R})$ and whose §4 is the sector decomposition drawn on the pipeline page. He is explicit that the parameters are real and that integrality is a separate and harder question: “if one imposes that square sizes are integral then we do not have the answer to the question.”

Edward Chien's *Square tilings of surfaces from discrete harmonic 1-chains* ([Rutgers, 2015](https://rucore.libraries.rutgers.edu/rutgers-lib/48436/)) carries the construction to every genus $g \ge 1$: his Theorem 3.3.1 builds a square-tiled flat cone metric from any generic class in $H_1(\Sigma_g,\mathbb{R}) \setminus \{0\}$, where generic means the harmonic representative has no zero coefficient, which is the condition of being off the walls above. His Theorem 4.1.1 handles the walls themselves, where the tiling lands on a surface of equal or lower genus.

The two limits on how far the sizes can drift are both Richard Kenyon's, in [*Tiling with squares and square-tileable surfaces*](https://citeseerx.ist.psu.edu/document?repid=rep1&type=pdf&doi=eec731c9882dcb80a2fb1dbe2073b85e3ed13753) (Prépublication ENS Lyon **119**, 1993): Corollary 12 is the $2g$ bound on the dimension of the $\mathbb{Q}$-vector space generated by the side lengths, together with the fact that the bound is optimal, and Theorem 10 is the characterisation of the square-tileable tori as the rational circles and rational horizontal lines. His *Tilings and discrete Dirichlet problems*, *Israel J. Math.* **105** (1998), 61–84, is the published treatment of the same circle of ideas.

The hyperbolic case is Itai Benjamini and Oded Schramm, *Random walks and harmonic functions on infinite planar graphs using square tilings*, *Annals of Probability* **24** (1996), 1219–1238. Agelos Georgakopoulos identified the resulting boundary circle with the Poisson boundary in *The boundary of a square tiling of a graph coincides with the Poisson boundary*, *Inventiones* **203** (2016).

The framing of this page, and the observation that a 3D mesh run through the correspondence produces an enormous simple squared rectangle, comes from [aiyopasta's video on squared rectangles](https://www.youtube.com/watch?v=0fH80JF2mDM), which is where I first saw the connection laid out. The second potential $\psi$ and the spring-embedding view of the same mathematics are both explained there at more length than they are here.
