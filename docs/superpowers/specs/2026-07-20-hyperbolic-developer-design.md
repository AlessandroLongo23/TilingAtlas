# Hyperbolic developer design (Phase 1 of 3)

Date: 2026-07-20
Status: approved (AL, 2026-07-20). Phase 1 of a three-phase program; only Phase 1 is specced here.

## Goal

Replace the placeholder Wythoff-shader hyperbolic tilings with real engine-developed geometry: a
geometry engine that turns a combinatorial tiling into exact Poincaré-disk coordinates, drawn by a
unified shader-based renderer that keeps the current sharp look and SU(1,1) navigation.

## Context

The 22 entries in `public/reference-atlas-hyperbolic.json` were scaffolding. They are drawn by a GPU
shader ([lib/render/hyperbolicShader.ts](../../../lib/render/hyperbolicShader.ts)) that folds each pixel
into the Schwarz triangle of the (2,p,q) group. That shader only knows regular {p,q}. It cannot draw a
tiling with arbitrary tiles, which is the whole point of the Čtrnáct engine (stars, polyominoes,
apeirogons, hybrids, k≥2). So the placeholders block the atlas's hyperbolic ambition and must be
replaced with developed geometry.

Marek develops non-Euclidean tilings by converting solver output to a TES file and rendering it in
HyperRogue, which has geometry functions he had added. His converter (`Tes_Maker_*.py`, read 2026-07-20)
computes **no** coordinates: it is a symbolic transformer that writes tile-angle definitions and the
gluing, and HyperRogue does all the geometry. HyperRogue is a standalone GPL game, not embeddable in a
web atlas, so we cannot reuse it live. The geometry engine has to be ours. Marek's converter still tells
us the tile-angle model (each tile type maps to an interior-angle formula at one global edge length) and
the solver output format the developer consumes.

The math ports from the spherical developer built 2026-07-19..20
([marek-vault/knowledge/algorithm/spherical-developer.md](../../../marek-vault/knowledge/algorithm/spherical-developer.md)):
the same flood-fill, with SU(1,1) frames instead of SO(3) and no closure (the plane is infinite, so we
develop a bounded patch). The hyperbolic edge-length formula and the SU(1,1) transforms already exist and
are validated: [experiments/hyperbolic/hyp_realize.py](../../../experiments/hyperbolic/hyp_realize.py)
(the `arcmedge` Newton solver, checked against two papers) and the `su11*` helpers in
[lib/render/hyperbolic.ts](../../../lib/render/hyperbolic.ts).

## Scope

**Phase 1 (this spec).** Regular-faced uniform tilings only: the four regular {p,q} plus the truncated,
rectified, and snub forms already in the atlas (3.14.14, 3.7.3.7, 4.6.14, …). All their tiles are regular
polygons, mixed types allowed, one vertex orbit. Deliverable: the 22 placeholders redrawn as developed
geometry, visually matching the current shader, navigation unchanged. Combinatorics for Phase 1 come from
the existing Wythoff data we already have, developed by the new engine and drawn by the new renderer. No
solver dependency yet.

**Phase 2 (separate spec).** Non-regular and apeirogon tiles: extend the tile-angle alphabet, develop
Marek's actual `S3+S4+S20+S10` hybrid, cross-check by emitting TES and rendering in HyperRogue offline.

**Phase 3 (separate spec).** Add the negative-defect closure mode to the solver (`gen_alphabet.py` has
euclidean and positive-defect, not this) so the engine enumerates hyperbolic tilings itself, k≥2 and the
"all polygons in one tiling" ambition included.

Out of Phase 1: non-regular tiles, apeirogons, solver enumeration, k≥2, and HyperRogue-style
re-development on pan (Phase 1 pre-develops a large fixed patch; re-development is promoted later only if
the navigation feel needs it).

## Architecture

Three components. One is the existing shader, repurposed.

```
combinatorial tiling spec            (Phase 1: from Wythoff data; Phase 3: from the solver)
        │
        ▼
  hyperbolicDevelop.ts   ── the developer (geometry engine) ──►  developed patch
        │  uses:                                                  (tiles as geodesic-edged
        │   • edge-length solver (Newton, ported from hyp_realize) vertex lists + hue)
        │   • tile-angle alphabet (regular: regangle)
        │   • su11* flood-fill (from hyperbolic.ts)
        ▼
  hyperbolicShader.ts    ── unified renderer ──►  crisp WebGL, per-pixel geodesic-edge AA
        │  under the Möbius view transform
        ▼
  hyperbolic.ts su11 pan  ── navigation, reused verbatim
```

### Component 1: the developer (`lib/render/hyperbolicDevelop.ts`)

Pure functions, no WebGL and no store, matching how `hyperbolic.ts` is written so the maths is
unit-testable. Runs client-side at load time (not baked to JSON), so Phase 2/3 re-development stays open
and the shipped data stays small.

Input: a combinatorial tiling spec giving the vertex configuration(s) and edge adjacency, the same
information Marek's solver emits. Phase 1 builds this from the existing Wythoff params; the type is general enough to
accept solver output in Phase 3.

Algorithm (the spherical developer with the metric flipped):

1. Solve the single global edge length ℓ. A vertex closes when Σ α(pᵢ, ℓ) = 2π, where
   α(p, ℓ) = 2·asin( cos(π/p) / cosh(ℓ/2) ). Bisection to the root; for a regular {p,q} this agrees with
   the closed form cosh(ℓ/2) = cos(π/p)/sin(π/q). This is the hyperbolic twin of the spherical ρ-solve
   and of Marek's `arcmedge`.
