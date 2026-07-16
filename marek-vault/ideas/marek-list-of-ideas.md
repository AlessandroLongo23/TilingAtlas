---
type: reference
tags: [ideas, sts]
status: from-file
sources: ["marek-vault/tilings_exploration.txt (Marek, sent 2026-07-16)"]
---

# Marek's "list of ideas" (annotated)

He sent `tilings_exploration.txt` on 2026-07-16: his own written map of STS and where it could go.
The raw file sits at the vault root ([[tilings_exploration.txt]], local only). This note is the
organized version with links into the rest of the vault. Part 1 is the algorithm and its extensions;
part 2 is the classification, which lives in [[classification]] and [[hybrid-identities]].

## 1 — The STS algorithm

STS outputs abstract, geometry-free results; a **frontend** interprets them into visual display. Data
flows one direction only, STS → frontend, never back. (This is the architecture contract for the
Tiling Atlas integration: the renderer is a frontend, see [[roadmap]].)

## The seven extensions

### 1a. Abstract search
Search whole *classes* instead of individual tilings by dropping the requirements on polygons.
Automated version: input a symbol like `(a^4,b)`, get a showcase of its 14 classes with sliders to
move `a` and `b` through valid values. (The apeirogon-wildcard trick in [[conway-symbol]] is the
manual version of this.)

### 1b. Tile-first search
By vertex/face duality, STS can use either vertices or tiles as the basic unit. Tile-first finds
**k-isohedral** tilings, mostly with complicated shapes (polyforms). Already exists: the tile-first
implementation predates the current one and produced the polyomino/polyiamond results
([[main-cpp-workflow]]).

### 1c. Isotoxal search
Small modification: since **every gluing adds one edge type**, you get k-isotoxal search (either
vertex-first or tile-first) by removing the limit on when a new vertex/tile can be added and instead
capping the **depth of the search tree**.

### 1d. Nonconvex tilings
Theoretically possible but needs global topology care: a nonconvex tiling covers the surface multiple
times, and the number of coverings must stay finite or the tiling is dense and unrenderable.
Display idea: spherical nonconvex tilings are nonconvex polyhedra; Euclidean/hyperbolic ones can be
shown in 3D hyperbolic space as infinite polyhedra inscribed in a horosphere or pseudosphere, avoiding
the 2D "mess of lines." (Chat corollary: `{5/2,5}` works, Euclidean `{5/2,10}` is a mess; planar
star *polygons* in my sense are fine, see archive 2026-07-15 ~14:55.)

### 1e. 3D tilings (and further)
Basic unit: vertex or cell. Tiles/vertices are no longer simple cycles, so representation is the hard
part, and automatic symmetry generation gets harder. Gluing works on **flags**: a 2D gluing joins two
half-edge pairs; in 3D each n-gonal face has 2n flags and gluing two flags uniquely determines all
other gluings of the glued faces. (A HyperRogue-server regular thinks flag orbits are the right base
for >2D, see [[contacts]].)
**His proposed first test: classify all isohedral tilings of space by 1×1×2 cuboids. He thinks even
this is unknown.**

### 1f. Colorings and bold edges
Same shape, different colors = lowered symmetry. Uses: (1) in abstract search, colorings avoid
skipping the `a=b` cases of a parametric family; (2) teaching, e.g. two nonisomorphic `4.4.4.4B`
Euclidean tilings are plainer than the two nonisomorphic uniform `4.4.4.6`.
**Bold edges** are edges rendered differently and treated as **digons**: a square grid with one bold
edge per vertex is a `2.4.4.4.4` tiling, giving Euclidean access to `a.4.4.4.4` variants otherwise
confined to hyperbolic space.

### 1g. Edge types
Several non-commensurable edge lengths in one tiling; only same-type edges match. Necessary for
polyforms on Schwarz triangles. Existed in the **old** implementation (the 2020 `(2,3,7)` polyform
pictures), **lost** in the new one; restoring it is a roadmap item. ![[archive/2026-07-14#^msg-1526705103204122825]]

## 2 — Classification of hyperbolic tilings

The five levels + multibrid: see [[classification]]. Hybrid symbols, edge functions `e(...)`, mixing
rules, dimension of an identity grouping, the π half-sets, apeirogonal arithmetic: see
[[hybrid-identities]]. His framing worth quoting: existing hyperbolic displays are mostly regular or
Wythoffian ("analytical, top down"); STS is "synthetic, bottom up," and global symmetry emerges from
local rules. Heptiamond curiosity: on `{3,7}` triangles, almost all heptiamonds tile isohedrally, but
only **two** octiamonds do.

## Related

[[roadmap]] · [[classification]] · [[hybrid-identities]] · [[conway-symbol]] · [[main-cpp-workflow]]
