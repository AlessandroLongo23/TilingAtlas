---
type: concept
tags: [algorithm, concept]
status: seeded
sources: ["tools/ctrnact-oracle/README.md"]
---

# The pipeline: solver → pruner → develop

Three stages. The first two are combinatorial; only the third touches geometry.

```
eu_solver  (C++)     raw solutions, with duplicates   ->  out/eusolver_<NN>_<fam>.txt
eu_pruner  (C++)     dedup to distinct tilings         ->  out/pruned/eupruned_<NN>[_<fam>].txt
eu_develop (C++)     exact geometric reconstruction    ->  ctrnact-cells-k<K>.json  {id,k,T1,T2,Seed}
```

- **eu_solver** — the dual-search. Grows candidate duals by gluing corners, emits every valid closure.
  Duplicates are expected here. See [[dual-search]].
- **eu_pruner** — dedups to distinct tilings using a canonical fingerprint. See [[canonical-form]].
- **eu_develop** — reconstructs exact coordinates by flood-fill in ℤ[ζ₁₂] (integer-lattice HNF,
  Lagrange-Gauss reduction, seeds mod Λ) and emits `{T1, T2, Seed}` cells: `T1`,`T2` the
  period-lattice basis, `Seed` the fundamental-domain faces. It's the native port of the reference
  `develop.py` (kept as the slower validation oracle), ~19× faster.

## Running it

```sh
cd tools/ctrnact-oracle
make PALETTE=regular            # build the stages for a palette
PALETTE=regular ./run-oracle.sh 11    # solve + prune + develop, k = 1..11
```

Validate emitted cells from the repo root (exact area certificate, Σ face areas = |det Λ|):

```sh
pnpm tsx scripts/ctrnact-recon-check.ts tools/ctrnact-oracle/run-k11/ctrnact-cells-k11.json
```

## Counts and the octagon caveat

The `regular` palette reproduces OEIS **A068599** (see [[k-uniform-tilings]]). With 12 directions the
lone octagon tiling `t1002` (the 4.8.8) is absent by construction, so **k=1 gives 10, not 11** —
re-add `t1002` by hand. k ≥ 2 matches exactly: 20, 61, 151, 332, 673, 1472, 2850, 5960, 11866, 24459…

## Guard

`make check-regular` must stay byte-identical after any engine edit — the regression that proves an
alphabet/engine change didn't disturb the regular catalogue.

## From the chat

- 
