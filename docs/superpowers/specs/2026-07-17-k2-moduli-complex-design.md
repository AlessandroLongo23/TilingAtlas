# k=2 moduli complex — the 2-cell extension (2026-07-17)

Extends the k=1 deformation graph (`2026-07-17-tiling-deformation-graph-design.md`) from a
1-complex to a genuine 2-complex. The k=1 spec deferred
"multi-parameter families (`flexdim ≥ 2`, the 2-cells and their boundary cycles)"; this is that
follow-on. The k=1 slice modelled single-parameter families as 1-cells and read off H₁ as a graph
cyclomatic number. At k=2 the two-parameter isotoxal families are honest 2-cells (faces), the object
stops being a graph, and H₁ = ker∂₁/im∂₂, H₂, and the Euler characteristic χ become the deliverable.

## The material (measured, 2026-07-17)

`public/reference-atlas-isotoxal.json`, filtered `k===2 && source==='isotoxal'`, splits by parameter
count:

- **74 single-parameter families** (1-cells). These already run through the existing assembler with
  no code change: 22 nodes, 129 edges, H₁=113 in a throwaway probe. Labels are meaningful — the
  1-uniform crossroads still match the k=1 catalogue (4⁴ at degree 72 is the hub), and 2-uniform
  nodes come out as clean two-orbit vertex signatures (`3.3.4.3.4;3.4.6.4`, …).
- **24 two-parameter families** (2-cells). `assembleGraph` currently skips them (`params.length !== 1`,
  graphAssembler.ts:31), so they are silently absent from any k=2 graph until this work. Their `family`
  fields (`4α`×12, `4.4α`×4, `3.3.4α`×4, `4.4.4α`×2, `3.3.3.3.4α`×2) and record notes state the
  structure plainly: **each is a k=2 tiling with two independent isotoxal tiles, each on its own
  α-slider.** Domain is the product (α₁, α₂) ∈ (0,180)².

## What a 2-cell is

A two-parameter family maps its domain to a tiling. Because the two tiles flex independently, the
domain is a **square** and the family is a **topological disk (2-cell)**:

- **Interior**: generic (α₁, α₂), a 2-uniform tiling of `flexdim = 2`.
- **Four boundary edges**: fix one tile at a limit, slide the other. `α₁→0⁺`, `α₁→180⁻`, `α₂→0⁺`,
  `α₂→180⁻` are each a one-parameter family (a 1-cell) in the remaining parameter.
- **Four corner nodes**: both tiles at a limit simultaneously; a 0-cell.

The face attaches to the 1-skeleton along its boundary 4-cycle. Two faces glue iff they share a
boundary edge; that shared-edge test is what makes H₂ possibly non-zero (faces closing into a surface),
the phenomenon k=1 could not exhibit.

## Cell taxonomy (extends k=1)

- **0-cells** — special states with a distinguished identity: `uniform` (matches a known uniform
  tiling), `uncatalogued` (e.g. the excluded octagon 4.8.8), `flattened` (non-edge-to-edge limit,
  a tile flattened to 180° into a larger regular polygon), `degenerate` ⊥ (zero-area collapse). Same
  four kinds as k=1, now including 2-uniform tilings.
- **1-cells** — one-parameter families: the 74 native single-param k=2 families plus the boundary
  slices induced by two-param families.
- **2-cells** — the 24 two-param families, each a square as above.

## Homology from a real chain complex

Build the boundary operators with orientation (ℤ coefficients):

- `∂₁(edge) = head − tail` — a V×E matrix.
- `∂₂(face) = Σ ± boundary edges` — the oriented 4-cycle, an E×F matrix.

Compute:

- **χ = V − E + F** exactly (integers).
- **Rational Betti numbers** via fraction-free rank of the two matrices: `r₁ = rank ∂₁`, `r₂ = rank ∂₂`,
  then `b₀ = V − r₁`, `b₁ = (E − r₁) − r₂`, `b₂ = F − r₂`.
- **Boundary validation (the real gate)**: `χ == b₀ − b₁ + b₂` is an algebraic IDENTITY — it holds for
  any V,E,F,r₁,r₂, so it is not a check (an early draft wrongly treated it as one). The condition the
  Betti formula actually needs is `∂₁∘∂₂ = 0`: every face boundary is a closed cycle. The engine
  validates this up front (net node incidence zero per face) and throws on a non-cycle face — that is the
  guardrail against a mis-stitched boundary, plus edge-index and non-negative-Betti guards.

