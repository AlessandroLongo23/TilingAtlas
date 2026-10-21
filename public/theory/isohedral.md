# The 93 isohedral types

A tiling is *isohedral* when its symmetries can carry any tile onto any other. Every tile then sits in the tiling the same way: the same neighbours in the same places, the same symmetry acting on it. In Craig Kaplan's phrasing, the tiles form a single transitivity class under the symmetries of the tiling. The definition says nothing about the shape of the tile, and that is what makes it useful. A wobbly lizard and a plain hexagon can tile the plane in exactly the same pattern, and the pattern, not the outline, is what the classification counts.

There are 93 such patterns. Branko Grünbaum and Geoffrey Shephard enumerated them in 1977, and the explorer draws all 93: 81 as tiles whose edges you can bend, and twelve that only exist once the tiles carry a mark.

<iso-type-figure caption="Six isohedral types. On the left, the prototile: dots are its tiling vertices, the dashed polygon joins them, and each edge is lettered by the curve that draws it, upper case where that curve runs backwards. On the right, the tiling itself: click it, then drag, scroll and Shift+scroll to pan, zoom and turn it. Moving a tiling vertex changes the polygon; bending the edges changes the outline. Neither changes the type.">
</iso-type-figure>

## A tile is a polygon with decorated edges

Every isohedral tile, however curved, has a skeleton. Mark the points where three or more tiles meet: these are the tiling vertices, and between two consecutive ones the boundary runs as one edge. A tile in an isohedral tiling has between three and six tiling vertices, so its skeleton is a triangle, quadrilateral, pentagon or hexagon, and the skeletons on their own form one of eleven topological nets, the Laves tilings, which are the duals of the eleven Archimedean tilings.

That is the first coordinate of a type. The second is how the symmetries of the tiling act on the edges. Two edges of a tile can be copies of one another (a translation or a rotation of the plane carries one onto the other), and an edge can be its own copy under a half-turn about its midpoint or a reflection across its perpendicular bisector. Whatever the symmetry, it fixes how freely the edge may be drawn, and there are only four possibilities.

<iso-edge-figure caption="The four edge shapes Kaplan names after letters. A J edge can be any curve. A U edge is mirrored across its perpendicular bisector (the solid line), an S edge is unchanged by a half-turn about its midpoint (the ring), and an I edge is both, which forces it straight. Drag the bend: U and S edges keep their symmetry, J does not have one to keep.">
</iso-edge-figure>

In the 81 types the explorer draws with bendable edges, there are 188 distinct edge curves in all: 70 are J, 63 are S, 6 are U and 49 are I. Eighteen of the types use only J edges: no symmetry of the tiling maps any edge onto itself, and the outline is as free as it can be.

## Incidence symbols

Grünbaum and Shephard needed a notation fine enough to separate every type, and they wrote each one as an *incidence symbol* of two words. The tile symbol walks around the tile and labels each edge with a letter, the same letter for edges that the symmetries of the tiling carry onto one another; a sign records which way round the edge is taken, when that matters. The adjacency symbol then says, for each letter, which edge of the neighbouring tile it meets, and in which direction. The symbol for IH48, one of the twelve marked types below, is [a+b+c+d+; a−b−c−d−]: a quadrilateral whose four edges fall in four different classes, each with its sign.

The symbol alone is not enough. Kaplan points out that IH77, IH80 and IH87 share the symbol [a+b+c+; a−b−c−] and differ only in their topology. All three tiles are triangles, but they sit in different nets: IH87 in the plain triangular net, where six triangles meet at every vertex; IH80 in the tetrakis square net, where vertices see four, eight and eight; IH77 in the kisrhombille net, where they see four, six and twelve. A type is the pair, net and incidence symbol, and with both the count comes out at 93, numbered IH1 to IH93 in Grünbaum and Shephard's order. Twenty of them have six tiling vertices, 9 have five, 44 have four and 20 have three.

## Before Grünbaum and Shephard

The classification has a longer history than its numbering suggests. Heinrich Heesch, working with his sister Elli, had classified the tiles with no symmetry of their own that tile isohedrally by 1932, and found 28 types; Andrea Reichenberger's 2024 history records that they submitted the work in 1934 and then held it back. The 28 *Heesch types* appeared in print in Heesch and Otto Kienzle's book *Flächenschluss* (1963), written as words in letters for the motions that pair the edges: T for a translation, C for a rotation, G for a glide reflection. In 1935 Heesch also gave the first anisohedral tile, a tile that tiles the plane but never isohedrally, answering part of Hilbert's eighteenth problem.

Heesch's types cover asymmetric tiles in tilings with no mirror lines (glide reflections are allowed, hence the G). Grünbaum and Shephard dropped both restrictions. Their 1977 paper, "The eighty-one types of isohedral tilings in the plane", counts 81 types of isohedral tiling, and in the same work they classify *marked* isohedral tilings, where each tile carries a motif that the symmetries must respect; there are 93 of those. The difference between the two counts is twelve types, and it is not a matter of taste.

