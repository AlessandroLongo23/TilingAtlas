# Phone layer: shared API

Reference for page agents. Built 2026-09-24 against `DESIGN.md`. Everything here is inert at 768px and
up; desktop renders exactly as before.

## Breakpoint

| Piece | Where | Use |
|---|---|---|
| `max-md:` | Tailwind | Layout on phone. First choice: server HTML is right, no flash. |
| `@media (max-width: 767.98px)` | `app/styles/mobile.css` | Overrides of the plain `.ta-*` classes. The file is imported last in `globals.css`, so a plain selector wins; no prefix needed. |
| `useIsPhone()` | `lib/hooks/useIsPhone.ts` | Behaviour only (gestures, which sheet opens). `false` on the server, during hydration, and where `matchMedia` is missing (jsdom). `isPhoneNow()` is the same answer outside React; `PHONE_QUERY` the media string. |

## CSS variables

| Variable | Set by | Value |
|---|---|---|
| `--sheet-offset` | dock sheet, on `<html>` | Visible height of the dock sheet in px, safe-area inset included (68 at peek). Unset when there is no dock sheet, on desktop, and `0px` while immersive hides it. Updated when a snap settles (not per drag frame). There is no JS copy: read the variable. |
| `--topbar-h` | `mobile.css`, on `:root` | `calc(48px + env(safe-area-inset-top))`: the phone top bar. |

Put floating chrome above the sheet:

```tsx
className="... max-md:bottom-[calc(max(var(--sheet-offset,0px),env(safe-area-inset-bottom))+12px)] max-md:transition-[bottom] max-md:duration-300"
```

`FloatingToolbar` already does this. The element must be positioned against a box that reaches the
bottom of the viewport (the page slot does on phone).

## `PageSidebar` (`components/page-sidebar.tsx`)

Desktop props unchanged (`children`, `scrollable`, `collapsed`). Phone props:

| Prop | Mode | Meaning |
|---|---|---|
| `mobile` | both | `"dock"` (tool pages) or `"modal"` (reading/filter pages). Default `"modal"`. |
| `title` | both | Panel name. Dock: default peek text. Modal: default title and pill label. |
| `peek` | dock | Content of the peek row: `flex h-11 items-center gap-2 px-4` (44px), under a 20px full-width grab strip. Header is 68px in all. |
| `defaultSnap` | dock | `"peek"` (default), `"half"` or `"full"`. |
| `halfHeight` | dock | The half snap's height as CSS. Default `50dvh`; /play uses `60dvh`. |
| `mobileLabel` | modal | Title and pill text ("Filters", "Contents"). Falls back to `title`. |
| `mobileIcon` | modal | Trigger icon (a lucide component). Default sliders; `List` for "Contents" and "Browse". |
| `mobileBadge` | modal | Number on the pill; hidden when 0. |
| `mobileFooter` | modal | Bar pinned under the sheet content, e.g. a "Show N results" button that calls `setOpen(false)`. |
| `mobileTrigger` | modal | `false` hides the floating `SheetTrigger` when the page has its own (a header one). Default `true`. |

Children render once, in the same `aside`, on every viewport. On phone the aside is `position: fixed`,
so the outer clip box takes no width and the canvas or content fills the page.

Dock behaviour: drag the grab strip (always free, whatever the peek holds) or any non-interactive part
of the header (velocity-aware snapping); tap the header to toggle peek and half (from full it drops to
peek); the strip is a button, so Enter or Space toggles too. Buttons, links, selects and inputs inside
`peek` keep their own taps and never start a drag, so leave some bare row beside them. Content scrolls
inside. At peek (and hidden) the content is `inert`: not tabbable, not read. The aside is
`role="region"` named by `title`. Immersive (or `collapsed`) hides the sheet completely.

Modal behaviour: the shared modal sheet (below): full height from `top: safe-area + 8px`, grab bar and
title row with a 44px close button, swipe down to close, backdrop, focus trap, Esc, Back, page scroll
locked. Crossing to 768px+ closes it for good (it does not reopen when the width comes back).

Dock content: a pull down on the content while it (and every scroller under the finger) is at its top
moves the sheet down, as iOS sheets do; any other touch scrolls the content. A box whose `touch-action`
refuses vertical pans (pads, canvases) is never pulled.

Peek example (the row is yours; keep it to one line and 44px targets):

```tsx
<PageSidebar mobile="dock" title="Tilings" peek={
  <>
    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{name}</span>
    <Button size="icon" icon={ChevronLeft} aria-label="Previous tiling" onClick={prev} />
  </>
}>
```

