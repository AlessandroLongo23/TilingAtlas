# Spherical "realistic" mode — tiling lines carved into the sphere

Status: implemented 2026-07-19. Verified visually via Playwright on the dodecahedron, truncated
icosahedron, and icosahedron. Solid sphere only.

## Goal

A "Realistic" toggle on the solid spherical surface that shades the tiling as if the edges were carved
into the sphere: faces raised, edges sunk into a smooth groove, lit as matte stone. All three surface
effects (displacement, normal, ambient occlusion) are generated procedurally from the same edge-distance
field the texture baker already computes — nothing is authored or baked into PBR texture maps.

## Key realisation

`sphericalTextureBaker.ts` already computes the SDF: `g = (m1 - m2) / sep`, the arc-distance to the
nearest tiling edge (0 on the edge, growing into the face), by classifying a direction against the solid's
exit-face normals. The gradient of that field is analytic — the downhill direction toward an edge is the
tangential projection of `(n_best - n_sec)` — so the carve needs no `dFdx` texel sampling and no baked
normal map, and there is no equirect tangent-space distortion near the poles.

## Approach chosen

`MeshStandardMaterial` patched via `onBeforeCompile`, driven live from the face set (rejected: baking
normal/AO/displacement textures — aliasing on thin lines, pole tangent distortion, more render targets;
and a from-scratch `ShaderMaterial` — reimplements the light rig for no gain). Reuses three's PBR lighting
and the light rig already in the scene. The flat look is unchanged (unlit `MeshBasicMaterial`); realistic
is a purely additive branch.

## What ships

- `sphericalRealistic: boolean` in the configuration store (default false).
- `lib/render/sphericalCarvedMaterial.ts` — the carved material. Matte (`roughness 0.92`, `metalness 0`),
  carries the existing baked albedo as `map`. Injected GLSL:
  - `carveG(dir)` — the SDF, identical metric to the baker (exit-normal classification, gap / separation).
  - `carveHeight(g) = uCarveDepth * (smoothstep(0, R, g) - 0.5)` — raised plateau on the face (+½ depth),
    sunk edge (−½ depth), joined by a smooth fillet of radius `R = max(edgeWidth*3, 0.02)`. That `R` is the
    "use the SDF to calculate the radius" — `g` feeds the smoothstep.
  - Vertex stage displaces position radially by `carveHeight(carveG)`; passes the undisplaced direction to
    the fragment stage as a varying.
  - Fragment stage adds a light shoulder-shadow in the groove (`carveShade`, folded into `diffuseColor` so
    it occludes under both direct and indirect light, no aoMap texture needed), then bumps the shading
    normal from the surface-gradient of the same height field (Mikkelsen surface-gradient, computed inline
    from `dFdx/dFdy` of the height so it is three-version-independent).
  - The groove's main tint is NOT this shader — `sphericalTextureBaker.ts` bakes it. In realistic mode the
    baker paints the edge as `faceCol * 0.72` (a soft in-hue darkening) instead of the flat mode's near-black
    line, so the groove reads as shadowed stone, not a painted gash. Gated by a `uRealistic` uniform; flat
    mode is byte-identical (`mix(uLineColor, faceCol*0.72, 0) == uLineColor`).
- `lib/render/sphericalScene.ts` — a `realistic` branch: finer tessellation (160×120 → 512×256 so the
  fillet spans several segments and the displacement reads as a smooth groove on the silhouette) + the
  carved material. `rebake()` moves the groove width with the stroke slider.
- `components/spherical-canvas.tsx` — `realistic` added to the base-content effect deps + passed through.
- `components/sidebar/tilings-tab.tsx` — a "Realistic" checkbox under "Fill" (hidden in wireframe mode).

## Notes / limits

- Carve depth is a constant (`DEFAULT_CARVE_DEPTH = 0.022`) — "slightly", easily tuned in-file. No slider,
  per the matte-over-sliders decision. (First cut at 0.045 read too deep; halved after review.) The extra
  shoulder-shadow is light (`DEFAULT_AO_STRENGTH = 0.14`) since the in-hue groove tint carries the edge.
- The `onBeforeCompile` injection pins three's chunk names (`begin_vertex`, `map_fragment`,
  `normal_fragment_begin`); revisit on a three major upgrade.
- Correctness of the GLSL is verified by eye (Playwright screenshots), not by unit tests — the math lives
  entirely in-shader, so a TS mirror would test a copy, not the shipped code.
- The `aomap_fragment` chunk only declares `ambientOcclusion` under `#ifdef USE_AOMAP`; with no aoMap the
  occlusion must go through the albedo, not that variable (the first cut hit exactly this compile error).
