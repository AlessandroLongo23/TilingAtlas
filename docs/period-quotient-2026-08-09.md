# The period-p work of 2026-08-08/09 — what landed, what is withheld, what is next

Session record. Written because the last piece ended with a tier being pulled, and the reason it was
pulled is more useful than the tier would have been.

Ledger entries: `docs/DEVELOPMENT_NOTES.md` 2026-08-09 (two sections) and `docs/SYNC.md` (12)–(16).
Nothing in this session is committed.

---

## 1. What is in the atlas right now

The period-p shelf ships **27 families at k≤2** (1 at k=1, 26 at k=2), all verified against the concrete
grid pipeline. Their sliders now run past the convexity cut into the concave regime. That is the whole
shipped delta; the k=3 tier is built but withheld (§6).

| file | what |
|---|---|
| `public/reference-atlas-period.json` | the 27 families, with widened regions |
| `experiments/period-oracle/ctrnact-period-families.cells.json` | concrete family export (44 records pre-merge) |
| `experiments/period-oracle/period-range-plan.json` | measured true ranges + P≥2 regions |
| `experiments/period-oracle/ctrnact-quotient-families-k3.cells.json` | the k=3 tier, NOT shipped |

---

## 2. Three defects fixed in the shipped shelf

**A vertype is not a unique key, and two places assumed it was.** `read_blocks` in
`export_period_families.py` returned a dict keyed on the vertex-type line, so blocks sharing a vertex-type
multiset collapsed before analysis: **276 of 614** period-bearing blocks (54 of 83 at k=1, 223 of 531 at
k=2). `build-period-atlas.ts` had the matching defect, joining family absorption on the same string, so
absorbing one snapshot deleted its twin. Family identity now uses `canonical_map` (the complete labelled-
dart-map invariant, extracted from the isotoxal exporter into `coupled_flex.py` and verified against the
pre-extraction code on 2,800 cases), and snapshots join by cells-file id, checked index-by-index.

⚑ The pair that exposed it (`(3')` against `[3']`) turned out to be the SAME tiling. The fix is a fix, but
it was not what AL was looking at, and saying otherwise would have been the easy wrong answer.

Two merge corrections came with it: the congruence union-find must key on **(congruence, P)**, since
sharing a tiling makes two families the same only at equal dimension, and the survivor must be the LOWER
k, since the higher one is a non-primitive representation. Result: 21 → 27 families, k=1 restored.

**Every slider stopped at convexity, not at degeneracy.** `region_of` capped each corner at 180°, which is
where the tile flattens and its SPECIES changes, not where the tiling ends. All 33 single-parameter
families were truncated: **3,900° of arc gross, 2,100° net** after discounting folded replay (25 of the 33
are mirror-folded, isometry-confirmed), and for all 33 the newly opened arc contains no on-palette grid
configuration, so nothing else in the atlas was carrying it. `scan-family-ranges.py` was generalized to
P≥2: P=2 gets a measured region polygon (72 bisected rays), P≥3 the largest bound its corner half-planes
may be raised to (240°).

⚑ Generalizing it exposed a bug in its own health test. Walking outward, the cell can pass THROUGH a total
collapse: every area and the determinant hit 0, and one step later every tile has flipped sign, so the cell
is the mirror image reflected back through zero. Area certificate and simplicity both pass on that, which
is how the first 2-parameter sweep reported rays surviving a full 360°. `health` now carries the anchor's
orientation. Re-measuring the shipped mixed shelf with the check: all 42 entries unchanged.

⚑ And widening is worthless unless `region[].limitUnits` moves with it. `clampToRegion` runs on every
evaluation whenever a family ships `region`, P=1 included, so widening only `alphaRangeDegOpen` left the
readout climbing to 235° while the tiling sat frozen at 180°.

