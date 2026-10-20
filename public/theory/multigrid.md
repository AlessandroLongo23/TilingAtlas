# De Bruijn's multigrid

In 1981 Nicolaas Govert de Bruijn gave the Penrose rhombus tiling a description that needs no substitution and no matching rules. Draw five families of evenly spaced parallel lines, one family in each of five directions; wherever two lines cross, put a rhombus; the rhombi fit together into a Penrose tiling. The construction is the *pentagrid*, and with any number of families it is the *multigrid*. This page explains the duality between grid and tiling, the condition on the grid that makes the result a Penrose tiling, and the Sub Rosa tilings of Kari and Rissanen, which reach the same symmetries by substitution.

<mg-dual n="5" preset="penrose" caption="A pentagrid (left) and its dual tiling (right). Point at or tap a rhombus: the black dot marks the crossing it comes from, and the two lines through it belong to the families whose directions are its edges. Change the number of families, or slide the first offset γ₀ and watch the tiling rearrange.">
</mg-dual>

## Grids of parallel lines

Fix *n* unit vectors **e**₀, …, **e**ₙ₋₁. For the pentagrid de Bruijn takes the five directions of a regular pentagon, at angles 2π*j*/5. Each direction carries a grid: the family of parallel lines

$$G_j = \{\, z \in \mathbb{R}^2 : z \cdot \mathbf{e}_j + \gamma_j \in \mathbb{Z} \,\},$$

spaced one unit apart and perpendicular to **e**ⱼ. The real number γⱼ, the offset, shifts the *j*-th family across itself, and only its value mod 1 matters. The multigrid is *regular* when no three of its lines pass through one point. Almost every choice of offsets is regular; the exceptions form a set of measure zero.

Every point *z* of the plane that lies on no line has *n* integer coordinates: *K*ⱼ(*z*) is *z*·**e**ⱼ + γⱼ rounded up to the next integer. The coordinates are constant on each open mesh of the grid, the polygon cut out by the lines, and step by one when *z* crosses a line of family *j*.

## A rhombus for every crossing

The dual tiling turns meshes into vertices and crossings into tiles. A mesh with coordinates *K* goes to the point

$$f(K) = \sum_{j} K_j\, \mathbf{e}_j .$$

At a crossing of a line of family *i* with a line of family *j*, four meshes meet, and their coordinates differ only in the *i*-th and *j*-th entries, by 0 or 1 each. Their four points are the corners of a rhombus with edges **e**ᵢ and **e**ⱼ. De Bruijn proved that for a regular pentagrid these rhombi cover the plane with no gaps and no overlaps, edge to edge, and the same holds for a regular multigrid of any number of families. Two rhombi share an edge exactly when their crossings are neighbours along a grid line, so each line of the grid becomes a *ribbon* in the tiling: a strip of rhombi joined along parallel edges, all of them with one edge equal to that line's **e**ⱼ.

The shape of a rhombus depends only on the angle between the two families. With *n* directions spaced π/*n* apart there are ⌊*n*/2⌋ shapes, with acute angles π/*n*, 2π/*n*, …, up to ⌊*n*/2⌋π/*n*. For the pentagrid that is two shapes, at 36° and 72°: Penrose's thin and thick rhombi. Nothing in the construction is approximate. Every vertex is an integer combination of the *n* edge vectors, so two rhombi meet at a corner exactly when their integer coordinates agree.

## The sum of the offsets

Not every regular pentagrid gives a Penrose tiling. The five pentagon directions add up to zero, so the sum of the five numbers *z*·**e**ⱼ + γⱼ is the same for every *z*, namely Γ = γ₀ + ⋯ + γ₄. Each *K*ⱼ is that number rounded up, so the sum of a vertex's coordinates, its *index*, lies strictly between Γ and Γ + 5. De Bruijn's Penrose tilings are the ones with Γ an integer (he takes Γ = 0). Then the index takes only the four values 1, 2, 3, 4, and the dual is a Penrose rhombus tiling. When Γ is not an integer the index takes five values, and the result is a *generalised* Penrose tiling: built from the same two rhombi, but with vertex neighbourhoods that no Penrose tiling has, no simple matching rules and no deflation into kites and darts. In general, different values of Γ mod 1 give tilings that are not locally alike.

The figure above starts from a regular pentagrid with Γ ≡ 0, and its readout counts the index values that occur in the patch on screen. Slide γ₀ and Γ moves with it: four values become five, the readout switches to *generalised Penrose*, and rhombi rearrange wherever a line of family 0 passes over a crossing of two other lines. Back at γ₀ = 0.10 the patch is Penrose again.

## Any number of grids

Nothing in the duality depends on five. With *n* families at angles π*j*/*n* the dual is a rhombus tiling whose edges point in 2*n* directions, and the explorer offers *n* from 4 to 10. Four families give squares and 45° rhombi, the tiles of the Ammann–Beenker tiling: Robert Ammann found the tiling in the 1970s, and Frans Beenker, independently, derived it with de Bruijn's methods in his 1982 Eindhoven master's thesis, supervised by de Bruijn. Franz Gähler and Jürg Rhyner generalised both the grid method and the projection method below in 1986, and proved the two generalisations equivalent.

<mg-dual n="4" caption="Four families of lines give squares and 45° rhombi, the tiles of the Ammann–Beenker tiling. The explorer's multigrid goes from four families to ten, with ⌊n/2⌋ rhombus shapes each.">
</mg-dual>