## Store (`lib/stores/mobileSheet.ts`)

`useMobileSheet`, one per page (a page mounts one PageSidebar):

| Field / action | Meaning |
|---|---|
| `snap: SheetSnap \| null` | Dock snap; `null` means "use `defaultSnap`". Reset on PageSidebar mount/unmount. |
| `setSnap(snap)` | Move the dock (animated). E.g. an info button: `useMobileSheet.getState().setSnap("half")`. |
| `toggleSnap()` | peek to half, anything else to peek. |
| `open: boolean`, `setOpen(b)` | Modal sheet state. Header "Filters" buttons call `setOpen(true)`. |

`SheetSnap` = `"peek" | "half" | "full"`.

## Sheets and layers (`components/ui/bottom-sheet.tsx`, `lib/hooks/useModalLayer.ts`)

Every phone sheet is built from these: PageSidebar's modal mode, the wall filters and detail sheets
(`filter-wall.tsx`), the nav menu, and `Modal`. Do not hand-build another.

| Piece | Use |
|---|---|
| `useSheet(ref, open, onClose, label, axis?)` | The whole behaviour of a hand-built sheet: returns `{ active, swipe, dialogProps }`. `active` is `open` on a phone; spread `dialogProps` on the sheet element and `swipe` on its header (via `SheetHeader`). `axis: "right"` for a side panel. |
| `SHEET_PANEL` | Classes for the sheet element: fixed, full height under the status bar, rounded top, z-50. All `max-md:`. |
| `SheetBackdrop` | Dim layer; tap closes. Render while `active`. |
| `SheetHeader` | Grab bar, `h2` title, your controls (`children`), 44px close. The row drags the sheet away (not its controls). `grabBar={false}` for the menu. |
| `SheetFooter` | Pinned action bar with the home-indicator inset ("Show N results"). |
| `SheetTrigger` | THE button that opens a sheet ("Filters 3", "Contents"): dark 44px pill, icon, label, count (hidden at 0). `label`, `icon` (default sliders), `count`, `onClick`, `expanded`/`controls` when the sheet is an element on the page, `ref`. In a page header it sits in the flow; `floating` pins it bottom centre (PageSidebar uses that). Phone only. Never hand-build another. |
| `useSwipeDismiss(ref, onClose, axis, anywhere?)` | Only the drag, for a sheet with its own header (Modal uses it). `anywhere`: spread on the whole sheet; a drag may start on a control once the finger clearly goes along the axis (the menu). |
| `useModalLayer(ref, active, onClose)` | Only the layer: focus in and trapped, Esc, Back, scroll lock, focus restore. Phone-only whatever `active` says, so crossing to 768px+ releases everything. |
| `useLayerEntry(active, onClose)` | Only a place on the stack (Back and key order), for layers with their own focus handling (Radix). |
| `useDockSheet`, `snapCss`, `pickSnap`, `SheetGrabHandle` | The dock motion. PageSidebar uses it; reuse only for another dock. `snapCss(snap, half?)` is a snap's resting height as CSS; the `content` option is the scroller the pull-down watches. |

