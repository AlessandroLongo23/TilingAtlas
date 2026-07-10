# Čtrnáct k-uniform oracle pipeline

Generates the reference catalogue of edge-to-edge k-uniform tilings by regular polygons that this
thesis validates its enumerator against. It is Marek Čtrnáct's combinatorial dual-search
([k-uniform-solver](https://github.com/user/k-uniform-solver), MIT — see `LICENSE`), with a fast C++
path and a geometric back end that emits exact `{T1, T2, Seed}` cells in the Galebach oracle format.

The algorithm is combinatorial, not geometric: it searches *duals* of k-uniform tilings by gluing
vertex-figure edges with Conway symbols, checks each vertex closes to a divisor of 360°, and prunes
isomorphic duplicates. Details in `reference/algorithm.txt` and `reference/README-ctrnact.md`.

## Pipeline

```
eu_solver  (C++)     raw solutions, with duplicates   ->  out/eusolver_<NN>_<fam>.txt
eu_pruner  (C++)     dedup to distinct tilings         ->  out/pruned/eupruned_<NN>[_<fam>].txt
eu_develop (C++)     exact geometric reconstruction    ->  ctrnact-cells-k<K>.json  {id,k,T1,T2,Seed}
develop.py (Python)  same, reference impl (slower)      ->  (validation oracle for eu_develop)
decode.py  (Python)  optional combinatorial view        ->  combinatorial JSON {conway, vertexConfigs, ...}
```

`eu_develop` is the native port of `develop.py` (flood-fill in exact ℤ[ζ₁₂], integer lattice HNF, Lagrange-Gauss
reduction, seeds mod Λ). ~19× faster (k=1..16: 1.79M cells in ~68 s vs ~22 min); it reuses the pruner's decode.
Validated congruent to `develop.py` on all 200,730 k≤13 cells (same Λ + same seeds mod Λ) and area-certified at
k=14..16. `develop.py` is kept as the reference/oracle. Both accept the streamed `eupruned_NN.txt` and the
family-file `eupruned_NN_fam.txt` naming.

Run the whole thing:

```sh
./run-oracle.sh 11            # solve + prune + develop, k = 1..11
make MAXNUM=13 && ...         # or build once and drive stages by hand
```

Validate the emitted cells from the repo root (exact area certificate, Σ face areas = |det Λ|):

```sh
pnpm tsx scripts/ctrnact-recon-check.ts tools/ctrnact-oracle/run-k11/ctrnact-cells-k11.json
```

## Counts

Octagon-blind: the tile set uses 12 directions (ℤ[ζ₁₂]), so the one octagon-bearing tiling (t1002,
the 4.8.8 tiling) is absent by construction. k=1 gives **10**, not 11 — re-add t1002 by hand (see the
repo CLAUDE.md octagon decision). k ≥ 2 matches A068599 / `reference/count.txt` exactly:

| k | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|----|----|
| tilings | 10\* | 20 | 61 | 151 | 332 | 673 | 1472 | 2850 | 5960 | 11866 | 24459 |

\* octagon-blind (11 − t1002).

## Fast path vs reference

`reference/` holds Marek's originals unmodified (the Python `euclidean_solver_mega.py` +
`euclidean_pruner.py`, his `eu_solver.orig.cpp`, `count.txt`, `algorithm.txt`). The top-level files
are the ones you run:

- `eu_solver.cpp` — Marek's C++ solver, patched: `MAXNUM` parametrised (was hardcoded 14), `seen=0`
  (emit every k in 1..maxnum, not only k=14), output to `out/`, one placeholder line for framing
  parity with the pruner, and a `TES file:` dir-prefix so the id parses downstream.
- `eu_pruner.cpp` — C++ port of the pruner (the Python original ran once, so Marek never ported it;
  it became the bottleneck once the solver went native). Faithful dedup (WL canonical-form
  `simplify` + isomorphism `comparesolutions`), plus two semantics-preserving speedups: an
  isomorphism-invariant fingerprint that buckets candidates (so `comparesolutions` only runs within
  exact matches), and bitset WL refinement. **~145× faster than the Python pruner** (k=11: 1447s →
  10s), exact same counts.
- `eu_develop.cpp` — C++ port of `develop.py` (was the last Python stage in the hot path; became the
  bottleneck once the frontier moved past k=13). Reuses the pruner's `decode`; adds the exact ℤ[ζ₁₂]
  developer. **~19× faster**, congruent to `develop.py` on all 200,730 k≤13 cells, area-certified k=14..16.
- `pruner.py` — the adapted Python pruner. Kept because `develop.py` reuses its `decode()`; also a
  cross-check for the C++ pruner.
- `develop.py` — the reference developer, kept as `eu_develop`'s validation oracle (runs on the pruned
  distinct set, not the raw). `decode.py` — Python-only combinatorial view (no C++ equivalent needed).

### A completeness note

The C++ solver is the authoritative generator. An earlier Python solver port
(`euclidean_solver_mega.py` adapted) silently dropped **one** tiling at k=8 and k=9 (giving 2849 /
5959). The C++ solver, Marek's original, and `reference/count.txt` all agree on 2850 / 5960, so the
C++ path is what settles the count. Completeness is the thesis's claim, so this is logged, not buried.

## Running at higher k (streaming)

For a single frontier k, fuse the two stages so raw blocks never touch disk and pruner RAM stays
bounded to that one k:

```sh
EU_STREAM=1 ./eu_solver | EU_STREAM=1 EU_KONLY=<k> EU_OUT=<dir> ./eu_pruner
```

(build the solver with `make MAXNUM=<k>`). The solver emits each solution block to stdout instead of
per-family files; the pruner reads stdin, dedups on the fly, drops any block whose vertex count ≠ k,
and writes only the distinct blocks to `<dir>/pruned/eupruned_<NN>.txt`. Default (no `EU_STREAM`)
still runs the file-based pipeline unchanged. `EU_TRACE=1` restores the solver's per-node debug trace
(off by default).

## Performance (Apple M5, 2026-07)

Two optimizations landed after the initial port, each validated against a golden capture of the
pre-change output plus the A068599 counts (exact, not "close").

**Trace-gating.** The solver wrote a per-node debug trace (`euoutput1.txt`) on every search node —
hot-path string I/O never read by the search or the emitted solutions. Gating it behind `EU_TRACE`
(default off) cut solve ~4–6× with byte-identical solution files:

| solve | k=6 | k=10 |
|-------|-----|------|
| trace on (original) | 3.75s | 137s |
| trace off (default) | 0.66s | 31.7s |

**Streaming fuse + compact dedup.** Raw output never lands (it is streamed and consumed); the pruner
stores each distinct solution as a packed `int16` graph (the dead `label` field dropped) and, under
`EU_KONLY=k`, holds only the target k. Fused per-k run, one M5 core:

| k | wall (solve+prune) | distinct | pruner peak RAM | raw on disk | pruned on disk |
|---|--------------------|----------|-----------------|-------------|----------------|
| 10 | 27s | 11866 | 16 MB | 0 | 5.4 MB |
| 11 | 66s | 24459 | 31 MB | 0 | 12 MB |
| 12 | 157s | 49794 | 64 MB | 0 | 26 MB |

The old file path wrote ~500 MB of raw text at k=11 and held the cumulative distinct set (~405 MB
peak for k≤12); the fused path writes 0 raw and caps pruner RAM at a single k (31 MB at k=11), which
is what pushes the frontier past the disk/RAM walls. Design + validation: the spec and plan under
`docs/superpowers/*/2026-07-09-ctrnact-streaming-compact-pruner*`.
