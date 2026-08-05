# A shelf registry: one declaration per shelf, instead of fourteen if-else chains

Date: 2026-08-04
Status: IMPLEMENTED 2026-08-04 — all five work items landed and verified; see "What landed" at the end
Author: CC

## Goal

Make adding a shelf a **one-file change plus one adapter**, the way adding a class to the conformal
lens already is, and make a forgotten wiring step a **compile error** rather than a silent gap in the
UI. Today a shelf is declared implicitly across seven shared files and nothing checks that all seven
were updated.

This spec is the resumable record of an audit AL asked for on 2026-08-04 ("inspect the codebase and
see if the current structure is optimized and robust to drift"). Every number below was measured, not
estimated; the commands that produced them are in the last section so they can be re-run.

## What this is NOT

- **Not a rewrite of the renderers.** The canvases are fine. The problem is the dispatch layer that
  chooses between them, and the per-shelf metadata scattered across it.
- **Not a change to `SUB_ORDER` / `subOf` semantics.** Those are the single source of truth for the
  sidebar tree AND the linear browse order, and they already carry a compile-time exhaustiveness
  guard. The registry sits beside them, it does not replace them.
- **Not a change to `PeriodicCell` or `lib/render/periodic/*`.** That layer is the model this spec
  proposes copying, not a thing to touch.

## Why now: four measurements

### 1. Seven shared files change for every shelf

Intersection of the files touched by `pentEdges`, `ihEdges` and `sphEdges`:

| file | size | shelf branches |
|---|---|---|
| `app/(app)/play/_play-client.tsx` | 1233 | 41 |
| `components/sidebar/tile-grid.tsx` | 309 | 30 |
| `components/sidebar/options-tab.tsx` | 1011 | 11 |
| `lib/services/referenceAtlas.ts` | 2118 | 22 |
| `components/sidebar/catalogue-list-panel.tsx` | | labels + k noun |
| `components/reference-card.tsx` | | library card |
| `lib/services/catalogueService.ts` | 156 | 14 optional fields |

`CatalogueTiling` is a wide optional-field union: fourteen mutually exclusive shelf fields on one
record (`developed`, `spherical`, `freedraw`, `colors`, `hollow`, `sphericalFreedraw`, `hypEdges`,
`hypColors`, `sphColors`, `schwarz`, `sphEdges`, `hypPoly`, `sphPoly`, `pentEdges`, `ihEdges`). Every
consumer is an if-else chain over it, and **nothing forces a new shelf into any chain.**

### 2. Four silent omissions in two weeks

- The Schwarz board dropped out of the /play sidebar tree when it landed (2026-07-27). Recorded in
  the comment above `FREEDRAW_GRID_SUBS` in `lib/services/referenceAtlas.ts`, which is also where the
  one existing guard was added in response.
- Eleven shelves shipped in v1.13.0 with no `SUB_LABEL`, rendering as `spe-448`, `hpo-23`. Fixed
  2026-08-04 in the release commit.
- G / P / O hotkeys were dead on the pentagon shelf: gated on `selected?.freedraw` alone while the
  Options tab showed the checkboxes they drive.
- `isFreedraw` in `options-tab.tsx` needed hand-extending twice in one day, once per parametric board.

### 3. The same predicate written twice, already diverged

```
                       app/(app)/play/_play-client.tsx     components/sidebar/options-tab.tsx
isHyperbolicEdges      hypEdges ∥ schwarz(hyp)             hypEdges ∥ schwarz(hyp)        same
isHyperbolicColors     hypColors ∥ hypPoly                 hypColors                      DIVERGED
isSphColors            sphColors                           sphColors                      same
isSphericalFreedraw    … ∥ sphEdges ∥ sphPoly              … ∥ sphEdges                   DIVERGED
```

Both sets sit next to each other in each file; search for `isHyperbolicColors =` to find them.
Line numbers are deliberately omitted: two sessions edit these files daily and the citations rot.

**This is a live bug, shipping in v1.13.0.** Traced through `isFlat` in `components/sidebar/options-tab.tsx`:

```ts
const isFlat = !isHyperbolic && !isHyperbolicEdges && !isHyperbolicColors && !isSpherical
            && !isFreedraw && !isSphericalFreedraw && !isColors && !isSphColors;
```

For a `hypPoly` record every one of those is false, so `isFlat` is **true** and the tab renders the
flat p5 control block (symmetry elements, fundamental domain, vertex orbits, transition, polygon
points) while `_play-client` has already set `hyperbolic: true` and blanked that canvas. The disk
controls are hidden because `isHyperbolicDisk` is false. `lensApplies` is also true, so an Inversive
checkbox is offered that `lensActive` in `_play-client` will refuse to honour.

Same for `sphPoly` through `isSphericalFreedraw`. Affected: 36,945 hyperbolic 3.4.n.4 tilings and 20
spherical ones.

Fixing this by hand is a two-line patch. It is in this spec because the two-line patch is what was
done last time, and the predicates will diverge again.

### 4. Six hundred lines of live duplicate, created the same day

`lib/freedraw/edgePatchCore.ts` (781 lines) was extracted on 2026-08-04 so the isohedral board could
reuse the pentagon's lattice recovery. `lib/isohedral/edgePatch.ts` uses it and is 106 lines.
**`lib/pentagon/edgePatch.ts` still carries its own 636-line copy** — `OffsetDSU`, `spanRank`,
`ringArea`, `findLattice`, `isPeriod`, `extractFaces`, `reduce`, `holesOf` and `sampleEdges` all exist
twice.

Other measured near-duplicates (line-level similarity, blank lines stripped):

| pair | identical |
|---|---|
| `hyperbolic-edges-thumbnail.tsx` / `hyperbolic-colors-thumbnail.tsx` | 80.2% (349 lines) |
| `pentagon-edges-thumbnail.tsx` / `isohedral-edges-thumbnail.tsx` | 77.6% |
| `sph-poly-thumbnail.tsx` / `sph-schwarz-thumbnail.tsx` | 71.6% |
| `pentagon-edges-canvas.tsx` / `isohedral-edges-canvas.tsx` | 69.2% |
| `lib/pentagon/edgeShelfPattern.ts` / `lib/isohedral/edgeShelfPattern.ts` | 51.0% |

## What is already right, and must be copied rather than replaced

Three patterns in the codebase already solve exactly this problem, in their own corners:

1. **`PeriodicCell` + `lib/render/periodic/*`.** One IR, one adapter per class. Its header states the
   contract this spec wants everywhere: *"adding a class to the inversive view means adding a branch
   here and an adapter under lib/render/periodic — nothing in the renderer changes."*
2. **The exhaustiveness guard on `UnlistedGrid`** in `lib/services/referenceAtlas.ts`. `satisfies` plus an
   `Exclude<>` that is checked against `never`, so a grid without a sub row fails to compile. It
   exists because of the Schwarz incident. It is the only one of its kind in the repo.
3. **`lib/render/viewControls.ts` and `lib/render/canvasSize.ts`.** Shared interaction state and
   backing-store sizing, adopted by 14 canvases. `FreedrawCanvas` was the last hold-out on zoom and
   was moved onto `CardControls` on 2026-08-04.

The gap is that no guard of kind (2) exists on the **shelf** axis, which is the axis that grows every
week. Marek is still sending boards: `ie05` and `ie06` appeared during this audit.

## Design

### The registry

One module, `lib/services/shelfRegistry.ts`, declaring each shelf once:

```ts
export type ShelfId = "developed" | "spherical" | "freedraw" | … | "pentEdges" | "ihEdges";

export interface ShelfDef {
  /** The optional field on CatalogueTiling that carries this shelf's record. */
  field: ShelfId;
  geometry: "euclidean" | "hyperbolic" | "spherical";
  /** Which tile class it files under (TILE_CLASS_ORDER). */
  cls: TileClass;
  /** How subOf namespaces it: "pen-", "spe-", or null for the anonymous spine. */
  subPrefix: string | null;
  family: SubFamily | null;
  /** What k counts here — "vertex orbits", "grid-point orbits", "colored vertices". */
  kNoun: string;
  /**
   * WHICH RENDERER OWNS THE CANVAS. This is the field that kills the duplicated predicates: today
   * isFlat / isHyperbolicDisk / isSphericalFreedraw / isFreedraw are each recomputed from a list of
   * shelf fields in two files. They become one lookup.
   */
  surface: "flat" | "grid2d" | "disk" | "sphere";
  /** True when the shelf has a PeriodicCell adapter, so the conformal lens can draw it. */
  lens: boolean;
}

export const SHELVES: Record<ShelfId, ShelfDef> = { … };
```

`Record<ShelfId, ShelfDef>` is the guard: a new member of `ShelfId` without an entry fails to
compile, in the same way `TILE_CLASS_LABEL: Record<TileClass, …>` already does.

### What each consumer becomes

- `options-tab.tsx` and `_play-client.tsx`: `surfaceOf(selected)` replaces both copies of the four
  predicates. `isFlat` becomes `surface === "flat"`.
- `catalogue-list-panel.tsx`: `kNoun` comes off the registry instead of the nested ternary at
  `kSections`.
- `referenceAtlas.ts`: `subOf` and `familyOfSub` read `subPrefix` / `family` instead of a prefix
  ladder.
- `tile-grid.tsx` and the canvas chain in `_play-client.tsx`: a component per shelf, looked up rather
  than branched. Keep these as explicit maps (`Record<ShelfId, ComponentType>`), not dynamic imports.

### Non-goals for the first pass

Do **not** try to collapse the record union itself (`CatalogueTiling.pentEdges` → a generic
`record: unknown`). The typed fields are load-bearing at every call site and the churn would be
enormous for no drift benefit. The registry describes the shelves; it does not reshape their records.

## Work items, in order

### 1. Finish the `edgePatchCore` extraction  (safe, mechanical, do first)

Point `lib/pentagon/edgePatch.ts` at `lib/freedraw/edgePatchCore.ts` and delete the duplicated
helpers. The pentagon board keeps only what is genuinely its own: the 12k-darts identity
(`F = k, E = 3k, V = 2k`) that lets it predict the cell area before searching, and the board-specific
develop.

**Acceptance:** `lib/pentagon/edgePatch.ts` defines none of `OffsetDSU`, `spanRank`, `ringArea`,
`findLattice`, `isPeriod`, `extractFaces`, `reduce`, `holesOf`, `sampleEdges`;
`pnpm vitest run lib/pentagon/` stays green (9 tests, including the full-corpus dart identity and the
"period holds exactly k tiles" checks); `pnpm build` clean.

**Risk:** the core was generalized for the isohedral board, whose certificate cell is NOT a
fundamental domain (it spans two). Check that its `buildEdgePatch` options still let the pentagon
pass its exact known cell area, or the sizing win from `experiments/results/pent-edges-periodic-patch.md`
(53,979 builds, 0 failures) is lost. Re-run that sweep after the change.

### 2. The registry, and one definition of the four predicates

Create `lib/services/shelfRegistry.ts` as above; replace the two copies of `isHyperbolicColors` /
`isSphericalFreedraw` / `isHyperbolicEdges` / `isSphColors` / `isFlat` / `isHyperbolicDisk` /
`lensApplies` with lookups.

**Acceptance:** `rg -n "isHyperbolicColors =" ` returns exactly one hit; `hypPoly` and `sphPoly` show
the disk / sphere control set; a test asserts every `ShelfId` has an entry and that no two shelves
claim the same `subPrefix`.

### 3. Registry-drive the tree metadata

`kNoun`, `SUB_LABEL` fallbacks and `familyOfSub` off the registry. Keep
`tests/catalogue-sub-family.test.ts` (added 2026-08-04) — it asserts families occupy contiguous runs
of `SUB_ORDER`, which is what lets the sidebar group by a scan instead of a re-sort.

### 4. One parametric-shelf component pair

`pentagon-edges-{canvas,thumbnail}.tsx` and `isohedral-edges-{canvas,thumbnail}.tsx` are the same
component twice: build a `FreedrawPatch` from the live parameters, draw it through `FreedrawCanvas`,
show sliders. Parameterize on the shelf def plus a `buildPattern(record, params)` callback.

The thumbnails should keep using `thumbnailCells()` from `lib/freedraw/render.ts` (added 2026-08-04):
`cells` is a count, so handing a 220px preview the number tuned for a ~1000px canvas draws the tiles
at a fifth the size.

### 5. A thumbnail shell (optional, lowest value)

`hyperbolic-edges-thumbnail.tsx` / `hyperbolic-colors-thumbnail.tsx` are 80% identical over 349
lines. Worth doing only after 1–4.

## State of the tree when this was written

- **Committed and pushed:** v1.13.0 (`b234a92`), plus the isohedral edge shelves (`15339d0`) and the
  prototile inspector (`67c9090`). `origin/master` is current.
- **Uncommitted, mine:** the sidebar family grouping (`catalogue-list-panel.tsx`,
  `referenceAtlas.ts` `familyOfSub`/`SubFamily`, `tests/catalogue-sub-family.test.ts`), the
  `FreedrawCanvas` move onto `CardControls` (eased zoom), `thumbnailCells()` in
  `lib/freedraw/render.ts`, and the default-zoom changes in both `edgeShelfPattern.ts` files.
  All verified: `pnpm build` clean, 306 tests pass.
- **Uncommitted, a concurrent session's:** the `ie05` / `ie06` boards and their corpora, plus edits
  to `lib/isohedral/*`, `lib/freedraw/edgePatchCore.ts` and `tools/ctrnact-oracle/develop_ih_edges.py`.
  That session works in the same worktree; check `git status` before assuming a file is yours.
- **Known-failing, not ours:** `tests/star-general-path.test.ts` times out (60s limit, needs ~167s).
  Documented as pre-existing in `.claude/skills/release-notes/SKILL.md`.

## How the numbers were measured

```sh
# the seven shared files
comm -12 <(rg -l pentEdges --glob '*.ts*' --glob '!*.test.*' | sort) \
         <(rg -l ihEdges  --glob '*.ts*' --glob '!*.test.*' | sort) \
  | comm -12 - <(rg -l sphEdges --glob '*.ts*' --glob '!*.test.*' | sort)

# duplicate helpers still in the pentagon copy
for f in OffsetDSU spanRank ringArea findLattice isPeriod extractFaces reduce holesOf sampleEdges; do
  rg -c "\b$f\b" lib/pentagon/edgePatch.ts lib/freedraw/edgePatchCore.ts
done

# file-pair similarity: difflib.SequenceMatcher over non-blank stripped lines
```

The shelf-versus-chain coverage matrix (which shelf is referenced in which consumer) is worth
re-running after any of the work items; it is what surfaced the `hypPoly` / `sphPoly` gap.

## What landed, 2026-08-04

All five items. New files: `lib/services/shelfRegistry.ts`, `lib/services/shelfLabels.ts`,
`lib/render/hypThumbHost.ts`, `components/freedraw/parametric-edges-view.tsx`,
`components/ui/disk-thumbnail.tsx`, `tests/shelf-registry.test.ts`.

**1. The core extraction.** `lib/pentagon/edgePatch.ts` is 636 lines → 53, defining none of the nine
duplicated helpers. The risk the spec flagged was real and is handled: the generalised core sized its
next develop from `shortest * 4`, where the pentagon can size it exactly, so the core gained
`periodFacesExactly`. A board that can state its tile count (12k darts ⇒ F = k) now gets the exact cell
area, which makes the second basis vector exact instead of merely independent AND sizes a retry from
`cellArea/|v1|`. Boards that cannot — the isohedral types, where a period can hold twice k — pass
nothing and get byte-identical behaviour to before.

Re-ran the full sweep (`experiments/results/pent-edges-periodic-patch-on-core.md`): **53,979 builds, 0
failures**, and the rank0/rank1/rank2 columns match the pre-refactor run exactly at every k and every
parameter point. It also got faster — k=10 mean 12.7 ms → 4.0 ms — because the core groups period
candidates over every dart instead of dart 0 alone, so a shorter second generator is found in a smaller
develop.

**2. The registry, and the live bug.** `surfaceOf(selected)` is now the single answer to which renderer
owns the canvas, consumed by both `_play-client` and `options-tab`. Verified in the browser: a `hypPoly`
record now shows the disk control set — four palette pickers (one per polygon size 3·4·7·14),
Perspective/Flat, disk gestures — and no symmetry elements, fundamental domain, vertex orbits, polygon
points or Inversive checkbox. `colorCount` had to learn `hypPoly.stats.sizes.length`, because that
shelf genuinely fills through the shared palette and would otherwise have offered 2 pickers for 4 sizes.

Note on the stated acceptance criterion: `rg "isHyperbolicColors ="` returns two hits, not one, but both
are now `surface === "diskColors"` — a lookup against the one definition, kept as a local alias because
the JSX below reads better for it. The duplicated *definitions* are gone, which is what the criterion
was a proxy for.

**3. Tree metadata.** `kNoun` comes off the registry; `SUB_LABEL` / `FAMILY_LABEL` / `COLOR_SUB` moved to
`shelfLabels.ts` so a test can reach them, and the `ih-` / `pen-` rows are now DERIVED from the same
board tables that generate `SUB_ORDER` — a new board arrives named. The new coverage test earned its
keep within minutes: it failed on `ih-7` and `ih-8`, which the concurrent session had added while this
work was in progress.

`familyOfSub` did NOT move to the registry, and cannot: a `freedraw` record's sub is a plain grid or a
Schwarz grid depending on its pattern, so one shelf spans two families and a per-shelf family constant
would be a lie.

**4 and 5.** The parametric pair is `ParametricEdgesCanvas` / `ParametricEdgesThumbnail`; each board keeps
a ~20-line component, because subscribing to its own store fields is a hook call and cannot be passed in
a prop. The disk thumbnails share `DiskThumbnail` (observer, queue, skeleton, fade) and `hypThumbHost`
(offscreen surfaces, reduction-field cache keyed by mode).

Item 5 turned out to be worth more than "80% identical" suggested: all three disk thumbnails declared
their own `glCanvas` / `glRenderer`, so a page showing all three shelves held THREE WebGL2 contexts while
every file's header comment claimed one shared canvas. Now there is one.

Verified in the browser: pentagon and isohedral edge shelves, hyperbolic developed / edges / colors
thumbnail grids, and the `/theory/hyperbolic` figure cards (the `data`-prop path through the shell's
async half). `pnpm build` clean, `pnpm tsc --noEmit` clean, eslint clean on every touched file,
`pnpm test` 2016 passing with the one pre-existing `star-general-path` timeout.

### Left deliberately undone

`hollow` keeps the flat p5 control block although `components/canvas.tsx` blanks the flat layer for it
(`skipFlat` reads `cfg.hollow`) — the same defect as the hypPoly one. It is marked with a ⚑ at `isFlat`
in `options-tab.tsx` and in the registry entry. Fixing it changes which controls a shipped shelf offers,
which is AL's call, not a refactor's.
