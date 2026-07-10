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
