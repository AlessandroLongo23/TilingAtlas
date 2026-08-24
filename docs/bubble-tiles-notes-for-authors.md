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
enumeration separates them: of the three 4-bite hexagonal tiles, exactly two realize with H0 at 1:3
and the third never does, and the same split appears among the three 2-bite tiles paired with H6.
This agrees with Figure 8, which already lists one tile from each triple as impossible, and your
caption does warn that the figure references need not realize every cyclic bite structure with the
listed counts. We mention it because the two surfaces read differently at a glance.

We have deliberately NOT said which letters. Your A/B/C labels within a bite count and ours are both
arbitrary orderings of the same three necklaces, and we have not established the correspondence, so
naming them would be a guess dressed as a result. If you tell us your convention, or if the cyclic
bite words in Figure 3 are unambiguous enough to read off, we can state it in your labels. (Our
ordering does at least pair the same way yours does: our 2X and 4X are arc duals for each X, matching
your "2B and 4B are arc duals".)

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

## 4. The mixed (T,H) rows: every known case reproduces, no unknown one appears

We ran the combined triangle-and-hexagon tile set (18 tiles) to k = 3. It returns 1,696 tilings, of
which 708 genuinely use both a triangle and a hexagon; the other 988 are all-triangle or all-hexagon
and are exactly the single-substrate results, which is itself a useful check. The pure slices of this
18-tile search agree tile for tile with our separate 4-tile and 14-tile searches at every k (7 / 67 /
849 triangular, 3 / 11 / 51 hexagonal), so two quite different alphabets and two independent searches
land on the same catalogue.

Every (T,H) entry Table 2 marks as realized comes back, all twelve of the hexagonal panels in
Figure 15 among them:

| ratio | bite pair | found at |
|---|---|---|
| 2:1 | (0,6), (3,0) | k=1 |
| 2:1 | (1,4), (2,2) | k=2 and k=3, and for all three of the 4-bite and 2-bite tiles |
| 4:1 | (1,5), (2,1) | k=2 |
| 6:1 | (1,6), (2,0) | k=3 |

None of the four Unknown entries appears: not (0,4) or (3,2) at 2:3, and not (0,5) or (3,1) at 4:3.

We think the first table is what makes the second worth reading. A search that recovers twelve of
twelve known realizations, including the ones needing three vertex orbits, and then returns nothing
for the four open cells, is saying something more than "we did not find them". It is still bounded
evidence: a realization could need more than three vertex orbits, and the near misses suggest where
to look, since at k = 2 we do get T0x4 T3x2 H4x3, T0x5 T3x1 H5x3 and T0x1 T3x5 H1x3, which carry the
target hexagonal component at the target ratio but with a third tile in the set.

## 5. Offer

The catalogue is browsable and we are happy to share the raw data, per lattice and per k, or to check
any specific prototile set and ratio to a given k. The mixed run is continuing to k = 4.

## Caveats

k counts vertex orbits, so "absent at k ≤ 5" is bounded evidence and never a proof of impossibility.
Our hexagonal A/B/C letters within a bite count are an arbitrary ordering of the necklaces and we
have not matched them to yours, so this note never names one. At three bites the schemes differ in
shape as well: we write 3A/3B/3C/3D where you write 3A/3A*/3B/3C. The partition into tiles is
identical either way. Where a bite count has only one tile (0, 1, 5, 6 on hexagons; every triangular
count) there is no ambiguity, and item 1 above rests only on those.
