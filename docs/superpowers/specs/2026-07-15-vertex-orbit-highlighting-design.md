# Vertex-orbit highlighting (colored vertex dots)

Date: 2026-07-15
Status: approved design, pre-implementation
Author: CC (with AL), from Marek's suggestion

## Goal

A toggle that overlays a colored dot on every vertex of the displayed tiling, colored by the vertex's
**orbit** under the tiling's symmetry group. For a k-uniform tiling this shows exactly k colors, one per
orbit. When the toggle is on, the tiling's fill opacity drops so the dots stand out. Dot fill is the orbit
color; the dot outline is black on a light theme and white on a dark theme.

## Scope

In scope: the Euclidean flat view (`components/canvas.tsx`, the p5 grid).

Out of scope, by decision:
- **Hyperbolic** (`components/hyperbolic-canvas.tsx`). The hyperbolic view renders only *uniform*
  (Wythoff) tilings, which are vertex-transitive: one vertex orbit, so orbit coloring is a single color.
  Deferred until the hyperbolic view can render k-uniform tilings. When revisited, the natural
  implementation is in-shader (test each folded pixel's hyperbolic distance to the Wythoff vertex point),
  which gives correctly distorted dots that track pan/rotation for free.
- **Inversive** (`components/inversive-canvas.tsx`).

## Settled decisions (from brainstorming)

1. Euclidean only for now (see above).
2. Dim style: lower the tiling's **fill opacity** when dots are on (not desaturation).
3. Orbit source: the existing exact engine (`KUniformityChecker.vertexOrbits`), computed in-browser from
   the tiling's `exactSource`, not a new float-based symmetry detection.

## Why this approach

The orbit engine already exists and is the enumeration pipeline's own correctness gate. The static figure
exporter already draws exactly this (colored marker per vertex orbit) via `assignOrbits` →
`orbitOfCorner`, and the live symmetry overlay already deserializes `exactSource` in-browser
(`lib/hooks/useSymmetryData.ts`, `lib/services/oracleSymmetry.ts`). So the work is wiring, not new math.
The rejected alternative, recomputing orbits from the float `renderCell`, reintroduces float-robustness
problems the exact engine was built to avoid.

## Components

### 1. Store flag

Add `showVertexOrbits: boolean` (default `false`) to the Display-toggles block in
`lib/stores/configuration.ts`, with its default alongside the others. No new setter: reuse the existing
bulk `set({ showVertexOrbits: v })`.

### 2. Toggle UI

A `Checkbox` in the "Advanced options" `SidebarSection` of `components/sidebar/tilings-tab.tsx`, wired
`checked={cfg.showVertexOrbits} onCheckedChange={(v) => setCfg({ showVertexOrbits: v })}`, matching the
adjacent `showPolygonPoints` toggle. Label "Show Vertex Orbits".

### 3. Orbit data service

New browser-safe `lib/services/orbitsFromExactSource.ts`, the core of `figures/tiling/orbits.ts` minus
`node:fs`/caching/vc-name computation:

```
orbitsFromExactSource(ring, id, source: ExactCellSource): { k: number; orbitOfCorner: number[][] } | null
```

It resolves the exact `PeriodCell` exactly as `symmetryFromExactSource` does (seed →
`reconstructOracleCell`, or `cell` → `deserializeCell`), then:

```
const res = new KUniformityChecker().vertexOrbits(cell.cellPolygons, cell.basisExact[0], cell.basisExact[1]);
if (!res) return null;
const orbitOfCorner = cell.cellPolygons.map(p => p.exactVertices!.map(vx => res.orbitOf(vx) ?? -1));
return { k: res.orbits, orbitOfCorner };
```

`orbitOfCorner[polyIndex][cornerIndex]` is the orbit id per exact cell-polygon corner; `-1` marks a
non-vertex (e.g. a Myers dent-fill point). Orbits are lattice-invariant, so a base corner's id is correct
for every replicated copy. Returns `null` when the record has no `exactSource` (and no Supabase codec).

### 4. Data hook

`lib/hooks/useVertexOrbits.ts`, mirroring `useSymmetryData` one-for-one: a `Map`-cached, per-tiling,
selection-time computation returning `{ k, orbitOfCorner } | null`. Runs once per tiling, never per frame.
Called in `app/(app)/play/_play-client.tsx` next to `useSymmetryData`, producing an `orbitData` value.

### 5. Prop threading

`Canvas` gains an `orbitData?: { k: number; orbitOfCorner: number[][] } | null` prop, passed from
`_play-client.tsx` beside `symmetryData`. `buildTilingFromCell` receives `orbitData` and attaches the
per-corner id array to each base polygon (`poly.orbitOfCorner = mapForBaseIndex(bi)`).
`GenericPolygon.translatedCopy` must copy this field so replicas inherit it.

Mapping a rendered vertex to an orbit id: the exact cell and the float `renderCell` describe the same
tiling in the same world frame (the symmetry overlay already relies on this alignment). Primary path is
index alignment (`renderCell` polygon `i`, corner `j` ↔ exact corner `[i][j]`), guarded by a per-polygon
corner-count check; fallback is a position-keyed lookup (quantized float vertex → orbit id) built once from
the exact cell. If neither resolves a corner, its id is `-1`.

**Verification gate (do this first).** Confirm on a k=2 and a k=3 tiling that dots land exactly on
vertices and the number of distinct colors equals k. If the primary index path is wrong for the
`{T1,T2,Seed}` reconstruction (polygon order may differ from `renderCell`), the position fallback carries
it; validate which path is actually load-bearing before building the rest.

### 6. Drawing

New method `Tiling.drawVertexOrbits(ctx, dark, cull?)`, modeled on the existing dot loop at
`lib/classes/Tiling.ts:130-141`. Per node, per corner with `orbitOfCorner[corner] >= 0`, draw a filled
circle at the vertex:

- radius constant in screen space (`r / zoom`, r ≈ 5px, as the existing dots do),
- fill = orbit color for that id,
- outline = black (`ctx.stroke(0, 0, 0)`) on light theme, white (`ctx.stroke(0, 0, 100)`) on dark, read
  once via `document.documentElement.classList.contains("dark")` (the established in-loop theme read).

Called from `drawTiling` in `components/canvas.tsx` when `cfg.showVertexOrbits` is on. Suppressed during
the selection transition (when `scaleOf` is active, as polygon points already are) and while the
symmetry-elements or Islamic overlays are active (they reserve color for other marks).

Shared vertices produce overlapping identical dots (same orbit, same position); harmless. Optional
dedupe by quantized position if it ever matters for fill-count; not required for correctness.

### 7. Orbit palette

New `lib/utils/orbitColors.ts`: the Okabe–Ito `ORBIT_COLORS` from `figures/style/palette.ts` ported to the
p5 HSB model (7 colorblind-safe entries), indexed `orbitColors[id % orbitColors.length]`. Using the same
palette keeps the web view and the thesis figures in agreement.

### 8. Dim

In `drawTiling`, pass a reduced opacity when the toggle is on:
`tiling.show(p5, cfg.showPolygonPoints, cfg.showVertexOrbits ? 0.3 : 1, cfg.circlePacking, cull, scaleOf)`.
`Tiling.show` already fades fill and stroke by its `opacity` argument, so no new draw code is needed. The
0.3 value is a starting point, tunable during the runtime check.

## Fallback

Records without `exactSource` (and no Supabase cell codec) yield `orbitData === null`. The toggle still
draws a dot on every vertex, all in a single neutral color (orbit id 0). The toggle always highlights
vertices; it just cannot partition them by orbit when the exact cell is unavailable.

## Testing

- Unit: `orbitsFromExactSource` on a known k=1 (all one orbit), k=2, and k=3 fixture returns `k` matching
  the certified value and an `orbitOfCorner` whose distinct non-`-1` ids number exactly `k`. This mirrors
  the hard-fail cross-check `ensureOrbits` already performs.
- Runtime (the verification gate above): toggle on for a k=2 and k=3 tiling, confirm dots sit on vertices,
  color count equals k, outline flips with theme, and the tiling dims.
- Regression: toggle off restores the prior render exactly; no per-frame recomputation (orbit data is
  computed once per selection).

## Files touched

- `lib/stores/configuration.ts` (flag + default)
- `components/sidebar/tilings-tab.tsx` (checkbox)
- `lib/services/orbitsFromExactSource.ts` (new)
- `lib/hooks/useVertexOrbits.ts` (new)
- `lib/utils/orbitColors.ts` (new)
- `app/(app)/play/_play-client.tsx` (hook + prop)
- `components/canvas.tsx` (prop, thread into `buildTilingFromCell`, dim, call draw)
- `lib/classes/Tiling.ts` (`drawVertexOrbits`)
- `lib/classes/polygons/GenericPolygon.ts` (carry `orbitOfCorner` through `translatedCopy`)
