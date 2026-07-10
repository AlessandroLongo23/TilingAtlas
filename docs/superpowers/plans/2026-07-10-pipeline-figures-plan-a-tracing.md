# Pipeline Figures — Plan A: tracing infrastructure + example selection

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture the real search-tree data of the live k=2 enumeration (`USE_PERIOD_SOLVER=1`) as committed JSONL, via dormant trace hooks in the four search engines, and select the running-example tiling — ending exactly at checkpoint 1 (AL confirms the example) before any figure is drawn in Plan B.

**Architecture:** A single module-level trace sink (`figureTrace.ts`) is a no-op unless `TRACE_FIGURES` is set; when set it appends one JSONL file per stage. Four engines get `if (trace.enabled) trace.node(...)` calls at their real decision points — pure observation, zero control-flow change. A probe runs the real pipeline on `{3,4,6}` with tracing on; a selector summarizes per-stage node counts so AL can pick the example. Winning traces are copied under `figures/traces/<example>/`.

**Tech stack:** TypeScript, `tsx` CLI, Vitest, `node:fs`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-10-algorithm-pipeline-figures-design.md`.

**Refinements to the spec discovered while reading the code (intentional):**
- The trace module lives at `lib/classes/algorithm/figureTrace.ts` (co-located with 3 of the 4 hook sites; `import './figureTrace'`), not `lib/algorithm/` — avoids path-alias friction.
- `VCGenerator` prune verdicts are the REAL branches: `prune-angle-floor`, `reject-wrap`, `emit`, `emit-dup`, `reject-invalid`, `extend` (adjacency is pre-filtered into `canFollow`, so there is no runtime adjacency-prune node — the spec's "one stub per distinct reason" rule absorbs this).
- `shortVectorPool` and `candidateLattices` are cached ⇒ each emits exactly once per tile set.
- The probe must run with `USE_NATIVE_FILL` UNSET (the native fill bypasses the TS `torusFill` and its hooks) and `USE_PERIOD_SOLVER=1` SET.

---

## File structure

| File | Responsibility | New/Modified |
|------|----------------|--------------|
| `lib/classes/algorithm/figureTrace.ts` | the trace sink + `polyDump` helper | Create |
| `tests/figure-trace.test.ts` | sink no-op / write behavior | Create |
| `lib/classes/algorithm/VCGenerator.ts` | VC-search hook | Modify (`dfs`, 60-110) |
| `lib/classes/algorithm/SeedBuilder.ts` | seed-BFS hook | Modify (`BFSNode`, `makeInitialNode`, `expandNode`, leaf) |
| `lib/classes/algorithm/LatticeEnumerator.ts` | pool hook | Modify (`shortVectorPool`, ~1009) |
| `lib/classes/algorithm/PeriodSolver.ts` | lattice + torus-fill hooks | Modify (`candidateLattices` ~1207, `torusFill` 1417-1522) |
| `lib/algorithm/run-pipeline.ts` | env override for polygon set (`FIG_NS`) | Modify (112-115) |
| `tests/figure-trace-noop.test.ts` | trace-on == trace-off equality | Create |
| `scripts/figure-select.ts` | summarize traces → shortlist | Create |
| `figures/traces/<example>/*.jsonl` | committed figure data source | Create (from probe) |

---

## Task 1: The trace sink

**Files:**
- Create: `lib/classes/algorithm/figureTrace.ts`
- Test: `tests/figure-trace.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/figure-trace.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// The `trace` singleton caches TRACE_FIGURES at construction, so tests set env then call
// _reconfigureFromEnv() to re-read it (production never calls that — the hot path stays a field read).
import { trace, polyDump } from '@/classes/algorithm/figureTrace';

describe('figureTrace sink', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftrace-')); });
  afterEach(() => { delete process.env.TRACE_FIGURES; trace._reconfigureFromEnv(); fs.rmSync(dir, { recursive: true, force: true }); });

  it('is a no-op when TRACE_FIGURES is unset', () => {
    delete process.env.TRACE_FIGURES; trace._reconfigureFromEnv();
    expect(trace.enabled).toBe(false);
    trace.node('vc', { id: 1, verdict: 'extend' }); // must not throw, must write nothing
    expect(fs.readdirSync(dir)).toHaveLength(0);
  });

  it('writes one JSONL line per node when enabled', () => {
    process.env.TRACE_FIGURES = dir; trace._reconfigureFromEnv();
    expect(trace.enabled).toBe(true);
    const a = trace.nextId('vc'), b = trace.nextId('vc');
    expect([a, b]).toEqual([1, 2]);
    trace.node('vc', { id: a, verdict: 'extend' });
    trace.node('vc', { id: b, verdict: 'emit' });
    const lines = fs.readFileSync(path.join(dir, 'vc.jsonl'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1])).toEqual({ id: 2, verdict: 'emit' });
  });

  it('polyDump reduces polygons to n/isStar/verts', () => {
    const poly = { n: 3, isStar: false, vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 0.87 }] };
    expect(polyDump([poly as never])).toEqual([{ n: 3, isStar: false, verts: [[0, 0], [1, 0], [0.5, 0.87]] }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/figure-trace.test.ts`
Expected: FAIL — cannot resolve `../lib/classes/algorithm/figureTrace`.

- [ ] **Step 3: Implement the sink**

```ts
// lib/classes/algorithm/figureTrace.ts
/**
 * Figure-trace sink — dormant instrumentation for the pipeline-walkthrough figures.
 * A NO-OP unless process.env.TRACE_FIGURES is set (to an output directory). When set, each
 * `node(stage, event)` appends one JSON line to `<dir>/<stage>.jsonl`. Pure observation: the
 * search engines call `trace.node(...)` at real decision points and NOTHING here alters their
 * control flow. Guard every hot-path call site with `if (trace.enabled)` so the disabled cost is
 * one boolean read.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export type TraceStage = 'vc' | 'seed' | 'pool' | 'lattice' | 'torus';

/** Minimal shape the hooks pull float geometry from (Polygon satisfies it). */
export interface PolyLike { n: number; isStar?: boolean; vertices: { x: number; y: number }[]; }

