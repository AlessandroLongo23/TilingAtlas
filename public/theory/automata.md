# Life on a tiling that isn't the square grid

Conway's Game of Life is usually described as a rule, but half of it is a grid. "Any live cell with two
or three live neighbours survives" only means something once you have said what a neighbour is, and on
the square lattice that question has a single answer everybody agrees on: the eight cells touching it.
Change the grid and the rule stops being well defined before it stops being interesting.

That is the whole subject of this page. The Atlas holds thousands of tilings whose tiles have three,
four, six, twelve neighbours (often several of those at once, in the same tiling) and running B3/S23 on
them forces a choice that the literature has never settled.

<ca-life rules="B3/S23,B36/S23,B2/S35" caption="A small board on four tilings, glued into a torus along the dashed edge, so a pattern leaving one side comes back on the other. Play it, step it one generation, or start from a new random soup; click a tile to flip it. Hovering or tapping a tile lights its neighbours, and the neighbourhood toggle changes what counts as one. B3/S23 is Conway's rule, B36/S23 is HighLife, B2/S35 Bays' rule for the hexagonal grid.">
<tiling-card tiling="t1005" title="4.4.4.4"></tiling-card>
<tiling-card tiling="t1001" title="6.6.6"></tiling-card>
<tiling-card tiling="t1011" title="3.3.3.3.3.3"></tiling-card>
<tiling-card tiling="t1006" title="3.4.6.4"></tiling-card>
</ca-life>

On the square grid the toggle is the difference between the four edge-neighbours and Conway's eight, and B3/S23 is Life only with eight. On the hexagonal grid it changes nothing, because two hexagons that share a corner always share an edge; on the triangular grid it is three neighbours against twelve.

## What is known

The regular non-square cases were worked out one tessellation at a time, mostly by Carter Bays.
He set out the conditions for a rule to deserve the name Game of Life: every touching neighbour is
counted the same way, the rule supports a glider, and that glider *arises naturally* from random soup,
with random configurations showing bounded growth. Applying them he found a hexagonal rule, B2/S35 (his
3,5/2, survival written first), with a period-5 glider, and a rule on the Cairo pentagonal tiling, B346/S23,
with a period-48 one, both in a short note of 2005; the triangular case came first, in 1994, with glider
guns found there in 2007. Three tessellations in all. Nobody has run those conditions across
the eleven uniform tilings, let alone the $k$-uniform families.

<pent-type-figure types="4" sliders="all" caption="Bays' pentagonal board is the Cairo tiling, which is type 4 of the fifteen convex pentagons that tile the plane. Move the two angles and the pentagon changes while every tile keeps the same neighbours, so his rule B346/S23 and its period-48 glider live on the whole family at once: an automaton reads only who touches whom.">
</pent-type-figure>

The aperiodic case has had far more attention, and it is stuck on one question. Owens and Stepney ran
B3/S23 on the Penrose kite-and-dart and rhomb tilings, catalogued still lifes and oscillators, showed
that arbitrarily large snakes and chains exist, and found the two tilings behave statistically quite
differently from each other. They found no propagating structure analogous to a glider. Goucher later built one, but in a purpose-made
four-state automaton on generic quadrilateral tilings, explicitly not Life. James Edmond found the same
on the hat and spectre monotiles in 2026: among edge-neighbour semi-totalistic rules his searches turned
up no glider at all, and gliders appeared only once the rule space was widened to vertex neighbourhoods
and multi-state priority rules. Bailey and Lindsey get
Life-*isomorphic* automata on quasiperiodic tilings from the multigrid construction, so gliders transfer
there by design, not by playing B3/S23 against the tiling's own adjacency. Hong and Mei classified every
four-cell still life on the Robinson triangle. Whether Conway's rule itself admits a glider on any
aperiodic tiling is, as far as I can find, still open.

<ap-substitution tilings="penrose" level="4" caption="Penrose's rhomb tiling, the board of most of that work, grown by deflation. Every tile has four edge-neighbours, but the number of tiles touching it at a corner varies from place to place, so the edge-or-corner neighbourhood Conway's rule counts over has no fixed size.">
</ap-substitution>