**The concave tiles then broke the fill.** `buildCellMesh` fan-triangulated every tile from its centroid,
justified in its own header by "regular tiles are convex and star tiles are star-shaped from their centre".
Extending the sliders falsified that the same day: a reflex corner cuts a notch the fan apex cannot see, so
the fan paints outside the outline and leaves part of the tile bare. `lib/render/triangulate.ts` (ear
clipping) already existed for exactly this reason on the isohedral shelf; `kernelHoldsCentroid` is the exact
test for the fan being valid, so convex and star tiles keep the cheaper path and byte-identical geometry.

---

## 3. The combined palette (regular + period-2 + period-3)

New, and it answers whether tilings mix the two families: **402 of 1,423 blocks (28%) genuinely use both**,
all at k=2. Example vertex pair: `(e3-6-135.120.105@0, e2-4-105.75@0, 3, 3)F`.

The full palette is not buildable. Measured by DP, validated against the shipped build log:

| variant | classes | words summing to 360° | ~tables |
|---|---|---|---|
| regular + p3 (ships) | 92 | 9,001,668 | 345 M |
| regular + p2 + p3, full | 116 | 5,827,587,231 | **223 GB** |
| … minus the 15° rhombus | 114 | 156,638,713 | 6 GB |
| … minus corners under 45° | 109 | 9,406,321 | 361 M |
| … `L ≤ 9` cap instead | 100 | 5,759,167,416 | 221 GB |

The length cap does nothing; one tile (`e2-4-165.15`, a 15° corner) is 37× of the space. Cutting at 45° is
also the more honest choice: `maxValence: 12` already silently truncates a 15° corner (which admits a
24-fold vertex) and a 30° one (12-fold), so including them buys an incomplete answer wearing a complete
face. Above 45° the maximum valence is 8 and the cap never binds.

Ran as `equi23-cx45-z24`: 33 symbols, 43 after mirror expansion, 917,298 configurations, 352 MB, alphabet
9.5 min, **solve 94 s**. It is a SCOUT, not a shelf: it excludes `e3-6-165.165.30`, which the period-3
shelf does carry.

Tooling: `enum_period_tiles.py --p` now takes a list (`--p 2,3`), and `--min-angle` was added with the
reasoning above recorded. Regenerating the period-3 palette through the new path gives a byte-identical file.

---

## 4. The star ladder does not port. Measured, not assumed.

AL asked whether the star k=9 unlock generalizes, since a star is period 2. The point-adjacency lemma DOES
generalize (it is literally the engine's own gluing test, `eu_solver.cpp`'s 4-bucket union): corners `a`,`b`
adjacent at `v` share an edge to `w`, where the tiles behind them contribute `NEXT/PREV(a)` and
`NEXT/PREV(b)`, adjacent at `w`. Forbid `(a,b)` when every admissible far pair already exceeds a full turn.

It forbids **0 of 8,464** pairs on regular+p3, and 49 of 11,881 on the combined palette. The star lemma is
a REFLEX-angle argument (two dents exceed 360° on their own) and convex period tiles have no reflex corners.

Same reason one level down: fixes 10–13 killed 58,555 of 60,927 vertex types on star24full (96%); on
equi3-cx-z24 the face filter kills **0 of 801,395**. A convex period palette's types are nearly all REAL.
There is nothing to delete.

---

## 5. The unlock: quotient the alphabet by tile SHAPE

They are nearly all REDUNDANT. 801,395 vertex types collapse to **22,677** once each period corner is read
as (shape, position) instead of (grid angle word, position); 99.3% sit in a class of size > 1, the largest
holding 16,444. An independent symbolic count of the same palette's shapes agrees at ~17,326.

⚑ Implementable only because `eu_solver.cpp` reads `CLASS_UNITS` in exactly ONE place (the flat-corner
guard). The search is otherwise purely combinatorial over CLASS_NEXT/PREV/L/P/TILE, and which
configurations close is decided at alphabet-build time on the CONCRETE classes, so every abstract
configuration emitted is the image of one that really closes. **No solver change at all.**