2. Flood-fill. State per dart is an SU(1,1) frame g. A vertex position is g applied to the disk origin.
   `rneig` (next dart around a vertex) post-multiplies g by a rotation through the tile's interior angle;
   `glue` (cross an edge) post-multiplies by a translation of length ℓ along the edge geodesic, reusing
   `su11Rotation`, `su11Translation`, `su11CrossEdge` from `hyperbolic.ts`. Faces are walked by
   `F(h) = glue[rneig[h]]`, exactly as in the sphere developer.
3. No closure. The hyperbolic plane is infinite, so flood-fill is bounded by patch depth (BFS until tiles
   fall outside a disk radius near 1, e.g. r > 0.9995), producing a finite patch that fills the viewport.
   This mirrors the `cap`/`keep_r` bound already used in
   [experiments/hyperbolic/render_poincare.py](../../../experiments/hyperbolic/render_poincare.py).

Output: a developed patch, a list of tiles, each carrying its Poincaré-disk vertices (geodesic edges
implied between consecutive vertices) and a hue, so the renderer reproduces the current per-cell coloring.

### Component 2: tile-angle alphabet + edge-length solver

The geometric side of the palette, the role of Marek's `let(...)` lines. A tile type maps to an
interior-angle contribution at the global edge length. Phase 1 is regular only: `α(p, ℓ)` from the
formula above (`regangle(1,n)`). Kept as a small table so Phase 2 can add the non-regular and apeirogon
cases (`π/5`, `regangle(2,inf)`, …) without touching the developer. The Newton edge-length solver lives
here, ported to TS from `hyp_realize.py` and unit-tested against its closed forms.

### Component 3: the unified shader renderer (`lib/render/hyperbolicShader.ts`)

This is "keep the shader" made precise. Today the fragment shader folds each pixel into the (2,p,q)
Schwarz triangle, which is Wythoff-only. It is rewritten to render the developer's explicit geometry:
draw the developed tiles, doing per-pixel geodesic-edge antialiasing under the same Möbius view transform.
The result stays one shader-rendered path with the current crispness; the only change is what it is fed
(developed tiles, not `p, q, rings`). Per-cell hue and edge styling carry over so the look matches.

### Navigation

Unchanged. Panning and zoom are SU(1,1) Möbius transforms applied to the view (`panToB`, `su11*`, `mobius`
in `hyperbolic.ts`), independent of how tiles are generated. The new renderer applies the same view
transform to the developed vertices before projection, so the feel is identical. The pre-developed patch
is sized so its edge stays off-screen for any reasonable pan; seamless infinite pan (re-develop on move)
is deferred.

### Atlas data-model change (`public/reference-atlas-hyperbolic.json`)

Entries currently carry `wythoff: { p, q, rings }`, consumed by the triangle-group shader. They move to
carrying (or referencing) a combinatorial tiling spec the developer consumes. For Phase 1 the regular and
Wythoffian specs are generated programmatically from the existing `wythoff` params, so the migration is
mechanical and the entry set (the same 22) is preserved. `schlafli`, `family`, `note`, `discoverer` are
unchanged; only the render-driving field changes. `components/hyperbolic-canvas.tsx` is rewired to run the
developer and feed the renderer.

## Testing strategy

- Edge-length solver, unit: matches the closed form cosh(ℓ/2)=cos(π/p)/sin(π/q) to ≤1e-12 for {7,3},
  {8,3}, {5,4}, and rejects the spherical/Euclidean cases ({5,3}, {4,4}, {3,6}). Same assertions
  `hyp_realize.py` already passes, ported to Vitest.
- Developed patch, unit: every developed tile is a regular polygon (equal edge lengths, correct interior
  angle within tolerance), all vertices lie inside the unit disk, and adjacent tiles share an edge
  (endpoint coincidence within tolerance).
- Cross-check against the validated prototype: {3,8} and {8,4} develop at ℓ ≈ 1.528570919, the length
  `render_poincare.py` produced for its figures. A commensurability check, not just a smoke test.
- Visual parity, Playwright: screenshot the new renderer for {7,3}, {8,3}, {5,4} and a truncated form
  (e.g. 4.6.14) and compare to the current shader output at the same viewport. This is the
  flag-on/flag-off parity method used for the Euclidean shader (M1b) and the spherical shelf.
- `pnpm build` stays green (the CLAUDE.md workflow rule): the developer is client-safe pure TS, the
  renderer change is local to the hyperbolic path.

## Risks and open questions

- **Crispness gap.** The analytic triangle-group shader is infinite-resolution; explicit geometry drawn
  under a fragment shader with geodesic-edge AA should match, but this is the load-bearing visual risk and
  is why the Playwright side-by-side is a gate, not a nicety. If a tile-fill approach looks softer, fall
  back to per-pixel geodesic distance in the shader rather than triangulated fills.
- **Patch size vs pan.** A finite patch can be panned off its edge. Phase 1 picks a radius that covers
  reasonable panning; if it is not enough, re-development on pan (Phase 2+) is the fix, not a bigger bake.
- **Combinatorial spec shape.** The spec type must be general enough that Phase 3 solver output slots in
  without a rewrite, while Phase 1 fills it from Wythoff. Getting this interface right is the main design
  care in the plan; if it leaks Wythoff assumptions, Phase 3 pays for it.
- **Snub forms** are chiral and have valence-5 vertices; confirm the flood-fill orients them consistently
  (the sphere developer's `sign` parameter is the precedent).

## Verification checklist (Phase 1 done when)

1. The developer produces a valid patch for all 22 existing tilings (unit tests green).
2. Edge-length and geometry unit tests pass, including the {3,8}/{8,4} commensurability cross-check.
3. Playwright side-by-side shows the new renderer matching the current look for the sampled tilings.
4. Navigation (pan/zoom) is unchanged, confirmed live.
5. `pnpm build` is green and the atlas still lists the same 22 entries, now engine-developed.
