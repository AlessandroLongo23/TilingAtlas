# Euclidean renderer → GPU: port roadmap and status reconciliation

Date: 2026-07-19
Status: roadmap (reconciliation of the 2026-07-16 milestone plan against shipped code)
Author: CC

## Why this doc exists

AL wants the whole Euclidean (flat) view on the GPU: first to kill the p5 slowness, eventually to
lift the Islamic work into 3D. That port already has an approved design and milestone structure in
[`2026-07-16-euclidean-shader-renderer-design.md`](2026-07-16-euclidean-shader-renderer-design.md)
(M1–M5, "settled decisions, do not re-litigate") and a completed
[`M1 plan`](../plans/2026-07-16-euclidean-shader-renderer-m1.md). This doc does three things the
original spec can't, because it postdates the code:

1. Reconciles the M1–M5 plan with what is actually shipped.
2. Enumerates every element still drawn by p5, mapped to its milestone.
3. Records a P0 performance defect in the already-shipped plain-Islamic GPU path (the Edge Offset
   slowness AL is feeling), which is not a new element to port but an incomplete M4.

The technique is settled: **retained-mode** (TypeScript triangulates the geometry, the GPU
rasterises it via instanced draws), NOT the per-pixel fold shader the hyperbolic view uses. See
"Technique" below for why, and why the 3D goal reinforces it.

## What is already on the GPU

| Milestone | Element | Code | Gate |
|---|---|---|---|
| M1 (done) | Plain coloured tiles: fill + constant-width stroke, instanced | [euclidean-canvas.tsx](../../../components/euclidean-canvas.tsx), [flatTilingGL.ts](../../../lib/render/flatTilingGL.ts), [buildCellMesh.ts](../../../lib/render/buildCellMesh.ts) | `euclideanShader` dev flag (default off) |
| M4-plain (done, uncommitted) | Plain Islamic A/B/C fill + black construction lines | [islamic-canvas.tsx](../../../components/islamic-canvas.tsx), [islamicGL.ts](../../../lib/render/islamicGL.ts), [buildIslamicMesh.ts](../../../lib/render/buildIslamicMesh.ts) | `isIslamicShaderActive`: `islamicStyle==='plain' && !animate` |

The base fills are already retained-mode on the GPU. The premise "everything is on p5 and slow" is
therefore only half true. Pan/zoom/rotate on the plain views are already fast. What is slow is a
specific defect (P0 below) and the un-ported decorative + overlay elements.

## P0: Edge Offset drag is slow in the plain-Islamic path

Symptom (AL, 2026-07-19): moving the Edge Offset slider in the plain Islamic construction is
"incredibly slow"; the reload/redraw on that change lags badly. Offset = 0 is smooth.

Diagnosis (by construction vs renderer): mostly a renderer/architecture problem, triggered by
offset > 0.

