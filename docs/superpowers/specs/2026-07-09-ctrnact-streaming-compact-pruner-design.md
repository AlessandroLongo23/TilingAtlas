# Streaming fuse + compact exact dedup for the C++ Čtrnáct oracle

**Status:** draft (design approved, pending spec review) · **Owner:** CC · **Date:** 2026-07-09
**Scope:** single-machine solve+prune path. Distribution and canonical-form dedup are documented as
a compatible future layer, not built here.

## Problem

The C++ Čtrnáct oracle (`tools/ctrnact-oracle/eu_solver.cpp` + `eu_pruner.cpp`) is the authoritative
generator of the reference k-uniform catalogue. After this session's trace-gating win it enumerates
k≤10 in ~36 s single-core. The goal now is to push k as high as the hardware allows. On the target
machine (Apple M5, 24 GB RAM, 4 performance + 6 efficiency cores, ~640 GB free disk) three separate
ceilings appear at three different k, and only one of them is memory:

- **Disk** — the solver writes raw solution text to disk before the pruner reads it. Raw volume grows
  ~2.15×/k (~500 MB at k=11), reaching ~495 GB at k=20 and ~1.1 TB at k=21, so it busts the ~640 GB
  free disk around k=20–21.
- **RAM** — the pruner holds every *distinct* solution as a full graph in `sols`/`bucket`
  (`eu_pruner.cpp:32,320`) and never frees between k. Full-graph storage busts 24 GB around k=19.
- **Time** — solve grows ~2.5×/k; on 4 P-cores k=19 is roughly an overnight run and k=20+ is
  multi-day. This is the true ceiling on one machine and nothing here removes it.

This spec removes the disk and RAM ceilings so that time is the sole limit (~k19–20 on this machine),
and leaves a clean seam for the distributed build that would push past it.

## Measured basis

Optimized build (trace off, `-O2`), best of three, one M5 core
(`experiments/results/cpp-bench-k10-2026-07-09.csv`):

| k | solve (s) | prune (s) | raw blocks | distinct at k |
|--:|----------:|----------:|-----------:|--------------:|
| 8 | 4.84 | 0.47 | 14,849 | 2,850 |
| 9 | 13.62 | 1.39 | 32,963 | 5,960 |
| 10 | 31.66 | 4.50 | 70,919 | 11,866 |

Projected walls on the target machine (solve on 4 P-cores at ~3.5× effective; raw ~2.15×/k; distinct
~2×/k; per-solution graph ~330·k + 144 bytes today, ~10× smaller packed). ✗ marks a busted ceiling.

| k | solve (4-core) | raw if landed | RAM full-graph | RAM packed |
|--:|---------------:|--------------:|---------------:|-----------:|
| 15 | ~15 min | 11 GB | 1.9 GB | ~0.2 GB |
| 17 | ~1.5 hr | 49 GB | 8.5 GB | ~0.9 GB |
| 19 | ~10 hr | 229 GB | 38 GB ✗ | ~4 GB |
| 21 | ~2.5 days | 1.1 TB ✗ | 160 GB ✗ | ~17 GB |

Estimates compound; by k=21 they are good to about a factor of three. Counts at k≥12 are Galebach's
unproven tallies — proving them complete is the thesis's point, so treat them as expected, not known.

## Goal and scope

**In scope:** the `eu_solver` + `eu_pruner` path. Remove the disk wall (streaming) and the RAM wall
(compact storage), keeping dedup provably exact so completeness is never at risk.

**Out of scope, explicitly:**
- `develop.py` (Python geometric reconstruction) — likely its own RAM hog, separate concern.
- A complete canonical-form dedup (roll-our-own or nauty). Not needed on one machine: packed
  exact-pairwise storage moves the RAM wall to ~k22, past the ~k20 time wall. It becomes worthwhile
  only in the distributed layer and is deferred there.
- The distributed/multi-machine build itself.

## Architecture — three changes that compose

### 1. Streaming fuse: raw never lands on disk

Fuse solve and prune into one pipe, `eu_solver | eu_pruner`, so raw solution blocks are consumed and
discarded as they are produced and only the distinct (pruned) set is ever written.

- **Solver `EU_STREAM` mode.** Behind an env flag (default off, preserving current behaviour),
  `writesolution` (`eu_solver.cpp:520`) emits each solution block to `stdout` instead of opening a
  per-family file (`globe`). The block format is the existing one the pruner already parses
  (vertype line, signature, TES line, Conway, cycle lines, blank framing).
- **Pruner stdin mode.** Behind an env flag, the pruner reads solution blocks from `stdin` in the
  same record-oriented way it currently reads a file (`processfile`, `eu_pruner.cpp:351`), rather
  than iterating families on disk. Each block: decode → fingerprint → bucket lookup → exact pairwise
  arbiter → keep-or-drop → on keep, store packed and emit the pruned block to the per-k output file.