Hyperbolic tilings have been studied hard, but for a different question. Margenstern's programme
constructs *universal* automata on the pentagrid, heptagrid and dodecagrid with as few states as
possible. That is engineering a machine, not exploring a rule space; nobody seems to have asked Bays'
question of $\{7,3\}$.

<hyperbolic-card patch="hyp-7-7-7" label="{7,3}" caption="The heptagrid, Margenstern's board: three heptagons at every vertex, so every tile has seven edge-neighbours, and the number of tiles within $n$ steps of one grows exponentially in $n$, which no Euclidean board does.">
</hyperbolic-card>

And on general graphs there is a body of work that turns out to be the relevant methodology: Marr and
Hütt's outer-totalistic automata on arbitrary topologies, and more recently Rollier, de Oliveira, Bruno
and Baetens' *Essential metrics for Life on graphs*, which proposes mean-field and Derrida curves as a
rule's genotype against state and defect averages as its phenotype.

## The problem nobody has settled

Take 3.4.6.4. Its triangles have three edge-neighbours, its squares four, its hexagons six. What is
"born on exactly three"?

For the hexagon it is a mild condition. For the triangle it means *every* neighbour is alive. The same
four characters describe two unrelated automata depending on which tile reads them, and any tiling that
is not edge-transitive has this problem.

There are three defensible readings, and this Atlas implements all three instead of picking one
silently. The figure shows what each makes of one rule string, shape by shape.

<ca-semantics rule="B3/S23" caption="What B3/S23 means to each shape of a tiling whose tiles differ in degree. A row is one kind of tile with its number of neighbours; a column is a count of live neighbours. B marks a count at which a dead tile is born, S a count at which a live tile survives. Switch the reading and watch the triangle's row.">
<tiling-card tiling="t1006" title="3.4.6.4"></tiling-card>
<tiling-card tiling="t1003" title="4.6.12"></tiling-card>
<tiling-card tiling="t1004" title="3.12.12"></tiling-card>
<tiling-card tiling="t1009" title="3.3.4.3.4"></tiling-card>
</ca-semantics>

*Absolute.* The count is the count. B3 means three live neighbours whatever the tile. This is what the
Penrose work uses, and it has the virtue that a published rule string means the same arithmetic
everywhere, but it makes low-degree tiles nearly inert and high-degree tiles nearly saturated.

*Normalized.* Rescale each tile's live count to a reference degree (here the busiest tile in the
tiling) and test the rule there. A triangle and a hexagon then respond to the same *fraction* of live
neighbours. When every tile already has the reference degree this is exactly the absolute reading, which
is what makes it a generalization instead of a different rule. The cost is that it no longer agrees with
any published rule string on a mixed tiling.

*Per shape.* Give each side count its own rule. The most expressive and the least constrained: the
shapes become different automata sharing a board, and the rule space explodes accordingly.

None of these is the right answer. Which one you pick is a modelling decision, and it is the reason the
control is in the sidebar instead of buried in the code. On a mixed tiling the board below offers all
three, and the same soup under the same rule string runs very differently under each.

<ca-life rules="B3/S23,B2/S35,B36/S23" caption="The board on tilings with mixed degrees. The extra row of controls picks the reading; under Per shape, squares read Conway's rule and hexagons Bays' hexagonal one, and every other shape keeps the rule picked above.">
<tiling-card tiling="t1006" title="3.4.6.4"></tiling-card>
<tiling-card tiling="t1003" title="4.6.12"></tiling-card>
<tiling-card tiling="t1009" title="3.3.4.3.4"></tiling-card>
</ca-life>

## The board is the plane, not a torus

A cellular automaton on a torus is a different dynamical system from one on the plane, and the difference
is exactly the phenomenology you want to watch. Growth is capped. A glider travels until it re-enters its
own wake. A methuselah that would run for a thousand generations saturates instead. The R-pentomino
settles at 116 cells on the plane; on any board small enough to see, it does not.

So the explorer's default is unbounded. Its board is a sparse set of blocks allocated as the pattern
reaches them and freed once it has left, which is what makes "infinite plane" mean unbounded instead of
a large fixed array with the walls out of shot. The small boards in this article are tori only so that
each fits on the page whole.

A bounded board is still worth having, for the opposite reason: its state space is finite, so every orbit
closes.

## Five surfaces, and no sixth

