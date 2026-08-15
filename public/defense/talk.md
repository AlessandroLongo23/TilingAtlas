<title-slide>

# Algorithmic Generation of <span style="white-space: nowrap">*k*-uniform</span> Tilings of the Plane

Alessandro Longo

Master's Thesis defense, 10 August 2026

</title-slide>

---

<part-slide part="1">
<tiling-card tiling="t1006"></tiling-card>
</part-slide>

---

## What is a tiling?

For Grünbaum & Shephard, and a tiling is a set of closed topological disks with disjoint interiors whose union is the plane.

<slide-grid cols="4">
<tiling-card tiling="t1001" title="hexagons"></tiling-card>
<tiling-card tiling="t1006" title="three kinds of tile"></tiling-card>
<tiling-card tiling="t1004" title="triangles and dodecagons"></tiling-card>
<tiling-card tiling="ctrnact-mixed-family-k1-04" title="star polygons"></tiling-card>
<tiling-card tiling="tet-ctrnact-01_i-2ag_3ai-2" title="a polyomino"></tiling-card>
<tiling-card tiling="d-ctrnact-01_3h-3cm-1" title="two sizes of tile"></tiling-card>
<patch-card patch="penrose" label="Penrose"></patch-card>
<patch-card patch="hat" label="the hat"></patch-card>
</slide-grid>

---

## No gaps or overlaps

**Gaps** or **Overlaps** between the tiles are **not allowed**: every point of the plane is either:
- inside exactly one tile
- on an edge shared by two
- or a vertex where several meet

![](/defense/figures/not-a-tiling.png)

But we'll focus our study on tilings that satisfy additional properties. 

---

## 1st property: Periodicity

A periodic tiling has **two independent translations** that carry it onto itself, 
i.e., it's determined by just **one finite patch**, repeated on a lattice. 

<slide-grid cols="3">
<patch-card patch="penrose" label="Penrose: never repeats"></patch-card>
<patch-card patch="hat" label="the hat: never repeats"></patch-card>
<tiling-card tiling="t1006" title="periodic: one cell, repeated"></tiling-card>
</slide-grid>

---

## 2nd property: Edge-to-edge

A tiling is edge-to-edge when the **intersection** between any two tiles is either **empty or a full edge** of both,
so a corner **never lands part-way along the side** of another.

<tiling-verdict
  yes="t1004,t1007,ctrnact-mixed-family-k1-04,ctrnact-mixed-family-k1-20"
  no="tet-ctrnact-01_i-2ag_3ai-2,d-ctrnact-01_4q-3bo-1,d-ctrnact-01_3h-3cm-1,d-ctrnact-01_3t-4cs-1"
  yeslabel="every meeting is a whole edge of both tiles"
  nolabel="a long side is met by two short ones, so a corner lands part-way along it">
</tiling-verdict>

---

## 3rd property: Only regular polygons

Finally, we only want tilings that consists of just **regular polygons**. Every tiling below is periodic
and edge-to-edge, so regularity is the only thing being decided.

<tiling-verdict
  yes="t1001,t1009,t1006,t1003"
  no="ctrnact-mixed-family-k1-11,ctrnact-mixed-family-k1-19,ctrnact-mixed-family-k1-22,ctrnact-mixed-family-k1-17"
  yeslabel="every tile is a regular polygon"
  nolabel="star and convex polygons: outside the problem, for now">
</tiling-verdict>

---

## Vertex configuration

A vertex configuration (vc) is a **list of polygons sharing a vertex**, and its name is just the number 
relative to each polygon, listed in the **least cyclic lexicographical order**: e.g. $4.6.12$ is a square,
a hexagon, and a dodecagon. 

There's a total of **21**, of which **15** appear in a tiling of the plane, and the other **6** don't.

<vc-split
  yes="3.3.3.3.3.3,3.3.3.3.6,3.3.3.4.4,3.3.4.3.4,3.3.4.12,3.3.6.6,3.4.3.12,3.4.4.6,3.4.6.4,3.6.3.6,3.12.12,4.4.4.4,4.6.12,4.8.8,6.6.6"
  no="3.7.42,3.8.24,3.9.18,3.10.15,4.5.20,5.5.10">
