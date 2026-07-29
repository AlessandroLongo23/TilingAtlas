# The six obligations, in plain language

Study sheet for the defense. Source: `thesis/chapters/engine-proof.tex` (chapter 7) and
`thesis/chapters/app-proof-body.tex` (appendix A). Lemma tags in brackets refer to the
ledger in appendix A.11.

Target: say each claim out loud in one sentence, say what breaks without it, and give the
proof spine in three or four sentences. You do not need the lemma proofs themselves.

---

## The frame you say before any of the six

Memorise this. Everything else hangs off it.

The engine computes no coordinates at all until the search is over. Its unit of work is an
abstract vertex: a cyclic sequence of half-edges with angles between them, and nothing in
it records where the vertex lies. A single abstract vertex stands for a whole orbit of
vertices of the eventual tiling. So a k-uniform tiling, which has infinitely many vertices
in the plane, is assembled from at most k abstract ones, and the search space is finite by
construction. Building a tiling means deciding, for every half-edge, which other half-edge
it joins. A finished assembly is a finite combinatorial object with no geometry in it.

That is why the engine is fast, and it is exactly why a proof is needed. The object the
search manipulates is not a tiling. It is a quotient. The proof's job is to show that the
dictionary between finite gluings and infinite planar tilings is a bijection in both
directions.

**The theorem.** Run the pipeline with vertex budget at least k. Then it terminates; every
gluing it emits develops to a genuine k-uniform tiling; every k-uniform tiling is the
development of some gluing it emits; and distinct gluings develop to non-isometric tilings.
Equivalently `dev` induces a bijection P_k → T_k.

**The line to have ready about why it is hard.** The four parts pull against one another.
Soundness, which stops the engine inventing tilings, is easiest to secure by rejecting
aggressively. Completeness, which stops it losing them, is easiest to secure by rejecting
nothing. So the substance is showing that the four rules reject exactly the assemblies that
could never have become tilings, and not one assembly more.

---

## Obligation 1: the alphabet is complete

**Claim.** Every vertex that can occur in a k-uniform tiling by regular polygons is one of
the 44 types the search is given, and no two of the 44 describe the same vertex.

**What breaks without it.** If a vertex type were missing, the search would never build a
tiling that needs it. No error, no warning, just a smaller number. Silent failure.

**Proof spine.** Two halves.

The first half is classical, Grünbaum and Shephard Table 2.1.1. There are 21 cyclic
sequences of regular polygons whose interior angles sum to 360°. Six of those species occur
at no vertex of any edge-to-edge tiling. 4.8.8 is the orphan. The remaining ten polygon
multisets give 14 distinct cyclic configurations, because four of them admit two
inequivalent cyclic orders. [A1]

Then split each configuration by the site symmetry a vertex of that type may carry: an
axis, a rotation, both, or neither. Formally the variants are conjugacy classes of subgroups
of the configuration word's symmetry group. That gives the 44. [A2, certified by A3–A5]

The second half, that the 44 are pairwise non-isomorphic, is not in the literature. It is
discharged by an explicit machine certificate you added. [A6]

**Whose.** Classical plus yours.

**Likely question: "what if the Grünbaum and Shephard table is wrong?"**
Then the alphabet is wrong and the enumeration is wrong with it. You say this in §7.5. You
checked it against the copy in the project's reference collection but did not reprove it. It
has stood since 1987. Do not defend it further than that; the thesis already concedes it
cleanly and the concession is a strength.

**Likely question: "does this cover your star polygon results?"**
No, and this is the one obligation that cannot transfer. Its proof *is* the classical species
table for regular polygons, and no such table exists for stars, composites, or scaled tiles.
Those alphabets come from your generator, and the generator's completeness is a new claim
about a new enumeration. That is why §8.8 reports those families as an exhibition of the
mechanism with no completeness claim, and why §7.7 names it as the most useful single piece
of future work: prove the generator complete for one new family and that family's catalogue
becomes as certified as the regular one.

---

## Obligation 2: the local rules reject nothing that survives

