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

A tiling of the plane is a countable family of closed sets whose union is **the whole plane** and whose
**interiors do not meet**.

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

## Covering the plane exactly once

We do not allow a tiling with a **gap** or an **overlap**. Every point of the plane is either inside exactly
one tile, on an edge shared by two, or a vertex where several meet.

![](/defense/figures/not-a-tiling.png)

---

## Periodicity

We require periodicity: a tiling is periodic when **two independent translations** carry it onto itself, 
so the whole of it is determined by **one finite patch** repeated on a lattice. 

<slide-grid cols="3">
<patch-card patch="penrose" label="Penrose: never repeats"></patch-card>
<patch-card patch="hat" label="the hat: never repeats"></patch-card>
<tiling-card tiling="t1006" title="periodic: one cell, repeated"></tiling-card>
</slide-grid>

---

## Edge-to-edge

A tiling is edge-to-edge when every edge of every tile is **a whole edge** of each tile beside it, so
that a corner of one tile **never lands part-way along the side** of another. The squares below show
both cases.

![](/defense/figures/edge-to-edge.png)

---

## Only regular polygons

Finally, we are restricting the study to the tilings that consists of **regular polygons only**.

<slide-cols>
<div>
<tiling-card tiling="t1006" title="inside the problem"></tiling-card>
</div>
<div>
<tiling-card tiling="ctrnact-mixed-family-k1-04" title="outside it, for now"></tiling-card>
</div>
</slide-cols>

---

## Vertex configuration

A vertex configuration (vc) is a **list of polygons sharing a vertex**, and its name is just the number 
relative to each polygon, listed in the **least cyclic lexicographical order**: e.g. $4.6.12$ is a square,
a hexagon, and a dodecagon. 

**Fifteen** of them appear in a tiling of the plane; the other **six** close the full turn, but don't appear
in any tiling.

<slide-grid cols="7">
<vc-card word="3.3.3.3.3.3"></vc-card>
<vc-card word="3.3.3.3.6"></vc-card>
<vc-card word="3.3.3.4.4"></vc-card>
<vc-card word="3.3.4.3.4"></vc-card>
<vc-card word="3.3.4.12"></vc-card>
<vc-card word="3.3.6.6"></vc-card>
<vc-card word="3.4.3.12"></vc-card>
<vc-card word="3.4.4.6"></vc-card>
<vc-card word="3.4.6.4"></vc-card>
<vc-card word="3.6.3.6"></vc-card>
<vc-card word="3.12.12"></vc-card>
<vc-card word="4.4.4.4"></vc-card>
<vc-card word="4.6.12"></vc-card>
<vc-card word="4.8.8"></vc-card>
<vc-card word="6.6.6"></vc-card>
<vc-card word="3.7.42" tiles="no"></vc-card>
<vc-card word="3.8.24" tiles="no"></vc-card>
<vc-card word="3.9.18" tiles="no"></vc-card>
<vc-card word="3.10.15" tiles="no"></vc-card>
<vc-card word="4.5.20" tiles="no"></vc-card>
<vc-card word="5.5.10" tiles="no"></vc-card>
</slide-grid>

---

## Vertex orbits

A vertex orbit is the set of vertices that **the tiling's own symmetries** can carry onto each other, 
and a tiling is said *k*-uniform when there are exactly $k$ of them.

<slide-grid cols="3">
<orbit-card tiling="t1011" label="k = 1"></orbit-card>
<orbit-card tiling="t3001" label="k = 3"></orbit-card>
<orbit-card tiling="t5001" label="k = 5"></orbit-card>
</slide-grid>

---

## The numbers we have, and where they came from

The counts for the first values of k are listed in the **OEIS A068599**:

11, 20, 61, 151, 332, 673, 1472, 2850, ....

But **knowing is not the same as having proven**, which is the gap we are trying to fill.

Here is the first term in full. The three ringed use a single shape of tile: they are the **regular**
tilings, and the other eight the **semiregular** ones.

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

## Nobody who produced these counts proved them

At $k=2$ and $k=3$ the counts rest on case analyses, and from $k=4$ on they rest on computer searches, but **none of them comes with a completeness argument**.

