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

describe('extractNodes emits collapsed endpoints as degenerate (⊥) limits', () => {
  // k1-09 (4α) is a single-tile family: at each open endpoint the one tile collapses to zero area,
  // leaving an EMPTY tiling. Under the one-point-compactification (⊥) model a zero-area collapse is a
  // genuine degenerate limit, so both endpoints must still be emitted (empty, non-regular) — the
  // resolver routes an empty tiling to ⊥. Dropping them silently deletes the ⊥—4⁴—⊥ relation (the
  // α=90° square between two collapses), which is exactly the bug this guards.
  const f = (Array.isArray(atlas) ? atlas : atlas.records).find(
    (r: any) => r.id === 'ctrnact-isotoxal-family-k1-09',
  );

  it('emits both endpoints (empty, non-regular) plus the α=90° interior square (k1-09)', () => {
    const nodes = extractNodes(f.paramCell);
    const ends = nodes.filter((n) => n.kind === 'endpoint');
    const interior = nodes.filter((n) => n.kind === 'interior');
    expect(ends).toHaveLength(2);
    expect(ends.every((n) => n.tiling.polys.length === 0)).toBe(true);
    expect(ends.every((n) => n.regular === false)).toBe(true);
    expect(interior).toHaveLength(1);
    expect(Math.abs(interior[0].alpha - 90)).toBeLessThan(2);
  });
});
