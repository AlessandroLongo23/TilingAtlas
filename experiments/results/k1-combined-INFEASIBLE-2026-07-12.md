# k=1 all-families-in-one-alphabet — INFEASIBLE on this engine (2026-07-12)

Verdict record (DG-1 style: the measurement is the result). AL asked to run the Čtrnáct oracle at
k=1 with regular, star, and composable/non-composable tiles **all together in one alphabet** — i.e.
enumerate k-uniform tilings that mix the three families at a vertex, not four separate palette runs.

## What was attempted

One unified palette `combined-z24` (spec kept at
`tools/ctrnact-oracle/alphabets/palettes/combined-z24.json`): the ζ₂₄ union of

- `star24` — regular {3,4,6,8,12} + the 15 Myers in-ring star species, and
- `composite-convex` — Family A (decomposable) + Family B (non-decomposable) composites, angles
  rescaled from the D=12 spec to D=24 units (doubled; each still satisfies Σangles = (n−2)·D/2).

31 tiles, 75 corner classes (= 5 regular + 30 star point/dent + 40 composite fundamental-period
positions — verified, not a palette bug). Star sub-families star18 (9-fold) / star20 (5-fold) are
excluded by construction: their ζ₁₈ / ζ₂₀ direction systems are incommensurable with ζ₂₄ and cannot
share one periodic edge-to-edge lattice.

## The wall

`gen_alphabet.py --certify` on the union:

    [gen] palette=combined-z24 D=24 tiles=31 classes=75 configs=1710914
    wrote .../{solver,pruner}_tables.inc (1747450 entries)   ~9.5 min

| quantity | composite-convex (alone) | combined-z24 (union) | factor |
|---|---|---|---|
| vertex-config types | 18,969 | **1,747,450** | ~92× |
| solver_tables.inc | small | **588 MB** (one line, ~5M string+int literals) | — |
| full tables dir | — | ~2.8 GB | — |

The solver is table-driven: `eu_solver.cpp` `#include`s `solver_tables.inc` and builds a
1.75M-entry `mainlist`. Compiling a single-line 588 MB source of millions of string literals
(`STAB_SYMBOL`/`STAB_LABEL`/`STAB_CODE`) with `g++ -O2` on this **24 GB** machine thrashes/OOMs
before the solve is ever reached. Not attempted to completion — the compile risk to the machine is
real and the payoff (solve-time over 1.75M vertex types) is itself unmeasured.

## Why it explodes (not a bug)

The 15° star point (`3*1` = 1 unit at D=24) and 30° points, together with the rich composite corner
set (40 classes), make the number of cyclic corner-words summing to 360° at valence ≤ 12 blow up
~92×. Each family alone is bounded (composite-convex's smallest corner is 60° ⇒ word length ≤ 6;
star24 alone compiles in seconds). The union is what's intractable — the sharp star points remove the
word-length bound that kept the composite alphabet small, and the composite corners multiply the
branching at every position.

## Verdict

The three families do not fuse into one tractable alphabet through the C++ oracle as built. Getting a
true mixed k=1 count would require an engine change (emit the pretty-print string tables as a
concatenated char buffer + offsets so g++ can compile, then measure solve-time/RAM over 1.75M types),
or a documented reduced-scope union (drop the ≤30° star points / lower maxValence). AL's call
(2026-07-12): **stop at the measurement.**

## The four separate-family k=1 runs stand (deliverable)

Full log: `experiments/results/k1-all-families-2026-07-12.log`. Each solve → prune → develop →
realizability (Σ face area == |det Λ|); 0 failures, 0 flags.

| family | palette | k=1 combinatorial | developed & realizable | note |
|---|---|---|---|---|
| regular | `regular` | 10 | 10/10 exact-certified (ℚ(ζ₂₄)) | octagon-blind; +t1002 = 11 |
| stars | `star24` | 37 | 37/37 (area==\|det\|) | = 26 star-bearing + 11 pure-regular |
| composable (A) | `composite-decomp` | 23 | 23/23 | 13 use a composite tile |
| non-composable superset (B) | `composite-convex` | 30 | 30/30 | 20 use a composite tile; A→B gap 7 |

Cross-check: star24's 11 pure-regular = the complete regular k=1 (incl. octagon t1002), since ζ₂₄ is
not octagon-blind. Composite/star counts are over each palette's tile alphabet (decomposition
ambiguity) — NOT all-and-only, do not compare to A068599.

Cleanup: the 2.8 GB `tables/combined-z24` was removed; the palette spec is kept as the record of what
was built. Re-generating it is a ~9.5 min `gen_alphabet.py` run if the engine-hack path is ever taken.