</vc-split>

---

## Vertex orbits

A vertex orbit is the set of vertices that **the tiling's own symmetries** can carry onto each other, 
and a tiling is said $k$-uniform when there are exactly $k$ of them.

<slide-grid cols="3">
<orbit-card tiling="t1011" label="k = 1"></orbit-card>
<orbit-card tiling="t3001" label="k = 3"></orbit-card>
<orbit-card tiling="t5001" label="k = 5"></orbit-card>
</slide-grid>

---

## The numbers we have...

The counts for the first values of $k$ are listed in the **OEIS A068599**:

| $k$ | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
|:---:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---:|---:|---:|---:|
| **count** | 11 | 20 | 61 | 151 | 332 | 673 | 1472 | 2850 | 5960 | 11866 | 24459 | 49794 | 103082 |

Here is the first term in full. The three outlined ones use a single shape of tile: they are the **regular**
tilings; the other eight are the **semiregular** ones, or archimedian tilings.

<slide-grid cols="6">
<tiling-card tiling="t1011" title="3.3.3.3.3.3" accent="yes" periods="3"></tiling-card>
<tiling-card tiling="t1005" title="4.4.4.4" accent="yes" periods="3"></tiling-card>
<tiling-card tiling="t1001" title="6.6.6" accent="yes" periods="3"></tiling-card>
<tiling-card tiling="t1010" title="3.3.3.3.6" periods="3"></tiling-card>
<tiling-card tiling="t1008" title="3.3.3.4.4" periods="3"></tiling-card>
<tiling-card tiling="t1009" title="3.3.4.3.4" periods="3"></tiling-card>
<tiling-card tiling="t1006" title="3.4.6.4" periods="3"></tiling-card>
<tiling-card tiling="t1007" title="3.6.3.6" periods="3"></tiling-card>
<tiling-card tiling="t1004" title="3.12.12" periods="3"></tiling-card>
<tiling-card tiling="t1003" title="4.6.12" periods="3"></tiling-card>
<tiling-card tiling="t1002" title="4.8.8" periods="3"></tiling-card>
</slide-grid>

---

## ... and who produced them

At $k=2$ and $k=3$ the counts rest on case analyses, and from $k=4$ on they rest on computer searches.

<count-timeline>
</count-timeline>

The sequence is just a **consensus**, and since **agreeing is not the same as having proven**, one of the goals of this work is to finally provide a **completeness argument** for these numbers.

---

<part-slide part="2">
<failed-path></failed-path>
</part-slide>

---

## The methods I explored

In this kind of work, **the path to the solution** is as important as the solution itself, because it's evidence of what worked and what didn't. 

Each of the methods I explored had strengths and weaknesses, and the first four were abandoned either because they **didn't scale**, or because **the next was easier to prove**.

<method-strip>
<method-card fig="growth" name="Grow the patch" note="until it holds two translations"></method-card>
<method-card fig="wallpaper" name="Fit the symmetry" note="one domain, then its orbit"></method-card>
<method-card fig="torus" name="Fix the period first" note="then fill the torus exhaustively"></method-card>
<method-card fig="delaney" name="Enumerate the symbols" note="Delaney–Dress, then realize"></method-card>
<method-card fig="gluing" name="Glue the half-edges" note="no coordinates until the end" accent="yes"></method-card>
</method-strip>

---

## Wallpaper groups

In the euclidean 2D space, every tiling or pattern belongs to one of the **17 wallpaper groups**, depending on its **symmetries**.

<wallpaper-wall>
</wallpaper-wall>

---

## Compatibility between VCs

Two vertex configurations are **compatible** when they can sit at the **two ends of one edge**: they always share the two tiles on either side of that edge, but each vc reads that pair in a different order.

<compat-rule
  yes="3.3.6.6,3.6.3.6"
  no="6.6.6,3.4.6.4">
</compat-rule>

---

## The compatibility graph

