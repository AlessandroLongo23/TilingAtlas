# develop is ~120x faster and every record is unchanged — 2026-08-21

AL: *"Focus on optimizing the develop phase. I challenge you to bring it down to the minimum possible:
when you think it's enough, keep pushing."*

| | before | after |
|---|---|---|
| k=4 develop, 8–10 workers | 3065 s | **19–30 s** (thermal-dependent; ~25 s typical) |
| k=3 develop | 836 s | **5 s** |
| one 88-block shard, single process | 531.9 s | **3.9 s** |
| single-process CPU, all 1169 k=4 blocks | — | 76–89 s |

**Nothing about the output changed.** k=1, k=2, k=3 and k=4 all re-develop to the same solids — at k=4,
111 records and 104 congruence classes, zero lost, zero gained. k=3 drops exactly the one pinched record
the Euler gate now rejects, by design. `check-regular`, `check-star` and `check-deltahedra` all pass.

## Where the time was

Profiling first, and the answer was extreme concentration: **12 of 88 blocks were 94% of a shard**, every
one of them failing with "no dihedral solution". Those are the blocks that stall corner propagation and
fall back to `solve_joint`, which runs a **3000-start multistart Newton per branch**. One such block
called `_mul` **eleven million times**. The arithmetic is trivial; the cost was Python dispatch, three
million times over.

```
_mul          11,058,900 calls   6.7 s   41%
link_product   2,764,725 calls   3.4 s        (11.6 s cumulative)
_newton            3,000 calls           16.5 s cumulative — the whole block
```

## The five changes, each measured on the full k=4 run

**1. The multistart is one array, not a loop.** 3000 starts are independent, so they run as one batched
Newton with each candidate's control flow in a mask instead of a `return`. Same seeds, same 0.999
improvement rule, same 8-stall bail, same trust radius, and the dedup still runs in start order so the
same representative root survives. **3065 s → 210 s.**

**2. The Jacobian is analytic.** Forward differences cost one extra residual evaluation per unknown, and
these systems have ten or eleven — so the link chain was walked twelve times per step to learn what one
walk knows. For a chain M = G₀…G_{L−1}, dM/dθⱼ = Pⱼ · dGⱼ · Sⱼ, so prefixes and suffixes accumulated once
give every column for two more matmuls. **210 s → 60 s.**

**3. The layout is (3,3,N), not (N,3,3)**, above a threshold. That makes each matrix *entry* a contiguous
vector and the product nine fused multiply-accumulates over long arrays instead of N tiny 3×3 GEMMs:
103.6 µs → 31.7 µs at N=3000. The zero first column of dG/dθ takes two of the three derivative products
down to two-thirds the work. **60 s → 30 s.**

⚑ The crossover *in isolation* is a few hundred candidates; *end to end* it is nearer 1024. Trusting the
microbenchmark would have set it three times too low.

```
_EXPLICIT_MIN   128    512   1024   1536   2048   2900   off
88-block shard  4.70   4.57  4.47   4.47   4.50   4.57   4.90 s
```

**4. Normal equations, then Cholesky, instead of pinv.** pinv is an SVD per candidate and was 42% of the
profile for a 30×11 least-squares solve. JᵀJ is symmetric positive definite wherever J has full column
rank, and Cholesky with written-out triangular solves beats LAPACK's per-matrix dispatch at every size
this solver produces (k=2000: 475/233 µs at nx=4, 1566/990 at nx=11, 4018/3310 at nx=22).

**5. A work queue, not a static split.** Block costs are pathological, so *no* static assignment works.
With the best one I could write — longest-processing-time-first on block counts — three of ten workers
ran 27 s and the other seven finished in 0 to 9 s. Handing blocks out one at a time needs no prediction:
the floor becomes the single most expensive block, which is now 1.1 s. **30 s → 19–25 s.**

## Two things I checked before changing, and did not change

**The budget.** With ten unknowns, 3000 random starts in a 10-dimensional space looked like a lottery
worth cutting. It is not. Measured across every joint solve at k=2, k=3 and k=4:

