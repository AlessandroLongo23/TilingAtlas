# Spherical Islamic + Realistic: raised lit tiles

Date: 2026-07-19
Status: approved (design), pre-implementation

## Goal

Let the spherical renderer combine the **Islamic** star pattern with the **Realistic** look, so the
Islamic cells render as raised, light-catching tiles that pop out of the sphere, with the dark
star-lines reading as recessed channels between them. Separately, make all sphere fill colours a bit
brighter (more vivid, less washed-out).

The reference is the existing "Realistic" carved sphere (`sphericalCarvedMaterial.ts`): a matte-stone
surface with edges sunk into grooves, lit by the scene's hemisphere + directional lights. We want the
Islamic cells to have that same lit, in-relief quality.

## Current state (why they can't coexist today)

- The base-surface router at `components/spherical-canvas.tsx:139-161` makes `isIslamic` suppress the
  base sphere entirely (`content = null`). `realistic` is only read inside the final solid-sphere
  `else` branch, so it is dead code whenever Islamic is on.
- The Islamic cells are drawn by a separate effect (`spherical-canvas.tsx:265-324`) via
  `buildIslamicFill` (`lib/render/sphericalIslamicFill.ts`). Each cell is triangulated, barycentrically
  subdivided, and every vertex projected flush onto the sphere (radius 1). The material is
  `MeshBasicMaterial({ vertexColors: true, side: DoubleSide })` — unlit, flat colours.
- Fill colours use a hardcoded saturation of `0.40` at brightness `1.0` in three synced sites
  (`sphericalTextureBaker.ts:88`, `sphericalIslamicFill.ts:36` and `:271`). The `0.40` saturation is
  what reads as dull.

## Trigger condition (no new store field, no new UI)

The raised-lit-tiles path activates when all three are true:

```
isIslamic && !sphericalWireframe && sphericalRealistic
```

The Realistic checkbox is already rendered whenever Fill is on (`!sphericalWireframe`), so it is
visible and toggleable in exactly this state. Islamic without Realistic, interlace, and wireframe are
all unchanged. Scope is the `buildIslamicFill` path (plain + checkerboard fills); interlace already has
its own solid-3D weave mode (`buildIslamicWeave`) and is left alone.

## Design

### 1. Route `realistic` into the Islamic fill

In `components/spherical-canvas.tsx`, pass `sphericalRealistic` into the `buildIslamicFill` options
(the `if (!islamicFill) ...` branch around lines 308-323) as a new `relief` flag, and add
`sphericalRealistic` to that effect's dependency array (line 324). The router's
Islamic-suppresses-base rule is untouched — the base sphere still does not render under Islamic.

### 2. Relief geometry in `buildIslamicFill`

Add a `relief?: boolean` option to `IslamicFillOptions`. When off, behaviour is byte-identical to
today (flat, unlit, `MeshBasicMaterial`, non-indexed). When on:

- **Radial height field.** Displace each subdivided cell vertex outward along its radial direction by
  `h = δ · profile(d)`, where `d` is the vertex's 2D (face-plane) distance to its own cell boundary
  and `profile` ramps from 0 at the boundary to 1 in the interior (e.g. `smoothstep(0, w, d)`). Result:
  a flat/domed cap in the cell interior falling to `h = 0` exactly at the boundary. Because both sides
  of a shared edge sit at `h = 0`, neighbours meet flush — no gaps, no cracks. The ramp is the beveled
  wall that catches light; the star-line ribbon sits in the seam at the ramp's base.
- **Distance to boundary** is computed per cell as the min over the cell's boundary edges of the
  2D point-to-segment distance (the cell boundary is the polygon passed to `triangulateFillCell`).
- **Parameters** `δ` (radial amplitude) and `w` (bevel width, a few × `TARGET_SEG`) are module
  constants, tuned by eye against the reference. `δ` in the ballpark of the carved sphere's
  `DEFAULT_CARVE_DEPTH = 0.022`.
