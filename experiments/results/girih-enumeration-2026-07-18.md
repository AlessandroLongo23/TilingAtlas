# Girih tile-set enumeration — Čtrnáct engine, fivefold (D=20)

Date: 2026-07-18. Author: CC. Status: DONE (k≤4).

## What this is

The first run of our combinatorial enumeration engine (`tools/ctrnact-oracle/`, the Čtrnáct dual-search)
on the **Islamic girih tile set** — the five equilateral tiles of Lu & Steinhardt (2007): regular decagon,
regular pentagon, and three composite tiles (wide rhombus / *torange*, elongated hexagon / *bobbin*, and
the non-convex *bowtie* with a 216° reflex corner). Palette:
`tools/ctrnact-oracle/alphabets/palettes/girih.json`, D=20 (18° grid, fivefold).

This is the "run our method on these tile sets" experiment. It answers: **how many k-uniform tilings can
the girih kit form?** It does NOT reproduce the famous historical girih patterns (those are specific,
often aperiodic designs; this enumerates the periodic k-uniform ones).

## Results — distinct k-uniform tilings on the girih kit

| k | Combinatorial (default) | Geometrically vertex-filtered (`EU_PRUNE_OVERLAP=1`) |
|---|---|---|
| 1 | 18   | 18  |
| 2 | 138  | 130 |
| 3 | 685  | 645 |
| 4 | 3653 | (not run; filter available) |

The overlap filter drops vertex configs whose placed tiles physically overlap (28 of 368 configs), so its
counts exclude vertex-level-impossible figures. The k=1 counts agree (all 18 one-uniform tilings are
vertex-feasible).

Runtime (this machine): k≤3 in ~6s, k≤4 in ~174s (solve DFS dominates; ~5× tiling growth and ~30× time
per k). k=5 would be ~18k tilings and ~1h+ — not run.

## Engine change (one edit, guarded)

`alphabets/gen_alphabet.py`: the `min_len` gate (which admits noncounting valence-2 vertices) now also
fires for a palette carrying a **reflex composite tile** (a corner > D/2). Without this, the bowtie's 216°
notch filled by a single decagon/bobbin corner (216° + 144° = 360°, a valence-2 vertex) is silently
dropped — and those vertices dominate the girih k=1 tilings. Gated on reflex composites specifically, so
the regular palette and the existing all-convex composite palettes keep `min_len=3` and stay
byte-identical. **`make check-regular` PASS** (regular k≤6 = 10/20/61/151/332/673, byte-identical vs
golden) after the edit.

## Validation

- **Determinism:** k≤2 re-run reproduced 18/138 exactly.
- **Count cross-check:** the pruner's per-k stderr totals match an independent `grep 'Count type:'` of the
  pruned blocks (18/138/685).
- **Geometric sanity (the strong one):** at k=1 the tilings use ONLY bobbin/bowtie/rhombus — **no decagon,
  no pentagon**. The decagon first appears at **k=2**, in the decagon+bowtie (`aw`) family. This
  independently reproduces the geometric fact that regular decagons cannot tile vertex-transitively
  (10-fold is non-crystallographic) and need filler tiles + more vertex orbits — the exact reason the
  curated catalog couldn't hand-author a periodic decagonal tiling. The engine found it combinatorially.
- **Alphabet cert:** gen_alphabet A6 = 569 entries pairwise non-isomorphic PASS.

## Caveats (read before quoting these numbers)

1. **Combinatorial candidates, NOT geometrically certified.** `develop` (exact geometry) is ζ₂₄-only and
   cannot represent fivefold (36°) directions, so it is skipped for D=20 — same design as the `star20`
   palette. The engine's dual-search + closure check is combinatorial; the `EU_PRUNE_OVERLAP` filter adds
   single-vertex geometric feasibility, but neither confirms that a whole tiling develops to valid exact
   geometry. Treat the counts as **combinatorial k-uniform candidates**, upper bounds on the geometrically
   realizable set. Full certification needs a ζ₂₀ (or ζ₆₀) develop extension — the natural next step.
2. **No reference target.** There is no published k-uniform enumeration of the girih kit to validate
   against (unlike the regular family vs A068599). These counts are novel and unverified externally.
3. **Not the famous designs.** These are periodic k-uniform tilings from the girih tiles, not the specific
   historical girih patterns (many of which are aperiodic or higher-complexity).

## Developed to geometry + imported to the library (2026-07-18, later)

The combinatorial counts above are now rendered. `tools/ctrnact-oracle/develop_girih.py` is a self-contained
**float developer for arbitrary D**: it reuses the engine's proven combinatorial `decode` (ported faithfully
from `ctrnact_decode.hpp`, reading `tables/girih`), flood-fills tiles in `complex<double>` using the
per-corner `CLASS_UNITS` angles on the 18° grid, extracts one fundamental domain's tile faces, and gates
each on the area certificate (Σ face area = |det Λ|). It exists because the C++ `eu_develop` is ℤ[ζ₁₂]-only
(D=12) and cannot represent fivefold; this is a new file, so no existing developer/palette is touched.