<count-timeline>
</count-timeline>

So the sequence is not a theorem: it is a **consensus**.

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
the patch. This tiling is $cmm$ — the commonest group at $k = 4$, **50 of the 151**. Symmetry does not
construct a tiling, then; it **constrains the period lattice**, and it can be detected exactly once the
tiling is already in hand.

<slide-grid cols="2">
<tiling-card tiling="t4003" title="t4003, a cmm tiling" periods="3"></tiling-card>
<seed-card tiling="t4003" domain="yes" label="its seed, with the domain over it"></seed-card>
</slide-grid>

---

## Architecture two: grow the patch, then look for periods

Using the fact that each vertex should belong to one of the seed's $k$ orbits, we **stamp rigid copies**
of it at the open vertices with exact isometries, and then search the finished patch for **two
independent translations** that map it onto itself. The stamping rule is not the lever: a stronger one,
stamping the whole grown patch, not the seed, prunes about a tenth of the search for roughly
**900 times the cost**.

<growth-strip>
</growth-strip>

---

## What killed it was a measurement I had never run

The decisive experiment, which I had never run at the real radius, showed hard 2-uniform seeds
saturating a **410-deep search stack** with patches of about **730 tiles**: locally legal, non-periodic
boundary variants, **proliferating without any bound**.

The tempting repair was to emit as soon as a patch certifies a period and prune that branch.
Fortunately I tried to prove that step before shipping it, because it turns out to be **unsound**: the
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

## Every coordinate is an integer, not a decimal

A vertex of a regular-polygon tiling is reached from any other by **a whole number of unit edges**, and
those edges point in **24 directions**: the powers of $\zeta_{24} = e^{2\pi i/24}$. So a coordinate is a
list of integers, and two vertices coincide or they do not. There is **no tolerance to choose**.

That matters more here than in most geometry. A floating-point error does not blur a picture in this
setting: it **changes an integer, and with it the count**.

<period-figure panel="wheel">
</period-figure>

---

## The octagon exception

Among the 21 angle-valid configurations, only $4.8.8$ and $3.8.24$ contain an octagon. 
The second provably never yields a valid tiling, so every vertex of an octagon is $4.8.8$: this forces 
the corona of that octagon to alternate square and octagon, and that **propagates deterministically**
over the whole plane to the unique $4.8.8$ tiling.

<octagon-forcing>
</octagon-forcing>

So the octagon only appearance is in that tiling, and since its interior angle of 135 is the only one that forces 
the odd $\zeta^{2n+1}$ directions, we can just remove this polygon from the pool, log the $4.8.8$ drop at $k=1$, 
and use the remaining **twelve even directions** $\zeta_{12} = e^{2\pi i/12}$.

---

## Architecture three: fix the period before placing a tile

This next method fixed both problems by **inverting the order**, and both steps are **finite**:

1. **enumerate the candidate period lattices**: each *k*-uniform tiling has a period
generated by **sums of a bounded number of unit edges**, and we managed to prove finitness
in the **bounded-weight theorem**
2. **fill each resulting torus** exhaustively: the area is finite, and so is the search

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
Cut every tile into **chambers**, one for each (vertex, edge, tile) it contains. Reflecting a chamber
across each of its three sides gives **three involutions**; add the **size of the tile** and the
**degree of the vertex**, and that is the tiling's **Delaney–Dress symbol**.

<delaney-symbol>
</delaney-symbol>

The symbol is the chamber system **divided by the tiling's own symmetries**, so it is finite: an
infinite tiling written as a handful of nodes and two integers. A **realizability lemma proven here**
puts minimal flat symbols in **bijection with congruence classes of *k*-uniform tilings**, so
enumerating tilings becomes enumerating symbols.

---

## The symbol budget, and where it runs out

A vertex has degree at most six, so it carries at most twelve chambers, and there are $k$ vertex
orbits: a *k*-uniform tiling has **at most $12k$ chambers**. The sweep is **bounded before it starts**
— $\delta \le 12$, then $24$, then $36$.

<dsym-growth>
</dsym-growth>

