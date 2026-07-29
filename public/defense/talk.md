<title-slide>

# Algorithmic Generation of <span style="white-space: nowrap">*k*-uniform</span> Tilings of the Plane

Alessandro Longo

Master's Thesis defense, 10 August 2026

</title-slide>

<!-- notes: Do not start the clock talking. Title up, name, and straight into slide 2. The first
sentence out of your mouth should be about the numbers, not about yourself. -->

---

## What is a tiling?

A tiling of the plane is a countable family of closed sets whose union is the whole plane and whose
interiors do not meet.

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

<!-- notes: Read the definition once, slowly, then spend the time on the pictures. Say that the
tiles happen to be polygons here, though the definition does not require it. The bottom row
matters: polyominoes are not regular polygons, and the last two do not repeat at all. Both get
excluded over the next three slides, so plant them here without arguing yet. -->

---

## Covering the plane exactly once

We do not allow a tiling with a gap or an overlap. Every point of the plane is either inside exactly
one tile, on an edge shared by two, or a vertex where several meet.

![](/defense/figures/not-a-tiling.png)

<!-- notes: Thirty seconds. This is the floor everything else stands on, so state it and move. -->

---

## Periodicity

We require periodicity: a tiling is periodic when two independent translations carry it onto itself, 
so the whole of it is determined by one finite patch repeated on a lattice. 

<slide-grid cols="3">
<patch-card patch="penrose" label="Penrose: never repeats"></patch-card>
<patch-card patch="hat" label="the hat: never repeats"></patch-card>
<tiling-card tiling="t1006" title="periodic: one cell, repeated"></tiling-card>
</slide-grid>

<!-- notes: Worth saying out loud that periodicity is not an assumption we make for convenience: for
k-uniform tilings it is a theorem, and it comes back in Obligation 6. -->

---

## Edge-to-edge

A tiling is edge-to-edge when every edge of every tile is a whole edge of each tile beside it, so
that a corner of one tile never lands part-way along the side of another. The squares below show
both cases.

![](/defense/figures/edge-to-edge.png)

<!-- notes: Of course a brick wall is a perfectly good tiling. It is just not one of ours, and the
committee will be happier if you say that rather than letting the constraint look arbitrary. -->

---

## Only regular polygons

Finally, we are restricting the study to the tilings that consists of regular polygons only.

<slide-cols>
<div>
<tiling-card tiling="t1006" title="inside the problem"></tiling-card>
</div>
<div>
<tiling-card tiling="ctrnact-mixed-family-k1-04" title="outside it, for now"></tiling-card>
</div>
</slide-cols>

<!-- notes: "For now" is deliberate: the star family comes back near the end, when making the tile
alphabet an input lets the same search reach it. Say that here in one clause and they will remember
it forty minutes later. -->

---

## Vertex configuration

A vertex configuration (vc) is a list of polygons sharing a vertex, and its name is just the number 
relative to each polygon, listed in the least cyclic lexicographical order: e.g. $4.6.12$ is a square,
a hexagon, and a dodecagon. 

Fifteen of them appear in a tiling of the plane; the other six close the full turn, but don't appear
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

<!-- notes: A minute. Walk round 4.6.12 out loud, the one you just named: square, hexagon,
dodecagon. The dot marks the shared vertex. Then the dashed six: a triangle, a heptagon and a 42-gon
really do fit round a point, and that is as far as they get. If asked why, quote the fact that only
triangles, squares, hexagons, octagons and dodecagons occur in an edge-to-edge tiling of regular
polygons (Grunbaum and Shephard, Tilings and Patterns, section 2.1), and do not try to prove it at
the board. Do not mention that two configurations can share a multiset; that is a Q&A slide. -->

---

## Vertex orbits

A vertex orbit is the set of vertices that the tiling's own symmetries can carry onto each other, 
and a tiling is said *k*-uniform when there are exactly $k$ of them.

<slide-grid cols="3">
<orbit-card tiling="t1011" label="k = 1"></orbit-card>
<orbit-card tiling="t3001" label="k = 3"></orbit-card>
<orbit-card tiling="t5001" label="k = 5"></orbit-card>
</slide-grid>

