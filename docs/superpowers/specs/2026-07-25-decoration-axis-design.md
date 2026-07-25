# The decoration axis: splitting "what is catalogued" out of the tile-class list

**Status: APPROVED (AL, 2026-07-25).** Companion to `TILE_TAXONOMY.md` §3, which named the problem;
this spec is the UI half of the fix.

## The problem

`TILE_CLASS_ORDER` is one flat list of twelve values:

```
regular, star, convex, isotoxal, mixed, scaled, polyomino, islamic, freedraw, colors, hyperbolic, spherical
```

It flattens three independent axes (`TILE_TAXONOMY.md` §3): geometry, tile shape, and decoration. Two
symptoms are visible in the shipped app.

**Hyperbolic and spherical are both geometries and tile classes.** `/library` already worked around this
by filtering them out of the class chips and relabeling the leftovers (`NONEUC_CLASS_LABEL = { hyperbolic:
"Uniform", freedraw: "Edge patterns", colors: "Colorings" }`). `/play` works around it differently, with
the `single` collapse in `catalogue-list-panel.tsx` that drops a class row when the geometry leaves only
one. Two workarounds for one missing axis.

**On the Euclidean shelf the decoration classes sit beside the shape classes as if they were peers.** The
eight shape shelves (regular through islamic) are catalogues of tilings by polygons where the tile set is
what varies. Freedraw and colors fix a grid and enumerate markings on it. They are different kinds of
object presented as alternatives in one list, and the counts make the confusion worse: the eight total
10,384 entries against 338,836 for freedraw plus colors, so a reader scanning the list concludes the Atlas
is mostly colorings.

## The axis

A third axis beside geometry and tile class, deliberately shaped as a mirror of the geometry axis so the
two read and behave the same way.

```ts
export type Decoration = "tilings" | "edges" | "colorings";
export const DECORATION_ORDER: Decoration[] = ["tilings", "edges", "colorings"];
export const DECORATION_LABEL: Record<Decoration, string> = {
  tilings: "Tilings",
  edges: "Edge patterns",
  colorings: "Colorings",
};
export function decorationOf(t: { family: string; source?: ... }): Decoration;
```

`decorationOf` is computed from `tileClassOf`, not from the payload fields (`freedraw`, `hypEdges`,
`sphColors`, …). Both derivations give the same answer today; deriving from the class function makes it
impossible for the two axes to disagree after a future class is added.

Naming: `Tilings / Edge patterns / Colorings` keeps two of the three labels `/library` already uses off
the plane. The third changes from `Uniform` to `Tilings`, which is the more honest word — the Islamic
shelf is transcribed and uncertified (`build-islamic-atlas.ts`: "NOT enumerated/certified results … make
no k-uniform completeness claim"), so filing it under "Uniform" would assert something the data doesn't
support.

## What does not change

`TILE_CLASS_ORDER` keeps all twelve values. `freedraw` and `colors` stay tile classes: they are the
`source` discriminator and they carry per-class facets (`freedrawKind`, the colors grid/palette split).
They simply become the only member of their segment, so their class row vanishes through the existing
`single` collapse. `hyperbolic` and `spherical` behave the same way under Tilings, which is what that
collapse was written for.

No atlas JSON is rebuilt. The axis is derived from data already shipped.

**Islamic stays under Tilings.** Its 192 entries are polygon tessellations; the Hankin strapwork is an
Options-tab overlay, not the catalogued object. Its provenance problem is real but belongs on the
certification axis, which already exists. Folding provenance into this axis would repeat the mistake being
undone here.

## /play

`decoration` becomes state beside `geometry` in `_play-client.tsx`, following the same four moves:

- counts computed over the geometry-filtered slice, so a lazy shard fills its segment on entry and an
  empty segment is disabled exactly as an empty geometry is;
- the browse list filters on both axes, so prev/next/random and the nav count stay inside the current
  (geometry, decoration) cell — the same scoping geometry has today;
- the selection→toggle sync effect sets both toggles, so a deep link, `R`, or ←/→ that lands elsewhere
  flips both;
- a geometry switch keeps the decoration when that cell is non-empty and falls back to Tilings when it is
  not, so entering a geometry whose shard has not arrived can never land on an empty list.

No new URL key. Geometry has none either: the selected tiling determines both, and `?tiling=` already
carries it.

`catalogue-tab.tsx` gets a second `grid-cols-3` row directly under the geometry row, same `ta-tab`
grammar, same count-under-label treatment.

## /library

Mostly deletion. `geometryClasses`, `NONEUC_CLASS_LABEL` and `noneucClassLabel` all go — they were the
workaround. `CLASS_OPTIONS` drops `freedraw` and `colors` alongside the two geometries. A decoration chip
row with an `All` option sits above the class chips in every geometry; class chips render only under
Tilings, and each decoration's own facets render under its segment.

`ReferenceFilter` gains `decoration?: Decoration` and `matchesFilter` gains one line. URL key `dec`, with
the back-compat promotion the geometry migration already established: `class=freedraw` resolves to
`dec=edges`, `class=colors` to `dec=colorings`, so existing links keep working.

Because `/library` offers `All`, `compareCatalogueDisplayOrder` takes decoration as its first sort key.
Within Euclidean that reproduces today's order exactly. Within hyperbolic it fixes a real inversion, where
`freedraw` and `colors` currently sort ahead of the developed patches.

## Tests

The existing Euclidean cases in `referenceAtlas.displayOrder.test.ts` stay green under a decoration-first
sort. Added:

- ordering across decorations within one geometry, including the hyperbolic case that is wrong today;
- a consistency assertion that every `TileClass` maps to exactly one segment, so adding a class without
  placing it fails a test rather than silently landing in Tilings.
