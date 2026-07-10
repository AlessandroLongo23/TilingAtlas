/**
 * Figure-trace sink — dormant instrumentation for the pipeline-walkthrough figures.
 * A NO-OP unless process.env.TRACE_FIGURES is set (to an output directory). When set, each
 * `node(stage, event)` appends one JSON line to `<dir>/<stage>.jsonl`. Pure observation: the
 * search engines call `trace.node(...)` at real decision points and NOTHING here alters their
 * control flow. Guard every hot-path call site with `if (trace.enabled)` so the disabled cost is
 * one boolean read.
 *
 * Bundling note: this module is reachable from `VCGenerator.ts`, which the browser genuinely runs
 * (the /lab/*\/vcs preview page calls `generateVCs` client-side). A static `import 'node:fs'` here
 * makes Turbopack refuse to build that client bundle ("chunking context does not support external
 * modules"), so the Node built-ins are loaded lazily via `eval('require')` — this is invisible to
 * bundlers' static import-graph analysis (unlike a guarded `require(...)`, which Turbopack still
 * resolves eagerly) and is only ever invoked when TRACE_FIGURES is set, which happens in Node
 * CLI/test contexts only (never in the browser — PUBLIC_*-only env vars reach the client bundle).
 */
import type * as FS from 'node:fs';
import type * as Path from 'node:path';

export type TraceStage = 'vc' | 'seed' | 'pool' | 'lattice' | 'torus';

/** Minimal shape the hooks pull float geometry from (Polygon satisfies it). */
export interface PolyLike { n: number; isStar?: boolean; vertices: { x: number; y: number }[]; }

/** Reduce placed polygons to serializable {n, isStar, verts} — the renderable node payload. */
export function polyDump(polys: PolyLike[]): { n: number; isStar: boolean; verts: [number, number][] }[] {
  return polys.map((p) => ({ n: p.n, isStar: !!p.isStar, verts: p.vertices.map((v) => [v.x, v.y] as [number, number]) }));
}

let fsMod: typeof FS | null = null;
let pathMod: typeof Path | null = null;

/** Lazily resolve the real Node `fs`/`path` modules — only ever called when TRACE_FIGURES is set. */
function nodeModules(): { fs: typeof FS; path: typeof Path } {
  if (!fsMod || !pathMod) {
    // `eval` here is deliberate: it defeats bundlers' static require/import graph analysis so
    // this module stays safe to import from client-reachable code (see file header).
    const req = eval('require') as NodeRequire;
    fsMod = req('node:fs');
    pathMod = req('node:path');
  }
  return { fs: fsMod, path: pathMod };
}

class FigureTrace {
  private dir: string | null;
  private fds = new Map<TraceStage, number>();
  private counters = new Map<TraceStage | 'fill', number>();

  constructor() {
    const d = process.env.TRACE_FIGURES ?? null;
    this.dir = d;
    if (d) nodeModules().fs.mkdirSync(d, { recursive: true });
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
    const { fs, path } = nodeModules();
    let fd = this.fds.get(stage);
    if (fd === undefined) { fd = fs.openSync(path.join(this.dir, `${stage}.jsonl`), 'a'); this.fds.set(stage, fd); }
    fs.writeSync(fd, JSON.stringify(event) + '\n'); // writeSync is durable — no separate flush needed
  }

  /** TEST-ONLY: re-read TRACE_FIGURES (the singleton caches it at construction; production never calls this). */
  _reconfigureFromEnv(): void {
    if (this.fds.size > 0) {
      const { fs } = nodeModules();
      for (const fd of this.fds.values()) fs.closeSync(fd);
    }
    this.fds.clear();
    this.counters.clear();
    const d = process.env.TRACE_FIGURES ?? null;
    this.dir = d;
    if (d) nodeModules().fs.mkdirSync(d, { recursive: true });
  }
}

export const trace = new FigureTrace();
