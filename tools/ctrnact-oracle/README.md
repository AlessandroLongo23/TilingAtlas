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
eu_solver (C++)      raw solutions, with duplicates   ->  out/eusolver_<NN>_<fam>.txt
eu_pruner (C++)      dedup to distinct tilings         ->  out/pruned/eupruned_<NN>_<fam>.txt
develop.py (Python)  exact geometric reconstruction    ->  ctrnact-cells-k<K>.json  {id,k,T1,T2,Seed}
decode.py (Python)   optional combinatorial view       ->  combinatorial JSON {conway, vertexConfigs, ...}
```

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
- `pruner.py` — the adapted Python pruner. Kept because `develop.py` reuses its `decode()`; also a
  cross-check for the C++ pruner.
- `decode.py`, `develop.py` — Python-only stages (no C++ equivalent needed; `develop.py` runs on the
  pruned distinct set, not the raw).

### A completeness note

The C++ solver is the authoritative generator. An earlier Python solver port
(`euclidean_solver_mega.py` adapted) silently dropped **one** tiling at k=8 and k=9 (giving 2849 /
5959). The C++ solver, Marek's original, and `reference/count.txt` all agree on 2850 / 5960, so the
C++ path is what settles the count. Completeness is the thesis's claim, so this is logged, not buried.

## Performance (this machine, 2026-07)

| stage | k=10 | k=11 |
|-------|------|------|
| solve (C++) | 137s | 361s |
| prune (C++) | 4s | 10s |
| Python pruner (replaced) | 353s | 1447s |

Whole k=11 pipeline: ~6 min, versus an estimated ~5 h all-Python route.
