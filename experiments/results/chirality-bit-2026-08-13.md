# The chirality bit: it was in the alphabet, not in the gluing (2026-08-13)

**Engine** `tools/ctrnact-oracle` · **Gate** `make check-regular` byte-identical throughout

The σ hole was the last thing standing between the edge-typed engine and a complete catalogue: 11 of
`tri45`'s 27 vertex types, 79 of `tri45all`'s 234, 42 of `girih`'s 412, were reported UNUSABLE because
a mirror in a vertex's site symmetry maps a tile to its reflection, which permutes that tile's corner
classes, and `fold()` stores one class per dart. The standing diagnosis was that closing it needed "a
chirality bit per dart" threaded through `checkface`, `simplify`, the pruner's WL and `attach`.

It needed one line in the generator. The bit is real, but it lives on the CLASS, not on the seam.

## The fix

A dart is (half-edge, side). H's rotations preserve the side and its reflections flip it, so an
orbit's side-0 darts all carry one class x and its side-1 darts all carry σ(x) — never anything else.
The orbit therefore HAS a well-defined class once you say which side you mean. `fold()` was storing
`min(x, σx)`: not a side, not a class, just the smaller integer of the two.

Storing the SIDE-0 reading instead makes the model consistent, and the identity that carries the other
side through the engine is

    SIGMA[cls[mirro x]] == cls[rneig x]

which `certify()` now checks in place of Marek's `cls[mirro x] == cls[rneig x]` — the same test
whenever σ is the identity, which is every equilateral palette. Verified to hold on all 11 σ-mixed
`tri45` entries; the unadjusted form fails on all 11.

## What it bought, against a known answer

`fdsq.json` is the square freedraw grid with the marking on the TILE — σ ≠ id, 96 of 728 entries
sided — and freedraw's own enumeration says the answer is 1,420 patterns at k ≤ 3 and 9,268 at k ≤ 4.

| | k=1 | k=2 | k=3 | k=4 | verdict |
|---|---|---|---|---|---|
| `min()` | \- | \- | \- | \- | **164 of 1,420**, 11 filed under the wrong k |
| sided | 13 | 153 | 1254 | 7848 | **9,268 of 9,268**, none invented, every k right |

k=4 was a held-out tier. `fdsq` now returns exactly what `fdsq2` returns — 18 / 271 / 2754 / 21967
pruned solutions on both — so two structurally different palettes for the same object agree entry for
entry, which is the cross-check the shelf never had.

A6 came clean at the same time, on **every** palette that had lost it — and A6 is what licenses the
pruner's dedup, so those three alphabets go from unshippable to certified:

| palette | iso-fold collisions before | after |
|---|---|---|
| `tetromino` | 24,005 of 54,856 | **0** |
| `composite-decomp` | 2,714 of 9,159 | **0** |
| `girih` | 112 of 412 | **0** |
| `fdsq` | 28 of 728 | **0** |

The collisions were the `min()` flattening making distinct entries indistinguishable, not a limit of
the model. The rebuild-or-pin question raised against those three shelves this morning is answered:
rebuild, on an alphabet that now certifies.

## The 45-45-90 shelf

Rebuilt on the corrected alphabet and shipped: **5,313 distinct tilings at k ≤ 4** (16 / 160 / 941 /
4196), against the 4,285 previously on the shelf. `scripts/build-tri45-shelf.mjs` certifies what it
writes — every edge is 1, √2, 2 or 2√2, the faces cover the period cell exactly, and (new, added
here) every vertex sums to a full turn. A fourth check, run separately: no tile has a corner strictly
inside another tile's edge.

⚑ **RETRACTED, and it was mine.** I first reported that the old catalogue and the old shelf contained
objects that are not tilings — 209 records with a vertex past 360°, two of them at 1440°, four sheets
wrapped round a point — and that the count falling was the removal of those. That was a bug in the
checker, not a fault in the data. It reduced each record to its primitive period lattice and then
summed angles over the ORIGINAL face list, so a tiling presented on a 4× fundamental domain had every
tile counted four times and read 1440° where it should read 360°. Re-measured correctly: **both
catalogues, and both shelves, have every vertex at exactly 360°.** Nothing overlapping was ever
shipped, and nothing overlapping was removed.

