# OPEN WORK — what is unfinished on `polyforms-shelf`, by area

Written 2026-09-21 from a review of the 35 commits on `polyforms-shelf` (2026-08-24 to 09-06).
Companion to `docs/NEXT.md`, which holds the one live action per party; this file holds the standing
list, grouped so an area can be picked up whole. Each area carries a draft update note for the
release that would close it, with the numbers left blank until the work is measured.

Title rule for those notes (AL, 2026-09-21): name the content. "Genus solids on the spherical shelf",
never "Past the sphere". A title that needs the body to be understood is not a title.

---

## 1. Repo and release state

- The branch is local. No `origin/polyforms-shelf`; `master` is still at the merge base `98eac79`.
  35 commits and two releases (v1.36.0, v1.37.0) are parked on AL's review.
- The Discord invite expires **2026-09-29**. Regenerate it as never-expiring and replace the string
  in `lib/constants.ts`; it is live in the nav button and the landing footer.
- `docs/STATUS.md` §"Repo state" is stale: it claims master is `82c89f1` and ~47 ahead of origin,
  from the June thesis era.

No update note. None of this is visitor-facing.

## 2. Polyform boards

- Order 5 is past the alphabet wall: 71M configurations for pentominoes and pentahexes against 105K
  for tetrahex, the largest shipped. Blocked on cost, not on method.
- The engine does not emit one of each mirror pair, so `scripts/build-polyform-atlas.ts` patches the
  reflections in after the fact (144 on tetromino, 66 tetrahex, 52 diamond). The cause is in the
  pruner, and every board logs "mirror-merged not computed".
- A geometry's k is a lower bound where no run reached a primitive cell, so a tiling can sit one
  folder too deep.

```ts
// title: "Pentomino and pentahex boards"
{ kind: "content",
  text: "**Two more polyform boards**, N pentomino tilings and N pentahex, taking the shelf to N.",
  tilings: ["…", "…"] }
```

## 3. Spherical solids

- 19 genus sub-rows are registered and labelled with no data behind them (`spg2`…`spg24`); only
  genus 3, 4, 5 and 9 exist. The comment says the search is still running.
- `hasSphereView` asks only whether a circumsphere exists, never where its centre is. The pentagonal
  cupola, pentagonal pyramid and square cupola all render wrong (J5's centre sits ~1.15 below the
  decagon plane). Marek Čtrnáct, 2026-08-24.
- The `{n/d}` pyramids with 4 < n/d < 6 are missing; eight sit inside the shipped n ≤ 20 range:
  {9/2}, {11/2}, {13/3}, {14/3}, {16/3}, {17/3}, {17/4}, {19/4}. Same root cause.
- Nine uniform polyhedra are absent of 57. U18, U21, U39, U50, U56, U63 and U73 need construction and
  not search, a bounded generalization of `gen_hemi_shelf.py` taking parent vertex set plus target
  census; U64 looks like plain coverage (re-run the star palette at k=1 with the snub words); U75 is
  permanently excluded by the data model, which gates every edge to exactly two faces.
- Johnson solids are 84 of 92. J47, J48, J60, J61, J68, J70, J71 and J87 are all high-orbit, search
  run to k=5. `docs/POLYHEDRON_COVERAGE.md` calls this the single most closable gap in the atlas.
- 15 of 100 star records are unnamed, all k ≥ 2, a space with no published enumeration. Deliberate.
- The star-shelf facets silently omit the three star-faced hemipolyhedra: `starKind` and `ncxCrossing`
  test for a `sphStar` payload these `Polyhedron` records do not carry.

```ts
// title: "The eight missing Johnson solids"
{ kind: "content",
  text: "**All 92 Johnson solids**, J47, J48, J60, J61, J68, J70, J71 and J87 joining the 84 that shipped.",
  href: "/library?geo=spherical" }
```

## 4. Bubble tiles

- Three of the 28 spherical boards ship zero shards while registered, labelled and declaring
  `coverage: "k<=3"`: truncated dodecahedron, truncated icosahedron, snub dodecahedron.
  `lib/bubble/sphere.test.ts:82` steps around them, so the coverage assertion never runs there.
  Either ship the shards or take the rows out; the catalogue currently advertises them.
