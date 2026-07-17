import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CyclotomicRing } from '@/classes/Cyclotomic';
import { loadCatalogueKeys } from '../../scripts/moduli-graph/catalogueKeys';
import { extractNodes } from '../../scripts/moduli-graph/nodeExtractor';
import { resolveNode } from '../../scripts/moduli-graph/nodeResolver';

const atlas = JSON.parse(readFileSync('public/reference-atlas-isotoxal.json', 'utf8'));
const fam = (Array.isArray(atlas) ? atlas : atlas.records).find((r: any) => r.id === 'ctrnact-isotoxal-family-k1-06');

describe('resolveNode on 3.3.4α', () => {
  it('resolves both endpoints to 3^6 and the interior to 3.3.3.4.4, all achiral', () => {
    const idx = loadCatalogueKeys(CyclotomicRing.create(24));
    const states = extractNodes(fam.paramCell);
    const resolved = states.map((s) => ({ kind: s.kind, r: resolveNode(s, idx) }));
    const ends = resolved.filter((x) => x.kind === 'endpoint');
    const interior = resolved.filter((x) => x.kind === 'interior');
    expect(ends).toHaveLength(2);
    expect(ends.every((x) => x.r.resolved && x.r.label === 'ctrnact-01_3-6a-1')).toBe(true);
    expect(interior).toHaveLength(1);
    expect(interior[0].r.resolved).toBe(true);
    expect(interior[0].r.label).toBe('ctrnact-01_34-5c-1');
    expect(resolved.every((x) => x.r.chirality === 'achiral')).toBe(true);
  });
});
