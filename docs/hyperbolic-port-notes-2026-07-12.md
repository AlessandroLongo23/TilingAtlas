# Hyperbolic port — feasibility notes (2026-07-12)

Status: **exploratory, not current mission.** Euclidean k-uniform completeness (the Čtrnáct proof
program) remains the spine. This note records a "would it port?" investigation so the verified
formula and the co-realization finding are not lost.

Question: would the Čtrnáct combinatorial engine extend to hyperbolic tilings by regular polygons,
and can the vertex-configuration set be made finite (AL's "minimal-excess" idea)?

Author: CC. Validated script: `experiments/hyperbolic/hyp_realize.py`. Literature scouted 2026-07-12.

## TL;DR

- The geometry-blind **search** and the **finiteness argument** port. The exact-geometry developer
  (`eu_develop`'s ℤ[ζ₁₂] HNF lattice) does not.
- Finiteness of "k-uniform hyperbolic regular-polygon tilings" needs **two** hypotheses, neither
  alone: (1) a bounded alphabet (valence + polygon-size cap; "minimal-excess" is the tightest such
  cap), and (2) genuine k-uniformity = k vertex-**orbits** under a cocompact group (periodicity),
  not k vertex-**types**.
- Open blockers: the `eu_develop` rewrite; realizability decidability is open even at k=1
  (Datta–Gupta Q1.8); no external oracle for k≥2 (genuine white space).

## 1. The realizability test (validated)

Regular hyperbolic p-gon, curvature −1, edge length ℓ, interior angle α = 2β:

    sin β = cos(π/p) / cosh(ℓ/2)      ⇒   α(p, ℓ) = 2·asin( cos(π/p) / cosh(ℓ/2) )

Limits: ℓ→0 ⇒ α→(p−2)π/p (Euclidean); ℓ→∞ ⇒ α→0; strictly decreasing in ℓ. A vertex configuration
(multiset of polygons) realizes iff Σ α(pᵢ,ℓ) = 2π has a root ℓ>0, which holds iff the Euclidean
angle sum strictly exceeds 360°. This is Datta–Gupta's angle-sum condition α(k)=Σ(kᵢ−2)/kᵢ > 2.

Formula confirmed against two published sources:
- Hirsch, Li, Petty, Xue, arXiv:1910.12966 (2019): `cosh(ℓ/2)=cos(π/n)/sin(θ/2)`, θ = interior
  angle — verbatim; also area = (n−2)π − nθ.
- Coxeter, Canad. Math. Bull. (1997): `cosh ψ = cos(π/q)/sin(π/p)` — same right triangle, but ψ is
  the **apothem** (in-radius), the other leg. Looks p↔q swapped; it is measuring a different segment.
  Half-edge uses cos(π/p)/sin(π/q); apothem uses cos(π/q)/sin(π/p); circumradius cosh R = cot(π/p)cot(π/q).

k=1 check (script Part B): numeric solver vs closed form `cosh(ℓ/2)=cos(π/p)/sin(π/q)` matches to
≤1e-15 across {3,7},{3,8},{4,5},{5,4},{7,3},{12,3},…; correctly rejects the spherical cases (5,3)
and the Euclidean boundary (4,4),(3,6); reproduces the existence condition (p−2)(q−2)>4.

## 2. The {3,q} commensurate family (co-realization mechanism)

Different polygon multisets generically do **not** share a realizing edge length: 6301 distinct
lengths among 6319 hyperbolic configs (polys {3,4,5,6,7,8,12}, valence ≤ 8; script Part D). So
mixed-config co-realization is not generic — it concentrates on a few special lengths.

At the regular {3,q} edge length (q ≥ 7, so {3,q} is hyperbolic) the angles go commensurate:

    α(3, ℓ_{3,q}) = 2π/q      α(q, ℓ_{3,q}) = 4π/q      (exact)

Proof: at ℓ_{3,q}, cosh(ℓ/2)=cos(π/3)/sin(π/q)=1/(2 sin(π/q)); then
α(q)=2·asin(cos(π/q)·2 sin(π/q))=2·asin(sin(2π/q))=4π/q (valid for q≥4). Verified to 60 digits
(mpmath). Consequently every `triangle^a · qgon^b` with **a + 2b = q** closes at that single edge
length. At ℓ_{3,8} ≈ 1.5286: {3,8} (8 triangles), {8,4} (4 octagons), and mixed 3².8³, 3⁴.8² all
share it exactly. Analogously 2·α(3)+α(4)=180° exactly at ℓ_{5,4}, tying {5,4}, 3⁴4², 3².4.5².

These special lengths are the regular-tiling / triangle-group lengths — presumably where the
classical hyperbolic uniform/Archimedean tilings already live.

**Necessary, not sufficient.** A shared edge length proves only that the metric is consistent (tiles
of these types fit at one size). It does **not** prove a connected edge-to-edge k≥2 tiling assembles;
that is the combinatorial gluing question, decided by the Čtrnáct search, not this metric check.

## 3. Finiteness — the two hypotheses

"Minimal-excess" is **our coinage** — not named or enumerated anywhere (10+ searches). The excess
inequality itself is standard (Datta–Gupta angle-sum condition); the minimality refinement (above
360° but ≤360° after removing any one polygon) is ours.

Finiteness of k-uniform hyperbolic regular-polygon tilings requires **both**:

1. **Bounded alphabet** — a valence cap and a polygon-size cap. Minimal-excess is the tightest such
   window: a minimal config has Euclidean sum in (360°, 540°), which bounds valence. Without any
   bound: infinite even at k=1, since {p,q} exists for all (p−2)(q−2)>4.
2. **Genuine k-uniformity** — k vertex-**orbits** under a cocompact (periodic) group. Datta–Gupta §5:
   a single vertex-type ([4,4,4,6]) with bounded valence *and* size still admits **infinitely many**
   pairwise non-isometric tilings, because they are not cocompact. So "same vertex-type" ≠ finite in
   the hyperbolic plane. Fixing k vertex-*types* is the wrong hypothesis; fixing k vertex-*orbits* is
   right.

Given both, **Delaney–Dress symbols** (Dress; Huson, Geom. Dedicata 47, 1993) give finiteness:
bounding orbits + valence + polygon size bounds symbol complexity, hence finitely many types per
level. Tegula (arXiv:2007.10625) enumerated all 2D periodic tilings of complexity ≤ 24 across
sphere/plane/hyperbolic (~2.4B types). This is the hyperbolic analog of the Euclidean torus /
per-k period-bound obligation. (Repo already carries D-D machinery under `experiments/delaney-dress/`.)

Delaney–Dress counts **combinatorial** types; realizability by regular polygons is a separate filter.
Once the combinatorics is fixed the regular-polygon realization is rigid (unique ℓ₀), so it filters
the finite list rather than inflating it — but see the decidability caveat in §4.

## 4. Port verdict and open blockers

Ports:
- Geometry-blind search (solver + pruner): half-edge gluing DFS, local face-cycle rules,
  WL/isomorphism dedup. Alphabet swap.
- The finiteness argument: Delaney–Dress is geometry-agnostic across periodic tilings. (Corrects the
  earlier "no translation lattice ⇒ finiteness breaks" framing — the lattice is only `eu_develop`'s
  realization tool, not the finiteness mechanism.)
- Čtrnáct's rigidity closure already targets the periodic quotient (minimal fundamental domain), so
  it sidesteps the [4,4,4,6] vertex-type-infinitude trap by construction, provided the port keeps
  rigidity rather than closing on vertex-type.

Does not port / open:
- `eu_develop`'s exact realization: ℤ[ζ₁₂] flood-fill + integer HNF + Lagrange–Gauss → PSL(2,ℝ)
  placement, Fuchsian side-pairing, genus-g≥2 quotient, per-tiling number fields (no roots-of-unity
  direction quantization).
- Realizability decidability is **open** even at k=1 (Datta–Gupta Question 1.8: no known terminating
  test for whether a vertex-type tiles; their d≥4 criteria are sufficient, not necessary).
- No external oracle at k≥2 (no Galebach/Myers analog). Same no-witness problem as the composite
  family. Partial anchor: read edge lengths back from Tegula / HYPERTILING (arXiv:2309.10844) / Hatch.

## 5. Cross-check on the {3,8} pool — demo close-out (2026-07-12)

Took the five metric candidates at edge length ℓ_{3,8} ≈ 1.5286 (triangle angle 45°, octagon
angle 90°) and cross-checked which are actual tilings, against the Wythoff [8,3]/[8,4] uniform
catalogues and the semi-regular-tiling theorems. Tegula's GUI needs a display (headless here), so
the k=1 oracle is the catalogue; the k≥2 question has no oracle anywhere.

| pool config | verdict | evidence |
|---|---|---|
| 3⁸ = {3,8} | real, regular 1-uniform | order-8 triangular tiling (rendered) |
| 8⁴ = {8,4} | real, regular 1-uniform | order-4 octagonal tiling (rendered), shares ℓ_{3,8} exactly |
| 3⁶.8 | not known to be realized (open) | non-Wythoffian; fails Datta–Gupta sufficient cond. (B); not killed by Mitchell Parity Lemma; Euler-consistent |
| 3⁴.8² | not known to be realized (open) | non-Wythoffian; fails Datta–Gupta cond. (A); not killed by Parity Lemma; Euler-consistent |
| 3².8³ = 3.3.8.8.8 | **provably not 1-uniform** (k≥2 open) | Mitchell Parity Lemma: pattern 8.3.3.8 forces 8=3, contradiction |

The lesson the demo was meant to show, now concrete and partly proven: **shared edge length is
necessary, not sufficient.** Of five metric candidates, two are real, one (3.3.8.8.8) is *provably*
not a vertex-transitive tiling despite passing the metric filter, and two are genuinely open. Note
3.3.8.8.8 is exactly the config I handed back as a "concrete k=2/k=3 example" in the scripts — it
passes the metric test and is still not a k=1 tiling. Its status inside a k≥2 tiling is unresolved
(the Parity Lemma only excludes the vertex-transitive case), and there is no k≥2 hyperbolic
enumeration in the literature to settle it.

None of the three mixed configs is Wythoffian: the only triangle+octagon uniform tilings (3.8.3.8,
3.4.8.4, 6.6.8, 3.3.3.4.3.8) sit at *different* edge lengths with the octagon not at 90°, so they
are off-pool. This is why the pool's mixed members have no home in the uniform catalogue.

Figures (reflection-group renderer, `experiments/hyperbolic/render_poincare.py`, verified against the
Poincaré-disk construction): `tiling_3_8.png` (826 triangles, 8/vertex) and `tiling_8_4.png` (345
octagons, 4/vertex), both at ℓ = 1.528570919 — the commensurability made visible.

Tooling note for any future pass: Tegula is GUI-only, but ships downloadable **SQLite** databases
(`tilings-1-18.tdb` includes hyperbolic, Dress complexity ≤ 18) with `vertex_deg`/`tile_deg` columns,
queryable offline with no JavaFX. Caveat: it indexes *combinatorial* (Delaney) tilings, so a degree
match is a topological candidate that still needs a separate regular-polygon metric check — the exact
`necessary/sufficient` split this note is about. `odf/julia-dsymbols` and Gavrog generate D-symbols
programmatically. None of these encodes regular-polygon geometry, so the metric filter stays your job.

**Status: hyperbolic banked as a demo.** The engine/idea generalizes (the {3,q} commensurate
mechanism is real and visible); the completeness contribution does not transfer (k=1 realizability
decidability open, no k≥2 oracle, metric filter over-produces). Not a completeness target.

## Sources

- Datta & Gupta, *Semi-regular tilings of the hyperbolic plane*, Discrete Comput. Geom. (2021),
  arXiv:1806.11393. (Angle-sum condition; monotonic θ(ℓ); d=3 characterization; §5 non-uniqueness;
  Q1.8 decidability open. Note: co-author is Gupta, not "Sarkar".)
- Hirsch, Li, Petty, Xue, arXiv:1910.12966 (2019). (Angle/edge formula verbatim; area.)
- Coxeter, *The Trigonometry of Hyperbolic Tessellations*, Canad. Math. Bull. (1997). (Apothem form.)
- Zeller, Delgado-Friedrichs, Huson, *Tegula*, arXiv:2007.10625 (2020). (Complexity-≤24 enumeration.)
- Huson, Geom. Dedicata 47 (1993), DOI:10.1007/BF01263661. (Tile-k-transitive generation/finiteness.)
- de Souza & da Silva, Ars Combinatoria 160 (2024), DOI:10.61091/ars-160-14. (k=1 growth functions.)
