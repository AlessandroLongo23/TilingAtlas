# The star catalogue: current state and how to extend it (2026-08-07)

The single page to read before touching the star corpus again. Everything below is measured, not
projected, unless marked.

## The three families, complete to k=8

| | k=1 | k=2 | k=3 | k=4 | k=5 | k=6 | k=7 | k=8 | total |
|---|---|---|---|---|---|---|---|---|---|
| **star24full** (D=24) | 44 | 74 | 169 | 391 | 771 | 1570 | 3204 | 6212 | **12435** |
| **D=18** (9-fold, `ring18`) | 18 | 19 | 40 | 100 | 176 | 327 | 663 | 1218 | **2561** |
| **D=20** (5-fold, `ring20`) | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **6** |

All uncapped (`EU_NCBUDGET=99`, vestigial since the cap was removed). **D=20 is COMPLETE at 6 tilings,
all 1-uniform** — the zeros are measured at every k from 2 to 8, not assumed.

Catalog digests, star24full, cumulative: k<=1 `cc1a4e57bde39378`, k<=2 `0b6cb12bb7f5f797`,
k<=3 `de09102dc86ded53`, k<=4 `0d6c89a535a16ad8`, k<=5 `e4cebd1a796cd3f3`, k<=6 `2075e59e380a2cce`,
k<=7 `aa2cff7bd10c919f`, k<=8 `b397d8220bb29cea`. Regular gate `884968dca36a6c41` / 1247 with
`make check-regular` PASS.

The k=8 run used 400 shards against k=7's 200, and its k<=7 prefix is IDENTICAL to the k=7 run
(`catalog_digest.py --diff`, 6223 blocks, `aa2cff7bd10c919f`). Same catalog out of a different
decomposition — the strongest reproduction check available, and only visible through the
order-insensitive digest.

## Cost, and what the next rung costs

| k | tilings | x prev | cost | time x prev |
|---|---|---|---|---|
| 5 | 771 | 1.97 | 46.2 s (1 core) | 5.5 |
| 6 | 1570 | 2.04 | 198 s (1 core) | 4.3 |
| 7 | 3204 | 2.04 | 1109 CPU-s, 222 s wall on 9 cores | 3.73 |
| 8 | 6212 | 1.94 | 4140 CPU-s, 845 s wall on 9 cores | — |

Counts double per k, ratio stable (1.94–2.31). The TIME ratio keeps FALLING (8.7, 5.5, 4.3, 3.73)
because the dynamic filter has more accumulated `count` to work with at depth. **Projection for k=9:
roughly 13,000-14,000 CPU-s, about 45-55 min wall on 9 cores, ~12,000 tilings.**

⚑ **The parallel floor is a fixed fraction, ~20%, and more shards do not lower it.** k=7: slowest
shard 218 s of 1109 (19.7%) on 200 shards. k=8: 803 s of 4140 (19.4%) on 400 shards. `initex()` splits
on the first vertex type only and one first-type subtree dominates, so no shard count cuts inside it.
At k=9 that floor alone is ~40 min. The fix is depth-2 sharding — a change to `initex()`, not a knob.

## The standing policy (AL, 2026-08-07)

> Whenever star24full reaches a new k, run D=18 and D=20 at the same k, and update the atlas.

D=20 must be RUN at each k, not assumed empty. All three families ship together, all into the MAIN
`public/reference-atlas.json` — **no lazy shards** (AL, 2026-08-07).

## How to run the next k

    cd tools/ctrnact-oracle
    # 1. solve. single core to k=6; pool from k=7.
    EU_SHARD_N=400 EU_POOL=9 PALETTE=star24full ./run-oracle-pool.sh <k> <workdir>
    # 2. the two rings, same k (seconds each; run-oracle.sh does build+solve+prune, skips develop)
    PALETTE=ring18 ./run-oracle.sh <k> <workdir>/ring18
    PALETTE=ring20 ./run-oracle.sh <k> <workdir>/ring20
    # 3. per-k blocks files, then cells (see scratchpad/ingest-k8.sh for the whole driver)
    cat <workdir>/out/pruned/eupruned_0<k>_*.txt > s24-k<k>.blocks.txt
    python3 export_atlas_cells.py --pruned s24-k<k>.blocks.txt --tables tables/star24full --k <k> \
        --only-star --candidates s24-k<k>.blocks.txt --out ...
    python3 export_ring_cells.py  --pruned r18-k<k>.blocks.txt --tables tables/ring18 --k <k> \
        --contains 9,18 --id-prefix ctrnact-star-9fold --out ...
    # 4. re-run the family prover over ALL k at once (families change as k grows), passing EVERY
    #    staged cells file as --cells so member atlasIds resolve
    # 5. stage into experiments/star-oracle/, add the two new filenames to build-reference-atlas.ts
    #    (CTRNACT_STAR_CELL_FILES and the Phase 6 list), rebuild