`b₀` = connected components, `b₁` = deformation loops not filled by a face, `b₂` = closed surfaces
(a torus in moduli space ⇒ `b₂ ≥ 1`). Torsion via Smith normal form over ℤ is a later refinement; χ
and ℚ-Betti are the defensible core and χ is coefficient-independent.

## Node identity: direct-similarity geometric canonical form

The k=1 graph merged nodes by float vertex-signature + `flattenKey`. Both are chirality-blind and can
collide (two distinct tilings, one signature). With more nodes and 2-uniform vertex types at k=2, that
gap threatens H₁/H₂. An intrinsic exact ℤ[ζ₂₄] key would close it — but the shipped atlas carries only
floats (paramCell coefficients and `renderCell` are `ℤ[ζ₂₄]`-evaluated-to-float; no `T1/T2/Seed`), and
`nKeyOfSymbolDirect` needs exact integer ζ vectors. Recovering exact keys would require float→exact
recognition (a bounded unit-ζ-walk snap), a subsystem out of scope here (AL decision, 2026-07-17). So
identity is a **canonical geometric key**, not an exact algebraic one:

- **The key** is a hashable fingerprint of the developed tiling, canonical under direct similarity
  (rotation, translation, uniform scale; reflection tracked, not quotiented). Generalizes `flattenKey`
  to *all* nodes: canonical alignment to a deterministic frame (scale by the min edge, orient by a
  chosen edge), then the ε-quantized sorted vertex-orbit coordinates plus Gauss-reduced lattice
  invariants. Chirality is recorded (compute the key for both orientations; `handed` iff they differ),
  fixing `flattenKey`'s `|dot|` blindness.
- **Why this is defensible for the invariants.** Homology needs only node *distinctness*, which is an
  equivalence via equal keys (transitive by construction — a hash, not a pairwise tolerance test). The
  separation margin carries the argument: two non-identical uniform/flatten tilings of unit regular
  polygons differ by O(1) in canonical coordinates, ε ≈ 1e-6, so no false merge; canonical alignment
  removes similarity, so no false split. This closes both the signature-collision and chirality gaps
  the k=1 keys had.
- **Catalogue is off the critical path for the numbers, on it only for names.** Distinctness (hence
  b₀/b₁/b₂) needs no catalogue. Where a node's geometric key matches an entry of the existing exact k=1
  catalogue, attach that entry's `nKeyOfSymbolDirect` value as an authoritative cross-check and a
  human-readable label. A named k≤2 uniform catalogue would extend the labels to 2-uniform nodes; it is
  a labeling refinement (later spec), not a correctness dependency.

## Product-square assumption is verified, not assumed

The record note claims independent sliders ⇒ valid domain is the full (0,180)² square. Edge-length
compatibility between the two tiles could couple them and carve the valid region smaller. So per
family, evaluate a grid over the domain and confirm it tiles validly throughout. "Valid" means
edge-to-edge closure (every vertex figure sums to 360°), NOT regularity: an isotoxal family tiles by
non-regular tiles at every interior point (regular only at the α=90 point), so a regularity test would
false-fail a perfectly valid interior. A family that fails edge-to-edge closure in some sub-region is
flagged as a non-product exception and escalated toward exact stratification (approach C), not forced
into a square.

## Edge gluing identity

Two boundary slices from different faces are the same 1-cell iff they trace the same one-parameter
family of tilings, not merely share endpoints (distinct families can share endpoints — the k=1 graph
kept those as parallel edges). Key an edge by `(unordered endpoint node-key pair, tiling identity at
mid-α)`. Glue when equal; keep distinct otherwise. The mid-α identity uses the same exact/flagged
machinery as nodes where the midpoint is cyclotomic, signature otherwise.

## Scope of this spec

**In.** The 2-cell framework end to end, validated on the `4α` cluster:

- `nodeCanonicalKey` — direct-similarity geometric canonical key (chirality tracked), with optional
  k=1-catalogue cross-check.
- `twoCellExtractor` — from a two-param paramCell, produce the four boundary slices (as 1-param
  families) and four corner states, plus the product-square grid check.
- `chainComplex` — assemble ∂₁, ∂₂; compute integer χ and rational Betti via fraction-free rank; validate
  `∂₁∘∂₂ = 0` (throw on a non-cycle face).
