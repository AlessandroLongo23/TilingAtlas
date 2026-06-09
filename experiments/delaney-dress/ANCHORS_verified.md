# Independently verified anchors (by CC, before the experiment workflow)

These were computed and checked directly (see my_vertex_check.py, my_consistency_check.py,
ground_truth.py — all run and passing). They are the correctness anchors for the agent experiments.

## Ground-truth D-symbols (run-verified, ground_truth.py)
- {6,3},{4,4},{3,6}: size-1 symbols `<1:1,1,1:m01,m12>`, K=0.
- 4.8.8 truncated square: size 3, s0=(0)(1)(2), s1=(0)(1 2), s2=(0 1)(2), m01=(4,8,8), m12=(3,3,3);
  K=0 exact (1/12 − 1/24 − 1/24), tile_orbits=2, vertex_orbits=1, edge_orbits=2.
- hexagon-square `<2:1 2,1 2,2:4 6,4>`: K=−1/12 (HYPERBOLIC; exists as a symbol, not Euclidean).

## k=1 vertex-config census over the family {3,4,6,8,12}, degree 3..6, angle exactly 360°
- 11 angle-360 MULTISETS over {3,4,6,8,12}.
- 17 multisets over ALL polygons (3..42) — the extra 6 use forbidden polygons
  {3.7.42, 3.8.24, 3.9.18, 3.10.15, 4.5.20, 5.5.10} = the classical Sommerville ghosts. CONSISTENT with R3.
- 15 distinct dihedral NECKLACES (vertex species) over the family.
- 15 species = 11 realizable (the 11 uniform tilings, all present) + 4 in-family GHOSTS.
- The 4 in-family ghosts: 3.3.4.12, 3.3.6.6, 3.4.3.12, 3.4.4.6 (each a wrong cyclic arrangement of a
  realizable multiset, or a non-tiling combination).

## KEY REFINEMENT to R3's "B2 is the wall"
At k=1, ALL 4 in-family ghosts are caught by a COMBINATORIAL odd-cycle obstruction (the degree-3 tile is
always flanked by two distinct-degree neighbours -> proper 2-colouring of a 3-cycle is impossible). The 11
realizable species are NOT flagged. This obstruction is the tile-orbit/edge-closure consistency the D-symbol
axioms already encode. PREDICTION: the k=1 candidate count (axiom-valid + regular labels + per-component-flat,
deduped) = 11 exactly, so B2 is TRIVIAL at k=1. The realizability gap is a HIGHER-k phenomenon (global/strip
closure obstructions not reducible to local combinatorial conditions), not a k=1 one.

## Strategic frame (from research R1-R4)
- DD is genuinely novel for regular k-uniform (Delgado-Friedrichs 2009: "yet to be applied"), but NARROW:
  Tegula does complete DD by tile-orbits/complexity with NO regular gate; Galebach/Ctrnact are unproven
  searches. Honest framing = independent, complexity-bounded CROSS-METHOD completeness witness.
- B1 (delta<=12k) proven -> finite search. B2 (unit-regular realizability) is the load-bearing unproven lemma.
- Counts match A068599 only AFTER a realizability filter; chirality auto-merges (equivariant equivalence
  allows orientation-reversing homeomorphism); k-uniform = k {1,2}-components (exact).
- THE decisive build-vs-pivot question: does the DD candidate count grow slower than the torus lattice count
  (183->3103 = ~17x k=1->k=2)? Partially answerable by the scout; full answer needs the constrained
  orderly-generation prototype (the real C5).
