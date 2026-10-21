# Parquet deformations

A parquet deformation is a tiling that changes as you read it. At the left of a strip the tiles are plain squares; a little further on their edges have begun to bend, and by the right-hand end they have become something else, a pinwheel or a field of interlocking crosses. No column is quite like its neighbours, yet nowhere is there a gap or an overlap. The [parquet explorer](/parquet) builds these strips, and this page explains the one rule that keeps them whole.

<hcp-parquet-strip caption="A parquet deformation, starting from the square grid. Choose the base tiling, the shape every edge grows into, how the deformation runs along the strip (ramp: from straight at the left to full at the right; tent: out and back), and how far it goes. Tiles are tinted by how far their edges have travelled.">
</hcp-parquet-strip>

## Huff's studio and Hofstadter's column

The form comes from a design classroom. William Huff, an architect, set parquet deformations as an exercise in the basic design studios he taught from 1960 to 1980 at Carnegie Mellon University, the Hochschule für Gestaltung in Ulm and the State University of New York at Buffalo. His students drew them by hand, in black ink on white, as abstract studies in form. An account of the history by Elaine Krajenke Ellison and John Sharp (2010) traces Huff's idea to Escher's woodcut *Day and Night*, in which a checkerboard of fields turns into birds.

Douglas Hofstadter brought the drawings to a wide audience in his Metamagical Themas column in *Scientific American* for July 1983, "Parquet deformations: patterns of tiles that shift gradually in one dimension", and reprinted it as chapter 10 of the book *Metamagical Themas* (1985). The column reproduces a selection of the students' designs and explains how each one is built.

The obvious ancestor is Escher's *Metamorphosis* series. *Metamorphosis I* (1937) and *Metamorphosis II* (1939 to 1940) run tilings into one another along a strip. The second, almost four metres long, starts from the word *metamorphose*, which turns into a checkerboard, then into reptiles, a honeycomb, insects, fish and birds, the town of Atrani and a chessboard, and back to the word. Escher's tiles are figures; Huff's are not. Craig Kaplan, writing on both (2008, 2010), describes a parquet deformation as a kind of spatial animation: a tiling whose tiles evolve gradually along one dimension, or sometimes two.

## A tiling that changes along a line

The atlas builds a deformation the way Kaplan's 2010 paper does. Start from a periodic tiling whose edges are straight, and give each edge a family of shapes indexed by a time $t$ between 0 and 1: straight at $t = 0$, the final shape at $t = 1$, and in between a blend of the two. A function $D$ then assigns a time to every point of the strip. With a ramp, $D(x)$ rises from 0 at the left end to 1 at the right; with a tent it rises to 1 in the middle and falls back.

Each edge is drawn at the time its midpoint is given. Write the edge from $P_0$ to $P_1$ as a curve
$$c(s) = P_0 + s\,(P_1 - P_0) + t\,a\,d(s)\,(P_1 - P_0)^{\perp}, \qquad 0 \le s \le 1,$$
where $d(s)$ is the edge profile, the sideways offset of the final shape at position $s$ along the edge, $a$ is the overall amount, and $(P_1 - P_0)^{\perp}$ is the edge turned a quarter turn. A profile starts and ends at $d = 0$, so edges still meet at the tiling's vertices, which never move.

## Why no gap opens

Every edge in a tiling belongs to exactly two tiles. The whole construction rests on one requirement: both tiles must draw the same curve.

That is less automatic than it sounds. A tile drawn on its own walks around its boundary and bends each side by the profile, perhaps inward. Its neighbour walks the shared side in the opposite direction, and bends it inward too, which for the neighbour is the opposite side. Two arches bowing away from each other leave a lens-shaped hole between them; two bowing toward each other overlap.

<hcp-parquet-edge caption="Two squares and the edge they share. With one curve per edge, both squares use the same curve and fit. With one curve per tile, each square bends its own side inward: an arch or a fret opens a gap, while the S-shaped pinwheel edge still fits, because its offset at s is minus its offset at 1 − s.">
</hcp-parquet-edge>

The fix is to make the curve a property of the edge, not of the tile. The atlas orders each edge's two endpoints the same way whoever asks, computes one curve from that ordered pair and from the time at the edge's midpoint, and hands the same curve to both tiles. The midpoint is the same point for both tiles, so they read the same time, and the curve depends on nothing else. Whatever $D$ does, from a gentle ramp to a two-dimensional field, every edge is shared exactly and the tiles cover the strip with no gaps and no overlaps.

