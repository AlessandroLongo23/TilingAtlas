# T-junction enumeration, in the C++ engine, in parallel — 2026-08-18

Palette `eu-half-sq-mid-split` (Marek Čtrnáct, 2026-08-16): the non-edge-to-edge remodelling of the
half-square board. Every side of length 2 = 1+1 carries a FLAT 180-degree corner at its midpoint, so a
tile's edge can be met by two tiles. The 1x2 domino's angle word is [90,90,180,90,90,180] — which is
exactly the face word the TypeScript enumerator rediscovered as the brick pattern.

Run: EU_SHARD_N=8 ./run-oracle-parallel.sh, sharding initex() across 8 worker processes.
started 02:21:49
[02:21:50] build (MAXNUM=3 PALETTE=eu-half-sq-mid-split)
[02:21:53] PHASE 1  parallel solve — 8 shards, depth2 1, pool 8, budget 0
[02:21:53]   workers done (0s wall)
[02:21:53] PHASE 1b  merge worker outputs
[02:21:53]   merged raw blocks: 4129
[02:21:53] PHASE 2  prune
  k=1 : 15
  k=2 : 131
  k=3 : 726
total kept: 872
store: peak 0.199928 MB total, 0.199928 MB resident
[02:21:53]   prune done (0s);  total wall 0s

## eu-half-sq-mid-split-cells.json — 146 cells with k <= 2

```
  done 146 in 5s, 0 unreadable
```

| params | cells |
|--------|-------|
| 2 | 113 |
| 3 | 3 |
| 4 | 2 |
| 5 | 20 |
| 6 | 4 |
| 7 | 4 |

**146 of 146 carry at least one length parameter.**


## Shipped

`length_family.chart2` + `emit_tjunction_families.py` → `lib/tilings/tjunction-families.generated.ts`,
146 families, wired into the Atlas as `plen-tj-*`. Parametric shelf: 46 → 192.

### The bug the covering check caught

`chart` (first attempt) rebuilt the cell by walking the dart map and picked lattice vectors out of the
walk's discrepancies. Those are genuine translations but need not be a BASIS, and a wrong pair doubles
the covering — invisible to the closure system, which is why the check exists. It rejected **all 144**.
`chart2` does not rebuild what is already correct: the engine hands over exact face coordinates and an
exact T1, T2, so only the DERIVATIVE of each vertex is computed, by propagating d(position) =
K_i[e]·direction across a patch of translates from one pinned vertex. Edges are keyed by midpoint modulo
the lattice, the same key `build_map` pairs darts with. **146 of 146 verify.**

Second bug: ids collided with the euhalf shelf's own rows and /play died on `canonicalKey`. Prefixed
`plen-tj-`.

### Verified

146/146 covering-checked in Python at the developed member and at a box corner before emission; a
spread of the SHIPPED bytes re-checked in `tjunction-families.test.ts`; build clean; 29 tests green;
/play verified at `plen-tj-eu-half-sq-mid-split-2-00007`, k=2, five sliders, driven to
(0.70, 1.30, 0.75, 1.28) and the uniform brick becomes staggered rectangles of different sizes.