<!-- notes: NINETY SECONDS, and hover while you talk. Hover one orbit on the left: everything
lights, because every vertex is the same vertex as far as the tiling is concerned. Then the middle
and the right, one orbit at a time. Do not say group action and do not mention wallpaper groups.
This is the definition the whole talk rests on, so let the pointer do the explaining. -->

---

## The numbers we have, and where they came from

The counts for the first values of k are listed in the OEIS A068599:

11, 20, 61, 151, 332, 673, 1472, 2850, ....

But knowing is not the same as having proven, which is the gap we are trying to fill.

Here is the first term in full. The three ringed use a single shape of tile: they are the regular
tilings, and the other eight the semiregular ones.

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

<!-- notes: NOW the numbers mean something, because they know what is being counted. Say the two
lines and pause. Then the eleven: name the three ringed ones out loud (triangles, squares,
hexagons) and say that everything else on the slide mixes two or three shapes. Do not walk all
eleven names; the point is that the first term of the sequence is small enough to show entire, and
the ninth is not. -->

---

## Nobody who produced these counts proved them

At $k=2$ and $k=3$ the counts rest on case analyses, and from $k=4$ on they rest on computer searches, but none of them comes with a completeness argument.

<count-timeline>
</count-timeline>

So the sequence is not a theorem: it is a consensus.

<!-- notes: Land the last line and stop. This is the gap the whole thesis addresses. If anyone
presses on Kepler: he drew all eleven in 1619 with no completeness argument, but k=1 is the one
entry here that has been settled since, by Robin in 1887 and many times after, which is why the
sentence on the slide starts at k=2. Do not claim Kepler proved anything. -->


---

## The methods I explored

In this kind of work, the path to the solution is as important as the solution itself, because it's evidence of what worked and what didn't. 

Each of the methods I explored had strengths and weaknesses, and the first four were abandoned either because they didn't scale, or because the next was easier to prove.

<method-strip>
<method-card fig="growth" name="Grow the patch" note="until it holds two translations"></method-card>
<method-card fig="wallpaper" name="Fit the symmetry" note="one domain, then its orbit"></method-card>
<method-card fig="torus" name="Fix the period first" note="then fill the torus exhaustively"></method-card>
<method-card fig="delaney" name="Enumerate the symbols" note="Delaney–Dress, then realize"></method-card>
<method-card fig="gluing" name="Glue the half-edges" note="no coordinates until the end" accent="yes"></method-card>
</method-strip>

<!-- notes: The strip is the map of the next act: five ways to enumerate, in the order I tried them,
and the boxed one is where the talk lands. Point at each panel for a beat, no more, and do not
explain any of them here; each gets its own slide.

Say the chapter 9 line out loud rather than reading the slide back: in a computer-assisted
classification the path taken is itself evidence, so I am going to report it. Then the honest
summary: three architectures built, a fourth abandoned at the drawing board, and each one failed
into something, a theorem or a prohibition or a measurement.

Cut when the slide went visual, kept here in case it is wanted back: "I built three architectures
and abandoned a fourth at the drawing board. What I want to show is not that they failed, but that
each one failed into something: a theorem, a prohibition, or a measurement." / "None of them died of
being slow." -->

---

## Wallpaper groups

In the euclidean 2D space, every tiling or pattern belongs to one of the 17 wallpaper groups, depending on its **symmetries**.

<wallpaper-wall>
</wallpaper-wall>

---

## Architecture one: symmetry-first

<slide-cols>
<div>

The first method was based on symmetry:
- generate a seed patch
- for each tuple of construction points:
  - try to fit the fundamental domain of each of the 17 wallpaper groups
  - check for validity and reconstruct the tiling from the symmetries

</div>
<div>
<seed-card tiling="t4001" label="a k = 4 seed, with its construction points"></seed-card>
</div>
</slide-cols>

<!-- notes: Ninety seconds. It never got built, so do not spend more than that. The dots are the
construction points: red centroids, green edge midpoints, blue vertices — the candidates a
fundamental domain's corners were matched against. `s` puts the symmetry elements over the seed if
someone asks what "fit" means. -->

---

## Architecture one: failure

Some groups have elongated lattices, which can make a vertex of the fundamental domain "fall" out of
the patch. This tiling is $cmm$ — the commonest group at $k = 4$, 50 of the 151. Symmetry does not
construct a tiling, then; it constrains the period lattice, and it can be detected exactly once the
tiling is already in hand.