Doing that for all $\binom{15}{2}$ pairs gives a "compatibility graph", where vcs are nodes, and edges connect compatible vcs.
Since in a tiling all vertices form a connected graph, the vcs in it must be a **connected subgraph in the compatibility graph**.

<compat-graph>
</compat-graph>

---

## From the graph to a seed

A **seed set** is $k$ configurations spanning a connected subgraph, and a **seed** is one placement of
them: the first at the origin, each of the others on an open vertex of what is already there. A
placement is kept when its tiles **overlap nothing** and every vertex it closes is a configuration
**from the same set**.

<seed-strip>
</seed-strip>

---

## Architecture one: symmetry-first

<slide-cols>
<div>

The first method was based on **symmetry**:
- generate a seed patch
- for each tuple of construction points:
  - try to fit the fundamental domain of each of the 17 wallpaper groups
  - check for validity and reconstruct the tiling from the symmetries

</div>
<div>
<seed-card tiling="t4001" label="a k = 4 seed, with its construction points"></seed-card>
</div>
</slide-cols>

---

## Architecture one: failure

Some groups have **elongated lattices**, which can make a vertex of the fundamental domain "fall" out of
the patch: when that happens, the resulting **tiling can't be found** by using the seed alone. 

This example is $cmm$, the most common group at $k = 4$, **50 of the 151**.

<slide-grid cols="2">
<tiling-card tiling="t4003" title="t4003, a cmm tiling" periods="3"></tiling-card>
<seed-card tiling="t4003" domain="yes" label="its seed, with the domain over it"></seed-card>
</slide-grid>

---

## Architecture two: grow the patch, then look for periods

Each vertex in the tiling belongs to the same orbit as one of the $k$ vcs centers in the seed.
So we can iteratively **stamp rigid copies** of it on the open vertices with exact isometries, and then search
the extended patch for **two independent translations** that map it onto itself.

Another version I tried stamps the current state of the patch, not just the original seed.

<growth-strip>
</growth-strip>

---

## Architecture two: the first computational wall

The showed hard 2-uniform seeds saturating a **410-deep search stack** with patches of **hundreds of tiles**: locally legal, non-periodic
boundary variants, **proliferating without any bound**.

The tempting repair was to emit as soon as a patch certifies a period and prune that branch, but because it turns out to be **unsound**: the
certified patch below **extends legally in two ways at every row**, and the prune keeps one of them.

<row-stacker>
</row-stacker>

---

## Two translations turn the plane into a torus

Fix a period lattice and the plane topology folds up into a torus: **opposite edges of the cell become the same edge**, so a
tile leaving one side arrives back on the other.

This is what makes a fill **finite** and clearly bounded, compared to the growth of the previous architecture.

<torus-figure>
</torus-figure>

---

## Precise arithmetic

The internal angles of the regular polygons and the constant unit-edge length force every vertex to fall at specific coordinates, expressed as a sum
of **a whole number of unit edges** pointing in **24 directions**: all the powers of $\zeta_{24} = e^{2\pi i/24}$.

<slide-cols wide="yes">
<div>
<polygon-angles></polygon-angles>
</div>
<div>
<period-figure panel="wheel">
</period-figure>
</div>
</slide-cols>

We can then represent every point of interest as **a list of integers**, making every operation and check precise and **avoid floating-point errors**.

---

## The octagon exception

Among the $21$ vcs, only $4.8.8$ and $3.8.24$ contain an octagon: since the second provably never yields a valid tiling, 
every vertex with an octagon is $4.8.8$: this **forces the alternation of squares and octagons** over the whole plane to produce the $4.8.8$ tiling.

<octagon-forcing>
</octagon-forcing>

Since its interior angle of 135° is the only one that forces the odd $\zeta^{2n+1}$ directions, we can just remove this polygon 
from the pool, log the $4.8.8$ drop at $k=1$, and use the remaining **twelve even directions**: the powers of $\zeta_{12} = e^{2\pi i/12}$.

---

## Architecture three: fix the period before placing a tile

This next method fixed both problems by **inverting the order**:

1. **enumerate the candidate period lattices**: each $k$-uniform tiling has a period
generated by **sums of a bounded number of unit edges**, and we managed to prove finitness
in the **bounded-weight theorem**
2. **fill each resulting torus** exhaustively: the area is finite, and so is the search

Both steps are **finite**.

<period-figure panel="example" dirs="12">
</period-figure>

---

## The $k=4$ wall

The obstacle is how much there is to fill and how long each of them take: $k=4$ produces **13k to 27k** fillable 
seeds (against 449 at $k=3$), and on a representative sample of 25, all of them timed out on a 30-second cap,
leaving **no completed cell**.

What these runs at $k=4$ gave us is the proof that this method was **never going to scale**.

<k4-wall>
</k4-wall>

<!-- The old k4-wall.png is still in public/defense/figures/ and unused; the numbers here are the
same measurements, minus its third panel, which showed the k=3 profile alone on a k=4 slide. -->

---

## Architecture four: enumerate the symbols instead

The Delaney-Dress method **shares no machinery with previous method**.
Cut every tile into **triangular chambers**, one for each (vertex, edge, tile) it contains. Reflecting a chamber
across each of its three sides gives **three involutions**; add the **size of the tile** and the
**degree of the vertex**, and that is the tiling's **Delaney–Dress symbol**.

<delaney-symbol>
</delaney-symbol>

The symbol is the chamber system **divided by the tiling's own symmetries**, so it is finite: an
infinite tiling written as a handful of nodes and two integers. A **realizability lemma proven here**
puts minimal flat symbols in **bijection with congruence classes of $k$-uniform tilings**, so
enumerating tilings becomes enumerating symbols.

---

## Architecture four: scaling is still the problem

Every angle is at least $60°$, so a vertex meets **at most six edges**, and each of those carries **two
chambers**, one on either side: twelve per vertex. With $k$ vertex orbits the whole symbol has **at most
$12k$ chambers**, which is the proved bound for the search.

<dsym-growth>
</dsym-growth>

The generator closes the $k=1$ envelope in **16,500 search nodes** and $k=2$ costs **314 million** of them and eight minutes, delivering
**11 and 20, with no catalogue consulted**: yet another **mechanical verification** of Krötenheerdt's count.
$k=3$, on the other hand, produced **not one complete symbol in sixty million**, with no hope of completing the search, let alone tackling higher values of $k$.
Even though $12k$ was empirically loose and could potentially be improved, this method was no improvement over the previous ones.

---

## What we kept

- **The bounded-weight theorem**, with a small-$k$ sharpening.
- **The exact cyclotomic substrate** underneath it, which every decisive comparison still runs on.
- **The certified 61 at $k=3$**, matched tiling by tiling under two independent implementations.
- **The prohibited-prune registry**: two prunes proven unsound, recorded so that nobody re-derives
  them.
- **A characterised negative result** at $k=4$, which is still a result.

<!-- Deliberately NOT claimed here: that the final engine develops its coordinates in YOUR substrate.
It develops in exact ℤ[ζ₁₂], but eu_develop.cpp is a port of Čtrnáct's develop.py, validated
byte-for-byte against it. Exactness is load-bearing at both ends of the project; the code at the far
end is not yours. -->

---

<part-slide part="3">
<method-card fig="gluing" frame="no"></method-card>
</part-slide>

---

## The turning point

When I started researching for this topic, I found a GitHub repo that had reproduced **the whole sequence** 
to $k=16$. Since the description mentioned that it was based on dual tilings, I didn't dug deeper: I wanted
a method that was able to generate tilings from any polygon set, not just regular polygons.

But after seeing my methods' limitations, I went and took a better look, with the hope that his method would be
easier to prove and to extend to other classes of tilings. Luckily, it was.

![](/defense/figures/ctrnact-repo.png)

---

## Marek Čtrnáct's Synthetic Tiling Searcher (STS)

An abstract vertex is a **cyclic sequence of half-edges** with the angles between them, but **no data about position**. 

