# Euclidean shader renderer: retained-mode WebGL2 for the flat view

Date: 2026-07-16
Status: design approved (AL, brainstorm), spec under review
Author: CC

## Goal

Replace the p5.js immediate-mode drawing in the Euclidean (flat) view with a WebGL2 retained-mode
renderer, so panning/zooming/rotating a dense tiling stays at full frame rate on low-end hardware.
The trigger: a tester reported the flat view was very laggy (low FPS) on his PC, while the
hyperbolic and inversive views — both already on shaders — were smooth.

The port is **incremental and behind a flag**. Milestone 1 moves only the base coloured-tile fill
and stroke to the GPU; every overlay stays on p5 and is ported one at a time in later milestones.
p5 remains mounted the whole time as the pointer/input layer.

## Architecture decision (settled in brainstorm — do NOT re-litigate)

**Retained-mode, not per-pixel analytic.** TypeScript computes all geometry; the shader only
rasterises it. This is the classic GPU pipeline (CPU builds vertex buffers, GPU draws), NOT the
technique the other two views use.

This distinction matters and was the crux of the design:

- The **inversive and hyperbolic** renderers are *per-pixel analytic*: they upload no geometry, and
  the fragment shader inverts each pixel to a world point and computes point-in-polygon math there
  (`components/inversive-canvas.tsx:127-157`). That suits conformal lenses and the infinite
  hyperbolic plane, but it does **not** generalise to the Islamic arrangement (you would have to
  cram every arrangement face into a bounded per-pixel loop).
- The **new flat renderer** is *retained-mode*: `buildTilingFromCell`'s successor triangulates the
  base cell into a vertex buffer once, and every frame is one instanced draw call. This unifies
  every feature — coloured tiles, Islamic faces, orbit dots, symmetry glyphs — into a single draw
  path, because each is "just" triangles/lines/points the CPU already knows how to compute.

Consequence for the Islamic mode: `calculateIslamicSegments`, `extractFaces`,
`colorFacesByMarkerThenTile` (all in `lib/classes/polygons/Polygon.ts` and `lib/utils/`) stay in
TypeScript untouched. Their output — coloured faces and line segments — becomes a triangle buffer
and a line buffer. **No arrangement logic ever moves into GLSL.**

Why this fixes the lag: p5 today draws thousands of polygons vertex-by-vertex in JS every frame via
`beginShape`/`vertex`/`endShape` (`lib/classes/Tiling.ts:107-128`). Retained-mode builds the
geometry once (only on a tiling/param change) and redraws it via a uniform matrix. Pan/zoom/rotate
become free. The win is structural and independent of tile count once uploaded.

## Replication decision (settled in brainstorm)

**Instanced base cell.** Triangulate ONE fundamental cell, upload once. The vertex shader offsets
each instance by `i·v1 + j·v2` over the visible lattice range `(i,j) ∈ [-Ri..Ri]×[-Rj..Rj]`. The
per-instance attribute is just `(i,j)`.

- Upload is tiny (one cell), regardless of zoom.
- The instance buffer regenerates only when the fill radius (`Ri`,`Rj`) changes on zoom; the base
  geometry regenerates only when the tiling or a param slider changes (one cell, cheap).
- Pan/zoom/rotate are pure uniform updates → **one `gl.drawArraysInstanced` per frame.**
- Off-screen instances are cheap (vertex transform + clip); no CPU cull needed for M1.

Rejected: CPU-built full-grid buffer (triangulate the whole `buildTilingFromCell` node array each
time the radius grows). It reuses more existing code but re-triangulates 100k+ polygons in JS on
zoom-out. Lower perf ceiling; not chosen.

## What plugs in where

New component `components/euclidean-canvas.tsx` (WebGL2), a sibling of `inversive-canvas.tsx`,
mounted under the p5 `<Canvas>` in `app/(app)/play/_play-client.tsx` when `cfg.euclideanShader` is
true — the same slot pattern `HyperbolicCanvas`/`InversiveCanvas` already occupy (exactly one WebGL
overlay at a time; the flat p5 `Canvas` stays mounted beneath as the input layer).