<slide-grid cols="2">
<tiling-card tiling="t4003" title="t4003, a cmm tiling" periods="3"></tiling-card>
<seed-card tiling="t4003" domain="yes" label="its seed, with the domain over it"></seed-card>
</slide-grid>

<!-- notes: The pair is the argument: the tiling on the left, the patch the search would actually have
in hand on the right, with cmm's fundamental domain drawn over it. Fifty of the 151 k=4 tilings are
cmm, so this is not an awkward corner — it is the single commonest case at that level. -->


---

## Architecture two: grow the patch, then look for periods

Using the fact that each vertex should belong to one of the seed's $k$ orbits, we stamp rigid copies
of it at the open vertices with exact isometries, and then search the finished patch for two
independent translations that map it onto itself. The stamping rule is not the lever: a stronger one,
stamping the whole grown patch rather than the seed, prunes about a tenth of the search for roughly
900 times the cost.

<growth-strip>
</growth-strip>

<!-- notes: Give it its due before you kill it. The orbit gate and the disallowed-vc prune both came
out of this architecture and both survived into the final system. -->

---

## What killed it was a measurement I had never run

The decisive experiment, which I had never run at the real radius, showed hard 2-uniform seeds
saturating a 410-deep search stack with patches of about 730 tiles: locally legal, non-periodic
boundary variants, proliferating without any bound.

The tempting repair was to emit as soon as a patch certifies a period and prune that branch.
Fortunately I tried to prove that step before shipping it, because it turns out to be unsound: the
certified patch below extends legally in two ways at every row, and the prune keeps one of them.

<row-stacker>
</row-stacker>

<!-- notes: Build it live. Add a few rows, mixing squares and triangles, and let the counter climb —
every one of those is a legal tiling containing the ringed patch, and emit-on-closure keeps exactly
one. All three interfaces close 360 degrees, which is why every choice is free: squares on squares is
4.4.4.4, triangles on squares is 3.3.3.4.4, triangles on triangles is 3.3.3.3.3.3. This is the first
entry in the prohibited-prune registry. Then the closing line, slowly, because it is the hinge of the
first half: growth has no sound stopping rule, so the period has to be fixed before the search
begins. Keys: 1 squares, 2 triangles, Backspace undo, 0 reset. -->

---

## Architecture three: fix the period before placing a tile

This next method fixed both problems by inverting the order: it first enumerates the candidate period
lattices, and then it fills each resulting torus.

What makes that enumeration finite is the bounded-weight theorem, proven for this purpose: the
period lattice of any *k*-uniform tiling is generated by sums of a bounded number of unit edges.

Every decisive comparison happens exactly, in $\mathbb{Q}(\zeta_{24})$, because a floating-point
error in this setting does not blur a picture: it changes an integer, and with it the count.

<!-- notes: The bounded-weight theorem is the longest proof the first method needed. It is yours, and
it survives the pivot: it is contribution 4. -->

---

## A count can be wrong twice and still look right

The first full $k=2$ run terminated cleanly and returned 23 against the reference 20. Diagnosing that
single discrepancy took an entire phase of the project, and it taught me more than any success in
the thesis.

<slide-cols>
<div>
<tiling-card tiling="t2014" title="t2014, the missing twentieth"></tiling-card>
</div>
<div>

The pipeline had only ever found 19 distinct tilings, so the 23 was an under-merged 19: an
over-count and an under-count that happened to cancel into a plausible number. The missing twentieth
has a fundamental cell smaller than the rigid seed core, so the patch we seeded the fill with could
never fit inside the tiling it was supposed to find.

Later the same thing happened at $k=1$, where a tuned area bound dropped an Archimedean
tiling and a duplicate-count bug of the opposite sign hid it. Two errors cancelling into the
expected 11.

It survived that long because the number it produced was the number I was expecting.

</div>
</slide-cols>

<!-- notes: This is the best methodological slide you have, so do not rush it. The lesson in one
sentence: counts are validated per-tiling against an independent catalogue, or they are not
validated. -->

---

## Measuring the wall at $k=4$

Coverage was never the problem. The obstacle is how much there is to fill: 13,000 to 27,000 fillable
seeds against 449 at $k=3$, and on a representative sample 25 fills out of 25 timed out at both a
15-second and a 30-second cap, with no cell completed.

