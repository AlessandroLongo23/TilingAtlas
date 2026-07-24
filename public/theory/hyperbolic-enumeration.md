# Why the hyperbolic catalogue stops where it does

The Euclidean half of this atlas has an ending. There are eleven uniform tilings of the plane, and that number is a theorem rather than a tally of what we happened to find. Somebody proved the list complete, so the catalogue can show all eleven and say the word "all" without flinching.

The hyperbolic half has no ending, and almost every decision behind it follows from that one fact. This page is about those decisions: why the enumeration is bounded the way it is, what had to be fixed before any count meant anything, and where the search currently runs out of room.

## The plane has a last page and the hyperbolic plane does not

Write $\{p, q\}$ for the tiling in which $q$ regular $p$-gons meet at every vertex. Whether it exists, and which geometry it lives in, comes down to a single comparison:

$$\frac{1}{p} + \frac{1}{q} \quad\text{against}\quad \frac{1}{2}$$

If the sum is larger, the tiling closes up on a sphere, and there are exactly five ways to do that: the Platonic solids. If the sum is exactly one half, the tiling is flat, and there are exactly three: triangles, squares, hexagons. If the sum is smaller, the tiling lives in the hyperbolic plane, and now nothing stops it. $\{7,3\}$ works. So does $\{3,7\}$, $\{4,5\}$, $\{5,4\}$, $\{8,3\}$, $\{3,100\}$, and every other pair on the far side of that inequality. Infinitely many regular tilings, before we have even allowed a second polygon into the picture.

<card-grid cols="2">
<hyperbolic-card patch="hyp-7-7-7" label="{7,3}" caption="Three heptagons at every vertex. The smallest hyperbolic regular tiling, in the sense that no other pair sits closer to the flat case."></hyperbolic-card>
<hyperbolic-card patch="hyp-3-3-3-3-3-3-3" label="{3,7}" caption="Its dual: seven triangles at every vertex. Both are equally regular, and both are one entry in an infinite family."></hyperbolic-card>
</card-grid>

The tiles look as though they shrink toward the boundary. They do not. Every heptagon above is the same size as every other, and the circle is the whole hyperbolic plane rather than a window onto part of it. That is the Poincaré disk being honest about a plane that has more room in it than a flat one, and the extra room is exactly why the list never ends.

So "enumerate the hyperbolic tilings" is not a question with a finite answer. The first job is to replace it with one that has.

## Three bounds turn it into a finite question

A tiling by regular polygons can be complicated in three independent ways, and each one gets a bound.

The **palette** $p$ is the largest polygon allowed, so the tiles are drawn from $\{3, 4, \ldots, p\}$. The **valence** $v$ is the most edges permitted at any vertex. The **uniformity** $k$ is the number of vertex orbits: how many genuinely different kinds of vertex the tiling has once its own symmetries are taken into account. A 1-uniform tiling looks the same from every vertex; a 2-uniform tiling has two classes of vertex, and no symmetry carries one class to the other.

Fix all three and the set of tilings is finite, so a complete enumeration is possible and the word "all" is available again. Every count in this atlas is the answer for one such box, never an answer about hyperbolic tilings in general. The boxes nest, so a result for $p \le 6$, $v \le 5$ contains every result for $p \le 5$, $v \le 5$, which is what makes the table below readable as a single growing region rather than a grid of unrelated experiments.

This is the honest form of the completeness claim, and it is worth stating plainly because it is easy to overclaim here. We do not know how many hyperbolic tilings there are. We know how many there are inside a stated box.

## The vertex figure is not a name

For the eleven Euclidean uniform tilings, the vertex configuration works as an identifier. Write $3.4.6.4$ and you have named one tiling, because no two of the eleven share a configuration. That convenience is so reliable in the plane that it is easy to mistake for a law.

It is not one, and the hyperbolic plane is where that shows. There are no similarities in hyperbolic geometry: you cannot scale a figure up and keep its angles. Curvature fixes an absolute unit of length, so the edge length of a tiling is not a free parameter we choose for drawing. It is forced by the requirement that the angles close at a vertex. For a regular $p$-gon with edge $\ell$, the interior angle $\alpha$ satisfies

$$\sin\frac{\alpha(p, \ell)}{2} = \frac{\cos(\pi/p)}{\cosh(\ell/2)}$$

