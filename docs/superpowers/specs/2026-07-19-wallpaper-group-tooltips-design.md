# Wallpaper-group tooltips (library sidebar)

Date: 2026-07-19
Status: design, pending implementation

## Goal

Hovering (or keyboard-focusing) a wallpaper-group chip in the library sidebar shows a tooltip with
the group's cell-structure diagram(s) from Wikipedia. Groups that Wikipedia draws with more than one
cell diagram show all of them, each captioned by its lattice shape / orientation. The tooltip
mechanism is a new reusable primitive, not a one-off.

The chips are the `Wallpaper group` `ButtonGroup` in `components/reference-shelf.tsx` (~L820), rendered
per `WALLPAPER_GROUPS` in `lib/classes/symmetry/types.ts`.

## Decisions already made

- **No Radix.** Mirror the Lume app's tooltip, which is built on Base UI
  (`@base-ui/react`, `import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'`). Add
  `@base-ui/react@^1.3.0` (the version Lume pins). Reference component:
  `~/Desktop/Personal/Lume/src/lib/components/shared/ui/Tooltip.tsx`.
- **Bundle the images.** Download the public-domain SVG diagrams into `public/wallpaper-groups/`. No
  hotlinking Wikimedia. All diagrams are `Public domain` on Commons (verified via the imageinfo API),
  so no attribution is required; a source note in the download script is enough.
- **Show every diagram Wikipedia provides per group.** For pm/pg/cm the two diagrams are one lattice in
  two orientations (horizontal vs vertical), not two lattice shapes — both are still shown, matching the
  article.

## Components

Three units, each independently testable.

### 1. `components/ui/tooltip.tsx` — reusable primitive

Structurally identical to Lume's Tooltip (`Root` → `Trigger render={children}` → `Portal` →
`Positioner side sideOffset` → `Popup`). Two deltas:

- **Tokens, not zinc.** The popup uses TilingAtlas design tokens so it matches Modal and the rest of
  `components/ui`: `bg-surface-overlay border border-line text-fg rounded-overlay shadow-xl`, and
  `z-[var(--z-tooltip)]` (the `--z-tooltip: 400` token already exists in
  `app/styles/tokens/derived.css`; there is no `z-tooltip` Tailwind utility, so consume the var
  directly).
