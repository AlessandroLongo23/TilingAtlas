# Making the mixed search affordable: measured costs and a ranked plan (2026-07-25)

AL, after the 30/150 rhombus landed: running the same search at maxValence=12 with the extra rhombi and
extending it to k=2 "is going to take forever" — first idea, parallelize it.

**The premise is half right, and the half that is wrong is the important half.** The solver is already
parallel; the serial part is the Python table builder that feeds it, and it costs 17× more than the k=1
solve it produces. And `maxValence=12` turns out to be free: it is the *saturation* point of the rhombus
palette, not an ambition.

Everything below is measured on this machine (Apple M5, 10 logical cores, Python 3.9.6), not extrapolated,
unless it says so. Raw log: `experiments/results/valence-sizing-2026-07-25.log`.

## Where the time actually goes

| stage | k=1 | k=2 | already parallel? |
|---|---|---|---|
| `gen_alphabet.py` (vertexdef tables) | **920 s** (rhombus palette) | same table | **no** — serial Python |
| `eu_solver`, 8 workers | 2 s | **547 s** | yes, proven-disjoint `initex` shard |
| `eu_pruner` | 0 s | 0 s | no, and it does not matter |
| `export_combined_families.py` | < 1 s | < 1 s | no, and it does not matter |

k=2 solve timing from `experiments/results/isotoxal-star-z24-k2-pruned-20260712.log` (547 s wall, 8 workers,
34,329 vertexdefs). Table timing measured today on `isotox-v8-rh`.

`run-oracle-parallel.sh` already shards phase 1 across `EU_SHARD_N` processes, and its disjointness argument
is sound (min-type-root: `extend` never adds a type below `vertype[0]`, so worker *w* taking
`{i : i mod N = w}` sees a slice no other worker sees, and the union equals a sequential run). **So "first
thing would be to parallelize it" is already done for the solver.** What is serial is `gen_alphabet`.

## 1. Forbidden adjacent pairs inside the DFS — 20.5×, output proven identical

The single biggest win, and it is not parallelism.

`gen_alphabet` enumerates every cyclic word of corner classes summing to 360°, deduplicates up to
rotation/reflection, and *then* (under `EU_PRUNE_OVERLAP=1`) throws away the ones whose placed tiles collide.
On the rhombus palette that filter discards 96.5% of what the DFS built. Measured on `isotox-v8-base`:

```
raw DFS words   :  3,416,148     28.9s
cyclic dedup    :    277,785     22.5s   (12.3x collapse)
overlap filter  :     31,621     44.0s
shortest overlapping prefix -> count:
  {2: 217442, 3: 9186, 4: 11443, 5: 5028, 6: 2762, 7: 294, 8: 9}
```

**88% of the rejects already collide at prefix length 2** — two cyclically-adjacent corner classes whose
placed tiles overlap. That is a property of the *pair*, not of the word: 53×53 = 2,809 possibilities,
precomputable in 0.1 s, after which the DFS refuses the pair instead of building every completion of it.

This generalizes a prune the code already has. `enum_configs` carries the point-adjacency lemma as exactly
this shape — `if word and pt[word[-1]] and pt[cid]: continue` — and its own docstring proves that lemma
*geometrically* (two adjacent star points force two adjacent reflex dents at the far end of the shared edge,
which exceed 2π). So the lemma is a special case of pairwise overlap, hand-derived. The table subsumes it.

**Soundness.** `build_config` places tiles at the running angle sum, so a prefix's placement is literally the
prefix of the full placement: if tiles *i* and *i+1* collide, they collide in every extension. Overlap is
invariant under the rotation and reflection that `cyclic_reps` quotients by, so no overlap-free
representative can be lost either. The probe asserts this rather than arguing it — it compares the emitted
overlap-free *sets*, not just the counts.

Measured (`analysis/prefix_prune_probe.py`):

| palette | baseline | pair-pruned | speedup | sets identical |
|---|---|---|---|---|
| `isotox-v8-base` @ v8 | 92.6 s | 13.1 s | 7.0× | 31,621 == 31,621 ✓ |
| `isotox-v8-rh` @ v8 | 920.5 s | 44.8 s | **20.5×** | 99,106 == 99,106 ✓ |

The win grows with palette size, which is the direction the atlas is going.

**To land it:** move the pair table into `gen_alphabet.enum_configs`, replacing the point-adjacency special
case; keep the leaf overlap check (it still catches the 12% that need 3+ corners, and the cyclic wrap pair).
`make check-regular` must stay byte-identical — the regular palette is convex-only, so every pair is
overlap-free and the table is empty there, which is the cheap way to see the guard will hold.

## 2. maxValence=12 costs nothing — it is where the palette saturates

I expected this to be the expensive knob. It is not. Sizing both palettes to the point where a longer word
stops closing to 360°:

| palette | v8 | v9 | v10 | v11 | **v12 (complete)** | v13 |
|---|---|---|---|---|---|---|
| `isotox-v8-base` | 31,621 | 31,661 | 31,661 | — | — | — |
| `isotox-v8-rh` | 99,106 | 104,791 | 106,073 | 106,255 | **106,281** | 106,281 |

**The base palette saturates at valence 9** (so the shipped `maxValence=12` is slack, and the valence-8 probe
lost exactly 40 configs — which produced zero k=1 families, since that arm's export was byte-identical to the
shipped one). **The rhombus palette saturates at 12**, and the complete table is 7.2% larger than the
valence-8 one: 51.6 s against 44.8 s with the pair prune.

So the "12 is a lower bound" caveat on the shipped 12 families costs **7 seconds of table build** to remove.
Do it. It is not a speed/completeness trade at all.