What the rule cannot prevent is a curve bending so far that it crosses another edge of its own tile. That is a self-intersection, a different failure from a gap, and it is why a large enough amount can tangle a tile.

## Four edge profiles

The explorer offers four profiles, and each one shows a different side of the construction.

- *Straight*: $d(s) = 0$. Nothing moves; it is the starting point of every strip.
- *Pinwheel*: an S-shaped edge that bulges one way in its first half and the other way in its second, with $d(s) = -d(1 - s)$.
- *Wavy*: a single smooth arch, symmetric about the middle of the edge, $d(s) = d(1 - s)$.
- *Fret*: a square tab on the middle third of the edge, the rectilinear motif of a Greek key, also symmetric.

The pinwheel's symmetry condition is what makes it a pinwheel. Turn the edge end for end and walk it from the other side: the offset at $s$ becomes $-d(1-s)$, and for an S-edge that is $d(s)$ again, so the curve looks the same from either end. When every edge of the square grid carries the same S, a quarter turn of a tile carries each of its sides onto the next one, curve and all, and the tile keeps the square's fourfold rotation while losing its mirror lines. The tiles seem to spin, all in the same direction. An arch or a fret, symmetric about its midpoint, gives a tile that bulges out on two sides and in on the other two: it tiles by translation, but a quarter turn does not carry it onto itself.

<hcp-parquet-turn caption="The fully deformed square grid (click it to pan, zoom and turn it), and beside it one tile with its quarter turn about the centre of its square, dashed. With the pinwheel edge the turned tile lands exactly on itself; with the arch or the fret it does not.">
</hcp-parquet-turn>

The same S-condition shows up in the edge figure above: since an S-edge is the same curve from both ends, even two tiles that bend their sides independently happen to agree on it. The shared-curve rule does not need that coincidence, which is why the arch and the fret work too.

## Strips and patches

A strip deforms along one direction: $D$ depends only on $x$, and every column of tiles is at one stage of the change. The explorer also builds two-dimensional patches. There each corner of a rectangle carries its own edge profile, and the shape at any point blends the four corner profiles with bilinear weights, so the tiles change along both directions at once. Nothing in the gap argument changes: the weights are still read at each edge's midpoint, so the curve is still shared.

The base tiling can be the square, triangle or hexagonal grid. In each of them all edges are alike, so one profile serves for every edge; the only thing that differs from grid to grid is how many edges meet at a vertex and how the tiles' symmetries turn a profile into a tile shape.

## Credits

The parquet explorer and its generator were written for the atlas, following the edge-evolution framework of **Craig S. Kaplan**'s "Curve evolution schemes for parquet deformations" (2010): a time assigned to every point of the plane, read at the midpoints of the edges. The form itself is **William Huff**'s, and its popular account **Douglas Hofstadter**'s.

## References

- D. R. Hofstadter, Metamagical Themas: Parquet deformations, patterns of tiles that shift gradually in one dimension, *Scientific American* 249(1), July 1983, 14–20.
- D. R. Hofstadter, Parquet deformations: a subtle, intricate art form, chapter 10 of *Metamagical Themas: Questing for the Essence of Mind and Pattern*, Basic Books, 1985, 191–212.
- C. S. Kaplan, Metamorphosis in Escher's art, *Bridges 2008: Mathematical Connections in Art, Music and Science* (2008), 39–46.
- C. S. Kaplan, [Curve evolution schemes for parquet deformations](https://archive.bridgesmathart.org/2010/bridges2010-95.html), *Bridges 2010: Mathematics, Music, Art, Architecture, Culture* (2010), 95–102.
- C. S. Kaplan, [Metamorphoses and deformations](https://cs.uwaterloo.ca/~csk/other/morph/), with parquet deformations generated by computer.
- E. K. Ellison, J. Sharp, [Tiled torus quilt with changing tiles](https://static1.bridgesmathart.org/2010/cdrom/proceedings/08/paper_8.pdf), *Bridges 2010* (2010), on Huff, Escher and Hofstadter.
- [Metamorphosis II](https://en.wikipedia.org/wiki/Metamorphosis_II), M. C. Escher, woodcut, 1939 to 1940.