⚑ **Open, and not established either way.** 650 of the old shelf's entries are ones my canonical form
cannot locate in the new shelf, and all 650 pass every geometric certificate. Two things stop that
being a loss claim. A sample of 400 says most are out of range rather than absent: 341 have a
geometric vertex-orbit count above 4, so the old shelf filed them under a k lower than their true one
and the new shelf cannot hold them at k ≤ 4 at all. And the referee itself is not trustworthy —
`tiling_canon.py` collapses the old shelf's 4,285 entries to 3,976 where the builder's own fingerprint
keeps them distinct, so a disagreement of a few hundred is inside its own error. Both hand-rolled
referees here (`tiling_canon.canonical` and the orbit counter) disagree with the engine and with the
builder on samples where the engine is independently known to be right, so **no duplicate count, no
mislabelled-k count and no lost-tiling count in this file should be quoted.** What licenses the
rebuild is not those: it is that the alphabet under it reproduces an independent enumeration exactly
where ground truth exists, and that the shelf it writes passes four certificates.

## The flip bit, implemented and reverted

The obvious reading of "a chirality bit per dart" is a flip on each GLUING: two half-edges can be
identified side-0-to-side-0 or side-0-to-side-1, and the search only ever tried the first. That was
built — `conf.gflip[]`, a σ-aware `checkface` accumulating the parity, the flip loop at both gluing
sites, the candidate index disabled because its key is computed unflipped — and then reverted, on
three measurements:

- **It finds nothing new.** `tri45all` k ≤ 3: identical 16 / 161 / 1132.
- **It costs 26×.** 33,798 raw solutions pruning to the same 1,309.
- **It corrupts k.** On `fdsq`, where the answer is known, it still found all 1,420 patterns but filed
  **41 of them under the wrong k**.

The reason it is redundant: gluing f to i with a flip imposes the same pair of face constraints as
gluing f to `mirro[i]` without one, with the two faces exchanged — and `mirro[i]` is a different free
dart the loop already visits. The freedom was in the enumeration all along. The comment at
`SIGMA_TRIVIAL` in `eu_solver.cpp` records this so it is not rediscovered.

## Two bugs found on the way

**`make eu_solver_rt MAXNUM=4` after a MAXNUM=3 build was a silent no-op.** The runtime solver bakes
in `-DMAXNUM` and had no stamp, so make called the older binary up to date and the search stopped one
k short with no error — the tri45 shelf reported k=4: 0 tilings, and `run-sts.sh fdsq2 4` lost its
whole top tier. It now gets the same parse-time deletion `eu_solver` has. Scoped to an explicit
`eu_solver_rt` goal: unscoped it fires on `make PALETTE=x eu_pruner.x`, which passes no MAXNUM,
defaults it to 11, and deletes the solver a caller had just built.

**`develop_tri45.build` never ran `mirror_expand`.** A chiral tile's mirror is a separate alphabet
symbol with its own corner classes; skipping it shifted every class id after it, so the developer
would have decoded solutions against a different alphabet than the search used.

## What is still true

σ comes from the ANGLE word, so every non-equilateral tile has one — the 45-45-90 triangle's mirror
swaps its two 45° corners whether or not the palette names its edges. That is now handled, not
avoided: `sch236e`, the (2,3,6) Schwarz triangle at 1 : √3 : 2, generates with 20 of 42 entries sided
and A6 clean, where a week ago the generator exited on it.

## Files

- `alphabets/gen_alphabet.py` — the sided class in `fold()`, the σ-aware certificate, `CLASS_SIGMA`
- `tables/*/tables.{py,bin}`, `*_tables.inc` — carry `CLASS_SIGMA`; `tables.bin` is now CTRNTB03
- `eu_solver.cpp` — loads `CLASS_SIGMA`, reads nothing through it, and says why
- `tiling_canon.py` — canonical form, duplicate and containment reports for developed catalogues
