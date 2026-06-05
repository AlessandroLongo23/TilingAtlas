# Deterministic candidate-lattice (Λ) enumeration — design for the next phase

> **STATUS UPDATE (2026-06-05, session 10 — read `DEVELOPMENT_NOTES.md` §19).** The **oblique class is now
> CLOSED for the regular core**: `PeriodSolver.candidateLattices` gained a third source **(C) `obliqueCells`**
> — the proven `cor:box` completion (pair-seed `u∈sub-pool × v∈full-pool` + a join-closure via the exact
> rational-HNF `joinLattice`), contributing only `hol==2` lattices so (A)/(B) stay the sole round/grid source
> and k≤2 stays byte-identical. This reaches the two oblique k=3 cells **t3046, t3055** (closing 59 → 61). ⚑
> The note at line 12 below ("oblique remains the open problem") and the "only complete oblique method …
> explodes" claim in (1) are **superseded** for the regular core: pool-pairing over the **`A_adm`-bounded
> sub-pool** (largest area with `vcAreaMinVerts ≤ 2k`) is tractable (~15k candidates, not the dense
> explosion). Completeness within the **tuned pool reach** is loud-INCOMPLETE-logged (the full proven-box
> reach stays a separate Phase-2); the HNF *sublattice* obstruction in (1) still stands — `obliqueCells` does
> NOT do HNF sublattice enumeration, it pairs realisable pool vectors. **Generation was only half the
> close:** the certified no-cap scout first returned 66, not 61 — the oblique cells exposed a pre-existing
> rotation-only false-negative in `tilingsCongruent` (the dedup applied a pure translation instead of `ζ^r`
> for `reflect=false`). Fixed (§19.6); with it the certified cells reduce to **61 / `eb34499d5fba3457`**,
> k≤2 still byte-identical. So closing the oblique class needed BOTH the new source (C) AND a complete dedup.