Gluing a board's edges is quotienting the plane by a group $\Gamma$ of isometries acting freely, so the
board is a two-dimensional Euclidean space form, and there are exactly five of those. The plane ($\Gamma$
trivial), the cylinder (one translation), the Möbius band (one glide reflection), the torus (two
translations) and the Klein bottle (a translation and a glide). The projective plane is the one that looks
like it belongs and cannot: a closed flat surface has Euler characteristic $0$ by Gauss–Bonnet, and
$\chi(\mathbb{RP}^2) = 1$.

Which of the five a given tiling can be glued into is not a free choice. A seam glued by TRANSLATION costs
nothing: translating by $W\mathbf{v}_1$ is a symmetry of every periodic tiling by construction, so the
cylinder and the torus always exist. A seam glued with a FLIP folds through a glide reflection, and that is
a quotient of the *tiling* only when the tiling admits that glide. A chiral tiling admits none, and gluing
it anyway would join tiles whose edges do not meet, inventing adjacency that is not there. So the surface
picker tests the map itself and disables what it cannot honestly offer. Of the eleven uniform tilings, ten
pass; the one rejection is the snub trihexagonal tiling, which is the only chiral one. Across a
five-hundred-record sample of the Atlas's Euclidean corpus, $96\%$ pass.

<ca-surfaces caption="The five flat surfaces as gluing diagrams: sides marked alike are identified, in the direction of the chevrons, and a dashed side is a free edge (or, for the plane, no edge at all). A pair whose chevrons point opposite ways is glued with a flip. The surfaces a tiling cannot be glued into are greyed out: the snub trihexagonal tiling has no glide reflection, so it gets no Möbius band and no Klein bottle.">
<tiling-card tiling="t1005" title="4.4.4.4"></tiling-card>
<tiling-card tiling="t1006" title="3.4.6.4"></tiling-card>
<tiling-card tiling="t1009" title="3.3.4.3.4"></tiling-card>
<tiling-card tiling="t1010" title="3.3.3.3.6"></tiling-card>
</ca-surfaces>

Reading the wallpaper group is not a substitute for testing the map. The group says a mirror exists
somewhere; it does not say the axis lines up with the seam being glued, and where the axes fall is not
something the name records. The snub square tiling is $p4g$, which is $4\ast 2$ in orbifold notation, so
the mirrors are there: two perpendicular families, running through the triangles and missing every square,
because the square centres are its four-fold points and in $p4g$ those lie off the mirror lines. Which of
its seams can be flipped is settled by mapping the polygons, not by reading the three letters.

## Running a board that has no consistent side

The flip makes two demands a flat array of fixed offsets cannot meet. The reflection's $-1$ eigenvector is
perpendicular to the seam, and the lattice vector along it is generally not $\mathbf{v}_2$: on the
hexagonal lattice the reflection across $\mathbf{v}_1$ sends $\mathbf{v}_2$ to
$\mathbf{v}_1 - \mathbf{v}_2$, so the perpendicular lattice direction is $2\mathbf{v}_2 - \mathbf{v}_1$,
generating a sublattice of index $2$. And the glide maps tiles onto tiles while permuting the slots inside
a cell, which no fixed offset can express.

Both are paid for once, before the first generation. The adjacency is rewritten on the sublattice
$\langle \mathbf{v}_1, \mathbf{w}\rangle$, whose cell holds one or two of the tiling's own and in which
the reflection is exactly $\operatorname{diag}(1, -1)$. Then the board is run on its ORIENTATION DOUBLE
COVER: a cylinder for the Möbius band, a torus for the Klein bottle, twice as wide, carrying a state
invariant under the deck transformation $\iota$.

That last step is not an approximation. $\iota$ is an automorphism of the adjacency graph and maps every
tile to a congruent one, so it commutes with the rule; an $\iota$-invariant configuration stays
$\iota$-invariant exactly, in integer arithmetic, forever. Invariant configurations on the cover are in
bijection with configurations on the quotient, and a covering map preserves each cell's neighbour multiset.
Running the cover *is* running the quotient, and the simulation kernel never learns that the board has no
sides.

One visible consequence: on a tiling whose only glide shifts by half a cell, the board's width is a half
integer, and the sidebar reports it as such. Six and a half cells is what the seam actually closes up over.