Bounded is not the same as reachable. Our generator closes the $k=1$ envelope in **16,500 search
nodes**; $k=2$ costs **314 million** of them and eight minutes; at $k=3$ it produced **not one
complete symbol in sixty million**. And the wall is **the bound, not the machine** — $12k$ is
provable but loose, and at $k=2$ most minimal symbols are no bigger than 16.

It still delivered: **11 and 20, with no catalogue consulted**, which as far as I know is the **first
mechanical verification of Krötenheerdt's 1969 count**.

---

## What we kept

- **The bounded-weight theorem**, with its small-$k$ sharpening and the attainment certificates that
  go with it.
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
a method that was able to start from any polygon set, and not just regular polygons.

But after seeing my methods' limitations, I went and took a better look, with the hope that his method would be
easier to prove and to extend to other classes of tilings. Luckily, it was.

![](/defense/figures/ctrnact-repo.png)

---

## Marek Čtrnáct's Synthetic Tiling Searcher (STS)

An abstract vertex is a **cyclic sequence of half-edges** with the angles between them, and **nothing in
it records where the vertex lies**. One abstract vertex stands for a whole orbit of the eventual
tiling.

<abstract-vertex word="3.4.6.4">
</abstract-vertex>

So a *k*-uniform tiling, which has infinitely many vertices in the plane, is assembled out of at
most $k$ abstract ones, and the search space is **finite by construction**, with **no bound to
establish beforehand**.

---

## The four local rejection rules

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

## How the search actually runs

One move, over and over: take a **free half-edge** and pair it with another, either one **already in the
assembly** or one on a **piece added on the spot**. Check the four rules; a failure **undoes the move**
and tries the next pairing.

<solve-loop>
</solve-loop>

Which half-edge it takes is not arbitrary: always the one whose **tile is closest to closing**, so a
wrong turn dies within a few moves. It halts because a piece may be added **at most $k$ times**, and
when no half-edge is left free, the assembly **is** a tiling with $k$ vertex orbits.

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

## Why agreement between programs settles nothing

The sequence itself is not known to be correct, so agreement establishes only that **two programs
concur while neither carries an argument**, and adding a third program **cannot break the circularity**.

And searches of this kind do lose tilings. An earlier Python implementation of this very algorithm
returned 2849 at $k=8$ and 5959 at $k=9$, against the correct 2850 and 5960: **off by exactly one,
twice**, and caught only because **an independent implementation disagreed with it**.

> *"Turned out I forgot to implement one vertex type, but because it was very rare, it didn't occur at all at the beginning. Or something like that."*, Marek 
>

---

## Theorem and proof obligations

Run the pipeline with a vertex budget of at least $k$. Then it **halts**; every gluing it emits develops
into a genuine $k$-uniform tiling; every $k$-uniform tiling is the development of some gluing it
emits; and distinct gluings develop into tilings that are not isometric. That is to say,
$\mathrm{dev}$ induces a **bijection** $P_k \to \mathcal{T}_k$.

The four parts pull against each other, and that is where the difficulty is: soundness is easiest to
get by **rejecting aggressively**, completeness is easiest to get by **rejecting nothing at all**.

So the substance of the proof is showing that the four rules reject **exactly the assemblies that
could never have become tilings**, and not one assembly more.

| | obligation | discharged in | whose |
| --- | --- | --- | --- |
| 1 | the alphabet is complete | A1–A6 | classical and mine |
| 2 | the local rules reject nothing that survives | L1–L2, S4 | mine |
| 3 | the search visits every gluing | T1, S1–S3 | mine |
| 4 | the duplicate test is exact | R1–R3, P1–P3 | Čtrnáct et al. |
| 5 | a finished gluing is a real tiling | C1–C4 | mine |
| 6 | every planar tiling is a gluing | B0–B3 | mine |

Number four is theirs, the single theorem their paper proves. **The other five are new here.**

---

## Obligation 1: the alphabet is complete