- Validate on the 12 `4α` families (two independent squares — the simplest case, hand-checkable) and
  the 4 `4.4α` families. Deliver correct H₀/H₁/H₂/χ for that sub-complex.

**Deferred (own later specs).** Scaling to all 24 two-param + 74 one-param families into one k≤2
complex and cross-checking; the illustrative figure with rendered faces; torsion (Smith normal form);
a named k≤2 uniform catalogue for labels; k3/k4 and non-Euclidean.

## File structure

New in `scripts/moduli-graph/`:

- `nodeCanonicalKey.ts` — direct-similarity geometric canonical key (generalizes `flattenKey`),
  chirality tracked; optional cross-check against the exact k=1 catalogue via geometric match. Depends
  on `geometry`, `tilingSignature`, `catalogueKeys` (cross-check only).
- `twoCellExtractor.ts` — boundary slices, corners, product-square grid check. Depends on `paramCell`,
  `geometry`, `nodeExtractor`.
- `chainComplex.ts` — ∂₁/∂₂ assembly, fraction-free rank, χ + Betti + `∂₁∂₂=0` validation. Self-contained
  integer linear algebra, no external deps.
- `complexAssembler.ts` — assemble 0/1/2-cells with canonical-key identity + edge gluing; emit
  `ModuliComplex`.
- extend `types.ts` — `Cell2`, `ModuliComplex` (`{ nodes, edges, faces, chi, betti:[b0,b1,b2] }`).
- CLI `buildModuliComplex.ts`.

## Testing

- `chain-complex.test.ts` — hand-checked homology on synthetic complexes with EMBEDDED (distinct-corner)
  boundaries: one square → `b=[1,0,0]`, `χ=1`; two squares sharing one edge → `b=[1,0,0]`, `χ=1`; a ring
  of four edges with no face (annulus) → `b₁=1`; n disjoint squares → `b₀=n`. Plus a malformed open-path
  face → `homology` throws (the ∂₁∂₂ guard).
- `node-canonical-key.test.ts` — rotation/translation/uniform-scale give the same key; a chiral pair is
  flagged `handed` with distinct oriented keys; two genuinely different tilings get different keys; a
  node whose geometric key matches the k=1 catalogue attaches the expected `nKeyOfSymbolDirect`
  cross-check.
- `two-cell.test.ts` — a `4α` two-param family extracts to four boundary slices + four corners; the
  product-square grid check passes on it; the assembled single-face complex validates (`∂₁∂₂=0`, no
  throw) with its betti LOGGED, not asserted — the 4α corners collapse to a shared ⊥, so a single face
  need not be a disk (its boundary attaching map is degenerate).
- **Regression** — feed the *existing* k=1 graph's nodes and edges (its float-signature identity,
  unchanged) into `chainComplex` with `F=0` (no faces) and reproduce the genuine-tiling `H₁ = 15`.
  This isolates and validates the new linear-algebra layer (∂₁ rank, Betti) against the old cyclomatic
  number `E − V + C`, holding node identity fixed. Swapping in the new geometric canonical-key identity
  is a *separate* test: it may legitimately split chirality-tracked nodes and change the count, so it
  asserts the key invariances (rotation/scale → same key, chiral split) rather than the literal `15`.

## Risks

