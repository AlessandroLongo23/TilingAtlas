# How far a shape gets

A shape that tiles the plane can be surrounded by copies of itself, and the result surrounded again, forever. A shape that cannot tile may still get some way. Its Heesch number counts how many complete rings of copies it can gather before every attempt to add one more fails, and the [Heesch explorer](/heesch) holds that number for every small polyomino, polyiamond and polyhex that does not tile.

<hcp-corona set="omino7" shapes="0,1,2" caption="The three heptominoes that do not tile the plane, out of the 107 without a hole. Step through their coronas, and switch between the strict count and the one that lets the outer ring enclose a hole: the third shape can only be surrounded with a hole left in the ring.">
</hcp-corona>

## Rings of copies

Put a shape down. A *corona* of it is a set of congruent copies, placed without overlapping the shape or each other, that together cover its whole boundary: nothing of the shape is left exposed. The shape itself is the 0th corona. If the shape and its first corona can be surrounded in turn, the new copies are a second corona, and so on, each ring closing around everything inside it.

The Heesch number $H$ of a shape is the largest $n$ for which an $n$-th corona exists. A circle has $H = 0$, since neighbouring circles touch it at isolated points only. So does the regular pentagon, whose corners always stay exposed. A shape that tiles has every corona, and its number is defined to be infinite. Everything of interest sits in between: shapes that can be surrounded once, twice or more, but never extended to a tiling.

The number is about the best patch, not a typical one. A shape may have many first coronas, most of which cannot be surrounded again; $H = 2$ says that at least one first corona can be, and that no second corona, however it is built, can.

## Two definitions, at most one apart

The definition leaves one point open. Every inner corona must close without holes, or the next ring would have a gap to cover from the inside. The outermost ring is different: nothing needs to surround it, so some authors let it enclose holes and some do not. Craig Kaplan's census of polyforms (2022) reports both numbers, the strict $H_c$, where the shape and all its coronas form a disk, and $H_h$, where holes are allowed in the last ring. Since only the last ring is treated differently, the two always satisfy $H_c = H_h$ or $H_c = H_h - 1$. The explorer shows both, and so do the figures here.

<hcp-corona set="omino11" shapes="0" caption="An 11-omino with H = 2 under the strict definition and H = 3 when the outer corona may enclose a hole. With holes allowed it is the only 11-omino that reaches three coronas, and the smallest polyomino that does; the outer ring leaves a single square hole on the right.">
</hcp-corona>

## Heesch's problem

Heinrich Heesch asked the question in 1968, in a book on the tiling problem, with a first example: a pentagon made of a square, an equilateral triangle and a 30-60-90 triangle, which can be surrounded once and no more. Heesch's problem asks which positive integers are Heesch numbers. Nobody knows whether every $n$ is, or whether there is a ceiling.

The question matters beyond its records. Whether a single given shape tiles the plane is an open decision problem. If finite Heesch numbers were bounded by some $N$, it could be decided for shapes with finitely many ways for two copies to meet: try to build $N + 1$ coronas, and success would prove the shape tiles. Kaplan's paper gives this argument after Chaim Goodman-Strauss's survey of open questions in tiling.

Progress came slowly. Writing in 1987, Branko Grünbaum and G. C. Shephard knew of no shape with a finite Heesch number above 1. Anne Fontaine showed in 1991 that infinitely many shapes have $H = 2$. Casey Mann's paper of 2004 gave tiles with $H = 5$, a number they keep under the strict definition, where every corona must be simply connected. Mann and B. Charles Thomas then searched polyominoes, polyhexes and polyiamonds whose edges carry bumps and nicks that must match, and found more examples up to 5 (2016). In 2021 Bojan Bašić published a figure with $H = 6$. That is the record today.

## Polyforms, one cell at a time

Polyforms are a natural place to collect data. There are finitely many of each size, copies sit on a grid of cells, and the question of whether a set of placed copies surrounds the shape becomes a question about which cells are covered. Kaplan turned it into Boolean satisfiability: one variable per cell and one per possible copy in each corona, clauses that forbid overlaps and demand that every cell around the patch is covered, and a SAT solver to decide whether an $n$-th corona exists for $n = 1, 2, \ldots$ until one does not. His program, heesch-sat, classified every non-tiling polyomino up to 19 cells, polyhex up to 17 and polyiamond up to 24, using Joseph Myers's software to discard the shapes that tile. About 4.16 billion shapes went through it.

The census confirmed what was suspected and turned up new shapes. No unmarked polyform passed four coronas. Some of them stand out for how small they are, such as a 9-omino with $H = 2$ and a 7-hex with $H = 3$, and the search found seven new shapes with $H = 4$, six polyhexes and one polyiamond.

<hcp-corona set="hex11" shapes="0" caption="The 11-hex with H = 4, strict: the only 11-hex with four hole-free coronas, and the smallest polyhex with them. Kaplan points to this patch as an example of the forced grouping Mann and Thomas describe, where copies cluster into larger units that then behave like a single tile.">
</hcp-corona>

The definitions part ways on the triangle grid. One 10-iamond has three coronas under the strict count and four when the last ring may hold holes; the switch below shows both patches.