- **Subdivision.** The existing `L` (up to `MAX_SUBDIV = 24`) must resolve the bevel ramp; verify `w`
  spans enough sub-triangles, raise the floor on `L` for the relief path if needed.

### 3. Lit material + normals

- Swap `MeshBasicMaterial` → `MeshStandardMaterial({ vertexColors: true, roughness: ~0.9,
  metalness: 0, side: FrontSide })` for the relief path — matte-stone params matching
  `sphericalCarvedMaterial.ts`. FrontSide is safe: the raised tiles still form a closed opaque shell
  (flush at `h = 0`), so the near side occludes the far side. The flat path keeps
  `MeshBasicMaterial` + `DoubleSide` as today.
- **Normals.** Build the relief geometry indexed per cell and `computeVertexNormals()` per cell, so
  shading is smooth within a cell but the crease at each cell boundary is preserved — that crease is
  the tile edge. (Do NOT merge across cells, or the tile edges soften.) The flat path stays
  non-indexed.
- The lit material picks up the scene's existing `HemisphereLight(…, 0.55)` +
  `DirectionalLight(…, 0.55)` (`spherical-canvas.tsx:89-92`) with no scene change required, except
  possibly a lighting tweak (below).

### 4. Lighting tweak (tune by eye)

Lit albedo × light (< 1) will darken tiles versus the unlit flat look, and the lights are
deliberately modest (0.55 each, "so a bright tile-hue albedo doesn't blow out"). Add a small ambient
floor or nudge intensity so lit tiles don't come out muddy. Tune against the screenshot; keep the
change minimal so the plain carved sphere still looks right (it also uses these lights).

### 5. Brighter colours

Raise the saturation constant from `0.40` toward `~0.58` in the three synced sites so plain, carved,
and Islamic fills stay consistent:

- `lib/render/sphericalTextureBaker.ts:88`
- `lib/render/sphericalIslamicFill.ts:36` (the `hsb2rgb` default caller) and `:271`

This affects all sphere fills, not only the Islamic-realistic combo. Note the baker pre-linearizes
with `sRGBToLinear`; the constant is in HSB space before that, so no conversion change is needed.
Pick the final value by eye. (The flat Euclidean renderer keeps its own matching constant in
`flatTilingGL.ts`; syncing it is optional and out of scope unless the mismatch looks wrong.)

## Line ribbons

The star-line ribbon overlay (`buildIslamicPattern`) draws on top at radius ~1 and is independent of
the fill. With cells raised, the ribbons should sit in the recessed seams. Check during
implementation that the ribbons are not visually buried by the raised caps; if so, nudge the ribbon
radius up slightly. Likely a no-op, flagged as a verification step.

## Files touched

- `components/spherical-canvas.tsx` — pass `relief`/`realistic` into `buildIslamicFill`, extend deps.
- `lib/render/sphericalIslamicFill.ts` — `relief` option, height-field displacement, indexed-per-cell
  normals, `MeshStandardMaterial` for the relief path, saturation bump.
- `lib/render/sphericalTextureBaker.ts` — saturation bump (line 88).
- `spherical-canvas.tsx` light rig OR a shared lighting constant — small intensity/ambient tweak
  (only if needed after visual check).

## Out of scope

- Interlace / weave 3D (already exists).
- Wireframe interactions with Islamic.
- Full extruded prismatic tiles with vertical skirt walls (the rejected alternative — fragile
  polygon-offset math on non-convex cells; the height-field approach is crack-free without it).
- Syncing the flat Euclidean renderer's saturation.

## Verification

- `pnpm build` clean (type-check included), per the project workflow rule.
- Visual check in `/play` on a spherical tiling (e.g. truncated icosahedron): Islamic + Fill +
  Realistic shows raised, lit tiles with star-line channels; toggling Realistic off returns to the
  flat unlit look; brighter colours visible in plain, carved, and Islamic modes.
- No cracks/z-fighting at cell boundaries across the Islamic-angle range (the non-convex star-arm
  cells are the stress case).
