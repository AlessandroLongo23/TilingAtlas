import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  }, 180000); // long timeout: solveK2 runs a full k=2 solve
});
