# D1 — slab/inventory transfer-graph engine: work order (2026-07-10, CC)

Node D1 of `docs/WEIGHT_PROOF_DAG.md`. The tool that four proof nodes consume
(D2 = 3.1(d), D4 = T2 band, D6/D7 small-k sweeps) and that the star-family
parametrization reuses.

## Object

A width-w tube = an edge-to-edge tiling of the cylinder ℝ²/wℤ by unit-edge regular
polygons ({3,4,6,12}), edge directions on the 30° grid (increment 1 = unrotated frame:
shortest period parallel to an edge direction; rotated frames for non-edge-parallel
periods are increment 2). Sweep representation: the FRONT (boundary word of the tiled
lower region) is a cyclic word of unit-edge directions with net displacement (w, 0);
a transition places one tile at the canonical lowest front vertex; vertically periodic
tubes = cycles in the state graph.

## Soundness ledger (assumptions the engine's proofs will lean on — each gets written)

- S1 (front band): every front stays within height ≤ max tile diameter (< 4) of its
  lowest vertex (each front edge bounds a placed tile that touched the sweep minimum
  when placed).
- S2 (front length cap L_max): front vertices are corners of the final tiling, pairwise
  ≥ 1 apart except vertex-coincidences on the seam (the width-2 hexagon touches itself
  at the seam point) ⇒ packing bounds the word length. L_max is a LOGGED knob: any
  transition producing a longer word is a loud completeness event, never silent.
- S3 (canonical fill completeness): any bi-infinite tube, swept with the deterministic
  lowest-vertex rule, produces an infinite transition path in the graph — the gap-side
  tile fan at the lowest vertex always contains a tile leaning on the outgoing edge.
- S4 (geometry predicates): exact arithmetic only — coordinates in (ℤ + ℤ√3)/2, sign
  comparisons via p² vs 3q², proper-crossing / collinear-overlap / T-vertex predicates
  exact; vertex-touch allowed (seam pinches), interior overlap forbidden.

## Increments

- **1a (this session): reachable closure.** Engine core + closure from the flat front
  at width 2 + SCC analysis. Deliverable: the recurrent tile inventory and slab cycles
  on the REACHABLE component. Regression gate: the T/S/H slab world is reproduced.
  This does NOT yet prove 3.1(d) (unreachable cycles not excluded).
- **1b: completeness.** All valid front words ≤ L_max (exhaustive generation with exact
  pruning, C++ if Python crawls), or the cut-word Diophantine route for D2 specifically.
  After 1b the width-2 recurrent inventory IS the 3.1(d) theorem (mod S1–S4 write-ups).
- **1c: extraction.** Max-ratio cycles (weight-per-height / vertices-per-height) for the
  IP economics; per-k bounded-height tube sweeps (D6/D7 consumers).
- **2: rotated frames** (norm-binned, for widths whose shortest period is not
  edge-parallel; coordinates in ℚ(√2,√3) 4-tuples).

## Acceptance (1a)

Closure terminates; recurrent inventory at width 2 contains the upright triangle,
upright square, and seam-hexagon classes; S/T/H slab cycles found; run log in
`experiments/results/` (synchronous, human-readable, per CLAUDE.md).
