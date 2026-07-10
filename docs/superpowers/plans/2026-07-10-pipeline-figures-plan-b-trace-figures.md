# Pipeline Figures — Plan B: trace-driven process figures (F2, F3, F5, F6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render four static thesis figures from the frozen real search traces of the k=2 running example (fill 476) — the polygon set (F2), the VC search tree (F3), the vector pool + candidate lattices (F5), and the torus-fill DFS (F6) — as SVG (preview) + TikZ (thesis), reusing the existing `figures/` emitters.

**Architecture:** A new `figures/trace/` subsystem: load the JSONL traces → build a `FigureIR` (the flat geometry description the existing `emit/svg.ts` + `emit/tikz.ts` consume) → write `.svg` + `.tex`. Tree figures (F3/F6) share a layout + node-render + compose pipeline; each tree node is a real rendered partial (a fan of polygons for VC, a partial cell for torus). No exact arithmetic and no catalogue data — everything comes from the float geometry already in the traces.

**Tech stack:** TypeScript run under `tsx`, Vitest, the existing `figures/ir/types.ts` + `figures/style/palette.ts` + `figures/emit/{svg,tikz}.ts`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-10-algorithm-pipeline-figures-design.md`.
**Data source:** `figures/traces/running-example/{vc,pool,lattice,torus}.jsonl` + `manifest.json` (committed).

## Scope / decomposition

This plan does the **trace-driven process figures** only. Deliberately OUT of scope (separate follow-ups):
- **Plan C — outcome/framing figures:** F1 (pipeline overview), F3.5 (compat graph), F7 (k-uniformity by orbit), F8 (final tiling). These reuse the existing `buildCellModel` + `tilingFigure` (byOrbit/anatomy) pipeline and need the running example matched to a certified catalogue entry (its VCs are 3.4.6.4 + 3.6.3.6). Written after F2/F3/F5/F6 land.
- **F4 (seed BFS):** blocked on Plan A Task 3 (the `SeedBuilder` trace hook), deferred behind AL's live lookahead work — `seed.jsonl` is empty until then.

## The running example (from the frozen manifest)

- k=2, fill 476, latKey `1|-4,0,-1,0,2,0,1,0#1|0,0,0,0,-2,0,0,0`.
- Cell: 8 tiles — 4 triangles, 2 squares, 2 hexagons; VCs **3.4.6.4** and **3.6.3.6**.
- Winning lattice float basis (join `torus.latKey === lattice.candidates[].key`): `[[1, 1.7320508], [-3.8660254, 2.2320508]]`.
- Torus DFS: 18 nodes — 1 root, 6 place, 3 prune-P1, 6 prune-overlap, 1 contradiction, 1 emit.
- VC search: 64 nodes — 33 extend, 11 emit, 12 prune-angle-floor, 8 emit-dup.

## Trace data shapes (verified from the frozen files)

- `vc.jsonl`: `{ id:number, parentId:number, path:string[], angleSum:number, verdict:string }`. `path` is polygon corner sizes as strings, e.g. `["3","4","6","4"]`. `angleSum` in radians. verdict ∈ `extend | emit | emit-dup | reject-invalid | reject-wrap | prune-angle-floor`.
- `torus.jsonl`: `{ fillId:number, latKey:string, k?:number, id?:number, parentId?:number, reps?:{n:number,isStar:boolean,verts:[number,number][]}[], placedN?:number, stateKey?:string, verdict:string }`. verdict ∈ `root | place | dedup | cap-skip | contradiction | gate-reject | emit | reject-supercell | cert-fail | prune-overlap | prune-noprogress | prune-cap | prune-P1 | prune-P3`.
- `pool.jsonl`: `{ N:number, steps:number, lmax:number, dirs:number[], monotone:boolean, vectors:[number,number][] }`.
- `lattice.jsonl`: `{ vcSig:string, polySizes:number[], p0Skipped:number, cSkipped:number, orbitSkipped:number, candidates:{key:string, basis:[[number,number],[number,number]]}[] }`.

## File structure

| File | Responsibility |
|------|----------------|
| `figures/trace/loadTrace.ts` | JSONL → typed node arrays; the four record types |
| `figures/trace/geometry.ts` | `regularPolygonAtCorner`, `bboxOfPts`, `fitInto` (pure geometry) |
| `figures/style/palette.ts` (MODIFY) | add `tree:*` styleRefs (node box, tree edges, prune/success, ellipsis) |
| `figures/trace/polygonsFigure.ts` | F2 — a labeled row of regular n-gons |
| `figures/trace/treeLayout.ts` | tidy tree layout (id/parentId → box positions) |
| `figures/trace/treeFigure.ts` | compose node mini-renders + edges + labels → `FigureIR` |
| `figures/trace/curate.ts` | slice a large tree to a legible subtree (F3) |
| `figures/trace/poolFigure.ts` | F5 — pool arrows + candidate parallelograms + winner |
| `figures/trace/build-trace-figures.ts` | driver: read traces → emit F2/F3/F5/F6 `.svg`+`.tex` |
| `figures/out/trace/README.md` | how to `\includegraphics`/`\input` the figures |
| `tests/trace-figures.test.ts` | unit tests for the pure functions + smoke tests |

Output goes to `figures/out/trace/` (already gitignored via `figures/out/`). CC does not edit `../thesis`.

---

## Task 1: Trace loader + record types