## The twelve that need a mark

In twelve of the 93 types (IH19, 35, 48, 60, 63, 65, 70, 75, 80, 87, 89 and 92), every edge of the tile lies on a mirror of the tiling, and the mirrors force the tile to be more symmetric than its type. Mirrors on every edge are not enough on their own: IH77 has them too, but its tile is a 30°-60°-90° triangle with no symmetry to gain, and it stays among the 81. Kaplan's account on his site is exact: "In these cases all tile edges act as mirrors, forcing those edges to be straight lines. As a result, the tiles are forced to be too symmetric to express the specific symmetries implied by the incidence symbol."

Grünbaum and Shephard's own example is IH19. Its tile is a hexagon whose symmetry group in the tiling should have order six, a triangle's worth of rotations and reflections. But a hexagon with all six edges on mirrors, all edges equal and all corners equivalent is regular, and the tiling by regular hexagons has the full symmetry of the hexagon: it is IH20. The outline cannot tell the two apart. Put an asymmetric mark on one tile and let the smaller group of IH19 copy it everywhere, and each hexagon carries six marks arranged with three-fold symmetry; the picture now has IH19's symmetry, and no more.

<iso-marked-figure caption="The twelve marked types. Each is drawn the way Grünbaum and Shephard construct it: one asymmetric mark, copied by the symmetry group of the type, on the tiles of the net. Switch to bare tiles and the type's own structure disappears: what is left is a more symmetric tiling of another type. Click the tiling to pan, zoom and turn it. The rectangles of IH48, IH60 and IH65 keep one parameter, their proportions.">
</iso-marked-figure>

Because their edges are forced straight, these twelve have no outline to bend. That is why Kaplan's Tactile, the library the explorer draws with, parameterizes 81 types and leaves the twelve aside, and why the 1977 paper's title says eighty-one. In the explorer they are drawn from the construction above, and each one's tile group, number of tile orientations and symmetry group were recomputed from the drawing and checked against Grünbaum and Shephard's table.

## Escher, and drawing with types

M. C. Escher drew his periodic patterns of birds, fish and lizards without this vocabulary, but the vocabulary describes them. As Kaplan puts it, nearly all of Escher's famous regular divisions of the plane can be understood in terms of isohedral tilings. An Escher tile is a type plus a choice of curve for each edge: J edges bent freely, S edges bent with a half-turn symmetry, U edges with a mirror, I edges left straight.

That is the design of the explorer. Choose one of the 81 types, move its tiling vertices with the parameter sliders (between zero and six of them, depending on the type), bend each distinct edge within its symmetry, and every result tiles. The figure at the top of the page is the same machine at a smaller scale.

<iso-type-figure types="1,7,10,41,55,71" caption="Six of the eighteen types whose edges are all J, with nothing to respect when they bend. The line under the sliders counts aspects, the orientations a tile takes in the tiling: one for IH1 and IH41, which use translations only, three for IH7 and four for IH55 and IH71.">
</iso-type-figure>

## Credits

The classification of isohedral tilings and marked isohedral tilings, the incidence symbols and the IH numbering are Branko Grünbaum and G. C. Shephard's (1977). The 28 asymmetric types are due to Heinrich and Elli Heesch, published with Otto Kienzle (1963). The edge-shape vocabulary J, U, S, I, the parameterization of the 81 types and the Tactile library the explorer uses are Craig S. Kaplan's, set out in his book *Introductory Tiling Theory for Computer Graphics* (2009).

## References

- B. Grünbaum, G. C. Shephard, [The eighty-one types of isohedral tilings in the plane](https://doi.org/10.1017/S0305004100053810), *Mathematical Proceedings of the Cambridge Philosophical Society* 82 (1977), 177–196.
- B. Grünbaum, G. C. Shephard, *Tilings and Patterns*, W. H. Freeman (1987), chapter 6.
- H. Heesch, O. Kienzle, *Flächenschluss: System der Formen lückenlos aneinanderschliessender Flachteile*, Springer (1963).
- A. Reichenberger, [Mathematics in difficult times: the hidden collaboration of Elli and Heinrich Heesch](https://bshm.ac.uk/mathematics-in-difficult-times-the-hidden-collaboration-of-elli-and-heinrich-heesch/), British Society for the History of Mathematics (2024).
- C. S. Kaplan, [Introductory Tiling Theory for Computer Graphics](https://doi.org/10.2200/S00207ED1V01Y200907CGR011), Synthesis Lectures on Computer Graphics and Animation, Morgan & Claypool (2009).
- C. S. Kaplan, [Isohedral tiles, tilings, and notations](https://isohedral.ca/isohedral-tiles-tilings-and-notations/), isohedral.ca.
- C. S. Kaplan, [Tactile](https://github.com/isohedral/tactile), a library for isohedral tilings (BSD licence).