The p5 `Canvas` gains a branch in its existing `skipFlat` logic
(`components/canvas.tsx:620-623`): when `euclideanShader` is on, p5 stops drawing the base tile
**fill + stroke** (the shader owns those) but keeps running `ensureTiling` (so `tilingRef` exists)
and keeps drawing every overlay that has not yet been ported. `skipFlat` for the WebGL-overlay
purposes stays `inversive || hyperbolic`; a new narrower `skipBaseFill = euclideanShader` gates only
the fill/stroke pass inside `drawTiling`.

The `euclideanShader` flag is a **dev/debug toggle first** (added to the configuration store,
surfaced in the debug panel), promoted to a user-visible setting only once M1–M3 are solid. The
p5 draw path is retained until full parity, then removable.

## Coordinate transform (single source of truth)

The p5 world→screen chain is (`components/canvas.tsx:712-717`):

```
screen = center + drawOffset + Rot(θ) · (zoom · (wₓ, −w_y))
```

where `drawOffset = wrapOffset(offset, v1, v2, det, zoom, θ)` keeps the pan bounded to one cell so
the instance grid stays stable.

To stop the shader and p5 drifting apart, extract these four helpers out of `canvas.tsx` into a new
`lib/render/flatView.ts`, imported by both canvases:

- `latticeBasisFromCell` (`canvas.tsx:95-100`)
- `screenLatticeVectors` (`canvas.tsx:106-110`)
- `computeFillRadii` (`canvas.tsx:169-187`)
- `wrapOffset` (`canvas.tsx:195-211`)

The shader builds its transform to reproduce the p5 `translate/rotate/scale/scale(1,-1)` sequence
exactly. The vertex shader receives: `uCenter` (w/2, h/2), `uOffset` (wrapped, CSS px, y-down),
`uZoom`, `uRot`, `uV1`, `uV2`, and per-instance `(i,j)`; it computes
`world = basePos + i·v1 + j·v2`, then applies the flip/scale/rotate/translate, then maps to clip
space using the DPR-scaled backbuffer size (same DPR handling as `inversive-canvas.tsx:294-301`).

## Geometry builder

New `buildCellMesh(cell)` in `lib/render/`. Steps:

1. Parse the base cell's polygons via a shared `parseCellPolygons(cellData)` — extracted from the
   three current copies of this logic (`buildTilingFromCell` in `canvas.tsx:238-259`, `buildCellGeom`
   in `inversiveCellGeom.ts`, and this new builder). Returns `{ vertices, hue, isStar }[]`.
2. Compute hue with the existing rules: the regular log-ramp (`GenericPolygon`) or `starHue`
   (`lib/utils/renderTiling.ts`), reusing whatever `buildCellGeom` already computes.
3. **Fan-triangulate each polygon from its centroid**: for vertices `v₀..vₙ₋₁` and centroid `c`,
   emit triangles `(c, vₖ, vₖ₊₁)`. Valid for every catalogue tile (regular = convex; star =
   star-shaped from its centre). A non-star-shaped `GenericPolygon` would need earcut — no catalogue
   tile requires it, so earcut is **not** built (YAGNI); note the assumption in code.
4. Emit `fillVerts: Float32Array` (x,y per triangle vertex) + `fillHue: Float32Array` (per-vertex,
   all verts of a polygon share the hue).
5. Emit stroke geometry: per polygon edge `(a,b)`, the endpoints + a side flag, for the stroke pass.

`hsb2rgb` and the fill `s = 0.40, b = 1.0` (opaque) come straight from the inversive shader
(`inversive-canvas.tsx:73-76,154`) — the same values that already keep p5 and inversive
colour-matched. The "tiles paint opaque" decision (`Tiling.show:104-106`) carries over.

## Strokes and points

- **Stroke** — a second instanced draw of edge-quads. Each edge expands to a quad of constant
  screen width (`lineWidth` px) by offsetting its endpoints along the screen-space edge normal in
  the vertex shader. This reproduces p5's `strokeWeight(lineWidth/zoom)`, which is screen-constant
  (the `/zoom` cancels the world scale). Stroke colour is a uniform: dark normally, white when
  tiles are outline-only on a dark theme (`Tiling.show:66-68`). `lineWidth ≤ 0` → skip the stroke
  pass (`noStroke`).
