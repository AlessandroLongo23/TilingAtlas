# The face filter across every ring palette, D=14 to D=46 (2026-08-07)

Follow-on to `face-closure-filters-2026-08-07.md`, which measured the filter on star24full only. Swept
the ring palettes. The two biggest speedups in the whole project are here, not on star24full.

| palette | D | alphabet | live | dead | tilings (k<=4) | measured speedup |
|---|---|---|---|---|---|---|
| ring42 | 2·3·7 | 192,687 | 1,030 | 99.5% | 65 (k<=2) | **571x** at k<=2 |
| ring28 | 4·7 | 2,261 | 14 | 99.4% | 7 | — |
| ring20 | 4·5 | 1,667 | 49 | 97.1% | 6 (all k=1) | >17x at k<=3 |
| ring18 | 2·3² | 3,839 | 331 | 91.4% | 177 | **560x** at k<=3 |
| ring16 | 2⁴ | 396 | 40 | 89.9% | 16 | — |
| ring14 | 2·7 | 82 | 0 | 100% | **none** | — |
| ring22 | 2·11 | 114 | 0 | 100% | **none** | — |
| ring26 | 2·13 | 130 | 0 | 100% | **none** | — |
| ring34 | 2·17 | 162 | 0 | 100% | **none** | — |
| ring38 | 2·19 | 178 | 0 | 100% | **none** | — |
| ring46 | 2·23 | 210 | 0 | 100% | **none** | — |

Headline timings, interleaved reps, identical raw block counts throughout:

- **ring18 k<=3: 16.49 / 17.15 / 17.10 s unfiltered -> 0.03 s filtered.** 101 blocks both ways.
- **ring42 k<=2: 97.06 s -> 0.17 s.** 65 blocks both ways.

## A ring supports tilings only if D has a factor of 3 or 4

Six palettes have ZERO live types, and the search agrees: filtered and unfiltered both emit 0 blocks at
k<=3. All six are D = 2·prime with prime >= 7. Since a regular n-gon needs `n | D` for integer angle
units, those rings contain only p-gons and 2p-gons — no triangles, squares or hexagons — and the
surviving angles cannot sum to a full turn at any vertex. The filter derives this from face closure
alone, knowing none of it.

The rings that DO work all have a factor of 3 or 4: 16 = 2⁴, 18 = 2·3², 20 = 4·5, 28 = 4·7, 42 = 2·3·7.

Confirmed by running them: ring16 has 16 tilings at k<=4 including `(4,4,4,4)` and `(8,8,4)`, exactly
the two the angle arithmetic predicts (D=16 gives regular 4-, 8-, 16-gons at 4, 6 and 7 units against a
16-unit turn: 4+4+4+4 and 4+6+6 both close). ring28 has 7.

## D=9 does not exist and cannot

`D` is the angular unit (2pi/D), and every corner angle must be an integer number of units. A regular
9-gon's interior angle is 7pi/9, which is `D·7/18` units — at D=9 that is **3.5**, not an integer. The
smallest working D is 18, since 7 and 18 are coprime. Every palette in the repo has even D for the same
reason, and star palettes additionally need D even for the point/dent p=2 alternation. **The 9-fold
family IS D=18** (`ring18`), which the atlas already names that way.

## `star18` / `star20` are stale duplicates of `ring18` / `ring20`

The first sweep reported "BUILD FAIL" for `star18` and `star20` and I moved on, which is why the earlier
palette report silently omitted D=18 and D=20. Cause: those table directories were generated 11 July,
predate the `CLASS_PREV` table format, and do not compile against the current solver. Same D, same tile
counts, identical `STAB_N` as `ring18`/`ring20`, which were regenerated 25 July in the current format.
They self-heal on the next `make` (the generator is newer than their stamp).

## A shell trap that produced two invalid results

`timeout` is GNU coreutils and **does not exist on macOS**. Two verification runs used
`env ... timeout 300 <solver>` and therefore never executed the solver at all; both reported 0 blocks,
which I read as "no tilings exist" for six palettes and for ring42. Re-run without it: the six
zero-live palettes are genuinely empty (confirmed), but ring42 gives **32 blocks at k=1 and 65 at
k<=2**, with the triangle tiling `(3,3,3,3,3,3)` surviving the filter. The check that caught it was
asking whether a palette containing regular triangles could really produce nothing.

## What this opens up

ring18 at k<=3 costs 30 ms, so the D=18 catalog can be pushed well past k=4 for free; k<=4 is 177
tilings in 0.21 s. ring42 is the largest alphabet anywhere in the repo (192,687, three times
star24full's) and is now tractable at k=2 in 0.17 s.

⚑ ring16 and ring28 leave 40 and 14 live types but produce only 16 and 7 tilings at k<=4, so many
surviving types have not appeared yet. They may need higher k, or be impossible for reasons face
closure cannot see.
