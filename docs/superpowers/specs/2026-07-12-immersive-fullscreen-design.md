# Immersive fullscreen for the /play canvas

Date: 2026-07-12. Status: approved, ready to implement.

## Goal

A toggle that hides the app chrome (header `Nav` + the `/play` sidebar) so the tiling canvas fills the
whole app window, with a smooth 300 ms transition and the canvas resizing to fill as the space opens.
Reference: the equivalent "immersive / hide-chrome" feature in the sibling TilingLife project (its `h`
shortcut + `uiVisible` store), adapted to this app's React/flexbox layout and existing `ResizeObserver`.

Scope decided with the user: collapse the app chrome only (no browser Fullscreen API). Header + sidebar
hide; the on-canvas overlays (tile-count readout, α slider) stay visible.

## Approach

Collapse the chrome inside the existing flexbox flow rather than overlaying/sliding it over the canvas.
The canvas-wrap is already `flex-1`, so as the header height and sidebar width animate to zero the
canvas-wrap grows, and the existing `ResizeObserver` on it drives the p5 canvas resize each frame —
genuinely smooth growth, not an instant snap. Rejected alternatives: (a) absolutely-positioned canvas
with the chrome sliding over it (TilingLife's approach — puts the canvas under the sidebar, fights our
side-by-side layout, resizes instantly); (b) transform-slide the chrome (leaves it in layout flow, so
the canvas never actually grows).

## State

New dedicated store `lib/stores/immersive.ts` — a minimal Zustand store `{ immersive: boolean; set }`
(mirrors `familyAlphas`). Deliberately NOT the configuration store: the global `Nav` and the play page
both read it, and we keep the config store free of layout concerns (and of the whole-store TilingsTab
subscriber). The play page resets `immersive` to `false` on unmount so navigating away can never strand
a hidden header on another route with no way to restore it.

## What hides, and the mechanism

- `components/nav.tsx` (client) reads `immersive` and collapses its own height: `h-12 → h-0` with
  `overflow-hidden`, an opacity fade, and `pointer-events-none` when hidden; `transition-all
  duration-300 ease-in-out`. It stays mounted in the server-rendered layout, just collapses. No change
  to `app/(app)/layout.tsx` (it stays a server component).
- The play page (`_play-client.tsx`) wraps `<Sidebar>` in a collapsing container:
  `cn("shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out", immersive ? "w-0" :
  "w-80")`. The shared `Sidebar` / `PageSidebar` components are untouched (used by other pages).
- The canvas-wrap (`flex-1 min-w-0`) grows as both collapse. Its existing `ResizeObserver` →
  `setSize` → `Canvas` prop change → the p5 draw loop's existing `resizeCanvas` on width/height change.
  No new resize code; the grid regrows through the existing "grew" rebuild path (already optimized).

## Toggle + shortcut

- A floating button inline in `_play-client.tsx`'s canvas-wrap (not a separate component — it's small
  and needs the store + a click handler): lucide `Maximize` icon, swapping to `Minimize` while
  immersive; stays visible in immersive mode so the user can exit. Sits at `absolute top-4 right-4
  z-20`. The symmetry-info badge is also top-right (`top-4 right-4`); when it's shown, offset the
  toggle (e.g. move it to the left of the badge, or the badge down) so they never overlap.
- Keyboard, added to the existing play-page `keydown` handler in `_play-client.tsx`: `h` / `H` toggles
  immersive; `Escape` exits it. Both ignored while a field/slider is focused or a modifier is held
  (same guard as the existing shortcuts). `h` is currently unused.

## Files touched

- new `lib/stores/immersive.ts`
- `components/nav.tsx` — read store, collapse height
- `app/(app)/play/_play-client.tsx` — sidebar collapse wrapper, inline toggle button, `h`/`Esc`
  shortcuts, reset-on-unmount

## Verification

Drive `/play` in a headful browser: toggle via button and via `h`; confirm header + sidebar collapse
smoothly over ~300 ms and the canvas grows to fill (screenshot both states); confirm `Esc` exits and the
sidebar/header return; confirm no per-frame jank in the transition (frame timing during the collapse);
confirm navigating away and back leaves the chrome visible (reset-on-unmount). `pnpm build` green.

## Out of scope (easy follow-ups)

Hiding the on-canvas overlays for a fully bare canvas; extending the toggle to /tiles or /configs; the
native browser Fullscreen API.