- 20 of 28 boards ship k ≤ 3; 8 are complete.
- `bubbleDepth` (`lib/bubble/sphere.ts:435`) is written, exported, imported and never called. The bug
  it fixes leaves 4.8% of the truncated icosidodecahedron unclaimed, which renders as holes.
- No polyhedron view on the spherical bubble shelf, the only spherical records without one.
- Twelve boards' k columns rest on the census's subgroup route alone, single-source.
- The three rhombic palettes (`bubble-rh`, `bubble-rt`, `bubble-rth`) all die to the 900 s solve cap
  at k=3 and k=4, so they ship no shelf.

```ts
// title: "Bubble tilings on the last three spherical boards"
{ kind: "content",
  text: "**N bubble tilings on the truncated dodecahedron, truncated icosahedron and snub dodecahedron**, the three boards that shipped empty.",
  href: "/library?geo=spherical&dec=edges&class=bubble" }
```

## 5. Hyperbolic boards

- **Apeirogon rendering is the one named blocker** (`docs/NEXT.md`). It holds back the largest corpus
  Marek has given: 19 hybrid-edge systems at 1.26M certificates, the AI2 `{3,n}` family at 641k, AI3
  and the outlier families. None can be decoded without it. Method: Zeno's, stitching triangles with
  one ideal vertex, which also fixes finite polygons past ~40 sides.
- `hyperbolic-edges` is still truncated and has no `complete` field to say so. `33355` ships no k=2,
  `33445` only k=4 and 5, `33446` no k=1, `33337` k=1 alone with 359,104 more at k=7 unshipped.
  `edges_667` ships non-contiguous k, a sample presented as a catalogue. This is the shelf that sits
  against the 2026-08-31 "everything ships" rule.
- The shader edge reducer refuses high-k records: `buildDirichletDomain` reports the develop bound
  beyond the safe rim on 4.5.6.8 at k=10 and 15 and on 3.4.7.4 at k=35, returns null, and logs a
  `console.error` per record. Un-truncation made this the common case at the top of every board.
- Four hyp-poly boards declare census slices they do not carry (board 13 k=27–30, board 17 k=26–30,
  t11 k=3, t14 k=2).
- In Marek's 2026-08-29 drop, `4aab` is an empty directory and `5677` is misnamed. Ask Marek.
- `develop_hyp_edges.py`, `develop_sph_colors.py` and `develop_hyp_colors.py` still match `[A-Z0-9]+`
  for the alphabet token and will silently decode zero files on the first board above the 9-gon.
- Re-emitting the halved shelf wipes `certified`; `node scripts/stamp-hyp-half-parallel.mjs` has to
  run after every emit. One emit destroyed a 34-minute stamping run unnoticed for a day.
- The spherical half shelf still has no test, the only shipped shelf without one.

```ts
// title: "Hyperbolic boards with apeirogon faces"
{ kind: "content",
  text: "**N tilings on boards with apeirogon faces**, the 19 hybrid edge systems and the {3,n} family, drawn by stitching triangles with one ideal vertex.",
  href: "/library?geo=hyperbolic" }
```

## 6. Euclidean and Schwarz edge boards

- `33444` (3.4.3.4.4) is withheld: 11,404 of 53,467 certificates fail `tile face walk did not close`.
  Cyclic order and walk step cap are both ruled out. Seven slices, 272,394 tilings and 365 MB are
  developed and held back. This is a decoder bug and not a size decision.
- `33344` needs a containment check against the ts shelf; `4436` needs a `GRIDS` row.
- `SCHWARZ_BOARDS` has no `complete`/`missing` pair, so `(2,2,5)`'s census zeros read as holes.

```ts
// title: "The 3.4.3.4.4 edge board"
{ kind: "content",
  text: "**53,467 edge systems on 3.4.3.4.4**, the board held back since the 2026-08-12 drop by a decoder that could not close 11,404 of its tile walks.",
  href: "/freedraw?g=33444" }
```

## 7. The solver

No visitor-facing release comes out of this area on its own; it is what unblocks the others.

- **star-wide k=2 develop is paused at group 2 of 64**, ~36 h of ETA left. `run_euclid_groups.py`
  skips groups whose JSON exists, so this resumes. Its k=1 positive control stopped at 12 of 80, and
  `check_euclid_covers.py` has never been run; `develop_spherical`'s 75 k=1 records must all reappear.
