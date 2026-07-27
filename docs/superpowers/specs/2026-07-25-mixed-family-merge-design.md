# Merging join-connected mixed families into one slider (2026-07-25)

Several entries on the mixed shelf are not separate tilings — they are the two halves of one continuous
deformation, cut where the flexing tile passes through a straight vertex. AL found the first pair by
sweeping the slider: `ctrnact-mixed-family-k2-58` (`4.4α.3*.6*`, α ∈ (30°,90°)) and `-k2-59`
(`4.4α.6α.6*`, α ∈ (0°,90°)) meet at α=90° in the same tiling, because the hexagon that is a concave
three-pointed star on one side straightens and everts into a convex hexagon on the other. The exporter
files the two sides as different families because the palette calls them different tiles.

This spec merges each such pair into ONE catalogue entry with ONE monotone slider. Census, mechanism and
the census tool are in `docs/DEVELOPMENT_NOTES.md` §92–§93; the scanner is `scripts/scan-family-joins.py`.

## Decisions (AL, 2026-07-25)

Settled in the design conversation. Do not silently revisit.

- **Merge criterion = the rigid/flexing partition.** At a flatten limit several branches can meet (the
  k2-58/59 limit has three). The branch that continues the SAME family is the one where the same tiles
  morph and the same tiles stay put. k2-58 and k2-59 both read `6 rigid squares · 1 rigid 12-gon star ·
  3 flexing cx4 · 2 flexing hexagons`; k2-56 reaches the identical limit but reads `3 rigid squares ·
  6 flexing cx4 · 2 flexing hexagons · 1 FLEXING 12-gon star`, so it is a different family through the
  same point. Congruence of the limit tiling alone is NOT sufficient and must not be used on its own.
- **Only non-degenerate joins merge.** A shared endpoint where a tile reaches zero area is a *collapse*:
  the limit is a simpler tiling that unrelated families also degenerate to. Those stay separate.
- **Lowest id wins.** The merged entry keeps the lower-numbered id; the absorbed id becomes an alias so
  existing `?tiling=…&alpha=…` links still resolve, with α mapped onto the merged coordinate.
- **α-reversal duplicates are quotiented too, and the ANGLE must be mapped with the id.** A convex
  isotoxal 2n-gon's alternating angles sum to a constant, so α ↦ (lo+hi) − α swaps the two angle classes
  and re-exports the same family. Rewriting the id without transforming the endpoint angle invents phantom
  joins — it produced a false "loop" in the first census pass, caught by AL from the geometry (k1-15 at
  α=60° is trihexagonal with side-2 tiles; at α=180° it is 3⁶ with the star collapsed).
- **The catalogue's own count claim is per merged arc.** 79 shipped entries = 77 distinct families after
  the 2 duplicates, = **71 entries** after 6 merges.

## Scope

**In:** the mixed shelf (`public/reference-atlas-mixed.json`, all single-parameter). Detect the merges,
emit a merge plan, merge in the atlas builder, teach the evaluator and the slider about multi-segment
families, keep old ids resolving.

