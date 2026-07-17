import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CyclotomicRing } from '@/classes/Cyclotomic';
import { loadCatalogueKeys } from '../../scripts/moduli-graph/catalogueKeys';
import { assembleGraph, type FamilyRecord } from '../../scripts/moduli-graph/graphAssembler';

const atlas = JSON.parse(readFileSync('public/reference-atlas-isotoxal.json', 'utf8'));
const records = (Array.isArray(atlas) ? atlas : atlas.records) as FamilyRecord[];
const pick = (id: string) => records.find((r) => (r as { id: string }).id === id)!;
const families = records.filter(
  (r) => (r as { k?: number }).k === 1 && (r as { source?: string }).source === 'isotoxal' && r.paramCell?.params?.length === 1,
);
const idx = loadCatalogueKeys(CyclotomicRing.create(24));

describe('k=1 isotoxal slice', () => {
  const g = assembleGraph(families, idx);

  it('has no chiral nodes (no family reaches the one chiral k=1 tiling)', () => {
    expect(g.nodes.filter((n) => n.chirality !== 'achiral')).toHaveLength(0);
  });

  it('keeps a single shared ⊥ node, reached only by a genuine zero-area collapse', () => {
    expect(g.nodes.filter((n) => n.kind === 'degenerate')).toHaveLength(1);
  });

  it('gives each non-edge-to-edge flattening limit its own real node, distinct from ⊥', () => {
    const flat = g.nodes.filter((n) => n.kind === 'flattened');
    expect(flat).toHaveLength(4);
    expect(new Set(flat.map((n) => n.key)).size).toBe(4); // four distinct tilings, none falsely merged
    expect(new Set(flat.map((n) => n.label))).toEqual(new Set(['3.3.6²', '3.3.3²', '3².3².6', '4.4²']));
    expect(flat.every((n) => n.role !== 'boundary')).toBe(true); // genuine tilings, never the ⊥ boundary
  });

  it('keeps the excluded octagon as its own uncatalogued node, distinct from ⊥', () => {
    const uncat = g.nodes.filter((n) => n.kind === 'uncatalogued');
    expect(uncat).toHaveLength(1);
    expect(uncat[0].label).toContain('4.8.8');
  });

  it('contains the 3^6 <-> 3.3.3.4.4 bigon as uniform nodes', () => {
    const uni = new Set(g.nodes.filter((n) => n.kind === 'uniform').map((n) => n.label));
    expect(uni.has('ctrnact-01_3-6a-1')).toBe(true);
    expect(uni.has('ctrnact-01_34-5c-1')).toBe(true);
  });

  it('reports first homology both with and without the degenerate node', () => {
    expect(g.h1).toBe(18);
    expect(g.h1NoDegenerate).toBe(15);
  });

  it('tags nodes with a structural role: crossroads are branch, degree-2 tilings are landmarks, ⊥ is boundary', () => {
    const byLabel = (l: string) => g.nodes.find((n) => n.label === l)!;
    // ≥3 family-arcs meet → branch (crossroad). 4⁴ (self-loops + two ⊥ arcs), 3⁶ (three families),
    // 3.6.3.6 and 3.3.3.4.4 (two families each) all branch.
    for (const l of ['ctrnact-01_4-4n-1', 'ctrnact-01_3-6a-1', 'ctrnact-01_36-4f-1', 'ctrnact-01_34-5c-1']) {
      expect(byLabel(l).role).toBe('branch');
      expect(byLabel(l).degree).toBeGreaterThanOrEqual(3);
    }
    // one family passes through → degree-2 landmark (topologically an edge subdivision)
    for (const l of ['ctrnact-01_3c-3a-1', 'ctrnact-01_34-5e-1', 'ctrnact-01_346-4l-1', 'ctrnact-01_6-3d-1']) {
      expect(byLabel(l).role).toBe('landmark');
      expect(byLabel(l).degree).toBe(2);
    }
    const deg = g.nodes.find((n) => n.kind === 'degenerate')!;
    expect(deg.role).toBe('boundary');
    expect(deg.degree).toBe(4); // only the two 4α collapse families still reach ⊥
    // every node in the single-parameter slice has local moduli dimension 1
    expect(g.nodes.every((n) => n.flexdim === 1)).toBe(true);
  });
});

