# native-engine — C++ port of the enumeration exact-arithmetic core

A parallel, native reimplementation of the TilingAtlas enumeration engine, kept alongside the
TypeScript so both exist side by side. The TS engine stays authoritative and is the differential-test
oracle: the native port is trusted only where it reproduces the TS byte-for-byte.

## Status

**Complete: the whole enumeration engine is ported and validated, from ℚ(ζ₂₄) arithmetic up to the
`torusFill` DFS.** The TS stays authoritative; the native port reproduces it byte-for-byte.

| native file | ports (TS) | contents |
|---|---|---|
| `int128.hpp` | (bigint helpers) | gcd, isqrt, to_string/parse, overflow guard for `__int128` |
| `cyclotomic.hpp` | `lib/classes/Cyclotomic.ts` | `Ring` (Φ_N reduction) + `Cyclo` (ℚ(ζ_N) point): add/sub/mul/mulZeta/conj/scaleRational/normSquared/key/equals |
| `surd.hpp` | `lib/classes/algorithm/exact/Surd.ts` | `Surd` (ℚ(√2,√3)): +/−/×/scale/inverse/sign (float filter + exact) + bridges imSurd/reSurd/detSurd/tileAreaSurd/polygonAreaSurd |
| `overlap.hpp` | `lib/classes/algorithm/exact/exactOverlap.ts` | exact proper-overlap for NON-CONVEX (star) polygons: orient2D/segmentsProperlyCross/collinearSameSideOverlap/pointInPolygon/exactPolygonsOverlap |
| `polygon_float.hpp` | `Polygon.intersects` (convex path) + `geometry.ts` | float broadphase for REGULAR tiles: sdf/isWithinConvexHull/segmentsIntersect/`polygonIntersectsConvex` |
| `polygon.hpp` | `Polygon.ts` + `RegularPolygon`/`ExactStarPolygon` | exact placed-polygon object: `regular`/`isotoxal` constructors, exactKey, cornerToken, cornerAngleUnits, translateExact |
| `vec.hpp` + `Cyclo::toVector` | `Vector.ts` + `Cyclotomic.toVector` | exact→float bridge; ring carries BAKED `basisCos`/`basisSin` bits so it is bit-identical to V8 |
| `fillctx.hpp` | `PeriodSolver.ts` reduction/block | `FillCtx` core + reducePolygon / canonicalRep / dedupModLattice / buildBlock (exact identity on a float broadphase) |
| `collision.hpp` | `PeriodSolver.ts` overlap layer | bbox / polyIntersects (star gate) / properOverlapWithBlock / coreSelfOverlapsNearest / blockHasProperOverlap / blockOverlapPeriodic |
| `analyze.hpp` | `PeriodSolver.ts` block analysis | canonicalVCName / coveredIntervals / gapStartRay / vcRingNames / analyze (open-vertex / contradiction / closed) |
| `certificate.hpp` | `PeriodSolver.ts` soundness core | isCompleteTiling (exact area + saturation + overlap) / isPrimitive / stateKey / extendV / latticeEquivExact / vertexClassCount |
| `orbitgate.hpp` | `KUniformityChecker.ts` | countVertexOrbits — exact k-uniformity gate (symmetry group + vertex-orbit union-find) |
| `torusfill.hpp` | `PeriodSolver.ts` torusFill | the DFS: enumerate every edge-to-edge torus completion of a seed core (assembles all the layers above) |

