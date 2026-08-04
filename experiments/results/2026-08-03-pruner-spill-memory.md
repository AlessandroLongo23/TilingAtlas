
## EU_SPILL out-of-core pruner store — 2026-08-03 10:49:51

Marek's proposal: the pruner need not hold kept solutions in RAM, because the
(sigline, fingerprint) bucket key is an isomorphism invariant, so a duplicate is never
compared outside its own bucket. Spill the store to disk, read back only the matching
bucket. Gate: the emitted catalog must be byte-identical with the knob off vs on.

| k<= | mode | peak RSS | reduction | spill on disk | reads back | catalog sha256 |
|---|---|---|---|---|---|---|
| 9 | in-RAM | 30.0 MB | — | — | — | `f7db0184ce03960f` |
| 9 | spill 1 MB | 29.1 MB | 1.03x | - MB | - | `f7db0184ce03960f` IDENTICAL |
| 10 | in-RAM | 59.7 MB | — | — | — | `934857b1bd08a318` |
| 10 | spill 1 MB | 57.5 MB | 1.04x | - MB | - | `934857b1bd08a318` IDENTICAL |
| 11 | in-RAM | 152.5 MB | — | — | — | `bfe3893955bd4277` |
| 11 | spill 1 MB | 151.4 MB | 1.01x | - MB | - | `bfe3893955bd4277` IDENTICAL |


### Stream mode (EU_STREAM) — the store-dominated path

File mode's RSS is dominated by reading raw solver output, not by the solution store,
so spilling the store barely moves it. Stream mode reads no files and never frees between
k, so the store is the whole footprint. This is also the mode any high-k run would use.

| k<= | mode | peak RSS | reduction | store size | resident | spilled to disk | read back | catalog |
|---|---|---|---|---|---|---|---|---|
| 10 | in-RAM | 22.6 MB | — | 13.0 MB | 13.0 MB | — | — | `934857b1bd08a318` |
| 10 | spill 8 MB | 17.0 MB | **1.33x** | 13.0 MB | 8.0 MB | 8.1 MB | 1096 | `934857b1bd08a318` IDENTICAL |
| 11 | in-RAM | 46.5 MB | — | 29.5 MB | 29.5 MB | — | — | `bfe3893955bd4277` |
| 11 | spill 8 MB | 21.6 MB | **2.15x** | 29.5 MB | 8.0 MB | 24.2 MB | 9514 | `bfe3893955bd4277` IDENTICAL |
| 12 | in-RAM | 97.5 MB | — | 66.3 MB | 66.3 MB | — | — | `9fd990d9036b533b` |
| 12 | spill 8 MB | 29.0 MB | **3.36x** | 66.3 MB | 8.0 MB | 64.4 MB | 89641 | `9fd990d9036b533b` IDENTICAL |

