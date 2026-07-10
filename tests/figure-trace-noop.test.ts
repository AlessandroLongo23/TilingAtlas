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
    const off = solveK2([3, 4, 6]); // solveK2 clears the module-global caches internally

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftnoop-'));
    process.env.TRACE_FIGURES = dir; trace._reconfigureFromEnv();
    const on = solveK2([3, 4, 6]);
    fs.rmSync(dir, { recursive: true, force: true });

    expect(on.vcNames).toEqual(off.vcNames);
    expect(on.cellKeys).toEqual(off.cellKeys); // a hook leaking into control flow would diverge here
  }, 300000);
});