/** Reduce placed polygons to serializable {n, isStar, verts} — the renderable node payload. */
export function polyDump(polys: PolyLike[]): { n: number; isStar: boolean; verts: [number, number][] }[] {
  return polys.map((p) => ({ n: p.n, isStar: !!p.isStar, verts: p.vertices.map((v) => [v.x, v.y] as [number, number]) }));
}

class FigureTrace {
  private dir: string | null;
  private fds = new Map<TraceStage, number>();
  private counters = new Map<TraceStage | 'fill', number>();

  constructor() {
    const d = process.env.TRACE_FIGURES ?? null;
    this.dir = d;
    if (d) fs.mkdirSync(d, { recursive: true });
  }

  get enabled(): boolean { return this.dir !== null; }

  /** Fresh monotonic id within a (stage) namespace. Only call when enabled. */
  nextId(ns: TraceStage | 'fill'): number {
    const c = (this.counters.get(ns) ?? 0) + 1;
    this.counters.set(ns, c);
    return c;
  }

  node(stage: TraceStage, event: Record<string, unknown>): void {
    if (this.dir === null) return;
    let fd = this.fds.get(stage);
    if (fd === undefined) { fd = fs.openSync(path.join(this.dir, `${stage}.jsonl`), 'a'); this.fds.set(stage, fd); }
    fs.writeSync(fd, JSON.stringify(event) + '\n'); // writeSync is durable — no separate flush needed
  }

  /** TEST-ONLY: re-read TRACE_FIGURES (the singleton caches it at construction; production never calls this). */
  _reconfigureFromEnv(): void {
    for (const fd of this.fds.values()) fs.closeSync(fd);
    this.fds.clear();
    this.counters.clear();
    const d = process.env.TRACE_FIGURES ?? null;
    this.dir = d;
    if (d) fs.mkdirSync(d, { recursive: true });
  }
}

export const trace = new FigureTrace();
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/figure-trace.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Build + commit**

```bash
pnpm build
git add lib/classes/algorithm/figureTrace.ts tests/figure-trace.test.ts
git commit -m "feat(figures): dormant figure-trace sink (no-op unless TRACE_FIGURES)"
```

---

## Task 2: VC-search hook (`VCGenerator.dfs`)

**Files:**
- Modify: `lib/classes/algorithm/VCGenerator.ts` (import; `dfs` at lines 60-110)

- [ ] **Step 1: Add the import**

At the top of the file, after the existing imports (line 3), add:

```ts
import { trace } from './figureTrace';
```

- [ ] **Step 2: Replace the dfs block (lines 60-110)**

Replace exactly this original block:

```ts
        const stack = new Int32Array(32);
        const stackNames: string[] = [];
        let depth = 0;
        let angleSum = 0;

        const dfs = () => {
            if (depth > 0 && isWithinAngularTolerance(angleSum, TWO_PI)) {
                const lastIdx = stack[depth - 1];
                const firstIdx = stack[0];
                if (sharedAngleLeft[lastIdx] + sharedAngleRight[firstIdx] > TWO_PI + tolerance) return;
                if (!isWithinTolerance(sideLengthLeft[lastIdx], sideLengthRight[firstIdx])) return;

                const canonical = canonicalCyclicForm(stackNames);
                if (!seen.has(canonical)) {
                    seen.add(canonical);
                    const vc = this.buildAndValidate(stack, depth);
                    if (vc) this.vertexConfigurations.push(vc);
                }
                return;
            }

            const remaining = TWO_PI - angleSum;
            if (remaining < minAngle - tolerance) return;

            const isFirst = depth === 0;
            const candidates = isFirst ? allByAngle : canFollow[stack[depth - 1]];
            const len = candidates.length;
            const firstName = isFirst ? null : polyNames[stack[0]];

            for (let ci = 0; ci < len; ci++) {
                const j = candidates[ci];
                const angle = interiorAngles[j];

                if (angle > remaining + tolerance) break;

                if (!isFirst && comparePolygonNames(polyNames[j], firstName!) < 0) continue;

                stack[depth] = j;
                stackNames.push(polyNames[j]);
                angleSum += angle;
                depth++;

                dfs();

                depth--;
                stackNames.pop();
                angleSum -= angle;
            }
        };

        dfs();
        return this.vertexConfigurations;
```

with (only `if (trace.enabled)` lines and the `(id, parentId)` threading are added — the algorithm is untouched):

