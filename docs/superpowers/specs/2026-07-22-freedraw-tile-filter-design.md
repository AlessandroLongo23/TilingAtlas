# Freedraw tile filter — three-state rank toggles plus a size sub-filter

**Date:** 2026-07-22. AL directive, from a Discord exchange with Marek Čtrnáct.

## Why

Marek: *"Seeing that you can know the exact number and kinds of cells, that would be pretty important
for filtering these patterns on higher k."* … *"Or filter out infinite cells."* AL: *"you could, for
example, filter for tetrominos only. Or pentominos."*

The catalogue is now 14,327 patterns (square k ≤ 4: 9268, triangle k ≤ 3: 5059) and the filter is a
single-choice chip row: any / all finite / has strip / has unbounded / has holes. One choice at a
time, no way to say "unbounded yes, strips no, and every finite tile a tetromino".

AL's target gestures, both of which must be one selection each:

- unbounded required, strips irrelevant, every finite tile a tetromino
- no unbounded, no strips, every finite tile a pentomino

## What already exists

`analyseFaces` (`lib/freedraw/faces.ts`) returns, per face, `rank` (0 finite / 1 strip / 2 unbounded),
`cells` (the polyomino's area when rank 0) and `holes`. `summarise` folds that to
`{faceOrbits, finite, strips, unbounded, withHoles}`. Nothing about tile SIZE survives the fold, which
is the only piece of data the new filter needs and does not have.

Cost, measured 2026-07-22 over the three shipped catalogues: `analyseFaces` is 6 µs per pattern, 72 ms
for all 14,327. Client-side analysis on load stays the right call; no export-format change is needed.

## The filter state

```ts
type Tri = "any" | "require" | "exclude";

interface FreedrawFilter {
  unbounded: Tri;   // require = at least one rank-2 face; exclude = none
  strip: Tri;       // rank 1
  finite: Tri;      // rank 0
  holes: Tri;       // at least one finite face with holes > 0
  sizes: number[];  // allowed finite-tile sizes; empty = unrestricted
  sizeMode: "all" | "any";
}
```

`require` means the pattern contains at least one face of that class; `exclude` means it contains
none. Every pattern has at least one face, so excluding all three ranks legitimately yields zero
results — that is a valid, if useless, selection and is not special-cased.

**The size sub-filter is live only when `finite === "require"`.** Under `exclude` there are no finite
tiles to size, and under `any` the semantics ("no finite tiles, or else all of them tetrominoes") are
a question nobody asked. The control is rendered disabled in both cases and `matches` ignores `sizes`.

`sizeMode` resolves the ambiguity between AL's phrasing and Marek's browsing use:

- `all` — every finite face's size is in `sizes`. This is "tetrominoes only".
- `any` — at least one finite face's size is in `sizes`. Other sizes may also be present.

## Size chips come from the data

Finite tile sizes are sparse and grid-dependent. Measured over the shipped catalogues, patterns whose
finite tiles all share one size:

| grid, k | sizes present |
|---|---|
| square k ≤ 3 | 1, 2, 3, 4, 5, 6, 8, 9, 10 (no 7) |
| square k = 4 | 2, 3, 4, 5, 6, 7, 8, then 12, 13, 14 (no 9–11) |
| triangle k ≤ 3 | up to 18, max face size 24 |

A hardcoded 1..8 + "9+" bucket would hide the square k = 4 tail and make "only 9-ominoes" (3 patterns
at k ≤ 3) unaskable. So the chip row lists exactly the sizes present, computed from the **grid and k
selection alone** — never from the rank or size state. That keeps the row stable: choosing a size
never reshuffles the chips underneath the cursor.

## Modules

**`lib/freedraw/faces.ts`** — `summarise` gains `sizes: number[]`, one entry per finite face, sorted.
Sole change to this file.

**`lib/freedraw/filter.ts`** (new) — the filter type, `DEFAULT_FILTER`, `matches(stats, filter)`,
`sizeOptions(rows)`, and the URL codec `parseFilter` / `serializeFilter`. All pure, no React, so the
tests run without a DOM the way `faces.test.ts` already does.

**`app/(app)/freedraw/_freedraw-client.tsx`** — replaces the `kind` state with the filter object and
splits the header into two rows: what is shown (grid, k, the four tri-states, sizes, count) above,
how it is drawn (fill mode, grid/lattice/orbit switches) below. The single row already wraps at nine
controls and this adds roughly fifteen.

**`app/(app)/freedraw/page.tsx`** — wraps the client in `<Suspense>`. `useSearchParams` on a
prerendered route client-renders the tree up to the nearest boundary
(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`), and
`/library` already does exactly this for `ReferenceShelf`.

## Controls

Each class is a labelled row: the class name, then a three-option `ButtonGroup` (`any` / `require` /
`exclude`). No new UI primitive and no click-to-cycle chip — cycling is more compact but harder to
discover and worse for a screen reader.

## URL state

Filter selections are shareable links, following `lib/services/playUrlState.ts` conventions: short
stable keys, only non-defaults emitted, so an untouched view produces a bare `/freedraw`. Parsed once
on mount and thereafter written one-way via `history.replaceState`, which is the `ReferenceShelf`
pattern (`components/reference-shelf.tsx:386`) and keeps the writes off the Next router.

| key | meaning | values |
|---|---|---|
| `g` | grid | `triangle` (square is the default, so it is omitted) |
| `k` | k filter | `1`…`4`; omitted for all-k |
| `u`, `s`, `f`, `o` | unbounded / strip / finite / holes | `r` require, `x` exclude; omitted for any |
| `sz` | allowed sizes | comma-separated integers |
| `m` | size mode | `any`; `all` is the default and is omitted |

Out of scope: page number, selected pattern, and the view controls (fill mode, scaffold, lattice,
orbits). This link carries what is shown, not how it is drawn or where you were in the list.

## Testing

`lib/freedraw/filter.test.ts`:

1. `matches` against hand-built stats — each tri-state in isolation, the two AL gestures end to end,
   `sizes` ignored when `finite !== "require"`, `all` vs `any` split on a mixed 4 + 6 pattern.
2. Codec round-trip: `parseFilter(serializeFilter(f)) === f` over a spread of states, plus hostile
   input (unknown tri-state letter, non-numeric size, negative k) falling back to the default rather
   than being injected into state.
3. Regression against the real catalogue, using counts measured 2026-07-22: square k ≤ 3 has 1420
   patterns, 454 all-finite and 17 tetromino-only; square k = 4 has 7848 with 1944 all-finite;
   triangle has 5059 with 3357 all-finite.

## Deliberately not in this iteration

Strips carry a meaningful size too — `FaceInfo.cells` on a rank-1 face is its cell count per strip
period — so the same sub-filter would work there unchanged. Left out until someone wants it.

Also out: live per-chip result counts, and a filter on the number of distinct shape classes
(`classifyFaces().shapeCount`), which is the honest "how many kinds of tile" number and a natural
second axis once this one has been used in anger.

## An observation, and its counterexample

At square k ≤ 3 the 95 patterns whose finite tiles all have equal area are **exactly** the 95 that are
monohedral up to congruence. That coincidence does not survive: at square k = 4, 177 patterns have
equal-area tiles and only 170 are monohedral, and on the triangle grid it is 432 against 402. The
smallest witness is `fd-4-2524`, an 8 × 2 period whose four faces are all tetrominoes falling into two
distinct congruence classes.

So equal area is strictly weaker than one shape, as expected, and k ≤ 3 was simply too small to show
it. This is why the size filter and a future shape-class filter are different controls rather than one
control with two labels.
