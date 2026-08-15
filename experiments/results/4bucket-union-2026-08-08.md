# The 4-bucket union: implementation and what it buys (2026-08-08)

The engine's whole filter stack was gated on one flag, `BUCKET_OK`, which held only when
`CLASS_PREV == CLASS_NEXT` with `NEXT` an involution. A single period-3 tile anywhere in a palette
failed it, and everything switched off at once: the static face filter, the pair filter, the dynamic
face-closure filter, and the candidate index, which fell back to scanning every vertex type at every
node. The code comment named the fix without doing it. This is that fix.

## The identity, derived without the involution assumption

Gluing free dart `e` to candidate dart `f` makes the face walk cross the new glue in both directions,
and `checkface` accepts either `CLASS_NEXT` or `CLASS_PREV` on its first step. With `a = lvert[e]`,
`b = lvert[rneig[e]]`, and the candidate's target key `(A, B) = (lvert[f], lvert[rneig[f]])`:

    crossing e -> f :  B in {NEXT, PREV}[a]
    crossing f -> e :  b in {NEXT, PREV}[A],  and PREV is NEXT's inverse, so A in {NEXT, PREV}[b]

Two choices on each side is four admissible `(A, B)` pairs, hence four buckets whose union is the
candidate pool. Under `BUCKET_OK` the two choices coincide pointwise, `qkeys()` returns one key, and
the pool is the single bucket the engine always used.

Soundness runs one way only, and it is worth being precise about which. The four conditions are
NECESSARY, because they are steps `checkface` actually performs, so the union never drops an
admissible candidate. They are not sufficient: `checkface` also locks the walk direction after its
first step, and the union deliberately forgets that. So the union admits candidates that
`checkpart_inc` then rejects. It costs work; it cannot lose a tiling.

The same union generalizes the three filters. Each builds a successor digraph `R` keyed by
`cand_key`, mapping `tkey(f)` to the query key of `rneig[f]`; now it maps to all 1-4 query keys.
More edges means more reachability means fewer kills, so the relaxed `R` can only fail to kill,
never kill wrongly. `dyn_can_close` and the pair filter take the disjunction over the key set for the
same reason: requiring all of them would reject branches the union just proved reachable.

## Two bugs found while doing it

**A latent one in the filters, now guarded.** The per-orbit reachability indexes successors through a
global `loc[]` and never re-checks that the successor sits in the same `CLASS_NEXT` orbit as its
source. The comment justified this with "measured: zero cross-orbit steps", which was true for the
palettes it had been run on. A cross-orbit edge would write into another orbit's slot and corrupt the
reachability, and because *reduced* reachability kills types, that direction loses tilings. It now
counts them and disables the filters outright if any appear, instead of filtering on a corrupted
graph.

**One of mine, caught before it shipped.** The merged pool lives in a per-depth scratch buffer, since
`extend` recurses from inside the loop reading that pool. I first indexed a `std::vector` of buffers
by depth. A deeper call growing that vector reallocates it and moves every element, leaving the
parent iterating freed memory. `std::deque` guarantees references to existing elements survive
insertion at the ends, which is the property this needs.

## Gates

| gate | result |
|---|---|
| `make check-regular` | PASS, byte-identical to golden |
| star24full k≤4 (`BUCKET_OK` true) | old and new identical: 2,959,612 nodes, 1300 blocks, digest `053f2de0b6a19393` |
| composite-convex k≤2 pruned | **288** (30 + 258), matching the golden that exposed the dynamic-filter bug |
| composite-convex k≤2 raw digest | `7b889ac5d6b97753` both sides |

The star row is the control: that palette is all period ≤ 2, so `qkeys()` returns one key everywhere
and the new code must reproduce the old exactly, down to the node count. It does.

## Which palettes this touches at all

Only classes on period ≥ 3 tiles widen the union. The rest keep a single bucket, so the degradation
is local to the tiles that cause it.

