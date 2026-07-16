---
type: concept
tags: [notation, concept]
status: seeded
sources: ["tools/ctrnact-oracle/reference/algorithm.txt (Marek, Part 1)"]
---

# Half-edges and corners

> Terminology note, corrected 2026-07-16: "Conway symbol" is Marek's genuine term for the *gluing*
> notation built from these labels (his extension of the doily notation in *The Symmetries of
> Things*), see [[conway-symbol]]. This note covers the labels themselves: half-edges and corners.

Seeded from
[../../../tools/ctrnact-oracle/reference/algorithm.txt](../../../tools/ctrnact-oracle/reference/algorithm.txt),
Part 1. This is the notation the dual-search glues with, so reading it is the key to reading his code.

## Half-edges

A half-edge is the line from the vertex to the midpoint of an adjacent edge. Each half-edge of a
vertex gets a number `0, 1, 2, …`. The starting point and direction are arbitrary; Marek's convention
is to start so the polygon between half-edges `0` and `1` is the largest possible, then take the
lexicographically maximal labelling.

For the asymmetrical vertex `(3,4,4,6)` the four half-edges land as:

- `1` between hexagon and square
- `2` between two squares
- `3` between square and triangle
- `0` between triangle and hexagon

## Mirror half-edges

A mirror image of a half-edge keeps the number and prepends `*`. So the mirror of `(3,4,4,6)` has
`*0, *1, *2, *3`, with the adjacencies reflected. Numbering ascends on the normal vertex and
descends on the mirror image.

## Corners

A corner is a pair of consecutive half-edges plus the polygon size between them, written
`left/right(size)-`. The trailing dash makes corners easy to concatenate into a string. `(3,4,4,6)`
has eight corners:

```
0/1(6)-  1/2(4)-  2/3(4)-  3/0(3)-
*0/*3(3)-  *1/*0(6)-  *2/*1(4)-  *3/*2(4)-
```

Convention: the first half-edge is on the left, the second on the right; all corners are oriented the
same way, but mirror vertices have their half-edges labelled in reverse (hence the descending
`*0/*3`, `*1/*0`, … order).

## Symmetric vertices

Symmetry identifies half-edges, so a symmetric tile contributes fewer distinct labels. In the chat's
`(a^3,b^2)` example the axis mirrors edges 0↔3 and 1↔2 and self-mirrors 4, so only one of each
mirrored pair appears in the final symbol. Full walkthrough in [[conway-symbol]]; the TES markers
`*n` and `|n` carry the same data ([[tes-format]]).

## Why this matters

The solver grows a candidate by pairing half-edges (see [[dual-search]]); the corner strings are what
the weaving chains into vertices. Reading them is the key to reading his code and files.

## From the chat

- Corner syntax confirmed live: `0/1` = "vertex between edge 0 and edge 1," dashes separate corners, a
  missing final dash closes the cycle; with polygon types it reads `0/1(A)-`.
  ![[archive/2026-07-14#^msg-1526600787197952186]] ![[archive/2026-07-15#^msg-1527054744068161666]]
- Multi-tile labels use primes (`0'`, `0''`) and `@n` beyond three tiles ([[tes-format]]).
- His skeleton for `(a^3,b^2)` symmetric case, exactly this notation:
  ![[archive/2026-07-15#^msg-1527054931604013067]]