Validated **100,029 / 100,029 byte-identical** against the TS oracle (`make test`): the arithmetic layer
(random ops, long chains, near-zero `signExact`, every bridge — 45,205 cases), the exact geometry layer
(orient/cross/collinear/point-in-polygon and full `exactPolygonsOverlap` on real regular AND star
polygons across overlapping / disjoint / edge-adjacent configurations — 11,000 cases), and the convex
float broadphase (12,000 `sdf` + 12,000 `isWithinConvexHull` on real convex polygons with points
inside / on-boundary / outside, 3,000 `segmentsIntersect`, 1,500 full `intersects` — 28,500 cases), and
the placed-polygon object (400 regular + 400 star constructions, each pinning ordered vertices +
edgeDirs + centroid + cornerTokens + cornerAngleUnits in one blob, + 800 `translateExact` — 1,600 cases),
the float bridge (4,000 `Math.hypot` + ~4,600 `toVector` — the two transcendental-bearing primitives),
the reduction/block layer (reducePolygon / canonicalRep / dedupModLattice / buildBlock on 24 real
lattices × 8 placed polygons, comparing exact keys and sorted block key-sets — 432 cases), and the
collision layer (1,500 `intersects` + 1,500 `isEquivalent` across regular/star × overlap/adjacent/far,
plus the four block predicates on both self-overlapping and sparse valid cells — ~3,300 cases), and the
block-analysis layer (`analyze` on real cells, spanning all three outcomes — over-full and disallowed-VC
contradictions, open-vertex selection, and a closed valid 4.4.4.4 cell — comparing the open vertex key +
gapStartRay + covered-interval multiset).
int128 is confirmed sufficient — no overflow guard tripped (measured max |coord| = 180 over the real
k=10 catalogue; int128 has ~10³³× headroom).

Two float-determinism results made the DFS port possible. (1) V8's `Math.hypot` is NOT `std::hypot`
(they differ ~1 ULP on ~40% of inputs) nor naive `sqrt(x²+y²)`; it is a Neumaier-compensated
sum-of-squares, replicated exactly in `jsHypot` (4,000/4,000). (2) `toVector`'s only transcendentals are
the ring's `cos`/`sin` basis — evaluated once in V8 and BAKED as raw bits into the native ring, so the
sum is pure arithmetic and bit-identical. With those two pinned (plus `jsRound` for `Math.round`'s
ties-toward-+∞, which `std::round` gets wrong on negatives), the exact canonicalization that rides on
float culls (`canonicalRep` picks the lex-min exact key among translates inside a `Math.hypot` radius)
reproduces the TS exactly.

The float layer is **bit-identical**, not merely close: doubles cross the differential-test firewall as
their raw 16-hex IEEE-754 bits (no decimal round-trip), the port is compiled `-ffp-contract=off` (no
fused multiply-add, so `a*b + c` is two rounded ops as in V8), and `Math.min`/`Math.max` NaN/±0
semantics are reproduced. The one transcendental — `atan2` as the `sdf` sort key — never flips the vertex
order for a convex tile (angles about the centroid are >~2π/12 apart), so `sdf` stays bit-exact; the
12,000 `sdf` cases (including on-boundary, distance≈0) confirm it. The exact geometry layer is the star
fill's hot primitive; this float layer is the regular fill's.

## The benchmark, and the lesson

`make bench` (matched computation, identical checksum across all three ⇒ same work):

| version | Mops/s | vs TS |
|---|--:|--:|
| TS (V8, bigint) | 0.54 | 1× |
| faithful C++ port (`bench.cpp`) | 1.42 | 2.6× |
| optimized representation (`bench-fast.cpp`) | 6.65 | 12.4× |

The faithful port — `std::vector<i128>` heap-allocated per op, gcd every op, mirroring the TS immutable
value type — is only **2.6×**. That's the language multiplier alone. The **4.7×** on top comes from the
*representation*: a fixed `std::array<i128,8>` on the stack (no heap per op) and deferring the
gcd-canonicalization to the read points (keys/equality) instead of every intermediate. Same story as the
Čtrnáct pruner (naive port ~15×, algorithmic fixes → 145×): a transliteration buys the language factor;
the real win needs the data layout fixed.

12.4× is the arithmetic-kernel ceiling. Whole-engine speedup will follow Amdahl on the fill's mix — large
for **star** (its hot path, `exactPolygonsOverlap`, is ~all exact arithmetic), modest for **regular k=3**
(float geometry, already algorithmically optimized in the TS).

