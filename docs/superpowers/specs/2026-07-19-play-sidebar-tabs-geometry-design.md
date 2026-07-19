# /play sidebar: tabs + geometry mode

Date: 2026-07-19
Status: approved, ready to implement

## Problem

The `/play` sidebar packs the tiling catalogue and every render/view option into one
`overflow-y-auto` column ([tilings-tab.tsx:99-739](../../../components/sidebar/tilings-tab.tsx)),
options stacked above the catalogue. The two surfaces fight for one scroll: reaching the catalogue
means scrolling past every option, and tweaking an option while browsing means scrolling back up.
Separately, there is no way to browse by geometry — Euclidean, hyperbolic, and spherical tilings are
interleaved in the same class→k tree.

## Decisions

- **Tabs, not two sidebars or a floating panel.** One sidebar, two tabs (Catalogue / Options). Two
  sidebars would spend ~640px of chrome and shrink the canvas (the point of the page); a floating
  options panel occludes the canvas it controls and duplicates immersive mode (`F`).
- **Geometry is a mode, not a filter** (AL, 2026-07-19). Random and ←/→ roam only within the selected
  geometry; switching geometry immediately selects the first tiling of that geometry so the canvas
  follows. Chosen over a list-only filter for predictability.

## Layout — three stacked zones in the 320px sidebar

1. **Nav header (always visible, above the tabs):** selected-tiling metadata (`k=` · class ·
   canonicalKey) + prev / random / next. Lifted out of the tab bodies so it persists across both tabs.
2. **Tab strip:** Catalogue | Options.
3. **Panels (both stay mounted, inactive hidden):** switching tabs is instant and never tears down the
   thumbnail canvases.
   - Catalogue: geometry segmented toggle pinned at top, then the filtered class→k list, scrolls.
   - Options: today's View-options block, scrolls. Unchanged content.

## Geometry mode

- New `geometry` state (`"euclidean" | "hyperbolic" | "spherical"`) in `_play-client.tsx` — it scopes
  `selectRandom` / `step`, which the keyboard handlers also call, so it lives in the parent.
- Classifier `geometryOf(t)`: `t.spherical` → spherical, `t.wythoff` → hyperbolic, else euclidean. The
  same routing the canvas uses. The optional `t.geometry` field is not reliably populated, so derive it.
  Add `geometryOf`, `GEOMETRY_ORDER`, `GEOMETRY_LABEL` to `lib/services/referenceAtlas.ts` next to
  `tileClassOf`.
- `geometryList = sorted.filter(geometryOf === geometry)` (memoized). Random, ←/→, and the catalogue
  list read `geometryList`. `geometryCounts` (memoized) drives the segment counts.
- Clicking a segment: set `geometry` and select `geometryList[0]` of the new geometry (canvas jumps).
- Sync effect: `geometry = geometryOf(selected)` whenever they differ — a deep-link or the initial load
  lands the toggle on the right segment. Default euclidean (matches the current default selection).
- A geometry still at zero (shard not yet merged) is disabled until it populates.

## Catalogue grouping

Euclidean keeps the class→k nesting. Under hyperbolic/spherical every tiling is a single `TileClass`,
so the class wrapper is redundant: in `catalogue-list-panel.tsx`, when the filtered set has exactly one
class, skip the class-level accordion and render its k-buckets directly under the toggle.

## File decomposition

`tilings-tab.tsx` (742 lines, almost all the options block) splits:

- `components/sidebar/nav-header.tsx` — metadata + prev/random/next.
- `components/sidebar/catalogue-tab.tsx` — geometry toggle + `CatalogueListPanel`. Plain props, no
  config-store subscription, so slider drags never re-render it.
- `components/sidebar/options-tab.tsx` — the View-options block (current lines ~99–735 minus the list).
  The only piece subscribing to the config store.
- `components/sidebar/tilings-tab.tsx` — thin composition: `nav-header` + `Tabs(Catalogue, Options)`.
- `components/ui/tabs.tsx` — optional `keepMounted` (forceMount + hide inactive), backwards-compatible
  for other callers.
- `app/(app)/play/_play-client.tsx` — geometry state, `geometryList` / `geometryCounts` derivations,
  sync effect; pass `geometry` / `onGeometryChange` / `geometryList` / `geometryCounts` to `Sidebar`.

Splitting also fixes an existing cost: `TilingsTab` currently subscribes to the whole config store, so
the catalogue re-reconciles on every slider tick; only `options-tab` will subscribe after the split.

## Edge cases

- `R` / arrows funnel through `selectRandom` / `step`; scoping is automatic once they read
  `geometryList`.
- Deep-links to any geometry flip the toggle via the sync effect.
- Immersive (`F`) untouched — it collapses the whole sidebar to width 0.
- Options stay keyed to the selected tiling's geometry, which always matches the toggle now that
  selection is scoped to it.

## Out of scope (YAGNI)

- A keyboard shortcut to cycle geometry (single-letter keys are taken by the options toggles).
- Regrouping hyperbolic by `{p,q}` family instead of `k`.
