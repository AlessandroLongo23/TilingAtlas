---
type: concept
tags: [notation, concept]
status: seeded
sources: ["tools/ctrnact-oracle/reference/algorithm.txt (Marek, Part 1)"]
---

# Half-edges and corners

> Terminology note: the repo's CLAUDE.md calls these "Conway symbols" as shorthand. Marek's own
> write-up calls them **half-edge labels** and **corners**. This note uses his terms; if a chat
> message says "Conway symbol," it means this labelling.

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

For symmetric vertices the numbering is richer — symmetry identifies some half-edges/corners, so the
label set is smaller or carries the symmetry class. The `(3,6,3,6)F` case in `algorithm.txt` works
this through; capture the details here once I've read past the first page and asked Marek.

## Why this matters

The solver grows a candidate dual by matching a corner of one vertex against a compatible corner of
another (half-edge to half-edge). The corner strings are literally what gets glued and later
canonicalised — see [[dual-search]] and [[canonical-form]].

## From the chat

- 
