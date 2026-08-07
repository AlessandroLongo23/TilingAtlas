# The star catalogue: current state and how to extend it (2026-08-07)

The single page to read before touching the star corpus again. Everything below is measured, not
projected, unless marked.

## The three families, complete to k=9

| | k=1 | k=2 | k=3 | k=4 | k=5 | k=6 | k=7 | k=8 | k=9 | total |
|---|---|---|---|---|---|---|---|---|---|---|
| **star24full** (D=24) | 44 | 74 | 169 | 391 | 771 | 1570 | 3204 | 6212 | 12076 | **24511** |
| **D=18** (9-fold, `ring18`) | 18 | 19 | 40 | 100 | 176 | 327 | 663 | 1218 | 2317 | **4878** |
| **D=20** (5-fold, `ring20`) | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **6** |

All uncapped. **D=20 is COMPLETE at 6 tilings, all 1-uniform** — zeros measured at every k from 2 to
9, never assumed.

Digests, star24full, cumulative: k<=1 `cc1a4e57bde39378`, k<=2 `0b6cb12bb7f5f797`, k<=3
`de09102dc86ded53`, k<=4 `0d6c89a535a16ad8`, k<=5 `e4cebd1a796cd3f3`, k<=6 `2075e59e380a2cce`, k<=7
`aa2cff7bd10c919f`, k<=8 `b397d8220bb29cea`, k<=9 `3489713bb0d31c0a`. Regular gate
`884968dca36a6c41` / 1247, `make check-regular` PASS.

⚑ **k=9 was solved with depth-2 sharding, so its k<=8 prefix does NOT byte-match the stored
digests.** That is expected, not a fault: see "depth-2" below. It was verified instead with the
order-insensitive block-multiset comparison (`scratchpad/verify-d2.py`) against the depth-1 k=8
catalog — identical, 12,435 blocks.

## Cost

| k | tilings | x prev | cost | time x prev |
|---|---|---|---|---|
| 6 | 1570 | 2.04 | 198 s (1 core) | 4.3 |
| 7 | 3204 | 2.04 | 970 CPU-s / 217 s wall, 9 cores, depth-1 | 3.59 |
| 8 | 6212 | 1.94 | 3482 CPU-s / 805 s wall, 9 cores, depth-1 | ~2.9 |
| 9 | 12076 | 1.94 | 11060 CPU-s / 1494 s wall, 9 cores, **depth-2** | — |

Counts double per k (1.94-2.31, very stable). The TIME ratio keeps FALLING (8.7, 5.5, 4.3, 3.59,
~2.9) because the dynamic face-closure filter has more accumulated `count` to work with at depth.
**Projection for k=10: ~30,000 CPU-s, 60-75 min wall on 9 slots, ~23,000 tilings.**

## Depth-2 sharding (`EU_SHARD_D2`)

The depth-1 partition splits on the first vertex type only and cannot cut inside one first-type
subtree; one always dominates, and the resulting floor is a fixed FRACTION near 20% of serial time
that no shard count moves (218/1109 at k=7 on 200 shards; 803/4140 at k=8 on 400). `EU_SHARD_D2=<f>`
splits `EU_SHARD_N` two ways — N/D2 root slices, D2 branch slices per root — so root-level work is
duplicated D2-fold, not N-fold. `D2=1` is the old partition byte-identically.

Floor drops to 5-7%. k=7: 217.3 s -> 138.5 s (1.57x). k=9 ran at 6.7%.

⚑ The gain is bounded by floor x slots and the floor saturates near 20%, so ~1.8x is the ceiling on
this 10-core box and it does NOT compound. The ceiling scales with core count, so this is worth far
more on a cluster than here. Do not spend more on parallelism expecting compounding returns; the
falling per-level time ratio is what actually buys depth.

⚑ **The catalog TEXT changes under depth-2** (the printed orbit order; the pruner keeps the
first-seen representative and splitting inside a root changes which branch arrives first). The
tiling SET does not: at k=4 the union of a sequential and a depth-2 run prunes back to exactly 678.
Because the atlas keys ids, the family fold and `cells_index` by vertype STRING, depth-2 is safe for
a NEW k but re-running a SHIPPED k would move those keys.

## The standing policy (AL, 2026-08-07)

> Whenever star24full reaches a new k, run D=18 and D=20 at the same k, and update the atlas.

D=20 must be RUN at each k. All three ship into the MAIN `public/reference-atlas.json` — no lazy
shards (AL). AL accepted the atlas-size cost for k=9 with the ~90 MB projection known; it landed at
85.6 MB.

