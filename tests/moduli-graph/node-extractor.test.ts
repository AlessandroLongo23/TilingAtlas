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

describe('extractNodes does not fire on non-flexing regular tiles', () => {
  // k1-03 (4.4.4α) carries two tiles that are squares at every α plus two flexing rhombi.
  // A min-over-tiles regularity test would see the always-square tiles and report spurious
  // interior nodes (e.g. α≈51 where the rhombi are 51°). The whole-tiling (worst-tile)
  // measure must fire only where every tile is regular — near α=90.
  const f = (Array.isArray(atlas) ? atlas : atlas.records).find(
    (r: any) => r.id === 'ctrnact-isotoxal-family-k1-03',
  );

  it('reports interior nodes only where the whole tiling is regular (k1-03: near α=90, never α≈51)', () => {
    const interior = extractNodes(f.paramCell).filter((n) => n.kind === 'interior');
    expect(interior.length).toBeGreaterThan(0);
    expect(interior.every((n) => Math.abs(n.alpha - 90) < 2)).toBe(true);
  });
});

describe('extractNodes skips endpoints that collapse to nothing', () => {
  // k1-09 (4α) is a single-tile family: at each open endpoint the one tile collapses to zero
  // area, leaving no tiling. Those are not real limits and must not become (empty) nodes.
  const f = (Array.isArray(atlas) ? atlas : atlas.records).find(
    (r: any) => r.id === 'ctrnact-isotoxal-family-k1-09',
  );

  it('emits no endpoint node when the only tile collapses (k1-09)', () => {
    const ends = extractNodes(f.paramCell).filter((n) => n.kind === 'endpoint');
    expect(ends).toHaveLength(0);
  });
});
