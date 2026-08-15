# Regular polygons + period-3 equilateral tiles: is that palette tractable? (2026-08-07)

AL asked directly. The answer is **yes to k=3, at roughly 50-70 CPU-hours, and no further** — against k=9 for
stars on the same engine. The cost is not incidental to the tiles: a single period-3 tile switches off
four optimizations at once, and a period-2 palette of the same size, with those optimizations forcibly
disabled, costs the same as the period-3 one. That is the whole finding.

## What the family contains

An equilateral polygon whose interior-angle word has period p is a p·n-gon with angles (a₁…a_p) repeated
n times. Closure is free for n ≥ 2: one period advances the edge direction by a fixed 360/n, so the
boundary is s·(1 + w + … + w^(n-1)) with w a primitive n-th root of unity, and that geometric sum is 0.
The only arithmetic condition is that the angles sit on the grid, sum(a) = (D/2)·p − D/n, so n divides D.
Simplicity is the part that is not free, and `alphabets/enum_period_tiles.py` tests it explicitly by
walking the boundary and checking every segment pair.

The parameter reproduces what the palettes already carry. p=1 gives the six regular polygons on the ζ₂₄
grid ({3,4,6,8,12,24}); p=2 gives exactly the 12 convex isotoxal tiles and the 42 concave star species,
which is `isotoxal-full-z24`'s 60 = 42 + 12 + 6 regular. That agreement with a list derived by hand last
session is the enumerator's validation.

| p=3 at D=24 | convex | concave | total |
|---|---|---|---|
| hexagons (n=2) | 11 | 18 | 29 |
| 9-gons (n=3) | 5 | 40 | 45 |
| 12-gons (n=4) | 2 | 51 | 53 |
| 18-gons and larger | 1 | 239 | 240 |
| **all** | **19** | **348** | **367** |

A further 23 closing angle-words are excluded because their boundary crosses itself, which makes them
polygons but not tiles (AL directive, 2026-08-07). The angle-sum condition does not catch these: it forces
turning number 1 for every word that closes, so only the segment test in `is_simple()` separates them.
Each is one very reflex corner (240-345°) against two sharp ones. Two checked by hand: [330,15,15] has its
edge 1 crossing its edge 3 at (0.583, −0.241), and [240,60,60] revisits (1,0) as its fourth vertex, a
pinch. They are excluded by default now; `--include-selfint` brings them back for inspection. At p=2 there
are none, which is consistent with all 42 isotoxal star species being simple concave polygons.

The full 367-tile set is still out of the question: `isotoxal-full-z24` at 60 tiles never finished
generating in 86 minutes. The 19 convex tiles are the palette worth testing, and `equi3-cx-z24` is regular
{3,4,6,8,12} plus those 19. No measurement below changes, since that palette was convex-only throughout
and regenerates byte-identical after the exclusion.

Smallest corner in the convex p=3 set is 2 units (30°, from the [165,165,30] hexagon), so this palette is
milder at the sharp end than convex isotoxal, which reaches 1 unit.

## Generation is not the wall

`equi3-cx-z24` builds in 68 seconds: 106,266 vertex configs, 112,452 entries, a 44.3 MB `tables.bin`. No
compile pressure either, now that the alphabet loads at runtime. This is the first palette extension in a
while where the alphabet was never the problem.

For contrast, the `isotoxal-cxfull-z24` gate that had been running since the previous session finished at
**3,791,295 configs** and a 1.97 GB `solver_tables.inc`, 3.2x my projection and far past what `g++`
accepts. Runtime loading is what makes it buildable at all.

## The wall is `BUCKET_OK`, and period 3 breaks it by construction

`eu_solver.cpp:1374-1376` sets `BUCKET_OK` only when `CLASS_PREV == CLASS_NEXT` and `NEXT` is an
involution. A period-3 tile's three corner classes cycle c₀→c₁→c₂→c₀, so `NEXT` is a 3-cycle and the test
fails. One such tile anywhere in the palette fails it for the whole palette.

That flag gates four things: the static face filter (`face_filter`), the pair filter (`build_okpair`), the
dynamic face-closure filter (`dyn_build`), and the candidate bucketing, which falls back to `FULL_ALL`, a
scan of all 112,452 types at every node. The period-3 runs print no `face filter` or `OKPAIR` line at all.

### The size-matched control

`isotoxal-star-z24` plus the 45/135 rhombus lands at 106,359 configs against `equi3-cx-z24`'s 106,266, a
0.09% difference, with every tile at period ≤ 2. Both were run at k≤2 sharded N=480, D2=8.

| k≤2 | vertex types | face filter | CPU | raw blocks |
|---|---|---|---|---|
| `isotox-cx45-z24` (p≤2) | 111,220 | 66,328 live, 44,892 killed | **257s** | 1,892 |
| `equi3-cx-z24` (p=3) | 112,452 | never runs | **~6,820s** (from 395/480 shards) | — |

