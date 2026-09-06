# Making the isotoxal-star spherical search tractable — 2026-08-31

AL's goal: the full isotoxal search (regular {3,4,5,6,8,10} + all 11 isotoxal outlines on the
D=120 grid, mixed closure, maxValence 6, k <= 2) is currently priced in the hundreds of hours.
Bring it down. Log is appended as measurements land.

## Baseline (all SERIAL, one core, this machine: 10 cores = 4P + 6E, 24 GB, 225 GB free)

| palette | stars | corner classes | vertex types | solver nodes | solve wall | raw blocks | tables.bin |
|---|---|---|---|---|---|---|---|
| isotox-cmp8-2 | 1 | 8 | 28,549 | 432,679,770 | — | — | 11.0 MB |
| isotox-pair5-6 | 2 | 10 | 87,121 | 1,643,745,026 | ~4 min | 8,525,931 | 34.9 MB |
| isotox-mixed | 3 | 12 | 219,868 | 5,972,399,935 | ~15 min | 10,059,930 | 90.1 MB |

Develop is already fast (15.7 ms/block, ~80% rejected free by the eu_sphfill prefilter; a
154,221-block develop finished in 23 s over 8 workers). The cost is SOLVE.

## Measurement 1 — the alphabet size law

Under `mixed` closure `enum_configs` applies NO angle bound (`ok = True` on the mixed branch,
gen_alphabet.py:686), so a vertex configuration is any cyclic word of length 3..maxValence over the
corner classes with sum != D and no two adjacent star POINTS. That makes the alphabet

    entries ~ C^V / (2V)     C = corner-class count, V = maxValence

Modelled exactly by transfer matrix (scratch script, no adjacency approximations) against the three
measured points:

| palette | C | model (configs) | measured (entries) | ratio |
|---|---|---|---|---|
| cmp8-2 | 8 | 23,681 | 28,549 | 1.21 |
| pair5-6 | 10 | 77,217 | 87,121 | 1.13 |
| mixed | 12 | 201,791 | 219,868 | 1.09 |
| **full 11-star** | **28** | **19,437,273** | **~21M projected** | — |

So the full alphabet is ~21M entries, not the 13.1M previously estimated. Word-length split for
C=28: L=3 14,450; L=4 369,631; L=5 8,985,877; **L=6 221,880,906 — 95.9% of all words.**

The 11 outlines and their corner angles in D=120 units (1 unit = 3 deg):

    5*12  pt 12 dent 84    6*20  pt 20 dent 80    8*30  pt 30 dent 75    8*15  pt 15 dent 90
    10*36 pt 36 dent 72    10*24 pt 24 dent 84    10*12 pt 12 dent 96    12*40 pt 40 dent 70
    12*30 pt 30 dent 80    12*20 pt 20 dent 90    12*10 pt 10 dent 100

plus the six regular corners 20, 30, 36, 40, 45, 48. 28 classes, 11 of them points.

## Measurement 2 — the vertex-link polygon inequality is NOT a lever

The vertex link is a closed spherical polygon whose i-th vertex pair is at spherical distance
d_i = min(alpha_i, 360-alpha_i), so `max d_i <= sum of the others` is necessary. Counted over all
multisets of the 28 classes:

    L=3: kills   672 of     4,060 multisets (16.6%)
    L=4: kills   376 of    31,465 multisets ( 1.2%)
    L=5: kills    59 of   201,376 multisets ( 0.0%)
    L=6: kills     0 of 1,107,568 multisets ( 0.0%)

It bites only at valence 3, which is 0.006% of the words. Sound, and worth having, but it does not
move the number. Recorded so it is not proposed again.

## Open levers being priced

1. The static filters (face_filter / build_okpair / dyn_build) are DISABLED on every isotoxal
   palette because a star dent is >= 180 deg (eu_solver.cpp:1919). On star24full the face filter cut
   60,927 vertex types to 2,372. gen_alphabet.py:1548 forces min_len=3 on every curved closure, so a
   curved alphabet has NO 2-valent vertex types — the condition the gate actually cares about.
2. Every isotoxal run so far was serial. run-oracle-parallel.sh documents an 8.58x ceiling.
3. Solver hot path and compiler flags (Makefile builds at plain -O2).
4. I/O: pair5-6 wrote 3.8 GB raw for 8.5M blocks (~450 B/block); the full run projects past the
   225 GB of free disk.
