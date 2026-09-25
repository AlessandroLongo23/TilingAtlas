# Mobile redesign: phone layout spec

Status: v1, 2026-09-24. Companion to `INVENTORY.md` (the checklist of everything the site does today).

## Contract

1. **Desktop does not change.** At viewport widths of 768px and up, the rendered page must be identical
   to what it was before this work. Every phone rule is gated: Tailwind's `max-md:` variant, an
   `@media (max-width: 767.98px)` block, or a JS branch on `useIsPhone()`, which returns `false` on the
   server and on every viewport of 768px or more. A class without a `max-md:` prefix is never edited
   for phone reasons.
2. **Everything ships on the phone too.** Every control listed in `INVENTORY.md` stays reachable on a
   phone, on the same page and in roughly the same place in the hierarchy. A control may move into a
   sheet, a menu or an overflow row; it may not disappear. The only things allowed to vanish are
   keyboard hints (`Kbd` badges, "press F", "Shift + scroll") and they are replaced by touch wording
   where they explain a gesture.
3. **Touch is a first-class input.** Every canvas that pans also pinch-zooms, two-finger-rotates where
   the desktop rotates with Shift+wheel, and double-tap resets where the desktop uses right-click,
   middle-click or double-click. Hover-only information opens on tap.
4. **One layer, reused.** The phone layout is built from a handful of shared pieces (below). A page
   gets its phone layout by configuring them, never by forking its component tree into a
   `mobile-*.tsx` twin.

Phone = viewport width below 768px (Tailwind `md`). Tablets at 768px and up keep the desktop layout.
Landscape phones are wider than 768px on some devices; that is fine, they get desktop.

## Shared pieces

### `useIsPhone()` (`lib/hooks/useIsPhone.ts`)
`useSyncExternalStore` over `matchMedia("(max-width: 767.98px)")`, server snapshot `false`. Used only
for behaviour that CSS cannot express (gesture handlers, which sheet is open, default snap). Layout
itself is CSS, so the server HTML is already correct on a phone and there is no flash.

### Viewport and shell
- `export const viewport` in `app/layout.tsx`: `width=device-width, initial-scale=1, viewport-fit=cover`.
  (Meta viewport is ignored by desktop browsers.)
- App shell: `h-screen` keeps its desktop meaning; phone adds `max-md:h-dvh` so Safari's toolbar never
  hides bottom-anchored UI. Safe-area insets (`env(safe-area-inset-*)`) pad the top bar, sheets and
  bottom-floating chrome on phone.

### Phone top bar and menu (`components/nav.tsx`)
- Desktop row unchanged. On phone the link row, divider, version and icon cluster are hidden and the bar
  shows: hexagon mark, the current section's name (or "The Tiling Atlas" on routes outside the ten), and
  a 44px menu button on the right.
- The menu is a full-height panel sliding from the right: Home, the ten sections as 48px rows with a
  one-line description each (active row marked), then What's new, Discord, theme toggle and the version.
  Closes on route change, backdrop tap, Esc and the close button. Focus is trapped while open.
- Immersive mode hides the bar exactly as on desktop.

### Sheets (`components/ui/bottom-sheet.tsx`, driven by `PageSidebar`)
`PageSidebar` gains one prop, `mobile: "dock" | "modal"`, and keeps rendering its children once. On
desktop nothing changes. On phone:

- **dock** (tool pages with a canvas: /play, /aperiodic, /isohedral, /pentagons, /automata, /parquet):
  the sidebar becomes a persistent bottom sheet over a full-bleed canvas. Three snaps:
  `peek` (a 64px header row: grab handle plus the page's peek content, for example the tiling name and
  k), `half` (50dvh) and `full` (100dvh minus the top bar). Drag the handle or header to move between
  snaps, tap the header to toggle peek and half. The content scrolls inside the sheet. The canvas keeps
  receiving gestures above the sheet. The current sheet height is published as the CSS variable
  `--sheet-offset` on the page slot so floating chrome can sit above it.
- **modal** (content pages whose sidebar is navigation or filters: /library, /theory articles,
  /theory/tiles, /theory/configs, the squaring pipeline): the sidebar is hidden and the main content
  takes the full width. A trigger button ("Filters · 3", "Contents") in the page header opens the same
  content as a full-height modal sheet with a title row, a close button, backdrop and focus trap. Filter
  sheets end with a sticky "Show N results" bar.
- Snap state lives in a small Zustand store (`lib/stores/mobileSheet.ts`) so a page can open the sheet
  from a button (for example the info button, or "Filters").
- Immersive mode collapses a dock sheet to nothing, as it collapses the sidebar on desktop.