**Files:**
- Create: `figures/trace/loadTrace.ts`
- Test: `tests/trace-figures.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/trace-figures.test.ts
import { describe, it, expect } from 'vitest';
import { loadTrace, type VcNode, type TorusNode } from '../figures/trace/loadTrace';

const EX = 'figures/traces/running-example';

describe('loadTrace', () => {
  it('loads vc nodes with the expected shape', () => {
    const vc = loadTrace<VcNode>(EX, 'vc');
    expect(vc.length).toBe(64);
    expect(vc[0]).toMatchObject({ id: 1, parentId: -1, verdict: 'extend' });
    expect(Array.isArray(vc[0].path)).toBe(true);
    expect(vc.filter((n) => n.verdict === 'emit').length).toBe(11);
  });

  it('loads torus nodes for fill 476 (18 nodes, root has reps)', () => {
    const torus = loadTrace<TorusNode>(EX, 'torus');
    expect(torus.length).toBe(18);
    const root = torus.find((n) => n.verdict === 'root')!;
    expect(root.k).toBe(2);
    expect(root.reps!.length).toBeGreaterThan(0);
    expect(Array.isArray(root.reps![0].verts[0])).toBe(true);
  });

  it('returns [] for a missing stage', () => {
    expect(loadTrace(EX, 'seed')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/trace-figures.test.ts`
Expected: FAIL — cannot resolve `../figures/trace/loadTrace`.

- [ ] **Step 3: Implement the loader**

```ts
// figures/trace/loadTrace.ts
/** Load the figure-trace JSONL a probe produced into typed arrays. Pure Node fs (figures/ is a
 *  CLI-only subsystem, so a direct node:fs import is fine here — unlike figureTrace.ts, nothing in
 *  figures/ is reachable from the browser bundle). */
import * as fs from 'node:fs';
import * as path from 'node:path';

export type Verts = [number, number][];
export type RepPoly = { n: number; isStar: boolean; verts: Verts };

export type VcNode = { id: number; parentId: number; path: string[]; angleSum: number; verdict: string };
export type TorusNode = {
  fillId: number; latKey: string; k?: number; id?: number; parentId?: number;
  reps?: RepPoly[]; placedN?: number; stateKey?: string; verdict: string;
};
export type PoolNode = { N: number; steps: number; lmax: number; dirs: number[]; monotone: boolean; vectors: Verts };
export type LatticeNode = {
  vcSig: string; polySizes: number[]; p0Skipped: number; cSkipped: number; orbitSkipped: number;
  candidates: { key: string; basis: [[number, number], [number, number]] }[];
};

export type TraceStage = 'vc' | 'seed' | 'pool' | 'lattice' | 'torus';

export function loadTrace<T>(dir: string, stage: TraceStage): T[] {
  const f = path.join(dir, `${stage}.jsonl`);
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as T);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/trace-figures.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add figures/trace/loadTrace.ts tests/trace-figures.test.ts
git commit -m "feat(figures): trace loader + record types for the walkthrough figures"
```

---

## Task 2: Pure geometry helpers

**Files:**
- Create: `figures/trace/geometry.ts`
- Test: `tests/trace-figures.test.ts` (append)

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/trace-figures.test.ts
import { regularPolygonAtCorner, bboxOfPts, fitInto } from '../figures/trace/geometry';
import type { V2 } from '../figures/ir/types';

