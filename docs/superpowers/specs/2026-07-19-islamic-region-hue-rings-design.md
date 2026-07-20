# Islamic region fills: hue-only rings

Date: 2026-07-19
Status: approved (brainstorm), pre-implementation

## Problem

The Islamic construction exposes four region fills as free `<input type="color">` pickers:
the plain A/B/C fill's **B** (side fields) and **C** (edge-centre diamonds), and the
checkerboard style's **A** and **B**. A free RGB picker lets a region fill land at any
saturation and lightness, so it can fall out of the tile palette — the star bodies (class A)
are always HSB(h, 0.40, 1.0) ≡ HSL(h, 100%, 80%), varying only in hue. A background field at,
say, `#3a4a52` (dark, low-saturation slate) does not read as the same material as the tiles.

## Decision

Every region fill becomes a single **hue**, picked with the existing `HueRing`
(`components/ui/hue-ring.tsx`) — the same control used for the global hue-displacement offset.
Saturation and lightness are hard-locked to the tile palette (100% / 80%); the picker cannot
express them. A region fill is therefore always a tile-palette colour, differing from the star
bodies only in hue.

Scope: all four fields — plain fill B/C **and** checkerboard A/B.

## State (`lib/stores/configuration.ts`)

The store has no persist middleware (session-only), so this is a straight rename with no
migration. Replace the four `string` (CSS hex) fields with `number` (hue degrees, [0, 360)):

| old field (hex)          | old default | new field (hue°)       | new default |
|--------------------------|-------------|------------------------|-------------|
| `islamicFillColorB`      | `#e7dcc0`   | `islamicFillHueB`      | `45`        |
| `islamicFillColorC`      | `#3a4a52`   | `islamicFillHueC`      | `200`       |
| `islamicCheckerColorA`   | `#e7dcc0`   | `islamicCheckerHueA`   | `45`        |
| `islamicCheckerColorB`   | `#3a4a52`   | `islamicCheckerHueB`   | `200`       |

New defaults are the hue of the old hex defaults (`#e7dcc0` → ~45° pastel yellow,
`#3a4a52` → ~200° pastel sky-blue), now rendered at the locked S/L.

## Helper (`lib/render/hueRing.ts`)

Add one pure function next to `ringColor`:

```ts
/** Tile-palette RGB (0–1) at a hue: HSB(h, 0.40, 1.0). Matches the flat shader's hsb2rgb and
 *  the class-A star-body colour, so a region fill is the same material as the tiles. */
export function tileHueRgb01(hueDeg: number): [number, number, number]
```

It mirrors the degree-based `hsb2rgb(hueDeg, 0.40, 1.0)` already duplicated in
`sphericalIslamicFill.ts:36` / `sphericalWireframe.ts:23`. `ringColor(hueDeg)` (already returns
`hsl(h,100%,80%)`) stays the CSS-string form for p5 `fill()`.

## UI (`components/sidebar/options-tab.tsx`)

Replace the four `<input type="color">` blocks with four `<HueRing>` bound to the new fields,
same call shape as the existing hue-shift ring (line 70):

- Plain fill: `<HueRing label="Side fields (B)" value={cfg.islamicFillHueB} onChange={(v) => setCfg({ islamicFillHueB: v })} />` and `label="Diamonds (C)"` → `islamicFillHueC`.
- Checkerboard: `label="Field A"` → `islamicCheckerHueA`, `label="Field B"` → `islamicCheckerHueB`.

## Render sites

Swap the hex→RGB conversions for the hue helper. The shaders' `uColorB`/`uColorC` vec3 uniforms
are untouched — only the CPU value feeding them changes.

| file | change |
|------|--------|
| `components/islamic-canvas.tsx:219-220` | `hexToRgb(cfg.islamicFillColorB/C)` → `tileHueRgb01(cfg.islamicFillHueB/C)` |
| `components/hyperbolic-canvas.tsx:383-391` | all four `hexToRgb(...)` → `tileHueRgb01(...Hue...)` |
| `lib/classes/Tiling.ts:302,431-432` | `ctx.fill(colorB/C/A)` from hex → `ctx.fill(ringColor(hue))` |
| `lib/render/sphericalIslamicFill.ts` | `IslamicFillOptions` colour fields become hue numbers (`fillHueB/C`, `checkerHueA/B`); `DEFAULT_COLOR_B/C` → `DEFAULT_HUE_B/C`; `fixed1/fixed2` computed via `hsb2rgb(hue, 0.4, 1.0)` instead of `hexToRgb` |
| `components/spherical-canvas.tsx:317-320` | pass the new hue fields into `IslamicFillOptions` |

Remove any now-dead `hexToRgb` imports.

## Locked decisions

1. **Global hue displacement does not rotate B/C/checker fills.** The picked hue is absolute
   (what you pick is what shows), preserving today's behaviour where these fills were fixed and
   unaffected by the global offset. Only class-A star bodies rotate with the global ring.
2. **Saturation and lightness are not exposed** — hard-locked to 100% / 80% (the tile palette).

## Non-goals

- No 2D hue+saturation control; no saturation or lightness picker.
- No change to class-A star-body colouring or the global hue-offset ring.
- No persisted-config migration (store is session-only).

## Verification

- `pnpm build` clean (type checker included).
- Update any test asserting the old hex fields/defaults (`grep islamicFillColor|islamicCheckerColor tests/`).
- Playwright: select Islamic construction on `/play`, confirm the four pickers render as rings
  and that dragging a ring recolours the corresponding region in the flat, spherical, and
  hyperbolic views at the tile S/L.