<hcp-corona set="iamond10" shapes="0" caption="A 10-iamond with strict H = 3 and H = 4 with holes allowed. No other 10-iamond reaches three coronas under either definition.">
</hcp-corona>

## What the census holds

The explorer lists the Heesch number of every hole-free polyomino from 7 to 20 cells that does not tile, every polyiamond from 7 to 12 cells and every polyhex from 6 to 11, with a patch for each number it reports. Every non-tiler is listed and drawn up to 11 cells for polyominoes, 12 for polyiamonds and 8 for polyhexes. Past that the counts are complete but the shapes shown are those with $H \geq 2$ when holes are allowed, since the 20-ominoes alone include more than 2.2 billion shapes with $H = 0$.

<hcp-heesch-census caption="Non-tiling polyforms by Heesch number, per size. A dot is zero. Under the strict definition the polyominoes past 11 cells have their H = 0 and H = 1 shapes counted together, because only the shapes that reach two coronas are listed one by one. Three polyominoes (one each of 13, 17 and 20 cells) whose tilings have not been confirmed are left out of the counts.">
</hcp-heesch-census>

The 11-ominoes show the shape of the whole table. Of the 16,094 hole-free 11-ominoes, 6,620 tile and 9,474 do not. Under the strict definition 5,807 of those cannot be surrounded at all, 3,628 have one corona and 39 have two. With holes allowed the split moves to the right: 2,820, 6,544, 109, and the single shape with three. These numbers agree with Kaplan's tables, and the census carries the polyominoes one size past them: among the 2,269,506,062 hole-free 20-ominoes, 12,126,682 tile, 765 reach two coronas with holes allowed and one reaches three.

Higher numbers get rarer as fast as the shapes multiply. Strict $H = 3$ first appears among polyominoes at 17 cells, with two shapes, and no polyomino up to 20 cells has four coronas under either definition. Polyhexes go further sooner: one 7-hex has three hole-free coronas, and $H = 4$ appears at 10 cells with holes allowed and at 11 cells without.

## Two named polyominoes with four coronas

Beside the censuses the explorer keeps a short list of named tiles. Two are polyominoes with $H = 4$ under both definitions, higher than any polyomino up to 20 cells: a 22-omino credited to Lee Fryer-Davis, and a 31-cell "saw ribbon" credited to Anton Bakker, a long serrated strip whose teeth lock four rings together before the fifth cannot close.

<hcp-corona set="named" shapes="0,1" caption="The Fryer-Davis 22-omino and Anton Bakker's 31-cell saw ribbon, both with four hole-free coronas.">
</hcp-corona>

## Other grids

Seven more grids from heesch-sat are in the explorer: polykites, polydrafters, polyabolos, the half-Cairo, octasquare, trihex and bevelhex grids, and one grid with no fixed cell positions at all, unit squares and triangles joined edge to edge. On the seven, copies are placed on the grid only, so a number there is a lower bound and a shape counted as a non-tiler may still tile with copies off the grid. On squares and equilateral triangles from 3 to 5 cells, where copies meet edge to edge anywhere, two coronas are the most any shape reaches.

## Credits

The polyiamond, polyhex and other-grid censuses and the grids themselves come from **Craig S. Kaplan**'s heesch-sat. The polyomino census from 7 to 20 cells was computed by the atlas and agrees with the table Anton Bakker computed, apart from two shapes Bakker counts as tilers that the atlas has not yet confirmed. The two named polyominoes are credited to Lee Fryer-Davis and Anton Bakker. Every patch in the explorer was checked again before it was shipped: congruent copies, no overlaps, every corona surrounding the one inside it.

## References

- H. Heesch, *Reguläres Parkettierungsproblem*, Westdeutscher Verlag, Cologne and Opladen, 1968.
- B. Grünbaum, G. C. Shephard, *Tilings and Patterns*, W. H. Freeman, 1987, Section 3.8 (second edition, Dover, 2016).
- A. Fontaine, An infinite number of plane figures with Heesch number two, *Journal of Combinatorial Theory, Series A* 57 (1991), 151–156.
- C. Mann, Heesch's tiling problem, *American Mathematical Monthly* 111 (2004), 509–517.
- C. Mann, B. C. Thomas, Heesch numbers of edge-marked polyforms, *Experimental Mathematics* 25 (2016), 281–294.
- B. Bašić, [A figure with Heesch number 6: pushing a two-decade-old boundary](https://doi.org/10.1007/s00283-020-10034-w), *The Mathematical Intelligencer* 43 (2021), 50–53.
- C. S. Kaplan, [Heesch numbers of unmarked polyforms](https://doi.org/10.55016/ojs/cdm.v17i2.72886), *Contributions to Discrete Mathematics* 17(2) (2022). [arXiv:2105.09438](https://arxiv.org/abs/2105.09438).
- C. S. Kaplan, [heesch-sat](https://github.com/isohedral/heesch-sat), the solver and grids behind the census; [Heesch numbers, part 1](https://isohedral.ca/?p=1382), on Heesch's pentagon.
- C. Goodman-Strauss, [Open questions in tiling](https://strauss.hosted.uark.edu/papers/survey.pdf) (2000).
- J. Myers, [Polyomino, polyhex and polyiamond tiling](https://www.polyomino.org.uk/mathematics/polyform-tiling/).