**Out (each its own later step):** the isotoxal / composable / scaled shelves, which almost certainly
carry the same joins; pushing the merge upstream into `tools/ctrnact-oracle/export_combined_families.py`
so the searcher emits merged families directly (AL's stated eventual goal); the visual deformation-graph
page; multi-parameter families, where the validity region is a box and a "join" is a shared face.

## What the census found

Six merge components, every one a clean 2-path. No loops, no chains of three.

| merged arc | coordinate | range | join |
| --- | --- | --- | --- |
| k2-58 + k2-59 | `theta` | (90°, 240°) | 180° |
| k2-45 + k2-46 | `theta` | (90°, 240°) | 180° |
| k2-47 + k2-49 | `theta` | (105°, 240°) | 180° |
| k1-04 + k1-07 | `sweep` | (0°, 120°) | 60° |
| k1-05 + k1-15 | `sweep` | (0°, 180°) | 60° |
| k2-05 + k2-06 | `sweep` | (0°, 120°) | 60° |

Two coordinate kinds, because θ is not always globally monotone:

- **`theta`** — the flexing tile's alternating interior angle. Usable when every straightening tile is
  reflex (>180°) on one branch and convex (<180°) on the other, so the tracked angle crosses 180°
  monotonically. True for the three `nS` ↔ `cx2n` arcs. The number is geometric: θ=180° is exactly the
  straight-vertex limit, θ>180° the star branch, θ<180° the convex branch.
- **`sweep`** — cumulative angle travelled from one far end, range `[0, spanA + spanB]`. Needed for the
  other three, where SEVERAL tile orbits straighten from *different* sides at once — k1-04's 8-gons
  approach convex while its 6- and 12-gons approach reflex, and k2-05 holds star and convex hexagons in
  the same half — so no single tile angle is monotone and a θ readout would be arbitrary.

Both are the same slider mechanically. `|dθ/dα| = 1` on every branch at every join — verified, and the
reason the two α-spans concatenate at uniform speed instead of visibly changing rate at the join. The
validation is `span θ == span α_A + span α_B` for all six arcs.

## Schema

Merging lives INSIDE `paramCell`, so `evaluateParamCell` stays the single choke point that every canvas,
thumbnail and the slider already funnel through. A merged family adds `segments`:

```ts
paramCell: {
  params: [{ name: "theta", alphaRangeDegOpen: [90, 240], defaultAlphaDeg: 210, tile: "cx6-…", … }],
  segments: [
    { sourceId: "…k2-59", range: [90,  180], alphaOf: { m:  1, c: -90 }, alpha0Deg, cellPolygons, basis },
    { sourceId: "…k2-58", range: [180, 240], alphaOf: { m: -1, c: 270 }, alpha0Deg, cellPolygons, basis },
  ],
  cellPolygons, basis,   // the FIRST segment's — a consumer that ignores `segments` still renders
}
```

`α = c + m·u` with `m = ±1`, so the map is exactly invertible and the geometry stays the symbolic cell it
already was. Each segment carries its OWN `alpha0Deg` (its δ origin); `params[0].alpha0Deg` is only the
first segment's. Segments are sorted, contiguous, and cover `alphaRangeDegOpen` exactly; the seam belongs
to the segment listed first, which is immaterial because both sides evaluate to the same cell there.

Nothing else in `ParametricCellData` changes, so `clampAlphaAt`, `resolveAlphaDegs`, `renderAlphaDegs`,
the Command-scrub and the URL `?alpha=` mirror all follow from the widened `alphaRangeDegOpen`.

## Two things that must be reconciled at the seam, or the sweep is not seamless

The halves develop the same tiling at the join — that is what makes them one family — but each was
exported independently, so two representations differ and both are visible to a viewer dragging through.
Both are fixed at BUILD time by baking into the shipped terms; nothing re-applies them at runtime.

**Pose.** Each half sits in its own frame. Measured at the seam: k1-04's halves differ by a 30° rotation
plus a translation, k1-05's and k2-05's by a translation. Left alone, the pattern rotates or slides as the
slider crosses. `register_pose` searches the 24 ζ₂₄ rotations × reflection, keeps only candidates whose
lattice matches the reference's (so the fundamental cells are interchangeable), and pins the translation by
trying every vertex correspondence, comparing vertex sets reduced mod the lattice. A constant isometry
commutes with the deformation, so aligning at the seam aligns the whole half. All six aligned with a pure
rotation + translation; no reflection was needed, so no arc crosses into its mirror. The three `theta` arcs
came out already aligned (identity), which is why only the `sweep` arcs carry a non-trivial pose.

**Star flags.** `star` is the renderer's hue selector — the star ramp (violet→red, nudged by the tip
angle) or the by-side-count ramp. The flexing tile is a star on one half and convex on the other, so its
COLOUR flipped at the join (blue ↔ green) while its shape stayed continuous: the exact discontinuity the
merge exists to remove, and 36% of canvas pixels changed across a 4° drag. A tile that is a star anywhere
on the arc is therefore flagged a star everywhere on it — one tile, one identity — and the star ramp keeps
tracking the deformation through its tip-angle nudge, where the regular ramp saturates once the tile turns
concave. Matching is **per tile, by centroid reduced mod the lattice**, never by side count: at k1-04 three
orbits straighten at once and swap star-ness with each other, and k2-05 holds both star and convex hexagons
in one half, so a by-n rule over-marks genuinely convex tiles.

## Architecture