5. Whether the point-adjacency lemma is even VALID under mixed closure — its proof ends "the two
   corners alone exceed 2pi around w: the tiles would overlap", but a vertex past 2pi is exactly a
   legal SADDLE. If it is invalid the search has been losing solids, and that outranks speed.

## Measurement 3 — `vertex_polygon_filter.py` is UNSOUND and would delete every solid we have

The shipped prune (`tools/ctrnact-oracle/vertex_polygon_filter.py`, and the ⚑ note in
DEVELOPMENT_NOTES around line 17047) tests `max(alpha) < sum(alpha) - max(alpha)` on the RAW face
angles. That is the wrong reading of the polygon inequality. The link of a vertex is a closed
spherical polygon whose consecutive vertices are the EDGE DIRECTIONS, and the spherical distance
between two edge directions is `min(alpha, 360-alpha)` — never more than 180 degrees — because a
reflex face contributes the MAJOR arc of its great circle, not a distance of 252 degrees. The metric
triangle inequality then gives the correct necessary condition:

    max_i min(alpha_i, 360-alpha_i)  <=  sum_{j != i} min(alpha_j, 360-alpha_j)

Run both rules over the six solids the shelf already ships (angles read from their coordinates, a
dent recovered by the alternating-radius test):

| solid | V | F | vertices RULE A rejects | vertices RULE B rejects | worst vertex |
|---|---|---|---|---|---|
| iso-20-30-12 | 20 | 12 | 10 | 0 | 252, 90, 90 |
| iso-20-40-22 | 20 | 22 | 10 | 0 | 252, 60, 60 |
| iso-32-48-18 | 32 | 18 | 16 | 0 | 270, 90, 90 |
| iso-40-60-22 | 40 | 22 | 20 | 0 | 252, 90, 90 |
| **iso-80-150-72** (AL's U30 analogue) | 80 | 72 | **60** | 0 | 252, 60, 60 |
| iso-120-240-104 | 120 | 104 | 60 | 0 | 252, 90, 90, 60 |

Rule A deletes all six. Its recorded verification — "4,000 rejects developed in full, 0 would have
realized" — was run on 2026-08-30, BEFORE the four developer bugs were fixed, when every star-bearing
block returned "no dihedral solution" whatever it contained. The verification measured the bug.

Rule B is sound and exact, and it is worth wiring into `enum_configs` for its own sake, but it is not
a speed lever: 16.6% of valence-3 multisets, 1.2% of valence-4, 0.0% of valence-5 and valence-6, and
valence 6 is 96% of the alphabet.

## Measurement 4 — `build_type_families()` was QUADRATIC, and it was the whole wall

`eu_solver.cpp:1193` assigned each vertex type its vertex-figure id by a LINEAR SCAN over every
figure seen so far. Cost is `types x figures` string comparisons, and this alphabet is the worst case
the scan can meet: almost every vertex type is its own figure (207,589 figures over 219,868 types on
isotox-mixed; 80,345 over 87,121 on pair5-6), so the scan never gets to reuse anything.

Measured, empty shard (`EU_SHARD_N=1000000 EU_SHARD_W=999999`, so zero search — this is pure fixed
cost paid before the DFS starts):

| palette | vertex types | BEFORE | AFTER |
|---|---|---|---|
| isotox-cmp8-2 | 28,549 | 0.33 s | — |
| isotox-cmp12-2 | 55,329 | 1.11 s | — |
| isotox-pair5-6 | 87,121 | 2.76 s | **0.09 s** |
| isotox-mixed | 219,868 | 17.60 s | **1.02 s** (0.19 s user) |
| isotox-full11 (projected) | ~27,000,000 | **~82 hours** | ~25 s |

The fit is exactly quadratic: 0.33 s at 28.5k types predicts 19.6 s at 219.9k against 17.6 s
measured. At 27M types it is 7.3e14 comparisons, about 82 hours — **paid independently by EVERY SHARD
PROCESS**, so the pooled 320-shard run this machine wants would have spent 320 x 82 h / 10 cores =
109 days in one string loop before expanding a single search node. That, and not the search, is why
the full run priced out at hundreds of hours.

Fix: `std::unordered_map<std::string,int>` with ids assigned in first-seen scan order, so `TYPE_FAM`,
`NFAM` and every catalogue built on them are unchanged. `<unordered_map>` was already included.
Verified: identical "vertex figures: N over M" on every palette above, and `make check-regular`
PASSES byte-identical against `golden/regular-k6.sha256` (1247 blocks, 10/20/61/151/332/673).

+13 / -3 lines, of which 10 are the comment.

## Change 2 — `run-oracle-pool.sh` never forwarded `EU_SHARD_D2`

The pool runner over-decomposes on FIRST vertex type only, and its own header names the resulting
floor: "this cannot split a single first-type subtree". `eu_solver` has carried the depth-2 cut since
the k=8 star work and `run-oracle-parallel.sh` measured what it is worth on regular-doubled k=5 — at
N=64, D2 8 -> 16 lifted the speedup ceiling from 5.80x to 8.58x, more than N 8 -> 64 bought at fixed
D2 — but the pool script simply never passed it through. Now it does, with the divisibility guard.
+16 / -4 lines.

## Measurement 5 — the SECOND wall is memory, and it is harder than the first

Peak RSS of an empty shard (alphabet loaded, zero search), same four palettes:

| palette | vertex types | peak RSS | bytes/type |
|---|---|---|---|
| isotox-cmp8-2 | 28,549 | 54 MB | 1,890 |
| isotox-cmp12-2 | 55,329 | 97 MB | 1,750 |
| isotox-pair5-6 | 87,121 | 163 MB | 1,870 |
| isotox-mixed | 219,868 | 414 MB | 1,880 |

Dead linear at ~1.88 kB per vertex type. The 11-star palette at ~27M types is therefore **~51 GB in
one process**, on a machine with 24 GB — and the pooled runner wants ten such processes, each with
its own private copy. The alphabet is also too big to COMPILE: `tables/isotox-mixed/solver_tables.inc`
is 23 MB for 220k types, so the 11-star .inc lands near 2.8 GB and `g++` already OOMs at 588 MB
(Makefile note), forcing `eu_solver_rt` and `tables.bin` — which would itself be ~11 GB on disk.

1.88 kB is fat for a vertex figure of valence <= 6: the doubled dart set is at most 12 entries, and
`vertexdef` spends it on six separate `std::vector`s plus a `std::string` symbol plus per-allocation
malloc overhead — roughly 7 heap allocations per type. Flattening into shared arenas should reach
~350 B/type (~9.5 GB), which one process can hold and THREADS could share; ten separate processes
never can.

## Change 3 — the static filters were switched off by the wrong test

`eu_solver.cpp` disabled `face_filter`, `build_okpair` and `dyn_build` whenever any corner was 180
degrees or wider, which on a star palette is every dent, so no isotoxal search has ever run with them.
The recorded reason was that such a corner "sits at a 2-VALENT vertex the face-closure model does not
describe" — measured damage: tetromino k=1 fell 76 -> 20, trihex k<=3 fell 475 -> 2.

The damage was real; the diagnosis was not. `face_filter`'s alive test built its key digraph from
`qkeys_of` (all 1..4 admissible successor keys, since the 2026-08-08 four-bucket union) but started
its reachability chain from `qkey_of`, the CLASS_NEXT key alone — so every face that has to be walked
in the CLASS_PREV direction was declared impossible. `checkface` locks its direction only at the first
step and accepts either. That discrepancy is vacuous exactly when CLASS_PREV == CLASS_NEXT, which is
`BUCKET_OK`. Tetromino and trihex are both BUCKET_OK=false. **Every isotoxal palette is BUCKET_OK=true
by construction**: a regular tile is a CLASS_NEXT self-loop, and an isotoxal star is exactly two
classes, point and dent, swapped by NEXT.

Two edits: the alive test now takes the union (monotone — it can only kill FEWER types), and the gate
now reads `!BUCKET_OK` instead of the corner angle. `qkey_of` had no other caller and is deleted.

## Change 4 — the dent-dent adjacency ban, the contrapositive of a lemma already shipped

`enum_configs` forbids two adjacent star POINTS, proved by transferring to the far end of the shared
edge: two adjacent points at v force two adjacent DENTS at w. A star tile has period 2 with the
boundary alternating point/dent, so the transfer is an INVOLUTION and the two bans describe the same
set of solids. Banning dent-dent as well therefore removes exactly zero solids, and it is checkable:
over the shipped isotox-mixed runs, 4,877,234 star-bearing blocks at k<=2 and 4,740 at k=1 contain
ZERO adjacent dent pairs, wrap included.

A dent is `next_class(point)` on a `star` tile, NOT "units > D/2" — the angle test would also catch the
retrograde starpoly classes of the hollow palettes, where two of them legally abut, and delete real
tilings. `dn` is empty for any palette with no `star` tile, so everything else is untouched by
construction. Verified: enum_configs returns an IDENTICAL config count on regular, tri-only,
star-ico-d, hollow-eu, tetromino, trihex, isotoxal-star-z24, isotoxal-star60-z24 and
regular-isotoxal-z24. Only the mixed-closure isotoxal palettes move.

Configs cut: cmp8-2 1.09x, pair5-6 1.25x, isotox-mixed 1.44x, **isotox-full11 2.80x**
(25.0M -> 8.9M), which takes that palette's projected RSS from ~48 GB to ~17 GB.

## Regression — all four changes together, nothing lost

**isotox-cmp8-2, full k<=2.** Alphabet 28,549 -> 26,214 types (and 28,549 - 26,214 = 2,335 is exactly
what the face filter used to kill on this palette, so the two prunes are the same thing here).
Raw blocks **7,497,140 both ways**. Pruned 4,783,048 both ways, and all 227 pruned files are
byte-identical once the `TES file:` line is ignored — that line encodes the vertex-type index, which
shifts when the alphabet shrinks. Developed: 1 solid, `8*.4.4 + 8*.4.4`, **max coordinate delta 0.0**
against the shipped `cmp-isotox-cmp8-2/cells.json`. Nodes 432,679,770 -> 358,714,952 (1.21x).

**isotox-mixed k=1.** Alphabet 219,868 -> 154,008. 5,595 raw blocks, matching the earlier optimized
run exactly. Solve 1.5 s. Developed **35 solids, vertex-config multiset identical** to im-k1b.

**isotox-mixed k=2.** Raw blocks **10,059,930 — exactly the shipped count**. Star-bearing shards on
the shipped file set: **3,044,610 blocks = 3,044,610**. Nodes **5,972,399,935 -> 3,256,554,154 =
1.83x**, matching the filter prediction. Pooled at 200 shards over 10 slots: 466 s wall for solve +
prune.

⚑ One trap found the hard way: `run_develop_sharded.py --developer` defaults to `develop_spherical.py`,
and these palettes need `develop_euclid.py`. The spherical developer renders an 8*30 outline as a
REGULAR 16-gon (all 16 corners 157.5 deg, neither the 90 deg point nor the 225 deg dent) and reports
an extra "solid" that is really a 16-gonal antiprism. Always pass `--developer develop_euclid.py`.

## Change 5 — `EU_FORK`: P workers sharing ONE alphabet

`run-oracle-pool.sh` gets its parallelism from P independent solver processes, each building the whole
alphabet for itself. That is free at 220k vertex types (414 MB) and impossible at the 11-outline
palette's ~5.65M (2.0 kB/type, ~11.3 GB): one copy nearly fills a 24 GB machine, so the run would be
stuck on one core for want of RAM, not of time.

Everything the solver builds before `initex()` — `mainlist`, `CAND`/`CAND_NC`, `TYPE_OK`, `OKPAIR`,
`DYN_ACC`, the CLASS_ tables — is written once and never again, so forking there gives every worker
those pages copy-on-write. Child c takes shard indices `{i : i % P == c}` of the `EU_SHARD_N`
decomposition and runs `initex()` once per index, writing into `fork<c>/out/`.

⚑ `branch_ctr = 0` before each `initex()` is load-bearing. `shard_take_branch()` slices the root-level
branch NUMBER, and that is only a partition because every shard sharing a `w1` counts the same
sequence from zero; carrying the counter into the next shard index shifts the slice and silently drops
branches. `EU_FORK` also refuses `EU_STREAM` — the children share one stdout and there would be no
catalogue to salvage.

Verified on isotox-mixed k=2: **10,059,930 raw blocks, identical to the pooled and serial runs.**

| isotox-mixed k=2 solve | wall |
|---|---|
| serial (before today) | ~900 s |
| pooled, 200 shards over 10 processes | 425 s |
| **forked, 200 shards over 10 workers** | **126 s + 7 s merge** |

## Change 6 — a `set -e` bug that silently threw away the merge

The merge cats `s*/out/$n` and `f/fork*/out/$n` together; exactly one of those globs matches, so the
other reaches `cat` as a literal path and `cat` exits nonzero after copying the files that DO exist.
Under `set -e` the shell abandoned the merge there, leaving an empty `out/` and a prune over nothing —
which is what actually killed the first forked run, and what made the first sweep attempt report zero
star blocks for every palette. `|| true`, with the reason written down.

## Change 7 — the generator streams, so a big alphabet can be BUILT

`gen_alphabet.py` held every folded Entry in a list, at ~6.2 kB each in Python (measured: 950 MB for
isotox-mixed's 154,008). The 11-outline palette's ~5.65M entries is ~35 GB — the only thing stopping
that alphabet from existing, since the SEARCH needs 11.3 GB for the same data and fits.

`emit_binary` is now a thin driver over a `BinWriter` that writes one entry at a time (`NTYPES` is
patched into the header at close), so the materialized path is byte-identical by construction rather
than by a parallel implementation that could drift. `--stream` writes only `tables.bin` and runs the
code counter, the A6 collision scan (by hash) and the sided-class count inline.

| palette | entries | peak RSS before | after | tables.bin |
|---|---|---|---|---|
| isotox-cmp8-2 | 26,214 | ~200 MB | **30 MB** | byte-identical |
| isotox-mixed | 154,008 | 1,026 MB | **72.7 MB** | byte-identical |
| isotox-full11 (projected) | ~5,650,000 | ~35 GB | **~2.7 GB** | — |

Separately, `enum_configs` now canonicalizes each word as it is accepted instead of keeping every
rotation for `cyclic_reps` to dedup at the end — one list per ORBIT where it used to be one per WORD,
about 12x at valence 6. Verified element-for-element identical on all 12 palettes tested.

## Change 8 — `eu_pruner_rt`, and a sliced table for the developer

A palette too big to compile could be searched (`eu_solver_rt` has existed since combined-z24) and
then not pruned, which is the same as not being runnable: `pruner_tables.inc` would be 1.54 GB for the
full alphabet. `ctrnact_runtime_tables.hpp` fills the nine `...listin` vectors the decode header wants
from `tables.bin`, and `make eu_pruner_rt` builds one palette-independent binary.
**Verified: pruned catalogue BYTE-IDENTICAL to the compiled pruner on isotox-cmp8-2** (3,536 / 4,779,512).

For the Python developer, `slice_tables.py --keep-symbols-from <pruned dir> --out-py` keeps only the
vertex types the blocks actually name and writes a `tables.py` for them. Entries are self-contained
(the file's own header says so), so a subset decodes identically.
**Verified on isotox-cmp8-2: the sliced tables develop the same solid, max coordinate delta 0.0.**

⚑ Honest limit: on cmp8-2 the star-bearing shards name 15,142 of 26,214 types — 58%. At full scale
that is ~3.3M entries and a ~1.1 GB `tables.py`, which Python can parse but slowly and once per
worker. The clean finish is a binary reader in `install_palette` plus fork-based develop workers so
one parse is shared, or slicing per family-file group. Not done yet.

## Change 9 — `run_develop_sharded.py --fork`: one copy of the palette tables

A develop worker holds ~1 kB per vertex type (measured 47-66 MB on a 51,647-type palette). The
11-outline alphabet sliced to the types its blocks name is ~3.3M entries, so ~3.3 GB EACH — 26 GB
across eight private copies on a 24 GB machine. The parent already imports the developer with
EU_PALETTE set, so it holds the tables; forking instead of spawning gives the children that one copy
copy-on-write. `spawn` stays the default (forked children inherit an initialized numpy/BLAS, which is
only safe because the thread caps are set in the parent before the import and the workers never
thread). Verified on isotox-cmp8-2: same solid, **max coordinate delta 0.0**.

## FIRST NEW RESULT FROM THE SWEEP — the {12/5} outline is not a prism family

`isotox-sub-12_10` (regulars {3,4,5,6,8,10,12} plus 12*10, the outline of {12/5}: point 30 deg, dent
300 deg) is the first single-star palette to return more than its prism. 51,647 vertex types,
1,261,029,771 nodes, 42,500,835 raw blocks, 3,743,129 star-bearing, **3 solids**:

| vertex configuration | V | E | F | chi | faces |
|---|---|---|---|---|---|
| `12*.3.4.4.3 + 12*.3.12*.3.12*.3` | 48 | 84 | 38 | 2 | 2 star, 24 triangles, 12 squares |
| `12*.3.12*.3 + 12*.3.3.3.3.3` | 48 | 96 | 50 | 2 | 2 star, 48 triangles |
| `12*.4.4 + 12*.4.4` | 48 | 72 | 26 | 2 | 2 star, 24 squares (the prism) |

All three equilateral (one edge length, exactly 1.0), all embedded spheres. The star faces are genuine
isotoxal 12-stars, not regular 24-gons: two radii in ratio 1.931852, corner angles 30 deg and 300 deg
(read as 60 deg unsigned), planar to 1e-15. That is the answer to "the results are mainly prisms and
antiprisms" — the 10-pointed families give only their prism, the 12-pointed ones do not.

## Change 10 — `EU_STAR_ROOTS`: root the search only at a vertex configuration that HAS the star

AL's insight, and it drops straight onto machinery the solver already has. `extend()` never adds a
vertex type below `vertype[0]`, so every configuration's types are >= its root. Order the alphabet so
that every star-bearing type precedes every regular-only one and a solid carrying a star face
necessarily roots at a star type — so rooting only there finds exactly the star-bearing solids and
loses nothing. What it skips is the regular-only subtree, which is the pure-regular search we already
have and which AL has said not to redo.

Two pieces: a palette flag `"starFirst": true` that adds the star-bearing bit as the leading sort key
in `gen_alphabet` (behind a flag because it REORDERS the alphabet and an entry's index is its identity
in the emitted tables — every other palette stays byte-identical), and `EU_STAR_ROOTS=1` in the
solver, which computes the star prefix from the tile names and **refuses to run if the star-bearing
types are not actually a prefix**, since on an unordered alphabet the restriction silently loses
solids.

Measured on isotox-sub-10_12 (one star + six regulars), k <= 2, same binary both ways:

| | all roots | star roots | saving |
|---|---|---|---|
| nodes | 320,777,925 | 232,401,458 | 1.38x |
| raw blocks | 7,233,070 | 1,049,703 | **6.89x** |
| disk written | 3,266 MB | 544 MB | **6.0x** |
| family files | 227 | 106 | — |

Two exact confirmations that the skipped subtree is precisely the regular-only search: the node
difference is 88,376,467 and the block difference 6,183,367, and an independently generated
regular-only palette (the same six regulars, star removed) reports **exactly** 88,376,467 nodes and
6,183,367 blocks. Its 6,851 vertex types also equal the alphabet's non-star tail exactly
(26,205 - 19,354). **Lossless: all 106 star-bearing family files are byte-identical between the two
runs**, and the 121 files present only in the full run are the regular-only families.

## What k=3 would cost, measured

Probe: shard 0 of 200 of isotox-sub-10_12, the same shard at both depths.

| | nodes | blocks emitted |
|---|---|---|
| k <= 2 | 1,251,165 | 14,903 |
| k <= 3 | 3,782,076,670 | 23,104,749 |

**3,023x the nodes and 1,550x the blocks, on one shard of two hundred.** Time is survivable — the
palette's k=2 pooled wall was 84 s, so k=3 lands in the several-hours range per palette and a few days
for all eleven. DISK is not: that one shard writes ~10 GB, so a palette is ~2 TB against the 212 GB
free (85 GB after this session's probes were cleaned up).

⚑ AND STAR-ROOTING DOES NOT RESCUE IT. The 6.9x block saving is a k=2 number. At k=3 the star-bearing
types are 19,354 of 26,205 and their subtree dominates: the regular-only shard writes 11 GB at k=3
while the star-roots shard was on track for ~25 GB when it was stopped at 2%. So the saving at k=3 is
roughly 1.4x, not 6.9x, and k=3 needs a different idea — most likely pruning and DELETING each shard
before the next one runs, so peak disk is one shard rather than a whole palette.

## The complete single-star sweep — all eleven outlines, 1h56m

| # | outline | palette | types | nodes | raw blocks | star blocks | solids | solve s | dev s |
|---|---|---|---|---|---|---|---|---|---|
| 1 | {10/4} | 10_12 | 26,205 | 351,464,898 | 7,358,693 | 933,274 | 1 | 84 | 209 |
| 2 | {10/3} | 10_24 | 26,217 | 351,576,707 | 7,359,044 | 933,582 | 1 | 64 | 196 |
| 3 | {10/2} | 10_36 | 26,231 | 351,715,157 | 7,359,654 | 933,928 | 1 | 65 | 197 |
| 4 | {12/5} | 12_10 | 51,647 | 1,261,029,771 | 42,500,835 | 3,743,129 | 3 (1 real) | 615 | 772 |
| 5 | {12/4} | 12_20 | 51,667 | 1,261,444,033 | 42,501,716 | 3,744,256 | 1 | 364 | 638 |
| 6 | {12/3} | 12_30 | 51,688 | 1,261,667,120 | 42,503,110 | 3,745,249 | 1 | 575 | 589 |
| 7 | {12/2} | 12_40 | 51,695 | 1,261,751,279 | 42,504,120 | 3,745,862 | 1 | 572 | 640 |
| 8 | {5/2} | 5_12 | 26,205 | 348,879,555 | 7,017,398 | 640,039 | 4 | 68 | 189 |
| 9 | {6/2} | 6_20 | 26,191 | 350,987,454 | 7,519,235 | 1,052,752 | 1 | 69 | 231 |
| 10 | {8/3} | 8_15 | 26,208 | 358,646,487 | 7,497,245 | 969,010 | 1 | 66 | 228 |
| 11 | {8/2} | 8_30 | 26,214 | 358,714,952 | 7,497,140 | 969,009 | 1 | 68 | 220 |

Ten of the eleven return exactly their PRISM. {5/2} returns four — the two prisms plus AL's U30
analogue and the genus-9 record. {12/5}'s two extras are DEGENERATE (below). The sweep reproduces
every earlier single-star `cmp` result exactly, which is its own regression.

## ⚑ The shelf was shipping two solids that are not solids

AL, looking at sph-iso-48-84-38 in /play: "they're coplanar, it's basically a prism." Correct, and it
exposed two defects:

1. `gen_isotoxal_shelf.py` never ran `ncx.degeneracy`, which the non-convex and genus shelves both
   run. A star face and the triangles filling its dents can come out in ONE plane, and then their
   union is the real face and the shared edges are not edges. `12*.3.4.4.3 + ...` (48-84-38) and
   `12*.3.12*.3 + ...` (48-96-50) are each a 24-gonal prism with a subdivided top, 48 coplanar
   edge-neighbour pairs apiece. Now dropped, and the drop is reported rather than silent.
2. `ncx.congruence_key` is the sorted multiset of pairwise VERTEX distances and nothing else, so two
   distinct polyhedra sharing a vertex set collapse to one row — which is exactly what 48-84-38 and
   48-72-26 do. `gen_isotoxal_shelf` now uses a face-aware `solid_key`; `develop_euclid`'s own
   congruence key already carried the face census, which is why only the shelf lost one.

Both were found by looking at the picture, not by any test in this repo.

## Shelf state: 6 -> 14 solids, atlas 493 -> 501 records

`iso-24-36-14` ({6/2} prism), `iso-32-48-18-a` ({8/2}), `iso-40-60-22-a`/`-b` ({10/3}, {10/4}),
`iso-48-72-26-a`..`-d` (all four 12-pointed prisms). The six shipped ids are unchanged. All 14 are
non-inscribable (every isotoxal star has two vertex radii) and listed in `SPH_NOT_INSCRIBED`.
`annotate_derivation.py` now takes the `cmp-isotox-*` and `sweep-size*/keep` runs as evidence by glob,
so all 14 read "searched" — seven of them were briefly filed "constructed", the wrong provenance claim
that file's own comments warn about. `pnpm test` 2,871 pass, `pnpm build` clean, check-regular and
check-deltahedra byte-identical.

## Change 11 — the insight that actually made k=3 run: VALENCE STRATIFICATION

AL: "you need more insights like that". Two candidates tested and one of them is the whole game.

**Discrete Gauss-Bonnet is VACUOUS here, and that corrects a note in this repo.** The obvious prune is
`Sum_v defect = 360*chi` on a block, no geometry needed. It carries zero information: the left side is
`Sum_f (L_f - 2)*180 = 180(2E - 2F) = 360(E - F) = 360(V - chi)`, an identity for ANY closed map built
from these tiles, realizable or not. Verified on all 14 shipped solids — both sides agree exactly,
including the chi = -16 one. The earlier "Gauss-Bonnet pre-rejection rejects 99.4% of blocks but loses
15 of 35 solids" was therefore not a realizability filter at all: it hardcoded chi = 2 and was silently
rejecting every non-sphere, which is precisely why the 15 it lost were the genus solids.

**The real one: 96% of the alphabet is valence-6 words, and valence-6 vertices are 3% of the answer.**
Vertex valence census over the 640 vertices of the 14 solids the shelf ships:

    valence 3: 490    valence 4: 120    valence 5: 10    valence 6: 20

All twenty valence-6 vertices are in ONE solid, iso-80-150-72, at its `5*.3.5*.3.5*.3` vertex. Yet
under `mixed` closure the enumerator admits every word up to maxValence, so the alphabet is
`C^V/(2V)` and valence 6 is 96% of it. Measured on one shard of 200 at k=3, star roots on:

| maxValence | alphabet | nodes | blocks | disk | wall |
|---|---|---|---|---|---|
| 4 | 1,099 | 30,744 | 100 | 1 MB | 0.4 s |
| 5 | 4,493 | 9,509,261 | 75,309 | 56 MB | 2.1 s |
| 6 | 26,205 | 3,782,076,670 | 23,104,749 | ~10 GB | ~35 min |

**~400x in nodes and ~300x in blocks between valence 5 and 6**, and the valence-5 stratum contains 13
of the 14 solids already known. The cap is not a speed dial: "complete for every solid all of whose
vertices are valence <= 5" is an exact claim about a stratum, and the valence-6 stratum is a separate
run that this one does not cover.

## THE FIRST k=3 ISOTOXAL RUN, AND IT FOUND FIVE NEW SOLIDS

`isotox-v5-5_12` — regulars {3,4,5,6,8,10} plus 5*12 (the {5/2} outline), maxValence 5, starFirst,
`EU_STAR_ROOTS=1`, k <= 3, 200 shards over 10 slots.

    solve + prune : 112 s   (6,064,756 raw blocks -> 5,225,792 kept: 117 at k=1, 17,114 at k=2, 5,208,561 at k=3)
    develop       : 135 s   (9 workers, --fork)
    total         : 4 minutes

18 realized records -> 9 congruence classes: 3 reproduce the known k=2 solids, 1 is degenerate and
dropped by the new check, and **5 are new**. All five verified equilateral (one edge length, exactly
1.0), planar to 1e-14, non-degenerate:

| solid | V | E | F | chi | faces | |
|---|---|---|---|---|---|---|
| `iso-15-30-17` | 15 | 30 | 17 | 2 | 15 triangles, 1 pentagon, **1 star** | EMBEDDED |
| `iso-132-300-152-a` | 132 | 300 | 152 | -16 | 80 triangles, 60 squares, 12 stars | self-intersecting |
| `iso-132-300-152-b` | 132 | 300 | 152 | -16 | same census, distinct geometry | self-intersecting |
| `iso-140-300-144-a` | 140 | 300 | 144 | -16 | 60 triangles, 60 squares, 12 pentagons, 12 stars | self-intersecting |
| `iso-140-300-144-b` | 140 | 300 | 144 | -16 | same census, distinct geometry | self-intersecting |

`iso-15-30-17` is the one to look at: an embedded sphere on FIFTEEN vertices carrying a single
isotoxal pentagram outline, one pentagon and fifteen triangles. Nothing on this shelf was that small,
and nothing before had an odd number of star faces.

Shelf 14 -> 19, atlas 501 -> 506 records. `pnpm test` 2,871 pass, `pnpm build` clean, check-regular
byte-identical.

## k=4, measured — and the valence cap is the whole story again

Same palette ({5/2} outline + regulars), star roots on, shard 0 of 200 throughout.

| stratum | k=3 shard | k=4 shard | k=4 full palette |
|---|---|---|---|
| valence <= 4 | 30,744 nodes / 0.4 s | 1,312,097 nodes / 0.61 s | **29 s solve, 43 s develop** |
| valence <= 5 | 6,290,615 nodes / 1.5 s | 4% done at 144 s -> ~1 h/shard, ~46 GB/shard | ~200 h CPU and **~9 TB** |
| valence 6 | 3.78e9 nodes / ~35 min | not attempted | far beyond |

**The complete k <= 4 run at valence <= 4 takes 72 seconds end to end**, and that stratum is not a
corner case: 610 of the 640 vertices in the 19 solids this shelf ships are valence 3 or 4.

Result: 1,341,128 raw blocks -> 1,034,836 pruned (34 / 486 / 20,086 / 1,014,230 at k = 1..4), 4
realized records -> **2 congruence classes, both already known** (`5*.4.4 + 5*.4.4` and
`5*.4.3.4 + 5*.4.5.4`). So: THERE IS NO {5/2}-outline polyhedron at k <= 4 all of whose vertices have
valence <= 4 beyond the two already on the shelf. A clean negative, and the first complete k=4
statement this family has.

At valence <= 5 the k=4 run is time-feasible (~20 h pooled) but writes ~9 TB, so it needs the solver
to prune and delete per shard instead of writing a whole palette to disk first. That is the next
engineering step, and it is the same one k=3-at-valence-6 needs.
