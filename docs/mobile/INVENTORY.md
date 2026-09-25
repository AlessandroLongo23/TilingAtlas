# Mobile redesign: inventory of the current site

Snapshot taken 2026-09-24 at commit d93a1660, as groundwork for the phone layout (see `DESIGN.md`). Four read-only passes, one per area; each lists every control with `file:line`, the interactions, the keyboard shortcuts and the risks at 390px. This is the checklist the phone version must preserve.

1. Shell, landing, modals, shortcuts, styling system
2. /play and /library
3. /theory (all subroutes), /parquet, /freedraw
4. /colors, /aperiodic, /isohedral, /pentagons, /automata



---

## Inventory: app shell and cross-cutting pieces (mobile groundwork)

Repo: `/Users/alessandro/Desktop/Personal/TilingAtlas`, branch `design/instrument` @ `d93a1660`. Read-only survey, 2026-09-24.
All paths are repo-relative. `file:line` refers to the current tree.

Scope: root and (app) layouts, landing, /defense, /updates, /history (+ run/[runId]), Nav, PageSidebar,
ThemeToggle, FullscreenToggle + immersive store, every global/page keyboard shortcut, `components/ui/*`,
global modals, tokens/CSS, Tailwind, responsive classes, shared overlay patterns, canvas input model.

---

### 1. Routes in scope: purpose and layout

### Layout tree

```
app/layout.tsx (RootLayout)                       <html class="h-full antialiased {geist vars}" [.dark]>
  <head> inline theme script (localStorage.theme || prefers-color-scheme)   app/layout.tsx:28,36
  <body class="min-h-full flex flex-col">  children + <Analytics/>          app/layout.tsx:38
  ├─ app/page.tsx                (landing, NO Nav)          + <UpdatesGate/> at page.tsx:233
  ├─ app/defense/*               (slide deck, NO Nav, NO UpdatesGate, pinned light theme)
  ├─ app/not-found.tsx, app/error.tsx  -> components/error-screen.tsx (h-screen 3x3 wall)
  └─ app/(app)/layout.tsx        (the app shell)
        <div class="h-screen bg-surface-raised text-fg flex flex-col overflow-hidden">   (app)/layout.tsx:10
          <LegacyTilingStoreBootstrap/>   (_bootstrap.tsx: calls useLegacyTilingStore.initialize() once)
          <Nav/>                          h-12 (48px) top bar, collapses to h-0 in immersive mode
          <div class="flex-1 min-h-0 flex">{page}</div>   (row flex: pages put a w-80 sidebar + canvas side by side)
          <ScreenshotPreviewModal/> <ExportImageModal/> <UpdatesGate/>   (global, store-driven)
```

Key structural facts for a phone layer:
- The shell is exactly one viewport tall (`h-screen` = 100vh) with `overflow-hidden`; every page scrolls inside its own region. There is no `dvh`/`svh`, no `env(safe-area-inset-*)`, and no `export const viewport` anywhere (Next 16 injects the default `width=device-width, initial-scale=1`; see `node_modules/next/dist/docs/01-app/01-getting-started/14-metadata-and-og-images.md:38`).
- The page slot is a horizontal flex row (`flex-1 min-h-0 flex`). Pages assume "fixed-width left column + flexible canvas".
- Routes inside (app): `/aperiodic /automata /colors /freedraw /history /history/run/[runId] /isohedral /library /parquet /pentagons /play /theory(/**) /updates`.

### `/` landing (`app/page.tsx`, server, `force-dynamic`)
One centred column `mx-auto max-w-7xl px-6 md:px-12` (page.tsx:42). Already the most responsive page in the app.
1. Hero (page.tsx:45): `grid gap-10 lg:grid-cols-[5fr_7fr]`; single column below `lg` (1024px), so on a phone the masthead stacks above the specimen. Masthead: count link, `h1` `text-5xl md:text-6xl xl:text-7xl`, tagline, `LandingButtons`. Specimen frame `h-80 sm:h-[26rem] lg:h-[34rem]` (320px on phone) holding `HeroRotator` (live 2D canvas drifting, auto-rotates every 10 s) and a floating caption chip bottom-right with a Shuffle button.
2. "Start here" nav row (page.tsx:70): `flex flex-wrap`, three `h-7` hover chips linking to `/theory/uniform-tilings#…`.
3. "The collections" grid (page.tsx:92): `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, fixed row track `auto-rows-[24rem] sm:auto-rows-[22rem] lg:auto-rows-[23rem]`. Nine `CollectionCard`s; `span="2x1"` maps to `sm:col-span-2` so it collapses to 1 column on phone. On a phone that is 9 × 384px ≈ 3,456px of cards.
4. Footer (page.tsx:198): version + "what's new" link to /updates, credit line, Discord link.

### `/defense` (`app/defense/page.tsx` + `_defense-client.tsx`, `force-static`, unlisted, noindex)
Outside (app): no Nav, no updates modal. `PIN_LIGHT` script removes `.dark` (page.tsx:84). Full-viewport deck:
`<main class="relative h-screen w-full overflow-hidden">` (_defense-client.tsx:846). Two modes:
- Slide mode: 2px accent progress bar on top; slide frame `px-[6vw] py-[5vh]`, inner `max-w-[69rem] overflow-y-auto`; bottom status row with `n / total`, a keyboard legend (`hidden sm:inline`, line 925: "← → move · Esc overview · o/s/d/p overlays"), and the talk clock (`mm:ss / 35:00`, turns amber/red).
- Overview mode: scrollable grid of slide thumbnails `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`, each an `h-40` button (line 852-874).
Slide grids use `sm:`/`lg:` column counts (lines 222-227, 764).

### `/updates` (`app/(app)/updates/page.tsx` server `force-static`; `_updates-client.tsx`)
One scroller `flex-1 min-h-0 overflow-y-auto [container-type:size]` (line 99). Inner `max-w-[1056px] px-4 md:px-6`, and at `lg` a two-column grid `272px | minmax(0,680px)`.
- Left: sticky month-grouped release index, `hidden lg:flex`, `h-[100cqh]` (line 101-129). Hidden entirely below 1024px, so on phone there is no index at all.
- Right: header (h1 "Updates", blurb that says "drag to pan, scroll to zoom"), then one `<article>` per release with kind sections; tilings shown as live `InteractiveTilingPreviewCard`s in `grid-cols-2 sm:grid-cols-3` (line 205); text-only chips for ids without a cell.

### `/history` (`app/(app)/history/page.tsx`, `force-dynamic`, Supabase)
Not linked from Nav (commented out at `components/nav.tsx:28`). `flex-1 overflow-y-auto` wrapper around `RunsHistoryTable` (`components/run/runs-history-table.tsx`): `p-6` header ("Run history" + count), then an `overflow-x-auto` bordered table `min-w-[720px]` with 8 columns (Status, k, Family, Started, Duration, Results, Budget, Digest). Every cell is a `Link` to `/history/run/{id}`. Live via Supabase realtime channel `runs-history`.

### `/history/run/[runId]` (`components/run/run-view.tsx`)
`flex-1 overflow-y-auto`, `max-w-5xl px-6 py-6` column of panels: header (title, commit/workers mono line, status badge, realtime indicator), Seed queue (progress bar + `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` seed tiles), then `grid-cols-1 lg:grid-cols-2`: Found tilings (`GalleryPanel`, full width `lg:col-span-2`), Diagnostics, Certification (with "copy SYNC entry" chip), Digest history (sibling runs table with links).
`GalleryPanel` (`components/run/gallery-panel.tsx`): sort chips + `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5` thumbnail buttons; opens `InspectorDrawer` (`components/run/inspector-drawer.tsx`): `fixed inset-0 z-50 flex justify-end`, panel `w-full max-w-md` sliding from the right, backdrop click / Esc / X closes, body scroll locked.

### App shell pieces present on every (app) route
- `Nav` (`components/nav.tsx`), 48px tall, `px-4`, `bg-surface-chrome`, bottom hairline; hidden (h-0, opacity-0) in immersive mode.
- `PageSidebar` (`components/page-sidebar.tsx`), when a page uses it: outer clip box `w-80` (320px) or `w-0` when collapsed (300ms width transition); inner `<aside class="h-full w-80 ... border-r">` never shrinks, so collapse is a slide not a reflow; scrollable variant adds `ta-scroll-fade overflow-y-auto overflow-x-hidden scrollbar-hide pb-6`.

### Error / 404 (`app/error.tsx`, `app/not-found.tsx` → `components/error-screen.tsx`)
`h-screen overflow-hidden grid grid-cols-3` wall of tiling tiles; below `sm` the message row takes the full width and the two flanking tiles hide (error-screen.tsx:201-229). Actions: "Back to the atlas", "Library", "Play" (404) / retry + home + library (error).

---

### 2. Every control in scope

### Nav (`components/nav.tsx`)
| Control | Type | Action | file:line |
|---|---|---|---|
| Brand mark + "The Tiling Atlas" + `v{CURRENT_VERSION}` | Link | → `/` | nav.tsx:67-75 |
| Divider | decoration | | nav.tsx:77 |
| 10 route links: Theory, Library, Play, Parquet, Freedraw, Colors, Aperiodic, Isohedral, Pentagons, Automata | Link row, `overflow-x-auto scrollbar-hide` (sideways scroll when it does not fit) | navigate; active = `text-fg bg-surface-overlay`; `title="Label (n)"` | nav.tsx:17-29, 82-101 |
| Keycap badge per link (1-9, 0) | `Kbd`, `hidden 2xl:inline-flex` (only ≥1536px) | hint only | nav.tsx:97 |
| Keys 1-9, 0 | global keydown | `router.push` to the nth link | nav.tsx:44-58 |
| Discord | icon link `w-8 h-8` + Tooltip (left, delay 0) | opens `DISCORD_INVITE` in new tab | nav.tsx:104-114 |
| What's new | `UpdatesButton` icon button `w-8 h-8`, accent dot when unseen releases exist, lit when on /updates | opens updates modal; Shift+U | components/updates/updates-button.tsx:50-70 |
| Theme | `ThemeToggle` icon button `w-8 h-8` (Sun/Moon swap animation) | toggles `.dark` + `localStorage.theme`; Shift+T | components/ThemeToggle.tsx:59-78 |
| (History link) | commented out | route still exists | nav.tsx:28 |

### Landing (`app/page.tsx`, `components/landing/*`)
| Control | Type | Action | file:line |
|---|---|---|---|
| "{N} tilings" eyebrow | Link | → /library | page.tsx:49 |
| Start exploring | `Button` primary md (h-9) | → `/play?source=reference&tiling={specimen on stage}` | landing-buttons.tsx:15 |
| Browse the library | `Button` secondary md | → /library | landing-buttons.tsx:16 |
| Hero specimen | live canvas (drift + 10 s auto-rotate, radial wave transition), `aria-hidden`, no input | | hero-rotator.tsx:395-397 |
| Hero caption chip: id · label (label `hidden sm:inline`) · k | text in `ta-float` | | hero-rotator.tsx:399-402 |
| shuffle | text button (12px icon + "shuffle") | swaps specimen | hero-rotator.tsx:404-415 |
| Start here ×3 ("What is a tiling?", "The eleven uniform tilings", "Why exactly eleven?") | `h-7` Link chips | → /theory/uniform-tilings#hash | page.tsx:26-30, 72-80 |
| Card: Play (2x1, interactive) | live flat GL patch (`InteractivePlayMini`); caption Link | media: click to activate, drag pan, wheel zoom, Shift+wheel rotate, right-click home; caption → /play?tiling=… | page.tsx:96-106; interactive-play-mini.tsx; useFlatCellPreview |
| Card: Library | whole card Link; `LibraryMosaic` 3×3 static thumbs | → /library | page.tsx:108-116 |
| Card: Theory | whole card Link; `TheoryRing` 11 micro previews | → /theory | page.tsx:118-126 |
| Card: Hyperbolic (interactive if patch) | live Poincaré disk; caption Link | activate on click; drag pans, wheel ROTATES, right-click resets | page.tsx:128-139; interactive-hyperbolic-mini.tsx:86-166 |
| Card: Spherical (interactive if solid) | live three.js sphere (ArcballControls), mounted only in view | activate on click; drag rotates, wheel/pinch dolly | page.tsx:141-150; interactive-spherical-mini.tsx |
| Card: Parquet deformations (2x1) | whole card Link; animated strip (rAF, off under reduced motion) | → /parquet | page.tsx:152-161; parquet-mini.tsx |
| Card: Aperiodic (2x1, interactive) | live hat patch (`useAperiodicView`), mounted only in view | activate on click; drag pan, wheel zoom, Shift+wheel rotate, right-click home; caption → /aperiodic?view=hat | page.tsx:163-173; interactive-hat-mini.tsx:213-217 |
| Card: Isohedral | whole card Link; static SVG IH1 | → /isohedral | page.tsx:175-183 |
| Card: Pentagons | whole card Link; static SVG Type 15 | → /pentagons | page.tsx:185-193 |
| Completeness badge per card | chip (`pointer-events-none`) | info only | completeness-badge.tsx |
| Card hover effects | media desaturated at rest, full on hover; ring + shadow lift; title → accent, arrow nudges | hover only | collection-card.tsx:51-55, 77-78, 98 |
| Footer "what's new" | Link | → /updates | page.tsx:209 |
| Footer "Join the Discord" | external link | | page.tsx:218-226 |
| Updates modal (auto) | `UpdatesGate` | see modals | page.tsx:233 |

### /defense (`app/defense/_defense-client.tsx`)
| Control | Type | Action | file:line |
|---|---|---|---|
| → / PageDown / Space | key | next slide (starts clock on first advance) | 373-381 |
| ← / PageUp | key | previous slide | 382-386 |
| Home / End | key | first / last slide | 387-394 |
| Esc | key | toggle overview grid | 395-398 |
| Overview slide tiles | `h-40` buttons in responsive grid | jump to slide, close overview | 852-874 |
| Live preview cards on slides | `InteractiveTilingPreviewCard` with `alwaysActive`, `expandMode="overlay"` | drag/wheel immediately; expand to 90% viewport overlay; open in Play | SLIDE_CARD_PROPS line 77 |
| o / s / d / p (nothing focused) | keys via `PreviewOverlayScope` | toggle orbits / symmetry / fundamental domain / polygon points on every card of the slide (reset per slide) | 844; lib/hooks/usePreviewOverlays.tsx:9-14,106-117 |
| Slide-embedded widgets with their own keys | see §3 key table (growth-strip, seed-strip, row-stacker, compat-graph) | | |
| Status row: counter, legend (`hidden sm:inline`), clock | text | | 919-936 |
There is no on-screen next/previous control and no swipe: slide navigation is keyboard-only (overview tiles are the only pointer path).

### /updates
| Control | Type | Action | file:line |
|---|---|---|---|
| Release index buttons (per release, grouped by month; sticky headers; active highlight tracks scroll) | buttons, `hidden lg:flex` | smooth-scroll to release | _updates-client.tsx:101-129 |
| Change text links (`change.href`) | Link | navigate | 182-188 |
| Live tiling preview cards | `InteractiveTilingPreviewCard` (`showExpand={false}`, open link → `previewHref(id)`) | click to activate, drag pan, wheel zoom, Shift+wheel rotate, right-click home; hover-revealed "Open" button; o/s/d keys when focused | 204-217 |
| Text-only tiling chips | Link chips | → shelf / play | 220-232 |

### /history and /history/run/[runId]
| Control | Type | Action | file:line |
|---|---|---|---|
| Table rows (each cell a Link) | table, `min-w-[720px]` in `overflow-x-auto` | → run page | runs-history-table.tsx:110-165 |
| Row hover tint | hover only | | runs-history-table.tsx:125 |
| CopyChip "copy SYNC entry" | text button | clipboard | run-view.tsx:39-58, 274 |
| Realtime indicator (title tooltip) | status | | run-view.tsx:193-200 |
| Seed tiles | display (truncate + `title`) | | run-view.tsx:222-240 |
| Gallery sort chips | buttons (`px-2 py-0.5`, ~20px tall) | re-sort found tilings | gallery-panel.tsx:80-95 |
| Gallery thumbnails | `role=button` tiles, Enter/Space | open inspector | gallery-panel.tsx:97-133 |
| Inspector: close X (`title="Close (Esc)"`), backdrop, Esc | buttons / key | close | inspector-drawer.tsx:82-93, 116, 129-137 |
| Inspector: zoom `Slider` 14-96 px/edge | slider | thumbnail scale | inspector-drawer.tsx:151 |
| Inspector: CopyButton (canonical key) | icon button `title="Copy"` | clipboard | inspector-drawer.tsx:33-50, 191 |
| Digest history sibling links | Link | → other run | run-view.tsx:386 |

### Global modals (mounted in `app/(app)/layout.tsx`, all on `components/ui/modal.tsx`)
| Modal | Opened by | Contents / controls | Layout |
|---|---|---|---|
| `ExportImageModal` (`components/export-image-modal.tsx`), title "Export image", `size="lg"` (max-w-4xl) | /play only: `useExportImage.getState().open(...)` at `_play-client.tsx:1879` | Preview image (min-h 260/340px, checkerboard when transparent); **Frame** ButtonGroup (Screen, 1:1, 16:9, 4:5, A4); **Zoom** Slider (ZOOM_MIN..ZOOM_MAX, "≈ n edges across") + "Match current view" link-button (or a note when the view owns its camera); **Size** ButtonGroup 1×/2×/4× + number Input (64..MAX_CAPTURE_EDGE); **Background** ButtonGroup Theme/Transparent; **Format** ButtonGroup PNG/SVG (SVG disabled with reason); **Copy** (PNG + ClipboardItem only); **Download image** (primary). Esc/backdrop/X close unless busy. | `flex-col md:flex-row` (preview beside a `md:w-72` control column), footer `flex-col sm:flex-row` (lines 373, 405, 489). Already stacks on phone. |
| `ScreenshotPreviewModal` (`components/screenshot-preview-modal.tsx`), "Screenshot Preview", `max-w-2xl` | `useScreenshotPreview.open` from `tiling-card.tsx:43`, `reference-card.tsx:110`, `vertex-config-card.tsx:55`, `prototile-card.tsx:27` | Image preview (max-h 320px); "Save Locally" (secondary lg, h-12); "Save to Supabase" (primary lg, only when `allowSupabaseUpload`); error text | buttons `flex-col sm:flex-row` (line 80) |
| `UpdatesModal` via `UpdatesGate` (`components/updates/updates-gate.tsx`, `updates-modal.tsx`), "What's new", `size="md"` (max-w-xl) | Auto-open on MINOR/MAJOR unseen release; nav button; Shift+U; `?updates=force` | Header chip "range · count"; body `max-h-[65vh] overflow-y-auto`, grouped by kind; change links; `TilingStrip` of 80×80 static thumbnails (Links) or text chips; footer date + "See all updates" (→ /updates). Closing marks read (`lib/stores/updates.ts:40`). | single column |
| (`PipelineProgressDialog`, `components/pipeline-progress-dialog.tsx`) | pipeline/lab code, not mounted in the shell | progress + Esc to close when `canClose` | `fixed inset-0 z-50 p-4` |

`Modal` primitive (`components/ui/modal.tsx`): Radix Dialog; overlay `fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]`; content `fixed left-1/2 top-1/2 -translate-1/2 w-full {max-w}` with `rounded-overlay`; header `px-5 py-4` title + optional `header` slot + X close (`p-1`, 18px icon). No max-height and no internal scroll on the content box itself (each modal adds its own), no side margin: `w-full` means a modal touches both screen edges below its max-width. Sizes: sm max-w-md, md max-w-xl, lg max-w-4xl, xl max-w-6xl, full max-w-[95vw]. The `animate-in`/`fade-in-0` classes are tailwindcss-animate names; that plugin is not installed, so they are no-ops.

### Other shell-level controls
| Control | File | Notes |
|---|---|---|
| `FullscreenToggle` button (Maximize/Minimize, `absolute top-4 right-4 z-30 ta-float p-2`, 16px icon) + Tooltip "Fullscreen canvas / Exit fullscreen" shortcut F / "F or Esc" | components/fullscreen-toggle.tsx:51-74 | used by /aperiodic (3 views), /isohedral, /pentagons; /play has its own inline copy |
| `useImmersiveShortcuts()` F toggles, Esc exits, resets on unmount | fullscreen-toggle.tsx:25-45 | /aperiodic, /isohedral, /pentagons |
| Immersive store `{immersive, set, toggle}` | lib/stores/immersive.ts | read by Nav, /play, /aperiodic controls, /isohedral, /pentagons |
| `LegacyTilingStoreBootstrap` | app/(app)/_bootstrap.tsx | no UI |

---

### 3. Interactions: mouse/hover/keyboard/wheel/drag dependencies

### 3a. Complete keyboard shortcut map (every `keydown` listener in the app)
All global handlers share the guard `isTypingTarget` (`lib/hooks/useKeyShortcuts.ts:13`) and skip Cmd/Ctrl/Alt chords unless noted. None of these has a touch equivalent unless the "on-screen equivalent" column says so.

**Global (every (app) page)**
| Key | Action | Where bound | On-screen equivalent |
|---|---|---|---|
| 1-9, 0 | jump to nth Nav link | components/nav.tsx:44-58 | Nav links |
| Shift+T | toggle theme (capture phase, stops propagation) | components/ThemeToggle.tsx:47-57 | ThemeToggle |
| Shift+U | open "What's new" (capture) | components/updates/updates-button.tsx:33-43 | UpdatesButton |

**/play** (`app/(app)/play/_play-client.tsx:1245-1409`, plus sidebar/studio listeners)
| Key | Action |
|---|---|
| R | random tiling (blocked while the editor is open) |
| ← / → | previous / next tiling in the current list (blocked while editor open) |
| F | toggle immersive; Esc exits immersive |
| P I S D X T O M | toggle showPolygonPoints / isIslamic / showSymmetryElements / showFundamentalDomain / inversive / tilingTransition / showVertexOrbits / mirrorFlip (with per-class blocking) |
| G P O A on freedraw / pentEdges / ihEdges shelves | freedrawScaffold / freedrawLattice / freedrawVertices / freedrawArcs; A (Truchet arcs) on any flat shelf; G also once arcs are up |
| G P O on colorings | colorsEdges / colorsLattice / colorsVertices |
| G on spherical freedraw / spherical Schwarz | sphericalFreedrawGrid |
| G on hyperbolic edges / hyperbolic Schwarz | freedrawScaffold |
| W or B on sphere surfaces | face opacity 0 ↔ 1 |
| B on flat shelves | fill amount 0 ↔ default |
| C / V | Catalogue / View-options sidebar tab (components/sidebar/tilings-tab.tsx:61-76) |
| E | open the studio editor (components/studio/studio-bar.tsx:76-83) |
| 1-6 (editor open, capture, stops Nav) | pick tool: select, merge, cut, move, edge, paint (studio-bar.tsx:39-48, 106-110) |
| Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z (editor open) | undo / redo |
| Esc (editor open) | leave editor |
| Cmd (held) + mouse move | scrub parametric angle(s) (components/canvas.tsx:1098; hint chips in components/param-slider-panel.tsx:67,143) |
| Arrow keys inside `role="application"` widgets | owned by the widget (param-region-pad, basis-pad), not the page |

**Other pages**
| Page | Keys | Bound at |
|---|---|---|
| /colors | ←→↑↓ grid walk (clamped, row = live column count); G / P / O overlays | app/(app)/colors/_colors-client.tsx:148-165; lib/hooks/useGridArrowNav.ts |
| /freedraw planar | ←→↑↓ grid walk; G P O A overlays | components/freedraw/planar-freedraw.tsx:352-370 |
| /freedraw spherical | ←→↑↓; G grid | components/freedraw/spherical-freedraw.tsx:189-202 |
| /freedraw hyperbolic | ←→↑↓; G scaffold | components/freedraw/hyperbolic-freedraw.tsx:135-146 |
| /pentagons | ←→↑↓ walk the 15-type grid (wraps); F / Esc immersive; X lens | app/(app)/pentagons/_pentagons-client.tsx:115-149, 186 |
| /isohedral | F / Esc immersive; X lens | app/(app)/isohedral/_isohedral-client.tsx:178, 201 |
| /aperiodic | F / Esc immersive | app/(app)/aperiodic/_aperiodic-client.tsx:37 |
| /automata | Space run/pause; `.` step one generation; N reseed; R random tiling; ← → prev/next tiling | app/(app)/automata/_automata-client.tsx:117-153 |
| /automata sidebar | T / U / B tabs Tiling / Rule / Board | components/automata/automata-sidebar.tsx:28-32, 120-132 |
| /theory (preview scope) and /defense | o / s / d / p overlays for every card when no card is focused; same keys per focused card; Esc un-focuses a card (deactivates) or closes its expansion | lib/hooks/usePreviewOverlays.tsx:106-117; components/interactive-tiling-preview-card.tsx:205-220; lib/hooks/useCardActivation.ts:48-50 |
| Theory/deck widgets | growth strip and seed strip: `,` `.` cycle, Enter confirm (capture); row stacker: 1 add S row, 2 add T row, Backspace undo, 0 reset (capture, stops Nav); compat graph: R another tiling | components/growth-strip.tsx:171-181; components/seed-strip.tsx:336-356; components/row-stacker.tsx:100-113; components/compat-graph.tsx:408-419 |
| Run inspector | Esc close | components/run/inspector-drawer.tsx:82-93 |
| Pipeline dialog | Esc close | components/pipeline-progress-dialog.tsx:13-19 |
| Parametric shelves | X lens (`useInversiveShortcut`) | components/inversive-controls.tsx:30-47 |

Key-level widgets with `onKeyDown`: `interval-slider` thumbs (arrows), `hue-ring` (arrows ±1°, Shift ±15°), `hankin-pad` handles (arrows ±1, Shift ±10), `basis-pad`, `param-region-pad`, `checkbox`, `pagination` page input, `gallery-panel` tiles, `reference-card`, `tiling-card`, `part-slide`.