Twenty-one cyclic sequences of regular polygons close $360°$. Six of them occur at **no vertex of any
tiling**, and $4.8.8$ leaves with the octagon, so **fourteen configurations** remain. Each of those
splits by **the site symmetry** its vertex may carry, and the variants are exactly the **conjugacy
classes of subgroups** of the configuration's own symmetry group, which is why the square vertex alone
contributes eight of them and the triangular one ten.

<alphabet-44>
</alphabet-44>

The first half is Grünbaum and Shephard's species table, taken on authority; the second, that the 44
are **pairwise non-isomorphic**, is not in the literature and is discharged by **machine certificate**.
A missing letter would cost tilings **in silence**: no error, no warning, just a smaller number.

---

## Obligation 2: the local rules reject nothing that survives

The four rules are the engine's **only source of speed** and its **only chance to lose a tiling**, so
necessity has to be established for each of them separately. Three of them are inherited term by term:
colours descend to the quotient, open chains only shorten, and mirror parity is a consequence of the
axioms. **The divisor rule is the one that needs an argument.**

<rules-necessary>
</rules-necessary>

It alone reasons about **the quotient and not about the plane**. A face's walk closes as soon as it
returns modulo the symmetry that fixes that face, and the elements that can return it are **the
rotations only**, which act freely on the $n$ corners: so the walk closes at $\ell = n/r$, and $r$
divides $n$ because a group acting freely has orbits of one size. Counting orbits of the **whole**
stabiliser instead is the plausible strengthening, and it is unsound: a hexagon on a $2mm$ site has
two corner orbits and a walk that still closes at three.

---

## Obligation 3: the search visits every gluing

Take any finished gluing. The search **follows** it: whichever free half-edge the rule picks, the
target is closed so the partner is there, and that partner sits either on a vertex already placed or
on one the fresh-vertex move brings in. Both are enumerated, so **which half-edge gets picked is a
choice of order and not of branch**, and the most-constrained-first heuristic costs nothing.

<no-drop>
</no-drop>

What is not free is the second device. The Python reference solver computed its attachment list by
hand and gave $(4,4,4,4)$A2 **one half-edge where it needed two**, missing the starred orbit entirely.
Exactly one $k=8$ tiling was reachable only that way, so it was **dropped in silence**: 2849 instead of
2850. His recollection was a missing vertex type; the audit found the type present and an orbit of its
half-edges lost. I rate this obligation the **likeliest of the six to hide an error**, and that is the
failure class it exists to exclude.

---

## Obligation 4: the duplicate test is exact

This one is **theirs**, the single theorem their paper proves. I restate and reprove it anyway,
because as stated it is **false**. The test is **1-dimensional Weisfeiler–Leman** refinement, and
refinement equivalence does not imply that a symmetry relates the things it identifies.

<refinement-exact>
</refinement-exact>

What is missing is a hypothesis. Refinement here does compute the coarsest congruence exactly, because
the operations are **functions** and not relations, so this is DFA minimisation and not general-graph
WL. But a congruence is not a symmetry, and the test only ever runs on **cores**, which the object on
the left is not: collapsing to one class is exactly what failing to be a core means. What turns a
congruence on a core into a real isometry is geometric, and none of it is available to the abstract
quotient the algorithm manipulates. Of everything in the chapter, this is **the step whose obviousness
is most misleading**.

---

## Obligation 5: a finished gluing is a real tiling

> Since all the polygons are convex, they are edge-to-edge adjacent and all the vertices fit, a
> complete tiling describes a valid tiling of the plane.

That sentence is the whole of the original argument, and this is the **hardest of the six**. A finished
gluing has no coordinates in it, so turning it into a picture means walking it and laying them down,
and two things can go wrong there that **no local rule can see**.

<flat-torus>
</flat-torus>

---

## Obligation 6: every planar tiling is a gluing

**Nothing in the original paper addresses this one**, and without it the word "completeness" is empty.
The other five establish that the engine loses none of the tilings **it was capable of building**; this
one establishes that those are **all the tilings there are**.

<quotient-bridge>
</quotient-bridge>

Note that **periodicity is a theorem here and not an assumption**. It falls out of cocompactness, and
that is a small thing I am pleased about.

---

## What the proof rests on, and where it could fail