| | concrete | quotient |
|---|---|---|
| vertex types | 801,395 | 17,240 (**46×**) |
| tables.bin | 44.3 MB | 5.4 MB |
| k=2 solve | 47 s | **1 s** |
| k=2 nodes | 190,827,755 | 7,193,020 (**26.5×**) |
| k=3 solve | killed unfinished at 195 min | **509 s** |

The search becomes a relaxation (a tiling uses one angle assignment everywhere; abstract classes cannot say
so). `quotient_feasible.py` decides each candidate with the exact linear system — one row per shape for
polygon closure, one per vertex for the full turn, `0 < a < 180°` — by Fourier–Motzkin over ℚ, returning the
solution set's dimension as the family's parameter count.

**Gate at k≤2: 0 of 614 concrete blocks lost, and after the filter exactly the 85 grid-realizable abstract
types, no more and no fewer.** `make check-regular` PASS byte-identical throughout.

Entry points:
- `gen_alphabet.py --quotient-period`, or `"quotientPeriod": true` in the palette (`equi3q-cx-z24.json`)
- `quotient_feasible.py <pruned-dir>` — infeasible / pinned / family with P
- `export_quotient_families.py` — develops them; `emit_records` is EXTRACTED from the concrete exporter,
  which re-runs byte-identical

---

## 6. Why the k=3 tier is withheld

It was built (103 families at P=1/2/3 = 79/20/4, plus 70 pinned tilings), shipped, and pulled the same
session. The GEOMETRY is sound: all 173 cells pass the area certificate, tile simplicity, orientation
consistency and a direct covering test. The **k labels** are not.

Measured: **65 of 103 families and 29 of 70 pinned entries** carry a k that disagrees with the vertex-figure
count at the angles actually shipped. AL saw it directly ("this is really k=2, not k=3").

⚑ **One root cause.** `integer_seed` returns the FIRST integer point of a family's polytope in enumeration
order, and that is systematically a SYMMETRIC point where two abstract corner classes take equal angles.
Two abstract vertex types then collapse into one figure, so the tiling on screen has fewer orbits than its
label. The family's k is right GENERICALLY — abstract classes are distinct at a generic parameter, which is
what the engine counted — so the fix is to seed generically, not to relabel.

⚑ **"Rigid" was also the wrong word.** AL on rigid-k3-039: "the regular hexagon can be squeezed and the
irregular morph to accommodate for it." Correct. In the alphabet `6` is the REGULAR hexagon: one corner
class, six angles locked at 120°, held constant by the linear system. The deformation he describes turns it
into a NON-REGULAR equilateral hexagon, a different alphabet symbol the model cannot name. This is the
species cut the α-sliders hit at 180°, one level up. **P is a statement about the palette, not the tiling.**

⚑ **`trueVertexOrbitCount` is out of its validated domain here.** It reports 19 orbits for a 3-tile cell
that the covering test confirms tiles exactly, and normalising the cell into the fundamental domain does not
fix it. It was built for primitive-reduced cells from the exact composable dedup.

Also found and fixed before the pull: 46 of 230 pinned solutions are degenerate (they solve to a REGULAR
hexagon under a period-3 label, already in the regular atlas), and 10 of the surviving 70 are one PARAMETER
VALUE of a family already shipped (rigid-004 is period-family-k2-029 at α=150°).

⚑ **Completeness at k=3 is unverified.** The concrete cross-check was killed unfinished at 195 min, so
nothing independent confirms the quotient found everything there. At k≤2 it is verified block-for-block.

---

## 7. Next, in priority order

**1. Generic seeding, then re-ship k=3.** ✅ SEEDING DONE 2026-08-09 — see §9. Re-ship still open. Replace `integer_seed`'s first-found point with a point maximally
far from the polytope's coincidence hyperplanes (`a_i = a_j` for corner classes of the same shape). Then
recompute each entry's k from the geometry at that seed. This alone should fix the 65 + 29 mislabelled
entries, since the family's k is already correct generically.

