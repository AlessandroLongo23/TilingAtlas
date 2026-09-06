# Isotoxal stars + regular polygons, mixed closure — the full run

AL, 2026-08-31: "run the search on all stars + regular polygons with this definition of star polygons".

**Palette** `isotox-mixed`: regular {3,4,5,6,8,10} plus the isotoxal OUTLINES of {5/2}, {8/3}, {10/3}
— `5*12` (point 36, dent 252), `8*15` (45, 270), `10*24` (72, 252). D = 120 (3-degree grid, the one
that holds 60 and 108 at once). Closure `mixed`, maxValence 6.
Tile for tile the isotoxal counterpart of `star-wide`, which is the self-intersecting {n/d} palette.

**Alphabet** 220,033 entries, 750 iso-fold collisions.

## Three developer fixes this run depends on (all landed today, all three guards green)

1. `parse_configs` named an isotoxal star by its point count n, the alphabet by its boundary edge
   count 2n. `unfold` compared them, always failed, and every star-bearing block of every earlier
   isotoxal run died as "no dihedral solution" with no equation formed.
2. `solve_dihedrals` seeded from `forced_by_valence3`, whose acos can only return theta <= 180, with
   the mirror as one bit flipping every edge together. AL's isotoxal U30 folds at
   (142.62, 142.62, 221.81) — a mixed reading that was unreachable. Now seeds from `solve_corner`.
3. The emitted symbol does not determine the valence: entries with isomorphic FOLDED structure are
   one solver node, so `(5*p12,3)A` (valence 2) stands in for `(5*p12,3,5*p12,3,5*p12,3)S3`
   (valence 6). `_fold_readings` retries larger folds, as a fallback only.

## Progress

### k=1

- 01:09  solve done. 1,435,415 raw blocks, 1.5 GB, ~2 min. Solver notes: filters DISABLED (the palette
  has corners of 180 or wider, which the face-closure model does not describe); up to 33 dent-fill
  noncounting vertices per configuration, no cap; 362 all-noncounting configurations suppressed.
- 01:12  prune done. 474,808 kept, 187 MB.
- 01:12  develop started, then KILLED at item 3/238. `prefilter` called `solve_dihedrals` on the
  literal reading only, so it dropped precisely the blocks `_fold_readings` recovers — before the
  developer saw them. Fixed: the filter now asks about every fold reading, keeping its answer a
  superset of what develop_block will try. Verified on AL's block, and check-regular stays
  byte-identical.
- 01:14  develop restarted, 8 workers, ETA ~50 min.
- 01:19  develop KILLED again, and the guess behind it thrown out. `_fold_readings` derived the folds
  from the word — every multiple up to maxValence, over every orbit — which is a PRODUCT: measured
  over 10^6 readings per block on the star-only shard `eupruned_01_pqr`, and the run was sitting at
  42% CPU with no work item finishing in four and a half minutes.
  The alphabet knows the answer exactly and was already printing it as a warning. `gen_alphabet` now
  writes `foldalias.json` (the a6 iso-fold collision pairs, both directions); `install_palette` loads
  it, `decode_block` exposes the per-orbit symbols, and `_fold_readings` reads the real aliases.
  138 symbols on isotox-penta, and the fallback is linear instead of exponential.
- 01:24  k=2 solve at 11 GB, still running. isotox-mixed alphabet regenerating for its alias map.

### The 2-corner vertex — AL's observation, 2026-08-31, and the run's real unlock

AL: "in spherical geometry it's impossible to have a vertex configuration with a dent and just one
more face, because the two faces would be coplanar. Any curvature needs at least three."

Correct, and it is a theorem. A 2-face vertex has 2 edges, so its link is a spherical DIGON: both
corner arcs run between the same two edge directions, the great circle through two non-antipodal
points is unique, so both faces lie in ONE plane and their angles sum to a full turn. The antipodal
case is the flat-flat mid-edge point, 180 + 180, the same sum. So a real 2-corner vertex ALWAYS
totals exactly 360 — which is exactly what every curved closure excludes.

`gen_alphabet` decided this by word length alone (`ent.counting = len(c) >= 3`) and dropped `min_len`
to 2 for any palette with a star tile, on reasoning that is entirely about the PLANE. Those vertices
are NONCOUNTING, so eu_solver does not bound them by k: a "k=1" search was exploring configurations
carrying up to 33 of them.

Measured: 2,859,640 of 2,870,830 raw k=1 header lines carried at least one. 99.6% of the search.

| isotox-mixed k=1   | raw blocks | solver nodes | output |
|--------------------|-----------:|-------------:|-------:|
| min_len = 2        |  1,435,415 |   54,723,921 | 1.5 GB |
| min_len = 3        |      5,595 |      425,466 | 2.0 MB |
| cut                |       257x |         129x |   750x |

