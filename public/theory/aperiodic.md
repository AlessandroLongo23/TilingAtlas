# Tilings that never repeat

A tiling is periodic when some translation slides it onto itself, and non-periodic when no translation does. A set of tiles is aperiodic when it tiles the plane and every tiling it admits is non-periodic. The two words are easy to confuse and the difference is the whole subject: a square tiles non-periodically if you shift one row by an irrational amount, yet the square is not aperiodic, because it also tiles periodically. An aperiodic set has no periodic option at all.

Every tiling on the [aperiodic explorer](/aperiodic) is non-periodic, and all but one of its constructions are built the same way, by substitution. This page explains what that means and why it forces the tiling never to repeat, then goes through the substitution tilings the explorer holds. The exception, de Bruijn's multigrid, builds its tilings from grids of lines and has [its own article](/aperiodic/about/multigrid).

<ap-substitution tilings="penrose" level="3" caption="Penrose's rhombus tiling, built by deflation. Each step cuts every rhombus into smaller ones in the golden ratio and rescales; step through the levels and the same decagon fills with more and more tiles. Thick rhombi outnumber thin ones by a ratio that tends to the golden ratio φ. Click the patch to pan, zoom and turn it.">
</ap-substitution>

## From Wang's conjecture to Penrose

The question began in logic. In 1961 Hao Wang studied square tiles with coloured edges, placed edge to edge with matching colours and never rotated, now called Wang tiles. He conjectured that any finite set of them that tiles the plane can also tile it periodically, and observed that the conjecture would give an algorithm deciding whether a given set tiles at all. Robert Berger proved in 1966 that no such algorithm exists, and so the conjecture is false: there must be a finite set of Wang tiles that tiles only non-periodically. His published set had 20,426 tiles (his thesis also gives one of 104). Raphael Robinson brought the count down to six tiles in 1971, with a short proof built on a nested hierarchy of squares. The question of the smallest aperiodic Wang set was settled by Emmanuel Jeandel and Michael Rao in 2015: 11 tiles in 4 colours, and no aperiodic set with fewer tiles or fewer colours exists.

Roger Penrose found his first aperiodic set, of six tiles, in 1974, and reduced it to two: the kite and dart, and the pair of rhombi shown above, with angles of 36° and 72°. Two rhombi alone tile periodically; Penrose's rhombi are aperiodic only together with a matching rule, markings on the edges that adjacent tiles must respect. Martin Gardner's *Scientific American* column of January 1977 brought them to a wide audience, together with John Conway's observations on their structure.

## Substitution, and why it forbids periods

A substitution rule says how to replace each tile by a patch of smaller tiles. Applied to every tile of a tiling and followed by a rescaling, it turns one tiling into another. The Penrose rhombi are easiest to subdivide in halves: cut each rhombus along a diagonal into two isosceles triangles, now called Robinson triangles, and each triangle splits into two or three smaller triangles scaled by 1/φ.

<ap-rule tiling="penrose" caption="The Penrose deflation acts on half-rhombi. A 36°–72°–72° triangle (half a thin rhombus) splits into two triangles, a 108°–36°–36° triangle (half a thick one) into three. Matching halves are glued back into rhombi after the last step.">
</ap-rule>

Read backwards, the rule groups tiles into larger supertiles, those into larger ones again, without end. A tiling has unique composition when that grouping is forced: there is exactly one way to cut it into supertiles. Unique composition rules out periods by a short argument. Suppose a tiling had a period, a translation *t* that maps it onto itself. The translation carries the supertile grouping to a grouping of the same tiling, and since there is only one, it maps supertiles to supertiles. So the tiling of supertiles has the period *t* as well. Shrink it by the inflation factor λ, and it is again a tiling by the original tiles, now with period *t*/λ. Repeat *k* times and the period is *t*/λ*ᵏ*, eventually shorter than the smallest tile, which is impossible: a translation that short cannot map a tiling by tiles of positive size onto itself. Boris Solomyak proved the converse in 1998: a self-similar tiling with finitely many tile shapes up to translation that is non-periodic always has unique composition.

The argument shows that the substitution tilings are non-periodic. It does not make the tiles aperiodic, because the same shapes may also fit together in other ways that ignore the hierarchy. What closes the gap is a matching rule that forces the hierarchy to appear. Shahar Mozes constructed such rules for a class of substitutions in 1989, and Chaim Goodman-Strauss showed in 1998 that, under mild conditions, every substitution tiling of the plane can be enforced by local matching rules on finitely many decorated tiles.

## The hat and the spectre