> **STATUS UPDATE (2026-06-02, session 3 — read `DEVELOPMENT_NOTES.md` §12).** This design is now
> IMPLEMENTED and LIVE: `PeriodSolver.candidateLattices` is seed-free (`shortVectorPool` + `edgeStepDirs`
> + monotone + `roundCells` + `gridAlignedCells` + the **VC-area filter** — the cell area is forced by the
> seed's VCs, far sharper than the area ladder here). Coverage is **complete up to the oblique class**
> (k=2 20/20, k=3 59/61, k=4 146/151 vs the Soto-Sánchez oracle). TWO important corrections to this doc:
> (1) ⚑ **HNF sublattice enumeration is INCOMPLETE** for our mixed √2/√3 oblique cells (the 4.8.8
> obstruction) — DO NOT implement it; the only complete oblique method is reference-free short-vector
> pairing, which explodes (the dense-ladder problem). (2) The "three quantizations" finiteness is real,
> but the *operative* sharp filter turned out to be the **VC-area set**, not the generic tile-area ladder.
> Oblique (k≥3) remains the open problem. k=2 = 23, the +3 = the chiral snub counted 4× (a dedup bug).

> **Purpose.** A self-contained design spec for replacing the current *seed-coupled, non-deterministic*
> lattice discovery in `PeriodSolver` with a **seed-independent, deterministic enumeration of candidate
> period lattices Λ**. This is the route to a *reproducible, provable* k-uniform count and to clean
> scaling in k and in the polygon set. Read alongside
> [`DEVELOPMENT_NOTES.md`](DEVELOPMENT_NOTES.md) (the full narrative; §7 = the implemented solve-for-period,
> §9.1 = the discovery gap this doc closes) and [`CYCLOTOMIC_SPEC.md`](CYCLOTOMIC_SPEC.md) (the exact
> ℚ(ζ_N) arithmetic this all runs on).

---

## 0. Where this fits (status the next task starts from)

The **solve-for-period** construction is built and validated
([`PeriodSolver.ts`](../lib/classes/algorithm/PeriodSolver.ts)):

- A periodic tiling is a tiling of the torus T = ℝ²/Λ; **once Λ is fixed the fill is finite**, so the
  unbounded allowed-VC non-periodic growth that hung the expand-and-extract path cannot occur. The
  fill (`torusFill`) is **sound and complete *given* Λ** (corner-completion explores every edge-to-edge
  filling of the torus; an exact gap-free certificate, a primitivity filter, and the exact orbit gate
  keep exactly the k-uniform primitive cells).
- **Validated:** k=1 → 11 (primitive cells, exact orbit counts); **all 40 k=2 seeds terminate**
  (0 timeouts); fast 2-uniform seeds → orbit 2.

**The one remaining leak is *upstream of the fill*: how Λ is sourced.** Today `candidateLattices()`
runs a shallow, time-boxed expansion of the concrete seed and harvests translation vectors from it
(`extract()` on small periodic leaves + same-orientation centroid differences). Two consequences:

1. **Incomplete** — a tiling's period is found only if the seed's expansion happens to grow that
   tiling's structure within the budget. k=2 lands at **15/20**.
2. **Non-deterministic** — the `extract()` time budget makes *which* lattices are found depend on
   wall-clock; two runs both gave 15 with *different* compositions.

**Goal of this phase:** delete the expander from the path entirely. Compute the candidate Λ directly
and deterministically from the polygon set + the seed's VC types, then feed each to the existing
(unchanged) `torusFill → certify → primitivity → k-gate` pipeline.

---

## 1. The geometric principle — Λ is *over-determined*, not free

The reason a deterministic enumeration exists at all: a period lattice is pinned by **three
independent quantizations**. Each alone leaves a continuum or a dense set; their **intersection is
finite**.

### 1.1 Area is quantized
The cell area equals the sum of the tile areas inside one fundamental domain:
$$|\det \Lambda| \;=\; \sum_{\text{tiles in the cell}} \mathrm{area}(\text{tile}).$$
Tile areas are fixed algebraic numbers (unit edge): △ = √3⁄4, □ = 1, ⬡ = 3√3⁄2, ⯃₈ = 2(1+√2),
⯃₁₂ = 3(2+√3), … So `|det Λ|` can only land on a **discrete ladder** — the non-negative integer
combinations of a fixed finite set of areas — and it is bounded above (§1.4), so the ladder is finite.

**Exact, checkable form (regular core {3,4,6,8,12}, ring N=24).** Every tile area and every grid
determinant lives in the real field ℚ(√2, √3). Decompose both sides into the rational / √2 / √3
components and match componentwise. With tile counts `t₃,t₄,t₆,t₈,t₁₂ ≥ 0`:

| component | contribution |
|---|---|
| rational | `t₄·1 + t₈·2 + t₁₂·6` |
| √2 | `t₈·2` |
| √3 | `t₃·(1/4) + t₆·(3/2) + t₁₂·3` |

So `|det Λ| = p + q√2 + r√3` is realizable **iff** the three integer equations
`p = t₄+2t₈+6t₁₂`, `q = 2t₈`, `r = t₃/4 + 3t₆/2 + 3t₁₂` admit non-negative integer solutions within
the cell budget (§1.4). This is a cheap, *exact* feasibility filter on any candidate Λ — it rejects
ill-commensurate lattices before any fill.

### 1.2 Shape is quantized (the crystallographic restriction — the wallpaper-group idea, used right)
A periodic tiling's symmetry group is a wallpaper group; its point group `P` is **crystallographic**
(rotations only of order 1, 2, 3, 4, 6; `|P| ≤ 12`). Λ must be **P-invariant**, which forces its
Bravais class:

| symmetry present in P | forced lattice (Bravais) |
|---|---|
| 6- or 3-fold rotation | **hexagonal** (|u|=|v|, 120°) |
| 4-fold rotation | **square** (|u|=|v|, 90°) |
| reflections, no 3/4/6 | **rectangular** or **centered-rectangular / rhombic** |
| 2-fold only | **oblique** |
| nothing (p1) | **oblique** |

So you enumerate a handful of Bravais *types*, not arbitrary parallelograms — and **which types are
even allowed is dictated by the seed's VCs** (a VC's local rotation/reflection content limits the
global `P`). This is precisely the documented `algorithm.md` instinct (fit the 17 wallpaper groups /
Conway orbifold), finally used correctly: as **period enumeration** (let the group propose Λ, then
fill) rather than as a construction strategy.