```ts
        const stack = new Int32Array(32);
        const stackNames: string[] = [];
        let depth = 0;
        let angleSum = 0;
        let vcNodeId = 0;
        const nextVcId = () => (trace.enabled ? ++vcNodeId : 0);

        const dfs = (nodeId: number, parentId: number) => {
            if (depth > 0 && isWithinAngularTolerance(angleSum, TWO_PI)) {
                const lastIdx = stack[depth - 1];
                const firstIdx = stack[0];
                if (sharedAngleLeft[lastIdx] + sharedAngleRight[firstIdx] > TWO_PI + tolerance) {
                    if (trace.enabled) trace.node('vc', { id: nodeId, parentId, path: stackNames.slice(), angleSum, verdict: 'reject-wrap' });
                    return;
                }
                if (!isWithinTolerance(sideLengthLeft[lastIdx], sideLengthRight[firstIdx])) {
                    if (trace.enabled) trace.node('vc', { id: nodeId, parentId, path: stackNames.slice(), angleSum, verdict: 'reject-wrap' });
                    return;
                }

                const canonical = canonicalCyclicForm(stackNames);
                let verdict = 'emit-dup';
                if (!seen.has(canonical)) {
                    seen.add(canonical);
                    const vc = this.buildAndValidate(stack, depth);
                    if (vc) { this.vertexConfigurations.push(vc); verdict = 'emit'; }
                    else verdict = 'reject-invalid';
                }
                if (trace.enabled) trace.node('vc', { id: nodeId, parentId, path: stackNames.slice(), angleSum, verdict });
                return;
            }

            const remaining = TWO_PI - angleSum;
            if (remaining < minAngle - tolerance) {
                if (trace.enabled) trace.node('vc', { id: nodeId, parentId, path: stackNames.slice(), angleSum, verdict: 'prune-angle-floor' });
                return;
            }

            if (trace.enabled) trace.node('vc', { id: nodeId, parentId, path: stackNames.slice(), angleSum, verdict: 'extend' });

            const isFirst = depth === 0;
            const candidates = isFirst ? allByAngle : canFollow[stack[depth - 1]];
            const len = candidates.length;
            const firstName = isFirst ? null : polyNames[stack[0]];

            for (let ci = 0; ci < len; ci++) {
                const j = candidates[ci];
                const angle = interiorAngles[j];

                if (angle > remaining + tolerance) break;

                if (!isFirst && comparePolygonNames(polyNames[j], firstName!) < 0) continue;

                stack[depth] = j;
                stackNames.push(polyNames[j]);
                angleSum += angle;
                depth++;

                dfs(nextVcId(), nodeId);

                depth--;
                stackNames.pop();
                angleSum -= angle;
            }
        };

        dfs(nextVcId(), -1);
        return this.vertexConfigurations;
```

- [ ] **Step 3: Create the shared `{3,4,6}` k=2 solve helper**

This mirrors the existing `buildSeeds` in `tests/period-solver.test.ts` (stages 1–5) plus the `PeriodSolver(2).solve` call, parameterized by `ns`. Both the VC-trace test and the no-op regression (Task 6) reuse it.

```ts
// tests/helpers/solveK2.ts
import {
  PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
  PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing } from '@/classes/Cyclotomic';
import { PeriodSolver, _testOnlyClearCandidateStageCaches, type PeriodCell } from '@/classes/algorithm/PeriodSolver';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';

/** Run stages 1–5 + the k=2 period solve for a regular set `ns`; return VC names + canonical cell keys. */
export function solveK2(ns: number[]): { vcNames: string[]; cellKeys: string[] } {
  const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns } };
  setActiveRing(computeRing(params));
  _testOnlyClearCandidateStageCaches(); // module-global caches must not leak across runs
  const pg = new PolygonsGenerator(params, []);
  const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
  const adj: Record<string, string[]> = {};
  for (const vc of vcs) adj[vc.name] = [];
  for (let i = 0; i < vcs.length; i++)
    for (let j = i + 1; j < vcs.length; j++)
      if (vcs[i].isCompatible(vcs[j])) { adj[vcs[i].name].push(vcs[j].name); adj[vcs[j].name].push(vcs[i].name); }
  const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
  const seedSets = new SeedSetExtractor(graph).findSeedSets(2);
  const seeds = new SeedBuilder().buildSeeds(2, 1, { seedSetLoader: () => seedSets });
  const extractor = new TranslationalCellExtractor();
  const cells: PeriodCell[] = [];
  for (const seed of seeds) cells.push(...new PeriodSolver(2).solve(seed, { maxMs: 60000 }).cells);
  return {
    vcNames: vcs.map((v) => v.name).sort(),
    cellKeys: cells.map((c) => extractor.canonicalKey(c.cellPolygons)).sort(),
  };
}
```

- [ ] **Step 4: Write the VC-trace test**

```ts
// append to tests/figure-trace.test.ts
import { solveK2 } from './helpers/solveK2';

describe('VCGenerator trace', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftvc-')); });
  afterEach(() => { delete process.env.TRACE_FIGURES; trace._reconfigureFromEnv(); fs.rmSync(dir, { recursive: true, force: true }); });

  it('emits vc nodes with real verdicts when tracing on', () => {
    process.env.TRACE_FIGURES = dir; trace._reconfigureFromEnv();
    solveK2([3, 4, 6]);
    const vc = fs.readFileSync(path.join(dir, 'vc.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const verdicts = new Set(vc.map((r) => r.verdict));
    expect(vc.length).toBeGreaterThan(5);
    expect(verdicts.has('emit')).toBe(true);   // at least one VC closes at 2π
    expect(verdicts.has('extend')).toBe(true);  // at least one interior node
  });
});
```

