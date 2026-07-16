---
type: concept
tags: [notation, concept]
status: seeded
sources: ["tools/ctrnact-oracle/reference/algorithm.txt (Marek, Part 1)"]
---

# Vertex configuration and vertex symbol

Seeded from Marek's own write-up,
[../../../tools/ctrnact-oracle/reference/algorithm.txt](../../../tools/ctrnact-oracle/reference/algorithm.txt),
Part 1. Enrich with specifics as they come up in the chat.

## Vertex configuration

The list of polygons around a vertex, written as sizes, e.g. `(4,4,4,4)` for four squares, `(3,3,6,6)`
for two triangles and two hexagons. The *order* matters: the same multiset can meet in different
cyclic orders, and those are different configurations. Two triangles and two hexagons give two:
`(3,3,6,6)` (the like tiles adjacent) and `(3,6,3,6)` (alternating).

Interior angles at the vertex sum to 360°. This is the constraint the solver checks as it builds a
vertex (see [[dual-search]]).

## Vertex symbol = configuration + symmetry

A vertex symbol pins down the vertex *type* uniquely by tagging the configuration with the global
symmetry that actually acts on it. A fully asymmetrical configuration like `(3,4,4,6)` is its own
symbol. Symmetrical ones take a suffix letter:

- **F** — full / no global symmetry, e.g. `(3,3,6,6)F`.
- **A** — an axis of symmetry through the vertex, e.g. `(3,3,6,6)A`. When there are several
  inequivalent axes they're numbered: `(3,6,3,6)A1`, `(3,6,3,6)A2`.
- **R** — rotational symmetry; a degree number attaches when several are possible: `R2`, `R3`, `R6`.
- **S** — both axes plus the rotation (the most symmetric); also numbered, and lettered when two
  inequivalent axis classes exist, e.g. `S3a`, `S3b`.

The distinction that matters: the suffix records which symmetries are **global** (symmetries of the
whole tiling), not just locally possible at that vertex. The same geometric vertex appears under
different symbols depending on how the surrounding tiling breaks or keeps its symmetry.

### Worked example — the 3⁶ vertex

`(3,3,3,3,3,3)` (six triangles) is the most symmetric vertex in the Euclidean set, so it spans the
whole ladder of symbols: `F`, `A1`/`A2`, `R2`, `S2`, `R3`, `S3a`/`S3b`, `R6`, `S6`. Axes pass either
through opposite edges or through opposite triangles, which is why axis-bearing symbols split into
two inequivalent classes.

## Why this matters

The vertex symbol, not the bare configuration, is the unit the dual-search glues. Its half-edges and
corners are labelled relative to its symmetry — see [[half-edges-and-corners]].

## From the chat

- **Symmetry is mandatory, not an optimisation.** He started STS with only F (asymmetrical) vertices;
  it failed. The heptomino cut into domino/tromino/domino is his counterexample: without symmetry the
  Conway symbol can't be built without wrongly splitting a tile into two orbits. See [[dual-search]].
  ![[archive/2026-07-14#^msg-1526694055331893369]]
- **Configuration vs combination matters everywhere:** the edge length depends only on the
  combination, so configurations of the same combination can mix in one tiling ([[hyperbolic-tilings]]).
  His hybrid-identity lists are lists of *combinations*, not configurations ([[hybrid-identities]]).
- The `_o` marker on solution files flags chiral batches; chiral vertices enter the search in both
  chiralities ([[canonical-form]]). ![[archive/2026-07-13#^msg-1526147883546575009]]
- Vertices with just **two** tiles occur in his more complex families (I asked about Myers's
  ≥3-polygon convention); he'd consider excluding them from k. ![[archive/2026-07-14#^msg-1526666323818713211]]