## What three dimensions can and cannot hold

The 3D view draws the quotient itself, and each surface is a different amount of honest. The cylinder
embeds isometrically, so its tiles keep their true shape and size. The torus and the Möbius band embed but
not isometrically, so their tiles stretch where the surface curves; that distortion is the price of seeing
the identification at all. The Klein bottle does not embed in $\mathbb{R}^3$ at all, because every closed
surface in $\mathbb{R}^3$ is orientable, so it is drawn as an immersion and passes through itself. Both
standard ones are offered. The *bottle* is the shape everyone recognises, with the neck puncturing the
wall; its proportions are fixed, so it cannot take the board's aspect ratio, and the length of neck inside
the body is hidden. The *bagel* is the figure-8 immersion, a lemniscate cross-section swept round a circle
with a half turn; its tube is near enough uniform that every cell stays visible. In both cases the
self-intersection is an artefact of three dimensions: no cell there is adjacent to the one it appears to
touch, and the automaton knows nothing about it.

## Why the tiling being periodic is what makes this fast

Every Euclidean record in the Atlas is a fundamental cell of $n$ tiles plus a lattice basis. So a tile in
the plane is addressed by $(i, j, t)$ (lattice cell, slot within it) and the adjacency is
*translation-invariant*: slot $t$'s neighbours are always the same fixed list of $(\Delta i, \Delta j,
t')$. That list is the tiling's analogue of the eight Moore offsets, and computing it once is what makes
everything else cheap: the board is a grid of copies of one cell, and every neighbour is a fixed offset
away, the tile-with-border idea from Rokicki's survey of Life algorithms carried across to a tiling.

Two well-known tricks do not carry across. The bit-packing that takes square-grid Life past $10^9$ cell
updates per second works by shifting a machine word so every cell sees its neighbour at once; on a tiling
the offsets differ per slot, so a shift does not align. And HashLife generalizes in principle (its
quadtree would sit on the $\mathbb{Z}^2$ lattice index) but it advances $2^{k-2}$ generations per node,
which is useless for a viewer whose entire purpose is showing you every generation.

## Where this could go

The gap in the literature is not subtle. Bays did three tessellations, one search at a time; the Atlas holds thousands,
across three geometries, with exact adjacency already computed. Running his conditions (bounded growth,
and a glider that appears on its own from soup) across the uniform tilings is a search nobody appears to
have done.

What would make that search work is *not* another density-and-complexity scatter plot. Collapsing a
rule's whole spatio-temporal evolution into two scalars cannot distinguish a chaotic burst from a fleet
of drifting gliders, which is exactly the failure mode a previous attempt of mine ran into. Detecting
localized moving structures directly is the harder and more honest instrument, and Rollier et al.'s
graph-native descriptors are the current best starting point.

## Credits

The Game of Life is John Horton Conway's, introduced to the public by Martin Gardner in 1970. The rules
for other tessellations named here are Carter Bays'; HighLife is Nathan Thompson's. The simulator on these
pages runs on the Atlas's own tilings, with the adjacency read off each tiling's fundamental cell.

## References

