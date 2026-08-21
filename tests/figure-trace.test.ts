import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// The `trace` singleton caches TRACE_FIGURES at construction, so tests set env then call
// _reconfigureFromEnv() to re-read it (production never calls that — the hot path stays a field read).
import { trace, polyDump } from '@/classes/algorithm/figureTrace';
import { solveK2 } from './helpers/solveK2';

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

/**
 * Everything below reads ONE traced k=2 {3,4,6} solve, plus one untraced solve to compare against.
 *
 * It used to be five solves: three describes that each ran their own traced solve to read a different
 * JSONL file out of it, and a separate figure-trace-noop.test.ts that ran the on/off pair again. Those
 * five runs were 348 s, 31% of the whole suite's CPU, and four of them were re-deriving a solve that
 * had already been done. A traced solve writes vc/pool/lattice/torus JSONL in the same pass, so one
 * run answers all four questions; the untraced partner is the only genuinely second solve, because the
 * "tracing changes nothing" claim needs a control.
 */
describe('a traced k=2 solve', () => {
  let dir: string;
  let on: ReturnType<typeof solveK2>;
  let off: ReturnType<typeof solveK2>;
  const read = (f: string) =>
    fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

  // Two full k=2 solves, ~110-150 s together on this machine and longer when the suite is running
  // them alongside the other CPU-bound files. The budget is the hook's, not any one test's, so a
  // timeout here fails the whole block — deliberate, since all four tests read this one solve.
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftrace-solve-'));
    process.env.TRACE_FIGURES = dir; trace._reconfigureFromEnv();
    on = solveK2([3, 4, 6]);                                   // solveK2 clears the module-global caches internally
    delete process.env.TRACE_FIGURES; trace._reconfigureFromEnv();
    off = solveK2([3, 4, 6]);
  }, 600_000);

  afterAll(() => { delete process.env.TRACE_FIGURES; trace._reconfigureFromEnv(); fs.rmSync(dir, { recursive: true, force: true }); });

  it('is pure observation: the VC + cell sets are identical with tracing on vs off', () => {
    expect(on.vcNames).toEqual(off.vcNames);
    expect(on.cellKeys).toEqual(off.cellKeys); // a hook leaking into control flow would diverge here
  });

  it('emits vc nodes with real verdicts', () => {
    const vc = read('vc.jsonl');
    const verdicts = new Set(vc.map((r) => r.verdict));
    expect(vc.length).toBeGreaterThan(5);
    expect(verdicts.has('emit')).toBe(true);    // at least one VC closes at 2π
    expect(verdicts.has('extend')).toBe(true);  // at least one interior node
  });

  it('emits a non-empty pool and >=1 candidate lattice', () => {
    const pool = read('pool.jsonl');
    const lattice = read('lattice.jsonl');
    expect(pool.some((p) => Array.isArray(p.vectors) && p.vectors.length > 0)).toBe(true);
    expect(lattice.some((l) => Array.isArray(l.candidates) && l.candidates.length > 0)).toBe(true);
  });

  it('emits root/place/prune/emit torus nodes, groupable by fillId', () => {
    const torus = read('torus.jsonl');
    const verdicts = new Set(torus.map((r) => r.verdict));
    const fills = new Set(torus.map((r) => r.fillId));
    expect(verdicts.has('root')).toBe(true);
    expect(verdicts.has('place')).toBe(true);
    expect(verdicts.has('emit')).toBe(true);
    expect([...verdicts].some((v) => String(v).startsWith('prune-'))).toBe(true);
    expect(fills.size).toBeGreaterThan(0);
  });
});
