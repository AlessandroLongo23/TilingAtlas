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

  it('collapses every degenerate endpoint into a single shared ⊥ non-tiling node', () => {
    expect(g.nodes.filter((n) => n.kind === 'degenerate')).toHaveLength(1);
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
    expect(g.h1).toBe(19);
    expect(g.h1NoDegenerate).toBe(11);
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
    expect(deg.degree).toBe(14);
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

describe('degenerate endpoints are not mislabeled as uniform tilings', () => {
  // Regression for the endpoint-flattening bug: a tile that flattens (180° corners) while keeping
  // positive area was counted by its stored side-count and resolved against the catalogue — e.g.
  // k1-14's endpoint hexagon (geometrically a triangle) resolved as 3.6.3.6, faking a self-loop.
  for (const id of ['ctrnact-isotoxal-family-k1-01', 'ctrnact-isotoxal-family-k1-14', 'ctrnact-isotoxal-family-k1-15']) {
    it(`${id.replace('ctrnact-isotoxal-family-', '')} touches one uniform node but degenerates at the ends`, () => {
      const g = assembleGraph([pick(id)], idx);
      expect(g.nodes.filter((n) => n.kind === 'uniform')).toHaveLength(1);
      const deg = g.nodes.find((n) => n.kind === 'degenerate');
      expect(deg).toBeTruthy();
      // every edge touches ⊥ — no uniform-to-itself self-loop survives
      expect(g.edges.every((e) => e.from === deg!.key || e.to === deg!.key)).toBe(true);
      // removing ⊥ leaves no cycles: this family is not a genuine self-loop
      expect(g.h1NoDegenerate).toBe(0);
    });
  }
});