**2. A vertex-orbit counter that is trustworthy on developed cells.** ✅ DONE 2026-08-09 — see §9. `trueVertexOrbitCount` fails here.
Needed for the k labels to mean anything on any quotient tier. Until then the tier cannot be presented as a
k-indexed count.

**3. An independent completeness check at k=3.** Either finish a concrete k=3 solve (budget many hours, it
was unfinished at 195 min) or find a cheaper cross-check. Without one, the k=3 tier's coverage claim rests
on a structural argument alone.

**4. Exact congruence on the quotient side, to reconcile k≤2.** The quotient reaches 34 families at k≤2
where the concrete pipeline reaches 27; its merge is a sampled float congruence against the concrete path's
exact ℤ[ζ₂₄] one on snapshots. Reconciling these is what would let the quotient own the whole shelf instead
of only the tail.

**5. Let the regular tiles flex.** The natural answer to §6's second point: a palette whose regular n-gons
carry their full corner freedom (period-L with the angle-sum constraint). Many of the 70 pinned entries
would become families with real sliders, and the shelf would stop making palette-relative claims sound
intrinsic.

**6. Ship the combined p2+p3 scout properly.** 402 mixed-period blocks exist. Either add
`e3-6-165.165.30` back and accept the cost, or ship it labelled as a 45°-cut corpus. Do not present it as a
catalogue while it silently excludes a tile the period-3 shelf carries.

**7. Smaller, still open.** The 230 pinned k=3 tilings need the fixed-angle develop path once (1) and (2)
land. `EU_PRUNE_OVERLAP` finds 0 forbidden pairs on every period palette measured, which is worth one look
before anyone assumes the prune is doing work.

---

## 8. Corrections made to my own claims during the session

Recorded because each was caught by checking rather than by shipping, and the pattern is the useful part.

- "Symbolic search would be 294× WORSE." Wrong: the estimate omitted the corner-angle bound. Real convex
  period tiles here have corners in [30°, 165°], which caps valence at 12. Restricted properly it is 46×
  BETTER, which is the whole of §5.
- "7 families exist with no grid realization." Wrong: my shape key dropped the edge count, conflating
  `e3-9` with `e3-6` whose closure sums differ (28 vs 24 units). A hand check (28+24 ≠ 48) exposed it. The
  true count at k≤2 is **0**.
- "The congruence dedup merged 0 of 100 families." True but for a swallowed reason: `isometry_between` wraps
  its α in a list and was single-parameter only, so every multi-parameter call raised a TypeError my
  `except` discarded. Generalized, it found 37 congruent pairs among the first 24.
- "The alternating/aligned strip pair are two tilings." Wrong: rendered side by side and keyed by exact
  ℤ[ζ₂₄] congruence they agree.
- An invariant prefilter keyed on cell AREA would have blocked the very merges it was meant to accelerate,
  because area varies along the curve. Topology only.

---

## 9. Later the same day: next-steps 1 and 2, built

Both pieces are in. §6's diagnosis was right in kind and wrong in size, and the correction is below.

**The counter — `tools/ctrnact-oracle/vertex_orbits.py`.** `trueVertexOrbitCount` fails on developed
period cells for two structural reasons, not tuning ones. It canonicalises each vertex patch over 24 FIXED
rotations (the ζ₂₄ powers), which is exact on every grid shelf and meaningless once the angles are solved
instead of enumerated; and it never reduces the vertex set modulo the lattice, so nothing bounds the
candidate count. That is how a 3-tile cell reached 19 orbits when Euler caps it at V = E − F = 6.

The replacement reduces mod the lattice first and derives each isometry from the geometry — the nearest
labelled neighbour pins the rotation, direct and reflected, the same argument `scan-family-ranges.py`
already uses — with an explicit bijection between the two inner disks, not a one-way containment.