<abstract-vertex word="3.4.6.4">
</abstract-vertex>

Each abstract vertex **stands for its orbit** of the eventual tiling, so a $k$-uniform tiling is always assembled out of at
most $k$ abstract ones, and the search space is **finite by construction**, with **no bound to establish beforehand**.

---

## STS's search algorithm

It's a DFS consists of just one operation: take the **free half-edge** whose **tile is closest to closing** (fail fast approach) and pair it with another, either:
- **already in the assembly**
- on a **new abstract vertex**

The pairing is checked against **four local rules**, and a failure **undoes the move** and tries the next pairing.

<solve-loop>
</solve-loop>

Termination is reached because a piece may be added **at most $k$ times**, and when no half-edge is left free, the assembly **is** a tiling with $k$ vertex orbits.

---

## The four local rejection rules

Each one reads a **single polygon** or a **single pair of half-edges**, never the whole assembly, which
is what makes them cheap enough to run on every move.

- **Mismatch**: gluing two half-edges lays their polygons face to face, so the two profiles have to
  be opposites.
- **Mirror break**: a half-edge on a mirror axis is its own mirror image, and one off the axis is
  not, so the two kinds cannot be joined.
- **Lost trail**: a polygon that is still open and has already used more edges than its size allows
  is dead.
- **False closure**: when a polygon closes, the number of full edges around it has to divide its
  size.

<local-rules>
</local-rules>

---

## Only the last stage touches geometry

The pipeline is three stages, `solve`, then `prune`, then `develop`, and the first two **never compute
a coordinate**. Only `develop` does, exactly, in $\mathbb{Z}[\zeta_{12}]$.

<pipeline-stages>
</pipeline-stages>

That is why **the engine is fast**: it's combinatorial instead of relying on geometry.

---

<part-slide part="4">
<obligations-mark></obligations-mark>
</part-slide>

---

## Why do we need a proof?

Searches in this space do lose tilings.

Enumeration by hand is only possible at very low values of $k$, and even there is not as reliable as a machine search, which in turns are subject to bugs: an earlier Python implementation of this very algorithm returned $2849$ at $k=8$ and $5959$ at $k=9$, against the correct $2850$ and $5960$. That loss has a **root cause**, it is one letter of the alphabet, and obligation 3 names it.

And even though **agreement** between independent programs help us spot those bugs, it **only increases the chance** that the count is correct,
it **doesn't prove anything**.

---

## Theorem and proof obligations

Let $\mathcal{T}_k$ be the set of $k$-uniform tilings and $P_k$ the pipeline's output at $k$.
 
The claim is that $\mathrm{dev}$ induces a **bijection** $P_k \to \mathcal{T}_k$, for every $k \ge 1$, with the exception of the
$4.8.8$ at $k=1$, which is not produced because of the missing octagon, but re-added by hand. 

| | obligation | discharged in | whose |
| --- | --- | --- | --- |
| 1 | the alphabet is complete | A1–A6 | classical and mine |
| 2 | the local rules reject nothing that survives | L1–L2, S4 | mine |
| 3 | the search visits every gluing | T1, S1–S3 | mine |
| 4 | the duplicate test is exact | R1–R3, P1–P3 | theirs, restated |
| 5 | a finished gluing is a real tiling | C1–C4 | mine |
| 6 | every planar tiling is a gluing | B0–B3 | mine |

These pull against each other: soundness is easiest by **rejecting aggressively**, completeness by
**rejecting nothing at all**. What the four rules owe is only the second half, that they reject
**nothing that could still become a tiling**. Rejecting too little costs time and nothing else,
because a gluing is certified when it **closes**, by obligation 5.

---

## Obligation 1: the alphabet is complete

Out of the $21$ vcs, we saw that $6$ never occur in **any tiling** and $4.8.8$ in one only, 
so **$14$ configurations** remain. Each splits by **the site symmetry** its vertex may carry, 
and the variants are exactly the **conjugacy classes of subgroups** of the configuration's own symmetry group.

<alphabet-44>
</alphabet-44>

