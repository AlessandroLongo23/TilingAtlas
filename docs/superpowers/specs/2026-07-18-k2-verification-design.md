# k=2 cluster verification — making the invariants defensible (2026-07-18)

Follow-on to `2026-07-17-k2-moduli-complex-design.md`. That slice built the 2-cell framework and computed
the cluster homology (genuine `χ=7 b=[12,11,6]`, full `χ=−11 b=[3,27,13]`) but flagged the cluster
numbers as not thesis-defensible: the edge identity (single-midpoint fingerprint) could false-merge or
false-split, the self-folding zero-∂₂ faces (k2-82, k2-83) are ambiguous (pinched fold vs genuine torus),
and the Betti numbers are bare counts with no geometric interpretation. This slice closes that gap for
the full 24-family two-parameter cluster.

## What "defensible" reduces to

If every cell identity is sound — no false merge or split of nodes, edges, or faces — then the chain
complex homology already computed IS the true homology; no per-generator hand-verification is needed. So
this slice is two things, not a vague "check everything":

1. Harden cell identity to demonstrable soundness (multi-sample edge fingerprint; measured separation
   margins for nodes and edges).
2. Extract each Betti generator as an explicit, inspectable geometric object, so the thesis can name what
   each b₁ loop and b₂ surface actually is (and, for b₂, classify the surface).

## Measured facts (this slice rests on these, verified 2026-07-18)

- **Cross-family gluing is pervasive**: 51 of 55 shared boundary endpoint-pairs join faces from
  DIFFERENT families. The genuine `b₂=6` depends on these gluings, so edge-identity soundness is
  load-bearing, not a corner case.
- **Shared arcs are shared because two families share the same underlying tile-slider** (e.g. k2-25↔k2-26,
  and k2-82/83 gluing with k2-64/65). They therefore parametrise the shared arc identically, so the
  false-split/reparametrisation risk is expected NOT to occur here. This slice VERIFIES that (if two
  edges' multi-sample sequences match at all, they match sample-for-sample) rather than assuming it.
- **Self-folding (zero-∂₂) faces are k2-82 and k2-83** (family 4α, tiles cx4-60.120 + cx4-75.105 — NOT
  identical tiles, so there is no α₁=α₂ diagonal to subdivide along; the fold is an opposite-side
  coincidence). Two of the thirteen `full` b₂ generators are these.

## Component 1 — multi-sample edge fingerprint

Replace the single-midpoint edge key (`twoCellExtractor` / `complexAssembler` mid canonical key) with a
K-sample sequence (K≈5) of `nodeCanonicalKey` values taken at interior parameters evenly spaced along the
arc, direction-normalised (an arc and its reverse are one 1-cell: take the lexicographically smaller of
the sequence and its reverse). Two boundary arcs are the same 1-cell iff their endpoint node-keys match
AND their K-sample sequences are equal.

- Kills **false-merge**: two genuinely different arcs agreeing at K interior points is astronomically
  unlikely given the node separation margin (each sample is a full tiling canonical key, not a scalar).
- Guards **false-split**: because shared arcs share the tile-slider (measured fact above), matching
  sequences align sample-for-sample; the slice asserts this alignment holds wherever two edges merge.

## Component 2 — node/edge margin report

Certify soundness empirically on the actual cluster:

- Node margin: the minimum geometric distance between distinct `nodeCanonicalKey` values (compare the
  pre-quantisation invariant vectors, not the strings), over all node pairs.
- Edge margin: the minimum separation between distinct edge fingerprints.

A margin ≫ ε (ε≈1e-6, the quantisation grain) is the defensibility evidence; a near-collision (margin
within a few ε) is flagged by node/edge id for manual inspection. This is measured evidence, not a proof,
and the spec/report says so plainly.

## Component 3 — homology generator extraction

Compute explicit bases, not just ranks:

- **H₂ basis** = a basis of `ker ∂₂` (there is no ∂₃), each generator a signed set of face indices.
- **H₁ basis** = a basis of `ker ∂₁ / im ∂₂`, each generator a signed set of edge indices (a loop),
  chosen as representatives not in the image of ∂₂.

Implemented over ℚ via the same modular-rank machinery extended to return null-space basis vectors
(rational kernel via Gaussian elimination, then lift to integer vectors). Output: for each Betti
generator, the concrete cells (faces for H₂, edges for H₁) and, for H₁, the node loop it traces.

## Component 4 — per-H₂-generator surface classification

For each H₂ generator (a set of faces forming a 2-cycle), classify the closed surface from the
sub-2-complex of those faces plus their incident edges and nodes:

- χ' = V' − E' + F' of the sub-complex.
- **Every ℚ-b₂ generator is orientable.** A ℚ 2-cycle is an integer 2-cycle up to scale, and ℝP²/Klein
  have H₂(ℚ)=0 — they surface only as ℤ/2 torsion in H₁ (Smith normal form, deferred). So the operative
  distinction is by χ': **sphere (χ'=2), torus (χ'=0), higher-genus orientable (χ'<0)**.
