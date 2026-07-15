# Doubled palette — EU_NCBUDGET ladder (resume log)

`EU_NCBUDGET` caps the number of *noncounting* (flat mid-edge) vertex types a partial tiling may
accumulate in the Čtrnáct solver (`tools/ctrnact-oracle/eu_solver.cpp`, default **8**). It is a loud
completeness guard: when it binds, the run prints `EU_NCBUDGET WARNING … COMPLETENESS NOT CERTIFIED`.
Certify a level by **budget-fixpoint**: two (here: three) consecutive budgets that give byte-identical
catalogs and 0 warnings.

The requirement **grows with k** — the flat-corner model makes noncounting vertices proliferate, so
each higher k needs a larger budget before the guard stops binding.

## k=4 — CERTIFIED COMPLETE = 1064 (2026-07-13)

| budget | k=1 / k=2 / k=3 / k=4 | warns |
|-------:|:----------------------|:-----:|
| 8      | 26 / 81 / 332 / 991   | yes   |
| 9      | 26 / 81 / 334 / 1035  | yes   |
| 10     | 26 / 81 / 334 / 1054  | yes   |
| 11     | 26 / 81 / 334 / 1063  | no    |
| 12     | 26 / 81 / 334 / **1064** | no |
| 13     | 26 / 81 / 334 / **1064** | no |
| 14     | 26 / 81 / 334 / **1064** | no |

Fixpoint at **budget 12** (12=13=14, 0 warns). k=3 stabilizes at 334 (budget 9). The default budget 8
silently costs 2 at k=3 and 73 at k=4 — do NOT trust default-budget runs for k≥4. The committed Doubled
k≤4 atlas (6/41/212/762 after the T-junction filter) was built at a sufficient budget and is complete.
Logs: `experiments/results/doubled-k4-budgetladder-2026-07-13.log`.

## k=5 — PARKED, NOT converged (2026-07-13)

Dumped for now (per AL). The count is still climbing at budget 10; the fixpoint is well beyond it.

| budget | k=1 / k=2 / k=3 / k=4 / k=5   | warns |
|-------:|:------------------------------|:-----:|
| 8      | 26 / 81 / 332 / 991 / 3100    | yes   |
| 9      | 26 / 81 / 334 / 1035 / 3194   | yes   |
| 10     | 26 / 81 / 334 / 1054 / 3283   | yes   |

k=5 gains ~90 tilings per budget level and is nowhere near a fixpoint at 10. Certifying k=5 means
continuing the ladder (11, 12, …, each ~8 min for the MAXNUM=5 solve) until two consecutive levels agree
at k=5 with 0 warnings. Extrapolating from k=4 (needed budget 12), k=5 likely needs budget ~14–16+.
Logs: `experiments/results/doubled-k5{,-budget9,-budget10}-2026-07-13.log`.

### Resume recipe

```bash
cd tools/ctrnact-oracle
for b in 11 12 13 14 15 16; do
  EU_NCBUDGET=$b PALETTE=regular-doubled ./run-oracle.sh 5 "$PWD/run-k5b$b-regular-doubled"
  # record k=5 count + warns; stop when count(b)==count(b+1) and warns==0
done
```

Then rebuild the shelf. NOTE (2026-07-13): the Doubled shelf class was retired — sides 1-2 now live as
the **"Sides 1–2"** facet of the **Scaled** class (`public/reference-atlas-scaled.json`,
`scripts/build-scaled-atlas.ts`). To surface a certified k=5, run the **scaled** palette to k=5 instead
(`PALETTE=regular-scaled-123 ./run-oracle.sh 5`, same budget ladder), rebuild with
`pnpm tsx scripts/build-scaled-atlas.ts` — the exact ℤ[ζ₁₂] dedup + T-junction filter apply there. The
scaled palette's scale-3 flats push noncounting counts even higher, so its budget requirement per k is ≥
the doubled one. Detail: `docs/DEVELOPMENT_NOTES.md` §57.