I could have run it for a week, but an intractability measurement is a decisive answer too, which
is what the experiment returned.

![](/defense/figures/k4-wall.png)

<!-- notes: Say plainly that measuring the wall was a choice, and defend it in one sentence if
asked. -->

---

## What survived the method that failed

The bounded-weight theorem survived, together with its small-$k$ sharpening and the attainment
certificates that go with it, and so did the exact cyclotomic substrate underneath it.

The certified 61 at $k=3$ survived, matched tiling by tiling under two independent implementations.

So did the prohibited-prune registry, which records two prunes proven unsound so that nobody
re-derives them, and a characterised negative result, which is a result.

<!-- notes: Close the act here and go straight into the pivot. Do not apologise for the year. -->

---

## There was a second solver in my repository the whole time

For months it had exactly one job: to disagree with my pipeline whenever my pipeline was wrong. It
was Čtrnáct's, I had found it on GitHub, and I used it purely as an oracle.

It had reproduced the whole sequence to $k=16$ in the time my own pipeline was spending on $k=3$.

<!-- notes: Slow down here, this is the hinge of the talk, and let the last line sit before you
click. -->

---

## I was defending the slower engine because it was mine

I was treating the faster engine as a checking tool and the slower one as the contribution, and the
reason for that arrangement had nothing to do with the mathematics.

But the claim of this thesis was never "I built a solver": it was that the canonical counts have no
completeness proof and here is one, and nothing in that sentence requires the algorithm to be my
own. Čtrnáct's has exactly the same missing piece as everyone else's, in fact: it is described
carefully but never proven.

> The proof comes first, and it attaches to whatever machinery can actually carry it. It is not
> sentimental about authorship.

<!-- notes: What I lost is a year on an architecture that will not scale. What I kept is in the
thesis on its own merits. What I gained is a proof of an engine that reaches far enough for the
proof to be worth having. -->

---

## The engine searches gluings, not placements

An abstract vertex is a cyclic sequence of half-edges with the angles between them, and nothing in
it records where the vertex lies. One abstract vertex stands for a whole orbit of the eventual
tiling.

So a *k*-uniform tiling, which has infinitely many vertices in the plane, is assembled out of at
most $k$ abstract ones, and the search space is finite by construction, with no bound to
establish beforehand.

That finiteness is exactly what the bounded-weight theorem bought at such length for the previous
method, and here it comes for nothing. I find that slightly galling.

<!-- notes: The galling line is verbatim from the thesis and it always gets a reaction. Use it. -->

---

## Four local rules do all the rejecting

- **Mismatch**: gluing two half-edges lays their polygons face to face, so the two profiles have to
  be opposites.
- **Mirror break**: a half-edge on a mirror axis is its own mirror image, and one off the axis is
  not, so the two kinds cannot be joined.
- **Lost trail**: a polygon that is still open and has already used more edges than its size allows
  is dead.
- **False closure**: when a polygon closes, the number of full edges around it has to divide its
  size.

![](/defense/figures/gluing-profile.png)

<!-- notes: A hexagon closing with three full edges is fine, because the same edge sequence repeats
twice and the hexagon carries a 2-fold rotation. Closing with four is impossible. The figure is the
mismatch rule worked on 3.4.4.6. -->

---

## Only the last stage touches geometry

The pipeline is three stages, `solve`, then `prune`, then `develop`, and the first two never compute
a coordinate. Only `develop` does, exactly, in $\mathbb{Z}[\zeta_{12}]$, and by the time it runs the
search is already over.

That is the whole reason the engine is fast. Unfortunately it is also where the hardest proof
obligation lives, which we come to in two slides.

<!-- notes: One minute. This slide exists to set up Obligation 5, so do not linger. -->

---

## Why agreement between programs settles nothing

The sequence itself is not known to be correct, so agreement establishes only that two programs
concur while neither carries an argument, and adding a third program cannot break the circularity.

And searches of this kind do lose tilings. An earlier Python implementation of this very algorithm
returned 2849 at $k=8$ and 5959 at $k=9$, against the correct 2850 and 5960: off by exactly one,
twice, and caught only because an independent implementation disagreed with it.