- A single-face 2-cycle classifying as a **sphere (χ'=2)** is the pinched-fold signature — the square's
  four boundary edges cancel in pairs, collapsing to a 2-sphere, a likely modeling artifact. A **torus
  (χ'=0)** from opposite-side identification is a genuine moduli feature. This distinguishes the k2-82/83
  pinch from a real torus and labels all six genuine b₂ generators.

The classifier is a pure function of (χ', orientability). Orientability (a 2-cycle over ℤ vs only ℤ/2)
is computed for completeness and torsion-awareness; non-orientable inputs do not arise among the ℚ-b₂
generators.

## Architecture / files

New in `scripts/moduli-graph/`:

- `edgeFingerprint.ts` — K-sample direction-normalised arc fingerprint from an `(a)=>FloatTiling`
  evaluator + range; and the pairwise fingerprint separation. Depends on `nodeCanonicalKey`.
- `homologyGenerators.ts` — rational kernel bases of ∂₁ and ∂₂ (extends `chainComplex`'s modular rank
  to return null-space vectors); returns explicit H₁/H₂ generators as cell-index sets. No external deps.
- `surfaceClassify.ts` — from a set of faces (+ the complex's edges/nodes) compute χ', orientability, and
  the surface name. Depends on `chainComplex` types.
- `verifyComplex.ts` — orchestrates: assemble with multi-sample edges, compute margins, extract
  generators, classify each H₂ generator; emit a `VerificationReport`.
- CLI `buildVerifiedComplex.ts` — run over the 24-family cluster, write
  `experiments/results/moduli-complex-k2-verified.json`, print the certified breakdown.

Modify:

- `twoCellExtractor.ts` / `complexAssembler.ts` — edge identity switches from single-mid key to the
  multi-sample fingerprint (Component 1). Existing tests updated; the `∂₁∂₂=0` guard and `degenerateFaces`
  reporting stay.
- extend `types.ts` — `VerificationReport` (`{ nodeMargin, edgeMargin, nearCollisions,
  h2: {generator, faces, surface}[], h1: {generator, edges, nodeLoop}[] }`).

## Testing

- `surface-classify.test.ts` — minimal sub-complexes with known invariants: a single face whose four
  boundary edges identify in canceling pairs (χ'=2) → sphere; two faces glued on all four sides (χ'=0,
  orientable) → torus; a face with distinct-corner boundary (has boundary, not a cycle) → "not a closed
  surface". A constructed non-orientable case (ℝP², χ'=1) → classified ℝP² with the note that it cannot
  arise as a ℚ-b₂ generator.
- `edge-fingerprint.test.ts` — a fingerprint equals its own reverse's normalised form; two arcs sharing
  endpoints and a single congruent midpoint but differing elsewhere get DIFFERENT fingerprints (the
  false-merge that single-sample missed); a shared-tile-slider arc from two families gets identical
  fingerprints (real gluing preserved).
- `homology-generators.test.ts` — on a hand-built two-face torus (two squares glued on all four sides),
  H₂ basis has one generator = both faces, classified as torus; on two disjoint squares, H₀ basis has two
  generators.
- **Regression** — the cluster CLI still reports `∂₁∂₂=0` clean, and the genuine/full betti either match
  the prior `[12,11,6]`/`[3,27,13]` (confirming the multi-sample edges did not change the gluing) or the
  difference is explained by a caught false-merge (logged, not silent).

## Risks and honesty

- **Margins are measured, not proven.** The soundness argument is "distinct cells differ by ≫ ε on this
  cluster," evidenced by the margin report. A separation proof over ℤ[ζ₂₄] would be stronger and is out of
  scope; the report makes the evidence explicit and flags any thin margin.
- **A pinched-fold face is classified, not repaired.** If Component 4 finds a genuine pinch (k2-82/83),
  the honest fix is subdividing the fold into proper cells (exact-stratification territory). This slice
  reports the pinch and its effect on b₂; repairing the CW model is the next slice if the pinch proves to
  be a real modeling artifact rather than a genuine surface.
- **Generator bases are non-unique.** H₁/H₂ representatives are a choice of basis; the report says so and
  presents one explicit basis, which suffices to name and classify each independent generator.

## Settled decisions (AL, 2026-07-18)

- Full cluster verification (not per-face only, not stop-and-document): all four components, over the full
  24-family two-parameter cluster.
- Soundness is by measured separation margin + multi-sample fingerprints, not an exact-arithmetic proof
  (out of scope, flagged).
- Self-folding faces are CLASSIFIED (surface word) this slice; repairing the CW model by subdividing a
  genuine pinch is deferred to a further slice.
