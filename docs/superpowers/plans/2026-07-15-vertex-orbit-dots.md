# Vertex-Orbit Dots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Euclidean-only "Show Vertex Orbits" toggle that draws a colored dot on every tiling vertex, colored by the vertex's symmetry orbit (k colors for a k-uniform tiling), dimming the tiling so the dots stand out.

**Architecture:** Compute an orbit id per vertex once per selected tiling, in-browser, from the tiling's exact cell (`exactSource`) via the existing `KUniformityChecker.vertexOrbits`. Expose it as a position→orbit lookup (verified empirically: `renderCell` and the reconstructed exact cell share one coordinate frame, so absolute float position keys the lookup exactly). Attach the orbit id to each base polygon's corners at grid-build time; replicated copies inherit it through `translatedCopy`. Draw dots in the p5 draw loop; dim the tiling via `Tiling.show`'s existing opacity argument.

**Tech Stack:** Next.js 16 / React 19, Zustand, p5.js (HSB color mode), Vitest, exact cyclotomic arithmetic (`@/classes/Cyclotomic`).

---

## Background the engineer needs

- The Euclidean canvas ([components/canvas.tsx](../../../components/canvas.tsx)) builds a `Tiling` from a float `renderCell` via `buildTilingFromCell`, replicating one cell of base polygons across the lattice by translation. Base polygons are `GenericPolygon`; replicas are made by `GenericPolygon.translatedCopy`.
- The orbit engine `KUniformityChecker.vertexOrbits(cellPolygons, u, v)` ([lib/classes/algorithm/KUniformityChecker.ts](../../../lib/classes/algorithm/KUniformityChecker.ts)) returns `{ orbits, block, orbitOf }` where `orbits` is k, `block` is a replicated exact patch of `Polygon`s (each with `exactVertices`), and `orbitOf(v)` is an exact lattice-class lookup. It requires the **active ring** to be set (`setActiveRing(ring)`).
- The tiling's exact cell comes from `exactSource` (`ExactCellSource`, [lib/services/cellCodecService.ts](../../../lib/services/cellCodecService.ts)): `{ kind: "seed", T1, T2, Seed }` (reconstructed by `reconstructOracleCell`) or `{ kind: "cell", cell }` (deserialized by `deserializeCell`). The live symmetry overlay already does this in-browser ([lib/services/oracleSymmetry.ts](../../../lib/services/oracleSymmetry.ts), [lib/hooks/useSymmetryData.ts](../../../lib/hooks/useSymmetryData.ts)) — mirror that pattern.
- **Do NOT map by polygon index.** `reconstructOracleCell` orders its `cellPolygons` by face tracing, unrelated to `renderCell` order. Map by absolute vertex position instead (proven correct across 2709 records, k=2 and k=7).
- Theme read inside a draw loop is `document.documentElement.classList.contains("dark")` (no hook/store), as [lib/classes/Tiling.ts:66](../../../lib/classes/Tiling.ts#L66) already does.
- p5 canvas color mode is HSB `(360, 100, 100)`. `fill(h, s, b)` / `stroke(h, s, b)`; white = `(0, 0, 100)`, black = `(0, 0, 0)`.
- Test runner: `pnpm vitest run <path>` for one file. Full build (type check included): `pnpm build`.

## File structure

- Create `lib/utils/orbitColors.ts` — Okabe–Ito orbit palette in HSB + hex→HSB converter.
- Create `lib/services/orbitsFromExactSource.ts` — exact cell → `{ k, orbitAt(x,y) }`.
- Create `lib/hooks/useVertexOrbits.ts` — per-tiling memoized hook (mirrors `useSymmetryData`).
- Create `tests/orbit-colors.test.ts`, `tests/orbits-from-exact-source.test.ts`.
- Modify `lib/stores/configuration.ts` — `showVertexOrbits` flag + default.
- Modify `lib/classes/polygons/Polygon.ts` — `orbitOfCorner?` field.
- Modify `lib/classes/polygons/GenericPolygon.ts` — carry the field through `translatedCopy`.
- Modify `lib/classes/Tiling.ts` — `drawVertexOrbits` method.
- Modify `components/canvas.tsx` — `orbitData` prop, thread into `buildTilingFromCell`, dim + draw.
- Modify `app/(app)/play/_play-client.tsx` — call the hook, pass the prop.
- Modify `components/sidebar/tilings-tab.tsx` — the checkbox.

---

## Task 1: Orbit color palette

**Files:**
- Create: `lib/utils/orbitColors.ts`
- Test: `tests/orbit-colors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/orbit-colors.test.ts
import { describe, it, expect } from "vitest";
import { hexToHsb, ORBIT_COLORS_HSB, orbitColor } from "@/lib/utils/orbitColors";

describe("orbitColors", () => {
  it("converts Okabe-Ito blue (0072B2) to HSB ~ (202, 100, 70)", () => {
    const { h, s, b } = hexToHsb("0072B2");
    expect(h).toBeGreaterThanOrEqual(200);
    expect(h).toBeLessThanOrEqual(204);
    expect(s).toBe(100);
    expect(b).toBe(70);
  });

  it("has 7 colorblind-safe orbit colors", () => {
    expect(ORBIT_COLORS_HSB).toHaveLength(7);
    for (const c of ORBIT_COLORS_HSB) {
      expect(c.h).toBeGreaterThanOrEqual(0);
      expect(c.h).toBeLessThanOrEqual(360);
      expect(c.s).toBeGreaterThanOrEqual(0);
      expect(c.b).toBeGreaterThanOrEqual(0);
    }
  });

  it("cycles orbit ids past the palette length and clamps negatives", () => {
    expect(orbitColor(7)).toEqual(orbitColor(0));
    expect(orbitColor(-1)).toEqual(orbitColor(6));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/orbit-colors.test.ts`
Expected: FAIL — cannot resolve `@/lib/utils/orbitColors`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/utils/orbitColors.ts
// Vertex-orbit marker palette. Okabe–Ito (colorblind-safe), the SAME order the thesis figure exporter
// uses (figures/style/palette.ts ORBIT_COLORS), converted to the p5 HSB model so the web canvas and the
// thesis figures agree on which color is which orbit.

export type Hsb = { h: number; s: number; b: number };

/** Convert a 6-hex-digit RGB string (no '#') to HSB with h in [0,360], s,b in [0,100]. */
export function hexToHsb(hex: string): Hsb {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const bl = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, bl);
  const min = Math.min(r, g, bl);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - bl) / d) % 6);
    else if (max === g) h = 60 * ((bl - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  return { h: Math.round(h), s: Math.round(s * 100), b: Math.round(max * 100) };
}

// Okabe–Ito hex in the figures ORBIT_COLORS order: blue, vermillion, green, purple, orange, skyBlue, yellow.
const ORBIT_HEX = ["0072B2", "D55E00", "009E73", "CC79A7", "E69F00", "56B4E9", "F0E442"];

export const ORBIT_COLORS_HSB: Hsb[] = ORBIT_HEX.map(hexToHsb);

/** Orbit id → HSB color, cycling past the palette length; negative ids clamp into range. */
export function orbitColor(id: number): Hsb {
  const n = ORBIT_COLORS_HSB.length;
  return ORBIT_COLORS_HSB[((id % n) + n) % n];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/orbit-colors.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/utils/orbitColors.ts tests/orbit-colors.test.ts
git commit -m "feat(canvas): Okabe-Ito vertex-orbit palette (HSB)"
```

---

## Task 2: Orbit lookup service

**Files:**
- Create: `lib/services/orbitsFromExactSource.ts`
- Test: `tests/orbits-from-exact-source.test.ts`

- [ ] **Step 1: Write the failing test**

The fixture is the real atlas record `t2001` (a k=2 galebach tiling), embedded so the test does not read the 12 MB atlas. The test reconstructs the same cell independently to obtain vertex positions, then checks that `orbitAt` partitions them into exactly k orbits.

```ts
// tests/orbits-from-exact-source.test.ts
import { describe, it, expect } from "vitest";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { reconstructOracleCell } from "@/classes/algorithm/oracleCellReconstruct";
import { orbitsFromExactSource } from "@/lib/services/orbitsFromExactSource";
import type { ExactCellSource } from "@/lib/services/cellCodecService";

// Real atlas record t2001 (k=2). {T1,T2,Seed} in the ζ12 power basis. `kind` is `as const` so the
// fixture's own type keeps T1/T2/Seed directly accessible (an ExactCellSource union would hide them),
// while still being assignable to ExactCellSource where the service needs it.
const T2001 = {
  kind: "seed" as const,
  T1: [0, 2, 2, 2],
  T2: [2, 4, 0, -2],
  Seed: [
    [0, 0, 0, 0], [0, 1, 0, 1], [0, 1, 1, 1], [0, 2, 0, -1], [0, 2, 0, 0], [0, 2, 1, 0],
    [0, 2, 1, 2], [0, 3, 1, 0], [0, 3, 1, 1], [0, 3, 2, 1], [1, 3, 1, 1], [1, 3, 1, 0],
    [1, 4, 1, 1], [1, 4, 1, -1], [2, 4, 0, -1], [1, 5, 1, -1], [1, 5, 1, 0], [2, 5, 1, 0],
  ],
};

describe("orbitsFromExactSource", () => {
  it("returns k=2 and partitions the cell's vertices into 2 orbits", () => {
    const ring = CyclotomicRing.create(24);
    setActiveRing(ring);

    const data = orbitsFromExactSource(ring, "t2001", T2001 satisfies ExactCellSource);
    expect(data).not.toBeNull();
    expect(data!.k).toBe(2);

    // Independently reconstruct the cell to get its vertex positions.
    const rec = reconstructOracleCell(ring, "t2001", { T1: T2001.T1, T2: T2001.T2, Seed: T2001.Seed });
    expect("cell" in rec).toBe(true);
    const cell = (rec as { cell: { cellPolygons: { exactVertices?: unknown[] }[] } }).cell;

    const orbits = new Set<number>();
    for (const poly of cell.cellPolygons) {
      for (const vx of (poly as { exactVertices: { toVector(): { x: number; y: number } }[] }).exactVertices) {
        const p = vx.toVector();
        const o = data!.orbitAt(p.x, p.y);
        expect(o).toBeGreaterThanOrEqual(0); // every cell corner is a real tiling vertex
        orbits.add(o);
      }
    }
    expect(orbits.size).toBe(2);
  });

  it("returns null on a degenerate seed rather than throwing", () => {
    const ring = CyclotomicRing.create(24);
    setActiveRing(ring);
    const bad: ExactCellSource = { kind: "seed", T1: [0, 0, 0, 0], T2: [0, 0, 0, 0], Seed: [[0, 0, 0, 0]] };
    expect(orbitsFromExactSource(ring, "bad", bad)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/orbits-from-exact-source.test.ts`
Expected: FAIL — cannot resolve `@/lib/services/orbitsFromExactSource`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/services/orbitsFromExactSource.ts
import type { CyclotomicRing } from "@/classes/Cyclotomic";
import { deserializeCell } from "@/classes/algorithm/cellCodec";
import { reconstructOracleCell } from "@/classes/algorithm/oracleCellReconstruct";
import { KUniformityChecker } from "@/classes/algorithm/KUniformityChecker";
import type { PeriodCell } from "@/classes/algorithm/PeriodSolver";
import type { ExactCellSource } from "@/lib/services/cellCodecService";

export type OrbitData = {
  /** Number of vertex orbits (= k for a k-uniform tiling). */
  k: number;
  /** Orbit id at an absolute float vertex position, or -1 if no vertex maps there. */
  orbitAt: (x: number, y: number) => number;
};

// Absolute-position key. renderCell and the reconstructed exact cell share one coordinate frame
// (verified empirically), and tiling edges are unit length, so quantizing to 1e-4 keys every distinct
// vertex uniquely with a ~5000x margin over the vertex spacing.
const key = (x: number, y: number) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;

/**
 * Orbit id per vertex of an oracle tiling, computed from its exact cell. Mirrors
 * symmetryFromExactSource: the caller must have set the active ring to `ring`. Returns null when the
 * cell cannot be reconstructed or the orbit gate is degenerate (caller then draws no orbit partition).
 */
export function orbitsFromExactSource(
  ring: CyclotomicRing,
  id: string,
  source: ExactCellSource,
): OrbitData | null {
  let cell: PeriodCell;
  if (source.kind === "seed") {
    const rec = reconstructOracleCell(ring, id, { T1: source.T1, T2: source.T2, Seed: source.Seed });
    if ("error" in rec) return null;
    cell = rec.cell;
  } else {
    cell = deserializeCell(ring, source.cell);
  }

  const res = new KUniformityChecker().vertexOrbits(
    cell.cellPolygons,
    cell.basisExact[0],
    cell.basisExact[1],
  );
  if (!res) return null;

  // Key every vertex of the replicated block by absolute position. The block spans a ±3-cell window, so
  // it covers the whole base cell (and then some) — every base-polygon corner the canvas draws is found.
  const map = new Map<string, number>();
  for (const poly of res.block) {
    for (const vx of poly.exactVertices ?? []) {
      const o = res.orbitOf(vx);
      if (o == null) continue;
      const p = vx.toVector();
      map.set(key(p.x, p.y), o);
    }
  }

  return { k: res.orbits, orbitAt: (x, y) => map.get(key(x, y)) ?? -1 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/orbits-from-exact-source.test.ts`
Expected: PASS (2 tests). (First run may take a few seconds — the orbit gate replicates and searches symmetries.)

- [ ] **Step 5: Commit**

```bash
git add lib/services/orbitsFromExactSource.ts tests/orbits-from-exact-source.test.ts
git commit -m "feat(canvas): in-browser vertex-orbit lookup from exactSource"
```

---

## Task 3: Carry an orbit id per corner on the polygon

**Files:**
- Modify: `lib/classes/polygons/Polygon.ts` (field, near line 40 after `isStar?`)
- Modify: `lib/classes/polygons/GenericPolygon.ts:79-93` (`translatedCopy`)
- Test: `tests/orbits-from-exact-source.test.ts` (append)

- [ ] **Step 1: Write the failing test** (append to the existing file)

```ts
// append to tests/orbits-from-exact-source.test.ts
import { GenericPolygon } from "@/classes/polygons/GenericPolygon";
import { Vector } from "@/classes/Vector";

describe("GenericPolygon orbitOfCorner", () => {
  it("carries orbitOfCorner through translatedCopy", () => {
    const square = GenericPolygon.fromVertices([
      new Vector(0, 0), new Vector(1, 0), new Vector(1, 1), new Vector(0, 1),
    ]);
    square.orbitOfCorner = [0, 1, 0, 1];
    const moved = square.translatedCopy(5, 5);
    expect(moved.orbitOfCorner).toEqual([0, 1, 0, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/orbits-from-exact-source.test.ts`
Expected: FAIL — `moved.orbitOfCorner` is `undefined` (translatedCopy does not copy it).

- [ ] **Step 3: Write minimal implementation**

In `lib/classes/polygons/Polygon.ts`, add the field right after the `isStar?: boolean;` declaration (around line 40):

```ts
    /** Orbit id per vertex (index-aligned to `vertices`); -1 = not a tiling vertex. Set by
     *  buildTilingFromCell for the vertex-orbit overlay; undefined when no orbit data is available. */
    orbitOfCorner?: number[];
```

In `lib/classes/polygons/GenericPolygon.ts`, inside `translatedCopy` (after `p.isStar = this.isStar;`, line 87), add:

```ts
        p.orbitOfCorner = this.orbitOfCorner;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/orbits-from-exact-source.test.ts`
Expected: PASS (3 tests total).

- [ ] **Step 5: Commit**

```bash
git add lib/classes/polygons/Polygon.ts lib/classes/polygons/GenericPolygon.ts tests/orbits-from-exact-source.test.ts
git commit -m "feat(canvas): carry orbitOfCorner on polygons through translatedCopy"
```

---

## Task 4: Store flag

**Files:**
- Modify: `lib/stores/configuration.ts` (field declaration ~line 37-45, default ~line 114-121)

- [ ] **Step 1: Add the flag to the state type**

In the "Display toggles" block (near `showConstructionPoints`), add:

```ts
	showVertexOrbits: boolean;
```

- [ ] **Step 2: Add the default**

In the defaults block (near the other `show*: false` defaults), add:

```ts
	showVertexOrbits: false,
```

- [ ] **Step 3: Verify it type-checks**

Run: `pnpm tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add lib/stores/configuration.ts
git commit -m "feat(canvas): showVertexOrbits store flag"
```

---

## Task 5: `Tiling.drawVertexOrbits`

**Files:**
- Modify: `lib/classes/Tiling.ts` (add method after `show`, before `drawIslamicStarFill` at line 150; add import at top)

- [ ] **Step 1: Add the import** at the top of `lib/classes/Tiling.ts` (with the other imports)

```ts
import { orbitColor } from "@/lib/utils/orbitColors";
```

- [ ] **Step 2: Add the method** (insert after the `show` method closes at line 148)

```ts
    /** Vertex-orbit overlay: one filled dot per tiling vertex, colored by its orbit id
     *  (node.orbitOfCorner), with a theme-colored outline. Constant on-screen size (world radius /
     *  zoom). `dark` picks the outline: white on a dark theme, black on a light one. Nodes with no
     *  orbit data fall back to a single color (orbit 0). Drawn inside the world transform, on top of
     *  the tiles; the caller suppresses it during the selection transition and in Islamic mode. */
    drawVertexOrbits = (ctx, dark: boolean, cull?: (c: Vector) => boolean): void => {
        const cfg = useConfiguration.getState();
        const zoom = cfg.controls.zoom;
        const diameter = 8 / zoom;
        ctx.strokeWeight(1.5 / zoom);
        ctx.stroke(0, 0, dark ? 100 : 0); // HSB: white on dark theme, black on light
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            if (cull && !cull(node.centroid)) continue;
            const oc = node.orbitOfCorner;
            const vs = node.vertices;
            for (let c = 0; c < vs.length; c++) {
                const o = oc ? oc[c] : 0; // no orbit data → single neutral color (orbit 0)
                if (o < 0) continue; // corner is not a tiling vertex (e.g. star dent-fill)
                const col = orbitColor(o);
                ctx.fill(col.h, col.s, col.b);
                ctx.ellipse(vs[c].x, vs[c].y, diameter, diameter);
            }
        }
    }
```

- [ ] **Step 3: Verify it type-checks**

Run: `pnpm tsc --noEmit`
Expected: no new errors. (`ctx` is untyped in this file, matching the existing `show`/`drawConstructionPoints` methods.)

- [ ] **Step 4: Commit**

```bash
git add lib/classes/Tiling.ts
git commit -m "feat(canvas): Tiling.drawVertexOrbits overlay method"
```

---

## Task 6: Thread `orbitData` through the canvas

**Files:**
- Modify: `components/canvas.tsx` — `OrbitData` import, `CanvasProps`, `buildTilingFromCell`, `propsRef`, `prevOrbitDataRef`, `ensureTiling` rebuild trigger, `drawTiling`.

- [ ] **Step 1: Add the import** (with the other imports at the top)

```ts
import type { OrbitData } from "@/lib/services/orbitsFromExactSource";
```

- [ ] **Step 2: Add the prop to `CanvasProps`** (in the interface at line 39-49)

```ts
	orbitData?: OrbitData | null;
```

- [ ] **Step 3: Attach orbit ids in `buildTilingFromCell`.**

Change the signature (line 199) to accept `orbitData`:

```ts
function buildTilingFromCell(cellData: TranslationalCellData, Ri: number, Rj: number, orbitData?: OrbitData | null): Tiling {
```

Inside the base-polygon loop, after `basePolys.push(poly);` (line 238), add:

```ts
			if (orbitData) poly.orbitOfCorner = poly.vertices.map((v) => orbitData.orbitAt(v.x, v.y));
```

- [ ] **Step 4: Destructure the prop and put it on `propsRef`.**

In the `Canvas` function signature (line 257-265) add `orbitData = null` to the destructured params:

```ts
	orbitData = null,
```

Update the `propsRef` initializer (line 309) and its sync `useEffect` (line 310-312) to include `orbitData`:

```ts
	const propsRef = useRef({ width, height, translationalCell, translationalCellId, paramCell, symmetryData, orbitData });
	useEffect(() => {
		propsRef.current = { width, height, translationalCell, translationalCellId, paramCell, symmetryData, orbitData };
	}, [width, height, translationalCell, translationalCellId, paramCell, symmetryData, orbitData]);
```

- [ ] **Step 5: Add a rebuild trigger for `orbitData`.**

`orbitData` arrives asynchronously (the hook computes it after selection), so the grid must rebuild once when it changes to attach orbit ids to the base polygons. Add a ref next to the others (after `prevRotationRef`, line 286):

```ts
	const prevOrbitDataRef = useRef<OrbitData | null>(null);
```

In `ensureTiling`, read the current `orbitData` and include it in the rebuild condition. After the `cellChanged` computation (line 398-399), add:

```ts
					const orbitData = propsRef.current.orbitData ?? null;
					const orbitChanged = orbitData !== prevOrbitDataRef.current;
```

Change the rebuild guard (line 418) from:

```ts
					if (!tilingRef.current || ruleChanged || cellChanged) {
```

to:

```ts
					if (!tilingRef.current || ruleChanged || cellChanged || orbitChanged) {
```

Pass `orbitData` into the build call (line 422) and record it after a successful build (right after `prev.Rj = Rj;`, line 453):

```ts
							const t = buildTilingFromCell(tc, Ri, Rj, orbitData);
```
```ts
							prevOrbitDataRef.current = orbitData;
```

- [ ] **Step 6: Dim + draw in `drawTiling`.**

Replace the `drawTiling` body (line 461-470) with:

```ts
			const drawTiling = (
				cfg: ReturnType<typeof readCfg>,
				tiling: Tiling,
				cull?: (c: Vector) => boolean,
				scaleOf?: (c: Vector) => number,
			) => {
				const orbitMode = cfg.showVertexOrbits && !cfg.isIslamic;
				const opacity = orbitMode ? 0.3 : 1;
				if (cfg.exportGraphButtonHover) tiling.showGraph(p5);
				else tiling.show(p5, cfg.showPolygonPoints, opacity, cfg.circlePacking, cull, scaleOf);
				if (cfg.showConstructionPoints) tiling.drawConstructionPoints(p5);
				// Orbit dots ride on the same world transform, above the (dimmed) tiles. Skipped during the
				// selection transition (scaleOf active) so they don't float off the shrinking outline.
				if (orbitMode && !scaleOf) {
					const dark = document.documentElement.classList.contains("dark");
					tiling.drawVertexOrbits(p5, dark, cull);
				}
			};
```

- [ ] **Step 7: Verify it type-checks**

Run: `pnpm tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add components/canvas.tsx
git commit -m "feat(canvas): thread orbitData into the grid; dim + draw orbit dots"
```

---

## Task 7: Per-tiling orbit hook

**Files:**
- Create: `lib/hooks/useVertexOrbits.ts`

- [ ] **Step 1: Write the hook** (mirrors `useSymmetryData` one-for-one)

```ts
// lib/hooks/useVertexOrbits.ts
"use client";
import { useEffect, useState } from "react";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { createClient } from "@/lib/supabase/client";
import { fetchCellCodec } from "@/lib/services/cellCodecService";
import { orbitsFromExactSource, type OrbitData } from "@/lib/services/orbitsFromExactSource";
import type { CatalogueTiling } from "@/lib/services/catalogueService";

// Session cache keyed on canonicalKey. null = "no exact cell / gate failed", cached so it is not
// recomputed. Computed ONCE per tiling (on selection change), never per frame.
const cache = new Map<string, OrbitData | null>();

export function useVertexOrbits(tiling: CatalogueTiling | null): OrbitData | null {
  const [data, setData] = useState<OrbitData | null>(
    tiling ? cache.get(tiling.canonicalKey) ?? null : null,
  );
  useEffect(() => {
    if (!tiling) {
      setData(null);
      return;
    }
    const k = tiling.canonicalKey;
    if (cache.has(k)) {
      setData(cache.get(k) ?? null);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const ring = CyclotomicRing.create(24);
        setActiveRing(ring);
        if (tiling.exactSource) {
          const result = orbitsFromExactSource(ring, k, tiling.exactSource);
          cache.set(k, result);
          if (alive) setData(result);
          return;
        }
        const codec = await fetchCellCodec(createClient(), k);
        if (!codec) {
          cache.set(k, null);
          if (alive) setData(null);
          return;
        }
        const result = orbitsFromExactSource(ring, k, { kind: "cell", cell: codec });
        cache.set(k, result);
        if (alive) setData(result);
      } catch {
        if (alive) setData(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tiling]);
  return data;
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm tsc --noEmit`
Expected: no new errors. (If `tiling.exactSource` is not on `CatalogueTiling`, confirm the type in `lib/services/catalogueService.ts` — it should carry `exactSource?`, matching `useSymmetryData`.)

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/useVertexOrbits.ts
git commit -m "feat(canvas): useVertexOrbits per-tiling hook"
```

---

## Task 8: Wire the hook and prop in Play

**Files:**
- Modify: `app/(app)/play/_play-client.tsx` (import, call, pass prop)

- [ ] **Step 1: Add the import** (with the other hook imports)

```ts
import { useVertexOrbits } from "@/lib/hooks/useVertexOrbits";
```

- [ ] **Step 2: Call the hook** next to the existing `useSymmetryData(selected)` call (search for `symmetryData`):

```ts
	const orbitData = useVertexOrbits(selected);
```

- [ ] **Step 3: Pass the prop** to `<Canvas>` (the instance already receiving `symmetryData={symmetryData}`, around line 402-408):

```ts
					orbitData={orbitData}
```

- [ ] **Step 4: Verify it type-checks**

Run: `pnpm tsc --noEmit`
Expected: no new errors. (If `useSymmetryData` is called with a differently-typed `selected`, mirror that exact type for `useVertexOrbits`.)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/play/_play-client.tsx"
git commit -m "feat(canvas): compute + pass orbitData in Play"
```

---

## Task 9: The toggle checkbox

**Files:**
- Modify: `components/sidebar/tilings-tab.tsx` (the "Advanced options" `SidebarSection`, directly after the `showPolygonPoints` `Checkbox` — locate it by content; a concurrent change shifted line numbers)

- [ ] **Step 1: Add the checkbox** directly after the `showPolygonPoints` `Checkbox`.

Orbit dots are Euclidean-only, so gate the checkbox with `!isHyperbolic` exactly as the sibling flat-only controls (symmetry elements, fundamental domain) already are in this file. `isHyperbolic` is already defined in the component (`const isHyperbolic = !!selected?.wythoff;`). `showPolygonPoints` itself is NOT gated (it now works in hyperbolic too); the orbit checkbox IS:

```tsx
					{!isHyperbolic ? (
						<Checkbox
							id="showVertexOrbits"
							label="Show Vertex Orbits"
							shortcut="O"
							checked={cfg.showVertexOrbits}
							onCheckedChange={(v) => setCfg({ showVertexOrbits: v })}
						/>
					) : null}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm tsc --noEmit`
Expected: no new errors. (Confirm `Checkbox` is already imported in this file — it is, used by the adjacent toggles.)

- [ ] **Step 3: Commit**

```bash
git add components/sidebar/tilings-tab.tsx
git commit -m "feat(canvas): Show Vertex Orbits toggle"
```

---

## Task 10: Full build + runtime verification (the gate)

**Files:** none (verification only).

- [ ] **Step 1: Full build**

Run: `pnpm build`
Expected: build succeeds, no type errors, no new warnings. (Per project rule, `pnpm build` is the real gate — not just `tsc`/`lint`/`test`.)

- [ ] **Step 2: Run the whole test suite**

Run: `pnpm test`
Expected: all pass, including the two new test files.

- [ ] **Step 3: Runtime check** (`pnpm dev`, open `/play`)

Verify, on a **k=2** tiling (e.g. `t2001`) and a **k=3** tiling:
- Toggling "Show Vertex Orbits" on draws a dot on every vertex.
- The number of distinct dot colors equals k (2, then 3).
- Dots sit exactly on vertices (not offset) — this confirms the `renderCell`↔exact frame alignment holds at runtime, not just in the probe.
- The tiling dims (fill opacity drops) while dots are on; toggling off restores it exactly.
- Switching the theme flips the dot outline black↔white.
- Panning/zooming keeps dots on vertices across replicated tiles (inheritance through `translatedCopy`), constant on-screen dot size.
- A tiling with no `exactSource` (e.g. a Myers star tiling) still shows dots, all one color (fallback).

If dots are offset or the color count is wrong, the frame-alignment assumption failed for that record class. Stop and diagnose: in a throwaway `pnpm tsx` script, load that record from `public/reference-atlas.json`, call `orbitsFromExactSource`, and compare `orbitAt(v.x, v.y)` for every `renderCell` vertex against the exact block — a hit rate below 100% means `renderCell` and the reconstructed cell are in different frames (offset or rotated) for that class, and the lookup needs lattice-reduced keys (reduce each position mod the exact float basis before keying) instead of absolute ones.

- [ ] **Step 4: Final commit** (if the runtime check prompted a tweak, e.g. dot size or dim level)

```bash
git add -A
git commit -m "chore(canvas): tune vertex-orbit dot size/dim after runtime check"
```

---

## Notes / decisions carried from the spec

- Hyperbolic and inversive views are out of scope (hyperbolic uniform tilings are vertex-transitive → one orbit; deferred until k-uniform hyperbolic exists).
- Dim = lower fill opacity (`0.3`), not desaturation.
- Orbit source is the exact engine, not float symmetry detection.
- Index-based `orbitOfCorner` mapping was rejected after reading `reconstructOracleCell` (arbitrary polygon order); absolute-position lookup is used instead, verified across 2709 records.
