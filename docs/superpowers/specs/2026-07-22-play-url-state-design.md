# /play URL state + share button

Design, 2026-07-22. AL directive: "copying the link to a page should carry all the information linked
to that", plus an icon-only share button beside the /play fullscreen toggle.

## Scope

/play only. **The library is already done** — `reference-shelf.tsx` round-trips every filter field plus
`page`, `size` and `cols` through the query string (`parseViewState` / `serializeView`), mirrors it with
`replaceState` on each change, and ships a "Copy link" button in the header. No changes there.

/play today reads `?tiling=` and `?source=` at mount and writes nothing back. Two consequences: options
never survive a reload, and the `tiling` key goes stale the moment you press `R` or an arrow key — copy
the URL after browsing and you hand someone the tiling you *arrived* at, not the one on screen.

## Decisions

**Options travel, the camera does not.** Zoom, pan and rotation stay out of the URL (AL, 2026-07-22).
`controls` is mutated in place every frame by the draw loops precisely to avoid React (`configuration.ts`
lines 16–21), so mirroring it live is not available anyway, and a snapshot-at-share path would have meant
two mechanisms for one feature. A shared link reproduces the settings at the default framing.

**An explicit whitelist, not an auto-diff against store defaults.** Each shareable field gets a row: URL
key, store field, codec. A denylist-based auto-diff would enrol every future store field into a public URL
contract with its internal name as the key, and would accept whatever a hand-edited link carried. The
whitelist validates enums against their value list and clamps numbers to their slider range, matching how
`parseViewState` already guards the library ("a hand-edited or stale link can carry any string").

**The URL is authoritative, including when it is bare.** Mount applies the whole whitelist — the URL's
value where present, the store default where absent. So `/play` with no params always means the default
view, and a recipient with a warm store from an earlier visit sees the same thing as one opening it cold.
The cost: navigating away to `/theory` and back via the nav link resets your options (browser back keeps
them, since the mirrored URL is still in history). Predictability wins; a URL that only sometimes
determines the view is not a shareable URL.

## The 39 fields

Derived from the Options tab, not from the store: if a control exists the field travels, otherwise it
does not. That excludes `isDual`, `showDualConnections`, `showConstructionPoints` and `showWallpaperGroup`
(no UI anywhere in the app sets any of them), `circlePacking` (UI commented out, options-tab.tsx 159–167),
`isTilingRegularOnly` (read as a condition, never set), `euclideanShader` (dev parity flag), `debugView`,
and the transient signals `takeScreenshot`, `screenshotButtonHover`, `exportGraph`,
`exportGraphButtonHover`, `hyperbolicClick`, `hyperbolicResetView`, `spiralVel`, `spiralDrift`.

`hyperbolic` and `spherical` are derived from the selection, not serialized. Nor is the geometry toggle —
`_play-client.tsx` 235–239 already syncs it from `geometryOf(selected)`, so `tiling` implies it.
`immersive` is a viewing mode, not part of the artifact.

Keys are prefixed by group: bare for global, `i*` Islamic, `s*` spherical, `v*` inversive.

| key | field | codec | default |
| --- | --- | --- | --- |
| `tiling` | selection `canonicalKey` | string | first entry |
| `alpha` | `familyAlphas.values` | comma-joined numbers | family default |
| `fill` | `showPolygonFill` | bool | `true` |
| `lw` | `lineWidth` | num 0–5 | 1 |
| `hue` | `hueOffset` | num 0–359 | 0 |
| `rot` | `rotation` | num 0–360 | 0 |
| `pts` | `showPolygonPoints` | bool | `false` |
| `orb` | `showVertexOrbits` | bool | `false` |
| `trans` | `tilingTransition` | bool | `false` |
| `sym` | `showSymmetryElements` | bool | `false` |
| `dom` | `showFundamentalDomain` | bool | `false` |
| `hline` | `hyperbolicLineMode` | enum `geometry` \| `constant` | `geometry` |
| `i` | `isIslamic` | bool | `false` |
| `istyle` | `islamicStyle` | enum `plain` \| `interlace` \| `outline` \| `emboss` \| `checkerboard` | `plain` |
| `iang` | `islamicAngle` | num 0–90 | 45 |
| `iband` | `islamicBandWidth` | num 0.05–0.6 | 0.25 |
| `ibord` | `islamicOutlineWidth` | num 0–0.5 | 0.015 |
| `iflip` | `islamicChirality` | bool | `false` |
| `ika` | `islamicCheckerHueA` | num 0–359 | 45 |
| `ikb` | `islamicCheckerHueB` | num 0–359 | 200 |
| `ifb` | `islamicFillHueB` | num 0–359 | 45 |
| `ifc` | `islamicFillHueC` | num 0–359 | 200 |
| `ioff` | `islamicEdgeOffset` | num 0–100 | 0 |
| `irays` | `islamicIntersectionCount` | int 1–3 | 1 |
| `ianim` | `islamicAnimate` | bool | `false` |
| `swire` | `sphericalWireframe` | bool | `false` |
| `sreal` | `sphericalRealistic` | bool | `false` |
| `ssec` | `sphericalWireSection` | enum `tube` \| `rect` | `tube` |
| `sthk` | `sphericalWireThickness` | num 0.005–0.15 | 0.025 |
| `shgt` | `sphericalWireHeight` | num 0.005–0.15 | 0.025 |
| `sbev` | `sphericalWireBevel` | num 0–1 | 0.25 |
| `spoly` | `sphericalPolyhedron` | bool | `false` |
| `sortho` | `sphericalOrthographic` | bool | `false` |
| `sweave` | `sphericalWeaveFlat` | bool | `false` |
| `v` | `inversive` | bool | `false` |
| `vmode` | `inversiveMode` | enum `inversion` \| `mobius` \| `spiral` | `inversion` |
| `vrad` | `inversiveRadiusFrac` | num 0.1–1 | 0.42 |
| `vtwist` | `mobiusTwist` | num 0–180 | 60 |
| `vdouble` | `spiralDouble` | bool | `false` |
| `varma` | `spiralArmA` | int −6–6 | 1 |
| `varmb` | `spiralArmB` | int −6–6 | 0 |