> *"Turned out I forgot to implement one vertex type, but because it was very rare, it didn't occur at all at the beginning. Or something like that."*, Marek Čtrnáct
>

<!-- notes: This is the slide that justifies the whole thesis. Do not rush it. -->

---

## What the theorem claims

Run the pipeline with a vertex budget of at least $k$. Then it halts; every gluing it emits develops
into a genuine $k$-uniform tiling; every $k$-uniform tiling is the development of some gluing it
emits; and distinct gluings develop into tilings that are not isometric. That is to say,
$\mathrm{dev}$ induces a bijection $P_k \to \mathcal{T}_k$.

The four parts pull against each other, and that is where the difficulty is: soundness is easiest to
get by rejecting aggressively, completeness is easiest to get by rejecting nothing at all.

So the substance of the proof is showing that the four rules reject exactly the assemblies that
could never have become tilings, and not one assembly more.

<!-- notes: Announce the difficulty before you show the structure. That is the shape they expect. -->

---

## The proof splits into six obligations

| | obligation | discharged in | whose |
| --- | --- | --- | --- |
| 1 | the alphabet is complete | A1–A6 | classical and mine |
| 2 | the local rules reject nothing that survives | L1–L2, S4 | mine |
| 3 | the search visits every gluing | T1, S1–S3 | mine |
| 4 | the duplicate test is exact | R1–R3, P1–P3 | Čtrnáct et al. |
| 5 | a finished gluing is a real tiling | C1–C4 | mine |
| 6 | every planar tiling is a gluing | B0–B3 | mine |

Number four is theirs, the single theorem their paper proves. The other five are new here.

<!-- notes: You have to be able to talk to this slide for two minutes with your back to it. Say
whose is whose early and without being asked. -->

---

## Obligation 5, which the original paper covers in one sentence

> Since all the polygons are convex, they are edge-to-edge adjacent and all the vertices fit, a
> complete tiling describes a valid tiling of the plane.

A finished gluing is an abstract object, so turning it into a picture means walking it and laying
down coordinates, and two things can go wrong that no local rule can see: the walk can come back
with a different accumulated rotation, which means the object is not flat, and tiles laid down with
no local overlap can still overlap after wrapping around.

We rule both out by showing the developed object is a flat torus. Glue one regular $n$-gon per face
walk and the result is a compact flat oriented surface, because every vertex link closes at exactly
$2\pi$. By Killing-Hopf a closed flat oriented surface is a torus and nothing else. The plane covers
a flat torus, and a covering map of the plane by the plane is a homeomorphism, which is what rules
out the global overlap.

<!-- notes: This is the slide where you demonstrate the skill being graded, so rehearse it more than
any other. Plain version: we glued abstract pieces with no coordinates anywhere, and we know the
result is a picture rather than a broken one because the only closed flat oriented surface is a
torus, and the plane wraps onto a torus without ever folding back on itself. -->

---

## Without obligation 6 the word "completeness" means nothing

Nothing in the original paper addresses this one, which is where I would expect the first
question.

The other five establish that the engine produces tilings and loses none of the ones it was capable
of building. This one establishes that the ones it was capable of building are all the tilings there
are.

The argument runs through periodicity: a *k*-uniform tiling has a cocompact wallpaper group, so it
has a lattice of translations, so it has a finite quotient, and that quotient is itself a legal
gluing over the alphabet with exactly $k$ vertices. Note that periodicity is a theorem here and not
an assumption, which is a small thing I am pleased about.

<!-- notes: Ninety seconds. If they ask one question about the proof it will probably be this one,
because its absence is what would make the whole claim empty. -->

---

## What the proof rests on, and where it could fail

We take two results from the literature without reproving them, the Grünbaum and Shephard species
table and Killing-Hopf. Four more obligations are discharged by machine, and I record those as
checks rather than as arguments, because that is what they are.

The residual risk, in the order I judge it: first, the implementation may not be the algorithm,
which is exactly where the earlier Python port lost its tiling; second, a mis-specified machine
certificate would pass and prove nothing; third, three conventions in the development argument rest
on finite bookkeeping with no general lemma behind them; and fourth, the mathematics itself, which I
rate smallest, though that is not the same as zero.

> I believe it is correct, and I would not yet call the catalogue proven on my own authority.