Its licence to operate is `--gate 6`: Galebach's enumeration ships inside `public/reference-atlas.json`
with its published k, from outside this project entirely, and the counter reproduces **all 1,248** at
k = 1..6 with zero disagreements. `--gate 3` is the 4-second form for after an edit.

**The seed — `generic_seed` replaces `integer_seed`.** Every integer point of the polytope is enumerated
(a few thousand at worst) and scored on the SORTED vector of gaps between corner angles the system does
not force equal, with the regular tiles' fixed angles counted as competitors. Maximising `min(gaps)`
instead — my first version — is not equivalent and picked the coincident point on 34 of 100 k=2 families,
because one unavoidable zero flattens the score and hands the decision to the tiebreak.

**What each piece fixed, on the same withheld export.**

| defect | count | fixed by |
|---|---|---|
| family renders fewer orbits at its own default than it has generically | 12 of 103 | generic seeding (now 0) |
| family is k=1 at every parameter, labelled k=3 | 7 of 103 | the counter |
| pinned tiling is k=2 at its only parameter, labelled k=3 | 25 of 62 | the counter |

The re-exported tier is 107 families (100 at k=3, 7 at k=1) and 61 pinned tilings (36 at k=3, 25 at k=2),
in `experiments/period-oracle/ctrnact-quotient-families-k3-generic.cells.json`. Still not shipped.

⚑ **§6's "65 of 103 families and 29 of 70 pinned" does not reproduce and is withdrawn.** The orbit count
gives 7, the distinct-vertex-figure count 29. Neither is 65. The real damage was 12 + 7 + 25, and §6's
"one root cause" is also too strong — the seed is one cause of three, and the smallest.

⚑ **The shipped k≤2 shelf has 4 wrong labels of its own.** `build-period-atlas.ts` applies the chirality
correction to snapshots and never to family records, so `period-family-k2-038`, `-039`, `-042` and `-043`
ship as k=2 and measure k=1 — two chiral orbits joined by a reflection, exactly the case
`trueVertexOrbitCount` exists for and never got to see. `export_period_families.py --true-k` stamps the
concrete path too (off by default; the plain export re-runs byte-identical), so correcting it is one flag
and a rebuild of the shelf.

**What this leaves.** §7's items 3–7 stand unchanged, and item 1's second half — actually re-shipping k=3
— is still open and still gated on completeness, which nothing here touched. Two new questions the
relabelling raises: whether the 7 k=1 families duplicate the k=1 hexagon family already on the shelf, and
whether the 25 relabelled pinned tilings duplicate k=2 entries. Both are cross-tier dedup, and both have
to be answered before the tier ships, or the shelf gains the double-count its own rule forbids.

---

## 10. Later still: 4 labels shipped, and what cross-tier dedup actually found

**Shipped.** `export_period_families.py --true-k` and a shelf rebuild. Diffed against the previous shelf:
exactly 4 `k` values changed (038, 039, 042, 043 → k=1), zero other fields, same 27 ids, regions and
sliders untouched. The shelf's labels are now the measured ones.

**Cross-tier dedup needed a different tool than the plan assumed.** The sampled-congruence join —
grid the shelf, sample the candidate, hash the patch, confirm with an isometry — has essentially no
recall on continuous families, and it fails quietly, reporting everything as new. The positive control is
the whole story: feed the 27 shelf families back in as candidates and **0 of 27 find themselves**.

**`tools/ctrnact-oracle/tiling_key.py`** replaces it with an exact test. A tiling's combinatorial map is
constant along its family and fixes the ambient corner-angle space; the family is an affine subspace of
that space; so identity is subspace equality and redundancy is containment. The map alone is not enough —
`k2-001` and `k2-021` share the honeycomb map and are different entries — which is precisely why the
subspace layer exists.

