import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractNodes } from '../../scripts/moduli-graph/nodeExtractor';

const atlas = JSON.parse(readFileSync('public/reference-atlas-isotoxal.json', 'utf8'));
const fam = (Array.isArray(atlas) ? atlas : atlas.records).find((r: any) => r.id === 'ctrnact-isotoxal-family-k1-06');

describe('extractNodes on 3.3.4α', () => {
  it('finds two endpoints and one interior node near α=90°', () => {
    const nodes = extractNodes(fam.paramCell);
    const interior = nodes.filter((n) => n.kind === 'interior');
    const ends = nodes.filter((n) => n.kind === 'endpoint');
    expect(ends).toHaveLength(2);
    expect(interior).toHaveLength(1);
    expect(interior[0].alpha).toBeGreaterThan(88);
    expect(interior[0].alpha).toBeLessThan(92);
  });
});