and the tiling exists only at the $\ell$ where the angles around a vertex sum correctly:

$$\sum_i \alpha(p_i, \ell) = 2\pi$$

That angle shrinks as $\ell$ grows, so the sum falls strictly with $\ell$, and there is exactly one positive solution whenever the corresponding flat angles overshoot $2\pi$. A hyperbolic vertex configuration therefore arrives with its edge length already determined. Nothing is left to choose.

Which invites the obvious guess: the configuration plus its forced edge length ought to pin down the tiling. It does not, and the failure is not marginal.

<card-grid cols="2">
<hyperbolic-card patch="hyp-4-4-4-6" label="4.4.4.6" caption="Three squares and a hexagon at every vertex, edge length 0.6974."></hyperbolic-card>
<hyperbolic-card patch="hyp-4-4-4-6-b" label="4.4.4.6 again" caption="The same configuration and the same forced edge length, and a different tiling. Compare the two around the third ring of tiles."></hyperbolic-card>
</card-grid>

Those two agree perfectly near the middle. Every vertex in both carries three squares and a hexagon, and both are built from tiles of identical size. Follow them outward and they diverge: the choice of which neighbour is a hexagon propagates differently, and no symmetry of either takes one to the other. They are two distinct tilings wearing one name.

The effect grows quickly with the size of the configuration. The figure $4.6.6.6.6.6.6.6$ carries **147 distinct 1-uniform tilings**, all of them at edge length $2.8628$. At $k = 2$, a single pair of vertex figures accounts for 138. This is why the library numbers its variants, and why a hyperbolic entry needs an index alongside its configuration to be identified at all.

It is also the bug that started the rebuild. An earlier version of the export deduplicated by vertex configuration, which is a Euclidean reflex applied to a hyperbolic shelf, and it silently shipped one tiling in every place the engine had actually found several.

## What makes two tilings the same

If the configuration cannot answer "are these the same tiling?", something else must. The tool for it is the Delaney–Dress symbol, and it is worth meeting properly because the whole catalogue rests on it.

Start from any tiling and subdivide it barycentrically: mark every tile centre, every edge midpoint, and every vertex, then cut into triangles. Each triangle, called a chamber, records one incident triple of a vertex, an edge and a tile. Label its corners $0$, $1$, $2$ for the vertex, edge midpoint and tile centre respectively. Each chamber has exactly one neighbour across each of its three sides, which gives three involutions $s_0, s_1, s_2$ recording how the pieces fit together locally.

Now fold by symmetry: identify chambers that some symmetry of the tiling carries onto one another. Only finitely many classes survive, one fundamental domain's worth, and that finite object is the symbol. Two labels finish it: $m_{01}$, the number of sides of the tile a chamber sits in, and $m_{12}$, the number of tiles meeting at its vertex.

The reason to do any of this is a theorem of Dress from 1984. Two tilings are equivalent, deformable into one another without breaking symmetry, **exactly when their symbols are isomorphic**. The symbol is a complete invariant, not an approximation to one, and it has a canonical form that a computer can compute in roughly quadratic time. So "are these the same tiling?" becomes a string comparison that is right by construction. No radius, no sampling, no tolerance.

Two more things fall out of the same finite object, which is what makes it the right thing to enumerate rather than merely to compare. The uniformity is read straight off: a tiling is $k$-uniform precisely when its symbol has $k$ orbits under $s_1$ and $s_2$ together, since walking $s_1 s_2$ traces the chambers around a vertex. And the geometry is decided by a sum over chambers,

$$K = \sum_{\text{chambers}} \left( \frac{1}{m_{01}} + \frac{1}{m_{12}} - \frac{1}{2} \right)$$

whose sign says sphere, plane or hyperbolic plane. The symbol knows which geometry its tiling belongs to before anything has been drawn.

One caveat matters in practice. A symbol built from a particular presentation of a tiling need not be the smallest one describing it, and two presentations of a single tiling can look different until they are reduced. The identity we use is therefore the *minimal* symbol, and computing that minimal image is exactly the step at which different presentations of one tiling collapse together. Skipping it produces an invariant that splits tilings from themselves, which is a failure mode we walked into and had to back out of.

## Why the search runs on combinatorics