Note: `solveK2` runs the whole k=2 solve, so this test also incidentally produces `seed.jsonl`, `pool.jsonl`, `lattice.jsonl`, `torus.jsonl` — Tasks 3–5 assert on those.

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run tests/figure-trace.test.ts`
Expected: PASS.

- [ ] **Step 6: Build + commit**

```bash
pnpm build
git add lib/classes/algorithm/VCGenerator.ts tests/helpers/solveK2.ts tests/figure-trace.test.ts
git commit -m "feat(figures): trace hook in VCGenerator.dfs (real verdicts, dormant)"
```

---

## Task 3: Seed-BFS hook (`SeedBuilder`)

**Files:**
- Modify: `lib/classes/algorithm/SeedBuilder.ts` (import; `BFSNode` 15-19; `makeInitialNode` 116-126; `expandNode` 174-242; leaf filter 160-162)

- [ ] **Step 1: Add the import**

After line 6, add:

```ts
import { trace, polyDump } from './figureTrace';
```

- [ ] **Step 2: Add `traceId` to `BFSNode`**

Replace (lines 15-19):

```ts
type BFSNode = {
    seed: SeedConfiguration;
    placedVCs: PlacedVC[];
    remaining: string[];
};
```

with:

```ts
type BFSNode = {
    seed: SeedConfiguration;
    placedVCs: PlacedVC[];
    remaining: string[];
    traceId?: number;
};
```

- [ ] **Step 3: Emit at node creation in `makeInitialNode`**

`makeInitialNode` (116-126) closes over `seedSet`. Replace its `return` (line 125):

```ts
            return { seed, placedVCs, remaining: seedSet.slice(1) };
```

with:

```ts
            const traceId = trace.enabled ? trace.nextId('seed') : 0;
            const node: BFSNode = { seed, placedVCs, remaining: seedSet.slice(1), traceId };
            if (trace.enabled) trace.node('seed', { id: traceId, parentId: -1, seedSet: seedSet.join('|'), remaining: node.remaining.length, polys: polyDump(seed.polygons), verdict: 'root' });
            return node;
```

- [ ] **Step 4: Emit forward-check prune + child creation in `expandNode`**

In `expandNode` (174-242): replace the forward-check early return (lines 181-185):

```ts
        for (const { vertex, vertexExact, directions } of availableVertices) {
            if (!this.canAnyVCFitAtVertex(vertex, vertexExact, directions, seed, seedSet)) {
                return [];
            }
        }
```

with:

```ts
        for (const { vertex, vertexExact, directions } of availableVertices) {
            if (!this.canAnyVCFitAtVertex(vertex, vertexExact, directions, seed, seedSet)) {
                if (trace.enabled) trace.node('seed', { id: node.traceId ?? 0, seedSet: seedSet.join('|'), verdict: 'prune-forward-check' });
                return [];
            }
        }
```

Then replace the child push (lines 228-233):

```ts
                                const newRemaining = [...remaining.slice(0, i), ...remaining.slice(i + 1)];
                                children.push({
                                    seed: newSeed,
                                    placedVCs: newPlacedVCs,
                                    remaining: newRemaining,
                                });
```

with:

```ts
                                const newRemaining = [...remaining.slice(0, i), ...remaining.slice(i + 1)];
                                const childId = trace.enabled ? trace.nextId('seed') : 0;
                                if (trace.enabled) trace.node('seed', { id: childId, parentId: node.traceId ?? 0, seedSet: seedSet.join('|'), placed: nameToTry, remaining: newRemaining.length, polys: polyDump(newSeed.polygons), verdict: 'place' });
                                children.push({
                                    seed: newSeed,
                                    placedVCs: newPlacedVCs,
                                    remaining: newRemaining,
                                    traceId: childId,
                                });
```

- [ ] **Step 5: Emit leaf verdict in `buildSeedsFromSet`**

Replace the final filter/return (lines 160-162):

```ts
        // Final vertex check: filter out seeds that fail the adjacent-vertex validation
        currentLayer = currentLayer.filter(node => this.passesFinalVertexCheck(node, seedSet));
        return currentLayer.map(node => node.seed);
```

with:

```ts
        // Final vertex check: filter out seeds that fail the adjacent-vertex validation
        currentLayer = currentLayer.filter(node => {
            const ok = this.passesFinalVertexCheck(node, seedSet);
            if (trace.enabled) trace.node('seed', { id: node.traceId ?? 0, seedSet: seedSet.join('|'), verdict: ok ? 'emit' : 'reject-final' });
            return ok;
        });
        return currentLayer.map(node => node.seed);