- The GPU only makes pan/zoom/rotate free. Changing Edge Offset changes the geometry, so the mesh is
  rebuilt in TS (`buildMeshFromPatch`, [islamic-canvas.tsx:230](../../../components/islamic-canvas.tsx#L230)). That rebuild is
  unavoidable at the level of "recompute something"; the amount of work is not.
- The rebuild runs the arrangement over the **entire viewport-sized patch**, not one cell.
  [islamic-canvas.tsx](../../../components/islamic-canvas.tsx) builds `buildTilingFromCell(cell, ri, rj)` (all visible cells) and
  draws it with a single non-instanced `drawArrays`. The base-tile path already builds ONE cell and
  instances it; the Islamic path does not. Cost scales with the number of visible cells and explodes
  when zoomed out.
- At offset > 0, `extractFaces` flips to `splitCrossings = true`, enabling an **O(segments²)**
  pairwise-intersection loop ([islamicArrangement.ts:73-90](../../../lib/utils/islamicArrangement.ts#L73)). At offset = 0 that whole
  double loop is skipped, which is exactly why offset = 0 is smooth and offset > 0 is not. Over one
  cell it is trivial; over the whole viewport's pooled segments it is quadratic per frame.
- The rebuild is synchronous on the main thread with no debounce, so every intermediate slider value
  pays the full cost.

Fix (this is M4 done properly, per the spec's own words "built over one fundamental domain (plus a
margin ...) and instanced like the base cell"):

1. Build the A/B/C arrangement over ONE fundamental domain plus a boundary margin for faces/straps
   that cross the cell edge, then instance it across the viewport in the shader like
   `euclidean-canvas.tsx` does. An Edge Offset drag then rebuilds one cell's arrangement; the
   O(segments²) crossing-split now runs over a handful of segments.
2. Debounce the mesh rebuild during a continuous slider drag (rebuild on a short trailing timer or at
   drag end), so intermediate values do not each trigger a full rebuild.

The margin/clipping for straps that leave the cell is the real engineering nuance and the one part
that is not free; it is a known, scoped problem the spec already anticipated. Recommendation: pull
this forward ahead of the strict milestone order, because it fixes a shipped regression on a
user-facing control rather than porting a new element.

## Remaining elements still on p5, by milestone

Strict spec order (AL choice, 2026-07-19): M1b → M2 → M3 → M4-rest → M5. Cost column is per-frame
while the relevant mode/toggle is active.

### M1b: points
| Element | Toggle | Source | Cost |
|---|---|---|---|
| Polygon points (centroid/halfway/vertex dots) | `showPolygonPoints` (live) | `Tiling.show` points block ~153 | O(verts) ellipses/frame |
| Construction-point labels (c#/h#/v#) | `showConstructionPoints` (dev/rare) | [Tiling.ts:492](../../../lib/classes/Tiling.ts#L492) | bounded to the anchor cell |

Port as instanced screen-constant disks (one small shader; shared with M3). Labels are text, lowest
priority.

### M2: selection-transition wave
| Element | Toggle | Source | Cost |
|---|---|---|---|
| Radial collapse/grow on tiling change | `tilingTransition` (live) | `makeWaveScale` in [canvas.tsx](../../../components/canvas.tsx) | per-instance scale |

Currently disabled whenever the shader owns the fill (`transitionsEnabled` returns false), so the
effect is silently lost under the flag. Port as a per-instance centroid scale in the fill vertex
shader driven by `wavePhase`/`waveP` uniforms.

### M3: vertex-orbit dots ("showOrb")
| Element | Toggle | Source | Cost |
|---|---|---|---|
| One coloured dot per vertex, hue by orbit, hover-grow | `showVertexOrbits` (live) | [Tiling.ts:191](../../../lib/classes/Tiling.ts#L191) | 2–3 passes over every corner/frame |

Instanced disks with orbit id as a per-vertex attribute; hover-grow via a uniform. Shares the M1b
disk shader. Only draws for Regular-shelf tilings that carry orbit data.

### M4-rest: Islamic decoration (the end goal, and after P0 the main speed win)
| Element | Toggle | Source | Cost |
|---|---|---|---|
| Interlace / outline / emboss straps | `islamicStyle` (live) | `drawIslamicInterlace` [Tiling.ts:332](../../../lib/classes/Tiling.ts#L332) + `buildIslamicInterlace` | geom cached; per-frame p5 emit over all bands + outlines |
| Checkerboard (zellij two-tone) | `islamicStyle` (live) | `drawIslamicCheckerboard` [Tiling.ts:411](../../../lib/classes/Tiling.ts#L411) + `twoColorFaces` | geom cached; per-frame face + segment emit |
| Animated motif | `islamicAnimate` (live) | `drawIslamicStarFill` animate path ~278 | full geometry rebuild every frame (worst) |

Extend `buildIslamicMesh` to emit strap-band geometry (from `buildIslamicInterlace`'s bands) and
checkerboard faces (from `twoColorFaces`), reusing the proven [islamicGL.ts](../../../lib/render/islamicGL.ts) /
[islamic-canvas.tsx](../../../components/islamic-canvas.tsx) stack. Arrangement logic stays in TS. The animated motif still
rebuilds its buffer per frame (only the draw moves to GPU), so its win is smaller than the static
styles', but eliminating the p5 emit still helps. Do this on top of the P0 instancing so decoration
inherits the one-cell rebuild.

### M5: overlays and misc (last; the gate to retiring p5)
| Element | Toggle | Source | Cost |
|---|---|---|---|
| Fundamental domain | `showFundamentalDomain` (live) | `drawFundamentalDomain` [canvas-overlays.ts:66](../../../components/canvas-overlays.ts#L66) | a few polygons |
| Symmetry axes + rotation glyphs ("symmetry lines") | `showSymmetryElements` (live) | `drawSymmetryElements` [canvas-overlays.ts:209](../../../components/canvas-overlays.ts#L209) + `drawTilingPlain` | lattice-window loops |
| Dual connections | `showDualConnections` | `drawDualConnections` [Tiling.ts:640](../../../lib/classes/Tiling.ts#L640) | O(n²) neighbour loop |
| Circle packing | `circlePacking` (live) | `Tiling.show` circle branch ~85 | one ellipse/node |

These are cheap and only draw when toggled. Porting them buys architectural completeness (getting p5
off the draw path so the flag can flip on and the p5 plain-fill path can be deleted), NOT frame rate.

## Technique (settled, do not re-litigate)

Retained-mode, per the 2026-07-16 spec. Reuse the existing stack:

- Arrangement stays in TS: `extractFaces`, `colorFacesAbc`, `buildIslamicInterlace`, `twoColorFaces`
  ([islamicArrangement.ts](../../../lib/utils/islamicArrangement.ts), `lib/utils/islamicInterlace.ts`),
  `Polygon.calculateIslamicSegments`/`islamicMarkers`, `islamicNormalAngleFromSlider`.
- Their output → triangle/line buffers via `buildIslamicMesh` and the [islamicGL.ts](../../../lib/render/islamicGL.ts) shaders.
- No arrangement logic ever moves into GLSL.

Do NOT copy the hyperbolic fold shader ([hyperbolicShader.ts](../../../lib/render/hyperbolicShader.ts)). It is a per-pixel
SDF/fold approach that the Euclidean spec deliberately rejected. The 3D goal reinforces retained-mode:
the spherical view already renders Islamic patterns as 3D meshes (`sphericalIslamicMesh.ts`,
`sphericalIslamicWeaveMesh.ts`) reusing the same `colorFacesAbc`/`extractFaces`. A mesh lifts to 3D
(extrude/displace); an SDF fragment shader does not. The fold shader's only portable idea is the
crossing-parity A/B/C classifier, if a per-pixel Euclidean variant is ever wanted, not the default.

## Registration risk (the tax on incremental porting)

While the port is incremental, p5 draws overlays on top of the shader fill in the same world view;
the two transforms must agree to sub-pixel or an orbit dot floats off its vertex. The guard exists:
[flatView.ts](../../../lib/render/flatView.ts) is the single source of truth for the transform, `flatWorldToClip` is what the
vertex shaders transcribe, and [tests/flat-view.test.ts](../../../tests/flat-view.test.ts) pins the two paths together. Every
new milestone's shader must derive its transform from `flatView.ts`.

## Endgame

Once M1b–M5 hold parity: flip `euclideanShader` on by default, profile on low-end hardware, then
delete the p5 plain-fill/overlay draw paths. p5 stays mounted only as the pointer/input layer. That
is the state the 3D work builds on.

## Out of scope / not ported

- Screenshots and thumbnails (offscreen p5 buffer, `takeScreenshotImpl`).
- `showGraph` / `exportGraph` (dev/export overlay, not perf-critical).
- Hyperbolic / inversive / spherical views (their own renderers, untouched).

## Dead code to delete, not port (verify first)

- `drawIslamicVertexRegions` ([Tiling.ts:551](../../../lib/classes/Tiling.ts#L551)): no callers found.
- `showNeighbors` ([Tiling.ts:746](../../../lib/classes/Tiling.ts#L746)): no callers found.