There are two ways to enumerate. Draw candidate tilings and compare the pictures, or generate the combinatorial objects and only draw at the end.

Drawing first is the natural instinct and it is the wrong one here. Hyperbolic positions crowd together near the boundary of the disk, so deciding whether two drawn vertices coincide becomes a question about floating-point noise rather than about geometry, and it becomes so exactly where the interesting structure lives. Worse, comparing pictures needs a notion of "the same picture", and any such notion built from a finite patch can only ever inspect a bounded neighbourhood. Two different tilings that agree out to that radius are indistinguishable to it. The $4.4.4.6$ pair above is precisely that trap: agree near the centre, differ further out.

So the search runs the other way. The engine glues vertex figures together as combinatorial objects, checks that the angles close, and prunes duplicates by canonical form. Geometry is computed once, at the end, for tilings whose identity has already been settled. The expensive and fragile part happens least often.

That leaves the question of whether the machinery is correct, and here we had one piece of luck worth using. The interior-angle formula degenerates to the ordinary Euclidean angle at $\ell = 0$, so the entire identity stack runs unmodified on flat tilings, where the answer has been known for decades. Pointed at the Euclidean palette, the raw solver output, which contains many redundant presentations of each tiling, collapses to exactly **10 at $k = 1$ and 20 at $k = 2$**, matching the published counts (OEIS A068599). The 10 rather than 11 is understood and deliberate: this run works in twelve directions, which cannot express the octagon, and the single missing tiling is the well-known $4.8.8$. That test is the one that matters, because it checks the property everything else depends on, namely that distinct presentations of one tiling *merge*. An invariant can be perfectly self-consistent and still fail that, which is how the first attempt passed its own regressions while being wrong.

## Where the enumeration stops

With identity settled, counting is mechanical, and the results describe a region rather than a totality. Each box was run to completion or to a time limit, and 82 of 108 finished.

Growth in the palette and valence bounds is steep. Holding uniformity at $k \le 1$ and the palette at $p \le 8$, widening the valence alone gives:

| valence bound | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|
| distinct tilings | 7 | 87 | 331 | 1,547 | 7,061 |

Roughly a factor of four to five per step, with no sign of flattening. Growth in uniformity is comparable, and here are four boxes that finished at all three levels:

| box | $k \le 1$ | $k \le 2$ | $k \le 3$ |
|---|---|---|---|
| $p \le 4$, $v \le 6$ | 21 | 124 | 995 |
| $p \le 5$, $v \le 5$ | 13 | 39 | 158 |
| $p \le 6$, $v \le 5$ | 85 | 439 | 5,035 |
| $p \le 8$, $v \le 4$ | 87 | 171 | 640 |

The Euclidean intuition does not survive the trip. In the plane, going from 1-uniform to 2-uniform takes 11 to 20, a little under double. In these boxes the same step multiplies by five, and sometimes by more than twelve, and the step after that is larger again.

Cost grows faster than the count it buys. The $p \le 6$, $v \le 5$ box takes under twenty seconds to produce 439 tilings at $k \le 2$, and over eight minutes to produce 5,035 at $k \le 3$. That gap, rather than any mathematical obstruction, is what defines the edge of the catalogue.

## What the wall is made of

Twenty-six of the 108 boxes hit the time limit, and it matters what that does and does not mean. A censored box is not an empty one. In every case the solver was still emitting new candidates when the clock stopped, so the true count for those boxes is strictly larger than any completed box inside them. The correct reading of a gap in the table is "unknown, and larger than its neighbour", never "zero".

Which puts the current boundary in an unglamorous place: it is made of compute, not of mathematics. Nothing about the method changes at the edge. The symbols are still finite, the canonical form is still a complete invariant, the angle equation still has its single root. Run the same code for longer and the boundary moves outward, one box at a time.

The catalogue currently ships every tiling from every completed box at $k \le 2$, which comes to **28,453 tilings**: 12,168 with one vertex orbit and 16,285 with two. The $k = 3$ layer has been counted but not yet developed into shippable geometry, and beyond it the table is simply blank. Blank because nobody has run those boxes, which is a much better reason for a gap than the alternative.

You can browse the shipped catalogue in the [library](/library), filter it by palette, valence and edge length, and open any entry in [Play](/play) to move around inside it.