describe('geometry', () => {
  it('regularPolygonAtCorner: unit triangle at corner angle 0 has 3 verts, corner at origin', () => {
    const tri = regularPolygonAtCorner(3, 0);
    expect(tri.length).toBe(3);
    expect(tri[0].x).toBeCloseTo(0, 9);
    expect(tri[0].y).toBeCloseTo(0, 9);
    // unit edge: |v1 - v0| == 1
    expect(Math.hypot(tri[1].x - tri[0].x, tri[1].y - tri[0].y)).toBeCloseTo(1, 9);
    // interior angle at the corner = 60°, so edge v0→v2 is at 60°
    expect(Math.atan2(tri[2].y - tri[0].y, tri[2].x - tri[0].x)).toBeCloseTo(Math.PI / 3, 9);
  });

  it('regularPolygonAtCorner: square has 4 verts, interior angle 90°', () => {
    const sq = regularPolygonAtCorner(4, 0);
    expect(sq.length).toBe(4);
    expect(Math.atan2(sq[3].y - sq[0].y, sq[3].x - sq[0].x)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('fitInto maps a bbox into the target box preserving aspect (centered)', () => {
    const pts: V2[] = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }];
    const box = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const t = fitInto(bboxOfPts(pts), box, 1);
    const out = pts.map(t);
    // all inside the box
    for (const p of out) { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(10); expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(10); }
    // aspect preserved: width 2 → 8 (with margin 1 → box 8 wide), height scaled by same factor
    expect(out[1].x - out[0].x).toBeCloseTo(8, 6);
    expect(out[2].y - out[1].y).toBeCloseTo(4, 6);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/trace-figures.test.ts`
Expected: FAIL — cannot resolve `../figures/trace/geometry`.

- [ ] **Step 3: Implement geometry**

```ts
// figures/trace/geometry.ts
/** Pure 2-D helpers for the trace figures. Model units (unit polygon edge = 1). */
import type { V2, Rect } from '../ir/types';

/** A regular n-gon with ONE corner at the origin, unit edges, whose interior angle opens
 *  counter-clockwise from ray `cornerAngle`. Reconstructs a VC fan wedge from a trace path entry:
 *  corner at the shared vertex, first edge along `cornerAngle`, covering the interior angle. */
export function regularPolygonAtCorner(n: number, cornerAngle: number): V2[] {
  const interior = (Math.PI * (n - 2)) / n;
  const exterior = Math.PI - interior; // turn per step
  const verts: V2[] = [{ x: 0, y: 0 }];
  // walk from the corner along `cornerAngle`, turning LEFT by the exterior angle each step
  let x = 0, y = 0, heading = cornerAngle;
  for (let i = 0; i < n - 1; i++) {
    x += Math.cos(heading);
    y += Math.sin(heading);
    verts.push({ x, y });
    heading += exterior;
  }
  return verts;
}

export function bboxOfPts(pts: V2[]): Rect {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** A transform mapping `src` bbox into `box` (with `margin` model units of padding), preserving
 *  aspect ratio and centering. Returns a point→point function (y stays up; the emitter flips). */
export function fitInto(src: Rect, box: Rect, margin: number): (p: V2) => V2 {
  const sw = Math.max(1e-9, src.maxX - src.minX);
  const sh = Math.max(1e-9, src.maxY - src.minY);
  const bw = (box.maxX - box.minX) - 2 * margin;
  const bh = (box.maxY - box.minY) - 2 * margin;
  const s = Math.min(bw / sw, bh / sh);
  const scx = (src.minX + src.maxX) / 2, scy = (src.minY + src.maxY) / 2;
  const bcx = (box.minX + box.maxX) / 2, bcy = (box.minY + box.maxY) / 2;
  return (p: V2): V2 => ({ x: bcx + (p.x - scx) * s, y: bcy + (p.y - scy) * s });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/trace-figures.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add figures/trace/geometry.ts tests/trace-figures.test.ts
git commit -m "feat(figures): geometry helpers (corner polygon, bbox, fit-into-box)"
```

---

## Task 3: Palette styleRefs for the figures

**Files:**
- Modify: `figures/style/palette.ts` (the `resolveBase` function)
- Test: `tests/trace-figures.test.ts` (append)

The emitters throw on unknown styleRefs, so the tree/pool figures need their refs registered.

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/trace-figures.test.ts
import { resolveStyle } from '../figures/style/palette';

describe('palette tree refs', () => {
  it('registers the tree/figure styleRefs without throwing', () => {
    for (const ref of ['tree:box', 'tree:edge', 'tree:pathedge', 'tree:prune', 'tree:success', 'vec:pool', 'vec:winner']) {
      expect(() => resolveStyle(ref)).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/trace-figures.test.ts`
Expected: FAIL — `palette: unknown styleRef 'tree:box'`.

- [ ] **Step 3: Add the refs**

In `figures/style/palette.ts`, inside `resolveBase`, immediately BEFORE the final `throw new Error(\`palette: unknown styleRef '${ref}'\`);`, insert:

```ts
	// Trace-walkthrough figures (Plan B): node boxes, tree edges, verdict-colored branch stubs, vectors.
	if (ref === 'tree:box') return { stroke: 'figFaint', lineWidthMm: LINE_W.hairline };
	if (ref === 'tree:edge') return { stroke: 'figFaint', lineWidthMm: LINE_W.hairline };
	if (ref === 'tree:pathedge') return { stroke: 'figEdge', lineWidthMm: LINE_W.edge };
	if (ref === 'tree:prune') return { stroke: 'oiVermillion', lineWidthMm: LINE_W.edge };
	if (ref === 'tree:success') return { stroke: 'oiGreen', lineWidthMm: LINE_W.edge };
	if (ref === 'vec:pool') return { stroke: 'figFaint', lineWidthMm: LINE_W.hairline };
	if (ref === 'vec:winner') return { stroke: 'oiVermillion', lineWidthMm: LINE_W.overlay };
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/trace-figures.test.ts`
Expected: PASS. Also run `pnpm build` (palette is imported by client-safe code paths) → must pass.

- [ ] **Step 5: Commit**

```bash
git add figures/style/palette.ts tests/trace-figures.test.ts
git commit -m "feat(figures): palette styleRefs for tree/vector walkthrough figures"
```

---

## Task 4: F2 — the polygon set + the emit driver

**Files:**
- Create: `figures/trace/polygonsFigure.ts`
- Create: `figures/trace/build-trace-figures.ts`
- Test: `tests/trace-figures.test.ts` (append)

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/trace-figures.test.ts
import { polygonsFigure } from '../figures/trace/polygonsFigure';

describe('F2 polygons figure', () => {
  it('emits one poly element per input n, each labeled', () => {
    const ir = polygonsFigure([3, 4, 6]);
    const polys = ir.elements.filter((e) => e.kind === 'poly');
    const labels = ir.elements.filter((e) => e.kind === 'text');
    expect(polys.length).toBe(3);
    expect(labels.length).toBeGreaterThanOrEqual(3); // n / interior-angle labels
    // laid out left→right, non-overlapping in x
    const xs = polys.map((p) => Math.min(...(p as { verts: { x: number }[] }).verts.map((v) => v.x)));
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/trace-figures.test.ts`
Expected: FAIL — cannot resolve `polygonsFigure`.

- [ ] **Step 3: Implement F2 + the driver**

```ts
// figures/trace/polygonsFigure.ts
/** F2 — a row of the input regular polygons, each centered in a cell, labeled with n and interior
 *  angle. Uses the byNGon tile fills so the colors match every other figure. */
import type { FigureIR, FigureElement, V2 } from '../ir/types';
import { regularPolygonAtCorner, bboxOfPts, fitInto } from './geometry';

const CELL = 12; // model-unit width per polygon cell
const PAD = 1.5;

export function polygonsFigure(ns: number[]): FigureIR {
  const elements: FigureElement[] = [];
  ns.forEach((n, i) => {
    const box = { minX: i * CELL, minY: 0, maxX: (i + 1) * CELL, maxY: CELL };
    const raw = regularPolygonAtCorner(n, 0);
    const t = fitInto(bboxOfPts(raw), { ...box, maxY: box.maxY - 3 }, PAD); // leave a label strip at the bottom
    const verts: V2[] = raw.map(t);
    elements.push({ kind: 'poly', verts, styleRef: `tile:n:${n}` });
    const interiorDeg = Math.round((180 * (n - 2)) / n);
    elements.push({ kind: 'text', at: { x: (box.minX + box.maxX) / 2, y: 2 }, tex: `$\\{${n}\\}$`, styleRef: 'label' });
    elements.push({ kind: 'text', at: { x: (box.minX + box.maxX) / 2, y: 0.5 }, tex: `${interiorDeg}^\\circ`, styleRef: 'label' });
  });
  return { bbox: { minX: 0, minY: 0, maxX: ns.length * CELL, maxY: CELL }, elements };
}
```

```ts
// figures/trace/build-trace-figures.ts
/** Driver: read the frozen running-example traces and emit the trace-driven figures (F2/F3/F5/F6)
 *  as .svg (preview) + .tex (TikZ, thesis). Run: pnpm tsx figures/trace/build-trace-figures.ts
 *  Figures land in figures/out/trace/. Does NOT deliver to ../thesis (AL/TA include them). */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FigureIR } from '../ir/types';
import { emitSvg } from '../emit/svg';
import { emitTikz } from '../emit/tikz';
import { polygonsFigure } from './polygonsFigure';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'figures', 'out', 'trace');
const EDGE_MM = 8;

function write(id: string, ir: FigureIR): void {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${id}.svg`), emitSvg(ir, { edgeMm: EDGE_MM }));
  fs.writeFileSync(path.join(OUT, `${id}.tex`), emitTikz(ir, { edgeMm: EDGE_MM }));
  console.error(`[trace-figures] wrote ${id}.svg + ${id}.tex`);
}

// F2 — polygon set. (F3/F5/F6 wired in later tasks.)
write('f2-polygons', polygonsFigure([3, 4, 6]));
```

- [ ] **Step 4: Run + emit**

Run: `pnpm vitest run tests/trace-figures.test.ts` → PASS.
Run: `pnpm tsx figures/trace/build-trace-figures.ts` → writes `figures/out/trace/f2-polygons.{svg,tex}`. Confirm the SVG is non-empty and contains 3 `<polygon` tags: `grep -c '<polygon' figures/out/trace/f2-polygons.svg` → 3.

- [ ] **Step 5: Commit**

```bash
git add figures/trace/polygonsFigure.ts figures/trace/build-trace-figures.ts tests/trace-figures.test.ts
git commit -m "feat(figures): F2 polygon-set figure + trace-figure emit driver"
```

---

## Task 5: Tree layout + node render + F6 torus tree (the hero)

**Files:**
- Create: `figures/trace/treeLayout.ts`
- Create: `figures/trace/treeFigure.ts`
- Modify: `figures/trace/build-trace-figures.ts` (add F6)
- Test: `tests/trace-figures.test.ts` (append)

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/trace-figures.test.ts
import { layoutTree, type TreeInput } from '../figures/trace/treeLayout';
import { torusTreeFigure } from '../figures/trace/treeFigure';
import { loadTrace as load2, type TorusNode as TN } from '../figures/trace/loadTrace';

describe('treeLayout', () => {
  it('assigns depth by ancestry and non-overlapping x to leaves', () => {
    // root(1) → a(2), b(3); a → c(4)
    const nodes: TreeInput[] = [
      { id: 1, parentId: -1 }, { id: 2, parentId: 1 }, { id: 3, parentId: 1 }, { id: 4, parentId: 2 },
    ];
    const pos = layoutTree(nodes);
    expect(pos.get(1)!.depth).toBe(0);
    expect(pos.get(4)!.depth).toBe(2);
    // siblings 2 and 3 get distinct x
    expect(pos.get(2)!.x).not.toBeCloseTo(pos.get(3)!.x, 6);
  });
});

describe('F6 torus tree', () => {
  it('renders all 18 fill-476 nodes with per-node geometry + edges', () => {
    const torus = load2<TN>('figures/traces/running-example', 'torus');
    const ir = torusTreeFigure(torus);
    const polys = ir.elements.filter((e) => e.kind === 'poly');
    const edges = ir.elements.filter((e) => e.kind === 'polyline');
    expect(polys.length).toBeGreaterThan(18); // each node draws its reps (>=1 poly), plus node boxes
    expect(edges.length).toBeGreaterThanOrEqual(17); // 18 nodes → 17 parent edges (+ boxes)
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/trace-figures.test.ts`
Expected: FAIL — cannot resolve `treeLayout` / `treeFigure`.

- [ ] **Step 3: Implement layout + node render + F6**

```ts
// figures/trace/treeLayout.ts
/** Tidy layout for the small trace trees (<= ~30 nodes): depth = ancestry distance, x = a simple
 *  post-order tidy pass (leaves sequential, parents centered over their children). Adequate and
 *  deterministic for these sizes — no Reingold–Tilford contour merging needed (YAGNI). */
export type TreeInput = { id: number; parentId: number };
export type Pos = { x: number; depth: number };

export function layoutTree(nodes: TreeInput[]): Map<number, Pos> {
  const children = new Map<number, number[]>();
  const byId = new Map<number, TreeInput>();
  for (const n of nodes) { byId.set(n.id, n); if (!children.has(n.id)) children.set(n.id, []); }
  const roots: number[] = [];
  for (const n of nodes) {
    if (n.parentId === -1 || !byId.has(n.parentId)) roots.push(n.id);
    else (children.get(n.parentId) ?? children.set(n.parentId, []).get(n.parentId)!).push(n.id);
  }
  const pos = new Map<number, Pos>();
  let nextLeafX = 0;
  const assign = (id: number, depth: number): number => {
    const kids = children.get(id) ?? [];
    if (kids.length === 0) { const x = nextLeafX++; pos.set(id, { x, depth }); return x; }
    const xs = kids.map((k) => assign(k, depth + 1));
    const x = (Math.min(...xs) + Math.max(...xs)) / 2;
    pos.set(id, { x, depth });
    return x;
  };
  // stable order: sort children by id so layout is deterministic
  for (const [, ks] of children) ks.sort((a, b) => a - b);
  roots.sort((a, b) => a - b).forEach((r) => assign(r, 0));
  return pos;
}
```

```ts
// figures/trace/treeFigure.ts
/** Compose a trace tree into a FigureIR: each node is a small box holding its rendered partial
 *  geometry; parent→child edges are colored by the child's verdict (success path bold, prune red).
 *  Torus nodes render their `reps` directly; the box is a `tree:box` outline. */
import type { FigureIR, FigureElement, V2, Rect } from '../ir/types';
import type { TorusNode } from './loadTrace';
import { bboxOfPts, fitInto } from './geometry';
import { layoutTree, type TreeInput } from './treeLayout';

const BOX = 9;       // model-unit node box side
const GAPX = 4;      // horizontal gap between node columns
const GAPY = 7;      // vertical gap between depth rows
const NODEMARGIN = 1;

const pruneVerdict = (v: string) => v.startsWith('prune-') || v === 'contradiction' || v === 'cap-skip' || v === 'reject-supercell' || v === 'cert-fail' || v === 'dedup';

export function torusTreeFigure(nodes: TorusNode[]): FigureIR {
  const input: TreeInput[] = nodes.map((n) => ({ id: n.id ?? -1, parentId: n.parentId ?? -1 }));
  const pos = layoutTree(input);
  const byId = new Map<number, TorusNode>();
  for (const n of nodes) if (n.id != null) byId.set(n.id, n);

  const boxOf = (id: number): Rect => {
    const p = pos.get(id)!;
    const cx = p.x * (BOX + GAPX);
    const cy = -p.depth * (BOX + GAPY); // depth grows downward → negative y (emitter flips)
    return { minX: cx, minY: cy - BOX / 2, maxX: cx + BOX, maxY: cy + BOX / 2 };
  };
  const boxCenter = (r: Rect): V2 => ({ x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2 });

  const elements: FigureElement[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (r: Rect) => { minX = Math.min(minX, r.minX); minY = Math.min(minY, r.minY); maxX = Math.max(maxX, r.maxX); maxY = Math.max(maxY, r.maxY); };

  // edges first (drawn under boxes)
  for (const n of nodes) {
    if (n.id == null || n.parentId == null || !byId.has(n.parentId)) continue;
    const a = boxCenter(boxOf(n.parentId));
    const b = boxCenter(boxOf(n.id));
    const ref = n.verdict === 'emit' ? 'tree:success' : pruneVerdict(n.verdict) ? 'tree:prune' : 'tree:pathedge';
    elements.push({ kind: 'polyline', verts: [a, b], styleRef: ref });
  }
  // node boxes + their rendered reps + a verdict label
  for (const n of nodes) {
    if (n.id == null) continue;
    const box = boxOf(n.id);
    grow(box);
    elements.push({ kind: 'polyline', verts: [
      { x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY },
      { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY },
    ], closed: true, styleRef: 'tree:box' });
    if (n.reps && n.reps.length) {
      const allPts: V2[] = n.reps.flatMap((p) => p.verts.map(([x, y]) => ({ x, y })));
      const t = fitInto(bboxOfPts(allPts), box, NODEMARGIN);
      for (const p of n.reps) elements.push({ kind: 'poly', verts: p.verts.map(([x, y]) => t({ x, y })), styleRef: `tile:n:${p.n}` });
    }
    // verdict label under the box
    elements.push({ kind: 'text', at: { x: (box.minX + box.maxX) / 2, y: box.minY - 1.2 }, tex: n.verdict.replace(/_/g, '\\_'), styleRef: 'label' });
  }

  const bbox: Rect = { minX: minX - 2, minY: minY - 3, maxX: maxX + 2, maxY: maxY + 2 };
  return { bbox, elements };
}
```

Add F6 to the driver `figures/trace/build-trace-figures.ts` (after the F2 line):

```ts
import { loadTrace, type TorusNode } from './loadTrace';
import { torusTreeFigure } from './treeFigure';

const EX = path.join(ROOT, 'figures', 'traces', 'running-example');
// F6 — torus-fill DFS of the running example (fill 476, all 18 nodes).
write('f6-torus-fill', torusTreeFigure(loadTrace<TorusNode>(EX, 'torus')));
```

- [ ] **Step 4: Run + emit**

Run: `pnpm vitest run tests/trace-figures.test.ts` → PASS.
Run: `pnpm tsx figures/trace/build-trace-figures.ts` → writes `f6-torus-fill.{svg,tex}`. Confirm: `grep -c '<polygon\|<polyline' figures/out/trace/f6-torus-fill.svg` is > 30 (nodes render reps + boxes + edges).

- [ ] **Step 5: Commit**

```bash
git add figures/trace/treeLayout.ts figures/trace/treeFigure.ts figures/trace/build-trace-figures.ts tests/trace-figures.test.ts
git commit -m "feat(figures): F6 torus-fill DFS tree (real partial cells as nodes)"
```

---

## Task 6: Curation + F3 VC search tree

**Files:**
- Create: `figures/trace/curate.ts`
- Modify: `figures/trace/treeFigure.ts` (add `vcTreeFigure`)
- Modify: `figures/trace/build-trace-figures.ts` (add F3)
- Test: `tests/trace-figures.test.ts` (append)

The VC tree is 64 nodes — legible but busy. Curate to: the full paths to the example's two VCs (3.4.6.4, 3.6.3.6), plus one representative stub per distinct prune/dup verdict, plus an ellipsis carrying the dropped count.

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/trace-figures.test.ts
import { curateVcTree } from '../figures/trace/curate';
import { vcTreeFigure } from '../figures/trace/treeFigure';
import { loadTrace as load3, type VcNode as VN } from '../figures/trace/loadTrace';

describe('curateVcTree', () => {
  it('keeps the paths to the highlighted VCs + one stub per prune reason + an ellipsis, deterministically', () => {
    const vc = load3<VN>('figures/traces/running-example', 'vc');
    const a = curateVcTree(vc, [['3', '4', '6', '4'], ['3', '6', '3', '6']]);
    const b = curateVcTree(vc, [['3', '4', '6', '4'], ['3', '6', '3', '6']]);
    expect(a.kept.map((n) => n.id)).toEqual(b.kept.map((n) => n.id)); // deterministic
    // both highlighted leaves are present as emit nodes
    const emits = a.kept.filter((n) => n.verdict === 'emit').map((n) => n.path.join('.'));
    expect(emits).toContain('3.4.6.4');
    expect(emits).toContain('3.6.3.6');
    expect(a.kept.length).toBeLessThan(vc.length); // it IS a slice
    expect(a.droppedCount).toBe(vc.length - a.kept.length);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/trace-figures.test.ts`
Expected: FAIL — cannot resolve `curate`.

- [ ] **Step 3: Implement curation + vcTreeFigure**

```ts
// figures/trace/curate.ts
/** Curate a large VC search tree to a legible, HONEST slice: the root-to-leaf paths of the
 *  highlighted VCs, plus the first-encountered node of each distinct non-extend verdict (one stub
 *  per prune/dup reason), plus their ancestors so the tree stays connected. Deterministic (input
 *  order; the trace is already deterministic). Returns kept nodes + how many were dropped. */
import type { VcNode } from './loadTrace';

export type Curated = { kept: VcNode[]; droppedCount: number; highlightIds: Set<number> };

export function curateVcTree(nodes: VcNode[], highlightPaths: string[][]): Curated {
  const byId = new Map<number, VcNode>();
  for (const n of nodes) byId.set(n.id, n);
  const keep = new Set<number>();
  const addAncestors = (id: number) => {
    let cur: VcNode | undefined = byId.get(id);
    while (cur && !keep.has(cur.id)) { keep.add(cur.id); cur = cur.parentId === -1 ? undefined : byId.get(cur.parentId); }
  };
  const highlightIds = new Set<number>();
  const pathKey = (p: string[]) => p.join('.');
  const wanted = new Set(highlightPaths.map(pathKey));
  // highlighted leaves + their paths
  for (const n of nodes) if (n.verdict === 'emit' && wanted.has(pathKey(n.path))) { highlightIds.add(n.id); addAncestors(n.id); }
  // one stub per distinct non-extend verdict (first by id = first encountered)
  const seenVerdict = new Set<string>();
  for (const n of [...nodes].sort((a, b) => a.id - b.id)) {
    if (n.verdict === 'extend') continue;
    if (seenVerdict.has(n.verdict)) continue;
    seenVerdict.add(n.verdict);
    addAncestors(n.id);
  }
  const kept = nodes.filter((n) => keep.has(n.id)).sort((a, b) => a.id - b.id);
  return { kept, droppedCount: nodes.length - kept.length, highlightIds };
}
```

Add `vcTreeFigure` to `figures/trace/treeFigure.ts`:

```ts
// append to figures/trace/treeFigure.ts
import type { VcNode } from './loadTrace';
import { regularPolygonAtCorner } from './geometry';
import { curateVcTree } from './curate';

/** Reconstruct a VC fan from a path of corner sizes: place each polygon at the shared vertex,
 *  opening from the running angle sum. Returns all polygons' verts for the node's mini-render. */
function vcFan(pathStr: string[]): { n: number; verts: V2[] }[] {
  const out: { n: number; verts: V2[] }[] = [];
  let angle = 0;
  for (const s of pathStr) {
    const n = Number(s);
    out.push({ n, verts: regularPolygonAtCorner(n, angle) });
    angle += (Math.PI * (n - 2)) / n;
  }
  return out;
}

export function vcTreeFigure(nodes: VcNode[], highlightPaths: string[][]): FigureIR {
  const { kept, droppedCount, highlightIds } = curateVcTree(nodes, highlightPaths);
  const input: TreeInput[] = kept.map((n) => ({ id: n.id, parentId: n.parentId }));
  const pos = layoutTree(input);
  const boxOf = (id: number): Rect => {
    const p = pos.get(id)!; const cx = p.x * (BOX + GAPX); const cy = -p.depth * (BOX + GAPY);
    return { minX: cx, minY: cy - BOX / 2, maxX: cx + BOX, maxY: cy + BOX / 2 };
  };
  const boxCenter = (r: Rect): V2 => ({ x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2 });
  const keptIds = new Set(kept.map((n) => n.id));

  const elements: FigureElement[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of kept) { const b = boxOf(n.id); minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY); maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY); }

  for (const n of kept) {
    if (n.parentId === -1 || !keptIds.has(n.parentId)) continue;
    const a = boxCenter(boxOf(n.parentId)); const b = boxCenter(boxOf(n.id));
    const ref = n.verdict === 'emit' ? 'tree:success' : n.verdict.startsWith('prune') || n.verdict.startsWith('reject') ? 'tree:prune' : 'tree:pathedge';
    elements.push({ kind: 'polyline', verts: [a, b], styleRef: ref });
  }
  for (const n of kept) {
    const box = boxOf(n.id);
    elements.push({ kind: 'polyline', verts: [
      { x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY }, { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY },
    ], closed: true, styleRef: highlightIds.has(n.id) ? 'tree:success' : 'tree:box' });
    const fan = vcFan(n.path);
    if (fan.length) {
      const pts = fan.flatMap((f) => f.verts);
      const t = fitInto(bboxOfPts(pts), box, NODEMARGIN);
      for (const f of fan) elements.push({ kind: 'poly', verts: f.verts.map(t), styleRef: `tile:n:${f.n}` });
    } else {
      elements.push({ kind: 'text', at: boxCenter(box), tex: 'root', styleRef: 'label' });
    }
    elements.push({ kind: 'text', at: { x: (box.minX + box.maxX) / 2, y: box.minY - 1.2 }, tex: `${n.path.join('.') || '\\varnothing'}`, styleRef: 'label' });
  }
  // honest ellipsis with the dropped count
  elements.push({ kind: 'text', at: { x: maxX + 4, y: minY }, tex: `+${droppedCount}\\ \\mathrm{explored}`, styleRef: 'label' });

  return { bbox: { minX: minX - 2, minY: minY - 3, maxX: maxX + 14, maxY: maxY + 2 }, elements };
}
```

Add F3 to the driver:

```ts
import { vcTreeFigure } from './treeFigure';
import { type VcNode } from './loadTrace';
// F3 — VC search tree, curated, with the example's two VCs highlighted.
write('f3-vc-search', vcTreeFigure(loadTrace<VcNode>(EX, 'vc'), [['3','4','6','4'], ['3','6','3','6']]));
```

- [ ] **Step 4: Run + emit**

Run: `pnpm vitest run tests/trace-figures.test.ts` → PASS.
Run: `pnpm tsx figures/trace/build-trace-figures.ts` → writes `f3-vc-search.{svg,tex}`. Confirm non-empty and contains the ellipsis text.

- [ ] **Step 5: Commit**

```bash
git add figures/trace/curate.ts figures/trace/treeFigure.ts figures/trace/build-trace-figures.ts tests/trace-figures.test.ts
git commit -m "feat(figures): F3 VC search tree (curated slice, real fan nodes, 2 VCs highlighted)"
```

---

## Task 7: F5 — vector pool + candidate lattices

**Files:**
- Create: `figures/trace/poolFigure.ts`
- Modify: `figures/trace/build-trace-figures.ts` (add F5)
- Test: `tests/trace-figures.test.ts` (append)

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/trace-figures.test.ts
import { poolFigure } from '../figures/trace/poolFigure';
import { loadTrace as load4, type PoolNode as PN, type LatticeNode as LN } from '../figures/trace/loadTrace';

describe('F5 pool + lattice', () => {
  it('draws pool vectors as arrows and marks the winning lattice parallelogram', () => {
    const pool = load4<PN>('figures/traces/running-example', 'pool');
    const lattice = load4<LN>('figures/traces/running-example', 'lattice');
    const winnerKey = '1|-4,0,-1,0,2,0,1,0#1|0,0,0,0,-2,0,0,0';
    const ir = poolFigure(pool, lattice, winnerKey);
    const arrows = ir.elements.filter((e) => e.kind === 'arrow');
    const winnerPolyline = ir.elements.filter((e) => e.kind === 'polyline' && e.styleRef === 'vec:winner');
    expect(arrows.length).toBeGreaterThan(10); // many pool vectors
    expect(winnerPolyline.length).toBe(1);     // exactly one winner parallelogram
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/trace-figures.test.ts`
Expected: FAIL — cannot resolve `poolFigure`.

- [ ] **Step 3: Implement F5**

```ts
// figures/trace/poolFigure.ts
/** F5 — the short-vector pool (candidate translation vectors) drawn as arrows from the origin, with
 *  the candidate-lattice parallelograms overlaid faintly and the WINNING lattice (the example's) in
 *  full. Uses the smallest pool (the tile-set's realizable set) to stay legible; caps arrow count. */
import type { FigureIR, FigureElement, V2 } from '../ir/types';
import type { PoolNode, LatticeNode } from './loadTrace';

const MAX_ARROWS = 60;

export function poolFigure(pools: PoolNode[], lattices: LatticeNode[], winnerKey: string): FigureIR {
  // pick the smallest non-empty pool for legibility
  const pool = [...pools].filter((p) => p.vectors.length).sort((a, b) => a.vectors.length - b.vectors.length)[0];
  const vecs = (pool?.vectors ?? []).slice(0, MAX_ARROWS);
  const elements: FigureElement[] = [];
  let ext = 1;
  for (const [x, y] of vecs) {
    elements.push({ kind: 'arrow', from: { x: 0, y: 0 }, to: { x, y }, styleRef: 'vec:pool' });
    ext = Math.max(ext, Math.abs(x), Math.abs(y));
  }
  // winning parallelogram from the matched candidate's float basis
  let winner: [[number, number], [number, number]] | null = null;
  for (const l of lattices) { const c = l.candidates.find((c) => c.key === winnerKey); if (c) { winner = c.basis; break; } }
  if (winner) {
    const [u, v] = winner;
    const o: V2 = { x: 0, y: 0 };
    const uu: V2 = { x: u[0], y: u[1] };
    const vv: V2 = { x: v[0], y: v[1] };
    const uv: V2 = { x: u[0] + v[0], y: u[1] + v[1] };
    elements.push({ kind: 'polyline', verts: [o, uu, uv, vv], closed: true, styleRef: 'vec:winner' });
    elements.push({ kind: 'arrow', from: o, to: uu, styleRef: 'vec:winner' });
    elements.push({ kind: 'arrow', from: o, to: vv, styleRef: 'vec:winner' });
    elements.push({ kind: 'text', at: { x: uu.x, y: uu.y }, tex: '$\\vec u$', styleRef: 'label:basis' });
    elements.push({ kind: 'text', at: { x: vv.x, y: vv.y }, tex: '$\\vec v$', styleRef: 'label:basis' });
    ext = Math.max(ext, Math.abs(uv.x), Math.abs(uv.y));
  }
  const m = ext + 1;
  return { bbox: { minX: -m, minY: -m, maxX: m, maxY: m }, elements };
}
```

Add F5 to the driver:

```ts
import { poolFigure } from './poolFigure';
import { type PoolNode, type LatticeNode } from './loadTrace';
const WINNER = '1|-4,0,-1,0,2,0,1,0#1|0,0,0,0,-2,0,0,0';
// F5 — vector pool + candidate lattices, winner highlighted.
write('f5-pool-lattice', poolFigure(loadTrace<PoolNode>(EX, 'pool'), loadTrace<LatticeNode>(EX, 'lattice'), WINNER));
```

- [ ] **Step 4: Run + emit**

Run: `pnpm vitest run tests/trace-figures.test.ts` → PASS.
Run: `pnpm tsx figures/trace/build-trace-figures.ts` → writes `f5-pool-lattice.{svg,tex}`. Confirm the SVG has `<line ... marker-end` arrows and one `vec:winner` polygon.

- [ ] **Step 5: Commit**

```bash
git add figures/trace/poolFigure.ts figures/trace/build-trace-figures.ts tests/trace-figures.test.ts
git commit -m "feat(figures): F5 vector pool + candidate lattices (winner highlighted)"
```

---

## Task 8: README + final smoke

**Files:**
- Create: `figures/out/trace/README.md` (write via the driver so it regenerates)
- Modify: `figures/trace/build-trace-figures.ts` (emit the README + a manifest of figures)
- Test: `tests/trace-figures.test.ts` (append a smoke test)

- [ ] **Step 1: Write the smoke test**

```ts
// append to tests/trace-figures.test.ts
import { execFileSync } from 'node:child_process';
import * as fs2 from 'node:fs';

describe('F2/F3/F5/F6 emit end-to-end', () => {
  it('the driver writes 4 non-empty svg + tex pairs', () => {
    execFileSync('pnpm', ['tsx', 'figures/trace/build-trace-figures.ts'], { stdio: 'ignore' });
    for (const id of ['f2-polygons', 'f3-vc-search', 'f5-pool-lattice', 'f6-torus-fill']) {
      for (const ext of ['svg', 'tex']) {
        const p = `figures/out/trace/${id}.${ext}`;
        expect(fs2.existsSync(p)).toBe(true);
        expect(fs2.statSync(p).size).toBeGreaterThan(200);
      }
    }
  }, 60000);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/trace-figures.test.ts -t "emit end-to-end"`
Expected: FAIL if the README/manifest step isn't wired yet, or PASS if all four already emit — in which case just proceed. (If it fails only on the README, add it in Step 3.)

- [ ] **Step 3: Emit the README from the driver**

Append to `figures/trace/build-trace-figures.ts`:

```ts
const README = `# Pipeline-walkthrough figures (trace-driven)

Generated by \`pnpm tsx figures/trace/build-trace-figures.ts\` from the frozen real traces in
\`figures/traces/running-example/\` (k=2 example, fill 476: 3.4.6.4 + 3.6.3.6, an 8-tile cell of
4 triangles / 2 squares / 2 hexagons). Each figure is emitted as \`.svg\` (preview) and \`.tex\`
(standalone TikZ, thesis-final).

- \`f2-polygons\` — the input polygon set {3,4,6}.
- \`f3-vc-search\` — the vertex-configuration search tree (curated slice of the real 64-node search;
  the two VCs this example uses are highlighted).
- \`f5-pool-lattice\` — the short-vector pool + candidate period lattices; the winning lattice full.
- \`f6-torus-fill\` — the torus-fill DFS (all 18 real nodes; each node is the actual partial cell).

To include in the thesis (AL/TA): \`\\input{figures/generated/trace/<id>.tex}\` after compiling the
\`.tex\` standalone, or \`\\includegraphics\` a PDF built from the \`.svg\`. CC does not write ../thesis.
`;
fs.writeFileSync(path.join(OUT, 'README.md'), README);
console.error('[trace-figures] wrote README.md');
```

- [ ] **Step 4: Run + verify**

Run: `pnpm vitest run tests/trace-figures.test.ts` → all PASS.
Run: `pnpm build` → PASS (no type regressions from the new figures/trace modules).

- [ ] **Step 5: Commit**

```bash
git add figures/trace/build-trace-figures.ts tests/trace-figures.test.ts
git commit -m "feat(figures): trace-figure README + end-to-end emit smoke test"
```

---

## Self-review

- **Spec coverage:** F2 (Task 4), F3 (Task 6), F5 (Task 7), F6 (Task 5) — the four trace-driven figures. Curation rules (spec §3): `curate.ts` keeps the highlighted paths + one stub per verdict + an honest `+N explored` ellipsis. Real rendered nodes (spec): torus nodes draw their `reps`; VC nodes reconstruct the fan from the path. Emitters reused, no new emitter (spec §3). F1/F3.5/F7/F8 + F4 explicitly deferred to Plan C / Task 3 (stated up front).
- **Placeholder scan:** every code step has complete code; commands have expected output. No TBD/TODO.
- **Type consistency:** `VcNode`/`TorusNode`/`PoolNode`/`LatticeNode` defined in Task 1 and used unchanged in Tasks 5–7. `layoutTree(TreeInput[]) → Map<number,Pos>` (Task 5) used by both tree figures. `regularPolygonAtCorner`/`bboxOfPts`/`fitInto` (Task 2) used by F2/F3/F6. Palette refs added in Task 3 are exactly those referenced in Tasks 5–7 (`tree:box/edge/pathedge/prune/success`, `vec:pool/winner`).
- **Scope:** self-contained — produces 4 real SVG+TikZ figures from committed data, each task independently testable.

## Verification note (honest limitation)

SVGs can be validated structurally in tests (element counts, non-empty, expected tags) but their *visual* quality (legibility, overlap, proportions) can't be asserted by the test suite. After Task 8, a human (AL) should open `figures/out/trace/*.svg` and eyeball them; layout constants (`BOX`, `GAPX`, `GAPY`, `MAX_ARROWS`) are the tuning knobs. This is expected for figure work and is called out rather than hidden.
