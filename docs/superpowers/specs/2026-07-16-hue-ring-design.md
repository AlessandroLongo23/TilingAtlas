# Hue ring — global tile-fill hue offset (2026-07-16)

A ring-shaped hue slider in the /play View options. The thumb's angle (0–359°) is a global hue
rotation applied to every tile fill at draw time, so the whole palette cycles while every pairwise
hue distance between tiles is preserved. AL's request; scope answers captured below.

## Decisions (AL, 2026-07-16)

- **Scope: everything, including catalogue thumbnails.** All main-canvas paths (flat p5 + WebGL,
  hyperbolic disk, inversive/spiral, Islamic fills) plus the /play sidebar thumbnails.
- **Thumbnails redraw exactly on every tick.** AL explicitly rejected the cheap CSS
  `hue-rotate` approximation and the redraw-on-release variant: "I want to see how much they cost
  in terms of performance." Each thumbnail subscribes to `hueOffset` itself, so the memoized
  `CatalogueListPanel` stays memoized; the cost is one canvas redraw per mounted thumbnail per tick.
- **Ring gradient = the tile-fill palette.** HSB(h, 0.40, 1.0) ≡ HSL(h, 100%, 80%): the color under
  the thumb is the exact fill a hue-0 (red) tile takes at that offset.
- Overlays keep their colors: vertex-orbit dots, symmetry elements, construction points, hyperbolic
  parity two-tone, strokes. Only tile fills rotate (Islamic cell/rosette fills count as fills).
- /theory preview cards share `FlatCellRenderer` but do not read the /play store; their offset stays
  0. Likewise the /library data-URL cards (reference/tiling/prototile/vertex-config).
- Session-only, default 0 (the configuration store does not persist).

## Component

`components/ui/hue-ring.tsx` — generic `{value, onChange, label?, size?}`, no store coupling.
An SVG annulus (ring, not a wheel): 72 arc segments of 5° (slightly overlapped against seams)
stroked in `hsl(θ, 100%, 80%)`, a circular thumb riding the track centerline, numeric degree
readout in the hole. 0° at 12 o'clock, clockwise; the thumb points at where red now lives.

Interaction (velocity-pad idiom: SVG + pointer capture): press/drag anywhere on the ring re-aims
the thumb; double-click resets to 0; arrows ±1° (±15° with Shift), Home = 0; `role="slider"` with
value semantics. Pure math (`wrapHue`, `hueFromPointer`, `thumbPosition`, `arcPath`, `ringColor`)
in `lib/render/hueRing.ts`, unit-tested in `tests/hue-ring.test.ts`.

Placement: View options, under "Line stroke". Always visible — it applies in every view mode.

## Application — offset at draw time, never baked into meshes

`hueOffset: number` (degrees) in `lib/stores/configuration.ts`. Consumers:

| Path | Mechanism |
| --- | --- |
| Flat WebGL (`flatTilingGL.ts` + inline copy in `euclidean-canvas.tsx`) | `uHueOffset` uniform; `FlatDrawParams.hueOffsetDeg?` (omitted ⇒ 0, theory cards) |
| Flat p5 (`Tiling.show`, circle packing, Islamic fills, `Polygon.showIslamicFilled`, screenshot in `canvas.tsx`) | `(hue + off) % 360` at the fill call sites |
| Hyperbolic (`hyperbolicShader.ts`, canvas + thumbnail) | `uHueOffset` uniform before `hsb2rgb` (parity mode untouched) |
| Inversive (`inversive-canvas.tsx`) | `uHueOffset` uniform; `uAvg` recomputed CPU-side from new `CellGeom.hueAreas` via `averageFill` (rotate hues, then average RGB), cached per (offset, cell) |
| Thumbnails (`TilingThumbnail`, `HyperbolicThumbnail`) | live store subscription; `renderTilingToContext` gained `hueOffsetDeg` |

GLSL note: every `hsb2rgb` in the repo wraps hue via `mod`, so `(hue + uHueOffset) / 360.0` needs
no explicit `fract`.

## Known cost (to be measured)

Per drag tick, every mounted thumbnail re-renders: 2D-canvas redraws for flat thumbnails, a fresh
WebGL context + `toDataURL` for each hyperbolic disk. If this janks, the fallbacks are (a) CSS
`hue-rotate(var(--offset))` on the thumbnail canvases (approximate but GPU-free) or (b) redraw on
pointer-up only.