```

Note: the single-`seedSet.length===1` branch (128-137) is a legibility-minor leaf; leave it untraced (the figures use a multi-VC seed set).

- [ ] **Step 6: Test + build + commit**

Add to `tests/figure-trace.test.ts` a `SeedBuilder trace` block asserting: for one k=2 `{3,4,6}` seed set, with tracing on `seed.jsonl` contains a `root`, ≥1 `place`, and ≥1 `emit`/`reject-final`; with tracing off the emitted seed list is identical. (Executor wires the seed-set input from `run-pipeline`'s `seedSetLoader` shape or a small hand-built `string[]`.)

Run: `pnpm vitest run tests/figure-trace.test.ts` → PASS.

```bash
pnpm build
git add lib/classes/algorithm/SeedBuilder.ts tests/figure-trace.test.ts
git commit -m "feat(figures): trace hook in SeedBuilder BFS (dormant)"
```

---

## Task 4: Pool + candidate-lattice hooks

**Files:**
- Modify: `lib/classes/algorithm/LatticeEnumerator.ts` (`shortVectorPool` ~1009)
- Modify: `lib/classes/algorithm/PeriodSolver.ts` (`candidateLattices` return ~1207)

- [ ] **Step 1: Import in LatticeEnumerator**

Add near the top imports:

```ts
import { trace } from './figureTrace';
```

- [ ] **Step 2: Emit the pool in `shortVectorPool`**

Replace (lines 1009-1011):

```ts
	const out = [...all.values()].filter((w) => !w.isZero());
	poolCache.set(cacheKey, out);
	return out;
```

with:

```ts
	const out = [...all.values()].filter((w) => !w.isZero());
	if (trace.enabled) trace.node('pool', { N: ring.N, steps: maxSteps, lmax: lmaxF, dirs: dirList, monotone, vectors: out.map((w) => { const f = w.toVector(); return [f.x, f.y] as [number, number]; }) });
	poolCache.set(cacheKey, out);
	return out;
```

Then, so tests can force `shortVectorPool` to re-run (its `poolCache` is NOT cleared by `_testOnlyClearCandidateStageCaches`), add near the other exports in `LatticeEnumerator.ts`:

```ts
/** TEST-ONLY: clear the short-vector pool memo so a second solve in one process re-emits the pool trace. */
export function _testOnlyClearPoolCache(): void { poolCache.clear(); }
```

- [ ] **Step 3: Wire the pool-cache clear into the test helper**

Update `tests/helpers/solveK2.ts`: add the import and call it alongside the existing cache clear (so the pool trace fires on every `solveK2`, not just the first in a file):

```ts
import { _testOnlyClearPoolCache } from '@/classes/algorithm/LatticeEnumerator';
// ...inside solveK2, right after _testOnlyClearCandidateStageCaches():
  _testOnlyClearPoolCache();
```

- [ ] **Step 4: Import in PeriodSolver**

Add near the top imports:

```ts
import { trace } from './figureTrace';
```

- [ ] **Step 5: Emit candidate lattices at the `candidateLattices` return**

Locate the result assembly (line ~1207) inside `candidateLattices`:

```ts
		const result = { lattices: candidates, p0Skipped, cSkipped, feas: cFeas, orbitSkipped, obliqueCandidates, obliqueTruncated, starLadderTruncated, allKeys: seen, areaKeys: new Set(areas.map(areaKey)) };
		candidateCache.set(cacheKey, result);
		return result;
```

Insert the trace emit immediately BEFORE `candidateCache.set`:

```ts
		const result = { lattices: candidates, p0Skipped, cSkipped, feas: cFeas, orbitSkipped, obliqueCandidates, obliqueTruncated, starLadderTruncated, allKeys: seen, areaKeys: new Set(areas.map(areaKey)) };
		if (trace.enabled) trace.node('lattice', {
			vcSig,
			polySizes,
			p0Skipped, cSkipped, orbitSkipped,
			candidates: candidates.map((c) => {
				const a = c.basis[0].toVector(), b = c.basis[1].toVector();
				return { key: latticeKey(c.basis[0], c.basis[1]), basis: [[a.x, a.y], [b.x, b.y]] };
			}),
		});
		candidateCache.set(cacheKey, result);
		return result;
```

(`latticeKey` and `vcSig` are already in scope in this method — confirmed at lines 839-842 and 1274. `CandidateLattice.basis` is `[Cyclotomic, Cyclotomic]`.)

- [ ] **Step 6: Test + build + commit**

Add a `pool/lattice trace` block: after a k=2 `{3,4,6}` solve with tracing on, `pool.jsonl` has ≥1 line with a non-empty `vectors` array, and `lattice.jsonl` has ≥1 line whose `candidates` array is non-empty. Off → identical cell output.

Run: `pnpm vitest run tests/figure-trace.test.ts` → PASS.

```bash
pnpm build
git add lib/classes/algorithm/LatticeEnumerator.ts lib/classes/algorithm/PeriodSolver.ts tests/helpers/solveK2.ts tests/figure-trace.test.ts
git commit -m "feat(figures): trace hooks for short-vector pool + candidate lattices"
```

---

## Task 5: Torus-fill hook (`PeriodSolver.torusFill`)

**Files:**
- Modify: `lib/classes/algorithm/PeriodSolver.ts` (`torusFill` DFS, lines 1417-1522)

`trace` and `polyDump` are needed; extend the Task 4 import:

```ts
import { trace, polyDump } from './figureTrace';
```

- [ ] **Step 1: Stamp a per-fill id and tag the root frame**

Replace (line 1417):

```ts
		const stack: { reps: Polygon[]; block: Polygon[]; vReps: Cyclotomic[]; counts: number[] | null }[] = [{ reps: initial, block: initialBlock, vReps: initialV, counts: initialCounts }];