### 3b. Pointer / mouse / wheel / touch model
- Pan: every live canvas uses single-pointer drag (Pointer Events with `setPointerCapture`, or p5's mouse model on /play). Single-finger drag therefore already works wherever the element has `touch-action: none` (list below).
- Zoom: wheel only. `zoomAtPoint` + `wheelDeltaPx` in `lib/render/viewControls.ts:52-92` (shared by 11 files). **No pinch-to-zoom exists on any 2D/WebGL flat or hyperbolic canvas.** grep for `pinch|gesturestart|touches|pointers.size` finds nothing in input code.
- The only pinch support is three.js `ArcballControls` on spherical views (`lib/render/sphericalCamera.ts:56`, "wheel / pinch dolly"), which handles multi-touch internally.
- Rotate: Shift+wheel in 5° detents (flat views, aperiodic, colors, freedraw, preview cards); plain wheel rotates the hyperbolic disk (`components/canvas.tsx` wheel branch; landing hyperbolic mini). No touch rotate.
- Reset/home: right-click (`button === 2`) on /play canvas, aperiodic views, preview cards, landing minis (`useAperiodicView.ts:388,424`; `useFlatCellPreview.ts:562,617`; `interactive-hyperbolic-mini.tsx:116`). Double-click refit on freedraw and colors canvases (`freedraw-canvas.tsx:329`, `colors-canvas.tsx:221`), patch-card (`patch-card.tsx:249`), studio canvas. Middle-click centres on /play (`canvas.tsx` mousePressed `button === 1`). Touch has no right-click or middle-click; double-tap is not wired.
- /play canvas click-to-centre: a click (moved < threshold) centres on the clicked vertex (`canvas.tsx:98`, handler in `mousePressed`/`mouseReleased` at 923-1060).
- Cmd+mouse-move scrubbing of parametric angles (`canvas.tsx:1098`) has no touch path; the sliders in `param-slider-panel.tsx` remain.
- `touch-action: none` is set on: pentagons/isohedral/aperiodic canvases (`touch-none`), automata canvas + surface view, studio canvas, compat graph, param-region-pad, basis-pad, hankin-pad, hue-ring, velocity-pad, color-pad, IntervalSlider (`.ta-ival`), spherical canvases, ico-freedraw, patch-card, squaring figures, and preview cards/landing minis while active (`useCardActivation.ts:60`, `interactive-tiling-preview-card.tsx:204`). It is not set on freedraw-canvas or colors-canvas or the /play p5 canvas by any grep hit, so a touch drag there may scroll or be claimed by the browser (verify on device).
- Touch-specific handlers: only `components/ui/color-pad.tsx:58-101` (touchstart/touchmove/touchend alongside mouse). `components/ui/input.tsx:149-163` number steppers use `onMouseDown/Up/Leave` only (press-and-hold autorepeat does not work on touch).
- Click-to-activate cards (`lib/hooks/useCardActivation.ts`): inert until focused so the page scrolls; activation = focus; touch-action flips to none while active. Deactivation needs Esc or focusing elsewhere, and on a phone "tap elsewhere" only blurs if the tapped target is focusable, so a live card can keep eating vertical swipes (verify).
- Context menu suppressed on /play canvas, studio canvas, automata canvas, hyperbolic mini, flat previews, aperiodic views (a long-press on iOS/Android would otherwise raise the callout).

### 3c. Hover-dependent UI
- `Tooltip` (`components/ui/tooltip.tsx`, Base UI 1.6) is the only source of labels and shortcut hints for icon-only buttons (Discord, What's new, Theme, Fullscreen, every `ToolbarButton`, OptionWall/ButtonGroup cells with `tooltip`). Base UI tooltips open on hover/focus, not on tap; whether a tap-focus opens them on iOS is unverified. Treat all tooltip content as invisible on touch.
- `InfoDot` (`components/ui/info-dot.tsx`, 7 import sites): the "why" text for controls lives only in a hover card (`cursor-help`).
- Hover-revealed buttons (`opacity-0 … group-hover:opacity-100`): preview-card expand/open stack (`interactive-tiling-preview-card.tsx:244`, visible also on `focus-within`), screenshot buttons on `tiling-card.tsx:124`, `reference-card.tsx:316`, `vertex-config-card.tsx:100`, `prototile-card.tsx:63`, `hyperbolic-figure-card.tsx:38`, error-screen labels (`error-screen.tsx:148`). On touch these are unreachable or need a first tap.
- `components/tiling-info.tsx:129-160` info popover opens on `onMouseEnter`, pins on click (click works on touch). Used by /play canvas, /isohedral, /pentagons.
- Native `title=` attributes carry information in Nav links (shortcut), updates index, run table, inspector.
- ~240 `hover:`/`group-hover:` utility uses across app+components; most are cosmetic.

---

### 4. Shared components and primitives a mobile layer can hook into

### Layout primitives
- **`PageSidebar`** (`components/page-sidebar.tsx`): the single w-80 left column. Used by 10 call sites: `app/(app)/aperiodic/_controls.tsx:24` (collapsed=immersive), `app/(app)/isohedral/_controls.tsx:59`, `app/(app)/pentagons/_controls.tsx:32`, `app/(app)/automata/_automata-client.tsx:158`, `app/(app)/theory/_theory-client.tsx:189`, `app/(app)/theory/tiles/_tiles-client.tsx:48`, `app/(app)/theory/configs/_configs-client.tsx:70`, `components/reference-shelf.tsx:2064` (/library), `components/sidebar/index.tsx:53` (/play's `Sidebar`, itself wrapped in /play's own w-80/w-0 clip at `_play-client.tsx:1602-1607`), `components/squaring/pipeline-explorer.tsx:209` (/theory/perfect-rectangles/pipeline). One change here (e.g. render as a bottom sheet / drawer below a breakpoint) reaches almost every tool page.
- Pages that do NOT use PageSidebar: /parquet (own `<aside class="md:w-80">`, already `flex-col md:flex-row` at `_parquet-client.tsx:310-312`), /colors and /freedraw (the `components/freedraw/filter-wall.tsx` kit: `WallBar` filter band on top, thumbnail grid `CATALOGUE_GRID` = `repeat(auto-fill,minmax(116px,1fr))`, and a right-hand `DetailPane` `<aside class="w-[380px]">` with a fixed `h-80` live preview at line 285), /updates, /history, landing, /defense.
- **Immersive store** (`lib/stores/immersive.ts`) + `FullscreenToggle`/`useImmersiveShortcuts` (`components/fullscreen-toggle.tsx`): already hides Nav and sidebar; a phone layout could reuse `immersive` as its "canvas only" state.
- **`Nav`** (`components/nav.tsx`): single component, one place to swap in a hamburger/drawer; LINKS array at line 17.
- **`FloatingToolbar` / `ToolbarButton` / `ToolbarReveal` / `ToolbarDivider`** (`components/ui/floating-toolbar.tsx`): bottom-centre pill `absolute bottom-4 left-1/2 z-30`, h-8 buttons. Used by /play (`_play-client.tsx`), /parquet, /automata (`components/automata/automata-transport.tsx`).
- **`.ta-float`** material (`app/globals.css:388`): every overlay floating over a canvas. Users: fullscreen-toggle, tiling-info, pentagon-edges-controls, isohedral-edges-controls, aperiodic `_multigrid-view`, studio-inspector, palette-strip, pie-chart, squaring-inset, hero-rotator caption, preview-card buttons.
- **`Tabs`** (`components/ui/tabs.tsx`, Radix): /play sidebar (Catalogue / View options) and /automata sidebar (Tiling / Rule / Board); renders `Kbd` per tab.
- **`Modal`** (`components/ui/modal.tsx`): 6 importers: export-image, screenshot-preview, updates-modal, polygon-filter-modal, reference-shelf, legacy-catalog, tiling-modal-content (the last has its own `w-80` collapsible filter column at line 182).
- **`InteractiveTilingPreviewCard`** + `useFlatCellPreview` + `useCardActivation` + `usePreviewOverlays`: shared by /theory, /updates, /defense, and the landing Play mini. One place to add pinch and a tap affordance for the hover-revealed buttons.
- **Canvas interaction math** `lib/render/viewControls.ts` (11 importers) and `lib/hooks/useAperiodicView.ts` (aperiodic views + landing hat): the natural home for a shared pinch handler (`zoomAtPoint` already takes a focal point and a delta).
- **`useKeyShortcuts` / `isTypingTarget` / `useGridArrowNav`** (`lib/hooks/`): all shortcut plumbing; a mobile layer needs on-screen equivalents for whatever these bind.
- **`lib/hooks/useMetaKeyLabel.ts`**: produces the ⌘/Ctrl label used in the scrub hint.

### UI primitives (`components/ui/`, approximate direct-import counts)
| Primitive | Kind | Size facts relevant to touch | Imports |
|---|---|---|---|
| button.tsx | Button / Link | sm h-8, md h-9, lg h-12, icon 32×32 | 21 |
| checkbox.tsx | labelled row + `Kbd` slot (reserves 18px when no shortcut) | box 14-16px | 11 |
| slider.tsx → range-input.tsx | label + readout + native range under DOM track | track 14px tall, thumb 12px | 12 / 9 |
| range-slider.tsx | dual native ranges (`.ta-range-overlay`) | thumbs 12px | 1 |
| interval-slider.tsx | custom dual thumb, pointer events, `touch-action:none` | thumbs 12px | 2 |
| option-wall.tsx | segmented grid (`.ta-seg` / `.ta-tab`), optional Tooltip per cell | `min-h-7` (28px) | 9 |
| button-group.tsx | chip row, optional Tooltip | | 7 |
| toggle.tsx | two-segment switch | | 3 |
| toggle-button.tsx | pressed button | sm h-7, md h-9 | 1 |
| switch.tsx | on/off | sm 36×20, md 48×24 | 2 |
| tabs.tsx | Radix tabs | `py-1.5` 13px text | 3 |
| pagination.tsx | `@container`; "n of m" `hidden @lg:inline`; page jump input `hidden @2xl:flex`; page cells h-7 | 28px targets | 7 |
| tooltip.tsx | Base UI tooltip | hover/focus only | 10 (+ via others) |
| info-dot.tsx | Tooltip on 14px icon | hover only | 7 |
| kbd.tsx | keycap badge 18px | meaningless on touch | 7 |
| modal.tsx | Radix dialog | see §2 | 6 |
| floating-toolbar.tsx | canvas toolbar | h-8 buttons | 4 |
| sidebar-section.tsx | collapsible section header | | 4 |
| section-heading.tsx, reveal.tsx, badge.tsx | structure | | 3 / 5 / 4 |
| input.tsx | text/number, mouse-only steppers | sm h-8 | 4 |
| search-input.tsx, multi-select.tsx (h-7 chips), angle-filter-block.tsx, reload-button.tsx | filters | | 1 each |
| color-pad.tsx | 2D pad, mouse + touch events | | 2 |
| hue-ring.tsx, hankin-pad.tsx, velocity-pad.tsx, basis-pad.tsx | SVG direct-manipulation pads, pointer capture, double-click reset (hue-ring, basis-pad) | | 2 / 1 / 2 / 1 |
| disk-thumbnail.tsx, thumbnail-skeleton.tsx | thumbnail shells | | 3 / 6 |
No Popover, DropdownMenu, Select, Sheet or Drawer primitive exists. The only drawer is the ad hoc `components/run/inspector-drawer.tsx`.

---

### 5. Styling system

- **Tailwind v4.2.2** via `@tailwindcss/postcss` (`postcss.config.mjs`). No `tailwind.config.*`. Configured in CSS: `app/globals.css:5` `@import "tailwindcss" source(none)` with explicit `@source "../app" "../components" "../lib"` (auto scan is off; a new directory of components must be added here or its classes will not be generated).
- **Breakpoints:** Tailwind defaults, none overridden in `@theme`: sm 640, md 768, lg 1024, xl 1280, 2xl 1536 (px). Container-query variants in use: `@lg` (32rem) and `@2xl` (42rem) in pagination; `@container` also in `components/part-slide.tsx:53`, `components/method-card.tsx:472`.
- **Existing @media rules:** only `prefers-reduced-motion: reduce` (globals.css:188, 264, 524, 563). No width media queries in CSS. JS `matchMedia` only for color scheme and reduced motion.
- **Responsive utility usage** (files with sm/md/lg/xl/2xl prefixes): app/page.tsx (14), app/defense/_defense-client.tsx (14), components/squaring/stage-board.tsx (11), app/(app)/theory/_theory-client.tsx (9: `xl:` TOC aside `hidden xl:block w-60`, grids), components/export-image-modal.tsx (7), components/error-screen.tsx (7), app/(app)/updates/_updates-client.tsx (7), components/run/run-view.tsx (5), components/compat-rule.tsx (4), app/(app)/parquet/_parquet-client.tsx (4, the only tool page with a `md:` sidebar switch), components/tiling-modal-content.tsx (3), components/run/gallery-panel.tsx (3), app/(app)/aperiodic/_multigrid-view.tsx (3, `md:flex-row` split), components/ui/pagination.tsx (2), and one each in nav.tsx (`2xl:` keycaps), screenshot-preview-modal, markdown-renderer (`md:py-10`), hero-rotator, collection-card, theory/page.tsx, squaring/pipeline-explorer. Every other tool page (play, library, colors, freedraw, aperiodic, isohedral, pentagons, automata) has no breakpoint classes at all.
- **Tokens:** three layers imported in globals.css:11-13.
  - `app/styles/tokens/primitives.css`: oklch palettes (neutral warm grey H≈90/270, green, red, amber, blue), 4px spacing scale `--size-*`, font families bound to Geist / Geist Mono (`next/font` vars on `<html>`), font sizes xs-4xl, radii (xs 3 … xl 12, full), motion (120/200/350ms; standard/out/spring easings), opacity steps.
  - `themed.css`: semantic `--color-surface-{base,raised,chrome,overlay,sunken}`, `--color-tab-on/ring`, text, borders, accent (ultramarine oklch(0.50 0.19 264), lifted in dark), status, caution, hover/active overlays, tinted shadows, automata RGB triples. `.dark` block redefines them.
  - `derived.css`: `--space-*`, semantic radii (control 6, surface 8, overlay 12, pill), typography roles, motion transitions, **z-layers** (`--z-elevated 10, --z-dropdown 100, --z-modal 200, --z-toast 300, --z-tooltip 400`), focus ring.
  - `@theme inline` (globals.css:20-88) maps them to utilities: `bg-surface*`, `text-fg*`, `border-line*`, `bg-accent*`, `rounded-control|surface|overlay|pill`, `shadow-sm..xl`. Note: Modal and FloatingToolbar use literal `z-50`/`z-30`, not the z tokens; only Tooltip uses `z-[var(--z-tooltip)]`.
- **Component classes in globals.css:** `.ta-track*` (range slider), `.ta-ival*` (interval slider, `touch-action:none`), `.ta-range*` (native range), `.ta-label` (mono caps 10.5px section label), `.ta-float` (canvas overlay material), `.ta-scroll-fade`, `.ta-seg` / `.ta-tab` (segmented control, state from `data-state`/`aria-pressed`/`aria-checked`), `.ta-lanes`/`.ta-lane-cell`, `.ta-sticky-rule`, `.ta-skeleton`, `.ta-fade-in/out`, `.ta-tree-reveal`, `.slide-spread`, `.scrollbar-hide`, `.disable-transitions`, `.ta-hazard-stripes`, `.ta-wall` (retired no-op).
- **Dark mode:** class strategy. `@custom-variant dark (&:where(.dark, .dark *))` (globals.css:15). Pre-paint script in `app/layout.tsx:28` sets `.dark` from `localStorage.theme`, else `prefers-color-scheme`, and defaults to dark if localStorage throws. `ThemeToggle` flips the class, writes localStorage, briefly adds `.disable-transitions`, and follows OS changes only when no explicit preference is stored. /defense forces light.
- **Fonts:** Geist + Geist Mono via `next/font/google`, `display: swap`. Body 16px base; much chrome text is 10-13px (`text-[13px]`, `text-[10.5px]`, `text-[11px]`).
- Other libs in the shell: `@base-ui/react` 1.6 (Tooltip), Radix Dialog 1.1.15 + Tabs, `motion` 12.38 (toolbar reveal, preview-card layout, gallery), `lucide-react` icons, p5 2.2.3 (/play canvas), three.js (spherical).

---

### 6. Mobile-risk notes (390px wide, touch)

1. **Nav does not fit.** Brand block (~190px with version) + divider + three 32px icon buttons + `px-4` leaves roughly 50-60px for ten links; the link strip scrolls sideways with its scrollbar hidden, so most sections are undiscoverable. Keycaps are already hidden below 2xl. Needs a menu/drawer.
2. **Every tool page is "320px sidebar + canvas" in a row.** At 390px, `PageSidebar` (w-80) leaves ~70px of canvas. /colors and /freedraw are worse: a filter band, a thumbnail grid and a fixed 380px right-hand `DetailPane`; the pane alone is wider than the phone. Only /parquet and the aperiodic multigrid split have an `md:` stacking fallback.
3. **100vh shell.** `h-screen` + `overflow-hidden` on the (app) wrapper, /defense and the error screen. On iOS Safari 100vh is taller than the visible area, so bottom-anchored UI (FloatingToolbar `bottom-4`, param panels `bottom-16`, canvas overlays `bottom-4/8`) can sit under the browser toolbar. No safe-area insets anywhere (notch, home indicator). Use `dvh`/`svh` and `env(safe-area-inset-*)` in the phone layer.
4. **No pinch zoom** on any flat, hyperbolic, aperiodic, colors, freedraw, automata, studio or preview canvas. Zoom is wheel-only, rotation is Shift+wheel, reset is right-click or double-click, centre is middle-click. On a phone a user can pan and nothing else (except spherical views, where ArcballControls gives pinch dolly). Isohedral explicitly has no zoom control because "the wheel does it" (`_isohedral-client.tsx:493-495`).
5. **Keyboard-only features.** Most overlay toggles have a sidebar checkbox, but these have no visible control in scope: Nav 1-0 (fine, links exist), /play ← → prev/next (the toolbar has ← R → buttons at `_play-client.tsx:1833-1840`, so /play is covered), C/V tab keys (tabs exist), the /pentagons arrow walk (type grid exists), /colors and /freedraw arrow walk (grid exists), Cmd+move angle scrubbing (sliders exist, but the coupled-region pad `param-region-pad.tsx` is a small 2D target), and the /defense deck, whose slide navigation (→/←/Space/PageUp/PageDown/Home/End/Esc) has **no pointer or swipe path at all**. Deck widgets (growth strip `,` `.` Enter; row stacker 1/2/Backspace/0; compat graph R) likewise need visible buttons if the deck should work on a phone.
6. **Hover-only information.** Tooltips are the only label for icon buttons and the only carrier of shortcut hints; InfoDot explanations are hover cards; several card action buttons are `opacity-0` until hover; `tiling-info` opens on hover (click pins it, which is fine). Tooltip-on-tap behaviour of Base UI 1.6 is unverified.
7. **Tap targets are small.** Nav links ~28px tall, icon buttons 32px, OptionWall/pagination cells 28px, MultiSelect chips 28px, gallery sort chips ~20px, checkbox boxes 14-16px, slider thumbs 12px on a 14px track (native range underneath gives a slightly larger hit area on WebKit, the custom IntervalSlider does not). Apple HIG asks for 44pt.
8. **Kbd badges everywhere** (Checkbox reserves an 18px slot even without a shortcut; Tabs, Nav, aperiodic/isohedral "Shift + scroll" hints, param panel "⌘ + move mouse to deform") describe inputs a phone does not have. The hints should be swapped for touch wording, not only hidden.
9. **Click-to-activate cards on scrolling pages** (landing live cards, /updates, /theory). While active they set `touch-action:none`; deactivation relies on blur/Esc. A phone user who taps a card to pan it may find the page no longer scrolls under that card until they tap something focusable. On the landing page four live cards stack in one column, each 384px tall, so this matters.
10. **WebGL context budget.** Landing mounts up to four live GL canvases plus thumbnail renderers (the code already unmounts out-of-view spherical and hat cards via `useInViewMount`); /updates can mount many `InteractiveTilingPreviewCard`s in `grid-cols-2`. Mobile Safari's context cap is lower than desktop's; expect "WebGL2 unavailable" fallbacks (`interactive-tiling-preview-card.tsx:238-241`).
11. **Modals edge-to-edge.** `Modal` content is `w-full` with only `max-w-*`, no horizontal margin and no max-height; the export modal is tall (preview 260px + four control groups + footer) and has no internal scroll on the container, so on a short phone viewport it can overflow top and bottom with no way to reach the Download button. The updates modal body is capped at 65vh and scrolls, which is fine.
12. **/updates index disappears** below lg (`hidden lg:flex`) with no replacement (no jump menu).
13. **/history table** is `min-w-[720px]`, horizontally scrolled; every cell is a link, so a horizontal swipe that starts on a cell may register as a tap. Low priority (route is unlisted).
14. **Right-click and double-click semantics** (home/reset/refit) and the suppressed context menu need a visible "reset view" button on touch. `FullscreenToggle` is top-right `top-4 right-4`; a phone layout will want reset beside it.
15. **Input number steppers** (`components/ui/input.tsx:149-163`) are mouse-only.
16. **Landing hero on phone** is already stacked, but the 320px live canvas plus the 9 × 24rem card column makes a ~4,000px page; the Play/Hyperbolic/Spherical/Aperiodic cards each need a tap to wake and then hold the swipe.
17. **Tailwind scan** is restricted to `app/`, `components/`, `lib/`; a mobile layer placed elsewhere (e.g. `mobile/`) must be added with `@source` in globals.css or its classes will silently not exist.
18. **Existing breakpoint conventions to stay consistent with:** landing collapses at `sm`/`lg`, updates at `lg`, parquet and aperiodic multigrid at `md`, theory TOC at `xl`, error screen at `sm`. There is no shared "phone" breakpoint or `useIsMobile` hook today; any JS-side switch (e.g. to render a bottom sheet instead of PageSidebar) would be new.


---

## /play and /library: UI inventory for the phone layout

Scope: the two catalogue routes of The Tiling Atlas (Next 16, repo `/Users/alessandro/Desktop/Personal/TilingAtlas`, branch `design/instrument`, checked 2026-09-24). Every control, mode, gesture and shortcut the phone layout has to keep. Paths are repo-relative; `file:line` points at the JSX or handler.

Measured with Playwright on the dev server (port 3001):

| Viewport | Sidebar | Canvas / main pane | Floating toolbar |
|---|---|---|---|
| 1440×900 /play | x=0, 320 px wide | 1120 px | 363 px wide (browse), 856 px (editor) |
| 390×844 /play | 320 px, unchanged | **70 px** | 363 px, centred on the 70 px pane, so x=174…537, mostly off-screen |
| 390×844 /library | 320 px, unchanged | `<main>` 70 px | n/a |

No file in scope uses a responsive breakpoint (`sm:`/`md:`/`lg:`) except the export modal and Pagination (container queries). The phone layout starts from zero.

---

### 0. Shared shell (both routes)

- `app/(app)/layout.tsx:10-17`: `h-screen flex flex-col overflow-hidden`, then `<Nav />` (h-12, 48 px), then `flex-1 min-h-0 flex` holding the page, then `ScreenshotPreviewModal`, `ExportImageModal`, `UpdatesGate` mounted globally.
- `components/nav.tsx`: logo, version, horizontally scrolling link row (Theory, Library, Play, Parquet, Freedraw, Colors, Aperiodic, Isohedral, Pentagons, Automata; `overflow-x-auto scrollbar-hide`, nav.tsx:82), Discord, updates, theme. At 390 px the link row collapses to about one visible link ("Theor…").
  - Keyboard: digits 1–9, 0 push the matching route (nav.tsx:44-57). Keycaps shown only at `2xl` (nav.tsx:97).
  - Immersive mode collapses the nav to `h-0 opacity-0` (nav.tsx:64).
- `components/page-sidebar.tsx:18-41`: fixed `w-80` (320 px) `aside`, `border-r`, optional collapse to `w-0` (300 ms width transition). Both routes use it.
- Global keys outside these routes' code: Shift+T theme (`components/ThemeToggle.tsx:47-56`, capture phase), Shift+U updates dialog (`components/updates/updates-button.tsx:34-42`, capture phase).

---

### Route 1: /play

### 1. Purpose and layout

Read-only viewer over the whole atlas (≈2.4 M records across shelves, lazily sharded). Server component `app/(app)/play/page.tsx:10-19` fetches the (now empty) Supabase certified list; everything real happens in `app/(app)/play/_play-client.tsx`.

Screen regions (`_play-client.tsx:1598-1906`):

```
┌──────────── Nav (48px) ───────────────────────────────────────────────┐
├─ Sidebar wrapper w-80 / w-0 (1602-1624) ─┬─ Canvas host flex-1 relative (1625) ────────┐
│ NavHeader (tiling name, class, k, key)   │ [i] info (top-4 left-4)   [symmetry badge    │
│ Tabs: Catalogue [C] | View options [V]   │  Squared-torus inset       top-4 right-4]    │
│  Catalogue: Geometry seg, Decoration seg │  (left-4 top-16, w-52)                       │
│             collapsible tree + 2-col     │                                              │
│             thumbnail wall (virtualised) │            canvas stack                      │
│  View options: sliders/checkboxes        │  pent/IH controls (bottom-3 left-3)          │
│                                          │  Param slider panel / Palette strip          │
│                                          │  (bottom-16, centred)                        │
│                                          │  Floating toolbar (bottom-4, centred)        │
└──────────────────────────────────────────┴──────────────────────────────────────────────┘
```

Canvas-host stacking (z order, low to high):

| Layer | z | Source | Takes input? |
|---|---|---|---|
| Flat shader canvases (EuclideanCanvas / IslamicCanvas / StrapCanvas) | auto | `components/canvas.tsx:1144-1165` | no |
| Hyperbolic disk canvases, InversiveCanvas | auto (absolute, no z) | `_play-client.tsx:1657-1788` | no; the p5 layer above drives them through the store |
| p5 flat canvas container | `z-[1]`, `role="application"` | `canvas.tsx:1166-1171` | yes: the default input layer for flat, lens and hyperbolic views |
| Own-input overlays: Studio editor, Hollow, Pentagon/IH edges, Freedraw, Colors, all three.js spheres | `z-10` | `_play-client.tsx:1650, 1674, 1701, 1709`, `freedraw-play-canvas.tsx:47`, `colors-play-canvas.tsx:28`, `spherical-canvas.tsx:596-603` | yes, they own pan/zoom |
| Truchet overlay, squaring overlay | `z-10`, `pointer-events:none` | `truchet-overlay.tsx:114-119`, `squaring-overlay.tsx:213-218` | no |
| Info button + panel, symmetry badge, squaring inset, param panel, pent/IH controls, canvas error | `z-20` | see below | yes |
| Floating toolbar, palette strip | `z-30` | `ui/floating-toolbar.tsx:16`, `studio/palette-strip.tsx:50` | yes |

What floats over the canvas, with fixed sizes:

| Element | Position | Size | File |
|---|---|---|---|
| Info button (i) | top-4 left-4 | 32×32 | `canvas.tsx:1172-1174`, `tiling-info.tsx:145-154` |
| Info panel | under button (`top-10`) | min-w-56 (224), max-w 340 | `tiling-info.tsx:157` |
| Symmetry badge (group, orbifold, lattice, Wikipedia cell diagrams 84 px) | top-4 right-4 | ≈ 110–200 px | `canvas.tsx:1176-1191`; shows while Symmetry elements or Fundamental domain is on |
| Squared-torus inset | left-4 top-16 | w-52 (208) + square thumbnail | `squaring/squaring-inset.tsx:43` |
| Parametric slider panel | bottom-16, centred | ≈600 px for one slider (measured) | `param-slider-panel.tsx:61, 76` |
| Pentagon edge controls | bottom-3 left-3 | ≈ 260 px | `pentagon-edges-controls.tsx:44` |
| Isohedral edge controls | bottom-3 left-3 | ≈ 260 px | `isohedral-edges-controls.tsx:66` |
| Studio palette strip (paint tool only) | bottom-16, centred | 676 px (measured) | `studio/palette-strip.tsx:50` |
| Floating toolbar | bottom-4, centred | 363 px browse, 856 px editor (measured) | `ui/floating-toolbar.tsx:11-23` |
| Canvas error text | centred overlay | n/a | `canvas.tsx:1220-1224` |
| Debug pie chart (dev only, `useDebug`) | bottom-4 right-4 | w-96 | `canvas.tsx:1226-1235` |

The Sidebar is `memo`'d (`components/sidebar/index.tsx:36`) and wrapped in `PageSidebar scrollable={false}`.

### 2. Every control

### 2.1 Sidebar top: NavHeader (always visible above the tabs)

`components/sidebar/nav-header.tsx:16-34`, mounted at `sidebar/tilings-tab.tsx:79-81`.

| Item | Type | What it shows |
|---|---|---|
| Title | text, truncate, `title` = full family (hover) | compact vertex configuration of the selection |
| Sub-line | text, truncate | tile-class long label · `k = n` (+ "grid points" / "colored vertices") · canonical key (mono, `title` = key) |
| Empty state | text | "Select a tiling below." |

### 2.2 Tab strip

`sidebar/tilings-tab.tsx:36-39, 83-106`, primitive `components/ui/tabs.tsx:28-75` (Radix Tabs, `keepMounted` so both panels stay mounted, inactive hidden with `display:none`).

| Control | Type | Drives | Shortcut |
|---|---|---|---|
| Catalogue | tab | local `tab` state | C (`tilings-tab.tsx:61-76`) |
| View options | tab | local `tab` state | V |

### 2.3 Catalogue tab

`sidebar/catalogue-tab.tsx:47-130`. Takes plain props, never touches the config store.

Header block (`catalogue-tab.tsx:104-114`):

| Control | Type | Options | Drives | File |
|---|---|---|---|---|
| Geometry | 3-way segmented (`.ta-seg`), each button two lines: label + count (compact, e.g. `2.23M`; "–" while pending) | Euclidean / Hyperbolic / Spherical | `onGeometryChange` → `_play-client.tsx:603-615` (sets geometry, keeps decoration if that cell has records else Tilings, jumps selection to that cell's first tiling; if the cell is still loading, `awaitingSwitch` finishes the jump later, 665-675) | `catalogue-tab.tsx:65-101, 107-108` |
| Decoration | 3-way segmented, same renderer | Tilings / Edge patterns / Colorings (counts scoped to active geometry) | `onDecorationChange` → `_play-client.tsx:617-626`; also gates the lazy decoration fetches (`_play-client.tsx:830-860`) | `catalogue-tab.tsx:112-113` |

Segment rules: a zero count disables it (`opacity-50 pointer-events-none`), except pending deferred shelves (hyperbolic base, Euclidean edges/colorings) which stay clickable because the click triggers the fetch (`_play-client.tsx:524-533, 1619-1621`).

Scrolling list (`catalogue-tab.tsx:118-127`, `data-sidebar-scroll`, `isolate`) holds `CatalogueListPanel` (`sidebar/catalogue-list-panel.tsx:74-542`):

| Control | Type | Behaviour | File |
|---|---|---|---|
| "Catalogue" label + Collapse all (· n open) | sticky strip (32 px, z-50) + text button | closes every open node; disabled when nothing is open; no expand-all by design | `catalogue-list-panel.tsx:503-523` |
| Class row (depth 0) | tree row button, sticky (32 px rows, stacked `top` offsets), chevron rotates, right-aligned count | toggles `c:<class>`; hidden when only one class exists (hyperbolic, some spherical), then the next level is promoted | 524-539, `single` at 253 |
| Family row | tree row | `f:<cls>:<family>`; rendered only when it divides something; the anonymous spine gets the class label at depth 0 | 470-495 |
| Grid row (colorings only) | tree row | `g:<cls>:<stem>` | 392-422 |
| Palette row ("n colors") | tree row | `s:<cls>:<sub>` | 372-388 |
| Sub / board row | tree row | `s:<cls>:<sub>`, label shortened under a family | 428-459 |
| Configuration row (hyperbolic `hyt-` boards > 60 tilings) | tree row, sorted biggest first | replaces the k row; opens a TileGrid | 334-369, `splitsByConfig` 52-53 |
| k row | tree row, label `k = n` plus noun (grid points etc.) | opens a TileGrid | 255-317 |
| Unloaded tier row | tree row with download glyph (pulses while loading), manifest count | click fetches that shard (`onLoadTier` → `_play-client.tsx:236-255`); never expands | 278-293 |

Tree behaviour: everything starts collapsed; each later selection (R, arrows, click) auto-opens the path to it, first selection exempt (`catalogue-list-panel.tsx:224-247`). Sticky headers stack by depth (`TreeRow` 547-614: ROW_H 32, z 40/30/20/15, indent pl-2/6/10/14).

Thumbnail wall (`sidebar/tile-grid.tsx`):

| Control | Type | Behaviour | File |
|---|---|---|---|
| Tile | button: square live thumbnail (renderer chosen per shelf, 248-295) + 24 px mono caption (config, key tail) | click → `onSelect` → `setSelected` (`useCatalogueSelection`); `title` = key · family (hover only) | 227-325 |
| Selection ring | overlay span | inset ink ring when selected; hover ring otherwise (hover only) | 311-322 |
| Param badge | glyph chip top-left (α, α β, or "n×") | `title` explains the family (hover only) | 331-352 |
| Reveal | programmatic | scrolls the selected tile into view below the sticky headers and pulses it (650 ms) | 140-181 |

Layout constants: 2 columns fixed (`COLS = 2`, tile-grid.tsx:37), 10 px gutters, width measured once by the panel (`catalogue-list-panel.tsx:178-187`). Virtualised by scroll position of the nearest `[data-sidebar-scroll]` (tile-grid.tsx:97-128), overscan 2 rows.

### 2.4 View options tab

`sidebar/options-tab.tsx:88-1379`. The only sidebar piece subscribed to `useConfiguration`. Every row below writes one config-store field through `cfg.set`. What shows depends on the renderer surface (`surfaceOf`, `lib/services/shelfRegistry.ts`), listed in section 3. Order below is the on-screen order.

Primitives: `Slider` (`ui/slider.tsx`, native range under `.ta-track`), `Checkbox` (`ui/checkbox.tsx`, `role="checkbox"`, optional Kbd badge + hint), `Button` groups (primary/secondary chips), `Toggle` (`ui/toggle.tsx`, two-value radio pair), `ButtonGroup` (`ui/button-group.tsx`, with hover tooltips), `HueRing` (`ui/hue-ring.tsx`, pointer drag, keyboard, double-click resets to 0), `HankinPad` (`ui/hankin-pad.tsx`, 2-D pointer pad + keyboard), `Reveal` (animated disclosure), `InfoDot` (`ui/info-dot.tsx`, hover/focus tooltip).

#### A. Freedraw / parametric-edge block (surface `grid2d`), `options-tab.tsx:348-458`

| Control | Type | Store field | Key |
|---|---|---|---|
| Cell fill | 5 chip buttons (FILL_MODES: none/rank/shape/pose/orbit) + help line | `freedrawFill` | |
| Line stroke | slider 0–5 step 0.25 | `lineWidth` | |
| Rotation | slider 0–360°, caption "Shift + scroll" | `rotation` | |
| Grid | checkbox | `freedrawScaffold` | G |
| Tiles | checkbox | `freedrawArcs` | A |
| └ Wiring | 3 chips (WIRINGS: ribbons/junction/caps) + help | `freedrawArcWiring` | |
| └ Mirror the pairing | checkbox + note | `freedrawArcTwist` | |
| Period lattice | checkbox | `freedrawLattice` | P |
| Grid-point orbits | checkbox, reveal note "Hover a dot to grow every grid point in its orbit" | `freedrawVertices` | O |

#### B. Euclidean colorings block (surface `colors2d`), `options-tab.tsx:464-501`

| Control | Type | Store field | Key |
|---|---|---|---|
| Palette pickers (one per colour, 2–4) | HueRing (76 px, or 62 px for >2 colours) + cream/dark swatch pair; swap button (↔) between neighbours | `colorsPalette` | |
| Rotation | slider | `rotation` | |
| Tile edges | checkbox | `colorsEdges` | G |
| Period lattice | checkbox | `colorsLattice` | P |
| Colored-vertex orbits | checkbox + hover note | `colorsVertices` | O |

Palette picker renderer: `options-tab.tsx:275-330`.

#### C. Hyperbolic / spherical colorings, `options-tab.tsx:505-514`

Same palette pickers. Hyperbolic adds the note "Drag to pan, scroll to zoom, shift-scroll to spin, double-click to reset the view" (see the discrepancy flagged in section 4).

#### D. Shared rows (shown per surface)

| Control | Type | Store field | Shown when | Key | File |
|---|---|---|---|---|---|
| Fill | slider (0 = "off"), Kbd B hint | `fillAmount` | not sphere, not freedraw, not colors2d | B | 522-534 |
| Line stroke | slider 0–5 | `lineWidth` | not freedraw, colors2d, sphereColors | | 540-550 |
| Perspective / Flat | 2 chips | `hyperbolicLineMode` (`geometry`/`constant`) | any disk surface | | 551-570 |
| Grid (hyperbolic edges) | checkbox | `freedrawScaffold` | `diskEdges` | G | 574-582 |
| Hue shift | compact 32 px HueRing + degrees readout | `hueOffset` | not freedraw/any colorings | | 591-601 |
| Rotation | slider, caption "scroll" in the disk, "Shift + scroll" elsewhere | `rotation` | flat, disk, hollow | | 605-611 |
| Colour tiles by size | checkbox | `lengthSizeHue` | length families, squaring off | | 613-620 |

"Overlays" heading (621):

| Control | Type | Store field | Shown when | Key | File |
|---|---|---|---|---|---|
| Polygon points | checkbox | `showPolygonPoints` | not sphere / freedraw / colorings | P | 626-634 |
| Vertex orbits | checkbox (disabled without `exactSource`) | `showVertexOrbits` | flat, squaring off | O | 644-653 |
| Symmetry elements | checkbox | `showSymmetryElements` | flat, straight tiles, squaring off | S | 661-669 |
| Fundamental domain | checkbox | `showFundamentalDomain` | same | D | 670-676 |

"Style" heading (679):

| Control | Type | Store field | Shown when | Key | File |
|---|---|---|---|---|---|
| Truchet tiles | checkbox | `freedrawArcs` | flat, straight tiles | A | 685-693 |
| └ Grid | checkbox | `freedrawScaffold` | Truchet on | G | 699-705 |
| └ Shuffle the tiles / Reshuffle | button (random seed) | `truchetSeed` | | | 706-715 |
| └ seed note + Back to one wiring | text + button | `truchetSeed = 0` | seed ≠ 0 | | 716-730 |
| └ Wiring | 3 chips + help | `freedrawArcWiring` | seed = 0 | | 733-749 |
| Edge decoration (bubble shelf) | 3-column chip grid (BUBBLE_EDGE_STYLES: shallow/arc/koch/crenel/dovetail/jigsaw) + help | `bubbleEdgeStyle` | flat bubble or spherical bubble | | 765-787 |
| └ Koch level | slider 1–4 | `bubbleKochLevel` | fractal profiles | | 788-798 |
| Islamic suggestion | full-width text button "Turn on the Islamic construction [I]" | sets `isIslamic` | Islamic class, construction off | | 801-810 |
| Islamic | checkbox | `isIslamic` | class supports it, squaring off, sphere shape round | I | 811-819 |

Islamic sub-panel (`Reveal`, 820-1116):

| Control | Type | Store field | Surface | File |
|---|---|---|---|---|
| Style (sphere) | 2×2 chips Plain / Checkerboard / Interlace / Outline + description | `islamicStyle` | sphere | 823-854 |
| Hyperbolic note | text only (plain fill only) | | disk | 855-864 |
| Style (flat) | 2-col chips Plain / Interlace / Outline / Emboss / Checkerboard | `islamicStyle` | flat | 866-886 |
| Islamic angle | HankinPad: 2-D drag for angle + edge offset, keyboard steps | `islamicAngle`, `islamicEdgeOffset` | all | 891-897 |
| Acute / Median / Obtuse | 3 chips (30/45/60°) | `islamicAngle` | all | 900-910 |
| Strap width, Border width | sliders | `islamicBandWidth`, `islamicOutlineWidth` | sphere, interlace/outline | 913-934 |
| Rigid lines | checkbox | `islamicRigid` | sphere | 940-947 |
| └ Section Tube / Rectangle | 2 chips | `islamicBarSection` | | 950-968 |
| └ Thickness | slider | `islamicBarThickness` | | 969-977 |
| └ Height, Bevel | sliders | `islamicBarHeight`, `islamicBarBevel` | rect section | 978-999 |
| Ribbons Woven / Flat | 2 chips | `sphericalWeaveFlat` | sphere, interlace, rigid | 1005-1027 |
| Band width, Border width | sliders | `islamicBandWidth`, `islamicOutlineWidth` | flat, interlace/outline/emboss | 1030-1054 |
| Flip weave | checkbox | `islamicChirality` | flat, not outline | 1058-1065 |
| Field A, Field B | 2 HueRings (76 px) | `islamicCheckerHueA/B` | flat checkerboard | 1068-1079 |
| Sides (B), Diamond (C) | 2 HueRings | `islamicFillHueB/C` | flat plain, disk | 1083-1093 |
| Ray stops at | slider 1–3 | `islamicIntersectionCount` | not disk | 1095-1105 |
| Animate grid | checkbox | `islamicAnimate` | flat | 1106-1113 |

Squared torus (`components/squaring/squaring-controls.tsx`, mounted `options-tab.tsx:1121`, flat surface only):

| Control | Type | Store field | File |
|---|---|---|---|
| Squared torus | checkbox (disabled with refusal reason) + InfoDot | `squaring` | squaring-controls.tsx:56-81 |
| class readout + Richest | text + button | `squaringClass` | 85-97 |
| Parameter-plane dial | SVG figure, pointer drag / click on sectors and ticks, hover highlights walls | `squaringClass` | 103-120, `sq-domain-figure.tsx:95-135` |
| Snap to exact classes | checkbox + InfoDot | `squaringSnap` | 128-142 |
| Sizes | checkbox + InfoDot | `squaringNumbers` | 143-156 |
| Monochrome | checkbox + InfoDot | `squaringMono` | 157-171 |
| Fundamental domain | checkbox | `squaringLattice` | 172-177 |

| Control | Type | Store field | Shown when | File |
|---|---|---|---|---|
| Modulo 2 fill | checkbox + InfoDot | `starMod2` | star polyhedra, hollow, star-faced solids | options-tab.tsx:1129-1143 |

"View" heading (1144):

| Control | Type | Store field | Shown when | Key | File |
|---|---|---|---|---|---|
| Mirror view / Mirror view (chiral) | checkbox | `mirrorFlip` | flat, not known-achiral | M | 1155-1167 |
| Transition animation | checkbox | `tilingTransition` | flat | T | 1172-1180 |
| Circle Packing | hidden (commented out) | `circlePacking` | never | none | 1181-1192 |

Spherical block (all three.js surfaces), `options-tab.tsx:1199-1335`:

| Control | Type | Store field | Shown when | Key |
|---|---|---|---|---|
| Shape sphere / polyhedron | Toggle | `sphericalPolyhedron` (switching to polyhedron also clears `isIslamic`) | solid has a circumsphere, not bubble | |
| Solid / Dual / Compound | ButtonGroup with tooltips; Compound disabled without midsphere | `solidDualMode` (+ forces polyhedron) | dual exists, not bubble | |
| Face opacity | slider 0–1 | `sphericalFaceOpacity` | always | W or B (0 ↔ 1) |
| Projection perspective / orthographic | Toggle | `sphericalOrthographic` | always | |
| Grid | checkbox | `sphericalFreedrawGrid` | spherical freedraw, sph edges, Schwarz | G |
| Star-covering note | text | | star polyhedron, sphere shape | |
| Edges None / True / All + InfoDot | 3 chips | `sphStarEdges` | star polyhedron, polyhedron shape | |
| Gesture note "Drag to rotate… Scroll to zoom." | text | | always | |

Lens and deformation (end of tab):

| Control | Type | Store field | Shown when | Key | File |
|---|---|---|---|---|---|
| Inversive view | checkbox | `inversive` | Euclidean lens applies | X | options-tab.tsx:1336-1344 |
| └ Inversion / Möbius / Spiral | 3 chips | `inversiveMode` | | | inversive-controls.tsx:87 |
| └ Lens radius / Pole separation | slider 0.1–1 | `inversiveRadiusFrac` | not single-centre spiral | | 99 |
| └ Spiral twist | slider 0–180° | `mobiusTwist` | Möbius | | 110 |
| └ 1 center / 2 centers | 2 chips | `spiralDouble` | Spiral | | 123 |
| └ Arm a, Arm b | sliders −6…6 | `spiralArmA/B` | Spiral | | 131, 140 |
| └ Velocity pad | 2-D pointer pad (hold a zoom/rotation rate) | spiral velocity | Spiral | | 150, `ui/velocity-pad.tsx:85-108` |
| Deformation | checkbox | `deformOn` | modes that honour it | | options-tab.tsx:1360-1367 |
| └ Basis pad | SVG pad: drag the two basis-vector images, keyboard, double-click resets | `deform` (2×2) | | | `deform-pad.tsx`, `ui/basis-pad.tsx:138-200` |

### 2.5 Canvas overlays

Info (i) (`components/tiling-info.tsx:128-447`):

| Control | Type | Behaviour |
|---|---|---|
| Info button | icon button, `aria-pressed` | click pins the panel open (`isPinned`); hovering the group opens it too (`onMouseEnter/Leave`, 139-142) |
| Info panel | floating card, read-only | header (label, geometry chip or spherical detail), Symmetry (wallpaper group + orbifold, lattice / Coxeter / point group), Tiles (freedraw faces, hyperbolic Schläfli/faces/valence/ℓ), Coloring (census, lattice, vertex figures), Counts (V/E/F), Derivation, Orbits (k, m, level with `title` gloss, edge/tile orbits), Vertex configurations (96 px VC thumbnails, Euclidean) |

Symmetry badge: read-only, `canvas.tsx:1176-1191`.

Parametric slider panel (`components/param-slider-panel.tsx`), shown for any `paramCell` while squaring is off (`_play-client.tsx:1815`):

| Control | Type | Store | Notes |
|---|---|---|---|
| Per-parameter row | label (`α = 15.0°`, or length name), optional tile name (w-28), RangeInput w-56 (224 px), fold-marker tick, range text | `useFamilyAlphas.values` | up to 4 rows, then a "n more corners" toggle (125-137) |
| Region pad (2-param coupled families) | SVG 2-D pad, `role="application"`, arrow keys | `useFamilyAlphas` | `param-region-pad.tsx:207-243`; replaces the sliders |
| Scrub hint | "⌘ + move mouse to deform" and axis legend | | desktop-only gesture |

Pentagon edge controls (`pentagon-edges-controls.tsx:44-80`): native range sliders per pentagon parameter, pinned-angle readout, "Underlying grid" checkbox (G, `freedrawScaffold`).
Isohedral edge controls (`isohedral-edges-controls.tsx:66-133`): IH label + "reset" link, one native slider per tiling-vertex parameter (v0…), "bow a/b…" sliders per edge shape, class-length readout, "Underlying tiling" checkbox (G).
Squared-torus inset (`squaring/squaring-inset.tsx:43-88`): read-only thumbnail of the source + stats, one close (X) button that sets `squaring: false`.

### 2.6 Floating toolbar

`_play-client.tsx:1826-1903`, primitive `ui/floating-toolbar.tsx` (buttons h-8, icon buttons w-8, tooltips via base-ui on hover, `side="top"`, delay 0). Groups swap with an animated width reveal (`ToolbarReveal`).

Browse mode:

| # | Control | Type | Action | Shortcut | File |
|---|---|---|---|---|---|
| 1 | Previous tiling | icon button | `step(-1)` within the active (geometry, decoration) cell, wraps | ← | 1833-1835 |
| 2 | Random | primary labelled button | `selectRandom`: stratified by class × k, excludes current | R | 1836-1839 |
| 3 | Next tiling | icon button | `step(1)` | → | 1840-1842 |
| 4 | Edit / Done | labelled toggle, `aria-pressed` | toggles `studioActive` | E / Esc | 1854-1865 (only when `canEditTiling`: flat surface, straight edges) |
| 5 | Copy link | icon button, flips to a check for 1.5 s | copies the serialized view URL | | 1869-1871, `copyLink` 1034-1047 |
| 6 | Export image | camera icon | opens `ExportImageModal` with the canvas host | | 1875-1894 (absent where capture is not wired) |
| 7 | Fullscreen canvas / Exit | icon toggle | `useImmersive.toggle()` | F, Esc | 1895-1902 |

Editor mode adds, in order: history (Undo, Redo, Back to the catalogued tiling; `studio-bar.tsx:118-135`), the six tools (Select 1, Merge 2, Cut 3, Move 4, Edge decoration 5, Recolor 6; `studio-bar.tsx:33-45, 138-151`), the period segmented pair Lattice / Wallpaper group (Wallpaper disabled with a tooltip reason when there is no symmetry data), a "Period cell" toggle, and an InfoDot (`studio-bar.tsx:175-226`). Prev/Random/Next hide while editing.

Paint tool bar (`studio/palette-strip.tsx:26-108`, only with tool = paint): 10 slot swatches (28 px), paint-scope ButtonGroup (`PAINT_SCOPES`, tooltips), a 54 px HueRing for the active slot, cream / dark swatches. Writes `useStudio.palette/slot/paintScope`.

### 2.7 Export image dialog

`components/export-image-modal.tsx:363-530` (Radix Dialog, `size="lg"` = max-w-4xl). Already responsive (`flex-col md:flex-row`).

| Control | Type |
|---|---|
| Live preview | image, checkerboard when transparent |
| Frame | ButtonGroup: Screen / 1:1 / 16:9 / 4:5 / A4 |
| Zoom | slider + "Match current view" link (Euclidean cells only) |
| Size | ButtonGroup 1× / 2× / 4× + number input (long edge px) |
| Background | ButtonGroup Theme / Transparent |
| Format | ButtonGroup PNG / SVG (SVG disabled with reason) |
| Copy | button (PNG, when ClipboardItem exists) |
| Download image | primary button |

`ScreenshotPreviewModal` is mounted globally but only reachable from the library card screenshot button, which is behind `SCREENSHOT_BUTTONS_ENABLED = false` (`lib/utils/featureFlags.ts:11`). Nothing on /play opens it.

### 2.8 Not mounted on /play (dead or elsewhere)

`components/sidebar/legacy-catalog.tsx`, `components/sidebar/new-tilings-catalog.tsx`, `components/k-selector.tsx`, `components/tiling-modal-content.tsx` have no importers. `components/tiling-filter-bar.tsx` is imported only by `tiling-modal-content.tsx` and `lib/stores/modalState.ts`. `components/polygon-filter-modal.tsx` belongs to /library. `components/fullscreen-toggle.tsx` is used by /pentagons, /isohedral, /aperiodic, not /play (the toolbar button replaces it). `StudioInspector` stays in the tree unmounted (`_play-client.tsx:1808-1810`). The canvas's rulestring input and ColorPad (`canvas.tsx:1193-1218`) never show on /play (`showTilingRuleInput={false}`, every record carries a cell). No mobile port needed for these.

### 3. Modes and sub-views

### 3.1 Browse cells

Geometry (3) × Decoration (3) = nine cells, each a separately ordered list (`_play-client.tsx:546-584`). Random/prev/next and the Catalogue tree are scoped to the active cell. The segments follow the selection when it changes by any other path (deep link, R, list click; 641-650).

Lazy loading is driven by the cell: entering Hyperbolic fetches the base hyperbolic, edges, Schwarz, poly and colorings shelves; Spherical fetches freedraw, Schwarz, poly, colorings; Euclidean Edge patterns fetches freedraw, bubble, pentagon, isohedral edges; Euclidean Colorings fetches the colourings atlas (`_play-client.tsx:682-941`). Unloaded tiers appear as download rows in the tree.

### 3.2 Renderer surface (decides canvas and View-options content)

`surfaceOf(selected)` (`lib/services/shelfRegistry.ts`), consumed at `_play-client.tsx:1072-1109` and `options-tab.tsx:106-171`:

| Surface | Canvas | View-options content | Input owner |
|---|---|---|---|
| `flat` (regular, star, convex, isotoxal, mixed, scaled, period, polyforms, Islamic, bubble…) | p5 + flat WebGL / Islamic / Strap shader | full flat set: Fill, Line, Hue, Rotation, Overlays, Style (Truchet, Islamic), Squared torus, View (Mirror, Transition), Inversive, Deformation | p5 layer |
| `hollow2d` | HollowCanvas | flat rows (several are inert, flagged in code at options-tab.tsx:226-230) + Modulo 2 | HollowCanvas |
| `grid2d` (freedraw, pentagon edges, isohedral edges) | FreedrawPlayCanvas / PentagonEdgesCanvas / IsohedralEdgesCanvas | block A + Inversive | own canvas (pentagon/IH: flat p5 underneath stays the input surface) |
| `colors2d` | ColorsPlayCanvas | block B + Inversive | own canvas |
| `disk` (hyperbolic developed) | HyperbolicDevelopedCanvas | Fill, Line, Perspective/Flat, Hue, Rotation ("scroll"), Polygon points, Islamic (plain only) | p5 layer |
| `diskEdges` (hyperbolic edges, hyperbolic Schwarz) | HyperbolicEdgesCanvas | + Grid | p5 layer |
| `diskColors` (hyperbolic colorings, hyperbolic 3.4.n.4) | HyperbolicColorsCanvas | palette pickers, Line, Perspective/Flat, Rotation | p5 layer |
| `sphere` (Platonic/Archimedean/Johnson etc., bubble sphere) | SphericalCanvas (three.js, ArcballControls) | spherical block + Islamic (sphere shape only) + Hue + Line | ArcballControls |
| `sphereEdges` (spherical freedraw, Schwarz, polyhedron edges, 3.4.n.4 solids, star polyhedra) | IcoFreedraw / SphSchwarz / SphPoly / SphStar canvases | spherical block (+ Grid, + star Edges/Modulo 2) | ArcballControls |
| `sphereColors` | SphericalColorsCanvas | palette pickers + spherical block | ArcballControls |

Dispatch order of the exclusive canvas chain: editor, then conformal lens, then hollow, Schwarz, pentagon edges, IH edges, sphere edges, sph poly, sph star, hyp poly, sph bubble, sphere, spherical freedraw, freedraw, colors, sph colors, hyp colors, hyp edges, developed (`_play-client.tsx:1643-1789`).

### 3.3 Transforming modes

| Mode | Entered by | Layout change |
|---|---|---|
| Immersive ("fullscreen canvas", not the browser Fullscreen API) | toolbar button, F | sidebar wrapper → w-0, nav → h-0, both animated 300 ms; toolbar stays; Esc exits; reset on unmount (`_play-client.tsx:1445`) |
| Editor (Studio) | Edit button, E, `?ed=1` | StudioCanvas replaces every renderer (z-10); toolbar grows to 856 px; paint tool adds the palette strip above it; R and ←/→ are ignored; nav digits are captured for tools; closes itself if the tiling cannot be edited (`_play-client.tsx:1534-1538`); edits reset when the drawn cell changes (1528-1530) |
| Inversive lens | checkbox, X | InversiveCanvas replaces the flat drawing; p5 stays the input layer; Truchet overlay hidden (lens draws it) |
| Squared torus | checkbox | canvas draws the squared torus in place of the tiling; SquaringInset appears top-left; ParamSliderPanel, symmetry and orbit data go null; source-describing controls hide (`options-tab.tsx:246-251`) |
| Truchet | checkbox, A | TruchetOverlay (non-interactive) over a blanked flat layer |
| Parametric family | selecting a `paramCell` record | ParamSliderPanel appears bottom-centre |
| Pentagon / IH edges | selecting such a record | bottom-left control card appears |

### 4. Canvas interactions

### 4.1 Flat / lens / hyperbolic (p5 input layer)

p5 2.2.3 (`package.json:45`). p5 2.x routes all input through Pointer Events: `_onpointerdown` fires `mousePressed` for mouse, pen and touch alike (`node_modules/p5/dist/events/pointer.js:1227-1241`). The p5 canvas gets no `touch-action` style (none set in p5 core or `canvas.tsx`).

| Gesture | Effect | File |
|---|---|---|
| Left drag | pan (`controls.targetOffset`), eased | `canvas.tsx:942-943, 907-911` |
| Left click (moved < 5 px) | centre the clicked tile (vertex snap within 12 px); lens: send the clicked tile to the inversion centre; hyperbolic: write `hyperbolicClick`, the disk recentres on that tile | 950-1043 |
| Wheel | zoom toward the cursor (flat, lens) | 1063-1087 |
| Shift + wheel | rotate in 5° detents (flat, lens) | 1073-1077, 1047-1061 |
| Wheel (hyperbolic) | rotate (no zoom in the disk) | 1069-1072 |
| Middle click | centre the view on the point under the cursor | 927-931 |
| Right click | reset pan and zoom; hyperbolic also resets the disk view | 933-940 |
| Context menu | suppressed | 1170 |
| ⌘ + mouse move, no button | scrub the family parameters (horizontal = α, vertical = β), cursor becomes "move" | 1095-1137, cursor cleanup 311-326 |
| Hover (orbit overlay on) | grows the hovered vertex orbit's dots | 868-873 |

Hover-only here: the orbit-dot growth and the ⌘-scrub. No pinch, no double-tap, no two-finger rotate anywhere on this layer. The only touch-reachable replacements are the Rotation slider and the parameter sliders; zoom has no touch path at all, and neither does reset.

Discrepancy: the hyperbolic-colorings note says "double-click to reset the view" (`options-tab.tsx:510`), but no `doubleClicked` handler exists on the p5 layer, and the disk canvases sit under it. Reset is right-click only. Worth fixing or rewording before designing a tap equivalent.

### 4.2 Own-input 2-D canvases (Pointer Events)

| Canvas | Drag | Wheel | Double-click | touch-action | pointercancel | File |
|---|---|---|---|---|---|---|
| FreedrawCanvas (freedraw, pentagon/IH edges draw through it) | pan (rotation-corrected) | zoom to cursor; Shift = rotate 5° | refit + rotation 0 | not set | not handled | `freedraw/freedraw-canvas.tsx:222-331` |
| ColorsCanvas | pan | zoom; Shift = rotate | refit | not set | not handled | `colors/colors-canvas.tsx:137-222` |
| HollowCanvas | pan | zoom (fixed step) | none | not set | not handled | `hollow/hollow-canvas.tsx:80-125` |
| StudioCanvas | pan with Select tool or with non-left buttons; tool gesture otherwise (merge = drag across tiles, cut = click points, move = drag vertex, edge = drag to bow, paint = click) | zoom; Shift = rotate | reset zoom and pan | `touch-none` | handled | `studio/studio-canvas.tsx:356-411, 642-694` |

Hover-driven affordances on these: freedraw/colors orbit-dot growth, studio hover highlights (merge/paint face highlight, affected-orbit preview, edge and vertex pick highlights, cut-point snap ring; `studio-canvas.tsx:431-469`). On touch the cut tool loses its "which point will this take" preview, and the Select tool is the only way to pan (other tools pan on middle/right button, which touch lacks).

### 4.3 three.js spheres

ArcballControls (`lib/render/sphericalCamera.ts:53-68`): rotate on drag (free trackball), zoom on wheel or pinch, pan off, focus (double-click) off, animations off. Host and canvas carry `touch-action: none` (`spherical-canvas.tsx:161, 313, 602`; `ico-freedraw-canvas.tsx:104, 288`; `spherical-colors-canvas.tsx:68, 227`). These are the only /play canvases with native multi-touch today.

### 4.4 Sidebar and overlay widgets

HueRing, HankinPad, BasisPad, VelocityPad, ParamRegionPad, IntervalSlider all use Pointer Events with `touch-none` and have keyboard handlers. Native range inputs (Slider, RangeInput, pentagon/IH sliders) work on touch but render a 12 px thumb. Hover-only affordances in the sidebar: tile and header `title` tooltips (full key/family), tile hover ring, every InfoDot (base-ui Tooltip, hover/focus, `ui/info-dot.tsx:25-42`), ButtonGroup tooltips (Dual/Compound explanations, paint scopes), toolbar button tooltips carrying the shortcut hints, the disabled "Wallpaper group" reason (`studio-bar.tsx:196-201`), and Kbd badges on checkboxes and tabs.

### 5. Keyboard shortcuts (/play)

Main handler `_play-client.tsx:1245-1409` (window keydown; skipped on modifier chords, typing targets, and inside any `[role="application"]`, which includes the p5 container and ParamRegionPad).

| Key | Action | Condition |
|---|---|---|
| R | random tiling in the active cell | not in editor |
| ← / → | previous / next tiling (wraps) | not in editor |
| F | toggle immersive | |
| Esc | exit immersive | when immersive (editor handler runs first in capture phase and leaves the editor instead) |
| C / V | Catalogue / View options tab | `tilings-tab.tsx:61-76` |
| P | Polygon points; on freedraw/pent/IH: period lattice; on colors: period lattice | |
| I | Islamic | class supports it |
| S | Symmetry elements | flat, not disk |
| D | Fundamental domain | flat, not disk |
| X | Inversive view | not blocked on freedraw/colors (lens applies) |
| T | Transition animation | flat |
| O | Vertex orbits; freedraw: grid-point orbits; colors: colored-vertex orbits | needs exact source on flat |
| M | Mirror view | |
| B | Fill 0 ↔ default (flat); face opacity 0 ↔ 1 (spheres) | |
| W | face opacity 0 ↔ 1 | spheres |
| A | Truchet tiles / freedraw Tiles | |
| G | Grid scaffold (freedraw, pent/IH, Truchet on), tile edges (colors), sphere grid (spherical freedraw/Schwarz), base scaffold (hyperbolic edges/Schwarz) | |
| E | open editor | `canEditTiling` (`studio-bar.tsx:69-115`, capture phase) |
| 1–6 | editor tools (captured so nav routes do not fire) | editor open |
| ⌘/Ctrl+Z, Shift+⌘/Ctrl+Z | undo, redo | editor open |
| Esc | leave editor | editor open |
| 1–9, 0 | navigate to nav routes | global, not while editor is open |
| Shift+T, Shift+U | theme, updates dialog | global |
| Arrow keys, etc. | ParamRegionPad nudge, HueRing, HankinPad, BasisPad steps, Checkbox Space | focused widget |

### 6. URL state and deep links (/play)

Parsed once on mount (`_play-client.tsx:193-210`, `lib/services/playUrlState.ts:145-201`); after that the URL is write-only, mirrored with `history.replaceState`, debounced 400 ms (`_play-client.tsx:161, 1001-1027`). Copy link serializes fresh (1034-1047).

- `tiling=<canonicalKey>` selects the record; a long list of id-prefix resolvers fetch the right lazy shard so the key resolves (`_play-client.tsx:303-941`). Merged family keys redirect (`resolveMergedFamilyKey`, 195).
- `alpha=a,b,…` family parameters.
- `ed=1` opens the editor (the edit itself never travels).
- View params (`playUrlState.ts:36-133`): `fill lw hue rot defon def pts orb trans sym dom hline bubedge bubkoch fdfill fdgrid fdlat fdorb fdarc fdwire fdtw fdseed coedge colat coorb copal i istyle iang iband ibord iflip ika ikb ifb ifc ioff irays ianim sq sqcls sqsnap sqnum sqmono sqlat sopa irigid ssec sthk shgt sbev spoly sortho sweave sedge v vmode vrad vtwist vdouble varma varmb`.
- Deliberately not in the URL: camera (zoom/pan), geometry/decoration (derived from `tiling`), immersive, active tab, tree expansion.
- `source=reference` (added by /library card clicks) is ignored.
- Dev hooks: `window.__play` (`_play-client.tsx:587-591`) and `window.__stores`.

### 7. Mobile risks at 390 px touch (/play)

1. The fixed 320 px sidebar leaves a 70 px canvas (measured). It is not collapsible except through immersive, which also removes the tab controls. The phone layout needs the catalogue and options as a sheet or drawer over a full-width canvas.
2. Floating toolbar is 363 px in browse mode and 856 px in editor mode; it is centred on the canvas host, so at 390 px most of it sits off-screen. Editor mode cannot fit one row on any phone; it needs its own compact layout (tool picker, overflow menu).
3. Stacked bottom-centre overlays: ParamSliderPanel (≈600 px, rows of w-24 + w-28 + w-56 + range text + scrub hint), PaletteStrip (676 px), pentagon/IH cards (bottom-left, ≈260 px) all overlap the toolbar and each other on a phone.
4. No touch zoom on the flat, lens and hyperbolic views (wheel only), no touch rotation (Shift+wheel only), no touch reset (right-click only), no touch recentre-on-point (middle click). Pinch on those layers will fall through to page zoom because the p5 canvas has no `touch-action: none`. One-finger drag should pan (p5 2.x maps touch pointers to `mousePressed`), but a tap-to-centre fires on every short tap, which on a phone is also the gesture people use to dismiss things. Verify on a device.
5. FreedrawCanvas, ColorsCanvas and HollowCanvas lack `touch-action: none` and do not handle `pointercancel`; a browser pan takeover can leave the drag stuck "on". No pinch either.
6. The ⌘ + move parameter scrub is desktop-only and is advertised in the panel ("⌘ + move mouse to deform"); on phone that hint is dead text and the sliders are the only path.
7. Studio editor: Select is the only pan tool on touch; hover previews (cut snap ring, merge/paint highlights) do not exist without a hover pointer; single-finger tool gestures collide with pan; undo/redo shortcut is keyboard-only apart from the toolbar buttons.
8. Info panel opens on hover and pins on click; on touch a tap toggles the pin (fine), but the panel is up to 340 px wide at top-left and will cover most of a phone canvas, and it contains 96 px VC thumbnails that wrap.
9. Symmetry badge (top-right) and info button (top-left) plus the squaring inset (208 px, top-16 left-4) crowd the top of a narrow canvas.
10. Hover-only information: tile/header `title` tooltips (the full canonical key and family live only there when truncated), every InfoDot explanation, ButtonGroup tooltips (Dual vs Compound reasoning, paint scopes), the disabled Wallpaper-group reason, toolbar tooltips. Phone needs tap-to-reveal or inline text.
11. Keyboard shortcuts are the only path for a few things: none are exclusive except ⌘-scrub, Shift+wheel rotate and editor undo shortcuts, but the Kbd badges and shortcut hints everywhere become noise on phone.
12. Touch targets: tree rows are 32 px (ok); tile wall is 2 columns at 320 px; toolbar buttons 32 px; ParamBadge, fold markers, chip grids (5-column Cell fill, 3-column wiring/edge-style) and checkbox rows are 24–28 px, below the 44 px guideline. Native range thumbs are 12 px visually.
13. `h-screen` (100vh) on the app shell: mobile Safari's dynamic toolbar will hide the bottom of the canvas, where the toolbar and panels live. Consider `dvh` for the phone layout.
14. Performance: the tree mounts live thumbnail canvases (WebGL or 2-D) per visible tile; the spheres use one WebGL context each and already have an "ran out of WebGL contexts" fallback (`spherical-canvas.tsx:~585-592`). A phone with a lower context budget will hit it sooner.
15. Default geometry deferrals: Hyperbolic segment reads "–" until its first click; on phone this is the same, but make sure the segment control keeps pending segments tappable.

---

### Route 2: /library

### 1. Purpose and layout

One paginated, filterable grid over the whole atlas; clicking a card opens it in /play. `app/(app)/library/page.tsx:9-17` renders `ReferenceShelf` (`components/reference-shelf.tsx:667-2811`) inside a Suspense boundary (needed for `useSearchParams`).

```
┌──────────── Nav (48px) ─────────────────────────────────────────────────────────┐
├─ PageSidebar w-80, scrolls (2064-2673) ─┬─ <main> flex-1, scrolls, p-5 (2678) ───────┐
│ Filters · Clear (n)                     │ Tiling Library  13,193 tilings (· families)│
│ Search input                            │ [loading k=…] [failed k=…]                 │
│ Geometry · Kind · Tile class · …        │  Group variants ◯ · Copy link · Columns ─● │
│ (facet groups appear per selection)     │  5 · Per page 10|25|50                     │
│ Vertex count (k) chips · Maximal switch │ grid of ReferenceCards (3–6 columns)       │
│ … Discoverer · Certification            │ Pagination                                 │
└─────────────────────────────────────────┴────────────────────────────────────────────┘
Polygon filter modal (Radix Dialog, max-w-4xl) opens from the Polygons group.
```

At 390 px the sidebar keeps 320 px and `<main>` gets 70 px (measured). No keyboard shortcuts of its own.

### 2. Every control

Primitives: `OptionWall` (`components/ui/option-wall.tsx`, segmented grid, single or multi, optional per-option hover Tooltip), `RowList` (2-col list of 28 px rows, reference-shelf.tsx:539-568), `ChipRow` (wrapping 28 px chips, 572-601), `IntervalFilterCell` (dual-thumb `IntervalSlider` + readout, 606-642), `FilterGroup` (heading with summary; the note is a hover `title`, 644-665), `Switch`, `RangeInput`, `Button`, `Pagination`.

### 2.1 Filter sidebar, top to bottom

| # | Group / control | Type | Options | Filter field → URL key | Visible when | File |
|---|---|---|---|---|---|---|
| 1 | Filters header + Clear (n) | label + text button | resets to `{geometry: euclidean}` | | n > 0 active filters | 2066-2076 |
| 2 | Search | text input, filters on every keystroke | "Search id or family…" | `query` → `q` | always | 2077-2083 |
| 3 | Geometry | OptionWall 3 cols | Euclidean / Hyperbolic / Spherical | `geometry` → `geo`; switching to a curved geometry keeps only decoration, discoverers, certs, query (1633-1660) | always | 2085-2087 |
| 4 | Kind | OptionWall 2 cols | All / Tilings / Edge patterns / Colorings | `decoration` → `dec`; changing it clears incompatible facets (1577-1631) | always | 2091-2096 |
| 5 | Tile class | RowList 2 cols (long labels span both) | All, Regular, Star, Hollow, Convex irregular, Isotoxal, Mixed, Scaled, Period-p, Polyforms, Different edge lengths, Islamic, Bubble (not under Tilings) | `tileClass` → `class` | Euclidean and (All or Tilings) | 2100-2104, 1899-1904 |
| 6 | Composite palette | OptionWall 3 | All / Decomposable / Uses non-decomp. | `convexDecomp` → `decomp` | class = convex | 2106-2119 |
| 7 | Shape (isotoxal) | OptionWall 3 + note | All / α-family / α, β-family | `isotoxalShape` → `iso` | class = isotoxal | 2121-2137 |
| 8 | Side lengths | OptionWall 3 + note | All / Sides 1–2 / Sides 1–3 | `scaledScaleSet` → `scaleset` | class = scaled | 2139-2155 |
| 9 | Form | OptionWall 2 + note | All + polyform families | `polyformFamily` → `pform` | class = polyomino | 2157-2174 |
| 10 | Design system | OptionWall 2 + note | All + Bonner's systems | `islamicSystem` → `islamicsystem` | class = islamic | 2176-2192 |
| 11 | Palette (edge lengths) | OptionWall 1 col + long note | All + edge boards | `edgeBoard` → `edgeboard` | class = edgelen | 2194-2218 |
| 12 | Board | OptionWall "All" + one OptionWall (3 cols) per board family, family sub-headings | boards from `boardFamiliesFor(geometry, decoration)` (can be hundreds: 271 hyperbolic-poly boards) | `board` → `board` (legacy `fdgrid`, `cogrid` read) | a specific Kind is chosen | 2220-2257 |
| 13 | Shape (star polyhedra) | OptionWall 3 + note | All / Pyramids / Prisms / Antiprisms / Cupolas / Other | `starKind` → `skind` | board = `sst` | 2262-2281 |
| 14 | Crossing | OptionWall 3 + note | All / Self-intersecting / Embedded | `ncxCrossing` → `ncx` | board = `spn-solid` | 2283-2302 |
| 15 | Colors | OptionWall 3 + note | All / n colors | `colorsCount` → `cocount` | Euclidean Colorings | 2304-2321 |
| 16 | Tile kind | OptionWall 2 + note | All + freedraw face kinds | `freedrawKind` → `fdkind` | Euclidean Edge patterns | 2323-2336 |
| 17 | Regular polygons | OptionWall 2 + long note | All + k-uniform / has-X options | `freedrawRegular` → `fdreg` | Euclidean Edge patterns | 2338-2359 |
| 18 | k group (title varies: Vertex count / Grid-point orbits / Vertex orbits / Colored vertices) | ChipRow: All + k values; k ≥ 3 or ≥ 8 chips trigger shard loads | | `kValue` → `k` | always | 2361-2369, title 1962-1969 |
| 18b | Maximal (M = k) | Switch (sm) | | `maximalOnly` → `maximal` | Euclidean Tilings | 2372-2377 |
| 18c | note ("k ≥ 8 loads on demand", etc.) | text | | | contextual | 2378-2387 |
| 19 | Level | OptionWall multi, 1 col, labels with counts, hover tooltips (right) | Čtrnáct's five levels | `levels` → `level` | curved geometry, Tilings | 2394-2414 |
| 20 | Valence | IntervalFilterCell (dual thumb) | data bounds | `hypValence` → `valence` | Hyperbolic | 2422-2436 |
| 21 | Palette (hyperbolic) | IntervalFilterCell | | `hypPolygon` → `palette` | Hyperbolic | 2438-2452 |
| 22 | Edge length | IntervalFilterCell (step 0.01) + note | | `hypEdge` → `edge` | Hyperbolic | 2454-2475 |
| 23 | Distinct configs (M) | OptionWall 6 cols: All + M values | | `mValue` → `m` | classified and k chosen | 2479-2489 |
| 23b | Partition (multiplicity group) | OptionWall 4 cols | All + partition keys | `partitionKey` → `partition` | partitions exist | 2490-2503 |
| 24 | Star: Fold (n-pointed) | ChipRow multi (`n★`) | | `starFolds` → `folds` | classified, class ≠ regular, folds exist | 2507-2514 |
| 24b | Star: Shape | OptionWall 3 | All / Rigid / α-family | `parametric` → `param` | same | 2515-2521 |
| 25 | Polygons: Pick polygons… | wide button opening the modal; shows the selection | | `polygonNames` → `polygon` | Euclidean Tilings, ≥ 2 species | 2525-2547 |
| 25b | Clear polygon selection | text button | | | selection non-empty | 2548-2556 |
| 25c | Distinct polygons | OptionWall multi 6 cols, no fill | counts | `distinctPolygons` → `dpoly` | > 1 option | 2557-2569 |
| 25d | Distinct star polygons | OptionWall multi 6 cols | | `distinctStars` → `dstar` | > 1 option | 2570-2582 |
| 25e | Angle-word period | OptionWall multi 2 cols | | `anglePeriods` → `aper` | > 1 option | 2583-2595 |
| 26 | Lattice | OptionWall 3, single; each option has a Bravais-lattice diagram tooltip (hover/focus, right) | square / hexagonal / rhombic / rectangular / oblique | `latticeShapes` → `lattice` | classified, class ≠ star | 2599-2619 |
| 27 | Wallpaper group | OptionWall multi 4 cols; options off the chosen lattice are disabled; cell-diagram tooltip per option | 17 groups | `wallpaperGroups` → `group` | classified, class ≠ star | 2621-2645 |
| 28 | Discoverer | OptionWall multi 2 cols | Kepler, Krötenheerdt, Chavey, Galebach, Čtrnáct, Myers, Longo | `discoverers` → `by` | always | 2647-2658 |
| 29 | Certification | OptionWall multi 3 cols | proven / reproduced / candidate | `certifications` → `cert` | always | 2660-2671 |

Polygon filter modal (`components/polygon-filter-modal.tsx:127-220`, Radix Dialog max-w-4xl, body `max-h-[68vh]` scroll):

| Control | Type | Field → URL |
|---|---|---|
| Mode | OptionWall 3: Uses all of / Uses any of / Only these (+ note) | `polygonMode` → `polymode` |
| Regular polygons | grid of species cards (toggle, check mark, count in `title`) | `polygonNames` |
| Star polygons | per-fold rows of species cards | `polygonNames` |
| Footer | match count, Clear, Done | |

### 2.2 Results header (`reference-shelf.tsx:2679-2751`)

| Control | Type | Drives | Visible |
|---|---|---|---|
| Title + count (+ "· n families" when grouped hyperbolic) | text | | always |
| Loading / failed shard notices | inline text with spinner | | while shards load or fail |
| Group variants | Switch (sm) | `groupVariants` → `grouped=0` when off | Hyperbolic |
| Copy link | secondary button, flips to "Copied" | copies `window.location.href` | always |
| Columns | RangeInput 3–6 (w-24) + value | `gridColumns` → `cols` (default 5) | always |
| Per page | OptionWall 10 / 25 / 50 (w-28) | `pageSize` → `size` (default 25) | always |

### 2.3 Results grid and cards

Grid: `grid-template-columns: repeat(gridColumns, 1fr)`, gap 12 px (`reference-shelf.tsx:2060, 2776-2785`). Empty, loading and error states at 2753-2772 (empty state has a "Clear filters" link).

`ReferenceCard` (`components/reference-card.tsx`):

| Part | Type | Behaviour | File |
|---|---|---|---|
| Thumbnail | `role="button"`, tabIndex 0 | click or Enter/Space → `router.push('/play?source=reference&tiling=<id>')` (a history push, so Back returns to the library); only the thumbnail is clickable | 156-173, handler `reference-shelf.tsx:2782` |
| Badges (top-left) | chips: certification, decomposable, off-grid, strip/∞/holes, preview, parameter glyphs, n★ folds | each has an explanatory `title` (hover only) | 213-294 |
| Screenshot button | hover-revealed icon (opacity-0 until group-hover) | disabled by `SCREENSHOT_BUTTONS_ENABLED = false` | 297-307 |
| Text block | 2–3 lines, varies by shelf (hyperbolic: config + k + class; decorated: family, k noun, id; default: id, k · class, M/partition · wallpaper group) | discoverer, note, M/partition detail only in `title` (hover) | 310-389 |
| Variant pager ‹ n/N › (hyperbolic, grouped) | two 12 px icon buttons + counter | cycles the member shown; click on the thumbnail then opens that member | 126-150 |
| Hover lane highlight | CSS `has-[.card-thumb:hover]` | cosmetic | 98-107 |

Pagination (`components/ui/pagination.tsx`): range text (container ≥ lg), "Page [input]" jump (container ≥ 2xl), prev / up to 7 page buttons with ellipses / next. Already container-query responsive.

### 3. Modes and sub-views

- Geometry (3) × Kind (All + 3) decide which facet groups exist (visibility table above, predicates at `reference-shelf.tsx:1895-1969`). Euclidean + Tilings is the richest; curved geometries reduce to Kind, Board, k, Level, (hyperbolic intervals), Discoverer, Certification, Search.
- Tile class opens class-specific facets (rows 6-11). Choosing a board opens the board-specific facets (13, 14).
- Hyperbolic adds the Group variants switch and grouped cards with pagers.
- Lazy shards: picking k ≥ 3 (convex, isotoxal, period, mixed, scaled, edgelen) or k ≥ 8 (regular) or certain decorations fetches shards; the header shows progress.

### 4. Interactions

- Everything is click/tap on buttons; no canvas gestures (thumbnails are static renders).
- Pointer-driven: IntervalSlider (`touch-action: none` via `.ta-ival`, `app/globals.css:242-246`), native RangeInput for Columns.
- Hover-only: FilterGroup notes (heading `title`), Lattice and Wallpaper-group diagram tooltips, Level tooltips, card badge/line `title`s (discoverer lives only here), card hover highlight, the (disabled) screenshot button.

### 5. Keyboard

None route-specific. Cards: Enter/Space on the focused thumbnail. Global: nav digits 1–9/0, Shift+T, Shift+U. Search input suppresses the global digit shortcuts while focused (`isTypingTarget`).

### 6. URL state

Parsed once on mount (`parseViewState`, `reference-shelf.tsx:326-455`), mirrored with `replaceState` on every change, no debounce (727-733). Keys: `q geo dec class k valence palette edge decomp skind ncx m partition maximal folds param iso scaleset pform islamicsystem board edgeboard fdkind fdgrid cogrid cocount fdreg group level lattice by cert polygon polymode dpoly dstar aper page size cols grouped`. Legacy `class=hyperbolic|spherical|freedraw|colors` is promoted to geometry/decoration. Filters or page-size changes reset to page 1, except on first mount (716-725).

### 7. Mobile risks at 390 px touch (/library)

1. The 320 px filter sidebar leaves a 70 px results pane (measured). Filters need to move to a sheet or full-screen panel with an "n results" apply bar; the result count and Clear (n) must stay visible.
2. Columns slider (3–6) makes no sense on a phone; a 390 px viewport fits 1–2 cards. The `cols` URL param must still round-trip for desktop links (clamped 3–6 in the parser, `reference-shelf.tsx:449`), so the phone layout should ignore it without rewriting it.
3. Results header is one `flex-wrap` row of four controls; at phone width it wraps into three or four lines above the grid.
4. Board wall can hold hundreds of options (hyperbolic-poly, Schwarz, spherical solids) as 3-column 28 px cells: long scroll inside an already long filter list.
5. Hover-only content: every FilterGroup note, the lattice and wallpaper diagrams (the only visual explanation of those facets), Level definitions, card discoverer and badge meanings.
6. Touch targets: chips and option cells are 28 px high; the variant pager arrows are 12 px icons with 2 px padding (≈16 px targets); IntervalSlider thumbs are 12 px.
7. Only the thumbnail opens a card; on phone the text block will read as tappable. Decide deliberately.
8. Search filters per keystroke over up to ≈13k+ loaded records; acceptable on desktop, may stutter on low-end phones.
9. Polygon modal is max-w-4xl with a 68vh scroll body and a species-card grid; on a phone it needs a full-screen sheet and a sticky footer.
10. Card click is a history push to /play; on phone, Back must restore the filter view. It does today, because the library URL carries the full state.
11. Pagination already collapses via container queries; the page-jump input disappears on narrow containers, leaving only 7 page buttons (fine).


---

## Inventory: /theory (all subroutes), /parquet, /freedraw

Mobile-redesign groundwork. Desktop must stay unchanged; everything below is the checklist a phone
layout has to preserve. Paths are relative to `/Users/alessandro/Desktop/Personal/TilingAtlas`.
Measurements marked "measured" come from a Playwright run against the dev server at 390x844
(hasTouch, isMobile) and 1440x900 on 2026-09-24.

### Shared shell (applies to every route below)

- `app/(app)/layout.tsx:9-19`: `h-screen flex flex-col overflow-hidden`; `<Nav/>` on top, then
  `flex-1 min-h-0 flex` (a ROW) holding the page. The document itself never scrolls; each page owns
  its scroll containers. Anything that overflows the row horizontally is clipped, not scrollable.
- Nav (`components/nav.tsx:17-28`): links Theory, Library, Play, Parquet, Freedraw, Colors, Aperiodic,
  Isohedral, Pentagons, Automata, with digit keys 1-9,0 as global route shortcuts (`navKey`,
  `components/nav.tsx:31`). Measured at 390px: the link strip is cut off after "Theor" (see
  screenshots); only Discord / updates / theme icons remain visible. Not in this scope's files, but
  every route here depends on it for navigation.
- `components/page-sidebar.tsx:18-40`: the left panel used by every /theory page. Fixed `w-80`
  (320px) on both the outer clip box and the inner `aside`; no breakpoint; `collapsed` prop slides it
  to `w-0` (unused on /theory). On a 390px screen this leaves 70px for the page body (measured).
- Tooltips (`components/ui/tooltip.tsx`, Base UI `Tooltip`, default delay 400ms): hover/focus only.
  On touch, Base UI tooltips do not open on tap, so every InfoDot / ToolbarButton label is
  effectively invisible on a phone.

---

### /theory (index)

File: `app/(app)/theory/page.tsx` (server, force-static). Data: `lib/theory/articles.ts:21-71`
(THEORY_GROUPS: Elements = Prototiles, Vertex configurations; Articles = uniform-tilings, freedraw,
islamic, perfect-rectangles, automata, hyperbolic).

### Layout
- Single scroll column: `h-full w-full overflow-y-auto`, inner `mx-auto max-w-4xl px-6 py-10`
  (`page.tsx:12-13`). No sidebar.
- Header h1 "Theory" + blurb `max-w-[640px]` (`page.tsx:14-21`).
- Per group: label (`ta-label`) and a card grid `grid-cols-1 gap-4 sm:grid-cols-2` (`page.tsx:28`).

### Controls
| Control | Type | Action | File:line |
|---|---|---|---|
| Article/element card (title, blurb clamped to 2 lines, arrow) | Link (whole card) | navigate to `/theory/<slug>` | `page.tsx:30-43` |

### Interactions / hover
- Hover: ring darkens, arrow nudges right and turns accent (`page.tsx:33,39`). Decorative only.
- Title truncates with `title=` attribute tooltip (`page.tsx:36`): the full title is hover-only when
  truncated.

### Mobile risk
- Already responsive (measured: 1 column at 390px, no overflow). Lowest-risk page in scope.
- Blurbs are `line-clamp-2`; long blurbs (perfect-rectangles, automata) are cut with no way to expand.

---

### /theory article pages (uniform-tilings, freedraw, islamic, perfect-rectangles, automata, hyperbolic)

Server routes read `public/theory/<file>.md` at build time and hand it to one client:
`app/(app)/theory/_theory-client.tsx`.

| Route | Markdown | Extra props | Route file |
|---|---|---|---|
| /theory/uniform-tilings | uniform-tilings.md | 11 cells + exact sources (o/s/d overlays work) | `uniform-tilings/page.tsx:57-69` |
| /theory/islamic | islamic-patterns.md | curated Islamic cells (no exact sources: o/s/d keys dead) | `islamic/page.tsx:43-47` |
| /theory/hyperbolic | hyperbolic-enumeration.md | Poincare patches for `<hyperbolic-card>` | `hyperbolic/page.tsx:46-59` |
| /theory/perfect-rectangles | perfect-rectangles.md | pipeline records for `<squaring-card>` | `perfect-rectangles/page.tsx:60-73` |
| /theory/freedraw | freedraw.md | prose only | `freedraw/page.tsx:22-26` |
| /theory/automata | automata.md | prose only | `automata/page.tsx:24-28` |

### Layout structure (`_theory-client.tsx:184-238`)
Three columns in a `flex h-full overflow-hidden` row:
1. Left: `PageSidebar scrollable={false}` (320px fixed) containing
   - `TheoryArticleNav` (top; from xl up it gets the full height and scrolls, `:191`),
   - below xl only: a hairline and `TheorySidebar` ("Contents" TOC) sharing the column (`:195-201`,
     `xl:hidden`).
2. Centre: `flex w-full min-w-0 flex-col` (`:205`)
   - 2px reading-progress bar (accent, `scaleX` driven imperatively on scroll, `:206-212`, `:113-119`),
   - `MarkdownRenderer`, which is its own scroll container (`components/markdown-renderer.tsx:86-92`,
     `overflow-y-auto scrollbar-hide`), article column `mx-auto max-w-[728px] px-6 py-6 md:py-10`
     (`:93`).
3. Right rail, xl (>=1280px) only: `aside hidden w-60 xl:block` with the same `TheorySidebar` (`:229-235`).

Breakpoints: only `xl` (TOC moves left->right) and `md` (article vertical padding). Nothing below md.

Nothing floats over the article, except the per-card corner buttons inside tiling cards.

### Sidebar: TheoryArticleNav (`components/theory-article-nav.tsx`)
| Control | Type | Action | File:line |
|---|---|---|---|
| "Theory" with left arrow | Link | back to /theory index | `theory-article-nav.tsx:14-20` |
| Group labels "Elements", "Articles" | static label | none | `:23-25` |
| One link per page (8 total), current highlighted with `aria-current="page"` | Link | navigate | `:29-41` |

Hover: background tint + text colour (`:37`).

### Sidebar / right rail: TheorySidebar "Contents" (`components/theory-sidebar.tsx`)
Built from h2/h3 (and h4) headings via `extractTableOfContents` / `structureTableOfContents`.
| Control | Type | Action | File:line |
|---|---|---|---|
| Chevron (only when a section has subsections; otherwise invisible placeholder, `tabIndex=-1`) | button, 20x28px (`w-5 h-7`) | expand/collapse subsections (all start expanded, `:32-43`), animated height (`:145-170`) | `:117-131` |
| Section title | button | sets `targetSection` -> MarkdownRenderer smooth-scrolls to the heading (`markdown-renderer.tsx:33-37`) | `:132-142` |
| Active marker | left border `border-fg` on the active row | driven by IntersectionObserver (below) | `:113-114` |
| States | "Loading...", error text, "No sections" | | `:59-65` |

### Article body (`components/markdown-renderer.tsx`)
- Plugins: remark-gfm, remark-math, rehype-raw, rehype-slug, rehype-katex (`:122-128`).
- Typography: h1 36px, h2 24px, h3 18px, h4 16px; h2/h3/h4 have `cursor-pointer` (`:97-100`).
- Tables: `w-full border-collapse`, cells `p-2`, td centred, NO horizontal-scroll wrapper (`:114-117`).
- Images: forced to `w-1/3` centred (`:112`); no article currently uses a markdown image
  (`public/theory/images/vertexTypes` exists but is unreferenced by grep).
- `<pre>`: `overflow-x-auto` (`:108`); no article currently has a code fence.
- KaTeX: inline `.katex` at 0.92em; display `.katex-display` gets `overflow-x-auto px-2` (`:119`).
- Link style: accent + underline (`:110`).

Interactions:
| Interaction | Mechanism | File:line |
|---|---|---|
| Scroll-spy (active TOC entry) | IntersectionObserver on h2/h3/h4, root = scroller, `rootMargin 0 0 -70% 0` | `markdown-renderer.tsx:40-60` |
| Click a heading -> smooth-scroll it to top | native `click` listener on the container (MouseEvent; fires on tap too) | `:63-72` |
| Scroll -> progress bar | passive `scroll` listener | `:76-83`, `_theory-client.tsx:113-119` |
| TOC click -> scroll to section | `scrollIntoView({behavior:"smooth"})` | `:33-37` |

### Custom markdown tags (mapped in `_theory-client.tsx:123-182`)

Usage per article (grep of `public/theory/*.md`):
| Article | `<card-grid>` | `<tiling-card>` | `<hyperbolic-card>` | `<squaring-card>` | GFM tables | `$$` display blocks |
|---|---|---|---|---|---|---|
| uniform-tilings.md | 9 | 11 | 0 | 0 | 0 | 3 |
| islamic-patterns.md | 5 | 9 | 0 | 0 | 0 | 0 |
| hyperbolic-enumeration.md | 2 | 0 | 4 | 0 | 2 (6-col, 4-col) | 4 |
| perfect-rectangles.md | 3 | 0 | 0 | 6 | 1 (3-col, 17 rows) | 3 |
| freedraw.md | 0 | 0 | 0 | 0 | 1 (4-col, long cells: "5, 39, 61, 257, 257, 6727, 0, 11304, ...") | 0 |
| automata.md | 0 | 0 | 0 | 0 | 0 | 0 (29 lines with inline `$`) |

#### `<card-grid cols="2|3">` -> `AnimatedCardGrid` (`_theory-client.tsx:74-106`)
- `not-prose my-8`; inner grid `grid-cols-1 gap-5 sm:grid-cols-2` (cols="2") or
  `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (default) (`:96-100`).
- Height is motion-animated from a ResizeObserver so an expanding card pushes the prose smoothly
  (`:79-92`); `LayoutGroup` makes siblings FLIP (`:102`). Honors reduced motion (`:77,92`).

#### `<tiling-card tiling="id" title="...">` -> `InteractiveTilingPreviewCard`
File: `components/interactive-tiling-preview-card.tsx`; live surface from
`lib/hooks/useFlatCellPreview.ts` (WebGL2, shared with /play flat view and the landing wall).
Fallback when id unknown: "Unknown tiling id" box (`_theory-client.tsx:128-134`).

Layout: slot `relative aspect-square` (inline expanded: `col-span-full aspect-[4/3]`, `:187-191`);
host `absolute inset-0 rounded-2xl border` (`:221-222`); canvases created imperatively. Top-right
button stack (`:242-276`) floats over the canvas.

Controls:
| Control | Type | Action | File:line |
|---|---|---|---|
| Card surface | focusable `role="application"`, `tabIndex=0` | first click/tap focuses = activates (does NOT pan); focus ring `ring-2` when active | `:193-230`, `lib/hooks/useCardActivation.ts:52-61` |
| Expand / Minimize (overlay mode shows X) | icon button, `ta-float p-2`, 14px icon (~30px hit box); `title` "Expand"/"Close"; `aria-pressed` | inline: card spans full grid width at 4:3, prose below pushed down; overlay mode (not used in articles) lifts to `fixed inset-[5vh_5vw]` over a backdrop | `:248-260` |
| Open in Play | Link icon (ExternalLink), `title="Open in Play"` | `/play?source=reference&tiling=<id>` | `:261-275` |
| WebGL failure | text "WebGL2 unavailable - interactive preview disabled." | | `:233-237` |

The button stack is `opacity-0` and appears only on `group-hover` or `focus-within`
(`:243-245`). On touch there is no hover: the buttons show only once the card has focus (after the
activation tap). They remain tappable while invisible (opacity only, no `pointer-events-none`), so an
activation tap in the top-right corner can hit Expand/Open blindly.

Gestures (all Pointer Events + one native wheel listener):
| Gesture | Effect | Condition | File:line |
|---|---|---|---|
| Primary pointerdown (mouse, touch, pen) | when inert: activates via focus, no pan. When active: starts pan, `setPointerCapture` | `button === 0` | `useFlatCellPreview.ts:560-576` |
| Pointer move while dragging | pan (target offset eased) | single pointer id only | `:578-598` |
| Pointer move, no drag | orbit hover readout (grows all dots of the hovered orbit) even when inert | `o` overlay on | `:579-587` |
| pointerup / pointercancel | end drag | | `:600-602`, `:611` |
| pointerleave | clear hover | | `:612` |
| Wheel | zoom toward cursor (`zoomAtPoint`) | active only; non-passive listener, preventDefault | `:516-535` |
| Shift + wheel | rotate in 5 degree detents (`ROTATE_SNAP_DEG`) | active only | `:521-527` |
| Right-click (button 2) | reset view (home zoom recomputed for current size) | interactive | `:560-566`, `:548-557` |
| contextmenu | suppressed | interactive | `:616` |
| `touch-action` | `none` when active (card owns the gesture), `auto` when inert (page scrolls) | | `interactive-tiling-preview-card.tsx:204`, `useCardActivation.ts:60` |
| Blur / click elsewhere | deactivates (focus leaving the card) | | `useCardActivation.ts:41-46` |

No pinch-zoom, no two-finger rotate, no touch reset, no double-tap: on a phone the only gesture that
works is one-finger pan after an activation tap. Zoom, rotate and reset have NO touch equivalent.
Rendering is lazy: IntersectionObserver with `rootMargin 200px` sets up / tears down the GL context
(`useFlatCellPreview.ts:500-512`).

Keyboard (card):
| Key | Scope | Effect | File:line |
|---|---|---|---|
| Esc | focused card, expanded | close expansion, stop propagation | `interactive-tiling-preview-card.tsx:208-213` |
| Esc | focused card, not expanded | blur = deactivate | `useCardActivation.ts:48-50` |
| o / s / d / p | focused card | toggle vertex orbits / symmetry elements / fundamental domain / polygon points for THAT card only | `lib/hooks/usePreviewOverlays.tsx:167-179`, keys `:9-14` |
| o / s / d / p | page, no card focused | toggle for EVERY card in the article (`PreviewOverlayScope` wraps the whole article, `_theory-client.tsx:187`) | `usePreviewOverlays.tsx:105-116` |
| Tab | | cards are focusable (`tabIndex=0`) | `useCardActivation.ts:56` |

The o/s/d/p overlays have NO on-screen control anywhere: keyboard-only. On uniform-tilings they
have data (exact sources shipped); on islamic they do nothing (no sources, `islamic/page.tsx:47`).

#### `<hyperbolic-card patch="..." label="..." caption="...">` -> `HyperbolicFigureCard`
File: `components/hyperbolic-figure-card.tsx`. Static by design (`:11-13`).
- `figure` with `aspect-square` baked Poincare disk image rendered at `size={420}` px
  (`:34`, `components/hyperbolic-developed-thumbnail.tsx` renders to a data URL, WebGL or 2D fallback,
  `:92-96`), figcaption with mono label and 11px caption (`:43-46`).
- Control: "Open in Play" link, top-right, `opacity-0`, visible on figure hover or keyboard focus
  only (`:35-41`), 10px text. Hover-only on touch (tappable while invisible).
- No gestures, no keys.
- Unknown patch fallback box (`_theory-client.tsx:153-158`).

#### `<squaring-card solid="..." caption="...">` -> `SquaringExampleCard`
Covered in the squaring section below (`components/squaring/squaring-example-card.tsx`).

### Modes / sub-views
- Below xl: left column = article switcher + TOC stacked; from xl: switcher left, TOC right rail.
- Tiling card states: inert, active (focused, ring), inline-expanded (full grid width 4:3),
  overlays o/s/d/p on/off per card or page-wide.
- Empty state: "No content available." (`_theory-client.tsx:222-226`).

### Keyboard shortcuts (article pages)
- o, s, d, p: page-wide overlay toggles (ignored while typing or with Meta/Ctrl/Alt,
  `usePreviewOverlays.tsx:107-108`).
- Esc: close expansion / deactivate card.
- Global nav digits 1-9, 0 (from Nav).

### Mobile risk (390px)
- BLOCKER: the 320px `PageSidebar` has no breakpoint. Measured on /theory/uniform-tilings at
  390x844: sidebar 320px, article scroller 70px wide, text column 22px, tiling card 22x22px. Every
  article is unreadable (one word per line, see screenshot `shot_theory_uniform-tilings-m.png`).
- The TOC below xl lives inside the same fixed sidebar under the article switcher, so on a phone the
  switcher + TOC would need to become a drawer / sheet / top menu.
- Tables have no scroll wrapper. Measured at 390px (with the squeezed column): hyperbolic tables
  291px and 221px wide, perfect-rectangles 261px, freedraw 377px. Even with a full 342px text column
  (390 - 2x24 padding), the freedraw 4-column table (long per-k count lists) and the hyperbolic
  6-column table will overflow; wrap tables in `overflow-x-auto` for phone.
- KaTeX display math already scrolls horizontally; the widest blocks are the hyperbolic
  `K = \sum_{chambers}(...)` and `\sin\frac{\alpha(p,\ell)}{2} = ...`. Inline math inside table cells
  (`$p \le 4$`, `$\{3,3\}$`) cannot wrap.
- h1 at 36px with `text-balance` is large for 342px; h2 24px OK.
- Prose instructions are desktop-only: uniform-tilings.md:3 and islamic-patterns.md:3 say "click a
  card, drag, scroll to zoom, hold Shift and scroll to rotate, right-click to reset, press Esc".
  A phone has none of wheel, Shift, right-click, Esc. islamic-patterns.md:71 says "open it in Play
  and press I". Phone copy or conditional copy needed.
- Tiling cards: only pan works on touch; zoom/rotate/reset need touch equivalents (pinch,
  two-finger rotate, double-tap reset) or visible buttons. o/s/d/p overlays need visible toggles.
- Corner buttons are hover-revealed and ~30px; still tappable while invisible.
- `card-grid` already collapses to one column below `sm` (640px); a 342px square card is fine.
  Inline expansion to `aspect-[4/3]` in a one-column grid changes little on phone (a wider card is
  impossible), so Expand may want overlay/fullscreen mode on phone.
- Every card has its own WebGL2 context (lazy via IntersectionObserver with 200px margin);
  uniform-tilings has 11, islamic 9. Mobile Safari caps live WebGL contexts (commonly ~8-16), so
  scroll-teardown must keep working.
- Heading tap scrolls that heading to the top (click listener): harmless but surprising on touch.
- Progress bar is 2px: fine.

---

### /theory/tiles ("Prototiles", an Elements page)

Files: `app/(app)/theory/tiles/page.tsx`, `app/(app)/theory/tiles/_tiles-client.tsx`,
`components/prototile-card.tsx`, `components/ui/button-group.tsx`.

### Layout (`_tiles-client.tsx:46-118`)
- Row: `PageSidebar scrollable={false}` (320px) | `main flex-1 overflow-y-auto p-5`.
- Sidebar: `TheoryArticleNav` pinned on top (`:52-54`), then a scrolling "Filters" panel (`:55-92`).
- Main: header row (Shapes icon, h1 "Prototiles", count badge "N shapes") (`:97-103`), explanatory
  paragraph `max-w-3xl` 12px (`:104-110`), then a CSS grid whose column count is a user setting,
  `gridTemplateColumns: repeat(columns, 1fr)` inline style, NOT responsive (`:44`, `:112-116`).

### Controls (sidebar, top to bottom)
| Control | Type | Options / action | File:line |
|---|---|---|---|
| Article switcher (TheoryArticleNav) | links | as above | `:53` |
| "Clear" (X icon), shown only when family != All | text button | reset family to All | `:58-65` |
| Tile class | ButtonGroup chips (single select) | All, Regular, Scaled, Polyomino, Convex irregular, Star, Isotoxal, Isotoxal (unified) (`:17-26`) | `:69-72` |
| Isotoxal angle grid (only when family is All / Isotoxal / Isotoxal unified) | chips | "30 deg (zeta12)", "15 deg (zeta24)" (default 24), plus a help paragraph | `:74-85`, options `:28-31` |
| Columns | chips | 3, 4, 5, 6 (default 5) | `:87-90`, options `:33` |

### Cards (`components/prototile-card.tsx`)
- Thumbnail `aspect-square` via `TilingThumbnail` (fit 0.74, scale bar) (`:47-56`); family badge +
  extra badges (10px), mono name (12px, `title=` tooltip), "N sides" (10px) (`:69-89`).
- Screenshot button is hover-revealed but disabled by feature flag
  (`SCREENSHOT_BUTTONS_ENABLED = false`, `lib/utils/featureFlags.ts:11`; `prototile-card.tsx:57-67`).
- No click, drag or keyboard interaction on the card itself. Hover changes border/background only.

### Keyboard shortcuts
None page-specific.

### Mobile risk (390px)
- Same 320px sidebar blocker: measured main column ~70px, paragraph one word per line
  (`shot_theory_tiles-m.png`).
- Grid columns are a fixed user choice (3-6) with no breakpoint; at phone width even 3 columns of
  cards with 10px badges is tight (~105px cards). Phone probably wants 2 columns and the Columns
  control hidden or re-ranged.
- Filters would need to move into a sheet/drawer; 8 family chips wrap into 3 rows already at 320px.

---

### /theory/configs ("Vertex configurations", an Elements page)

Files: `app/(app)/theory/configs/page.tsx`, `_configs-client.tsx`, `components/vertex-config-card.tsx`,
`components/ui/pagination.tsx`. Data fetched client-side per palette (`loadPaletteConfigs`,
`_configs-client.tsx:41-53`) from `public/vertex-configs/*.json`.

### Layout (`_configs-client.tsx:68-186`)
- Row: `PageSidebar` (320px) | `main flex-1 overflow-y-auto p-5`.
- Sidebar: TheoryArticleNav pinned (`:74-76`); "Palette" list and "Columns" (`:77-116`).
- Main: header (Grid3x3 icon, h1, mono badge "N tiles . N corners . N configs", `flex-wrap`)
  (`:121-130`); loading spinner / error / pagination + grid + pagination (`:132-184`).
- Grid: `repeat(columns, 1fr)` inline style, not responsive (`:66`, `:148`). 24 configs per page
  (`PAGE_SIZE`, `:20`).

### Controls
| Control | Type | Action | File:line |
|---|---|---|---|
| Palette cards: Regular, Regular + isotoxal, Regular + star, Combined (reduced), Combined (full), Scaled (each with a 10px blurb) | button list, single select | switch palette, refetch, reset to page 1 | `:83-103`, palettes `lib/configs/vertexConfigs.ts:39-45` |
| Columns | chips 4, 5, 6, 8 (default 6) | grid column count | `:106-114` |
| Pagination (top and bottom) | `ta-seg` strip: Prev (28x28), up to 7 page buttons (h-7, min-w-7) with ellipses, Next | change page | `pagination.tsx:121-147` |
| Range label "1-24 of N" | text, shown only when the pagination container is >= @lg | | `pagination.tsx:86-92` |
| "Page [n] of N" jump input | number input (Enter or blur submits) | jump to page; shown only at container >= @2xl | `pagination.tsx:96-119`, `:70-76` |

Config card (`_configs-client.tsx:153-172`): SVG fan of tiles (`vertex-config-card.tsx:81-93`), mono
10px word with `title=` tooltip (truncated), 9px "N corners . kind". Screenshot button hover-only and
flag-disabled (`vertex-config-card.tsx:94-104`). No click/drag.

### Modes
Loading ("loading <palette> configs..."), error, loaded. Pagination hidden when a single page.

### Mobile risk (390px)
- Same 320px sidebar blocker.
- Grid default 6 columns (minimum 4) with no breakpoint: at 342px usable that is ~55-80px cards with
  9-10px text. Phone wants 2-3 columns.
- Pagination adapts via container queries (range and jump input drop out first), good; 28px page
  buttons are below the 44px touch guideline. Combined (full) palette has thousands of configs
  (hundreds of pages): the jump input disappears on narrow containers, leaving only Prev/Next and 5
  numbered buttons.
- Truncated config words are readable only via `title=` hover.

---

### /theory/perfect-rectangles/pipeline

See the dedicated section "## /theory/perfect-rectangles/pipeline" below (assembled from a separate
pass over `components/squaring/*`). The `<squaring-card>` embedded in /theory/perfect-rectangles is
covered there too.

---

### /parquet

Files: `app/(app)/parquet/page.tsx` (force-static), `app/(app)/parquet/_parquet-client.tsx`,
`components/parquet-strip.tsx`, `components/ui/velocity-pad.tsx`, `components/ui/option-wall.tsx`,
`components/ui/slider.tsx`, `components/ui/info-dot.tsx`, `components/ui/floating-toolbar.tsx`,
state `lib/stores/parquet.ts` (Zustand; not persisted, not in the URL).

Purpose: proof-of-concept parquet-deformation viewer. Edges morph across a strip (1D) or a patch
(2D) while every shape still tiles; optional animated drift; SVG export.

### Layout (`_parquet-client.tsx:309-486`)
- Root `flex-1 min-h-0 flex flex-col md:flex-row` (`:310`): the ONLY page in scope with a
  responsive layout. From md (768px): left `aside md:w-80` (320px) with `md:border-r`; below md: the
  aside stacks above the drawing with `border-b`.
- Aside: `px-4 pt-4 pb-10 flex flex-col gap-6 overflow-y-auto ta-scroll-fade` (`:312`); header h1
  "Parquet deformation" + subtitle (`:313-316`); three groups: Shape, Motion, Strip/Patch.
- Main: `relative flex-1 min-h-0 flex items-center justify-center px-10 pt-10 pb-20 overflow-auto`
  (`:446`) holding the SVG (`ParquetStrip`, `w-full h-full`, `preserveAspectRatio="xMidYMid meet"`,
  `parquet-strip.tsx:40-45`).
- Floating over the drawing: `FloatingToolbar` pill, `absolute bottom-4 left-1/2 -translate-x-1/2`
  (`floating-toolbar.tsx:14-17`), buttons `h-8` (32px).

### Controls (aside, in UI order)
Group "Shape" (`:318-407`)
| Control | Type | Options / action | File:line |
|---|---|---|---|
| Deformation (InfoDot: explains 1D vs 2D) | OptionWall (segmented) | 1D strip / 2D patch; switching also resets cols/rows (`MODE_PATCH`: 1D 24x4, 2D 12x10, `lib/stores/parquet.ts:42-45`) | `:319-328` |
| Tiling | OptionWall | Square / Hexagon / Triangle (`lib/render/parquetTiling.ts:85,105,135`) | `:330` |
| Deformation field (InfoDot: Perlin vs analytic) | OptionWall | Profile / Noise | `:332-341` |
| Keyframe shapes, 2D + Profile only: four rows, one per corner (`CORNER_LABELS`) | OptionWall each | Straight / Pinwheel / Wavy / Fret (`parquetPresets.ts:49-52`) | `:344-351` |
| Keyframe shapes otherwise: "From edge (left)" / "To edge (right)" (renamed "Shape A" / "Shape B" in Noise) | OptionWall x2 | same four presets | `:352-359` |
| Noise only: Noise scale | Slider 0.5-12 step 0.5, readout "N across" | `:363-371` |
| Noise only: Contrast | Slider 0.5-4 step 0.1 | `:372-380` |
| Noise only: Evolve | Slider 0-1 step 0.02, 0 reads "frozen" | `:381-389` |
| Noise only: Seed | Slider 1-99 | `:390-397` |
| Profile only: "Profile curve" (1D) / "Profile along x" (2D) | OptionWall | Ramp / Tent / Sine (`parquetPresets.ts:75-77`) | `:401-403` |
| Profile + 2D only: "Profile along y" | OptionWall | Ramp / Tent / Sine | `:404` |

Group "Motion" (`:409-428`)
| Control | Type | Action | File:line |
|---|---|---|---|
| Grid drift (InfoDot) | 1D: Slider -0.25..0.25 step 0.01, readout "still" or "+0.12 w/s"; 2D: VelocityPad 112px disc | tiles translate through a fixed field | `:410-415`, `driftControl :266-307` |
| Field drift (InfoDot) | same as above | field slides over fixed tiles | `:416-421` |
| "stop" (only while that drift is non-zero) | text link button | zero the drift | `:272-280` |
| Warning paragraph when a non-periodic profile drifts | static text | | `:422-427` |

Group "Strip" (1D) / "Patch" (2D) (`:430-442`)
| Control | Type | Range | File:line |
|---|---|---|---|
| Amount | Slider, % | 0-100 | `:431-439` |
| Columns | Slider | 2-60 | `:440` |
| Rows | Slider | 1-20 | `:441` |

Floating toolbar over the drawing (`:455-484`)
| Control | Type | Action | File:line |
|---|---|---|---|
| Palette icon, label "Colour by field" / "Colour off" (tooltip) | toggle icon button 32x32, `aria-pressed` | fill tiles by field weights | `:456-462` |
| Grid icon, "Show base tiling" / "Hide base tiling" | toggle icon button 32x32 | draw undeformed tiling faintly | `:463-469` |
| divider | | | `:470` |
| "Export SVG" (Download icon + text), primary | button | downloads `parquet-<mode>-<tiling>-<field>.svg` via Blob + anchor click (`:89-97`) | `:471-483` |

### Modes / sub-views
- 1D vs 2D: 2D swaps both drift sliders for VelocityPads and, in Profile mode, the two keyframe rows
  for four corner rows and adds "Profile along y". Group title changes Strip -> Patch.
- Profile vs Noise: swaps the profile rows for four noise sliders and renames the keyframe rows.
- Animation: a rAF clock runs only while a drift is non-zero or noise Evolve > 0 (`:129-149`); the
  SVG re-renders every frame (React state `time`). ViewBox is held fixed across the animation
  (`:235-238`).

### Canvas / widget interactions
- The drawing (SVG) has NO interaction: no pan, zoom, click, hover or keys (`parquet-strip.tsx`).
- VelocityPad (`components/ui/velocity-pad.tsx`): Pointer Events on the SVG
  (`onPointerDown` with `preventDefault` + `setPointerCapture`, `onPointerMove`, `onPointerUp`,
  `onPointerCancel`, `:93-107`); class `touch-none` (`:85`) so touch drags work and don't scroll.
  Knob persists where released; the dashed dead-zone ring stops motion. `role="slider"` but no
  keyboard handling.
- Sliders: `RangeInput` wraps a native `<input type="range">` (touch-capable).
- OptionWall cells: `min-h-7` (28px) buttons (`option-wall.tsx:76`).
- InfoDot: hover/focus tooltip only; its click is swallowed (`info-dot.tsx:25-42`). Tooltip text is
  the only place the Grid drift / Field drift / Deformation / Deformation field explanations live.
- ToolbarButton labels are tooltips (delay 0) (`floating-toolbar.tsx:65`); on touch the two icon
  toggles have no visible label.

### Keyboard shortcuts
None (the page registers no key listeners). Dev hook: `window.__stores.parquet` (`lib/stores/parquet.ts:77-80`).

### Mobile risk (390px)
- BLOCKER (measured): below md the aside stacks on top but has no max height, so it takes its full
  1005px content height; the root is `h-screen overflow-hidden`, which leaves `main` 120px tall at
  y=1053, entirely below the 844px viewport and unreachable (nothing scrolls the page). The floating
  toolbar sits at y=1117, also invisible. On a phone the user sees the controls and never the
  parquet. (`_parquet-client.tsx:310-312,446`; screenshot `shot_parquet-m.png`.)
- `main` padding `px-10 pt-10 pb-20` (40/40/80px) eats a lot of a 390px screen.
- A 1D strip is 24x4 tiles by default: at 390px wide the strip renders roughly 60-70px tall.
- The 4-option OptionWall rows (Straight / Pinwheel / Wavy / Fret) fit at 390 (measured screenshot),
  but cells are 28px tall.
- InfoDot explanations are hover-only; toolbar icon meanings are hover-only.
- Per-frame React re-render of hundreds of SVG paths while animating: perf risk on phones, and
  Columns up to 60 x Rows up to 20.
- Export SVG uses an anchor download; iOS Safari opens SVG blobs in a new tab instead of saving
  (behaviour to verify).

---

### /theory/perfect-rectangles/pipeline

Route file `app/(app)/theory/perfect-rectangles/pipeline/page.tsx` (server, `force-static`) reads three indexes at build time and renders `<PipelineExplorer>` (`components/squaring/pipeline-explorer.tsx`) inside `<Suspense fallback={null}>` (page.tsx:60-64), because the explorer calls `useSearchParams`. Paths in this section are relative to `components/squaring/` unless given in full.

Screenshots taken on the dev server (port 3001), all in the scratchpad dir: `pipe-d.png`, `pipe-torus-d.png` (1440x900), `pipe-m.png`, `pipe-torus-m.png`, `pipe-ball-m.png` (390x844, touch emulation), and `nosb-pipe.png`, `nosb-torus.png` (390x844 with the PageSidebar hidden through script, which shows what the existing below-`lg` fallback looks like once the sidebar is out of the way).

### 1. Purpose and layout

Purpose: one object shown as four linked stages. There are three corpora ("shelves") behind one picker:
- **Polyhedron (sphere, genus 0):** 73 entries in 7 folders (Platonic 5, Archimedean 7, Prisms and antiprisms 10, Johnson 7, Halved Platonic 16, Spherical 3.4.n.4 7, Star polyhedra 21). The stages are solid, Tutte spring embedding, Smith diagram, squared rectangle. The control is the battery edge.
- **Torus (genus 1):** 24 entries in 3 folders (Uniform tilings 8, 2-uniform 8, 3-uniform 8). The stages are periodic tiling, harmonic flow, Smith diagram, squared torus. The control is the homology class (m, n).
- **Cylinder (hyperbolic):** 4 entries, no folders (hyp-3-7, 3-8, 3-9, 3-12). The stages are ball, harmonic potential, circuit, squared cylinder. The control is the ball radius. A code comment in cylinder-stages.tsx:15 mentions a Euclidean {3,6} entry, but the shipped index has none.

Page-level structure (the app shell is `app/(app)/layout.tsx`: `h-screen flex-col overflow-hidden`, with Nav on top and `flex-1 min-h-0 flex` below it):

```
[ PageSidebar w-80 (320px fixed) ][ main column: flex-1, max-w-[96rem], px-5 py-4 ]
  Back to the article                  <h1> name + mono stats line
  scroll list:                         StageBoard:
    polyhedron folders + rows            [control rail lg:w-[20rem]][ 2x2 grid of stages ]
    "Genus 1." blurb + torus folders
    "Hyperbolic." blurb + ball rows
```

- Root: `flex h-full min-h-0 w-full overflow-hidden` (pipeline-explorer.tsx:208).
- **Sidebar** `PageSidebar scrollable={false}` (pipeline-explorer.tsx:209). The outer wrapper is `w-80`, `h-full shrink-0 overflow-hidden`, and the inner `aside` is also `w-80` (components/page-sidebar.tsx:20-26). It has **no breakpoint**: it is 320px at every width. Inside it:
  - Header strip, `shrink-0 border-b px-3 pb-2`, containing the "Back to the article" link (pipeline-explorer.tsx:211-218).
  - Scroll list, `min-h-0 flex-1 overflow-y-auto px-2 py-2` (pipeline-explorer.tsx:219). This is the only scrolling part of the sidebar.
  - The torus section begins `mt-4 border-t pt-3` with a 10px blurb, "Genus 1. ..." (pipeline-explorer.tsx:245-249).
  - The hyperbolic section likewise, with the blurb "Hyperbolic. ..." (pipeline-explorer.tsx:275-279).
- **Main column** `min-w-0 w-full overflow-y-auto lg:overflow-hidden` (pipeline-explorer.tsx:300). Below `lg` the column scrolls as a page. At `lg` and up it is "one screen, no page scroll". Inner wrapper: `mx-auto flex h-full max-w-[96rem] flex-col px-5 py-4` (pipeline-explorer.tsx:301).
- **Header** `mb-3 shrink-0`: an `h1` at `text-xl`, then a mono `text-[11px]` stats line. It differs per shelf: ball at pipeline-explorer.tsx:304-312, torus at 317-323, polyhedron at 329-340.
- **StageBoard** (stage-board.tsx:24-49):
  - Container `flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:flex-row` (stage-board.tsx:26).
  - Control rail `aside`: `w-full shrink-0 flex-col gap-4`, and at `lg` it becomes `lg:w-[20rem]` (320px), scrolling on its own (`lg:overflow-y-auto lg:pr-1`) (stage-board.tsx:27).
  - Stage grid `grid grid-cols-1 gap-4 lg:grid-cols-2 lg:grid-rows-2 lg:flex-1` (stage-board.tsx:30). The four stages are **2x2 at lg+ and a single column below lg**. Order: 1 top-left, 2 top-right, 3 bottom-left, 4 bottom-right.
  - Each stage is a `section` (`flex min-h-0 flex-col border bg-surface-raised`) with:
    - a header holding "stage N · Title" (12px, with "stage N" mono at 10px);
    - a one-line blurb, `truncate text-[10px]`, whose full text exists only in the `title` attribute (stage-board.tsx:34-41);
    - the body `min-h-0 flex-1 p-2` (stage-board.tsx:43).
  - `RailPanel` (stage-board.tsx:52-64) is the framed control panel: a header reading "control · Title" plus a hint paragraph at 10px, then a `p-2.5` body.
  - `FigureCaption`: a fixed `h-[26px]` two-line mono 10px caption under a figure, with overflow hidden (stage-board.tsx:75-81).
  - `FigureControls`: the same 26px height, as a flex row that carries a small button (stage-board.tsx:84-86).
- **Breakpoints used:** only `lg` (1024px), in stage-board.tsx:26-30 and pipeline-explorer.tsx:300. No `sm`/`md` anywhere in components/squaring. The sidebar has none.
- **Measured at 1440x900 (desktop):**
  - Sidebar 320px; rail 320px.
  - Each stage cell is roughly 350x460 CSS px.
  - The stage SVGs render at about 346x278 (polyhedron) and 346x312 (torus/ball).
  - The torus dial SVG renders at 294x294.
  - No horizontal scroll. The whole board fits in one screen.
- **Measured at 390x844:**
  - The 320px sidebar leaves about 70px for the main column (see `pipe-m.png`).
  - The h1 wraps one word per line.
  - The stage SVGs collapse to **12x12 px**, and the rail's hint wraps one word per line.
  - The page is unusable, although `scrollWidth` stays at 390 (no horizontal page scroll).
  - With the sidebar hidden (`nosb-pipe.png`), the below-lg fallback is a single column 350px wide:
    - rail about 390px tall;
    - stage 1 and stage 2 about 428px each;
    - stage 3 about 278px;
    - stage 4 about 281px.
    - Stage SVGs 332px wide.
    - Torus: the rail is about 615px tall because the dial alone is 304x304 (`nosb-torus.png`).

**Floating over the figures:** nothing. No absolute-positioned overlays, tooltips or popovers on this route. The only overlay-like affordances are native SVG `<title>` tooltips, which appear on hover only (see section 4). The Next dev-tools "N" badge in the screenshots is dev-only.

**Sidebar rows** (all are full-width `<button>`s: `mb-1.5 flex w-full gap-2.5 border px-2.5 py-2.5`; the active one gets `border-line bg-surface-overlay` and `aria-current`):
- `PolyhedronRow` (pipeline-explorer.tsx:538-580). Contents:
  - a 54px `PolyhedronThumb` that spins;
  - the name, 11px, truncated;
  - `W x H` in mono 12px;
  - badges (perfect or "N sizes", simple or compound; `Badge` is 9px mono, pipeline-explorer.tsx:582-592);
  - a counts line in mono 9px.
- `TilingRow` (pipeline-explorer.tsx:483-520). Contents:
  - a 54px `TorusThumb` (static);
  - the name;
  - "order N at (m, n)";
  - badges ("N perfect" or "N sizes", plus "half-turn");
  - a 9px line of tiles, edges and classes.
- `BallRow` (pipeline-explorer.tsx:438-477). Contents:
  - a 54px `BallThumb`;
  - the name;
  - circumference first, then an up or down arrow, then last;
  - a transient/recurrent badge;
  - a 9px line with r and the square count.
- Row height is about 110-120px at desktop. See `pipe-d.png`.

**Thumbnails:**
- `PolyhedronThumb` (polyhedron-thumb.tsx):
  - One shared module-level rAF clock at about 24fps (polyhedron-thumb.tsx:24-70).
  - An IntersectionObserver with `rootMargin: 120px` subscribes a thumbnail only while it is visible (polyhedron-thumb.tsx:88-96).
  - `aria-hidden`, no interaction.
- `TorusThumb` (torus-thumb.tsx) and `BallThumb` (ball-thumb.tsx) are static SVGs, `aria-hidden`.

### 2. Controls, by region

#### Sidebar (pipeline-explorer.tsx)

| Control | Type | Action | file:line |
|---|---|---|---|
| "Back to the article" (ArrowLeft 12px + 11px text, `py-2`) | Next `<Link>` | navigates to `/theory/perfect-rectangles` | pipeline-explorer.tsx:212-217 |
| Folder header (chevron 11px, category label uppercase 10px, count) | `<button aria-expanded>` | toggles the folder open/closed. The open set is independent of the selection and seeded from the deep link (181-198). The body animates height 0 to auto over 0.24s, instant under reduced motion | pipeline-explorer.tsx:622-638 (Folder 604-655), toggle 191-198 |
| Polyhedron row | `<button aria-current>` | selects a solid. Clears the torus and ball selection (234-238). Triggers a shard fetch (101-116) | pipeline-explorer.tsx:229-239, 551-579 |
| Torus row | `<button>` | selects a squared torus, clears the ball selection. Does not clear `selected`, so the polyhedron state survives underneath | pipeline-explorer.tsx:259-267, 493-519 |
| Ball row | `<button>` | selects a cylinder, clears the torus selection | pipeline-explorer.tsx:281-289, 450-476 |

Selection precedence in the main column: ball, then torus, then polyhedron (pipeline-explorer.tsx:302, 315, 327). A polyhedron row is marked active only when no torus is selected (232). It does not check the ball, so while a ball is shown the last polyhedron row still appears active. That is a small existing inconsistency.

#### Polyhedron shelf: control rail, "control · The battery edge"

Hint: "Click an edge in stage 1 or 2; the other three stages resolve for that choice." (pipeline-explorer.tsx:349-353).

| Element | Type | Action | file:line |
|---|---|---|---|
| Facts grid (rectangle, order, distinct sizes, simple, battery edge, spanning trees, zero-current edges when present) | `<dl>` 2-col, mono 10px, labels 9px uppercase | read-only | pipeline-explorer.tsx:354-367, Fact 522-529 |
| Solve error line | text | shown when the in-browser re-solve fails | pipeline-explorer.tsx:368-370 |
| "Same rectangle as the shelf's pick..." / "A different rectangle..." + **"Reset to the shelf's edge"** | text + underlined inline `<button>` (11px) | `setBattery(null)` returns to the shipped battery. Visible only when a non-shipped battery is active | pipeline-explorer.tsx:371-384 |
| Bouwkamp code | mono **9px**, `break-all` | read-only. It can be about 20 lines long for order 59 | pipeline-explorer.tsx:385-387 |

The battery is actually changed by clicking in the stages (below). Picking a new edge re-runs `buildPipelineRecord` in the browser (pipeline-explorer.tsx:122-138).

#### Polyhedron shelf: stages

| Stage | Control | Type | Action | file:line |
|---|---|---|---|---|
| 1 The polyhedron (`PolyhedronWire`) | drag on the SVG | pointer drag | rotates the solid: yaw +0.01 rad/px, pitch clamped to ±1.4. Stops the auto-spin | polyhedron-wire.tsx:85-99 |
| 1 | click an edge (`<line>`) | click | makes that edge the battery. Ignored if the press moved more than 2px or the edge is already the battery | polyhedron-wire.tsx:137-139, moved flag 95 |
| 1 | hover an edge | pointerenter | sets the shared hovered edge | polyhedron-wire.tsx:136 |
| 1 | "pause" / "spin" | `<button>` `px-2 py-0.5 text-[10px]` | toggles the idle rAF spin | polyhedron-wire.tsx:166-172 |
| 1 | caption "drag to rotate · click an edge to make it the battery" | text, truncated | none | polyhedron-wire.tsx:163-165 |
| 2 Flattened by springs (`TutteSprings`) | click an edge | click | sets the battery (not guarded by drag, since there is no drag here) | tutte-springs.tsx:157-159 |
| 2 | hover an edge | pointerenter | shared hover | tutte-springs.tsx:156 |
| 2 | "replay" | `<button>` `px-2 py-0.5 text-[10px]` | restarts the spring simulation from the squashed solid | tutte-springs.tsx:186-192, reset 66-72 |
| 2 | status caption "springs relaxing..." / "settled · matches the direct solve · click an edge" | text | none | tutte-springs.tsx:181-185 |
| 3 The Smith diagram (`SmithDiagram`) | hover a wire, a zero-current flat wire, or the battery arc | pointerenter | shared hover. The hovered wire thickens to 1.9x and its current label enlarges 1.3x. Other wires fade to 0.3 | smith-diagram.tsx:110, 125, 143 |
| 3 | (no click) | | stage 3 cannot pick a battery | |
| 4 The squared rectangle (`SquaringFigure`) | click a tile (`<g>`) | click | makes that tile's edge the battery. Also fires on the current battery tile, which is harmless | squaring-figure.tsx:62 |
| 4 | hover a tile | pointerenter | shared hover. The tile is redrawn last with a 5-unit fg stroke | squaring-figure.tsx:61, 34-42 |
| 4 | caption "W x H · order · ... · click a tile for its edge" | text | none | squaring-figure.tsx:94-98 |

Note that the rail hint names only stages 1 and 2, but stage 4 also picks the battery.

#### Torus shelf: control rail, "control · The homology class" (torus-stages.tsx:165-248)

Hint: "Drag the ray; it sticks to the exact classes. Each diameter kills one square."

| Element | Type | Action | file:line |
|---|---|---|---|
| Class readout "(m, n)", or the angle in degrees when off the lattice | mono `text-base` | read-only | torus-stages.tsx:171-177 |
| "reset" | `<button>` `px-1.5 py-0.5 text-[10px]` | `setCls(entry.bestClass)` | torus-stages.tsx:178-184 |
| Status line "exact class · integer sides" / "off the integer lattice · sides irrational" | mono 9px, fixed `h-3` | read-only | torus-stages.tsx:189-191 |
| **Parameter dial** `SqDomainFigure` in `mx-auto w-full max-w-[19rem]` | SVG, 560 viewBox | see the rows below | torus-stages.tsx:194-207 |
| Dial: drag anywhere on the disk | pointer drag, with capture on the first move beyond 4px | sets the class to `snapClass(angle, 6)`. There is a 14-unit dead zone at the centre | sq-domain-figure.tsx:96-113, angleAt 80-88; parent onAngle torus-stages.tsx:202 |
| Dial: click a sector wedge (either antipodal half) | click on `<path>` | jumps to that sector's representative class, oriented to the clicked half. Wedges with no reachable class are inert | sq-domain-figure.tsx:129-141 |
| Dial: hover a wall diameter (14-unit transparent hit line) | pointerenter | sets the hovered edge. This lights the wall and the corresponding square in all four stages. Rim tie ticks are not interactive | sq-domain-figure.tsx:194-205 |
| Wall explanation text | 10px, fixed `h-8` | changes when a wall is hovered | torus-stages.tsx:208-218 |
| **Stepper m**: "−" button, range input, "+" button | `<button>` **20x20px** (`h-5 w-5`), `<input type=range>` **`w-16` (64px)**, `<button>` 20x20 | integer m in [-6, 6]. Off-lattice it steps from the nearest integral class | torus-stages.tsx:222, Stepper 291-337 |
| **Stepper n** | same | integer n in [-6, 6] | torus-stages.tsx:223 |
| Facts grid (order, distinct sizes, this class sector, walls · ties, locked pairs, quotient V/E/F, torus area) | `<dl>` mono 10px | read-only | torus-stages.tsx:225-247 |

Torus stages (all hover-only, and no clicks are wired):

| Stage | Interaction | file:line |
|---|---|---|
| 1 The periodic tiling (`TorusTilingFigure mode="plain"`) | hover an edge segment (14-unit transparent hit line). Every lattice copy of that quotient edge lights up. `onPick` exists but is not passed | torus-tiling-figure.tsx:86-99; torus-stages.tsx:254 |
| 2 The harmonic flow (`mode="flow"`) | same. Stroke width scales with current; vertex dots are r=7 and not interactive | torus-tiling-figure.tsx:84-124 |
| 3 The Smith diagram (`SquaresSmithDiagram`) | hover a wire (16-unit transparent hit line) | smith-diagram-squares.tsx:116-117 |
| 4 The squared torus (`SquaredTorusFigure`) | hover a tile (every copy lights). `<title>` tooltip. `onPick` not passed, so clicks do nothing. Labels appear only on the centre copy and only when they fit | squared-torus-figure.tsx:147-177; caption 192-203 |

#### Cylinder shelf: control rail, "control · The ball radius" (cylinder-stages.tsx:102-131)

Hint: "Grow the ball and watch the circumference settle."

| Element | Type | Action | file:line |
|---|---|---|---|
| "r = N" and the circumference (4 dp), with an up or down arrow against the previous radius (accent when rising) | mono `text-base` | read-only | cylinder-stages.tsx:103-114 |
| Radius slider | `<input type=range>` full width, step 1, min to max of `entry.radii` (for example 1-4, or only 1-2 for hyp-3-9 and hyp-3-12) | `setRadius`. Defaults to the largest radius | cylinder-stages.tsx:115-124, default 32 |
| Facts (squares, walk, ball V/E, circumference to 6 dp) | `<dl>` | read-only | cylinder-stages.tsx:125-130 |

Cylinder stages, all hover-only:
- 1 and 2 `HyperbolicBallFigure`: 12-unit hit path per edge. Flow mode draws vertex dots (hyperbolic-ball-figure.tsx:106-145).
- 3 `CylinderCircuit`: 12-unit hit line (cylinder-circuit.tsx:91-103). It has static text labels "potential 1, the source" and "potential 0, the whole boundary..." at fontSize 17 in a 1000-wide viewBox (116-121).
- 4 `SquaredCylinderFigure`: a hover on each `<rect>` with no enlarged hit area (squared-cylinder-figure.tsx:67-79). It shows 1/3 of the circumference at true aspect when the circumference is above 2.2 (cylinder-stages.tsx:167).

### 3. Modes, sub-views and states

- **Shelf switching:** there is one live selection among `selected` (solid), `selectedTorus` and `selectedBall` (pipeline-explorer.tsx:67-82). Picking a row in one section clears the others (234-238, 263-266, 285-288). The main column swaps the header and the whole StageBoard, and the layout skeleton stays identical: rail plus 2x2. `TorusStages` and `CylinderStages` are keyed by entry id (313, 325), so the class or radius resets on each new selection.
- **Stage selection:** none. All four stages are always shown together; there are no tabs and no focus mode. On a phone the only way to compare stages is scrolling.
- **Battery / edge-orbit choice (polyhedron):**
  - `batteryFor` is tagged with the solid id (pipeline-explorer.tsx:87-95), so it resets implicitly when the solid changes.
  - Every edge is clickable; the "edge orbit" is not shown as a set. The rail reports afterwards whether the pick gave the same rectangle as the shelf's (`sameAsShipped`, 204-205, 373-375).
  - There is no list of orbits and no next/previous-orbit control.
- **Hover-linking:** this is the core feature.
  - Polyhedron: the key is the string `edgeKey(a, b)` (stage-shared.ts:12), shared across all four stages. `hoveredFor` is tagged by solid (pipeline-explorer.tsx:86-91).
  - Torus: the key is the quotient edge index (torus-stages.tsx:53). Hover also drives the dial wall highlight and the wall text (116, 208-218).
  - Cylinder: the key is the edge index (cylinder-stages.tsx:33).
  - Hover is cleared by `onPointerLeave` on each figure's root SVG. Instances: polyhedron-wire.tsx:103-106, tutte-springs.tsx:125, smith-diagram.tsx:99, squaring-figure.tsx:49, torus-tiling-figure.tsx:63, smith-diagram-squares.tsx:88, squared-torus-figure.tsx:134, hyperbolic-ball-figure.tsx:90, cylinder-circuit.tsx:80, squared-cylinder-figure.tsx:58, sq-domain-figure.tsx:95.
- **Animations:**
  - Stage 1 idle spin: rAF, 0.35 rad/s, stopped by any pointerdown (polyhedron-wire.tsx:51-64, 88).
  - Stage 2 spring relaxation: one step per frame until the residual falls below 1e-4 (tutte-springs.tsx:79-102). It restarts on every new record, including every battery change (75-77).
  - Sidebar thumbnails spin continuously while visible.
- **Empty and loading states:**
  - No pipeline index: centred message "No pipeline data. Run pnpm tsx scripts/build-squaring-shelf.ts" (page.tsx:47-56).
  - Missing torus or cylinder index: that sidebar section is dropped (page.tsx:28-45; pipeline-explorer.tsx:244, 274).
  - Polyhedron: "Loading…" (pipeline-explorer.tsx:345). On fetch error, a bordered message "Could not load <id>." (342-343).
  - Torus: "Loading…" (torus-stages.tsx:150). A 404 shows "stale" text plus a **"Reload the page"** button (126-139); other failures show a build hint (141-147).
  - Torus degenerate class: a message **replaces the entire StageBoard including the control rail** (torus-stages.tsx:154-160). The steppers can reach (0, 0), which produces this. The reset button is then gone, and the only way out is picking a different row; re-clicking the same row does not remount. This is an existing trap, and worse on a phone.
  - Cylinder: "Loading…" and a "Reload the page" button for the stale case (cylinder-stages.tsx:68-93).
  - Unknown `?solid=` falls back to the first entry; unknown `?tiling=` or `?ball=` is ignored (pipeline-explorer.tsx:67-82).
- **Folders:** open state is seeded so exactly one folder is open, the one holding the deep-linked target. A `?ball=` link opens none (pipeline-explorer.tsx:181-190). The ball section has no folders.
- **Layout change by breakpoint:** below `lg` the rail stacks above the stages in one column and the main column scrolls (stage-board.tsx:26-30; pipeline-explorer.tsx:300). The sidebar does not change at any width.

### 4. Canvas/SVG interactions and input model

- **Rendering:** everything is plain inline SVG with a `viewBox` and CSS width. There is **no canvas, no WebGL and no three.js** on this route. The 3D solid is a hand-rolled orthographic projection (`project`, stage-shared.ts:67-82).
- **Input API:** **Pointer Events only**, through the React `onPointerDown/Move/Up/Leave/Enter/Cancel` props, plus `onClick`.
  - There are **no mouse-event handlers and no touch-event handlers** anywhere in components/squaring. A grep for `onMouse`, `onTouch`, `wheel`, `onWheel` and `onKey` returns nothing.
  - Pointer capture: `e.target.setPointerCapture` on pointerdown (polyhedron-wire.tsx:89); `currentTarget.setPointerCapture` on the first move (sq-domain-figure.tsx:109), released on up (115).
  - `onPointerCancel` exists only on the dial (sq-domain-figure.tsx:118-120). PolyhedronWire has no pointercancel handler; after a touch cancel `drag.current` stays set until pointerup or pointerleave.
- **`touch-action`:** `touch-none` is set on the stage 1 SVG (polyhedron-wire.tsx:84) and on the dial (sq-domain-figure.tsx:94). On a phone, a finger landing on either cannot scroll the page. The stage 1 SVG is about 332px square in the phone fallback, so it covers most of the screen. All other figures keep default touch-action.
- **Rotate:** stage 1 only (drag). **Pan:** none. **Zoom:** none, with no wheel and no pinch. The figures are fit-to-box with no view state. **Drag:** stage 1 rotate, torus dial ray. **Click:** stage 1 and 2 edges, stage 4 tiles (polyhedron), dial wedges, all buttons.
- **Hover-only affordances:** these are what the mobile version must preserve through some tap equivalent.
  - The cross-stage edge link in every shelf (the whole point of the page). Every figure listed in section 2 fires `onHover` on `pointerenter`.
  - Smith diagram (polyhedron) current labels on short wires are hidden unless that wire is hovered (smith-diagram.tsx:166). Some currents are readable only on hover.
  - Torus dial wall hover lights a diameter plus its square, and swaps the explanatory text (sq-domain-figure.tsx:194; torus-stages.tsx:208-218).
  - Native `<title>` tooltips:
    - tiles in stage 4 polyhedron, "N from edge a–b" (squaring-figure.tsx:75);
    - squared torus tiles (squared-torus-figure.tsx:163);
    - stage blurbs, where the full text of the truncated blurb exists only in `title` (stage-board.tsx:39).
  - Hover styling on buttons and rows (`hover:text-fg`, `hover:bg-surface-overlay/40`) is cosmetic only.
- **Hit-target sizes, in viewBox units scaled to about 332px on a phone or about 346px on desktop:**
  - Stage 1 edges: stroke 1-2.4 units in a 340 viewBox (polyhedron-wire.tsx:133), about 1-2.4 CSS px. There is no enlarged hit line.
  - Stage 2 edges: stroke 1.4 in 340 (tutte-springs.tsx:153), about 1.4px, again with no enlarged hit line.
  - Torus, cylinder and Smith-squares figures use 12-16-unit transparent hit lines in a 1000 viewBox, which is only about 4-5 CSS px at 332px.
  - Dial walls: 14 units in 560, about 7-8px.
  - Squared-cylinder tiles near the boundary shrink geometrically to sub-pixel sizes.

### 5. Keyboard

- There are **no keyboard shortcuts** on this route: no keydown listeners in components/squaring or in pipeline-explorer.
- Native keyboard access only:
  - folder headers and all rows are `<button>`s (Tab plus Enter/Space);
  - the "Back" link;
  - pause/spin, replay, reset and Reset-to-shelf buttons;
  - stepper buttons;
  - range inputs (arrow keys; torus-stages.tsx:316-325, cylinder-stages.tsx:115-124).
- The SVG figures are `role="img"` and not focusable, so the battery pick, rotation, dial and hover-link are **mouse/pointer only** with no keyboard path.
- The global Nav shows `Kbd` hints for route switching only at `2xl` (components/nav.tsx:97). That is outside this component.

### 6. URL query params

- **Read** once, as initial state, through `useSearchParams` (pipeline-explorer.tsx:65-82):
  - `?solid=<id>` picks a polyhedron. An unknown id falls back to `index.entries[0]`.
  - `?tiling=<id>` picks a squared torus (takes precedence over solid).
  - `?ball=<id>` picks a hyperbolic cylinder (takes precedence over both).
- **Written:** none. Selecting rows, changing the battery, the class or the radius never updates the URL: there is no `router.replace` and no `history` call. The URL keeps whatever deep link opened the page, so a shared URL does not reflect the current view.
- Inbound links: the article's `<squaring-card>` links to `?solid=<id>` (squaring-example-card.tsx:56). Links to `?tiling=` and `?ball=` exist only if typed; none are generated by these components.

### 7. Mobile risks at 390px touch

1. **Fixed 320px sidebar.** `PageSidebar` is `w-80` with no breakpoint (page-sidebar.tsx:23, 26), leaving about 70px for the content. The stage SVGs render at 12x12px (`pipe-m.png`). This is the blocking issue, and the same component is shared by the article page and the rest of the app. Needed: a drawer or sheet for the picker below `lg`, while desktop keeps `w-80`.
2. **Picker content.** 73 + 24 + 4 rows of about 110px each, with spinning thumbnails, inside a folder list. A phone picker needs the same three sections, folder open-state memory, the "Genus 1." and "Hyperbolic." blurbs, the badges and the active-row state.
3. **Stage board fallback is a long column.** With the sidebar gone, the existing below-`lg` column works: 350px cells, rail on top, then stages 1 to 4. But it is about 1,750px (polyhedron) to about 2,400px (torus) tall. The design premise, that the control changes all four stages at once and they must be visible together (stage-board.tsx:5-15), is lost: dragging the torus dial at the top cannot be watched against stage 4 at the bottom. Candidates: a sticky compact control, a 2x2 of small stages, or a swipeable stage carousel with a pinned control.
4. **Hover-only linking.**
   - On touch, `pointerenter` fires on tap, but the root SVG's `onPointerLeave` fires right after pointerup, so the highlight flashes and clears.
   - In polyhedron stages 1, 2 and 4 a tap is also a **click that changes the battery and re-solves everything**, so there is no way to inspect an edge's correspondence without committing a battery pick. A mobile design needs a separate "inspect" tap state (a persistent selection) distinct from "make this the battery", or a mode toggle.
5. **Tiny hit targets.**
   - Stage 1 and 2 edges are about 1-2.4px wide with no invisible hit line.
   - Other stages have hit lines of about 4-5px on screen.
   - Squared-cylinder boundary tiles are sub-pixel.
   - Stepper buttons are 20x20px.
   - Range inputs: `w-16`, 64px for m and n.
   - Pause/spin, replay and reset are about 20px tall (`py-0.5 text-[10px]`).
   - Folder headers are about 28px tall; the "Back" link is 11px text.
6. **Tiny numbers.**
   - Stage 4 labels are 26 units in a 1000 viewBox, about 8.6px at 332px wide. Many are dropped entirely by `labelFits` (squaring-figure.tsx:77).
   - Smith diagram labels are 28 units, about 9px.
   - Squared torus labels are 24 units, centre copy only.
   - Cylinder circuit text is 17 units, about 5.6px.
   - Rail facts are 10px mono with 9px labels. The Bouwkamp code is 9px `break-all`, about 20 lines for order 59.
   - Badges are 9px; captions are 10px in a fixed 26px box that clips at narrow widths (stage-board.tsx:77).
7. **`touch-none` areas block page scroll.** The stage 1 SVG (polyhedron-wire.tsx:84) and the torus dial (sq-domain-figure.tsx:94) swallow vertical swipes. In a stacked column the stage 1 figure is about 332x332px, so a user scrolling past it rotates the solid instead.
8. **No zoom anywhere.** Dense figures (order 59 rectangles, stage 2's central cluster, the {3,7} r=4 ball with 672 squares) cannot be enlarged. There is no wheel handler to port, but a phone will need pinch or a fullscreen stage view. Browser page zoom is the only current recourse.
9. **Truncated blurbs.** Stage blurbs are one line, `truncate`, with the full text only in `title` (stage-board.tsx:39). A phone has no hover, so the text is unreachable.
10. **Torus degenerate-class trap** (torus-stages.tsx:154-160): the control rail disappears together with the stages. It is more likely to be hit with a coarse stepper on touch.
11. **Continuous rAF work:** the stage 1 spin, the stage 2 simulation, the thumbnail clock and 4 re-rendering SVGs. This is a battery and perf cost on phones. Thumbnails are already IntersectionObserver-gated.
12. **h1 and stats line.** Names like "Icosahedron halved · shico-half-6-00001" wrap to two lines at 390; the mono stats line wraps to two or three lines. That is fine, but it pushes the control down.
13. **Header nav:** the global Nav clips ("Theor…") at 390 (`pipe-m.png`). This is shared chrome, not part of this route, but it is the entry point.

### Components in components/squaring that are not on this route

`squaring-controls.tsx` (the Options-tab block: a "Squared torus" checkbox, a "Richest" button, the SqDomain dial, and checkboxes for "Snap to exact classes", "Sizes", "Monochrome" and "Fundamental domain", all through the `useConfiguration` store), `squaring-inset.tsx` (a `w-52` floating panel at `absolute left-4 top-16` with a close X button) and `squaring-overlay.tsx` (a `pointer-events: none` 2-D canvas labels/lattice layer). All three are used only by `/play` (`app/(app)/play/_play-client.tsx`, `components/sidebar/options-tab.tsx`). They share `SqDomainFigure` with this route, so a touch rework of the dial affects `/play` too.

### <squaring-card> (embedded in /theory/perfect-rectangles)

**Wiring.**
- The article route `app/(app)/theory/perfect-rectangles/page.tsx` (force-static) reads `public/theory/perfect-rectangles.md`. It extracts every `<squaring-card solid="…">` by regex (page.tsx:32-36) and loads each `public/squarings/pipeline/<id>.json` at build time (page.tsx:47-58).
- It passes them as `squarings` to `TheoryClient`.
- `app/(app)/theory/_theory-client.tsx:165-175` maps the tag to `<SquaringExampleCard record caption>`. A missing record renders a bordered `aspect-square` placeholder, "Unknown squaring: <id>" (_theory-client.tsx:167-171).
- Six cards are embedded, in three `<card-grid cols="2">` pairs: cube and octahedron, icosahedron and metabidiminished-icosahedron, shcube-half-4-00001 and shcube-half-2-00005 (perfect-rectangles.md:26-27, 71-72, 110-111).
- `card-grid cols="2"` renders `grid grid-cols-1 gap-5 sm:grid-cols-2` inside a motion wrapper with animated height (_theory-client.tsx:74-106, 97-98). The cards go 2-across from `sm` (640px) and are one column below that.

**Article page layout around it** (_theory-client.tsx:188-236):
- The same `PageSidebar` w-80 on the left (article nav plus contents). Below `xl` the contents TOC sits in this left column (195-201).
- A 2px reading-progress bar (206-212).
- `MarkdownRenderer` scroll column.
- A right-hand `w-60` TOC rail at `xl` only (229-235).
- At 390px the same 320px sidebar squeezes the article to about 70px, and the card figures measure **22px wide** (`article-m.png`). With the sidebar hidden, the card is 342px wide and the rectangle SVG 316px (`nosb-article.png`).

**Card structure** (squaring-example-card.tsx):
- `<figure className="not-prose m-0 flex flex-col border bg-surface-raised">` (line 37).
- Top: `SquaringFigure` at full card width in `p-3` (38-40). The rectangle is the subject. It gets no `onPickBattery`, so tiles are hover-only and the caption lacks "click a tile".
- `figcaption` with `border-t px-3 py-2.5` (42-64). It contains:
  - A row: a **fixed `w-[84px]` box** holding `PolyhedronWire size={84} compact` (44-46). `compact` drops the caption and the pause button, and no `onPickBattery` is passed, so edge clicks do nothing.
  - A text column (47-61) with:
    - the name (xs);
    - `W x H · order N` (mono 11px);
    - `perfect|N sizes · simple|compound` (mono 10px);
    - the **"All four stages"** link (Next `<Link>` with ArrowUpRight 11px, `border px-2 py-1 text-[10px]`) to `/theory/perfect-rectangles/pipeline?solid=<id>` (55-60).
  - The optional `caption` paragraph at 11px (63).
- State: a local `hovered` edge key shared by the rectangle and the solid (line 28).

**Controls:**

| Control | Type | Action | file:line |
|---|---|---|---|
| Rectangle tile | SVG `<g>` pointerenter | hover-links the tile to its edge on the 84px solid. `<title>` tooltip "N from edge a–b" | squaring-figure.tsx:61, 75 |
| Mini solid, drag | pointer drag (`touch-none`, cursor-grab) | rotates; stops the idle spin | polyhedron-wire.tsx:84-99 |
| Mini solid, edge hover | pointerenter | lights the matching tile | polyhedron-wire.tsx:136 |
| Mini solid, edge click | click | **no-op** (no `onPickBattery`) | polyhedron-wire.tsx:137-139 |
| "All four stages" | link | deep-links into the pipeline with `?solid=` | squaring-example-card.tsx:55-60 |

**Modes and states:**
- None beyond hover. The solid auto-spins (rAF) in every card, which means six spinning SVGs on the article.
- There is no pause button in compact mode, so stopping it requires a pointerdown.
- Missing-record placeholder as above.
- The `o`/`s`/`d` keyboard overlays of `PreviewOverlayScope` apply to `<tiling-card>`, not to this card. The card has **no keyboard shortcuts**.

**Input model:** Pointer Events only (same components as the pipeline). There are no mouse or touch handlers, no wheel and no zoom. `touch-none` covers only the 84x84px mini solid.

**Measured sizes:**
- Desktop 1440: the card is about 213px wide (two across, beside a w-80 sidebar and a w-60 TOC), and the rectangle SVG is about 187px wide.
- Tile labels are 26 units in a 1000 viewBox, so about **5px on screen at desktop** (`article-d.png`) and about 8px at a 316px phone width.

**Mobile risks:**
1. The shared 320px sidebar crushes the card to 22px at 390px. This is the same root cause as the pipeline.
2. The hover link from tile to edge is the card's reason to exist. On touch it flashes and clears (the pointerleave on the SVG root, squaring-figure.tsx:49). With no click action on tiles, a tap equivalent (a persistent highlight) is free to add without conflicting with anything.
3. The 84px solid has edges about 1px wide and vertices r 4-6.5 units in an 84 viewBox. It cannot be meaningfully tapped, only dragged to rotate. Its `touch-none` blocks page scroll only in an 84px square, which is acceptable.
4. Tile numbers are about 8px at phone width, and many are dropped by `labelFits` on the larger-order examples (the order 17-19 cards).
5. "All four stages" is about 26px tall with 10px text: a small tap target.
6. `sm:grid-cols-2` means 2-across from 640px. Between 640 and roughly 900px with a sidebar present, each card is again very narrow. At 390px it is correctly one column once the sidebar is out.

---

### /freedraw

Read-only inventory, 2026-09-24, branch `design/instrument` @ d93a1660. All paths relative to the repo
root. Screenshots taken with Playwright against the dev server on :3001 at 390x844 (isMobile, hasTouch,
DPR 2) and 1440x900; PNGs in the session scratchpad (`fd-{planar,spherical,hyperbolic}-{m,d}.png`,
`fd-planar-m-collapsed.png`, `planar-arcs-d.png`, `hyp-before.png` / `hyp-after.png`).

### Route shell and arm switch

- `app/(app)/freedraw/page.tsx:11` `dynamic = "force-static"`; renders `<Suspense fallback={null}><FreedrawClient/></Suspense>` (`:18-22`) because the client reads `useSearchParams`.
- Comment at `page.tsx:7-10` says the route is hidden from the header. That is stale: the desktop Nav shows a "Freedraw" link (screenshot `fd-planar-d.png`).
- `app/(app)/freedraw/_freedraw-client.tsx`: holds `geometry` state, read ONCE from `?geo=` on mount (`:20-23`; `spherical` / `hyperbolic`, anything else is planar). `switchGeometry` (`:25-32`) sets state and `history.replaceState` to `/freedraw` (planar) or `/freedraw?geo=<g>`. Exactly one arm mounts at a time (`:34-36`); each arm owns disjoint local filter state, so switching arm discards the other arm's state (no preservation across switches).
- Surrounding app shell (`app/(app)/layout.tsx:10-13`): `h-screen flex flex-col overflow-hidden`, shared `<Nav/>` (48px tall), then `flex-1 min-h-0 flex` holding the arm. There is no document scroll anywhere; every scroll is an inner `overflow-y-auto` pane.

### Shared layout kit (`components/freedraw/filter-wall.tsx`)

All three arms are built from the same pieces, in the same arrangement:

```
arm root  flex flex-1 min-w-0 flex-col min-h-0            (planar-freedraw.tsx:446 and siblings)
├─ <header> shrink-0 border-b
│   └─ WallBar  (filter band, collapsible)
│       ├─ header row h-8: [title+count button] [chevron] ............ [top slot]
│       └─ body: flex flex-wrap gap-x-8 gap-y-5, of WallColumns (flex-[1_1_15rem])
└─ body row  flex-1 min-h-0 flex
    ├─ list pane  flex-1 min-w-0 overflow-y-auto p-4
    │   ├─ loading line
    │   ├─ CATALOGUE_GRID of CatalogueCards (auto-fill minmax(116px,1fr), gap-3)
    │   └─ Pagination (centered, mt-4) when > 240 entries
    └─ DetailPane  <aside> w-[380px] shrink-0 overflow-y-auto border-l p-4
        ├─ preview frame h-80 (320px) rounded-xl, hint chip floating bottom-left
        ├─ id (mono 16px) + optional subtitle
        ├─ "Open in play" primary button (full width)
        ├─ <dl> label/value metadata
        └─ extra children (planar only: per-tile list)
```

| Piece | Lines | Structure / sizing | Controls and interaction |
|---|---|---|---|
| `WallBar` | `:19-79` | `w-full bg-surface-raised px-4 py-2.5`; header row `flex h-8 items-center gap-2 text-xs` (`:35`); title `text-[15px] font-semibold`, count `text-[13px] tabular-nums` (`:43-44`); body collapses via inline `gridTemplateRows: 1fr/0fr` with a 200ms transition (`:61-76`); inner `flex flex-wrap items-start gap-x-8 gap-y-5 pb-2 pt-3` (`:69`). Local `open` state, default open, NOT persisted or in URL. | (a) Title+count `<button>` toggles collapse (`:36-45`, aria-expanded). (b) Chevron `<button>` `p-1`, 14px icon, rotates -90deg when closed (`:46-58`); measured 22x22px. (c) `top` slot right-aligned (`:59`). |
| `WallColumn` | `:83-85` | `flex min-w-0 flex-[1_1_15rem] flex-col gap-5`. The only responsive mechanism in the band: 15rem basis + wrap. 1440px gives 4 columns (planar) / 3 (spherical, hyperbolic); 390px gives 1 column. | none |
| `WallGroup` | `:88-108` | label row `h-4 whitespace-nowrap`, `ta-label` title + optional `text-[11px]` muted note after a middot. | none |
| `WallSubLabel` | `:111-113` | `ta-label pt-2` caption. | none |
| `GeometryGroup` | `:122-134` | `WallGroup "Geometry"` + `OptionWall columns={3}`: Planar / Spherical / Hyperbolic (`:115-119`). | Segmented single-select; calls `onGeometryChange`. |
| `TriMatrix` | `:152-182` | `grid grid-cols-[auto_auto] gap-x-3 gap-y-1`; per row a label (`text-xs whitespace-nowrap`) + a `ta-seg grid grid-cols-3` track of three buttons Has / None / Any (`:137-141`). Buttons `h-5 px-2 text-[11px]` (`:168`); measured 62x20px at desktop. | Tri-state per row, `aria-pressed`. |
| `ToggleCell` / `ToggleRow` | `:187-219` | `ta-seg flex`; cell `min-h-7 flex-1 px-2.5 text-xs`, with the shortcut letter as a `font-mono text-[10px]` suffix (`:211`) and `aria-keyshortcuts` (`:202`). | Independent on/off, `aria-pressed`. |
| `CatalogueCard` | `:223-253` | `<button>` `rounded-surface border`, `aspect-square` render slot then `px-2.5 py-2` caption: id `font-mono text-xs truncate`, subtitle `text-[11px] truncate`. Selected: `border-fg ring-1 ring-fg`; hover-only `hover:border-line-strong`. `data-selected` marks the selection for `useGridArrowNav`. Measured 118x167px at 1440. | Click selects. No double-click, no long-press, no keyboard beyond native button focus + global arrows. |
| `CATALOGUE_GRID` | `:256` | `grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(116px,1fr))]`. At 1440: 8 tracks of 118px. | none |
| `DetailPane` | `:262-317` | `<aside className="flex w-[380px] shrink-0 flex-col gap-4 overflow-y-auto border-l ... p-4 *:shrink-0">` (`:285`). Preview wrapper `relative h-80 overflow-hidden rounded-xl border` (`:289`). Hint chip `pointer-events-none absolute bottom-2 left-2 ... text-[11px]` floats over the canvas and fades after the first press (`:292-299`). Title `font-mono text-base font-semibold` (`:302`). `Button href variant=primary size=sm icon=Play label="Open in play" fullWidth` (`:305`; `components/ui/button.tsx`, `h-8`, renders a Next `<Link>`). `<dl>` of `ta-label` dt + `font-mono text-xs` dd (`:306-313`). | `onPointerDown` on the preview wrapper sets `touched` and fades the hint (`:288`; pointer events, so touch works). "Open in play" link. Everything else belongs to the embedded canvas. |

Shared primitives pulled in by every arm:

- `components/ui/option-wall.tsx` (`OptionWall`): a `ta-seg grid` whose `gridTemplateColumns` is `repeat(columns*r, minmax(0,1fr))` computed inline (`:59-62`); the column count is a fixed prop, never responsive. Cells `min-h-7 px-1.5 py-1 text-xs` (`:76`), measured 28px tall. Supports `multi`, `fill` (stretch short last row), per-option `disabled`, `title` attr (`:72`, unused on /freedraw) and `tooltip` (`:85-88`, wraps the button in `components/ui/tooltip.tsx`, Base UI tooltip, 400ms hover/focus delay, `max-w-[min(90vw,26rem)]`).
- `components/ui/pagination.tsx`: `@container relative flex justify-between` (`:85`). Range text "1–240 of N" hidden below container `@lg` (`:87`), "Page [input] of N" jump box hidden below `@2xl` (`:96-119`), strip of at most 7 page buttons + ellipses + prev/next (`:121-148`). Page buttons `h-7 min-w-7` (`:136`), prev/next `h-7 w-7` (`:159`), 28px. Page input handles Enter (`:70-76`) and commits on blur (`:110-113`). Pagination is only rendered when a slice has > 240 entries.
- `lib/hooks/useKeyShortcuts.ts`: one `window` `keydown` listener (`:46`); ignores Meta/Ctrl/Alt combos (`:39`) and typing targets (`:13-16`, `:40`); matches lowercased `e.key`; `preventDefault` on a match (`:43`).
- `lib/hooks/useGridArrowNav.ts`: binds ArrowLeft/Right (±1) and ArrowUp/Down (± one row, the row width read live from the computed `gridTemplateColumns`) (`:38-58`); clamps, never wraps; index is into the whole filtered list so it crosses pages. After every index change it calls `scrollIntoView({block:"nearest"})` on `[data-selected]` (`:60-64`).
- `components/ui/thumbnail-skeleton.tsx`: pulsing placeholder under spherical/hyperbolic thumbnails until baked.

### Planar arm (`components/freedraw/planar-freedraw.tsx`, default)

Purpose: the planar freedraw catalogues (square, triangle, hexagon, tri+squares grids; Schwarz (2,3,6) and (2,4,4) boards; 3.4.6.4 and 4.8.8 Archimedean boards), filtered by face classes, tile sizes and regular-polygon composition, with a 2D Canvas interactive preview.

#### Layout (1440x900 measured)

- Filter band 317px tall with arcs off (`fd-planar-d.png`), about 345px with Tiles on (Wiring + Pairing rows appear, `planar-arcs-d.png`). Four WallColumns: [Geometry, Grid, k] | [Tiles, Tile size] | [Regularity + Polygons] | [Display + Overlays (+ Wiring, Pairing)].
- Body: list pane x=16..1044 (8 thumbnail columns), DetailPane at x=1060, 380px wide.
- Count in the band header: `"loading…"` or `"<shown> / <slice>"` (`:449`), e.g. "53,060 / 53,060".

#### Controls, in UI order

| Region | Control | Type | Effect | Lines |
|---|---|---|---|---|
| Band header | "Freedraw tilings" + count | button | collapse/expand filter band | `filter-wall.tsx:36-45`, count `:449` |
| Band header | chevron | icon button (22px) | collapse/expand | `filter-wall.tsx:46-58` |
| Band header, right | "Reset filters" | text button (underlined), only when filter is non-default | `setFilter({...DEFAULT_FILTER, grid})`, page 1; keeps the grid | `:450-460`, `resetFilters :432-435`, `isDefault :438-439` |
| Col 1 | Geometry: Planar / Spherical / Hyperbolic | 3-cell segmented | switch arm | `:463` |
| Col 1 | Grid: Square, Triangle, Hexagon, Tri + squares, Schwarz 236, Schwarz 244, 3.4.6.4, 4.8.8 | 4-column OptionWall (2 rows), `whitespace-nowrap px-1` | `switchGrid`: sets grid, resets k to All and sizes to [], clears selection | `:465`, options `:51-60`, `switchGrid :417-420` |
| Col 1 | k · orbits: All, 1..N (per grid: square 1-5, triangle 1-4, hex 1-9, ts 1-3, sch236 3-4, sch244 2-4, 3.4.6.4 1-6, 4.8.8 1-10) | OptionWall, `columns = option count` (up to 11 on 4.8.8), `fill={false}` | set k, page 1; triggers lazy fetch of that slice | `:467-475`, options `:69-83` |
| Col 2 | Tiles · faces present: Finite, Strips, Unbounded, Holes | TriMatrix (Has/None/Any per row, 20px buttons) | per-class filter; combined | `:479-490`, rows `:87-92` |
| Col 2 | Tile size · (note "set Finite to Has" when disabled): All of / Any of | 2-cell OptionWall inside `<fieldset disabled>` (opacity-50) | size-match mode | `:495-503`, `:497` |
| Col 2 | Tile size chips (sizes present in the slice) | multi-select OptionWall, 6 columns, `fill={false}`; only rendered when Finite = Has | toggle a size | `:504-513`, `toggleSize :422-427`; whole group hidden when slice has no finite sizes (`:495`) |
| Col 3 | Regularity: Any tiles / All regular / k-uniform | 3-cell OptionWall | regularity filter | `:523-529`, options `:104-108` |
| Col 3 | Polygons: 3, 4, 6, 8, 12 (inline 12px SVG n-gon + digit) | TriMatrix | require / exclude / any per polygon | `:530-540`, `PolygonLabel :111-126`, `setPolygon :429-430` |
| Col 4 | Display: none / kind / shape / pose / orbit | 5-cell OptionWall | fill mode (local state, default `rank`=kind); affects thumbnails and preview | `:546`, `FILL_OPTIONS :128` (the `help` gloss from `lib/freedraw/render.ts:65-86` is DROPPED, so no tooltip) |
| Col 4 | Overlays: Grid G, Lattice P, Orbits O, Tiles A | ToggleRow of 4 ToggleCells | scaffold (default on), period lattice, grid-point orbit dots, arc/"tiles" mode | `:548-553` |
| Col 4 (Tiles on) | Wiring: ribbons / junction / caps | 3-cell OptionWall with hover tooltips (help text) | arc wiring rule | `:556-559`, options `:130-134` (tooltips from `lib/freedraw/arcs.ts:68-80`) |
| Col 4 (Tiles on) | Pairing: left / right | 2-cell OptionWall with hover tooltips | ribbon twist | `:560-561`, options `:139-142` |
| List pane | thumbnail cards (id, "N tile(s) · strip · ∞ · holes") | CatalogueCard wrapping a non-interactive `FreedrawCanvas cells={7}` | select | `:572-591` |
| List pane | Pagination (240 per page) | page strip + prev/next (+ page input on wide containers) | page | `:592-601`, `PAGE_SIZE :146` |
| DetailPane | interactive preview | `FreedrawCanvas interactive cells={11}` | pan / zoom / reset / orbit hover | `:606` |
| DetailPane | hint chip "drag to pan, wheel to zoom, double-click to reset" | floating label, fades on first pointerdown | none | `:608` |
| DetailPane | "Open in play" | Link button | `/play?tiling=<id>&...` with fill + overlays + arc settings via `serializePlayState` | `:376-392`, `:609` |
| DetailPane | metadata: grid-point orbits (label from `freedrawKNoun`) "k = n"; period lattice (T1/T2 + vertex count for patch records, else `(a,0),(b,d) · index` + "basis at 60°" on triangle); tile orbits | `<dl>` | read-only | `:610-631` |
| DetailPane | "tiles" list: rank label per face orbit with cells / holes / period | `<ul>` text | read-only | `:633-648` |

#### Modes and states

- Loading: band count shows `loading…` (`:449`); list pane shows "Loading the {grid} catalogue…" (`:571`); the thumbnail grid and DetailPane are empty until the slice lands.
- Error: whole arm replaced by `"Could not load the freedraw catalogue: …"` (`:441-443`). A 404/failed file is silently an empty list (`:231-232`).
- Empty filter result: no message. Grid is empty and the DetailPane disappears (it renders only when `selected && detail`, `:604`).
- Selection: defaults to the first row of the current page (`:313-316`); cleared on grid switch.
- Lazy loading: only the files for grid + k are fetched (`:220-221`, `:267-276`), cached module-wide. `heavy` slices (sch244 k4, hex k7-9, 3.4.6.4 k5-6, 4.8.8 k8-10) are skipped by "All" and fetched only when their own k chip is picked (`:151-216`). Sizes: `solutions.json` 131KB; `hex-solutions-k9.json` 16.7MB; `488-solutions-k10.json` 25.2MB.
- Arc ("Tiles") mode on: Wiring and Pairing rows appear under Overlays, band grows.
- Tile size group: absent (no finite sizes in slice), disabled with note (Finite not Has), or live with chips.

#### Canvas: `components/freedraw/freedraw-canvas.tsx` (`FreedrawCanvas`)

2D Canvas (`getContext("2d")`, `:173`), backing store sized from a ResizeObserver x DPR (`:129-141`, `:164-172`). View state is a `CardControls` from `lib/render/viewControls.ts`, eased by a RAF loop that runs only when `interactive` (`:204-220`). Thumbnails (`interactive=false`) draw once and never run the loop.

Input, POINTER events only (React `onPointer*` on the `<canvas>`, `:324-328`); no mouse or touch listeners:
- Drag to pan: `onPointerDown` calls `setPointerCapture` (`:224-228`), `onPointerMove` adds the delta to target and live offset (`:229-246`), `onPointerUp` releases (`:259-263`). Single-pointer only: a second finger overwrites `drag.current`; no pinch. No `onPointerCancel` handler.
- Hover: when not dragging, `onPointerMove` maps the pointer to world coordinates into `hoverRef` (`:247-257`), which grows the orbit dots under it (only visible with Orbits on; the loop runs every frame while `showVertices`, `:203`). `onPointerLeave` clears it (`:264-266`). Hover-only affordance.
- Wheel zoom toward cursor: native `wheel` listener with `{passive:false}` and `preventDefault` (`:270-310`, attach `:306`), zoom bounds 5..160 px/cell (`:31-33`). Shift+wheel rotates in 5 degree detents only if `onRotationChange` is passed (`:276-281`); /freedraw does NOT pass it, so Shift+wheel is a no-op here.
- Double-click resets pan, zoom and angle with an ease (`onDoubleClick`, `:313-320`, `:329`).
- Cursor: `cursor-grab active:cursor-grabbing` (`:330`).
- No CSS `touch-action` on this canvas.
- Keyboard: none on the canvas itself.

Also relevant: `useIsDark` (`:53-64`) watches the `dark` class on `<html>` via MutationObserver.

#### Keyboard shortcuts (window keydown via `useKeyShortcuts`)

| Key | Effect | Lines |
|---|---|---|
| G | toggle grid scaffold | `planar-freedraw.tsx:366` |
| P | toggle period lattice | `:367` |
| O | toggle grid-point orbits | `:368` |
| A | toggle arc "Tiles" mode (the comment at `:362-364` lists only G/P/O) | `:369` |
| ArrowLeft / ArrowRight | previous / next pattern in the filtered list, crosses pages | `useGridArrowNav.ts:54-55`, wired `planar-freedraw.tsx:352-360` |
| ArrowUp / ArrowDown | one grid row up / down | `useGridArrowNav.ts:56-57` |
| Enter (in the pagination page input) | jump to page | `pagination.tsx:70-76` |

All arrow keys are `preventDefault`ed on `window`, so they never scroll a pane on this page.

#### URL / query state

Read once on mount (`:247`, `parseFilter` in `lib/freedraw/filter.ts:142-186`), written on every filter change with `history.replaceState` (`:397-404`, `serializeFilter` `filter.ts:188-203`). Only non-default values are written; planar never writes `geo`.

| Param | Meaning |
|---|---|
| `g` | grid (`square` default, `triangle`, `hex`, `ts`, `sch236`, `sch244`, `4436`, `488`) |
| `k` | k (0 = All, omitted) |
| `u`, `s`, `f`, `o` | Tri state for unbounded, strip, finite, holes: `r` = Has, `x` = None |
| `sz` | comma list of tile sizes |
| `m` | `any` when size mode is Any of |
| `pg` | polygons, `req.exc` digit codes (12 coded `c`) |
| `rg` | `regular` or `unit` |

Not in the URL (per `filter.ts:125-126`): page, selected pattern, fill mode, overlays, arc wiring and pairing. The "Open in play" href does carry fill + overlays + arcs (`:376-392`), but its `useMemo` dependency list (`:392`) omits `showArcs`, `arcWiring`, `arcTwist`, so the link goes stale when only those change.

### Spherical arm (`components/freedraw/spherical-freedraw.tsx`, `?geo=spherical`)

Purpose: freedraw on the five Platonic solids plus the spherical Schwarz boards, with a three.js trackball preview and slowly spinning WebGL thumbnails.

#### Layout (1440x900 measured)

Band 221px tall, three WallColumns: [Geometry, k] | [Board (+ k-gap note)] | [Display, Overlays]. List pane shows 8 columns; DetailPane at x=1060, preview frame gets `bg-bg-subtle` (`:320`). Count: `"loading…"` or `"<N> at k = <k>"` (`:234`).

#### Controls

| Region | Control | Type | Effect | Lines |
|---|---|---|---|---|
| Band header | title/count, chevron | buttons | collapse | `filter-wall.tsx:36-58` |
| Col 1 | Geometry | 3-cell segmented | switch arm | `:236` |
| Col 1 | k · orbits: the base's available ks (icosahedron default: 1,2,3,4,5,6,8; dodecahedron up to 12) | OptionWall `columns = kList.length`, `fill={false}` | set k, clear selection, page 1 | `:237-249` |
| Col 2 | Board: tetra {3,3}, octa {3,4}, cube {4,3}, dodeca {5,3}, icosa {3,5} (default), then Schwarz boards (2,2,3), (2,2,4), (2,2,5), (2,3,3), (2,3,4), (2,3,5) | 3-column OptionWall (4 rows at present) | `switchSolid`: clamps k to one the base has, clears selection, page 1 | `:253-259`, `BASES :64-67`, `switchSolid :218-226` |
| Col 2 | "no k = … in this run" | WallSubLabel, only when the board's k list has holes | read-only | `:262-264` |
| Col 3 | Display: Polyhedron / Sphere | 2-cell OptionWall | preview AND thumbnails mode (local state, default polyhedron) | `:270-272`, `MODE_OPTIONS :79-82` |
| Col 3 | Overlays: Grid G | single ToggleCell | faint full edge grid, preview and thumbnails (local state, default off) | `:273-277` |
| List pane | cards: id + "N tile(s) · achiral/chiral" | CatalogueCard wrapping `SphereFreedrawThumbnail size={232}` | select | `:285-305` |
| List pane | Pagination | when total > 240 (icosahedron k6 = 6,727; k8 = 11,304) | page | `:306-315` |
| DetailPane | preview | `IcoFreedrawCanvas`, keyed by solid + id so it remounts per selection | trackball | `:321-331` |
| DetailPane | hint "drag to rotate, wheel to zoom" | chip | fades on first press | `:333` |
| DetailPane | "Open in play" | Link: `/play?tiling=sfd-<solid>-<id>` or the board record id | `:210-216` |
| DetailPane | metadata: solid/board, vertex orbits, drawn edges, tiles, symmetry | `<dl>` | read-only | `:335-341` |

#### Modes and states

- Loading: count `loading…`, "Loading the {label} catalogue…" (`:284`). A fetch miss becomes an empty slice with no message (`:150-154`); zero entries means no cards and no DetailPane (`:318`).
- One fetch per base + k (`/freedraw-ico/<solid>-k<k>.json` or `/schwarz-sph/s<id>-k<k>.json`, `:133`), cached (`:88`, `:126-158`). Largest: `icosahedron-k8.json` 2.0MB.
- WebGL failure in the preview: a centred "3D view unavailable" message telling the user the browser ran out of WebGL contexts and to reload (`ico-freedraw-canvas.tsx:279-286`). Thumbnail failure: grey tile with the word "sphere" (`sphere-freedraw-thumbnail.tsx:100-105`).

#### Canvas: `components/freedraw/ico-freedraw-canvas.tsx` (`IcoFreedrawCanvas`)

three.js `WebGLRenderer` on a canvas appended into an `absolute inset-0 z-10` host (`:101-106`, `:288`), pixel ratio capped at 2 (`:113`), a continuous RAF loop for as long as it is mounted (`:147-183`) that measures the host box every frame, depth-sorts facets and renders an occlusion pass plus the scene.

- Input goes through three.js `ArcballControls` built by `makeArcball` (`lib/render/sphericalCamera.ts:47-82`): free quaternion rotate, pan OFF (`:55`), zoom ON by wheel and two-finger pinch (`:56`), double-click focus OFF (`:58`), `cursorZoom` off (`:60`), distance clamped 1.8..8 (`ico-freedraw-canvas.tsx:139`, `sphericalCamera.ts:66-67`). ArcballControls itself listens with pointer events and handles multi-touch.
- Release momentum: `createOrbitMomentum` (`lib/render/orbitMomentum.ts:79-166`) listens to `pointerdown` on the canvas and `pointerup` + `pointercancel` on `window` (`:101-105`), so a flick keeps spinning (decay tau 6s, capped 5 rad/s).
- `touch-action: none` is set on both the canvas (`ico-freedraw-canvas.tsx:104`) and the host div (`:288`), so touch drags reach the trackball and do not scroll the aside.
- Reads global store fields with no control on /freedraw: `hueOffset`, `lineWidth`, `sphericalFaceOpacity`, `sphericalOrthographic` (`:70-72`, `:209`), all set from /play.
- No hover affordances, no keyboard.

#### Thumbnails: `components/freedraw/sphere-freedraw-thumbnail.tsx`

Each card is a plain 2D `<canvas>` (`:111-117`) fed by the shared turntable `lib/render/sphereThumbStage.ts`: ONE offscreen WebGL renderer for the whole page blits into each card; about 22fps (`FRAME_MS 45`), at most 14 draws per tick round-robin, 320px stage (`:30-50`). Lazy: an IntersectionObserver with `rootMargin: "300px"` builds a card's scene when near the viewport and disposes it when it scrolls away (`sphereThumbStage.ts:261-272`). Thumbnails follow the Display and Grid toggles (rebuild on change, `specKey :65`). Skeleton until ready (`:110`).

#### Keyboard shortcuts

| Key | Effect | Lines |
|---|---|---|
| G | toggle grid overlay | `spherical-freedraw.tsx:202` |
| Arrow keys | step selection / row, crossing pages | `:189-197` via `useGridArrowNav` |
| Enter in page input | jump | `pagination.tsx:70-76` |

#### URL / query state

Read once on mount: `solid` (validated against `BASES`, default `icosahedron`) and `sk` (clamped to the base's k list) (`:100-113`). Written on change via `replaceState` (`:170-176`): `geo=spherical` always, `solid` when not icosahedron, `sk` always (a bare `?geo=spherical` is rewritten to `?geo=spherical&sk=1`, confirmed in the browser). `sk` exists so the planar `k` never leaks across arms (`:107-108`). Not in URL: page, selection, mode, grid.

### Hyperbolic arm (`components/freedraw/hyperbolic-freedraw.tsx`, `?geo=hyperbolic`)

Purpose: freedraw on the hyperbolic Schwarz boards (2,3,7) and (2,4,5); tiny catalogues (4 and 7 records per slice).

#### Layout (1440x900 measured)

Band 209px tall, three WallColumns: [Geometry, k] | [Board (+ k-gap note)] | [Overlays]. DetailPane preview gets `bg-bg-subtle` (`:246`). Count as spherical (`:168`).

#### Controls

| Region | Control | Type | Effect | Lines |
|---|---|---|---|---|
| Band header | title/count, chevron | buttons | collapse | `filter-wall.tsx:36-58` |
| Col 1 | Geometry | 3-cell segmented | switch arm | `:170` |
| Col 1 | k · orbits (e.g. only "3" on (2,3,7)) | OptionWall `columns = kList.length` | set k, clear selection, page 1 | `:171-183` |
| Col 2 | Board: (2,3,7) (default), (2,4,5) | 2-column OptionWall | `switchBoard`, clamps k | `:187-193`, `:154-160` |
| Col 2 | "no k = … in this run" | WallSubLabel when k list has holes | read-only | `:195` |
| Col 3 | Overlays: Grid G | single ToggleCell | writes the GLOBAL store field `freedrawScaffold` (shared with /play), not local state | `:200-209`, `:83-84` |
| List pane | cards: id + "N finite + M unbounded · chiral" | CatalogueCard wrapping `HyperbolicEdgesThumbnail size={232}` | select | `:217-236` |
| List pane | Pagination | only if > 240 (never with current data) | page | `:237-241` |
| DetailPane | preview | `HyperbolicEdgesCanvas` keyed by id | see below | `:247` |
| DetailPane | hint "drag to pan the disk" | chip | fades on first press | `:249` |
| DetailPane | "Open in play" | Link `/play?tiling=<id>` | `:149-152` |
| DetailPane | metadata: board, vertex orbits, drawn edges "a of b orbits", tiles (sizes, ∞ for unbounded), edge lengths (3 values, 4 decimals), symmetry | `<dl>` | read-only | `:251-260` |

#### Modes and states

- Loading / miss behave like the spherical arm (`:89-108`, `:216`); one fetch per board + k from `/schwarz-hyp/h<id>-k<k>.json`.
- Thumbnail failure: grey tile with the word "disk" (`components/ui/disk-thumbnail.tsx:83-87`).

#### Canvas: `components/hyperbolic-edges-canvas.tsx` (`HyperbolicEdgesCanvas`)

WebGL2 per-pixel Poincaré-disk renderer (`:70-91`), 2D developed-edge fallback when WebGL2 or the Dirichlet certificate fails (`:110-131`, `:272-291`); continuous RAF loop (`:133-299`). The `<canvas>` has `pointerEvents: "none"` (`:306`): by design it is an overlay, and the header comment says "The p5 canvas underneath captures pan gestures" (`:33-34`). Pan, rotation, click-to-centre and reset are all read from the global store (`cfg.controls.offset/targetOffset/rotation`, `cfg.hyperbolicClick`, `cfg.hyperbolicResetView`, `:146-219`), which only /play's canvas writes.

Consequence on /freedraw: the preview is INERT. Nothing on this page drives those store fields, so the disk cannot be panned, zoomed, rotated or clicked, even though the hint says "drag to pan the disk". Verified with Playwright at 1440x900: a 100px mouse drag plus a wheel on the preview left the image unchanged except that the hint chip faded (`hyp-before.png` vs `hyp-after.png`). The only live input is the DetailPane wrapper's `onPointerDown` that hides the hint.

It also reads, with no control on /freedraw: `fillAmount`, `hueOffset`, `lineWidth`, `hyperbolicLineMode`, `freedrawScaffold` (`:146-150`, `:258-271`).

#### Thumbnails: `components/hyperbolic-edges-thumbnail.tsx`

`DiskThumbnail` shell (`components/ui/disk-thumbnail.tsx`): IntersectionObserver `rootMargin 300px`, observes once, bakes one frame through the frame-paced queue into a data-URL image (`disk-thumbnail.tsx:37-81`). The bake uses a shared offscreen WebGL renderer (`lib/render/hypThumbHost.ts`), falling back to 2D. Re-bakes when the store fields above change (`hyperbolic-edges-thumbnail.tsx:98-110`), so toggling Grid rebakes every card.

#### Keyboard shortcuts

| Key | Effect | Lines |
|---|---|---|
| G | toggle global `freedrawScaffold` | `hyperbolic-freedraw.tsx:146` |
| Arrow keys | step selection / row | `:135-143` |

#### URL / query state

Read once: `board` (validated, default `237`) and `hk` (clamped) (`:66-79`). Written via `replaceState` (`:118-124`): `geo=hyperbolic`, `board` when not 237, `hk` always (confirmed: `?geo=hyperbolic` becomes `?geo=hyperbolic&hk=3`). Not in URL: selection, page, grid overlay (which lives in the global store instead).

### Files in `components/freedraw/` that /freedraw does NOT render

For completeness (they are in the folder but mounted elsewhere; relevant if the mobile work touches /library or /play):

| File | Used by | Interaction notes |
|---|---|---|
| `freedraw-thumbnail.tsx` | `components/reference-card.tsx:13`, `components/sidebar/tile-grid.tsx:10` | static `FreedrawCanvas` with fixed `shape` fill, no scaffold (`:18-24`); non-interactive; one live 2D canvas + ResizeObserver per card, no lazy mount |
| `parametric-edges-view.tsx` | pentagon and isohedral edge canvases/thumbnails | `ParametricEdgesCanvas` (`:45-99`) is an interactive `FreedrawCanvas` driven by store fields and DOES pass `rotation` + `onRotationChange` (`:95-96`), so Shift+wheel rotation works there; `ParametricEdgesThumbnail` (`:112-147`) is a one-shot 220px 2D draw, no events |
| `sph-poly-canvas.tsx`, `sph-star-canvas.tsx`, `sph-schwarz-canvas.tsx` | `app/(app)/play/_play-client.tsx:29-31` | thin adapters over `IcoFreedrawCanvas` (same arcball + pointer + `touch-action:none`); star adds `edges` and `mod2` props (`sph-star-canvas.tsx:25-68`) |
| `sph-poly-thumbnail.tsx`, `sph-star-thumbnail.tsx`, `sph-schwarz-thumbnail.tsx` | `reference-card.tsx:15-17`, `sidebar/tile-grid.tsx:13-15` | thin adapters over `SphereFreedrawThumbnail` (shared turntable, lazy) |

### Hover-only affordances (all arms)

- Wiring and Pairing option tooltips (Base UI Tooltip, 400ms hover/focus delay; `planar-freedraw.tsx:130-142` via `option-wall.tsx:85-88`). On touch they do not open on tap, so the only explanation of ribbons / junction / caps and left / right is lost.
- Orbit-dot hover growth in the planar preview (`freedraw-canvas.tsx:247-257`), mouse hover only; on touch, `pointermove` only arrives during a drag, which clears the hover (`:236`).
- Hover colour shifts on every segmented cell, card border and the chevron (`hover:text-fg-secondary`, `hover:border-line-strong`), cosmetic only.
- Shortcut letters (G, P, O, A) on ToggleCells and `aria-keyshortcuts` are keyboard-only information.
- Fill-mode meanings (`FILL_MODES[].help`) are not exposed anywhere on /freedraw, hover or otherwise.
- No `title` attributes are set on /freedraw controls.

### Mobile-risk notes for 390px touch (measured at 390x844 unless noted)

Layout breaks outright:

1. No breakpoints. Nothing in `app/(app)/freedraw/*` or `components/freedraw/*` uses `sm:/md:/lg:`; the only adaptive rule is `WallColumn`'s 15rem flex-wrap basis and Pagination's container queries.
2. The DetailPane is a fixed `w-[380px] shrink-0` beside a `flex-1 min-w-0` list pane (`filter-wall.tsx:285`). At 390px the list pane collapses to its 32px padding and the thumbnail grid measures 0px wide; the aside sits at x=32..412, so its right 22px (including the right edge of the preview and "Open in play") is clipped. The catalogue is effectively unreachable on a phone. Screenshots `fd-*-m.png`, `fd-planar-m-collapsed.png`.
3. The filter band stacks into one column and becomes taller than the screen: planar 948px (more with Tiles on), spherical 533px, hyperbolic 365px, against an 844px viewport. With `h-screen overflow-hidden` on the shell and `shrink-0` on the header, the planar body row gets about 32px until the user collapses the band; there is no page scroll to reach it.
4. On first load the planar view opened shifted up 136px (Nav and the band title off screen, header top at y=-136). Likely cause: `useGridArrowNav`'s `scrollIntoView` on the selected card (`useGridArrowNav.ts:60-64`) scrolling an `overflow-hidden` ancestor. The band has no sticky or pinned header, so the collapse chevron can end up off screen.
5. The collapse state is local and resets to open on every arm switch and reload.
6. The shared Nav clips at 390px (links cut to "Theor"), outside this route's files but visible on it.

Touch and interaction:

7. Planar preview (`FreedrawCanvas`) has no `touch-action` and no `onPointerCancel`. On a phone the browser claims a one-finger drag for scrolling the `overflow-y-auto` aside and fires `pointercancel`, so drag-to-pan fails or stutters and `drag.current` can stay set. No pinch zoom exists (single-pointer logic, `:224-263`); zoom is wheel-only (`:270-310`). Reset is double-click only (`:329`), which competes with double-tap zoom on mobile browsers. The hint text ("wheel to zoom, double-click to reset") names desktop gestures.
8. Spherical preview is touch-ready: `touch-action:none` plus ArcballControls pointer handling gives one-finger rotate and pinch dolly; momentum listens to `pointercancel`. Its hint ("wheel to zoom") is desktop wording.
9. Hyperbolic preview is inert on every device (see above); the hint promises a pan that does not exist.
10. Every shortcut (G, P, O, A, arrows) has no touch equivalent; the arrow-key grid walk is the only way to step through patterns without tapping thumbnails, and there are no prev/next buttons in the DetailPane.

Hit targets (desktop-measured, sizes do not change at 390):

11. TriMatrix Has/None/Any buttons are 20px tall (`h-5`, `filter-wall.tsx:168`), 11px text; planar shows 9 such rows (4 face classes, 5 polygons), 27 targets.
12. OptionWall cells, ToggleCells, pagination buttons: 28px tall (`min-h-7` / `h-7`). The k row packs up to 11 cells (4.8.8 k=1..10 + All) at `columns = option count`, `fill={false}`; the Grid wall packs 4 per row with `whitespace-nowrap px-1` labels ("Tri + squares", "Schwarz 236") that are tight at 390.
13. Collapse chevron 22x22px. "Reset filters" is plain underlined 12px text.
14. Of 323 visible buttons/links on the planar page, 79 are under 32px in one dimension; spherical 37 of 46; hyperbolic 20 of 28.

Density:

15. Labels at 10-11px (`text-[10px]` shortcut suffixes, `text-[11px]` tri buttons, notes, card subtitles, hint chip); mono ids truncate in 116px cards.
16. DetailPane metadata is mono `text-xs`, including long lattice strings and hyperbolic edge lengths ("1.0906 · 0.5663 · 0.7297" style triples).

Performance / WebGL:

17. Planar mounts up to 240 live 2D canvases per page, each with its own ResizeObserver and an immediate draw (no IntersectionObserver or lazy mount, `planar-freedraw.tsx:573-590`); 241 canvases were counted on the default page. Heavy on a phone CPU, and any fill/overlay toggle redraws all 240.
18. Planar k chips can pull very large JSON: `hex-solutions-k9.json` 16.7MB, `488-solutions-k10.json` 25.2MB, `solutions-k5.json` 3.9MB, then classify every record in-thread (`analyseFaces`, `:282-296`). Risky on mobile memory and bandwidth.
19. Spherical keeps two WebGL contexts (shared thumbnail stage + the preview's own renderer, which runs a render loop every frame even when idle, `ico-freedraw-canvas.tsx:147-183`) plus a 22fps thumbnail turntable. The preview remounts per selection (`key`), creating and disposing a WebGL context each time (`forceContextLoss`, `:196`).
20. Hyperbolic preview runs a WebGL2 per-pixel shader in a continuous RAF loop (`hyperbolic-edges-canvas.tsx:133-299`) even though it cannot be interacted with here.

Global-state coupling to keep in mind when redesigning:

21. Hyperbolic Grid writes the global `freedrawScaffold` (also /play's field); planar and spherical overlays are local state. The spherical and hyperbolic previews read styling (hue offset, line width, face opacity, orthographic, fill amount, line mode) from the global configuration store, so /play's settings leak into /freedraw with no control here to change them.


---

## Explorer pages inventory: /colors, /aperiodic, /isohedral, /pentagons, /automata

Groundwork for the phone layout. Desktop must stay as described here. All paths are relative to
`/Users/alessandro/Desktop/Personal/TilingAtlas`. Line numbers are from branch `design/instrument` at
`d93a1660` (2026-09-24).

Measured on the running dev server (Playwright, `hasTouch`/`isMobile`, 390x844 and 1440x900; shots in
`scratchpad/shots/`): no route overflows horizontally at 390px, because every one clips. Four of the
five keep the 320px sidebar at full width, leaving the canvas **70px wide**. /colors keeps its 380px
detail pane, which leaves the thumbnail grid about 10px wide and stacks 240 live canvases in one clipped
column.

---

### 0. Shared shell and primitives (apply to every route below)

### App shell
- `app/(app)/layout.tsx:10-13`: `h-screen flex flex-col overflow-hidden`, `<Nav />` (h-12) over
  `flex-1 min-h-0 flex {children}`. `h-screen` is `100vh`; on mobile Safari/Chrome that includes the area
  under the URL bar, so the bottom of every canvas and the floating transport can sit under browser chrome.
- Immersive mode (`stores/immersive`): Nav collapses to `h-0` (`components/nav.tsx:64`), `PageSidebar`
  animates its outer box to `w-0` (`components/page-sidebar.tsx:20-25`). Used by /aperiodic, /isohedral,
  /pentagons. Not by /colors or /automata.

### `PageSidebar` (`components/page-sidebar.tsx:18-41`)
- Fixed `w-80` (320px) `aside`, `bg-surface-chrome border-r`, `shrink-0`. No breakpoint logic at all.
- `scrollable` false on all five explorer pages (each shell manages its own scroll regions).

### Shelf primitives (`components/shelf/index.tsx`)
- `Section` (28-43): mono uppercase `.ta-label` caption over controls. Note: `.ta-label` uppercases, so
  "Offsets γⱼ" renders as "OFFSETS Γⱼ" on /aperiodic multigrid (visible in the mobile screenshot).
- `Details` (46-57): `grid-cols-[6rem_1fr]` definition list, read-only facts.
- `Segmented` (81-126): `.ta-seg` grid of `.ta-tab` buttons, `min-h-7` (28px) cells, `cols` per row,
  optional `sub` second line, `dim` (dimmed but clickable), `disabled`, `title` (native hover tooltip).

### `OptionWall` (`components/ui/option-wall.tsx:51-95`)
- Same look as `Segmented`, `options/value` API, `min-h-7` cells, optional Base UI `Tooltip` per cell
  (85-88), `title` per cell, `disabled`.

### `Slider` / `RangeInput`
- `components/ui/slider.tsx:25-64`: label + optional `hint` node + mono readout row over a `RangeInput`.
- `components/ui/range-input.tsx`: native `<input type=range>` laid transparently over a styled track.
- Track hit area is **14px tall** (`app/globals.css:126-132`), thumb 12x12 (`:169-175`). Too small for a
  finger (44px guideline).

### Tooltips and info dots
- `components/ui/tooltip.tsx`: Base UI Tooltip (`@base-ui/react/tooltip`), opens on hover/focus. Does not
  open on touch tap. Everything below that lives only in a `Tooltip`, an `InfoDot` or a native `title=` is
  **unreachable on a phone**.
- `components/ui/info-dot.tsx:15-45`: 14px info icon, click swallowed, content in a hover tooltip.

### `FullscreenToggle` + `useImmersiveShortcuts` (`components/fullscreen-toggle.tsx`)
- Hook (25-45): **F** toggles immersive, **Esc** leaves it, unmount restores chrome.
- Button (51-74): `absolute top-4 right-4 z-30 ta-float p-2`, 16px Maximize/Minimize icon (~32px target),
  Tooltip "Fullscreen canvas · F". The only way back out of immersive without a keyboard.

### `useAperiodicView` (`lib/hooks/useAperiodicView.ts`): the canvas interaction layer for /aperiodic, /isohedral, /pentagons
- React pointer handlers spread onto the `<canvas>` (386-425):
  - `pointerdown` button 0: start pan, `setPointerCapture` (392-397). Button 2: **reset view** (ease home)
    (388-391).
  - `pointermove`: with drag, move target offset 1:1 (400-411); without drag, calls `onHover` (412-415).
  - `pointerup`: ends drag for that pointer id (417-419). `pointerleave`: ends drag + `onHoverEnd` (420-423).
  - `contextmenu`: prevented (right-click is reset) (424).
  - No `pointercancel` handler. A second finger's `pointerdown` replaces the drag (single-pointer pan only).
- Wheel: native non-passive listener (362-384). Plain wheel = zoom toward cursor within
  `home/8 .. home*400` (36-37, 376-380). **Shift+wheel = rotate in detents** (`ROTATE_SNAP_DEG`) (370-374).
- ResizeObserver keeps zoom scaled on panel resize (349-359). Easing loop on rAF (301-337).
- **No pinch zoom, no two-finger rotate, no double-tap, no touch-specific code.**
- The canvases add `touch-none` in their className, so browser pinch/scroll is also blocked over them.

### Keyboard guard
- `lib/hooks/useKeyShortcuts.ts:13-16` `isTypingTarget`; all page shortcuts skip modifier chords and
  focused inputs.

---

### 1. /colors (colored-tiling workbench)

Files: `app/(app)/colors/page.tsx`, `app/(app)/colors/_colors-client.tsx`,
`components/colors/colors-canvas.tsx`, `components/freedraw/filter-wall.tsx` (layout kit),
`components/ui/pagination.tsx`. The comment in `page.tsx:6` saying the page is not in the header nav is stale: /colors is in the nav now
(desktop screenshot shows "Colors").

### 1.1 Purpose and layout
- Purpose: browse periodic n-colorings of four grids decoded from Marek Čtrnáct's certificates; pick one,
  inspect it, open it in /play. Static JSON under `public/colors`, fetched one k-slice at a time
  (`_colors-client.tsx:62-78, 103-109`).
- Page is `force-static` and wrapped in `Suspense` (`page.tsx:8-17`).
- Structure (`_colors-client.tsx:199-303`), top to bottom / left to right:
  1. **Filter band** `<header>` full width (201-229): `WallBar` (`filter-wall.tsx:19-79`),
     `bg-surface-raised px-4 py-2.5`, a title row (h-8) plus a collapsible body (grid-rows 1fr/0fr) of
     `WallGroup`s that `flex-wrap` with `gap-x-8 gap-y-5` (68-71).
  2. Below, a row (231): **thumbnail grid** (`flex-1 overflow-y-auto p-4`, 232-257) and a **right detail
     pane** (`DetailPane`, fixed `w-[380px]`, `filter-wall.tsx:285`).
- No sidebar, no floating chrome over a full-page canvas, no immersive mode.

### 1.2 Controls by region

**Filter band title row** (`filter-wall.tsx:35-60`)
| Control | Type | Does | Where |
|---|---|---|---|
| Title "Colored tilings" + count "27,479 colorings" / "loading…" | button | collapses/expands the band | `filter-wall.tsx:36-45`, text from `_colors-client.tsx:203-204` |
| Chevron | icon button (14px icon, p-1) | same toggle, rotates -90° when closed | `filter-wall.tsx:46-58` |
| `top` actions slot | unused on /colors | | `filter-wall.tsx:59` |

**Filter band body** (`_colors-client.tsx:206-227`)
| Group | Control | Type | Options / behaviour | Where |
|---|---|---|---|---|
| Grid | OptionWall, 4 columns | segmented | Square, Triangle, Hexagon, Tri + squares; resets k, page, selection | 206-208, options 37-42, handler 186-191 |
| Colors · palette size | OptionWall | segmented | "2 colors", "3 colors" (derived from catalogues); resets k, page, selection | 209-211, options 44-47, handler 192-197 |
| k · colored vertex classes | OptionWall `fill={false}` | segmented, numeric | All, 1..6 (per grid × palette, eager + lazy ks); resets page + selection | 212-220, options 52-57, handler 179-183 |
| Overlays | ToggleRow of 3 ToggleCells | multi-toggle segmented, each with mono key badge | Edges (G), Lattice (P), Orbits (O). Edges also affects thumbnails; Lattice/Orbits only the detail preview | 221-227; `ToggleCell` `filter-wall.tsx:187-214` (`min-h-7`) |

**Thumbnail grid** (`_colors-client.tsx:232-257`)
| Control | Type | Does | Where |
|---|---|---|---|
| Loading line | text | "Loading the colored-tiling catalogue…" | 233 |
| Catalogue cards | grid of thumbnail buttons, `repeat(auto-fill, minmax(116px, 1fr))`, gap-3 | click selects; each card = square live `ColorsCanvas` (cells=7, not interactive) + id (mono 12px) + "N tiles · M edges" subtitle; selected card gets ink ring; hover border | 234-246; `CatalogueCard` `filter-wall.tsx:223-253`; grid class `:256` |
| Pagination | page buttons, prev/next chevrons, ellipses; range text at `@lg` container width; page-number input at `@2xl` | shown only when slice > 240; 240 per page | 247-256, `PAGE_SIZE` 60; `pagination.tsx` (buttons `h-7 w-7` ≈ 28px, input `h-8 w-12`) |

**Detail pane** (`DetailPane`, `filter-wall.tsx:262-316`, filled at `_colors-client.tsx:259-300`)
| Control | Type | Does | Where |
|---|---|---|---|
| Interactive preview | `ColorsCanvas` cells=11 `interactive`, fixed `h-80` (320px) framed box | pan / zoom / reset / orbit hover (see 1.4) | 261; `filter-wall.tsx:286-300` |
| Hint chip "drag to pan, wheel to zoom, double-click to reset" | floating chip bottom-left of preview, fades after first pointerdown | desktop wording | 264; `filter-wall.tsx:292-299` |
| Title (id) + subtitle "Square · 2 colors · k=1" | text | | 262-263; `filter-wall.tsx:301-304` |
| "Open in play" | full-width primary button link | `/play?tiling=<id>` with colorsEdges/Lattice/Vertices carried | 169-177, 265; `filter-wall.tsx:305` |
| Meta list | dt/dd pairs | k, palette, period lattice (T1/T2 or a,b,d + cell count), tile orbits, edge orbits | 266-288 |
| Colored vertex figures | mono list | one row per VC | 290-299 |

### 1.3 Modes / sub-views
- One view. Changing Grid or Colors resets k to All and clears selection; changing k clears selection.
  The selection defaults to the first card of the current page (132-135).
- URL: reads `?g= &c= &k=` once on mount (83-94), writes with `replaceState` (111-118).
- The band can be collapsed, which returns its height to the grid.

### 1.4 Canvas interactions (`components/colors/colors-canvas.tsx`)
- Pointer events (React props, 214-222): `pointerdown` captures and starts drag (137-141); `pointermove`
  pans with the drag (un-rotated delta, 142-151) or, without a button, updates `hoverRef` for the orbit
  highlight (152-160); `pointerup` releases (162-166); `pointerleave` clears hover (167-169).
  All gated on `interactive`, so thumbnails ignore input and act as plain buttons.
- Wheel (native, non-passive, 171-205): zoom toward cursor, scale 5..160 (28-30). Shift+wheel rotates only
  when `onRotationChange` is passed, which /colors does not (only /play does).
- **Double-click resets** pan, zoom and angle (207-212, 221).
- **Hover-only**: with Orbits on, the frame loop runs (124-134) and the orbit dots ease on hover. No touch
  equivalent.
- **No `touch-action: none`** on this canvas (class at 222 is `block w-full h-full cursor-grab`), and no
  `pointercancel`. On touch, a drag inside the preview will be claimed by the browser as scroll of the
  detail pane and the pan will stop.

### 1.5 Keyboard
- ←/→ step one card, ↑/↓ one row (row width read from computed grid columns), clamped, crosses pages and
  scrolls the selected card into view (`_colors-client.tsx:148-156`, `lib/hooks/useGridArrowNav.ts:25-65`).
- **G** Edges, **P** Lattice, **O** Orbits (`_colors-client.tsx:160-164`). Each has an on-screen toggle.

### 1.6 Related components in scope that are NOT rendered on /colors
- `components/colors/colors-thumbnail.tsx`: /library card + /play picker thumbnail (store-driven).
- `components/colors-play-canvas.tsx`: /play overlay, `absolute inset-0 z-10`, 24 cells, interactive, with
  Shift+wheel rotation wired to the store (28-37). Same `ColorsCanvas` gestures.
- `components/hyperbolic-colors-canvas.tsx`: /play Poincaré disk, WebGL per-pixel; the canvas has
  `pointerEvents: none` (296-299), so all input comes from /play's host canvas.
- `components/spherical-colors-canvas.tsx`: /play three.js solid, `ArcballControls` + release momentum,
  `touchAction = none` (66-69, makeArcball ~100). Arcball handles touch natively (one-finger rotate,
  pinch zoom).

### 1.7 Mobile risks at 390px
- The 380px `DetailPane` is `shrink-0`; at 390 it takes the row, the grid gets ~10px, and 240 live
  thumbnail canvases render in a single clipped column (measured: canvases at x=1, 114px wide, stacked to
  y=42,673). Needs a list/detail split (grid first, detail as a sheet or separate step).
- 240 mounted `<canvas>` per page is expensive on a phone GPU/memory; consider a smaller page size on phone.
- Filter band at 390 is ~370px tall before any content (Grid row of 4, Colors, k 7 cells, Overlays). The
  collapse chevron exists and should be the phone default after first choice.
- "Tri + squares" label is the widest Grid cell; at 4 columns in 358px it fits but tightly.
- Preview canvas lacks `touch-none`: pan fights scroll. No pinch zoom (wheel only), so zoom is impossible
  on touch. Double-tap may reset (dblclick) but is not reliable on mobile.
- Hint copy says "wheel" and "double-click".
- Orbit hover highlight has no touch equivalent (could become tap-to-highlight).
- Pagination hides its range text and page-jump input below container widths `@lg`/`@2xl`, so on phone
  only the 28px page buttons remain.
- Arrow-key card navigation has no touch counterpart (not needed if tap works, but prev/next in the detail
  sheet would replace it).

---

### 2. /aperiodic (Sub Rosa, Penrose, the hat, Chair, Sphinx, Half-hex, Pinwheel, Half-hex ×3, Multigrid)

Files: `app/(app)/aperiodic/page.tsx`, `_aperiodic-client.tsx`, `_views.ts`, `_controls.tsx`,
`_view-chrome.tsx`, `_subrosa-view.tsx`, `_patch-view.tsx`, `_multigrid-view.tsx`,
`lib/hooks/useAperiodicView.ts`.

### 2.1 Purpose and layout
- Nine non-periodic constructions, each its own engine, one mounted at a time (each owns a WebGL2
  context) (`_aperiodic-client.tsx:12-22, 59-78`). Switching views resets that view's parameters.
- Layout per view: `flex-1 min-h-0 flex` = **left sidebar** `AperiodicSidebar` (`_controls.tsx:21-33`,
  `PageSidebar` w-80, collapses in immersive) + **canvas area** `flex-1 relative`.
- Sidebar = a **pinned header** (view title block + Construction switcher; `px-3.5 pt-4 pb-5`, bottom
  hairline, `_controls.tsx:26`) over **one scroll region** of Sections, `gap-6`, fade at the bottom
  (`_controls.tsx:27-29`).
- Floating over canvas: `FullscreenToggle` top-right on every view; on Multigrid also `PanelTag` labels
  top-left of each panel (`_multigrid-view.tsx:511-517`, `ta-float absolute top-4 left-4`).

### 2.2 Controls: pinned header (identical across views) (`_aperiodic-client.tsx:40-57`)
| Control | Type | Does | Where |
|---|---|---|---|
| Title (h1) = active view label | text | | 43 |
| Line "group · blurb", truncated, full text in `title` | text, hover title | e.g. "Substitution · 2n-fold rhombic, any n" | 44-46 |
| Construction | `Segmented` cols=3, 9 options (3 full rows), each with `title` = group | switches view; writes `?view=` | 48-55; list `_views.ts:26-84` |

### 2.3 Controls per view

**Sub Rosa** (default; `_subrosa-view.tsx:320-407`)
| Section | Control | Type | Options / range | Where |
|---|---|---|---|---|
| Symmetry | Segmented, 7 columns | segmented numeric | 8, 10, 12, 14, 16, 18, 22 (2n for n in `[4,5,6,7,8,9,11]`, `lib/subrosa/engine.ts:519`); clamps Rhomb | 323-334 |
| Seed | Segmented, 2 | segmented | "Single tile", "Star" (title: "2n-fold star of thin rhombs") | 336-345 |
| Rhomb (only when Seed = Single) | Segmented, ≤3 cols | segmented | one per prototile angle pair, "36°/144°" style | 346-358 |
| Iteration | Slider "Depth" | slider | 0..maxDepth (≤6, budgeted to 1.5M tiles), readout "d · N tiles"; note "Deepest level within the tile budget" | 360-374 |
| View | ViewFooter | see below | | 376 |
| Details | Details list | read-only | Symmetry, Prototiles, Inflation S(n), Area factor, Edge word Σ | 378-388 |
| Substitution rule | one SVG per prototile (232x90, `w-full`) | read-only figure | "a°/b° rhomb · N tiles" | 390-394, `RuleDiagram` 411-439 |
- Canvas: 398-405, `touch-none`, `useAperiodicView` handlers; `FullscreenToggle` 404.
- Error path if the rule fails to build keeps the switcher reachable (305-315).

**Patch views: Penrose, The hat, Chair, Sphinx, Half-hex, Pinwheel, Half-hex ×3** (`_patch-view.tsx:484-546`)
| Section | Control | Type | Options / range | Where |
|---|---|---|---|---|
| Construction | Slider, label per view ("Deflation depth" / "Substitution level") | slider | Penrose 1-11 (def 6); Hat 1-6 (def 4); Chair, Sphinx, Half-hex 1-8 (def 5); Pinwheel 1-7 (def 4); Half-hex ×3 1-5 (def 3). Readout "L · N tiles" | 488-497; defs 142-267; caps 108-109, `lib/render/substitutionPatch.ts:46-69`, `hatPatch.ts:306` |
| | note at max | text | "Deepest level within the tile budget" | 498-500 |
| | Segmented, 2 options with sub-lines | segmented | "Fit patch · reframe on level" / "Keep view · hold pan and zoom" | 501-508 |
| Dissection (Half-hex ×3 only) | Segmented, 3 with sub-lines | segmented | "Rule A · one dissection", "Rule B · the other", "Random · per tile" | 511-513, options 252-256 |
| | Button (secondary, sm) | button | "New sample · seed N", only when Random | 514-518 |
| View | ViewFooter | see below | | 522 |
| Details | Details list | read-only | per-view facts (Construction, Prototiles, Inflation, Level/Depth, counts, etc.) | 524-526, facts 146-265 |
| Substitution rule | 1+ SVG panels (232x96, `w-full`) with caption | read-only figure | Hat: "H metatile → 4 hats", "H supertile → 25 hats" | 528-534, `RulePanel` 306-339 |
- Canvas: 537-544, same as Sub Rosa.

**Multigrid** (`_multigrid-view.tsx:403-505`)
| Section | Control | Type | Options / range | Where |
|---|---|---|---|---|
| Symmetry | Segmented, 7 columns | segmented numeric | 8..20 (2n, n in `[4..10]`, `lib/multigrid/engine.ts:198`); resets offsets | 406-413 |
| Offsets γⱼ | one row per grid family (4..10 rows): colored mono label "γ₀", bare `RangeInput` 0..1 step 0.001, value "0.12" | slider list; label color = family legend | 415-434 |
| | 3 buttons (secondary, sm) in a 3-col grid | buttons | Reset (canonical), Symmetric, Random (seeded, increments) | 435-445, `preset` 97-100 |
| View | ViewFooter with extra Checkbox first | checkbox | "Split view (grid + tiling)", default on | 448-467 (checkbox 461-466) |
| | Rotation slider here drives **both** panels | | | 449-457 |
| Details | Details list | read-only | Construction, Symmetry (Penrose / Ammann–Beenker notes), Prototiles, Rhombi (+ "capped") | 469-478 |
- Canvas area (481-503) is already responsive: `flex flex-col md:flex-row`. Below 768px the two panels
  stack vertically (grid on top, tiling below), above it they sit side by side.
  - Grid panel (split only, 482-492): base 2D canvas + `pointer-events-none` overlay canvas + tag
    "multigrid · z-space".
  - Tiling panel (493-502): GL canvas + overlay canvas + tag "dual tiling" + `FullscreenToggle`.
  - Each panel is an independent `useAperiodicView` (317-333): separate pan/zoom per panel.

**ViewFooter, shared by all nine** (`_view-chrome.tsx:49-94`)
| Control | Type | Range | Where |
|---|---|---|---|
| (view-specific children, e.g. Split view) | | | 63 |
| Rotation, with hint chip "Shift + scroll" (Kbd) | slider | 0..359°, step 1; eases like a wheel detent | 64-81 |
| Tile outlines | slider | 0..3 px, step 0.25, 0 reads "off"; default 1.5 | 82-91, `STROKE_WIDTH` 23 |

### 2.4 Modes / sub-views
- Nine views via the Construction switcher; `?view=` in URL (`_aperiodic-client.tsx:27-35`), only the view,
  not its parameters.
- Sub Rosa: Rhomb section appears only for Single seed.
- Patch views: framing mode Fit/Keep decides whether a level change refits or keeps the camera
  (`_patch-view.tsx:469-479`). A new construction always refits.
- Multigrid: Split view on/off changes the canvas area from one to two panels (and refits both, 378-384).
- Immersive (F / button): Nav and sidebar slide shut; canvas fills window.

### 2.5 Canvas interactions
- All views: `useAperiodicView` (section 0): drag pan (pointer), wheel zoom to cursor, **Shift+wheel
  rotate**, **right-click reset**, context menu suppressed. Canvases carry `touch-none`
  (`_subrosa-view.tsx:401`, `_patch-view.tsx:540`, `_multigrid-view.tsx:486, 496`).
- Multigrid **hover duality link** (hover-only): hovering a rhombus on the tiling panel (only when split)
  or a crossing on the grid panel (12px tolerance) highlights the pair in orange on both panels
  (`pickTiling` 294-301, `pickGrid` 302-315, `onHover` wiring 323 and 331, overlays 130-184). Leaving the
  canvas clears it. There is no click/tap version.
- Multigrid Shift+wheel rotates only the panel under the cursor (each view has its own wheel listener);
  the sidebar slider rotates both.
- Dev hooks: `window.__subrosa` (`_subrosa-view.tsx:294-302`), `window.__multigrid` (`_multigrid-view.tsx:391-399`).

### 2.6 Keyboard
- **F** immersive, **Esc** exit (`_aperiodic-client.tsx:37`). No other keys.

### 2.7 Mobile risks at 390px
- Sidebar is a fixed 320px column: measured canvas width **70px** (sub rosa, patch views) and two 70x398
  stacked panels for multigrid. The canvas needs to become the main surface with controls in a sheet.
- The pinned header (title + 3x3 switcher) is ~190px tall and stays pinned above the scroll region.
- Symmetry rows are 7 cells in one row (~42px each at 300px); tight but workable; Multigrid offsets can be
  10 slider rows.
- Zoom, rotate and reset have no touch gesture: wheel, Shift+wheel and right-click only. Rotation has a
  slider; zoom and reset have **no on-screen control at all**. Phone needs pinch zoom (and ideally
  two-finger rotate) plus a visible reset/home button.
- Multigrid duality link is hover-only; needs tap-to-pick on touch.
- "Shift + scroll" hint chip is meaningless on phone.
- `title` tooltips on the switcher cells (group name) and the truncated blurb are unreachable.
- Substitution rule SVGs are `w-full` of a 232 viewBox, so they scale; fine in a sheet.
- `FullscreenToggle` sits top-right at 32px; in multigrid stacked mode it is on the lower (tiling) panel.
- `PanelTag` labels at `top-4 left-4` overlap content on a narrow panel ("multigrid · z-space" wrapped to 3
  lines at 70px).

---

### 3. /isohedral (IH1 to IH93)

Files: `app/(app)/isohedral/page.tsx`, `_isohedral-client.tsx`, `_controls.tsx`, `_prototile.tsx`,
`lib/hooks/useParametricTilingCanvas.ts`, `components/inversive-controls.tsx`,
`components/inversive-canvas.tsx`, `components/tiling-info.tsx`.

### 3.1 Purpose and layout
- Grünbaum & Shephard's 93 isohedral types, 81 parameterized through Kaplan's Tactile, 12 "marked" types
  built from asymmetric marks. Unbounded periodic tiling on the flat WebGL renderer.
- Layout: **left sidebar** `IsohedralSidebar` (`_controls.tsx:24-94`, PageSidebar w-80, collapses in
  immersive) + **canvas area** (`_isohedral-client.tsx:540-560`).
- Sidebar has **four stacked regions** divided by hairlines (`_controls.tsx:61-90`):
  1. header (type identity), 2. filters, 3. **type grid in its own capped scroll box**
     (`maxHeight` 153px = four rows, `TYPE_BOX_PX` 21, 75-86) with top/bottom inner shadows when more rows
     are past the edge (51-55, 84-85), 4. **controls scroll region** `flex-1` with fade (88-90).
- Floating over the canvas: `TilingInfo` button top-left (`absolute top-4 left-4 z-20`, 553-555),
  `FullscreenToggle` top-right (559). With the lens on, `InversiveCanvas` is layered over the base canvas
  with `pointer-events: none` (549-551; `inversive-canvas.tsx:624-625`); the base canvas stays the input.

### 3.2 Controls by region

**Header** (`_isohedral-client.tsx:302-322`)
| Control | Type | Does | Where |
|---|---|---|---|
| Type label (h2), "marked" suffix for the 12 | text | | 304-307 |
| Mono line: "N vertices · N aspects · JJJ" (or wallpaper · Laves · tile group · aspects for marked) | text | | 308-311 |
| Edge-shape letters (e.g. "JJJ"), dotted underline, `cursor-help`, `title` lists "a · J: free, any path" per edge | hover-only native tooltip | explains edge kinds | 312-319, notes 81-86 |

**Filters** (`_isohedral-client.tsx:332-343`)
| Control | Type | Options | Where |
|---|---|---|---|
| Parameters | Segmented cols=5 in a `4.5rem / 1fr` row | any, 0, 1, 2, 3+ | 340, values 126 |
| Vertices | Segmented cols=5 | any, 3, 4, 5, 6 | 341, values 127 |

**Type grid** (`_isohedral-client.tsx:401-407`, header row `_controls.tsx:64-70`)
| Control | Type | Does | Where |
|---|---|---|---|
| "Type" label + count "93 types" / "12 of 93" | text | | `_controls.tsx:65-70` |
| Type cells | Segmented cols=4 `fill={false}`, up to 93 cells, label "IH01", sub "4p" (params) or the tile group for marked; `title` per cell with full description | selects type; resets params + edges; snaps camera home | 286-300, 403, `selectType` 162-168 |
| Empty state | text | "No type matches both filters." | 405 |

**Controls region, 81 parameterized types** (`_isohedral-client.tsx:415-489`)
| Section | Control | Type | Range | Where |
|---|---|---|---|---|
| Parameters · N | one Slider per parameter "v0".."vn" | slider | 0..2 step 0.001, readout 3 decimals | 417-435 |
| Parameters · 0 | note | text | "Fixed. This type constrains its vertices completely…" | 437-442 |
| Prototile | `PrototileInspector` SVG 94x94 in a bordered box | **read-only** figure: tile fill, dashed straight polygon, edge letters (uppercase = reversed), S-edge ring, U-edge mirror tick, vertex dots; degenerate note | 326-330, 445; `_prototile.tsx:45-242` |
| Edges | one Slider per distinct edge shape, label "a · J" with hint text ("free, any path" etc.) | slider | `BULGE` range; disabled and reads "straight" for kind I | 447-469 |
| | Randomize / Reset | 2-cell segmented button row with icons (Shuffle, RotateCcw) | Randomize edge shapes; Reset params + edges | 470-487 |

**Controls region, 12 marked types** (`MarkedControls`, 574-650; mounted at 409-413)
| Section | Control | Type | Where |
|---|---|---|---|
| Prototile | same inspector | read-only | 411 |
| Incidence symbol | dl: Laves net, Tile symbol, Adjacency, Tile group, Group, Aspects + citation | read-only | 590-612 |
| Marks | prose paragraphs + Kaplan quote | read-only | 614-627 |
| Tile | Slider (rectangles' ratio, `shape.param` range, step 0.005) or "Rigid…" note | slider | 629-647 |

**View section, all types** (`_isohedral-client.tsx:495-537`)
| Control | Type | Range / options | Where |
|---|---|---|---|
| Rotation, hint "Shift + scroll" | slider | 0..359° | 496-511 |
| Tile outlines | slider | 0..3 px step 0.25, 0 = off | 512-521 |
| Inversive view, keycap X | checkbox | toggles the conformal lens (store `inversive`, shared with /play) | 525-531 |
| Lens controls (revealed under the checkbox, `pl-7`) | `InversiveControls` | see 3.3 | 532-536 |

**`InversiveControls`** (`components/inversive-controls.tsx:80-155`), also used on /pentagons and /play
| Control | Type | Shown when | Where |
|---|---|---|---|
| Inversion / Möbius / Spiral | row of 3 buttons (primary = active) | always | 87-95 |
| Lens radius (or "Pole separation" in 2-center spiral) | slider 0.1..1 | not single-center spiral | 98-108 |
| Spiral twist | slider 0..180° | Möbius | 109-120 |
| 1 center / 2 centers | 2 buttons | Spiral | 123-130 |
| Arm a, Arm b | sliders -6..6 step 1 | Spiral | 131-148 |
| Velocity pad | 128px circular SVG pad, drag knob to hold zoom/rotation rate; knob persists | Spiral | 150; `spiral-velocity-pad.tsx`; `components/ui/velocity-pad.tsx:85-107` (pointer events, capture, `touch-none`) |

**Floating over canvas**
| Control | Type | Does | Where |
|---|---|---|---|
| Info (i) | icon button; **hover opens** the panel (`onMouseEnter/Leave`), click pins it | panel `absolute top-10 min-w-56 max-w-[340px]` lists group, isohedral parameterization rows (Parameters, Tiling vertices, Aspects, Edge shapes, Edge word, Colours, Unit cell, degenerate) | 553-555; `tiling-info.tsx:128-157, 354-383` |
| Fullscreen | icon button top-right | immersive | 559 |

### 3.3 Modes / sub-views
- Parameterized (81) vs marked (12): the controls region swaps between Parameters/Prototile/Edges and
  Prototile/Incidence/Marks/Tile (409-490).
- Lens on/off: second canvas overlays; tessellation adapts to lens magnification (118-124, 248-254).
- Immersive: sidebar collapses (396), Nav collapses.
- URL `?type=IHnn`, read once, written debounced 400ms (146, 183-189).
- A type change snaps the camera home; slider moves keep framing (`framingKey` 271, comment 256-264).

### 3.4 Canvas interactions
- `useParametricTilingCanvas` (`lib/hooks/useParametricTilingCanvas.ts:190`) wraps `useAperiodicView` with
  `fill: 1`: drag pan, wheel zoom, **Shift+wheel rotate**, **right-click reset**. Canvas `touch-none`
  (543). No pinch, no tap action on tiles.
- Velocity pad is a pointer-driven drag control (works with touch: `touch-none`, capture).

### 3.5 Keyboard
- **F** / **Esc** immersive (178); **X** toggles the lens (`useInversiveShortcut`, 201;
  `inversive-controls.tsx:30-46`). No arrow navigation over the type grid on this page.

### 3.6 Mobile risks at 390px
- Measured canvas width 70px with the 320px sidebar.
- The sidebar stacks four regions; on a phone the type grid box (153px, own scroll) inside a scroll region
  inside a sheet is a nested-scroll trap. 93 cells at 4 per row = 24 rows.
- Type-cell descriptions, the edge-letter explanation, and cell titles are `title`-only; unreachable.
- `TilingInfo` opens on hover; on touch the click-to-pin path works (tap = pin), so it is usable, but the
  panel is `min-w-56` (224px) to 340px and positioned `left-0 top-10` from a top-left button; fits 390
  only barely and may cover most of the canvas.
- Zoom and reset have no touch path or on-screen control (as /aperiodic).
- Parameter sliders are 14px-tall tracks with step 0.001 over 0..2: fine-grained drags are hard on touch.
- The prototile inspector is deliberately capped at 94px for the desktop sidebar (`_prototile.tsx:31-37`);
  a phone sheet could afford larger, but it must stay visible while the edge sliders move (the design
  reason it sits above them).
- Lens controls nest under the checkbox with `pl-7` indent; in a narrow sheet the velocity pad (128px) and
  button rows fit.

---

### 4. /pentagons (the 15 convex pentagon types)

Files: `app/(app)/pentagons/page.tsx`, `_pentagons-client.tsx`, `_controls.tsx`, `_prototile.tsx`.

### 4.1 Purpose and layout
- Kershner et al.'s 15 families; each is a parameter space of 0..5 degrees of freedom. Same flat renderer
  and lens as /isohedral.
- Layout: **left sidebar** `PentagonSidebar` (`_controls.tsx:16-43`, w-80, `ta-wall` with 1px gaps,
  collapses in immersive) + **canvas area** (`_pentagons-client.tsx:407-423`).
- Sidebar regions: header (type identity), **pinned type grid** (not scrolled), then **one scroll region**
  for Prototile, Parameters, View (`_controls.tsx:33-40`).
- Floating: `TilingInfo` top-left (418-420), `FullscreenToggle` top-right (422); lens overlay canvas when on
  (416).

### 4.2 Controls by region

**Header** (`_pentagons-client.tsx:233-247`)
| Control | Type | Where |
|---|---|---|
| Type label ("Type 1") | text | 235 |
| "Reinhardt 1918 · 2 tiles/unit" | text | 236-238 |
| Wallpaper group chips (p2, cmm, …) | read-only chips, wrap | 239-245 |

**Family grid** (`_pentagons-client.tsx:297-304`)
| Control | Type | Does | Where |
|---|---|---|---|
| 15 cells, Segmented cols=5 (3 full rows); label = number, sub = degrees of freedom or a lock icon for rigid (14, 15); dimmed when no assembly; `title` = label · discoverer · dof · tiles/unit · constraints | segmented grid | selects type, resets angles/sides, snaps camera home | 216-231, 298-303, `selectType` 86-93 |

**Scroll region**
| Section | Control | Type | Range / options | Where |
|---|---|---|---|---|
| Prototile | `PrototileInspector`: SVG up to 280x170 (`w-full`, max-width 280) with side letters a..e and corner letters A..E, then constraint chips "B + C = 180°  100.0 + 80.0 = 180.0°" | **read-only** figure + live readouts | 307-317; `_prototile.tsx:28-139` |
| Parameters | `ParamRow` per angle parameter (label = key e.g. "A", readout "120°") | slider row: 36px line, `3.75rem / 1fr / 3.5rem` | per-type min/max/step | 319-334, `ParamRow` 429-455 |
| | `ParamRow` per side parameter (e.g. "b/a", 3 decimals) | slider row | per-type | 335-347 |
| | Reset | ghost button with RotateCcw | resets angles + sides | 349 |
| | Invalid-tuple note | text | "No pentagon here: <reason>. The tiling shown is the last valid one." | 350-354 |
| Parameters (rigid) | note | text | "Rigid. This type's conditions fix the pentagon completely, up to size." | 357-361 |
| View | Rotation ParamRow; label `title` "Shift + scroll over the canvas also rotates" | slider | 0..359° | 369-379 |
| | Outlines ParamRow | slider | 0..3 px step 0.25, 0 = off | 380-389 |
| | Inversive view, keycap X | checkbox | lens on/off | 391-397 |
| | `InversiveControls` revealed, `pl-7` | see /isohedral 3.2 | | 398-402 |

### 4.3 Modes / sub-views
- Rigid vs parametric types (Parameters section swaps to a note).
- Invalid parameter tuple: canvas keeps the last valid cell, note shown (174-179, 350-354).
- Lens on/off; immersive.
- URL `?type=N` adopted after hydration (153-159), written debounced 400ms (164-170).

### 4.4 Canvas interactions
- Same as /isohedral: `useParametricTilingCanvas` → `useAperiodicView`. Drag pan, wheel zoom, Shift+wheel
  rotate, right-click reset, `touch-none` (410). No tile picking, no pinch.

### 4.5 Keyboard
- **←/→** previous/next type (wraps), **↑/↓** move one row in the 5-column grid (wraps by column)
  (`_pentagons-client.tsx:55-64, 111-144`).
- **F** / **Esc** immersive (149); **X** lens (186).

### 4.6 Mobile risks at 390px
- Canvas 70px wide with the sidebar.
- The type grid is pinned (not scrolled); with header + grid the scroll region starts ~330px down. On a
  phone the grid should be a compact picker (5x3 fits a 358px row at ~70px per cell).
- Rigid-type lock icon and dof numbers are 11px; type descriptions are `title`-only.
- The Rotation hint lives only in a `title` on the label.
- ParamRow value column is 3.5rem; track gets ~160px in a 320px panel; fine in a full-width sheet, but the
  14px track height remains the finger problem.
- Zoom and reset have no touch path.
- `TilingInfo` panel (pentagon section: Discovered, Freedom, angles, sides, status) same sizing issue as
  /isohedral.

### 4.7 Related /play components in scope (not rendered on /pentagons or /isohedral)
- `components/pentagon-edges-controls.tsx:43-80` and `components/isohedral-edges-controls.tsx:65-134`:
  **floating panels over the /play canvas**, `absolute bottom-3 left-3 z-20 ta-float p-3 text-xs`, using
  bare native `<input type=range>` rows (label `w-14`, value `w-12`):
  - Pentagon edges: A 70-170, B 25-155, D 60-160, "side b" 0.1-3, "c : d : e" 0-1 (19-25); readout
    "C = … · E = … (pinned)" or error; "Underlying grid" checkbox, keycap G.
  - Isohedral edges: header IH label + "reset" text link (67-72); v0..vn 0-2; "bow a.." per edge shape
    (only on bowable boards, 96-109); class-length readout or error; "Underlying tiling" checkbox, keycap G.
  - Mobile risk: a bottom-left floating panel of up to ~10 slider rows over a phone canvas covers most of it.
- `components/pentagon-edges-canvas.tsx`, `components/isohedral-edges-canvas.tsx`: render through
  `ParametricEdgesCanvas` → `FreedrawCanvas` interactive (`components/freedraw/parametric-edges-view.tsx:45-104`;
  handlers `freedraw-canvas.tsx:224-327`): drag pan, wheel zoom, Shift+wheel rotate (store `rotation`).
- `*-edges-thumbnail.tsx`: static 220px 2D thumbnails for /library and the /play picker.
- `components/prototile-card.tsx` is used by /theory/tiles, not by these pages; it has a hover-only
  screenshot button (`opacity-0 group-hover:opacity-100`, line 63). Neither prototile inspector on
  /isohedral or /pentagons is editable: there are **no draggable vertex handles**; all shape editing is
  through sliders.

---

### 5. /automata (cellular automata on catalogue tilings)

Files: `app/(app)/automata/page.tsx`, `_automata-client.tsx`, `components/automata/automata-sidebar.tsx`,
`automata-info.tsx`, `automata-transport.tsx`, `automata-canvas.tsx`, `surface-view.tsx`,
`components/sidebar/catalogue-list-panel.tsx` (shared /play picker), `components/ui/floating-toolbar.tsx`.

### 5.1 Purpose and layout
- Life-like automata on any Euclidean catalogue tiling (loaded from the reference atlas, filtered to
  euclidean + tilings shelves, 52-53), on the plane or one of five flat surfaces.
- Layout (`_automata-client.tsx:156-182`): **left sidebar** `PageSidebar` w-80 (no immersive collapse)
  containing `AutomataSidebar`; **canvas area** `flex-1 relative overflow-hidden` with either the flat
  `AutomataCanvas` or the 3D `SurfaceView` (170-174); **floating transport bar** bottom-center (175);
  empty-state text "Pick a tiling to start." (176-180).
- Sidebar (`automata-sidebar.tsx:139-468`): **pinned info zone** (`AutomataInfo`) over **Tabs** (Tiling,
  Rule, Board) with keycaps; each tab body scrolls on its own and stays mounted (`keepMounted`, 151).
- All state lives in the `useAutomata` store (`lib/stores/automata.ts`); **no URL state**.

### 5.2 Controls by region

**Info zone** (`automata-info.tsx:43-101`)
| Control | Type | Where |
|---|---|---|
| NavHeader title "4.4.4.4 · Square" (uniform name where known) + family/k/id line with `title`s | read-only | 55-57; `components/sidebar/nav-header.tsx` |
| Stats: Gen, Alive, Density, Churn, Nbrs, Tiles/cell, Board, Rate (2-col grid, some with `title` explanations) | read-only live readouts | 59-92 |
| Extinct note | text, conditional | 93-97 |

**Tab strip** (`automata-sidebar.tsx:27-32, 151`; `components/ui/tabs.tsx`)
| Control | Type | Where |
|---|---|---|
| Tiling (T), Rule (U), Board (B) | segmented tabs with Kbd badges | 27-32, 151 |

**Tiling tab** (`automata-sidebar.tsx:159-164`)
| Control | Type | Does | Where |
|---|---|---|---|
| `CatalogueListPanel`: collapsible tree (class → grid → k) with sticky headers, "Collapse all" strip, row counts, virtualized thumbnail tiles | tree + thumbnail list | click a tiling to load it | `catalogue-list-panel.tsx` (collapse-all 504-510, sticky rows 566-586) |

**Rule tab** (`automata-sidebar.tsx:166-279`)
| Control | Type | Options / range | Where |
|---|---|---|---|
| Rule string | text Input | e.g. "B3/S23" | 167-173 |
| Neighbourhood + InfoDot | OptionWall 2 cols | Shared edge / Edge or corner | 175-202 |
| Range | slider | 1..6, reads "immediate" / "N steps" | 204-212 |
| Counting + InfoDot | OptionWall 3 cols | Absolute / Normalized / Per shape | 214-237 |
| Per-shape rule inputs (Per shape only) | one text Input per side count "3-gon", "4-gon"… | | 239-251 |
| Preset rules, grouped (`RULE_GROUPS`) | full-width list buttons "Name  B3/S23", `title` = description, active highlighted | sets rule string | 253-278 |

**Board tab** (`automata-sidebar.tsx:281-462`)
| Control | Type | Options / range | Shown when | Where |
|---|---|---|---|---|
| Surface + InfoDot | OptionWall 1 column (stacked) | Plane, Cylinder, Torus, Möbius band, Klein bottle; flipped ones disabled "· needs a glide" on chiral tilings | always | 282-317 |
| Period along v₁ | slider | 3..64 | surface closes v₁ | 319-321 |
| Period along v₂ | slider | 3..64 | surface closes v₂ | 322-324 |
| Soup patch | slider | 4..96 step 2, "N×N cells" | an open direction exists | 325-335 |
| Draw it as + InfoDot | OptionWall 2 | Flat / "3D torus" etc. | non-plane | 337-350 |
| Klein shape + InfoDot | OptionWall 2 | Bottle / Bagel | Klein + 3D | 352-388 |
| Soup density, InfoDot hint (seed) | slider | 2%..90% step 2% | always | 390-399 |
| Tile outlines + InfoDot | checkbox | | always | 405-416 |
| Tint dead cells by tile + InfoDot | checkbox | | always | 417-428 |
| Board lattice + InfoDot | checkbox | | non-plane | 431-444 |
| Gluing arrows + InfoDot | checkbox | | non-plane | 445-458 |

**Transport bar** (`automata-transport.tsx:42-97`; `FloatingToolbar` `absolute bottom-4 left-1/2 -translate-x-1/2 z-30 rounded-xl`, overridden to `bottom-6`, `floating-toolbar.tsx:11-16`)
| Control | Type | Shortcut | Where |
|---|---|---|---|
| Previous tiling | icon button 32x32, tooltip | ← | 44-46 |
| Next tiling | icon button | → | 47-49 |
| Random tiling | icon button | R | 50-52 |
| Run / Pause | primary button with icon + label | Space | 55-58 |
| Step one generation | icon button | . | 59-61 |
| New random soup | icon button | N | 62-64 |
| Speed | RangeInput `w-28` over a 13-step ladder 1..240, readout "12 gen/s" (`w-[3.75rem]`) | none | 66-78, ladder 18 |
| "How to drive the board" | InfoDot (hover tooltip) with gesture + key help | none | 82-95 |
| Dividers | | | 53, 65, 81 |
- Buttons are `h-8` (32px), icon buttons `w-8` (`floating-toolbar.tsx:68-72`). Every button's name lives in
  a hover Tooltip; the icon buttons have `aria-label` only.

### 5.3 Modes / sub-views
- Surface: plane / cylinder / torus / Möbius / Klein changes which Board sliders appear (319-335) and
  enables the 3D view option. Unavailable flipped surfaces fall back automatically
  (`_automata-client.tsx:92-95`).
- View: **Flat** (`AutomataCanvas`, WebGL + overlay canvas) vs **3D** (`SurfaceView`, three.js) when
  `view === "surface3d"` and topology is not plane (84, 170-174).
- Counting: Per shape reveals per-side rule inputs.
- Loading state in the Tiling tab (160-162) and the canvas empty state.

### 5.4 Canvas interactions
- **Flat** (`automata-canvas.tsx`), native listeners (225-229):
  - `pointerdown`: middle/right ignored (148); **Shift+click toggles the cell under the pointer** (paint,
    150-153, `paintAt` 186-223); otherwise start pan with capture (154-155).
  - `pointermove` pans (157-164); `pointerup` / `pointercancel` end (165-168).
  - `wheel` (non-passive): zoom toward cursor (169-183).
  - `contextmenu` prevented (406). Canvas `touch-none` (405); overlay canvas `pointer-events-none` (409).
  - Single shared drag state: a second finger resets `lastX/Y`, so two-finger touch produces a jumpy pan.
  - **No rotate, no reset gesture** (camera resets only when the board plan changes, 136-139). No pinch.
- **3D** (`surface-view.tsx:452-454`): three.js `ArcballControls`, `enablePan = false`, gizmos hidden. Drag
  rotates, wheel zooms; Arcball supports touch (one-finger rotate, pinch zoom). Canvas `touch-none` (505).

### 5.5 Keyboard
- Page (`_automata-client.tsx:119-154`): **Space** run/pause, **.** step, **N** reseed, **R** random tiling,
  **←/→** previous/next tiling (wraps).
- Sidebar (`automata-sidebar.tsx:121-132`): **T** / **U** / **B** switch tabs.
- No F/immersive on this page.

### 5.6 Mobile risks at 390px
- Canvas 70px wide with the fixed sidebar; the transport bar is centered on that 70px strip, so almost all
  of it is off-screen (screenshot shows only the reseed icon). The bar is ~560px wide at desktop, wider
  than a 390 screen by itself: it needs a phone layout (wrap, or keep Run/Step/Reseed and move prev/next,
  random and speed elsewhere).
- **Painting a cell requires Shift**: impossible on touch. Needs a paint mode or tap-to-toggle (with pan on
  drag).
- No pinch zoom on the flat board; no reset button.
- All gesture help and every control explanation is in InfoDots / tooltips: unreachable on touch. The
  Board tab has seven InfoDots carrying real content (topology blurbs, the Klein caveat).
- Speed slider: 14px track, 13 detents over 112px.
- The Tiling tab is the /play picker; its phone treatment should match whatever /play gets.
- Stats grid is compact (22px rows); fine to keep, but it competes with the canvas for vertical space.
- Rule text inputs will raise the soft keyboard; the typing guard already stops Space/N/R from firing
  while typing.

---

### 6. Cross-route checklist for the phone layout

What each route needs from a mobile shell, derived from the above:

| Need | /colors | /aperiodic | /isohedral | /pentagons | /automata |
|---|---|---|---|---|---|
| Canvas as primary surface, controls in a sheet/drawer | preview only (list/detail) | yes | yes | yes | yes |
| Pinch zoom (currently wheel only) | preview | yes | yes | yes | flat view (3D already has it) |
| Visible reset/home (currently right-click or dblclick) | dblclick exists | yes | yes | yes | none today |
| Rotation without Shift+wheel | n/a on /colors | slider exists | slider exists | slider exists | none |
| Hover-only features to replace | orbit hover | multigrid duality link | TilingInfo (tap pins), `title`s | TilingInfo, `title`s | InfoDots, tooltips, Shift+click paint |
| Keyboard-only features | none (all have buttons/taps) | none | none | none | none (transport covers them) |
| Immersive/fullscreen | no | F + button | F + button | F + button | no |
| URL state to preserve | g, c, k | view | type | type | none |
| Nested scroll regions | grid + detail pane | header pinned + 1 region | 4 regions incl. capped type box | pinned grid + 1 region | tab bodies |
| Floating chrome over canvas | hint chip | Fullscreen, panel tags | Info, Fullscreen | Info, Fullscreen | transport bar |

Touch-event status: every canvas uses Pointer Events (never mouse- or touch-specific events), so taps and
one-finger drags already arrive. What is missing is multi-pointer handling (pinch/rotate), `pointercancel`
on the shared hooks, and `touch-action: none` on `ColorsCanvas`.