## Cut and project

De Bruijn also explained why the construction works. Lift each vertex of the tiling to its integer coordinates *K* in ℤⁿ: the tiling becomes a surface made of square faces of the cubic lattice, a stepped surface that stays within bounded distance of a 2-dimensional plane. Projecting that surface onto the plane gives back the tiling, and the integer points that lie on it are exactly the lattice points inside the slab swept by moving a unit cube along a plane, placed by the offsets. That is the *cut-and-project* method, and it explains the tiling's long-range order: the vertices form a model set, its diffraction is pure point, and every finite patch occurs with a well-defined frequency. For the pentagrid the index is the coordinate along the fifth direction, the diagonal (1, 1, 1, 1, 1) of ℤ⁵, and Γ fixes where the slab sits along it.

## Sub Rosa: substitution for every symmetry

The multigrid gives rhombus tilings with 2*n* edge directions for every *n*, but a substitution rule is a different matter. Penrose's rhombi have one, and so do the Ammann–Beenker tiles; a computer search had found rules for a few more symmetries, with a cost reported as prohibitive by 11-fold. Jarkko Kari and Markus Rissanen proved in 2016 that one exists for every *n*. Their tilings, called Sub Rosa, are edge to edge and use the ⌊*n*/2⌋ rhombi with unit sides, with acute angles *k*π/*n*, as prototiles. Each prototile is enlarged by a scaling factor S(*n*) and replaced by a patch of unit rhombi, its *super-rhombus*; iterating the substitution from a rose-shaped starting patch with 2*n*-fold symmetry gives a quasiperiodic tiling with 2*n*-fold rotational symmetry.

Everything starts from the edge rule. Every edge of an enlarged rhombus runs along the diagonals of a fixed sequence of unit rhombi, bisecting one angle of each, and the sequence of bisected angles, each written as a multiple of π/*n*, is the edge word Σ(*n*). For *n* = 5 it reads 1, 3, 1, 1, 3, 1; for even *n* a 0 marks a stretch where the edge runs along a tile edge. The first half of each edge's bisected rhombi is counted inside the super-rhombus and the second half outside, so neighbouring super-rhombi, which cross their shared edge in opposite directions, interlock with no gap and no overlap. The scaling factor is the edge's length, cos(π/2*n*) / sin²(π/2*n*) for odd *n* and 2 / (1 − cos(π/*n*)) for even *n*: about 9.960 for *n* = 5. What Kari and Rissanen had to prove is that the interior of every serrated outline can be filled consistently with unit rhombi, which they did by a rewriting system on the boundary word.

<sr-rule n="5" caption="A Sub Rosa super-rhombus: one prototile, enlarged and filled with unit rhombi, for each symmetry the explorer builds. The serrated outline is the edge word Σ(n), read along each side. The star view applies one step to 2n thin rhombi meeting at a point; for n = 9 and 11 it has too many tiles to draw here, and the explorer shows it.">
</sr-rule>

The explorer builds Sub Rosa for *n* = 4, 5, 6, 7, 8, 9 and 11, that is, with 8-, 10-, 12-, 14-, 16-, 18- and 22-fold symmetry. Its super-rhombi hold from 40 unit rhombi (the thin rhombus at *n* = 4) to 2,980 (the widest rhombus at *n* = 11), and every dissection is checked to fill its outline exactly before it is used.

## Credits

The multigrid and the duality are **N. G. de Bruijn**'s (1981). The Sub Rosa substitutions are **Jarkko Kari** and **Markus Rissanen**'s (2016); the explorer derives every super-rhombus from their edge words Σ(*n*).

## References

- N. G. de Bruijn, Algebraic theory of Penrose's non-periodic tilings of the plane I, II, *Indagationes Mathematicae* 43 (1981), 39–52 and 53–66.
- H. Au-Yang, J. H. H. Perk, [Quasicrystals: the impact of N. G. de Bruijn](https://arxiv.org/abs/1306.6698), *Indagationes Mathematicae* 24 (2013), 996–1017. A summary of the pentagrid, the offsets and the index.
- F. P. M. Beenker, [Algebraic theory of non-periodic tilings of the plane by two simple building blocks: a square and a rhombus](https://research.tue.nl/en/studentTheses/algebraic-theory-of-non-periodic-tilings-on-the-plane-by-two-simp/), TH-Report 82-WSK-04, Eindhoven (1982).
- F. Gähler, J. Rhyner, [Equivalence of the generalised grid and projection methods for the construction of quasiperiodic tilings](https://doi.org/10.1088/0305-4470/19/2/020), *Journal of Physics A* 19 (1986), 267–277.
- J. Kari, M. Rissanen, [Sub Rosa, a system of quasiperiodic rhombic substitution tilings with n-fold rotational symmetry](https://doi.org/10.1007/s00454-016-9779-1), *Discrete & Computational Geometry* 55 (2016), 972–996. [arXiv:1512.01402](https://arxiv.org/abs/1512.01402).
- M. Baake, U. Grimm, *Aperiodic Order. Volume 1: A Mathematical Invitation*, Cambridge University Press (2013).
- N. Bédaride, T. Fernique, [The Ammann–Beenker tilings revisited](https://arxiv.org/abs/1208.3545) (2012).