- Martin Gardner, "Mathematical Games: The fantastic combinations of John Conway's new solitaire game
  'life'", *Scientific American* 223(4), October 1970, 120–123.
  [doi:10.1038/scientificamerican1070-120](https://doi.org/10.1038/scientificamerican1070-120)
- Carter Bays, "Candidates for the Game of Life in Three Dimensions", *Complex Systems* 1(3), 1987,
  373–400 (the criteria). [PDF](https://content.wolfram.com/sites/13/2018/02/01-3-1.pdf)
- Carter Bays, "Cellular Automata in the Triangular Tessellation", *Complex Systems* 8(2), 1994, 127–150.
  [PDF](https://content.wolfram.com/sites/13/2018/02/08-2-4.pdf)
- Carter Bays, "A Note on the Game of Life in Hexagonal and Pentagonal Tessellations", *Complex Systems*
  15(3), 2005, 245–252. [doi:10.25088/ComplexSystems.15.3.245](https://doi.org/10.25088/ComplexSystems.15.3.245)
- Carter Bays, "The Discovery of Glider Guns in a Game of Life for the Triangular Tessellation", *Journal
  of Cellular Automata* 2(4), 2007, 345–350.
  [Publisher](https://www.oldcitypublishing.com/journals/jca-home/jca-issue-contents/jca-volume-2-number-4-2007/jca-2-4-p-345-350/)
- Nick Owens and Susan Stepney, "The Game of Life Rules on Penrose Tilings: Still Life and Oscillators",
  in A. Adamatzky (ed.), *Game of Life Cellular Automata*, Springer, 2010, 331–378 (snakes, chains, no
  glider). [doi:10.1007/978-1-84996-217-9_18](https://doi.org/10.1007/978-1-84996-217-9_18)
- Nick Owens and Susan Stepney, "Investigations of Game of Life cellular automata rules on Penrose
  Tilings: lifetime, ash and oscillator statistics", *Journal of Cellular Automata* 5(3), 2010, 207–225.
  [Preprint](https://www-users.york.ac.uk/~ss44/bib/ss/nonstd/jca10.pdf)
- Adam P. Goucher, "Gliders in cellular automata on Penrose tilings", *Journal of Cellular Automata*
  7(5–6), 2012, 385–392.
  [Publisher](https://www.oldcitypublishing.com/journals/jca-home/jca-issue-contents/jca-volume-7-number-5-6-2012/jca-7-5-6-p-385-392/)
- Duane A. Bailey and Kathryn A. Lindsey, "A Game of Life on Penrose tilings", 2017.
  [arXiv:1708.09301](https://arxiv.org/abs/1708.09301)
- Seung Hyeon Mandy Hong and May Mei, "The Game of Life on the Robinson Triangle Penrose Tiling: Still
  Life", *Journal of Cellular Automata* 17(3–4), 2023, 209–219. [arXiv:2302.10157](https://arxiv.org/abs/2302.10157)
- James Edmond, "Gliders on Aperiodic Monotilings: Cellular Automata on the Hat and Spectre", 2026.
  [arXiv:2609.22579](https://arxiv.org/abs/2609.22579)
- Maurice Margenstern, "A weakly universal cellular automaton in the heptagrid", 2016,
  [arXiv:1606.09488](https://arxiv.org/abs/1606.09488); and "A strongly universal cellular automaton on the
  pentagrid with six states and Moore neighbourhood", 2023, [arXiv:2306.06728](https://arxiv.org/abs/2306.06728).
- Carsten Marr and Marc-Thorsten Hütt, "Outer-totalistic cellular automata on graphs", *Physics Letters A*
  373(5), 2009, 546–549. [doi:10.1016/j.physleta.2008.12.013](https://doi.org/10.1016/j.physleta.2008.12.013)
- Michiel Rollier, Lucas Caldeira de Oliveira, Odemir M. Bruno and Jan M. Baetens, "Essential metrics for
  Life on graphs", *Physica D* 483, 2025, 134950.
  [doi:10.1016/j.physd.2025.134950](https://doi.org/10.1016/j.physd.2025.134950)
- Eric Peña and Hiroki Sayama, "Life Worth Mentioning: Complexity in Life-Like Cellular Automata",
  *Artificial Life* 27(2), 2021, 105–112. [doi:10.1162/artl_a_00348](https://doi.org/10.1162/artl_a_00348)
- Tomas Rokicki, "Life Algorithms", G4G13 gift exchange, 2018.
  [PDF](https://www.gathering4gardner.org/g4g13gift/math/RokickiTomas-GiftExchange-LifeAlgorithms-G4G13.pdf)
- R-pentomino on LifeWiki (stabilises at generation 1103 with 116 cells, counting six escaping
  gliders). [conwaylife.com/wiki/R-pentomino](https://conwaylife.com/wiki/R-pentomino)
- Marc Lachièze-Rey and Jean-Pierre Luminet, "Cosmic topology", *Physics Reports* 254, 1995, 135–214, for
  the five flat surfaces. [arXiv:gr-qc/9605010](https://arxiv.org/abs/gr-qc/9605010)
- John H. Conway, Heidi Burgiel and Chaim Goodman-Strauss, *The Symmetries of Things*, A K Peters, 2008,
  for orbifold notation ($p4g = 4{\ast}2$).