Every aperiodic set above has at least two tiles. Whether a single tile could be aperiodic, the *einstein problem*, stayed open until March 2023, when David Smith, Joseph Samuel Myers, Craig S. Kaplan and Chaim Goodman-Strauss published the hat: a 13-sided polygon made of eight kites of the deltoidal trihexagonal tiling (the dual of 3.4.6.4), which tiles the plane and never periodically. They gave two independent proofs. The first groups hats into four kinds of *metatile*, named H, T, P and F, finds a substitution rule on the metatiles, and shows by a computer-assisted case analysis that every hat tiling carries this hierarchy, and so is non-periodic by the argument above.

<ap-substitution tilings="hat" level="3" caption="The H supertile of the hat tiling, one substitution step per level. Level 1 is the H metatile of four hats; the counts run 4, 25, 169, 1,156. The orange hats are reflected copies.">
</ap-substitution>

The hat uses its mirror image. In every hat tiling the unreflected hats outnumber the reflected ones by φ⁴ ≈ 6.854 to 1, a ratio that falls out of the metatile substitution, and the patch in the figure already shows it: at level 6 the explorer draws 47,377 unreflected hats and 6,912 reflected ones. A tile that needs no mirror image followed two months later. The same authors showed that a close relative of the hat with all edges of equal length tiles only non-periodically when reflections are forbidden, although it tiles periodically when they are allowed. Replacing its straight edges by curves gives the spectres, which are aperiodic whether or not reflections are allowed: every spectre tiling is non-periodic and uses copies of one hand only.

## Rep-tiles from the Tilings Encyclopedia

Four constructions on the explorer come from the Tilings Encyclopedia, the online catalogue of substitution tilings at Bielefeld kept by Dirk Frettlöh, Franz Gähler and Edmund Harriss, which states each rule and its properties. Three of them are rep-tiles: each can be cut into four copies of itself, scaled by 1/2. The chair is an L-shaped tromino; the sphinx is a hexiamond of six triangles; the half-hex is a trapezoid of three. For each of the three, an exhaustive search over the ways to cut the doubled tile into four copies finds exactly one, so the rule is forced by the shape.

None of the three tiles is aperiodic: each tiles the plane periodically as well. The substitution tilings they generate are non-periodic all the same, and they are a different kind of non-periodic from Penrose's. The chair tiling is *limit-periodic*: in the encyclopedia's words it is a union of countably many fully periodic sets of tiles, the *i*-th with periods of length 2 · 2*ⁱ*, so every finite part of it repeats periodically on some scale and the whole never does. Michael Baake, Robert Moody and Martin Schlottmann showed in 1998 that this makes it a cut-and-project set with a 2-adic internal space. The half-hex has the same structure. The sphinx is chiral, and both hands appear at every level: at level 4, 136 sphinxes are right-handed and 120 left-handed.

<ap-substitution tilings="chair,sphinx,half-hex,pinwheel" level="2" caption="Four rep-tile substitutions. Choose a tile and a level, and switch on the supertiles to see the previous level, inflated, drawn over the current one: each supertile is filled exactly by its children. The chair and the half-hex are coloured by which of the four child positions a tile fills, the sphinx by handedness, and the pinwheel by orientation.">
</ap-substitution>

The pinwheel is the fourth. John Conway cut a right triangle with legs 1 and 2 into five copies of itself scaled by 1/√5, and Charles Radin studied the resulting tilings in 1994. The inflation is multiplication by 2 + *i* in the complex plane, which scales by √5 and turns by arctan(1/2), an irrational multiple of π. Each level therefore turns the tiles by an angle that never comes back to a multiple of a full turn, and the orientations of the triangles do not settle into finitely many directions: they are uniformly distributed on the circle. The pinwheel was the first tiling found in which a tile appears in infinitely many orientations, which is why its colour, set by orientation, keeps splitting as the level rises.

<ap-rule tiling="pinwheel" caption="The pinwheel rule: a right triangle with legs 1 and 2 cut into five copies of itself, scaled by 1/√5. The copies sit at angles to their parent, which is where the turn by arctan(1/2) at every level comes from.">
</ap-rule>

## A random substitution

A substitution need not be the same everywhere. If a tile has two dissections into the same number of copies of the same tiles, each tile can pick one of them independently at every step. The tile counts and the inflation factor are untouched, since both dissections contain the same tiles; only the arrangement becomes random. Substitutions with this property are called compatible.

The half-hex at factor 2 cannot be randomised, because its dissection is unique. At factor 3 an exhaustive search by the atlas finds 49 dissections of the same trapezoid into nine copies of itself; the explorer uses two of them. Compatible random substitutions destroy some order and keep some: Michael Baake, Timo Spindeler and Nicolae Strungaru computed the diffraction of such systems in one dimension in 2018, starting from a random mixture of the two Fibonacci substitutions, and found a pure point part that survives the randomness next to an absolutely continuous part that it creates. The half-hex example here is the same mechanism in the plane.