**Claim.** If a partial assembly sits inside some finished gluing that develops to a tiling,
then it passes all four rules.

**What breaks without it.** The four rules are the engine's only source of speed and the
only point at which it can lose a tiling. Necessity has to be established for each of the
four separately.

**The four rules, in words.**

- **Mismatch.** Each half-edge sees a polygon on its left and one on its right. Gluing two
  half-edges puts those polygons face to face, so the two must present the opposite pair. A
  half-edge with a triangle left and a square right can only meet one with a square left and
  a triangle right.
- **Mirror break.** A half-edge lying on an axis of symmetry is its own mirror image; one not
  on an axis is not. The two kinds cannot be glued to each other.
- **Lost trail.** Follow the polygon on one side of a half-edge around its boundary through
  the gluings made so far. If it is still open and has already used more edges than its size
  allows, the assembly is dead. A hexagon can carry at most five completed edges and two
  dangling half-edges before it is forced to close.
- **False closure.** If a polygon closes up, the number of full edges around it must divide
  its size. A hexagon closing with three full edges is fine: the same edge sequence repeats
  twice and the hexagon in the finished tiling carries a 2-fold rotation. A hexagon closing
  with four is impossible.

**Proof spine.** [L1, L2]

L1(i) is the key. For any tiling T and any subgroup H of its symmetries, the quotient T/H is
automatically valid: every face walk has constant colour n, and closes at length ℓ = n/r
where r is the order of the rotation part of the H-stabiliser of that face. So ℓ divides n.
The divisor condition is not a heuristic, it is forced by the fact that an abstract vertex
stands for an orbit.

L1(ii) is heredity. Any partial substructure of a closed valid system is itself valid, so no
ancestor of a valid configuration violates the conditions. Gluings are only ever added along
a branch and never removed, so a violation persists in all descendants. That is what makes
early rejection safe.

L2 is mirror parity, and it needs no geometry at all: it falls straight out of the axioms,
because γ commutes with μ and is injective, so γ(x) is mirror-fixed exactly when x is.

**Whose.** Yours.

**The interesting sentence to say out loud.** The divisor condition of the false-closure rule
is the only one of the four that reasons about the quotient, not about the plane, and
a plausible-looking strengthening of it would be unsound.

---

## Obligation 3: the search visits every gluing

**Claim.** The depth-first search reaches every valid finished gluing that uses at most k
vertices, and it halts.

**What breaks without it.** Two devices in the search hide difficulties.

First, the search does not try every half-edge at every step. It picks the most constrained
one. Second, when it attaches a fresh vertex it tries only one representative of each class
of equivalent half-edges on that vertex. That second device is a symmetry-breaking prune,
asserted without argument by Čtrnáct, Griffin and Kopczyński.

**Proof spine.** [T1, S1–S4]

Termination is easy: at most 12 stubs per vertex times the vertex budget, every child adds at
least one gluing and none is ever removed, and branching is finite. A finitely branching tree
with bounded branch length is finite. [T1]

The first device costs nothing, and the one-liner is worth memorising: **choosing which
half-edge to extend is a choice of order, not a choice of branch.** [S4]

The second device is the no-drop lemma [S1] and it is the real work. Take any target M, a
finished valid gluing. Show by induction that the search visits a chain of configurations
that "follow" M, meaning there is an injective structure-preserving map into M. At each step
M is closed, so the partner of the picked stub exists in M. Either it is already in the image,
in which case the search's ordinary glue-to-existing-stub branch produces the next
configuration, or it lies on a vertex not yet used, in which case the fresh-vertex branch
does. In that second case the half-edges that could map to it form exactly one automorphism
orbit, and lemma A5 says the representative list meets every such orbit. So the prune loses
nothing. Every step adds one gluing from M's finite set, so the branch reaches a closed
configuration, and an injective surjective morphism is an isomorphism.

**Whose.** Yours.

**Likely question: "which obligation is weakest?"** This one, and say so before they ask.
It is the one place where the algorithm discards branches for a reason that is not local.
You rate it the likeliest hiding place for a mathematical error in §7.6.