- **Rich content.** Keep Lume's text API unchanged (`label?: string`, `shortcut?: string`) and add
  `content?: ReactNode`. When `content` is provided the popup renders it; otherwise it renders the
  Lume text row (`<span>{label}</span>` + optional `<kbd>`). When neither `label` nor `content` is set
  the wrapper is a no-op and returns `children` unchanged (Lume's early-return behavior).

Props:

```
label?: string
shortcut?: string
content?: ReactNode
side?: 'top' | 'right' | 'bottom' | 'left'   // default 'top'
sideOffset?: number                          // default 8
delay?: number                               // default 400
children: ReactElement
```

The primitive is a passthrough wrapper: it does not add a DOM node around `children`; Base UI's
`Trigger render={children}` merges trigger props and the ref onto the child element.

### 2. `ButtonGroup` / `ToggleButton` — make button groups tooltip-capable

Base UI's `Trigger render={children}` attaches a ref to the trigger element. Wrapping a raw DOM node
works (Lume wraps `<button>`/`<span>` directly); wrapping a custom component requires that component
to forward its ref to the underlying DOM node.

- `components/ui/toggle-button.tsx`: forward `ref` to the `<button>`. React 19 — accept `ref` as a
  prop (or `forwardRef`). No other behavior change.
- `components/ui/button-group.tsx`: add `tooltip?: ReactNode` to `ButtonGroupOption<T>`. In the render,
  when `opt.tooltip` is set, wrap that option's `ToggleButton` in
  `<Tooltip content={opt.tooltip}>…</Tooltip>`. Options without `tooltip` render exactly as today.

This keeps `ButtonGroup` general — any button group in the app can now attach per-option tooltips —
rather than special-casing the wallpaper filter.

Disabled interaction: a disabled chip (a group the selected lattice can't host) still shows its
tooltip. The diagram is educational, so seeing it while the chip is greyed out is fine and desirable.

### 3. Wallpaper-group tooltip content

- `public/wallpaper-groups/` holds the SVGs (see file map below).
- A data map `WALLPAPER_GROUP_DIAGRAMS: Record<WallpaperGroup, { src: string; caption: string }[]>`
  colocated with the wallpaper content component (new file, e.g.
  `components/wallpaper-group-diagram.tsx`). `src` is a public path
  (`/wallpaper-groups/<name>.svg`).
- A `WallpaperGroupTooltip` (or a plain builder function returning `ReactNode`) that renders:
  - a header line: the group name + its orbifold signature from `ORBIFOLD_SIGNATURE` (already in
    `lib/classes/symmetry/types.ts`), e.g. `pg · ××`;
  - the diagram(s) in a horizontal row, each on a **fixed white rounded card** (`bg-white`, small
    padding) with the diagram as a `<img>` sized ~112–128px square, and a small caption below in
    `text-fg-muted`. The white card is theme-independent so the black symmetry lines and colored
    fundamental domains stay legible in dark mode.
  - For single-diagram groups, one card with no caption (or caption omitted).
- In `reference-shelf.tsx`, the wallpaper-group `ButtonGroup` options gain
  `tooltip: <WallpaperGroupTooltip group={g} />` (or `buildWallpaperGroupTooltip(g)`).

Images are plain `<img>` (public-dir SVGs), not `next/image`, to avoid the loader/optimization layer
for tiny static vector assets.

## Image set

All from Commons, prefix `Wallpaper group diagram `, `.svg` versions, public domain. Downloaded and
renamed to kebab-case under `public/wallpaper-groups/`. Direct URLs derived from the md5 of the
underscore filename (`https://upload.wikimedia.org/wikipedia/commons/<h0>/<h0h1>/<File>.svg`).

| Group | Diagrams (Commons file → local name → caption) |
|-------|-----------------------------------------------|
| p1 | `p1` oblique, `p1 rect` rectangular, `p1 rhombic` rhombic, `p1 square` square |
| p2 | `p2` oblique, `p2 rect` rectangular, `p2 rhombic` rhombic, `p2 square` square |
| pm | `pm` horizontal, `pm rotated` vertical |
| pg | `pg` horizontal, `pg rotated` vertical |
| cm | `cm` horizontal, `cm rotated` vertical |
| pmm | `pmm` rectangular, `pmm square` square |
| pmg | `pmg` rectangular, `pmg rotated` rotated, `pmg square` square |
| pgg | `pgg` rectangular, `pgg rhombic` rhombic, `pgg square` square |
| cmm | `cmm rhombic` rhombic, `cmm square` square |
| p3 | `p3` (single) |
| p3m1 | `p3m1` (single) |
| p31m | `p31m` (single) |
| p4 | `p4` (single) |
| p4m | `p4m` (single) |
| p4g | `p4g` (single) |
| p6 | `p6` (single) |
| p6m | `p6m` (single) |

32 files total. The `png` duplicates, `half`, `square2`, and `legend`/`key` files on Commons are not
bundled. Download is a one-shot script (kept in the repo under `scripts/` or documented in the plan)
that fetches by md5-derived URL; the committed artifact is the SVGs in `public/wallpaper-groups/`.

## Styling and behavior

- Popup max width bounded so 4-diagram groups (p1, p2) wrap or scroll within a sensible width; a
  horizontal row with `flex-wrap` and a `max-w` cap is enough.
- Diagram cards: fixed white background regardless of theme; the popup chrome (border, shadow) follows
  the theme via tokens.
- Delay 400ms (Lume default). `side` defaults to `right` for the sidebar chips so the tooltip opens
  into the main content area, not off the left edge; confirmed per-usage, not in the primitive.
- Keyboard focus opens the tooltip (Base UI handles this) — the chips are buttons, already focusable.

## Testing

- Unit: `WALLPAPER_GROUP_DIAGRAMS` has an entry for every `WALLPAPER_GROUPS` value, every `src` points
  at a file that exists in `public/wallpaper-groups/`, and multi-diagram groups match the table above.
  (A vitest test that reads the public dir and cross-checks the map.)
- Build: `pnpm build` clean (per repo workflow rule).
- Manual: hover each chip in `/library`, verify diagram(s) + caption + orbifold render and are legible
  in both light and dark mode.

## Out of scope

- Applying tooltips to other filters (star, lattice, discoverer, certification). The primitive and the
  `ButtonGroup.tooltip` field make that trivial later, but it's not part of this change.
- Any change to the wallpaper-group filtering logic or `LATTICE_REALIZABLE_GROUPS`.
- `next/image` optimization for the diagrams.
