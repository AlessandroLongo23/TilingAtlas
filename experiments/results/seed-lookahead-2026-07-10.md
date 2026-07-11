# Seed forced-collapse lookahead — scout results (2026-07-10)

Work order: `experiments/seed-lookahead-workorder-2026-07-10.md`. Scout:
`scripts/seed-lookahead-scout.ts` (budget 16 collapses, 10s/seed cap). Raw:
`seed-lookahead-k{2,3}-2026-07-10.{log,csv}` (+ `-trace48` diagnosis artifacts).
Infra: `SeedBuilder.enumerateVertexCompletions` refactored out of the historical forward check —
behavior-identical (emitted seed lists byte-identical k=1/2/3, build clean, 35/35 tests).

## Headline numbers

| | k=2 {3,4,6,8,12} | k=3 {3,4,6,12} |
|---|---|---|
| seeds | 40 | 449 |
| killed (core-dead) | 18 (45.0%) | 146 (32.5%) |
| kills within depth ≤2 | 12 | 93 |
| kills within depth ≤8 | 18 | 144 (146 by 16) |
| timecap survivors (⚑ floor) | 4 | 82 |
| check cost | 94 s total | 1,615 s total (~3.6 s/seed) |
| killed-seed share of measured fill work | n/a | **6.66%** (1.56M of 23.44M fills, §41 array) |

Kill mechanisms: k=3 → 134 entropy-0, 12 surrounded-with-disallowed-VC. Kills are front-loaded
(54 at depth 1); depth >8 adds only 2. The 82 timecaps mean the kill counts are floors, but the
budget histogram is nearly flat past depth 8 — deeper propagation is not where the missing kills
are; a faster completion test (ring-matching) would matter more than a bigger budget.

## Soundness gates — both PASS, after one semantics correction

- k=2 `VERIFY_KILLED`: all 18 killed seeds solve to 0 cells (no timeouts) on the live solver.
- k=3 artifact cross-check (certified `.scout-cache/k3_3.4.6.12_cap0.ndjson`, 175 cell-producing
  seeds): **0 of 146 kills refuted** under core-containment semantics.
- **The correction (main lesson of the run):** the naive gate first accused 4 kills (idx 48/50/
  126/128). Decoding showed every accused cell has |det| < core area and none contain the core
  mod Λ — they are cells from `solve()`'s single-VC **fan fallback** (PeriodSolver §13.4), which
  fires exactly when the lattice cell is too small to hold the rigid core. The kills stand; the
  claim a lookahead kill makes is *core*-deadness, not seed-output-emptiness. Binding consequence
  recorded in the work order §2: a prune may skip only core fills (or whole seeds with a surviving
  same-set sibling — fans depend only on VC types; observed: idx 48 and 50 emit identical fan
  cells), never the fan path.

## Verdict (the honest one)

The idea is sound and the machinery works, but at the seed level it is not the k=3 wall-cracker:
one third of seeds die, yet they carry only **6.66%** of the measured fill work (upper bound —
fan-preservation shaves it further), because the catastrophic seeds (3⁶-family closure-storms,
NOTES §43) are locally alive everywhere. Kill fraction also *fell* from k=2 (45%) to k=3 (32.5%).

Where the same engine plausibly pays: **inside `analyze()` in the fill** — per-pop, every open
vertex is already scanned with covered intervals; adding (a) the gap-arithmetic test (uncovered
arc must be an ℕ-combination of available corner angles) and (b) ring-match entropy-0 against the
allowed VC names would detect dead cells at first contradiction instead of when the nearest-origin
frontier reaches them. That targets the dead-end tail class §43 names as the missing lever, and it
applies per-lattice (the common deadness), not only per-plane (the rare one). Reject-only ⇒
digest-safe. Proposed as the follow-up work order.

Secondary observation, independent of entropy: same-set sibling seeds re-run **identical fan
fills** (per-VC-type fans × per-multiset candidate lattices). A per-set fan-fill dedup is a free
work reduction; worth a diag counter to size it before building anything.