### 1.3 Grid / commensurability is quantized
Every vertex of an edge-to-edge unit-edge tiling on the ring is a sum of unit edge-vectors ζ^j, so
`Λ ⊂ ℤ[ζ_N]`. Period vectors are integer combinations of a **bounded number of unit steps**.
**Caveat (the finiteness subtlety):** ℤ[ζ_24] is *dense* in ℂ (φ(24)=8 > 2), so "all short ℤ[ζ_24]
vectors" is **not** finite. The rigorous finiteness comes from bounding the **step count** (number of
unit edges, ≤ cell diameter), not the Euclidean length — a depth-bounded search over the N unit
directions, deduped exactly, gives a finite set.

### 1.4 The bound that closes everything: V_cell ≤ k·|P|
Vertex orbits are taken under the full group G = Λ ⋊ P. Within one fundamental domain of Λ, each
G-orbit contributes ≤ |P| translation-classes of vertices, so
$$V_{\text{cell}} \le k\,|P| \le 12k,$$
and by Euler on the torus the tile count `F ≤ 2 V_cell ≤ 24k`. Hence the area is **O(k)** and the
area-ladder (§1.1) is finite. Cell size grows **linearly** in k.

---

## 2. The dangerous case — low-symmetry, anisotropic cells (`cmm` and friends)

**Empirically confirmed (k=2): at least 3 of the 5 missing tilings have long, rhombus-shaped
translational cells (`cmm`-type).** This is not a corner case to bolt on later — it is the *dominant*
failure mode, and the enumeration must be designed around it.

**Why they're hard.** Area is *hard*-bounded (§1.1), but a lattice's **longest** vector is **not**
bounded by area alone. A centered-rectangular (`cm`, `cmm`) or oblique (`p1`, `p2`) lattice can have a
small area and a long primitive vector — an elongated rhombus. So:
- High-symmetry (hexagonal/square) lattices are "round" (both vectors ≈ √area) → cheap to enumerate.
- Low-symmetry rhombic/oblique lattices can be arbitrarily elongated at fixed area → enumerating the
  long vector by step-count would need a large depth → expensive, and the naive "shortest-N vectors"
  heuristic (what the current discovery does) **systematically misses them**.

**The design fix — asymmetric enumeration (fix short, *solve* long).** Do **not** enumerate both basis
vectors symmetrically by length/step-count. Instead:

1. Enumerate the **short** vector `u` (a grid vector of bounded length — cheap, finite).
2. **Solve** for the long vector `v` from the constraints, never enumerating it by length:
   - `v ∈ ℤ[ζ_N]` (grid),
   - `|det(u, v)| = A` for a *quantized* area `A` (§1.1) ⇒ `v` lies on a line parallel to `u` at
     perpendicular distance `A/|u|` — a **1-parameter family** `v = v₀ + m·u`, `m ∈ ℤ`,
   - `⟨u, v⟩` is **P-invariant** for the Bravais class being tried (for `cm`/`cmm`: `u` along a mirror
     / `u,v` symmetric about the centered axes).
   The grid points in that family within one period are finite and enumerable **directly**, cheaply,
   *regardless of how long `v` is*.

This converts the anisotropic case from "search a huge ball" into "fix one cheap vector, intersect a
line with the grid under a symmetry constraint." It is the single most important consequence of the
`cmm` observation for the implementation.