## How to run the next k

    cd tools/ctrnact-oracle
    EU_SHARD_N=360 EU_SHARD_D2=8 EU_POOL=9 PALETTE=star24full ./run-oracle-pool.sh <k> <workdir>
    PALETTE=ring18 ./run-oracle.sh <k> <workdir>/ring18
    PALETTE=ring20 ./run-oracle.sh <k> <workdir>/ring20
    # then scratchpad/ingest-k9.sh is the template: blocks -> cells (--only-star --candidates)
    # -> ring cells (--contains) -> family prover over ALL k -> stage -> builder -> rebuild
    pnpm tsx scripts/build-reference-atlas.ts --no-shards

## Eight traps, all of which bit at least once

**`--only-star` is mandatory.** Without it the palette's pure-regular solutions come too — 243
duplicate records at k<=4, exactly the Galebach catalog already shipped.

**Never `make` a palette whose binary a running job is executing.** Binaries are per-palette
(`eu_solver.<palette>`), but a rebuild of the SAME palette swaps the file under the running shards.
This corrupted a k=8 benchmark row on 2026-08-07 after I had explicitly reasoned it was safe.
`EU_SOLVER_BIN` points a run at a prebuilt binary at its own path; use it for experiments.

**The filter stack is gated on `BUCKET_OK` and composite palettes fail that test.** `face_filter()`
and `build_okpair()` no-op there, so composite-convex gets NO benefit from any of the 2026-08-06/07
work. `dyn_build()` was missing the same guard and was silently losing tilings (147 vs 288 kept at
composite-convex k<=2) until it was fixed. Generalising the filters past `BUCKET_OK` (the "4-bucket
union" named in the code) is the work item for the composite shelves.

**The family key needs the parametric cell AND conditional refinement.** Three revisions: corner
words alone under-split at k=8 (12 tilings would have vanished); adding the Conway word over-split
at k=9 (four duplicate families); the parametric cell alone under-splits again; arrangement alone
over-splits. What works is coarse grouping refined by arrangement ONLY where alpha repeats. A
repeated alpha is impossible within a family, so it is proof the group merges parallel families.
Never change this key without testing all three cases at once: k<=7 byte-identical / k=8 = 10 with
alpha=[1,2,3] / k=9 = 5 with alpha=[1,2,3].

**Ids are positional, so preserve them by vertype.** Two distinct tilings CAN share a vertype (216
shared at k=8 alone); keep the old id for the first and mint fresh for later ones.

**Family atlasIds must be remapped after staging**, and the family prover must be fed the EXISTING
k<=8 blocks, not a newer run's copies. Phase 5 derives candidacy from `m.atlasId in candidateIds`;
if the vertype strings shift, 0 of N match and every family falls through to "Joseph Myers,
reproduced".

**Anything outside Myers' k=1 (2004) / k=2 (2009) sets needs `candidate:true`.**

**Out-of-ring is about `n`, not angles.** A tiling is out-of-ring iff it carries a tile whose
symmetry order n does not divide 24. The angle test pulls in alpha-snapshots of in-ring families —
34 duplicates of 13 shapes, measured.

## Atlas state

`public/reference-atlas.json`: **15,680 entries, 85.6 MB**, star shelf
23/46/108/235/436/897/1728/3364/6123 = **12,960**. Staged cells `ctrnact-star-k{1..9}`,
`ctrnact-star-{9,5}fold-k{1..9}`, `ctrnact-star-families` (44 families: 29/10/5 over k<=7/8/9).

**Rebuild star-only work with `--no-shards`.** The k=8/9/10 lazy shards are the regular higher-k
catalogs and re-enriching them is 76% of a full rebuild (17,826 of 23,396 classifications). Minutes
instead of ~25.

⚑ `public/reference-atlas-k10.json` needs its enrichment re-run — killed mid-pass, currently zero
m/partition/wallpaperGroup across 11,866 entries.

Committed on branch `star/k8-and-depth2-sharding`.

## Solver state

`eu_solver.cpp` carries fixes 1-9, the static face filter, the pair filter, the dynamic
face-closure filter (now `BUCKET_OK`-guarded) and depth-2 sharding. Escapes: `EU_NOFILTER=1`,
`EU_NODYN=1`, `EU_SHARD_D2=1`. It also reports `nodes: / simplify_calls: / simplify_true:` on stderr
for pricing isomorph-free generation, and `EU_DOUBLE_SIMPLIFY=1` times the canonicity test.
The corona filter was built, measured and NOT landed — `scratchpad/vc-ceiling/eu_solver_corona.cpp`.