⚑ **My first version of that key passed its gate while being malformed.** 1,248 Galebach tilings gave
1,248 distinct keys, and the map was still wrong: the translation test used a rotation-blind tile label so
a half-turn was accepted as a period, and the edge pairing reused a neighbour's corner index on a
representative whose vertex list starts elsewhere. An injective function is not a correct one. What caught
it was asserting that α must be a fixed-point-free involution — it was not. The intermediate claim from
that run ("the shelf collapses 27 → 22, with 038 ≡ 039") is **retracted**; 038 and 039 are genuinely
different tilings, with different primitive cells.

Gates now: 1,248 distinct tilings → 1,248 distinct keys; one key per shelf family across 5 generic
parameters; hull dimension == P for all 27; the key unchanged under 2× and 2×2 supercells for all 27.

**The shelf has redundancy of its own.** `k2-042` is `k2-038` at α = 105°, `k2-043` is `k2-039` at α =
105°, and `k2-038` ⊂ `k1-007` ⊂ `k2-001`, `k2-021` ⊂ `k2-001`. Each confirmed twice over: the linear solve
predicts the containing family's parameter to ~1e-14 in angle, and an explicit isometry confirms it there.
Whether a strict sub-family should be dropped or kept as a named locus is a curation call, not a bug —
but the shelf currently presents them without saying they are contained.

**The k=3 tier against the shelf**, 168 candidates: **6 same** (6 of the 7 relabelled k=1 families are
shelf families already), **5 contains** (the candidate is strictly LARGER than a shelf entry — 1 at k=1
and 4 at k=3), **4 inside** (3 pinned k=2, 1 k=3 family), **153 new**. So §9's duplication worry was real
and is now bounded, and it cuts both ways: 5 of the overlaps say the quotient found the larger family
where the concrete shelf carries only a slice. 22 of the 25 relabelled pinned k=2 tilings are new, which
is evidence about the concrete shelf's coverage at k=2, not only about labels.

**What is still open before k=3 ships.** Completeness at k=3 is untouched. The 15 overlapping candidates
need a curation decision (drop the 6, and decide whether a larger candidate should replace the shelf entry
it contains). And the shelf's own 5 redundant entries deserve the same decision.

---

## 11. SHIPPED — k=3 is on the shelf

The period-p shelf is **154 entries**: 42 eager at k≤2 (6 at k=1, 36 at k=2) and a lazy **k=3 shard of
112** (`public/reference-atlas-period-k3.json`, 464 KB).

**Curation applied.** `scripts/cross-tier-dedup.py` now runs two passes. Internally, the tier against
itself: 36 of 168 dropped, 13 subspace-equal and 23 contained — the tier's own dedup had used the sampled
congruence, so this was the expected fallout. Then the 132 survivors against the 27 concrete families: 1
same, 4 inside, 4 contains, 123 new. **127 ship.** `build-period-atlas.ts` throws if the verdict file is
absent, because shipping the tier unfiltered would put 41 proven duplicates on the shelf.

The 4 "contains" entries ship next to the concrete family they contain: the quotient found the larger
family, and dropping verified concrete content is an author call. Ids are prefixed `period-quotient-*` —
the tier and the shelf both had a `period-family-k1-007`.

**A bug that was hiding every lazy tail.** The shard built, served 200, and the library showed 0 tilings.
The base atlas load does `setTilings(d)`, a REPLACE, and a 464 KB shard beats a multi-megabyte
`reference-atlas.json` whenever its class is already in the URL: the merge landed, the base landed on top,
and the shard's k was marked loaded so nothing retried. The hyperbolic and decoration effects already
guard against exactly this and say so in a comment; the three shelf-shard effects did not. It had been
breaking isotoxal the same way — `/library?class=isotoxal&k=3` showed 0 of its 523 tilings. Both fixed.

**What is still open.** Completeness at k=3, untouched: this tier is a lower bound, and every k=3 entry's
note says so. The shelf's own redundancy from §10 (`k2-042` = `k2-038` at α=105°, and three containments)
is still there and still an author call. §7's items 4–7 stand.