(This is the shape CLAUDE.md warns about from the other side: `maxValence` *is* a completeness knob, so it
must never be tuned down for speed — but here the honest setting is also nearly the cheap one, and the way to
find that out was to measure the saturation rather than to pick a number.)

## 3. k=2 is the one real unknown — and 547 s says it is affordable

The rhombus table is 3.26× the base table (≈111,800 vertexdefs against 34,329). The base k=2 solve was 547 s
on 8 workers. The scaling exponent of the dual search in table size is not something I can derive, so:
linear → ~30 min, quadratic → ~97 min. **Both are a coffee break, not "forever."**

There is no cheap way to know which, and the cheapest way to know at all is to run it. That is the
recommendation: run k=2 on the complete `isotox-v8-rh` table and record the wall clock. It is already
parallel; nothing needs building first except item 1 (which makes the table 20× cheaper to produce, so the
run becomes a single afternoon job rather than two).

**One measurement to add while doing it.** The runner logs only the aggregate wall, so shard imbalance is
invisible. The shipped k=2 run emitted 71–179 blocks per worker — a 2.5× spread, and if wall time tracks the
heaviest shard there is ~1.6× on the table from finer chunks with dynamic scheduling (`EU_SHARD_N` becomes a
chunk count fed to a pool of 8–10, rather than the process count). Emitted blocks are a weak proxy for time,
so log per-worker wall first and only then decide. It also matters that the M5's 10 cores are not
interchangeable (4+6 across two performance levels), which makes static round-robin worse than it looks.

## 4. Add rhombi one at a time — together they multiply

The interaction is not additive. Each low-unit corner is a cheap *separator* that lets more star-point
corners fit around one vertex, so two of them multiply the word count rather than adding to it. Measured at
valence 8 (all pair-pruned):

| palette added tiles | overlap-free configs @ v8 | note |
|---|---|---|
| — (base) | 31,621 | saturates at v9 |
| +30/150 | 99,106 | saturates at v12, complete = 106,281 |
| +45/135 | 102,043 | v9 = 105,884, same order |
| +30/150, +45/135, +15/165 | **1,109,410** | still *rising* at v8 (571,148 in the v8 bucket) — nowhere near saturation |

So `45/135` next is cheap and should be run the same way `30/150` was. **All three at once is the thing to
avoid**, and `15/165` is the one to leave for last: its 1-unit corner is the cheapest separator in the
palette, and the all-three table is already 10× the single-rhombus one *before* reaching the valence where it
stops growing.

## 5. The incremental union is sound, so nothing is ever recomputed

For a palette P and a new tile T:

> Full(P ∪ {T}) = Full(P) ∪ { t ∈ Full(P ∪ {T}) : T occurs in t }

⊇ because the search is monotone in the alphabet; ⊆ because a tiling either uses T or does not, and if it does
not it is in Full(P). So each new tile costs its own delta against a stored result, not a recomputation —
which is what makes "the scope keeps growing" survivable as corpora keep arriving.

`scripts/stabilize-family-ids.mjs` (landed with the rhombus) is the bookkeeping half of this: it splices a
fresh export onto the shipped one on `familySymbol`, keeps shipped ids and default α byte-identical, and
reports a shipped family missing from the new export as a REGRESSION rather than silently dropping it.

There is a solver-side version too, worth less than it first looks. With T-containing vertexdefs sorted to the
front of the table, min-type-root means every T-containing tiling has a T-type as its root, so only those
shards need running. But 67% of the rhombus table contains the rhombus, so that is ~1.5×, not a
transformation. Cheap to implement, small payoff, do it last.

## 6. Two free levers not worth doing yet

**Python 3.9.6 is the only interpreter installed.** 3.11+ typically gives 1.4–1.6× on call-heavy recursive
code like `enum_configs`, at zero risk. Free speed, but after item 1 the stage is 52 s, so it stops mattering.

**Parallelizing `gen_alphabet` by first corner class** (multiprocessing over the `cids` buckets, global dedup
at the end) is ~8× and structurally easy — the partition is disjoint and `iso_key`/A6 dedup is a hash pass,
not pairwise. Again: after item 1 the stage is 52 s. Premature.

Rewriting `enum_configs` in C++ beside the solver: unnecessary. It was the answer when the stage cost 15
minutes; it costs 52 seconds.

## What not to do

- **Do not lower `maxValence` for speed.** Completeness knobs are not speed dials, and here the complete
  setting is measured to cost 7%.
- **Do not raise `EU_NCBUDGET` without reading the warning.** `run-oracle-parallel.sh` counts how often the
  noncounting budget bound the search and says so; a bound search is not certified, and the rhombus palette
  will bind it more often than the base one did.
- **Do not fix the Makefile's `EU_PRUNE_OVERLAP` gap by exporting the variable in a wrapper.** It is a
  property of the palette (only non-convex alphabets need it), so it belongs in the palette JSON where it
  travels with the thing it describes.

## Order of work

1. Pair-prune `enum_configs` + `EU_PRUNE_OVERLAP` into the palette JSON. Guard: `make check-regular`
   byte-identical, and the probe's set-identity assertion on `isotoxal-star-z24`.
2. Rebuild `isotoxal-star-z24 + cx4-30.150` at the saturating maxValence=12, re-run k=1, and re-splice —
   this removes the "12 is a lower bound" caveat from the shelf. ~1 min of table + 2 s of solve.
3. Log per-worker wall time in `run-oracle-parallel.sh` (one line), then run k=2 on that table and record
   what it actually costs.
4. Same for `+cx4-45.135`, as its own delta.
5. Only then decide whether `15/165`, or the whole cx4 family at once, needs an idea beyond these.