describe('single-tile 4α families connect ⊥ to 4⁴ through the α=90° square', () => {
  // Regression for the dropped-collapse bug: k1-09/k1-10 (family 4α) collapse to zero area at both
  // endpoints and pass through the regular square 4⁴ at α=90°. Their ⊥—4⁴—⊥ relation vanished because
  // fully-collapsed (empty) endpoints were discarded instead of routed to ⊥ — the whole family had no
  // edges. Both must now form a ⊥—4⁴—⊥ bigon.
  for (const id of ['ctrnact-isotoxal-family-k1-09', 'ctrnact-isotoxal-family-k1-10']) {
    it(`${id.replace('ctrnact-isotoxal-family-', '')} forms a ⊥—4⁴—⊥ bigon`, () => {
      const g = assembleGraph([pick(id)], idx);
      const deg = g.nodes.find((n) => n.kind === 'degenerate');
      const uni = g.nodes.filter((n) => n.kind === 'uniform');
      expect(deg).toBeTruthy();
      expect(uni).toHaveLength(1);
      expect(uni[0].label).toBe('ctrnact-01_4-4n-1'); // 4⁴
      expect(g.edges).toHaveLength(2);
      expect(g.edges.every((e) => e.from === deg!.key || e.to === deg!.key)).toBe(true);
      expect(g.h1).toBe(1); // ⊥ + 4⁴ + two edges = one loop
      expect(g.h1NoDegenerate).toBe(0); // no genuine-tiling cycle
    });
  }
});

describe('flattening endpoints are real non-edge-to-edge tilings, not ⊥', () => {
  // A tile whose corner reaches 180° flattens into a LARGER regular polygon (a dodecagon → a hexagon of
  // twice the edge); the plane stays fully tiled, so the limit is a genuine tiling — non-edge-to-edge,
  // by regular polygons of two sizes — NOT the zero-area ⊥. Each such family is a bigon between its
  // interior tiling and the flatten limit, and the two ends merge (up to direct similarity) into one
  // flatten node. This replaces the earlier (wrong) treatment that dumped these limits into ⊥.
  const cases: [string, string][] = [
    ['ctrnact-isotoxal-family-k1-01', '3.3.6²'],   // 3.12α:  3.12.12 ↔ two triangles + a double hexagon
    ['ctrnact-isotoxal-family-k1-14', '3.3.3²'],   // 3.3.6α: 3.6.3.6 ↔ two triangles + a double triangle
    ['ctrnact-isotoxal-family-k1-15', '3².3².6'],  // 6.6α:   6³      ↔ a hexagon + two double triangles
    ['ctrnact-isotoxal-family-k1-16', '4.4²'],     // 4.8α:   4.8.8   ↔ a square + a double square
  ];
  for (const [id, flatLabel] of cases) {
    it(`${id.replace('ctrnact-isotoxal-family-', '')} is a bigon to its flatten limit ${flatLabel}, never touching ⊥`, () => {
      const g = assembleGraph([pick(id)], idx);
      expect(g.nodes.find((n) => n.kind === 'degenerate')).toBeUndefined();
      const flat = g.nodes.filter((n) => n.kind === 'flattened');
      expect(flat).toHaveLength(1);
      expect(flat[0].label).toBe(flatLabel);
      expect(g.nodes).toHaveLength(2);      // interior real tiling + the flatten limit
      expect(g.edges).toHaveLength(2);      // two α-arcs, both ends merged into one flatten node
      expect(g.h1).toBe(1);                 // the bigon is one loop
      expect(g.h1NoDegenerate).toBe(1);     // and it is a genuine-tiling loop (both nodes are tilings)
    });
  }
});
