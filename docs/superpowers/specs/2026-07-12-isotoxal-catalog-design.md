# Isotoxal convex-tile catalog page — design

Date: 2026-07-12 · Author: CC (AL directed) · Status: superseded → shipped as a multi-family gallery

**Update (same day, after first render).** AL redirected: match the Library layout exactly (PageSidebar
rail + card grid) and cover ALL prototile families, not just isotoxal. Shipped as `/tiles` ("Prototiles"):
`lib/tiles/prototiles.ts` provides four families — regular (`RegularPolygon` trig), composable
(`generateFamily` + `tileVertices`, `CyclotomicRing.create(12)`), star (`StarParametricPolygon`, the 28
project species from the ζ₂₄/ζ₁₈ palettes), isotoxal (the module below). One `PrototileCard` renders each
shape via `TilingThumbnail`. Sidebar filters by tile class; the isotoxal grid toggle is trimmed to 30°/15°
(default 30°). The isotoxal math/enumeration below is unchanged and still underpins the isotoxal family.

Date: 2026-07-12 · Author: CC (AL directed) · Status: approved (structure "one card per grid-member")

## What this is

A new catalog route, parallel to `/play`, `/library`, `/history`, that displays the family of
**convex isotoxal polygons**: equilateral polygons whose interior angles alternate between two
values α and β. These are edge-transitive (one edge class, two vertex classes) — the *convex*
sibling of the star polygons already in the repo, which are the non-convex isotoxal ones. Regular
polygons are the degenerate α=β members.

AL raised this as "a family we missed." It is not missed: the ζ₁₂ (30° grid) slice ships already as
the `composite-convex` / "Composable" shelf (`enumerateConvexFamily`, DEVELOPMENT_NOTES §52–54). What
was missing is the **off-grid** members (angles not multiples of 30°) — the regular octagon (135°),
the 105/135 hexagon, and everything on finer direction grids. This page surfaces those.

## The math (settled)

For an equilateral 2n-gon with alternating interior angles α, β:

- Angle-sum forces `α + β = 360 − 360/n`.
- Closure is automatic: the edge vectors are `(1 + e^{i·(180−α)})·Σ_{k<n} e^{i·2πk/n}`, and the
  n-th-roots-of-unity sum is 0 for every n ≥ 2. So **every** α in the convex range yields a valid
  closing polygon → each side-count is a continuous 1-parameter family.
- Convexity: `0 < α ≤ β < 180`. WLOG α ≤ β (the swap is the mirror image; mirror pairs merge, per the
  chirality decision). α = β is the regular member (excluded here; it lives in the main atlas).

Because the family is a continuum, "list all" only becomes finite once angles are pinned to a
**direction grid** ζ_N (N even): angles then range over multiples of `360/N`. This is a *display*
discretization, NOT a completeness claim — finer grids add more members without bound. The page
exposes N as a selector so the arbitrariness is a user-controlled dial, not a hidden cut.

Enumeration per grid N and side-count 2n: α ∈ multiples of `360/N`, `α < β`, `α + β = 360 − 360/n`,
`0 < α`, `β < 180`. Example counts (α<β, regulars excluded):
- ζ₁₂ (30°): 90/150 hexagon, 120/150 octagon — exactly AL's two examples.
- ζ₂₄ (15°): + 75/165 & 105/135 hexagons, 105/165 octagon, 135/165 dodecagon, 150/165 hexadecagon.
- Decagon (and any 5-fold n): zero members on ζ₂₄-type grids (α+β=288 unreachable; 5-fold ∤ 24).

## Scope

- Route `app/(app)/isotoxal/` (nav label "Isotoxal"), following the `/library` one-liner page →
  `_isotoxal-client.tsx` client-component pattern. Inherits the app shell / Nav automatically.
- Card grid mirroring `/library`: a responsive grid of cards, each rendering ONE polygon via
  `TilingThumbnail polygons={[{n, vertices}]}` (the live single-polygon primitive). Geometry from a
  plain-trig boundary walk (float; display-only, outside the completeness spine).
- Grid selector (ButtonGroup): 30° / 15° / 10° / 7.5° (N = 12/24/36/48), default 15°.
- Cards grouped by side-count with a header per 2n; the cap 2n ≤ 24 is shown with a note that the
  family continues for all even side counts (no silent truncation).
- Card metadata: side-count name (e.g. "Octagon"), the two angles, and a tag when the tile is also a
  ζ₁₂ member (i.e. already in the Composable shelf).

## Out of scope (YAGNI)

- No exact ℤ[ζ] arithmetic (display-only, like the Composable shelf).
- No tileability check (whether a given member admits an edge-to-edge k-uniform tiling is the hard
  open problem; not claimed here).
- No Supabase / atlas JSON — enumeration is a pure client function, computed on the fly.
- No filters/pagination — the member count is small at every offered grid.

## Files

- `lib/isotoxal/enumerate.ts` — pure enumeration + vertex construction.
- `tests/isotoxal.test.ts` — counts (ζ₁₂ → AL's two), closure, convexity, mirror-dedup.
- `components/isotoxal-card.tsx` — single-polygon card (copy of the CatalogueCard shell).
- `app/(app)/isotoxal/{page.tsx,_isotoxal-client.tsx}` — route + client grid.
- `components/nav.tsx` — one new LINKS entry.