### Floating chrome over canvases
- `FloatingToolbar` on phone: anchored at `bottom: calc(var(--sheet-offset) + 12px)`, width capped to
  the viewport minus 16px gutters, buttons 44px. When its content is wider than the screen it scrolls
  sideways with snap, and secondary actions move into a "More" menu.
- Bottom-centre panels that float over the canvas today (param slider panel, palette strip, pentagon
  and isohedral edge controls) stack above the toolbar on phone as one full-width, collapsible tray
  with a max height of 40dvh.
- `FullscreenToggle`, info button, reset view: 44px round buttons in the top corners.
- Every canvas gets a visible **reset view** button on phone (the desktop reset is right-click).

### Gestures (`lib/render/viewControls.ts`, `lib/hooks/useAperiodicView.ts`, `useFlatCellPreview`, p5 canvas)
- One shared helper tracks active pointers. One finger pans (as today). Two fingers pinch-zoom about
  their midpoint (through the existing `zoomAtPoint`) and rotate by the change in their angle wherever
  the desktop rotates with Shift+wheel. Double-tap resets the view. `pointercancel` ends a drag.
- Every interactive canvas sets `touch-action: none` on phone (always-live canvases) or while active
  (click-to-activate cards).
- /play: on phone a single tap no longer re-centres on a vertex (a tap is how people dismiss things);
  double-tap resets the view and the reset button recentres.
- Click-to-activate cards on scrolling pages (landing, /theory, /updates): the first tap activates, and
  a visible "Done" chip on the active card deactivates it, so the page never gets stuck unscrollable.

### Primitives
- `Kbd` hidden on phone; `Checkbox` stops reserving its keycap slot on phone.
- `Tooltip` and `InfoDot`: on touch devices a tap toggles the content (popover behaviour); tapping
  elsewhere closes it.
- Touch sizes on phone: buttons, segmented cells (`.ta-seg`, `.ta-tab`), tree rows, chips and toggles at
  least 44px tall (40px allowed inside dense segmented groups when the whole group is 44px); slider
  thumbs 24px with a 44px hit area; checkboxes with a full-row hit area.
- `Modal` on phone: a bottom sheet (full width, rounded top, max-height 92dvh, body scrolls, sticky
  footer for the primary action).
- Hover-revealed buttons (`opacity-0 group-hover:opacity-100`) are always visible on phone.
- Text: body copy stays at least 15px on phone; 10-11px chrome labels become 12px.

## Page by page

| Route | Phone layout |
|---|---|
| `/` landing | Already stacks. Buttons full width; live cards use the activation chip; collection cards keep one column; the hero caption stays. |
| `/theory` index | Single column (already fine). |
| `/theory/<article>` | Article full width, readable measure, sidebar and TOC in a "Contents" modal sheet opened from a sticky pill; tables wrapped in horizontal scrollers; tiling cards full width; KaTeX display scrolls sideways. |
| `/theory/tiles`, `/theory/configs` | Filters in a modal sheet; grid capped at 2 (tiles) / 3 (configs) columns. |
| `/theory/perfect-rectangles/pipeline` | Controls in a modal sheet; stages stacked; hover edge highlight becomes tap-to-inspect with a separate "apply" action. |
| `/library` | Header: title, count, "Filters · n" button, Copy link, per-page; grid of 2 columns (columns slider hidden, URL `cols` untouched); filters in a modal sheet with "Show N results"; polygon modal as a full-height sheet. |
| `/play` | Full-bleed canvas. Dock sheet: peek shows name, class, k and prev / random / next; half and full show the Catalogue and View options tabs. Info panel opens as a sheet. Symmetry badge compact top-right. Editor: tool row scrolls, palette in the tray. |
| `/parquet` | Canvas on top, controls in the dock sheet, toolbar above the peek. |
| `/freedraw`, `/colors` | Full-width thumbnail grid (3 columns); filter band collapsed into a "Filters" modal sheet; tapping a thumbnail opens the detail pane as a full-height sheet (live preview on top, details and "Open in play" below). |
| `/aperiodic`, `/isohedral`, `/pentagons` | Full-bleed canvas, dock sheet with the controls, info card as a sheet, fullscreen and reset top-right. |
| `/automata` | Full-bleed board, dock sheet (stats in the peek row, tabs inside), transport above the peek. Painting: a "Paint" toggle in the transport replaces Shift+click. |
| `/updates` | Single column; a "Jump to release" select replaces the lg-only index. |
| `/history`, `/defense` | Unlisted. History table scrolls sideways. Defense deck gains on-screen previous / next on phone. |

## Verification
- Playwright, iPhone 14 profile (390×844, DPR 3, touch) plus a 360×740 small-Android pass and a 1440×900
  desktop pass; desktop screenshots compared against the pre-change baseline.
- Multi-touch checked through CDP `Input.dispatchTouchEvent` (two touch points).
- `pnpm build` clean.