## The `torusFill` DFS, ported bottom-up (all six sub-layers done)

The DFS is the whole enumeration engine (~20 coupled methods), and the thesis's completeness guarantee
lives inside its predicates and gates — so it was ported one helper at a time, each validated against the
TS oracle before the next built on it, then `torusFill` assembled on trusted pieces:

1. **done** — placed-polygon object (`polygon.hpp`).
2. **done** — `toVector` (baked basis) + `jsHypot`/`jsRound` + `FillCtx` + reducePolygon / canonicalRep /
   dedupModLattice / buildBlock (`vec.hpp`, `fillctx.hpp`).
3. **done** — collision predicates (`collision.hpp`).
4. **done** — `analyze` (`analyze.hpp`, insertion-ordered incidence for tie-faithful open-vertex choice).
5. **done** — certificate + primitivity + orbit gate (`certificate.hpp`, `orbitgate.hpp`).
6. **done** — `torusFill` (`torusfill.hpp`), validated END-TO-END: real seeds run through `solve` to get
   genuine cells, then each cell + a single-vertex fan of it are fed through BOTH the TS `torusFill` and
   the native one and the emitted cell SETs compared. 16 cases over 9 tilings (k=1 semiregular
   3.4.6.4 / 3.6.3.6 / 4.6.12 / hexagon incl. mixed VCs, expansion via the fan cores, **and a k=2
   2-uniform cell** so the orbit gate returns 2 — native `countVertexOrbits` matches TS at 1, 2, and null).

The one remaining coverage frontier is **star seeds**: the star tile paths in `isCompleteTiling` /
`countVertexOrbits` / `analyze` (star area, the t<3 dent-fill continue at a 2-tile point, star incidence
in the gate). Every non-star branch is exercised and byte-identical; closing the star frontier needs a
star polygon set + `buildStarPalette` fed through the same end-to-end harness.

## Adversarial verification of the soundness core (2026-07-09)

A 39-agent workflow audited the whole soundness core (layers 3–5) native-vs-TS for divergences and
un-exercised dangerous branches, then adversarially verified each finding. Result: **15 confirmed
findings, ALL coverage gaps, ZERO divergences** — the port is faithful; the risk was entirely in what
the differential test does not generate. Five cheap guard/edge branches were closed immediately (jsHypot
Inf/NaN/±0/subnormal, toVector coefficients past 2^53, latticeEquivExact det≈0 guard, dedupModLattice
class-collapse, blockOverlapPeriodic O(block²) fallback). The rest were real-tiling-shape gaps, now
closed by the layer-6 end-to-end test flowing real cells through the certificate/gate/analyze:

- **closed** — the orbit gate's multi-orbit union-find (a real k=2 cell, 3.3.3.3.3.3 + 3.3.3.3.6, makes
  `countVertexOrbits` return 2 on both sides);
- **closed** — canonicalVCName on genuinely mixed VC rings (3.4.6.4 / 3.6.3.6 / 4.6.12), regularAreaFloat
  for n=6/12 inside accepting cells, the certificate's occurringOut + opDoom OP-1 (exercised in
  `torusFill` on real cells), and the DFS `place()` expansion (via the single-vertex fan cores);
- **still open** — the star tile path across `isCompleteTiling` / `countVertexOrbits` / `analyze` (star
  area, the t<3 dent-fill continue at a star 2-tile point, star incidence in the gate): no star tiles
  enter these ops yet. Also the certificate's under-full REJECT branch (a T-junction cell whose exact
  area matches but leaves an under-covered vertex) — every invalid `cert.complete` case still dies at the
  area pre-reject first, so a slip copying analyze's one-sided threshold into the certificate's two-sided
  one would not be caught. Both need targeted constructions.

Deferred (no correctness impact): promote the fast representation (`FC` in `bench-fast.cpp`, stack
`std::array` + deferred gcd, the 12.4× ceiling) into the headers, re-gated by `make test`.