```

with:

```ts
		const fillId = trace.enabled ? trace.nextId('fill') : 0;
		const latKey = trace.enabled ? latticeKey(ctx.u, ctx.v) : '';
		const rootId = trace.enabled ? trace.nextId('torus') : 0;
		if (trace.enabled) trace.node('torus', { fillId, latKey, id: rootId, parentId: -1, reps: polyDump(initial), verdict: 'root' });
		const stack: { reps: Polygon[]; block: Polygon[]; vReps: Cyclotomic[]; counts: number[] | null; id?: number }[] = [{ reps: initial, block: initialBlock, vReps: initialV, counts: initialCounts, id: rootId }];
```

- [ ] **Step 2: Capture the frame id at pop and trace terminal verdicts**

Replace the pop line (1424):

```ts
			const { reps, block, vReps, counts } = stack.pop()!;
```

with:

```ts
			const { reps, block, vReps, counts, id: curId } = stack.pop()!;
```

Then add trace emits at the existing terminal branches inside the `while` loop (each is a single guarded line at the branch that already exists — do NOT change the control flow):

- After `if (seen) continue;` becomes:
```ts
			if (seen) { if (trace.enabled) trace.node('torus', { fillId, latKey, id: curId ?? 0, verdict: 'dedup' }); continue; }
```
- The cap skip (1433):
```ts
			if (reps.length > ctx.maxCellPolys) { if (FP) FP.c.capSkips++; if (trace.enabled) trace.node('torus', { fillId, latKey, id: curId ?? 0, verdict: 'cap-skip' }); continue; }
```
- The contradiction (1438):
```ts
			if (analysis.contradiction) { if (FP) FP.c.contradictions++; if (trace.enabled) trace.node('torus', { fillId, latKey, id: curId ?? 0, verdict: 'contradiction' }); continue; }
```
- The early gate-reject (1450):
```ts
						if (orbits !== null && orbits !== this.k) { diag.earlyGateRejected++; if (trace.enabled) trace.node('torus', { fillId, latKey, id: curId ?? 0, reps: polyDump(reps), verdict: 'gate-reject' }); continue; }
```
- The emit + cert-fail around 1470-1477. Replace:
```ts
					if (cert) {
						_t = FP ? fpNow() : 0;
						if (FP) FP.c.primCalls++;
						const prim = this.isPrimitive(reps, ctx, memo, diag);
						if (FP) { FP.t.primitive += fpNow() - _t; if (prim) FP.c.primTrue++; }
						if (prim) results.push(reps);
					}
					continue;
```
with:
```ts
					if (cert) {
						_t = FP ? fpNow() : 0;
						if (FP) FP.c.primCalls++;
						const prim = this.isPrimitive(reps, ctx, memo, diag);
						if (FP) { FP.t.primitive += fpNow() - _t; if (prim) FP.c.primTrue++; }
						if (prim) results.push(reps);
						if (trace.enabled) trace.node('torus', { fillId, latKey, id: curId ?? 0, reps: polyDump(reps), stateKey: this.stateKey(reps), verdict: prim ? 'emit' : 'reject-supercell' });
					} else if (trace.enabled) {
						trace.node('torus', { fillId, latKey, id: curId ?? 0, reps: polyDump(reps), verdict: 'cert-fail' });
					}
					continue;
```

- [ ] **Step 3: Trace place() outcomes**

In the `place` closure (1491-1515), add a guarded emit at each existing reject and at the push. Replace:

```ts
				const place = (P: Polygon) => {
					if (FP) FP.c.places++;
					if (this.properOverlapWithBlock(P, block, ctx)) { if (FP) FP.c.overlapRej++; return; }
					const pc = this.canonicalRep(P, ctx, memo);
					if (repsKeys.has(pc.key)) { if (FP) FP.c.dupRej++; return; } // P already present mod Λ ⇒ no progress
					const next = [...reps, pc.poly];
					if (next.length > ctx.maxCellPolys) { if (FP) FP.c.capRej++; return; }
					const childV = extendV(vReps, pc.poly);
					if (childV.length > ctx.orbitFloor) { diag.p1Pruned++; if (FP) FP.c.p1Pruned++; return; } // P1 orbit-floor prune (sound for stars: extendV excludes dents)
					let childCounts: number[] | null = null;
					if (counts && sizeIdxOf) {
						childCounts = counts.slice();
						childCounts[sizeIdxOf.get(pc.poly.n)!]++;
						if (!dominated(childCounts)) { diag.p3Pruned++; return; }
					}
					const childBlock = block.concat(this.buildBlock([pc.poly], ctx, 5));
					stack.push({ reps: next, block: childBlock, vReps: childV, counts: childCounts });
					if (FP) FP.c.pushed++;
				};