### Attribution: it really is the flag

`EU_NOBUCKET` (added this session) forces the fallback path on a palette that qualifies for the fast one.
It only ever turns optimizations off, so it cannot lose a tiling, and it is verified output-identical on
regular k≤4: 427 blocks, digest `b3c3a1ed161ff3d5` both ways. `make check-regular` still passes.

Ten shards of the control palette, same harness, wall-clock: 10s normally, **156s with `EU_NOBUCKET=1`**.
Netting out per-process startup and scaling to 480 shards gives ~7,250s, against 257s measured for the
real fast path. The period-3 palette's ~6,820s sits inside that range. So a period-2 palette with the flag
forced off costs what the period-3 palette costs, and the tiles themselves explain none of the gap.

⚑ One caveat on the pairing. With D2 > 1 the depth-2 branch counter advances only over surviving branches,
so filtering changes which work lands in which shard index. Per-shard block counts are therefore not
comparable across the two configurations (10 vs 11 over the sample), and the comparison is between matched
samples, not matched shards. Totals over all 480 shards are unaffected.

## The gap widens with k

Same two shards, same tables, only `MAXNUM` differs:

| shard (N=480, D2=8) | k=2 | k=3 | factor |
|---|---|---|---|
| `equi3-cx-z24` w=0 | 10s | **338s** | 34x |
| `equi3-cx-z24` w=48 | 10s | **361s** | 36x |
| `isotox-cx45-z24` w=0 | <1s | **1s** | — |
| `isotox-cx45-z24` w=48 | <1s | **1s** | — |

The control's k=3 numbers are at the resolution floor of a 1-second clock, so read them as "under two
seconds", not as a precise ratio. What they establish is the shape: the control absorbs the k=2→k=3 step
almost for free, and the period-3 palette pays 35x for it.

Full k=3 for `equi3-cx-z24` is then 480 x ~350-500s = **47-66 CPU-hours**, about 5-7 hours wall on ten
cores. That is an overnight run, so k=3 is reachable. Another 35x step puts k=4 near 2,000 CPU-hours,
roughly eight days on this machine, which is not.

## What is already known at k=1

`equi3-cx-z24` gives 56 raw blocks in 0.24s, **55 tilings** after pruning. All of them come from the
hexagons: restricting the palette to the 11 convex p=3 hexagons (`equi3-cx6-z24`, 64,754 configs)
returns the same 56 raw, so the 9-, 12- and 18-gons contribute no 1-uniform tiling. The control gives
172 raw.

⚑ SUPERSEDED 2026-08-08 — the cost verdict below, not the enumeration. The 4-bucket union removed the
`BUCKET_OK` wall entirely: k=2 on this palette went from ~6,820s to **3 seconds**, same catalog
(377 raw blocks, digest `0fbc3356d3fecf5c`, checked against a full sharded run of the old binary), and
the k≤2 catalogue is **299 tilings** (55 + 244). Everything measured here about WHY it was slow stands;
the conclusion that k=3 was the practical ceiling does not. See
`experiments/results/4bucket-union-2026-08-08.md`.

## What would move it

The code already names the fix. The comment at `eu_solver.cpp:1371-1373` says a palette breaking the
involution "would need the 4-bucket union": with PREV ≠ NEXT the admissible (A,B) pair is no longer unique,
so the lookup takes the union of {NEXT,PREV} x {NEXT,PREV} instead of one bucket, merged in ascending
(type, rep) order to preserve emission order. That restores the candidate bucketing.

The three filters are separate work and harder. Each builds a successor relation keyed by `cand_key` and
walks it per `CLASS_NEXT` orbit; with a 3-cycle the orbits are larger and the "exactly c−1 steps" identity
needs re-deriving, not just re-indexing. The `dyn_build` comment records what happens when that identity
is wrong on a palette: composite-convex silently lost 141 of 288 tilings at k≤2.

So this is four generalizations, of which one is mechanical and three need proof. Worth it if period-3
tilings are a target in themselves; the same work also unblocks composite-convex, composite-decomp, and
every scaled palette, all of which are stuck at k≤3 for exactly this reason.

## Incidental findings

- `make eu_solver_rt MAXNUM=n` silently no-ops, because the runtime-solver rule has no `.maxnum` stamp
  dependency, unlike `eu_solver`. Same class of bug the Makefile already documents at length for the
  compiled path. Compile explicitly until it is fixed.
- The concave p=3 tiles get no point-adjacency lemma: `is_point` is set only for `star`-kind tiles, and
  these are `composite`. They fall back on `forbidden_adjacent_pairs`, the geometric generalization, which
  covers them but only pairwise. That matters for any future attempt at the 348 concave tiles, not for the
  convex palette measured here.