**Have this story ready. It is your best one.** An earlier Python implementation of this same
algorithm returned 2849 tilings at k=8 and 5959 at k=9, against the correct 2850 and 5960.
Off by exactly one, both times. Root cause, found in the audit: the hand-computed attachment
bound for the letter (4,4,4,4)A2 tried one dart where it needed two, so it missed the starred
automorphism orbit. Exactly one k=8 tiling was reachable only through a gluing at that dart,
and it was dropped silently. That is lemma A5's failure class happening in the wild, and the
A5/A6 certificates are precisely the checks that exclude it. A one-entry fix restores 2850.

This story does three things at once: it proves the obligation is real and not
bureaucratic, it shows the machine certificates earning their keep, and it explains why a
search that agrees with a published sequence still needs a proof. Use it.

---

## Obligation 4: the duplicate test is exact

**Claim.** When the partition refinement stabilises, two half-edges lie in the same class if
and only if some symmetry of the tiling carries one to the other.

**What it buys.** Two things at once. It decides whether a candidate has a hidden symmetry,
in which case its description is not minimal and a smaller description of the same tiling
occurs elsewhere in the search, so the candidate can be dropped. And it decides whether two
candidates are the same tiling.

**Whose.** This one is theirs. It is Theorem 1 of Čtrnáct, Griffin and Kopczyński, the only
theorem their paper proves. Cite it as theirs, plainly.

**Why you restate and reprove it anyway.** This is the most interesting five minutes in your
whole chapter 7 and you should be able to tell it without notes.

As stated, the claim is *false* for general structures of this shape. The refinement is the
classical 1-dimensional Weisfeiler-Leman procedure, and WL is known not to decide
isomorphism. Concrete counterexample: a 3-cycle and a 6-cycle under a single successor map
refine into indistinguishable classes, and yet no isomorphism carries a vertex of one to a
vertex of the other. Refinement equivalence does not, in general, imply that a symmetry
exists.

The theorem is true here all the same, and the reason is geometric, not combinatorial. A
half-edge together with the tile on its left determines a frame of the plane, so there is a
*unique* isometry carrying a given half-edge to another. The only question is whether that
isometry is a symmetry of the whole tiling. The plane is simply connected, so local agreement
propagates: if the isometry fails to be a symmetry it must fail at some edge, and the failure
travels back along a path and separates the two starting classes.

The authors' proof runs exactly this way and is correct. But it leans on the
simple-connectedness of the plane and on the rigidity of frames without naming either, and
neither property is available to the abstract quotient the algorithm actually manipulates.
Your R1 isolates the hypothesis the argument needs and B0 establishes it: a symmetry fixing a
flag is the identity.

Your own line, worth quoting on stage: of everything in the chapter, this is the step whose
apparent obviousness is most misleading.

---

## Obligation 5: a finished gluing is a real tiling

**Claim.** Every valid finished gluing develops to an edge-to-edge tiling of the Euclidean
plane by regular polygons, with no overlap and no gap.

**What breaks without it.** This is the obligation the original authors discharge in a single
sentence: "Since all the polygons are convex, they are edge-to-edge adjacent and all the
vertices fit, a complete tiling describes a valid tiling of the plane." It is the hardest of
the six.

A finished gluing is abstract. Turning it into a picture means walking the assembly and laying
down coordinates, and two things can go wrong that no local rule can see:

1. **Holonomy.** The walk returns to where it started carrying a different accumulated
   rotation. The object is not flat.
2. **Global overlap.** Tiles can be laid down with no local overlap and still overlap after
   wrapping around.

**Proof spine.** [C0–C4, with C2 classical]

Build the direction bundle: the cover of the gluing that unfolds every site symmetry by
remembering an edge direction in Z/12. Cone points and mirrors disappear upstairs. Then glue
one closed unit-edge regular n-gon per face walk.

The result is a compact, connected, flat, oriented surface. Flat because the link of every
vertex is a single cycle of total angle exactly 12 units, which is 2π, so every vertex has a
flat disk around it. Oriented because every gluing reverses boundary orientations, so the
face orientations assemble globally. [C1]

