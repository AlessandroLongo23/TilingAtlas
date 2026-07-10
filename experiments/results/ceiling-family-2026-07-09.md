# s*(Λ) scaling for parametric strip families — investigation log (2026-07-09, CC + AL)

Question (AL): chart s*(Λ) vs number of layers for the "1 square + n triangles" family, extract k,
compare s* to k, and probe whether the s*-bound is 2k+c, 3k+c, 4k+c, or steeper — to get asymptotic
data the k≤8 catalogue can't give.

## Results

**Floor family — `(square)(triangle)^n`, mirror-symmetric layered word** (`scripts/strip-sstar-scaling.py`,
`strip-sstar-2026-07-09.csv`). Exact ℤ[ζ₂₄], n=1..25:
- lattice T1 = ζ⁰, T2 = ζ⁶ + n·ζ⁴;  k = ⌊n/2⌋+1;  **s* = n+1 exactly** ⟹ s* = 2k (odd n), 2k−1 (even n).
- Dead-straight slope 2, intercept ~0. This IS the proven 2k floor (TA Lemma L).

**Family classification of the whole k≤8 catalogue** (`scripts/family-sstar-classify.py`,
`family-sstar-2026-07-09.csv/.summary`). Max s* per k by polygon/vertex family:
- 3.4 (tri+sq): exactly **2k** (floor).  snub (3.3.4.3.4 / 3.3.3.3.6): reaches the ceiling **2k+4**, no higher.
- 3.6 (tri+hex): ceiling **2k+4**.  has-12gon: **lowest**, ~1.2k+4 (round, high-symmetry cells).
- Nothing in 5,568 tilings exceeds 2k+4. Slope 3 / 4 are dead for every constructible tiling.

**Ceiling family C — the 2×p√3 rectangular tube** (reverse-engineered: T1=(-1,√3) len 2, T2=(3p/2,p√3/2) len p√3):
- **s* = 2p exact** (verified on the lattice to p=14, `scratchpad/wt_tube`).
- Every ceiling tiling is **the triangular tiling minus an independent set of vertices** (each removed
  vertex merges its 6 triangles into a hexagon). All catalogue ceiling Seeds are pure `[a,0,b,0]`.
- Toolchain validated: `reconstructOracleCell` + `KUniformityChecker.countVertexOrbits` reproduces the
  catalogue k for **45/45** tilings (`scripts/ceiling-orbit-verify.ts`). Trustworthy.
- Catalogue min-k per tube height (the true ceiling for p≤10): k = 4,5,6,7,7,8 at p=5..10 →
  **s*/k ≈ 2.3–2.57**, p−k = 1,1,1,1,2,2 (growing).

## The unresolved point (the real answer)

The slope collapses to how min-k grows with p. The SAME six points fit the TA's **2.33k+2.7**, the
**2.4k+3** conjecture, and a geometric-argument **2.5k** — all cross within 1 unit at k≤8 and separate
only past **k≈27**. If it is 2.5k it breaks 2.4k+3 at large k. The geometry: a rectangular lattice caps
the point group at order 4, so k = #verts/4; with #verts/p ≈ 3.2 → k ≈ 0.8p → s* ≈ 2.5k. But #verts/p
being constant is extrapolation, not theorem.

## Construction attempt (extend past k=8) — partial

`scripts/ceiling-extend.ts` + `scratchpad/gen_tubes.py`. Generated primitive tri+hex tubes (triangular
minus 2mm-symmetric independent hexagon sets), p=5..12:
- **Primitivity matters**: a first pass gave min-k=2 for all p — non-primitive supercells (s*=2p a
  supercell artifact, the CLAUDE.md "reject supercells" rule). Added a torus-translation-invariance
  filter.
- Primitive 2mm-about-origin family gives **k = p+1 ⟹ s* = 2k−2** (a NEW achievable floor-like family),
  NOT the ceiling. The catalogue min-k (k≈0.8p) is lower and is achieved by a DISTINCT optimal hexagon
  arrangement at each p (p=5,7,9 share only 2 hexagons then diverge). **No clean parametric extension of
  the extremal was found** — locating min-k per p is the per-p optimization at the heart of the TA's
  open Route-2 level-count sub-lemma.

## Bottom line

- 3k / 4k: dead. Everything constructible is **2k + O(1)**.
- Floor: **s* = 2k** (proven; two independent families here hit it, one at 2k−1..2k, one at 2k−2).
- Ceiling: **s* = 2p exact** on the tube; **s*/k slope is open between ~2.33 and ~2.5**, undecidable
  from k≤8, and settling it = solving the min-orbit optimization (TA Route-2). Validated tooling +
  the "triangular minus hexagons" characterization are in place to attack it.

## Artifacts
Scripts: `strip-sstar-scaling.py`, `family-sstar-classify.py`, `ceiling-orbit-verify.ts`,
`ceiling-dump.ts`, `ceiling-extend.ts`. Data: `strip-sstar-*.csv`, `family-sstar-*.{csv,summary}`,
`ceiling-extend-*.csv`. Figure: claude.ai artifact (s* scaling, 4 panels).