```

with:

```ts
				const place = (P: Polygon) => {
					if (FP) FP.c.places++;
					if (this.properOverlapWithBlock(P, block, ctx)) { if (FP) FP.c.overlapRej++; if (trace.enabled) trace.node('torus', { fillId, latKey, parentId: curId ?? 0, placedN: P.n, verdict: 'prune-overlap' }); return; }
					const pc = this.canonicalRep(P, ctx, memo);
					if (repsKeys.has(pc.key)) { if (FP) FP.c.dupRej++; if (trace.enabled) trace.node('torus', { fillId, latKey, parentId: curId ?? 0, placedN: P.n, verdict: 'prune-noprogress' }); return; } // P already present mod Λ ⇒ no progress
					const next = [...reps, pc.poly];
					if (next.length > ctx.maxCellPolys) { if (FP) FP.c.capRej++; if (trace.enabled) trace.node('torus', { fillId, latKey, parentId: curId ?? 0, placedN: P.n, verdict: 'prune-cap' }); return; }
					const childV = extendV(vReps, pc.poly);
					if (childV.length > ctx.orbitFloor) { diag.p1Pruned++; if (FP) FP.c.p1Pruned++; if (trace.enabled) trace.node('torus', { fillId, latKey, parentId: curId ?? 0, placedN: P.n, verdict: 'prune-P1' }); return; } // P1 orbit-floor prune (sound for stars: extendV excludes dents)
					let childCounts: number[] | null = null;
					if (counts && sizeIdxOf) {
						childCounts = counts.slice();
						childCounts[sizeIdxOf.get(pc.poly.n)!]++;
						if (!dominated(childCounts)) { diag.p3Pruned++; if (trace.enabled) trace.node('torus', { fillId, latKey, parentId: curId ?? 0, placedN: P.n, verdict: 'prune-P3' }); return; }
					}
					const childBlock = block.concat(this.buildBlock([pc.poly], ctx, 5));
					const childId = trace.enabled ? trace.nextId('torus') : 0;
					if (trace.enabled) trace.node('torus', { fillId, latKey, id: childId, parentId: curId ?? 0, placedN: P.n, reps: polyDump(next), verdict: 'place' });
					stack.push({ reps: next, block: childBlock, vReps: childV, counts: childCounts, id: childId });
					if (FP) FP.c.pushed++;
				};
```

- [ ] **Step 4: Test + build + commit**

Add a `torusFill trace` block: after a k=2 `{3,4,6}` solve with tracing on, `torus.jsonl` contains ≥1 `root`, ≥1 `place`, ≥1 `prune-*`, and ≥1 `emit`; grouping by `fillId` yields per-lattice DFS trees; off → identical cells.

Run: `pnpm vitest run tests/figure-trace.test.ts` → PASS.

```bash
pnpm build
git add lib/classes/algorithm/PeriodSolver.ts tests/figure-trace.test.ts
git commit -m "feat(figures): trace hook in PeriodSolver.torusFill (per-fill DFS, dormant)"
```

---

## Task 6: No-op regression across all engines

**Files:**
- Create: `tests/figure-trace-noop.test.ts`

- [ ] **Step 1: Write the equality test**

The strongest cheap guard that instrumentation is pure observation: run the SAME enumeration twice — once with `TRACE_FIGURES` unset, once set to a temp dir — and assert the produced results (VC names, then k=2 cells) are identical. If a hook leaked into control flow, the two runs diverge.

```ts
// tests/figure-trace-noop.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { trace } from '@/classes/algorithm/figureTrace';
import { solveK2 } from './helpers/solveK2';

describe('tracing is pure observation', () => {
  afterEach(() => { delete process.env.TRACE_FIGURES; trace._reconfigureFromEnv(); });

  it('k=2 {3,4,6} VC + cell sets are identical with tracing on vs off', () => {
    delete process.env.TRACE_FIGURES; trace._reconfigureFromEnv();
    const off = solveK2([3, 4, 6]); // solveK2 clears the module-global candidate caches internally

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftnoop-'));
    process.env.TRACE_FIGURES = dir; trace._reconfigureFromEnv();
    const on = solveK2([3, 4, 6]);
    fs.rmSync(dir, { recursive: true, force: true });

    expect(on.vcNames).toEqual(off.vcNames);
    expect(on.cellKeys).toEqual(off.cellKeys); // a hook leaking into control flow would diverge here
  });
});
```

Note: `solveK2` calls `_testOnlyClearCandidateStageCaches()` so the second run genuinely re-executes the hooked paths rather than serving `candidateCache`/`poolCache` hits.

- [ ] **Step 2: Also lean on the existing suite**

Run the full suite with the hooks in place (tracing off) — the existing enumeration tests pin real outputs:

Run: `pnpm test`
Expected: PASS (no regressions from the hooks).

- [ ] **Step 3: Commit**

```bash
git add tests/figure-trace-noop.test.ts
git commit -m "test(figures): trace-on == trace-off enumeration equality"
```

---

## Task 7: Polygon-set env override for the probe

**Files:**
- Modify: `lib/algorithm/run-pipeline.ts` (lines 111-116)

- [ ] **Step 1: Make `ns` env-overridable (default unchanged)**

Replace:

```ts
const parameters: GeneratorParameters = {
	[PolygonType.REGULAR]: {
		// k-uniform gate set: the regular polygons that tile edge-to-edge → N = 24.
		ns: [3, 4, 6, 8, 12],
	},
};
```

with:

```ts
const parameters: GeneratorParameters = {
	[PolygonType.REGULAR]: {
		// k-uniform gate set: the regular polygons that tile edge-to-edge → N = 24.
		// FIG_NS overrides the set for the figure-tracing probe ONLY (e.g. FIG_NS=3,4,6). Unset ⇒ identical.
		ns: process.env.FIG_NS ? process.env.FIG_NS.split(',').map((s) => Number(s.trim())) : [3, 4, 6, 8, 12],
	},
};
```

- [ ] **Step 2: Build + commit**

```bash
pnpm build
git add lib/algorithm/run-pipeline.ts
git commit -m "feat(figures): FIG_NS env override for the tracing probe (default unchanged)"
```

---

## Task 8: Run the probe + write the selector + present the shortlist (checkpoint 1)

**Files:**
- Create: `scripts/figure-select.ts`

- [ ] **Step 1: Run the real pipeline with tracing on**

```bash
rm -rf figures/traces/_probe && mkdir -p figures/traces/_probe
FIG_NS=3,4,6 USE_PERIOD_SOLVER=1 TRACE_FIGURES=figures/traces/_probe pnpm pipeline
```

Confirm `USE_NATIVE_FILL` and `USE_DSYM` are UNSET (native/D-D paths skip the TS `torusFill` hooks). Expected: `figures/traces/_probe/{vc,seed,pool,lattice,torus}.jsonl` all non-empty.

- [ ] **Step 2: Write the selector**

`scripts/figure-select.ts` reads the five JSONL files and prints, human-readable:
- vc: total nodes, #emit, prune counts by verdict;
- seed: per `seedSet` — node count, #place, #emit, #reject-final;
- pool: vector count; lattice: #candidates, skip counts;
- torus: per `fillId` — node count, verdict histogram, `latKey`, and whether it produced an `emit` (with `stateKey`).

```ts
// scripts/figure-select.ts — run: pnpm tsx scripts/figure-select.ts figures/traces/_probe
import * as fs from 'node:fs';
import * as path from 'node:path';