- **Target-k mode.** A frontier run wants one k. The solver emits all k in [1, MAXNUM] interleaved in
  DFS order, so the pruner, given a target-k env (`EU_KONLY=k`), drops any incoming block whose
  vertex-type count ≠ target before decoding (cheap), and buckets only the target. This keeps pruner RAM at `distinct(target)`, not cumulative across all k. Full-catalogue
  mode (all k≤target kept) retains every k, which is the low-RAM regime anyway.

Effect: the disk wall disappears. Only the pruned distinct set persists (kilobytes to a few GB), never
the raw blocks.

### 2. Compact + exact dedup: the RAM fix

Keep dedup exactly as it is (WL fingerprint bucketing + exact pairwise `comparesolutions`,
`eu_pruner.cpp:229,297`), so correctness is unchanged, and only shrink what is stored per distinct
solution.

- **Packed `Sol`.** Replace the current `Sol` (`eu_pruner.cpp:32`: five `vector<int>` plus
  `vector<string> label`) with a packed representation: edge labels interned to small ints via a
  per-run string table, adjacency held in flat `int16`/`int32` arrays sized to the solution. Target
  ~10× smaller (~5 KB → ~500 B per distinct solution).
- **`comparesolutions` reads packed graphs.** The pairwise WL-isomorphism arbiter operates on the
  packed form directly (or unpacks a transient view). No change to the algorithm, only the backing
  store.
- **Free per-k state.** `sols.clear()` and `bucket.clear()` between k in catalogue mode (buckets
  never cross k because the signature encodes the vertex-type count). In target-k mode only the one k
  is ever held.

Effect: RAM wall moves from ~k19 to ~k22, past this machine's ~k20 time wall. No canonical-form trust,
dedup stays provably exact.

### 3. Quick wins folded in

- Stream the input record-by-record (`getline` in the processing loop) instead of `readlines`
  slurping a whole family file (`eu_pruner.cpp:343`).
- `EU_KMIN=target` to skip lower-k dedup work when only the frontier k is wanted.

## Data flow

```
eu_solver (EU_STREAM, MAXNUM=target)
   └─ per solution: writesolution → stdout block
        │  (pipe; raw blocks never persisted)
        ▼
eu_pruner (stdin mode, EU_KONLY=target)
   per block: parse → (k ≠ target? drop) → decode → fingerprint
            → bucket lookup → exact pairwise arbiter
            → keep? → pack + store in sols/bucket + emit pruned block
        ▼
   pruned distinct files on disk (small)
        ▼
   develop.py  (unchanged, out of scope)
```

## Validation — the completeness gate

Every change here is on the completeness oracle, so the bar is identical kept *sets*, not just counts.

1. **Shared core, so correct by construction.** The streaming pruner runs the same fingerprint +
   exact pairwise dedup as the file-based one. The packing is a storage change only.
2. **Packing round-trip.** `pack → unpack == original` for every solution, asserted in a unit check.
3. **Old-vs-new equivalence harness** (in the style of `scripts/cpp-optwin.py`): run the current
   file-based pruner and the new streaming/compact pruner on the *same* solver output for every k
   where both are feasible (k≤~14). Require identical pruned output — same distinct solutions, same
   order-independent set — not merely equal counts.
4. **A068599 counts** match at every known k (measured through k=11: 10 / 20 / 61 / 151 / 332 / 673 /
   1472 / 2850 / 5960 / 11866 / 24459).
5. Any divergence blocks the change. This is the same discipline that validated the trace-gating
   (byte-identical solution files).

## Expected reach on the target machine

Disk wall removed; RAM wall → ~k22. Time becomes the sole ceiling: k17–18 comfortable, k19 an
overnight run (~10 hr on 4 P-cores), k20 a multi-day run. k21+ needs the distributed layer below.

## Distribution-ready seam (deferred, not built)

The streaming pruner is stateless except its bucket table, so the design extends to N machines without
rework: a worker owning a disjoint root-range (via the `EU_ROOT_LO/HI` bound on `initex`,
`eu_solver.cpp:405`) streams-and-dedups locally and emits a distinct *shard*; a final pass merges
shards with the same fingerprint + pairwise core. Canonical-key dedup (roll-our-own individualization
-refinement, or nauty) earns its keep there, keeping merge RAM bounded when aggregate compute reaches
k≥22. The interfaces defined here (stream in, distinct out; root-range bound on the solver) are the
same ones the distributed build needs, so nothing here blocks it.

## Risks and open questions

- **Pipe throughput.** At high k the solver emits blocks fast; the pruner must keep up or the pipe
  backpressures (which is fine, it just serializes to solve speed). Measure that the fuse is not
  slower than the current two-step at k≤12 before trusting it at the frontier.
- **Packed `comparesolutions` correctness.** The pairwise arbiter is the correctness keystone; the
  packed-form rewrite must be validated against the current one on identical inputs (harness item 3).
- **Label interning collisions.** The per-run string table must be deterministic and collision-free;
  validated by the round-trip check.