> **★ Update (2026-06-02, from the literature sweep — [`RESEARCH_NOTES.md`](RESEARCH_NOTES.md) §0).**
> The clean, canonical form of "fix-short-solve-long" is **Hermite Normal Form (HNF) sublattice
> enumeration**: every index-`n` sublattice of a fixed reference lattice has a *unique* HNF basis
> `[[a,b],[0,d]]` with `a·d=n`, `0≤b<d`. Iterating divisors `a|n` and `b∈[0,d)` yields **all `σ(n)`
> sublattices, seed-free and duplicate-free by construction** — and the `cmm` long vector is enumerated
> *implicitly* by the off-diagonal `b`, **never searched by length**, because you bound the *index*
> (≈ area), not the vector. Super-cell rejection = reject non-primitive HNF (`gcd(a,b,d)>1`; primitive
> count = Dedekind ψ, OEIS A001615). This is corroborated by three independent research angles and is
> worked for *toroidal maps* in Kundu–Maity ([arXiv:2111.15484](https://arxiv.org/abs/2111.15484)),
> whose point-group `G₀`-matrix quotient is exactly our symmetry-dedup step.
>
> **Open nuance to resolve:** HNF needs a fixed *reference lattice* `L₀ ⊇ Λ`. The toroidal-map papers
> are *single-vertex-type* (semi-equivelar), where `L₀` is one Archimedean tiling's lattice; our
> k-uniform tilings are *mixed-type*, so the plan is to enumerate **per Bravais class** — fix a
> canonical grid-commensurate reference of each class/orientation and HNF-enumerate its
> *symmetry-preserving* sublattices (generating functions: ITC §9.3.6 / Baake–Zeiner) up to the area
> bound. This realizes §3 step 3 below and supersedes fix-short-solve-long; it is a refinement to prove
> out, not yet settled.

---

## 3. Algorithm outline

```
INPUT:  seed VC types  →  allowed VC set, tile types {n}, ring N
OUTPUT: a finite, deterministic, de-duplicated list of candidate Λ

1. POINT GROUPS.
   From the VC set, enumerate the compatible crystallographic point groups P
   (orbifold-cost accounting: which rotations/reflections the VCs admit).
   Finite — at most the ~10 wallpaper point groups. Each P fixes a Bravais class
   and a length/angle relation between u and v.

2. AREA LADDER.
   Cell budget F ≤ 24k  ⇒  enumerate tile-count multisets (t_n) within budget that
   pass the angle/edge closure bookkeeping; each fixes a quantized area A = Σ t_n·area(n)
   (kept in exact ℚ(√2,√3) component form, §1.1).

3. LATTICE SOLVE  (per (P-class, A)):
   a. enumerate short grid vectors u (bounded step count, deduped exactly);
   b. SOLVE for v on the line |det(u,v)| = A, on the grid, P-invariant (§2) —
      do NOT enumerate v by length;
   c. exact area-component check (§1.1) and P-invariance check;
   d. Gauss-reduce, canonicalise, de-dup.

4. EMIT  →  hand each Λ to the EXISTING pipeline unchanged:
   torusFill(Λ) → isCompleteTiling → isPrimitive → KUniformityChecker (orbit == k) → dedup.
```

Notes:
- Steps 2–3 fuse naturally (a tile-count multiset already implies `A`).
- **The expander disappears.** The seed contributes only its VC set and the ring; nothing is grown,
  and there is no wall-clock dependence ⇒ **deterministic**.
- This *adds* a front-end; the entire back half of `PeriodSolver` (fill, certificate, primitivity,
  gate, dedup) is reused verbatim.

---

## 4. Scaling

### With k
- `V_cell ≤ k|P| ≤ 12k` ⇒ cell size, area, the area-ladder, and the candidate-lattice count grow
  **polynomially** in k (lattice counts of bounded index ~ σ(index), sub-quadratic).
- The orbit gate is polynomial in cell size.
- **Where cost can still grow: inside `torusFill`** — the number of distinct fillings of a *given*
  torus can grow with cell size at large k. But this is **bounded per period** (a finite torus), not
  unbounded like the old 6k growth. The high-k wall thus changes character from *"may never
  terminate"* to *"terminates; per-period branching may be large"* — a tractable CSP to prune, not an
  open-ended hang.

### With different polygons
- **Bigger ring.** Adding regular/star polygons with *rational* vertex angles raises `N` (= lcm of the
  relevant denominators); more edge directions ⇒ more candidate vectors ⇒ more candidate Λ — finite,
  same machinery.
- **The robust invariant: `|P| ≤ 12` regardless of the polygon set.** Even with 12-gons present, the
  *global* rotational symmetry of a periodic tiling stays ≤ 6-fold (a 12-gon gives 12-fold *local*
  symmetry at its center, but the translation lattice forbids 12-fold global rotation). So the
  shape-quantization never degrades as exotic tiles are added — this is what keeps the method from
  exploding.
- **Richer area ladder.** More tile types ⇒ more distinct areas ⇒ a denser (still discrete) ladder; the
  ℚ(√2,√3) component decomposition generalises to whatever real subfield the new areas live in.
- **Scope boundary — irrational angles.** Equilateral/irregular polygons whose vertex angles are *not*
  rational multiples of π fall off the cyclotomic grid (`Λ ⊄ ℤ[ζ_N]`); the exact-grid story breaks.
  This is a hard wall of the whole exact approach, not just this step.
- **Non-convex (stars).** Area + shape quantization still hold, but the float `Polygon.intersects`
  overlap test is unsound and must be replaced by exact rational segment intersection first.

---

## 5. Integration with the existing code

- **Replace** `PeriodSolver.candidateLattices()` (and drop its `SeedExpander` use, the `extract()`
  time budget, the oriented-vector heuristic) with the §3 enumerator.
- **Keep unchanged:** `torusFill`, `isCompleteTiling`, `isPrimitive`, `canonicalRep`/`dedupModLattice`,
  `KUniformityChecker`, and the `solve()` orchestration loop over candidate lattices.
- **Reuse:** `gaussReduce` (already exact), the active `CyclotomicRing`, the exact area-component
  decomposition (new small helper), and the existing `makeCtx` per-lattice setup.
- **Determinism requirement:** remove every wall-clock / `Date.now()` budget from the candidate path.
  The only caps that may remain are *hard structural* ones (cell budget `24k`, the bounded step count),
  never time.
- A new module (e.g. `LatticeEnumerator.ts`) producing `[Cyclotomic, Cyclotomic][]` keeps the change
  localized and lets the old discovery stay as a fallback during validation.

---

## 6. Open theoretical / proof obligations

1. **`V_cell ≤ k|P|`** — standard orbit-counting; write it up cleanly (it is the load-bearing bound).
2. **Finiteness via bounded step count**, *not* norm equations — because ℤ[ζ_24] is dense in ℂ
   (`|x|² = x x̄` lives in a rank-4 dense real subring), "grid vectors of length L" is not obviously
   finite. State the termination argument in terms of step count / cell budget.
3. **The anisotropy (cmm) bound.** The "fix-short-solve-long" construction (§2) is what makes the
   elongated-rhombus case finite and cheap; the obligation is to show it enumerates *every* realizable
   `(u, v)` for the low-symmetry Bravais classes (no long primitive vector is skipped because the area
   line + grid + P-invariance pins `v` exactly).
4. **Completeness of the enumeration.** Prove the §3 output provably contains the period lattice of
   *every* k-uniform tiling with these VCs (so the back-half pipeline, which is complete given Λ,
   yields the full count). This is the theorem that upgrades "15/20, jittery" to "exactly 20,
   reproducible."

---

## 7. Validation plan

- **Regression:** k=1 must stay = 11 (primitive cells, orbit 1).
- **Target:** k=2 = **20**, *deterministically* (identical output across repeated runs).
- **Targeted checks — the 5 previously missing**, especially the ≥3 `cmm`-type elongated-rhombus
  tilings (`[3⁶;3³.4²]` ×2, the second `[3⁶;3⁴.6]`, the second `[4⁴;3³.4²]`, `[3.4.6.4;3.4².6]`): each
  must now appear, and each via its *primitive* (not super-) cell.
- **Then k=3..6 → 61 / 151 / 332 / 673** (these reference counts were themselves obtained by
  systematic enumeration of this kind, which is corroboration that the direction is right).
- **Determinism harness:** run the enumerator twice, assert identical candidate-Λ sets and identical
  emitted-cell sets.

---

## 8. References

- The 20 two-uniform tilings (vertex-pair labels + images): Wikipedia,
  *Euclidean tilings by convex regular polygons* §2-uniform; image files `2-uniform_nNN.svg`.
  The reference k-uniform counts `11/20/61/151/332/673` (k=1..6).
- Crystallographic restriction theorem; the 5 Bravais lattices in 2D; the 17 wallpaper groups and
  their point groups (orders 1,2,3,4,6 / `|P| ≤ 12`).
- Conway–Thurston orbifold notation / orbifold "cost" for enumerating realizable symmetry types.
- Internal: [`DEVELOPMENT_NOTES.md`](DEVELOPMENT_NOTES.md) §7 (construction) & §9.1 (the gap this
  closes); [`K2_DIAGNOSIS.md`](K2_DIAGNOSIS.md); [`CYCLOTOMIC_SPEC.md`](CYCLOTOMIC_SPEC.md);
  [`PeriodSolver.ts`](../lib/classes/algorithm/PeriodSolver.ts).