const dir = process.argv[2] ?? 'figures/traces/_probe';
const read = (stage: string): Record<string, unknown>[] => {
  const f = path.join(dir, `${stage}.jsonl`);
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
};
const tally = (rows: Record<string, unknown>[], key: string): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const r of rows) { const v = String(r[key]); m[v] = (m[v] ?? 0) + 1; }
  return m;
};

const vc = read('vc'), seed = read('seed'), pool = read('pool'), lattice = read('lattice'), torus = read('torus');

console.log('=== VC search ===');
console.log('nodes', vc.length, 'verdicts', tally(vc, 'verdict'));

console.log('\n=== Seed BFS (by seedSet) ===');
const bySeed: Record<string, Record<string, unknown>[]> = {};
for (const r of seed) { const k = String(r.seedSet); (bySeed[k] ??= []).push(r); }
for (const [k, rows] of Object.entries(bySeed)) console.log(k, '→ nodes', rows.length, tally(rows, 'verdict'));

console.log('\n=== Pool / lattice ===');
for (const p of pool) console.log('pool vectors', (p.vectors as unknown[]).length, 'steps', p.steps, 'lmax', p.lmax);
for (const l of lattice) console.log('candidates', (l.candidates as unknown[]).length, 'p0Skip', l.p0Skipped, 'cSkip', l.cSkipped);

console.log('\n=== Torus fill (by fillId) ===');
const byFill: Record<string, Record<string, unknown>[]> = {};
for (const r of torus) { const k = String(r.fillId); (byFill[k] ??= []).push(r); }
for (const [k, rows] of Object.entries(byFill)) {
  const v = tally(rows, 'verdict');
  const emitted = rows.some((r) => r.verdict === 'emit');
  console.log(`fill ${k} latKey=${rows[0].latKey} nodes=${rows.length} emitted=${emitted}`, v);
}
```

- [ ] **Step 3: Run the selector**

```bash
pnpm tsx scripts/figure-select.ts figures/traces/_probe
```

- [ ] **Step 4: CC selects a candidate and presents to AL (checkpoint 1)**

CC reads the selector output and recommends ONE example by the spec's legibility rules: a `seedSet` whose seed-BFS is ~5-20 nodes, a `fillId` that `emitted` with a torus DFS of ~20-100 nodes containing ≥1 prune, and a small final cell. CC presents the shortlist with real node counts. **AL confirms the example before Plan B.**

- [ ] **Step 5: Freeze the winning traces**

Once AL confirms, copy the relevant slice into a named directory and commit it as the figures' data source:

```bash
mkdir -p figures/traces/<example>
cp figures/traces/_probe/{vc,seed,pool,lattice,torus}.jsonl figures/traces/<example>/
git add figures/traces/<example>
git commit -m "data(figures): frozen real traces for the <example> running example"
```

(`<example>` = the oracle name / short slug AL confirms. `_probe/` stays gitignored scratch — add `figures/traces/_probe/` to `.gitignore` in this step.)

---

## Self-review

- **Spec coverage:** instrumentation (spec §Instrumentation) → Tasks 1-5; no-op guarantee → Task 6; trace output location → Tasks 5/8; example selection + checkpoint 1 (spec §running example) → Tasks 7-8. Figure builder + the 9 figures are Plan B by design (written after checkpoint 1). Curation/layout/testing of figures → Plan B.
- **Placeholder scan:** two test bodies (Task 2 Step 3, Task 6 Step 1) carry a `replace with concrete assertion` note because the exact `{3,4,6}` solve-entry helper is chosen by the executor from `pipeline-core`; every OTHER step is complete code. These are deliberate executor hand-offs, not vague instructions — each names the precise assertion to make and the file to read for the signature.
- **Type consistency:** `trace.enabled` (getter), `trace.nextId(ns)`, `trace.node(stage, event)`, `polyDump(polys)` used identically across Tasks 2-5 and defined in Task 1. `BFSNode.traceId?`, frame `.id?`, `fillId`/`latKey`/`curId` consistent within Tasks 3/5.
- **Scope:** self-contained — produces committed traces + a selection, testable on its own, and stops at the human gate.