## Six traps, all of which bit once

**`--only-star` is mandatory.** Without it the palette's pure-regular solutions come too — at k<=4 that
was 243 records (11/20/61/151), exactly the regular catalog already shipped from Galebach. Invisible on
the star shelf, duplicated everywhere else.

**The family key needs the gluing word, not just the corner words.** `family_key` alone is the multiset
of alpha-abstracted corner words: necessary but NOT sufficient. Two non-isomorphic tilings can carry
the same vertex configurations and differ only in how half-edges are glued. First fired at k=8, where
4 of 6 key-groups held two parallel families each; the fold would have removed 30 records while
shipping 6 sliders covering 18, so **12 real tilings would have vanished with no trace**. Fixed by
keying on `(family_key, conway_word)` — the Conway word is alpha-INVARIANT, since alpha snapshots
differ only in star species, which lives in the vertype. A `⚑ KEY COLLISION` guard now fires whenever
a family holds two members at the same alpha. Full write-up: `family-key-collision-2026-08-07.md`.

**Ids are positional, so preserve them by vertype.** Renumbering leaves existing deep links resolving to
a DIFFERENT tiling. Keep the old id for the first record with a given vertype and mint a fresh one for
any later record sharing it — two distinct tilings CAN share a vertype (216 shared vertypes at k=8
alone), and that collision is what `tests/atlas-id-unique.test.ts` caught.

**Family atlasIds must be remapped after staging.** Phase 5 derives candidacy from
`m.atlasId in candidateIds`. Run the prover under one id prefix and stage the cells under another and
0 of N match, `isCandidate` is silently false, and every family falls through to the default
attribution — "Joseph Myers, reproduced" — including at k values Myers never enumerated.

**Anything not in Myers' k=1 (2004) / k=2 (2009) sets needs `candidate:true`.** Without it the builder
credits him. This also fixed a pre-existing bug where all 101 shipped k=3 records were attributed to
him.

**Out-of-ring is about `n`, not angles.** A tiling is out-of-ring iff it carries a tile whose symmetry
order n does not divide 24 (9/18 at D=18; 5/10/20 at D=20). Filtering instead by "the angles are off
the zeta24 grid" is WRONG and pulls in alpha-snapshots of in-ring families — measured, 34 duplicates of
13 shapes. alpha is a FREE parameter: a flexing family exists at every alpha in its range, so the ring
only decides which alphas get sampled. See the docstring of `export_ring_cells.py`.

## Atlas state

Staged in `experiments/star-oracle/`: `ctrnact-star-k{1..8}.cells.json` (33/54/108/240/439/897/1732/
3362 star-bearing), `ctrnact-star-9fold-k{1..8}` (3/4/4/5/5/6/6/22), `ctrnact-star-5fold-k{1..8}`
(1 then empty), `ctrnact-star-families.cells.json` (39 families over k=1..8, 123 members folded, all
11/11 checks). Zero area-check failures anywhere.

`scripts/build-reference-atlas.ts` reads all of them into the main atlas.

Backups: `scratchpad/pre-k8-backup/` (star-oracle + atlas + builder as of the k=7 state),
`scratchpad/star-shelf-backup/` (pre-k5 cells + atlas), `scratchpad/landing-dyn/` (pre-dynamic-filter
solver), `scratchpad/famfix/export_family_cells.py.before` (pre-key-fix family prover).

⚑ **Nothing is committed.**

Verify the shelf after any rebuild:

    python3 -c "import json,collections; d=json.load(open('public/reference-atlas.json')); \
      s=[t for t in d if t.get('source')=='ctrnact-star']; print(len(d),'entries; star',len(s), \
      dict(sorted(collections.Counter(t['k'] for t in s).items())))"

The k<=7 shelf was 23/46/108/235/436/897/1728 = 3473 at 6193 entries / 29.6 MB.

## Solver state

`tools/ctrnact-oracle/eu_solver.cpp` carries, in order of when they landed: fixes 1-9 (see
`docs/ctrnact-solver-optimizations.md`), the arc-consistency + face-cycle + face-length static filter,
the pair filter (forward and reverse), and the DYNAMIC face-closure filter. Escape hatches:
`EU_NOFILTER=1` disables the static filter, `EU_NODYN=1` the dynamic one. The corona filter was built,
measured and NOT landed (real, worth nothing, does not scale with k) — it lives in
`scratchpad/vc-ceiling/eu_solver_corona.cpp`. Unchanged since k=7; the only code edit this round was
the family key in `export_family_cells.py`.