| unknowns | 4 | 6 | 8 | 10 | 12 | 16 | 20 |
|---|---|---|---|---|---|---|---|
| roots found (k=4) | 12 | 619 | 20 | 20 | 77 | 0 | 1 |

It finds roots at every count up to 12, and 82 of them at 16 unknowns at k=3. The budget stays exactly
as it is; this was the one change that would have cost solids.

**The normal equations' failure mode.** They square the condition number, so a rank-deficient Jacobian
gives a step where `lstsq`'s minimum-norm solution would have stayed small — and a nan step has a nan
norm, so `sn > 0.5` is False, the trust radius never fires, and the candidate walks off to nan. A real
behaviour change, and it announced itself as overflow warnings the scalar path never produced. The fast
path is kept for the candidates it is valid for and the rest fall back to pinv.

## ⚑ A false positive worth naming: Accelerate raises FP flags it should not

`Jt @ J` reported "divide by zero", "overflow" and "invalid" on input that cannot produce any of them.
Verified false three separate ways: every J finite and bounded by 2, `max|JᵀJ| = 17.35` over 240 calls
with zero non-finite results, and the same warnings reproduce on **pure random data**. numpy here is
built against Apple's Accelerate, whose vectorised kernels set FP flags from masked SIMD lanes; clearing
the status register first does not help, because Accelerate sets it inside the call. Suppressed narrowly
around those two contractions, with the actual value check left in place as the guard.

## What did NOT work, measured

**Vertex batching — reverted.** Stacking a block's five links into (V,3,3,nmax) buffers cuts the numpy
call count fivefold, which is the right instinct for a dispatch-bound loop. It measured **5.1 s against
3.9 s**. It also multiplies the working set by V: one vertex's buffers are about 3.5 MB and stay in L2
across a whole Newton run, five vertices' are 30 MB and do not. Dispatch was not the binding constraint;
cache was.

**Two micro-optimisations that are slower than what is already there**, both measured rather than assumed:

```
convergence norm   max(abs(R))     27.6 µs      max(max, -min)   39.7 µs
Jacobian scatter   six strided +=   8.7 µs      one (n,6) +=     23.9 µs
```

**Contiguous JᵀJ.** `J.transpose(0,2,1) @ J` on the transposed *view* is 1512 µs at k=3000; copying it
contiguous first is 3200 µs. BLAS takes the transpose as a flag; the copy is pure loss.

**Splitting residual and Jacobian** so the Jacobian is computed only for candidates that survive the
step. Only ~6% die per step, and the split costs a second walk of the chain: 3 + 10×0.93 = 12.3
matmul-equivalents against 11. Worse on paper, so not built.

## Where the floor is

The remaining profile is 44% link kernel, 34% least-squares, 9% Newton masking. The kernel is 243
multiply-accumulates per link per step, numpy's stacked matmul is already the fastest option measured,
and the least-squares path is BLAS plus a Cholesky that beats LAPACK. 831 of 1169 blocks now finish in
under 0.1 s and the worst single block is 1.1 s.

Wall time is now bound by the machine, not the code: 76–89 s of single-process CPU against ~19–25 s wall
is about 4× effective parallelism on a 4-performance-core, 6-efficiency-core machine. Going meaningfully
further means C, or changing what is computed — and what is computed is exactly what must not change.

## The harness

`tools/ctrnact-oracle/bench/` is tracked; its block sets are gitignored and rebuilt by `bench/setup.sh`.

- `run.sh <set>` — single-process timing plus a hash of the realized records, which must never move
- `verify_k4.sh` / `verify_all.sh` — full equivalence against the shipped output at every k
- `per_block.py` — the per-block cost distribution that found the 12-of-88 concentration
- `prof.py` — cProfile entry point
- `joint_yield.py` — the multistart yield probe that saved the budget from being cut

---

# The star developer: 11x, and the three tracks it completes

