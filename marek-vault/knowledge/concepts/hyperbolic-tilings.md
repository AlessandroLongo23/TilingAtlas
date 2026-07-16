---
type: concept
tags: [concept, hyperbolic]
status: from-chat
sources: ["archive/2026-07-13", "archive/2026-07-14", "archive/2026-07-15"]
---

# Hyperbolic tilings: what changes

STS is "geometry-agnostic," so the same combinatorial engine enumerates hyperbolic tilings. But the
hyperbolic world behaves differently enough to reshape the whole catalogue. This note collects the
facts Marek stated that a Euclidean intuition gets wrong.

## No similarity

Hyperbolic geometry has no similarity: a polygon cannot be scaled up or down without changing its
shape (its angles). ![[archive/2026-07-15#^msg-1527046434631717067]] Consequences:

- `(3^7)` and `(3^8)` are both valid vertices, but they **cannot occur in the same tiling**: the
  triangles would need two incommensurable edge lengths. ![[archive/2026-07-15#^msg-1527046631625588826]]
- So enumeration lists are always organised **around a particular edge length**. That is the finite
  slice; the full set of hyperbolic tilings is infinite. ![[archive/2026-07-15#^msg-1527045183508578355]]

This is why my "count the angular excess" idea doesn't buy a finite enumeration: `3^n` for `n>6`
gives infinitely many 1-uniform tilings already, each at its own edge length.

## The m/k table is not triangular

In the Euclidean case, a tiling with a single vertex configuration is uniform (1-uniform). In
hyperbolic space that fails. The `3.5.5.5` tilings have only one vertex configuration yet are **not**
uniform, and in fact must be **at least 3-uniform**. ![[archive/2026-07-14#^msg-1526688026955354232]]
So the "minimum k for a given number of configurations" table is not triangular in hyperbolic space.
The proof that `3.5.5.5` can't be uniform is out of scope for a masters thesis but real.

## Infinite families are parametric; hybrids are the exceptions

Most hyperbolic tilings come in infinite families you can parameterise:

- `(a^4,b)` has **14** families of uniform tilings (his favourite example, 14 = "čtrnáct"). You find
  them by playing with the Conway symbol, see [[conway-symbol]]. Each family holds infinitely many
  tilings but their edge length is bounded: it must be smaller than the edge of `{oo,5}`. You surpass
  the bound by multiplying the vertex, `(a^4,b)` → `(a^4,b,a^4,b)`, any number of copies.
  ![[archive/2026-07-15#^msg-1527049119217094767]]
- `(a^3,b^2)` has two configurations, `(a^3.b^2)` and `(a^2.b.a.b)`, which mix freely (the edge
  length depends only on the combination, not the configuration).
  ![[archive/2026-07-15#^msg-1527052254434299965]]

The **hybrids are the exceptions that don't generalise**: they need an exact equality that usually
holds in only one place. `([3.10]^2)` combines with `([4.5]^2)`, but no other multiplier works. Most
hybrids are sporadic. ![[archive/2026-07-15#^msg-1527050750629253170]]

## Why a candidate can fail (existence conditions)

The Newton edge-length search always converges (see [[edge-length-solver]]), so a valid edge is a
**necessary but not sufficient** condition for a tiling. ![[archive/2026-07-13#^msg-1526188945463972031]]
What kills a candidate:

- **Lack of connections.** Two vertices can only be joined if they share **at least two** polygons,
  because a connection is an edge between two tiles. The Euclidean `4.8.8` is isolated for exactly
  this reason. A vertex with no partner is the "odd one out."
  ![[archive/2026-07-13#^msg-1526189404266303639]]
- **Can't surround a polygon.** In multi-edge-length systems, different edge lengths clash and there
  is no way to build a corona around a tile. He wants this "corona argument" formalised into precise
  conditions. Someone in the server used it to prove `3.3.5.oo` impossible: pentagons and apeirogons
  are never directly adjacent, only `3.5.3.oo` works.
  ![[archive/2026-07-15#^msg-1526871233268809858]]

## Morphs (parametric tilings)

A tiling can carry a continuous parameter and morph in real time:

- `{4,6}`: vary edge lengths to turn squares into rectangles while keeping the 60° angles.
  ![[archive/2026-07-14#^msg-1526592237352386734]]
- Or treat each vertex as two angles summing to 120°, use a rhombus with 30°/90° angles; every vertex
  still has 6 angles around it, no cells merge. ![[archive/2026-07-14#^msg-1526592970407678188]]

HyperRogue's TES format supports this directly with a `slider(...)`, see [[tes-format]]; his `46def.tes`
demo runs the `{4,6}` morph from 0 to 2π/3. This is the hyperbolic analogue of my Euclidean
"morphing tilings" experiment; both tilings need the same fundamental domain.

## Apeirogons behave specially

- An apeirogon looks solid but is built from wedges (triangles with one ideal vertex); HyperRogue can't
  represent a tile with infinitely many neighbours. Its centre is an ideal point you can never reach.
  ![[archive/2026-07-15#^msg-1526934146600009748]]
- Apeirogons are **immune to false closure**: any closing of an apeirogon is valid, so the pruning
  logic treats them gently. This is also why he uses apeirogons as a "wildcard" for an arbitrary
  polygon when searching for topologies, see [[dual-search]]. ![[archive/2026-07-14#^msg-1526700829816656033]]

## Related

[[classification]] · [[hybrid-identities]] · [[edge-length-solver]] · [[tes-format]] · [[k-uniform-tilings]]
