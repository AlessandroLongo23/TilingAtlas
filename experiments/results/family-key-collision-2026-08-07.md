# The family key was too coarse, and k=8 is where it bit (2026-08-07)

Found while ingesting k=8. `export_family_cells.py` grouped flexing blocks by `family_key(words)`
alone; that key is the multiset of alpha-abstracted corner words, which is necessary but not
sufficient for two blocks to be alpha-snapshots of the same one-parameter family.

## The symptom

The k=8 run reported 6 families whose members read `a=[1, 1, 2, 2, 3, 3]`. A family is one tiling
deformed by alpha, so it holds at most one member per alpha value; a repeat means the record merges
parallel families. Every k<=7 family reads `a=[1, 2, 3]` (or `[1..5]`, `[1..7]`), so nothing before
k=8 exposed it.

## What it would have cost

Phase 4 of `build-reference-atlas.ts` folds away every record whose vertype appears in a family's
member list, on the premise that the slider represents it. With the broken key at k=8: 30 records
folded, 6 sliders shipped, each covering 3 alpha values = 18 represented. **12 real tilings would
have disappeared from the shelf with no trace** — no error, no warning, just absent records. After
the fix: 30 folded, 10 sliders x 3 alpha = 30. The accounting balances.

## The two collision shapes

**Same vertype, different gluing.** Two blocks carry byte-identical vertype strings and differ only
in the Conway word. Example at k=8, `(3*d15,3*p1,6)F, (3*d15,3*p1,3,3)Fx6, (3,3,3,3,3,3)F`, count
type 3 (611), which the solver wrote as `…3os 4ggr6 6vyk 1.tes` and `…2.tes`:

    …@4 3@5)(0@5 2@7)(1@5)(1@6 1@7)(2@6 0@7)
    …@4 3@5)(0@5 2@7)(1@5 1@7)(1@6)(2@6 0@7)

Non-isomorphic — the pruner's WL canonical form kept both. This shape also breaks `cells_index`,
which is keyed by vertype, so both blocks resolve to the same atlasId.

**Different vertype, same multiset.** Two blocks whose orbits are listed in a different order, e.g.
`(3*d15,3,3*p1,3)F` vs `(3*d15,3*p1,3,3)F` in positions 2-4. The corner-word multiset is identical,
so `family_key` matched, but the gluings differ.

## The fix

Key on `(family_key, conway_word)`. The Conway word is the right discriminator because it is
**alpha-invariant**: the alpha snapshots of one family differ only in star species (`3*d15` vs
`3*d14`), and species lives in the vertype, not in the gluing.

Verified before landing: all 29 known-good k<=7 families have members sharing exactly one Conway
word, so the new key leaves them untouched and splits only the collisions. Re-running with the fix
gives k<=7 output **byte-identical** to the shipped file (`json.dumps(sort_keys=True)` comparison),
and k=8 goes 6 families -> 10, every one reading `a=[1, 2, 3]`, all 11/11 area checks passing. The 4
colliding groups each split into 2, plus the 2 clean groups: 8 + 2 = 10.

## The guard that will catch the next one

`export_family_cells.py` now logs `⚑ KEY COLLISION <fid>: alpha values … repeat` whenever a family
holds two members at the same alpha. Loud, because the failure mode is silent in the atlas: the
records simply stop existing. If that line ever appears, do not ship the fold — the key needs another
discriminator, not a workaround.

## Why the atlas already shipped was fine

Checked k=1..7 after the fact: 93 folded vertypes, 93 records excluded, 93 member entries — one to
one, no over-removal. The bug is real but had never fired before k=8.