The layers form one stack. Only the top one answers Esc and Tab, so a `Modal` opened from inside a sheet
closes first, and focus comes back to the control in the sheet that opened it. Back: opening a layer
pushes a history entry with the same URL, Back closes the top layer (Next's router never sees the pop:
the module's popstate listener is added before the router's, and listeners on `window` run in the order
added), and closing a layer any other way removes its entry. A query the page rewrote while the sheet
was open survives, in the URL and in Copy link. A navigation from inside a layer (a link, "Open in
play", a `router.push`) takes the top layer's entry and closes the layers, so Back from the new page
returns to the old one in one press and Forward comes back. No `replace` needed on such links.

## Other shared pieces

| Piece | Where | Notes |
|---|---|---|
| `Modal` | `components/ui/modal.tsx` | Phone: bottom sheet, full width, rounded top, max 92dvh, body scrolls, grab bar, swipe down and Back close it. `footer` prop: action bar that stays in view while the body scrolls. Use a `Modal` for "info card as a sheet". Closing puts focus back on whatever had it when the modal opened (all widths). |
| `Tooltip` | `components/ui/tooltip.tsx` | `tapToOpen`. Default on for rich `content` (InfoDot), off for plain `label`. Tap toggles, tap outside closes. `"hold"`: the tap stays the trigger's own and a press held 500ms opens the card (OptionWall cells use it: tap selects, hold explains). Shortcut keycap hidden on phone. The arrow follows the side the popup lands on (`data-side`), so it stays right when there is no room on `side`. |
| `CornerControls` | `components/ui/corner-controls.tsx` | A canvas page's top-right cluster: Reset view (phone only), then Fullscreen rightmost, in that DOM order. Put it in the canvas box (`relative`) instead of a hand-placed `ResetViewButton` + `FullscreenToggle` (no more `right-16`). On the desktop the fullscreen button lands where a lone `FullscreenToggle` does. `fullscreen="phone"` when the desktop keeps fullscreen elsewhere (a toolbar: /play, /automata, /parquet); `fullscreen={false}` when a view renders its own toggle; `onReset` for a view that does not listen to `requestViewReset`. Put it before the `PageSidebar` in the DOM so it is read before the sheet. |
| `ResetViewButton` | `components/reset-view-button.tsx` | 44px `.ta-float`, phone only. `onClick` replaces the broadcast (the wall detail preview uses it). |
| `Nav` | `components/nav.tsx` | Phone bar (mark, section name, menu). `LINKS[].blurb` is the menu description. The menu closes when the width crosses to desktop, and swipes right to close. |
| `ThemeToggle variant="row"`, `UpdatesButton variant="row"` | | Menu rows; no key listeners. |

## Primitive changes on phone (automatic)

- `Kbd` and the tooltip keycap hidden; `Checkbox` stops reserving the keycap column and rows are at least 44px. (All widths: the row is the one control; the box inside is drawing only, not a second tab stop.)
- `Button` sm/md/icon, `ToggleButton`, `MultiSelect` chips, `Input`, `SearchInput`, `AngleFilterBlock`, `SidebarSection` headers: 44px.
- `.ta-tab` (OptionWall, Tabs, Toggle, Pagination cells): min-height 40px (group 46px).
- Sliders (`.ta-track`, `IntervalSlider`): 24px thumb on a 44px strip, `touch-action: pan-y`. A finger moves `RangeInput`/`Slider`/`IntervalSlider` only after 8px sideways (or on a tap), so a vertical swipe that starts on a slider scrolls the sheet. `Slider` gives the input a `useId` id when none is passed, so the label always names it. A raw `<input type="range">` does not get this: use `RangeInput`, with `native="<classes>"` where the desktop keeps the browser's own slider (the edge controls, the squaring stages). `RangeSlider` and `.ta-range` are gone (no users).
- `Switch`: invisible halo, 44px hit area. `InfoDot`: a real 44px box on phone (it takes its room in the row, so it never covers a neighbour's target and a neighbour never covers it).
- `Input` number steppers: pointer events (press-and-hold works under a finger), 44 by 21px each.
- Form fields are 16px on phone (stops iOS zoom-on-focus).
- Text floor: `.ta-label`, `text-[10px]`, `text-[10.5px]` and `text-[11px]` render at 12px (`mobile.css`), unless the element has its own phone SIZE (`max-md:text-xs|sm|base|lg` or `max-md:text-[…]`; a colour such as `max-md:text-fg-muted` does not opt out) or sits in an SVG. Smaller arbitrary sizes (8px, 9px) need a `max-md:text-xs` at the call site. InfoDot text 13px.
- Contrast: `fg-muted` and `fg-disabled` are darker on phone (4.5:1 on every surface incl. the sunken track); in the dark theme a `bg-accent` fill is one step darker (white on it 4.7:1, was 4.43), set on the filled element only so accent text keeps its value. Desktop tokens unchanged.
- `Pagination`: five slots on phone (first, current, last, gaps), so the strip fits 328px; full width and centred, whatever the parent.
- `FloatingToolbar`: icon buttons are `min-w-11` on phone, so a labelled button keeps its own width.
- `FloatingToolbar`: above `--sheet-offset`, max width screen minus 32px, sideways scroll with snap, 44px tall, no `bottom` animation under reduced motion. A "More" overflow menu is page work.
- No page pinch-zoom from the chrome over a canvas: the phone top bar, `FloatingToolbar`, `CornerControls`, `ResetViewButton` and `FullscreenToggle` are `touch-action: pan-x pan-y`.
- `RangeInput native`: hidden on a phone until hydration swaps in the track (no flash of the browser's slider).
- `FullscreenToggle`: 44px, `top-3 right-3` (use `CornerControls` beside a reset button).
- Utility classes `ta-sheet-in`, `ta-backdrop-in`, `ta-panel-in` animate only on phone.

Landscape phones (768px+ wide, desktop layout): `<body>` pads the left/right safe-area insets.

Not handled centrally: hover-revealed buttons (`opacity-0 group-hover:opacity-100`) need `max-md:opacity-100` at each call site.
