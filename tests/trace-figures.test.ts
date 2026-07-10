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