This set of $44$ is **pairwise non-isomorphic**, it doesn't appear in the literature, and was discharged by **machine certificate**.

---

## Obligation 2: the local rules reject nothing that survives

The four rules are the engine's **only source of speed** and its **only chance to lose a tiling**, so
each has to be shown **necessary**: **no real tiling's fold can break it**. Three transfer directly:
- **Mismatch**: the fold does not change which tiles sit either side of an edge
- **Lost trail**: a partial walk sits inside a finished one, so it cannot run long
- **Mirror break**: a symmetry takes a half-edge on a mirror to a half-edge on a mirror

False closure is a bit more subtle. A face's walk closes as soon as it returns modulo the rotational symmetry that fixes that face, since those act **freely** on the $n$ corners, so the walk closes at $\ell = n/r$ and $r$ divides $n$. 

Counting orbits including the reflections as well is unsound, because those do not act freely: a hexagon
whose own symmetries include two mirrors has two corner orbits while its walk still closes at three.

<rules-necessary>
</rules-necessary>

Necessity is about finished gluings; rejecting **early** is safe because along a branch
gluings are only added, so a broken rule stays broken in every descendant.

---

## Obligation 3: the search visits every gluing

We can show that the search produces every finished gluing:
- **start**: a DFS is **rooted at every letter**, so whatever the tiling is made of, its minimal letter is one of the roots
- **inductive step**: whichever free half-edge the rule picks, the target gluing is closed, so the partner exists, and it sits either on a vertex already placed or on a new one. Both are enumerated*, so it misses none
- **emission**: the budget gates **vertex addition only**, so a run at $K$ emits every $k \le K$.

<no-drop>
</no-drop>

$^*$When Adding a new vertex, the search chooses which of the new letter's half-edges to glue, 
and tries **one per symmetry class** instead of all of them. A missed class here drops every tiling
reachable only through it (the $2849$ bug). We checked this in the **machine certificate A5**.

---

## Obligation 4: the duplicate test is exact

The search reaches the same assembly by many routes, so `prune` must decide when two are **the same one
relabelled**, i.e., whether their half-edges can be **matched up** so that they have the same partners,
neighbours around a vertex, and mirrors. It does that by **elimination**: every half-edge of one may
start out matched to every half-edge of the other; a pairing is **crossed off** the moment it needs one
that has already gone; and the sweep repeats until nothing more falls.

<refinement-exact>
</refinement-exact>

The same sweep on **one assembly against itself** answers a second question: a half-edge still free to
stand in for a *different* one means the assembly **repeats a smaller one**, and it is dropped before
any comparison.

The rest is geometry. A half-edge with the tile on its left **determines a frame of the plane**, so
exactly one isometry carries one half-edge to another and the only question is whether it is a
**symmetry of the whole tiling**: an isometry that is not a symmetry fails at some edge, and that 
failure travels back along a path and **separates the two half-edges**, which is the sweep crossing them off.

---

## Obligation 5: a finished gluing is a real tiling

A finished gluing has no coordinates, so turning it into geometry means walking the assembly and laying
tiles down as you go, and there are two things that **no local rule could spot**:
1. **Holonomy**. The walk returns to where it started **carrying a different accumulated rotation**: that vertex is a cone point, not a flat piece of the plane.
2. **Global overlap**. Tiles can be laid down with no local overlap and still overlap after wrapping around.

<flat-torus>
</flat-torus>

Turns out that neither can happen: every abstract vertex is **flat by construction**: the angles sum up to the full turn.
A finite, flat, two-sided surface can only be a **torus** (Killing–Hopf), and unrolling a torus gives back the plane, 
**covering it exactly once**, so nothing can fold.

---

## Obligation 6: every planar tiling is a gluing

The other five establish that the engine loses none of the tilings **it was capable of building**; this
one establishes that those are **all the tilings there are**.

Take any $k$-uniform tiling and **fold it by its own symmetries**. Three things follow:
- it is **periodic**, and here that is a theorem: the fold has at most $12k$ flags, $k$ neighbourhoods
  already cover the plane, and a symmetry fixing one flag fixes everything, which is all **Bieberbach**
  needs to hand back **two independent translations**
