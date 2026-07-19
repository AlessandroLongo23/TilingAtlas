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

## Flag flipped ON by default (2026-07-19)

`euclideanShader` now defaults true, so the flat plain-tile view renders through the WebGL2 path for
everyone (p5 stays the fallback for islamic/circle-packing/symmetry and as the input/overlay layer).
Trigger: `showPolygonPoints` on the p5 path was measured (Apple M5, headed Chromium, real GPU) at
+39 ms/frame at min zoom, dropping 120→21 fps; the M1b GPU points cost ~0 ms (stay pinned at the
120 fps refresh cap). Before flipping, a Playwright parity sweep (`scripts/parity-sweep.mjs`) confirmed
the shader matches p5 on a star (star hue + concave star-shaped fan), a parametric family (α cell path),
a dense k=3, and dark-theme outline-only (white stroke). The selection wave (M2) landed 2026-07-19 and
now plays on the shader path (it costs nothing while idle: the wave branch is gated on `uWavePhase != 0`).
Measurement caveat: headless Chromium renders WebGL in software (SwiftShader) and is ~15× too slow, so
only headed/real-GPU numbers count.

## What is already on the GPU

| Milestone | Element | Code | Gate |
|---|---|---|---|
| M1 (done) | Plain coloured tiles: fill + constant-width stroke, instanced | [euclidean-canvas.tsx](../../../components/euclidean-canvas.tsx), [flatTilingGL.ts](../../../lib/render/flatTilingGL.ts), [buildCellMesh.ts](../../../lib/render/buildCellMesh.ts) | `euclideanShader` — **ON by default since 2026-07-19** |
| M1b (done) | Polygon points (centroid/halfway/vertex dots) | same + `POINTS_VERT/FRAG` | same flag |
| M2 (done) | Selection-transition wave: collapse-then-grow on tiling change | `uWavePhase`/`uWaveP` + `aCentroid` in `FILL_VERT`/`STROKE_VERT`, `fillCentroid`/`strokeCentroid` in `buildCellMesh`, transition state machine in [euclidean-canvas.tsx](../../../components/euclidean-canvas.tsx) | `tilingTransition` (live) |
| M3 (done) | Vertex-orbit dots + tile dim, hover-grow | `ORBIT_VERT`/`ORBIT_FRAG` + `uFillDim`/`uStrokeDim` in [flatTilingGL.ts](../../../lib/render/flatTilingGL.ts), [buildOrbitDotMesh.ts](../../../lib/render/buildOrbitDotMesh.ts), [orbitHoverBridge.ts](../../../lib/render/orbitHoverBridge.ts) | `showVertexOrbits` (live) |
| M4-plain (done) | Plain Islamic A/B/C fill + black construction lines | [islamic-canvas.tsx](../../../components/islamic-canvas.tsx), [islamicGL.ts](../../../lib/render/islamicGL.ts), [buildIslamicMesh.ts](../../../lib/render/buildIslamicMesh.ts) | `isIslamicShaderActive`: plain, `!animate` |
| M4-checker (done) | Checkerboard (zellij two-tone) fill + borders | same + `buildInstancedCheckerMesh`, `uMode` in `ISLAMIC_FILL_FRAG` | `isIslamicShaderActive`: checkerboard, `!animate` |
| M4-strap (done) | Interlace / outline / emboss straps | [strap-canvas.tsx](../../../components/strap-canvas.tsx), [buildIslamicStrapMesh.ts](../../../lib/render/buildIslamicStrapMesh.ts), `STRAP_BORDER` + `uMode 2` in [islamicGL.ts](../../../lib/render/islamicGL.ts) | `isStrapShaderActive`: interlace/outline/emboss, `!animate` |

The base fills are already retained-mode on the GPU. The premise "everything is on p5 and slow" is
therefore only half true. Pan/zoom/rotate on the plain views are already fast. What is slow is a
specific defect (P0 below) and the un-ported decorative + overlay elements.

## P0 (LANDED 2026-07-19): Edge Offset drag was slow in the plain-Islamic path

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

Fixed in three commits, in increasing structural depth:

1. `78ddc9a` — grid broad-phase for the crossing split. `buildArrangement`'s O(segments²) all-pairs
   scan (the branch offset > 0 / count > 1 reaches) became a spatial-grid ~O(n) pass, output
   byte-identical (candidates sorted so crossing points are created in the same order). Also throttled
   the mesh rebuild to one per 100 ms during a continuous drag.
2. `a438019` — instanced over one cell. The rebuild still ran the arrangement over the WHOLE viewport,
   so it grew with zoom-out and stayed laggy when zoomed far out. Now the arrangement is built over a
   fixed `PATCH_MARGIN` patch and only the origin-cell representatives are kept (each periodic face's
   centre reduces to exactly one lattice cell); the shader instances them across the viewport
   (`aInst = i,j`; `world = aPos + i·v1 + j·v2`), same as `euclidean-canvas.tsx`. No clipping needed —
   representatives partition the plane, so instances tile with no gaps and no double-paint. New
   `buildInstancedIslamicMesh` + `latticeCellOf` in `buildIslamicMesh.ts`, `aInst`/`uV1`/`uV2` added to
   the `islamicGL` fill+stroke vertex shaders.