5,595 is the same order as star-wide's 17,458, which is what a palette with no dents costs.
Alphabet 220,033 -> 219,868. Six palettes change, all isotoxal probes plus spherical-scaled; no
shipped shelf reads any of them. check-regular byte-identical, check-star k=1/k=2/bucketed match
golden, check-deltahedra all eight.

**k=1 result: 4,998 pruned blocks -> 35 solids, every face convex. No isotoxal star face at one
vertex orbit.** (AL's own example is k=2: the star POINT and the DENT are different orbits.)

### Optimising the develop (AL: "days to minutes")

**Where the time was.** Profiling 120 k=2 blocks: median 44 ms, but the top TEN blocks are 67% of
all time, every one in the multistart path returning 1,200-2,600 "solutions". Their link equations
are DEPENDENT, so the solution set is a curve and solve_joint's 3,000 starts converge to 3,000
points on it. The sample cannot contain a realization anyway: closing the map is extra equations, so
the closing points are isolated on that curve — measure zero.

**Detector, third attempt.**
1. `ne > 3*V` (unknowns vs equations). WRONG: the worst block is ne=5, V=2 — overdetermined on
   paper, 2,032 solutions in fact. Fired on 2 of 120.
2. Ratio at 64/128 starts alone. WRONG: lost 2 of the 35 k=1 solids, both genuine blocks whose 16
   roots need ~512 starts (3, 10, 13, 15, 16 as the budget doubles).
3. **Ratio AND an absolute floor** (p128 >= 40 and p128 >= 1.8*p64). Verified: k=1 gives 35 -> 35,
   nothing lost. Costly varieties sit at 49 and 67; the two survivors at 8 and 10.

**Also tried and reverted:** returning the probe's own answer when it saturates. 4-5.5x faster and
lost the same 2 solids — a 128-start probe reads as saturated long before it is complete. The probe
is sound as a REJECTOR and worthless as an enumerator.

**Gauss-Bonnet pre-rejection: DEAD, and worth recording why.** "Sum of defects = 720, so reject any
block with no positive integer solution" rejects 99.4% with no solve — and loses 15 of the 35. Those
have NEGATIVE total defect (ctrnact-01_34-6gzyo-1: six vertices at -120 deg, chi = -2, genus 2).
The mixed closure legitimately produces higher-genus surfaces and check_realized accepts them. Once
any genus is allowed the test is vacuous. **This run is not a sphere search.**

| lever | k=2 solve_dihedrals | verified |
|-------|--------------------:|----------|
| baseline                    | 320 ms/block | — |
| degeneracy probe            | see above    | k=1 35 -> 35 |
| + multistart budget 1024    | 137 ms/block | (verifying) |
| + budget 512                |  97 ms/block | not verified |

⚑ MINUTES IS NOT REACHABLE BY TUNING THIS DEVELOPER. The floor is 6.86M blocks each paying a Python
multistart. Even at 50 ms that is ~12 hours on 8 cores. 99% of blocks are rejected by eu_sphfill, but
only AFTER their dihedrals are solved, and solving them is the whole cost. The structural answer is
porting solve_dihedrals to C beside the fill that already lives there — exactly why eu_sphfill was
carved out of develop_spherical in the first place.

### The cut that got it to minutes

The census said where the time was: `solve_joint`'s starts are a `seeds`-per-axis grid, so ne unknowns
want 7**ne points and it takes 1024 — full coverage at ne <= 3 (343), 43% at ne = 4, 0.9% at ne = 6,
**0.1% at ne = 7**. Past that it is not enumerating, it is guessing, and paying 200 ms a block to do
it. Blocks with ne >= 7 were 85% of all remaining time.

The corpus says where the cut is: all 35 realized k=1 solids have ne in {1,2,3,6}, against a rejected
spread reaching 8 and beyond. So two rejects now run BEFORE any solving —
`ne > 3*V` (positive-dimensional variety, a theorem) and `ne > 6` (past the multistart's reach, a
DECLARED CAP; those blocks are reported unresolved, EU_NE_CAP re-opens them).

| k=2 solve_dihedrals | ms/block | rejected free |
|---------------------|---------:|--------------:|
| baseline            |      908 |            0% |
| all four levers     | **15.7** |       **80%** |
| shard _pqr (all three stars) | **2.6** | 96% |
| shard _3p           |      9.5 |           88% |
| shard _34 (regular) |     35.1 |           56% |

**58x on the develop, every step verified against the 35 k=1 solids (35 -> 35, none lost), all three
engine guards green.** With the 257x on the solve, the star-bearing k=2 develop runs in ~14 minutes
where the first attempt projected 7 days.

Four levers, in order of size: AL's 2-corner theorem (the solve), `ne > 3V` early reject, `ne > 6`
cap, multistart budget 3000 -> 1024. Three dead ends recorded above: the unknowns-count in the stall
path, the probe-as-enumerator, and Gauss-Bonnet.