- **Canonical-key bucketing near ε boundaries.** ε-quantizing coordinates can split two copies of one
  tiling when a coordinate straddles a grid line (the problem `flattenKey`'s centroid-spectrum dodged).
  Mitigate with canonical alignment before quantizing and robust invariants (sorted spectra,
  Gauss-reduced lattice) over raw rounded coordinates; the `4α` cluster (identical square copies) is the
  sharpest no-false-split test.
- **Edge gluing correctness.** Endpoint match alone over-glues; the mid-α geometric key guards it.
- **Non-product domains.** If the grid check fails for some family, that family needs exact
  stratification, out of this spec's scope; it is flagged, not silently squared.

## Settled decisions (AL, 2026-07-17)

- Approach A (combinatorial product complex), not B (sampled nerve) or C (exact stratification).
  Escalate individual families to C only when the product-square check fails.
- Deliverable is verified invariants (χ, ℚ-Betti, with a real `∂₁∂₂=0` boundary validation — NOT the
  χ=b₀−b₁+b₂ identity, which is vacuous); the figure illustrates and is a later spec. Torsion is deferred.
- This spec is scoped to the `4α`/`4.4α` cluster to validate the framework; all-24 scaling is a
  follow-on.
- Node identity is a direct-similarity geometric canonical key (chirality tracked, no silent merges),
  NOT an intrinsic exact ℤ[ζ₂₄] key — the shipped atlas is float-only and float→exact recognition is out
  of scope (AL, 2026-07-17). Exactness enters only as an optional catalogue-match cross-check.

## Implementation outcome and corrections (2026-07-17)

What the build actually settled, after probing real families. These SUPERSEDE the pre-implementation
text above where they conflict.

- **⊥ handling = Option A (genuine-tiling subcomplex), AL directive.** Homology is reported on the
  subcomplex induced by dropping ⊥, every edge incident to it, and every face touching such an edge —
  the headline — with the full (with-⊥) numbers kept alongside. This extends the k=1 with/without-⊥
  convention and removes the spurious 2-spheres that a ⊥-collapsed boundary would otherwise create.
- **Edge identity must include the midpoint tiling.** Keying a 1-cell by its endpoint pair alone
  collapsed a face's four distinct sides into one edge, making ∂₂(face)=0 (a false sphere). `twoCellExtractor`
  now emits the boundary as 1-cells each carrying the tiling MIDWAY along the side; edges are keyed by
  (endpoint pair + mid canonical key), which keeps the four sides distinct and glues a side shared by
  two faces (the source of genuine H₂).
- **Validation target is `3.3.3.3.4α`, not `4α`.** Scout of the 24 two-parameter families: only the
  twelve `4α` families are all-⊥ on their boundary (both rhombi collapse at every corner) — the worst
  possible target and the one the plan named. `4.4α`, `3.3.3.3.4α`, `4.4.4α` have four genuine uniform-
  tiling corners. A single `3.3.3.3.4α` face develops to a clean disk: genuine `b=[1,0,0]`, χ=1 — the
  hand-checkable validation that the 2-cell machinery is correct.
- **What is validated vs not.** VALIDATED: the homology engine (rank verified against a Bareiss oracle;
  ∂₁∂₂=0 guard), the node key (rotation/scale invariance + chirality split), a single face as a disk,
  and the k=1 `H₁=15` regression through the engine. NOT YET DEFENSIBLE: the multi-face cluster numbers
  (full 24 two-param: genuine `χ=7 b=[12,11,6]`, full `χ=−11 b=[3,27,13]`). Residual `b₁` can carry
  boundary node-coincidence (a single `4.4α` face already shows `b=[1,3,0]` though a family is a disk),
  and each `b₂` generator needs per-generator verification that the faces genuinely glue into a closed
  surface rather than a chain artifact. Making the cluster invariants thesis-defensible is the next
  slice: per-generator verification + deciding whether boundary node-coincidence is geometrically real
  or an over-merge of the canonical key.

### Final-review findings (open, feed the next slice)

Adversarial review of `complexAssembler`/`twoCellExtractor` (stitching, orientation signs, induced
subcomplex, determinism all verified correct). Three soundness gaps remain:

- **Self-folding faces (zero-∂₂) inflate `full` b₂ — now surfaced, not fixed.** A family whose (α₁,α₂)
  square has an internal symmetry (two identical tiles) folds onto itself, so ∂₂(face) ≡ 0. That passes
  the ∂₁∂₂=0 guard but reads as a 2-sphere; two of the thirteen `full` b₂ generators (families k2-82,
  k2-83) are these artifacts. Cannot auto-drop — a lone one-face torus also has ∂₂=0 — so `assembleComplex`
  now REPORTS them (`degenerateFaces`) and the CLI prints them. The genuine headline avoids them only
  because they also touch ⊥; a self-folding face NOT touching ⊥ would inject a spurious b₂ into the
  headline. The real fix is sampling each square's interior fold-crease as 1-cells (toward approach C).
- **Single-midpoint edge fingerprint is not injective.** Two arcs sharing endpoints and one congruent
  midpoint false-merge (spurious gluing → inflated b₂); a shared arc two families parametrise
  differently false-splits (a real surface-closing gluing silently fails → b₂ too low). No miscount
  reproduced on the 24 records, but the genuine `b₂=6` rests on this identity. Harden with multi-sample
  edge fingerprints or exact arc identity.
- **Self-loop edge sign is always +1 (latent).** A side whose two endpoint tilings are congruent is a
  self-loop; the orientation test then can't give −1. Zero self-loops in the current data, so latent —
  fix before any data that produces one.
