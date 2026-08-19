# Life on a tiling that isn't the square grid

Conway's Game of Life is usually described as a rule, but half of it is a grid. "Any live cell with two
or three live neighbours survives" only means something once you have said what a neighbour is, and on
the square lattice that question has a single answer everybody agrees on: the eight cells touching it.
Change the grid and the rule stops being well defined before it stops being interesting.

That is the whole subject of this page. The Atlas holds thousands of tilings whose tiles have three,
four, six, twelve neighbours — often several of those at once, in the same tiling — and running B3/S23 on
them forces a choice that the literature has never settled.

## What is known

The regular non-square cases were worked out by hand, one tessellation at a time, mostly by Carter Bays.
He set out three conditions for a rule to deserve the name Game of Life: every touching neighbour is
counted the same way, the rule supports a glider, and that glider *arises naturally* from random soup,
with random configurations showing bounded growth. Applying them he found a hexagonal rule with a
period-5 glider and a rule on the Cairo pentagonal tiling with a period-48 one, having earlier done the
triangular case. Three tessellations, published across 1994–2007. Nobody has run those conditions across
the eleven uniform tilings, let alone the $k$-uniform families.

The aperiodic case has had far more attention, and it is stuck on one question. Owens and Stepney ran
B3/S23 on the Penrose kite-and-dart and rhomb tilings, catalogued still lifes and oscillators, showed
that arbitrarily large snakes and chains exist, and found the two tilings behave statistically quite
differently from each other. They did not find a glider. Goucher later built one — but in a purpose-made
four-state automaton on generic quadrilateral tilings, explicitly not Life. Bailey and Lindsey get
Life-*isomorphic* automata on quasiperiodic tilings from the multigrid construction, so gliders transfer
there by design, not by playing B3/S23 against the tiling's own adjacency. Hong and Mei classified every
four-cell still life on the Robinson triangle. Whether Conway's rule itself admits a glider on any
aperiodic tiling is, as far as I can find, still open.

Hyperbolic tilings have been studied hard, but for a different question. Margenstern's programme
constructs *universal* automata on the pentagrid, heptagrid and dodecagrid with as few states as
possible. That is engineering a machine, not exploring a rule space; nobody seems to have asked Bays'
question of $\{7,3\}$.

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
silently:

**Absolute.** The count is the count. B3 means three live neighbours whatever the tile. This is what the
Penrose work uses, and it has the virtue that a published rule string means the same arithmetic
everywhere — but it makes low-degree tiles nearly inert and high-degree tiles nearly saturated.

**Normalized.** Rescale each tile's live count to a reference degree — here the busiest tile in the
tiling — and test the rule there. A triangle and a hexagon then respond to the same *fraction* of live
neighbours. When every tile already has the reference degree this is exactly the absolute reading, which
is what makes it a generalization instead of a different rule. The cost is that it no longer agrees with
any published rule string on a mixed tiling.

**Per shape.** Give each side count its own rule. The most expressive and the least constrained: the
shapes become different automata sharing a board, and the rule space explodes accordingly.

None of these is the right answer. Which one you pick is a modelling decision, and it is the reason the
control is in the sidebar instead of buried in the code.

## The board is the plane, not a torus

A cellular automaton on a torus is a different dynamical system from one on the plane, and the difference
is exactly the phenomenology you want to watch. Growth is capped. A glider travels until it re-enters its
own wake. A methuselah that would run for a thousand generations saturates instead. The R-pentomino
settles at 116 cells on the plane; on any board small enough to see, it does not.

So the default here is unbounded. The board is a sparse set of blocks allocated as the pattern reaches
them and freed once it has left, which is what makes "infinite plane" mean genuinely unbounded instead of
a large fixed array with the walls out of shot.

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

Reading the wallpaper group is not a substitute for testing the map. The snub square tiling, $p4g$, has no
mirror line at all and still passes, because a Klein seam needs a glide and $p4g$ has glides.

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
the plane is addressed by $(i, j, t)$ — lattice cell, slot within it — and the adjacency is
*translation-invariant*: slot $t$'s neighbours are always the same fixed list of $(\Delta i, \Delta j,
t')$. That list is the tiling's analogue of the eight Moore offsets, and computing it once is what makes
everything else cheap.

Concretely: copy a block of the board into a scratch buffer with a one-cell border of its neighbours, and
a neighbour's position in that buffer becomes a *constant byte offset* from the cell's own. The update
loop is then an array read per neighbour with no hash lookup, no bounds test and no per-cell adjacency
list — the tile-with-border idea from Rokicki's survey of Life algorithms, carried across to a tiling.

Two well-known tricks do not carry across. The bit-packing that takes square-grid Life past $10^9$ cell
updates per second works by shifting a machine word so every cell sees its neighbour at once; on a tiling
the offsets differ per slot, so a shift does not align. And HashLife generalizes in principle — its
quadtree would sit on the $\mathbb{Z}^2$ lattice index — but it advances $2^{k-2}$ generations per node,
which is useless for a viewer whose entire purpose is showing you every generation.

## Where this could go

The gap in the literature is not subtle. Bays did three tessellations by hand; the Atlas holds thousands,
across three geometries, with exact adjacency already computed. Running his conditions — bounded growth,
and a glider that appears on its own from soup — across the uniform tilings is a search nobody appears to
have done.

What would make that search work is *not* another density-and-complexity scatter plot. Collapsing a
rule's whole spatio-temporal evolution into two scalars cannot distinguish a chaotic burst from a fleet
of drifting gliders, which is exactly the failure mode a previous attempt of mine ran into. Detecting
localized moving structures directly is the harder and more honest instrument, and Rollier et al.'s
graph-native descriptors are the current best starting point.

## Sources

- Carter Bays, "A Note on the Game of Life in Hexagonal and Pentagonal Tessellations", *Complex Systems*
  15(3), 2005; and "Candidates for the Game of Life in Three Dimensions", *Complex Systems* 1, 1987 (the
  criteria).
- Nick Owens and Susan Stepney, "Investigations of Game of Life cellular automata rules on Penrose
  Tilings: lifetime, ash and oscillator statistics", *Journal of Cellular Automata* 5(3), 2010, 207–225.
- Adam P. Goucher, "Gliders in cellular automata on Penrose tilings", *Journal of Cellular Automata*,
  2012.
- Duane A. Bailey and Kathryn A. Lindsey, "A Game of Life on Penrose tilings", arXiv:1708.09301, 2017.
- Seung Hyeon Mandy Hong and May Mei, "The Game of Life on the Robinson Triangle Penrose Tiling: Still
  Life", arXiv:2302.10157, 2023.
- Maurice Margenstern, "Cellular Automata in Hyperbolic Spaces" and the pentagrid/heptagrid universality
  series (e.g. arXiv:1606.09488, arXiv:2306.06728).
- Carsten Marr and Marc-Thorsten Hütt, "Outer-totalistic cellular automata on graphs", arXiv:0812.2408,
  2009.
- Michiel Rollier, Lucas Caldeira de Oliveira, Odemir M. Bruno and Jan M. Baetens, "Essential metrics for
  Life on graphs", *Physica D* 134950, 2025 (arXiv:2506.21226).
- Eric Peña and Hiroki Sayama, "Life Worth Mentioning: Complexity in Life-Like Cellular Automata",
  *Artificial Life* 27(2), 2021, 105–112.
- Tomas Rokicki, "Life Algorithms", G4G13 gift exchange, 2018.