By Killing-Hopf, a closed flat oriented surface is C/Λ for a rank-2 lattice. It is a torus,
and nothing else. [C2, the classical input]

The universal cover of a flat torus is the plane, the development is a covering map onto it,
and a covering map of the plane by the plane is a homeomorphism. That last step is what
excludes the global overlap. [C3a–C3d]

**Whose.** Yours.

**The plain-language version for the talk.** We glued abstract pieces together with no
coordinates anywhere. How do we know the result is a picture, not a broken one?
Because the glued object is a closed flat surface; the only closed flat oriented surface is a
torus; and the plane wraps onto a torus without ever folding back on itself.

**Likely question: "why not orbifolds?"** You planned it that way originally, through
Thurston's orbifold chapter. You replaced it with the direction bundle because the orbifold
route imports machinery whose fine print a referee has to re-verify, and because the direction
bundle is what `eu_develop` literally computes. Orbifolds are still the right mental picture
of the quotient; they no longer appear in any proof.

---

## Obligation 6: every planar tiling is a gluing

**Claim.** Conversely, every k-uniform tiling of the plane arises as the development of some
valid finished gluing over at most k vertices.

**What breaks without it, and this sentence must be memorised.** Nothing in Čtrnáct, Griffin
and Kopczyński addresses this obligation, and without it the word "completeness" is void of
content. The preceding five establish only that the engine produces tilings and loses none of
those it was *capable* of building. This one establishes that the tilings it was capable of
building are all the tilings there are.

**Proof spine.** [B0–B3]

A k-uniform tiling has at most 12k flag orbits, because a vertex has degree at most 6 (every
angle is at least 60°) so carries at most 12 flags, and there are k vertex orbits. It acts
cocompactly, because every point of the plane lies in some tile and so within one dodecagon
circumradius of some vertex, and there are only k vertex orbits to be near. Discrete plus
cocompact gives one of the 17 wallpaper groups by Bieberbach, hence a rank-2 translation
lattice. So k-uniform implies doubly periodic, which is a theorem here and not an assumption.
[B1]

Therefore the canonical quotient by the full symmetry group is a finite, closed, connected,
valid stub system over the alphabet with exactly k vertices. [B2a] It is a core, meaning its
only congruence is equality. [B2b]

Then a Galois correspondence between intermediate subgroups and congruences closes the circle:
development and quotient are mutually inverse, and every tiling has exactly one core. [B3]

**Whose.** Yours.

---

## The octagon (not one of the six, but they will ask)

The engine works in twelve directions, Z[ζ₁₂], which represents the edge directions of
{3,4,6,12} but not the octagon, whose diagonals need √2. So the engine returns 10 at k=1
instead of 11. A scope restriction on a completeness claim has to be paid for.

**Theorem.** For every k ≥ 2, no k-uniform tiling by regular polygons contains an octagon. At
k=1 exactly one does, the 4.8.8 tiling.

**Argument.** Among the 21 angle-valid configurations only two contain an octagon: 4.8.8 and
3.8.24. The second is killed by the classical odd-polygon adjacency lemma. So every vertex of
an octagon is 4.8.8. But 4.8.8 forces the corona of that octagon to alternate square and
octagon, each new octagon inherits the same forcing, and the pattern propagates
deterministically over the whole plane to the unique 4.8.8 tiling. So any tiling containing an
octagon *is* that tiling, which is 1-uniform.

Cost: exactly one tiling, at k=1, known, named, re-added by hand. Čtrnáct, Griffin and
Kopczyński reach the same conclusion and call 4.8.8 an "orphan vertex, forever destined to
tile on its own."

---

## What the proof rests on

Two classical inputs, taken without reproving:

1. **Grünbaum and Shephard, Table 2.1.1, pp. 59–61.** The species table. Supplies Obligation 1
   and the exclusion of 3.8.24.
2. **Killing-Hopf**, the classification of closed flat surfaces. Supplies Obligation 5.

Plus Bieberbach for B1, which the appendix tags as closed modulo a citation pin, since the 2D
case of cocompact discrete planar groups is standard.