Only non-defaults are emitted, so a default view serializes to a bare `/play`. Booleans emit their literal
value (`fill=0`, `i=1`) rather than presence-as-true, because `showPolygonFill` defaults to `true` and
needs a way to say "off".

Example: `/play?tiling=ctrnact-04_123&i=1&istyle=interlace&iang=30&hue=210`

## Module

New `lib/services/playUrlState.ts`, holding the `PLAY_PARAMS` table and an inverse pair:

- `parsePlayState(sp: URLSearchParams): { config: Partial<ConfigurationState>; alphas: number[] | null; tiling: string | null }`
  — every whitelisted field, URL value where valid, store default otherwise. Invalid values are dropped
  to the default, never injected.
- `serializePlayState(config, alphas, tiling): string` — non-defaults only.

Add a field to one, add it to the other — the same contract the shelf's pair carries. Extracted to its own
module rather than inlined: `_play-client.tsx` is already 560 lines and this adds ~120 more. The shelf's
inline version is working and stays untouched.

## Wiring in `_play-client.tsx`

Parse once at mount (`useState(() => parsePlayState(searchParams))`), matching the shelf. After that the
URL is write-only — never re-read, so browser back/forward inside the page is not a state source.

Apply in a `useLayoutEffect`, which is guaranteed to run before the plain `useEffect` that installs the
mirror; a `hydrated` ref guards the mirror regardless. Applying via `useConfiguration.getState().set(...)`
keeps it out of render. The existing selection effects then run normally on top: a link carrying `i=1` to a
tiling that fails `polygonClassSupportsIslamic` still gets Islamic force-cleared (lines 282–286), which is
correct.

`familyAlphas` is set from `alpha` at mount; the effect at lines 271–276 reconciles it into the selected
family's valid range via `resolveAlphaDegs`, so an out-of-range shared tuple clamps rather than breaking.

**The mirror must be an imperative subscription, and it must be debounced.** Two independent reasons:

1. `useConfiguration()` has no selector — the hook form re-renders the whole page, catalogue list
   included, on every option change. Use `useConfiguration.subscribe(...)`, the same reasoning that split
   `familyAlphas` into its own store (familyAlphas.ts 3–9).
2. WebKit caps `history.replaceState` at 100 calls per 30 seconds, then throws
   `SecurityError: Attempt to use history.replaceState() more than 100 times per 30 seconds` and disables
   the method for a while — so catching the error is not a fix, the call rate has to stay under the cap.
   That is one call per 300 ms; the reported safe interval is ~310 ms
   ([sveltejs/kit#365](https://github.com/sveltejs/kit/issues/365),
   [joliss/history-throttled](https://github.com/joliss/history-throttled)). The library only writes on
   discrete filter clicks and never approaches this; /play has sliders — `islamicAngle`, `hueOffset`,
   `sphericalWireThickness` all fire per pointermove, and a single drag would blow through it.

   **400 ms trailing debounce**, timer cleared on unmount. A trailing debounce emits nothing during a
   continuous drag and one write when it settles; the worst case is sustained interaction spaced just over
   the interval, which at 400 ms caps at 75 writes per 30 s. (250 ms would allow 120 — over the limit.)

`tiling` joins the mirrored set, so `R` and the arrow keys keep the URL honest.

`replaceState`, not `router.replace` — off the Next router, so no server-component re-run and no history
spam. Same as the shelf.

Side effect worth naming: the first mirror write replaces the whole query string, which drops
`?source=reference` from library links. That param is vestigial — the shelf sets it at
`reference-shelf.tsx` 1048 and `_play-client.tsx` never reads it — so losing it costs nothing.

## Share button

Icon-only, `absolute top-16 right-4`, directly below the fullscreen toggle — the slot the disabled
screenshot button already reserves, and inside the control column the symmetry badge insets itself to the
left of (`canvas.tsx` `right-16`), so nothing collides however tall that badge grows. Reuses the
fullscreen button's classes verbatim.

`Link2` swapping to a `text-success` `Check` for 1.5 s on success, timeout cleared on unmount, clipboard
rejection silently no-ops — identical to `reference-shelf.tsx` 341–358, so the two pages behave the same.
Wrapped in the existing `Tooltip` with `side="left"` and `delay={0}`, matching its neighbour.

The handler serializes fresh from the store rather than reading `window.location.href`. That removes the
race where a slider drag less than 250 ms old has not yet been flushed to the URL, and means the debounce
only ever serves reload-restore.

## Verification

`lib/services/playUrlState.test.ts` (Vitest):

- every field round-trips serialize → parse
- a default state serializes to the empty string
- out-of-range numbers clamp; unknown enum values fall back to the default rather than reaching the store
- `alpha` round-trips a multi-parameter tuple

Then Playwright per CLAUDE.md: set options on /play, reload, confirm the view returns; and confirm the
share button copies a URL that reproduces the view in a fresh context. `pnpm build` before reporting done.

## Not doing

Camera state (AL's call). Any library change (already shipped). The Web Share API — clipboard copy is the
behaviour the library already established, and a second code path for mobile buys nothing yet.
