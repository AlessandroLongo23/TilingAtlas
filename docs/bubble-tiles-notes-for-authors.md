# Notes for the authors of *Puzzle Pieces and Bubble Tiles*

Draft of a message to John Chase, Will Field and Alex McCluer, on the working draft dated
2026-08-22. Written 2026-08-23 from an exhaustive enumeration of bubble tilings run in the Tiling
Atlas. Nothing here is sent yet; AL decides what goes.

---

We enumerated bubble tilings exhaustively on all three regular substrates, indexing by k, the number
of vertex orbits of the decorated tiling. Counts, all independently developed and checked:

| lattice | k=1 | k=2 | k=3 | k=4 | k=5 |
|---|---|---|---|---|---|
| triangular | 7 | 67 | 849 | 6,157 | not run |
| square | 11 | 102 | 693 | 6,992 | 33,377 |
| hexagonal | 3 | 11 | 51 | 294 | 228 |

Every one satisfies your balance equation, which is the check we used to validate the pipeline.

**Your published results all reproduce.** All four two-tile triangular tilings of Figure 13, and all
seven square results of Figure 14 (S{2A} and S{2B} monohedral, S{0,4}(1:1), S{1,3}(1:1),
S{2A,2B}(1:1), S{1,4}(2:1), S{3,0}(2:1)). Nothing else is monohedral in either family, which matches
Table 1. On hexagons, k=1 gives monohedral tilings for the two arc-self-dual 3-bite tiles and none
for the chiral pair, consistent with your remark that 3A and 3A* are at best 3-isohedral.

## 1. Figure 8 and Table 2 disagree about two cells

Figure 8 lists H{0,5}(2:3) and H{6,1}(2:3) under "Not possible with regular tiles". Table 2's (H,H)
row at ratio 2:3 places the same two bite pairs in the Unknown column, which the caption defines as
"balance-equation solutions for which no realization is currently known".

Impossible and unknown are different claims, and as written the paper makes both.

Neither combination appears among the 587 hexagonal tilings we find at k ≤ 5. That is evidence for
the Figure 8 reading and not a proof, since a realization could need more than five vertex orbits,
but it is the direction we would bet on.

## 2. Bite counts do not determine realizability, and the hexagonal table shows it

Table 2's (H,H) 1:3 row reads "(0,4), (6,2)" as regular. At the level of individual tiles the
enumeration separates them: H{0,4B} and H{0,4C} realize at 1:3 and H{0,4A} never does, and likewise
H{6,2B} and H{6,2C} against H{6,2A}. This agrees with Figure 8, which already lists H{0,4A}(1:3) and
H{6,2A}(1:3) as impossible, and your caption does warn that the figure references need not realize
every cyclic bite structure with the listed counts. We mention it only because the two surfaces read
differently at a glance, and the per-tile version is now checkable against data.

## 3. The balanced families are ice models, with exactly known entropy

This is the connection we think is most worth having, and we could not find it in the paper.

Orient every edge from its bump side toward its bite side. A bubble tiling is then exactly an
orientation of the dual graph, and nothing else.

Two things follow. First, the balance equation is the handshake lemma: on the quotient torus,
sum over faces of (in-degree − out-degree) is |E| − |E| = 0 for any orientation of any graph. That is
why it is necessary for every tiling, and also why it is weak, being a single global identity with no
local content. It may be worth stating that way in Section 2, since it makes the necessity a line.

Second, and more useful: your "any ratio" rows are solved statistical-mechanics models.

- **Square, (S,S) at (2,2).** A square has 4 neighbours and balance forces 2 bites, so every vertex
  of the dual square lattice has in-degree 2. That is the ice rule, and C(4,2) = 6 gives the
  six-vertex model. Its residual entropy is Lieb's constant, (4/3)^(3/2) ≈ 1.5396 per tile
  (Lieb, *Phys. Rev. Lett.* 18, 692, 1967). So the family in that row is not merely infinite: it has
  positive entropy with an exactly known growth rate, which is a much stronger statement than
  non-uniqueness.
- **Hexagonal, (H,H) at (3,3).** Six neighbours, 3 bites, C(6,3) = 20: the twenty-vertex model on the
  triangular lattice. We believe Baxter solved this in 1969 (*J. Math. Phys.* 10, 1211), and you
  should check that citation before relying on it.
- **Triangular.** Degree 3 forces b = p = 3/2, which is why no monohedral triangular bubble tiling
  exists. That is your odd-sided result, in the same language.

The same framing gives your arc duality a one-line description: it reverses every arrow, which is
why it is an involution and why it commutes with isometries and so preserves the symmetry group.

## 4. Offer

The catalogue is browsable and we are happy to share the raw data, per lattice and per k. Two things
we could run if useful:

- The remaining Unknown cells in Table 2 are the mixed (T,H) rows at 2:3 and 4:3. Those need a
  combined triangle-and-hexagon tile set, which is a small change for us, and would either produce a
  realization or give the same kind of evidence as in item 1 above.
- Any specific prototile set and ratio you want checked to a given k.

## Caveats

k counts vertex orbits, so "absent at k ≤ 5" is bounded evidence and never a proof of impossibility.
Our hexagonal tile names differ from yours at three bites: we write 3A/3B/3C/3D where you write
3A/3A*/3B/3C. The partition into tiles is identical; only the labels differ, and we have used your
labels throughout this note.