Four lemmas of Obligation 1 are discharged by machine over the 44 vertex types. Independently
re-run and audited. They are finite checks over a small set, and you record them as checks
and not as arguments.

**One inconsistency to be ready for.** §7.5 names two classical inputs. The appendix ledger
says "the sole standing classical input is C2 (Killing-Hopf)," because it folds Grünbaum and
Shephard into citation pins on A1/O2/O4, not a standalone classical row. Both
statements are defensible under their own conventions, but a careful reader comparing the two
can ask. The answer: §7.5 counts what you take on authority; the ledger tags rows whose entire
content is imported. Have that ready instead of being surprised by it.

---

## Status of the proof: say this before they make you say it

Section 7.6, close to verbatim. Put it on a slide.

Every lemma is stated and proven, the two classical inputs are named, the machine obligations
are discharged and audited. It has not been peer-reviewed. It was written over a short period
at the end of the project. The honest summary is that you believe it is correct and you would
not yet call the catalogue proven on your own authority, and that is a distinction you intend
to keep.

Residual risk, in the order you judge it:

1. **The implementation may not be the algorithm.** The theorem is about an abstract pipeline;
   the C++ that produced the catalogue is a different object. That gap is exactly where the
   earlier Python port lost its tiling at k=8. The audit found no correctness-critical defect
   on valid input, but an audit is not a verification, and this is where you would look first.
2. **The machine certificates are finite checks.** A subtly mis-specified one passes and proves
   nothing.
3. **Three conventions in the development argument** are verified by finite bookkeeping with no
   general lemma behind them. Routine, not elegant.
4. **The mathematics itself.** Smallest of the four, which is not the same as zero. Obligation 3
   is the likeliest hiding place.

---

## The questions, with answers

**"Your engine reproduces A068599 through k=13 and Čtrnáct's table through k=15. Why do you
need a proof at all?"**

Two reasons. First, the sequence is not itself known to be correct: from k=4 upward its terms
come from unproven computer searches, so agreement establishes only that two programs concur,
neither carrying an argument, and no third program added to the agreement can break the
circularity. Second, searches of this kind do lose tilings, and I have a documented case: the
Python implementation of this very algorithm returned 2849 at k=8 and 5959 at k=9, off by
exactly one both times, detected only because an independent implementation disagreed. A search
that omits one tiling in three thousand produces output that inspection cannot distinguish from
a correct one. Only a proof separates the two cases.

**"Why are the counts not part of the proof?"**

Because a completeness proof that consulted the catalogue it is meant to certify would establish
nothing. The counts are used in exactly one legitimate place, as a regression gate on the
implementation, which is a claim about a different object.

**"The algorithm is not yours. What is?"**

The completeness and correctness proof, which is the principal contribution. The
Delaney-Dress certification of 11 and 20, which shares no machinery with either enumeration
method and consults no prior catalogue, and which as far as I know is the first mechanical
verification of Krötenheerdt's 1969 count. The bounded-weight theorem and its small-k
sharpening. The exact cyclotomic substrate. The measured negative result at k=4. The alphabet
generalisation, reached independently but not first. And TilingAtlas.

**"Why did you abandon your own method?"**

It certified 61 at k=3 per-tiling and deterministically, and its completeness argument closed on
paper under a configuration I could name. I executed that configuration as a measurement and
found it intractable at k=4. So the method that was proven was not the method that ran, and the
method that ran was tuned against the very catalogue it was supposed to certify. Meanwhile the
engine I had been using only as an oracle had reached k=16 in the time my pipeline spent on
k=3, and it had exactly the same missing piece as everyone else's: described, not proven. The
thesis's claim was never that I built a solver. It was that the canonical counts have no
completeness proof and here is one. Nothing in that sentence requires the algorithm to be mine.

**"Is the twelve-direction restriction a completeness gap?"**

No. The octagon theorem pays for it: exactly one tiling, at k=1, known and re-added by hand,
and provably zero octagon-bearing tilings at any k ≥ 2.