Per-rebuild cost, square cell, offset > 0 (bench), by zoom-out level:

| viewport | committed gridded (whole-view) | instanced (fixed patch) |
|---|---|---|
| 49 cells | 4 ms | 3 ms |
| 225 cells (≈ default zoom) | 18 ms | 3 ms |
| 625 cells | 47 ms | 3 ms |
| 1681 cells (zoomed out) | 127 ms | 4 ms |

The instanced rebuild is flat in zoom (that is the fix); denser multi-tile cells widen the gap. 66
islamic tests green, build clean. In-app smoothness confirmed by AL. This is M4-plain done properly;
the decorative styles (M4-rest) are still whole-patch p5 and will inherit the same instancing.

## Remaining elements still on p5, by milestone

Strict spec order (AL choice, 2026-07-19): M1b → M2 → M3 → M4-rest → M5. M1b, M2, M3 done; M4-rest done
(checkerboard + interlace/outline/emboss; only the animated motif is deferred, by design). **Next is M5**
(overlays: fundamental domain, symmetry lines, dual connections, circle packing). Cost column is per-frame
while the relevant mode/toggle is active.

### M1b: points
| Element | Toggle | Source | Status |
|---|---|---|---|
| Polygon points (centroid/halfway/vertex dots) | `showPolygonPoints` (live) | `Tiling.show` points block ~153 | **DONE** (`POINTS_VERT/FRAG` in flatTilingGL, `buildCellMesh` point buffers, points pass in euclidean-canvas; p5 skips them when the shader owns the fill) |
| Construction-point labels (c#/h#/v#) | `showConstructionPoints` (dev/rare) | [Tiling.ts:492](../../../lib/classes/Tiling.ts#L492) | still p5 (text labels, lowest priority) |

Polygon points are instanced screen-constant disks (unit-quad billboards, SDF disk + dark rim in the
fragment shader), coloured red/green/blue like the p5 dots, sharing the fill's instance grid. The disk
shader is the reusable base for M3's orbit dots. Construction-point *labels* stay on p5 for now (text).

### M2: selection-transition wave (DONE 2026-07-19)
| Element | Toggle | Source | Status |
|---|---|---|---|
| Radial collapse/grow on tiling change | `tilingTransition` (live) | `makeWaveScale` in [canvas.tsx](../../../components/canvas.tsx) | **DONE**, ported to the fill+stroke vertex shaders |

The wave is a per-vertex scale about the tile's fan-apex centroid, driven by `uWavePhase` (0/+1/-1) and
`uWaveP` (phase progress) in `FILL_VERT` and `STROKE_VERT`. `buildCellMesh` now emits `fillCentroid` /
`strokeCentroid` (the vertex-average, same point for fill and stroke so the two collapse together). The
GLSL `waveTileScale` is a transcription of `waveTileScale` in [tilingTransition.ts](../../../lib/utils/tilingTransition.ts)
(kept in step by comment), and `WAVE_MIN_SCALE` (0.02) drops a collapsed tile to zero area (no lingering
stroke speck; the constant-width outline push is zeroed at the cutoff). The stroke follows the scaled
tile but keeps constant screen width, matching p5. Points are suppressed for the transition's duration
(they sit on the un-scaled outline), exactly as `Tiling.show` skips them when `scaleOf` is set.

The two-phase collapse-then-grow lives entirely in [euclidean-canvas.tsx](../../../components/euclidean-canvas.tsx):
on a genuine selection change (id changed) the current mesh COLLAPSES (phase "out"), then the incoming
mesh (built and stashed in `pendingMeshRef`, not uploaded) is uploaded at the out→in handover and GROWS
(phase "in"). Only ONE mesh is ever on the GPU, so no second buffer set is needed. This runs independently
of the p5 `transitionRef` machine (which stays disabled under the shader). Toggling `tilingTransition` off
mid-flight lands on the incoming tiling at once.

Scope: static-cell tilings animate, and so do param→static switches (a bonus: `paramCell` just went
null, so the effect fires and collapses the outgoing param mesh). **Static→param and param→param still
jump-cut**: those are owned by the render-loop's α-rebuild path, and threading the collapse through it
would risk an α-timing race for little visible gain. No regression: they jump-cut before M2 too. The
shared `FILL_VERT`/`STROKE_VERT` change is backward-compatible with `FlatCellRenderer` (the theory
cards): they never set `uWavePhase` (defaults 0) nor bind `aCentroid`, so the wave branch is dead there.
Verified with `scripts/wave-capture.mjs` (collapse/grow frames) + the theory cards still paint.

### M3: vertex-orbit dots ("showOrb") (DONE 2026-07-19)
| Element | Toggle | Source | Status |
|---|---|---|---|
| One coloured dot per vertex, hue by orbit, hover-grow | `showVertexOrbits` (live) | [Tiling.ts:191](../../../lib/classes/Tiling.ts#L191) | **DONE**, dots + tile dim ported to the shader |

Instanced disks (`ORBIT_VERT`/`ORBIT_FRAG`, the billboarded SDF disk of M1b) coloured by orbit id:
`buildOrbitDotMesh` walks the fundamental cell's corners, tagging each with `orbitData.orbitAt(x,y)`
(orbit membership is lattice-periodic, so one cell instances to the whole partition; corners with orbit
-1, e.g. star dents, are dropped). Hue = `id·360/uK` (matching `orbitColor`), a black rim, drawn on top
of the fill. Hover-grow: the p5 canvas owns the pointer, so it publishes the mouse in WORLD coords to a
module singleton (`orbitHoverBridge`); the shader hit-tests it against the base-cell dots reduced modulo
the lattice, then eases a per-orbit radius scale (`uOrbitScale[]`, capped at `ORBIT_MAX`) toward 2x for
the hovered orbit, the same lerp `drawVertexOrbits` runs.

Orbit mode also DIMS the tiles to 0.3 (p5 draws them at opacity 0.3). The shader does it as an OPAQUE
`mix(surfaceBg, tile, 0.3)` on the fill and stroke, not a translucent fragment: this alpha canvas is
`premultipliedAlpha:false`, so a 0.3-alpha fill over the transparent clear double-fades to ~0.09 (the
first attempt looked washed-out grey). `uDimTarget` is read from the surface background so the fade is
theme-correct (pale over light, dark over dark). p5's own `drawVertexOrbits` is suppressed when the
shader owns the dots (`skipFill`), so nothing double-draws. `uFillDim`/`uStrokeDim` default 0, keeping
`FlatCellRenderer` / the theory cards opaque and untouched. Verified with `scripts/orbit-capture.mjs`
(p5-vs-GPU parity + a hover frame) against a k=7 Regular-shelf tiling.

### M4-rest: Islamic decoration (the end goal, and after P0 the main speed win)
| Element | Toggle | Source | Status |
|---|---|---|---|
| Checkerboard (zellij two-tone) | `islamicStyle` (live) | `drawIslamicCheckerboard` [Tiling.ts:411](../../../lib/classes/Tiling.ts#L411) + `twoColorFaces` | **DONE 2026-07-19** |
| Interlace / outline / emboss straps | `islamicStyle` (live) | `drawIslamicInterlace` [Tiling.ts:332](../../../lib/classes/Tiling.ts#L332) + `buildIslamicInterlace` | **DONE 2026-07-19** |
| Animated motif | `islamicAnimate` (live) | `drawIslamicStarFill` animate path ~278 | deferred (per-frame, non-periodic → defeats instancing) |

**Checkerboard (done):** `buildInstancedCheckerMesh` reuses the plain path's origin-cell filtering but the
fill is `twoColorFaces`'s bipartite two-colouring instead of A/B/C; each kept face carries its colour index
(0/1) in `fillClass`, and `ISLAMIC_FILL_FRAG` gains a `uMode`: mode 1 maps class 0→colour A, 1→colour B
(uniforms), mode 0 stays the A/B/C path. The gate (`isIslamicShaderActive`) and the p5 skip
(`Tiling.show`) now cover checkerboard as well as plain, so p5 never double-paints. Playwright-verified
pixel-identical to p5 on two lattices (composable-k1, composable-k2), no parity seam across instances
(the lattice preserves the bipartite parity, same periodicity assumption the plain A/B/C path relies on).

**Interlace/outline/emboss (done):** `buildIslamicInterlace` returns one `Band` per edge, each a convex
`fill` quad plus per-segment `outline` with world normals. `buildInstancedStrapMesh` keeps the origin-cell
reps (by fill centroid), triangulates the quads for the solid strap body, and emits one butt quad per
outline segment carrying a BAKED per-vertex colour: dark warm for interlace/outline, or the emboss
highlight/shadow chosen from `n·light` (world-fixed, so periodic and instanced cleanly). The over/under
illusion is already baked into the outline endpoints by `buildBands`, so the GPU just strokes them; the
fill colour and border width are draw-time uniforms. Two shaders in [islamicGL.ts](../../../lib/render/islamicGL.ts):
`ISLAMIC_FILL` gains `uMode 2` (solid body colour), and `STRAP_BORDER_VERT/FRAG` is the per-vertex-colour
border. This lives in a SEPARATE [strap-canvas.tsx](../../../components/strap-canvas.tsx) (a sibling of
IslamicCanvas, its own gate `isStrapShaderActive`) rather than another branch of the plain/checker canvas,
because straps are a different mesh shape and that file was mid-refactor next door; the patch/instance/
throttle plumbing is duplicated for now (factor a shared hook once the colour refactor there settles).
Playwright-verified against genuine-p5 references for all three styles (interlace weave, flat outline,
raised emboss ribbons).

**Animated motif (deferred):** `drawIslamicStarFill`'s animate path re-picks a per-edge angle every frame
from noise, so the pattern is NOT lattice-periodic and can't be instanced from one cell. Porting it means
a whole-patch rebuild per frame (only the draw moves to GPU) for a small win; left on p5 for now.

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