TS-side (done): the P1 orbit-floor prune is now sound for star seeds (`extendV` excludes dents) — port
the *optimized* algorithm, not the current one.

## torusFill hot-path: string keys vs arithmetic (2026-07-10)

The `torusFill` DFS bench (`bench-tf.ts`/`.cpp`, matched inputs from real solves — 12 cases over k=1
semiregular + a k=2 cell) was string-key bound. Two changes, each `make test`-gated at 100,029/100,029:

- **memoize `Poly::exactKey`** (`mutable` cache + `const&` return, mirrors the TS `_exactKey`). Poly is
  immutable after construction, so the sorted-vertex-key string is built once. **254 → ~183 ms/call sum
  (−28%).** This is the real win: the profile's "string" cost was overwhelmingly *repeated* exactKey
  rebuilds (stateKey per pop, the gate's per-patch keys), not the key format.
- **`exactkey.hpp` (`CycloKey`/`PolyKey`)** — allocation-free exact membership keys (canonical coeffs +
  byte hash, no `to_string128`), swapped into the orbit gate's `blockKeySet` / `seenBlock` /
  `transformedKey` / `reducedMappedKey` / incidence. Equality-equivalent to the decimal string (lossless
  serialization) so the orbit count is byte-identical. **~183 → ~161 (−6% more).** Only the gate paid,
  because its mapped keys are fresh per `(reflect,r,T)` and memoization can't cache them.

The same `CycloKey` swap in `analyze` (per-pop incidence) and `buildBlock` (dedup set) gave ~0 and was
reverted — those subtrees are `toVector`/`translateExact` work, not string building. Lesson: the string
bottleneck was rebuild frequency (fixed by memoization), not the decimal format (the tuple-key swap only
helps the one place memoization can't reach).

With the strings gone, a `-fno-inline` profile exposed the arithmetic underneath — `Cyclo::Cyclo`
(canonicalization) + `countVertexOrbits`' `mapPoint` + `gcd128`, plus heavy malloc/free from the
per-op `std::vector<i128>`. So the **fast Cyclo representation** (the standalone `bench-fast`'s 12.4×
kernel) was ported into the header in two byte-identical steps, each `make test`-gated:

- **stack `std::array<i128,8>`** (no heap per op), eager gcd unchanged ⇒ values identical. **~161 → ~127
  (−21%).** This is the change that gave ~0 *last* session — it only paid once memoization had removed
  the string cost that was hiding the allocation. Same idea, opposite result, because the bottleneck moved.
- **deferred gcd** — reduce mod Φ_N and the den sign stay eager, but the gcd-DIVISION is lazy (a `mutable`
  cache canonicalized on first read; every direct num/den reader — key/toVector/equals/cycloKey/the surd
  bridge/difftest — calls `ensureCanon`). **~127 → ~90 (−30%).** Bigger than expected because the frequent
  `latticeEquivExact`/`isLatticeCombo` tests resolve via `sub().isZero()`, which needs no canonical form,
  so those Cyclos never pay a gcd at all. Overflow from deferred coefficient growth is bounded (reads are
  frequent) and backstopped loudly by `OVF_GUARD` — never silent.

Net **254 → ~90 ms/call (−65%), native 4.6× → ~13× vs TS** — the torusFill DFS now runs at the
arithmetic-kernel ceiling. The other-chat prescription (pack coords into a 64-bit key, drop
rank-8→rank-4) would have been misdirected: the win was the *storage layout* (stack array) and *when* the
gcd runs (deferred), not the key width. The one remaining lever is `canonicalRep`'s lex-min scan (~14%,
`to_string128`-bound) — delicate because it is defined by decimal-STRING order, so cheapening it needs a
comparator that reproduces that order.

## Build

```sh
make            # difftest
make test       # regenerate the TS oracle trace + check the native port byte-for-byte
make bench      # three-way arithmetic benchmark
```
