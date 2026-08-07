# The star shelf: star24full k<=4 into the atlas (2026-08-07)

263 new star-bearing tilings shipped, 391 of them at k=4 which did not exist before. Four bugs were
found on the way in, three of them mine.

## What replaced what

The shipped star shelf was 172 records from the "in-ring star palette" runs: 26 at k=1, 45 at k=2, and
101 at k=3 from a partial solve the files themselves call `k3-preview`. star24full k<=4 **strictly
contains all 172** (checked by vertype, zero missing), so it supersedes that corpus instead of sitting
beside it. AL chose replace-and-carry-flags over a parallel shelf.

| k | star-bearing now | previously | new |
|---|---|---|---|
| 1 | 33 | 26 | 7 |
| 2 | 54 | 45 | 9 |
| 3 | 108 | 101 | 7 |
| 4 | 240 | 0 | 240 |
| | 435 | 171 | **263** |

(171 not 172: one vertype occurs twice across the old files.)

Folding the proven alpha-families gives the shelf: **407 entries**, k = 23 / 46 / 108 / 230, of which 17
are alpha-slider families and 12 are the out-of-ring 9-fold/5-fold records that star24full cannot
contain. Every entry is star-bearing.

## Pipeline

    eu_solver (landed face filter) -> eu_pruner -> export_atlas_cells.py --only-star -> stage -> build-reference-atlas.ts

All 435 records developed in exact ZZ[zeta_24] with **zero area-check failures**. Families came from
`export_family_cells.py` (symbolic-alpha development, rank-2 closure, area certificate at 11 samples):
17 families, all 11/11 checks passing, 57 snapshots folded.

⚑ The alpha-family count is NOT the naive one. Abstracting alpha out of the vertype by regex suggests 38
multi-member groups; the prover finds 17. The pinning test is linear algebra on the angle-sum
constraints, so dim 0 is a proof of rigidity, and alpha-lookalikes that do not flex correctly ship as
separate tilings.

## Four bugs

**1. 243 duplicate regular tilings (mine).** I exported without `--only-star`, so the palette's
pure-regular solutions came along: 11/20/61/151 = 243 records, exactly the regular catalog already in
the atlas from Galebach/ctrnact. Invisible on the star shelf (no star in the family label) but
duplicated elsewhere. The old corpus had zero of these. Caught because AL asked whether the shelf counts
were right.

**2. Positional ids would have silently repointed deep links (mine, avoided).** Ids are positional
(`ctrnact-star-k2-01`), and the new corpus orders differently, so renumbering would have left existing
links resolving to a DIFFERENT tiling. Every one of the 172 carried-over records keeps its original id,
matched by vertype; only genuinely new records get fresh ids (`-nNNN`).

**3. Family candidacy silently fell through to Myers (mine).** Phase 5 derives candidacy from
`m.atlasId in candidateIds`, but I ran the family prover against `ctrnact-s24f-*` ids and then staged the
cells under `ctrnact-star-*` ids. 0 of 57 member atlasIds matched, `isCandidate` was always false, and
all 17 families fell through to the default attribution — "Joseph Myers, reproduced" — including five at
k=4. Myers enumerated k=1 (2004) and k=2 (2009); he never did k=4. Fixed by remapping atlasId via
vertype. AL spotted this in the library UI.

**4. Duplicate atlas id (mine).** `tests/atlas-id-unique.test.ts` failed: two k=3 records share a
vertype (distinct tilings, different gluings) and both inherited the same preserved id. Id preservation
now keeps the old id for the first record and mints a fresh one for any later record sharing that
vertype.

## Attribution, and a pre-existing bug fixed

`build-reference-atlas.ts` attributes any star record without a `candidate`/`preview` flag to **Joseph
Myers, reproduced**. Phase 4 never sets `preview`, and `ctrnact-star-k3-preview.cells.json` carries no
candidate flags, so **all 101 shipped k=3 star records were attributed to Myers** even though his
enumerations stop at k=2. Replacing them with our complete k=3, flagged, fixes that.

346 of the 407 entries now carry `candidate:true` (attributed to AL, certification `candidate`): every
record not in Myers' k=1/k=2 sets. No external cross-check exists for any of them. Marek's solver on the
15 degree grid is the only independent check available.

⚑ **A visible attribution change.** Under the builder's existing rule (a family is candidate iff ANY
member is), all 17 families now read as AL/candidate where 1 of 12 did before, because our families have
more alpha-snapshots and the extra ones are not in Myers. Defensible (a continuum containing tilings
Myers never listed is not "reproduced") and it is the rule already in the code, but it is a change and
AL may want families whose Myers-era members dominate special-cased.

## Out-of-ring (9-fold D=18, 5-fold D=20)

star24full is ZZ[zeta_24] and cannot contain 9- or 18-fold tiles, so those ship separately. Complete
catalogs are now cheap (the face filter takes ring18 k<=3 from 17 s to 0.03 s):

| | in atlas | now | new |
|---|---|---|---|
| 9-fold (D=18) | 3 / 4 / 4 / — | 3 / 4 / 4 / **5** | 5 at k=4 |
| 5-fold (D=20) | 1 | 1 | 0 |

**D=20 has nothing at k>=2 at all.** Six tilings exist in the whole ring, all 1-uniform (filtered and
unfiltered agree), and one carries a tile D=24 cannot express.

17 records over 17 distinct shapes, no alpha-snapshot duplication (a 9-/18-fold star pins alpha, so no
families arise). All 12 previously-shipped records keep ids and attribution.

**Real fix to `export_ring_cells.py`:** `--contains 9,18` matched `[(,](\d+)[,)]`, which only catches a
BARE token, so `18*d15` never matched and the k=2 export produced 1 record where the atlas ships 4. It
now matches star tokens too.

⚑ **Rejected: filtering by whether the angles land on the zeta24 grid.** I replaced `--contains` with
"keep blocks having a tile that cannot exist in ZZ[zeta_24]" (n | 24, and for stars 24a % D == 0),
validated it (the 61 D=18 blocks it calls in-ring are ALL in the star24full catalog after a_18 -> 4a/3,
0 misses) and staged 51 records. **AL caught that it was wrong.** alpha is a FREE parameter for flexing
families: a family exists at every alpha in its range, so the ring only decides which alphas get
sampled. An off-grid `(6*d10,6*p5,3)` is an alpha-sample of an in-ring family that already ships on the
star24full shelf. Measured: 34 of the 51 were alpha-snapshots of 13 shapes. What makes a tiling
out-of-ring is a tile whose symmetry order n does not divide 24, which is combinatorial and alpha
cannot change it. The rationale is now written into the tool's docstring so it does not get retried.

## Gates

Every developed record area-checked (0 failures across 435 + 51). All 172 in-ring and 12 out-of-ring
shipped records covered, zero regressions. `tests/atlas-id-unique.test.ts` passes; 0 duplicate ids.
`tests/star-general-path.test.ts` fails but is PRE-EXISTING (it exercises the legacy
PeriodSolver/StarVC path, untouched here).

Backups: `scratchpad/star-shelf-backup/` (old cells + pre-change reference-atlas.json).
