# Exact coordinate representation — implementation spec (for Claude Code)

**Status:** design agreed; not yet implemented. Intended to be handed to Claude
Code in **plan mode**: produce a plan first, surface the open questions in the
last section, and get them confirmed before executing.

**Math source of truth:** thesis `Preliminaries → Exact coordinate representation`
(`…/2nd year/Thesis/latex/chapters/preliminaries.tex`). This doc is the
engineering brief.

---

## 1. Why

Every *decisive* test in the pipeline — vertex coincidence, collision, orbit
identity, translational-cell detection, dedup — is an **exact equality** test.
In floating point these are unsafe: coordinates are irrational and error
accumulates under the repeated rotations of the expansion phase. The symptom is
an off-by-one in the validation counts `11/20/61/151/332/673`: a rounding dedup
drops a real tiling or duplicates one. We remove floating point from all
*decisions* and keep it only at the *render* boundary.

---

## 2. The representation (NON-NEGOTIABLE — read carefully)

Identify the plane with ℂ: **a point is one complex number**, an element of the
cyclotomic field ℚ(ζ_N), ζ_N = e^{2πi/N}.

**Use the canonical degree-φ(N) form.** Store a coefficient vector of length
**φ(N)** in the power basis {1, ζ, …, ζ^{φ(N)-1}}, with all arithmetic reduced
**mod the cyclotomic polynomial Φ_N**.

> ⚠️ Do **NOT** use the "redundant" length-N representation (coeffs over
> 1…ζ^{N-1} with only ζ^N = 1) even though it makes `mulZeta` a pure cyclic
> shift. In that representation **equality is not canonical** — distinct vectors
> can be the same number, because ζ_N satisfies Φ_N (degree φ(N)), not x^N−1.
> Comparing them directly silently breaks dedup, which is the exact bug this
> whole change exists to prevent. If you use a length-N form internally for
> speed, you MUST reduce mod Φ_N to canonical form before any `equals`/`key`.

For the **regular-polygon core, N = 24**, φ(24) = 8, and
Φ₂₄(x) = x⁸ − x⁴ + 1, i.e. the reduction relation is **ζ⁸ = ζ⁴ − 1** (reduce
higher powers by iterating this). Note i = ζ₂₄⁶, √2, √3 ∈ ℚ(ζ₂₄), so every
coordinate of the regular core lives here. Start here; do not generalize N until
the core reproduces the counts.

Coefficients are **`bigint`** (they grow under repeated rotation; Int32
overflows). Keep one reduced common denominator `den: bigint` so equality is
canonical: reduce by gcd, fix sign of `den` positive.

---

## 3. The type

Immutable value type, OOP to match `lib/classes/`.

```
class CyclotomicRing {                 // shared, immutable, one per run
  readonly N: number
  readonly phi: number                 // = φ(N)
  // reduction data for Φ_N: how ζ^phi … ζ^{2phi-2} fold back into degree < phi
  reduce(rawCoeffs: bigint[]): bigint[]   // length 2*phi-1 -> length phi
}

class Cyclotomic {                     // element of ℚ(ζ_N) ⊂ ℂ ; a 2D point
  readonly ring: CyclotomicRing
  readonly num: bigint[]               // length phi, canonical (reduced mod Φ_N)
  readonly den: bigint                 // common positive denominator, gcd-reduced

  add(o), sub(o), neg()
  mulZeta(k)                           // × ζ^k  (rotation by 2πk/N): shift by k, then ring.reduce
  mul(o)                               // full multiply: convolve, then ring.reduce
  conj()                               // ζ ↦ ζ^{N-1}, then reduce  (for reflections)
  scaleRational(p: bigint, q: bigint)  // centroids, midpoints
  equals(o): boolean                   // assert same ring; compare (num, den) canonically
  key(): string                        // `${den}|${num.join(',')}`  — Map/Set dedup & orbit IDs
  toVector(): Vector                   // numeric eval Σ a_j·cos/sin(2πj/N) → float Vector — RENDER ONLY
  static ZERO(ring), ONE(ring), zeta(ring,k), fromVector?(…)   // see open Q
}
```

- **Mixing rings is a hard error**: assert `a.ring === b.ring` in every binary op.
- `mulZeta(k)` is the hot path: shift coefficients up by `k`, then `ring.reduce`
  the overflow (degrees ≥ φ) via the Φ_N relation. It is **not** a bare cyclic
  shift (see §2).
- **Float-only, never decisive:** `mag = √(z·z̄)`, `heading = arg z`, any
  non-lattice angle. Render and broadphase heuristics only.

---

## 4. Building polygons exactly — by boundary walk (not by radius)

Do **not** port `radius·(cos θ, sin θ)`. Construct every polygon by walking its
boundary, which keeps all vertices in ℤ[ζ_N] with no sine/radius/extension:

- Start at an exact anchor `a ∈ ℤ[ζ_N]` (e.g. ZERO) with an exact unit direction
  `d = ζ^{k₀}`.