<ap-rule tiling="half-hex-3" caption="The two dissections the random half-hex chooses between: the trapezoid at factor 3, cut into nine copies of itself in two different ways.">
</ap-rule>

<ap-random caption="The half-hex at factor 3, with two compatible dissections. Rule A and Rule B each give a deterministic tiling; Random lets every trapezoid choose its own rule at every step. Tiles are coloured by the rule their parent used, so the randomness shows as territories. A new draw gives a new sample.">
</ap-random>

## What the explorer holds

The explorer builds every tiling on this page live, at any level up to a cap set by drawing speed: Penrose to depth 11 (143,010 rhombi), the hat to level 6 (54,289 hats), the chair, sphinx and half-hex to level 8 (65,536 tiles), the pinwheel to level 7 (78,125 triangles) and the random half-hex to level 5 (59,049 trapezoids). Its two other constructions, de Bruijn's multigrid and the Sub Rosa tilings of Kari and Rissanen, are rhombus tilings with any even order of rotational symmetry, and have [their own article](/aperiodic/about/multigrid).

## Credits

The chair, sphinx, half-hex and pinwheel rules are those of the **Tilings Encyclopedia** (Dirk Frettlöh, Franz Gähler, Edmund Harriss, Bielefeld). The hat construction follows Smith, Myers, Kaplan and Goodman-Strauss (2023). The random half-hex dissections were found by the atlas by exhaustive search.

## References

- H. Wang, Proving theorems by pattern recognition II, *Bell System Technical Journal* 40 (1961), 1–41.
- R. Berger, [The undecidability of the domino problem](https://doi.org/10.1090/memo/0066), *Memoirs of the AMS* 66 (1966).
- R. M. Robinson, [Undecidability and nonperiodicity for tilings of the plane](https://doi.org/10.1007/BF01418780), *Inventiones Mathematicae* 12 (1971), 177–209.
- E. Jeandel, M. Rao, [An aperiodic set of 11 Wang tiles](https://arxiv.org/abs/1506.06492), *Advances in Combinatorics* (2021).
- R. Penrose, The role of aesthetics in pure and applied mathematical research, *Bulletin of the Institute of Mathematics and its Applications* 10 (1974), 266–271.
- M. Gardner, Extraordinary nonperiodic tiling that enriches the theory of tiles, *Scientific American* 236 (January 1977), 110–121.
- S. Mozes, [Tilings, substitution systems and dynamical systems generated by them](https://doi.org/10.1007/BF02793412), *Journal d'Analyse Mathématique* 53 (1989), 139–186.
- C. Goodman-Strauss, [Matching rules and substitution tilings](https://annals.math.princeton.edu/articles/12903), *Annals of Mathematics* 147 (1998), 181–223.
- B. Solomyak, [Nonperiodicity implies unique composition for self-similar translationally finite tilings](https://doi.org/10.1007/PL00009386), *Discrete & Computational Geometry* 20 (1998), 265–279.
- C. Radin, [The pinwheel tilings of the plane](https://doi.org/10.2307/2118575), *Annals of Mathematics* 139 (1994), 661–702.
- M. Baake, R. V. Moody, M. Schlottmann, Limit-(quasi)periodic point sets as quasicrystals with p-adic internal spaces, *Journal of Physics A* 31 (1998), 5755–5765.
- D. Smith, J. S. Myers, C. S. Kaplan, C. Goodman-Strauss, [An aperiodic monotile](https://doi.org/10.5070/C64163843), *Combinatorial Theory* 4(1) (2024). [arXiv:2303.10798](https://arxiv.org/abs/2303.10798).
- D. Smith, J. S. Myers, C. S. Kaplan, C. Goodman-Strauss, [A chiral aperiodic monotile](https://doi.org/10.5070/C64264241), *Combinatorial Theory* 4(2) (2024). [arXiv:2305.17743](https://arxiv.org/abs/2305.17743).
- M. Baake, T. Spindeler, N. Strungaru, [Diffraction of compatible random substitutions in one dimension](https://arxiv.org/abs/1712.00323), *Indagationes Mathematicae* 29 (2018), 1031–1071.
- D. Frettlöh, F. Gähler, E. Harriss, [Tilings Encyclopedia](https://tilings.math.uni-bielefeld.de/): the [chair](https://tilings.math.uni-bielefeld.de/substitution/chair/), [half-hex](https://tilings.math.uni-bielefeld.de/substitution/half-hex/) and [pinwheel](https://tilings.math.uni-bielefeld.de/substitution/pinwheel/) entries.