| palette | classes | on p≥3 tiles | tile periods |
|---|---|---|---|
| regular | 4 | 0 (0%) | {1: 4} |
| star24full | 90 | 0 (0%) | {1: 6, 2: 42} |
| regular-scaled-123 | 24 | 12 (50%) | {1: 4, 2: 4, 3: 4} |
| composite-convex | 44 | 34 (77%) | {1: 4, 2: 3, 3: 3, 4: 2, 5: 2, 7: 1} |
| composite-decomp | 33 | 27 (82%) | {1: 4, 2: 1, 3: 2, 4: 1, 5: 2, 7: 1} |
| equi3-cx-z24 | 62 | 57 (92%) | {1: 5, 3: 19} |
| tetromino | 47 | 45 (96%) | {2: 1, 5: 3, 10: 3} |

## Measured gains

New runs to completion; old capped at 180s, which is enough to show it is nowhere close. Raw output in
`4bucket-union-2026-08-08.log` and `4bucket-unlock-2026-08-08.log`.

| palette | k | old | new | nodes old → new |
|---|---|---|---|---|
| star24full (control, p≤2) | 4 | 8s | 8s | 2,959,612 → 2,959,612 (identical) |
| composite-convex | 2 | 18s | **1s** | 2,851,115 → 2,248,149 |
| composite-convex | 3 | >1,500s (killed) | **51s** | — → 97,809,152 |
| composite-convex | 4 | not attempted | **6,896s** | — → ~2.4e9 (counter wrapped) |
| composite-decomp | 2 | 4s | **<1s** | 1,074,778 → 824,880 |
| composite-decomp | 3 | >180s | **13s** | — → 30,399,266 |
| composite-decomp | 4 | >180s | **574s** | — → 646,644,493 |
| regular-scaled-123 | 2 | 6s | **<1s** | 898,070 → 452,426 |
| regular-scaled-123 | 3 | >180s | **12s** | — → 8,973,124 |
| regular-scaled-123 | 4 | >180s | **290s** | — → 130,473,342 |
| tetromino | 2 | >180s | **1s** | — → 23,122 |
| tetromino | 3 | >180s | **2s** | — → 183,242 |
| equi3-cx-z24 (period 3) | 2 | **~6,820s** (measured 2026-08-07) | **3s** | — → 12,440,224 |

The period-3 row is the largest single gain, roughly **2,000x**, and it is the one that most needed
checking. Running the OLD binary to completion on that palette, sharded ten ways, gives 377 raw blocks
and digest `0fbc3356d3fecf5c`; the new unsharded run gives 377 and `0fbc3356d3fecf5c`. Same catalog.

### Catalogues that now exist

| palette | k | tilings |
|---|---|---|
| composite-convex | ≤4 | **12,742** (30 / 258 / 1,844 / 10,610) |
| composite-decomp | ≤4 | **9,661** (23 / 203 / 1,423 / 8,012) |
| regular-scaled-123 | ≤4 | **22,125** (88 / 460 / 3,027 / 18,550) |
| tetromino | ≤3 | **373** (11 / 69 / 293) |
| equi3-cx-z24 (period 3) | ≤2 | **299** (55 / 244) |

⚑ The period-3 k=1 count is **55**, not the 56 quoted from the raw solver output on 2026-08-07: that
figure was raw blocks, and pruning merges one isomorphic duplicate.

Every one of these was out of reach before. The frontier moves from k≤2-3 to **k≤4** across the whole
composite and scaled family. composite-decomp and regular-scaled-123 reach k=4 in 5-10 minutes, so k=5
is a plausible next step there; composite-convex k=4 took 1h55m, which puts its k=5 out of reach for now.

⚑ The k=4 run also exposed a 32-bit wrap in the DFS node counter (`nodes: -1898351957`). Every node
figure from a run past ~2.15e9 was silently wrong, and the pricing arguments in
`docs/ctrnact-solver-optimizations.md` are built on that number. Now `long long`.

## Where the gain actually comes from

The headline number is the candidate index, not the filters. On composite-convex at k=2 the node
count falls only 21% (2,851,115 to 2,248,149) while wall time falls from 18s to 1s, so almost all of
it is per-node cost: the old path scanned all 18,969 vertex types at every node and the new one reads
at most four buckets.

The static face filter kills ZERO types on every period-p palette measured, against 96% on
star24full. That is not really a defect of the union: the filter's power comes from vertex types
whose faces provably cannot close, and convex, composite and scaled tiles have far more legitimate
closures than star tiles do. The union being a relaxation weakens it further, and the honest reading
is that both effects point the same way.