- Repeat: `vertexᵢ₊₁ = vertexᵢ + d`; then turn `d ← d · ζ^{t}`, where `t` is the
  exterior-angle turn in units of 2π/N.
- **Regular n-gon:** every turn is the exterior angle 2π/n → `t = N/n` (needs n|N).
- **Star {n|d} / parametric {n|α}:** turns alternate between the outer and inner
  exterior angles (π−α) and (π−β), β = 2π(1−1/n)−α. Each is a rational multiple
  of 2π → an integer number of 2π/N steps. The π term contributes a factor 2 to
  the denominator (see §5). No radius is ever needed.
- **Centroid / midpoints:** exact rational means of vertices (`scaleRational`),
  automatically in ℚ(ζ_N). The existing `calculateCentroid` (signed-area form)
  also stays exact since it is a rational function of the vertices.

Current constructors to replace/duplicate exactly:
`RegularPolygon` (`calculateVerticesFromAnchorAndDir` is already a walk — port
that one, not the centroid+radius one), `StarRegularPolygon`,
`StarParametricPolygon` (drop `outerRadius`/`innerRadius`; use alternating
turns), `EquilateralPolygon`, `GenericPolygon`, `DualPolygon`, `IsohedralPolygon`.

---

## 5. Choosing N (`computeOrder(params)`)

`N` is computed **once per run** from `GeneratorParameters` (per-category
`n_max`, and the α set for parametric stars). Rule: collect every edge-direction
and every exterior-turn angle used by any enabled polygon, write each as a
fraction `r = p/q` of 2π in lowest terms, and set `N = lcm` of all denominators
`q`. The π in star turns contributes denominator 2, so parametric families pull
in a factor `2·denominator(α/2π)`.

- `{3,4,6,12}` → N = 12; `{3,4,6,8,12}` (regular core) → **N = 24**.
- `+ {5,10}` (pentagon/decagon, regular stars) → N = 120, φ = 32.

There is **one** arithmetic backend (`CyclotomicRing` for the computed N), never
a per-polygon choice of method.

---

## 6. File inventory (coordinate surface)

**Tier A — exact (must change):**
`classes/Vector.ts` (keep as float/render type; add `Cyclotomic`+`CyclotomicRing`
as new files alongside), all `classes/polygons/*` (vertices→exact, float cached
for render), `classes/Transform.ts` (exact rotate-by-ζ^k / reflect-across-πk/N /
translate), `classes/algorithm/{PolygonsGenerator, PolygonSignature,
VertexConfiguration, SeedBuilder, SeedConfiguration, SeedExpander,
TranslationalCellExtractor, CompatibilityGraph}`, `classes/Tiling.ts`,
`classes/TilingChecker.ts`, `utils/geometry.ts`, `utils/math.ts`.

**Tier B — render/float boundary (touch only to call `toVector()`):**
`hooks/useP5`, `usePolygonsCanvas`, `useVcCanvas`, anything drawing with p5;
`stores/configuration.ts`.

**Tier C — out of scope (do not refactor):** `classes/generator/*`
(Game-of-Life / old WFC), `classes/wallpaperGroups/*` (until step-8
classification is revisited), `classes/GameOfLifeRule.ts`. Confirm none sit on
the k-uniform exact path before skipping.

---

## 7. Polygon mutability decision

`Polygon` currently stores `vertices: Vector[]` and mutates them in place
(`rotate`, etc. mutate `Vector`s). The exact type is immutable. **Decision to
implement:** make an exact array the source of truth
(`exactVertices: Cyclotomic[]`); `vertices: Vector[]` becomes a derived float
cache, recomputed via `toVector()` whenever the exact vertices change. Exact
transforms produce new `Cyclotomic`s; the float cache is refreshed, never
hand-edited. Keep the existing float API working so render/tests are unaffected.

---

## 8. Phased plan (`pnpm build` GREEN after every phase)

1. `CyclotomicRing`+`Cyclotomic` for N=24, with the §9 tests. No pipeline change.
2. Exact vertices in polygon generation (regular core) via boundary walk; float
   `vertices` derived. Existing Vitest parity tests still pass.
3. Swap **decisions** to exact: in `SeedExpander` (`hashVertex`,
   `expandedSeedKey`, `getIsometryFootprint`, collision + orbit checks) and
   `TranslationalCellExtractor`, replace float hashing/equality with `key()` /
   `equals()`. Keep a float spatial hash for broadphase; confirm hits exactly.
4. **Acceptance gate:** run the pipeline for regular polygons and reproduce
   `k=1..6 → 11, 20, 61, 151, 332, 673` exactly.
5. Generalize N via `computeOrder` (stars push N up). Only after 4 is green.

---

## 9. Tests / acceptance

- Ring axioms over N=24 on random elements (assoc/comm/distrib); ZERO/ONE.
- `zeta(24,24).equals(ONE)`; `zeta(24,12).equals(ONE.neg())` (ζ¹² = −1);
  `zeta(24,6)` equals the exact `i`.
