import { describe, it, expect } from 'vitest';
import { referenceToCatalogue, type ReferenceTiling } from '@/lib/services/referenceAtlas';

describe('referenceToCatalogue passes exactSource through', () => {
  it('copies a seed exactSource onto the CatalogueTiling', () => {
    const r = {
      id: 'ctrnact-07_36-4j5_5b2-1',
      source: 'ctrnact',
      k: 7,
      family: '3.6',
      renderCell: { cellPolygons: [], basis: [[1, 0], [0, 1]] },
      exactSource: { kind: 'seed', T1: [-1, 0, 1, 0], T2: [1, 0, 0, 0], Seed: [[0, 0, 0, 0]] },
    } as unknown as ReferenceTiling;
    const c = referenceToCatalogue(r);
    expect(c.exactSource).toEqual(r.exactSource);
    expect(c.canonicalKey).toBe('ctrnact-07_36-4j5_5b2-1');
  });
});