| Unit | Change | Notes |
| --- | --- | --- |
| `scripts/scan-family-joins.py` | `--emit-merge-plan <path>` | The verified-join census plus the flex-partition gate, the α-map fix in the duplicate quotient, `register_pose`, and `unify_star_flags`. Refuses to plan if any component is not a 2-path. |
| `lib/utils/paramCell.ts` | `segments` on `ParametricCellData`; `evaluateParamCell` picks the segment | `segmentAt(pc, u)` exported for tests. Outer ends still get the `ALPHA_EPS_DEG` nudge; the seam deliberately does NOT — it is a genuine tiling. |
| `scripts/build-mixed-atlas.ts` | reads the plan, bakes pose + star flags, drops absorbed ids | Also writes the pre-merge snapshot and `lib/services/mergedFamilyAliases.json`. |
| `lib/services/referenceAtlas.ts` | `resolveMergedFamilyKey({tiling, alphas})`; `familyHalves`, `mergedFrom` | Static import of the alias JSON, so resolution is synchronous at URL-parse time. |
| `app/(app)/play/_play-client.tsx` | run the parsed URL state through the resolver | One call in the existing `useState` initializer. |
| `components/param-slider-panel.tsx` | label from `params[j].name` | `theta` → θ, `sweep` → s; anything else keeps the positional Greek letter. |

Only ABSORBED ids are angle-remapped. A merge survivor keeps its id while its slider changes meaning
(α became θ or a sweep angle), and there `α=45` and `u=45` are the same string — an old link to it lands
wherever the ordinary range clamp puts it, which is still a real member of the same family. Guessing would
silently move the view.

## Data flow — a deliberate two-pass loop

```
experiments/results/ctrnact-mixed-families{,-k2}.cells.json
        │
        ├─ build-mixed-atlas.ts ─→ experiments/results/mixed-atlas-unmerged.json   (pre-merge snapshot)
        │                      └─→ public/reference-atlas-mixed.json               (merged, 71)
        │                      └─→ lib/services/mergedFamilyAliases.json
        │
        └─ scan-family-joins.py <the snapshot> --emit-merge-plan
                → experiments/results/mixed-merge-plan.json  ──┘ (read by the next build)
```

The census needs the UNMERGED shelf to find the joins, and the shipped file is the merged one, so the
builder snapshots the pre-merge array every run. Deleting the plan and rebuilding reproduces the unmerged
shelf exactly, which is the escape hatch if a merge is ever disputed.

## Testing

`lib/utils/paramCell.merged.test.ts`, driven off the shipped shelf:

- **Seam agreement** — at the seam the two halves have the same vertex set mod the lattice (reduced by ONE
  basis: their own bases are unimodular-related, the same lattice written with a different generating
  pair), the same lattice, the same covolume and the same tile areas. This is the property that makes the
  merge legal rather than a splice of two unrelated things.
- **Seam colour** — every tile has the same `star` flag on both sides, matched by seam position.
- **Area certificate across the sweep** — Σ tile area == |det basis| at 121 positions per arc, including
  both open ends. It fails the moment tiles overlap or leave a gap, so passing it everywhere is what proves
  the slider never leaves the family.
- **`segmentAt`** — seam, both sides, outside both ends, and null for an ordinary single-cell family.
- **Alias remaps** — an absorbed id redirects with its angle carried across; the k1-18 → k1-15 → k1-05
  chain composes (α=180° must land on u=60°, k1-15's α=60° end), which is the regression for the phantom
  loop; unknown and surviving keys pass through untouched.
- Manual: /play at θ=178° vs 182° (no colour flip, no rotation, matching layout) and at both extremes.

Pre-existing failures unrelated to this work, confirmed identical at HEAD in a clean worktree:
`tests/landing-data.test.ts` (a seeded pick asserts `t1003`) and `tests/star-general-path.test.ts`
(177 s against a 60 s timeout).

## Risks

- **A merged entry is not one symbolic cell.** Anything that assumed `paramCell.cellPolygons` describes
  the whole range is wrong for 6 entries. Mitigated by keeping the first segment there, so the failure mode
  is "renders only half the sweep", never a crash. Consumers are enumerated in the architecture table.
- **The `sweep` arcs are less meaningful than the `theta` arcs.** The slider number is arc length, not a
  geometric angle. Accepted: the alternative is leaving three genuine single families split.
- **The count claim moves.** 79 → 71 on this shelf. Any prose quoting 79 needs updating; the thesis should
  state the count per merged arc and say so.
- **`star` now describes the arc, not the instantaneous tile.** A convex tile on one half carries
  `star: true` because it is a star on the other. It is a hue selector, not geometry — nothing triangulates
  on it — but a future consumer that reads it as "this tile is concave here" would be misled.