- Reduction: `zeta(24,8)` equals `zeta(24,4).sub(ONE)` (Φ₂₄: ζ⁸ = ζ⁴ − 1).
- Rotation closure: `mulZeta(2)` (30°) applied 12× = identity; a unit square's 4
  vertices are exact; rotating it by 30° for k=0..11 gives 12 distinct keys and
  k=12 returns the original key (no drift).
- `toVector()` matches the current float construction within 1e-9 (parity).
- **Headline:** pipeline reproduces 11/20/61/151/332/673 with exact dedup.

---

## 10. Open questions for the plan to resolve

1. `Cyclotomic.fromVector()` — is an inexact float→exact path ever needed
   (e.g. importing stored tilings), and if so how is it snapped/validated? Prefer
   to **avoid** it: construct exactly from generator parameters, never from floats.
2. Storage format (`pipelineStorageFormat`, gzip batches to Supabase): persist
   exact coeffs (`num`,`den`,`N`) or keep storing floats and reconstruct exactly
   on load? Persisting exact is safer for reproducibility.
3. `Transform`/`transformFinder` currently derive isometries numerically — port
   to exact ζ^k rotations and πk/N reflections, or keep float-derived and snap?
4. Performance budget: bigint is materially slower than float. Confirm broadphase
   (bbox/spatial hash in float) + exact-confirm is enough at k=6 scale.

---

## 11. Guardrails (from repo `CLAUDE.md` / `AGENTS.md`)

- Run **`pnpm build`** after every change (not just lint/test). `next.config.ts`
  sets `typescript.ignoreBuildErrors: true`, so a green build can still hide type
  errors — additionally run `pnpm exec tsc --noEmit` on changed files to be sure.
- Respect **server-only import hazards**: never pull `classes/generator/*` or
  `algorithm/TilingGenerator` through the `@/classes` barrel into client code.
- No new heavy deps; `bigint` is native. Keep `Vector` as the float/render type.

---

## 12. Corrections after plan review (MUST apply)

These override anything in the plan that conflicts.

### 12.1 Centroid = exact vertex mean, NOT the signed-area formula
The signed-area centroid divides by the (real, irrational) signed area — that is
**field inversion**, which the `Cyclotomic` API deliberately does **not** provide
(only `scaleRational(p,q)`, i.e. division by integers). Do not try to make
`calculateCentroid` (signed-area form) exact.

Use the **arithmetic mean of the vertices** as the exact representative point:
`centroidExact = (Σ vᵢ).scaleRational(1, n)`. For regular polygons this equals
the true centroid (by symmetry), so it is correct for the N=24 gate. For
irregular polygons (Phase 5) it is not the area-centroid but is a perfectly good
*consistent* representative for keys/membership, which is all the pipeline needs.
Keep the float signed-area centroid only if some render path needs it.

### 12.2 Translational cell by lattice-equivalence, NOT by rational (a,b)
The plan's `a = cross(rel,v2)/cross(v1,v2)` as "an exact rational" is **wrong**:
`a` is generally irrational (e.g. `√2−1` for a square corner in the 4.8.8 tiling,
which is one of the 11 at k=1), and computing it needs field inversion. Also the
half-open `0 ≤ a,b < 1` test is an *inequality over real algebraic numbers*, and
its boundaries (a=0 or 1) fall exactly on shared cell-edge vertices — precisely
where float is unsafe.

Replace coordinate ranges with **lattice-equivalence by float-guess + exact-verify**:
two polygons are in the same lattice class iff their centroid difference is an
integer combination of the basis,
`(c − c′) − (m·u + n·v) == 0` exactly, where integers `m,n` are guessed from the
float solve and then **verified exactly** (uses only `sub`, `scaleRational(m,1)`,
`equals` — all in-API, no division, boundary-safe). The fundamental cell is then
one canonical representative per lattice class (tie-break exactly); dedup tilings
by the canonical footprint of that representative set. This is the same
broadphase-guess / exact-confirm pattern used elsewhere.

### 12.3 Broadphase must never false-NEGATIVE
The float spatial-hash / bbox prefilter must be *conservative*: it may over-include
candidates (exact confirm rejects them), but it must **never exclude a true
coincidence**, or a real match is silently dropped and the count comes out low.
Use a generous tolerance and err toward false positives.

### 12.4 Targeted tests before trusting the count gate
- **Isometry exponents.** The `rotationK`/`axisK`/`+N/2` (edge anti-alignment)
  formulas are the most error-prone arithmetic. Unit-test on hand-verified
  placements *before* the count gate: two squares sharing an edge; a triangle and
  hexagon sharing an edge; one reflection case. Assert exact vertex-key match.
- **Magnitude ordering.** Choosing the "smallest" `u,v` compares `|z|²`, a real
  algebraic number, via float on exact `normSquared`. Confirm this never gates
  counts (different minimal bases give the same tiling) and use exact `equals`
  for ties.
- **Collision.** Interior-overlap-without-shared-vertex stays a float `intersects()`
  test. Confirm the regular core has no tangent/boundary overlap that float
  mis-decides, or make proper-overlap exact (rational segment intersection).
