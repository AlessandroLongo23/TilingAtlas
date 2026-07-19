# Tiling spec card (/play info panel) — design

Status: approved (AL, 2026-07-19). Ready for an implementation plan.

## Problem

The `/play` info panel ([tiling-info.tsx](../../../components/tiling-info.tsx)) shows one number —
tiles rendered — which carries no real information about the tiling. Replace it with a hover-expanded
spec card that reports the tiling's structure, geometry-aware: only the fields that make sense for the
active geometry appear.

## Requested fields (AL)

Symmetry, wallpaper group, lattice shape, `k` (vertex orbits), `m` (distinct vertex configurations,
`m ≤ k`), edge orbits, tile/face orbits. Wire in what the data already supports; put a flag on the
rest for AL to fill the extraction logic later.

## Data inventory

Three sources feed the panel. What each currently carries:

- **The selected tiling** (`CatalogueTiling`, mapped from `ReferenceTiling`): `k`, `family`,
  `schlafli`, `wythoff`, `spherical`, `geometry`. `ReferenceTiling` *also* holds `m`, `partition`,
  `wallpaperGroup`, `latticeShape` (build-computed), but `referenceToCatalogue`
  ([referenceAtlas.ts](../../../lib/services/referenceAtlas.ts)) drops those four at the boundary, so
  the play client never sees them. Re-add them to `CatalogueTiling` and to the mapper — a pass-through,
  no new computation.
- **`useSymmetryData(selected)`** — already wired into the play client. Gives `group`, `orbifold`,
  `latticeShape`, `pointGroupOrder` from exact analysis. Euclidean-regular only (async, per selection).
- **`useVertexOrbits(selected)`** — already wired. Gives `k` (vertex orbit count). Euclidean only.

Pure-math derivable, no pipeline change:
- Hyperbolic: triangle group `[p,q]` and its orbifold `*p q 2` from `{p,q}`.
- Spherical: point group (Td / Oh / Ih) and `V`, `E`, `F` from `{p,q}` via Euler (`V − E + F = 2`).

Genuinely missing (needs AL's logic): **edge orbits**, **tile/face orbits**. `edgeOrbits` exists in
the Delaney-symbol code ([DSymbol.ts](../../../lib/classes/algorithm/delaney/DSymbol.ts)) but is not
connected to these tilings.

## Geometry → fields

| Field | Euclidean | Hyperbolic | Spherical | Source |
|---|---|---|---|---|
| Schläfli / VC label | ✓ `family` | ✓ `{p,q}` | ✓ `{p,q}` + solid | selected |
| Wallpaper group + orbifold | ✓ | n/a | n/a | symmetryData ∥ selected.wallpaperGroup + `ORBIFOLD_SIGNATURE` |
| Lattice shape | ✓ | n/a | n/a | symmetryData ∥ selected.latticeShape |
| Symmetry group | (wallpaper) | ✓ `[p,q]`, `*pq2` | ✓ Td/Oh/Ih, `*532`… | derived from `{p,q}` / solid |
| Vertices `k` | ✓ | ✓ (1 regular) | ✓ (1 regular) | selected.k |
| VC types `m` + partition | ✓ | ✓ | ✓ | selected.m / selected.partition |
| Edge orbits | flag | flag | flag | — not computed |
| Tile/face orbits | flag | flag | flag | — not computed |
| V / E / F | — | — (infinite) | ✓ exact | derived from `{p,q}` |
| Wythoff rings | — | ✓ | — | selected.wythoff |

`∥` = prefer the first source, fall back to the second.

## Card layout (hover-expanded)

```
EUCLIDEAN                    HYPERBOLIC                  SPHERICAL
┌ TILING SPEC ──────────┐    ┌ TILING SPEC ─────────┐    ┌ TILING SPEC ─────────┐
│ 3.4.6.12 · Euclidean  │    │ {7,3} · Hyperbolic    │    │ {5,3} · Spherical     │
│                       │    │                       │    │ Dodecahedron          │
│ SYMMETRY              │    │ SYMMETRY              │    │ SYMMETRY              │
│ Group    p6m  (*632)  │    │ Group   [7,3] (*732)  │    │ Group    Ih  (*532)   │
│ Lattice  hexagonal    │    │ Wythoff 7|3 2  ●○○    │    │                       │
│                       │    │                       │    │ COUNTS (V−E+F=2)      │
│ ORBITS               │    │ ORBITS               │    │ Vertices     20       │
│ Vertices(k)  7        │    │ Vertices(k)  1        │    │ Edges        30       │
│ VC types(m)  3 [5·1·1]│    │ Edges        — flag   │    │ Faces        12       │
│ Edges        — flag   │    │ Tiles        — flag   │    │                       │
│ Tiles        — flag   │    └───────────────────────┘    └───────────────────────┘
│                       │
│ [vc][vc][vc] thumbs   │
└───────────────────────┘
```

Collapsed state stays the current `Info` icon button; hover expands the card (unchanged interaction).
VC thumbnails render for Euclidean only (they are canvas-computed and meaningless on the sphere/disk).
Sections with no applicable field for the active geometry are omitted, not shown empty.

## Architecture

Keep the card mounted inside `canvas.tsx` (it already renders over every geometry via the always-mounted
flat canvas). Feed it one new `spec` prop — a plain, serializable object built in the play client and
threaded through `Canvas` → `TilingInfo`.

- **`lib/services/tilingSpec.ts`** — pure `buildTilingSpec(selected, symmetryData, orbitData): TilingSpec`.
  No React, no side effects; unit-testable in isolation. Owns every derivation (triangle group, spherical
  point group, V/E/F, orbifold lookup, source preference). Returns a discriminated union on `geometry`
  so the presenter never re-decides which fields apply.
- **`buildTilingSpec` is called in the play client** ([_play-client.tsx](../../../app/(app)/play/_play-client.tsx)),
  which already holds `selected`, `symmetryData`, `orbitData`. The result passes into `Canvas` as `spec`.
- **`tiling-info.tsx`** becomes a pure presenter: it renders the sections `spec` carries, plus the
  Euclidean-only `vcs` thumbnails it still receives from canvas. The `tileCount` prop and the
  tiles-in-view line are removed entirely (AL, 2026-07-19).

Rejected alternative: lift the whole panel up to the play client. Cleaner on paper, but it loses direct
access to canvas's live `vcs`, so the `spec`-prop route wins.

## Flag for AL's later logic

Edge orbits and tile/face orbits render as a muted "not computed" row, gated by a single
`EDGE_FACE_ORBITS_ENABLED = false` constant. When AL adds extraction, `buildTilingSpec` fills the two
`spec` fields and the flag flips to `true` — one boolean plus one function, no layout change.

## Out of scope

- Actual edge/face-orbit extraction (flagged only).
- Per-tiling exact symmetry for snub/uniform hyperbolic forms — the card shows the ambient `[p,q]`
  reflection group and notes `snub` when `wythoff.snub`; a subgroup refinement is a later pass.
- Any change to the WebGL renderers or the symmetry overlay.

## Verification

- Unit-test `buildTilingSpec` on one representative per geometry (a Euclidean k-uniform with `m < k`,
  a regular `{p,q}` hyperbolic, a Platonic spherical) — assert the exact fields present/absent.
- Visual check via Playwright: capture the hover-expanded card on one tiling per geometry, Read the PNGs.
- `pnpm build` clean before reporting done.