- **Points** (`showPolygonPoints`) — instanced disks at each centroid/halfway/vertex, screen-
  constant radius (~5px, matching `5/zoom`), with a black border via an SDF ring in the fragment
  shader. Colours per `Tiling.show:141-146` (centroid red, halfways green, vertices blue). This is
  **M1b**, not M1.

## Milestones

Each milestone: the shader starts drawing X, p5 stops drawing X.

- **M1** — base fill + stroke, instanced, behind the `euclideanShader` flag. p5 keeps every
  overlay. This is the A/B-testable perf win on the default view (what the tester saw). Ship and
  profile before continuing.
- **M1b** — vertex/halfway/centroid points.
- **M2** — selection-transition wave: per-instance scale about the tile centroid, computed in the
  vertex shader from `wavePhase`/`waveP` uniforms (the same wave `makeWaveScale` computes today,
  `canvas.tsx:137-149`).
- **M3** — vertex-orbit dots (`Tiling.drawVertexOrbits`): per-corner coloured disks, orbit id as a
  per-vertex attribute.
- **M4** — Islamic. `calculateIslamicSegments`/`extractFaces`/`colorFacesByMarkerThenTile` stay in
  TS; faces → a triangle buffer, construction lines → a line buffer. The animated mode recomputes
  per-frame in TS as it does now; only the draw moves to the GPU. The arrangement is periodic, so
  it is built over one fundamental domain (plus a margin for dent triangles that cross cell edges)
  and instanced like the base cell.
- **M5** — symmetry glyphs + fundamental domain (`canvas-overlays.ts`), dual connections
  (`drawDualConnections`), circle packing (`Tiling.show:71-84`).

Flag defaults to off until M1–M3 are solid. The p5 flat-draw path stays until full parity, then it
is deletable.

## The one real risk: registration

Because the port is incremental, for several milestones the shader draws the base tiles while p5
draws overlays on top, in the same world view. Their two transforms must agree to sub-pixel, or an
orbit dot floats off its vertex.

Mitigation:

1. The shared `lib/render/flatView.ts` module (above) is the single source of truth for the
   transform + fill math; the shader's uniform builder and any p5 overlay both derive from it.
2. A unit test projects a set of sample world points through both paths — the explicit shader
   matrix and the p5 `translate/rotate/scale/scale(1,-1)` sequence — and asserts they match within a
   sub-pixel tolerance across a spread of zoom/rotation/offset values. If they ever diverge, the
   test fails.

This risk is the tax on "incremental". Big-bang (port everything before cutover) avoids it but
ships nothing until Islamic is done — explicitly rejected in the brainstorm.

## Testing / de-risking

- **Transform-parity unit test** (above) — the correctness guard for the hybrid rollout.
- **Visual A/B** — same tiling, flag on vs off; eyeball plus a screenshot diff on a few
  representative tilings (a regular, a star, a mixed cell).
- **Perf** — an FPS readout at high tile count (zoomed out to the fill floor), flag on vs off,
  ideally reproduced on the tester's class of hardware. The perf claim is not "GPU is faster" but
  "one instanced draw call per frame vs thousands of JS immediate-mode calls"; the measurement
  confirms it.

## Out of scope

- Screenshots and thumbnails stay on their own off-screen p5 buffer (`takeScreenshotImpl`,
  `canvas.tsx:521-576`) — not perf-critical, not ported.
- The hyperbolic and inversive views are untouched; their per-pixel analytic shaders stay as they
  are.
- No new rendering features. This is a faithful port of the existing flat view, not a redesign.

## Settled decisions (do NOT re-litigate)

1. Retained-mode (TS computes, shader draws), NOT per-pixel analytic like the other two views.
2. Instanced base cell, NOT CPU-built full-grid buffer.
3. Incremental behind a flag, base fill+stroke first (M1); p5 stays as input + un-ported overlays.
4. Islamic arrangement stays entirely in TypeScript; only its output geometry is drawn by the GPU.
5. Fan-from-centroid triangulation (valid for all catalogue tiles); no earcut.
6. Screenshots stay on p5. Hyperbolic/inversive untouched.
