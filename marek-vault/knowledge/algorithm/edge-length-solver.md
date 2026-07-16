---
type: concept
tags: [algorithm, geometry, hyperbolic]
status: from-chat
sources: ["archive/2026-07-13"]
---

# The edge-length solver (Newton iteration)

In hyperbolic space the edge length isn't chosen up front; it is *forced* by the set of polygons you
want around a vertex. This little numerical routine finds it, and it underlies both the hybrid edge
database ([[solution-file-format]]) and the TES `arcmedge` function ([[tes-format]]).

## The method

Iterative, like Newton's method: set a candidate edge length, compute the interior angle of every
polygon at that length, sum them, and adjust the length until the sum equals 2π (the vertex closes).
![[archive/2026-07-13#^msg-1526187467462672506]]

The counterintuitive part, coming from Euclidean planar tilings: the edge length is a **consequence**
of how you arrange the tiles, not a parameter you pick beforehand. ![[archive/2026-07-13#^msg-1526186699179163708]]

## It always converges, to one value

Any finite set of polygons fits *somewhere*, so the iteration always converges to a single edge.
![[archive/2026-07-13#^msg-1526187670336966687]] Bounds make this concrete:

- For `(A3^10, A6^10)` the solution lies between `(A3^20)` and `(A6^20)`.
- Generically, any finite collection has an upper edge bound given by the same number of **apeirogons**
  (the largest the polygons can get). ![[archive/2026-07-13#^msg-1526187968820150293]]

The edge depends only on the **combination** of polygons, never their configuration (the cyclic
order). Two vertices with the same multiset share an edge and can therefore mix. See
[[hyperbolic-tilings]].

## Necessary, not sufficient

A valid edge is a **necessary but not sufficient** condition for a tiling to exist.
![[archive/2026-07-13#^msg-1526188945463972031]] The edge closes the angles; it does not guarantee the
tiles actually assemble. What still kills a candidate (lack of connections, inability to surround a
polygon) is in [[hyperbolic-tilings]]. Proving that the numerically-found lengths are *exactly* equal,
not just equal to 50 decimals, is an open problem, see [[open-questions]].

## Two implementations

- HyperRogue has a **simpler** version built in, which is why you can tell it "work in units that fit
  `(5,5,5,4)`" and it computes the edge. For the complex hybrid systems, Marek still hardcodes the
  edge as a literal number. ![[archive/2026-07-13#^msg-1526188364980551831]]
- The `arcmedge(...)` function in TES files is this method, run at render time.

## Related

[[hybrid-identities]] · [[hyperbolic-tilings]] · [[tes-format]] · [[solution-file-format]] · [[glossary]]