- **All 4494 k≤4 tilings developed with the area cert PASSing** (0 errors) — every combinatorial tiling is
  geometrically realizable. Output: `experiments/results/girih-developed.cells.json`.

### CORRECTION — the raw counts over-count (supercell inflation)

The raw pruned counts (18/138/685/3653) are **NOT the number of distinct k-uniform tilings** — they are
inflated by **non-primitive (supercell) combinatorial duplicates**. Developing to geometry exposed this: of
the 4494 developed tilings, **908 have a translation symmetry finer than their own cell** (the tiling
repeats inside the fundamental domain), so they are supercells of smaller tilings — and their k is
mislabeled (e.g. an 8-bobbin supercell of a k=1 bobbin tiling gets tagged k=4). This is a side effect of
the `min_len=2` valence-2 admission (needed for the reflex bowtie notch): the same geometry can be
described combinatorially many ways, and the pruner's WL isomorphism dedup treats them as distinct. The
regular palette is unaffected (no reflex → no valence-2 admission → counts still match A068599 exactly).

- Import (`scripts/build-islamic-atlas.ts`) now **drops non-primitive supercells** (translation-symmetry
  test keyed on the true tile identity, bobbin≠bowtie), then deduplicates the primitives by (k, tile
  multiset, |det Λ|), each **re-validated through the coverage validator**. Result: **185 distinct
  primitive tilings** — **4 at k=1, 23 at k=2, 55 at k=3, 103 at k=4** (down from the inflated 205 before
  the supercell fix). Verified lossless: every distinct primitive geometry is produced by a
  genuinely-primitive tiling, so nothing real is dropped.
- **Cross-set dedup (2026-07-18, later — fixes a visible k=1 duplication).** Three of the four k=1 primitive
  tilings are the single-tile bobbin, wide rhombus, and bowtie — geometrically identical to the hand-curated
  fivefold entries (`isl-5f-bobbin/rhombus/bowtie`), so the library was listing each of those twice (e.g.
  `isl-girih-k1-003` == `isl-5f-rhombus`, `isl-girih-k1-004` == `isl-5f-bowtie`). A congruence-invariant
  fingerprint (k, sorted tile areas, |det Λ| — side count alone can't separate bobbin from bowtie, both n=6)
  now drops any engine tiling congruent to a curated one, keeping the curated version (historical name +
  Bonner citation). **182 engine tilings ship** (1/23/55/103); the one surviving k=1 is the genuinely-new
  bobbin+bowtie two-tile cell (`isl-girih-k1-001`). With the 10 curated, the library holds **192 Islamic
  tilings**, 0 congruence-fingerprint collisions across all 192. They ship as `source:"islamic"`,
  `islamicSystem:"fivefold"`, `discoverer:"Čtrnáct engine"` (ids `isl-girih-k{k}-NNN`), including the
  decagon-and-bowtie ring-of-ten-stars that hand-curation could not reach.
- **Honest status of the counts:** the true number of distinct fivefold girih k-uniform tilings is the
  primitive count (185 for k≤4, deduped as above), NOT the raw pruned count. A geometric (not just
  combinatorial-WL) dedup in the pruner would be needed to get the primitive count directly from the engine.
- **k=4 solve run in parallel** (`run-oracle-parallel.sh`, 8 workers, 118s wall) and confirmed
  **byte-identical counts to the serial run** (18/138/685/3653) — a serial-vs-parallel cross-check. (k=5
  was attempted but the serial DFS was still running past ~1h with no completion; deferred — the ~5×/level
  growth puts it near 18k tilings.)
- These are **combinatorial candidates developed to float geometry**, not exact-geometry certified. The
  area cert + coverage validator confirm each tiles the plane; there is still no external reference count.

Reproduce the develop + import:
```
cd tools/ctrnact-oracle
python3 develop_girih.py --pruned run-k3-girih/out/pruned --kmin 1 --kmax 3 --out ../../experiments/results/girih-developed.cells.json
cd ../.. && pnpm tsx scripts/build-islamic-atlas.ts   # dedup + coverage-validate + import → 192 tilings (182 engine + 10 curated)
```

## Reproduce

```
cd tools/ctrnact-oracle
PALETTE=girih ./run-oracle.sh 4                 # combinatorial: 18 / 138 / 685 / 3653
EU_PRUNE_OVERLAP=1 PALETTE=girih ./run-oracle.sh 3   # vertex-filtered: 18 / 130 / 645
make check-regular                               # guard: PASS, regular unchanged
# counts: grep -rh 'Count type:' run-k4-girih/out/pruned/eupruned_0N_*.txt | wc -l
```