We take two results from the literature without reproving them, the **Grünbaum and Shephard species
table** and **Killing-Hopf**. Four more obligations are discharged by machine, and I record those as
**checks, not as arguments**, because that is what they are.

The residual risk, in the order I judge it: first, **the implementation may not be the algorithm**,
which is exactly where the earlier Python port lost its tiling; second, a mis-specified machine
certificate would pass and prove nothing; third, three conventions in the development argument rest
on finite bookkeeping with no general lemma behind them; and fourth, the mathematics itself, which I
rate **smallest**, though that is not the same as zero.

> I believe it is correct, and I would not yet call the catalogue proven on my own authority.

---

<part-slide part="5">
<showcase-wall></showcase-wall>
</part-slide>

---

## The engine reproduces every published count<sup>*</sup>

| $k$ | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tilings | 11 | 20 | 61 | 151 | 332 | 673 | 1472 | 2850 |

| $k$ | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tilings | 5960 | 11866 | 24459 | 49794 | 103082 | 212631 | 445289 | 933637 |

This sets no record, and I want to say so before anyone asks: Čtrnáct, Griffin and Kopczyński
published through $k=15$, a later implementation of his reaches $k=18$, and the table contains **no
tiling that was not already known**.

What it is, is **a check on my re-implementation**, and a good one, because a search that loses tilings
tends to lose them at one particular $k$, not uniformly.

<small style="opacity:0.62">* assuming the algorithm is implemented correctly and faithfully matches the theory</small>

---

## Making the alphabet an input opens up new tile families

Regular polygons enter the search at **exactly one point**, the list of vertex types it is allowed to
use. If we make that list **an input instead of a hard-wired table**, the same unmodified search reaches
star polygons, composite tiles, scaled families and polyominoes. Because Čtrnáct's later
implementation already did this, I reached it **independently but not first**, which is how it should be
read.

On the star family it finds every in-ring entry of Myers's hand catalogues, 37 at $k=1$ and all 34
in-ring at $k=2$, and it also returns **four tilings that his 2-uniform list does not contain**. Those
four survived **three independent adversarial reviews** before we reported them as candidate
omissions.

Of course **none of this is a proven enumeration**: obligation 1 does not transfer, so these families
are **an exhibition of the mechanism and nothing more**.

---

## TilingAtlas, which displays certification without producing it

Every result in the thesis is rendered from **the exact coordinates the solver produces**, and the
platform is careful about **the difference between showing a certificate and being one**.

---

## What is mine, and what is not

The Synthetic Tiling Searcher is **not mine**: searching gluings, not placements, the four local
rules, the Conway-symbol notation, the duplicate test with its theorem, and the counts to $k=15$ all
belong to Čtrnáct, Griffin and Kopczyński. The vertex-configuration catalogue is classical, and the
counts themselves are Krötenheerdt's, Chavey's and Galebach's.

**What is mine** is the completeness and correctness proof of that algorithm, the Delaney-Dress
certification of 11 and 20, the bounded-weight theorem with its small-$k$ sharpening, the
exact-arithmetic substrate, the measured negative result at $k=4$, the alphabet generalisation
reached independently but not first, and TilingAtlas.

---

## What is open

The most useful single thing this thesis leaves behind is a target: **prove the generator complete for
one new tile family**, and that family's catalogue becomes **as certified as the regular one**.

After that, **a certified enumeration** at $k=4$, and **peer review of the proof**.

---

<part-slide part="backup">
</part-slide>

---

## A cap that can lose a solution is not a speed dial

The solver carries **one parameter that could cost tilings** if it were set too low, a cap on how many
flat mid-edge vertex types a partial assembly may accumulate.

So the implementation treats it accordingly, and when the cap binds the run prints
`COMPLETENESS NOT CERTIFIED` and we do not use the result. A count is accepted only at **a budget
fixpoint**, that is, when consecutive budget levels produce **byte-identical catalogues** with no warning.

That discipline has already paid for itself. On the scaled palette at $k=4$ the default budget
quietly costs **73 tilings out of 1064**, and the fixpoint is only reached at **budget 12**.

