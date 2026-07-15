---
type: glossary
tags: [glossary]
---

# Glossary

Quick term → one-line definition → link to the deep note. Seeded from what this repo already
documents about the engine; entries marked *(confirm)* are my current understanding to check against
what Marek actually says in the chat.

- **k-uniform tiling** — a tiling whose vertices fall into exactly *k* orbits (transitivity classes)
  under its symmetry group. See [[k-uniform-tilings]].
- **Vertex configuration** — the cyclic list of polygon sizes meeting at a vertex, e.g. `3.3.4.3.4`;
  interior angles sum to 360°. See [[vertex-configuration]].
- **Half-edge labels / corners** — the labels the engine attaches to vertex-figure half-edges and
  corners when it glues them. CLAUDE.md calls these "Conway symbols" as shorthand; Marek's own term is
  half-edges/corners. See [[half-edges-and-corners]].
- **Dual (of a tiling)** — faces ↔ vertices swap. The engine searches *duals* because gluing
  vertex-figures is combinatorially cleaner than building the tiling directly. See [[dual-search]].
- **Half-edge gluing** — the core search move: attach vertex-figure half-edges to grow a candidate
  dual, checking each vertex closes to a divisor of 360°. See [[dual-search]].
- **Divisor-of-360° closure** — the validity test at each vertex during the search. See [[dual-search]].
- **Canonical form (WL / DFA)** — the fingerprint used to detect and prune isomorphic duplicate
  tilings (Weisfeiler-Leman / DFA minimisation). See [[canonical-form]].
- **Palette / alphabet** — the tile set, supplied as data. A palette JSON →
  `alphabets/gen_alphabet.py` → the alphabet the C++ solver loads. See [[palette-json-schema]].
- **Develop** — the final stage: exact geometric reconstruction in ℤ[ζ₁₂], emitting `{T1,T2,Seed}`
  cells. See [[pipeline]].
- **{T1, T2, Seed} cell** — the output cell format: `T1`,`T2` are the period-lattice basis vectors,
  `Seed` the fundamental-domain faces. See [[pipeline]].
- **ℤ[ζ₁₂] / 12 directions** — the exact arithmetic the develop stage runs in; enough for polygons
  {3,4,6,12}. The octagon needs ℤ[ζ₂₄] and is a solved special case. See [[k-uniform-tilings]].
- **čtrnáct** — Czech for *fourteen*; Marek's original solver was hardcoded to k=14, hence the name.
- **A068599** — the OEIS sequence counting k-uniform tilings by regular polygons; the regular palette
  reproduces it. See [[k-uniform-tilings]].
- **4.8.8 / octagon tiling (t1002)** — the unique octagon-bearing tiling; absent under 12 directions,
  re-added by hand. See [[k-uniform-tilings]].
