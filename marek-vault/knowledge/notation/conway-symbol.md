---
type: concept
tags: [notation, concept]
status: from-chat
sources: ["archive/2026-07-14", "archive/2026-07-15"]
---

# The Conway symbol

The central notation. It encodes how the half-edges of a set of tiles glue together, which is exactly
what STS searches over. This note supersedes the earlier guess in [[half-edges-and-corners]]: "Conway
symbol" is Marek's genuine term, not a repo shorthand.

## Origin

It is based on the **doily notation** that Conway and Goodman-Strauss introduced in *The Symmetries of
Things*. That notation was itself a reworking of Marek's own first enumeration idea from the 1990s
(which he calls clunky in hindsight). Marek then extended the doily notation to support **multiple
vertex types**, which is what makes it usable for k-uniform search.
![[archive/2026-07-14#^msg-1526660752126251008]] ![[archive/2026-07-14#^msg-1526661228548587521]]

There is no public write-up; it is "mostly my own thing." A wiki page explaining it is on the
[[roadmap]].

## What the pieces mean

Tiles are given numbered edges. Different tiles are distinguished by primes: triangle `0,1,2`;
quadrangle `0',1',2',3'`. A symbol is a list of **corners** (his word: the join between two edges),
written in brackets:

- `(i j)` — a **direct** join of edge `i` to edge `j`.
- `[i j]` — a **mirror** join.
- `(i)` — edge `i` joins itself directly (2-fold symmetry point).
- `[i]` — edge `i` joins itself as a mirror (a mirror perpendicular to the edge).
- Conway's `<i>` — a self-mirrored edge. Marek **does not use it**; he writes `(i)` and considers the
  extra bracket redundant because the symbol is already machine-readable and renderable without it.
  This drew a reviewer complaint on his paper. ![[archive/2026-07-14#^msg-1526686460575613019]]

A join is permitted to connect a half-edge to itself; that is not an error, it produces a 2-fold
point or a perpendicular mirror. ![[archive/2026-07-14#^msg-1526678489816760492]]

One rule: the symbol must connect **all** defined tiles, otherwise the tiling can't include them all.

Example he built by hand for a triangle + quadrangle:

```
(0)(1)(2 0')(1')(2')(3')
```

## Weaving: from symbol to vertices

"Weaving" turns a symbol into its vertices. Write every corner as `left/right`, marking mirror
half-edges with `*`, then follow the joins until sequences close. With polygon types annotated it
reads `0/1(A)-`, where the dash separates corners and a **missing final dash means the sequence is
closed** (the first corner follows the last). The converter script automates this.
![[archive/2026-07-14#^msg-1526599547344654530]] ![[archive/2026-07-14#^msg-1526600922783023214]]

`0/1` means "the corner between edge 0 and edge 1." The condition that the vertex closes is that the
inner angles of the polygons meeting there sum to 2π (or a divisor of it). That is the same
divisor-of-360° gate the search uses, see [[dual-search]].

## Symmetry is encoded, and it is mandatory

A tile with an axis of symmetry, or a rotational axis, is marked in the symbol. In the TES form (see
[[tes-format]]) this shows up as `*n` (repeat the sequence n times, i.e. n-fold rotation) and `|n`
(axial symmetry, edge n mirrors edge 0). Marek proved to himself that symmetry markers are
**necessary**, not an optimisation: the asymmetric heptomino example fails to build a valid symbol
unless you split a tile into two orbits, which you don't want to do.
![[archive/2026-07-14#^msg-1526697218436763689]] Details in [[vertex-configuration]] (the F/A/R/S
symbols) and [[dual-search]].

## Worked example: deriving the families of a polygon tuple

He walked through `(a^3,b^2)` on 2026-07-15, which is the clearest single example in the whole chat
of how the symbol generates a classification.

Take the vertex, mark its half-edges (`0..4`), and note its axis (edge 4 self-mirrored). Then reason
out the allowed joins:

- **Symmetric case** — 0 must join `*0`, so `[0]` is fixed; 4 joins itself as `(4)`; the only free
  choice is 1 vs `*1`, giving `(1)` or `[1]`. Two solutions: `[0](1)(4)` and `[0][1](4)`. The first is
  the type of the Euclidean `3.3.3.4.4`; the second splits the A polygons into two orbits.
  ![[archive/2026-07-15#^msg-1527054412663623700]]
- **Asymmetric case** — the asymmetry must be *enforced*: any symbol that turns out symmetric folds
  back into the symmetric case and isn't new. Working through 0/3, 4, and the 1/2 pair (whose only
  asymmetric choices are `(1)[2]` or its mirror `[1](2)`), you get **4 distinct families**.
  ![[archive/2026-07-15#^msg-1527058035053297795]] Their skeletons (A as a 6-cycle vs two orbits, B
  as a chiral 2-cycle / 4-cycle / two orbits): ![[archive/2026-07-15#^msg-1527058644489867315]]

So `(a^3,b^2)` yields 2 symmetric + 4 asymmetric solution families. He can do this in his head when
bored; the general algorithm does it for any tuple.

### The apeirogon "wildcard" trick

To have the search enumerate families for a tuple automatically, set every polygon to an **apeirogon**
so any closure is accepted regardless of length (apeirogons ignore false closure, see
[[hyperbolic-tilings]]). The output is the set of possible topologies (a "blueprint"); real
polygons of the right size are slotted in afterward. This is a hack, not a separate mode.
![[archive/2026-07-15#^msg-1527059216315977758]] ![[archive/2026-07-15#^msg-1527060328926544175]]

## Every regular tiling has the same Conway symbol

A consequence worth remembering: because the symbol is combinatorial, all regular tilings share one
Conway symbol; an abstract symbol stands in for a whole infinite family. This is how STS can represent
an infinite hyperbolic family with a single object. ![[archive/2026-07-15#^msg-1527047938457600021]]

## Related

[[half-edges-and-corners]] · [[vertex-configuration]] · [[tes-format]] · [[dual-search]] · [[glossary]]