<!-- notes: Say this before anyone makes you say it. It turns the weakest point into the most
credible one. The obligation most likely to hide an error is 3, the symmetry-breaking prune. -->

---

## The engine reproduces every published count

| $k$ | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tilings | 11 | 20 | 61 | 151 | 332 | 673 | 1472 | 2850 |

| $k$ | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tilings | 5960 | 11866 | 24459 | 49794 | 103082 | 212631 | 445289 | 933637 |

This sets no record, and I want to say so before anyone asks: Čtrnáct, Griffin and Kopczyński
published through $k=15$, a later implementation of his reaches $k=18$, and the table contains no
tiling that was not already known.

What it is, is a check on my re-implementation, and a good one, because a search that loses tilings
tends to lose them at one particular $k$ rather than uniformly.

<!-- notes: Volunteering that this sets no record is worth more than the table itself. -->

---

## Certifying 11 and 20 without consulting any catalogue

The Delaney-Dress chain shares no machinery with either enumeration method. A flag-orbit bound makes
the sweep over symbols finite, a realizability lemma proven here puts minimal flat symbols in
bijection with congruence classes of *k*-uniform tilings, and a terminating realizer turns every
surviving symbol into a certified tiling.

So its agreement with the engine at $k \le 2$ is evidence of a kind neither route can produce alone.
As far as I know this is the first mechanical verification of Krötenheerdt's 1969 count.

Unfortunately it stops there, because symbol generation walls at $k=3$.

<!-- notes: Say where it stops without being asked. -->

---

## Making the alphabet an input opens up new tile families

Regular polygons enter the search at exactly one point, the list of vertex types it is allowed to
use. If we make that list an input instead of a hard-wired table, the same unmodified search reaches
star polygons, composite tiles, scaled families and polyominoes. Because Čtrnáct's later
implementation already did this, I reached it independently but not first, which is how it should be
read.

On the star family it finds every in-ring entry of Myers's hand catalogues, 37 at $k=1$ and all 34
in-ring at $k=2$, and it also returns four tilings that his 2-uniform list does not contain. Those
four survived three independent adversarial reviews before we reported them as candidate
omissions.

Of course none of this is a proven enumeration: obligation 1 does not transfer, so these families
are an exhibition of the mechanism and nothing more.

<!-- notes: The four candidate omissions are the closest thing you have to a "we found something"
moment, so have them open in the atlas in the other window. -->

---

## TilingAtlas, which displays certification without producing it

Every result in the thesis is rendered from the exact coordinates the solver produces, and the
platform is careful about the difference between showing a certificate and being one.

<!-- notes: LIVE DEMO, 60 seconds. Alt-tab to the other window, already sitting on a prepared deep
link. Show one tiling, move one parameter, show the certification badge. If anything hesitates, cut
to the recorded capture and keep talking. Do not debug in front of the committee. -->

---

## What is mine, and what is not

The Synthetic Tiling Searcher is not mine: searching gluings rather than placements, the four local
rules, the Conway-symbol notation, the duplicate test with its theorem, and the counts to $k=15$ all
belong to Čtrnáct, Griffin and Kopczyński. The vertex-configuration catalogue is classical, and the
counts themselves are Krötenheerdt's, Chavey's and Galebach's.

What is mine is the completeness and correctness proof of that algorithm, the Delaney-Dress
certification of 11 and 20, the bounded-weight theorem with its small-$k$ sharpening, the
exact-arithmetic substrate, the measured negative result at $k=4$, the alphabet generalisation
reached independently but not first, and TilingAtlas.

<!-- notes: Putting this on a slide yourself removes the sharpest question in the room, and the
candour reads as confidence rather than concession. -->

---

## What is open

The most useful single thing this thesis leaves behind is a target: prove the generator complete for
one new tile family, and that family's catalogue becomes as certified as the regular one.

After that, a certified enumeration at $k=4$, and peer review of the proof.

<!-- notes: End on the content. No thank-you slide and no questions slide. Stop talking. -->

---

## The octagon costs exactly one tiling

The engine works in twelve directions and so cannot see the octagon, which is why it returns 10 at
$k=1$ instead of 11. A scope restriction on a completeness claim has to be paid for, so we pay it.

