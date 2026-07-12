# Independent checkers for the completeness proof

`verify_finite.py` independently verifies the **finite / mechanical** lemmas of the proof
(`../skeleton.tex`). It shares **no code** with the engine (`eu_solver`, `eu_pruner`,
`eu_develop`, `ctrnact_decode.hpp`) or with `alphabets/gen_alphabet.py`: every predicate is
reimplemented from the lemma statement. The shipped alphabet tables and the engine's
emitted catalog are the *data under test*. A third, independent implementation agreeing with
the engine is the evidence — a checker that reused engine code would prove nothing.

## Run it

```
# from the repo root; first make sure the engine produced a k<=6 catalog:
cd tools/ctrnact-oracle && make check-regular    # builds + runs, writes check-k6/out/pruned

# then run the independent checker (k<=3 no-drop is fast; k>=4 is slow, see below):
python3 docs/ctrnact-completeness/checks/verify_finite.py \
    --tables tools/ctrnact-oracle/tables/regular \
    --pruned tools/ctrnact-oracle/check-k6/out/pruned \
    --nodrop-k 3
```

Expected: `11/11 checks PASS`. No dependencies beyond CPython 3.

## What each check certifies (lemma → independent recomputation)

| Check | Lemma | What is recomputed from scratch |
|---|---|---|
| A1 | A1 | Diophantine enumeration of the 14 vertex configurations (+ 3 chiral) |
| A2/A3 | A2, A3 | a from-scratch fold-by-subgroup alphabet, matched to the shipped tables up to isomorphism |
| A4 | A4 | the four structural identities on all 44 letters |
| A5 | A5 | brute-force Aut of each letter; \|Aut\|=ferkval, free action, reps = Aut-orbit transversal |
| A6 | A6 | the 44 letters pairwise non-isomorphic (complete trace invariant) |
| A2iv | A2(iv) | every ρ-cycle has angle-weight sum dividing 12 (feeds C1's flatness) |
| S4 | S4 | conditions 1/2a/2b re-checked on every emitted pruned solution |
| R1 | R1 | core-ness (independent colour-refinement) of every emitted solution |
| P1 | P1 | the pruned catalog is pairwise non-isomorphic within each k |
| S1 | **S1 (no-drop)** | a fresh brute enumeration of all closed valid cores == the engine's pruned set |

## The one that matters most: S1 no-drop

`--nodrop-k K` runs a completely independent enumerator: for every multiset of ≤ K vertex
letters, it forms every complete gluing (perfect matching of stubs respecting mirror
parity, pruned by conditions 1/2a/2b), keeps the closed + connected + core ones, dedupes by
isomorphism, and compares the resulting set to the engine's pruned catalog. It uses **no
DFS from `eu_solver`** — a structurally different search. Agreement is direct evidence for
the no-drop property (S1), the highest-risk lemma and the one the historical Python bug
violated.

Verified frontier: **k ≤ 3 (10 / 20 / 61), exact set match.** `--nodrop-k 4` is much slower
(the matching search grows fast); it is run separately and logged in
`experiments/results/ctrnact-nodrop-k4-*.log`. The independent-verification frontier is
whatever k that run reaches; beyond it, S1 rests on the written proof plus the k ≤ frontier
cross-check, not on independent enumeration. This cap is stated, not silent.

## Scope

Covers tier **M** (mechanical) of `../trust-map.md`. It does **not** cover tier **G** (the
geometric lemmas C1(iv), C3, B3, L1-orientation) — those need a human geometer and cannot be
reduced to a finite check. Classical citations (tier C) are audited separately in
`../classical-citations-audit.md`.
