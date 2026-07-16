---
type: concept
tags: [algorithm, concept]
status: from-chat
sources: ["archive/2026-07-13", "archive/2026-07-14", "tools/ctrnact-oracle/reference/algorithm.txt"]
---

# STS: the search (partial solutions and half-edge pairing)

Marek's engine is **STS, the Synthetic Tiling Searcher**. He named it against "analytic" methods:
analytic is top-down (start from a global symmetry, fit tilings to it), STS is **synthetic**, bottom-up,
assembling a tiling from its basic elements so the global symmetry emerges on its own from local rules.
![[archive/2026-07-14#^msg-1526677511772180500]] The repo's C++ port is `ctrnact-oracle`; "the engine"
in CLAUDE.md means STS.

## Partial solutions and free edges

STS works on **partial solutions**: candidate tilings where some edges are still "free," not yet paired
with another edge. Much of the pruning rests on the fact that some feature can disqualify a partial
solution outright, in which case the whole subtree below it is discarded immediately.
![[archive/2026-07-13#^msg-1526246446301712564]]

At each step the program picks **one** unpaired edge and expands it, creating daughter partial
solutions that remove that edge by pairing it:

1. with another unpaired edge,
2. with itself (if possible), or
3. with a new edge from a **new** vertex (if the max vertex count isn't reached yet).

![[archive/2026-07-13#^msg-1526246802058248292]]

The expansion of a given partial solution happens **once**. Any unpaired edges not chosen stay in all
daughters and get fixed further down; to reach a complete solution, *all* unpaired edges must
eventually be paired. ![[archive/2026-07-13#^msg-1526247258058920049]] The engine also adds both
chiralities when it adds a chiral vertex. ![[archive/2026-07-14#^msg-1526671684487348294]]

## The edge-selector heuristic (the open optimization)

Which unpaired edge to pick is, in Marek's view, the key to STS's speed. The goal is to pick the
**worst** edge:

- If an edge is impossible to pair, that fact persists down the whole subtree, so identifying it lets
  you discard the partial solution now. ![[archive/2026-07-13#^msg-1526247607901491343]]
- If an edge has only a few possible pairings, you add only a few daughters.

You could generate daughters for *every* unpaired edge and keep the fewest, but that trades tree size
for per-node time. The sweet spot is a cheap heuristic that still picks a sufficiently bad edge, and it
may need crafting per search: for the `(3,5,6,18)/(3,6,6,9)` solver he deliberately biased the selector
toward **pentagon** edges because pentagons were the hardest tiles.
![[archive/2026-07-13#^msg-1526248869149540453]] This is a concrete thing I could experiment on (run the
same search with different selectors, time them). Tracked in [[roadmap]] / [[open-questions]].

He says the early-rejection idea itself came as "a sudden flash of insight" he can't fully reconstruct.
![[archive/2026-07-14#^msg-1526679072216715327]]

## The closure test

A vertex is valid when its polygons' interior angles close: they sum to 2π, or a divisor of it (a
divisor-of-360° condition). This is the local gate, and in the [[conway-symbol]] weaving it is the
requirement that a corner sequence closes. **Apeirogons are exempt**: any closing of an apeirogon is
valid, so their pruning is much gentler, which is why they're kept in a separate `apeirogon_types` list
(see [[main-cpp-workflow]]) and used as a wildcard for "arbitrary polygon."
![[archive/2026-07-14#^msg-1526700829816656033]]

## Symmetry is required, not optional

The F/A/R/S vertex symbols ([[vertex-configuration]]) aren't a speedup; without them the search is
wrong. His proof-by-example: rows of 1×7 heptominoes cut into domino/tromino/domino. The tromino has
rotational symmetry, the dominoes don't, and its two narrow edges connect to the same domino edge;
building a Conway symbol without symmetry forces you to split the domino tile into two orbits, which
corrupts the count. ![[archive/2026-07-14#^msg-1526697218436763689]] He started STS with only `F`
(asymmetrical) vertices and found the symmetries were necessary. ![[archive/2026-07-14#^msg-1526694055331893369]]

Speed is only loosely tied to alphabet size: some single-solution systems (e.g. `3.3.6.9`, the
`3369.png` example) prune so fast that time barely grows with k even though nothing new is ever found,
like a more complex `4.8.8`. ![[archive/2026-07-14#^msg-1526695803580579953]]

## A Euclidean-only idea: prune by wallpaper group

Not implemented, but he floated it: in the Euclidean case the solver could exploit the finite list of
wallpaper groups and even sort solutions into them. A 6-fold centre (a `3^6` vertex with 6-fold
symmetry, or a hexagon with a single edge in its cycle, or a dodecagon with two) rules out ever
acquiring a 4-fold centre, since no wallpaper group has both; 12-fold rotation can't occur in a
periodic Euclidean tiling at all. Reflection lines are similarly detectable.
![[archive/2026-07-13#^msg-1526251267540652213]]

## Output

Raw solutions **with duplicates**, handed to the dedup/pruner ([[canonical-form]]). The reference
originals are `reference/euclidean_solver_mega.py` (Python) and `eu_solver.cpp` (the C++ port; `MAXNUM`
parametrised, was hardcoded to 14, the "čtrnáct"). See [[main-cpp-workflow]] for how a search is set up.

## Related

[[conway-symbol]] · [[canonical-form]] · [[edge-length-solver]] · [[main-cpp-workflow]] · [[pipeline]]