- the fold is a **finished gluing over the alphabet** with exactly **$k$** vertices, so a run at $k$
  builds it
- and it **does not repeat a smaller one**, so the pruner keeps it

<quotient-bridge>
</quotient-bridge>

Folding and developing are **inverse**, so each tiling has exactly one gluing and each gluing exactly
one tiling.

---

## We still need peer review

Two theorems are taken from the literature and not reproved, **Bieberbach** and **Killing–Hopf**, and
four lemmas of obligation 1 are discharged as **machine certificates**: A3, A4, A5, A6.

There are still residual risks that can invalidate the proof:
- **the implementation may not follow the algorithm exactly**, which is exactly where the earlier Python port lost its tiling
- mis-specified machine certificates
- three steps in the flatness argument are checked case by case, with no general lemma behind them
- the mathematics itself

All this work **still needs peer-reviewing**, and until then I would not call the catalogue proven on my own authority.

---

<part-slide part="5">
<showcase-wall></showcase-wall>
</part-slide>

---

## What is mine, and what is not

<slide-cols top="yes">
<div>

**Not mine**

- Vertex configurations catalogue: classical literature
- the counts to $k=15$, from Krötenheerdt, Chavey, Galebach and Čtrnáct
- The STS methods: Čtrnáct, Griffin and Kopczyński:
  - searching gluings, not placements
  - the four local rules
  - the Conway-symbol notation
  - the duplicate test, with its theorem

</div>
<div>

**Mine**
- From my methods:
  - the bounded-weight theorem, with its small-$k$ sharpening
  - the Delaney-Dress certification of 11 and 20
  - the exact-arithmetic substrate
  - the measured negative result at $k=4$
- About Marek's STS:
  - the completeness and correctness proof of that algorithm
  - the alphabet generalisation, reached independently but not first
- The Tiling Atlas

</div>
</slide-cols>

---

## The engine reproduces every published count

This method produced all known counts (with the logged exception of $4.8.8$ at $k=1$).

| $k$ | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| counts | 10* | 20 | 61 | 151 | 332 | 673 | 1472 | 2850 |

| $k$ | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| counts | 5960 | 11866 | 24459 | 49794 | 103082 | 212631 | 445289 | 933637 |

This sets no record, since the threshold of $k=15$ published by Čtrnáct, Griffin and Kopczyński was then surpassed by a later implementation of his, which reached $k=18$.

With the recent optimizations, Marek and I decided to try and reach $k=24$, which is where the "Amazing Amalgam", the smallest 14-Archimedean Euclidean tiling, lives.

---

## New tile families

Regular polygons enter the search at **the start of the pipeline** and determine the list of vertex types it is allowed to
use, so if we make that list **an input instead of a hard-wired table**, the same unmodified search reaches
star polygons, composite tiles, scaled families and polyominoes. 

On the star family it reproduces Myers's hand catalogues entry for entry, all 23 at $k=1$ and all 43
at $k=2$, and it also returns **three entries his 2-uniform list does not contain**: two isolated
tilings, and a one-parameter family.

<slide-grid cols="3">
<tiling-card tiling="ctrnact-star-k2-01" title="3.6.12*, isolated" periods="2"></tiling-card>
<tiling-card tiling="ctrnact-star-k2-04" title="3.4.12*, isolated" periods="2"></tiling-card>
<tiling-card tiling="ctrnact-s24f-family-k2-02" title="3.3*, one free angle" periods="2"></tiling-card>
</slide-grid>

Of course **none of this is a proven enumeration**: future work could focus on adapting the proof's obligations, if necessary.
For now, these families are **just an exhibition of how the mechanism can be extended**

---

## The Tiling Atlas project

Every result in the thesis is rendered from **the exact coordinates the solver produces** in a novel
online platform.

![](/defense/figures/atlas-landing.png)

I will continue, with the help of Marek (and hopefully other contributors), to extend the catalogue and add more classes of tilings. 

---