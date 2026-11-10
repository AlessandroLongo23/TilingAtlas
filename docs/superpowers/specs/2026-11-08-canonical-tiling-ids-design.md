# Canonical tiling IDs (design, 2026-11-08, CC)

Status: proposed; AL approved remapping on the condition that the new IDs are provably unique across the atlas.

## Why

Most atlas IDs are serials in the order a solver or a developer met the tilings: block order in a solver
file, position of a certificate in a Searcher file, the path of Marek's `.tes` output (about 20 schemes; the
inventory is in the appendix). So any change to an engine renames tilings. That is what keeps eu_solver's
orderly generation opt-in (it changes the serial in every `ctrnact-*` ID), and it would rename the whole
atlas if the solver and the Searcher became one engine. An ID has to be a function of the tiling.

## What "provably unique" means here

Two separate statements, and the atlas needs both:

1. **One ID per tiling.** Two records get the same ID if and only if they are the same tiling (under the
   shelf's equivalence). This needs a complete invariant: equal for equal tilings, different for different
   ones.
2. **No colliding ID strings.** No string names two different tilings, anywhere in the shipped atlas.

The first is a theorem about the invariant. The second is checked exhaustively on every build, so it holds
for every atlas that ships, not with some probability.

## The invariant: the labelled Delaney-Dress symbol

The Delaney-Dress symbol of a periodic tiling (Euclidean, spherical or hyperbolic) and its canonical form by
Delgado-Friedrichs' Algorithm 8 (breadth-first serialization from every chamber, the lexicographic minimum)
are already in the codebase: `lib/classes/algorithm/delaney/DSymbol.ts`, and the symbol of any shipped
geometry in `lib/tilings/dsymFromMap.ts` (`cellDSymbol` for a flat period cell, `dartsDSymbol` for a
hyperbolic quotient, `solidDSymbol` for a solid). The canonical form is equal for two symbols if and only if
they are isomorphic (O. Delgado-Friedrichs, "Data structures and algorithms for tilings I", Theoretical
Computer Science 303, 2003).

A plain symbol is the tiling's topological type, not its shape: two star tilings that differ only in the
star's point angle share it. So the symbol carries labels per chamber, and the canonical form compares them:

- the tile's shape class (kind, side count, the angle word of a composite or star tile);
- the corner angle at the chamber's vertex;
- the edge type or mark (bump/bite, drawn/hidden), where the shelf has them;
- the colour, on coloured boards (with the shelf's rule: unlabeled colours are canonicalised over colour
  permutations, labeled ones are not).

The minimal image is taken on the labelled symbol, so a symmetry must preserve the labels.
`minimalBlocks(sym, labels)` already takes labels: `cellDSymbol` passes the star dents that way so a star is
never folded onto a plain triangle.

**Measured 2026-11-10: the labels are not optional.** The six shipped dihex records at k = 1 have two plain
symbols between them (they are four tilings). The dart map with every corner angle
(`tools/ctrnact-oracle/tiling_key.py`, `family_key`) tells all 1,616 polyform tilings apart, agrees with exact
congruence in Z[zeta_24] on every one, and is the same information as the symbol labelled with corner angles. An
oriented form of it (one orientation searched) keeps chirality, which the polyform shelf needs
(`tools/ctrnact-oracle/check_rigid_shelf.py`).

**In use since 2026-11-10 for new tilings on three shelves** (Polyforms, Islamic, convex irregular):
`<prefix>-k<k>-<digest>`, the digest over that key (oriented on Polyforms, mirror-blind on the other two), written
by `check_rigid_shelf.py --ids`. Tilings those shelves already had keep their old ids through
`scripts/atlas/plans/*-ids.json`. The key is a float form (angles to six decimals); P0 should either adopt it as
the serialization for rigid Euclidean shelves or map these 558 ids when it replaces it.

On a tiling by regular polygons the combinatorial type fixes the tiling up to isometry, so the plain symbol
is already complete. Measured on 2026-11-08: the 23,395 regular tilings of the shelf from k = 1 to 10
(t1002 aside) have 23,395 distinct symbols, and a fresh Searcher run gives the same 23,395
(`experiments/results/cross-engine-regular-2026-11-08.log`).

Equivalence: the canonical form starts from every chamber without fixing an orientation, so a chiral tiling
and its mirror image share it, which is the atlas's settled rule (mirror pairs merge). A parametric family's
ID names the family (the labelled symbol of its type); the parameter stays a coordinate in the URL, as now.

## The ID string

`<tag>-k<k>-<digest>`, for example `star-k6-q3lm8x2c7f0ad1kz`:

- `tag` is the shelf's prefix, as today. The app routes on it (`_atlas-client.tsx`, `regularShardOf`).
- `k` is the number of vertex orbits. It is a property of the tiling, and the shard loader already reads it
  from the ID.
- `digest` is 16 base32 characters, the first 80 bits of SHA-256 over the canonical labelled serialization.

Canonical serials (`star-k6-0771`, numbered in canonical order) would read better, but they shift whenever a
set grows (a new corpus, a fix that adds missed tilings), and every shift renames tilings again. A digest
never changes. The UI can still show short display numbers; they would not be identities.

## The checks that make it a proof (a build gate)

- **G1, completeness.** The theorem above, plus tests: the regular shelf's symbols are pairwise distinct, and
  shipped Tegula symbols round-trip through the canonical form.
- **G2, the ID is the tiling's.** Every record's ID, recomputed from its own geometry, equals the stored ID.
- **G3, no tiling twice.** No two records anywhere share a canonical form, across shelves too. Today nothing
  compares shelves: Tegula against the regular shelf, Tegula's spheres against the solids, and the hyperbolic
  base against the `hp` boards can overlap unseen.
- **G4, no colliding strings.** Every ID string occurs once across all shipped files, decorations included.
  With 80 bits and 17 million IDs the chance that this ever fires is about 10^-10, and if it does, the build
  stops instead of merging two tilings.

G2 to G4 together are an exhaustive verification over the shipped atlas, so uniqueness holds by checking
every record. The hash only has to be good enough that G4 never fires.

## Phases

**P0, no renaming yet.**
- Fix `tests/atlas-id-unique.test.ts`. Its first case reads `reference-atlas*.json`, but the files are
  `.json.gz` since 2026-10-21, so it checks nothing. That test exists because 12 duplicated hyperbolic IDs
  left ghost cards in /library on 2026-07-23. A read-only scan on 2026-11-08 found the 57 shipped
  `reference-atlas*.json.gz` files hold 188,479 IDs, all distinct; the decoration boards were not scanned.
- Extend it to the shards and the decoration boards (G4 over everything).
- Write the canonical key (labelled symbol, canonical form, digest) as one library function with the G1 tests.

**P1, the tiling shelves (about 188,000 records).**
- Regular, star, scaled, polyform, mixed, isotoxal, period, composable, tri45, planigon, penrose, euhalf,
  Islamic, the hyperbolic base shelf, the spherical solids and Tegula.
- Compute canonical IDs, write one alias table old to new (resolved where `resolveMergedFamilyKey` resolves
  the four existing tables), and move everything that holds IDs: shard routing, the 13,121 hero cells, the 85
  `<tiling-card>` literals in `public/theory`, `lib/updates/entries.ts`, tests.
- Then turn eu_solver's orderly generation on by default.

**P2, the decoration boards (about 16.8 million records; `hp` alone is 13.8 million).**
- These need the decoration in the labels.
- Computing 16.8 million symbols needs a faster implementation than the TypeScript one (about 50 cells a
  second today).
- Decide later whether they move or keep their serials. G4 covers them either way.

## Risks

- **Labels decide what "same tiling" means.**
  - Too few labels merge different tilings. G3 reports that as duplicates.
  - Too many split one tiling in two. G3 cannot see that, so it needs an independent cross-check: congruence
    keys where they exist (`canonicalFormN` on regular cells), and the cross-engine comparisons.
- **Family slices.** A 1-D slice of a 2-D family can share the family's labelled symbol. G3 then flags it,
  and it resolves the way absorbed families already do (an alias to the survivor).
- **External links.** Old URLs keep working through the alias table. Literal IDs in docs and theory pages
  are rewritten.

## Appendix: the ID schemes in use (inventory, 2026-11-08)

| Shelf | Example | Numbered by | Records |
|---|---|---|---|
| Galebach regular, k <= 6 | `t1001` | Galebach's numbering | 1,248 |
| Čtrnáct regular, k = 7..10 | `ctrnact-07_34-4o_4u2_5d3_5f-1` | Marek's `.tes` path and index | 22,148 |
| Searcher regular, k = 11..23 | `ts-gal2920solver_11_A3A4A6_22-0` | certificate file and position | 10,001 |
| Čtrnáct star | `ctrnact-star-k6-n0770` | block order per k | 12,843 |
| Mixed / isotoxal families | `ctrnact-mixed-family-k2-45` | sorted by vertex type, then append-only | 743 / 3,527 |
| Scaled / polyform | `d-ctrnact-03_…-1`, `dom-ctrnact-01_…-1` | `.tes` path | 43,405 / 2,047 |
| tri45 / planigon / penrose / euhalf | `tri45a-k4-7333` | first representative in solver output, per k | 16,965 / 1,055 / 4,505 / 12,942 |
| Composable / period / Islamic | `composable-k3-000`, `period-k3-121`, `isl-girih-k4-008` | per k after dedup, or input order | 1,451 / 427 / 192 |
| Hyperbolic base | `hyp-k2-5-6-6-6-6__…` | vertex figures, collisions suffixed | 51,911 |
| Spherical solids / stars | `sph-ncx-35-70-37-f`, `ss-10-15-7-d2` | V-E-F plus a letter | 657 / 100 |
| Tegula | `tegula-DS07-…` | Huson's canonical symbol name | 1,363 / 872 |
| Decoration boards | `fd4436-1-00001`, `hp10-1-00001`, … | certificate order per board and k | ~16.8 million |
