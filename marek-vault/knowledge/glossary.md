---
type: glossary
tags: [glossary]
---

# Glossary

Term → one-line definition → deep note. Now grounded in the chat (2026-07-13..15) and his list of
ideas; the pre-chat seeds that survived are kept.

## The engine and its names

- **STS (Synthetic Tiling Searcher)** — Marek's name for his engine; "synthetic" = bottom-up assembly
  from local rules, opposed to "analytic" top-down methods. See [[dual-search]].
- **čtrnáct** — Czech for *fourteen* (his surname); the repo calls the ported engine `ctrnact-oracle`.
- **Frontend** — anything that interprets STS's abstract output visually (HyperRogue, the Atlas
  renderer). Data flows one way, STS → frontend. See [[marek-list-of-ideas]].
- **Partial solution** — a candidate tiling with some edges still free (unpaired); the unit the search
  tree is built from. See [[dual-search]].
- **Free / unpaired edge** — an edge not yet glued; all must be fixed for a complete solution.
- **Edge selector** — the heuristic that picks which unpaired edge to expand next; picking the
  "worst" edge is the open speed lever. See [[dual-search]].
- **Weaving** — deriving all vertices implied by a [[conway-symbol]] by chaining corner strings until
  they close.
- **False closure** — a polygon cycle closing prematurely/invalidly during search; apeirogons are
  immune (any closure of an apeirogon is valid). See [[dual-search]].
- **Canonization** — the canonical form STS still lacks: a deterministic representative per tiling
  (dedup exists, Eryk's; canonical form doesn't). See [[canonical-form]].

## Notation

- **Conway symbol** — his gluing notation, extended from the doily notation of *The Symmetries of
  Things*: `(i j)` direct join, `[i j]` mirror join, `(i)`/`[i]` self-joins; primes/`@n` index tiles.
  See [[conway-symbol]].
- **Corner** — the join between two consecutive edges of a tile; written `0/1(A)-` in weaving
  (edge/edge, polygon, separator dash; no final dash = closed). See [[half-edges-and-corners]].
- **Half-edge** — vertex-to-edge-midpoint segment; `*` prefix = mirror image. See
  [[half-edges-and-corners]].
- **Vertex configuration** — cyclic order of polygons at a vertex (`3.6.3.6`); **vertex combination**
  — the multiset only. Same combination ⇒ same edge length; configurations can mix. See
  [[vertex-configuration]], [[hyperbolic-tilings]].
- **Vertex symbol (F/A/R/S)** — configuration + its global symmetry (F asymmetric, A axial, R
  rotational, S both); mandatory for correctness, not a speedup. See [[vertex-configuration]],
  [[dual-search]].
- **Hybrid symbol** — letter = edge multiplier (A=1×, B=2×, … G highest with known tilings), number =
  polygon sides: `B5` = pentagon at twice the base edge; `Aoo` = horocyclic apeirogon. See
  [[hybrid-identities]].
- **TES file** — HyperRogue's render-ready tiling format (`h2.`, `distunit`, `regangle`, `unittile`,
  `slider`, `conway`). See [[tes-format]].
- **`*n` / `|n` (in unittile)** — n-fold rotational axis / axial symmetry with edge n mirroring
  edge 0. See [[tes-format]].
- **arcmedge** — TES function computing the closing edge length for a polygon group. See
  [[edge-length-solver]].

## Theory

- **k-uniform** — vertices fall into exactly k orbits. See [[k-uniform-tilings]]. In hyperbolic space
  a single configuration does not imply uniform (3.5.5.5 is ≥ 3-uniform). See [[hyperbolic-tilings]].
- **The six levels** — regular · Archimedean · pseudo-Archimedean · combination · hybrid · multibrid.
  See [[classification]].
- **Edge function `e(...)`** — the base edge at which a polygon tuple closes around a vertex; equal
  edge functions define a hybrid identity. See [[hybrid-identities]].
- **Mixing rule** — an angle-sum equality that rewrites one vertex into another, e.g. `(A3,A4)=(Aoo)`;
  the **dimension** of an identity grouping = rules needed to generate it. See [[hybrid-identities]].
- **Apeirogonal arithmetic** — relations among apeirogon systems, e.g.
  `([x]oo,[x+2]oo^3)=([x+1]oo^3,[x+3]oo)`; mostly never resolves into tilings. See
  [[hybrid-identities]].
- **Corona argument** — proving impossibility by showing a polygon can't be surrounded. Killed
  `3.3.5.oo`. See [[hyperbolic-tilings]].
- **Morph** — a tiling with a continuous parameter (TES slider). See [[hyperbolic-tilings]].
- **Edge type** — tag restricting matches to same-length edges; enables non-commensurable lengths;
  present in the old STS, lost in the rewrite. See [[marek-list-of-ideas]] (1g).
- **Bold edge** — an edge rendered distinct and treated as a digon (`2.4.4.4.4`). See
  [[marek-list-of-ideas]] (1f).
- **Star polygon** — for Marek: self-intersecting polygon (Kepler-Poinsot sense); in my thesis: the
  non-convex simple 2n-gon. Both usages appear in the chat; disambiguate in writing.
- **ferkval** — his name for the vertex-signature value in the alphabet; named after the Czech name of
  Snorkmaiden (Moomins). No deeper meaning.

## Repo-port specifics (pre-chat seeds, still true)

- **Palette / alphabet** — tile set as data: palette JSON → `gen_alphabet.py` → solver alphabet. See
  [[palette-json-schema]].
- **Develop** — exact geometric reconstruction in ℤ[ζ₁₂], emitting `{T1,T2,Seed}` cells. See
  [[pipeline]].
- **ℤ[ζ₁₂] / 12 directions** — enough for {3,4,6,12}; octagon needs ℤ[ζ₂₄], solved special case
  (`t1002`, the 4.8.8). See [[k-uniform-tilings]].
- **A068599** — OEIS sequence of k-uniform counts; higher terms come **from STS itself**, so they
  can't serve as an independent check. See [[solution-file-format]].