Among the 21 angle-valid configurations only $4.8.8$ and $3.8.24$ contain an octagon, and the second
is killed by the classical odd-polygon adjacency lemma. So every vertex of an octagon is $4.8.8$,
which forces the corona of that octagon to alternate square and octagon, and that propagates
deterministically over the whole plane to the unique $4.8.8$ tiling.

So any tiling with an octagon is that tiling, which is 1-uniform, leaving none at all once
$k \ge 2$. The cost is a single tiling, known and named, which we re-add by hand.

---

## Where the 44 vertex types come from

There are 21 cyclic sequences of regular polygons whose interior angles sum to $360°$. Six of those
species occur at no vertex of any edge-to-edge tiling, $4.8.8$ is the orphan, and the remaining ten
multisets give 14 distinct cyclic configurations, because four of them admit two inequivalent cyclic
orders.

Splitting each configuration by the site symmetry a vertex may carry, an axis, a rotation, both, or
neither, gives the 44.

The first half of that is Grünbaum and Shephard. The second half, that the 44 are pairwise
non-isomorphic, is not in the literature, so we discharge it with an explicit machine
certificate.

This is the one obligation that cannot transfer to star, composite or scaled families: its proof is
the classical species table, and no such table exists for them.

---

## Obligation 3, and how a tiling went missing at $k=8$

The search picks the most constrained free half-edge rather than trying all of them, and that costs
nothing, because choosing which half-edge to extend is a choice of order and not a choice of branch.

When it attaches a fresh vertex it tries only one representative per class of equivalent half-edges.
That is a symmetry-breaking prune, asserted without argument in the original paper, which we
discharge here as the no-drop lemma.

It matters, because there is a witness. The Python reference solver's hand-computed attachment
bound for
the letter $(4,4,4,4)$A2 tried one dart where it needed two, so it missed the starred automorphism
orbit. Exactly one $k=8$ tiling was reachable only through a gluing at that dart, so it was dropped in
silence: 2849 instead of 2850. That is this lemma's failure class happening in the wild, and the
A5 and A6 certificates are precisely the checks that exclude it.

---

## Why the duplicate test should not work, but does

The test is 1-dimensional Weisfeiler-Leman, which is known not to decide isomorphism: a 3-cycle and
a 6-cycle under a single successor map refine into indistinguishable classes, and yet no isomorphism
carries a vertex of one to a vertex of the other.

It is true here for a geometric reason rather than a combinatorial one. A half-edge together with
the tile on its left determines a frame of the plane, so there is a unique isometry carrying one
half-edge to another, and the only question is whether that isometry is a symmetry of the whole
tiling. The plane is simply connected, so local agreement propagates. If it fails, it fails at some
edge, and the failure travels back along a path and separates the two starting classes.

Their proof runs exactly this way and it is correct, but it leans on simple-connectedness and on
frame rigidity without naming either, and neither property is available to the abstract quotient the
algorithm actually manipulates. Of everything in that chapter, this is the step whose obviousness is
most misleading.

---

## The prohibited-prune registry

Emit-on-validated-closure was proven unsound and never shipped: a patch that can be completed
periodically can still extend non-periodically into a different valid tiling.

Core-coincidence was proven unsound in review, before it could ship. The idea was to abandon a fill
when two seed vertices coincide modulo the lattice, but coinciding seed vertices merely share an
orbit, and the missing orbits can be realised by vertices the fill creates later.

The orbit-floor prune is correct, though it fired zero times on the hard family. That negative result
is evidence in itself: the degenerations blocking $k=3$ have too few orbits rather than too many, so
no sound mid-fill test can detect them.

<!-- notes: A prune that fires zero times and a prune ruled unsound are both load-bearing knowledge,
and the registry has already prevented one regression. -->

---

## A cap that can lose a solution is not a speed dial

The solver carries one parameter that could cost tilings if it were set too low, a cap on how many
flat mid-edge vertex types a partial assembly may accumulate.

So the implementation treats it accordingly, and when the cap binds the run prints
`COMPLETENESS NOT CERTIFIED` and we do not use the result. A count is accepted only at a budget
fixpoint, that is, when consecutive budget levels produce byte-identical catalogues with no warning.

That discipline has already paid for itself. On the scaled palette at $k=4$ the default budget
quietly costs 73 tilings out of 1064, and the fixpoint is only reached at budget 12.