- **The 55 isotoxal pair palettes are committed and none has been run**, nor `isotox-full11`. They
  price at ~258 GB against 212 GB free. Blocked on the engineering item the speedup writeup names:
  make the solver prune and delete per shard instead of writing a whole palette to disk. The same
  item gates k=4 at valence ≤ 5 (~9 TB) and the valence-6 stratum.
- The isotoxal palette carried 3 of the 11 isotoxal outlines D=120 admits; {6/2}, {8/2}, {10/2},
  {10/4}, {12/2}, {12/3}, {12/4} and {12/5} are absent. 7- and 9-pointed stars need a grid D divisible
  by 7 or 9 and are out of reach at D=120.
- `vertex_polygon_filter.py` ships **unsound**: it tests `max(α) < Σα − max(α)` on raw face angles,
  the wrong reading of the polygon inequality, since a reflex face contributes the major arc.
- Star counts at k ≥ 3 were never re-run under the corrected face filter. Only star18 at k ≤ 2 was
  corroborated, so those counts still come from the unsound regime.
- Whether the point-adjacency lemma is valid under mixed closure is unresolved. Its proof treats a
  vertex past 2π as overlap, which is exactly a legal saddle. If it is invalid the search has been
  losing solids; this outranks any speed work.
- `tables/star20` and `tables/star180u` lack `CLASS_PREV`, `CLASS_SIGMA` and `CLASS_WIND`, which
  `eu_solver.cpp` now loads unconditionally. star18 and tetromino were regenerated; these were not.
- `eu_pruner_rt` is a Makefile target with no caller, and it is the only route for a palette whose
  `pruner_tables.inc` the compiler cannot take (1.54 GB). `allsaddle_extract.py`,
  `toroid_sign_filter.py` and `genus_watch.sh` have no callers either; the first exists for an open
  question, whether the genus-1 sign filter was right to discard 3,792,749 all-negative blocks
  unexamined, which the toroid probe says is unjustified for genus ≥ 2.
- `make` gates only `check-regular`, `check-star` and `check-deltahedra`. The genus, hemi, isotoxal,
  polyform and bubble shelves have no golden.
- **136 GB of gitignored run output sits under `tools/ctrnact-oracle`**, and several shelf generators
  default to intermediates inside it (`im-k2b/cells-star.json`, `genus-rows.json`,
  `star-ico-k2-euclid.json`, `sweep-size1/keep/`). Delete those directories and the shelves become
  unrebuildable without hours of re-search. Either promote the intermediates or write down which
  directories are load-bearing.

## 8. The site

- The landing hero reads 37,903 tilings while `/play`'s tree reads 2,220,588 hyperbolic alone.
  `EAGER_ATLAS_FILES` in `scripts/gen-landing-data.ts` is nine files and excludes every shelf this
  branch added; the generator's comment about matching the library's scope is no longer true.
- There is no curved preview path, so hyperbolic, spherical and edge-board releases ship text-only.
  v1.37.0 carries no pictures for exactly this reason. The preview renderer draws a Euclidean
  translational cell, which those shelves do not have.
- The five levels appear nowhere on `/theory`; they exist only as `TILING_LEVEL_NOTE` filter
  tooltips. Marek raised this on 2026-08-24. Marek's own `levels.txt` has a sixth, "scaled hybrid",
  which `lib/tilings/tiling-level.ts` cannot express because it has no notion of edge length.
- `CREASES_AS_TUBES` (`lib/render/sphericalWireframe.ts:387`) is a hardcoded A/B flag waiting on AL,
  with ~90 lines of unreachable `buildCreaseRibbons` behind it. One of the two goes.
- `heShardCache` and its siblings have no eviction, so heap accumulates across k switches. An LRU
  bound would cap it.
- `tests/star-general-path.test.ts` fails on a 60 s timeout and predates all of this.
- Star fundamental domains still render wrong on some entries (Marek, 2026-08-10).

```ts
// title: "Tiling previews for the curved shelves"
{ kind: "changed",
  text: "**Update notes show hyperbolic and spherical tilings**, which carried no picture because the preview drew a Euclidean cell.",
  href: "/updates" }
```