AL named the three searches this pipeline exists for. They do NOT share a developer, and the k=4 work
above only touched one of them:

| track | palette | developer | completeness |
|---|---|---|---|
| **1. Johnson** — convex, regular polygons | `spherical` | `develop_euclid` | proven (Zalgaller) |
| **2. non-convex, regular polygons** | `spherical` | `develop_euclid` | nothing published |
| **3. non-convex, regular + stars** | `star-*` | `develop_spherical` | k=1 published; k≥2 open |

⚑ **Tracks 1 and 2 are one search.** Same palette, same run, same blocks — the convex records go to
`johnsonSolids.ts` and the reflex ones to `nonconvexSolids.ts`. Track 1 is the *oracle* for track 2: the
Johnson solids have a published complete list, so reproducing them is what licenses believing the
non-convex records that fall out of the same search. Optimising `develop_euclid` served both at once.

**Track 3 is a different algorithm and got none of it.** `develop_spherical` solves for a single edge arc
ρ and flood-fills on S² — no multistart, no ten-unknown Newton, no least squares. Its profile has nothing
in common with `develop_euclid`'s.

## Where its time was

```
builtins.round   19,766,830 calls   8.16 s   34%
_key_inst         2,460,868 calls   3.89 s        (9.86 s cumulative)
develop_sphere          868 calls   2.91 s        (24.12 s cumulative)
vid_of            1,667,204 calls   2.47 s
```

The flood fill's two hash tables, and **almost none of it was the rounding**. `R @ ZHAT` is a numpy
matvec against a *basis vector* — column 2 and nothing else — and every `R[i,j]` after it returns an
`np.float64` whose `__round__` is far slower than a plain float's.

```
R @ ZHAT (current)   2.95 us/key
R[i,j] direct        2.28
R.tolist()           0.47      ← adopted
flat 9-tuple         0.37      ← would need frames refactored throughout
```

| | |
|---|---|
| unbox frames once with `.tolist()` before keying | 18.7 s → 8.9 s |
| cache `Rz(alpha)` as a matrix, not just the angle (it was rebuilt 1.3M times) | 8.9 s → 6.1 s |
| `interior_angle`: three vertices in plain floats, not a whole p-gon in numpy | 6.1 s → 4.9 s |
| the star runs onto the work queue (they were single-process) | 4.9 s → **1.7 s** |

## ⚑ The trap in moving the star runs onto the queue

`develop_spherical.run()` **collapses geometric duplicates and sorts** before writing — a doubled vertex
word like (5,5,5,5,5,5) develops to the same dodecahedron as (5,5,5), and shipping both would inflate a
catalogue whose k=1 count is meant to be checkable against a published one. The sharded driver merged
per-worker records and did *neither*. Routing a star search through it would have shipped a larger,
unordered catalogue that looked perfectly fine.

The collapse is `finalise_records()` now, called by both paths, and single-process against 10-worker
output is verified identical.

## Bit-exactness, verified per change

Every change was checked before it went in, because ρ is refined with these very functions and the
developer places geometry with the ρ they return:

- `R @ ZHAT` ≡ column 2, and `math.sqrt(x²+y²+z²)` ≡ `np.linalg.norm` — 100,000 rotations, zero diffs
- `interior_angle` scalar rewrite — 6,800 (p, d, ρ) combinations, zero diffs
- the benchmark record hash unchanged throughout, and all four `check-star` goldens matching

## What I declined here, measured

**Precomputing `Rz(alpha) @ M`** is worth 20% and reassociates `(R·A)·B` to `R·(A·B)`. Matmul is
associative in mathematics and not in floating point: 3.9e-16 worst over 60,000 triples, which is 4e-10
of the 1e-6 key quantum — small, not nothing, and unnecessary. Reusing the half-product the flood fill
has already formed gets the same speed with the association untouched.

**Frames as flat 9-tuples throughout** would take another ~14%. The scalar 3×3 product differs from
numpy's in 97.6% of cases at the last ulp, which would move every stored vertex coordinate. Declined.
